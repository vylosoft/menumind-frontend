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

export interface AggregatorBrandOutletMapping {
  id: string;
  platform: 'swiggy' | 'zomato' | 'ownly';
  restaurantId: string; // e.g. '762173', '20794526'
  brandName: string; // e.g. 'Banglar Jhale Jhole', 'Niraamish'
  outletId: 'banaswadi' | 'whitefield';
  isDefault?: boolean;
  notes?: string;
}

export interface PayoutOtherChargeItem {
  id: string;
  label: string;
  amount: number;
}

export interface ZomatoTriplet {
  delivered: number;
  cancelled: number;
  total: number;
}

export interface ZomatoExtraLineItem {
  id: string;
  sNo?: string;
  label: string;
  values: ZomatoTriplet;
}

export interface ZomatoBreakupRowItem {
  id: string;
  sNo?: string;
  particulars: string;
  deliveredValue: number;
  cancelledValue: number;
  totalValue: number;
  mappedField: string;
}

export interface ZomatoNormalizedMappingTrace {
  sourceSNo?: string;
  sourceLabel: string;
  canonicalTarget: string;
  totalAmount: number;
}

/**
 * Exact Canonical Zomato "Payout Breakup" Sheet Model (Sections A through J, Rows 1 through 32 + Settlement breakdown).
 * Universal target model: ALL Zomato payout templates (classic, shifted-row, newer Eternal/Zomato formats,
 * signed summary ledgers, and order-level exports) normalize into this single consistent schema.
 */
export interface ZomatoPayoutBreakupModel {
  templateVersion: 'zomato_payout_breakup_v2';
  sheetNameUsed: string;
  detectedSourceTemplate?:
    | 'classic_breakup_a_j'
    | 'shifted_or_extended_breakup'
    | 'signed_summary_ledger'
    | 'order_level_tabular'
    | 'legacy_hydrated';
  detectedSourceTemplateLabel?: string;
  normalizedMappingsApplied?: ZomatoNormalizedMappingTrace[];
  resId?: string;
  brandName?: string;
  outletLocation?: 'banaswadi' | 'whitefield';
  settlementPeriodLabel?: string;
  payoutStartDate?: string;
  payoutEndDate?: string;
  utrNumber?: string;

  // Top Row: Number of orders (Delivered | Cancelled/Rejected | Total)
  ordersCount: ZomatoTriplet;

  // Section A: Net order value ( 1 + 2 + 3 - 4 - 5 + 6 - 7 + 8 )
  sectionA_netOrderValue: ZomatoTriplet;
  reportedSectionA?: ZomatoTriplet;
  row1_subtotal: ZomatoTriplet; // 1. Subtotal (items total)
  row2_packagingCharge: ZomatoTriplet; // 2. Packaging charge
  row3_selfLogisticsDeliveryCharge: ZomatoTriplet; // 3. Delivery charge for restaurants on self logistics
  row4_promoDiscount: ZomatoTriplet; // 4. Restaurant discount (Promo)
  row5_bogoFreebiesGoldDiscount: ZomatoTriplet; // 5. Restaurant discount (BOGO, Freebies, Gold, Brand pack & others)
  row6_brandPackSubscriptionFee: ZomatoTriplet; // 6. Brand pack subscription fee
  row7_deliveryRelistingDiscount: ZomatoTriplet; // 7. Delivery charge discount/ Relisting discount
  row8_customerGstCollected: ZomatoTriplet; // 8. Total GST collected from customers

  // Section B: Total commissionable value ( 9 + 10 + 11 )
  sectionB_totalCommissionableValue: ZomatoTriplet;
  reportedSectionB?: ZomatoTriplet;
  row9_commissionableSubtotal: ZomatoTriplet; // 9. Commissionable value of Subtotal, excluding restaurant discounts ( 1 - 4 - 5 )
  row10_commissionablePackaging: ZomatoTriplet; // 10. Commissionable value of Packaging charge
  row11_commissionableGst: ZomatoTriplet; // 11. Commissionable value of Total GST collected from customers

