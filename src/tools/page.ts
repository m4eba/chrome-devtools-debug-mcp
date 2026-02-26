import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject, image } from './types.js';

const ONE_MB = 1024 * 1024;

export const navigate: ToolDefinition = {
  name: 'navigate',
  description: 'Navigate the current page to a URL.',
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

export const addScriptOnNewDocument: ToolDefinition = {
  name: 'add_script_on_new_document',
  description: 'Add a script to be evaluated on every new document before any other scripts. Useful for injecting polyfills or hooks.',
  inputSchema: z.object({
    source: z.string().describe('JavaScript source code to evaluate'),
    worldName: z.string().optional().describe('Isolated world name. If specified, script runs in isolated context.'),
    includeCommandLineAPI: z.boolean().optional().describe('Include command line API (e.g., $, $$, $x)'),
    runImmediately: z.boolean().optional().describe('Run script immediately on existing documents'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof addScriptOnNewDocument.inputSchema>;
    try {
      const result = await session.addScriptToEvaluateOnNewDocument(p.source, {
        worldName: p.worldName,
        includeCommandLineAPI: p.includeCommandLineAPI,
        runImmediately: p.runImmediately,
      });

      return success(formatObject({
        identifier: result.identifier,
        message: 'Script will run on every new document. Use remove_script_on_new_document to remove it.',
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const removeScriptOnNewDocument: ToolDefinition = {
  name: 'remove_script_on_new_document',
  description: 'Remove a script previously added with add_script_on_new_document.',
  inputSchema: z.object({
    identifier: z.string().describe('Script identifier from add_script_on_new_document'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof removeScriptOnNewDocument.inputSchema>;
    try {
      await session.removeScriptToEvaluateOnNewDocument(p.identifier);
      return success('Script removed');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const captureScreenshot: ToolDefinition = {
  name: 'capture_screenshot',
  description: 'Capture a screenshot of the page. Large screenshots (>=1MB) are automatically saved to a temp file to avoid token limits.',
  inputSchema: z.object({
    format: z.enum(['jpeg', 'png', 'webp']).optional().describe('Image format. Default: png'),
    quality: z.number().min(0).max(100).optional().describe('Compression quality (0-100). Only for jpeg/webp.'),
    clip: z.object({
      x: z.number().describe('X coordinate'),
      y: z.number().describe('Y coordinate'),
      width: z.number().describe('Width'),
      height: z.number().describe('Height'),
      scale: z.number().optional().describe('Scale factor. Default: 1'),
    }).optional().describe('Capture a specific region. Use get_box_model to get element coordinates.'),
    captureBeyondViewport: z.boolean().optional().describe('Capture content beyond viewport'),
    optimizeForSpeed: z.boolean().optional().describe('Optimize for speed over quality'),
    filePath: z.string().optional().describe('Save screenshot to this file path instead of returning data'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof captureScreenshot.inputSchema>;
    try {
      const format = p.format ?? 'png';
      const result = await session.captureScreenshot({
        format,
        quality: p.quality,
        clip: p.clip,
        captureBeyondViewport: p.captureBeyondViewport,
        optimizeForSpeed: p.optimizeForSpeed,
      });

      const buffer = Buffer.from(result.data, 'base64');
      const byteSize = buffer.length;

      // If filePath provided, save there
      if (p.filePath) {
        await mkdir(dirname(p.filePath), { recursive: true });
        await writeFile(p.filePath, buffer);
        return success(formatObject({
          format,
          byteSize,
          savedTo: p.filePath,
        }));
      }

      // If large (>=1MB), auto-save to temp file as safety net
      if (byteSize >= ONE_MB) {
        const tempPath = join(tmpdir(), `screenshot-${Date.now()}.${format}`);
        await writeFile(tempPath, buffer);
        return success(formatObject({
          format,
          byteSize,
          savedTo: tempPath,
        }));
      }

      // Return as image content (MCP handles images efficiently)
      return image(result.data, `image/${format}`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const captureSnapshot: ToolDefinition = {
  name: 'capture_snapshot',
  description: 'Capture a full page snapshot as MHTML (includes HTML, CSS, images). Useful for archiving pages. Large snapshots (>=1MB) are automatically saved to a temp file.',
  inputSchema: z.object({
    filePath: z.string().optional().describe('Save snapshot to this file path instead of returning data'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof captureSnapshot.inputSchema>;
    try {
      const result = await session.captureSnapshot('mhtml');
      const byteSize = Buffer.byteLength(result.data, 'utf8');

      // If filePath provided, save there
      if (p.filePath) {
        await mkdir(dirname(p.filePath), { recursive: true });
        await writeFile(p.filePath, result.data, 'utf8');
        return success(formatObject({
          format: 'mhtml',
          byteSize,
          savedTo: p.filePath,
        }));
      }

      // If large (>=1MB), auto-save to temp file
      if (byteSize >= ONE_MB) {
        const tempPath = join(tmpdir(), `snapshot-${Date.now()}.mhtml`);
        await writeFile(tempPath, result.data, 'utf8');
        return success(formatObject({
          format: 'mhtml',
          byteSize,
          savedTo: tempPath,
          note: 'Snapshot was large (>=1MB) and saved to temp file to avoid token limits',
        }));
      }

      // Small file, return inline
      return success(formatObject({
        format: 'mhtml',
        byteSize,
        data: result.data,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const createIsolatedWorld: ToolDefinition = {
  name: 'create_isolated_world',
  description: 'Create an isolated JavaScript execution context in a frame. Scripts in isolated worlds cannot access page JS variables and vice versa, but both can access the DOM.',
  inputSchema: z.object({
    frameId: z.string().describe('Frame ID from get_frame_tree'),
    worldName: z.string().optional().describe('Name for the isolated world'),
    grantUniversalAccess: z.boolean().optional().describe('Grant universal access to the isolated world'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof createIsolatedWorld.inputSchema>;
    try {
      const result = await session.createIsolatedWorld(p.frameId, {
        worldName: p.worldName,
        grantUniveralAccess: p.grantUniversalAccess,
      });

      return success(formatObject({
        executionContextId: result.executionContextId,
        message: 'Use this contextId with evaluate to run code in the isolated world.',
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getFrameTree: ToolDefinition = {
  name: 'get_frame_tree',
  description: 'Get the frame tree structure of the page, including all iframes.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      const result = await session.getFrameTree();

      const formatFrame = (frame: typeof result.frameTree): unknown => ({
        id: frame.frame.id,
        name: frame.frame.name,
        url: frame.frame.url,
        securityOrigin: frame.frame.securityOrigin,
        mimeType: frame.frame.mimeType,
        childFrames: (frame.childFrames as typeof result.frameTree[] | undefined)?.map(formatFrame),
      });

      return success(formatObject(formatFrame(result.frameTree)));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const handleDialog: ToolDefinition = {
  name: 'handle_dialog',
  description: 'Handle a JavaScript dialog (alert, confirm, prompt, beforeunload).',
  inputSchema: z.object({
    accept: z.boolean().describe('Whether to accept (true) or dismiss (false) the dialog'),
    promptText: z.string().optional().describe('Text to enter for prompt dialogs'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof handleDialog.inputSchema>;
    try {
      await session.handleJavaScriptDialog(p.accept, p.promptText);
      return success(`Dialog ${p.accept ? 'accepted' : 'dismissed'}`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const deleteCookie: ToolDefinition = {
  name: 'delete_cookie',
  description: 'Delete a browser cookie by name. Part of Network domain but grouped here for convenience.',
  inputSchema: z.object({
    name: z.string().describe('Cookie name'),
    url: z.string().optional().describe('URL to match cookie'),
    domain: z.string().optional().describe('Domain to match cookie'),
    path: z.string().optional().describe('Path to match cookie'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof deleteCookie.inputSchema>;
    try {
      await session.deleteCookies(p.name, {
        url: p.url,
        domain: p.domain,
        path: p.path,
      });
      return success(`Cookie "${p.name}" deleted`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const pageTools: ToolDefinition[] = [
  navigate,
  reload,
  addScriptOnNewDocument,
  removeScriptOnNewDocument,
  captureScreenshot,
  captureSnapshot,
  createIsolatedWorld,
  getFrameTree,
  handleDialog,
  deleteCookie,
];
