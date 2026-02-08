import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';

export const debuggerEnable: ToolDefinition = {
  name: 'debugger_enable',
  description: 'Enable the debugger. Must be called before setting breakpoints or stepping.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.enableDebugger();
      await session.enableRuntime();
      return success(formatObject({
        status: 'enabled',
        message: 'Debugger and Runtime enabled. Scripts will be collected as they are parsed.',
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const debuggerDisable: ToolDefinition = {
  name: 'debugger_disable',
  description: 'Disable the debugger. Removes all breakpoints.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.disableDebugger();
      return success('Debugger disabled');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const setBreakpoint: ToolDefinition = {
  name: 'set_breakpoint',
  description: 'Set a breakpoint by URL pattern and line number. Works even before script is loaded.',
  inputSchema: z.object({
    lineNumber: z.number().describe('Line number (0-based)'),
    url: z.string().optional().describe('Exact URL of the script'),
    urlRegex: z.string().optional().describe('Regex pattern to match script URL'),
    columnNumber: z.number().optional().describe('Column number (0-based)'),
    condition: z.string().optional().describe('Breakpoint condition expression'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof setBreakpoint.inputSchema>;
    try {
      if (!p.url && !p.urlRegex) {
        return error('Either url or urlRegex must be specified');
      }
      const result = await session.setBreakpointByUrl(
        p.lineNumber,
        p.url,
        p.urlRegex,
        p.columnNumber,
        p.condition
      );
      return success(formatObject({
        breakpointId: result.breakpointId,
        locations: result.locations,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const setBreakpointById: ToolDefinition = {
  name: 'set_breakpoint_by_id',
  description: 'Set a breakpoint at a specific location in a loaded script.',
  inputSchema: z.object({
    scriptId: z.string().describe('Script ID from list_scripts or scriptParsed event'),
    lineNumber: z.number().describe('Line number (0-based)'),
    columnNumber: z.number().optional().describe('Column number (0-based)'),
    condition: z.string().optional().describe('Breakpoint condition expression'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof setBreakpointById.inputSchema>;
    try {
      const result = await session.setBreakpoint(
        { scriptId: p.scriptId, lineNumber: p.lineNumber, columnNumber: p.columnNumber },
        p.condition
      );
      return success(formatObject({
        breakpointId: result.breakpointId,
        actualLocation: result.actualLocation,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const removeBreakpoint: ToolDefinition = {
  name: 'remove_breakpoint',
  description: 'Remove a breakpoint by its ID.',
  inputSchema: z.object({
    breakpointId: z.string().describe('Breakpoint ID'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof removeBreakpoint.inputSchema>;
    try {
      await session.removeBreakpoint(p.breakpointId);
      return success(`Breakpoint ${p.breakpointId} removed`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const listBreakpoints: ToolDefinition = {
  name: 'list_breakpoints',
  description: 'List all active breakpoints.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      const breakpoints = session.debugState.getAllBreakpoints();
      return success(formatObject(breakpoints));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const pause: ToolDefinition = {
  name: 'pause',
  description: 'Pause JavaScript execution.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.pause();
      return success('Pause requested. Execution will pause at next statement.');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const resume: ToolDefinition = {
  name: 'resume',
  description: 'Resume JavaScript execution.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.resume();
      return success('Execution resumed');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const stepOver: ToolDefinition = {
  name: 'step_over',
  description: 'Step to the next line, stepping over function calls.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      if (!session.debugState.isPaused()) {
        return error('Not paused. Use pause first or wait for a breakpoint.');
      }
      await session.stepOver();
      return success('Stepped over');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const stepInto: ToolDefinition = {
  name: 'step_into',
  description: 'Step into a function call.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      if (!session.debugState.isPaused()) {
        return error('Not paused. Use pause first or wait for a breakpoint.');
      }
      await session.stepInto();
      return success('Stepped into');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const stepOut: ToolDefinition = {
  name: 'step_out',
  description: 'Step out of the current function.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      if (!session.debugState.isPaused()) {
        return error('Not paused. Use pause first or wait for a breakpoint.');
      }
      await session.stepOut();
      return success('Stepped out');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getCallFrames: ToolDefinition = {
  name: 'get_call_frames',
  description: 'Get the current call stack when paused.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      const pauseState = session.debugState.getPauseState();
      if (!pauseState.isPaused) {
        return error('Not paused');
      }
      return success(formatObject({
        reason: pauseState.reason,
        hitBreakpoints: pauseState.hitBreakpoints,
        callFrames: pauseState.callFrames?.map((f) => ({
          callFrameId: f.callFrameId,
          functionName: f.functionName || '(anonymous)',
          url: f.url,
          location: f.location,
          scopeCount: f.scopeChain.length,
        })),
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getScopeVariables: ToolDefinition = {
  name: 'get_scope_variables',
  description: 'Get variables in a scope of a call frame.',
  inputSchema: z.object({
    callFrameIndex: z.number().optional().describe('Call frame index (0 = top). Default: 0'),
    scopeIndex: z.number().optional().describe('Scope index in the scope chain. Default: 0 (local scope)'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getScopeVariables.inputSchema>;
    try {
      if (!session.debugState.isPaused()) {
        return error('Not paused');
      }

      const frame = session.debugState.getCallFrame(p.callFrameIndex ?? 0);
      if (!frame) {
        return error('Call frame not found');
      }

      const scope = frame.scopeChain[p.scopeIndex ?? 0];
      if (!scope) {
        return error('Scope not found');
      }

      if (!scope.object.objectId) {
        return success(formatObject({
          scopeType: scope.type,
          variables: [],
        }));
      }

      const props = await session.getProperties(scope.object.objectId);
      const variables = props.result.map((p) => ({
        name: p.name,
        type: p.value?.type,
        subtype: p.value?.subtype,
        value: p.value?.value ?? p.value?.description,
      }));

      return success(formatObject({
        scopeType: scope.type,
        scopeName: scope.name,
        variables,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const evaluateOnFrame: ToolDefinition = {
  name: 'evaluate_on_frame',
  description: 'Evaluate an expression in the context of a call frame.',
  inputSchema: z.object({
    expression: z.string().describe('JavaScript expression to evaluate'),
    callFrameIndex: z.number().optional().describe('Call frame index (0 = top). Default: 0'),
    returnByValue: z.boolean().optional().describe('Return result by value (for serializable results). Default: false'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof evaluateOnFrame.inputSchema>;
    try {
      if (!session.debugState.isPaused()) {
        return error('Not paused. Cannot evaluate on frame when not paused.');
      }

      const frame = session.debugState.getCallFrame(p.callFrameIndex ?? 0);
      if (!frame) {
        return error('Call frame not found');
      }

      const result = await session.evaluateOnCallFrame(frame.callFrameId, p.expression, {
        returnByValue: p.returnByValue,
      });

      if (result.paused) {
        return success(formatObject({
          paused: true,
          pauseReason: result.pauseReason,
          callFrameCount: result.callFrames?.length ?? 0,
          message: 'Expression triggered another breakpoint.',
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

export const setPauseOnExceptions: ToolDefinition = {
  name: 'set_pause_on_exceptions',
  description: 'Configure when to pause on exceptions.',
  inputSchema: z.object({
    state: z.enum(['none', 'uncaught', 'all']).describe('When to pause: none, uncaught, or all exceptions'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof setPauseOnExceptions.inputSchema>;
    try {
      await session.setPauseOnExceptions(p.state);
      return success(`Pause on exceptions set to: ${p.state}`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const setAsyncStackTraceDepth: ToolDefinition = {
  name: 'set_async_stack_depth',
  description: 'Set maximum depth of async call stacks.',
  inputSchema: z.object({
    maxDepth: z.number().describe('Maximum async stack trace depth. 0 to disable.'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof setAsyncStackTraceDepth.inputSchema>;
    try {
      await session.setAsyncCallStackDepth(p.maxDepth);
      return success(`Async stack trace depth set to: ${p.maxDepth}`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const listScripts: ToolDefinition = {
  name: 'list_scripts',
  description: 'List all parsed scripts.',
  inputSchema: z.object({
    urlPattern: z.string().optional().describe('Filter scripts by URL pattern'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof listScripts.inputSchema>;
    try {
      let scripts = session.scriptRegistry.getAllScripts();
      if (p.urlPattern) {
        scripts = session.scriptRegistry.findScriptsByUrlPattern(p.urlPattern);
      }

      const formatted = scripts.map((s) => ({
        scriptId: s.scriptId,
        url: s.url || '(inline)',
        startLine: s.startLine,
        endLine: s.endLine,
        isModule: s.isModule,
        hasSourceMap: !!s.sourceMapURL,
      }));

      return success(formatObject({
        count: formatted.length,
        scripts: formatted,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getScriptSource: ToolDefinition = {
  name: 'get_script_source',
  description: 'Get the source code of a script.',
  inputSchema: z.object({
    scriptId: z.string().describe('Script ID'),
    startLine: z.number().optional().describe('Starting line to return (0-based)'),
    endLine: z.number().optional().describe('Ending line to return (exclusive)'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getScriptSource.inputSchema>;
    try {
      let source = await session.getScriptSource(p.scriptId);

      if (p.startLine !== undefined || p.endLine !== undefined) {
        const lines = source.split('\n');
        const start = p.startLine ?? 0;
        const end = p.endLine ?? lines.length;
        source = lines.slice(start, end).join('\n');
      }

      return success(source);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getPauseState: ToolDefinition = {
  name: 'get_pause_state',
  description: 'Get current pause state of the debugger.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      const state = session.debugState.getPauseState();
      return success(formatObject({
        isPaused: state.isPaused,
        reason: state.reason,
        callFrameCount: state.callFrames?.length ?? 0,
        hitBreakpoints: state.hitBreakpoints,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const debuggerTools: ToolDefinition[] = [
  debuggerEnable,
  debuggerDisable,
  setBreakpoint,
  setBreakpointById,
  removeBreakpoint,
  listBreakpoints,
  pause,
  resume,
  stepOver,
  stepInto,
  stepOut,
  getCallFrames,
  getScopeVariables,
  evaluateOnFrame,
  setPauseOnExceptions,
  setAsyncStackTraceDepth,
  listScripts,
  getScriptSource,
  getPauseState,
];
