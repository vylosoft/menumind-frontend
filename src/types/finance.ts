/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type OutletId = 'banaswadi' | 'whitefield' | 'consolidated';

export type FinancialMonth = string; // e.g. "2026-10"

export type SalesChannel =
  | 'zomato'
  | 'swiggy'
  | 'ownly'
  | 'direct'
  | 'takeaway'
  | 'dinein';

export interface OutletInfo {
  id: OutletId;
  name: string;
  shortCode: string;
  brandSuffixes: string[];
  zomatoAccountIds?: string[];
  status: 'active' | 'pending';
}

export interface BrandFilterRule {
  brandName: string;
  outletId: 'banaswadi' | 'whitefield';
  isActive: boolean; // House Of Terreti is false (inactive)
  notes?: string;
}

export interface PlatformPayoutRecord {
  id: string;
  outletId: 'banaswadi' | 'whitefield';
  month: string;
  platform: 'zomato' | 'swiggy' | 'ownly';
  accountId?: string; // e.g. 20794526 or 22042748
  accountName?: string;
  grossSales: number;
  customerDiscounts: number;
  netSales: number;
  orderCount: number;
  // Platform deductions
  commissionRate: number; // percentage, e.g. 22
  commissionAmount: number;
  paymentGatewayFee: number;
  deliveryChargesCollected: number;
  customerDeliveryFeeShare: number;
  advertisingSpend: number;
  cancellationCharges: number;
  otherPlatformFees: number;
  // Taxes on platform services
  gstOnCommission: number; // 18% on platform fees
  tcsDeduction: number; // 1% TCS
  tdsDeduction: number; // 0.1% TDS
  // Supplier Offset (e.g. Hyperpure)
  hyperpureRecovery: number; // Supplier liability offset, NOT platform commission
  // Final settlement
  calculatedNetPayout: number;
  actualBankSettlement: number;
  settlementDifference: number;
  status: 'reconciled' | 'discrepancy' | 'pending';
  formulaRepairsApplied?: string[];
  periodType?: 'monthly' | 'weekly';
  weekLabel?: string;
  payoutDate?: string;
  sourceFileName?: string;
  batchId?: string; // MenuMind API upload batch
  directSalesCashUpi?: number;
}

export interface HyperpureMatchedBill {
  invoiceNumber: string;
  date: string;
  outletId: string;
  amount: number;
  description: string;
}

export interface HyperpurePayoutDeduction {
  payoutId: string;
  platform: string;
  outletId: string;
  monthOrWeek?: string;
  amount: number;
}

export interface HyperpureReconciliationReport {
  totalInvoicedAmount: number;
  totalInvoicesCount: number;
  totalDeductedAtPayout: number;
  variance: number;
  status: 'matched' | 'over_deducted' | 'pending_deduction';
  matchedBills: HyperpureMatchedBill[];
  payoutDeductions: HyperpurePayoutDeduction[];
}

export interface ChannelPosMatchReport {
  channelReports: Array<{
    channel: string;
    channelLabel: string;
    posGrossSales: number;
    posNetSales: number;
    posOrders: number;
    payoutGrossSales: number;
    payoutNetSales: number;
    payoutNetCredited: number;
    payoutOrders: number;
    varianceGross: number;
    varianceGrossPct: number;
    matchStatus: 'matched' | 'minor_variance' | 'unmatched';
  }>;
  totalPosGross: number;
  totalPosNet: number;
  totalPayoutGross: number;
  totalPayoutNetCredited: number;
  overallVariance: number;
  overallStatus: 'matched' | 'minor_variance' | 'unmatched';
}

export interface GrowthAnalysisMetrics {
  currentMonth: string;
  previousMonth: string;
  previousYearMonth: string;
  momRevenueGrowthPct: number;
  momNetPayoutGrowthPct: number;
  momOrdersGrowthPct: number;
  momAovGrowthPct: number;
  yoyRevenueGrowthPct: number;
  yoyNetPayoutGrowthPct: number;
  yoyOrdersGrowthPct: number;
  yoyAovGrowthPct: number;
  currentGrossRevenue: number;
  currentNetPayoutTotal: number;
  currentDirectSales: number;
  currentTotalOrders: number;
  currentAov: number;
  directRealizationRatioPct: number;
}

export interface ChannelAwareBreakEvenMetrics {
  totalFixedObligations: number;
  weightedContributionMarginRatio: number;
  breakEvenGrossRevenue: number;
  breakEvenOrders: number;
  marginOfSafetyRevenue: number;
  marginOfSafetyPct: number;
  aggregatorCommissionDrain: number;
  channelShiftSimulation: {
    shiftPct: number;
    monthlySavingsINR: number;
    reducedBreakEvenOrders: number;
    newEbitdaMarginPct: number;
  };
  // Inputs actually used (all derived from stored data; null when the data is not available)
  currentRevenue?: number;
  avgOrderValue?: number;
  aggregatorTakeRatePct?: number;
  aggregatorSharePct?: number;
  foodCostPct?: number | null;
  currentEbitdaMarginPct?: number | null;
}

export type ExpenseCategory =
  | 'Rent & Property'
  | 'Staff & Accommodation'
  | 'Utilities & Energy'
  | 'Kitchen Supplies & Water'
  | 'Sanitation & Hygiene'
  | 'Technology & POS'
  | 'Marketing & Ads'
  | 'Maintenance & Repairs'
  | 'Statutory & Compliance'
  | 'Miscellaneous';

export interface MonthlyExpenseItem {
  id: string;
  outletId: 'banaswadi' | 'whitefield';
  month: string;
  category: ExpenseCategory;
  name: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  isConfirmed: boolean; // if false -> "Pending Entry"
  notes?: string;
  vendorName?: string;
}

