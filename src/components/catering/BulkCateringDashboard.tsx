import { appUrl } from '../../lib/appUrl';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { CateringOrder } from '../../types/catering';
import { ParentDish, RawSalesRecord } from '../../types/restaurant';
import { DishRecipe } from '../../types/recipe';
import { formatINR, formatPct } from '../../utils/financeCalculations';
import { computeCateringSummary } from '../../utils/cateringCalculations';
import { AddEditCateringModal } from './AddEditCateringModal';
import {
  Plus,
  Calendar,
  DollarSign,
  PieChart,
  Users,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Filter,
  Layers,
  Edit2,
  Trash2,
  Search,
  ArrowUpRight,
  ShieldAlert,
  Clock,
  Sparkles,
  Cloud,
  RefreshCw,
} from 'lucide-react';

interface BulkCateringDashboardProps {
  orders: CateringOrder[];
  onUpdateOrders: (updated: CateringOrder[]) => void;
  parentDishes: ParentDish[];
  recipes: DishRecipe[];
  petpoojaSales?: RawSalesRecord[];
  onNavigateToPnL?: () => void;
  onOpenSupabaseModal?: () => void;
}

export const BulkCateringDashboard: React.FC<BulkCateringDashboardProps> = ({
  orders,
  onUpdateOrders,
  parentDishes,
  recipes,
  petpoojaSales = [],
  onNavigateToPnL,
  onOpenSupabaseModal,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-10');
  const [outletFilter, setOutletFilter] = useState<'all' | 'banaswadi' | 'whitefield'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<CateringOrder | null>(null);
  const [isPullingCloud, setIsPullingCloud] = useState(false);
  const [cloudNotification, setCloudNotification] = useState<string | null>(null);

  const handlePullFromCloud = async () => {
    setIsPullingCloud(true);
    setCloudNotification(null);
    try {
      const res = await fetch(appUrl('/api/supabase/pull'));
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data?.cateringOrders) && json.data.cateringOrders.length > 0) {
          onUpdateOrders(json.data.cateringOrders);
          setCloudNotification(`Loaded ${json.data.cateringOrders.length} catering order(s) from Supabase!`);
          setTimeout(() => setCloudNotification(null), 4000);
        } else {
          setCloudNotification('No catering orders found in Supabase.');
          setTimeout(() => setCloudNotification(null), 4000);
        }
      } else {
        setCloudNotification('Failed to pull orders from Supabase.');
        setTimeout(() => setCloudNotification(null), 4000);
      }
    } catch (e: any) {
      console.error('Error pulling catering from Supabase:', e);
      setCloudNotification('Error connecting to Supabase.');
      setTimeout(() => setCloudNotification(null), 4000);
    } finally {
      setIsPullingCloud(false);
    }
  };

  // Compute summary metrics
  const summary = useMemo(() => {
    return computeCateringSummary(orders, selectedMonth, outletFilter === 'all' ? 'consolidated' : outletFilter);
  }, [orders, selectedMonth, outletFilter]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (outletFilter !== 'all' && o.outletId !== outletFilter) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && o.eventCategory !== categoryFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = o.eventName.toLowerCase().includes(term);
        const matchesCust = o.customerName?.toLowerCase().includes(term);
        const matchesCat = o.eventCategory.toLowerCase().includes(term);
        const matchesId = o.id.toLowerCase().includes(term);
        if (!matchesName && !matchesCust && !matchesCat && !matchesId) return false;
      }
      return true;
    });
  }, [orders, outletFilter, statusFilter, categoryFilter, searchTerm]);

  // Upcoming confirmed events (unfulfilled future orders)
  const upcomingEvents = useMemo(() => {
    return orders.filter(
      (o) => (o.status === 'confirmed' || o.status === 'advance_received' || o.status === 'preparing')
    );
  }, [orders]);

  // Event category revenue breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    orders
      .filter((o) => (o.status === 'completed' || o.status === 'fully_paid') && !o.duplicateConfirmed)
      .forEach((o) => {
        map[o.eventCategory] = (map[o.eventCategory] || 0) + o.netRecognizedValue;
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const handleSaveOrder = (newOrUpdatedOrder: CateringOrder) => {
    const exists = orders.some((o) => o.id === newOrUpdatedOrder.id);
    let updated: CateringOrder[];
    if (exists) {
      updated = orders.map((o) => (o.id === newOrUpdatedOrder.id ? newOrUpdatedOrder : o));
    } else {
      updated = [newOrUpdatedOrder, ...orders];
    }
    onUpdateOrders(updated);
  };

  const handleDeleteOrder = (orderId: string) => {
    if (confirm('Are you sure you want to remove this catering order record?')) {
      onUpdateOrders(orders.filter((o) => o.id !== orderId));
    }
  };

  const handleToggleDuplicate = (orderId: string) => {
    const updated = orders.map((o) => {
      if (o.id === orderId) {
        const nextDuplicate = !o.duplicateConfirmed;
        return {
          ...o,
          duplicateConfirmed: nextDuplicate,
          isRevenueRecognized: !nextDuplicate && (o.status === 'completed' || o.status === 'fully_paid'),
        };
      }
      return o;
    });
    onUpdateOrders(updated);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner Notice */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Module A &bull; Bulk Catering Intelligence
            </span>
            <span className="text-xs text-slate-300 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" /> Direct Sales Subchannel
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
            Bulk Catering &amp; Event Order Management
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Record, price, and track direct bulk orders (Durga Puja, Kali Puja, Griha Pravesh, Corporate Galas).
            Accurately separates customer advance liabilities from recognized event revenue and feeds the outlet P&amp;L without modifying Petpooja POS files.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <button
            onClick={handlePullFromCloud}
            disabled={isPullingCloud}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            title="Fetch latest catering orders directly from Supabase database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPullingCloud ? 'animate-spin' : ''}`} />
            <span>{isPullingCloud ? 'Pulling...' : 'Pull Supabase'}</span>
          </button>

          {onOpenSupabaseModal && (
            <button
              onClick={onOpenSupabaseModal}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm cursor-pointer"
              title="Sync Catering Orders with Supabase cloud"
            >
              <Cloud className="w-3.5 h-3.5 text-emerald-200" />
              <span>Supabase Cloud Sync</span>
            </button>
          )}

          <button
            onClick={() => {
              setOrderToEdit(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-600 text-slate-950 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Catering Order</span>
          </button>
        </div>
      </div>

      {/* Cloud Notification Banner */}
      {cloudNotification && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-teal-50 border border-teal-200 text-teal-900 rounded-xl text-xs font-semibold shadow-xs animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{cloudNotification}</span>
        </div>
      )}

      {/* Headline KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
            <span>Recognized Catering Revenue</span>
            <span className="p-1 rounded-lg bg-teal-50 text-teal-700">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatINR(summary.totalRecognizedRevenue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
            <span>Completed: {summary.completedOrders} events</span>
            <span className="font-semibold text-emerald-600">{outletFilter.toUpperCase()}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
            <span>Catering Contribution Margin</span>
            <span className="p-1 rounded-lg bg-emerald-50 text-emerald-700">
              <PieChart className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-2 flex items-baseline gap-2">
            <span>{formatINR(summary.totalCateringContribution)}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              {formatPct(summary.cateringContributionPct)}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Direct Costs: {formatINR(summary.totalDirectExpenses)} (BOM + Delivery)
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
            <span>Customer Advance Liabilities</span>
            <span className="p-1 rounded-lg bg-amber-50 text-amber-700">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-amber-700 mt-2">
            {formatINR(summary.totalAdvanceLiabilities)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Deposits held for upcoming events (Deferred Revenue)
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
            <span>Outstanding Receivables</span>
            <span className="p-1 rounded-lg bg-rose-50 text-rose-700">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-rose-700 mt-2">
            {formatINR(summary.totalOutstandingReceivables)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            Remaining balances pending customer settlement
          </div>
        </div>
      </div>

      {/* Outlet Segregation & Direct Sales Subchannel Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Outlet Share Breakdown */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center justify-between">
            <span>Catering by Kitchen Outlet</span>
            <span className="text-xs font-normal text-slate-500">October 2026</span>
          </h3>

          <div className="space-y-3">
            <div className="p-3.5 bg-teal-50/60 border border-teal-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-teal-950 block">Banaswadi Kitchen</span>
                <span className="text-[11px] text-teal-700">Durga Puja &amp; Griha Pravesh</span>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-teal-900">
                  {formatINR(summary.banaswadiRevenue)}
                </span>
                <span className="text-[10px] text-teal-700 block">
                  {summary.totalRecognizedRevenue > 0
                    ? formatPct((summary.banaswadiRevenue / summary.totalRecognizedRevenue) * 100)
                    : '0%'}
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-purple-50/60 border border-purple-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-purple-950 block">Whitefield Kitchen (-w)</span>
                <span className="text-[11px] text-purple-700">Tech Park Galas &amp; Weddings</span>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-purple-900">
                  {formatINR(summary.whitefieldRevenue)}
                </span>
                <span className="text-[10px] text-purple-700 block">
                  {summary.totalRecognizedRevenue > 0
                    ? formatPct((summary.whitefieldRevenue / summary.totalRecognizedRevenue) * 100)
                    : '0%'}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Direct Revenue Channel:</span>
            <span className="font-bold text-slate-900">Direct Sales &rarr; Bulk Catering</span>
          </div>
        </div>

        {/* Event Occasions Breakdown */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900">Revenue by Event Occasion</h3>
          <div className="space-y-2.5">
            {categoryBreakdown.map(([cat, rev]) => {
              const pct = summary.totalRecognizedRevenue > 0 ? (rev / summary.totalRecognizedRevenue) * 100 : 0;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-800">{cat}</span>
                    <span className="text-slate-900">{formatINR(rev)} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Confirmed Events List */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5 mb-2">
              <Calendar className="w-4 h-4 text-amber-500" /> Upcoming Confirmed Bookings
            </h3>
            <div className="space-y-2 text-xs">
              {upcomingEvents.length === 0 ? (
                <div className="text-slate-400 italic py-4 text-center">No upcoming events queued.</div>
              ) : (
                upcomingEvents.map((evt) => (
                  <div key={evt.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between font-bold text-slate-900">
                      <span>{evt.eventName}</span>
                      <span className="text-amber-700">{formatINR(evt.agreedOrderValue)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Date: {evt.eventDate} ({evt.guestCount} guests)</span>
                      <span className="capitalize px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[10px]">
                        Advance: {formatINR(evt.advanceAmountCollected)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500">
            <strong>Accounting Rule:</strong> Future confirmed bookings do not increase current month revenue.
            Advances are kept in liabilities until food service is completed.
          </div>
        </div>
      </div>

      {/* Main Filter & Order List Table */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Catering Order Registry &amp; Ledger</h3>
            <p className="text-xs text-slate-500">
              Complete log of corporate, community and festival orders with invoice and tax review flags
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search event, customer, ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-teal-500"
              />
            </div>

            {/* Outlet Filter */}
            <select
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50"
            >
              <option value="all">All Outlets</option>
              <option value="banaswadi">Banaswadi Kitchen</option>
              <option value="whitefield">Whitefield Kitchen (-w)</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="confirmed">Confirmed</option>
              <option value="advance_received">Advance Received</option>
              <option value="fully_paid">Fully Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 uppercase font-semibold text-[11px]">
                <th className="py-3 px-3">Order ID &amp; Event</th>
                <th className="py-3 px-3">Outlet</th>
                <th className="py-3 px-3">Event Date</th>
                <th className="py-3 px-3 text-right">Guests</th>
                <th className="py-3 px-3 text-right">Agreed Value</th>
                <th className="py-3 px-3 text-right">Advance Held</th>
                <th className="py-3 px-3 text-right font-black text-slate-900">Recognized Rev</th>
                <th className="py-3 px-3 text-right">Direct Costs</th>
                <th className="py-3 px-3 text-right font-bold text-emerald-700">Contribution</th>
                <th className="py-3 px-3 text-center">POS Status</th>
                <th className="py-3 px-3 text-center">Tax Review</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-400">
                    <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No catering or event orders logged yet.</p>
                    <p className="text-xs text-slate-400 mt-1">Click &ldquo;+ Add Catering Order&rdquo; to record your first corporate or festival booking.</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{o.eventName}</span>
                      {o.duplicateConfirmed && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold uppercase">
                          POS Duplicate
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {o.id} &bull; {o.eventCategory}
                    </div>
                    {o.customerName && (
                      <div className="text-[10px] text-slate-400 italic">{o.customerName}</div>
                    )}
                  </td>
                  <td className="py-3 px-3 capitalize">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        o.outletId === 'whitefield'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-teal-100 text-teal-800'
                      }`}
                    >
                      {o.outletId}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-800">{o.eventDate}</td>
                  <td className="py-3 px-3 text-right">{o.guestCount} pax</td>
                  <td className="py-3 px-3 text-right font-semibold text-slate-800">
                    {formatINR(o.agreedOrderValue)}
                  </td>
                  <td className="py-3 px-3 text-right text-amber-700 font-medium">
                    {formatINR(o.advanceAmountCollected)}
                  </td>
                  <td className="py-3 px-3 text-right font-black text-slate-950">
                    {o.isRevenueRecognized ? (
                      formatINR(o.netRecognizedValue)
                    ) : (
                      <span className="text-slate-400 font-normal italic">Deferred / Not Recog</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-600">
                    {formatINR(o.expenses?.totalDirectVariableCost || 0)}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-700">
                    {o.isRevenueRecognized ? (
                      formatINR(o.cateringContribution)
                    ) : (
                      <span className="text-slate-400 font-normal">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        o.posInvoiceStatus === 'generated_in_petpooja'
                          ? 'bg-amber-100 text-amber-800'
                          : o.posInvoiceStatus === 'external_invoice_issued'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {o.posInvoiceStatus === 'generated_in_petpooja'
                        ? 'In Petpooja'
                        : o.posInvoiceStatus === 'external_invoice_issued'
                        ? 'GST Invoiced'
                        : 'Manual Direct'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        o.taxReviewStatus === 'Reviewed & Confirmed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {o.taxReviewStatus}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setOrderToEdit(o);
                          setIsModalOpen(true);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-slate-800"
                        title="Edit order details"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleDuplicate(o.id)}
                        className={`p-1 rounded ${
                          o.duplicateConfirmed
                            ? 'text-amber-600 hover:text-amber-800'
                            : 'text-slate-400 hover:text-amber-600'
                        }`}
                        title={
                          o.duplicateConfirmed
                            ? 'Marked as Duplicate (Excluded from Revenue)'
                            : 'Toggle Duplicate status'
                        }
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteOrder(o.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600"
                        title="Delete order"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100/70 font-bold text-slate-900">
                <td className="py-3 px-3">Total Filtered ({filteredOrders.length} Bookings)</td>
                <td className="py-3 px-3"></td>
                <td className="py-3 px-3"></td>
                <td className="py-3 px-3 text-right">
                  {filteredOrders.reduce((sum, o) => sum + o.guestCount, 0)} pax
                </td>
                <td className="py-3 px-3 text-right">
                  {formatINR(filteredOrders.reduce((sum, o) => sum + o.agreedOrderValue, 0))}
                </td>
                <td className="py-3 px-3 text-right text-amber-800 font-bold">
                  {formatINR(filteredOrders.reduce((sum, o) => sum + o.advanceAmountCollected, 0))}
                </td>
                <td className="py-3 px-3 text-right font-black text-slate-950">
                  {formatINR(
                    filteredOrders
                      .filter((o) => o.isRevenueRecognized)
                      .reduce((sum, o) => sum + o.netRecognizedValue, 0)
                  )}
                </td>
                <td className="py-3 px-3 text-right">
                  {formatINR(
                    filteredOrders
                      .filter((o) => o.isRevenueRecognized)
                      .reduce((sum, o) => sum + (o.expenses?.totalDirectVariableCost || 0), 0)
                  )}
                </td>
                <td className="py-3 px-3 text-right text-emerald-800 font-black">
                  {formatINR(
                    filteredOrders
                      .filter((o) => o.isRevenueRecognized)
                      .reduce((sum, o) => sum + o.cateringContribution, 0)
                  )}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Add / Edit Catering Modal */}
      <AddEditCateringModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        orderToEdit={orderToEdit}
        parentDishes={parentDishes}
        recipes={recipes}
        onSave={handleSaveOrder}
      />
    </div>
  );
};
