/**
 * Minimal Cast hub client demo: authenticate, subscribe, publish, request.
 *
 * Run: npm run example -- helloCast
 */
import vtkCastClient, {
  generateSubscriberName,
  parseCollatedRequestResult,
  requestEventFor,
} from 'vtk.js/Sources/IO/Core/CastClient';

const HUB_ENDPOINT =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('hub')
    ? new URLSearchParams(window.location.search).get('hub')
    : 'http://127.0.0.1:2018/api/hub';

const hubOrigin = HUB_ENDPOINT.replace(/\/api\/hub\/?$/, '');

const client = vtkCastClient.newInstance({
  hub: {
    name: 'local',
    hub_endpoint: HUB_ENDPOINT,
    authorization_endpoint: `${hubOrigin}/oauth/authorize`,
    token_endpoint: `${hubOrigin}/oauth/token`,
    client_id: 'cast-client',
    client_secret: 'cast-secret',
  },
  session: {
    subscriberName: generateSubscriberName('HELLO'),
    productName: 'HELLO',
    events: ['*'],
    lease: 7200,
    topic:
      new URLSearchParams(window.location.search).get('topic') || 'hello-cast',
  },
  autoReconnect: true,
});

const logEl = document.createElement('pre');
logEl.style.cssText =
  'font:12px/1.4 monospace;padding:12px;white-space:pre-wrap;';
document.body.appendChild(logEl);

function log(...parts) {
  const line = parts
    .map((part) =>
      typeof part === 'string' ? part : JSON.stringify(part, null, 2)
    )
    .join(' ');
  logEl.textContent += `${line}\n`;
  console.log(...parts);
}

client.onMessage((message) => {
  log('onMessage', message);
});

client.onConnectionStateChange((state) => {
  log('connection', state);
});

async function main() {
  log('Cast hello: hub', HUB_ENDPOINT);
  const { code, user_name: userName } = await client.authenticate();
  log('authenticated', userName);
  if (!(await client.getToken(code))) {
    log('token exchange failed');
    return;
  }
  const status = await client.subscribe();
  log('subscribe status', status);
  await client.publish({
    event: {
      'hub.event': 'heartbeat',
      'hub.topic': client.getSessionConfig().topic,
      context: { note: 'hello-cast publish' },
    },
  });
  const subscriberName = client.getSessionConfig().subscriberName;
  const result = await client.request({
    'subscriber.name': subscriberName,
    event: {
      'hub.topic': client.getSessionConfig().topic,
      'hub.event': requestEventFor('STATUS'),
      context: { dataType: 'STATUS' },
    },
  });
  const collated = parseCollatedRequestResult(result.data);
  log('status request', {
    ok: result.ok,
    responses: collated.responses.length,
    missing: collated.missing,
    timedOut: collated.timedOut,
  });
}

main().catch((err) => {
  log('error', err instanceof Error ? err.message : String(err));
});
