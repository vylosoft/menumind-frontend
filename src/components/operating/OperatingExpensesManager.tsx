/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { OutletOperatingExpenseItem } from '../../types/operatingCosts';
import { StaffMember } from '../../types/payrollStaff';
import {
  calculateEffectiveExpense,
  calculateTotalOperatingOverhead,
  calculateStaffSalaryTotals,
} from '../../utils/operatingOverheadManager';
import { formatINR, formatPercent } from '../../utils/formatters';
import {
  Building2,
  DollarSign,
  Zap,
  Droplets,
  Sparkles,
  ShieldCheck,
  Server,
  FileCheck2,
  Truck,
  Plus,
  Trash2,
  RotateCcw,
  Info,
  CheckCircle2,
  Percent,
  Search,
  Filter,
  Users,
  ArrowRight,
  Cloud,
} from 'lucide-react';

interface OperatingExpensesManagerProps {
  expenses: OutletOperatingExpenseItem[];
  onUpdateExpenses: (items: OutletOperatingExpenseItem[]) => void;
  staffDirectory: StaffMember[];
  onNavigateToBreakEven?: () => void;
  onNavigateToStaff?: () => void;
  onOpenSupabaseModal?: () => void;
}

export const OperatingExpensesManager: React.FC<OperatingExpensesManagerProps> = ({
  expenses,
  onUpdateExpenses,
  staffDirectory,
  onNavigateToBreakEven,
  onNavigateToStaff,
  onOpenSupabaseModal,
}) => {
  const [selectedOutlet, setSelectedOutlet] = useState<'consolidated' | 'banaswadi' | 'whitefield'>('consolidated');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>('');
  const [customGroup, setCustomGroup] = useState<OutletOperatingExpenseItem['categoryGroup']>('Facility & Rent');
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3000);
  };

  // Group list
  const groups = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach((e) => set.add(e.categoryGroup));
    return ['ALL', ...Array.from(set)];
  }, [expenses]);

  // Overhead stats per outlet
  const consolidatedStats = useMemo(() => calculateTotalOperatingOverhead(expenses, 'consolidated'), [expenses]);
  const banaswadiStats = useMemo(() => calculateTotalOperatingOverhead(expenses, 'banaswadi'), [expenses]);
  const whitefieldStats = useMemo(() => calculateTotalOperatingOverhead(expenses, 'whitefield'), [expenses]);

  const activeStats = useMemo(() => {
    if (selectedOutlet === 'banaswadi') return banaswadiStats;
    if (selectedOutlet === 'whitefield') return whitefieldStats;
    return consolidatedStats;
  }, [selectedOutlet, banaswadiStats, whitefieldStats, consolidatedStats]);

  // Salary totals from Staff Directory
  const staffSalaryStats = useMemo(() => {
    return calculateStaffSalaryTotals(staffDirectory, selectedOutlet);
  }, [staffDirectory, selectedOutlet]);

  // Total Combined Monthly Fixed Obligations (Staff Salary + Operating Overheads)
  const totalMonthlyFixedObligations = activeStats.total + staffSalaryStats.totalEmployerCost;

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchGroup = selectedGroup === 'ALL' || e.categoryGroup === selectedGroup;
      const matchQuery =
        searchQuery === '' ||
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchGroup && matchQuery;
    });
  }, [expenses, selectedGroup, searchQuery]);

  // Handlers for modifying an expense item
  const updateItem = (id: string, updater: (prev: OutletOperatingExpenseItem) => OutletOperatingExpenseItem) => {
    const updated = expenses.map((item) => (item.id === id ? updater(item) : item));
    onUpdateExpenses(updated);
    showToast('Operating overhead updated and auto-saved');
  };

  const handleToggleCombined = (id: string, isCombined: boolean) => {
    updateItem(id, (prev) => {
      const splitB = prev.splitPctBanaswadi ?? 50;
      const splitW = prev.splitPctWhitefield ?? (100 - splitB);
      if (isCombined) {
        // If switching to combined, use either existing combinedTotal or sum of separate amounts
        const currentSum = (prev.banaswadiAmount || 0) + (prev.whitefieldAmount || 0);
        const combined = prev.combinedTotalAmount > 0 ? prev.combinedTotalAmount : currentSum;
        return {
          ...prev,
          isCombined: true,
          combinedTotalAmount: combined,
          splitPctBanaswadi: splitB,
          splitPctWhitefield: splitW,
          banaswadiAmount: Math.round((combined * splitB) / 100),
          whitefieldAmount: Math.round((combined * splitW) / 100),
        };
      } else {
        // Switching to separate outlet entry
        return {
          ...prev,
          isCombined: false,
        };
      }
    });
  };

  const handleCombinedAmountChange = (id: string, amount: number) => {
    updateItem(id, (prev) => {
      const splitB = prev.splitPctBanaswadi ?? 50;
      const splitW = prev.splitPctWhitefield ?? (100 - splitB);
      return {
        ...prev,
        combinedTotalAmount: Math.max(0, amount),
        banaswadiAmount: Math.round((Math.max(0, amount) * splitB) / 100),
        whitefieldAmount: Math.round((Math.max(0, amount) * splitW) / 100),
      };
    });
  };

  const handleSplitChange = (id: string, banaswadiPct: number) => {
    const validB = Math.min(100, Math.max(0, banaswadiPct));
    const validW = 100 - validB;
    updateItem(id, (prev) => {
      const total = prev.combinedTotalAmount || 0;
      return {
        ...prev,
        splitPctBanaswadi: validB,
        splitPctWhitefield: validW,
        banaswadiAmount: Math.round((total * validB) / 100),
        whitefieldAmount: Math.round((total * validW) / 100),
      };
    });
  };

  const handleDirectAmountChange = (id: string, outlet: 'banaswadi' | 'whitefield', amount: number) => {
    updateItem(id, (prev) => ({
      ...prev,
      [outlet === 'banaswadi' ? 'banaswadiAmount' : 'whitefieldAmount']: Math.max(0, amount),
    }));
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    const newItem: OutletOperatingExpenseItem = {
      id: `exp_custom_${Date.now()}`,
      name: customName.trim(),
      categoryGroup: customGroup,
      isCombined: false,
      combinedTotalAmount: 0,
      splitPctBanaswadi: 50,
      splitPctWhitefield: 50,
      banaswadiAmount: 0,
      whitefieldAmount: 0,
      isCustom: true,
    };
    onUpdateExpenses([...expenses, newItem]);
    setCustomName('');
    setIsAddingCustom(false);
    showToast(`Added custom overhead expense "${newItem.name}"`);
  };

  const handleDeleteCustom = (id: string) => {
    onUpdateExpenses(expenses.filter((e) => e.id !== id));
    showToast('Removed custom expense line item');
  };

  const handleResetToZero = () => {
    if (window.confirm('Reset all operating expenses and overhead costs to ₹0?')) {
      const reset = expenses.map((e) => ({
        ...e,
        combinedTotalAmount: 0,
        banaswadiAmount: 0,
        whitefieldAmount: 0,
      }));
      onUpdateExpenses(reset);
      showToast('All operating overhead amounts set to ₹0');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900 text-teal-300 px-4 py-2.5 rounded-xl shadow-xl border border-teal-500/30 text-xs font-semibold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-teal-400" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 rounded-2xl p-6 text-white shadow-md border border-slate-700/60">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold border border-teal-500/30">
              <Building2 className="w-3.5 h-3.5 text-teal-400" />
              Outlet Operating Overheads &amp; Fixed Expenses
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Outlet Fixed Costs &amp; Shared Expense Splitting
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Input and track non-negotiable kitchen operating overheads (Rent, Utilities, Water Tankers, Cleaning, POS, Cloud Apps, Licenses) per outlet.
              For combined shared expenses, configure proportional splits (default 50-50 or custom %). All values automatically feed into{' '}
              <strong className="text-teal-400 font-semibold">Break-Even Intelligence</strong> and{' '}
              <strong className="text-teal-400 font-semibold">Financial P&amp;L</strong>.
            </p>
          </div>

          <div className="flex flex-wrap lg:flex-col gap-2 shrink-0">
            {onOpenSupabaseModal && (
              <button
                onClick={onOpenSupabaseModal}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                title="Sync Operating Overheads to Supabase tables"
              >
                <Cloud className="w-4 h-4 text-emerald-200" />
                <span>Supabase Cloud Sync</span>
              </button>
            )}
            {onNavigateToBreakEven && (
              <button
                onClick={onNavigateToBreakEven}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                <span>View Break-Even Intelligence</span>
                <ArrowRight className="w-4 h-4 text-slate-950" />
              </button>
            )}
            <button
              onClick={handleResetToZero}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Overheads to ₹0</span>
            </button>
          </div>
        </div>
      </div>

      {/* Outlet Selector Bar */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-2">
            Active Scope:
          </span>
          <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
            <button
              onClick={() => setSelectedOutlet('consolidated')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                selectedOutlet === 'consolidated'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consolidated (Both Outlets)
            </button>
            <button
              onClick={() => setSelectedOutlet('banaswadi')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                selectedOutlet === 'banaswadi'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Banaswadi
            </button>
            <button
              onClick={() => setSelectedOutlet('whitefield')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                selectedOutlet === 'whitefield'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Whitefield
            </button>
          </div>
        </div>

        {/* Dynamic Outlet Pill summary */}
        <div className="text-xs text-slate-600 flex items-center gap-4">
          <div>
            <span className="text-slate-400">Banaswadi Total: </span>
            <span className="font-bold text-slate-900">{formatINR(banaswadiStats.total)}</span>
          </div>
          <div className="text-slate-300">|</div>
          <div>
            <span className="text-slate-400">Whitefield Total: </span>
            <span className="font-bold text-slate-900">{formatINR(whitefieldStats.total)}</span>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Operating Overheads */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Operating Overheads ({selectedOutlet === 'consolidated' ? 'Consolidated' : selectedOutlet})
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {formatINR(activeStats.total)}
          </div>
          <p className="text-[11px] text-slate-500">
            Rent, utilities, cleaning, software &amp; licenses
          </p>
        </div>

        {/* Staff Salaries (Directly Synced from Staff Directory) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                Staff Wages
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Live Synced
              </span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 tracking-tight">
            {formatINR(staffSalaryStats.totalEmployerCost)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{staffSalaryStats.activeStaffCount} active personnel</span>
            {onNavigateToStaff && (
              <button
                onClick={onNavigateToStaff}
                className="text-teal-600 hover:text-teal-700 font-semibold cursor-pointer underline text-[10px]"
              >
                Manage Staff
              </button>
            )}
          </div>
        </div>

        {/* Total Monthly Fixed Obligations */}
        <div className="bg-white p-5 rounded-xl border border-teal-200 bg-teal-50/20 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-teal-900 text-xs font-medium">
            <span className="font-bold uppercase tracking-wider text-[11px]">
              Total Monthly Fixed Burn
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {formatINR(totalMonthlyFixedObligations)}
          </div>
          <p className="text-[11px] text-teal-800 font-medium">
            Salaries ({formatINR(staffSalaryStats.totalEmployerCost)}) + Overheads ({formatINR(activeStats.total)})
          </p>
        </div>

        {/* Combined Shared vs Direct Breakdown */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Shared vs Direct Overheads
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="text-sm font-bold text-slate-900 pt-1 space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Shared (Split %):</span>
              <span className="font-bold text-blue-700">{formatINR(activeStats.combinedTotal)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Outlet Direct:</span>
              <span className="font-bold text-slate-700">{formatINR(activeStats.directTotal)}</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 pt-1">
            {expenses.filter((e) => e.isCombined).length} combined shared categories
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 text-slate-800"
            />
          </div>

          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 font-medium text-slate-700 focus:ring-2 focus:ring-teal-500"
          >
            {groups.map((g) => (
              <option key={g} value={g}>
                Group: {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => setIsAddingCustom(!isAddingCustom)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Custom Overhead</span>
          </button>
        </div>
      </div>

      {/* Add Custom Overhead Form Modal / Inline Box */}
      {isAddingCustom && (
        <form
          onSubmit={handleAddCustom}
          className="bg-teal-50/50 border border-teal-200 rounded-xl p-4 flex flex-wrap items-end gap-3 text-xs"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-bold text-teal-900 mb-1">
              New Overhead Expense Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Pest Control, Exhaust Duct Maintenance"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full bg-white border border-teal-300 rounded-lg p-2 text-slate-800 focus:ring-2 focus:ring-teal-500 font-medium"
            />
          </div>

          <div className="w-48">
            <label className="block text-[11px] font-bold text-teal-900 mb-1">Category Group</label>
            <select
              value={customGroup}
              onChange={(e) => setCustomGroup(e.target.value as any)}
              className="w-full bg-white border border-teal-300 rounded-lg p-2 text-slate-800 focus:ring-2 focus:ring-teal-500 font-medium"
            >
              <option value="Facility & Rent">Facility &amp; Rent</option>
              <option value="Utilities & Water">Utilities &amp; Water</option>
              <option value="Hygiene & Cleaning">Hygiene &amp; Cleaning</option>
              <option value="Technology & Software">Technology &amp; Software</option>
              <option value="Compliance & Insurance">Compliance &amp; Insurance</option>
              <option value="Logistics & Misc">Logistics &amp; Misc</option>
              <option value="Custom">Custom</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg cursor-pointer"
            >
              Add Expense
            </button>
            <button
              type="button"
              onClick={() => setIsAddingCustom(false)}
              className="px-3 py-2 bg-white text-slate-600 hover:text-slate-800 font-semibold border border-slate-300 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Main Expenses Table / Card Grid */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Kitchen Operating Expenses &amp; Allocation Table
            </h3>
            <p className="text-xs text-slate-500">
              Toggle &ldquo;Combined Cost&rdquo; for expenses shared between Banaswadi &amp; Whitefield. Adjust split percentages as needed.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200">
            {filteredExpenses.length} Items Listed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Expense Category</th>
                <th className="py-3 px-3">Type / Combined?</th>
                <th className="py-3 px-3 text-right">Combined Total</th>
                <th className="py-3 px-3 text-center">Split % (Banaswadi / Whitefield)</th>
                <th className="py-3 px-3 text-right">Banaswadi Share</th>
                <th className="py-3 px-3 text-right">Whitefield Share</th>
                <th className="py-3 px-4 text-right">Effective Scope Cost</th>
                <th className="py-3 px-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal text-slate-800">
              {filteredExpenses.map((item) => {
                const effective = calculateEffectiveExpense(item, selectedOutlet);
                const bAmount = item.isCombined
                  ? Math.round(((item.combinedTotalAmount || 0) * (item.splitPctBanaswadi ?? 50)) / 100)
                  : item.banaswadiAmount || 0;
                const wAmount = item.isCombined
                  ? Math.round(((item.combinedTotalAmount || 0) * (item.splitPctWhitefield ?? 50)) / 100)
                  : item.whitefieldAmount || 0;

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      item.isCombined ? 'bg-blue-50/15' : ''
                    }`}
                  >
                    {/* Category & Description */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        {item.name}
                        {item.isCustom && (
                          <span className="text-[9px] px-1 py-0.2 bg-teal-100 text-teal-800 font-semibold rounded">
                            Custom
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                        {item.description || item.categoryGroup}
                      </div>
                    </td>

                    {/* Combined Toggle */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.isCombined}
                          onChange={(e) => handleToggleCombined(item.id, e.target.checked)}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
                        />
                        <span
                          className={`text-[11px] font-bold ${
                            item.isCombined ? 'text-blue-700' : 'text-slate-500'
                          }`}
                        >
                          {item.isCombined ? 'Combined (Shared)' : 'Direct Per Outlet'}
                        </span>
                      </label>
                    </td>

                    {/* Combined Total Input (if isCombined) */}
                    <td className="py-3 px-3 text-right">
                      {item.isCombined ? (
                        <div className="inline-flex items-center gap-1 bg-white border border-blue-300 rounded-lg px-2 py-1 shadow-2xs">
                          <span className="text-[11px] text-slate-400 font-bold">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={item.combinedTotalAmount === 0 ? '' : item.combinedTotalAmount}
                            placeholder="0"
                            onChange={(e) => handleCombinedAmountChange(item.id, Number(e.target.value))}
                            className="w-24 text-right font-black text-slate-900 text-xs focus:outline-none"
                          />
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Separate entries</span>
                      )}
                    </td>

                    {/* Split Percentage Config (if isCombined) */}
                    <td className="py-3 px-3 text-center">
                      {item.isCombined ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={item.splitPctBanaswadi ?? 50}
                            onChange={(e) => handleSplitChange(item.id, Number(e.target.value))}
                            className="w-12 text-center font-bold text-xs bg-slate-50 border border-slate-300 rounded p-1 text-slate-800 focus:ring-1 focus:ring-teal-500"
                          />
                          <span className="text-slate-400 text-xs font-bold">% /</span>
                          <span className="text-xs font-bold text-slate-600 w-8">
                            {item.splitPctWhitefield ?? 50}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>

                    {/* Banaswadi Share */}
                    <td className="py-3 px-3 text-right">
                      {item.isCombined ? (
                        <div className="text-xs font-bold text-slate-800">
                          {formatINR(bAmount)}
                          <span className="text-[10px] text-slate-400 block font-normal">
                            ({item.splitPctBanaswadi ?? 50}%)
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-2xs">
                          <span className="text-[11px] text-slate-400 font-bold">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={item.banaswadiAmount === 0 ? '' : item.banaswadiAmount}
                            placeholder="0"
                            onChange={(e) => handleDirectAmountChange(item.id, 'banaswadi', Number(e.target.value))}
                            className="w-24 text-right font-semibold text-slate-900 text-xs focus:outline-none"
                          />
                        </div>
                      )}
                    </td>

                    {/* Whitefield Share */}
                    <td className="py-3 px-3 text-right">
                      {item.isCombined ? (
                        <div className="text-xs font-bold text-slate-800">
                          {formatINR(wAmount)}
                          <span className="text-[10px] text-slate-400 block font-normal">
                            ({item.splitPctWhitefield ?? 50}%)
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-2xs">
                          <span className="text-[11px] text-slate-400 font-bold">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={item.whitefieldAmount === 0 ? '' : item.whitefieldAmount}
                            placeholder="0"
                            onChange={(e) => handleDirectAmountChange(item.id, 'whitefield', Number(e.target.value))}
                            className="w-24 text-right font-semibold text-slate-900 text-xs focus:outline-none"
                          />
                        </div>
                      )}
                    </td>

                    {/* Effective Scope Cost */}
                    <td className="py-3 px-4 text-right">
                      <span className="text-xs font-black text-slate-900">
                        {formatINR(effective)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-2 text-center">
                      {item.isCustom && (
                        <button
                          onClick={() => handleDeleteCustom(item.id)}
                          title="Remove custom item"
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-300">
              <tr>
                <td colSpan={4} className="py-3 px-4 text-right text-xs">
                  Total Operating Overhead ({selectedOutlet === 'consolidated' ? 'Consolidated' : selectedOutlet}):
                </td>
                <td className="py-3 px-3 text-right text-xs text-teal-800">
                  {formatINR(banaswadiStats.total)}
                </td>
                <td className="py-3 px-3 text-right text-xs text-amber-800">
                  {formatINR(whitefieldStats.total)}
                </td>
                <td className="py-3 px-4 text-right text-sm font-black text-slate-900">
                  {formatINR(activeStats.total)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Explanatory Guide Box */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 text-xs space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <Info className="w-4 h-4 text-teal-600" />
          <span>How Operating Overhead &amp; Split Calculations Work:</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-slate-600 leading-relaxed">
          <li>
            <strong>Combined Expenses (e.g. Cloud &amp; Apps, POS Subscriptions, Brand Insurance):</strong> When an invoice covers both branches, check &ldquo;Combined&rdquo;. You enter the total bill once, and MenuMind automatically allocates each outlet&apos;s share based on your configured percentage (default 50%-50%).
          </li>
          <li>
            <strong>Direct Expenses (e.g. Kitchen Rent, Water Tankers, BESCOM Power):</strong> For physical outlet-specific bills, enter the exact amount per outlet.
          </li>
          <li>
            <strong>Staff Wages Auto-Sync:</strong> The Break-Even Intelligence module automatically sums all active employee payroll costs directly from your <strong>Staff &amp; Wages Directory</strong>, adding them to this operating overhead to determine your true monthly fixed cost safety target.
          </li>
        </ul>
      </div>
    </div>
  );
};
