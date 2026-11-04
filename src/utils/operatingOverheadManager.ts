/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OutletOperatingExpenseItem, INITIAL_OPERATING_EXPENSE_ITEMS } from '../types/operatingCosts';
import { StaffMember } from '../types/payrollStaff';
import { computeEmployeePayrollSnapshot } from './payrollStaffManager';

const STORAGE_KEY_OVERHEADS = 'menumind_outlet_overheads_v1';

/**
 * Load operating expenses from localStorage or return default 14-item list with 0 values.
 */
export function getSavedOperatingExpenses(): OutletOperatingExpenseItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OVERHEADS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge with defaults to ensure all required items exist
        const itemMap = new Map<string, OutletOperatingExpenseItem>();
        INITIAL_OPERATING_EXPENSE_ITEMS.forEach((def) => itemMap.set(def.id, { ...def }));
        parsed.forEach((p: OutletOperatingExpenseItem) => {
          if (p && p.id) {
            itemMap.set(p.id, { ...itemMap.get(p.id), ...p });
          }
        });
        return Array.from(itemMap.values());
      }
    }
  } catch (e) {
    console.error('Error loading saved operating expenses:', e);
  }
  return INITIAL_OPERATING_EXPENSE_ITEMS.map((item) => ({ ...item }));
}

/**
 * Persist operating expenses to localStorage.
 */
export function saveOperatingExpenses(items: OutletOperatingExpenseItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_OVERHEADS, JSON.stringify(items));
  } catch (e) {
    console.error('Error saving operating expenses:', e);
  }
}

/**
 * Calculate effective amount of an operating expense line item for an outlet or consolidated.
 */
export function calculateEffectiveExpense(
  item: OutletOperatingExpenseItem,
  outlet: 'banaswadi' | 'whitefield' | 'consolidated'
): number {
  if (item.isCombined) {
    const total = Number(item.combinedTotalAmount) || 0;
    if (outlet === 'consolidated') {
      return total;
    }
    const banaswadiPct = item.splitPctBanaswadi ?? 50;
    const whitefieldPct = item.splitPctWhitefield ?? (100 - banaswadiPct);
    if (outlet === 'banaswadi') {
      return Math.round((total * banaswadiPct) / 100);
    }
    return Math.round((total * whitefieldPct) / 100);
  }

  // Non-combined (outlet-specific)
  const bAmount = Number(item.banaswadiAmount) || 0;
  const wAmount = Number(item.whitefieldAmount) || 0;
  if (outlet === 'consolidated') {
    return bAmount + wAmount;
  }
  if (outlet === 'banaswadi') {
    return bAmount;
  }
  return wAmount;
}

/**
 * Total operating overheads across all line items for an outlet.
 */
export function calculateTotalOperatingOverhead(
  items: OutletOperatingExpenseItem[],
  outlet: 'banaswadi' | 'whitefield' | 'consolidated'
): {
  total: number;
  combinedTotal: number;
  directTotal: number;
  byCategoryGroup: Record<string, number>;
} {
  let total = 0;
  let combinedTotal = 0;
  let directTotal = 0;
  const byCategoryGroup: Record<string, number> = {};

  items.forEach((item) => {
    const eff = calculateEffectiveExpense(item, outlet);
    total += eff;

    if (item.isCombined) {
      combinedTotal += eff;
    } else {
      directTotal += eff;
    }

    const group = item.categoryGroup || 'Other';
    byCategoryGroup[group] = (byCategoryGroup[group] || 0) + eff;
  });

  return { total, combinedTotal, directTotal, byCategoryGroup };
}

export interface StaffSalaryTotals {
  activeStaffCount: number;
  totalBaseSalary: number;
  totalFoodAllowance: number;
  totalInsuranceAndOther: number;
  totalEmployerCost: number; // authoritative total monthly salary cost
}

/**
 * Calculates authoritative staff salary cost directly from the Staff & Wages Directory.
 * Supports consolidated, Banaswadi, or Whitefield views, properly handling employee allocations.
 */
export function calculateStaffSalaryTotals(
  staffList: StaffMember[],
  outlet: 'banaswadi' | 'whitefield' | 'consolidated'
): StaffSalaryTotals {
  // Only consider active employees (or on_leave with active payroll)
  const activeStaff = staffList.filter((s) => s.status === 'active' || s.status === 'on_leave');

  let activeStaffCount = 0;
  let totalBaseSalary = 0;
  let totalFoodAllowance = 0;
  let totalInsuranceAndOther = 0;
  let totalEmployerCost = 0;

  activeStaff.forEach((emp) => {
    if (outlet === 'consolidated') {
      // Sum the employee's entire compensation
      const snapshot = computeEmployeePayrollSnapshot(emp, '2026-10', 30);
      activeStaffCount += 1;
      totalBaseSalary += snapshot.effectiveBaseSalary;
      totalFoodAllowance += snapshot.calculatedFoodAllowance;
      totalInsuranceAndOther += snapshot.insuranceCost + snapshot.otherEmployerCosts;
      totalEmployerCost += snapshot.totalEmployerCost;
    } else {
      // Check if employee works at this outlet (either primary or secondary)
      const isPrimary = emp.outletId === outlet;
      const isSecondary = emp.secondaryOutletId === outlet;

      if (isPrimary || isSecondary) {
        const snapshot = computeEmployeePayrollSnapshot(emp, '2026-10', 30, outlet);
        if (snapshot.totalEmployerCost > 0) {
          activeStaffCount += 1;
          totalBaseSalary += snapshot.effectiveBaseSalary;
          totalFoodAllowance += snapshot.calculatedFoodAllowance;
          totalInsuranceAndOther += snapshot.insuranceCost + snapshot.otherEmployerCosts;
          totalEmployerCost += snapshot.totalEmployerCost;
        }
      }
    }
  });

  return {
    activeStaffCount,
    totalBaseSalary,
    totalFoodAllowance,
    totalInsuranceAndOther,
    totalEmployerCost,
  };
}
