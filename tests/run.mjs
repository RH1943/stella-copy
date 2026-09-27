import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('tests/.build', { recursive: true });
try {
  await build({ entryPoints: ['tests/core.test.ts'], outfile: 'tests/.build/core.test.cjs', bundle: true, platform: 'node', format: 'cjs' });
  const result = spawnSync(process.execPath, ['--test', 'tests/.build/core.test.cjs'], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm('tests/.build', { recursive: true, force: true }); }
