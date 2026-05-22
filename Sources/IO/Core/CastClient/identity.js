export const DEFAULT_PRODUCT_NAME = 'VTKJS';

const SUBSCRIBER_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function sanitizeProductBase(productName, fallback = DEFAULT_PRODUCT_NAME) {
  return (
    String(productName || fallback)
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}

export function productNameToMessageIdPrefix(productName) {
  return `${sanitizeProductBase(productName)}-`;
}

export function generateMessageId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return prefix + Math.random().toString(36).substring(2, 18);
}

export function generateSubscriberName(productName = DEFAULT_PRODUCT_NAME) {
  const base = sanitizeProductBase(productName);
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    const index = Math.floor(Math.random() * SUBSCRIBER_ID_ALPHABET.length);
    suffix += SUBSCRIBER_ID_ALPHABET[index];
  }
  return `${base}-${suffix}`;
}
