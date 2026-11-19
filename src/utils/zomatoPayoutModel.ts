/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import {
  AggregatorBrandOutletMapping,
  PayoutOtherChargeItem,
  PlatformPayoutRecord,
  ZomatoBreakupRowItem,
  ZomatoExtraLineItem,
  ZomatoNormalizedMappingTrace,
  ZomatoPayoutBreakupModel,
  ZomatoTriplet,
} from '../types/finance';
import {
  detectAggregatorMappingFromText,
  extractCandidateRestaurantIdFromFilename,
} from './aggregatorMappingManager';

function round2(n: number): number {
  const num = Number(n) || 0;
  const r = Math.round((num + Number.EPSILON) * 100) / 100;
  return Object.is(r, -0) || Math.abs(r) < 1e-9 ? 0 : r;
}

export function zeroTriplet(): ZomatoTriplet {
  return { delivered: 0, cancelled: 0, total: 0 };
}

export function makeTriplet(
  delivered = 0,
  cancelled = 0,
  total?: number
): ZomatoTriplet {
  const d = round2(delivered);
  const c = round2(cancelled);
  const t = total !== undefined ? round2(total) : round2(d + c);
  return { delivered: d, cancelled: c, total: t };
}

export function absTriplet(t?: Partial<ZomatoTriplet>): ZomatoTriplet {
  if (!t) return zeroTriplet();
  const d = round2(Math.abs(Number(t.delivered) || 0));
  const c = round2(Math.abs(Number(t.cancelled) || 0));
  const rawTotal = t.total !== undefined ? Math.abs(Number(t.total) || 0) : d + c;
  const tot = rawTotal === 0 && (d > 0 || c > 0) ? round2(d + c) : round2(rawTotal);
  return { delivered: d, cancelled: c, total: tot };
}

export function signedTriplet(t?: Partial<ZomatoTriplet>): ZomatoTriplet {
  if (!t) return zeroTriplet();
  const d = round2(Number(t.delivered) || 0);
  const c = round2(Number(t.cancelled) || 0);
  const hasExplicitTotal = t.total !== undefined && t.total !== null;
  const rawTot = hasExplicitTotal ? round2(Number(t.total) || 0) : round2(d + c);
  const tot = rawTot === 0 && (d !== 0 || c !== 0) ? round2(d + c) : rawTot;
  return { delivered: d, cancelled: c, total: tot };
}

export function addTriplets(a: ZomatoTriplet, b: ZomatoTriplet): ZomatoTriplet {
  return {
    delivered: round2((Number(a.delivered) || 0) + (Number(b.delivered) || 0)),
    cancelled: round2((Number(a.cancelled) || 0) + (Number(b.cancelled) || 0)),
    total: round2((Number(a.total) || 0) + (Number(b.total) || 0)),
  };
}

export function isZeroTriplet(t?: Partial<ZomatoTriplet>): boolean {
  if (!t) return true;
  return (
    Math.abs(Number(t.delivered) || 0) < 0.005 &&
    Math.abs(Number(t.cancelled) || 0) < 0.005 &&
    Math.abs(Number(t.total) || 0) < 0.005
  );
}

export function combineTriplets(
  terms: Array<{ sign: 1 | -1; t: ZomatoTriplet }>
): ZomatoTriplet {
  let d = 0;
  let c = 0;
  let tot = 0;
  for (const { sign, t } of terms) {
    d += sign * (Number(t.delivered) || 0);
    c += sign * (Number(t.cancelled) || 0);
    tot += sign * (Number(t.total) || 0);
  }
  return {
    delivered: round2(d),
    cancelled: round2(c),
    total: round2(tot),
  };
}

/**
 * Aligns computed section triplets with Excel's reported section cell when the difference is purely
 * sub-cent floating-point rounding in Excel (e.g. 1854.20 + 2.24 + 34.43 + 1698.95 = 3589.82 vs Excel 3589.81).
 */
function alignTripletSubCent(
  computed: ZomatoTriplet,
  reported?: ZomatoTriplet,
  enabled = true
): ZomatoTriplet {
  if (!enabled || !reported) return computed;
  const alignCol = (compVal: number, repVal: number) =>
    Math.abs(compVal - repVal) > 0 && Math.abs(compVal - repVal) <= 0.05
      ? round2(repVal)
      : round2(compVal);
  return {
    delivered: alignCol(computed.delivered, reported.delivered),
    cancelled: alignCol(computed.cancelled, reported.cancelled),
    total: alignCol(computed.total, reported.total),
  };
}

/**
 * Updates a single column ('delivered' | 'cancelled' | 'total') of a ZomatoTriplet
 * while keeping Delivered + Cancelled = Total consistent.
 */
export function updateTripletColumn(
  prev: ZomatoTriplet | undefined,
  col: 'delivered' | 'cancelled' | 'total',
  rawVal: number,
  isInteger = false
): ZomatoTriplet {
  const base = prev || zeroTriplet();
  const clean = isInteger ? Math.round(Number(rawVal) || 0) : round2(Number(rawVal) || 0);

  if (col === 'delivered') {
    const tot = isInteger ? clean + Math.round(base.cancelled) : round2(clean + base.cancelled);
    return { delivered: clean, cancelled: base.cancelled, total: tot };
  }
  if (col === 'cancelled') {
    const tot = isInteger ? Math.round(base.delivered) + clean : round2(base.delivered + clean);
    return { delivered: base.delivered, cancelled: clean, total: tot };
  }
  // col === 'total'
  if ((Number(base.cancelled) || 0) === 0) {
    return { delivered: clean, cancelled: 0, total: clean };
  }
  const adjustedDel = isInteger
    ? clean - Math.round(base.cancelled)
    : round2(clean - base.cancelled);
  return { delivered: adjustedDel, cancelled: base.cancelled, total: clean };
}

function isDashZeroCell(val: any): boolean {
  if (val === null || val === undefined) return false;
  const s = String(val).trim();
  return s === '-' || s === '—' || s === '–' || s === '--';
}

export function parseZomatoCurrencyCell(val: any): { hasNumber: boolean; value: number } {
  if (val === null || val === undefined || val === '') {
    return { hasNumber: false, value: 0 };
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? { hasNumber: true, value: val } : { hasNumber: false, value: 0 };
  }
  const raw = String(val).trim();
  if (!raw || isDashZeroCell(raw) || raw === 'NA' || raw === 'N/A' || raw.startsWith('#')) {
    return { hasNumber: false, value: 0 };
  }
  if (raw.endsWith('%')) return { hasNumber: false, value: 0 };
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(raw)) {
    return { hasNumber: false, value: 0 };
  }
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-,]*202\d\b/i.test(raw)) {
    return { hasNumber: false, value: 0 };
  }

  const isParenNeg = /^\(.*\)$/.test(raw);
  const isMinusPrefix = /^[-−–]\s*[₹$inr\s]*\d/i.test(raw) || /^[₹$inr\s]*[-−–]\s*\d/i.test(raw);
  const stripped = raw
    .replace(/inr|rs\.?/gi, '')
    .replace(/[₹$,\s()−–]/g, (m) => (m === '−' || m === '–' ? '-' : ''));

  if (!/^[+-]?\d+(\.\d+)?$/.test(stripped)) {
    return { hasNumber: false, value: 0 };
  }
  const parsed = parseFloat(stripped);
  if (!Number.isFinite(parsed)) return { hasNumber: false, value: 0 };
  const signed = isParenNeg || isMinusPrefix ? -Math.abs(parsed) : parsed;
  return { hasNumber: true, value: signed };
}

/**
 * Creates a clean canonical Zomato Payout Breakup v2 model (Sections A-J, Rows 1-32 + Settlement breakdown).
 */
export function createEmptyZomatoBreakupModel(
  overrides?: Partial<ZomatoPayoutBreakupModel>
): ZomatoPayoutBreakupModel {
  return recalculateZomatoBreakupModel({
    templateVersion: 'zomato_payout_breakup_v2',
    sheetNameUsed: 'Payout Breakup',
    detectedSourceTemplate: 'classic_breakup_a_j',
    detectedSourceTemplateLabel: 'Canonical Zomato Payout Breakup (A–J)',
    normalizedMappingsApplied: [],
    ordersCount: zeroTriplet(),

    sectionA_netOrderValue: zeroTriplet(),
    row1_subtotal: zeroTriplet(),
    row2_packagingCharge: zeroTriplet(),
    row3_selfLogisticsDeliveryCharge: zeroTriplet(),
    row4_promoDiscount: zeroTriplet(),
    row5_bogoFreebiesGoldDiscount: zeroTriplet(),
    row6_brandPackSubscriptionFee: zeroTriplet(),
    row7_deliveryRelistingDiscount: zeroTriplet(),
    row8_customerGstCollected: zeroTriplet(),

    sectionB_totalCommissionableValue: zeroTriplet(),
    row9_commissionableSubtotal: zeroTriplet(),
    row10_commissionablePackaging: zeroTriplet(),
    row11_commissionableGst: zeroTriplet(),

    sectionC_serviceAndPaymentFees: zeroTriplet(),
    row12_baseServiceFee: zeroTriplet(),
    row13_longDistanceFee: zeroTriplet(),
    row14_longDistanceDiscount: zeroTriplet(),
    row15_serviceFeeCapDiscount: zeroTriplet(),
    row16_paymentMechanismFee: zeroTriplet(),

    sectionD_governmentCharges: zeroTriplet(),
    row17_taxesOnServiceFee: zeroTriplet(),
    row18_tcsAndIgst: zeroTriplet(),
    row19_tds194O: zeroTriplet(),
    row20_gstSection9_5: zeroTriplet(),

    sectionE_otherOrderLevelDeductions: zeroTriplet(),
    row21_otherOrderLevelDeductions: zeroTriplet(),
    row21a_customerCompensation: zeroTriplet(),
    row21b_rejectionPenalty: zeroTriplet(),
    row21c_deliveryChargesRecovery: zeroTriplet(),
    row21d_creditDebitNoteAdjustment: zeroTriplet(),
    row21e_promoRecoveryAdjustment: zeroTriplet(),
    row21f_extraInventoryAds: zeroTriplet(),
    row21g_brandLoyaltyPointsRedemption: zeroTriplet(),
    row21h_expressOrderFee: zeroTriplet(),
    row22_cashReceivedSelfDelivery: zeroTriplet(),
    row23_previousWeeksAdjustments: zeroTriplet(),

    sectionF_investmentInGrowthServices: zeroTriplet(),
    row24_totalAdsIncGst: zeroTriplet(),
    row25_totalDiningAdsIncGst: zeroTriplet(),
    row26_miscellaneousServices: zeroTriplet(),

    sectionG_investmentInHyperpure: zeroTriplet(),
    row27_totalHyperpure: zeroTriplet(),

    sectionH_otherDeductions: zeroTriplet(),
    row28_expressOrderDiscountReversal: zeroTriplet(),
    extraOtherDeductions: [],

    sectionI_totalAdditions: zeroTriplet(),
    row29_cancellationRefund: zeroTriplet(),
    row30_kitchenStaffTip: zeroTriplet(),
    row31_tds194HAndResIdAdditions: zeroTriplet(),
    row32_serviceFeesRebate: zeroTriplet(),
    extraAdditions: [],

    sectionJ_netPayout: zeroTriplet(),
    settlementAmountSettled: zeroTriplet(),
    settlementPendingAmount: zeroTriplet(),

    calculatedNetPayout: 0,
    reportedNetPayout: 0,
    rawSheetRows: [],
    ...overrides,
  });
}

/**
 * Ensures ANY Zomato PlatformPayoutRecord (newly parsed, v1 legacy, partial JSON, or existing DB record)
 * is hydrated into the exact canonical ZomatoPayoutBreakupModel v2 (Sections A-J, Rows 1-32).
 */
