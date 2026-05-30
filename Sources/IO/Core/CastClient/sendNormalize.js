// Cast binary-family events: any ``hub.event`` whose name matches one of these
// prefixes (exact or followed by ``-`` / ``_``) may carry a file attachment.
// Publishers POST multipart/form-data (message JSON + file part); the hub
// stores bytes and fans out ``resource.payloadId`` on the WebSocket text frame.
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

function firstBinaryResource(event) {
  if (!event || !isCastBinaryEvent(event['hub.event'])) {
    return null;
  }
  const context = event.context;
  let items = [];
  if (Array.isArray(context)) {
    items = context;
  } else if (context != null) {
    items = [context];
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && typeof item === 'object') {
      const resource = item.resource;
      if (resource && typeof resource === 'object') {
        return resource;
      }
    }
  }
  return null;
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

function firstPendingPayloadSlot(event) {
  const files = contextFilesFromEvent(event);
  for (let i = 0; i < files.length; i++) {
    const entry = files[i];
    const payloadId =
      typeof entry.payloadId === 'string' ? entry.payloadId.trim() : '';
    if (payloadId && entry.data == null) {
      return { kind: 'files', index: i, payloadId };
    }
  }
  const resource = firstBinaryResource(event);
  if (resource) {
    const payloadId =
      typeof resource.payloadId === 'string' ? resource.payloadId.trim() : '';
    if (payloadId && resource.data == null) {
      return { kind: 'resource', payloadId };
    }
  }
  return null;
}

export function castPayloadIdFromEvent(event) {
  const slot = firstPendingPayloadSlot(event);
  return slot ? slot.payloadId : '';
}

export function hasPendingPayload(event) {
  return Boolean(firstPendingPayloadSlot(event));
}

/** Every unfetched ``payloadId`` on ``context.files[]`` then ``resource``. */
export function listPendingPayloadSlots(event) {
  const slots = [];
  const files = contextFilesFromEvent(event);
  for (let i = 0; i < files.length; i++) {
    const entry = files[i];
    const payloadId =
      typeof entry.payloadId === 'string' ? entry.payloadId.trim() : '';
    if (payloadId && entry.data == null) {
      slots.push({ kind: 'files', index: i, payloadId });
    }
  }
  const context = event && event.context;
  let items = [];
  if (Array.isArray(context)) {
    items = context;
  } else if (context != null) {
    items = [context];
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object') {
      continue;
    }
    const resource = item.resource;
    if (!resource || typeof resource !== 'object') {
      continue;
    }
    const payloadId =
      typeof resource.payloadId === 'string' ? resource.payloadId.trim() : '';
    if (payloadId && resource.data == null) {
      slots.push({ kind: 'resource', index: i, payloadId });
    }
  }
  return slots;
}

function defaultDicomResourceFields(normalizedResource) {
  normalizedResource.fileName =
    typeof normalizedResource.fileName === 'string' &&
    normalizedResource.fileName.trim()
      ? normalizedResource.fileName
      : 'dicom-send.dcm';
  normalizedResource.mimeType =
    typeof normalizedResource.mimeType === 'string' &&
    normalizedResource.mimeType.trim()
      ? normalizedResource.mimeType
      : 'application/dicom';
  return normalizedResource;
}

function defaultNiftiResourceFields(normalizedResource) {
  normalizedResource.fileName =
    typeof normalizedResource.fileName === 'string' &&
    normalizedResource.fileName.trim()
      ? normalizedResource.fileName
      : 'nifti-send.nii.gz';
  normalizedResource.mimeType =
    typeof normalizedResource.mimeType === 'string' &&
    normalizedResource.mimeType.trim()
      ? normalizedResource.mimeType
      : 'application/vnd.unknown.nifti-1';
  return normalizedResource;
}

