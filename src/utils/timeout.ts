import type { DebugState } from '../state/DebugState.js';

export interface SafeEvalOptions {
  timeout?: number;
  allowWhilePaused?: boolean;
  forceResume?: boolean;
}

export class PausedError extends Error {
  constructor(reason?: string) {
    super(`Execution blocked: debugger is paused${reason ? ` (${reason})` : ''}`);
    this.name = 'PausedError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(message ?? `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function checkPauseState(debugState: DebugState, options: SafeEvalOptions = {}): void {
  if (debugState.isPaused() && !options.allowWhilePaused && !options.forceResume) {
    const pauseState = debugState.getPauseState();
    throw new PausedError(pauseState.reason);
  }
}

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