export function ensureZomatoBreakupModelOnRecord(
  record: PlatformPayoutRecord
): ZomatoPayoutBreakupModel {
  const existing: any = record.zomatoBreakup;
  if (existing && existing.templateVersion === 'zomato_payout_breakup_v2' && existing.row1_subtotal) {
    return recalculateZomatoBreakupModel(existing as ZomatoPayoutBreakupModel);
  }

  // Migrate v1 model if present
  if (existing && existing.templateVersion === 'zomato_payout_breakup_v1') {
    const delOrd = Number(existing.deliveredOrders ?? record.orderCount) || 0;
    const canOrd = Number(existing.cancelledOrders ?? record.cancelledOrders) || 0;
    const sub = Number(existing.itemSubtotal ?? record.grossSales) || 0;
    const pack = Number(existing.packagingCharge ?? record.packagingCharges) || 0;
    const promo = Number(existing.restaurantPromoDiscount ?? record.customerDiscounts) || 0;
    const bogo = Number(existing.restaurantFlatGoldDiscount) || 0;
    return createEmptyZomatoBreakupModel({
      sheetNameUsed: existing.sheetNameUsed || 'Payout Breakup',
      detectedSourceTemplate: 'legacy_hydrated',
      detectedSourceTemplateLabel: 'Migrated Legacy Zomato Model → Canonical A–J',
      resId: existing.resId || record.accountId,
      brandName: existing.brandName || record.accountName,
      outletLocation: existing.outletLocation || record.outletId,
      settlementPeriodLabel: existing.settlementPeriodLabel || record.weekLabel,
      payoutStartDate: existing.payoutStartDate || record.payoutStartDate,
      payoutEndDate: existing.payoutEndDate || record.payoutEndDate,
      utrNumber: existing.utrNumber,
      ordersCount: makeTriplet(delOrd, canOrd, delOrd + canOrd),
      row1_subtotal: makeTriplet(sub, 0, sub),
      row2_packagingCharge: makeTriplet(pack, 0, pack),
      row3_selfLogisticsDeliveryCharge: makeTriplet(Number(existing.deliveryChargeCollected) || 0, 0),
      row4_promoDiscount: makeTriplet(promo, 0, promo),
      row5_bogoFreebiesGoldDiscount: makeTriplet(bogo, 0, bogo),
      row7_deliveryRelistingDiscount: makeTriplet(Number(existing.deliveryChargeDiscount) || 0, 0),
      row8_customerGstCollected: makeTriplet(Number(existing.customerGstCollected) || 0, 0),
      row9_commissionableSubtotal: makeTriplet(Math.max(0, sub - promo - bogo), 0),
      row10_commissionablePackaging: makeTriplet(pack, 0, pack),
      row12_baseServiceFee: makeTriplet(Number(existing.zomatoServiceFee ?? record.commissionAmount) || 0, 0),
      row13_longDistanceFee: makeTriplet(Number(existing.logisticsCharge) || 0, 0),
      row16_paymentMechanismFee: makeTriplet(Number(existing.paymentMechanismFee ?? record.paymentGatewayFee) || 0, 0),
      row17_taxesOnServiceFee: makeTriplet(Number(existing.gstOnZomatoFees ?? record.gstOnCommission) || 0, 0),
      row18_tcsAndIgst: makeTriplet(Number(existing.tcsAmount ?? record.tcsDeduction) || 0, 0),
      row19_tds194O: makeTriplet(Number(existing.tds194OAmount ?? record.tdsDeduction) || 0, 0),
      row20_gstSection9_5: makeTriplet(Number(existing.gstSection9_5) || 0, 0),
      row21a_customerCompensation: makeTriplet(Number(existing.cancellationAndRefundCharges ?? record.cancellationCharges) || 0, 0),
      row23_previousWeeksAdjustments: makeTriplet(-(Number(existing.previousCycleCarryForward) || 0), 0),
      row24_totalAdsIncGst: makeTriplet(Number(existing.zomatoAdsSpend ?? record.advertisingSpend) || 0, 0),
      row27_totalHyperpure: makeTriplet(Number(existing.hyperpureDeduction ?? record.hyperpureRecovery) || 0, 0),
      extraOtherDeductions: (existing.otherDeductionsItems || []).map((it: PayoutOtherChargeItem) => ({
        id: it.id,
        label: it.label,
        values: makeTriplet(it.amount, 0, it.amount),
      })),
      row31_tds194HAndResIdAdditions: makeTriplet(Number(existing.otherAdditionsCredit) || 0, 0),
      hasExplicitReportedJ: true,
      reportedNetPayout: Number(existing.reportedNetPayout ?? record.actualBankSettlement) || 0,
      settlementAmountSettled: makeTriplet(Number(existing.reportedNetPayout ?? record.actualBankSettlement) || 0, 0),
      rawSheetRows: existing.rawSheetRows || [],
    });
  }

  // Hydrate from flat PlatformPayoutRecord
  const delOrd = Number(record.orderCount) || 0;
  const canOrd = Number(record.cancelledOrders) || 0;
  const sub = Number(record.grossSales) || 0;
  const pack = Number(record.packagingCharges) || 0;
  const disc = Number(record.customerDiscounts) || 0;
  const impliedCustomerGst = Math.max(
    0,
    round2((Number(record.netSales) || 0) - (sub + pack + (Number(record.deliveryChargesCollected) || 0) - disc))
  );

  return createEmptyZomatoBreakupModel({
    sheetNameUsed: 'Payout Breakup',
    detectedSourceTemplate: 'legacy_hydrated',
    detectedSourceTemplateLabel: 'Hydrated into Canonical Zomato A–J Model',
    resId: record.accountId,
    brandName: record.accountName,
    outletLocation: record.outletId,
    settlementPeriodLabel: record.weekLabel,
    payoutStartDate: record.payoutStartDate,
    payoutEndDate: record.payoutEndDate,
    ordersCount: makeTriplet(delOrd, canOrd, delOrd + canOrd),
    row1_subtotal: makeTriplet(sub, 0, sub),
    row2_packagingCharge: makeTriplet(pack, 0, pack),
    row3_selfLogisticsDeliveryCharge: makeTriplet(Number(record.deliveryChargesCollected) || 0, 0),
    row4_promoDiscount: makeTriplet(disc, 0, disc),
    row8_customerGstCollected: makeTriplet(impliedCustomerGst, 0, impliedCustomerGst),
    row9_commissionableSubtotal: makeTriplet(Math.max(0, sub - disc), 0),
    row10_commissionablePackaging: makeTriplet(pack, 0, pack),
    row12_baseServiceFee: makeTriplet(Number(record.commissionAmount) || 0, 0),
    row16_paymentMechanismFee: makeTriplet(Number(record.paymentGatewayFee) || 0, 0),
    row17_taxesOnServiceFee: makeTriplet(Number(record.gstOnCommission) || 0, 0),
    row18_tcsAndIgst: makeTriplet(Number(record.tcsDeduction) || 0, 0),
    row19_tds194O: makeTriplet(Number(record.tdsDeduction) || 0, 0),
    row21a_customerCompensation: makeTriplet(Number(record.cancellationCharges) || 0, 0),
    row24_totalAdsIncGst: makeTriplet(Number(record.advertisingSpend) || 0, 0),
    row27_totalHyperpure: makeTriplet(Number(record.hyperpureRecovery) || 0, 0),
    extraOtherDeductions: (record.otherChargesBreakdown || [])
      .filter((it) => (Number(it.amount) || 0) > 0)
      .map((it) => ({
        id: it.id,
        label: it.label,
        values: makeTriplet(it.amount, 0, it.amount),
      })),
    extraAdditions: (record.otherChargesBreakdown || [])
      .filter((it) => (Number(it.amount) || 0) < 0)
      .map((it) => ({
        id: it.id,
        label: it.label,
        values: makeTriplet(Math.abs(it.amount), 0, Math.abs(it.amount)),
      })),
    hasExplicitReportedJ: true,
    reportedNetPayout: Number(record.actualBankSettlement ?? record.calculatedNetPayout) || 0,
    settlementAmountSettled: makeTriplet(Number(record.actualBankSettlement ?? record.calculatedNetPayout) || 0, 0),
  });
}

/**
 * Evaluates Zomato's exact canonical Payout Breakup accounting formulas across Sections A -> J:
 *   A = 1 + 2 + 3 - 4 - 5 + 6 - 7 + 8
 *   B = 9 + 10 + 11 (Reference commissionable value)
 *   C = 12 + 13 - 14 - 15 + 16
 *   D = 17 + 18 + 19 + 20
 *   E = 21 + 22 + 23  (where 21 = sum of 21a..21h)
 *   F = 24 + 25 + 26
 *   G = 27
 *   H = 28 + extraOtherDeductions
 *   I = 29 + 30 + 31 + 32 + extraAdditions
 *   J = A - C - D - E - F - G - H + I
 */
export function recalculateZomatoBreakupModel(
  model: ZomatoPayoutBreakupModel,
  syncReportedToCalculated = false,
  options?: { alignSubCentWithReported?: boolean }
): ZomatoPayoutBreakupModel {
  const alignSubCent = options?.alignSubCentWithReported ?? true;

  const ordDel = Math.max(0, Math.round(Number(model.ordersCount?.delivered) || 0));
  const ordCan = Math.max(0, Math.round(Number(model.ordersCount?.cancelled) || 0));
  const ordTot =
    ordDel === 0 && ordCan === 0 && (Number(model.ordersCount?.total) || 0) > 0
      ? Math.max(0, Math.round(Number(model.ordersCount?.total) || 0))
      : ordDel + ordCan;
  const ordersCount: ZomatoTriplet = {
    delivered: ordDel === 0 && ordCan === 0 && ordTot > 0 ? ordTot : ordDel,
    cancelled: ordCan,
    total: ordTot,
  };

  // Section A: Net order value ( 1 + 2 + 3 - 4 - 5 + 6 - 7 + 8 )
  const r1 = absTriplet(model.row1_subtotal);
  const r2 = absTriplet(model.row2_packagingCharge);
  const r3 = absTriplet(model.row3_selfLogisticsDeliveryCharge);
  const r4 = absTriplet(model.row4_promoDiscount);
  const r5 = absTriplet(model.row5_bogoFreebiesGoldDiscount);
  const r6 = absTriplet(model.row6_brandPackSubscriptionFee);
  const r7 = absTriplet(model.row7_deliveryRelistingDiscount);
  const r8 = absTriplet(model.row8_customerGstCollected);

  const sectionA_netOrderValue = alignTripletSubCent(
    combineTriplets([
      { sign: 1, t: r1 },
      { sign: 1, t: r2 },
      { sign: 1, t: r3 },
      { sign: -1, t: r4 },
      { sign: -1, t: r5 },
      { sign: 1, t: r6 },
      { sign: -1, t: r7 },
      { sign: 1, t: r8 },
    ]),
    model.reportedSectionA,
    alignSubCent
  );

  // Section B: Total commissionable value ( 9 + 10 + 11 )
  let r9 = absTriplet(model.row9_commissionableSubtotal);
  let r10 = absTriplet(model.row10_commissionablePackaging);
  const r11 = absTriplet(model.row11_commissionableGst);

  if (r9.total === 0 && r10.total === 0 && !model.reportedSectionB && r1.total > 0) {
    r9 = combineTriplets([
      { sign: 1, t: r1 },
      { sign: -1, t: r4 },
      { sign: -1, t: r5 },
    ]);
    r9 = {
      delivered: Math.max(0, r9.delivered),
      cancelled: Math.max(0, r9.cancelled),
      total: Math.max(0, r9.total),
    };
    r10 = { ...r2 };
  }
  const sectionB_totalCommissionableValue = alignTripletSubCent(
    combineTriplets([
      { sign: 1, t: r9 },
      { sign: 1, t: r10 },
      { sign: 1, t: r11 },
    ]),
    model.reportedSectionB,
    alignSubCent
  );

  // Section C: Service fees & payment mechanism fees ( 12 + 13 - 14 - 15 + 16 )
  const r12 = absTriplet(model.row12_baseServiceFee);
  const r13 = absTriplet(model.row13_longDistanceFee);
  const r14 = absTriplet(model.row14_longDistanceDiscount);
  const r15 = absTriplet(model.row15_serviceFeeCapDiscount);
  const r16 = absTriplet(model.row16_paymentMechanismFee);

  const sectionC_serviceAndPaymentFees = alignTripletSubCent(
    combineTriplets([
      { sign: 1, t: r12 },
      { sign: 1, t: r13 },
      { sign: -1, t: r14 },
      { sign: -1, t: r15 },
      { sign: 1, t: r16 },
    ]),
    model.reportedSectionC,
    alignSubCent
  );

  // Section D: Government charges ( 17 + 18 + 19 + 20 )
  const r17 = absTriplet(model.row17_taxesOnServiceFee);
  const r18 = absTriplet(model.row18_tcsAndIgst);
  const r19 = absTriplet(model.row19_tds194O);
  const r20 = absTriplet(model.row20_gstSection9_5);

  const sectionD_governmentCharges = alignTripletSubCent(
    combineTriplets([
      { sign: 1, t: r17 },
      { sign: 1, t: r18 },
      { sign: 1, t: r19 },
      { sign: 1, t: r20 },
    ]),
    model.reportedSectionD,
    alignSubCent
  );

  // Section E: Other order level deductions ( 21 + 22 + 23 )
  const r21a = absTriplet(model.row21a_customerCompensation);
  const r21b = absTriplet(model.row21b_rejectionPenalty);
  const r21c = absTriplet(model.row21c_deliveryChargesRecovery);
  const r21d = signedTriplet(model.row21d_creditDebitNoteAdjustment);
  const r21e = absTriplet(model.row21e_promoRecoveryAdjustment);
  const r21f = absTriplet(model.row21f_extraInventoryAds);
  const r21g = absTriplet(model.row21g_brandLoyaltyPointsRedemption);
  const r21h = absTriplet(model.row21h_expressOrderFee);

  const sub21Computed = combineTriplets([
    { sign: 1, t: r21a },
    { sign: 1, t: r21b },
    { sign: 1, t: r21c },
    { sign: 1, t: r21d },
    { sign: 1, t: r21e },
    { sign: 1, t: r21f },
    { sign: 1, t: r21g },
    { sign: 1, t: r21h },
  ]);

  const hasAnySub21 =
    sub21Computed.delivered !== 0 ||
    sub21Computed.cancelled !== 0 ||
    sub21Computed.total !== 0;

  const r21 = hasAnySub21
    ? alignTripletSubCent(sub21Computed, model.reportedRow21, alignSubCent)
    : absTriplet(model.reportedRow21 || model.row21_otherOrderLevelDeductions);

  const r22 = absTriplet(model.row22_cashReceivedSelfDelivery);
  const r23 = signedTriplet(model.row23_previousWeeksAdjustments);

  const sectionE_otherOrderLevelDeductions = alignTripletSubCent(
    combineTriplets([
      { sign: 1, t: r21 },
      { sign: 1, t: r22 },
      { sign: 1, t: r23 },
    ]),
    model.reportedSectionE,
    alignSubCent
  );

  // Section F: Investment in growth services ( 24 + 25 + 26 )
  const r24 = absTriplet(model.row24_totalAdsIncGst);
  const r25 = absTriplet(model.row25_totalDiningAdsIncGst);
  const r26 = absTriplet(model.row26_miscellaneousServices);

  const sectionF_investmentInGrowthServices = alignTripletSubCent(
    combineTriplets([
      { sign: 1, t: r24 },
      { sign: 1, t: r25 },
      { sign: 1, t: r26 },
    ]),
    model.reportedSectionF,
    alignSubCent
  );

  // Section G: Investment in Hyperpure ( 27 )
  const r27 = absTriplet(model.row27_totalHyperpure);
  const sectionG_investmentInHyperpure = alignTripletSubCent(
    { ...r27 },
    model.reportedSectionG,
    alignSubCent
  );

  // Section H: Other Deductions ( 28 + extra )
  const r28 = absTriplet(model.row28_expressOrderDiscountReversal);
  const extraOtherDeductions: ZomatoExtraLineItem[] = (model.extraOtherDeductions || []).map(
    (it) => ({
      ...it,
      values: absTriplet(it.values),
    })
  );
  const sectionH_otherDeductions = alignTripletSubCent(
    combineTriplets([
      { sign: 1, t: r28 },
      ...extraOtherDeductions.map((it) => ({ sign: 1 as const, t: it.values })),
    ]),
    model.reportedSectionH,
    alignSubCent
  );

  // Section I: Total Additions ( 29 + 30 + 31 + 32 + extra )
  const r29 = absTriplet(model.row29_cancellationRefund);
  const r30 = absTriplet(model.row30_kitchenStaffTip);
  const r31 = absTriplet(model.row31_tds194HAndResIdAdditions);
  const r32 = absTriplet(model.row32_serviceFeesRebate);
  const extraAdditions: ZomatoExtraLineItem[] = (model.extraAdditions || []).map((it) => ({
    ...it,
    values: absTriplet(it.values),
  }));
  const sectionI_totalAdditions = alignTripletSubCent(
    combineTriplets([
      { sign: 1, t: r29 },
      { sign: 1, t: r30 },
      { sign: 1, t: r31 },
      { sign: 1, t: r32 },
      ...extraAdditions.map((it) => ({ sign: 1 as const, t: it.values })),
    ]),
    model.reportedSectionI,
    alignSubCent
  );

  // Section J: Net Payout ( A - C - D - E - F - G - H + I )
  const rawSectionJ = combineTriplets([
    { sign: 1, t: sectionA_netOrderValue },
    { sign: -1, t: sectionC_serviceAndPaymentFees },
    { sign: -1, t: sectionD_governmentCharges },
    { sign: -1, t: sectionE_otherOrderLevelDeductions },
    { sign: -1, t: sectionF_investmentInGrowthServices },
    { sign: -1, t: sectionG_investmentInHyperpure },
    { sign: -1, t: sectionH_otherDeductions },
    { sign: 1, t: sectionI_totalAdditions },
  ]);
  const sectionJ_netPayout = alignTripletSubCent(
    rawSectionJ,
    model.reportedSectionJ,
    alignSubCent
  );

  const settlementAmountSettled = signedTriplet(model.settlementAmountSettled);
  const settlementPendingAmount = signedTriplet(model.settlementPendingAmount);

  const calculatedNetPayout = round2(sectionJ_netPayout.total);
  const reportedNetPayout = syncReportedToCalculated
    ? calculatedNetPayout
    : model.hasExplicitReportedJ || model.reportedNetPayout !== undefined
    ? round2(Number(model.reportedNetPayout ?? model.reportedSectionJ?.total ?? calculatedNetPayout))
    : calculatedNetPayout;

  return {
    ...model,
    templateVersion: 'zomato_payout_breakup_v2',
    ordersCount,

    sectionA_netOrderValue,
    row1_subtotal: r1,
    row2_packagingCharge: r2,
    row3_selfLogisticsDeliveryCharge: r3,
    row4_promoDiscount: r4,
    row5_bogoFreebiesGoldDiscount: r5,
    row6_brandPackSubscriptionFee: r6,
    row7_deliveryRelistingDiscount: r7,
    row8_customerGstCollected: r8,

    sectionB_totalCommissionableValue,
    row9_commissionableSubtotal: r9,
    row10_commissionablePackaging: r10,
    row11_commissionableGst: r11,

    sectionC_serviceAndPaymentFees,
    row12_baseServiceFee: r12,
    row13_longDistanceFee: r13,
    row14_longDistanceDiscount: r14,
    row15_serviceFeeCapDiscount: r15,
    row16_paymentMechanismFee: r16,

    sectionD_governmentCharges,
    row17_taxesOnServiceFee: r17,
    row18_tcsAndIgst: r18,
    row19_tds194O: r19,
    row20_gstSection9_5: r20,

    sectionE_otherOrderLevelDeductions,
    row21_otherOrderLevelDeductions: r21,
    row21a_customerCompensation: r21a,
    row21b_rejectionPenalty: r21b,
    row21c_deliveryChargesRecovery: r21c,
    row21d_creditDebitNoteAdjustment: r21d,
    row21e_promoRecoveryAdjustment: r21e,
    row21f_extraInventoryAds: r21f,
    row21g_brandLoyaltyPointsRedemption: r21g,
    row21h_expressOrderFee: r21h,
    row22_cashReceivedSelfDelivery: r22,
    row23_previousWeeksAdjustments: r23,

    sectionF_investmentInGrowthServices,
    row24_totalAdsIncGst: r24,
    row25_totalDiningAdsIncGst: r25,
    row26_miscellaneousServices: r26,

    sectionG_investmentInHyperpure,
    row27_totalHyperpure: r27,

    sectionH_otherDeductions,
    row28_expressOrderDiscountReversal: r28,
    extraOtherDeductions,

    sectionI_totalAdditions,
    row29_cancellationRefund: r29,
    row30_kitchenStaffTip: r30,
    row31_tds194HAndResIdAdditions: r31,
    row32_serviceFeesRebate: r32,
    extraAdditions,

    sectionJ_netPayout,
    settlementAmountSettled,
    settlementPendingAmount,
    calculatedNetPayout,
    reportedNetPayout,
  };
}

