/**
 * @example
 * const client = vtkCastClient.newInstance({
 *   hub: {
 *     name: 'demo',
 *     version: '1',
 *     hub_endpoint: 'https://host/api/hub',
 *     authorization_endpoint: 'https://host/oauth/authorize',
 *     token_endpoint: 'https://host/oauth/token',
 *     client_id: 'client_id',
 *     client_secret: 'client_secret',
 *   },
 *   session: {
 *     events: ['*'],
 *     lease: 7200,
 *     subscriberName: 'VTKJS-WKLST',
 *     topic: 'my-topic',
 *   },
 *   autoReconnect: true,
 * });
 *
 * client.onMessage((message) => {
 *   console.log(message);
 * });
 *
 * const { user_name, code } = await client.authenticate();
 * const tokenOk = await client.getToken(code);
 * if (tokenOk) {
 *   await client.subscribe();
 *   await client.publish({
 *     event: {
 *       'hub.event': 'custom',
 *       'hub.topic': 'my-topic',
 *       context: [],
 *     },
 *   });
 *   await client.request({
 *     'subscriber.name': client.getSessionConfig().subscriberName,
 *     event: {
 *       'hub.topic': 'my-topic',
 *       'hub.event': 'fhircastcontext-request',
 *       context: { dataType: 'FHIRcastContext' },
 *     },
 *     'subscriber.actor': 'WORKLIST_CLIENT',
 *     'target.actor': 'WORKLIST_CLIENT',
 *   });
 * }
 */

import '@kitware/vtk.js/favicon';

import vtkCastClient, {
  generateSubscriberName,
} from 'vtk.js/Sources/IO/Core/CastClient';
import { isRequestEvent, requestEventFor } from '../eventNames';

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
const DEFAULT_SUBSCRIBE_EVENTS = 'imagingstudy-open,imagingstudy-close';
const DEFAULT_SUBSCRIBE_ACTORS_JSON = `["${DEFAULT_ACTOR_KEYWORD}"]`;
const DEFAULT_GET_ACTOR_KEYWORD = 'WORKLIST_CLIENT';
const DEFAULT_TARGET_ACTOR_KEYWORD = '*';
const DEFAULT_TARGET_PRODUCT = '*';
const TARGET_PRODUCT_PRESETS = ['*', 'VOLVIEW', 'OHIF', 'AIBRAIN'];
const DICOM_SEND_ACTOR_KEYWORD = 'EC';
const EMPTY_FHIRCAST_CONTEXT = {
  'context.type': '',
  context: [],
};
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

function escapeHtmlAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function formatIheActorsTooltip() {
  return ACTOR_PRESETS.map((actor) => `${actor.keyword} — ${actor.name}`).join(
    '\n'
  );
}

const IHE_ACTORS_LABEL_TITLE = ` title="${escapeHtmlAttr(
  formatIheActorsTooltip()
)}"`;

const HUB_DEFINITIONS = {
  volviewLocal: {
    hubEndpoint: 'http://127.0.0.1:4014/api/hub',
    authorizeEndpoint: 'http://127.0.0.1:4014/oauth/authorize',
    authEndpoint: 'http://127.0.0.1:4014/oauth/token',
    product_name: 'VTKJS-WKLST',
    product_version: '1.0',
    client_id: 'client_id_volview_server',
    client_secret: 'client_secret_volview_server',
  },
  volviewCloud: {
    hubEndpoint:
      'https://volview-server-with-hub-g2d9hcc5esahgxe8.westeurope-01.azurewebsites.net/api/hub',
    authorizeEndpoint:
      'https://volview-server-with-hub-g2d9hcc5esahgxe8.westeurope-01.azurewebsites.net/oauth/authorize',
    authEndpoint:
      'https://volview-server-with-hub-g2d9hcc5esahgxe8.westeurope-01.azurewebsites.net/oauth/token',
    product_name: 'VTKJS-WKLST',
    product_version: '1.0',
    client_id: 'client_id_volview_server',
    client_secret: 'client_secret_volview_server',
  },
  local: {
    hubEndpoint: 'http://127.0.0.1:2017/api/hub',
    authorizeEndpoint: 'http://127.0.0.1:2017/oauth/authorize',
    authEndpoint: 'http://127.0.0.1:2017/oauth/token',
    product_name: 'SLICER-HUB',
    product_version: '1.0',
    client_id: 'client_id_3d_Slicer',
    client_secret: 'client_secret_3d_Slicer',
  },
  cloud: {
    hubEndpoint:
      'https://cast-hub-g6abetanhjesb6cx.westeurope-01.azurewebsites.net/api/hub',
    authorizeEndpoint:
      'https://cast-hub-g6abetanhjesb6cx.westeurope-01.azurewebsites.net/oauth/authorize',
    authEndpoint:
      'https://cast-hub-g6abetanhjesb6cx.westeurope-01.azurewebsites.net/oauth/token',
    product_name: 'SLICERHUB',
    product_version: '1.0',
    client_id: 'client_id_3d_Slicer',
    client_secret: 'client_secret_3d_Slicer',
  },
};

