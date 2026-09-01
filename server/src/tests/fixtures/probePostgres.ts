import pg from 'pg';
const { Client } = pg;

async function probe() {
  const connectionStrings = [
    process.env.DATABASE_URL,
    'postgresql://postgres:M8VQdr1TdiH699MioeIhg7USh6bP2YlCLnAXHCF2@localhost:5432/postgres',
    'postgresql://postgres:M8VQdr1TdiH699MioeIhg7USh6bP2YlCLnAXHCF2@localhost:5432/firmbooks',
    'postgresql://postgres:postgres@localhost:5432/postgres',
    'postgresql://postgres:postgres@localhost:5432/firmbooks',
    'postgresql://postgres@localhost:5432/postgres',
  ].filter(Boolean) as string[];

  console.log('--- Probing PostgreSQL Candidates ---');
  for (const conn of connectionStrings) {
    const masked = conn.replace(/:[^:@]+@/, ':***@');
    try {
      const client = new Client({ connectionString: conn });
      await client.connect();
      const res = await client.query('SELECT version(), current_database(), current_user, current_setting(\'default_transaction_isolation\') as isolation');
      console.log(`SUCCESS [${masked}]:`, res.rows[0]);
      await client.end();
      return { success: true, connectionString: conn, info: res.rows[0] };
    } catch (e: any) {
      console.log(`FAILED [${masked}]:`, e.message);
    }
  }
  return { success: false };
}

probe().then(r => {
  console.log('Probe result:', r);
});
