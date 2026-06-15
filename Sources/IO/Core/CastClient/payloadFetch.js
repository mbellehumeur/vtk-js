import {
  contextFilesFromEvent,
  firstPendingPayloadSlot,
  hasPendingPayload,
  payloadChunkPlan,
} from './sendNormalize';

export const HTTP_PAYLOAD_MAX_CONCURRENT = 25;

export function normalizeLoopbackUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.hostname.toLowerCase() === 'localhost') {
      parsed.hostname = '127.0.0.1';
    }
    return parsed.toString();
  } catch (err) {
    return urlString;
  }
}

function isRetryableFetchError(err) {
  if (!(err instanceof Error)) {
    return false;
  }
  const name = err.name || '';
  return name === 'TypeError' || name === 'NetworkError';
}

export function resolvePayloadUrl(payloadId, hubEndpoint) {
  if (!payloadId) {
    return '';
  }
  try {
    const path = `/api/hub/payloads/${encodeURIComponent(payloadId)}`;
    return normalizeLoopbackUrl(new URL(path, hubEndpoint).toString());
  } catch (err) {
    console.warn('CastClient: invalid payloadId url', payloadId, err);
    return '';
  }
}

export function clearPayloadRefs(entry) {
  delete entry.binaryTransfer;
  delete entry.url;
  delete entry.payloadId;
  delete entry.payloadIds;
  delete entry.chunkByteLengths;
  delete entry.expiresAt;
}

export function reassembleFileChunks(chunks, expectedTotal) {
  const total = chunks.reduce((sum, buf) => sum + buf.byteLength, 0);
  if (
    typeof expectedTotal === 'number' &&
    expectedTotal >= 0 &&
    total !== expectedTotal
  ) {
    throw new Error(
      `CastClient: payload size mismatch expected=${expectedTotal} received=${total}`
    );
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    out.set(new Uint8Array(chunks[i]), offset);
    offset += chunks[i].byteLength;
  }
  return out.buffer;
}

export function attachPayloadToFile(castMessage, fileIndex, buf) {
  const event = castMessage && castMessage.event;
  const ctx = event && event.context;
  const files = ctx && ctx.files;
  const entry = files && files[fileIndex];
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  clearPayloadRefs(entry);
  entry.data = buf;
  entry.byteLength = buf.byteLength;
  return true;
}

export async function downloadPayloadBytes(
  payloadId,
  expectedChunkBytes,
  { hubEndpoint, accessToken }
) {
  const resolved = resolvePayloadUrl(payloadId, hubEndpoint);
  if (!resolved) {
    throw new Error('CastClient.fetchPayload: missing or invalid payloadId');
  }
  const headers = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  async function fetchOnce() {
    const response = await fetch(resolved, {
      method: 'GET',
      credentials: 'omit',
      headers,
    });
    if (!response.ok) {
      throw new Error(
        `CastClient.fetchPayload: GET ${response.status} ${response.statusText}`
      );
    }
    const buf = await response.arrayBuffer();
    if (
      typeof expectedChunkBytes === 'number' &&
      expectedChunkBytes >= 0 &&
      buf.byteLength !== expectedChunkBytes
    ) {
      throw new Error(
        `CastClient.fetchPayload: chunk size mismatch payloadId=${payloadId.slice(
          0,
          8
        )} expected=${expectedChunkBytes} received=${buf.byteLength}`
      );
    }
    return buf;
  }

  try {
    return await fetchOnce();
  } catch (err) {
    if (isRetryableFetchError(err)) {
      return fetchOnce();
    }
    throw err;
  }
}

export async function downloadFilePayloadChunks(entry, hubAccess) {
  const plan = payloadChunkPlan(entry);
  if (!plan.payloadIds.length) {
    throw new Error('CastClient.fetchPayload: no payloadIds on file entry');
  }
  const chunks = [];
  for (
    let start = 0;
    start < plan.payloadIds.length;
    start += HTTP_PAYLOAD_MAX_CONCURRENT
  ) {
    const batchIds = plan.payloadIds.slice(
      start,
      start + HTTP_PAYLOAD_MAX_CONCURRENT
    );
    const batchLens = plan.chunkByteLengths.slice(
      start,
      start + HTTP_PAYLOAD_MAX_CONCURRENT
    );
    // eslint-disable-next-line no-await-in-loop
    const batchBufs = await Promise.all(
      batchIds.map((id, idx) =>
        downloadPayloadBytes(id, batchLens[idx] ?? null, hubAccess)
      )
    );
    chunks.push(...batchBufs);
  }
  return reassembleFileChunks(
    chunks,
    typeof entry.byteLength === 'number' ? entry.byteLength : null
  );
}

function cloneCastMessage(castMessage) {
  return JSON.parse(JSON.stringify(castMessage));
}

/**
 * @param {object} hubAccess { hubEndpoint, accessToken }
 */
export function createPayloadFetchApi(hubAccess) {
  const getHubAccess = () => hubAccess();

  return {
    hasPendingPayload(castMessage) {
      const event = castMessage && castMessage.event;
      return Boolean(event && hasPendingPayload(event));
    },

    async fetchPayload(castMessage) {
      const event = castMessage && castMessage.event;
      if (!event || !hasPendingPayload(event)) {
        return castMessage;
      }
      const slot = firstPendingPayloadSlot(event);
      if (!slot) {
        return castMessage;
      }
      const startedAt =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      const entry = event.context.files[slot.index];
      const buf = await downloadFilePayloadChunks(entry, getHubAccess());
      const enriched = cloneCastMessage(castMessage);
      const attached = attachPayloadToFile(enriched, slot.index, buf);
      if (!attached) {
        throw new Error('CastClient.fetchPayload: no payload slot on message');
      }
      const elapsedMs =
        (typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()) - startedAt;
      console.debug(
        `CastClient: payload fetched fileIndex=${slot.index} ` +
          `bytes=${buf.byteLength} elapsed=${(elapsedMs / 1000).toFixed(2)}s`
      );
      return enriched;
    },

    async fetchAllPayloads(castMessage) {
      const event = castMessage && castMessage.event;
      const files = event ? contextFilesFromEvent(event) : [];
      const pendingIndices = [];
      for (let i = 0; i < files.length; i++) {
        const plan = payloadChunkPlan(files[i]);
        if (plan.payloadIds.length && files[i].data == null) {
          pendingIndices.push(i);
        }
      }
      if (!pendingIndices.length) {
        return castMessage;
      }
      const enriched = cloneCastMessage(castMessage);
      for (let f = 0; f < pendingIndices.length; f++) {
        const fileIndex = pendingIndices[f];
        const entry = enriched.event.context.files[fileIndex];
        // eslint-disable-next-line no-await-in-loop
        const buf = await downloadFilePayloadChunks(entry, getHubAccess());
        if (!attachPayloadToFile(enriched, fileIndex, buf)) {
          throw new Error('CastClient.fetchAllPayloads: attach failed');
        }
      }
      return enriched;
    },
  };
}
