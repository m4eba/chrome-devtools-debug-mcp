import { execFile } from 'child_process';
import createDebug from 'debug';

const debug = createDebug('cdp:raise-window');

export type RaiseFailure =
  | 'unsupported-platform'
  | 'xdotool-missing'
  | 'no-pid'
  | 'no-window'
  | 'ambiguous-window'
  | 'activate-failed';

export type RaiseResult = { raised: true } | { raised: false; reason: RaiseFailure };

export interface RaiseOptions {
  // PID of a Chrome we launched ourselves.
  pid?: number;
  // HTTP or WebSocket debug endpoint; its port locates the PID of a local Chrome.
  endpoint?: string;
  // Title of the activated tab; Chrome titles its window "<tab title> - <browser>".
  title: string;
  // How long to wait for the window title to reflect the activated tab.
  waitMs?: number;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const POLL_INTERVAL_MS = 100;

class RaiseError extends Error {
  constructor(readonly reason: RaiseFailure) {
    super(reason);
  }
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout) => {
      if (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT' && cmd === 'xdotool') {
          reject(new RaiseError('xdotool-missing'));
        } else {
          reject(err);
        }
        return;
      }
      resolve(String(stdout).trim());
    });
  });
}

// xdotool search exits 1 when nothing matches.
async function searchWindows(args: string[]): Promise<string[]> {
  try {
    return (await run('xdotool', ['search', ...args])).split('\n').filter(Boolean);
  } catch (e) {
    if (e instanceof RaiseError) throw e;
    return [];
  }
}

/** Port of a debug endpoint on this machine; null for remote hosts. */
export function localPort(endpoint: string): number | null {
  try {
    const url = new URL(endpoint);
    if (!LOOPBACK_HOSTS.has(url.hostname) || !url.port) return null;
    return parseInt(url.port, 10);
  } catch {
    return null;
  }
}

// PID of the process listening on a local TCP port (same-user processes only).
async function pidForPort(port: number): Promise<number | null> {
  try {
    const out = await run('ss', ['-ltnpH', 'sport', '=', `:${port}`]);
    const match = out.match(/pid=(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findWindow(pid: number, title: string, waitMs: number): Promise<string> {
  const deadline = Date.now() + waitMs;
  // The window title updates asynchronously after the tab is activated, so poll.
  // Unfiltered by visibility so minimized windows / other workspaces still match.
  if (title) {
    for (;;) {
      const matches = await searchWindows(['--pid', String(pid), '--name', `^${escapeRegex(title)} - `]);
      if (matches.length > 0) {
        const visible = new Set(await searchWindows(['--onlyvisible', '--pid', String(pid)]));
        return matches.find((id) => visible.has(id)) ?? matches[0];
      }
      if (Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  const visible = await searchWindows(['--onlyvisible', '--pid', String(pid)]);
  if (visible.length === 1) return visible[0];
  throw new RaiseError(visible.length === 0 ? 'no-window' : 'ambiguous-window');
}

/**
 * Window managers (e.g. XFCE, GNOME) often refuse Chrome's own raise request
 * because of focus-stealing prevention. xdotool activates the window as a pager
 * would, which they honor. Linux/X11 only.
 */
export async function raiseChromeWindow(opts: RaiseOptions): Promise<RaiseResult> {
  if (process.platform !== 'linux' || !process.env.DISPLAY) {
    return { raised: false, reason: 'unsupported-platform' };
  }
  try {
    const port = opts.endpoint ? localPort(opts.endpoint) : null;
    const portPid = opts.pid === undefined && port !== null ? await pidForPort(port) : null;
    const pid = opts.pid ?? portPid;
    if (!pid) return { raised: false, reason: 'no-pid' };

    const windowId = await findWindow(pid, opts.title, opts.waitMs ?? 500);
    try {
      // --sync waits until the window is actually active; the 3s exec timeout
      // turns a refused activation into a failure instead of a false success.
      await run('xdotool', ['windowactivate', '--sync', windowId]);
    } catch (e) {
      if (e instanceof RaiseError) throw e;
      return { raised: false, reason: 'activate-failed' };
    }
    return { raised: true };
  } catch (e) {
    if (e instanceof RaiseError) return { raised: false, reason: e.reason };
    debug('raise failed: %s', e instanceof Error ? e.message : String(e));
    return { raised: false, reason: 'activate-failed' };
  }
}
