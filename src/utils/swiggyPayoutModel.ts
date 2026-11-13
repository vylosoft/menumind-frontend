/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import {
  AggregatorBrandOutletMapping,
  PayoutOtherChargeItem,
  PlatformPayoutRecord,
  SwiggyBreakupRowItem,
  SwiggyExtraLineItem,
  SwiggyPayoutBreakupModel,
  SwiggyQuintet,
} from '../types/finance';
import {
  detectAggregatorMappingFromText,
  extractCandidateRestaurantIdFromFilename,
} from './aggregatorMappingManager';
import { parseZomatoCurrencyCell } from './zomatoPayoutModel';

function round2(n: number): number {
  const r = Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
  return Object.is(r, -0) || r === 0 ? 0 : r;
}

export function zeroQuintet(): SwiggyQuintet {
  return {
    swiggyDelivered: 0,
    swiggyCancelled: 0,
    toingDelivered: 0,
    toingCancelled: 0,
    total: 0,
  };
}

export function makeQuintet(
  swiggyDelivered = 0,
  swiggyCancelled = 0,
  toingDelivered = 0,
  toingCancelled = 0,
  explicitTotal?: number
): SwiggyQuintet {
  let sd = round2(swiggyDelivered);
  const sc = round2(swiggyCancelled);
  const td = round2(toingDelivered);
  const tc = round2(toingCancelled);
  const fourSum = round2(sd + sc + td + tc);

  if (explicitTotal !== undefined) {
    const tot = round2(explicitTotal);
    if (fourSum === 0 && tot !== 0) {
      sd = tot;
      return {
        swiggyDelivered: sd,
        swiggyCancelled: sc,
        toingDelivered: td,
        toingCancelled: tc,
        total: tot,
      };
    }
    const finalTot = tot === 0 && fourSum !== 0 ? fourSum : tot;
    return {
      swiggyDelivered: sd,
      swiggyCancelled: sc,
      toingDelivered: td,
      toingCancelled: tc,
      total: finalTot,
    };
  }

  return {
    swiggyDelivered: sd,
    swiggyCancelled: sc,
    toingDelivered: td,
    toingCancelled: tc,
    total: fourSum,
  };
}

export function posQuintet(q?: Partial<SwiggyQuintet>, isInteger = false): SwiggyQuintet {
  if (!q) return zeroQuintet();
  const fmt = (v: any) =>
    isInteger ? Math.max(0, Math.round(Math.abs(Number(v) || 0))) : round2(Math.abs(Number(v) || 0));

  let sd = fmt(q.swiggyDelivered);
  const sc = fmt(q.swiggyCancelled);
  const td = fmt(q.toingDelivered);
  const tc = fmt(q.toingCancelled);
  const fourSum = isInteger ? sd + sc + td + tc : round2(sd + sc + td + tc);
  const rawTot = q.total !== undefined ? fmt(q.total) : fourSum;

  if (fourSum === 0 && rawTot > 0) {
    sd = rawTot;
    return {
      swiggyDelivered: sd,
      swiggyCancelled: sc,
      toingDelivered: td,
      toingCancelled: tc,
      total: rawTot,
    };
  }

  return {
    swiggyDelivered: sd,
    swiggyCancelled: sc,
    toingDelivered: td,
    toingCancelled: tc,
    total: fourSum,
  };
}

export function negQuintet(q?: Partial<SwiggyQuintet>): SwiggyQuintet {
  if (!q) return zeroQuintet();
  const toNeg = (v: any) => {
    const abs = Math.abs(Number(v) || 0);
    return abs === 0 ? 0 : round2(-abs);
  };

  let sd = toNeg(q.swiggyDelivered);
  const sc = toNeg(q.swiggyCancelled);
  const td = toNeg(q.toingDelivered);
  const tc = toNeg(q.toingCancelled);
  const fourSum = round2(sd + sc + td + tc);
  const rawTot = q.total !== undefined ? toNeg(q.total) : fourSum;

  if (fourSum === 0 && rawTot < 0) {
    sd = rawTot;
    return {
      swiggyDelivered: sd,
      swiggyCancelled: sc,
      toingDelivered: td,
      toingCancelled: tc,
      total: rawTot,
    };
  }

  return {
    swiggyDelivered: sd,
    swiggyCancelled: sc,
    toingDelivered: td,
    toingCancelled: tc,
    total: fourSum,
  };
}

export function signedQuintet(q?: Partial<SwiggyQuintet>): SwiggyQuintet {
  if (!q) return zeroQuintet();
  let sd = round2(Number(q.swiggyDelivered) || 0);
  const sc = round2(Number(q.swiggyCancelled) || 0);
  const td = round2(Number(q.toingDelivered) || 0);
  const tc = round2(Number(q.toingCancelled) || 0);
  const fourSum = round2(sd + sc + td + tc);
  const hasTot = q.total !== undefined && q.total !== null;
  const rawTot = hasTot ? round2(Number(q.total) || 0) : fourSum;

  if (fourSum === 0 && rawTot !== 0) {
    sd = rawTot;
    return {
      swiggyDelivered: sd,
      swiggyCancelled: sc,
      toingDelivered: td,
      toingCancelled: tc,
      total: rawTot,
    };
  }

  return {
    swiggyDelivered: sd,
    swiggyCancelled: sc,
    toingDelivered: td,
    toingCancelled: tc,
    total: fourSum,
  };
}

export function sumQuintets(items: SwiggyQuintet[]): SwiggyQuintet {
  let sd = 0;
  let sc = 0;
  let td = 0;
  let tc = 0;
  let tot = 0;
  for (const q of items) {
    sd += Number(q.swiggyDelivered) || 0;
    sc += Number(q.swiggyCancelled) || 0;
    td += Number(q.toingDelivered) || 0;
    tc += Number(q.toingCancelled) || 0;
    tot += Number(q.total) || 0;
  }
  return {
    swiggyDelivered: round2(sd),
    swiggyCancelled: round2(sc),
    toingDelivered: round2(td),
    toingCancelled: round2(tc),
    total: round2(tot),
  };
}

