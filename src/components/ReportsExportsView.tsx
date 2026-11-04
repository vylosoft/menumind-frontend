import React, { useState } from 'react';
import { ForecastItem, GroupingRule, ParentDish, ReconciliationReport } from '../types/restaurant';
import { exportFullExcelReport, exportGroupingDictionaryJSON, exportSupabaseDDLSQL } from '../utils/exportHelpers';
import { formatINR, formatNumber, formatPercent } from '../utils/formatters';
import { SUPABASE_SCHEMA_SQL } from '../data/supabaseSchemaSql';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FolderTree,
  Calendar,
  Layers,
  FileCheck,
  Database,
  Copy,
  Check,
  Code2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { DishRecipe, FixedOperatingCosts } from '../types/recipe';

interface ReportsExportsViewProps {
  parentDishes: ParentDish[];
  forecasts: ForecastItem[];
  reconciliation: ReconciliationReport;
  groupingRules: GroupingRule[];
  totalRevenue: number;
  totalQuantity: number;
  recipes?: DishRecipe[];
  fixedCosts?: FixedOperatingCosts;
}

export const ReportsExportsView: React.FC<ReportsExportsViewProps> = ({
  parentDishes,
  forecasts,
  reconciliation,
  groupingRules,
  totalRevenue,
  totalQuantity,
  recipes = [],
  fixedCosts,
}) => {
  const [restaurantName, setRestaurantName] = useState('MenuMind Grand Dining');

  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlPreview, setShowSqlPreview] = useState(false);

  const doubleDownDishes = parentDishes.filter((d) => d.actionRecommendation === 'DOUBLE_DOWN');
  const optimizeDishes = parentDishes.filter((d) => d.actionRecommendation === 'OPTIMIZE');
  const removeDishes = parentDishes.filter((d) => d.actionRecommendation === 'CONSIDER_REMOVING');
  const multiVariantDishes = parentDishes.filter((d) => d.variants.length >= 3);

  const handleDownloadExcel = () => {
    exportFullExcelReport(parentDishes, forecasts, reconciliation, restaurantName, recipes, fixedCosts);
  };

  const handleDownloadDictionary = () => {
    exportGroupingDictionaryJSON(groupingRules);
  };

  const handleDownloadSql = () => {
    exportSupabaseDDLSQL(SUPABASE_SCHEMA_SQL);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Export Toolbar Card */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-teal-600" />
            Executive Reports &amp; Data Exports
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Download comprehensive multi-tab Excel workbooks, reusable grouping dictionaries, or print the board-ready executive report.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDownloadExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all"
          >
            <Download className="w-4 h-4" />
            Download Excel Workbook (.xlsx)
          </button>

          <button
            onClick={handleDownloadSql}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all"
          >
            <Database className="w-4 h-4" />
            Download Supabase DDL (.sql)
          </button>

          <button
            onClick={handleDownloadDictionary}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs border border-slate-300 transition-all"
          >
            <FolderTree className="w-4 h-4 text-slate-600" />
            Taxonomy Rules (.json)
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-300 transition-all"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            Print Report
          </button>
        </div>
      </div>

      {/* Supabase Database Architecture & DDL Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 text-white border border-slate-700 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30 mb-2">
              <Database className="w-3.5 h-3.5" />
              Production PostgreSQL &amp; Supabase DDL
            </div>
            <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Relational Database Schema for MenuMind AI
            </h3>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Complete DDL with 15 relational tables, foreign key cascades, compound indexes, automated triggers, Row Level Security (RLS) policies, and analytical views ready to run directly in your Supabase SQL Editor.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopySql}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs transition-all border border-slate-600 cursor-pointer"
            >
              {copiedSql ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300">Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-300" />
                  <span>Copy SQL Script</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadSql}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download .sql
            </button>
          </div>
        </div>

        {/* Schema Highlights Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-2">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-slate-400 font-medium">1. POS &amp; Ingestion</div>
            <div className="font-bold text-emerald-300 mt-0.5">pos_import_batches</div>
            <div className="font-bold text-emerald-300">raw_pos_sales_records</div>
            <div className="text-[10px] text-slate-400 mt-1">Audit log, raw line-items, Petpooja configs</div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-slate-400 font-medium">2. Taxonomy &amp; Rules</div>
            <div className="font-bold text-teal-300 mt-0.5">parent_dishes</div>
            <div className="font-bold text-teal-300">dish_variants, grouping_rules</div>
            <div className="text-[10px] text-slate-400 mt-1">Canonical catalog &amp; variant normalization</div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-slate-400 font-medium">3. Recipes &amp; Unit Economics</div>
            <div className="font-bold text-indigo-300 mt-0.5">ingredients</div>
            <div className="font-bold text-indigo-300">recipes, recipe_ingredients</div>
            <div className="text-[10px] text-slate-400 mt-1">BOM, yields, trim loss &amp; variable costs</div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-slate-400 font-medium">4. Pricing &amp; Risk Control</div>
            <div className="font-bold text-purple-300 mt-0.5">channel_pricing_profiles</div>
            <div className="font-bold text-purple-300">commodity_price_watch</div>
            <div className="text-[10px] text-slate-400 mt-1">Aggregator margins, forecasts &amp; inflation alerts</div>
          </div>
        </div>

        {/* How to deploy step-by-step box */}
        <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white">How to execute at Supabase:</span>
              <p className="text-slate-300 text-[11px] mt-0.5">
                1. Open your Supabase Dashboard &rarr; 2. Click <strong>SQL Editor</strong> in the left navigation &rarr; 3. Click <strong>New query</strong> &rarr; 4. Paste this script and click <strong>Run</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowSqlPreview(!showSqlPreview)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold shrink-0 cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>{showSqlPreview ? 'Hide SQL Code' : 'Inspect SQL Code'}</span>
            {showSqlPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible SQL Script Preview */}
        {showSqlPreview && (
          <div className="mt-3 bg-slate-950 rounded-xl p-4 border border-slate-800 max-h-96 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed space-y-1">
            <pre className="whitespace-pre-wrap select-all font-mono text-[11px] text-emerald-400">
              {SUPABASE_SCHEMA_SQL}
            </pre>
          </div>
        )}
      </div>

      {/* Printable Executive Report Sheet */}
      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-6 print:p-0 print:border-none print:shadow-none">
        {/* Report Header */}
        <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-700">
                Menu Intelligence Executive Brief
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-1">{restaurantName}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Source: Petpooja POS Reports &bull; Reporting Period:{' '}
              <strong>
                {reconciliation.dateRangeStart} to {reconciliation.dateRangeEnd}
              </strong>
            </p>
          </div>

          <div className="text-right text-xs">
            <span className="text-slate-400 block">Generated on</span>
            <span className="font-bold text-slate-700">
              {new Date().toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>

        {/* 1. Executive Summary in Plain English */}
        <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
          <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600" />
            1. Executive Summary &amp; Core Findings
          </h3>
          <p className="text-xs text-slate-700 leading-relaxed">
            During the analyzed 6-month period, your menu generated a total of{' '}
            <strong>{formatINR(totalRevenue)}</strong> across{' '}
            <strong>{formatNumber(totalQuantity)} portions sold</strong>. 
            Revenue shows healthy momentum, with the top 20% of normalized parent dishes driving the
            bulk of cash flow. Four primary operational priorities emerge:
          </p>
          <ul className="text-xs text-slate-600 list-disc list-inside space-y-1 pl-1">
            <li>
              <strong>Double down on high-velocity anchors:</strong> Dishes like{' '}
              <strong className="text-slate-900">{doubleDownDishes.map((d) => d.name).slice(0, 3).join(', ')}</strong>{' '}
              drive over 40% of kitchen throughput and require zero-stockout protection during rush hours.
            </li>
            <li>
              <strong>Harvest hidden margins in rising specialties:</strong> Fast-growing items like{' '}
              <strong className="text-slate-900">Bhetki Paturi</strong> and{' '}
              <strong className="text-slate-900">Gondhoraj Chicken</strong> have expanded order volume by double digits.
            </li>
            <li>
              <strong>Trim redundant sizes &amp; complexity:</strong> Several multi-variant items show heavy cannibalization where the lowest variant contributes under 15% of sales.
            </li>
            <li>
              <strong>Prune persistent exit candidates:</strong> Consistently low-performing items generate minimal revenue while tying up refrigeration prep stations.
            </li>
          </ul>
        </div>

        {/* 2. Where to Double Down */}
        <div className="space-y-3">
          <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            2. Where to Double Down (Priority Investment)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {doubleDownDishes.slice(0, 4).map((d) => (
              <div key={d.id} className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900">{d.name}</span>
                  <span className="font-bold text-teal-700">{formatINR(d.totalRevenue)}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {formatNumber(d.totalQuantity)} portions &bull; {formatPercent(d.revenueShare)} menu share
                </div>
                <p className="text-[11px] text-slate-600 italic">&ldquo;{d.actionAdvice}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Where to Optimize & Reprice */}
        <div className="space-y-3">
          <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            3. Where to Optimize &amp; Review Pricing
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {optimizeDishes.slice(0, 4).map((d) => (
              <div key={d.id} className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900">{d.name}</span>
                  <span className="font-bold text-amber-700">{formatINR(d.totalRevenue)}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {d.l3mVsP3mChange ? `${d.l3mVsP3mChange}% growth` : 'Softening demand'} &bull; Avg price: {formatINR(d.averageRealizedPrice)}
                </div>
                <p className="text-[11px] text-slate-600 italic">&ldquo;{d.actionAdvice}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Where to Reduce Complexity (Variant Simplification) */}
        <div className="space-y-3">
          <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" />
            4. Variant Simplification Candidates
          </h3>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-2">
            <p className="text-slate-600">
              The following parent dishes feature 3 or more size/portion variations. Simplifying to 2 dominant sizes trims kitchen line clutter:
            </p>
            <div className="space-y-1.5">
              {multiVariantDishes.map((d) => (
                <div key={d.id} className="flex items-center justify-between bg-white p-2.5 rounded-md border border-slate-200">
                  <span className="font-bold text-slate-900">{d.name}</span>
                  <span className="text-slate-500">
                    {d.variants.length} sizes: {d.variants.map((v) => `${v.variantName} (${Math.round(v.revenueShare)}%)`).join(', ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 5. What to Prepare Next Month (Inventory Projection) */}
        <div className="space-y-3">
          <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            5. What to Prepare Next Month (30-Day Demand Baseline)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {forecasts.slice(0, 4).map((f) => (
              <div key={f.dishId} className="p-3 rounded-lg border border-slate-200 bg-white">
                <span className="font-bold text-slate-900 block truncate">{f.dishName}</span>
                <span className="text-lg font-extrabold text-teal-700 block mt-1">
                  {formatNumber(f.baseForecastQty)} u
                </span>
                <span className="text-[10px] text-slate-400">
                  Range: {f.conservativeQty} - {f.optimisticQty} u
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
