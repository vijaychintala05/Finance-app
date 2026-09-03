/**
 * Converts numeric amounts into formal words for financial documents (Quotes, Invoices, Vouchers).
 * Supports both Indian numbering format (Lakhs, Crores) and international standard format.
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];


function convertTwoDigits(n) {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return TENS[ten] + (one > 0 ? ' ' + ONES[one] : '');
}

function convertThreeDigits(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  let res = '';
  if (hundred > 0) {
    res += ONES[hundred] + ' Hundred';
    if (rest > 0) res += ' ';
  }
  if (rest > 0) {
    res += convertTwoDigits(rest);
  }
  return res;
}

/**
 * Converts an integer into Indian numbering system words (Crores, Lakhs, Thousands, Hundreds)
 */
function convertIndianNumber(num) {
  if (num === 0) return 'Zero';

  const crore = Math.floor(num / 10000000);
  num %= 10000000;

  const lakh = Math.floor(num / 100000);
  num %= 100000;

  const thousand = Math.floor(num / 1000);
  num %= 1000;

  const remainder = num;
  const parts = [];

  if (crore > 0) parts.push(convertIndianNumber(crore) + ' Crore');
  if (lakh > 0) parts.push(convertTwoDigits(lakh) + ' Lakh');
  if (thousand > 0) parts.push(convertTwoDigits(thousand) + ' Thousand');
  if (remainder > 0) parts.push(convertThreeDigits(remainder));

  return parts.join(' ').trim();
}

/**
 * Returns formatted currency in words.
 * Example: 82600.50 with currency 'INR' / '₹' -> 'Rupees Eighty Two Thousand Six Hundred and Fifty Paise Only'
 */
export function amountToWords(amount: number, currencyCodeOrSymbol: string = 'INR'): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const integerPart = Math.floor(absAmount);
  const decimalPart = Math.round((absAmount - integerPart) * 100);

  const isRupee = ['INR', '₹', 'RS', 'RS.'].includes(currencyCodeOrSymbol.toUpperCase().trim());
  const mainUnit = isRupee ? 'Rupees' : currencyCodeOrSymbol.toUpperCase().trim();
  const subUnit = isRupee ? 'Paise' : 'Cents';

  let resultWords = mainUnit + ' ' + convertIndianNumber(integerPart);

  if (decimalPart > 0) {
    resultWords += ' and ' + convertTwoDigits(decimalPart) + ' ' + subUnit;
  }

  resultWords += ' Only';

  return isNegative ? 'Negative ' + resultWords : resultWords;
}
