import macro from 'vtk.js/Sources/macros';
import { responseEventFor } from './eventNames';

const DEFAULT_PRODUCT_NAME = 'VTKJS';
const RECONNECT_INTERVAL_MS = 10000;
const SUBSCRIBE_TIMEOUT_MS = 5000;
const SUBSCRIBER_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function sanitizeProductBase(productName, fallback = DEFAULT_PRODUCT_NAME) {
  return (
    String(productName || fallback)
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}

function productNameToMessageIdPrefix(productName) {
  return `${sanitizeProductBase(productName)}-`;
}

function generateMessageId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return prefix + Math.random().toString(36).substring(2, 18);
}

function generateSubscriberName(productName = DEFAULT_PRODUCT_NAME) {
  const base = sanitizeProductBase(productName);
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    const index = Math.floor(Math.random() * SUBSCRIBER_ID_ALPHABET.length);
    suffix += SUBSCRIBER_ID_ALPHABET[index];
  }
  return `${base}-${suffix}`;
}

function isArrayBufferView(value) {
  return typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value);
}

async function toArrayBufferStrict(data) {
  if (data instanceof ArrayBuffer) {
    return data;
  }

  if (isArrayBufferView(data)) {
    const { buffer, byteOffset, byteLength } = data;
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }

  if (
    typeof Blob !== 'undefined' &&
    data instanceof Blob &&
    typeof data.arrayBuffer === 'function'
  ) {
    return data.arrayBuffer();
  }

  throw new Error(
    'CastClient: dicom-send resource.data must be ArrayBuffer, TypedArray, DataView, Blob, or File'
  );
}

function arrayBufferToBase64(arrayBuffer) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(arrayBuffer).toString('base64');
  }

  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  throw new Error('CastClient: no base64 encoder available in this runtime');
}

async function normalizeDicomSendContextItem(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('CastClient: dicom-send context items must be objects');
  }
  const resource = item.resource;
  if (!resource || typeof resource !== 'object') {
    throw new Error(
      'CastClient: dicom-send context item missing resource object'
    );
  }
  if (!('data' in resource)) {
    throw new Error('CastClient: dicom-send resource.data is required');
  }
  if (typeof resource.data === 'string') {
    throw new Error(
      'CastClient: dicom-send string payloads are not supported; pass binary input instead'
    );
  }

  const normalizedResource = { ...resource };
  const binaryData = await toArrayBufferStrict(resource.data);
  normalizedResource.data = arrayBufferToBase64(binaryData);
  normalizedResource.fileName =
    typeof normalizedResource.fileName === 'string' &&
    normalizedResource.fileName.trim()
      ? normalizedResource.fileName
      : 'dicom-send.dcm';
  normalizedResource.mimeType =
    typeof normalizedResource.mimeType === 'string' &&
    normalizedResource.mimeType.trim()
      ? normalizedResource.mimeType
      : 'application/dicom';
  normalizedResource.binaryTransfer = true;

  return { ...item, resource: normalizedResource };
}

async function normalizeDicomSendMessageStrict(msg) {
  if (!msg.event || typeof msg.event !== 'object') {
    throw new Error('CastClient: dicom-send requires event object');
  }
  const event = msg.event;
  if (event['hub.event'] !== 'dicom-send') {
    return msg;
  }

  const contextValue = event.context;
  let contextItems = [];
  if (Array.isArray(contextValue)) {
    contextItems = contextValue;
  } else if (contextValue != null) {
    contextItems = [contextValue];
  }
  if (!contextItems.length) {
    throw new Error('CastClient: dicom-send requires non-empty event.context');
  }

  const normalizedContext = await Promise.all(
    contextItems.map((contextItem) =>
      normalizeDicomSendContextItem(contextItem)
    )
  );

  return {
    ...msg,
    event: {
      ...event,
      context: normalizedContext,
    },
  };
}

function dicomSendEventWaitsForBinaryFrame(event) {
  if (event['hub.event'] !== 'dicom-send') {
    return false;
  }

  const context = event.context;
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
        resource.binaryTransfer === true &&
        (typeof resource.data !== 'string' || resource.data.length === 0)
      ) {
        return true;
      }
    }
  }

  return false;
}

function createHubConfig() {
  return {
    name: '',
    friendlyName: '',
    version: '',
    hub_endpoint: '',
    authorization_endpoint: '',
    token_endpoint: '',
    client_id: '',
    client_secret: '',
  };
}

