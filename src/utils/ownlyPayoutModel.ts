/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import {
  AggregatorBrandOutletMapping,
  OwnlyPayoutBreakupModel,
  OwnlyPayoutSettlementRow,
  PayoutOtherChargeItem,
  PlatformPayoutRecord,
} from '../types/finance';
import {
  detectAggregatorMappingFromText,
  extractCandidateRestaurantIdFromFilename,
} from './aggregatorMappingManager';

function round2(n: number): number {
  const r = Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
  return Object.is(r, -0) || r === 0 ? 0 : r;
}

export function parseOwnlyNumberCell(val: any): { hasNumber: boolean; value: number } {
  if (val === null || val === undefined || val === '') {
    return { hasNumber: false, value: 0 };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { hasNumber: false, value: 0 };
    return { hasNumber: true, value: round2(val) };
  }
  const raw = String(val).trim();
  if (!raw || raw === '-' || raw === '—' || raw.startsWith('#')) {
    return { hasNumber: false, value: 0 };
  }
  const isParenNeg = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[₹$,%\s()]/g, '').replace(/,/g, '');
  if (!cleaned) return { hasNumber: false, value: 0 };
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return { hasNumber: false, value: 0 };
  return {
    hasNumber: true,
    value: round2(isParenNeg ? -Math.abs(parsed) : parsed),
  };
}

export function formatOwnlyUtrCell(val: any): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number' && Number.isFinite(val)) {
    return String(Math.trunc(val));
  }
  const str = String(val).trim();
  // Convert scientific notation strings like 6.27558219482e+11 if present
  if (/^\d+\.\d+e\+\d+$/i.test(str)) {
    const n = Number(str);
    if (Number.isFinite(n) && Number.isSafeInteger(Math.round(n))) {
      return String(Math.round(n));
    }
  }
  return str.replace(/^['`]+/, '').trim();
}

const MONTH_NAME_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

/**
 * Parses Ownly's "Payout Period" cell e.g.:
 *  - "1 October -> 1 October"
 *  - "31 October -> 31 October"
 *  - "1 November -> 1 November"
 *  - "14 Oct 2026 -> 20 Oct 2026"
 *  - "2026-10-01 -> 2026-10-01"
 */
export function parseOwnlyPayoutPeriod(
  periodText: string,
  fallbackYear: string,
  fallbackMonth?: string
): {
  accountingMonth: string;
  startDate?: string;
  endDate?: string;
} {
  const raw = String(periodText || '').trim();
  const defaultMonth =
    fallbackMonth && /^\d{4}-\d{2}$/.test(fallbackMonth)
      ? fallbackMonth
      : `${fallbackYear}-10`;

  if (!raw) {
    return { accountingMonth: defaultMonth };
  }

  // 1. ISO date matches: YYYY-MM-DD
  const isoMatches = raw.match(/202\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])/g);
  if (isoMatches && isoMatches.length > 0) {
    const startDate = isoMatches[0];
    const endDate = isoMatches[isoMatches.length - 1];
    return {
      accountingMonth: endDate.slice(0, 7),
      startDate,
      endDate,
    };
  }

  // 2. Day + MonthName [+ Year], e.g. "1 October -> 1 October" or "14 Oct 2026 -> 20 Oct 2026"
  const dMonMatches = [
    ...raw.matchAll(
      /\b(0?[1-9]|[12]\d|3[01])\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(202\d|\d{2}))?\b/gi
    ),
  ];
  if (dMonMatches.length > 0) {
    const parsedDates = dMonMatches.map((m) => {
      const dd = m[1].padStart(2, '0');
      const mm = MONTH_NAME_MAP[m[2].toLowerCase()] || '10';
      const yyyy = m[3]
        ? m[3].length === 2
          ? `20${m[3]}`
          : m[3]
        : fallbackYear;
      return `${yyyy}-${mm}-${dd}`;
    });
    const startDate = parsedDates[0];
    const endDate = parsedDates[parsedDates.length - 1];
    return {
      accountingMonth: endDate.slice(0, 7),
      startDate,
      endDate,
    };
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatches = [
    ...raw.matchAll(/\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](202\d)\b/g),
  ];
  if (dmyMatches.length > 0) {
    const parsedDates = dmyMatches.map(
      (m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    );
    const startDate = parsedDates[0];
    const endDate = parsedDates[parsedDates.length - 1];
    return {
      accountingMonth: endDate.slice(0, 7),
      startDate,
      endDate,
    };
  }

  return { accountingMonth: defaultMonth };
}

