import WebSocket from 'ws';
import { EventEmitter } from 'events';
import createDebug from 'debug';
import type {
  CDPMessage,
  CDPRequest,
  CDPResponse,
  CDPEvent,
  CDPError,
} from './utils/types.js';

const debug = createDebug('cdp:client');

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  method: string;
  timeout: NodeJS.Timeout;
}

export interface CDPClientOptions {
  timeout?: number;
}

export class CDPClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private sessionId: string | null = null;
  private timeout: number;
  private connected = false;

  constructor(options: CDPClientOptions = {}) {
    super();
    this.timeout = options.timeout ?? 30000;
  }

  async connect(wsUrl: string): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected');
    }

    return new Promise((resolve, reject) => {
      debug('Connecting to %s', wsUrl);
      this.ws = new WebSocket(wsUrl);

      const connectTimeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error(`Connection timeout after ${this.timeout}ms`));
      }, this.timeout);

      this.ws.on('open', () => {
        clearTimeout(connectTimeout);
        this.connected = true;
        debug('Connected');
        resolve();
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.rejectAllPending(new Error('Connection closed'));
        this.emit('close');
      });

      this.ws.on('error', (err) => {
        clearTimeout(connectTimeout);
        debug('WebSocket error: %s', err.message);
        if (!this.connected) {
          reject(err);
        }
        this.emit('error', err);
      });
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.rejectAllPending(new Error('Disconnected'));
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected');
    }

    const id = ++this.requestId;
    const request: CDPRequest & { sessionId?: string } = { id, method };
    if (params) {
      request.params = params;
    }
    if (this.sessionId) {
      request.sessionId = this.sessionId;
    }

    debug('-> %s %d %o', method, id, params);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method} (${id})`));
      }, this.timeout);

      this.pendingRequests.set(id, { resolve: resolve as (result: unknown) => void, reject, method, timeout });
      this.ws!.send(JSON.stringify(request));
    });
  }

  private handleMessage(data: string): void {
    let message: CDPMessage;
    try {
      message = JSON.parse(data) as CDPMessage;
    } catch {
      debug('Failed to parse message: %s', data);
      return;
    }

    if (message.id !== undefined) {
      this.handleResponse(message as CDPResponse);
    } else if (message.method) {
      this.handleEvent(message as CDPEvent);
    }
  }

  private handleResponse(response: CDPResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      debug('Received response for unknown request: %d', response.id);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      debug('<- %s %d ERROR: %o', pending.method, response.id, response.error);
      pending.reject(new CDPClientError(response.error));
    } else {
      debug('<- %s %d %o', pending.method, response.id, response.result);
      pending.resolve(response.result);
    }
  }

  private handleEvent(event: CDPEvent): void {
    debug('<- EVENT %s %o', event.method, event.params);
    this.emit('event', event);
    this.emit(event.method, event.params);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}

export class CDPClientError extends Error {
  code: number;
  data?: unknown;

  constructor(error: CDPError) {
    super(error.message);
    this.name = 'CDPClientError';
    this.code = error.code;
    this.data = error.data;
  }
}
