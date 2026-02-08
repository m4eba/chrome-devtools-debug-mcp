import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';

export const setDOMBreakpoint: ToolDefinition = {
  name: 'set_dom_breakpoint',
  description: 'Set a breakpoint on DOM mutations (subtree changes, attribute changes, or node removal).',
  inputSchema: z.object({
    nodeId: z.number().describe('Node ID from querySelector'),
    type: z.enum(['subtree-modified', 'attribute-modified', 'node-removed']).describe('Type of mutation to break on'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof setDOMBreakpoint.inputSchema>;
    try {
      await session.setDOMBreakpoint(p.nodeId, p.type);
      return success(`DOM breakpoint set on node ${p.nodeId} for ${p.type}`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const removeDOMBreakpoint: ToolDefinition = {
  name: 'remove_dom_breakpoint',
  description: 'Remove a DOM breakpoint.',
  inputSchema: z.object({
    nodeId: z.number().describe('Node ID'),
    type: z.enum(['subtree-modified', 'attribute-modified', 'node-removed']).describe('Type of mutation'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof removeDOMBreakpoint.inputSchema>;
    try {
      await session.removeDOMBreakpoint(p.nodeId, p.type);
      return success(`DOM breakpoint removed`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const setEventBreakpoint: ToolDefinition = {
  name: 'set_event_breakpoint',
  description: 'Break when a specific event is fired (e.g., click, submit, keydown).',
  inputSchema: z.object({
    eventName: z.string().describe('Event name (e.g., click, submit, keydown, mouseover)'),
    targetName: z.string().optional().describe('Optional target name filter'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof setEventBreakpoint.inputSchema>;
    try {
      await session.setEventListenerBreakpoint(p.eventName, p.targetName);
      return success(`Event breakpoint set for "${p.eventName}"`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const removeEventBreakpoint: ToolDefinition = {
  name: 'remove_event_breakpoint',
  description: 'Remove an event breakpoint.',
  inputSchema: z.object({
    eventName: z.string().describe('Event name'),
    targetName: z.string().optional().describe('Target name filter'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof removeEventBreakpoint.inputSchema>;
    try {
      await session.removeEventListenerBreakpoint(p.eventName, p.targetName);
      return success(`Event breakpoint removed`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const setXHRBreakpoint: ToolDefinition = {
  name: 'set_xhr_breakpoint',
  description: 'Break when an XHR/fetch request is made to a URL containing the pattern.',
  inputSchema: z.object({
    url: z.string().describe('URL substring to match'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof setXHRBreakpoint.inputSchema>;
    try {
      await session.setXHRBreakpoint(p.url);
      return success(`XHR breakpoint set for URLs containing "${p.url}"`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const removeXHRBreakpoint: ToolDefinition = {
  name: 'remove_xhr_breakpoint',
  description: 'Remove an XHR breakpoint.',
  inputSchema: z.object({
    url: z.string().describe('URL substring'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof removeXHRBreakpoint.inputSchema>;
    try {
      await session.removeXHRBreakpoint(p.url);
      return success(`XHR breakpoint removed`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getEventListeners: ToolDefinition = {
  name: 'get_event_listeners',
  description: 'Get all event listeners attached to an element.',
  inputSchema: z.object({
    nodeId: z.number().describe('Node ID from querySelector'),
    depth: z.number().optional().describe('Ancestor depth to include. Default: 1'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getEventListeners.inputSchema>;
    try {
      // First resolve the node to get objectId
      const obj = await session.resolveNode(p.nodeId);
      if (!obj.objectId) {
        return error('Could not resolve node to object');
      }

      const listeners = await session.getEventListeners(obj.objectId, p.depth);

      const formatted = listeners.map((l) => ({
        type: l.type,
        useCapture: l.useCapture,
        passive: l.passive,
        once: l.once,
        scriptId: l.scriptId,
        lineNumber: l.lineNumber,
        columnNumber: l.columnNumber,
      }));

      return success(formatObject({
        count: formatted.length,
        listeners: formatted,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const domDebuggerTools: ToolDefinition[] = [
  setDOMBreakpoint,
  removeDOMBreakpoint,
  setEventBreakpoint,
  removeEventBreakpoint,
  setXHRBreakpoint,
  removeXHRBreakpoint,
  getEventListeners,
];
