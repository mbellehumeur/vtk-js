import { isCastBinaryEvent } from '../sendNormalize';

/**
 * When a binary-family event arrives with payloadIds, download all file bytes
 * before the app handles the message.
 *
 * @param {import('../index').vtkCastClient} client
 * @param {import('../index').CastMessage} message
 * @returns {Promise<import('../index').CastMessage>}
 */
async function enrichBinaryBatchMessage(client, message) {
  const event = message && message.event;
  const hubEvent =
    event && typeof event['hub.event'] === 'string' ? event['hub.event'] : '';
  if (!hubEvent || !isCastBinaryEvent(hubEvent)) {
    return message;
  }
  if (!client.hasPendingPayload(message)) {
    return message;
  }
  return client.fetchAllPayloads(message);
}

export default enrichBinaryBatchMessage;
