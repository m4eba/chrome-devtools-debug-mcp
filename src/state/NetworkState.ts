import type { NetworkRequest, RequestData, ResponseData, ResourceType } from '../utils/types.js';

export interface CollectedRequest {
  requestId: string;
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
}

export class NetworkState {
  private requests = new Map<string, CollectedRequest>();
  private enabled = false;
  private maxRequests = 1000;

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

    this.requests.set(params.requestId, {
      requestId: params.requestId,
      url: params.request.url,
      method: params.request.method,
      resourceType: params.type,
      startTime: params.timestamp,
      request: params.request,
    });
  }

  onResponseReceived(params: {
    requestId: string;
    timestamp: number;
    response: ResponseData;
    type: ResourceType;
  }): void {
    const req = this.requests.get(params.requestId);
    if (req) {
      req.status = params.response.status;
      req.statusText = params.response.statusText;
      req.mimeType = params.response.mimeType;
      req.response = params.response;
    }
  }

  onLoadingFinished(params: {
    requestId: string;
    timestamp: number;
    encodedDataLength: number;
  }): void {
    const req = this.requests.get(params.requestId);
    if (req) {
      req.endTime = params.timestamp;
      req.duration = params.timestamp - req.startTime;
      req.encodedDataLength = params.encodedDataLength;
    }
  }

  onLoadingFailed(params: {
    requestId: string;
    timestamp: number;
    errorText: string;
    canceled?: boolean;
  }): void {
    const req = this.requests.get(params.requestId);
    if (req) {
      req.endTime = params.timestamp;
      req.duration = params.timestamp - req.startTime;
      req.failed = true;
      req.errorText = params.errorText;
      req.canceled = params.canceled;
    }
  }

  // Store response body
  setResponseBody(requestId: string, body: string, base64Encoded: boolean): void {
    const req = this.requests.get(requestId);
    if (req) {
      req.responseBody = body;
      req.responseBodyBase64 = base64Encoded;
    }
  }

  // Query requests
  getRequest(requestId: string): CollectedRequest | undefined {
    return this.requests.get(requestId);
  }

  getAllRequests(): CollectedRequest[] {
    return Array.from(this.requests.values());
  }

  getRequestsByUrl(urlPattern: string): CollectedRequest[] {
    const regex = this.patternToRegex(urlPattern);
    return this.getAllRequests().filter((r) => regex.test(r.url));
  }

  getRequestsByType(type: ResourceType): CollectedRequest[] {
    return this.getAllRequests().filter((r) => r.resourceType === type);
  }

  getFailedRequests(): CollectedRequest[] {
    return this.getAllRequests().filter((r) => r.failed);
  }

  getPendingRequests(): CollectedRequest[] {
    return this.getAllRequests().filter((r) => !r.endTime && !r.failed);
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

  clear(): void {
    this.requests.clear();
  }

  getCount(): number {
    return this.requests.size;
  }

  setMaxRequests(max: number): void {
    this.maxRequests = max;
  }

  // Summary for debugging
  getSummary(): {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  } {
    let completed = 0;
    let failed = 0;
    let pending = 0;

    for (const req of this.requests.values()) {
      if (req.failed) {
        failed++;
      } else if (req.endTime) {
        completed++;
      } else {
        pending++;
      }
    }

    return {
      total: this.requests.size,
      completed,
      failed,
      pending,
    };
  }
}
