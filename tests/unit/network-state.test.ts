import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkState } from '../../src/state/NetworkState.js';

describe('NetworkState', () => {
  let state: NetworkState;

  beforeEach(() => {
    state = new NetworkState();
    state.setEnabled(true);
  });

  describe('request lifecycle', () => {
    it('should track request sent', () => {
      state.onRequestWillBeSent({
        requestId: 'req1',
        loaderId: 'loader1',
        documentURL: 'http://example.com',
        request: {
          url: 'http://example.com/api/data',
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        timestamp: 1000,
        wallTime: Date.now(),
        type: 'XHR',
      });

      const req = state.getRequest('req1');
      expect(req).toBeDefined();
      expect(req?.url).toBe('http://example.com/api/data');
      expect(req?.method).toBe('GET');
      expect(req?.resourceType).toBe('XHR');
    });

    it('should track response received', () => {
      state.onRequestWillBeSent({
        requestId: 'req1',
        loaderId: 'loader1',
        documentURL: 'http://example.com',
        request: {
          url: 'http://example.com/api/data',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        timestamp: 1000,
        wallTime: Date.now(),
        type: 'XHR',
      });

      state.onResponseReceived({
        requestId: 'req1',
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
      state.onRequestWillBeSent({
        requestId: 'req1',
        loaderId: 'loader1',
        documentURL: 'http://example.com',
        request: {
          url: 'http://example.com/api/data',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        timestamp: 1000,
        wallTime: Date.now(),
        type: 'XHR',
      });

      state.onLoadingFinished({
        requestId: 'req1',
        timestamp: 1200,
        encodedDataLength: 5000,
      });

      const req = state.getRequest('req1');
      expect(req?.endTime).toBe(1200);
      expect(req?.duration).toBe(200);
      expect(req?.encodedDataLength).toBe(5000);
    });

    it('should track loading failed', () => {
      state.onRequestWillBeSent({
        requestId: 'req1',
        loaderId: 'loader1',
        documentURL: 'http://example.com',
        request: {
          url: 'http://example.com/api/data',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        timestamp: 1000,
        wallTime: Date.now(),
        type: 'XHR',
      });

      state.onLoadingFailed({
        requestId: 'req1',
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
      // Add some test requests
      state.onRequestWillBeSent({
        requestId: 'req1',
        loaderId: 'loader1',
        documentURL: 'http://example.com',
        request: {
          url: 'http://example.com/api/users',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        timestamp: 1000,
        wallTime: Date.now(),
        type: 'XHR',
      });

      state.onRequestWillBeSent({
        requestId: 'req2',
        loaderId: 'loader1',
        documentURL: 'http://example.com',
        request: {
          url: 'http://example.com/app.js',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        timestamp: 1100,
        wallTime: Date.now(),
        type: 'Script',
      });

      state.onLoadingFailed({
        requestId: 'req1',
        timestamp: 1200,
        errorText: 'Failed',
      });
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

  describe('response body', () => {
    it('should store response body', () => {
      state.onRequestWillBeSent({
        requestId: 'req1',
        loaderId: 'loader1',
        documentURL: 'http://example.com',
        request: {
          url: 'http://example.com/api/data',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        timestamp: 1000,
        wallTime: Date.now(),
        type: 'XHR',
      });

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
        state.onRequestWillBeSent({
          requestId: `req${i}`,
          loaderId: 'loader1',
          documentURL: 'http://example.com',
          request: {
            url: `http://example.com/api/${i}`,
            method: 'GET',
            headers: {},
            initialPriority: 'High',
            referrerPolicy: 'no-referrer',
          },
          timestamp: 1000 + i,
          wallTime: Date.now(),
          type: 'XHR',
        });
      }

      expect(state.getCount()).toBe(5);
    });

    it('should clear all requests', () => {
      state.onRequestWillBeSent({
        requestId: 'req1',
        loaderId: 'loader1',
        documentURL: 'http://example.com',
        request: {
          url: 'http://example.com/api/data',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        timestamp: 1000,
        wallTime: Date.now(),
        type: 'XHR',
      });

      state.clear();
      expect(state.getCount()).toBe(0);
    });
  });

  describe('summary', () => {
    it('should provide accurate summary', () => {
      state.onRequestWillBeSent({
        requestId: 'req1',
        loaderId: 'loader1',
        documentURL: 'http://example.com',
        request: { url: 'http://example.com/1', method: 'GET', headers: {}, initialPriority: 'High', referrerPolicy: 'no-referrer' },
        timestamp: 1000,
        wallTime: Date.now(),
        type: 'XHR',
      });
      state.onLoadingFinished({ requestId: 'req1', timestamp: 1100, encodedDataLength: 100 });

      state.onRequestWillBeSent({
        requestId: 'req2',
        loaderId: 'loader1',
        documentURL: 'http://example.com',
        request: { url: 'http://example.com/2', method: 'GET', headers: {}, initialPriority: 'High', referrerPolicy: 'no-referrer' },
        timestamp: 1200,
        wallTime: Date.now(),
        type: 'XHR',
      });
      state.onLoadingFailed({ requestId: 'req2', timestamp: 1300, errorText: 'Failed' });

      state.onRequestWillBeSent({
        requestId: 'req3',
        loaderId: 'loader1',
        documentURL: 'http://example.com',
        request: { url: 'http://example.com/3', method: 'GET', headers: {}, initialPriority: 'High', referrerPolicy: 'no-referrer' },
        timestamp: 1400,
        wallTime: Date.now(),
        type: 'XHR',
      });

      const summary = state.getSummary();
      expect(summary.total).toBe(3);
      expect(summary.completed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.pending).toBe(1);
    });
  });
});
