import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { DebugSession } from '../../src/DebugSession.js';
import { findChrome } from '../../src/chrome-launcher.js';
import { createTestServer, type TestServer } from '../fixtures/test-server.js';

const CHROME_AVAILABLE = findChrome() !== null;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | undefined | null | false, timeoutMs = 5000, stepMs = 100): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = fn();
    if (v) return v as T;
    await wait(stepMs);
  }
  throw new Error('waitFor: timed out');
}

describe.skipIf(!CHROME_AVAILABLE)('Worker Network Capture (multi-session)', () => {
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
  });

  afterEach(async () => {
    await session.kill();
  });

  it('auto-attaches to a service worker and captures its fetch traffic', async () => {
    await session.navigate(testServer.url + '/sw-page.html');

    // Wait for the SW to register and become active. The page sets
    // status=sw-ready once controllerchange fires. Timeouts are generous because
    // the SW lifecycle is markedly slower on CI runners than locally.
    await session.enableRuntime();
    await waitFor(async () => {
      const r = await session.evaluate("document.getElementById('status')?.textContent === 'sw-ready'", { returnByValue: true });
      return (r.result as { value?: boolean }).value === true;
    }, 15000);

    // Give the SW some time to be discovered + attached. setDiscoverTargets is
    // racy with the SW lifecycle.
    await waitFor(() => session.getAttachedSessions().some((s) => s.type === 'service_worker'), 10000).catch(() => undefined);

    const browserTargets = await session.listTargets();
    const attached = session.getAttachedSessions();
    const swSession = attached.find((s) => s.type === 'service_worker');
    expect(swSession,
      `expected a service_worker session.\nattached types: ${JSON.stringify(attached.map((s) => s.type))}\nbrowser targets: ${JSON.stringify(browserTargets.map((t) => ({ type: t.type, url: t.url, attached: t.attached })))}`
    ).toBeDefined();

    // Trigger a request through the SW. The SW intercepts /api/sw-data and
    // issues its own fetch('/api/data'). The page request should appear on the
    // page target; the SW's outgoing fetch on the SW target.
    session.networkState.clear();
    await session.evaluate("fetch('/api/sw-data').then(r => r.text())", { awaitPromise: true });

    // Give the SW a moment to issue its outgoing fetch and the Network events
    // to land. Generous timeout: on CI the SW's Network domain can take a while
    // to start reporting after attach.
    await waitFor(() => {
      const requests = session.networkState.getAllRequests();
      const fromSw = requests.filter((r) => r.targetId === swSession!.targetId);
      return fromSw.length > 0 ? fromSw : null;
    }, 15000);

    const requests = session.networkState.getAllRequests();
    const pageRequests = requests.filter((r) => r.targetId === session.getCurrentTargetId());
    const swRequests = requests.filter((r) => r.targetId === swSession!.targetId);

    expect(pageRequests.length, 'page should have its own captured requests').toBeGreaterThan(0);
    expect(swRequests.length, 'service worker should have its own captured requests').toBeGreaterThan(0);

    // Sanity: the page made the /api/sw-data request, the SW made the
    // downstream /api/data request.
    expect(pageRequests.some((r) => r.url.includes('/api/sw-data'))).toBe(true);
    expect(swRequests.some((r) => r.url.includes('/api/data'))).toBe(true);
  });

  it('list_attached_sessions exposes the worker target', async () => {
    await session.navigate(testServer.url + '/sw-page.html');
    await session.enableRuntime();
    await waitFor(async () => {
      const r = await session.evaluate("document.getElementById('status')?.textContent === 'sw-ready'", { returnByValue: true });
      return (r.result as { value?: boolean }).value === true;
    }, 15000);
    await waitFor(() => session.getAttachedSessions().some((s) => s.type === 'service_worker'), 10000);

    const sessions = session.getAttachedSessions();
    expect(sessions.some((s) => s.type === 'service_worker')).toBe(true);
    expect(sessions.some((s) => s.sessionId === null)).toBe(true); // root
  });
});
