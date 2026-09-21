const base = new URL(process.argv[2] || `http://127.0.0.1:${process.env.APP_PORT || 55000}`);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) {
  throw new Error('Refusing to seed a non-loopback server.');
}

const expectedOrganizationId = 'org-dev-test';
const loginResponse = await fetch(new URL('/api/v1/auth/dev-login', base), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ role: 'Owner' }),
});
const login = await loginResponse.json();
if (!loginResponse.ok || login.organizationId !== expectedOrganizationId || !login.token) {
  throw new Error('Refusing to seed: expected the local org-dev-test development account.');
}

const authHeaders = {
  authorization: `Bearer ${login.token}`,
  'x-organization-id': login.organizationId,
};

async function api(method, path, data, idempotencyKey) {
  const headers = { ...authHeaders };
  if (data !== undefined) headers['content-type'] = 'application/json';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const response = await fetch(new URL(path, base), {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { message: text };
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${result.error || result.message || text}`);
  }
  return result;
}

function asList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.items)) return result.data.items;
  return [];
}

const [vendorResponse, expenseResponse, billResponse, accountResponse] = await Promise.all([
  api('GET', '/api/v1/finance/vendors'),
  api('GET', '/api/v1/finance/expenses'),
  api('GET', '/api/v1/finance/bills'),
  api('GET', '/api/v1/finance/accounts'),
]);
const vendors = asList(vendorResponse);
const expenses = asList(expenseResponse);
const bills = asList(billResponse);
const accounts = asList(accountResponse);
const vendorByName = new Map(vendors.map((vendor) => [String(vendor.name || '').toLowerCase(), vendor]));

const vendorSpecs = [
  ['DEMO - Harborline Office Supply Co.', 'Harborline Office Supply Co.', 'ap@harborline.example', '4155550101', 'Net 30'],
  ['DEMO - Cloudpeak Managed IT', 'Cloudpeak Managed IT', 'billing@cloudpeak.example', '4155550102', 'Net 15'],
  ['DEMO - Meridian Facility Services', 'Meridian Facility Services', 'accounts@meridian-facility.example', '4155550103', 'Net 30'],
  ['DEMO - Bluecrest Freight & Logistics', 'Bluecrest Freight & Logistics', 'billing@bluecrest-freight.example', '4155550104', 'Net 30'],
  ['DEMO - Juniper Creative Studio', 'Juniper Creative Studio', 'finance@juniper-creative.example', '4155550105', 'Net 15'],
  ['DEMO - Northstar Legal Advisory', 'Northstar Legal Advisory', 'billing@northstar-legal.example', '4155550106', 'Net 30'],
  ['DEMO - Summit Telecom & Fiber', 'Summit Telecom & Fiber', 'ar@summit-telecom.example', '4155550107', 'Net 30'],
  ['DEMO - Fieldstone Equipment Rental', 'Fieldstone Equipment Rental', 'accounts@fieldstone-rental.example', '4155550108', 'Net 45'],
];

const createdVendors = [];
for (const [name, companyName, email, phone, paymentTerms] of vendorSpecs) {
  let vendor = vendorByName.get(name.toLowerCase());
  if (!vendor) {
    vendor = await api('POST', '/api/v1/finance/vendors', {
      name,
      companyName,
      email,
      phone,
      currency: 'USD',
      paymentTerms,
    });
    vendorByName.set(name.toLowerCase(), vendor);
    createdVendors.push(name);
  }
}

const accountByCode = new Map(accounts.map((account) => [String(account.code), account]));
const bank = accountByCode.get('1000');
if (!bank?.id) throw new Error('Operating bank ledger account 1000 is missing.');

const expenseSpecs = [
  ['cloud-hosting', 'DEMO | Cloud hosting, monitoring and backups - Sep 2026', 'DEMO - Cloudpeak Managed IT', '6330', 2480, '2026-09-18'],
  ['office-restock', 'DEMO | Office supplies and printer consumables - Sep 2026', 'DEMO - Harborline Office Supply Co.', '6240', 684.75, '2026-09-17'],
  ['freight', 'DEMO | Freight for customer project materials - Sep 2026', 'DEMO - Bluecrest Freight & Logistics', '5130', 742.5, '2026-09-15'],
  ['creative', 'DEMO | Creative campaign production and media assets - Sep 2026', 'DEMO - Juniper Creative Studio', '6120', 3150, '2026-09-12'],
  ['internet', 'DEMO | Business internet and VoIP service - Sep 2026', 'DEMO - Summit Telecom & Fiber', '6200', 329.99, '2026-09-10'],
  ['facility', 'DEMO | Office maintenance and cleaning service - Sep 2026', 'DEMO - Meridian Facility Services', '6210', 925, '2026-09-08'],
  ['legal', 'DEMO | Contract review and legal advisory retainer - Sep 2026', 'DEMO - Northstar Legal Advisory', '6150', 1650, '2026-09-05'],
  ['equipment', 'DEMO | Equipment rental for delivery project - Aug 2026', 'DEMO - Fieldstone Equipment Rental', '6340', 1375, '2026-08-29'],
];
const existingExpenseDescriptions = new Set(expenses.map((expense) => String(expense.description || '').toLowerCase()));
const createdExpenses = [];
for (const [slug, description, vendorName, accountCode, amount, date] of expenseSpecs) {
  if (existingExpenseDescriptions.has(description.toLowerCase())) continue;
  const vendor = vendorByName.get(vendorName.toLowerCase());
  const expenseAccount = accountByCode.get(accountCode);
  if (!vendor?.id || !expenseAccount?.id) throw new Error(`Missing vendor/account for ${slug}.`);
  const result = await api('POST', '/api/v1/finance/expenses', {
    date,
    amount,
    expenseAccountId: expenseAccount.id,
    paidFromAccountId: bank.id,
    vendorId: vendor.id,
    vendorName,
    description,
    taxRate: 0,
  }, `demo-firm-expense-${slug}-202609`);
  createdExpenses.push({ description, amount, journalEntryId: result.journalEntryId || null });
  existingExpenseDescriptions.add(description.toLowerCase());
}

const existingBillNotes = new Set(bills.map((bill) => String(bill.notes || '').toLowerCase()));
const billSpecs = [
  ['DEMO - Cloudpeak Managed IT', '2026-09-04', '2026-10-04', 2120, 'DEMO-SEED-20260921-CLOUD', 'Managed cloud subscription and enterprise support'],
  ['DEMO - Meridian Facility Services', '2026-09-09', '2026-10-09', 980, 'DEMO-SEED-20260921-FACILITY', 'Monthly facilities maintenance contract'],
  ['DEMO - Bluecrest Freight & Logistics', '2026-09-13', '2026-10-13', 1465, 'DEMO-SEED-20260921-FREIGHT', 'Project materials freight and delivery'],
  ['DEMO - Fieldstone Equipment Rental', '2026-08-28', '2026-09-27', 1875, 'DEMO-SEED-20260921-RENTAL', 'Workstation and field equipment rental'],
];
const createdBills = [];
for (const [vendorName, billDate, dueDate, totalAmount, notes, description] of billSpecs) {
  if (existingBillNotes.has(notes.toLowerCase())) continue;
  const vendor = vendorByName.get(vendorName.toLowerCase());
  if (!vendor?.id) throw new Error(`Missing bill vendor ${vendorName}.`);
  const result = await api('POST', '/api/v1/finance/bills', {
    vendorId: vendor.id,
    vendorName,
    billDate,
    dueDate,
    totalAmount,
    subtotal: totalAmount,
    taxTotal: 0,
    notes,
    lineItems: [{ description, quantity: 1, unitPrice: totalAmount, taxRate: 0 }],
  }, `demo-firm-bill-${notes.toLowerCase()}`);
  createdBills.push({ billNumber: result.billNumber, status: result.status, journalEntryId: result.journalEntryId || null, totalAmount });
  existingBillNotes.add(notes.toLowerCase());
}

const [finalVendorsResponse, finalExpensesResponse, finalBillsResponse, journalsResponse] = await Promise.all([
  api('GET', '/api/v1/finance/vendors'),
  api('GET', '/api/v1/finance/expenses'),
  api('GET', '/api/v1/finance/bills'),
  api('GET', '/api/v1/finance/journals?limit=500'),
]);
const finalExpenses = asList(finalExpensesResponse);
const finalBills = asList(finalBillsResponse);
const journals = asList(journalsResponse);
const expenseVerification = expenseSpecs.map(([, description]) => {
  const expense = finalExpenses.find((item) => String(item.description || '').toLowerCase() === description.toLowerCase());
  return { description, exists: Boolean(expense), journalEntryLinked: Boolean(expense?.journalEntryId), status: expense?.status || null };
});
const expectedJournalIds = expenseSpecs.map(([, description]) => finalExpenses.find((item) => String(item.description || '').toLowerCase() === description.toLowerCase())?.journalEntryId).filter(Boolean);
const seededBillNumbers = finalBills.filter((bill) => String(bill.notes || '').startsWith('DEMO-SEED-20260921-')).map((bill) => bill.billNumber);
const expectedJournals = [
  ...expectedJournalIds.map((id) => journals.find((journal) => journal.id === id)),
  ...seededBillNumbers.map((number) => journals.find((journal) => String(journal.reference || '') === number)),
];
const journalVerification = expectedJournals.map((journal) => {
  const debit = (journal?.lines || []).reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = (journal?.lines || []).reduce((sum, line) => sum + Number(line.credit || 0), 0);
  return { journalEntryId: journal?.id || null, debit, credit, balanced: Boolean(journal) && Math.abs(debit - credit) < 0.01 };
});
if (expectedJournals.some((journal) => !journal) || journalVerification.some((entry) => !entry.balanced)) {
  throw new Error('Seeded financial records are missing balanced journal entries.');
}
console.log(JSON.stringify({
  organization: login.organizationId,
  currency: 'USD',
  vendorsCreated: createdVendors.length,
  expensesCreated: createdExpenses,
  billsCreated: createdBills,
  totals: { vendors: asList(finalVendorsResponse).length, expenses: finalExpenses.length, bills: asList(finalBillsResponse).length },
  expenseVerification,
  journalsBalanced: journalVerification.length,
}, null, 2));
