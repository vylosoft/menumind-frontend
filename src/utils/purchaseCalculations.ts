/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PurchaseRecord,
  InventorySnapshot,
  MonthlyPurchaseSummaryMetrics,
  PorterAllocationMethod,
  FoodCostingBasis,
  PurchaseAuditEntry,
} from '../types/purchases';
import { OutletId } from '../types/finance';
import {
  DEMO_PURCHASES_DATASET,
  DEMO_INVENTORY_SNAPSHOTS,
  INITIAL_CUSTOM_CATEGORIES,
} from '../data/demoPurchasesDataset';

const STORAGE_KEY_PURCHASES = 'menumind_purchases_v1';
const STORAGE_KEY_CUSTOM_CATEGORIES = 'menumind_purchase_categories_v1';
const STORAGE_KEY_INVENTORY = 'menumind_inventory_snapshots_v1';
const STORAGE_KEY_COSTING_BASIS = 'menumind_food_costing_basis_v1';
const STORAGE_KEY_AUDIT_LOG = 'menumind_purchase_audit_v1';

/**
 * Retrieve saved purchases or return empty list.
 */
export function getSavedPurchases(): PurchaseRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PURCHASES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Filter out any demo baseline records that were previously saved in browser cache
        return parsed.filter(
          (p: any) => !p.id?.startsWith('PUR-WF-') && !p.id?.startsWith('PUR-BW-')
        );
      }
    }
  } catch (e) {
    console.error('Failed to load purchases from localStorage', e);
  }
  return [];
}

export function savePurchases(records: PurchaseRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PURCHASES, JSON.stringify(records));
  } catch (e) {
    console.error('Failed to save purchases to localStorage', e);
  }
}

/**
 * Retrieve custom categories list.
 */
export function getSavedCustomCategories(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_CATEGORIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Failed to load custom categories', e);
  }
  return INITIAL_CUSTOM_CATEGORIES;
}

export function saveCustomCategories(categories: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_CATEGORIES, JSON.stringify(categories));
  } catch (e) {
    console.error('Failed to save custom categories', e);
  }
}

/**
 * Retrieve inventory stock audit snapshots or return empty list.
 */
export function getSavedInventorySnapshots(): InventorySnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INVENTORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s: any) => !s.id?.startsWith('SNAP-'));
      }
    }
  } catch (e) {
    console.error('Failed to load inventory snapshots', e);
  }
  return [];
}

export function saveInventorySnapshots(snapshots: InventorySnapshot[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(snapshots));
  } catch (e) {
    console.error('Failed to save inventory snapshots', e);
  }
}

/**
 * Retrieve active P&L food costing basis.
 */
export function getSavedFoodCostingBasis(): FoodCostingBasis {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COSTING_BASIS);
    if (raw === 'recipe_based' || raw === 'purchase_based' || raw === 'inventory_based') {
      return raw;
    }
  } catch (e) {}
  return 'recipe_based'; // Default primary method
}

export function saveFoodCostingBasis(basis: FoodCostingBasis): void {
  try {
    localStorage.setItem(STORAGE_KEY_COSTING_BASIS, basis);
  } catch (e) {}
}

/**
 * Retrieve audit log entries.
 */
export function getSavedPurchaseAuditLog(): PurchaseAuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUDIT_LOG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

export function addPurchaseAuditLog(entry: Omit<PurchaseAuditEntry, 'id' | 'timestamp'>): void {
  try {
    const prev = getSavedPurchaseAuditLog();
    const newEntry: PurchaseAuditEntry = {
      ...entry,
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY_AUDIT_LOG, JSON.stringify([newEntry, ...prev].slice(0, 500)));
  } catch (e) {}
}

/**
 * Checks for potential duplicate if adding a monthly summary entry for a category that already has detailed line items.
 */
