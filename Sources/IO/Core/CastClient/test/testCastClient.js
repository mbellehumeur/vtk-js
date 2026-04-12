import test from 'tape';

import vtkCastClient from 'vtk.js/Sources/IO/Core/CastClient';

function MockWebSocket(url) {
  this.url = url;
  this.binaryType = '';
  this.readyState = MockWebSocket.OPEN;
  this.sent = [];
  this.listeners = { message: [], close: [] };
}

MockWebSocket.prototype.send = function send(message) {
  this.sent.push(message);
};

MockWebSocket.prototype.close = function close() {
  this.readyState = MockWebSocket.CLOSED;
  this.listeners.close.forEach((cb) => cb());
};

MockWebSocket.prototype.addEventListener = function addEventListener(type, cb) {
  this.listeners[type].push(cb);
};

MockWebSocket.prototype.emitMessage = function emitMessage(data) {
  this.listeners.message.forEach((cb) => cb({ data }));
};

MockWebSocket.prototype.emitClose = function emitClose() {
  this.listeners.close.forEach((cb) => cb());
};

MockWebSocket.prototype.emitOpen = function emitOpen() {
  if (typeof this.onopen === 'function') {
    this.onopen();
  }
};

MockWebSocket.prototype.emitError = function emitError() {
  if (typeof this.onerror === 'function') {
    this.onerror();
  }
};

MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;

function makeWebSocketCtor(websockets) {
  function TrackedWebSocket(url) {
    MockWebSocket.call(this, url);
    websockets.push(this);
  }
  TrackedWebSocket.OPEN = MockWebSocket.OPEN;
  TrackedWebSocket.CLOSED = MockWebSocket.CLOSED;
  TrackedWebSocket.prototype = Object.create(MockWebSocket.prototype);
  TrackedWebSocket.prototype.constructor = TrackedWebSocket;
  return TrackedWebSocket;
}

function withGlobals(t, setup, run) {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const originalAbortSignal = globalThis.AbortSignal;
  const originalWindow = globalThis.window;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  const ctx = setup();

  return Promise.resolve(run(ctx)).finally(() => {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
    globalThis.AbortSignal = originalAbortSignal;
    globalThis.window = originalWindow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    t.end();
  });
}

test('vtkCastClient token + subscribe + publish flow', (t) =>
  withGlobals(
    t,
    () => {
      const fetchCalls = [];
      const websockets = [];
      globalThis.window = { location: { origin: 'https://viewer.local' } };
      globalThis.AbortSignal = { timeout: () => undefined };
      globalThis.WebSocket = makeWebSocketCtor(websockets);
      globalThis.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        if (url.includes('/token')) {
          return {
            status: 200,
            json: async () => ({
              access_token: 'token-123',
              subscriber_name: 'client-A',
              topic: 'topic-A',
            }),
          };
        }
        if (
          options.headers['Content-Type'] ===
          'application/x-www-form-urlencoded'
        ) {
          return {
            status: 202,
            json: async () => ({
              'hub.channel.endpoint': 'ws://hub.local/ws',
            }),
          };
        }
        return { status: 200, json: async () => ({ ok: true }) };
      };
      return { fetchCalls, websockets };
    },
    async ({ fetchCalls, websockets }) => {
      const client = vtkCastClient.newInstance({
        hub: {
          hub_endpoint: 'https://hub.local/api/hub',
          token_endpoint: 'https://hub.local/token',
          client_id: 'cid',
          client_secret: 'secret',
        },
        session: {
          events: ['*'],
          topic: 'topic-original',
        },
      });

      const ok = await client.getToken();
      t.equal(ok, true, 'token acquired');
      t.equal(client.getConnectionState().token, 'token-123', 'stored token');
      t.equal(
        client.getSessionConfig().topic,
        'topic-A',
        'topic updated from token'
      );

      const subscribeStatus = await client.subscribe();
      t.equal(subscribeStatus, 202, 'subscribe accepted');
      t.equal(websockets.length, 1, 'websocket created');

      const response = await client.publish({
        event: { 'hub.event': 'custom', context: [] },
      });
      t.equal(response.status, 200, 'publish returns response');
      t.ok(
        client.getConnectionState().lastPublishedMessageID,
        'message id tracked'
      );
      t.equal(fetchCalls.length, 3, 'token + subscribe + publish fetch calls');
    }
  ));