function createSessionConfig() {
  return {
    subscriberName: '',
    productName: '',
    productVersion: '',
    actors: [],
    topic: '',
    events: [],
    lease: 999,
    userName: '',
    defaultTargetActor: '',
  };
}

function resolveTargetActorForWire(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  if (!text || text === '*') {
    return undefined;
  }
  return text;
}

function createHubRuntimeState() {
  return {
    token: '',
    lastIdToken: '',
    lastPublishedMessageID: '',
    subscribed: false,
    resubscribeRequested: false,
    websocket: null,
  };
}

function getClientInfoPayload() {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const info = {};
  if (typeof navigator.userAgent === 'string' && navigator.userAgent.trim()) {
    info.userAgent = navigator.userAgent.trim();
  }
  if (typeof navigator.platform === 'string' && navigator.platform.trim()) {
    info.platform = navigator.platform.trim();
  }
  if (typeof navigator.language === 'string' && navigator.language.trim()) {
    info.language = navigator.language.trim();
  }
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof timezone === 'string' && timezone.trim()) {
      info.timezone = timezone.trim();
    }
  } catch (err) {
    // Intl/timezone may be unavailable in some runtimes.
  }

  return Object.keys(info).length ? info : null;
}

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
  pendingDicomSendCastMessage: null,
  skipNextDicomBinary: false,
};

