import macro from 'vtk.js/Sources/macros';
import { postBinaryBatchPublish } from './binaryBatchPublish';
import {
  collatedResponsesFromRequestResult,
  parseCollatedRequestResult,
} from './collatedRequest';
import {
  isHubEndpointInCloud,
  isRunningInCloud,
  selectFirstMatchingHubKey,
} from './deployment';
import {
  dataTypeFromEventName,
  ensureCastSubscribeEvents,
  isRequestEvent,
  isResponseEvent,
  normalizeDataType,
  REQUEST_SUFFIX,
  requestEventFor,
  responseEventFor,
  RESPONSE_SUFFIX,
} from './eventNames';
import { buildHubCallbackUrl, buildHubModeFormData } from './hubForms';
import {
  DEFAULT_PRODUCT_NAME,
  generateMessageId,
  generateSubscriberName,
  productNameToMessageIdPrefix,
} from './identity';
import { createPayloadFetchApi } from './payloadFetch';
import {
  binaryFileNameFromMessage,
  coerceBinaryPublishToFiles,
  extractBinaryBatchFileBytes,
  messageNeedsBinaryBatchPublish,
  toArrayBufferStrict,
} from './sendNormalize';
import {
  CAST_CONFERENCE_EXIT_ACK_MS,
  CAST_CONFERENCE_POLL_MS,
  CAST_CONFERENCE_TITLE_PRESETS,
  conferenceHostTopic,
  createCastConference,
  deleteCastConference,
  fetchCastConferences,
  fetchCastConferenceTopics,
  findActiveCastConference,
  isCastConferenceHost,
  isCastConferenceParticipant,
  normalizeConferenceParticipants,
  resolveCastConferenceState,
} from './conference';
import {
  normalizeImagingStudyContext,
  extractStudyUIDFromResource,
  normalizeStudyUID,
  resolveImagingStudyOpenPlan,
} from './imagingStudyOpenPlan';
import {
  CAST_CONFERENCE_POPUP_SIZE,
  httpUrlFromHubEndpoint,
  openCastHubPopup,
  resolveCastConferenceClientUrl,
  resolveCastHubAdminUrl,
} from './hubLinks';
import {
  BINARY_PLACEHOLDER,
  countEventContextObjects,
  sanitizeCastMessageForDisplay,
  stringifyForLog,
  summarizeInboundCastMessage,
  summarizeOutboundCastPublish,
} from './messageLog';
import {
  batchContextFiles,
  decodeBase64ToArrayBuffer,
  extractFilePayloadsForEvent,
  filePayloadToArrayBuffer,
  filePayloadToFile,
  getActorKeyword,
  getHubEventLower,
  getInboundTargetActorKeyword,
} from './messageContext';
import {
  applyCastPublishEnvelopeFields,
  CAST_DEFAULT_SUBSCRIBER_ACTOR,
  CAST_ENVELOPE_ANY,
  DEFAULT_CAST_PUBLISH_ENVELOPE_FIELDS,
  normalizeOptionalEnvelopeField,
  resolveCastPublishEnvelopeFields,
} from './publishEnvelope';
import {
  castMessageHasPendingFilePayloads,
  resolveCastFileMessage,
} from './resolveCastFileMessage';
import {
  isStatusPayloadOnline,
  isStatusRequestDataType,
  isTotalSegmentatorProduct,
  productNameFromStatusResponseItem,
  statusItemValue,
  TOTAL_SEGMENTATOR_PRODUCT_ALIASES,
  totalSegmentatorAvailableFromStatusResponses,
} from './statusProtocol';
import {
  createHubConfig,
  createHubRuntimeState,
  createSessionConfig,
  resolveTargetActorForWire,
  resolveTargetProductNameForWire,
} from './wireEnvelope';
import {
  buildDicomwebImagingStudyOpenContext,
  buildDicomUrlImagingStudyOpenContext,
  buildFilesImagingStudyOpenContext,
  buildIdcImagingStudyOpenContext,
  buildNiftiUrlImagingStudyOpenContext,
  CAST_DICOMWEB_ROOT,
  CAST_IDENTIFIER_DICOM_UID,
  CAST_IDENTIFIER_IDC,
  CAST_IDENTIFIER_IDC_SOURCE_BUCKET,
  CAST_IDENTIFIER_NIFTI_FILENAME,
  CAST_IDENTIFIER_NIFTI_URL,
  CAST_IDENTIFIER_OHIF_MODE,
  CAST_IDENTIFIER_VOLVIEW_SAMPLE_ID,
  CAST_IDENTIFIER_WORKLIST_SAMPLE_ID,
  CAST_IMAGING_STUDY_OPEN_PROFILE,
  CAST_OPEN_MODE,
  CAST_OPEN_MODE_DICOMWEB,
  CAST_OPEN_MODE_DICOM_URL,
  CAST_OPEN_MODE_FILES,
  CAST_OPEN_MODE_IDC,
  extractDicomSeriesUid,
  extractDicomStudyUid,
  extractDicomwebRoot,
  extractIdcSeriesUid,
  extractIdcSourceBucket,
  extractIdentifierValue,
  extractImagingStudyFiles,
  extractNiftiDownloadUrl,
  extractNiftiFilename,
  extractOhifMode,
  extractOpenMode,
  extractStudyContextItem,
  extractVolviewSampleId,
} from './imagingStudyContext';