export function updateQuintetColumn(
  prev: SwiggyQuintet | undefined,
  col: keyof SwiggyQuintet,
  rawVal: number,
  mode: 'pos' | 'neg' | 'signed' | 'int' = 'signed'
): SwiggyQuintet {
  const base = prev || zeroQuintet();
  let clean = Number(rawVal) || 0;
  if (mode === 'int') clean = Math.max(0, Math.round(Math.abs(clean)));
  else if (mode === 'pos') clean = round2(Math.abs(clean));
  else if (mode === 'neg') clean = clean === 0 ? 0 : round2(-Math.abs(clean));
  else clean = round2(clean);

  if (col === 'total') {
    const others =
      (Number(base.swiggyCancelled) || 0) +
      (Number(base.toingDelivered) || 0) +
      (Number(base.toingCancelled) || 0);
    const adjustedSd =
      mode === 'int' ? Math.max(0, Math.round(clean - others)) : round2(clean - others);
    const nextTot =
      mode === 'int'
        ? adjustedSd + Math.round(others)
        : round2(adjustedSd + others);
    return {
      ...base,
      swiggyDelivered: adjustedSd,
      total: nextTot,
    };
  }

  const next: SwiggyQuintet = {
    ...base,
    [col]: clean,
  };
  next.total =
    mode === 'int'
      ? Math.round(
          next.swiggyDelivered +
            next.swiggyCancelled +
            next.toingDelivered +
            next.toingCancelled
        )
      : round2(
          next.swiggyDelivered +
            next.swiggyCancelled +
            next.toingDelivered +
            next.toingCancelled
        );
  return next;
}

/**
 * Creates a clean canonical Swiggy (+ Toing combined) Payout Breakup model.
 */
export function createEmptySwiggyBreakupModel(
  overrides?: Partial<SwiggyPayoutBreakupModel>
): SwiggyPayoutBreakupModel {
  return recalculateSwiggyBreakupModel({
    templateVersion: 'swiggy_payout_breakup_v1',
    sheetNameUsed: 'Payout Breakup',
    hasToingColumns: true,
    orders: zeroQuintet(),

    totalCustomerPaid: zeroQuintet(),
    itemTotal: zeroQuintet(),
    packagingCharges: zeroQuintet(),
    couponDiscounts: zeroQuintet(),
    fvoFreebiesDiscounts: zeroQuintet(),
    gstCollected: zeroQuintet(),
    deliveryFee: zeroQuintet(),
    discountOnDeliveryFee: zeroQuintet(),
    gstOnDeliveryFee: zeroQuintet(),

    swiggyFees: zeroQuintet(),
    commission: zeroQuintet(),
    longDistanceCharges: zeroQuintet(),
    paymentCollectionCharges: zeroQuintet(),
    pocketHeroFees: zeroQuintet(),
    swiggyOneFees: zeroQuintet(),
    restaurantCancellationCharges: zeroQuintet(),
    callCenterCharges: zeroQuintet(),
    deliveryFeeSponsoredByRestaurant: zeroQuintet(),
    boltFees: zeroQuintet(),
    swiggyAssureFee: zeroQuintet(),
    extraSwiggyFees: [],

    customerComplaintsAndCancellation: zeroQuintet(),
    merchantShareCancelledOrders: zeroQuintet(),
    refundForCustomerComplaints: zeroQuintet(),

    growthInvestmentInAds: zeroQuintet(),
    otherChargesAndRefunds: zeroQuintet(),
    extraOtherChargesAndRefunds: [],

    totalTaxes: zeroQuintet(),
    gstDeduction: zeroQuintet(),
    tcs: zeroQuintet(),
    tds: zeroQuintet(),
    gstOnServiceFee18: zeroQuintet(),

    netPayout: zeroQuintet(),
    calculatedNetPayout: 0,
    reportedNetPayout: 0,
    rawSheetRows: [],
    ...overrides,
  });
}

/**
 * Hydrates ANY Swiggy PlatformPayoutRecord (newly uploaded or saved in DB) into SwiggyPayoutBreakupModel.
 */
export function ensureSwiggyBreakupModelOnRecord(
  record: PlatformPayoutRecord
): SwiggyPayoutBreakupModel {
  const existing = record.swiggyBreakup;
  if (existing && existing.templateVersion === 'swiggy_payout_breakup_v1' && existing.itemTotal) {
    return recalculateSwiggyBreakupModel(existing);
  }

  const delOrd = Math.max(0, Math.round(Number(record.orderCount) || 0));
  const canOrd = Math.max(0, Math.round(Number(record.cancelledOrders) || 0));
  const gross = round2(Number(record.grossSales) || 0);
  const pack = round2(Number(record.packagingCharges) || 0);
  const disc = round2(Math.abs(Number(record.customerDiscounts) || 0));
  const delGst = round2(Number(record.deliveryChargesCollected) || 0);
  const comm = round2(Math.abs(Number(record.commissionAmount) || 0));
  const pg = round2(Math.abs(Number(record.paymentGatewayFee) || 0));
  const cancel = round2(Math.abs(Number(record.cancellationCharges) || 0));
  const ads = round2(Math.abs(Number(record.advertisingSpend) || 0));
  const assure = round2(Math.abs(Number(record.swiggyAssureFee) || 0));
  const gst = round2(Math.abs(Number(record.gstOnCommission) || 0));
  const tcs = round2(Math.abs(Number(record.tcsDeduction) || 0));
  const tds = round2(Math.abs(Number(record.tdsDeduction) || 0));

  const extraOther: SwiggyExtraLineItem[] = (record.otherChargesBreakdown || []).map((it) => ({
    id: it.id,
    label: it.label,
    values: makeQuintet(-round2(Number(it.amount) || 0), 0, 0, 0),
  }));

  return createEmptySwiggyBreakupModel({
    sheetNameUsed: 'Payout Breakup',
    hasToingColumns: true,
    resId: record.accountId,
    brandName: record.accountName,
    outletLocation: record.outletId,
    settlementPeriodLabel: record.weekLabel,
    payoutStartDate: record.payoutStartDate,
    payoutEndDate: record.payoutEndDate,
    orders: makeQuintet(delOrd, canOrd, 0, 0, delOrd + canOrd),
    itemTotal: makeQuintet(gross, 0, 0, 0, gross),
    packagingCharges: makeQuintet(pack, 0, 0, 0, pack),
    couponDiscounts: makeQuintet(disc ? -disc : 0, 0, 0, 0, disc ? -disc : 0),
    gstCollected: makeQuintet(delGst, 0, 0, 0, delGst),
    commission: makeQuintet(comm ? -comm : 0, 0, 0, 0, comm ? -comm : 0),
    paymentCollectionCharges: makeQuintet(pg ? -pg : 0, 0, 0, 0, pg ? -pg : 0),
    swiggyAssureFee: makeQuintet(assure ? -assure : 0, 0, 0, 0, assure ? -assure : 0),
    merchantShareCancelledOrders: makeQuintet(0, cancel ? -cancel : 0, 0, 0, cancel ? -cancel : 0),
    growthInvestmentInAds: makeQuintet(ads ? -ads : 0, 0, 0, 0, ads ? -ads : 0),
    extraOtherChargesAndRefunds: extraOther,
    gstOnServiceFee18: makeQuintet(gst ? -gst : 0, 0, 0, 0, gst ? -gst : 0),
    tcs: makeQuintet(tcs ? -tcs : 0, 0, 0, 0, tcs ? -tcs : 0),
    tds: makeQuintet(tds ? -tds : 0, 0, 0, 0, tds ? -tds : 0),
    hasExplicitReportedNetPayout: true,
    reportedNetPayout: round2(
      Number(record.actualBankSettlement ?? record.calculatedNetPayout) || 0
    ),
  });
}

