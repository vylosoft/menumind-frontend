import React, { useState } from 'react';
import { ParentDish, ReconciliationReport } from '../types/restaurant';
import { formatINR, formatMonthName, formatNumber, formatPercent } from '../utils/formatters';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertCircle,
  Tag,
  Plus,
  Trash2,
  HelpCircle,
  Info,
} from 'lucide-react';

interface MonthlyTrendsViewProps {
  parentDishes: ParentDish[];
  reconciliation: ReconciliationReport;
}

interface OperationalEvent {
  id: string;
  month: string;
  title: string;
  type: 'PROMOTION' | 'STOCKOUT' | 'CLOSURE' | 'FESTIVAL';
}

export const MonthlyTrendsView: React.FC<MonthlyTrendsViewProps> = ({
  parentDishes,
  reconciliation,
}) => {
  const months = reconciliation.monthsPresent;

  // Operational events log to help restaurateur contextualize sudden spikes/dips
  const [events, setEvents] = useState<OperationalEvent[]>([
    {
      id: 'ev-1',
      month: '2026-10',
      title: 'Durga Puja Festival Surge (High Dine-in & Takeaway volume)',
      type: 'FESTIVAL',
    },
    {
      id: 'ev-2',
      month: '2026-07',
      title: 'Heavy Monsoon Waterlogging (3 Days Partial Service)',
      type: 'CLOSURE',
    },
  ]);

  const [newEventMonth, setNewEventMonth] = useState(months[months.length - 1] || '');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<OperationalEvent['type']>('PROMOTION');
  const [isAddingEvent, setIsAddingEvent] = useState(false);

  const handleAddEvent = () => {
    if (!newEventTitle.trim()) return;
    setEvents((prev) => [
      ...prev,
      {
        id: `ev-${Date.now()}`,
        month: newEventMonth,
        title: newEventTitle.trim(),
        type: newEventType,
      },
    ]);
    setNewEventTitle('');
    setIsAddingEvent(false);
  };

  const removeEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  if (!months || months.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 border border-slate-200 text-center max-w-xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-slate-900 text-sm">No Date Stamps Detected</h3>
        <p className="text-xs text-slate-500">
          The uploaded Petpooja file provides aggregate sales totals only. To prevent fabricated trends,
          monthly progression tables require reports with date stamps (e.g. Daily or Bill-wise reports).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-600" />
            Monthly Comparative Trends &amp; Demand Momentum
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Track month-over-month portion progression, 6-month aggregate stability, and L3M (latest 3 months) vs P3M (preceding 3 months) shift.
          </p>
        </div>

        <button
          onClick={() => setIsAddingEvent(!isAddingEvent)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-300 self-start md:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Log Operational Factor</span>
        </button>
      </div>

      {/* Operational Factors Banner */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-amber-600" />
            Operational &amp; External Factors (Context for Volume Spikes &amp; Dips)
          </span>
          <span className="text-[11px] text-slate-500">
            Helps prevent misinterpreting stockouts or festival surges as baseline demand changes
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-white border border-slate-200 shadow-xs"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  ev.type === 'FESTIVAL'
                    ? 'bg-purple-500'
                    : ev.type === 'CLOSURE'
                    ? 'bg-rose-500'
                    : ev.type === 'STOCKOUT'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
              ></span>
              <span className="font-bold text-slate-900">{formatMonthName(ev.month)}:</span>
              <span className="text-slate-700">{ev.title}</span>
              <button
                onClick={() => removeEvent(ev.id)}
                className="text-slate-400 hover:text-rose-600 ml-1"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        {isAddingEvent && (
          <div className="p-3 bg-white rounded-lg border border-slate-300 flex flex-wrap gap-2 items-center text-xs">
            <select
              value={newEventMonth}
              onChange={(e) => setNewEventMonth(e.target.value)}
              className="p-1.5 border border-slate-300 rounded font-medium text-slate-800"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonthName(m)}
                </option>
              ))}
            </select>

            <select
              value={newEventType}
              onChange={(e) => setNewEventType(e.target.value as any)}
              className="p-1.5 border border-slate-300 rounded font-medium text-slate-800"
            >
              <option value="PROMOTION">Promotional Campaign</option>
              <option value="STOCKOUT">Ingredient Stockout</option>
              <option value="CLOSURE">Closure / Renovation / Weather</option>
              <option value="FESTIVAL">Cultural Festival / Surge</option>
            </select>

            <input
              type="text"
              placeholder="e.g. Swiggy Super Feast 30% discount week"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
              className="p-1.5 border border-slate-300 rounded flex-1 min-w-[200px] text-slate-800"
            />

            <button
              onClick={handleAddEvent}
              className="px-3 py-1.5 bg-teal-600 text-white rounded font-bold hover:bg-teal-500"
            >
              Add Note
            </button>
          </div>
        )}
      </div>

      {/* Monthly Comparative Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 sticky left-0 bg-slate-100 z-10">Parent Dish</th>
                {months.map((m) => (
                  <th key={m} className="py-3 px-3 text-center min-w-[90px]">
                    {formatMonthName(m)}
                  </th>
                ))}
                <th className="py-3 px-3 text-right">6-Month Total</th>
                <th className="py-3 px-3 text-right">P3M Avg</th>
                <th className="py-3 px-3 text-right">L3M Avg</th>
                <th className="py-3 px-3 text-center">L3M vs P3M Momentum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {parentDishes.map((dish) => {
                // Compute P3M and L3M if at least 6 months
                let p3mAvg: number | undefined;
                let l3mAvg: number | undefined;
                if (months.length >= 6) {
                  const p3m = months.slice(0, 3).reduce((s, m) => s + (dish.monthlyData[m]?.qty || 0), 0);
                  const l3m = months.slice(3, 6).reduce((s, m) => s + (dish.monthlyData[m]?.qty || 0), 0);
                  p3mAvg = Math.round(p3m / 3);
                  l3mAvg = Math.round(l3m / 3);
                }

                return (
                  <tr key={dish.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 sticky left-0 bg-white z-10 shadow-xs">
                      {dish.name}
                      <span className="block text-[10px] text-slate-500 font-normal">
                        {dish.category}
                      </span>
                    </td>

                    {months.map((m, idx) => {
                      const curQty = dish.monthlyData[m]?.qty || 0;
                      const prevMonth = idx > 0 ? months[idx - 1] : null;
                      const prevQty = prevMonth ? dish.monthlyData[prevMonth]?.qty : null;

                      let momPct: number | null = null;
                      if (prevQty !== null && prevQty > 0) {
                        momPct = Math.round(((curQty - prevQty) / prevQty) * 100);
                      }

                      return (
                        <td key={m} className="py-3 px-3 text-center">
                          <span className="font-bold text-slate-800 block">
                            {formatNumber(curQty)}
                          </span>
                          {momPct !== null ? (
                            <span
                              className={`text-[10px] font-semibold ${
                                momPct > 0
                                  ? 'text-emerald-700'
                                  : momPct < 0
                                  ? 'text-rose-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {momPct > 0 ? `+${momPct}%` : `${momPct}%`}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">-</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="py-3 px-3 text-right font-extrabold text-slate-900">
                      {formatNumber(dish.totalQuantity)}
                      <span className="block text-[10px] text-slate-500 font-normal">
                        {formatINR(dish.totalRevenue, { compact: true })}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right text-slate-600 font-medium">
                      {p3mAvg !== undefined ? `${p3mAvg} u` : '-'}
                    </td>

                    <td className="py-3 px-3 text-right text-slate-900 font-bold">
                      {l3mAvg !== undefined ? `${l3mAvg} u` : '-'}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {dish.l3mVsP3mChange !== undefined ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            dish.l3mVsP3mChange >= 15
                              ? 'bg-emerald-100 text-emerald-800'
                              : dish.l3mVsP3mChange <= -15
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {dish.l3mVsP3mChange > 0 ? (
                            <TrendingUp className="w-3 h-3 text-emerald-600" />
                          ) : dish.l3mVsP3mChange < 0 ? (
                            <TrendingDown className="w-3 h-3 text-rose-600" />
                          ) : null}
                          {dish.l3mVsP3mChange > 0 ? `+${dish.l3mVsP3mChange}%` : `${dish.l3mVsP3mChange}%`}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Baseline</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
