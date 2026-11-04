/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { OutletId, EmployeePayrollRecord } from '../../types/finance';
import { formatINR, computeEmployeePayroll } from '../../utils/financeCalculations';
import {
  Users,
  ShieldCheck,
  Utensils,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
} from 'lucide-react';

interface EmployeePayrollManagerProps {
  currentOutlet: OutletId;
  payroll: EmployeePayrollRecord[];
  onUpdatePayroll: (updated: EmployeePayrollRecord[]) => void;
  onSelectOutlet: (outlet: OutletId) => void;
}

export const EmployeePayrollManager: React.FC<EmployeePayrollManagerProps> = ({
  currentOutlet,
  payroll,
  onUpdatePayroll,
  onSelectOutlet,
}) => {
  const activeOutletEdit = currentOutlet === 'consolidated' ? 'whitefield' : currentOutlet;
  const [activeTab, setActiveTab] = useState<'whitefield' | 'banaswadi'>(
    activeOutletEdit as 'whitefield' | 'banaswadi'
  );

  const outletEmployees = payroll.filter((p) => p.outletId === activeTab);

  // Aggregates
  const totalBaseSalary = outletEmployees.reduce((sum, e) => sum + e.baseSalary, 0);
  const totalFoodAllowance = outletEmployees.reduce((sum, e) => sum + e.calculatedFoodAllowance, 0);
  const totalInsurance = outletEmployees.reduce((sum, e) => sum + e.insuranceBenefitMonthly, 0);
  const totalNetPayroll = outletEmployees.reduce((sum, e) => sum + e.netPayableSalary, 0);
  const eligibleStaffCount = outletEmployees.filter((e) => e.isFoodAllowanceEligible).length;

  const handleUpdateDaysWorked = (id: string, days: number) => {
    const updated = payroll.map((emp) => {
      if (emp.id === id) {
        return computeEmployeePayroll({ ...emp, daysWorkedInMonth: Math.max(0, Math.min(31, days)) });
      }
      return emp;
    });
    onUpdatePayroll(updated);
  };

  const handleToggleFoodAllowance = (id: string) => {
    const updated = payroll.map((emp) => {
      if (emp.id === id) {
        if (emp.roleCategory === 'manager') {
          alert('Company Policy Restriction: Store and Kitchen Managers are not eligible for the daily staff food allowance.');
          return emp;
        }
        return computeEmployeePayroll({
          ...emp,
          isFoodAllowanceEligible: !emp.isFoodAllowanceEligible,
        });
      }
      return emp;
    });
    onUpdatePayroll(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Outlet Selector */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Employee Payroll, Food Allowance &amp; Medical Benefits
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Independent staff registers. Kitchen crew and packers receive a statutory ₹130/day food
            allowance (max ₹19,500 for 5 crew), while managers are excluded. All personnel receive ₹1,500/mo medical coverage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Outlet Toggle */}
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
              Whitefield Kitchen (6 Crew)
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
              Banaswadi Kitchen (6 Crew)
            </button>
          </div>
        </div>
      </div>

      {/* KPI Headline Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Base Monthly Salaries</div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatINR(totalBaseSalary)}
          </div>
          {activeTab === 'whitefield' && (
            <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
              Matches Whitefield baseline: ₹1,36,198
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Staff Food Allowance</div>
          <div className="text-2xl font-black text-indigo-900 mt-2">
            {formatINR(totalFoodAllowance)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            {eligibleStaffCount} eligible staff @ ₹130/day (max ₹19,500)
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Health Insurance Cover</div>
          <div className="text-2xl font-black text-teal-900 mt-2">
            {formatINR(totalInsurance)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            {outletEmployees.length} staff @ ₹1,500/head = ₹9,000
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs bg-emerald-50/30 border-emerald-200">
          <div className="text-xs font-semibold text-emerald-800 uppercase">Total Monthly Compensation</div>
          <div className="text-2xl font-black text-emerald-700 mt-2">
            {formatINR(totalNetPayroll)}
          </div>
          <div className="text-[11px] text-emerald-700 mt-2 pt-2 border-t border-emerald-100">
            Base + Daily Food + Medical Insurance
          </div>
        </div>
      </div>

      {/* Roster & Payroll Table */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-1 capitalize">
          {activeTab} Employee Register &amp; Wage Calculation
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Strict role-based daily food allowance calculation and health policy benefits
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 uppercase font-semibold text-[11px]">
                <th className="py-3 px-4">Employee &amp; Role</th>
                <th className="py-3 px-4">Role Category</th>
                <th className="py-3 px-4 text-right">Base Salary</th>
                <th className="py-3 px-4 text-center">Days Worked</th>
                <th className="py-3 px-4 text-center">Food Allowance Eligibility</th>
                <th className="py-3 px-4 text-right">Food Allowance (₹130/day)</th>
                <th className="py-3 px-4 text-right">Insurance (₹1,500)</th>
                <th className="py-3 px-4 text-right font-black text-slate-900">Net Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {outletEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{emp.employeeName}</div>
                    <div className="text-[10px] text-slate-500">{emp.designation}</div>
                  </td>
                  <td className="py-3.5 px-4 capitalize">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        emp.roleCategory === 'manager'
                          ? 'bg-amber-100 text-amber-800'
                          : emp.roleCategory === 'chef'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {emp.roleCategory}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-slate-800">
                    {formatINR(emp.baseSalary)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={emp.daysWorkedInMonth}
                      onChange={(e) => handleUpdateDaysWorked(emp.id, Number(e.target.value))}
                      className="w-14 text-center font-bold border border-slate-300 rounded px-1.5 py-0.5 bg-slate-50 focus:bg-white focus:outline-teal-500"
                    />
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {emp.roleCategory === 'manager' ? (
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        Ineligible (Manager)
                      </span>
                    ) : (
                      <button
                        onClick={() => handleToggleFoodAllowance(emp.id)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                          emp.isFoodAllowanceEligible
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        {emp.isFoodAllowanceEligible ? 'Eligible (₹130/day)' : 'Opted Out'}
                      </button>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-indigo-700">
                    {formatINR(emp.calculatedFoodAllowance)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-teal-700">
                    {formatINR(emp.insuranceBenefitMonthly)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-slate-950 text-sm">
                    {formatINR(emp.netPayableSalary)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100/70 font-bold text-slate-900">
                <td className="py-3.5 px-4">Total Payroll Obligations</td>
                <td className="py-3.5 px-4">{outletEmployees.length} personnel</td>
                <td className="py-3.5 px-4 text-right">{formatINR(totalBaseSalary)}</td>
                <td className="py-3.5 px-4 text-center">—</td>
                <td className="py-3.5 px-4 text-center">{eligibleStaffCount} receiving food allowance</td>
                <td className="py-3.5 px-4 text-right text-indigo-900 font-black">{formatINR(totalFoodAllowance)}</td>
                <td className="py-3.5 px-4 text-right text-teal-900 font-black">{formatINR(totalInsurance)}</td>
                <td className="py-3.5 px-4 text-right text-emerald-800 font-black text-sm">
                  {formatINR(totalNetPayroll)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
