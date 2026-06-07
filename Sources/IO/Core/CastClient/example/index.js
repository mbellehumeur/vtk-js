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
  buildDicomUrlImagingStudyOpenContext,
  buildFilesImagingStudyOpenContext,
  buildIdcImagingStudyOpenContext,
  CAST_OPEN_MODE_DICOM_URL,
  extractVolviewSampleId,
  generateSubscriberName,
  isHubEndpointInCloud,
  isRunningInCloud,
  selectFirstMatchingHubKey,
} from 'vtk.js/Sources/IO/Core/CastClient';
import html2canvas from 'html2canvas';
import { isRequestEvent, requestEventFor } from '../eventNames';
import idcPortalDemoSeries2 from './idc-data/idc-portal-demo-series-2.json';
import idcLungScreenManifest from './idc-data/idc-lung-screen-manifest.json';

import style from './CastClient.module.css';

const CAST_RADIO_ICON_SVG = `<svg class="${style.castHeaderStatusSvg}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>`;

// Same gear icon as OHIF ViewerHeader (Icons.GearSettings).
const CAST_SETTINGS_ICON_SVG = `<svg class="${style.castHeaderMenuBtnIcon}" width="20" height="20" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20.2015688,10.2525279 C20.0232123,10.6274217 20.0120959,11.0603422 20.1709774,11.4438954 C20.3298588,11.8274487 20.6438515,12.1256974 21.0350638,12.2646554 L22.0250838,12.6168364 C22.6105106,12.8246232 23.00167,13.3785255 23.00167,13.9997339 C23.00167,14.6209423 22.6105106,15.1748446 22.0250838,15.3826314 L21.0350638,15.7348124 C20.6438515,15.8737704 20.3298588,16.1720191 20.1709774,16.5555724 C20.0120959,16.9391256 20.0232123,17.3720461 20.2015688,17.7469399 L20.6539257,18.6946982 C20.9219287,19.2558525 20.8071211,19.9250005 20.367394,20.3647276 C19.9276669,20.8044547 19.2585189,20.9192624 18.6973645,20.6512594 L17.748041,20.2004677 C17.3731472,20.0221111 16.9402267,20.0109948 16.5566735,20.1698763 C16.1731202,20.3287577 15.8748715,20.6427504 15.7359135,21.0339627 L15.3837325,22.0239827 C15.1756233,22.6088399 14.6220059,22.9994678 14.0012263,22.9994678 C13.3804467,22.9994678 12.8268293,22.6088399 12.6187202,22.0239827 L12.2665391,21.0339627 C12.127404,20.6426994 11.8290064,20.3287067 11.4453321,20.1698369 C11.0616578,20.0109671 10.6286351,20.0220972 10.253629,20.2004677 L9.30587073,20.6512594 C8.7446872,20.9203194 8.07479926,20.8059063 7.63473092,20.365838 C7.19466259,19.9257696 7.08024945,19.2558817 7.34930952,18.6946982 L7.80010123,17.7453747 C7.97845774,17.3704809 7.98957409,16.9375604 7.83069263,16.5540071 C7.67181118,16.1704539 7.35781846,15.8722052 6.96660615,15.7332471 L5.97658618,15.3810661 C5.39115942,15.1732793 5,14.619377 5,13.9981686 C5,13.3769603 5.39115942,12.8230579 5.97658618,12.6152712 L6.96660615,12.2630902 C7.35740035,12.124078 7.67105878,11.8260915 7.82990186,11.4429292 C7.98874494,11.0597669 7.97791757,10.6272622 7.80010123,10.2525279 L7.34930952,9.30320437 C7.08024945,8.74202085 7.19466259,8.0721329 7.63473092,7.63206456 C8.07479926,7.19199623 8.7446872,7.07758309 9.30587073,7.34664317 L10.2551942,7.79743487 C10.6298363,7.97533367 11.0622628,7.98639209 11.445508,7.82787471 C11.8287532,7.66935733 12.1270239,7.35606892 12.2665391,6.96550504 L12.6187202,5.97548507 C12.8268293,5.39062793 13.3804467,5 14.0012263,5 C14.6220059,5 15.1756233,5.39062793 15.3837325,5.97548507 L15.7359135,6.96550504 C15.8748715,7.35671735 16.1731202,7.67071008 16.5566735,7.82959153 C16.9402267,7.98847298 17.3731472,7.97735664 17.748041,7.79900012 L18.6973645,7.34664317 C19.2585189,7.07864018 19.9276669,7.19344783 20.367394,7.63317492 C20.8071211,8.07290202 20.9219287,8.74204999 20.6539257,9.30320437 L20.2015688,10.2525279 Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14.000835" cy="13.9997339" r="3.52181017" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// VolView mark only (from volview-logo.svg icon clip, no wordmark).
const VOLVIEW_MARK_SVG = `<svg class="${style.headerViewerBtnIconVolview}" viewBox="0.78 0.31 34 33" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M33.2403 22.3722C33.189 22.4501 33.1376 22.554 33.0606 22.632C31.7509 24.3989 29.0545 25.1265 25.6905 24.6588C25.5364 24.6328 25.3823 24.6068 25.2282 24.5808C23.1995 24.243 20.9911 23.4895 18.7826 22.3722C17.4729 21.6966 16.1633 20.8651 14.905 19.9037C13.5439 18.8643 12.3113 17.747 11.2584 16.5517C9.58926 14.7068 8.35663 12.758 7.56056 10.8871C6.25089 7.79499 6.25089 5.04066 7.53488 3.24774C8.84455 1.48082 11.4125 0.805225 14.6225 1.29893C16.2146 1.53278 17.9609 2.07845 19.7584 2.88396C21.5303 3.68948 23.3536 4.75483 25.1255 6.10601C28.6693 8.78239 31.34 12.0304 32.7781 15.0966C34.1648 18.0068 34.3445 20.6052 33.2403 22.3722Z" fill="#3EAE2B"/><path d="M30.1331 18.0068C30.1331 18.5005 30.0304 18.9422 29.8506 19.332C29.7993 19.4619 29.7222 19.5918 29.6195 19.7217C29.2086 20.2934 28.541 20.6572 27.6422 20.8391C26.7434 21.021 25.6648 20.969 24.4579 20.7351C22.044 20.2674 19.2706 18.9942 16.831 17.1753C16.8053 17.1493 16.7539 17.1233 16.7283 17.0973C14.3657 15.2784 12.5681 13.0698 11.5666 11.017C10.5394 8.91229 10.4624 7.06741 11.3098 5.9241C12.1316 4.78079 13.9035 4.443 16.189 4.91071C18.4745 5.37843 21.1195 6.65166 23.5334 8.49654C25.9473 10.3414 27.9503 12.5761 29.1059 14.6808C29.7993 15.9021 30.1331 17.0454 30.1331 18.0068Z" fill="#3EAE2B"/><path d="M26.3068 17.2533C26.1271 17.4871 25.8189 17.6431 25.3567 17.721C24.8944 17.773 24.3038 17.747 23.6105 17.5651C22.2494 17.2273 20.6059 16.4478 19.0651 15.2785C17.5243 14.1092 16.3431 12.784 15.6754 11.5627C15.3416 10.9651 15.1618 10.4194 15.0848 9.95171C15.0334 9.484 15.1105 9.17219 15.2902 8.93833C15.47 8.70447 15.7524 8.52258 16.2147 8.47061C16.6512 8.41864 17.2162 8.44463 17.8839 8.60053C18.5259 8.75644 19.2706 9.04227 20.0153 9.43203C20.76 9.82179 21.5561 10.3155 22.3008 10.9131C23.8416 12.0824 25.0742 13.4076 25.7932 14.6029C26.1528 15.2005 26.3582 15.7462 26.4352 16.2139C26.5379 16.7076 26.4609 17.0454 26.3068 17.2533Z" fill="#3EAE2B"/><path d="M27.0001 17.565C26.769 18.1627 26.5379 18.6044 26.1527 19.1501C23.8415 22.2682 19.0137 22.7099 15.624 20.1375C12.2343 17.565 11.3612 12.758 13.6467 9.63984C14.1089 9.06819 14.4427 8.67843 14.982 8.23669C14.8793 8.31465 14.8022 8.3926 14.7252 8.49654C14.3914 8.93827 14.3143 9.48394 14.3914 10.0556C14.4684 10.6272 14.6995 11.2769 15.059 11.9265C15.7781 13.2257 17.0364 14.6548 18.6542 15.8761C20.272 17.0973 21.9926 17.9288 23.482 18.2666C24.2267 18.4485 24.9201 18.5005 25.485 18.4225C26.0757 18.3446 26.5893 18.1107 26.9231 17.669C26.9488 17.669 26.9745 17.617 27.0001 17.565Z" fill="#0068C7"/><path d="M30.5696 19.7737C30.2615 20.7092 29.1316 22.4241 28.4382 23.2036C24.7917 28.1147 17.1391 28.9722 11.6436 24.8147C6.17386 20.7351 5.17235 12.4462 8.81888 7.50916C9.38383 6.75562 10.334 5.56034 11.1557 4.85876C10.976 5.01467 10.7962 5.19656 10.6421 5.40443C9.51223 6.93751 9.76903 9.17215 10.8219 11.3808C11.9004 13.6155 13.8264 15.954 16.3174 17.8509C17.5757 18.8123 18.911 19.6178 20.272 20.2414C21.6331 20.8651 22.9941 21.3328 24.2524 21.5666C25.5364 21.8265 26.7177 21.8784 27.7449 21.6706C28.7721 21.4627 29.6452 21.021 30.2358 20.2414C30.3899 20.0855 30.4926 19.9296 30.5696 19.7737Z" fill="#0068C7"/><path d="M34.2675 22.1643C33.7025 23.6974 32.6497 25.5942 31.1859 27.3092C25.2796 34.1171 15.059 35.3903 7.71463 29.8037C0.395901 24.2691 -1.32464 14.1092 3.47747 6.39189C4.55602 4.65094 6.63608 2.59819 7.86871 1.71472C7.84303 1.74071 7.14968 2.39031 6.8672 2.78008C5.30074 4.91078 5.42913 8.05488 6.79016 11.225C8.15119 14.447 10.7705 17.825 14.3914 20.5793C16.2146 21.9565 18.1149 23.0478 20.0152 23.8793C21.9155 24.7108 23.8158 25.2305 25.5621 25.4903C29.0545 25.958 32.1361 25.2824 33.7026 23.1517C33.9337 22.8399 34.1391 22.5021 34.2675 22.1643Z" fill="#0068C7"/></svg>`;

