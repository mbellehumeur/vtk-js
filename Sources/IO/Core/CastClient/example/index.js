
/**
 * @example
 * const client = vtkCastClient.newInstance({
 *   hub: {
 *     name: 'demo',
 *     version: '1',
 *     hub_endpoint: 'https://host/api/hub',
 *     token_endpoint: 'https://host/oauth/token',
 *     client_id: 'client_id',
 *     client_secret: 'client_secret',
 *   },
 *   session: {
 *     events: ['*'],
 *     lease: 7200,
 *     subscriberName: 'VTKJS-EXAMPLE',
 *     topic: 'my-topic',
 *   },
 *   autoReconnect: true,
 * });
 *
 * client.onMessage((message) => {
 *   console.log(message);
 * });
 *
 * const tokenOk = await client.getToken();
 * if (tokenOk) {
 *   await client.subscribe();
 *   await client.publish({
 *     event: {
 *       'hub.event': 'custom',
 *       'hub.topic': 'my-topic',
 *       context: [],
 *     },
 *   });
 * }
 */

import '@kitware/vtk.js/favicon';

import vtkCastClient from 'vtk.js/Sources/IO/Core/CastClient';

import style from './CastClient.module.css';

const CONNECTION_STATUS_CLASS = {
  connecting: style.connecting,
  connected: style.connected,
  disconnected: style.disconnected,
  'token-ready': style.tokenReady,
  error: style.error,
};

const MESSAGE_KIND_CLASS = {
  received: style.msgReceived,
  sent: style.msgSent,
  err: style.msgErr,
};

const DEFAULT_ACTOR_KEYWORD = 'WORKLIST_CLIENT';
const DEFAULT_SUBSCRIBE_ACTORS_JSON = `["${DEFAULT_ACTOR_KEYWORD}","EC","WATCHER"]`;
const DEFAULT_GET_ACTOR_KEYWORD = 'WORKLIST_CLIENT';
const DEFAULT_SUBSCRIBER_NAME = 'VTKJS';
const DICOM_SEND_ACTOR_KEYWORD = 'EC';
const OPENIGT_LINK_ACTOR_TOOLTIP =
  'Image Guided Therapy link\nA system that handles navigation and other dataTypes';

const ACTOR_PRESETS = [
  {
    keyword: 'REPORT_CREATOR',
    name: 'Report Creator',
    description:
      'A system that generates and transmits preliminary, final, or amended diagnostic results (reports).',
  },
  {
    keyword: 'EC',
    name: 'Evidence Creator',
    description:
      'A system that creates evidence data such as images or measurements, through a process other than data acquisition.',
  },
  {
    keyword: 'ID',
    name: 'Image Display',
    description:
      'A system that presents medical images and associated imaging data.',
  },
  {
    keyword: 'CONTENT_CREATOR',
    name: 'Content Creator',
    description:
      'The Content Creator Actor creates content and transmits to a Content Consumer.',
  },
  {
    keyword: 'WATCHER',
    name: 'Watcher',
    description:
      'Subscribes and receives notifications of events associated with a workitem.',
  },
  {
    keyword: 'HUB',
    name: 'Hub',
    description:
      'Manages event flows between Subscribers in a session and maintains context sharing.',
  },
  {
    keyword: 'WORKLIST_CLIENT',
    name: 'Worklist Client',
    description: 'Providing a reporting worklist to the user.',
  },
];

const HUB_DEFINITIONS = {
  local: {
    hubEndpoint: 'http://127.0.0.1:2017/api/hub',
    authEndpoint: 'http://127.0.0.1:2017/oauth/token',
    product_name: 'VTKJS',
    client_id: 'client_id_3d_Slicer',
    client_secret: 'client_secret_3d_Slicer',
  },
  cloud: {
    hubEndpoint:
      'https://cast-hub-g6abetanhjesb6cx.westeurope-01.azurewebsites.net/api/hub',
    authEndpoint:
      'https://cast-hub-g6abetanhjesb6cx.westeurope-01.azurewebsites.net/oauth/token',
    product_name: 'VTKJS',
    client_id: 'client_id_3d_Slicer',
    client_secret: 'client_secret_3d_Slicer',
  },
};