/**
 * Evaluates Swiggy's exact Payout Breakup formulas combining Swiggy Orders + Toing Orders:
 *   Total Customer Paid = Item Total + Packaging Charges + Coupon Discounts (-) + FVO/Freebies Discounts (-)
 *                         + GST Collected + Delivery Fee + Discount on Delivery Fee (-) + GST on Delivery Fee
 *   Swiggy Fees         = Commission + Long Distance + Payment Collection + Pocket Hero + Swiggy One
 *                         + Restaurant Cancellation + Call Center + Delivery Fee Sponsored + Bolt Fees + Assure + Extra
 *   Customer Complaints = Merchant Share Of Cancelled Orders + Refund For Customer Complaints
 *   Total Taxes         = GST Deduction + TCS + TDS + GST on Service Fee @18%
 *   Net Payout          = Total Customer Paid + Swiggy Fees + Customer Complaints + Growth Investment In Ads
 *                         + Other Charges and Refunds + Total Taxes
 */
export function recalculateSwiggyBreakupModel(
  model: SwiggyPayoutBreakupModel,
  syncReportedToCalculated = false
): SwiggyPayoutBreakupModel {
  const orders = posQuintet(model.orders, true);

  // Section 1: Total Customer Paid
  const itemTotal = posQuintet(model.itemTotal);
  const packagingCharges = posQuintet(model.packagingCharges);
  const couponDiscounts = negQuintet(model.couponDiscounts);
  const fvoFreebiesDiscounts = negQuintet(model.fvoFreebiesDiscounts);
  const gstCollected = posQuintet(model.gstCollected);
  const deliveryFee = posQuintet(model.deliveryFee);
  const discountOnDeliveryFee = negQuintet(model.discountOnDeliveryFee);
  const gstOnDeliveryFee = posQuintet(model.gstOnDeliveryFee);

  const totalCustomerPaid = sumQuintets([
    itemTotal,
    packagingCharges,
    couponDiscounts,
    fvoFreebiesDiscounts,
    gstCollected,
    deliveryFee,
    discountOnDeliveryFee,
    gstOnDeliveryFee,
  ]);

  // Section 2: Swiggy Fees
  let commission = negQuintet(model.commission);
  const longDistanceCharges = negQuintet(model.longDistanceCharges);
  const paymentCollectionCharges = negQuintet(model.paymentCollectionCharges);
  const pocketHeroFees = negQuintet(model.pocketHeroFees);
  const swiggyOneFees = negQuintet(model.swiggyOneFees);
  const restaurantCancellationCharges = negQuintet(model.restaurantCancellationCharges);
  const callCenterCharges = negQuintet(model.callCenterCharges);
  const deliveryFeeSponsoredByRestaurant = negQuintet(model.deliveryFeeSponsoredByRestaurant);
  const boltFees = negQuintet(model.boltFees);
  const swiggyAssureFee = negQuintet(model.swiggyAssureFee);
  const extraSwiggyFees: SwiggyExtraLineItem[] = (model.extraSwiggyFees || []).map((it) => ({
    ...it,
    values: negQuintet(it.values),
  }));

  let swiggyFees = sumQuintets([
    commission,
    longDistanceCharges,
    paymentCollectionCharges,
    pocketHeroFees,
    swiggyOneFees,
    restaurantCancellationCharges,
    callCenterCharges,
    deliveryFeeSponsoredByRestaurant,
    boltFees,
    swiggyAssureFee,
    ...extraSwiggyFees.map((it) => it.values),
  ]);

  if (swiggyFees.total === 0 && model.reportedSwiggyFees && model.reportedSwiggyFees.total !== 0) {
    commission = negQuintet(model.reportedSwiggyFees);
    swiggyFees = { ...commission };
  }

  // Section 3: Customer Complaints & Cancellation Charges
  let merchantShareCancelledOrders = negQuintet(model.merchantShareCancelledOrders);
  const refundForCustomerComplaints = negQuintet(model.refundForCustomerComplaints);

  let customerComplaintsAndCancellation = sumQuintets([
    merchantShareCancelledOrders,
    refundForCustomerComplaints,
  ]);

  if (
    customerComplaintsAndCancellation.total === 0 &&
    model.reportedCustomerComplaintsAndCancellation &&
    model.reportedCustomerComplaintsAndCancellation.total !== 0
  ) {
    merchantShareCancelledOrders = negQuintet(model.reportedCustomerComplaintsAndCancellation);
    customerComplaintsAndCancellation = { ...merchantShareCancelledOrders };
  }

  // Section 4: Growth Investment In Ads & Other Charges and Refunds
  const growthInvestmentInAds = negQuintet(model.growthInvestmentInAds);
  const otherChargesAndRefunds = signedQuintet(model.otherChargesAndRefunds);
  const extraOtherChargesAndRefunds: SwiggyExtraLineItem[] = (
    model.extraOtherChargesAndRefunds || []
  ).map((it) => ({
    ...it,
    values: signedQuintet(it.values),
  }));

  // Section 5: Total Taxes
  const gstDeduction = negQuintet(model.gstDeduction);
  const tcs = negQuintet(model.tcs);
  const tds = negQuintet(model.tds);
  let gstOnServiceFee18 = negQuintet(model.gstOnServiceFee18);

  let totalTaxes = sumQuintets([gstDeduction, tcs, tds, gstOnServiceFee18]);
  if (totalTaxes.total === 0 && model.reportedTotalTaxes && model.reportedTotalTaxes.total !== 0) {
    gstOnServiceFee18 = negQuintet(model.reportedTotalTaxes);
    totalTaxes = { ...gstOnServiceFee18 };
  }

  // Section 6: Net Payout (Swiggy + Toing Combined)
  const netPayout = sumQuintets([
    totalCustomerPaid,
    swiggyFees,
    customerComplaintsAndCancellation,
    growthInvestmentInAds,
    otherChargesAndRefunds,
    ...extraOtherChargesAndRefunds.map((it) => it.values),
    totalTaxes,
  ]);

  const calculatedNetPayout = netPayout.total;
  const reportedNetPayout = syncReportedToCalculated
    ? calculatedNetPayout
    : model.hasExplicitReportedNetPayout || model.reportedNetPayout !== undefined
    ? round2(
        Number(
          model.reportedNetPayout ??
            model.reportedNetPayoutQuintet?.total ??
            calculatedNetPayout
        )
      )
    : calculatedNetPayout;

  return {
    ...model,
    templateVersion: 'swiggy_payout_breakup_v1',
    orders,

    totalCustomerPaid,
    itemTotal,
    packagingCharges,
    couponDiscounts,
    fvoFreebiesDiscounts,
    gstCollected,
    deliveryFee,
    discountOnDeliveryFee,
    gstOnDeliveryFee,

    swiggyFees,
    commission,
    longDistanceCharges,
    paymentCollectionCharges,
    pocketHeroFees,
    swiggyOneFees,
    restaurantCancellationCharges,
    callCenterCharges,
    deliveryFeeSponsoredByRestaurant,
    boltFees,
    swiggyAssureFee,
    extraSwiggyFees,

    customerComplaintsAndCancellation,
    merchantShareCancelledOrders,
    refundForCustomerComplaints,

    growthInvestmentInAds,
    otherChargesAndRefunds,
    extraOtherChargesAndRefunds,

    totalTaxes,
    gstDeduction,
    tcs,
    tds,
    gstOnServiceFee18,

    netPayout,
    calculatedNetPayout,
    reportedNetPayout,
  };
}

