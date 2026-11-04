import React, { useState, useMemo } from 'react';
import { ActionRecommendation, MenuClassification, ParentDish } from '../types/restaurant';
import { DishRecipe, ProfitOpportunityCategory } from '../types/recipe';
import { calculateParentProfitMetrics } from '../utils/recipeCalculator';
import { formatINR, formatNumber, formatPercent } from '../utils/formatters';
import {
  Sparkles,
  Flame,
  Award,
  TrendingUp,
  Gem,
  TrendingDown,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  Filter,
  Layers,
  Percent,
} from 'lucide-react';

interface GrowthOpportunitiesViewProps {
  parentDishes: ParentDish[];
  recipes?: DishRecipe[];
  onSelectDish: (dish: ParentDish) => void;
}

export const GrowthOpportunitiesView: React.FC<GrowthOpportunitiesViewProps> = ({
  parentDishes,
  recipes = [],
  onSelectDish,
}) => {
  const [viewMode, setViewMode] = useState<'RECIPE_MARGINS' | 'SALES_VOLUME'>('RECIPE_MARGINS');

  // Profit metrics calculation with deterministic CM
  const { parentMetrics } = useMemo(() => {
    return calculateParentProfitMetrics(parentDishes, recipes);
  }, [parentDishes, recipes]);

  const [activeCategory, setActiveCategory] = useState<'ALL' | ProfitOpportunityCategory>('DOUBLE_DOWN');

  // Counts for Category A-E
  const countByCategory = (cat: ProfitOpportunityCategory) =>
    parentMetrics.filter((d) => d.opportunityCategory === cat).length;

  const displayedProfitDishes = useMemo(() => {
    if (activeCategory === 'ALL') return parentMetrics;
    return parentMetrics.filter((d) => d.opportunityCategory === activeCategory);
  }, [parentMetrics, activeCategory]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold text-slate-900">
                Menu Growth Opportunities &amp; Double Down Engine
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              Every dish is evaluated across four commercial dimensions: <strong>sales demand volume</strong>, <strong>net revenue</strong>, <strong>real contribution margin %</strong>, and <strong>growth velocity</strong>.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg shrink-0">
            <button
              onClick={() => setViewMode('RECIPE_MARGINS')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'RECIPE_MARGINS'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Percent className="w-3.5 h-3.5" />
              Real Unit Margin Mode
            </button>
            <button
              onClick={() => setViewMode('SALES_VOLUME')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'SALES_VOLUME'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Sales Volume Mode
            </button>
          </div>
        </div>

        {/* 5-Category Action Tabs (Module 5: Categories A - E) */}
        {viewMode === 'RECIPE_MARGINS' && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => setActiveCategory('DOUBLE_DOWN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeCategory === 'DOUBLE_DOWN'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>A. Double Down ({countByCategory('DOUBLE_DOWN')})</span>
            </button>

            <button
              onClick={() => setActiveCategory('HIGH_DEMAND_LOW_MARGIN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeCategory === 'HIGH_DEMAND_LOW_MARGIN'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>B. High Demand, Low Margin ({countByCategory('HIGH_DEMAND_LOW_MARGIN')})</span>
            </button>

            <button
              onClick={() => setActiveCategory('HIGH_MARGIN_LOW_DEMAND')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeCategory === 'HIGH_MARGIN_LOW_DEMAND'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>C. High Margin, Low Demand ({countByCategory('HIGH_MARGIN_LOW_DEMAND')})</span>
            </button>

            <button
              onClick={() => setActiveCategory('LOW_DEMAND_LOW_MARGIN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeCategory === 'LOW_DEMAND_LOW_MARGIN'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>D. Low Demand, Low Margin ({countByCategory('LOW_DEMAND_LOW_MARGIN')})</span>
            </button>

            <button
              onClick={() => setActiveCategory('NEGATIVE_CONTRIBUTION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeCategory === 'NEGATIVE_CONTRIBUTION'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>E. Negative Margin ({countByCategory('NEGATIVE_CONTRIBUTION')})</span>
            </button>

            <button
              onClick={() => setActiveCategory('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeCategory === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              View All ({parentMetrics.length})
            </button>
          </div>
        )}
      </div>

      {/* Grid of Actionable Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {viewMode === 'RECIPE_MARGINS'
          ? displayedProfitDishes.map((dish) => {
              const isDoubleDown = dish.opportunityCategory === 'DOUBLE_DOWN';
              const isNeg = dish.opportunityCategory === 'NEGATIVE_CONTRIBUTION';
              const isHDLM = dish.opportunityCategory === 'HIGH_DEMAND_LOW_MARGIN';
              const isHMLD = dish.opportunityCategory === 'HIGH_MARGIN_LOW_DEMAND';

              return (
                <div
                  key={dish.parentDishId}
                  className={`bg-white rounded-xl p-5 border shadow-xs transition-all space-y-4 ${
                    isDoubleDown
                      ? 'border-teal-300 ring-1 ring-teal-500/20'
                      : isNeg
                      ? 'border-rose-300 ring-1 ring-rose-500/20 bg-rose-50/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-slate-900">{dish.parentDishName}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-600">
                          {dish.category}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {dish.variants.length} variant{dish.variants.length > 1 ? 's' : ''} &bull; Ranked #{dish.rankContribution} in Profitability
                      </span>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase ${
                        isDoubleDown
                          ? 'bg-teal-100 text-teal-800 border border-teal-300'
                          : isNeg
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : isHDLM
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : isHMLD
                          ? 'bg-purple-100 text-purple-800 border border-purple-300'
                          : 'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {dish.opportunityCategory.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* 4 Financial Anchors */}
                  <div className="grid grid-cols-4 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Net Revenue</span>
                      <span className="font-extrabold text-slate-900">{formatINR(dish.totalNetRevenue)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Total Margin</span>
                      <span className="font-extrabold text-teal-700">{formatINR(dish.totalContribution)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Unit Margin %</span>
                      <span
                        className={`font-extrabold block ${
                          dish.weightedContributionMarginPct < 30
                            ? 'text-rose-600'
                            : dish.weightedContributionMarginPct >= 42
                            ? 'text-emerald-700'
                            : 'text-slate-800'
                        }`}
                      >
                        {dish.weightedContributionMarginPct}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Volume Sold</span>
                      <span className="font-extrabold text-slate-900">{formatNumber(dish.totalQuantity)} u</span>
                    </div>
                  </div>

                  {/* Recommendations and Action Items */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wide">
                        Commercial Diagnosis
                      </span>
                      <p className="text-slate-600 mt-0.5 leading-relaxed font-medium">
                        {dish.opportunityRecommendation}
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-100 space-y-1">
                      <span className="font-bold text-teal-900 block text-[11px] uppercase tracking-wide flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                        Specific Action Plan
                      </span>
                      <ul className="space-y-1 text-slate-700 pl-4 list-disc text-[11px]">
                        {dish.actionDetails.map((action, idx) => (
                          <li key={idx}>{action}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Variant breakdown pill list */}
                    {dish.variants.length > 1 && (
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Variant Unit Economics:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {dish.variants.map((v) => (
                            <span
                              key={v.variantName}
                              className="text-[10px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200"
                            >
                              {v.variantName}: {formatINR(v.averagePrice)} | Cost {formatINR(v.totalVariableCost)} | CM {v.contributionMarginPct}%
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          : parentDishes.map((dish) => (
              <div
                key={dish.id}
                className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">{dish.name}</h3>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                    {dish.actionRecommendation.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{dish.recommendationReason}</p>
                <div className="text-xs text-slate-500">
                  Revenue: {formatINR(dish.totalRevenue)} &bull; Sold: {formatNumber(dish.totalQuantity)} units
                </div>
              </div>
            ))}
      </div>
    </div>
  );
};
