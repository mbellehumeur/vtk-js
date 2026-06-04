function isHostnameLocal(hostname, protocol) {
  if (protocol === 'file:') {
    return true;
  }

  const host = String(hostname || '').toLowerCase();

  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
    return true;
  }

  if (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
  ) {
    return true;
  }

  return false;
}

/**
 * True when the page is served from a public/cloud host (not local dev).
 *
 * @param {Location | null | undefined} [location]
 * @returns {boolean}
 */
export function isRunningInCloud(
  location = typeof window !== 'undefined' ? window.location : null
) {
  if (!location) {
    return false;
  }

  return !isHostnameLocal(location.hostname, location.protocol);
}

/**
 * True when a Cast hub endpoint URL points at a cloud/public host.
 *
 * @param {string} hubEndpoint
 * @returns {boolean}
 */
export function isHubEndpointInCloud(hubEndpoint) {
  try {
    const url = new URL(hubEndpoint);
    return !isHostnameLocal(url.hostname, url.protocol);
  } catch (err) {
    return false;
  }
}

/**
 * Pick the first hub preset whose deployment (local vs cloud) matches the page.
 *
 * @param {Record<string, { hubEndpoint?: string }>} hubs
 * @param {string[]} order - preset keys to try in order
 * @param {boolean} [pageInCloud]
 * @returns {string | undefined}
 */
export function selectFirstMatchingHubKey(
  hubs,
  order,
  pageInCloud = isRunningInCloud()
) {
  const matched = order.find((key) => {
    const endpoint = hubs[key]?.hubEndpoint;
    return endpoint && isHubEndpointInCloud(endpoint) === pageInCloud;
  });
  if (matched) {
    return matched;
  }

  const fallback = pageInCloud ? 'cloud' : 'local';
  if (hubs[fallback]) {
    return fallback;
  }

  return order[0];
}
