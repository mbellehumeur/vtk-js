// Cast binary-family events: any ``hub.event`` whose name matches one of these
// prefixes (exact or followed by ``-`` / ``_``) may carry a file attachment.
// Publishers POST multipart/related binary batch (JSON + file parts); the hub stores
// bytes and fans out ``context.files[].payloadIds[]`` on the WebSocket text frame.
// Receivers call ``fetchPayload`` when the application chooses to download.
const CAST_BINARY_EVENT_PREFIXES = ['dicom', 'nifti', 'jpg', 'png', 'nrrd'];

export function isCastBinaryEvent(eventName) {
  if (typeof eventName !== 'string') return false;
  const name = eventName.trim().toLowerCase();
  if (!name) return false;
  for (let i = 0; i < CAST_BINARY_EVENT_PREFIXES.length; i++) {
    const p = CAST_BINARY_EVENT_PREFIXES[i];
    if (name === p || name.startsWith(`${p}-`) || name.startsWith(`${p}_`)) {
      return true;
    }
  }
  return false;
}

function isArrayBufferView(value) {
  return typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value);
}

async function toArrayBufferStrict(data) {
  if (data instanceof ArrayBuffer) {
    return data;
  }

  if (isArrayBufferView(data)) {
    const { buffer, byteOffset, byteLength } = data;
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }

  if (
    typeof Blob !== 'undefined' &&
    data instanceof Blob &&
    typeof data.arrayBuffer === 'function'
  ) {
    return data.arrayBuffer();
  }

  throw new Error(
    'CastClient: binary resource.data must be ArrayBuffer, TypedArray, DataView, Blob, or File'
  );
}

function contextFilesFromEvent(event) {
  const ctx = event && event.context;
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) {
    return [];
  }
  const files = ctx.files;
  if (!Array.isArray(files)) {
    return [];
  }
  return files.filter((entry) => entry && typeof entry === 'object');
}

/** Resolve ``payloadIds`` / ``chunkByteLengths`` (legacy ``payloadId`` fallback). */
export function payloadChunkPlan(entry) {
  if (!entry || typeof entry !== 'object' || entry.data != null) {
    return { payloadIds: [], chunkByteLengths: [] };
  }
  const payloadIdsRaw = entry.payloadIds;
  if (Array.isArray(payloadIdsRaw) && payloadIdsRaw.length) {
    const payloadIds = payloadIdsRaw
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean);
    const chunkByteLengths = Array.isArray(entry.chunkByteLengths)
      ? entry.chunkByteLengths.filter((n) => typeof n === 'number' && n >= 0)
      : [];
    if (chunkByteLengths.length === payloadIds.length) {
      return { payloadIds, chunkByteLengths };
    }
    if (payloadIds.length === 1) {
      const byteLength =
        typeof entry.byteLength === 'number' && entry.byteLength >= 0
          ? entry.byteLength
          : null;
      return {
        payloadIds,
        chunkByteLengths: byteLength != null ? [byteLength] : [],
      };
    }
  }
  const legacyId =
    typeof entry.payloadId === 'string' ? entry.payloadId.trim() : '';
  if (legacyId) {
    const byteLength =
      typeof entry.byteLength === 'number' && entry.byteLength >= 0
        ? entry.byteLength
        : null;
    return {
      payloadIds: [legacyId],
      chunkByteLengths: byteLength != null ? [byteLength] : [],
    };
  }
  return { payloadIds: [], chunkByteLengths: [] };
}

function firstPendingFileChunkSlot(event) {
  const files = contextFilesFromEvent(event);
  for (let i = 0; i < files.length; i++) {
    const entry = files[i];
    if (entry.data == null) {
      const plan = payloadChunkPlan(entry);
      if (plan.payloadIds.length) {
        return {
          kind: 'files',
          index: i,
          chunkIndex: 0,
          payloadId: plan.payloadIds[0],
          expectedChunkBytes: plan.chunkByteLengths[0] ?? null,
        };
      }
    }
  }
  return null;
}

function firstPendingPayloadSlot(event) {
  return firstPendingFileChunkSlot(event);
}

export function hasPendingPayload(event) {
  return Boolean(firstPendingPayloadSlot(event));
}

function defaultBinaryBatchFileName(hubEvent, index) {
  const name =
    typeof hubEvent === 'string' ? hubEvent.trim().toLowerCase() : '';
  if (name.startsWith('nifti')) {
    return index === 0 ? 'nifti-send.nii.gz' : `nifti-send-${index + 1}.nii.gz`;
  }
  return index === 0 ? 'dicom-send.dcm' : `dicom-send-${index + 1}.dcm`;
}

function defaultBinaryBatchMimeType(hubEvent) {
  const name =
    typeof hubEvent === 'string' ? hubEvent.trim().toLowerCase() : '';
  if (name.startsWith('nifti')) {
    return 'application/octet-stream';
  }
  return 'application/dicom';
}

