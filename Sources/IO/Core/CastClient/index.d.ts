import { vtkObject } from '../../../interfaces';

export interface HubConfig {
  name: string;
  friendlyName?: string;
  version?: string;
  hub_endpoint: string;
  authorization_endpoint?: string;
  token_endpoint: string;
  client_id?: string;
  client_secret?: string;
}

export interface SessionConfig {
  subscriberName?: string;
  actors?: string[];
  topic?: string;
  events?: string[];
  lease?: number;
  productName?: string;
  productVersion?: string;
  userName?: string;
}

export interface HubRuntimeState {
  token: string;
  lastIdToken: string;
  subscribed: boolean;
  resubscribeRequested: boolean;
  websocket: WebSocket | null;
  lastPublishedMessageID: string;
}

export interface AuthorizeResult {
  user_name: string;
  code: string;
  expires_in?: number;
}

export interface CastClientConfig {
  hub?: Partial<HubConfig>;
  session?: Partial<SessionConfig>;
  productName?: string;
  productVersion?: string;
  callbackUrl?: string;
  autoStart?: boolean;
  autoReconnect?: boolean;
  preserveSessionTopicFromToken?: boolean;
}

export interface CastEvent {
  'hub.event'?: string;
  'hub.topic'?: string;
  context?: unknown;
  [key: string]: unknown;
}
/**
 * Cast JSON envelope: publish (`POST /api/hub/`), request (`POST /api/hub/request`),
 * and WebSocket notifications.
 */
export interface CastMessage {
  id?: string;
  timestamp?: string;
  'subscriber.name'?: string;
  'subscriber.actor'?: string;
  'subscriber.product.name'?: string;
  'target.product.name'?: string;
  'target.actor'?: string;
  event?: CastEvent;
  [key: string]: unknown;
}

/**
 * One responder's contribution to a fan-out cast-request. ``id`` is the Cast
 * envelope id of the response message (so callers can correlate or
 * deduplicate). ``actor`` is the single actor the request asked for.
 */
export interface CastRequestResponseItem {
  id: string | null;
  subscriber: string | null;
  actor: string | null;
  productName?: string | null;
  data: unknown;
}

/**
 * The hub's collated reply for a single cast-request. Always returned (even
 * when only one subscriber was matched) so callers can iterate uniformly.
 */
export interface CastRequestResponseEnvelope {
  ok: boolean;
  id: string | null;
  'subscriber.name': string;
  dataType: string | null;
  actor: string | null;
  productName?: string | null;
  exists: boolean;
  connected: boolean;
  topic: string | null;
  endpoint: string | null;
  targetExists: boolean;
  targetConnected: boolean;
  responses: CastRequestResponseItem[];
  expected: string[];
  missing: string[];
  timedOut: boolean;
  requestedTopic?: string;
  error?: string;
}

export interface CastRequestResult {
  ok: boolean;
  status: number;
  data: CastRequestResponseEnvelope | unknown;
}

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface vtkCastClient extends vtkObject {
  onMessage(callback: (message: CastMessage) => void): void;
  onConnectionStateChange(
    callback: (state: ConnectionState, detail?: unknown) => void
  ): void;
  delete(): void;
  getHubConfig(): HubConfig;
  getSessionConfig(): SessionConfig;
  getConnectionState(): HubRuntimeState;
  setTopic(topic: string): void;
  setToken(token: string): void;
  setSubscriberName(subscriberName: string): void;
  setUserName(userName: string): void;
  authenticate(): Promise<AuthorizeResult>;
  getToken(code: string): Promise<boolean>;
  subscribe(): Promise<number | string>;
  unsubscribe(): Promise<void>;
  publish(
    castMessage: CastMessage,
    hub?: HubConfig & HubRuntimeState
  ): Promise<Response | null>;
  /** @deprecated Use ``publishStowBatch`` or ``publish`` (STOW). */
  publishMultipart(
    castMessage: CastMessage,
    fileBytes: ArrayBuffer,
    hub?: HubConfig & HubRuntimeState
  ): Promise<Response | null>;
  publishStowBatch(
    castMessage: CastMessage,
    fileBytesList: ArrayBuffer[],
    hub?: HubConfig & HubRuntimeState
  ): Promise<Response | null>;
  /** @deprecated Use ``publishStowBatch`` or ``publish``. */
  publishNiftiMultipart(
    castMessage: CastMessage,
    fileBytes: ArrayBuffer,
    hub?: HubConfig & HubRuntimeState
  ): Promise<Response | null>;
  fetchPayload(castMessage: CastMessage): Promise<CastMessage>;
  fetchAllPayloads(castMessage: CastMessage): Promise<CastMessage>;
  hasPendingPayload(castMessage: CastMessage): boolean;
  /**
   * Send a response to a previously-received ``<datatype>-request``.
   *
   * The response event name is derived from ``dataType`` (e.g.
   * ``PNGFULLSIZE`` -> ``pngfullsize-response``). ``dataType`` is required;
   * callers that omit or pass only whitespace trigger a ``console.error`` and
   * no websocket message is sent.
   */
  sendCastRequestResponse(
    id: string,
    dataType: string,
    data: unknown,
    topic?: string
  ): void;
  request(args: CastMessage): Promise<CastRequestResult>;
  getConfig(): CastClientConfig;
}

