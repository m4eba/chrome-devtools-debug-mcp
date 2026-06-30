import type { RequestData, ResponseData, ResourceType } from '../utils/types.js';

export interface WebSocketFrame {
  ts: number; // CDP monotonic timestamp
  direction: 'sent' | 'received';
  opcode: number;
  mask?: boolean;
  payloadLength: number;
  payload: string; // possibly truncated to maxFramePayload
  truncated?: boolean;
  binary?: boolean;
}

export interface CollectedRequest {
  requestId: string;
  targetId: string;
  url: string;
  method: string;
  resourceType: ResourceType;
  status?: number;
  statusText?: string;
  mimeType?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  encodedDataLength?: number;
  request: RequestData;
  response?: ResponseData;
  failed?: boolean;
  errorText?: string;
  canceled?: boolean;
  responseBody?: string;
  responseBodyBase64?: boolean;
  // WebSocket-specific (set when resourceType === 'WebSocket')
  isWebSocket?: boolean;
  wsState?: 'connecting' | 'open' | 'closed' | 'failed';
  frames?: WebSocketFrame[];
  framesDropped?: number;
  wsError?: string;
}

export class NetworkState {
  private requests = new Map<string, CollectedRequest>();
  private enabled = false;
  private maxRequests = 1000;
  // Per-connection ring buffer for WS frames, and per-frame payload cap.
  private maxFramesPerConnection = 500;
  private maxFramePayload = 2000;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Request lifecycle
  onRequestWillBeSent(params: {
    requestId: string;
    targetId: string;
    loaderId: string;
    documentURL: string;
    request: RequestData;
    timestamp: number;
    wallTime: number;
    type: ResourceType;
  }): void {
    // Limit stored requests
    if (this.requests.size >= this.maxRequests) {
      const oldestKey = this.requests.keys().next().value;
      if (oldestKey) {
        this.requests.delete(oldestKey);
      }
    }

    this.requests.set(this.key(params.requestId, params.targetId), {
      requestId: params.requestId,
      targetId: params.targetId,
      url: params.request.url,
      method: params.request.method,
      resourceType: params.type,
      startTime: params.timestamp,
      request: params.request,
    });
  }

  onResponseReceived(params: {
    requestId: string;
    targetId: string;
    timestamp: number;
    response: ResponseData;
    type: ResourceType;
  }): void {
    const req = this.requests.get(this.key(params.requestId, params.targetId));
    if (req) {
      req.status = params.response.status;
      req.statusText = params.response.statusText;
      req.mimeType = params.response.mimeType;
      req.response = params.response;
    }
  }

  onLoadingFinished(params: {
    requestId: string;
    targetId: string;
    timestamp: number;
    encodedDataLength: number;
  }): void {
    const req = this.requests.get(this.key(params.requestId, params.targetId));
    if (req) {
      req.endTime = params.timestamp;
      req.duration = params.timestamp - req.startTime;
      req.encodedDataLength = params.encodedDataLength;
    }
  }

  onLoadingFailed(params: {
    requestId: string;
    targetId: string;
    timestamp: number;
    errorText: string;
    canceled?: boolean;
  }): void {
    const req = this.requests.get(this.key(params.requestId, params.targetId));
    if (req) {
      req.endTime = params.timestamp;
      req.duration = params.timestamp - req.startTime;
      req.failed = true;
      req.errorText = params.errorText;
      req.canceled = params.canceled;
    }
  }

  // WebSocket lifecycle. CDP routes WS traffic through dedicated webSocket*
  // events (never requestWillBeSent), so these are stored as their own
  // CollectedRequest with resourceType 'WebSocket' and a frame buffer.
  onWebSocketCreated(params: { requestId: string; targetId: string; url: string }): void {
    if (this.requests.size >= this.maxRequests) {
      const oldestKey = this.requests.keys().next().value;
      if (oldestKey) {
        this.requests.delete(oldestKey);
      }
    }

    this.requests.set(this.key(params.requestId, params.targetId), {
      requestId: params.requestId,
      targetId: params.targetId,
      url: params.url,
      method: 'GET',
      resourceType: 'WebSocket',
      startTime: 0,
      isWebSocket: true,
      wsState: 'connecting',
      frames: [],
      request: {
        url: params.url,
        method: 'GET',
        headers: {},
        initialPriority: '',
        referrerPolicy: '',
      },
    });
  }

  onWebSocketHandshakeRequest(params: {
    requestId: string;
    targetId: string;
    timestamp: number;
    request: { headers: Record<string, string> };
  }): void {
    const req = this.requests.get(this.key(params.requestId, params.targetId));
    if (req) {
      req.startTime = params.timestamp;
      req.request.headers = params.request.headers ?? {};
    }
  }

