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

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

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

export const DICOM_TRANSFER_DATA_TYPE: 'dicomtransfer';

export function buildDicomTransferRequestMessage(options: {
  subscriberName: string;
  subscriberActor?: string;
  topic: string;
  manifest: {
    dicomTransferId: string;
    files: unknown[];
  };
}): CastMessage;

export function buildDicomTransferFilePublishMessage(options: {
  topic: string;
  dicomTransferId: string;
  fileName: string;
  data: ArrayBuffer;
  mimeType?: string;
}): { event: CastEvent };

export function buildDicomTransferCompletePublishMessage(options: {
  topic: string;
  dicomTransferId: string;
  message?: string;
}): { event: CastEvent };

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
};

export default vtkCastClient;
