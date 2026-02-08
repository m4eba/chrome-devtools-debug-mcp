// Chrome DevTools Protocol Types

export interface CDPMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: CDPError;
}

export interface CDPError {
  code: number;
  message: string;
  data?: unknown;
}

export interface CDPRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface CDPResponse {
  id: number;
  result?: unknown;
  error?: CDPError;
}

export interface CDPEvent {
  method: string;
  params: Record<string, unknown>;
}

// Target types
export interface TargetInfo {
  targetId: string;
  type: 'page' | 'iframe' | 'worker' | 'service_worker' | 'shared_worker' | 'browser' | 'other';
  title: string;
  url: string;
  attached: boolean;
  canAccessOpener: boolean;
  browserContextId?: string;
}

// Debugger types
export interface Location {
  scriptId: string;
  lineNumber: number;
  columnNumber?: number;
}

export interface CallFrame {
  callFrameId: string;
  functionName: string;
  functionLocation?: Location;
  location: Location;
  url: string;
  scopeChain: Scope[];
  this: RemoteObject;
  returnValue?: RemoteObject;
}

export interface Scope {
  type: 'global' | 'local' | 'with' | 'closure' | 'catch' | 'block' | 'script' | 'eval' | 'module' | 'wasm-expression-stack';
  object: RemoteObject;
  name?: string;
  startLocation?: Location;
  endLocation?: Location;
}

export interface BreakpointInfo {
  breakpointId: string;
  locations: Location[];
}

export interface ScriptInfo {
  scriptId: string;
  url: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  executionContextId: number;
  hash: string;
  isModule?: boolean;
  length?: number;
  sourceMapURL?: string;
  hasSourceURL?: boolean;
}

// Runtime types
export interface RemoteObject {
  type: 'object' | 'function' | 'undefined' | 'string' | 'number' | 'boolean' | 'symbol' | 'bigint';
  subtype?: 'array' | 'null' | 'node' | 'regexp' | 'date' | 'map' | 'set' | 'weakmap' | 'weakset' | 'iterator' | 'generator' | 'error' | 'proxy' | 'promise' | 'typedarray' | 'arraybuffer' | 'dataview' | 'webassemblymemory' | 'wasmvalue';
  className?: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
  objectId?: string;
  preview?: ObjectPreview;
}

export interface ObjectPreview {
  type: string;
  subtype?: string;
  description?: string;
  overflow: boolean;
  properties: PropertyPreview[];
  entries?: EntryPreview[];
}

export interface PropertyPreview {
  name: string;
  type: string;
  value?: string;
  valuePreview?: ObjectPreview;
  subtype?: string;
}

export interface EntryPreview {
  key?: ObjectPreview;
  value: ObjectPreview;
}

export interface PropertyDescriptor {
  name: string;
  value?: RemoteObject;
  writable?: boolean;
  get?: RemoteObject;
  set?: RemoteObject;
  configurable: boolean;
  enumerable: boolean;
  wasThrown?: boolean;
  isOwn?: boolean;
  symbol?: RemoteObject;
}

export interface ExecutionContextDescription {
  id: number;
  origin: string;
  name: string;
  auxData?: Record<string, unknown>;
}

export interface ExceptionDetails {
  exceptionId: number;
  text: string;
  lineNumber: number;
  columnNumber: number;
  scriptId?: string;
  url?: string;
  stackTrace?: StackTrace;
  exception?: RemoteObject;
  executionContextId?: number;
}

export interface StackTrace {
  description?: string;
  callFrames: CallFrameInfo[];
  parent?: StackTrace;
  parentId?: { id: string; debuggerId?: string };
}

