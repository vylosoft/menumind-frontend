import React, { useState, useMemo } from 'react';
import { ParentDish } from '../types/restaurant';
import { DishRecipe, PricingChannelParams } from '../types/recipe';
import { calculateParentProfitMetrics, calculateSmartSellingPrice } from '../utils/recipeCalculator';
import { formatINR, formatNumber, formatPercent } from '../utils/formatters';
import {
  Calculator,
  Sliders,
  TrendingUp,
  Percent,
  Layers,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  HelpCircle,
  RotateCcw,
  Store,
  ShoppingBag,
  Bike,
  CheckCircle2,
  DollarSign,
} from 'lucide-react';

interface SmartPricingLabViewProps {
  parentDishes: ParentDish[];
  recipes: DishRecipe[];
}

export const SmartPricingLabView: React.FC<SmartPricingLabViewProps> = ({
  parentDishes,
  recipes,
}) => {
  // Channel presets
  const channelPresets: Record<'DINE_IN' | 'TAKEAWAY' | 'DELIVERY', PricingChannelParams> = {
    DINE_IN: {
      channel: 'DINE_IN',
      label: 'Dine-In',
      platformCommissionPct: 0,
      commissionGstPct: 0,
      restaurantDiscountPct: 0,
      packagingChargeCustomer: 0,
      packagingCostActual: 0,
      customerGstPct: 5,
      paymentGatewayFeePct: 0,
    },
    TAKEAWAY: {
      channel: 'TAKEAWAY',
      label: 'Direct Takeaway',
      platformCommissionPct: 0,
      commissionGstPct: 0,
      restaurantDiscountPct: 5,
      packagingChargeCustomer: 15,
      packagingCostActual: 15,
      customerGstPct: 5,
      paymentGatewayFeePct: 1.5,
    },
    DELIVERY: {
      channel: 'DELIVERY',
      label: 'Online Aggregator (Zomato / Swiggy)',
      platformCommissionPct: 22,
      commissionGstPct: 18,
      restaurantDiscountPct: 10,
      packagingChargeCustomer: 20,
      packagingCostActual: 15,
      customerGstPct: 5,
      paymentGatewayFeePct: 0,
    },
  };

  const [selectedChannelKey, setSelectedChannelKey] = useState<'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>('DELIVERY');
  const [targetCMPct, setTargetCMPct] = useState<number>(42);
  const [costShockPct, setCostShockPct] = useState<number>(0);
  const [customCommissionPct, setCustomCommissionPct] = useState<number>(22);
  const [customDiscountPct, setCustomDiscountPct] = useState<number>(10);
  const [customPackagingCharge, setCustomPackagingCharge] = useState<number>(20);

  // Selected dish & variant
  const [selectedDishName, setSelectedDishName] = useState<string>(
    parentDishes[0]?.name || 'Chicken Biryani'
  );
  const [selectedVariantName, setSelectedVariantName] = useState<string>('Standard');

  // Elasticity volume drop simulation state (0%, 5%, 10%, 20%)
  const [simulatedVolumeDropPct, setSimulatedVolumeDropPct] = useState<number>(10);

  // Profit metrics for all dishes
  const { parentMetrics } = useMemo(() => {
    return calculateParentProfitMetrics(parentDishes, recipes);
  }, [parentDishes, recipes]);

  const activeDish = useMemo(() => {
    return parentMetrics.find((d) => d.parentDishName === selectedDishName) || parentMetrics[0];
  }, [parentMetrics, selectedDishName]);

  const activeVariant = useMemo(() => {
    if (!activeDish) return null;
    return (
      activeDish.variants.find((v) => v.variantName === selectedVariantName) ||
      activeDish.variants[0]
    );
  }, [activeDish, selectedVariantName]);

  // Channel parameters in effect
  const activeChannelParams: PricingChannelParams = useMemo(() => {
    const base = channelPresets[selectedChannelKey];
    return {
      ...base,
      platformCommissionPct: customCommissionPct,
      restaurantDiscountPct: customDiscountPct,
      packagingChargeCustomer: customPackagingCharge,
    };
  }, [selectedChannelKey, customCommissionPct, customDiscountPct, customPackagingCharge]);

  // Calculate pricing for selected variant
  const smartPriceResult = useMemo(() => {
    if (!activeVariant) return null;
    const adjustedCost = activeVariant.totalVariableCost * (1 + costShockPct / 100);
    return calculateSmartSellingPrice(
      activeDish.parentDishName,
      activeVariant.variantName,
      activeVariant.averagePrice,
      adjustedCost,
      targetCMPct,
      activeChannelParams
    );
  }, [activeDish, activeVariant, costShockPct, targetCMPct, activeChannelParams]);

  // Elasticity and profit analysis
  const elasticityAnalysis = useMemo(() => {
    if (!activeVariant || !smartPriceResult) return null;

    const currentQty = activeVariant.quantity;
    const currentCM = activeVariant.unitContributionMargin;
    const currentTotalProfit = currentQty * currentCM;

    // Simulated new volume after price increase
    const isPriceIncrease = smartPriceResult.suggestedPriceDelta > 0;
    const effectiveDrop = isPriceIncrease ? simulatedVolumeDropPct / 100 : 0;
    const newQty = Math.max(1, Math.round(currentQty * (1 - effectiveDrop)));
    const newCM = smartPriceResult.estimatedMarginAtNewPrice;
    const newTotalProfit = newQty * newCM;
    const profitDelta = newTotalProfit - currentTotalProfit;

    return {
      currentQty,
      currentCM,
      currentTotalProfit,
      newQty,
      newCM,
      newTotalProfit,
      profitDelta,
      isNetPositive: profitDelta >= 0,
    };
  }, [activeVariant, smartPriceResult, simulatedVolumeDropPct]);

  // Batch analysis across all parent dishes
  const batchPricingTable = useMemo(() => {
    return parentMetrics.map((p) => {
      const mainVar = p.variants[0];
      const avgPrice = p.averageRealizedPrice;
      const avgVarCost = p.totalQuantity > 0 ? p.totalVariableCost / p.totalQuantity : 0;
      const res = calculateSmartSellingPrice(
        p.parentDishName,
        'Consolidated',
        avgPrice,
        avgVarCost,
        targetCMPct,
        activeChannelParams
      );

      const annualVolume = p.totalQuantity;
      const newCM = res.estimatedMarginAtNewPrice;
      const currentCM = p.weightedUnitContribution;
      // Assume 10% elasticity drop if price rises > 5%
      const drop = res.suggestedPriceDeltaPct > 5 ? 0.1 : 0;
      const potentialProfitGain = Math.round(annualVolume * (1 - drop) * newCM - annualVolume * currentCM);

      return {
        dish: p,
        smartPrice: res,
        potentialProfitGain,
      };
    });
  }, [parentMetrics, targetCMPct, activeChannelParams]);

  const handleChannelChange = (k: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY') => {
    setSelectedChannelKey(k);
    const p = channelPresets[k];
    setCustomCommissionPct(p.platformCommissionPct);
    setCustomDiscountPct(p.restaurantDiscountPct);
    setCustomPackagingCharge(p.packagingChargeCustomer);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-teal-600" />
              <h2 className="text-xl font-bold text-slate-900">
                AI Smart Menu Pricing &amp; Sensitivity Simulator
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Calculate the mathematically exact menu price required to achieve your target contribution margin,
              accounting for delivery aggregator commissions, customer discounts, packaging, and demand elasticity.
            </p>
          </div>

          {/* Quick Target CM Badge */}
          <div className="bg-teal-50 border border-teal-200 px-4 py-2 rounded-xl flex items-center gap-3">
            <div>
              <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">Target CM %</p>
              <p className="text-2xl font-black text-teal-900">{targetCMPct}%</p>
            </div>
            <input
              type="range"
              min="20"
              max="70"
              step="1"
              value={targetCMPct}
              onChange={(e) => setTargetCMPct(Number(e.target.value))}
              className="w-24 accent-teal-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Channel Switcher */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 mr-2">Sales Channel:</span>
          <button
            onClick={() => handleChannelChange('DINE_IN')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              selectedChannelKey === 'DINE_IN'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            Dine-In (0% Comm.)
          </button>
          <button
            onClick={() => handleChannelChange('TAKEAWAY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              selectedChannelKey === 'TAKEAWAY'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Direct Takeaway
          </button>
          <button
            onClick={() => handleChannelChange('DELIVERY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              selectedChannelKey === 'DELIVERY'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            Online Delivery (Swiggy / Zomato)
          </button>
        </div>
      </div>

      {/* Main Two-Column Control Lab */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Dish & Controls */}
        <div className="lg:col-span-5 space-y-5">
          {/* Dish & Variant Selection Card */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              1. Select Dish &amp; Variant to Price
            </h3>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">Parent Dish</label>
              <select
                value={selectedDishName}
                onChange={(e) => {
                  setSelectedDishName(e.target.value);
                  const p = parentMetrics.find((d) => d.parentDishName === e.target.value);
                  if (p && p.variants.length > 0) {
                    setSelectedVariantName(p.variants[0].variantName);
                  }
                }}
                className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                {parentMetrics.map((p) => (
                  <option key={p.parentDishId} value={p.parentDishName}>
                    {p.parentDishName} ({formatINR(p.averageRealizedPrice)} avg, {p.weightedContributionMarginPct}% CM)
                  </option>
                ))}
              </select>
            </div>

            {activeDish && activeDish.variants.length > 1 && (
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Variant Size</label>
                <div className="grid grid-cols-2 gap-2">
                  {activeDish.variants.map((v) => (
                    <button
                      key={v.variantName}
                      onClick={() => setSelectedVariantName(v.variantName)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border text-left transition-all ${
                        selectedVariantName === v.variantName
                          ? 'border-teal-500 bg-teal-50 text-teal-900 shadow-xs'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold">{v.variantName}</div>
                      <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                        Sold {v.quantity} &bull; Cost {formatINR(v.totalVariableCost)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Current Baseline Box */}
            {activeVariant && (
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Current Realized Selling Price:</span>
                  <span className="font-bold text-slate-900">{formatINR(activeVariant.averagePrice)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Direct Variable Cost (BOM + Packaging):</span>
                  <span className="font-bold text-slate-900">{formatINR(activeVariant.totalVariableCost)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Current Contribution Margin:</span>
                  <span className={`font-bold ${activeVariant.unitContributionMargin >= 0 ? 'text-teal-700' : 'text-rose-600'}`}>
                    {formatINR(activeVariant.unitContributionMargin)} ({activeVariant.contributionMarginPct}%)
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Pricing Parameters & Sliders */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-teal-600" />
              2. Channel Levers &amp; Cost Shock Simulator
            </h3>

            {/* Target CM Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">Target Contribution Margin:</span>
                <span className="font-bold text-teal-700">{targetCMPct}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="75"
                step="1"
                value={targetCMPct}
                onChange={(e) => setTargetCMPct(Number(e.target.value))}
                className="w-full accent-teal-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>20% (Budget / High-vol)</span>
                <span>40% (Healthy QSR)</span>
                <span>65%+ (Premium Bar/Bev)</span>
              </div>
            </div>

            {/* Platform Commission Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">Aggregator Commission Rate:</span>
                <span className="font-bold text-indigo-700">{customCommissionPct}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="35"
                step="1"
                value={customCommissionPct}
                onChange={(e) => setCustomCommissionPct(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            {/* Restaurant-Funded Discount Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">Restaurant-Funded Discount:</span>
                <span className="font-bold text-amber-700">{customDiscountPct}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={customDiscountPct}
                onChange={(e) => setCustomDiscountPct(Number(e.target.value))}
                className="w-full accent-amber-600 cursor-pointer"
              />
            </div>

            {/* Commodity Cost Shock Slider */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">Simulate Raw Ingredient Cost Shock:</span>
                <span className={`font-bold ${costShockPct > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                  {costShockPct > 0 ? `+${costShockPct}%` : `${costShockPct}%`}
                </span>
              </div>
              <input
                type="range"
                min="-20"
                max="50"
                step="5"
                value={costShockPct}
                onChange={(e) => setCostShockPct(Number(e.target.value))}
                className="w-full accent-rose-600 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                Test how a jump in chicken, mutton, or oil prices impacts your required selling price.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Pricing Solution & Elasticity Impact */}
        <div className="lg:col-span-7 space-y-5">
          {smartPriceResult && (
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 text-white rounded-xl p-6 shadow-md space-y-6">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 bg-teal-950/60 border border-teal-800/80 px-2 py-0.5 rounded-full">
                    Mathematical Pricing Formula Output
                  </span>
                  <h3 className="text-xl font-black text-white mt-1">
                    {smartPriceResult.dishName} ({smartPriceResult.variantName})
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Channel Target</span>
                  <span className="text-xs font-semibold text-teal-300">
                    {activeChannelParams.label}
                  </span>
                </div>
              </div>

              {/* Price Comparison Callout */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl text-center">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider">Current Listed</p>
                  <p className="text-2xl font-bold text-slate-200 mt-1">
                    {formatINR(smartPriceResult.currentListedPrice)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Yields {smartPriceResult.currentContributionMarginPct}% CM
                  </p>
                </div>

                <div className="bg-teal-900/40 border-2 border-teal-500 p-4 rounded-xl text-center shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-teal-500 text-slate-900 text-[9px] font-black uppercase px-2 py-0.5 rounded-bl">
                    Recommended
                  </div>
                  <p className="text-[11px] text-teal-300 uppercase tracking-wider font-semibold">Recommended Listed</p>
                  <p className="text-3xl font-black text-white mt-1">
                    {formatINR(smartPriceResult.recommendedListedPrice)}
                  </p>
                  <p className="text-[10px] text-teal-200 mt-1 font-semibold">
                    Hits exact {targetCMPct}% Target CM
                  </p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl text-center">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider">Suggested Delta</p>
                  <p
                    className={`text-2xl font-bold mt-1 ${
                      smartPriceResult.suggestedPriceDelta > 0
                        ? 'text-amber-400'
                        : smartPriceResult.suggestedPriceDelta < 0
                        ? 'text-cyan-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {smartPriceResult.suggestedPriceDelta > 0 ? `+` : ''}
                    {formatINR(smartPriceResult.suggestedPriceDelta)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {smartPriceResult.suggestedPriceDeltaPct > 0 ? '+' : ''}
                    {smartPriceResult.suggestedPriceDeltaPct}% adjustment
                  </p>
                </div>
              </div>

              {/* Exact Formula Breakdown Step-by-Step */}
              <div className="bg-slate-800/90 rounded-xl p-4 border border-slate-700/80 space-y-2.5 text-xs">
                <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                  Deterministic Pricing Engine Breakdown
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700/50 text-[11px]">
                  <div>
                    <span className="text-slate-400">Total Variable Cost:</span>{' '}
                    <span className="font-semibold text-white">{formatINR(smartPriceResult.variableCost)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Min. Break-even Realized:</span>{' '}
                    <span className="font-semibold text-white">{formatINR(smartPriceResult.minimumBreakEvenPrice)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Required Net Realized:</span>{' '}
                    <span className="font-semibold text-teal-300">
                      {formatINR(smartPriceResult.requiredNetRealizedPrice)}
                    </span>{' '}
                    <span className="text-[10px] text-slate-400">(Cost &divide; [1 - {targetCMPct}%])</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Retained Multiplier:</span>{' '}
                    <span className="font-semibold text-white">
                      {Math.round((1 - customDiscountPct / 100) * (1 - customCommissionPct / 100) * 100)}% of bill
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Demand Elasticity Drop Simulator (Restaurant CFO insight) */}
          {elasticityAnalysis && smartPriceResult && (
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-teal-600" />
                    3. Elasticity &amp; Volume Drop Reality Check
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    &ldquo;Will repricing cause guests to order less? Even with a drop in portions, does net cash profit increase?&rdquo;
                  </p>
                </div>

                {/* Drop Selector Buttons */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                  {[0, 5, 10, 15, 20].map((drop) => (
                    <button
                      key={drop}
                      onClick={() => setSimulatedVolumeDropPct(drop)}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                        simulatedVolumeDropPct === drop
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      -{drop}% Vol
                    </button>
                  ))}
                </div>
              </div>

              {/* Elasticity Financial Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Current Baseline */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Current Performance
                  </span>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Volume Sold:</span>
                    <span className="font-bold text-slate-900">{formatNumber(elasticityAnalysis.currentQty)} portions</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Unit Contribution:</span>
                    <span className="font-bold text-slate-900">{formatINR(elasticityAnalysis.currentCM)} / portion</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                    <span className="text-slate-700">Total Net Contribution:</span>
                    <span className="text-slate-900">{formatINR(elasticityAnalysis.currentTotalProfit)}</span>
                  </div>
                </div>

                {/* Simulated at New Price */}
                <div className={`rounded-xl p-4 border text-xs space-y-2 ${
                  elasticityAnalysis.isNetPositive ? 'bg-teal-50/70 border-teal-200' : 'bg-rose-50/70 border-rose-200'
                }`}>
                  <span className="text-[10px] font-bold uppercase tracking-wider block text-teal-800">
                    At Recommended Price ({formatINR(smartPriceResult.recommendedListedPrice)}) with -{simulatedVolumeDropPct}% Volume
                  </span>
                  <div className="flex justify-between">
                    <span className="text-slate-600">New Estimated Volume:</span>
                    <span className="font-bold text-slate-900">{formatNumber(elasticityAnalysis.newQty)} portions</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">New Unit Contribution:</span>
                    <span className="font-bold text-teal-700">{formatINR(elasticityAnalysis.newCM)} / portion</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200/80 font-bold">
                    <span className="text-slate-700">New Total Contribution:</span>
                    <span className="text-slate-900">{formatINR(elasticityAnalysis.newTotalProfit)}</span>
                  </div>
                </div>
              </div>

              {/* CFO Executive Verdict */}
              <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
                elasticityAnalysis.isNetPositive
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <CheckCircle2 className={`w-5 h-5 shrink-0 mt-0.5 ${
                  elasticityAnalysis.isNetPositive ? 'text-emerald-600' : 'text-amber-600'
                }`} />
                <div>
                  <p className="font-bold">
                    {elasticityAnalysis.isNetPositive
                      ? `Profitable Price Move: +${formatINR(elasticityAnalysis.profitDelta)} Net Additional Profit!`
                      : `Repricing Caution: Volume drop of ${simulatedVolumeDropPct}% slightly dampens total contribution.`}
                  </p>
                  <p className="text-[11px] mt-0.5 opacity-90 leading-relaxed">
                    {elasticityAnalysis.isNetPositive
                      ? `Because the unit margin rises significantly from ${formatINR(elasticityAnalysis.currentCM)} to ${formatINR(elasticityAnalysis.newCM)}, the restaurant makes MORE total cash even if sales dip by ${simulatedVolumeDropPct}%. Kitchen workload actually decreases while net profit grows.`
                      : `A smaller price hike (+₹5 to +₹10) or retaining existing pricing while cutting packaging and raw ingredient costs is recommended.`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Batch Menu Repricing Opportunity Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Whole-Menu Repricing Opportunities (Target {targetCMPct}% CM)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Review current vs. recommended prices for all dishes on {activeChannelParams.label}.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
            {batchPricingTable.length} Menu Items Evaluated
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Dish Name</th>
                <th className="py-3 px-3 text-right">Units Sold</th>
                <th className="py-3 px-3 text-right">Current Price</th>
                <th className="py-3 px-3 text-right">Variable Cost</th>
                <th className="py-3 px-3 text-right">Current CM %</th>
                <th className="py-3 px-3 text-right font-bold text-teal-800">Rec. Price</th>
                <th className="py-3 px-3 text-right">Adjustment</th>
                <th className="py-3 px-4 text-right font-bold text-slate-900">Est. Profit Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batchPricingTable.map((row) => (
                <tr
                  key={row.dish.parentDishId}
                  onClick={() => {
                    setSelectedDishName(row.dish.parentDishName);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:bg-teal-50/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {row.dish.parentDishName}
                    <span className="text-[10px] text-slate-400 block font-normal">{row.dish.category}</span>
                  </td>
                  <td className="py-3 px-3 text-right font-medium text-slate-700">
                    {formatNumber(row.dish.totalQuantity)}
                  </td>
                  <td className="py-3 px-3 text-right font-medium text-slate-800">
                    {formatINR(row.smartPrice.currentListedPrice)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-600">
                    {formatINR(row.smartPrice.variableCost)}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span
                      className={`font-semibold ${
                        row.dish.weightedContributionMarginPct < 30
                          ? 'text-rose-600'
                          : row.dish.weightedContributionMarginPct >= 45
                          ? 'text-emerald-600'
                          : 'text-slate-700'
                      }`}
                    >
                      {row.dish.weightedContributionMarginPct}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-teal-700 bg-teal-50/30">
                    {formatINR(row.smartPrice.recommendedListedPrice)}
                  </td>
                  <td className="py-3 px-3 text-right font-medium">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        row.smartPrice.suggestedPriceDelta > 0
                          ? 'bg-amber-100 text-amber-800'
                          : row.smartPrice.suggestedPriceDelta < 0
                          ? 'bg-cyan-100 text-cyan-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.smartPrice.suggestedPriceDelta > 0 ? '+' : ''}
                      {formatINR(row.smartPrice.suggestedPriceDelta)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-bold">
                    <span className={row.potentialProfitGain >= 0 ? 'text-emerald-600' : 'text-slate-500'}>
                      {row.potentialProfitGain >= 0 ? '+' : ''}
                      {formatINR(row.potentialProfitGain)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
