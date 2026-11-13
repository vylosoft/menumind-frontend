import {
  BreakEvenReport,
  DishRecipe,
  FixedOperatingCosts,
  IngredientPriceWatch,
  MeasurementUnit,
  ParentProfitMetrics,
  PricingChannelParams,
  RecipeIngredient,
  SmartPriceResult,
  VariantProfitMetrics,
} from '../types/recipe';
import { ParentDish } from '../types/restaurant';

/**
 * Normalizes arbitrary measurement unit strings (e.g. from PDF BOMs) into valid MeasurementUnit values
 */
export function normalizeMeasurementUnit(raw?: string): MeasurementUnit {
  const clean = (raw || 'g').toLowerCase().replace(/\./g, '').trim();
  if (clean === 'kg' || clean === 'kgs' || clean === 'kilogram' || clean === 'kilograms') return 'kg';
  if (clean === 'g' || clean === 'gm' || clean === 'gms' || clean === 'gram' || clean === 'grams') return 'g';
  if (clean === 'l' || clean === 'ltr' || clean === 'ltrs' || clean === 'liter' || clean === 'liters') return 'l';
  if (clean === 'litre' || clean === 'litres') return 'litre';
  if (clean === 'ml' || clean === 'milliliter' || clean === 'millilitre') return 'ml';
  if (clean === 'tbsp' || clean === 'tablespoon' || clean === 'tablespoons') return 'tbsp';
  if (clean === 'tsp' || clean === 'teaspoon' || clean === 'teaspoons') return 'tsp';
  if (clean === 'pc' || clean === 'pcs') return 'pc';
  if (
    clean === 'piece' ||
    clean === 'pieces' ||
    clean === 'no' ||
    clean === 'nos' ||
    clean === 'unit' ||
    clean === 'units' ||
    clean === 'portion' ||
    clean === 'portions' ||
    clean === 'plate' ||
    clean === 'pkt' ||
    clean === 'pack'
  ) {
    return 'piece';
  }
  return 'g';
}

/**
 * Standardizes units into a common base unit for accurate math:
 * - 'g' & 'kg' -> 'g'
 * - 'ml' & 'l'/'litre' -> 'ml'
 * - 'piece'/'pc' -> 'piece'
 */
export function convertToBaseUnit(qty: number, unit: MeasurementUnit): { baseQty: number; baseType: 'weight' | 'volume' | 'count' } {
  const norm = (unit || 'g').toLowerCase();
  if (norm === 'kg') return { baseQty: qty * 1000, baseType: 'weight' };
  if (norm === 'g') return { baseQty: qty, baseType: 'weight' };
  if (norm === 'l' || norm === 'litre') return { baseQty: qty * 1000, baseType: 'volume' };
  if (norm === 'ml') return { baseQty: qty, baseType: 'volume' };
  if (norm === 'tbsp') return { baseQty: qty * 15, baseType: 'volume' };
  if (norm === 'tsp') return { baseQty: qty * 5, baseType: 'volume' };
  return { baseQty: qty, baseType: 'count' };
}

/**
 * Calculates exact portion cost for an ingredient taking pack size, edible yield, prep loss,
 * or direct PDF-extracted portion cost into account
 */