export function coerceBinaryPublishToFiles(msg) {
  const event = msg && msg.event;
  if (!event || !isCastBinaryEvent(event['hub.event'])) {
    return msg;
  }
  if (contextFilesFromEvent(event).length) {
    return msg;
  }
  const hubEvent = event['hub.event'];
  const context = event.context;
  let items = [];
  if (Array.isArray(context)) {
    items = context;
  } else if (context != null) {
    items = [context];
  }
  const files = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && typeof item === 'object') {
      const resource = item.resource;
      if (resource && typeof resource === 'object' && resource.data != null) {
        const entry = { ...resource };
        if (typeof entry.fileName !== 'string' || !entry.fileName.trim()) {
          entry.fileName = defaultBinaryBatchFileName(hubEvent, i);
        }
        if (typeof entry.mimeType !== 'string' || !entry.mimeType.trim()) {
          entry.mimeType = defaultBinaryBatchMimeType(hubEvent);
        }
        files.push(entry);
      }
    }
  }
  if (!files.length) {
    return msg;
  }
  return {
    ...msg,
    event: {
      ...event,
      context: {
        files,
      },
    },
  };
}

function binaryFileNameFromMessage(msg, defaultName) {
  const event = msg && msg.event;
  const contextValue = event && event.context;
  let items = [];
  if (Array.isArray(contextValue)) {
    items = contextValue;
  } else if (contextValue != null) {
    items = [contextValue];
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && typeof item === 'object') {
      const resource = item.resource;
      if (resource && typeof resource === 'object') {
        const name =
          typeof resource.fileName === 'string' ? resource.fileName.trim() : '';
        if (name) {
          return name;
        }
      }
    }
  }
  return defaultName;
}

function niftiFileNameFromMessage(msg) {
  return binaryFileNameFromMessage(msg, 'nifti-send.nii.gz');
}

export function messageNeedsBinaryBatchPublish(msg) {
  const event = msg && msg.event;
  if (!event || !isCastBinaryEvent(event['hub.event'])) {
    return false;
  }
  const files = contextFilesFromEvent(event);
  if (!files.length) {
    return false;
  }
  return files.some((entry) => entry.data != null);
}

async function normalizeBinaryBatchFileEntry(entry, hubEvent = '', index = 0) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(
      'CastClient: binary batch publish files[] entries must be objects'
    );
  }
  let byteLength =
    typeof entry.byteLength === 'number' && entry.byteLength >= 0
      ? entry.byteLength
      : null;
  if ('data' in entry && entry.data != null) {
    if (typeof entry.data === 'string') {
      throw new Error(
        'CastClient: binary batch publish string payloads are not supported; pass binary input instead'
      );
    }
    const binaryData = await toArrayBufferStrict(entry.data);
    byteLength = binaryData.byteLength;
  }
  if (byteLength == null) {
    throw new Error(
      'CastClient: binary batch publish requires files[].data or files[].byteLength'
    );
  }
  const normalized = { ...entry };
  delete normalized.data;
  delete normalized.binaryTransfer;
  delete normalized.url;
  delete normalized.payloadId;
  delete normalized.payloadIds;
  delete normalized.chunkByteLengths;
  delete normalized.expiresAt;
  normalized.byteLength = byteLength;
  if (typeof normalized.fileName !== 'string' || !normalized.fileName.trim()) {
    normalized.fileName = defaultBinaryBatchFileName(hubEvent, index);
  }
  if (typeof normalized.mimeType !== 'string' || !normalized.mimeType.trim()) {
    normalized.mimeType = defaultBinaryBatchMimeType(hubEvent);
  }
  return normalized;
}

export async function normalizeBinaryBatchMessageMetadataOnly(msg) {
  if (!msg.event || typeof msg.event !== 'object') {
    throw new Error('CastClient: binary batch publish requires event object');
  }
  const event = msg.event;
  if (!isCastBinaryEvent(event['hub.event'])) {
    return msg;
  }
  const ctx = event.context;
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) {
    throw new Error(
      'CastClient: binary batch publish requires event.context object'
    );
  }
  const files = ctx.files;
  if (!Array.isArray(files) || !files.length) {
    throw new Error(
      'CastClient: binary batch publish requires non-empty event.context.files[]'
    );
  }
  const hubEvent = event['hub.event'];
  const normalizedFiles = await Promise.all(
    files.map((entry, index) =>
      normalizeBinaryBatchFileEntry(entry, hubEvent, index)
    )
  );
  return {
    ...msg,
    event: {
      ...event,
      context: {
        ...ctx,
        files: normalizedFiles,
      },
    },
  };
}

export async function extractBinaryBatchFileBytes(msg) {
  const event = msg && msg.event;
  if (!event) {
    return [];
  }
  const files = contextFilesFromEvent(event);
  const withData = files.filter(
    (entry) => entry && typeof entry === 'object' && entry.data != null
  );
  return Promise.all(withData.map((entry) => toArrayBufferStrict(entry.data)));
}

export {
  toArrayBufferStrict,
  niftiFileNameFromMessage,
  binaryFileNameFromMessage,
  contextFilesFromEvent,
  firstPendingPayloadSlot,
};