  // Section C: Service fees & payment mechanism fees ( 12 + 13 - 14 - 15 + 16 )
  sectionC_serviceAndPaymentFees: ZomatoTriplet;
  reportedSectionC?: ZomatoTriplet;
  row12_baseServiceFee: ZomatoTriplet; // 12. Base service fee
  row13_longDistanceFee: ZomatoTriplet; // 13. Long distance enablement fee
  row14_longDistanceDiscount: ZomatoTriplet; // 14. Discount on long distance enablement fee
  row15_serviceFeeCapDiscount: ZomatoTriplet; // 15. Discount on service fee due to 30% capping
  row16_paymentMechanismFee: ZomatoTriplet; // 16. Payment mechanism fee

  // Section D: Government charges ( 17 + 18 + 19 + 20 )
  sectionD_governmentCharges: ZomatoTriplet;
  reportedSectionD?: ZomatoTriplet;
  row17_taxesOnServiceFee: ZomatoTriplet; // 17. Taxes on service fee & payment mechanism fee
  row18_tcsAndIgst: ZomatoTriplet; // 18. Tax collected at source + TCS IGST amount
  row19_tds194O: ZomatoTriplet; // 19. TDS 194O amount
  row20_gstSection9_5: ZomatoTriplet; // 20. GST paid by Zomato on behalf of restaurant - under section 9(5)

  // Section E: Other order level deductions ( 21 + 22 + 23 )
  sectionE_otherOrderLevelDeductions: ZomatoTriplet;
  reportedSectionE?: ZomatoTriplet;
  row21_otherOrderLevelDeductions: ZomatoTriplet; // 21. Other Order level deductions (sum of 8 sub-items below, or standalone)
  reportedRow21?: ZomatoTriplet;
  row21a_customerCompensation: ZomatoTriplet; // Customer compensation/ recoupment
  row21b_rejectionPenalty: ZomatoTriplet; // Rejection penalty
  row21c_deliveryChargesRecovery: ZomatoTriplet; // Delivery charges recovery
  row21d_creditDebitNoteAdjustment: ZomatoTriplet; // Credit note/ (Debit note) adjustment
  row21e_promoRecoveryAdjustment: ZomatoTriplet; // Promo recovery adjustment
  row21f_extraInventoryAds: ZomatoTriplet; // Extra inventory ads (order level deduction)
  row21g_brandLoyaltyPointsRedemption: ZomatoTriplet; // Brand loyalty points redemption
  row21h_expressOrderFee: ZomatoTriplet; // Express order fee
  row22_cashReceivedSelfDelivery: ZomatoTriplet; // 22. Amount received in cash (on self delivery orders)
  row23_previousWeeksAdjustments: ZomatoTriplet; // 23. Adjustments from previous weeks

  // Section F: Investment in growth services ( 24 + 25 + 26 )
  sectionF_investmentInGrowthServices: ZomatoTriplet;
  reportedSectionF?: ZomatoTriplet;
  row24_totalAdsIncGst: ZomatoTriplet; // 24. Total Ads (inc. 18% GST)
  row25_totalDiningAdsIncGst: ZomatoTriplet; // 25. Total Dining Ads (inc. 18% GST)
  row26_miscellaneousServices: ZomatoTriplet; // 26. Miscellaneous services

  // Section G: Investment in Hyperpure ( 27 )
  sectionG_investmentInHyperpure: ZomatoTriplet;
  reportedSectionG?: ZomatoTriplet;
  row27_totalHyperpure: ZomatoTriplet; // 27. Total Hyperpure

  // Section H: Other Deductions ( 28 + extra )
  sectionH_otherDeductions: ZomatoTriplet;
  reportedSectionH?: ZomatoTriplet;
  row28_expressOrderDiscountReversal: ZomatoTriplet; // 28. Express order discount reversal
  extraOtherDeductions: ZomatoExtraLineItem[];

