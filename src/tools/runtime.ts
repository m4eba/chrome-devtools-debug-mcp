import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';

export const evaluate: ToolDefinition = {
  name: 'evaluate',
  description: 'Evaluate JavaScript expression in the page context. Returns breakpoint info if execution triggers a breakpoint.',
  inputSchema: z.object({
    expression: z.string().describe('JavaScript expression to evaluate'),
    returnByValue: z.boolean().optional().describe('Return result by value. Default: false'),
    awaitPromise: z.boolean().optional().describe('Wait for promise to resolve. Default: false'),
    timeout: z.number().optional().describe('Timeout in milliseconds. Default: 5000'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof evaluate.inputSchema>;
    try {
      const result = await session.evaluate(p.expression, {
        returnByValue: p.returnByValue,
        awaitPromise: p.awaitPromise,
        timeout: p.timeout ?? 5000,
      });

      // Check if breakpoint was hit
      if (result.paused) {
        return success(formatObject({
          paused: true,
          pauseReason: result.pauseReason,
          callFrameCount: result.callFrames?.length ?? 0,
          topFrame: result.callFrames?.[0] ? {
            functionName: result.callFrames[0].functionName,
            url: result.callFrames[0].url,
            lineNumber: result.callFrames[0].location.lineNumber,
          } : undefined,
          message: 'Execution paused at breakpoint. Use get_call_frames, get_scope_variables, step_over, resume, etc. to debug.',
        }));
      }

      if (result.exceptionDetails) {
        return success(formatObject({
          exception: true,
          details: result.exceptionDetails,
        }));
      }

      return success(formatObject({
        type: result.result.type,
        subtype: result.result.subtype,
        value: result.result.value ?? result.result.description,
        objectId: result.result.objectId,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getProperties: ToolDefinition = {
  name: 'get_properties',
  description: 'Get properties of an object by its objectId.',
  inputSchema: z.object({
    objectId: z.string().describe('Object ID from evaluate or other result'),
    ownProperties: z.boolean().optional().describe('Only own properties. Default: true'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getProperties.inputSchema>;
    try {
      const result = await session.getProperties(p.objectId, {
        ownProperties: p.ownProperties ?? true,
      });

      const properties = result.result.map((prop) => ({
        name: prop.name,
        type: prop.value?.type,
        subtype: prop.value?.subtype,
        value: prop.value?.value ?? prop.value?.description,
        objectId: prop.value?.objectId,
        writable: prop.writable,
        enumerable: prop.enumerable,
      }));

      return success(formatObject(properties));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const releaseObject: ToolDefinition = {
  name: 'release_object',
  description: 'Release an object reference to free memory.',
  inputSchema: z.object({
    objectId: z.string().describe('Object ID to release'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof releaseObject.inputSchema>;
    try {
      await session.releaseObject(p.objectId);
      return success('Object released');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getConsoleMessages: ToolDefinition = {
  name: 'get_console_messages',
  description: 'Get collected console messages (console.log, console.error, etc.).',
  inputSchema: z.object({
    level: z.enum(['log', 'error', 'warning', 'info', 'debug']).optional().describe('Filter by log level'),
    limit: z.number().optional().describe('Maximum number of messages to return'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getConsoleMessages.inputSchema>;
    try {
      let messages = session.consoleState.getMessages();

      if (p.level) {
        messages = messages.filter((m) => m.level === p.level);
      }

      if (p.limit) {
        messages = messages.slice(-p.limit);
      }

      return success(formatObject({
        count: messages.length,
        messages: messages.map((m) => ({
          id: m.id,
          type: m.type,
          level: m.level,
          text: m.text,
          url: m.url,
          line: m.line,
          timestamp: m.timestamp,
        })),
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getExceptions: ToolDefinition = {
  name: 'get_exceptions',
  description: 'Get collected runtime exceptions.',
  inputSchema: z.object({
    limit: z.number().optional().describe('Maximum number of exceptions to return'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getExceptions.inputSchema>;
    try {
      let exceptions = session.consoleState.getExceptions();

      if (p.limit) {
        exceptions = exceptions.slice(-p.limit);
      }

      return success(formatObject({
        count: exceptions.length,
        exceptions: exceptions.map((e) => ({
          id: e.id,
          timestamp: e.timestamp,
          text: e.details.text,
          lineNumber: e.details.lineNumber,
          columnNumber: e.details.columnNumber,
          url: e.details.url,
          scriptId: e.details.scriptId,
        })),
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const clearConsole: ToolDefinition = {
  name: 'clear_console',
  description: 'Clear collected console messages and exceptions.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      session.consoleState.clear();
      return success('Console cleared');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const runtimeTools: ToolDefinition[] = [
  evaluate,
  getProperties,
  releaseObject,
  getConsoleMessages,
  getExceptions,
  clearConsole,
];
