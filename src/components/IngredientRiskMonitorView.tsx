import React, { useState, useMemo } from 'react';
import { ParentDish } from '../types/restaurant';
import { DishRecipe, IngredientPriceWatch } from '../types/recipe';
import { AffectedDishImpact, calculateCommodityPriceShockImpact } from '../utils/recipeCalculator';
import { formatINR, formatNumber, formatPercent } from '../utils/formatters';
import {
  ShieldAlert,
  Flame,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Sliders,
  DollarSign,
  Package,
  Layers,
  UtensilsCrossed,
  CheckCircle2,
} from 'lucide-react';

interface IngredientRiskMonitorViewProps {
  parentDishes: ParentDish[];
  recipes: DishRecipe[];
  watchlist: IngredientPriceWatch[];
  onUpdateWatchlist?: (updated: IngredientPriceWatch[]) => void;
}

export const IngredientRiskMonitorView: React.FC<IngredientRiskMonitorViewProps> = ({
  parentDishes,
  recipes,
  watchlist: initialWatchlist,
}) => {
  const [watchlist, setWatchlist] = useState<IngredientPriceWatch[]>(initialWatchlist);
  const [selectedIngredientName, setSelectedIngredientName] = useState<string>('Broiler Chicken (Curry Cut)');

  const activeIngredient = useMemo(() => {
    return (
      watchlist.find((i) => i.name.toLowerCase() === selectedIngredientName.toLowerCase()) ||
      watchlist[0]
    );
  }, [watchlist, selectedIngredientName]);

  const shockAnalysis = useMemo(() => {
    if (!activeIngredient) return null;
    return calculateCommodityPriceShockImpact(
      activeIngredient.name,
      activeIngredient.currentPrice,
      activeIngredient.newPrice,
      parentDishes,
      recipes
    );
  }, [activeIngredient, parentDishes, recipes]);

  // Overall restaurant risk across all watched commodities
  const portfolioSummary = useMemo(() => {
    let totalPortfolioErosion = 0;
    const items = watchlist.map((item) => {
      const res = calculateCommodityPriceShockImpact(
        item.name,
        item.currentPrice,
        item.newPrice,
        parentDishes,
        recipes
      );
      totalPortfolioErosion += res.totalMonthlyProfitErosion;
      return {
        item,
        erosion: res.totalMonthlyProfitErosion,
        affectedCount: res.affectedDishes.length,
      };
    });

    return {
      totalPortfolioErosion: Math.round(totalPortfolioErosion),
      items,
    };
  }, [watchlist, parentDishes, recipes]);

  const handlePriceChange = (name: string, newPrice: number) => {
    setWatchlist((prev) =>
      prev.map((item) =>
        item.name === name
          ? {
              ...item,
              newPrice: Math.max(1, newPrice),
              priceDeltaPct: Math.round(
                ((Math.max(1, newPrice) - item.currentPrice) / item.currentPrice) * 100
              ),
            }
          : item
      )
    );
  };

  const handleReset = (name: string) => {
    setWatchlist((prev) =>
      prev.map((item) =>
        item.name === name
          ? {
              ...item,
              newPrice: item.currentPrice,
              priceDeltaPct: 0,
            }
          : item
      )
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <h2 className="text-xl font-bold text-slate-900">
                Ingredient Cost Risk Monitor &amp; Commodity Shock Simulator
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Wholesale poultry, mutton, cooking oil, and basmati rice prices fluctuate constantly.
              Simulate raw commodity price spikes to pinpoint vulnerable menu items and measure exact rupee profit erosion before it hurts your cash flow.
            </p>
          </div>

          {/* Quick Portfolio Impact */}
          <div className="bg-rose-50 border border-rose-200 px-4 py-2.5 rounded-xl text-right">
            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
              Simulated Profit Erosion
            </span>
            <span className="text-2xl font-black text-rose-900">
              {formatINR(portfolioSummary.totalPortfolioErosion)}
            </span>
            <span className="text-[10px] text-rose-600 block">per month across portfolio</span>
          </div>
        </div>

        {/* Quick commodity pills */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 mr-2">Watchlist:</span>
          {watchlist.map((item) => {
            const isSelected = item.name.toLowerCase() === selectedIngredientName.toLowerCase();
            const hasShock = item.priceDeltaPct !== 0;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedIngredientName(item.name)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{item.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                    hasShock
                      ? item.priceDeltaPct > 0
                        ? 'bg-rose-500 text-white'
                        : 'bg-emerald-500 text-white'
                      : isSelected
                      ? 'bg-slate-700 text-slate-300'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {item.priceDeltaPct > 0 ? `+${item.priceDeltaPct}%` : `${item.priceDeltaPct}%`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Two-Column View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Commodity Slider */}
        <div className="lg:col-span-5 space-y-5">
          {activeIngredient && (
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-teal-600" />
                  Stress-Test {activeIngredient.name}
                </h3>
                {activeIngredient.priceDeltaPct !== 0 && (
                  <button
                    onClick={() => handleReset(activeIngredient.name)}
                    className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                )}
              </div>

              {/* Price comparison box */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                    Current Baseline
                  </span>
                  <p className="text-xl font-bold text-slate-800 mt-0.5">
                    {formatINR(activeIngredient.currentPrice)}
                    <span className="text-xs font-normal text-slate-500"> / {activeIngredient.unit}</span>
                  </p>
                </div>

                <div className="bg-rose-50 p-3 rounded-lg border border-rose-200 text-xs">
                  <span className="text-[10px] text-rose-700 uppercase tracking-wider block font-semibold">
                    Simulated Wholesale Price
                  </span>
                  <p className="text-xl font-bold text-rose-900 mt-0.5">
                    {formatINR(activeIngredient.newPrice)}
                    <span className="text-xs font-normal text-rose-600"> / {activeIngredient.unit}</span>
                  </p>
                </div>
              </div>

              {/* Slider for price */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700">Simulate Wholesale Price Shock:</span>
                  <span className={activeIngredient.priceDeltaPct > 0 ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                    {activeIngredient.priceDeltaPct > 0 ? `+${activeIngredient.priceDeltaPct}%` : `${activeIngredient.priceDeltaPct}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={Math.round(activeIngredient.currentPrice * 0.7)}
                  max={Math.round(activeIngredient.currentPrice * 1.8)}
                  step={5}
                  value={activeIngredient.newPrice}
                  onChange={(e) => handlePriceChange(activeIngredient.name, Number(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>-30% Wholesale Drop</span>
                  <span>Baseline</span>
                  <span>+80% Supply Spike</span>
                </div>
              </div>

              {/* Quick Shock Presets */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                  Realistic Market Scenarios:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '+10% Minor Rise', pct: 10 },
                    { label: '+25% Seasonal Rush', pct: 25 },
                    { label: '+50% Supply Crisis', pct: 50 },
                  ].map((sc) => (
                    <button
                      key={sc.pct}
                      onClick={() =>
                        handlePriceChange(
                          activeIngredient.name,
                          Math.round(activeIngredient.currentPrice * (1 + sc.pct / 100))
                        )
                      }
                      className="px-2 py-1.5 text-[10px] font-bold rounded border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all text-center"
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Risk Mitigation Playbook */}
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-xs space-y-2">
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-600" />
                  Recommended CFO Defense Strategies:
                </p>
                <ul className="space-y-1.5 text-amber-800 text-[11px] pl-4 list-disc">
                  <li>
                    <strong>Forward Supply Contract:</strong> Lock 60-day purchasing contracts with local mandi distributors at fixed rates.
                  </li>
                  <li>
                    <strong>Grammage Calibration:</strong> Calibrate raw serving portions by 10-15g using kitchen digital scales to neutralize the price jump without altering guest perception.
                  </li>
                  <li>
                    <strong>Pair with High-Margin Beverages:</strong> Train staff to upsell signature mocktails or desserts with affected chicken/mutton dishes.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Affected Dishes Matrix */}
        <div className="lg:col-span-7 space-y-5">
          {shockAnalysis && (
            <>
              {/* Impact Banner Card */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Affected Menu Items ({shockAnalysis.affectedDishes.length} Dishes Found)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Dishes utilizing {activeIngredient.name} in their Bill of Materials
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                      Monthly Profit Impact
                    </span>
                    <span
                      className={`text-lg font-black ${
                        shockAnalysis.totalMonthlyProfitErosion > 0 ? 'text-rose-600' : 'text-slate-800'
                      }`}
                    >
                      {shockAnalysis.totalMonthlyProfitErosion > 0 ? '-' : ''}
                      {formatINR(shockAnalysis.totalMonthlyProfitErosion)}
                    </span>
                  </div>
                </div>

                {/* Table of affected dishes */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Dish / Variant</th>
                        <th className="py-2.5 px-2 text-right">Qty/Portion</th>
                        <th className="py-2.5 px-2 text-right">Old Cost</th>
                        <th className="py-2.5 px-2 text-right text-rose-700 font-bold">New Cost</th>
                        <th className="py-2.5 px-2 text-right">Old CM %</th>
                        <th className="py-2.5 px-2 text-right font-bold">New CM %</th>
                        <th className="py-2.5 px-3 text-right text-rose-700 font-bold">Monthly Loss</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shockAnalysis.affectedDishes.map((d: AffectedDishImpact, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {d.dishName}
                            <span className="text-[10px] text-slate-500 block font-normal">{d.variantName}</span>
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-700">
                            {d.ingredientQtyInPortion} {d.ingredientUnit}
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-600">{formatINR(d.currentPortionCost)}</td>
                          <td className="py-2.5 px-2 text-right font-bold text-rose-600 bg-rose-50/40">
                            {formatINR(d.newPortionCost)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-600">{d.currentMarginPct}%</td>
                          <td className="py-2.5 px-2 text-right font-bold text-slate-900">
                            <span className={d.newMarginPct < 30 ? 'text-rose-600' : 'text-slate-800'}>
                              {d.newMarginPct}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                            -{formatINR(d.monthlyProfitErosion)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Commodity Watchlist Overview Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                All Watched Commodity Ingredients
              </h3>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {watchlist.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedIngredientName(item.name)}
                  className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                    item.name.toLowerCase() === selectedIngredientName.toLowerCase()
                      ? 'bg-teal-50/50'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <span className="font-semibold text-slate-900">{item.name}</span>
                    <span className="text-[10px] text-slate-400 block">
                      {item.category} &bull; Base: {formatINR(item.currentPrice)} / {item.unit}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        item.priceDeltaPct > 0
                          ? 'bg-rose-100 text-rose-800'
                          : item.priceDeltaPct < 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.priceDeltaPct > 0 ? `+${item.priceDeltaPct}%` : `${item.priceDeltaPct}%`}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
