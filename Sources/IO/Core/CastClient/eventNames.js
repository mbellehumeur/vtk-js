// Shared helpers for Cast hub.event names.
//
// Per-dataType events: '<dataType.lower()>-request' / '-response'.
// isRequestEvent / isResponseEvent use the suffixes only.
//
// Keep this mapping in sync with:
// - VolView/server/cast_api/cast_client.py
// - VolView/src/io/cast/event-names.ts
// - the OHIF Cast extension's event-names.ts

export const REQUEST_SUFFIX = '-request';
export const RESPONSE_SUFFIX = '-response';

export function normalizeDataType(dataType) {
  if (typeof dataType !== 'string') {
    return '';
  }
  return dataType.trim().toLowerCase();
}

export function requestEventFor(dataType) {
  const base = normalizeDataType(dataType);
  if (!base) {
    return '';
  }
  return `${base}${REQUEST_SUFFIX}`;
}

export function responseEventFor(dataType) {
  const base = normalizeDataType(dataType);
  if (!base) {
    return '';
  }
  return `${base}${RESPONSE_SUFFIX}`;
}

export function isRequestEvent(name) {
  if (typeof name !== 'string') {
    return false;
  }
  return name.endsWith(REQUEST_SUFFIX);
}

export function isResponseEvent(name) {
  if (typeof name !== 'string') {
    return false;
  }
  return name.endsWith(RESPONSE_SUFFIX);
}

export function dataTypeFromEventName(name) {
  if (typeof name !== 'string') {
    return '';
  }
  if (name.endsWith(REQUEST_SUFFIX)) {
    return name.slice(0, -REQUEST_SUFFIX.length);
  }
  if (name.endsWith(RESPONSE_SUFFIX)) {
    return name.slice(0, -RESPONSE_SUFFIX.length);
  }
  return '';
}

/** Ensures image-display STATUS requests are received when events are listed explicitly. */
export function ensureCastSubscribeEvents(events) {
  if (!events?.length) {
    return ['*'];
  }
  if (events.some((entry) => String(entry).trim() === '*')) {
    return ['*'];
  }
  const statusRequest = requestEventFor('STATUS');
  const normalized = new Set(
    events.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)
  );
  const extras = [];
  if (statusRequest && !normalized.has(statusRequest.toLowerCase())) {
    extras.push(statusRequest);
    normalized.add(statusRequest.toLowerCase());
  }
  if (!normalized.has('status-update')) {
    extras.push('status-update');
  }
  return extras.length ? [...events, ...extras] : [...events];
}

export default {
  REQUEST_SUFFIX,
  RESPONSE_SUFFIX,
  normalizeDataType,
  requestEventFor,
  responseEventFor,
  isRequestEvent,
  isResponseEvent,
  dataTypeFromEventName,
  ensureCastSubscribeEvents,
};