async function normalizeDicomSendContextItemMetadataOnly(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('CastClient: dicom-send context items must be objects');
  }
  const status =
    typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';
  if (status === 'complete') {
    return { ...item };
  }
  const resource = item.resource;
  if (!resource || typeof resource !== 'object') {
    throw new Error(
      'CastClient: dicom-send context item missing resource object'
    );
  }

  let byteLength =
    typeof resource.byteLength === 'number' && resource.byteLength >= 0
      ? resource.byteLength
      : null;

  if ('data' in resource && resource.data != null) {
    if (typeof resource.data === 'string') {
      throw new Error(
        'CastClient: dicom-send string payloads are not supported; pass binary input instead'
      );
    }
    const binaryData = await toArrayBufferStrict(resource.data);
    byteLength = binaryData.byteLength;
  }

  if (byteLength == null) {
    throw new Error(
      'CastClient: dicom-send multipart requires resource.data or resource.byteLength'
    );
  }

  const normalizedResource = defaultDicomResourceFields({ ...resource });
  delete normalizedResource.data;
  delete normalizedResource.binaryTransfer;
  delete normalizedResource.url;
  delete normalizedResource.payloadId;
  delete normalizedResource.expiresAt;
  normalizedResource.byteLength = byteLength;

  return { ...item, resource: normalizedResource };
}

export async function normalizeDicomSendMessageMetadataOnly(msg) {
  if (!msg.event || typeof msg.event !== 'object') {
    throw new Error('CastClient: dicom-send requires event object');
  }
  const event = msg.event;
  if (event['hub.event'] !== 'dicom-send') {
    return msg;
  }

  const contextValue = event.context;
  let contextItems = [];
  if (Array.isArray(contextValue)) {
    contextItems = contextValue;
  } else if (contextValue != null) {
    contextItems = [contextValue];
  }
  if (!contextItems.length) {
    throw new Error('CastClient: dicom-send requires non-empty event.context');
  }

  const normalizedContext = await Promise.all(
    contextItems.map((contextItem) =>
      normalizeDicomSendContextItemMetadataOnly(contextItem)
    )
  );

  return {
    ...msg,
    event: {
      ...event,
      context: normalizedContext,
    },
  };
}

async function normalizeNiftiSendContextItemMetadataOnly(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('CastClient: nifti-send context items must be objects');
  }
  const resource = item.resource;
  if (!resource || typeof resource !== 'object') {
    throw new Error(
      'CastClient: nifti-send context item missing resource object'
    );
  }

  let byteLength =
    typeof resource.byteLength === 'number' && resource.byteLength >= 0
      ? resource.byteLength
      : null;

  if ('data' in resource && resource.data != null) {
    if (typeof resource.data === 'string') {
      throw new Error(
        'CastClient: nifti-send string payloads are not supported; pass binary input instead'
      );
    }
    const binaryData = await toArrayBufferStrict(resource.data);
    byteLength = binaryData.byteLength;
  }

  if (byteLength == null) {
    throw new Error(
      'CastClient: nifti-send multipart requires resource.data or resource.byteLength'
    );
  }

  const normalizedResource = defaultNiftiResourceFields({ ...resource });
  delete normalizedResource.data;
  delete normalizedResource.binaryTransfer;
  delete normalizedResource.url;
  delete normalizedResource.payloadId;
  delete normalizedResource.expiresAt;
  normalizedResource.byteLength = byteLength;

  return { ...item, resource: normalizedResource };
}

export async function normalizeNiftiSendMessageMetadataOnly(msg) {
  if (!msg.event || typeof msg.event !== 'object') {
    throw new Error('CastClient: nifti-send requires event object');
  }
  const event = msg.event;
  if (event['hub.event'] !== 'nifti-send') {
    return msg;
  }

  const contextValue = event.context;
  let contextItems = [];
  if (Array.isArray(contextValue)) {
    contextItems = contextValue;
  } else if (contextValue != null) {
    contextItems = [contextValue];
  }
  if (!contextItems.length) {
    throw new Error('CastClient: nifti-send requires non-empty event.context');
  }

  const normalizedContext = await Promise.all(
    contextItems.map((contextItem) =>
      normalizeNiftiSendContextItemMetadataOnly(contextItem)
    )
  );

  return {
    ...msg,
    event: {
      ...event,
      context: normalizedContext,
    },
  };
}

