/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { OutletId, MonthlyExpenseItem, ExpenseCategory } from '../../types/finance';
import { formatINR } from '../../utils/financeCalculations';
import {
  Plus,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Edit2,
  Trash2,
  Check,
  X,
  FileCheck,
  ShieldAlert,
} from 'lucide-react';

interface MonthlyExpenseManagerProps {
  currentOutlet: OutletId;
  expenses: MonthlyExpenseItem[];
  onUpdateExpenses: (updated: MonthlyExpenseItem[]) => void;
  onSelectOutlet: (outlet: OutletId) => void;
}

const CATEGORIES: ExpenseCategory[] = [
  'Rent & Property',
  'Staff & Accommodation',
  'Utilities & Energy',
  'Kitchen Supplies & Water',
  'Sanitation & Hygiene',
  'Technology & POS',
  'Marketing & Ads',
  'Maintenance & Repairs',
  'Statutory & Compliance',
  'Miscellaneous',
];

export const MonthlyExpenseManager: React.FC<MonthlyExpenseManagerProps> = ({
  currentOutlet,
  expenses,
  onUpdateExpenses,
  onSelectOutlet,
}) => {
  // If consolidated is selected, default to whitefield or banaswadi for direct editing
  const activeOutletEdit = currentOutlet === 'consolidated' ? 'whitefield' : currentOutlet;

  const [activeTab, setActiveTab] = useState<'whitefield' | 'banaswadi'>(
    activeOutletEdit as 'whitefield' | 'banaswadi'
  );

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<MonthlyExpenseItem>>({
    name: '',
    category: 'Utilities & Energy',
    budgetAmount: 0,
    actualAmount: 0,
    isConfirmed: true,
    vendorName: '',
    notes: '',
  });

  const outletExpenses = expenses.filter((e) => e.outletId === activeTab);
  const totalBudget = outletExpenses.reduce((sum, e) => sum + e.budgetAmount, 0);
  const totalActual = outletExpenses.reduce(
    (sum, e) => sum + (e.actualAmount > 0 ? e.actualAmount : e.budgetAmount),
    0
  );
  const pendingCount = outletExpenses.filter((e) => !e.isConfirmed).length;

  const handleConfirmItem = (id: string, actualVal?: number) => {
    const updated = expenses.map((e) => {
      if (e.id === id) {
        return {
          ...e,
          isConfirmed: true,
          actualAmount: actualVal !== undefined ? actualVal : e.actualAmount > 0 ? e.actualAmount : e.budgetAmount,
        };
      }
      return e;
    });
    onUpdateExpenses(updated);
  };

  const handleSaveExpense = () => {
    if (!formData.name || !formData.budgetAmount) {
      alert('Please fill out expense item name and budget amount.');
      return;
    }

    if (editingId) {
      const updated = expenses.map((e) => {
        if (e.id === editingId) {
          return {
            ...e,
            ...formData,
            variance: (formData.actualAmount || 0) - (formData.budgetAmount || 0),
          } as MonthlyExpenseItem;
        }
        return e;
      });
      onUpdateExpenses(updated);
      setEditingId(null);
    } else {
      const newItem: MonthlyExpenseItem = {
        id: `exp-${Date.now()}`,
        outletId: activeTab,
        month: '2026-10',
        name: formData.name || '',
        category: formData.category || 'Utilities & Energy',
        budgetAmount: Number(formData.budgetAmount) || 0,
        actualAmount: Number(formData.actualAmount) || Number(formData.budgetAmount) || 0,
        variance: (Number(formData.actualAmount) || 0) - (Number(formData.budgetAmount) || 0),
        isConfirmed: formData.isConfirmed ?? true,
        vendorName: formData.vendorName || '',
        notes: formData.notes || '',
      };
      onUpdateExpenses([...expenses, newItem]);
      setIsAddingNew(false);
    }

    setFormData({
      name: '',
      category: 'Utilities & Energy',
      budgetAmount: 0,
      actualAmount: 0,
      isConfirmed: true,
      vendorName: '',
      notes: '',
    });
  };

  const handleDeleteExpense = (id: string) => {
    if (confirm('Are you sure you want to delete this expense line item?')) {
      onUpdateExpenses(expenses.filter((e) => e.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Outlet Switcher */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Monthly Expense &amp; Fixed Overhead Register
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Independent ledger management for Banaswadi and Whitefield kitchens. Unconfirmed entries
            are marked as <strong>Pending Entry</strong> to prevent inaccurate reporting.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Outlet Toggle Tabs */}
          <div className="p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs flex items-center">
            <button
              onClick={() => {
                setActiveTab('whitefield');
                onSelectOutlet('whitefield');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'whitefield'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Whitefield Ledger
            </button>
            <button
              onClick={() => {
                setActiveTab('banaswadi');
                onSelectOutlet('banaswadi');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'banaswadi'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Banaswadi Ledger
            </button>
          </div>

          <button
            onClick={() => {
              setIsAddingNew(true);
              setEditingId(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">
            {activeTab === 'whitefield' ? 'Whitefield' : 'Banaswadi'} Total Budget
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatINR(totalBudget)}
          </div>
          {activeTab === 'whitefield' && (
            <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
              Verified Base Planning: ₹3,81,598 (Low: ₹3.76L / High: ₹3.86L)
            </div>
          )}
          {activeTab === 'banaswadi' && (
            <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
              Independent Banaswadi High Street Cost Structure
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Recognized Actuals</div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatINR(totalActual)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Variance: {totalActual - totalBudget >= 0 ? '+' : ''}{formatINR(totalActual - totalBudget)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Audit Status</div>
          <div className="text-2xl font-black text-slate-900 mt-2 flex items-baseline gap-2">
            {pendingCount === 0 ? (
              <span className="text-emerald-600 flex items-center gap-1.5 text-lg font-bold">
                <CheckCircle2 className="w-5 h-5" /> 100% Certified
              </span>
            ) : (
              <span className="text-amber-600 flex items-center gap-1.5 text-lg font-bold">
                <AlertTriangle className="w-5 h-5" /> {pendingCount} Pending Entries
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            {pendingCount > 0
              ? 'Click "Confirm Actual" to certify utility bills or receipts'
              : 'All line items locked and validated for October 2026'}
          </div>
        </div>
      </div>

      {/* Add / Edit Expense Inline Card */}
      {isAddingNew && (
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white">
              {editingId ? 'Edit Expense Item' : `Add New Expense Item (${activeTab.toUpperCase()})`}
            </h3>
            <button
              onClick={() => {
                setIsAddingNew(false);
                setEditingId(null);
              }}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Expense Name</label>
              <input
                type="text"
                placeholder="e.g. Commercial Cylinder Refills"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-teal-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as ExpenseCategory })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-teal-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Budget Amount (₹)</label>
              <input
                type="number"
                placeholder="25000"
                value={formData.budgetAmount || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    budgetAmount: Number(e.target.value),
                    actualAmount: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-teal-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Actual Invoiced Amount (₹)</label>
              <input
                type="number"
                placeholder="25000"
                value={formData.actualAmount || ''}
                onChange={(e) => setFormData({ ...formData, actualAmount: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-teal-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Vendor / Payee</label>
              <input
                type="text"
                placeholder="e.g. SuperGas Commercial Distributors"
                value={formData.vendorName || ''}
                onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-teal-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Notes / Invoice Ref</label>
              <input
                type="text"
                placeholder="Bill number, meter units, contract terms"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-teal-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isConfirmed}
                onChange={(e) => setFormData({ ...formData, isConfirmed: e.target.checked })}
                className="rounded text-teal-500 focus:ring-teal-500 w-4 h-4"
              />
              <span>Mark as Confirmed (Audit Certified)</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsAddingNew(false);
                  setEditingId(null);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveExpense}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-teal-500 hover:bg-teal-600 text-slate-900 font-bold"
              >
                Save Line Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-1 capitalize">
          {activeTab} Itemized Expenses
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Fixed property leases, staff facilities, energy utilities, water, sanitation, and POS subscriptions
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 uppercase font-semibold text-[11px]">
                <th className="py-3 px-4">Line Item / Payee</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Budget</th>
                <th className="py-3 px-4 text-right font-semibold text-slate-900">Actual Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {outletExpenses.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{e.name}</div>
                    {e.vendorName && (
                      <div className="text-[10px] text-slate-500">{e.vendorName}</div>
                    )}
                    {e.notes && (
                      <div className="text-[10px] text-slate-400 italic mt-0.5">{e.notes}</div>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {e.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-slate-600">
                    {formatINR(e.budgetAmount)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                    {e.isConfirmed ? (
                      formatINR(e.actualAmount)
                    ) : (
                      <span className="text-amber-600 font-semibold italic">Pending Bill</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {e.isConfirmed ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Confirmed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <AlertTriangle className="w-3 h-3 text-amber-600" /> Pending Entry
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {!e.isConfirmed && (
                        <button
                          onClick={() => handleConfirmItem(e.id, e.budgetAmount)}
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300"
                          title="Confirm Actual from Budget"
                        >
                          Confirm
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingId(e.id);
                          setFormData(e);
                          setIsAddingNew(true);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-slate-700"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteExpense(e.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100/70 font-bold text-slate-900">
                <td className="py-3.5 px-4">Total Recognized Period Expenses</td>
                <td className="py-3.5 px-4"></td>
                <td className="py-3.5 px-4 text-right">{formatINR(totalBudget)}</td>
                <td className="py-3.5 px-4 text-right text-slate-950 font-black">{formatINR(totalActual)}</td>
                <td className="py-3.5 px-4 text-center">
                  {pendingCount === 0 ? 'All Confirmed' : `${pendingCount} Pending`}
                </td>
                <td className="py-3.5 px-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
