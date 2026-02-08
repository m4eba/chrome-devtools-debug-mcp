import { describe, it, expect, beforeEach } from 'vitest';
import { DebugState } from '../../src/state/DebugState.js';
import type { CallFrame, Location } from '../../src/utils/types.js';

describe('DebugState', () => {
  let state: DebugState;

  beforeEach(() => {
    state = new DebugState();
  });

  describe('pause state', () => {
    it('should start not paused', () => {
      expect(state.isPaused()).toBe(false);
    });

    it('should track paused state', () => {
      const callFrames: CallFrame[] = [
        {
          callFrameId: 'frame1',
          functionName: 'testFunction',
          location: { scriptId: 'script1', lineNumber: 10 },
          url: 'test.js',
          scopeChain: [],
          this: { type: 'undefined' },
        },
      ];

      state.setPaused('breakpoint', callFrames, { breakpointId: 'bp1' });

      expect(state.isPaused()).toBe(true);
      expect(state.getPauseState().reason).toBe('breakpoint');
      expect(state.getCallFrames()).toHaveLength(1);
      expect(state.getTopCallFrame()?.functionName).toBe('testFunction');
    });

    it('should clear pause state on resume', () => {
      const callFrames: CallFrame[] = [
        {
          callFrameId: 'frame1',
          functionName: 'test',
          location: { scriptId: 'script1', lineNumber: 10 },
          url: 'test.js',
          scopeChain: [],
          this: { type: 'undefined' },
        },
      ];

      state.setPaused('breakpoint', callFrames);
      state.setResumed();

      expect(state.isPaused()).toBe(false);
      expect(state.getCallFrames()).toHaveLength(0);
    });

    it('should get call frame by index', () => {
      const callFrames: CallFrame[] = [
        {
          callFrameId: 'frame1',
          functionName: 'top',
          location: { scriptId: 'script1', lineNumber: 10 },
          url: 'test.js',
          scopeChain: [],
          this: { type: 'undefined' },
        },
        {
          callFrameId: 'frame2',
          functionName: 'bottom',
          location: { scriptId: 'script1', lineNumber: 5 },
          url: 'test.js',
          scopeChain: [],
          this: { type: 'undefined' },
        },
      ];

      state.setPaused('breakpoint', callFrames);

      expect(state.getCallFrame(0)?.functionName).toBe('top');
      expect(state.getCallFrame(1)?.functionName).toBe('bottom');
      expect(state.getCallFrame(2)).toBeUndefined();
    });
  });

  describe('breakpoint management', () => {
    it('should add breakpoints', () => {
      state.addBreakpoint({
        id: 'bp1',
        url: 'test.js',
        lineNumber: 10,
        locations: [{ scriptId: 'script1', lineNumber: 10 }],
        enabled: true,
      });

      expect(state.getAllBreakpoints()).toHaveLength(1);
      expect(state.getBreakpoint('bp1')?.url).toBe('test.js');
    });

    it('should remove breakpoints', () => {
      state.addBreakpoint({
        id: 'bp1',
        url: 'test.js',
        lineNumber: 10,
        locations: [],
        enabled: true,
      });

      const removed = state.removeBreakpoint('bp1');
      expect(removed).toBe(true);
      expect(state.getAllBreakpoints()).toHaveLength(0);
    });

    it('should return false when removing non-existent breakpoint', () => {
      const removed = state.removeBreakpoint('nonexistent');
      expect(removed).toBe(false);
    });

    it('should update breakpoint locations', () => {
      state.addBreakpoint({
        id: 'bp1',
        url: 'test.js',
        lineNumber: 10,
        locations: [],
        enabled: true,
      });

      const newLocations: Location[] = [{ scriptId: 'script1', lineNumber: 10, columnNumber: 5 }];
      state.updateBreakpointLocations('bp1', newLocations);

      expect(state.getBreakpoint('bp1')?.locations).toEqual(newLocations);
    });

    it('should find breakpoint by location', () => {
      state.addBreakpoint({
        id: 'bp1',
        url: 'test.js',
        lineNumber: 10,
        locations: [{ scriptId: 'script1', lineNumber: 10 }],
        enabled: true,
      });

      const found = state.findBreakpointByLocation('script1', 10);
      expect(found?.id).toBe('bp1');
    });

    it('should clear all breakpoints', () => {
      state.addBreakpoint({
        id: 'bp1',
        url: 'test.js',
        lineNumber: 10,
        locations: [],
        enabled: true,
      });
      state.addBreakpoint({
        id: 'bp2',
        url: 'test.js',
        lineNumber: 20,
        locations: [],
        enabled: true,
      });

      state.clearBreakpoints();
      expect(state.getAllBreakpoints()).toHaveLength(0);
    });
  });

  describe('exception handling', () => {
    it('should set and get pause on exceptions state', () => {
      expect(state.getPauseOnExceptions()).toBe('none');

      state.setPauseOnExceptions('all');
      expect(state.getPauseOnExceptions()).toBe('all');

      state.setPauseOnExceptions('uncaught');
      expect(state.getPauseOnExceptions()).toBe('uncaught');
    });
  });

  describe('enable state', () => {
    it('should track enabled state', () => {
      expect(state.isEnabled()).toBe(false);

      state.setEnabled(true);
      expect(state.isEnabled()).toBe(true);

      state.setEnabled(false);
      expect(state.isEnabled()).toBe(false);
    });

    it('should reset state when disabled', () => {
      state.addBreakpoint({
        id: 'bp1',
        url: 'test.js',
        lineNumber: 10,
        locations: [],
        enabled: true,
      });

      const callFrames: CallFrame[] = [
        {
          callFrameId: 'frame1',
          functionName: 'test',
          location: { scriptId: 'script1', lineNumber: 10 },
          url: 'test.js',
          scopeChain: [],
          this: { type: 'undefined' },
        },
      ];
      state.setPaused('breakpoint', callFrames);

      state.setEnabled(false);

      expect(state.getAllBreakpoints()).toHaveLength(0);
      expect(state.isPaused()).toBe(false);
    });
  });

  describe('async stack trace depth', () => {
    it('should set and get async stack trace depth', () => {
      expect(state.getAsyncStackTraceDepth()).toBe(0);

      state.setAsyncStackTraceDepth(10);
      expect(state.getAsyncStackTraceDepth()).toBe(10);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      state.setEnabled(true);
      state.addBreakpoint({
        id: 'bp1',
        url: 'test.js',
        lineNumber: 10,
        locations: [],
        enabled: true,
      });

      const json = state.toJSON();
      expect(json).toEqual({
        enabled: true,
        isPaused: false,
        pauseReason: undefined,
        callFrameCount: 0,
        breakpointCount: 1,
        pauseOnExceptions: 'none',
        asyncStackTraceDepth: 0,
      });
    });
  });
});
