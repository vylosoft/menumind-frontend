/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type JobRole =
  | 'Bengali Chef'
  | 'Biryani & Non-Veg Chef'
  | 'Kitchen Helper'
  | 'Bengali Chef Helper'
  | 'Packer'
  | 'Manager'
  | 'Cleaner'
  | 'Cashier'
  | 'Delivery Staff'
  | string;

export type EmploymentStatus = 'active' | 'inactive' | 'on_leave' | 'exited';

export interface StaffMember {
  id: string; // e.g. EMP-WF-001
  name: string;
  role: JobRole;
  outletId: 'banaswadi' | 'whitefield';
  secondaryOutletId?: 'banaswadi' | 'whitefield';
  primaryOutletAllocationPct: number; // e.g. 100 or 50
  joiningDate: string; // YYYY-MM-DD
  lastWorkingDate?: string; // YYYY-MM-DD if exited
  status: EmploymentStatus;

  // Compensation & Benefits
  baseSalary: number;
  salaryEffectiveDate: string; // YYYY-MM-DD
  isFoodAllowanceEligible: boolean; // Managers strictly ineligible by policy
  foodAllowanceRatePerDay: number; // default 130
  maxAllowanceDays: number; // default 30
  insurancePremiumMonthly: number; // default 1500
  otherAllowances: number;
  otherEmployerCosts: number; // PF, gratuity reserve, employer statutory
  salaryAdvances: number;
  payrollAdjustments: number;

  bankAccountNumber?: string;
  bankIfsc?: string;
  notes?: string;
  updatedAt: string;
}

export interface MonthlyPayrollSnapshot {
  id: string; // e.g. PAY-2026-10-EMP-WF-001
  month: string; // YYYY-MM
  staffId: string;
  staffName: string;
  role: JobRole;
  outletId: 'banaswadi' | 'whitefield';
  secondaryOutletId?: 'banaswadi' | 'whitefield';
  primaryAllocationPct: number; // 100 or split
  daysWorked: number;
  effectiveBaseSalary: number;
  calculatedFoodAllowance: number;
  insuranceCost: number;
  otherEmployerCosts: number;
  salaryAdvancesDeducted: number;
  payrollAdjustments: number;

  // Employer Total Cost (to P&L)
  totalEmployerCost: number;
  // Net Cash Payable to Employee
  netPayableToEmployee: number;

  paymentStatus: 'Draft' | 'Approved' | 'Paid' | 'Hold';
  paymentDate?: string;
  paymentMethod?: string;
  isAudited: boolean;
  notes?: string;
}

export interface StaffTransferRecord {
  id: string;
  staffId: string;
  staffName: string;
  fromOutlet: 'banaswadi' | 'whitefield';
  toOutlet: 'banaswadi' | 'whitefield';
  effectiveDate: string;
  allocationMonth: string; // YYYY-MM
  fromOutletAllocationPct: number;
  toOutletAllocationPct: number;
  reason: string;
  approvedBy: string;
  createdAt: string;
}

export interface PayrollAuditLog {
  id: string;
  timestamp: string;
  staffId?: string;
  staffName?: string;
  actor: string;
  action:
    | 'EMPLOYEE_CREATED'
    | 'SALARY_UPDATED'
    | 'ROLE_CHANGED'
    | 'OUTLET_TRANSFERRED'
    | 'ATTENDANCE_CHANGED'
    | 'PAYROLL_APPROVED'
    | 'PAYROLL_ADJUSTMENT'
    | 'STATUS_CHANGED';
  details: string;
  previousValue?: string;
  newValue?: string;
}