test('vtkCastClient handles get-request and dicom binary frame', (t) =>
  withGlobals(
    t,
    () => {
      const websockets = [];
      globalThis.window = { location: { origin: 'https://viewer.local' } };
      globalThis.AbortSignal = { timeout: () => undefined };
      globalThis.WebSocket = makeWebSocketCtor(websockets);
      globalThis.fetch = async (url, options) => {
        if (url.includes('/token')) {
          return {
            status: 200,
            json: async () => ({ access_token: 'token-xyz' }),
          };
        }
        return {
          status: 202,
          json: async () => ({ 'hub.channel.endpoint': 'ws://hub.local/ws' }),
        };
      };
      return { websockets };
    },
    async ({ websockets }) => {
      const client = vtkCastClient.newInstance({
        hub: {
          hub_endpoint: 'https://hub.local/api/hub',
          token_endpoint: 'https://hub.local/token',
        },
        session: {
          events: ['*'],
          topic: 'topic-1',
        },
      });

      await client.getToken();
      await client.subscribe();
      const ws = websockets[0];

      await client.publish({
        event: {
          'hub.event': 'imagingstudy-open',
          context: [{ id: 'study-1' }],
        },
      });

      ws.emitMessage(
        JSON.stringify({
          id: 'remote-1',
          event: {
            'hub.event': 'get-request',
            'hub.topic': 'topic-1',
            context: { requestId: 'req-1', dataType: 'FHIRcastContext' },
          },
        })
      );
      t.ok(
        ws.sent.some((entry) => entry.includes('"hub.event":"get-response"')),
        'get-response sent over websocket'
      );

      let received = null;
      client.onMessage((msg) => {
        received = msg;
      });
      ws.emitMessage(
        JSON.stringify({
          id: 'remote-2',
          event: {
            'hub.event': 'dicom-send',
            'hub.topic': 'topic-1',
            context: [{ resource: { binaryTransfer: true } }],
          },
        })
      );
      ws.emitMessage(new ArrayBuffer(8));
      t.ok(received, 'dicom message delivered after binary frame');
      t.ok(
        received.event.context[0].resource.data instanceof ArrayBuffer,
        'binary data attached to resource'
      );
    }
  ));

test('vtkCastClient resubscribe check and destroy cleanup', (t) =>
  withGlobals(
    t,
    () => {
      const intervals = [];
      const clears = [];
      const fetchCalls = [];
      const websockets = [];
      globalThis.window = { location: { origin: 'https://viewer.local' } };
      globalThis.AbortSignal = { timeout: () => undefined };
      globalThis.setInterval = (cb) => {
        intervals.push(cb);
        return intervals.length;
      };
      globalThis.clearInterval = (id) => {
        clears.push(id);
      };
      globalThis.WebSocket = makeWebSocketCtor(websockets);
      globalThis.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        if (url.includes('/token')) {
          return {
            status: 200,
            json: async () => ({ access_token: 'token-reconnect' }),
          };
        }
        return {
          status: 202,
          json: async () => ({ 'hub.channel.endpoint': 'ws://hub.local/ws' }),
        };
      };
      return { intervals, clears, fetchCalls, websockets };
    },
    async ({ intervals, clears, fetchCalls, websockets }) => {
      const client = vtkCastClient.newInstance({
        autoReconnect: true,
        hub: {
          hub_endpoint: 'https://hub.local/api/hub',
          token_endpoint: 'https://hub.local/token',
        },
        session: {
          events: ['*'],
          topic: 'topic-2',
        },
      });

      await client.getToken();
      await client.subscribe();
      const ws = websockets[0];
      ws.emitClose();
      t.equal(
        client.getConnectionState().resubscribeRequested,
        true,
        'close flags reconnect'
      );

      await intervals[0]();
      t.ok(fetchCalls.length >= 3, 'interval triggers resubscribe attempt');

      client.destroy();
      t.equal(clears.length, 1, 'reconnect interval cleared');
    }
  ));

