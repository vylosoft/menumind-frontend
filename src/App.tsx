import { appUrl } from './lib/appUrl';
import React, { useState, useMemo, useEffect } from 'react';
import { posSalesApi } from './lib/ingestionApi';
import {
  GroupingRule,
  ParentDish,
  RawSalesRecord,
  ReconciliationReport,
} from './types/restaurant';
import {
  DEMO_COST_PRESETS,
  generateDemoSalesRecords,
} from './data/demoPetpoojaDataset';
import {
  DEFAULT_RECIPES,
  DEFAULT_FIXED_OPERATING_COSTS,
  COMMODITY_WATCHLIST,
} from './data/defaultRecipes';
import {
  DishRecipe,
  FixedOperatingCosts,
  IngredientPriceWatch,
} from './types/recipe';
import { mergeSalesRecords } from './utils/petpoojaParser';
import { aggregateSalesByParentDish } from './utils/salesAggregator';
import { generateDemandForecasts } from './utils/forecastingEngine';
import {
  getSavedGroupingRules,
  saveGroupingRules,
  getSavedDishGroupingConfirmed,
  saveDishGroupingConfirmed,
  getSavedRecipesFromStorage,
  saveRecipesToStorage,
} from './utils/dishNormalizer';
import { exportFullExcelReport } from './utils/exportHelpers';

// Layout & View Components
import { NavTab, Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewView } from './components/OverviewView';
import { UploadView } from './components/UploadView';
import { DishGroupingView } from './components/DishGroupingView';
import { DishPerformanceView } from './components/DishPerformanceView';
import { MonthlyTrendsView } from './components/MonthlyTrendsView';
import { MenuEngineeringView } from './components/MenuEngineeringView';
import { DemandForecastingView } from './components/DemandForecastingView';
import { GrowthOpportunitiesView } from './components/GrowthOpportunitiesView';
import { RemovalSimulatorView } from './components/RemovalSimulatorView';
import { AIBusinessAdvisorView } from './components/AIBusinessAdvisorView';
import { ReportsExportsView } from './components/ReportsExportsView';
import { VerificationTestView } from './components/VerificationTestView';
import { CostEditorModal } from './components/CostEditorModal';
import { SupabaseSyncModal } from './components/SupabaseSyncModal';

// Enhanced Recipe & Profitability Module Views
import { RecipeCostingView } from './components/RecipeCostingView';
import { ProfitabilityCommandCenterView } from './components/ProfitabilityCommandCenterView';
import { SmartPricingLabView } from './components/SmartPricingLabView';
import { IngredientRiskMonitorView } from './components/IngredientRiskMonitorView';
import { BreakEvenIntelligenceView } from './components/BreakEvenIntelligenceView';
import { FinanceCommandCenter } from './components/finance/FinanceCommandCenter';
import { BulkCateringDashboard } from './components/catering/BulkCateringDashboard';
import { StaffDirectoryManager } from './components/payroll/StaffDirectoryManager';
import { PurchaseCOGSExecutiveDashboard } from './components/finance/purchases/PurchaseCOGSExecutiveDashboard';
import { OperatingExpensesManager } from './components/operating/OperatingExpensesManager';

import { CateringOrder } from './types/catering';
import { StaffMember } from './types/payrollStaff';
import { OutletOperatingExpenseItem } from './types/operatingCosts';
import { PurchaseRecord, InventorySnapshot, FoodCostingBasis } from './types/purchases';
import { DEMO_CATERING_ORDERS } from './data/demoCateringDataset';
import { INITIAL_STAFF_DIRECTORY } from './data/demoStaffDirectory';
import { DEMO_PURCHASES_DATASET, DEMO_INVENTORY_SNAPSHOTS } from './data/demoPurchasesDataset';
import { getSavedStaffDirectory, saveStaffDirectory } from './utils/payrollStaffManager';
import {
  getSavedPurchases,
  savePurchases,
  getSavedInventorySnapshots,
  saveInventorySnapshots,
  getSavedFoodCostingBasis,
  saveFoodCostingBasis,
} from './utils/purchaseCalculations';
import {
  getSavedOperatingExpenses,
  saveOperatingExpenses,
} from './utils/operatingOverheadManager';
import { PlatformPayoutRecord } from './types/finance';
import { getSavedPayouts, savePayouts } from './utils/payoutManager';
import {
  mergeWithDefaultMappings,
  saveAggregatorMappings,
} from './utils/aggregatorMappingManager';