export function extend(
  publicAPI: object,
  model: object,
  initialValues?: CastClientConfig
): void;

export function newInstance(initialValues?: CastClientConfig): vtkCastClient;

export function generateSubscriberName(productName?: string): string;

/** True when the page is served from a public/cloud host (not local dev). */
export function isRunningInCloud(location?: Location): boolean;

/** True when a Cast hub endpoint URL points at a cloud/public host. */
export function isHubEndpointInCloud(hubEndpoint: string): boolean;

/** First hub preset key whose deployment matches the page (local vs cloud). */
export function selectFirstMatchingHubKey(
  hubs: Record<string, { hubEndpoint?: string }>,
  order: string[],
  pageInCloud?: boolean
): string | undefined;

export const CAST_IMAGING_STUDY_OPEN_PROFILE: string;
export const CAST_IDENTIFIER_DICOM_UID: string;
export const CAST_IDENTIFIER_NIFTI_URL: string;
export const CAST_IDENTIFIER_NIFTI_FILENAME: string;
export const CAST_IDENTIFIER_VOLVIEW_SAMPLE_ID: string;
export const CAST_IDENTIFIER_WORKLIST_SAMPLE_ID: string;
export const CAST_IDENTIFIER_OHIF_MODE: string;
export const CAST_OPEN_MODE: string;
export const CAST_OPEN_MODE_DICOMWEB: string;
export const CAST_OPEN_MODE_DICOM_URL: string;
export const CAST_OPEN_MODE_FILES: string;
export const CAST_OPEN_MODE_IDC: string;
export const CAST_IDENTIFIER_IDC: string;
export const CAST_IDENTIFIER_IDC_SOURCE_BUCKET: string;
export const CAST_DICOMWEB_ROOT: string;

export interface CastImagingStudyFileEntry {
  url: string;
  fileName?: string;
  mimeType?: string;
  role?: string;
  label?: string;
}

export function extractStudyContextItem(
  context: unknown,
  key: string
): Record<string, unknown> | null;

export function extractIdentifierValue(
  context: unknown,
  system: string
): string;

export function extractDicomStudyUid(context: unknown): string;

export function extractDicomSeriesUid(context: unknown): string;

export function extractDicomwebRoot(context: unknown): string;

export function extractIdcSeriesUid(context: unknown): string;

export function extractIdcSourceBucket(context: unknown): 'aws' | 'gcs';

export function extractOpenMode(context: unknown): string;

export function extractImagingStudyFiles(
  context: unknown
): CastImagingStudyFileEntry[];

export function extractNiftiDownloadUrl(context: unknown): string;

export function extractNiftiFilename(context: unknown): string;

export function extractOhifMode(context: unknown): string;

export function extractVolviewSampleId(context: unknown): string;

export function buildFilesImagingStudyOpenContext(params: {
  id: string;
  files: CastImagingStudyFileEntry[];
  patientReference?: string;
  includeLegacyNiftiIdentifiers?: boolean;
}): Array<{ key: string; resource: Record<string, unknown> }>;

export function buildDicomUrlImagingStudyOpenContext(params: {
  id: string;
  files: CastImagingStudyFileEntry[];
  patientReference?: string;
}): Array<{ key: string; resource: Record<string, unknown> }>;

export function buildDicomwebImagingStudyOpenContext(params: {
  id: string;
  studyInstanceUID: string;
  seriesInstanceUID?: string;
  dicomwebRoot?: string;
  patientReference?: string;
}): Array<{ key: string; resource: Record<string, unknown> }>;

export function buildIdcImagingStudyOpenContext(params: {
  id: string;
  studyInstanceUID: string;
  seriesInstanceUID?: string;
  sourceBucket?: 'aws' | 'gcs';
  files: CastImagingStudyFileEntry[];
  patientReference?: string;
  ohifMode?: string;
}): Array<{ key: string; resource: Record<string, unknown> }>;

export function buildNiftiUrlImagingStudyOpenContext(params: {
  id: string;
  url: string;
  filename?: string;
  patientReference?: string;
}): Array<{ key: string; resource: Record<string, unknown> }>;

