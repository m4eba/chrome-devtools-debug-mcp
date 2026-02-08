import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptRegistry } from '../../src/state/ScriptRegistry.js';
import type { ScriptInfo } from '../../src/utils/types.js';

describe('ScriptRegistry', () => {
  let registry: ScriptRegistry;

  beforeEach(() => {
    registry = new ScriptRegistry();
  });

  const createScript = (id: string, url?: string): ScriptInfo => ({
    scriptId: id,
    url: url ?? '',
    startLine: 0,
    startColumn: 0,
    endLine: 100,
    endColumn: 0,
    executionContextId: 1,
    hash: 'abc123',
  });

  describe('script storage', () => {
    it('should add and get scripts', () => {
      const script = createScript('script1', 'http://example.com/app.js');
      registry.addScript(script);

      expect(registry.getScript('script1')).toEqual(script);
    });

    it('should return undefined for unknown scripts', () => {
      expect(registry.getScript('unknown')).toBeUndefined();
    });

    it('should get all scripts', () => {
      registry.addScript(createScript('script1', 'app.js'));
      registry.addScript(createScript('script2', 'lib.js'));
      registry.addScript(createScript('script3'));

      expect(registry.getAllScripts()).toHaveLength(3);
    });

    it('should track script count', () => {
      expect(registry.getScriptCount()).toBe(0);

      registry.addScript(createScript('script1'));
      expect(registry.getScriptCount()).toBe(1);

      registry.addScript(createScript('script2'));
      expect(registry.getScriptCount()).toBe(2);
    });
  });

  describe('URL indexing', () => {
    it('should get scripts by URL', () => {
      registry.addScript(createScript('script1', 'http://example.com/app.js'));
      registry.addScript(createScript('script2', 'http://example.com/app.js'));
      registry.addScript(createScript('script3', 'http://example.com/lib.js'));

      const scripts = registry.getScriptsByUrl('http://example.com/app.js');
      expect(scripts).toHaveLength(2);
    });

    it('should return empty array for unknown URL', () => {
      expect(registry.getScriptsByUrl('unknown.js')).toHaveLength(0);
    });
  });

  describe('URL pattern matching', () => {
    beforeEach(() => {
      registry.addScript(createScript('s1', 'http://example.com/src/app.js'));
      registry.addScript(createScript('s2', 'http://example.com/src/lib.js'));
      registry.addScript(createScript('s3', 'http://example.com/vendor/react.js'));
      registry.addScript(createScript('s4', 'http://cdn.com/jquery.min.js'));
    });

    it('should find scripts by glob pattern', () => {
      const scripts = registry.findScriptsByUrlPattern('*example.com*');
      expect(scripts).toHaveLength(3);
    });

    it('should find scripts by regex pattern', () => {
      const scripts = registry.findScriptsByUrlPattern('/.*\\.min\\.js$/');
      expect(scripts).toHaveLength(1);
      expect(scripts[0].url).toContain('jquery.min.js');
    });

    it('should match exact URL', () => {
      const scripts = registry.findScriptsByUrlPattern('http://example.com/src/app.js');
      expect(scripts).toHaveLength(1);
    });

    it('should check URL match', () => {
      expect(registry.matchesUrl('http://example.com/app.js', '*example.com*')).toBe(true);
      expect(registry.matchesUrl('http://other.com/app.js', '*example.com*')).toBe(false);
    });
  });

  describe('source caching', () => {
    it('should store and retrieve source', () => {
      registry.addScript(createScript('script1'));
      registry.setSource('script1', 'console.log("hello");');

      expect(registry.getSource('script1')).toBe('console.log("hello");');
      expect(registry.hasSource('script1')).toBe(true);
    });

    it('should return undefined for uncached source', () => {
      expect(registry.getSource('unknown')).toBeUndefined();
      expect(registry.hasSource('unknown')).toBe(false);
    });
  });

  describe('location finding', () => {
    it('should find script for location', () => {
      const script: ScriptInfo = {
        scriptId: 'script1',
        url: 'http://example.com/app.js',
        startLine: 0,
        startColumn: 0,
        endLine: 100,
        endColumn: 0,
        executionContextId: 1,
        hash: 'abc123',
      };
      registry.addScript(script);

      const found = registry.findScriptForLocation('http://example.com/app.js', 50);
      expect(found?.scriptId).toBe('script1');
    });

    it('should return first script when line is out of range', () => {
      registry.addScript(createScript('script1', 'http://example.com/app.js'));

      const found = registry.findScriptForLocation('http://example.com/app.js', 999);
      expect(found?.scriptId).toBe('script1');
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      registry.addScript(createScript('script1', 'app.js'));
      registry.setSource('script1', 'code');

      registry.clear();

      expect(registry.getScriptCount()).toBe(0);
      expect(registry.getSource('script1')).toBeUndefined();
    });
  });

  describe('summary', () => {
    it('should return accurate summary', () => {
      registry.addScript({ ...createScript('s1', 'app.js'), isModule: true });
      registry.addScript({ ...createScript('s2', 'lib.js'), isModule: false });
      registry.addScript(createScript('s3')); // no URL, inline

      const summary = registry.getSummary();
      expect(summary.total).toBe(3);
      expect(summary.withUrl).toBe(2);
      expect(summary.modules).toBe(1);
    });
  });
});
