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
  buildDicomwebImagingStudyOpenContext,
  buildFilesImagingStudyOpenContext,
  extractVolviewSampleId,
  generateSubscriberName,
  isHubEndpointInCloud,
  isRunningInCloud,
  selectFirstMatchingHubKey,
} from 'vtk.js/Sources/IO/Core/CastClient';
import html2canvas from 'html2canvas';
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

/** Worklist client identity (not derived from hub preset). */
const EXAMPLE_PRODUCT_NAME = 'VTKJS-WKLST';
const EXAMPLE_SUBSCRIBER_PREFIX = EXAMPLE_PRODUCT_NAME;

const DEFAULT_ACTOR_KEYWORD = 'WORKLIST_CLIENT';
const DEFAULT_SUBSCRIBE_EVENTS =
  'imagingstudy-open,imagingstudy-close,fhircastcontext-request,subscription-removed';
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

const WORKLIST_SPECIALITY_VOLVIEW = 'volviewSample';
const WORKLIST_SPECIALITY_SLICER = 'slicerSamples';
const WORKLIST_SPECIALITY_IDC = 'idcSelection';

/** IDC-maintained DICOMweb proxy (see learn.canceridc.dev). */
const IDC_DICOMWEB_ROOT =
  'https://proxy.imaging.datacommons.cancer.gov/current/viewer-only-no-downloads-see-tinyurl-dot-com-slash-3j3d9jyp/dicomWeb';

const SLICER_TESTING_DATA_URL =
  'https://github.com/Slicer/SlicerTestingData/releases/download/';
const SLICER_DATA_STORE_URL =
  'https://github.com/Slicer/SlicerDataStore/releases/download/';

const EXAMPLE_PAGE_TITLE_SUB = 'vtk.js IO module example';

const CAST_STANDARD_CAST = 'cast';
const CAST_STANDARD_FHIRCAST_V3 = 'fhircast-v3';
const CAST_STANDARD_DEFAULT = CAST_STANDARD_CAST;
const FHIRCAST_V3_COMING_SOON_MESSAGE =
  'FHIRcast v3.0 is coming this fall to this client library !';

const TITLE_BY_CAST_STANDARD = {
  [CAST_STANDARD_CAST]: 'Worklist with cast interface',
  [CAST_STANDARD_FHIRCAST_V3]: 'Worklist with FHIRcast interface',
};

function titleMainForCastStandard(standard) {
  return (
    TITLE_BY_CAST_STANDARD[standard] ||
    TITLE_BY_CAST_STANDARD[CAST_STANDARD_DEFAULT]
  );
}

/** Mirrors VolView ``SAMPLE_DATA`` (VolView/src/config.ts). */
const VOLVIEW_SAMPLE_STUDIES = [
  {
    id: 'cta-head',
    name: 'CTA Head and Neck',
    filename: 'CTA-Head_and_Neck.zip',
    size: '80 MB',
    description: 'CTA head and neck scan of elderly patient with tumor.',
    url: 'https://data.kitware.com/api/v1/item/6347159711dab81428208e24/download',
  },
  {
    id: 'mra-head',
    name: 'MRA Head and Neck',
    filename: 'MRA-Head_and_Neck.zip',
    size: '15 MB',
    description: 'MRA from Patient Contributed Image Repository.',
    url: 'https://data.kitware.com/api/v1/item/6352a2b311dab8142820a33b/download',
  },
  {
    id: 'mri-cardiac',
    name: 'MRI Cardiac 3D and Cine',
    filename: 'MRI-Cardiac-3D_and_Cine.zip',
    size: '4 MB',
    description:
      'MRI scan with two series: 3D axial non-gated and 2 chamber cine.',
    url: 'https://data.kitware.com/api/v1/item/6350b28f11dab8142820949d/download',
  },
  {
    id: 'mri-prostatex',
    name: 'MRI PROSTATEx',
    filename: 'MRI-PROSTATEx-0004.zip',
    size: '3 MB',
    description: 'MRI from the SPIE-AAPM-NCI PROSTATEx challenge.',
    url: 'https://data.kitware.com/api/v1/item/63527c7311dab8142820a338/download',
  },
  {
    id: 'us-fetus',
    name: '3D US Fetus',
    filename: '3DUS-Fetus.mha',
    size: '8 MB',
    description: '3D ultrasound of a baby. Downloaded from tomovision.com.',
    url: 'https://data.kitware.com/api/v1/item/635679c311dab8142820a4f4/download',
  },
];

/**
 * Mirrors 3D Slicer SampleData ``registerBuiltInSampleDataSources()`` (General).
 * @see Slicer/Modules/Scripted/SampleData/SampleData.py
 */
