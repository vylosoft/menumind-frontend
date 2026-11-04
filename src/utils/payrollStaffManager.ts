/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StaffMember, MonthlyPayrollSnapshot, PayrollAuditLog, StaffTransferRecord } from '../types/payrollStaff';
import { INITIAL_STAFF_DIRECTORY, INITIAL_PAYROLL_AUDIT_LOGS } from '../data/demoStaffDirectory';

const STORAGE_KEY_STAFF = 'menumind_staff_directory_v1';
const STORAGE_KEY_PAYROLL = 'menumind_payroll_snapshots_v1';
const STORAGE_KEY_AUDIT = 'menumind_payroll_audit_v1';

const DEMO_STAFF_IDS = new Set([
  'EMP-WF-001', 'EMP-WF-002', 'EMP-WF-003', 'EMP-WF-004', 'EMP-WF-005', 'EMP-WF-006',
  'EMP-BW-001', 'EMP-BW-002', 'EMP-BW-003', 'EMP-BW-004', 'EMP-BW-005', 'EMP-BW-006',
]);

/**
 * Load staff directory from localStorage or return empty array.
 */
export function getSavedStaffDirectory(): StaffMember[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STAFF);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Only filter out the predefined demo seed staff members, preserving all real staff records
        return parsed.filter(
          (s: any) => !DEMO_STAFF_IDS.has(s.id) && !s.isDemo
        );
      }
    }
  } catch (e) {
    console.error('Error loading saved staff directory:', e);
  }
  return [];
}

export function saveStaffDirectory(staff: StaffMember[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_STAFF, JSON.stringify(staff));
  } catch (e) {
    console.error('Error saving staff directory:', e);
  }
}

/**
 * Load audit logs from localStorage or return empty array.
 */
export function getSavedAuditLogs(): PayrollAuditLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUDIT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((l: any) => !l.id?.startsWith('AUDIT-DEMO-'));
      }
    }
  } catch (e) {
    console.error('Error loading audit logs:', e);
  }
  return [];
}

