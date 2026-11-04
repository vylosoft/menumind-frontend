import React, { useState, useMemo } from 'react';
import {
  ParentDish,
  ReconciliationReport,
} from '../types/restaurant';
import { formatINR, formatNumber, formatPercent, formatMonthName } from '../utils/formatters';
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  IndianRupee,
  Utensils,
  Award,
  AlertTriangle,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieIcon,
  BarChart3,
  Search,
  Filter,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { NavTab } from './Sidebar';

interface OverviewViewProps {
  parentDishes: ParentDish[];
  totalRevenue: number;
  totalQuantity: number;
  reconciliation: ReconciliationReport;
  onSelectTab: (tab: NavTab) => void;
  onSelectDish: (dish: ParentDish) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  parentDishes,
  totalRevenue,
  totalQuantity,
  reconciliation,
  onSelectTab,
  onSelectDish,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [chartMetric, setChartMetric] = useState<'revenue' | 'quantity'>('revenue');

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    parentDishes.forEach((d) => set.add(d.category));
    return ['ALL', ...Array.from(set).sort()];
  }, [parentDishes]);

  // Filtered dishes
  const filteredDishes = useMemo(() => {
    return parentDishes.filter((d) => {
      const matchCat = selectedCategory === 'ALL' || d.category === selectedCategory;
      const matchSearch =
        searchQuery === '' ||
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.variants.some((v) => v.rawName.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [parentDishes, selectedCategory, searchQuery]);

  // Key metrics
  const avgRevPerUnit = totalQuantity > 0 ? totalRevenue / totalQuantity : 0;

  // Top 5 by Revenue
  const topRevenueDishes = useMemo(() => {
    return [...filteredDishes].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);
  }, [filteredDishes]);

  // Top 5 by Quantity
  const topVolumeDishes = useMemo(() => {
    return [...filteredDishes].sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 5);
  }, [filteredDishes]);

  // Rising & Declining
  const risingDishes = useMemo(() => {
    return filteredDishes.filter((d) => d.classification === 'RISING_STAR');
  }, [filteredDishes]);

  const decliningDishes = useMemo(() => {
    return filteredDishes.filter((d) => d.classification === 'DECLINING');
  }, [filteredDishes]);

  const reviewDishes = useMemo(() => {
    return filteredDishes.filter((d) => d.classification === 'EXIT_CANDIDATE');
  }, [filteredDishes]);

  // Pareto Concentration (Top 20% of dishes generate what % of revenue)
  const paretoConcentration = useMemo(() => {
    if (parentDishes.length === 0 || totalRevenue === 0) return 0;
    const sorted = [...parentDishes].sort((a, b) => b.totalRevenue - a.totalRevenue);
    const top20Count = Math.max(1, Math.round(sorted.length * 0.2));
    const top20Rev = sorted.slice(0, top20Count).reduce((sum, d) => sum + d.totalRevenue, 0);
    return (top20Rev / totalRevenue) * 100;
  }, [parentDishes, totalRevenue]);

  // Monthly timeline aggregation
  const monthlyTimeline = useMemo(() => {
    const months = reconciliation.monthsPresent;
    if (!months || months.length === 0) return [];

    return months.map((m) => {
      let mRev = 0;
      let mQty = 0;
      parentDishes.forEach((d) => {
        if (d.monthlyData[m]) {
          mRev += d.monthlyData[m].revenue;
          mQty += d.monthlyData[m].qty;
        }
      });
      return {
        month: m,
        monthName: formatMonthName(m),
        revenue: mRev,
        quantity: mQty,
      };
    });
  }, [reconciliation.monthsPresent, parentDishes]);

  const maxTimelineVal = useMemo(() => {
    if (monthlyTimeline.length === 0) return 1;
    return Math.max(...monthlyTimeline.map((item) => (chartMetric === 'revenue' ? item.revenue : item.quantity)));
  }, [monthlyTimeline, chartMetric]);

  // Category revenue contribution
  const categoryStats = useMemo(() => {
    const catMap = new Map<string, { revenue: number; quantity: number }>();
    parentDishes.forEach((d) => {
      const cur = catMap.get(d.category) || { revenue: 0, quantity: 0 };
      cur.revenue += d.totalRevenue;
      cur.quantity += d.totalQuantity;
      catMap.set(d.category, cur);
    });
    return Array.from(catMap.entries())
      .map(([category, val]) => ({
        category,
        revenue: val.revenue,
        quantity: val.quantity,
        revShare: totalRevenue > 0 ? (val.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [parentDishes, totalRevenue]);

  return (
    <div className="space-y-6 pb-12">
      {/* Hero Banner with Required Promise */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-6 text-white shadow-md border border-slate-700/60">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold tracking-wide border border-teal-500/30">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              Petpooja POS Menu Intelligence Engine
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
              &ldquo;Know What Sells. Understand What Earns. Decide What Stays.&rdquo;
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Every dish normalized from raw POS variants, mathematically reconciled, and classified
              to tell you exactly which dishes to <strong className="text-teal-400 font-semibold">double down on</strong>,{' '}
              which to <strong className="text-amber-400 font-semibold">reprice</strong>, and which to{' '}
              <strong className="text-rose-400 font-semibold">consider removing</strong>.
            </p>
          </div>

          <div className="flex flex-wrap md:flex-col gap-2 shrink-0">
            <button
              onClick={() => onSelectTab('opportunities')}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition-all"
            >
              <Flame className="w-4 h-4 text-slate-950" />
              View Growth Opportunities
            </button>
            <button
              onClick={() => onSelectTab('advisor')}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-600 shadow-xs transition-all"
            >
              <Sparkles className="w-4 h-4 text-teal-400" />
              Ask AI Business Advisor
            </button>
          </div>
        </div>

        {/* Ambient background decoration */}
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {parentDishes.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 border-2 border-dashed border-teal-200 shadow-sm text-center space-y-4 max-w-3xl mx-auto my-8">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-200 text-teal-600 flex items-center justify-center mx-auto">
            <Utensils className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-xl font-bold text-slate-900">
              Welcome to MenuMind AI — Clean Slate Ready
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-lg mx-auto">
              All demo data has been cleared. To view sales performance, demand intelligence, and recipe costing, please upload your Petpooja POS Sales Reports or Highest Selling Dishes files using <strong className="text-slate-800 font-semibold">Upload POS Data</strong> under <span className="font-semibold text-teal-700">POS Sales &amp; Grouping</span> in the left sidebar.
            </p>
          </div>
          <div className="pt-2 text-xs text-slate-400 font-medium">
            Sidebar &rarr; POS Sales &amp; Grouping &rarr; Upload POS Data
          </div>
        </div>
      ) : (
        <>
          {/* Primary KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Sales Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight">
            {formatINR(totalRevenue)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold text-teal-700">Net Sales</span>
            <span>from {reconciliation.validRows.toLocaleString()} orders</span>
          </div>
        </div>

        {/* Total Units Sold */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Portions Sold</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight">
            {formatNumber(totalQuantity)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <span>Avg price:</span>
            <span className="font-semibold text-slate-700">{formatINR(avgRevPerUnit)} / portion</span>
          </div>
        </div>

        {/* Unique Parent Dishes */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Parent Dishes Normalized</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Utensils className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight">
            {parentDishes.length}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span>from</span>
            <span className="font-semibold text-slate-700">{reconciliation.uniqueRawItems} raw POS variants</span>
          </div>
        </div>

        {/* Revenue Concentration (Pareto) */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Revenue Concentration</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <PieIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight">
            {formatPercent(paretoConcentration)}
          </div>
          <div className="mt-1 text-xs text-slate-500 truncate">
            generated by top 20% of menu items
          </div>
        </div>
      </div>

      {/* Secondary Signal Cards (Rising, Declining, Review) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Rising Stars */}
        <div
          onClick={() => onSelectTab('opportunities')}
          className="bg-white rounded-xl p-4 border border-emerald-200/80 shadow-xs hover:shadow-sm cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              Rising Demand ({risingDishes.length})
            </span>
            <span className="text-xs text-emerald-700 font-semibold group-hover:translate-x-0.5 transition-transform">
              View &rarr;
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Items experiencing strong upward sales growth (+15% or more).
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {risingDishes.slice(0, 3).map((d) => (
              <span
                key={d.id}
                className="px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
              >
                {d.name} (+{d.l3mVsP3mChange || d.momQtyChange}%)
              </span>
            ))}
            {risingDishes.length === 0 && (
              <span className="text-xs text-slate-400 italic">No rapid growth items detected</span>
            )}
          </div>
        </div>

        {/* Declining Demand */}
        <div
          onClick={() => onSelectTab('opportunities')}
          className="bg-white rounded-xl p-4 border border-amber-200/80 shadow-xs hover:shadow-sm cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowDownRight className="w-4 h-4 text-amber-600" />
              Declining Demand ({decliningDishes.length})
            </span>
            <span className="text-xs text-amber-700 font-semibold group-hover:translate-x-0.5 transition-transform">
              Review &rarr;
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Dishes softening over recent periods. Requires pricing or recipe audit.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {decliningDishes.slice(0, 3).map((d) => (
              <span
                key={d.id}
                className="px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"
              >
                {d.name} ({d.l3mVsP3mChange || d.momQtyChange}%)
              </span>
            ))}
            {decliningDishes.length === 0 && (
              <span className="text-xs text-slate-400 italic">No severe drops detected</span>
            )}
          </div>
        </div>

        {/* Menu Exit Candidates */}
        <div
          onClick={() => onSelectTab('removal')}
          className="bg-white rounded-xl p-4 border border-rose-200/80 shadow-xs hover:shadow-sm cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              Exit Candidates ({reviewDishes.length})
            </span>
            <span className="text-xs text-rose-700 font-semibold group-hover:translate-x-0.5 transition-transform">
              Simulate &rarr;
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Consistently bottom volume & revenue with minimal customer traction.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {reviewDishes.slice(0, 3).map((d) => (
              <span
                key={d.id}
                className="px-2 py-1 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200"
              >
                {d.name} ({d.totalQuantity} units)
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">Category:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs font-medium border border-slate-300 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'ALL' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search parent dish or variant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Interactive Charts Section: Monthly Progression & Category Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Trend Visualizer (2 Cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-teal-600" />
                Monthly Performance Progression
              </h3>
              <p className="text-xs text-slate-500">
                Tracking total {chartMetric === 'revenue' ? 'sales revenue (INR)' : 'portions sold'} across 6 months
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
              <button
                onClick={() => setChartMetric('revenue')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  chartMetric === 'revenue'
                    ? 'bg-white text-teal-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Revenue
              </button>
              <button
                onClick={() => setChartMetric('quantity')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  chartMetric === 'quantity'
                    ? 'bg-white text-teal-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Volume (Qty)
              </button>
            </div>
          </div>

          {/* Bar Chart Visualization */}
          <div className="pt-4 h-56 flex items-end justify-between gap-3 border-b border-slate-200 pb-2">
            {monthlyTimeline.map((item) => {
              const val = chartMetric === 'revenue' ? item.revenue : item.quantity;
              const heightPct = maxTimelineVal > 0 ? Math.round((val / maxTimelineVal) * 100) : 0;
              return (
                <div key={item.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="text-[10px] font-semibold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    {chartMetric === 'revenue' ? formatINR(val, { compact: true }) : formatNumber(val)}
                  </span>
                  <div className="w-full max-w-[48px] bg-slate-100 rounded-t-lg h-full flex items-end p-1">
                    <div
                      style={{ height: `${Math.max(12, heightPct)}%` }}
                      className={`w-full rounded-md transition-all duration-500 ${
                        chartMetric === 'revenue'
                          ? 'bg-gradient-to-t from-teal-600 to-teal-400 group-hover:from-teal-500 group-hover:to-teal-300'
                          : 'bg-gradient-to-t from-amber-600 to-amber-400 group-hover:from-amber-500 group-hover:to-amber-300'
                      }`}
                    ></div>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">
                    {item.monthName.split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Granularity: {reconciliation.detectedGranularity.toUpperCase()} POS Data</span>
            <button
              onClick={() => onSelectTab('monthly')}
              className="text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1"
            >
              View Month-over-Month Matrix &rarr;
            </button>
          </div>
        </div>

        {/* Category Contribution (1 Col) */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-purple-600" />
              Category Share
            </h3>
            <span className="text-xs text-slate-400">{categoryStats.length} Categories</span>
          </div>

          <div className="space-y-3 pt-2">
            {categoryStats.map((cat) => (
              <div key={cat.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 truncate max-w-[140px]">
                    {cat.category}
                  </span>
                  <div className="flex items-center gap-2 text-slate-600">
                    <span>{formatINR(cat.revenue, { compact: true })}</span>
                    <span className="font-bold text-slate-900 w-12 text-right">
                      {formatPercent(cat.revShare)}
                    </span>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    style={{ width: `${cat.revShare}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-amber-500"
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top 5 Revenue vs Top 5 Most Ordered Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Revenue Champions */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-xs">
                ₹
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Top 5 Revenue Drivers</h3>
                <p className="text-xs text-slate-500">Dishes bringing the highest gross earnings</p>
              </div>
            </div>
            <button
              onClick={() => onSelectTab('performance')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1"
            >
              See All &rarr;
            </button>
          </div>

          <div className="space-y-2">
            {topRevenueDishes.map((dish, idx) => (
              <div
                key={dish.id}
                onClick={() => onSelectDish(dish)}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border border-slate-100 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">{dish.name}</h4>
                    <span className="text-[11px] text-slate-500">
                      {dish.variants.length} variant{dish.variants.length > 1 ? 's' : ''} &bull; {dish.category}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-slate-900 text-xs">
                    {formatINR(dish.totalRevenue)}
                  </div>
                  <div className="text-[10px] text-teal-600 font-semibold">
                    {formatPercent(dish.revenueShare)} of menu
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Most Ordered Dishes */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
                #
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Top 5 Most Ordered (Volume)</h3>
                <p className="text-xs text-slate-500">Dishes anchoring kitchen volume & throughput</p>
              </div>
            </div>
            <button
              onClick={() => onSelectTab('performance')}
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
            >
              See All &rarr;
            </button>
          </div>

          <div className="space-y-2">
            {topVolumeDishes.map((dish, idx) => (
              <div
                key={dish.id}
                onClick={() => onSelectDish(dish)}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border border-slate-100 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">{dish.name}</h4>
                    <span className="text-[11px] text-slate-500">
                      Avg price: {formatINR(dish.averageRealizedPrice)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-slate-900 text-xs">
                    {formatNumber(dish.totalQuantity)} units
                  </div>
                  <div className="text-[10px] text-amber-600 font-semibold">
                    {formatPercent(dish.volumeShare)} of orders
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
