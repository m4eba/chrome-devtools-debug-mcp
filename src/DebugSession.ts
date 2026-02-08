import { EventEmitter } from 'events';
import createDebug from 'debug';
import { CDPClient } from './cdp-client.js';
import { launchChrome, getTargets, getVersion, type LaunchOptions, type LaunchResult } from './chrome-launcher.js';
import {
  DebugState,
  ScriptRegistry,
  NetworkState,
  FetchInterceptor,
  ConsoleState,
} from './state/index.js';
import { withTimeout, PausedError } from './utils/timeout.js';
import type {
  TargetInfo,
  CallFrame,
  Location,
  ScriptInfo,
  RemoteObject,
  PropertyDescriptor,
  DOMNode,
  BoxModel,
  EventListener,
  LogEntry,
  ServiceWorkerRegistration,
  ServiceWorkerVersion,
} from './utils/types.js';

const debug = createDebug('cdp:session');

export interface SessionOptions {
  timeout?: number;
}

// Result type for operations that may trigger breakpoints
export interface BreakpointAwareResult<T> {
  result: T;
  paused: boolean;
  pauseReason?: string;
  callFrames?: CallFrame[];
}

export class DebugSession extends EventEmitter {
  private client: CDPClient;
  private launchResult: LaunchResult | null = null;
  private targetId: string | null = null;
  private sessionId: string | null = null;

  // State managers
  readonly debugState: DebugState;
  readonly scriptRegistry: ScriptRegistry;
  readonly networkState: NetworkState;
  readonly fetchInterceptor: FetchInterceptor;
  readonly consoleState: ConsoleState;

  // Log entries
  private logEntries: LogEntry[] = [];
  private logEnabled = false;

  // ServiceWorker state
  private serviceWorkerRegistrations = new Map<string, ServiceWorkerRegistration>();
  private serviceWorkerVersions = new Map<string, ServiceWorkerVersion>();
  private serviceWorkerEnabled = false;

  // DOM state
  private domEnabled = false;
  private documentNodeId: number | null = null;

  private timeout: number;

  constructor(options: SessionOptions = {}) {
    super();
    this.client = new CDPClient({ timeout: options.timeout });
    this.timeout = options.timeout ?? 30000;

    this.debugState = new DebugState();
    this.scriptRegistry = new ScriptRegistry();
    this.networkState = new NetworkState();
    this.fetchInterceptor = new FetchInterceptor();
    this.consoleState = new ConsoleState();

    this.setupEventHandlers();
  }

