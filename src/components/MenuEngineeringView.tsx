import React, { useState, useMemo } from 'react';
import { ParentDish } from '../types/restaurant';
import { formatINR, formatNumber, formatPercent } from '../utils/formatters';
import { CostEditorModal } from './CostEditorModal';
import {
  Grid2X2,
  Star,
  Trophy,
  HelpCircle,
  AlertOctagon,
  Calculator,
  Info,
  DollarSign,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { DEMO_COST_PRESETS } from '../data/demoPetpoojaDataset';

interface MenuEngineeringViewProps {
  parentDishes: ParentDish[];
  averageDishQuantity: number;
  averageDishRevenue: number;
  averageContributionMargin?: number;
  onUpdateCostOverrides: (
    overrides: Record<
      string,
      {
        unitCost: number;
        packagingCost: number;
        commissionRatePct: number;
        preparationCost: number;
        isSignature?: boolean;
        isCulturallyImportant?: boolean;
      }
    >
  ) => void;
  currentCostOverrides: Record<string, any>;
}

export const MenuEngineeringView: React.FC<MenuEngineeringViewProps> = ({
  parentDishes,
  averageDishQuantity,
  averageDishRevenue,
  averageContributionMargin,
  onUpdateCostOverrides,
  currentCostOverrides,
}) => {
  const [selectedDishForCost, setSelectedDishForCost] = useState<ParentDish | null>(null);
  const [selectedQuadrant, setSelectedQuadrant] = useState<
    'ALL' | 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG'
  >('ALL');

  // Check how many dishes have cost data
  const dishesWithCosts = useMemo(
    () => parentDishes.filter((d) => d.hasCostData && d.contributionMargin !== undefined),
    [parentDishes]
  );
  const hasFullCostData = dishesWithCosts.length >= Math.max(3, parentDishes.length * 0.5);

  // Group dishes into the 4 quadrants
  const quadrants = useMemo(() => {
    const stars: ParentDish[] = [];
    const plowhorses: ParentDish[] = [];
    const puzzles: ParentDish[] = [];
    const dogs: ParentDish[] = [];

    parentDishes.forEach((d) => {
      if (hasFullCostData && averageContributionMargin !== undefined && d.contributionMargin !== undefined) {
        const isHighPop = d.totalQuantity >= averageDishQuantity;
        const isHighMargin = d.contributionMargin >= averageContributionMargin;

        if (isHighPop && isHighMargin) stars.push(d);
        else if (isHighPop && !isHighMargin) plowhorses.push(d);
        else if (!isHighPop && isHighMargin) puzzles.push(d);
        else dogs.push(d);
      } else {
        // Alternative Sales Performance Matrix (Volume vs Revenue)
        const isHighPop = d.totalQuantity >= averageDishQuantity;
        const isHighRev = d.totalRevenue >= averageDishRevenue;

        if (isHighPop && isHighRev) stars.push(d); // High Vol, High Rev
        else if (isHighPop && !isHighRev) plowhorses.push(d); // High Vol, Low Rev (Workhorse)
        else if (!isHighPop && isHighRev) puzzles.push(d); // Low Vol, High Rev (High Ticket)
        else dogs.push(d); // Low Vol, Low Rev
      }
    });

    return { stars, plowhorses, puzzles, dogs };
  }, [
    parentDishes,
    hasFullCostData,
    averageContributionMargin,
    averageDishQuantity,
    averageDishRevenue,
  ]);

  const handleApplyPresetCosts = () => {
    onUpdateCostOverrides(DEMO_COST_PRESETS);
  };

  const handleSaveIndividualCost = (
    dishName: string,
    costs: {
      unitCost: number;
      packagingCost: number;
      commissionRatePct: number;
      preparationCost: number;
      isSignature?: boolean;
      isCulturallyImportant?: boolean;
    }
  ) => {
    onUpdateCostOverrides({
      ...currentCostOverrides,
      [dishName]: costs,
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Grid2X2 className="w-5 h-5 text-teal-600" />
            <h2 className="text-xl font-bold text-slate-900">
              {hasFullCostData
                ? 'Kasavana & Smith Menu Engineering Matrix'
                : 'Sales Performance Matrix (Revenue vs. Volume)'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {hasFullCostData
              ? 'Classifies dishes by popularity (order volume) versus profitability (unit contribution margin).'
              : 'Classifies dishes by order volume versus total revenue. To see profitability margins, configure ingredient costs.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!hasFullCostData ? (
            <button
              onClick={handleApplyPresetCosts}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 transition-colors shadow-xs"
            >
              <Calculator className="w-4 h-4 text-amber-600" />
              Apply Preset Indian Restaurant Costs
            </button>
          ) : (
            <button
              onClick={() => onUpdateCostOverrides({})}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300 transition-colors"
            >
              Clear Cost Data
            </button>
          )}
        </div>
      </div>

      {/* Notice Banner when costs not provided */}
      {!hasFullCostData && (
        <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 text-xs flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block">
              Operating in &ldquo;Sales Performance&rdquo; Mode (Anti-Hallucination Safe)
            </span>
            <span>
              Petpooja POS exports sales receipts, not supplier invoices. Because ingredient costs are not present in your sales file,
              the matrix is currently plotted on <strong>Units Sold vs Total Revenue</strong> rather than guessing profit.
              Click &ldquo;Configure Cost&rdquo; on any dish or load preset estimates to activate true contribution margins.
            </span>
          </div>
        </div>
      )}

      {/* Threshold Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 block text-[11px]">Volume Benchmark (Avg)</span>
          <span className="text-lg font-bold text-slate-900">{averageDishQuantity} units</span>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 block text-[11px]">Revenue Benchmark (Avg)</span>
          <span className="text-lg font-bold text-slate-900">{formatINR(averageDishRevenue)}</span>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 block text-[11px]">Average Unit Margin</span>
          <span className="text-lg font-bold text-teal-600">
            {averageContributionMargin ? formatINR(averageContributionMargin) : 'Costs not set'}
          </span>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 block text-[11px]">Cost-Configured Dishes</span>
          <span className="text-lg font-bold text-slate-900">
            {dishesWithCosts.length} / {parentDishes.length}
          </span>
        </div>
      </div>

      {/* Interactive 4-Quadrant Visual Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TOP-LEFT: PUZZLES / HIGH REVENUE NICHE */}
        <div className="bg-white rounded-xl p-5 border-2 border-purple-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  {hasFullCostData ? 'PUZZLES (High Margin, Low Volume)' : 'HIGH TICKET (High Revenue, Low Volume)'}
                </h3>
                <span className="text-[11px] text-slate-500">
                  {quadrants.puzzles.length} dishes in this quadrant
                </span>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold uppercase">
              Action: Promote &amp; Reposition
            </span>
          </div>

          <p className="text-xs text-slate-600">
            Very lucrative per order, but ordered less frequently. Increase menu prominence, bundle with bestsellers, or feature in tasting platters.
          </p>

          <div className="space-y-2 pt-1">
            {quadrants.puzzles.map((d) => (
              <div
                key={d.id}
                className="p-2.5 rounded-lg bg-purple-50/50 border border-purple-100 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 block">{d.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {d.totalQuantity} units &bull; {formatINR(d.averageRealizedPrice)}/portion
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-extrabold text-purple-950 block">
                      {formatINR(d.totalRevenue)}
                    </span>
                    {d.contributionMargin && (
                      <span className="text-[10px] text-emerald-700 font-semibold">
                        Margin: {formatINR(d.contributionMargin)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedDishForCost(d)}
                    className="p-1 rounded text-slate-400 hover:text-purple-600 hover:bg-purple-100"
                    title="Edit Cost & Margin"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TOP-RIGHT: STARS / REVENUE CHAMPIONS */}
        <div className="bg-white rounded-xl p-5 border-2 border-emerald-300 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Star className="w-4 h-4 fill-emerald-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  {hasFullCostData ? 'STARS (High Margin, High Volume)' : 'STARS (High Revenue, High Volume)'}
                </h3>
                <span className="text-[11px] text-slate-500">
                  {quadrants.stars.length} dishes in this quadrant
                </span>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold uppercase">
              Action: Protect &amp; Double Down
            </span>
          </div>

          <p className="text-xs text-slate-600">
            The crown jewels of your restaurant. Unmatched demand and stellar earnings. Maintain strict recipe consistency and avoid stockouts during rush.
          </p>

          <div className="space-y-2 pt-1">
            {quadrants.stars.map((d) => (
              <div
                key={d.id}
                className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 block">{d.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {d.totalQuantity} units &bull; {formatINR(d.averageRealizedPrice)}/portion
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-extrabold text-emerald-950 block">
                      {formatINR(d.totalRevenue)}
                    </span>
                    {d.contributionMargin && (
                      <span className="text-[10px] text-emerald-700 font-semibold">
                        Margin: {formatINR(d.contributionMargin)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedDishForCost(d)}
                    className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-100"
                    title="Edit Cost & Margin"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BOTTOM-LEFT: DOGS / EXIT CANDIDATES */}
        <div className="bg-white rounded-xl p-5 border-2 border-rose-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertOctagon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  {hasFullCostData ? 'DOGS (Low Margin, Low Volume)' : 'UNDERPERFORMERS (Low Revenue, Low Volume)'}
                </h3>
                <span className="text-[11px] text-slate-500">
                  {quadrants.dogs.length} dishes in this quadrant
                </span>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold uppercase">
              Action: Audit or Remove
            </span>
          </div>

          <p className="text-xs text-slate-600">
            Slow movers taking up refrigerator space and chef prep time. Unless culturally essential or a signature item, consider retiring or consolidating.
          </p>

          <div className="space-y-2 pt-1">
            {quadrants.dogs.map((d) => (
              <div
                key={d.id}
                className="p-2.5 rounded-lg bg-rose-50/50 border border-rose-100 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 block">{d.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {d.totalQuantity} units &bull; {formatINR(d.averageRealizedPrice)}/portion
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-extrabold text-rose-950 block">
                      {formatINR(d.totalRevenue)}
                    </span>
                    {d.contributionMargin && (
                      <span className="text-[10px] text-rose-700 font-semibold">
                        Margin: {formatINR(d.contributionMargin)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedDishForCost(d)}
                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-100"
                    title="Edit Cost & Margin"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BOTTOM-RIGHT: PLOWHORSES / HIGH VOLUME WORKHORSES */}
        <div className="bg-white rounded-xl p-5 border-2 border-blue-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  {hasFullCostData ? 'PLOWHORSES (Low Margin, High Volume)' : 'WORKHORSES (High Volume, Lower Price)'}
                </h3>
                <span className="text-[11px] text-slate-500">
                  {quadrants.plowhorses.length} dishes in this quadrant
                </span>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold uppercase">
              Action: Reprice &amp; Portion Control
            </span>
          </div>

          <p className="text-xs text-slate-600">
            Highly popular crowd favorites, but carry higher ingredient or delivery costs. Implement a controlled 3-5% price rise or optimize packaging to boost margins.
          </p>

          <div className="space-y-2 pt-1">
            {quadrants.plowhorses.map((d) => (
              <div
                key={d.id}
                className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 block">{d.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {d.totalQuantity} units &bull; {formatINR(d.averageRealizedPrice)}/portion
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-extrabold text-blue-950 block">
                      {formatINR(d.totalRevenue)}
                    </span>
                    {d.contributionMargin && (
                      <span className="text-[10px] text-blue-700 font-semibold">
                        Margin: {formatINR(d.contributionMargin)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedDishForCost(d)}
                    className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-100"
                    title="Edit Cost & Margin"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cost Editor Modal */}
      {selectedDishForCost && (
        <CostEditorModal
          dish={selectedDishForCost}
          isOpen={true}
          onClose={() => setSelectedDishForCost(null)}
          onSaveCost={handleSaveIndividualCost}
        />
      )}
    </div>
  );
};
