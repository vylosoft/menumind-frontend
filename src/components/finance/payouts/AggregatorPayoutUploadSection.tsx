/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { appUrl } from '../../../lib/appUrl';
import { payoutsApi } from '../../../lib/ingestionApi';
import {
  PlatformPayoutRecord,
  HyperpureReconciliationReport,
  ChannelPosMatchReport,
  GrowthAnalysisMetrics,
  ChannelAwareBreakEvenMetrics,
  AggregatorBrandOutletMapping,
  OutletId,
} from '../../../types/finance';
import { RawSalesRecord, ParentDish } from '../../../types/restaurant';
import { PurchaseRecord } from '../../../types/purchases';
import { CateringOrder } from '../../../types/catering';
import { StaffMember } from '../../../types/payrollStaff';
import { OutletOperatingExpenseItem } from '../../../types/operatingCosts';
import {
  parseAggregatorPayoutSpreadsheet,
  checkDuplicatePayoutUpload,
  matchPosWithPayouts,
  reconcileHyperpurePurchases,
  calculateGrowthMetrics,
  calculateChannelAwareBreakEven,
} from '../../../utils/payoutManager';
import {
  getSavedAggregatorMappings,
  saveAggregatorMappings,
  resetAggregatorMappingsToDefault,
  mergeWithDefaultMappings,
} from '../../../utils/aggregatorMappingManager';
import { formatINR } from '../../../utils/financeCalculations';
import { PayoutReviewModal } from './PayoutReviewModal';
import { AggregatorMappingTableCard } from './AggregatorMappingTableCard';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Scale,
  ShoppingBag,
  RefreshCw,
  Trash2,
  Database,
  ArrowRight,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Check,
  Edit2,
  X,
} from 'lucide-react';

interface AggregatorPayoutUploadSectionProps {
  payouts: PlatformPayoutRecord[];
  onUpdatePayouts: (updated: PlatformPayoutRecord[]) => void;
  rawRecords?: RawSalesRecord[];
  parentDishes?: ParentDish[];
  purchases?: PurchaseRecord[];
  cateringOrders?: CateringOrder[];
  staffDirectory?: StaffMember[];
  operatingExpenses?: OutletOperatingExpenseItem[];
  onNavigateTab?: (tab: string) => void;
  onOpenSupabaseModal?: () => void;
}

