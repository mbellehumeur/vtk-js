import { getHubEventLower } from './messageContext';

const MAX_DETAIL_CHARS = 4000;
const MAX_STRING_INLINE = 480;
export const BINARY_PLACEHOLDER = '[binary/redacted]';

function redactValue(value, depth) {
  if (depth > 8) return '[max-depth]';
  if (value instanceof ArrayBuffer) return BINARY_PLACEHOLDER;
  if (ArrayBuffer.isView(value)) return BINARY_PLACEHOLDER;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_INLINE) {
      return `${value.slice(0, 160)}… (${value.length} chars)`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((out, [k, v]) => {
      const kl = k.toLowerCase();
      if (kl === 'data' && typeof v === 'string' && v.length > 200) {
        out[k] = BINARY_PLACEHOLDER;
      } else {
        out[k] = redactValue(v, depth + 1);
      }
      return out;
    }, {});
  }
  return value;
}

export function stringifyForLog(value) {
  try {
    const s = JSON.stringify(redactValue(value, 0));
    return s.length > MAX_DETAIL_CHARS ? `${s.slice(0, MAX_DETAIL_CHARS)}…` : s;
  } catch {
    return '[unserializable]';
  }
}

export function countEventContextObjects(event) {
  if (!event) {
    return 0;
  }
  const { context } = event;
  if (Array.isArray(context)) {
    return context.length;
  }
  if (context && typeof context === 'object') {
    const files = context.files;
    if (Array.isArray(files) && files.length) {
      return files.length;
    }
    return 1;
  }
  return 0;
}

function formatPayloadCountLabel(eventName, count) {
  if (!eventName) {
    return count === 1 ? '1 object' : `${count} objects`;
  }
  if (count === 0) {
    return eventName;
  }
  const unit =
    eventName === 'dicom-send' || eventName === 'nifti-send'
      ? 'image'
      : 'object';
  const noun = count === 1 ? unit : `${unit}s`;
  return `${eventName} (${count} ${noun})`;
}

export function summarizeOutboundCastPublish(message) {
  const event =
    message?.event && typeof message.event === 'object'
      ? message.event
      : undefined;
  const hubEvent = getHubEventLower(event);
  const eventName = hubEvent || 'publish';
  const count = countEventContextObjects(event);
  const label = formatPayloadCountLabel(eventName, count);
  return { label, detail: '' };
}

export function summarizeInboundCastMessage(message) {
  if (!message || typeof message !== 'object') {
    return { label: 'raw', detail: stringifyForLog(message) };
  }
  const event = message.event;
  const hubEvent = getHubEventLower(event);
  const eventName =
    hubEvent ||
    (typeof event?.event === 'string' ? String(event.event) : 'message');
  const count = countEventContextObjects(event);
  const label = formatPayloadCountLabel(eventName, count);
  return { label, detail: stringifyForLog(message) };
}

export function sanitizeCastMessageForDisplay(message) {
  return redactValue(message, 0);
}