export function checkDuplicateCategorySummary(
  existingPurchases: PurchaseRecord[],
  outletId: 'banaswadi' | 'whitefield',
  month: string,
  category: string
): { hasRisk: boolean; lineCount: number; currentTotal: number } {
  const matching = existingPurchases.filter(
    (p) =>
      p.outletId === outletId &&
      p.month === month &&
      p.category.toLowerCase() === category.toLowerCase() &&
      !p.isMonthlySummaryEntry
  );
  if (matching.length > 0) {
    const currentTotal = matching.reduce((sum, p) => sum + p.netAmount, 0);
    return { hasRisk: true, lineCount: matching.length, currentTotal };
  }
  return { hasRisk: false, lineCount: 0, currentTotal: 0 };
}

/**
 * Computes monthly purchase summary metrics for an outlet.
 */
export function computeMonthlyPurchaseSummary(
  allPurchases: PurchaseRecord[],
  inventorySnapshots: InventorySnapshot[],
  outlet: OutletId,
  month: string = '2026-10',
  recipeBasedCOGS: number = 0,
  netRevenue: number = 0
): MonthlyPurchaseSummaryMetrics {
  const isConsolidated = outlet === 'consolidated';

  const relevantPurchases = allPurchases.filter((p) => {
    if (p.month !== month) return false;
    if (isConsolidated) return true;
    return p.outletId === outlet;
  });

  let hyperpurePurchases = 0;
  let localVegetablePurchases = 0;
  let chickenPurchases = 0;
  let muttonPurchases = 0;
  let fishPurchases = 0;
  let miscFoodPurchases = 0;
  let ingredientFreight = 0;
  let packagingPurchases = 0;
  let otherNonFoodPurchases = 0;
  let totalPaymentsMade = 0;
  let outstandingSupplierPayables = 0;

  relevantPurchases.forEach((p) => {
    // Effective net amount for costing (net of recoverable tax)
    const costAmt = p.netAmount;
    totalPaymentsMade += p.paidAmount || 0;
    outstandingSupplierPayables += p.balancePayable || 0;

    // Classification filtering
    if (p.classification === 'ingredient_freight' || p.category === 'Porter') {
      ingredientFreight += costAmt;
    } else if (p.classification === 'packaging' || p.category.toLowerCase().includes('packaging')) {
      packagingPurchases += costAmt;
    } else if (
      p.classification === 'kitchen_consumable' ||
      p.classification === 'operating_expense' ||
      p.classification === 'asset_purchase'
    ) {
      otherNonFoodPurchases += costAmt;
    } else if (p.classification === 'food_ingredient') {
      // Breakdown by food category
      const cat = p.category.toLowerCase();
      if (cat.includes('hyperpure')) {
        hyperpurePurchases += costAmt;
      } else if (cat.includes('veg') || cat.includes('vegetable')) {
        localVegetablePurchases += costAmt;
      } else if (cat.includes('chicken')) {
        chickenPurchases += costAmt;
      } else if (cat.includes('mutton')) {
        muttonPurchases += costAmt;
      } else if (cat.includes('fish') || cat.includes('seafood')) {
        fishPurchases += costAmt;
      } else {
        miscFoodPurchases += costAmt;
      }
    }
  });

  const totalIngredientPurchases =
    hyperpurePurchases +
    localVegetablePurchases +
    chickenPurchases +
    muttonPurchases +
    fishPurchases +
    miscFoodPurchases;

  const totalLandedIngredientPurchases = totalIngredientPurchases + ingredientFreight;

  // Inventory-based calculation
  let inventoryBasedCOGS: number | undefined = undefined;
  let hasInventoryData = false;

  const relevantInventory = inventorySnapshots.filter((inv) => {
    if (inv.month !== month) return false;
    if (isConsolidated) return true;
    return inv.outletId === outlet;
  });

  if (relevantInventory.length > 0) {
    const totalOpening = relevantInventory.reduce((s, i) => s + i.openingInventoryValue, 0);
    const totalClosing = relevantInventory.reduce((s, i) => s + i.closingInventoryValue, 0);
    const totalReturns = relevantInventory.reduce((s, i) => s + i.purchaseReturns, 0);
    
    // COGS = Opening + Net Landed Purchases - Closing - Returns
    inventoryBasedCOGS = Math.max(0, totalOpening + totalLandedIngredientPurchases - totalClosing - totalReturns);
    hasInventoryData = true;
  }

  const purchaseBasedCOGSProxy = totalLandedIngredientPurchases;
  const cogsVarianceRecipeVsPurchases = purchaseBasedCOGSProxy - recipeBasedCOGS;
  const foodCostRatioToRevenue = netRevenue > 0 ? (totalLandedIngredientPurchases / netRevenue) * 100 : 0;

  // Determine approval status
  let approvalStatus: 'Draft' | 'Under Review' | 'Approved' | 'Locked' = 'Approved';
  if (relevantPurchases.some((p) => p.approvalStatus === 'Draft')) {
    approvalStatus = 'Draft';
  } else if (relevantPurchases.some((p) => p.approvalStatus === 'Under Review')) {
    approvalStatus = 'Under Review';
  } else if (relevantPurchases.every((p) => p.approvalStatus === 'Locked')) {
    approvalStatus = 'Locked';
  }

  return {
    outletId: outlet,
    month,
    hyperpurePurchases,
    localVegetablePurchases,
    chickenPurchases,
    muttonPurchases,
    fishPurchases,
    miscFoodPurchases,
    ingredientFreight,
    packagingPurchases,
    otherNonFoodPurchases,
    totalIngredientPurchases,
    totalLandedIngredientPurchases,
    totalPaymentsMade,
    outstandingSupplierPayables,
    recipeBasedCOGS,
    purchaseBasedCOGSProxy,
    inventoryBasedCOGS,
    hasInventoryData,
    cogsVarianceRecipeVsPurchases,
    foodCostRatioToRevenue,
    approvalStatus,
    lineItemsCount: relevantPurchases.length,
  };
}

