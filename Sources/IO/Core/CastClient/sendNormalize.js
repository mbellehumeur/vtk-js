const CAST_BINARY_TRANSFER_EVENTS = new Set(['dicom-send', 'nifti-send']);

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
  normalizedResource.binaryTransfer = true;

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

export function castBinaryTransferEventWaitsForBinaryFrame(event) {
  if (!CAST_BINARY_TRANSFER_EVENTS.has(event['hub.event'])) {
    return false;
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
      if (
        resource &&
        typeof resource === 'object' &&
        resource.binaryTransfer === true &&
        (typeof resource.data !== 'string' || resource.data.length === 0)
      ) {
        return true;
      }
    }
  }

  return false;
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

  const normalizedResource = { ...resource };
  const binaryData = await toArrayBufferStrict(resource.data);
  normalizedResource.data = arrayBufferToBase64(binaryData);
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
  normalizedResource.binaryTransfer = true;

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
