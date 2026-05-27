// Cast binary-family events: any ``hub.event`` whose name matches one of these
// prefixes (exact or followed by ``-`` / ``_``) is considered binary-bearing
// for transport purposes. Publishers auto-stamp ``resource.binaryTransfer =
// "http"`` on these events; receivers fetch via ``resource.url``. Plain JSON when no
// resource payload is present.
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
    'CastClient: dicom-send resource.data must be ArrayBuffer, TypedArray, DataView, Blob, or File'
  );
}

function arrayBufferToBase64(arrayBuffer) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(arrayBuffer).toString('base64');
  }

  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  throw new Error('CastClient: no base64 encoder available in this runtime');
}

async function normalizeDicomSendContextItem(item) {
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
  if (!('data' in resource)) {
    throw new Error('CastClient: dicom-send resource.data is required');
  }
  if (typeof resource.data === 'string') {
    throw new Error(
      'CastClient: dicom-send string payloads are not supported; pass binary input instead'
    );
  }

  const normalizedResource = { ...resource };
  const binaryData = await toArrayBufferStrict(resource.data);
  normalizedResource.data = arrayBufferToBase64(binaryData);
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
  // Preserve a publisher-supplied string mode (e.g. 'http'); otherwise default
  // to the legacy WS BINARY follow-up frame (boolean true).
  if (typeof normalizedResource.binaryTransfer !== 'string') {
    normalizedResource.binaryTransfer = true;
  }
  normalizedResource.byteLength = binaryData.byteLength;

  return { ...item, resource: normalizedResource };
}

export async function normalizeDicomSendMessageStrict(msg) {
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
      normalizeDicomSendContextItem(contextItem)
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

// Returns '' or 'http' (hub-registered payload URL on the WebSocket text frame).
export function castBinaryTransferMode(event) {
  const resource = firstBinaryResource(event);
  if (resource && resource.binaryTransfer === 'http') {
    return 'http';
  }
  return '';
}

export function castBinaryTransferEventWaitsForBinaryFrame(event) {
  return false;
}

export function castBinaryTransferHttpUrl(event) {
  const resource = firstBinaryResource(event);
  if (!resource || resource.binaryTransfer !== 'http') {
    return '';
  }
  const url = resource.url;
  return typeof url === 'string' ? url.trim() : '';
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
  // Preserve a publisher-supplied string mode (e.g. 'http'); otherwise default
  // to the legacy WS BINARY follow-up frame (boolean true).
  if (typeof normalizedResource.binaryTransfer !== 'string') {
    normalizedResource.binaryTransfer = true;
  }
  return normalizedResource;
}

async function normalizeNiftiSendContextItem(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('CastClient: nifti-send context items must be objects');
  }
  const resource = item.resource;
  if (!resource || typeof resource !== 'object') {
    throw new Error(
      'CastClient: nifti-send context item missing resource object'
    );
  }
  if (!('data' in resource)) {
    throw new Error('CastClient: nifti-send resource.data is required');
  }
  if (typeof resource.data === 'string') {
    throw new Error(
      'CastClient: nifti-send string payloads are not supported; pass binary input instead'
    );
  }

  const normalizedResource = defaultNiftiResourceFields({ ...resource });
  const binaryData = await toArrayBufferStrict(resource.data);
  normalizedResource.data = arrayBufferToBase64(binaryData);

  return { ...item, resource: normalizedResource };
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
  normalizedResource.byteLength = byteLength;

  return { ...item, resource: normalizedResource };
}

export async function normalizeNiftiSendMessageStrict(msg) {
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
      normalizeNiftiSendContextItem(contextItem)
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

// Stamp ``resource.binaryTransfer = "http"`` on every context item resource
// when ``event['hub.event']`` belongs to the binary event family AND the
// resource has no explicit ``binaryTransfer`` value. Mutates ``msg`` in
// place (and returns it) — runs at the top of publish() before the strict /
// metadata-only normalizers, which preserve a caller-set string.
//
// For metadata-only / "no file" events the hub strips the http marker back
// out before fan-out (see ``cast_api.py:_strip_http_marker``), so it is safe
// to stamp unconditionally here.
export function stampHttpBinaryTransferForBinaryEvents(msg) {
  if (!msg || typeof msg !== 'object') return msg;
  const event = msg.event;
  if (!event || !isCastBinaryEvent(event['hub.event'])) return msg;
  const ctx = event.context;
  let items = [];
  if (Array.isArray(ctx)) {
    items = ctx;
  } else if (ctx != null) {
    items = [ctx];
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && typeof item === 'object') {
      const resource = item.resource;
      if (
        resource &&
        typeof resource === 'object' &&
        resource.binaryTransfer === undefined
      ) {
        resource.binaryTransfer = 'http';
      }
    }
  }
  return msg;
}

function niftiFileNameFromMessage(msg) {
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
  return 'nifti-send.nii.gz';
}

export { toArrayBufferStrict, niftiFileNameFromMessage };
