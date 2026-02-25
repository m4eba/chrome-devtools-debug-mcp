import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { DebugSession } from '../../src/DebugSession.js';
import { findChrome } from '../../src/chrome-launcher.js';
import { createTestServer, type TestServer } from '../fixtures/test-server.js';

const CHROME_AVAILABLE = findChrome() !== null;

describe.skipIf(!CHROME_AVAILABLE)('Target Integration', () => {
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
  });

  afterEach(async () => {
    await session.kill();
  });

  it('should list targets', async () => {
    const targets = await session.listTargets();
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.some((t) => t.type === 'page')).toBe(true);
  });

  it('should create new target', async () => {
    const initialTargets = await session.listTargets();
    const initialPageCount = initialTargets.filter((t) => t.type === 'page').length;

    const newTarget = await session.createTarget(testServer.url);
    expect(newTarget.targetId).toBeDefined();
    expect(newTarget.type).toBe('page');

    const updatedTargets = await session.listTargets();
    const newPageCount = updatedTargets.filter((t) => t.type === 'page').length;
    expect(newPageCount).toBe(initialPageCount + 1);
  });

  it('should switch between targets', async () => {
    // Navigate first target
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const firstTargetId = session.getCurrentTargetId();
    expect(firstTargetId).toBeDefined();

    // Create second target
    const newTarget = await session.createTarget('about:blank');
    expect(newTarget.targetId).not.toBe(firstTargetId);

    // Switch to new target
    await session.switchTarget(newTarget.targetId);
    expect(session.getCurrentTargetId()).toBe(newTarget.targetId);

    // Switch back
    await session.switchTarget(firstTargetId!);
    expect(session.getCurrentTargetId()).toBe(firstTargetId);
  });

  it('should close target', async () => {
    // Create a target to close
    const newTarget = await session.createTarget('about:blank');

    const beforeCount = (await session.listTargets()).filter((t) => t.type === 'page').length;

    const success = await session.closeTarget(newTarget.targetId);
    expect(success).toBe(true);

    await new Promise((r) => setTimeout(r, 200));

    const afterCount = (await session.listTargets()).filter((t) => t.type === 'page').length;
    expect(afterCount).toBe(beforeCount - 1);
  });

  it('should track current target id', async () => {
    expect(session.getCurrentTargetId()).toBeDefined();
  });

  it('should preserve http endpoint after switch', async () => {
    const newTarget = await session.createTarget('about:blank');
    await session.switchTarget(newTarget.targetId);

    // Should still be able to list targets (requires httpEndpoint)
    const targets = await session.listTargets();
    expect(targets.length).toBeGreaterThan(0);
  });
});
