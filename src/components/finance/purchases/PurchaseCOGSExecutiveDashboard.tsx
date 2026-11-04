/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  PurchaseRecord,
  InventorySnapshot,
  FoodCostingBasis,
  PurchaseApprovalStatus,
} from '../../../types/purchases';
import { OutletId } from '../../../types/finance';
import { ParentDish } from '../../../types/restaurant';
import { DishRecipe } from '../../../types/recipe';
import { formatINR, formatPct } from '../../../utils/financeCalculations';
import {
  computeMonthlyPurchaseSummary,
  getSavedCustomCategories,
  saveCustomCategories,
  savePurchases,
  saveInventorySnapshots,
  saveFoodCostingBasis,
  addPurchaseAuditLog,
} from '../../../utils/purchaseCalculations';
import { AddEditPurchaseModal } from './AddEditPurchaseModal';
import { PorterFreightAllocationModal } from './PorterFreightAllocationModal';
import { PurchaseRegisterTable } from './PurchaseRegisterTable';
import {
  DollarSign,
  TrendingUp,
  PieChart,
  ShoppingBag,
  Truck,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  BookOpen,
  Boxes,
  HelpCircle,
  FileCheck,
  RotateCcw,
  Cloud,
} from 'lucide-react';

interface PurchaseCOGSExecutiveDashboardProps {
  currentOutlet: OutletId;
  onSelectOutlet: (outlet: OutletId) => void;
  purchases: PurchaseRecord[];
  onUpdatePurchases: (updated: PurchaseRecord[]) => void;
  inventorySnapshots: InventorySnapshot[];
  onUpdateInventorySnapshots: (updated: InventorySnapshot[]) => void;
  costingBasis: FoodCostingBasis;
  onChangeCostingBasis: (basis: FoodCostingBasis) => void;
  parentDishes: ParentDish[];
  recipes: DishRecipe[];
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
  netRevenue?: number;
  onOpenSupabaseModal?: () => void;
}

export const PurchaseCOGSExecutiveDashboard: React.FC<
  PurchaseCOGSExecutiveDashboardProps
