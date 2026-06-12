import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkState } from '../../src/state/NetworkState.js';

const T = 'TARGET-A';

const baseRequest = (overrides: { requestId: string; url: string; type?: 'XHR' | 'Script'; timestamp?: number; targetId?: string }) => ({
  requestId: overrides.requestId,
  targetId: overrides.targetId ?? T,
  loaderId: 'loader1',
  documentURL: 'http://example.com',
  request: {
    url: overrides.url,
    method: 'GET',
    headers: {},
    initialPriority: 'High',
    referrerPolicy: 'no-referrer',
  },
  timestamp: overrides.timestamp ?? 1000,
  wallTime: Date.now(),
  type: (overrides.type ?? 'XHR') as 'XHR' | 'Script',
});

describe('NetworkState', () => {
  let state: NetworkState;

  beforeEach(() => {
    state = new NetworkState();
    state.setEnabled(true);
  });

  describe('request lifecycle', () => {
    it('should track request sent', () => {
      state.onRequestWillBeSent(baseRequest({ requestId: 'req1', url: 'http://example.com/api/data' }));

      const req = state.getRequest('req1');
      expect(req).toBeDefined();
      expect(req?.url).toBe('http://example.com/api/data');
      expect(req?.method).toBe('GET');
      expect(req?.resourceType).toBe('XHR');
      expect(req?.targetId).toBe(T);
    });

    it('should track response received', () => {
      state.onRequestWillBeSent(baseRequest({ requestId: 'req1', url: 'http://example.com/api/data' }));

      state.onResponseReceived({
        requestId: 'req1',
        targetId: T,
        timestamp: 1100,
        response: {
          url: 'http://example.com/api/data',
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
          mimeType: 'application/json',
          connectionReused: false,
          connectionId: 1,
          encodedDataLength: 1000,
          securityState: 'secure',
        },
        type: 'XHR',
      });

      const req = state.getRequest('req1');
      expect(req?.status).toBe(200);
      expect(req?.statusText).toBe('OK');
      expect(req?.mimeType).toBe('application/json');
    });

    it('should track loading finished', () => {
      state.onRequestWillBeSent(baseRequest({ requestId: 'req1', url: 'http://example.com/api/data' }));

      state.onLoadingFinished({
        requestId: 'req1',
        targetId: T,
        timestamp: 1200,
        encodedDataLength: 5000,
      });

      const req = state.getRequest('req1');
      expect(req?.endTime).toBe(1200);
      expect(req?.duration).toBe(200);
      expect(req?.encodedDataLength).toBe(5000);
    });

    it('should track loading failed', () => {
      state.onRequestWillBeSent(baseRequest({ requestId: 'req1', url: 'http://example.com/api/data' }));

      state.onLoadingFailed({
        requestId: 'req1',
        targetId: T,
        timestamp: 1100,
        errorText: 'net::ERR_CONNECTION_REFUSED',
        canceled: false,
      });

      const req = state.getRequest('req1');
      expect(req?.failed).toBe(true);
      expect(req?.errorText).toBe('net::ERR_CONNECTION_REFUSED');
    });
  });

  describe('querying', () => {
    beforeEach(() => {
      state.onRequestWillBeSent(baseRequest({ requestId: 'req1', url: 'http://example.com/api/users' }));
      state.onRequestWillBeSent(baseRequest({ requestId: 'req2', url: 'http://example.com/app.js', type: 'Script', timestamp: 1100 }));
      state.onLoadingFailed({ requestId: 'req1', targetId: T, timestamp: 1200, errorText: 'Failed' });
    });

    it('should get all requests', () => {
      expect(state.getAllRequests()).toHaveLength(2);
    });

    it('should filter by URL pattern', () => {
      const requests = state.getRequestsByUrl('*/api/*');
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toContain('/api/');
    });

    it('should filter by resource type', () => {
      const requests = state.getRequestsByType('Script');
      expect(requests).toHaveLength(1);
      expect(requests[0].resourceType).toBe('Script');
    });

    it('should get failed requests', () => {
      const requests = state.getFailedRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].failed).toBe(true);
    });

    it('should get pending requests', () => {
      const requests = state.getPendingRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].requestId).toBe('req2');
    });
  });

  describe('multi-target isolation', () => {
    beforeEach(() => {
      state.onRequestWillBeSent(baseRequest({ requestId: 'r1', url: 'http://example.com/page' }));
      state.onRequestWillBeSent(baseRequest({ requestId: 'r1', url: 'http://example.com/sw-fetch', targetId: 'TARGET-SW' }));
      state.onRequestWillBeSent(baseRequest({ requestId: 'r2', url: 'http://example.com/page-2', timestamp: 1100 }));
    });

    it('keeps requests with the same id but different targets separate', () => {
      expect(state.getAllRequests()).toHaveLength(3);
      expect(state.getRequest('r1', T)?.url).toBe('http://example.com/page');
      expect(state.getRequest('r1', 'TARGET-SW')?.url).toBe('http://example.com/sw-fetch');
    });

    it('filters by targetId', () => {
      expect(state.getAllRequests(T)).toHaveLength(2);
      expect(state.getAllRequests('TARGET-SW')).toHaveLength(1);
    });

    it('clears only requests for a specific target', () => {
      state.clear('TARGET-SW');
      expect(state.getAllRequests()).toHaveLength(2);
      expect(state.getAllRequests('TARGET-SW')).toHaveLength(0);
    });

    it('summary supports per-target view', () => {
      expect(state.getSummary().total).toBe(3);
      expect(state.getSummary('TARGET-SW').total).toBe(1);
    });
  });

  describe('response body', () => {
    it('should store response body', () => {
      state.onRequestWillBeSent(baseRequest({ requestId: 'req1', url: 'http://example.com/api/data' }));

      state.setResponseBody('req1', '{"data": "test"}', false);

      const req = state.getRequest('req1');
      expect(req?.responseBody).toBe('{"data": "test"}');
      expect(req?.responseBodyBase64).toBe(false);
    });
  });

  describe('limits and clearing', () => {
    it('should limit stored requests', () => {
      state.setMaxRequests(5);

      for (let i = 0; i < 10; i++) {
        state.onRequestWillBeSent(baseRequest({
          requestId: `req${i}`,
          url: `http://example.com/api/${i}`,
          timestamp: 1000 + i,
        }));
      }

      expect(state.getCount()).toBe(5);
    });

    it('should clear all requests', () => {
      state.onRequestWillBeSent(baseRequest({ requestId: 'req1', url: 'http://example.com/api/data' }));

      state.clear();
      expect(state.getCount()).toBe(0);
    });
  });

  describe('summary', () => {
    it('should provide accurate summary', () => {
      state.onRequestWillBeSent(baseRequest({ requestId: 'req1', url: 'http://example.com/1' }));
      state.onLoadingFinished({ requestId: 'req1', targetId: T, timestamp: 1100, encodedDataLength: 100 });

      state.onRequestWillBeSent(baseRequest({ requestId: 'req2', url: 'http://example.com/2', timestamp: 1200 }));
      state.onLoadingFailed({ requestId: 'req2', targetId: T, timestamp: 1300, errorText: 'Failed' });

      state.onRequestWillBeSent(baseRequest({ requestId: 'req3', url: 'http://example.com/3', timestamp: 1400 }));

      const summary = state.getSummary();
      expect(summary.total).toBe(3);
      expect(summary.completed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.pending).toBe(1);
    });
  });
});
