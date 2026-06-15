import { httpUrlFromHubEndpoint } from './hubLinks';

export const CAST_CONFERENCE_POLL_MS = 30_000;

export const CAST_CONFERENCE_EXIT_ACK_MS = 1200;

export const CAST_CONFERENCE_TITLE_PRESETS = [
  'Test conference',
  'US annotations',
  'Tumor Board',
  'Case discussion',
  'Pedicle screw',
];

function conferenceApiUrl(hubEndpoint, path) {
  const url = httpUrlFromHubEndpoint(hubEndpoint);
  if (!url) {
    return null;
  }
  return new URL(path, url.origin).href;
}

export function normalizeConferenceParticipants(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set();
  return raw
    .map((entry) => String(entry ?? '').trim())
    .filter((name) => {
      if (!name || seen.has(name)) {
        return false;
      }
      seen.add(name);
      return true;
    });
}

export function conferenceHostTopic(conference) {
  return String(conference?.hostTopic ?? conference?.user ?? '').trim();
}

export function isCastConferenceHost(topic, conference) {
  const host = conferenceHostTopic(conference);
  const normalizedTopic = String(topic ?? '').trim();
  if (!normalizedTopic || !host) {
    return false;
  }
  return (
    normalizedTopic === host ||
    normalizedTopic.toLowerCase() === host.toLowerCase()
  );
}

export function isCastConferenceParticipant(topic, subscriberName, conference) {
  const normalizedTopic = String(topic ?? '').trim();
  const normalizedSubscriber = String(subscriberName ?? '').trim();
  const host = conferenceHostTopic(conference);
  const attendeeTopics = Array.isArray(conference?.topics)
    ? conference.topics.map((value) => String(value).trim()).filter(Boolean)
    : [];

  if (normalizedTopic) {
    if (normalizedTopic === host) {
      return true;
    }
    if (attendeeTopics.includes(normalizedTopic)) {
      return true;
    }
  }
  if (normalizedSubscriber && normalizedSubscriber === host) {
    return true;
  }
  return false;
}

export function findActiveCastConference(topic, subscriberName, conferences) {
  return (
    conferences.find((conference) =>
      isCastConferenceParticipant(topic, subscriberName, conference)
    ) || null
  );
}

export async function fetchCastConferenceTopics(hubEndpoint) {
  const apiUrl = conferenceApiUrl(hubEndpoint, '/api/hub/conference-topics');
  if (!apiUrl) {
    return [];
  }
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }
    return data
      .map((entry) => String(entry).trim())
      .filter((topic) => topic && topic !== '*');
  } catch {
    return [];
  }
}

export async function fetchCastConferences(hubEndpoint) {
  const url = httpUrlFromHubEndpoint(hubEndpoint);
  if (!url) {
    return [];
  }
  const apiUrl = new URL('/api/hub/conference', url.origin).href;
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function createCastConference(
  hubEndpoint,
  hostTopic,
  title,
  topics
) {
  const apiUrl = conferenceApiUrl(hubEndpoint, '/api/hub/conference');
  if (!apiUrl) {
    throw new Error('Invalid hub endpoint');
  }
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostTopic: String(hostTopic).trim(),
      title: String(title).trim(),
      topics,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `HTTP ${response.status}`);
  }
}

export async function deleteCastConference(hubEndpoint, hostTopic, leaveTopic) {
  const apiUrl = conferenceApiUrl(hubEndpoint, '/api/hub/conference');
  if (!apiUrl) {
    throw new Error('Invalid hub endpoint');
  }
  const body = { hostTopic: String(hostTopic).trim() };
  const leave = leaveTopic?.trim();
  if (leave) {
    body.leaveTopic = leave;
  }
  const response = await fetch(apiUrl, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `HTTP ${response.status}`);
  }
}

export async function resolveCastConferenceState(
  hubEndpoint,
  topic,
  subscriberName
) {
  const conferences = await fetchCastConferences(hubEndpoint);
  const match = findActiveCastConference(topic, subscriberName, conferences);
  return {
    active: Boolean(match),
    title: String(match?.title ?? '').trim(),
    participants: normalizeConferenceParticipants(match?.participants),
  };
}