> = ({
  currentOutlet,
  onSelectOutlet,
  purchases,
  onUpdatePurchases,
  inventorySnapshots,
  onUpdateInventorySnapshots,
  costingBasis,
  onChangeCostingBasis,
  parentDishes,
  recipes,
  selectedMonth = '2026-10',
  onSelectMonth,
  netRevenue = 0,
  onOpenSupabaseModal,
}) => {
  const [activeMonth, setActiveMonth] = useState(selectedMonth);
  const monthToUse = onSelectMonth ? selectedMonth : activeMonth;

  // Custom categories state
  const [customCategories, setCustomCategories] = useState<string[]>(() =>
    getSavedCustomCategories()
  );

  const handleAddCustomCategory = (newCat: string) => {
    if (!customCategories.includes(newCat)) {
      const updated = [...customCategories, newCat];
      setCustomCategories(updated);
      saveCustomCategories(updated);
    }
  };

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseRecord | null>(null);
  const [isPorterModalOpen, setIsPorterModalOpen] = useState(false);
  const [selectedPorterRecord, setSelectedPorterRecord] = useState<PurchaseRecord | null>(null);

  // Inventory Stock Audit modal/editor
  const [isInventoryEditorOpen, setIsInventoryEditorOpen] = useState(false);
  const [openingInvInput, setOpeningInvInput] = useState<number>(0);
  const [closingInvInput, setClosingInvInput] = useState<number>(0);
  const [returnsInput, setReturnsInput] = useState<number>(0);

  // Recipe-Based COGS calculation fallback
  const recipeCOGSBenchmark = useMemo(() => {
    if (!parentDishes || parentDishes.length === 0) return Math.round(netRevenue * 0.315);
    let totalDishRevenue = 0;
    let totalDishCost = 0;
    parentDishes.forEach((d) => {
      const recipe = recipes.find(
        (r) => r.parentDishName.toLowerCase() === d.name.toLowerCase()
      );
      const dishCost = recipe ? recipe.totalIngredientCost : d.unitCost || d.averageRealizedPrice * 0.31;
      totalDishRevenue += d.totalRevenue;
      totalDishCost += dishCost * d.totalQuantity;
    });
    const ratio = totalDishRevenue > 0 ? totalDishCost / totalDishRevenue : 0.315;
    return Math.round(netRevenue * ratio);
  }, [parentDishes, recipes, netRevenue]);

  // Compute summary metrics for current outlet
  const metrics = useMemo(() => {
    return computeMonthlyPurchaseSummary(
      purchases,
      inventorySnapshots,
      currentOutlet,
      monthToUse,
      recipeCOGSBenchmark,
      netRevenue
    );
  }, [purchases, inventorySnapshots, currentOutlet, monthToUse, recipeCOGSBenchmark, netRevenue]);

  // Outlet-specific comparisons
  const wfMetrics = useMemo(() => {
    return computeMonthlyPurchaseSummary(purchases, inventorySnapshots, 'whitefield', monthToUse, 129000, 409921);
  }, [purchases, inventorySnapshots, monthToUse]);

  const bwMetrics = useMemo(() => {
    return computeMonthlyPurchaseSummary(purchases, inventorySnapshots, 'banaswadi', monthToUse, 149000, 472527);
  }, [purchases, inventorySnapshots, monthToUse]);

  // Handle save purchase
  const handleSavePurchase = (savedRecord: PurchaseRecord, isEditing: boolean) => {
    let updatedList: PurchaseRecord[];
    if (isEditing) {
      updatedList = purchases.map((p) => (p.id === savedRecord.id ? savedRecord : p));
      addPurchaseAuditLog({
        purchaseId: savedRecord.id,
        user: 'Store Manager',
        fieldChanged: 'multiple_fields',
        oldValue: 'previous_version',
        newValue: savedRecord.itemDescription,
        reason: 'Manual edit of purchase line-item',
      });
    } else {
      updatedList = [savedRecord, ...purchases];
      addPurchaseAuditLog({
        purchaseId: savedRecord.id,
        user: 'Store Manager',
        fieldChanged: 'created',
        oldValue: null,
        newValue: savedRecord.landedCost,
        reason: 'New purchase transaction recorded',
      });
    }
    onUpdatePurchases(updatedList);
    savePurchases(updatedList);
  };

  // Handle delete purchase
  const handleDeletePurchase = (purchaseId: string) => {
    const updatedList = purchases.filter((p) => p.id !== purchaseId);
    onUpdatePurchases(updatedList);
    savePurchases(updatedList);
    addPurchaseAuditLog({
      purchaseId,
      user: 'Store Manager',
      fieldChanged: 'deleted',
      oldValue: purchaseId,
      newValue: null,
      reason: 'Draft entry removed by user',
    });
  };

  // Handle Porter Freight Allocation
  const handleApplyPorterAllocation = (
    porterId: string,
    allocations: Record<string, number>,
    updatedPurchases: PurchaseRecord[]
  ) => {
    onUpdatePurchases(updatedPurchases);
    savePurchases(updatedPurchases);
    addPurchaseAuditLog({
      purchaseId: porterId,
      user: 'Store Manager',
      fieldChanged: 'freight_allocation',
      oldValue: 'unallocated',
      newValue: allocations,
      reason: 'Allocated Porter freight to landed ingredient costs',
    });
  };

  // Handle Month Approval Status Cycle
  const handleCycleApprovalStatus = () => {
    const current = metrics.approvalStatus;
    const next: PurchaseApprovalStatus =
      current === 'Draft'
        ? 'Under Review'
        : current === 'Under Review'
        ? 'Approved'
        : current === 'Approved'
        ? 'Locked'
        : 'Draft';

    const updated = purchases.map((p) => {
      if (p.month === monthToUse && (currentOutlet === 'consolidated' || p.outletId === currentOutlet)) {
        return { ...p, approvalStatus: next };
      }
      return p;
    });

    onUpdatePurchases(updated);
    savePurchases(updated);
  };

  // Handle Inventory stock audit save
  const handleSaveInventory = () => {
    const targetOutlet = currentOutlet === 'consolidated' ? 'whitefield' : currentOutlet;
    const updated = inventorySnapshots.filter(
      (i) => !(i.outletId === targetOutlet && i.month === monthToUse)
    );
    const newSnapshot: InventorySnapshot = {
      outletId: targetOutlet as any,
      month: monthToUse,
      openingInventoryValue: openingInvInput,
      closingInventoryValue: closingInvInput,
      purchaseReturns: returnsInput,
      isVerified: true,
      lastStockAuditDate: new Date().toISOString().substring(0, 10),
      auditedBy: 'Kitchen Controller',
    };
    const finalList = [...updated, newSnapshot];
    onUpdateInventorySnapshots(finalList);
    saveInventorySnapshots(finalList);
    setIsInventoryEditorOpen(false);
  };

  // Open Porter allocation
  const handleOpenPorter = (record: PurchaseRecord) => {
    setSelectedPorterRecord(record);
    setIsPorterModalOpen(true);
  };

  // Shares
  const hyperpureSharePct =
    metrics.totalIngredientPurchases > 0
      ? (metrics.hyperpurePurchases / metrics.totalIngredientPurchases) * 100
      : 0;

  const localSuppliersTotal =
    metrics.totalIngredientPurchases - metrics.hyperpurePurchases;

  const localSharePct =
    metrics.totalIngredientPurchases > 0
      ? (localSuppliersTotal / metrics.totalIngredientPurchases) * 100
      : 0;

  const freshProteinsSpend =
    metrics.chickenPurchases + metrics.muttonPurchases + metrics.fishPurchases;

  return (
    <div className="space-y-6">
      {/* Dashboard Top Header Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                metrics.approvalStatus === 'Locked'
                  ? 'bg-slate-900 text-white'
                  : metrics.approvalStatus === 'Approved'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : metrics.approvalStatus === 'Under Review'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Ledger: {metrics.approvalStatus}
            </span>
            <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
              <Calendar className="w-3.5 h-3.5" />
              Accounting Period: {monthToUse}
            </span>
          </div>

          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            Purchases &amp; Landed COGS Management
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 uppercase">
              Hyperpure + Local Mandi
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Multi-outlet ingredient procurement register, Porter freight attribution, anti-double-counting
            liability offsets, and 3-way selectable P&amp;L COGS accounting.
          </p>
        </div>

        {/* Right side controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Outlet Selector */}
          <div className="p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs flex items-center">
            <button
              onClick={() => onSelectOutlet('banaswadi')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'banaswadi'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Banaswadi
            </button>
            <button
              onClick={() => onSelectOutlet('whitefield')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'whitefield'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Whitefield
            </button>
            <button
              onClick={() => onSelectOutlet('consolidated')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                currentOutlet === 'consolidated'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consolidated Chain
            </button>
          </div>

          {/* Supabase Cloud Sync Button */}
          {onOpenSupabaseModal && (
            <button
              onClick={onOpenSupabaseModal}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Sync Purchases & Inventory with Supabase cloud"
            >
              <Cloud className="w-3.5 h-3.5 text-emerald-200" />
              <span>Supabase Cloud Sync</span>
            </button>
          )}

          {/* Workflow Status Button */}
          <button
            onClick={handleCycleApprovalStatus}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            title="Cycle workflow status (Draft -> Under Review -> Approved -> Locked)"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Workflow: {metrics.approvalStatus}</span>
          </button>
        </div>
      </div>

      {/* Critical Anti-Double-Counting Rules & Educational Callout */}
      <div className="p-4 bg-gradient-to-r from-teal-50/80 to-indigo-50/80 border border-teal-200 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-slate-700 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 font-bold">
            ₹
          </div>
          <div>
            <h4 className="font-bold text-slate-900 flex items-center gap-2">
              Strict Anti-Double-Counting &amp; Hyperpure Accounting Rules
            </h4>
            <p className="text-slate-600 mt-0.5">
              1. <strong>Hyperpure Settlement Recovery</strong> via Zomato/Swiggy is recorded as a supplier liability settlement, <em>never</em> added as a second purchase expense.<br />
              2. <strong>Porter Freight</strong> attributed to ingredients increases Landed Food COGS and is isolated from general operating expenses.<br />
              3. <strong>Kitchen Consumables &amp; Cleaning Supplies</strong> are classified separately to prevent artificial food COGS inflation.
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 bg-white/80 p-2.5 rounded-xl border border-teal-200">
          <Truck className="w-4 h-4 text-teal-600" />
          <div className="text-[11px]">
            <span className="block font-bold text-slate-900">
              {formatINR(metrics.ingredientFreight)} Freight
            </span>
            <span className="text-slate-500">Landed into Food COGS</span>
          </div>
        </div>
      </div>

      {/* Section 8 & 9: Selectable P&L Food Costing Basis Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              Active P&amp;L Food Cost Basis
            </span>
            <h3 className="text-sm font-bold text-slate-900 mt-1 flex items-center gap-2">
              Select P&amp;L Food Costing Methodology
              <span className="text-xs font-normal text-slate-500">
                (Determines which food cost figure flows into Operating P&amp;L)
              </span>
            </h3>
          </div>

          {/* Basis Selector Pills */}
          <div className="p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs flex items-center">
            <button
              onClick={() => {
                onChangeCostingBasis('recipe_based');
                saveFoodCostingBasis('recipe_based');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                costingBasis === 'recipe_based'
                  ? 'bg-teal-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Recipe BOM (Primary)
            </button>
            <button
              onClick={() => {
                onChangeCostingBasis('purchase_based');
                saveFoodCostingBasis('purchase_based');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                costingBasis === 'purchase_based'
                  ? 'bg-teal-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. Landed Purchases (Proxy)
            </button>
            <button
              onClick={() => {
                onChangeCostingBasis('inventory_based');
                saveFoodCostingBasis('inventory_based');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                costingBasis === 'inventory_based'
                  ? 'bg-teal-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              3. Inventory Stock Audit
            </button>
          </div>
        </div>

        {/* 3 Comparative View Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
          {/* View A: Recipe BOM */}
          <div
            onClick={() => {
              onChangeCostingBasis('recipe_based');
              saveFoodCostingBasis('recipe_based');
            }}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              costingBasis === 'recipe_based'
                ? 'border-teal-500 bg-teal-50/40 ring-1 ring-teal-500'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-slate-700">View A: Recipe BOM</span>
              {costingBasis === 'recipe_based' && (
                <span className="text-[10px] bg-teal-600 text-white px-2 py-0.2 rounded-full font-bold">
                  Active in P&amp;L
                </span>
              )}
            </div>
            <div className="text-lg font-black text-slate-900">
              {formatINR(metrics.recipeBasedCOGS)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Estimated consumption from Petpooja dish portions &times; Bill of Materials unit recipes.
            </div>
          </div>

          {/* View B: Landed Purchases */}
          <div
            onClick={() => {
              onChangeCostingBasis('purchase_based');
              saveFoodCostingBasis('purchase_based');
            }}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              costingBasis === 'purchase_based'
                ? 'border-teal-500 bg-teal-50/40 ring-1 ring-teal-500'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-slate-700">View B: Landed Purchases Proxy</span>
              {costingBasis === 'purchase_based' && (
                <span className="text-[10px] bg-teal-600 text-white px-2 py-0.2 rounded-full font-bold">
                  Active in P&amp;L
                </span>
              )}
            </div>
            <div className="text-lg font-black text-slate-900">
              {formatINR(metrics.purchaseBasedCOGSProxy)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Total landed ingredient purchases (Hyperpure + Mandi Produce + Meat/Fish + Porter).
            </div>
          </div>

          {/* View C: Inventory Stock Audited */}
          <div
            onClick={() => {
              onChangeCostingBasis('inventory_based');
              saveFoodCostingBasis('inventory_based');
            }}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              costingBasis === 'inventory_based'
                ? 'border-teal-500 bg-teal-50/40 ring-1 ring-teal-500'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-slate-700">View C: Stock Audited Actual</span>
              {costingBasis === 'inventory_based' && (
                <span className="text-[10px] bg-teal-600 text-white px-2 py-0.2 rounded-full font-bold">
                  Active in P&amp;L
                </span>
              )}
            </div>
            <div className="text-lg font-black text-slate-900">
              {metrics.hasInventoryData && metrics.inventoryBasedCOGS !== undefined
                ? formatINR(metrics.inventoryBasedCOGS)
                : 'Stock Audit Needed'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {metrics.hasInventoryData ? (
                <span>Opening + Net Purchases − Closing Inventory (Physical stock counted).</span>
              ) : (
                <span className="text-amber-700 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Actual consumption-based COGS cannot be verified without inventory stock data.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Landed Ingredient Purchases */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
            <span>Total Landed Purchases</span>
            <ShoppingBag className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {formatINR(metrics.totalLandedIngredientPurchases)}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span>Food Purchases / Revenue</span>
            <span className="font-bold text-teal-700">
              {formatPct(metrics.foodCostRatioToRevenue)}
            </span>
          </div>
        </div>

        {/* Card 2: Hyperpure vs Local Split */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
            <span>Hyperpure Share</span>
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
              Zomato Offset
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {formatINR(metrics.hyperpurePurchases)}
            <span className="text-xs font-semibold text-slate-500 ml-1.5">
              ({formatPct(hyperpureSharePct)})
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span>Local Mandi &amp; Direct</span>
            <span className="font-bold text-slate-800">
              {formatINR(localSuppliersTotal)} ({formatPct(localSharePct)})
            </span>
          </div>
        </div>

        {/* Card 3: Fresh Proteins (Chicken, Mutton, Fish) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
            <span>Fresh Meat &amp; Fish</span>
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
              Daily Sourced
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {formatINR(freshProteinsSpend)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span>Chicken: {formatINR(metrics.chickenPurchases)}</span>
            <span>Mutton: {formatINR(metrics.muttonPurchases)}</span>
            <span>Fish: {formatINR(metrics.fishPurchases)}</span>
          </div>
        </div>

        {/* Card 4: COGS Variance (Purchases vs Recipe BOM) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
            <span>Purchases vs Recipe COGS</span>
            {metrics.cogsVarianceRecipeVsPurchases >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-amber-500" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-emerald-500" />
            )}
          </div>
          <div
            className={`text-2xl font-black ${
              metrics.cogsVarianceRecipeVsPurchases > 10000
                ? 'text-amber-700'
                : 'text-slate-900'
            }`}
          >
            {metrics.cogsVarianceRecipeVsPurchases >= 0 ? '+' : ''}
            {formatINR(metrics.cogsVarianceRecipeVsPurchases)}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span>Recipe BOM Benchmark</span>
            <span className="font-medium text-slate-700">
              {formatINR(metrics.recipeBasedCOGS)}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Purchase Mix by Category */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <PieChart className="w-4 h-4 text-teal-600" />
              Procurement Mix by Ingredient Category
            </h4>
            <span className="text-xs text-slate-400 font-medium">
              {formatINR(metrics.totalLandedIngredientPurchases)} total
            </span>
          </div>

          {/* Bar breakdown list */}
          <div className="space-y-3 pt-2">
            {[
              { label: 'Chicken', amount: metrics.chickenPurchases, color: 'bg-amber-500' },
              { label: 'Hyperpure Staples', amount: metrics.hyperpurePurchases, color: 'bg-indigo-600' },
              { label: 'Mutton (Khasi Goat)', amount: metrics.muttonPurchases, color: 'bg-rose-500' },
              { label: 'Fresh Bengali Fish', amount: metrics.fishPurchases, color: 'bg-sky-500' },
              { label: 'Local Vegetables', amount: metrics.localVegetablePurchases, color: 'bg-emerald-500' },
              { label: 'Miscellaneous Food & Spices', amount: metrics.miscFoodPurchases, color: 'bg-teal-500' },
              { label: 'Porter Freight (Landed)', amount: metrics.ingredientFreight, color: 'bg-slate-700' },
            ].map((item) => {
              const pct =
                metrics.totalLandedIngredientPurchases > 0
                  ? (item.amount / metrics.totalLandedIngredientPurchases) * 100
                  : 0;
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-700">{item.label}</span>
                    <span className="text-slate-900 font-bold">
                      {formatINR(item.amount)} ({formatPct(pct)})
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full transition-all duration-300`}
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Outlet Procurement Comparison & Sourcing Source */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              Outlet Procurement: Whitefield vs Banaswadi
            </h4>
            <span className="text-xs text-slate-400 font-medium">Independent Ledgers</span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            {/* Whitefield Column */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs">Whitefield Kitchen</span>
                <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded">
                  Branch
                </span>
              </div>
              <div className="text-xl font-black text-slate-900">
                {formatINR(wfMetrics.totalLandedIngredientPurchases)}
              </div>
              <div className="text-[11px] text-slate-600 space-y-1 border-t border-slate-200 pt-2">
                <div className="flex justify-between">
                  <span>Hyperpure:</span>
                  <span className="font-bold">{formatINR(wfMetrics.hyperpurePurchases)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Local Produce:</span>
                  <span className="font-bold">{formatINR(wfMetrics.localVegetablePurchases)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Chicken &amp; Mutton:</span>
                  <span className="font-bold">
                    {formatINR(wfMetrics.chickenPurchases + wfMetrics.muttonPurchases)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Fish:</span>
                  <span className="font-bold">{formatINR(wfMetrics.fishPurchases)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Porter Freight:</span>
                  <span className="font-bold text-teal-700">
                    {formatINR(wfMetrics.ingredientFreight)}
                  </span>
                </div>
              </div>
            </div>

            {/* Banaswadi Column */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs">Banaswadi Kitchen</span>
                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                  Main
                </span>
              </div>
              <div className="text-xl font-black text-slate-900">
                {formatINR(bwMetrics.totalLandedIngredientPurchases)}
              </div>
              <div className="text-[11px] text-slate-600 space-y-1 border-t border-slate-200 pt-2">
                <div className="flex justify-between">
                  <span>Hyperpure:</span>
                  <span className="font-bold">{formatINR(bwMetrics.hyperpurePurchases)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Local Produce:</span>
                  <span className="font-bold">{formatINR(bwMetrics.localVegetablePurchases)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Chicken &amp; Mutton:</span>
                  <span className="font-bold">
                    {formatINR(bwMetrics.chickenPurchases + bwMetrics.muttonPurchases)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Fish:</span>
                  <span className="font-bold">{formatINR(bwMetrics.fishPurchases)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Porter Freight:</span>
                  <span className="font-bold text-teal-700">
                    {formatINR(bwMetrics.ingredientFreight)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick takeaway note */}
          <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs text-indigo-950 flex items-center justify-between">
            <span>
              {bwMetrics.totalLandedIngredientPurchases > 0 || wfMetrics.totalLandedIngredientPurchases > 0 ? (
                <>
                  <strong>Protein Comparison:</strong> Banaswadi spends {formatINR(bwMetrics.chickenPurchases + bwMetrics.muttonPurchases)} vs Whitefield {formatINR(wfMetrics.chickenPurchases + wfMetrics.muttonPurchases)} on fresh chicken &amp; mutton.
                </>
              ) : (
                <span>
                  No purchases recorded yet for {monthToUse}. Click <strong>&ldquo;+ Add Purchase Entry&rdquo;</strong> to log your Hyperpure invoices, mandi vegetables, meat, fish, or Porter transportation bills.
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Stock Audit & Inventory Management Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Physical Stock Audit &amp; Inventory Balances ({monthToUse})
              {metrics.hasInventoryData ? (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                  Stock Count Verified
                </span>
              ) : (
                <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                  Pending Verification
                </span>
              )}
            </h4>
            <p className="text-xs text-slate-500">
              Required to calculate View C: Exact Inventory-Based Actual COGS (Opening + Landed Purchases − Closing).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsInventoryEditorOpen(true)}
            className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Boxes className="w-4 h-4" />
            <span>Update Physical Stock Balances</span>
          </button>
        </div>
      </div>

      {/* Inventory Editor Modal */}
      {isInventoryEditorOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Update Physical Stock Balances ({monthToUse})
              </h3>
              <button
                onClick={() => setIsInventoryEditorOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Opening Inventory Value (₹) — 1st of Month
                </label>
                <input
                  type="number"
                  value={openingInvInput}
                  onChange={(e) => setOpeningInvInput(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Closing Inventory Value (₹) — End of Month Physical Count
                </label>
                <input
                  type="number"
                  value={closingInvInput}
                  onChange={(e) => setClosingInvInput(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Purchase Returns / Supplier Credits (₹)
                </label>
                <input
                  type="number"
                  value={returnsInput}
                  onChange={(e) => setReturnsInput(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold"
                />
              </div>

              <div className="p-3 bg-purple-50 rounded-xl text-purple-900 text-xs">
                <strong>Inventory COGS Formula:</strong> Opening ({formatINR(openingInvInput)}) + Landed Purchases ({formatINR(metrics.totalLandedIngredientPurchases)}) − Closing ({formatINR(closingInvInput)}) = <strong>{formatINR(Math.max(0, openingInvInput + metrics.totalLandedIngredientPurchases - closingInvInput - returnsInput))}</strong>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsInventoryEditorOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveInventory}
                className="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md"
              >
                Save &amp; Verify Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Table: Monthly Purchase Register */}
      <PurchaseRegisterTable
        currentOutlet={currentOutlet}
        selectedMonth={monthToUse}
        purchases={purchases}
        onOpenAddModal={() => {
          setEditingPurchase(null);
          setIsAddModalOpen(true);
        }}
        onEditPurchase={(record) => {
          setEditingPurchase(record);
          setIsAddModalOpen(true);
        }}
        onDeletePurchase={handleDeletePurchase}
        onOpenPorterAllocation={handleOpenPorter}
        onSelectOutlet={onSelectOutlet}
      />

      {/* Add / Edit Purchase Modal */}
      <AddEditPurchaseModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingPurchase(null);
        }}
        onSavePurchase={handleSavePurchase}
        existingPurchase={editingPurchase}
        existingPurchases={purchases}
        currentOutlet={currentOutlet === 'consolidated' ? 'whitefield' : currentOutlet}
        selectedMonth={monthToUse}
        customCategories={customCategories}
        onAddCustomCategory={handleAddCustomCategory}
      />

      {/* Porter Freight Allocation Modal */}
      {isPorterModalOpen && selectedPorterRecord && (
        <PorterFreightAllocationModal
          isOpen={isPorterModalOpen}
          onClose={() => {
            setIsPorterModalOpen(false);
            setSelectedPorterRecord(null);
          }}
          porterRecord={selectedPorterRecord}
          purchases={purchases}
          onApplyAllocation={handleApplyPorterAllocation}
        />
      )}
    </div>
  );
};
