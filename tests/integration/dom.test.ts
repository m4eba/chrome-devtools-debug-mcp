import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { DebugSession } from '../../src/DebugSession.js';
import { findChrome } from '../../src/chrome-launcher.js';
import { createTestServer, type TestServer } from '../fixtures/test-server.js';

const CHROME_AVAILABLE = findChrome() !== null;

describe.skipIf(!CHROME_AVAILABLE)('DOM Integration', () => {
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
    await session.enableDOM();
  });

  afterEach(async () => {
    await session.kill();
  });

  it('should get document', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const doc = await session.getDocument(2);
    expect(doc.nodeId).toBeGreaterThan(0);
    expect(doc.nodeName).toBe('#document');
  });

  it('should query selector', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const doc = await session.getDocument(2);
    const buttonId = await session.querySelector(doc.nodeId, '#trigger');

    expect(buttonId).toBeGreaterThan(0);
  });

  it('should query selector all', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const doc = await session.getDocument(2);
    const buttons = await session.querySelectorAll(doc.nodeId, 'button');

    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('should get outer HTML', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const doc = await session.getDocument(2);
    const buttonId = await session.querySelector(doc.nodeId, '#trigger');
    const html = await session.getOuterHTML(buttonId);

    expect(html).toContain('button');
    expect(html).toContain('Click Me');
  });

  it('should get attributes', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const doc = await session.getDocument(2);
    const buttonId = await session.querySelector(doc.nodeId, '#trigger');
    const attrs = await session.getAttributes(buttonId);

    expect(attrs).toContain('id');
    expect(attrs).toContain('trigger');
  });

  it('should get box model', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const doc = await session.getDocument(2);
    const buttonId = await session.querySelector(doc.nodeId, '#trigger');
    const model = await session.getBoxModel(buttonId);

    expect(model.width).toBeGreaterThan(0);
    expect(model.height).toBeGreaterThan(0);
    expect(model.content).toHaveLength(8);
  });

  it('should resolve node to object', async () => {
    await session.enableRuntime();

    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const doc = await session.getDocument(2);
    const buttonId = await session.querySelector(doc.nodeId, '#trigger');
    const obj = await session.resolveNode(buttonId);

    expect(obj.type).toBe('object');
    expect(obj.subtype).toBe('node');
    expect(obj.objectId).toBeDefined();
  });
});

describe.skipIf(!CHROME_AVAILABLE)('DOMDebugger Integration', () => {
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
    await session.enableDOM();
    await session.enableDebugger();
    await session.enableRuntime();
  });

  afterEach(async () => {
    await session.kill();
  });

  it('should break on attribute modification', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const doc = await session.getDocument(2);
    const buttonId = await session.querySelector(doc.nodeId, '#trigger');

    // Set DOM breakpoint
    await session.setDOMBreakpoint(buttonId, 'attribute-modified');

    // Listen for pause
    const pausedPromise = new Promise<void>((resolve) => {
      session.on('paused', () => resolve());
    });

    // Modify attribute
    session.evaluate('document.getElementById("trigger").setAttribute("data-test", "value")').catch(() => {});

    // Wait for pause
    await Promise.race([
      pausedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
    ]);

    expect(session.debugState.isPaused()).toBe(true);
    await session.resume();
  });

  it('should get event listeners', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const doc = await session.getDocument(2);
    const buttonId = await session.querySelector(doc.nodeId, '#trigger');
    const obj = await session.resolveNode(buttonId);

    if (obj.objectId) {
      const listeners = await session.getEventListeners(obj.objectId);
      const clickListener = listeners.find((l) => l.type === 'click');
      expect(clickListener).toBeDefined();
    }
  });
});
