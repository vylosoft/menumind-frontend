export function formatINR(val: number | undefined | null, options?: { compact?: boolean; decimals?: number }): string {
  if (val === undefined || val === null || isNaN(val)) return '₹0';
  const decimals = options?.decimals ?? (Number.isInteger(val) ? 0 : 2);

  if (options?.compact) {
    const absVal = Math.abs(val);
    if (absVal >= 10000000) {
      return `₹${(val / 10000000).toFixed(2)} Cr`;
    }
    if (absVal >= 100000) {
      return `₹${(val / 100000).toFixed(2)} Lakh`;
    }
    if (absVal >= 1000) {
      return `₹${(val / 1000).toFixed(1)}k`;
    }
  }

  // Standard Indian numbering format (e.g., 1,48,000.00)
  const isNegative = val < 0;
  const absNumber = Math.abs(val);
  const fixedStr = absNumber.toFixed(decimals);
  const [integerPart, decimalPart] = fixedStr.split('.');

  // Indian format: last 3 digits, then groups of 2
  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);
  let formattedInteger = lastThree;
  if (otherNumbers !== '') {
    formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
  }

  const result = decimalPart && decimals > 0 ? `${formattedInteger}.${decimalPart}` : formattedInteger;
  return `${isNegative ? '-' : ''}₹${result}`;
}

export function formatNumber(val: number | undefined | null, decimals = 0): string {
  if (val === undefined || val === null || isNaN(val)) return '0';
  const isNegative = val < 0;
  const absNumber = Math.abs(val);
  const fixedStr = absNumber.toFixed(decimals);
  const [integerPart, decimalPart] = fixedStr.split('.');

  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);
  let formattedInteger = lastThree;
  if (otherNumbers !== '') {
    formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
  }

  const result = decimalPart && decimals > 0 ? `${formattedInteger}.${decimalPart}` : formattedInteger;
  return `${isNegative ? '-' : ''}${result}`;
}

export function formatPercent(val: number | undefined | null, showSign = false): string {
  if (val === undefined || val === null || isNaN(val)) return '0.0%';
  const formatted = Math.abs(val).toFixed(1) + '%';
  if (showSign) {
    if (val > 0) return `+${formatted}`;
    if (val < 0) return `-${formatted}`;
  }
  return val < 0 ? `-${formatted}` : formatted;
}

export function formatMonthName(ym: string): string {
  if (!ym) return '';
  const [year, month] = ym.split('-');
  if (!year || !month) return ym;
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
