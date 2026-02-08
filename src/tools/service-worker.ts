import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';

export const serviceWorkerEnable: ToolDefinition = {
  name: 'service_worker_enable',
  description: 'Enable ServiceWorker domain to track service workers.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.enableServiceWorker();
      return success('ServiceWorker tracking enabled');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const serviceWorkerDisable: ToolDefinition = {
  name: 'service_worker_disable',
  description: 'Disable ServiceWorker tracking.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.disableServiceWorker();
      return success('ServiceWorker tracking disabled');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const listServiceWorkers: ToolDefinition = {
  name: 'list_service_workers',
  description: 'List all registered service workers.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      const registrations = session.getServiceWorkerRegistrations();
      const versions = session.getServiceWorkerVersions();

      return success(formatObject({
        registrations: registrations.map((r) => ({
          registrationId: r.registrationId,
          scopeURL: r.scopeURL,
          isDeleted: r.isDeleted,
        })),
        versions: versions.map((v) => ({
          versionId: v.versionId,
          registrationId: v.registrationId,
          scriptURL: v.scriptURL,
          runningStatus: v.runningStatus,
          status: v.status,
        })),
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const startWorker: ToolDefinition = {
  name: 'start_worker',
  description: 'Start a service worker.',
  inputSchema: z.object({
    scopeURL: z.string().describe('Scope URL of the service worker'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof startWorker.inputSchema>;
    try {
      await session.startWorker(p.scopeURL);
      return success(`Worker started for scope: ${p.scopeURL}`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const stopWorker: ToolDefinition = {
  name: 'stop_worker',
  description: 'Stop a running service worker.',
  inputSchema: z.object({
    versionId: z.string().describe('Version ID of the worker'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof stopWorker.inputSchema>;
    try {
      await session.stopWorker(p.versionId);
      return success(`Worker stopped: ${p.versionId}`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const updateRegistration: ToolDefinition = {
  name: 'update_registration',
  description: 'Force update a service worker registration.',
  inputSchema: z.object({
    scopeURL: z.string().describe('Scope URL of the registration'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof updateRegistration.inputSchema>;
    try {
      await session.updateRegistration(p.scopeURL);
      return success(`Registration updated for: ${p.scopeURL}`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const skipWaiting: ToolDefinition = {
  name: 'skip_waiting',
  description: 'Skip waiting state for a service worker.',
  inputSchema: z.object({
    scopeURL: z.string().describe('Scope URL'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof skipWaiting.inputSchema>;
    try {
      await session.skipWaiting(p.scopeURL);
      return success(`skipWaiting called for: ${p.scopeURL}`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const serviceWorkerTools: ToolDefinition[] = [
  serviceWorkerEnable,
  serviceWorkerDisable,
  listServiceWorkers,
  startWorker,
  stopWorker,
  updateRegistration,
  skipWaiting,
];
