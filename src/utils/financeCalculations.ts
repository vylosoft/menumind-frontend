import { RawSalesRecord } from '../types/restaurant';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  OutletId,
  PlatformPayoutRecord,
  MonthlyExpenseItem,
  EmployeePayrollRecord,
  MonthlyPnLStatement,
  BreakEvenAnalysis,
  ProfitSimulationScenario,
} from '../types/finance';
import { ParentDish } from '../types/restaurant';
import { DishRecipe } from '../types/recipe';
import {
  BRAND_FILTER_RULES,
  OCTOBER_2026_BENCHMARKS,
  WHITEFIELD_EXPENSES_BASELINE,
  BANASWADI_EXPENSES_BASELINE,
  WHITEFIELD_PAYROLL_BASELINE,
  BANASWADI_PAYROLL_BASELINE,
  SAMPLE_PLATFORM_PAYOUTS,
} from '../data/financeBaseline';

/**
 * Format numbers according to Indian Currency notation (Lakhs & Crores):
 * e.g. 472527 -> ₹4,72,527
 */
export function formatINR(amount: number, showDecimals: boolean = false): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '₹0';
  }
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  const [intPart, decPart] = absAmount.toFixed(showDecimals ? 2 : 0).split('.');
  
  // Format Indian numbering: last 3 digits, then groups of 2 digits
  let lastThree = intPart.substring(intPart.length - 3);
  const otherNumbers = intPart.substring(0, intPart.length - 3);
  let formattedInt = lastThree;
  if (otherNumbers !== '') {
    formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
  }

  const result = showDecimals && decPart ? `${formattedInt}.${decPart}` : formattedInt;
  return isNegative ? `-₹${result}` : `₹${result}`;
}

/**
 * Format percentages: e.g. 0.245 -> 24.5% or 24.5 -> 24.5%
 */
export function formatPct(val: number, isDecimal: boolean = false): string {
  if (isNaN(val) || val === null || val === undefined) return '0.0%';
  const num = isDecimal ? val * 100 : val;
  return `${num.toFixed(1)}%`;
}

/**
 * Determines which outlet a brand name belongs to.
 * Suffix rule: Brand ending with -w or -W -> Whitefield, else Banaswadi
 */
export function getOutletForBrand(brandName: string): 'banaswadi' | 'whitefield' {
  const trimmed = brandName.trim();
  if (trimmed.endsWith('-w') || trimmed.endsWith('-W') || trimmed.toLowerCase().includes('whitefield')) {
    return 'whitefield';
  }
  return 'banaswadi';
}

/**
 * Checks whether a brand name is active for financial reporting.
 * 'House Of Terreti' is inactive and excluded.
 */
export function isBrandActive(brandName: string): boolean {
  const normalized = brandName.trim().toLowerCase();
  if (normalized.includes('house of terreti') || normalized.includes('terreti')) {
    return false;
  }
  const match = BRAND_FILTER_RULES.find(
    (b) => b.brandName.toLowerCase() === brandName.trim().toLowerCase()
  );
  if (match) return match.isActive;
  return true;
}

/**
 * Automatically repairs `#REF!` and broken Excel formula strings in imported cells.
 */
export function repairExcelRefFormula(value: any, fallbackValue: number = 0): { repairedValue: number; wasRepaired: boolean } {
  if (typeof value === 'string') {
    if (value.includes('#REF!') || value.includes('#VALUE!') || value.includes('#DIV/0!')) {
      return { repairedValue: fallbackValue, wasRepaired: true };
    }
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
    if (!isNaN(parsed)) {
      return { repairedValue: parsed, wasRepaired: false };
    }
  } else if (typeof value === 'number') {
    if (isNaN(value)) {
      return { repairedValue: fallbackValue, wasRepaired: true };
    }
    return { repairedValue: value, wasRepaired: false };
  }
  return { repairedValue: fallbackValue, wasRepaired: false };
}

/**
 * Calculate individual payroll record with the strict ₹130/day food allowance rule:
 * - 5 non-manager roles are eligible @ ₹130/day (max ₹3,900/month per employee, ₹19,500 total).
 * - Managers are strictly NOT eligible.
 * - Insurance is ₹1,500/month.
 */