function headerInstructionsHtml() {
  return `<p>This example demonstrate using the vtk.js IO module cast client  for messaging as a worklist client and an evidence creator (EC) with the 3D slicer hub and an OHIF viewer.</p>
<ol>
<li><strong>Authenticate</strong> — Click the Authenticate button to request a token and user id. When the status strip shows token ready, you can subscribe.</li>
<li><strong>Open Hub Admin Portal</strong> — Opens the hub admin portal to see the  subscriptions and messaging.</li>
<li><strong>Subscribe</strong> — Click the Subscribe button to connect establish a subscription to desired messages to the hub and declare the actors you support for the GET requests.  This will also establish a websocket connection to receive events and their data (JSON or binary).</li>
<li><strong>Publish ImagingStudy-open</strong> — Click the publish button to send an ImagingStudy-open event to the hub.  The study should open in the viewer.</li>
<li><strong>Open viewer with this topic</strong> — Opens an OHIF instance that automatically authenticates, subscribes to the hub and does a  cast request to get the FHIRcastContext from the WORKLIST_CLIENT actor.  If astudy is found, it is opened in the viewer.</li>
<li><strong>Publish DICOM-send</strong> — Change the event type to DICOM-send and click the Publish button. This will send a DICOM file to the viewer and the segmentation should appear.</li>
<li><strong>Get</strong> —Click the Get button to query the FHIRcast context of the worklist client. </li>
<li><strong>Get</strong> — Choose datatype "PNG"  and change the actor to ID.  This will get the PNG image of the viewer display</li>
<li><strong>Publish ImagingStudy-close</strong> — Change the event type to ImagingStudy-close and click the Publish button. This will close the study in the viewer. </li>
</ol>
<p class="${style.instructionsFooter}">Hover the title to open. Tab to the title, then Tab once more to focus this panel for keyboard scrolling.</p>`;
}

