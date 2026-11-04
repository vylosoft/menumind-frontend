import React, { useState, useMemo } from 'react';
import { DishRecipe, ParentProfitMetrics } from '../types/recipe';
import { ParentDish } from '../types/restaurant';
import { calculateParentProfitMetrics } from '../utils/recipeCalculator';
import { formatINR, formatNumber, formatPercent } from '../utils/formatters';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Award,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieIcon,
  BarChart3,
  Layers,
  Sparkles,
  ShieldAlert,
  ChevronRight,
  Filter,
  Search,
} from 'lucide-react';

interface ProfitabilityCommandCenterViewProps {
  profitMetrics?: {
    parentMetrics: ParentProfitMetrics[];
    totalRestaurantRevenue: number;
    totalRestaurantVariableCost: number;
    totalRestaurantContribution: number;
    overallContributionMarginPct: number;
    highestMarginDish?: ParentProfitMetrics;
    highestTotalContributionDish?: ParentProfitMetrics;
    highestUnitContributionDish?: ParentProfitMetrics;
    marginDestroyerDish?: ParentProfitMetrics;
    negativeContributionDishes: ParentProfitMetrics[];
  };
  parentDishes?: ParentDish[];
  recipes?: DishRecipe[];
  onSelectDish?: (parentDishName: string) => void;
  onNavigate?: (tab: string) => void;
}

