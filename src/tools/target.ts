import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';

export const createTarget: ToolDefinition = {
  name: 'create_target',
  description: 'Create a new target (page/tab) in the browser. Does not switch to it automatically.',
  inputSchema: z.object({
    url: z.string().optional().describe('URL to navigate to. Defaults to about:blank'),
    focus: z.boolean().optional().describe('Bring the new tab to the front. Default: false'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof createTarget.inputSchema>;
    try {
      const target = await session.createTarget(p.url ?? 'about:blank');
      if (p.focus) {
        await session.bringToFront(target.targetId);
      }

      return success(formatObject({
        message: 'New target created. Use switch_target to switch to it.',
        targetId: target.targetId,
        title: target.title,
        url: target.url,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const switchTarget: ToolDefinition = {
  name: 'switch_target',
  description: 'Switch to a different target (page/tab) by its ID. Use list_targets to see available targets.',
  inputSchema: z.object({
    targetId: z.string().describe('Target ID of the page/tab to switch to'),
    focus: z.boolean().optional().describe('Bring the tab to the front. Default: false'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof switchTarget.inputSchema>;
    try {
      const target = await session.switchTarget(p.targetId);
      if (p.focus) {
        await session.bringToFront(target.targetId);
      }

      return success(formatObject({
        message: 'Switched to target. Debugger/network/etc need to be re-enabled.',
        targetId: target.targetId,
        title: target.title,
        url: target.url,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const bringToFront: ToolDefinition = {
  name: 'bring_to_front',
  description:
    'Make a tab the active tab and raise its Chrome window. Defaults to the currently attached target. On Linux/X11 the window is raised via xdotool; elsewhere the window manager may refuse the raise, but the tab switch inside Chrome still applies.',
  inputSchema: z.object({
    targetId: z.string().optional().describe('Target ID of the page/tab. Defaults to the current target.'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof bringToFront.inputSchema>;
    try {
      const result = await session.bringToFront(p.targetId);
      return success(formatObject({
        ...result,
        message: result.windowRaised
          ? 'Tab activated and window raised.'
          : 'Tab activated. Window raise left to Chrome (xdotool unavailable or not Linux/X11); the window manager may not bring it in front.',
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const closeTarget: ToolDefinition = {
  name: 'close_target',
  description: 'Close a target (page/tab) by its ID. Cannot close the currently attached target.',
  inputSchema: z.object({
    targetId: z.string().describe('Target ID of the page/tab to close'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof closeTarget.inputSchema>;
    try {
      const currentId = session.getCurrentTargetId();
      if (p.targetId === currentId) {
        return error('Cannot close the currently attached target. Switch to another target first.');
      }

      const closed = await session.closeTarget(p.targetId);
      if (!closed) {
        return error('Failed to close target');
      }

      return success(`Target ${p.targetId} closed`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const listAttachedSessions: ToolDefinition = {
  name: 'list_attached_sessions',
  description:
    'List every target this DebugSession is currently attached to (root page + auto-attached workers, service workers, iframes). Use the targetId in network tools to scope results.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      const sessions = session.getAttachedSessions();
      return success(formatObject({
        count: sessions.length,
        sessions: sessions.map((s) => ({
          targetId: s.targetId,
          type: s.type,
          url: s.url,
          title: s.title,
          isRoot: s.sessionId === null,
        })),
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const targetTools: ToolDefinition[] = [
  createTarget,
  switchTarget,
  bringToFront,
  closeTarget,
  listAttachedSessions,
];