function vtkCastClient(publicAPI, model) {
  model.classHierarchy.push('vtkCastClient');

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

  function websocketClose() {
    console.debug('CastClient: websocket is closed.');
    model.pendingDicomSendCastMessage = null;
    model.skipNextDicomBinary = false;
    model.hub.resubscribeRequested = true;
    emitConnectionState('disconnected');
  }

  function processBinaryMessage(buf) {
    if (model.skipNextDicomBinary) {
      model.skipNextDicomBinary = false;
      return;
    }

    const pending = model.pendingDicomSendCastMessage;
    if (!pending || !pending.event) {
      console.warn('CastClient: unexpected binary WebSocket message');
      return;
    }

    model.pendingDicomSendCastMessage = null;
    const context = pending.event.context;
    let items = [];
    if (Array.isArray(context)) {
      items = context;
    } else if (context != null) {
      items = [context];
    }
    let attached = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && typeof item === 'object') {
        const resource = item.resource;
        if (
          resource &&
          typeof resource === 'object' &&
          resource.binaryTransfer === true
        ) {
          delete resource.binaryTransfer;
          resource.data = buf;
          attached = true;
          break;
        }
      }
    }

    if (!attached) {
      console.warn('CastClient: binary frame did not match pending dicom-send');
      return;
    }

    if (pending.id === model.hub.lastPublishedMessageID) {
      return;
    }

    if (model.onMessageCallback) {
      model.onMessageCallback(pending);
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

      if (castMessage.id === model.hub.lastPublishedMessageID) {
        if (dicomSendEventWaitsForBinaryFrame(event)) {
          model.skipNextDicomBinary = true;
        }
        return;
      }

      if (dicomSendEventWaitsForBinaryFrame(event)) {
        model.pendingDicomSendCastMessage = castMessage;
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

  publicAPI.onMessage = (callback) => {
    model.onMessageCallback = callback;
  };

  publicAPI.onConnectionStateChange = (callback) => {
    model.onConnectionStateChangeCallback = callback;
  };

  publicAPI.destroy = () => {
    if (model.reconnectInterval) {
      clearInterval(model.reconnectInterval);
      model.reconnectInterval = null;
    }
    publicAPI.unsubscribe();
  };

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

  publicAPI.setTopic = (topic) => {
    console.debug('CastClient: setting topic to', topic);
    model.session.topic = topic;
  };

  publicAPI.setToken = (token) => {
    model.hub.token = token;
  };

  publicAPI.setSubscriberName = (subscriberName) => {
    model.session.subscriberName = subscriberName;
  };

  publicAPI.setUserName = (userName) => {
    model.session.userName = userName || '';
  };

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
        if (
          typeof config.subscriber_name === 'string' &&
          config.subscriber_name
        ) {
          model.session.subscriberName = config.subscriber_name;
        }
        if (config.topic && typeof config.topic === 'string') {
          if (!model.config.preserveSessionTopicFromToken) {
            publicAPI.setTopic(config.topic);
          }
          if (model.config.autoStart) {
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

  publicAPI.subscribe = async () => {
    const topic = model.session.topic && model.session.topic.trim();
    if (!topic) {
      console.warn(
        'CastClient: Error. subscription not sent. No topic defined.'
      );
      return 'error: topic not defined';
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
      'subscriber.product',
      model.session.productName || ''
    );
    subscribeFormData.append(
      'subscriber.version',
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
      'subscriber.product',
      model.session.productName || ''
    );
    unsubscribeFormData.append(
      'subscriber.version',
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

  publicAPI.publish = async (castMessage, hub = model.hub) => {
    let msg = { ...castMessage, timestamp: new Date().toJSON() };
    msg.id = generateMessageId(messageIdPrefix());
    hub.lastPublishedMessageID = msg.id;

    const subscriberName =
      model.session.subscriberName && model.session.subscriberName.trim();
    const subscriberProduct =
      model.session.productName && model.session.productName.trim();
    const subscriberVersion =
      (model.session.productVersion && model.session.productVersion.trim()) ||
      model.config.productVersion;
    if (subscriberName && msg['subscriber.name'] === undefined) {
      msg['subscriber.name'] = subscriberName;
    }
    if (subscriberProduct && msg['subscriber.product'] === undefined) {
      msg['subscriber.product'] = subscriberProduct;
    }
    if (subscriberVersion && msg['subscriber.version'] === undefined) {
      msg['subscriber.version'] = subscriberVersion;
    }

    if (msg.event && !msg.event['hub.topic']) {
      msg.event['hub.topic'] = model.session.topic;
    }

    if (msg.targetActor === undefined && model.session.defaultTargetActor) {
      const wireTarget = resolveTargetActorForWire(
        model.session.defaultTargetActor
      );
      if (wireTarget) {
        msg.targetActor = wireTarget;
      }
    }

    msg = await normalizeDicomSendMessageStrict(msg);
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

  publicAPI.request = async (args = {}) => {
    const subscriber = String(args.subscriber || '').trim();
    if (!subscriber) {
      throw new Error('CastClient.request: "subscriber" is required.');
    }
    const hub = model.hub;
    const token = hub.token && hub.token.trim();
    if (!token) {
      throw new Error(
        'CastClient.request: token is required (call authenticate() then getToken(code) first).'
      );
    }

    const endpoint =
      (args.endpoint && args.endpoint.trim()) ||
      `${(hub.hub_endpoint || '').replace(/\/+$/, '')}/request`;

    const body = { subscriber };
    const topic =
      (args.topic && String(args.topic).trim()) || model.session.topic;
    if (topic) body.topic = topic;
    if (args.dataType && String(args.dataType).trim()) {
      body.dataType = String(args.dataType).trim();
    }
    if (args.actor && String(args.actor).trim()) {
      body.actor = String(args.actor).trim();
    }
    let wireTarget = resolveTargetActorForWire(args.targetActor);
    if (wireTarget === undefined && model.session.defaultTargetActor) {
      wireTarget = resolveTargetActorForWire(model.session.defaultTargetActor);
    }
    if (wireTarget) {
      body.targetActor = wireTarget;
    }
    if (args.productName && String(args.productName).trim()) {
      body.productName = String(args.productName).trim();
    }

    const response = await fetch(endpoint, {
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
  // Signature: (requestId, dataType, data, topic?). The hub.event is derived
  // from ``dataType`` (e.g. PNGFULLSIZE -> pngfullsize-response). ``dataType``
  // is required; omitting it is an error (no generic cast-response emission).
  publicAPI.sendCastRequestResponse = (requestId, dataType, data, topic) => {
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
      'subscriber.product': model.session.productName || undefined,
      'subscriber.version':
        model.session.productVersion ||
        model.config.productVersion ||
        undefined,
      event: {
        'hub.topic': topic || model.session.topic,
        'hub.event': eventName,
        context: {
          requestId,
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

  if (model.config.autoReconnect) {
    model.reconnectInterval = setInterval(
      checkWebsocket,
      RECONNECT_INTERVAL_MS
    );
  }
}

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

export const newInstance = macro.newInstance(extend, 'vtkCastClient');

export default { newInstance, extend };
