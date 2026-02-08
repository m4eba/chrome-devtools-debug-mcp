import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';

export const logEnable: ToolDefinition = {
  name: 'log_enable',
  description: 'Enable browser log collection (errors, warnings from browser).',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.enableLog();
      return success('Log collection enabled');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const logDisable: ToolDefinition = {
  name: 'log_disable',
  description: 'Disable browser log collection.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.disableLog();
      return success('Log collection disabled');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getLogEntries: ToolDefinition = {
  name: 'get_log_entries',
  description: 'Get collected browser log entries.',
  inputSchema: z.object({
    level: z.enum(['verbose', 'info', 'warning', 'error']).optional().describe('Filter by log level'),
    source: z.string().optional().describe('Filter by source (javascript, network, security, etc.)'),
    limit: z.number().optional().describe('Maximum number of entries to return'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getLogEntries.inputSchema>;
    try {
      let entries = session.getLogEntries();

      if (p.level) {
        entries = entries.filter((e) => e.level === p.level);
      }

      if (p.source) {
        entries = entries.filter((e) => e.source === p.source);
      }

      if (p.limit) {
        entries = entries.slice(-p.limit);
      }

      return success(formatObject({
        count: entries.length,
        entries: entries.map((e) => ({
          level: e.level,
          source: e.source,
          text: e.text,
          url: e.url,
          lineNumber: e.lineNumber,
          timestamp: e.timestamp,
        })),
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const clearLog: ToolDefinition = {
  name: 'clear_log',
  description: 'Clear collected log entries.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.clearLog();
      return success('Log cleared');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const logTools: ToolDefinition[] = [
  logEnable,
  logDisable,
  getLogEntries,
  clearLog,
];
