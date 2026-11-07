import { execFile } from 'child_process';
import { promisify } from 'util';
import createDebug from 'debug';

const debug = createDebug('cdp:raise-window');
const exec = promisify(execFile);

async function run(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await exec(cmd, args, { timeout: 3000 });
  return stdout.trim();
}

// PID of the process listening on a local TCP port (same-user processes only).
async function pidForPort(port: number): Promise<number | null> {
  const out = await run('ss', ['-ltnpH', 'sport', '=', `:${port}`]);
  const match = out.match(/pid=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Window managers (e.g. XFCE, GNOME) often refuse Chrome's own raise request
 * because of focus-stealing prevention. xdotool activates the window as a pager
 * would, which they honor. Linux/X11 only; returns false when unsupported.
 */
export async function raiseChromeWindow(opts: { pid?: number; port?: number; title: string }): Promise<boolean> {
  if (process.platform !== 'linux' || !process.env.DISPLAY) return false;
  try {
    const pid = opts.pid ?? (opts.port ? await pidForPort(opts.port) : null);
    if (!pid) return false;

    const ids = (await run('xdotool', ['search', '--onlyvisible', '--pid', String(pid)]).catch(() => ''))
      .split('\n')
      .filter(Boolean);
    if (ids.length === 0) return false;

    // The activated tab's title is the window title prefix, which picks the
    // right window when the browser has several.
    let windowId = ids[0];
    for (const id of ids) {
      const name = await run('xdotool', ['getwindowname', id]).catch(() => '');
      if (opts.title && name.startsWith(opts.title)) {
        windowId = id;
        break;
      }
    }

    await run('xdotool', ['windowactivate', windowId]);
    return true;
  } catch (e) {
    debug('raise failed: %s', e instanceof Error ? e.message : String(e));
    return false;
  }
}