function headerInstructionsHtml() {
  return `<p>This example demonstrate using the IO module cast client for IHE roles worklist client and evidence creator (EC).</p>
<ol>
<li><strong>Authenticate</strong> — Click the Authenticate button to request a user id and code.</li>
<li><strong>Authorize</strong> — Click the Authorize button to get an access token.</li>
<li><strong>Open the hub admin portal</strong> — Click Open the hub admin portal button to see the  subscriptions and messaging.</li>
<li><strong>Subscribe to the hub</strong> — Click the Subscribe button. This will also establish a websocket connection to receive events and requests for data.</li>
<li><strong>Publish ImagingStudy-open</strong> — Click the Publish button to send an ImagingStudy-open event to the hub.  You should see the message received in the hub and delivered to no one.</li>
<li><strong>Open a viewer</strong> — Click the Open a viewer button in the Subscribe section.  The viewer will automatically aget an access token, subscribe to the hub and request the context from the WORKLIST_CLIENT actors.  If a study is found, it is opened in the viewer.</li>
<li><strong>Publish AI results with DICOM-send</strong> — Change the event type to DICOM-send and click the Publish button. This will send a DICOM file to the viewer and the segmentation should appear.</li>
<li><strong>Request context from the worklist client</strong> —Click the Request button to query the context of the worklist client. </li>
<li><strong>Request an image from the viewer</strong> — Choose datatype to "JPGFULLSIZE" and change the actor to ID (Image Display). This will request the image of the selected viewport</li>
<li><strong>Test websocket reconnect</strong> — Click Reset server in the hub admin portal on the bottom right. Wait a few seconds and the websocket should reconnect and the status strip should show connected. Open an additional viewer, it should open with the current study even though the hub was restarted.</li>
<li><strong>Publish ImagingStudy-close</strong> — Change the event type to ImagingStudy-close and click the Publish button. This will close the study in the viewer. </li>
</ol>`;
}

function openInstructionsWindow() {
  const popupWidth = 900;
  const popupHeight = 700;
  const left = Math.max(0, Math.floor((window.screen.width - popupWidth) / 2));
  const top = Math.max(0, Math.floor((window.screen.height - popupHeight) / 2));
  const features = [
    'popup',
    `width=${popupWidth}`,
    `height=${popupHeight}`,
    `left=${left}`,
    `top=${top}`,
  ].join(',');
  const popup = window.open('', 'castInstructionsWindow', features);
  if (!popup) {
    return;
  }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>IO module worklist example</title>
<style>
  body {
    margin: 0;
    padding: 24px 28px;
    background: #1a1a1a;
    color: #eaeaea;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
  }
  h1 {
    margin: 0 0 16px;
    font-size: 1.4rem;
    color: #fff;
  }
  strong { color: #fff; }
  ol { margin: 0 0 0 1.2em; padding: 0; }
  li { margin-bottom: 12px; }
  li:last-child { margin-bottom: 0; }
  a { color: #6cb6ff; }
</style>
</head>
<body>
<h1>IO module worklist example</h1>
${headerInstructionsHtml()}
</body>
</html>`;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
}

function buildPageHtml() {
  return `<div class="${style.container}">
  <div class="${style.castHeader}"><div class="${
    style.headerTitleWrap
  }"><span class="${
    style.headerTitle
  }">IO module worklist example</span><button type="button" id="instructionsBtn" class="${
    style.instructionsBtn
  }" aria-label="Read me" title="Read me">Read me</button></div></div>
  <div class="${style.layout}">
  <div class="${style.controlGrid}">
  <div class="${style.connectionControls} ${style.section} ${style.panelCard}">
    <h2><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>Authenticate</h2>
    <div class="${style.grid} ${style.connectionControlsInnerGrid}">
      <div><label for="authSelect">Auth</label><div class="${
        style.hubAuthRow
      }"><select id="authSelect"><option value="hubTestAuth" selected>Hub test auth</option><option value="openIDConnect">OIDC</option><option value="other">Other</option></select><button type="button" id="authTokenBtn">Authenticate</button></div></div>
      <div class="${style.gridFullWidth}"></div>
      <div><label for="hubSelect">Hub</label><div class="${
        style.hubAuthRow
      }"><select id="hubSelect"><option value="volviewLocal">VolView server local</option><option value="volviewCloud" selected>VolView server cloud</option><option value="local">3D Slicer local</option><option value="cloud">3D Slicer cloud</option></select><button type="button" id="tokenBtn">Authorize</button></div><div class="${
    style.hubAdminPortalRow
  }"><button type="button" id="hubAdminPortalBtn" class="${
    style.hubAdminPortalBtn
  }" disabled>Open the hub admin portal</button></div></div>

    </div>
  </div>
  <span class="${
    style.castHiddenEndpoint
  }"><div><label for="authorizeEndpoint">authorize endpoint</label><input id="authorizeEndpoint" /></div><div><label for="tokenEndpoint">token endpoint</label><input id="tokenEndpoint" /></div></span>
  <div class="${style.section} ${style.panelCard}">
    <div class="${
      style.subscribeSectionHeader
    }"><h2><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>Subscribe</h2><div id="connectionStatus" class="${
    style.status
  } ${style.statusHeader} ${
    style.disconnected
  }"><strong>Status:</strong> <span id="statusText">Not connected</span></div></div>
    <div class="${style.grid}">
      <div class="${
        style.castHiddenEndpoint
      }"><label for="hubEndpoint">hub_endpoint</label><input id="hubEndpoint" /></div>
      <div class="${style.subscribeSubscriberProductRow}">
        <div><label for="subscriberName">Subscriber</label><input id="subscriberName" /></div>
        <div><label for="productName">Product Name</label><input id="productName" value="VTKJS-WKLST" /></div>
        <div><label for="productVersion">Version</label><input id="productVersion" value="1.0" /></div>
      </div>
      <div class="${style.subscribeEventsTopicActors}">
        <div><label for="events">Events</label><input id="events" value="${DEFAULT_SUBSCRIBE_EVENTS}" /></div>
        <div><label for="topic">Topic</label><input id="topic" /></div>
        <div><label for="subscribeActors"${IHE_ACTORS_LABEL_TITLE}>Actors</label><input id="subscribeActors" class="${
    style.subscribeActorsJson
  }" type="text" spellcheck="false" value='${DEFAULT_SUBSCRIBE_ACTORS_JSON}' /></div>
      </div>
    </div>
    <div class="${style.actions} ${style.subscribeActions}">
      <div class="${style.subscribeActionButtons}">
        <button type="button" id="subscribeBtn" disabled>Subscribe</button>
        <button type="button" id="unsubscribeBtn" disabled>Unsubscribe</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;"><button type="button" id="openTopicViewerBtn" class="${
        style.openTopicViewerBtn
      }" disabled>Open a viewer</button><select id="viewerSelect"><option value="volview" selected>VolView</option><option value="ohif">OHIF</option></select></div>
      <div class="${
        style.subscribeActionsEnd
      }"><button type="button" id="startConferenceBtn" class="${
    style.startConferenceBtn
  }" disabled>Start a conference</button></div>
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
            <option value="ImagingStudy-close">ImagingStudy-close</option>
            <option value="dicom-send">DICOM-send</option>
            <option value="patient-open">patient-open</option>
            <option value="patient-close">patient-close</option>
            <option value="custom">Other (custom)</option>
          </select>
          <input id="eventTypeCustom" class="${
            style.eventTypeCustom
          }" placeholder="Custom event type" />
        </div>
        <div><label for="publishActorPreset"${IHE_ACTORS_LABEL_TITLE}>Actor</label><select id="publishActorPreset"></select></div>
        <div><label for="publishTargetActorPreset">Target actor</label><select id="publishTargetActorPreset"></select></div>
        <div><label for="publishTargetProductName">Target product</label><select id="publishTargetProductName"></select></div>
      </div>
    </div>
    <div id="eventDataRow">
      <label for="eventData">Event data</label>
      <textarea id="eventData"></textarea>
    </div>
    <div id="dicomFileLabel" class="${
      style.dicomFileLabel
    }"><label for="dicomFileValue">File</label><div class="${
    style.dicomFilePickerRow
  }"><input id="dicomFileValue" class="${
    style.dicomFileValue
  }" value="AI-Results-SEG.dcm" readonly /><button type="button" id="chooseDicomFilesBtn">Choose files</button><button type="button" id="chooseDicomFoldersBtn">Choose folders</button><input id="dicomFilesInput" type="file" multiple class="${
    style.castHiddenEndpoint
  }" /><input id="dicomFoldersInput" type="file" webkitdirectory directory multiple class="${
    style.castHiddenEndpoint
  }" /></div></div>
    <div id="publishActions" class="${style.actions} ${
    style.publishActions
  }"><button id="publishBtn" disabled>Publish</button></div>
  </div>
  <div class="${style.section} ${style.panelCard}">
    <h2><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Request</h2>
    <div class="${style.grid}">
      <div class="${
        style.castHiddenEndpoint
      }"><label for="getSubscriber">Subscriber</label><input id="getSubscriber" /></div>
      <div class="${style.getDatatypeTopicActorRow}">
        <div><label for="getDataType">Data Type</label><select id="getDataType"><option value="FHIRcastContext" selected>FHIRcastContext</option><option value="DICOM">DICOM</option><option value="PNGFULLSIZE">PNGFULLSIZE</option><option value="PNGTHUMBNAIL">PNGTHUMBNAIL</option><option value="JPGFULLSIZE">JPGFULLSIZE</option><option value="JPGTHUMBNAIL">JPGTHUMBNAIL</option><option value="SCENEVIEW">SCENEVIEW</option><option value="TRANSFORM">TRANSFORM</option></select><div id="getDataTypeHint" class="${
          style.dataTypeHint || ''
        }" style="font-size:11px;opacity:0.7;margin-top:2px"></div></div>
        <div><label for="getActorPreset"${IHE_ACTORS_LABEL_TITLE}>Actor</label><select id="getActorPreset"></select></div>
        <div><label for="getTargetActorPreset">Target actor</label><select id="getTargetActorPreset"></select></div>
        <div><label for="getProductName">Target product</label><select id="getProductName"></select></div>
      </div>
    </div>
    <div id="getResponseRow">
      <label for="getResponseData">Response</label>
      <textarea id="getResponseData" readonly></textarea>
      <div id="getResponseSummary" style="margin-top:6px;font-size:12px;opacity:0.85"></div>
    </div>
    <div class="${style.actions} ${
    style.requestActions
  }"><button id="getBtn" disabled>Request</button><div id="retrievedImagesList" style="display:flex;gap:6px;flex-wrap:wrap"></div></div>
  </div>
  <div class="${style.section} ${style.panelCard} ${style.gridFullWidth}">
    <h2><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>Worklist Context</h2>
    <div id="worklistContextRow">
      <label for="worklistContextDisplay">Current context</label>
      <textarea id="worklistContextDisplay" readonly></textarea>
    </div>
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

