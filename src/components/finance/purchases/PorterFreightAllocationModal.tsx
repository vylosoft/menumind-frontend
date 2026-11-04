/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { PurchaseRecord, PorterAllocationMethod } from '../../../types/purchases';
import { allocatePorterFreight } from '../../../utils/purchaseCalculations';
import { formatINR } from '../../../utils/financeCalculations';
import { Truck, X, CheckCircle2, Split, AlertCircle, ArrowRight } from 'lucide-react';

interface PorterFreightAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  porterRecord: PurchaseRecord;
  purchases: PurchaseRecord[];
  onApplyAllocation: (
    porterId: string,
    allocations: Record<string, number>,
    updatedPurchases: PurchaseRecord[]
  ) => void;
}

export const PorterFreightAllocationModal: React.FC<PorterFreightAllocationModalProps> = ({
  isOpen,
  onClose,
  porterRecord,
  purchases,
  onApplyAllocation,
}) => {
  const [method, setMethod] = useState<PorterAllocationMethod>('value_ratio');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manualValues, setManualValues] = useState<Record<string, number>>({});

  // Eligible ingredient purchases in the same outlet & month
  const eligiblePurchases = useMemo(() => {
    return purchases.filter(
      (p) =>
        p.outletId === porterRecord.outletId &&
        p.month === porterRecord.month &&
        p.id !== porterRecord.id &&
        p.classification === 'food_ingredient'
    );
  }, [purchases, porterRecord]);

  // Default select purchases close to porter date
  useState(() => {
    const nearDate = eligiblePurchases
      .filter((p) => Math.abs(new Date(p.purchaseDate).getTime() - new Date(porterRecord.purchaseDate).getTime()) <= 3 * 86400000)
      .map((p) => p.id);
    setSelectedIds(nearDate.length > 0 ? nearDate : eligiblePurchases.slice(0, 4).map((p) => p.id));
  });

  const targetPurchases = useMemo(() => {
    return eligiblePurchases.filter((p) => selectedIds.includes(p.id));
  }, [eligiblePurchases, selectedIds]);

  const computedAllocations = useMemo(() => {
    return allocatePorterFreight(porterRecord.netAmount, targetPurchases, method, manualValues);
  }, [porterRecord.netAmount, targetPurchases, method, manualValues]);

  const totalAllocated = useMemo(() => {
    return Object.values(computedAllocations).reduce((s, v) => s + v, 0);
  }, [computedAllocations]);

  const remainingUnallocated = porterRecord.netAmount - totalAllocated;

  const handleToggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleApply = () => {
    if (totalAllocated <= 0) {
      alert('Please allocate at least some freight across selected ingredient purchases.');
      return;
    }

    const updated = purchases.map((p) => {
      const addedFreight = computedAllocations[p.id];
      if (addedFreight !== undefined && addedFreight > 0) {
        const newFreight = (p.transportationExpense || 0) + addedFreight;
        const newLanded = p.netAmount + newFreight;
        return {
          ...p,
          transportationExpense: newFreight,
          landedCost: newLanded,
          lastModifiedDate: new Date().toISOString(),
          notes: `${p.notes || ''} [Includes ${formatINR(addedFreight)} Porter freight from trip ${porterRecord.invoiceNumber || porterRecord.id}]`.trim(),
        };
      }
      return p;
    });

    onApplyAllocation(porterRecord.id, computedAllocations, updated);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 font-bold">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Allocate Porter Freight Charge
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-400/20 text-teal-300 font-normal">
                  {formatINR(porterRecord.netAmount)}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {porterRecord.itemDescription} ({porterRecord.purchaseDate} &bull; {porterRecord.outletId})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Method selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Allocation Methodology
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setMethod('value_ratio')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  method === 'value_ratio'
                    ? 'border-teal-500 bg-teal-50/50 text-teal-950 font-bold ring-1 ring-teal-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold">Invoice Value Ratio</div>
                <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                  Proportionate to purchase value (₹)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMethod('weight_ratio')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  method === 'weight_ratio'
                    ? 'border-teal-500 bg-teal-50/50 text-teal-950 font-bold ring-1 ring-teal-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold">Weight / Volume Ratio</div>
                <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                  Proportionate to kg / units
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMethod('manual')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  method === 'manual'
                    ? 'border-teal-500 bg-teal-50/50 text-teal-950 font-bold ring-1 ring-teal-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold">Manual Assignment</div>
                <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                  Explicit rupee amounts per bill
                </div>
              </button>
            </div>
          </div>

          {/* Target Purchases List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Select Ingredient Purchases Transported
              </label>
              <span className="text-[11px] text-slate-500">
                {selectedIds.length} of {eligiblePurchases.length} selected
              </span>
            </div>

            <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/60 max-h-60 overflow-y-auto">
              {eligiblePurchases.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-4">
                  No food ingredient purchases recorded for this outlet & month.
                </div>
              ) : (
                eligiblePurchases.map((p) => {
                  const isChecked = selectedIds.includes(p.id);
                  const share = computedAllocations[p.id] || 0;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleToggleSelect(p.id)}
                      className={`p-2.5 rounded-lg border flex items-center justify-between transition-all cursor-pointer ${
                        isChecked
                          ? 'border-teal-300 bg-teal-50/60 shadow-2xs'
                          : 'border-slate-200 bg-white opacity-70 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {p.itemDescription}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {p.purchaseDate} &bull; {p.category} &bull; Base Cost: {formatINR(p.netAmount)}
                            {p.quantity ? ` (${p.quantity} ${p.unitOfMeasure})` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        {method === 'manual' && isChecked ? (
                          <input
                            type="number"
                            value={manualValues[p.id] || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const v = Number(e.target.value) || 0;
                              setManualValues((prev) => ({ ...prev, [p.id]: v }));
                            }}
                            placeholder="₹ share"
                            className="w-20 px-2 py-1 bg-white border border-teal-400 rounded-md text-xs text-right font-bold text-teal-900"
                          />
                        ) : (
                          <div className="text-xs font-black text-teal-900">
                            +{formatINR(share)}
                            <div className="text-[10px] text-slate-400 font-normal">
                              Landed: {formatINR(p.netAmount + share)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Allocation reconciliation check */}
          <div className="p-3.5 bg-slate-100 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-600">Total Freight: </span>
              <span className="font-bold text-slate-900">{formatINR(porterRecord.netAmount)}</span>
              <span className="text-slate-400 mx-2">&bull;</span>
              <span className="text-slate-600">Allocated: </span>
              <span className="font-bold text-emerald-700">{formatINR(totalAllocated)}</span>
            </div>
            {Math.abs(remainingUnallocated) > 1 ? (
              <div className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Remaining: {formatINR(remainingUnallocated)}
              </div>
            ) : (
              <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                100% Balanced
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-600/20 flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Apply Freight to Landed COGS</span>
          </button>
        </div>
      </div>
    </div>
  );
};