export function calculateIngredientPortionCost(ing: Omit<RecipeIngredient, 'id' | 'calculatedCostPerPortion'>): number {
  if (
    typeof ing.directPortionCost === 'number' &&
    !Number.isNaN(ing.directPortionCost) &&
    ing.directPortionCost >= 0 &&
    (!ing.purchasePrice || ing.purchasePrice <= 0)
  ) {
    return Math.round(ing.directPortionCost * 100) / 100;
  }

  const portion = convertToBaseUnit(ing.quantity, ing.unit);
  const pack = convertToBaseUnit(ing.purchasePackSize, ing.purchasePackUnit);

  if (pack.baseQty <= 0) {
    return typeof ing.directPortionCost === 'number' && ing.directPortionCost > 0
      ? Math.round(ing.directPortionCost * 100) / 100
      : 0;
  }

  // If unit families differ (e.g. grams vs piece in an unstructured table), avoid 1000x unit distortion
  if (portion.baseType !== pack.baseType) {
    if (typeof ing.directPortionCost === 'number' && ing.directPortionCost > 0) {
      return Math.round(ing.directPortionCost * 100) / 100;
    }
    const fallbackRatio = ing.purchasePackSize > 0 ? ing.quantity / ing.purchasePackSize : 1;
    return Math.round(fallbackRatio * ing.purchasePrice * 100) / 100;
  }

  // Cost per base unit (e.g. per gram or per ml)
  const costPerBaseUnit = ing.purchasePrice / pack.baseQty;

  // Edible yield adjustment (e.g. 85% yield means cost is 1/0.85 = ~1.176x)
  const yieldFactor = ing.yieldPct > 0 ? ing.yieldPct / 100 : 1;

  // Preparation loss adjustment (e.g. 5% loss means cost increases by 1.05x)
  const lossFactor = 1 + (ing.preparationLossPct > 0 ? ing.preparationLossPct / 100 : 0);

  const rawCost = portion.baseQty * costPerBaseUnit;
  const effectiveCost = (rawCost / yieldFactor) * lossFactor;

  return Math.round(effectiveCost * 100) / 100;
}

/**
 * Recalculates total recipe cost per portion (supports both itemized BOM and manual 1-unit cost)
 */
export function computeRecipeTotalCost(recipe: DishRecipe): DishRecipe {
  if (
    recipe.ingredients.length === 0 &&
    typeof recipe.manualUnitCost === 'number' &&
    !Number.isNaN(recipe.manualUnitCost) &&
    recipe.manualUnitCost >= 0
  ) {
    const manualBase = Math.round(recipe.manualUnitCost * 100) / 100;
    const totalVariable =
      manualBase +
      (recipe.packagingCost || 0) +
      (recipe.cookingFuelCost || 0) +
      (recipe.directLaborCost || 0) +
      (recipe.otherVariableCost || 0);
    return {
      ...recipe,
      isManualCostOnly: true,
      totalIngredientCost: manualBase,
      totalVariableCostPerPortion: Math.round(totalVariable * 100) / 100,
    };
  }

  const batchYield = recipe.batchYieldServings > 0 ? recipe.batchYieldServings : 1;

  let totalIngredientCost = 0;
  const updatedIngredients = recipe.ingredients.map((ing) => {
    const cost = calculateIngredientPortionCost(ing);
    totalIngredientCost += cost;
    return {
      ...ing,
      calculatedCostPerPortion: cost,
    };
  });

  const ingredientCostPerPortion = totalIngredientCost / batchYield;
  const totalVariable =
    ingredientCostPerPortion +
    (recipe.packagingCost || 0) +
    (recipe.cookingFuelCost || 0) +
    (recipe.directLaborCost || 0) +
    (recipe.otherVariableCost || 0);

  return {
    ...recipe,
    isManualCostOnly: false,
    ingredients: updatedIngredients,
    totalIngredientCost: Math.round(ingredientCostPerPortion * 100) / 100,
    totalVariableCostPerPortion: Math.round(totalVariable * 100) / 100,
  };
}

/**
 * Connects Petpooja Sales Parent Dishes with Dish/Variant-Level Recipes and calculates
 * exact contribution margins deterministically.
 */
