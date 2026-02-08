import { describe, it, expect, beforeEach } from 'vitest';
import { FetchInterceptor } from '../../src/state/FetchInterceptor.js';
import type { FetchRequestPaused } from '../../src/utils/types.js';

describe('FetchInterceptor', () => {
  let interceptor: FetchInterceptor;

  beforeEach(() => {
    interceptor = new FetchInterceptor();
    interceptor.setEnabled(true);
  });

  describe('rule management', () => {
    it('should add rules and return IDs', () => {
      const id1 = interceptor.addRule({
        pattern: '*/api/*',
        action: 'pause',
        enabled: true,
      });

      const id2 = interceptor.addRule({
        pattern: '*.js',
        action: 'mock',
        mockResponse: { status: 200, body: 'test' },
        enabled: true,
      });

      expect(id1).toBe('rule-1');
      expect(id2).toBe('rule-2');
      expect(interceptor.getAllRules()).toHaveLength(2);
    });

    it('should get rule by ID', () => {
      const id = interceptor.addRule({
        pattern: '*/api/*',
        action: 'pause',
        enabled: true,
      });

      const rule = interceptor.getRule(id);
      expect(rule?.pattern).toBe('*/api/*');
      expect(rule?.action).toBe('pause');
    });

    it('should remove rules', () => {
      const id = interceptor.addRule({
        pattern: '*/api/*',
        action: 'pause',
        enabled: true,
      });

      const removed = interceptor.removeRule(id);
      expect(removed).toBe(true);
      expect(interceptor.getAllRules()).toHaveLength(0);
    });

    it('should update rules', () => {
      const id = interceptor.addRule({
        pattern: '*/api/*',
        action: 'pause',
        enabled: true,
      });

      interceptor.updateRule(id, { action: 'fail', failReason: 'Blocked' });

      const rule = interceptor.getRule(id);
      expect(rule?.action).toBe('fail');
      expect(rule?.failReason).toBe('Blocked');
    });

    it('should enable/disable rules', () => {
      const id = interceptor.addRule({
        pattern: '*/api/*',
        action: 'pause',
        enabled: true,
      });

      interceptor.enableRule(id, false);
      expect(interceptor.getRule(id)?.enabled).toBe(false);

      interceptor.enableRule(id, true);
      expect(interceptor.getRule(id)?.enabled).toBe(true);
    });

    it('should clear all rules', () => {
      interceptor.addRule({ pattern: '*/api/*', action: 'pause', enabled: true });
      interceptor.addRule({ pattern: '*.js', action: 'mock', mockResponse: { status: 200, body: '' }, enabled: true });

      interceptor.clearRules();
      expect(interceptor.getAllRules()).toHaveLength(0);
    });
  });

  describe('pattern matching', () => {
    it('should match wildcard patterns', () => {
      expect(interceptor.matchesPattern('http://example.com/api/users', '*/api/*')).toBe(true);
      expect(interceptor.matchesPattern('http://example.com/static/app.js', '*/api/*')).toBe(false);
    });

    it('should match catch-all pattern', () => {
      expect(interceptor.matchesPattern('http://anything.com/path', '*')).toBe(true);
    });

    it('should match regex patterns', () => {
      expect(interceptor.matchesPattern('http://example.com/app.min.js', '/.*\\.min\\.js$/')).toBe(true);
      expect(interceptor.matchesPattern('http://example.com/app.js', '/.*\\.min\\.js$/')).toBe(false);
    });

    it('should match exact URLs', () => {
      expect(interceptor.matchesPattern('http://example.com/api', 'http://example.com/api')).toBe(true);
      expect(interceptor.matchesPattern('http://example.com/api/', 'http://example.com/api')).toBe(false);
    });

    it('should handle invalid regex gracefully', () => {
      expect(interceptor.matchesPattern('test', '/[invalid/')).toBe(false);
    });
  });

  describe('rule matching', () => {
    it('should find matching rule by URL', () => {
      interceptor.addRule({ pattern: '*/api/*', action: 'pause', enabled: true });
      interceptor.addRule({ pattern: '*.js', action: 'mock', mockResponse: { status: 200, body: '' }, enabled: true });

      const rule = interceptor.findMatchingRule('http://example.com/api/users', 'XHR');
      expect(rule?.pattern).toBe('*/api/*');
    });

    it('should filter by resource type', () => {
      interceptor.addRule({
        pattern: '*',
        action: 'pause',
        resourceTypes: ['Script', 'Stylesheet'],
        enabled: true,
      });

      expect(interceptor.findMatchingRule('http://example.com/app.js', 'Script')).toBeDefined();
      expect(interceptor.findMatchingRule('http://example.com/api', 'XHR')).toBeUndefined();
    });

    it('should skip disabled rules', () => {
      interceptor.addRule({ pattern: '*', action: 'pause', enabled: false });

      expect(interceptor.findMatchingRule('http://example.com/api', 'XHR')).toBeUndefined();
    });
  });

  describe('paused request management', () => {
    it('should track paused requests', () => {
      const event: FetchRequestPaused = {
        requestId: 'req1',
        request: {
          url: 'http://example.com/api/data',
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        frameId: 'frame1',
        resourceType: 'XHR',
      };

      const paused = interceptor.onRequestPaused(event);

      expect(paused.requestId).toBe('req1');
      expect(paused.url).toBe('http://example.com/api/data');
      expect(interceptor.getAllPausedRequests()).toHaveLength(1);
    });

    it('should associate matching rule with paused request', () => {
      interceptor.addRule({ pattern: '*/api/*', action: 'pause', enabled: true });

      const event: FetchRequestPaused = {
        requestId: 'req1',
        request: {
          url: 'http://example.com/api/data',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        frameId: 'frame1',
        resourceType: 'XHR',
      };

      const paused = interceptor.onRequestPaused(event);
      expect(paused.matchedRule?.pattern).toBe('*/api/*');
    });

    it('should get paused request by ID', () => {
      const event: FetchRequestPaused = {
        requestId: 'req1',
        request: {
          url: 'http://example.com/api/data',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        frameId: 'frame1',
        resourceType: 'XHR',
      };

      interceptor.onRequestPaused(event);

      expect(interceptor.getPausedRequest('req1')).toBeDefined();
      expect(interceptor.getPausedRequest('unknown')).toBeUndefined();
    });

    it('should remove paused requests', () => {
      const event: FetchRequestPaused = {
        requestId: 'req1',
        request: {
          url: 'http://example.com/api/data',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        frameId: 'frame1',
        resourceType: 'XHR',
      };

      interceptor.onRequestPaused(event);
      interceptor.removePausedRequest('req1');

      expect(interceptor.getAllPausedRequests()).toHaveLength(0);
    });
  });

  describe('CDP pattern generation', () => {
    it('should generate CDP patterns from rules', () => {
      interceptor.addRule({ pattern: '*/api/*', action: 'pause', enabled: true });
      interceptor.addRule({
        pattern: '*.js',
        action: 'mock',
        resourceTypes: ['Script'],
        mockResponse: { status: 200, body: '' },
        enabled: true,
      });

      const patterns = interceptor.getCDPPatterns();
      expect(patterns).toHaveLength(2);
      expect(patterns[0].urlPattern).toBe('*/api/*');
      expect(patterns[1].resourceType).toBe('Script');
    });

    it('should skip disabled rules in pattern generation', () => {
      interceptor.addRule({ pattern: '*/api/*', action: 'pause', enabled: false });

      const patterns = interceptor.getCDPPatterns();
      expect(patterns).toHaveLength(0);
    });
  });

  describe('header helpers', () => {
    it('should build modified headers', () => {
      const original = { 'Accept': 'text/html', 'Authorization': 'Bearer token' };
      const modify = { 'Accept': 'application/json', 'X-Custom': 'value' };

      const result = interceptor.buildModifiedHeaders(original, modify);

      expect(result).toContainEqual({ name: 'Accept', value: 'application/json' });
      expect(result).toContainEqual({ name: 'Authorization', value: 'Bearer token' });
      expect(result).toContainEqual({ name: 'X-Custom', value: 'value' });
    });

    it('should encode response body to base64', () => {
      const body = 'Hello, World!';
      const encoded = interceptor.encodeResponseBody(body);

      expect(Buffer.from(encoded, 'base64').toString()).toBe(body);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      interceptor.addRule({ pattern: '*', action: 'pause', enabled: true });

      const event: FetchRequestPaused = {
        requestId: 'req1',
        request: {
          url: 'http://example.com/api',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        frameId: 'frame1',
        resourceType: 'XHR',
      };
      interceptor.onRequestPaused(event);

      interceptor.reset();

      expect(interceptor.getAllRules()).toHaveLength(0);
      expect(interceptor.getAllPausedRequests()).toHaveLength(0);
    });
  });

  describe('summary', () => {
    it('should provide accurate summary', () => {
      interceptor.addRule({ pattern: '*/api/*', action: 'pause', enabled: true });
      interceptor.addRule({ pattern: '*.js', action: 'mock', mockResponse: { status: 200, body: '' }, enabled: false });

      const event: FetchRequestPaused = {
        requestId: 'req1',
        request: {
          url: 'http://example.com/api',
          method: 'GET',
          headers: {},
          initialPriority: 'High',
          referrerPolicy: 'no-referrer',
        },
        frameId: 'frame1',
        resourceType: 'XHR',
      };
      interceptor.onRequestPaused(event);

      const summary = interceptor.getSummary();
      expect(summary.ruleCount).toBe(2);
      expect(summary.enabledRules).toBe(1);
      expect(summary.pausedRequests).toBe(1);
    });
  });
});