function buildPageHtml() {
  return `<div class="${style.container}">
  <div class="${style.castHeader}"><div class="${
    style.headerSpacer
  }" aria-hidden="true"></div><div class="${
    style.headerTitleWrap
  }" tabindex="0" aria-label="Cast client instructions"><span class="${
    style.headerTitle
  }">IO module cast example</span><div class="${
    style.headerInstructionsPanel
  }" role="region" aria-label="Cast client instructions" tabindex="0">${headerInstructionsHtml()}</div></div><div class="${
    style.headerCenter
  }"><div id="connectionStatus" class="${style.status} ${style.statusHeader} ${
    style.disconnected
  }"><strong>Status:</strong> <span id="statusText">Not connected</span></div></div></div>
  <div class="${style.layout}">
  <div class="${style.controlGrid}">
  <div class="${style.connectionControls} ${style.section} ${style.panelCard}">
    <h2><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>Authenticate</h2>
    <div class="${style.grid} ${style.connectionControlsInnerGrid}">
      <div><label for="hubSelect">Hub</label><select id="hubSelect"><option value="local">3D Slicer local</option><option value="cloud" selected>3D Slicer cloud</option></select></div>
      <div class="${style.gridFullWidth}"><div class="${
    style.authTopicPair
  }"><button type="button" id="tokenBtn">Authenticate</button><button type="button" id="hubAdminPortalBtn" class="${
    style.headerTokenBtn
  }">Open Hub Admin Portal</button><div><label for="topicDisplay">Topic</label><div><input id="topicDisplay" type="text" spellcheck="false" autocomplete="off" /><button type="button" id="topicUpdateBtn">Update</button></div></div></div></div>
    </div>
  </div>
  <span class="${
    style.castHiddenEndpoint
  }"><div><label for="tokenEndpoint">auth endpoint</label><input id="tokenEndpoint" /></div></span>
  <div class="${style.section} ${style.panelCard}">
    <h2><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>Subscribe</h2>
    <div class="${style.grid}">
      <div class="${
        style.castHiddenEndpoint
      }"><label for="hubEndpoint">hub_endpoint</label><input id="hubEndpoint" /></div>
      <div><label for="subscriberName">Subscriber</label><input id="subscriberName" /></div>
      <div class="${style.subscribeEventsTopicActors}">
        <div><label for="events">Events</label><input id="events" value="*" /></div>
        <div><label for="topic">Topic</label><input id="topic" /></div>
        <div><label for="subscribeActors">Actors (JSON array)</label><input id="subscribeActors" class="${
          style.subscribeActorsJson
        }" type="text" spellcheck="false" value='${DEFAULT_SUBSCRIBE_ACTORS_JSON}' /></div>
      </div>
      <div class="${style.castHiddenEndpoint} ${
    style.gridFullWidth
  }"><label for="productName">client_product_name</label><input id="productName" value="VTKJS" /></div>
    </div>
    <div class="${style.actions} ${style.subscribeActions}">
      <div class="${style.subscribeActionButtons}">
        <button type="button" id="subscribeBtn" disabled>Subscribe</button>
        <button type="button" id="unsubscribeBtn" disabled>Unsubscribe</button>
      </div>
      <button type="button" id="startConferenceBtn" class="${style.startConferenceBtn}" disabled>Start a conference</button>
    </div>
  </div>
  <div class="${style.section} ${style.panelCard}">
    <h2><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>Publish</h2>
    <div class="${style.grid}">
      <div class="${style.publishEventTopicActorRow}">
        <div>
          <label for="eventType">Event type</label>
          <select id="eventType">
            <option value="ImagingStudy-open">ImagingStudy-open</option>
            <option value="dicom-send">DICOM-send</option>
            <option value="ImagingStudy-close">ImagingStudy-close</option>
            <option value="patient-open">patient-open</option>
            <option value="patient-close">patient-close</option>
            <option value="custom">Other (custom)</option>
          </select>
          <input id="eventTypeCustom" class="${
            style.eventTypeCustom
          }" placeholder="Custom event type" />
        </div>
        <div><label for="publishTopic">Topic</label><input id="publishTopic" /></div>
        <div><label for="publishActorPreset">Actor</label><select id="publishActorPreset"></select></div>
      </div>
    </div>
    <div id="eventDataRow">
      <label for="eventData">Event data JSON</label>
      <textarea id="eventData"></textarea>
    </div>
    <div class="${style.actions} ${style.publishActions}"><button id="publishBtn" disabled>Publish</button><span id="dicomFileLabel" class="${
    style.dicomFileLabel
  }">file: <span class="${
    style.dicomFileValue
  }">AI-Results-SEG.dcm</span></span><button type="button" id="openTopicViewerBtn" class="${style.openTopicViewerBtn}" disabled>Open a viewer with this topic</button></div>
  </div>
  <div class="${style.section} ${style.panelCard}">
    <h2><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Get</h2>
    <div class="${style.grid}">
      <div class="${
        style.castHiddenEndpoint
      }"><label for="getEndpoint">GET endpoint</label><input id="getEndpoint" /></div>
      <div class="${
        style.castHiddenEndpoint
      }"><label for="getSubscriber">Subscriber</label><input id="getSubscriber" /></div>
      <div class="${style.getDatatypeTopicActorRow}">
        <div><label for="getDataType">DataType</label><select id="getDataType"><option value="FHIRcastContext" selected>FHIRcastContext</option><option value="DICOM">DICOM</option><option value="PNG">PNG</option><option value="JPG">JPG</option><option value="SCENEVIEW">SCENEVIEW</option><option value="TRANSFORM">TRANSFORM</option></select></div>
        <div><label for="getTopic">Topic</label><input id="getTopic" /></div>
        <div><label for="getActorPreset">Actor</label><select id="getActorPreset"></select></div>
      </div>
    </div>
    <div id="getResults"></div>
    <div class="${
      style.actions
    }"><button id="getBtn" disabled>Get</button></div>
  </div>
  <div class="${style.section} ${
    style.logsSection
  }"><h2>Messages received <span id="messageCount" class="${
    style.messageCount
  }">(0)</span></h2><div class="${
    style.actions
  }"><button id="clearBtn">Clear Messages</button></div><div id="messages" class="${
    style.messages
  }"></div></div>
  </div>
  </div>`;
}

