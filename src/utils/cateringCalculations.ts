/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CateringOrder, CateringSummaryMetrics } from '../types/catering';
import { RawSalesRecord } from '../types/restaurant';

/**
 * Checks for potential duplicate catering orders against Petpooja sales records,
 * Ownly, or WhatsApp orders based on invoice numbers, dates, and amounts.
 */
export function checkCateringDuplicate(
  order: Partial<CateringOrder>,
  petpoojaRecords: RawSalesRecord[] = []
): { isDuplicate: boolean; suspectedSource?: string; reason?: string } {
  // 1. Explicit Petpooja bill number check
  if (order.posInvoiceStatus === 'generated_in_petpooja' || order.petpoojaInvoiceNo) {
    return {
      isDuplicate: true,
      suspectedSource: `Petpooja Bill #${order.petpoojaInvoiceNo || 'Reported'}`,
      reason: 'Order was recorded on POS terminal. Must be excluded from non-Petpooja addition to avoid double counting.',
    };
  }

  // 2. Scan Petpooja records on the same date with matching or near-matching amounts
  if (order.eventDate && order.agreedOrderValue) {
    const matchingDateRecords = petpoojaRecords.filter(
      (r) => r.date === order.eventDate && Math.abs(r.revenue - order.agreedOrderValue!) <= 50
    );
    if (matchingDateRecords.length > 0) {
      return {
        isDuplicate: true,
        suspectedSource: `Petpooja Sales row ${matchingDateRecords[0].rowId} on ${order.eventDate} (₹${matchingDateRecords[0].revenue})`,
        reason: 'Identical date and transaction value detected in Petpooja POS dataset.',
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Computes direct catering unit economics:
 * Catering Contribution = Recognized Revenue - Total Direct Variable Costs
 * Direct Costs include: Ingredients, Packaging, Transportation/Delivery, Temporary Staff, Venue/Equipment, and other direct expenses.
 * Notice: Shared outlet rent and fixed monthly salaries are NOT deducted here to prevent double-counting.
 */
export function computeCateringEconomics(order: CateringOrder): {
  netRecognizedValue: number;
  totalDirectVariableCost: number;
  cateringContribution: number;
  cateringContributionPct: number;
  isRevenueRecognized: boolean;
} {
  const isRevenueRecognized =
    (order.status === 'completed' || order.status === 'fully_paid') && !order.duplicateConfirmed;

  const netRecognizedValue = isRevenueRecognized
    ? Math.max(
        0,
        order.agreedOrderValue -
          (order.customerDiscount || 0) +
          (order.additionalDeliveryCharges || 0) +
          (order.otherAgreedCharges || 0)
      )
    : 0;

  const exp = order.expenses || {
    ingredientCost: 0,
    packagingCost: 0,
    transportationDeliveryExpense: 0,
    temporaryStaffExpense: 0,
    venueEquipmentExpense: 0,
    otherDirectExpenses: 0,
    totalDirectVariableCost: 0,
  };

  const totalDirectVariableCost =
    exp.ingredientCost +
    exp.packagingCost +
    exp.transportationDeliveryExpense +
    exp.temporaryStaffExpense +
    exp.venueEquipmentExpense +
    exp.otherDirectExpenses;

  const cateringContribution = isRevenueRecognized
    ? netRecognizedValue - totalDirectVariableCost
    : 0;

  const cateringContributionPct =
    netRecognizedValue > 0 ? (cateringContribution / netRecognizedValue) * 100 : 0;

  return {
    netRecognizedValue,
    totalDirectVariableCost,
    cateringContribution,
    cateringContributionPct,
    isRevenueRecognized,
  };
}

/**
 * Calculates summary metrics across catering orders for a given month and outlet filter.
 */
export function computeCateringSummary(
  orders: CateringOrder[],
  selectedMonth: string = '2026-10',
  outletFilter: 'banaswadi' | 'whitefield' | 'consolidated' = 'consolidated'
): CateringSummaryMetrics {
  const filtered = orders.filter((o) => {
    if (outletFilter !== 'consolidated' && o.outletId !== outletFilter) return false;
    return true;
  });

  let totalBookings = filtered.length;
  let completedOrders = 0;
  let totalRecognizedRevenue = 0;
  let totalAdvanceLiabilities = 0;
  let totalOutstandingReceivables = 0;
  let totalDirectExpenses = 0;
  let totalCateringContribution = 0;
  let banaswadiRevenue = 0;
  let whitefieldRevenue = 0;

  filtered.forEach((o) => {
    const isThisMonth =
      o.revenueRecognitionMonth === selectedMonth || o.eventDate.startsWith(selectedMonth);

    // Outstanding customer receivables
    const totalDue =
      o.agreedOrderValue -
      (o.customerDiscount || 0) +
      (o.additionalDeliveryCharges || 0) +
      (o.otherAgreedCharges || 0);
    const balance = Math.max(0, totalDue - (o.totalAmountCollected || 0));
    totalOutstandingReceivables += balance;

    // Advances for unfulfilled/future events are liabilities
    if (o.status !== 'completed' && o.status !== 'cancelled' && o.advanceAmountCollected > 0) {
      totalAdvanceLiabilities += o.advanceAmountCollected;
    }

    // Revenue recognized ONLY if completed and not confirmed duplicate
    if (
      (o.status === 'completed' || o.status === 'fully_paid') &&
      !o.duplicateConfirmed &&
      isThisMonth
    ) {
      completedOrders += 1;
      const recRev = o.netRecognizedValue > 0 ? o.netRecognizedValue : totalDue;
      totalRecognizedRevenue += recRev;

      const directCosts = o.expenses?.totalDirectVariableCost || 0;
      totalDirectExpenses += directCosts;
      totalCateringContribution += recRev - directCosts;

      if (o.outletId === 'banaswadi') {
        banaswadiRevenue += recRev;
      } else {
        whitefieldRevenue += recRev;
      }
    }
  });

  const cateringContributionPct =
    totalRecognizedRevenue > 0
      ? (totalCateringContribution / totalRecognizedRevenue) * 100
      : 0;

  return {
    totalBookings,
    completedOrders,
    totalRecognizedRevenue,
    totalAdvanceLiabilities,
    totalOutstandingReceivables,
    totalDirectExpenses,
    totalCateringContribution,
    cateringContributionPct,
    banaswadiRevenue,
    whitefieldRevenue,
  };
}

/**
 * Returns net valid non-Petpooja catering revenue and direct variable costs for P&L injection.
 */
export function getValidCateringForPnL(
  orders: CateringOrder[],
  month: string = '2026-10',
  outlet: 'banaswadi' | 'whitefield' | 'consolidated'
): {
  cateringNetRevenue: number;
  cateringDirectCosts: number;
  cateringContribution: number;
  cateringOrderCount: number;
} {
  const eligible = orders.filter((o) => {
    if (outlet !== 'consolidated' && o.outletId !== outlet) return false;
    // Only completed orders recognized in the month, and NEVER duplicates with Petpooja
    const isCompleted = o.status === 'completed' || o.status === 'fully_paid';
    const isMonthMatch =
      o.revenueRecognitionMonth === month || o.eventDate.startsWith(month);
    return isCompleted && !o.duplicateConfirmed && isMonthMatch;
  });

  const cateringNetRevenue = eligible.reduce((sum, o) => sum + o.netRecognizedValue, 0);
  const cateringDirectCosts = eligible.reduce(
    (sum, o) => sum + (o.expenses?.totalDirectVariableCost || 0),
    0
  );
  const cateringContribution = cateringNetRevenue - cateringDirectCosts;

  return {
    cateringNetRevenue,
    cateringDirectCosts,
    cateringContribution,
    cateringOrderCount: eligible.length,
  };
}
