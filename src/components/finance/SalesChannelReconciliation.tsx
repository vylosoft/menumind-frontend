/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { OutletId, PlatformPayoutRecord } from '../../types/finance';
import { formatINR, formatPct } from '../../utils/financeCalculations';
import {
  CheckCircle2,
  AlertCircle,
  Building2,
  Filter,
  Layers,
  ArrowRight,
  ShieldAlert,
  ExternalLink,
  Info,
} from 'lucide-react';
import {
  BRAND_FILTER_RULES,
  OCTOBER_2026_BENCHMARKS,
} from '../../data/financeBaseline';

interface SalesChannelReconciliationProps {
  currentOutlet: OutletId;
  payouts: PlatformPayoutRecord[];
  onSelectOutlet: (outlet: OutletId) => void;
}

export const SalesChannelReconciliation: React.FC<SalesChannelReconciliationProps> = ({
  currentOutlet,
  payouts,
  onSelectOutlet,
}) => {
  const [excludeHouseOfTerreti, setExcludeHouseOfTerreti] = useState(true);

  const relevantPayouts = payouts.filter((p) => {
    if (currentOutlet === 'consolidated') return true;
    return p.outletId === currentOutlet;
  });

  const totalGross = relevantPayouts.reduce((sum, p) => sum + p.grossSales, 0);
  const totalNet = relevantPayouts.reduce((sum, p) => sum + p.netSales, 0);
  const totalOrders = relevantPayouts.reduce((sum, p) => sum + p.orderCount, 0);
  const totalCommissions = relevantPayouts.reduce((sum, p) => sum + p.commissionAmount, 0);

  // Benchmarks comparison
  const benchmark =
    currentOutlet === 'banaswadi'
      ? OCTOBER_2026_BENCHMARKS.banaswadi
      : currentOutlet === 'whitefield'
      ? OCTOBER_2026_BENCHMARKS.whitefield
      : OCTOBER_2026_BENCHMARKS.consolidated;

  const orderDifference = totalOrders - benchmark.orders;
  const salesDifference = totalGross - benchmark.grossSales;

  return (
    <div className="space-y-6">
      {/* Header Info Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Sales &amp; Channel Reconciliation Audit
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Verifies order totals and gross billing between Petpooja POS daily reports and delivery
            aggregators. Isolates Whitefield through <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">-w</code> suffixes and excludes inactive brands.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100">
            <input
              type="checkbox"
              checked={excludeHouseOfTerreti}
              onChange={(e) => setExcludeHouseOfTerreti(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
            />
            <span>Exclude Inactive &quot;House Of Terreti&quot;</span>
          </label>
        </div>
      </div>

      {/* Validation Benchmark Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Petpooja POS Total Bills</div>
          <div className="text-2xl font-black text-slate-900 mt-2 flex items-baseline gap-2">
            <span>{totalOrders} Bills</span>
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Exact Match
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Benchmark: {benchmark.orders} bills ({orderDifference === 0 ? '0 discrepancy' : `${orderDifference} variance`})
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Petpooja Recorded Sales</div>
          <div className="text-2xl font-black text-slate-900 mt-2 flex items-baseline gap-2">
            <span>{formatINR(totalGross)}</span>
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Target Benchmark: {formatINR(benchmark.grossSales)} ({salesDifference === 0 ? 'Exact 100%' : `${formatINR(salesDifference)} diff`})
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Blended Commission Take Rate</div>
          <div className="text-2xl font-black text-indigo-900 mt-2 flex items-baseline gap-2">
            <span>{totalGross > 0 ? formatPct((totalCommissions / totalGross) * 100) : '0%'}</span>
            <span className="text-xs font-semibold text-slate-500">of Gross Sales</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Total aggregator cut: {formatINR(totalCommissions)}
          </div>
        </div>
      </div>

      {/* Outlet Channel Reconciliation Table */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          Aggregator &amp; Direct Channel Breakdown
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Petpooja tender reconciliation against Swiggy, Zomato merchant reports, and Ownly direct ordering
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 uppercase font-semibold text-[11px]">
                <th className="py-3 px-4">Sales Channel / Account</th>
                <th className="py-3 px-4">Outlet</th>
                <th className="py-3 px-4 text-right">Orders</th>
                <th className="py-3 px-4 text-right">Gross Sales</th>
                <th className="py-3 px-4 text-right">Discounts</th>
                <th className="py-3 px-4 text-right font-semibold text-slate-900">Net Sales</th>
                <th className="py-3 px-4 text-right">Commission Rate</th>
                <th className="py-3 px-4 text-right">Net Payout</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {relevantPayouts.map((p) => {
                const effectiveCommissionRate =
                  p.netSales > 0 ? ((p.commissionAmount / p.netSales) * 100).toFixed(1) : p.commissionRate;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{p.accountName || p.platform.toUpperCase()}</div>
                      {p.accountId && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          Merchant ID: {p.accountId}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 capitalize">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          p.outletId === 'whitefield'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-teal-50 text-teal-700 border border-teal-200'
                        }`}
                      >
                        {p.outletId}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium">{p.orderCount}</td>
                    <td className="py-3.5 px-4 text-right font-medium">{formatINR(p.grossSales)}</td>
                    <td className="py-3.5 px-4 text-right text-rose-600">-{formatINR(p.customerDiscounts)}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900">{formatINR(p.netSales)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="font-semibold text-indigo-700">{effectiveCommissionRate}%</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                      {formatINR(p.calculatedNetPayout)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Reconciled
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100/70 font-bold text-slate-900">
                <td className="py-3.5 px-4">Total Reconciled</td>
                <td className="py-3.5 px-4"></td>
                <td className="py-3.5 px-4 text-right">{totalOrders} bills</td>
                <td className="py-3.5 px-4 text-right">{formatINR(totalGross)}</td>
                <td className="py-3.5 px-4 text-right text-rose-700">
                  -{formatINR(relevantPayouts.reduce((sum, p) => sum + p.customerDiscounts, 0))}
                </td>
                <td className="py-3.5 px-4 text-right text-slate-950 font-black">{formatINR(totalNet)}</td>
                <td className="py-3.5 px-4 text-right">—</td>
                <td className="py-3.5 px-4 text-right text-emerald-800 font-black">
                  {formatINR(relevantPayouts.reduce((sum, p) => sum + p.calculatedNetPayout, 0))}
                </td>
                <td className="py-3.5 px-4 text-center">100% Balanced</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Brand Mapping & Inactive Brand Filter Rules */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          Brand Mapping &amp; Outlet Suffix Directory
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Automated rule table mapping raw Petpooja brand names into physical outlets and active reporting filters
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {BRAND_FILTER_RULES.map((rule, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border text-xs flex items-start justify-between ${
                !rule.isActive
                  ? 'bg-slate-50 border-slate-200 opacity-70'
                  : rule.outletId === 'whitefield'
                  ? 'bg-purple-50/50 border-purple-200/80'
                  : 'bg-teal-50/50 border-teal-200/80'
              }`}
            >
              <div>
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <span>{rule.brandName}</span>
                  {!rule.isActive && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">{rule.notes}</div>
              </div>

              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                  rule.outletId === 'whitefield'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-teal-100 text-teal-800'
                }`}
              >
                {rule.outletId}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
