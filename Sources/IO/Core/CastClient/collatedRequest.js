/**
 * Normalize collated ``POST /api/hub/request`` response shape.
 *
 * @param {unknown} data
 * @returns {{
 *   responses: Array<Record<string, unknown>>,
 *   expected: string[],
 *   missing: string[],
 *   timedOut: boolean,
 *   ok: boolean,
 *   id: string | null,
 *   actor: string | null,
 *   productName: string | null,
 * }}
 */
export function parseCollatedRequestResult(data) {
  const empty = {
    responses: [],
    expected: [],
    missing: [],
    timedOut: false,
    ok: false,
    id: null,
    actor: null,
    productName: null,
  };
  if (!data || typeof data !== 'object') {
    return empty;
  }
  const envelope = /** @type {Record<string, unknown>} */ (data);
  const responses = Array.isArray(envelope.responses)
    ? envelope.responses.filter((item) => item && typeof item === 'object')
    : [];
  const expected = Array.isArray(envelope.expected)
    ? envelope.expected.map((name) => String(name))
    : [];
  const missing = Array.isArray(envelope.missing)
    ? envelope.missing.map((name) => String(name))
    : [];
  return {
    responses,
    expected,
    missing,
    timedOut: Boolean(envelope.timedOut),
    ok: Boolean(envelope.ok),
    id: envelope.id != null ? String(envelope.id) : null,
    actor: envelope.actor != null ? String(envelope.actor) : null,
    productName:
      envelope.productName != null ? String(envelope.productName) : null,
  };
}

/**
 * @param {unknown} data
 * @returns {Array<Record<string, unknown>>}
 */
export function collatedResponsesFromRequestResult(data) {
  return parseCollatedRequestResult(data).responses;
}
