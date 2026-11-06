import { DEMO_ENABLED } from '../../config/features';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  OutletId,
  MonthlyExpenseItem,
  EmployeePayrollRecord,
  PlatformPayoutRecord,
  MonthEndCloseStep,
} from '../../types/finance';
import { ParentDish, ReconciliationReport } from '../../types/restaurant';
import { DishRecipe } from '../../types/recipe';
import {
  WHITEFIELD_EXPENSES_BASELINE,
  BANASWADI_EXPENSES_BASELINE,
  WHITEFIELD_PAYROLL_BASELINE,
  BANASWADI_PAYROLL_BASELINE,
  SAMPLE_PLATFORM_PAYOUTS,
  DEFAULT_MONTH_END_CLOSE_STEPS,
} from '../../data/financeBaseline';
import {
  generateMonthlyPnL,
  computeBreakEvenAnalysis,
  formatINR,
} from '../../utils/financeCalculations';

// 11 Tab Subcomponents + Enhancements
import { ExecutiveFinanceDashboard } from './ExecutiveFinanceDashboard';
import { SalesChannelReconciliation } from './SalesChannelReconciliation';
import { PlatformPayoutAnalysis } from './PlatformPayoutAnalysis';
import { MonthlyExpenseManager } from './MonthlyExpenseManager';
import { EmployeePayrollManager } from './EmployeePayrollManager';
import { FoodCostContribution } from './FoodCostContribution';
import { MonthlyPnLView } from './MonthlyPnLView';
import { BreakEvenCalculator } from './BreakEvenCalculator';
import { ProfitSimulator } from './ProfitSimulator';
import { FinancialReports } from './FinancialReports';
import { FinanceSettingsAIAdvisor } from './FinanceSettingsAIAdvisor';
import { MonthEndWorkflowModal } from './MonthEndWorkflowModal';
import { BulkCateringDashboard } from '../catering/BulkCateringDashboard';
import { StaffDirectoryManager } from '../payroll/StaffDirectoryManager';
import { PurchaseCOGSExecutiveDashboard } from './purchases/PurchaseCOGSExecutiveDashboard';

import { CateringOrder } from '../../types/catering';
import { StaffMember } from '../../types/payrollStaff';
import { PurchaseRecord, InventorySnapshot, FoodCostingBasis } from '../../types/purchases';
import { OutletOperatingExpenseItem } from '../../types/operatingCosts';
import { RawSalesRecord } from '../../types/restaurant';
import { DEMO_CATERING_ORDERS } from '../../data/demoCateringDataset';
import { getSavedStaffDirectory, saveStaffDirectory } from '../../utils/payrollStaffManager';
import {
  getSavedPurchases,
  savePurchases,
  getSavedInventorySnapshots,
  saveInventorySnapshots,
  getSavedFoodCostingBasis,
  saveFoodCostingBasis,
} from '../../utils/purchaseCalculations';
import { getSavedPayouts, savePayouts } from '../../utils/payoutManager';

import {
  LayoutDashboard,
  Layers,
  CreditCard,
  Receipt,
  Users,
  BookOpen,
  FileText,
  Building2,
  Sliders,
  FileSpreadsheet,
  BotMessageSquare,
  CheckCircle2,
  Calendar,
  Lock,
  UtensilsCrossed,
  ShoppingBag,
  Cloud,
} from 'lucide-react';

interface FinanceCommandCenterProps {
  parentDishes: ParentDish[];
  recipes: DishRecipe[];
  reconciliation?: ReconciliationReport;
  cateringOrders?: CateringOrder[];
  onUpdateCateringOrders?: (orders: CateringOrder[]) => void;
  staffDirectory?: StaffMember[];
  onUpdateStaffDirectory?: (staff: StaffMember[]) => void;
  purchases?: PurchaseRecord[];
  onUpdatePurchases?: (purchases: PurchaseRecord[]) => void;
  inventorySnapshots?: InventorySnapshot[];
  onUpdateInventorySnapshots?: (snapshots: InventorySnapshot[]) => void;
  costingBasis?: FoodCostingBasis;
  onChangeCostingBasis?: (basis: FoodCostingBasis) => void;
  payouts?: PlatformPayoutRecord[];
  onUpdatePayouts?: (payouts: PlatformPayoutRecord[]) => void;
  operatingExpenses?: OutletOperatingExpenseItem[];
  rawRecords?: RawSalesRecord[];
  initialSubTab?: FinanceTab;
  onOpenSupabaseModal?: () => void;
}

