import type { CallFrame, Location, BreakpointInfo, ExceptionDetails } from '../utils/types.js';

export interface PauseState {
  isPaused: boolean;
  reason?: string;
  callFrames?: CallFrame[];
  data?: Record<string, unknown>;
  asyncStackTrace?: unknown;
  hitBreakpoints?: string[];
}

export interface ManagedBreakpoint {
  id: string;
  url?: string;
  urlRegex?: string;
  scriptId?: string;
  lineNumber: number;
  columnNumber?: number;
  condition?: string;
  locations: Location[];
  enabled: boolean;
}

export type PauseOnExceptionsState = 'none' | 'uncaught' | 'all';

export class DebugState {
  private pauseState: PauseState = { isPaused: false };
  private breakpoints = new Map<string, ManagedBreakpoint>();
  private pauseOnExceptions: PauseOnExceptionsState = 'none';
  private enabled = false;
  private asyncStackTraceDepth = 0;
  private lastException: ExceptionDetails | null = null;

  // Pause state management
  setPaused(
    reason: string,
    callFrames: CallFrame[],
    data?: Record<string, unknown>,
    asyncStackTrace?: unknown,
    hitBreakpoints?: string[]
  ): void {
    this.pauseState = {
      isPaused: true,
      reason,
      callFrames,
      data,
      asyncStackTrace,
      hitBreakpoints,
    };
  }

  setResumed(): void {
    this.pauseState = { isPaused: false };
  }

  getPauseState(): PauseState {
    return { ...this.pauseState };
  }

  isPaused(): boolean {
    return this.pauseState.isPaused;
  }

  getCallFrames(): CallFrame[] {
    return this.pauseState.callFrames ?? [];
  }

  getCallFrame(index: number): CallFrame | undefined {
    return this.pauseState.callFrames?.[index];
  }

  getTopCallFrame(): CallFrame | undefined {
    return this.pauseState.callFrames?.[0];
  }

  // Breakpoint management
  addBreakpoint(breakpoint: ManagedBreakpoint): void {
    this.breakpoints.set(breakpoint.id, breakpoint);
  }

  removeBreakpoint(breakpointId: string): boolean {
    return this.breakpoints.delete(breakpointId);
  }

  getBreakpoint(breakpointId: string): ManagedBreakpoint | undefined {
    return this.breakpoints.get(breakpointId);
  }

  getAllBreakpoints(): ManagedBreakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  updateBreakpointLocations(breakpointId: string, locations: Location[]): void {
    const bp = this.breakpoints.get(breakpointId);
    if (bp) {
      bp.locations = locations;
    }
  }

  findBreakpointByLocation(scriptId: string, lineNumber: number, columnNumber?: number): ManagedBreakpoint | undefined {
    for (const bp of this.breakpoints.values()) {
      for (const loc of bp.locations) {
        if (loc.scriptId === scriptId && loc.lineNumber === lineNumber) {
          if (columnNumber === undefined || loc.columnNumber === columnNumber) {
            return bp;
          }
        }
      }
    }
    return undefined;
  }

  clearBreakpoints(): void {
    this.breakpoints.clear();
  }

  // Exception handling
  setPauseOnExceptions(state: PauseOnExceptionsState): void {
    this.pauseOnExceptions = state;
  }

  getPauseOnExceptions(): PauseOnExceptionsState {
    return this.pauseOnExceptions;
  }

  setLastException(exception: ExceptionDetails | null): void {
    this.lastException = exception;
  }

  getLastException(): ExceptionDetails | null {
    return this.lastException;
  }

  // Enable state
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Async stack trace depth
  setAsyncStackTraceDepth(depth: number): void {
    this.asyncStackTraceDepth = depth;
  }

  getAsyncStackTraceDepth(): number {
    return this.asyncStackTraceDepth;
  }

  // Reset state
  reset(): void {
    this.pauseState = { isPaused: false };
    this.breakpoints.clear();
    this.pauseOnExceptions = 'none';
    this.asyncStackTraceDepth = 0;
    this.lastException = null;
  }

  // Serialize state for debugging
  toJSON(): object {
    return {
      enabled: this.enabled,
      isPaused: this.pauseState.isPaused,
      pauseReason: this.pauseState.reason,
      callFrameCount: this.pauseState.callFrames?.length ?? 0,
      breakpointCount: this.breakpoints.size,
      pauseOnExceptions: this.pauseOnExceptions,
      asyncStackTraceDepth: this.asyncStackTraceDepth,
    };
  }
}
