import {
  ActionRecommendation,
  DishVariant,
  GroupingRule,
  MatrixQuadrant,
  MenuClassification,
  ParentDish,
  RawSalesRecord,
} from '../types/restaurant';
import { normalizeDishName } from './dishNormalizer';

export interface AggregationOptions {
  stripPrefixes?: boolean;
  costOverrides?: Record<
    string,
    {
      unitCost?: number;
      packagingCost?: number;
      commissionRatePct?: number;
      preparationCost?: number;
      isSignature?: boolean;
      isCulturallyImportant?: boolean;
    }
  >;
}

export function aggregateSalesByParentDish(
  records: RawSalesRecord[],
  rules: GroupingRule[] = [],
  options: AggregationOptions = { stripPrefixes: true }
): {
  parentDishes: ParentDish[];
  totalRevenue: number;
  totalQuantity: number;
  averageDishRevenue: number;
  averageDishQuantity: number;
  averageContributionMargin?: number;
} {
  let grandTotalRevenue = 0;
  let grandTotalQuantity = 0;

  // Intermediate accumulator map: key = parentDishName
  interface Accumulator {
    id: string;
    name: string;
    category: string;
    variantMap: Map<
      string,
      {
        rawName: string;
        variantName: string;
        quantity: number;
        revenue: number;
      }
    >;
    totalQty: number;
    totalRev: number;
    monthlyData: Record<string, { qty: number; revenue: number }>;
  }

  const map = new Map<string, Accumulator>();

  records.forEach((rec) => {
    grandTotalRevenue += rec.revenue;
    grandTotalQuantity += rec.quantity;

    const norm = normalizeDishName(rec.rawItemName, rec.rawVariantName, rules, {
      stripPrefixes: options.stripPrefixes,
    });

    const parentName = norm.parentDishName;
    const variantName = norm.variantName;

    if (!map.has(parentName)) {
      map.set(parentName, {
        id: `dish-${parentName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: parentName,
        category: rec.category || 'General',
        variantMap: new Map(),
        totalQty: 0,
        totalRev: 0,
        monthlyData: {},
      });
    }

    const parent = map.get(parentName)!;
    parent.totalQty += rec.quantity;
    parent.totalRev += rec.revenue;

    // Track variant
    if (!parent.variantMap.has(variantName)) {
      parent.variantMap.set(variantName, {
        rawName: rec.rawItemName,
        variantName,
        quantity: 0,
        revenue: 0,
      });
    }
    const variantEntry = parent.variantMap.get(variantName)!;
    variantEntry.quantity += rec.quantity;
    variantEntry.revenue += rec.revenue;

    // Track monthly data if date exists
    if (rec.date) {
      const ym = rec.date.slice(0, 7); // YYYY-MM
      if (!parent.monthlyData[ym]) {
        parent.monthlyData[ym] = { qty: 0, revenue: 0 };
      }
      parent.monthlyData[ym].qty += rec.quantity;
      parent.monthlyData[ym].revenue += rec.revenue;
    }
  });

  const parentCount = map.size;
  const avgRev = parentCount > 0 ? grandTotalRevenue / parentCount : 0;
  const avgQty = parentCount > 0 ? grandTotalQuantity / parentCount : 0;

  // Transform accumulators into ParentDish models
  const dishes: ParentDish[] = Array.from(map.values()).map((acc) => {
    const avgPrice = acc.totalQty > 0 ? acc.totalRev / acc.totalQty : 0;
    const revShare = grandTotalRevenue > 0 ? (acc.totalRev / grandTotalRevenue) * 100 : 0;
    const volShare = grandTotalQuantity > 0 ? (acc.totalQty / grandTotalQuantity) * 100 : 0;

    // Compile variants
    const variants: DishVariant[] = Array.from(acc.variantMap.values())
      .map((v) => ({
        rawName: v.rawName,
        variantName: v.variantName,
        quantity: v.quantity,
        revenue: v.revenue,
        averagePrice: v.quantity > 0 ? v.revenue / v.quantity : 0,
        revenueShare: acc.totalRev > 0 ? (v.revenue / acc.totalRev) * 100 : 0,
        volumeShare: acc.totalQty > 0 ? (v.quantity / acc.totalQty) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Compute trend metrics (MoM & L3M vs P3M)
    const sortedMonths = Object.keys(acc.monthlyData).sort();
    let momQtyChange: number | undefined;
    let momRevChange: number | undefined;
    let l3mVsP3mChange: number | undefined;
    let trendDirection: 'RISING' | 'STABLE' | 'DECLINING' = 'STABLE';

    if (sortedMonths.length >= 2) {
      const lastMonth = sortedMonths[sortedMonths.length - 1];
      const prevMonth = sortedMonths[sortedMonths.length - 2];
      const lastData = acc.monthlyData[lastMonth];
      const prevData = acc.monthlyData[prevMonth];

      if (prevData && prevData.qty > 0) {
        momQtyChange = ((lastData.qty - prevData.qty) / prevData.qty) * 100;
      }
      if (prevData && prevData.revenue > 0) {
        momRevChange = ((lastData.revenue - prevData.revenue) / prevData.revenue) * 100;
      }
    }

    if (sortedMonths.length >= 6) {
      const l3mMonths = sortedMonths.slice(-3);
      const p3mMonths = sortedMonths.slice(-6, -3);

      const l3mQty = l3mMonths.reduce((sum, m) => sum + (acc.monthlyData[m]?.qty || 0), 0);
      const p3mQty = p3mMonths.reduce((sum, m) => sum + (acc.monthlyData[m]?.qty || 0), 0);

      if (p3mQty > 0) {
        l3mVsP3mChange = ((l3mQty - p3mQty) / p3mQty) * 100;
      }
    }

    // Determine overall trend
    const primaryChange = l3mVsP3mChange !== undefined ? l3mVsP3mChange : momQtyChange;
    if (primaryChange !== undefined) {
      if (primaryChange >= 10) trendDirection = 'RISING';
      else if (primaryChange <= -10) trendDirection = 'DECLINING';
      else trendDirection = 'STABLE';
    }

    // Cost data application
    const costSpec = options.costOverrides?.[acc.name];
    const hasCostData = Boolean(costSpec && costSpec.unitCost !== undefined);
    const unitCost = costSpec?.unitCost;
    const packagingCost = costSpec?.packagingCost || 0;
    const commissionRatePct = costSpec?.commissionRatePct || 0;
    const preparationCost = costSpec?.preparationCost || 0;

    let totalUnitCost: number | undefined;
    let contributionMargin: number | undefined;
    let totalContributionMargin: number | undefined;
    let contributionMarginPct: number | undefined;

    if (hasCostData && unitCost !== undefined) {
      const commissionCost = (avgPrice * commissionRatePct) / 100;
      totalUnitCost = unitCost + packagingCost + preparationCost + commissionCost;
      contributionMargin = avgPrice - totalUnitCost;
      totalContributionMargin = contributionMargin * acc.totalQty;
      contributionMarginPct = avgPrice > 0 ? (contributionMargin / avgPrice) * 100 : 0;
    }

    return {
      id: acc.id,
      name: acc.name,
      category: acc.category,
      variants,
      totalQuantity: acc.totalQty,
      totalRevenue: acc.totalRev,
      averageRealizedPrice: Math.round(avgPrice * 100) / 100,
      revenueShare: Math.round(revShare * 10) / 10,
      volumeShare: Math.round(volShare * 10) / 10,
      rankRevenue: 0, // set below
      rankVolume: 0, // set below
      monthlyData: acc.monthlyData,
      momQtyChange: momQtyChange !== undefined ? Math.round(momQtyChange * 10) / 10 : undefined,
      momRevChange: momRevChange !== undefined ? Math.round(momRevChange * 10) / 10 : undefined,
      l3mVsP3mChange: l3mVsP3mChange !== undefined ? Math.round(l3mVsP3mChange * 10) / 10 : undefined,
      trendDirection,
      classification: 'STABLE', // assigned below
      actionRecommendation: 'MONITOR', // assigned below
      recommendationReason: '',
      actionAdvice: '',
      riskTradeoffs: '',
      confidenceScore: 90,
      hasCostData,
      unitCost,
      packagingCost,
      commissionRatePct,
      preparationCost,
      totalUnitCost: totalUnitCost !== undefined ? Math.round(totalUnitCost * 100) / 100 : undefined,
      contributionMargin: contributionMargin !== undefined ? Math.round(contributionMargin * 100) / 100 : undefined,
      totalContributionMargin: totalContributionMargin !== undefined ? Math.round(totalContributionMargin) : undefined,
      contributionMarginPct: contributionMarginPct !== undefined ? Math.round(contributionMarginPct * 10) / 10 : undefined,
      isSignatureDish: costSpec?.isSignature ?? false,
      isCulturallyImportant: costSpec?.isCulturallyImportant ?? false,
    };
  });

  // Assign rankings
  const byRev = [...dishes].sort((a, b) => b.totalRevenue - a.totalRevenue);
  byRev.forEach((d, idx) => {
    d.rankRevenue = idx + 1;
  });

  const byQty = [...dishes].sort((a, b) => b.totalQuantity - a.totalQuantity);
  byQty.forEach((d, idx) => {
    d.rankVolume = idx + 1;
  });

  // Calculate average contribution margin across items that have costs
  const dishesWithCosts = dishes.filter((d) => d.hasCostData && d.contributionMargin !== undefined);
  const avgMargin =
    dishesWithCosts.length > 0
      ? dishesWithCosts.reduce((sum, d) => sum + (d.contributionMargin || 0), 0) / dishesWithCosts.length
      : undefined;

  // Classify dishes and determine Matrix Quadrants & Actions
  dishes.forEach((dish) => {
    const isHighVolume = dish.totalQuantity >= avgQty;
    const isHighRevenue = dish.totalRevenue >= avgRev;
    const isHighMargin = avgMargin !== undefined && dish.contributionMargin !== undefined ? dish.contributionMargin >= avgMargin : false;

    // 4-Quadrant Kasavana & Smith Matrix
    if (dish.hasCostData && avgMargin !== undefined) {
      if (isHighVolume && isHighMargin) dish.matrixQuadrant = 'STAR';
      else if (isHighVolume && !isHighMargin) dish.matrixQuadrant = 'PLOWHORSE';
      else if (!isHighVolume && isHighMargin) dish.matrixQuadrant = 'PUZZLE';
      else dish.matrixQuadrant = 'DOG';
    }

    // Classification & Action Recommendations
    const trend = dish.l3mVsP3mChange !== undefined ? dish.l3mVsP3mChange : dish.momQtyChange;

    if (dish.rankVolume <= 5 || (isHighVolume && isHighRevenue)) {
      dish.classification = 'DEMAND_LEADER';
      dish.actionRecommendation = 'DOUBLE_DOWN';
      dish.recommendationReason = `Top volume driver (${dish.totalQuantity} units, ${dish.volumeShare}% menu share). Consistently high orders anchor kitchen throughput.`;
      dish.actionAdvice =
        'Ensure 100% ingredient availability during peak rush. Feature prominently at top of menu. Test a controlled 3-5% price adjustment if margin is moderate.';
      dish.riskTradeoffs = 'High customer sensitivity: Avoid modifying portions or altering the core recipe.';
      dish.confidenceScore = 95;
    } else if (dish.rankRevenue <= 5 || (isHighRevenue && !isHighVolume)) {
      dish.classification = 'REVENUE_CHAMPION';
      dish.actionRecommendation = 'PROMOTE';
      dish.recommendationReason = `Generates high revenue per unit sold (Avg price: ₹${dish.averageRealizedPrice}). Crucial anchor for monthly gross income.`;
      dish.actionAdvice =
        'Feature as chef recommendation. Train floor staff on food pairings and premium variant upgrades.';
      dish.riskTradeoffs = 'Premium pricing requires strict quality consistency; prep delays can impact customer ratings.';
      dish.confidenceScore = 92;
    } else if (trend !== undefined && trend >= 15) {
      dish.classification = 'RISING_STAR';
      dish.actionRecommendation = 'DOUBLE_DOWN';
      dish.recommendationReason = `Strong upward sales trajectory (+${trend}% growth). Consumer interest and repeat orders are expanding rapidly.`;
      dish.actionAdvice =
        'Boost menu prominence, run targeted weekend promotions, and prepare additional kitchen prep batches.';
      dish.riskTradeoffs = 'Ensure supply chain can handle increased demand without ingredient substitutions.';
      dish.confidenceScore = 88;
    } else if (dish.hasCostData && dish.contributionMarginPct && dish.contributionMarginPct >= 60 && !isHighVolume) {
      dish.classification = 'HIDDEN_GEM';
      dish.actionRecommendation = 'PROMOTE';
      dish.recommendationReason = `Exceptional profitability (${dish.contributionMarginPct}% contribution margin), but under-ordered relative to potential.`;
      dish.actionAdvice =
        'Increase visual prominence on menu. Pair as a combo with high-frequency items or offer introductory tasting portions.';
      dish.riskTradeoffs = 'Avoid heavy discounting which would erode its attractive margin advantage.';
      dish.confidenceScore = 85;
    } else if (trend !== undefined && trend <= -20 && !dish.isCulturallyImportant) {
      dish.classification = 'DECLINING';
      dish.actionRecommendation = 'OPTIMIZE';
      dish.recommendationReason = `Sustained demand contraction (${trend}% drop). Sales volume has softened over recent periods.`;
      dish.actionAdvice =
        'Review recipe quality, presentation, and competitive pricing. Solicit guest feedback before considering removal.';
      dish.riskTradeoffs = 'Sudden removal may alienate remaining loyal patrons if it complements other orders.';
      dish.confidenceScore = 84;
    } else if (dish.rankVolume > parentCount - 3 && dish.rankRevenue > parentCount - 3) {
      dish.classification = 'EXIT_CANDIDATE';
      if (dish.isCulturallyImportant || dish.isSignatureDish) {
        dish.actionRecommendation = 'MONITOR';
        dish.recommendationReason = `Low unit volume (${dish.totalQuantity} units), but marked as culturally or strategically essential to restaurant heritage.`;
        dish.actionAdvice = 'Simplify preparation, use frozen/prep-batch storage, or offer exclusively on weekends.';
        dish.riskTradeoffs = 'Removing would harm reputation as an authentic Bengali cuisine destination.';
        dish.confidenceScore = 90;
      } else {
        dish.actionRecommendation = 'CONSIDER_REMOVING';
        dish.recommendationReason = `Consistently in bottom 10% of revenue and volume (${dish.totalQuantity} units total, ${dish.revenueShare}% revenue share).`;
        dish.actionAdvice =
          'Test a 30-day removal simulator. Gauge whether orders shift smoothly to adjacent parent dishes to trim pantry spoilage.';
        dish.riskTradeoffs = 'Low risk. Verify whether it shares unique perishable ingredients with other items.';
        dish.confidenceScore = 86;
      }
    } else {
      dish.classification = 'STABLE';
      dish.actionRecommendation = 'MONITOR';
      dish.recommendationReason = `Reliable middle-of-menu item maintaining consistent order patterns without notable volatility.`;
      dish.actionAdvice = 'Keep recipe and positioning steady. Monitor raw ingredient cost fluctuations.';
      dish.riskTradeoffs = 'No immediate action required.';
      dish.confidenceScore = 82;
    }
  });

  return {
    parentDishes: dishes,
    totalRevenue: grandTotalRevenue,
    totalQuantity: grandTotalQuantity,
    averageDishRevenue: Math.round(avgRev),
    averageDishQuantity: Math.round(avgQty),
    averageContributionMargin: avgMargin ? Math.round(avgMargin * 100) / 100 : undefined,
  };
}