const SLICER_SAMPLE_STUDIES = [
  {
    id: 'MRHead',
    name: 'MRHead',
    size: '~15 MB',
    description: 'MR head (Slicer built-in sample).',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/cc211f0dfd9a05ca3841ce1141b292898b2dd2d3f08286affadf823a7e58df93`,
        fileName: 'MR-head.nrrd',
        label: 'MRHead',
      },
    ],
  },
  {
    id: 'CTChest',
    name: 'CTChest',
    size: '~25 MB',
    description: 'CT chest (Slicer built-in sample).',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/4507b664690840abb6cb9af2d919377ffc4ef75b167cb6fd0f747befdb12e38e`,
        fileName: 'CT-chest.nrrd',
        label: 'CTChest',
      },
    ],
  },
  {
    id: 'CTACardio',
    name: 'CTACardio',
    size: '~40 MB',
    description: 'CTA cardio (Slicer built-in sample).',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/3b0d4eb1a7d8ebb0c5a89cc0504640f76a030b4e869e33ff34c564c3d3b88ad2`,
        fileName: 'CTA-cardio.nrrd',
        label: 'CTACardio',
      },
    ],
  },
  {
    id: 'DTIBrain',
    name: 'DTIBrain',
    size: '~20 MB',
    description: 'DTI brain (Slicer built-in sample).',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/5c78d00c86ae8d968caa7a49b870ef8e1c04525b1abc53845751d8bce1f0b91a`,
        fileName: 'DTI-Brain.nrrd',
        label: 'DTIBrain',
      },
    ],
  },
  {
    id: 'MRBrainTumor1',
    name: 'MRBrainTumor1',
    size: '~25 MB',
    description: 'MR brain tumor — registration library case 1.',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/998cb522173839c78657f4bc0ea907cea09fd04e44601f17c82ea27927937b95`,
        fileName: 'RegLib_C01_1.nrrd',
        label: 'MRBrainTumor1',
      },
    ],
  },
  {
    id: 'MRBrainTumor2',
    name: 'MRBrainTumor2',
    size: '~25 MB',
    description: 'MR brain tumor — registration library case 2.',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/1a64f3f422eb3d1c9b093d1a18da354b13bcf307907c66317e2463ee530b7a97`,
        fileName: 'RegLib_C01_2.nrrd',
        label: 'MRBrainTumor2',
      },
    ],
  },
  {
    id: 'BaselineVolume',
    name: 'BaselineVolume',
    size: '~30 MB',
    description: 'Baseline volume (Slicer built-in sample).',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/dff28a7711d20b6e16d5416535f6010eb99fd0c8468aaa39be4e39da78e93ec2`,
        fileName: 'BaselineVolume.nrrd',
        label: 'BaselineVolume',
      },
    ],
  },
  {
    id: 'DTIVolume',
    name: 'DTIVolume',
    size: 'Multi-file',
    description: 'DTI volume (.nhdr + .raw.gz pair).',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/67564aa42c7e2eec5c3fd68afb5a910e9eab837b61da780933716a3b922e50fe`,
        fileName: 'DTIVolume.nhdr',
        role: 'header',
        label: 'DTIVolume',
      },
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/d785837276758ddd9d21d76a3694e7fd866505a05bc305793517774c117cb38d`,
        fileName: 'DTIVolume.raw.gz',
        role: 'data',
        label: 'DTIVolume',
      },
    ],
  },
  {
    id: 'DWIVolume',
    name: 'DWIVolume',
    size: 'Multi-file',
    description: 'DWI volume (.nhdr + .raw.gz pair).',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/7666d83bc205382e418444ea60ab7df6dba6a0bd684933df8809da6b476b0fed`,
        fileName: 'dwi.nhdr',
        role: 'header',
        label: 'dwi',
      },
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/cf03fd53583dc05120d3314d0a82bdf5946799b1f72f2a7f08963f3fd24ca692`,
        fileName: 'dwi.raw.gz',
        role: 'data',
        label: 'dwi',
      },
    ],
  },
  {
    id: 'CTAAbdomenPanoramix',
    name: 'CTA abdomen (Panoramix)',
    size: '~45 MB',
    description:
      'CTA abdomen (Panoramix) — research/teaching use per Slicer SampleData.',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/146af87511520c500a3706b7b2bfb545f40d5d04dd180be3a7a2c6940e447433`,
        fileName: 'Panoramix-cropped.nrrd',
        label: 'Panoramix-cropped',
      },
    ],
  },
  {
    id: 'CBCTDentalSurgery',
    name: 'CBCTDentalSurgery',
    size: 'Multi-file',
    description: 'Pre- and post-dental surgery CBCT volumes.',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/7bfa16945629c319a439f414cfb7edddd2a97ba97753e12eede3b56a0eb09968`,
        fileName: 'PreDentalSurgery.gipl.gz',
        label: 'PreDentalSurgery',
      },
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/4cdc3dc35519bb57daeef4e5df89c00849750e778809e94971d3876f95cc7bbd`,
        fileName: 'PostDentalSurgery.gipl.gz',
        label: 'PostDentalSurgery',
      },
    ],
  },
  {
    id: 'MRUSProstate',
    name: 'MR-US Prostate',
    size: 'Multi-file',
    description: 'MR and resampled ultrasound prostate (Case10).',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/4843cdc9ea5d7bcce61650d1492ce01035727c892019339dca726380496896aa`,
        fileName: 'Case10-MR.nrrd',
        label: 'MRProstate',
      },
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/34decf58b1e6794069acbe947b460252262fe95b6858c5e320aeab03bc82ebb2`,
        fileName: 'case10_US_resampled.nrrd',
        label: 'USProstate',
      },
    ],
  },
  {
    id: 'CTMRBrain',
    name: 'CT-MR Brain',
    size: 'Multi-file',
    description: 'CT brain with MR T1 and T2 (three volumes).',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/6a5b6caccb76576a863beb095e3bfb910c50ca78f4c9bf043aa42f976cfa53d1`,
        fileName: 'CT-brain.nrrd',
        label: 'CTBrain',
      },
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/2da3f655ed20356ee8cdf32aa0f8f9420385de4b6e407d28e67f9974d7ce1593`,
        fileName: 'MR-brain-T1.nrrd',
        label: 'MRBrainT1',
      },
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/fa1fe5910a69182f2b03c0150d8151ac6c75df986449fb5a6c5ae67141e0f5e7`,
        fileName: 'MR-brain-T2.nrrd',
        label: 'MRBrainT2',
      },
    ],
  },
  {
    id: 'CBCTMRHead',
    name: 'CBCT-MR Head',
    size: 'Multi-file',
    description: 'CBCT and MR head (DZ-CBCT / DZ-MR).',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/4ce7aa75278b5a7b757ed0c8d7a6b3caccfc3e2973b020532456dbc8f3def7db`,
        fileName: 'DZ-CBCT.nrrd',
        label: 'DZ-CBCT',
      },
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/b5e9f8afac58d6eb0e0d63d059616c25a98e0beb80f3108410b15260a6817842`,
        fileName: 'DZ-MR.nrrd',
        label: 'DZ-MR',
      },
    ],
  },
  {
    id: 'CTLiver',
    name: 'CTLiver',
    size: '~35 MB',
    description: 'CT liver (Medical Decathlon Task03_Liver).',
    files: [
      {
        url: `${SLICER_TESTING_DATA_URL}SHA256/e16eae0ae6fefa858c5c11e58f0f1bb81834d81b7102e021571056324ef6f37e`,
        fileName: 'CTLiver.nrrd',
        label: 'CTLiver',
      },
    ],
  },
  {
    id: 'CTPCardioSeq',
    name: 'CTP Cardio Sequence',
    size: '~180 MB',
    description:
      'CTP cardiac sequence (.seq.nrrd). Best opened in 3D Slicer (SequenceFile).',
    files: [
      {
        url: `${SLICER_DATA_STORE_URL}SHA256/7fbb6ad0aed9c00820d66e143c2f037568025ed63db0a8db05ae7f26affeb1c2`,
        fileName: 'CTP-cardio.seq.nrrd',
        label: 'CTPCardioSeq',
      },
    ],
  },
  {
    id: 'CTCardioSeq',
    name: 'CT Cardio Sequence',
    size: '~180 MB',
    description:
      'CT cardiac sequence (.seq.nrrd). Best opened in 3D Slicer (SequenceFile).',
    files: [
      {
        url: `${SLICER_DATA_STORE_URL}SHA256/d1a1119969acead6c39c7c3ec69223fa2957edc561bc5bf384a203e2284dbc93`,
        fileName: 'CT-cardio.seq.nrrd',
        label: 'CTCardioSeq',
      },
    ],
  },
];

/**
 * Curated IDC studies via DICOMweb (StudyInstanceUID / optional SeriesInstanceUID).
 * @see https://learn.canceridc.dev/portal/visualization
 * @see https://learn.canceridc.dev/data/downloading-data/dicomweb-access
 */
const IDC_SAMPLE_STUDIES = [
  {
    id: 'idc-portal-demo-series-1',
    name: 'IDC portal demo (series 1)',
    size: 'DICOMweb',
    description:
      'Example series from IDC visualization docs. Opens one series via DICOMweb.',
    studyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.6279.6001.224985459390356936417021464571',
    seriesInstanceUID: '1.2.276.0.7230010.3.1.3.0.57823.1553343864.578877',
    dicomwebRoot: IDC_DICOMWEB_ROOT,
  },
  {
    id: 'idc-portal-demo-series-2',
    name: 'IDC portal demo (series 2)',
    size: 'DICOMweb',
    description:
      'Second example series from the same IDC demo study (DICOMweb).',
    studyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.6279.6001.224985459390356936417021464571',
    seriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.6279.6001.273525289046256012743471155680',
    dicomwebRoot: IDC_DICOMWEB_ROOT,
  },
  {
    id: 'idc-portal-demo-study',
    name: 'IDC portal demo (whole study)',
    size: 'DICOMweb',
    description:
      'Same demo study without a series UID; VolView loads the first series.',
    studyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.6279.6001.224985459390356936417021464571',
    dicomwebRoot: IDC_DICOMWEB_ROOT,
  },
  {
    id: 'idc-prostatex-mr',
    name: 'PROSTATEx MR (IDC / VolView fixture UID)',
    size: 'DICOMweb',
    description:
      'Study UID used in VolView session fixtures; verify availability in IDC.',
    studyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.206828891270520544417996275680.5tse2d1254.538438420111018.1D000000SN0D000000S0D000000S0D000000S0D970296SN0D241922',
    dicomwebRoot: IDC_DICOMWEB_ROOT,
  },
];

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

const CAST_EXAMPLE_USER_NAME_KEY = 'castExample.userName';

/** Preset keys tried in order when matching page deployment (local vs cloud). */
const HUB_PRESET_ORDER = ['local', 'cloud'];

function getStoredCastUserName() {
  try {
    return localStorage.getItem(CAST_EXAMPLE_USER_NAME_KEY)?.trim() || '';
  } catch (err) {
    return '';
  }
}

function setStoredCastUserName(userName) {
  const trimmed = String(userName || '').trim();
  try {
    if (trimmed) {
      localStorage.setItem(CAST_EXAMPLE_USER_NAME_KEY, trimmed);
    } else {
      localStorage.removeItem(CAST_EXAMPLE_USER_NAME_KEY);
    }
  } catch (err) {
    // ignore quota / private mode
  }
}

const HUB_DEFINITIONS = {
  local: {
    label: '3D Slicer local',
    hubEndpoint: 'http://127.0.0.1:2018/api/hub',
    authorizeEndpoint: 'http://127.0.0.1:2018/oauth/authorize',
    authEndpoint: 'http://127.0.0.1:2018/oauth/token',
    client_id: 'client_id_3d_Slicer',
    client_secret: 'client_secret_3d_Slicer',
  },
  cloud: {
    label: '3D Slicer cloud',
    hubEndpoint:
      'https://slicerhub-azejffgnb7dve8es.canadaeast-01.azurewebsites.net/api/hub',
    authorizeEndpoint:
      'https://slicerhub-azejffgnb7dve8es.canadaeast-01.azurewebsites.net/oauth/authorize',
    authEndpoint:
      'https://slicerhub-azejffgnb7dve8es.canadaeast-01.azurewebsites.net/oauth/token',
    client_id: 'client_id_3d_Slicer',
    client_secret: 'client_secret_3d_Slicer',
  },
};

/**
 * VolView viewer URLs (deployed outside the Cast hub; not derived from hub_endpoint).
 * Local: Vite dev. Cloud: VolView + hub stack on Azure (see VolView .env / cast hubs).
 */
const VOLVIEW_VIEWER_URL_LOCAL = 'http://localhost:5173/';
const VOLVIEW_VIEWER_URL_CLOUD =
  'https://volview-server-with-hub-g2d9hcc5esahgxe8.westeurope-01.azurewebsites.net/volview-client/';

/** OHIF viewer URLs (separate deployments). */
const OHIF_VIEWER_URL_LOCAL = 'http://localhost:3000/viewer/';
const OHIF_VIEWER_URL_CLOUD =
  'https://ohif-cast.d1ps2fewnyt2md.amplifyapp.com/viewer/';

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

function isFhircastV3Standard(standard) {
  return standard === CAST_STANDARD_FHIRCAST_V3;
}

function applyCastStandardToHeader(el, standard) {
  const titleMain = titleMainForCastStandard(standard);
  if (el.headerTitleMain) {
    el.headerTitleMain.textContent = titleMain;
  }
  document.title = `${titleMain} — ${EXAMPLE_PAGE_TITLE_SUB}`;
}

function applyCastStandardToPage(el, standard) {
  applyCastStandardToHeader(el, standard);
  const fhircast = isFhircastV3Standard(standard);
  if (el.castMainContent) {
    el.castMainContent.hidden = fhircast;
  }
  if (el.castFhircastComingSoon) {
    el.castFhircastComingSoon.hidden = !fhircast;
  }
}

function openInstructionsWindow(castStandard = CAST_STANDARD_DEFAULT) {
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
<title>${titleMainForCastStandard(
    castStandard
  )} — ${EXAMPLE_PAGE_TITLE_SUB}</title>
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
    font-weight: 700;
    color: #fff;
    line-height: 1.25;
  }
  .popupTitleSub {
    display: block;
    margin-top: 6px;
    font-size: 0.95rem;
    font-weight: 500;
    color: #b8b8b8;
  }
  strong { color: #fff; }
  ol { margin: 0 0 0 1.2em; padding: 0; }
  li { margin-bottom: 12px; }
  li:last-child { margin-bottom: 0; }
  a { color: #6cb6ff; }
</style>
</head>
<body>
<h1>${titleMainForCastStandard(
    castStandard
  )}<span class="popupTitleSub">${EXAMPLE_PAGE_TITLE_SUB}</span></h1>
${headerInstructionsHtml()}
</body>
</html>`;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
}

function cloneContextArray(context) {
  return Array.isArray(context) ? context.map((item) => ({ ...item })) : [];
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

function redactSceneviewPayloadForLog(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 16) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSceneviewPayloadForLog(item, depth + 1));
  }
  const out = {};
  Object.keys(value).forEach((key) => {
    const child = value[key];
    if (
      key === 'thumbnail' &&
      child &&
      typeof child === 'object' &&
      typeof child.data === 'string'
    ) {
      const bytes = child.data.length;
      out[key] = {
        contentType: child.contentType || 'image/png',
        data: `[${bytes} bytes omitted from message log]`,
        width: child.width,
        height: child.height,
      };
      return;
    }
    out[key] = redactSceneviewPayloadForLog(child, depth + 1);
  });
  return out;
}

function sanitizeCastMessageForDisplay(message) {
  if (!message || typeof message !== 'object') {
    return message;
  }
  const event =
    message.event && typeof message.event === 'object' ? message.event : {};
  const hubEvent = String(
    event['hub.event'] || message['hub.event'] || ''
  ).toLowerCase();
  if (!hubEvent.includes('sceneview')) {
    return message;
  }
  return redactSceneviewPayloadForLog(message);
}

function addMessage(el, state, kind, label, payload) {
  const line = document.createElement('div');
  line.className = `${style.msg} ${MESSAGE_KIND_CLASS[kind]}`;
  const ts = new Date().toLocaleTimeString();
  const displayPayload =
    payload && typeof payload === 'object'
      ? sanitizeCastMessageForDisplay(payload)
      : payload;
  line.textContent = `${label} - ${ts}\n${
    typeof displayPayload === 'string'
      ? displayPayload
      : JSON.stringify(displayPayload, null, 2)
  }`;
  el.messages.insertBefore(line, el.messages.firstChild);
  state.messageCount += 1;
  el.messageCount.textContent = `(${state.messageCount})`;
}

function formatWorklistContextForDisplay(state) {
  const ctx = cloneContextArray(state.lastImagingStudyOpenContext);
  if (!ctx.length) {
    return '[]';
  }
  return JSON.stringify(ctx, null, 2);
}

function hasWorklistContext(state) {
  return (
    Array.isArray(state.lastImagingStudyOpenContext) &&
    state.lastImagingStudyOpenContext.length > 0
  );
}

function syncOpenWorklistSampleId(state) {
  if (!hasWorklistContext(state)) {
    state.openWorklistSampleId = null;
    return;
  }
  state.openWorklistSampleId =
    extractVolviewSampleId(state.lastImagingStudyOpenContext) || null;
}

function updateWorklistContextControls(el, state) {
  syncOpenWorklistSampleId(state);
  const hasContext = hasWorklistContext(state);
  const openId = state.openWorklistSampleId;
  if (!el.worklistPanel) {
    return;
  }
  el.worklistPanel
    .querySelectorAll(`.${style.worklistOpenBtn}`)
    .forEach((btn) => {
      const sampleId = btn.dataset.sampleId;
      const isOpenRow = hasContext && sampleId === openId;
      btn.textContent = isOpenRow ? 'Close' : 'Open';
      btn.classList.toggle(style.worklistOpenBtnClose, isOpenRow);
      btn.disabled = hasContext && !isOpenRow;
      btn.title =
        hasContext && !isOpenRow
          ? 'Close the current study before opening another'
          : '';
    });
}

