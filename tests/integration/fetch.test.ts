import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { DebugSession } from '../../src/DebugSession.js';
import { findChrome } from '../../src/chrome-launcher.js';
import { createTestServer, type TestServer } from '../fixtures/test-server.js';

const CHROME_AVAILABLE = findChrome() !== null;

describe.skipIf(!CHROME_AVAILABLE)('Fetch Interception Integration', () => {
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
    await session.launch({ headless: true });
    await session.enableNetwork();
    await session.enableRuntime();
  });

  afterEach(async () => {
    await session.kill();
  });

  it('should intercept requests', async () => {
    // Add intercept rule
    session.fetchInterceptor.addRule({
      pattern: '*/api/*',
      action: 'pause',
      enabled: true,
    });

    // Enable fetch with patterns
    await session.enableFetch([{ urlPattern: '*/api/*', requestStage: 'Request' }]);

    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    // Set up listener for paused requests
    const pausedPromise = new Promise<string>((resolve) => {
      session.on('requestPaused', (data) => {
        resolve(data.requestId);
      });
    });

    // Make a request that should be intercepted
    const evalPromise = session.evaluate('fetch("/api/data")').catch(() => {});

    // Wait for request to be paused
    const requestId = await Promise.race([
      pausedPromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
    ]);

    expect(requestId).toBeDefined();

    const paused = session.fetchInterceptor.getPausedRequest(requestId);
    expect(paused?.url).toContain('/api/data');

    // Continue the request
    await session.continueRequest(requestId);
    await evalPromise;
  });

  it('should mock responses', async () => {
    // Enable fetch with specific pattern
    await session.enableFetch([{ urlPattern: '*/api/mock-me', requestStage: 'Request' }]);

    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const pausedPromise = new Promise<string>((resolve) => {
      session.once('requestPaused', (data) => {
        resolve(data.requestId);
      });
    });

    // Make request that will be intercepted
    const fetchPromise = session.evaluate(`
      fetch('/api/mock-me').then(r => r.json()).catch(e => ({ error: e.message }))
    `, { awaitPromise: true, returnByValue: true, timeout: 10000 });

    const requestId = await Promise.race([
      pausedPromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for intercept')), 5000)),
    ]);

    // Fulfill with mock response
    await session.fulfillRequest(requestId, 200, {
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: '{"mocked": true}',
    });

    const result = await fetchPromise;
    expect(result.result.value).toEqual({ mocked: true });
  });

  it('should fail requests', async () => {
    // Enable fetch with specific pattern
    await session.enableFetch([{ urlPattern: '*/api/block-me', requestStage: 'Request' }]);

    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const pausedPromise = new Promise<string>((resolve) => {
      session.once('requestPaused', (data) => {
        resolve(data.requestId);
      });
    });

    // Make request that will be blocked
    const fetchPromise = session.evaluate(`
      fetch('/api/block-me').catch(e => ({ error: e.message }))
    `, { awaitPromise: true, returnByValue: true, timeout: 10000 });

    const requestId = await Promise.race([
      pausedPromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
    ]);

    // Fail the request
    await session.failRequest(requestId, 'BlockedByClient');

    const result = await fetchPromise;
    expect(result.result.value?.error).toBeDefined();
  });

  it('should modify request headers', async () => {
    // Enable fetch with specific pattern
    await session.enableFetch([{ urlPattern: '*/api/echo', requestStage: 'Request' }]);

    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    const pausedPromise = new Promise<string>((resolve) => {
      session.once('requestPaused', (data) => {
        resolve(data.requestId);
      });
    });

    // Make request
    const fetchPromise = session.evaluate(`
      fetch('/api/echo').then(r => r.json()).catch(e => ({ error: e.message }))
    `, { awaitPromise: true, returnByValue: true, timeout: 10000 });

    const requestId = await Promise.race([
      pausedPromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
    ]);

    // Continue with modified headers
    await session.continueRequest(requestId, {
      headers: [
        { name: 'X-Custom-Header', value: 'test-value' },
      ],
    });

    const result = await fetchPromise;
    expect(result.result.value?.headers?.['x-custom-header']).toBe('test-value');
  });
});
