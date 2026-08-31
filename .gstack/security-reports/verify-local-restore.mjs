import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const [workArg, backupArg] = process.argv.slice(2);
if (!workArg || !backupArg) throw new Error('Provide the temporary work folder and backup folder.');
const work = fs.realpathSync(workArg);
const backup = fs.realpathSync(backupArg);
const temp = fs.realpathSync(os.tmpdir());
if (path.dirname(work).toLowerCase() !== temp.toLowerCase() || !path.basename(work).startsWith('firmbooks-restore-')) {
  throw new Error('The test work folder must be a dedicated directory directly inside the system temporary folder.');
}
const bin = path.join(work, 'pgsql', 'bin');
const data = path.join(work, 'test-cluster');
if (fs.existsSync(data)) throw new Error('Refusing to reuse an existing database cluster.');
const dump = path.join(backup, 'database.dump');
const hash = () => crypto.createHash('sha256').update(fs.readFileSync(dump)).digest('hex');
const expected = fs.readFileSync(path.join(backup, 'SHA256SUMS'), 'utf8').match(/^([a-f0-9]{64})[ \t]+\*?database\.dump\r?$/im)?.[1];
const originalHash = hash();
if (!expected || expected.toLowerCase() !== originalHash) throw new Error('Backup checksum mismatch.');
const adminPassword = crypto.randomBytes(32).toString('hex');
const ownerPassword = crypto.randomBytes(32).toString('hex');
const passwordFile = path.join(work, 'init-password');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key) && key !== 'DATABASE_URL'));
env.PGCONNECT_TIMEOUT = '10';

function run(executable, args, logName, extraEnv = {}) {
  const logPath = path.join(work, logName);
  const fd = fs.openSync(logPath, 'w', 0o600);
  let r;
  try {
    // File descriptors avoid waiting on pipes inherited by the Windows server.
    r = spawnSync(path.join(bin, executable + '.exe'), args, {
      windowsHide: true, timeout: 120000, stdio: ['ignore', fd, fd],
      env: { ...env, ...extraEnv },
    });
  } finally {
    fs.closeSync(fd);
  }
  if (r.error || r.status !== 0) throw new Error(`${executable} failed; inspect the restricted ${logName} locally. Exit ${r.status}.`);
  return fs.readFileSync(logPath, 'utf8');
}

const socket = net.createServer();
await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const connections = [];
let startAttempted = false;
let failure;
const result = { checksumMatches: true, engine: 'PostgreSQL 16', localOnly: true, nasModified: false };
try {
  fs.writeFileSync(passwordFile, adminPassword, { mode: 0o600, flag: 'wx' });
  run('initdb', ['-D', data, '-U', 'restore_admin', '--pwfile=' + passwordFile,
    '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', '--no-instructions'], 'initdb.log');
  fs.unlinkSync(passwordFile);
  startAttempted = true;
  run('pg_ctl', ['-D', data, '-l', path.join(work, 'postgres.log'), '-o',
    `-h 127.0.0.1 -p ${port}`, '-w', '-t', '30', 'start'], 'start.log');
  const connect = async (user, password, database) => {
    const client = new pg.Client({host: '127.0.0.1', port, user, password, database, ssl: false,
      connectionTimeoutMillis: 10000, statement_timeout: 30000});
    connections.push(client);
    await client.connect();
    return client;
  };
  const admin = await connect('restore_admin', adminPassword, 'postgres');
  // The random password is hex only; the restore role is deliberately not a superuser.
  await admin.query(`CREATE ROLE restore_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${ownerPassword}'`);
  await admin.query('CREATE DATABASE firmbooks_restore OWNER restore_owner TEMPLATE template0');
  const archiveList = run('pg_restore', ['--list', dump], 'archive-list.log');
  result.archiveTableDefinitions = archiveList.split('\n').filter(line => / TABLE public /.test(line)).length;
  run('pg_restore', ['--host=127.0.0.1', '--port=' + port, '--username=restore_owner',
    '--dbname=firmbooks_restore', '--no-password', '--no-owner', '--no-acl',
    '--exit-on-error', '--single-transaction', dump], 'restore.log', { PGPASSWORD: ownerPassword });
  const client = await connect('restore_owner', ownerPassword, 'firmbooks_restore');
  result.restoreSucceeded = true;
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  result.restoredTables = tables.rows.length;
  result.tableCountMatchesArchive = result.restoredTables === result.archiveTableDefinitions;
  let totalRows = 0;
  const rowCounts = {};
  for (const {tablename} of tables.rows) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const count = Number((await client.query(`SELECT count(*) AS n FROM public.${quoted}`)).rows[0].n);
    totalRows += count;
    rowCounts[tablename] = count;
  }
  result.totalRows = totalRows;
  if ('journal_entries' in rowCounts && 'journal_lines' in rowCounts) {
    result.postedJournals = Number((await client.query("SELECT count(*) AS n FROM journal_entries WHERE status='Posted'")).rows[0].n);
    result.postedJournalsMissingLinesOrUnbalanced = Number((await client.query(`
      SELECT count(*) AS n FROM (
        SELECT je.id FROM journal_entries je
        LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
        WHERE je.status = 'Posted'
        GROUP BY je.id
        HAVING count(jl.id) = 0 OR abs(COALESCE(sum(jl.debit),0) - COALESCE(sum(jl.credit),0)) > 0.009
      ) invalid_entries
    `)).rows[0].n);
    result.accountingCheckCoverage = result.postedJournals > 0 ? 'posted journals checked' : 'no posted journals to exercise accounting reconciliation';
  }
  result.unvalidatedConstraints = Number((await client.query("SELECT count(*) AS n FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated")).rows[0].n);
  fs.writeFileSync(path.join(work, 'row-counts.json'), JSON.stringify(rowCounts, null, 2), { mode: 0o600 });
} catch (err) {
  failure = err;
  result.restoreSucceeded = false;
  result.error = err.message;
} finally {
  for (const client of connections) await client.end().catch(() => {});
  if (fs.existsSync(passwordFile)) fs.unlinkSync(passwordFile);
  if (startAttempted) {
    try {
      run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop'], 'stop.log');
      result.testServerStopped = true;
    } catch (err) {
      result.testServerStopped = false;
      result.shutdownError = err.message;
      failure ??= err;
    }
  }
  result.sourceBackupUnchanged = hash() === originalHash;
  fs.writeFileSync(path.join(work, 'restore-result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result));
}
if (failure) process.exitCode = 1;
