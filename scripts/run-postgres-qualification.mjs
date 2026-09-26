import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('PostgreSQL qualification requires DATABASE_URL for an isolated disposable database.');
  process.exit(2);
}

if (process.env.DATABASE_MODE === 'memory' || process.env.USE_PG_MEM === 'true') {
  console.error('PostgreSQL qualification refuses memory-database configuration.');
  process.exit(2);
}

const vitestCli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const result = spawnSync(
  process.execPath,
  [vitestCli, 'run', 'server/src/tests/realPostgresQualification.test.ts', '--configLoader', 'native'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      REQUIRE_REAL_POSTGRES: 'true',
      DATABASE_MODE: 'postgres',
      USE_PG_MEM: 'false',
    },
  },
);

if (result.error) {
  console.error('Failed to start PostgreSQL qualification:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