export function addAuditLog(entry: Omit<PayrollAuditLog, 'id' | 'timestamp'>): void {
  try {
    const existing = getSavedAuditLogs();
    const newLog: PayrollAuditLog = {
      id: `AUDIT-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    const updated = [newLog, ...existing.slice(0, 99)]; // retain recent 100
    localStorage.setItem(STORAGE_KEY_AUDIT, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving audit log:', e);
  }
}

/**
 * Computes individual monthly payroll snapshot for an employee:
 * - Apportions base salary and benefits based on outlet allocation percentage
 * - Applies strict ₹130/day food allowance (managers excluded)
 * - Computes total employer cost vs net cash payable
 */
export function computeEmployeePayrollSnapshot(
  staff: StaffMember,
  month: string = '2026-10',
  daysWorked: number = 30,
  targetOutlet?: 'banaswadi' | 'whitefield'
): MonthlyPayrollSnapshot {
  // If target outlet specified and employee has a split allocation:
  const isPrimary = !targetOutlet || staff.outletId === targetOutlet;
  const allocationPct = isPrimary
    ? staff.primaryOutletAllocationPct || 100
    : 100 - (staff.primaryOutletAllocationPct || 100);

  const allocationMultiplier = allocationPct / 100;

  // Pro-rata days calculation (capped at 30)
  const effectiveDays = Math.min(30, Math.max(0, daysWorked));
  const fullMonthDays = 30;
  const attendanceRatio = effectiveDays / fullMonthDays;

  // Apportioned base salary
  const baseSalaryAllocated = Math.round(staff.baseSalary * allocationMultiplier * attendanceRatio);

  // Food allowance: only if eligible and NOT manager
  const isEligible = staff.isFoodAllowanceEligible && staff.role !== 'Manager';
  const foodRate = staff.foodAllowanceRatePerDay || 130;
  const calculatedFoodAllowance = isEligible
    ? Math.round(effectiveDays * foodRate * allocationMultiplier)
    : 0;

  const insuranceCost = Math.round((staff.insurancePremiumMonthly || 1500) * allocationMultiplier);
  const otherEmployerCosts = Math.round((staff.otherEmployerCosts || 0) * allocationMultiplier);

  // Employer Total Cost = Base + Food Allowance + Insurance + Other Employer Costs
  const totalEmployerCost =
    baseSalaryAllocated + calculatedFoodAllowance + insuranceCost + otherEmployerCosts;

  // Employee Net Cash Payable = Base + Food Allowance + Other Allowances - Advances - Adjustments
  const advances = Math.round((staff.salaryAdvances || 0) * allocationMultiplier);
  const adjustments = Math.round((staff.payrollAdjustments || 0) * allocationMultiplier);
  const otherAllowances = Math.round((staff.otherAllowances || 0) * allocationMultiplier);

  const netPayableToEmployee = Math.max(
    0,
    baseSalaryAllocated + calculatedFoodAllowance + otherAllowances - advances + adjustments
  );

  return {
    id: `PAY-${month}-${staff.id}-${targetOutlet || staff.outletId}`,
    month,
    staffId: staff.id,
    staffName: staff.name,
    role: staff.role,
    outletId: targetOutlet || staff.outletId,
    secondaryOutletId: staff.secondaryOutletId,
    primaryAllocationPct: allocationPct,
    daysWorked: effectiveDays,
    effectiveBaseSalary: baseSalaryAllocated,
    calculatedFoodAllowance,
    insuranceCost,
    otherEmployerCosts,
    salaryAdvancesDeducted: advances,
    payrollAdjustments: adjustments,
    totalEmployerCost,
    netPayableToEmployee,
    paymentStatus: 'Approved',
    isAudited: true,
  };
}

/**
 * Aggregates monthly payroll total employer cost for P&L insertion.
 * Authoritative ledger: avoids double counting between payroll and manual expenses.
 */
export function aggregatePayrollForPnL(
  staffList: StaffMember[],
  month: string = '2026-10',
  outlet: 'banaswadi' | 'whitefield' | 'consolidated'
): {
  salariesTotal: number;
  foodAllowancesTotal: number;
  insuranceTotal: number;
  otherEmployerCostsTotal: number;
  totalPayrollExpense: number;
  headcount: number;
} {
  let salariesTotal = 0;
  let foodAllowancesTotal = 0;
  let insuranceTotal = 0;
  let otherEmployerCostsTotal = 0;
  let headcount = 0;

  staffList
    .filter((s) => s.status === 'active')
    .forEach((s) => {
      if (outlet === 'consolidated') {
        const snap = computeEmployeePayrollSnapshot(s, month, 30);
        salariesTotal += snap.effectiveBaseSalary;
        foodAllowancesTotal += snap.calculatedFoodAllowance;
        insuranceTotal += snap.insuranceCost;
        otherEmployerCostsTotal += snap.otherEmployerCosts;
        headcount += 1;
      } else {
        // Handle single outlet or split transfer allocation
        if (s.outletId === outlet) {
          const snap = computeEmployeePayrollSnapshot(s, month, 30, outlet);
          salariesTotal += snap.effectiveBaseSalary;
          foodAllowancesTotal += snap.calculatedFoodAllowance;
          insuranceTotal += snap.insuranceCost;
          otherEmployerCostsTotal += snap.otherEmployerCosts;
          headcount += 1;
        } else if (s.secondaryOutletId === outlet) {
          const snap = computeEmployeePayrollSnapshot(s, month, 30, outlet);
          salariesTotal += snap.effectiveBaseSalary;
          foodAllowancesTotal += snap.calculatedFoodAllowance;
          insuranceTotal += snap.insuranceCost;
          otherEmployerCostsTotal += snap.otherEmployerCosts;
        }
      }
    });

  const totalPayrollExpense =
    salariesTotal + foodAllowancesTotal + insuranceTotal + otherEmployerCostsTotal;

  return {
    salariesTotal,
    foodAllowancesTotal,
    insuranceTotal,
    otherEmployerCostsTotal,
    totalPayrollExpense,
    headcount,
  };
}
