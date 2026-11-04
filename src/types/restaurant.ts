export interface RawSalesRecord {
  rowId: string;
  sourceFile: string;
  rawItemName: string;
  rawVariantName?: string;
  quantity: number;
  revenue: number; // Gross or net sales as reported
  isNetSales?: boolean;
  date?: string; // YYYY-MM-DD if available
  category?: string;
  orderType?: string; // Dine-in, Delivery, Takeaway
  salesChannel?: string; // Swiggy, Zomato, Direct POS
  discount?: number;
  returnAmount?: number;
  outlet?: string;
  isReturnOrCancelled?: boolean;
}

export interface PosLayoutConfig {
  presetId?: string; // e.g. 'petpooja-item-wise', 'petpooja-highest-selling', 'custom-pos'
  presetName?: string;
  headerRow: number; // 1-indexed (Column Heading Row, e.g. 5 or 6)
  dataStartRow: number; // 1-indexed (Row Heading Row / Dish Data Start Row, e.g. 6 or 11)
  sheetIndex?: number; // 0-indexed, default 0
  skipFooterRows?: number; // Footer summary rows to skip at the bottom (e.g. 1)
}

export interface ColumnMapping {
  itemName: string;
  variantName?: string;
  quantity: string;
  revenue: string;
  date?: string;
  category?: string;
  orderType?: string;
  salesChannel?: string;
  discount?: string;
  returns?: string;
  outlet?: string;
}

export interface DishVariant {
  rawName: string;
  variantName: string;
  quantity: number;
  revenue: number;
  averagePrice: number;
  revenueShare: number; // % within parent
  volumeShare: number; // % within parent
  unitCost?: number;
}

export type MenuClassification =
  | 'DEMAND_LEADER'
  | 'REVENUE_CHAMPION'
  | 'RISING_STAR'
  | 'HIDDEN_GEM'
  | 'DECLINING'
  | 'EXIT_CANDIDATE'
  | 'STABLE';

export type ActionRecommendation =
  | 'DOUBLE_DOWN'
  | 'PROMOTE'
  | 'OPTIMIZE'
  | 'MONITOR'
  | 'CONSIDER_REMOVING';

export type MatrixQuadrant = 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG';

export interface ParentDish {
  id: string;
  name: string;
  category: string;
  variants: DishVariant[];
  totalQuantity: number;
  totalRevenue: number;
  averageRealizedPrice: number;
  revenueShare: number; // % of total restaurant revenue
  volumeShare: number; // % of total portions sold
  rankRevenue: number;
  rankVolume: number;
  monthlyData: Record<string, { qty: number; revenue: number }>; // 'YYYY-MM': {qty, rev}
  momQtyChange?: number; // % change last month vs previous
  momRevChange?: number;
  l3mVsP3mChange?: number; // % change last 3 months vs prior 3 months
  trendDirection: 'RISING' | 'STABLE' | 'DECLINING';
  
  // Menu Engineering & Profitability
  classification: MenuClassification;
  actionRecommendation: ActionRecommendation;
  recommendationReason: string;
  actionAdvice: string;
  riskTradeoffs: string;
  confidenceScore: number; // 0 - 100
  
  // Cost & Profitability fields
  hasCostData: boolean;
  unitCost?: number;
  packagingCost?: number;
  commissionRatePct?: number;
  preparationCost?: number;
  totalUnitCost?: number;
  contributionMargin?: number; // per unit
  totalContributionMargin?: number; // total profit
  contributionMarginPct?: number; // margin / price
  matrixQuadrant?: MatrixQuadrant;
  
  // Operational & Strategic tags
  isSignatureDish?: boolean;
  isCulturallyImportant?: boolean;
}

export interface GroupingRule {
  id: string;
  pattern: string; // Regex or prefix/match
  parentDishName: string;
  variantName: string;
  isUserApproved: boolean;
  confidence: number;
  matchType: 'deterministic' | 'dictionary' | 'fuzzy' | 'ai' | 'manual';
  notes?: string;
}

export interface ReconciliationReport {
  totalFiles: number;
  fileNames: string[];
  totalRawRows: number;
  validRows: number;
  invalidRows: number;
  duplicatesSkipped: number;
  returnsOrCancelledCount: number;
  returnsRevenueExcluded: number;
  totalReportedRevenue: number;
  isNetSales: boolean;
  totalUnitsSold: number;
  uniqueRawItems: number;
  uniqueParentDishes: number;
  detectedGranularity: 'daily' | 'monthly' | 'aggregate_only';
  dateRangeStart?: string;
  dateRangeEnd?: string;
  monthsPresent: string[];
  hasOutletGrouping?: boolean;
  outletCounts?: {
    banaswadiRows: number;
    whitefieldRows: number;
    banaswadiRevenue: number;
    whitefieldRevenue: number;
    banaswadiUnits: number;
    whitefieldUnits: number;
  };
}

export interface ForecastItem {
  dishId: string;
  dishName: string;
  historicalTotalQty: number;
  historicalMonthlyAvg: number;
  forecastPeriodDays: 7 | 14 | 30 | 60;
  baseForecastQty: number;
  conservativeQty: number;
  optimisticQty: number;
  method: 'Weighted Trend + Day-of-Week Seasonality' | 'Monthly Moving Average' | 'Historical Baseline';
  reliability: 'High' | 'Moderate' | 'Low';
  reliabilityReason: string;
  trendSlopePct: number;
}

export interface RemovalSimulation {
  targetDishIds: string[];
  substituteDishId?: string;
  demandShiftPct: number; // 0 - 100%
  originalLostRevenue: number;
  originalLostUnits: number;
  retainedRevenue: number;
  retainedUnits: number;
  netRevenueChange: number;
  netRevenueChangePct: number;
  savedComplexityScore: string;
  riskWarnings: string[];
  recommendation: 'KEEP' | 'IMPROVE_REPRICE' | 'REDUCE_VARIANTS' | 'RUN_TRIAL' | 'CONSIDER_REMOVING';
}

export interface FilterState {
  searchQuery: string;
  selectedCategory: string;
  selectedOutlet: string;
  selectedChannel: string;
  dateRange: { start: string; end: string } | null;
  classificationFilter: string;
  actionFilter: string;
  sortBy: 'revenue' | 'quantity' | 'name' | 'growth' | 'margin';
  sortOrder: 'asc' | 'desc';
}
