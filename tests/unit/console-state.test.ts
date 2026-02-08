import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleState } from '../../src/state/ConsoleState.js';
import type { RemoteObject } from '../../src/utils/types.js';

describe('ConsoleState', () => {
  let state: ConsoleState;

  beforeEach(() => {
    state = new ConsoleState();
    state.setEnabled(true);
  });

  describe('console API calls', () => {
    it('should collect console.log messages', () => {
      const args: RemoteObject[] = [
        { type: 'string', value: 'Hello' },
        { type: 'string', value: 'World' },
      ];

      const msg = state.onConsoleAPICalled({
        type: 'log',
        args,
        executionContextId: 1,
        timestamp: Date.now(),
      });

      expect(msg.type).toBe('log');
      expect(msg.level).toBe('log');
      expect(msg.text).toBe('Hello World');
    });

    it('should handle different console types', () => {
      const args: RemoteObject[] = [{ type: 'string', value: 'test' }];

      state.onConsoleAPICalled({ type: 'error', args, executionContextId: 1, timestamp: Date.now() });
      state.onConsoleAPICalled({ type: 'warn', args, executionContextId: 1, timestamp: Date.now() });
      state.onConsoleAPICalled({ type: 'info', args, executionContextId: 1, timestamp: Date.now() });
      state.onConsoleAPICalled({ type: 'debug', args, executionContextId: 1, timestamp: Date.now() });

      const messages = state.getMessages();
      expect(messages[0].level).toBe('error');
      expect(messages[1].level).toBe('warning');
      expect(messages[2].level).toBe('info');
      expect(messages[3].level).toBe('debug');
    });

    it('should handle different argument types', () => {
      const args: RemoteObject[] = [
        { type: 'number', value: 42 },
        { type: 'boolean', value: true },
        { type: 'undefined' },
        { type: 'object', description: '[object Object]' },
      ];

      const msg = state.onConsoleAPICalled({
        type: 'log',
        args,
        executionContextId: 1,
        timestamp: Date.now(),
      });

      expect(msg.text).toBe('42 true undefined [object Object]');
    });

    it('should extract location from stack trace', () => {
      const msg = state.onConsoleAPICalled({
        type: 'log',
        args: [{ type: 'string', value: 'test' }],
        executionContextId: 1,
        timestamp: Date.now(),
        stackTrace: {
          callFrames: [
            {
              functionName: 'testFn',
              scriptId: 'script1',
              url: 'http://example.com/app.js',
              lineNumber: 42,
              columnNumber: 10,
            },
          ],
        },
      });

      expect(msg.url).toBe('http://example.com/app.js');
      expect(msg.line).toBe(42);
      expect(msg.column).toBe(10);
    });
  });

  describe('exceptions', () => {
    it('should collect exceptions', () => {
      const exc = state.onExceptionThrown({
        timestamp: Date.now(),
        exceptionDetails: {
          exceptionId: 1,
          text: 'Uncaught Error: test',
          lineNumber: 10,
          columnNumber: 5,
          scriptId: 'script1',
          url: 'http://example.com/app.js',
        },
      });

      expect(exc.details.text).toBe('Uncaught Error: test');
      expect(state.getExceptions()).toHaveLength(1);
    });
  });

  describe('querying', () => {
    beforeEach(() => {
      state.onConsoleAPICalled({ type: 'log', args: [{ type: 'string', value: 'log1' }], executionContextId: 1, timestamp: 1 });
      state.onConsoleAPICalled({ type: 'error', args: [{ type: 'string', value: 'error1' }], executionContextId: 1, timestamp: 2 });
      state.onConsoleAPICalled({ type: 'warn', args: [{ type: 'string', value: 'warn1' }], executionContextId: 1, timestamp: 3 });
      state.onConsoleAPICalled({ type: 'log', args: [{ type: 'string', value: 'log2' }], executionContextId: 1, timestamp: 4 });
    });

    it('should get all messages', () => {
      expect(state.getMessages()).toHaveLength(4);
    });

    it('should filter by level', () => {
      expect(state.getMessagesByLevel('log')).toHaveLength(2);
      expect(state.getMessagesByLevel('error')).toHaveLength(1);
    });

    it('should filter by type', () => {
      expect(state.getMessagesByType('warn')).toHaveLength(1);
    });

    it('should get errors', () => {
      expect(state.getErrors()).toHaveLength(1);
    });

    it('should get warnings', () => {
      expect(state.getWarnings()).toHaveLength(1);
    });

    it('should count messages', () => {
      expect(state.getMessageCount()).toBe(4);
    });
  });

  describe('limits and clearing', () => {
    it('should limit stored messages', () => {
      state.setMaxMessages(5);

      for (let i = 0; i < 10; i++) {
        state.onConsoleAPICalled({
          type: 'log',
          args: [{ type: 'string', value: `msg${i}` }],
          executionContextId: 1,
          timestamp: i,
        });
      }

      expect(state.getMessageCount()).toBe(5);
    });

    it('should clear all messages', () => {
      state.onConsoleAPICalled({
        type: 'log',
        args: [{ type: 'string', value: 'test' }],
        executionContextId: 1,
        timestamp: Date.now(),
      });
      state.onExceptionThrown({
        timestamp: Date.now(),
        exceptionDetails: { exceptionId: 1, text: 'Error', lineNumber: 0, columnNumber: 0 },
      });

      state.clear();

      expect(state.getMessageCount()).toBe(0);
      expect(state.getExceptionCount()).toBe(0);
    });
  });

  describe('summary', () => {
    it('should provide accurate summary', () => {
      state.onConsoleAPICalled({ type: 'log', args: [{ type: 'string', value: 'log' }], executionContextId: 1, timestamp: 1 });
      state.onConsoleAPICalled({ type: 'error', args: [{ type: 'string', value: 'error' }], executionContextId: 1, timestamp: 2 });
      state.onConsoleAPICalled({ type: 'warn', args: [{ type: 'string', value: 'warn' }], executionContextId: 1, timestamp: 3 });
      state.onExceptionThrown({
        timestamp: Date.now(),
        exceptionDetails: { exceptionId: 1, text: 'Error', lineNumber: 0, columnNumber: 0 },
      });

      const summary = state.getSummary();
      expect(summary.total).toBe(3);
      expect(summary.errors).toBe(1);
      expect(summary.warnings).toBe(1);
      expect(summary.exceptions).toBe(1);
    });
  });
});
