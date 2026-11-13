/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import {
  PlatformPayoutRecord,
  HyperpureReconciliationReport,
  ChannelPosMatchReport,
  GrowthAnalysisMetrics,
  ChannelAwareBreakEvenMetrics,
  AggregatorBrandOutletMapping,
  PayoutOtherChargeItem,
  OutletId,
} from '../types/finance';
import { RawSalesRecord, ParentDish } from '../types/restaurant';
import { PurchaseRecord } from '../types/purchases';
import { StaffMember } from '../types/payrollStaff';
import { OutletOperatingExpenseItem } from '../types/operatingCosts';
import {
  getSavedAggregatorMappings,
  detectAggregatorMappingFromText,
  extractCandidateRestaurantIdFromFilename,
} from './aggregatorMappingManager';
import {
  applyZomatoBreakupToPayoutRecord,
  isZomatoWorkbook,
  parseZomatoPayoutBreakupWorkbook,
} from './zomatoPayoutModel';
import {
  applySwiggyBreakupToPayoutRecord,
  ensureSwiggyBreakupModelOnRecord,
  isSwiggyBreakupWorkbook,
  parseSwiggyPayoutBreakupWorkbook,
} from './swiggyPayoutModel';
import {
  applyOwnlyBreakupToPayoutRecord,
  ensureOwnlyBreakupModelOnRecord,
  isOwnlyPayoutWorkbook,
  parseOwnlyPayoutWorkbook,
} from './ownlyPayoutModel';

const STORAGE_KEY_PAYOUTS = 'menumind_platform_payouts_v2';

/**
 * Load platform payouts from localStorage.
 */
export function getSavedPayouts(): PlatformPayoutRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAYOUTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load payouts from localStorage:', e);
  }
  return [];
}

/**
 * Persist platform payouts to localStorage.
 */
export function savePayouts(payouts: PlatformPayoutRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PAYOUTS, JSON.stringify(payouts));
  } catch (e) {
    console.error('Failed to save payouts to localStorage:', e);
  }
}

/**
 * Computes SHA-256 hex digest of raw file bytes so identical files are always detected even if renamed.
 */
