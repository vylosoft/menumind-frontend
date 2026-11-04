/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { OutletId, MonthlyPnLStatement } from '../../types/finance';
import { formatINR, formatPct, simulateProfitScenario } from '../../utils/financeCalculations';
import {
  TrendingUp,
  Sparkles,
  Sliders,
  DollarSign,
  ArrowRight,
  Target,
  CheckCircle2,
  PieChart,
} from 'lucide-react';

interface ProfitSimulatorProps {
  currentOutlet: OutletId;
  pnl: MonthlyPnLStatement;
  onSelectOutlet: (outlet: OutletId) => void;
}

export const ProfitSimulator: React.FC<ProfitSimulatorProps> = ({
  currentOutlet,
  pnl,
  onSelectOutlet,
}) => {
  const [directShiftPct, setDirectShiftPct] = useState<number>(10);
  const [priceIncreasePct, setPriceIncreasePct] = useState<number>(4);
  const [cogsReductionPct, setCogsReductionPct] = useState<number>(3);
  const [adReductionPct, setAdReductionPct] = useState<number>(15);

  const scenario = simulateProfitScenario(pnl, {
    directOrderShiftPct: directShiftPct,
    menuPriceIncreasePct: priceIncreasePct,
    cogsReductionPct,
    adSpendReductionPct: adReductionPct,
  });

  const handleApplyPreset = (targetProfit: number) => {
    // Solve realistic levers for target milestones (e.g. 50k, 100k, 200k)
    if (targetProfit === 50000) {
      setDirectShiftPct(8);
      setPriceIncreasePct(3);
      setCogsReductionPct(2);
      setAdReductionPct(10);
    } else if (targetProfit === 100000) {
      setDirectShiftPct(15);
      setPriceIncreasePct(5);
      setCogsReductionPct(4);
      setAdReductionPct(20);
    } else if (targetProfit === 200000) {
      setDirectShiftPct(25);
      setPriceIncreasePct(8);
      setCogsReductionPct(5);
      setAdReductionPct(30);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Profit Improvement &amp; Channel Shift Simulator
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Simulate operational levers: shift aggregator volume to direct orders (saving ~18% commission),
            reprice inelastic signature dishes, and optimize kitchen yield.
          </p>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Target Profit Milestone Quick Buttons */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-sm border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Target className="w-5 h-5 text-teal-400" />
          <div>
            <div className="text-sm font-bold text-white">Preset Target Profit Solvers</div>
            <div className="text-xs text-slate-300">
              One-click configuration to reach monthly operating EBITDA targets
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleApplyPreset(50000)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-all cursor-pointer"
          >
            Target ₹50k / mo
          </button>
          <button
            onClick={() => handleApplyPreset(100000)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold transition-all cursor-pointer shadow-sm"
          >
            Target ₹1 Lakh / mo
          </button>
          <button
            onClick={() => handleApplyPreset(200000)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold transition-all cursor-pointer shadow-sm"
          >
            Target ₹2 Lakhs / mo
          </button>
        </div>
      </div>

      {/* Main Simulation Grid: Controls on Left, Impact on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Simulator Levers */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-teal-600" /> Interactive Strategic Levers
          </h3>

          <div className="space-y-4 text-xs">
            {/* Lever 1: Direct Shift */}
            <div>
              <div className="flex items-center justify-between font-semibold mb-1">
                <span className="text-slate-800">
                  Direct Order Shift (From Swiggy/Zomato to Ownly/Direct):
                </span>
                <span className="text-teal-700 font-bold">{directShiftPct}% shifted</span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                value={directShiftPct}
                onChange={(e) => setDirectShiftPct(Number(e.target.value))}
                className="w-full accent-teal-600"
              />
              <div className="text-[11px] text-slate-500 mt-1">
                Saves ~18% in aggregator commissions on every shifted bill
              </div>
            </div>

            {/* Lever 2: Menu Price Increase */}
            <div>
              <div className="flex items-center justify-between font-semibold mb-1">
                <span className="text-slate-800">Selective Menu Price Optimization:</span>
                <span className="text-indigo-700 font-bold">+{priceIncreasePct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={15}
                step={0.5}
                value={priceIncreasePct}
                onChange={(e) => setPriceIncreasePct(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
              <div className="text-[11px] text-slate-500 mt-1">
                Repricing inelastic bestselling signature items and combo platters
              </div>
            </div>

            {/* Lever 3: Food Cost Reduction */}
            <div>
              <div className="flex items-center justify-between font-semibold mb-1">
                <span className="text-slate-800">Recipe Food Cost &amp; Waste Reduction:</span>
                <span className="text-emerald-700 font-bold">-{cogsReductionPct}% on COGS</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={cogsReductionPct}
                onChange={(e) => setCogsReductionPct(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
              <div className="text-[11px] text-slate-500 mt-1">
                Bulk procurement discounts, portion spoons, and kitchen trim control
              </div>
            </div>

            {/* Lever 4: Ad Spend Reduction */}
            <div>
              <div className="flex items-center justify-between font-semibold mb-1">
                <span className="text-slate-800">Platform Sponsored Ad Spend Trim:</span>
                <span className="text-amber-700 font-bold">-{adReductionPct}% ad spend</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={adReductionPct}
                onChange={(e) => setAdReductionPct(Number(e.target.value))}
                className="w-full accent-amber-600"
              />
              <div className="text-[11px] text-slate-500 mt-1">
                Pausing non-converting keyword bids and focusing on organic review velocity
              </div>
            </div>
          </div>
        </div>

        {/* Projected Results & Comparison */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Projected Monthly Financial Outcome
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Comparison between current baseline October 2026 performance and simulated strategy
            </p>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-medium">Net Sales Revenue</span>
                <div className="text-right">
                  <span className="text-slate-500 line-through text-[11px] mr-2">
                    {formatINR(pnl.netSalesRevenue)}
                  </span>
                  <span className="font-bold text-slate-900">
                    {formatINR(scenario.projectedNetRevenue)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-medium">Contribution Margin</span>
                <div className="text-right">
                  <span className="text-slate-500 line-through text-[11px] mr-2">
                    {formatINR(pnl.contributionMargin)}
                  </span>
                  <span className="font-bold text-indigo-900">
                    {formatINR(scenario.projectedContributionMargin)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-medium">Fixed Operating Expenses</span>
                <div className="text-right">
                  <span className="font-bold text-slate-900">
                    {formatINR(scenario.projectedFixedCosts)}
                  </span>
                </div>
              </div>

              <div
                className={`p-4 rounded-xl border ${
                  scenario.projectedOperatingProfit >= 0
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/70 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">Projected Operating Net Profit (EBITDA)</span>
                  <span className="text-xl font-black">
                    {formatINR(scenario.projectedOperatingProfit)}
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-xs font-semibold">
                  <span>Incremental Monthly Gain:</span>
                  <span className="text-emerald-700 font-black text-sm">
                    +{formatINR(scenario.profitDifference)} / month
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-[11px] text-teal-900">
            <strong>Annualized Bottom-Line Value:</strong> Implementing this strategy yields approximately{' '}
            <strong>{formatINR(scenario.profitDifference * 12)}</strong> in additional annual restaurant free cash flow.
          </div>
        </div>
      </div>
    </div>
  );
};
