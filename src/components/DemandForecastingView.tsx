import React, { useState, useMemo } from 'react';
import { ForecastItem, ParentDish, ReconciliationReport } from '../types/restaurant';
import { generateDemandForecasts } from '../utils/forecastingEngine';
import { formatINR, formatNumber } from '../utils/formatters';
import {
  CalendarDays,
  TrendingUp,
  ShieldCheck,
  AlertCircle,
  Layers,
  ArrowRight,
  Info,
  Sliders,
} from 'lucide-react';

interface DemandForecastingViewProps {
  parentDishes: ParentDish[];
  reconciliation: ReconciliationReport;
}

export const DemandForecastingView: React.FC<DemandForecastingViewProps> = ({
  parentDishes,
  reconciliation,
}) => {
  const [forecastHorizon, setForecastHorizon] = useState<7 | 14 | 30 | 60>(30);
  const [selectedScenario, setSelectedScenario] = useState<
    'base' | 'conservative' | 'optimistic' | 'all'
  >('base');
  const [filterReliability, setFilterReliability] = useState<'ALL' | 'High' | 'Moderate' | 'Low'>('ALL');

  // Compute forecasts using transparent statistical methods
  const forecasts = useMemo(() => {
    return generateDemandForecasts(
      parentDishes,
      forecastHorizon,
      reconciliation.detectedGranularity
    );
  }, [parentDishes, forecastHorizon, reconciliation.detectedGranularity]);

  const filteredForecasts = useMemo(() => {
    if (filterReliability === 'ALL') return forecasts;
    return forecasts.filter((f) => f.reliability === filterReliability);
  }, [forecasts, filterReliability]);

  // Aggregate projected demand
  const totalBaseDemand = forecasts.reduce((sum, f) => sum + f.baseForecastQty, 0);
  const totalConservative = forecasts.reduce((sum, f) => sum + f.conservativeQty, 0);
  const totalOptimistic = forecasts.reduce((sum, f) => sum + f.optimisticQty, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-teal-600" />
            <h2 className="text-xl font-bold text-slate-900">
              Inventory &amp; Kitchen Demand Forecasting Engine
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Statistical demand projections based on historical Petpooja sales rates, weighted trend slope,
            and weekly ordering patterns.
          </p>
        </div>

        {/* Horizon Selector */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setForecastHorizon(7)}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              forecastHorizon === 7
                ? 'bg-white text-teal-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Next 7 Days
          </button>
          <button
            onClick={() => setForecastHorizon(14)}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              forecastHorizon === 14
                ? 'bg-white text-teal-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Next 14 Days
          </button>
          <button
            onClick={() => setForecastHorizon(30)}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              forecastHorizon === 30
                ? 'bg-white text-teal-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Next 30 Days
          </button>
          <button
            onClick={() => setForecastHorizon(60)}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              forecastHorizon === 60
                ? 'bg-white text-teal-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Next 60 Days
          </button>
        </div>
      </div>

      {/* Required Disclaimer Banner */}
      <div className="p-4 rounded-xl bg-teal-50/80 border border-teal-200 text-teal-950 text-xs flex items-start gap-3">
        <Info className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold block">
            Statistical Demand Modeling Notice (Predictions &ne; Guarantees)
          </span>
          <span>
            These quantities are calculated via time-weighted moving averages and day-of-week seasonality.
            All estimates represent statistical projections, never guaranteed sales. Use the conservative
            scenario for perishable inventory purchases to prevent food waste, and the optimistic scenario
            for weekend prep readiness.
          </span>
        </div>
      </div>

      {/* Aggregate Horizon Cards (Conservative, Base, Optimistic) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Conservative Scenario */}
        <div
          onClick={() => setSelectedScenario('conservative')}
          className={`bg-white rounded-xl p-4 border cursor-pointer transition-all ${
            selectedScenario === 'conservative'
              ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
              : 'border-slate-200 shadow-xs hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Conservative Scenario</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px]">
              Lower Bound
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-blue-950">
            {formatNumber(totalConservative)} portions
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Recommended for ordering highly perishable ingredients (raw seafood, dairy).
          </p>
        </div>

        {/* Base Case Expected */}
        <div
          onClick={() => setSelectedScenario('base')}
          className={`bg-white rounded-xl p-4 border cursor-pointer transition-all ${
            selectedScenario === 'base'
              ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-sm'
              : 'border-slate-200 shadow-xs hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Base Case (Expected)</span>
            <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px]">
              Statistical Median
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-teal-950">
            {formatNumber(totalBaseDemand)} portions
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Standard prep baseline for average weekly operations and routine scheduling.
          </p>
        </div>

        {/* Optimistic Scenario */}
        <div
          onClick={() => setSelectedScenario('optimistic')}
          className={`bg-white rounded-xl p-4 border cursor-pointer transition-all ${
            selectedScenario === 'optimistic'
              ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-sm'
              : 'border-slate-200 shadow-xs hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Optimistic Scenario</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px]">
              Peak Rush
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-950">
            {formatNumber(totalOptimistic)} portions
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Peak buffer for festival weekends, public holidays, or aggressive delivery promotions.
          </p>
        </div>
      </div>

      {/* Forecast Table by Parent Dish */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-900 text-sm">
              Dish-by-Dish Demand Forecast Table ({forecastHorizon} Days Horizon)
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-semibold">Reliability:</span>
            <select
              value={filterReliability}
              onChange={(e) => setFilterReliability(e.target.value as any)}
              className="p-1.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 font-medium"
            >
              <option value="ALL">All Reliability Tiers</option>
              <option value="High">High Confidence Only</option>
              <option value="Moderate">Moderate Confidence</option>
              <option value="Low">Low / Baseline Only</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Parent Dish</th>
                <th className="py-3 px-3 text-right">Historical Baseline (30d)</th>
                <th className="py-3 px-3 text-right text-blue-900">Conservative</th>
                <th className="py-3 px-3 text-right text-teal-900 font-extrabold">
                  Expected Forecast ({forecastHorizon}d)
                </th>
                <th className="py-3 px-3 text-right text-amber-900">Optimistic (Peak)</th>
                <th className="py-3 px-3 text-center">Trend Slope</th>
                <th className="py-3 px-3 text-center">Method Used</th>
                <th className="py-3 px-4 text-center">Reliability Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredForecasts.map((f) => (
                <tr key={f.dishId} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900">{f.dishName}</td>
                  <td className="py-3 px-3 text-right text-slate-600 font-medium">
                    {formatNumber(f.historicalMonthlyAvg)} u/mo
                  </td>
                  <td className="py-3 px-3 text-right text-blue-800 font-semibold">
                    {formatNumber(f.conservativeQty)}
                  </td>
                  <td className="py-3 px-3 text-right font-extrabold text-teal-700 text-sm">
                    {formatNumber(f.baseForecastQty)}
                  </td>
                  <td className="py-3 px-3 text-right text-amber-800 font-semibold">
                    {formatNumber(f.optimisticQty)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`inline-flex items-center gap-0.5 font-bold ${
                        f.trendSlopePct > 0
                          ? 'text-emerald-700'
                          : f.trendSlopePct < 0
                          ? 'text-rose-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {f.trendSlopePct > 0 ? `+${f.trendSlopePct}%` : `${f.trendSlopePct}%`}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center text-slate-600 font-mono text-[10px]">
                    {f.method}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        f.reliability === 'High'
                          ? 'bg-emerald-100 text-emerald-800'
                          : f.reliability === 'Moderate'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                      title={f.reliabilityReason}
                    >
                      {f.reliability} Reliability
                    </span>
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
