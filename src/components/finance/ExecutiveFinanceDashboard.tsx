/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  OutletId,
  MonthlyPnLStatement,
  BreakEvenAnalysis,
  PlatformPayoutRecord,
  MonthlyExpenseItem,
} from '../../types/finance';
import { formatINR, formatPct } from '../../utils/financeCalculations';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Users,
  Layers,
  ArrowUpRight,
  Flame,
  Truck,
  Sparkles,
} from 'lucide-react';

interface ExecutiveFinanceDashboardProps {
  currentOutlet: OutletId;
  onSelectOutlet: (outlet: OutletId) => void;
  pnl: MonthlyPnLStatement;
  pnlBanaswadi: MonthlyPnLStatement;
  pnlWhitefield: MonthlyPnLStatement;
  pnlConsolidated: MonthlyPnLStatement;
  breakEven: BreakEvenAnalysis;
  payouts: PlatformPayoutRecord[];
  expenses: MonthlyExpenseItem[];
  onNavigateTab: (tabId: string) => void;
  onOpenMonthEndModal: () => void;
}

export const ExecutiveFinanceDashboard: React.FC<ExecutiveFinanceDashboardProps> = ({
  currentOutlet,
  onSelectOutlet,
  pnl,
  pnlBanaswadi,
  pnlWhitefield,
  pnlConsolidated,
  breakEven,
  payouts,
  expenses,
  onNavigateTab,
  onOpenMonthEndModal,
}) => {
  const isProfitable = pnl.operatingProfitOrLoss >= 0;
  const breakEvenMet = pnl.netSalesRevenue >= breakEven.breakEvenNetRevenueMonthly;
  const pendingExpensesCount = expenses.filter((e) => !e.isConfirmed).length;

  return (
    <div className="space-y-6">
      {/* Top Banner Notice */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-teal-500/20 text-teal-300 border border-teal-500/30">
              Verified Benchmark Month
            </span>
            <span className="text-xs text-slate-300 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" /> October 2026 Close
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            {pnl.outletName} — Financial Performance
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Autonomous financial intelligence reconciling Petpooja POS billing against bank payouts,
            channel commissions, verified kitchen overheads, and employee food allowances.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onOpenMonthEndModal}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>13-Step Month Close</span>
          </button>
        </div>
      </div>

      {/* KPI Headline Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Revenue */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Net Sales Revenue</span>
            <span className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">
              {formatINR(pnl.netSalesRevenue)}
            </span>
            <span className="text-xs font-semibold text-emerald-600">
              {pnl.totalOrders} bills
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>Petpooja Gross: {formatINR(pnl.grossSalesPetpooja)}</span>
            <span>AOV: {formatINR(pnl.averageOrderValue)}</span>
          </div>
        </div>

        {/* Contribution Margin */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Contribution Margin</span>
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
              <PieChart className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">
              {formatINR(pnl.contributionMargin)}
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
              {formatPct(pnl.contributionMarginPercentage)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>Food COGS: {formatPct(pnl.rawMaterialPercentage)}</span>
            <span>Commissions: {formatPct(pnl.platformCommissionPercentage)}</span>
          </div>
        </div>

        {/* Fixed Operating Period Overhead */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Fixed Operating Costs</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">
              {formatINR(pnl.totalFixedOperatingExpenses)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>Rent: {formatINR(pnl.kitchenRent)}</span>
            <span>Salaries: {formatINR(pnl.staffSalaries)}</span>
          </div>
        </div>

        {/* Operating Net Profit / Loss */}
        <div
          className={`rounded-2xl p-5 border shadow-xs transition-all ${
            isProfitable
              ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
              : 'bg-rose-50/50 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium">
            <span className={isProfitable ? 'text-emerald-800' : 'text-rose-800'}>
              Operating EBITDA
            </span>
            <span
              className={`p-1.5 rounded-lg ${
                isProfitable ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {isProfitable ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-black ${
                isProfitable ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {formatINR(pnl.operatingProfitOrLoss)}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                isProfitable ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-800'
              }`}
            >
              {formatPct(pnl.operatingProfitMarginPercentage)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-600 flex items-center justify-between pt-2 border-t border-slate-200/60">
            <span>Break-Even: {breakEvenMet ? 'Achieved' : 'Deficit'}</span>
            <span className="font-semibold">{formatPct(breakEven.breakEvenAchievedPercentage)}</span>
          </div>
        </div>
      </div>

      {/* Break-Even Progress Gauge & Daily Targets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Break-Even Threshold &amp; Trajectory
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Required monthly revenue based on weighted channel margins vs. actual sales
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('break-even')}
              className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              Detailed Breakdown <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-600">
                Current Sales: <strong className="text-slate-900">{formatINR(pnl.netSalesRevenue)}</strong>
              </span>
              <span className="text-slate-600">
                Break-Even Target: <strong className="text-slate-900">{formatINR(breakEven.breakEvenNetRevenueMonthly)}</strong>
              </span>
            </div>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  breakEvenMet
                    ? 'bg-gradient-to-r from-teal-500 to-emerald-500'
                    : 'bg-gradient-to-r from-amber-500 to-rose-500'
                }`}
                style={{ width: `${Math.min(100, breakEven.breakEvenAchievedPercentage)}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>{formatPct(breakEven.breakEvenAchievedPercentage)} of target achieved</span>
              <span>
                {breakEvenMet
                  ? `+${formatINR(breakEven.revenueSurplusOrDeficit)} Safety Surplus`
                  : `${formatINR(Math.abs(breakEven.revenueSurplusOrDeficit))} Gap to Breakeven`}
              </span>
            </div>
          </div>

          {/* Daily Run-Rate Metrics */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100 text-center">
            <div className="p-3 bg-slate-50 rounded-xl">
              <div className="text-[11px] text-slate-500 uppercase font-semibold">Daily Sales Target</div>
              <div className="text-lg font-bold text-slate-900 mt-1">
                {formatINR(breakEven.breakEvenNetRevenueDaily)} / day
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">To cover all fixed period bills</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <div className="text-[11px] text-slate-500 uppercase font-semibold">Daily Order Target</div>
              <div className="text-lg font-bold text-slate-900 mt-1">
                {breakEven.breakEvenOrdersDaily} orders / day
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">At current {formatINR(pnl.averageOrderValue)} AOV</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <div className="text-[11px] text-slate-500 uppercase font-semibold">Days to Breakeven</div>
              <div className="text-lg font-bold text-slate-900 mt-1">
                {breakEven.daysToBreakEvenAtCurrentPace} Days
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">At current sales velocity</div>
            </div>
          </div>
        </div>

        {/* Operational Highlights & Policy Alerts */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" /> Operational Directives
            </h3>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl">
                <span className="font-bold text-indigo-900 block mb-0.5">
                  Whitefield -w Brand Segregation
                </span>
                <span className="text-indigo-800 text-[11px]">
                  All brands with <code className="bg-white px-1 rounded">-w</code> or <code className="bg-white px-1 rounded">-W</code> suffix are routed to Whitefield. Inactive brand <em>House Of Terreti</em> is excluded from active revenue.
                </span>
              </div>

              <div className="p-3 bg-teal-50/70 border border-teal-200/80 rounded-xl">
                <span className="font-bold text-teal-900 block mb-0.5">
                  Hyperpure Supplier Recovery Treatment
                </span>
                <span className="text-teal-800 text-[11px]">
                  {formatINR(pnl.hyperpureSupplierOffset)} Zomato deduction is recognized as a supplier offset, not platform commission.
                </span>
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                <span className="font-bold text-amber-900 block mb-0.5">
                  Staff Food Allowance Rule
                </span>
                <span className="text-amber-800 text-[11px]">
                  5 non-manager kitchen staff compensated @ ₹130/day (max ₹19,500/month). Managers excluded by policy.
                </span>
              </div>
            </div>
          </div>

          {pendingExpensesCount > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
              <span className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                {pendingExpensesCount} Pending Expense Entries (Banaswadi)
              </span>
              <button
                onClick={() => onNavigateTab('expenses')}
                className="font-bold underline text-amber-800 hover:text-amber-900"
              >
                Review
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Outlet Performance Comparison */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Multi-Outlet Financial Comparison (October 2026)
            </h3>
            <p className="text-xs text-slate-500">
              Side-by-side performance audit across cloud kitchens and consolidated chain total
            </p>
          </div>
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => onSelectOutlet('banaswadi')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'banaswadi' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Banaswadi
            </button>
            <button
              onClick={() => onSelectOutlet('whitefield')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'whitefield' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Whitefield
            </button>
            <button
              onClick={() => onSelectOutlet('consolidated')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'consolidated' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consolidated
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 uppercase font-semibold tracking-wider text-[11px]">
                <th className="py-3 px-4">Financial Metric</th>
                <th className="py-3 px-4 text-right">Banaswadi Kitchen</th>
                <th className="py-3 px-4 text-right">Whitefield Kitchen</th>
                <th className="py-3 px-4 text-right font-bold text-slate-900 bg-slate-100/60">
                  Consolidated Chain
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Petpooja Gross Sales</td>
                <td className="py-3 px-4 text-right font-semibold">{formatINR(pnlBanaswadi.grossSalesPetpooja)}</td>
                <td className="py-3 px-4 text-right font-semibold">{formatINR(pnlWhitefield.grossSalesPetpooja)}</td>
                <td className="py-3 px-4 text-right font-bold text-slate-900 bg-slate-50/50">
                  {formatINR(pnlConsolidated.grossSalesPetpooja)}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Total Order Volume</td>
                <td className="py-3 px-4 text-right">{pnlBanaswadi.totalOrders} bills</td>
                <td className="py-3 px-4 text-right">{pnlWhitefield.totalOrders} bills</td>
                <td className="py-3 px-4 text-right font-bold bg-slate-50/50">
                  {pnlConsolidated.totalOrders} bills
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Net Sales Revenue</td>
                <td className="py-3 px-4 text-right font-semibold">{formatINR(pnlBanaswadi.netSalesRevenue)}</td>
                <td className="py-3 px-4 text-right font-semibold">{formatINR(pnlWhitefield.netSalesRevenue)}</td>
                <td className="py-3 px-4 text-right font-bold text-slate-900 bg-slate-50/50">
                  {formatINR(pnlConsolidated.netSalesRevenue)}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Direct Food COGS &amp; Packaging</td>
                <td className="py-3 px-4 text-right">{formatINR(pnlBanaswadi.totalCOGS)} ({formatPct(pnlBanaswadi.rawMaterialPercentage + pnlBanaswadi.packagingPercentage)})</td>
                <td className="py-3 px-4 text-right">{formatINR(pnlWhitefield.totalCOGS)} ({formatPct(pnlWhitefield.rawMaterialPercentage + pnlWhitefield.packagingPercentage)})</td>
                <td className="py-3 px-4 text-right font-bold bg-slate-50/50">
                  {formatINR(pnlConsolidated.totalCOGS)}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Platform Commissions &amp; Fees</td>
                <td className="py-3 px-4 text-right">{formatINR(pnlBanaswadi.totalVariableChannelCosts)}</td>
                <td className="py-3 px-4 text-right">{formatINR(pnlWhitefield.totalVariableChannelCosts)}</td>
                <td className="py-3 px-4 text-right font-bold bg-slate-50/50">
                  {formatINR(pnlConsolidated.totalVariableChannelCosts)}
                </td>
              </tr>
              <tr className="bg-indigo-50/40">
                <td className="py-3 px-4 font-bold text-indigo-950">Contribution Margin</td>
                <td className="py-3 px-4 text-right font-bold text-indigo-900">
                  {formatINR(pnlBanaswadi.contributionMargin)} ({formatPct(pnlBanaswadi.contributionMarginPercentage)})
                </td>
                <td className="py-3 px-4 text-right font-bold text-indigo-900">
                  {formatINR(pnlWhitefield.contributionMargin)} ({formatPct(pnlWhitefield.contributionMarginPercentage)})
                </td>
                <td className="py-3 px-4 text-right font-black text-indigo-950 bg-indigo-100/50">
                  {formatINR(pnlConsolidated.contributionMargin)} ({formatPct(pnlConsolidated.contributionMarginPercentage)})
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">Fixed Operating Expenses</td>
                <td className="py-3 px-4 text-right">{formatINR(pnlBanaswadi.totalFixedOperatingExpenses)}</td>
                <td className="py-3 px-4 text-right">{formatINR(pnlWhitefield.totalFixedOperatingExpenses)}</td>
                <td className="py-3 px-4 text-right font-bold bg-slate-50/50">
                  {formatINR(pnlConsolidated.totalFixedOperatingExpenses)}
                </td>
              </tr>
              <tr className={pnlConsolidated.operatingProfitOrLoss >= 0 ? 'bg-emerald-50/60' : 'bg-rose-50/60'}>
                <td className="py-3.5 px-4 font-black text-slate-900">Operating Net Profit / Loss</td>
                <td className={`py-3.5 px-4 text-right font-black ${pnlBanaswadi.operatingProfitOrLoss >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatINR(pnlBanaswadi.operatingProfitOrLoss)} ({formatPct(pnlBanaswadi.operatingProfitMarginPercentage)})
                </td>
                <td className={`py-3.5 px-4 text-right font-black ${pnlWhitefield.operatingProfitOrLoss >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatINR(pnlWhitefield.operatingProfitOrLoss)} ({formatPct(pnlWhitefield.operatingProfitMarginPercentage)})
                </td>
                <td className={`py-3.5 px-4 text-right font-black text-sm ${pnlConsolidated.operatingProfitOrLoss >= 0 ? 'text-emerald-800 bg-emerald-100/70' : 'text-rose-800 bg-rose-100/70'}`}>
                  {formatINR(pnlConsolidated.operatingProfitOrLoss)} ({formatPct(pnlConsolidated.operatingProfitMarginPercentage)})
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