/**
 * Resolves Brand Name & Outlet Location ('banaswadi' | 'whitefield') from:
 *  1. Aggregator Mapping Table (e.g. RN421125 -> Banglar Jhale Jhole, whitefield)
 *  2. Ownly's "Restaurant Name" convention (e.g. "Banglar Jhale Jhole -W" -> "-W" means Whitefield)
 */
export function inferOwnlyBrandAndOutlet(
  rawRestaurantName: string,
  restaurantId: string,
  mappings: AggregatorBrandOutletMapping[],
  fileNameHint = ''
): {
  brandName: string;
  outletId: 'banaswadi' | 'whitefield';
  matchedMapping: AggregatorBrandOutletMapping | null;
} {
  const matched =
    (restaurantId ? detectAggregatorMappingFromText(restaurantId, mappings, 'ownly') : null) ||
    (fileNameHint ? detectAggregatorMappingFromText(fileNameHint, mappings, 'ownly') : null) ||
    (restaurantId ? detectAggregatorMappingFromText(restaurantId, mappings) : null);

  const trimmedName = String(rawRestaurantName || '').trim();

  // Strip trailing outlet markers like "-W", "- W", "-B", "- Whitefield", "- Banaswadi" for clean Brand Name
  const cleanedBrandFromCell = trimmedName
    .replace(/\s*-\s*(?:w|wf|whitefield|whitefiled|b|banaswadi|bw)\s*$/i, '')
    .replace(/\s+(?:whitefield|whitefiled|banaswadi)\s*$/i, '')
    .trim();

  if (matched) {
    return {
      brandName: matched.brandName || cleanedBrandFromCell || 'Banglar Jhale Jhole',
      outletId: matched.outletId,
      matchedMapping: matched,
    };
  }

  const combinedText = `${trimmedName} ${fileNameHint}`.trim();
  const hasTrailingW =
    /-\s*w\s*$/i.test(trimmedName) ||
    /\s+w$/i.test(trimmedName) ||
    /whitefi?eld|\bwf\b/i.test(combinedText);
  const hasBanaswadi = /banaswadi|kammanahalli|\bbw\b/i.test(combinedText);

  const outletId: 'banaswadi' | 'whitefield' = hasBanaswadi
    ? 'banaswadi'
    : hasTrailingW
    ? 'whitefield'
    : 'banaswadi';

  const brandName =
    cleanedBrandFromCell ||
    (/niraamish/i.test(combinedText) ? 'Niraamish' : 'Banglar Jhale Jhole');

  return {
    brandName,
    outletId,
    matchedMapping: null,
  };
}

