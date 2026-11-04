/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { OutletId, MonthlyPnLStatement, BreakEvenAnalysis } from '../../types/finance';
import { formatINR, formatPct } from '../../utils/financeCalculations';
import {
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Sliders,
  DollarSign,
  PieChart,
} from 'lucide-react';

interface BreakEvenCalculatorProps {
  currentOutlet: OutletId;
  pnl: MonthlyPnLStatement;
  breakEven: BreakEvenAnalysis;
  onSelectOutlet: (outlet: OutletId) => void;
}

export const BreakEvenCalculator: React.FC<BreakEvenCalculatorProps> = ({
  currentOutlet,
  pnl,
  breakEven,
  onSelectOutlet,
}) => {
  // Dual-View toggle: Restaurant sales only vs Including catering contribution
  const [includeCateringInBreakEven, setIncludeCateringInBreakEven] = useState<boolean>(true);

  // Interactive what-if adjustments
  const [fixedCostAdjustment, setFixedCostAdjustment] = useState<number>(0);
  const [marginAdjustmentPct, setMarginAdjustmentPct] = useState<number>(0);

  const cateringOffset = includeCateringInBreakEven ? (pnl.cateringContribution || 0) : 0;
  const netFixedCosts = Math.max(0, pnl.totalFixedOperatingExpenses - cateringOffset);
  const adjustedFixedCosts = Math.max(0, netFixedCosts + fixedCostAdjustment);
  const adjustedMarginRatio = Math.max(
    0.1,
    Math.min(0.9, breakEven.weightedContributionMarginRatio + marginAdjustmentPct / 100)
  );

  const adjustedMonthlyBreakEven = Math.round(adjustedFixedCosts / adjustedMarginRatio);
  const adjustedDailyBreakEven = Math.round(adjustedMonthlyBreakEven / 30);
  const aov = pnl.averageOrderValue || 450;
  const adjustedDailyOrders = Math.round(adjustedDailyBreakEven / aov);
  const adjustedMonthlyOrders = Math.round(adjustedMonthlyBreakEven / aov);

  const actualRevenueToCompare = includeCateringInBreakEven
    ? (pnl.totalRecognizedOutletRevenue || pnl.netSalesRevenue)
    : pnl.netSalesRevenue;

  const isAchieved = actualRevenueToCompare >= adjustedMonthlyBreakEven;
  const surplusDeficit = actualRevenueToCompare - adjustedMonthlyBreakEven;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Break-Even Intelligence &amp; Daily Run-Rate Targets
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Calculates minimum sales volume required to cover fixed leases, utility bills, and
            kitchen payroll based on weighted channel contribution margins. Supports dual views for recurring sales vs. event catering.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Catering Contribution Dual-View Switch */}
          <div className="p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs flex items-center">
            <button
              onClick={() => setIncludeCateringInBreakEven(true)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                includeCateringInBreakEven
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              With Catering ({formatINR(pnl.cateringContribution || 0)})
            </button>
            <button
              onClick={() => setIncludeCateringInBreakEven(false)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                !includeCateringInBreakEven
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Restaurant Sales Only
            </button>
          </div>

          <div className="flex items-center gap-2">
          {/* Outlet Switcher */}
          <div className="p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs flex items-center">
            <button
              onClick={() => onSelectOutlet('banaswadi')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'banaswadi'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Banaswadi
            </button>
            <button
              onClick={() => onSelectOutlet('whitefield')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'whitefield'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Whitefield
            </button>
            <button
              onClick={() => onSelectOutlet('consolidated')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'consolidated'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consolidated
            </button>
          </div>
        </div>
      </div>
    </div>

      {/* Target Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Monthly Break-Even Sales</div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatINR(adjustedMonthlyBreakEven)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Covers {formatINR(adjustedFixedCosts)} fixed obligations
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Daily Revenue Pace Target</div>
          <div className="text-2xl font-black text-indigo-900 mt-2">
            {formatINR(adjustedDailyBreakEven)} / day
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Based on a 30-day billing cycle
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Daily Order Volume Target</div>
          <div className="text-2xl font-black text-teal-900 mt-2">
            {adjustedDailyOrders} orders / day
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            At current average order value: {formatINR(aov)}
          </div>
        </div>

        <div
          className={`rounded-2xl p-5 border shadow-xs ${
            isAchieved ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'
          }`}
        >
          <div className="text-xs font-semibold text-slate-600 uppercase">Current Performance Gap</div>
          <div
            className={`text-2xl font-black mt-2 ${
              isAchieved ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {isAchieved ? `+${formatINR(surplusDeficit)}` : formatINR(surplusDeficit)}
          </div>
          <div className="text-[11px] text-slate-600 mt-2 pt-2 border-t border-slate-200/60">
            {isAchieved ? 'Operating in positive profit surplus' : 'Revenue shortfall below fixed overhead'}
          </div>
        </div>
      </div>

      {/* Break-Even Progress & Channel Margin Weights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            Break-Even Achievement &amp; Run-Rate Pace
          </h3>
          <p className="text-xs text-slate-500">
            Progress of actual October 2026 sales against the required break-even threshold
          </p>

          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-600">Actual Revenue: {formatINR(pnl.netSalesRevenue)}</span>
              <span className="text-slate-600">Threshold: {formatINR(adjustedMonthlyBreakEven)}</span>
            </div>
            <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  isAchieved
                    ? 'bg-gradient-to-r from-teal-500 to-emerald-500'
                    : 'bg-gradient-to-r from-amber-500 to-rose-500'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    adjustedMonthlyBreakEven > 0 ? (pnl.netSalesRevenue / adjustedMonthlyBreakEven) * 100 : 100
                  )}%`,
                }}
              ></div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>
                {formatPct(
                  adjustedMonthlyBreakEven > 0 ? (pnl.netSalesRevenue / adjustedMonthlyBreakEven) * 100 : 100
                )}{' '}
                fulfilled
              </span>
              <span>
                {isAchieved
                  ? `Safety Buffer: +${formatINR(surplusDeficit)}`
                  : `Deficit to Breakeven: ${formatINR(Math.abs(surplusDeficit))}`}
              </span>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
            <div className="font-bold text-slate-900">Operational Run-Rate Insights:</div>
            <ul className="list-disc pl-4 space-y-1 text-slate-600 text-[11px]">
              <li>
                At an average order value of <strong>{formatINR(aov)}</strong>, the kitchen requires{' '}
                <strong>{adjustedMonthlyOrders} monthly orders</strong> ({adjustedDailyOrders} bills daily) to break even.
              </li>
              <li>
                Weighted Contribution Margin Ratio: <strong>{formatPct(adjustedMarginRatio * 100)}</strong> across
                blended delivery and direct channels.
              </li>
              <li>
                Every ₹1,000 in direct orders generates ~₹680 toward overheads, whereas ₹1,000 on 23% commission aggregators generates only ~₹420.
              </li>
            </ul>
          </div>
        </div>

        {/* What-If Sensitivity Adjustments */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-teal-600" /> What-If Sensitivity Controls
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Test how overhead cost reductions or margin improvements shift your break-even point
              </p>
            </div>
            <button
              onClick={() => {
                setFixedCostAdjustment(0);
                setMarginAdjustmentPct(0);
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Reset
            </button>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex items-center justify-between font-semibold mb-1">
                <span className="text-slate-700">Fixed Cost Adjustment (Rent, LPG, Staff):</span>
                <span className={fixedCostAdjustment < 0 ? 'text-emerald-600' : 'text-slate-900'}>
                  {fixedCostAdjustment >= 0 ? '+' : ''}{formatINR(fixedCostAdjustment)}
                </span>
              </div>
              <input
                type="range"
                min={-50000}
                max={50000}
                step={2500}
                value={fixedCostAdjustment}
                onChange={(e) => setFixedCostAdjustment(Number(e.target.value))}
                className="w-full accent-teal-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>-₹50k (Optimization)</span>
                <span>Base ({formatINR(pnl.totalFixedOperatingExpenses)})</span>
                <span>+₹50k (Expansion)</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between font-semibold mb-1">
                <span className="text-slate-700">Margin Shift (Pricing or COGS Savings):</span>
                <span className={marginAdjustmentPct > 0 ? 'text-emerald-600' : 'text-slate-900'}>
                  {marginAdjustmentPct >= 0 ? '+' : ''}{marginAdjustmentPct.toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={-10}
                max={15}
                step={0.5}
                value={marginAdjustmentPct}
                onChange={(e) => setMarginAdjustmentPct(Number(e.target.value))}
                className="w-full accent-teal-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>-10% (Cost Shocks)</span>
                <span>Current ({formatPct(breakEven.weightedContributionMarginRatio * 100)})</span>
                <span>+15% (Repricing)</span>
              </div>
            </div>

            <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl text-[11px] text-indigo-900">
              <strong className="block mb-0.5">Simulation Impact:</strong>
              Under this scenario, break-even sales changes by{' '}
              <strong>
                {adjustedMonthlyBreakEven - breakEven.breakEvenNetRevenueMonthly >= 0 ? '+' : ''}
                {formatINR(adjustedMonthlyBreakEven - breakEven.breakEvenNetRevenueMonthly)}
              </strong>
              , requiring{' '}
              <strong>{adjustedDailyOrders} orders/day</strong> instead of {breakEven.breakEvenOrdersDaily} orders/day.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