  // Section I: Total Additions ( 29 + 30 + 31 + 32 + extra )
  sectionI_totalAdditions: ZomatoTriplet;
  reportedSectionI?: ZomatoTriplet;
  row29_cancellationRefund: ZomatoTriplet; // 29. Cancellation refund for cancelled orders
  row30_kitchenStaffTip: ZomatoTriplet; // 30. Tip for kitchen staff for delivered orders
  row31_tds194HAndResIdAdditions: ZomatoTriplet; // 31. TDS 194 H and other Res id level additions
  row32_serviceFeesRebate: ZomatoTriplet; // 32. Restaurant-level service fees rebate
  extraAdditions: ZomatoExtraLineItem[];

  // Section J: Net Payout ( A - C - D - E - F - G - H + I )
  sectionJ_netPayout: ZomatoTriplet;
  reportedSectionJ?: ZomatoTriplet;
  hasExplicitReportedJ?: boolean;

  // Settlement breakdown
  settlementAmountSettled: ZomatoTriplet; // Amount settled
  settlementPendingAmount: ZomatoTriplet; // Pending amount (will be credited on next payout day)

  // Convenience scalar mirrors for PlatformPayoutRecord
  calculatedNetPayout: number;
  reportedNetPayout: number;

  // Full row-by-row audit trace from "Payout Breakup" sheet
  rawSheetRows?: ZomatoBreakupRowItem[];
}

export interface SwiggyQuintet {
  swiggyDelivered: number;
  swiggyCancelled: number;
  toingDelivered: number;
  toingCancelled: number;
  total: number; // Combined Swiggy + Toing Total
}

export interface SwiggyExtraLineItem {
  id: string;
  label: string;
  values: SwiggyQuintet;
}

export interface SwiggyBreakupRowItem {
  id: string;
  particulars: string;
  swiggyDelivered: number;
  swiggyCancelled: number;
  toingDelivered: number;
  toingCancelled: number;
  totalValue: number;
  mappedField: string;
}

/**
 * Exact Swiggy (+ Toing Combined) "Payout Breakup" Sheet Model.
 * Combines Swiggy Orders (Delivered + Cancelled) and Toing Orders (Delivered + Cancelled) into Total
 * and reports everything consolidated under Swiggy.
 */
export interface SwiggyPayoutBreakupModel {
  templateVersion: 'swiggy_payout_breakup_v1';
  sheetNameUsed: string;
  hasToingColumns: boolean;
  resId?: string;
  brandName?: string;
  outletLocation?: 'banaswadi' | 'whitefield';
  settlementPeriodLabel?: string;
  payoutStartDate?: string;
  payoutEndDate?: string;
  utrNumber?: string;

  // Top Row: Orders (Swiggy Delivered | Swiggy Cancelled | Toing Delivered | Toing Cancelled | Total)
  orders: SwiggyQuintet;

  // Section 1: Total Customer Paid
  totalCustomerPaid: SwiggyQuintet;
  reportedTotalCustomerPaid?: SwiggyQuintet;
  itemTotal: SwiggyQuintet; // Item Total (+)
  packagingCharges: SwiggyQuintet; // Packaging Charges (+)
  couponDiscounts: SwiggyQuintet; // Restaurant Discounts (Coupon based) (-)
  fvoFreebiesDiscounts: SwiggyQuintet; // Restaurant Discounts (FVOs, Freebies and others) (-)
  gstCollected: SwiggyQuintet; // GST Collected (+)
  deliveryFee: SwiggyQuintet; // Delivery Fee (+)
  discountOnDeliveryFee: SwiggyQuintet; // Discount on Delivery Fee (-)
  gstOnDeliveryFee: SwiggyQuintet; // GST on Delivery Fee (+)