/**
 * Synchronizes ZomatoPayoutBreakupModel onto PlatformPayoutRecord for POS Reconciliation Matrix,
 * Hyperpure Offset Audit, P&L, Growth, Break-Even, and Supabase persistence.
 */
export function applyZomatoBreakupToPayoutRecord(
  baseRecord: PlatformPayoutRecord,
  rawModel: ZomatoPayoutBreakupModel,
  syncActualToCalculated = false,
  options?: { alignSubCentWithReported?: boolean }
): PlatformPayoutRecord {
  const m = recalculateZomatoBreakupModel(rawModel, syncActualToCalculated, options);

  const totalDiscounts = round2(
    m.row4_promoDiscount.total +
      m.row5_bogoFreebiesGoldDiscount.total +
      m.row7_deliveryRelistingDiscount.total
  );

  // Net Zomato Service Fee (12 + 13 - 14 - 15)
  const netServiceFee = round2(
    m.row12_baseServiceFee.total +
      m.row13_longDistanceFee.total -
      m.row14_longDistanceDiscount.total -
      m.row15_serviceFeeCapDiscount.total
  );

  const cancellationAndPenalty = round2(
    m.row21a_customerCompensation.total + m.row21b_rejectionPenalty.total
  );

  const remainingOrderDeductions = round2(
    m.sectionE_otherOrderLevelDeductions.total - cancellationAndPenalty
  );

  const otherBreakdown: PayoutOtherChargeItem[] = [];
  if (Math.abs(remainingOrderDeductions) >= 0.01) {
    otherBreakdown.push({
      id: 'zomato-sec-e-other',
      label: 'Other Order-Level Deductions (Sec E)',
      amount: round2(remainingOrderDeductions),
    });
  }
  if (m.sectionH_otherDeductions.total > 0) {
    otherBreakdown.push({
      id: 'zomato-sec-h-other',
      label: 'Other Deductions (Sec H)',
      amount: round2(m.sectionH_otherDeductions.total),
    });
  }
  if (m.sectionI_totalAdditions.total > 0) {
    otherBreakdown.push({
      id: 'zomato-sec-i-additions',
      label: 'Total Additions Credit (Sec I)',
      amount: -round2(m.sectionI_totalAdditions.total),
    });
  }
  const otherPlatformFees = round2(
    otherBreakdown.reduce((s, item) => s + item.amount, 0)
  );

  const settlementDifference = round2(m.calculatedNetPayout - m.reportedNetPayout);
  const commBase =
    m.sectionB_totalCommissionableValue.total > 0
      ? m.sectionB_totalCommissionableValue.total
      : m.row1_subtotal.total;

  return {
    ...baseRecord,
    platform: 'zomato',
    outletId: m.outletLocation || baseRecord.outletId,
    accountId: m.resId ?? baseRecord.accountId,
    accountName: m.brandName ?? baseRecord.accountName,
    weekLabel: m.settlementPeriodLabel ?? baseRecord.weekLabel,
    payoutStartDate: m.payoutStartDate ?? baseRecord.payoutStartDate,
    payoutEndDate: m.payoutEndDate ?? baseRecord.payoutEndDate,
    orderCount: m.ordersCount.delivered,
    cancelledOrders: m.ordersCount.cancelled,
    grossSales: m.row1_subtotal.total,
    packagingCharges: m.row2_packagingCharge.total,
    deliveryChargesCollected: round2(
      m.row3_selfLogisticsDeliveryCharge.total + m.row6_brandPackSubscriptionFee.total
    ),
    customerDiscounts: totalDiscounts,
    netSales: m.sectionA_netOrderValue.total,
    commissionRate: commBase > 0 ? round2((netServiceFee / commBase) * 100) : 0,
    commissionAmount: netServiceFee,
    paymentGatewayFee: m.row16_paymentMechanismFee.total,
    advertisingSpend: m.sectionF_investmentInGrowthServices.total,
    cancellationCharges: cancellationAndPenalty,
    swiggyAssureFee: 0,
    otherPlatformFees,
    otherChargesBreakdown: otherBreakdown,
    gstOnCommission: round2(m.row17_taxesOnServiceFee.total + m.row20_gstSection9_5.total),
    tcsDeduction: m.row18_tcsAndIgst.total,
    tdsDeduction: m.row19_tds194O.total,
    hyperpureRecovery: m.sectionG_investmentInHyperpure.total,
    calculatedNetPayout: m.calculatedNetPayout,
    actualBankSettlement: m.reportedNetPayout,
    settlementDifference,
    status: Math.abs(settlementDifference) <= 10 ? 'reconciled' : 'discrepancy',
    zomatoBreakup: m,
  };
}

function normalizeTabName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .replace(/\bbreak\s+up\b/g, 'breakup');
}

/**
 * Locates the primary Breakup / Summary sheet inside ANY Zomato workbook (classic or newer template).
 */
export function findZomatoPayoutBreakupSheetName(
  sheetNames: string[],
  workbook?: XLSX.WorkBook
): string | null {
  const exact = sheetNames.find((n) => normalizeTabName(n) === 'payout breakup');
  if (exact) return exact;

  const containsPayoutBreakup = sheetNames.find((n) =>
    normalizeTabName(n).includes('payout breakup')
  );
  if (containsPayoutBreakup) return containsPayoutBreakup;

  const containsSettlementBreakup = sheetNames.find((n) => {
    const norm = normalizeTabName(n);
    return (
      (norm.includes('breakup') || norm.includes('payout summary') || norm.includes('settlement summary')) &&
      !norm.includes('order level') &&
      !norm.includes('tax breakup') &&
      !norm.includes('addition')
    );
  });
  if (containsSettlementBreakup) return containsSettlementBreakup;

  // Inspect sheet contents if workbook is provided (catches newer Zomato tabs named "Summary", "Settlement", "Sheet1", etc.)
  if (workbook) {
    let bestSheet: string | null = null;
    let bestScore = 0;

    for (const name of sheetNames) {
      const norm = normalizeTabName(name);
      if (norm.includes('order level') || norm.includes('addition')) continue;
      const ws = workbook.Sheets[name];
      if (!ws) continue;
      const sampleRows: any[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
      });
      const text = sampleRows
        .slice(0, 45)
        .map((r) => (r || []).slice(0, 8).join(' '))
        .join(' \n ')
        .toLowerCase();

      let score = 0;
      if (text.includes('net order value') || text.includes('customer payable')) score += 3;
      if (text.includes('subtotal') || text.includes('items total')) score += 2;
      if (text.includes('base service fee') || text.includes('zomato service fee')) score += 3;
      if (text.includes('payment mechanism fee') || text.includes('commissionable')) score += 3;
      if (text.includes('government charges') || text.includes('tds 194')) score += 2;
      if (text.includes('hyperpure')) score += 2;
      if (text.includes('net payout') || text.includes('net pavout')) score += 2;

      if (score > bestScore) {
        bestScore = score;
        bestSheet = name;
      }
    }

    if (bestSheet && bestScore >= 4) {
      return bestSheet;
    }
  }

  if (sheetNames.length === 1) {
    const onlyName = sheetNames[0];
    if (normalizeTabName(onlyName).includes('order level')) return null;
    if (workbook && workbook.Sheets[onlyName]) {
      const topRows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[onlyName], {
        header: 1,
        defval: '',
      });
      const hasOrderIdHeader = topRows
        .slice(0, 12)
        .some((r) => (r || []).some((c: any) => /^\s*order[\s_-]*id\s*$/i.test(String(c ?? ''))));
      if (hasOrderIdHeader) return null;
    }
    return onlyName;
  }

  return null;
}

/**
 * Determines whether an uploaded workbook is a Zomato Payout report (classic or newer template).
 */