test('vtkCastClient publish normalizes dicom-send binary payload', (t) =>
  withGlobals(
    t,
    () => {
      const fetchCalls = [];
      const websockets = [];
      globalThis.window = { location: { origin: 'https://viewer.local' } };
      globalThis.AbortSignal = { timeout: () => undefined };
      globalThis.WebSocket = makeWebSocketCtor(websockets);
      globalThis.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        if (url.includes('/token')) {
          return {
            status: 200,
            json: async () => ({ access_token: 'token-dicom' }),
          };
        }
        if (
          options.headers['Content-Type'] ===
          'application/x-www-form-urlencoded'
        ) {
          return {
            status: 202,
            json: async () => ({ 'hub.channel.endpoint': 'ws://hub.local/ws' }),
          };
        }
        return { status: 200, ok: true, json: async () => ({ ok: true }) };
      };
      return { fetchCalls };
    },
    async ({ fetchCalls }) => {
      const client = vtkCastClient.newInstance({
        hub: {
          hub_endpoint: 'https://hub.local/api/hub',
          token_endpoint: 'https://hub.local/token',
        },
        session: {
          events: ['*'],
          topic: 'topic-dicom',
        },
      });

      await client.getToken();
      await client.subscribe();
      const response = await client.publish({
        event: {
          'hub.event': 'dicom-send',
          context: [
            {
              key: 'dicom',
              resource: {
                data: new Uint8Array([1, 2, 3]),
              },
            },
          ],
        },
      });
      t.equal(response.status, 200, 'publish returns response');

      const publishCall = fetchCalls.find(
        (call) => call.options.headers['Content-Type'] === 'application/json'
      );
      const payload = JSON.parse(publishCall.options.body);
      const resource = payload.event.context[0].resource;
      t.equal(resource.data, 'AQID', 'binary payload converted to base64');
      t.equal(resource.binaryTransfer, true, 'binaryTransfer enabled');
      t.equal(resource.fileName, 'dicom-send.dcm', 'default fileName is set');
      t.equal(
        resource.mimeType,
        'application/dicom',
        'default mimeType is set'
      );
    }
  ));

test('vtkCastClient publish rejects dicom-send string payload', (t) =>
  withGlobals(
    t,
    () => {
      globalThis.fetch = async () => ({
        status: 200,
        ok: true,
        json: async () => ({ ok: true }),
      });
      return {};
    },
    async () => {
      const client = vtkCastClient.newInstance({
        hub: {
          hub_endpoint: 'https://hub.local/api/hub',
          token_endpoint: 'https://hub.local/token',
        },
        session: {
          events: ['*'],
          topic: 'topic-dicom',
        },
      });

      try {
        await client.publish({
          event: {
            'hub.event': 'dicom-send',
            context: [
              {
                key: 'dicom',
                resource: {
                  data: 'abc123',
                },
              },
            ],
          },
        });
        t.fail('publish should throw for string dicom-send data');
      } catch (err) {
        t.ok(
          String(err).includes('string payloads are not supported'),
          'throws strict dicom-send string payload error'
        );
      }
    }
  ));

test('vtkCastClient emits websocket connection state changes', (t) =>
  withGlobals(
    t,
    () => {
      const websockets = [];
      globalThis.window = { location: { origin: 'https://viewer.local' } };
      globalThis.AbortSignal = { timeout: () => undefined };
      globalThis.WebSocket = makeWebSocketCtor(websockets);
      globalThis.fetch = async (url) => {
        if (url.includes('/token')) {
          return {
            status: 200,
            json: async () => ({ access_token: 'token-conn' }),
          };
        }
        return {
          status: 202,
          json: async () => ({ 'hub.channel.endpoint': 'ws://hub.local/ws' }),
        };
      };
      return { websockets };
    },
    async ({ websockets }) => {
      const client = vtkCastClient.newInstance({
        hub: {
          hub_endpoint: 'https://hub.local/api/hub',
          token_endpoint: 'https://hub.local/token',
        },
        session: {
          events: ['*'],
          topic: 'topic-conn',
        },
      });

      const states = [];
      client.onConnectionStateChange((state) => {
        states.push(state);
      });

      await client.getToken();
      await client.subscribe();
      const ws = websockets[0];
      ws.emitOpen();
      ws.emitError();
      ws.emitClose();

      t.deepEqual(
        states,
        ['connecting', 'connected', 'error', 'disconnected'],
        'connection states emitted from websocket lifecycle'
      );
    }
  ));
