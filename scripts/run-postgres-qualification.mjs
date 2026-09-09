import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('PostgreSQL qualification requires DATABASE_URL for an isolated disposable database.');
  process.exit(2);
}

if (process.env.DATABASE_MODE === 'memory' || process.env.USE_PG_MEM === 'true') {
  console.error('PostgreSQL qualification refuses memory-database configuration.');
  process.exit(2);
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  command,
  ['vitest', 'run', 'server/src/tests/realPostgresQualification.test.ts', '--configLoader', 'native'],
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

process.exit(result.status ?? 1);
