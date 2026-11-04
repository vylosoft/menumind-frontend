import React, { useState, useMemo } from 'react';
import { RawSalesRecord } from '../types/restaurant';
import {
  groupSalesByOutlet,
  getSavedOutletOverrides,
  saveOutletOverride,
  SupportedOutlet,
  OutletDishItem,
  CrossOutletComparisonItem,
} from '../utils/outletGroupingManager';
import { formatINR, formatNumber } from '../utils/formatters';
import {
  Building2,
  FolderTree,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Download,
  ArrowRightLeft,
  Sparkles,
  Info,
  TrendingUp,
  MapPin,
  Utensils,
  Layers,
  ArrowUpDown,
  Tag,
} from 'lucide-react';

interface OutletGroupingViewProps {
  rawRecords: RawSalesRecord[];
  onToggleGroupingMode?: (mode: 'dish' | 'outlet') => void;
  onRefreshAggregation?: () => void;
}

export const OutletGroupingView: React.FC<OutletGroupingViewProps> = ({
  rawRecords,
  onToggleGroupingMode,
  onRefreshAggregation,
}) => {
  const [manualOverrides, setManualOverrides] = useState<Record<string, SupportedOutlet>>(() =>
    getSavedOutletOverrides()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubTab, setSelectedSubTab] = useState<
    'comparison' | 'banaswadi' | 'whitefield' | 'audit'
  >('comparison');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity' | 'name'>('revenue');
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Group records by outlet
  const groupedData = useMemo(() => {
    return groupSalesByOutlet(rawRecords, manualOverrides);
  }, [rawRecords, manualOverrides]);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    rawRecords.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort();
  }, [rawRecords]);

  // Filter and sort comparison items
  const filteredComparison = useMemo(() => {
    return groupedData.crossOutletComparison
      .filter((item) => {
        const matchesSearch =
          !searchQuery.trim() ||
          item.cleanName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.category.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory =
          categoryFilter === 'ALL' || item.category.toLowerCase() === categoryFilter.toLowerCase();
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === 'revenue') return b.totalRevenue - a.totalRevenue;
        if (sortBy === 'quantity') return b.totalQty - a.totalQty;
        return a.cleanName.localeCompare(b.cleanName);
      });
  }, [groupedData.crossOutletComparison, searchQuery, categoryFilter, sortBy]);

  // Filter Banaswadi items
  const filteredBanaswadi = useMemo(() => {
    return groupedData.banaswadi.items
      .filter((item) => {
        const matchesSearch =
          !searchQuery.trim() ||
          item.cleanName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.rawName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory =
          categoryFilter === 'ALL' || item.category.toLowerCase() === categoryFilter.toLowerCase();
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === 'revenue') return b.revenue - a.revenue;
        if (sortBy === 'quantity') return b.quantity - a.quantity;
        return a.cleanName.localeCompare(b.cleanName);
      });
  }, [groupedData.banaswadi.items, searchQuery, categoryFilter, sortBy]);

  // Filter Whitefield items
  const filteredWhitefield = useMemo(() => {
    return groupedData.whitefield.items
      .filter((item) => {
        const matchesSearch =
          !searchQuery.trim() ||
          item.cleanName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.rawName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory =
          categoryFilter === 'ALL' || item.category.toLowerCase() === categoryFilter.toLowerCase();
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === 'revenue') return b.revenue - a.revenue;
        if (sortBy === 'quantity') return b.quantity - a.quantity;
        return a.cleanName.localeCompare(b.cleanName);
      });
  }, [groupedData.whitefield.items, searchQuery, categoryFilter, sortBy]);

  // Handle reassigning outlet for a specific raw item
  const handleReassignOutlet = (rawItemName: string, newOutlet: SupportedOutlet) => {
    saveOutletOverride(rawItemName, newOutlet);
    setManualOverrides((prev) => ({
      ...prev,
      [rawItemName.toLowerCase().trim()]: newOutlet,
    }));
    showToast(
      `Reassigned "${rawItemName}" to ${newOutlet === 'whitefield' ? 'Whitefield' : 'Banaswadi'}.`
    );
    if (onRefreshAggregation) onRefreshAggregation();
  };

  // Export CSV of outlet comparison
  const handleExportCSV = () => {
    const headers = [
      'Dish Name',
      'Category',
      'Banaswadi Qty',
      'Banaswadi Revenue (INR)',
      'Banaswadi Avg Price (INR)',
      'Whitefield Qty',
      'Whitefield Revenue (INR)',
      'Whitefield Avg Price (INR)',
      'Total Qty',
      'Total Revenue (INR)',
      'Dominant Outlet',
      'Banaswadi Share %',
      'Whitefield Share %',
    ];

    const rows = groupedData.crossOutletComparison.map((i) => [
      `"${i.cleanName.replace(/"/g, '""')}"`,
      `"${i.category.replace(/"/g, '""')}"`,
      i.banaswadiQty,
      i.banaswadiRevenue,
      i.banaswadiAvgPrice,
      i.whitefieldQty,
      i.whitefieldRevenue,
      i.whitefieldAvgPrice,
      i.totalQty,
      i.totalRevenue,
      i.dominantOutlet.toUpperCase(),
      i.banaswadiSharePct,
      i.whitefieldSharePct,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `MenuMind_Outlet_Grouping_Banaswadi_Whitefield_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported Outlet Grouping CSV breakdown.');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-5 right-5 z-50 p-4 rounded-xl bg-slate-900 text-teal-300 border border-teal-500/40 shadow-2xl text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Banner & Mode Toggle */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-teal-100 text-teal-800 border border-teal-300 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-teal-700" />
                OUTLET GROUPING ACTIVE
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                Item-Wise Sales Mode
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span>Outlet Grouping &amp; Location Separation</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Intelligent multi-location separation between <strong>Banaswadi</strong> and{' '}
              <strong>Whitefield</strong> based on trailing &apos;W&apos; markers in Petpooja sales data.
            </p>
          </div>

          {/* Mode Switcher & Export */}
          <div className="flex items-center gap-2.5">
            {onToggleGroupingMode && (
              <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-300 text-xs font-semibold">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-teal-600 text-white shadow-xs font-bold flex items-center gap-1.5"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Outlet Grouping</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleGroupingMode('dish')}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1.5"
                  title="Switch to standard Dish Grouping and Variant Taxonomy review"
                >
                  <FolderTree className="w-3.5 h-3.5 text-slate-500" />
                  <span>Dish Grouping &amp; Taxonomy</span>
                </button>
              </div>
            )}

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300 transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Trailing 'W' Intelligence Explainer Card */}
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-teal-950 via-slate-900 to-indigo-950 text-white text-xs border border-teal-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-300 shrink-0 border border-teal-500/40">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-teal-300 text-xs block">
                Trailing &apos;W&apos; Detection Intelligence Active
              </span>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Items ending with <code> - W</code>, <code>(W)</code>, <code>[W]</code>, or{' '}
                <code> W</code> have been automatically attributed to <strong>Whitefield</strong> ({groupedData.trailingWCount} items detected). All standard items without &apos;W&apos; belong to <strong>Banaswadi</strong>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-[11px]">
            <span className="px-2 py-1 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/40 font-mono font-bold">
              Whitefield: {formatINR(groupedData.whitefield.totalRevenue)}
            </span>
            <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">
              Banaswadi: {formatINR(groupedData.banaswadi.totalRevenue)}
            </span>
          </div>
        </div>
      </div>

      {/* 3 Executive Metric Cards: Banaswadi vs Whitefield vs Consolidated */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Banaswadi Outlet Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black text-sm border border-amber-500/20">
                B
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                  <span>Banaswadi Outlet</span>
                </h3>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Primary / Flagship Location
                </span>
              </div>
            </div>
            <span className="text-xs font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {groupedData.banaswadi.revenueSharePct}% Share
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Net Sales Revenue</span>
              <span className="text-lg font-black text-slate-900 tracking-tight">
                {formatINR(groupedData.banaswadi.totalRevenue)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Portions Sold</span>
              <span className="text-lg font-black text-slate-900 tracking-tight">
                {formatNumber(groupedData.banaswadi.totalQuantity)} units
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Menu Items Sold</span>
              <span className="text-sm font-bold text-slate-700">
                {groupedData.banaswadi.dishCount} distinct dishes
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Average Realized Price</span>
              <span className="text-sm font-bold text-slate-700">
                {formatINR(groupedData.banaswadi.averageItemPrice)} / portion
              </span>
            </div>
          </div>
        </div>

        {/* Whitefield Outlet Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center font-black text-sm border border-teal-500/20">
                W
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                  <span>Whitefield Outlet</span>
                </h3>
                <span className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider">
                  Trailing &apos;W&apos; Tagged Items
                </span>
              </div>
            </div>
            <span className="text-xs font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
              {groupedData.whitefield.revenueSharePct}% Share
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Net Sales Revenue</span>
              <span className="text-lg font-black text-slate-900 tracking-tight">
                {formatINR(groupedData.whitefield.totalRevenue)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Portions Sold</span>
              <span className="text-lg font-black text-slate-900 tracking-tight">
                {formatNumber(groupedData.whitefield.totalQuantity)} units
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Menu Items Sold</span>
              <span className="text-sm font-bold text-slate-700">
                {groupedData.whitefield.dishCount} distinct dishes
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Average Realized Price</span>
              <span className="text-sm font-bold text-slate-700">
                {formatINR(groupedData.whitefield.averageItemPrice)} / portion
              </span>
            </div>
          </div>
        </div>

        {/* Consolidated Multi-Outlet Summary Card */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-md space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-teal-400" />
              <h3 className="font-extrabold text-sm text-white">Consolidated Performance</h3>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
              2 Outlets Combined
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">Total Revenue</span>
              <span className="text-base font-bold text-teal-300">
                {formatINR(groupedData.totalRevenue)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Total Portions Sold</span>
              <span className="text-base font-bold text-white">
                {formatNumber(groupedData.totalQuantity)} units
              </span>
            </div>
          </div>

          {/* Revenue Split Bar */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-amber-300 font-semibold">
                Banaswadi ({groupedData.banaswadi.revenueSharePct}%)
              </span>
              <span className="text-teal-300 font-semibold">
                Whitefield ({groupedData.whitefield.revenueSharePct}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden flex">
              <div
                className="bg-amber-400 h-full transition-all duration-500"
                style={{ width: `${groupedData.banaswadi.revenueSharePct}%` }}
              ></div>
              <div
                className="bg-teal-400 h-full transition-all duration-500"
                style={{ width: `${groupedData.whitefield.revenueSharePct}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedSubTab('comparison')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              selectedSubTab === 'comparison'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-teal-400" />
            <span>Cross-Outlet Dish Comparison ({groupedData.crossOutletComparison.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSubTab('banaswadi')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              selectedSubTab === 'banaswadi'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>Banaswadi Outlet Catalog ({groupedData.banaswadi.dishCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSubTab('whitefield')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              selectedSubTab === 'whitefield'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-teal-400"></span>
            <span>Whitefield Outlet Catalog ({groupedData.whitefield.dishCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSubTab('audit')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              selectedSubTab === 'audit'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Info className="w-3.5 h-3.5 text-slate-500" />
            <span>Outlet Attribution Rules &amp; Overrides</span>
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search dish or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500 w-48 sm:w-56"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="p-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="p-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
          >
            <option value="revenue">Sort by Revenue</option>
            <option value="quantity">Sort by Volume</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
      </div>

      {/* TAB 1: CROSS-OUTLET DISH COMPARISON */}
      {selectedSubTab === 'comparison' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-0">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-800">
              Comparing {filteredComparison.length} dishes sold across Banaswadi &amp; Whitefield
            </span>
            <span className="text-slate-500 text-[11px]">
              Identical core dishes matched by stripping trailing &apos;W&apos; outlet identifiers
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Core Menu Dish</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right bg-amber-50/60 text-amber-900 border-x border-amber-200/60">
                    Banaswadi Qty
                  </th>
                  <th className="py-3 px-4 text-right bg-amber-50/60 text-amber-900 border-r border-amber-200/60">
                    Banaswadi Rev
                  </th>
                  <th className="py-3 px-4 text-right bg-teal-50/60 text-teal-900 border-r border-teal-200/60">
                    Whitefield Qty (-W)
                  </th>
                  <th className="py-3 px-4 text-right bg-teal-50/60 text-teal-900 border-r border-teal-200/60">
                    Whitefield Rev
                  </th>
                  <th className="py-3 px-4 text-right font-black">Total Revenue</th>
                  <th className="py-3 px-4 text-center">Dominant Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredComparison.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No matching dishes found for the current search/filter.
                    </td>
                  </tr>
                ) : (
                  filteredComparison.map((dish, idx) => (
                    <tr key={dish.cleanName} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-mono">#{idx + 1}</span>
                          <span className="font-bold text-slate-900">{dish.cleanName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                          {dish.category}
                        </span>
                      </td>

                      {/* Banaswadi Stats */}
                      <td className="py-3 px-4 text-right font-mono bg-amber-50/20 border-x border-amber-100 text-slate-800">
                        {dish.banaswadiQty > 0 ? (
                          <span>{dish.banaswadiQty.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-900 bg-amber-50/20 border-r border-amber-100">
                        {dish.banaswadiRevenue > 0 ? (
                          formatINR(dish.banaswadiRevenue)
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Whitefield Stats */}
                      <td className="py-3 px-4 text-right font-mono bg-teal-50/20 border-r border-teal-100 text-slate-800">
                        {dish.whitefieldQty > 0 ? (
                          <span>{dish.whitefieldQty.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-teal-900 bg-teal-50/20 border-r border-teal-100">
                        {dish.whitefieldRevenue > 0 ? (
                          formatINR(dish.whitefieldRevenue)
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Total Revenue */}
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                        {formatINR(dish.totalRevenue)}
                      </td>

                      {/* Dominant Outlet Badge */}
                      <td className="py-3 px-4 text-center">
                        {dish.dominantOutlet === 'banaswadi' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Banaswadi ({dish.banaswadiSharePct}%)
                          </span>
                        )}
                        {dish.dominantOutlet === 'whitefield' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-300">
                            Whitefield ({dish.whitefieldSharePct}%)
                          </span>
                        )}
                        {dish.dominantOutlet === 'equal' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                            Balanced (50-50)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: BANASWADI OUTLET CATALOG */}
      {selectedSubTab === 'banaswadi' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-0">
          <div className="p-4 bg-amber-50/50 border-b border-amber-200/60 flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-amber-950">
              Banaswadi Catalog: {filteredBanaswadi.length} dishes &bull;{' '}
              {formatINR(groupedData.banaswadi.totalRevenue)} total sales
            </span>
            <span className="text-amber-800 text-[11px]">
              Standard Petpooja items without trailing &apos;W&apos;
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Core Item Name</th>
                  <th className="py-3 px-4">Raw POS Title</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Qty Sold</th>
                  <th className="py-3 px-4 text-right">Total Net Sales</th>
                  <th className="py-3 px-4 text-right">Avg Realized Price</th>
                  <th className="py-3 px-4 text-right">Reassign Outlet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBanaswadi.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No Banaswadi items found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredBanaswadi.map((item, idx) => (
                    <tr key={item.rawName} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900">{item.cleanName}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                        {item.rawName}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                        {item.quantity.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-900">
                        {formatINR(item.revenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {formatINR(item.averagePrice)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleReassignOutlet(item.rawName, 'whitefield')}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 transition-colors"
                          title="Move this item to Whitefield outlet"
                        >
                          Move to Whitefield &rarr;
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: WHITEFIELD OUTLET CATALOG */}
      {selectedSubTab === 'whitefield' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-0">
          <div className="p-4 bg-teal-50/50 border-b border-teal-200/60 flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-teal-950">
              Whitefield Catalog: {filteredWhitefield.length} dishes &bull;{' '}
              {formatINR(groupedData.whitefield.totalRevenue)} total sales
            </span>
            <span className="text-teal-800 text-[11px]">
              Detected from trailing &apos;W&apos; marker (e.g. <code> - W</code>) in item descriptions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Core Item Name</th>
                  <th className="py-3 px-4">Raw POS Title (Trailing W)</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Qty Sold</th>
                  <th className="py-3 px-4 text-right">Total Net Sales</th>
                  <th className="py-3 px-4 text-right">Avg Realized Price</th>
                  <th className="py-3 px-4 text-right">Reassign Outlet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWhitefield.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No Whitefield items found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredWhitefield.map((item, idx) => (
                    <tr key={item.rawName} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900">{item.cleanName}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-teal-900">
                        <span>{item.rawName}</span>
                        {item.hasTrailingW && (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-800 font-bold text-[9px]">
                            &apos;W&apos; DETECTED
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                        {item.quantity.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-teal-900">
                        {formatINR(item.revenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {formatINR(item.averagePrice)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleReassignOutlet(item.rawName, 'banaswadi')}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-colors"
                          title="Move this item to Banaswadi outlet"
                        >
                          Move to Banaswadi &rarr;
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT RULES & OVERRIDES */}
      {selectedSubTab === 'audit' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Outlet Grouping Intelligence Rules
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              How the system distinguishes between Banaswadi and Whitefield sales in MenuMind AI.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
                Rule 1: Hyphen &apos;-&apos; Channel Separation
              </span>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                When an item has a hyphen <code>-</code>, the right side is considered the Channel (e.g. <strong>Swiggy</strong>, <strong>Zomato</strong>, <strong>Ownly</strong>). The left side is checked for ending with <strong>W</strong> or <strong>w</strong>:
              </p>
              <div className="p-2.5 rounded-lg bg-teal-50/80 border border-teal-200 text-teal-900 font-mono text-[10px] space-y-1">
                <div>&bull; &ldquo;Chicken Biryani - W - Swiggy&rdquo; &rarr; <strong>Whitefield</strong> (Swiggy)</div>
                <div>&bull; &ldquo;Mutton Chaap - W - Zomato&rdquo; &rarr; <strong>Whitefield</strong> (Zomato)</div>
                <div>&bull; &ldquo;Fish Finger - W - Ownly&rdquo; &rarr; <strong>Whitefield</strong> (Ownly)</div>
                <div>&bull; &ldquo;Egg Roll - Swiggy&rdquo; &rarr; <strong>Banaswadi</strong> (Swiggy)</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                Rule 2: No Hyphen &apos;-&apos; Service Type Check
              </span>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                When an item name has no hyphen <code>-</code>, the system checks order service type:
              </p>
              <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 font-mono text-[10px] space-y-1">
                <div>&bull; &ldquo;Take Away&rdquo; or &ldquo;Delivery&rdquo; &rarr; <strong>Banaswadi Outlet</strong></div>
                <div>&bull; &ldquo;Dine-in&rdquo; &rarr; <strong>Whitefield Outlet</strong></div>
                <div>&bull; Standard without indicators &rarr; Default <strong>Banaswadi</strong></div>
              </div>
            </div>
          </div>

          {/* Active Manual Overrides */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-xs text-slate-900">
                User Manual Outlet Overrides ({Object.keys(manualOverrides).length})
              </span>
              {Object.keys(manualOverrides).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('menumind_outlet_overrides_v1');
                    setManualOverrides({});
                    showToast('Cleared all manual outlet overrides.');
                  }}
                  className="text-[11px] text-rose-600 hover:underline font-semibold"
                >
                  Clear All Overrides
                </button>
              )}
            </div>

            {Object.keys(manualOverrides).length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                No manual overrides active. All items follow automatic trailing &apos;W&apos; pattern matching.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(manualOverrides).map(([rawKey, outVal]) => (
                  <span
                    key={rawKey}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 flex items-center gap-2 text-[11px]"
                  >
                    <span className="font-medium">{rawKey}</span>
                    <span className="text-slate-400">&rarr;</span>
                    <span className="font-bold capitalize text-teal-700">{outVal}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