// OHIF 4-pane grid mark (from OHIFLogo toolbar icon).
const OHIF_MARK_SVG = `<svg class="${style.headerViewerBtnIcon}" width="16" height="16" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="currentColor" fill-rule="nonzero" stroke="currentColor" stroke-width="0.25"><path d="M20.874737,0 L14.2607623,0 C13.3583609,0 12.6268201,0.731540857 12.6268201,1.63394224 L12.6268201,8.24791696 C12.6268201,9.15031834 13.3583609,9.88185919 14.2607623,9.88185919 L20.874737,9.88185919 C21.7771384,9.88185919 22.5086793,9.15031834 22.5086793,8.24791696 L22.5086793,1.63394224 C22.5086793,0.731540857 21.7771384,0 20.874737,0 Z M14.2607623,0.653576894 L20.874737,0.653576894 C21.4161779,0.653576894 21.8551024,1.09250141 21.8551024,1.63394224 L21.8551024,8.24791696 C21.8551024,8.78935779 21.4161779,9.2282823 20.874737,9.2282823 L14.2607623,9.2282823 C13.7193215,9.2282823 13.280397,8.78935779 13.280397,8.24791696 L13.280397,1.63394224 C13.280397,1.09250141 13.7193215,0.653576894 14.2607623,0.653576894 Z"/><path d="M8.24791696,0 L1.63394224,0 C0.731540857,0 0,0.731540857 0,1.63394224 L0,8.24791696 C0,9.15031834 0.731540857,9.88185919 1.63394224,9.88185919 L8.24791696,9.88185919 C9.15031834,9.88185919 9.88185919,9.15031834 9.88185919,8.24791696 L9.88185919,1.63394224 C9.88185919,0.731540857 9.15031834,0 8.24791696,0 Z M1.63394224,0.653576894 L8.24791696,0.653576894 C8.78935779,0.653576894 9.2282823,1.09250141 9.2282823,1.63394224 L9.2282823,8.24791696 C9.2282823,8.78935779 8.78935779,9.2282823 8.24791696,9.2282823 L1.63394224,9.2282823 C1.09250141,9.2282823 0.653576894,8.78935779 0.653576894,8.24791696 L0.653576894,1.63394224 C0.653576894,1.09250141 1.09250141,0.653576894 1.63394224,0.653576894 Z"/><path d="M20.874737,12.6268201 L14.2607623,12.6268201 C13.3583609,12.6268201 12.6268201,13.3583609 12.6268201,14.2607623 L12.6268201,20.874737 C12.6268201,21.7771384 13.3583609,22.5086793 14.2607623,22.5086793 L20.874737,22.5086793 C21.7771384,22.5086793 22.5086793,21.7771384 22.5086793,20.874737 L22.5086793,14.2607623 C22.5086793,13.3583609 21.7771384,12.6268201 20.874737,12.6268201 Z M14.2607623,13.280397 L20.874737,13.280397 C21.4161779,13.280397 21.8551024,13.7193215 21.8551024,14.2607623 L21.8551024,20.874737 C21.8551024,21.4161779 21.4161779,21.8551024 20.874737,21.8551024 L14.2607623,21.8551024 C13.7193215,21.8551024 13.280397,21.4161779 13.280397,20.874737 L13.280397,14.2607623 C13.280397,13.7193215 13.7193215,13.280397 14.2607623,13.280397 Z"/><path d="M8.24791696,12.6268201 L1.63394224,12.6268201 C0.731540857,12.6268201 0,13.3583609 0,14.2607623 L0,20.874737 C0,21.7771384 0.731540857,22.5086793 1.63394224,22.5086793 L8.24791696,22.5086793 C9.15031834,22.5086793 9.88185919,21.7771384 9.88185919,20.874737 L9.88185919,14.2607623 C9.88185919,13.3583609 9.15031834,12.6268201 8.24791696,12.6268201 Z M1.63394224,13.280397 L8.24791696,13.280397 C8.78935779,13.280397 9.2282823,13.7193215 9.2282823,14.2607623 L9.2282823,20.874737 C9.2282823,21.4161779 8.78935779,21.8551024 8.24791696,21.8551024 L1.63394224,21.8551024 C1.09250141,21.8551024 0.653576894,21.4161779 0.653576894,20.874737 L0.653576894,14.2607623 C0.653576894,13.7193215 1.09250141,13.280397 1.63394224,13.280397 Z"/></g></svg>`;

const CAST_THEME_STORAGE_KEY = 'castExample.theme';
const CAST_THEME_DARK = 'dark';
const CAST_THEME_LIGHT = 'light';

const CAST_HEADER_STATUS_COLOR_CLASSES = [
  style.castHeaderStatusConnected,
  style.castHeaderStatusConnecting,
  style.castHeaderStatusError,
  style.castHeaderStatusIdle,
];

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

const WORKLIST_ORG_VOLVIEW = 'volview';
const WORKLIST_ORG_SLICER = 'slicer';
const WORKLIST_ORG_IDC = 'idc';
const WORKLIST_ORG_IDC_LUNG = 'idc-lung-screen';
const WORKLIST_ORG_HUB = 'hub';

const WORKLIST_ORGANIZATION_OPTIONS = [
  { value: '', label: 'All organizations' },
  { value: WORKLIST_ORG_HUB, label: 'Hub samples' },
  { value: WORKLIST_ORG_VOLVIEW, label: 'VolView samples' },
  { value: WORKLIST_ORG_SLICER, label: '3D Slicer samples' },
  { value: WORKLIST_ORG_IDC, label: 'Imaging Data Commons' },
  { value: WORKLIST_ORG_IDC_LUNG, label: 'IDC - CT Lung Screenings' },
];

const WORKLIST_ORG_LABELS = {
  [WORKLIST_ORG_HUB]: 'Hub samples',
  [WORKLIST_ORG_VOLVIEW]: 'VolView samples',
  [WORKLIST_ORG_SLICER]: '3D Slicer samples',
  [WORKLIST_ORG_IDC]: 'Imaging Data Commons',
  [WORKLIST_ORG_IDC_LUNG]: 'IDC - CT Lung Screenings',
};

function withWorklistOrganization(studies, organization) {
  return studies.map((study) => ({ ...study, organization }));
}

/* Slicer SampleData URLs (all SLICER_SAMPLE_STUDIES entries commented out).
const SLICER_TESTING_DATA_URL =
  'https://github.com/Slicer/SlicerTestingData/releases/download/';
const SLICER_DATA_STORE_URL =
  'https://github.com/Slicer/SlicerDataStore/releases/download/';
*/

const EXAMPLE_PAGE_TITLE_SUB = 'vtk.js IO module cast example';

const CAST_ABOUT_BODY_TEXT =
  'Cast worklist client example built on vtk.js CastClient. Connect to a Cast hub, browse sample studies, and coordinate VolView, OHIF, and other Cast subscribers over FHIRcast events.';

