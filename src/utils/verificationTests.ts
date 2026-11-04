import { DEMO_SPECS, generateDemoSalesRecords } from '../data/demoPetpoojaDataset';
import { DEFAULT_RECIPES, DEFAULT_FIXED_OPERATING_COSTS } from '../data/defaultRecipes';
import { canMergeSafely, normalizeDishName } from './dishNormalizer';
import { generateDemandForecasts } from './forecastingEngine';
import { aggregateSalesByParentDish } from './salesAggregator';
import {
  calculateBreakEvenIntelligence,
  calculateIngredientPortionCost,
  calculateParentProfitMetrics,
  calculateSmartSellingPrice,
  convertToBaseUnit,
} from './recipeCalculator';
import { detectOutletFromItemName, groupSalesByOutlet } from './outletGroupingManager';

export interface TestResult {
  id: number;
  title: string;
  category: string;
  passed: boolean;
  expected: string;
  actual: string;
  details: string;
}

export function runMandatoryVerificationSuite(): {
  results: TestResult[];
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
} {
  const results: TestResult[] = [];
  const records = generateDemoSalesRecords();
  const { parentDishes, totalQuantity, totalRevenue } = aggregateSalesByParentDish(records);

  // 1. Four Chicken Biryani variants merged into one parent dish
  const chickenBiryani = parentDishes.find((d) => d.name.toLowerCase() === 'chicken biryani');
  const variantNames = chickenBiryani?.variants.map((v) => v.variantName).sort() || [];
  const expectedVariants = ['Large', 'Light', 'Small', 'Standard'].sort();
  const test1Passed =
    Boolean(chickenBiryani) &&
    variantNames.length === 4 &&
    expectedVariants.every((ev) => variantNames.includes(ev));

  results.push({
    id: 1,
    title: 'Chicken Biryani Variant Rollup',
    category: 'Intelligent Dish Grouping',
    passed: test1Passed,
    expected: 'Single parent dish "Chicken Biryani" with 4 variants (Light, Small, Standard, Large)',
    actual: chickenBiryani
      ? `Parent: "${chickenBiryani.name}", Variants: [${variantNames.join(', ')}]`
      : 'Not found',
    details: 'Verified that all 4 size variations are correctly recognized under one parent dish.',
  });

  // 2. Chicken Biryani Total Quantity equals exactly 640 units
  const cbQty = chickenBiryani?.totalQuantity || 0;
  const test2Passed = cbQty === 640;
  results.push({
    id: 2,
    title: 'Chicken Biryani Quantity Reconciled to Exactly 640',
    category: 'Exact Aggregation',
    passed: test2Passed,
    expected: '640 units',
    actual: `${cbQty} units`,
    details: '120 (Light) + 180 (Small) + 250 (Standard) + 90 (Large) = 640 units.',
  });

  // 3. Chicken Biryani Total Revenue equals exactly ₹1,48,000
  const cbRev = chickenBiryani?.totalRevenue || 0;
  const test3Passed = cbRev === 148000;
  results.push({
    id: 3,
    title: 'Chicken Biryani Revenue Reconciled to Exactly ₹1,48,000',
    category: 'Exact Aggregation',
    passed: test3Passed,
    expected: '₹1,48,000 (Average price ₹231.25)',
    actual: `₹${cbRev.toLocaleString('en-IN')} (Average price ₹${(cbRev / (cbQty || 1)).toFixed(2)})`,
    details: '₹18,000 + ₹36,000 + ₹62,500 + ₹31,500 = ₹1,48,000.',
  });

  // 4. Chicken Biryani and Mutton Biryani are NOT merged
  const muttonBiryani = parentDishes.find((d) => d.name.toLowerCase() === 'mutton biryani');
  const guardCheck = canMergeSafely('Chicken Biryani', 'Mutton Biryani');
  const test4Passed = Boolean(chickenBiryani) && Boolean(muttonBiryani) && !guardCheck;
  results.push({
    id: 4,
    title: 'Protein Separation Guardrail (Chicken vs Mutton Biryani)',
    category: 'Grouping Safety Guardrails',
    passed: test4Passed,
    expected: 'Chicken Biryani and Mutton Biryani must remain completely separate parent dishes',
    actual: `Chicken: "${chickenBiryani?.name}" (${cbQty} units), Mutton: "${muttonBiryani?.name}" (${muttonBiryani?.totalQuantity} units)`,
    details: 'Verified strict guardrail prohibiting cross-protein merging.',
  });

  // 5. Distinct fish dishes remain separate
  const rohu = parentDishes.find((d) => d.name.toLowerCase().includes('rohu'));
  const katla = parentDishes.find((d) => d.name.toLowerCase().includes('katla'));
  const shorsheIlish = parentDishes.find((d) => d.name.toLowerCase().includes('shorshe ilish'));
  const ilishJhol = parentDishes.find((d) => d.name.toLowerCase().includes('ilish jhol'));
  const test5Passed =
    Boolean(rohu) &&
    Boolean(katla) &&
    Boolean(shorsheIlish) &&
    Boolean(ilishJhol) &&
    rohu?.id !== katla?.id &&
    shorsheIlish?.id !== ilishJhol?.id;
  results.push({
    id: 5,
    title: 'Specific Fish Species Separation Guardrail',
    category: 'Grouping Safety Guardrails',
    passed: test5Passed,
    expected: 'Rohu, Katla, Shorshe Ilish, and Ilish Jhol must each remain distinct menu items',
    actual: `Rohu: "${rohu?.name}", Katla: "${katla?.name}", Shorshe Ilish: "${shorsheIlish?.name}", Ilish Jhol: "${ilishJhol?.name}"`,
    details: 'Verified that distinct Bengali fish varieties are never improperly merged.',
  });

  // 6. Non-fabrication of forecasts when dates absent
  const forecasts = generateDemandForecasts(parentDishes, 30, 'none');
  const test6Passed = forecasts.length === 0;
  results.push({
    id: 6,
    title: 'Non-Fabrication of Forecasts Rule',
    category: 'Forecasting Integrity',
    passed: test6Passed,
    expected: '0 forecasts generated when sales date granularity is none',
    actual: `${forecasts.length} forecasts generated`,
    details: 'Verified the system refuses to fabricate trends when dates are missing.',
  });

  // 7. Chicken Biryani Variant-Level Variable Costs
  const profitMetrics = calculateParentProfitMetrics(parentDishes, DEFAULT_RECIPES);
  const cbMetrics = profitMetrics.parentMetrics.find((p) => p.parentDishName.toLowerCase() === 'chicken biryani');
  const lightVar = cbMetrics?.variants.find((v) => v.variantName === 'Light');
  const smallVar = cbMetrics?.variants.find((v) => v.variantName === 'Small');
  const stdVar = cbMetrics?.variants.find((v) => v.variantName === 'Standard');
  const largeVar = cbMetrics?.variants.find((v) => v.variantName === 'Large');

  const test7Passed =
    lightVar?.totalVariableCost === 95 &&
    smallVar?.totalVariableCost === 120 &&
    stdVar?.totalVariableCost === 145 &&
    largeVar?.totalVariableCost === 190;

  results.push({
    id: 7,
    title: 'Chicken Biryani Variant-Level Variable Cost Pricing',
    category: 'Recipe Unit Economics',
    passed: test7Passed,
    expected: 'Light: ₹95, Small: ₹120, Standard: ₹145, Large: ₹190',
    actual: `Light: ₹${lightVar?.totalVariableCost}, Small: ₹${smallVar?.totalVariableCost}, Standard: ₹${stdVar?.totalVariableCost}, Large: ₹${largeVar?.totalVariableCost}`,
    details: 'Verified exact Bill of Materials portion costs including ingredients, packaging, and fuel.',
  });

  // 8. Chicken Biryani Variant-Level Unit Contribution Margins
  const test8Passed =
    lightVar?.unitContributionMargin === 55 &&
    smallVar?.unitContributionMargin === 80 &&
    stdVar?.unitContributionMargin === 105 &&
    largeVar?.unitContributionMargin === 160;

  results.push({
    id: 8,
    title: 'Chicken Biryani Variant-Level Contribution Margins',
    category: 'Contribution Margin Analysis',
    passed: test8Passed,
    expected: 'Light: ₹55 (36.7%), Small: ₹80 (40.0%), Standard: ₹105 (42.0%), Large: ₹160 (45.7%)',
    actual: `Light: ₹${lightVar?.unitContributionMargin} (${lightVar?.contributionMarginPct}%), Small: ₹${smallVar?.unitContributionMargin} (${smallVar?.contributionMarginPct}%), Standard: ₹${stdVar?.unitContributionMargin} (${stdVar?.contributionMarginPct}%), Large: ₹${largeVar?.unitContributionMargin} (${largeVar?.contributionMarginPct}%)`,
    details: 'Verified Selling Price - Total Variable Cost per portion across all 4 size variations.',
  });

  // 9. Chicken Biryani Consolidated Contribution Margin Rollup
  // Light: 120 * 55 = 6600; Small: 180 * 80 = 14400; Standard: 250 * 105 = 26250; Large: 90 * 160 = 14400
  // Total Contribution = 6600 + 14400 + 26250 + 14400 = 61650
  // Weighted CM % = 61650 / 148000 = 41.65%
  const test9Passed =
    cbMetrics?.totalContribution === 61650 &&
    cbMetrics?.weightedContributionMarginPct === 41.7; // rounded to 1 decimal place

  results.push({
    id: 9,
    title: 'Chicken Biryani Consolidated Contribution Rollup',
    category: 'Exact Aggregation',
    passed: test9Passed,
    expected: 'Total Contribution: ₹61,650, Weighted Margin: ~41.65%',
    actual: `Total Contribution: ₹${cbMetrics?.totalContribution?.toLocaleString('en-IN')}, Weighted Margin: ${cbMetrics?.weightedContributionMarginPct}%`,
    details: 'Verified quantity-weighted parent contribution margin rollup from variant-level receipts.',
  });

  // 10. Unit Conversion Standardization
  const kgConv = convertToBaseUnit(0.2, 'kg');
  const lConv = convertToBaseUnit(1, 'l');
  const tbspConv = convertToBaseUnit(2, 'tbsp');
  const test10Passed = kgConv.baseQty === 200 && lConv.baseQty === 1000 && tbspConv.baseQty === 30;

  results.push({
    id: 10,
    title: 'Unit Conversion Engine Accuracy',
    category: 'Recipe Costing Engine',
    passed: test10Passed,
    expected: '0.2 kg = 200g, 1 l = 1000ml, 2 tbsp = 30ml',
    actual: `0.2 kg = ${kgConv.baseQty}g, 1 l = ${lConv.baseQty}ml, 2 tbsp = ${tbspConv.baseQty}ml`,
    details: 'Verified mathematical conversions between metric mass, volume, and kitchen culinary units.',
  });

  // 11. Ingredient Portion Costing with Yield % and Prep Loss %
  // 200g Chicken @ ₹240/kg, 85% edible yield, 5% prep loss
  // Raw cost = 0.2 * 240 = 48. Yield factor = 0.85 -> 48 / 0.85 = 56.47. Prep loss 5% -> 56.47 * 1.05 = 59.29
  const portionCost = calculateIngredientPortionCost({
    name: 'Chicken',
    quantity: 200,
    unit: 'g',
    purchasePrice: 240,
    purchasePackSize: 1,
    purchasePackUnit: 'kg',
    yieldPct: 85,
    preparationLossPct: 5,
  });
  const test11Passed = portionCost >= 59.2 && portionCost <= 59.4;

  results.push({
    id: 11,
    title: 'Ingredient Costing with Yield & Prep Loss',
    category: 'Recipe Costing Engine',
    passed: test11Passed,
    expected: '₹59.29 per portion (raw ₹48 adjusted for 85% yield and 5% prep loss)',
    actual: `₹${portionCost}`,
    details: 'Verified edible yield and butcher trim loss adjustment formula.',
  });

  // 12. Smart Selling Price Formula Accuracy
  // Variable Cost = 145. Target CM = 40%. Required Net Realized = 145 / (1 - 0.40) = 241.67
  const smartPriceDineIn = calculateSmartSellingPrice(
    'Chicken Biryani',
    'Standard',
    250,
    145,
    40,
    {
      channel: 'DINE_IN',
      label: 'Dine-In',
      platformCommissionPct: 0,
      commissionGstPct: 0,
      restaurantDiscountPct: 0,
      packagingChargeCustomer: 0,
      packagingCostActual: 0,
      customerGstPct: 5,
      paymentGatewayFeePct: 0,
    }
  );
  const test12Passed =
    smartPriceDineIn.requiredNetRealizedPrice === 241.67 &&
    smartPriceDineIn.recommendedListedPrice === 245;

  results.push({
    id: 12,
    title: 'Smart Selling Price Dine-In Formula',
    category: 'Smart Pricing Engine',
    passed: test12Passed,
    expected: 'Required Realized: ₹241.67, Recommended Menu Price: ₹245',
    actual: `Required: ₹${smartPriceDineIn.requiredNetRealizedPrice}, Recommended: ₹${smartPriceDineIn.recommendedListedPrice}`,
    details: 'Verified Variable Cost / (1 - Target CM) with nearest psychological rounding.',
  });

  // 13. Channel Conversion Reverse-Solving for Delivery
  // Aggregator 22% commission, 10% discount
  const smartPriceDelivery = calculateSmartSellingPrice(
    'Chicken Biryani',
    'Standard',
    250,
    145,
    40,
    {
      channel: 'DELIVERY',
      label: 'Delivery Aggregator',
      platformCommissionPct: 22,
      commissionGstPct: 18,
      restaurantDiscountPct: 10,
      packagingChargeCustomer: 20,
      packagingCostActual: 15,
      customerGstPct: 5,
      paymentGatewayFeePct: 0,
    }
  );
  // Delivery listed price must be significantly higher to cover the 22% commission + 10% discount
  const test13Passed = smartPriceDelivery.recommendedListedPrice > 330;

  results.push({
    id: 13,
    title: 'Delivery Channel Fee Reverse-Solving',
    category: 'Smart Pricing Engine',
    passed: test13Passed,
    expected: 'Recommended Delivery Price > ₹330 (to net ₹241.67 after 22% commission and 10% coupon)',
    actual: `Recommended Delivery Price: ₹${smartPriceDelivery.recommendedListedPrice}`,
    details: 'Verified reverse calculation netting target contribution after aggregator cuts.',
  });

  // 14. Monthly Fixed Cost Break-Even Analysis
  // Fixed costs = ₹2,16,000. If monthly revenue = ₹3,00,000, monthly contribution = ₹1,20,000 (40% CMR)
  // Break-even revenue = 216000 / 0.40 = ₹5,40,000
  const breakEvenTest = calculateBreakEvenIntelligence(
    300000,
    120000,
    1000,
    DEFAULT_FIXED_OPERATING_COSTS
  );
  const test14Passed =
    breakEvenTest.monthlyFixedCosts === 216000 &&
    breakEvenTest.breakEvenMonthlyRevenue === 540000;

  results.push({
    id: 14,
    title: 'Monthly Fixed Cost Break-Even Revenue Formula',
    category: 'Break-Even Intelligence',
    passed: test14Passed,
    expected: 'Fixed Overhead: ₹2,16,000, Break-Even Revenue: ₹5,40,000 at 40% CM ratio',
    actual: `Fixed Overhead: ₹${breakEvenTest.monthlyFixedCosts.toLocaleString('en-IN')}, Break-Even Revenue: ₹${breakEvenTest.breakEvenMonthlyRevenue.toLocaleString('en-IN')}`,
    details: 'Verified Fixed Costs / Contribution Margin Ratio formula.',
  });

  // 15. Double Down Engine Opportunity Classification
  const doubleDownDishes = profitMetrics.parentMetrics.filter((d) => d.opportunityCategory === 'DOUBLE_DOWN');
  const test15Passed = doubleDownDishes.length > 0 && doubleDownDishes.some((d) => d.parentDishName === 'Chicken Biryani');

  results.push({
    id: 15,
    title: 'Double Down Opportunity Engine Classification',
    category: 'Executive Decision Engine',
    passed: test15Passed,
    expected: 'Chicken Biryani classified as "DOUBLE_DOWN" (High Demand, High Contribution Margin)',
    actual: `Found ${doubleDownDishes.length} Double Down dishes: [${doubleDownDishes.map((d) => d.parentDishName).join(', ')}]`,
    details: 'Verified 4-dimension classification engine accurately categorizes top profitability engines.',
  });

  // 16. Hyphen-Channel and Trailing 'W' Multi-Outlet Detection Intelligence
  const sampleWSwiggy = detectOutletFromItemName('Chicken Biryani - W - Swiggy');
  const sampleWZomato = detectOutletFromItemName('Chicken Biryani - W - Zomato');
  const sampleWOwnly = detectOutletFromItemName('Chicken Biryani - W - Ownly');
  const sampleWDirect = detectOutletFromItemName('Chicken Biryani W - Swiggy');
  const sampleBSwiggy = detectOutletFromItemName('Chicken Biryani - Swiggy');
  const sampleBOwnly = detectOutletFromItemName('Chicken Biryani - Ownly');
  const sampleBTakeaway = detectOutletFromItemName('Chicken Biryani', undefined, 'Take Away');
  const sampleBDelivery = detectOutletFromItemName('Chicken Biryani', undefined, 'Delivery');
  const sampleWDineIn = detectOutletFromItemName('Chicken Biryani', undefined, 'Dine-in');

  const test16Passed =
    sampleWSwiggy.outlet === 'whitefield' &&
    sampleWSwiggy.cleanItemName === 'Chicken Biryani' &&
    sampleWSwiggy.detectedChannel === 'Swiggy' &&
    sampleWZomato.outlet === 'whitefield' &&
    sampleWOwnly.outlet === 'whitefield' &&
    sampleWDirect.outlet === 'whitefield' &&
    sampleBSwiggy.outlet === 'banaswadi' &&
    sampleBOwnly.outlet === 'banaswadi' &&
    sampleBTakeaway.outlet === 'banaswadi' &&
    sampleBDelivery.outlet === 'banaswadi' &&
    sampleWDineIn.outlet === 'whitefield';

  results.push({
    id: 16,
    title: 'Hyphen-Channel & Service Type Outlet Detection Intelligence',
    category: 'Outlet Grouping',
    passed: test16Passed,
    expected: 'Left of "-" ending with W (before Swiggy/Zomato/Ownly) -> Whitefield; left not W -> Banaswadi; No "-": Takeaway/Delivery -> Banaswadi, Dine-in -> Whitefield',
    actual: test16Passed
      ? 'All patterns verified: "- W - Swiggy" -> Whitefield, "- Swiggy" -> Banaswadi, "Delivery" -> Banaswadi, "Dine-in" -> Whitefield'
      : 'Pattern detection failed',
    details: 'Verified hyphen-channel separation, trailing W extraction before aggregator channel, and service-type fallbacks.',
  });

  // 17. Outlet Grouping vs Highest Selling Dish Grouping Separation
  const dummySalesRecords = [
    { rowId: 'r1', sourceFile: 'test.xlsx', rawItemName: 'Chicken Biryani', quantity: 100, revenue: 25000, outlet: 'banaswadi' },
    { rowId: 'r2', sourceFile: 'test.xlsx', rawItemName: 'Chicken Biryani - W', quantity: 60, revenue: 15000, outlet: 'whitefield' },
  ];
  const outletGrouped = groupSalesByOutlet(dummySalesRecords);
  const test17Passed =
    outletGrouped.banaswadi.totalQuantity === 100 &&
    outletGrouped.banaswadi.totalRevenue === 25000 &&
    outletGrouped.whitefield.totalQuantity === 60 &&
    outletGrouped.whitefield.totalRevenue === 15000 &&
    outletGrouped.crossOutletComparison.length === 1 &&
    outletGrouped.crossOutletComparison[0].cleanName === 'Chicken Biryani' &&
    outletGrouped.crossOutletComparison[0].totalRevenue === 40000;

  results.push({
    id: 17,
    title: 'Outlet Grouping Aggregation & Cross-Comparison',
    category: 'Outlet Grouping',
    passed: test17Passed,
    expected: 'Banaswadi: 100 qty / ₹25,000, Whitefield: 60 qty / ₹15,000, Combined: ₹40,000',
    actual: test17Passed
      ? `Banaswadi ₹${outletGrouped.banaswadi.totalRevenue}, Whitefield ₹${outletGrouped.whitefield.totalRevenue}, Combined ₹${outletGrouped.totalRevenue}`
      : 'Aggregation mismatch',
    details: 'Verified side-by-side outlet aggregation and comparison rollup.',
  });

  const passedCount = results.filter((r) => r.passed).length;
  const allPassed = passedCount === results.length;

  return {
    results,
    allPassed,
    passedCount,
    totalCount: results.length,
  };
}
