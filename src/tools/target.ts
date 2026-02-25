import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';

export const createTarget: ToolDefinition = {
  name: 'create_target',
  description: 'Create a new target (page/tab) in the browser. Does not switch to it automatically.',
  inputSchema: z.object({
    url: z.string().optional().describe('URL to navigate to. Defaults to about:blank'),
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
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof switchTarget.inputSchema>;
    try {
      const target = await session.switchTarget(p.targetId);

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

export const targetTools: ToolDefinition[] = [
  createTarget,
  switchTarget,
  closeTarget,
];
