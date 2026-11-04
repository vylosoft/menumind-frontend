import * as XLSX from 'xlsx';
import { ForecastItem, GroupingRule, ParentDish, ReconciliationReport } from '../types/restaurant';
import { DishRecipe, FixedOperatingCosts } from '../types/recipe';
import { calculateBreakEvenIntelligence, calculateParentProfitMetrics, calculateSmartSellingPrice } from './recipeCalculator';

export function exportFullExcelReport(
  parentDishes: ParentDish[],
  forecasts: ForecastItem[],
  reconciliation: ReconciliationReport,
  restaurantName = 'MenuMind Restaurant',
  recipes?: DishRecipe[],
  fixedCosts?: FixedOperatingCosts
): void {
  const wb = XLSX.utils.book_new();

  // 1. Parent Dish Summary Sheet
  const parentRows = parentDishes.map((d) => ({
    'Parent Dish Name': d.name,
    'Category': d.category,
    'Total Units Sold': d.totalQuantity,
    'Total Revenue (INR)': d.totalRevenue,
    'Average Price per Unit (INR)': d.averageRealizedPrice,
    'Menu Revenue Share (%)': d.revenueShare,
    'Volume Share (%)': d.volumeShare,
    'Revenue Rank': d.rankRevenue,
    'Volume Rank': d.rankVolume,
    'MoM Qty Growth (%)': d.momQtyChange ?? 'N/A',
    'Classification': d.classification,
    'Recommended Action': d.actionRecommendation,
    'Action Advice': d.actionAdvice,
  }));
  const wsParent = XLSX.utils.json_to_sheet(parentRows);
  XLSX.utils.book_append_sheet(wb, wsParent, 'Parent Dishes');

  // 2. Variant Level Breakdown Sheet
  const variantRows: any[] = [];
  parentDishes.forEach((d) => {
    d.variants.forEach((v) => {
      variantRows.push({
        'Parent Dish': d.name,
        'Variant Name': v.variantName,
        'Original POS Item Name': v.rawName,
        'Units Sold': v.quantity,
        'Revenue (INR)': v.revenue,
        'Average Price (INR)': Math.round(v.averagePrice * 100) / 100,
        'Share of Parent Revenue (%)': Math.round(v.revenueShare * 10) / 10,
        'Share of Parent Volume (%)': Math.round(v.volumeShare * 10) / 10,
      });
    });
  });
  const wsVariants = XLSX.utils.json_to_sheet(variantRows);
  XLSX.utils.book_append_sheet(wb, wsVariants, 'Variant Breakdown');

  // 3. Profitability & Contribution Margin Sheet (Module 3 & 12)
  if (recipes && recipes.length > 0) {
    const { parentMetrics } = calculateParentProfitMetrics(parentDishes, recipes);
    const profitRows = parentMetrics.map((p) => ({
      'Profit Rank': p.rankContribution,
      'Parent Dish': p.parentDishName,
      'Category': p.category,
      'Units Sold': p.totalQuantity,
      'Net Revenue (INR)': p.totalNetRevenue,
      'Total Variable Cost (INR)': p.totalVariableCost,
      'Total Contribution Margin (INR)': p.totalContribution,
      'Unit Contribution Margin (INR)': p.weightedUnitContribution,
      'Contribution Margin (%)': p.weightedContributionMarginPct,
      'Opportunity Classification': p.opportunityCategory,
      'Action Recommendation': p.opportunityRecommendation,
    }));
    const wsProfit = XLSX.utils.json_to_sheet(profitRows);
    XLSX.utils.book_append_sheet(wb, wsProfit, 'Contribution Margins');

    // 4. Recipe Bill of Materials (BOM) Sheet
    const bomRows: any[] = [];
    recipes.forEach((r) => {
      r.ingredients.forEach((ing) => {
        bomRows.push({
          'Parent Dish': r.parentDishName,
          'Variant': r.variantName,
          'Recipe Name': r.recipeName,
          'Ingredient': ing.name,
          'Portion Quantity': `${ing.quantity} ${ing.unit}`,
          'Purchase Price': `${ing.purchasePrice} / ${ing.purchasePackSize} ${ing.purchasePackUnit}`,
          'Edible Yield %': `${ing.yieldPct}%`,
          'Prep Loss %': `${ing.preparationLossPct}%`,
          'Portion Cost (INR)': ing.calculatedCostPerPortion,
        });
      });
      // Add summary line for packaging and fuel
      bomRows.push({
        'Parent Dish': r.parentDishName,
        'Variant': r.variantName,
        'Recipe Name': r.recipeName,
        'Ingredient': '--- Packaging, Fuel & Variable Prep ---',
        'Portion Quantity': '1 portion',
        'Purchase Price': 'Combined',
        'Edible Yield %': '100%',
        'Prep Loss %': '0%',
        'Portion Cost (INR)': r.packagingCost + r.cookingFuelCost + r.directLaborCost + r.otherVariableCost,
      });
    });
    const wsBOM = XLSX.utils.json_to_sheet(bomRows);
    XLSX.utils.book_append_sheet(wb, wsBOM, 'Recipe BOM & Costs');

    // 5. Smart Menu Pricing Recommendations
    const deliveryChannel = {
      channel: 'DELIVERY' as const,
      label: 'Delivery Aggregator',
      platformCommissionPct: 22,
      commissionGstPct: 18,
      restaurantDiscountPct: 10,
      packagingChargeCustomer: 20,
      packagingCostActual: 15,
      customerGstPct: 5,
      paymentGatewayFeePct: 0,
    };
    const pricingRows = parentMetrics.map((p) => {
      const avgCost = p.totalQuantity > 0 ? p.totalVariableCost / p.totalQuantity : 0;
      const res = calculateSmartSellingPrice(
        p.parentDishName,
        'Consolidated',
        p.averageRealizedPrice,
        avgCost,
        42,
        deliveryChannel
      );
      return {
        'Dish Name': p.parentDishName,
        'Current Price (INR)': res.currentListedPrice,
        'Variable Cost (INR)': res.variableCost,
        'Current Margin (%)': `${res.currentContributionMarginPct}%`,
        'Target Margin (%)': '42%',
        'Break-Even Price (INR)': res.minimumBreakEvenPrice,
        'Recommended Price (INR)': res.recommendedListedPrice,
        'Suggested Price Adjustment (INR)': res.suggestedPriceDelta,
        'Adjustment (%)': `${res.suggestedPriceDeltaPct}%`,
        'Channel': 'Online Delivery (22% Comm, 10% Disc)',
      };
    });
    const wsPricing = XLSX.utils.json_to_sheet(pricingRows);
    XLSX.utils.book_append_sheet(wb, wsPricing, 'Smart Pricing Recs');
  }

  // 6. Monthly Dish Performance Sheet
  const months = reconciliation.monthsPresent.length > 0 ? reconciliation.monthsPresent : [];
  const monthlyRows = parentDishes.map((d) => {
    const row: any = {
      'Parent Dish': d.name,
      'Total Units': d.totalQuantity,
      'Total Revenue (INR)': d.totalRevenue,
    };
    months.forEach((m) => {
      row[`${m} Qty`] = d.monthlyData[m]?.qty || 0;
      row[`${m} Rev (INR)`] = d.monthlyData[m]?.revenue || 0;
    });
    return row;
  });
  const wsMonthly = XLSX.utils.json_to_sheet(monthlyRows);
  XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Trends');

  // 7. Demand Forecasts Sheet
  const forecastRows = forecasts.map((f) => ({
    'Dish Name': f.dishName,
    'Forecast Horizon (Days)': f.forecastPeriodDays,
    'Base Forecast (Units)': f.baseForecastQty,
    'Conservative Scenario (Units)': f.conservativeQty,
    'Optimistic Scenario (Units)': f.optimisticQty,
    'Historical Monthly Average': f.historicalMonthlyAvg,
    'Method': f.method,
    'Reliability': f.reliability,
    'Reliability Context': f.reliabilityReason,
  }));
  const wsForecast = XLSX.utils.json_to_sheet(forecastRows);
  XLSX.utils.book_append_sheet(wb, wsForecast, 'Demand Forecasts');

  // 8. Reconciliation & Audit Log Sheet
  const auditRows = [
    { 'Metric': 'Total Imported Files', 'Value': reconciliation.fileNames.join(', ') },
    { 'Metric': 'Total Raw POS Records', 'Value': reconciliation.totalRawRows },
    { 'Metric': 'Valid Processed Records', 'Value': reconciliation.validRows },
    { 'Metric': 'Invalid Rows Excluded', 'Value': reconciliation.invalidRows },
    { 'Metric': 'Duplicate Transactions Merged', 'Value': reconciliation.duplicatesSkipped },
    { 'Metric': 'Returns/Cancellations Excluded', 'Value': reconciliation.returnsOrCancelledCount },
    { 'Metric': 'Returns Amount Excluded (INR)', 'Value': reconciliation.returnsRevenueExcluded },
    { 'Metric': 'Total Reconciled Revenue (INR)', 'Value': reconciliation.totalReportedRevenue },
    { 'Metric': 'Total Portion Units Sold', 'Value': reconciliation.totalUnitsSold },
    { 'Metric': 'Unique Parent Dishes', 'Value': parentDishes.length },
    { 'Metric': 'Date Range Start', 'Value': reconciliation.dateRangeStart || 'N/A' },
    { 'Metric': 'Date Range End', 'Value': reconciliation.dateRangeEnd || 'N/A' },
  ];
  const wsAudit = XLSX.utils.json_to_sheet(auditRows);
  XLSX.utils.book_append_sheet(wb, wsAudit, 'Data Audit & Reconciliation');

  // Save to file
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `MenuMind_${restaurantName.replace(/\s+/g, '_')}_Analytics_${dateStr}.xlsx`);
}

export function exportGroupingDictionaryJSON(rules: GroupingRule[]): void {
  const jsonStr = JSON.stringify(rules, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `menumind_dish_grouping_dictionary_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSupabaseDDLSQL(sqlContent: string): void {
  const blob = new Blob([sqlContent], { type: 'text/sql' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `menumind_supabase_schema_${new Date().toISOString().slice(0, 10)}.sql`;
  a.click();
  URL.revokeObjectURL(url);
}
