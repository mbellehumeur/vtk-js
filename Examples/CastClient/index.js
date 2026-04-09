import '@kitware/vtk.js/favicon';

import vtkCastClient from 'vtk.js/Sources/IO/Core/CastClient';

const DEFAULT_ACTOR_KEYWORD = 'WORKLIST_CLIENT';
const DEFAULT_SUBSCRIBE_ACTORS_JSON = `["${DEFAULT_ACTOR_KEYWORD}","EC","WATCHER"]`;
const DEFAULT_GET_ACTOR_KEYWORD = 'WORKLIST_CLIENT';
const DEFAULT_SUBSCRIBER_NAME = 'CS3D';
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
    product_name: 'CS3D',
    client_id: 'client_id_3d_Slicer',
    client_secret: 'client_secret_3d_Slicer',
  },
  cloud: {
    hubEndpoint:
      'https://cast-hub-g6abetanhjesb6cx.westeurope-01.azurewebsites.net/api/hub',
    authEndpoint:
      'https://cast-hub-g6abetanhjesb6cx.westeurope-01.azurewebsites.net/oauth/token',
    product_name: 'CS3D',
    client_id: 'client_id_3d_Slicer',
    client_secret: 'client_secret_3d_Slicer',
  },
};

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
.cast { max-width: 1100px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.cast .container { background:#3d3d3d; border-radius:8px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,.5); color:#e0e0e0; }
.cast h2 { color:#e0e0e0; margin:0 0 12px; }
.cast .section { margin-top:20px; padding-bottom:16px; border-bottom:1px solid #555; }
.cast .section:last-child { border-bottom:none; }
.cast .grid { display:grid; grid-template-columns: repeat(2, minmax(220px,1fr)); gap:12px; }
.cast .section label,
.cast .cast-hidden-endpoint label { display:block; margin-bottom:6px; color:#b0b0b0; font-size:13px; }
.cast .section input,
.cast .section textarea,
.cast .section select,
.cast .cast-hidden-endpoint input,
.cast .cast-hidden-endpoint select { width:100%; box-sizing:border-box; border:1px solid #666; border-radius:4px; background:#4a4a4a; color:#e0e0e0; padding:9px 10px; font-size:13px; }
.cast .section textarea { min-height:110px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; resize:vertical; }
.cast .section input.subscribe-actors-json { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.cast .cast-hidden-endpoint { display:none !important; }
.cast .cast-header { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:16px; margin-bottom:0; }
.cast .header-title { font-size:1.75rem; font-weight:700; color:#e0e0e0; }
.cast .header-center { display:flex; justify-content:center; }
.cast .header-right { display:flex; align-items:center; gap:12px; justify-content:flex-end; }
.cast .header-token-btn { white-space:nowrap; }
.cast .connection-controls { padding:10px 0 16px; border-bottom:1px solid #555; margin-bottom:8px; }
.cast .connection-controls .grid { margin-top:0; }
.cast .auth-topic-pair { display:flex; gap:8px; align-items:flex-end; }
.cast .auth-topic-pair > div { flex:1 1 0; min-width:0; display:flex; flex-direction:column; }
.cast .auth-topic-pair > div > div { display:flex; gap:8px; }
.cast .auth-topic-pair > div > div > input { flex:1 1 0; min-width:0; width:auto; box-sizing:border-box; padding:9px 10px; font-size:13px; border:1px solid #666; border-radius:4px; background:#4a4a4a; color:#e0e0e0; }
.cast .auth-topic-pair button { flex-shrink:0; align-self:flex-end; }
.cast .subscribe-events-topic-actors,
.cast .publish-event-topic-actor-row,
.cast .get-datatype-topic-actor-row { grid-column:1/-1; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; align-items:start; }
.cast .status { padding:10px 12px; border-radius:4px; margin:12px 0; background:#4a4a4a; border-left:4px solid #777; }
.cast .status.status-header { margin:0; padding:10px 16px; font-size:1.1rem; line-height:1.4; border-left-width:4px; border-radius:6px; white-space:nowrap; }
.cast .status.status-header strong { font-weight:600; }
.cast .connected { border-left-color:#4CAF50; }
.cast .disconnected { border-left-color:#d32f2f; }
.cast .connecting { border-left-color:#ff9800; }
.cast .token-ready { border-left-color:#ff9800; }
.cast .success { border-left-color:#4CAF50; }
.cast .error { border-left-color:#ff9800; background:#5d4037; }
.cast .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
.cast .subscribe-actions { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; align-items:center; width:100%; margin-top:10px; }
.cast .subscribe-actions .subscribe-action-buttons { display:flex; flex-wrap:wrap; gap:10px; }
.cast button { padding:9px 14px; border:1px solid #666; border-radius:4px; background:#90A4AE; color:white; cursor:pointer; font-size:13px; }
.cast button:hover:not(:disabled){ background:#78909C; }
.cast button:disabled{ background:#3a3a3a; color:#777; border-color:#555; cursor:not-allowed; }
.cast .messages { margin-top:12px; max-height:380px; overflow:auto; background:#2b2b2b; border-radius:4px; padding:10px; font-size:12px; }
.cast .msg { border-left:3px solid #90A4AE; background:#3d3d3d; border-radius:4px; margin-bottom:8px; padding:8px; white-space:pre-wrap; word-break:break-word; }
.cast .msg.received { border-left-color:#4CAF50; }
.cast .msg.sent { border-left-color:#2196F3; }
.cast .msg.err { border-left-color:#d32f2f; background:#5d4037; }
`;
  document.head.appendChild(style);
}

function buildPageHtml() {
  return `<div class="container">
  <div class="cast-header"><span class="header-title">Cast client</span><div class="header-center"><div id="connectionStatus" class="status status-header disconnected"><strong>Status:</strong> <span id="statusText">Not connected</span></div></div><div class="header-right"><button type="button" id="hubAdminPortalBtn" class="header-token-btn">Hub Admin portal</button></div></div>
  <div class="connection-controls section">
    <h2>Authenticate</h2>
    <div class="grid">
      <div><label for="hubSelect">Hub</label><select id="hubSelect"><option value="local">3D Slicer local</option><option value="cloud" selected>3D Slicer cloud</option></select></div>
      <div style="grid-column:1/-1"><div class="auth-topic-pair"><button type="button" id="tokenBtn">Authenticate</button><div><label for="topicDisplay">Topic</label><div><input id="topicDisplay" type="text" spellcheck="false" autocomplete="off" /><button type="button" id="topicUpdateBtn">Update</button></div></div></div></div>
    </div>
  </div>
  <span class="cast-hidden-endpoint"><div><label for="tokenEndpoint">auth endpoint</label><input id="tokenEndpoint" /></div></span>
  <div class="section">
    <h2>Subscribe</h2>
    <div class="grid">
      <div class="cast-hidden-endpoint"><label for="hubEndpoint">hub_endpoint</label><input id="hubEndpoint" /></div>
      <div><label for="subscriberName">Subscriber</label><input id="subscriberName" /></div>
      <div class="subscribe-events-topic-actors">
        <div><label for="events">Events</label><input id="events" value="*" /></div>
        <div><label for="topic">Topic</label><input id="topic" /></div>
        <div><label for="subscribeActors">Actors (JSON array)</label><input id="subscribeActors" class="subscribe-actors-json" type="text" spellcheck="false" value='${DEFAULT_SUBSCRIBE_ACTORS_JSON}' /></div>
      </div>
      <div class="cast-hidden-endpoint" style="grid-column:1/-1"><label for="productName">client_product_name</label><input id="productName" value="CS3D" /></div>
    </div>
    <div class="actions subscribe-actions">
      <div class="subscribe-action-buttons">
        <button type="button" id="subscribeBtn" disabled>Subscribe</button>
        <button type="button" id="unsubscribeBtn" disabled>Unsubscribe</button>
      </div>
      <button type="button" id="openTopicViewerBtn" disabled>Open viewer with this topic</button>
    </div>
  </div>
  <div class="section">
    <h2>Publish</h2>
    <div class="grid">
      <div class="publish-event-topic-actor-row">
        <div>
          <label for="eventType">Event type</label>
          <select id="eventType">
            <option value="ImagingStudy-open">ImagingStudy-open</option>
            <option value="ImagingStudy-close">ImagingStudy-close</option>
            <option value="dicom-send">DICOM-send</option>
            <option value="patient-open">patient-open</option>
            <option value="patient-close">patient-close</option>
            <option value="custom">Other (custom)</option>
          </select>
          <input id="eventTypeCustom" placeholder="Custom event type" style="display:none;margin-top:8px" />
        </div>
        <div><label for="publishTopic">Topic</label><input id="publishTopic" /></div>
        <div><label for="publishActorPreset">Actor</label><select id="publishActorPreset"></select></div>
      </div>
    </div>
    <div id="eventDataRow">
      <label for="eventData">Event data JSON</label>
      <textarea id="eventData"></textarea>
    </div>
    <div class="actions"><button id="publishBtn" disabled>Publish</button></div>
  </div>
  <div class="section">
    <h2>Get</h2>
    <div class="grid">
      <div class="cast-hidden-endpoint"><label for="getEndpoint">GET endpoint</label><input id="getEndpoint" /></div>
      <div class="cast-hidden-endpoint"><label for="getSubscriber">Subscriber</label><input id="getSubscriber" /></div>
      <div class="get-datatype-topic-actor-row">
        <div><label for="getDataType">DataType</label><select id="getDataType"><option value="FHIRcastContext" selected>FHIRcastContext</option><option value="DICOM">DICOM</option><option value="SCENEVIEW">SCENEVIEW</option><option value="TRANSFORM">TRANSFORM</option></select></div>
        <div><label for="getTopic">Topic</label><input id="getTopic" /></div>
        <div><label for="getActorPreset">Actor</label><select id="getActorPreset"></select></div>
      </div>
    </div>
    <div id="getResults"></div>
    <div class="actions"><button id="getBtn" disabled>Get</button></div>
  </div>
  <div class="section"><h2>Messages received <span id="messageCount" style="font-weight:normal;color:#90A4AE">(0)</span></h2><div class="actions"><button id="clearBtn">Clear Messages</button></div><div id="messages" class="messages"></div></div>
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
  line.className = `msg ${kind}`;
  const ts = new Date().toLocaleTimeString();
  line.textContent = `${label} - ${ts}\n${
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  }`;
  el.messages.insertBefore(line, el.messages.firstChild);
  state.messageCount += 1;
  el.messageCount.textContent = `(${state.messageCount})`;
}

function setConnection(el, status, text) {
  el.connectionStatus.className = `status status-header ${status}`;
  el.statusText.textContent = text;
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
    el.getEndpoint.value = `${hubUrl.origin}/api/hub/cast-get`;
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
      productName: el.productName.value.trim() || 'CS3D',
      callbackUrl: `${window.location.origin}/castCallback`,
      autoReconnect: true,
    });
    state.client.onMessage((message) => {
      addMessage(el, state, 'received', 'Received', message);
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
      el.productName.value.trim() || 'CS3D'
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
  setConnection(el, 'connecting', 'Subscribing');
  const castClient = ensureClient(el, state);
  const result = await castClient.subscribe();
  if (result === 202) {
    setConnection(el, 'connected', 'Websocket connected');
    el.subscribeBtn.disabled = true;
    el.unsubscribeBtn.disabled = false;
    el.openTopicViewerBtn.disabled = false;
    el.publishBtn.disabled = false;
    el.getBtn.disabled = false;
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
  el.openTopicViewerBtn.disabled = true;
  el.publishBtn.disabled = true;
  el.getBtn.disabled = true;
  el.subscribeBtn.disabled = false;
  setConnection(el, 'disconnected', 'Not connected');
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
  url.searchParams.set('subscriber', subscriber);
  const getTopic = el.getTopic.value.trim();
  if (getTopic) {
    url.searchParams.set('topic', getTopic);
  }
  const dataType = el.getDataType.value;
  if (dataType) {
    url.searchParams.set('dataType', dataType);
  }
  const getActorRaw = el.getActorPreset.value.trim();
  if (getActorRaw) {
    url.searchParams.set('actor', getActorRaw);
  }
  const response = await fetch(url.toString(), { method: 'GET' });
  if (response.ok) {
    const json = await response.json();
    el.getResults.innerHTML = `<div class="status success"><pre>${JSON.stringify(
      json,
      null,
      2
    )}</pre></div>`;
    addMessage(el, state, 'received', 'Get', json);
    return;
  }
  const text = await response.text();
  el.getResults.innerHTML = '';
  addMessage(el, state, 'err', 'Get error', `${response.status} ${text}`);
}

function boot() {
  document.body.style.margin = '0';
  const root = document.createElement('div');
  root.className = 'cast';
  root.innerHTML = buildPageHtml();
  document.body.appendChild(root);
  injectStyles();

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
    openTopicViewerBtn: byId('openTopicViewerBtn'),
    publishBtn: byId('publishBtn'),
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
    el.eventTypeCustom.style.display =
      el.eventType.value === 'custom' ? 'block' : 'none';
    el.eventDataRow.style.display =
      el.eventType.value === 'dicom-send' ? 'none' : '';
    if (el.eventType.value === 'dicom-send') {
      el.publishActorPreset.value = DICOM_SEND_ACTOR_KEYWORD;
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
      const base = el.hubEndpoint.value.trim();
      const hubBase = base.endsWith('/') ? base : `${base}/`;
      const url = new URL('admin', hubBase).href;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      addMessage(el, state, 'err', 'Hub Admin', 'Invalid hub_endpoint URL');
    }
  });

  el.openTopicViewerBtn.addEventListener('click', () => {
    const topic = el.topic.value.trim();
    const url = new URL(
      'https://na-mic-pw45-hpe7f6crachve4ab.westeurope-01.azurewebsites.net/'
    );
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