export function calculateParentProfitMetrics(
  parentDishes: ParentDish[],
  recipes: DishRecipe[],
  fallbackFoodCostPct = 35
): {
  parentMetrics: ParentProfitMetrics[];
  totalRestaurantRevenue: number;
  totalRestaurantVariableCost: number;
  totalRestaurantContribution: number;
  overallContributionMarginPct: number;
  highestMarginDish?: ParentProfitMetrics;
  highestTotalContributionDish?: ParentProfitMetrics;
  highestUnitContributionDish?: ParentProfitMetrics;
  marginDestroyerDish?: ParentProfitMetrics;
  negativeContributionDishes: ParentProfitMetrics[];
} {
  let grandTotalRevenue = 0;
  let grandTotalVariableCost = 0;
  let grandTotalContribution = 0;

  // Recipe lookup map: exact variant key + parent dish fallback (for grouped unique dish costing)
  const recipeMap = new Map<string, DishRecipe>();
  const parentFallbackRecipeMap = new Map<string, DishRecipe>();
  recipes.forEach((r) => {
    const pKey = r.parentDishName.toLowerCase().trim();
    const vKey = r.variantName.toLowerCase().trim();
    recipeMap.set(`${pKey}||${vKey}`, r);

    const existingFallback = parentFallbackRecipeMap.get(pKey);
    if (
      !existingFallback ||
      vKey === 'all variants' ||
      vKey === 'standard' ||
      vKey === 'regular'
    ) {
      parentFallbackRecipeMap.set(pKey, r);
    }
  });

  const parentMetrics: ParentProfitMetrics[] = parentDishes.map((parent) => {
    let parentVariableCost = 0;
    let parentContribution = 0;
    const parentKey = parent.name.toLowerCase().trim();

    const variantMetrics: VariantProfitMetrics[] = parent.variants.map((v) => {
      const key = `${parentKey}||${v.variantName.toLowerCase().trim()}`;
      const matchedRecipe = recipeMap.get(key) || parentFallbackRecipeMap.get(parentKey);

      // Determine variable cost per portion
      let totalVarCost = 0;
      let ingCost = 0;
      let pkgCost = 0;
      let otherCost = 0;

      if (matchedRecipe) {
        totalVarCost = matchedRecipe.totalVariableCostPerPortion;
        ingCost = matchedRecipe.totalIngredientCost;
        pkgCost = matchedRecipe.packagingCost;
        otherCost =
          matchedRecipe.cookingFuelCost +
          matchedRecipe.directLaborCost +
          matchedRecipe.otherVariableCost;
      } else if (v.unitCost !== undefined && v.unitCost > 0) {
        totalVarCost = v.unitCost;
        ingCost = v.unitCost * 0.75;
        pkgCost = v.unitCost * 0.15;
        otherCost = v.unitCost * 0.1;
      } else if (parent.unitCost !== undefined && parent.unitCost > 0) {
        totalVarCost = parent.unitCost;
        ingCost = parent.unitCost * 0.85;
        pkgCost = parent.unitCost * 0.1;
        otherCost = parent.unitCost * 0.05;
      } else {
        // Fallback estimated cost based on selling price
        totalVarCost = (v.averagePrice * fallbackFoodCostPct) / 100;
        ingCost = totalVarCost * 0.8;
        pkgCost = 10;
        otherCost = 5;
      }

      // Unit Contribution Margin = Net Realized Price - Total Variable Cost per portion
      const unitCM = Math.round((v.averagePrice - totalVarCost) * 100) / 100;
      const cmPct = v.averagePrice > 0 ? (unitCM / v.averagePrice) * 100 : 0;
      const totalCM = Math.round(unitCM * v.quantity);
      const variantTotalCost = Math.round(totalVarCost * v.quantity);

      parentVariableCost += variantTotalCost;
      parentContribution += totalCM;

      return {
        rawName: v.rawName,
        variantName: v.variantName,
        quantity: v.quantity,
        netRevenue: v.revenue,
        averagePrice: v.averagePrice,
        ingredientCost: Math.round(ingCost * 100) / 100,
        packagingCost: Math.round(pkgCost * 100) / 100,
        otherVariableCost: Math.round(otherCost * 100) / 100,
        totalVariableCost: Math.round(totalVarCost * 100) / 100,
        unitContributionMargin: unitCM,
        contributionMarginPct: Math.round(cmPct * 10) / 10,
        totalContribution: totalCM,
        isNegativeMargin: unitCM < 0,
      };
    });

    grandTotalRevenue += parent.totalRevenue;
    grandTotalVariableCost += parentVariableCost;
    grandTotalContribution += parentContribution;

    const weightedUnitCM =
      parent.totalQuantity > 0 ? parentContribution / parent.totalQuantity : 0;
    const weightedCMPct =
      parent.totalRevenue > 0 ? (parentContribution / parent.totalRevenue) * 100 : 0;
    const isNegative = weightedUnitCM < 0;

    return {
      parentDishId: parent.id,
      parentDishName: parent.name,
      category: parent.category,
      totalQuantity: parent.totalQuantity,
      totalNetRevenue: parent.totalRevenue,
      totalVariableCost: Math.round(parentVariableCost),
      totalContribution: Math.round(parentContribution),
      weightedUnitContribution: Math.round(weightedUnitCM * 100) / 100,
      weightedContributionMarginPct: Math.round(weightedCMPct * 10) / 10,
      averageRealizedPrice: parent.averageRealizedPrice,
      rankContribution: 0, // Assigned below
      isNegativeMargin: isNegative,
      opportunityCategory: 'DOUBLE_DOWN', // Assigned below
      opportunityRecommendation: '',
      actionDetails: [],
      variants: variantMetrics,
      hasCompleteRecipe: variantMetrics.some((v) =>
        recipes.some((r) => r.parentDishName.toLowerCase() === parent.name.toLowerCase())
      ),
    };
  });

  // Assign rankings
  parentMetrics.sort((a, b) => b.totalContribution - a.totalContribution);
  parentMetrics.forEach((d, idx) => {
    d.rankContribution = idx + 1;
  });

  // Calculate restaurant averages for benchmark classification
  const avgQty = parentMetrics.length > 0 ? parentDishes.reduce((s, d) => s + d.totalQuantity, 0) / parentMetrics.length : 1;
  const avgTotalCM = grandTotalContribution / (parentMetrics.length || 1);
  const targetBenchmarkCMPct = 40; // 40% standard commercial food contribution margin threshold

  // Classify into 5 distinct opportunity categories
  parentMetrics.forEach((item) => {
    const isHighDemand = item.totalQuantity >= avgQty;
    const isHighMargin = item.weightedContributionMarginPct >= targetBenchmarkCMPct || item.totalContribution >= avgTotalCM;

    if (item.weightedUnitContribution < 0) {
      item.opportunityCategory = 'NEGATIVE_CONTRIBUTION';
      item.opportunityRecommendation = `Losing ${Math.abs(item.weightedUnitContribution)} per portion. Selling below direct variable costs!`;
      item.actionDetails = [
        'Urgent reprice required (+15% to +25%) to cover raw food and packaging.',
        'Review recipe portioning: audit chef serving consistency.',
        'Halt restaurant-funded discounts on aggregator channels.',
      ];
    } else if (isHighDemand && isHighMargin) {
      item.opportunityCategory = 'DOUBLE_DOWN';
      item.opportunityRecommendation = `Top profitability engine (${item.weightedContributionMarginPct}% CM, ${item.totalQuantity} units sold). High priority for menu promotion.`;
      item.actionDetails = [
        'Place at top-left / center of physical and digital menus (Golden Triangle).',
        'Protect zero-stockout inventory during peak rush.',
        'Feature as signature chef pairing with complementary high-margin beverages.',
      ];
    } else if (isHighDemand && !isHighMargin) {
      item.opportunityCategory = 'HIGH_DEMAND_LOW_MARGIN';
      item.opportunityRecommendation = `High volume (${item.totalQuantity} units), but capturing only ${item.weightedContributionMarginPct}% margin. Potential margin erosion.`;
      item.actionDetails = [
        'Implement controlled price increase of ₹10–₹25 per portion.',
        'Negotiate bulk raw material contracts for primary ingredients.',
        'Optimize packaging to reduce per-unit delivery container cost.',
      ];
    } else if (!isHighDemand && isHighMargin) {
      item.opportunityCategory = 'HIGH_MARGIN_LOW_DEMAND';
      item.opportunityRecommendation = `High unit margin (${item.weightedContributionMarginPct}% CM), but under-ordered relative to potential.`;
      item.actionDetails = [
        'Increase visual prominence with high-quality photography.',
        'Bundle with bestsellers (e.g. Biryani + Paturi combo).',
        'Train service staff to actively recommend as daily specialty.',
      ];
    } else {
      item.opportunityCategory = 'LOW_DEMAND_LOW_MARGIN';
      item.opportunityRecommendation = `Low sales volume and modest contribution margin. Menu exit or consolidation candidate.`;
      item.actionDetails = [
        'Audit ingredient overlap: check if unique perishable stock can be removed.',
        'Consider consolidating variants or offering exclusively on weekends.',
        'Simulate menu removal impact on kitchen throughput.',
      ];
    }
  });

  const overallCMPct =
    grandTotalRevenue > 0 ? (grandTotalContribution / grandTotalRevenue) * 100 : 0;

  // Key highlight dishes
  const highestMargin = [...parentMetrics].sort(
    (a, b) => b.weightedContributionMarginPct - a.weightedContributionMarginPct
  )[0];
  const highestUnitCM = [...parentMetrics].sort(
    (a, b) => b.weightedUnitContribution - a.weightedUnitContribution
  )[0];
  const highestTotalCM = parentMetrics[0];

  // High revenue but low contribution dish (Margin Destroyer)
  const marginDestroyer = [...parentMetrics]
    .filter((d) => d.totalNetRevenue > grandTotalRevenue * 0.05)
    .sort((a, b) => a.weightedContributionMarginPct - b.weightedContributionMarginPct)[0];

  const negativeDishes = parentMetrics.filter((d) => d.isNegativeMargin);

  return {
    parentMetrics,
    totalRestaurantRevenue: Math.round(grandTotalRevenue),
    totalRestaurantVariableCost: Math.round(grandTotalVariableCost),
    totalRestaurantContribution: Math.round(grandTotalContribution),
    overallContributionMarginPct: Math.round(overallCMPct * 10) / 10,
    highestMarginDish: highestMargin,
    highestTotalContributionDish: highestTotalCM,
    highestUnitContributionDish: highestUnitCM,
    marginDestroyerDish: marginDestroyer,
    negativeContributionDishes: negativeDishes,
  };
}

