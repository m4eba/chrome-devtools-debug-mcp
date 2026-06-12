import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { DebugSession } from '../../src/DebugSession.js';
import { findChrome } from '../../src/chrome-launcher.js';
import { createTestServer, type TestServer } from '../fixtures/test-server.js';

const CHROME_AVAILABLE = findChrome() !== null;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | undefined | null | false, timeoutMs = 10000, stepMs = 100): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = fn();
    if (v) return v as T;
    await wait(stepMs);
  }
  throw new Error('waitFor: timed out');
}

describe.skipIf(!CHROME_AVAILABLE)('Log domain capture + targetId tagging', () => {
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
    await session.enableLog();
  });

  afterEach(async () => {
    await session.kill();
  });

  it('captures a browser log entry tagged with the originating page targetId', async () => {
    await session.navigate(testServer.url);
    await wait(300);
    await session.clearLog();

    // A 404 subresource load makes the browser emit a `network`-source Log
    // entry ("Failed to load resource: ... 404"). This is a Log-domain entry,
    // not a console.* call, so it exercises the Log pipeline specifically.
    await session.evaluate(`
      const img = document.createElement('img');
      img.src = '/missing-resource-' + Date.now() + '.png';
      document.body.appendChild(img);
    `);

    const entry = await waitFor(() => {
      return session.getLogEntries().find((e) => e.source === 'network') ?? null;
    }, 10000);

    // The entry must be tagged with the page's own target, proving the
    // sessionId -> targetId attribution in the Log.entryAdded handler.
    expect(entry.targetId).toBeDefined();
    expect(entry.targetId).toBe(session.getCurrentTargetId());

    // And it must be retrievable via the targetId filter.
    const forPage = session
      .getLogEntries()
      .filter((e) => e.targetId === session.getCurrentTargetId());
    expect(forPage.length).toBeGreaterThan(0);
  });
});
