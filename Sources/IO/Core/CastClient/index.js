import macro from 'vtk.js/Sources/macros';
import { responseEventFor } from './eventNames';
import {
  DEFAULT_PRODUCT_NAME,
  generateMessageId,
  generateSubscriberName,
  productNameToMessageIdPrefix,
} from './identity';
import {
  castBinaryTransferHttpUrl,
  castBinaryTransferMode,
  normalizeDicomSendMessageStrict,
  normalizeNiftiSendMessageMetadataOnly,
  normalizeNiftiSendMessageStrict,
  niftiFileNameFromMessage,
  stampHttpBinaryTransferForBinaryEvents,
  toArrayBufferStrict,
} from './sendNormalize';
import {
  createHubConfig,
  createHubRuntimeState,
  createSessionConfig,
  getClientInfoPayload,
  resolveTargetActorForWire,
  resolveTargetProductNameForWire,
} from './wireEnvelope';

// API and usage: Documentation/api/IO_Core_CastClient.md (npm run docs:generate-api);
// live example: /examples/CastClient.html

export { generateSubscriberName };
export {
  buildDicomTransferRequestMessage,
  buildDicomTransferFilePublishMessage,
  buildDicomTransferCompletePublishMessage,
  DICOM_TRANSFER_DATA_TYPE,
} from './dicomTransfer';

const RECONNECT_INTERVAL_MS = 10000;
const SUBSCRIBE_TIMEOUT_MS = 5000;

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  config: {
    hub: {},
    session: {},
    productName: undefined,
    productVersion: undefined,
    callbackUrl: undefined,
    autoStart: false,
    autoReconnect: false,
    preserveSessionTopicFromToken: false,
  },
  hub: null,
  session: null,
  reconnectInterval: null,
  onMessageCallback: null,
  onConnectionStateChangeCallback: null,
  lastSentMessage: null,
};