/**
 * Calculates AI-Powered Smart Selling Price to achieve desired contribution margin
 * across different sales channels (Dine-in, Takeaway, Delivery).
 *
 * Formula: Required Net Realized Revenue = Variable Cost / (1 - Target CM)
 * Customer Listed Menu Price is then derived by reverse-solving platform commission,
 * restaurant-funded discounts, customer packaging fee, and applicable GST.
 */
export function calculateSmartSellingPrice(
  dishName: string,
  variantName: string,
  currentListedPrice: number,
  variableCost: number,
  targetContributionMarginPct: number, // e.g. 40%
  channelParams: PricingChannelParams
): SmartPriceResult {
  const targetCMFraction = Math.max(0.05, Math.min(0.9, targetContributionMarginPct / 100));

  // 1. Required Net Realized Revenue to achieve target CM
  const requiredNetRealized = variableCost / (1 - targetCMFraction);

  // 2. Channel Conversion adjustments
  const commission = channelParams.platformCommissionPct / 100;
  const discount = channelParams.restaurantDiscountPct / 100;
  const packagingCredit = channelParams.packagingChargeCustomer - channelParams.packagingCostActual;

  // Effective revenue retained fraction after restaurant discount and platform cut
  // Net Retained = ListedPrice * (1 - discount) * (1 - commission) + packagingCredit
  const retentionMultiplier = Math.max(0.2, (1 - discount) * (1 - commission));
  const baseNeeded = Math.max(0, requiredNetRealized - packagingCredit);

  let recommendedListedPrice = Math.round(baseNeeded / retentionMultiplier);

  // Round up to nearest psychological price ending (e.g. 9 or 0, or clean integer)
  recommendedListedPrice = Math.ceil(recommendedListedPrice / 5) * 5;

  const currentRealized = currentListedPrice * (1 - discount) * (1 - commission) + packagingCredit;
  const currentCM = currentRealized - variableCost;
  const currentCMPct = currentRealized > 0 ? (currentCM / currentRealized) * 100 : 0;

  const suggestedDelta = recommendedListedPrice - currentListedPrice;
  const suggestedDeltaPct = currentListedPrice > 0 ? (suggestedDelta / currentListedPrice) * 100 : 0;

  const estimatedNewMargin = (recommendedListedPrice * retentionMultiplier + packagingCredit) - variableCost;

  return {
    dishName,
    variantName,
    currentListedPrice,
    currentRealizedPrice: Math.round(currentRealized * 100) / 100,
    variableCost: Math.round(variableCost * 100) / 100,
    currentContributionMarginPct: Math.round(currentCMPct * 10) / 10,
    targetContributionMarginPct,
    minimumBreakEvenPrice: Math.round(variableCost),
    requiredNetRealizedPrice: Math.round(requiredNetRealized * 100) / 100,
    recommendedListedPrice,
    suggestedPriceDelta: suggestedDelta,
    suggestedPriceDeltaPct: Math.round(suggestedDeltaPct * 10) / 10,
    estimatedMarginAtNewPrice: Math.round(estimatedNewMargin * 100) / 100,
    estimatedContributionAtExistingVolume: 0, // Scaled in views
    channelParams,
  };
}

