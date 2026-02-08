import type { ResourceType, FetchRequestPaused, HeaderEntry } from '../utils/types.js';

export type InterceptAction = 'pause' | 'modify' | 'mock' | 'fail';

export interface InterceptRule {
  id: string;
  pattern: string;
  resourceTypes?: ResourceType[];
  action: InterceptAction;
  modifyHeaders?: Record<string, string>;
  modifyUrl?: string;
  mockResponse?: {
    status: number;
    headers?: Record<string, string>;
    body: string;
  };
  failReason?: string;
  enabled: boolean;
}

export interface PausedRequest {
  requestId: string;
  url: string;
  method: string;
  resourceType: ResourceType;
  headers: Record<string, string>;
  postData?: string;
  timestamp: number;
  matchedRule?: InterceptRule;
}

export class FetchInterceptor {
  private rules = new Map<string, InterceptRule>();
  private pausedRequests = new Map<string, PausedRequest>();
  private enabled = false;
  private ruleIdCounter = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.pausedRequests.clear();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Rule management
  addRule(rule: Omit<InterceptRule, 'id'>): string {
    const id = `rule-${++this.ruleIdCounter}`;
    this.rules.set(id, { ...rule, id, enabled: rule.enabled ?? true });
    return id;
  }

  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  getRule(ruleId: string): InterceptRule | undefined {
    return this.rules.get(ruleId);
  }

  getAllRules(): InterceptRule[] {
    return Array.from(this.rules.values());
  }

  updateRule(ruleId: string, updates: Partial<Omit<InterceptRule, 'id'>>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    Object.assign(rule, updates);
    return true;
  }

  enableRule(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    rule.enabled = enabled;
    return true;
  }

  clearRules(): void {
    this.rules.clear();
  }

  // Pattern matching
  matchesPattern(url: string, pattern: string): boolean {
    // Support glob-like patterns
    if (pattern === '*') return true;

    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      // Regex pattern
      try {
        const regex = new RegExp(pattern.slice(1, -1));
        return regex.test(url);
      } catch {
        return false;
      }
    }

    // Glob pattern
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${escaped}$`);
    return regex.test(url);
  }

  findMatchingRule(url: string, resourceType: ResourceType): InterceptRule | undefined {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check resource type filter
      if (rule.resourceTypes && rule.resourceTypes.length > 0) {
        if (!rule.resourceTypes.includes(resourceType)) continue;
      }

      // Check URL pattern
      if (this.matchesPattern(url, rule.pattern)) {
        return rule;
      }
    }
    return undefined;
  }

  // Paused request management
  onRequestPaused(event: FetchRequestPaused): PausedRequest {
    const headers: Record<string, string> = {};
    if (event.request.headers) {
      Object.assign(headers, event.request.headers);
    }

    const pausedReq: PausedRequest = {
      requestId: event.requestId,
      url: event.request.url,
      method: event.request.method,
      resourceType: event.resourceType,
      headers,
      postData: event.request.postData,
      timestamp: Date.now(),
      matchedRule: this.findMatchingRule(event.request.url, event.resourceType),
    };

    this.pausedRequests.set(event.requestId, pausedReq);
    return pausedReq;
  }

  getPausedRequest(requestId: string): PausedRequest | undefined {
    return this.pausedRequests.get(requestId);
  }

  getAllPausedRequests(): PausedRequest[] {
    return Array.from(this.pausedRequests.values());
  }

  removePausedRequest(requestId: string): void {
    this.pausedRequests.delete(requestId);
  }

  clearPausedRequests(): void {
    this.pausedRequests.clear();
  }

  // Build CDP patterns from rules
  getCDPPatterns(): Array<{ urlPattern: string; resourceType?: string; requestStage: string }> {
    const patterns: Array<{ urlPattern: string; resourceType?: string; requestStage: string }> = [];
    const seenPatterns = new Set<string>();

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      if (rule.resourceTypes && rule.resourceTypes.length > 0) {
        for (const type of rule.resourceTypes) {
          const key = `${rule.pattern}:${type}`;
          if (!seenPatterns.has(key)) {
            seenPatterns.add(key);
            patterns.push({
              urlPattern: rule.pattern,
              resourceType: type,
              requestStage: 'Request',
            });
          }
        }
      } else {
        if (!seenPatterns.has(rule.pattern)) {
          seenPatterns.add(rule.pattern);
          patterns.push({
            urlPattern: rule.pattern,
            requestStage: 'Request',
          });
        }
      }
    }

    return patterns;
  }

  // Build modified headers
  buildModifiedHeaders(
    originalHeaders: Record<string, string>,
    modifyHeaders: Record<string, string>
  ): HeaderEntry[] {
    const merged = { ...originalHeaders, ...modifyHeaders };
    return Object.entries(merged).map(([name, value]) => ({ name, value }));
  }

  // Encode response body
  encodeResponseBody(body: string): string {
    return Buffer.from(body).toString('base64');
  }

  reset(): void {
    this.rules.clear();
    this.pausedRequests.clear();
    this.ruleIdCounter = 0;
  }

  // Summary for debugging
  getSummary(): {
    ruleCount: number;
    enabledRules: number;
    pausedRequests: number;
  } {
    let enabledRules = 0;
    for (const rule of this.rules.values()) {
      if (rule.enabled) enabledRules++;
    }

    return {
      ruleCount: this.rules.size,
      enabledRules,
      pausedRequests: this.pausedRequests.size,
    };
  }
}