/**
 * Cast hub client: OAuth, subscribe, WebSocket bind, publish, and typed
 * request/response (`POST /api/hub/request` fan-out).
 *
 * Typical flow: `onMessage` → `authenticate` → `getToken` → `subscribe` →
 * `publish` / `request` → `sendCastRequestResponse` on inbound `*-request` events.
 *
 * @example
 * import vtkCastClient, { generateSubscriberName } from '@kitware/vtk.js/Sources/IO/Core/CastClient';
 * import { requestEventFor } from '@kitware/vtk.js/Sources/IO/Core/CastClient/eventNames';
 *
 * const client = vtkCastClient.newInstance({
 *   hub: {
 *     hub_endpoint: 'https://host/api/hub',
 *     authorization_endpoint: 'https://host/oauth/authorize',
 *     token_endpoint: 'https://host/oauth/token',
 *     client_id: 'client_id',
 *     client_secret: 'client_secret',
 *   },
 *   session: {
 *     subscriberName: generateSubscriberName('MYAPP'),
 *     topic: 'my-topic',
 *     events: ['*'],
 *   },
 *   autoReconnect: true,
 * });
 *
 * client.onMessage((message) => console.log(message));
 * const { code } = await client.authenticate();
 * if (await client.getToken(code)) {
 *   await client.subscribe();
 *   await client.request({
 *     'subscriber.name': client.getSessionConfig().subscriberName,
 *     event: {
 *       'hub.topic': 'my-topic',
 *       'hub.event': requestEventFor('FHIRcastContext'),
 *       context: { dataType: 'FHIRcastContext' },
 *     },
 *     'target.actor': 'WORKLIST_CLIENT',
 *   });
 * }
 *
 * @see /examples/CastClient.html
 */
export declare const vtkCastClient: {
  newInstance: typeof newInstance;
  extend: typeof extend;
  generateSubscriberName: typeof generateSubscriberName;
  isHubEndpointInCloud: typeof isHubEndpointInCloud;
  isRunningInCloud: typeof isRunningInCloud;
  selectFirstMatchingHubKey: typeof selectFirstMatchingHubKey;
  buildDicomwebImagingStudyOpenContext: typeof buildDicomwebImagingStudyOpenContext;
  buildFilesImagingStudyOpenContext: typeof buildFilesImagingStudyOpenContext;
  buildIdcImagingStudyOpenContext: typeof buildIdcImagingStudyOpenContext;
  buildNiftiUrlImagingStudyOpenContext: typeof buildNiftiUrlImagingStudyOpenContext;
  CAST_DICOMWEB_ROOT: typeof CAST_DICOMWEB_ROOT;
  CAST_IDENTIFIER_DICOM_UID: typeof CAST_IDENTIFIER_DICOM_UID;
  CAST_IDENTIFIER_IDC: typeof CAST_IDENTIFIER_IDC;
  CAST_IDENTIFIER_IDC_SOURCE_BUCKET: typeof CAST_IDENTIFIER_IDC_SOURCE_BUCKET;
  CAST_IDENTIFIER_NIFTI_FILENAME: typeof CAST_IDENTIFIER_NIFTI_FILENAME;
  CAST_IDENTIFIER_NIFTI_URL: typeof CAST_IDENTIFIER_NIFTI_URL;
  CAST_IDENTIFIER_VOLVIEW_SAMPLE_ID: typeof CAST_IDENTIFIER_VOLVIEW_SAMPLE_ID;
  CAST_IDENTIFIER_WORKLIST_SAMPLE_ID: typeof CAST_IDENTIFIER_WORKLIST_SAMPLE_ID;
  CAST_IDENTIFIER_OHIF_MODE: typeof CAST_IDENTIFIER_OHIF_MODE;
  CAST_IMAGING_STUDY_OPEN_PROFILE: typeof CAST_IMAGING_STUDY_OPEN_PROFILE;
  CAST_OPEN_MODE: typeof CAST_OPEN_MODE;
  CAST_OPEN_MODE_DICOMWEB: typeof CAST_OPEN_MODE_DICOMWEB;
  CAST_OPEN_MODE_FILES: typeof CAST_OPEN_MODE_FILES;
  CAST_OPEN_MODE_IDC: typeof CAST_OPEN_MODE_IDC;
  extractDicomSeriesUid: typeof extractDicomSeriesUid;
  extractDicomStudyUid: typeof extractDicomStudyUid;
  extractDicomwebRoot: typeof extractDicomwebRoot;
  extractIdcSeriesUid: typeof extractIdcSeriesUid;
  extractIdcSourceBucket: typeof extractIdcSourceBucket;
  extractIdentifierValue: typeof extractIdentifierValue;
  extractImagingStudyFiles: typeof extractImagingStudyFiles;
  extractNiftiDownloadUrl: typeof extractNiftiDownloadUrl;
  extractNiftiFilename: typeof extractNiftiFilename;
  extractOhifMode: typeof extractOhifMode;
  extractOpenMode: typeof extractOpenMode;
  extractStudyContextItem: typeof extractStudyContextItem;
  extractVolviewSampleId: typeof extractVolviewSampleId;
};

export default vtkCastClient;
