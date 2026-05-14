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

export interface CastMessage {
  timestamp?: string;
  id?: string;
  'hub.mode'?: string;
  'subscriber.name'?: string;
  'subscriber.product'?: string;
  'subscriber.version'?: string;
  event?: {
    'hub.event': string;
    'hub.topic'?: string;
    context?: unknown;
  };
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
  messageIdPrefix?: string;
}

export interface CastRequestArgs {
  subscriber: string;
  topic?: string;
  dataType?: string;
  actor?: string;
  /**
   * Optional product-name filter. Use ``"*"`` (or omit the field) to match
   * subscribers of any product. Otherwise the hub matches subscribers whose
   * ``client_info.productName`` equals this value (case-sensitive trim).
   */
  productName?: string;
  endpoint?: string;
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
  requestId: string | null;
  subscriber: string;
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
  destroy(): void;
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
    castMessage: Record<string, unknown>,
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
    requestId: string,
    dataType: string,
    data: unknown,
    topic?: string
  ): void;
  request(args: CastRequestArgs): Promise<CastRequestResult>;
  getConfig(): CastClientConfig;
}

export function extend(
  publicAPI: object,
  model: object,
  initialValues?: CastClientConfig
): void;

export function newInstance(initialValues?: CastClientConfig): vtkCastClient;

export declare const vtkCastClient: {
  newInstance: typeof newInstance;
  extend: typeof extend;
};

export default vtkCastClient;