const CAST_STANDARD_CAST = 'cast';
const CAST_STANDARD_FHIRCAST_V3 = 'fhircast-v3';
const CAST_STANDARD_DEFAULT = CAST_STANDARD_CAST;
const FHIRCAST_V3_COMING_SOON_MESSAGE =
  'FHIRcast v3.0 is coming this fall to this client library !';

const TITLE_BY_CAST_STANDARD = {
  [CAST_STANDARD_CAST]: 'Imaging Worklist',
  [CAST_STANDARD_FHIRCAST_V3]: 'Worklist with FHIRcast interface',
};

function titleMainForCastStandard(standard) {
  return (
    TITLE_BY_CAST_STANDARD[standard] ||
    TITLE_BY_CAST_STANDARD[CAST_STANDARD_DEFAULT]
  );
}

function selectedCastStandard(el) {
  return el.castStandardSelect?.value || CAST_STANDARD_DEFAULT;
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
];

/**
 * Mirrors 3D Slicer SampleData ``registerBuiltInSampleDataSources()`` (General).
 * @see Slicer/Modules/Scripted/SampleData/SampleData.py
 */
const SLICER_SAMPLE_STUDIES = [
  /* NRRD / NRRD-header Slicer samples (OHIF Cast worklist cannot open these yet).
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
  */
];

/**
 * Curated IDC studies via direct bucket load (``open-mode`` = ``idc``).
 * Bucket URLs pre-resolved with idc-index; regenerate via scripts/generate-idc-worklist-data.py.
 * @see https://learn.canceridc.dev/data/downloading-data/direct-loading
 */
function idcWorklistEntry(data, name, description, size) {
  const fileCount = Array.isArray(data.files) ? data.files.length : 0;
  return {
    ...data,
    name,
    size: size || (fileCount ? `${fileCount} DICOM` : 'IDC direct'),
    description,
  };
}

const IDC_SAMPLE_STUDIES = [
  idcWorklistEntry(
    idcPortalDemoSeries2,
    'CT Chest',
    'CT Chest with SEG',
    '20 MB'
  ),
];

/** NLST lung screening CT — regenerate via scripts/generate-idc-lung-screen-worklist.py */
const IDC_LUNG_SCREEN_STUDIES = (
  Array.isArray(idcLungScreenManifest?.studies)
    ? idcLungScreenManifest.studies
    : []
).map((entry) =>
  idcWorklistEntry(
    entry,
    entry.name || entry.id,
    entry.description || 'NLST chest CT',
    entry.size
  )
);

