/** Wildcard destination on publish envelope fields. */
export const CAST_ENVELOPE_ANY = '*';

/** Default ``subscriber.actor`` for image-display clients (VolView, OHIF). */
export const CAST_DEFAULT_SUBSCRIBER_ACTOR = 'ID';

export const DEFAULT_CAST_PUBLISH_ENVELOPE_FIELDS = {
  subscriberName: CAST_ENVELOPE_ANY,
  subscriberActor: CAST_DEFAULT_SUBSCRIBER_ACTOR,
  targetActor: CAST_ENVELOPE_ANY,
  targetProductName: CAST_ENVELOPE_ANY,
};

export function normalizeOptionalEnvelopeField(value) {
  const text = String(value ?? '').trim();
  return text || CAST_ENVELOPE_ANY;
}

export function resolveCastPublishEnvelopeFields(fields, defaults) {
  const name = (fields.subscriberName ?? '').trim();
  return {
    subscriberName: name || defaults.subscriberName || CAST_ENVELOPE_ANY,
    subscriberActor:
      (fields.subscriberActor ?? '').trim() || CAST_DEFAULT_SUBSCRIBER_ACTOR,
    targetActor: normalizeOptionalEnvelopeField(fields.targetActor),
    targetProductName: normalizeOptionalEnvelopeField(fields.targetProductName),
  };
}

export function applyCastPublishEnvelopeFields(message, fields) {
  message['subscriber.name'] =
    fields.subscriberName.trim() || CAST_ENVELOPE_ANY;
  message['subscriber.actor'] =
    fields.subscriberActor.trim() || CAST_DEFAULT_SUBSCRIBER_ACTOR;
  message['target.actor'] = normalizeOptionalEnvelopeField(fields.targetActor);
  message['target.product.name'] = normalizeOptionalEnvelopeField(
    fields.targetProductName
  );
}