/**
 * Projects the combined Swiggy + Toing Payout Breakup onto PlatformPayoutRecord
 * (always reporting consolidated under platform: 'swiggy').
 */
export function applySwiggyBreakupToPayoutRecord(
  baseRecord: PlatformPayoutRecord,
  rawModel: SwiggyPayoutBreakupModel,
  syncActualToCalculated = false
): PlatformPayoutRecord {
  const m = recalculateSwiggyBreakupModel(rawModel, syncActualToCalculated);

  const combinedDeliveredOrders = m.orders.swiggyDelivered + m.orders.toingDelivered;
  const combinedCancelledOrders = m.orders.swiggyCancelled + m.orders.toingCancelled;
  const effectiveDeliveredOrders =
    combinedDeliveredOrders > 0 ? combinedDeliveredOrders : m.orders.total;

  const totalDiscounts = round2(
    Math.abs(m.couponDiscounts.total) +
      Math.abs(m.fvoFreebiesDiscounts.total) +
      Math.abs(m.discountOnDeliveryFee.total)
  );

  const deliveryAndCustomerGstAdded = round2(
    m.gstCollected.total + m.deliveryFee.total + m.gstOnDeliveryFee.total
  );

  const commAbs = Math.abs(m.commission.total);
  const pgAbs = Math.abs(m.paymentCollectionCharges.total);
  const assureAbs = Math.abs(m.swiggyAssureFee.total);
  const cancelTotalAbs = round2(
    Math.abs(m.customerComplaintsAndCancellation.total) +
      Math.abs(m.restaurantCancellationCharges.total)
  );
  const adsAbs = Math.abs(m.growthInvestmentInAds.total);

  // Remaining fee lines & Other Charges/Refunds -> otherChargesBreakdown
  const otherBreakdown: PayoutOtherChargeItem[] = [];
  const pushDeductionIfNonZero = (id: string, label: string, q: SwiggyQuintet) => {
    const dedAmt = round2(-q.total); // negative in Swiggy sheet -> positive deduction on PlatformPayoutRecord
    if (Math.abs(dedAmt) >= 0.01) {
      otherBreakdown.push({ id, label, amount: dedAmt });
    }
  };

  pushDeductionIfNonZero('swiggy-long-distance', 'Long Distance Charges', m.longDistanceCharges);
  pushDeductionIfNonZero('swiggy-pocket-hero', 'Pocket Hero Fees', m.pocketHeroFees);
  pushDeductionIfNonZero('swiggy-one-fees', 'Swiggy One Fees', m.swiggyOneFees);
  pushDeductionIfNonZero('swiggy-call-center', 'Call Center Charges', m.callCenterCharges);
  pushDeductionIfNonZero(
    'swiggy-deliv-sponsored',
    'Delivery Fee sponsored by Restaurant',
    m.deliveryFeeSponsoredByRestaurant
  );
  pushDeductionIfNonZero('swiggy-bolt-fees', 'Bolt fees', m.boltFees);
  for (const ex of m.extraSwiggyFees) {
    pushDeductionIfNonZero(ex.id, ex.label, ex.values);
  }
  pushDeductionIfNonZero(
    'swiggy-other-charges-refunds',
    'Other Charges and Refunds',
    m.otherChargesAndRefunds
  );
  for (const ex of m.extraOtherChargesAndRefunds) {
    pushDeductionIfNonZero(ex.id, ex.label, ex.values);
  }

  const otherPlatformFees = round2(
    otherBreakdown.reduce((s, item) => s + item.amount, 0)
  );

  const gstCombined = round2(
    Math.abs(m.gstDeduction.total) + Math.abs(m.gstOnServiceFee18.total)
  );
  const tcsAbs = Math.abs(m.tcs.total);
  const tdsAbs = Math.abs(m.tds.total);

  const settlementDifference = round2(m.calculatedNetPayout - m.reportedNetPayout);

  return {
    ...baseRecord,
    platform: 'swiggy', // Swiggy + Toing combined and reported as Swiggy
    outletId: m.outletLocation || baseRecord.outletId,
    accountId: m.resId ?? baseRecord.accountId,
    accountName: m.brandName ?? baseRecord.accountName,
    weekLabel: m.settlementPeriodLabel ?? baseRecord.weekLabel,
    payoutStartDate: m.payoutStartDate ?? baseRecord.payoutStartDate,
    payoutEndDate: m.payoutEndDate ?? baseRecord.payoutEndDate,
    orderCount: effectiveDeliveredOrders,
    cancelledOrders: combinedCancelledOrders,
    grossSales: m.itemTotal.total,
    packagingCharges: m.packagingCharges.total,
    deliveryChargesCollected: deliveryAndCustomerGstAdded,
    customerDiscounts: totalDiscounts,
    netSales: m.totalCustomerPaid.total,
    commissionRate:
      m.itemTotal.total > 0 ? round2((commAbs / m.itemTotal.total) * 100) : 0,
    commissionAmount: commAbs,
    paymentGatewayFee: pgAbs,
    advertisingSpend: adsAbs,
    cancellationCharges: cancelTotalAbs,
    swiggyAssureFee: assureAbs,
    otherPlatformFees,
    otherChargesBreakdown: otherBreakdown,
    gstOnCommission: gstCombined,
    tcsDeduction: tcsAbs,
    tdsDeduction: tdsAbs,
    hyperpureRecovery: 0,
    calculatedNetPayout: m.calculatedNetPayout,
    actualBankSettlement: m.reportedNetPayout,
    settlementDifference,
    status: Math.abs(settlementDifference) <= 10 ? 'reconciled' : 'discrepancy',
    swiggyBreakup: m,
  };
}

