import { describe, expect, it } from 'vitest';
import { buildFinanceHash, parseFinanceHash, parseFinanceLocation } from './financeRoute';

describe('finance hash routes', () => {
  it('keeps portal-token routing separate from canonical hash state and accepts legacy tabs', () => {
    expect(parseFinanceLocation('#/invoices?id=inv-1', '?portal_token=secret-token')).toEqual({ tab: 'customer_portal' });
    expect(parseFinanceLocation('#/accounting?id=journal-1', '')).toMatchObject({ tab: 'accounting', entityId: 'journal-1' });
  });
  it('round-trips legacy exact-record routes with encoded IDs', () => {
    const route = parseFinanceHash('#/invoices?id=INV%2F2026%2F0001');
    expect(route).toMatchObject({ tab: 'invoices', entityId: 'INV/2026/0001' });
    expect(parseFinanceHash(buildFinanceHash(route))).toEqual(route);
  });

  it('preserves validated report state through exact-record navigation and return', () => {
    const report = {
      reportId: 'invoice_details',
      fromDate: '2026-01-01',
      toDate: '2026-03-31',
      customerId: 'cus/one',
      status: 'PAID',
      search: 'Northwind & Sons',
      page: 3,
      focusType: 'invoice',
      focusId: 'inv:2026/4',
    };
    const target = buildFinanceHash({ tab: 'invoices', entityId: 'inv:2026/4', back: { tab: 'reports', report } });
    const parsed = parseFinanceHash(target);
    expect(parsed).toMatchObject({ tab: 'invoices', entityId: 'inv:2026/4', back: { tab: 'reports', report } });
    expect(parseFinanceHash(buildFinanceHash({ tab: 'reports', report: parsed.back!.report! }))).toMatchObject({ tab: 'reports', report });
  });

  it('drops unknown routes, reports, invalid dates, reversed periods, and invalid filters', () => {
    expect(parseFinanceHash('#/not_a_route?id=secret')).toEqual({ tab: 'dashboard' });
    expect(parseFinanceHash('#/reports?report=made_up&from=2026-01-01')).toMatchObject({ tab: 'reports', report: undefined });
    expect(parseFinanceHash('#/reports?report=invoice_details&from=2026-02-30&to=2026-01-01&status=VOIDED&page=0')).toMatchObject({
      report: { reportId: 'invoice_details' },
    });
  });

  it('rejects hostile and recursively nested return destinations', () => {
    for (const hostile of ['https://example.com', '//example.com', 'javascript:alert(1)', '#/%2F%2Fexample.com']) {
      const target = `#/invoices?id=inv-1&back=${encodeURIComponent(hostile)}`;
      expect(parseFinanceHash(target).back).toBeUndefined();
    }
    const nested = '#/reports?report=invoice_details&back=%2523%252Finvoices';
    const target = `#/invoices?id=inv-1&back=${encodeURIComponent(nested)}`;
    expect(parseFinanceHash(target).back).toEqual({ tab: 'reports', report: { reportId: 'invoice_details' } });
  });

  it('round-trips one-sided dates and URL-expanded but supported report filters', () => {
    const fromOnly = { tab: 'reports' as const, report: { reportId: 'invoice_details', fromDate: '2026-01-01' } };
    const toOnly = { tab: 'reports' as const, report: { reportId: 'invoice_details', toDate: '2026-09-24' } };
    expect(parseFinanceHash(buildFinanceHash(fromOnly)).report).toMatchObject({ reportId: 'invoice_details', fromDate: '2026-01-01' });
    expect(parseFinanceHash(buildFinanceHash(toOnly)).report).toMatchObject({ reportId: 'invoice_details', toDate: '2026-09-24' });

    const expanded = {
      tab: 'reports' as const,
      report: {
        reportId: 'invoice_details',
        fromDate: '2026-01-01',
        toDate: '2026-09-24',
        projectId: '/'.repeat(200),
        customerId: '/'.repeat(200),
        vendorId: '/'.repeat(200),
        accountId: '/'.repeat(200),
        focusType: 'invoice',
        focusId: '/'.repeat(200),
        search: '/'.repeat(120),
      },
    };
    const hash = buildFinanceHash(expanded);
    expect(hash.length).toBeLessThanOrEqual(4096);
    expect(parseFinanceHash(hash).report).toEqual(expanded.report);
  });

  it('throws rather than dropping an oversized core report route', () => {
    const oversized = {
      tab: 'reports' as const,
      report: {
        reportId: 'invoice_details',
        projectId: '😀'.repeat(100),
        customerId: '😀'.repeat(100),
        vendorId: '😀'.repeat(100),
        accountId: '😀'.repeat(100),
        focusType: 'invoice',
        focusId: '😀'.repeat(100),
        search: '😀'.repeat(60),
      },
    };
    expect(() => buildFinanceHash(oversized)).toThrow(/cannot preserve/i);
  });
  it('preserves validated internal tab and exact-record routes as a single-level return destination', () => {
    const source = { tab: 'invoices' as const, entityId: 'inv/source' };
    const target = buildFinanceHash({ tab: 'expenses', entityId: 'exp-1', back: source });
    expect(parseFinanceHash(target)).toMatchObject({ tab: 'expenses', entityId: 'exp-1', back: source });

    const reportBack = { tab: 'reports' as const, report: { reportId: 'invoice_details', search: 'Northwind', page: 4 } };
    expect(parseFinanceHash(buildFinanceHash({ tab: 'invoices', entityId: 'inv-1', back: reportBack })).back).toEqual(reportBack);
    expect(parseFinanceHash('#/invoices?id=inv-1&back=%23%2Fcustomer_portal').back).toBeUndefined();
  });

  it('rejects oversized destination or return IDs and refuses to drop a long return destination', () => {
    expect(() => buildFinanceHash({ tab: 'invoices', entityId: 'x'.repeat(201) })).toThrow(/entity ID/i);
    expect(() => buildFinanceHash({ tab: 'invoices', entityId: 'inv-1', back: { tab: 'clients', entityId: 'x'.repeat(201) } })).toThrow(/entity ID/i);
    expect(() => buildFinanceHash({ tab: 'invoices', entityId: 'inv-1', back: { tab: 'customer_portal' as any } })).toThrow(/internal navigation tab/i);
    const special = '&'.repeat(200);
    const tooLongOrigin = { tab: 'reports' as const, report: { reportId: 'invoice_details', projectId: special, customerId: special, vendorId: special, accountId: special, focusType: 'invoice', focusId: special, search: '&'.repeat(120) } };
    expect(() => buildFinanceHash({ tab: 'invoices', entityId: 'inv-1', back: tooLongOrigin })).toThrow(/cannot preserve/i);
  });

  it('rejects a return route larger than the parser-supported back-route limit', () => {
    const oversizedReturn = {
      tab: 'reports' as const,
      report: {
        reportId: 'invoice_details',
        projectId: '/'.repeat(200),
        customerId: '/'.repeat(200),
        vendorId: '/'.repeat(200),
      },
    };
    expect(() => buildFinanceHash({ tab: 'invoices', entityId: 'inv-1', back: oversizedReturn })).toThrow(/return route exceeds/i);
  });
  it('bounds URL, IDs, search, and report pagination', () => {
    expect(parseFinanceHash(`#/invoices?id=${'x'.repeat(201)}`).entityId).toBeUndefined();
    expect(parseFinanceHash(`#/reports?report=invoice_details&q=${'q'.repeat(121)}&page=100001`).report).toMatchObject({ reportId: 'invoice_details' });
    expect(parseFinanceHash(`#/${'x'.repeat(4100)}`)).toEqual({ tab: 'dashboard' });
  });
});
