import { DEMO_ENABLED } from '../config/features';
import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import React from 'react';
import { NavTab, NAV_ITEMS } from './Sidebar';
import {
  Sparkles,
  Database,
  Calendar,
  Store,
  CheckCircle2,
  Download,
  Cloud,
  Trash2,
} from 'lucide-react';
import { ReconciliationReport } from '../types/restaurant';

interface HeaderProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onLoadDemoData: () => void;
  onClearAllData?: () => void;
  isDemoLoaded: boolean;
  reconciliation: ReconciliationReport;
  onExportExcel: () => void;
  onOpenSupabaseModal?: () => void;
  groupingMode?: 'dish' | 'outlet';
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onLoadDemoData,
  onClearAllData,
  isDemoLoaded,
  reconciliation,
  onExportExcel,
  onOpenSupabaseModal,
  groupingMode = 'dish',
}) => {
  const { user, logout } = useAuth();
  const currentItem = NAV_ITEMS.find((item) => item.id === currentTab);
  const displayTitle =
    currentTab === 'grouping'
      ? groupingMode === 'outlet'
        ? 'Outlet Grouping'
        : 'Dish Grouping Review'
      : currentItem?.label;

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs z-10">
      {/* Title & Context */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
          {displayTitle}
        </h2>
        {isDemoLoaded && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            6-Month Petpooja Demo Active (May–Oct 2026)
          </span>
        )}
      </div>

      {/* Global Controls & Actions */}
      <div className="flex items-center gap-2.5">
        {/* Date Context Badge */}
        {reconciliation.dateRangeStart && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-medium text-slate-800">
              {reconciliation.dateRangeStart} to {reconciliation.dateRangeEnd}
            </span>
          </div>
        )}

        {/* Quick Load Demo Button */}
        {DEMO_ENABLED && (
        <button
          onClick={onLoadDemoData}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 transition-colors shadow-xs"
          title="Load 6 months of realistic Petpooja sales for testing and demonstration"
        >
          <Database className="w-3.5 h-3.5 text-amber-600" />
          <span>{isDemoLoaded ? 'Reload Demo Dataset' : 'Load Petpooja Demo Data'}</span>
        </button>
        )}

        {/* Clear All Data Reset Button */}
        {onClearAllData && (
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to remove all data and reset to a clean blank state?')) {
                onClearAllData();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 border border-slate-300 transition-colors shadow-xs"
            title="Clear all uploaded data and local storage caches"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-500 hover:text-rose-600" />
            <span className="hidden sm:inline">Clear All Data</span>
          </button>
        )}

        {/* Verification Tests Quick Button */}
        <button
          onClick={() => onSelectTab('verification')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-300 transition-colors shadow-xs"
          title="Run 10 automated test validations including Chicken Biryani rollup"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
          <span className="hidden sm:inline">Verification Tests</span>
        </button>

        {/* Supabase Cloud Database Button */}
        {onOpenSupabaseModal && (
          <button
            onClick={onOpenSupabaseModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 transition-colors shadow-xs cursor-pointer"
            title="Supabase PostgreSQL database connected. Click to view status or sync data."
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <Cloud className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-bold">Supabase</span>
          </button>
        )}

        {/* Export Excel Button */}
        <button
          onClick={onExportExcel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export Excel</span>
        </button>
        {/* Signed-in user & logout */}
        <div className="flex items-center gap-2 pl-2.5 ml-1 border-l border-slate-200">
          {user?.email && (
            <span className="hidden xl:inline text-xs text-slate-600 max-w-[180px] truncate" title={user.email}>
              {user.email}
            </span>
          )}
          <button
            onClick={() => {
              if (window.confirm('Sign out of MenuMind?')) void logout();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 transition-colors shadow-xs cursor-pointer"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
