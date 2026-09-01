import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputFile = resolve(repositoryRoot, 'dist/server.cjs');

await build({
  absWorkingDir: repositoryRoot,
  entryPoints: [resolve(repositoryRoot, 'server.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  packages: 'external',
  outfile: outputFile,
  sourcemap: true,
  logLevel: 'info',
});

if (!existsSync(outputFile)) {
  throw new Error('Server build did not produce dist/server.cjs');
}
