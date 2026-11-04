/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ParentDish } from '../types/restaurant';
import { DishRecipe, FixedOperatingCosts } from '../types/recipe';
import { StaffMember } from '../types/payrollStaff';
import { OutletOperatingExpenseItem } from '../types/operatingCosts';
import { PlatformPayoutRecord } from '../types/finance';
import { calculateBreakEvenIntelligence, calculateParentProfitMetrics } from '../utils/recipeCalculator';
import { calculateChannelAwareBreakEven } from '../utils/payoutManager';
import {
  calculateTotalOperatingOverhead,
  calculateStaffSalaryTotals,
  calculateEffectiveExpense,
} from '../utils/operatingOverheadManager';
import { formatINR, formatNumber, formatPercent } from '../utils/formatters';
import {
  Building2,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  PieChart,
  Users,
  Settings,
  HelpCircle,
  Zap,
  ArrowUpRight,
} from 'lucide-react';

interface BreakEvenIntelligenceViewProps {
  parentDishes: ParentDish[];
  recipes: DishRecipe[];
  staffDirectory?: StaffMember[];
  operatingExpenses?: OutletOperatingExpenseItem[];
  fixedCosts?: FixedOperatingCosts;
  onUpdateFixedCosts?: (costs: FixedOperatingCosts) => void;
  onNavigateToOverheads?: () => void;
  onNavigateToStaff?: () => void;
  payouts?: PlatformPayoutRecord[];
  onNavigateToPayouts?: () => void;
}

