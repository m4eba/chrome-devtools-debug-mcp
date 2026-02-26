import { z } from 'zod';
import type { DebugSession } from '../DebugSession.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (session: DebugSession, params: unknown) => Promise<ToolResult>;
}

export type TextContent = { type: 'text'; text: string };
export type ImageContent = { type: 'image'; data: string; mimeType: string };

export interface ToolResult {
  content: Array<TextContent | ImageContent>;
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

export function image(data: string, mimeType: string): ToolResult {
  return { content: [{ type: 'image', data, mimeType }] };
}
