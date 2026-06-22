import { generateMessageId } from './identity';
import {
  contextFilesFromEvent,
  fileIndicesNeedingBinaryBatchPart,
  normalizeBinaryBatchMessageMetadataOnly,
  toArrayBufferStrict,
} from './sendNormalize';

export function buildBinaryBatchRelatedBody(boundary, jsonText, fileParts) {
  const enc = new TextEncoder();
  const crlf = enc.encode('\r\n');
  const chunks = [];
  const pushText = (text) => {
    chunks.push(enc.encode(text));
  };
  pushText(
    `--${boundary}\r\nContent-Type: application/dicom+json\r\n\r\n${jsonText}\r\n`
  );
  for (let i = 0; i < fileParts.length; i++) {
    const part = fileParts[i];
    const mime =
      (part && part.mimeType && String(part.mimeType).trim()) ||
      'application/octet-stream';
    pushText(`--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
    chunks.push(new Uint8Array(part.buffer));
    chunks.push(crlf);
  }
  pushText(`--${boundary}--\r\n`);
  return new Blob(chunks);
}

/**
 * @param {object} params
 * @param {object} params.msg Prepared Cast message (metadata-only after normalize)
 * @param {ArrayBuffer[]} params.fileBytesList
 * @param {object} params.hub Hub runtime state with hub_endpoint and token
 * @param {() => string} params.messageIdPrefix
 */
export async function postBinaryBatchPublish({
  msg,
  fileBytesList,
  hub,
  messageIdPrefix,
}) {
  const normalized = await normalizeBinaryBatchMessageMetadataOnly(msg);
  const rawList = await Promise.all(
    (fileBytesList || []).map((bytes) => toArrayBufferStrict(bytes))
  );
  const files = contextFilesFromEvent(normalized.event);
  const indicesNeedingParts = fileIndicesNeedingBinaryBatchPart(files);
  if (rawList.length !== indicesNeedingParts.length) {
    throw new Error(
      `CastClient: binary batch publish expected ${indicesNeedingParts.length} file part(s), got ${rawList.length}`
    );
  }
  const fileParts = rawList.map((buffer, partIndex) => {
    const fileIndex = indicesNeedingParts[partIndex];
    return {
      buffer,
      mimeType:
        (files[fileIndex] && files[fileIndex].mimeType) ||
        'application/octet-stream',
    };
  });
  const boundary = `cast-batch-${generateMessageId(messageIdPrefix())}`;
  const body = buildBinaryBatchRelatedBody(
    boundary,
    JSON.stringify(normalized),
    fileParts
  );

  try {
    return await fetch(hub.hub_endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hub.token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"; type="application/dicom"`,
      },
      body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.debug('CastClient:', message);
    return null;
  }
}