export const ProfitabilityCommandCenterView: React.FC<ProfitabilityCommandCenterViewProps> = ({
  profitMetrics: passedProfitMetrics,
  parentDishes = [],
  recipes = [],
  onSelectDish = () => {},
  onNavigate = () => {},
}) => {
  const [activeChart, setActiveChart] = useState<'totalCM' | 'unitCM' | 'cmPct' | 'scatter' | 'revVsCM'>('totalCM');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const profitMetrics = useMemo(() => {
    if (passedProfitMetrics) return passedProfitMetrics;
    return calculateParentProfitMetrics(parentDishes, recipes);
  }, [passedProfitMetrics, parentDishes, recipes]);

  const {
    parentMetrics,
    totalRestaurantRevenue,
    totalRestaurantVariableCost,
    totalRestaurantContribution,
    overallContributionMarginPct,
    highestMarginDish,
    highestTotalContributionDish,
    highestUnitContributionDish,
    marginDestroyerDish,
    negativeContributionDishes,
  } = profitMetrics;

  const revenueAtRiskFromNegativeCM = useMemo(() => {
    return negativeContributionDishes.reduce((sum, d) => sum + d.totalNetRevenue, 0);
  }, [negativeContributionDishes]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    parentMetrics.forEach((d) => set.add(d.category));
    return ['ALL', ...Array.from(set).sort()];
  }, [parentMetrics]);

  const filteredDishes = useMemo(() => {
    return parentMetrics.filter(
      (d) => selectedCategory === 'ALL' || d.category === selectedCategory
    );
  }, [parentMetrics, selectedCategory]);

  // Max value calculators for bar visualization
  const maxTotalCM = useMemo(() => {
    if (filteredDishes.length === 0) return 1;
    return Math.max(...filteredDishes.map((d) => Math.max(0, d.totalContribution)));
  }, [filteredDishes]);

  const maxUnitCM = useMemo(() => {
    if (filteredDishes.length === 0) return 1;
    return Math.max(...filteredDishes.map((d) => Math.max(0, d.weightedUnitContribution)));
  }, [filteredDishes]);

  // Scatterplot min/max bounds
  const scatterBounds = useMemo(() => {
    const qtys = filteredDishes.map((d) => d.totalQuantity);
    const cms = filteredDishes.map((d) => d.weightedUnitContribution);
    return {
      maxQty: Math.max(...qtys, 100),
      maxCM: Math.max(...cms, 100),
      minCM: Math.min(...cms, 0),
    };
  }, [filteredDishes]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300 mb-1.5">
            <Award className="w-3.5 h-3.5 text-emerald-700" />
            Module 4: Menu Profitability Command Center
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Menu Profitability &amp; Contribution Margin Dashboard
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
            Answers exactly which dishes generate the highest rupee contribution toward fixed operating costs,
            which dishes sell well but erode margins, and which lose money on each order.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Category:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="p-2 border border-slate-300 rounded-lg bg-slate-50 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-teal-500"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'ALL' ? 'All Categories' : c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Top 10 Executive Financial KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* 1. Total Net Revenue */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 uppercase font-bold block">
            1. Total Net Sales
          </span>
          <span className="text-xl font-extrabold text-slate-900 block mt-1">
            {formatINR(totalRestaurantRevenue)}
          </span>
          <span className="text-[10px] text-slate-500">Realized restaurant revenue</span>
        </div>

        {/* 2. Total Variable Costs */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 uppercase font-bold block">
            2. Total Variable Costs
          </span>
          <span className="text-xl font-extrabold text-slate-800 block mt-1">
            {formatINR(totalRestaurantVariableCost)}
          </span>
          <span className="text-[10px] text-slate-500">Food + Packaging + Fuel</span>
        </div>

        {/* 3. Total Contribution Margin */}
        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-xs bg-emerald-50/20">
          <span className="text-[10px] text-emerald-800 uppercase font-bold block">
            3. Total Contribution
          </span>
          <span className="text-xl font-extrabold text-emerald-950 block mt-1">
            {formatINR(totalRestaurantContribution)}
          </span>
          <span className="text-[10px] text-emerald-700 font-semibold">Available for Fixed Costs</span>
        </div>

        {/* 4. Overall Contribution Margin % */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 uppercase font-bold block">
            4. Weighted CM %
          </span>
          <span className="text-xl font-extrabold text-teal-700 block mt-1">
            {overallContributionMarginPct}%
          </span>
          <span className="text-[10px] text-slate-500">Overall menu efficiency</span>
        </div>

        {/* 5. Highest CM % Dish */}
        <div
          onClick={() => highestMarginDish && onSelectDish(highestMarginDish.parentDishName)}
          className="bg-white p-3.5 rounded-xl border border-purple-200 shadow-xs hover:border-purple-400 cursor-pointer transition-all"
        >
          <span className="text-[10px] text-purple-700 uppercase font-bold block truncate">
            5. Highest CM %
          </span>
          <span className="text-sm font-extrabold text-purple-950 block mt-1 truncate">
            {highestMarginDish?.parentDishName || 'N/A'}
          </span>
          <span className="text-[10px] text-purple-600 font-bold">
            {highestMarginDish?.weightedContributionMarginPct}% CM
          </span>
        </div>

        {/* 6. Highest CM ₹ per Portion */}
        <div
          onClick={() => highestUnitContributionDish && onSelectDish(highestUnitContributionDish.parentDishName)}
          className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 cursor-pointer transition-all"
        >
          <span className="text-[10px] text-slate-400 uppercase font-bold block truncate">
            6. Highest Unit CM (₹)
          </span>
          <span className="text-sm font-extrabold text-slate-900 block mt-1 truncate">
            {highestUnitContributionDish?.parentDishName || 'N/A'}
          </span>
          <span className="text-[10px] text-teal-700 font-bold">
            +{formatINR(highestUnitContributionDish?.weightedUnitContribution)}/portion
          </span>
        </div>

        {/* 7. Highest Total Contribution */}
        <div
          onClick={() => highestTotalContributionDish && onSelectDish(highestTotalContributionDish.parentDishName)}
          className="bg-white p-3.5 rounded-xl border border-emerald-300 shadow-xs hover:border-emerald-500 cursor-pointer transition-all"
        >
          <span className="text-[10px] text-emerald-800 uppercase font-bold block truncate">
            7. Top Cash Generator
          </span>
          <span className="text-sm font-extrabold text-slate-900 block mt-1 truncate">
            {highestTotalContributionDish?.parentDishName || 'N/A'}
          </span>
          <span className="text-[10px] text-emerald-700 font-bold">
            {formatINR(highestTotalContributionDish?.totalContribution)} total
          </span>
        </div>

        {/* 8. Margin Destroyer (High Rev, Low CM) */}
        <div
          onClick={() => marginDestroyerDish && onSelectDish(marginDestroyerDish.parentDishName)}
          className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-xs hover:border-amber-400 cursor-pointer transition-all"
        >
          <span className="text-[10px] text-amber-800 uppercase font-bold block truncate">
            8. Margin Destroyer
          </span>
          <span className="text-sm font-extrabold text-slate-900 block mt-1 truncate">
            {marginDestroyerDish?.parentDishName || 'N/A'}
          </span>
          <span className="text-[10px] text-amber-700 font-semibold">
            {formatINR(marginDestroyerDish?.totalNetRevenue, { compact: true })} rev &bull; {marginDestroyerDish?.weightedContributionMarginPct}% CM
          </span>
        </div>

        {/* 9. Negative CM Dishes Count */}
        <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-xs">
          <span className="text-[10px] text-rose-800 uppercase font-bold block">
            9. Negative CM Items
          </span>
          <span className="text-xl font-extrabold text-rose-700 block mt-1">
            {negativeContributionDishes.length} dishes
          </span>
          <span className="text-[10px] text-rose-600 font-semibold">Selling below variable cost</span>
        </div>

        {/* 10. Revenue at Risk from Negative CM */}
        <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-xs bg-rose-50/20">
          <span className="text-[10px] text-rose-800 uppercase font-bold block">
            10. Loss-Making Sales
          </span>
          <span className="text-xl font-extrabold text-rose-900 block mt-1">
            {formatINR(revenueAtRiskFromNegativeCM)}
          </span>
          <span className="text-[10px] text-rose-700">Subsidized sales volume</span>
        </div>
      </div>

      {/* Interactive Charts Section with Switcher */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-600" />
            <h3 className="font-bold text-sm text-slate-900">
              Interactive Profitability Visualizer
            </h3>
          </div>

          {/* Chart Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveChart('totalCM')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeChart === 'totalCM'
                  ? 'bg-white text-teal-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chart A: Total Contribution (₹)
            </button>
            <button
              onClick={() => setActiveChart('unitCM')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeChart === 'unitCM'
                  ? 'bg-white text-teal-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chart B: Unit CM (₹/portion)
            </button>
            <button
              onClick={() => setActiveChart('cmPct')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeChart === 'cmPct'
                  ? 'bg-white text-teal-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chart C: CM %
            </button>
            <button
              onClick={() => setActiveChart('scatter')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeChart === 'scatter'
                  ? 'bg-white text-teal-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chart D: Volume vs CM Scatter
            </button>
            <button
              onClick={() => setActiveChart('revVsCM')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeChart === 'revVsCM'
                  ? 'bg-white text-teal-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chart E: Revenue vs Profit
            </button>
          </div>
        </div>

        {/* CHART A: Top 20 Dishes by Total Contribution (₹) */}
        {activeChart === 'totalCM' && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Dish Name (Ranked by Total Rupees Generated)</span>
              <span>Total Contribution Toward Fixed Costs (₹)</span>
            </div>
            <div className="space-y-2">
              {filteredDishes.slice(0, 15).map((d) => {
                const widthPct = maxTotalCM > 0 ? (d.totalContribution / maxTotalCM) * 100 : 0;
                return (
                  <div
                    key={d.parentDishId}
                    onClick={() => onSelectDish(d.parentDishName)}
                    className="flex items-center gap-3 text-xs group cursor-pointer hover:bg-slate-50 p-1 rounded-lg"
                  >
                    <span className="w-5 text-slate-400 font-mono text-[10px] text-right">
                      #{d.rankContribution}
                    </span>
                    <span className="w-48 font-bold text-slate-900 truncate">
                      {d.parentDishName}
                    </span>
                    <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden relative">
                      <div
                        style={{ width: `${Math.max(4, widthPct)}%` }}
                        className={`h-full rounded-md transition-all duration-500 ${
                          d.isNegativeMargin
                            ? 'bg-rose-500'
                            : 'bg-gradient-to-r from-teal-600 to-emerald-500 group-hover:from-teal-500 group-hover:to-emerald-400'
                        }`}
                      ></div>
                    </div>
                    <span className="w-24 text-right font-extrabold text-slate-900 font-mono">
                      {formatINR(d.totalContribution)}
                    </span>
                    <span className="w-16 text-right text-[11px] text-teal-700 font-semibold font-mono">
                      {d.weightedContributionMarginPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CHART B: Top 20 Dishes by Unit Contribution (₹/portion) */}
        {activeChart === 'unitCM' && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Dish Name (Ranked by Rupees Earned Per Portion)</span>
              <span>Unit Contribution Margin (Selling Price − Variable Cost)</span>
            </div>
            <div className="space-y-2">
              {[...filteredDishes]
                .sort((a, b) => b.weightedUnitContribution - a.weightedUnitContribution)
                .slice(0, 15)
                .map((d, idx) => {
                  const widthPct = maxUnitCM > 0 ? (d.weightedUnitContribution / maxUnitCM) * 100 : 0;
                  return (
                    <div
                      key={d.parentDishId}
                      onClick={() => onSelectDish(d.parentDishName)}
                      className="flex items-center gap-3 text-xs group cursor-pointer hover:bg-slate-50 p-1 rounded-lg"
                    >
                      <span className="w-5 text-slate-400 font-mono text-[10px] text-right">
                        #{idx + 1}
                      </span>
                      <span className="w-48 font-bold text-slate-900 truncate">
                        {d.parentDishName}
                      </span>
                      <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden relative">
                        <div
                          style={{ width: `${Math.max(4, widthPct)}%` }}
                          className="h-full rounded-md bg-gradient-to-r from-purple-600 to-indigo-500 group-hover:from-purple-500 transition-all duration-500"
                        ></div>
                      </div>
                      <span className="w-24 text-right font-extrabold text-purple-950 font-mono">
                        +{formatINR(d.weightedUnitContribution)}
                      </span>
                      <span className="w-16 text-right text-[11px] text-slate-500 font-mono">
                        {d.totalQuantity} u
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* CHART C: Contribution Margin % Across Menu */}
        {activeChart === 'cmPct' && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Dish Name (Ranked by Contribution Margin %)</span>
              <span>Contribution Margin Ratio (% of Net Revenue Retained)</span>
            </div>
            <div className="space-y-2">
              {[...filteredDishes]
                .sort((a, b) => b.weightedContributionMarginPct - a.weightedContributionMarginPct)
                .slice(0, 15)
                .map((d, idx) => {
                  return (
                    <div
                      key={d.parentDishId}
                      onClick={() => onSelectDish(d.parentDishName)}
                      className="flex items-center gap-3 text-xs group cursor-pointer hover:bg-slate-50 p-1 rounded-lg"
                    >
                      <span className="w-5 text-slate-400 font-mono text-[10px] text-right">
                        #{idx + 1}
                      </span>
                      <span className="w-48 font-bold text-slate-900 truncate">
                        {d.parentDishName}
                      </span>
                      <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden relative">
                        <div
                          style={{ width: `${Math.max(4, Math.min(100, d.weightedContributionMarginPct))}%` }}
                          className={`h-full rounded-md transition-all duration-500 ${
                            d.weightedContributionMarginPct >= 45
                              ? 'bg-emerald-500'
                              : d.weightedContributionMarginPct >= 30
                              ? 'bg-teal-500'
                              : d.weightedContributionMarginPct >= 15
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                        ></div>
                      </div>
                      <span className="w-20 text-right font-extrabold text-slate-900 font-mono">
                        {d.weightedContributionMarginPct}%
                      </span>
                      <span className="w-20 text-right text-[11px] text-slate-500 font-mono">
                        {formatINR(d.averageRealizedPrice)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* CHART D: Sales Volume vs Contribution Margin Scatterplot */}
        {activeChart === 'scatter' && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Scatterplot: Sales Volume (X-axis) vs Unit CM in ₹ (Y-axis)</span>
              <span>Bubble Size = Total Revenue &bull; Color = Action Category</span>
            </div>

            <div className="relative h-72 border-b-2 border-l-2 border-slate-300 p-4 bg-slate-50/50 rounded-lg">
              {/* Reference Grid lines */}
              <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-slate-300 pointer-events-none"></div>
              <div className="absolute top-0 bottom-0 left-1/2 border-l border-dashed border-slate-300 pointer-events-none"></div>

              {filteredDishes.map((d) => {
                const xPct = Math.min(92, Math.max(8, (d.totalQuantity / scatterBounds.maxQty) * 100));
                const yPct = Math.min(92, Math.max(8, (d.weightedUnitContribution / scatterBounds.maxCM) * 100));
                const sizePx = Math.max(16, Math.min(36, Math.round((d.totalNetRevenue / totalRestaurantRevenue) * 200)));

                return (
                  <div
                    key={d.parentDishId}
                    onClick={() => onSelectDish(d.parentDishName)}
                    style={{ left: `${xPct}%`, bottom: `${yPct}%` }}
                    className="absolute -translate-x-1/2 translate-y-1/2 cursor-pointer group z-10"
                  >
                    <div
                      style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
                      className={`rounded-full shadow-md border-2 border-white flex items-center justify-center transition-transform hover:scale-125 ${
                        d.opportunityCategory === 'DOUBLE_DOWN'
                          ? 'bg-teal-500/90'
                          : d.opportunityCategory === 'HIGH_DEMAND_LOW_MARGIN'
                          ? 'bg-blue-500/90'
                          : d.opportunityCategory === 'HIGH_MARGIN_LOW_DEMAND'
                          ? 'bg-purple-500/90'
                          : d.opportunityCategory === 'NEGATIVE_CONTRIBUTION'
                          ? 'bg-rose-600/90'
                          : 'bg-slate-500/90'
                      }`}
                    ></div>
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] whitespace-nowrap shadow-xl pointer-events-none z-30">
                      <span className="font-bold block">{d.parentDishName}</span>
                      <span>Qty: {d.totalQuantity} &bull; CM: {formatINR(d.weightedUnitContribution)} ({d.weightedContributionMarginPct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>0 Portions Sold</span>
              <span className="font-semibold text-slate-700">Higher Demand &rarr;</span>
              <span>{scatterBounds.maxQty} Portions Sold</span>
            </div>
          </div>
        )}

        {/* CHART E: Revenue vs Contribution */}
        {activeChart === 'revVsCM' && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Revenue vs Contribution Comparison (Identifies dishes earning low profit despite large sales)</span>
              <span>Rupees (₹)</span>
            </div>
            <div className="space-y-2">
              {filteredDishes.slice(0, 15).map((d) => {
                const revShare = (d.totalNetRevenue / totalRestaurantRevenue) * 100;
                const cmShare = totalRestaurantContribution > 0 ? (d.totalContribution / totalRestaurantContribution) * 100 : 0;

                return (
                  <div
                    key={d.parentDishId}
                    onClick={() => onSelectDish(d.parentDishName)}
                    className="p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{d.parentDishName}</span>
                      <div className="flex items-center gap-3 text-slate-600 font-mono">
                        <span>Revenue: <strong>{formatINR(d.totalNetRevenue)}</strong> ({revShare.toFixed(1)}%)</span>
                        <span className="text-teal-700 font-extrabold">Contribution: <strong>{formatINR(d.totalContribution)}</strong> ({cmShare.toFixed(1)}%)</span>
                      </div>
                    </div>
                    {/* Dual comparison bar */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div style={{ width: `${Math.min(100, revShare * 3)}%` }} className="h-full bg-slate-400"></div>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div style={{ width: `${Math.min(100, Math.max(0, cmShare * 3))}%` }} className="h-full bg-teal-500"></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