/**
 * Calculates Monthly Fixed Operating Cost Coverage and Break-Even Point
 */
export function calculateBreakEvenIntelligence(
  totalMonthlyRevenue: number,
  totalMonthlyContribution: number,
  totalMonthlyUnits: number,
  fixedCosts: FixedOperatingCosts
): BreakEvenReport {
  const fixedTotal =
    fixedCosts.monthlyRent +
    fixedCosts.fixedSalaries +
    fixedCosts.fixedUtilities +
    fixedCosts.softwareSubscriptions +
    fixedCosts.otherFixedExpenses;

  const weightedCMRatio = totalMonthlyRevenue > 0 ? totalMonthlyContribution / totalMonthlyRevenue : 0.35;
  const avgUnitCM = totalMonthlyUnits > 0 ? totalMonthlyContribution / totalMonthlyUnits : 80;

  // Break-even Revenue = Fixed Costs / Contribution Margin Ratio
  const breakEvenRevenue = weightedCMRatio > 0 ? Math.round(fixedTotal / weightedCMRatio) : 0;
  const operatingSurplus = Math.round(totalMonthlyContribution - fixedTotal);
  const revenueCoveragePct = breakEvenRevenue > 0 ? Math.round((totalMonthlyRevenue / breakEvenRevenue) * 100) : 0;

  // Portions needed to break even = Fixed Costs / Avg Unit CM
  const portionsToBreakEven = avgUnitCM > 0 ? Math.ceil(fixedTotal / avgUnitCM) : 0;
  const portionsShortfallOrSurplus = Math.round(totalMonthlyUnits - portionsToBreakEven);

  return {
    monthlyFixedCosts: fixedTotal,
    totalMonthlyContribution: Math.round(totalMonthlyContribution),
    totalMonthlyRevenue: Math.round(totalMonthlyRevenue),
    weightedContributionMarginRatio: Math.round(weightedCMRatio * 1000) / 1000,
    operatingSurplusOrDeficit: operatingSurplus,
    breakEvenMonthlyRevenue: breakEvenRevenue,
    revenueCoveragePct,
    contributionShortfallOrSurplus: operatingSurplus,
    portionsNeededToBreakEven: portionsToBreakEven,
    currentPortionsSold: totalMonthlyUnits,
    portionsShortfallOrSurplus,
  };
}