export function computeEmployeePayroll(record: EmployeePayrollRecord): EmployeePayrollRecord {
  const isEligible = record.roleCategory !== 'manager' && record.isFoodAllowanceEligible;
  const foodAllowance = isEligible
    ? record.daysWorkedInMonth * (record.foodAllowanceRatePerDay || 130)
    : 0;
  
  const insurance = record.insuranceBenefitMonthly || 1500;
  const netPayable =
    record.baseSalary +
    foodAllowance +
    insurance +
    (record.otherAllowances || 0) -
    (record.deductions || 0);

  return {
    ...record,
    isFoodAllowanceEligible: isEligible,
    calculatedFoodAllowance: foodAllowance,
    netPayableSalary: netPayable,
  };
}

import { CateringOrder } from '../types/catering';
import { StaffMember } from '../types/payrollStaff';
import { PurchaseRecord, InventorySnapshot, FoodCostingBasis } from '../types/purchases';
import { getValidCateringForPnL } from './cateringCalculations';
import { aggregatePayrollForPnL } from './payrollStaffManager';
import { computeMonthlyPurchaseSummary, getSavedPurchases, getSavedInventorySnapshots } from './purchaseCalculations';

/**
 * Computes consolidated monthly P&L statement for Banaswadi, Whitefield, and Consolidated.
 * Supports non-Petpooja bulk catering revenue recognition, authoritative staff payroll,
 * and selectable Food Costing Basis (Recipe BOM, Landed Purchases, or Stock-Audited Inventory).
 */