const WORKLIST_BUILTIN_STUDIES = [
  ...withWorklistOrganization(VOLVIEW_SAMPLE_STUDIES, WORKLIST_ORG_VOLVIEW),
  ...withWorklistOrganization(SLICER_SAMPLE_STUDIES, WORKLIST_ORG_SLICER),
  ...withWorklistOrganization(IDC_SAMPLE_STUDIES, WORKLIST_ORG_IDC),
  ...withWorklistOrganization(IDC_LUNG_SCREEN_STUDIES, WORKLIST_ORG_IDC_LUNG),
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
const CAST_EXAMPLE_HUB_STARTED_AT_KEY = 'castExample.userName.hubStartedAt';
const CAST_EXAMPLE_HUB_ORIGIN_KEY = 'castExample.userName.hubOrigin';

/** Preset keys tried in order when matching page deployment (local vs cloud). */
const HUB_PRESET_ORDER = ['local', 'cloud'];

function getStoredCastUserName() {
  try {
    return localStorage.getItem(CAST_EXAMPLE_USER_NAME_KEY)?.trim() || '';
  } catch (err) {
    return '';
  }
}

function getStoredCastUserNameHubStartedAt() {
  try {
    return localStorage.getItem(CAST_EXAMPLE_HUB_STARTED_AT_KEY)?.trim() || '';
  } catch (err) {
    return '';
  }
}

function getStoredCastUserNameHubOrigin() {
  try {
    return localStorage.getItem(CAST_EXAMPLE_HUB_ORIGIN_KEY)?.trim() || '';
  } catch (err) {
    return '';
  }
}

function clearStoredCastUserName() {
  try {
    localStorage.removeItem(CAST_EXAMPLE_USER_NAME_KEY);
    localStorage.removeItem(CAST_EXAMPLE_HUB_STARTED_AT_KEY);
    localStorage.removeItem(CAST_EXAMPLE_HUB_ORIGIN_KEY);
  } catch (err) {
    // ignore quota / private mode
  }
}

function setStoredCastUserName(userName, hubStartedAt, hubOrigin) {
  const trimmed = String(userName || '').trim();
  try {
    if (trimmed) {
      localStorage.setItem(CAST_EXAMPLE_USER_NAME_KEY, trimmed);
      if (hubStartedAt) {
        localStorage.setItem(CAST_EXAMPLE_HUB_STARTED_AT_KEY, hubStartedAt);
      }
      if (hubOrigin) {
        localStorage.setItem(CAST_EXAMPLE_HUB_ORIGIN_KEY, hubOrigin);
      }
    } else {
      clearStoredCastUserName();
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

/** VolView: local Vite dev; cloud bundle on the same host as the hub API. */
const VOLVIEW_VIEWER_URL_LOCAL = 'http://localhost:5173/';
const VOLVIEW_VIEWER_HUB_PATH = '/volview-client/';

/** OHIF: viewer route on hub root SPA (`/viewer`); same in local dev. */
const OHIF_VIEWER_URL_LOCAL = 'http://localhost:3000/viewer/';
const OHIF_VIEWER_HUB_PATH = '/viewer/';

function hubOriginFromEndpoint(hubEndpoint) {
  const trimmed = String(hubEndpoint || '').trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

/** Same-origin SPA path as hub admin "Open VolView" (see cast_api Resources/admin.html). */
function bundledViewerBaseUrl(el, hubPath) {
  const origin =
    hubOriginFromEndpoint(el.hubEndpoint?.value) ||
    (typeof window !== 'undefined' ? window.location?.origin : null);
  if (!origin) {
    return null;
  }
  return new URL(hubPath, origin).href;
}

function resolveVolviewViewerBaseUrl(el) {
  if (el.hubSelect.value === 'local') {
    return VOLVIEW_VIEWER_URL_LOCAL;
  }
  return (
    bundledViewerBaseUrl(el, VOLVIEW_VIEWER_HUB_PATH) ||
    VOLVIEW_VIEWER_URL_LOCAL
  );
}

function resolveOhifViewerBaseUrl(el) {
  if (el.hubSelect.value === 'local') {
    return OHIF_VIEWER_URL_LOCAL;
  }
  return (
    bundledViewerBaseUrl(el, OHIF_VIEWER_HUB_PATH) || OHIF_VIEWER_URL_LOCAL
  );
}

function resolveHubMetricsUrl(hubEndpoint) {
  const trimmed = String(hubEndpoint || '').trim();
  if (!trimmed) {
    return null;
  }
  try {
    const base = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
    return new URL('admin/metrics', base).href;
  } catch {
    return null;
  }
}

async function fetchHubSampleStudies(hubEndpoint) {
  const origin = hubOriginFromEndpoint(hubEndpoint);
  if (!origin) {
    return [];
  }
  try {
    const response = await fetch(`${origin}/api/hub/samples`, {
      method: 'GET',
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    const studies = Array.isArray(data?.studies) ? data.studies : [];
    return studies.map((study) => ({
      ...study,
      organization: WORKLIST_ORG_HUB,
    }));
  } catch (err) {
    console.warn('[vtkCastClient] hub samples fetch failed', err);
    return [];
  }
}

function getWorklistStudies(state) {
  return [...WORKLIST_BUILTIN_STUDIES, ...(state.hubSampleStudies || [])];
}

async function fetchHubStartedAt(hubEndpoint) {
  const metricsUrl = resolveHubMetricsUrl(hubEndpoint);
  if (!metricsUrl) {
    return null;
  }
  try {
    const response = await fetch(metricsUrl, { method: 'GET' });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const started = data?.started_at;
    return typeof started === 'string' && started.trim()
      ? started.trim()
      : null;
  } catch {
    return null;
  }
}

/** Drop cached USER-n if the hub restarted (started_at changed) or hub host changed. */
async function syncStoredUserNameWithHub(el, state) {
  const hubEndpoint =
    el.hubEndpoint?.value?.trim() ||
    HUB_DEFINITIONS[el.hubSelect?.value || 'local']?.hubEndpoint ||
    '';
  const currentOrigin = hubOriginFromEndpoint(hubEndpoint) || '';
  const currentStartedAt = await fetchHubStartedAt(hubEndpoint);
  if (currentStartedAt) {
    state.hubStartedAt = currentStartedAt;
  }

  const storedUser = getStoredCastUserName();
  if (!storedUser) {
    return;
  }

  const storedStartedAt = getStoredCastUserNameHubStartedAt();
  const storedOrigin = getStoredCastUserNameHubOrigin();
  const hubRestarted =
    Boolean(currentStartedAt && storedStartedAt) &&
    storedStartedAt !== currentStartedAt;
  const hubChanged =
    Boolean(storedOrigin && currentOrigin) && storedOrigin !== currentOrigin;
  const missingHubBinding =
    Boolean(currentStartedAt) && (!storedStartedAt || !storedOrigin);

  if (hubRestarted || hubChanged || missingHubBinding) {
    console.info(
      '[vtkCastClient] discarding stored user name (hub restarted or changed)',
      {
        storedUser,
        storedStartedAt,
        currentStartedAt,
        storedOrigin,
        currentOrigin,
      }
    );
    clearStoredCastUserName();
    state.lastAuthUserName = '';
    if (state.client) {
      state.client.setUserName('');
    }
  }
}

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
  if (el.castAboutTitle) {
    el.castAboutTitle.textContent = titleMain;
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

      if (btn.dataset.worklistOpenDisabled === '1') {
        btn.disabled = true;
        btn.classList.remove(style.worklistOpenBtnClose);
        btn.textContent = 'Open';
        btn.dataset.worklistAction = 'open';
        btn.title =
          btn.dataset.worklistOpenDisabledReason ||
          'This study cannot be opened yet';
        return;
      }

      btn.disabled = false;
      btn.classList.toggle(style.worklistOpenBtnClose, hasContext && isOpenRow);

      if (!hasContext) {
        btn.textContent = 'Open';
        btn.dataset.worklistAction = 'open';
        btn.title = 'Open study';
        return;
      }
      if (isOpenRow) {
        btn.textContent = 'Close';
        btn.dataset.worklistAction = 'close';
        btn.title = 'Close the open study';
        return;
      }
      btn.textContent = 'Close and Open';
      btn.dataset.worklistAction = 'close-and-open';
      btn.title = 'Close the current study and open this one';
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

function findWorklistSample(sampleId, state) {
  return getWorklistStudies(state).find((entry) => entry.id === sampleId);
}

function worklistOrganizationLabel(sample) {
  return (
    WORKLIST_ORG_LABELS[sample?.organization] || sample?.organization || '—'
  );
}

function filterWorklistStudiesByOrganization(organization, state) {
  const studies = getWorklistStudies(state);
  if (!organization) {
    return studies;
  }
  return studies.filter((study) => study.organization === organization);
}

function isIdcWorklistSample(sample) {
  return Boolean(
    sample?.studyInstanceUID?.trim() &&
      Array.isArray(sample?.files) &&
      sample.files.length > 0
  );
}

function worklistSampleFiles(sample) {
  if (Array.isArray(sample.files) && sample.files.length > 0) {
    return sample.files;
  }
  return [{ url: sample.url, fileName: sample.filename }];
}

const WORKLIST_FORMAT_DICOM = 'DICOM';
const WORKLIST_FORMAT_NIFTI = 'NifTI';
const WORKLIST_FORMAT_NRRD = 'Nrrd';

function normalizeWorklistFormatLabel(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'dicom') {
    return WORKLIST_FORMAT_DICOM;
  }
  if (lower === 'nifti') {
    return WORKLIST_FORMAT_NIFTI;
  }
  if (lower === 'nrrd') {
    return WORKLIST_FORMAT_NRRD;
  }
  return trimmed;
}

function worklistFormatFromFileName(fileName) {
  const lower = String(fileName || '')
    .trim()
    .toLowerCase();
  if (!lower) {
    return '';
  }
  if (lower.endsWith('.nii') || lower.endsWith('.nii.gz')) {
    return WORKLIST_FORMAT_NIFTI;
  }
  if (
    lower.endsWith('.nrrd') ||
    lower.endsWith('.nhdr') ||
    lower.endsWith('.raw.gz')
  ) {
    return WORKLIST_FORMAT_NRRD;
  }
  if (
    lower.endsWith('.dcm') ||
    lower.endsWith('.dicom') ||
    lower.endsWith('.ima')
  ) {
    return WORKLIST_FORMAT_DICOM;
  }
  if (lower.endsWith('.zip')) {
    return WORKLIST_FORMAT_DICOM;
  }
  return '';
}

function worklistSampleFileNames(sample) {
  const names = [];
  if (Array.isArray(sample?.files)) {
    sample.files.forEach((file) => {
      if (file?.fileName) {
        names.push(file.fileName);
      }
    });
  }
  if (sample?.filename) {
    names.push(sample.filename);
  }
  return names;
}

function worklistSampleFormatLabel(sample) {
  const explicit = normalizeWorklistFormatLabel(sample?.format);
  if (explicit) {
    return explicit;
  }
  if (sample?.organization === WORKLIST_ORG_VOLVIEW) {
    return WORKLIST_FORMAT_NIFTI;
  }
  if (
    sample?.openMode === CAST_OPEN_MODE_DICOM_URL ||
    sample?.studyInstanceUID
  ) {
    return WORKLIST_FORMAT_DICOM;
  }
  const formats = [
    ...new Set(
      worklistSampleFileNames(sample)
        .map(worklistFormatFromFileName)
        .filter(Boolean)
    ),
  ];
  if (formats.length === 1) {
    return formats[0];
  }
  if (formats.length > 1) {
    if (formats.includes(WORKLIST_FORMAT_NIFTI)) {
      return WORKLIST_FORMAT_NIFTI;
    }
    if (formats.every((entry) => entry === WORKLIST_FORMAT_NRRD)) {
      return WORKLIST_FORMAT_NRRD;
    }
    return formats[0];
  }
  if (sample?.organization === WORKLIST_ORG_SLICER) {
    return WORKLIST_FORMAT_NRRD;
  }
  if (
    sample?.organization === WORKLIST_ORG_IDC ||
    sample?.organization === WORKLIST_ORG_IDC_LUNG
  ) {
    return WORKLIST_FORMAT_DICOM;
  }
  return '—';
}

function worklistSampleActionDisabledReason(sample) {
  if (worklistSampleFormatLabel(sample) === WORKLIST_FORMAT_NRRD) {
    return 'Nrrd format is not supported yet';
  }
  if (sample?.openDisabled) {
    return (
      String(sample.openDisabledReason || '').trim() ||
      'This study cannot be opened yet'
    );
  }
  return '';
}

function isWorklistSampleActionDisabled(sample) {
  return !!worklistSampleActionDisabledReason(sample);
}

async function handleWorklistSampleOpen(el, state, sampleId) {
  if (hasWorklistContext(state) && state.openWorklistSampleId === sampleId) {
    return;
  }
  if (hasWorklistContext(state)) {
    const closed = await publishImagingStudyClose(el, state);
    if (!closed) {
      return;
    }
  }
  const sample = findWorklistSample(sampleId, state);
  if (!sample) {
    addMessage(el, state, 'err', 'Open study', `Unknown sample: ${sampleId}`);
    return;
  }
  if (isWorklistSampleActionDisabled(sample)) {
    return;
  }
  const patientReference = 'Patient/503824b8-fe8c-4227-b061-7181ba6c3926';
  const files = worklistSampleFiles(sample);
  const openMode = String(sample.openMode || '').trim();
  let context;
  if (isIdcWorklistSample(sample)) {
    context = buildIdcImagingStudyOpenContext({
      id: sample.id,
      studyInstanceUID: sample.studyInstanceUID,
      seriesInstanceUID: sample.seriesInstanceUID,
      sourceBucket: sample.sourceBucket || 'aws',
      files: sample.files,
      patientReference,
    });
  } else if (openMode === CAST_OPEN_MODE_DICOM_URL) {
    context = buildDicomUrlImagingStudyOpenContext({
      id: sample.id,
      files,
      patientReference,
    });
  } else {
    context = buildFilesImagingStudyOpenContext({
      id: sample.id,
      files,
      patientReference,
    });
  }
  await publishImagingStudyOpen(el, state, context);
}

function handleWorklistRowBtnClick(el, state, sampleId, action) {
  if (action === 'close') {
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
  headerRow.className = style.worklistEntryHeaderRow;
  headerRow.setAttribute('aria-hidden', 'true');

  const headerClassByColumn = [
    style.worklistEntryOrg,
    style.worklistEntryTitle,
    style.worklistEntryDesc,
    style.worklistEntryFormat,
    style.worklistEntrySize,
  ];
  ['Organization', 'Study', 'Description', 'Format', 'Size'].forEach(
    (label, idx) => {
      const cell = document.createElement('div');
      cell.className = headerClassByColumn[idx] || style.worklistEntryDesc;
      cell.textContent = label;
      headerRow.append(cell);
    }
  );

  const headerBtnSpacer = document.createElement('span');
  headerBtnSpacer.className = style.worklistOpenBtnSpacer;
  headerBtnSpacer.textContent = 'Close and Open';
  headerRow.append(headerBtnSpacer);
  list.append(headerRow);

  sortWorklistStudiesBySize(studies).forEach((sample) => {
    const row = document.createElement('div');
    row.className = style.worklistEntry;

    const org = document.createElement('div');
    org.className = style.worklistEntryOrg;
    org.textContent = worklistOrganizationLabel(sample);

    const title = document.createElement('div');
    title.className = style.worklistEntryTitle;
    title.textContent = sample.name;

    const desc = document.createElement('div');
    desc.className = style.worklistEntryDesc;
    desc.textContent = sample.description;

    const format = document.createElement('div');
    format.className = style.worklistEntryFormat;
    format.textContent = worklistSampleFormatLabel(sample);

    const size = document.createElement('div');
    size.className = style.worklistEntrySize;
    size.textContent = worklistSampleSizeLabel(sample);

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = style.worklistOpenBtn;
    actionBtn.textContent = 'Open';
    actionBtn.dataset.sampleId = sample.id;
    actionBtn.dataset.worklistAction = 'open';
    const openDisabledReason = worklistSampleActionDisabledReason(sample);
    if (openDisabledReason) {
      actionBtn.disabled = true;
      actionBtn.dataset.worklistOpenDisabled = '1';
      actionBtn.dataset.worklistOpenDisabledReason = openDisabledReason;
      actionBtn.title = openDisabledReason;
    }
    actionBtn.addEventListener('click', () => {
      handleWorklistRowBtnClick(
        el,
        state,
        sample.id,
        actionBtn.dataset.worklistAction
      );
    });

    row.append(org, title, desc, format, size, actionBtn);
    list.append(row);
  });

  panelEl.append(list);
}

function renderWorklistPanel(panelEl, organizationFilter, el, state) {
  panelEl.replaceChildren();
  panelEl.classList.remove(style.worklistPanelList, style.worklistPanelEmpty);

  const studies = filterWorklistStudiesByOrganization(
    organizationFilter,
    state
  );
  if (!studies.length) {
    panelEl.classList.add(style.worklistPanelEmpty);
    panelEl.setAttribute('aria-label', 'Worklist studies (empty)');
    const msg = document.createElement('p');
    msg.className = style.worklistPlaceholderText;
    msg.textContent = 'No studies for this organization.';
    panelEl.append(msg);
    return;
  }

  const ariaLabel = organizationFilter
    ? `Worklist studies (${
        WORKLIST_ORG_LABELS[organizationFilter] || organizationFilter
      })`
    : 'Worklist studies (all organizations)';
  renderWorklistStudyList(panelEl, studies, ariaLabel, el, state);
  updateWorklistContextControls(el, state);
}

async function refreshHubSampleStudies(el, state) {
  const hubEndpoint =
    el.hubEndpoint?.value?.trim() ||
    HUB_DEFINITIONS[el.hubSelect?.value || 'local']?.hubEndpoint ||
    '';
  state.hubSampleStudies = await fetchHubSampleStudies(hubEndpoint);
  renderWorklistPanel(
    el.worklistPanel,
    el.worklistOrganizationSelect.value,
    el,
    state
  );
  updateWorklistContextControls(el, state);
}

function buildPageHtml() {
  return `<div class="${style.container}">
  <div class="${style.castHeader}"><div class="${style.headerStandardWrap}"><!--
  <label for="castStandardSelect">Example:</label><select id="castStandardSelect" class="${
    style.headerStandardSelect
  }"><option value="${CAST_STANDARD_FHIRCAST_V3}">FHIRcast v3.0 standard</option><option value="${CAST_STANDARD_CAST}" selected>Cast Interface v1.0</option></select>
  --><button type="button" id="openVolViewBtn" class="${
    style.headerViewerBtn
  }" disabled>${VOLVIEW_MARK_SVG}<span class="${
    style.headerViewerBtnLabel
  }">Open VolView</span></button></div><div class="${
    style.headerTitleWrap
  }"><div class="${style.headerTitleStack}"><span id="headerTitleMain" class="${
    style.headerTitle
  }">${titleMainForCastStandard(CAST_STANDARD_DEFAULT)}</span><span class="${
    style.headerTitleSub
  }">${EXAMPLE_PAGE_TITLE_SUB}</span></div></div><div class="${
    style.castHeaderRight
  }"><div class="${style.castHeaderViewerSlot}"><div class="${
    style.castHeaderViewerButtons
  }"><button type="button" id="openOhifBtn" class="${
    style.headerViewerBtn
  }" disabled>${OHIF_MARK_SVG}<span class="${
    style.headerViewerBtnLabel
  }">Open OHIF</span></button></div></div><div class="${
    style.castHeaderActions
  }"><div class="${
    style.castHeaderStatusWrap
  }"><button type="button" id="castHeaderStatusBtn" class="${
    style.castHeaderStatusBtn
  }" aria-label="Cast hub" aria-haspopup="menu" aria-expanded="false" title="Cast hub"><div id="castHeaderStatus" class="${
    style.castHeaderStatus
  } ${style.castHeaderStatusIdle}" title="Not connected"><span class="${
    style.castHeaderStatusIcon
  }">${CAST_RADIO_ICON_SVG}<span id="castHeaderStatusSlash" class="${
    style.castHeaderStatusSlash
  }" aria-hidden="true"></span></span></div></button><div id="castHeaderStatusMenu" class="${
    style.castHeaderMenu
  }" role="menu" hidden><button type="button" id="castHeaderStatusOpenHub" class="${
    style.castHeaderMenuItem
  }" role="menuitem">Open the hub admin portal</button><button type="button" id="castHeaderStatusStartConference" class="${
    style.castHeaderMenuItem
  }" role="menuitem">Start a conference</button></div></div><div class="${
    style.castHeaderMenuWrap
  }"><button type="button" id="castHeaderMenuBtn" class="${
    style.castHeaderMenuBtn
  }" aria-label="Settings" aria-haspopup="menu" aria-expanded="false" title="Settings">${CAST_SETTINGS_ICON_SVG}</button><div id="castHeaderMenu" class="${
    style.castHeaderMenu
  }" role="menu" hidden><button type="button" id="castHeaderMenuThemeDark" class="${
    style.castHeaderMenuItem
  } ${
    style.castHeaderMenuItemActive
  }" role="menuitemradio" aria-checked="true" data-theme="${CAST_THEME_DARK}">Dark theme</button><button type="button" id="castHeaderMenuThemeLight" class="${
    style.castHeaderMenuItem
  }" role="menuitemradio" aria-checked="false" data-theme="${CAST_THEME_LIGHT}">Light theme</button><div class="${
    style.castHeaderMenuSeparator
  }" role="separator"></div><button type="button" id="castHeaderAboutBtn" class="${
    style.castHeaderMenuItem
  }" role="menuitem">About…</button></div></div></div></div></div>
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
        <div class="${style.worklistOrganizationControls}">
          <select
            id="worklistOrganizationSelect"
            class="${style.worklistOrganizationSelect}"
            aria-label="Organization filter"
          >
            ${WORKLIST_ORGANIZATION_OPTIONS.map(
              (option, index) =>
                `<option value="${option.value}"${
                  index === 0 ? ' selected' : ''
                }>${option.label}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="${style.worklistSceneviewActions}">
        <span
          id="worklistImageDisplayLabel"
          class="${style.worklistImageDisplayLabel}"
          hidden
        ></span>
        <button type="button" id="openSceneviewsBtn" class="${
          style.headerViewerBtn
        }" disabled>Open scene views</button>
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
  <div id="castAboutOverlay" class="${style.castAboutOverlay}" hidden>
    <div class="${
      style.castAboutDialog
    }" role="dialog" aria-modal="true" aria-labelledby="castAboutTitle">
      <h2 id="castAboutTitle" class="${
        style.castAboutTitle
      }">${titleMainForCastStandard(CAST_STANDARD_DEFAULT)}</h2>
      <p class="${style.castAboutSubtitle}">${EXAMPLE_PAGE_TITLE_SUB}</p>
      <p class="${style.castAboutBody}">${CAST_ABOUT_BODY_TEXT}</p>
      <div class="${style.castAboutActions}">
        <button type="button" id="castAboutCloseBtn" class="${
          style.headerViewerBtn
        }">Close</button>
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

function castHeaderStatusIconStyle(status) {
  if (status === 'connected') {
    return {
      colorClass: style.castHeaderStatusConnected,
      showSlash: false,
      pulse: false,
    };
  }
  if (status === 'connecting' || status === 'token-ready') {
    return {
      colorClass: style.castHeaderStatusConnecting,
      showSlash: false,
      pulse: true,
    };
  }
  if (status === 'error' || status === 'disconnected') {
    return {
      colorClass: style.castHeaderStatusError,
      showSlash: true,
      pulse: false,
    };
  }
  return {
    colorClass: style.castHeaderStatusIdle,
    showSlash: true,
    pulse: false,
  };
}

function castHeaderStatusTooltipLines(el, state, status, detailText) {
  const lines = [];
  const session = state?.client?.getSessionConfig?.();
  const topic = String(el.topic?.value?.trim() || session?.topic || '').trim();
  if (topic) {
    lines.push(`Topic: ${topic}`);
  }
  const hubLabel = statusHubNameMeta(el);
  if (hubLabel) {
    lines.push(hubLabel);
  }
  if (status === 'connected') {
    const subscriber = String(
      el.subscriberName?.value?.trim() || session?.subscriberName || ''
    ).trim();
    if (subscriber) {
      lines.push(subscriber);
    }
  } else if (detailText) {
    lines.push(detailText);
  }
  return lines.join('\n');
}

function updateCastHeaderStatus(el, state) {
  if (!el.castHeaderStatus) {
    return;
  }
  const status = state.castHeaderStatus || 'disconnected';
  const detailText = state.castHeaderDetailText || '';
  const { colorClass, showSlash, pulse } = castHeaderStatusIconStyle(status);

  el.castHeaderStatus.classList.remove(...CAST_HEADER_STATUS_COLOR_CLASSES);
  el.castHeaderStatus.classList.add(colorClass);
  el.castHeaderStatus.classList.toggle(style.castHeaderStatusPulse, pulse);
  el.castHeaderStatus.title = castHeaderStatusTooltipLines(
    el,
    state,
    status,
    detailText
  );

  if (el.castHeaderStatusSlash) {
    el.castHeaderStatusSlash.hidden = !showSlash;
  }
}

function setConnection(el, state, status, text) {
  state.castHeaderStatus = status;
  state.castHeaderDetailText = text;
  updateCastHeaderStatus(el, state);
}

function readStoredCastTheme() {
  try {
    const stored = localStorage.getItem(CAST_THEME_STORAGE_KEY);
    return stored === CAST_THEME_LIGHT ? CAST_THEME_LIGHT : CAST_THEME_DARK;
  } catch {
    return CAST_THEME_DARK;
  }
}

function writeStoredCastTheme(theme) {
  try {
    localStorage.setItem(CAST_THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

function applyCastTheme(el, root, theme) {
  const light = theme === CAST_THEME_LIGHT;
  root.classList.toggle(style.castThemeLight, light);
  document.documentElement.classList.toggle(style.castExampleThemeLight, light);
  document.body.classList.toggle(style.castExampleThemeLight, light);
  const pageBg = light ? '#f4f4f5' : '#000';
  document.documentElement.style.setProperty(
    'background-color',
    pageBg,
    'important'
  );
  document.body.style.setProperty('background-color', pageBg, 'important');

  if (el.castHeaderMenuThemeDark) {
    el.castHeaderMenuThemeDark.setAttribute(
      'aria-checked',
      light ? 'false' : 'true'
    );
    el.castHeaderMenuThemeDark.classList.toggle(
      style.castHeaderMenuItemActive,
      !light
    );
  }
  if (el.castHeaderMenuThemeLight) {
    el.castHeaderMenuThemeLight.setAttribute(
      'aria-checked',
      light ? 'true' : 'false'
    );
    el.castHeaderMenuThemeLight.classList.toggle(
      style.castHeaderMenuItemActive,
      light
    );
  }
}

function closeCastHeaderMenu(el) {
  if (!el.castHeaderMenu || !el.castHeaderMenuBtn) {
    return;
  }
  el.castHeaderMenu.hidden = true;
  el.castHeaderMenuBtn.setAttribute('aria-expanded', 'false');
}

function closeCastHeaderStatusMenu(el) {
  if (!el.castHeaderStatusMenu || !el.castHeaderStatusBtn) {
    return;
  }
  el.castHeaderStatusMenu.hidden = true;
  el.castHeaderStatusBtn.setAttribute('aria-expanded', 'false');
}

function openCastHeaderMenu(el) {
  if (!el.castHeaderMenu || !el.castHeaderMenuBtn) {
    return;
  }
  closeCastHeaderStatusMenu(el);
  el.castHeaderMenu.hidden = false;
  el.castHeaderMenuBtn.setAttribute('aria-expanded', 'true');
}

function openCastHeaderStatusMenu(el) {
  if (!el.castHeaderStatusMenu || !el.castHeaderStatusBtn) {
    return;
  }
  closeCastHeaderMenu(el);
  el.castHeaderStatusMenu.hidden = false;
  el.castHeaderStatusBtn.setAttribute('aria-expanded', 'true');
}

function openCastAboutDialog(el) {
  if (!el.castAboutOverlay) {
    return;
  }
  if (el.castAboutTitle) {
    el.castAboutTitle.textContent = titleMainForCastStandard(
      selectedCastStandard(el)
    );
  }
  el.castAboutOverlay.hidden = false;
  el.castAboutCloseBtn?.focus();
}

function closeCastAboutDialog(el) {
  if (!el.castAboutOverlay) {
    return;
  }
  el.castAboutOverlay.hidden = true;
}

function wireCastHeaderMenu(el, root) {
  if (!el.castHeaderMenuBtn || !el.castHeaderMenu) {
    return;
  }

  applyCastTheme(el, root, readStoredCastTheme());

  el.castHeaderMenuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (el.castHeaderMenu.hidden) {
      openCastHeaderMenu(el);
    } else {
      closeCastHeaderMenu(el);
    }
  });

  const setTheme = (theme) => {
    writeStoredCastTheme(theme);
    applyCastTheme(el, root, theme);
    closeCastHeaderMenu(el);
  };

  el.castHeaderMenuThemeDark?.addEventListener('click', () => {
    setTheme(CAST_THEME_DARK);
  });
  el.castHeaderMenuThemeLight?.addEventListener('click', () => {
    setTheme(CAST_THEME_LIGHT);
  });
  el.castHeaderAboutBtn?.addEventListener('click', () => {
    closeCastHeaderMenu(el);
    openCastAboutDialog(el);
  });

  el.castAboutCloseBtn?.addEventListener('click', () => {
    closeCastAboutDialog(el);
    el.castHeaderMenuBtn?.focus();
  });
  el.castAboutOverlay?.addEventListener('click', (event) => {
    if (event.target === el.castAboutOverlay) {
      closeCastAboutDialog(el);
    }
  });

  document.addEventListener('click', (event) => {
    if (el.castHeaderMenu.hidden) {
      return;
    }
    const target = event.target;
    if (
      target instanceof Node &&
      !el.castHeaderMenu.contains(target) &&
      !el.castHeaderMenuBtn.contains(target)
    ) {
      closeCastHeaderMenu(el);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (el.castAboutOverlay && !el.castAboutOverlay.hidden) {
        closeCastAboutDialog(el);
        return;
      }
      closeCastHeaderMenu(el);
      closeCastHeaderStatusMenu(el);
    }
  });
}

function getCastViewerPopupFeatures(viewerKind) {
  const popupWidth = 800;
  const popupHeight = 600;
  const top = Math.max(0, Math.floor((window.screen.height - popupHeight) / 2));
  let left = Math.max(0, Math.floor((window.screen.width - popupWidth) / 2));

  if (viewerKind === 'volview' || viewerKind === 'ohif') {
    const gap = 16;
    const pairWidth = popupWidth * 2 + gap;
    const pairStart = Math.max(
      0,
      Math.floor((window.screen.width - pairWidth) / 2)
    );
    left = viewerKind === 'ohif' ? pairStart + popupWidth + gap : pairStart;
  }

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

function castViewerWindowName(viewerKind) {
  if (viewerKind === 'volview') {
    return 'castViewerVolViewWindow';
  }
  if (viewerKind === 'ohif') {
    return 'castViewerOhifWindow';
  }
  return 'castViewerWindow';
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

function openCastConferenceClient(el) {
  const hubUrl = new URL(el.hubEndpoint.value.trim());
  const url = new URL('/api/hub/conference-client', hubUrl.origin);
  const subscriberName = el.subscriberName?.value?.trim();
  const topic = el.topic?.value?.trim();
  if (subscriberName) {
    url.searchParams.set('subscriberName', subscriberName);
  }
  if (topic) {
    url.searchParams.set('topic', topic);
  }
  window.open(
    url.toString(),
    'castConferenceClientWindow',
    getCastViewerPopupFeatures()
  );
}

function wireCastHeaderStatusMenu(el, state) {
  if (!el.castHeaderStatusBtn || !el.castHeaderStatusMenu) {
    return;
  }

  el.castHeaderStatusBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (el.castHeaderStatusMenu.hidden) {
      openCastHeaderStatusMenu(el);
    } else {
      closeCastHeaderStatusMenu(el);
    }
  });

  el.castHeaderStatusOpenHub?.addEventListener('click', () => {
    closeCastHeaderStatusMenu(el);
    try {
      openHubAdminPortal(el);
    } catch (err) {
      addMessage(el, state, 'err', 'Hub Admin', 'Invalid hub_endpoint URL');
    }
  });

  el.castHeaderStatusStartConference?.addEventListener('click', () => {
    closeCastHeaderStatusMenu(el);
    try {
      openCastConferenceClient(el);
    } catch (err) {
      addMessage(el, state, 'err', 'Conference', 'Invalid hub_endpoint URL');
    }
  });

  document.addEventListener('click', (event) => {
    if (el.castHeaderStatusMenu.hidden) {
      return;
    }
    const target = event.target;
    if (
      target instanceof Node &&
      !el.castHeaderStatusMenu.contains(target) &&
      !el.castHeaderStatusBtn.contains(target)
    ) {
      closeCastHeaderStatusMenu(el);
    }
  });
}

function contextRequestSubscriber(message) {
  const subscriber = String(
    message?.['subscriber.name'] || message?.subscriber || ''
  ).trim();
  return subscriber || null;
}

const SCENEVIEW_LAYOUT_PAD = 24;
/** Diagram scale vs reported screen coordinates (~19% of screen layout). */
const SCENEVIEW_LAYOUT_DIAGRAM_SCALE = 0.1875;

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

/** Diagram uses client area (below browser chrome) for every window, including worklist. */
function sceneviewWindowRectForDiagram(win) {
  return windowContentRectFromPayload(win) || windowRectFromPayload(win);
}

function computeSceneviewDiagramBounds(worklistWindow, sceneviewEntries) {
  const rects = [];
  const worklistRect = sceneviewWindowRectForDiagram(worklistWindow);
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
    width: Math.max(1, rect.width * scale),
    height: Math.max(1, rect.height * scale),
  };
}

function resolveSceneviewLayoutPopupMetrics(bounds) {
  const pad = SCENEVIEW_LAYOUT_PAD;
  const scale = SCENEVIEW_LAYOUT_DIAGRAM_SCALE;
  const canvasW = Math.ceil(bounds.width * scale + pad * 2);
  const canvasH = Math.ceil(bounds.height * scale + pad * 2);
  const availW = window.screen.availWidth || window.screen.width || 1280;
  const availH = window.screen.availHeight || window.screen.height || 800;
  const pageChromeW = 48;
  const pageChromeH = 300;
  const popupWidth = Math.min(canvasW + pageChromeW, availW - 8);
  const wrapMaxH = Math.min(canvasH, Math.max(240, availH - pageChromeH - 8));
  const popupHeight = Math.min(wrapMaxH + pageChromeH, availH - 8);
  const left = Math.max(0, Math.floor((availW - popupWidth) / 2));
  const top = Math.max(0, Math.floor((availH - popupHeight) / 2));
  return {
    scale,
    pad,
    canvasW,
    canvasH,
    wrapMaxH,
    popupWidth,
    popupHeight,
    left,
    top,
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
  worklistMeta,
  bounds,
  metrics
) {
  if (!bounds) {
    return '<p class="svEmpty">No screen geometry in sceneview response.</p>';
  }
  const scale = metrics?.scale ?? SCENEVIEW_LAYOUT_DIAGRAM_SCALE;
  const pad = metrics?.pad ?? SCENEVIEW_LAYOUT_PAD;
  const canvasW = metrics?.canvasW ?? Math.ceil(bounds.width * scale + pad * 2);
  const canvasH =
    metrics?.canvasH ?? Math.ceil(bounds.height * scale + pad * 2);
  const chunks = [
    `<div class="svCanvas" style="width:${canvasW}px;height:${canvasH}px">`,
  ];

  const worklistRect = sceneviewWindowRectForDiagram(worklistWindow);
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
  worklistMeta,
  bounds,
  metrics
) {
  const diagram = buildSceneviewLayoutDiagramHtml(
    worklistWindow,
    sceneviewEntries,
    worklistMeta,
    bounds,
    metrics
  );
  const imageDisplaysSection =
    buildSceneviewImageDisplaysSectionHtml(sceneviewEntries);
  const wrapMaxH = metrics?.wrapMaxH ?? 520;
  const boundsLabel = bounds
    ? `${Math.round(bounds.width)}×${Math.round(
        bounds.height
      )} px virtual desktop`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Scene layout — Cast worklist</title>
<style>
  body { margin: 0; padding: 20px 24px; background: #111; color: #eaeaea; font-family: system-ui, sans-serif; font-size: 14px; }
  .svPageHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
  h1 { margin: 0; font-size: 1.25rem; }
  .svTrainingRepoRow { display: flex; align-items: center; gap: 10px; flex-shrink: 0; max-width: min(420px, 45vw); }
  .svTrainingRepoLabel { font-size: 13px; font-weight: 600; line-height: 1.35; color: #d4f0dc; }
  .svTrainingUploadBtn { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; padding: 0; border: 1px solid #4a7c59; border-radius: 6px;
    background: #1e3a29; color: #d4f0dc; cursor: pointer; }
  .svTrainingUploadBtn:hover { background: #265238; border-color: #5a9a6a; }
  .svTrainingUploadBtn svg { width: 18px; height: 18px; display: block; fill: currentColor; }
  p { margin: 0 0 12px; color: #b8b8b8; }
  .svWrap { overflow: auto; max-height: ${wrapMaxH}px; border: 1px solid #333; border-radius: 8px; background: #0a0a12; padding: 12px; margin-bottom: 16px; }
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
<header class="svPageHeader">
<h1>Scene layout (SCENEVIEW)</h1>
<div class="svTrainingRepoRow">
<span class="svTrainingRepoLabel">Save Scene to my training repo in standard format</span>
<button type="button" class="svTrainingUploadBtn" title="Upload" aria-label="Upload">
<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
</button>
</div>
</header>
<p>19% scale layout (${escapeHtml(
    boundsLabel
  )}). Window client areas (below browser chrome) preserve relative positions from SCENEVIEW. Scroll the diagram if needed.</p>
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
  const bounds = computeSceneviewDiagramBounds(
    worklistWindow,
    sceneviewEntries
  );
  if (!bounds) {
    return false;
  }
  const metrics = resolveSceneviewLayoutPopupMetrics(bounds);
  const features = [
    'popup',
    `width=${metrics.popupWidth}`,
    `height=${metrics.popupHeight}`,
    `left=${metrics.left}`,
    `top=${metrics.top}`,
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
    buildSceneviewLayoutPageHtml(
      worklistWindow,
      sceneviewEntries,
      pageMeta,
      bounds,
      metrics
    )
  );
  popup.document.close();
  popup.focus();
  return true;
}

async function openSceneviewLayoutFromStatus(el, state) {
  if (!state.client?.request) {
    addMessage(
      el,
      state,
      'err',
      'SCENEVIEW layout',
      'Cast client is not ready'
    );
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
    const result = await state.client.request(buildSceneviewRequestArgs(el));
    if (!result.ok) {
      const detail =
        typeof result.data === 'string'
          ? result.data
          : JSON.stringify(redactSceneviewPayloadForLog(result.data), null, 2);
      addMessage(el, state, 'err', 'SCENEVIEW layout', detail);
      return;
    }
    const entries = parseSceneviewCollatedResponses(result.data);
    if (!entries.length) {
      addMessage(el, state, 'err', 'SCENEVIEW layout', 'No responders');
      return;
    }
    const opened = openSceneviewLayoutPopup(worklistWindow, entries, {
      subscriberName: wlSubscriber,
      thumbnail: worklistThumbnail,
    });
    if (opened) {
      addMessage(el, state, 'received', 'SCENEVIEW layout', {
        subscribers: [...state.imageDisplaySubscribers].sort(),
        responders: entries.length,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addMessage(el, state, 'err', 'SCENEVIEW layout', msg);
  } finally {
    state.sceneviewLayoutBusy = false;
  }
}

function updateWorklistImageDisplayLabel(el, subscribers) {
  if (!el.worklistImageDisplayLabel) {
    return;
  }
  if (!subscribers || subscribers.size === 0) {
    if (el.worklistImageDisplayLabel.hidden) {
      return;
    }
    el.worklistImageDisplayLabel.textContent = '';
    el.worklistImageDisplayLabel.hidden = true;
    el.worklistImageDisplayLabel.title = '';
    return;
  }
  const sorted = [...subscribers].sort();
  const title = sorted.join(', ');
  const text = `Image Displays: ${title}`;
  if (
    el.worklistImageDisplayLabel.textContent === text &&
    el.worklistImageDisplayLabel.title === title &&
    !el.worklistImageDisplayLabel.hidden
  ) {
    return;
  }
  el.worklistImageDisplayLabel.title = title;
  el.worklistImageDisplayLabel.textContent = text;
  el.worklistImageDisplayLabel.hidden = false;
}

function openSceneviewLayoutForConnectedDisplays(el, state) {
  if (!state.imageDisplaySubscribers?.size) {
    addMessage(
      el,
      state,
      'err',
      'SCENEVIEW layout',
      'No image display connected yet'
    );
    return;
  }
  openSceneviewLayoutFromStatus(el, state).catch((err) => {
    console.error('[vtkCastClient] SCENEVIEW layout failed', err);
  });
}

function updateOpenSceneviewsButton(el, state) {
  if (!el.openSceneviewsBtn) {
    return;
  }
  const wsConnected = state.wsState === 'connected';
  const hasDisplay = Boolean(state.imageDisplaySubscribers?.size);
  const enabled = wsConnected && hasDisplay;
  el.openSceneviewsBtn.disabled = !enabled;
  const names = hasDisplay
    ? [...state.imageDisplaySubscribers].sort().join(', ')
    : '';
  el.openSceneviewsBtn.title = enabled
    ? `Open scene layout (SCENEVIEW) for ${names}`
    : 'Connect an image-display viewer first';
}

function clearImageDisplayRequesters(state) {
  state.imageDisplaySubscribers = new Set();
}

function refreshImageDisplayConnectionStatus(el, state) {
  updateWorklistImageDisplayLabel(el, state.imageDisplaySubscribers);
  updateOpenSceneviewsButton(el, state);
}

function updateStatusForIncomingContextRequest(el, state, message) {
  const subscriber = contextRequestSubscriber(message);
  if (!subscriber) {
    return;
  }
  if (!state.imageDisplaySubscribers) {
    state.imageDisplaySubscribers = new Set();
  }
  if (state.imageDisplaySubscribers.has(subscriber)) {
    return;
  }
  state.imageDisplaySubscribers.add(subscriber);
  refreshImageDisplayConnectionStatus(el, state);
}

function handleSubscriptionRemoved(el, state, message) {
  const event = message?.event;
  if (!event || getHubEventLower(event) !== 'subscription-removed') {
    return false;
  }
  const subscriber = contextRequestSubscriber(message);
  if (!subscriber) {
    return false;
  }
  state.imageDisplaySubscribers?.delete(subscriber);
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
  el.openOhifBtn.disabled = disabled;
}

function setHubAdminPortalButtonsEnabled(el, enabled) {
  const disabled = !enabled;
  el.hubAdminPortalBtn.disabled = disabled;
}

function openCastViewer(el, state, viewerKind) {
  const viewerBaseUrl =
    viewerKind === 'volview'
      ? resolveVolviewViewerBaseUrl(el)
      : resolveOhifViewerBaseUrl(el);
  const url = new URL(viewerBaseUrl);
  const topic = el.topic?.value?.trim();
  if (topic) {
    url.searchParams.set('topic', topic);
  }
  const token = state.client?.getConnectionState?.().token?.trim();
  if (token) {
    url.searchParams.set('id-token', token);
  }
  window.open(
    url.toString(),
    castViewerWindowName(viewerKind),
    getCastViewerPopupFeatures(viewerKind)
  );
}

function applyWebsocketStatus(el, state, wsState) {
  state.wsState = wsState;
  switch (wsState) {
    case 'connecting':
      setConnection(el, state, 'connecting', 'Websocket connecting');
      break;
    case 'connected':
      setConnection(el, state, 'connected', 'Websocket connected');
      break;
    case 'error':
      clearImageDisplayRequesters(state);
      setConnection(el, state, 'error', 'Websocket error');
      updateWorklistImageDisplayLabel(el, null);
      updateOpenSceneviewsButton(el, state);
      break;
    case 'disconnected':
    default:
      clearImageDisplayRequesters(state);
      setConnection(el, state, 'disconnected', 'Websocket disconnected');
      updateWorklistImageDisplayLabel(el, null);
      updateOpenSceneviewsButton(el, state);
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
      const hubEndpoint = el.hubEndpoint.value.trim();
      const hubStartedAt =
        state.hubStartedAt || (await fetchHubStartedAt(hubEndpoint));
      if (hubStartedAt) {
        state.hubStartedAt = hubStartedAt;
      }
      setStoredCastUserName(
        userName,
        hubStartedAt,
        hubOriginFromEndpoint(hubEndpoint)
      );
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
  if (isFhircastV3Standard(selectedCastStandard(el))) {
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

async function boot() {
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
    openSceneviewsBtn: byId('openSceneviewsBtn'),
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
    castHeaderStatus: byId('castHeaderStatus'),
    castHeaderStatusSlash: byId('castHeaderStatusSlash'),
    castHeaderStatusBtn: byId('castHeaderStatusBtn'),
    castHeaderStatusMenu: byId('castHeaderStatusMenu'),
    castHeaderStatusOpenHub: byId('castHeaderStatusOpenHub'),
    castHeaderStatusStartConference: byId('castHeaderStatusStartConference'),
    castHeaderMenuBtn: byId('castHeaderMenuBtn'),
    castHeaderMenu: byId('castHeaderMenu'),
    castHeaderMenuThemeDark: byId('castHeaderMenuThemeDark'),
    castHeaderMenuThemeLight: byId('castHeaderMenuThemeLight'),
    castHeaderAboutBtn: byId('castHeaderAboutBtn'),
    castAboutOverlay: byId('castAboutOverlay'),
    castAboutTitle: byId('castAboutTitle'),
    castAboutCloseBtn: byId('castAboutCloseBtn'),
    messageCount: byId('messageCount'),
    getResponseData: byId('getResponseData'),
    worklistContextDisplay: byId('worklistContextDisplay'),
    worklistOrganizationSelect: byId('worklistOrganizationSelect'),
    worklistImageDisplayLabel: byId('worklistImageDisplayLabel'),
    worklistPanel: byId('worklistPanel'),
    castStandardSelect: document.getElementById('castStandardSelect'),
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
    imageDisplaySubscribers: new Set(),
    castHeaderStatus: 'disconnected',
    castHeaderDetailText: 'Not connected',
    wsState: 'disconnected',
    openWorklistSampleId: null,
    hubSampleStudies: [],
    sceneviewLayoutBusy: false,
    lastAuthCode: '',
    lastAuthUserName: getStoredCastUserName(),
    defaultTopic:
      new URLSearchParams(window.location.search).get('topic') || '',
  };

  updateWorklistContextDisplay(el, state);

  wireCastHeaderMenu(el, root);
  wireCastHeaderStatusMenu(el, state);

  applyCastStandardToPage(el, selectedCastStandard(el));
  el.castStandardSelect?.addEventListener('change', () => {
    applyCastStandardToPage(el, selectedCastStandard(el));
  });

  el.worklistOrganizationSelect.addEventListener('change', () => {
    renderWorklistPanel(
      el.worklistPanel,
      el.worklistOrganizationSelect.value,
      el,
      state
    );
    updateWorklistContextControls(el, state);
  });
  renderWorklistPanel(
    el.worklistPanel,
    el.worklistOrganizationSelect.value,
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
  el.hubSelect.value = hubKey;
  applyHubPreset(el, state, hubKey);
  await refreshHubSampleStudies(el, state);
  await syncStoredUserNameWithHub(el, state);
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
  el.topic.value = state.defaultTopic;
  el.productName.value = EXAMPLE_PRODUCT_NAME;
  const initialSubscriberName = generateSubscriberName(
    EXAMPLE_SUBSCRIBER_PREFIX
  );
  el.subscriberName.value = initialSubscriberName;
  el.getSubscriber.value = initialSubscriberName;
  const refreshCastHeaderStatus = () => updateCastHeaderStatus(el, state);
  el.subscriberName.addEventListener('input', refreshCastHeaderStatus);
  el.topic.addEventListener('input', refreshCastHeaderStatus);
  setConnection(el, state, 'disconnected', 'Not connected');
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
    updateCastHeaderStatus(el, state);
    refreshHubSampleStudies(el, state).catch((err) => {
      console.warn('[vtkCastClient] hub samples refresh failed', err);
    });
    syncStoredUserNameWithHub(el, state).catch((err) => {
      console.warn('[vtkCastClient] hub user-name sync failed', err);
    });
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
    openInstructionsWindow(selectedCastStandard(el));
  });

  el.hubAdminPortalBtn.addEventListener('click', () => {
    try {
      openHubAdminPortal(el);
    } catch (err) {
      addMessage(el, state, 'err', 'Hub Admin', 'Invalid hub_endpoint URL');
    }
  });

  el.startConferenceBtn.addEventListener('click', () => {
    try {
      openCastConferenceClient(el);
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
  el.openSceneviewsBtn.addEventListener('click', () => {
    openSceneviewLayoutForConnectedDisplays(el, state);
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

  await autoConnectOnLoad(el, state);
}

boot().catch((err) => {
  console.error('[vtkCastClient] boot failed', err);
});
