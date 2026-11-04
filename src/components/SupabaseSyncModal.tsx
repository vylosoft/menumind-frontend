import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  Server,
  Layers,
  X,
  ShieldCheck,
  Check,
  Copy,
  ExternalLink,
  Download,
  FileCode,
  Terminal,
  Users,
  UtensilsCrossed,
  ShoppingBag,
  Building2,
  BookOpen,
} from 'lucide-react';
import { ParentDish, GroupingRule, ReconciliationReport } from '../types/restaurant';
import { DishRecipe, FixedOperatingCosts } from '../types/recipe';
import { OutletOperatingExpenseItem } from '../types/operatingCosts';
import { StaffMember } from '../types/payrollStaff';
import { CateringOrder } from '../types/catering';
import { PurchaseRecord, InventorySnapshot } from '../types/purchases';
import { PlatformPayoutRecord } from '../types/finance';

interface SupabaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantName: string;
  parentDishes: ParentDish[];
  recipes?: DishRecipe[];
  fixedCosts?: FixedOperatingCosts;
  groupingRules?: GroupingRule[];
  reconciliation?: ReconciliationReport;
  operatingExpenses?: OutletOperatingExpenseItem[];
  staffDirectory?: StaffMember[];
  cateringOrders?: CateringOrder[];
  purchases?: PurchaseRecord[];
  inventorySnapshots?: InventorySnapshot[];
  payouts?: PlatformPayoutRecord[];
  rawRecords?: any[];
  payrollSnapshots?: any[];
  onDataLoadedFromCloud?: (cloudData: any) => void;
}

export interface SupabaseStatusData {
  connected: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  latencyMs: number;
  serverVersion?: string;
  tablesCount: number;
  tables: Array<{ name: string; rows: number }>;
  error?: string;
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({
  isOpen,
  onClose,
  restaurantName,
  parentDishes,
  recipes = [],
  fixedCosts,
  groupingRules = [],
  reconciliation,
  operatingExpenses = [],
  staffDirectory = [],
  cateringOrders = [],
  purchases = [],
  inventorySnapshots = [],
  payouts = [],
  rawRecords = [],
  payrollSnapshots = [],
  onDataLoadedFromCloud,
}) => {
  const [activeTab, setActiveTab] = useState<'sync' | 'additional_ddl' | 'full_ddl'>('sync');
  const [status, setStatus] = useState<SupabaseStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    summary?: Record<string, number>;
  } | null>(null);
  const [copiedString, setCopiedString] = useState(false);
  const [copiedDdl, setCopiedDdl] = useState(false);
  const [ddlText, setDdlText] = useState<string>('');
  const [loadingDdl, setLoadingDdl] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/supabase/status');
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      setStatus({
        connected: false,
        host: 'aws-0-eu-west-1.pooler.supabase.com',
        port: 5432,
        database: 'postgres',
        user: 'postgres.ognarhapvjisjespxdlc',
        latencyMs: 0,
        tablesCount: 0,
        tables: [],
        error: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDdl = async (type: 'additional_ddl' | 'full_ddl') => {
    setLoadingDdl(true);
    try {
      const endpoint = type === 'additional_ddl' ? '/api/supabase/additional-ddl' : '/api/supabase/ddl';
      const res = await fetch(endpoint);
      const text = await res.text();
      setDdlText(text);
    } catch (e: any) {
      setDdlText(`-- Error loading DDL file: ${e.message}`);
    } finally {
      setLoadingDdl(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setSyncResult(null);
      if (activeTab !== 'sync') {
        fetchDdl(activeTab);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab !== 'sync') {
      fetchDdl(activeTab);
    }
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  // Push all modules to Supabase tables
  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/supabase/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantName,
          parentDishes,
          recipes,
          fixedCosts,
          groupingRules,
          reconciliation,
          operatingExpenses,
          staffDirectory,
          cateringOrders,
          purchases,
          inventorySnapshots,
          payouts,
          rawRecords,
          payrollSnapshots,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncResult({
          success: true,
          message: data.message || 'All modules successfully pushed to Supabase tables!',
          summary: data.summary,
        });
        fetchStatus();
      } else {
        setSyncResult({
          success: false,
          message: data.error || 'Failed to sync data to Supabase',
        });
      }
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: err.message || 'Network error while syncing',
      });
    } finally {
      setSyncing(false);
    }
  };

