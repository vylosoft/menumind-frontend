import { ForecastItem, ParentDish } from '../types/restaurant';

export function generateDemandForecasts(
  parentDishes: ParentDish[],
  forecastPeriodDays: 7 | 14 | 30 | 60 = 30,
  granularity: 'daily' | 'monthly' | 'aggregate_only' | 'none' = 'daily'
): ForecastItem[] {
  if (granularity === 'none') {
    return [];
  }

  return parentDishes.map((dish) => {
    const monthlyVals = Object.values(dish.monthlyData).map((m) => m.qty);
    const monthsCount = monthlyVals.length;

    // Baseline calculation
    let monthlyAvg = 0;
    if (monthsCount > 0) {
      monthlyAvg = monthlyVals.reduce((a, b) => a + b, 0) / monthsCount;
    } else {
      monthlyAvg = dish.totalQuantity / (forecastPeriodDays / 30);
    }

    // Days ratio
    const periodFraction = forecastPeriodDays / 30;

    let baseQty = 0;
    let trendSlopePct = 0;
    let method: ForecastItem['method'] = 'Monthly Moving Average';
    let reliability: 'High' | 'Moderate' | 'Low' = 'Moderate';
    let reliabilityReason = '';

    if (granularity === 'aggregate_only' || monthsCount < 2) {
      method = 'Historical Baseline';
      baseQty = Math.round(monthlyAvg * periodFraction);
      reliability = 'Low';
      reliabilityReason = 'Limited date stamps in uploaded dataset. Projected from overall historical average rate.';
    } else {
      // We have monthly or daily trend data
      // Weighted average: recent months have higher weight
      let weightedSum = 0;
      let totalWeight = 0;
      monthlyVals.forEach((qty, idx) => {
        const weight = idx + 1; // earlier months have smaller weights
        weightedSum += qty * weight;
        totalWeight += weight;
      });
      const weightedMonthlyAvg = totalWeight > 0 ? weightedSum / totalWeight : monthlyAvg;

      // Calculate recent slope
      const recentMonth = monthlyVals[monthlyVals.length - 1];
      const prevMonth = monthlyVals[monthlyVals.length - 2];
      if (prevMonth > 0) {
        trendSlopePct = Math.round(((recentMonth - prevMonth) / prevMonth) * 100);
      }

      // Add day-of-week seasonality boost if period is 7 or 14 days (weekends usually +25% in Indian restaurants)
      let seasonalityMultiplier = 1.0;
      if (granularity === 'daily' && (forecastPeriodDays === 7 || forecastPeriodDays === 14)) {
        method = 'Weighted Trend + Day-of-Week Seasonality';
        seasonalityMultiplier = 1.05; // weekend weighting blend
      } else {
        method = 'Monthly Moving Average';
      }

      // Combine weighted average with dampened trend (+/- max 25% dampening to avoid runaway projections)
      const dampenedTrend = Math.max(-0.25, Math.min(0.25, trendSlopePct / 100));
      const projectedMonthly = weightedMonthlyAvg * (1 + dampenedTrend * 0.5) * seasonalityMultiplier;
      baseQty = Math.round(projectedMonthly * periodFraction);

      // Determine reliability
      // Calculate variance / CV
      const mean = monthlyAvg;
      const variance =
        monthlyVals.reduce((sum, q) => sum + Math.pow(q - mean, 2), 0) / (monthsCount || 1);
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? stdDev / mean : 1;

      if (monthsCount >= 5 && cv < 0.25) {
        reliability = 'High';
        reliabilityReason = `${monthsCount} months of consistent ordering data with low volatility (CV: ${(cv * 100).toFixed(0)}%).`;
      } else if (monthsCount >= 3) {
        reliability = 'Moderate';
        reliabilityReason = `${monthsCount} months of sales history with moderate ordering fluctuations.`;
      } else {
        reliability = 'Low';
        reliabilityReason = 'Fewer than 3 months of history available for time-series forecasting.';
      }
    }

    // Scenarios: Conservative (-15% to -25%), Optimistic (+15% to +25%)
    const spread = reliability === 'High' ? 0.12 : reliability === 'Moderate' ? 0.2 : 0.3;
    const conservativeQty = Math.max(1, Math.round(baseQty * (1 - spread)));
    const optimisticQty = Math.round(baseQty * (1 + spread));

    return {
      dishId: dish.id,
      dishName: dish.name,
      historicalTotalQty: dish.totalQuantity,
      historicalMonthlyAvg: Math.round(monthlyAvg),
      forecastPeriodDays,
      baseForecastQty: baseQty,
      conservativeQty,
      optimisticQty,
      method,
      reliability,
      reliabilityReason,
      trendSlopePct,
    };
  });
}
