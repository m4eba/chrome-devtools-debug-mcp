import { z } from 'zod';
import type { DebugSession } from '../DebugSession.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (session: DebugSession, params: unknown) => Promise<ToolResult>;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export function success(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function error(message: string): ToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

export function formatObject(obj: unknown, indent = 2): string {
  return JSON.stringify(obj, null, indent);
}