  // Pull all modules from Supabase tables into local state
  const handlePull = async () => {
    setPulling(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/supabase/pull');
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        if (onDataLoadedFromCloud) {
          onDataLoadedFromCloud(data.data);
        }
        setSyncResult({
          success: true,
          message: 'Successfully pulled latest records from Supabase and updated local state!',
        });
        fetchStatus();
      } else {
        setSyncResult({
          success: false,
          message: data.error || 'No records returned from Supabase',
        });
      }
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: err.message || 'Error pulling data from Supabase',
      });
    } finally {
      setPulling(false);
    }
  };

  const connectionUri = `postgresql://postgres.ognarhapvjisjespxdlc:Riju@389022@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;

  const copyConnectionUri = () => {
    navigator.clipboard.writeText(connectionUri);
    setCopiedString(true);
    setTimeout(() => setCopiedString(false), 2000);
  };

  const copyDdlToClipboard = () => {
    if (!ddlText) return;
    navigator.clipboard.writeText(ddlText);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2500);
  };

  const downloadDdlFile = () => {
    if (!ddlText) return;
    const blob = new Blob([ddlText], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      activeTab === 'additional_ddl' ? 'menumind_additional_modules.sql' : 'menumind_complete_schema.sql'
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Supabase PostgreSQL Database
                {status?.connected && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Live Connected ({status.tablesCount} Tables)
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                MenuMind AI backend connection to your Supabase project (ognarhapvjisjespxdlc)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 pt-3 bg-slate-100 border-b border-slate-200 gap-2">
          <button
            onClick={() => setActiveTab('sync')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all cursor-pointer ${
              activeTab === 'sync'
                ? 'bg-white text-slate-900 border-t border-x border-slate-200 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <UploadCloud className="w-3.5 h-3.5 text-teal-600" />
              Live Sync &amp; Cloud Tables
            </span>
          </button>

          <button
            onClick={() => setActiveTab('additional_ddl')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all cursor-pointer ${
              activeTab === 'additional_ddl'
                ? 'bg-white text-slate-900 border-t border-x border-slate-200 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-emerald-600" />
              Additional Modules DDL (SQL)
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800">
                Created
              </span>
            </span>
          </button>

          <button
            onClick={() => setActiveTab('full_ddl')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all cursor-pointer ${
              activeTab === 'full_ddl'
                ? 'bg-white text-slate-900 border-t border-x border-slate-200 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-indigo-600" />
              Complete Master Schema (20+ Tables)
            </span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {activeTab === 'sync' ? (
            <>
              {/* Connection Parameters Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                    <Server className="w-4 h-4 text-slate-500" />
                    Connection Parameters
                  </div>
                  <button
                    onClick={fetchStatus}
                    disabled={loading}
                    className="flex items-center gap-1 text-xs text-teal-700 hover:text-teal-800 font-semibold cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Ping Supabase</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-medium">Pooler Host (IPv4/6)</div>
                    <div className="font-mono text-slate-800 font-semibold truncate" title={status?.host || 'aws-0-eu-west-1.pooler.supabase.com'}>
                      aws-0-eu-west-1
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-medium">Port / Database</div>
                    <div className="font-mono text-slate-800 font-semibold">5432 / postgres</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-medium">Postgres User</div>
                    <div className="font-mono text-slate-800 font-semibold truncate" title="postgres.ognarhapvjisjespxdlc">
                      postgres.ognar...
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-medium">Roundtrip Latency</div>
                    <div className="font-semibold text-emerald-700">
                      {status?.latencyMs ? `${status.latencyMs} ms` : 'Testing...'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                  <span className="text-slate-600 truncate max-w-md font-mono text-[10px]">
                    postgresql://postgres.ognarhapvjisjespxdlc:***@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
                  </span>
                  <button
                    onClick={copyConnectionUri}
                    className="flex items-center gap-1 text-slate-700 hover:text-slate-900 font-semibold shrink-0 ml-2 cursor-pointer"
                  >
                    {copiedString ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedString ? 'Copied' : 'Copy URI'}</span>
                  </button>
                </div>
              </div>

              {/* Push & Pull Actions Card */}
              <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <UploadCloud className="w-4 h-4 text-emerald-600" />
                      Two-Way Supabase Synchronization
                    </h4>
                    <p className="text-xs text-slate-600 mt-1 max-w-lg leading-relaxed">
                      Sync all modules into Supabase tables: <strong>Outlet Operating Overheads</strong> (14 categories &amp; splits),{' '}
                      <strong>Staff &amp; Wages Directory</strong>, <strong>Bulk Catering Orders</strong>, <strong>Purchases &amp; COGS</strong>,{' '}
                      <strong>Inventory Snapshots</strong>, and <strong>Dishes &amp; Recipes</strong>.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handlePull}
                      disabled={pulling || syncing || !status?.connected}
                      className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 disabled:bg-slate-200 text-slate-800 font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {pulling ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600" />
                          <span>Pulling...</span>
                        </>
                      ) : (
                        <>
                          <DownloadCloud className="w-3.5 h-3.5 text-teal-600" />
                          <span>Pull from Cloud</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleSync}
                      disabled={syncing || pulling || !status?.connected}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
                    >
                      {syncing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Syncing...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-4 h-4" />
                          <span>Push All to Supabase</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Live Count Preview before Push */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-1 text-xs">
                  <div className="bg-white/80 p-2 rounded-lg border border-slate-200/80">
                    <div className="text-[10px] text-slate-400 font-medium">Operating Overheads</div>
                    <div className="font-bold text-slate-800">{operatingExpenses.length} categories</div>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-slate-200/80">
                    <div className="text-[10px] text-slate-400 font-medium">Staff Directory</div>
                    <div className="font-bold text-slate-800">{staffDirectory.length} employees</div>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-slate-200/80">
                    <div className="text-[10px] text-slate-400 font-medium">Bulk Catering</div>
                    <div className="font-bold text-slate-800">{cateringOrders.length} event orders</div>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-slate-200/80">
                    <div className="text-[10px] text-slate-400 font-medium">Purchases &amp; COGS</div>
                    <div className="font-bold text-slate-800">{purchases.length} invoices</div>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-slate-200/80">
                    <div className="text-[10px] text-slate-400 font-medium">Payout Statements</div>
                    <div className="font-bold text-slate-800">{payouts.length} statements</div>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-slate-200/80">
                    <div className="text-[10px] text-slate-400 font-medium">Dishes &amp; Recipes</div>
                    <div className="font-bold text-slate-800">{parentDishes.length} dishes / {recipes.length} BOMs</div>
                  </div>
                </div>

                {/* Sync Feedback Message */}
                {syncResult && (
                  <div
                    className={`p-3 rounded-lg text-xs flex items-start gap-2.5 ${
                      syncResult.success
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : 'bg-rose-100 text-rose-900 border border-rose-300'
                    }`}
                  >
                    {syncResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="w-full">
                      <div className="font-bold">{syncResult.message}</div>
                      {syncResult.summary && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px] font-semibold text-emerald-800">
                          <div>&bull; {syncResult.summary.operatingExpenses ?? 0} Operating Overheads</div>
                          <div>&bull; {syncResult.summary.staffDirectory ?? 0} Staff Members</div>
                          <div>&bull; {syncResult.summary.cateringOrders ?? 0} Catering Orders</div>
                          <div>&bull; {syncResult.summary.purchases ?? 0} Purchases &amp; COGS</div>
                          <div>&bull; {syncResult.summary.inventorySnapshots ?? 0} Inventory Snapshots</div>
                          <div>&bull; {syncResult.summary.payouts ?? 0} Payout Statements</div>
                          <div>&bull; {syncResult.summary.parentDishes ?? 0} Dishes</div>
                          <div>&bull; {syncResult.summary.recipes ?? 0} Recipes &amp; BOMs</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Database Tables Live Status */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-slate-500" />
                    Supabase Database Tables &amp; Live Row Counts ({status?.tablesCount ?? 0} public tables)
                  </span>
                  <span className="text-slate-400 font-normal">Connected to PostgreSQL</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                  {status?.tables && status.tables.length > 0 ? (
                    status.tables.map((t) => (
                      <div
                        key={t.name}
                        className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between text-xs"
                      >
                        <span className="font-mono text-[11px] text-slate-700 truncate" title={t.name}>
                          {t.name}
                        </span>
                        <span
                          className={`font-semibold px-2 py-0.5 rounded-full text-[10px] ${
                            t.rows > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {t.rows} {t.rows === 1 ? 'row' : 'rows'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-3 text-center py-4 text-xs text-slate-400">
                      {loading ? 'Checking Supabase tables...' : 'No tables detected.'}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* DDL Code Viewer */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-teal-600" />
                    {activeTab === 'additional_ddl'
                      ? 'Additional Modules Schema (Overheads, Staff, Catering, Purchases)'
                      : 'Complete Supabase Master Relational Schema'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Run this SQL script directly in your <strong>Supabase SQL Editor</strong> to create all tables, indexes, triggers, and RLS policies.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={copyDdlToClipboard}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
                  >
                    {copiedDdl ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedDdl ? 'SQL Copied!' : 'Copy SQL DDL'}</span>
                  </button>
                  <button
                    onClick={downloadDdlFile}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Download .sql</span>
                  </button>
                </div>
              </div>

              {/* Instructions box */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-blue-700" />
                  Quick Supabase Execution Steps:
                </span>
                <ol className="list-decimal list-inside space-y-0.5 text-blue-800 text-[11px] pl-1">
                  <li>Click <strong>Copy SQL DDL</strong> above.</li>
                  <li>Open your Supabase project: <code className="bg-blue-100 px-1 py-0.2 rounded font-mono text-[10px]">https://supabase.com/dashboard/project/ognarhapvjisjespxdlc/sql</code></li>
                  <li>Click <strong>&ldquo;New query&rdquo;</strong>, paste the copied SQL, and click <strong>&ldquo;Run&rdquo;</strong>.</li>
                </ol>
              </div>

              {/* Code block */}
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100 font-mono text-[11px] leading-relaxed max-h-[380px] overflow-y-auto p-4 select-text">
                {loadingDdl ? (
                  <div className="text-slate-400 py-8 text-center">Loading DDL script...</div>
                ) : (
                  <pre className="whitespace-pre-wrap">{ddlText}</pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>SSL Secured with PostgreSQL Row Level Security (RLS)</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