function byId(id) {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing #${id}`);
  }
  return found;
}

function fillActorPresetSelect(select, firstOption) {
  select.replaceChildren();
  if (firstOption) {
    const head = document.createElement('option');
    head.value = firstOption.value;
    head.textContent = firstOption.label;
    if (firstOption.title) {
      head.title = firstOption.title;
    }
    select.append(head);
  }
  ACTOR_PRESETS.forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.keyword;
    option.textContent = preset.keyword;
    option.title = `${preset.name}\n\n${preset.description}`;
    select.append(option);
  });
}

function parseEvents(raw) {
  const value = raw.trim();
  if (!value) {
    return ['*'];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseSubscribeActorsList(raw) {
  const value = raw.trim();
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) =>
          typeof item === 'string' ? item.trim() : JSON.stringify(item)
        )
        .filter(Boolean);
    }
    return [
      typeof parsed === 'string' ? parsed.trim() : JSON.stringify(parsed),
    ].filter(Boolean);
  } catch (err) {
    return value
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
}

function parseActorField(raw) {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch (err) {
    return value;
  }
}

async function buildDicomSendContext() {
  const dicomUrl = new URL('./ai-result.dcm', import.meta.url);
  const response = await fetch(dicomUrl.toString());
  if (!response.ok) {
    throw new Error(`Failed to load ai-result.dcm (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return [
    {
      key: 'dicom',
      resource: {
        fileName: 'ai-result.dcm',
        mimeType: 'application/dicom',
        data: arrayBuffer,
      },
    },
  ];
}

function addMessage(el, state, kind, label, payload) {
  const line = document.createElement('div');
  line.className = `${style.msg} ${MESSAGE_KIND_CLASS[kind]}`;
  const ts = new Date().toLocaleTimeString();
  line.textContent = `${label} - ${ts}\n${
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  }`;
  el.messages.insertBefore(line, el.messages.firstChild);
  state.messageCount += 1;
  el.messageCount.textContent = `(${state.messageCount})`;
}

function setConnection(el, status, text) {
  const statusClass = CONNECTION_STATUS_CLASS[status] || style.disconnected;
  el.connectionStatus.className = `${style.status} ${style.statusHeader} ${statusClass}`;
  el.statusText.textContent = text;
}

function applyWebsocketStatus(el, wsState) {
  switch (wsState) {
    case 'connecting':
      setConnection(el, 'connecting', 'Websocket connecting');
      break;
    case 'connected':
      setConnection(el, 'connected', 'Websocket connected');
      break;
    case 'error':
      setConnection(el, 'error', 'Websocket error');
      break;
    case 'disconnected':
    default:
      setConnection(el, 'disconnected', 'Websocket disconnected');
      break;
  }
}

function applyHubPreset(el, state, hubKey) {
  const hubDef = HUB_DEFINITIONS[hubKey];
  el.hubEndpoint.value = hubDef.hubEndpoint;
  el.tokenEndpoint.value = hubDef.authEndpoint;
  el.productName.value = hubDef.product_name;
  state.selectedClientId = hubDef.client_id;
  state.selectedClientSecret = hubDef.client_secret;
  try {
    const hubUrl = new URL(el.hubEndpoint.value.trim());
    el.getEndpoint.value = `${hubUrl.origin}/api/hub/cast-request`;
  } catch (err) {
    // noop
  }
}

function buildHubConfig(el, state) {
  return {
    name: 'demo',
    version: '1',
    hub_endpoint: el.hubEndpoint.value.trim(),
    token_endpoint: el.tokenEndpoint.value.trim(),
    client_id: state.selectedClientId || undefined,
    client_secret: state.selectedClientSecret || undefined,
  };
}

function buildSessionConfig(el) {
  const actorsList = parseSubscribeActorsList(el.subscribeActors.value);
  return {
    subscriberName: el.subscriberName.value.trim() || undefined,
    actors: actorsList.length ? actorsList : undefined,
    topic: el.topic.value.trim(),
    events: parseEvents(el.events.value),
    lease: 7200,
  };
}

function ensureClient(el, state, recreate = false) {
  if (!state.client || recreate) {
    if (state.client) {
      state.client.destroy();
    }
    state.client = vtkCastClient.newInstance({
      hub: buildHubConfig(el, state),
      session: buildSessionConfig(el),
      productName: el.productName.value.trim() || 'VTKJS',
      callbackUrl: `${window.location.origin}/castCallback`,
      autoReconnect: true,
    });
    state.client.onMessage((message) => {
      addMessage(el, state, 'received', 'Received', message);
    });
    state.client.onConnectionStateChange((wsState) => {
      applyWebsocketStatus(el, wsState);
      if (wsState === 'connected') {
        el.subscribeBtn.disabled = true;
        el.unsubscribeBtn.disabled = false;
        el.startConferenceBtn.disabled = false;
        el.openTopicViewerBtn.disabled = false;
        el.publishBtn.disabled = false;
        el.getBtn.disabled = false;
      } else if (wsState === 'disconnected' || wsState === 'error') {
        el.subscribeBtn.disabled = false;
        el.unsubscribeBtn.disabled = true;
        el.startConferenceBtn.disabled = true;
        el.openTopicViewerBtn.disabled = true;
        el.publishBtn.disabled = true;
        el.getBtn.disabled = true;
      }
    });
  }
  state.client.setTopic(el.topic.value.trim());
  return state.client;
}

async function handleToken(el, state) {
  setConnection(el, 'connecting', 'Getting token');
  try {
    const castClient = ensureClient(el, state, true);
    const tokenFormData = new URLSearchParams();
    tokenFormData.append('client_id', state.selectedClientId || '');
    tokenFormData.append('grant_type', 'client_credentials');
    tokenFormData.append('client_secret', state.selectedClientSecret || '');
    tokenFormData.append(
      'client_product_name',
      el.productName.value.trim() || 'VTKJS'
    );
    const response = await fetch(el.tokenEndpoint.value.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenFormData,
    });
    let ok = false;
    if (response.ok) {
      const data = await response.json();
      castClient.setToken(data.access_token || '');
      if (typeof data.subscriber_name === 'string' && data.subscriber_name) {
        castClient.setSubscriberName(data.subscriber_name);
      }
      if (typeof data.topic === 'string' && data.topic) {
        castClient.setTopic(data.topic);
      }
      ok = Boolean(castClient.getConnectionState().token);
    }
    el.subscribeBtn.disabled = !ok;
    if (!ok) {
      setConnection(el, 'disconnected', 'Token failed');
      addMessage(el, state, 'err', 'Token error', 'Failed to get token');
      return;
    }
    setConnection(el, 'token-ready', 'Token ready');
    const session = castClient.getSessionConfig();
    if (session.subscriberName) {
      el.subscriberName.value = session.subscriberName;
      el.getSubscriber.value = session.subscriberName;
    }
    if (session.topic) {
      el.topic.value = session.topic;
      el.publishTopic.value = session.topic;
      el.getTopic.value = session.topic;
      el.topicDisplay.value = session.topic;
    }
    addMessage(el, state, 'received', 'Token', 'Token obtained');
  } catch (error) {
    el.subscribeBtn.disabled = true;
    setConnection(el, 'disconnected', 'Token error');
    addMessage(el, state, 'err', 'Token exception', String(error));
  }
}

async function handleSubscribe(el, state) {
  const castClient = ensureClient(el, state);
  const result = await castClient.subscribe();
  if (result === 202) {
    addMessage(el, state, 'sent', 'Subscribe', {
      topic: el.topic.value.trim(),
    });
    return;
  }
  setConnection(el, 'disconnected', `Subscribe failed (${String(result)})`);
}

async function handleUnsubscribe(el, state) {
  if (!state.client) {
    return;
  }
  await state.client.unsubscribe();
  el.unsubscribeBtn.disabled = true;
  el.startConferenceBtn.disabled = true;
  el.openTopicViewerBtn.disabled = true;
  el.publishBtn.disabled = true;
  el.getBtn.disabled = true;
  el.subscribeBtn.disabled = false;
  setConnection(el, 'disconnected', 'Websocket disconnected');
}

async function handlePublish(el, state) {
  if (!state.client) {
    addMessage(el, state, 'err', 'Publish error', 'Subscribe first');
    return;
  }
  const eventType =
    el.eventType.value === 'custom'
      ? el.eventTypeCustom.value.trim()
      : el.eventType.value;
  if (!eventType) {
    addMessage(el, state, 'err', 'Publish error', 'Event type required');
    return;
  }
  let context = [];
  if (eventType === 'dicom-send') {
    try {
      context = await buildDicomSendContext();
    } catch (err) {
      addMessage(
        el,
        state,
        'err',
        'Publish error',
        err instanceof Error ? err.message : 'Failed to load ai-result.dcm'
      );
      return;
    }
  } else {
    try {
      context = JSON.parse(el.eventData.value || '[]');
    } catch (err) {
      addMessage(el, state, 'err', 'Publish error', 'Invalid Event Data JSON');
      return;
    }
  }
  const payload = {
    event: {
      'hub.topic': el.publishTopic.value.trim(),
      'hub.event': eventType,
      context,
    },
  };
  const actorValue = parseActorField(el.publishActorPreset.value.trim());
  if (actorValue !== undefined) {
    payload.actor = actorValue;
  }
  try {
    const res = await state.client.publish(payload);
    if (res && res.ok) {
      addMessage(el, state, 'sent', 'Publish', payload);
      return;
    }
    addMessage(
      el,
      state,
      'err',
      'Publish error',
      res ? `HTTP ${res.status}` : 'No response'
    );
  } catch (err) {
    addMessage(
      el,
      state,
      'err',
      'Publish error',
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function handleGet(el, state) {
  const subscriber = el.getSubscriber.value.trim();
  if (!subscriber) {
    addMessage(el, state, 'err', 'Get error', 'Subscriber is required');
    return;
  }
  const endpoint = el.getEndpoint.value.trim();
  const url = new URL(endpoint);
  const payload = {
    subscriber,
  };
  const getTopic = el.getTopic.value.trim();
  if (getTopic) {
    payload.topic = getTopic;
  }
  const dataType = el.getDataType.value;
  if (dataType) {
    payload.dataType = dataType;
  }
  const getActorRaw = el.getActorPreset.value.trim();
  if (getActorRaw) {
    payload.actor = getActorRaw;
  }
  const token = state.client?.getConnectionState?.().token?.trim() || '';
  if (!token) {
    addMessage(el, state, 'err', 'Get error', 'Token is required');
    return;
  }
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (response.ok) {
    await response.json();
    el.getResults.innerHTML = `<div class="${style.status} ${style.success}">Response received.</div>`;
    addMessage(el, state, 'received', 'Get', 'Response received.');
    return;
  }
  const text = await response.text();
  el.getResults.innerHTML = '';
  addMessage(el, state, 'err', 'Get error', `${response.status} ${text}`);
}

function boot() {
  document.documentElement.classList.add(style.castExampleHtml);
  document.body.classList.add(style.castExampleBody);
  /* Inline + important so black wins when embedded (e.g. viewer shell overrides body). */
  document.documentElement.style.setProperty(
    'background-color',
    '#000',
    'important'
  );
  document.body.style.setProperty('background-color', '#000', 'important');
  const root = document.createElement('div');
  root.className = style.cast;
  root.innerHTML = buildPageHtml();
  const mountNode = document.getElementById('vtk-root') || document.body;
  mountNode.replaceChildren(root);

  const el = {
    tokenEndpoint: byId('tokenEndpoint'),
    hubEndpoint: byId('hubEndpoint'),
    hubSelect: byId('hubSelect'),
    subscriberName: byId('subscriberName'),
    subscribeActors: byId('subscribeActors'),
    topic: byId('topic'),
    events: byId('events'),
    productName: byId('productName'),
    publishTopic: byId('publishTopic'),
    publishActorPreset: byId('publishActorPreset'),
    eventType: byId('eventType'),
    eventTypeCustom: byId('eventTypeCustom'),
    eventData: byId('eventData'),
    eventDataRow: byId('eventDataRow'),
    getEndpoint: byId('getEndpoint'),
    getSubscriber: byId('getSubscriber'),
    getTopic: byId('getTopic'),
    getActorPreset: byId('getActorPreset'),
    getDataType: byId('getDataType'),
    subscribeBtn: byId('subscribeBtn'),
    unsubscribeBtn: byId('unsubscribeBtn'),
    startConferenceBtn: byId('startConferenceBtn'),
    openTopicViewerBtn: byId('openTopicViewerBtn'),
    publishBtn: byId('publishBtn'),
    dicomFileLabel: byId('dicomFileLabel'),
    getBtn: byId('getBtn'),
    tokenBtn: byId('tokenBtn'),
    hubAdminPortalBtn: byId('hubAdminPortalBtn'),
    clearBtn: byId('clearBtn'),
    messages: byId('messages'),
    statusText: byId('statusText'),
    connectionStatus: byId('connectionStatus'),
    topicDisplay: byId('topicDisplay'),
    topicUpdateBtn: byId('topicUpdateBtn'),
    messageCount: byId('messageCount'),
    getResults: byId('getResults'),
  };

  const state = {
    client: null,
    messageCount: 0,
    selectedClientId: '',
    selectedClientSecret: '',
    defaultTopic:
      new URLSearchParams(window.location.search).get('topic') || '',
  };

  fillActorPresetSelect(el.publishActorPreset);
  fillActorPresetSelect(el.getActorPreset, {
    value: 'OpenIGTLink',
    label: 'OpenIGTLink',
    title: OPENIGT_LINK_ACTOR_TOOLTIP,
  });
  el.publishActorPreset.value = DEFAULT_ACTOR_KEYWORD;
  el.getActorPreset.value = DEFAULT_GET_ACTOR_KEYWORD;

  el.hubSelect.value = 'cloud';
  applyHubPreset(el, state, 'cloud');
  el.topic.value = state.defaultTopic;
  el.publishTopic.value = state.defaultTopic;
  el.subscriberName.value = DEFAULT_SUBSCRIBER_NAME;
  el.getSubscriber.value = DEFAULT_SUBSCRIBER_NAME;
  el.getTopic.value = state.defaultTopic;
  el.topicDisplay.value = state.defaultTopic;
  el.eventData.value = `[
  {
    "key": "study",
    "resource": {
      "resourceType": "ImagingStudy",
      "id": "e25c1d31-20a2-41f8-8d85-fe2fdeac74fd",
      "meta": {
        "profile": [
          "http://fhircast.hl7.org/StructureDefinition/fhircast-imaging-study-open"
        ]
      },
      "identifier": [
        {
          "system": "urn:dicom:uid",
          "value": "urn:oid:2.16.840.1.114362.1.11972228.22789312658.616067305.306.2"
        },
        {
          "type": {
            "coding": [
              {
                "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                "code": "ACSN"
              }
            ]
          }
        }
      ],
      "status" : "available",
      "subject" : {
        "reference" : "Patient/503824b8-fe8c-4227-b061-7181ba6c3926"
      }
    }
  }
]`;

  el.eventType.addEventListener('change', () => {
    el.eventTypeCustom.className =
      el.eventType.value === 'custom'
        ? `${style.eventTypeCustom} ${style.eventTypeCustomVisible}`
        : style.eventTypeCustom;
    el.eventDataRow.style.display =
      el.eventType.value === 'dicom-send' ? 'none' : '';
    el.dicomFileLabel.className =
      el.eventType.value === 'dicom-send'
        ? `${style.dicomFileLabel} ${style.dicomFileLabelVisible}`
        : style.dicomFileLabel;
    if (el.eventType.value === 'dicom-send') {
      el.publishActorPreset.value = DICOM_SEND_ACTOR_KEYWORD;
    } else {
      el.publishActorPreset.value = DEFAULT_ACTOR_KEYWORD;
    }
  });
  el.eventType.dispatchEvent(new Event('change'));

  el.topic.addEventListener('input', () => {
    const nextTopic = el.topic.value.trim();
    el.topicDisplay.value = nextTopic;
    el.publishTopic.value = nextTopic;
    el.getTopic.value = nextTopic;
  });

  el.topicUpdateBtn.addEventListener('click', () => {
    const topic = el.topicDisplay.value.trim();
    el.topic.value = topic;
    el.publishTopic.value = topic;
    el.getTopic.value = topic;
    if (state.client) {
      state.client.setTopic(topic);
    }
  });

  el.hubSelect.addEventListener('change', () => {
    applyHubPreset(el, state, el.hubSelect.value);
  });

  el.hubAdminPortalBtn.addEventListener('click', () => {
    try {
      if (el.hubSelect.value === 'local') {
        window.open(
          'http://localhost:2017/api/hub/admin',
          '_blank',
          'noopener,noreferrer'
        );
        return;
      }
      const base = el.hubEndpoint.value.trim();
      const hubBase = base.endsWith('/') ? base : `${base}/`;
      const url = new URL('admin', hubBase).href;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      addMessage(el, state, 'err', 'Hub Admin', 'Invalid hub_endpoint URL');
    }
  });

  el.startConferenceBtn.addEventListener('click', () => {
    try {
      const hubUrl = new URL(el.hubEndpoint.value.trim());
      const url = new URL('/api/hub/conference-client', hubUrl.origin);
      const subscriberName = el.subscriberName.value.trim();
      const topic = el.topic.value.trim();
      if (subscriberName) {
        url.searchParams.set('subscriberName', subscriberName);
      }
      if (topic) {
        url.searchParams.set('topic', topic);
      }
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch (err) {
      addMessage(el, state, 'err', 'Conference', 'Invalid hub_endpoint URL');
    }
  });

  el.openTopicViewerBtn.addEventListener('click', () => {
    const topic = el.topic.value.trim();
    const viewerBaseUrl =
      el.hubSelect.value === 'local'
        ? 'http://localhost:3000'
        : 'https://ohif-vtkjscastclient.d2lirbatw5joxv.amplifyapp.com';
    const url = new URL(viewerBaseUrl);
    if (topic) {
      url.searchParams.set('topic', topic);
    }
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  });

  el.tokenBtn.addEventListener('click', async () => handleToken(el, state));
  el.subscribeBtn.addEventListener('click', async () =>
    handleSubscribe(el, state)
  );
  el.unsubscribeBtn.addEventListener('click', async () =>
    handleUnsubscribe(el, state)
  );
  el.publishBtn.addEventListener('click', async () => handlePublish(el, state));
  el.getBtn.addEventListener('click', async () => handleGet(el, state));
  el.clearBtn.addEventListener('click', () => {
    el.messages.innerHTML = '';
    state.messageCount = 0;
    el.messageCount.textContent = '(0)';
  });

  window.addEventListener('beforeunload', () => {
    if (state.client) {
      state.client.destroy();
    }
  });
}

boot();
