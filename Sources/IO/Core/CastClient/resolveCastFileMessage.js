import { hasPendingPayload } from './sendNormalize';

export function castMessageHasPendingFilePayloads(message) {
  const event = message?.event;
  return Boolean(event && hasPendingPayload(event));
}

/**
 * Download pending binary batch file bytes before the app handles the message.
 *
 * @param {object} client vtkCastClient-like instance
 * @param {object} message Cast message
 * @returns {Promise<object>}
 */
export async function resolveCastFileMessage(client, message) {
  const pending =
    client?.hasPendingPayload?.(message) ||
    castMessageHasPendingFilePayloads(message);
  if (!pending) {
    return message;
  }
  let resolved = message;
  if (client?.fetchAllPayloads) {
    resolved = await client.fetchAllPayloads(message);
  } else if (client?.fetchPayload) {
    while (client.hasPendingPayload?.(resolved)) {
      // eslint-disable-next-line no-await-in-loop
      resolved = await client.fetchPayload(resolved);
    }
  }
  return resolved;
}

/**
 * @deprecated Use ``resolveCastFileMessage`` for binary-family events with pending payloads.
 */
export default async function enrichBinaryBatchMessage(client, message) {
  return resolveCastFileMessage(client, message);
}