export async function computeFileSha256(buffer: ArrayBuffer): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fallback below
  }
  const bytes = new Uint8Array(buffer);
  let h1 = 0xdeadbeef ^ bytes.length;
  let h2 = 0x41c6ce57 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}-${bytes.length}`;
}

/**
 * Computes a deterministic semantic fingerprint of payout figures so re-saved copies of the same statement are also caught.
 */
export function computePayoutDataFingerprint(p: Partial<PlatformPayoutRecord>): string {
  const rawPlat = (p.platform || '').toLowerCase().trim();
  const plat = rawPlat === 'toing' ? 'swiggy' : rawPlat;
  const resId = (p.accountId || '').trim();
  const outlet = (p.outletId || '').toLowerCase().trim();
  const month = (p.month || '').trim();
  const pType = (p.periodType || 'monthly').toLowerCase().trim();
  const week = (p.weekLabel || '').toLowerCase().trim();
  const orders = Math.round(Number(p.orderCount) || 0);
  const gross = Math.round(Number(p.grossSales) || 0);
  const net = Math.round(Number(p.actualBankSettlement ?? p.calculatedNetPayout) || 0);
  return `${plat}|${resId}|${outlet}|${month}|${pType}|${week}|${orders}|${gross}|${net}`;
}

/**
 * Checks whether an uploaded file or its extracted payout records duplicate any already-stored statement.
 */
export function checkDuplicatePayoutUpload(
  incoming: {
    fileHash?: string;
    fileName: string;
    payouts: PlatformPayoutRecord[];
  },
  existingPayouts: PlatformPayoutRecord[]
): {
  isDuplicate: boolean;
  reason?: string;
  matchedRecord?: PlatformPayoutRecord;
} {
  const normIncomingName = incoming.fileName.trim().toLowerCase();

  for (const existing of existingPayouts) {
    // 1. Exact SHA-256 byte hash match
    if (incoming.fileHash && existing.fileHash && incoming.fileHash === existing.fileHash) {
      return {
        isDuplicate: true,
        matchedRecord: existing,
        reason: `Duplicate File Rejected: "${incoming.fileName}" has identical file content to already-uploaded "${existing.sourceFileName || existing.id}" (${(existing.accountName || existing.platform).toUpperCase()} · ${existing.outletId.toUpperCase()} · ${existing.month}).`,
      };
    }

    // 2. Exact filename match
    if (
      normIncomingName &&
      existing.sourceFileName &&
      existing.sourceFileName.trim().toLowerCase() === normIncomingName
    ) {
      return {
        isDuplicate: true,
        matchedRecord: existing,
        reason: `Duplicate File Rejected: "${incoming.fileName}" has already been uploaded (${(existing.accountName || existing.platform).toUpperCase()} · ${existing.outletId.toUpperCase()} · ${existing.month}, Net Payout ₹${(existing.actualBankSettlement || existing.calculatedNetPayout || 0).toLocaleString('en-IN')}).`,
      };
    }
  }

  // 3. Semantic data fingerprint match (catches renamed or re-saved duplicates with identical period, Res ID, orders & amounts)
  for (const inc of incoming.payouts) {
    const hasMeaningfulAmounts =
      (inc.grossSales || 0) > 0 || (inc.actualBankSettlement || 0) > 0 || (inc.orderCount || 0) > 0;
    if (!hasMeaningfulAmounts) continue;

    const incFp = inc.dataFingerprint || computePayoutDataFingerprint(inc);
    for (const existing of existingPayouts) {
      const exFp = existing.dataFingerprint || computePayoutDataFingerprint(existing);
      if (incFp === exFp) {
        return {
          isDuplicate: true,
          matchedRecord: existing,
          reason: `Duplicate Payout Data Rejected: Statement data for ${inc.accountName || inc.platform.toUpperCase()} (${inc.accountId ? `ID ${inc.accountId}, ` : ''}${inc.outletId.toUpperCase()}, ${inc.month}${inc.weekLabel ? ` · ${inc.weekLabel}` : ''}, ${inc.orderCount} orders, Gross ₹${inc.grossSales.toLocaleString('en-IN')}) already exists from "${existing.sourceFileName || existing.id}".`,
        };
      }
    }
  }

  // 4. Ownly UTR set duplicate check (rejects re-uploaded Ownly sub-ranges where 100% of UTRs are already stored)
  const existingOwnlyUtrs = new Map<string, PlatformPayoutRecord>();
  for (const ex of existingPayouts) {
    if (ex.platform !== 'ownly' || !ex.ownlyBreakup?.rows) continue;
    for (const r of ex.ownlyBreakup.rows) {
      const u = (r.utr || '').trim();
      if (u) existingOwnlyUtrs.set(u, ex);
    }
  }
  if (existingOwnlyUtrs.size > 0) {
    const incomingOwnlyUtrs = incoming.payouts
      .filter((p) => p.platform === 'ownly' && p.ownlyBreakup?.rows)
      .flatMap((p) => p.ownlyBreakup!.rows.map((r) => (r.utr || '').trim()))
      .filter(Boolean);
    if (
      incomingOwnlyUtrs.length > 0 &&
      incomingOwnlyUtrs.every((u) => existingOwnlyUtrs.has(u))
    ) {
      const matched = existingOwnlyUtrs.get(incomingOwnlyUtrs[0])!;
      return {
        isDuplicate: true,
        matchedRecord: matched,
        reason: `Duplicate Ownly Payout Rejected: All ${incomingOwnlyUtrs.length} settlement UTR(s) in "${incoming.fileName}" already exist in stored statement "${matched.sourceFileName || matched.id}" (${matched.outletId.toUpperCase()} · ${matched.month}).`,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Recalculates derived totals on a PlatformPayoutRecord after parsing or user edits in the Review Modal.
 */
export function recalculatePayoutRecord(
  record: PlatformPayoutRecord,
  syncActualToCalculated = false
): PlatformPayoutRecord {
  if (record.platform === 'zomato' && record.zomatoBreakup) {
    const updatedZomato = applyZomatoBreakupToPayoutRecord(
      record,
      record.zomatoBreakup,
      syncActualToCalculated
    );
    updatedZomato.dataFingerprint = computePayoutDataFingerprint(updatedZomato);
    return updatedZomato;
  }

  if (record.platform === 'swiggy' && record.swiggyBreakup) {
    const updatedSwiggy = applySwiggyBreakupToPayoutRecord(
      record,
      record.swiggyBreakup,
      syncActualToCalculated
    );
    updatedSwiggy.dataFingerprint = computePayoutDataFingerprint(updatedSwiggy);
    return updatedSwiggy;
  }

  if (record.platform === 'ownly' && record.ownlyBreakup) {
    const updatedOwnly = applyOwnlyBreakupToPayoutRecord(
      record,
      record.ownlyBreakup,
      syncActualToCalculated
    );
    updatedOwnly.dataFingerprint = computePayoutDataFingerprint(updatedOwnly);
    return updatedOwnly;
  }

  const breakdown = Array.isArray(record.otherChargesBreakdown) ? record.otherChargesBreakdown : [];
  const otherFromBreakdown =
    breakdown.length > 0
      ? breakdown.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
      : Number(record.otherPlatformFees) || 0;

  const grossSales = round2(Number(record.grossSales) || 0);
  const packagingCharges = round2(Number(record.packagingCharges) || 0);
  const customerDiscounts = round2(Number(record.customerDiscounts) || 0);
  const netSales = round2(grossSales + packagingCharges - customerDiscounts);

  const commissionAmount = round2(Number(record.commissionAmount) || 0);
  const cancellationCharges = round2(Number(record.cancellationCharges) || 0);
  const paymentGatewayFee = round2(Number(record.paymentGatewayFee) || 0);
  const advertisingSpend = round2(Number(record.advertisingSpend) || 0);
  const otherPlatformFees = round2(otherFromBreakdown);
  const gstOnCommission = round2(Number(record.gstOnCommission) || 0);
  const tcsDeduction = round2(Number(record.tcsDeduction) || 0);
  const tdsDeduction = round2(Number(record.tdsDeduction) || 0);
  const hyperpureRecovery = round2(Number(record.hyperpureRecovery) || 0);
  const swiggyAssureFee = round2(Number(record.swiggyAssureFee) || 0);

  const totalDeductions =
    commissionAmount +
    cancellationCharges +
    paymentGatewayFee +
    advertisingSpend +
    otherPlatformFees +
    gstOnCommission +
    tcsDeduction +
    tdsDeduction +
    hyperpureRecovery +
    swiggyAssureFee;

  const calculatedNetPayout = round2(netSales - totalDeductions);
  const actualBankSettlement = syncActualToCalculated
    ? calculatedNetPayout
    : round2(
        record.actualBankSettlement !== undefined && record.actualBankSettlement !== null
          ? Number(record.actualBankSettlement)
          : calculatedNetPayout
      );
  const settlementDifference = round2(calculatedNetPayout - actualBankSettlement);
  const commissionRate = grossSales > 0 ? round2((commissionAmount / grossSales) * 100) : 0;

  const updated: PlatformPayoutRecord = {
    ...record,
    grossSales,
    packagingCharges,
    customerDiscounts,
    netSales,
    commissionRate,
    commissionAmount,
    cancellationCharges,
    paymentGatewayFee,
    advertisingSpend,
    otherPlatformFees,
    otherChargesBreakdown: breakdown,
    gstOnCommission,
    tcsDeduction,
    tdsDeduction,
    hyperpureRecovery,
    swiggyAssureFee,
    calculatedNetPayout,
    actualBankSettlement,
    settlementDifference,
    status: Math.abs(settlementDifference) <= 10 ? 'reconciled' : 'discrepancy',
  };
  updated.dataFingerprint = computePayoutDataFingerprint(updated);
  return updated;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function cleanNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const raw = String(val).trim();
  if (!raw || raw.startsWith('#')) return 0; // Ignore #REF!, #VALUE!, #N/A
  // Handle accounting parentheses e.g. (1,240.50)
  const isParenNeg = /^\(.*\)$/.test(raw);
  const stripped = raw.replace(/[₹$,%\s()]/g, '').replace(/,/g, '');
  const parsed = parseFloat(stripped);
  if (!Number.isFinite(parsed)) return 0;
  return isParenNeg ? -Math.abs(parsed) : parsed;
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

function detectPeriodAndMonthFromText(
  fileName: string,
  sheetSampleText: string,
  fallbackMonth?: string
): {
  month: string;
  isWeekly: boolean;
  weekLabel?: string;
  startDate?: string;
  endDate?: string;
} {
  const combined = `${fileName} ${sheetSampleText}`;
  const lower = combined.toLowerCase();

  let detectedMonth = '';
  let startDate: string | undefined;
  let endDate: string | undefined;

  // 1. Look for YYYY-MM-DD date pairs (date range)
  const isoDates = combined.match(/202\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])/g);
  if (isoDates && isoDates.length > 0) {
    const sorted = [...isoDates].sort();
    startDate = sorted[0];
    endDate = sorted[sorted.length - 1];
    detectedMonth = endDate.slice(0, 7);
  }

  // 2. Look for DD-MM-YYYY or DD/MM/YYYY
  if (!detectedMonth) {
    const dmyMatches = [...combined.matchAll(/\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](202\d)\b/g)];
    if (dmyMatches.length > 0) {
      const parsedDates = dmyMatches
        .map((m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
        .sort();
      startDate = parsedDates[0];
      endDate = parsedDates[parsedDates.length - 1];
      detectedMonth = endDate.slice(0, 7);
    }
  }

  // 3. Look for DD Mon YYYY or Mon YYYY (e.g. "01 Oct 2026 - 31 Oct 2026" or "Oct 2026" or "Oct2026" or "Oct_26")
  if (!detectedMonth) {
    const dMonY = [
      ...combined.matchAll(
        /\b(0?[1-9]|[12]\d|3[01])[\s\-_]*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s\-_,]*(202\d|\d{2})\b/gi
      ),
    ];
    if (dMonY.length > 0) {
      const parsed = dMonY
        .map((m) => {
          const dd = m[1].padStart(2, '0');
          const mm = MONTH_NAME_MAP[m[2].toLowerCase()] || '01';
          const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
          return `${yyyy}-${mm}-${dd}`;
        })
        .sort();
      startDate = parsed[0];
      endDate = parsed[parsed.length - 1];
      detectedMonth = endDate.slice(0, 7);
    }
  }

  if (!detectedMonth) {
    const monY = combined.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s\-_']*(202\d|\d{2})\b/i
    );
    if (monY) {
      const mm = MONTH_NAME_MAP[monY[1].toLowerCase()];
      const yyyy = monY[2].length === 2 ? `20${monY[2]}` : monY[2];
      if (mm) detectedMonth = `${yyyy}-${mm}`;
    }
  }

  if (!detectedMonth) {
    const ym = combined.match(/\b(202\d)[-_](0[1-9]|1[0-2])\b/);
    if (ym) {
      detectedMonth = `${ym[1]}-${ym[2]}`;
    }
  }

  if (!detectedMonth) {
    const now = new Date();
    detectedMonth =
      fallbackMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // Determine whether weekly or monthly based on span or explicit keywords
  let spanDays = 0;
  if (startDate && endDate) {
    const d1 = new Date(startDate).getTime();
    const d2 = new Date(endDate).getTime();
    if (!isNaN(d1) && !isNaN(d2) && d2 >= d1) {
      spanDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  const hasWeeklyKeyword =
    /\b(weekly|week[\s\-_]*[1-5]|w[1-5])\b/i.test(fileName) ||
    /\bweekly\s*(settlement|payout)\b/i.test(lower);
  const isWeekly = hasWeeklyKeyword || (spanDays > 0 && spanDays <= 10);

  let weekLabel: string | undefined;
  if (startDate && endDate && startDate !== endDate) {
    weekLabel = `${startDate} to ${endDate}`;
  } else if (hasWeeklyKeyword) {
    const wkMatch = fileName.match(/\b(week[\s\-_]*[1-5]|w[1-5])\b/i);
    weekLabel = wkMatch ? wkMatch[1].toUpperCase().replace(/[\s_]+/g, ' ') : 'Weekly Settlement';
  }

  return {
    month: detectedMonth,
    isWeekly,
    weekLabel,
    startDate,
    endDate,
  };
}

/**
 * Parses Swiggy, Zomato, or Ownly monthly or weekly payout statements from Excel/CSV files (.xlsx, .xls, .csv).
 * Uses the Aggregator Restaurant ID Mapping Table to segregate Banaswadi and Whitefield outlets automatically,
 * and extracts full line-item breakdowns (Total Orders, Order Value, Commission, Cancellation, GST,
 * Zomato Hyperpure, Swiggy Assure, all Other Charges, and Net Payout) for review in the Editable Modal.
 */
export async function parseAggregatorPayoutSpreadsheet(
  file: File,
  customMappings?: AggregatorBrandOutletMapping[],
  options?: {
    preferredPlatform?: 'auto' | 'swiggy' | 'zomato' | 'ownly';
    preferredPeriodType?: 'monthly' | 'weekly';
    fallbackMonth?: string;
  }
): Promise<{
  payouts: PlatformPayoutRecord[];
  fileName: string;
  fileHash: string;
  detectedPlatform: 'swiggy' | 'zomato' | 'ownly';
  detectedPeriod: 'monthly' | 'weekly';
  matchedMapping: AggregatorBrandOutletMapping | null;
  candidateRestaurantId?: string;
  summary: {
    totalGrossSales: number;
    totalNetPayout: number;
    totalHyperpureDeductions: number;
    totalSwiggyAssure: number;
    recordCount: number;
  };
}> {
  const arrayBuffer = await file.arrayBuffer();
  const fileHash = await computeFileSha256(arrayBuffer);
  const mappings = customMappings || getSavedAggregatorMappings();

  const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
    type: 'array',
    cellDates: true,
  });

  // Sample top metadata rows from lightweight sheets first so Zomato workbooks are routed
  // strictly to "Payout Breakup" without scanning Order-Level or Addition/Deduction sheets.
  const quickMetaSample = workbook.SheetNames.slice(0, 5)
    .filter((n) => !/order[\s_-]*level|transactions?/i.test(n))
    .map((name) => {
      const topRows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        defval: '',
        range: 0,
      });
      return topRows
        .slice(0, 25)
        .map((r) => (r || []).slice(0, 10).join(' '))
        .join(' \n ');
    })
    .join(' \n ');

  const quickMapping =
    detectAggregatorMappingFromText(file.name, mappings) ||
    detectAggregatorMappingFromText(quickMetaSample, mappings);

  if (
    isZomatoWorkbook(
      file.name,
      workbook.SheetNames,
      quickMetaSample,
      options?.preferredPlatform,
      quickMapping
    )
  ) {
    const zomatoRes = parseZomatoPayoutBreakupWorkbook(workbook, file, fileHash, mappings, {
      preferredPeriodType: options?.preferredPeriodType,
      fallbackMonth: options?.fallbackMonth,
    });
    zomatoRes.payout.dataFingerprint = computePayoutDataFingerprint(zomatoRes.payout);
    return {
      payouts: [zomatoRes.payout],
      fileName: file.name,
      fileHash,
      detectedPlatform: 'zomato',
      detectedPeriod: zomatoRes.payout.periodType || 'weekly',
      matchedMapping: zomatoRes.matchedMapping,
      candidateRestaurantId: zomatoRes.candidateRestaurantId,
      summary: {
        totalGrossSales: zomatoRes.payout.grossSales,
        totalNetPayout: zomatoRes.payout.actualBankSettlement,
        totalHyperpureDeductions: zomatoRes.payout.hyperpureRecovery,
        totalSwiggyAssure: 0,
        recordCount: 1,
      },
    };
  }

  if (
    isSwiggyBreakupWorkbook(
      workbook,
      file.name,
      quickMetaSample,
      options?.preferredPlatform,
      quickMapping
    )
  ) {
    const swiggyRes = parseSwiggyPayoutBreakupWorkbook(workbook, file, fileHash, mappings, {
      preferredPeriodType: options?.preferredPeriodType,
      fallbackMonth: options?.fallbackMonth,
    });
    swiggyRes.payout.dataFingerprint = computePayoutDataFingerprint(swiggyRes.payout);
    return {
      payouts: [swiggyRes.payout],
      fileName: file.name,
      fileHash,
      detectedPlatform: 'swiggy',
      detectedPeriod: swiggyRes.payout.periodType || 'weekly',
      matchedMapping: swiggyRes.matchedMapping,
      candidateRestaurantId: swiggyRes.candidateRestaurantId,
      summary: {
        totalGrossSales: swiggyRes.payout.grossSales,
        totalNetPayout: swiggyRes.payout.actualBankSettlement,
        totalHyperpureDeductions: 0,
        totalSwiggyAssure: swiggyRes.payout.swiggyAssureFee || 0,
        recordCount: 1,
      },
    };
  }

  if (
    isOwnlyPayoutWorkbook(
      workbook,
      file.name,
      quickMetaSample,
      options?.preferredPlatform,
      quickMapping
    )
  ) {
    const ownlyRes = parseOwnlyPayoutWorkbook(workbook, file, fileHash, mappings, {
      preferredPeriodType: options?.preferredPeriodType,
      fallbackMonth: options?.fallbackMonth,
    });
    for (const p of ownlyRes.payouts) {
      p.dataFingerprint = computePayoutDataFingerprint(p);
    }
    return {
      payouts: ownlyRes.payouts,
      fileName: file.name,
      fileHash,
      detectedPlatform: 'ownly',
      detectedPeriod: ownlyRes.payouts[0]?.periodType || 'monthly',
      matchedMapping: ownlyRes.matchedMapping,
      candidateRestaurantId: ownlyRes.candidateRestaurantId,
      summary: {
        totalGrossSales: round2(ownlyRes.payouts.reduce((s, p) => s + p.grossSales, 0)),
        totalNetPayout: round2(ownlyRes.payouts.reduce((s, p) => s + p.actualBankSettlement, 0)),
        totalHyperpureDeductions: 0,
        totalSwiggyAssure: 0,
        recordCount: ownlyRes.payouts.length,
      },
    };
  }

  // Convert all sheets to 2D arrays for Ownly / fallback Order-Level statement inspection
  const sheetsData: Array<{ name: string; rows: any[][] }> = workbook.SheetNames.map((name) => {
    const rawRows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: '',
    });
    const normalized = rawRows.map((row) =>
      (row || []).map((cell: any) => {
        if (cell instanceof Date && !isNaN(cell.getTime())) {
          return cell.toISOString().slice(0, 10);
        }
        return cell;
      })
    );
    return { name, rows: normalized };
  });

  // Collect metadata text from top 25 rows of every sheet for platform, Restaurant ID, and period detection
  const topMetadataSample = sheetsData
    .map((s) =>
      s.rows
        .slice(0, 25)
        .map((r) => r.slice(0, 12).join(' '))
        .join(' \n ')
    )
    .join(' \n ');

  const lowerFile = file.name.toLowerCase();
  const lowerMeta = topMetadataSample.toLowerCase();

  // 1. Detect initial platform hint from filename or workbook text (Toing is combined into Swiggy)
  let hintPlatform: 'swiggy' | 'zomato' | 'ownly' | undefined =
    options?.preferredPlatform && options.preferredPlatform !== 'auto'
      ? options.preferredPlatform
      : undefined;

  if (!hintPlatform) {
    if (lowerFile.includes('swiggy') || lowerFile.includes('toing') || lowerFile.includes('bundl')) {
      hintPlatform = 'swiggy';
    } else if (lowerFile.includes('zomato') || lowerFile.includes('hyperpure') || lowerFile.includes('eternal')) {
      hintPlatform = 'zomato';
    } else if (lowerFile.includes('ownly') || lowerFile.includes('ondc')) {
      hintPlatform = 'ownly';
    } else if (
      lowerMeta.includes('swiggy') ||
      lowerMeta.includes('toing') ||
      lowerMeta.includes('bundl technologies') ||
      lowerMeta.includes('swiggy assure')
    ) {
      hintPlatform = 'swiggy';
    } else if (lowerMeta.includes('zomato') || lowerMeta.includes('hyperpure')) {
      hintPlatform = 'zomato';
    } else if (lowerMeta.includes('ownly')) {
      hintPlatform = 'ownly';
    }
  }

  // 2. Match Restaurant ID from filename FIRST, then from workbook metadata cells
  let matchedMapping =
    detectAggregatorMappingFromText(file.name, mappings, hintPlatform) ||
    detectAggregatorMappingFromText(topMetadataSample, mappings, hintPlatform);

  const detectedPlatform: 'swiggy' | 'zomato' | 'ownly' =
    matchedMapping?.platform || hintPlatform || 'swiggy';

  // Extract candidate Restaurant ID if not yet in mapping table
  let candidateRestaurantId = matchedMapping?.restaurantId || extractCandidateRestaurantIdFromFilename(file.name);
  if (!candidateRestaurantId) {
    const resIdCellMatch = topMetadataSample.match(
      /(?:restaurant\s*id|res\.?\s*id|partner\s*id|store\s*id|merchant\s*id)[\s:=-]*(\d{5,10})/i
    );
    if (resIdCellMatch) {
      candidateRestaurantId = resIdCellMatch[1];
      if (!matchedMapping) {
        matchedMapping = detectAggregatorMappingFromText(candidateRestaurantId, mappings, detectedPlatform);
      }
    }
  }

  // 3. Detect Month & Weekly/Monthly Period
  const periodInfo = detectPeriodAndMonthFromText(file.name, topMetadataSample, options?.fallbackMonth);
  const effectivePeriodType: 'monthly' | 'weekly' =
    options?.preferredPeriodType || (periodInfo.isWeekly ? 'weekly' : 'monthly');

  // 4. Parse financial figures: try Order-Level sheet + Summary/Breakup sheet and reconcile best figures
  const summaryParsed = extractFromSummarySheets(sheetsData, detectedPlatform);
  const tabularParsed = extractFromOrderLevelSheets(sheetsData, mappings, detectedPlatform);

  // Decide whether workbook has per-Res-ID multi-outlet rows in tabular sheet (when filename had NO single Res ID)
  if (!matchedMapping && tabularParsed.byResId.size > 1) {
    const multiPayouts: PlatformPayoutRecord[] = [];
    let idx = 1;
    for (const [resIdKey, bucket] of tabularParsed.byResId.entries()) {
      const rowMap = detectAggregatorMappingFromText(resIdKey, mappings, detectedPlatform);
      const outletId: 'banaswadi' | 'whitefield' =
        rowMap?.outletId ||
        (bucket.outletHint.includes('whitefield') || bucket.outletHint.endsWith('w')
          ? 'whitefield'
          : 'banaswadi');
      const brandName = rowMap?.brandName || bucket.brandHint || detectedPlatform.toUpperCase();

      const otherBreakdown: PayoutOtherChargeItem[] = Object.entries(bucket.otherCharges)
        .filter(([, amt]) => Math.abs(amt) >= 0.5)
        .map(([label, amt], i) => ({
          id: `other-${idx}-${i + 1}`,
          label,
          amount: round2(Math.abs(amt)),
        }));

      const rec = recalculatePayoutRecord({
        id: `PAYOUT-${detectedPlatform.toUpperCase()}-${resIdKey || outletId.toUpperCase()}-${Date.now()}-${idx}`,
        outletId,
        month: periodInfo.month,
        platform: rowMap?.platform || detectedPlatform,
        accountId: rowMap?.restaurantId || resIdKey || undefined,
        accountName: brandName,
        grossSales: bucket.gross,
        packagingCharges: bucket.packaging,
        customerDiscounts: bucket.discount,
        netSales: bucket.gross + bucket.packaging - bucket.discount,
        orderCount: bucket.deliveredOrders,
        cancelledOrders: bucket.cancelledOrders,
        commissionRate: 0,
        commissionAmount: bucket.commission,
        paymentGatewayFee: bucket.pgFee,
        deliveryChargesCollected: 0,
        customerDeliveryFeeShare: 0,
        advertisingSpend: bucket.ads,
        cancellationCharges: bucket.cancellation,
        swiggyAssureFee: bucket.swiggyAssure,
        otherPlatformFees: otherBreakdown.reduce((s, c) => s + c.amount, 0),
        otherChargesBreakdown: otherBreakdown,
        gstOnCommission: bucket.gst,
        tcsDeduction: bucket.tcs,
        tdsDeduction: bucket.tds,
        hyperpureRecovery: bucket.hyperpure,
        calculatedNetPayout: 0,
        actualBankSettlement: bucket.netPayout > 0 ? bucket.netPayout : 0,
        settlementDifference: 0,
        status: 'reconciled',
        periodType: effectivePeriodType,
        weekLabel: periodInfo.weekLabel,
        payoutStartDate: periodInfo.startDate,
        payoutEndDate: periodInfo.endDate,
        payoutDate: new Date().toISOString().slice(0, 10),
        sourceFileName: file.name,
        fileHash,
      }, bucket.netPayout === 0);
      multiPayouts.push(rec);
      idx++;
    }

    return {
      payouts: multiPayouts,
      fileName: file.name,
      fileHash,
      detectedPlatform,
      detectedPeriod: effectivePeriodType,
      matchedMapping,
      candidateRestaurantId,
      summary: {
        totalGrossSales: multiPayouts.reduce((s, p) => s + p.grossSales, 0),
        totalNetPayout: multiPayouts.reduce((s, p) => s + p.actualBankSettlement, 0),
        totalHyperpureDeductions: multiPayouts.reduce((s, p) => s + (p.hyperpureRecovery || 0), 0),
        totalSwiggyAssure: multiPayouts.reduce((s, p) => s + (p.swiggyAssureFee || 0), 0),
        recordCount: multiPayouts.length,
      },
    };
  }

  // Standard case: Single statement file (mapped via Restaurant ID in Excel filename or sheet)
  const resolvedOutlet: 'banaswadi' | 'whitefield' =
    matchedMapping?.outletId ||
    (lowerFile.includes('whitefield') || lowerFile.includes('-w') || lowerMeta.includes('whitefield')
      ? 'whitefield'
      : 'banaswadi');

  const resolvedBrand =
    matchedMapping?.brandName ||
    (lowerFile.includes('niraamish') || lowerMeta.includes('niraamish')
      ? 'Niraamish'
      : lowerFile.includes('banglar') || lowerMeta.includes('banglar jhale')
      ? 'Banglar Jhale Jhole'
      : `${detectedPlatform.charAt(0).toUpperCase() + detectedPlatform.slice(1)} Account`);

  const resolvedResId = matchedMapping?.restaurantId || candidateRestaurantId;

  // Combine best values from Summary sheet & Order-Level sheet (preferring non-zero Summary totals for statement-level charges like Ads, Assure, Hyperpure, and Order-Level counts when Summary lacks order count)
  const pickVal = (sumVal: number, tabVal: number) => (Math.abs(sumVal) > 0 ? sumVal : tabVal);

  const grossSales = pickVal(summaryParsed.gross, tabularParsed.totals.gross);
  const packagingCharges = pickVal(summaryParsed.packaging, tabularParsed.totals.packaging);
  const customerDiscounts = Math.abs(pickVal(summaryParsed.discount, tabularParsed.totals.discount));
  const orderCount =
    summaryParsed.deliveredOrders > 0
      ? Math.round(summaryParsed.deliveredOrders)
      : Math.round(tabularParsed.totals.deliveredOrders);
  const cancelledOrders =
    summaryParsed.cancelledOrders > 0
      ? Math.round(summaryParsed.cancelledOrders)
      : Math.round(tabularParsed.totals.cancelledOrders);

  const commissionAmount = Math.abs(pickVal(summaryParsed.commission, tabularParsed.totals.commission));
  const cancellationCharges = Math.abs(pickVal(summaryParsed.cancellation, tabularParsed.totals.cancellation));
  const paymentGatewayFee = Math.abs(pickVal(summaryParsed.pgFee, tabularParsed.totals.pgFee));
  const advertisingSpend = Math.abs(pickVal(summaryParsed.ads, tabularParsed.totals.ads));
  const swiggyAssureFee = Math.abs(pickVal(summaryParsed.swiggyAssure, tabularParsed.totals.swiggyAssure));
  const hyperpureRecovery = Math.abs(pickVal(summaryParsed.hyperpure, tabularParsed.totals.hyperpure));
  const gstOnCommission = Math.abs(pickVal(summaryParsed.gst, tabularParsed.totals.gst));
  const tcsDeduction = Math.abs(pickVal(summaryParsed.tcs, tabularParsed.totals.tcs));
  const tdsDeduction = Math.abs(pickVal(summaryParsed.tds, tabularParsed.totals.tds));
  const parsedNetPayout = pickVal(summaryParsed.netPayout, tabularParsed.totals.netPayout);

  // Merge otherChargesBreakdown from summary sheet + order-level extra fee columns
  const mergedOtherMap = new Map<string, number>();
  for (const item of summaryParsed.otherBreakdown) {
    if (Math.abs(item.amount) >= 0.5) {
      mergedOtherMap.set(item.label, (mergedOtherMap.get(item.label) || 0) + Math.abs(item.amount));
    }
  }
  if (mergedOtherMap.size === 0) {
    for (const [label, amt] of Object.entries(tabularParsed.totals.otherCharges)) {
      if (Math.abs(amt) >= 0.5) {
        mergedOtherMap.set(label, Math.abs(amt));
      }
    }
  }

  const otherChargesBreakdown: PayoutOtherChargeItem[] = Array.from(mergedOtherMap.entries()).map(
    ([label, amount], idx) => ({
      id: `other-charge-${idx + 1}`,
      label,
      amount: round2(amount),
    })
  );

  let singleRecord = recalculatePayoutRecord(
    {
      id: `PAYOUT-${detectedPlatform.toUpperCase()}-${resolvedResId || resolvedOutlet.toUpperCase()}-${periodInfo.month}-${Date.now()}`,
      outletId: resolvedOutlet,
      month: periodInfo.month,
      platform: detectedPlatform,
      accountId: resolvedResId,
      accountName: resolvedBrand,
      grossSales,
      packagingCharges,
      customerDiscounts,
      netSales: grossSales + packagingCharges - customerDiscounts,
      orderCount,
      cancelledOrders,
      commissionRate: 0,
      commissionAmount,
      paymentGatewayFee,
      deliveryChargesCollected: 0,
      customerDeliveryFeeShare: 0,
      advertisingSpend,
      cancellationCharges,
      swiggyAssureFee,
      otherPlatformFees: otherChargesBreakdown.reduce((s, c) => s + c.amount, 0),
      otherChargesBreakdown,
      gstOnCommission,
      tcsDeduction,
      tdsDeduction,
      hyperpureRecovery,
      calculatedNetPayout: 0,
      actualBankSettlement: parsedNetPayout,
      settlementDifference: 0,
      status: 'reconciled',
      periodType: effectivePeriodType,
      weekLabel: periodInfo.weekLabel,
      payoutStartDate: periodInfo.startDate,
      payoutEndDate: periodInfo.endDate,
      payoutDate: new Date().toISOString().slice(0, 10),
      sourceFileName: file.name,
      fileHash,
    },
    parsedNetPayout === 0
  );

  if (singleRecord.platform === 'swiggy' && !singleRecord.swiggyBreakup) {
    const hydratedSwiggy = ensureSwiggyBreakupModelOnRecord(singleRecord);
    singleRecord = recalculatePayoutRecord(
      applySwiggyBreakupToPayoutRecord(singleRecord, hydratedSwiggy, parsedNetPayout === 0),
      parsedNetPayout === 0
    );
  } else if (singleRecord.platform === 'ownly' && !singleRecord.ownlyBreakup) {
    const hydratedOwnly = ensureOwnlyBreakupModelOnRecord(singleRecord);
    singleRecord = recalculatePayoutRecord(
      applyOwnlyBreakupToPayoutRecord(singleRecord, hydratedOwnly, parsedNetPayout === 0),
      parsedNetPayout === 0
    );
  }

  return {
    payouts: [singleRecord],
    fileName: file.name,
    fileHash,
    detectedPlatform,
    detectedPeriod: effectivePeriodType,
    matchedMapping,
    candidateRestaurantId: resolvedResId,
    summary: {
      totalGrossSales: singleRecord.grossSales,
      totalNetPayout: singleRecord.actualBankSettlement,
      totalHyperpureDeductions: singleRecord.hyperpureRecovery,
      totalSwiggyAssure: singleRecord.swiggyAssureFee || 0,
      recordCount: 1,
    },
  };
}

interface ParsedSummaryMetrics {
  deliveredOrders: number;
  cancelledOrders: number;
  gross: number;
  packaging: number;
  discount: number;
  commission: number;
  pgFee: number;
  cancellation: number;
  ads: number;
  swiggyAssure: number;
  hyperpure: number;
  gst: number;
  tcs: number;
  tds: number;
  netPayout: number;
  otherBreakdown: Array<{ label: string; amount: number }>;
}

/**
 * Scans Summary / Payout Breakup / Annexure key-value sheets where line item labels are in left columns
 * and amounts are in adjacent columns.
 */
function extractFromSummarySheets(
  sheetsData: Array<{ name: string; rows: any[][] }>,
  platform: 'swiggy' | 'zomato' | 'ownly'
): ParsedSummaryMetrics {
  const result: ParsedSummaryMetrics = {
    deliveredOrders: 0,
    cancelledOrders: 0,
    gross: 0,
    packaging: 0,
    discount: 0,
    commission: 0,
    pgFee: 0,
    cancellation: 0,
    ads: 0,
    swiggyAssure: 0,
    hyperpure: 0,
    gst: 0,
    tcs: 0,
    tds: 0,
    netPayout: 0,
    otherBreakdown: [],
  };

  // Prioritize sheets named Summary, Payout, Breakup, Invoice, Settlement, Deductions
  const candidateSheets = sheetsData.filter((s) => {
    const n = s.name.toLowerCase();
    // Skip huge raw order-level sheets (> 250 rows) during key-value summary scan
    if (s.rows.length > 250 && (n.includes('order') || n.includes('transaction'))) return false;
    return true;
  });

  const seenLabels = new Set<string>();

  for (const sheet of candidateSheets) {
    // Check if this sheet is actually an order-level table (many columns with Order ID header)
    const hasOrderIdHeader = sheet.rows.slice(0, 12).some((r) => {
      const joined = r.map((c) => String(c || '').toLowerCase().trim()).join('|');
      return /order[\s_]*id/.test(joined) && r.filter((c) => String(c || '').trim() !== '').length >= 6;
    });
    if (hasOrderIdHeader && sheet.rows.length > 25) continue;

    for (let rIdx = 0; rIdx < Math.min(sheet.rows.length, 150); rIdx++) {
      const row = sheet.rows[rIdx];
      if (!row || row.length < 2) continue;

      // Find first non-empty text cell in columns 0..3 as label, and last/rightmost meaningful numeric cell in columns 1..8
      let label = '';
      let labelCol = -1;
      for (let c = 0; c < Math.min(4, row.length); c++) {
        const txt = String(row[c] ?? '').trim();
        if (txt && isNaN(Number(txt.replace(/[₹,\s]/g, '')))) {
          label = txt;
          labelCol = c;
          break;
        }
      }
      if (!label || label.length > 90) continue;

      const numericValues: number[] = [];
      for (let c = labelCol + 1; c < Math.min(row.length, labelCol + 8); c++) {
        const rawCell = row[c];
        if (rawCell === '' || rawCell === null || rawCell === undefined) continue;
        const rawStr = String(rawCell).trim();
        // Skip pure percentage cells like "22%" or "18.00%"
        if (rawStr.endsWith('%')) continue;
        // Skip dates
        if (/^\d{4}-\d{2}-\d{2}/.test(rawStr)) continue;
        const val = cleanNumber(rawCell);
        if (val !== 0 || rawStr === '0' || rawStr === '0.00') {
          numericValues.push(val);
        }
      }
      if (numericValues.length === 0) continue;

      // In Swiggy/Zomato summary sheets, the final settled/total column for that line is usually the last numeric cell on the row (or first if 2-col table)
      const val = numericValues[numericValues.length - 1];
      const norm = label.toLowerCase().replace(/\s+/g, ' ').trim();
      const dedupeKey = `${sheet.name.toLowerCase()}|${norm}`;
      if (seenLabels.has(dedupeKey)) continue;

      // Ignore metadata IDs like Restaurant ID, GSTIN, UTR, Account Number
      if (
        /restaurant\s*id|res\.?\s*id|partner\s*id|store\s*id|gstin|utr|bank\s*account|ifsc|pan\s*no|cin|pincode|phone|invoice\s*no/i.test(
          norm
        )
      ) {
        continue;
      }

      // Order counts
      if (/^(total\s*)?(delivered\s*)?orders?(\s*count)?$|^no\.?\s*of\s*(delivered\s*)?orders$/i.test(norm)) {
        if (val > 0 && val < 100000 && result.deliveredOrders === 0) {
          result.deliveredOrders = Math.round(val);
          seenLabels.add(dedupeKey);
        }
        continue;
      }
      if (/cancelled\s*orders|rejected\s*orders/i.test(norm) && !/charge|fee|amount|deduction|refund/i.test(norm)) {
        if (val >= 0 && val < 50000 && result.cancelledOrders === 0) {
          result.cancelledOrders = Math.round(Math.abs(val));
          seenLabels.add(dedupeKey);
        }
        continue;
      }

      // Gross order value / Item total
      if (
        /^(item\s*total|total\s*order\s*value|gross\s*sales|gross\s*order\s*value|food\s*sales|subtotal|order\s*subtotal|total\s*gross\s*revenue|customer\s*bill\s*value)$/i.test(
          norm
        ) ||
        ((norm.includes('item total') || norm.includes('gross sales') || norm.includes('total order value')) &&
          !norm.includes('after') &&
          !norm.includes('net'))
      ) {
        if (Math.abs(val) > result.gross) {
          result.gross = Math.abs(val);
          seenLabels.add(dedupeKey);
        }
        continue;
      }

      // Packaging charges
      if (/pack(ag)?ing\s*(charge|fee)|restaurant\s*pack|container\s*charge/i.test(norm)) {
        result.packaging += Math.abs(val);
        seenLabels.add(dedupeKey);
        continue;
      }

      // Customer / Merchant Discounts
      if (
        /discount|promo\s*recovery|merchant\s*share\s*of\s*discount|restaurant\s*promo|coupon|offer\s*burn|gold\s*discount/i.test(
          norm
        ) &&
        !norm.includes('commission')
      ) {
        if (result.discount === 0) {
          result.discount = Math.abs(val);
        } else if (!norm.includes('total')) {
          result.discount += Math.abs(val);
        }
        seenLabels.add(dedupeKey);
        continue;
      }

      // Swiggy Assure (Swiggy-specific program)
      if (/assure|swiggy\s*assure|on[\s-]*time\s*guarantee/i.test(norm)) {
        result.swiggyAssure += Math.abs(val);
        seenLabels.add(dedupeKey);
        continue;
      }

      // Zomato Hyperpure (Zomato-specific supplier offset)
      if (/hyperpure|vendor\s*recovery|supplier\s*offset|hyperpure\s*deduction/i.test(norm)) {
        result.hyperpure += Math.abs(val);
        seenLabels.add(dedupeKey);
        continue;
      }

      // Cancellation charges / refunds
      if (/cancellation|merchant\s*cancel|rejection\s*penalty|customer\s*refund|order\s*refund|disputed\s*order/i.test(norm)) {
        result.cancellation += Math.abs(val);
        seenLabels.add(dedupeKey);
        continue;
      }

      // Payment Gateway / Collection fee
      if (/payment\s*(mechanism|gateway|collection|processing)|pg\s*fee|collection\s*fee/i.test(norm)) {
        result.pgFee += Math.abs(val);
        seenLabels.add(dedupeKey);
        continue;
      }

      // Ads / Marketing
      if (/\b(ads?|cpc|marketing|visibility|banner|high\s*priority|growth\s*pack|sponsored|promotion\s*fee)\b/i.test(norm)) {
        result.ads += Math.abs(val);
        seenLabels.add(dedupeKey);
        continue;
      }

      // TCS & TDS (check before generic tax/GST)
      if (/\btcs\b|tax\s*collected\s*at\s*source/i.test(norm)) {
        result.tcs += Math.abs(val);
        seenLabels.add(dedupeKey);
        continue;
      }
      if (/\btds\b|194[\s-]*o|tax\s*deducted\s*at\s*source/i.test(norm)) {
        result.tds += Math.abs(val);
        seenLabels.add(dedupeKey);
        continue;
      }

      // GST (on commission / service fee / 9(5))
      if (/\bgst\b|\bigst\b|\bcgst\b|\bsgst\b|tax\s*on\s*(service|commission|platform)|9\s*\(\s*5\s*\)/i.test(norm)) {
        // Avoid double-counting CGST + SGST if Total GST already captured
        if (norm.includes('total gst') || norm.includes('gst on')) {
          result.gst = Math.max(result.gst, Math.abs(val));
        } else {
          result.gst += Math.abs(val);
        }
        seenLabels.add(dedupeKey);
        continue;
      }

      // Platform Commission / Service Fee
      if (
        /\b(commission|swiggy\s*service\s*fee|zomato\s*service\s*fee|service\s*fee|platform\s*fee|aggregator\s*fee|marketplace\s*fee)\b/i.test(
          norm
        ) &&
        !norm.includes('total deductions') &&
        !norm.includes('including gst')
      ) {
        if (result.commission === 0) {
          result.commission = Math.abs(val);
        } else if (!norm.includes('total')) {
          result.commission += Math.abs(val);
        }
        seenLabels.add(dedupeKey);
        continue;
      }

      // Net Payout / Bank Settlement
      if (
        /\b(net\s*payout|net\s*payable|bank\s*settlement|amount\s*transferred|net\s*bank\s*credit|final\s*settlement|payout\s*amount|total\s*payable\s*to\s*merchant|settled\s*amount)\b/i.test(
          norm
        )
      ) {
        if (Math.abs(val) > 0) {
          result.netPayout = val;
          seenLabels.add(dedupeKey);
        }
        continue;
      }

      // Capture other specific payout Excel deductions/charges (e.g. Long Distance Fee, Pocket Hero, Call Center, Hygiene, Logistics, Adjustments)
      if (
        /\b(long\s*distance|pocket\s*hero|call\s*center|support\s*fee|logistics|delivery\s*fee|onboarding|device\s*rental|penalty|hygiene|zomato\s*gold\s*fee|loyalty|one\s*fee|swiggy\s*one|other\s*charges?|other\s*deductions?|miscellaneous|adjustment)\b/i.test(
          norm
        ) &&
        !/^total/i.test(norm) &&
        Math.abs(val) > 0
      ) {
        result.otherBreakdown.push({
          label: label.replace(/^[-•*\d.)\s]+/, '').trim(),
          amount: Math.abs(val),
        });
        seenLabels.add(dedupeKey);
      }
    }
  }

  return result;
}

interface OrderBucket {
  deliveredOrders: number;
  cancelledOrders: number;
  gross: number;
  packaging: number;
  discount: number;
  commission: number;
  pgFee: number;
  cancellation: number;
  ads: number;
  swiggyAssure: number;
  hyperpure: number;
  gst: number;
  tcs: number;
  tds: number;
  netPayout: number;
  outletHint: string;
  brandHint: string;
  otherCharges: Record<string, number>;
}

function emptyOrderBucket(): OrderBucket {
  return {
    deliveredOrders: 0,
    cancelledOrders: 0,
    gross: 0,
    packaging: 0,
    discount: 0,
    commission: 0,
    pgFee: 0,
    cancellation: 0,
    ads: 0,
    swiggyAssure: 0,
    hyperpure: 0,
    gst: 0,
    tcs: 0,
    tds: 0,
    netPayout: 0,
    outletHint: '',
    brandHint: '',
    otherCharges: {},
  };
}

/**
 * Scans Order-Level / Tabular payout sheets to compute exact order counts, gross values, commissions,
 * cancellation charges, GST, Hyperpure, Swiggy Assure, and any extra charge columns.
 */
function extractFromOrderLevelSheets(
  sheetsData: Array<{ name: string; rows: any[][] }>,
  mappings: AggregatorBrandOutletMapping[],
  platform: 'swiggy' | 'zomato' | 'ownly'
): {
  totals: OrderBucket;
  byResId: Map<string, OrderBucket>;
} {
  const totals = emptyOrderBucket();
  const byResId = new Map<string, OrderBucket>();

  // Find best tabular sheet (preferring 'Order Level', 'Orders', 'Order Wise', or the first tabular sheet with headers)
  let targetSheet: { name: string; rows: any[][] } | null = null;
  let headerRowIdx = -1;

  const sortedSheets = [...sheetsData].sort((a, b) => {
    const score = (n: string) =>
      /order[\s_-]*(level|wise|breakup|detail)|^orders$/i.test(n) ? 2 : /summary|breakup/i.test(n) ? 0 : 1;
    return score(b.name) - score(a.name);
  });

  for (const sheet of sortedSheets) {
    for (let i = 0; i < Math.min(sheet.rows.length, 20); i++) {
      const row = sheet.rows[i] || [];
      const nonEmpty = row.filter((c) => String(c ?? '').trim() !== '');
      if (nonEmpty.length < 4) continue;
      const rowLower = row.map((c) => String(c ?? '').toLowerCase().trim());
      const hits = rowLower.filter((h) =>
        /order\s*id|item\s*total|gross|subtotal|order\s*value|commission|service\s*fee|net\s*payout|net\s*payable|settlement|payable/i.test(
          h
        )
      );
      if (hits.length >= 2) {
        targetSheet = sheet;
        headerRowIdx = i;
        break;
      }
    }
    if (targetSheet) break;
  }

  if (!targetSheet || headerRowIdx === -1) {
    return { totals, byResId };
  }

  const rawHeaders = (targetSheet.rows[headerRowIdx] || []).map((c) => String(c ?? '').trim());
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/\s+/g, ' '));

  const findIdx = (test: (h: string) => boolean): number => headers.findIndex(test);

  const orderIdIdx = findIdx((h) => /^order[\s_]*id|^bill[\s_]*id|^invoice[\s_]*id/.test(h));
  const statusIdx = findIdx((h) => /order[\s_]*status|^status$/.test(h));
  const resIdIdx = findIdx((h) => /res(taurant)?[\s_.]*id|store[\s_]*id|partner[\s_]*id/.test(h));
  const resNameIdx = findIdx((h) => /res(taurant)?[\s_]*name|brand[\s_]*name|outlet[\s_]*name|^outlet$|^branch$/.test(h));

  const grossIdx = findIdx((h) =>
    /^(item\s*total|gross\s*sales|order\s*value|total\s*order\s*value|subtotal|bill\s*subtotal|food\s*sales|item\s*subtotal)$/.test(h) ||
    ((h.includes('item total') || h.includes('gross') || h.includes('order value')) && !h.includes('net') && !h.includes('gst'))
  );
  const packIdx = findIdx((h) => /pack(ag)?ing|container\s*charge/.test(h));
  const discIdx = findIdx((h) => /(discount|promo|coupon|merchant\s*offer)/.test(h) && !h.includes('commission'));
  const commIdx = findIdx((h) =>
    /(commission|service\s*fee|platform\s*fee|marketplace\s*fee)/.test(h) &&
    !h.includes('gst') &&
    !h.includes('%') &&
    !h.includes('rate')
  );
  const pgIdx = findIdx((h) => /payment\s*(mechanism|gateway|collection)|pg\s*fee|collection\s*fee/.test(h));
  const cancelIdx = findIdx((h) => /(cancellation|refund|rejection\s*penalty|customer\s*compensation)/.test(h) && !h.includes('status'));
  const adsIdx = findIdx((h) => /\b(ads?|cpc|marketing|visibility|sponsored|growth\s*pack)\b/.test(h));
  const assureIdx = findIdx((h) => /assure|on[\s-]*time\s*guarantee/.test(h));
  const hyperpureIdx = findIdx((h) => /hyperpure|vendor\s*recovery|supplier\s*offset/.test(h));
  const gstIdx = findIdx((h) => /\b(gst|igst|total\s*gst|tax\s*on\s*service|tax\s*on\s*commission)\b/.test(h) && !h.includes('gstin') && !h.includes('customer gst'));
  const cgstIdx = gstIdx === -1 ? findIdx((h) => /\bcgst\b/.test(h)) : -1;
  const sgstIdx = gstIdx === -1 ? findIdx((h) => /\bsgst\b/.test(h)) : -1;
  const tcsIdx = findIdx((h) => /\btcs\b/.test(h));
  const tdsIdx = findIdx((h) => /\btds\b|194[\s-]*o/.test(h));
  const netIdx = findIdx((h) =>
    /net\s*(payout|payable|receivable|settlement|amount)|bank\s*(settlement|credit)|amount\s*(transferred|payable)|^payable$/.test(h)
  );
  const orderCountColIdx = orderIdIdx === -1 ? findIdx((h) => /order\s*count|total\s*orders|^orders$|^trips$/.test(h)) : -1;

  // Detect any extra charge/deduction columns present in the payout Excel!
  const knownCols = new Set(
    [
      orderIdIdx,
      statusIdx,
      resIdIdx,
      resNameIdx,
      grossIdx,
      packIdx,
      discIdx,
      commIdx,
      pgIdx,
      cancelIdx,
      adsIdx,
      assureIdx,
      hyperpureIdx,
      gstIdx,
      cgstIdx,
      sgstIdx,
      tcsIdx,
      tdsIdx,
      netIdx,
      orderCountColIdx,
    ].filter((i) => i >= 0)
  );

  const extraChargeCols: Array<{ idx: number; label: string }> = [];
  headers.forEach((h, idx) => {
    if (knownCols.has(idx) || !h) return;
    if (
      /\b(long\s*distance|pocket\s*hero|call\s*center|logistics|delivery\s*charge|swiggy\s*one|gold\s*fee|loyalty|onboarding|penalty|other\s*fee|other\s*charge|other\s*deduction|deduction|fee)\b/.test(
        h
      ) &&
      !/rate|%|id|date|time|type|mode|utr|status/.test(h)
    ) {
      extraChargeCols.push({ idx, label: rawHeaders[idx] || h });
    }
  });

  const seenOrderIds = new Set<string>();

  for (let r = headerRowIdx + 1; r < targetSheet.rows.length; r++) {
    const row = targetSheet.rows[r];
    if (!row || row.length === 0) continue;

    // Skip footer "Total" / "Grand Total" rows so we don't double-sum!
    const firstNonEmpty = String(row.find((c) => String(c ?? '').trim() !== '') ?? '')
      .toLowerCase()
      .trim();
    if (/^(total|grand\s*total|sub\s*total|sum|net\s*total)$/i.test(firstNonEmpty)) {
      continue;
    }

    const gross = grossIdx !== -1 ? Math.abs(cleanNumber(row[grossIdx])) : 0;
    const pack = packIdx !== -1 ? Math.abs(cleanNumber(row[packIdx])) : 0;
    const disc = discIdx !== -1 ? Math.abs(cleanNumber(row[discIdx])) : 0;
    const comm = commIdx !== -1 ? Math.abs(cleanNumber(row[commIdx])) : 0;
    const pg = pgIdx !== -1 ? Math.abs(cleanNumber(row[pgIdx])) : 0;
    const cancel = cancelIdx !== -1 ? Math.abs(cleanNumber(row[cancelIdx])) : 0;
    const ads = adsIdx !== -1 ? Math.abs(cleanNumber(row[adsIdx])) : 0;
    const assure = assureIdx !== -1 ? Math.abs(cleanNumber(row[assureIdx])) : 0;
    const hyper = hyperpureIdx !== -1 ? Math.abs(cleanNumber(row[hyperpureIdx])) : 0;
    const gst =
      gstIdx !== -1
        ? Math.abs(cleanNumber(row[gstIdx]))
        : (cgstIdx !== -1 ? Math.abs(cleanNumber(row[cgstIdx])) : 0) +
          (sgstIdx !== -1 ? Math.abs(cleanNumber(row[sgstIdx])) : 0);
    const tcs = tcsIdx !== -1 ? Math.abs(cleanNumber(row[tcsIdx])) : 0;
    const tds = tdsIdx !== -1 ? Math.abs(cleanNumber(row[tdsIdx])) : 0;
    const net = netIdx !== -1 ? cleanNumber(row[netIdx]) : 0;

    if (gross === 0 && net === 0 && comm === 0 && cancel === 0 && hyper === 0 && assure === 0) {
      continue;
    }

    const statusStr = statusIdx !== -1 ? String(row[statusIdx] || '').toLowerCase() : '';
    const isCancelledRow = statusStr.includes('cancel') || statusStr.includes('reject');

    let orderIncrement = 0;
    if (orderIdIdx !== -1) {
      const oid = String(row[orderIdIdx] || '').trim();
      if (oid && !seenOrderIds.has(oid)) {
        seenOrderIds.add(oid);
        orderIncrement = 1;
      } else if (!oid) {
        orderIncrement = 1;
      }
    } else if (orderCountColIdx !== -1) {
      orderIncrement = Math.max(0, Math.round(cleanNumber(row[orderCountColIdx])));
    } else {
      orderIncrement = 1;
    }

    const resIdStr = resIdIdx !== -1 ? String(row[resIdIdx] || '').trim().replace(/\.0$/, '') : '';
    const resNameStr = resNameIdx !== -1 ? String(row[resNameIdx] || '').trim() : '';

    const addToBucket = (b: OrderBucket) => {
      if (isCancelledRow) {
        b.cancelledOrders += orderIncrement;
      } else {
        b.deliveredOrders += orderIncrement;
      }
      b.gross += gross;
      b.packaging += pack;
      b.discount += disc;
      b.commission += comm;
      b.pgFee += pg;
      b.cancellation += cancel;
      b.ads += ads;
      b.swiggyAssure += assure;
      b.hyperpure += hyper;
      b.gst += gst;
      b.tcs += tcs;
      b.tds += tds;
      b.netPayout += net;
      if (resNameStr && !b.brandHint) {
        b.brandHint = resNameStr;
        b.outletHint = resNameStr.toLowerCase();
      }
      for (const col of extraChargeCols) {
        const v = cleanNumber(row[col.idx]);
        if (v !== 0) {
          b.otherCharges[col.label] = (b.otherCharges[col.label] || 0) + Math.abs(v);
        }
      }
    };

    addToBucket(totals);

    if (resIdStr) {
      if (!byResId.has(resIdStr)) {
        byResId.set(resIdStr, emptyOrderBucket());
      }
      addToBucket(byResId.get(resIdStr)!);
    }
  }

  return { totals, byResId };
}

/**
 * Matches total revenue from Petpooja POS sales records against Swiggy, Zomato, Ownly, and Direct orders.
 * Handles both dated POS rows and undated POS summary reports (Sub-Order Wise / Item-Wise) cleanly,
 * and aggregates multiple brand statements (Banglar Jhale Jhole + Niraamish) & weekly statements per channel.
 */
export function matchPosWithPayouts(
  rawRecords: RawSalesRecord[],
  payouts: PlatformPayoutRecord[],
  outletFilter: OutletId = 'consolidated',
  selectedMonth?: string
): ChannelPosMatchReport {
  const validPosRecords = (rawRecords || []).filter((r) => {
    if (r.isReturnOrCancelled) return false;
    // Match month if row carries a date; keep undated POS period-summary rows so Item-Wise / Sub-Order Wise uploads always populate!
    if (selectedMonth && r.date && r.date.length >= 7) {
      if (!r.date.startsWith(selectedMonth)) return false;
    }
    if (outletFilter === 'consolidated') return true;
    const outStr = (r.outlet || '').toLowerCase().trim();
    const isWhitefield =
      outStr === 'whitefield' ||
      outStr.includes('whitefield') ||
      outStr === 'wf' ||
      outStr.endsWith('-w');
    return outletFilter === 'whitefield' ? isWhitefield : !isWhitefield;
  });

  const classifyPosChannel = (r: RawSalesRecord): 'swiggy' | 'zomato' | 'ownly' | 'direct' => {
    const combined = `${r.salesChannel || ''} ${r.rawItemName || ''} ${r.orderType || ''}`.toLowerCase();
    // Combine Toing and Swiggy together and report as Swiggy
    if (combined.includes('swiggy') || combined.includes('toing')) return 'swiggy';
    if (combined.includes('zomato')) return 'zomato';
    if (combined.includes('ownly')) return 'ownly';
    return 'direct';
  };

  const getPosChannelTotals = (targetChannel: 'swiggy' | 'zomato' | 'ownly' | 'direct') => {
    const recs = validPosRecords.filter((r) => classifyPosChannel(r) === targetChannel);
    let gross = 0;
    let net = 0;
    let orders = 0;
    for (const r of recs) {
      const rev = Number(r.revenue) || 0;
      const disc = Number(r.discount) || 0;
      if (r.isNetSales) {
        net += rev;
        gross += rev + disc;
      } else {
        gross += rev;
        net += Math.max(0, rev - disc);
      }
      orders += Number(r.quantity) || 0;
    }
    return {
      gross: round2(gross),
      net: round2(net),
      orders: Math.round(orders),
    };
  };

  const swiggyPos = getPosChannelTotals('swiggy');
  const zomatoPos = getPosChannelTotals('zomato');
  const ownlyPos = getPosChannelTotals('ownly');
  const directPos = getPosChannelTotals('direct');

  const getPayoutChannelTotals = (platformName: 'swiggy' | 'zomato' | 'ownly') => {
    const records = (payouts || []).filter((p) => {
      const platNorm = (p.platform || '').toLowerCase().trim();
      const effectivePlat = platNorm === 'toing' ? 'swiggy' : platNorm;
      if (effectivePlat !== platformName) return false;
      if (outletFilter !== 'consolidated' && p.outletId !== outletFilter) return false;
      if (selectedMonth && p.month && p.month !== selectedMonth) return false;
      return true;
    });

    const gross = round2(records.reduce((sum, p) => sum + (Number(p.grossSales) || 0), 0));
    const net = round2(records.reduce((sum, p) => sum + (Number(p.netSales) || 0), 0));
    const credited = round2(
      records.reduce((sum, p) => sum + (Number(p.actualBankSettlement ?? p.calculatedNetPayout) || 0), 0)
    );
    const totalDeductions = round2(Math.max(0, gross - credited));
    const orders = Math.round(records.reduce((sum, p) => sum + (Number(p.orderCount) || 0), 0));

    const statementBreakdown = records.map((p) => ({
      id: p.id,
      restaurantId: p.accountId,
      brandName: p.accountName || p.platform.toUpperCase(),
      outletId: p.outletId,
      periodLabel: p.weekLabel || p.month,
      orders: Math.round(Number(p.orderCount) || 0),
      grossSales: round2(Number(p.grossSales) || 0),
      netCredited: round2(Number(p.actualBankSettlement ?? p.calculatedNetPayout) || 0),
    }));

    return {
      gross,
      net,
      credited,
      totalDeductions,
      orders,
      statementCount: records.length,
      statementBreakdown,
    };
  };

  const swiggyPayout = getPayoutChannelTotals('swiggy');
  const zomatoPayout = getPayoutChannelTotals('zomato');
  const ownlyPayout = getPayoutChannelTotals('ownly');

  const createChannelReport = (
    channel: string,
    channelLabel: string,
    pos: { gross: number; net: number; orders: number },
    pay: {
      gross: number;
      net: number;
      credited: number;
      totalDeductions: number;
      orders: number;
      statementCount: number;
      statementBreakdown: Array<{
        id: string;
        restaurantId?: string;
        brandName: string;
        outletId: 'banaswadi' | 'whitefield';
        periodLabel?: string;
        orders: number;
        grossSales: number;
        netCredited: number;
      }>;
    }
  ) => {
    const varianceGross = round2(pos.gross - pay.gross);
    const baseForPct = Math.max(pos.gross, pay.gross);
    const varianceGrossPct = baseForPct > 0 ? Math.abs((varianceGross / baseForPct) * 100) : 0;
    const matchStatus: 'matched' | 'minor_variance' | 'unmatched' =
      Math.abs(varianceGross) <= 500 || varianceGrossPct <= 3
        ? 'matched'
        : varianceGrossPct <= 10
        ? 'minor_variance'
        : 'unmatched';

    return {
      channel,
      channelLabel,
      posGrossSales: pos.gross,
      posNetSales: pos.net,
      posOrders: pos.orders,
      payoutGrossSales: pay.gross,
      payoutNetSales: pay.net,
      payoutTotalDeductions: pay.totalDeductions,
      payoutNetCredited: pay.credited,
      payoutOrders: pay.orders,
      statementCount: pay.statementCount,
      statementBreakdown: pay.statementBreakdown,
      varianceGross,
      varianceGrossPct,
      matchStatus,
    };
  };

  const channelReports = [
    createChannelReport('swiggy', 'Swiggy (incl. Toing)', swiggyPos, swiggyPayout),
    createChannelReport('zomato', 'Zomato Aggregator', zomatoPos, zomatoPayout),
    createChannelReport('ownly', 'Ownly Direct Orders', ownlyPos, ownlyPayout),
    createChannelReport('direct', 'Direct Dine-In & Takeaway', directPos, {
      gross: directPos.gross,
      net: directPos.net,
      credited: directPos.net,
      totalDeductions: 0,
      orders: directPos.orders,
      statementCount: directPos.gross > 0 ? 1 : 0,
      statementBreakdown: [],
    }),
  ];

  const totalPosGross = round2(channelReports.reduce((sum, c) => sum + c.posGrossSales, 0));
  const totalPosNet = round2(channelReports.reduce((sum, c) => sum + c.posNetSales, 0));
  const aggregatorPosGross = round2(
    channelReports.filter((c) => c.channel !== 'direct').reduce((sum, c) => sum + c.posGrossSales, 0)
  );
  // Aggregator payout gross (Swiggy + Zomato + Ownly)
  const aggregatorPayoutGross = round2(
    channelReports.filter((c) => c.channel !== 'direct').reduce((sum, c) => sum + c.payoutGrossSales, 0)
  );
  const aggregatorPayoutCredited = round2(
    channelReports.filter((c) => c.channel !== 'direct').reduce((sum, c) => sum + c.payoutNetCredited, 0)
  );

  const overallVariance = round2(aggregatorPosGross - aggregatorPayoutGross);
  const baseAgg = Math.max(aggregatorPosGross, aggregatorPayoutGross);
  const overallVariancePct = baseAgg > 0 ? Math.abs((overallVariance / baseAgg) * 100) : 0;

  const overallStatus: 'matched' | 'minor_variance' | 'unmatched' =
    baseAgg === 0
      ? 'unmatched'
      : Math.abs(overallVariance) <= 500 || overallVariancePct <= 3
      ? 'matched'
      : overallVariancePct <= 10
      ? 'minor_variance'
      : 'unmatched';

  return {
    channelReports,
    totalPosGross,
    totalPosNet,
    aggregatorPosGross,
    totalPayoutGross: aggregatorPayoutGross,
    totalPayoutNetCredited: aggregatorPayoutCredited,
    overallVariance,
    overallStatus,
  };
}

/**
 * Calculates total Hyperpure cost against Hyperpure bills entered in Purchase & COGS.
 */
export function reconcileHyperpurePurchases(
  purchases: PurchaseRecord[],
  payouts: PlatformPayoutRecord[],
  outletFilter: OutletId = 'consolidated',
  monthFilter: string = '2026-10'
): HyperpureReconciliationReport {
  const hyperpurePurchases = purchases.filter((pur) => {
    const isSupplierHyperpure =
      (pur.supplierName || '').toLowerCase().includes('hyperpure') ||
      (pur.category || '').toLowerCase().includes('hyperpure');
    if (!isSupplierHyperpure) return false;
    if (outletFilter !== 'consolidated' && pur.outletId !== outletFilter) return false;
    const anyPur = pur as any;
    const purMonth = String(pur.month || anyPur.accountingMonth || pur.purchaseDate || '').slice(0, 7);
    if (monthFilter && purMonth && purMonth !== monthFilter) return false;
    return true;
  });

  const totalInvoicedAmount = hyperpurePurchases.reduce(
    (sum, p) => sum + (Number(p.totalAmount ?? (p as any).totalAmountINR) || 0),
    0
  );
  const totalInvoicesCount = hyperpurePurchases.length;

  const relevantPayouts = payouts.filter((p) => {
    if (p.platform.toLowerCase() !== 'zomato') return false;
    if (outletFilter !== 'consolidated' && p.outletId !== outletFilter) return false;
    if (monthFilter && p.month && p.month !== monthFilter) return false;
    return true;
  });

  const totalDeductedAtPayout = relevantPayouts.reduce((sum, p) => sum + (p.hyperpureRecovery || 0), 0);
  const variance = totalInvoicedAmount - totalDeductedAtPayout;

  let status: 'matched' | 'over_deducted' | 'pending_deduction' = 'matched';
  if (Math.abs(variance) <= 100) {
    status = 'matched';
  } else if (variance < -100) {
    status = 'over_deducted';
  } else {
    status = 'pending_deduction';
  }

  return {
    totalInvoicedAmount,
    totalInvoicesCount,
    totalDeductedAtPayout,
    variance,
    status,
    matchedBills: hyperpurePurchases.map((p) => ({
      invoiceNumber: p.invoiceNumber || p.id,
      date: p.purchaseDate || '',
      outletId: p.outletId,
      amount: Number(p.totalAmount ?? (p as any).totalAmountINR) || 0,
      description: p.itemDescription || `${p.supplierName} Ingredient Order`,
    })),
    payoutDeductions: relevantPayouts.map((p) => ({
      payoutId: p.id,
      platform: `${p.accountName || 'Zomato'} (${p.accountId || p.outletId})`,
      outletId: p.outletId,
      monthOrWeek: p.weekLabel || p.month,
      amount: p.hyperpureRecovery || 0,
    })),
  };
}

/**
 * Calculates Month-over-Month (MoM) and Year-over-Year (YoY) growth analytics.
 */
export function calculateGrowthMetrics(
  currentMonth: string = '2026-10',
  payouts: PlatformPayoutRecord[],
  parentDishes: ParentDish[],
  outletFilter: OutletId = 'consolidated',
  salesRecords: RawSalesRecord[] = []
): GrowthAnalysisMetrics {
  const shiftMonth = (month: string, deltaMonths: number): string => {
    if (!month || !month.includes('-')) return '';
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const previousMonth = shiftMonth(currentMonth, -1);
  const previousYearMonth = shiftMonth(currentMonth, -12);

  const totalsFor = (month: string) => {
    const rows = payouts.filter(
      (p) => p.month === month && (outletFilter === 'consolidated' || p.outletId === outletFilter)
    );
    const gross = rows.reduce((sum, p) => sum + p.grossSales, 0);
    const net = rows.reduce((sum, p) => sum + (p.actualBankSettlement || p.calculatedNetPayout), 0);
    const orders = rows.reduce((sum, p) => sum + p.orderCount, 0);
    const direct = rows.reduce((sum, p) => sum + (p.directSalesCashUpi || 0), 0);
    return { gross, net, orders, direct, aov: orders > 0 ? gross / orders : 0 };
  };

  const cur = totalsFor(currentMonth);
  const prev = totalsFor(previousMonth);
  const prevYear = totalsFor(previousYearMonth);

  const getGrowth = (curr: number, base: number) => (curr > 0 && base > 0 ? ((curr - base) / base) * 100 : 0);

  const posFor = (month: string) => {
    const rows = (salesRecords || []).filter(
      (r) =>
        !r.isReturnOrCancelled &&
        String(r.date || '').slice(0, 7) === month &&
        (outletFilter === 'consolidated' || String(r.outlet || '').toLowerCase() === outletFilter)
    );
    const gross = rows.reduce((sum, r) => sum + (Number(r.revenue) || 0) + (r.isNetSales ? Number(r.discount) || 0 : 0), 0);
    const orders = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    return { has: rows.length > 0, gross, orders, aov: orders > 0 ? gross / orders : 0 };
  };
  const posCur = posFor(currentMonth);
  const posPrev = posFor(previousMonth);
  const posPrevYear = posFor(previousYearMonth);

  const payoutGrowth = (base: { net: number }) => (cur.net > 0 && base.net > 0 ? getGrowth(cur.net, base.net) : 0);
  const salesGrowth = (
    field: 'gross' | 'orders' | 'aov',
    posBase: { has: boolean; gross: number; orders: number; aov: number },
    base: { gross: number; orders: number; aov: number }
  ) => {
    if (posCur.has && posBase.has) return getGrowth(posCur[field], posBase[field]);
    return cur[field] > 0 && base[field] > 0 ? getGrowth(cur[field], base[field]) : 0;
  };

  return {
    currentMonth,
    previousMonth,
    previousYearMonth,
    momRevenueGrowthPct: salesGrowth('gross', posPrev, prev),
    momNetPayoutGrowthPct: payoutGrowth(prev),
    momOrdersGrowthPct: salesGrowth('orders', posPrev, prev),
    momAovGrowthPct: salesGrowth('aov', posPrev, prev),
    yoyRevenueGrowthPct: salesGrowth('gross', posPrevYear, prevYear),
    yoyNetPayoutGrowthPct: payoutGrowth(prevYear),
    yoyOrdersGrowthPct: salesGrowth('orders', posPrevYear, prevYear),
    yoyAovGrowthPct: salesGrowth('aov', posPrevYear, prevYear),
    currentGrossRevenue: cur.gross,
    currentNetPayoutTotal: cur.net,
    currentDirectSales: cur.direct,
    currentTotalOrders: cur.orders,
    currentAov: Math.round(cur.aov),
    directRealizationRatioPct: cur.gross > 0 ? ((cur.net + cur.direct) / cur.gross) * 100 : 0,
  };
}

export interface BreakEvenContext {
  month?: string;
  posNetSales?: number;
  posOrders?: number;
  posAggregatorNetSales?: number;
  foodCostTotal?: number;
}

export function calculateChannelAwareBreakEven(
  staffDirectory: StaffMember[],
  operatingExpenses: OutletOperatingExpenseItem[],
  payouts: PlatformPayoutRecord[],
  outletFilter: OutletId = 'consolidated',
  ctx: BreakEvenContext = {}
): ChannelAwareBreakEvenMetrics {
  const filteredStaff = staffDirectory.filter((s) => {
    if (s.status !== 'active') return false;
    if (outletFilter === 'consolidated') return true;
    return s.outletId === outletFilter;
  });

  const totalPayroll = filteredStaff.reduce((sum, s) => {
    const base = s.baseSalary || 0;
    const food = s.isFoodAllowanceEligible ? (s.foodAllowanceRatePerDay || 0) * (s.maxAllowanceDays || 0) : 0;
    const ins = s.insurancePremiumMonthly || 0;
    const other = s.otherEmployerCosts || 0;
    return sum + base + food + ins + other;
  }, 0);

  const totalOverheads = operatingExpenses.reduce((sum, item) => {
    if (outletFilter === 'consolidated') {
      return sum + (item.combinedTotalAmount || (item.banaswadiAmount || 0) + (item.whitefieldAmount || 0) || 0);
    }
    return sum + ((outletFilter === 'banaswadi' ? item.banaswadiAmount : item.whitefieldAmount) || 0);
  }, 0);

  const totalFixedObligations = totalPayroll + totalOverheads;

  const statements = payouts.filter(
    (p) =>
      (outletFilter === 'consolidated' || p.outletId === outletFilter) && (!ctx.month || p.month === ctx.month)
  );
  const aggGross = statements.reduce((sum, p) => sum + (p.grossSales || 0), 0);
  const aggregatorCommissionDrain = statements.reduce(
    (sum, p) =>
      sum +
      (p.commissionAmount || 0) +
      (p.paymentGatewayFee || 0) +
      (p.gstOnCommission || 0) +
      (p.advertisingSpend || 0) +
      (p.cancellationCharges || 0) +
      (p.swiggyAssureFee || 0) +
      (p.otherPlatformFees || 0) +
      (p.tcsDeduction || 0) +
      (p.tdsDeduction || 0),
    0
  );
  const takeRate = aggGross > 0 ? aggregatorCommissionDrain / aggGross : 0;
  const statementOrders = statements.reduce((sum, p) => sum + (p.orderCount || 0), 0);

  const currentRevenue = ctx.posNetSales && ctx.posNetSales > 0 ? ctx.posNetSales : aggGross;
  const currentOrders = ctx.posOrders && ctx.posOrders > 0 ? ctx.posOrders : statementOrders;
  const avgOrderValue = currentOrders > 0 ? currentRevenue / currentOrders : 0;
  const aggregatorShare =
    currentRevenue > 0
      ? Math.min(1, (ctx.posAggregatorNetSales !== undefined ? ctx.posAggregatorNetSales : aggGross) / currentRevenue)
      : 0;

  const foodCostPct =
    ctx.foodCostTotal !== undefined && ctx.foodCostTotal > 0 && currentRevenue > 0 ? ctx.foodCostTotal / currentRevenue : null;

  const cmRatio = (share: number) => (foodCostPct === null ? 0 : 1 - foodCostPct - share * takeRate);
  const weightedContributionMarginRatio = cmRatio(aggregatorShare);
  const canCompute = foodCostPct !== null && weightedContributionMarginRatio > 0 && totalFixedObligations > 0;

  const breakEvenGrossRevenue = canCompute ? Math.round(totalFixedObligations / weightedContributionMarginRatio) : 0;
  const breakEvenOrders = canCompute && avgOrderValue > 0 ? Math.round(breakEvenGrossRevenue / avgOrderValue) : 0;
  const marginOfSafetyRevenue = canCompute ? currentRevenue - breakEvenGrossRevenue : 0;
  const marginOfSafetyPct = canCompute && currentRevenue > 0 ? (marginOfSafetyRevenue / currentRevenue) * 100 : 0;

  const shiftPct = 15;
  const shiftedShare = Math.min(aggregatorShare, shiftPct / 100);
  const monthlySavingsINR = Math.round(currentRevenue * shiftedShare * takeRate);
  const newCm = cmRatio(aggregatorShare - shiftedShare);
  const newBreakEvenRevenue = canCompute && newCm > 0 ? totalFixedObligations / newCm : 0;
  const reducedBreakEvenOrders =
    canCompute && avgOrderValue > 0 ? Math.max(0, breakEvenOrders - Math.round(newBreakEvenRevenue / avgOrderValue)) : 0;

  const ebitda = (cm: number) =>
    foodCostPct !== null && currentRevenue > 0 ? ((currentRevenue * cm - totalFixedObligations) / currentRevenue) * 100 : null;

  return {
    totalFixedObligations,
    weightedContributionMarginRatio,
    breakEvenGrossRevenue,
    breakEvenOrders,
    marginOfSafetyRevenue,
    marginOfSafetyPct,
    aggregatorCommissionDrain: Math.round(aggregatorCommissionDrain),
    channelShiftSimulation: {
      shiftPct,
      monthlySavingsINR,
      reducedBreakEvenOrders,
      newEbitdaMarginPct: ebitda(newCm) ?? 0,
    },
    currentRevenue,
    avgOrderValue,
    aggregatorTakeRatePct: takeRate * 100,
    aggregatorSharePct: aggregatorShare * 100,
    foodCostPct: foodCostPct === null ? null : foodCostPct * 100,
    currentEbitdaMarginPct: ebitda(weightedContributionMarginRatio),
  };
}
