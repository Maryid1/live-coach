import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
function run(command, args) { const r = spawnSync(command, args, { stdio: 'inherit' }); if (r.status !== 0) process.exit(r.status || 1); }
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'selfhost/vite.config.mjs']);
const out = 'outputs/selfhost';
mkdirSync(out, { recursive: true });
for (const name of ['server.mjs', 'assist.mjs', 'Dockerfile', 'compose.yaml', '.env.example', '.dockerignore', 'README.md', 'UPDATE-v2.md', 'UPDATE-v3.md', 'UPDATE-v4.md']) copyFileSync(`selfhost/${name}`, `${out}/${name}`);
run('tar', ['-czf', 'outputs/live-coach-selfhost.tar.gz', '-C', out, '.']);
console.log(path.resolve('outputs/live-coach-selfhost.tar.gz'));
