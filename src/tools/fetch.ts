import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';
import type { InterceptAction } from '../state/FetchInterceptor.js';
import type { ResourceType } from '../utils/types.js';

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.wasm': 'application/wasm',
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return mimeTypes[ext] ?? 'application/octet-stream';
}

export const fetchEnable: ToolDefinition = {
  name: 'fetch_enable',
  description: 'Enable request interception. Requests matching rules will be paused.',
  inputSchema: z.object({
    patterns: z.array(z.object({
      urlPattern: z.string().optional().describe('URL pattern to intercept (glob or regex)'),
      resourceType: z.string().optional().describe('Resource type to intercept'),
    })).optional().describe('Patterns to intercept. If empty, intercepts all requests.'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof fetchEnable.inputSchema>;
    try {
      const patterns = p.patterns?.map((pat: { urlPattern?: string; resourceType?: string }) => ({
        urlPattern: pat.urlPattern ?? '*',
        resourceType: pat.resourceType,
        requestStage: 'Request' as const,
      }));

      await session.enableFetch(patterns);
      return success('Fetch interception enabled');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const fetchDisable: ToolDefinition = {
  name: 'fetch_disable',
  description: 'Disable request interception.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.disableFetch();
      return success('Fetch interception disabled');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const addInterceptRule: ToolDefinition = {
  name: 'add_intercept_rule',
  description: 'Add a rule for how to handle intercepted requests.',
  inputSchema: z.object({
    pattern: z.string().describe('URL pattern to match (glob or /regex/)'),
    action: z.enum(['pause', 'modify', 'mock', 'fail']).describe('Action to take'),
    resourceTypes: z.array(z.string()).optional().describe('Resource types to match'),
    modifyHeaders: z.record(z.string()).optional().describe('Headers to add/modify (for action=modify)'),
    modifyUrl: z.string().optional().describe('New URL (for action=modify)'),
    mockStatus: z.number().optional().describe('Response status (for action=mock)'),
    mockHeaders: z.record(z.string()).optional().describe('Response headers (for action=mock)'),
    mockBody: z.string().optional().describe('Response body (for action=mock)'),
    failReason: z.string().optional().describe('Error reason (for action=fail)'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof addInterceptRule.inputSchema>;
    try {
      const ruleId = session.fetchInterceptor.addRule({
        pattern: p.pattern,
        action: p.action as InterceptAction,
        resourceTypes: p.resourceTypes as ResourceType[] | undefined,
        modifyHeaders: p.modifyHeaders,
        modifyUrl: p.modifyUrl,
        mockResponse: p.action === 'mock' ? {
          status: p.mockStatus ?? 200,
          headers: p.mockHeaders,
          body: p.mockBody ?? '',
        } : undefined,
        failReason: p.failReason,
        enabled: true,
      });

      return success(formatObject({
        ruleId,
        message: 'Rule added. Re-enable fetch to apply new patterns.',
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const removeInterceptRule: ToolDefinition = {
  name: 'remove_intercept_rule',
  description: 'Remove an intercept rule.',
  inputSchema: z.object({
    ruleId: z.string().describe('Rule ID from add_intercept_rule'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof removeInterceptRule.inputSchema>;
    try {
      const removed = session.fetchInterceptor.removeRule(p.ruleId);
      if (!removed) {
        return error('Rule not found');
      }
      return success(`Rule ${p.ruleId} removed`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const listInterceptRules: ToolDefinition = {
  name: 'list_intercept_rules',
  description: 'List all intercept rules.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      const rules = session.fetchInterceptor.getAllRules();
      return success(formatObject(rules));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const listPausedRequests: ToolDefinition = {
  name: 'list_paused_requests',
  description: 'List requests that are paused waiting for a decision.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      const paused = session.fetchInterceptor.getAllPausedRequests();
      return success(formatObject({
        count: paused.length,
        requests: paused.map((r) => ({
          requestId: r.requestId,
          url: r.url,
          method: r.method,
          resourceType: r.resourceType,
          matchedRuleId: r.matchedRule?.id,
          timestamp: r.timestamp,
        })),
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const continueRequest: ToolDefinition = {
  name: 'continue_request',
  description: 'Continue a paused request, optionally modifying it.',
  inputSchema: z.object({
    requestId: z.string().describe('Request ID from list_paused_requests'),
    url: z.string().optional().describe('Override URL'),
    method: z.string().optional().describe('Override method'),
    postData: z.string().optional().describe('Override POST data'),
    headers: z.record(z.string()).optional().describe('Override headers'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof continueRequest.inputSchema>;
    try {
      const paused = session.fetchInterceptor.getPausedRequest(p.requestId);
      if (!paused) {
        return error('Request not found in paused requests');
      }

      const headers: Array<{ name: string; value: string }> | undefined = p.headers
        ? Object.entries(p.headers as Record<string, string>).map(([name, value]) => ({ name, value }))
        : undefined;

      await session.continueRequest(p.requestId, {
        url: p.url,
        method: p.method,
        postData: p.postData,
        headers,
      });

      return success('Request continued');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const fulfillRequest: ToolDefinition = {
  name: 'fulfill_request',
  description: 'Respond to a paused request with a mock response.',
  inputSchema: z.object({
    requestId: z.string().describe('Request ID from list_paused_requests'),
    status: z.number().describe('HTTP status code'),
    statusText: z.string().optional().describe('HTTP status text'),
    headers: z.record(z.string()).optional().describe('Response headers'),
    body: z.string().optional().describe('Response body'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof fulfillRequest.inputSchema>;
    try {
      const paused = session.fetchInterceptor.getPausedRequest(p.requestId);
      if (!paused) {
        return error('Request not found in paused requests');
      }

      const headers: Array<{ name: string; value: string }> | undefined = p.headers
        ? Object.entries(p.headers as Record<string, string>).map(([name, value]) => ({ name, value }))
        : undefined;

      await session.fulfillRequest(p.requestId, p.status, {
        responsePhrase: p.statusText,
        responseHeaders: headers,
        body: p.body,
      });

      return success('Request fulfilled with mock response');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const fulfillRequestWithFile: ToolDefinition = {
  name: 'fulfill_request_with_file',
  description: 'Respond to a paused request with file contents. Automatically detects Content-Type from file extension.',
  inputSchema: z.object({
    requestId: z.string().describe('Request ID from list_paused_requests'),
    filePath: z.string().describe('Path to the file to serve as response body'),
    status: z.number().optional().default(200).describe('HTTP status code (default: 200)'),
    statusText: z.string().optional().describe('HTTP status text'),
    contentType: z.string().optional().describe('Content-Type header (auto-detected from file extension if not provided)'),
    headers: z.record(z.string()).optional().describe('Additional response headers'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof fulfillRequestWithFile.inputSchema>;
    try {
      const paused = session.fetchInterceptor.getPausedRequest(p.requestId);
      if (!paused) {
        return error('Request not found in paused requests');
      }

      // Read file contents
      const fileContent = await readFile(p.filePath);

      // Determine content type
      const contentType = p.contentType ?? getMimeType(p.filePath);

      // Build headers
      const headerEntries: Array<{ name: string; value: string }> = [
        { name: 'Content-Type', value: contentType },
        { name: 'Content-Length', value: String(fileContent.length) },
      ];

      if (p.headers) {
        for (const [name, value] of Object.entries(p.headers as Record<string, string>)) {
          headerEntries.push({ name, value });
        }
      }

      await session.fulfillRequest(p.requestId, p.status ?? 200, {
        responsePhrase: p.statusText,
        responseHeaders: headerEntries,
        bodyBase64: fileContent.toString('base64'),
      });

      return success(formatObject({
        message: 'Request fulfilled with file contents',
        filePath: p.filePath,
        contentType,
        size: fileContent.length,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const failRequest: ToolDefinition = {
  name: 'fail_request',
  description: 'Fail a paused request with an error.',
  inputSchema: z.object({
    requestId: z.string().describe('Request ID from list_paused_requests'),
    reason: z.enum([
      'Failed', 'Aborted', 'TimedOut', 'AccessDenied', 'ConnectionClosed',
      'ConnectionReset', 'ConnectionRefused', 'ConnectionAborted', 'ConnectionFailed',
      'NameNotResolved', 'InternetDisconnected', 'AddressUnreachable', 'BlockedByClient',
      'BlockedByResponse',
    ]).describe('Error reason'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof failRequest.inputSchema>;
    try {
      const paused = session.fetchInterceptor.getPausedRequest(p.requestId);
      if (!paused) {
        return error('Request not found in paused requests');
      }

      await session.failRequest(p.requestId, p.reason);
      return success('Request failed');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const fetchTools: ToolDefinition[] = [
  fetchEnable,
  fetchDisable,
  addInterceptRule,
  removeInterceptRule,
  listInterceptRules,
  listPausedRequests,
  continueRequest,
  fulfillRequest,
  fulfillRequestWithFile,
  failRequest,
];