function updateWorklistContextDisplay(el, state) {
  if (el.worklistContextDisplay) {
    el.worklistContextDisplay.value = formatWorklistContextForDisplay(state);
  }
  updateWorklistContextControls(el, state);
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

function buildWorklistImagingStudyPublishPayload(el, hubEvent, context) {
  const payload = {
    event: {
      'hub.topic': el.topic.value.trim(),
      'hub.event': hubEvent,
      context,
    },
  };
  const actorValue = parseActorField(DEFAULT_ACTOR_KEYWORD);
  if (actorValue !== undefined) {
    payload.actor = actorValue;
  }
  payload['target.actor'] = 'ID';
  payload['target.product.name'] = '*';
  return payload;
}

async function publishImagingStudyOpen(el, state, context) {
  if (!state.client) {
    addMessage(el, state, 'err', 'Open study', 'Subscribe first');
    return false;
  }
  const payload = buildWorklistImagingStudyPublishPayload(
    el,
    'ImagingStudy-open',
    context
  );
  try {
    const res = await state.client.publish(payload);
    if (res && res.ok) {
      updateFhircastContextState(el, state, 'imagingstudy-open', context);
      addMessage(el, state, 'sent', 'Open study', payload);
      return true;
    }
    addMessage(
      el,
      state,
      'err',
      'Open study',
      res ? `HTTP ${res.status}` : 'No response'
    );
    return false;
  } catch (err) {
    addMessage(
      el,
      state,
      'err',
      'Open study',
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

async function publishImagingStudyClose(el, state) {
  if (!state.client) {
    addMessage(el, state, 'err', 'Close study', 'Subscribe first');
    return false;
  }
  if (!hasWorklistContext(state)) {
    addMessage(
      el,
      state,
      'err',
      'Close study',
      'No open study in worklist context'
    );
    return false;
  }
  const context = cloneContextArray(state.lastImagingStudyOpenContext);
  const payload = buildWorklistImagingStudyPublishPayload(
    el,
    'ImagingStudy-close',
    context
  );
  try {
    const res = await state.client.publish(payload);
    if (res && res.ok) {
      updateFhircastContextState(el, state, 'imagingstudy-close', context);
      addMessage(el, state, 'sent', 'Close study', payload);
      return true;
    }
    addMessage(
      el,
      state,
      'err',
      'Close study',
      res ? `HTTP ${res.status}` : 'No response'
    );
    return false;
  } catch (err) {
    addMessage(
      el,
      state,
      'err',
      'Close study',
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

async function handleWorklistClose(el, state) {
  await publishImagingStudyClose(el, state);
}

function findWorklistSample(sampleId) {
  return (
    VOLVIEW_SAMPLE_STUDIES.find((entry) => entry.id === sampleId) ||
    SLICER_SAMPLE_STUDIES.find((entry) => entry.id === sampleId) ||
    IDC_SAMPLE_STUDIES.find((entry) => entry.id === sampleId)
  );
}

function isDicomwebWorklistSample(sample) {
  return Boolean(sample?.studyInstanceUID?.trim());
}

function worklistSampleFiles(sample) {
  if (Array.isArray(sample.files) && sample.files.length > 0) {
    return sample.files;
  }
  return [{ url: sample.url, fileName: sample.filename }];
}

async function handleWorklistSampleOpen(el, state, sampleId) {
  if (hasWorklistContext(state)) {
    addMessage(
      el,
      state,
      'err',
      'Open study',
      'Worklist already has an open study; use Close first'
    );
    return;
  }
  const sample = findWorklistSample(sampleId);
  if (!sample) {
    addMessage(el, state, 'err', 'Open study', `Unknown sample: ${sampleId}`);
    return;
  }
  const patientReference = 'Patient/503824b8-fe8c-4227-b061-7181ba6c3926';
  const context = isDicomwebWorklistSample(sample)
    ? buildDicomwebImagingStudyOpenContext({
        id: sample.id,
        studyInstanceUID: sample.studyInstanceUID,
        seriesInstanceUID: sample.seriesInstanceUID,
        dicomwebRoot: sample.dicomwebRoot || IDC_DICOMWEB_ROOT,
        patientReference,
      })
    : buildFilesImagingStudyOpenContext({
        id: sample.id,
        files: worklistSampleFiles(sample),
        patientReference,
      });
  await publishImagingStudyOpen(el, state, context);
}

function handleWorklistRowBtnClick(el, state, sampleId) {
  if (hasWorklistContext(state) && sampleId === state.openWorklistSampleId) {
    handleWorklistClose(el, state).catch((err) => {
      console.error('[vtkCastClient] close study failed', err);
    });
    return;
  }
  handleWorklistSampleOpen(el, state, sampleId).catch((err) => {
    console.error('[vtkCastClient] open study failed', err);
  });
}

function worklistSampleSizeLabel(sample) {
  if (sample && sample.size) {
    return String(sample.size);
  }
  if (sample && sample.studyInstanceUID) {
    return 'DICOMweb';
  }
  if (Array.isArray(sample?.files) && sample.files.length > 1) {
    return 'Multi-file';
  }
  return '—';
}

/** Sort key in bytes; non-numeric sizes sort after downloadable MB values. */
function worklistSampleSizeSortBytes(sample) {
  const label = worklistSampleSizeLabel(sample);
  const mbMatch = label.match(/~?(\d+(?:\.\d+)?)\s*MB/i);
  if (mbMatch) {
    return Math.round(parseFloat(mbMatch[1]) * 1024 * 1024);
  }
  if (label === 'Multi-file') {
    return Number.MAX_SAFE_INTEGER - 2;
  }
  if (label === 'DICOMweb') {
    return Number.MAX_SAFE_INTEGER - 1;
  }
  return Number.MAX_SAFE_INTEGER;
}

function sortWorklistStudiesBySize(studies) {
  return [...studies].sort(
    (a, b) => worklistSampleSizeSortBytes(a) - worklistSampleSizeSortBytes(b)
  );
}

function renderWorklistStudyList(panelEl, studies, ariaLabel, el, state) {
  panelEl.classList.add(style.worklistPanelList);
  panelEl.setAttribute('aria-label', ariaLabel);

  const list = document.createElement('div');
  list.className = style.worklistEntries;

  const headerRow = document.createElement('div');
  headerRow.className = `${style.worklistEntry} ${style.worklistEntryHeaderRow}`;
  headerRow.setAttribute('aria-hidden', 'true');

  const header = document.createElement('div');
  header.className = style.worklistEntryMain;
  const headerClassByColumn = [
    style.worklistEntryTitle,
    style.worklistEntryDesc,
    style.worklistEntrySize,
  ];
  ['Study', 'Description', 'Size'].forEach((label, idx) => {
    const cell = document.createElement('div');
    cell.className = headerClassByColumn[idx] || style.worklistEntryDesc;
    cell.textContent = label;
    header.append(cell);
  });

  const headerBtnSpacer = document.createElement('span');
  headerBtnSpacer.className = style.worklistOpenBtnSpacer;
  headerBtnSpacer.textContent = 'Open';

  headerRow.append(header, headerBtnSpacer);
  list.append(headerRow);

  sortWorklistStudiesBySize(studies).forEach((sample) => {
    const row = document.createElement('div');
    row.className = style.worklistEntry;

    const main = document.createElement('div');
    main.className = style.worklistEntryMain;

    const title = document.createElement('div');
    title.className = style.worklistEntryTitle;
    title.textContent = sample.name;

    const desc = document.createElement('div');
    desc.className = style.worklistEntryDesc;
    desc.textContent = sample.description;

    const size = document.createElement('div');
    size.className = style.worklistEntrySize;
    size.textContent = worklistSampleSizeLabel(sample);

    main.append(title, desc, size);

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = style.worklistOpenBtn;
    openBtn.textContent = 'Open';
    openBtn.dataset.sampleId = sample.id;
    openBtn.disabled = false;
    openBtn.title = '';
    openBtn.addEventListener('click', () => {
      handleWorklistRowBtnClick(el, state, sample.id);
    });

    row.append(main, openBtn);
    list.append(row);
  });

  panelEl.append(list);
}

function renderWorklistPanel(panelEl, speciality, el, state) {
  panelEl.replaceChildren();
  panelEl.classList.remove(style.worklistPanelList, style.worklistPanelEmpty);

  if (speciality === WORKLIST_SPECIALITY_VOLVIEW) {
    renderWorklistStudyList(
      panelEl,
      VOLVIEW_SAMPLE_STUDIES,
      'VolView sample studies',
      el,
      state
    );
    return;
  }

  if (speciality === WORKLIST_SPECIALITY_SLICER) {
    renderWorklistStudyList(
      panelEl,
      SLICER_SAMPLE_STUDIES,
      '3D Slicer sample studies',
      el,
      state
    );
    return;
  }

  if (speciality === WORKLIST_SPECIALITY_IDC) {
    renderWorklistStudyList(
      panelEl,
      IDC_SAMPLE_STUDIES,
      'IDC DICOMweb studies',
      el,
      state
    );
    return;
  }

  panelEl.classList.add(style.worklistPanelEmpty);
  panelEl.setAttribute(
    'aria-label',
    'Organization (not available for this speciality)'
  );
  const msg = document.createElement('p');
  msg.className = style.worklistPlaceholderText;
  msg.textContent = 'Not available for this speciality.';
  panelEl.append(msg);
}

function buildPageHtml() {
  return `<div class="${style.container}">
  <div class="${style.castHeader}"><div class="${
    style.headerStandardWrap
  }"><label for="castStandardSelect">Standard:</label><select id="castStandardSelect" class="${
    style.headerStandardSelect
  }"><option value="${CAST_STANDARD_FHIRCAST_V3}">FHIRcast v3.0</option><option value="${CAST_STANDARD_CAST}" selected>Cast</option></select></div><div class="${
    style.headerTitleWrap
  }"><div class="${style.headerTitleStack}"><span id="headerTitleMain" class="${
    style.headerTitle
  }">${titleMainForCastStandard(CAST_STANDARD_DEFAULT)}</span><span class="${
    style.headerTitleSub
  }">${EXAMPLE_PAGE_TITLE_SUB}</span></div></div><div id="connectionStatus" class="${
    style.status
  } ${style.statusHeader} ${style.disconnected}"><div class="${
    style.statusBody
  }"><div class="${
    style.statusPrimaryLine
  }"><strong>Status:</strong> <span id="statusText">Not connected</span></div><div id="statusMeta" class="${
    style.statusMeta
  }"></div></div></div></div>
  <div id="castFhircastComingSoon" class="${
    style.fhircastComingSoon
  }" hidden><p>${FHIRCAST_V3_COMING_SOON_MESSAGE}</p></div>
  <div id="castMainContent">
  <div class="${style.layout}">
  <div class="${style.controlGrid}">
  <div class="${style.section} ${style.panelCard} ${style.gridFullWidth} ${
    style.worklistSection
  }">
    <div class="${style.worklistSectionHeader}">
      <div class="${style.worklistSectionHeaderLead}">
        <h2>Organization</h2>
        <div class="${style.worklistSpecialityControls}">
          <select
            id="worklistSpecialitySelect"
            class="${style.worklistSpecialitySelect}"
            aria-label="Speciality"
          >
            <option value="volviewSample" selected>VolView sample</option>
            <option value="slicerSamples">3D Slicer samples</option>
            <option value="idcSelection">Imaging Data Commons</option>
          </select>
        </div>
      </div>
      <div class="${style.worklistViewerButtons}">
        <button type="button" id="openVolViewBtn" class="${
          style.headerViewerBtn
        }" disabled>Open VolView</button>
        <button type="button" id="openOhifBtn" class="${
          style.headerViewerBtn
        }" disabled>Open OHIF</button>
        <button type="button" id="startSlicerBtn" class="${
          style.headerViewerBtn
        }" disabled>Start 3D Slicer</button>
        <button type="button" id="openHubBtn" class="${
          style.headerViewerBtn
        }" disabled>Open Hub</button>
      </div>
    </div>
    <div id="worklistPanel" class="${style.worklistPanel}"></div>
  </div>
  <details id="castHubSection" class="${style.castHubDetails} ${
    style.gridFullWidth
  }">
    <summary class="${
      style.castHubSummary
    }">Test bench (authenticate, subscribe, publish, request, conference)</summary>
    <div class="${style.castHubBody}">
  <div class="${style.connectionControls} ${style.section} ${style.panelCard}">
    <div class="${
      style.authenticateSectionHeader
    }"><h2><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>Authenticate</h2><button type="button" id="instructionsBtn" class="${
    style.instructionsBtn
  }" aria-label="Read me" title="Read me">Read me</button></div>
    <div class="${style.grid} ${style.connectionControlsInnerGrid}">
      <div><label for="authSelect">Auth</label><div class="${
        style.hubAuthRow
      }"><select id="authSelect"><option value="hubTestAuth" selected>Hub test auth</option><option value="openIDConnect">OIDC</option><option value="other">Other</option></select><button type="button" id="authTokenBtn">Authenticate</button></div></div>
      <div class="${style.gridFullWidth}"></div>
      <div><label for="hubSelect">Hub</label><div class="${
        style.hubAuthRow
      }"><select id="hubSelect"><option value="local">3D Slicer local</option><option value="cloud">3D Slicer cloud</option></select><button type="button" id="tokenBtn">Authorize</button></div><div class="${
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
    <h2><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>Subscribe</h2>
    <div class="${style.grid}">
      <div class="${
        style.castHiddenEndpoint
      }"><label for="hubEndpoint">hub_endpoint</label><input id="hubEndpoint" /></div>
      <div class="${style.subscribeSubscriberProductRow}">
        <div><label for="subscriberName">Subscriber</label><input id="subscriberName" /></div>
        <div><label for="productName">Product Name</label><input id="productName" value="${EXAMPLE_PRODUCT_NAME}" /></div>
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
    </div>
  </details>
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
  </div>
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

function statusHubNameMeta(el) {
  const hubKey = String(el.hubSelect?.value || '').trim();
  const hubDef = hubKey ? HUB_DEFINITIONS[hubKey] : null;
  if (hubDef?.label) {
    return String(hubDef.label);
  }
  const selected = el.hubSelect?.selectedOptions?.[0];
  return selected ? String(selected.textContent || '').trim() : '';
}

function statusSubscriberTopicMeta(el, state) {
  const parts = [];
  const hubText = statusHubNameMeta(el);
  if (hubText) {
    parts.push(hubText);
  }
  const session = state?.client?.getSessionConfig?.();
  const subscriber = String(
    el.subscriberName?.value?.trim() || session?.subscriberName || ''
  ).trim();
  const topic = String(el.topic?.value?.trim() || session?.topic || '').trim();
  if (subscriber && topic) {
    parts.push(`${subscriber} · ${topic}`);
  } else if (subscriber || topic) {
    parts.push(subscriber || topic);
  }
  return parts.join(' · ');
}

function updateStatusMeta(el, state) {
  if (!el.statusMeta) {
    return;
  }
  const text = statusSubscriberTopicMeta(el, state);
  el.statusMeta.textContent = text;
  el.statusMeta.hidden = !text;
}

function setConnection(el, state, status, text) {
  const statusClass = CONNECTION_STATUS_CLASS[status] || style.disconnected;
  el.connectionStatus.className = `${style.status} ${style.statusHeader} ${statusClass}`;
  el.statusText.replaceChildren();
  el.statusText.appendChild(document.createTextNode(text));
  updateStatusMeta(el, state);
}

function imageDisplayProductFromContextRequest(message) {
  const product = String(message?.['subscriber.product.name'] || '').trim();
  if (product) {
    return product;
  }
  return '';
}

function contextRequestProductAndSubscriber(message) {
  const subscriber = String(
    message?.['subscriber.name'] || message?.subscriber || ''
  ).trim();
  if (!subscriber) {
    return null;
  }
  const product = imageDisplayProductFromContextRequest(message) || subscriber;
  return { product, subscriber };
}

function imageDisplaySubscriberTooltip(subscribers) {
  if (!subscribers || subscribers.size === 0) {
    return '';
  }
  return [...subscribers].sort().join(', ');
}

const SCENEVIEW_LAYOUT_CANVAS_W = 920;
const SCENEVIEW_LAYOUT_CANVAS_H = 520;
const SCENEVIEW_LAYOUT_PAD = 24;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getWorklistScreenWindow() {
  return {
    screenX: window.screenX,
    screenY: window.screenY,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  };
}

/** Set in boot(); used for layout-popup worklist thumbnail capture only. */
let castExampleRootElement = null;

/** Object URL for worklist thumb in layout popup; revoked on next open. */
let sceneviewLayoutWorklistThumbUrl = null;

function revokeSceneviewLayoutWorklistThumbUrl() {
  if (sceneviewLayoutWorklistThumbUrl) {
    URL.revokeObjectURL(sceneviewLayoutWorklistThumbUrl);
    sceneviewLayoutWorklistThumbUrl = null;
  }
}

function pngThumbnailFromCanvas(canvas, maxWidth = 320) {
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
    return null;
  }
  const scale = Math.min(1, maxWidth / canvas.width);
  const outW = Math.max(1, Math.round(canvas.width * scale));
  const outH = Math.max(1, Math.round(canvas.height * scale));
  const tmp = document.createElement('canvas');
  tmp.width = outW;
  tmp.height = outH;
  const ctx = tmp.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.drawImage(canvas, 0, 0, outW, outH);
  try {
    const dataUrl = tmp.toDataURL('image/png');
    const marker = 'base64,';
    const idx = dataUrl.indexOf(marker);
    if (idx < 0) {
      return null;
    }
    return {
      contentType: 'image/png',
      data: dataUrl.slice(idx + marker.length),
      width: outW,
      height: outH,
    };
  } catch {
    return null;
  }
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

function isCastImageBinaryNode(node) {
  return (
    node &&
    typeof node === 'object' &&
    typeof node.contentType === 'string' &&
    typeof node.data === 'string' &&
    /^image\/(png|jpeg)$/i.test(node.contentType.trim()) &&
    node.data.replace(/\s/g, '').length > 0
  );
}

function castImageDataUrl(thumbnail) {
  if (!isCastImageBinaryNode(thumbnail)) {
    return '';
  }
  const contentType = thumbnail.contentType.trim().toLowerCase();
  const data = thumbnail.data.replace(/\s/g, '');
  return `data:${contentType};base64,${data}`;
}

function captureWorklistThumbnailPlaceholder(root, subscriberName, maxWidth) {
  const srcW = Math.max(1, root.offsetWidth || root.scrollWidth || 400);
  const srcH = Math.max(1, root.offsetHeight || root.scrollHeight || 280);
  const scale = Math.min(1, maxWidth / srcW);
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, outW, outH);
  ctx.strokeStyle = '#ffc107';
  ctx.lineWidth = Math.max(1, Math.round(2 * scale));
  ctx.strokeRect(
    ctx.lineWidth,
    ctx.lineWidth,
    outW - ctx.lineWidth * 2,
    outH - ctx.lineWidth * 2
  );
  const label = String(subscriberName || 'Worklist').trim() || 'Worklist';
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(
    11,
    Math.round(13 * scale)
  )}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, outW / 2, outH / 2);
  return pngThumbnailFromCanvas(canvas, maxWidth);
}

/** html2canvas clone prep: CSS sanitization + collapse Test bench for layout PNG only. */
function sanitizeHtml2CanvasCloneDocument(clonedDoc) {
  if (!clonedDoc || typeof clonedDoc.querySelectorAll !== 'function') {
    return;
  }
  const rewrite = (cssText) =>
    String(cssText || '')
      .replace(/oklch\([^)]*\)/gi, '#888888')
      .replace(/color-mix\([^)]*\)/gi, '#242c40');
  clonedDoc.querySelectorAll('style').forEach((node) => {
    if (node.textContent) {
      node.textContent = rewrite(node.textContent);
    }
  });
  clonedDoc.querySelectorAll('[style]').forEach((node) => {
    const inline = node.getAttribute('style');
    if (inline) {
      node.setAttribute('style', rewrite(inline));
    }
  });
  const castHubSection = clonedDoc.getElementById('castHubSection');
  if (castHubSection) {
    castHubSection.removeAttribute('open');
    if ('open' in castHubSection) {
      castHubSection.open = false;
    }
    castHubSection.querySelectorAll(`.${style.castHubBody}`).forEach((body) => {
      body.setAttribute('style', 'display:none !important');
    });
  }
}

async function captureWorklistThumbnailPng(
  maxWidth = 480,
  subscriberName = 'Worklist'
) {
  const root =
    castExampleRootElement ||
    document.querySelector(`.${style.cast}`) ||
    document.body;
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  try {
    const rect = root.getBoundingClientRect();
    const srcW = Math.max(1, Math.round(rect.width) || root.offsetWidth);
    const scale = Math.min(2, Math.max(0.35, maxWidth / srcW));
    const canvas = await html2canvas(root, {
      backgroundColor: '#000000',
      scale,
      logging: false,
      useCORS: true,
      onclone: sanitizeHtml2CanvasCloneDocument,
      ignoreElements: (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        return (
          element.id === 'messages' ||
          element.closest('#messages') !== null ||
          element.classList.contains(style.messages)
        );
      },
    });
    const thumb = pngThumbnailFromCanvas(canvas, maxWidth);
    if (thumb && thumb.data.length > 100) {
      return thumb;
    }
  } catch (err) {
    console.warn('[vtkCastClient] worklist thumbnail capture failed', err);
  }
  return captureWorklistThumbnailPlaceholder(root, subscriberName, maxWidth);
}

function buildSceneviewRequestArgs(el, targetProductName) {
  const requestArgs = {
    'subscriber.name': el.getSubscriber.value.trim(),
    event: {
      'hub.event': requestEventFor('SCENEVIEW'),
      'hub.topic': el.topic.value.trim(),
      context: { dataType: 'SCENEVIEW' },
    },
    'subscriber.actor': DEFAULT_GET_ACTOR_KEYWORD,
    'target.actor': 'ID',
  };
  const product = String(targetProductName || '').trim();
  if (product && product !== '*') {
    requestArgs['target.product.name'] = product;
  }
  return requestArgs;
}

function parseSceneviewCollatedResponses(resultData) {
  const envelope =
    resultData && typeof resultData === 'object' ? resultData : {};
  const responses = Array.isArray(envelope.responses) ? envelope.responses : [];
  return responses
    .map((item, idx) => ({
      subscriber:
        (item &&
          (item.subscriber ||
            item.subscriberName ||
            item['subscriber.name'])) ||
        `responder-${idx + 1}`,
      productName: (item && item.productName) || '',
      data: item && item.data,
    }))
    .filter((entry) => entry.data && typeof entry.data === 'object');
}

function screenRectFromPayload(obj) {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  const left = Number(obj.left);
  const top = Number(obj.top);
  const width = Number(obj.width);
  const height = Number(obj.height);
  if (
    ![left, top, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { left, top, width, height };
}

function windowRectFromPayload(win) {
  if (!win || typeof win !== 'object') {
    return null;
  }
  const left = Number(win.screenX);
  const top = Number(win.screenY);
  const width = Number(win.outerWidth);
  const height = Number(win.outerHeight);
  if (
    ![left, top, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { left, top, width, height };
}

function screenRectSummaryLine(prefix, rectObj) {
  const rect = screenRectFromPayload(rectObj);
  if (!rect) {
    return null;
  }
  return `${prefix} ${Math.round(rect.width)}×${Math.round(
    rect.height
  )} @ (${Math.round(rect.left)}, ${Math.round(rect.top)})`;
}

function shortenSceneviewUid(uid) {
  const text = String(uid || '').trim();
  if (!text) {
    return '';
  }
  if (text.length <= 24) {
    return text;
  }
  return `…${text.slice(-20)}`;
}

function displayCaptionLines(display) {
  if (!display || typeof display !== 'object') {
    return [];
  }
  const lines = [];
  if (display.layoutName) {
    lines.push(`Layout ${display.layoutName}`);
  }
  if (display.maximized) {
    lines.push('Maximized');
  }
  if (display.activeViewId) {
    lines.push(`Active view ${display.activeViewId}`);
  }
  const gridLine = screenRectSummaryLine('Grid', display.layoutScreenRect);
  if (gridLine) {
    lines.push(gridLine);
  }
  const layoutSize = display.layoutClientSize;
  if (layoutSize && typeof layoutSize === 'object') {
    const w = Number(layoutSize.width);
    const h = Number(layoutSize.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      lines.push(`Grid client ${Math.round(w)}×${Math.round(h)}`);
    }
  }
  return lines;
}

function viewportCaptionLines(vp, index) {
  if (!vp || typeof vp !== 'object') {
    return [];
  }
  const lines = [];
  const name = String(vp.name || vp.viewId || `viewport-${index + 1}`).trim();
  const type = vp.type ? String(vp.type) : '';
  const slotIdx = Number(vp.slotIndex);
  const slot =
    Number.isFinite(slotIdx) && slotIdx >= 0 ? ` · slot ${slotIdx + 1}` : '';
  lines.push(type ? `${name} (${type}${slot})` : name);
  if (vp.viewId && vp.viewId !== name) {
    lines.push(`  id ${vp.viewId}`);
  }
  const screenLine = screenRectSummaryLine('Screen', vp.screenRect);
  if (screenLine) {
    lines.push(`  ${screenLine}`);
  }
  const layoutLine = screenRectSummaryLine('Layout', vp.layoutRect);
  if (layoutLine) {
    lines.push(`  ${layoutLine}`);
  }
  if (vp.studyInstanceUID) {
    lines.push(`  Study ${shortenSceneviewUid(vp.studyInstanceUID)}`);
  }
  if (vp.seriesInstanceUID) {
    lines.push(`  Series ${shortenSceneviewUid(vp.seriesInstanceUID)}`);
  }
  if (vp.dataID) {
    lines.push(`  Data ${vp.dataID}`);
  }
  if (vp.orientation) {
    lines.push(`  Orientation ${vp.orientation}`);
  }
  if (vp.viewDirection) {
    lines.push(`  View ${vp.viewDirection}`);
  }
  if (vp.thumbnail && vp.thumbnail.width > 0 && vp.thumbnail.height > 0) {
    lines.push(`  Thumb ${vp.thumbnail.width}×${vp.thumbnail.height}`);
  }
  return lines;
}

function sceneviewCaptionLinesToHtml(lines) {
  return lines
    .map((line) => `<div class="svDetailLine">${escapeHtml(line)}</div>`)
    .join('');
}

function viewportDetailsSummary(vp, index) {
  const name = String(vp.name || vp.viewId || `viewport-${index + 1}`).trim();
  const type = vp.type ? String(vp.type) : '';
  const slotIdx = Number(vp.slotIndex);
  const slot =
    Number.isFinite(slotIdx) && slotIdx >= 0 ? ` · slot ${slotIdx + 1}` : '';
  const study = vp.studyInstanceUID
    ? ` · ${shortenSceneviewUid(vp.studyInstanceUID)}`
    : '';
  const head = type ? `${name} (${type}${slot})` : name;
  return `${head}${study}`;
}

function displayDetailsSummary(display) {
  const layoutName =
    display && display.layoutName ? String(display.layoutName) : '';
  return layoutName ? `Display · ${layoutName}` : 'Display';
}

function buildSubscriberDetailsTreeHtml(captionContext) {
  const ctx =
    captionContext && typeof captionContext === 'object' ? captionContext : {};
  const subscriber = String(ctx.subscriberName || '').trim() || 'Subscriber';
  const display = ctx.display;
  const viewports = Array.isArray(ctx.viewports) ? ctx.viewports : [];
  const displayLines = displayCaptionLines(display);
  const nested = [];

  if (displayLines.length) {
    nested.push(
      `<details class="svDetailsNode"><summary>${escapeHtml(
        displayDetailsSummary(display)
      )}</summary><div class="svDetailsBody">${sceneviewCaptionLinesToHtml(
        displayLines
      )}</div></details>`
    );
  }

  viewports.forEach((vp, idx) => {
    const vpLines = viewportCaptionLines(vp, idx);
    if (!vpLines.length) {
      return;
    }
    nested.push(
      `<details class="svDetailsNode"><summary>${escapeHtml(
        viewportDetailsSummary(vp, idx)
      )}</summary><div class="svDetailsBody">${sceneviewCaptionLinesToHtml(
        vpLines
      )}</div></details>`
    );
  });

  if (!nested.length) {
    const fallback =
      subscriber.toLowerCase() === 'worklist'
        ? 'Cast worklist window (no image-display layout).'
        : 'No display or viewport metadata.';
    nested.push(`<div class="svDetailLine">${escapeHtml(fallback)}</div>`);
  }

  return `<details class="svSubscriberRoot"><summary class="svSubscriberSummary">${escapeHtml(
    subscriber
  )}</summary><div class="svSubscriberBody">${nested.join('')}</div></details>`;
}

function windowContentRectFromPayload(win) {
  const outer = windowRectFromPayload(win);
  if (!outer || !win || typeof win !== 'object') {
    return null;
  }
  const innerW = Number(win.innerWidth) || outer.width;
  const innerH = Number(win.innerHeight) || outer.height;
  const chromeW = Math.max(0, outer.width - innerW);
  const chromeH = Math.max(0, outer.height - innerH);
  return {
    left: outer.left + chromeW / 2,
    top: outer.top + chromeH,
    width: innerW,
    height: innerH,
  };
}

/** Image-display diagram uses client area (below browser chrome), not outer frame. */
function sceneviewWindowRectForDiagram(win) {
  return windowContentRectFromPayload(win) || windowRectFromPayload(win);
}

function computeSceneviewDiagramBounds(worklistWindow, sceneviewEntries) {
  const rects = [];
  const worklistRect = windowRectFromPayload(worklistWindow);
  if (worklistRect) {
    rects.push(worklistRect);
  }
  sceneviewEntries.forEach((entry) => {
    const data = entry.data;
    const winRect = sceneviewWindowRectForDiagram(data && data.window);
    if (winRect) {
      rects.push(winRect);
    }
  });
  if (!rects.length) {
    return null;
  }
  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;
  rects.forEach((rect) => {
    minLeft = Math.min(minLeft, rect.left);
    minTop = Math.min(minTop, rect.top);
    maxRight = Math.max(maxRight, rect.left + rect.width);
    maxBottom = Math.max(maxBottom, rect.top + rect.height);
  });
  return {
    minLeft,
    minTop,
    width: Math.max(1, maxRight - minLeft),
    height: Math.max(1, maxBottom - minTop),
  };
}

function mapRectToDiagram(rect, bounds, scale, pad) {
  return {
    left: pad + (rect.left - bounds.minLeft) * scale,
    top: pad + (rect.top - bounds.minTop) * scale,
    width: Math.max(4, rect.width * scale),
    height: Math.max(4, rect.height * scale),
  };
}

function unionScreenRects(rects) {
  if (!rects.length) {
    return null;
  }
  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;
  rects.forEach((r) => {
    minLeft = Math.min(minLeft, r.left);
    minTop = Math.min(minTop, r.top);
    maxRight = Math.max(maxRight, r.left + r.width);
    maxBottom = Math.max(maxBottom, r.top + r.height);
  });
  return {
    left: minLeft,
    top: minTop,
    width: Math.max(1, maxRight - minLeft),
    height: Math.max(1, maxBottom - minTop),
  };
}

function layoutScreenRectFromEntry(display, viewports, win) {
  const fromDisplay = screenRectFromPayload(
    display && display.layoutScreenRect
  );
  if (fromDisplay) {
    return fromDisplay;
  }
  const vpRects = (Array.isArray(viewports) ? viewports : [])
    .map((vp) => screenRectFromPayload(vp?.screenRect))
    .filter(Boolean);
  const union = unionScreenRects(vpRects);
  if (union) {
    return union;
  }
  return windowContentRectFromPayload(win);
}

function layoutClientSizeFromEntry(display, layoutScreenRect) {
  const size = display && display.layoutClientSize;
  if (size && typeof size === 'object') {
    const width = Number(size.width);
    const height = Number(size.height);
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      return { width, height };
    }
  }
  if (layoutScreenRect) {
    return { width: layoutScreenRect.width, height: layoutScreenRect.height };
  }
  return null;
}

function viewportLayoutRectFromPayload(vp, layoutScreenRect) {
  const layoutRect = screenRectFromPayload(vp && vp.layoutRect);
  if (layoutRect) {
    return layoutRect;
  }
  const screenRect = screenRectFromPayload(vp && vp.screenRect);
  if (!screenRect || !layoutScreenRect) {
    return null;
  }
  return {
    left: screenRect.left - layoutScreenRect.left,
    top: screenRect.top - layoutScreenRect.top,
    width: screenRect.width,
    height: screenRect.height,
  };
}

/** VolView flex-equal slots from display.layout (matches 3D Primary, Four Up, etc.). */
function layoutSlotRectsFromDisplayLayout(display, layoutW, layoutH) {
  const layout = display && display.layout;
  if (!layout || typeof layout !== 'object' || !Array.isArray(layout.items)) {
    return null;
  }
  const slots = [];
  const pixelW = Math.max(1, layoutW);
  const pixelH = Math.max(1, layoutH);

  function visitLayoutNode(node, box) {
    const items = node.items || [];
    const count = Math.max(1, items.length);
    const direction = node.direction === 'column' ? 'column' : 'row';
    items.forEach((item, index) => {
      let childBox;
      if (direction === 'row') {
        const w = box.width / count;
        childBox = {
          left: box.left + index * w,
          top: box.top,
          width: w,
          height: box.height,
        };
      } else {
        const h = box.height / count;
        childBox = {
          left: box.left,
          top: box.top + index * h,
          width: box.width,
          height: h,
        };
      }
      if (item && item.type === 'slot') {
        slots.push({
          slotIndex: Number(item.slotIndex),
          left: childBox.left,
          top: childBox.top,
          width: childBox.width,
          height: childBox.height,
        });
      } else if (item && item.type === 'layout') {
        visitLayoutNode(item, childBox);
      }
    });
  }

  visitLayoutNode(layout, { left: 0, top: 0, width: pixelW, height: pixelH });
  return slots.length ? slots : null;
}

function viewportLayoutRectForDiagram(
  display,
  vp,
  layoutSize,
  layoutScreenRect
) {
  const fromPayload = screenRectFromPayload(vp && vp.layoutRect);
  if (fromPayload) {
    return fromPayload;
  }
  const slotRects = layoutSlotRectsFromDisplayLayout(
    display,
    layoutSize.width,
    layoutSize.height
  );
  if (slotRects && vp && Number.isFinite(Number(vp.slotIndex))) {
    const match = slotRects.find(
      (slot) => slot.slotIndex === Number(vp.slotIndex)
    );
    if (match) {
      return {
        left: match.left,
        top: match.top,
        width: match.width,
        height: match.height,
      };
    }
  }
  return viewportLayoutRectFromPayload(vp, layoutScreenRect);
}

function mapLayoutRectToPercent(layoutRect, layoutW, layoutH) {
  const w = Math.max(1, layoutW);
  const h = Math.max(1, layoutH);
  return {
    left: Math.max(0, (layoutRect.left / w) * 100),
    top: Math.max(0, (layoutRect.top / h) * 100),
    width: Math.max(1, (layoutRect.width / w) * 100),
    height: Math.max(1, (layoutRect.height / h) * 100),
  };
}

/** Scale viewport layout rects down when SCENEVIEW coords overflow layoutClientSize. */
function fitViewportLayoutRectsToLayoutSize(layoutSize, layoutRects) {
  if (!layoutSize || !layoutRects.length) {
    return layoutRects;
  }
  const layoutW = Math.max(1, layoutSize.width);
  const layoutH = Math.max(1, layoutSize.height);
  let maxRight = 0;
  let maxBottom = 0;
  layoutRects.forEach((rect) => {
    maxRight = Math.max(maxRight, rect.left + rect.width);
    maxBottom = Math.max(maxBottom, rect.top + rect.height);
  });
  const scale = Math.min(1, layoutW / maxRight, layoutH / maxBottom);
  if (scale >= 0.999) {
    return layoutRects;
  }
  return layoutRects.map((rect) => ({
    left: rect.left * scale,
    top: rect.top * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  }));
}

function sceneviewBoxStyle(mapped, extra) {
  const parts = [
    `left:${mapped.left}px`,
    `top:${mapped.top}px`,
    `width:${mapped.width}px`,
    `height:${mapped.height}px`,
  ];
  if (extra) {
    parts.push(extra);
  }
  return parts.join(';');
}

function thumbnailImgHtml(thumbnail) {
  if (
    !thumbnail ||
    typeof thumbnail !== 'object' ||
    typeof thumbnail.contentType !== 'string' ||
    typeof thumbnail.data !== 'string' ||
    !/^image\/(png|jpeg)$/i.test(thumbnail.contentType.trim())
  ) {
    return '';
  }
  const contentType = thumbnail.contentType.trim().toLowerCase();
  return `<img class="svThumb" src="data:${contentType};base64,${thumbnail.data}" alt="" />`;
}

function sceneviewDisplayShellHtml(
  mapped,
  className,
  title,
  centerLabel,
  innerHtml,
  zIndex
) {
  const labelTop =
    className.includes('svDisplayId') || className.includes('svWorklist');
  const labelHtml = centerLabel
    ? `<div class="${
        labelTop ? 'svDisplayLabel svDisplayLabelTop' : 'svDisplayLabel'
      }"><span>${escapeHtml(centerLabel)}</span></div>`
    : '';
  return `<div class="${className} svDisplay" style="${sceneviewBoxStyle(
    mapped,
    `z-index:${zIndex}`
  )}" title="${escapeHtml(title)}">${innerHtml || ''}${labelHtml}</div>`;
}

function sceneviewWorklistDisplayInnerHtml(thumbnail) {
  const worklistThumbSrc = thumbnail ? castImageDataUrl(thumbnail) : '';
  const thumbHtml = worklistThumbSrc
    ? `<img class="svThumb" src="${worklistThumbSrc}" alt="" />`
    : '';
  return thumbHtml ? `<div class="svThumbWrap">${thumbHtml}</div>` : '';
}

function sceneviewViewportBoxPercentHtml(pct, title, thumbnail, zIndex) {
  const thumbHtml = thumbnailImgHtml(thumbnail);
  const thumbLayer = thumbHtml
    ? `<div class="svThumbWrap">${thumbHtml}</div>`
    : '';
  const boxStyle = [
    `left:${pct.left}%`,
    `top:${pct.top}%`,
    `width:${pct.width}%`,
    `height:${pct.height}%`,
    `z-index:${zIndex}`,
  ].join(';');
  return `<div class="svViewport" style="${boxStyle}" title="${escapeHtml(
    title
  )}">${thumbLayer}</div>`;
}

function sceneviewIdDisplayInnerHtml(win, display, viewports) {
  const layoutScreenRect = layoutScreenRectFromEntry(display, viewports, win);
  const layoutSize = layoutClientSizeFromEntry(display, layoutScreenRect);
  if (!layoutSize) {
    return '';
  }
  const layoutStyle =
    'position:absolute;left:0;top:0;width:100%;height:100%;box-sizing:border-box';
  const viewportList = Array.isArray(viewports) ? viewports : [];

  if (display && display.maximized && viewportList.length) {
    const activeVp =
      viewportList.find((vp) => vp && vp.viewId === display.activeViewId) ||
      viewportList[0];
    const pct = { left: 0, top: 0, width: 100, height: 100 };
    const vpName =
      (activeVp && (activeVp.name || activeVp.viewId)) || 'viewport';
    const vpTitle = activeVp.studyInstanceUID
      ? `${vpName} — ${activeVp.studyInstanceUID}`
      : vpName;
    return `<div class="svDisplayContent" style="${layoutStyle}">${sceneviewViewportBoxPercentHtml(
      pct,
      vpTitle,
      activeVp.thumbnail,
      3
    )}</div>`;
  }

  const viewportItems = [];
  const useLayoutTree = Boolean(
    layoutSlotRectsFromDisplayLayout(
      display,
      layoutSize.width,
      layoutSize.height
    )
  );
  viewportList.forEach((vp, vpIdx) => {
    const vpLayoutRect = viewportLayoutRectForDiagram(
      display,
      vp,
      layoutSize,
      layoutScreenRect
    );
    if (!vpLayoutRect) {
      return;
    }
    viewportItems.push({ vp, vpIdx, layoutRect: vpLayoutRect });
  });
  const layoutRects = useLayoutTree
    ? viewportItems.map((item) => item.layoutRect)
    : fitViewportLayoutRectsToLayoutSize(
        layoutSize,
        viewportItems.map((item) => item.layoutRect)
      );
  const viewportChunks = [];
  viewportItems.forEach((item, idx) => {
    const pct = mapLayoutRectToPercent(
      layoutRects[idx],
      layoutSize.width,
      layoutSize.height
    );
    const vpName =
      (item.vp && (item.vp.name || item.vp.viewId)) ||
      `viewport-${item.vpIdx + 1}`;
    const vpTitle = item.vp.studyInstanceUID
      ? `${vpName} — ${item.vp.studyInstanceUID}`
      : vpName;
    viewportChunks.push(
      sceneviewViewportBoxPercentHtml(pct, vpTitle, item.vp.thumbnail, 3)
    );
  });
  return `<div class="svDisplayContent" style="${layoutStyle}">${viewportChunks.join(
    ''
  )}</div>`;
}

function pushSceneviewDisplay(
  chunks,
  mappedWin,
  shellClassName,
  title,
  centerLabel,
  innerHtml,
  zIndex
) {
  chunks.push(
    sceneviewDisplayShellHtml(
      mappedWin,
      shellClassName,
      title,
      centerLabel,
      innerHtml,
      zIndex
    )
  );
}

function buildSceneviewImageDisplaysSectionHtml(sceneviewEntries) {
  const blocks = [];
  sceneviewEntries.forEach((entry, entryIdx) => {
    const data = entry.data;
    const productLabel =
      (data.product && String(data.product)) ||
      entry.productName ||
      entry.subscriber ||
      `Image Display ${entryIdx + 1}`;
    const subscriberLabel =
      entry.subscriber ||
      (data['subscriber.name'] && String(data['subscriber.name'])) ||
      productLabel;
    if (!windowRectFromPayload(data.window)) {
      return;
    }
    const viewports = Array.isArray(data.viewports) ? data.viewports : [];
    blocks.push(
      buildSubscriberDetailsTreeHtml({
        subscriberName: subscriberLabel,
        display: data.display,
        viewports,
      })
    );
  });
  if (!blocks.length) {
    return '<p class="svEmpty">No image display metadata.</p>';
  }
  return blocks.join('');
}

function buildSceneviewLayoutDiagramHtml(
  worklistWindow,
  sceneviewEntries,
  worklistMeta
) {
  const bounds = computeSceneviewDiagramBounds(
    worklistWindow,
    sceneviewEntries
  );
  if (!bounds) {
    return '<p class="svEmpty">No screen geometry in sceneview response.</p>';
  }
  const scale = Math.min(
    SCENEVIEW_LAYOUT_CANVAS_W / bounds.width,
    SCENEVIEW_LAYOUT_CANVAS_H / bounds.height
  );
  const pad = SCENEVIEW_LAYOUT_PAD;
  const canvasW = Math.ceil(bounds.width * scale + pad * 2);
  const canvasH = Math.ceil(bounds.height * scale + pad * 2);
  const chunks = [
    `<div class="svCanvas" style="width:${canvasW}px;height:${canvasH}px">`,
  ];

  const worklistRect = windowRectFromPayload(worklistWindow);
  if (worklistRect) {
    const mapped = mapRectToDiagram(worklistRect, bounds, scale, pad);
    const wlSubscriber =
      (worklistMeta && worklistMeta.subscriberName) || 'Worklist';
    const wlTitle = `Worklist (${wlSubscriber})`;
    pushSceneviewDisplay(
      chunks,
      mapped,
      'svWin svWorklist',
      wlTitle,
      wlSubscriber,
      sceneviewWorklistDisplayInnerHtml(worklistMeta && worklistMeta.thumbnail),
      2
    );
  }

  sceneviewEntries.forEach((entry, entryIdx) => {
    const data = entry.data;
    const productLabel =
      (data.product && String(data.product)) ||
      entry.productName ||
      entry.subscriber ||
      `Image Display ${entryIdx + 1}`;
    const subscriberLabel =
      entry.subscriber ||
      (data['subscriber.name'] && String(data['subscriber.name'])) ||
      productLabel;
    const winRect = sceneviewWindowRectForDiagram(data.window);
    if (!winRect) {
      return;
    }
    const mappedWin = mapRectToDiagram(winRect, bounds, scale, pad);
    const viewports = Array.isArray(data.viewports) ? data.viewports : [];
    pushSceneviewDisplay(
      chunks,
      mappedWin,
      'svDisplayId',
      subscriberLabel,
      subscriberLabel,
      sceneviewIdDisplayInnerHtml(data.window, data.display, viewports),
      4
    );
  });

  chunks.push('</div>');
  return chunks.join('');
}

function buildSceneviewLayoutPageHtml(
  worklistWindow,
  sceneviewEntries,
  worklistMeta
) {
  const diagram = buildSceneviewLayoutDiagramHtml(
    worklistWindow,
    sceneviewEntries,
    worklistMeta
  );
  const imageDisplaysSection =
    buildSceneviewImageDisplaysSectionHtml(sceneviewEntries);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Scene layout — Cast worklist</title>
<style>
  body { margin: 0; padding: 20px 24px; background: #111; color: #eaeaea; font-family: system-ui, sans-serif; font-size: 14px; }
  h1 { margin: 0 0 8px; font-size: 1.25rem; }
  p { margin: 0 0 12px; color: #b8b8b8; }
  .svWrap { overflow: auto; border: 1px solid #333; border-radius: 8px; background: #0a0a12; padding: 12px; margin-bottom: 16px; }
  .svCanvas { position: relative; margin: 0 auto; background: repeating-linear-gradient(
    0deg, #1a1a22 0, #1a1a22 20px, #15151c 20px, #15151c 40px
  ); }
  .svDisplay { position: absolute; box-sizing: border-box; overflow: hidden; }
  .svWin, .svViewport { box-sizing: border-box; }
  .svWorklist { border: 2px solid #ffc107; background: rgba(255, 193, 7, 0.12); }
  .svDisplayId { border: 2px solid #6cb6ff; background: #0a0a12; }
  .svDisplayContent { position: absolute; box-sizing: border-box; overflow: hidden; }
  .svDisplayContent .svViewport { position: absolute; border: 1px solid #6cb6ff; background: #000; box-sizing: border-box; }
  .svThumbWrap { position: absolute; inset: 0; z-index: 1; overflow: hidden; pointer-events: none; }
  .svWorklist .svThumb { width: 100%; height: 100%; object-fit: contain; display: block; background: #000; }
  .svDisplayContent .svThumb { width: 100%; height: 100%; object-fit: cover; object-position: center;
    display: block; background: #000; }
  .svDisplayLabel { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center;
    padding: 6px; pointer-events: none; box-sizing: border-box; }
  .svDisplayLabelTop { inset: auto 0 auto 0; top: 0; height: auto; align-items: flex-start; justify-content: center;
    padding: 4px 6px; background: linear-gradient(to bottom, rgba(0, 0, 0, 0.72), transparent); }
  .svDisplayLabel span { display: inline-block; max-width: calc(100% - 12px); padding: 4px 10px; font-size: 11px;
    font-weight: 700; line-height: 1.25; color: #fff; text-align: center; word-break: break-word;
    background: rgba(0, 0, 0, 0.65); border-radius: 4px; text-shadow: 0 1px 2px #000; }
  .svBelowSection { margin-top: 4px; }
  .svBelowSection h2 { margin: 0 0 10px; font-size: 1rem; font-weight: 600; color: #ddd; }
  .svBelowPanel { border: 1px solid #333; border-radius: 8px; background: #0a0a12; padding: 12px 14px; }
  .svSubscriberRoot { margin: 0 0 10px; }
  .svSubscriberRoot:last-child { margin-bottom: 0; }
  .svSubscriberSummary { cursor: pointer; font-weight: 700; color: #e8e8e8; }
  .svSubscriberBody { margin: 4px 0 0 0.4em; padding: 0; }
  .svDetailsNode { margin: 2px 0 4px 0; }
  .svDetailsNode > summary { cursor: pointer; color: #b8d4ff; list-style-position: outside; }
  .svDetailsBody { margin: 2px 0 4px 0.8em; padding: 0; }
  .svDetailLine { margin: 1px 0; color: #a8a8a8; white-space: pre-wrap; }
  .svEmpty { color: #888; }
</style>
</head>
<body>
<h1>Scene layout (SCENEVIEW)</h1>
<p>Screen positions from this worklist window and image-display sceneview responses (not to scale across monitors).</p>
<div class="svWrap">${diagram}</div>
<section class="svBelowSection">
<h2>Image Displays</h2>
<div class="svBelowPanel">${imageDisplaysSection}</div>
</section>
</body>
</html>`;
}

function openSceneviewLayoutPopup(
  worklistWindow,
  sceneviewEntries,
  worklistMeta
) {
  const popupWidth = 1000;
  const popupHeight = 720;
  const left = Math.max(0, Math.floor((window.screen.width - popupWidth) / 2));
  const top = Math.max(0, Math.floor((window.screen.height - popupHeight) / 2));
  const features = [
    'popup',
    `width=${popupWidth}`,
    `height=${popupHeight}`,
    `left=${left}`,
    `top=${top}`,
  ].join(',');
  const popup = window.open('', 'castSceneviewLayoutWindow', features);
  if (!popup) {
    return false;
  }
  revokeSceneviewLayoutWorklistThumbUrl();
  const pageMeta = {
    subscriberName: (worklistMeta && worklistMeta.subscriberName) || 'Worklist',
    thumbnail: worklistMeta && worklistMeta.thumbnail,
  };
  popup.document.open();
  popup.document.write(
    buildSceneviewLayoutPageHtml(worklistWindow, sceneviewEntries, pageMeta)
  );
  popup.document.close();
  popup.focus();
  return true;
}

async function openSceneviewLayoutFromStatus(el, state, productName) {
  if (!state.client?.request) {
    window.alert('Cast client is not ready.');
    return;
  }
  if (state.sceneviewLayoutBusy) {
    return;
  }
  state.sceneviewLayoutBusy = true;
  try {
    const wlSubscriber = el.getSubscriber.value.trim() || 'Worklist';
    const worklistWindow = getWorklistScreenWindow();
    // Capture while the worklist UI is visible (layout popup only; not sent on Cast).
    const worklistThumbnail = await captureWorklistThumbnailPng(
      480,
      wlSubscriber
    );
    const result = await state.client.request(
      buildSceneviewRequestArgs(el, productName)
    );
    if (!result.ok) {
      const detail =
        typeof result.data === 'string'
          ? result.data
          : JSON.stringify(redactSceneviewPayloadForLog(result.data), null, 2);
      window.alert(`SCENEVIEW request failed (${result.status}):\n${detail}`);
      addMessage(el, state, 'err', 'SCENEVIEW layout', detail);
      return;
    }
    const entries = parseSceneviewCollatedResponses(result.data);
    if (!entries.length) {
      window.alert('No sceneview response from image display.');
      addMessage(el, state, 'err', 'SCENEVIEW layout', 'No responders');
      return;
    }
    const opened = openSceneviewLayoutPopup(worklistWindow, entries, {
      subscriberName: wlSubscriber,
      thumbnail: worklistThumbnail,
    });
    if (opened) {
      addMessage(el, state, 'received', 'SCENEVIEW layout', {
        product: productName,
        responders: entries.length,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    window.alert(`SCENEVIEW request error: ${msg}`);
    addMessage(el, state, 'err', 'SCENEVIEW layout', msg);
  } finally {
    state.sceneviewLayoutBusy = false;
  }
}

function setImageDisplayConnectionStatus(
  el,
  state,
  status,
  productName,
  subscriberCount,
  subscribers
) {
  const statusClass = CONNECTION_STATUS_CLASS[status] || style.disconnected;
  el.connectionStatus.className = `${style.status} ${style.statusHeader} ${statusClass}`;
  el.statusText.replaceChildren();
  el.statusText.appendChild(document.createTextNode('Image Display: '));
  const productSpan = document.createElement('span');
  productSpan.className = `${style.statusProductName} ${style.statusProductNameClickable}`;
  const tooltip = imageDisplaySubscriberTooltip(subscribers);
  productSpan.title = tooltip
    ? `${tooltip}\n\nClick to open scene layout (SCENEVIEW).`
    : 'Click to open scene layout (SCENEVIEW).';
  productSpan.textContent =
    subscriberCount >= 2 ? `${productName} (${subscriberCount})` : productName;
  productSpan.setAttribute('role', 'button');
  productSpan.tabIndex = 0;
  const activate = () => {
    openSceneviewLayoutFromStatus(el, state, productName).catch((err) => {
      console.error('[vtkCastClient] SCENEVIEW layout failed', err);
    });
  };
  productSpan.addEventListener('click', activate);
  productSpan.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });
  el.statusText.appendChild(productSpan);
  updateStatusMeta(el, state);
}

function clearImageDisplayRequesters(state) {
  state.imageDisplaySubscribersByProduct = new Map();
}

function refreshImageDisplayConnectionStatus(el, state) {
  const byProduct = state.imageDisplaySubscribersByProduct;
  if (!byProduct || byProduct.size === 0) {
    setConnection(el, state, 'connected', 'Websocket connected');
    return;
  }
  let bestProduct = '';
  let bestCount = 0;
  byProduct.forEach((subscribers, product) => {
    const count = subscribers.size;
    if (count > bestCount) {
      bestCount = count;
      bestProduct = product;
    }
  });
  if (bestProduct) {
    setImageDisplayConnectionStatus(
      el,
      state,
      'connected',
      bestProduct,
      bestCount,
      byProduct.get(bestProduct)
    );
  }
}

function updateStatusForIncomingContextRequest(el, state, message) {
  const ids = contextRequestProductAndSubscriber(message);
  if (!ids) {
    return;
  }
  const { product, subscriber } = ids;
  if (!state.imageDisplaySubscribersByProduct) {
    state.imageDisplaySubscribersByProduct = new Map();
  }
  if (!state.imageDisplaySubscribersByProduct.has(product)) {
    state.imageDisplaySubscribersByProduct.set(product, new Set());
  }
  state.imageDisplaySubscribersByProduct.get(product).add(subscriber);
  refreshImageDisplayConnectionStatus(el, state);
}

function handleSubscriptionRemoved(el, state, message) {
  const event = message?.event;
  if (!event || getHubEventLower(event) !== 'subscription-removed') {
    return false;
  }
  const ids = contextRequestProductAndSubscriber(message);
  if (!ids) {
    return false;
  }
  const { product, subscriber } = ids;
  const subscribers = state.imageDisplaySubscribersByProduct?.get(product);
  if (subscribers) {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      state.imageDisplaySubscribersByProduct.delete(product);
    }
  }
  refreshImageDisplayConnectionStatus(el, state);
  return true;
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

  updateStatusForIncomingContextRequest(el, state, message);

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

function collectSceneviewViewportThumbnails(
  sceneviewData,
  productName,
  subscriber
) {
  const entries = [];
  const viewports =
    sceneviewData &&
    typeof sceneviewData === 'object' &&
    Array.isArray(sceneviewData.viewports)
      ? sceneviewData.viewports
      : [];
  viewports.forEach((vp, idx) => {
    const thumb = vp && vp.thumbnail;
    if (!isCastImageBinaryNode(thumb)) {
      return;
    }
    const url = imageToObjectUrl(thumb.contentType, thumb.data);
    if (!url) {
      return;
    }
    const name = (vp && (vp.name || vp.viewId)) || `viewport-${idx + 1}`;
    const label = productName ? `${name} (${productName})` : name;
    entries.push({ url, subscriber, productName, label });
  });
  return entries;
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

function setOpenViewerButtonsEnabled(el, enabled) {
  const disabled = !enabled;
  el.openTopicViewerBtn.disabled = disabled;
  el.openVolViewBtn.disabled = disabled;
  el.startSlicerBtn.disabled = disabled;
}

function setHubAdminPortalButtonsEnabled(el, enabled) {
  const disabled = !enabled;
  el.hubAdminPortalBtn.disabled = disabled;
  el.openHubBtn.disabled = disabled;
}

function getCastViewerPopupFeatures() {
  const popupWidth = 800;
  const popupHeight = 600;
  const left = Math.max(0, Math.floor((window.screen.width - popupWidth) / 2));
  const top = Math.max(0, Math.floor((window.screen.height - popupHeight) / 2));
  return [
    'popup',
    `width=${popupWidth}`,
    `height=${popupHeight}`,
    `left=${left}`,
    `top=${top}`,
    'noopener',
    'noreferrer',
  ].join(',');
}

function openHubAdminPortal(el) {
  if (el.hubSelect.value === 'local') {
    window.open(
      'http://localhost:2018/api/hub/admin',
      'castAdminPortalWindow',
      getCastViewerPopupFeatures()
    );
    return;
  }
  const base = el.hubEndpoint.value.trim();
  const hubBase = base.endsWith('/') ? base : `${base}/`;
  const url = new URL('admin', hubBase).href;
  window.open(url, 'castAdminPortalWindow', getCastViewerPopupFeatures());
}

function openCastViewer(el, state, viewerKind) {
  const isLocal = el.hubSelect.value === 'local';
  let viewerBaseUrl;
  if (viewerKind === 'volview') {
    viewerBaseUrl = isLocal
      ? VOLVIEW_VIEWER_URL_LOCAL
      : VOLVIEW_VIEWER_URL_CLOUD;
  } else {
    viewerBaseUrl = isLocal ? OHIF_VIEWER_URL_LOCAL : OHIF_VIEWER_URL_CLOUD;
  }
  const url = new URL(viewerBaseUrl);
  const token = state.client?.getConnectionState?.().token?.trim();
  if (token) {
    url.searchParams.set('id-token', token);
  }
  window.open(url.toString(), 'castViewerWindow', getCastViewerPopupFeatures());
}

function applyWebsocketStatus(el, state, wsState) {
  switch (wsState) {
    case 'connecting':
      setConnection(el, state, 'connecting', 'Websocket connecting');
      break;
    case 'connected':
      clearImageDisplayRequesters(state);
      setConnection(el, state, 'connected', 'Websocket connected');
      break;
    case 'error':
      clearImageDisplayRequesters(state);
      setConnection(el, state, 'error', 'Websocket error');
      break;
    case 'disconnected':
    default:
      clearImageDisplayRequesters(state);
      setConnection(el, state, 'disconnected', 'Websocket disconnected');
      break;
  }
}

function applyHubPreset(el, state, hubKey) {
  const hubDef = HUB_DEFINITIONS[hubKey];
  el.hubEndpoint.value = hubDef.hubEndpoint;
  el.authorizeEndpoint.value = hubDef.authorizeEndpoint || '';
  el.tokenEndpoint.value = hubDef.authEndpoint;
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
  const storedUserName = getStoredCastUserName();
  return {
    subscriberName: el.subscriberName.value.trim() || undefined,
    productName: el.productName.value.trim() || EXAMPLE_PRODUCT_NAME,
    productVersion: el.productVersion.value.trim() || '1.0',
    actors: actorsList.length ? actorsList : undefined,
    topic: el.topic.value.trim(),
    events: parseEvents(el.events.value),
    lease: 7200,
    defaultTargetActor: DEFAULT_TARGET_ACTOR_KEYWORD,
    userName: storedUserName || undefined,
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
      handleSubscriptionRemoved(el, state, message);
      handleIncomingGetRequest(el, state, message);
      addMessage(
        el,
        state,
        'received',
        'Received',
        sanitizeCastMessageForDisplay(message)
      );
    });
    state.client.onConnectionStateChange((wsState) => {
      applyWebsocketStatus(el, state, wsState);
      if (wsState === 'connected') {
        el.subscribeBtn.disabled = true;
        el.unsubscribeBtn.disabled = false;
        el.startConferenceBtn.disabled = false;
        setOpenViewerButtonsEnabled(el, true);
        el.publishBtn.disabled = false;
        el.getBtn.disabled = false;
      } else if (wsState === 'disconnected' || wsState === 'error') {
        el.subscribeBtn.disabled = false;
        el.unsubscribeBtn.disabled = true;
        el.startConferenceBtn.disabled = true;
        setOpenViewerButtonsEnabled(el, false);
        el.publishBtn.disabled = true;
        el.getBtn.disabled = true;
      }
    });
  }
  state.client.setTopic(el.topic.value.trim());
  const storedUserName = getStoredCastUserName();
  if (storedUserName) {
    state.client.setUserName(storedUserName);
  }
  return state.client;
}

async function handleAuthenticate(el, state) {
  setConnection(el, state, 'connecting', 'Authenticating');
  el.tokenBtn.disabled = true;
  el.subscribeBtn.disabled = true;
  setHubAdminPortalButtonsEnabled(el, false);
  try {
    const castClient = ensureClient(el, state, true);
    const storedUserName = getStoredCastUserName();
    if (storedUserName) {
      castClient.setUserName(storedUserName);
    }
    const result = await castClient.authenticate();
    const userName = result?.user_name || storedUserName || '';
    const code = result?.code || '';
    if (userName) {
      setStoredCastUserName(userName);
      state.lastAuthUserName = userName;
    }
    state.lastAuthCode = code;
    if (!code) {
      setConnection(el, state, 'disconnected', 'Authenticate failed');
      addMessage(el, state, 'err', 'Authenticate error', 'No code returned');
      return;
    }
    el.tokenBtn.disabled = false;
    setConnection(el, state, 'token-ready', `${userName} code obtained`);
    addMessage(el, state, 'received', 'Authenticated', {
      user_name: userName,
      code,
    });
  } catch (error) {
    state.lastAuthCode = '';
    el.tokenBtn.disabled = true;
    setConnection(el, state, 'disconnected', 'Authenticate failed');
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
  setConnection(el, state, 'connecting', 'Getting token');
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
      setHubAdminPortalButtonsEnabled(el, false);
      setConnection(el, state, 'disconnected', 'Token failed');
      addMessage(el, state, 'err', 'Token error', 'Failed to get token');
      return;
    }
    el.subscribeBtn.disabled = false;
    setHubAdminPortalButtonsEnabled(el, true);
    setConnection(el, state, 'token-ready', 'Access token ready');
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
    setHubAdminPortalButtonsEnabled(el, false);
    setConnection(el, state, 'disconnected', 'Token error');
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
    return true;
  }
  setConnection(
    el,
    state,
    'disconnected',
    `Subscribe failed (${String(result)})`
  );
  return false;
}

/** Hub is already selected; run authenticate → authorize → subscribe on load. */
async function autoConnectOnLoad(el, state) {
  if (isFhircastV3Standard(el.castStandardSelect.value)) {
    return;
  }
  console.info('[vtkCastClient] auto-connect: authenticate');
  await handleAuthenticate(el, state);
  if (!state.lastAuthCode) {
    console.warn('[vtkCastClient] auto-connect stopped: authenticate failed');
    return;
  }

  console.info('[vtkCastClient] auto-connect: authorize');
  await handleGetToken(el, state);
  const token = state.client?.getConnectionState?.()?.token;
  if (!token) {
    console.warn('[vtkCastClient] auto-connect stopped: authorize failed');
    return;
  }

  console.info('[vtkCastClient] auto-connect: subscribe');
  const subscribed = await handleSubscribe(el, state);
  console.info('[vtkCastClient] auto-connect done, subscribed=', subscribed);
}

async function handleUnsubscribe(el, state) {
  if (!state.client) {
    return;
  }
  await state.client.unsubscribe();
  el.unsubscribeBtn.disabled = true;
  el.startConferenceBtn.disabled = true;
  setOpenViewerButtonsEnabled(el, false);
  el.publishBtn.disabled = true;
  el.getBtn.disabled = true;
  el.subscribeBtn.disabled = false;
  setConnection(el, state, 'disconnected', 'Websocket disconnected');
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

  const dataTypeToken = (el.getDataType.value || '').trim().toUpperCase();
  let responseText;
  if (typeof result.data === 'string') {
    responseText = result.data;
  } else if (dataTypeToken === 'SCENEVIEW') {
    responseText = JSON.stringify(
      redactSceneviewPayloadForLog(result.data),
      null,
      2
    );
  } else {
    responseText = JSON.stringify(result.data, null, 2);
  }
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
    if (dataTypeToken === 'SCENEVIEW') {
      responses.forEach((item, idx) => {
        const data = item && item.data;
        const viewports =
          data && typeof data === 'object' && Array.isArray(data.viewports)
            ? data.viewports
            : [];
        const product =
          data && typeof data === 'object' && data.product
            ? String(data.product)
            : (item && item.productName) || `responder-${idx + 1}`;
        parts.push(`${product}: ${viewports.length} viewport(s)`);
      });
    }
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
    if (dataTypeToken === 'SCENEVIEW') {
      collected.push(
        ...collectSceneviewViewportThumbnails(
          item && item.data,
          productName,
          subscriber
        )
      );
      return;
    }
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
  castExampleRootElement = root;
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
    openVolViewBtn: byId('openVolViewBtn'),
    openOhifBtn: byId('openOhifBtn'),
    startSlicerBtn: byId('startSlicerBtn'),
    openHubBtn: byId('openHubBtn'),
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
    statusMeta: byId('statusMeta'),
    connectionStatus: byId('connectionStatus'),
    messageCount: byId('messageCount'),
    getResponseData: byId('getResponseData'),
    worklistContextDisplay: byId('worklistContextDisplay'),
    worklistSpecialitySelect: byId('worklistSpecialitySelect'),
    worklistPanel: byId('worklistPanel'),
    castStandardSelect: byId('castStandardSelect'),
    headerTitleMain: byId('headerTitleMain'),
    castMainContent: byId('castMainContent'),
    castFhircastComingSoon: byId('castFhircastComingSoon'),
  };

  const state = {
    client: null,
    messageCount: 0,
    retrievedImages: [],
    selectedClientId: '',
    selectedClientSecret: '',
    lastImagingStudyOpenContext: [],
    imageDisplaySubscribersByProduct: new Map(),
    openWorklistSampleId: null,
    sceneviewLayoutBusy: false,
    lastAuthCode: '',
    lastAuthUserName: getStoredCastUserName(),
    defaultTopic:
      new URLSearchParams(window.location.search).get('topic') || '',
  };

  updateWorklistContextDisplay(el, state);

  applyCastStandardToPage(el, el.castStandardSelect.value);
  el.castStandardSelect.addEventListener('change', () => {
    applyCastStandardToPage(el, el.castStandardSelect.value);
  });

  el.worklistSpecialitySelect.addEventListener('change', () => {
    renderWorklistPanel(
      el.worklistPanel,
      el.worklistSpecialitySelect.value,
      el,
      state
    );
    updateWorklistContextControls(el, state);
  });
  renderWorklistPanel(
    el.worklistPanel,
    el.worklistSpecialitySelect.value,
    el,
    state
  );
  updateWorklistContextControls(el, state);

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
    const isSceneview = normalized === 'SCENEVIEW';
    el.getActorPreset.value = isImageType ? 'ID' : DEFAULT_GET_ACTOR_KEYWORD;
    el.getTargetActorPreset.value =
      isImageType || isSceneview ? 'ID' : DEFAULT_TARGET_ACTOR_KEYWORD;
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

  const pageInCloud = isRunningInCloud();
  const hubClassifications = HUB_PRESET_ORDER.map((key) => ({
    key,
    hubInCloud: isHubEndpointInCloud(HUB_DEFINITIONS[key].hubEndpoint),
  }));
  const hubKey =
    selectFirstMatchingHubKey(HUB_DEFINITIONS, HUB_PRESET_ORDER, pageInCloud) ||
    'local';
  const storedUserName = getStoredCastUserName();
  console.info(
    '[vtkCastClient] inCloud=',
    pageInCloud,
    'hubs=',
    hubClassifications,
    'selected=',
    hubKey,
    'user=',
    storedUserName || '(new)'
  );
  el.hubSelect.value = hubKey;
  applyHubPreset(el, state, hubKey);
  el.topic.value = state.defaultTopic;
  el.productName.value = EXAMPLE_PRODUCT_NAME;
  const initialSubscriberName = generateSubscriberName(
    EXAMPLE_SUBSCRIBER_PREFIX
  );
  el.subscriberName.value = initialSubscriberName;
  el.getSubscriber.value = initialSubscriberName;
  const refreshStatusMeta = () => updateStatusMeta(el, state);
  el.subscriberName.addEventListener('input', refreshStatusMeta);
  el.topic.addEventListener('input', refreshStatusMeta);
  refreshStatusMeta();
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
    el.productName.value = EXAMPLE_PRODUCT_NAME;
    updateStatusMeta(el, state);
  });

  const castHubSection = document.getElementById('castHubSection');
  if (castHubSection) {
    const castHubOpenKey = 'castExample.castHubOpen';
    const savedOpen = localStorage.getItem(castHubOpenKey);
    if (savedOpen !== null) {
      castHubSection.open = savedOpen === 'true';
    }
    castHubSection.addEventListener('toggle', () => {
      localStorage.setItem(castHubOpenKey, String(castHubSection.open));
    });
  }

  el.instructionsBtn.addEventListener('click', () => {
    openInstructionsWindow(el.castStandardSelect.value);
  });

  el.hubAdminPortalBtn.addEventListener('click', () => {
    try {
      openHubAdminPortal(el);
    } catch (err) {
      addMessage(el, state, 'err', 'Hub Admin', 'Invalid hub_endpoint URL');
    }
  });
  el.openHubBtn.addEventListener('click', () => {
    try {
      openHubAdminPortal(el);
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

  el.openVolViewBtn.addEventListener('click', () =>
    openCastViewer(el, state, 'volview')
  );
  el.openOhifBtn.addEventListener('click', () =>
    openCastViewer(el, state, 'ohif')
  );
  el.openTopicViewerBtn.addEventListener('click', () =>
    openCastViewer(el, state, el.viewerSelect.value)
  );

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

  autoConnectOnLoad(el, state).catch((err) => {
    console.error('[vtkCastClient] auto-connect failed', err);
  });
}

boot();
