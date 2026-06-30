import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { DebugSession } from '../../src/DebugSession.js';
import { findChrome } from '../../src/chrome-launcher.js';
import { createTestServer, type TestServer } from '../fixtures/test-server.js';
import { getWebSocketFrames } from '../../src/tools/network.js';

const CHROME_AVAILABLE = findChrome() !== null;

// ws://127.0.0.1:<port>/ws, derived from the http test-server URL.
const wsUrl = (httpUrl: string) => httpUrl.replace(/^http/, 'ws') + '/ws';

describe.skipIf(!CHROME_AVAILABLE)('WebSocket Integration', () => {
  let session: DebugSession;
  let testServer: TestServer;

  beforeAll(async () => {
    testServer = await createTestServer();
  });

  afterAll(async () => {
    await testServer.close();
  });

  beforeEach(async () => {
    session = new DebugSession({ timeout: 30000 });
    await session.launch({ headless: true, port: 0 });
    await session.enableNetwork();
    await session.enableRuntime();
    await session.navigate(testServer.url + '/network-test.html');
    await new Promise((r) => setTimeout(r, 300));
    session.networkState.clear();
  });

  afterEach(async () => {
    await session.kill();
  });

  // Open a WS, send one text frame, resolve once the echo comes back.
  const roundTrip = async (message: string) => {
    await session.evaluate(
      `new Promise((resolve, reject) => {
        const ws = new WebSocket(${JSON.stringify(wsUrl(testServer.url))});
        ws.onopen = () => ws.send(${JSON.stringify(message)});
        ws.onmessage = (e) => resolve(e.data);
        ws.onerror = () => reject(new Error('ws error'));
      })`,
      { awaitPromise: true, returnByValue: true }
    );
    await new Promise((r) => setTimeout(r, 300));
  };

  it('captures the WebSocket connection as a request', async () => {
    await roundTrip('ping');

    const ws = session.networkState.getAllRequests().find((r) => r.isWebSocket);
    expect(ws).toBeDefined();
    expect(ws?.resourceType).toBe('WebSocket');
    expect(ws?.url).toContain('/ws');
    expect(ws?.wsState).toBe('open');
    // Handshake completed → 101 Switching Protocols.
    expect(ws?.status).toBe(101);
  });

  it('captures sent and received frames', async () => {
    await roundTrip('ping');

    const ws = session.networkState.getAllRequests().find((r) => r.isWebSocket);
    const frames = ws?.frames ?? [];
    const sent = frames.find((f) => f.direction === 'sent');
    const received = frames.find((f) => f.direction === 'received');

    expect(sent?.payload).toBe('ping');
    expect(received?.payload).toBe('echo:ping');
  });

  it('exposes frames through the get_websocket_frames tool', async () => {
    await roundTrip('hello');

    const ws = session.networkState.getAllRequests().find((r) => r.isWebSocket);
    expect(ws).toBeDefined();

    const result = await getWebSocketFrames.handler(session, { requestId: ws!.requestId });
    const text = result.content[0].text;
    expect(text).toContain('"state": "open"');
    expect(text).toContain('echo:hello');
    expect(text).toContain('"direction": "received"');

    // direction filter narrows the result set.
    const sentOnly = await getWebSocketFrames.handler(session, {
      requestId: ws!.requestId,
      direction: 'sent',
    });
    expect(sentOnly.content[0].text).toContain('hello');
    expect(sentOnly.content[0].text).not.toContain('echo:hello');
  });

  it('rejects a non-WebSocket requestId', async () => {
    await session.evaluate('fetch("/api/data")');
    await new Promise((r) => setTimeout(r, 300));

    const httpReq = session.networkState.getAllRequests().find((r) => !r.isWebSocket);
    expect(httpReq).toBeDefined();

    const result = await getWebSocketFrames.handler(session, { requestId: httpReq!.requestId });
    expect(result.content[0].text).toContain('not a WebSocket');
  });
});
