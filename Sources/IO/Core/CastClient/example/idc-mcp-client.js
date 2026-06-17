/**
 * MCP Streamable HTTP client for the IDC MCP server (CastClient example).
 * Production/static hosting needs a reverse proxy for /idc-mcp-proxy (see IDC_MCP_URL).
 */

// Browser-relative via webpack devServer proxy; override with IDC_MCP_ENDPOINT.
export const IDC_MCP_URL =
  typeof window !== 'undefined' && window.IDC_MCP_ENDPOINT
    ? String(window.IDC_MCP_ENDPOINT)
    : '/idc-mcp-proxy/mcp';

export const IDC_MCP_PUBLIC_URL =
  'https://idc-mcp-v3-293449031882.us-central1.run.app/mcp';

const MCP_PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05'];
const MCP_REQUEST_TIMEOUT_MS = 180000;
const NL_PROMPT_ARG_NAMES = [
  'prompt',
  'query',
  'user_message',
  'user_query',
  'message',
  'text',
  'input',
];
const IDC_QUERY_TOOL_HINTS = ['query', 'search', 'cohort', 'idc', 'sql'];

function isLikelySql(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return false;
  }
  return /^(SELECT|WITH)\b/i.test(trimmed);
}

function extractTextFromToolContent(content) {
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return '';
      }
      if (part.type === 'text' && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function parseJsonRpcEnvelope(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload.error) {
    const message =
      payload.error.message ||
      payload.error.data ||
      JSON.stringify(payload.error);
    throw new Error(String(message));
  }
  return payload.result;
}

function parseSseBuffer(buffer) {
  const events = [];
  const chunks = buffer.split(/\n\n/);
  const remainder = chunks.pop() || '';
  chunks.forEach((block) => {
    const lines = block.split('\n');
    let eventName = 'message';
    const dataLines = [];
    lines.forEach((line) => {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message';
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    });
    if (dataLines.length) {
      events.push({ event: eventName, data: dataLines.join('\n') });
    }
  });
  return { events, remainder };
}

function applySseFrame(frame, requestId, onSseTextChunk, state) {
  if (!frame.data) {
    return state;
  }
  let payload;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    if (onSseTextChunk) {
      onSseTextChunk(frame.data);
    }
    return state;
  }
  if (payload.error) {
    const message =
      payload.error.message ||
      payload.error.data ||
      JSON.stringify(payload.error);
    throw new Error(String(message));
  }
  const next = { ...state };
  if (requestId != null && payload.id === requestId && payload.result) {
    next.result = payload.result;
  }
  const chunkText = extractTextFromToolContent(payload.result?.content);
  if (chunkText && onSseTextChunk) {
    onSseTextChunk(chunkText);
  }
  return next;
}

async function consumeSseReader(reader, decoder, requestId, onSseTextChunk) {
  let buffer = '';
  let streamState = { result: null };

  const pump = async () => {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.remainder;
    parsed.events.forEach((frame) => {
      streamState = applySseFrame(
        frame,
        requestId,
        onSseTextChunk,
        streamState
      );
    });
    await pump();
  };

  await pump();

  if (buffer.trim()) {
    const parsed = parseSseBuffer(`${buffer}\n\n`);
    parsed.events.forEach((frame) => {
      try {
        streamState = applySseFrame(
          frame,
          requestId,
          onSseTextChunk,
          streamState
        );
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('{')) {
          throw err;
        }
      }
    });
  }

  return streamState.result;
}

async function readJsonRpcResponse(
  response,
  requestId,
  { onSseTextChunk } = {}
) {
  const contentType = String(response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      bodyText.trim() ||
        `MCP request failed (HTTP ${response.status} ${response.statusText})`
    );
  }

  if (contentType === 'application/json') {
    const payload = await response.json();
    return parseJsonRpcEnvelope(payload);
  }

  if (contentType === 'text/event-stream') {
    if (!response.body) {
      throw new Error('MCP SSE response has no body');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const result = await consumeSseReader(
      reader,
      decoder,
      requestId,
      onSseTextChunk
    );
    if (!result) {
      throw new Error('MCP SSE stream ended without a JSON-RPC result');
    }
    return result;
  }

  const fallback = await response.json();
  return parseJsonRpcEnvelope(fallback);
}

