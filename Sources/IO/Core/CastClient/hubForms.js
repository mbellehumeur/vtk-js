import { getClientInfoPayload } from './wireEnvelope';

export function buildHubCallbackUrl(callbackUrl) {
  if (callbackUrl) {
    return callbackUrl;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/castCallback`;
  }
  return '';
}

/**
 * @param {'subscribe'|'unsubscribe'} mode
 * @param {object} session
 * @param {string} callbackUrl
 */
export function buildHubModeFormData(
  mode,
  session,
  callbackUrl,
  configProductVersion = ''
) {
  const formData = new URLSearchParams();
  formData.append('hub.mode', mode);
  formData.append('hub.channel.type', 'websocket');
  formData.append('hub.callback', callbackUrl);
  formData.append('hub.events', (session.events || []).toString());
  formData.append('hub.topic', session.topic || '');
  formData.append('hub.lease', String(session.lease || 999));
  formData.append('subscriber.name', session.subscriberName || '');
  formData.append('subscriber.product.name', session.productName || '');
  formData.append(
    'subscriber.product.version',
    session.productVersion || configProductVersion || ''
  );
  const actors = (session.actors || [])
    .map((actor) => actor.trim())
    .filter(Boolean);
  if (actors.length) {
    formData.append('subscriber.actors', JSON.stringify(actors));
  }
  const clientInfo = getClientInfoPayload();
  if (clientInfo) {
    formData.append('subscriber.client_info', JSON.stringify(clientInfo));
  }
  return formData;
}