  // Section 2: Swiggy Fees
  swiggyFees: SwiggyQuintet;
  reportedSwiggyFees?: SwiggyQuintet;
  commission: SwiggyQuintet; // Commission (-)
  longDistanceCharges: SwiggyQuintet; // Long Distance Charges (-)
  paymentCollectionCharges: SwiggyQuintet; // Payment Collection Charges (-)
  pocketHeroFees: SwiggyQuintet; // Pocket Hero Fees (-)
  swiggyOneFees: SwiggyQuintet; // Swiggy One Fees (-)
  restaurantCancellationCharges: SwiggyQuintet; // Restaurant Cancellation Charges (-)
  callCenterCharges: SwiggyQuintet; // Call Center Charges (-)
  deliveryFeeSponsoredByRestaurant: SwiggyQuintet; // Delivery Fee sponsored by Restaurant (w/o tax) (-)
  boltFees: SwiggyQuintet; // Bolt fees (-)
  swiggyAssureFee: SwiggyQuintet; // Swiggy Assure Fee (-) if applicable
  extraSwiggyFees: SwiggyExtraLineItem[];

  // Section 3: Customer Complaints & Cancellation Charges
  customerComplaintsAndCancellation: SwiggyQuintet;
  reportedCustomerComplaintsAndCancellation?: SwiggyQuintet;
  merchantShareCancelledOrders: SwiggyQuintet; // Merchant Share Of Cancelled Orders (-)
  refundForCustomerComplaints: SwiggyQuintet; // Refund For Customer Complaints (-)

  // Section 4: Growth Investment In Ads & Other Charges and Refunds
  growthInvestmentInAds: SwiggyQuintet; // Growth Investment In Ads (-)
  otherChargesAndRefunds: SwiggyQuintet; // Other Charges and Refunds (+/-)
  extraOtherChargesAndRefunds: SwiggyExtraLineItem[];

  // Section 5: Total Taxes
  totalTaxes: SwiggyQuintet;
  reportedTotalTaxes?: SwiggyQuintet;
  gstDeduction: SwiggyQuintet; // GST Deduction (-) [Sec 9(5)]
  tcs: SwiggyQuintet; // TCS (-)
  tds: SwiggyQuintet; // TDS (-)
  gstOnServiceFee18: SwiggyQuintet; // GST on Service Fee @18% (-)

  // Section 6: Net Payout
  netPayout: SwiggyQuintet;
  reportedNetPayoutQuintet?: SwiggyQuintet;
  hasExplicitReportedNetPayout?: boolean;

  calculatedNetPayout: number;
  reportedNetPayout: number;

  rawSheetRows?: SwiggyBreakupRowItem[];
}

export interface OwnlyPayoutSettlementRow {
  id: string;
  restaurantId: string; // e.g. 'RN421125'
  restaurantName: string; // e.g. 'Banglar Jhale Jhole -W'
  payoutPeriod: string; // e.g. '1 October -> 1 October'
  totalOrders: number; // e.g. 2
  grossAmount: number; // e.g. 700.35
  taxDeduction: number; // e.g. 33.35
  tdsDeduction: number; // e.g. 0.67
  tcsDeduction: number; // e.g. 0
  totalDeductions: number; // e.g. 34.02
  netPayoutAmount: number; // e.g. 666.33
  status: string; // e.g. 'completed'
  utr: string; // e.g. '627558219482'
  accountingMonth?: string; // e.g. '2026-10'
  startDate?: string; // e.g. '2026-10-01'
  endDate?: string; // e.g. '2026-10-01'
}

/**
 * Exact Ownly Payout Settlement Ledger Model (12-column template).
 */
export interface OwnlyPayoutBreakupModel {
  templateVersion: 'ownly_payout_ledger_v1';
  sheetNameUsed: string;
  resId?: string; // e.g. 'RN421125'
  rawRestaurantName?: string; // e.g. 'Banglar Jhale Jhole -W'
  brandName?: string; // e.g. 'Banglar Jhale Jhole'
  outletLocation?: 'banaswadi' | 'whitefield';
  accountingMonth?: string; // e.g. '2026-10'
  settlementPeriodLabel?: string; // e.g. '1 October -> 31 October'
  payoutStartDate?: string;
  payoutEndDate?: string;