export function nlPromptToBuildCohortArgs(promptText) {
  const text = String(promptText || '').trim();
  let pageSize = 20;
  const leadingCount = text.match(/^(\d+)\b/);
  if (leadingCount) {
    const parsed = parseInt(leadingCount[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      pageSize = Math.min(parsed, 100);
    }
  }
  const limitMatch = text.match(/\bLIMIT\s+(\d+)\b/i);
  if (limitMatch) {
    const parsed = parseInt(limitMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      pageSize = Math.min(parsed, 100);
    }
  }

  const terms = {};
  const collectionMatch = text.match(/collection\s+([A-Za-z0-9_.-]+)/i);
  if (collectionMatch) {
    terms.collection_id = [collectionMatch[1]];
  }
  const modalityMatch = text.match(/\b(CT|MR|US|PT|NM|XA|CR|DX|MG|SM|SEG)\b/i);
  if (modalityMatch) {
    terms.Modality = [modalityMatch[1].toUpperCase()];
  }

  return { terms, page_size: pageSize, page: 0 };
}

function resolveSqlFromPayload(payload, text) {
  if (payload && typeof payload.sql === 'string') {
    return payload.sql;
  }
  if (typeof text === 'string' && isLikelySql(text)) {
    return text.trim();
  }
  return '';
}

async function initializeWithProtocol(client, protocolVersion) {
  const result = await client._postJsonRpc('initialize', {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: 'vtkCastClient-example', version: '1.0.0' },
  });
  if (!result?.protocolVersion) {
    throw new Error('MCP initialize returned no protocol version');
  }
  await client._postJsonRpc(
    'notifications/initialized',
    {},
    {
      notification: true,
    }
  );
  return result;
}

export class IdcMcpClient {
  constructor(endpoint = IDC_MCP_URL) {
    this.endpoint = endpoint;
    this.sessionId = null;
    this.initialized = false;
    this.nextId = 1;
    this.cachedTools = null;
    this.cachedQueryTool = null;
  }

