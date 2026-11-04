/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  OutletId,
  MonthlyPnLStatement,
  MonthlyExpenseItem,
  EmployeePayrollRecord,
  PlatformPayoutRecord,
} from '../../types/finance';
import { formatINR, formatPct } from '../../utils/financeCalculations';
import {
  FileSpreadsheet,
  Download,
  Printer,
  FileText,
  Calendar,
  CheckCircle2,
  Table,
} from 'lucide-react';

interface FinancialReportsProps {
  currentOutlet: OutletId;
  pnlConsolidated: MonthlyPnLStatement;
  pnlBanaswadi: MonthlyPnLStatement;
  pnlWhitefield: MonthlyPnLStatement;
  expenses: MonthlyExpenseItem[];
  payroll: EmployeePayrollRecord[];
  payouts: PlatformPayoutRecord[];
}

export const FinancialReports: React.FC<FinancialReportsProps> = ({
  currentOutlet,
  pnlConsolidated,
  pnlBanaswadi,
  pnlWhitefield,
  expenses,
  payroll,
  payouts,
}) => {
  const [selectedReport, setSelectedReport] = useState<'pnl' | 'expenses' | 'payroll' | 'payouts'>('pnl');

  const downloadCSV = (filename: string, csvContent: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPnLCSV = () => {
    const rows = [
      ['MenuMind AI - Monthly P&L Statement', 'October 2026'],
      ['Line Item', 'Banaswadi Kitchen (INR)', 'Whitefield Kitchen (INR)', 'Consolidated Total (INR)'],
      ['Petpooja Gross Sales', pnlBanaswadi.grossSalesPetpooja, pnlWhitefield.grossSalesPetpooja, pnlConsolidated.grossSalesPetpooja],
      ['Customer Discounts', -pnlBanaswadi.customerDiscounts, -pnlWhitefield.customerDiscounts, -pnlConsolidated.customerDiscounts],
      ['Net Sales Revenue', pnlBanaswadi.netSalesRevenue, pnlWhitefield.netSalesRevenue, pnlConsolidated.netSalesRevenue],
      ['Raw Material COGS', -pnlBanaswadi.rawMaterialCOGS, -pnlWhitefield.rawMaterialCOGS, -pnlConsolidated.rawMaterialCOGS],
      ['Packaging Costs', -pnlBanaswadi.packagingCosts, -pnlWhitefield.packagingCosts, -pnlConsolidated.packagingCosts],
      ['Total Direct COGS', -pnlBanaswadi.totalCOGS, -pnlWhitefield.totalCOGS, -pnlConsolidated.totalCOGS],
      ['Gross Profit', pnlBanaswadi.grossProfit, pnlWhitefield.grossProfit, pnlConsolidated.grossProfit],
      ['Platform Commissions', -pnlBanaswadi.platformCommissions, -pnlWhitefield.platformCommissions, -pnlConsolidated.platformCommissions],
      ['Platform Taxes & Fees', -pnlBanaswadi.platformTaxesAndFees, -pnlWhitefield.platformTaxesAndFees, -pnlConsolidated.platformTaxesAndFees],
      ['Delivery Share Costs', -pnlBanaswadi.deliveryShareCosts, -pnlWhitefield.deliveryShareCosts, -pnlConsolidated.deliveryShareCosts],
      ['Contribution Margin', pnlBanaswadi.contributionMargin, pnlWhitefield.contributionMargin, pnlConsolidated.contributionMargin],
      ['Kitchen Rent', -pnlBanaswadi.kitchenRent, -pnlWhitefield.kitchenRent, -pnlConsolidated.kitchenRent],
      ['Staff Accommodation', -pnlBanaswadi.staffAccommodation, -pnlWhitefield.staffAccommodation, -pnlConsolidated.staffAccommodation],
      ['Crew Salaries', -pnlBanaswadi.staffSalaries, -pnlWhitefield.staffSalaries, -pnlConsolidated.staffSalaries],
      ['Staff Food Allowances', -pnlBanaswadi.staffFoodAllowances, -pnlWhitefield.staffFoodAllowances, -pnlConsolidated.staffFoodAllowances],
      ['Staff Insurance', -pnlBanaswadi.staffInsurance, -pnlWhitefield.staffInsurance, -pnlConsolidated.staffInsurance],
      ['Electricity & LPG', -(pnlBanaswadi.electricityExpense + pnlBanaswadi.lpgGasExpense), -(pnlWhitefield.electricityExpense + pnlWhitefield.lpgGasExpense), -(pnlConsolidated.electricityExpense + pnlConsolidated.lpgGasExpense)],
      ['Water & Sanitation', -(pnlBanaswadi.tankerAndKitchenWater + pnlBanaswadi.sanitationAndCleaning), -(pnlWhitefield.tankerAndKitchenWater + pnlWhitefield.sanitationAndCleaning), -(pnlConsolidated.tankerAndKitchenWater + pnlConsolidated.sanitationAndCleaning)],
      ['POS Software & Internet', -pnlBanaswadi.posAndInternetTech, -pnlWhitefield.posAndInternetTech, -pnlConsolidated.posAndInternetTech],
      ['Total Fixed Operating Expenses', -pnlBanaswadi.totalFixedOperatingExpenses, -pnlWhitefield.totalFixedOperatingExpenses, -pnlConsolidated.totalFixedOperatingExpenses],
      ['Operating Net Profit / Loss (EBITDA)', pnlBanaswadi.operatingProfitOrLoss, pnlWhitefield.operatingProfitOrLoss, pnlConsolidated.operatingProfitOrLoss],
    ];

    const csvContent = rows.map((e) => e.join(',')).join('\n');
    downloadCSV('MenuMind_Monthly_PnL_Oct2026.csv', csvContent);
  };

  const handleExportExpensesCSV = () => {
    const headers = ['ID', 'Outlet', 'Category', 'Expense Name', 'Budget (INR)', 'Actual (INR)', 'Variance (INR)', 'Confirmed', 'Vendor', 'Notes'];
    const rows = expenses.map((e) => [
      e.id,
      e.outletId,
      `"${e.category}"`,
      `"${e.name}"`,
      e.budgetAmount,
      e.actualAmount,
      e.variance,
      e.isConfirmed ? 'YES' : 'NO',
      `"${e.vendorName || ''}"`,
      `"${e.notes || ''}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCSV('MenuMind_Monthly_Expenses_Oct2026.csv', csvContent);
  };

  const handleExportPayrollCSV = () => {
    const headers = ['ID', 'Outlet', 'Employee Name', 'Designation', 'Category', 'Base Salary', 'Days Worked', 'Food Allowance', 'Insurance Benefit', 'Net Payable'];
    const rows = payroll.map((p) => [
      p.id,
      p.outletId,
      `"${p.employeeName}"`,
      `"${p.designation}"`,
      p.roleCategory,
      p.baseSalary,
      p.daysWorkedInMonth,
      p.calculatedFoodAllowance,
      p.insuranceBenefitMonthly,
      p.netPayableSalary,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCSV('MenuMind_Employee_Payroll_Oct2026.csv', csvContent);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Financial Audit Reports &amp; Export Center
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Export certified accountant statements in CSV/Excel formats or generate print-friendly
            management decks formatted in Indian Rupees (₹).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Current View</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedReport('pnl')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            selectedReport === 'pnl'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Monthly P&amp;L Statement</span>
        </button>

        <button
          onClick={() => setSelectedReport('expenses')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            selectedReport === 'expenses'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Table className="w-4 h-4" />
          <span>Operating Expenses Ledger</span>
        </button>

        <button
          onClick={() => setSelectedReport('payroll')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            selectedReport === 'payroll'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Employee Wage Register</span>
        </button>

        <button
          onClick={() => setSelectedReport('payouts')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            selectedReport === 'payouts'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Platform Payout Statements</span>
        </button>
      </div>

      {/* Selected Report Card with Direct Download */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {selectedReport === 'pnl'
                ? 'October 2026 Multi-Outlet P&L Export'
                : selectedReport === 'expenses'
                ? 'Itemized Expense Ledger Export'
                : selectedReport === 'payroll'
                ? 'Staff Payroll, Food Allowance & Insurance Register'
                : 'Swiggy & Zomato Settlement Statements'}
            </h3>
            <p className="text-xs text-slate-500">
              Download clean spreadsheet data ready for chartered accountants and tax filings
            </p>
          </div>

          <div>
            {selectedReport === 'pnl' && (
              <button
                onClick={handleExportPnLCSV}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export P&amp;L (CSV)</span>
              </button>
            )}
            {selectedReport === 'expenses' && (
              <button
                onClick={handleExportExpensesCSV}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Expenses (CSV)</span>
              </button>
            )}
            {selectedReport === 'payroll' && (
              <button
                onClick={handleExportPayrollCSV}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Payroll (CSV)</span>
              </button>
            )}
          </div>
        </div>

        {/* Preview Container */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
          <div className="font-bold text-slate-900">Data Source &amp; Compliance Statement:</div>
          <p className="text-[11px] leading-relaxed text-slate-600">
            All generated reports originate from parsed Petpooja POS daily reports, aggregator merchant settlements,
            and verified kitchen fixed ledgers. Amounts are denominated in Indian Rupees (₹).
            Input Tax Credit (ITC) on 18% GST for platform fees and TCS (1%) credits are tracked under statutory schedules.
          </p>
        </div>
      </div>
    </div>
  );
};