/**
 * Locates the Swiggy "Payout Breakup" (or Summary Breakup) sheet inside a workbook.
 */
export function findSwiggyPayoutBreakupSheetName(workbook: XLSX.WorkBook): string | null {
  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ')
      .replace(/\bbreak\s+up\b/g, 'breakup');

  const sheetHasSwiggyBreakupMarkers = (sheetName: string): boolean => {
    const ws = workbook.Sheets[sheetName];
    if (!ws) return false;
    const sampleRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    const text = sampleRows
      .slice(0, 45)
      .map((r) => (r || []).slice(0, 10).join(' '))
      .join(' \n ')
      .toLowerCase();
    return (
      text.includes('total customer paid') ||
      text.includes('swiggy fees') ||
      text.includes('toing orders') ||
      text.includes('swiggy orders') ||
      (text.includes('item total') && text.includes('net payout'))
    );
  };

  // 1. Prefer sheet explicitly named "Payout Breakup"
  const exactPayoutBreakup = workbook.SheetNames.find(
    (n) => normalize(n) === 'payout breakup' || normalize(n).includes('payout breakup')
  );
  if (exactPayoutBreakup && sheetHasSwiggyBreakupMarkers(exactPayoutBreakup)) {
    return exactPayoutBreakup;
  }

  // 2. Scan any sheet (excluding large raw order-level sheets) containing Swiggy Breakup markers
  for (const name of workbook.SheetNames) {
    const norm = normalize(name);
    if (norm.includes('all orders') || norm.includes('order level')) continue;
    if (sheetHasSwiggyBreakupMarkers(name)) return name;
  }

  if (exactPayoutBreakup) return exactPayoutBreakup;
  return null;
}

/**
 * Determines whether an uploaded workbook is a Swiggy (or Toing) Payout report
 * containing a Swiggy Payout Breakup sheet.
 */
