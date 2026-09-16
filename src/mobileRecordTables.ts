/**
 * Give phone-sized record cards the same field labels as their desktop tables.
 * Only tables explicitly opted into `mobile-record-table` are touched; financial
 * entry grids and reports keep their original tabular layout.
 */
export function installMobileRecordTableLabels(root: HTMLElement): () => void {
  let scheduled = false;

  const applyLabels = () => {
    scheduled = false;
    root.querySelectorAll<HTMLTableElement>('table.mobile-record-table').forEach((table) => {
      const labels = [...table.querySelectorAll<HTMLTableCellElement>('thead tr:first-child th')]
        .map((header) => header.textContent?.replace(/\s+/g, ' ').trim() || '');
      if (labels.length === 0) return;

      table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
        [...row.cells].forEach((cell, index) => {
          if (cell.colSpan > 1 || !labels[index]) return;
          if (cell.dataset.mobileLabel !== labels[index]) {
            cell.dataset.mobileLabel = labels[index];
          }
        });
      });
    });
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyLabels);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  schedule();
  return () => observer.disconnect();
}