function fillTargetActorPresetSelect(select, firstOption) {
  select.replaceChildren();
  const anyOption = document.createElement('option');
  anyOption.value = '*';
  anyOption.textContent = '*';
  anyOption.title = 'Any target (no destination filter)';
  select.append(anyOption);
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

function resolveTargetActorForWire(selectValue) {
  const text = String(selectValue || '').trim();
  if (!text || text === '*') {
    return undefined;
  }
  return text;
}

function fillTargetProductPresetSelect(select) {
  select.replaceChildren();
  TARGET_PRODUCT_PRESETS.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if (name === '*') {
      option.title = 'Any product (no destination filter)';
    }
    select.append(option);
  });
}

function resolveTargetProductNameForWire(inputValue) {
  const text = String(inputValue || '').trim();
  if (!text || text === '*') {
    return undefined;
  }
  return text;
}

function parseEvents(raw) {
  const value = (raw.trim() || DEFAULT_SUBSCRIBE_EVENTS).trim();
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

function getHubEventLower(event) {
  const rawEvent =
    event && typeof event['hub.event'] === 'string' ? event['hub.event'] : '';
  return rawEvent.toLowerCase();
}

function extractActorKeywords(actor) {
  if (actor == null) {
    return [];
  }
  if (typeof actor === 'string') {
    const keyword = actor.trim();
    return keyword ? [keyword] : [];
  }
  if (Array.isArray(actor)) {
    return actor.flatMap((entry) => extractActorKeywords(entry));
  }
  if (typeof actor === 'object') {
    const candidate = actor.id || actor.key || actor.name;
    if (candidate == null) {
      return [];
    }
    const keyword = String(candidate).trim();
    return keyword ? [keyword] : [];
  }
  const keyword = String(actor).trim();
  return keyword ? [keyword] : [];
}

function cloneContextArray(context) {
  return Array.isArray(context) ? context.map((item) => ({ ...item })) : [];
}

function formatWorklistContextForDisplay(state) {
  const ctx = cloneContextArray(state.lastImagingStudyOpenContext);
  if (!ctx.length) {
    return '[]';
  }
  return JSON.stringify(ctx, null, 2);
}

function updateWorklistContextDisplay(el, state) {
  if (el.worklistContextDisplay) {
    el.worklistContextDisplay.value = formatWorklistContextForDisplay(state);
  }
}

function updateFhircastContextState(el, state, eventType, context) {
  if (eventType.includes('close')) {
    state.lastImagingStudyOpenContext = [];
    updateWorklistContextDisplay(el, state);
    return;
  }
  if (eventType === 'imagingstudy-open') {
    state.lastImagingStudyOpenContext = cloneContextArray(context);
    updateWorklistContextDisplay(el, state);
  }
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

function handleIncomingGetRequest(el, state, message) {
  const event = message?.event;
  if (!event || !isRequestEvent(getHubEventLower(event))) {
    return false;
  }
  const context =
    event.context && typeof event.context === 'object' ? event.context : {};
  const correlationId = context.id;
  if (typeof correlationId !== 'string' || !correlationId) {
    return false;
  }

  const targetRaw = message['target.actor'];
  const requestedTargets = extractActorKeywords(targetRaw);
  if (
    requestedTargets.length > 0 &&
    !requestedTargets.includes('*') &&
    !requestedTargets.includes(DEFAULT_GET_ACTOR_KEYWORD)
  ) {
    return false;
  }

  // The example app only knows how to answer FHIRcastContext requests; ignore
  // image / dicom / sceneview requests so they can route elsewhere.
  if (context.dataType !== 'FHIRcastContext') {
    return false;
  }

  const responseData = state.lastImagingStudyOpenContext.length
    ? {
        'context.type': 'ImagingStudy',
        context: cloneContextArray(state.lastImagingStudyOpenContext),
      }
    : EMPTY_FHIRCAST_CONTEXT;

  state.client.sendCastRequestResponse(
    correlationId,
    context.dataType,
    responseData,
    event['hub.topic']
  );
  addMessage(el, state, 'sent', 'Get response', {
    id: correlationId,
    dataType: context.dataType,
    responseData,
  });
  return true;
}

function isCastImageBinaryNode(node) {
  return (
    node &&
    typeof node === 'object' &&
    typeof node.contentType === 'string' &&
    typeof node.data === 'string' &&
    /^image\/(png|jpeg)$/i.test(node.contentType.trim())
  );
}

/** Every binary PNG/JPEG blob found in ``payload`` (breadth-first walk). */
function findAllImageResources(payload) {
  const results = [];
  if (!payload || typeof payload !== 'object') {
    return results;
  }

  const queue = [payload];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      // eslint-disable-next-line no-continue
      continue;
    }
    if (isCastImageBinaryNode(current)) {
      results.push({
        contentType: current.contentType.trim().toLowerCase(),
        data: current.data.trim(),
      });
    }
    if (Array.isArray(current)) {
      current.forEach((item) => {
        if (item && typeof item === 'object') {
          queue.push(item);
        }
      });
    } else {
      Object.keys(current)
        .sort()
        .forEach((key) => {
          const value = current[key];
          if (value && typeof value === 'object') {
            queue.push(value);
          }
        });
    }
  }

  return results;
}

