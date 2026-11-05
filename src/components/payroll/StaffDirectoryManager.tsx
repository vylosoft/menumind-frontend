import { appUrl } from '../../lib/appUrl';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { StaffMember, MonthlyPayrollSnapshot, PayrollAuditLog, JobRole } from '../../types/payrollStaff';
import { formatINR, formatPct } from '../../utils/financeCalculations';
import {
  computeEmployeePayrollSnapshot,
  getSavedStaffDirectory,
  saveStaffDirectory,
  getSavedAuditLogs,
  addAuditLog,
} from '../../utils/payrollStaffManager';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  History,
  ShieldCheck,
  Calendar,
  DollarSign,
  Search,
  Lock,
  Building2,
  Sparkles,
  X,
  Cloud,
  DownloadCloud,
  UploadCloud,
  RefreshCw,
} from 'lucide-react';

interface StaffDirectoryManagerProps {
  staffList?: StaffMember[];
  onUpdateStaffList?: (updated: StaffMember[]) => void;
  staff?: StaffMember[];
  onUpdateStaff?: (updated: StaffMember[]) => void;
  selectedMonth?: string;
  onPayrollApproved?: (month: string) => void;
  onOpenSupabaseModal?: () => void;
  onPullFromSupabase?: () => void;
}

const PREDEFINED_ROLES: JobRole[] = [
  'Bengali Chef',
  'Biryani & Non-Veg Chef',
  'Kitchen Helper',
  'Bengali Chef Helper',
  'Packer',
  'Manager',
  'Cleaner',
  'Cashier',
  'Delivery Staff',
  'Other Custom Role',
];

