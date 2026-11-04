export type MeasurementUnit = 'g' | 'kg' | 'ml' | 'l' | 'litre' | 'piece' | 'pc' | 'tbsp' | 'tsp';

export interface RecipeIngredient {
  id: string;
  name: string;
  quantity: number;
  unit: MeasurementUnit;
  purchasePrice: number; // Cost in INR per pack
  purchasePackSize: number; // Size in same/standard unit
  purchasePackUnit: MeasurementUnit;
  yieldPct: number; // e.g. 85 for 85% edible yield
  preparationLossPct: number; // e.g. 5 for 5% trim loss
  calculatedCostPerPortion: number; // In INR
  notes?: string;
}

export interface DishRecipe {
  id: string;
  parentDishName: string;
  variantName: string; // e.g. 'Standard', 'Light', 'Small', 'Large', 'Regular'
  recipeName: string;
  batchYieldServings: number; // default 1 (or 10 for batch recipes)
  ingredients: RecipeIngredient[];
  totalIngredientCost: number; // sum of calculatedCostPerPortion / batchYield
  packagingCost: number;
  cookingFuelCost: number;
  directLaborCost: number;
  otherVariableCost: number;
  platformCommissionRatePct?: number; // Channel-specific commission rate
  totalVariableCostPerPortion: number; // sum of all variable costs
  lastUpdated?: string;
}

export interface VariantProfitMetrics {
  rawName: string;
  variantName: string;
  quantity: number;
  netRevenue: number;
  averagePrice: number;
  ingredientCost: number;
  packagingCost: number;
  otherVariableCost: number;
  totalVariableCost: number;
  unitContributionMargin: number; // Price - Variable Cost
  contributionMarginPct: number; // (Unit CM / Price) * 100
  totalContribution: number; // Quantity * Unit CM
  isNegativeMargin: boolean;
}

export type ProfitOpportunityCategory =
  | 'DOUBLE_DOWN' // High demand, high margin, strong total CM
  | 'HIGH_DEMAND_LOW_MARGIN' // High demand, low margin -> needs reprice, recipe optimization
  | 'HIGH_MARGIN_LOW_DEMAND' // High margin, low demand -> needs promo, bundles, placement
  | 'LOW_DEMAND_LOW_MARGIN' // Low demand, low margin -> potential exit candidate
  | 'NEGATIVE_CONTRIBUTION'; // Selling below variable cost -> urgent review

export interface ParentProfitMetrics {
  parentDishId: string;
  parentDishName: string;
  category: string;
  totalQuantity: number;
  totalNetRevenue: number;
  totalVariableCost: number;
  totalContribution: number; // Sum of variant total contributions
  weightedUnitContribution: number; // totalContribution / totalQuantity
  weightedContributionMarginPct: number; // (totalContribution / totalNetRevenue) * 100
  averageRealizedPrice: number;
  rankContribution: number;
  isNegativeMargin: boolean;
  opportunityCategory: ProfitOpportunityCategory;
  opportunityRecommendation: string;
  actionDetails: string[];
  variants: VariantProfitMetrics[];
  hasCompleteRecipe: boolean;
}

export interface PricingChannelParams {
  channel: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  label: string;
  platformCommissionPct: number; // e.g. 0% dine-in, 20% Zomato/Swiggy
  commissionGstPct: number; // 18% GST on aggregator commission
  restaurantDiscountPct: number; // Restaurant-funded coupon/discount e.g. 10%
  packagingChargeCustomer: number; // Amount billed to customer for packaging
  packagingCostActual: number; // Cost borne by restaurant
  customerGstPct: number; // 5% GST on restaurant food bills
  paymentGatewayFeePct: number; // e.g. 1.5% card/gateway fee
}

export interface SmartPriceResult {
  dishName: string;
  variantName: string;
  currentListedPrice: number;
  currentRealizedPrice: number;
  variableCost: number;
  currentContributionMarginPct: number;
  targetContributionMarginPct: number; // e.g. 40%
  minimumBreakEvenPrice: number; // = variableCost
  requiredNetRealizedPrice: number; // = variableCost / (1 - targetCM)
  recommendedListedPrice: number; // Converted customer-facing menu price
  suggestedPriceDelta: number; // recommendedListedPrice - currentListedPrice
  suggestedPriceDeltaPct: number;
  estimatedMarginAtNewPrice: number; // In INR
  estimatedContributionAtExistingVolume: number; // In INR
  channelParams: PricingChannelParams;
}

export interface FixedOperatingCosts {
  monthlyRent: number;
  fixedSalaries: number;
  fixedUtilities: number; // Electricity, water, internet
  softwareSubscriptions: number; // POS, accounting, CRM
  otherFixedExpenses: number; // Maintenance, licenses, security
  totalMonthlyFixedCosts: number;
}

export interface BreakEvenReport {
  monthlyFixedCosts: number;
  totalMonthlyContribution: number;
  totalMonthlyRevenue: number;
  weightedContributionMarginRatio: number; // Overall CM % / 100
  operatingSurplusOrDeficit: number; // Total CM - Fixed Costs
  breakEvenMonthlyRevenue: number; // Fixed Costs / CM Ratio
  revenueCoveragePct: number; // (Actual Revenue / Break-even Revenue) * 100
  contributionShortfallOrSurplus: number;
  portionsNeededToBreakEven: number;
  currentPortionsSold: number;
  portionsShortfallOrSurplus: number;
}

export interface IngredientPriceWatch {
  id: string;
  name: string;
  category: 'Meat & Poultry' | 'Seafood' | 'Dairy' | 'Grains & Flour' | 'Oils & Ghee' | 'Vegetables' | 'Spices & Condiments' | 'Packaging';
  currentPrice: number;
  unit: MeasurementUnit;
  newPrice: number;
  priceDeltaPct: number;
  affectedRecipesCount: number;
  affectedDishes: string[];
  totalMonthlyContributionImpact: number; // In INR
}