export function isSwiggyBreakupWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
  sampleText: string,
  preferredPlatform?: 'auto' | 'swiggy' | 'zomato' | 'ownly',
  matchedMapping?: AggregatorBrandOutletMapping | null
): boolean {
  if (preferredPlatform === 'zomato' || preferredPlatform === 'ownly') return false;
  if (matchedMapping && matchedMapping.platform !== 'swiggy') return false;

  const lowerFile = fileName.toLowerCase();
  if (lowerFile.includes('zomato') || lowerFile.includes('hyperpure') || lowerFile.includes('ownly')) {
    return false;
  }

  const targetSheet = findSwiggyPayoutBreakupSheetName(workbook);
  if (!targetSheet) return false;

  if (preferredPlatform === 'swiggy' || matchedMapping?.platform === 'swiggy') {
    return true;
  }

  const lowerSample = sampleText.toLowerCase();
  if (
    lowerFile.includes('swiggy') ||
    lowerFile.includes('toing') ||
    lowerFile.includes('bundl') ||
    lowerSample.includes('swiggy') ||
    lowerSample.includes('toing orders') ||
    lowerSample.includes('total customer paid') ||
    lowerSample.includes('pocket hero') ||
    lowerSample.includes('bolt fees')
  ) {
    return true;
  }

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

function extractSwiggyDatesAndMonth(
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

/**
 * Parses Swiggy's "Payout Breakup" sheet (combining Swiggy Orders + Toing Orders into Swiggy)
 * into SwiggyPayoutBreakupModel and PlatformPayoutRecord.
 */
export function parseSwiggyPayoutBreakupWorkbook(
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
  model: SwiggyPayoutBreakupModel;
  matchedMapping: AggregatorBrandOutletMapping | null;
  candidateRestaurantId?: string;
} {
  const targetSheetName = findSwiggyPayoutBreakupSheetName(workbook);
  if (!targetSheetName) {
    throw new Error(
      `Swiggy report "${file.name}" does not contain a recognizable Swiggy Payout Breakup sheet.`
    );
  }

  const ws = workbook.Sheets[targetSheetName];
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

  // Collect metadata from Payout Breakup header + Summary/Cover sheet (for Restaurant ID, Brand, Outlet, Period, UTR)
  const breakupMetaSample = rows
    .slice(0, 30)
    .map((r) => r.slice(0, 10).join(' '))
    .join(' \n ');

  const summarySheetName = workbook.SheetNames.find(
    (n) => n !== targetSheetName && /summary|cover|invoice|merchant/i.test(n)
  );
  const summaryMetaSample = summarySheetName
    ? (
        XLSX.utils.sheet_to_json(workbook.Sheets[summarySheetName], {
          header: 1,
          defval: '',
        }) as any[][]
      )
        .slice(0, 30)
        .map((r) => (r || []).slice(0, 10).join(' '))
        .join(' \n ')
    : '';

  // 1. Identify Restaurant ID & Outlet Mapping (762173, 881519, 1174333, 1332609)
  let matchedMapping =
    detectAggregatorMappingFromText(file.name, mappings, 'swiggy') ||
    detectAggregatorMappingFromText(breakupMetaSample, mappings, 'swiggy') ||
    detectAggregatorMappingFromText(summaryMetaSample, mappings, 'swiggy');

  let candidateResId =
    matchedMapping?.restaurantId || extractCandidateRestaurantIdFromFilename(file.name);
  if (!candidateResId) {
    const resMatch = `${breakupMetaSample}\n${summaryMetaSample}`.match(
      /(?:restaurant\s*id|res\.?\s*id|partner\s*id|store\s*id|merchant\s*id|rest\.?\s*id)[\s:=-]*(\d{5,10})/i
    );
    if (resMatch) {
      candidateResId = resMatch[1];
      if (!matchedMapping) {
        matchedMapping = detectAggregatorMappingFromText(candidateResId, mappings, 'swiggy');
      }
    }
  }

  const utrMatch = `${breakupMetaSample}\n${summaryMetaSample}`.match(
    /\b(?:utr|bank\s*ref(?:erence)?(?:\s*no\.?)?|neft|rtgs|imps)[\s:=-]*([A-Z0-9]{8,28})\b/i
  );
  const extractedUtr = utrMatch ? utrMatch[1] : undefined;

  const periodInfo = extractSwiggyDatesAndMonth(
    [file.name, breakupMetaSample, summaryMetaSample],
    options?.fallbackMonth
  );
  const effectivePeriodType: 'monthly' | 'weekly' = periodInfo.isWeekly
    ? 'weekly'
    : options?.preferredPeriodType || 'monthly';

  // 2. Detect Column Layout:
  //    Particulars | Swiggy Delivered | Swiggy Cancelled | [Toing Delivered | Toing Cancelled] | Total
  let headerRowIdx = -1;
  let particularsCol = 0;
  let swiggyDelCol = -1;
  let swiggyCanCol = -1;
  let toingDelCol = -1;
  let toingCanCol = -1;
  let totalCol = -1;
  let hasToingColumns = false;

  for (let r = 0; r < Math.min(rows.length, 35); r++) {
    const cur = rows[r] || [];
    const prev = r > 0 ? rows[r - 1] || [] : [];
    const maxCols = Math.max(cur.length, prev.length);
    if (maxCols < 2) continue;

    const subHeaders = Array.from({ length: Math.min(maxCols, 16) }, (_, c) =>
      String(cur[c] ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    );
    const superHeaders = Array.from({ length: Math.min(maxCols, 16) }, (_, c) =>
      String(prev[c] ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    );

    // Propagate horizontal group headers ("Swiggy Orders", "Toing Orders") across merged cells
    let activeGroup = '';
    const effectiveGroup: string[] = [];
    for (let c = 0; c < subHeaders.length; c++) {
      if (superHeaders[c].includes('swiggy')) activeGroup = 'swiggy';
      else if (superHeaders[c].includes('toing')) activeGroup = 'toing';
      else if (superHeaders[c].includes('total') || subHeaders[c] === 'total') activeGroup = '';
      effectiveGroup.push(activeGroup);
    }

    const delIndices: number[] = [];
    const canIndices: number[] = [];
    let pIdx = -1;
    let totIdx = -1;

    for (let c = 0; c < subHeaders.length; c++) {
      const sh = subHeaders[c];
      if (pIdx === -1 && /^(particulars?|description|component|breakup)$/.test(sh)) {
        pIdx = c;
      } else if (/\bdelivered\b/.test(sh)) {
        delIndices.push(c);
      } else if (/\bcancelled|rejected\b/.test(sh)) {
        canIndices.push(c);
      } else if (/^total(\s*amount|\s*inr)?$/.test(sh) || /^total$/i.test(superHeaders[c])) {
        totIdx = c;
      }
    }

    if (delIndices.length >= 1 && (canIndices.length >= 1 || totIdx !== -1)) {
      headerRowIdx = r;
      particularsCol = pIdx !== -1 ? pIdx : Math.max(0, delIndices[0] - 1);

      if (delIndices.length >= 2) {
        // 5-value-column layout: Swiggy Orders (Delivered, Cancelled) + Toing Orders (Delivered, Cancelled) + Total
        const toingDelCandidate = delIndices.find((idx) => effectiveGroup[idx] === 'toing');
        const swiggyDelCandidate = delIndices.find((idx) => effectiveGroup[idx] !== 'toing');
        swiggyDelCol = swiggyDelCandidate ?? delIndices[0];
        toingDelCol =
          toingDelCandidate ?? delIndices.find((idx) => idx !== swiggyDelCol) ?? delIndices[1];

        swiggyCanCol =
          canIndices.find((idx) => idx > swiggyDelCol && idx < toingDelCol) ??
          canIndices[0] ??
          -1;
        toingCanCol =
          canIndices.find((idx) => idx > toingDelCol) ??
          (canIndices.length >= 2 ? canIndices[1] : -1);
        hasToingColumns = true;
      } else {
        // 3-value-column layout: Delivered Orders | Cancelled Orders | Total
        swiggyDelCol = delIndices[0];
        swiggyCanCol = canIndices.find((idx) => idx > swiggyDelCol) ?? canIndices[0] ?? -1;
        hasToingColumns = false;
      }

      if (totIdx !== -1) {
        totalCol = totIdx;
      } else {
        const maxOrderCol = Math.max(swiggyDelCol, swiggyCanCol, toingDelCol, toingCanCol);
        totalCol = maxOrderCol + 1;
      }
      break;
    }
  }

  // Fallback for 2-column Particulars | Total layout
  if (headerRowIdx === -1) {
    for (let r = 0; r < Math.min(rows.length, 35); r++) {
      const cur = rows[r] || [];
      const headers = cur
        .slice(0, 10)
        .map((c: any) => String(c ?? '').replace(/\s+/g, ' ').trim().toLowerCase());
      const pIdx = headers.findIndex((h) => /^(particulars?|description|breakup)$/.test(h));
      if (pIdx !== -1) {
        const totIdx = headers.findIndex(
          (h, idx) => idx > pIdx && /\b(total|amount|value|inr)\b/.test(h)
        );
        if (totIdx !== -1) {
          headerRowIdx = r;
          particularsCol = pIdx;
          totalCol = totIdx;
          break;
        }
      }
    }
  }

  const maxTextColExclusive =
    swiggyDelCol > 0
      ? swiggyDelCol
      : totalCol > 0
      ? totalCol
      : particularsCol + 1;

  // 3. Parse rows strictly from the Swiggy Payout Breakup sheet
  const draft = createEmptySwiggyBreakupModel({
    sheetNameUsed: targetSheetName,
    hasToingColumns: hasToingColumns || true, // Always show Swiggy + Toing columns per template
    resId: matchedMapping?.restaurantId || candidateResId,
    brandName: matchedMapping?.brandName,
    outletLocation: matchedMapping?.outletId,
    settlementPeriodLabel: periodInfo.periodLabel,
    payoutStartDate: periodInfo.startDate,
    payoutEndDate: periodInfo.endDate,
    utrNumber: extractedUtr,
  });

  const rawSheetRows: SwiggyBreakupRowItem[] = [];
  const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
  let activeSection:
    | 'top'
    | 'customerPaid'
    | 'swiggyFees'
    | 'complaints'
    | 'ads'
    | 'otherCharges'
    | 'taxes'
    | 'netPayout' = 'top';

  const readColVal = (row: any[], colIdx: number) =>
    colIdx >= 0 && colIdx < row.length
      ? parseZomatoCurrencyCell(row[colIdx])
      : { hasNumber: false, value: 0 };

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const textParts: string[] = [];
    for (let c = 0; c < Math.min(row.length, maxTextColExclusive); c++) {
      const s = String(row[c] ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (!s) continue;
      if (/^(s\.?\s*no\.?|#|\d+\.?)$/i.test(s) && c < particularsCol) continue;
      textParts.push(s);
    }
    const particulars = textParts.join(' ').trim();
    if (!particulars) continue;

    if (/^(swiggy\s*orders|toing\s*orders|particulars|delivered\s*orders)$/i.test(particulars)) {
      continue;
    }

    const sdCell = readColVal(row, swiggyDelCol);
    const scCell = readColVal(row, swiggyCanCol);
    const tdCell = readColVal(row, toingDelCol);
    const tcCell = readColVal(row, toingCanCol);
    let totCell = readColVal(row, totalCol);

    let hasAnyNumber =
      sdCell.hasNumber ||
      scCell.hasNumber ||
      tdCell.hasNumber ||
      tcCell.hasNumber ||
      totCell.hasNumber;

    if (!hasAnyNumber) {
      // Fallback scan right of text column if sheet had no standard header
      for (let c = maxTextColExclusive; c < Math.min(row.length, maxTextColExclusive + 7); c++) {
        const p = parseZomatoCurrencyCell(row[c]);
        if (p.hasNumber) {
          totCell = p;
          hasAnyNumber = true;
        }
      }
    }

    if (!hasAnyNumber) continue;

    // Ignore non-financial ID rows
    const norm = particulars.toLowerCase().replace(/\s+/g, ' ').trim();
    if (
      /\b(restaurant\s*id|res\.?\s*id|partner\s*id|gstin|pan\b|bank\s*account|ifsc|utr|invoice\s*no)\b/i.test(
        norm
      )
    ) {
      if (/restaurant\s*id|res\.?\s*id/i.test(norm) && !draft.resId && totCell.value > 10000) {
        draft.resId = String(Math.round(totCell.value));
      }
      continue;
    }

    const rawQuintet = makeQuintet(
      sdCell.hasNumber ? sdCell.value : 0,
      scCell.hasNumber ? scCell.value : 0,
      tdCell.hasNumber ? tdCell.value : 0,
      tcCell.hasNumber ? tcCell.value : 0,
      totCell.hasNumber ? totCell.value : undefined
    );

    let mappedField = 'unmapped';

    // --- Top Row: Orders ---
    if (/^(number\s*of\s*)?orders(\s*count)?$/i.test(norm) || /^total\s*orders$/i.test(norm)) {
      draft.orders = posQuintet(rawQuintet, true);
      mappedField = 'orders';
    }
    // --- Section 1: Total Customer Paid & 8 child rows ---
    else if (/^total\s*customer\s*paid$/i.test(norm) || /^customer\s*payable$/i.test(norm)) {
      draft.reportedTotalCustomerPaid = signedQuintet(rawQuintet);
      activeSection = 'customerPaid';
      mappedField = 'totalCustomerPaid';
    } else if (/^item\s*total$/i.test(norm) || /^subtotal(\s*\(items?\s*total\))?$/i.test(norm)) {
      draft.itemTotal = posQuintet(rawQuintet);
      activeSection = 'customerPaid';
      mappedField = 'itemTotal';
    } else if (/^packaging\s*charges?$/i.test(norm) || /^restaurant\s*packaging/i.test(norm)) {
      draft.packagingCharges = posQuintet(rawQuintet);
      mappedField = 'packagingCharges';
    } else if (
      /restaurant\s*discounts?\s*\(\s*coupon/i.test(norm) ||
      /^coupon\s*discounts?$/i.test(norm)
    ) {
      draft.couponDiscounts = negQuintet(rawQuintet);
      mappedField = 'couponDiscounts';
    } else if (
      /restaurant\s*discounts?.*(fvo|freebies|bogo|others)/i.test(norm) ||
      /^restaurant\s*discounts?$/i.test(norm)
    ) {
      draft.fvoFreebiesDiscounts = negQuintet(rawQuintet);
      mappedField = 'fvoFreebiesDiscounts';
    } else if (/^gst\s*collected$/i.test(norm) || /gst\s*collected\s*from\s*customers/i.test(norm)) {
      draft.gstCollected = posQuintet(rawQuintet);
      mappedField = 'gstCollected';
    } else if (/^gst\s*on\s*delivery\s*fee$/i.test(norm)) {
      draft.gstOnDeliveryFee = posQuintet(rawQuintet);
      mappedField = 'gstOnDeliveryFee';
    } else if (/^discount\s*on\s*delivery\s*fee$/i.test(norm)) {
      draft.discountOnDeliveryFee = negQuintet(rawQuintet);
      mappedField = 'discountOnDeliveryFee';
    } else if (/^delivery\s*fee$/i.test(norm) || /^delivery\s*charges?$/i.test(norm)) {
      draft.deliveryFee = posQuintet(rawQuintet);
      mappedField = 'deliveryFee';
    }

    // --- Section 2: Swiggy Fees & child rows ---
    else if (/^(total\s*)?swiggy\s*fees?$/i.test(norm) || /^platform\s*service\s*fees?$/i.test(norm)) {
      draft.reportedSwiggyFees = negQuintet(rawQuintet);
      activeSection = 'swiggyFees';
      mappedField = 'swiggyFees';
    } else if (
      /^commission$/i.test(norm) ||
      /^service\s*fee$/i.test(norm) ||
      /^swiggy\s*commission$/i.test(norm)
    ) {
      draft.commission = negQuintet(rawQuintet);
      activeSection = 'swiggyFees';
      mappedField = 'commission';
    } else if (/^long\s*distance\s*(charges?|enablement\s*fee|fee)$/i.test(norm)) {
      draft.longDistanceCharges = negQuintet(rawQuintet);
      mappedField = 'longDistanceCharges';
    } else if (/^payment\s*(collection|mechanism|gateway)\s*(charges?|fees?)$/i.test(norm)) {
      draft.paymentCollectionCharges = negQuintet(rawQuintet);
      mappedField = 'paymentCollectionCharges';
    } else if (/^pocket\s*hero\s*fees?$/i.test(norm)) {
      draft.pocketHeroFees = negQuintet(rawQuintet);
      mappedField = 'pocketHeroFees';
    } else if (/^swiggy\s*one\s*fees?$/i.test(norm)) {
      draft.swiggyOneFees = negQuintet(rawQuintet);
      mappedField = 'swiggyOneFees';
    } else if (/^restaurant\s*cancellation\s*charges?$/i.test(norm)) {
      draft.restaurantCancellationCharges = negQuintet(rawQuintet);
      mappedField = 'restaurantCancellationCharges';
    } else if (/^call\s*cent(?:er|re)\s*(charges?|fees?)$/i.test(norm)) {
      draft.callCenterCharges = negQuintet(rawQuintet);
      mappedField = 'callCenterCharges';
    } else if (/delivery\s*fee\s*sponsored\s*by\s*restaurant/i.test(norm)) {
      draft.deliveryFeeSponsoredByRestaurant = negQuintet(rawQuintet);
      mappedField = 'deliveryFeeSponsoredByRestaurant';
    } else if (/^bolt\s*fees?$/i.test(norm)) {
      draft.boltFees = negQuintet(rawQuintet);
      mappedField = 'boltFees';
    } else if (/\bswiggy\s*assure\b|\bassure\s*fee\b/i.test(norm)) {
      draft.swiggyAssureFee = negQuintet(rawQuintet);
      mappedField = 'swiggyAssureFee';
    }

    // --- Section 3: Customer Complaints & Cancellation Charges ---
    else if (/^customer\s*complaints?\s*&\s*cancellation\s*charges?$/i.test(norm)) {
      draft.reportedCustomerComplaintsAndCancellation = negQuintet(rawQuintet);
      activeSection = 'complaints';
      mappedField = 'customerComplaintsAndCancellation';
    } else if (/merchant\s*share\s*of\s*cancelled\s*orders/i.test(norm)) {
      draft.merchantShareCancelledOrders = negQuintet(rawQuintet);
      activeSection = 'complaints';
      mappedField = 'merchantShareCancelledOrders';
    } else if (/refund\s*for\s*customer\s*complaints?/i.test(norm)) {
      draft.refundForCustomerComplaints = negQuintet(rawQuintet);
      activeSection = 'complaints';
      mappedField = 'refundForCustomerComplaints';
    }

    // --- Section 4: Growth Investment In Ads & Other Charges and Refunds ---
    else if (
      /growth\s*investment\s*in\s*ads/i.test(norm) ||
      /^(cpc\s*)?ads?(\s*spend|\s*charges?)?$/i.test(norm)
    ) {
      draft.growthInvestmentInAds = negQuintet(rawQuintet);
      activeSection = 'ads';
      mappedField = 'growthInvestmentInAds';
    } else if (/^other\s*charges?\s*(and|&)\s*refunds?$/i.test(norm)) {
      draft.otherChargesAndRefunds = signedQuintet(rawQuintet);
      activeSection = 'otherCharges';
      mappedField = 'otherChargesAndRefunds';
    }

    // --- Section 5: Total Taxes & 4 child rows ---
    else if (/^total\s*taxes$/i.test(norm) || /^government\s*charges$/i.test(norm)) {
      draft.reportedTotalTaxes = negQuintet(rawQuintet);
      activeSection = 'taxes';
      mappedField = 'totalTaxes';
    } else if (
      /^gst\s*deduction$/i.test(norm) ||
      /section\s*9\s*\(\s*5\s*\)/i.test(norm)
    ) {
      draft.gstDeduction = negQuintet(rawQuintet);
      activeSection = 'taxes';
      mappedField = 'gstDeduction';
    } else if (/^tcs\b/i.test(norm) || /tax\s*collected\s*at\s*source/i.test(norm)) {
      draft.tcs = negQuintet(rawQuintet);
      activeSection = 'taxes';
      mappedField = 'tcs';
    } else if (/^tds\b/i.test(norm) || /194\s*-?\s*o/i.test(norm)) {
      draft.tds = negQuintet(rawQuintet);
      activeSection = 'taxes';
      mappedField = 'tds';
    } else if (/gst\s*on\s*service\s*fee/i.test(norm) || /gst\s*@\s*18%/i.test(norm)) {
      draft.gstOnServiceFee18 = negQuintet(rawQuintet);
      activeSection = 'taxes';
      mappedField = 'gstOnServiceFee18';
    }

    // --- Section 6: Net Payout ---
    else if (
      /^(total\s*|final\s*)?net\s*payout$/i.test(norm) ||
      /^bank\s*settlement$/i.test(norm)
    ) {
      draft.reportedNetPayoutQuintet = signedQuintet(rawQuintet);
      draft.hasExplicitReportedNetPayout = true;
      draft.reportedNetPayout = draft.reportedNetPayoutQuintet.total;
      activeSection = 'netPayout';
      mappedField = 'netPayout';
    }

    // --- Dynamic Extra Fee / Charge Rows ---
    else if (activeSection === 'swiggyFees' && Math.abs(rawQuintet.total) >= 0.01) {
      draft.extraSwiggyFees.push({
        id: `swiggy-extra-fee-${draft.extraSwiggyFees.length + 1}`,
        label: particulars,
        values: negQuintet(rawQuintet),
      });
      mappedField = 'extraSwiggyFee';
    } else if (
      (activeSection === 'otherCharges' || activeSection === 'ads') &&
      Math.abs(rawQuintet.total) >= 0.01
    ) {
      draft.extraOtherChargesAndRefunds.push({
        id: `swiggy-extra-other-${draft.extraOtherChargesAndRefunds.length + 1}`,
        label: particulars,
        values: signedQuintet(rawQuintet),
      });
      mappedField = 'extraOtherChargeOrRefund';
    }

    rawSheetRows.push({
      id: `sw-row-${r + 1}`,
      particulars,
      swiggyDelivered: rawQuintet.swiggyDelivered,
      swiggyCancelled: rawQuintet.swiggyCancelled,
      toingDelivered: rawQuintet.toingDelivered,
      toingCancelled: rawQuintet.toingCancelled,
      totalValue: rawQuintet.total,
      mappedField,
    });
  }

  draft.rawSheetRows = rawSheetRows;

  // Re-check Restaurant ID mapping if discovered inside sheet
  if (!matchedMapping && draft.resId) {
    matchedMapping = detectAggregatorMappingFromText(draft.resId, mappings, 'swiggy');
  }

  const lowerCombinedMeta = `${file.name} ${breakupMetaSample} ${summaryMetaSample}`.toLowerCase();
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
      : 'Swiggy Account');

  const resolvedResId = matchedMapping?.restaurantId || draft.resId || candidateResId;

  draft.resId = resolvedResId;
  draft.brandName = resolvedBrand;
  draft.outletLocation = resolvedOutlet;

  const syncToCalculated = !draft.hasExplicitReportedNetPayout;
  const finalizedModel = recalculateSwiggyBreakupModel(draft, syncToCalculated);

  const baseRecord: PlatformPayoutRecord = {
    id: `PAYOUT-SWIGGY-${resolvedResId || resolvedOutlet.toUpperCase()}-${periodInfo.month}-${Date.now()}`,
    outletId: resolvedOutlet,
    month: periodInfo.month,
    platform: 'swiggy', // Swiggy + Toing combined as Swiggy
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
    swiggyBreakup: finalizedModel,
  };

  const payout = applySwiggyBreakupToPayoutRecord(
    baseRecord,
    finalizedModel,
    syncToCalculated
  );

  return {
    payout,
    model: payout.swiggyBreakup!,
    matchedMapping,
    candidateRestaurantId: resolvedResId,
  };
}
