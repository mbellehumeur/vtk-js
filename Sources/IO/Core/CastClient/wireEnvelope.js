export function createHubConfig() {
  return {
    name: '',
    friendlyName: '',
    version: '',
    hub_endpoint: '',
    authorization_endpoint: '',
    token_endpoint: '',
    client_id: '',
    client_secret: '',
  };
}

export function createSessionConfig() {
  return {
    subscriberName: '',
    productName: '',
    productVersion: '',
    actors: [],
    topic: '',
    events: [],
    lease: 999,
    userName: '',
    defaultTargetActor: '',
  };
}

export function resolveTargetActorForWire(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  if (!text) {
    return undefined;
  }
  return text;
}

export function resolveTargetProductNameForWire(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  if (!text) {
    return undefined;
  }
  return text;
}

export function createHubRuntimeState() {
  return {
    token: '',
    lastIdToken: '',
    lastPublishedMessageID: '',
    subscribed: false,
    resubscribeRequested: false,
    websocket: null,
  };
}

export function getClientInfoPayload() {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const info = {};
  if (typeof navigator.userAgent === 'string' && navigator.userAgent.trim()) {
    info.userAgent = navigator.userAgent.trim();
  }
  if (typeof navigator.platform === 'string' && navigator.platform.trim()) {
    info.platform = navigator.platform.trim();
  }
  if (typeof navigator.language === 'string' && navigator.language.trim()) {
    info.language = navigator.language.trim();
  }
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof timezone === 'string' && timezone.trim()) {
      info.timezone = timezone.trim();
    }
  } catch (err) {
    // Intl/timezone may be unavailable in some runtimes.
  }

  return Object.keys(info).length ? info : null;
}