// API and usage: Documentation/api/IO_Core_CastClient.md (npm run docs:generate-api);
// live example: /examples/CastClient.html

export {
  applyCastPublishEnvelopeFields,
  batchContextFiles,
  BINARY_PLACEHOLDER,
  buildDicomwebImagingStudyOpenContext,
  buildDicomUrlImagingStudyOpenContext,
  buildFilesImagingStudyOpenContext,
  buildIdcImagingStudyOpenContext,
  buildNiftiUrlImagingStudyOpenContext,
  castMessageHasPendingFilePayloads,
  CAST_CONFERENCE_EXIT_ACK_MS,
  CAST_CONFERENCE_POLL_MS,
  CAST_CONFERENCE_POPUP_SIZE,
  CAST_CONFERENCE_TITLE_PRESETS,
  CAST_DEFAULT_SUBSCRIBER_ACTOR,
  CAST_DICOMWEB_ROOT,
  CAST_ENVELOPE_ANY,
  CAST_IDENTIFIER_DICOM_UID,
  CAST_IDENTIFIER_IDC,
  CAST_IDENTIFIER_IDC_SOURCE_BUCKET,
  CAST_IDENTIFIER_NIFTI_FILENAME,
  CAST_IDENTIFIER_NIFTI_URL,
  CAST_IDENTIFIER_OHIF_MODE,
  CAST_IDENTIFIER_VOLVIEW_SAMPLE_ID,
  CAST_IDENTIFIER_WORKLIST_SAMPLE_ID,
  CAST_IMAGING_STUDY_OPEN_PROFILE,
  CAST_OPEN_MODE,
  CAST_OPEN_MODE_DICOMWEB,
  CAST_OPEN_MODE_DICOM_URL,
  CAST_OPEN_MODE_FILES,
  CAST_OPEN_MODE_IDC,
  collatedResponsesFromRequestResult,
  conferenceHostTopic,
  countEventContextObjects,
  createCastConference,
  dataTypeFromEventName,
  decodeBase64ToArrayBuffer,
  DEFAULT_CAST_PUBLISH_ENVELOPE_FIELDS,
  deleteCastConference,
  ensureCastSubscribeEvents,
  extractDicomSeriesUid,
  extractDicomStudyUid,
  extractDicomwebRoot,
  extractFilePayloadsForEvent,
  extractIdcSeriesUid,
  extractIdcSourceBucket,
  extractIdentifierValue,
  extractImagingStudyFiles,
  extractNiftiDownloadUrl,
  extractNiftiFilename,
  extractOhifMode,
  extractOpenMode,
  extractStudyContextItem,
  extractStudyUIDFromResource,
  extractVolviewSampleId,
  fetchCastConferences,
  fetchCastConferenceTopics,
  filePayloadToArrayBuffer,
  filePayloadToFile,
  findActiveCastConference,
  generateSubscriberName,
  getActorKeyword,
  getHubEventLower,
  getInboundTargetActorKeyword,
  httpUrlFromHubEndpoint,
  isCastConferenceHost,
  isCastConferenceParticipant,
  isHubEndpointInCloud,
  isRequestEvent,
  isResponseEvent,
  isRunningInCloud,
  isStatusPayloadOnline,
  isStatusRequestDataType,
  isTotalSegmentatorProduct,
  normalizeConferenceParticipants,
  normalizeDataType,
  normalizeImagingStudyContext,
  normalizeOptionalEnvelopeField,
  normalizeStudyUID,
  openCastHubPopup,
  parseCollatedRequestResult,
  productNameFromStatusResponseItem,
  REQUEST_SUFFIX,
  requestEventFor,
  resolveCastConferenceClientUrl,
  resolveCastConferenceState,
  resolveCastFileMessage,
  resolveCastHubAdminUrl,
  resolveCastPublishEnvelopeFields,
  resolveImagingStudyOpenPlan,
  resolveTargetActorForWire,
  resolveTargetProductNameForWire,
  responseEventFor,
  RESPONSE_SUFFIX,
  sanitizeCastMessageForDisplay,
  selectFirstMatchingHubKey,
  statusItemValue,
  stringifyForLog,
  summarizeInboundCastMessage,
  summarizeOutboundCastPublish,
  TOTAL_SEGMENTATOR_PRODUCT_ALIASES,
  totalSegmentatorAvailableFromStatusResponses,
};

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

  const payloadFetchApi = createPayloadFetchApi(() => ({
    hubEndpoint: model.hub.hub_endpoint,
    accessToken: model.hub.token,
  }));

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

    const callbackUrl = buildHubCallbackUrl(model.config.callbackUrl);
    const subscribeFormData = buildHubModeFormData(
      'subscribe',
      {
        ...model.session,
        topic,
        subscriberName: model.session.subscriberName,
      },
      callbackUrl,
      model.config.productVersion
    );

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
        model.hub.websocket.onopen = function onOpen() {
          this.send(`{"hub.channel.endpoint":"${normalizedWebsocketUrl}"}`);
          emitConnectionState('connected');
        };
        model.hub.websocket.addEventListener('message', (ev) => {
          if (typeof ev.data === 'string') {
            processTextMessage(ev.data);
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

    const callbackUrl = buildHubCallbackUrl(model.config.callbackUrl);
    const unsubscribeFormData = buildHubModeFormData(
      'unsubscribe',
      model.session,
      callbackUrl,
      model.config.productVersion
    );

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

  function preparePublishMessage(castMessage, hub = model.hub) {
    const msg = { ...castMessage, timestamp: new Date().toJSON() };
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
      const targetSubscriber = String(
        msg['target.subscriber.name'] || ''
      ).trim();
      if (!targetSubscriber) {
        const wireTarget = resolveTargetActorForWire(
          model.session.defaultTargetActor
        );
        if (wireTarget) {
          msg['target.actor'] = wireTarget;
        }
      }
    }

    return msg;
  }

  // --------------------------------------------------------------------------

  publicAPI.fetchPayload = (castMessage) =>
    payloadFetchApi.fetchPayload(castMessage);

  publicAPI.fetchAllPayloads = (castMessage) =>
    payloadFetchApi.fetchAllPayloads(castMessage);

  publicAPI.hasPendingPayload = (castMessage) =>
    payloadFetchApi.hasPendingPayload(castMessage);

  // --------------------------------------------------------------------------

  /** @deprecated Use ``publishBinaryBatch`` or ``publish`` (binary batch). */
  publicAPI.publishMultipart = async (
    castMessage,
    fileBytes,
    hub = model.hub
  ) => {
    let msg = preparePublishMessage(castMessage, hub);
    const raw = await toArrayBufferStrict(fileBytes);
    msg = coerceBinaryPublishToFiles(msg);
    let fileBytesList = await extractBinaryBatchFileBytes(msg);
    if (!fileBytesList.length) {
      const hubEvent =
        msg.event && typeof msg.event['hub.event'] === 'string'
          ? msg.event['hub.event']
          : '';
      const defaultName =
        hubEvent === 'dicom-send' ? 'dicom-send.dcm' : 'nifti-send.nii.gz';
      msg.event.context = {
        files: [
          {
            data: raw,
            fileName: binaryFileNameFromMessage(msg, defaultName),
            mimeType: 'application/octet-stream',
            byteLength: raw.byteLength,
          },
        ],
      };
      fileBytesList = [raw];
    }
    return publicAPI.publishBinaryBatch(msg, fileBytesList, hub);
  };

  // --------------------------------------------------------------------------

  publicAPI.publishBinaryBatch = async (
    castMessage,
    fileBytesList,
    hub = model.hub
  ) => {
    const msg = coerceBinaryPublishToFiles(
      preparePublishMessage(castMessage, hub)
    );
    return postBinaryBatchPublish({
      msg,
      fileBytesList,
      hub,
      messageIdPrefix,
    });
  };

  // --------------------------------------------------------------------------

  publicAPI.publish = async (castMessage, hub = model.hub) => {
    let msg = preparePublishMessage(castMessage, hub);
    msg = coerceBinaryPublishToFiles(msg);

    if (messageNeedsBinaryBatchPublish(msg)) {
      const fileBytesList = await extractBinaryBatchFileBytes(msg);
      if (fileBytesList.length) {
        return publicAPI.publishBinaryBatch(msg, fileBytesList, hub);
      }
    }

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

  /** @deprecated Use ``publishBinaryBatch`` or ``publish``. */
  publicAPI.publishNiftiMultipart = async (castMessage, fileBytes, hub) =>
    publicAPI.publishBinaryBatch(castMessage, [fileBytes], hub);

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
    const hasExplicitTargetActor = Object.prototype.hasOwnProperty.call(
      args,
      'target.actor'
    );
    let wireTarget = hasExplicitTargetActor
      ? resolveTargetActorForWire(args['target.actor'])
      : undefined;
    if (
      wireTarget === undefined &&
      !hasExplicitTargetActor &&
      model.session.defaultTargetActor
    ) {
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

export default {
  newInstance,
  extend,
  applyCastPublishEnvelopeFields,
  batchContextFiles,
  BINARY_PLACEHOLDER,
  buildDicomwebImagingStudyOpenContext,
  buildDicomUrlImagingStudyOpenContext,
  buildFilesImagingStudyOpenContext,
  buildIdcImagingStudyOpenContext,
  buildNiftiUrlImagingStudyOpenContext,
  castMessageHasPendingFilePayloads,
  CAST_CONFERENCE_EXIT_ACK_MS,
  CAST_CONFERENCE_POLL_MS,
  CAST_CONFERENCE_POPUP_SIZE,
  CAST_CONFERENCE_TITLE_PRESETS,
  CAST_DEFAULT_SUBSCRIBER_ACTOR,
  CAST_DICOMWEB_ROOT,
  CAST_ENVELOPE_ANY,
  CAST_IDENTIFIER_DICOM_UID,
  CAST_IDENTIFIER_IDC,
  CAST_IDENTIFIER_IDC_SOURCE_BUCKET,
  CAST_IDENTIFIER_NIFTI_FILENAME,
  CAST_IDENTIFIER_NIFTI_URL,
  CAST_IDENTIFIER_OHIF_MODE,
  CAST_IDENTIFIER_VOLVIEW_SAMPLE_ID,
  CAST_IDENTIFIER_WORKLIST_SAMPLE_ID,
  CAST_IMAGING_STUDY_OPEN_PROFILE,
  CAST_OPEN_MODE,
  CAST_OPEN_MODE_DICOMWEB,
  CAST_OPEN_MODE_DICOM_URL,
  CAST_OPEN_MODE_FILES,
  CAST_OPEN_MODE_IDC,
  collatedResponsesFromRequestResult,
  conferenceHostTopic,
  countEventContextObjects,
  createCastConference,
  dataTypeFromEventName,
  decodeBase64ToArrayBuffer,
  DEFAULT_CAST_PUBLISH_ENVELOPE_FIELDS,
  deleteCastConference,
  ensureCastSubscribeEvents,
  extractDicomSeriesUid,
  extractDicomStudyUid,
  extractDicomwebRoot,
  extractFilePayloadsForEvent,
  extractIdcSeriesUid,
  extractIdcSourceBucket,
  extractIdentifierValue,
  extractImagingStudyFiles,
  extractNiftiDownloadUrl,
  extractNiftiFilename,
  extractOhifMode,
  extractOpenMode,
  extractStudyContextItem,
  extractStudyUIDFromResource,
  extractVolviewSampleId,
  fetchCastConferences,
  fetchCastConferenceTopics,
  filePayloadToArrayBuffer,
  filePayloadToFile,
  findActiveCastConference,
  generateSubscriberName,
  getActorKeyword,
  getHubEventLower,
  getInboundTargetActorKeyword,
  httpUrlFromHubEndpoint,
  isCastConferenceHost,
  isCastConferenceParticipant,
  isHubEndpointInCloud,
  isRequestEvent,
  isResponseEvent,
  isRunningInCloud,
  isStatusPayloadOnline,
  isStatusRequestDataType,
  isTotalSegmentatorProduct,
  normalizeConferenceParticipants,
  normalizeDataType,
  normalizeImagingStudyContext,
  normalizeOptionalEnvelopeField,
  normalizeStudyUID,
  openCastHubPopup,
  parseCollatedRequestResult,
  productNameFromStatusResponseItem,
  REQUEST_SUFFIX,
  requestEventFor,
  resolveCastConferenceClientUrl,
  resolveCastConferenceState,
  resolveCastFileMessage,
  resolveCastHubAdminUrl,
  resolveCastPublishEnvelopeFields,
  resolveImagingStudyOpenPlan,
  resolveTargetActorForWire,
  resolveTargetProductNameForWire,
  responseEventFor,
  RESPONSE_SUFFIX,
  sanitizeCastMessageForDisplay,
  selectFirstMatchingHubKey,
  statusItemValue,
  stringifyForLog,
  summarizeInboundCastMessage,
  summarizeOutboundCastPublish,
  TOTAL_SEGMENTATOR_PRODUCT_ALIASES,
  totalSegmentatorAvailableFromStatusResponses,
};
