/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ParentDish } from '../../types/restaurant';
import { DishRecipe } from '../../types/recipe';
import { formatINR, formatPct } from '../../utils/financeCalculations';
import {
  BookOpen,
  PieChart,
  Package,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Search,
  Filter,
} from 'lucide-react';

interface FoodCostContributionProps {
  parentDishes: ParentDish[];
  recipes: DishRecipe[];
}

export const FoodCostContribution: React.FC<FoodCostContributionProps> = ({
  parentDishes,
  recipes,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'contribution' | 'margin' | 'revenue' | 'quantity'>('contribution');

  // Compute enriched dish records
  const enrichedDishes = parentDishes.map((dish) => {
    const matchedRecipe = recipes.find(
      (r) => r.parentDishName.toLowerCase() === dish.name.toLowerCase()
    );

    const recipeCostPerPortion = matchedRecipe
      ? matchedRecipe.totalIngredientCost
      : dish.unitCost || dish.averageRealizedPrice * 0.31;

    const packagingCostPerPortion = matchedRecipe ? matchedRecipe.packagingCost : dish.packagingCost || 8.5;
    const totalUnitCOGS = recipeCostPerPortion + packagingCostPerPortion;
    const unitContribution = Math.max(0, dish.averageRealizedPrice - totalUnitCOGS);
    const totalContribution = unitContribution * dish.totalQuantity;
    const marginPct = dish.averageRealizedPrice > 0 ? (unitContribution / dish.averageRealizedPrice) * 100 : 0;
    const foodCostPct = dish.averageRealizedPrice > 0 ? (recipeCostPerPortion / dish.averageRealizedPrice) * 100 : 0;

    return {
      dish,
      hasRecipe: !!matchedRecipe,
      recipeCostPerPortion,
      packagingCostPerPortion,
      totalUnitCOGS,
      unitContribution,
      totalContribution,
      marginPct,
      foodCostPct,
    };
  });

  const filteredDishes = enrichedDishes
    .filter((item) => item.dish.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'contribution') return b.totalContribution - a.totalContribution;
      if (sortBy === 'margin') return b.marginPct - a.marginPct;
      if (sortBy === 'revenue') return b.dish.totalRevenue - a.dish.totalRevenue;
      if (sortBy === 'quantity') return b.dish.totalQuantity - a.dish.totalQuantity;
      return 0;
    });

  const totalFoodCost = enrichedDishes.reduce(
    (sum, d) => sum + d.recipeCostPerPortion * d.dish.totalQuantity,
    0
  );
  const totalPackagingCost = enrichedDishes.reduce(
    (sum, d) => sum + d.packagingCostPerPortion * d.dish.totalQuantity,
    0
  );
  const totalGrossRevenue = enrichedDishes.reduce((sum, d) => sum + d.dish.totalRevenue, 0);
  const overallFoodCostPct = totalGrossRevenue > 0 ? (totalFoodCost / totalGrossRevenue) * 100 : 0;
  const overallPackagingPct = totalGrossRevenue > 0 ? (totalPackagingCost / totalGrossRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Recipe BOM Cost &amp; Unit Contribution Integration
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Live read-only linkage to verified Bill of Materials (BOM). Multiplies actual Petpooja
            portion volumes against kitchen ingredient sheets and delivery packaging containers.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search normalized dishes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-teal-500"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:outline-teal-500"
          >
            <option value="contribution">Sort: Total Contribution (₹)</option>
            <option value="margin">Sort: Margin %</option>
            <option value="revenue">Sort: Gross Revenue</option>
            <option value="quantity">Sort: Units Sold</option>
          </select>
        </div>
      </div>

      {/* Aggregate COGS Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Blended Food COGS %</div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatPct(overallFoodCostPct)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Total Ingredient Value: {formatINR(totalFoodCost)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Packaging Cost Share</div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatPct(overallPackagingPct)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Containers &amp; Cutlery: {formatINR(totalPackagingCost)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Gross Profit from Dishes</div>
          <div className="text-2xl font-black text-emerald-700 mt-2">
            {formatINR(totalGrossRevenue - totalFoodCost - totalPackagingCost)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Blended Gross Margin: {formatPct(100 - overallFoodCostPct - overallPackagingPct)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Recipe Coverage</div>
          <div className="text-2xl font-black text-indigo-900 mt-2">
            {recipes.length} / {parentDishes.length} Items
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            {enrichedDishes.filter((d) => d.hasRecipe).length} dishes fully costed with BOM
          </div>
        </div>
      </div>

      {/* Item-by-Item Contribution Matrix */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          Dish-by-Dish Contribution &amp; Food Cost Breakdown
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Direct recipe ingredient cost, packaging cost, and net contribution to fixed kitchen overheads
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 uppercase font-semibold text-[11px]">
                <th className="py-3 px-4">Dish Name</th>
                <th className="py-3 px-4 text-center">BOM Status</th>
                <th className="py-3 px-4 text-right">Units Sold</th>
                <th className="py-3 px-4 text-right">Avg Price</th>
                <th className="py-3 px-4 text-right">Food Cost (BOM)</th>
                <th className="py-3 px-4 text-right">Packaging</th>
                <th className="py-3 px-4 text-right">Unit Margin</th>
                <th className="py-3 px-4 text-right font-black text-indigo-950">Total Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredDishes.map((item) => (
                <tr key={item.dish.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    <div>{item.dish.name}</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      {item.dish.category} • {item.dish.variants?.length || 1} variants
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {item.hasRecipe ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Linked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <AlertTriangle className="w-3 h-3 text-amber-600" /> Benchmark (31%)
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium">{item.dish.totalQuantity}</td>
                  <td className="py-3.5 px-4 text-right font-semibold text-slate-800">
                    {formatINR(item.dish.averageRealizedPrice)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-slate-700">
                    {formatINR(item.recipeCostPerPortion)} ({formatPct(item.foodCostPct)})
                  </td>
                  <td className="py-3.5 px-4 text-right text-slate-700">
                    {formatINR(item.packagingCostPerPortion)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-emerald-700">
                    {formatINR(item.unitContribution)} ({formatPct(item.marginPct)})
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-indigo-950 text-sm">
                    {formatINR(item.totalContribution)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
