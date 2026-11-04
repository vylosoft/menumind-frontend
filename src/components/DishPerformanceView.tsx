import React, { useState, useMemo } from 'react';
import { ParentDish } from '../types/restaurant';
import { formatINR, formatNumber, formatPercent } from '../utils/formatters';
import {
  UtensilsCrossed,
  Search,
  Filter,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';

interface DishPerformanceViewProps {
  parentDishes: ParentDish[];
  onSelectDish: (dish: ParentDish) => void;
}

export const DishPerformanceView: React.FC<DishPerformanceViewProps> = ({
  parentDishes,
  onSelectDish,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity' | 'growth' | 'name'>('revenue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedDishIds, setExpandedDishIds] = useState<Set<string>>(new Set());

  const categories = useMemo(() => {
    const set = new Set<string>();
    parentDishes.forEach((d) => set.add(d.category));
    return ['ALL', ...Array.from(set).sort()];
  }, [parentDishes]);

  const toggleExpand = (id: string) => {
    setExpandedDishIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (field: 'revenue' | 'quantity' | 'growth' | 'name') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const processedDishes = useMemo(() => {
    return parentDishes
      .filter((d) => {
        const matchCat = selectedCategory === 'ALL' || d.category === selectedCategory;
        const matchSearch =
          searchQuery === '' ||
          d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.variants.some((v) => v.rawName.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchCat && matchSearch;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === 'revenue') diff = b.totalRevenue - a.totalRevenue;
        else if (sortBy === 'quantity') diff = b.totalQuantity - a.totalQuantity;
        else if (sortBy === 'growth') {
          const aG = a.l3mVsP3mChange !== undefined ? a.l3mVsP3mChange : a.momQtyChange || -999;
          const bG = b.l3mVsP3mChange !== undefined ? b.l3mVsP3mChange : b.momQtyChange || -999;
          diff = bG - aG;
        } else if (sortBy === 'name') {
          diff = a.name.localeCompare(b.name);
        }
        return sortOrder === 'asc' ? -diff : diff;
      });
  }, [parentDishes, selectedCategory, searchQuery, sortBy, sortOrder]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Controls */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-teal-600" />
            Dish Performance &amp; Variant Analysis
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Aggregated parent-level metrics with expandable variant breakdowns, portion economics, and rankings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs font-medium border border-slate-300 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-teal-500"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'ALL' ? 'All Categories' : c}
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search dish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-teal-500"
            >
            </input>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 select-none">
              <tr>
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th
                  onClick={() => handleSort('name')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Parent Dish</span>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
                <th className="py-3 px-3">Category</th>
                <th
                  onClick={() => handleSort('quantity')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Units Sold</span>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('revenue')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Total Revenue</span>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
                <th className="py-3 px-3 text-right">Avg Price</th>
                <th className="py-3 px-3 text-right">Menu Share</th>
                <th
                  onClick={() => handleSort('growth')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Growth (L3M / MoM)</span>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center">Classification</th>
                <th className="py-3 px-3 text-center">Variants</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {processedDishes.map((dish) => {
                const isExpanded = expandedDishIds.has(dish.id);
                const growthVal =
                  dish.l3mVsP3mChange !== undefined ? dish.l3mVsP3mChange : dish.momQtyChange;

                return (
                  <React.Fragment key={dish.id}>
                    <tr
                      onClick={() => toggleExpand(dish.id)}
                      className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-teal-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center text-slate-400 font-mono font-bold">
                        {dish.rankRevenue}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(dish.id);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-slate-700"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <div>
                            <span className="font-bold text-slate-900 block">{dish.name}</span>
                            {dish.isSignatureDish && (
                              <span className="text-[10px] text-teal-700 font-semibold">
                                &bull; Signature Dish
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-medium">{dish.category}</td>
                      <td className="py-3 px-3 text-right font-bold text-slate-800">
                        {formatNumber(dish.totalQuantity)}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {formatPercent(dish.volumeShare)} vol
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-slate-900">
                        {formatINR(dish.totalRevenue)}
                        <span className="block text-[10px] text-teal-600 font-semibold">
                          {formatPercent(dish.revenueShare)} rev
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-slate-700">
                        {formatINR(dish.averageRealizedPrice)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-slate-700">
                        {formatPercent(dish.revenueShare)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold">
                        {growthVal !== undefined ? (
                          <span
                            className={`inline-flex items-center gap-1 ${
                              growthVal > 0
                                ? 'text-emerald-700'
                                : growthVal < 0
                                ? 'text-rose-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {growthVal > 0 ? (
                              <TrendingUp className="w-3.5 h-3.5" />
                            ) : growthVal < 0 ? (
                              <TrendingDown className="w-3.5 h-3.5" />
                            ) : null}
                            {growthVal > 0 ? `+${growthVal}%` : `${growthVal}%`}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">Baseline</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight uppercase ${
                            dish.classification === 'DEMAND_LEADER'
                              ? 'bg-blue-100 text-blue-800'
                              : dish.classification === 'REVENUE_CHAMPION'
                              ? 'bg-teal-100 text-teal-800'
                              : dish.classification === 'RISING_STAR'
                              ? 'bg-emerald-100 text-emerald-800'
                              : dish.classification === 'HIDDEN_GEM'
                              ? 'bg-purple-100 text-purple-800'
                              : dish.classification === 'DECLINING'
                              ? 'bg-amber-100 text-amber-800'
                              : dish.classification === 'EXIT_CANDIDATE'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {dish.classification.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {dish.variants.length} variant{dish.variants.length > 1 ? 's' : ''}
                        </span>
                      </td>
                    </tr>

                    {/* Variant Drilldown Row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90">
                        <td colSpan={10} className="p-4 pl-12 border-b border-slate-200">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-teal-600" />
                                Variant Breakdown for {dish.name}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Exact POS Items merged into this parent
                              </span>
                            </div>

                            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                              <table className="w-full text-[11px] text-left">
                                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                                  <tr>
                                    <th className="py-2 px-3">Variant Name</th>
                                    <th className="py-2 px-3">Raw Petpooja Item Name</th>
                                    <th className="py-2 px-3 text-right">Units Sold</th>
                                    <th className="py-2 px-3 text-right">Revenue</th>
                                    <th className="py-2 px-3 text-right">Price / Portion</th>
                                    <th className="py-2 px-3 text-right">Parent Volume Share</th>
                                    <th className="py-2 px-3 text-right">Parent Revenue Share</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {dish.variants.map((v) => (
                                    <tr key={v.rawName} className="hover:bg-slate-50">
                                      <td className="py-2 px-3 font-bold text-slate-900">
                                        {v.variantName}
                                      </td>
                                      <td className="py-2 px-3 text-slate-600 font-mono">
                                        {v.rawName}
                                      </td>
                                      <td className="py-2 px-3 text-right font-medium text-slate-800">
                                        {formatNumber(v.quantity)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                                        {formatINR(v.revenue)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-medium text-slate-700">
                                        {formatINR(v.averagePrice)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-semibold text-slate-700">
                                        {formatPercent(v.volumeShare)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-bold text-teal-700">
                                        {formatPercent(v.revenueShare)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Operational Variant Insight */}
                            {dish.variants.length > 2 && (
                              <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200/80 text-[11px] text-teal-900 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
                                  <span>
                                    <strong>Variant Efficiency Note:</strong> Top variant &ldquo;
                                    {dish.variants[0].variantName}&rdquo; generates{' '}
                                    {formatPercent(dish.variants[0].revenueShare)} of sales. Smallest variant &ldquo;
                                    {dish.variants[dish.variants.length - 1].variantName}&rdquo; accounts for only{' '}
                                    {formatPercent(dish.variants[dish.variants.length - 1].revenueShare)}. Consider testing variant consolidation.
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
