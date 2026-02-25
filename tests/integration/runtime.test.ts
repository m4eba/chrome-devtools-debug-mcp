import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { DebugSession } from '../../src/DebugSession.js';
import { findChrome } from '../../src/chrome-launcher.js';
import { createTestServer, type TestServer } from '../fixtures/test-server.js';

const CHROME_AVAILABLE = findChrome() !== null;

describe.skipIf(!CHROME_AVAILABLE)('Runtime Integration', () => {
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

  it('should evaluate expressions', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const result = await session.evaluate('1 + 2');
    expect(result.result.type).toBe('number');
    expect(result.result.value).toBe(3);
  });

  it('should evaluate with return by value', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const result = await session.evaluate('({ a: 1, b: 2 })', { returnByValue: true });
    expect(result.result.type).toBe('object');
    expect(result.result.value).toEqual({ a: 1, b: 2 });
  });

  it('should await promises', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const result = await session.evaluate('Promise.resolve(42)', { awaitPromise: true });
    expect(result.result.type).toBe('number');
    expect(result.result.value).toBe(42);
  });

  it('should get object properties', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    // Use a simple object instead of navigator (which may have non-enumerable properties)
    const result = await session.evaluate('({ a: 1, b: "hello", c: true })');
    expect(result.result.objectId).toBeDefined();

    if (result.result.objectId) {
      const props = await session.getProperties(result.result.objectId);
      expect(props.result.length).toBeGreaterThan(0);

      const propA = props.result.find((p) => p.name === 'a');
      expect(propA).toBeDefined();
      expect(propA?.value?.value).toBe(1);
    }
  });

  it('should report exceptions', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const result = await session.evaluate('throw new Error("test error")');
    expect(result.exceptionDetails).toBeDefined();
  });

  it('should collect console messages', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    // Clear any existing messages
    session.consoleState.clear();

    // Log some messages
    await session.evaluate('console.log("test message")');
    await session.evaluate('console.warn("warning message")');
    await session.evaluate('console.error("error message")');

    await new Promise((r) => setTimeout(r, 100));

    const messages = session.consoleState.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(3);

    expect(messages.some((m) => m.text === 'test message')).toBe(true);
    expect(messages.some((m) => m.level === 'warning')).toBe(true);
    expect(messages.some((m) => m.level === 'error')).toBe(true);
  });

  it('should collect thrown exceptions', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    session.consoleState.clear();

    // Throw an uncaught exception
    await session.evaluate(`
      setTimeout(() => {
        throw new Error('uncaught error');
      }, 10);
    `);

    await new Promise((r) => setTimeout(r, 200));

    const exceptions = session.consoleState.getExceptions();
    expect(exceptions.length).toBeGreaterThanOrEqual(1);
  });

  it('should release objects', async () => {
    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const result = await session.evaluate('({ data: "test" })');
    expect(result.result.objectId).toBeDefined();

    if (result.result.objectId) {
      await session.releaseObject(result.result.objectId);
      // Should not throw
    }
  });
});