  _nextRequestId() {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  async _postJsonRpc(
    method,
    params,
    { onSseTextChunk, notification = false } = {}
  ) {
    const requestId = notification ? undefined : this._nextRequestId();
    const body = notification
      ? { jsonrpc: '2.0', method, params: params || {} }
      : { jsonrpc: '2.0', id: requestId, method, params: params || {} };

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MCP_REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error(
          `MCP request timed out after ${MCP_REQUEST_TIMEOUT_MS / 1000}s`
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const sessionHeader = response.headers.get('Mcp-Session-Id');
    if (sessionHeader) {
      this.sessionId = sessionHeader;
    }

    if (notification) {
      if (!response.ok && response.status !== 202) {
        const text = await response.text();
        throw new Error(
          text.trim() || `MCP notification failed (${response.status})`
        );
      }
      return null;
    }

    if (response.status === 404) {
      const bodyText = await response.text();
      const isProxyMiss =
        /Cannot POST \/idc-mcp-proxy/i.test(bodyText) ||
        bodyText.includes('<!DOCTYPE html>');
      this.resetSession();
      if (isProxyMiss) {
        throw new Error(
          'IDC MCP dev proxy is not reachable at /idc-mcp-proxy/mcp — restart yarn run example CastClient'
        );
      }
      throw new Error(bodyText.trim() || 'MCP session not found (HTTP 404)');
    }

    return readJsonRpcResponse(response, requestId, { onSseTextChunk });
  }

  resetSession() {
    this.sessionId = null;
    this.initialized = false;
    this.cachedTools = null;
    this.cachedQueryTool = null;
  }

  async initialize() {
    if (this.initialized) {
      return null;
    }
    let lastError = null;
    const attempt = async (index) => {
      if (index >= MCP_PROTOCOL_VERSIONS.length) {
        throw lastError || new Error('MCP initialize failed');
      }
      try {
        const result = await initializeWithProtocol(
          this,
          MCP_PROTOCOL_VERSIONS[index]
        );
        this.initialized = true;
        return result;
      } catch (err) {
        lastError = err;
        return attempt(index + 1);
      }
    };
    return attempt(0);
  }

  async listTools() {
    if (this.cachedTools) {
      return this.cachedTools;
    }
    await this.initialize();
    const result = await this._postJsonRpc('tools/list', {});
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    this.cachedTools = tools;
    return tools;
  }

  async callTool(name, args, options = {}) {
    await this.initialize();
    const result = await this._postJsonRpc(
      'tools/call',
      { name, arguments: args || {} },
      options
    );
    const text = extractTextFromToolContent(result?.content);
    let structured = null;
    if (text) {
      try {
        structured = JSON.parse(text);
      } catch {
        structured = null;
      }
    }
    return { result, text, structured, isError: Boolean(result?.isError) };
  }

  resolveQueryTool(tools) {
    if (this.cachedQueryTool) {
      return this.cachedQueryTool;
    }
    const list = Array.isArray(tools) ? tools : [];
    const scored = [];

    list.forEach((tool) => {
      const schema = tool?.inputSchema || {};
      const properties = schema.properties || {};
      const propNames = Object.keys(properties);
      const promptArg = propNames.find((name) =>
        NL_PROMPT_ARG_NAMES.includes(name.toLowerCase())
      );
      if (!promptArg) {
        return;
      }
      const name = String(tool.name || '');
      const description = String(tool.description || '');
      const haystack = `${name} ${description}`.toLowerCase();
      const hintScore = IDC_QUERY_TOOL_HINTS.some((hint) =>
        haystack.includes(hint)
      )
        ? 1
        : 0;
      scored.push({ tool, promptArg, score: hintScore + 2 });
    });

    scored.sort((a, b) => b.score - a.score);
    if (scored.length) {
      this.cachedQueryTool = {
        name: scored[0].tool.name,
        promptArg: scored[0].promptArg,
        mode: 'nl-tool',
      };
      return this.cachedQueryTool;
    }

    const runSql = list.find((tool) => tool.name === 'run_sql');
    if (runSql) {
      this.cachedQueryTool = {
        name: 'run_sql',
        promptArg: 'sql',
        mode: 'sql',
      };
      return this.cachedQueryTool;
    }

    const buildCohort = list.find((tool) => tool.name === 'build_cohort');
    if (buildCohort) {
      this.cachedQueryTool = {
        name: 'build_cohort',
        promptArg: null,
        mode: 'build_cohort',
      };
      return this.cachedQueryTool;
    }

    return null;
  }

  async queryIdc(promptText, options = {}) {
    const userText = String(promptText || '').trim();
    if (!userText) {
      throw new Error('IDC MCP query text is empty');
    }

    const runOnce = async () => {
      const onSseTextChunk = options.onSseTextChunk;
      const maxRows = options.maxRows || 100;
      const tools = await this.listTools();
      const resolved = this.resolveQueryTool(tools);
      if (!resolved) {
        throw new Error('IDC MCP server exposes no compatible query tools');
      }

      let toolName = resolved.name;
      let toolArgs;
      let queryMode = resolved.mode;
      let statusNote = '';

      if (resolved.mode === 'nl-tool') {
        toolArgs = { [resolved.promptArg]: userText };
      } else if (resolved.mode === 'sql' && isLikelySql(userText)) {
        toolArgs = { sql: userText, max_rows: maxRows };
      } else if (resolved.mode === 'sql' || resolved.mode === 'build_cohort') {
        if (isLikelySql(userText)) {
          toolName = 'run_sql';
          toolArgs = { sql: userText, max_rows: maxRows };
          queryMode = 'sql';
        } else {
          toolName = 'build_cohort';
          toolArgs = nlPromptToBuildCohortArgs(userText);
          queryMode = 'build_cohort';
          statusNote =
            'No natural-language MCP tool found; mapped query to build_cohort filters.';
        }
      } else {
        throw new Error('IDC MCP query tool could not be resolved');
      }

      const { text, structured, isError } = await this.callTool(
        toolName,
        toolArgs,
        { onSseTextChunk }
      );
      if (isError) {
        throw new Error(text || `IDC MCP tool ${toolName} failed`);
      }

      return {
        text,
        structured,
        toolName,
        toolArgs,
        queryMode,
        statusNote,
        promptText: userText,
      };
    };

    try {
      return await runOnce();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const canRetry =
        !options._sessionRetried &&
        msg.includes('HTTP 404') &&
        !msg.includes('dev proxy is not reachable');
      if (!canRetry) {
        throw err;
      }
      this.resetSession();
      return this.queryIdc(promptText, {
        ...options,
        _sessionRetried: true,
      });
    }
  }
}

export function parseIdcMcpToolResult(text, structured) {
  let payload = structured;
  if (!payload && text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  const citation =
    payload && typeof payload.citation === 'string' ? payload.citation : '';
  const sql = resolveSqlFromPayload(payload, text);

  if (payload && Array.isArray(payload.series) && payload.series.length) {
    return {
      studies: payload.series,
      sql,
      citation,
      raw: payload,
      source: 'build_cohort',
    };
  }

  if (payload && Array.isArray(payload.studies) && payload.studies.length) {
    return {
      studies: payload.studies,
      sql,
      citation,
      raw: payload,
      source: 'studies',
    };
  }

  if (
    payload &&
    Array.isArray(payload.rows) &&
    Array.isArray(payload.columns)
  ) {
    const columns = payload.columns.map((col) =>
      typeof col === 'string' ? col : String(col?.name || '')
    );
    const studies = payload.rows.map((row, index) => {
      const record = {};
      if (Array.isArray(row)) {
        columns.forEach((col, colIndex) => {
          record[col] = row[colIndex];
        });
      } else if (row && typeof row === 'object') {
        Object.assign(record, row);
      }
      return { ...record, __rowIndex: index + 1 };
    });
    return {
      studies,
      sql: sql || (payload.query && String(payload.query)) || '',
      citation,
      raw: payload,
      source: 'run_sql',
    };
  }

  if (typeof text === 'string' && text.trim()) {
    return { studies: [], sql, citation, raw: payload, source: 'text', text };
  }

  return { studies: [], sql, citation, raw: payload, source: 'empty' };
}

export function mcpSeriesToWorklistStudy(series, orgId, index) {
  const row = series || {};
  const studyUid = String(
    row.StudyInstanceUID || row.studyInstanceUID || ''
  ).trim();
  const seriesUid = String(
    row.SeriesInstanceUID || row.seriesInstanceUID || ''
  ).trim();
  const patientId = String(row.PatientID || row.patientId || '').trim();
  const descriptionRaw = String(
    row.SeriesDescription || row.description || ''
  ).trim();
  const collection = String(row.collection_id || row.collectionId || '').trim();
  const sliceCount = Number(row.instanceCount || row.instance_count || 0);
  const sizeMb = Number(row.series_size_MB || row.series_size_mb || 0);
  const labelParts = [collection, patientId, descriptionRaw].filter(Boolean);
  const description =
    labelParts.join(' — ') || descriptionRaw || `IDC study ${index}`;
  const studyId = `${orgId}-${String(index).padStart(2, '0')}`;
  const sizeLabel =
    sizeMb > 0 ? `${sizeMb.toFixed(1)} MB` : `${sliceCount || '?'} DICOM`;
  const bucketRaw = String(row.aws_bucket || 'aws');

  return {
    id: studyId,
    name: `IDC ${index}`,
    description,
    size: sizeLabel,
    format: 'DICOM',
    studyInstanceUID: studyUid,
    seriesInstanceUID: seriesUid,
    sourceBucket: bucketRaw.includes('gcs') ? 'gcs' : 'aws',
    instanceCount: sliceCount || undefined,
    organization: orgId,
    seriesAwsUrl: row.series_aws_url || row.seriesAwsUrl || '',
    crdcSeriesUuid: row.crdc_series_uuid || row.crdcSeriesUuid || '',
  };
}

export function idcMcpOrganizationId(prompt) {
  const seed = `${prompt || ''}:${Date.now()}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(33, hash) + seed.charCodeAt(i);
    hash %= 0x100000000;
  }
  const digest = Math.abs(hash).toString(16).padStart(8, '0');
  const stamp = Date.now().toString(36).slice(-4);
  return `idc-custom-${digest.slice(0, 6)}${stamp}`;
}

function hubOriginFromEndpoint(hubEndpoint) {
  const trimmed = String(hubEndpoint || '').trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

async function readHubIdcSeriesFilesError(response) {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    if (body?.detail) {
      detail =
        typeof body.detail === 'string'
          ? body.detail
          : JSON.stringify(body.detail);
    } else if (body?.error) {
      detail = String(body.error);
    }
  } catch {
    // ignore JSON parse errors
  }
  return detail;
}

export async function fetchHubIdcSeriesFiles(hubEndpoint, organization, study) {
  const origin = hubOriginFromEndpoint(hubEndpoint);
  if (!origin) {
    throw new Error('Cast hub endpoint is not configured.');
  }
  const response = await fetch(`${origin}/api/hub/idc/series-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization: String(organization || '').trim(),
      study,
      sourceBucket: study?.sourceBucket,
    }),
  });
  if (!response.ok) {
    const detail = await readHubIdcSeriesFilesError(response);
    if (response.status === 503) {
      throw new Error(`Hub idc-index is not available: ${detail}`);
    }
    throw new Error(detail);
  }
  return response.json();
}