function vtkCastClient(publicAPI, model) {
  model.classHierarchy.push('vtkCastClient');

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  function emitConnectionState(state, detail) {
    if (model.onConnectionStateChangeCallback) {
      model.onConnectionStateChangeCallback(state, detail);
    }
  }

  function messageIdPrefix() {
    const product =
      model.session.productName ||
      model.config.productName ||
      DEFAULT_PRODUCT_NAME;
    return productNameToMessageIdPrefix(product);
  }

  function resolveAuthorizationEndpoint() {
    const explicit = model.hub.authorization_endpoint;
    if (typeof explicit === 'string' && explicit.trim()) {
      return explicit.trim();
    }
    // Fallback: derive from token_endpoint origin (back-compat with hub
    // configs that haven't been updated to expose authorization_endpoint).
    try {
      const tokenUrl = new URL(model.hub.token_endpoint);
      return `${tokenUrl.origin}/oauth/authorize`;
    } catch (err) {
      return '';
    }
  }

  function websocketClose() {
    console.debug('CastClient: websocket is closed.');
    model.hub.resubscribeRequested = true;
    emitConnectionState('disconnected');
  }

  function attachBinaryToBinaryResource(castMessage, buf, expectedMarker) {
    const event = castMessage && castMessage.event;
    const context = event && event.context;
    let items = [];
    if (Array.isArray(context)) {
      items = context;
    } else if (context != null) {
      items = [context];
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && typeof item === 'object') {
        const resource = item.resource;
        if (
          resource &&
          typeof resource === 'object' &&
          (expectedMarker === undefined ||
            resource.binaryTransfer === expectedMarker)
        ) {
          delete resource.binaryTransfer;
          delete resource.url;
          delete resource.expiresAt;
          resource.data = buf;
          return true;
        }
      }
    }
    return false;
  }

  function processBinaryMessage(buf) {
    console.warn(
      `CastClient: unexpected binary WebSocket message (${buf.byteLength} bytes); hub uses http payloads`
    );
  }

  function resolveHttpPayloadUrl(rawUrl) {
    if (!rawUrl) {
      return '';
    }
    try {
      return new URL(rawUrl, model.hub.hub_endpoint).toString();
    } catch (err) {
      console.warn('CastClient: invalid http payload url', rawUrl, err);
      return '';
    }
  }

  async function processHttpPayloadMessage(castMessage, rawUrl) {
    const resolved = resolveHttpPayloadUrl(rawUrl);
    if (!resolved) {
      return;
    }
    const startedAt =
      typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
    try {
      const response = await fetch(resolved, {
        method: 'GET',
        // Hub stores raw bytes by random token; no Authorization header for now.
        // CORS: hub allows all origins by default (see cast_api.py CORSMiddleware).
        credentials: 'omit',
      });
      if (!response.ok) {
        console.warn(
          `CastClient: http payload fetch ${response.status} ${response.statusText} url=${resolved}`
        );
        return;
      }
      const buf = await response.arrayBuffer();
      const elapsedMs =
        (typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()) - startedAt;
      const throughput =
        elapsedMs > 0
          ? (buf.byteLength / (1024 * 1024) / (elapsedMs / 1000)).toFixed(2)
          : 'n/a';
      console.debug(
        `CastClient: http payload received bytes=${buf.byteLength} ` +
          `elapsed=${(elapsedMs / 1000).toFixed(
            2
          )}s throughput=${throughput} MB/s`
      );
      const attached = attachBinaryToBinaryResource(castMessage, buf, 'http');
      if (!attached) {
        console.warn('CastClient: http payload had no matching resource slot');
        return;
      }
      if (castMessage.id === model.hub.lastPublishedMessageID) {
        return;
      }
      if (model.onMessageCallback) {
        model.onMessageCallback(castMessage);
      }
    } catch (err) {
      console.warn('CastClient: http payload fetch error', err);
    }
  }

  function processTextMessage(eventData) {
    try {
      const castMessage = JSON.parse(eventData);
      if (castMessage['hub.mode']) {
        return;
      }

      const event = castMessage.event;
      if (!event) {
        return;
      }
      if (event['hub.event'] === 'heartbeat') {
        return;
      }

      const mode = castBinaryTransferMode(event);

      if (castMessage.id === model.hub.lastPublishedMessageID) {
        return;
      }

      if (mode === 'http') {
        const url = castBinaryTransferHttpUrl(event);
        if (!url) {
          // Hub stripped the http marker (no payload) or marker arrived
          // without a URL. Deliver as a plain JSON event.
          if (model.onMessageCallback) {
            model.onMessageCallback(castMessage);
          }
          return;
        }
        processHttpPayloadMessage(castMessage, url);
        return;
      }

      if (model.onMessageCallback) {
        model.onMessageCallback(castMessage);
      }
    } catch (err) {
      console.warn('CastClient: websocket processing error:', err);
    }
  }

  async function checkWebsocket() {
    if (
      model.hub.resubscribeRequested &&
      model.hub.subscribed &&
      model.config.autoReconnect
    ) {
      console.debug('CastClient: Try to resubscribe');
      model.hub.resubscribeRequested = false;
      const response = await publicAPI.subscribe();
      if (response !== 202) {
        model.hub.resubscribeRequested = true;
      }
    } else if (!model.hub.subscribed && model.hub.resubscribeRequested) {
      model.hub.resubscribeRequested = false;
    }
  }

  // --------------------------------------------------------------------------
  // PublicAPI
  // --------------------------------------------------------------------------

  publicAPI.onMessage = (callback) => {
    model.onMessageCallback = callback;
  };

  // --------------------------------------------------------------------------

  publicAPI.onConnectionStateChange = (callback) => {
    model.onConnectionStateChangeCallback = callback;
  };

  // --------------------------------------------------------------------------

  publicAPI.delete = macro.chain(() => {
    if (model.reconnectInterval) {
      clearInterval(model.reconnectInterval);
      model.reconnectInterval = null;
    }
    publicAPI.unsubscribe();
  }, publicAPI.delete);

  // --------------------------------------------------------------------------

  publicAPI.getHubConfig = () => {
    const hub = model.hub;
    return {
      name: hub.name,
      friendlyName: hub.friendlyName,
      version: hub.version,
      hub_endpoint: hub.hub_endpoint,
      authorization_endpoint: hub.authorization_endpoint,
      token_endpoint: hub.token_endpoint,
      client_id: hub.client_id,
      client_secret: hub.client_secret,
    };
  };

  // --------------------------------------------------------------------------

  publicAPI.getSessionConfig = () => {
    const session = model.session;
    return {
      subscriberName: session.subscriberName,
      productName: session.productName,
      productVersion: session.productVersion,
      actors: session.actors,
      topic: session.topic,
      events: session.events,
      lease: session.lease,
    };
  };

  // --------------------------------------------------------------------------

  publicAPI.getConnectionState = () => {
    const hub = model.hub;
    return {
      token: hub.token,
      subscribed: hub.subscribed,
      resubscribeRequested: hub.resubscribeRequested,
      websocket: hub.websocket,
      lastPublishedMessageID: hub.lastPublishedMessageID,
    };
  };

  // --------------------------------------------------------------------------

  publicAPI.setTopic = (topic) => {
    console.debug('CastClient: setting topic to', topic);
    model.session.topic = topic;
  };

  // --------------------------------------------------------------------------

  publicAPI.setToken = (token) => {
    model.hub.token = token;
  };

  // --------------------------------------------------------------------------

  publicAPI.setSubscriberName = (subscriberName) => {
    model.session.subscriberName = subscriberName;
  };

  // --------------------------------------------------------------------------

  publicAPI.setUserName = (userName) => {
    model.session.userName = userName || '';
  };

  // --------------------------------------------------------------------------

  publicAPI.authenticate = async () => {
    const authorizeEndpoint = resolveAuthorizationEndpoint();
    if (!authorizeEndpoint) {
      throw new Error(
        'CastClient.authenticate: no authorization_endpoint or token_endpoint configured.'
      );
    }
    try {
      const url = new URL(authorizeEndpoint);
      console.debug(
        'CastClient: Authorizing at:',
        `${url.origin}${url.pathname}`
      );
    } catch (err) {
      console.debug('CastClient: Authorizing at hub');
    }

    const productName =
      model.session.productName || model.config.productName || 'VTKJS';

    const formData = new URLSearchParams();
    if (model.hub.lastIdToken) {
      formData.append('id_token', model.hub.lastIdToken);
    } else if (model.session.userName) {
      formData.append('user_name', model.session.userName);
    }
    formData.append('client_product_name', productName);
    if (model.session.topic) {
      formData.append('topic', model.session.topic);
    }

    let response;
    try {
      response = await fetch(authorizeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('CastClient: Exception during authenticate:', message);
      throw err;
    }
    if (response.status !== 200) {
      const text = await response.text().catch(() => '');
      console.error(
        'CastClient: Authenticate failed. Status:',
        response.status,
        text
      );
      throw new Error(
        `CastClient.authenticate failed (HTTP ${response.status})`
      );
    }
    const data = await response.json();
    if (typeof data.user_name === 'string' && data.user_name) {
      model.session.userName = data.user_name;
    }
    return {
      user_name: data.user_name || '',
      code: data.code || '',
      expires_in:
        typeof data.expires_in === 'number' ? data.expires_in : undefined,
    };
  };

  // --------------------------------------------------------------------------

  publicAPI.getToken = async (code) => {
    if (typeof code !== 'string' || !code) {
      console.error(
        'CastClient.getToken: code is required (call authenticate() first).'
      );
      return false;
    }
    try {
      const url = new URL(model.hub.token_endpoint);
      console.debug(
        'CastClient: Exchanging code at:',
        `${url.origin}${url.pathname}`
      );
    } catch (err) {
      console.debug('CastClient: Exchanging code at hub');
    }

    const productName =
      model.session.productName || model.config.productName || 'VTKJS';

    const tokenFormData = new URLSearchParams();
    tokenFormData.append('grant_type', 'authorization_code');
    tokenFormData.append('code', code);
    tokenFormData.append('client_id', model.hub.client_id || '');
    tokenFormData.append('client_secret', model.hub.client_secret || '');
    tokenFormData.append('client_product_name', productName);

    try {
      const response = await fetch(model.hub.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenFormData,
      });
      if (response.status === 200) {
        const config = await response.json();
        if (typeof config.access_token === 'string' && config.access_token) {
          model.hub.token = config.access_token;
        }
        if (typeof config.id_token === 'string' && config.id_token) {
          model.hub.lastIdToken = config.id_token;
        }
        if (config.topic && typeof config.topic === 'string') {
          if (!model.config.preserveSessionTopicFromToken) {
            // --------------------------------------------------------------------------

            // --------------------------------------------------------------------------

            publicAPI.setTopic(config.topic);
          }
          if (model.config.autoStart) {
            // --------------------------------------------------------------------------

            // --------------------------------------------------------------------------

            publicAPI.subscribe();
          }
        }
        return !!model.hub.token;
      }
      await response.text();
      console.error(
        'CastClient: Error getting token. Status:',
        response.status
      );
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('CastClient: Exception getting token:', message);
      return false;
    }
  };

  // --------------------------------------------------------------------------

  publicAPI.subscribe = async () => {
    const topic = model.session.topic && model.session.topic.trim();
    if (!topic) {
      console.warn(
        'CastClient: Error. subscription not sent. No topic defined.'
      );
      return 'error: topic not defined';
    }
    if (
      !model.session.subscriberName ||
      !String(model.session.subscriberName).trim()
    ) {
      model.session.subscriberName = generateSubscriberName(
        model.session.productName || model.config.productName || 'VTKJS'
      );
    }
    if (!model.hub.token) {
      console.warn(
        'CastClient: Error. subscription not sent. No token available.'
      );
      return 'error: no token';
    }

    const callbackUrl =
      model.config.callbackUrl ||
      (typeof window !== 'undefined'
        ? `${window.location.origin}/castCallback`
        : '');
    const subscribeFormData = new URLSearchParams();
    subscribeFormData.append('hub.mode', 'subscribe');
    subscribeFormData.append('hub.channel.type', 'websocket');
    subscribeFormData.append('hub.callback', callbackUrl);
    subscribeFormData.append(
      'hub.events',
      (model.session.events || []).toString()
    );
    subscribeFormData.append('hub.topic', topic);
    subscribeFormData.append('hub.lease', String(model.session.lease || 999));
    subscribeFormData.append(
      'subscriber.name',
      model.session.subscriberName || ''
    );
    subscribeFormData.append(
      'subscriber.product.name',
      model.session.productName || ''
    );
    subscribeFormData.append(
      'subscriber.product.version',
      model.session.productVersion || model.config.productVersion || ''
    );
    const subscribeActors = (model.session.actors || [])
      .map((actor) => actor.trim())
      .filter(Boolean);
    if (subscribeActors.length) {
      subscribeFormData.append(
        'subscriber.actors',
        JSON.stringify(subscribeActors)
      );
    }
    const clientInfo = getClientInfoPayload();
    if (clientInfo) {
      subscribeFormData.append(
        'subscriber.client_info',
        JSON.stringify(clientInfo)
      );
    }

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${model.hub.token}`,
      },
      body: subscribeFormData,
      signal:
        typeof AbortSignal !== 'undefined' && AbortSignal.timeout
          ? AbortSignal.timeout(SUBSCRIBE_TIMEOUT_MS)
          : undefined,
    };

    try {
      emitConnectionState('connecting');
      const response = await fetch(model.hub.hub_endpoint, requestOptions);
      if (response.status === 202) {
        model.hub.subscribed = true;
        model.hub.resubscribeRequested = false;
        const subscriptionResponse = await response.json();
        const websocketUrl = subscriptionResponse['hub.channel.endpoint'];

        let normalizedWebsocketUrl = websocketUrl;
        try {
          const hubEndpointUrl = new URL(model.hub.hub_endpoint);
          const wsUrl = new URL(websocketUrl);
          const wsProtocol =
            hubEndpointUrl.protocol === 'https:' ? 'wss:' : 'ws:';
          normalizedWebsocketUrl = websocketUrl.replace(
            wsUrl.origin,
            `${wsProtocol}//${hubEndpointUrl.host}`
          );
        } catch (err) {
          // use original URL
        }

        model.hub.websocket = new WebSocket(normalizedWebsocketUrl);
        model.hub.websocket.binaryType = 'arraybuffer';
        model.hub.websocket.onopen = function onOpen() {
          this.send(`{"hub.channel.endpoint":"${normalizedWebsocketUrl}"}`);
          emitConnectionState('connected');
        };
        model.hub.websocket.addEventListener('message', (ev) => {
          if (typeof ev.data === 'string') {
            processTextMessage(ev.data);
          } else if (ev.data instanceof ArrayBuffer) {
            processBinaryMessage(ev.data);
          }
        });
        model.hub.websocket.addEventListener('close', websocketClose);
        model.hub.websocket.onerror = function onError() {
          console.warn('CastClient: Error reported on websocket');
          emitConnectionState('error');
        };
        return response.status;
      }

      if (response.status === 401) {
        console.warn(
          'CastClient: Subscription response 401 - Token refresh needed.'
        );
        try {
          const { code } = await publicAPI.authenticate();
          if (code) {
            await publicAPI.getToken(code);
          }
        } catch (refreshErr) {
          const refreshMsg =
            refreshErr instanceof Error
              ? refreshErr.message
              : String(refreshErr);
          console.error(
            'CastClient: Token refresh after 401 failed:',
            refreshMsg
          );
        }
      } else {
        console.error(
          'CastClient: Subscription rejected by hub. Status:',
          response.status
        );
      }
      return response.status;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('CastClient: Exception subscribing to the hub:', message);
      return 0;
    }
  };

  // --------------------------------------------------------------------------

  publicAPI.unsubscribe = async () => {
    model.hub.subscribed = false;
    model.hub.resubscribeRequested = false;

    const callbackUrl =
      model.config.callbackUrl ||
      (typeof window !== 'undefined'
        ? `${window.location.origin}/castCallback`
        : '');
    const unsubscribeFormData = new URLSearchParams();
    unsubscribeFormData.append('hub.mode', 'unsubscribe');
    unsubscribeFormData.append('hub.channel.type', 'websocket');
    unsubscribeFormData.append('hub.callback', callbackUrl);
    unsubscribeFormData.append(
      'hub.events',
      (model.session.events || []).toString()
    );
    unsubscribeFormData.append('hub.topic', model.session.topic || '');
    unsubscribeFormData.append('hub.lease', String(model.session.lease || 999));
    unsubscribeFormData.append(
      'subscriber.name',
      model.session.subscriberName || ''
    );
    unsubscribeFormData.append(
      'subscriber.product.name',
      model.session.productName || ''
    );
    unsubscribeFormData.append(
      'subscriber.product.version',
      model.session.productVersion || model.config.productVersion || ''
    );
    const unsubscribeActors = (model.session.actors || [])
      .map((actor) => actor.trim())
      .filter(Boolean);
    if (unsubscribeActors.length) {
      unsubscribeFormData.append(
        'subscriber.actors',
        JSON.stringify(unsubscribeActors)
      );
    }
    const clientInfo = getClientInfoPayload();
    if (clientInfo) {
      unsubscribeFormData.append(
        'subscriber.client_info',
        JSON.stringify(clientInfo)
      );
    }

    try {
      const response = await fetch(model.hub.hub_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${model.hub.token}`,
        },
        body: unsubscribeFormData,
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(SUBSCRIBE_TIMEOUT_MS)
            : undefined,
      });
      if (response.status === 202) {
        console.debug(
          'CastClient: Unsubscribe successfully from hub',
          model.hub.name
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('CastClient: Error unsubscribing from the hub.', message);
    }

    if (model.hub.websocket) {
      model.hub.websocket.close();
      model.hub.websocket = null;
    }
    emitConnectionState('disconnected');
  };

  // --------------------------------------------------------------------------

  publicAPI.publish = async (castMessage, hub = model.hub) => {
    let msg = { ...castMessage, timestamp: new Date().toJSON() };
    msg.id = generateMessageId(messageIdPrefix());
    hub.lastPublishedMessageID = msg.id;

    const subscriberName =
      model.session.subscriberName && model.session.subscriberName.trim();
    const subscriberProduct =
      model.session.productName && model.session.productName.trim();
    if (subscriberName && msg['subscriber.name'] === undefined) {
      msg['subscriber.name'] = subscriberName;
    }
    if (subscriberProduct && msg['subscriber.product.name'] === undefined) {
      msg['subscriber.product.name'] = subscriberProduct;
    }

    if (msg.event && !msg.event['hub.topic']) {
      msg.event['hub.topic'] = model.session.topic;
    }

    if (msg['target.actor'] === undefined && model.session.defaultTargetActor) {
      const wireTarget = resolveTargetActorForWire(
        model.session.defaultTargetActor
      );
      if (wireTarget) {
        msg['target.actor'] = wireTarget;
      }
    }

    msg = stampHttpBinaryTransferForBinaryEvents(msg);
    msg = await normalizeDicomSendMessageStrict(msg);
    msg = await normalizeNiftiSendMessageStrict(msg);
    model.lastSentMessage = msg;

    try {
      const response = await fetch(hub.hub_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hub.token}`,
        },
        body: JSON.stringify(msg),
      });
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.debug('CastClient:', message);
      return null;
    }
  };

  // --------------------------------------------------------------------------

  publicAPI.publishNiftiMultipart = async (
    castMessage,
    fileBytes,
    hub = model.hub
  ) => {
    let msg = { ...castMessage, timestamp: new Date().toJSON() };
    msg.id = generateMessageId(messageIdPrefix());
    hub.lastPublishedMessageID = msg.id;

    const subscriberName =
      model.session.subscriberName && model.session.subscriberName.trim();
    const subscriberProduct =
      model.session.productName && model.session.productName.trim();
    if (subscriberName && msg['subscriber.name'] === undefined) {
      msg['subscriber.name'] = subscriberName;
    }
    if (subscriberProduct && msg['subscriber.product.name'] === undefined) {
      msg['subscriber.product.name'] = subscriberProduct;
    }

    if (msg.event && !msg.event['hub.topic']) {
      msg.event['hub.topic'] = model.session.topic;
    }

    if (msg['target.actor'] === undefined && model.session.defaultTargetActor) {
      const wireTarget = resolveTargetActorForWire(
        model.session.defaultTargetActor
      );
      if (wireTarget) {
        msg['target.actor'] = wireTarget;
      }
    }

    const raw = await toArrayBufferStrict(fileBytes);
    msg = stampHttpBinaryTransferForBinaryEvents(msg);
    msg = await normalizeNiftiSendMessageMetadataOnly(msg);
    model.lastSentMessage = msg;

    const fileName = niftiFileNameFromMessage(msg);
    const formData = new FormData();
    formData.append('message', JSON.stringify(msg));
    formData.append(
      'file',
      new Blob([raw], { type: 'application/gzip' }),
      fileName
    );

    try {
      const response = await fetch(hub.hub_endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hub.token}`,
        },
        body: formData,
      });
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.debug('CastClient:', message);
      return null;
    }
  };

  // --------------------------------------------------------------------------

  publicAPI.request = async (args = {}) => {
    const subscriber = String(args['subscriber.name'] || '').trim();
    if (!subscriber) {
      throw new Error('CastClient.request: "subscriber.name" is required.');
    }
    const hub = model.hub;
    const token = hub.token && hub.token.trim();
    if (!token) {
      throw new Error(
        'CastClient.request: token is required (call authenticate() then getToken(code) first).'
      );
    }

    const requestUrl = `${(hub.hub_endpoint || '').replace(
      /\/+$/,
      ''
    )}/request`;

    const body = {
      'subscriber.name': subscriber,
      id:
        (args.id && String(args.id).trim()) ||
        generateMessageId(messageIdPrefix()),
      timestamp:
        (args.timestamp && String(args.timestamp).trim()) ||
        new Date().toJSON(),
    };
    if (args.event && typeof args.event === 'object') {
      body.event = { ...args.event };
      const sessionTopic =
        model.session.topic && String(model.session.topic).trim();
      if (sessionTopic && !body.event['hub.topic']) {
        body.event['hub.topic'] = sessionTopic;
      }
    } else {
      throw new Error(
        'CastClient.request: "event" with hub.event is required.'
      );
    }
    const hubEvent = body.event['hub.event'];
    if (!hubEvent || !String(hubEvent).trim()) {
      throw new Error(
        'CastClient.request: event["hub.event"] must be a *-request event name.'
      );
    }
    if (args['subscriber.actor'] && String(args['subscriber.actor']).trim()) {
      body['subscriber.actor'] = String(args['subscriber.actor']).trim();
    }
    let wireTarget = resolveTargetActorForWire(args['target.actor']);
    if (wireTarget === undefined && model.session.defaultTargetActor) {
      wireTarget = resolveTargetActorForWire(model.session.defaultTargetActor);
    }
    if (wireTarget !== undefined) {
      body['target.actor'] = wireTarget;
    }
    const targetProduct =
      args['target.product.name'] !== undefined
        ? args['target.product.name']
        : args.targetProductName;
    const wireTargetProduct = resolveTargetProductNameForWire(targetProduct);
    if (wireTargetProduct !== undefined) {
      body['target.product.name'] = wireTargetProduct;
    }

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (e) {
        data = '';
      }
    } else {
      data = await response.text();
    }
    return { ok: response.ok, status: response.status, data };
  };

  // Send a response to a previously-received <datatype>-request.
  //
  // Signature: (id, dataType, data, topic?). Correlation ``id`` matches the
  // inbound *-request context.id. The hub.event is derived from ``dataType``.

  // --------------------------------------------------------------------------

  publicAPI.sendCastRequestResponse = (id, dataType, data, topic) => {
    if (
      !model.hub.websocket ||
      typeof WebSocket === 'undefined' ||
      model.hub.websocket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    let dt = '';
    if (typeof dataType === 'string') {
      dt = dataType.trim();
    } else if (dataType != null) {
      dt = String(dataType).trim();
    }
    if (!dt) {
      console.error(
        'CastClient.sendCastRequestResponse requires a non-empty dataType.'
      );
      return;
    }
    const eventName = responseEventFor(dt);

    const response = {
      timestamp: new Date().toJSON(),
      id: generateMessageId(messageIdPrefix()),
      'subscriber.name': model.session.subscriberName || undefined,
      'subscriber.product.name': model.session.productName || undefined,
      event: {
        'hub.topic': topic || model.session.topic,
        'hub.event': eventName,
        context: {
          id,
          dataType: dt,
          data,
        },
      },
    };
    if (
      Array.isArray(model.session.actors) &&
      model.session.actors.length > 0
    ) {
      response.actor = model.session.actors[0];
    }
    model.hub.websocket.send(JSON.stringify(response));
  };

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------

  if (model.config.autoReconnect) {
    model.reconnectInterval = setInterval(
      checkWebsocket,
      RECONNECT_INTERVAL_MS
    );
  }
}

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  model.config = { ...DEFAULT_VALUES.config, ...initialValues };
  model.session = {
    ...createSessionConfig(),
    ...(model.config.session || {}),
  };
  if (
    !model.session.subscriberName ||
    !String(model.session.subscriberName).trim()
  ) {
    model.session.subscriberName = generateSubscriberName(
      model.session.productName || model.config.productName || 'VTKJS'
    );
  }
  model.hub = {
    ...createHubConfig(),
    ...(model.config.hub || {}),
    ...createHubRuntimeState(),
  };

  macro.obj(publicAPI, model);
  macro.get(publicAPI, model, ['config']);

  vtkCastClient(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkCastClient');

// ----------------------------------------------------------------------------

export default { newInstance, extend, generateSubscriberName };