export function isZomatoWorkbook(
  fileName: string,
  sheetNames: string[],
  sampleText: string,
  preferredPlatform?: 'auto' | 'swiggy' | 'zomato' | 'ownly',
  matchedMapping?: AggregatorBrandOutletMapping | null
): boolean {
  if (preferredPlatform === 'swiggy' || preferredPlatform === 'ownly') return false;
  if (preferredPlatform === 'zomato') return true;
  if (matchedMapping?.platform === 'zomato') return true;
  if (matchedMapping) return false;

  const lowerFile = fileName.toLowerCase();
  if (
    lowerFile.includes('swiggy') ||
    lowerFile.includes('toing') ||
    lowerFile.includes('bundl') ||
    lowerFile.includes('ownly')
  ) {
    return false;
  }
  if (lowerFile.includes('zomato') || lowerFile.includes('hyperpure') || lowerFile.includes('eternal')) {
    return true;
  }

  const lowerSample = sampleText.toLowerCase();
  if (
    lowerSample.includes('swiggy') ||
    lowerSample.includes('toing orders') ||
    lowerSample.includes('total customer paid') ||
    lowerSample.includes('swiggy fees') ||
    lowerSample.includes('pocket hero') ||
    lowerSample.includes('bolt fees') ||
    (lowerSample.includes('payout period') &&
      lowerSample.includes('tax deduction') &&
      lowerSample.includes('net payout amount')) ||
    /\brn\d{5,10}\b/i.test(sampleText)
  ) {
    return false;
  }

  if (
    lowerSample.includes('zomato') ||
    lowerSample.includes('eternal') ||
    lowerSample.includes('base service fee') ||
    lowerSample.includes('payment mechanism fee') ||
    lowerSample.includes('total commissionable value') ||
    lowerSample.includes('commissionable value of subtotal') ||
    lowerSample.includes('investment in hyperpure') ||
    lowerSample.includes('total hyperpure') ||
    lowerSample.includes('net order value')
  ) {
    return true;
  }

  const hasPayoutBreakupTab = sheetNames.some((n) =>
    normalizeTabName(n).includes('payout breakup')
  );
  if (hasPayoutBreakupTab) return true;

  return false;
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

function extractZomatoDatesAndMonth(
  textSources: string[],
  fallbackMonth?: string
): {
  month: string;
  isWeekly: boolean;
  periodLabel?: string;
  startDate?: string;
  endDate?: string;
} {
  const combined = textSources.join(' \n ');
  let detectedMonth = '';
  let startDate: string | undefined;
  let endDate: string | undefined;

  const isoDates = combined.match(/202\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])/g);
  if (isoDates && isoDates.length > 0) {
    const sorted = Array.from(new Set(isoDates)).sort();
    startDate = sorted[0];
    endDate = sorted[sorted.length - 1];
    detectedMonth = endDate.slice(0, 7);
  }

  if (!detectedMonth) {
    const dMonY = [
      ...combined.matchAll(
        /\b(0?[1-9]|[12]\d|3[01])[\s\-_\/]*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s\-_,\/]*(202\d|\d{2})\b/gi
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
    const dmy = [
      ...combined.matchAll(/\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](202\d)\b/g),
    ];
    if (dmy.length > 0) {
      const parsed = dmy
        .map((m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
        .sort();
      startDate = parsed[0];
      endDate = parsed[parsed.length - 1];
      detectedMonth = endDate.slice(0, 7);
    }
  }

  if (!detectedMonth) {
    const compactDates = [
      ...combined.matchAll(/\b(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g),
    ];
    if (compactDates.length > 0) {
      const parsed = compactDates.map((m) => `${m[1]}-${m[2]}-${m[3]}`).sort();
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
    if (ym) detectedMonth = `${ym[1]}-${ym[2]}`;
  }

  if (!detectedMonth) {
    const now = new Date();
    detectedMonth =
      fallbackMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  let spanDays = 0;
  if (startDate && endDate) {
    const t1 = new Date(startDate).getTime();
    const t2 = new Date(endDate).getTime();
    if (!isNaN(t1) && !isNaN(t2) && t2 >= t1) {
      spanDays = Math.round((t2 - t1) / 86400000) + 1;
    }
  }

  const isWeekly =
    /\b(weekly|week[\s\-_]*[1-5]|w[1-5])\b/i.test(combined) || (spanDays > 0 && spanDays <= 10);

  const periodLabel =
    startDate && endDate && startDate !== endDate
      ? `${startDate} to ${endDate}`
      : startDate
      ? startDate
      : isWeekly
      ? 'Weekly Settlement'
      : undefined;

  return {
    month: detectedMonth,
    isWeekly,
    periodLabel,
    startDate,
    endDate,
  };
}

function isSerialOrSectionCode(txt: string): boolean {
  const clean = txt.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 8) return false;
  // Matches S.no., 1..99, 1a, A.1, I..X, A..Z (including I and J!)
  return /^(?:s\.?\s*r?\.?\s*no\.?|sl\.?\s*no\.?|#|\(?[0-9]{1,2}[a-z]?\)?\.?|\(?[a-z](?:\.\d{1,2})?\)?\.?)$/i.test(
    clean
  );
}

/**
 * Normalizes Zomato label spelling variations & sheet typos across older and newer Zomato templates
 * so semantic classification works deterministically regardless of S.no shifts.
 */
function normalizeZomatoParticularLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\brestuarant\b/g, 'restaurant')
    .replace(/\bsevices\b|\bservies\b/g, 'services')
    .replace(/\bhvperpure\b|\bhyper\s+pure\b/g, 'hyperpure')
    .replace(/\bpavout\b|\bpay[\s-]+out\b/g, 'payout')
    .replace(/\bcommisionable\b|\bcommissinable\b/g, 'commissionable')
    .replace(/\bmiscelleneous\b|\bmiscellenous\b/g, 'miscellaneous')
    .replace(/\(\s*refer\s+to\s+annexure[^)]*\)?/gi, '')
    .replace(/\(\s*service\s+fees?\s+capped[^)]*\)?/gi, '')
    .replace(/\(\s*exclud(?:es?|ing)\s+(?:customer\s+)?gst\s*\)/gi, '')
    .replace(
      /\[\s*(?:\(?[0-9]{1,2}[a-z]?\)?|\(?[a-j]\)?)(?:\s*[+\-–&,]\s*(?:\(?[0-9]{1,2}[a-z]?\)?|\(?[a-j]\)?))+\s*\]?/gi,
      ''
    )
    .replace(
      /\(\s*(?:\(?[0-9]{1,2}[a-z]?\)?|\(?[a-j]\)?)(?:\s*[+\-–&,]\s*(?:\(?[0-9]{1,2}[a-z]?\)?|\(?[a-j]\)?))+\s*\)?/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

type CanonicalLeafField =
  | 'row1_subtotal'
  | 'row2_packagingCharge'
  | 'row3_selfLogisticsDeliveryCharge'
  | 'row4_promoDiscount'
  | 'row5_bogoFreebiesGoldDiscount'
  | 'row6_brandPackSubscriptionFee'
  | 'row7_deliveryRelistingDiscount'
  | 'row8_customerGstCollected'
  | 'row9_commissionableSubtotal'
  | 'row10_commissionablePackaging'
  | 'row11_commissionableGst'
  | 'row12_baseServiceFee'
  | 'row13_longDistanceFee'
  | 'row14_longDistanceDiscount'
  | 'row15_serviceFeeCapDiscount'
  | 'row16_paymentMechanismFee'
  | 'row17_taxesOnServiceFee'
  | 'row18_tcsAndIgst'
  | 'row19_tds194O'
  | 'row20_gstSection9_5'
  | 'row21a_customerCompensation'
  | 'row21b_rejectionPenalty'
  | 'row21c_deliveryChargesRecovery'
  | 'row21d_creditDebitNoteAdjustment'
  | 'row21e_promoRecoveryAdjustment'
  | 'row21f_extraInventoryAds'
  | 'row21g_brandLoyaltyPointsRedemption'
  | 'row21h_expressOrderFee'
  | 'row22_cashReceivedSelfDelivery'
  | 'row23_previousWeeksAdjustments'
  | 'row24_totalAdsIncGst'
  | 'row25_totalDiningAdsIncGst'
  | 'row26_miscellaneousServices'
  | 'row27_totalHyperpure'
  | 'row28_expressOrderDiscountReversal'
  | 'row29_cancellationRefund'
  | 'row30_kitchenStaffTip'
  | 'row31_tds194HAndResIdAdditions'
  | 'row32_serviceFeesRebate';

const CANONICAL_STANDARD_SNO: Partial<Record<CanonicalLeafField, string>> = {
  row1_subtotal: '1',
  row2_packagingCharge: '2',
  row3_selfLogisticsDeliveryCharge: '3',
  row4_promoDiscount: '4',
  row5_bogoFreebiesGoldDiscount: '5',
  row6_brandPackSubscriptionFee: '6',
  row7_deliveryRelistingDiscount: '7',
  row8_customerGstCollected: '8',
  row9_commissionableSubtotal: '9',
  row10_commissionablePackaging: '10',
  row11_commissionableGst: '11',
  row12_baseServiceFee: '12',
  row13_longDistanceFee: '13',
  row14_longDistanceDiscount: '14',
  row15_serviceFeeCapDiscount: '15',
  row16_paymentMechanismFee: '16',
  row17_taxesOnServiceFee: '17',
  row18_tcsAndIgst: '18',
  row19_tds194O: '19',
  row20_gstSection9_5: '20',
  row22_cashReceivedSelfDelivery: '22',
  row23_previousWeeksAdjustments: '23',
  row24_totalAdsIncGst: '24',
  row25_totalDiningAdsIncGst: '25',
  row26_miscellaneousServices: '26',
  row27_totalHyperpure: '27',
  row28_expressOrderDiscountReversal: '28',
  row29_cancellationRefund: '29',
  row30_kitchenStaffTip: '30',
  row31_tds194HAndResIdAdditions: '31',
  row32_serviceFeesRebate: '32',
};

/**
 * Fallback adapter when a Zomato export only contains Order-Level rows (no Payout Breakup summary tab).
 * Aggregates every order row + optional Addition/Deduction tab into the canonical Zomato A->J (1-32) model.
 */
function tryParseZomatoOrderLevelToCanonical(
  workbook: XLSX.WorkBook,
  draft: ZomatoPayoutBreakupModel
): ZomatoPayoutBreakupModel | null {
  const orderSheetName =
    workbook.SheetNames.find((n) => /order[\s_-]*level|orders/i.test(n)) || workbook.SheetNames[0];
  const ws = orderSheetName ? workbook.Sheets[orderSheetName] : undefined;
  if (!ws) return null;

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let headerIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const hdr = (rows[r] || []).map((c: any) => String(c ?? '').toLowerCase().trim());
    const hasOrderCol = hdr.some((h) => /\border[\s_]*id\b/.test(h));
    const hasFinCol = hdr.some((h) => /\b(subtotal|bill|service\s*fee|commission|receivable|payout)\b/.test(h));
    if (hasOrderCol && hasFinCol) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const headers = (rows[headerIdx] || []).map((c: any) =>
    String(c ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  );

  const findCol = (re: RegExp, exclude?: RegExp) =>
    headers.findIndex((h) => re.test(h) && (!exclude || !exclude.test(h)));

  const statusCol = findCol(/\b(action|order\s*status|status|order\s*state)\b/);
  const subCol = findCol(/\b(subtotal|item\s*total|bill\s*subtotal|gross\s*sales)\b/, /commissionable/);
  const packCol = findCol(/\bpackaging\b/, /commissionable/);
  const selfDelCol = findCol(/self\s*logistics|delivery\s*charge.*restaurant/);
  const promoCol = findCol(/\bpromo\b|merchant\s*voucher/);
  const bogoCol = findCol(/\b(bogo|freebie|gold|salt|flat\s*off)\b/);
  const custGstCol = findCol(/gst\s*collected|customer\s*gst|tax\s*collected\s*from\s*customer/);
  const serviceFeeCol = findCol(/\b(base\s*service\s*fee|zomato\s*service\s*fee|service\s*fee|commission)\b/, /tax|gst|discount|rebate|cap/);
  const ldFeeCol = findCol(/long\s*distance/, /discount/);
  const capDiscCol = findCol(/30%\s*cap|discount\s*on\s*service\s*fee/);
  const payFeeCol = findCol(/payment\s*(mechanism|gateway|collection)\s*fee/);
  const taxFeeCol = findCol(/taxes?\s*on\s*(service|zomato)|gst\s*on\s*(service|zomato)/);
  const tcsCol = findCol(/\btcs\b|tax\s*collected\s*at\s*source/);
  const tdsCol = findCol(/\btds\b|194\s*-?\s*o/i);
  const sec95Col = findCol(/9\s*\(\s*5\s*\)|gst\s*paid\s*by\s*zomato/);
  const compCol = findCol(/compensation|recoupment/);
  const rejCol = findCol(/rejection\s*penalty/);
  const cancRefundCol = findCol(/cancellation\s*refund/);
  const tipCol = findCol(/\btip\b/);
  const netCol = findCol(/\b(net\s*receivable|order\s*level\s*payout|total\s*voucher|net\s*payout|payable)\b/);

  let delOrders = 0;
  let canOrders = 0;

  const acc = (field: CanonicalLeafField, isCanc: boolean, val: number) => {
    const clean = Math.abs(val);
    if (clean < 0.0001) return;
    const add = isCanc ? makeTriplet(0, clean, clean) : makeTriplet(clean, 0, clean);
    draft[field] = addTriplets(draft[field], add);
  };

  let netDelSum = 0;
  let netCanSum = 0;
  let hasNetColValues = false;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const subCell = subCol !== -1 ? parseZomatoCurrencyCell(row[subCol]) : { hasNumber: false, value: 0 };
    const netCell = netCol !== -1 ? parseZomatoCurrencyCell(row[netCol]) : { hasNumber: false, value: 0 };
    if (!subCell.hasNumber && !netCell.hasNumber) continue;

    const statusStr = statusCol !== -1 ? String(row[statusCol] ?? '').toLowerCase() : '';
    const isCancelled = /\b(cancel|reject|refund|timed?\s*out)\b/.test(statusStr);
    if (isCancelled) canOrders++;
    else delOrders++;

    if (subCol !== -1) acc('row1_subtotal', isCancelled, parseZomatoCurrencyCell(row[subCol]).value);
    if (packCol !== -1) acc('row2_packagingCharge', isCancelled, parseZomatoCurrencyCell(row[packCol]).value);
    if (selfDelCol !== -1) acc('row3_selfLogisticsDeliveryCharge', isCancelled, parseZomatoCurrencyCell(row[selfDelCol]).value);
    if (promoCol !== -1) acc('row4_promoDiscount', isCancelled, parseZomatoCurrencyCell(row[promoCol]).value);
    if (bogoCol !== -1) acc('row5_bogoFreebiesGoldDiscount', isCancelled, parseZomatoCurrencyCell(row[bogoCol]).value);
    if (custGstCol !== -1) acc('row8_customerGstCollected', isCancelled, parseZomatoCurrencyCell(row[custGstCol]).value);
    if (serviceFeeCol !== -1) acc('row12_baseServiceFee', isCancelled, parseZomatoCurrencyCell(row[serviceFeeCol]).value);
    if (ldFeeCol !== -1) acc('row13_longDistanceFee', isCancelled, parseZomatoCurrencyCell(row[ldFeeCol]).value);
    if (capDiscCol !== -1) acc('row15_serviceFeeCapDiscount', isCancelled, parseZomatoCurrencyCell(row[capDiscCol]).value);
    if (payFeeCol !== -1) acc('row16_paymentMechanismFee', isCancelled, parseZomatoCurrencyCell(row[payFeeCol]).value);
    if (taxFeeCol !== -1) acc('row17_taxesOnServiceFee', isCancelled, parseZomatoCurrencyCell(row[taxFeeCol]).value);
    if (tcsCol !== -1) acc('row18_tcsAndIgst', isCancelled, parseZomatoCurrencyCell(row[tcsCol]).value);
    if (tdsCol !== -1) acc('row19_tds194O', isCancelled, parseZomatoCurrencyCell(row[tdsCol]).value);
    if (sec95Col !== -1) acc('row20_gstSection9_5', isCancelled, parseZomatoCurrencyCell(row[sec95Col]).value);
    if (compCol !== -1) acc('row21a_customerCompensation', isCancelled, parseZomatoCurrencyCell(row[compCol]).value);
    if (rejCol !== -1) acc('row21b_rejectionPenalty', isCancelled, parseZomatoCurrencyCell(row[rejCol]).value);
    if (cancRefundCol !== -1) acc('row29_cancellationRefund', isCancelled, parseZomatoCurrencyCell(row[cancRefundCol]).value);
    if (tipCol !== -1) acc('row30_kitchenStaffTip', isCancelled, parseZomatoCurrencyCell(row[tipCol]).value);

    if (netCell.hasNumber) {
      hasNetColValues = true;
      if (isCancelled) netCanSum += netCell.value;
      else netDelSum += netCell.value;
    }
  }

  if (delOrders + canOrders === 0) return null;

  draft.sheetNameUsed = orderSheetName;
  draft.detectedSourceTemplate = 'order_level_tabular';
  draft.detectedSourceTemplateLabel = `Order-Level Zomato Export → Canonical A–J (${delOrders + canOrders} orders)`;
  draft.ordersCount = makeTriplet(delOrders, canOrders, delOrders + canOrders);

  if (hasNetColValues) {
    draft.reportedSectionJ = makeTriplet(netDelSum, netCanSum, netDelSum + netCanSum);
    draft.hasExplicitReportedJ = true;
    draft.reportedNetPayout = round2(netDelSum + netCanSum);
  }

  return draft;
}

/**
 * Universal Zomato Payout Parser & Canonical Adapter:
 * Parses ANY Zomato payout workbook (classic A–J 1–32 "Payout Breakup", shifted-row or extended newer Zomato
 * templates, signed summary ledgers, 2-column summaries, or Order-Level exports) and maps all data into the
 * single consistent canonical ZomatoPayoutBreakupModel (Sections A through J, Rows 1 through 32 + Settlement breakdown).
 */
export function parseZomatoPayoutBreakupWorkbook(
  workbook: XLSX.WorkBook,
  file: File,
  fileHash: string,
  mappings: AggregatorBrandOutletMapping[],
  options?: {
    preferredPeriodType?: 'monthly' | 'weekly';
    fallbackMonth?: string;
  }
): {
  payout: PlatformPayoutRecord;
  model: ZomatoPayoutBreakupModel;
  matchedMapping: AggregatorBrandOutletMapping | null;
  candidateRestaurantId?: string;
} {
  const targetSheetName = findZomatoPayoutBreakupSheetName(workbook.SheetNames, workbook);

  const summarySheetName = workbook.SheetNames.find(
    (n) => n !== targetSheetName && /summary|cover|merchant/i.test(n)
  );
  const summaryTitleMetaText = summarySheetName
    ? (
        XLSX.utils.sheet_to_json(workbook.Sheets[summarySheetName], {
          header: 1,
          defval: '',
        }) as any[][]
      )
        .slice(0, 25)
        .map((r) => (r || []).slice(0, 10).join(' '))
        .join(' \n ')
    : '';

  const rawRows: any[][] = targetSheetName
    ? XLSX.utils.sheet_to_json(workbook.Sheets[targetSheetName], {
        header: 1,
        raw: true,
        defval: '',
      })
    : [];

  const rows: any[][] = rawRows.map((r) =>
    (r || []).map((cell: any) => {
      if (cell instanceof Date && !isNaN(cell.getTime())) {
        return cell.toISOString().slice(0, 10);
      }
      return cell;
    })
  );

  // Non-financial metadata sample (Res ID / Brand / Period Dates / UTR)
  const breakupTextSample = rows
    .slice(0, 40)
    .map((r) => r.slice(0, 10).join(' '))
    .join(' \n ');

  // 1. Identify Restaurant ID & Brand/Outlet Mapping
  let matchedMapping =
    detectAggregatorMappingFromText(file.name, mappings, 'zomato') ||
    detectAggregatorMappingFromText(breakupTextSample, mappings, 'zomato') ||
    detectAggregatorMappingFromText(summaryTitleMetaText, mappings, 'zomato');

  let candidateResId =
    matchedMapping?.restaurantId || extractCandidateRestaurantIdFromFilename(file.name);
  if (!candidateResId) {
    const resMatch = `${breakupTextSample}\n${summaryTitleMetaText}`.match(
      /(?:restaurant\s*id|res\.?\s*id|store\s*id|merchant\s*id)[\s:=-]*(\d{5,10})/i
    );
    if (resMatch) {
      candidateResId = resMatch[1];
      if (!matchedMapping) {
        matchedMapping = detectAggregatorMappingFromText(candidateResId, mappings, 'zomato');
      }
    }
  }

  const utrMatch = `${breakupTextSample}\n${summaryTitleMetaText}`.match(
    /\b(?:utr|bank\s*ref(?:erence)?(?:\s*no\.?)?|neft|rtgs|imps)[\s:=-]*([A-Z0-9]{8,28})\b/i
  );
  const extractedUtr = utrMatch ? utrMatch[1] : undefined;

  const periodInfo = extractZomatoDatesAndMonth(
    [file.name, breakupTextSample, summaryTitleMetaText],
    options?.fallbackMonth
  );
  const effectivePeriodType: 'monthly' | 'weekly' = periodInfo.isWeekly
    ? 'weekly'
    : options?.preferredPeriodType || 'monthly';

  const draft: ZomatoPayoutBreakupModel = createEmptyZomatoBreakupModel({
    sheetNameUsed: targetSheetName || workbook.SheetNames[0] || 'Payout Breakup',
    resId: matchedMapping?.restaurantId || candidateResId,
    brandName: matchedMapping?.brandName,
    outletLocation: matchedMapping?.outletId,
    settlementPeriodLabel: periodInfo.periodLabel,
    payoutStartDate: periodInfo.startDate,
    payoutEndDate: periodInfo.endDate,
    utrNumber: extractedUtr,
  });

  if (!targetSheetName) {
    const orderLevelFallback = tryParseZomatoOrderLevelToCanonical(workbook, draft);
    if (!orderLevelFallback) {
      throw new Error(
        `Zomato report "${file.name}" does not contain a recognizable "Payout Breakup" or Order-Level sheet (found tabs: ${workbook.SheetNames.join(
          ', '
        )}). Please upload a valid Zomato Settlement Report.`
      );
    }
  } else {
    const ws = workbook.Sheets[targetSheetName];
    const merges: XLSX.Range[] = Array.isArray(ws['!merges']) ? ws['!merges'] : [];

    // 2. Detect Table Header & Column Positions (supports 1–3 row headers, multi-cancelled/multi-channel cols, 2-col summaries, & headerless layouts)
    let headerRowIdx = -1;
    let headerEndRowIdx = -1;
    let sNoCol = 0;
    let particularsCol = 1;
    let deliveredCols: number[] = [];
    let cancelledCols: number[] = [];
    let totalCol = -1;
    let headerDeliveredOrders = 0;
    let headerCancelledOrders = 0;

    // Pass 1: Standard or Newer Multi-Column Zomato Breakup Header (combining up to 3 wrapped/merged header rows)
    for (let r = 0; r < Math.min(rows.length, 45); r++) {
      const r0 = rows[r] || [];
      const r1 = rows[r + 1] || [];
      const r2 = rows[r + 2] || [];
      const maxCols = Math.max(r0.length, r1.length, r2.length);
      if (maxCols < 3) continue;

      const r1HasNumbers = r1.some((cell: any) => parseZomatoCurrencyCell(cell).hasNumber);
      const r2HasNumbers = r2.some((cell: any) => parseZomatoCurrencyCell(cell).hasNumber);

      const combinedHeaders: string[] = [];
      for (let c = 0; c < Math.min(maxCols, 18); c++) {
        const h0 = String(r0[c] ?? '').replace(/\s+/g, ' ').trim();
        const h1 = !r1HasNumbers ? String(r1[c] ?? '').replace(/\s+/g, ' ').trim() : '';
        const h2 = !r1HasNumbers && !r2HasNumbers ? String(r2[c] ?? '').replace(/\s+/g, ' ').trim() : '';
        combinedHeaders.push(`${h0} ${h1} ${h2}`.replace(/\s+/g, ' ').trim().toLowerCase());
      }

      const pIdx = combinedHeaders.findIndex((h) =>
        /\b(particulars?|breakup|description|component|fee\s*head|details|line\s*item)\b/.test(h)
      );
      const sIdx = combinedHeaders.findIndex((h) => /\bs\.?\s*r?\.?\s*no\.?\b/.test(h));

      const delivMatches: number[] = [];
      const cancMatches: number[] = [];
      combinedHeaders.forEach((h, idx) => {
        if (idx <= Math.max(sIdx, pIdx)) return;
        if (/\b(cancelled|rejected)\b/.test(h)) {
          cancMatches.push(idx);
        } else if (
          /\b(delivered|completed\s*orders|successful\s*orders|online\s*ordering|zomato\s*delivery|dining)\b/.test(
            h
          ) &&
          !/\btotal\b/.test(h)
        ) {
          delivMatches.push(idx);
        }
      });

      if (delivMatches.length > 0 && (cancMatches.length > 0 || pIdx !== -1)) {
        headerRowIdx = r;
        headerEndRowIdx = !r1HasNumbers ? (!r2HasNumbers ? r + 1 : r + 1) : r;
        if (sIdx !== -1 && sIdx < delivMatches[0]) sNoCol = sIdx;
        particularsCol =
          pIdx !== -1 && pIdx < delivMatches[0]
            ? pIdx
            : Math.min(sNoCol + 1, delivMatches[0] - 1);
        deliveredCols = delivMatches;
        cancelledCols = cancMatches;

        const searchStart = Math.max(...deliveredCols, ...(cancelledCols.length ? cancelledCols : [0])) + 1;
        for (let c = searchStart; c < combinedHeaders.length; c++) {
          if (/\b(total|amount|value|net|inr|payable)\b/.test(combinedHeaders[c])) {
            totalCol = c;
            break;
          }
        }
        if (totalCol === -1 && cancelledCols.length > 0) {
          totalCol = Math.max(...deliveredCols, ...cancelledCols) + 1;
        }

        const mDel = combinedHeaders[deliveredCols[0]].match(/\((\d+)\)/);
        if (mDel) headerDeliveredOrders = parseInt(mDel[1], 10);
        if (cancelledCols.length > 0) {
          const mCan = combinedHeaders[cancelledCols[0]].match(/\((\d+)\)/);
          if (mCan) headerCancelledOrders = parseInt(mCan[1], 10);
        }
        break;
      }
    }

    // Pass 2: 2/3-Column Zomato Summary Breakup layout (Particulars | Total / Amount / INR)
    if (headerRowIdx === -1) {
      for (let r = 0; r < Math.min(rows.length, 45); r++) {
        const cur = rows[r] || [];
        if (cur.length < 2) continue;
        const singleHeaders = cur
          .slice(0, 14)
          .map((c: any) => String(c ?? '').replace(/\s+/g, ' ').trim().toLowerCase());
        const pIdx = singleHeaders.findIndex((h) =>
          /\b(particulars?|breakup|description|component|fee\s*head|summary)\b/.test(h)
        );
        if (pIdx === -1) continue;
        let amtIdx = -1;
        for (let c = pIdx + 1; c < singleHeaders.length; c++) {
          if (/\b(total|amount|value|inr|rs\.?|settled|payout)\b/.test(singleHeaders[c])) {
            amtIdx = c;
            break;
          }
        }
        if (amtIdx !== -1) {
          headerRowIdx = r;
          headerEndRowIdx = r;
          sNoCol = Math.max(0, pIdx - 1);
          particularsCol = pIdx;
          totalCol = amtIdx;
          break;
        }
      }
    }

    // Pass 3: Headerless Structural Inference (if newer Zomato export omits column headers entirely)
    if (headerRowIdx === -1) {
      for (let r = 0; r < Math.min(rows.length, 45); r++) {
        const cur = rows[r] || [];
        const joined = cur.map((x: any) => String(x ?? '').toLowerCase()).join(' ');
        if (/\b(net\s*order\s*value|subtotal\s*\(items|base\s*service\s*fee)\b/.test(joined)) {
          const numCols: number[] = [];
          let textCol = -1;
          cur.forEach((cell: any, idx: number) => {
            const p = parseZomatoCurrencyCell(cell);
            if (p.hasNumber || isDashZeroCell(cell)) {
              numCols.push(idx);
            } else if (
              textCol === -1 &&
              String(cell ?? '').trim().length > 3 &&
              !isSerialOrSectionCode(String(cell))
            ) {
              textCol = idx;
            }
          });
          if (textCol !== -1 && numCols.length > 0) {
            particularsCol = textCol;
            sNoCol = Math.max(0, textCol - 1);
            if (numCols.length >= 3) {
              deliveredCols = [numCols[0]];
              cancelledCols = [numCols[1]];
              totalCol = numCols[numCols.length - 1];
            } else {
              totalCol = numCols[numCols.length - 1];
            }
            headerRowIdx = Math.max(0, r - 1);
            headerEndRowIdx = headerRowIdx;
            break;
          }
        }
      }
    }

    // Check if the chosen sheet was actually an Order-Level sheet (no breakup rows)
    if (headerRowIdx === -1) {
      const orderLevelParsed = tryParseZomatoOrderLevelToCanonical(workbook, draft);
      if (orderLevelParsed) {
        headerRowIdx = rows.length; // Skip breakup loop; orderLevelParsed populated draft
      }
    }

    const firstValueCol =
      deliveredCols.length > 0
        ? Math.min(...deliveredCols)
        : totalCol > 0
        ? totalCol
        : Math.max(particularsCol + 2, 3);

    const maxTextColExclusive = firstValueCol;

    const areRowsVerticallyMergedInTextCols = (r1: number, r2: number): boolean =>
      merges.some((m) => m.s.c < maxTextColExclusive && m.s.r <= r1 && m.e.r >= r2);

    const inspectPhysicalRow = (rowIdx: number) => {
      const row = rows[rowIdx] || [];
      let sNo = '';
      const textParts: string[] = [];

      for (let c = 0; c < Math.min(row.length, maxTextColExclusive); c++) {
        const rawStr = String(row[c] ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
        if (!rawStr) continue;

        const hasRightText =
          c + 1 < maxTextColExclusive &&
          row
            .slice(c + 1, maxTextColExclusive)
            .some(
              (rightCell: any) =>
                String(rightCell ?? '').trim().length > 1 &&
                !parseZomatoCurrencyCell(rightCell).hasNumber
            );

        if (!sNo && isSerialOrSectionCode(rawStr) && (c <= sNoCol || hasRightText)) {
          if (!/^s\.?\s*r?\.?\s*no\.?$/i.test(rawStr) && rawStr !== '.') {
            sNo = rawStr.replace(/[()]/g, '').replace(/\.$/, '').trim();
          }
          continue;
        }
        if (rawStr === '.') continue;

        const numCheck = parseZomatoCurrencyCell(row[c]);
        if (numCheck.hasNumber && rawStr.length < 12) continue;

        textParts.push(rawStr);
      }

      let particulars = textParts.join(' ').replace(/\s+/g, ' ').trim();

      // Extract inline prefix code if embedded inside Particulars (e.g. "A. Net order value", "12. Base service fee")
      const inlineMatch =
        particulars.match(/^\(?([A-J]|[0-9]{1,2}[a-z]?)\)[.:\-\s]+\s*(.+)$/i) ||
        particulars.match(/^([A-J]|[0-9]{1,2}[a-z]?)[.:\-]\s+(.+)$/i);
      if (inlineMatch && inlineMatch[2].trim().length >= 3) {
        if (!sNo) sNo = inlineMatch[1].trim();
        particulars = inlineMatch[2].trim();
      }

      let delHasNum = false;
      let delDash = false;
      let deliveredVal = 0;
      for (const dc of deliveredCols) {
        if (dc < row.length) {
          const parsed = parseZomatoCurrencyCell(row[dc]);
          if (parsed.hasNumber) {
            delHasNum = true;
            deliveredVal += parsed.value;
          } else if (isDashZeroCell(row[dc])) {
            delDash = true;
          }
        }
      }

      let canHasNum = false;
      let canDash = false;
      let cancelledVal = 0;
      for (const cc of cancelledCols) {
        if (cc < row.length) {
          const parsed = parseZomatoCurrencyCell(row[cc]);
          if (parsed.hasNumber) {
            canHasNum = true;
            cancelledVal += parsed.value;
          } else if (isDashZeroCell(row[cc])) {
            canDash = true;
          }
        }
      }

      const totCell =
        totalCol !== -1 && totalCol < row.length
          ? parseZomatoCurrencyCell(row[totalCol])
          : { hasNumber: false, value: 0 };
      const totDash = totalCol !== -1 && isDashZeroCell(row[totalCol]);

      let hasValues =
        delHasNum || canHasNum || totCell.hasNumber || delDash || canDash || totDash;

      let totalVal = 0;
      if (totCell.hasNumber) {
        totalVal = totCell.value;
        if (deliveredCols.length === 0 && !delHasNum && !canHasNum) {
          deliveredVal = totCell.value;
          delHasNum = true;
        }
      } else if (delHasNum || canHasNum) {
        totalVal = deliveredVal + cancelledVal;
      } else if (!hasValues) {
        // Fallback scan right of text columns for 2-column rows
        const scanEnd = Math.min(row.length, maxTextColExclusive + 6);
        for (let c = maxTextColExclusive; c < scanEnd; c++) {
          const parsed = parseZomatoCurrencyCell(row[c]);
          if (parsed.hasNumber) {
            totalVal = parsed.value;
            deliveredVal = parsed.value;
            delHasNum = true;
            hasValues = true;
          }
        }
      }

      return {
        sNo,
        particulars,
        hasValues,
        deliveredVal: round2(deliveredVal),
        cancelledVal: round2(cancelledVal),
        totalVal: round2(totalVal),
        delHasNum,
        canHasNum,
        totHasNum: totCell.hasNumber,
      };
    };

    // 3. Consolidate 2-row merged/wrapped Zomato items (e.g. Rows A, B, C, 9, 15, 23, 24, 31)
    interface LogicalBreakupRow {
      rowNumber: number;
      sNo: string;
      particulars: string;
      hasValues: boolean;
      triplet: ZomatoTriplet;
      delHasNum: boolean;
      canHasNum: boolean;
      totHasNum: boolean;
    }

    const logicalRows: LogicalBreakupRow[] = [];
    const startScanRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

    for (let r = startScanRow; r < rows.length; r++) {
      const cur = inspectPhysicalRow(r);
      if (!cur.sNo && !cur.particulars && !cur.hasValues) continue;

      // Skip secondary/tertiary wrapped header rows immediately under headerRowIdx
      if (
        r <= headerEndRowIdx + 1 &&
        !cur.hasValues &&
        /^(orders?|rejected|rejected\s*orders|cancelled|particulars?|amount|inr|\(in\s*₹\)|\.)$/i.test(
          cur.particulars
        )
      ) {
        continue;
      }

      const isStandaloneSectionBanner = /^(settlement\s*breakdown|payout\s*breakup)$/i.test(
        cur.particulars
      );

      while (!cur.hasValues && !isStandaloneSectionBanner && r + 1 < rows.length) {
        const nxt = inspectPhysicalRow(r + 1);
        const verticallyMerged = areRowsVerticallyMergedInTextCols(r, r + 1);
        const nextLooksContinuation =
          !nxt.sNo &&
          (verticallyMerged ||
            (nxt.hasValues &&
              (Boolean(cur.sNo) ||
                !nxt.particulars ||
                nxt.particulars.startsWith('(') ||
                nxt.particulars.startsWith('[') ||
                /^(at\s+\d+%|4\s*-\s*5|1\s*-\s*4|\d+\s*[+\-])/.test(nxt.particulars))));

        if (!nextLooksContinuation) break;

        if (nxt.particulars) {
          cur.particulars = `${cur.particulars} ${nxt.particulars}`.replace(/\s+/g, ' ').trim();
        }
        if (nxt.hasValues) {
          cur.hasValues = true;
          cur.deliveredVal = nxt.deliveredVal;
          cur.cancelledVal = nxt.cancelledVal;
          cur.totalVal = nxt.totalVal;
          cur.delHasNum = nxt.delHasNum;
          cur.canHasNum = nxt.canHasNum;
          cur.totHasNum = nxt.totHasNum;
        }
        r++;
        if (cur.hasValues) break;
      }

      if (cur.hasValues && !isStandaloneSectionBanner && r + 1 < rows.length) {
        const nxt = inspectPhysicalRow(r + 1);
        const verticallyMerged = areRowsVerticallyMergedInTextCols(r, r + 1);
        if (
          !nxt.sNo &&
          !nxt.hasValues &&
          nxt.particulars &&
          (verticallyMerged ||
            nxt.particulars.startsWith('(') ||
            nxt.particulars.startsWith('[') ||
            /^(at\s+\d+%|4\s*-\s*5|1\s*-\s*4|\d+\s*[+\-])/.test(nxt.particulars))
        ) {
          cur.particulars = `${cur.particulars} ${nxt.particulars}`.replace(/\s+/g, ' ').trim();
          r++;
        }
      }

      if (!cur.particulars && !cur.sNo) continue;

      logicalRows.push({
        rowNumber: r + 1,
        sNo: cur.sNo,
        particulars: cur.particulars,
        hasValues: cur.hasValues,
        triplet: {
          delivered: cur.deliveredVal,
          cancelled: cur.cancelledVal,
          total: cur.totalVal,
        },
        delHasNum: cur.delHasNum,
        canHasNum: cur.canHasNum,
        totHasNum: cur.totHasNum,
      });
    }

    if (headerDeliveredOrders > 0 || headerCancelledOrders > 0) {
      draft.ordersCount = makeTriplet(
        headerDeliveredOrders,
        headerCancelledOrders,
        headerDeliveredOrders + headerCancelledOrders
      );
    }

    // Detect if the uploaded Zomato sheet uses signed negative deductions (e.g. Base service fee < 0)
    const sheetUsesNegativeDeductions = logicalRows.some((r) => {
      const nc = normalizeZomatoParticularLabel(r.particulars);
      return (
        (/\b(base\s*service\s*fee|zomato\s*service\s*fee|payment\s*mechanism\s*fee|taxes\s*on\s*service\s*fee|total\s*hyperpure)\b/.test(
          nc
        ) &&
          r.triplet.total < -0.01) ||
        (r.sNo.toUpperCase() === 'C' && r.triplet.total < -0.01)
      );
    });

    // Detect if the uploaded sheet's S.no numbering matches exact classic 1..32 anchors
    const classicSectionRanges: Record<string, [number, number]> = {
      A: [1, 8],
      B: [9, 11],
      C: [12, 16],
      D: [17, 20],
      E: [21, 23],
      F: [24, 26],
      G: [27, 27],
      H: [28, 28],
      I: [29, 32],
    };
    let scanSec = '';
    let classicAnchorHits = 0;
    let shiftedDetected = false;
    for (const r of logicalRows) {
      const sn = r.sNo.toUpperCase();
      const nc = normalizeZomatoParticularLabel(r.particulars);
      if (/^[A-J]$/.test(sn)) {
        scanSec = sn;
        // Detect shifted section letters (e.g. newer Zomato A..I template where B=Service fees, F=Hyperpure, I=Net Payout)
        if (sn === 'B' && /service\s*fees/i.test(nc)) shiftedDetected = true;
        if (sn === 'C' && /government\s*charges/i.test(nc)) shiftedDetected = true;
        if (sn === 'D' && /other\s*order[\s-]*level/i.test(nc)) shiftedDetected = true;
        if (sn === 'E' && /investment\s*in\s*growth/i.test(nc)) shiftedDetected = true;
        if (sn === 'F' && /hyperpure/i.test(nc)) shiftedDetected = true;
        if (sn === 'G' && /other\s*deductions/i.test(nc)) shiftedDetected = true;
        if (sn === 'H' && /total\s*additions/i.test(nc)) shiftedDetected = true;
        if (sn === 'I' && /net\s*payout/i.test(nc)) shiftedDetected = true;
        continue;
      }
      if (!sn || !/^\d+$/.test(sn)) continue;
      const num = parseInt(sn, 10);
      if (scanSec && classicSectionRanges[scanSec]) {
        const [minS, maxS] = classicSectionRanges[scanSec];
        if (num < minS || num > maxS) shiftedDetected = true;
      }
      if (/^subtotal|items?\s*total/i.test(nc)) {
        if (sn === '1') classicAnchorHits++;
        else shiftedDetected = true;
      }
      if (/gst\s*collected\s*from\s*customers|^customer\s*gst/i.test(nc)) {
        if (sn === '8') classicAnchorHits++;
        else shiftedDetected = true;
      }
      if (/^base\s*service\s*fee$/i.test(nc)) {
        if (sn === '12') classicAnchorHits++;
        else shiftedDetected = true;
      }
      if (/^taxes\s*on\s*service\s*fee/i.test(nc)) {
        if (sn === '17') classicAnchorHits++;
        else shiftedDetected = true;
      }
      if (/^total\s*hyperpure$/i.test(nc)) {
        if (sn === '27') classicAnchorHits++;
        else shiftedDetected = true;
      }
    }
    const hasShiftedSNo = shiftedDetected;
    const isExactClassicLayout =
      classicAnchorHits >= 2 && !hasShiftedSNo && !sheetUsesNegativeDeductions;

    // 4. Semantic-First Universal Canonical Row Adapter (Maps ALL Zomato templates -> Canonical A..J, 1..32)
    const rawSheetRows: ZomatoBreakupRowItem[] = [];
    const normalizedMappingsApplied: ZomatoNormalizedMappingTrace[] = [];
    const populatedCountByField: Partial<Record<CanonicalLeafField, number>> = {};

    const recordLeaf = (
      field: CanonicalLeafField,
      val: ZomatoTriplet,
      item: LogicalBreakupRow,
      isSignedField = false
    ): string => {
      const nextVal = isSignedField ? signedTriplet(val) : absTriplet(val);
      const prevCount = populatedCountByField[field] || 0;
      draft[field] = prevCount === 0 ? nextVal : addTriplets(draft[field], nextVal);
      populatedCountByField[field] = prevCount + 1;

      const expectedSNo = CANONICAL_STANDARD_SNO[field];
      const itemSNo = item.sNo.toUpperCase();
      if (
        prevCount > 0 ||
        (expectedSNo && itemSNo && itemSNo !== expectedSNo) ||
        sheetUsesNegativeDeductions
      ) {
        normalizedMappingsApplied.push({
          sourceSNo: item.sNo || undefined,
          sourceLabel: item.particulars,
          canonicalTarget: field,
          totalAmount: nextVal.total,
        });
      }
      return field;
    };

    let activeSection:
      | 'top'
      | 'A'
      | 'B'
      | 'C'
      | 'D'
      | 'E'
      | 'F'
      | 'G'
      | 'H'
      | 'I'
      | 'J'
      | 'settlement' = 'top';

    for (const item of logicalRows) {
      const sNoUpper = item.sNo.toUpperCase();
      const normClean = normalizeZomatoParticularLabel(item.particulars);

      if (/^settlement\s*breakdown$/i.test(normClean)) {
        activeSection = 'settlement';
        continue;
      }

      if (!item.hasValues) {
        if (/^net\s*order\s*value$/i.test(normClean) || (!normClean && isExactClassicLayout && sNoUpper === 'A')) activeSection = 'A';
        else if (/^(total\s*)?commissionable\s*(value|amount)$/i.test(normClean) || (!normClean && isExactClassicLayout && sNoUpper === 'B')) activeSection = 'B';
        else if ((/^service\s*fees/i.test(normClean) && !normClean.startsWith('taxes')) || (!normClean && isExactClassicLayout && sNoUpper === 'C')) activeSection = 'C';
        else if (/^government\s*charges$/i.test(normClean) || (!normClean && isExactClassicLayout && sNoUpper === 'D')) activeSection = 'D';
        else if (/^other\s*order[\s-]*level\s*deductions?$/i.test(normClean) || (!normClean && isExactClassicLayout && sNoUpper === 'E')) activeSection = 'E';
        else if (/^investment\s*in\s*growth/i.test(normClean) || (!normClean && isExactClassicLayout && sNoUpper === 'F')) activeSection = 'F';
        else if (/^investment\s*in\s*hyperpure/i.test(normClean) || (!normClean && isExactClassicLayout && sNoUpper === 'G')) activeSection = 'G';
        else if (/^other\s*deductions$/i.test(normClean) || (!normClean && isExactClassicLayout && sNoUpper === 'H')) activeSection = 'H';
        else if (/^total\s*additions$/i.test(normClean) || (!normClean && isExactClassicLayout && sNoUpper === 'I')) activeSection = 'I';
        else if (/^net\s*payout$/i.test(normClean) || (!normClean && isExactClassicLayout && sNoUpper === 'J')) activeSection = 'J';
        continue;
      }

      // Ignore non-financial metadata rows (Res ID, GSTIN, Bank A/C, UTR)
      if (
        /\b(restaurant\s*id|res\.?\s*id|partner\s*id|store\s*id|gstin|pan\b|bank\s*account|account\s*no|ifsc|utr|cin|pincode|phone|invoice\s*no)\b/i.test(
          normClean
        )
      ) {
        if (
          /restaurant\s*id|res\.?\s*id/i.test(normClean) &&
          !draft.resId &&
          item.triplet.total > 10000
        ) {
          draft.resId = String(Math.round(item.triplet.total));
        }
        continue;
      }

      const tAbs = absTriplet(item.triplet);
      const tSigned = signedTriplet(item.triplet);
      // In signed Zomato summary sheets where deductions are negative (-), flip deduction-section signed items so + = deduction
      const tDeductionSigned = sheetUsesNegativeDeductions
        ? combineTriplets([{ sign: -1, t: tSigned }])
        : tSigned;

      let mappedField = 'unmapped';

      // --- 1. TOP: Number of orders ---
      if (
        /\b(number\s*of\s*orders?|no\.?\s*of\s*orders?|(?:total\s*|delivered\s*)?orders?\s*count)\b/i.test(
          normClean
        ) ||
        /^(total\s*|delivered\s*)?orders$/i.test(normClean)
      ) {
        const del = Math.round(
          Math.abs(item.delHasNum ? item.triplet.delivered : item.triplet.total)
        );
        const can = Math.round(Math.abs(item.canHasNum ? item.triplet.cancelled : 0));
        const tot = Math.round(Math.abs(item.totHasNum ? item.triplet.total : del + can));
        draft.ordersCount = { delivered: del, cancelled: can, total: tot };
        mappedField = 'ordersCount';
      }

      // --- 2. SETTLEMENT BREAKDOWN (below Net Payout) ---
      else if (
        /^amount\s*settled$/i.test(normClean) ||
        /\b(settled\s*amount|bank\s*transfer\s*amount|net\s*amount\s*settled|amount\s*transferred)\b/i.test(
          normClean
        )
      ) {
        draft.settlementAmountSettled = tSigned;
        activeSection = 'settlement';
        mappedField = 'settlementAmountSettled';
      } else if (
        /\b(pending\s*amount|credited\s*on\s*next\s*payout|holdback\s*amount|closing\s*pending\s*balance)\b/i.test(
          normClean
        )
      ) {
        draft.settlementPendingAmount = tSigned;
        activeSection = 'settlement';
        mappedField = 'settlementPendingAmount';
      }

      // --- 3. SECTION HEADERS / TOTALS (100% Semantic-First so A..I vs A..J templates NEVER collide!) ---
      else if (
        /^(net\s*order\s*value|customer\s*payable|total\s*order\s*value|order\s*value\s*\(net\))$/i.test(
          normClean
        ) ||
        (!normClean && isExactClassicLayout && sNoUpper === 'A')
      ) {
        draft.reportedSectionA = tSigned;
        activeSection = 'A';
        mappedField = 'sectionA_netOrderValue';
      } else if (
        (/^(total\s*)?commissionable\s*(value|amount)$/i.test(normClean) &&
          !/\bof\s*(subtotal|pack|total\s*gst|gst)\b/i.test(normClean)) ||
        (!normClean && isExactClassicLayout && sNoUpper === 'B')
      ) {
        draft.reportedSectionB = tAbs;
        activeSection = 'B';
        if (sNoUpper && sNoUpper !== 'B') {
          normalizedMappingsApplied.push({
            sourceSNo: item.sNo || undefined,
            sourceLabel: item.particulars,
            canonicalTarget: 'sectionB_totalCommissionableValue',
            totalAmount: tAbs.total,
          });
        }
        mappedField = 'sectionB_totalCommissionableValue';
      } else if (
        (/^(service\s*fees?\s*&\s*payment\s*mechanism\s*fees?|total\s*zomato\s*fees?|platform\s*(service\s*)?&\s*(payment|gateway)\s*fees?)$/i.test(
          normClean
        ) &&
          !normClean.startsWith('taxes')) ||
        (!normClean && isExactClassicLayout && sNoUpper === 'C')
      ) {
        draft.reportedSectionC = tAbs;
        activeSection = 'C';
        mappedField = 'sectionC_serviceAndPaymentFees';
      } else if (
        /^(total\s*)?(government\s*charges(\s*&\s*taxes)?|statutory\s*taxes?\s*&\s*(charges|levies))$/i.test(
          normClean
        ) ||
        (!normClean && isExactClassicLayout && sNoUpper === 'D')
      ) {
        draft.reportedSectionD = tAbs;
        activeSection = 'D';
        mappedField = 'sectionD_governmentCharges';
      } else if (
        (/^other\s*order[\s-]*level\s*deductions?$/i.test(normClean) &&
          !/^\d+$/.test(sNoUpper) &&
          activeSection !== 'E' &&
          !draft.reportedSectionE) ||
        (!normClean && isExactClassicLayout && sNoUpper === 'E')
      ) {
        draft.reportedSectionE = tDeductionSigned;
        activeSection = 'E';
        mappedField = 'sectionE_otherOrderLevelDeductions';
      } else if (
        /^(investment\s*in\s*growth\s*services|growth\s*&\s*marketing\s*(services|spend)|ads\s*&\s*growth\s*services)$/i.test(
          normClean
        ) ||
        (!normClean && isExactClassicLayout && sNoUpper === 'F')
      ) {
        draft.reportedSectionF = tAbs;
        activeSection = 'F';
        mappedField = 'sectionF_investmentInGrowthServices';
      } else if (
        /^(investment\s*in\s*hyperpure|hyperpure\s*(b2b\s*)?supply\s*offset)$/i.test(normClean) ||
        (!normClean && isExactClassicLayout && sNoUpper === 'G')
      ) {
        draft.reportedSectionG = tAbs;
        activeSection = 'G';
        mappedField = 'sectionG_investmentInHyperpure';
      } else if (
        (/^(other\s*deductions|res\s*id\s*level\s*deductions)$/i.test(normClean) &&
          activeSection !== 'E') ||
        (!normClean && isExactClassicLayout && sNoUpper === 'H')
      ) {
        draft.reportedSectionH = tAbs;
        activeSection = 'H';
        mappedField = 'sectionH_otherDeductions';
      } else if (
        /^(total\s*additions|other\s*additions|additions\s*&\s*rebates)$/i.test(normClean) ||
        (!normClean && isExactClassicLayout && sNoUpper === 'I')
      ) {
        draft.reportedSectionI = tAbs;
        activeSection = 'I';
        mappedField = 'sectionI_totalAdditions';
      } else if (
        /^(net\s*payout|total\s*net\s*payout|final\s*net\s*payout|net\s*settlement|net\s*payable(\s*to\s*restaurant)?)$/i.test(
          normClean
        ) ||
        (!normClean && isExactClassicLayout && sNoUpper === 'J')
      ) {
        draft.reportedSectionJ = tSigned;
        draft.hasExplicitReportedJ = true;
        draft.reportedNetPayout = tSigned.total;
        activeSection = 'J';
        mappedField = 'sectionJ_netPayout';
      }

      // --- 4. SEMANTIC LEAF ROW MATCHERS (Independent of S.no shifts!) ---
      // Section B leaf rows (check BEFORE Section A subtotal/packaging/gst!)
      else if (/commissionable\s*(value|amount)\s*of\s*subtotal|^commissionable\s*subtotal/i.test(normClean)) {
        activeSection = 'B';
        mappedField = recordLeaf('row9_commissionableSubtotal', tAbs, item);
      } else if (/commissionable\s*(value|amount)\s*of\s*pack|^commissionable\s*packaging/i.test(normClean)) {
        activeSection = 'B';
        mappedField = recordLeaf('row10_commissionablePackaging', tAbs, item);
      } else if (/commissionable\s*(value|amount)\s*of.*gst|^commissionable\s*gst/i.test(normClean)) {
        activeSection = 'B';
        mappedField = recordLeaf('row11_commissionableGst', tAbs, item);
      }

      // Section A leaf rows (1..8)
      else if (/\bsubtotal\b|\bitems?\s*total\b|^gross\s*food\s*sales$|^food\s*subtotal$/i.test(normClean)) {
        activeSection = 'A';
        mappedField = recordLeaf('row1_subtotal', tAbs, item);
      } else if (
        /^packaging\s*charges?$/i.test(normClean) ||
        /\b(restaurant|merchant|order)\s*packaging\s*charges?\b/i.test(normClean)
      ) {
        activeSection = 'A';
        mappedField = recordLeaf('row2_packagingCharge', tAbs, item);
      } else if (/brand\s*pack\s*subscription\s*fee|membership\s*subscription\s*fee/i.test(normClean)) {
        activeSection = 'A';
        mappedField = recordLeaf('row6_brandPackSubscriptionFee', tAbs, item);
      } else if (
        /delivery\s*(charge|fee)\s*discount|relisting\s*discount|free\s*delivery\s*discount/i.test(
          normClean
        )
      ) {
        activeSection = 'A';
        mappedField = recordLeaf('row7_deliveryRelistingDiscount', tAbs, item);
      } else if (
        (/delivery\s*(charge|fee).*self\s*logistics|self\s*logistics\s*delivery|^delivery\s*charges?$/i.test(
          normClean
        ) &&
          !normClean.includes('recovery') &&
          !normClean.includes('discount') &&
          !normClean.includes('enablement'))
      ) {
        activeSection = 'A';
        mappedField = recordLeaf('row3_selfLogisticsDeliveryCharge', tAbs, item);
      } else if (
        (!/recovery|reversal/i.test(normClean) &&
          ((/restaurant\s*discount/i.test(normClean) && /\bpromo\b/i.test(normClean)) ||
            /\b(promo|coupon)\b.*\bdiscount\b/i.test(normClean) ||
            /^(promo\s*discount|merchant\s*promo(\s*discount)?)$/i.test(normClean)))
      ) {
        activeSection = 'A';
        mappedField = recordLeaf('row4_promoDiscount', tAbs, item);
      } else if (
        (/restaurant\s*discount/i.test(normClean) && !/\bpromo\b/i.test(normClean)) ||
        /\b(bogo|freebies?|gold.*discount|salt\s*discount|flat\s*offs?|zomato\s*gold\s*promo)\b/i.test(
          normClean
        )
      ) {
        activeSection = 'A';
        mappedField = recordLeaf('row5_bogoFreebiesGoldDiscount', tAbs, item);
      } else if (
        /gst\s*collected\s*from\s*customers|^customer\s*gst|taxes?\s*collected\s*from\s*customers|^gst\s*on\s*order$/i.test(
          normClean
        )
      ) {
        activeSection = 'A';
        mappedField = recordLeaf('row8_customerGstCollected', tAbs, item);
      }

      // Section D (17..20) & Section I (31, 32) — check BEFORE generic Section C service fee!
      else if (
        /taxes?\s*on\s*(service|zomato|platform|payment).*fee|gst\s*on\s*(service|zomato|platform).*fee|^(cgst|sgst|igst)\b.*(service|fee)/i.test(
          normClean
        )
      ) {
        activeSection = 'D';
        mappedField = recordLeaf('row17_taxesOnServiceFee', tAbs, item);
      } else if (/tax\s*collected\s*at\s*source|\btcs\b/i.test(normClean)) {
        activeSection = 'D';
        mappedField = recordLeaf('row18_tcsAndIgst', tAbs, item);
      } else if (/\b194\s*-?\s*h\b|res\s*id\s*level\s*additions/i.test(normClean)) {
        activeSection = 'I';
        mappedField = recordLeaf('row31_tds194HAndResIdAdditions', tAbs, item);
      } else if (/\b194\s*-?\s*o\b|\btds\b/i.test(normClean)) {
        activeSection = 'D';
        mappedField = recordLeaf('row19_tds194O', tAbs, item);
      } else if (/section\s*9\s*\(\s*5\s*\)|gst\s*paid\s*by\s*(zomato|eternal)|eco(mmerce)?\s*gst/i.test(normClean)) {
        activeSection = 'D';
        mappedField = recordLeaf('row20_gstSection9_5', tAbs, item);
      } else if (/service\s*fees?\s*rebate|commission\s*rebate|incentive\s*rebate/i.test(normClean)) {
        activeSection = 'I';
        mappedField = recordLeaf('row32_serviceFeesRebate', tAbs, item);
      }

      // Section C leaf rows (12..16) — includes newer Zomato "Fulfilment fee" & "Discount due to 30% service fee capping"
      else if (
        /discount\s*(on|due\s*to)\s*(long\s*distance|fulfil+ment)|(long\s*distance|fulfil+ment).*(waiver|discount|rebate)/i.test(
          normClean
        )
      ) {
        activeSection = 'C';
        mappedField = recordLeaf('row14_longDistanceDiscount', tAbs, item);
      } else if (
        /long\s*distance\s*(enablement\s*)?(fees?|charges?)|fulfil+ment\s*(enablement\s*)?(fees?|charges?)|logistics\s*(enablement\s*)?(fees?|charges?)|intercity\s*(fees?|charges?)/i.test(
          normClean
        )
      ) {
        activeSection = 'C';
        mappedField = recordLeaf('row13_longDistanceFee', tAbs, item);
      } else if (
        /discount\s*(on|due\s*to).*service\s*fees?|30%.*capping|service\s*fees?.*capping|service\s*fees?\s*(waiver|discount)/i.test(
          normClean
        )
      ) {
        activeSection = 'C';
        mappedField = recordLeaf('row15_serviceFeeCapDiscount', tAbs, item);
      } else if (
        /payment\s*(mechanism|gateway|collection|processing)\s*(fees?|charges?)|convenience\s*settlement\s*(fees?|charges?)/i.test(
          normClean
        )
      ) {
        activeSection = 'C';
        mappedField = recordLeaf('row16_paymentMechanismFee', tAbs, item);
      } else if (
        /^(base\s*service\s*fees?|(?:zomato|eternal|platform)\s*(?:service|commission)\s*fees?|service\s*fees?|(?:zomato|eternal|platform)\s*commission|commission(\s*fees?)?)$/i.test(
          normClean
        )
      ) {
        activeSection = 'C';
        mappedField = recordLeaf('row12_baseServiceFee', tAbs, item);
      }

      // Section E leaf rows (21 + 8 sub-items, 22, 23)
      else if (/^other\s*order[\s-]*level\s*deductions?$/i.test(normClean)) {
        activeSection = 'E';
        draft.reportedRow21 = tAbs;
        draft.row21_otherOrderLevelDeductions = tAbs;
        mappedField = 'row21_otherOrderLevelDeductions';
      } else if (/customer\s*compensation|recoupment|customer\s*(refund|complaint)/i.test(normClean)) {
        activeSection = 'E';
        mappedField = recordLeaf('row21a_customerCompensation', tAbs, item);
      } else if (/rejection\s*penalty|merchant\s*(cancellation|rejection)\s*(penalty|charge|fee)/i.test(normClean)) {
        activeSection = 'E';
        mappedField = recordLeaf('row21b_rejectionPenalty', tAbs, item);
      } else if (/delivery\s*charges?\s*recovery/i.test(normClean)) {
        activeSection = 'E';
        mappedField = recordLeaf('row21c_deliveryChargesRecovery', tAbs, item);
      } else if (/credit\s*note.*debit\s*note|debit\s*note\s*adjustment/i.test(normClean)) {
        activeSection = 'E';
        mappedField = recordLeaf('row21d_creditDebitNoteAdjustment', tDeductionSigned, item, true);
      } else if (/promo\s*recovery\s*adjustment/i.test(normClean)) {
        activeSection = 'E';
        mappedField = recordLeaf('row21e_promoRecoveryAdjustment', tAbs, item);
      } else if (/extra\s*inventory\s*ads/i.test(normClean)) {
        activeSection = 'E';
        mappedField = recordLeaf('row21f_extraInventoryAds', tAbs, item);
      } else if (/brand\s*loyalty\s*points|loyalty\s*points\s*redemption/i.test(normClean)) {
        activeSection = 'E';
        mappedField = recordLeaf('row21g_brandLoyaltyPointsRedemption', tAbs, item);
      } else if (
        /^(express\s*order\s*fee|priority\s*order\s*fee|vip\s*order\s*fee)$/i.test(normClean)
      ) {
        activeSection = 'E';
        mappedField = recordLeaf('row21h_expressOrderFee', tAbs, item);
      } else if (/amount\s*received\s*in\s*cash|cash\s*collected.*self\s*delivery|\bcod\s*cash\b/i.test(normClean)) {
        activeSection = 'E';
        mappedField = recordLeaf('row22_cashReceivedSelfDelivery', tAbs, item);
      } else if (
        /adjustments?\s*from\s*previous\s*(weeks?|cycles?|months?)|previous\s*(week|cycle)\s*(carry\s*forward|adjustment)|arrears/i.test(
          normClean
        )
      ) {
        activeSection = 'E';
        mappedField = recordLeaf('row23_previousWeeksAdjustments', tDeductionSigned, item, true);
      }

      // Section H row 28 (check BEFORE generic express/ads!)
      else if (/express\s*order\s*discount\s*reversal/i.test(normClean)) {
        activeSection = 'H';
        mappedField = recordLeaf('row28_expressOrderDiscountReversal', tAbs, item);
      }

      // Section F leaf rows (24, 25, 26)
      else if (/total\s*dining\s*ads|\bdining\s*ads\b|\bdistrict\s*ads\b/i.test(normClean)) {
        activeSection = 'F';
        mappedField = recordLeaf('row25_totalDiningAdsIncGst', tAbs, item);
      } else if (
        /^total\s*ads\b|\b(zomato|cpc|search|banner|sponsored|spotlight)\b.*\bads\b/i.test(
          normClean
        )
      ) {
        activeSection = 'F';
        mappedField = recordLeaf('row24_totalAdsIncGst', tAbs, item);
      } else if (
        /miscellaneous\s*services|catalog(ue|ing)|photoshoot|hygiene\s*audit|packaging\s*marketplace/i.test(
          normClean
        )
      ) {
        activeSection = 'F';
        mappedField = recordLeaf('row26_miscellaneousServices', tAbs, item);
      }

      // Section G leaf row (27)
      else if (/\btotal\s*hyperpure\b|\bhyperpure\b/i.test(normClean)) {
        activeSection = 'G';
        mappedField = recordLeaf('row27_totalHyperpure', tAbs, item);
      }

      // Section I leaf rows (29, 30)
      else if (/cancellation\s*refund|payout\s*for\s*cancelled/i.test(normClean)) {
        activeSection = 'I';
        mappedField = recordLeaf('row29_cancellationRefund', tAbs, item);
      } else if (/tip\s*for\s*kitchen\s*staff|\bkitchen\s*tip\b|\bstaff\s*tip\b/i.test(normClean)) {
        activeSection = 'I';
        mappedField = recordLeaf('row30_kitchenStaffTip', tAbs, item);
      }

      // --- 5. EXACT CLASSIC S.NO FALLBACK (ONLY if sheet is verified non-shifted classic 1..32, within section bounds, AND text was unrecognized) ---
      else if (isExactClassicLayout && sNoUpper && /^\d+$/.test(sNoUpper)) {
        const sNum = parseInt(sNoUpper, 10);
        const secRange = classicSectionRanges[activeSection];
        const withinActiveSec = !secRange || (sNum >= secRange[0] && sNum <= secRange[1]);
        const classicBySNo = withinActiveSec
          ? (Object.entries(CANONICAL_STANDARD_SNO) as Array<[CanonicalLeafField, string]>).find(
              ([, num]) => num === sNoUpper
            )
          : undefined;
        if (classicBySNo) {
          const [targetField] = classicBySNo;
          const isSignedTarget = targetField === 'row23_previousWeeksAdjustments';
          mappedField = recordLeaf(
            targetField,
            isSignedTarget ? tDeductionSigned : tAbs,
            item,
            isSignedTarget
          );
        }
      }

      // --- 6. SECTION-AWARE ADAPTER FOR NEWER / UNSEEN FUTURE ZOMATO TEMPLATE ROWS ---
      if (mappedField === 'unmapped' && Math.abs(item.triplet.total) >= 0.01) {
        if (activeSection === 'A') {
          const looksLikeDiscount =
            /\b(discount|promo|off|waiver|subsidy|cashback|voucher)\b/i.test(normClean) ||
            item.triplet.total < 0;
          mappedField = looksLikeDiscount
            ? recordLeaf('row5_bogoFreebiesGoldDiscount', tAbs, item)
            : recordLeaf('row6_brandPackSubscriptionFee', tAbs, item);
        } else if (activeSection === 'B') {
          mappedField = recordLeaf('row9_commissionableSubtotal', tAbs, item);
        } else if (activeSection === 'C') {
          const looksLikeFeeDiscount = /\b(discount|waiver|rebate|cap|credit)\b/i.test(normClean);
          mappedField = looksLikeFeeDiscount
            ? recordLeaf('row15_serviceFeeCapDiscount', tAbs, item)
            : recordLeaf('row13_longDistanceFee', tAbs, item);
        } else if (activeSection === 'D') {
          mappedField = recordLeaf('row17_taxesOnServiceFee', tAbs, item);
        } else if (activeSection === 'E') {
          mappedField = recordLeaf(
            'row21d_creditDebitNoteAdjustment',
            tDeductionSigned,
            item,
            true
          );
        } else if (activeSection === 'F') {
          mappedField = recordLeaf('row26_miscellaneousServices', tAbs, item);
        } else if (activeSection === 'G') {
          mappedField = recordLeaf('row27_totalHyperpure', tAbs, item);
        } else if (activeSection === 'I') {
          draft.extraAdditions.push({
            id: `zomato-add-extra-${draft.extraAdditions.length + 1}`,
            sNo: item.sNo || undefined,
            label: item.particulars,
            values: tAbs,
          });
          normalizedMappingsApplied.push({
            sourceSNo: item.sNo || undefined,
            sourceLabel: item.particulars,
            canonicalTarget: 'extraAdditions (Section I)',
            totalAmount: tAbs.total,
          });
          mappedField = 'extraAddition';
        } else if (
          activeSection === 'H' ||
          /\b(deduction|fee|charge|penalty|recovery|emi|loan|rental)\b/i.test(normClean)
        ) {
          draft.extraOtherDeductions.push({
            id: `zomato-ded-extra-${draft.extraOtherDeductions.length + 1}`,
            sNo: item.sNo || undefined,
            label: item.particulars,
            values: tAbs,
          });
          normalizedMappingsApplied.push({
            sourceSNo: item.sNo || undefined,
            sourceLabel: item.particulars,
            canonicalTarget: 'extraOtherDeductions (Section H)',
            totalAmount: tAbs.total,
          });
          mappedField = 'extraDeduction';
        } else if (/\b(addition|credit|rebate|incentive|refund|bonus)\b/i.test(normClean)) {
          draft.extraAdditions.push({
            id: `zomato-add-extra-${draft.extraAdditions.length + 1}`,
            sNo: item.sNo || undefined,
            label: item.particulars,
            values: tAbs,
          });
          normalizedMappingsApplied.push({
            sourceSNo: item.sNo || undefined,
            sourceLabel: item.particulars,
            canonicalTarget: 'extraAdditions (Section I)',
            totalAmount: tAbs.total,
          });
          mappedField = 'extraAddition';
        }
      }

      rawSheetRows.push({
        id: `pb-row-${item.rowNumber}`,
        sNo: item.sNo || undefined,
        particulars: item.particulars,
        deliveredValue: item.triplet.delivered,
        cancelledValue: item.triplet.cancelled,
        totalValue: item.triplet.total,
        mappedField,
      });
    }

    // 7. Compact Section Backfill: If a newer/compact Zomato template reported a Section Header / single-row amount
    //    (e.g. Row 9 = Commissionable value ₹55,635.24, F = Investment in Hyperpure ₹6,895.35) WITHOUT separate child sub-rows,
    //    backfill the canonical older model's child slots cleanly!
    if (draft.reportedSectionA && !isZeroTriplet(draft.reportedSectionA) && isZeroTriplet(draft.row1_subtotal)) {
      draft.row1_subtotal = absTriplet(draft.reportedSectionA);
    }
    if (
      draft.reportedSectionB &&
      !isZeroTriplet(draft.reportedSectionB) &&
      isZeroTriplet(draft.row9_commissionableSubtotal) &&
      isZeroTriplet(draft.row10_commissionablePackaging) &&
      isZeroTriplet(draft.row11_commissionableGst)
    ) {
      const subExclDisc = combineTriplets([
        { sign: 1, t: draft.row1_subtotal },
        { sign: -1, t: draft.row4_promoDiscount },
        { sign: -1, t: draft.row5_bogoFreebiesGoldDiscount },
      ]);
      const pkg = absTriplet(draft.row2_packagingCharge);
      if (
        pkg.total > 0 &&
        Math.abs(subExclDisc.total + pkg.total - draft.reportedSectionB.total) <= 1.0
      ) {
        draft.row10_commissionablePackaging = pkg;
        draft.row9_commissionableSubtotal = absTriplet(
          combineTriplets([
            { sign: 1, t: draft.reportedSectionB },
            { sign: -1, t: pkg },
          ])
        );
      } else {
        draft.row9_commissionableSubtotal = absTriplet(draft.reportedSectionB);
      }
    }
    if (
      draft.reportedSectionC &&
      !isZeroTriplet(draft.reportedSectionC) &&
      isZeroTriplet(draft.row12_baseServiceFee) &&
      isZeroTriplet(draft.row13_longDistanceFee) &&
      isZeroTriplet(draft.row16_paymentMechanismFee)
    ) {
      draft.row12_baseServiceFee = absTriplet(draft.reportedSectionC);
    }
    if (
      draft.reportedSectionD &&
      !isZeroTriplet(draft.reportedSectionD) &&
      isZeroTriplet(draft.row17_taxesOnServiceFee) &&
      isZeroTriplet(draft.row18_tcsAndIgst) &&
      isZeroTriplet(draft.row19_tds194O) &&
      isZeroTriplet(draft.row20_gstSection9_5)
    ) {
      draft.row17_taxesOnServiceFee = absTriplet(draft.reportedSectionD);
    }
    if (
      draft.reportedSectionE &&
      !isZeroTriplet(draft.reportedSectionE) &&
      isZeroTriplet(draft.row21a_customerCompensation) &&
      isZeroTriplet(draft.row21b_rejectionPenalty) &&
      isZeroTriplet(draft.row21c_deliveryChargesRecovery) &&
      isZeroTriplet(draft.row21d_creditDebitNoteAdjustment) &&
      isZeroTriplet(draft.row21e_promoRecoveryAdjustment) &&
      isZeroTriplet(draft.row21f_extraInventoryAds) &&
      isZeroTriplet(draft.row21g_brandLoyaltyPointsRedemption) &&
      isZeroTriplet(draft.row21h_expressOrderFee) &&
      isZeroTriplet(draft.row22_cashReceivedSelfDelivery) &&
      isZeroTriplet(draft.row23_previousWeeksAdjustments)
    ) {
      draft.reportedRow21 = absTriplet(draft.reportedSectionE);
      draft.row21_otherOrderLevelDeductions = absTriplet(draft.reportedSectionE);
    }
    if (
      draft.reportedSectionF &&
      !isZeroTriplet(draft.reportedSectionF) &&
      isZeroTriplet(draft.row24_totalAdsIncGst) &&
      isZeroTriplet(draft.row25_totalDiningAdsIncGst) &&
      isZeroTriplet(draft.row26_miscellaneousServices)
    ) {
      draft.row24_totalAdsIncGst = absTriplet(draft.reportedSectionF);
    }
    if (
      draft.reportedSectionG &&
      !isZeroTriplet(draft.reportedSectionG) &&
      isZeroTriplet(draft.row27_totalHyperpure)
    ) {
      draft.row27_totalHyperpure = absTriplet(draft.reportedSectionG);
    }
    if (
      draft.reportedSectionH &&
      !isZeroTriplet(draft.reportedSectionH) &&
      isZeroTriplet(draft.row28_expressOrderDiscountReversal) &&
      draft.extraOtherDeductions.length === 0
    ) {
      draft.extraOtherDeductions.push({
        id: 'zomato-ded-sec-h-summary',
        label: 'Other Deductions (Summary)',
        values: absTriplet(draft.reportedSectionH),
      });
    }
    if (
      draft.reportedSectionI &&
      !isZeroTriplet(draft.reportedSectionI) &&
      isZeroTriplet(draft.row29_cancellationRefund) &&
      isZeroTriplet(draft.row30_kitchenStaffTip) &&
      isZeroTriplet(draft.row31_tds194HAndResIdAdditions) &&
      isZeroTriplet(draft.row32_serviceFeesRebate) &&
      draft.extraAdditions.length === 0
    ) {
      draft.extraAdditions.push({
        id: 'zomato-add-sec-i-summary',
        label: 'Additions & Credits (Summary)',
        values: absTriplet(draft.reportedSectionI),
      });
    }

    draft.rawSheetRows = rawSheetRows;
    draft.normalizedMappingsApplied = normalizedMappingsApplied;

    if (sheetUsesNegativeDeductions) {
      draft.detectedSourceTemplate = 'signed_summary_ledger';
      draft.detectedSourceTemplateLabel = 'Signed Zomato Ledger → Normalized to Canonical A–J';
    } else if (hasShiftedSNo || normalizedMappingsApplied.length > 0) {
      draft.detectedSourceTemplate = 'shifted_or_extended_breakup';
      draft.detectedSourceTemplateLabel = `Newer / Extended Zomato Template → Mapped to Canonical A–J (${normalizedMappingsApplied.length} adapted)`;
    } else {
      draft.detectedSourceTemplate = 'classic_breakup_a_j';
      draft.detectedSourceTemplateLabel = 'Canonical Zomato Payout Breakup (A–J · 1–32)';
    }
  }

  // Re-check Restaurant ID mapping if discovered inside sheet
  if (!matchedMapping && draft.resId) {
    matchedMapping = detectAggregatorMappingFromText(draft.resId, mappings, 'zomato');
  }

  const lowerCombinedMeta = `${file.name} ${breakupTextSample}`.toLowerCase();
  const resolvedOutlet: 'banaswadi' | 'whitefield' =
    matchedMapping?.outletId ||
    (lowerCombinedMeta.includes('whitefield') || lowerCombinedMeta.includes('-w')
      ? 'whitefield'
      : 'banaswadi');

  const resolvedBrand =
    matchedMapping?.brandName ||
    (lowerCombinedMeta.includes('niraamish')
      ? 'Niraamish'
      : lowerCombinedMeta.includes('banglar')
      ? 'Banglar Jhale Jhole'
      : 'Zomato Account');

  const resolvedResId = matchedMapping?.restaurantId || draft.resId || candidateResId;

  draft.resId = resolvedResId;
  draft.brandName = resolvedBrand;
  draft.outletLocation = resolvedOutlet;

  const syncToCalculated = !draft.hasExplicitReportedJ;
  const finalizedModel = recalculateZomatoBreakupModel(draft, syncToCalculated, {
    alignSubCentWithReported: true,
  });

  const baseRecord: PlatformPayoutRecord = {
    id: `PAYOUT-ZOMATO-${resolvedResId || resolvedOutlet.toUpperCase()}-${periodInfo.month}-${Date.now()}`,
    outletId: resolvedOutlet,
    month: periodInfo.month,
    platform: 'zomato',
    accountId: resolvedResId,
    accountName: resolvedBrand,
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
    actualBankSettlement: finalizedModel.reportedNetPayout,
    settlementDifference: 0,
    status: 'reconciled',
    periodType: effectivePeriodType,
    weekLabel: periodInfo.periodLabel,
    payoutStartDate: periodInfo.startDate,
    payoutEndDate: periodInfo.endDate,
    payoutDate: new Date().toISOString().slice(0, 10),
    sourceFileName: file.name,
    fileHash,
    zomatoBreakup: finalizedModel,
  };

  const payout = applyZomatoBreakupToPayoutRecord(
    baseRecord,
    finalizedModel,
    syncToCalculated,
    { alignSubCentWithReported: true }
  );

  return {
    payout,
    model: payout.zomatoBreakup!,
    matchedMapping,
    candidateRestaurantId: resolvedResId,
  };
}