const GrowthValue: React.FC<{ value: number }> = ({ value }) => {
  if (!value) return <span className="font-semibold text-slate-400">—</span>;
  const up = value > 0;
  return (
    <span className={`font-bold flex items-center ${up ? 'text-emerald-700' : 'text-rose-700'}`}>
      {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      {up ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
};

export const AggregatorPayoutUploadSection: React.FC<AggregatorPayoutUploadSectionProps> = ({
  payouts,
  onUpdatePayouts,
  rawRecords = [],
  parentDishes = [],
  purchases = [],
  cateringOrders = [],
  staffDirectory = [],
  operatingExpenses = [],
  onNavigateTab,
  onOpenSupabaseModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedOutlet, setSelectedOutlet] = useState<OutletId>('consolidated');

  // Aggregator Restaurant ID -> Brand & Outlet Mapping Table state
  const [mappings, setMappings] = useState<AggregatorBrandOutletMapping[]>(() =>
    getSavedAggregatorMappings()
  );
  const [mappingSyncStatus, setMappingSyncStatus] = useState<
    'idle' | 'syncing' | 'synced' | 'local_only'
  >('idle');

  // Editable Payout Review Pop-up Modal state
  const [reviewModalState, setReviewModalState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    records: PlatformPayoutRecord[];
    saving: boolean;
    error: string | null;
  }>({
    isOpen: false,
    mode: 'create',
    records: [],
    saving: false,
    error: null,
  });

  // Inline 2-click delete confirmation (no window.confirm)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Months that actually have data (statements or POS sales), newest first
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    payouts.forEach((p) => p.month && set.add(p.month));
    rawRecords.forEach((r) => r.date && set.add(r.date.slice(0, 7)));
    if (set.size === 0) {
      const now = new Date();
      set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
    return Array.from(set).sort().reverse();
  }, [payouts, rawRecords]);

  const [selectedMonth, setSelectedMonth] = useState<string>('');
  useEffect(() => {
    if (!selectedMonth || !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  const monthLabel = (m: string, style: 'long' | 'short' = 'long') => {
    if (!m) return '';
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleString(
      'en-IN',
      style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' }
    );
  };

  const shiftMonth = (m: string, delta: number) => {
    if (!m) return '';
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedPlatform, setSelectedPlatform] = useState<'auto' | 'swiggy' | 'zomato' | 'ownly'>('auto');
  const [selectedPeriodType, setSelectedPeriodType] = useState<'monthly' | 'weekly'>('monthly');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const [channelShiftSim, setChannelShiftSim] = useState<number>(15);

  // Persist mappings to localStorage + Supabase
  const handleSaveMappings = async (updated: AggregatorBrandOutletMapping[]) => {
    setMappings(updated);
    saveAggregatorMappings(updated);
    setMappingSyncStatus('syncing');
    try {
      const res = await fetch(appUrl('/api/supabase/aggregator-mappings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: updated }),
      });
      if (res.ok) {
        setMappingSyncStatus('synced');
      } else {
        setMappingSyncStatus('local_only');
      }
    } catch {
      setMappingSyncStatus('local_only');
    }
  };

  const handleResetMappings = () => {
    const defaults = resetAggregatorMappingsToDefault();
    void handleSaveMappings(defaults);
  };

  // Filter payouts based on selected outlet
  const relevantPayouts = useMemo(() => {
    return payouts.filter((p) => {
      if (selectedOutlet === 'consolidated') return true;
      return p.outletId === selectedOutlet;
    });
  }, [payouts, selectedOutlet]);

  // 1. Channel POS vs Aggregator Payout Reconciliation Matrix:
  // Computed deterministically from POS sales (including undated Sub-Order / Item-Wise exports) + confirmed payouts.
  const localMatchReport: ChannelPosMatchReport = useMemo(() => {
    return matchPosWithPayouts(
      rawRecords,
      relevantPayouts,
      selectedOutlet,
      selectedMonth
    );
  }, [rawRecords, relevantPayouts, selectedOutlet, selectedMonth]);

  const [serverMatchReport, setServerMatchReport] = useState<ChannelPosMatchReport | null>(null);
  const [matchRefreshKey, setMatchRefreshKey] = useState(0);
  const [matchLoading, setMatchLoading] = useState(false);
  const matchCacheRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    matchCacheRef.current.clear();
  }, [payouts, matchRefreshKey]);

  useEffect(() => {
    if (!selectedMonth || rawRecords.length > 0 || relevantPayouts.length > 0) {
      setServerMatchReport(null);
      return;
    }
    let cancelled = false;
    const key = `${selectedMonth}|${selectedOutlet}`;
    const cached = matchCacheRef.current.get(key);
    if (cached) {
      setServerMatchReport(cached);
      return;
    }
    setMatchLoading(true);
    payoutsApi
      .reconciliation(selectedMonth, selectedOutlet)
      .then((report: any) => {
        matchCacheRef.current.set(key, report);
        if (cancelled) return;
        if (report && (report.totalPosGross > 0 || report.totalPayoutGross > 0)) {
          setServerMatchReport(report);
        }
      })
      .catch(() => {
        if (!cancelled) setServerMatchReport(null);
      })
      .finally(() => {
        if (!cancelled) setMatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, selectedOutlet, payouts, rawRecords.length, relevantPayouts.length, matchRefreshKey]);

  const channelMatchReport: ChannelPosMatchReport = useMemo(() => {
    if (rawRecords.length > 0 || relevantPayouts.length > 0) {
      return localMatchReport;
    }
    return serverMatchReport || localMatchReport;
  }, [rawRecords.length, relevantPayouts.length, localMatchReport, serverMatchReport]);

  // 2. Hyperpure Supplier Offset Audit
  const hyperpureReport: HyperpureReconciliationReport = useMemo(() => {
    return reconcileHyperpurePurchases(purchases, payouts, selectedOutlet, selectedMonth);
  }, [purchases, payouts, selectedOutlet, selectedMonth]);

  // 3. MoM & YoY Growth Analytics
  const growthMetrics: GrowthAnalysisMetrics = useMemo(() => {
    return calculateGrowthMetrics(selectedMonth, payouts, parentDishes, selectedOutlet, rawRecords);
  }, [selectedMonth, payouts, parentDishes, selectedOutlet, rawRecords]);

  // 4. Channel-Aware Break-Even Analytics
  const breakEvenMetrics: ChannelAwareBreakEvenMetrics = useMemo(() => {
    const aggregatorNet = channelMatchReport.channelReports
      .filter((c) => c.channel !== 'direct')
      .reduce((s, c) => s + c.posNetSales, 0);
    const foodCostTotal = purchases
      .filter((p) => p.month === selectedMonth && (selectedOutlet === 'consolidated' || p.outletId === selectedOutlet))
      .reduce((s, p) => s + (p.netAmount || p.totalAmount || 0), 0);
    return calculateChannelAwareBreakEven(staffDirectory, operatingExpenses, payouts, selectedOutlet, {
      month: selectedMonth,
      posNetSales: channelMatchReport.totalPosNet,
      posOrders: channelMatchReport.channelReports.reduce((s, c) => s + c.posOrders, 0),
      posAggregatorNetSales: aggregatorNet,
      foodCostTotal,
    });
  }, [staffDirectory, operatingExpenses, payouts, selectedOutlet, selectedMonth, channelMatchReport, purchases]);

  // Statement coverage helpers for the Reconciliation Matrix
  const noStatement = (c: { channel: string; payoutGrossSales: number; payoutOrders: number }) =>
    c.channel !== 'direct' && !(c.payoutGrossSales > 0) && !(c.payoutOrders > 0);
  const noPos = (c: { channel: string; posOrders: number; posGrossSales: number }) =>
    c.channel !== 'direct' && !(c.posOrders > 0) && !(c.posGrossSales > 0);

  // Statement covers clearly fewer orders than POS (e.g. only one restaurant ID uploaded)
  const partialStatement = (c: { channel: string; payoutGrossSales: number; payoutOrders: number; posOrders: number }) =>
    !noStatement(c) && c.channel !== 'direct' && c.posOrders > 0 && c.payoutOrders < c.posOrders * 0.9;

  const reconciledAggregatorRows = channelMatchReport.channelReports.filter(
    (c) => c.channel !== 'direct' && !noStatement(c) && !noPos(c) && !partialStatement(c)
  );
  const coveredVariance = reconciledAggregatorRows.reduce((s, c) => s + c.varianceGross, 0);
  const rowsNetCredited = channelMatchReport.channelReports.reduce((s, c) => s + c.payoutNetCredited, 0);
  const rowsTotalDeductions = channelMatchReport.channelReports.reduce(
    (s, c) => s + (c.payoutTotalDeductions || 0),
    0
  );
  const hasMissingStatementsWherePosExists = channelMatchReport.channelReports.some(
    (c) => c.channel !== 'direct' && c.posGrossSales > 0 && (noStatement(c) || partialStatement(c))
  );

  // Headline Calculations
  const totalDirectSales = useMemo(() => {
    const directChannel = channelMatchReport.channelReports.find((c) => c.channel === 'direct');
    const directPos = directChannel ? directChannel.posNetSales : 0;
    const cateringTotal = cateringOrders
      .filter((o) => selectedOutlet === 'consolidated' || o.outletId === selectedOutlet)
      .filter((o) => !selectedMonth || (o.eventDate || '').startsWith(selectedMonth))
      .reduce((s, o) => s + (o.agreedOrderValue || o.netRecognizedValue || 0), 0);
    return directPos + cateringTotal;
  }, [channelMatchReport, cateringOrders, selectedOutlet, selectedMonth]);

  const netRealizedBankInflow = useMemo(() => {
    return channelMatchReport.totalPayoutNetCredited + totalDirectSales;
  }, [channelMatchReport, totalDirectSales]);

  // Step 1 on File Upload: Parse Excel/CSV -> Reject Duplicates -> Open Editable Segregation Pop-up Screen
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = event.target.files ? Array.from(event.target.files) : [];
    if (files.length === 0) return;

    setUploadLoading(true);
    setUploadError(null);
    setUploadSuccessMessage(null);

    try {
      const parsedDrafts: PlatformPayoutRecord[] = [];
      const duplicateErrors: string[] = [];

      for (const file of files) {
        const parsed = await parseAggregatorPayoutSpreadsheet(file, mappings, {
          preferredPlatform: selectedPlatform,
          preferredPeriodType: selectedPeriodType,
          fallbackMonth: selectedMonth,
        });

        // Intelligent Duplicate File & Semantic Data Rejection
        const dupCheck = checkDuplicatePayoutUpload(
          {
            fileHash: parsed.fileHash,
            fileName: file.name,
            payouts: parsed.payouts,
          },
          [...payouts, ...parsedDrafts]
        );

        if (dupCheck.isDuplicate) {
          duplicateErrors.push(dupCheck.reason || `Duplicate file rejected: "${file.name}".`);
          continue;
        }

        parsedDrafts.push(...parsed.payouts);
      }

      if (duplicateErrors.length > 0) {
        setUploadError(duplicateErrors.join(' | '));
      }

      if (parsedDrafts.length > 0) {
        setReviewModalState({
          isOpen: true,
          mode: 'create',
          records: parsedDrafts,
          saving: false,
          error: null,
        });
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to parse payout spreadsheet. Please verify the file format.');
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Step 2 on Modal Confirmation: Persist confirmed payout breakdown & mappings to Supabase + State
  const handleConfirmPayoutModal = async (
    confirmedRecords: PlatformPayoutRecord[],
    mappingsToUpsert: AggregatorBrandOutletMapping[]
  ) => {
    setReviewModalState((prev) => ({ ...prev, saving: true, error: null }));

    let activeMappings = mappings;
    if (mappingsToUpsert.length > 0) {
      activeMappings = mergeWithDefaultMappings([...mappings, ...mappingsToUpsert]);
      setMappings(activeMappings);
      saveAggregatorMappings(activeMappings);
    }

    try {
      const response = await fetch(appUrl('/api/supabase/payouts/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payouts: confirmedRecords,
          mappings: mappingsToUpsert.length > 0 ? activeMappings : undefined,
          mode: reviewModalState.mode,
        }),
      });

      const result = await response.json().catch(() => ({}));

      // Strict duplicate rejection from Supabase DB
      if (response.status === 409) {
        const msg = result.error || 'Duplicate payout file/data rejected by Supabase.';
        setReviewModalState((prev) => ({ ...prev, saving: false, error: msg }));
        setUploadError(msg);
        return;
      }

      if (response.ok && result.success && Array.isArray(result.allPayouts)) {
        // Merge DB payouts with any local-only payouts cleanly
        const byId = new Map<string, PlatformPayoutRecord>();
        for (const p of result.allPayouts) {
          byId.set(p.id, p);
        }
        for (const p of confirmedRecords) {
          byId.set(p.id, p);
        }
        const mergedList = Array.from(byId.values());
        onUpdatePayouts(mergedList);
        if (confirmedRecords[0]?.month) {
          setSelectedMonth(confirmedRecords[0].month);
        }
        setMatchRefreshKey((k) => k + 1);
        setReviewModalState({
          isOpen: false,
          mode: 'create',
          records: [],
          saving: false,
          error: null,
        });
        const totalGross = confirmedRecords.reduce((s, r) => s + r.grossSales, 0);
        const totalNet = confirmedRecords.reduce((s, r) => s + r.actualBankSettlement, 0);
        setUploadError(null);
        setUploadSuccessMessage(
          `Confirmed & persisted ${confirmedRecords.length} payout statement(s) to Supabase! ` +
            `Gross ${formatINR(totalGross)} → Net Payout ${formatINR(totalNet)}. Reconciliation Matrix updated.`
        );
        return;
      }

      // If Supabase credentials are not active in local preview, update state + localStorage cleanly and notify user
      const updatedMap = new Map<string, PlatformPayoutRecord>();
      payouts.forEach((p) => updatedMap.set(p.id, p));
      confirmedRecords.forEach((p) => updatedMap.set(p.id, p));
      const nextPayouts = Array.from(updatedMap.values());
      onUpdatePayouts(nextPayouts);
      if (confirmedRecords[0]?.month) {
        setSelectedMonth(confirmedRecords[0].month);
      }
      setMatchRefreshKey((k) => k + 1);
      setReviewModalState({
        isOpen: false,
        mode: 'create',
        records: [],
        saving: false,
        error: null,
      });
      setUploadSuccessMessage(
        `Confirmed ${confirmedRecords.length} payout statement(s) & updated POS Reconciliation Matrix ` +
          `(saved locally; connect Supabase DB password in Cloud Sync to push to PostgreSQL: ${result.error || 'DB offline'}).`
      );
    } catch (err: any) {
      const updatedMap = new Map<string, PlatformPayoutRecord>();
      payouts.forEach((p) => updatedMap.set(p.id, p));
      confirmedRecords.forEach((p) => updatedMap.set(p.id, p));
      onUpdatePayouts(Array.from(updatedMap.values()));
      if (confirmedRecords[0]?.month) {
        setSelectedMonth(confirmedRecords[0].month);
      }
      setReviewModalState({
        isOpen: false,
        mode: 'create',
        records: [],
        saving: false,
        error: null,
      });
      setUploadSuccessMessage(
        `Confirmed ${confirmedRecords.length} statement(s) & updated Reconciliation Matrix locally.`
      );
    }
  };

  const handleOpenEditModal = (record: PlatformPayoutRecord) => {
    setReviewModalState({
      isOpen: true,
      mode: 'edit',
      records: [record],
      saving: false,
      error: null,
    });
  };

  const handleExecuteDelete = async (id: string) => {
    const target = payouts.find((p) => p.id === id);
    setPendingDeleteId(null);
    if (!target) return;

    const remaining = payouts.filter((p) => p.id !== id);
    onUpdatePayouts(remaining);

    try {
      await fetch(appUrl(`/api/supabase/payouts/${encodeURIComponent(id)}`), {
        method: 'DELETE',
      });
      if (target.batchId) {
        await payoutsApi.deleteBatch(target.batchId).catch(() => {});
      }
      setUploadSuccessMessage(
        `Removed statement "${target.sourceFileName || target.accountName || target.platform.toUpperCase()}".`
      );
    } catch {
      setUploadSuccessMessage(`Removed statement from local registry.`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Editable Payout Segregation Pop-up Modal */}
      <PayoutReviewModal
        isOpen={reviewModalState.isOpen}
        mode={reviewModalState.mode}
        initialRecords={reviewModalState.records}
        mappings={mappings}
        isSaving={reviewModalState.saving}
        saveError={reviewModalState.error}
        onCancel={() =>
          setReviewModalState({
            isOpen: false,
            mode: 'create',
            records: [],
            saving: false,
            error: null,
          })
        }
        onConfirm={handleConfirmPayoutModal}
      />

      {/* Filters & Outlet Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Outlet Scope:</span>
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            {(['consolidated', 'banaswadi', 'whitefield'] as OutletId[]).map((loc) => (
              <button
                key={loc}
                onClick={() => setSelectedOutlet(loc)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                  selectedOutlet === loc
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {loc === 'consolidated' ? 'Consolidated (All Outlets)' : `${loc} Outlet`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>Audit Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            {matchLoading && <RefreshCw className="w-3.5 h-3.5 text-teal-600 animate-spin" />}
          </div>

          {onOpenSupabaseModal && (
            <button
              onClick={onOpenSupabaseModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors shadow-2xs cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Supabase Cloud Sync</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Headline Executive Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: POS vs Aggregator Match Rate */}
        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>POS vs Payout Match</span>
            {hasMissingStatementsWherePosExists ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                Awaiting Channel Statements
              </span>
            ) : (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  channelMatchReport.overallStatus === 'matched'
                    ? 'bg-emerald-100 text-emerald-800'
                    : channelMatchReport.overallStatus === 'minor_variance'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {channelMatchReport.overallStatus === 'matched'
                  ? 'Reconciled'
                  : channelMatchReport.overallStatus === 'minor_variance'
                  ? 'Minor Variance'
                  : 'Review Discrepancy'}
              </span>
            )}
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 tracking-tight">
            {formatINR(channelMatchReport.totalPayoutGross)}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              POS Aggregator Gross:{' '}
              {formatINR(
                channelMatchReport.aggregatorPosGross ??
                  channelMatchReport.channelReports
                    .filter((c) => c.channel !== 'direct')
                    .reduce((s, c) => s + c.posGrossSales, 0)
              )}
            </span>
            <span className="font-semibold text-slate-700">
              Diff: {formatINR(Math.abs(reconciledAggregatorRows.length > 0 ? coveredVariance : channelMatchReport.overallVariance))}
            </span>
          </div>
        </div>

        {/* Metric 2: Hyperpure Recovery Audit */}
        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Hyperpure Offset Audit</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                hyperpureReport.status === 'matched'
                  ? 'bg-teal-100 text-teal-800'
                  : hyperpureReport.status === 'pending_deduction'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {hyperpureReport.status === 'matched'
                ? '100% Cleared'
                : hyperpureReport.status === 'pending_deduction'
                ? 'Pending Offset'
                : 'Over Deducted'}
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-teal-700 tracking-tight">
            {formatINR(hyperpureReport.totalDeductedAtPayout)}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Invoices Entered: {formatINR(hyperpureReport.totalInvoicedAmount)}</span>
            <span className="font-semibold text-slate-700">
              {hyperpureReport.totalInvoicesCount} bills
            </span>
          </div>
        </div>

        {/* Metric 3: Real Cash Inflow Realized */}
        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Net Bank Payouts Realized</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              Liquid Cash
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-700 tracking-tight">
            {formatINR(netRealizedBankInflow)}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Payouts: {formatINR(channelMatchReport.totalPayoutNetCredited)}</span>
            <span>Direct: {formatINR(totalDirectSales)}</span>
          </div>
        </div>

        {/* Metric 4: Realization Ratio & Break-Even Orders */}
        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Cash Realization Rate</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
              Net / Gross
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-indigo-700 tracking-tight">
            {growthMetrics.directRealizationRatioPct.toFixed(1)}%
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Break-Even Run Rate:</span>
            <span className="font-semibold text-slate-700">
              {breakEvenMetrics.breakEvenOrders > 0 ? `${breakEvenMetrics.breakEvenOrders} orders/mo` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Upload Zone Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Interactive Segregation &amp; Duplicate Guard
            </span>
            <h3 className="text-xl font-black text-white tracking-tight">
              Upload Swiggy, Zomato, or Ownly Payout Statements
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Upload weekly or monthly settlement sheets (`.xlsx`, `.xls`, `.csv`).{' '}
              <strong className="text-amber-300">Swiggy</strong> statements evaluate the{' '}
              <strong className="text-white">&ldquo;Payout Breakup&rdquo;</strong> template combining{' '}
              <strong className="text-amber-200">Swiggy Orders + Toing Orders</strong> as{' '}
              <strong>Swiggy</strong>. <strong className="text-rose-300">Zomato</strong> statements evaluate{' '}
              <code className="text-indigo-200">Sections A → J · Rows 1–32</code>.{' '}
              <strong className="text-indigo-300">Ownly</strong> statements evaluate the{' '}
              <strong className="text-white">12-column Settlement Ledger</strong> (
              <code className="text-emerald-200">RN421127 / RN421125 · Gross · Tax/TDS/TCS · Net Payout · UTR</code>).
              Duplicate files, UTRs &amp; identical statement data are automatically rejected before saving to Supabase.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-300">Platform:</label>
              <select
                value={selectedPlatform}
                onChange={(e) =>
                  setSelectedPlatform(e.target.value as 'auto' | 'swiggy' | 'zomato' | 'ownly')
                }
                className="bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-400"
              >
                <option value="auto">Auto-Detect (by ID / File)</option>
                <option value="swiggy">Swiggy (incl. Toing)</option>
                <option value="zomato">Zomato</option>
                <option value="ownly">Ownly</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-300">Period Frequency:</label>
              <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedPeriodType('monthly')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    selectedPeriodType === 'monthly'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Monthly Payout
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPeriodType('weekly')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    selectedPeriodType === 'weekly'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Weekly Payout
                </button>
              </div>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="aggregator-payout-upload-input"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadLoading}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-xs shadow-lg hover:from-emerald-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {uploadLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Extracting Breakup...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Upload Statement(s)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {uploadError && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-xs text-rose-100 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="text-rose-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {uploadSuccessMessage && (
          <div className="mt-4 p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-xs text-emerald-100 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{uploadSuccessMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setUploadSuccessMessage(null)}
              className="text-emerald-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Aggregator Restaurant ID -> Brand & Outlet Location Mapping Table */}
      <AggregatorMappingTableCard
        mappings={mappings}
        onSaveMappings={handleSaveMappings}
        onResetDefaults={handleResetMappings}
        syncStatus={mappingSyncStatus}
      />

      {/* Channel-by-Channel POS Revenue Matching Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-600" />
              Petpooja POS vs Aggregator Payout Reconciliation Matrix
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Side-by-side comparison of Gross Revenue recorded in Petpooja POS vs Confirmed Aggregator Payout Statements
              across Banaswadi &amp; Whitefield ({selectedOutlet === 'consolidated' ? 'Consolidated' : `${selectedOutlet} Outlet`}).
            </p>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            {selectedMonth ? monthLabel(selectedMonth) : 'All Months'} · {channelMatchReport.channelReports.length} channels
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4">Channel &amp; Mapped Accounts</th>
                <th className="py-3 px-3 text-right">POS Gross Sales</th>
                <th className="py-3 px-3 text-right">POS Orders</th>
                <th className="py-3 px-3 text-right">Payout Gross</th>
                <th className="py-3 px-3 text-right">Payout Orders</th>
                <th className="py-3 px-3 text-right">Total Deductions</th>
                <th className="py-3 px-3 text-right">Net Credited Bank</th>
                <th className="py-3 px-3 text-right">Variance (₹)</th>
                <th className="py-3 px-4 text-center">Reconciliation Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {channelMatchReport.channelReports.map((c) => {
                const missingStmt = noStatement(c);
                const missingPos = noPos(c);
                const partial = partialStatement(c);
                return (
                  <tr key={c.channel} className="hover:bg-slate-50/70 transition-colors align-top">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            c.channel === 'swiggy'
                              ? 'bg-amber-500'
                              : c.channel === 'zomato'
                              ? 'bg-rose-500'
                              : c.channel === 'ownly'
                              ? 'bg-indigo-500'
                              : 'bg-emerald-500'
                          }`}
                        />
                        <span>{c.channelLabel}</span>
                      </div>

                      {/* Segregated Brand + Outlet + Restaurant ID pills */}
                      {c.statementBreakdown && c.statementBreakdown.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1 pl-4">
                          {c.statementBreakdown.map((sb) => (
                            <span
                              key={sb.id}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                                sb.outletId === 'whitefield'
                                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                  : 'bg-teal-50 text-teal-800 border-teal-200'
                              }`}
                            >
                              <span>{sb.brandName}</span>
                              <span>·</span>
                              <span className="capitalize">{sb.outletId}</span>
                              {sb.restaurantId && (
                                <span className="font-mono text-[9px] opacity-80">
                                  [{sb.restaurantId}]
                                </span>
                              )}
                              <span className="font-mono font-bold">
                                {formatINR(sb.grossSales)}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-3 text-right font-mono text-slate-800">
                      {formatINR(c.posGrossSales)}
                    </td>

                    <td className="py-3.5 px-3 text-right text-slate-600">
                      {c.posOrders.toLocaleString('en-IN')}
                    </td>

                    <td className="py-3.5 px-3 text-right font-mono font-semibold text-slate-900">
                      {c.channel === 'direct'
                        ? `${formatINR(c.payoutGrossSales)} (Direct)`
                        : !missingStmt
                        ? formatINR(c.payoutGrossSales)
                        : 'No statement'}
                    </td>

                    <td className="py-3.5 px-3 text-right text-slate-600">
                      {c.payoutOrders.toLocaleString('en-IN')}
                    </td>

                    <td className="py-3.5 px-3 text-right font-mono text-rose-700">
                      {c.channel === 'direct' || missingStmt ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        `-${formatINR(c.payoutTotalDeductions || 0)}`
                      )}
                    </td>

                    <td className="py-3.5 px-3 text-right font-mono font-bold text-emerald-700">
                      {missingStmt ? (
                        <span className="text-slate-400 font-normal">—</span>
                      ) : (
                        formatINR(c.payoutNetCredited)
                      )}
                    </td>

                    <td className="py-3.5 px-3 text-right font-mono font-semibold">
                      {missingStmt || missingPos || partial ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div>
                          <span
                            className={
                              Math.abs(c.varianceGross) <= 500
                                ? 'text-emerald-700'
                                : Math.abs(c.varianceGross) <= 5000
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }
                          >
                            {c.varianceGross >= 0 ? '+' : ''}
                            {formatINR(c.varianceGross)}
                          </span>
                          {c.posGrossSales > 0 && (
                            <span className="block text-[10px] font-normal text-slate-400">
                              ({c.varianceGrossPct >= 0 ? '+' : ''}
                              {c.varianceGrossPct.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {missingStmt && missingPos ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                          No Activity
                        </span>
                      ) : missingStmt ? (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                          title="Upload this channel's settlement statement to reconcile"
                        >
                          Statement Not Uploaded
                        </span>
                      ) : missingPos ? (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200"
                          title="Payout statement saved! Upload Petpooja POS sales report to compare."
                        >
                          Payout Saved · Awaiting POS
                        </span>
                      ) : partial ? (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                          title="Statement covers only some restaurant IDs. Upload the remaining statements to reconcile."
                        >
                          Partial: {c.payoutOrders}/{c.posOrders} orders
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            c.matchStatus === 'matched'
                              ? 'bg-emerald-100 text-emerald-800'
                              : c.matchStatus === 'minor_variance'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {c.matchStatus === 'matched' && <Check className="w-3 h-3" />}
                          {c.matchStatus === 'matched'
                            ? '100% Matched'
                            : c.matchStatus === 'minor_variance'
                            ? 'Minor Variance'
                            : 'Review Discrepancy'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
              <tr>
                <td className="py-3 px-4">Total Realized Revenue</td>
                <td className="py-3 px-3 text-right font-mono">
                  {formatINR(channelMatchReport.totalPosGross)}
                </td>
                <td className="py-3 px-3 text-right">
                  {channelMatchReport.channelReports.reduce((s, c) => s + c.posOrders, 0).toLocaleString('en-IN')}
                </td>
                <td className="py-3 px-3 text-right font-mono">
                  {formatINR(channelMatchReport.channelReports.reduce((s, c) => s + c.payoutGrossSales, 0))}
                </td>
                <td className="py-3 px-3 text-right">
                  {channelMatchReport.channelReports.reduce((s, c) => s + c.payoutOrders, 0).toLocaleString('en-IN')}
                </td>
                <td className="py-3 px-3 text-right font-mono text-rose-700">
                  {rowsTotalDeductions > 0 ? `-${formatINR(rowsTotalDeductions)}` : '—'}
                </td>
                <td className="py-3 px-3 text-right font-mono text-emerald-700">
                  {formatINR(rowsNetCredited)}
                </td>
                <td className="py-3 px-3 text-right font-mono">
                  {reconciledAggregatorRows.length > 0 ? (
                    <span>
                      {coveredVariance >= 0 ? '+' : ''}
                      {formatINR(coveredVariance)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  {hasMissingStatementsWherePosExists ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      Partial Channel Coverage
                    </span>
                  ) : (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        channelMatchReport.overallStatus === 'matched'
                          ? 'bg-emerald-100 text-emerald-800'
                          : channelMatchReport.overallStatus === 'minor_variance'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {channelMatchReport.overallStatus === 'matched'
                        ? 'Reconciled'
                        : channelMatchReport.overallStatus === 'minor_variance'
                        ? 'Minor Variance'
                        : 'Review Discrepancy'}
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Hyperpure Supplier Offset Audit & Growth Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card A: Hyperpure Supplier Offset Audit */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-teal-600" />
              Hyperpure Bills vs Zomato Payout Offset Audit
            </h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                hyperpureReport.status === 'matched'
                  ? 'bg-teal-100 text-teal-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {hyperpureReport.status === 'matched' ? 'Offset Reconciled' : 'Variance Detected'}
            </span>
          </div>

          <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-3.5 text-xs text-teal-900 leading-relaxed">
            <strong>Accounting Protection:</strong> Hyperpure deductions on Zomato settlements clear unpaid grocery liabilities.
            They are offset against Purchase &amp; COGS invoices so they are <strong>never double-counted</strong> in operating expenses.
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div className="text-[10px] text-slate-500 font-medium">Entered Invoices</div>
              <div className="font-bold text-slate-900 mt-0.5">{formatINR(hyperpureReport.totalInvoicedAmount)}</div>
              <div className="text-[10px] text-slate-400">{hyperpureReport.totalInvoicesCount} invoices</div>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div className="text-[10px] text-slate-500 font-medium">Settlement Offset</div>
              <div className="font-bold text-teal-700 mt-0.5">{formatINR(hyperpureReport.totalDeductedAtPayout)}</div>
              <div className="text-[10px] text-teal-600 font-medium">Deducted in Payout</div>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div className="text-[10px] text-slate-500 font-medium">Variance</div>
              <div
                className={`font-bold mt-0.5 ${
                  Math.abs(hyperpureReport.variance) <= 100 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {formatINR(hyperpureReport.variance)}
              </div>
              <div className="text-[10px] text-slate-400">
                {Math.abs(hyperpureReport.variance) <= 100 ? 'Clean match' : 'Action needed'}
              </div>
            </div>
          </div>

          {/* Matched Invoices List */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Matched Purchase &amp; COGS Bills:
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 text-xs">
              {hyperpureReport.matchedBills.map((b) => (
                <div key={b.invoiceNumber} className="pt-1.5 flex items-center justify-between text-slate-700">
                  <div>
                    <span className="font-semibold text-slate-900">{b.invoiceNumber}</span>
                    <span className="text-[10px] text-slate-400 block">{b.description} ({b.date})</span>
                  </div>
                  <span className="font-mono font-bold text-slate-800">{formatINR(b.amount)}</span>
                </div>
              ))}
              {hyperpureReport.matchedBills.length === 0 && (
                <div className="text-slate-400 text-xs py-2 text-center">
                  No Hyperpure supplier bills found in Purchase &amp; COGS. Enter them under Purchase &amp; COGS to enable automatic offset matching.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card B: Growth Analysis (MoM & YoY) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Growth Dynamics: Month-on-Month &amp; Year-on-Year
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                growthMetrics.momRevenueGrowthPct > 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : growthMetrics.momRevenueGrowthPct < 0
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {growthMetrics.momRevenueGrowthPct > 0
                ? 'Expansion'
                : growthMetrics.momRevenueGrowthPct < 0
                ? 'Contraction'
                : 'Needs previous month data'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* MoM Performance */}
            <div className="p-3.5 bg-gradient-to-br from-emerald-50/70 to-teal-50/70 rounded-xl border border-emerald-200/80 space-y-2">
              <div className="flex items-center justify-between font-bold text-emerald-950">
                <span>Month-on-Month (MoM)</span>
                <span className="text-[10px] text-emerald-700">
                  {monthLabel(selectedMonth, 'short')} vs {monthLabel(shiftMonth(selectedMonth, -1), 'short')}
                </span>
              </div>
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Gross Sales:</span>
                  <GrowthValue value={growthMetrics.momRevenueGrowthPct} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Net Bank Payout:</span>
                  <GrowthValue value={growthMetrics.momNetPayoutGrowthPct} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Order Volume:</span>
                  <GrowthValue value={growthMetrics.momOrdersGrowthPct} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Average Order Value:</span>
                  <GrowthValue value={growthMetrics.momAovGrowthPct} />
                </div>
              </div>
            </div>

            {/* YoY Performance */}
            <div className="p-3.5 bg-gradient-to-br from-indigo-50/70 to-blue-50/70 rounded-xl border border-indigo-200/80 space-y-2">
              <div className="flex items-center justify-between font-bold text-indigo-950">
                <span>Year-on-Year (YoY)</span>
                <span className="text-[10px] text-indigo-700">
                  {monthLabel(selectedMonth, 'short')} vs {monthLabel(shiftMonth(selectedMonth, -12), 'short')}
                </span>
              </div>
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Gross Sales:</span>
                  <GrowthValue value={growthMetrics.yoyRevenueGrowthPct} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Net Bank Payout:</span>
                  <GrowthValue value={growthMetrics.yoyNetPayoutGrowthPct} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Order Volume:</span>
                  <GrowthValue value={growthMetrics.yoyOrdersGrowthPct} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Average Order Value:</span>
                  <GrowthValue value={growthMetrics.yoyAovGrowthPct} />
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <span>Direct Realization Ratio:</span>
            <span className="font-mono font-bold text-emerald-700">
              {growthMetrics.directRealizationRatioPct.toFixed(1)}% of every gross ₹100 reaches bank
            </span>
          </div>
        </div>
      </div>

      {/* Break-Even Intelligence & Channel Shift Simulator */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-600" />
              Break-Even Intelligence &amp; Aggregator Take-Rate Impact
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Quantifies how aggregator commissions ({(breakEvenMetrics.aggregatorTakeRatePct || 0).toFixed(1)}% effective take-rate from your statements) increase your required break-even revenue, and models the profit impact of shifting orders to direct channels.
            </p>
          </div>

          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('break-even')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>View Full Break-Even Section</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <span className="text-slate-500 font-medium">Monthly Fixed Obligations</span>
            <div className="text-xl font-black text-slate-900">
              {formatINR(breakEvenMetrics.totalFixedObligations)}
            </div>
            <span className="text-[11px] text-slate-400">Rent, staff payroll &amp; commercial utilities</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <span className="text-slate-500 font-medium">Break-Even Run Rate</span>
            <div className="text-xl font-black text-indigo-700">
              {breakEvenMetrics.breakEvenGrossRevenue > 0 ? formatINR(breakEvenMetrics.breakEvenGrossRevenue) : '—'}
            </div>
            <span className="text-[11px] text-slate-400">
              {breakEvenMetrics.breakEvenGrossRevenue > 0
                ? `Requires ${breakEvenMetrics.breakEvenOrders} orders / month`
                : breakEvenMetrics.totalFixedObligations <= 0
                ? 'Add staff wages & operating expenses'
                : 'Add this month’s purchases (food cost) to calculate'}
            </span>
          </div>

          <div className="p-4 bg-rose-50/70 rounded-xl border border-rose-200 text-xs space-y-1">
            <span className="text-rose-700 font-medium">Aggregator Commission Haircut</span>
            <div className="text-xl font-black text-rose-700">
              {formatINR(breakEvenMetrics.aggregatorCommissionDrain)}
            </div>
            <span className="text-[11px] text-rose-600">
              Platform take-rate {(breakEvenMetrics.aggregatorTakeRatePct || 0).toFixed(1)}% in {monthLabel(selectedMonth)}
            </span>
          </div>
        </div>

        {/* Interactive Channel Shift Simulator */}
        <div className="p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 rounded-2xl border border-emerald-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Channel Shift What-If Simulator (+{channelShiftSim}% Shift to Direct)
              </h4>
              <p className="text-xs text-emerald-800 mt-0.5">
                Shift customer orders from Swiggy/Zomato to direct QR takeaway or Ownly at 0–5% commission.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="range"
                min="5"
                max="30"
                step="5"
                value={channelShiftSim}
                onChange={(e) => setChannelShiftSim(Number(e.target.value))}
                className="w-32 accent-emerald-600 cursor-pointer"
              />
              <span className="text-xs font-bold text-emerald-900 w-10 text-right">
                {channelShiftSim}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div className="bg-white/80 p-3 rounded-xl border border-emerald-200">
              <div className="text-[10px] text-slate-500 font-medium">Monthly Cash Savings</div>
              <div className="text-base font-bold text-emerald-700 mt-0.5">
                +{formatINR(Math.round((breakEvenMetrics.channelShiftSimulation.monthlySavingsINR * channelShiftSim) / 15))} / mo
              </div>
              <div className="text-[10px] text-emerald-600 font-medium">Retained in restaurant bank</div>
            </div>

            <div className="bg-white/80 p-3 rounded-xl border border-emerald-200">
              <div className="text-[10px] text-slate-500 font-medium">Lower Break-Even Volume</div>
              <div className="text-base font-bold text-indigo-700 mt-0.5">
                {breakEvenMetrics.breakEvenOrders > 0
                  ? `-${Math.round((breakEvenMetrics.channelShiftSimulation.reducedBreakEvenOrders * channelShiftSim) / 15)} orders`
                  : '—'}
              </div>
              <div className="text-[10px] text-slate-500">Less pressure to cover overheads</div>
            </div>

            <div className="bg-white/80 p-3 rounded-xl border border-emerald-200">
              <div className="text-[10px] text-slate-500 font-medium">Optimized EBITDA Margin</div>
              {breakEvenMetrics.currentEbitdaMarginPct === null || breakEvenMetrics.currentEbitdaMarginPct === undefined ? (
                <>
                  <div className="text-base font-bold text-slate-400 mt-0.5">—</div>
                  <div className="text-[10px] text-slate-500 font-medium">Needs purchases, wages &amp; expenses</div>
                </>
              ) : (
                <>
                  <div className="text-base font-bold text-emerald-800 mt-0.5">
                    {(
                      breakEvenMetrics.currentEbitdaMarginPct +
                      ((breakEvenMetrics.channelShiftSimulation.newEbitdaMarginPct - breakEvenMetrics.currentEbitdaMarginPct) *
                        channelShiftSim) /
                        15
                    ).toFixed(1)}
                    %
                  </div>
                  <div className="text-[10px] text-emerald-700 font-medium">
                    vs {breakEvenMetrics.currentEbitdaMarginPct.toFixed(1)}% current margin
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Uploaded Payout Statements Registry */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4.5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-slate-600" />
            Confirmed Platform Settlement Statements ({payouts.length})
          </h3>
          <span className="text-xs text-slate-500">
            Click Edit to review or adjust line-item segregation
          </span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {payouts.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              No aggregator payout statements uploaded yet. Choose a Swiggy, Zomato, or Ownly Excel/CSV file above to review its segregation and persist to Supabase.
            </div>
          )}

          {payouts.map((p) => (
            <div
              key={p.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
            >
              <div className="flex items-start sm:items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shrink-0 ${
                    p.platform.toLowerCase() === 'swiggy'
                      ? 'bg-amber-500'
                      : p.platform.toLowerCase() === 'zomato'
                      ? 'bg-rose-500'
                      : 'bg-indigo-600'
                  }`}
                >
                  {p.platform.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                    <span>{p.accountName || p.platform.toUpperCase()}</span>
                    {p.accountId && (
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-800 text-white">
                        ID: {p.accountId}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                        p.outletId === 'whitefield'
                          ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                          : 'bg-teal-50 text-teal-800 border border-teal-200'
                      }`}
                    >
                      {p.outletId} Outlet
                    </span>
                    {p.periodType && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 capitalize">
                        {p.periodType} {p.weekLabel ? `(${p.weekLabel})` : ''}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap mt-1">
                    <span>Month: <strong>{p.month}</strong></span>
                    <span>Orders: <strong>{p.orderCount}</strong></span>
                    <span>Comm: <strong>{formatINR(p.commissionAmount)}</strong></span>
                    <span>GST: <strong>{formatINR(p.gstOnCommission)}</strong></span>
                    {(p.cancellationCharges || 0) > 0 && (
                      <span>Cancel: <strong>{formatINR(p.cancellationCharges)}</strong></span>
                    )}
                    {(p.hyperpureRecovery || 0) > 0 && (
                      <span className="text-teal-700 font-semibold">
                        Hyperpure: {formatINR(p.hyperpureRecovery)}
                      </span>
                    )}
                    {(p.swiggyAssureFee || 0) > 0 && (
                      <span className="text-amber-700 font-semibold">
                        Assure: {formatINR(p.swiggyAssureFee || 0)}
                      </span>
                    )}
                    {p.sourceFileName && (
                      <span className="font-mono text-[10px] text-slate-400">
                        {p.sourceFileName}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 sm:self-center justify-end">
                <div className="text-right">
                  <div className="font-bold text-slate-900 font-mono">
                    {formatINR(p.grossSales)} Gross
                  </div>
                  <div className="text-[11px] font-bold text-emerald-700 font-mono">
                    {formatINR(p.actualBankSettlement || p.calculatedNetPayout)} Net Payout
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenEditModal(p)}
                  className="px-2.5 py-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Edit Segregation"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>

                {pendingDeleteId === p.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleExecuteDelete(p.id)}
                      className="px-2.5 py-1.5 bg-rose-600 text-white rounded-lg font-bold text-[11px] hover:bg-rose-700 cursor-pointer"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(p.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Remove Statement"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};