export interface AffectedDishImpact {
  dishName: string;
  variantName: string;
  ingredientQtyInPortion: number;
  ingredientUnit: string;
  currentPortionCost: number;
  newPortionCost: number;
  currentMarginPct: number;
  newMarginPct: number;
  monthlyProfitErosion: number;
}

/**
 * Calculates commodity price shock impact across recipes and Petpooja sales volume
 */
export function calculateCommodityPriceShockImpact(
  ingredientName: string,
  currentPrice: number,
  newPrice: number,
  parentDishes: ParentDish[],
  recipes: DishRecipe[]
): {
  ingredientName: string;
  priceDeltaPct: number;
  totalMonthlyProfitErosion: number;
  affectedDishes: AffectedDishImpact[];
} {
  const normName = ingredientName.toLowerCase().trim();
  const deltaPct = currentPrice > 0 ? Math.round(((newPrice - currentPrice) / currentPrice) * 100) : 0;
  let totalMonthlyProfitErosion = 0;
  const affectedDishes: AffectedDishImpact[] = [];

  recipes.forEach((r) => {
    const matchedIng = r.ingredients.find(
      (ing) =>
        ing.name.toLowerCase().includes(normName) ||
        normName.includes(ing.name.toLowerCase()) ||
        (normName.includes('chicken') && ing.name.toLowerCase().includes('chicken')) ||
        (normName.includes('mutton') && ing.name.toLowerCase().includes('mutton')) ||
        (normName.includes('ilish') && ing.name.toLowerCase().includes('ilish')) ||
        (normName.includes('bhetki') && ing.name.toLowerCase().includes('bhetki')) ||
        (normName.includes('mustard oil') && ing.name.toLowerCase().includes('oil')) ||
        (normName.includes('rice') && ing.name.toLowerCase().includes('rice')) ||
        (normName.includes('paneer') && ing.name.toLowerCase().includes('paneer'))
    );

    if (matchedIng) {
      const oldPortionCost = matchedIng.calculatedCostPerPortion;
      const newPortionCost = calculateIngredientPortionCost({
        ...matchedIng,
        purchasePrice: newPrice,
      });

      const portionCostIncrease = Math.max(0, newPortionCost - oldPortionCost);

      const parent = parentDishes.find((p) => p.name.toLowerCase() === r.parentDishName.toLowerCase());
      const variant = parent?.variants.find((v) => v.variantName.toLowerCase() === r.variantName.toLowerCase());
      const totalUnits = variant ? variant.quantity : parent ? parent.totalQuantity : 100;
      const monthlyUnits = Math.round(totalUnits / 6);
      const monthlyErosion = Math.round(portionCostIncrease * monthlyUnits);

      totalMonthlyProfitErosion += monthlyErosion;

      const currentAvgPrice = variant ? variant.averagePrice : parent ? parent.averageRealizedPrice : 200;
      const currentUnitCM = currentAvgPrice - r.totalVariableCostPerPortion;
      const currentMarginPct = currentAvgPrice > 0 ? Math.round((currentUnitCM / currentAvgPrice) * 100) : 35;
      const newUnitCM = currentAvgPrice - (r.totalVariableCostPerPortion + portionCostIncrease);
      const newMarginPct = currentAvgPrice > 0 ? Math.round((newUnitCM / currentAvgPrice) * 100) : 30;

      affectedDishes.push({
        dishName: r.parentDishName,
        variantName: r.variantName,
        ingredientQtyInPortion: matchedIng.quantity,
        ingredientUnit: matchedIng.unit,
        currentPortionCost: Math.round(oldPortionCost * 10) / 10,
        newPortionCost: Math.round(newPortionCost * 10) / 10,
        currentMarginPct,
        newMarginPct,
        monthlyProfitErosion: monthlyErosion,
      });
    }
  });

  return {
    ingredientName,
    priceDeltaPct: deltaPct,
    totalMonthlyProfitErosion,
    affectedDishes,
  };
}
