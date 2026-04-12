import { vtkObject } from '../../../interfaces';

export interface HubConfig {
  name: string;
  friendlyName?: string;
  productName?: string;
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
}

export interface HubRuntimeState {
  token: string;
  subscribed: boolean;
  resubscribeRequested: boolean;
  websocket: WebSocket | null;
  lastPublishedMessageID: string;
}

export interface CastMessage {
  id?: string;
  timestamp?: string;
  'hub.mode'?: string;
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
  callbackUrl?: string;
  autoStart?: boolean;
  autoReconnect?: boolean;
  preserveSessionTopicFromToken?: boolean;
  messageIdPrefix?: string;
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
  getToken(): Promise<boolean>;
  subscribe(): Promise<number | string>;
  unsubscribe(): Promise<void>;
  publish(
    castMessage: Record<string, unknown>,
    hub?: HubConfig & SessionConfig & HubRuntimeState
  ): Promise<Response | null>;
  sendGetResponse(requestId: string, data: unknown, topic?: string): void;
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
