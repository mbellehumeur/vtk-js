// Shared helpers for Cast hub.event names.
//
// Per-dataType events only: '<dataType.lower()>-request' / '-response'.
// Legacy generic cast-request / cast-response are rejected by is* helpers.
//
// Keep this mapping in sync with:
// - VolView/server/cast_api/event_names.py
// - VolView/src/io/cast/event-names.ts
// - the OHIF Cast extension's event-names.ts

export const REQUEST_SUFFIX = '-request';
export const RESPONSE_SUFFIX = '-response';

const REJECT_REQUEST = 'cast-request';
const REJECT_RESPONSE = 'cast-response';

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
  if (name === REJECT_REQUEST) {
    return false;
  }
  return name.endsWith(REQUEST_SUFFIX);
}

export function isResponseEvent(name) {
  if (typeof name !== 'string') {
    return false;
  }
  if (name === REJECT_RESPONSE) {
    return false;
  }
  return name.endsWith(RESPONSE_SUFFIX);
}

export function dataTypeFromEventName(name) {
  if (typeof name !== 'string') {
    return '';
  }
  if (name === REJECT_REQUEST || name === REJECT_RESPONSE) {
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

export default {
  REQUEST_SUFFIX,
  RESPONSE_SUFFIX,
  normalizeDataType,
  requestEventFor,
  responseEventFor,
  isRequestEvent,
  isResponseEvent,
  dataTypeFromEventName,
};
