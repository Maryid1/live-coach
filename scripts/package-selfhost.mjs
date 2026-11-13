import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';
function run(command, args) { const r = spawnSync(command, args, { stdio: 'inherit' }); if (r.status !== 0) process.exit(r.status || 1); }
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'selfhost/vite.config.mjs']);
const out = 'outputs/selfhost';
mkdirSync(out, { recursive: true });
for (const name of ['server.mjs', 'asr.mjs', 'package.json', 'package-lock.json', 'scripts-store.mjs', 'assist.mjs', 'Dockerfile', 'compose.yaml', '.env.example', '.dockerignore', 'README.md', 'UPDATE-v2.md', 'UPDATE-v3.md', 'UPDATE-v4.md', 'UPDATE-v5.md', 'UPDATE-v6.md', 'UPDATE-v7.md']) copyFileSync(`selfhost/${name}`, `${out}/${name}`);
// 只打包锁定的纯 JavaScript 依赖，服务器构建无需访问 npm，也不复制本地配置。
cpSync('selfhost/node_modules/ws', `${out}/node_modules/ws`, { recursive: true });
run('tar', ['-czf', 'outputs/live-coach-selfhost.tar.gz', '-C', out, '.']);
console.log(path.resolve('outputs/live-coach-selfhost.tar.gz'));