export function generateMonthlyPnL(
  month: string = '2026-10',
  outlet: OutletId,
  parentDishes: ParentDish[],
  recipes: DishRecipe[],
  expenses: MonthlyExpenseItem[],
  payroll: EmployeePayrollRecord[],
  payouts: PlatformPayoutRecord[],
  cateringOrders: CateringOrder[] = [],
  includeCatering: boolean = true,
  staffList?: StaffMember[],
  purchasesList?: PurchaseRecord[],
  inventorySnapshots?: InventorySnapshot[],
  foodCostingBasis: FoodCostingBasis = 'recipe_based',
  salesRecords: RawSalesRecord[] = []
): MonthlyPnLStatement {
  const isWhitefield = outlet === 'whitefield';
  const isBanaswadi = outlet === 'banaswadi';
  const isConsolidated = outlet === 'consolidated';

  // Benchmark fallback / grounding
  const bwBenchmark = OCTOBER_2026_BENCHMARKS.banaswadi;
  const wfBenchmark = OCTOBER_2026_BENCHMARKS.whitefield;

  let grossSales = 0;
  let totalOrders = 0;
  let customerDiscounts = 0;
  let returnsAndCancellations = 0;

  // Platform statements for THIS month (and outlet) only
  const relevantPayouts = payouts.filter((p) => {
    if (p.month && p.month !== month) return false;
    if (isConsolidated) return true;
    return p.outletId === outlet;
  });

  // Petpooja POS rows saved for this month (and outlet): the sales source of truth
  const monthSales = (salesRecords || []).filter((r) => {
    if (!r.date || String(r.date).slice(0, 7) !== month) return false;
    if (isConsolidated) return true;
    return String(r.outlet || '').toLowerCase() === outlet;
  });

  if (monthSales.length > 0) {
    monthSales.forEach((r) => {
      const rev = Number(r.revenue) || 0;
      const disc = Number(r.discount) || 0;
      if (r.isReturnOrCancelled) {
        returnsAndCancellations += Math.abs(rev);
        return;
      }
      // Net-sales rows already exclude discount; gross rows carry it separately
      grossSales += r.isNetSales ? rev + disc : rev;
      customerDiscounts += disc;
      totalOrders += Number(r.quantity) || 0;
    });
    totalOrders = Math.round(totalOrders);
  } else if (relevantPayouts.length > 0) {
    grossSales = relevantPayouts.reduce((sum, p) => sum + p.grossSales, 0);
    customerDiscounts = relevantPayouts.reduce((sum, p) => sum + p.customerDiscounts, 0);
    returnsAndCancellations = relevantPayouts.reduce((sum, p) => sum + p.cancellationCharges, 0);
    totalOrders = relevantPayouts.reduce((sum, p) => sum + p.orderCount, 0);
  } else if (parentDishes && parentDishes.length > 0) {
    // Derive from actual uploaded Petpooja POS dishes if available
    grossSales = parentDishes.reduce((sum, d) => sum + d.totalRevenue, 0);
    totalOrders = Math.round(parentDishes.reduce((sum, d) => sum + d.totalQuantity, 0));
    customerDiscounts = 0;
    returnsAndCancellations = 0;
  } else {
    // Clean zero baseline — no synthetic demo data
    grossSales = 0;
    totalOrders = 0;
    customerDiscounts = 0;
    returnsAndCancellations = 0;
  }

  const netSalesRevenue = Math.max(0, grossSales - customerDiscounts - returnsAndCancellations);
  const averageOrderValue = totalOrders > 0 ? Math.round(netSalesRevenue / totalOrders) : 0;

  // 1. Calculate Recipe-Based COGS (Primary BOM Standard)
  let recipeFoodCOGS = 0;
  let packagingCosts = 0;

  if (parentDishes && parentDishes.length > 0) {
    let totalDishRevenue = 0;
    let totalDishCost = 0;
    let totalDishPackaging = 0;

    parentDishes.forEach((d) => {
      // Find matching recipe if any
      const recipe = recipes.find(
        (r) => r.parentDishName.toLowerCase() === d.name.toLowerCase()
      );
      const dishCost = recipe ? recipe.totalIngredientCost : d.unitCost || d.averageRealizedPrice * 0.3;
      const packCost = recipe ? recipe.packagingCost : d.packagingCost || 8.5;

      totalDishRevenue += d.totalRevenue;
      totalDishCost += dishCost * d.totalQuantity;
      totalDishPackaging += packCost * d.totalQuantity;
    });

    const cogsRatio = totalDishRevenue > 0 ? totalDishCost / totalDishRevenue : 0.315;
    const packRatio = totalDishRevenue > 0 ? totalDishPackaging / totalDishRevenue : 0.038;

    recipeFoodCOGS = Math.round(netSalesRevenue * cogsRatio);
    packagingCosts = Math.round(netSalesRevenue * packRatio);
  } else {
    recipeFoodCOGS = Math.round(netSalesRevenue * 0.315);
    packagingCosts = Math.round(netSalesRevenue * 0.038);
  }

  // 2. Calculate Purchase-Based & Inventory-Based Costing from Purchase Register
  const effectivePurchases = purchasesList ?? getSavedPurchases();
  const effectiveInventory = inventorySnapshots ?? getSavedInventorySnapshots();
  const purchaseSummary = computeMonthlyPurchaseSummary(
    effectivePurchases,
    effectiveInventory,
    outlet,
    month,
    recipeFoodCOGS,
    netSalesRevenue
  );

  const purchaseLandedFoodCOGS = purchaseSummary.totalLandedIngredientPurchases;
  const inventoryFoodCOGS = purchaseSummary.inventoryBasedCOGS;

  // Determine active rawMaterialCOGS based on user-selected basis
  let rawMaterialCOGS = recipeFoodCOGS;
  let costingBasisLabel = 'Recipe-Based COGS (Primary BOM Standard)';
  let costingDataStatus: 'actual_stock_audited' | 'provisional_purchase_proxy' | 'estimated_recipe_bom' =
    'estimated_recipe_bom';

  if (foodCostingBasis === 'purchase_based') {
    rawMaterialCOGS = purchaseLandedFoodCOGS > 0 ? purchaseLandedFoodCOGS : recipeFoodCOGS;
    costingBasisLabel = 'Purchase-Based Proxy (Landed Food Purchases)';
    costingDataStatus = 'provisional_purchase_proxy';
  } else if (
    foodCostingBasis === 'inventory_based' &&
    purchaseSummary.hasInventoryData &&
    inventoryFoodCOGS !== undefined &&
    inventoryFoodCOGS > 0
  ) {
    rawMaterialCOGS = inventoryFoodCOGS;
    costingBasisLabel = 'Inventory-Based COGS (Physical Stock Audited)';
    costingDataStatus = 'actual_stock_audited';
  } else {
    rawMaterialCOGS = recipeFoodCOGS;
    costingBasisLabel = 'Recipe-Based COGS (Primary BOM Standard)';
    costingDataStatus = 'estimated_recipe_bom';
  }

  const totalCOGS = rawMaterialCOGS + packagingCosts;
  const grossProfit = netSalesRevenue - totalCOGS;
  const grossProfitPercentage = netSalesRevenue > 0 ? (grossProfit / netSalesRevenue) * 100 : 0;
  const rawMaterialPercentage = netSalesRevenue > 0 ? (rawMaterialCOGS / netSalesRevenue) * 100 : 0;
  const packagingPercentage = netSalesRevenue > 0 ? (packagingCosts / netSalesRevenue) * 100 : 0;

  // Platform commissions and variable delivery costs
  let platformCommissions = 0;
  let platformTaxesAndFees = 0;
  let deliveryShareCosts = 0;
  let hyperpureSupplierOffset = 0;

  // Per outlet: actual platform statements when uploaded for this month, otherwise the standard blended
  // estimate on that outlet's own sales (so one outlet's statement never hides the other outlet's costs).
  const outletsInScope: string[] = isConsolidated ? ['banaswadi', 'whitefield'] : [outlet];
  const outletNetSales = (o: string) => {
    if (monthSales.length === 0) return isConsolidated ? 0 : netSalesRevenue;
    return monthSales
      .filter((r) => String(r.outlet || '').toLowerCase() === o && !r.isReturnOrCancelled)
      .reduce((sum, r) => sum + (Number(r.revenue) || 0) - (r.isNetSales ? 0 : Number(r.discount) || 0), 0);
  };
  outletsInScope.forEach((o) => {
    const ps = relevantPayouts.filter((p) => p.outletId === o);
    if (ps.length > 0) {
      platformCommissions += ps.reduce((sum, p) => sum + p.commissionAmount, 0);
      platformTaxesAndFees += ps.reduce(
        (sum, p) => sum + p.gstOnCommission + p.paymentGatewayFee + p.otherPlatformFees + p.advertisingSpend,
        0
      );
      deliveryShareCosts += ps.reduce((sum, p) => sum + p.customerDeliveryFeeShare, 0);
      hyperpureSupplierOffset += ps.reduce((sum, p) => sum + p.hyperpureRecovery, 0);
    } else {
      // Standard blended 21.5% commission and 5.8% platform fees
      const base = isConsolidated && monthSales.length === 0 ? netSalesRevenue / outletsInScope.length : outletNetSales(o);
      platformCommissions += Math.round(base * 0.215);
      platformTaxesAndFees += Math.round(base * 0.058);
      deliveryShareCosts += Math.round(base * 0.024);
    }
  });
  platformCommissions = Math.round(platformCommissions);
  platformTaxesAndFees = Math.round(platformTaxesAndFees);
  deliveryShareCosts = Math.round(deliveryShareCosts);

  const totalVariableChannelCosts = platformCommissions + platformTaxesAndFees + deliveryShareCosts;
  const platformCommissionPercentage = netSalesRevenue > 0 ? (platformCommissions / netSalesRevenue) * 100 : 0;

  // Contribution Margin
  const contributionMargin = grossProfit - totalVariableChannelCosts;
  const contributionMarginPercentage = netSalesRevenue > 0 ? (contributionMargin / netSalesRevenue) * 100 : 0;

  // Filter expenses and payroll by outlet
  const relevantExpenses = expenses.filter((e) => {
    if (isConsolidated) return true;
    return e.outletId === outlet;
  });

  const relevantPayroll = payroll.filter((p) => {
    if (isConsolidated) return true;
    return p.outletId === outlet;
  });

  // Calculate Fixed Operating Period Expenses
  let kitchenRent = 0;
  let staffAccommodation = 0;
  let staffSalaries = 0;
  let staffFoodAllowances = 0;
  let staffInsurance = 0;
  let electricityExpense = 0;
  let lpgGasExpense = 0;
  let tankerAndKitchenWater = 0;
  let sanitationAndCleaning = 0;
  let posAndInternetTech = 0;
  let otherFixedExpenses = 0;

  // Aggregate from expense items
  relevantExpenses.forEach((exp) => {
    const amt = exp.actualAmount > 0 ? exp.actualAmount : exp.budgetAmount;
    if (exp.category === 'Rent & Property') {
      kitchenRent += amt;
    } else if (exp.category === 'Staff & Accommodation' && exp.name.toLowerCase().includes('quarters')) {
      staffAccommodation += amt;
    } else if (exp.category === 'Utilities & Energy') {
      if (exp.name.toLowerCase().includes('lpg') || exp.name.toLowerCase().includes('gas')) {
        lpgGasExpense += amt;
      } else {
        electricityExpense += amt;
      }
    } else if (exp.category === 'Kitchen Supplies & Water') {
      tankerAndKitchenWater += amt;
    } else if (exp.category === 'Sanitation & Hygiene') {
      sanitationAndCleaning += amt;
    } else if (exp.category === 'Technology & POS') {
      posAndInternetTech += amt;
    } else if (exp.category !== 'Staff & Accommodation') {
      otherFixedExpenses += amt;
    }
  });

  // If authoritative staff directory provided, use it; otherwise fallback to existing payroll array
  if (staffList && staffList.length > 0) {
    const agg = aggregatePayrollForPnL(staffList, month, outlet as any);
    staffSalaries = agg.salariesTotal;
    staffFoodAllowances = agg.foodAllowancesTotal;
    staffInsurance = agg.insuranceTotal;
  } else {
    // Aggregate from payroll records
    relevantPayroll.forEach((emp) => {
      staffSalaries += emp.baseSalary;
      staffFoodAllowances += emp.calculatedFoodAllowance;
      staffInsurance += emp.insuranceBenefitMonthly;
    });
  }

  // If accommodation was not captured separately in expenses, check Whitefield/Banaswadi baseline
  if (staffAccommodation === 0) {
    if (isWhitefield) staffAccommodation = 32000;
    else if (isBanaswadi) staffAccommodation = 28000;
    else staffAccommodation = 60000;
  }

  const totalFixedOperatingExpenses =
    kitchenRent +
    staffAccommodation +
    staffSalaries +
    staffFoodAllowances +
    staffInsurance +
    electricityExpense +
    lpgGasExpense +
    tankerAndKitchenWater +
    sanitationAndCleaning +
    posAndInternetTech +
    otherFixedExpenses;

  // Catering Direct Revenue Integration (Direct Sales -> Bulk Catering)
  let nonPetpoojaCateringRevenue = 0;
  let cateringDirectCosts = 0;
  let cateringContribution = 0;
  let cateringOrdersCount = 0;

  if (includeCatering && cateringOrders && cateringOrders.length > 0) {
    const cat = getValidCateringForPnL(cateringOrders, month, outlet as any);
    nonPetpoojaCateringRevenue = cat.cateringNetRevenue;
    cateringDirectCosts = cat.cateringDirectCosts;
    cateringContribution = cat.cateringContribution;
    cateringOrdersCount = cat.cateringOrderCount;
  }

  const totalRecognizedOutletRevenue = netSalesRevenue + nonPetpoojaCateringRevenue;
  const finalContributionMargin = contributionMargin + cateringContribution;

  // Operating Net Profit / EBITDA
  const operatingProfitOrLoss = finalContributionMargin - totalFixedOperatingExpenses;
  const operatingProfitMarginPercentage =
    totalRecognizedOutletRevenue > 0 ? (operatingProfitOrLoss / totalRecognizedOutletRevenue) * 100 : 0;

  const outletName =
    outlet === 'whitefield'
      ? 'Whitefield Kitchen'
      : outlet === 'banaswadi'
      ? 'Banaswadi Kitchen'
      : 'Consolidated Chain Total';

  return {
    month,
    outletId: outlet,
    outletName,
    grossSalesPetpooja: grossSales,
    customerDiscounts,
    returnsAndCancellations,
    netSalesRevenue,
    totalOrders,
    averageOrderValue,
    rawMaterialCOGS,
    rawMaterialPercentage,
    packagingCosts,
    packagingPercentage,
    totalCOGS,
    grossProfit,
    grossProfitPercentage,
    platformCommissions,
    platformCommissionPercentage,
    platformTaxesAndFees,
    deliveryShareCosts,
    totalVariableChannelCosts,
    contributionMargin: finalContributionMargin,
    contributionMarginPercentage:
      totalRecognizedOutletRevenue > 0
        ? (finalContributionMargin / totalRecognizedOutletRevenue) * 100
        : contributionMarginPercentage,
    kitchenRent,
    staffAccommodation,
    staffSalaries,
    staffFoodAllowances,
    staffInsurance,
    electricityExpense,
    lpgGasExpense,
    tankerAndKitchenWater,
    sanitationAndCleaning,
    posAndInternetTech,
    otherFixedExpenses,
    totalFixedOperatingExpenses,
    operatingProfitOrLoss,
    operatingProfitMarginPercentage,
    hyperpureSupplierOffset,
    nonPetpoojaCateringRevenue,
    cateringDirectCosts,
    cateringContribution,
    cateringOrdersCount,
    totalRecognizedOutletRevenue,
    // Selectable Food Costing Basis Fields
    foodCostingBasis,
    recipeFoodCOGS,
    purchaseLandedFoodCOGS,
    inventoryFoodCOGS,
    costingBasisLabel,
    costingDataStatus,
    foodCostVarianceVsRecipe: purchaseLandedFoodCOGS - recipeFoodCOGS,
    approvalStatus: 'Draft',
  };
}

