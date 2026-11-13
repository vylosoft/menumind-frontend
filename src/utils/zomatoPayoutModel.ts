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
  ZomatoPayoutBreakupModel,
  ZomatoTriplet,
} from '../types/finance';
import {
  detectAggregatorMappingFromText,
  extractCandidateRestaurantIdFromFilename,
} from './aggregatorMappingManager';

function round2(n: number): number {
  return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
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
  return s === '-' || s === '—' || s === '–';
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
  const isMinusPrefix = /^-\s*[₹$inr\s]*\d/i.test(raw) || /^[₹$inr\s]*-\s*\d/i.test(raw);
  const stripped = raw
    .replace(/inr|rs\.?/gi, '')
    .replace(/[₹$,\s()]/g, '');

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
 * Ensures ANY Zomato PlatformPayoutRecord (newly parsed, v1 legacy, or existing DB record)
 * is hydrated into the exact ZomatoPayoutBreakupModel v2 (Sections A-J, Rows 1-32).
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

  return createEmptyZomatoBreakupModel({
    sheetNameUsed: 'Payout Breakup',
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
    extraOtherDeductions: (record.otherChargesBreakdown || []).map((it) => ({
      id: it.id,
      label: it.label,
      values: makeTriplet(it.amount, 0, it.amount),
    })),
    hasExplicitReportedJ: true,
    reportedNetPayout: Number(record.actualBankSettlement ?? record.calculatedNetPayout) || 0,
    settlementAmountSettled: makeTriplet(Number(record.actualBankSettlement ?? record.calculatedNetPayout) || 0, 0),
  });
}

/**
 * Evaluates Zomato's exact Payout Breakup accounting formulas across Sections A -> J:
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
  syncReportedToCalculated = false
): ZomatoPayoutBreakupModel {
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

  const sectionA_netOrderValue = combineTriplets([
    { sign: 1, t: r1 },
    { sign: 1, t: r2 },
    { sign: 1, t: r3 },
    { sign: -1, t: r4 },
    { sign: -1, t: r5 },
    { sign: 1, t: r6 },
    { sign: -1, t: r7 },
    { sign: 1, t: r8 },
  ]);

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
  const sectionB_totalCommissionableValue = combineTriplets([
    { sign: 1, t: r9 },
    { sign: 1, t: r10 },
    { sign: 1, t: r11 },
  ]);

  // Section C: Service fees & payment mechanism fees ( 12 + 13 - 14 - 15 + 16 )
  const r12 = absTriplet(model.row12_baseServiceFee);
  const r13 = absTriplet(model.row13_longDistanceFee);
  const r14 = absTriplet(model.row14_longDistanceDiscount);
  const r15 = absTriplet(model.row15_serviceFeeCapDiscount);
  const r16 = absTriplet(model.row16_paymentMechanismFee);

  const sectionC_serviceAndPaymentFees = combineTriplets([
    { sign: 1, t: r12 },
    { sign: 1, t: r13 },
    { sign: -1, t: r14 },
    { sign: -1, t: r15 },
    { sign: 1, t: r16 },
  ]);

  // Section D: Government charges ( 17 + 18 + 19 + 20 )
  const r17 = absTriplet(model.row17_taxesOnServiceFee);
  const r18 = absTriplet(model.row18_tcsAndIgst);
  const r19 = absTriplet(model.row19_tds194O);
  const r20 = absTriplet(model.row20_gstSection9_5);

  const sectionD_governmentCharges = combineTriplets([
    { sign: 1, t: r17 },
    { sign: 1, t: r18 },
    { sign: 1, t: r19 },
    { sign: 1, t: r20 },
  ]);

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
    ? sub21Computed
    : absTriplet(model.reportedRow21 || model.row21_otherOrderLevelDeductions);

  const r22 = absTriplet(model.row22_cashReceivedSelfDelivery);
  const r23 = signedTriplet(model.row23_previousWeeksAdjustments);

  const sectionE_otherOrderLevelDeductions = combineTriplets([
    { sign: 1, t: r21 },
    { sign: 1, t: r22 },
    { sign: 1, t: r23 },
  ]);

  // Section F: Investment in growth services ( 24 + 25 + 26 )
  const r24 = absTriplet(model.row24_totalAdsIncGst);
  const r25 = absTriplet(model.row25_totalDiningAdsIncGst);
  const r26 = absTriplet(model.row26_miscellaneousServices);

  const sectionF_investmentInGrowthServices = combineTriplets([
    { sign: 1, t: r24 },
    { sign: 1, t: r25 },
    { sign: 1, t: r26 },
  ]);

  // Section G: Investment in Hyperpure ( 27 )
  const r27 = absTriplet(model.row27_totalHyperpure);
  const sectionG_investmentInHyperpure = { ...r27 };

  // Section H: Other Deductions ( 28 + extra )
  const r28 = absTriplet(model.row28_expressOrderDiscountReversal);
  const extraOtherDeductions: ZomatoExtraLineItem[] = (model.extraOtherDeductions || []).map(
    (it) => ({
      ...it,
      values: absTriplet(it.values),
    })
  );
  const sectionH_otherDeductions = combineTriplets([
    { sign: 1, t: r28 },
    ...extraOtherDeductions.map((it) => ({ sign: 1 as const, t: it.values })),
  ]);

  // Section I: Total Additions ( 29 + 30 + 31 + 32 + extra )
  const r29 = absTriplet(model.row29_cancellationRefund);
  const r30 = absTriplet(model.row30_kitchenStaffTip);
  const r31 = absTriplet(model.row31_tds194HAndResIdAdditions);
  const r32 = absTriplet(model.row32_serviceFeesRebate);
  const extraAdditions: ZomatoExtraLineItem[] = (model.extraAdditions || []).map((it) => ({
    ...it,
    values: absTriplet(it.values),
  }));
  const sectionI_totalAdditions = combineTriplets([
    { sign: 1, t: r29 },
    { sign: 1, t: r30 },
    { sign: 1, t: r31 },
    { sign: 1, t: r32 },
    ...extraAdditions.map((it) => ({ sign: 1 as const, t: it.values })),
  ]);

  // Section J: Net Payout ( A - C - D - E - F - G - H + I )
  const sectionJ_netPayout = combineTriplets([
    { sign: 1, t: sectionA_netOrderValue },
    { sign: -1, t: sectionC_serviceAndPaymentFees },
    { sign: -1, t: sectionD_governmentCharges },
    { sign: -1, t: sectionE_otherOrderLevelDeductions },
    { sign: -1, t: sectionF_investmentInGrowthServices },
    { sign: -1, t: sectionG_investmentInHyperpure },
    { sign: -1, t: sectionH_otherDeductions },
    { sign: 1, t: sectionI_totalAdditions },
  ]);

  const settlementAmountSettled = signedTriplet(model.settlementAmountSettled);
  const settlementPendingAmount = signedTriplet(model.settlementPendingAmount);

  const calculatedNetPayout = sectionJ_netPayout.total;
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
  syncActualToCalculated = false
): PlatformPayoutRecord {
  const m = recalculateZomatoBreakupModel(rawModel, syncActualToCalculated);

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

/**
 * Locates the exact "Payout Breakup" sheet name inside a Zomato workbook.
 */
