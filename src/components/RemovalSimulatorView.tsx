import React, { useState, useMemo } from 'react';
import { ParentDish } from '../types/restaurant';
import { simulateMenuRemoval } from '../utils/removalSimulator';
import { formatINR, formatNumber, formatPercent } from '../utils/formatters';
import {
  Scissors,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

interface RemovalSimulatorViewProps {
  parentDishes: ParentDish[];
}

export const RemovalSimulatorView: React.FC<RemovalSimulatorViewProps> = ({
  parentDishes,
}) => {
  // Preselect known bottom performers or exit candidates
  const defaultSelected = useMemo(() => {
    const exitCand = parentDishes.find((d) => d.classification === 'EXIT_CANDIDATE');
    return exitCand ? [exitCand.id] : parentDishes.slice(-1).map((d) => d.id);
  }, [parentDishes]);

  const [selectedDishIds, setSelectedDishIds] = useState<string[]>(defaultSelected);
  const [substituteDishId, setSubstituteDishId] = useState<string>(
    parentDishes[0]?.id || ''
  );
  const [demandShiftPct, setDemandShiftPct] = useState<number>(40); // 40% default shift

  const toggleSelectDish = (id: string) => {
    setSelectedDishIds((prev) =>
      prev.includes(id) ? prev.filter((dId) => dId !== id) : [...prev, id]
    );
  };

  const simulation = useMemo(() => {
    return simulateMenuRemoval(
      parentDishes,
      selectedDishIds,
      substituteDishId,
      demandShiftPct
    );
  }, [parentDishes, selectedDishIds, substituteDishId, demandShiftPct]);

  const substituteDish = parentDishes.find((d) => d.id === substituteDishId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Scissors className="w-5 h-5 text-rose-600" />
          <h2 className="text-xl font-bold text-slate-900">
            Menu Optimization &amp; Removal Simulator (&ldquo;What Should I Remove?&rdquo;)
          </h2>
        </div>
        <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
          Simulate the financial and operational impact of retiring low-performing or complex dishes.
          Enter a realistic customer substitution rate to calculate retained revenue versus true revenue at risk.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Dish Selection & Slider (1 Col) */}
        <div className="space-y-4">
          {/* Candidate Selection List */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Select Removal Candidates ({selectedDishIds.length})
              </h3>
              <button
                onClick={() => setSelectedDishIds([])}
                className="text-[11px] text-slate-400 hover:text-slate-700"
              >
                Clear
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {parentDishes.map((dish) => {
                const isSelected = selectedDishIds.includes(dish.id);
                const isExitCand = dish.classification === 'EXIT_CANDIDATE';
                const isDeclining = dish.classification === 'DECLINING';

                return (
                  <div
                    key={dish.id}
                    onClick={() => toggleSelectDish(dish.id)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-rose-50/80 border-rose-300 text-rose-950 font-semibold'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded text-rose-600 focus:ring-rose-500"
                      />
                      <span className="truncate">{dish.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isExitCand && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 font-bold uppercase">
                          Exit
                        </span>
                      )}
                      {isDeclining && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold uppercase">
                          Declining
                        </span>
                      )}
                      <span className="text-slate-500 text-[11px]">
                        {formatINR(dish.totalRevenue, { compact: true })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Customer Substitution Assumption Slider */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-teal-600" />
                  Estimated Demand Shift (%):
                </span>
                <span className="text-sm font-extrabold text-teal-700">{demandShiftPct}%</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                What % of guests who ordered these items will switch to an alternative dish instead of leaving?
              </p>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={demandShiftPct}
              onChange={(e) => setDemandShiftPct(parseInt(e.target.value, 10))}
              className="w-full accent-teal-600 cursor-pointer"
            />

            <div className="flex justify-between text-[10px] text-slate-400 font-medium">
              <span>0% (All Lost)</span>
              <span>40% (Industry Avg)</span>
              <span>80% (High Loyalty)</span>
            </div>

            {/* Target Substitute Dish Selection */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-700 block">
                Primary Substitute Target Dish:
              </label>
              <select
                value={substituteDishId}
                onChange={(e) => setSubstituteDishId(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 bg-slate-50 focus:ring-2 focus:ring-teal-500"
              >
                {parentDishes
                  .filter((d) => !selectedDishIds.includes(d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({formatINR(d.averageRealizedPrice)}/portion)
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right Column: Simulation Results & Recommendation (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          {selectedDishIds.length === 0 ? (
            <div className="bg-white rounded-xl p-12 border border-slate-200 text-center space-y-3">
              <Scissors className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="font-bold text-slate-800 text-sm">Select Candidate Dishes to Simulate</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Check one or more items on the left to evaluate revenue at risk, customer substitution flow,
                and operational kitchen simplification.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Financial Simulation Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Discontinued Sales
                  </span>
                  <span className="text-lg font-extrabold text-slate-900 block mt-1">
                    {formatINR(simulation.originalLostRevenue)}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {simulation.originalLostUnits} portions total
                  </span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Retained by Substitute
                  </span>
                  <span className="text-lg font-extrabold text-teal-700 block mt-1">
                    +{formatINR(simulation.retainedRevenue)}
                  </span>
                  <span className="text-[10px] text-teal-600 font-medium">
                    {simulation.retainedUnits} portions captured
                  </span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Net Revenue Impact
                  </span>
                  <span
                    className={`text-lg font-extrabold block mt-1 ${
                      simulation.netRevenueChange >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {formatINR(simulation.netRevenueChange)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-semibold">
                    {simulation.netRevenueChangePct > 0 ? '+' : ''}
                    {simulation.netRevenueChangePct}% net shift
                  </span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Kitchen Complexity
                  </span>
                  <span className="text-xs font-bold text-slate-800 block mt-1">
                    {simulation.savedComplexityScore}
                  </span>
                </div>
              </div>

              {/* Recommendation Callout Box */}
              <div
                className={`p-5 rounded-xl border text-xs space-y-3 ${
                  simulation.recommendation === 'KEEP'
                    ? 'bg-amber-50/70 border-amber-300 text-amber-950'
                    : simulation.recommendation === 'REDUCE_VARIANTS'
                    ? 'bg-blue-50/70 border-blue-300 text-blue-950'
                    : simulation.recommendation === 'RUN_TRIAL'
                    ? 'bg-purple-50/70 border-purple-300 text-purple-950'
                    : 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    <span className="font-extrabold text-sm uppercase tracking-wide">
                      Simulation Verdict: {simulation.recommendation.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/80 border">
                    Based on {demandShiftPct}% substitution
                  </span>
                </div>

                <p className="leading-relaxed">
                  {simulation.recommendation === 'KEEP' &&
                    'Warning: One or more selected items are marked as Signature Dishes, Cultural Staples, or top-10 volume anchors. Complete removal risks guest satisfaction and restaurant identity.'}
                  {simulation.recommendation === 'REDUCE_VARIANTS' &&
                    'Before discontinuing the dish entirely, trim redundant sizes or portion variants. Consolidating 4 variants into 2 standard portions often reduces kitchen waste while retaining 90%+ of orders.'}
                  {simulation.recommendation === 'RUN_TRIAL' &&
                    'The financial exposure is significant. We recommend running a 14-day digital menu hide trial on Swiggy/Zomato to observe whether orders smoothly redirect before altering physical dine-in menus.'}
                  {simulation.recommendation === 'CONSIDER_REMOVING' &&
                    'Safe candidate for menu retirement. Historical contribution is marginal, customer substitution will offset the minor loss, and kitchen prep capacity will be simplified.'}
                </p>

                {/* Risk Warnings List */}
                {simulation.riskWarnings.length > 0 && (
                  <div className="pt-2 border-t border-current/20 space-y-1">
                    <span className="font-bold block uppercase text-[10px]">
                      Specific Dish Risk Warnings:
                    </span>
                    {simulation.riskWarnings.map((warn, wIdx) => (
                      <div key={wIdx} className="flex items-center gap-1.5 text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{warn}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