const EMPTY_RECONCILIATION: ReconciliationReport = {
  totalFiles: 0,
  fileNames: [],
  totalRawRows: 0,
  validRows: 0,
  invalidRows: 0,
  duplicatesSkipped: 0,
  returnsOrCancelledCount: 0,
  returnsRevenueExcluded: 0,
  totalReportedRevenue: 0,
  isNetSales: true,
  totalUnitsSold: 0,
  uniqueRawItems: 0,
  uniqueParentDishes: 0,
  detectedGranularity: 'daily',
  monthsPresent: [],
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  const [isDemoLoaded, setIsDemoLoaded] = useState(false);

  // Raw records & reconciliation (clean blank start)
  const [rawRecords, setRawRecords] = useState<RawSalesRecord[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationReport>(EMPTY_RECONCILIATION);

  // User-approved taxonomy grouping rules
  const [groupingRules, setGroupingRules] = useState<GroupingRule[]>(() => {
    return getSavedGroupingRules();
  });

  // Grouping view mode: 'dish' (standard Dish Grouping for Highest Selling) vs 'outlet' (Outlet Grouping for Item-wise Sales with trailing 'W')
  const [groupingMode, setGroupingMode] = useState<'dish' | 'outlet'>('dish');

  // Track whether user has confirmed Dish Grouping for Recipe Costing & BOM
  const [isDishGroupingConfirmed, setIsDishGroupingConfirmed] = useState<boolean>(() => {
    return getSavedDishGroupingConfirmed();
  });

  // Recipe costing, fixed overhead & commodities state (persisted in localStorage & Supabase)
  const [recipes, setRecipes] = useState<DishRecipe[]>(() => {
    return getSavedRecipesFromStorage<DishRecipe>();
  });

  const handleUpdateRecipes = (updated: DishRecipe[]) => {
    setRecipes(updated);
    saveRecipesToStorage(updated);
  };

  const [fixedCosts, setFixedCosts] = useState<FixedOperatingCosts>(DEFAULT_FIXED_OPERATING_COSTS);
  const [watchlist, setWatchlist] = useState<IngredientPriceWatch[]>(COMMODITY_WATCHLIST);

  // Cost overrides dictionary (clean start)
  const [costOverrides, setCostOverrides] = useState<Record<string, any>>({});

  // Bulk Catering Orders State with LocalStorage Persistence (clean start, excluding demo)
  const [cateringOrders, setCateringOrders] = useState<CateringOrder[]>(() => {
    try {
      const raw = localStorage.getItem('menumind_catering_orders_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((o: any) => !o.id?.startsWith('CAT-2026-'));
        }
      }
    } catch (e) {
      console.error('Failed to load catering orders from localStorage', e);
    }
    return [];
  });

  const handleUpdateCateringOrders = (updated: CateringOrder[]) => {
    setCateringOrders(updated);
    try {
      localStorage.setItem('menumind_catering_orders_v1', JSON.stringify(updated));
    } catch (e) {}
  };

  // Staff Directory State with LocalStorage Persistence (clean start, excluding demo)
  const [staffDirectory, setStaffDirectory] = useState<StaffMember[]>(() => {
    return getSavedStaffDirectory();
  });

  const handleUpdateStaffDirectory = (updated: StaffMember[]) => {
    setStaffDirectory(updated);
    saveStaffDirectory(updated);
  };

  // Purchases & COGS State with LocalStorage Persistence (clean start, excluding demo)
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(() => {
    return getSavedPurchases();
  });

  const handleUpdatePurchases = (updated: PurchaseRecord[]) => {
    setPurchases(updated);
    savePurchases(updated);
  };

  const [inventorySnapshots, setInventorySnapshots] = useState<InventorySnapshot[]>(() => {
    return getSavedInventorySnapshots();
  });

  const handleUpdateInventorySnapshots = (updated: InventorySnapshot[]) => {
    setInventorySnapshots(updated);
    saveInventorySnapshots(updated);
  };

  const [costingBasis, setCostingBasis] = useState<FoodCostingBasis>(() => {
    return getSavedFoodCostingBasis();
  });

  const handleUpdateCostingBasis = (basis: FoodCostingBasis) => {
    setCostingBasis(basis);
    saveFoodCostingBasis(basis);
  };

  // Kitchen Operating Overheads State with LocalStorage Persistence
  const [operatingExpenses, setOperatingExpenses] = useState<OutletOperatingExpenseItem[]>(() => {
    return getSavedOperatingExpenses();
  });

  const handleUpdateOperatingExpenses = (updated: OutletOperatingExpenseItem[]) => {
    setOperatingExpenses(updated);
    saveOperatingExpenses(updated);
  };

  // Platform Aggregator Payout Statements (Swiggy, Zomato, Ownly)
  const [payouts, setPayouts] = useState<PlatformPayoutRecord[]>(() => {
    return getSavedPayouts();
  });

  const handleUpdatePayouts = (updated: PlatformPayoutRecord[]) => {
    setPayouts(updated);
    savePayouts(updated);
  };

  // Selected dish for inspection modal
  const [inspectedDish, setInspectedDish] = useState<ParentDish | null>(null);

  // Supabase Sync & Connection Modal
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  // Notification toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Auto-retrieve records from Supabase database tables on initial application load
  useEffect(() => {
    let isCancelled = false;
    const autoPullFromSupabase = async () => {
      try {
        const res = await fetch(appUrl('/api/supabase/pull'));
        if (!res.ok) return;
        const result = await res.json();
        if (isCancelled || !result.success || !result.data) return;

        const cloud = result.data;
        let staffCount = 0;

        // 1. Staff Directory & October Wages
        if (Array.isArray(cloud.staffDirectory) && cloud.staffDirectory.length > 0) {
          handleUpdateStaffDirectory(cloud.staffDirectory);
          staffCount = cloud.staffDirectory.length;
        }

        // 2. Kitchen Operating Overheads
        if (Array.isArray(cloud.operatingExpenses) && cloud.operatingExpenses.length > 0) {
          handleUpdateOperatingExpenses(cloud.operatingExpenses);
        }

        // 3. Catering Orders
        if (Array.isArray(cloud.cateringOrders) && cloud.cateringOrders.length > 0) {
          handleUpdateCateringOrders(cloud.cateringOrders);
        }

        // 4. Purchases & Inventory
        if (Array.isArray(cloud.purchases) && cloud.purchases.length > 0) {
          handleUpdatePurchases(cloud.purchases);
        }
        if (Array.isArray(cloud.inventorySnapshots) && cloud.inventorySnapshots.length > 0) {
          handleUpdateInventorySnapshots(cloud.inventorySnapshots);
        }

        // 5. Dish Grouping Rules, Recipes & Fixed Costs
        if (Array.isArray(cloud.groupingRules) && cloud.groupingRules.length > 0) {
          setGroupingRules(cloud.groupingRules);
          saveGroupingRules(cloud.groupingRules);
          setIsDishGroupingConfirmed(true);
          saveDishGroupingConfirmed(true);
        }
        if (Array.isArray(cloud.recipes) && cloud.recipes.length > 0) {
          handleUpdateRecipes(cloud.recipes);
        }
        if (cloud.fixedCosts) {
          setFixedCosts(cloud.fixedCosts);
        }

        // 6. Platform Payouts & Aggregator Restaurant ID Mappings
        if (Array.isArray(cloud.payouts) && cloud.payouts.length > 0) {
          handleUpdatePayouts(cloud.payouts);
        }
        if (Array.isArray(cloud.aggregatorMappings) && cloud.aggregatorMappings.length > 0) {
          saveAggregatorMappings(mergeWithDefaultMappings(cloud.aggregatorMappings));
        }

        // 7. POS Sales Records
        if (Array.isArray(cloud.rawRecords) && cloud.rawRecords.length > 0) {
          setRawRecords(cloud.rawRecords);
          if (cloud.reconciliation) {
            setReconciliation(cloud.reconciliation);
          }
        }

        if (staffCount > 0 || (cloud.payouts?.length || 0) > 0) {
          showToast(
            `Synchronized ${staffCount} staff & ${cloud.payouts?.length || 0} payout statements from Supabase!`
          );
        }
      } catch (err) {
        console.warn('Initial Supabase auto-pull skipped (offline or initial boot):', err);
      }
    };

    autoPullFromSupabase();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Re-reads every saved POS upload from the database so the screen never shows stale or doubled rows.
  const applyStoredSales = (records: RawSalesRecord[]) => {
    const { mergedRecords, reconciliation: rec } = mergeSalesRecords(
      Object.entries(
        records.reduce<Record<string, RawSalesRecord[]>>((acc, r) => {
          (acc[r.sourceFile] ||= []).push(r);
          return acc;
        }, {})
      ).map(([fileName, recs]) => ({ fileName, records: recs, invalidCount: 0 }))
    );
    setRawRecords(mergedRecords);
    setReconciliation(rec);
    return rec;
  };

  const reloadSalesFromDb = async () => {
    try {
      const records = await posSalesApi.fetchAllRecords();
      if (records.length > 0) applyStoredSales(records);
    } catch (err: any) {
      if (err?.status && err.status !== 0) {
        showToast(`Could not reload saved sales: ${err?.message || 'unknown error'}`);
      }
    }
  };

  // Hydrate POS sales & platform payouts from the MenuMind API if running
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Payout statements are loaded from Supabase by the brand-aware pull above (server.ts);
        // the API only supplies the saved Petpooja POS rows here, so the two never overwrite each other.
        const records = await posSalesApi.fetchAllRecords();
        if (cancelled) return;
        if (records.length > 0) {
          const { mergedRecords, reconciliation: rec } = mergeSalesRecords(
            Object.entries(
              records.reduce<Record<string, RawSalesRecord[]>>((acc, r) => {
                (acc[r.sourceFile] ||= []).push(r);
                return acc;
              }, {})
            ).map(([fileName, recs]) => ({ fileName, records: recs, invalidCount: 0 }))
          );
          setRawRecords(mergedRecords);
          setReconciliation(rec);
          setGroupingMode(rec.hasOutletGrouping ? 'outlet' : 'dish');
        }
      } catch (err: any) {
        if (!cancelled && err?.status && err.status !== 0) {
          showToast(`Could not load saved uploads: ${err?.message || 'unknown error'}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Manual one-click pull function from Supabase tables
  const handleManualPullSupabase = async () => {
    try {
      showToast('Retrieving latest records from Supabase tables...');
      const res = await fetch(appUrl('/api/supabase/pull'));
      const result = await res.json();
      if (res.ok && result.success && result.data) {
        const cloud = result.data;
        let staffCount = 0;

        if (Array.isArray(cloud.staffDirectory) && cloud.staffDirectory.length > 0) {
          handleUpdateStaffDirectory(cloud.staffDirectory);
          staffCount = cloud.staffDirectory.length;
        }
        if (Array.isArray(cloud.operatingExpenses) && cloud.operatingExpenses.length > 0) {
          handleUpdateOperatingExpenses(cloud.operatingExpenses);
        }
        if (Array.isArray(cloud.cateringOrders) && cloud.cateringOrders.length > 0) {
          handleUpdateCateringOrders(cloud.cateringOrders);
        }
        if (Array.isArray(cloud.purchases) && cloud.purchases.length > 0) {
          handleUpdatePurchases(cloud.purchases);
        }
        if (Array.isArray(cloud.inventorySnapshots) && cloud.inventorySnapshots.length > 0) {
          handleUpdateInventorySnapshots(cloud.inventorySnapshots);
        }
        if (Array.isArray(cloud.groupingRules) && cloud.groupingRules.length > 0) {
          setGroupingRules(cloud.groupingRules);
          saveGroupingRules(cloud.groupingRules);
          setIsDishGroupingConfirmed(true);
          saveDishGroupingConfirmed(true);
        }
        if (Array.isArray(cloud.recipes) && cloud.recipes.length > 0) {
          handleUpdateRecipes(cloud.recipes);
        }
        if (cloud.fixedCosts) {
          setFixedCosts(cloud.fixedCosts);
        }
        if (Array.isArray(cloud.payouts) && cloud.payouts.length > 0) {
          handleUpdatePayouts(cloud.payouts);
        }
        if (Array.isArray(cloud.aggregatorMappings) && cloud.aggregatorMappings.length > 0) {
          saveAggregatorMappings(mergeWithDefaultMappings(cloud.aggregatorMappings));
        }
        if (Array.isArray(cloud.rawRecords) && cloud.rawRecords.length > 0) {
          setRawRecords(cloud.rawRecords);
          if (cloud.reconciliation) {
            setReconciliation(cloud.reconciliation);
          }
        }
        showToast(
          staffCount > 0
            ? `Successfully retrieved ${staffCount} staff members & payouts from Supabase!`
            : 'Synchronized with Supabase tables!'
        );
      } else {
        showToast(result.error || 'No records returned from Supabase.');
      }
    } catch (e: any) {
      showToast(`Error retrieving from Supabase: ${e.message}`);
    }
  };

  // Merge confirmed recipe unit costs with explicit costOverrides so all modules stay in sync
  const effectiveCostOverrides = useMemo(() => {
    const combined: Record<string, any> = { ...costOverrides };
    recipes.forEach((r) => {
      if (r.parentDishName && r.totalVariableCostPerPortion >= 0) {
        combined[r.parentDishName] = {
          ...(combined[r.parentDishName] || {}),
          unitCost: r.totalVariableCostPerPortion,
        };
      }
    });
    return combined;
  }, [costOverrides, recipes]);

  // Aggregated data derivation
  const {
    parentDishes,
    totalRevenue,
    totalQuantity,
    averageDishRevenue,
    averageDishQuantity,
    averageContributionMargin,
  } = useMemo(() => {
    return aggregateSalesByParentDish(rawRecords, groupingRules, {
      stripPrefixes: true,
      costOverrides: effectiveCostOverrides,
    });
  }, [rawRecords, groupingRules, effectiveCostOverrides]);

  // Forecasts derivation
  const forecasts = useMemo(() => {
    return generateDemandForecasts(
      parentDishes,
      30,
      reconciliation.detectedGranularity
    );
  }, [parentDishes, reconciliation.detectedGranularity]);

  // Handler for custom uploaded sales data
  const handleDataLoaded = (
    newRecords: RawSalesRecord[],
    newReconciliation: ReconciliationReport,
    uploadType?: 'outlet' | 'highest_selling'
  ) => {
    setRawRecords(newRecords);
    setReconciliation(newReconciliation);
    setIsDemoLoaded(false);

    // If uploading Sales Data (Item-wise Sales Report / preset 'petpooja-item-wise' or trailing 'W' records detected):
    // Switch to 'outlet' (Outlet Grouping).
    // If uploading Highest Selling items ('petpooja-highest-selling'):
    // Switch to 'dish' (Dish Grouping Review).
    const isOutlet = uploadType === 'outlet' || Boolean(newReconciliation.hasOutletGrouping);
    setGroupingMode(isOutlet ? 'outlet' : 'dish');
    if (!isOutlet) {
      // Require user to review & confirm Dish Grouping for newly uploaded Highest Selling items
      setIsDishGroupingConfirmed(false);
      saveDishGroupingConfirmed(false);
    }
    setCurrentTab('grouping'); // Move to grouping review next as required

    if (isOutlet) {
      showToast(
        `Loaded ${newRecords.length} records! Outlet Grouping active: Whitefield (trailing 'W') & Banaswadi.`
      );
    } else {
      showToast(
        `Processed ${newRecords.length} POS rows! Confirm Dish Grouping below to unlock Recipe Costing.`
      );
    }

    // Records were already parsed and persisted by the MenuMind API during upload.
    // Show everything that is saved (all months / files), not only this upload.
    void reloadSalesFromDb();
  };

  // Handler to load demo dataset on demand
  const handleLoadDemoData = () => {
    const demo = generateDemoSalesRecords();
    const { reconciliation: rec } = mergeSalesRecords([
      { fileName: 'Petpooja_Sales_May_Oct_2026.xlsx', records: demo, invalidCount: 0 },
    ]);
    setRawRecords(demo);
    setReconciliation(rec);
    handleUpdateRecipes(DEFAULT_RECIPES);
    setCostOverrides(DEMO_COST_PRESETS);
    setCateringOrders(DEMO_CATERING_ORDERS);
    setStaffDirectory(INITIAL_STAFF_DIRECTORY);
    setPurchases(DEMO_PURCHASES_DATASET);
    setInventorySnapshots(DEMO_INVENTORY_SNAPSHOTS);
    setIsDishGroupingConfirmed(true);
    saveDishGroupingConfirmed(true);
    setIsDemoLoaded(true);
    showToast('Loaded 6-Month Petpooja Demo Dataset with recipe costing, catering & purchases!');
  };

  // Handler to clear all data and reset to completely fresh blank state
  const handleClearAllData = () => {
    try {
      localStorage.removeItem('menumind_catering_orders_v1');
      localStorage.removeItem('menumind_staff_directory_v1');
      localStorage.removeItem('menumind_payroll_snapshots_v1');
      localStorage.removeItem('menumind_payroll_audit_v1');
      localStorage.removeItem('menumind_purchases_v1');
      localStorage.removeItem('menumind_inventory_snapshots_v1');
      localStorage.removeItem('menumind_expenses_v1');
      localStorage.removeItem('menumind_payroll_records_v1');
      localStorage.removeItem('menumind_platform_payouts_v1');
      localStorage.removeItem('menumind_platform_payouts_v2');
      localStorage.removeItem('menumind_grouping_rules_v1');
      localStorage.removeItem('menumind_dish_grouping_rules_v1');
      localStorage.removeItem('menumind_dish_grouping_confirmed_v1');
      localStorage.removeItem('menumind_recipes_v1');
      localStorage.removeItem('menumind_outlet_overheads_v1');
    } catch (e) {}

    setRawRecords([]);
    setPayouts([]);
    setReconciliation(EMPTY_RECONCILIATION);
    setRecipes([]);
    setGroupingRules([]);
    setIsDishGroupingConfirmed(false);
    setCostOverrides({});
    setCateringOrders([]);
    setStaffDirectory([]);
    setPurchases([]);
    setInventorySnapshots([]);
    setOperatingExpenses(getSavedOperatingExpenses());
    setIsDemoLoaded(false);
    showToast('All demo and session data removed. Ready for your actual restaurant files.');
  };

  const handleUpdateRules = (newRules: GroupingRule[]) => {
    setGroupingRules(newRules);
    saveGroupingRules(newRules);
    showToast('Updated dish grouping rules and re-aggregated menu metrics.');
  };

  // Lock & confirm unique Parent Dishes + variations for Recipe Costing & persist to Supabase
  const handleConfirmDishGrouping = (navigateToRecipeCosting = false) => {
    const lockedRules = [...groupingRules];
    parentDishes.forEach((dish) => {
      dish.variants.forEach((v) => {
        const existingIdx = lockedRules.findIndex(
          (r) => r.pattern.toLowerCase().trim() === v.rawName.toLowerCase().trim()
        );
        if (existingIdx >= 0) {
          lockedRules[existingIdx] = {
            ...lockedRules[existingIdx],
            parentDishName: dish.name,
            variantName: v.variantName,
            isUserApproved: true,
          };
        } else {
          lockedRules.push({
            id: `rule-conf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            pattern: v.rawName,
            parentDishName: dish.name,
            variantName: v.variantName,
            isUserApproved: true,
            confidence: 100,
            matchType: 'manual',
          });
        }
      });
    });

    setGroupingRules(lockedRules);
    saveGroupingRules(lockedRules);
    setIsDishGroupingConfirmed(true);
    saveDishGroupingConfirmed(true);

    // Sync confirmed unique dishes & grouping rules to Supabase in background
    void fetch(appUrl('/api/supabase/sync'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantName: 'MenuMind Grand Dining',
        parentDishes,
        groupingRules: lockedRules,
        recipes,
      }),
    }).catch(() => {});

    if (navigateToRecipeCosting) {
      setCurrentTab('recipe-costing');
    }
    showToast(
      `Confirmed ${parentDishes.length} unique dishes for Recipe Costing & BOM!`
    );
  };

  const handleExportExcel = () => {
    exportFullExcelReport(parentDishes, forecasts, reconciliation, 'MenuMind Restaurant', recipes, fixedCosts);
    showToast('Downloading comprehensive Excel analysis report...');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans text-slate-800 antialiased selection:bg-teal-500 selection:text-white">
      {/* Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        dishCount={parentDishes.length}
        totalRevenue={totalRevenue}
        groupingMode={groupingMode}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Top Header */}
        <Header
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          onLoadDemoData={handleLoadDemoData}
          onClearAllData={handleClearAllData}
          isDemoLoaded={isDemoLoaded}
          reconciliation={reconciliation}
          onExportExcel={handleExportExcel}
          onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
          groupingMode={groupingMode}
        />

        {/* Viewport Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Executive & Profitability Views */}
          {currentTab === 'overview' && (
            <OverviewView
              parentDishes={parentDishes}
              totalRevenue={totalRevenue}
              totalQuantity={totalQuantity}
              reconciliation={reconciliation}
              onSelectTab={setCurrentTab}
              onSelectDish={setInspectedDish}
            />
          )}

          {currentTab === 'finance' && (
            <FinanceCommandCenter
              parentDishes={parentDishes}
              recipes={recipes}
              reconciliation={reconciliation}
              cateringOrders={cateringOrders}
              onUpdateCateringOrders={handleUpdateCateringOrders}
              staffDirectory={staffDirectory}
              onUpdateStaffDirectory={handleUpdateStaffDirectory}
              purchases={purchases}
              onUpdatePurchases={handleUpdatePurchases}
              inventorySnapshots={inventorySnapshots}
              onUpdateInventorySnapshots={handleUpdateInventorySnapshots}
              costingBasis={costingBasis}
              onChangeCostingBasis={handleUpdateCostingBasis}
              payouts={payouts}
              onUpdatePayouts={handleUpdatePayouts}
              operatingExpenses={operatingExpenses}
              rawRecords={rawRecords}
              onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
            />
          )}

          {currentTab === 'purchases' && (
            <PurchaseCOGSExecutiveDashboard
              currentOutlet="consolidated"
              onSelectOutlet={() => {}}
              purchases={purchases}
              onUpdatePurchases={handleUpdatePurchases}
              inventorySnapshots={inventorySnapshots}
              onUpdateInventorySnapshots={handleUpdateInventorySnapshots}
              costingBasis={costingBasis}
              onChangeCostingBasis={handleUpdateCostingBasis}
              parentDishes={parentDishes}
              recipes={recipes}
              netRevenue={totalRevenue}
              onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
            />
          )}

          {currentTab === 'catering' && (
            <BulkCateringDashboard
              orders={cateringOrders}
              onUpdateOrders={handleUpdateCateringOrders}
              parentDishes={parentDishes}
              recipes={recipes}
              onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
            />
          )}

          {currentTab === 'staff' && (
            <StaffDirectoryManager
              staff={staffDirectory}
              onUpdateStaff={handleUpdateStaffDirectory}
              onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
              onPullFromSupabase={handleManualPullSupabase}
            />
          )}

          {currentTab === 'profit-center' && (
            <ProfitabilityCommandCenterView
              parentDishes={parentDishes}
              recipes={recipes}
              onNavigate={(tab) => setCurrentTab(tab as NavTab)}
            />
          )}

          {/* Recipe & Unit Economics Views */}
          {currentTab === 'recipe-costing' && (
            <RecipeCostingView
              recipes={recipes}
              parentDishes={parentDishes}
              groupingRules={groupingRules}
              isDishGroupingConfirmed={isDishGroupingConfirmed}
              onConfirmDishGrouping={handleConfirmDishGrouping}
              onUpdateRules={handleUpdateRules}
              onNavigateTab={(tab) => setCurrentTab(tab as NavTab)}
              onUpdateRecipes={(updated) => {
                handleUpdateRecipes(updated);
              }}
            />
          )}

          {currentTab === 'smart-pricing' && (
            <SmartPricingLabView
              parentDishes={parentDishes}
              recipes={recipes}
            />
          )}

          {currentTab === 'ingredient-risk' && (
            <IngredientRiskMonitorView
              parentDishes={parentDishes}
              recipes={recipes}
              watchlist={watchlist}
              onUpdateWatchlist={setWatchlist}
            />
          )}

          {currentTab === 'operating-costs' && (
            <OperatingExpensesManager
              expenses={operatingExpenses}
              onUpdateExpenses={handleUpdateOperatingExpenses}
              staffDirectory={staffDirectory}
              onNavigateToBreakEven={() => setCurrentTab('break-even')}
              onNavigateToStaff={() => setCurrentTab('staff')}
              onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
            />
          )}

          {currentTab === 'break-even' && (
            <BreakEvenIntelligenceView
              parentDishes={parentDishes}
              recipes={recipes}
              staffDirectory={staffDirectory}
              operatingExpenses={operatingExpenses}
              fixedCosts={fixedCosts}
              onUpdateFixedCosts={setFixedCosts}
              onNavigateToOverheads={() => setCurrentTab('operating-costs')}
              onNavigateToStaff={() => setCurrentTab('staff')}
              payouts={payouts}
            />
          )}

          {/* POS Ingestion & Grouping Review */}
          {currentTab === 'upload' && (
            <UploadView
              onDataLoaded={handleDataLoaded}
              onLoadDemoData={handleLoadDemoData}
              onClearAllData={handleClearAllData}
              currentReconciliation={reconciliation}
              rawRecords={rawRecords}
              parentDishes={parentDishes}
              payouts={payouts}
              onUpdatePayouts={handleUpdatePayouts}
              purchases={purchases}
              cateringOrders={cateringOrders}
              staffDirectory={staffDirectory}
              operatingExpenses={operatingExpenses}
              onNavigateTab={(tab) => setCurrentTab(tab as NavTab)}
              onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
            />
          )}

          {currentTab === 'grouping' && (
            <DishGroupingView
              parentDishes={parentDishes}
              groupingRules={groupingRules}
              onUpdateRules={handleUpdateRules}
              onRefreshAggregation={() => {}}
              rawRecords={rawRecords}
              groupingMode={groupingMode}
              onToggleGroupingMode={setGroupingMode}
              isGroupingConfirmed={isDishGroupingConfirmed}
              onConfirmDishGrouping={handleConfirmDishGrouping}
            />
          )}

          {currentTab === 'performance' && (
            <DishPerformanceView
              parentDishes={parentDishes}
              onSelectDish={setInspectedDish}
            />
          )}

          {currentTab === 'monthly' && (
            <MonthlyTrendsView
              parentDishes={parentDishes}
              reconciliation={reconciliation}
            />
          )}

          {/* Strategy, Forecasting & Optimization */}
          {currentTab === 'engineering' && (
            <MenuEngineeringView
              parentDishes={parentDishes}
              averageDishQuantity={averageDishQuantity}
              averageDishRevenue={averageDishRevenue}
              averageContributionMargin={averageContributionMargin}
              onUpdateCostOverrides={setCostOverrides}
              currentCostOverrides={costOverrides}
            />
          )}

          {currentTab === 'forecasting' && (
            <DemandForecastingView
              parentDishes={parentDishes}
              reconciliation={reconciliation}
            />
          )}

          {currentTab === 'opportunities' && (
            <GrowthOpportunitiesView
              parentDishes={parentDishes}
              recipes={recipes}
              onSelectDish={setInspectedDish}
            />
          )}

          {currentTab === 'removal' && (
            <RemovalSimulatorView parentDishes={parentDishes} />
          )}

          {currentTab === 'advisor' && (
            <AIBusinessAdvisorView
              parentDishes={parentDishes}
              reconciliation={reconciliation}
              totalRevenue={totalRevenue}
              totalQuantity={totalQuantity}
              recipes={recipes}
              fixedCosts={fixedCosts}
            />
          )}

          {currentTab === 'reports' && (
            <ReportsExportsView
              parentDishes={parentDishes}
              forecasts={forecasts}
              reconciliation={reconciliation}
              groupingRules={groupingRules}
              totalRevenue={totalRevenue}
              totalQuantity={totalQuantity}
              recipes={recipes}
              fixedCosts={fixedCosts}
            />
          )}

          {currentTab === 'verification' && <VerificationTestView />}
        </main>
      </div>

      {/* Dish Inspection Modal */}
      {inspectedDish && (
        <CostEditorModal
          dish={inspectedDish}
          isOpen={true}
          onClose={() => setInspectedDish(null)}
          onSaveCost={(dishName, costs) => {
            setCostOverrides((prev) => ({ ...prev, [dishName]: costs }));
            showToast(`Updated cost parameters for "${dishName}".`);
          }}
        />
      )}

      {/* Supabase PostgreSQL Cloud Sync Modal */}
      <SupabaseSyncModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        restaurantName="MenuMind Grand Dining"
        parentDishes={parentDishes}
        recipes={recipes}
        fixedCosts={fixedCosts}
        groupingRules={groupingRules}
        reconciliation={reconciliation}
        operatingExpenses={operatingExpenses}
        staffDirectory={staffDirectory}
        cateringOrders={cateringOrders}
        purchases={purchases}
        inventorySnapshots={inventorySnapshots}
        rawRecords={rawRecords}
        payouts={payouts}
        onDataLoadedFromCloud={(cloudData) => {
          if (Array.isArray(cloudData.operatingExpenses) && cloudData.operatingExpenses.length > 0) {
            handleUpdateOperatingExpenses(cloudData.operatingExpenses);
          }
          if (Array.isArray(cloudData.staffDirectory) && cloudData.staffDirectory.length > 0) {
            handleUpdateStaffDirectory(cloudData.staffDirectory);
          }
          if (Array.isArray(cloudData.cateringOrders) && cloudData.cateringOrders.length > 0) {
            handleUpdateCateringOrders(cloudData.cateringOrders);
          }
          if (Array.isArray(cloudData.purchases) && cloudData.purchases.length > 0) {
            handleUpdatePurchases(cloudData.purchases);
          }
          if (Array.isArray(cloudData.payouts) && cloudData.payouts.length > 0) {
            handleUpdatePayouts(cloudData.payouts);
          }
          if (Array.isArray(cloudData.aggregatorMappings) && cloudData.aggregatorMappings.length > 0) {
            saveAggregatorMappings(mergeWithDefaultMappings(cloudData.aggregatorMappings));
          }
          if (Array.isArray(cloudData.inventorySnapshots) && cloudData.inventorySnapshots.length > 0) {
            handleUpdateInventorySnapshots(cloudData.inventorySnapshots);
          }
          if (Array.isArray(cloudData.groupingRules) && cloudData.groupingRules.length > 0) {
            setGroupingRules(cloudData.groupingRules);
            saveGroupingRules(cloudData.groupingRules);
            setIsDishGroupingConfirmed(true);
            saveDishGroupingConfirmed(true);
          }
          if (Array.isArray(cloudData.recipes) && cloudData.recipes.length > 0) {
            handleUpdateRecipes(cloudData.recipes);
          }
          if (cloudData.fixedCosts) {
            setFixedCosts(cloudData.fixedCosts);
          }
          if (Array.isArray(cloudData.rawRecords) && cloudData.rawRecords.length > 0) {
            setRawRecords(cloudData.rawRecords);
            if (cloudData.reconciliation) {
              setReconciliation(cloudData.reconciliation);
            }
          }
          showToast('Synchronized all modules with latest data from Supabase cloud!');
        }}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-teal-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
