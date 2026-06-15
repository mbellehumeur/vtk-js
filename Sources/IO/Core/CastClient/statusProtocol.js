/** Wire product names used by TotalSegmentator resource servers. */
export const TOTAL_SEGMENTATOR_PRODUCT_ALIASES = [
  'TOTALSEG',
  'TOTAL_SEGMENTATOR',
  'TOTAL-SEGMENTATOR',
];

function normalizeProductToken(name) {
  return String(name).trim().toUpperCase().replace(/-/g, '_');
}

export function isTotalSegmentatorProduct(name) {
  const normalized = normalizeProductToken(name);
  if (!normalized) {
    return false;
  }
  return TOTAL_SEGMENTATOR_PRODUCT_ALIASES.some(
    (alias) => normalizeProductToken(alias) === normalized
  );
}

export function statusItemValue(items, key) {
  if (!Array.isArray(items)) {
    return undefined;
  }
  const needle = String(key).trim().toLowerCase();
  const match = items.find((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const itemKey = String(entry.key ?? '')
      .trim()
      .toLowerCase();
    return itemKey === needle;
  });
  if (!match) {
    return undefined;
  }
  const value = match.value;
  return typeof value === 'string' ? value.trim() : undefined;
}

export function isStatusPayloadOnline(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  if (data.source !== 'status') {
    return false;
  }
  const availability = statusItemValue(data.items, 'availability');
  if (availability) {
    return availability.toLowerCase() === 'online';
  }
  return Array.isArray(data.items) && data.items.length > 0;
}

export function productNameFromStatusResponseItem(item) {
  const fromEnvelope = String(item?.productName ?? '').trim();
  if (fromEnvelope) {
    return fromEnvelope;
  }
  const data = item?.data;
  if (data && typeof data === 'object') {
    const fromPayload = String(data.product ?? '').trim();
    if (fromPayload) {
      return fromPayload;
    }
  }
  return '';
}

export function totalSegmentatorAvailableFromStatusResponses(responses) {
  return responses.some((item) => {
    const product = productNameFromStatusResponseItem(item);
    return (
      isTotalSegmentatorProduct(product) && isStatusPayloadOnline(item.data)
    );
  });
}

export function isStatusRequestDataType(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return value.trim().toUpperCase() === 'STATUS';
}
