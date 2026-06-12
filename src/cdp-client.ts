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
  sessionId: string | null;
  timeout: NodeJS.Timeout;
}

export interface CDPClientOptions {
  timeout?: number;
}

// Top-level CDP message in flat mode (`Target.setAutoAttach({flatten:true})`).
// Both responses and events may carry a top-level `sessionId` when they
// originate from an attached child session.
interface FlatCDPMessage extends CDPMessage {
  sessionId?: string;
}

export class CDPClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
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

  /**
   * Send a CDP command. If `sessionId` is provided the message is routed to
   * that attached child session (flat mode). Otherwise it is sent on the root
   * connection.
   */
  async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string | null
  ): Promise<T> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected');
    }

    const id = ++this.requestId;
    const request: CDPRequest & { sessionId?: string } = { id, method };
    if (params) {
      request.params = params;
    }
    if (sessionId) {
      request.sessionId = sessionId;
    }

    debug('-> %s %d (sid=%s) %o', method, id, sessionId ?? 'root', params);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method} (${id})`));
      }, this.timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        method,
        sessionId: sessionId ?? null,
        timeout,
      });
      this.ws!.send(JSON.stringify(request));
    });
  }

  /**
   * Reject all pending requests that belong to a specific session. Used when
   * a child session detaches.
   */
  rejectPendingForSession(sessionId: string, error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      if (pending.sessionId === sessionId) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(id);
        pending.reject(error);
      }
    }
  }

  private handleMessage(data: string): void {
    let message: FlatCDPMessage;
    try {
      message = JSON.parse(data) as FlatCDPMessage;
    } catch {
      debug('Failed to parse message: %s', data);
      return;
    }

    if (message.id !== undefined) {
      this.handleResponse(message as CDPResponse & { sessionId?: string });
    } else if (message.method) {
      this.handleEvent(message as CDPEvent & { sessionId?: string });
    }
  }

  private handleResponse(response: CDPResponse & { sessionId?: string }): void {
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

  private handleEvent(event: CDPEvent & { sessionId?: string }): void {
    const sessionId = event.sessionId ?? null;
    debug('<- EVENT %s (sid=%s) %o', event.method, sessionId ?? 'root', event.params);
    this.emit('event', event);
    // Listeners receive (params, sessionId). Legacy listeners that ignore the
    // second arg keep working.
    this.emit(event.method, event.params, sessionId);
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
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