/**
 * Distributes Porter Freight across selected target purchases.
 */
export function allocatePorterFreight(
  porterAmount: number,
  targetPurchases: PurchaseRecord[],
  method: PorterAllocationMethod,
  manualAllocations: Record<string, number> = {}
): Record<string, number> {
  const result: Record<string, number> = {};
  if (targetPurchases.length === 0 || porterAmount <= 0) return result;

  if (method === 'value_ratio') {
    const totalValue = targetPurchases.reduce((s, p) => s + p.netAmount, 0);
    if (totalValue > 0) {
      let allocatedSoFar = 0;
      targetPurchases.forEach((p, idx) => {
        if (idx === targetPurchases.length - 1) {
          result[p.id] = Math.round(porterAmount - allocatedSoFar);
        } else {
          const share = Math.round((p.netAmount / totalValue) * porterAmount);
          result[p.id] = share;
          allocatedSoFar += share;
        }
      });
      return result;
    }
  } else if (method === 'weight_ratio') {
    const totalWeight = targetPurchases.reduce((s, p) => s + (p.quantity || 0), 0);
    if (totalWeight > 0) {
      let allocatedSoFar = 0;
      targetPurchases.forEach((p, idx) => {
        if (idx === targetPurchases.length - 1) {
          result[p.id] = Math.round(porterAmount - allocatedSoFar);
        } else {
          const share = Math.round(((p.quantity || 0) / totalWeight) * porterAmount);
          result[p.id] = share;
          allocatedSoFar += share;
        }
      });
      return result;
    }
  } else if (method === 'manual') {
    return manualAllocations;
  }

  // Equal split fallback
  const share = Math.round(porterAmount / targetPurchases.length);
  targetPurchases.forEach((p) => {
    result[p.id] = share;
  });
  return result;
}
