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
    // Enable ServiceWorker domain so getServiceWorkerVersions() can report the
    // SW running status in diagnostics (helps explain CI-only failures).
    await session.enableServiceWorker();
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

    // Drive the SW directly: post it a message so it issues its own
    // fetch('/api/data'). This avoids depending on the SW controlling the page
    // and intercepting a fetch — that path is racy in headless CI (the page
    // fetch bypasses the SW and 404s). A message reaches the active SW
    // regardless of control, and its outgoing fetch must land on the SW target.
    session.networkState.clear();
    await session.evaluate(
      "navigator.serviceWorker.getRegistration().then((reg) => { if (reg && reg.active) reg.active.postMessage('fetch-now'); })",
      { awaitPromise: true }
    );

    const found = await waitFor(() => {
      const fromSw = session.networkState
        .getAllRequests()
        .filter((r) => r.targetId === swSession!.targetId && r.url.includes('/api/data'));
      return fromSw.length > 0 ? fromSw : null;
    }, 15000).catch(() => null);

    if (!found) {
      const diag = {
        lookingForSwTargetId: swSession!.targetId,
        pageTargetId: session.getCurrentTargetId(),
        attachedNow: session.getAttachedSessions().map((s) => ({ type: s.type, targetId: s.targetId, url: s.url })),
        swVersions: session.getServiceWorkerVersions().map((v) => ({ versionId: v.versionId, status: v.status, runningStatus: v.runningStatus, targetId: v.targetId })),
        capturedRequests: session.networkState.getAllRequests().map((r) => ({ url: r.url, method: r.method, status: r.status, targetId: r.targetId })),
      };
      throw new Error('SW outgoing fetch not captured.\nDIAGNOSTICS:\n' + JSON.stringify(diag, null, 2));
    }

    // The SW's fetch must be attributed to the SW target, not the page — this
    // is the multi-session per-target tagging the feature provides.
    const requests = session.networkState.getAllRequests();
    const swRequests = requests.filter((r) => r.targetId === swSession!.targetId);
    expect(swRequests.some((r) => r.url.includes('/api/data')), 'SW outgoing fetch captured on the SW target').toBe(true);

    const pageHasApiData = requests
      .filter((r) => r.targetId === session.getCurrentTargetId())
      .some((r) => r.url.includes('/api/data'));
    expect(pageHasApiData, '/api/data must be attributed to the SW target, not the page').toBe(false);
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
