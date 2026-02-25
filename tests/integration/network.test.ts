import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { DebugSession } from '../../src/DebugSession.js';
import { findChrome } from '../../src/chrome-launcher.js';
import { createTestServer, type TestServer } from '../fixtures/test-server.js';

const CHROME_AVAILABLE = findChrome() !== null;

describe.skipIf(!CHROME_AVAILABLE)('Network Integration', () => {
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

  it('should collect network requests on navigation', async () => {
    await session.navigate(testServer.url + '/network-test.html');

    // Wait for page to load
    await new Promise((r) => setTimeout(r, 1000));

    const requests = session.networkState.getAllRequests();
    expect(requests.length).toBeGreaterThan(0);

    // Should have the main document request
    const docRequest = requests.find((r) => r.url.includes('network-test.html'));
    expect(docRequest).toBeDefined();
    expect(docRequest?.status).toBe(200);
  });

  it('should collect XHR/fetch requests', async () => {
    await session.enableDOM();
    await session.enableRuntime();

    await session.navigate(testServer.url + '/network-test.html');
    await new Promise((r) => setTimeout(r, 500));

    // Clear previous requests
    session.networkState.clear();

    // Click the fetch button
    const doc = await session.getDocument(2);
    const buttonId = await session.querySelector(doc.nodeId, '#fetch-data');

    const model = await session.getBoxModel(buttonId);
    const x = (model.content[0] + model.content[2]) / 2;
    const y = (model.content[1] + model.content[3]) / 2;
    await session.dispatchMouseEvent('mousePressed', x, y, { button: 'left' });
    await session.dispatchMouseEvent('mouseReleased', x, y, { button: 'left' });

    // Wait for request
    await new Promise((r) => setTimeout(r, 500));

    const requests = session.networkState.getAllRequests();
    const apiRequest = requests.find((r) => r.url.includes('/api/data'));
    expect(apiRequest).toBeDefined();
    expect(apiRequest?.resourceType).toMatch(/XHR|Fetch/);
  });

  it('should get response body', async () => {
    await session.enableRuntime();

    await session.navigate(testServer.url + '/network-test.html');
    await new Promise((r) => setTimeout(r, 500));

    session.networkState.clear();

    // Make a fetch request
    await session.evaluate('fetch("/api/data").then(r => r.json())');
    await new Promise((r) => setTimeout(r, 500));

    const requests = session.networkState.getAllRequests();
    const apiRequest = requests.find((r) => r.url.includes('/api/data'));
    expect(apiRequest).toBeDefined();

    if (apiRequest) {
      const body = await session.getResponseBody(apiRequest.requestId);
      expect(body.body).toContain('message');
    }
  });

  it('should track POST requests', async () => {
    await session.enableRuntime();

    await session.navigate(testServer.url + '/network-test.html');
    await new Promise((r) => setTimeout(r, 500));

    session.networkState.clear();

    // Make a POST request
    await session.evaluate(`
      fetch('/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'value' })
      })
    `);
    await new Promise((r) => setTimeout(r, 500));

    const requests = session.networkState.getAllRequests();
    const postRequest = requests.find((r) => r.method === 'POST');
    expect(postRequest).toBeDefined();
    expect(postRequest?.request.postData).toContain('test');
  });

  it('should track failed requests', async () => {
    await session.enableRuntime();

    await session.navigate(testServer.url);
    await new Promise((r) => setTimeout(r, 500));

    session.networkState.clear();

    // Request a non-existent endpoint
    await session.evaluate('fetch("/nonexistent")');
    await new Promise((r) => setTimeout(r, 500));

    const requests = session.networkState.getAllRequests();
    const failedRequest = requests.find((r) => r.status === 404);
    expect(failedRequest).toBeDefined();
  });
});