export interface EmployeePayrollRecord {
  id: string;
  outletId: 'banaswadi' | 'whitefield';
  employeeName: string;
  designation: string;
  roleCategory: 'chef' | 'helper' | 'packer' | 'manager' | 'service';
  baseSalary: number;
  isFoodAllowanceEligible: boolean; // Managers not eligible; kitchen/packers eligible @ ₹130/day
  daysWorkedInMonth: number;
  foodAllowanceRatePerDay: number; // ₹130/day
  calculatedFoodAllowance: number; // daysWorked * rate (up to ₹3,900 / ₹19,500 total for 5 staff)
  insuranceBenefitMonthly: number; // ₹1,500/month
  otherAllowances: number;
  deductions: number;
  netPayableSalary: number;
  joiningDate?: string;
  leavingDate?: string;
  status: 'active' | 'on-leave' | 'exited';
}

export interface ChannelPerformanceSummary {
  channel: SalesChannel;
  grossRevenue: number;
  netRevenue: number;
  orders: number;
  averageOrderValue: number;
  cogsAmount: number;
  packagingAmount: number;
  platformCommissions: number;
  paymentGatewayFees: number;
  deliveryShare: number;
  contributionMarginAmount: number;
  contributionMarginPercentage: number;
}

export interface MonthlyPnLStatement {
  month: string;
  outletId: OutletId;
  outletName: string;
  // Top Line
  grossSalesPetpooja: number;
  customerDiscounts: number;
  returnsAndCancellations: number;
  netSalesRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  // Direct Cost of Goods Sold (Recipe BOM)
  rawMaterialCOGS: number;
  rawMaterialPercentage: number;
  packagingCosts: number;
  packagingPercentage: number;
  totalCOGS: number;
  grossProfit: number;
  grossProfitPercentage: number;
  // Channel Variable Costs
  platformCommissions: number;
  platformCommissionPercentage: number;
  platformTaxesAndFees: number;
  deliveryShareCosts: number;
  totalVariableChannelCosts: number;
  // Contribution Margin
  contributionMargin: number;
  contributionMarginPercentage: number;
  // Fixed Operating Period Expenses
  kitchenRent: number;
  staffAccommodation: number;
  staffSalaries: number;
  staffFoodAllowances: number;
  staffInsurance: number;
  electricityExpense: number;
  lpgGasExpense: number;
  tankerAndKitchenWater: number;
  sanitationAndCleaning: number;
  posAndInternetTech: number;
  otherFixedExpenses: number;
  totalFixedOperatingExpenses: number;
  // Bottom Line
  operatingProfitOrLoss: number; // EBITDA / Operating Net
  operatingProfitMarginPercentage: number;
  // Hyperpure Supplier Offset Reference
  hyperpureSupplierOffset: number; // tracked separately, not in P&L expense
  // Bulk Catering Direct Sales Integration
  nonPetpoojaCateringRevenue?: number;
  cateringDirectCosts?: number;
  cateringContribution?: number;
  cateringOrdersCount?: number;
  totalRecognizedOutletRevenue?: number;
  // Selectable Food Costing Basis Integration (Recipe BOM vs Landed Purchases vs Stock Audit)
  foodCostingBasis?: 'recipe_based' | 'purchase_based' | 'inventory_based';
  recipeFoodCOGS?: number;
  purchaseLandedFoodCOGS?: number;
  inventoryFoodCOGS?: number;
  costingBasisLabel?: string;
  costingDataStatus?: 'actual_stock_audited' | 'provisional_purchase_proxy' | 'estimated_recipe_bom';
  foodCostVarianceVsRecipe?: number;
  // Workflow Status
  approvalStatus: 'Draft' | 'Under Review' | 'Audited & Approved';
}

export interface BreakEvenAnalysis {
  outletId: OutletId;
  month: string;
  totalFixedCosts: number;
  weightedContributionMarginRatio: number; // 0.0 to 1.0
  breakEvenNetRevenueMonthly: number; // fixedCosts / contributionMarginRatio
  breakEvenNetRevenueDaily: number; // monthly / daysInMonth
  breakEvenOrdersMonthly: number; // breakEvenRevenue / averageOrderValue
  breakEvenOrdersDaily: number;
  actualNetRevenue: number;
  revenueSurplusOrDeficit: number; // actual - breakEven
  breakEvenAchievedPercentage: number;
  daysToBreakEvenAtCurrentPace: number;
  // Catering Dual-View Support
  restaurantOnlyBreakEvenMonthly?: number;
  cateringContributionCredited?: number;
  netFixedCostsAfterCatering?: number;
}

export interface ProfitSimulationScenario {
  id: string;
  name: string;
  outletId: OutletId;
  directOrderShiftPct: number; // e.g. move 10% from Swiggy/Zomato to Direct/Ownly
  menuPriceIncreasePct: number; // e.g. +4% price bump
  cogsReductionPct: number; // e.g. -3% via portion control/bulk purchase
  adSpendReductionPct: number; // e.g. -20% platform ad trim
  // Output projections
  projectedNetRevenue: number;
  projectedContributionMargin: number;
  projectedFixedCosts: number;
  projectedOperatingProfit: number;
  profitDifference: number;
  percentageProfitImprovement: number;
}

export interface MonthEndCloseStep {
  id: number;
  title: string;
  description: string;
  category: 'Sales' | 'Expenses' | 'Payroll' | 'Reconciliation' | 'Review';
  isCompleted: boolean;
  completedAt?: string;
  notes?: string;
}
