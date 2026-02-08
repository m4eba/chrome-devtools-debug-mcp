import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';
import { launchChrome, findChrome, getTargets, getVersion } from '../chrome-launcher.js';
import type { DebugSession } from '../DebugSession.js';

export const startChrome: ToolDefinition = {
  name: 'start_chrome',
  description: 'Launch Chrome browser with debugging enabled. Returns WebSocket endpoint URL.',
  inputSchema: z.object({
    chromePath: z.string().optional().describe('Path to Chrome executable. Auto-detected if not specified.'),
    headless: z.boolean().optional().describe('Run in headless mode. Default: false'),
    port: z.number().optional().describe('Debug port. Default: 9222'),
    userDataDir: z.string().optional().describe('User data directory. Uses temp dir if not specified.'),
    args: z.array(z.string()).optional().describe('Additional Chrome arguments'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof startChrome.inputSchema>;
    try {
      const result = await session.launch({
        chromePath: p.chromePath,
        headless: p.headless,
        port: p.port,
        userDataDir: p.userDataDir,
        args: p.args,
      });

      return success(formatObject({
        status: 'launched',
        wsEndpoint: result.wsEndpoint,
        port: result.port,
        message: 'Chrome launched and connected. Use debugger_enable to start debugging.',
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const stopChrome: ToolDefinition = {
  name: 'stop_chrome',
  description: 'Stop the Chrome browser process that was started with start_chrome.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.kill();
      return success('Chrome stopped');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const connect: ToolDefinition = {
  name: 'connect',
  description: 'Connect to an existing Chrome instance running with --remote-debugging-port.',
  inputSchema: z.object({
    url: z.string().describe('HTTP URL (e.g., http://localhost:9222) or WebSocket URL'),
    targetId: z.string().optional().describe('Specific target ID to connect to. Connects to first page if not specified.'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof connect.inputSchema>;
    try {
      if (p.url.startsWith('ws://') || p.url.startsWith('wss://')) {
        await session.connect(p.url);
        return success(formatObject({
          status: 'connected',
          wsUrl: p.url,
        }));
      } else {
        const target = await session.connectToTarget(p.url, p.targetId);
        return success(formatObject({
          status: 'connected',
          target,
        }));
      }
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const disconnect: ToolDefinition = {
  name: 'disconnect',
  description: 'Disconnect from Chrome without stopping the browser.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.disconnect();
      return success('Disconnected');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const listTargets: ToolDefinition = {
  name: 'list_targets',
  description: 'List available debug targets (pages, workers, etc.).',
  inputSchema: z.object({
    url: z.string().describe('HTTP URL of Chrome debug endpoint (e.g., http://localhost:9222)'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof listTargets.inputSchema>;
    try {
      const targets = await session.listTargets(p.url);
      return success(formatObject(targets));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getVersionInfo: ToolDefinition = {
  name: 'get_version',
  description: 'Get Chrome version and protocol version.',
  inputSchema: z.object({
    url: z.string().describe('HTTP URL of Chrome debug endpoint (e.g., http://localhost:9222)'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getVersionInfo.inputSchema>;
    try {
      const version = await session.getVersion(p.url);
      return success(formatObject(version));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const navigate: ToolDefinition = {
  name: 'navigate',
  description: 'Navigate the page to a URL.',
  inputSchema: z.object({
    url: z.string().describe('URL to navigate to'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof navigate.inputSchema>;
    try {
      const result = await session.navigate(p.url);
      if (result.errorText) {
        return error(`Navigation failed: ${result.errorText}`);
      }
      return success(formatObject({
        status: 'navigated',
        frameId: result.frameId,
        loaderId: result.loaderId,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const reload: ToolDefinition = {
  name: 'reload',
  description: 'Reload the current page.',
  inputSchema: z.object({
    ignoreCache: z.boolean().optional().describe('Ignore cache when reloading. Default: false'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof reload.inputSchema>;
    try {
      await session.reload(p.ignoreCache);
      return success('Page reloaded');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const launchTools: ToolDefinition[] = [
  startChrome,
  stopChrome,
  connect,
  disconnect,
  listTargets,
  getVersionInfo,
  navigate,
  reload,
];
