import macro from 'vtk.js/Sources/macros';

const DEFAULT_MESSAGE_ID_PREFIX = 'CS3D-';
const RECONNECT_INTERVAL_MS = 10000;
const SUBSCRIBE_TIMEOUT_MS = 5000;
const EMPTY_FHIRCAST_CONTEXT = {
  'context.type': '',
  context: [],
};

function generateMessageId(prefix = DEFAULT_MESSAGE_ID_PREFIX) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return prefix + Math.random().toString(36).substring(2, 18);
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
  const contextItems = Array.isArray(contextValue)
    ? contextValue
    : contextValue != null
      ? [contextValue]
      : [];
  if (!contextItems.length) {
    throw new Error('CastClient: dicom-send requires non-empty event.context');
  }

  const normalizedContext = [];
  for (let i = 0; i < contextItems.length; i++) {
    normalizedContext.push(await normalizeDicomSendContextItem(contextItems[i]));
  }

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
    productName: '',
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
    actors: [],
    topic: '',
    events: [],
    lease: 999,
  };
}

function createHubRuntimeState() {
  return {
    token: '',
    lastPublishedMessageID: '',
    subscribed: false,
    resubscribeRequested: false,
    websocket: null,
  };
}

const DEFAULT_VALUES = {
  config: {
    hub: {},
    session: {},
    productName: undefined,
    callbackUrl: undefined,
    autoStart: false,
    autoReconnect: false,
    preserveSessionTopicFromToken: false,
    messageIdPrefix: DEFAULT_MESSAGE_ID_PREFIX,
  },
  hub: null,
  reconnectInterval: null,
  onMessageCallback: null,
  onConnectionStateChangeCallback: null,
  lastSentMessage: null,
  pendingDicomSendCastMessage: null,
};

function vtkCastClient(publicAPI, model) {
  model.classHierarchy.push('vtkCastClient');

  function emitConnectionState(state, detail) {
    if (model.onConnectionStateChangeCallback) {
      model.onConnectionStateChangeCallback(state, detail);
    }
  }

  function messageIdPrefix() {
    return model.config.messageIdPrefix || DEFAULT_MESSAGE_ID_PREFIX;
  }

  function websocketClose() {
    console.debug('CastClient: websocket is closed.');
    model.pendingDicomSendCastMessage = null;
    model.hub.resubscribeRequested = true;
    emitConnectionState('disconnected');
  }

  function processBinaryMessage(buf) {
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

      if (event['hub.event'] === 'get-request') {
        const context = event.context || {};
        const requestId = context.requestId;
        if (
          typeof requestId === 'string' &&
          context.dataType === 'FHIRcastContext'
        ) {
          const lastEvent =
            model.lastSentMessage && model.lastSentMessage.event;
          const lastEventTypeText =
            lastEvent && typeof lastEvent['hub.event'] === 'string'
              ? lastEvent['hub.event'].toLowerCase()
              : '';

          let responseData = model.lastSentMessage || EMPTY_FHIRCAST_CONTEXT;
          if (lastEventTypeText.includes('close')) {
            responseData = EMPTY_FHIRCAST_CONTEXT;
          } else if (lastEventTypeText.includes('imagingstudy-open')) {
            responseData = {
              'context.type': 'ImagingStudy',
              context: Array.isArray(lastEvent && lastEvent.context)
                ? lastEvent.context
                : [],
            };
          }
          publicAPI.sendGetResponse(
            requestId,
            responseData,
            event['hub.topic']
          );
        }
        return;
      }

      if (castMessage.id === model.hub.lastPublishedMessageID) {
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
      productName: hub.productName,
      version: hub.version,
      hub_endpoint: hub.hub_endpoint,
      authorization_endpoint: hub.authorization_endpoint,
      token_endpoint: hub.token_endpoint,
      client_id: hub.client_id,
      client_secret: hub.client_secret,
    };
  };

  publicAPI.getSessionConfig = () => {
    const hub = model.hub;
    return {
      subscriberName: hub.subscriberName,
      actors: hub.actors,
      topic: hub.topic,
      events: hub.events,
      lease: hub.lease,
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
    model.hub.topic = topic;
  };

  publicAPI.setToken = (token) => {
    model.hub.token = token;
  };

  publicAPI.setSubscriberName = (subscriberName) => {
    model.hub.subscriberName = subscriberName;
  };

  publicAPI.getToken = async () => {
    try {
      const url = new URL(model.hub.token_endpoint);
      console.debug(
        'CastClient: Getting token from:',
        `${url.origin}${url.pathname}`
      );
    } catch (err) {
      console.debug('CastClient: Getting token from hub');
    }

    const tokenFormData = new URLSearchParams();
    tokenFormData.append('grant_type', 'client_credentials');
    tokenFormData.append('client_id', model.hub.client_id || '');
    tokenFormData.append('client_secret', model.hub.client_secret || '');
    tokenFormData.append(
      'client_product_name',
      model.config.productName || 'CS3D'
    );

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
        if (typeof config.subscriber_name === 'string') {
          model.hub.subscriberName = config.subscriber_name;
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
    const topic = model.hub.topic && model.hub.topic.trim();
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
    subscribeFormData.append('hub.events', (model.hub.events || []).toString());
    subscribeFormData.append('hub.topic', topic);
    subscribeFormData.append('hub.lease', String(model.hub.lease || 999));
    subscribeFormData.append('subscriber.name', model.hub.subscriberName || '');
    const subscribeActors = (model.hub.actors || [])
      .map((actor) => actor.trim())
      .filter(Boolean);
    if (subscribeActors.length) {
      subscribeFormData.append(
        'subscriber.actors',
        JSON.stringify(subscribeActors)
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
        await publicAPI.getToken();
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
      (model.hub.events || []).toString()
    );
    unsubscribeFormData.append('hub.topic', model.hub.topic || '');
    unsubscribeFormData.append('hub.lease', String(model.hub.lease || 999));
    unsubscribeFormData.append(
      'subscriber.name',
      model.hub.subscriberName || ''
    );
    const unsubscribeActors = (model.hub.actors || [])
      .map((actor) => actor.trim())
      .filter(Boolean);
    if (unsubscribeActors.length) {
      unsubscribeFormData.append(
        'subscriber.actors',
        JSON.stringify(unsubscribeActors)
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

    const subscriberName = hub.subscriberName && hub.subscriberName.trim();
    if (subscriberName && msg.subscriber === undefined) {
      msg.subscriber = subscriberName;
    }

    if (msg.event) {
      msg.event['hub.topic'] = hub.topic;
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

  publicAPI.sendGetResponse = (requestId, data, topic) => {
    if (
      !model.hub.websocket ||
      typeof WebSocket === 'undefined' ||
      model.hub.websocket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    const response = {
      timestamp: new Date().toJSON(),
      id: generateMessageId(messageIdPrefix()),
      event: {
        'hub.topic': topic || model.hub.topic,
        'hub.event': 'get-response',
        context: { requestId, data },
      },
    };
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
  model.hub = {
    ...createHubConfig(),
    ...(model.config.hub || {}),
    ...createSessionConfig(),
    ...(model.config.session || {}),
    ...createHubRuntimeState(),
  };

  macro.obj(publicAPI, model);
  macro.get(publicAPI, model, ['config']);

  vtkCastClient(publicAPI, model);
}

export const newInstance = macro.newInstance(extend, 'vtkCastClient');

export default { newInstance, extend };