export const BreakEvenIntelligenceView: React.FC<BreakEvenIntelligenceViewProps> = ({
  parentDishes,
  recipes,
  staffDirectory = [],
  operatingExpenses = [],
  onNavigateToOverheads,
  onNavigateToStaff,
  payouts = [],
  onNavigateToPayouts,
}) => {
  const [selectedOutlet, setSelectedOutlet] = useState<'consolidated' | 'banaswadi' | 'whitefield'>('consolidated');
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [simulatedStaffCost, setSimulatedStaffCost] = useState<number | null>(null);
  const [simulatedOverheadCost, setSimulatedOverheadCost] = useState<number | null>(null);

  // Authoritative staff salary totals directly from the Staff & Wages Directory
  const staffSalaryData = useMemo(() => {
    return calculateStaffSalaryTotals(staffDirectory, selectedOutlet);
  }, [staffDirectory, selectedOutlet]);

  // Authoritative operating overheads directly from the Outlet Overheads module
  const overheadData = useMemo(() => {
    return calculateTotalOperatingOverhead(operatingExpenses, selectedOutlet);
  }, [operatingExpenses, selectedOutlet]);

  // Categorized breakdown of the 14 overhead items for the active scope
  const categorizedOverheads = useMemo(() => {
    const rentItem = operatingExpenses.find((e) => e.id === 'exp_kitchen_rent');
    const accommItem = operatingExpenses.find((e) => e.id === 'exp_staff_accommodation');
    const elecItem = operatingExpenses.find((e) => e.id === 'exp_electricity');
    const tankerItem = operatingExpenses.find((e) => e.id === 'exp_tanker_water');
    const waterItem = operatingExpenses.find((e) => e.id === 'exp_kitchen_water');
    const dailyCleanItem = operatingExpenses.find((e) => e.id === 'exp_daily_cleaning');
    const deepCleanItem = operatingExpenses.find((e) => e.id === 'exp_monthly_deep_cleaning');
    const insuranceItem = operatingExpenses.find((e) => e.id === 'exp_insurance');
    const posItem = operatingExpenses.find((e) => e.id === 'exp_pos_software');
    const cloudItem = operatingExpenses.find((e) => e.id === 'exp_cloud_and_apps');
    const fssaiItem = operatingExpenses.find((e) => e.id === 'exp_fssai_license');
    const otherLicenseItem = operatingExpenses.find((e) => e.id === 'exp_other_license');
    const porterItem = operatingExpenses.find((e) => e.id === 'exp_porter_charge');
    const miscItem = operatingExpenses.find((e) => e.id === 'exp_misc_cost');

    const getVal = (item?: OutletOperatingExpenseItem) =>
      item ? calculateEffectiveExpense(item, selectedOutlet) : 0;

    return {
      rent: getVal(rentItem) + getVal(accommItem),
      utilities: getVal(elecItem) + getVal(tankerItem) + getVal(waterItem),
      cleaning: getVal(dailyCleanItem) + getVal(deepCleanItem),
      software: getVal(posItem) + getVal(cloudItem),
      licenses: getVal(insuranceItem) + getVal(fssaiItem) + getVal(otherLicenseItem),
      logisticsAndMisc: getVal(porterItem) + getVal(miscItem),
      isPosShared: posItem?.isCombined ?? false,
      isCloudShared: cloudItem?.isCombined ?? false,
    };
  }, [operatingExpenses, selectedOutlet]);

  // Active fixed costs calculation
  const effectiveSalaryCost = isSimulationMode && simulatedStaffCost !== null
    ? simulatedStaffCost
    : staffSalaryData.totalEmployerCost;

  const effectiveOverheadCost = isSimulationMode && simulatedOverheadCost !== null
    ? simulatedOverheadCost
    : overheadData.total;

  const totalMonthlyFixedObligations = effectiveSalaryCost + effectiveOverheadCost;

  // Derive menu profit metrics
  const { totalRestaurantRevenue, totalRestaurantContribution, parentMetrics } = useMemo(() => {
    return calculateParentProfitMetrics(parentDishes, recipes);
  }, [parentDishes, recipes]);

  const totalUnits = useMemo(() => {
    return parentDishes.reduce((sum, d) => sum + d.totalQuantity, 0);
  }, [parentDishes]);

  // Convert aggregate sales to an average monthly run-rate for standard monthly fixed cost comparison
  const estimatedMonths = 6;
  const monthlyRevenueRunRate = Math.round(totalRestaurantRevenue / estimatedMonths);
  const monthlyContributionRunRate = Math.round(totalRestaurantContribution / estimatedMonths);
  const monthlyUnitsRunRate = Math.round(totalUnits / estimatedMonths);

  // Compute break-even intelligence using the combined fixed obligations
  const breakEvenReport = useMemo(() => {
    const syntheticFixedCosts: FixedOperatingCosts = {
      monthlyRent: categorizedOverheads.rent,
      fixedSalaries: effectiveSalaryCost,
      fixedUtilities: categorizedOverheads.utilities,
      softwareSubscriptions: categorizedOverheads.software,
      otherFixedExpenses: categorizedOverheads.cleaning + categorizedOverheads.licenses + categorizedOverheads.logisticsAndMisc,
      totalMonthlyFixedCosts: totalMonthlyFixedObligations,
    };

    return calculateBreakEvenIntelligence(
      monthlyRevenueRunRate,
      monthlyContributionRunRate,
      monthlyUnitsRunRate,
      syntheticFixedCosts
    );
  }, [
    monthlyRevenueRunRate,
    monthlyContributionRunRate,
    monthlyUnitsRunRate,
    categorizedOverheads,
    effectiveSalaryCost,
    totalMonthlyFixedObligations,
  ]);

  // Day of month break-even is achieved (assuming 30 days linear distribution)
  const breakEvenDay = useMemo(() => {
    if (breakEvenReport.operatingSurplusOrDeficit <= 0) return null;
    const dailyCM = breakEvenReport.totalMonthlyContribution / 30;
    if (dailyCM <= 0) return null;
    const day = Math.ceil(breakEvenReport.monthlyFixedCosts / dailyCM);
    return Math.min(30, Math.max(1, day));
  }, [breakEvenReport]);

  // Channel-Aware Break-Even calculation incorporating Swiggy, Zomato, Ownly net payouts & commissions
  const channelBreakEven = useMemo(() => {
    return calculateChannelAwareBreakEven(
      staffDirectory,
      operatingExpenses,
      payouts,
      selectedOutlet
    );
  }, [staffDirectory, operatingExpenses, payouts, selectedOutlet]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-200">
                <Building2 className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Fixed Cost Coverage &amp; Break-Even Intelligence
                </h2>
                <p className="text-xs text-slate-500">
                  Authoritative monthly break-even metrics calculated directly from live Staff Wages &amp; Kitchen Overheads
                </p>
              </div>
            </div>
          </div>

          {/* Scope Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
              <button
                onClick={() => setSelectedOutlet('consolidated')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  selectedOutlet === 'consolidated'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Consolidated
              </button>
              <button
                onClick={() => setSelectedOutlet('banaswadi')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  selectedOutlet === 'banaswadi'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Banaswadi
              </button>
              <button
                onClick={() => setSelectedOutlet('whitefield')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  selectedOutlet === 'whitefield'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Whitefield
              </button>
            </div>

            {/* Surplus / Deficit Pill */}
            <div
              className={`px-4 py-2 rounded-xl border text-right ${
                breakEvenReport.operatingSurplusOrDeficit >= 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider block">
                Monthly {breakEvenReport.operatingSurplusOrDeficit >= 0 ? 'Operating Surplus' : 'Operating Deficit'}
              </span>
              <span className="text-xl font-black">
                {breakEvenReport.operatingSurplusOrDeficit >= 0 ? '+' : ''}
                {formatINR(breakEvenReport.operatingSurplusOrDeficit)}
              </span>
              <span className="text-[10px] block opacity-80">
                {breakEvenReport.revenueCoveragePct}% fixed cost coverage
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Core Financial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Monthly Fixed Obligations
          </p>
          <p className="text-2xl font-black text-slate-900">
            {formatINR(breakEvenReport.monthlyFixedCosts)}
          </p>
          <p className="text-[11px] text-slate-500">
            Staff salaries ({formatINR(effectiveSalaryCost)}) + Overheads ({formatINR(effectiveOverheadCost)})
          </p>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Break-Even Monthly Revenue
          </p>
          <p className="text-2xl font-black text-teal-700">
            {formatINR(breakEvenReport.breakEvenMonthlyRevenue)}
          </p>
          <p className="text-[11px] text-slate-500">
            At {Math.round(breakEvenReport.weightedContributionMarginRatio * 100)}% Contribution Margin
          </p>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Portions Needed to Break Even
          </p>
          <p className="text-2xl font-black text-indigo-700">
            {formatNumber(breakEvenReport.portionsNeededToBreakEven)}
          </p>
          <p className="text-[11px] text-slate-500">
            Run-rate: {formatNumber(breakEvenReport.currentPortionsSold)} portions/mo
          </p>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Break-Even Calendar Day
          </p>
          <p className="text-2xl font-black text-amber-600">
            {breakEvenDay ? `Day ${breakEvenDay} of 30` : 'Not Reached'}
          </p>
          <p className="text-[11px] text-slate-500">
            {breakEvenDay
              ? `Day 1–${breakEvenDay}: Paying overhead. Day ${breakEvenDay + 1}+: Pure profit!`
              : 'Margin insufficient to cover fixed obligations'}
          </p>
        </div>
      </div>

      {/* Main Layout: Fixed Cost Source Breakdown & Visual Coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Authoritative Cost Source Breakdown */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-teal-600" />
                Live Fixed Obligations Breakdown
              </h3>
              <button
                onClick={() => setIsSimulationMode(!isSimulationMode)}
                className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  isSimulationMode
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isSimulationMode ? 'Simulation Active' : 'Simulate What-If'}
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Costs are automatically derived from the <strong>Staff &amp; Wages Directory</strong> and the{' '}
              <strong>Outlet Operating Overheads Module</strong>:
            </p>

            <div className="space-y-3">
              {/* 1. Staff Salary & Wage Cost */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-bold text-slate-800">
                      1. Staff Payroll &amp; Allowances:
                    </span>
                  </div>
                  <span className="font-extrabold text-emerald-700 text-sm">
                    {formatINR(effectiveSalaryCost)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>
                    {staffSalaryData.activeStaffCount} active employees (Base: {formatINR(staffSalaryData.totalBaseSalary)}, Food: {formatINR(staffSalaryData.totalFoodAllowance)})
                  </span>
                  {onNavigateToStaff && (
                    <button
                      onClick={onNavigateToStaff}
                      className="text-teal-600 hover:text-teal-700 font-bold underline cursor-pointer"
                    >
                      Staff Directory &rarr;
                    </button>
                  )}
                </div>

                {isSimulationMode && (
                  <div className="pt-2 flex items-center gap-2">
                    <span className="text-[10px] text-amber-700 font-semibold">Simulate ₹:</span>
                    <input
                      type="number"
                      placeholder={String(staffSalaryData.totalEmployerCost)}
                      value={simulatedStaffCost ?? ''}
                      onChange={(e) => setSimulatedStaffCost(e.target.value ? Number(e.target.value) : null)}
                      className="w-full text-xs font-semibold bg-white border border-amber-300 rounded p-1 text-slate-800"
                    />
                  </div>
                )}
              </div>

              {/* 2. Kitchen Operating Overheads Card */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-teal-600" />
                    <span className="font-bold text-slate-800">
                      2. Kitchen Operating Overheads:
                    </span>
                  </div>
                  <span className="font-extrabold text-slate-900 text-sm">
                    {formatINR(effectiveOverheadCost)}
                  </span>
                </div>

                {/* Sub-item lines */}
                <div className="space-y-1 pt-1 text-[11px] text-slate-600 divide-y divide-slate-100">
                  <div className="flex justify-between py-1">
                    <span>Kitchen Rent &amp; Staff Accommodation:</span>
                    <span className="font-semibold text-slate-800">{formatINR(categorizedOverheads.rent)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Electricity, Tanker &amp; Kitchen Water:</span>
                    <span className="font-semibold text-slate-800">{formatINR(categorizedOverheads.utilities)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Daily &amp; Monthly Deep Cleaning:</span>
                    <span className="font-semibold text-slate-800">{formatINR(categorizedOverheads.cleaning)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="flex items-center gap-1">
                      POS Software, Cloud &amp; Apps:
                      {(categorizedOverheads.isPosShared || categorizedOverheads.isCloudShared) && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-blue-100 text-blue-800 font-bold">
                          Shared Split
                        </span>
                      )}
                    </span>
                    <span className="font-semibold text-slate-800">{formatINR(categorizedOverheads.software)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Insurance, FSSAI &amp; Other Licenses:</span>
                    <span className="font-semibold text-slate-800">{formatINR(categorizedOverheads.licenses)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Porter Charge &amp; Misc Cost:</span>
                    <span className="font-semibold text-slate-800">{formatINR(categorizedOverheads.logisticsAndMisc)}</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">14 outlet expense categories</span>
                  {onNavigateToOverheads && (
                    <button
                      onClick={onNavigateToOverheads}
                      className="text-teal-600 hover:text-teal-700 font-bold underline cursor-pointer"
                    >
                      Configure Overheads &amp; Splits &rarr;
                    </button>
                  )}
                </div>

                {isSimulationMode && (
                  <div className="pt-2 flex items-center gap-2">
                    <span className="text-[10px] text-amber-700 font-semibold">Simulate ₹:</span>
                    <input
                      type="number"
                      placeholder={String(overheadData.total)}
                      value={simulatedOverheadCost ?? ''}
                      onChange={(e) => setSimulatedOverheadCost(e.target.value ? Number(e.target.value) : null)}
                      className="w-full text-xs font-semibold bg-white border border-amber-300 rounded p-1 text-slate-800"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Total Obligations Footer */}
            <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-900">Total Monthly Fixed Burn:</span>
              <span className="font-black text-slate-900 text-base">
                {formatINR(totalMonthlyFixedObligations)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Visual Coverage Progress & Top Contributors */}
        <div className="lg:col-span-7 space-y-5">
          {/* Progress Bar Card */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
              <span>Monthly Fixed Cost Coverage Status</span>
              <span className="text-teal-700 font-bold">{breakEvenReport.revenueCoveragePct}%</span>
            </h3>

            {/* Visual Bar */}
            <div className="space-y-1">
              <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden flex">
                <div
                  className="bg-teal-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, breakEvenReport.revenueCoveragePct)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>₹0 (Day 1)</span>
                <span className="font-semibold text-slate-600">Break-Even ({formatINR(breakEvenReport.breakEvenMonthlyRevenue)})</span>
                <span>Current Monthly Run-Rate ({formatINR(breakEvenReport.totalMonthlyRevenue)})</span>
              </div>
            </div>

            {/* Calendar timeline visual */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Calendar className="w-4 h-4 text-teal-600" />
                30-Day Operational Profit Timeline
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 pt-1">
                {Array.from({ length: 30 }).map((_, i) => {
                  const day = i + 1;
                  const isCovered = breakEvenDay ? day >= breakEvenDay : false;
                  const isBreakEvenPoint = day === breakEvenDay;
                  return (
                    <div
                      key={day}
                      className={`h-8 rounded flex items-center justify-center text-[10px] font-bold border transition-all ${
                        isBreakEvenPoint
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs scale-105 z-10'
                          : isCovered
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-slate-100 text-slate-400 border-slate-200'
                      }`}
                      title={
                        isBreakEvenPoint
                          ? `Day ${day}: Official Break-Even Reached!`
                          : isCovered
                          ? `Day ${day}: Net Restaurant Profit`
                          : `Day ${day}: Paying Fixed Rent/Payroll`
                      }
                    >
                      {day}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-slate-200 inline-block" /> Days 1–{breakEvenDay ? breakEvenDay - 1 : 30}: Overhead Recovery
                </span>
                <span className="flex items-center gap-1 font-semibold text-emerald-700">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-200 inline-block" /> Days {breakEvenDay ? breakEvenDay : 30}–30: Pure Owner Profit
                </span>
              </div>
            </div>
          </div>

          {/* Top 5 Dishes Financing Your Fixed Rent & Salaries */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Top Dishes Financing Your Salaries &amp; Kitchen Overheads
              </h3>
              <span className="text-[11px] text-slate-500 font-medium">Ranked by Contribution Margin</span>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {parentMetrics.slice(0, 5).map((dish, idx) => {
                const monthlyDishCM = Math.round(dish.totalContribution / estimatedMonths);
                const shareOfOverhead = totalMonthlyFixedObligations > 0
                  ? Math.round((monthlyDishCM / totalMonthlyFixedObligations) * 100)
                  : 0;
                return (
                  <div key={dish.parentDishId} className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="h-6 w-6 rounded-full bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="font-semibold text-slate-900">{dish.parentDishName}</span>
                        <span className="text-[10px] text-slate-400 block">
                          Generates {formatINR(monthlyDishCM)} contribution / month
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-teal-700 block">
                        Covers {shareOfOverhead}% of Total Fixed Burn
                      </span>
                      <span className="text-[10px] text-slate-500 font-normal">
                        {dish.weightedContributionMarginPct}% Margin
                      </span>
                    </div>
                  </div>
                );
              })}
              {parentMetrics.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">
                  Upload sales data or recipes to identify which dishes finance your fixed overheads.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Aggregator Channel-Aware Break-Even & Platform Commission Optimization */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600">
                <Zap className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-black text-slate-900">
                Aggregator Channel Payouts &amp; Commission-Aware Break-Even Analysis
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Reflects the true impact of Swiggy &amp; Zomato platform fees (~22% commission + 18% GST + PG fees) versus Direct orders.
            </p>
          </div>

          {onNavigateToPayouts && (
            <button
              onClick={onNavigateToPayouts}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <span>Manage Aggregator Payouts &rarr;</span>
            </button>
          )}
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Weighted Net CM % (Post-Commission)</span>
            <div className="text-xl font-black text-slate-900 mt-1">
              {(channelBreakEven.weightedContributionMarginRatio * 100).toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Net CM after ~22% platform cut &amp; 32.5% food COGS
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Channel-Adjusted Break-Even</span>
            <div className="text-xl font-black text-amber-600 mt-1">
              {formatINR(channelBreakEven.breakEvenGrossRevenue)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Requires {Math.round(channelBreakEven.breakEvenOrders / 30)} orders / day ({channelBreakEven.breakEvenOrders} / mo)
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Operating Margin of Safety</span>
            <div className={`text-xl font-black mt-1 ${channelBreakEven.marginOfSafetyRevenue >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {channelBreakEven.marginOfSafetyRevenue >= 0 ? '+' : ''}{formatINR(channelBreakEven.marginOfSafetyRevenue)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {channelBreakEven.marginOfSafetyPct.toFixed(1)}% cushion above break-even run rate
            </div>
          </div>
        </div>

        {/* What-If Channel Shift Simulator */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-teal-50 via-indigo-50 to-teal-50 border border-teal-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>Channel Shift Optimization Simulator (Swiggy/Zomato &rarr; Direct Orders)</span>
            </h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-800">
              Zero Platform Commission
            </span>
          </div>
          <p className="text-[11px] text-slate-600">
            By incentivizing customers to order via Direct WhatsApp / Takeaway / Dine-in instead of Swiggy/Zomato, you eliminate the ~22% platform take rate, drastically reducing the monthly break-even burden:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[5, 10, 15, 20].map((shiftPct) => {
              const savings = Math.round((channelBreakEven.channelShiftSimulation.monthlySavingsINR * shiftPct) / 15);
              const dropOrders = Math.round((channelBreakEven.channelShiftSimulation.reducedBreakEvenOrders * shiftPct) / 15);
              return (
                <div key={shiftPct} className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                  <span className="font-bold text-slate-900 block text-xs">
                    Shift {shiftPct}% to Direct
                  </span>
                  <span className="text-xs font-black text-emerald-600 block mt-1">
                    +{formatINR(savings)} /mo savings
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Break-even drops by ~{dropOrders} orders/mo
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