  onWebSocketHandshakeResponse(params: {
    requestId: string;
    targetId: string;
    timestamp: number;
    response: { status: number; statusText: string; headers: Record<string, string> };
  }): void {
    const req = this.requests.get(this.key(params.requestId, params.targetId));
    if (req) {
      req.status = params.response.status;
      req.statusText = params.response.statusText;
      req.wsState = 'open';
      req.response = {
        url: req.url,
        status: params.response.status,
        statusText: params.response.statusText,
        headers: params.response.headers ?? {},
        mimeType: '',
        connectionReused: false,
        connectionId: 0,
        encodedDataLength: 0,
        securityState: '',
      };
    }
  }

  onWebSocketFrame(
    direction: 'sent' | 'received',
    params: {
      requestId: string;
      targetId: string;
      timestamp: number;
      response: { opcode: number; mask?: boolean; payloadData: string };
    }
  ): void {
    const req = this.requests.get(this.key(params.requestId, params.targetId));
    if (!req || !req.frames) return;

    const payloadData = params.response.payloadData ?? '';
    const truncated = payloadData.length > this.maxFramePayload;
    req.frames.push({
      ts: params.timestamp,
      direction,
      opcode: params.response.opcode,
      mask: params.response.mask,
      payloadLength: payloadData.length,
      payload: truncated ? payloadData.slice(0, this.maxFramePayload) : payloadData,
      truncated: truncated || undefined,
      binary: params.response.opcode === 2 || undefined,
    });

    if (req.frames.length > this.maxFramesPerConnection) {
      req.frames.shift();
      req.framesDropped = (req.framesDropped ?? 0) + 1;
    }
  }

  onWebSocketFrameError(params: {
    requestId: string;
    targetId: string;
    timestamp: number;
    errorMessage: string;
  }): void {
    const req = this.requests.get(this.key(params.requestId, params.targetId));
    if (req) {
      req.wsState = 'failed';
      req.wsError = params.errorMessage;
    }
  }

  onWebSocketClosed(params: { requestId: string; targetId: string; timestamp: number }): void {
    const req = this.requests.get(this.key(params.requestId, params.targetId));
    if (req) {
      if (req.wsState !== 'failed') req.wsState = 'closed';
      req.endTime = params.timestamp;
      if (req.startTime > 0) req.duration = params.timestamp - req.startTime;
    }
  }

  // Store response body. targetId is optional: if omitted, we fall back to
  // looking up by requestId (used when the caller only has a requestId).
  setResponseBody(requestId: string, body: string, base64Encoded: boolean, targetId?: string): void {
    const req = targetId
      ? this.requests.get(this.key(requestId, targetId))
      : this.findByRequestId(requestId);
    if (req) {
      req.responseBody = body;
      req.responseBodyBase64 = base64Encoded;
    }
  }

  // Query requests
  getRequest(requestId: string, targetId?: string): CollectedRequest | undefined {
    if (targetId) {
      return this.requests.get(this.key(requestId, targetId));
    }
    return this.findByRequestId(requestId);
  }

  getAllRequests(targetId?: string): CollectedRequest[] {
    const all = Array.from(this.requests.values());
    return targetId ? all.filter((r) => r.targetId === targetId) : all;
  }

  getRequestsByUrl(urlPattern: string, targetId?: string): CollectedRequest[] {
    const regex = this.patternToRegex(urlPattern);
    return this.getAllRequests(targetId).filter((r) => regex.test(r.url));
  }

  getRequestsByType(type: ResourceType, targetId?: string): CollectedRequest[] {
    return this.getAllRequests(targetId).filter((r) => r.resourceType === type);
  }

  getFailedRequests(targetId?: string): CollectedRequest[] {
    return this.getAllRequests(targetId).filter((r) => r.failed);
  }

  getPendingRequests(targetId?: string): CollectedRequest[] {
    return this.getAllRequests(targetId).filter((r) => !r.endTime && !r.failed);
  }

  private patternToRegex(pattern: string): RegExp {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      return new RegExp(pattern.slice(1, -1));
    }
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(escaped);
  }

  clear(targetId?: string): void {
    if (!targetId) {
      this.requests.clear();
      return;
    }
    for (const [k, v] of this.requests) {
      if (v.targetId === targetId) this.requests.delete(k);
    }
  }

  getCount(targetId?: string): number {
    if (!targetId) return this.requests.size;
    let n = 0;
    for (const v of this.requests.values()) if (v.targetId === targetId) n++;
    return n;
  }

  setMaxRequests(max: number): void {
    this.maxRequests = max;
  }

  // Summary for debugging
  getSummary(targetId?: string): {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  } {
    let completed = 0;
    let failed = 0;
    let pending = 0;
    let total = 0;

    for (const req of this.requests.values()) {
      if (targetId && req.targetId !== targetId) continue;
      total++;
      if (req.failed) {
        failed++;
      } else if (req.endTime) {
        completed++;
      } else {
        pending++;
      }
    }

    return { total, completed, failed, pending };
  }

  private key(requestId: string, targetId: string): string {
    return `${targetId}:${requestId}`;
  }

  private findByRequestId(requestId: string): CollectedRequest | undefined {
    for (const req of this.requests.values()) {
      if (req.requestId === requestId) return req;
    }
    return undefined;
  }
}