export async function normalizeBinaryPublishMessageMetadataOnly(msg) {
  if (!msg.event || typeof msg.event !== 'object') {
    return msg;
  }
  const hubEvent = msg.event['hub.event'];
  if (hubEvent === 'dicom-send') {
    return normalizeDicomSendMessageMetadataOnly(msg);
  }
  if (hubEvent === 'nifti-send') {
    return normalizeNiftiSendMessageMetadataOnly(msg);
  }
  if (!isCastBinaryEvent(hubEvent)) {
    return msg;
  }
  throw new Error(
    `CastClient: multipart publish metadata normalizer not implemented for ${hubEvent}`
  );
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

export async function extractFirstBinaryFileBytes(msg) {
  const event = msg && msg.event;
  if (!event) {
    return null;
  }
  const contextValue = event.context;
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
      if (resource && typeof resource === 'object' && resource.data != null) {
        return toArrayBufferStrict(resource.data);
      }
    }
  }
  return null;
}

export function messageNeedsMultipartPublish(msg) {
  const event = msg && msg.event;
  if (!event || !isCastBinaryEvent(event['hub.event'])) {
    return false;
  }
  const files = contextFilesFromEvent(event);
  if (files.length) {
    return files.some((entry) => entry.data != null);
  }
  const contextValue = event.context;
  let items = [];
  if (Array.isArray(contextValue)) {
    items = contextValue;
  } else if (contextValue != null) {
    items = [contextValue];
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && typeof item === 'object') {
      const status =
        typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';
      if (status !== 'complete') {
        const resource = item.resource;
        if (resource && typeof resource === 'object' && resource.data != null) {
          return true;
        }
      }
    }
  }
  return false;
}

export function messageNeedsStowBatchPublish(msg) {
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

async function normalizeStowBatchFileEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('CastClient: STOW batch files[] entries must be objects');
  }
  let byteLength =
    typeof entry.byteLength === 'number' && entry.byteLength >= 0
      ? entry.byteLength
      : null;
  if ('data' in entry && entry.data != null) {
    if (typeof entry.data === 'string') {
      throw new Error(
        'CastClient: STOW batch string payloads are not supported; pass binary input instead'
      );
    }
    const binaryData = await toArrayBufferStrict(entry.data);
    byteLength = binaryData.byteLength;
  }
  if (byteLength == null) {
    throw new Error(
      'CastClient: STOW batch requires files[].data or files[].byteLength'
    );
  }
  const normalized = { ...entry };
  delete normalized.data;
  delete normalized.binaryTransfer;
  delete normalized.url;
  delete normalized.payloadId;
  delete normalized.expiresAt;
  normalized.byteLength = byteLength;
  if (typeof normalized.fileName !== 'string' || !normalized.fileName.trim()) {
    normalized.fileName = 'dicom-send.dcm';
  }
  if (typeof normalized.mimeType !== 'string' || !normalized.mimeType.trim()) {
    normalized.mimeType = 'application/dicom';
  }
  return normalized;
}

export async function normalizeStowBatchMessageMetadataOnly(msg) {
  if (!msg.event || typeof msg.event !== 'object') {
    throw new Error('CastClient: STOW batch requires event object');
  }
  const event = msg.event;
  if (!isCastBinaryEvent(event['hub.event'])) {
    return msg;
  }
  const ctx = event.context;
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) {
    throw new Error('CastClient: STOW batch requires event.context object');
  }
  const files = ctx.files;
  if (!Array.isArray(files) || !files.length) {
    throw new Error(
      'CastClient: STOW batch requires non-empty event.context.files[]'
    );
  }
  const normalizedFiles = await Promise.all(
    files.map((entry) => normalizeStowBatchFileEntry(entry))
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

export async function extractStowBatchFileBytes(msg) {
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
