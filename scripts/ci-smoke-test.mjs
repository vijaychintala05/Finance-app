// Real PostgreSQL End-to-End Container Mutation Smoke Test
// Run in CI before publishing to ensure production PostgreSQL accepts all mutations.

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  console.log(`[CI Smoke Test] Waiting for ${BASE_URL}/api/readyz ...`);
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/readyz`);
      if (res.ok) {
        const body = await res.json();
        console.log('[CI Smoke Test] Server is ready:', body);
        return;
      }
    } catch {
      // Retrying
    }
    await sleep(1000);
  }
  throw new Error('[CI Smoke Test] Server did not become ready within 60s');
}

async function run() {
  await waitForServer();

  console.log('[CI Smoke Test] Step 1: Registering test user...');
  const userEmail = `ci-smoke-${Date.now()}@example.com`;
  const regRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: userEmail,
      password: 'Password@12345678',
      fullName: 'CI Smoke Admin',
    }),
  });

  const regData = await regRes.json();
  if (!regRes.ok || !regData.token) {
    throw new Error(`[CI Smoke Test] Registration failed: ${JSON.stringify(regData)}`);
  }
  const token = regData.token;
  console.log('[CI Smoke Test] User registered successfully.');

  console.log('[CI Smoke Test] Step 2: Creating organization...');
  const orgRes = await fetch(`${BASE_URL}/api/v1/organizations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'CI Smoke Enterprises',
      country: 'United States',
      baseCurrency: 'USD',
      currencySymbol: '$',
    }),
  });

  const orgData = await orgRes.json();
  if (!orgRes.ok || !orgData.id) {
    throw new Error(`[CI Smoke Test] Organization creation failed: ${JSON.stringify(orgData)}`);
  }
  const orgId = orgData.id;
  console.log(`[CI Smoke Test] Organization created: ${orgId}`);

  console.log('[CI Smoke Test] Step 3: Creating an account (POST /api/v1/finance/accounts)...');
  const accRes = await fetch(`${BASE_URL}/api/v1/finance/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Organization-ID': orgId,
      'Idempotency-Key': `ci-acc-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
    },
    body: JSON.stringify({
      code: '1010',
      name: 'CASH IN HAND - CI SMOKE',
      type: 'Asset',
      subType: 'Cash',
      description: 'Verifying real PostgreSQL mutation pipeline in CI',
    }),
  });

  const accData = await accRes.json();
  if (!accRes.ok || accData.code !== '1010') {
    throw new Error(`[CI Smoke Test] Account creation failed with status ${accRes.status}: ${JSON.stringify(accData)}`);
  }
  console.log('[CI Smoke Test] Account 1010 created successfully under PostgreSQL RLS!');

  console.log('[CI Smoke Test] Step 4: Verifying account reading (GET /api/v1/finance/accounts)...');
  const getAccRes = await fetch(`${BASE_URL}/api/v1/finance/accounts`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Organization-ID': orgId,
    },
  });
  const getAccData = await getAccRes.json();
  if (!getAccRes.ok || !Array.isArray(getAccData) || !getAccData.some((a) => a.code === '1010')) {
    throw new Error(`[CI Smoke Test] Reading accounts failed: ${JSON.stringify(getAccData)}`);
  }
  console.log('[CI Smoke Test] Account verified in list.');

  console.log('[CI Smoke Test] Step 5: Creating client (POST /api/v1/finance/clients)...');
  const cliRes = await fetch(`${BASE_URL}/api/v1/finance/clients`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Organization-ID': orgId,
      'Idempotency-Key': `ci-cli-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
    },
    body: JSON.stringify({
      name: 'CI Enterprise Client',
      companyName: 'CI Client Inc',
      email: 'client@ci.test',
      currency: 'USD',
    }),
  });
  const cliData = await cliRes.json();
  if (!cliRes.ok || !cliData.id) {
    throw new Error(`[CI Smoke Test] Client creation failed: ${JSON.stringify(cliData)}`);
  }
  console.log('[CI Smoke Test] Client created successfully.');

  console.log('[CI Smoke Test] ============================================================');
  console.log('[CI Smoke Test] ALL REAL POSTGRESQL MUTATIONS VERIFIED! SAFE TO PUBLISH.');
  console.log('[CI Smoke Test] ============================================================');
}

run().catch((err) => {
  console.error('[CI Smoke Test FATAL]:', err);
  process.exit(1);
});
