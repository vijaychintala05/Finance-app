/**
 * Utility formatting functions for FirmBooks
 */

const currencyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCurrency = (amount: number, symbol: string = ''): string => {
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  const formatted = currencyFormatter.format(Math.abs(safeAmount));
  return `${safeAmount < 0 ? '-' : ''}${symbol}${formatted}`;
};

export const formatDate = (dateString?: string): string => {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
};

export const getStatusBadgeStyle = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'paid':
    case 'completed':
    case 'posted':
    case 'accepted':
    case 'converted':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300';

    case 'sent':
    case 'active':
    case 'partially paid':
      return 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300';

    case 'draft':
    case 'on hold':
      return 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300';

    case 'overdue':
    case 'cancelled':
    case 'declined':
    case 'void':
      return 'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-300';

    default:
      return 'bg-slate-500/10 text-slate-700 border-slate-500/20 dark:bg-slate-500/20 dark:text-slate-300';
  }
};