  rows: OwnlyPayoutSettlementRow[];

  // Aggregated Column Totals across rows
  totalOrders: number;
  totalGrossAmount: number;
  preTaxFoodSubtotal: number; // Gross Amount - Tax Deduction
  totalTaxDeduction: number;
  totalTdsDeduction: number;
  totalTcsDeduction: number;
  totalOtherDeductions: number; // Residual between Total Deductions and (Tax + TDS + TCS)
  totalDeductions: number;
  calculatedNetPayout: number;
  reportedNetPayout: number;
  hasExplicitReportedNetPayout?: boolean;
}

export interface PlatformPayoutRecord {
  id: string;
  outletId: 'banaswadi' | 'whitefield';
  month: string;
  platform: 'zomato' | 'swiggy' | 'ownly';
  accountId?: string; // Restaurant ID e.g. 762173, 20794526, or RN421125
  accountName?: string; // Brand Name e.g. Banglar Jhale Jhole or Niraamish
  grossSales: number;
  packagingCharges?: number;
  customerDiscounts: number;
  netSales: number;
  orderCount: number;
  cancelledOrders?: number;
  // Platform deductions
  commissionRate: number; // percentage, e.g. 22
  commissionAmount: number;
  paymentGatewayFee: number;
  deliveryChargesCollected: number;
  customerDeliveryFeeShare: number;
  advertisingSpend: number;
  cancellationCharges: number;
  swiggyAssureFee?: number; // Swiggy Assure program fee
  otherPlatformFees: number;
  otherChargesBreakdown?: PayoutOtherChargeItem[]; // Granular other charges extracted from payout Excel
  // Taxes on platform services
  gstOnCommission: number; // 18% on platform fees / restaurant GST
  tcsDeduction: number; // TCS
  tdsDeduction: number; // TDS u/s 194O
  // Supplier Offset (e.g. Hyperpure for Zomato)
  hyperpureRecovery: number; // Supplier liability offset, NOT platform commission
  // Final settlement
  calculatedNetPayout: number;
  actualBankSettlement: number;
  settlementDifference: number;
  status: 'reconciled' | 'discrepancy' | 'pending';
  formulaRepairsApplied?: string[];
  periodType?: 'monthly' | 'weekly';
  weekLabel?: string;
  payoutStartDate?: string;
  payoutEndDate?: string;
  payoutDate?: string;
  sourceFileName?: string;
  fileHash?: string; // SHA-256 content hash for duplicate rejection
  dataFingerprint?: string; // Semantic fingerprint for duplicate data rejection
  batchId?: string; // MenuMind API upload batch
  directSalesCashUpi?: number;
  zomatoBreakup?: ZomatoPayoutBreakupModel; // Canonical Zomato Payout Breakup model
  swiggyBreakup?: SwiggyPayoutBreakupModel; // Canonical Swiggy (+ Toing) Payout Breakup model
  ownlyBreakup?: OwnlyPayoutBreakupModel; // Canonical Ownly 12-column Payout Ledger model
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
    payoutTotalDeductions?: number;
    payoutNetCredited: number;
    payoutOrders: number;
    statementCount?: number;
    statementBreakdown?: Array<{
      id: string;
      restaurantId?: string;
      brandName: string;
      outletId: 'banaswadi' | 'whitefield';
      periodLabel?: string;
      orders: number;
      grossSales: number;
      netCredited: number;
    }>;
    varianceGross: number;
    varianceGrossPct: number;
    matchStatus: 'matched' | 'minor_variance' | 'unmatched';
  }>;
  totalPosGross: number;
  totalPosNet: number;
  aggregatorPosGross?: number;
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
