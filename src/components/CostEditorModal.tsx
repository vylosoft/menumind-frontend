import React, { useState } from 'react';
import { ParentDish } from '../types/restaurant';
import { formatINR } from '../utils/formatters';
import { X, Calculator, IndianRupee, Percent } from 'lucide-react';

interface CostEditorModalProps {
  dish: ParentDish;
  isOpen: boolean;
  onClose: () => void;
  onSaveCost: (
    dishName: string,
    costs: {
      unitCost: number;
      packagingCost: number;
      commissionRatePct: number;
      preparationCost: number;
      isSignature?: boolean;
      isCulturallyImportant?: boolean;
    }
  ) => void;
}

export const CostEditorModal: React.FC<CostEditorModalProps> = ({
  dish,
  isOpen,
  onClose,
  onSaveCost,
}) => {
  const [unitCost, setUnitCost] = useState<number>(dish.unitCost || 0);
  const [packagingCost, setPackagingCost] = useState<number>(dish.packagingCost || 0);
  const [commissionRatePct, setCommissionRatePct] = useState<number>(dish.commissionRatePct || 0);
  const [preparationCost, setPreparationCost] = useState<number>(dish.preparationCost || 0);
  const [isSignature, setIsSignature] = useState<boolean>(dish.isSignatureDish || false);
  const [isCulturallyImportant, setIsCulturallyImportant] = useState<boolean>(
    dish.isCulturallyImportant || false
  );

  if (!isOpen) return null;

  // Real-time calculation preview
  const avgPrice = dish.averageRealizedPrice;
  const commissionCost = (avgPrice * commissionRatePct) / 100;
  const totalCost = unitCost + packagingCost + preparationCost + commissionCost;
  const contributionMargin = avgPrice - totalCost;
  const contributionMarginPct = avgPrice > 0 ? (contributionMargin / avgPrice) * 100 : 0;
  const totalProfitContribution = contributionMargin * dish.totalQuantity;

  const handleSave = () => {
    onSaveCost(dish.name, {
      unitCost,
      packagingCost,
      commissionRatePct,
      preparationCost,
      isSignature,
      isCulturallyImportant,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Cost &amp; Margin Configuration: {dish.name}
              </h3>
              <span className="text-xs text-slate-500">
                Average selling price: <strong>{formatINR(dish.averageRealizedPrice)}</strong> ({dish.variants.length} variants)
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          {/* Ingredient / Food Cost */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">
              Raw Ingredient Cost / Portion (₹)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="1"
                value={unitCost || ''}
                onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <span className="text-[10px] text-slate-400">Meat, fish, vegetables, spices, oil</span>
          </div>

          {/* Packaging Cost */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Packaging Material (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={packagingCost || ''}
              onChange={(e) => setPackagingCost(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-teal-500"
            />
            <span className="text-[10px] text-slate-400">Boxes, foil, containers, cutlery</span>
          </div>

          {/* Platform / Aggregator Commission Rate */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Aggregator Commission (%)</label>
            <input
              type="number"
              min="0"
              max="40"
              step="1"
              value={commissionRatePct || ''}
              onChange={(e) => setCommissionRatePct(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-teal-500"
            />
            <span className="text-[10px] text-slate-400">Swiggy / Zomato share (or 0% for dine-in)</span>
          </div>

          {/* Direct Prep & Labour Cost */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Direct Kitchen Prep Cost (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={preparationCost || ''}
              onChange={(e) => setPreparationCost(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-teal-500"
            />
            <span className="text-[10px] text-slate-400">Fuel, gas, specialized chef prep</span>
          </div>
        </div>

        {/* Strategic Checkboxes */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isSignature}
              onChange={(e) => setIsSignature(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <span className="font-semibold text-slate-800">
              Signature Dish (Protects against rash removal recommendations)
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isCulturallyImportant}
              onChange={(e) => setIsCulturallyImportant(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <span className="font-semibold text-slate-800">
              Culturally Critical Staple (Essential heritage item expected by patrons)
            </span>
          </label>
        </div>

        {/* Real-time Calculation Summary Card */}
        <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-slate-400">Total Variable Unit Cost:</span>
            <span className="font-bold text-slate-200">{formatINR(totalCost)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Contribution Margin per Portion:</span>
            <span
              className={`font-extrabold text-sm ${
                contributionMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {formatINR(contributionMargin)} ({contributionMarginPct.toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-slate-400">Total Profit Generated ({dish.totalQuantity} units):</span>
            <span className="font-bold text-teal-300">{formatINR(totalProfitContribution)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-lg text-xs font-bold bg-teal-600 text-white hover:bg-teal-500 shadow-xs"
          >
            Save Costs &amp; Recalculate
          </button>
        </div>
      </div>
    </div>
  );
};
