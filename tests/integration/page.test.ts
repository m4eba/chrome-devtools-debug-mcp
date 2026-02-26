import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DebugSession } from '../../src/DebugSession.js';
import { findChrome } from '../../src/chrome-launcher.js';
import { createTestServer, type TestServer } from '../fixtures/test-server.js';
import { captureScreenshot, captureSnapshot } from '../../src/tools/page.js';

const CHROME_AVAILABLE = findChrome() !== null;

describe.skipIf(!CHROME_AVAILABLE)('Page Integration', () => {
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
    await session.enableRuntime();
  });

  afterEach(async () => {
    await session.kill();
  });

  it('should navigate to URL', async () => {
    const result = await session.navigate(testServer.url);
    expect(result.frameId).toBeDefined();
    expect(result.errorText).toBeUndefined();
  });

  it('should reload page', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    // Should not throw
    await session.reload();
    await new Promise((r) => setTimeout(r, 500));
  });

  it('should reload page ignoring cache', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    // Should not throw
    await session.reload(true);
    await new Promise((r) => setTimeout(r, 500));
  });

  it('should capture screenshot as png', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const result = await session.captureScreenshot({ format: 'png' });
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThan(100);
  });

  it('should capture screenshot as jpeg', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const result = await session.captureScreenshot({ format: 'jpeg', quality: 80 });
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThan(100);
  });

  it('should capture screenshot with clip', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const result = await session.captureScreenshot({
      clip: { x: 0, y: 0, width: 100, height: 100, scale: 1 },
    });
    expect(result.data).toBeDefined();
  });

  it('should capture snapshot as mhtml', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const result = await session.captureSnapshot('mhtml');
    expect(result.data).toBeDefined();
    expect(result.data).toContain('MIME-Version');
  });

  it('should get frame tree', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const result = await session.getFrameTree();
    expect(result.frameTree).toBeDefined();
    expect(result.frameTree.frame.id).toBeDefined();
    // URL may have trailing slash
    expect(result.frameTree.frame.url.replace(/\/$/, '')).toBe(testServer.url.replace(/\/$/, ''));
  });

  it('should add and remove script on new document', async () => {
    await session.enablePage();

    const script = 'window.__testInjected = true;';
    const { identifier } = await session.addScriptToEvaluateOnNewDocument(script);
    expect(identifier).toBeDefined();

    // Navigate to trigger the script
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    // Check script ran
    const result = await session.evaluate('window.__testInjected', { returnByValue: true });
    expect(result.result.value).toBe(true);

    // Remove script
    await session.removeScriptToEvaluateOnNewDocument(identifier);

    // Navigate again - script should not run
    await session.navigate('about:blank');
    await new Promise((r) => setTimeout(r, 300));
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const result2 = await session.evaluate('window.__testInjected', { returnByValue: true });
    expect(result2.result.value).toBeUndefined();
  });

  it('should create isolated world', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    // Get frame id
    const frameTree = await session.getFrameTree();
    const frameId = frameTree.frameTree.frame.id;

    // Create isolated world
    const result = await session.createIsolatedWorld(frameId, { worldName: 'testWorld' });
    expect(result.executionContextId).toBeDefined();
    expect(result.executionContextId).toBeGreaterThan(0);
  });

  it('should delete cookies', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    // Set a cookie
    await session.evaluate('document.cookie = "testcookie=value"');

    // Delete it
    await session.deleteCookies('testcookie', { url: testServer.url });

    // Verify deleted
    const result = await session.evaluate('document.cookie', { returnByValue: true });
    expect(result.result.value).not.toContain('testcookie');
  });
});

describe.skipIf(!CHROME_AVAILABLE)('Screenshot File Handling', () => {
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
    await session.enableRuntime();
  });

  afterEach(async () => {
    await session.kill();
  });

  it('should save screenshot to filePath', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const filePath = join(tmpdir(), `test-screenshot-${Date.now()}.png`);

    try {
      const result = await captureScreenshot.handler(session, { filePath });

      expect(result.content[0].text).toContain('savedTo');
      expect(result.content[0].text).toContain(filePath);
      expect(existsSync(filePath)).toBe(true);

      const fileData = readFileSync(filePath);
      expect(fileData.length).toBeGreaterThan(100);
    } finally {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }
  });

  it('should return image content for small screenshots', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    // Capture a tiny region - should be small enough to return as image
    const result = await captureScreenshot.handler(session, {
      clip: { x: 0, y: 0, width: 10, height: 10, scale: 1 },
    });

    // Should return as image content type
    const content = result.content[0] as { type: string; data?: string; mimeType?: string };
    expect(content.type).toBe('image');
    expect(content.data).toBeDefined();
    expect(content.mimeType).toBe('image/png');
  });

  it('should auto-save large screenshots to temp file', async () => {
    // Create a page with a large canvas filled with random noise (doesn't compress well)
    await session.navigate('about:blank');
    await session.evaluate(`
      const canvas = document.createElement('canvas');
      canvas.width = 2000;
      canvas.height = 2000;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(2000, 2000);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = Math.floor(Math.random() * 256);
        imageData.data[i + 1] = Math.floor(Math.random() * 256);
        imageData.data[i + 2] = Math.floor(Math.random() * 256);
        imageData.data[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      document.body.style.margin = '0';
      document.body.appendChild(canvas);
    `);
    await new Promise((r) => setTimeout(r, 1000));

    // Capture with captureBeyondViewport to get full canvas - should exceed 2MB
    const result = await captureScreenshot.handler(session, {
      clip: { x: 0, y: 0, width: 2000, height: 2000, scale: 1 },
      captureBeyondViewport: true,
    });

    // Should return text with savedTo (not image content)
    const content = result.content[0] as { type: string; text?: string };
    expect(content.type).toBe('text');
    expect(content.text).toBeDefined();

    const response = JSON.parse(content.text!);
    expect(response.savedTo).toBeDefined();
    expect(response.savedTo).toContain('screenshot-');
    expect(response.byteSize).toBeGreaterThanOrEqual(1024 * 1024);
    expect(existsSync(response.savedTo)).toBe(true);

    // Clean up
    unlinkSync(response.savedTo);
  });

  it('should save snapshot to filePath', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const filePath = join(tmpdir(), `test-snapshot-${Date.now()}.mhtml`);

    try {
      const result = await captureSnapshot.handler(session, { filePath });

      expect(result.content[0].text).toContain('savedTo');
      expect(result.content[0].text).toContain(filePath);
      expect(existsSync(filePath)).toBe(true);

      const fileData = readFileSync(filePath, 'utf8');
      expect(fileData).toContain('MIME-Version');
    } finally {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }
  });
});

describe.skipIf(!CHROME_AVAILABLE)('Page Dialog Integration', () => {
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
    await session.enablePage();
    await session.enableRuntime();
  });

  afterEach(async () => {
    await session.kill();
  });

  it('should handle alert dialog', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    // Set up dialog handler
    let dialogHandled = false;
    session.on('dialogOpened', async () => {
      await session.handleJavaScriptDialog(true);
      dialogHandled = true;
    });

    // Trigger alert - this will block so we need to handle it
    const evalPromise = session.evaluate('alert("test")');

    // Wait a bit for dialog
    await new Promise((r) => setTimeout(r, 300));

    // Handle dialog if listener didn't catch it
    if (!dialogHandled) {
      try {
        await session.handleJavaScriptDialog(true);
      } catch {
        // Dialog may already be handled
      }
    }

    // Wait for eval to complete
    await evalPromise.catch(() => {});
  });
});