export interface CallFrameInfo {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface ConsoleMessage {
  source: string;
  level: 'log' | 'debug' | 'info' | 'error' | 'warning';
  text: string;
  url?: string;
  line?: number;
  column?: number;
  timestamp: number;
  args?: RemoteObject[];
  stackTrace?: StackTrace;
}

// Network types
export interface NetworkRequest {
  requestId: string;
  loaderId: string;
  documentURL: string;
  request: RequestData;
  timestamp: number;
  wallTime: number;
  initiator: Initiator;
  redirectResponse?: ResponseData;
  type: ResourceType;
  frameId?: string;
}

export interface RequestData {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  hasPostData?: boolean;
  mixedContentType?: string;
  initialPriority: string;
  referrerPolicy: string;
}

export interface ResponseData {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType: string;
  connectionReused: boolean;
  connectionId: number;
  encodedDataLength: number;
  timing?: ResourceTiming;
  protocol?: string;
  securityState: string;
}

export interface ResourceTiming {
  requestTime: number;
  proxyStart: number;
  proxyEnd: number;
  dnsStart: number;
  dnsEnd: number;
  connectStart: number;
  connectEnd: number;
  sslStart: number;
  sslEnd: number;
  workerStart: number;
  workerReady: number;
  sendStart: number;
  sendEnd: number;
  pushStart: number;
  pushEnd: number;
  receiveHeadersEnd: number;
}

export interface Initiator {
  type: 'parser' | 'script' | 'preload' | 'SignedExchange' | 'preflight' | 'other';
  stack?: StackTrace;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export type ResourceType =
  | 'Document' | 'Stylesheet' | 'Image' | 'Media' | 'Font'
  | 'Script' | 'TextTrack' | 'XHR' | 'Fetch' | 'Prefetch'
  | 'EventSource' | 'WebSocket' | 'Manifest' | 'SignedExchange'
  | 'Ping' | 'CSPViolationReport' | 'Preflight' | 'Other';

// Fetch interception types
export interface RequestPattern {
  urlPattern?: string;
  resourceType?: ResourceType;
  requestStage?: 'Request' | 'Response';
}

export interface FetchRequestPaused {
  requestId: string;
  request: RequestData;
  frameId: string;
  resourceType: ResourceType;
  responseErrorReason?: string;
  responseStatusCode?: number;
  responseStatusText?: string;
  responseHeaders?: HeaderEntry[];
  networkId?: string;
}

export interface HeaderEntry {
  name: string;
  value: string;
}

// DOM types
export interface DOMNode {
  nodeId: number;
  parentId?: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  localName: string;
  nodeValue: string;
  childNodeCount?: number;
  children?: DOMNode[];
  attributes?: string[];
  documentURL?: string;
  baseURL?: string;
  publicId?: string;
  systemId?: string;
  internalSubset?: string;
  xmlVersion?: string;
  name?: string;
  value?: string;
  pseudoType?: string;
  shadowRootType?: string;
  frameId?: string;
  contentDocument?: DOMNode;
  shadowRoots?: DOMNode[];
  templateContent?: DOMNode;
  pseudoElements?: DOMNode[];
  importedDocument?: DOMNode;
  distributedNodes?: BackendNode[];
  isSVG?: boolean;
}

export interface BackendNode {
  nodeType: number;
  nodeName: string;
  backendNodeId: number;
}

export interface BoxModel {
  content: number[];
  padding: number[];
  border: number[];
  margin: number[];
  width: number;
  height: number;
}

// Log types
export interface LogEntry {
  source: 'xml' | 'javascript' | 'network' | 'storage' | 'appcache' | 'rendering' | 'security' | 'deprecation' | 'worker' | 'violation' | 'intervention' | 'recommendation' | 'other';
  level: 'verbose' | 'info' | 'warning' | 'error';
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
  stackTrace?: StackTrace;
  networkRequestId?: string;
  workerId?: string;
  args?: RemoteObject[];
}

// ServiceWorker types
export interface ServiceWorkerRegistration {
  registrationId: string;
  scopeURL: string;
  isDeleted: boolean;
}

export interface ServiceWorkerVersion {
  versionId: string;
  registrationId: string;
  scriptURL: string;
  runningStatus: 'stopped' | 'starting' | 'running' | 'stopping';
  status: 'new' | 'installing' | 'installed' | 'activating' | 'activated' | 'redundant';
  scriptLastModified?: number;
  scriptResponseTime?: number;
  controlledClients?: string[];
  targetId?: string;
}

// Event listener types
export interface EventListener {
  type: string;
  useCapture: boolean;
  passive: boolean;
  once: boolean;
  scriptId: string;
  lineNumber: number;
  columnNumber: number;
  handler?: RemoteObject;
  originalHandler?: RemoteObject;
  backendNodeId?: number;
}
