import type { ConsoleMessage, RemoteObject, StackTrace, ExceptionDetails } from '../utils/types.js';

export interface CollectedConsoleMessage {
  id: number;
  type: string;
  level: string;
  text: string;
  args?: RemoteObject[];
  url?: string;
  line?: number;
  column?: number;
  stackTrace?: StackTrace;
  timestamp: number;
  executionContextId?: number;
}

export interface CollectedException {
  id: number;
  timestamp: number;
  details: ExceptionDetails;
}

export class ConsoleState {
  private messages: CollectedConsoleMessage[] = [];
  private exceptions: CollectedException[] = [];
  private enabled = false;
  private maxMessages = 1000;
  private messageIdCounter = 0;
  private exceptionIdCounter = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Console API calls
  onConsoleAPICalled(params: {
    type: string;
    args: RemoteObject[];
    executionContextId: number;
    timestamp: number;
    stackTrace?: StackTrace;
  }): CollectedConsoleMessage {
    // Convert args to text
    const text = params.args
      .map((arg) => {
        if (arg.type === 'string') return arg.value as string;
        if (arg.type === 'undefined') return 'undefined';
        if (arg.value !== undefined) return String(arg.value);
        if (arg.description) return arg.description;
        return `[${arg.type}]`;
      })
      .join(' ');

    const msg: CollectedConsoleMessage = {
      id: ++this.messageIdCounter,
      type: params.type,
      level: this.typeToLevel(params.type),
      text,
      args: params.args,
      stackTrace: params.stackTrace,
      timestamp: params.timestamp,
      executionContextId: params.executionContextId,
    };

    // Extract location from stack trace
    if (params.stackTrace?.callFrames?.[0]) {
      const frame = params.stackTrace.callFrames[0];
      msg.url = frame.url;
      msg.line = frame.lineNumber;
      msg.column = frame.columnNumber;
    }

    this.addMessage(msg);
    return msg;
  }

  onExceptionThrown(params: {
    timestamp: number;
    exceptionDetails: ExceptionDetails;
  }): CollectedException {
    const exc: CollectedException = {
      id: ++this.exceptionIdCounter,
      timestamp: params.timestamp,
      details: params.exceptionDetails,
    };

    this.addException(exc);
    return exc;
  }

  private typeToLevel(type: string): string {
    switch (type) {
      case 'error':
      case 'assert':
        return 'error';
      case 'warning':
      case 'warn':
        return 'warning';
      case 'info':
        return 'info';
      case 'debug':
      case 'trace':
        return 'debug';
      default:
        return 'log';
    }
  }

  private addMessage(msg: CollectedConsoleMessage): void {
    if (this.messages.length >= this.maxMessages) {
      this.messages.shift();
    }
    this.messages.push(msg);
  }

  private addException(exc: CollectedException): void {
    if (this.exceptions.length >= this.maxMessages) {
      this.exceptions.shift();
    }
    this.exceptions.push(exc);
  }

  // Query messages
  getMessages(): CollectedConsoleMessage[] {
    return [...this.messages];
  }

  getMessagesByLevel(level: string): CollectedConsoleMessage[] {
    return this.messages.filter((m) => m.level === level);
  }

  getMessagesByType(type: string): CollectedConsoleMessage[] {
    return this.messages.filter((m) => m.type === type);
  }

  getErrors(): CollectedConsoleMessage[] {
    return this.getMessagesByLevel('error');
  }

  getWarnings(): CollectedConsoleMessage[] {
    return this.getMessagesByLevel('warning');
  }

  getExceptions(): CollectedException[] {
    return [...this.exceptions];
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  getExceptionCount(): number {
    return this.exceptions.length;
  }

  clear(): void {
    this.messages = [];
    this.exceptions = [];
  }

  setMaxMessages(max: number): void {
    this.maxMessages = max;
    while (this.messages.length > max) {
      this.messages.shift();
    }
    while (this.exceptions.length > max) {
      this.exceptions.shift();
    }
  }

  // Summary for debugging
  getSummary(): {
    total: number;
    errors: number;
    warnings: number;
    exceptions: number;
  } {
    let errors = 0;
    let warnings = 0;

    for (const msg of this.messages) {
      if (msg.level === 'error') errors++;
      else if (msg.level === 'warning') warnings++;
    }

    return {
      total: this.messages.length,
      errors,
      warnings,
      exceptions: this.exceptions.length,
    };
  }
}
