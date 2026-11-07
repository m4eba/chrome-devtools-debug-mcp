import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';
import type { DebugSession } from '../DebugSession.js';
import type { RaiseResult } from '../utils/raise-window.js';

const RAISE_FAILURE_MESSAGES: Record<Extract<RaiseResult, { raised: false }>['reason'], string> = {
  'unsupported-platform': 'Window raise needs Linux/X11 (DISPLAY set); left to Chrome, the window manager may not bring it in front.',
  'xdotool-missing': 'xdotool is not installed; window raise left to Chrome, the window manager may not bring it in front.',
  'no-pid': 'Could not find the local Chrome process (remote Chrome, endpoint without a port, or `ss` unavailable); window raise left to Chrome.',
  'no-window': 'Chrome process has no X11 window (headless, or running natively on Wayland).',
  'ambiguous-window': 'Several Chrome windows and none matched the tab title; window not raised.',
  'activate-failed': 'The window manager did not activate the window.',
};

function describeWindow(window: RaiseResult): { windowRaised: boolean; message: string } {
  return window.raised
    ? { windowRaised: true, message: 'Tab activated and window raised.' }
    : { windowRaised: false, message: `Tab activated. ${RAISE_FAILURE_MESSAGES[window.reason]}` };
}

// Focus is best-effort after create/switch already succeeded, so it never fails the tool.
async function tryFocus(session: DebugSession, targetId: string): Promise<{ windowRaised: boolean; message: string }> {
  try {
    return describeWindow((await session.bringToFront(targetId)).window);
  } catch (e) {
    return { windowRaised: false, message: `Focus failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

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

      return success(formatObject({
        message: 'New target created. Use switch_target to switch to it.',
        targetId: target.targetId,
        title: target.title,
        url: target.url,
        ...(p.focus && { focus: await tryFocus(session, target.targetId) }),
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
      const focus = !p.focus
        ? undefined
        : target.type === 'page'
          ? await tryFocus(session, target.targetId)
          : { windowRaised: false, message: `Not focused: ${target.type} targets have no tab.` };

      return success(formatObject({
        message: 'Switched to target. Debugger/network/etc need to be re-enabled.',
        targetId: target.targetId,
        title: target.title,
        url: target.url,
        ...(focus && { focus }),
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const bringToFront: ToolDefinition = {
  name: 'bring_to_front',
  description:
    'Make a tab the active tab and raise its Chrome window. Defaults to the currently attached target. Reliable window raising needs Linux/X11 with xdotool installed and Chrome on the same machine; otherwise the raise is left to Chrome and the window manager may refuse it. The tab switch inside Chrome always applies. Returns windowRaised and a message explaining any failure.',
  inputSchema: z.object({
    targetId: z.string().optional().describe('Target ID of the page/tab. Defaults to the current target.'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof bringToFront.inputSchema>;
    try {
      const { targetId, window } = await session.bringToFront(p.targetId);
      return success(formatObject({ targetId, ...describeWindow(window) }));
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
