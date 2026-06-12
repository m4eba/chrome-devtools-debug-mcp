import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';

export const networkEnable: ToolDefinition = {
  name: 'network_enable',
  description:
    'Enable network request collection on every attached session (page + auto-attached workers/iframes/service workers). Stays on for sessions that attach later.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.enableNetwork();
      return success('Network collection enabled on all sessions');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const networkDisable: ToolDefinition = {
  name: 'network_disable',
  description: 'Disable network request collection on every attached session.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.disableNetwork();
      return success('Network collection disabled');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const listRequests: ToolDefinition = {
  name: 'list_requests',
  description:
    'List collected network requests. Includes requests from the page and from any auto-attached workers/service workers. Use targetId to scope to one session.',
  inputSchema: z.object({
    urlPattern: z.string().optional().describe('Filter by URL pattern'),
    resourceType: z.string().optional().describe('Filter by resource type (XHR, Fetch, Script, etc.)'),
    failedOnly: z.boolean().optional().describe('Only show failed requests'),
    targetId: z.string().optional().describe('Filter by originating targetId (page/worker/SW). Use list_attached_sessions to find it.'),
    limit: z.number().optional().describe('Maximum number of requests to return'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof listRequests.inputSchema>;
    try {
      let requests = p.urlPattern
        ? session.networkState.getRequestsByUrl(p.urlPattern, p.targetId)
        : session.networkState.getAllRequests(p.targetId);

      if (p.resourceType) {
        requests = requests.filter((r) => r.resourceType === p.resourceType);
      }

      if (p.failedOnly) {
        requests = requests.filter((r) => r.failed);
      }

      if (p.limit) {
        requests = requests.slice(-p.limit);
      }

      return success(formatObject({
        count: requests.length,
        requests: requests.map((r) => ({
          requestId: r.requestId,
          targetId: r.targetId,
          url: r.url,
          method: r.method,
          resourceType: r.resourceType,
          status: r.status,
          statusText: r.statusText,
          mimeType: r.mimeType,
          duration: r.duration ? `${Math.round(r.duration * 1000)}ms` : 'pending',
          failed: r.failed,
          errorText: r.errorText,
          size: r.encodedDataLength,
        })),
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getRequestDetails: ToolDefinition = {
  name: 'get_request_details',
  description: 'Get detailed information about a network request.',
  inputSchema: z.object({
    requestId: z.string().describe('Request ID from list_requests'),
    targetId: z.string().optional().describe('Owning targetId (recommended; required if requestId collides across sessions).'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getRequestDetails.inputSchema>;
    try {
      const request = session.networkState.getRequest(p.requestId, p.targetId);
      if (!request) {
        return error('Request not found');
      }

      return success(formatObject({
        requestId: request.requestId,
        targetId: request.targetId,
        url: request.url,
        method: request.method,
        resourceType: request.resourceType,
        requestHeaders: request.request.headers,
        postData: request.request.postData,
        status: request.status,
        statusText: request.statusText,
        responseHeaders: request.response?.headers,
        mimeType: request.mimeType,
        timing: request.response?.timing,
        failed: request.failed,
        errorText: request.errorText,
        size: request.encodedDataLength,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getResponseBody: ToolDefinition = {
  name: 'get_response_body',
  description: 'Get the response body of a completed request. Automatically routes to the session that issued the request.',
  inputSchema: z.object({
    requestId: z.string().describe('Request ID from list_requests'),
    targetId: z.string().optional().describe('Owning targetId. Optional; resolved automatically when omitted.'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getResponseBody.inputSchema>;
    try {
      const request = session.networkState.getRequest(p.requestId, p.targetId);
      if (!request) {
        return error('Request not found');
      }

      // Check if already cached
      if (request.responseBody !== undefined) {
        return success(formatObject({
          requestId: p.requestId,
          targetId: request.targetId,
          base64Encoded: request.responseBodyBase64,
          body: request.responseBodyBase64
            ? `[Base64 encoded, ${request.responseBody.length} chars]`
            : request.responseBody,
        }));
      }

      const result = await session.getResponseBody(p.requestId, request.targetId);

      return success(formatObject({
        requestId: p.requestId,
        targetId: request.targetId,
        base64Encoded: result.base64Encoded,
        body: result.base64Encoded
          ? `[Base64 encoded, ${result.body.length} chars]`
          : result.body,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const clearRequests: ToolDefinition = {
  name: 'clear_requests',
  description: 'Clear collected network requests. Optional targetId scopes the clear to one session.',
  inputSchema: z.object({
    targetId: z.string().optional().describe('Clear only requests from this target.'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof clearRequests.inputSchema>;
    try {
      session.networkState.clear(p.targetId);
      return success(p.targetId ? `Network requests cleared for target ${p.targetId}` : 'Network requests cleared');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getNetworkSummary: ToolDefinition = {
  name: 'get_network_summary',
  description: 'Get summary of collected network requests, broken down per target. Optional targetId for a single-session view.',
  inputSchema: z.object({
    targetId: z.string().optional().describe('Restrict to one target.'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getNetworkSummary.inputSchema>;
    try {
      const summary = session.networkState.getSummary(p.targetId);
      const requests = session.networkState.getAllRequests(p.targetId);

      // Group by resource type
      const byType: Record<string, number> = {};
      for (const r of requests) {
        byType[r.resourceType] = (byType[r.resourceType] || 0) + 1;
      }

      // Per-target breakdown when not filtered.
      const byTarget: Record<string, { count: number; type?: string; url?: string }> = {};
      if (!p.targetId) {
        const sessions = new Map(session.getAttachedSessions().map((s) => [s.targetId, s]));
        for (const r of requests) {
          const entry = byTarget[r.targetId] ?? { count: 0, type: sessions.get(r.targetId)?.type, url: sessions.get(r.targetId)?.url };
          entry.count++;
          byTarget[r.targetId] = entry;
        }
      }

      // Calculate total size
      const totalSize = requests.reduce((sum, r) => sum + (r.encodedDataLength || 0), 0);

      return success(formatObject({
        ...summary,
        byType,
        ...(p.targetId ? {} : { byTarget }),
        totalSize: `${Math.round(totalSize / 1024)}KB`,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const networkTools: ToolDefinition[] = [
  networkEnable,
  networkDisable,
  listRequests,
  getRequestDetails,
  getResponseBody,
  clearRequests,
  getNetworkSummary,
];
