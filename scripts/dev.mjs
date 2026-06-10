/**
 * Dev runner — starts the backend and the frontend together.
 *
 * Uses only Node built-ins on purpose. A runner that needs its own dependency
 * installed before it can run is a runner that fails on a fresh clone with
 * "'concurrently' is not recognized as an internal or external command".
 *
 *   npm run dev
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

const SERVICES = [
  { name: 'api', cwd: join(root, 'backend'), color: '\x1b[36m' }, // cyan
  { name: 'web', cwd: join(root, 'frontend'), color: '\x1b[35m' }, // magenta
];

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const children = [];
let shuttingDown = false;

/** Prefix every line of a chunk with the service name, e.g. "[api] ...". */
const prefixer = (name, color, stream) => (chunk) => {
  const tag = `${color}[${name}]${RESET} `;
  for (const line of chunk.toString().split('\n')) {
    if (line.trim() !== '') stream.write(tag + line + '\n');
  }
};

const start = ({ name, cwd, color }) => {
  // A shell is needed on Windows to resolve npm.cmd off PATH. The command is
  // passed as one literal string (rather than command + args) so Node doesn't
  // warn about unescaped arguments — there is no interpolation here to escape.
  const child = spawn('npm run dev', {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout.on('data', prefixer(name, color, process.stdout));
  child.stderr.on('data', prefixer(name, color, process.stderr));

  child.on('error', (err) => {
    console.error(`${color}[${name}]${RESET} failed to start: ${err.message}`);
    shutdown(1);
  });

  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`${color}[${name}]${RESET} exited with code ${code}`);
    // One service dying makes the other useless — take both down so the
    // failure is obvious instead of half a stack silently running.
    shutdown(code ?? 1);
  });

  children.push(child);
  return child;
};

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) {
      // On Windows a plain kill leaves the npm shell's grandchild running.
      if (isWindows) {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    }
  }
  setTimeout(() => process.exit(code), 500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`${DIM}Starting backend (:9000) and frontend (:5173) — Ctrl+C to stop both${RESET}\n`);
SERVICES.forEach(start);