export const StaffDirectoryManager: React.FC<StaffDirectoryManagerProps> = ({
  staffList: propStaffList,
  onUpdateStaffList: propOnUpdateStaffList,
  staff: propStaff,
  onUpdateStaff: propOnUpdateStaff,
  selectedMonth = '2026-10',
  onPayrollApproved,
  onOpenSupabaseModal,
  onPullFromSupabase,
}) => {
  const staffList = propStaffList ?? propStaff ?? [];
  const onUpdateStaffList = propOnUpdateStaffList ?? propOnUpdateStaff ?? (() => {});
  const [activeOutletView, setActiveOutletView] = useState<'all' | 'whitefield' | 'banaswadi'>('all');
  const [activeSubTab, setActiveSubTab] = useState<'directory' | 'payroll_editor' | 'audit_trail'>('directory');
  const [searchTerm, setSearchTerm] = useState('');
  const [isPullingCloud, setIsPullingCloud] = useState(false);
  const [cloudPullNotification, setCloudPullNotification] = useState<string | null>(null);

  const handleDirectPull = async () => {
    if (onPullFromSupabase) {
      onPullFromSupabase();
      return;
    }
    setIsPullingCloud(true);
    try {
      const res = await fetch(appUrl('/api/supabase/pull'));
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        if (Array.isArray(data.data.staffDirectory) && data.data.staffDirectory.length > 0) {
          onUpdateStaffList(data.data.staffDirectory);
          saveStaffDirectory(data.data.staffDirectory);
          setCloudPullNotification(`Retrieved ${data.data.staffDirectory.length} staff records from Supabase table staff_directory!`);
          setTimeout(() => setCloudPullNotification(null), 4000);
        }
      }
    } catch (e: any) {
      console.error('Error pulling staff from Supabase:', e);
    } finally {
      setIsPullingCloud(false);
    }
  };

  // Modals state
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferStaff, setTransferStaff] = useState<StaffMember | null>(null);

  // Form State for Employee Add/Edit
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<JobRole>('Bengali Chef');
  const [customRoleName, setCustomRoleName] = useState('');
  const [formOutlet, setFormOutlet] = useState<'banaswadi' | 'whitefield'>('whitefield');
  const [formBaseSalary, setFormBaseSalary] = useState<number>(25000);
  const [formEffectiveDate, setFormEffectiveDate] = useState('2026-04-01');
  const [formFoodEligible, setFormFoodEligible] = useState(true);
  const [formFoodRate, setFormFoodRate] = useState<number>(130);
  const [formInsurance, setFormInsurance] = useState<number>(1500);
  const [formOtherAllowances, setFormOtherAllowances] = useState<number>(0);
  const [formOtherEmployerCosts, setFormOtherEmployerCosts] = useState<number>(0);
  const [formAdvances, setFormAdvances] = useState<number>(0);
  const [formAdjustments, setFormAdjustments] = useState<number>(0);
  const [formJoiningDate, setFormJoiningDate] = useState('2026-01-01');
  const [formLastWorkingDate, setFormLastWorkingDate] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive' | 'on_leave' | 'exited'>('active');
  const [formNotes, setFormNotes] = useState('');

  // Form State for Outlet Transfer
  const [transferTargetOutlet, setTransferTargetOutlet] = useState<'banaswadi' | 'whitefield'>('banaswadi');
  const [transferEffectiveDate, setTransferEffectiveDate] = useState('2026-10-15');
  const [transferAllocationPct, setTransferAllocationPct] = useState<number>(50); // 50% split
  const [transferReason, setTransferReason] = useState('Durga Puja Festival Kitchen Assistance');

  // Days worked in monthly payroll editor
  const [daysWorkedState, setDaysWorkedState] = useState<Record<string, number>>({});

  // Audit Logs
  const auditLogs = useMemo(() => getSavedAuditLogs(), [staffList]);

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      if (activeOutletView !== 'all' && s.outletId !== activeOutletView && s.secondaryOutletId !== activeOutletView) {
        return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (
          !s.name.toLowerCase().includes(term) &&
          !s.role.toLowerCase().includes(term) &&
          !s.id.toLowerCase().includes(term)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [staffList, activeOutletView, searchTerm]);

  // Compute monthly payroll snapshots
  const payrollSnapshots = useMemo(() => {
    return filteredStaff.map((s) => {
      const days = daysWorkedState[s.id] !== undefined ? daysWorkedState[s.id] : 30;
      return computeEmployeePayrollSnapshot(s, selectedMonth, days);
    });
  }, [filteredStaff, daysWorkedState, selectedMonth]);

  // Aggregates
  const totalBaseCommitment = filteredStaff.reduce((sum, s) => sum + s.baseSalary, 0);
  const totalEmployerPayrollCost = payrollSnapshots.reduce((sum, p) => sum + p.totalEmployerCost, 0);
  const totalNetCashPayable = payrollSnapshots.reduce((sum, p) => sum + p.netPayableToEmployee, 0);
  const totalFoodAllowance = payrollSnapshots.reduce((sum, p) => sum + p.calculatedFoodAllowance, 0);
  const totalInsurance = payrollSnapshots.reduce((sum, p) => sum + p.insuranceCost, 0);

  const handleOpenAdd = () => {
    setEditingStaff(null);
    setFormName('');
    setFormRole('Bengali Chef');
    setCustomRoleName('');
    setFormOutlet(activeOutletView === 'all' ? 'whitefield' : activeOutletView);
    setFormBaseSalary(25000);
    setFormEffectiveDate('2026-04-01');
    setFormFoodEligible(true);
    setFormFoodRate(130);
    setFormInsurance(1500);
    setFormOtherAllowances(0);
    setFormOtherEmployerCosts(0);
    setFormAdvances(0);
    setFormAdjustments(0);
    setFormJoiningDate('2026-01-01');
    setFormLastWorkingDate('');
    setFormStatus('active');
    setFormNotes('');
    setIsEmployeeModalOpen(true);
  };

  const handleOpenEdit = (staff: StaffMember) => {
    setEditingStaff(staff);
    setFormName(staff.name);
    setFormRole(PREDEFINED_ROLES.includes(staff.role) ? staff.role : 'Other Custom Role');
    if (!PREDEFINED_ROLES.includes(staff.role)) setCustomRoleName(staff.role);
    setFormOutlet(staff.outletId);
    setFormBaseSalary(staff.baseSalary);
    setFormEffectiveDate(staff.salaryEffectiveDate || '2026-04-01');
    setFormFoodEligible(staff.isFoodAllowanceEligible);
    setFormFoodRate(staff.foodAllowanceRatePerDay || 130);
    setFormInsurance(staff.insurancePremiumMonthly || 1500);
    setFormOtherAllowances(staff.otherAllowances || 0);
    setFormOtherEmployerCosts(staff.otherEmployerCosts || 0);
    setFormAdvances(staff.salaryAdvances || 0);
    setFormAdjustments(staff.payrollAdjustments || 0);
    setFormJoiningDate(staff.joiningDate || '2026-01-01');
    setFormLastWorkingDate(staff.lastWorkingDate || '');
    setFormStatus(staff.status);
    setFormNotes(staff.notes || '');
    setIsEmployeeModalOpen(true);
  };

  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Employee Name is required.');
      return;
    }

    const finalRole = formRole === 'Other Custom Role' && customRoleName ? customRoleName.trim() : formRole;
    // Policy check: Manager cannot be food allowance eligible
    const finalFoodEligible = finalRole === 'Manager' ? false : formFoodEligible;

    if (editingStaff) {
      // Update existing employee
      const prevSalary = editingStaff.baseSalary;
      const prevRole = editingStaff.role;

      const updated = staffList.map((s) => {
        if (s.id === editingStaff.id) {
          return {
            ...s,
            name: formName.trim(),
            role: finalRole,
            outletId: formOutlet,
            baseSalary: Number(formBaseSalary),
            salaryEffectiveDate: formEffectiveDate,
            isFoodAllowanceEligible: finalFoodEligible,
            foodAllowanceRatePerDay: Number(formFoodRate),
            insurancePremiumMonthly: Number(formInsurance),
            otherAllowances: Number(formOtherAllowances),
            otherEmployerCosts: Number(formOtherEmployerCosts),
            salaryAdvances: Number(formAdvances),
            payrollAdjustments: Number(formAdjustments),
            joiningDate: formJoiningDate,
            lastWorkingDate: formLastWorkingDate,
            status: formStatus,
            notes: formNotes,
            updatedAt: new Date().toISOString(),
          } as StaffMember;
        }
        return s;
      });

      onUpdateStaffList(updated);
      saveStaffDirectory(updated);

      if (prevSalary !== Number(formBaseSalary)) {
        addAuditLog({
          staffId: editingStaff.id,
          staffName: formName,
          actor: 'Restaurant Owner',
          action: 'SALARY_UPDATED',
          details: `Salary updated from ₹${prevSalary} to ₹${formBaseSalary} (effective ${formEffectiveDate}). Historical months preserved.`,
          previousValue: `₹${prevSalary}`,
          newValue: `₹${formBaseSalary}`,
        });
      }

      if (prevRole !== finalRole) {
        addAuditLog({
          staffId: editingStaff.id,
          staffName: formName,
          actor: 'Restaurant Owner',
          action: 'ROLE_CHANGED',
          details: `Role reassigned from "${prevRole}" to "${finalRole}".`,
          previousValue: prevRole,
          newValue: finalRole,
        });
      }
    } else {
      // Create new employee
      const newStaffId = `EMP-${formOutlet === 'whitefield' ? 'WF' : 'BW'}-${String(Math.floor(Math.random() * 900) + 100)}`;
      const newEmployee: StaffMember = {
        id: newStaffId,
        name: formName.trim(),
        role: finalRole,
        outletId: formOutlet,
        primaryOutletAllocationPct: 100,
        baseSalary: Number(formBaseSalary),
        salaryEffectiveDate: formEffectiveDate,
        isFoodAllowanceEligible: finalFoodEligible,
        foodAllowanceRatePerDay: Number(formFoodRate),
        maxAllowanceDays: 30,
        insurancePremiumMonthly: Number(formInsurance),
        otherAllowances: Number(formOtherAllowances),
        otherEmployerCosts: Number(formOtherEmployerCosts),
        salaryAdvances: Number(formAdvances),
        payrollAdjustments: Number(formAdjustments),
        joiningDate: formJoiningDate,
        lastWorkingDate: formLastWorkingDate,
        status: formStatus,
        notes: formNotes,
        updatedAt: new Date().toISOString(),
      };

      const updated = [newEmployee, ...staffList];
      onUpdateStaffList(updated);
      saveStaffDirectory(updated);

      addAuditLog({
        staffId: newStaffId,
        staffName: formName,
        actor: 'Restaurant Owner',
        action: 'EMPLOYEE_CREATED',
        details: `Created new employee profile: ${formName} (${finalRole}) at ${formOutlet} with base salary ₹${formBaseSalary}.`,
      });
    }

    setIsEmployeeModalOpen(false);
  };

  const handleOpenTransfer = (staff: StaffMember) => {
    setTransferStaff(staff);
    const target = staff.outletId === 'whitefield' ? 'banaswadi' : 'whitefield';
    setTransferTargetOutlet(target);
    setTransferAllocationPct(50);
    setTransferEffectiveDate('2026-10-15');
    setTransferReason('Festival Rush Cross-Kitchen Deployment');
    setIsTransferModalOpen(true);
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferStaff) return;

    const updated = staffList.map((s) => {
      if (s.id === transferStaff.id) {
        return {
          ...s,
          secondaryOutletId: transferTargetOutlet,
          primaryOutletAllocationPct: transferAllocationPct,
          notes: `${s.notes || ''} [Transferred ${transferAllocationPct}% to ${transferTargetOutlet} from ${transferEffectiveDate}: ${transferReason}]`,
          updatedAt: new Date().toISOString(),
        } as StaffMember;
      }
      return s;
    });

    onUpdateStaffList(updated);
    saveStaffDirectory(updated);

    addAuditLog({
      staffId: transferStaff.id,
      staffName: transferStaff.name,
      actor: 'Restaurant Owner',
      action: 'OUTLET_TRANSFERRED',
      details: `Cross-outlet transfer approved: ${transferStaff.name} allocated ${transferAllocationPct}% to ${transferStaff.outletId} and ${100 - transferAllocationPct}% to ${transferTargetOutlet}. Total salary strictly split without duplication.`,
    });

    setIsTransferModalOpen(false);
    alert(`Transfer registered! ${transferStaff.name}'s salary and food allowance will be apportioned ${transferAllocationPct}% / ${100 - transferAllocationPct}% across outlets.`);
  };

  const handleApproveMonthlyPayroll = () => {
    addAuditLog({
      actor: 'Restaurant Owner',
      action: 'PAYROLL_APPROVED',
      details: `Approved ${selectedMonth} monthly payroll: Total Employer Expense ${formatINR(totalEmployerPayrollCost)} for ${payrollSnapshots.length} employees. Synced with P&L.`,
    });

    if (onPayrollApproved) {
      onPayrollApproved(selectedMonth);
    }

    alert(`Payroll for ${selectedMonth} successfully approved and locked! Figures are authoritative and flow into P&L statements.`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Module B &bull; Editable Staff Directory &amp; Payroll
            </span>
            <span className="text-xs text-slate-300 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" /> {selectedMonth} Pay Cycle
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
            Staff Directory, Wage Editor &amp; Benefits Register
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Full control over kitchen crew, chefs, helpers, and managers. Add custom roles, edit base salaries,
            record variable attendance, manage cross-kitchen transfers, and preserve historical approved payroll.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={handleDirectPull}
            disabled={isPullingCloud}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white transition-colors shadow-sm cursor-pointer disabled:opacity-60"
            title="Retrieve October staff directory and wages from Supabase table staff_directory"
          >
            <DownloadCloud className={`w-3.5 h-3.5 text-teal-200 ${isPullingCloud ? 'animate-bounce' : ''}`} />
            <span>{isPullingCloud ? 'Pulling October Wages...' : 'Pull from Supabase'}</span>
          </button>

          {onOpenSupabaseModal && (
            <button
              onClick={onOpenSupabaseModal}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-700/80 hover:bg-slate-700 text-white transition-colors shadow-sm cursor-pointer border border-slate-600"
              title="Open full Supabase sync and status manager"
            >
              <Cloud className="w-3.5 h-3.5 text-emerald-300" />
              <span>Database Sync</span>
            </button>
          )}

          <button
            onClick={handleApproveMonthlyPayroll}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors shadow-sm cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Approve {selectedMonth} Payroll</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-teal-400 hover:bg-teal-300 text-slate-950 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Employee</span>
          </button>
        </div>
      </div>

      {/* Cloud Pull Notification Banner */}
      {cloudPullNotification && (
        <div className="p-3.5 rounded-xl bg-emerald-900/90 text-white border border-emerald-500/50 flex items-center justify-between gap-3 text-xs shadow-lg animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span className="font-semibold">{cloudPullNotification}</span>
          </div>
          <button
            onClick={() => setCloudPullNotification(null)}
            className="text-emerald-300 hover:text-white font-bold text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Headline Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
            <span>Total Headcount</span>
            <span className="p-1 rounded-lg bg-teal-50 text-teal-700">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {filteredStaff.length} Employees
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
            <span>Whitefield: {staffList.filter((s) => s.outletId === 'whitefield').length}</span>
            <span>Banaswadi: {staffList.filter((s) => s.outletId === 'banaswadi').length}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
            <span>Monthly Base Salaries</span>
            <span className="p-1 rounded-lg bg-indigo-50 text-indigo-700">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatINR(totalBaseCommitment)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Contracted monthly wage commitment
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
            <span>Staff Food Allowances</span>
            <span className="p-1 rounded-lg bg-amber-50 text-amber-700">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-amber-700 mt-2">
            {formatINR(totalFoodAllowance)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            {filteredStaff.filter((s) => s.isFoodAllowanceEligible).length} crew eligible @ ₹130/day
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs bg-emerald-50/40 border-emerald-200">
          <div className="text-xs font-semibold text-emerald-800 uppercase flex items-center justify-between">
            <span>Total Employer Payroll Cost</span>
            <span className="p-1 rounded-lg bg-emerald-100 text-emerald-800">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-800 mt-2">
            {formatINR(totalEmployerPayrollCost)}
          </div>
          <div className="text-[11px] text-emerald-700 mt-2 pt-2 border-t border-emerald-200">
            Base + Food Allowance + Insurance ({formatINR(totalInsurance)})
          </div>
        </div>
      </div>

      {/* Subtab Toggle Bar */}
      <div className="flex items-center justify-between bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveSubTab('directory')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'directory'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Staff Master Directory ({filteredStaff.length})
          </button>

          <button
            onClick={() => setActiveSubTab('payroll_editor')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'payroll_editor'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Monthly Payroll Editor ({selectedMonth})
          </button>

          <button
            onClick={() => setActiveSubTab('audit_trail')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'audit_trail'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Audit Trail &amp; History
          </button>
        </div>

        {/* Outlet Filter Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setActiveOutletView('all')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              activeOutletView === 'all'
                ? 'bg-white shadow-xs text-slate-900 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Outlets
          </button>
          <button
            onClick={() => setActiveOutletView('whitefield')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              activeOutletView === 'whitefield'
                ? 'bg-white shadow-xs text-slate-900 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Whitefield
          </button>
          <button
            onClick={() => setActiveOutletView('banaswadi')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              activeOutletView === 'banaswadi'
                ? 'bg-white shadow-xs text-slate-900 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Banaswadi
          </button>
        </div>
      </div>

      {/* VIEW 1: STAFF MASTER DIRECTORY */}
      {activeSubTab === 'directory' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">Employee Master Directory</h3>
              <p className="text-xs text-slate-500">
                Manage employee roles, base compensation, effective dates, food allowance eligibility, and transfers
              </p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search staff, role, ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-teal-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 uppercase font-semibold text-[11px]">
                  <th className="py-3 px-3">Employee &amp; ID</th>
                  <th className="py-3 px-3">Job Role</th>
                  <th className="py-3 px-3">Primary Outlet</th>
                  <th className="py-3 px-3 text-right">Base Salary</th>
                  <th className="py-3 px-3 text-center">Food Allowance</th>
                  <th className="py-3 px-3 text-right">Insurance</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-600">No staff members in directory yet.</p>
                      <p className="text-xs text-slate-400 mt-1">Click &ldquo;+ Add Staff Member&rdquo; to add your chefs, helpers, or managers.</p>
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{s.name}</span>
                        {s.secondaryOutletId && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold uppercase">
                            Split {s.primaryOutletAllocationPct}%
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {s.id} &bull; Joined {s.joiningDate}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-800">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-[11px]">
                        {s.role}
                      </span>
                    </td>
                    <td className="py-3 px-3 capitalize">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          s.outletId === 'whitefield'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-teal-100 text-teal-800'
                        }`}
                      >
                        {s.outletId}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900">
                      {formatINR(s.baseSalary)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {s.role === 'Manager' ? (
                        <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                          Ineligible (Manager)
                        </span>
                      ) : s.isFoodAllowanceEligible ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          Eligible (₹130/day)
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                          Excluded
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-teal-700 font-medium">
                      {formatINR(s.insurancePremiumMonthly || 1500)}
                    </td>
                    <td className="py-3 px-3 text-center capitalize">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          s.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenTransfer(s)}
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 flex items-center gap-1"
                          title="Transfer or split employee between outlets"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          <span>Transfer</span>
                        </button>

                        <button
                          onClick={() => handleOpenEdit(s)}
                          className="p-1 rounded text-slate-400 hover:text-slate-800"
                          title="Edit employee compensation"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: MONTHLY PAYROLL EDITOR */}
      {activeSubTab === 'payroll_editor' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {selectedMonth} Monthly Payroll Editor &amp; Attendance Register
              </h3>
              <p className="text-xs text-slate-500">
                Adjust working days, review food allowances, other allowances, and confirm net salary disbursement
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleApproveMonthlyPayroll}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Certify {selectedMonth} Payroll</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 uppercase font-semibold text-[11px]">
                  <th className="py-3 px-3">Employee &amp; Role</th>
                  <th className="py-3 px-3">Outlet</th>
                  <th className="py-3 px-3 text-right">Base Salary</th>
                  <th className="py-3 px-3 text-center">Days Worked</th>
                  <th className="py-3 px-3 text-right">Food Allowance</th>
                  <th className="py-3 px-3 text-right">Insurance</th>
                  <th className="py-3 px-3 text-right">Advances/Adj</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-900 bg-slate-100/50">
                    Employer Total Cost (P&amp;L)
                  </th>
                  <th className="py-3 px-3 text-right font-black text-emerald-800">
                    Net Cash Payable
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {payrollSnapshots.map((snap) => (
                  <tr key={snap.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{snap.staffName}</div>
                      <div className="text-[10px] text-slate-500">{snap.role}</div>
                    </td>
                    <td className="py-3 px-3 capitalize">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          snap.outletId === 'whitefield'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-teal-100 text-teal-800'
                        }`}
                      >
                        {snap.outletId} ({snap.primaryAllocationPct}%)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-800">
                      {formatINR(snap.effectiveBaseSalary)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <input
                        type="number"
                        min={0}
                        max={31}
                        value={snap.daysWorked}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(31, Number(e.target.value)));
                          setDaysWorkedState((prev) => ({ ...prev, [snap.staffId]: val }));
                        }}
                        className="w-14 text-center font-bold border border-slate-300 rounded px-1.5 py-0.5 bg-slate-50 focus:bg-white focus:outline-teal-500"
                      />
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-amber-700">
                      {formatINR(snap.calculatedFoodAllowance)}
                    </td>
                    <td className="py-3 px-3 text-right text-teal-700">
                      {formatINR(snap.insuranceCost)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-500">
                      {snap.salaryAdvancesDeducted > 0 ? `-${formatINR(snap.salaryAdvancesDeducted)}` : '₹0'}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-950 bg-slate-50/60">
                      {formatINR(snap.totalEmployerCost)}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-emerald-800 text-sm">
                      {formatINR(snap.netPayableToEmployee)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100/70 font-bold text-slate-900">
                  <td className="py-3 px-3">Total Monthly Wage Obligations</td>
                  <td className="py-3 px-3">{payrollSnapshots.length} crew</td>
                  <td className="py-3 px-3 text-right">
                    {formatINR(payrollSnapshots.reduce((sum, p) => sum + p.effectiveBaseSalary, 0))}
                  </td>
                  <td className="py-3 px-3 text-center">—</td>
                  <td className="py-3 px-3 text-right text-amber-800">
                    {formatINR(totalFoodAllowance)}
                  </td>
                  <td className="py-3 px-3 text-right text-teal-800">
                    {formatINR(totalInsurance)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-500">—</td>
                  <td className="py-3 px-3 text-right font-black text-slate-950 text-sm bg-slate-100">
                    {formatINR(totalEmployerPayrollCost)}
                  </td>
                  <td className="py-3 px-3 text-right font-black text-emerald-800 text-sm">
                    {formatINR(totalNetCashPayable)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: AUDIT TRAIL LOG */}
      {activeSubTab === 'audit_trail' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" /> Immutable Payroll &amp; Staff Audit Trail
            </h3>
            <p className="text-xs text-slate-500">
              Tracks salary adjustments, promotions, role changes, outlet transfers, and approval timestamps
            </p>
          </div>

          <div className="space-y-3">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-800">
                      {log.action}
                    </span>
                    {log.staffName && <span>{log.staffName}</span>}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(log.timestamp).toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">{log.details}</p>
                <div className="text-[10px] text-slate-400">Authorized by: {log.actor}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADD / EDIT EMPLOYEE MODAL */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  {editingStaff ? `Edit Employee: ${editingStaff.name}` : 'Add New Kitchen Crew Member'}
                </h2>
                <p className="text-xs text-slate-300">
                  Update base wage, effective date, food allowance rate, and outlet assignment
                </p>
              </div>
              <button
                onClick={() => setIsEmployeeModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-semibold mb-1">Employee Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Debabrata Mukherjee"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Job Role</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as JobRole)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500 font-medium"
                  >
                    {PREDEFINED_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {formRole === 'Other Custom Role' && (
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Custom Role Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Tandoori Specialist"
                      value={customRoleName}
                      onChange={(e) => setCustomRoleName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Assigned Kitchen Outlet</label>
                  <select
                    value={formOutlet}
                    onChange={(e) => setFormOutlet(e.target.value as 'banaswadi' | 'whitefield')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500 font-bold"
                  >
                    <option value="whitefield">Whitefield Kitchen (-w)</option>
                    <option value="banaswadi">Banaswadi Kitchen</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Monthly Base Salary (₹) *</label>
                  <input
                    type="number"
                    required
                    value={formBaseSalary}
                    onChange={(e) => setFormBaseSalary(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500 font-bold text-teal-700"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Salary Effective Date</label>
                  <input
                    type="date"
                    value={formEffectiveDate}
                    onChange={(e) => setFormEffectiveDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Daily Food Allowance Rate (₹)</label>
                  <input
                    type="number"
                    value={formFoodRate}
                    onChange={(e) => setFormFoodRate(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Monthly Medical Insurance (₹)</label>
                  <input
                    type="number"
                    value={formInsurance}
                    onChange={(e) => setFormInsurance(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Joining Date</label>
                  <input
                    type="date"
                    value={formJoiningDate}
                    onChange={(e) => setFormJoiningDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Employment Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On Leave</option>
                    <option value="exited">Exited</option>
                  </select>
                </div>
              </div>

              {/* Food Allowance Eligibility Toggle */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={formFoodEligible}
                    disabled={formRole === 'Manager'}
                    onChange={(e) => setFormFoodEligible(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                  />
                  <span>Eligible for Daily Food Allowance (₹130/day)</span>
                </label>
                {formRole === 'Manager' && (
                  <span className="text-[10px] text-amber-700 block mt-1">
                    Store and Kitchen Managers are excluded from daily food allowances by company policy.
                  </span>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
                >
                  Save Employee Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OUTLET TRANSFER MODAL */}
      {isTransferModalOpen && transferStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-teal-400" /> Cross-Kitchen Outlet Transfer
                </h2>
                <p className="text-xs text-slate-300">
                  Transfer or split employee expenses cleanly without duplicate salary counting
                </p>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1 text-purple-950">
                <div className="font-bold">{transferStaff.name} ({transferStaff.role})</div>
                <div className="text-[11px] text-purple-800">
                  Current Base Salary: {formatINR(transferStaff.baseSalary)} at {transferStaff.outletId.toUpperCase()}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Target Transfer Outlet</label>
                <select
                  value={transferTargetOutlet}
                  onChange={(e) => setTransferTargetOutlet(e.target.value as 'banaswadi' | 'whitefield')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-bold"
                >
                  <option value="banaswadi">Banaswadi Kitchen</option>
                  <option value="whitefield">Whitefield Kitchen (-w)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Primary Outlet Allocation Percentage ({transferAllocationPct}% at {transferStaff.outletId})
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={10}
                  value={transferAllocationPct}
                  onChange={(e) => setTransferAllocationPct(Number(e.target.value))}
                  className="w-full accent-teal-600"
                />
                <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                  <span>100% {transferTargetOutlet}</span>
                  <span>50% Split</span>
                  <span>100% {transferStaff.outletId}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Transfer Effective Date</label>
                <input
                  type="date"
                  value={transferEffectiveDate}
                  onChange={(e) => setTransferEffectiveDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Transfer Reason / Operational Justification</label>
                <input
                  type="text"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600">
                <strong>Accounting Protection:</strong> Salary will be apportioned as{' '}
                {formatINR((transferStaff.baseSalary * transferAllocationPct) / 100)} to {transferStaff.outletId} and{' '}
                {formatINR((transferStaff.baseSalary * (100 - transferAllocationPct)) / 100)} to {transferTargetOutlet}.
                Zero double-counting guaranteed.
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer"
                >
                  Approve Cross-Outlet Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
