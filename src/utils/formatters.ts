/**
 * Utility formatting functions for FirmBooks
 */

const currencyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCurrency = (amount: number | string, symbol: string = ''): string => {
  const numericAmount = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
  const formatted = currencyFormatter.format(Math.abs(safeAmount));
  const cleanSymbol = symbol.trim();
  const separator = /^[A-Za-z]{2,4}$/.test(cleanSymbol) ? ' ' : '';
  const prefix = cleanSymbol ? `${cleanSymbol}${separator}` : '';
  return `${safeAmount < 0 ? '-' : ''}${prefix}${formatted}`;
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

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertTwoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return TENS[ten] + (one > 0 ? ' ' + ONES[one] : '');
}

function convertThreeDigits(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  let res = '';
  if (hundred > 0) res += ONES[hundred] + ' Hundred';
  if (rest > 0) res += (res ? ' ' : '') + convertTwoDigits(rest);
  return res;
}

function convertIndianNumber(num: number): string {
  if (num === 0) return 'Zero';
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const remainder = num;
  const parts: string[] = [];
  if (crore > 0) parts.push(convertIndianNumber(crore) + ' Crore');
  if (lakh > 0) parts.push(convertTwoDigits(lakh) + ' Lakh');
  if (thousand > 0) parts.push(convertTwoDigits(thousand) + ' Thousand');
  if (remainder > 0) parts.push(convertThreeDigits(remainder));
  return parts.join(' ').trim();
}

function convertWesternNumber(num: number): string {
  if (num === 0) return 'Zero';
  const billion = Math.floor(num / 1000000000);
  num %= 1000000000;
  const million = Math.floor(num / 1000000);
  num %= 1000000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const remainder = num;
  const parts: string[] = [];
  if (billion > 0) parts.push(convertThreeDigits(billion) + ' Billion');
  if (million > 0) parts.push(convertThreeDigits(million) + ' Million');
  if (thousand > 0) parts.push(convertThreeDigits(thousand) + ' Thousand');
  if (remainder > 0) parts.push(convertThreeDigits(remainder));
  return parts.join(' ').trim();
}

export const amountToWords = (amount: number, currencyCodeOrSymbol: string = 'INR'): string => {
  const numericAmount = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
  const isNegative = safeAmount < 0;
  const absAmount = Math.abs(safeAmount);
  const integerPart = Math.floor(absAmount);
  const decimalPart = Math.round((absAmount - integerPart) * 100);

  const clean = (currencyCodeOrSymbol || '').toUpperCase().trim();
  const isRupee = ['INR', '₹', 'RS', 'RS.'].includes(clean);

  const mainUnit = isRupee ? 'Rupees' : clean === '$' || clean === 'USD' ? 'US Dollars' : clean || 'Units';
  const subUnit = isRupee ? 'Paise' : 'Cents';

  const numberWord = isRupee ? convertIndianNumber(integerPart) : convertWesternNumber(integerPart);
  let resultWords = `${numberWord} ${mainUnit}`;

  if (decimalPart > 0) {
    resultWords += ` and ${convertTwoDigits(decimalPart)} ${subUnit}`;
  }

  resultWords += ' Only';
  return isNegative ? `Negative ${resultWords}` : resultWords;
};