/**
 * Break-Even Intelligence calculation:
 * Computes weighted contribution margin ratio and determines required monthly & daily sales.
 * Supports dual views: (1) Restaurant sales only, and (2) Including recognized catering contribution.
 */
export function computeBreakEvenAnalysis(
  pnl: MonthlyPnLStatement,
  daysInMonth: number = 30,
  includeCatering: boolean = true
): BreakEvenAnalysis {
  const totalFixedCosts = pnl.totalFixedOperatingExpenses;
  const effectiveBaseRevenue = pnl.netSalesRevenue || 1;
  const contributionMarginRatio =
    effectiveBaseRevenue > 0 ? pnl.contributionMargin / (pnl.totalRecognizedOutletRevenue || effectiveBaseRevenue) : 0.42;

  // 1. Restaurant-only monthly break-even
  const restaurantOnlyBreakEvenMonthly =
    contributionMarginRatio > 0 ? Math.round(totalFixedCosts / contributionMarginRatio) : 0;

  // 2. Break-even when catering contribution is credited toward fixed overhead
  const cateringContribution = includeCatering && pnl.cateringContribution ? pnl.cateringContribution : 0;
  const netFixedCostsAfterCatering = Math.max(0, totalFixedCosts - cateringContribution);

  const breakEvenNetRevenueMonthly =
    contributionMarginRatio > 0 ? Math.round(netFixedCostsAfterCatering / contributionMarginRatio) : 0;

  const breakEvenNetRevenueDaily = Math.round(breakEvenNetRevenueMonthly / daysInMonth);

  const aov = pnl.averageOrderValue || 450;
  const breakEvenOrdersMonthly = Math.round(breakEvenNetRevenueMonthly / aov);
  const breakEvenOrdersDaily = Math.round(breakEvenNetRevenueDaily / aov);

  const actualRevenue = pnl.totalRecognizedOutletRevenue || pnl.netSalesRevenue;
  const revenueSurplusOrDeficit = actualRevenue - (includeCatering ? breakEvenNetRevenueMonthly : restaurantOnlyBreakEvenMonthly);
  const targetThreshold = includeCatering ? breakEvenNetRevenueMonthly : restaurantOnlyBreakEvenMonthly;
  const breakEvenAchievedPercentage =
    targetThreshold > 0 ? (actualRevenue / targetThreshold) * 100 : 100;

  const currentDailyPace = actualRevenue / daysInMonth;
  const daysToBreakEvenAtCurrentPace =
    currentDailyPace > 0
      ? Math.min(daysInMonth, Math.ceil(targetThreshold / currentDailyPace))
      : 0;

  return {
    outletId: pnl.outletId,
    month: pnl.month,
    totalFixedCosts,
    weightedContributionMarginRatio: contributionMarginRatio,
    breakEvenNetRevenueMonthly,
    breakEvenNetRevenueDaily,
    breakEvenOrdersMonthly,
    breakEvenOrdersDaily,
    actualNetRevenue: actualRevenue,
    revenueSurplusOrDeficit,
    breakEvenAchievedPercentage,
    daysToBreakEvenAtCurrentPace,
    restaurantOnlyBreakEvenMonthly,
    cateringContributionCredited: cateringContribution,
    netFixedCostsAfterCatering,
  };
}