export type FinanceTab =
  | 'overview'
  | 'purchases'
  | 'catering'
  | 'staff-directory'
  | 'reconciliation'
  | 'payouts'
  | 'expenses'
  | 'payroll'
  | 'food-cost'
  | 'pnl'
  | 'break-even'
  | 'simulator'
  | 'reports'
  | 'settings-advisor';

export const FinanceCommandCenter: React.FC<FinanceCommandCenterProps> = ({
  parentDishes,
  recipes,
  reconciliation,
  cateringOrders: externalCateringOrders,
  onUpdateCateringOrders: externalOnUpdateCateringOrders,
  staffDirectory: externalStaffDirectory,
  onUpdateStaffDirectory: externalOnUpdateStaffDirectory,
  purchases: externalPurchases,
  onUpdatePurchases: externalOnUpdatePurchases,
  inventorySnapshots: externalInventorySnapshots,
  onUpdateInventorySnapshots: externalOnUpdateInventorySnapshots,
  costingBasis: externalCostingBasis,
  onChangeCostingBasis: externalOnChangeCostingBasis,
  payouts: externalPayouts,
  onUpdatePayouts: externalOnUpdatePayouts,
  operatingExpenses = [],
  rawRecords = [],
  initialSubTab = 'overview',
  onOpenSupabaseModal,
}) => {
  const [currentOutlet, setCurrentOutlet] = useState<OutletId>('consolidated');
  const [activeFinanceTab, setActiveFinanceTab] = useState<FinanceTab>(initialSubTab);
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-10');

  // Independent state ledgers (default to clean empty state — no demo data)
  const [expenses, setExpenses] = useState<MonthlyExpenseItem[]>(() => {
    try {
      const raw = localStorage.getItem('menumind_expenses_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [payroll, setPayroll] = useState<EmployeePayrollRecord[]>(() => {
    try {
      const raw = localStorage.getItem('menumind_payroll_records_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [localPayouts, setLocalPayouts] = useState<PlatformPayoutRecord[]>(() => {
    return getSavedPayouts();
  });
  const payouts = externalPayouts ?? localPayouts;
  const handleUpdatePayouts = (updated: PlatformPayoutRecord[]) => {
    if (externalOnUpdatePayouts) {
      externalOnUpdatePayouts(updated);
    } else {
      setLocalPayouts(updated);
      savePayouts(updated);
    }
  };

  // Purchases & COGS Management State with LocalStorage Persistence
  const [localPurchases, setLocalPurchases] = useState<PurchaseRecord[]>(() => {
    return getSavedPurchases();
  });
  const purchases = externalPurchases ?? localPurchases;
  const handleUpdatePurchases = (updated: PurchaseRecord[]) => {
    if (externalOnUpdatePurchases) {
      externalOnUpdatePurchases(updated);
    } else {
      setLocalPurchases(updated);
      savePurchases(updated);
    }
  };

  const [localInventorySnapshots, setLocalInventorySnapshots] = useState<InventorySnapshot[]>(() => {
    return getSavedInventorySnapshots();
  });
  const inventorySnapshots = externalInventorySnapshots ?? localInventorySnapshots;
  const handleUpdateInventorySnapshots = (updated: InventorySnapshot[]) => {
    if (externalOnUpdateInventorySnapshots) {
      externalOnUpdateInventorySnapshots(updated);
    } else {
      setLocalInventorySnapshots(updated);
      saveInventorySnapshots(updated);
    }
  };

  const [localCostingBasis, setLocalCostingBasis] = useState<FoodCostingBasis>(() => {
    return getSavedFoodCostingBasis();
  });
  const costingBasis = externalCostingBasis ?? localCostingBasis;
  const handleUpdateCostingBasis = (basis: FoodCostingBasis) => {
    if (externalOnChangeCostingBasis) {
      externalOnChangeCostingBasis(basis);
    } else {
      setLocalCostingBasis(basis);
      saveFoodCostingBasis(basis);
    }
  };

  // Bulk Catering Orders State with LocalStorage Persistence
  const [localCateringOrders, setLocalCateringOrders] = useState<CateringOrder[]>(() => {
    try {
      const raw = localStorage.getItem('menumind_catering_orders_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to load catering orders from localStorage', e);
    }
    return DEMO_ENABLED ? DEMO_CATERING_ORDERS : [];
  });

  const cateringOrders = externalCateringOrders ?? localCateringOrders;
  const handleUpdateCateringOrders = (updated: CateringOrder[]) => {
    if (externalOnUpdateCateringOrders) {
      externalOnUpdateCateringOrders(updated);
    } else {
      setLocalCateringOrders(updated);
      try {
        localStorage.setItem('menumind_catering_orders_v1', JSON.stringify(updated));
      } catch (e) {}
    }
  };

  // Staff Directory State with LocalStorage Persistence
  const [localStaffDirectory, setLocalStaffDirectory] = useState<StaffMember[]>(() => {
    return getSavedStaffDirectory();
  });

  const staffDirectory = externalStaffDirectory ?? localStaffDirectory;
  const handleUpdateStaffDirectory = (updated: StaffMember[]) => {
    if (externalOnUpdateStaffDirectory) {
      externalOnUpdateStaffDirectory(updated);
    } else {
      setLocalStaffDirectory(updated);
      saveStaffDirectory(updated);
    }
  };

  const [closeSteps, setCloseSteps] = useState<MonthEndCloseStep[]>(DEFAULT_MONTH_END_CLOSE_STEPS);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // Computed P&L Statements for each outlet and consolidated (with catering, authoritative payroll, and selectable food costing)
  const pnlBanaswadi = useMemo(() => {
    return generateMonthlyPnL(
      selectedMonth,
      'banaswadi',
      parentDishes,
      recipes,
      expenses,
      payroll,
      payouts,
      cateringOrders,
      true,
      staffDirectory,
      purchases,
      inventorySnapshots,
      costingBasis,
      rawRecords
    );
  }, [
    selectedMonth,
    parentDishes,
    recipes,
    expenses,
    payroll,
    payouts,
    cateringOrders,
    staffDirectory,
    purchases,
    inventorySnapshots,
    costingBasis,
    rawRecords,
  ]);

  const pnlWhitefield = useMemo(() => {
    return generateMonthlyPnL(
      selectedMonth,
      'whitefield',
      parentDishes,
      recipes,
      expenses,
      payroll,
      payouts,
      cateringOrders,
      true,
      staffDirectory,
      purchases,
      inventorySnapshots,
      costingBasis,
      rawRecords
    );
  }, [
    selectedMonth,
    parentDishes,
    recipes,
    expenses,
    payroll,
    payouts,
    cateringOrders,
    staffDirectory,
    purchases,
    inventorySnapshots,
    costingBasis,
    rawRecords,
  ]);

  const pnlConsolidated = useMemo(() => {
    return generateMonthlyPnL(
      selectedMonth,
      'consolidated',
      parentDishes,
      recipes,
      expenses,
      payroll,
      payouts,
      cateringOrders,
      true,
      staffDirectory,
      purchases,
      inventorySnapshots,
      costingBasis,
      rawRecords
    );
  }, [
    selectedMonth,
    parentDishes,
    recipes,
    expenses,
    payroll,
    payouts,
    cateringOrders,
    staffDirectory,
    purchases,
    inventorySnapshots,
    costingBasis,
    rawRecords,
  ]);

  const activePnl =
    currentOutlet === 'banaswadi'
      ? pnlBanaswadi
      : currentOutlet === 'whitefield'
      ? pnlWhitefield
      : pnlConsolidated;

  const breakEven = useMemo(() => {
    return computeBreakEvenAnalysis(activePnl, 30, true);
  }, [activePnl]);

  const handleToggleStep = (stepId: number) => {
    setCloseSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, isCompleted: !s.isCompleted } : s))
    );
  };

  const handleCertifyMonth = () => {
    setCloseSteps((prev) => prev.map((s) => ({ ...s, isCompleted: true })));
    alert('October 2026 Financial Close has been certified and locked! P&L statements are audited.');
  };

  const FINANCE_TABS = [
    { id: 'overview', label: 'Executive Dashboard', icon: LayoutDashboard },
    { id: 'purchases', label: 'Purchases & COGS', icon: ShoppingBag },
    { id: 'catering', label: 'Bulk Catering & Events', icon: UtensilsCrossed },
    { id: 'staff-directory', label: 'Staff Roster & Payroll', icon: Users },
    { id: 'reconciliation', label: 'Sales & Channel Audit', icon: Layers },
    { id: 'payouts', label: 'Platform Payouts', icon: CreditCard },
    { id: 'expenses', label: 'Monthly Expenses', icon: Receipt },
    { id: 'payroll', label: 'Baseline Payroll', icon: Users },
    { id: 'food-cost', label: 'Food Cost & BOM', icon: BookOpen },
    { id: 'pnl', label: 'Monthly P&L', icon: FileText },
    { id: 'break-even', label: 'Break-Even Calculator', icon: Building2 },
    { id: 'simulator', label: 'Profit Simulator', icon: Sliders },
    { id: 'reports', label: 'Financial Reports', icon: FileSpreadsheet },
    { id: 'settings-advisor', label: 'Settings & AI Advisor', icon: BotMessageSquare },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Finance Module Header Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-900 to-indigo-900 flex items-center justify-center text-teal-400 font-bold shadow-md">
            ₹
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              Finance Command Center
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 uppercase">
                P&amp;L Intelligence
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              Multi-outlet cloud kitchen financial accounting, aggregator payout audits, and break-even targets
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Outlet Switcher */}
          <div className="p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs flex items-center">
            <button
              onClick={() => setCurrentOutlet('consolidated')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'consolidated'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consolidated Chain
            </button>
            <button
              onClick={() => setCurrentOutlet('banaswadi')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'banaswadi'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Banaswadi
            </button>
            <button
              onClick={() => setCurrentOutlet('whitefield')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'whitefield'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Whitefield (-w)
            </button>
          </div>

          {/* Month Selector */}
          <div className="flex items-center gap-1.5 text-xs bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-semibold">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="2026-10">October 2026 (Benchmark)</option>
              <option value="2026-09">September 2026</option>
              <option value="2026-08">August 2026</option>
            </select>
          </div>

          {/* Supabase Cloud Database Button */}
          {onOpenSupabaseModal && (
            <button
              onClick={onOpenSupabaseModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 transition-colors shadow-xs cursor-pointer"
              title="Open Supabase Cloud Database Sync"
            >
              <Cloud className="w-3.5 h-3.5 text-emerald-600" />
              <span>Supabase Cloud Sync</span>
            </button>
          )}

          {/* Month-End Close Modal Button */}
          <button
            onClick={() => setIsCloseModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300 transition-colors shadow-xs cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>13-Step Close</span>
          </button>
        </div>
      </div>

      {/* 11 Horizontal Tab Navigation Buttons */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {FINANCE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeFinanceTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFinanceTab(tab.id as FinanceTab)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white font-bold shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-teal-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Rendering */}
      <div>
        {activeFinanceTab === 'overview' && (
          <ExecutiveFinanceDashboard
            currentOutlet={currentOutlet}
            onSelectOutlet={setCurrentOutlet}
            pnl={activePnl}
            pnlBanaswadi={pnlBanaswadi}
            pnlWhitefield={pnlWhitefield}
            pnlConsolidated={pnlConsolidated}
            breakEven={breakEven}
            payouts={payouts}
            expenses={expenses}
            onNavigateTab={(tab) => setActiveFinanceTab(tab as FinanceTab)}
            onOpenMonthEndModal={() => setIsCloseModalOpen(true)}
          />
        )}

        {activeFinanceTab === 'purchases' && (
          <PurchaseCOGSExecutiveDashboard
            currentOutlet={currentOutlet}
            onSelectOutlet={setCurrentOutlet}
            purchases={purchases}
            onUpdatePurchases={handleUpdatePurchases}
            inventorySnapshots={inventorySnapshots}
            onUpdateInventorySnapshots={handleUpdateInventorySnapshots}
            costingBasis={costingBasis}
            onChangeCostingBasis={handleUpdateCostingBasis}
            parentDishes={parentDishes}
            recipes={recipes}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
            netRevenue={pnlConsolidated.netSalesRevenue}
            onOpenSupabaseModal={onOpenSupabaseModal}
          />
        )}

        {activeFinanceTab === 'catering' && (
          <BulkCateringDashboard
            orders={cateringOrders}
            onUpdateOrders={handleUpdateCateringOrders}
            parentDishes={parentDishes}
            recipes={recipes}
            onOpenSupabaseModal={onOpenSupabaseModal}
          />
        )}

        {activeFinanceTab === 'staff-directory' && (
          <StaffDirectoryManager
            staff={staffDirectory}
            onUpdateStaff={handleUpdateStaffDirectory}
            onOpenSupabaseModal={onOpenSupabaseModal}
          />
        )}

        {activeFinanceTab === 'reconciliation' && (
          <SalesChannelReconciliation
            currentOutlet={currentOutlet}
            payouts={payouts}
            onSelectOutlet={setCurrentOutlet}
            rawRecords={rawRecords}
            selectedMonth={selectedMonth}
          />
        )}

        {activeFinanceTab === 'payouts' && (
          <PlatformPayoutAnalysis
            currentOutlet={currentOutlet}
            payouts={payouts}
            onUpdatePayouts={handleUpdatePayouts}
            rawRecords={rawRecords}
            parentDishes={parentDishes}
            purchases={purchases}
            cateringOrders={cateringOrders}
            staffDirectory={staffDirectory}
            operatingExpenses={operatingExpenses}
            onNavigateTab={(tab) => setActiveFinanceTab(tab as FinanceTab)}
            onOpenSupabaseModal={onOpenSupabaseModal}
          />
        )}

        {activeFinanceTab === 'expenses' && (
          <MonthlyExpenseManager
            currentOutlet={currentOutlet}
            expenses={expenses}
            onUpdateExpenses={setExpenses}
            onSelectOutlet={setCurrentOutlet}
          />
        )}

        {activeFinanceTab === 'payroll' && (
          <EmployeePayrollManager
            currentOutlet={currentOutlet}
            payroll={payroll}
            onUpdatePayroll={setPayroll}
            onSelectOutlet={setCurrentOutlet}
          />
        )}

        {activeFinanceTab === 'food-cost' && (
          <FoodCostContribution parentDishes={parentDishes} recipes={recipes} />
        )}

        {activeFinanceTab === 'pnl' && (
          <MonthlyPnLView
            currentOutlet={currentOutlet}
            pnlBanaswadi={pnlBanaswadi}
            pnlWhitefield={pnlWhitefield}
            pnlConsolidated={pnlConsolidated}
            onSelectOutlet={setCurrentOutlet}
            costingBasis={costingBasis}
            onChangeCostingBasis={handleUpdateCostingBasis}
            payouts={payouts}
            onNavigateToPayouts={() => setActiveFinanceTab('payouts')}
          />
        )}

        {activeFinanceTab === 'break-even' && (
          <BreakEvenCalculator
            currentOutlet={currentOutlet}
            pnl={activePnl}
            breakEven={breakEven}
            onSelectOutlet={setCurrentOutlet}
          />
        )}

        {activeFinanceTab === 'simulator' && (
          <ProfitSimulator
            currentOutlet={currentOutlet}
            pnl={activePnl}
            onSelectOutlet={setCurrentOutlet}
          />
        )}

        {activeFinanceTab === 'reports' && (
          <FinancialReports
            currentOutlet={currentOutlet}
            pnlConsolidated={pnlConsolidated}
            pnlBanaswadi={pnlBanaswadi}
            pnlWhitefield={pnlWhitefield}
            expenses={expenses}
            payroll={payroll}
            payouts={payouts}
          />
        )}

        {activeFinanceTab === 'settings-advisor' && (
          <FinanceSettingsAIAdvisor
            currentOutlet={currentOutlet}
            pnlConsolidated={pnlConsolidated}
            pnlBanaswadi={pnlBanaswadi}
            pnlWhitefield={pnlWhitefield}
            breakEven={breakEven}
            purchases={purchases}
          />
        )}
      </div>

      {/* 13-Step Month End Close Modal */}
      <MonthEndWorkflowModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        steps={closeSteps}
        onToggleStep={handleToggleStep}
        onCertifyMonth={handleCertifyMonth}
      />
    </div>
  );
};
