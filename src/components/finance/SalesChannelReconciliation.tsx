/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { OutletId, PlatformPayoutRecord } from '../../types/finance';
import { RawSalesRecord } from '../../types/restaurant';
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
import { BRAND_FILTER_RULES } from '../../data/financeBaseline';

interface SalesChannelReconciliationProps {
  currentOutlet: OutletId;
  payouts: PlatformPayoutRecord[];
  onSelectOutlet: (outlet: OutletId) => void;
  rawRecords?: RawSalesRecord[];
  selectedMonth?: string;
}

export const SalesChannelReconciliation: React.FC<SalesChannelReconciliationProps> = ({
  currentOutlet,
  payouts,
  onSelectOutlet,
  rawRecords = [],
  selectedMonth,
}) => {
  const [excludeHouseOfTerreti, setExcludeHouseOfTerreti] = useState(true);

  const inMonth = (m?: string) => !selectedMonth || !m || m.slice(0, 7) === selectedMonth;
  const isTerreti = (name?: string) => /house\s*of\s*terreti/i.test(String(name || ''));

  // Platform statements for the selected month and outlet
  const relevantPayouts = payouts.filter((p) => {
    if (!inMonth(p.month)) return false;
    if (excludeHouseOfTerreti && isTerreti(p.accountName)) return false;
    if (currentOutlet === 'consolidated') return true;
    return p.outletId === currentOutlet;
  });

  const totalGross = relevantPayouts.reduce((sum, p) => sum + p.grossSales, 0);
  const totalNet = relevantPayouts.reduce((sum, p) => sum + p.netSales, 0);
  const totalOrders = relevantPayouts.reduce((sum, p) => sum + p.orderCount, 0);
  const totalCommissions = relevantPayouts.reduce((sum, p) => sum + p.commissionAmount, 0);

  // Petpooja POS saved for the selected month and outlet (the figures these cards are named after)
  const posRecords = rawRecords.filter((r) => {
    if (r.isReturnOrCancelled) return false;
    if (!inMonth(r.date)) return false;
    if (excludeHouseOfTerreti && (isTerreti(r.rawItemName) || isTerreti(r.salesChannel))) return false;
    if (currentOutlet === 'consolidated') return true;
    return String(r.outlet || '').toLowerCase() === currentOutlet;
  });
  const posBills = Math.round(posRecords.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0));
  const posNetSales = posRecords.reduce(
    (sum, r) => sum + (Number(r.revenue) || 0) - (r.isNetSales ? 0 : Number(r.discount) || 0),
    0
  );
  const isAggregator = (r: RawSalesRecord) => /swiggy|zomato|ownly/i.test(`${r.salesChannel || ''} ${r.rawItemName || ''}`);
  const posAggregatorBills = Math.round(posRecords.filter(isAggregator).reduce((s2, r) => s2 + (Number(r.quantity) || 0), 0));
  const statementCoverage = posAggregatorBills > 0 ? (totalOrders / posAggregatorBills) * 100 : 0;

  // One row per channel and outlet from Petpooja POS, with the uploaded statement (if any) beside it
  const channelOf = (r: RawSalesRecord) => {
    const t = `${r.salesChannel || ''} ${r.rawItemName || ''}`.toLowerCase();
    return t.includes('swiggy') ? 'swiggy' : t.includes('zomato') ? 'zomato' : t.includes('ownly') ? 'ownly' : 'direct';
  };
  const CHANNEL_LABEL: Record<string, string> = { swiggy: 'SWIGGY', zomato: 'ZOMATO', ownly: 'OWNLY', direct: 'DIRECT / DINE-IN / TAKEAWAY' };
  const outletsInScope = currentOutlet === 'consolidated' ? ['banaswadi', 'whitefield'] : [currentOutlet];
  const channelRows = outletsInScope.flatMap((outlet) =>
    ['swiggy', 'zomato', 'ownly', 'direct'].map((channel) => {
      const recs = posRecords.filter((r) => String(r.outlet || '').toLowerCase() === outlet && channelOf(r) === channel);
      const orders = Math.round(recs.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0));
      const discounts = recs.reduce((sum, r) => sum + (Number(r.discount) || 0), 0);
      const net = recs.reduce((sum, r) => sum + (Number(r.revenue) || 0) - (r.isNetSales ? 0 : Number(r.discount) || 0), 0);
      const gross = net + discounts;
      const stmts = relevantPayouts.filter((p) => p.outletId === outlet && p.platform.toLowerCase() === channel);
      const stmtOrders = stmts.reduce((sum, p) => sum + p.orderCount, 0);
      const stmtNetSales = stmts.reduce((sum, p) => sum + p.netSales, 0);
      const stmtCommission = stmts.reduce((sum, p) => sum + p.commissionAmount, 0);
      const stmtPayout = stmts.reduce((sum, p) => sum + (p.actualBankSettlement || p.calculatedNetPayout), 0);
      const status =
        channel === 'direct'
          ? 'direct'
          : stmts.length === 0
          ? 'missing'
          : orders > 0 && stmtOrders < orders * 0.9
          ? 'partial'
          : 'uploaded';
      return { key: `${outlet}-${channel}`, outlet, channel, orders, gross, discounts, net, stmtOrders, stmtNetSales, stmtCommission, stmtPayout, status };
    })
  ).filter((r) => r.orders > 0 || r.stmtOrders > 0);
  const sum = (k: 'orders' | 'gross' | 'discounts' | 'net' | 'stmtPayout') => channelRows.reduce((a, r) => a + r[k], 0);

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
            <span>{posBills.toLocaleString('en-IN')} Bills</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            {posBills === 0
              ? 'No Petpooja POS upload for this month'
              : `Aggregator bills: ${posAggregatorBills.toLocaleString('en-IN')} · on uploaded statements: ${totalOrders.toLocaleString('en-IN')}`}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Petpooja Recorded Sales</div>
          <div className="text-2xl font-black text-slate-900 mt-2 flex items-baseline gap-2">
            <span>{formatINR(posNetSales)}</span>
            <span className="text-xs font-semibold text-slate-500">net sales</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            {totalOrders === 0
              ? 'No platform statement uploaded for this month'
              : `Statements cover ${formatPct(Math.min(statementCoverage, 100))} of aggregator bills (gross ${formatINR(totalGross)})`}
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
                <th className="py-3 px-4">Sales Channel</th>
                <th className="py-3 px-4">Outlet</th>
                <th className="py-3 px-4 text-right">POS Orders</th>
                <th className="py-3 px-4 text-right">Gross Sales</th>
                <th className="py-3 px-4 text-right">Discounts</th>
                <th className="py-3 px-4 text-right font-semibold text-slate-900">Net Sales</th>
                <th className="py-3 px-4 text-right">Commission Rate</th>
                <th className="py-3 px-4 text-right">Net Payout</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {channelRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-500">
                    No Petpooja POS data or statements for this month.
                  </td>
                </tr>
              )}
              {channelRows.map((r) => (
                <tr key={r.key} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-900">{CHANNEL_LABEL[r.channel]}</td>
                  <td className="py-3.5 px-4 capitalize">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        r.outlet === 'whitefield'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-teal-50 text-teal-700 border border-teal-200'
                      }`}
                    >
                      {r.outlet}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium">{r.orders.toLocaleString('en-IN')}</td>
                  <td className="py-3.5 px-4 text-right font-medium">{formatINR(r.gross)}</td>
                  <td className="py-3.5 px-4 text-right text-rose-600">-{formatINR(r.discounts)}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-900">{formatINR(r.net)}</td>
                  <td className="py-3.5 px-4 text-right">
                    {r.channel === 'direct' ? (
                      <span className="font-semibold text-emerald-700">0%</span>
                    ) : r.stmtNetSales > 0 ? (
                      <span className="font-semibold text-indigo-700">{((r.stmtCommission / r.stmtNetSales) * 100).toFixed(1)}%</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                    {r.channel === 'direct' ? formatINR(r.net) : r.stmtPayout > 0 ? formatINR(r.stmtPayout) : <span className="text-slate-400 font-normal">—</span>}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {r.status === 'direct' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Direct (no commission)
                      </span>
                    ) : r.status === 'uploaded' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Statement Uploaded
                      </span>
                    ) : r.status === 'partial' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200" title="Statements cover only part of this channel's POS orders">
                        Partial: {r.stmtOrders}/{r.orders} orders
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                        Statement Not Uploaded
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100/70 font-bold text-slate-900">
                <td className="py-3.5 px-4">Total</td>
                <td className="py-3.5 px-4"></td>
                <td className="py-3.5 px-4 text-right">{sum('orders').toLocaleString('en-IN')} bills</td>
                <td className="py-3.5 px-4 text-right">{formatINR(sum('gross'))}</td>
                <td className="py-3.5 px-4 text-right text-rose-700">-{formatINR(sum('discounts'))}</td>
                <td className="py-3.5 px-4 text-right text-slate-950 font-black">{formatINR(sum('net'))}</td>
                <td className="py-3.5 px-4 text-right">—</td>
                <td className="py-3.5 px-4 text-right text-emerald-800 font-black">
                  {formatINR(channelRows.reduce((a, r) => a + (r.channel === 'direct' ? r.net : r.stmtPayout), 0))}
                </td>
                <td className="py-3.5 px-4 text-center">{relevantPayouts.length} statement(s)</td>
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
