import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Reply = { stdout?: string; error?: Partial<NodeJS.ErrnoException> };
let handler: (cmd: string, args: string[]) => Reply;
const calls: Array<[string, string[]]> = [];

vi.mock('child_process', () => ({
  execFile: (cmd: string, args: string[], _opts: unknown, cb: (err: Error | null, stdout: string) => void) => {
    calls.push([cmd, args]);
    const reply = handler(cmd, args);
    if (reply.error) cb(Object.assign(new Error('exec failed'), reply.error), '');
    else cb(null, reply.stdout ?? '');
  },
}));

const { raiseChromeWindow, localPort } = await import('../../src/utils/raise-window.js');

const notFound: Reply = { error: { code: '1' as unknown as string } };

// Fake X11 state: windows of PID 100, with names and visibility.
function xdotool(windows: Array<{ id: string; name: string; visible: boolean }>, activate: Reply = {}) {
  return (cmd: string, args: string[]): Reply => {
    if (cmd !== 'xdotool') return notFound;
    if (args[0] === 'windowactivate') return activate;
    const nameIdx = args.indexOf('--name');
    const re = nameIdx >= 0 ? new RegExp(args[nameIdx + 1]) : null;
    const ids = windows
      .filter((w) => (!args.includes('--onlyvisible') || w.visible) && (!re || re.test(w.name)))
      .map((w) => w.id);
    return ids.length ? { stdout: ids.join('\n') + '\n' } : notFound;
  };
}

const activated = () => calls.filter(([, a]) => a[0] === 'windowactivate').map(([, a]) => a);

describe('raiseChromeWindow', () => {
  const savedDisplay = process.env.DISPLAY;

  beforeEach(() => {
    calls.length = 0;
    process.env.DISPLAY = ':0';
  });

  afterEach(() => {
    process.env.DISPLAY = savedDisplay;
  });

  it.skipIf(process.platform !== 'linux')('activates the window whose title matches the tab, even when minimized', async () => {
    handler = xdotool([
      { id: '1', name: 'Other - Google Chrome', visible: true },
      { id: '2', name: 'My (Tab) - Google Chrome', visible: false },
    ]);
    expect(await raiseChromeWindow({ pid: 100, title: 'My (Tab)', waitMs: 0 })).toEqual({ raised: true });
    expect(activated()).toEqual([['windowactivate', '--sync', '2']]);
  });

  it.skipIf(process.platform !== 'linux')('does not treat a longer title with the same prefix as a match', async () => {
    handler = xdotool([
      { id: '1', name: 'GitHub Actions - Google Chrome', visible: true },
      { id: '2', name: 'Docs - Google Chrome', visible: true },
    ]);
    expect(await raiseChromeWindow({ pid: 100, title: 'GitHub', waitMs: 0 })).toEqual({
      raised: false,
      reason: 'ambiguous-window',
    });
    expect(activated()).toEqual([]);
  });

  it.skipIf(process.platform !== 'linux')('falls back to the only visible window when no title matches', async () => {
    handler = xdotool([{ id: '7', name: 'about:blank - Google Chrome', visible: true }]);
    expect(await raiseChromeWindow({ pid: 100, title: '', waitMs: 0 })).toEqual({ raised: true });
    expect(activated()).toEqual([['windowactivate', '--sync', '7']]);
  });

  it.skipIf(process.platform !== 'linux')('reports no-window when the process has no windows', async () => {
    handler = xdotool([]);
    expect(await raiseChromeWindow({ pid: 100, title: 'X', waitMs: 0 })).toEqual({ raised: false, reason: 'no-window' });
  });

  it.skipIf(process.platform !== 'linux')('reports activate-failed when the window manager refuses activation', async () => {
    handler = xdotool([{ id: '1', name: 'X - Google Chrome', visible: true }], { error: { killed: true } });
    expect(await raiseChromeWindow({ pid: 100, title: 'X', waitMs: 0 })).toEqual({
      raised: false,
      reason: 'activate-failed',
    });
  });

  it.skipIf(process.platform !== 'linux')('reports xdotool-missing when xdotool is not installed', async () => {
    handler = () => ({ error: { code: 'ENOENT' } });
    expect(await raiseChromeWindow({ pid: 100, title: 'X', waitMs: 0 })).toEqual({
      raised: false,
      reason: 'xdotool-missing',
    });
  });

  it.skipIf(process.platform !== 'linux')('looks up the PID from a local endpoint port', async () => {
    const x = xdotool([{ id: '1', name: 'X - Google Chrome', visible: true }]);
    handler = (cmd, args) =>
      cmd === 'ss' ? { stdout: 'LISTEN 0 10 127.0.0.1:9333 0.0.0.0:* users:(("chrome",pid=100,fd=55))' } : x(cmd, args);
    expect(await raiseChromeWindow({ endpoint: 'ws://127.0.0.1:9333/devtools/page/ABC', title: 'X', waitMs: 0 })).toEqual({
      raised: true,
    });
    expect(calls[0]).toEqual(['ss', ['-ltnpH', 'sport', '=', ':9333']]);
  });

  it.skipIf(process.platform !== 'linux')('does not look up remote endpoints locally', async () => {
    handler = () => {
      throw new Error('should not exec');
    };
    expect(await raiseChromeWindow({ endpoint: 'http://10.0.0.5:9222', title: 'X', waitMs: 0 })).toEqual({
      raised: false,
      reason: 'no-pid',
    });
    expect(calls).toEqual([]);
  });

  it('is unsupported without an X display', async () => {
    delete process.env.DISPLAY;
    expect(await raiseChromeWindow({ pid: 100, title: 'X' })).toEqual({ raised: false, reason: 'unsupported-platform' });
  });
});

describe('localPort', () => {
  it('parses loopback endpoints including IPv6', () => {
    expect(localPort('http://localhost:9222')).toBe(9222);
    expect(localPort('http://[::1]:9222')).toBe(9222);
    expect(localPort('ws://127.0.0.1:45678/devtools/browser/x')).toBe(45678);
  });

  it('rejects remote hosts and endpoints without a port', () => {
    expect(localPort('http://example.com:9222')).toBeNull();
    expect(localPort('http://localhost')).toBeNull();
    expect(localPort('not a url')).toBeNull();
  });
});