function imageToObjectUrl(contentType, base64Data) {
  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: contentType });
    return URL.createObjectURL(blob);
  } catch (err) {
    return '';
  }
}

function getDefaultDicomSendFileName(viewer) {
  return viewer === 'volview'
    ? 'AI-result-volview.dcm'
    : 'ai-results-mrbrain.dcm';
}

async function buildDicomSendContext(viewer) {
  const dicomUrl = new URL('./ai-results-mrbrain.dcm', import.meta.url);
  const response = await fetch(dicomUrl.toString());
  if (!response.ok) {
    throw new Error(
      `Failed to load ai-results-mrbrain.dcm (${response.status})`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  const fileName = getDefaultDicomSendFileName(viewer);
  return [
    {
      key: 'dicom',
      resource: {
        fileName,
        mimeType: 'application/dicom',
        data: arrayBuffer,
      },
    },
  ];
}

function setConnection(el, status, text) {
  const statusClass = CONNECTION_STATUS_CLASS[status] || style.disconnected;
  el.connectionStatus.className = `${style.status} ${style.statusHeader} ${statusClass}`;
  el.statusText.textContent = text;
}

function getHubLabel(hubKey) {
  return HUB_DEFINITIONS[hubKey]?.label || 'Hub';
}

function applyWebsocketStatus(el, wsState) {
  switch (wsState) {
    case 'connecting':
      setConnection(el, 'connecting', 'Websocket connecting');
      break;
    case 'connected':
      setConnection(
        el,
        'connected',
        `${getHubLabel(el.hubSelect.value)} connected`
      );
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
  el.authorizeEndpoint.value = hubDef.authorizeEndpoint || '';
  el.tokenEndpoint.value = hubDef.authEndpoint;
  el.productName.value = hubDef.product_name;
  el.productVersion.value = hubDef.product_version || '1.0';
  state.selectedClientId = hubDef.client_id;
  state.selectedClientSecret = hubDef.client_secret;
}

function buildHubConfig(el, state) {
  return {
    name: 'demo',
    version: el.productVersion.value.trim() || '1.0',
    hub_endpoint: el.hubEndpoint.value.trim(),
    authorization_endpoint: el.authorizeEndpoint.value.trim(),
    token_endpoint: el.tokenEndpoint.value.trim(),
    client_id: state.selectedClientId || undefined,
    client_secret: state.selectedClientSecret || undefined,
  };
}

function buildSessionConfig(el) {
  const actorsList = parseSubscribeActorsList(el.subscribeActors.value);
  return {
    subscriberName: el.subscriberName.value.trim() || undefined,
    productName: el.productName.value.trim() || 'VTKJS-WKLST',
    productVersion: el.productVersion.value.trim() || '1.0',
    actors: actorsList.length ? actorsList : undefined,
    topic: el.topic.value.trim(),
    events: parseEvents(el.events.value),
    lease: 7200,
    defaultTargetActor: DEFAULT_TARGET_ACTOR_KEYWORD,
  };
}

function ensureClient(el, state, recreate = false) {
  if (!state.client || recreate) {
    if (state.client) {
      state.client.delete();
    }
    state.client = vtkCastClient.newInstance({
      hub: buildHubConfig(el, state),
      session: buildSessionConfig(el),
      callbackUrl: `${window.location.origin}/castCallback`,
      autoReconnect: true,
    });
    state.client.onMessage((message) => {
      handleIncomingGetRequest(el, state, message);
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

async function handleAuthenticate(el, state) {
  setConnection(el, 'connecting', 'Authenticating');
  el.tokenBtn.disabled = true;
  el.subscribeBtn.disabled = true;
  el.hubAdminPortalBtn.disabled = true;
  try {
    const castClient = ensureClient(el, state, true);
    const result = await castClient.authenticate();
    const userName = result?.user_name || '';
    const code = result?.code || '';
    state.lastAuthUserName = userName;
    state.lastAuthCode = code;
    if (!code) {
      setConnection(el, 'disconnected', 'Authenticate failed');
      addMessage(el, state, 'err', 'Authenticate error', 'No code returned');
      return;
    }
    el.tokenBtn.disabled = false;
    setConnection(el, 'token-ready', `${userName} code obtained`);
    addMessage(el, state, 'received', 'Authenticated', {
      user_name: userName,
      code,
    });
  } catch (error) {
    state.lastAuthCode = '';
    el.tokenBtn.disabled = true;
    setConnection(el, 'disconnected', 'Authenticate failed');
    addMessage(
      el,
      state,
      'err',
      'Authenticate exception',
      String(error?.message || error)
    );
  }
}

async function handleGetToken(el, state) {
  if (!state.lastAuthCode) {
    addMessage(
      el,
      state,
      'err',
      'Authorize error',
      'Click Authenticate first.'
    );
    return;
  }
  setConnection(el, 'connecting', 'Getting token');
  const castClient = state.client;
  if (!castClient) {
    addMessage(
      el,
      state,
      'err',
      'Authorize error',
      'No client available; click Authenticate first.'
    );
    return;
  }
  const code = state.lastAuthCode;
  state.lastAuthCode = ''; // single-use; force re-authenticate to get a new one
  el.tokenBtn.disabled = true;
  try {
    const ok = await castClient.getToken(code);
    if (!ok) {
      el.subscribeBtn.disabled = true;
      el.hubAdminPortalBtn.disabled = true;
      setConnection(el, 'disconnected', 'Token failed');
      addMessage(el, state, 'err', 'Token error', 'Failed to get token');
      return;
    }
    el.subscribeBtn.disabled = false;
    el.hubAdminPortalBtn.disabled = false;
    setConnection(el, 'token-ready', 'Access token ready');
    const session = castClient.getSessionConfig();
    if (session.subscriberName) {
      el.subscriberName.value = session.subscriberName;
      el.getSubscriber.value = session.subscriberName;
    }
    if (session.topic) {
      el.topic.value = session.topic;
    }
    addMessage(el, state, 'received', 'Token', 'Token obtained');
  } catch (error) {
    el.subscribeBtn.disabled = true;
    el.hubAdminPortalBtn.disabled = true;
    setConnection(el, 'disconnected', 'Token error');
    addMessage(
      el,
      state,
      'err',
      'Token exception',
      String(error?.message || error)
    );
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
      context = await buildDicomSendContext(el.viewerSelect.value);
    } catch (err) {
      addMessage(
        el,
        state,
        'err',
        'Publish error',
        err instanceof Error
          ? err.message
          : 'Failed to load ai-results-mrbrain.dcm'
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
      'hub.topic': el.topic.value.trim(),
      'hub.event': eventType,
      context,
    },
  };
  const actorValue = parseActorField(el.publishActorPreset.value.trim());
  if (actorValue !== undefined) {
    payload.actor = actorValue;
  }
  const targetActorValue = resolveTargetActorForWire(
    el.publishTargetActorPreset.value
  );
  if (targetActorValue) {
    payload['target.actor'] = targetActorValue;
  }
  const targetProductValue = resolveTargetProductNameForWire(
    el.publishTargetProductName ? el.publishTargetProductName.value : ''
  );
  if (targetProductValue) {
    payload['target.product.name'] = targetProductValue;
  }
  try {
    const res = await state.client.publish(payload);
    if (res && res.ok) {
      updateFhircastContextState(el, state, eventType.toLowerCase(), context);
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

function clearRetrievedImages(el, state) {
  if (Array.isArray(state.retrievedImages)) {
    state.retrievedImages.forEach((entry) => {
      if (entry && entry.url) {
        URL.revokeObjectURL(entry.url);
      }
    });
  }
  state.retrievedImages = [];
  if (el && el.retrievedImagesList) {
    el.retrievedImagesList.replaceChildren();
  }
}

function renderRetrievedImageButtons(el, state) {
  if (!el || !el.retrievedImagesList) {
    return;
  }
  el.retrievedImagesList.replaceChildren();
  state.retrievedImages.forEach((entry) => {
    if (!entry || !entry.url) {
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.disabled = false;
    btn.textContent = entry.label;
    btn.title = entry.subscriber || '';
    btn.addEventListener('click', () => {
      window.open(entry.url, '_blank', 'noopener,noreferrer');
    });
    el.retrievedImagesList.appendChild(btn);
  });
}

async function handleCastRequest(el, state) {
  if (!state.client) {
    addMessage(el, state, 'err', 'Request error', 'Client not started');
    return;
  }
  clearRetrievedImages(el, state);
  if (el.getResponseSummary) el.getResponseSummary.textContent = '';

  const targetProductInput = el.getProductName
    ? el.getProductName.value.trim()
    : '';

  let result;
  try {
    const dataTypeToken = (el.getDataType.value || '').trim();
    const hubEvent = requestEventFor(dataTypeToken);
    if (!hubEvent) {
      addMessage(el, state, 'err', 'Request error', 'Select a data type');
      return;
    }
    const requestEvent = {
      'hub.event': hubEvent,
      'hub.topic': el.topic.value.trim(),
    };
    if (dataTypeToken) {
      requestEvent.context = { dataType: dataTypeToken };
    }
    const requestArgs = {
      'subscriber.name': el.getSubscriber.value.trim(),
      event: requestEvent,
      'subscriber.actor': el.getActorPreset.value.trim() || undefined,
    };
    const targetProductValue =
      resolveTargetProductNameForWire(targetProductInput);
    if (targetProductValue) {
      requestArgs['target.product.name'] = targetProductValue;
    }
    const targetActorValue = resolveTargetActorForWire(
      el.getTargetActorPreset.value
    );
    if (targetActorValue) {
      requestArgs['target.actor'] = targetActorValue;
    }
    result = await state.client.request(requestArgs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    el.getResponseData.value = msg;
    addMessage(el, state, 'err', 'Request error', msg);
    return;
  }

  const responseText =
    typeof result.data === 'string'
      ? result.data
      : JSON.stringify(result.data, null, 2);
  el.getResponseData.value = responseText;

  if (!result.ok) {
    addMessage(
      el,
      state,
      'err',
      'Request error',
      `${result.status} ${responseText}`
    );
    return;
  }

  // New collated reply: { responses: [{ id, subscriber, actor, productName, data }], expected, missing, timedOut }
  const envelope =
    result.data && typeof result.data === 'object' ? result.data : {};
  const responses = Array.isArray(envelope.responses) ? envelope.responses : [];
  const expected = Array.isArray(envelope.expected) ? envelope.expected : [];
  const missing = Array.isArray(envelope.missing) ? envelope.missing : [];

  if (el.getResponseSummary) {
    const parts = [
      `responses: ${responses.length}/${expected.length || responses.length}`,
    ];
    if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
    if (envelope.timedOut) parts.push('timedOut');
    el.getResponseSummary.textContent = parts.join(' | ');
  }

  // Build one button per image in each response payload. A single response
  // can embed several Binary image resources; collated replies can add one
  // set per responder.
  const collected = [];
  responses.forEach((item, idx) => {
    const subscriber = (item && item.subscriber) || `responder-${idx + 1}`;
    const productName = (item && item.productName) || '';
    const shortId =
      item && typeof item.id === 'string' && item.id.trim()
        ? item.id.trim().slice(0, 8)
        : '';
    const images = findAllImageResources(item && item.data);
    images.forEach((imageResource, imgIdx) => {
      const url = imageToObjectUrl(
        imageResource.contentType,
        imageResource.data
      );
      if (!url) {
        return;
      }
      const part = images.length > 1 ? ` #${imgIdx + 1}/${images.length}` : '';
      const suffix = shortId ? ` [${shortId}]` : '';
      const label =
        productName !== ''
          ? `Open image: ${subscriber}${suffix} (${productName})${part}`
          : `Open image: ${subscriber}${suffix}${part}`;
      collected.push({ url, subscriber, productName, label });
    });
  });
  if (collected.length === 0) {
    const legacyImages = findAllImageResources(result.data);
    legacyImages.forEach((imageResource, imgIdx) => {
      const url = imageToObjectUrl(
        imageResource.contentType,
        imageResource.data
      );
      if (!url) {
        return;
      }
      const part =
        legacyImages.length > 1 ? ` #${imgIdx + 1}/${legacyImages.length}` : '';
      collected.push({
        url,
        subscriber: '',
        productName: '',
        label: `Open retrieved image${part}`,
      });
    });
  }
  state.retrievedImages = collected;
  renderRetrievedImageButtons(el, state);

  if (responses.length === 0) {
    addMessage(
      el,
      state,
      envelope.timedOut ? 'err' : 'received',
      'Request',
      envelope.timedOut
        ? `Timed out. Missing: ${missing.join(', ') || '(unknown)'}`
        : 'No responders matched this request.'
    );
  } else {
    addMessage(el, state, 'received', 'Request', {
      id: envelope.id,
      received: responses.length,
      expected: expected.length,
      missing,
      timedOut: !!envelope.timedOut,
      responders: responses.map((r) => ({
        subscriber: r && r.subscriber,
        actor: r && r.actor,
        productName: r && r.productName,
      })),
    });
  }
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
    authSelect: byId('authSelect'),
    authorizeEndpoint: byId('authorizeEndpoint'),
    tokenEndpoint: byId('tokenEndpoint'),
    hubEndpoint: byId('hubEndpoint'),
    hubSelect: byId('hubSelect'),
    subscriberName: byId('subscriberName'),
    subscribeActors: byId('subscribeActors'),
    topic: byId('topic'),
    events: byId('events'),
    productName: byId('productName'),
    productVersion: byId('productVersion'),
    publishActorPreset: byId('publishActorPreset'),
    publishTargetActorPreset: byId('publishTargetActorPreset'),
    publishTargetProductName: byId('publishTargetProductName'),
    eventType: byId('eventType'),
    eventTypeCustom: byId('eventTypeCustom'),
    eventData: byId('eventData'),
    eventDataRow: byId('eventDataRow'),
    getSubscriber: byId('getSubscriber'),
    getActorPreset: byId('getActorPreset'),
    getTargetActorPreset: byId('getTargetActorPreset'),
    getDataType: byId('getDataType'),
    getDataTypeHint: byId('getDataTypeHint'),
    getProductName: byId('getProductName'),
    getResponseSummary: byId('getResponseSummary'),
    subscribeBtn: byId('subscribeBtn'),
    unsubscribeBtn: byId('unsubscribeBtn'),
    startConferenceBtn: byId('startConferenceBtn'),
    openTopicViewerBtn: byId('openTopicViewerBtn'),
    viewerSelect: byId('viewerSelect'),
    publishBtn: byId('publishBtn'),
    publishActions: byId('publishActions'),
    dicomFileLabel: byId('dicomFileLabel'),
    dicomFileValue: byId('dicomFileValue'),
    chooseDicomFilesBtn: byId('chooseDicomFilesBtn'),
    chooseDicomFoldersBtn: byId('chooseDicomFoldersBtn'),
    dicomFilesInput: byId('dicomFilesInput'),
    dicomFoldersInput: byId('dicomFoldersInput'),
    getBtn: byId('getBtn'),
    retrievedImagesList: byId('retrievedImagesList'),
    tokenBtn: byId('tokenBtn'),
    authTokenBtn: byId('authTokenBtn'),
    hubAdminPortalBtn: byId('hubAdminPortalBtn'),
    instructionsBtn: byId('instructionsBtn'),
    clearBtn: byId('clearBtn'),
    messages: byId('messages'),
    statusText: byId('statusText'),
    connectionStatus: byId('connectionStatus'),
    messageCount: byId('messageCount'),
    getResponseData: byId('getResponseData'),
    worklistContextDisplay: byId('worklistContextDisplay'),
  };

  const state = {
    client: null,
    messageCount: 0,
    retrievedImages: [],
    selectedClientId: '',
    selectedClientSecret: '',
    lastImagingStudyOpenContext: [],
    lastAuthCode: '',
    lastAuthUserName: '',
    defaultTopic:
      new URLSearchParams(window.location.search).get('topic') || '',
  };

  updateWorklistContextDisplay(el, state);

  fillActorPresetSelect(el.publishActorPreset);
  fillTargetActorPresetSelect(el.publishTargetActorPreset);
  fillActorPresetSelect(el.getActorPreset, {
    value: 'OpenIGTLink',
    label: 'OpenIGTLink',
    title: OPENIGT_LINK_ACTOR_TOOLTIP,
  });
  fillTargetActorPresetSelect(el.getTargetActorPreset, {
    value: 'OpenIGTLink',
    label: 'OpenIGTLink',
    title: OPENIGT_LINK_ACTOR_TOOLTIP,
  });
  fillTargetProductPresetSelect(el.publishTargetProductName);
  fillTargetProductPresetSelect(el.getProductName);
  el.publishActorPreset.value = DEFAULT_ACTOR_KEYWORD;
  el.publishTargetActorPreset.value = DEFAULT_TARGET_ACTOR_KEYWORD;
  el.publishTargetProductName.value = DEFAULT_TARGET_PRODUCT;
  el.getProductName.value = DEFAULT_TARGET_PRODUCT;
  el.getActorPreset.value = DEFAULT_GET_ACTOR_KEYWORD;
  el.getTargetActorPreset.value = DEFAULT_TARGET_ACTOR_KEYWORD;

  el.getDataType.addEventListener('change', () => {
    const normalized = el.getDataType.value.trim().toUpperCase();
    const isImageType =
      normalized.startsWith('PNG') || normalized.startsWith('JPG');
    el.getActorPreset.value = isImageType ? 'ID' : DEFAULT_GET_ACTOR_KEYWORD;
    el.getTargetActorPreset.value = DEFAULT_TARGET_ACTOR_KEYWORD;
    if (el.getDataTypeHint) {
      const eventName = el.getDataType.value
        ? requestEventFor(el.getDataType.value)
        : '';
      el.getDataTypeHint.textContent = eventName
        ? `Will publish ${eventName}`
        : '';
    }
  });
  el.getDataType.dispatchEvent(new Event('change'));

  el.hubSelect.value = 'volviewCloud';
  applyHubPreset(el, state, 'volviewCloud');
  el.topic.value = state.defaultTopic;
  const initialSubscriberName = generateSubscriberName(
    el.productName.value.trim() || 'VTKJS-WKLST'
  );
  el.subscriberName.value = initialSubscriberName;
  el.getSubscriber.value = initialSubscriberName;
  el.dicomFileValue.value = getDefaultDicomSendFileName(el.viewerSelect.value);
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
          "value": "urn:oid:1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046"
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
    const eventTypeValue = el.eventType.value;
    const isDicomSend = eventTypeValue === 'dicom-send';
    const isImagingStudyOpenOrClose =
      eventTypeValue === 'ImagingStudy-open' ||
      eventTypeValue === 'ImagingStudy-close';
    el.eventTypeCustom.className =
      eventTypeValue === 'custom'
        ? `${style.eventTypeCustom} ${style.eventTypeCustomVisible}`
        : style.eventTypeCustom;
    el.eventDataRow.style.display = isDicomSend ? 'none' : '';
    el.dicomFileLabel.className = isDicomSend
      ? `${style.dicomFileLabel} ${style.dicomFileLabelVisible}`
      : style.dicomFileLabel;
    el.publishActions.className = isDicomSend
      ? `${style.actions} ${style.publishActions} ${style.publishActionsDicomOffset}`
      : `${style.actions} ${style.publishActions}`;
    if (isDicomSend) {
      el.publishActorPreset.value = DICOM_SEND_ACTOR_KEYWORD;
    } else {
      el.publishActorPreset.value = DEFAULT_ACTOR_KEYWORD;
    }
    el.publishTargetActorPreset.value = isImagingStudyOpenOrClose
      ? 'ID'
      : DEFAULT_TARGET_ACTOR_KEYWORD;
  });
  el.eventType.dispatchEvent(new Event('change'));

  el.topic.addEventListener('input', () => {
    const nextTopic = el.topic.value.trim();
    if (state.client) {
      state.client.setTopic(nextTopic);
    }
  });

  el.hubSelect.addEventListener('change', () => {
    applyHubPreset(el, state, el.hubSelect.value);
  });

  el.instructionsBtn.addEventListener('click', () => {
    openInstructionsWindow();
  });

  el.hubAdminPortalBtn.addEventListener('click', () => {
    try {
      const popupWidth = 800;
      const popupHeight = 600;
      const left = Math.max(
        0,
        Math.floor((window.screen.width - popupWidth) / 2)
      );
      const top = Math.max(
        0,
        Math.floor((window.screen.height - popupHeight) / 2)
      );
      const features = [
        'popup',
        `width=${popupWidth}`,
        `height=${popupHeight}`,
        `left=${left}`,
        `top=${top}`,
        'noopener',
        'noreferrer',
      ].join(',');

      if (el.hubSelect.value === 'local') {
        window.open(
          'http://localhost:2017/api/hub/admin',
          'castAdminPortalWindow',
          features
        );
        return;
      }
      const base = el.hubEndpoint.value.trim();
      const hubBase = base.endsWith('/') ? base : `${base}/`;
      const url = new URL('admin', hubBase).href;
      window.open(url, 'castAdminPortalWindow', features);
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
      const popupWidth = 800;
      const popupHeight = 600;
      const left = Math.max(
        0,
        Math.floor((window.screen.width - popupWidth) / 2)
      );
      const top = Math.max(
        0,
        Math.floor((window.screen.height - popupHeight) / 2)
      );
      const features = [
        'popup',
        `width=${popupWidth}`,
        `height=${popupHeight}`,
        `left=${left}`,
        `top=${top}`,
        'noopener',
        'noreferrer',
      ].join(',');
      window.open(url.toString(), 'castConferenceClientWindow', features);
    } catch (err) {
      addMessage(el, state, 'err', 'Conference', 'Invalid hub_endpoint URL');
    }
  });

  el.openTopicViewerBtn.addEventListener('click', () => {
    const isLocal =
      el.hubSelect.value === 'local' || el.hubSelect.value === 'volviewLocal';
    const viewer = el.viewerSelect.value;
    let viewerBaseUrl;
    if (viewer === 'volview') {
      viewerBaseUrl = isLocal
        ? 'http://localhost:5173'
        : 'https://volview-server-with-hub-g2d9hcc5esahgxe8.westeurope-01.azurewebsites.net/volview-client/';
    } else {
      viewerBaseUrl = isLocal
        ? 'http://localhost:3000/viewer'
        : 'https://ohif-cast.d1ps2fewnyt2md.amplifyapp.com/viewer/';
    }
    const url = new URL(viewerBaseUrl);
    const token = state.client?.getConnectionState?.().token?.trim();
    if (token) {
      // Viewer reads hub JWT from `id-token` to recover FHIRcast topic (not legacy `cast-token`).
      url.searchParams.set('id-token', token);
    }
    const popupWidth = 800;
    const popupHeight = 600;
    const left = Math.max(
      0,
      Math.floor((window.screen.width - popupWidth) / 2)
    );
    const top = Math.max(
      0,
      Math.floor((window.screen.height - popupHeight) / 2)
    );
    const features = [
      'popup',
      `width=${popupWidth}`,
      `height=${popupHeight}`,
      `left=${left}`,
      `top=${top}`,
      'noopener',
      'noreferrer',
    ].join(',');
    window.open(url.toString(), 'castViewerWindow', features);
  });

  el.chooseDicomFilesBtn.addEventListener('click', () => {
    el.dicomFilesInput.click();
  });

  el.chooseDicomFoldersBtn.addEventListener('click', () => {
    el.dicomFoldersInput.click();
  });

  el.viewerSelect.addEventListener('change', () => {
    const hasCustomSelection =
      (el.dicomFilesInput.files && el.dicomFilesInput.files.length > 0) ||
      (el.dicomFoldersInput.files && el.dicomFoldersInput.files.length > 0);
    if (!hasCustomSelection) {
      el.dicomFileValue.value = getDefaultDicomSendFileName(
        el.viewerSelect.value
      );
    }
  });

  el.dicomFilesInput.addEventListener('change', () => {
    const files = Array.from(el.dicomFilesInput.files || []);
    if (!files.length) {
      el.dicomFileValue.value = getDefaultDicomSendFileName(
        el.viewerSelect.value
      );
      return;
    }
    if (files.length === 1) {
      el.dicomFileValue.value = files[0].name;
      return;
    }
    el.dicomFileValue.value = `${files.length} files selected`;
  });

  el.dicomFoldersInput.addEventListener('change', () => {
    const files = Array.from(el.dicomFoldersInput.files || []);
    if (!files.length) {
      el.dicomFileValue.value = getDefaultDicomSendFileName(
        el.viewerSelect.value
      );
      return;
    }
    const firstRelativePath = files[0].webkitRelativePath || '';
    const folderName =
      firstRelativePath.split('/').filter(Boolean)[0] || 'Folder';
    el.dicomFileValue.value =
      files.length === 1 ? folderName : `${folderName} (${files.length} files)`;
  });

  // Authorize button is meaningless until we have a code from authenticate().
  el.tokenBtn.disabled = true;
  el.tokenBtn.addEventListener('click', async () => handleGetToken(el, state));
  el.authTokenBtn.addEventListener('click', async () =>
    handleAuthenticate(el, state)
  );
  el.subscribeBtn.addEventListener('click', async () =>
    handleSubscribe(el, state)
  );
  el.unsubscribeBtn.addEventListener('click', async () =>
    handleUnsubscribe(el, state)
  );
  el.publishBtn.addEventListener('click', async () => handlePublish(el, state));
  el.getBtn.addEventListener('click', async () => handleCastRequest(el, state));
  el.clearBtn.addEventListener('click', () => {
    el.messages.innerHTML = '';
    state.messageCount = 0;
    el.messageCount.textContent = '(0)';
  });

  window.addEventListener('beforeunload', () => {
    if (Array.isArray(state.retrievedImages)) {
      state.retrievedImages.forEach((entry) => {
        if (entry && entry.url) {
          URL.revokeObjectURL(entry.url);
        }
      });
      state.retrievedImages = [];
    }
    if (state.client) {
      state.client.delete();
    }
  });
}

boot();