  /**
   * Wraps a promise to detect if a breakpoint is hit during execution.
   * Waits briefly after the operation to catch breakpoints in async handlers.
   */
  async withBreakpointDetection<T>(
    promise: Promise<T>,
    defaultResult?: T,
    waitForBreakpoint = 200
  ): Promise<BreakpointAwareResult<T>> {
    // If already paused, throw immediately
    if (this.debugState.isPaused()) {
      throw new PausedError(this.debugState.getPauseState().reason);
    }

    // If debugger is not enabled, just run the promise directly
    if (!this.debugState.isEnabled()) {
      const result = await promise;
      return { result, paused: false };
    }

    // Execute the operation
    const result = await promise;

    // Now wait briefly to see if a breakpoint is hit in async handlers
    let pauseHandler: ((params: { reason: string; callFrames: CallFrame[] }) => void) | null = null;
    const pausedPromise = new Promise<{ reason: string; callFrames: CallFrame[] }>((resolve) => {
      pauseHandler = (params) => resolve({ reason: params.reason, callFrames: params.callFrames });
      this.once('paused', pauseHandler);
    });

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), waitForBreakpoint);
    });

    try {
      const pauseResult = await Promise.race([pausedPromise, timeoutPromise]);

      if (pauseResult) {
        return {
          result: defaultResult as T,
          paused: true,
          pauseReason: pauseResult.reason,
          callFrames: pauseResult.callFrames,
        };
      }

      // Also check current state in case event arrived differently
      if (this.debugState.isPaused()) {
        return {
          result: defaultResult as T,
          paused: true,
          pauseReason: this.debugState.getPauseState().reason || 'unknown',
          callFrames: this.debugState.getCallFrames(),
        };
      }

      return { result, paused: false };
    } finally {
      if (pauseHandler) {
        this.removeListener('paused', pauseHandler);
      }
    }
  }

  private setupEventHandlers(): void {
    // Debugger events
    this.client.on('Debugger.scriptParsed', (params: ScriptInfo) => {
      this.scriptRegistry.addScript(params);
      this.emit('scriptParsed', params);
    });

    this.client.on('Debugger.paused', (params: {
      callFrames: CallFrame[];
      reason: string;
      data?: Record<string, unknown>;
      hitBreakpoints?: string[];
      asyncStackTrace?: unknown;
    }) => {
      this.debugState.setPaused(
        params.reason,
        params.callFrames,
        params.data,
        params.asyncStackTrace,
        params.hitBreakpoints
      );
      this.emit('paused', params);
    });

    this.client.on('Debugger.resumed', () => {
      this.debugState.setResumed();
      this.emit('resumed');
    });

    this.client.on('Debugger.breakpointResolved', (params: { breakpointId: string; location: Location }) => {
      this.debugState.updateBreakpointLocations(params.breakpointId, [params.location]);
      this.emit('breakpointResolved', params);
    });

    // Runtime events
    this.client.on('Runtime.consoleAPICalled', (params: {
      type: string;
      args: RemoteObject[];
      executionContextId: number;
      timestamp: number;
      stackTrace?: unknown;
    }) => {
      const msg = this.consoleState.onConsoleAPICalled(params as Parameters<typeof this.consoleState.onConsoleAPICalled>[0]);
      this.emit('consoleMessage', msg);
    });

    this.client.on('Runtime.exceptionThrown', (params: {
      timestamp: number;
      exceptionDetails: unknown;
    }) => {
      const exc = this.consoleState.onExceptionThrown(params as Parameters<typeof this.consoleState.onExceptionThrown>[0]);
      this.emit('exceptionThrown', exc);
    });

    // Network events
    this.client.on('Network.requestWillBeSent', (params: unknown) => {
      this.networkState.onRequestWillBeSent(params as Parameters<typeof this.networkState.onRequestWillBeSent>[0]);
      this.emit('requestWillBeSent', params);
    });

    this.client.on('Network.responseReceived', (params: unknown) => {
      this.networkState.onResponseReceived(params as Parameters<typeof this.networkState.onResponseReceived>[0]);
      this.emit('responseReceived', params);
    });

    this.client.on('Network.loadingFinished', (params: unknown) => {
      this.networkState.onLoadingFinished(params as Parameters<typeof this.networkState.onLoadingFinished>[0]);
      this.emit('loadingFinished', params);
    });

    this.client.on('Network.loadingFailed', (params: unknown) => {
      this.networkState.onLoadingFailed(params as Parameters<typeof this.networkState.onLoadingFailed>[0]);
      this.emit('loadingFailed', params);
    });

    // Fetch events
    this.client.on('Fetch.requestPaused', (params: unknown) => {
      const pausedReq = this.fetchInterceptor.onRequestPaused(params as Parameters<typeof this.fetchInterceptor.onRequestPaused>[0]);
      this.emit('requestPaused', pausedReq);
    });

    // Log events
    this.client.on('Log.entryAdded', (params: { entry: LogEntry }) => {
      this.logEntries.push(params.entry);
      if (this.logEntries.length > 1000) {
        this.logEntries.shift();
      }
      this.emit('logEntry', params.entry);
    });

    // ServiceWorker events
    this.client.on('ServiceWorker.workerRegistrationUpdated', (params: { registrations: ServiceWorkerRegistration[] }) => {
      for (const reg of params.registrations) {
        if (reg.isDeleted) {
          this.serviceWorkerRegistrations.delete(reg.registrationId);
        } else {
          this.serviceWorkerRegistrations.set(reg.registrationId, reg);
        }
      }
      this.emit('workerRegistrationUpdated', params.registrations);
    });

    this.client.on('ServiceWorker.workerVersionUpdated', (params: { versions: ServiceWorkerVersion[] }) => {
      for (const ver of params.versions) {
        this.serviceWorkerVersions.set(ver.versionId, ver);
      }
      this.emit('workerVersionUpdated', params.versions);
    });

    // DOM events
    this.client.on('DOM.documentUpdated', () => {
      this.documentNodeId = null;
      this.emit('documentUpdated');
    });

    // Connection events
    this.client.on('close', () => {
      this.emit('disconnected');
    });
  }

  // Connection management
  async launch(options: LaunchOptions = {}): Promise<{ wsEndpoint: string; port: number }> {
    this.launchResult = await launchChrome(options);
    const targets = await getTargets(`http://127.0.0.1:${this.launchResult.port}`);
    const pageTarget = targets.find((t) => t.type === 'page');

    if (pageTarget?.webSocketDebuggerUrl) {
      await this.client.connect(pageTarget.webSocketDebuggerUrl);
    } else {
      throw new Error('No page target found');
    }

    return {
      wsEndpoint: this.launchResult.wsEndpoint,
      port: this.launchResult.port,
    };
  }

  async connect(wsUrl: string): Promise<void> {
    await this.client.connect(wsUrl);
  }

  async connectToTarget(httpUrl: string, targetId?: string): Promise<TargetInfo> {
    const targets = await getTargets(httpUrl);
    let target: typeof targets[0] | undefined;

    if (targetId) {
      target = targets.find((t) => t.id === targetId);
    } else {
      target = targets.find((t) => t.type === 'page');
    }

    if (!target) {
      throw new Error('Target not found');
    }

    if (!target.webSocketDebuggerUrl) {
      throw new Error('Target has no WebSocket URL');
    }

    await this.client.connect(target.webSocketDebuggerUrl);
    this.targetId = target.id;

    return {
      targetId: target.id,
      type: target.type as TargetInfo['type'],
      title: target.title,
      url: target.url,
      attached: true,
      canAccessOpener: false,
    };
  }

  async disconnect(): Promise<void> {
    this.client.disconnect();
    this.reset();
  }

  async kill(): Promise<void> {
    this.client.disconnect();
    if (this.launchResult) {
      await this.launchResult.kill();
      this.launchResult = null;
    }
    this.reset();
  }

  isConnected(): boolean {
    return this.client.isConnected();
  }

  private reset(): void {
    this.debugState.reset();
    this.scriptRegistry.clear();
    this.networkState.clear();
    this.fetchInterceptor.reset();
    this.consoleState.clear();
    this.logEntries = [];
    this.serviceWorkerRegistrations.clear();
    this.serviceWorkerVersions.clear();
    this.documentNodeId = null;
    this.targetId = null;
    this.sessionId = null;
  }

  // Target management
  async listTargets(httpUrl: string): Promise<TargetInfo[]> {
    const targets = await getTargets(httpUrl);
    return targets.map((t) => ({
      targetId: t.id,
      type: t.type as TargetInfo['type'],
      title: t.title,
      url: t.url,
      attached: false,
      canAccessOpener: false,
    }));
  }

  async getVersion(httpUrl: string): Promise<{ browser: string; protocolVersion: string }> {
    const version = await getVersion(httpUrl);
    return {
      browser: version.Browser,
      protocolVersion: version['Protocol-Version'],
    };
  }

  // Debugger domain
  async enableDebugger(): Promise<void> {
    await this.client.send('Debugger.enable', { maxScriptsCacheSize: 100000000 });
    this.debugState.setEnabled(true);
  }

  async disableDebugger(): Promise<void> {
    await this.client.send('Debugger.disable');
    this.debugState.setEnabled(false);
  }

  async setBreakpointByUrl(
    lineNumber: number,
    url?: string,
    urlRegex?: string,
    columnNumber?: number,
    condition?: string
  ): Promise<{ breakpointId: string; locations: Location[] }> {
    const params: Record<string, unknown> = { lineNumber };
    if (url) params.url = url;
    if (urlRegex) params.urlRegex = urlRegex;
    if (columnNumber !== undefined) params.columnNumber = columnNumber;
    if (condition) params.condition = condition;

    const result = await this.client.send<{ breakpointId: string; locations: Location[] }>(
      'Debugger.setBreakpointByUrl',
      params
    );

    this.debugState.addBreakpoint({
      id: result.breakpointId,
      url,
      urlRegex,
      lineNumber,
      columnNumber,
      condition,
      locations: result.locations,
      enabled: true,
    });

    return result;
  }

  async setBreakpoint(
    location: Location,
    condition?: string
  ): Promise<{ breakpointId: string; actualLocation: Location }> {
    const params: Record<string, unknown> = { location };
    if (condition) params.condition = condition;

    const result = await this.client.send<{ breakpointId: string; actualLocation: Location }>(
      'Debugger.setBreakpoint',
      params
    );

    this.debugState.addBreakpoint({
      id: result.breakpointId,
      scriptId: location.scriptId,
      lineNumber: location.lineNumber,
      columnNumber: location.columnNumber,
      condition,
      locations: [result.actualLocation],
      enabled: true,
    });

    return result;
  }

  async removeBreakpoint(breakpointId: string): Promise<void> {
    await this.client.send('Debugger.removeBreakpoint', { breakpointId });
    this.debugState.removeBreakpoint(breakpointId);
  }

  async pause(): Promise<void> {
    await this.client.send('Debugger.pause');
  }

  async resume(): Promise<void> {
    await this.client.send('Debugger.resume');
  }

  async stepOver(): Promise<void> {
    await this.client.send('Debugger.stepOver');
  }

  async stepInto(): Promise<void> {
    await this.client.send('Debugger.stepInto');
  }

  async stepOut(): Promise<void> {
    await this.client.send('Debugger.stepOut');
  }

  async setPauseOnExceptions(state: 'none' | 'uncaught' | 'all'): Promise<void> {
    await this.client.send('Debugger.setPauseOnExceptions', { state });
    this.debugState.setPauseOnExceptions(state);
  }

  async setAsyncCallStackDepth(maxDepth: number): Promise<void> {
    await this.client.send('Debugger.setAsyncCallStackDepth', { maxDepth });
    this.debugState.setAsyncStackTraceDepth(maxDepth);
  }

  async getScriptSource(scriptId: string): Promise<string> {
    // Check cache first
    const cached = this.scriptRegistry.getSource(scriptId);
    if (cached) return cached;

    const result = await this.client.send<{ scriptSource: string }>('Debugger.getScriptSource', { scriptId });
    this.scriptRegistry.setSource(scriptId, result.scriptSource);
    return result.scriptSource;
  }

  async evaluateOnCallFrame(
    callFrameId: string,
    expression: string,
    options: { objectGroup?: string; returnByValue?: boolean; generatePreview?: boolean } = {}
  ): Promise<{ result: RemoteObject; exceptionDetails?: unknown; paused?: boolean; pauseReason?: string; callFrames?: CallFrame[] }> {
    const evalPromise = this.client.send<{ result: RemoteObject; exceptionDetails?: unknown }>('Debugger.evaluateOnCallFrame', {
      callFrameId,
      expression,
      objectGroup: options.objectGroup ?? 'debugger',
      returnByValue: options.returnByValue ?? false,
      generatePreview: options.generatePreview ?? true,
    });

    // Race with breakpoint detection - expression could call function with breakpoint
    let pauseHandler: ((params: { reason: string; callFrames: CallFrame[] }) => void) | null = null;
    const pausedPromise = new Promise<{ paused: true; reason: string; callFrames: CallFrame[] }>((resolve) => {
      pauseHandler = (params) => resolve({ paused: true, reason: params.reason, callFrames: params.callFrames });
      this.once('paused', pauseHandler);
    });

    try {
      const result = await Promise.race([
        evalPromise.then(r => ({ ...r, paused: false as const })),
        pausedPromise,
      ]);

      if (result.paused) {
        return {
          result: { type: 'undefined' } as RemoteObject,
          paused: true,
          pauseReason: result.reason,
          callFrames: result.callFrames,
        };
      }

      return result;
    } finally {
      if (pauseHandler) {
        this.removeListener('paused', pauseHandler);
      }
    }
  }

  async setVariableValue(
    scopeNumber: number,
    variableName: string,
    newValue: { value?: unknown; unserializableValue?: string; objectId?: string },
    callFrameId: string
  ): Promise<void> {
    await this.client.send('Debugger.setVariableValue', {
      scopeNumber,
      variableName,
      newValue,
      callFrameId,
    });
  }

  // Runtime domain
  async enableRuntime(): Promise<void> {
    await this.client.send('Runtime.enable');
    this.consoleState.setEnabled(true);
  }

  async disableRuntime(): Promise<void> {
    await this.client.send('Runtime.disable');
    this.consoleState.setEnabled(false);
  }

  async evaluate(
    expression: string,
    options: {
      objectGroup?: string;
      contextId?: number;
      returnByValue?: boolean;
      generatePreview?: boolean;
      awaitPromise?: boolean;
      timeout?: number;
    } = {}
  ): Promise<{ result: RemoteObject; exceptionDetails?: unknown; paused?: boolean; pauseReason?: string; callFrames?: CallFrame[] }> {
    // If already paused, throw immediately
    if (this.debugState.isPaused()) {
      throw new PausedError(this.debugState.getPauseState().reason);
    }

    const evalPromise = this.client.send<{ result: RemoteObject; exceptionDetails?: unknown }>('Runtime.evaluate', {
      expression,
      objectGroup: options.objectGroup ?? 'console',
      returnByValue: options.returnByValue ?? false,
      generatePreview: options.generatePreview ?? true,
      awaitPromise: options.awaitPromise ?? false,
    });

    // If debugger is not enabled, just run normally
    if (!this.debugState.isEnabled()) {
      const result = await evalPromise;
      return { ...result, paused: false };
    }

    // Race between eval and breakpoint - evaluate hangs if breakpoint is hit
    let pauseHandler: ((params: { reason: string; callFrames: CallFrame[] }) => void) | null = null;
    const pausedPromise = new Promise<{ paused: true; reason: string; callFrames: CallFrame[] }>((resolve) => {
      pauseHandler = (params) => resolve({ paused: true, reason: params.reason, callFrames: params.callFrames });
      this.once('paused', pauseHandler);
    });

    try {
      const result = await Promise.race([
        evalPromise.then(r => ({ ...r, paused: false as const })),
        pausedPromise,
      ]);

      if (result.paused) {
        return {
          result: { type: 'undefined' } as RemoteObject,
          paused: true,
          pauseReason: result.reason,
          callFrames: result.callFrames,
        };
      }

      return result;
    } finally {
      if (pauseHandler) {
        this.removeListener('paused', pauseHandler);
      }
    }
  }

  async getProperties(
    objectId: string,
    options: { ownProperties?: boolean; accessorPropertiesOnly?: boolean; generatePreview?: boolean } = {}
  ): Promise<{ result: PropertyDescriptor[] }> {
    return this.client.send('Runtime.getProperties', {
      objectId,
      ownProperties: options.ownProperties ?? true,
      accessorPropertiesOnly: options.accessorPropertiesOnly ?? false,
      generatePreview: options.generatePreview ?? true,
    });
  }

  async releaseObject(objectId: string): Promise<void> {
    await this.client.send('Runtime.releaseObject', { objectId });
  }

  async releaseObjectGroup(objectGroup: string): Promise<void> {
    await this.client.send('Runtime.releaseObjectGroup', { objectGroup });
  }

  // Network domain
  async enableNetwork(): Promise<void> {
    await this.client.send('Network.enable');
    this.networkState.setEnabled(true);
  }

  async disableNetwork(): Promise<void> {
    await this.client.send('Network.disable');
    this.networkState.setEnabled(false);
  }

  async getResponseBody(requestId: string): Promise<{ body: string; base64Encoded: boolean }> {
    const result = await this.client.send<{ body: string; base64Encoded: boolean }>(
      'Network.getResponseBody',
      { requestId }
    );
    this.networkState.setResponseBody(requestId, result.body, result.base64Encoded);
    return result;
  }

  // Fetch domain
  async enableFetch(patterns?: Array<{ urlPattern?: string; resourceType?: string; requestStage?: string }>): Promise<void> {
    const actualPatterns = patterns ?? this.fetchInterceptor.getCDPPatterns();
    await this.client.send('Fetch.enable', {
      patterns: actualPatterns.length > 0 ? actualPatterns : [{ urlPattern: '*', requestStage: 'Request' }],
    });
    this.fetchInterceptor.setEnabled(true);
  }

  async disableFetch(): Promise<void> {
    await this.client.send('Fetch.disable');
    this.fetchInterceptor.setEnabled(false);
  }

  async continueRequest(
    requestId: string,
    options: { url?: string; method?: string; postData?: string; headers?: Array<{ name: string; value: string }> } = {}
  ): Promise<void> {
    const params: Record<string, unknown> = { requestId };
    if (options.url) params.url = options.url;
    if (options.method) params.method = options.method;
    if (options.postData) params.postData = options.postData;
    if (options.headers) params.headers = options.headers;

    await this.client.send('Fetch.continueRequest', params);
    this.fetchInterceptor.removePausedRequest(requestId);
  }

  async fulfillRequest(
    requestId: string,
    responseCode: number,
    options: { responseHeaders?: Array<{ name: string; value: string }>; body?: string; responsePhrase?: string } = {}
  ): Promise<void> {
    const params: Record<string, unknown> = { requestId, responseCode };
    if (options.responseHeaders) params.responseHeaders = options.responseHeaders;
    if (options.body) params.body = Buffer.from(options.body).toString('base64');
    if (options.responsePhrase) params.responsePhrase = options.responsePhrase;

    await this.client.send('Fetch.fulfillRequest', params);
    this.fetchInterceptor.removePausedRequest(requestId);
  }

  async failRequest(requestId: string, errorReason: string): Promise<void> {
    await this.client.send('Fetch.failRequest', { requestId, errorReason });
    this.fetchInterceptor.removePausedRequest(requestId);
  }

  // DOM domain
  async enableDOM(): Promise<void> {
    await this.client.send('DOM.enable');
    this.domEnabled = true;
  }

  async disableDOM(): Promise<void> {
    await this.client.send('DOM.disable');
    this.domEnabled = false;
    this.documentNodeId = null;
  }

  async getDocument(depth?: number, pierce?: boolean): Promise<DOMNode> {
    const result = await this.client.send<{ root: DOMNode }>('DOM.getDocument', {
      depth: depth ?? -1,
      pierce: pierce ?? false,
    });
    this.documentNodeId = result.root.nodeId;
    return result.root;
  }

  async querySelector(nodeId: number, selector: string): Promise<number> {
    const result = await this.client.send<{ nodeId: number }>('DOM.querySelector', { nodeId, selector });
    return result.nodeId;
  }

  async querySelectorAll(nodeId: number, selector: string): Promise<number[]> {
    const result = await this.client.send<{ nodeIds: number[] }>('DOM.querySelectorAll', { nodeId, selector });
    return result.nodeIds;
  }

  async getOuterHTML(nodeId: number): Promise<string> {
    const result = await this.client.send<{ outerHTML: string }>('DOM.getOuterHTML', { nodeId });
    return result.outerHTML;
  }

  async getAttributes(nodeId: number): Promise<string[]> {
    const result = await this.client.send<{ attributes: string[] }>('DOM.getAttributes', { nodeId });
    return result.attributes;
  }

  async getBoxModel(nodeId: number): Promise<BoxModel> {
    const result = await this.client.send<{ model: BoxModel }>('DOM.getBoxModel', { nodeId });
    return result.model;
  }

  async resolveNode(nodeId: number, objectGroup?: string): Promise<RemoteObject> {
    const result = await this.client.send<{ object: RemoteObject }>('DOM.resolveNode', {
      nodeId,
      objectGroup: objectGroup ?? 'dom',
    });
    return result.object;
  }

  // DOMDebugger domain
  async setDOMBreakpoint(nodeId: number, type: 'subtree-modified' | 'attribute-modified' | 'node-removed'): Promise<void> {
    await this.client.send('DOMDebugger.setDOMBreakpoint', { nodeId, type });
  }

  async removeDOMBreakpoint(nodeId: number, type: 'subtree-modified' | 'attribute-modified' | 'node-removed'): Promise<void> {
    await this.client.send('DOMDebugger.removeDOMBreakpoint', { nodeId, type });
  }

  async setEventListenerBreakpoint(eventName: string, targetName?: string): Promise<void> {
    const params: Record<string, unknown> = { eventName };
    if (targetName) params.targetName = targetName;
    await this.client.send('DOMDebugger.setEventListenerBreakpoint', params);
  }

  async removeEventListenerBreakpoint(eventName: string, targetName?: string): Promise<void> {
    const params: Record<string, unknown> = { eventName };
    if (targetName) params.targetName = targetName;
    await this.client.send('DOMDebugger.removeEventListenerBreakpoint', params);
  }

  async setXHRBreakpoint(url: string): Promise<void> {
    await this.client.send('DOMDebugger.setXHRBreakpoint', { url });
  }

  async removeXHRBreakpoint(url: string): Promise<void> {
    await this.client.send('DOMDebugger.removeXHRBreakpoint', { url });
  }

  async getEventListeners(objectId: string, depth?: number): Promise<EventListener[]> {
    const result = await this.client.send<{ listeners: EventListener[] }>('DOMDebugger.getEventListeners', {
      objectId,
      depth: depth ?? 1,
    });
    return result.listeners;
  }

  // Input domain
  async dispatchMouseEvent(
    type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel',
    x: number,
    y: number,
    options: { button?: 'none' | 'left' | 'middle' | 'right'; clickCount?: number; modifiers?: number } = {}
  ): Promise<void> {
    await this.client.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: options.button ?? 'left',
      clickCount: options.clickCount ?? 1,
      modifiers: options.modifiers ?? 0,
    });
  }

  async dispatchKeyEvent(
    type: 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char',
    options: { key?: string; code?: string; text?: string; modifiers?: number } = {}
  ): Promise<void> {
    await this.client.send('Input.dispatchKeyEvent', {
      type,
      key: options.key,
      code: options.code,
      text: options.text,
      modifiers: options.modifiers ?? 0,
    });
  }

  async insertText(text: string): Promise<void> {
    await this.client.send('Input.insertText', { text });
  }

  async synthesizeScrollGesture(
    x: number,
    y: number,
    options: { xDistance?: number; yDistance?: number; speed?: number } = {}
  ): Promise<void> {
    await this.client.send('Input.synthesizeScrollGesture', {
      x,
      y,
      xDistance: options.xDistance ?? 0,
      yDistance: options.yDistance ?? 0,
      speed: options.speed,
    });
  }

  // Log domain
  async enableLog(): Promise<void> {
    await this.client.send('Log.enable');
    this.logEnabled = true;
  }

  async disableLog(): Promise<void> {
    await this.client.send('Log.disable');
    this.logEnabled = false;
  }

  async clearLog(): Promise<void> {
    await this.client.send('Log.clear');
    this.logEntries = [];
  }

  getLogEntries(): LogEntry[] {
    return [...this.logEntries];
  }

  // ServiceWorker domain
  async enableServiceWorker(): Promise<void> {
    await this.client.send('ServiceWorker.enable');
    this.serviceWorkerEnabled = true;
  }

  async disableServiceWorker(): Promise<void> {
    await this.client.send('ServiceWorker.disable');
    this.serviceWorkerEnabled = false;
  }

  async startWorker(scopeURL: string): Promise<void> {
    await this.client.send('ServiceWorker.startWorker', { scopeURL });
  }

  async stopWorker(versionId: string): Promise<void> {
    await this.client.send('ServiceWorker.stopWorker', { versionId });
  }

  async updateRegistration(scopeURL: string): Promise<void> {
    await this.client.send('ServiceWorker.updateRegistration', { scopeURL });
  }

  async skipWaiting(scopeURL: string): Promise<void> {
    await this.client.send('ServiceWorker.skipWaiting', { scopeURL });
  }

  getServiceWorkerRegistrations(): ServiceWorkerRegistration[] {
    return Array.from(this.serviceWorkerRegistrations.values());
  }

  getServiceWorkerVersions(): ServiceWorkerVersion[] {
    return Array.from(this.serviceWorkerVersions.values());
  }

  // Page navigation
  async navigate(url: string): Promise<{ frameId: string; loaderId?: string; errorText?: string }> {
    return this.client.send('Page.navigate', { url });
  }

  async reload(ignoreCache?: boolean): Promise<void> {
    await this.client.send('Page.reload', { ignoreCache });
  }

  // Send raw CDP command
  async sendCommand<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    return this.client.send<T>(method, params);
  }
}