export function createEmptyOwnlyRow(
  overrides?: Partial<OwnlyPayoutSettlementRow>
): OwnlyPayoutSettlementRow {
  return {
    id: `ownly-row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    restaurantId: 'RN421127',
    restaurantName: 'Banglar Jhale Jhole',
    payoutPeriod: '',
    totalOrders: 0,
    grossAmount: 0,
    taxDeduction: 0,
    tdsDeduction: 0,
    tcsDeduction: 0,
    totalDeductions: 0,
    netPayoutAmount: 0,
    status: 'completed',
    utr: '',
    ...overrides,
  };
}

/**
 * Recalculates column totals across all Ownly settlement rows in the breakup model.
 * Note: Individual rows preserve their exact `totalDeductions` and `netPayoutAmount` from Ownly's export
 * unless edited by the user via `updateOwnlySettlementRow`.
 */
export function recalculateOwnlyBreakupModel(
  model: OwnlyPayoutBreakupModel,
  syncReportedToCalculated = false
): OwnlyPayoutBreakupModel {
  const rows: OwnlyPayoutSettlementRow[] = (model.rows || []).map((r) => ({
    ...r,
    totalOrders: Math.max(0, Math.round(Number(r.totalOrders) || 0)),
    grossAmount: round2(Number(r.grossAmount) || 0),
    taxDeduction: round2(Number(r.taxDeduction) || 0),
    tdsDeduction: round2(Number(r.tdsDeduction) || 0),
    tcsDeduction: round2(Number(r.tcsDeduction) || 0),
    totalDeductions: round2(Number(r.totalDeductions) || 0),
    netPayoutAmount: round2(Number(r.netPayoutAmount) || 0),
  }));

  // Exclude explicitly cancelled/failed/rejected rows from settled payout totals
  const activeRows = rows.filter(
    (r) => !/^(cancelled|canceled|failed|rejected|reversed)$/i.test(String(r.status || '').trim())
  );

  const totalOrders = activeRows.reduce((s, r) => s + r.totalOrders, 0);
  const totalGrossAmount = round2(activeRows.reduce((s, r) => s + r.grossAmount, 0));
  const totalTaxDeduction = round2(activeRows.reduce((s, r) => s + r.taxDeduction, 0));
  const totalTdsDeduction = round2(activeRows.reduce((s, r) => s + r.tdsDeduction, 0));
  const totalTcsDeduction = round2(activeRows.reduce((s, r) => s + r.tcsDeduction, 0));
  const totalDeductions = round2(activeRows.reduce((s, r) => s + r.totalDeductions, 0));
  const sumRowNetPayout = round2(activeRows.reduce((s, r) => s + r.netPayoutAmount, 0));

  const preTaxFoodSubtotal = round2(Math.max(0, totalGrossAmount - totalTaxDeduction));
  const componentTaxSum = round2(totalTaxDeduction + totalTdsDeduction + totalTcsDeduction);
  const totalOtherDeductions = round2(totalDeductions - componentTaxSum);

  const calculatedNetPayout = round2(totalGrossAmount - totalDeductions);
  const reportedNetPayout = syncReportedToCalculated
    ? calculatedNetPayout
    : model.hasExplicitReportedNetPayout && model.reportedNetPayout !== undefined
    ? round2(Number(model.reportedNetPayout) || 0)
    : activeRows.length > 0
    ? sumRowNetPayout
    : calculatedNetPayout;

  // Derive start/end dates & period label from rows when available
  const rowDates = activeRows
    .flatMap((r) => [r.startDate, r.endDate])
    .filter((d): d is string => Boolean(d))
    .sort();
  const payoutStartDate = rowDates.length > 0 ? rowDates[0] : model.payoutStartDate;
  const payoutEndDate =
    rowDates.length > 0 ? rowDates[rowDates.length - 1] : model.payoutEndDate;

  let settlementPeriodLabel = model.settlementPeriodLabel;
  if (!settlementPeriodLabel) {
    if (activeRows.length === 1 && activeRows[0].payoutPeriod) {
      settlementPeriodLabel = activeRows[0].payoutPeriod;
    } else if (activeRows.length > 1) {
      const firstP = (activeRows[0].payoutPeriod || '').split('->')[0]?.trim();
      const lastParts = (activeRows[activeRows.length - 1].payoutPeriod || '').split('->');
      const lastP = (lastParts[lastParts.length - 1] || '').trim();
      if (firstP && lastP) {
        settlementPeriodLabel = `${firstP} -> ${lastP} (${activeRows.length} settlements)`;
      }
    }
  }

  const firstRow = rows[0];

  return {
    ...model,
    templateVersion: 'ownly_payout_ledger_v1',
    resId: model.resId || firstRow?.restaurantId || undefined,
    rawRestaurantName: model.rawRestaurantName || firstRow?.restaurantName || undefined,
    payoutStartDate,
    payoutEndDate,
    settlementPeriodLabel,
    rows,
    totalOrders,
    totalGrossAmount,
    preTaxFoodSubtotal,
    totalTaxDeduction,
    totalTdsDeduction,
    totalTcsDeduction,
    totalOtherDeductions,
    totalDeductions,
    calculatedNetPayout,
    reportedNetPayout,
  };
}

/**
 * Updates a single cell on an Ownly settlement row and cascades row-level formulas cleanly:
 *  - Editing `taxDeduction`, `tdsDeduction`, or `tcsDeduction` updates `totalDeductions = tax + tds + tcs`
 *    and `netPayoutAmount = grossAmount - totalDeductions`.
 *  - Editing `grossAmount` updates `netPayoutAmount = grossAmount - totalDeductions`.
 *  - Editing `totalDeductions` directly updates `netPayoutAmount = grossAmount - totalDeductions`.
 *  - Editing `netPayoutAmount` directly preserves that exact settled payout on the row.
 */
export function updateOwnlySettlementRow(
  row: OwnlyPayoutSettlementRow,
  field: keyof OwnlyPayoutSettlementRow,
  rawValue: string | number
): OwnlyPayoutSettlementRow {
  if (
    field === 'restaurantId' ||
    field === 'restaurantName' ||
    field === 'payoutPeriod' ||
    field === 'status' ||
    field === 'utr'
  ) {
    return {
      ...row,
      [field]: String(rawValue ?? ''),
    };
  }

  const num =
    typeof rawValue === 'number'
      ? rawValue
      : rawValue === '' || rawValue === '-'
      ? 0
      : Number(rawValue) || 0;

  if (field === 'totalOrders') {
    return {
      ...row,
      totalOrders: Math.max(0, Math.round(Math.abs(num))),
    };
  }

  const next: OwnlyPayoutSettlementRow = {
    ...row,
    [field]: round2(num),
  };

  if (field === 'taxDeduction' || field === 'tdsDeduction' || field === 'tcsDeduction') {
    next.totalDeductions = round2(
      next.taxDeduction + next.tdsDeduction + next.tcsDeduction
    );
    next.netPayoutAmount = round2(next.grossAmount - next.totalDeductions);
  } else if (field === 'grossAmount' || field === 'totalDeductions') {
    next.netPayoutAmount = round2(next.grossAmount - next.totalDeductions);
  }

  return next;
}

/**
 * Hydrates ANY Ownly PlatformPayoutRecord (newly uploaded or previously saved) into OwnlyPayoutBreakupModel.
 */
export function ensureOwnlyBreakupModelOnRecord(
  record: PlatformPayoutRecord
): OwnlyPayoutBreakupModel {
  const existing = record.ownlyBreakup;
  if (existing && existing.templateVersion === 'ownly_payout_ledger_v1' && Array.isArray(existing.rows)) {
    return recalculateOwnlyBreakupModel(existing);
  }

  const defaultResId =
    record.accountId || (record.outletId === 'whitefield' ? 'RN421125' : 'RN421127');
  const defaultRawName =
    record.outletId === 'whitefield'
      ? `${record.accountName || 'Banglar Jhale Jhole'} -W`
      : record.accountName || 'Banglar Jhale Jhole';

  const gross = round2(Number(record.grossSales) || 0);
  const tax = round2(Number(record.gstOnCommission) || 0);
  const tds = round2(Number(record.tdsDeduction) || 0);
  const tcs = round2(Number(record.tcsDeduction) || 0);
  const otherDed = round2(
    (Number(record.commissionAmount) || 0) +
      (Number(record.paymentGatewayFee) || 0) +
      (Number(record.cancellationCharges) || 0) +
      (Number(record.advertisingSpend) || 0) +
      (Number(record.otherPlatformFees) || 0)
  );
  const totalDed = round2(tax + tds + tcs + otherDed);
  const netAmt = round2(
    Number(record.actualBankSettlement ?? record.calculatedNetPayout ?? gross - totalDed) || 0
  );

  const syntheticRow: OwnlyPayoutSettlementRow = {
    id: `ownly-hydrated-${record.id || Date.now()}`,
    restaurantId: defaultResId,
    restaurantName: defaultRawName,
    payoutPeriod: record.weekLabel || record.month || '',
    totalOrders: Math.max(0, Math.round(Number(record.orderCount) || 0)),
    grossAmount: gross,
    taxDeduction: tax,
    tdsDeduction: tds,
    tcsDeduction: tcs,
    totalDeductions: totalDed,
    netPayoutAmount: netAmt,
    status: record.status === 'pending' ? 'pending' : 'completed',
    utr: '',
    accountingMonth: record.month,
    startDate: record.payoutStartDate,
    endDate: record.payoutEndDate,
  };

  return recalculateOwnlyBreakupModel({
    templateVersion: 'ownly_payout_ledger_v1',
    sheetNameUsed: 'Ownly Payout',
    resId: defaultResId || undefined,
    rawRestaurantName: defaultRawName,
    brandName: record.accountName || 'Banglar Jhale Jhole',
    outletLocation: record.outletId,
    accountingMonth: record.month,
    settlementPeriodLabel: record.weekLabel,
    payoutStartDate: record.payoutStartDate,
    payoutEndDate: record.payoutEndDate,
    rows: [syntheticRow],
    totalOrders: syntheticRow.totalOrders,
    totalGrossAmount: gross,
    preTaxFoodSubtotal: round2(Math.max(0, gross - tax)),
    totalTaxDeduction: tax,
    totalTdsDeduction: tds,
    totalTcsDeduction: tcs,
    totalOtherDeductions: otherDed,
    totalDeductions: totalDed,
    calculatedNetPayout: round2(gross - totalDed),
    reportedNetPayout: netAmt,
    hasExplicitReportedNetPayout: true,
  });
}

/**
 * Projects OwnlyPayoutBreakupModel onto PlatformPayoutRecord for Supabase persistence,
 * POS Reconciliation Matrix, and P&L calculation.
 */
export function applyOwnlyBreakupToPayoutRecord(
  baseRecord: PlatformPayoutRecord,
  rawModel: OwnlyPayoutBreakupModel,
  syncActualToCalculated = false
): PlatformPayoutRecord {
  const m = recalculateOwnlyBreakupModel(rawModel, syncActualToCalculated);

  const otherBreakdown: PayoutOtherChargeItem[] = [];
  if (Math.abs(m.totalOtherDeductions) >= 0.01) {
    otherBreakdown.push({
      id: 'ownly-residual-deduction',
      label: 'Ownly Platform / Rounding Adjustment',
      amount: m.totalOtherDeductions,
    });
  }

  const settlementDifference = round2(m.calculatedNetPayout - m.reportedNetPayout);

  return {
    ...baseRecord,
    platform: 'ownly',
    outletId: m.outletLocation || baseRecord.outletId,
    month: m.accountingMonth || baseRecord.month,
    accountId: m.resId ?? baseRecord.accountId,
    accountName: m.brandName ?? baseRecord.accountName,
    weekLabel: m.settlementPeriodLabel ?? baseRecord.weekLabel,
    payoutStartDate: m.payoutStartDate ?? baseRecord.payoutStartDate,
    payoutEndDate: m.payoutEndDate ?? baseRecord.payoutEndDate,
    orderCount: m.totalOrders,
    cancelledOrders: 0,
    grossSales: m.totalGrossAmount,
    packagingCharges: 0,
    deliveryChargesCollected: 0,
    customerDeliveryFeeShare: 0,
    customerDiscounts: 0,
    netSales: m.totalGrossAmount,
    commissionRate: 0,
    commissionAmount: 0,
    paymentGatewayFee: 0,
    advertisingSpend: 0,
    cancellationCharges: 0,
    swiggyAssureFee: 0,
    otherPlatformFees: m.totalOtherDeductions,
    otherChargesBreakdown: otherBreakdown,
    gstOnCommission: m.totalTaxDeduction,
    tcsDeduction: m.totalTcsDeduction,
    tdsDeduction: m.totalTdsDeduction,
    hyperpureRecovery: 0,
    calculatedNetPayout: m.calculatedNetPayout,
    actualBankSettlement: m.reportedNetPayout,
    settlementDifference,
    status: Math.abs(settlementDifference) <= 10 ? 'reconciled' : 'discrepancy',
    ownlyBreakup: m,
  };
}

interface OwnlyColumnIndices {
  sheetName: string;
  headerRowIdx: number;
  resIdCol: number;
  resNameCol: number;
  periodCol: number;
  ordersCol: number;
  grossCol: number;
  taxCol: number;
  tdsCol: number;
  tcsCol: number;
  totalDedCol: number;
  netPayoutCol: number;
  statusCol: number;
  utrCol: number;
}

function locateOwnlyLedgerHeader(workbook: XLSX.WorkBook): OwnlyColumnIndices | null {
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: '',
    });

    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const row = rows[r] || [];
      if (row.length < 5) continue;

      const headers = row.map((c) =>
        String(c ?? '')
          .replace(/\r?\n/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
      );

      const findCol = (pred: (h: string) => boolean) => headers.findIndex(pred);

      const resIdCol = findCol(
        (h) => /^res(taurant)?[\s_.]*id$|^store[\s_]*id$|^merchant[\s_]*id$/.test(h)
      );
      const resNameCol = findCol(
        (h) => /^res(taurant)?[\s_.]*name$|^outlet[\s_]*name$|^brand[\s_]*name$/.test(h)
      );
      const periodCol = findCol(
        (h) => /^payout[\s_]*period$|^settlement[\s_]*period$|^date[\s_]*range$|^period$/.test(h)
      );
      const ordersCol = findCol(
        (h) => /^total[\s_]*ord(er|ers|e)?$|^orders?([\s_]*count)?$/.test(h)
      );
      const grossCol = findCol(
        (h) => /^gross[\s_]*amount$|^gross[\s_]*sales$|^total[\s_]*gross/.test(h)
      );
      const taxCol = findCol(
        (h) => /^tax[\s_]*deductions?$|^gst[\s_]*deductions?$|^tax$/.test(h)
      );
      const tdsCol = findCol((h) => /^tds([\s_]*deductions?)?$/.test(h));
      const tcsCol = findCol((h) => /^tcs([\s_]*deductions?)?$/.test(h));
      const totalDedCol = findCol((h) => /^total[\s_]*deductions?$/.test(h));
      const netPayoutCol = findCol(
        (h) => /^net[\s_]*payout([\s_]*amount)?$|^settled[\s_]*amount$|^payout[\s_]*amount$/.test(h)
      );
      const statusCol = findCol((h) => /^(payout[\s_]*)?status$/.test(h));
      const utrCol = findCol((h) => /^utr([\s_]*no\.?|[\s_]*number)?$|^bank[\s_]*ref/.test(h));

      // Require strong Ownly template signature: Gross Amount + Net Payout Amount + (Payout Period or Tax Deduction or UTR)
      const coreHits = [
        resIdCol !== -1,
        periodCol !== -1,
        grossCol !== -1,
        taxCol !== -1,
        totalDedCol !== -1,
        netPayoutCol !== -1,
        utrCol !== -1,
      ].filter(Boolean).length;

      if (grossCol !== -1 && netPayoutCol !== -1 && coreHits >= 4) {
        return {
          sheetName,
          headerRowIdx: r,
          resIdCol,
          resNameCol,
          periodCol,
          ordersCol,
          grossCol,
          taxCol,
          tdsCol,
          tcsCol,
          totalDedCol,
          netPayoutCol,
          statusCol,
          utrCol,
        };
      }
    }
  }

  return null;
}

/**
 * Determines whether an uploaded workbook matches the Ownly Payout Ledger Template.
 */
export function isOwnlyPayoutWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
  sampleText: string,
  preferredPlatform?: 'auto' | 'swiggy' | 'zomato' | 'ownly',
  matchedMapping?: AggregatorBrandOutletMapping | null
): boolean {
  if (preferredPlatform === 'swiggy' || preferredPlatform === 'zomato') return false;
  if (matchedMapping && matchedMapping.platform !== 'ownly') return false;

  const lowerFile = fileName.toLowerCase();
  if (
    lowerFile.includes('swiggy') ||
    lowerFile.includes('toing') ||
    lowerFile.includes('zomato') ||
    lowerFile.includes('hyperpure')
  ) {
    return false;
  }

  const headerLayout = locateOwnlyLedgerHeader(workbook);
  if (headerLayout) {
    return true;
  }

  if (preferredPlatform === 'ownly' || matchedMapping?.platform === 'ownly') {
    return false; // Only route to tabular Ownly parser if the 12-col ledger header is found; otherwise fallback handles custom CSVs
  }

  const lowerSample = sampleText.toLowerCase();
  if (
    lowerFile.includes('ownly') &&
    lowerSample.includes('gross amount') &&
    lowerSample.includes('net payout')
  ) {
    return Boolean(locateOwnlyLedgerHeader(workbook));
  }

  return false;
}

/**
 * Parses an Ownly Payout Excel/CSV workbook using the exact 12-column Ownly template:
 *   Restaurant ID | Restaurant Name | Payout Period | Total Orders | Gross Amount |
 *   Tax Deduction | TDS Deduction | TCS Deduction | Total Deductions | Net Payout Amount | Status | UTR
 *
 * Groups rows by (Restaurant ID + Outlet + Accounting Month) so multi-month exports
 * (e.g. 1 Oct -> 31 Oct + 1 Nov -> 1 Nov) are cleanly segregated into their respective accounting months.
 */
export function parseOwnlyPayoutWorkbook(
  workbook: XLSX.WorkBook,
  file: File,
  fileHash: string,
  mappings: AggregatorBrandOutletMapping[],
  options?: {
    preferredPeriodType?: 'monthly' | 'weekly';
    fallbackMonth?: string;
  }
): {
  payouts: PlatformPayoutRecord[];
  matchedMapping: AggregatorBrandOutletMapping | null;
  candidateRestaurantId?: string;
} {
  const layout = locateOwnlyLedgerHeader(workbook);
  if (!layout) {
    throw new Error(
      `Ownly report "${file.name}" does not contain the expected Ownly Payout columns (Restaurant ID, Payout Period, Gross Amount, Tax Deduction, Total Deductions, Net Payout Amount, UTR).`
    );
  }

  const ws = workbook.Sheets[layout.sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: '',
  });

  // Determine default 4-digit year from filename, sheet text, or fallbackMonth
  const yearFromFile = file.name.match(/\b(202\d)\b/);
  const fallbackYear = yearFromFile
    ? yearFromFile[1]
    : options?.fallbackMonth && /^202\d-\d{2}$/.test(options.fallbackMonth)
    ? options.fallbackMonth.slice(0, 4)
    : String(new Date().getFullYear());

  interface Bucket {
    resId: string;
    rawRestaurantName: string;
    brandName: string;
    outletId: 'banaswadi' | 'whitefield';
    accountingMonth: string;
    matchedMapping: AggregatorBrandOutletMapping | null;
    rows: OwnlyPayoutSettlementRow[];
  }

  const buckets = new Map<string, Bucket>();
  const seenUtrPerPeriod = new Set<string>();
  let primaryMatchedMapping: AggregatorBrandOutletMapping | null = null;
  let primaryCandidateResId: string | undefined = extractCandidateRestaurantIdFromFilename(
    file.name
  );

  for (let r = layout.headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r] || [];
    const nonEmptyCount = row.filter((c) => String(c ?? '').trim() !== '').length;
    if (nonEmptyCount < 3) continue;

    const resIdRaw =
      layout.resIdCol >= 0 ? String(row[layout.resIdCol] ?? '').trim() : '';
    const resNameRaw =
      layout.resNameCol >= 0 ? String(row[layout.resNameCol] ?? '').trim() : '';
    const periodRaw =
      layout.periodCol >= 0
        ? row[layout.periodCol] instanceof Date
          ? (row[layout.periodCol] as Date).toISOString().slice(0, 10)
          : String(row[layout.periodCol] ?? '').trim()
        : '';

    // Skip grand total / footer summary rows if an Excel sheet has one at the bottom
    if (/^(total|grand\s*total|summary)$/i.test(resIdRaw) || /^(total|grand\s*total)$/i.test(resNameRaw) || /^(total|grand\s*total)$/i.test(periodRaw)) {
      continue;
    }

    const ordersCell =
      layout.ordersCol >= 0 ? parseOwnlyNumberCell(row[layout.ordersCol]) : { hasNumber: false, value: 0 };
    const grossCell =
      layout.grossCol >= 0 ? parseOwnlyNumberCell(row[layout.grossCol]) : { hasNumber: false, value: 0 };
    const taxCell =
      layout.taxCol >= 0 ? parseOwnlyNumberCell(row[layout.taxCol]) : { hasNumber: false, value: 0 };
    const tdsCell =
      layout.tdsCol >= 0 ? parseOwnlyNumberCell(row[layout.tdsCol]) : { hasNumber: false, value: 0 };
    const tcsCell =
      layout.tcsCol >= 0 ? parseOwnlyNumberCell(row[layout.tcsCol]) : { hasNumber: false, value: 0 };
    const totDedCell =
      layout.totalDedCol >= 0
        ? parseOwnlyNumberCell(row[layout.totalDedCol])
        : { hasNumber: false, value: 0 };
    const netCell =
      layout.netPayoutCol >= 0
        ? parseOwnlyNumberCell(row[layout.netPayoutCol])
        : { hasNumber: false, value: 0 };

    if (!grossCell.hasNumber && !netCell.hasNumber && !ordersCell.hasNumber) {
      continue;
    }

    const statusStr =
      layout.statusCol >= 0 && String(row[layout.statusCol] ?? '').trim()
        ? String(row[layout.statusCol]).trim()
        : 'completed';
    const utrStr = layout.utrCol >= 0 ? formatOwnlyUtrCell(row[layout.utrCol]) : '';

    // Guard against duplicate rows inside the same sheet sharing identical UTR + period + amount
    if (utrStr) {
      const rowKey = `${resIdRaw}|${periodRaw}|${utrStr}|${grossCell.value}`;
      if (seenUtrPerPeriod.has(rowKey)) continue;
      seenUtrPerPeriod.add(rowKey);
    }

    const effectiveResId = resIdRaw || primaryCandidateResId || '';
    if (effectiveResId && !primaryCandidateResId) {
      primaryCandidateResId = effectiveResId;
    }

    const { brandName, outletId, matchedMapping } = inferOwnlyBrandAndOutlet(
      resNameRaw,
      effectiveResId,
      mappings,
      file.name
    );
    if (matchedMapping && !primaryMatchedMapping) {
      primaryMatchedMapping = matchedMapping;
    }

    const periodInfo = parseOwnlyPayoutPeriod(
      periodRaw,
      fallbackYear,
      options?.fallbackMonth
    );

    const grossAmount = grossCell.value;
    const taxDeduction = Math.abs(taxCell.value);
    const tdsDeduction = Math.abs(tdsCell.value);
    const tcsDeduction = Math.abs(tcsCell.value);
    const computedDed = round2(taxDeduction + tdsDeduction + tcsDeduction);
    const totalDeductions = totDedCell.hasNumber ? Math.abs(totDedCell.value) : computedDed;
    const netPayoutAmount = netCell.hasNumber
      ? netCell.value
      : round2(grossAmount - totalDeductions);

    const settlementRow: OwnlyPayoutSettlementRow = {
      id: `ownly-${r}-${utrStr || Math.random().toString(36).slice(2, 6)}`,
      restaurantId: effectiveResId,
      restaurantName:
        resNameRaw ||
        (outletId === 'whitefield' ? `${brandName} -W` : brandName),
      payoutPeriod: periodRaw,
      totalOrders: Math.max(0, Math.round(ordersCell.value)),
      grossAmount,
      taxDeduction,
      tdsDeduction,
      tcsDeduction,
      totalDeductions,
      netPayoutAmount,
      status: statusStr,
      utr: utrStr,
      accountingMonth: periodInfo.accountingMonth,
      startDate: periodInfo.startDate,
      endDate: periodInfo.endDate,
    };

    const bucketKey = `${effectiveResId.toUpperCase()}|${outletId}|${periodInfo.accountingMonth}`;
    const existingBucket = buckets.get(bucketKey);
    if (existingBucket) {
      existingBucket.rows.push(settlementRow);
    } else {
      buckets.set(bucketKey, {
        resId: effectiveResId,
        rawRestaurantName: settlementRow.restaurantName,
        brandName,
        outletId,
        accountingMonth: periodInfo.accountingMonth,
        matchedMapping,
        rows: [settlementRow],
      });
    }
  }

  if (buckets.size === 0) {
    throw new Error(
      `Ownly report "${file.name}" contained headers on sheet "${layout.sheetName}", but no valid payout rows were found.`
    );
  }

  const isWeeklyKeywordInFile = /\b(weekly|week[\s\-_]*[1-5]|w[1-5])\b/i.test(file.name);
  const payouts: PlatformPayoutRecord[] = [];
  let idx = 0;

  for (const bucket of buckets.values()) {
    idx++;
    const baseModel = recalculateOwnlyBreakupModel({
      templateVersion: 'ownly_payout_ledger_v1',
      sheetNameUsed: layout.sheetName,
      resId: bucket.resId || undefined,
      rawRestaurantName: bucket.rawRestaurantName || undefined,
      brandName: bucket.brandName,
      outletLocation: bucket.outletId,
      accountingMonth: bucket.accountingMonth,
      rows: bucket.rows,
      totalOrders: 0,
      totalGrossAmount: 0,
      preTaxFoodSubtotal: 0,
      totalTaxDeduction: 0,
      totalTdsDeduction: 0,
      totalTcsDeduction: 0,
      totalOtherDeductions: 0,
      totalDeductions: 0,
      calculatedNetPayout: 0,
      reportedNetPayout: 0,
      hasExplicitReportedNetPayout: false,
    });

    let spanDays = 0;
    if (baseModel.payoutStartDate && baseModel.payoutEndDate) {
      const t1 = new Date(baseModel.payoutStartDate).getTime();
      const t2 = new Date(baseModel.payoutEndDate).getTime();
      if (!isNaN(t1) && !isNaN(t2) && t2 >= t1) {
        spanDays = Math.round((t2 - t1) / 86400000) + 1;
      }
    }

    const periodType: 'monthly' | 'weekly' =
      spanDays > 10 || bucket.rows.length > 8
        ? 'monthly'
        : isWeeklyKeywordInFile
        ? 'weekly'
        : options?.preferredPeriodType || (spanDays > 0 && spanDays <= 7 ? 'weekly' : 'monthly');

    const skeletonRecord: PlatformPayoutRecord = {
      id: `PAYOUT-OWNLY-${bucket.resId || bucket.outletId}-${bucket.accountingMonth}-${Date.now()}-${idx}`,
      outletId: bucket.outletId,
      month: bucket.accountingMonth,
      platform: 'ownly',
      accountId: bucket.resId || undefined,
      accountName: bucket.brandName,
      grossSales: 0,
      packagingCharges: 0,
      customerDiscounts: 0,
      netSales: 0,
      orderCount: 0,
      cancelledOrders: 0,
      commissionRate: 0,
      commissionAmount: 0,
      paymentGatewayFee: 0,
      deliveryChargesCollected: 0,
      customerDeliveryFeeShare: 0,
      advertisingSpend: 0,
      cancellationCharges: 0,
      swiggyAssureFee: 0,
      otherPlatformFees: 0,
      otherChargesBreakdown: [],
      gstOnCommission: 0,
      tcsDeduction: 0,
      tdsDeduction: 0,
      hyperpureRecovery: 0,
      calculatedNetPayout: 0,
      actualBankSettlement: 0,
      settlementDifference: 0,
      status: 'reconciled',
      periodType,
      weekLabel: baseModel.settlementPeriodLabel,
      payoutStartDate: baseModel.payoutStartDate,
      payoutEndDate: baseModel.payoutEndDate,
      sourceFileName: file.name,
      fileHash,
    };

    payouts.push(applyOwnlyBreakupToPayoutRecord(skeletonRecord, baseModel));
  }

  return {
    payouts,
    matchedMapping: primaryMatchedMapping,
    candidateRestaurantId: primaryCandidateResId,
  };
}
