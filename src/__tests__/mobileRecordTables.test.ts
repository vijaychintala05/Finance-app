// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMobileRecordTableLabels } from '../mobileRecordTables';

describe('mobile record table labels', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('uses the visible desktop headers to label every mobile record field', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    document.body.innerHTML = `
      <main>
        <table class="mobile-record-table">
          <thead><tr><th>Bill #</th><th>Vendor Name</th><th>Balance Due</th></tr></thead>
          <tbody><tr><td>B-001</td><td>Acme</td><td>₹500</td></tr></tbody>
        </table>
        <table><thead><tr><th>Internal</th></tr></thead><tbody><tr><td>Unchanged</td></tr></tbody></table>
      </main>`;
    const cleanup = installMobileRecordTableLabels(document.body);
    const cells = document.querySelectorAll('table.mobile-record-table tbody td');
    expect([...cells].map((cell) => cell.getAttribute('data-mobile-label'))).toEqual([
      'Bill #', 'Vendor Name', 'Balance Due',
    ]);
    expect(document.querySelector('table:not(.mobile-record-table) td')?.hasAttribute('data-mobile-label')).toBe(false);
    cleanup();
  });

  it('labels rows loaded after the table mounts and leaves empty-state colspans intact', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    document.body.innerHTML = `
      <table class="mobile-record-table">
        <thead><tr><th>Invoice</th><th>Amount</th></tr></thead>
        <tbody><tr><td colspan="2">No invoices</td></tr></tbody>
      </table>`;
    const cleanup = installMobileRecordTableLabels(document.body);
    expect(document.querySelector('td[colspan]')?.hasAttribute('data-mobile-label')).toBe(false);
    const row = document.createElement('tr');
    row.innerHTML = '<td>INV-002</td><td>₹100</td>';
    document.querySelector('tbody')?.appendChild(row);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(row.cells[0].dataset.mobileLabel).toBe('Invoice');
    expect(row.cells[1].dataset.mobileLabel).toBe('Amount');
    cleanup();
  });
});
