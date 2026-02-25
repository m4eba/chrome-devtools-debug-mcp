import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import createDebug from 'debug';

const debug = createDebug('cdp:launcher');

export interface LaunchOptions {
  chromePath?: string;
  headless?: boolean;
  port?: number;
  userDataDir?: string;
  args?: string[];
}

export interface LaunchResult {
  process: ChildProcess;
  wsEndpoint: string;
  userDataDir: string;
  port: number;
  kill: () => Promise<void>;
}

const DEFAULT_ARGS = [
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-component-extensions-with-background-pages',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-sync',
  '--enable-features=NetworkService,NetworkServiceInProcess',
  '--force-color-profile=srgb',
  '--metrics-recording-only',
  '--no-first-run',
  '--password-store=basic',
  '--use-mock-keychain',
];

export function findChrome(): string | null {
  const candidates = [
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Check PATH
  const chromePaths = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];
  for (const name of chromePaths) {
    try {
      const { execSync } = require('child_process');
      const path = execSync(`which ${name} 2>/dev/null`, { encoding: 'utf8' }).trim();
      if (path && existsSync(path)) {
        return path;
      }
    } catch {
      // Continue searching
    }
  }

  return null;
}

export async function launchChrome(options: LaunchOptions = {}): Promise<LaunchResult> {
  const chromePath = options.chromePath ?? findChrome();
  if (!chromePath) {
    throw new Error('Chrome executable not found. Please specify chromePath.');
  }

  const port = options.port ?? 9222;
  const headless = options.headless ?? false;

  let userDataDir = options.userDataDir;
  let tempDir = false;
  if (!userDataDir) {
    userDataDir = await mkdtemp(join(tmpdir(), 'chrome-debug-'));
    tempDir = true;
  }

  const args = [
    ...DEFAULT_ARGS,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    ...(headless ? ['--headless=new'] : []),
    ...(options.args ?? []),
    'about:blank',
  ];

  debug('Launching Chrome: %s %o', chromePath, args);

  const chromeProcess = spawn(chromePath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  let wsEndpoint = '';
  let stderrBuffer = '';

  // Wait for the WebSocket endpoint
  const wsEndpointPromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for Chrome DevTools WebSocket endpoint'));
    }, 30000);

    chromeProcess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderrBuffer += chunk;
      debug('Chrome stderr: %s', chunk);

      // Look for WebSocket endpoint URL
      const match = stderrBuffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });

    chromeProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    chromeProcess.on('exit', (code) => {
      clearTimeout(timeout);
      if (!wsEndpoint) {
        reject(new Error(`Chrome exited with code ${code} before providing WebSocket endpoint`));
      }
    });
  });

  try {
    wsEndpoint = await wsEndpointPromise;
  } catch (err) {
    chromeProcess.kill('SIGKILL');
    if (tempDir) {
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    }
    throw err;
  }

  debug('Chrome launched, WebSocket endpoint: %s', wsEndpoint);

  // Parse actual port from wsEndpoint (e.g., ws://127.0.0.1:45678/devtools/...)
  const portMatch = wsEndpoint.match(/:(\d+)\//);
  const actualPort = portMatch ? parseInt(portMatch[1], 10) : port;

  const kill = async (): Promise<void> => {
    return new Promise((resolve) => {
      if (chromeProcess.killed) {
        resolve();
        return;
      }

      chromeProcess.on('exit', () => {
        if (tempDir) {
          rm(userDataDir!, { recursive: true, force: true }).catch(() => {});
        }
        resolve();
      });

      chromeProcess.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (!chromeProcess.killed) {
          chromeProcess.kill('SIGKILL');
        }
      }, 5000);
    });
  };

  return {
    process: chromeProcess,
    wsEndpoint,
    userDataDir,
    port: actualPort,
    kill,
  };
}

export async function getTargets(httpUrl: string): Promise<Array<{ id: string; type: string; title: string; url: string; webSocketDebuggerUrl?: string }>> {
  const response = await fetch(`${httpUrl}/json/list`);
  if (!response.ok) {
    throw new Error(`Failed to get targets: ${response.statusText}`);
  }
  return response.json() as Promise<Array<{ id: string; type: string; title: string; url: string; webSocketDebuggerUrl?: string }>>;
}

export async function getVersion(httpUrl: string): Promise<{ Browser: string; 'Protocol-Version': string; 'User-Agent': string; 'V8-Version': string; 'WebKit-Version': string; webSocketDebuggerUrl: string }> {
  const response = await fetch(`${httpUrl}/json/version`);
  if (!response.ok) {
    throw new Error(`Failed to get version: ${response.statusText}`);
  }
  return response.json() as Promise<{ Browser: string; 'Protocol-Version': string; 'User-Agent': string; 'V8-Version': string; 'WebKit-Version': string; webSocketDebuggerUrl: string }>;
}