export function findZomatoPayoutBreakupSheetName(sheetNames: string[]): string | null {
  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ')
      .replace(/\bbreak\s+up\b/g, 'breakup');

  const exact = sheetNames.find((n) => normalize(n) === 'payout breakup');
  if (exact) return exact;

  const containsPayoutBreakup = sheetNames.find((n) => normalize(n).includes('payout breakup'));
  if (containsPayoutBreakup) return containsPayoutBreakup;

  const containsBreakup = sheetNames.find((n) => {
    const norm = normalize(n);
    return norm.includes('breakup') && !norm.includes('order level') && !norm.includes('tax breakup');
  });
  if (containsBreakup) return containsBreakup;

  if (sheetNames.length === 1) return sheetNames[0];

  return null;
}

/**
 * Determines whether an uploaded workbook is a Zomato Payout report.
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
    (lowerSample.includes('payout period') && lowerSample.includes('tax deduction') && lowerSample.includes('net payout amount')) ||
    /\brn\d{5,10}\b/i.test(sampleText)
  ) {
    return false;
  }

  if (
    lowerSample.includes('zomato') ||
    lowerSample.includes('base service fee') ||
    lowerSample.includes('payment mechanism fee') ||
    lowerSample.includes('total commissionable value') ||
    lowerSample.includes('net order value')
  ) {
    return true;
  }

  const hasPayoutBreakupTab = sheetNames.some((n) =>
    n
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ')
      .replace(/\bbreak\s+up\b/g, 'breakup')
      .includes('payout breakup')
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
  if (!clean || clean.length > 7) return false;
  // Matches S.no., 1..99, 1a, A..Z (including I and J!)
  return /^(?:s\.?\s*r?\.?\s*no\.?|sl\.?\s*no\.?|#|\(?[0-9]{1,2}[a-z]?\)?\.?|\(?[a-z]\)?\.?)$/i.test(
    clean
  );
}

/**
 * Strictly parses ONLY the "Payout Breakup" sheet of a Zomato workbook into ZomatoPayoutBreakupModel v2
 * (Sections A through J, Rows 1 through 32 + Settlement breakdown).
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
  const targetSheetName = findZomatoPayoutBreakupSheetName(workbook.SheetNames);
  if (!targetSheetName) {
    throw new Error(
      `Zomato report "${file.name}" does not contain a "Payout Breakup" sheet (found tabs: ${workbook.SheetNames.join(
        ', '
      )}). Please upload the Zomato Settlement Report Excel containing the "Payout Breakup" tab.`
    );
  }

  const ws = workbook.Sheets[targetSheetName];
  const merges: XLSX.Range[] = Array.isArray(ws['!merges']) ? ws['!merges'] : [];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: '',
  });

  const rows: any[][] = rawRows.map((r) =>
    (r || []).map((cell: any) => {
      if (cell instanceof Date && !isNaN(cell.getTime())) {
        return cell.toISOString().slice(0, 10);
      }
      return cell;
    })
  );

  // Non-financial metadata sample (Res ID / Brand / Period Dates / UTR only)
  const breakupTextSample = rows
    .slice(0, 35)
    .map((r) => r.slice(0, 10).join(' '))
    .join(' \n ');

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
        .slice(0, 20)
        .map((r) => (r || []).slice(0, 8).join(' '))
        .join(' \n ')
    : '';

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

  // 2. Detect Table Header & Column Positions inside "Payout Breakup"
  let headerRowIdx = -1;
  let sNoCol = 0;
  let particularsCol = 1;
  let deliveredCol = -1;
  let cancelledCol = -1;
  let totalCol = -1;
  let headerDeliveredOrders = 0;
  let headerCancelledOrders = 0;

  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cur = rows[r] || [];
    const next = rows[r + 1] || [];
    const maxCols = Math.max(cur.length, next.length);
    if (maxCols < 3) continue;

    const combinedHeaders: string[] = [];
    const singleHeaders: string[] = [];
    for (let c = 0; c < Math.min(maxCols, 15); c++) {
      const h1 = String(cur[c] ?? '').replace(/\s+/g, ' ').trim();
      const h2 = String(next[c] ?? '').replace(/\s+/g, ' ').trim();
      singleHeaders.push(h1.toLowerCase());
      combinedHeaders.push(`${h1} ${h2}`.trim().toLowerCase());
    }

    const delivIdx = combinedHeaders.findIndex((h) => /\b(delivered|completed\s*orders)\b/.test(h));
    const cancIdx = combinedHeaders.findIndex((h) => /\b(cancelled|rejected)\b/.test(h));
    const pIdx = combinedHeaders.findIndex((h) =>
      /\b(particulars?|breakup|description|component)\b/.test(h)
    );
    const sIdx = combinedHeaders.findIndex((h) => /\bs\.?\s*no\.?\b/.test(h));

    if (delivIdx !== -1 && cancIdx !== -1) {
      headerRowIdx = r;
      if (sIdx !== -1 && sIdx < delivIdx) sNoCol = sIdx;
      particularsCol = pIdx !== -1 && pIdx < delivIdx ? pIdx : Math.min(sNoCol + 1, delivIdx - 1);
      deliveredCol = delivIdx;
      cancelledCol = cancIdx;

      const searchStart = Math.max(deliveredCol, cancelledCol) + 1;
      for (let c = searchStart; c < combinedHeaders.length; c++) {
        if (/\b(total|amount|value|net|inr)\b/.test(combinedHeaders[c])) {
          totalCol = c;
          break;
        }
      }
      if (totalCol === -1) {
        totalCol = Math.max(deliveredCol, cancelledCol) + 1;
      }

      const mDel = combinedHeaders[deliveredCol].match(/\((\d+)\)/);
      if (mDel) headerDeliveredOrders = parseInt(mDel[1], 10);
      const mCan = combinedHeaders[cancelledCol].match(/\((\d+)\)/);
      if (mCan) headerCancelledOrders = parseInt(mCan[1], 10);
      break;
    }
  }

  // Fallback Pass 2: 2/3-column Zomato Breakup layout (Particular | Total/Amount)
  if (headerRowIdx === -1) {
    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      const cur = rows[r] || [];
      if (cur.length < 2) continue;
      const singleHeaders = cur
        .slice(0, 12)
        .map((c: any) => String(c ?? '').replace(/\s+/g, ' ').trim().toLowerCase());
      const pIdx = singleHeaders.findIndex((h) =>
        /^(particulars?|breakup|description|component)$/.test(h)
      );
      if (pIdx === -1) continue;
      let amtIdx = -1;
      for (let c = pIdx + 1; c < singleHeaders.length; c++) {
        if (/\b(total|amount|value|inr|rs\.?|settled)\b/.test(singleHeaders[c])) {
          amtIdx = c;
          break;
        }
      }
      if (amtIdx !== -1) {
        headerRowIdx = r;
        sNoCol = Math.max(0, pIdx - 1);
        particularsCol = pIdx;
        totalCol = amtIdx;
        break;
      }
    }
  }

  const maxTextColExclusive =
    deliveredCol > 0
      ? deliveredCol
      : totalCol > 0
      ? totalCol
      : Math.max(particularsCol + 2, 3);

  const areRowsVerticallyMergedInTextCols = (r1: number, r2: number): boolean =>
    merges.some(
      (m) => m.s.c < maxTextColExclusive && m.s.r <= r1 && m.e.r >= r2
    );

  // Helper to inspect one raw physical row in "Payout Breakup"
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
          sNo = rawStr.replace(/[().]/g, '').trim();
        }
        continue;
      }
      if (rawStr === '.') continue;

      const numCheck = parseZomatoCurrencyCell(row[c]);
      if (numCheck.hasNumber && rawStr.length < 12) continue;

      textParts.push(rawStr);
    }

    let particulars = textParts.join(' ').replace(/\s+/g, ' ').trim();

    // Extract inline prefix code if embedded inside Particulars (e.g. "A. Net order value")
    const inlineMatch =
      particulars.match(/^\(?([A-J]|[0-9]{1,2}[a-z]?)\)[.:\-\s]+\s*(.+)$/i) ||
      particulars.match(/^([A-J]|[0-9]{1,2}[a-z]?)[.:\-]\s+(.+)$/i);
    if (inlineMatch && inlineMatch[2].trim().length >= 3) {
      if (!sNo) sNo = inlineMatch[1].trim();
      particulars = inlineMatch[2].trim();
    }

    const delCell =
      deliveredCol !== -1 && deliveredCol < row.length
        ? parseZomatoCurrencyCell(row[deliveredCol])
        : { hasNumber: false, value: 0 };
    const canCell =
      cancelledCol !== -1 && cancelledCol < row.length
        ? parseZomatoCurrencyCell(row[cancelledCol])
        : { hasNumber: false, value: 0 };
    const totCell =
      totalCol !== -1 && totalCol < row.length
        ? parseZomatoCurrencyCell(row[totalCol])
        : { hasNumber: false, value: 0 };

    const delDash = deliveredCol !== -1 && isDashZeroCell(row[deliveredCol]);
    const canDash = cancelledCol !== -1 && isDashZeroCell(row[cancelledCol]);
    const totDash = totalCol !== -1 && isDashZeroCell(row[totalCol]);

    let hasValues =
      delCell.hasNumber ||
      canCell.hasNumber ||
      totCell.hasNumber ||
      delDash ||
      canDash ||
      totDash;

    let deliveredVal = delCell.hasNumber ? delCell.value : 0;
    let cancelledVal = canCell.hasNumber ? canCell.value : 0;
    let totalVal = 0;

    if (totCell.hasNumber) {
      totalVal = totCell.value;
    } else if (delCell.hasNumber || canCell.hasNumber) {
      totalVal = round2(deliveredVal + cancelledVal);
    } else if (!hasValues) {
      // Fallback scan right of text columns for 2-column rows
      const scanEnd = Math.min(row.length, maxTextColExclusive + 6);
      for (let c = maxTextColExclusive; c < scanEnd; c++) {
        const parsed = parseZomatoCurrencyCell(row[c]);
        if (parsed.hasNumber) {
          totalVal = parsed.value;
          deliveredVal = parsed.value;
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
      delHasNum: delCell.hasNumber,
      canHasNum: canCell.hasNumber,
      totHasNum: totCell.hasNumber,
    };
  };

  // 3. Consolidate 2-row merged/wrapped Zomato items (e.g. Rows A, B, C, 9, 15, 23, 24, 31
  // where S.no + Particular sit on row r and formula/Annexure note + ₹ values sit on row r+1).
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

    // Skip secondary header line if header spanned 2 rows (e.g. "Orders" under "Delivered / Cancelled/Rejected")
    if (
      r === headerRowIdx + 1 &&
      !cur.hasValues &&
      /^(orders?|particulars?|\.)$/i.test(cur.particulars)
    ) {
      continue;
    }

    const isStandaloneSectionBanner = /^(settlement\s*breakdown|payout\s*breakup)$/i.test(
      cur.particulars
    );

    // Look ahead to stitch 2-row items when current row has text/S.no but values sit on row r+1
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
              /^(at\s+\d+%|4\s*-\s*5|\d+\s*[+\-])/.test(nxt.particulars))));

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

    // Also absorb trailing valueless formula/Annexure subtitle row when numbers sat on row r (top of vertical merge)
    if (cur.hasValues && !isStandaloneSectionBanner && r + 1 < rows.length) {
      const nxt = inspectPhysicalRow(r + 1);
      const verticallyMerged = areRowsVerticallyMergedInTextCols(r, r + 1);
      if (
        !nxt.sNo &&
        !nxt.hasValues &&
        nxt.particulars &&
        (verticallyMerged ||
          nxt.particulars.startsWith('(') ||
          /^(at\s+\d+%|4\s*-\s*5|\d+\s*[+\-])/.test(nxt.particulars))
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

  // 4. Populate ZomatoPayoutBreakupModel v2 (Sections A through J, Rows 1 through 32 + Settlement breakdown)
  const draft: ZomatoPayoutBreakupModel = createEmptyZomatoBreakupModel({
    sheetNameUsed: targetSheetName,
    resId: matchedMapping?.restaurantId || candidateResId,
    brandName: matchedMapping?.brandName,
    outletLocation: matchedMapping?.outletId,
    settlementPeriodLabel: periodInfo.periodLabel,
    payoutStartDate: periodInfo.startDate,
    payoutEndDate: periodInfo.endDate,
    utrNumber: extractedUtr,
    ordersCount: makeTriplet(
      headerDeliveredOrders,
      headerCancelledOrders,
      headerDeliveredOrders + headerCancelledOrders
    ),
  });

  const rawSheetRows: ZomatoBreakupRowItem[] = [];
  let activeSection: 'top' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'settlement' =
    'top';

  for (const item of logicalRows) {
    const sNoUpper = item.sNo.toUpperCase();
    const norm = item.particulars.toLowerCase().replace(/\s+/g, ' ').trim();
    // Strip formula annotations like "( 1 + 2 + 3 - 4 - 5 + 6 - 7 + 8 )" or "(Refer to Annexure...)" for clean label matching
    const normClean = norm
      .replace(/\(\s*refer\s+to\s+annexure[^)]*\)?/gi, '')
      .replace(/\(\s*service\s+fees\s+capped[^)]*\)?/gi, '')
      .replace(/\(\s*(?:[0-9]{1,2}|[a-j])(?:\s*[+\-–&,]\s*(?:[0-9]{1,2}|[a-j]))+\s*\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (/^settlement\s*breakdown$/i.test(normClean)) {
      activeSection = 'settlement';
      continue;
    }

    if (!item.hasValues) {
      if (sNoUpper === 'A' || /^net\s*order\s*value$/i.test(normClean)) activeSection = 'A';
      else if (sNoUpper === 'B' || /^total\s*commissionable\s*value$/i.test(normClean)) activeSection = 'B';
      else if (sNoUpper === 'C' || /^service\s*fees/i.test(normClean)) activeSection = 'C';
      else if (sNoUpper === 'D' || /^government\s*charges$/i.test(normClean)) activeSection = 'D';
      else if (sNoUpper === 'E') activeSection = 'E';
      else if (sNoUpper === 'F' || /^investment\s*in\s*growth/i.test(normClean)) activeSection = 'F';
      else if (sNoUpper === 'G' || /^investment\s*in\s*hyperpure/i.test(normClean)) activeSection = 'G';
      else if (sNoUpper === 'H' || /^other\s*deductions$/i.test(normClean)) activeSection = 'H';
      else if (sNoUpper === 'I' || /^total\s*additions$/i.test(normClean)) activeSection = 'I';
      else if (sNoUpper === 'J' || /^net\s*payout$/i.test(normClean)) activeSection = 'J';
      continue;
    }

    // Ignore metadata rows (Res ID, GSTIN, Bank A/C)
    if (
      /\b(restaurant\s*id|res\.?\s*id|partner\s*id|store\s*id|gstin|pan\b|bank\s*account|account\s*no|ifsc|utr|cin|pincode|phone|invoice\s*no)\b/i.test(
        normClean
      )
    ) {
      if (/restaurant\s*id|res\.?\s*id/i.test(normClean) && !draft.resId && item.triplet.total > 10000) {
        draft.resId = String(Math.round(item.triplet.total));
      }
      continue;
    }

    const tAbs = absTriplet(item.triplet);
    const tSigned = signedTriplet(item.triplet);
    let mappedField = 'unmapped';

    // --- TOP: Number of orders ---
    if (
      /\b(number\s*of\s*orders|no\.?\s*of\s*orders|orders\s*count)\b/i.test(normClean) ||
      /^(total\s*)?orders$/i.test(normClean)
    ) {
      const del = Math.round(Math.abs(item.delHasNum ? item.triplet.delivered : item.triplet.total));
      const can = Math.round(Math.abs(item.canHasNum ? item.triplet.cancelled : 0));
      const tot = Math.round(Math.abs(item.totHasNum ? item.triplet.total : del + can));
      draft.ordersCount = { delivered: del, cancelled: can, total: tot };
      mappedField = 'ordersCount';
    }
    // --- SETTLEMENT BREAKDOWN (below J) ---
    else if (/^amount\s*settled$/i.test(normClean) || /\bsettled\s*amount\b/i.test(normClean)) {
      draft.settlementAmountSettled = tSigned;
      activeSection = 'settlement';
      mappedField = 'settlementAmountSettled';
    } else if (/\bpending\s*amount\b|\bcredited\s*on\s*next\s*payout/i.test(normClean)) {
      draft.settlementPendingAmount = tSigned;
      activeSection = 'settlement';
      mappedField = 'settlementPendingAmount';
    }
    // --- SECTION HEADERS / TOTALS A..J ---
    else if (
      sNoUpper === 'A' ||
      /^(net\s*order\s*value|customer\s*payable)$/i.test(normClean)
    ) {
      draft.reportedSectionA = tSigned;
      activeSection = 'A';
      mappedField = 'sectionA_netOrderValue';
    } else if (
      sNoUpper === 'B' ||
      /^total\s*commissionable\s*(value|amount)$/i.test(normClean)
    ) {
      draft.reportedSectionB = tAbs;
      activeSection = 'B';
      mappedField = 'sectionB_totalCommissionableValue';
    } else if (
      sNoUpper === 'C' ||
      (/^service\s*fees?\s*&\s*payment\s*mechanism\s*fees?$/i.test(normClean) && !normClean.startsWith('taxes'))
    ) {
      draft.reportedSectionC = tAbs;
      activeSection = 'C';
      mappedField = 'sectionC_serviceAndPaymentFees';
    } else if (
      sNoUpper === 'D' ||
      /^(total\s*)?government\s*charges(\s*&\s*taxes)?$/i.test(normClean)
    ) {
      draft.reportedSectionD = tAbs;
      activeSection = 'D';
      mappedField = 'sectionD_governmentCharges';
    } else if (
      sNoUpper === 'E' ||
      (/^other\s*order\s*level\s*deductions$/i.test(normClean) && sNoUpper !== '21' && !draft.reportedSectionE)
    ) {
      draft.reportedSectionE = tSigned;
      activeSection = 'E';
      mappedField = 'sectionE_otherOrderLevelDeductions';
    } else if (
      sNoUpper === 'F' ||
      /^investment\s*in\s*growth\s*services$/i.test(normClean)
    ) {
      draft.reportedSectionF = tAbs;
      activeSection = 'F';
      mappedField = 'sectionF_investmentInGrowthServices';
    } else if (
      sNoUpper === 'G' ||
      /^investment\s*in\s*hyperpure$/i.test(normClean)
    ) {
      draft.reportedSectionG = tAbs;
      activeSection = 'G';
      mappedField = 'sectionG_investmentInHyperpure';
    } else if (
      sNoUpper === 'H' ||
      (/^other\s*deductions$/i.test(normClean) && activeSection !== 'E')
    ) {
      draft.reportedSectionH = tAbs;
      activeSection = 'H';
      mappedField = 'sectionH_otherDeductions';
    } else if (
      sNoUpper === 'I' ||
      /^total\s*additions$/i.test(normClean)
    ) {
      draft.reportedSectionI = tAbs;
      activeSection = 'I';
      mappedField = 'sectionI_totalAdditions';
    } else if (
      sNoUpper === 'J' ||
      /^(net\s*payout|total\s*net\s*payout|final\s*net\s*payout)$/i.test(normClean)
    ) {
      draft.reportedSectionJ = tSigned;
      draft.hasExplicitReportedJ = true;
      draft.reportedNetPayout = tSigned.total;
      activeSection = 'J';
      mappedField = 'sectionJ_netPayout';
    }

    // --- SECTION B ROWS (9, 10, 11) — MUST CHECK BEFORE SECTION A SUBTOTAL / PACKAGING / GST! ---
    else if (
      sNoUpper === '9' ||
      /commissionable\s*value\s*of\s*subtotal/i.test(normClean)
    ) {
      draft.row9_commissionableSubtotal = tAbs;
      mappedField = 'row9_commissionableSubtotal';
    } else if (
      sNoUpper === '10' ||
      /commissionable\s*value\s*of\s*pack/i.test(normClean)
    ) {
      draft.row10_commissionablePackaging = tAbs;
      mappedField = 'row10_commissionablePackaging';
    } else if (
      sNoUpper === '11' ||
      /commissionable\s*value\s*of.*gst/i.test(normClean)
    ) {
      draft.row11_commissionableGst = tAbs;
      mappedField = 'row11_commissionableGst';
    } else if (/^commissionable\s*(amount|value)$/i.test(normClean)) {
      draft.row9_commissionableSubtotal = tAbs;
      mappedField = 'row9_commissionableSubtotal';
    }

    // --- SECTION A ROWS (1..8) ---
    else if (
      sNoUpper === '1' ||
      /\bsubtotal\b|\bitems?\s*total\b/i.test(normClean)
    ) {
      draft.row1_subtotal = tAbs;
      mappedField = 'row1_subtotal';
    } else if (
      sNoUpper === '2' ||
      (/^packaging\s*charges?$/i.test(normClean) || /\brestaurant\s*packaging\b/i.test(normClean))
    ) {
      draft.row2_packagingCharge = tAbs;
      mappedField = 'row2_packagingCharge';
    } else if (
      sNoUpper === '6' ||
      /brand\s*pack\s*subscription\s*fee/i.test(normClean)
    ) {
      draft.row6_brandPackSubscriptionFee = tAbs;
      mappedField = 'row6_brandPackSubscriptionFee';
    } else if (
      sNoUpper === '7' ||
      /delivery\s*charge\s*discount|relisting\s*discount/i.test(normClean)
    ) {
      draft.row7_deliveryRelistingDiscount = tAbs;
      mappedField = 'row7_deliveryRelistingDiscount';
    } else if (
      sNoUpper === '3' ||
      (/delivery\s*charge.*self\s*logistics|^delivery\s*charges?$/i.test(normClean) &&
        !normClean.includes('recovery') &&
        !normClean.includes('discount'))
    ) {
      draft.row3_selfLogisticsDeliveryCharge = tAbs;
      mappedField = 'row3_selfLogisticsDeliveryCharge';
    } else if (
      sNoUpper === '4' ||
      (/restaurant\s*discount/i.test(normClean) && /\bpromo\b/i.test(normClean)) ||
      /^promo\s*discount$/i.test(normClean)
    ) {
      draft.row4_promoDiscount = tAbs;
      mappedField = 'row4_promoDiscount';
    } else if (
      sNoUpper === '5' ||
      (/restaurant\s*discount/i.test(normClean) && !/\bpromo\b/i.test(normClean)) ||
      /\b(bogo|freebies|gold.*discount|flat\s*offs?)\b/i.test(normClean)
    ) {
      draft.row5_bogoFreebiesGoldDiscount = tAbs;
      mappedField = 'row5_bogoFreebiesGoldDiscount';
    } else if (
      sNoUpper === '8' ||
      /gst\s*collected\s*from\s*customers|^customer\s*gst/i.test(normClean)
    ) {
      draft.row8_customerGstCollected = tAbs;
      mappedField = 'row8_customerGstCollected';
    }

    // --- SECTION D ROWS (17..20) & SECTION I ROW 31/32 (check BEFORE Section C generic service fee!) ---
    else if (
      sNoUpper === '17' ||
      /taxes\s*on\s*(service|zomato)\s*fee|gst\s*on\s*(service|zomato)\s*fee/i.test(normClean)
    ) {
      draft.row17_taxesOnServiceFee = tAbs;
      mappedField = 'row17_taxesOnServiceFee';
    } else if (
      sNoUpper === '18' ||
      /tax\s*collected\s*at\s*source|\btcs\b/i.test(normClean)
    ) {
      draft.row18_tcsAndIgst = tAbs;
      mappedField = 'row18_tcsAndIgst';
    } else if (
      sNoUpper === '31' ||
      /\b194\s*-?\s*h\b|res\s*id\s*level\s*additions/i.test(normClean)
    ) {
      draft.row31_tds194HAndResIdAdditions = tAbs;
      mappedField = 'row31_tds194HAndResIdAdditions';
    } else if (
      sNoUpper === '19' ||
      /\b194\s*-?\s*o\b|\btds\b/i.test(normClean)
    ) {
      draft.row19_tds194O = tAbs;
      mappedField = 'row19_tds194O';
    } else if (
      sNoUpper === '20' ||
      /section\s*9\s*\(\s*5\s*\)|gst\s*paid\s*by\s*zomato/i.test(normClean)
    ) {
      draft.row20_gstSection9_5 = tAbs;
      mappedField = 'row20_gstSection9_5';
    } else if (
      sNoUpper === '32' ||
      /service\s*fees?\s*rebate/i.test(normClean)
    ) {
      draft.row32_serviceFeesRebate = tAbs;
      mappedField = 'row32_serviceFeesRebate';
    }

    // --- SECTION C ROWS (12..16) ---
    else if (
      sNoUpper === '14' ||
      /discount\s*on\s*long\s*distance/i.test(normClean)
    ) {
      draft.row14_longDistanceDiscount = tAbs;
      mappedField = 'row14_longDistanceDiscount';
    } else if (
      sNoUpper === '13' ||
      /long\s*distance\s*(enablement\s*)?fee/i.test(normClean)
    ) {
      draft.row13_longDistanceFee = tAbs;
      mappedField = 'row13_longDistanceFee';
    } else if (
      sNoUpper === '15' ||
      /discount\s*on\s*service\s*fee|30%\s*capping/i.test(normClean)
    ) {
      draft.row15_serviceFeeCapDiscount = tAbs;
      mappedField = 'row15_serviceFeeCapDiscount';
    } else if (
      sNoUpper === '16' ||
      /payment\s*mechanism\s*fee|payment\s*gateway\s*fee/i.test(normClean)
    ) {
      draft.row16_paymentMechanismFee = tAbs;
      mappedField = 'row16_paymentMechanismFee';
    } else if (
      sNoUpper === '12' ||
      /^base\s*service\s*fee|^zomato\s*service\s*fee|^service\s*fee$/i.test(normClean)
    ) {
      draft.row12_baseServiceFee = tAbs;
      mappedField = 'row12_baseServiceFee';
    }

    // --- SECTION E ROWS (21 + 8 sub-items, 22, 23) ---
    else if (
      sNoUpper === '21' ||
      /^other\s*order\s*level\s*deductions$/i.test(normClean)
    ) {
      draft.reportedRow21 = tAbs;
      draft.row21_otherOrderLevelDeductions = tAbs;
      mappedField = 'row21_otherOrderLevelDeductions';
    } else if (/customer\s*compensation|recoupment/i.test(normClean)) {
      draft.row21a_customerCompensation = tAbs;
      mappedField = 'row21a_customerCompensation';
    } else if (/rejection\s*penalty/i.test(normClean)) {
      draft.row21b_rejectionPenalty = tAbs;
      mappedField = 'row21b_rejectionPenalty';
    } else if (/delivery\s*charges?\s*recovery/i.test(normClean)) {
      draft.row21c_deliveryChargesRecovery = tAbs;
      mappedField = 'row21c_deliveryChargesRecovery';
    } else if (/credit\s*note.*debit\s*note|debit\s*note\s*adjustment/i.test(normClean)) {
      draft.row21d_creditDebitNoteAdjustment = tSigned;
      mappedField = 'row21d_creditDebitNoteAdjustment';
    } else if (/promo\s*recovery\s*adjustment/i.test(normClean)) {
      draft.row21e_promoRecoveryAdjustment = tAbs;
      mappedField = 'row21e_promoRecoveryAdjustment';
    } else if (/extra\s*inventory\s*ads/i.test(normClean)) {
      draft.row21f_extraInventoryAds = tAbs;
      mappedField = 'row21f_extraInventoryAds';
    } else if (/brand\s*loyalty\s*points/i.test(normClean)) {
      draft.row21g_brandLoyaltyPointsRedemption = tAbs;
      mappedField = 'row21g_brandLoyaltyPointsRedemption';
    } else if (/^express\s*order\s*fee$/i.test(normClean)) {
      draft.row21h_expressOrderFee = tAbs;
      mappedField = 'row21h_expressOrderFee';
    } else if (
      sNoUpper === '22' ||
      /amount\s*received\s*in\s*cash/i.test(normClean)
    ) {
      draft.row22_cashReceivedSelfDelivery = tAbs;
      mappedField = 'row22_cashReceivedSelfDelivery';
    } else if (
      sNoUpper === '23' ||
      /adjustments?\s*from\s*previous\s*weeks?/i.test(normClean)
    ) {
      draft.row23_previousWeeksAdjustments = tSigned;
      mappedField = 'row23_previousWeeksAdjustments';
    }

    // --- SECTION F ROWS (24, 25, 26) ---
    else if (
      sNoUpper === '25' ||
      /total\s*dining\s*ads|\bdining\s*ads\b/i.test(normClean)
    ) {
      draft.row25_totalDiningAdsIncGst = tAbs;
      mappedField = 'row25_totalDiningAdsIncGst';
    } else if (
      sNoUpper === '24' ||
      /^total\s*ads\b|\bzomato\s*ads\b/i.test(normClean)
    ) {
      draft.row24_totalAdsIncGst = tAbs;
      mappedField = 'row24_totalAdsIncGst';
    } else if (
      sNoUpper === '26' ||
      /miscellaneous\s*ser?vices/i.test(normClean)
    ) {
      draft.row26_miscellaneousServices = tAbs;
      mappedField = 'row26_miscellaneousServices';
    }

    // --- SECTION G ROW (27) ---
    else if (
      sNoUpper === '27' ||
      /\btotal\s*hyperpure\b|\bhyperpure\b/i.test(normClean)
    ) {
      draft.row27_totalHyperpure = tAbs;
      mappedField = 'row27_totalHyperpure';
    }

    // --- SECTION H ROW (28 + extra) ---
    else if (
      sNoUpper === '28' ||
      /express\s*order\s*discount\s*reversal/i.test(normClean)
    ) {
      draft.row28_expressOrderDiscountReversal = tAbs;
      mappedField = 'row28_expressOrderDiscountReversal';
    }

    // --- SECTION I ROWS (29, 30) ---
    else if (
      sNoUpper === '29' ||
      /cancellation\s*refund\s*for\s*cancelled\s*orders/i.test(normClean)
    ) {
      draft.row29_cancellationRefund = tAbs;
      mappedField = 'row29_cancellationRefund';
    } else if (
      sNoUpper === '30' ||
      /tip\s*for\s*kitchen\s*staff/i.test(normClean)
    ) {
      draft.row30_kitchenStaffTip = tAbs;
      mappedField = 'row30_kitchenStaffTip';
    }

    // --- DYNAMIC EXTRA ITEMS UNDER H OR I ---
    else if (activeSection === 'I' && Math.abs(item.triplet.total) >= 0.01) {
      draft.extraAdditions.push({
        id: `zomato-add-extra-${draft.extraAdditions.length + 1}`,
        sNo: item.sNo || undefined,
        label: item.particulars,
        values: tAbs,
      });
      mappedField = 'extraAddition';
    } else if (
      (activeSection === 'H' || activeSection === 'F' || activeSection === 'E') &&
      Math.abs(item.triplet.total) >= 0.01
    ) {
      draft.extraOtherDeductions.push({
        id: `zomato-ded-extra-${draft.extraOtherDeductions.length + 1}`,
        sNo: item.sNo || undefined,
        label: item.particulars,
        values: tAbs,
      });
      mappedField = 'extraDeduction';
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

  draft.rawSheetRows = rawSheetRows;

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
  const finalizedModel = recalculateZomatoBreakupModel(draft, syncToCalculated);

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
    syncToCalculated
  );

  return {
    payout,
    model: payout.zomatoBreakup!,
    matchedMapping,
    candidateRestaurantId: resolvedResId,
  };
}