/**
 * Profit Simulation Engine:
 * Simulates adjustments (direct order shift, price bump, COGS trim, ad spend cut).
 */
export function simulateProfitScenario(
  basePnl: MonthlyPnLStatement,
  scenario: {
    directOrderShiftPct: number; // e.g. 10 (shift 10% from Swiggy/Zomato to Ownly/Direct)
    menuPriceIncreasePct: number; // e.g. 5 (+5% price)
    cogsReductionPct: number; // e.g. 3 (-3% on food cost)
    adSpendReductionPct: number; // e.g. 20 (-20% ad budget)
  }
): ProfitSimulationScenario {
  const currentNetSales = basePnl.netSalesRevenue;

  // Price increase effect on revenue (assuming slight price elasticity factor of 0.8)
  const priceMultiplier = 1 + (scenario.menuPriceIncreasePct / 100) * 0.85;
  const projectedNetRevenue = Math.round(currentNetSales * priceMultiplier);

  // COGS adjusted
  const cogsMultiplier = 1 - scenario.cogsReductionPct / 100;
  const projectedCOGS = Math.round(basePnl.totalCOGS * cogsMultiplier);

  // Direct order shift saves on average 18% in commissions for shifted revenue
  const commissionSavingsRate = 0.18;
  const shiftedVolume = currentNetSales * (scenario.directOrderShiftPct / 100);
  const commissionSavings = shiftedVolume * commissionSavingsRate;

  // Ad spend reduction
  const currentAdSpend = basePnl.platformTaxesAndFees * 0.25; // approx portion that is ads
  const adSavings = currentAdSpend * (scenario.adSpendReductionPct / 100);

  const projectedVariableCosts = Math.max(
    0,
    basePnl.totalVariableChannelCosts - commissionSavings - adSavings
  );

  const projectedGrossProfit = projectedNetRevenue - projectedCOGS;
  const projectedContributionMargin = projectedGrossProfit - projectedVariableCosts;
  const projectedFixedCosts = basePnl.totalFixedOperatingExpenses;
  const projectedOperatingProfit = projectedContributionMargin - projectedFixedCosts;

  const profitDifference = projectedOperatingProfit - basePnl.operatingProfitOrLoss;
  const percentageProfitImprovement =
    basePnl.operatingProfitOrLoss !== 0
      ? (profitDifference / Math.abs(basePnl.operatingProfitOrLoss)) * 100
      : 0;

  return {
    id: `scenario-${Date.now()}`,
    name: 'Custom Strategy',
    outletId: basePnl.outletId,
    directOrderShiftPct: scenario.directOrderShiftPct,
    menuPriceIncreasePct: scenario.menuPriceIncreasePct,
    cogsReductionPct: scenario.cogsReductionPct,
    adSpendReductionPct: scenario.adSpendReductionPct,
    projectedNetRevenue,
    projectedContributionMargin,
    projectedFixedCosts,
    projectedOperatingProfit,
    profitDifference,
    percentageProfitImprovement,
  };
}
