import { requestEventFor } from './eventNames';

export const DICOM_TRANSFER_DATA_TYPE = 'dicomtransfer';

/**
 * Build a Cast request envelope for ``dicomtransfer-request``.
 *
 * @param {object} options
 * @param {string} options.subscriberName
 * @param {string} options.topic
 * @param {object} options.manifest - ``{ dicomTransferId, files }``
 * @param {string} [options.subscriberActor='ID']
 */
export function buildDicomTransferRequestMessage({
  subscriberName,
  subscriberActor = 'ID',
  topic,
  manifest,
}) {
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  return {
    'subscriber.name': subscriberName,
    'subscriber.actor': subscriberActor,
    'target.actor': '*',
    'target.product.name': '*',
    event: {
      'hub.topic': topic,
      'hub.event': requestEventFor(DICOM_TRANSFER_DATA_TYPE),
      context: {
        dataType: DICOM_TRANSFER_DATA_TYPE,
        dicomTransferId: manifest.dicomTransferId,
        files,
      },
    },
  };
}

/**
 * Build a negotiated per-file ``dicom-send`` publish (one file per message).
 */
export function buildDicomTransferFilePublishMessage({
  topic,
  dicomTransferId,
  fileName,
  data,
  mimeType = 'application/dicom',
}) {
  return {
    event: {
      'hub.topic': topic,
      'hub.event': 'dicom-send',
      context: {
        dicomTransferId,
        fileName,
        resource: {
          fileName,
          mimeType,
          data,
        },
      },
    },
  };
}

/**
 * Signal end of a negotiated transfer (no pixel payload).
 */
export function buildDicomTransferCompletePublishMessage({
  topic,
  dicomTransferId,
  message = 'complete',
}) {
  return {
    event: {
      'hub.topic': topic,
      'hub.event': 'dicom-send',
      context: {
        dicomTransferId,
        status: 'complete',
        message,
      },
    },
  };
}
