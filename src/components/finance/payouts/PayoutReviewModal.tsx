/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  PlatformPayoutRecord,
  AggregatorBrandOutletMapping,
  OwnlyPayoutBreakupModel,
  OwnlyPayoutSettlementRow,
  PayoutOtherChargeItem,
  SwiggyExtraLineItem,
  SwiggyPayoutBreakupModel,
  SwiggyQuintet,
  ZomatoExtraLineItem,
  ZomatoPayoutBreakupModel,
  ZomatoTriplet,
} from '../../../types/finance';
import { recalculatePayoutRecord } from '../../../utils/payoutManager';
import {
  applyZomatoBreakupToPayoutRecord,
  ensureZomatoBreakupModelOnRecord,
  updateTripletColumn,
  zeroTriplet,
} from '../../../utils/zomatoPayoutModel';
import {
  applySwiggyBreakupToPayoutRecord,
  ensureSwiggyBreakupModelOnRecord,
  updateQuintetColumn,
  zeroQuintet,
} from '../../../utils/swiggyPayoutModel';
import {
  applyOwnlyBreakupToPayoutRecord,
  createEmptyOwnlyRow,
  ensureOwnlyBreakupModelOnRecord,
  updateOwnlySettlementRow,
} from '../../../utils/ownlyPayoutModel';
import { detectAggregatorMappingFromText } from '../../../utils/aggregatorMappingManager';
import { formatINR } from '../../../utils/financeCalculations';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Building2,
  FileSpreadsheet,
  Database,
  RefreshCw,
  Calculator,
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';

interface PayoutReviewModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialRecords: PlatformPayoutRecord[];
  mappings: AggregatorBrandOutletMapping[];
  isSaving: boolean;
  saveError?: string | null;
  onCancel: () => void;
  onConfirm: (
    confirmedRecords: PlatformPayoutRecord[],
    mappingsToUpsert: AggregatorBrandOutletMapping[]
  ) => void;
}

type ZomatoTripletFieldKey = NonNullable<
  {
    [K in keyof Required<ZomatoPayoutBreakupModel>]: ZomatoPayoutBreakupModel[K] extends ZomatoTriplet
      ? K
      : never;
  }[keyof ZomatoPayoutBreakupModel]
>;

type SwiggyQuintetFieldKey = NonNullable<
  {
    [K in keyof Required<SwiggyPayoutBreakupModel>]: SwiggyPayoutBreakupModel[K] extends SwiggyQuintet
      ? K
      : never;
  }[keyof SwiggyPayoutBreakupModel]
>;

function formatZomatoSheetINR(n: number): string {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return `${sign}₹${abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSwiggySheetNum(n: number): string {
  const num = Number(n) || 0;
  if (Object.is(num, -0) || Math.abs(num) < 0.0001) return '0';
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function normalizeIncomingRecord(rec: PlatformPayoutRecord): PlatformPayoutRecord {
  if (rec.platform === 'zomato') {
    const zb = ensureZomatoBreakupModelOnRecord(rec);
    return recalculatePayoutRecord(applyZomatoBreakupToPayoutRecord(rec, zb));
  }

  if (rec.platform === 'swiggy') {
    const sb = ensureSwiggyBreakupModelOnRecord(rec);
    return recalculatePayoutRecord(applySwiggyBreakupToPayoutRecord(rec, sb));
  }

  if (rec.platform === 'ownly') {
    const ob = ensureOwnlyBreakupModelOnRecord(rec);
    return recalculatePayoutRecord(applyOwnlyBreakupToPayoutRecord(rec, ob));
  }

  const existingBreakdown = Array.isArray(rec.otherChargesBreakdown)
    ? [...rec.otherChargesBreakdown]
    : [];
  if (existingBreakdown.length === 0 && (rec.otherPlatformFees || 0) > 0) {
    existingBreakdown.push({
      id: `other-init-${Date.now()}`,
      label: 'Other Platform Fees',
      amount: Number(rec.otherPlatformFees) || 0,
    });
  }
  return recalculatePayoutRecord({
    ...rec,
    otherChargesBreakdown: existingBreakdown,
  });
}

interface ZomatoSectionHeaderRowProps {
  code: string;
  title: string;
  formula?: string;
  triplet: ZomatoTriplet;
  reported?: ZomatoTriplet;
  tone: 'green' | 'red' | 'neutral';
  badgeText?: string;
  onAddExtra?: () => void;
  addExtraLabel?: string;
}

const ZomatoSectionHeaderRow: React.FC<ZomatoSectionHeaderRowProps> = ({
  code,
  title,
  formula,
  triplet,
  reported,
  tone,
  badgeText,
  onAddExtra,
  addExtraLabel,
}) => {
  const totalColorClass =
    tone === 'green'
      ? 'text-emerald-700'
      : tone === 'red'
      ? 'text-rose-700'
      : 'text-slate-950';

  const hasReportedMismatch =
    reported !== undefined && Math.abs((reported.total || 0) - (triplet.total || 0)) > 0.05;

  return (
    <tr className="bg-slate-100/90 border-t-2 border-b border-slate-300">
      <td className="px-2.5 py-2.5 font-black text-xs text-slate-950 align-top">{code}</td>
      <td className="px-3 py-2.5 align-top">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-black text-xs sm:text-[13px] text-slate-950 leading-snug">
              {title}
            </div>
            {formula && (
              <div className="text-[11px] font-medium text-slate-500 mt-0.5 font-mono">
                {formula}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {badgeText && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-300">
                {badgeText}
              </span>
            )}
            {onAddExtra && (
              <button
                type="button"
                onClick={onAddExtra}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>{addExtraLabel || 'Add Row'}</span>
              </button>
            )}
          </div>
        </div>
      </td>
      <td className="px-2.5 py-2.5 text-right font-mono font-black text-xs sm:text-[13px] text-slate-950 align-bottom whitespace-nowrap">
        {formatZomatoSheetINR(triplet.delivered)}
      </td>
      <td className="px-2.5 py-2.5 text-right font-mono font-black text-xs sm:text-[13px] text-slate-950 align-bottom whitespace-nowrap">
        {formatZomatoSheetINR(triplet.cancelled)}
      </td>
      <td className="px-2.5 py-2.5 text-right align-bottom whitespace-nowrap">
        <div className={`font-mono font-black text-xs sm:text-[13px] ${totalColorClass}`}>
          {formatZomatoSheetINR(triplet.total)}
        </div>
        {hasReportedMismatch && reported && (
          <div className="text-[10px] font-mono text-amber-700">
            Sheet: {formatZomatoSheetINR(reported.total)}
          </div>
        )}
      </td>
    </tr>
  );
};

interface ZomatoTripletEditRowProps {
  sNo?: string;
  label: string;
  subLabel?: string;
  signHint?: '+' | '-';
  indented?: boolean;
  readOnly?: boolean;
  highlightRow?: boolean;
  triplet: ZomatoTriplet;
  onChangeCol?: (col: 'delivered' | 'cancelled' | 'total', rawVal: string) => void;
}

const ZomatoTripletEditRow: React.FC<ZomatoTripletEditRowProps> = ({
  sNo,
  label,
  subLabel,
  signHint,
  indented = false,
  readOnly = false,
  highlightRow = false,
  triplet,
  onChangeCol,
}) => {
  return (
    <tr
      className={`border-b border-slate-200/80 transition-colors ${
        highlightRow
          ? 'bg-teal-50/40 hover:bg-teal-50/70'
          : indented
          ? 'bg-slate-50/50 hover:bg-slate-100/70'
          : 'bg-white hover:bg-slate-50/80'
      }`}
    >
      <td className="px-2.5 py-1.5 text-[11px] font-mono text-slate-600 align-middle">
        {sNo || ''}
      </td>
      <td
        className={`px-3 py-1.5 align-middle ${
          indented ? 'pl-8 sm:pl-14 text-right sm:text-right' : ''
        }`}
      >
        <div
          className={`text-xs leading-snug ${
            indented ? 'font-semibold text-slate-800' : 'font-medium text-slate-900'
          }`}
        >
          <span>{label}</span>
          {signHint && (
            <span
              className={`ml-1.5 inline-block px-1.5 py-0 rounded text-[10px] font-mono font-bold ${
                signHint === '-'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {signHint}
            </span>
          )}
        </div>
        {subLabel && (
          <div className="text-[11px] italic text-slate-500 leading-tight mt-0.5">
            {subLabel}
          </div>
        )}
      </td>

      {readOnly || !onChangeCol ? (
        <>
          <td className="px-2.5 py-1.5 text-right font-mono text-xs text-slate-800 whitespace-nowrap">
            {formatZomatoSheetINR(triplet.delivered)}
          </td>
          <td className="px-2.5 py-1.5 text-right font-mono text-xs text-slate-800 whitespace-nowrap">
            {formatZomatoSheetINR(triplet.cancelled)}
          </td>
          <td className="px-2.5 py-1.5 text-right font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
            {formatZomatoSheetINR(triplet.total)}
          </td>
        </>
      ) : (
        <>
          <td className="px-2 py-1 text-right align-middle">
            <div className="inline-flex items-center justify-end gap-0.5 w-full">
              <span className="text-[10px] text-slate-400 font-mono select-none">₹</span>
              <input
                type="number"
                step="0.01"
                value={triplet.delivered}
                onChange={(e) => onChangeCol('delivered', e.target.value)}
                className="w-24 sm:w-28 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded-md px-1.5 py-1 text-right font-mono text-xs text-slate-800 focus:outline-hidden"
              />
            </div>
          </td>
          <td className="px-2 py-1 text-right align-middle">
            <div className="inline-flex items-center justify-end gap-0.5 w-full">
              <span className="text-[10px] text-slate-400 font-mono select-none">₹</span>
              <input
                type="number"
                step="0.01"
                value={triplet.cancelled}
                onChange={(e) => onChangeCol('cancelled', e.target.value)}
                className="w-20 sm:w-24 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded-md px-1.5 py-1 text-right font-mono text-xs text-slate-700 focus:outline-hidden"
              />
            </div>
          </td>
          <td className="px-2 py-1 text-right align-middle">
            <div className="inline-flex items-center justify-end gap-0.5 w-full">
              <span className="text-[10px] text-slate-400 font-mono select-none">₹</span>
              <input
                type="number"
                step="0.01"
                value={triplet.total}
                onChange={(e) => onChangeCol('total', e.target.value)}
                className="w-24 sm:w-28 bg-slate-50/70 hover:bg-slate-100 focus:bg-white border border-slate-200/80 hover:border-slate-300 focus:border-indigo-500 rounded-md px-1.5 py-1 text-right font-mono text-xs font-semibold text-slate-950 focus:outline-hidden"
              />
            </div>
          </td>
        </>
      )}
    </tr>
  );
};

interface SwiggySectionSummaryRowProps {
  title: string;
  quintet: SwiggyQuintet;
  reported?: SwiggyQuintet;
  tone?: 'green' | 'red' | 'neutral';
  isNetPayout?: boolean;
  onAddExtra?: () => void;
  addExtraLabel?: string;
}

const SwiggySectionSummaryRow: React.FC<SwiggySectionSummaryRowProps> = ({
  title,
  quintet,
  reported,
  tone = 'neutral',
  isNetPayout = false,
  onAddExtra,
  addExtraLabel,
}) => {
  const totalColorClass = isNetPayout
    ? 'text-emerald-800'
    : tone === 'green'
    ? 'text-slate-950'
    : tone === 'red'
    ? 'text-rose-800'
    : 'text-slate-950';

  const hasReportedMismatch =
    reported !== undefined && Math.abs((reported.total || 0) - (quintet.total || 0)) > 0.05;

  return (
    <tr
      className={
        isNetPayout
          ? 'bg-amber-50/90 border-t-2 border-b-2 border-amber-300'
          : 'bg-slate-100/90 border-t-2 border-b border-slate-300'
      }
    >
      <td className="px-3 py-2.5 align-middle">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`font-black ${
              isNetPayout ? 'text-sm text-slate-950' : 'text-xs sm:text-[13px] text-slate-950'
            }`}
          >
            {title}
          </span>
          {onAddExtra && (
            <button
              type="button"
              onClick={onAddExtra}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-white text-orange-700 hover:bg-orange-50 border border-orange-200 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>{addExtraLabel || 'Add Row'}</span>
            </button>
          )}
        </div>
      </td>
      <td className="px-2 py-2.5 text-right font-mono font-black text-xs sm:text-[13px] text-slate-900 whitespace-nowrap">
        {formatSwiggySheetNum(quintet.swiggyDelivered)}
      </td>
      <td className="px-2 py-2.5 text-right font-mono font-black text-xs sm:text-[13px] text-slate-900 whitespace-nowrap border-r border-slate-200">
        {formatSwiggySheetNum(quintet.swiggyCancelled)}
      </td>
      <td className="px-2 py-2.5 text-right font-mono font-black text-xs sm:text-[13px] text-slate-900 whitespace-nowrap">
        {formatSwiggySheetNum(quintet.toingDelivered)}
      </td>
      <td className="px-2 py-2.5 text-right font-mono font-black text-xs sm:text-[13px] text-slate-900 whitespace-nowrap border-r border-slate-200">
        {formatSwiggySheetNum(quintet.toingCancelled)}
      </td>
      <td className="px-2.5 py-2.5 text-right whitespace-nowrap">
        <div
          className={`font-mono font-black ${
            isNetPayout ? 'text-sm' : 'text-xs sm:text-[13px]'
          } ${totalColorClass}`}
        >
          {formatSwiggySheetNum(quintet.total)}
        </div>
        {hasReportedMismatch && reported && (
          <div className="text-[10px] font-mono text-amber-700">
            Sheet: {formatSwiggySheetNum(reported.total)}
          </div>
        )}
      </td>
    </tr>
  );
};

interface SwiggyQuintetEditRowProps {
  label: string;
  quintet: SwiggyQuintet;
  boldRow?: boolean;
  highlightRow?: boolean;
  isInteger?: boolean;
  signBadge?: '+' | '-' | '±';
  onAddExtra?: () => void;
  addExtraLabel?: string;
  onChangeCol: (col: keyof SwiggyQuintet, rawVal: string) => void;
}

const SwiggyQuintetEditRow: React.FC<SwiggyQuintetEditRowProps> = ({
  label,
  quintet,
  boldRow = false,
  highlightRow = false,
  isInteger = false,
  signBadge,
  onAddExtra,
  addExtraLabel,
  onChangeCol,
}) => {
  const cols: (keyof SwiggyQuintet)[] = [
    'swiggyDelivered',
    'swiggyCancelled',
    'toingDelivered',
    'toingCancelled',
    'total',
  ];

  return (
    <tr
      className={`border-b border-slate-200/80 transition-colors ${
        highlightRow
          ? 'bg-amber-50/40 hover:bg-amber-50/70'
          : boldRow
          ? 'bg-slate-50/90 hover:bg-slate-100/80 border-t border-slate-300'
          : 'bg-white hover:bg-slate-50/80'
      }`}
    >
      <td className="px-3 py-1.5 align-middle">
        <div className="flex items-center justify-between gap-2">
          <div
            className={`text-xs leading-snug ${
              boldRow ? 'font-black text-slate-950' : 'font-medium text-slate-900'
            }`}
          >
            <span>{label}</span>
            {signBadge && (
              <span
                className={`ml-1.5 inline-block px-1.5 py-0 rounded text-[10px] font-mono font-bold ${
                  signBadge === '-'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : signBadge === '+'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                {signBadge}
              </span>
            )}
          </div>
          {onAddExtra && (
            <button
              type="button"
              onClick={onAddExtra}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-white text-orange-700 hover:bg-orange-50 border border-orange-200 cursor-pointer shrink-0"
            >
              <Plus className="w-3 h-3" />
              <span>{addExtraLabel || 'Add Row'}</span>
            </button>
          )}
        </div>
      </td>

      {cols.map((col) => {
        const val = quintet[col];
        const isTotal = col === 'total';
        const hasRightDivider = col === 'swiggyCancelled' || col === 'toingCancelled';
        return (
          <td
            key={col}
            className={`px-1.5 py-1 text-right align-middle ${
              hasRightDivider ? 'border-r border-slate-200/90' : ''
            }`}
          >
            <input
              type="number"
              step={isInteger ? '1' : '0.01'}
              value={val}
              onChange={(e) => onChangeCol(col, e.target.value)}
              className={`w-20 sm:w-24 rounded-md px-1.5 py-1 text-right font-mono text-xs focus:outline-hidden ${
                isTotal
                  ? 'bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200/90 focus:border-orange-500 font-bold text-slate-950'
                  : 'bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent hover:border-slate-300 focus:border-orange-500 text-slate-800'
              } ${boldRow ? 'font-bold' : ''} ${val < 0 ? 'text-rose-700' : ''}`}
            />
          </td>
        );
      })}
    </tr>
  );
};

export const PayoutReviewModal: React.FC<PayoutReviewModalProps> = ({
  isOpen,
  mode,
  initialRecords,
  mappings,
  isSaving,
  saveError,
  onCancel,
  onConfirm,
}) => {
  const [drafts, setDrafts] = useState<PlatformPayoutRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saveMappingToggle, setSaveMappingToggle] = useState<Record<number, boolean>>({});
  const [showRawBreakupRows, setShowRawBreakupRows] = useState(false);

  useEffect(() => {
    if (isOpen && initialRecords.length > 0) {
      const normalized = initialRecords.map(normalizeIncomingRecord);
      setDrafts(normalized);
      setActiveIndex(0);
      setShowRawBreakupRows(false);

      const toggles: Record<number, boolean> = {};
      normalized.forEach((r, idx) => {
        if (r.accountId) {
          const matched = detectAggregatorMappingFromText(r.accountId, mappings, r.platform);
          toggles[idx] = !matched;
        } else {
          toggles[idx] = false;
        }
      });
      setSaveMappingToggle(toggles);
    }
  }, [isOpen, initialRecords, mappings]);

  if (!isOpen || drafts.length === 0) return null;

  const current = drafts[activeIndex] || drafts[0];
  const isZomato = current.platform === 'zomato';
  const isSwiggy = current.platform === 'swiggy';
  const isOwnly = current.platform === 'ownly';
  const zb: ZomatoPayoutBreakupModel | null = isZomato
    ? current.zomatoBreakup || ensureZomatoBreakupModelOnRecord(current)
    : null;
  const sb: SwiggyPayoutBreakupModel | null = isSwiggy
    ? current.swiggyBreakup || ensureSwiggyBreakupModelOnRecord(current)
    : null;
  const ob: OwnlyPayoutBreakupModel | null = isOwnly
    ? current.ownlyBreakup || ensureOwnlyBreakupModelOnRecord(current)
    : null;

  const matchedMapping = current.accountId
    ? detectAggregatorMappingFromText(current.accountId, mappings, current.platform)
    : null;

  const updateCurrent = (
    updater: (prev: PlatformPayoutRecord) => PlatformPayoutRecord,
    syncActual = false
  ) => {
    setDrafts((prev) =>
      prev.map((item, idx) =>
        idx === activeIndex ? recalculatePayoutRecord(updater(item), syncActual) : item
      )
    );
  };

  const updateZomatoBreakup = (
    updater: (prevModel: ZomatoPayoutBreakupModel) => ZomatoPayoutBreakupModel,
    syncReported = false
  ) => {
    setDrafts((prev) =>
      prev.map((item, idx) => {
        if (idx !== activeIndex) return item;
        const baseModel = item.zomatoBreakup || ensureZomatoBreakupModelOnRecord(item);
        const nextModel = updater(baseModel);
        const applied = applyZomatoBreakupToPayoutRecord(item, nextModel, syncReported);
        return recalculatePayoutRecord(applied, syncReported);
      })
    );
  };

  const updateSwiggyBreakup = (
    updater: (prevModel: SwiggyPayoutBreakupModel) => SwiggyPayoutBreakupModel,
    syncReported = false
  ) => {
    setDrafts((prev) =>
      prev.map((item, idx) => {
        if (idx !== activeIndex) return item;
        const baseModel = item.swiggyBreakup || ensureSwiggyBreakupModelOnRecord(item);
        const nextModel = updater(baseModel);
        const applied = applySwiggyBreakupToPayoutRecord(item, nextModel, syncReported);
        return recalculatePayoutRecord(applied, syncReported);
      })
    );
  };

  const updateOwnlyBreakup = (
    updater: (prevModel: OwnlyPayoutBreakupModel) => OwnlyPayoutBreakupModel,
    syncReported = false
  ) => {
    setDrafts((prev) =>
      prev.map((item, idx) => {
        if (idx !== activeIndex) return item;
        const baseModel = item.ownlyBreakup || ensureOwnlyBreakupModelOnRecord(item);
        const nextModel = updater(baseModel);
        const applied = applyOwnlyBreakupToPayoutRecord(item, nextModel, syncReported);
        return recalculatePayoutRecord(applied, syncReported);
      })
    );
  };

  const handleOwnlyRowChange = (
    rowId: string,
    field: keyof OwnlyPayoutSettlementRow,
    rawVal: string
  ) => {
    updateOwnlyBreakup((prevModel) => ({
      ...prevModel,
      hasExplicitReportedNetPayout: false,
      settlementPeriodLabel:
        field === 'payoutPeriod' ? undefined : prevModel.settlementPeriodLabel,
      rows: (prevModel.rows || []).map((r) =>
        r.id === rowId ? updateOwnlySettlementRow(r, field, rawVal) : r
      ),
    }));
  };

  const handleAddOwnlyRow = () => {
    updateOwnlyBreakup((prevModel) => {
      const lastRow = prevModel.rows[prevModel.rows.length - 1];
      const newRow = createEmptyOwnlyRow({
        restaurantId:
          lastRow?.restaurantId ||
          prevModel.resId ||
          current.accountId ||
          (current.outletId === 'whitefield' ? 'RN421125' : 'RN421127'),
        restaurantName:
          lastRow?.restaurantName ||
          prevModel.rawRestaurantName ||
          (current.outletId === 'whitefield'
            ? `${current.accountName || 'Banglar Jhale Jhole'} -W`
            : current.accountName || 'Banglar Jhale Jhole'),
        accountingMonth: current.month,
      });
      return {
        ...prevModel,
        hasExplicitReportedNetPayout: false,
        settlementPeriodLabel: undefined,
        rows: [...(prevModel.rows || []), newRow],
      };
    });
  };

  const handleRemoveOwnlyRow = (rowId: string) => {
    updateOwnlyBreakup((prevModel) => {
      if ((prevModel.rows || []).length <= 1) return prevModel;
      return {
        ...prevModel,
        hasExplicitReportedNetPayout: false,
        settlementPeriodLabel: undefined,
        rows: prevModel.rows.filter((r) => r.id !== rowId),
      };
    });
  };

  const handleOwnlyReportedPayoutChange = (rawVal: string) => {
    const parsed = rawVal === '' || rawVal === '-' ? 0 : parseFloat(rawVal);
    const num = Number.isFinite(parsed) ? parsed : 0;
    updateOwnlyBreakup((prevModel) => ({
      ...prevModel,
      hasExplicitReportedNetPayout: true,
      reportedNetPayout: num,
    }));
  };

  const handleRemoveStatementDraft = (removeIdx: number) => {
    if (drafts.length <= 1) return;
    setDrafts((prev) => prev.filter((_, idx) => idx !== removeIdx));
    setSaveMappingToggle((prev) => {
      const next: Record<number, boolean> = {};
      let cursor = 0;
      Object.keys(prev)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((k) => {
          if (k !== removeIdx) {
            next[cursor] = prev[k];
            cursor++;
          }
        });
      return next;
    });
    setActiveIndex((prevIdx) => {
      if (prevIdx > removeIdx) return prevIdx - 1;
      if (prevIdx === removeIdx) return Math.max(0, prevIdx - 1);
      return prevIdx;
    });
  };

  const handleSwiggyQuintetChange = (
    field: SwiggyQuintetFieldKey,
    col: keyof SwiggyQuintet,
    rawVal: string,
    mode: 'pos' | 'neg' | 'signed' | 'int' = 'signed'
  ) => {
    const parsed = rawVal === '' || rawVal === '-' ? 0 : parseFloat(rawVal);
    const num = Number.isFinite(parsed) ? parsed : 0;
    updateSwiggyBreakup((prevModel) => ({
      ...prevModel,
      [field]: updateQuintetColumn(prevModel[field], col, num, mode),
    }));
  };

  const handleSwiggyReportedPayoutChange = (rawVal: string) => {
    const parsed = rawVal === '' || rawVal === '-' ? 0 : parseFloat(rawVal);
    const num = Number.isFinite(parsed) ? parsed : 0;
    updateSwiggyBreakup((prevModel) => ({
      ...prevModel,
      hasExplicitReportedNetPayout: true,
      reportedNetPayout: num,
    }));
  };

  const handleAddExtraSwiggyLine = (
    target: 'extraSwiggyFees' | 'extraOtherChargesAndRefunds'
  ) => {
    const newItem: SwiggyExtraLineItem = {
      id: `swiggy-${target}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label:
        target === 'extraSwiggyFees'
          ? 'Additional Swiggy Fee'
          : 'Additional Charge / Refund',
      values: zeroQuintet(),
    };
    updateSwiggyBreakup((prevModel) => ({
      ...prevModel,
      [target]: [...(prevModel[target] || []), newItem],
    }));
  };

  const handleUpdateExtraSwiggyLine = (
    target: 'extraSwiggyFees' | 'extraOtherChargesAndRefunds',
    itemId: string,
    patch: { label?: string; col?: keyof SwiggyQuintet; rawVal?: string }
  ) => {
    const mode = target === 'extraSwiggyFees' ? 'neg' : 'signed';
    updateSwiggyBreakup((prevModel) => ({
      ...prevModel,
      [target]: (prevModel[target] || []).map((it) => {
        if (it.id !== itemId) return it;
        if (patch.label !== undefined) {
          return { ...it, label: patch.label };
        }
        if (patch.col && patch.rawVal !== undefined) {
          const parsed =
            patch.rawVal === '' || patch.rawVal === '-' ? 0 : parseFloat(patch.rawVal);
          const num = Number.isFinite(parsed) ? parsed : 0;
          return {
            ...it,
            values: updateQuintetColumn(it.values, patch.col, num, mode),
          };
        }
        return it;
      }),
    }));
  };

  const handleRemoveExtraSwiggyLine = (
    target: 'extraSwiggyFees' | 'extraOtherChargesAndRefunds',
    itemId: string
  ) => {
    updateSwiggyBreakup((prevModel) => ({
      ...prevModel,
      [target]: (prevModel[target] || []).filter((it) => it.id !== itemId),
    }));
  };

  const handleZomatoTripletChange = (
    field: ZomatoTripletFieldKey,
    col: 'delivered' | 'cancelled' | 'total',
    rawVal: string,
    isInteger = false
  ) => {
    const parsed = rawVal === '' || rawVal === '-' ? 0 : parseFloat(rawVal);
    const num = Number.isFinite(parsed) ? parsed : 0;
    updateZomatoBreakup((prevModel) => ({
      ...prevModel,
      [field]: updateTripletColumn(prevModel[field], col, num, isInteger),
    }));
  };

  const handleZomatoReportedPayoutChange = (rawVal: string) => {
    const parsed = rawVal === '' || rawVal === '-' ? 0 : parseFloat(rawVal);
    const num = Number.isFinite(parsed) ? parsed : 0;
    updateZomatoBreakup((prevModel) => ({
      ...prevModel,
      hasExplicitReportedJ: true,
      reportedNetPayout: num,
    }));
  };

  const handleAddExtraZomatoLine = (target: 'extraOtherDeductions' | 'extraAdditions') => {
    const newItem: ZomatoExtraLineItem = {
      id: `zomato-${target}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: target === 'extraAdditions' ? 'Additional Credit / Rebate' : 'Additional Deduction',
      values: zeroTriplet(),
    };
    updateZomatoBreakup((prevModel) => ({
      ...prevModel,
      [target]: [...(prevModel[target] || []), newItem],
    }));
  };

  const handleUpdateExtraZomatoLine = (
    target: 'extraOtherDeductions' | 'extraAdditions',
    itemId: string,
    patch: { label?: string; col?: 'delivered' | 'cancelled' | 'total'; rawVal?: string }
  ) => {
    updateZomatoBreakup((prevModel) => ({
      ...prevModel,
      [target]: (prevModel[target] || []).map((it) => {
        if (it.id !== itemId) return it;
        if (patch.label !== undefined) {
          return { ...it, label: patch.label };
        }
        if (patch.col && patch.rawVal !== undefined) {
          const parsed = patch.rawVal === '' || patch.rawVal === '-' ? 0 : parseFloat(patch.rawVal);
          const num = Number.isFinite(parsed) ? parsed : 0;
          return {
            ...it,
            values: updateTripletColumn(it.values, patch.col, num),
          };
        }
        return it;
      }),
    }));
  };

  const handleRemoveExtraZomatoLine = (
    target: 'extraOtherDeductions' | 'extraAdditions',
    itemId: string
  ) => {
    updateZomatoBreakup((prevModel) => ({
      ...prevModel,
      [target]: (prevModel[target] || []).filter((it) => it.id !== itemId),
    }));
  };

  const handleNumberChange = (
    field: keyof PlatformPayoutRecord,
    rawVal: string,
    syncActual = false
  ) => {
    const parsed = rawVal === '' ? 0 : parseFloat(rawVal);
    const num = Number.isFinite(parsed) ? parsed : 0;
    updateCurrent((prev) => ({ ...prev, [field]: num }), syncActual);
  };

  const handlePlatformChange = (newPlatform: 'swiggy' | 'zomato' | 'ownly') => {
    const m = current.accountId
      ? detectAggregatorMappingFromText(current.accountId, mappings, newPlatform)
      : null;

    updateCurrent((prev) => {
      const updatedBase: PlatformPayoutRecord = {
        ...prev,
        platform: newPlatform,
        accountName: m ? m.brandName : prev.accountName,
        outletId: m ? m.outletId : prev.outletId,
      };
      if (newPlatform === 'zomato') {
        const zModel = ensureZomatoBreakupModelOnRecord(updatedBase);
        zModel.resId = updatedBase.accountId;
        zModel.brandName = updatedBase.accountName;
        zModel.outletLocation = updatedBase.outletId;
        zModel.settlementPeriodLabel = updatedBase.weekLabel;
        return applyZomatoBreakupToPayoutRecord(updatedBase, zModel);
      }
      if (newPlatform === 'swiggy') {
        const sModel = ensureSwiggyBreakupModelOnRecord(updatedBase);
        sModel.resId = updatedBase.accountId;
        sModel.brandName = updatedBase.accountName;
        sModel.outletLocation = updatedBase.outletId;
        sModel.settlementPeriodLabel = updatedBase.weekLabel;
        return applySwiggyBreakupToPayoutRecord(updatedBase, sModel);
      }
      if (newPlatform === 'ownly') {
        const oModel = ensureOwnlyBreakupModelOnRecord(updatedBase);
        oModel.resId = updatedBase.accountId;
        oModel.brandName = updatedBase.accountName;
        oModel.outletLocation = updatedBase.outletId;
        oModel.accountingMonth = updatedBase.month;
        oModel.settlementPeriodLabel = updatedBase.weekLabel;
        return applyOwnlyBreakupToPayoutRecord(updatedBase, oModel);
      }
      return updatedBase;
    });
  };

  const handleRestaurantIdChange = (newResId: string) => {
    const trimmed = newResId.trim();
    const found = detectAggregatorMappingFromText(trimmed, mappings);
    updateCurrent((prev) => {
      const nextPlat = found ? found.platform : prev.platform;
      const nextBrand = found ? found.brandName : prev.accountName;
      const nextOutlet = found ? found.outletId : prev.outletId;
      const nextRec: PlatformPayoutRecord = {
        ...prev,
        accountId: trimmed || undefined,
        platform: nextPlat,
        accountName: nextBrand,
        outletId: nextOutlet,
      };
      if (nextPlat === 'zomato') {
        const zModel = ensureZomatoBreakupModelOnRecord(nextRec);
        zModel.resId = trimmed || undefined;
        zModel.brandName = nextBrand;
        zModel.outletLocation = nextOutlet;
        return applyZomatoBreakupToPayoutRecord(nextRec, zModel);
      }
      if (nextPlat === 'swiggy') {
        const sModel = ensureSwiggyBreakupModelOnRecord(nextRec);
        sModel.resId = trimmed || undefined;
        sModel.brandName = nextBrand;
        sModel.outletLocation = nextOutlet;
        return applySwiggyBreakupToPayoutRecord(nextRec, sModel);
      }
      if (nextPlat === 'ownly') {
        const oModel = ensureOwnlyBreakupModelOnRecord(nextRec);
        oModel.resId = trimmed || undefined;
        oModel.brandName = nextBrand;
        oModel.outletLocation = nextOutlet;
        oModel.rows = (oModel.rows || []).map((r) => ({
          ...r,
          restaurantId: trimmed || r.restaurantId,
        }));
        return applyOwnlyBreakupToPayoutRecord(nextRec, oModel);
      }
      return nextRec;
    });
  };

  const handleAddOtherCharge = () => {
    const newItem: PayoutOtherChargeItem = {
      id: `other-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: 'Additional Platform Charge',
      amount: 0,
    };
    updateCurrent((prev) => ({
      ...prev,
      otherChargesBreakdown: [...(prev.otherChargesBreakdown || []), newItem],
    }));
  };

  const handleUpdateOtherCharge = (
    chargeId: string,
    patch: Partial<PayoutOtherChargeItem>
  ) => {
    updateCurrent((prev) => ({
      ...prev,
      otherChargesBreakdown: (prev.otherChargesBreakdown || []).map((c) =>
        c.id === chargeId ? { ...c, ...patch } : c
      ),
    }));
  };

  const handleRemoveOtherCharge = (chargeId: string) => {
    updateCurrent((prev) => {
      const filtered = (prev.otherChargesBreakdown || []).filter((c) => c.id !== chargeId);
      return {
        ...prev,
        otherChargesBreakdown: filtered,
        otherPlatformFees: filtered.reduce((s, item) => s + (Number(item.amount) || 0), 0),
      };
    });
  };

  const handleConfirmAll = () => {
    const mappingsToUpsert: AggregatorBrandOutletMapping[] = [];
    drafts.forEach((d, idx) => {
      if (d.accountId && saveMappingToggle[idx]) {
        mappingsToUpsert.push({
          id: `map-${d.platform}-${d.accountId.trim()}`,
          platform: d.platform,
          restaurantId: d.accountId.trim(),
          brandName: (d.accountName || 'Banglar Jhale Jhole').trim(),
          outletId: d.outletId,
          isDefault: false,
          notes: `${d.platform.toUpperCase()} · ${d.accountName || ''} · ${d.outletId}`,
        });
      }
    });
    onConfirm(drafts, mappingsToUpsert);
  };

  const totalDeductionsAndOffsets =
    (current.commissionAmount || 0) +
    (current.cancellationCharges || 0) +
    (current.paymentGatewayFee || 0) +
    (current.advertisingSpend || 0) +
    (current.otherPlatformFees || 0) +
    (current.gstOnCommission || 0) +
    (current.tcsDeduction || 0) +
    (current.tdsDeduction || 0) +
    (current.hyperpureRecovery || 0) +
    (current.swiggyAssureFee || 0);

  const zomatoTotalDeductionsNetOfAdditions = zb
    ? zb.sectionC_serviceAndPaymentFees.total +
      zb.sectionD_governmentCharges.total +
      zb.sectionE_otherOrderLevelDeductions.total +
      zb.sectionF_investmentInGrowthServices.total +
      zb.sectionG_investmentInHyperpure.total +
      zb.sectionH_otherDeductions.total -
      zb.sectionI_totalAdditions.total
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight">
                  {isZomato
                    ? mode === 'create'
                      ? 'Zomato "Payout Breakup" Sheet — Review & Confirm'
                      : 'Zomato "Payout Breakup" Sheet — Edit Statement'
                    : isSwiggy
                    ? mode === 'create'
                      ? 'Swiggy (+ Toing Combined) "Payout Breakup" — Review & Confirm'
                      : 'Swiggy (+ Toing Combined) "Payout Breakup" — Edit Statement'
                    : isOwnly
                    ? mode === 'create'
                      ? 'Ownly Payout Settlement Ledger — Review & Confirm'
                      : 'Ownly Payout Settlement Ledger — Edit Statement'
                    : mode === 'create'
                    ? 'Review & Edit Aggregator Payout Segregation'
                    : 'Edit Saved Payout Statement Segregation'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  {current.periodType === 'weekly' ? 'Weekly Payout' : 'Monthly Payout'}
                </span>
                {isZomato && zb && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/30 text-rose-200 border border-rose-400/40">
                    Sheet: &ldquo;{zb.sheetNameUsed || 'Payout Breakup'}&rdquo; Only (A → J · Rows 1–32)
                  </span>
                )}
                {isSwiggy && sb && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/30 text-amber-200 border border-amber-400/40">
                    Swiggy + Toing Combined → Reported as Swiggy ({sb.sheetNameUsed || 'Payout Breakup'})
                  </span>
                )}
                {isOwnly && ob && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/30 text-emerald-200 border border-emerald-400/40">
                    Ownly 12-Column Template · {ob.resId || current.accountId || 'Ownly'} ({ob.rows.length}{' '}
                    {ob.rows.length === 1 ? 'settlement' : 'settlements'})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                File:{' '}
                <span className="font-mono text-emerald-300">
                  {current.sourceFileName || 'Manual Statement'}
                </span>{' '}
                — Verify extracted figures or edit any cell before persisting to Supabase.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-statement Tabs */}
        {drafts.length > 1 && (
          <div className="bg-slate-100 px-6 py-2.5 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
              Segregated Statements ({drafts.length}):
            </span>
            {drafts.map((d, idx) => (
              <div
                key={d.id}
                className={`rounded-xl text-xs font-bold flex items-center transition-all shrink-0 ${
                  idx === activeIndex
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className="px-3 py-1.5 flex items-center gap-2 cursor-pointer"
                >
                  <span>
                    #{idx + 1} {d.accountName || d.platform.toUpperCase()}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      idx === activeIndex ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {d.month}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] capitalize ${
                      idx === activeIndex ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {d.outletId} · {d.orderCount} ord
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveStatementDraft(idx)}
                  className={`pr-2.5 pl-1 py-1.5 cursor-pointer ${
                    idx === activeIndex
                      ? 'text-indigo-200 hover:text-white'
                      : 'text-slate-400 hover:text-rose-600'
                  }`}
                  title="Exclude this statement from upload"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {saveError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-rose-900">Cannot Persist Statement</div>
                <div className="mt-0.5">{saveError}</div>
              </div>
            </div>
          )}

          {/* Section 1: Aggregator, Restaurant ID & Outlet Segregation */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/90 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  1. Aggregator, Restaurant ID &amp; Outlet Mapping
                </h3>
              </div>
              {matchedMapping ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Auto-Mapped ID {matchedMapping.restaurantId} → {matchedMapping.brandName} (
                  {matchedMapping.outletId === 'whitefield' ? 'Whitefield' : 'Banaswadi'})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  Verify Outlet Location (Banaswadi / Whitefield)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Aggregator
                </label>
                <select
                  value={current.platform}
                  onChange={(e) =>
                    handlePlatformChange(e.target.value as 'swiggy' | 'zomato' | 'ownly')
                  }
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="swiggy">Swiggy</option>
                  <option value="zomato">Zomato</option>
                  <option value="ownly">Ownly</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Restaurant ID
                </label>
                <input
                  type="text"
                  value={current.accountId || ''}
                  onChange={(e) => handleRestaurantIdChange(e.target.value)}
                  placeholder="e.g. 20794526 / 762173 / RN421127"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Brand / Restaurant Name
                </label>
                <input
                  type="text"
                  list="payout-brand-suggestions"
                  value={current.accountName || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isZomato) {
                      updateZomatoBreakup((m) => ({ ...m, brandName: val }));
                    } else if (isSwiggy) {
                      updateSwiggyBreakup((m) => ({ ...m, brandName: val }));
                    } else if (isOwnly) {
                      updateOwnlyBreakup((m) => ({ ...m, brandName: val }));
                    } else {
                      updateCurrent((prev) => ({ ...prev, accountName: val }));
                    }
                  }}
                  placeholder="Banglar Jhale Jhole / Niraamish"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="payout-brand-suggestions">
                  <option value="Banglar Jhale Jhole" />
                  <option value="Niraamish" />
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Outlet Location
                </label>
                <select
                  value={current.outletId}
                  onChange={(e) => {
                    const out = e.target.value as 'banaswadi' | 'whitefield';
                    if (isZomato) {
                      updateZomatoBreakup((m) => ({ ...m, outletLocation: out }));
                    } else if (isSwiggy) {
                      updateSwiggyBreakup((m) => ({ ...m, outletLocation: out }));
                    } else if (isOwnly) {
                      updateOwnlyBreakup((m) => ({ ...m, outletLocation: out }));
                    } else {
                      updateCurrent((prev) => ({ ...prev, outletId: out }));
                    }
                  }}
                  className={`w-full border rounded-xl px-3 py-2 font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${
                    current.outletId === 'whitefield'
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                      : 'bg-teal-50 border-teal-300 text-teal-900'
                  }`}
                >
                  <option value="banaswadi">Banaswadi Outlet</option>
                  <option value="whitefield">Whitefield Outlet</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Accounting Month
                </label>
                <input
                  type="month"
                  value={current.month}
                  onChange={(e) => {
                    const nextMonth = e.target.value;
                    if (isOwnly) {
                      updateOwnlyBreakup((m) => ({ ...m, accountingMonth: nextMonth }));
                    } else {
                      updateCurrent((prev) => ({ ...prev, month: nextMonth }));
                    }
                  }}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs items-center">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Payout Frequency
                </label>
                <div className="flex bg-white p-1 rounded-xl border border-slate-300">
                  <button
                    type="button"
                    onClick={() =>
                      updateCurrent((prev) => ({ ...prev, periodType: 'monthly' }))
                    }
                    className={`flex-1 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                      current.periodType !== 'weekly'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateCurrent((prev) => ({ ...prev, periodType: 'weekly' }))
                    }
                    className={`flex-1 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                      current.periodType === 'weekly'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Weekly
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Settlement Period / Week Label
                </label>
                <input
                  type="text"
                  value={current.weekLabel || ''}
                  onChange={(e) => {
                    const val = e.target.value || undefined;
                    if (isZomato) {
                      updateZomatoBreakup((m) => ({ ...m, settlementPeriodLabel: val }));
                    } else if (isSwiggy) {
                      updateSwiggyBreakup((m) => ({ ...m, settlementPeriodLabel: val }));
                    } else if (isOwnly) {
                      updateOwnlyBreakup((m) => ({ ...m, settlementPeriodLabel: val }));
                    } else {
                      updateCurrent((prev) => ({ ...prev, weekLabel: val }));
                    }
                  }}
                  placeholder="e.g. 1 October -> 31 October"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {current.accountId && (
                <label className="flex items-center gap-2 pt-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(saveMappingToggle[activeIndex])}
                    onChange={(e) =>
                      setSaveMappingToggle((prev) => ({
                        ...prev,
                        [activeIndex]: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded accent-indigo-600"
                  />
                  <span className="text-[11px] font-semibold text-slate-700">
                    Save ID <span className="font-mono font-bold">{current.accountId}</span> to Mapping Table
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* ========================================================================
              EXACT ZOMATO "PAYOUT BREAKUP" SHEET MODEL (SECTIONS A -> J, ROWS 1 -> 32 + SETTLEMENT BREAKDOWN)
              ======================================================================== */}
          {isZomato && zb ? (
            <div className="space-y-4">
              {/* Zomato Sheet Banner */}
              <div className="bg-gradient-to-r from-rose-50 via-white to-sky-50 rounded-2xl p-3.5 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                    Z
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                        Zomato &ldquo;Payout Breakup&rdquo; Sheet Model (A → J)
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        Tab Evaluated: {zb.sheetNameUsed || 'Payout Breakup'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Exact section &amp; line-item structure (`1–32` + `Settlement breakdown`). Edit any Delivered, Cancelled/Rejected, or Total cell to recalculate `A → J` live.
                    </p>
                  </div>
                </div>
                <div className="text-right text-[11px] font-mono text-slate-600 shrink-0">
                  <div>
                    Net Order Value (A):{' '}
                    <strong className="text-emerald-700">
                      {formatZomatoSheetINR(zb.sectionA_netOrderValue.total)}
                    </strong>
                  </div>
                  <div>
                    Net Payout (J):{' '}
                    <strong className="text-emerald-700">
                      {formatZomatoSheetINR(zb.sectionJ_netPayout.total)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Exact Zomato "Payout Breakup" Accounting Sheet Table */}
              <div className="rounded-2xl border border-slate-300 overflow-hidden shadow-xs bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left min-w-[720px]">
                    <thead>
                      <tr className="bg-sky-100/90 border-b-2 border-slate-300 text-slate-950">
                        <th className="w-12 px-2.5 py-3 text-xs font-black align-bottom">
                          S.no.
                        </th>
                        <th className="px-3 py-3 text-xs sm:text-sm font-black align-bottom">
                          Particular
                        </th>
                        <th className="w-36 px-2.5 py-3 text-right text-xs sm:text-sm font-black align-bottom leading-tight">
                          Delivered
                          <br />
                          Orders
                        </th>
                        <th className="w-36 px-2.5 py-3 text-right text-xs sm:text-sm font-black align-bottom leading-tight">
                          Cancelled/
                          <br />
                          Rejected
                          <br />
                          Orders
                        </th>
                        <th className="w-36 px-2.5 py-3 text-right text-xs sm:text-sm font-black align-bottom">
                          Total
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {/* Top Row: Number of orders */}
                      <tr className="bg-white border-b-2 border-slate-200">
                        <td className="px-2.5 py-2 text-xs font-mono text-slate-500" />
                        <td className="px-3 py-2 text-xs font-black text-slate-950">
                          Number of orders
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={zb.ordersCount.delivered}
                            onChange={(e) =>
                              handleZomatoTripletChange(
                                'ordersCount',
                                'delivered',
                                e.target.value,
                                true
                              )
                            }
                            className="w-20 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-md px-2 py-1 text-right font-mono text-xs font-black text-slate-950 focus:outline-hidden"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={zb.ordersCount.cancelled}
                            onChange={(e) =>
                              handleZomatoTripletChange(
                                'ordersCount',
                                'cancelled',
                                e.target.value,
                                true
                              )
                            }
                            className="w-20 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-md px-2 py-1 text-right font-mono text-xs font-black text-slate-950 focus:outline-hidden"
                          />
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono text-xs font-black text-slate-950">
                          {zb.ordersCount.total}
                        </td>
                      </tr>

                      {/* ==================== SECTION A ==================== */}
                      <ZomatoSectionHeaderRow
                        code="A"
                        title="Net order value"
                        formula="( 1 + 2 + 3 - 4 - 5 + 6 - 7 + 8 )"
                        triplet={zb.sectionA_netOrderValue}
                        reported={zb.reportedSectionA}
                        tone="green"
                      />
                      <ZomatoTripletEditRow
                        sNo="1"
                        label="Subtotal (items total)"
                        signHint="+"
                        triplet={zb.row1_subtotal}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row1_subtotal', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="2"
                        label="Packaging charge"
                        signHint="+"
                        triplet={zb.row2_packagingCharge}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row2_packagingCharge', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="3"
                        label="Delivery charge for restaurants on self logistics"
                        signHint="+"
                        triplet={zb.row3_selfLogisticsDeliveryCharge}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row3_selfLogisticsDeliveryCharge', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="4"
                        label="Restaurant discount (Promo)"
                        signHint="-"
                        triplet={zb.row4_promoDiscount}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row4_promoDiscount', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="5"
                        label="Restaurant discount (BOGO, Freebies, Gold, Brand pack & others)"
                        signHint="-"
                        triplet={zb.row5_bogoFreebiesGoldDiscount}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row5_bogoFreebiesGoldDiscount', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="6"
                        label="Brand pack subscription fee"
                        signHint="+"
                        triplet={zb.row6_brandPackSubscriptionFee}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row6_brandPackSubscriptionFee', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="7"
                        label="Delivery charge discount/ Relisting discount"
                        signHint="-"
                        triplet={zb.row7_deliveryRelistingDiscount}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row7_deliveryRelistingDiscount', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="8"
                        label="Total GST collected from customers"
                        signHint="+"
                        triplet={zb.row8_customerGstCollected}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row8_customerGstCollected', col, v)
                        }
                      />

                      {/* ==================== SECTION B ==================== */}
                      <ZomatoSectionHeaderRow
                        code="B"
                        title="Total commissionable value"
                        formula="( 9 + 10 + 11 )"
                        triplet={zb.sectionB_totalCommissionableValue}
                        reported={zb.reportedSectionB}
                        tone="neutral"
                      />
                      <ZomatoTripletEditRow
                        sNo="9"
                        label="Commissionable value of Subtotal, excluding restaurant discounts ( 1 - 4 - 5 )"
                        triplet={zb.row9_commissionableSubtotal}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row9_commissionableSubtotal', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="10"
                        label="Commissionable value of Packaging charge"
                        triplet={zb.row10_commissionablePackaging}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row10_commissionablePackaging', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="11"
                        label="Commissionable value of Total GST collected from customers"
                        triplet={zb.row11_commissionableGst}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row11_commissionableGst', col, v)
                        }
                      />

                      {/* ==================== SECTION C ==================== */}
                      <ZomatoSectionHeaderRow
                        code="C"
                        title="Service fees & payment mechanism fees"
                        formula="( 12 + 13 - 14 - 15 + 16 )"
                        triplet={zb.sectionC_serviceAndPaymentFees}
                        reported={zb.reportedSectionC}
                        tone="red"
                      />
                      <ZomatoTripletEditRow
                        sNo="12"
                        label="Base service fee"
                        signHint="+"
                        triplet={zb.row12_baseServiceFee}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row12_baseServiceFee', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="13"
                        label="Long distance enablement fee"
                        signHint="+"
                        triplet={zb.row13_longDistanceFee}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row13_longDistanceFee', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="14"
                        label="Discount on long distance enablement fee"
                        signHint="-"
                        triplet={zb.row14_longDistanceDiscount}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row14_longDistanceDiscount', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="15"
                        label="Discount on service fee due to 30% capping"
                        subLabel="(Service fees capped at 30% of commissionable value)"
                        signHint="-"
                        triplet={zb.row15_serviceFeeCapDiscount}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row15_serviceFeeCapDiscount', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="16"
                        label="Payment mechanism fee"
                        signHint="+"
                        triplet={zb.row16_paymentMechanismFee}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row16_paymentMechanismFee', col, v)
                        }
                      />

                      {/* ==================== SECTION D ==================== */}
                      <ZomatoSectionHeaderRow
                        code="D"
                        title="Government charges"
                        formula="( 17 + 18 + 19 + 20 )"
                        triplet={zb.sectionD_governmentCharges}
                        reported={zb.reportedSectionD}
                        tone="red"
                      />
                      <ZomatoTripletEditRow
                        sNo="17"
                        label="Taxes on service fee & payment mechanism fee"
                        triplet={zb.row17_taxesOnServiceFee}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row17_taxesOnServiceFee', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="18"
                        label="Tax collected at source + TCS IGST amount"
                        triplet={zb.row18_tcsAndIgst}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row18_tcsAndIgst', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="19"
                        label="TDS 194O amount"
                        triplet={zb.row19_tds194O}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row19_tds194O', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="20"
                        label="GST paid by Zomato on behalf of restaurant - under section 9(5)"
                        triplet={zb.row20_gstSection9_5}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row20_gstSection9_5', col, v)
                        }
                      />

                      {/* ==================== SECTION E ==================== */}
                      <ZomatoSectionHeaderRow
                        code="E"
                        title="Other order level deductions"
                        formula="( 21 + 22 + 23 )"
                        triplet={zb.sectionE_otherOrderLevelDeductions}
                        reported={zb.reportedSectionE}
                        tone="red"
                      />
                      <ZomatoTripletEditRow
                        sNo="21"
                        label="Other Order level deductions"
                        subLabel="Auto-summed from the 8 order-level sub-items below"
                        readOnly
                        triplet={zb.row21_otherOrderLevelDeductions}
                      />
                      <ZomatoTripletEditRow
                        indented
                        label="Customer compensation/ recoupment"
                        triplet={zb.row21a_customerCompensation}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row21a_customerCompensation', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        indented
                        label="Rejection penalty"
                        triplet={zb.row21b_rejectionPenalty}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row21b_rejectionPenalty', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        indented
                        label="Delivery charges recovery"
                        triplet={zb.row21c_deliveryChargesRecovery}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row21c_deliveryChargesRecovery', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        indented
                        label="Credit note/ (Debit note) adjustment"
                        triplet={zb.row21d_creditDebitNoteAdjustment}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row21d_creditDebitNoteAdjustment', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        indented
                        label="Promo recovery adjustment"
                        triplet={zb.row21e_promoRecoveryAdjustment}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row21e_promoRecoveryAdjustment', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        indented
                        label="Extra inventory ads (order level deduction)"
                        triplet={zb.row21f_extraInventoryAds}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row21f_extraInventoryAds', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        indented
                        label="Brand loyalty points redemption"
                        triplet={zb.row21g_brandLoyaltyPointsRedemption}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange(
                            'row21g_brandLoyaltyPointsRedemption',
                            col,
                            v
                          )
                        }
                      />
                      <ZomatoTripletEditRow
                        indented
                        label="Express order fee"
                        triplet={zb.row21h_expressOrderFee}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row21h_expressOrderFee', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="22"
                        label="Amount received in cash (on self delivery orders)"
                        triplet={zb.row22_cashReceivedSelfDelivery}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row22_cashReceivedSelfDelivery', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="23"
                        label="Adjustments from previous weeks"
                        subLabel='(Refer to Annexure : "Addition/ Deduction Details")'
                        triplet={zb.row23_previousWeeksAdjustments}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row23_previousWeeksAdjustments', col, v)
                        }
                      />

                      {/* ==================== SECTION F ==================== */}
                      <ZomatoSectionHeaderRow
                        code="F"
                        title="Investment in growth services"
                        formula="( 24 + 25 + 26 )"
                        triplet={zb.sectionF_investmentInGrowthServices}
                        reported={zb.reportedSectionF}
                        tone="red"
                      />
                      <ZomatoTripletEditRow
                        sNo="24"
                        label="Total Ads (inc. 18% GST)"
                        subLabel='(Refer to Annexure : "Addition/ Deduction Details")'
                        triplet={zb.row24_totalAdsIncGst}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row24_totalAdsIncGst', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="25"
                        label="Total Dining Ads (inc. 18% GST)"
                        triplet={zb.row25_totalDiningAdsIncGst}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row25_totalDiningAdsIncGst', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="26"
                        label="Miscellaneous services"
                        triplet={zb.row26_miscellaneousServices}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row26_miscellaneousServices', col, v)
                        }
                      />

                      {/* ==================== SECTION G ==================== */}
                      <ZomatoSectionHeaderRow
                        code="G"
                        title="Investment in Hyperpure"
                        formula="( 27 )"
                        triplet={zb.sectionG_investmentInHyperpure}
                        reported={zb.reportedSectionG}
                        tone="red"
                        badgeText="Matched vs Purchase & COGS"
                      />
                      <ZomatoTripletEditRow
                        sNo="27"
                        label="Total Hyperpure"
                        highlightRow
                        triplet={zb.row27_totalHyperpure}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row27_totalHyperpure', col, v)
                        }
                      />

                      {/* ==================== SECTION H ==================== */}
                      <ZomatoSectionHeaderRow
                        code="H"
                        title="Other Deductions"
                        formula="( 28 )"
                        triplet={zb.sectionH_otherDeductions}
                        reported={zb.reportedSectionH}
                        tone="red"
                        onAddExtra={() => handleAddExtraZomatoLine('extraOtherDeductions')}
                        addExtraLabel="Add Deduction"
                      />
                      <ZomatoTripletEditRow
                        sNo="28"
                        label="Express order discount reversal"
                        triplet={zb.row28_expressOrderDiscountReversal}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange(
                            'row28_expressOrderDiscountReversal',
                            col,
                            v
                          )
                        }
                      />
                      {(zb.extraOtherDeductions || []).map((item, idx) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-200/80 bg-rose-50/20 hover:bg-rose-50/40"
                        >
                          <td className="px-2.5 py-1.5 text-[11px] font-mono text-slate-500">
                            {item.sNo || `28.${idx + 1}`}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={item.label}
                                onChange={(e) =>
                                  handleUpdateExtraZomatoLine(
                                    'extraOtherDeductions',
                                    item.id,
                                    { label: e.target.value }
                                  )
                                }
                                className="flex-1 bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveExtraZomatoLine('extraOtherDeductions', item.id)
                                }
                                className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                title="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          {(['delivered', 'cancelled', 'total'] as const).map((col) => (
                            <td key={col} className="px-2 py-1 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={item.values[col]}
                                onChange={(e) =>
                                  handleUpdateExtraZomatoLine(
                                    'extraOtherDeductions',
                                    item.id,
                                    { col, rawVal: e.target.value }
                                  )
                                }
                                className="w-24 bg-white border border-slate-300 rounded-md px-1.5 py-1 text-right font-mono text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}

                      {/* ==================== SECTION I ==================== */}
                      <ZomatoSectionHeaderRow
                        code="I"
                        title="Total Additions"
                        formula="( 29 + 30 + 31 + 32 )"
                        triplet={zb.sectionI_totalAdditions}
                        reported={zb.reportedSectionI}
                        tone="green"
                        onAddExtra={() => handleAddExtraZomatoLine('extraAdditions')}
                        addExtraLabel="Add Addition"
                      />
                      <ZomatoTripletEditRow
                        sNo="29"
                        label="Cancellation refund for cancelled orders"
                        signHint="+"
                        triplet={zb.row29_cancellationRefund}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row29_cancellationRefund', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="30"
                        label="Tip for kitchen staff for delivered orders"
                        signHint="+"
                        triplet={zb.row30_kitchenStaffTip}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row30_kitchenStaffTip', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="31"
                        label="TDS 194 H and other Res id level additions"
                        subLabel='(Refer to Annexure : "Addition/ Deduction Details")'
                        signHint="+"
                        triplet={zb.row31_tds194HAndResIdAdditions}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row31_tds194HAndResIdAdditions', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        sNo="32"
                        label="Restaurant-level service fees rebate"
                        signHint="+"
                        triplet={zb.row32_serviceFeesRebate}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('row32_serviceFeesRebate', col, v)
                        }
                      />
                      {(zb.extraAdditions || []).map((item, idx) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-200/80 bg-emerald-50/20 hover:bg-emerald-50/40"
                        >
                          <td className="px-2.5 py-1.5 text-[11px] font-mono text-slate-500">
                            {item.sNo || `32.${idx + 1}`}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={item.label}
                                onChange={(e) =>
                                  handleUpdateExtraZomatoLine('extraAdditions', item.id, {
                                    label: e.target.value,
                                  })
                                }
                                className="flex-1 bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveExtraZomatoLine('extraAdditions', item.id)
                                }
                                className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                title="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          {(['delivered', 'cancelled', 'total'] as const).map((col) => (
                            <td key={col} className="px-2 py-1 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={item.values[col]}
                                onChange={(e) =>
                                  handleUpdateExtraZomatoLine('extraAdditions', item.id, {
                                    col,
                                    rawVal: e.target.value,
                                  })
                                }
                                className="w-24 bg-white border border-slate-300 rounded-md px-1.5 py-1 text-right font-mono text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}

                      {/* ==================== SECTION J ==================== */}
                      <ZomatoSectionHeaderRow
                        code="J"
                        title="Net Payout"
                        formula="( A - C - D - E - F - G - H + I )"
                        triplet={zb.sectionJ_netPayout}
                        reported={zb.reportedSectionJ}
                        tone="green"
                      />

                      {/* ==================== SETTLEMENT BREAKDOWN ==================== */}
                      <tr className="bg-slate-200/70 border-t-2 border-b border-slate-300">
                        <td colSpan={5} className="px-3 py-2 text-xs sm:text-sm font-black text-slate-950">
                          Settlement breakdown
                        </td>
                      </tr>
                      <ZomatoTripletEditRow
                        label="Amount settled"
                        triplet={zb.settlementAmountSettled}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('settlementAmountSettled', col, v)
                        }
                      />
                      <ZomatoTripletEditRow
                        label="Pending amount (will be credited on next payout day)"
                        triplet={zb.settlementPendingAmount}
                        onChangeCol={(col, v) =>
                          handleZomatoTripletChange('settlementPendingAmount', col, v)
                        }
                      />
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Final Zomato Net Payout Verification & Bank Settlement Bar */}
              <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-indigo-950 rounded-2xl p-5 text-white">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-slate-300">
                      A. Net Order Value
                    </span>
                    <div className="text-base font-mono font-bold text-emerald-300">
                      {formatZomatoSheetINR(zb.sectionA_netOrderValue.total)}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      1. Subtotal {formatZomatoSheetINR(zb.row1_subtotal.total)} · Orders {zb.ordersCount.delivered}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[11px] text-rose-300">
                      Net Deductions (C+D+E+F+G+H−I)
                    </span>
                    <div className="text-base font-mono font-bold text-rose-300">
                      -{formatZomatoSheetINR(zomatoTotalDeductionsNetOfAdditions)}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Fees {formatZomatoSheetINR(zb.sectionC_serviceAndPaymentFees.total)} · Ads{' '}
                      {formatZomatoSheetINR(zb.sectionF_investmentInGrowthServices.total)}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[11px] text-indigo-200 flex items-center gap-1">
                      <Calculator className="w-3.5 h-3.5 text-indigo-300" />
                      Calculated J. Net Payout
                    </span>
                    <div className="text-lg font-mono font-black text-emerald-300">
                      {formatZomatoSheetINR(zb.calculatedNetPayout)}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateZomatoBreakup(
                          (m) => ({
                            ...m,
                            hasExplicitReportedJ: true,
                            reportedNetPayout: m.calculatedNetPayout,
                          }),
                          true
                        )
                      }
                      className="text-[10px] font-bold text-emerald-300 hover:text-emerald-200 underline cursor-pointer"
                    >
                      Sync Final Payout to Calculated J →
                    </button>
                  </div>

                  <div className="bg-white/10 p-3 rounded-xl border border-emerald-400/40">
                    <label className="block text-[11px] font-bold text-emerald-300 mb-1">
                      Confirmed J. Net Payout (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={zb.reportedNetPayout}
                      onChange={(e) => handleZomatoReportedPayoutChange(e.target.value)}
                      className="w-full bg-slate-950/80 border border-emerald-400/50 rounded-lg px-3 py-1.5 font-mono text-base font-black text-emerald-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
                    />
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">Formula Diff:</span>
                      <span
                        className={`font-mono font-bold ${
                          Math.abs(current.settlementDifference) <= 10
                            ? 'text-emerald-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {formatZomatoSheetINR(current.settlementDifference)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collapsible Raw "Payout Breakup" Sheet Audit Trace */}
              {zb.rawSheetRows && zb.rawSheetRows.length > 0 && (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowRawBreakupRows((v) => !v)}
                    className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-rose-600" />
                      <span>
                        Inspect Extracted &ldquo;{zb.sheetNameUsed || 'Payout Breakup'}&rdquo; Sheet Rows (
                        {zb.rawSheetRows.length} rows evaluated)
                      </span>
                    </span>
                    {showRawBreakupRows ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </button>

                  {showRawBreakupRows && (
                    <div className="border-t border-slate-200 max-h-64 overflow-y-auto bg-white">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-100 text-slate-600 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-bold">S.no.</th>
                            <th className="text-left px-3 py-2 font-bold">Particular</th>
                            <th className="text-right px-3 py-2 font-bold">Delivered</th>
                            <th className="text-right px-3 py-2 font-bold">Cancelled</th>
                            <th className="text-right px-3 py-2 font-bold">Total</th>
                            <th className="text-left px-3 py-2 font-bold">Mapped Field</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {zb.rawSheetRows.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50">
                              <td className="px-3 py-1.5 font-mono font-bold text-slate-500">
                                {row.sNo || '—'}
                              </td>
                              <td className="px-3 py-1.5 text-slate-800 font-medium">
                                {row.particulars}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-slate-600">
                                {formatZomatoSheetINR(row.deliveredValue)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-slate-600">
                                {formatZomatoSheetINR(row.cancelledValue)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-900">
                                {formatZomatoSheetINR(row.totalValue)}
                              </td>
                              <td className="px-3 py-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                                    row.mappedField === 'unmapped'
                                      ? 'bg-slate-100 text-slate-500'
                                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  }`}
                                >
                                  {row.mappedField}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : isSwiggy && sb ? (
            /* ========================================================================
               EXACT SWIGGY (+ TOING COMBINED) "PAYOUT BREAKUP" SHEET MODEL
               ======================================================================== */
            <div className="space-y-4">
              {/* Swiggy + Toing Combined Banner */}
              <div className="bg-gradient-to-r from-amber-50 via-white to-orange-50 rounded-2xl p-3.5 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black text-sm shrink-0">
                    S
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                        Swiggy &ldquo;Payout Breakup&rdquo; Sheet Model (Swiggy + Toing Combined)
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-900 border border-orange-200">
                        Reported Together as Swiggy · Tab: {sb.sheetNameUsed || 'Payout Breakup'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Combines <strong>Swiggy Orders</strong> + <strong>Toing Orders</strong> across Delivered &amp; Cancelled columns into consolidated Swiggy reporting. Deductions &amp; taxes are negative (`-`) per Swiggy sheet convention.
                    </p>
                  </div>
                </div>
                <div className="text-right text-[11px] font-mono text-slate-700 shrink-0 space-y-0.5">
                  <div>
                    Swiggy Net:{' '}
                    <strong className="text-slate-900">
                      {formatINR(sb.netPayout.swiggyDelivered + sb.netPayout.swiggyCancelled)}
                    </strong>{' '}
                    + Toing Net:{' '}
                    <strong className="text-orange-700">
                      {formatINR(sb.netPayout.toingDelivered + sb.netPayout.toingCancelled)}
                    </strong>
                  </div>
                  <div>
                    Combined Swiggy Net Payout:{' '}
                    <strong className="text-emerald-700">{formatINR(sb.netPayout.total)}</strong>
                  </div>
                </div>
              </div>

              {/* Exact 6-Column Swiggy + Toing Payout Breakup Table */}
              <div className="rounded-2xl border border-slate-300 overflow-hidden shadow-xs bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left min-w-[820px]">
                    <thead>
                      {/* Super-Header Row: Swiggy Orders | Toing Orders */}
                      <tr className="bg-orange-50/70 border-b border-slate-300">
                        <th className="px-3 py-2 border-r border-slate-200" />
                        <th
                          colSpan={2}
                          className="px-3 py-2 text-center text-sm font-black text-orange-600 border-r border-slate-300"
                        >
                          Swiggy Orders
                        </th>
                        <th
                          colSpan={2}
                          className="px-3 py-2 text-center text-sm font-black text-orange-600 border-r border-slate-300"
                        >
                          Toing Orders
                        </th>
                        <th className="px-3 py-2" />
                      </tr>
                      {/* Sub-Header Row: Particulars | Delivered | Cancelled | Delivered | Cancelled | Total */}
                      <tr className="bg-white border-b-2 border-slate-300">
                        <th className="px-3 py-2.5 text-xs font-black text-orange-600">
                          Particulars
                        </th>
                        <th className="w-28 px-2 py-2.5 text-right text-xs font-black text-orange-600 whitespace-nowrap">
                          Delivered Orders
                        </th>
                        <th className="w-28 px-2 py-2.5 text-right text-xs font-black text-orange-600 whitespace-nowrap border-r border-slate-200">
                          Cancelled Orders
                        </th>
                        <th className="w-28 px-2 py-2.5 text-right text-xs font-black text-orange-600 whitespace-nowrap">
                          Delivered Orders
                        </th>
                        <th className="w-28 px-2 py-2.5 text-right text-xs font-black text-orange-600 whitespace-nowrap border-r border-slate-200">
                          Cancelled Orders
                        </th>
                        <th className="w-32 px-2.5 py-2.5 text-right text-xs font-black text-orange-600 whitespace-nowrap">
                          Total
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {/* Top Row: Orders */}
                      <SwiggyQuintetEditRow
                        label="Orders"
                        quintet={sb.orders}
                        isInteger
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('orders', col, v, 'int')
                        }
                      />

                      {/* ==================== SECTION 1: TOTAL CUSTOMER PAID ==================== */}
                      <SwiggySectionSummaryRow
                        title="Total Customer Paid"
                        quintet={sb.totalCustomerPaid}
                        reported={sb.reportedTotalCustomerPaid}
                        tone="green"
                      />
                      <SwiggyQuintetEditRow
                        label="Item Total"
                        signBadge="+"
                        quintet={sb.itemTotal}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('itemTotal', col, v, 'pos')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Packaging Charges"
                        signBadge="+"
                        quintet={sb.packagingCharges}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('packagingCharges', col, v, 'pos')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Restaurant Discounts (Coupon based)"
                        signBadge="-"
                        quintet={sb.couponDiscounts}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('couponDiscounts', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Restaurant Discounts (FVOs, Freebies and others)"
                        signBadge="-"
                        quintet={sb.fvoFreebiesDiscounts}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('fvoFreebiesDiscounts', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="GST Collected"
                        signBadge="+"
                        quintet={sb.gstCollected}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('gstCollected', col, v, 'pos')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Delivery Fee"
                        signBadge="+"
                        quintet={sb.deliveryFee}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('deliveryFee', col, v, 'pos')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Discount on Delivery Fee"
                        signBadge="-"
                        quintet={sb.discountOnDeliveryFee}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('discountOnDeliveryFee', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="GST on Delivery Fee"
                        signBadge="+"
                        boldRow
                        quintet={sb.gstOnDeliveryFee}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('gstOnDeliveryFee', col, v, 'pos')
                        }
                      />

                      {/* ==================== SECTION 2: SWIGGY FEES ==================== */}
                      <SwiggySectionSummaryRow
                        title="Swiggy Fees"
                        quintet={sb.swiggyFees}
                        reported={sb.reportedSwiggyFees}
                        tone="red"
                        onAddExtra={() => handleAddExtraSwiggyLine('extraSwiggyFees')}
                        addExtraLabel="Add Fee Row"
                      />
                      <SwiggyQuintetEditRow
                        label="Commission"
                        signBadge="-"
                        quintet={sb.commission}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('commission', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Long Distance Charges"
                        signBadge="-"
                        quintet={sb.longDistanceCharges}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('longDistanceCharges', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Payment Collection Charges"
                        signBadge="-"
                        quintet={sb.paymentCollectionCharges}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('paymentCollectionCharges', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Pocket Hero Fees"
                        signBadge="-"
                        quintet={sb.pocketHeroFees}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('pocketHeroFees', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Swiggy One Fees"
                        signBadge="-"
                        quintet={sb.swiggyOneFees}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('swiggyOneFees', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Restaurant Cancellation Charges"
                        signBadge="-"
                        quintet={sb.restaurantCancellationCharges}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange(
                            'restaurantCancellationCharges',
                            col,
                            v,
                            'neg'
                          )
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Call Center Charges"
                        signBadge="-"
                        quintet={sb.callCenterCharges}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('callCenterCharges', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Delivery Fee sponsored by Restaurant (w/o tax)"
                        signBadge="-"
                        quintet={sb.deliveryFeeSponsoredByRestaurant}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange(
                            'deliveryFeeSponsoredByRestaurant',
                            col,
                            v,
                            'neg'
                          )
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Bolt fees"
                        signBadge="-"
                        quintet={sb.boltFees}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('boltFees', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Swiggy Assure"
                        signBadge="-"
                        highlightRow={Math.abs(sb.swiggyAssureFee.total) > 0}
                        quintet={sb.swiggyAssureFee}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('swiggyAssureFee', col, v, 'neg')
                        }
                      />
                      {(sb.extraSwiggyFees || []).map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-200/80 bg-orange-50/20 hover:bg-orange-50/40"
                        >
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={item.label}
                                onChange={(e) =>
                                  handleUpdateExtraSwiggyLine('extraSwiggyFees', item.id, {
                                    label: e.target.value,
                                  })
                                }
                                className="flex-1 bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-orange-500"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveExtraSwiggyLine('extraSwiggyFees', item.id)
                                }
                                className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                title="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          {(
                            [
                              'swiggyDelivered',
                              'swiggyCancelled',
                              'toingDelivered',
                              'toingCancelled',
                              'total',
                            ] as const
                          ).map((col) => (
                            <td
                              key={col}
                              className={`px-1.5 py-1 text-right ${
                                col === 'swiggyCancelled' || col === 'toingCancelled'
                                  ? 'border-r border-slate-200/90'
                                  : ''
                              }`}
                            >
                              <input
                                type="number"
                                step="0.01"
                                value={item.values[col]}
                                onChange={(e) =>
                                  handleUpdateExtraSwiggyLine('extraSwiggyFees', item.id, {
                                    col,
                                    rawVal: e.target.value,
                                  })
                                }
                                className="w-20 sm:w-24 bg-white border border-slate-300 rounded-md px-1.5 py-1 text-right font-mono text-xs text-rose-700 focus:outline-hidden focus:border-orange-500"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}

                      {/* ==================== SECTION 3: CUSTOMER COMPLAINTS & CANCELLATION CHARGES ==================== */}
                      <SwiggySectionSummaryRow
                        title="Customer Complaints & Cancellation Charges"
                        quintet={sb.customerComplaintsAndCancellation}
                        reported={sb.reportedCustomerComplaintsAndCancellation}
                        tone="red"
                      />
                      <SwiggyQuintetEditRow
                        label="Merchant Share Of Cancelled Orders"
                        signBadge="-"
                        quintet={sb.merchantShareCancelledOrders}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange(
                            'merchantShareCancelledOrders',
                            col,
                            v,
                            'neg'
                          )
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Refund For Customer Complaints"
                        signBadge="-"
                        quintet={sb.refundForCustomerComplaints}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange(
                            'refundForCustomerComplaints',
                            col,
                            v,
                            'neg'
                          )
                        }
                      />

                      {/* ==================== SECTION 4: ADS & OTHER CHARGES / REFUNDS ==================== */}
                      <SwiggyQuintetEditRow
                        label="Growth Investment In Ads"
                        signBadge="-"
                        boldRow
                        quintet={sb.growthInvestmentInAds}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('growthInvestmentInAds', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="Other Charges and Refunds"
                        signBadge="±"
                        boldRow
                        quintet={sb.otherChargesAndRefunds}
                        onAddExtra={() =>
                          handleAddExtraSwiggyLine('extraOtherChargesAndRefunds')
                        }
                        addExtraLabel="Add Row"
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('otherChargesAndRefunds', col, v, 'signed')
                        }
                      />
                      {(sb.extraOtherChargesAndRefunds || []).map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-200/80 bg-slate-50/40 hover:bg-slate-50/80"
                        >
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={item.label}
                                onChange={(e) =>
                                  handleUpdateExtraSwiggyLine(
                                    'extraOtherChargesAndRefunds',
                                    item.id,
                                    { label: e.target.value }
                                  )
                                }
                                className="flex-1 bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-orange-500"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveExtraSwiggyLine(
                                    'extraOtherChargesAndRefunds',
                                    item.id
                                  )
                                }
                                className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                title="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          {(
                            [
                              'swiggyDelivered',
                              'swiggyCancelled',
                              'toingDelivered',
                              'toingCancelled',
                              'total',
                            ] as const
                          ).map((col) => (
                            <td
                              key={col}
                              className={`px-1.5 py-1 text-right ${
                                col === 'swiggyCancelled' || col === 'toingCancelled'
                                  ? 'border-r border-slate-200/90'
                                  : ''
                              }`}
                            >
                              <input
                                type="number"
                                step="0.01"
                                value={item.values[col]}
                                onChange={(e) =>
                                  handleUpdateExtraSwiggyLine(
                                    'extraOtherChargesAndRefunds',
                                    item.id,
                                    { col, rawVal: e.target.value }
                                  )
                                }
                                className="w-20 sm:w-24 bg-white border border-slate-300 rounded-md px-1.5 py-1 text-right font-mono text-xs text-slate-900 focus:outline-hidden focus:border-orange-500"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}

                      {/* ==================== SECTION 5: TOTAL TAXES ==================== */}
                      <SwiggySectionSummaryRow
                        title="Total Taxes"
                        quintet={sb.totalTaxes}
                        reported={sb.reportedTotalTaxes}
                        tone="red"
                      />
                      <SwiggyQuintetEditRow
                        label="GST Deduction"
                        signBadge="-"
                        quintet={sb.gstDeduction}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('gstDeduction', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="TCS"
                        signBadge="-"
                        quintet={sb.tcs}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('tcs', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="TDS"
                        signBadge="-"
                        quintet={sb.tds}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('tds', col, v, 'neg')
                        }
                      />
                      <SwiggyQuintetEditRow
                        label="GST on Service Fee @18%"
                        signBadge="-"
                        quintet={sb.gstOnServiceFee18}
                        onChangeCol={(col, v) =>
                          handleSwiggyQuintetChange('gstOnServiceFee18', col, v, 'neg')
                        }
                      />

                      {/* ==================== SECTION 6: NET PAYOUT ==================== */}
                      <SwiggySectionSummaryRow
                        title="Net Payout"
                        quintet={sb.netPayout}
                        reported={sb.reportedNetPayoutQuintet}
                        isNetPayout
                      />
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Final Swiggy (+ Toing Combined) Net Payout Verification Bar */}
              <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-indigo-950 rounded-2xl p-5 text-white">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-slate-300">Total Customer Paid</span>
                    <div className="text-base font-mono font-bold text-emerald-300">
                      {formatINR(sb.totalCustomerPaid.total)}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Item Total {formatINR(sb.itemTotal.total)} · Orders{' '}
                      {sb.orders.swiggyDelivered + sb.orders.toingDelivered} ({sb.orders.swiggyDelivered} Swiggy + {sb.orders.toingDelivered} Toing)
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[11px] text-rose-300">
                      Swiggy Fees + Complaints + Ads + Taxes
                    </span>
                    <div className="text-base font-mono font-bold text-rose-300">
                      {formatINR(
                        sb.swiggyFees.total +
                          sb.customerComplaintsAndCancellation.total +
                          sb.growthInvestmentInAds.total +
                          sb.otherChargesAndRefunds.total +
                          sb.totalTaxes.total
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Fees {formatINR(sb.swiggyFees.total)} · Taxes {formatINR(sb.totalTaxes.total)}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[11px] text-amber-200 flex items-center gap-1">
                      <Calculator className="w-3.5 h-3.5 text-amber-300" />
                      Calculated Net Payout (Swiggy + Toing)
                    </span>
                    <div className="text-lg font-mono font-black text-emerald-300">
                      {formatINR(sb.calculatedNetPayout)}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateSwiggyBreakup(
                          (m) => ({
                            ...m,
                            hasExplicitReportedNetPayout: true,
                            reportedNetPayout: m.calculatedNetPayout,
                          }),
                          true
                        )
                      }
                      className="text-[10px] font-bold text-emerald-300 hover:text-emerald-200 underline cursor-pointer"
                    >
                      Sync Final Payout to Calculated Net →
                    </button>
                  </div>

                  <div className="bg-white/10 p-3 rounded-xl border border-emerald-400/40">
                    <label className="block text-[11px] font-bold text-emerald-300 mb-1">
                      Confirmed Swiggy Net Payout (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={sb.reportedNetPayout}
                      onChange={(e) => handleSwiggyReportedPayoutChange(e.target.value)}
                      className="w-full bg-slate-950/80 border border-emerald-400/50 rounded-lg px-3 py-1.5 font-mono text-base font-black text-emerald-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
                    />
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">Formula Diff:</span>
                      <span
                        className={`font-mono font-bold ${
                          Math.abs(current.settlementDifference) <= 10
                            ? 'text-emerald-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {formatINR(current.settlementDifference)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collapsible Raw Swiggy "Payout Breakup" Sheet Audit Trace */}
              {sb.rawSheetRows && sb.rawSheetRows.length > 0 && (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowRawBreakupRows((v) => !v)}
                    className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-orange-600" />
                      <span>
                        Inspect Extracted &ldquo;{sb.sheetNameUsed || 'Payout Breakup'}&rdquo; Sheet Rows (
                        {sb.rawSheetRows.length} rows evaluated)
                      </span>
                    </span>
                    {showRawBreakupRows ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </button>

                  {showRawBreakupRows && (
                    <div className="border-t border-slate-200 max-h-64 overflow-y-auto bg-white">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-100 text-slate-600 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-bold">Particulars</th>
                            <th className="text-right px-2 py-2 font-bold">Swiggy Del</th>
                            <th className="text-right px-2 py-2 font-bold">Swiggy Can</th>
                            <th className="text-right px-2 py-2 font-bold">Toing Del</th>
                            <th className="text-right px-2 py-2 font-bold">Toing Can</th>
                            <th className="text-right px-3 py-2 font-bold">Total</th>
                            <th className="text-left px-3 py-2 font-bold">Mapped Field</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sb.rawSheetRows.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50">
                              <td className="px-3 py-1.5 text-slate-800 font-medium">
                                {row.particulars}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                                {formatSwiggySheetNum(row.swiggyDelivered)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                                {formatSwiggySheetNum(row.swiggyCancelled)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                                {formatSwiggySheetNum(row.toingDelivered)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                                {formatSwiggySheetNum(row.toingCancelled)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-900">
                                {formatSwiggySheetNum(row.totalValue)}
                              </td>
                              <td className="px-3 py-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                                    row.mappedField === 'unmapped'
                                      ? 'bg-slate-100 text-slate-500'
                                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  }`}
                                >
                                  {row.mappedField}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : isOwnly && ob ? (
            /* ========================================================================
               EXACT OWNLY 12-COLUMN PAYOUT SETTLEMENT LEDGER TEMPLATE
               (Restaurant ID | Restaurant Name | Payout Period | Total Orders | Gross Amount |
                Tax Deduction | TDS Deduction | TCS Deduction | Total Deductions | Net Payout Amount | Status | UTR)
               ======================================================================== */
            <div className="space-y-4">
              {/* Ownly Template Metadata & Action Header */}
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 font-black uppercase tracking-wider text-indigo-950">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      2. Ownly 12-Column Payout Settlement Ledger
                    </span>
                    <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-white text-indigo-900 border border-indigo-200">
                      ID:{' '}
                      {ob.resId ||
                        current.accountId ||
                        (current.outletId === 'whitefield' ? 'RN421125' : 'RN421127')}
                    </span>
                    {ob.rawRestaurantName && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white text-slate-700 border border-slate-200">
                        Sheet Name: {ob.rawRestaurantName}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                      {ob.rows.length} {ob.rows.length === 1 ? 'Settlement Row' : 'Settlement Rows'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Matches the Ownly payout Excel sheet column-for-column. Pre-Tax Food Subtotal (Gross &minus; Tax):{' '}
                    <strong className="font-mono text-slate-900">
                      {formatINR(ob.preTaxFoodSubtotal)}
                    </strong>
                    {Math.abs(ob.totalOtherDeductions) >= 0.01 && (
                      <>
                        {' '}
                        · Residual / Rounding Adjustment:{' '}
                        <strong className="font-mono text-amber-800">
                          {formatINR(ob.totalOtherDeductions)}
                        </strong>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
                  <button
                    type="button"
                    onClick={handleAddOwnlyRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Settlement Row</span>
                  </button>
                </div>
              </div>

              {/* Exact 12-Column Ownly Spreadsheet Table */}
              <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
                <div className="overflow-x-auto max-h-[440px]">
                  <table className="w-full text-xs border-collapse min-w-[1180px]">
                    <thead className="sticky top-0 z-10 bg-slate-100 border-b-2 border-slate-300 text-slate-900">
                      <tr className="divide-x divide-slate-200">
                        <th className="px-2.5 py-2.5 text-left font-black whitespace-nowrap">
                          Restaurant ID
                        </th>
                        <th className="px-2.5 py-2.5 text-left font-black whitespace-nowrap">
                          Restaurant Name
                        </th>
                        <th className="px-2.5 py-2.5 text-left font-black whitespace-nowrap">
                          Payout Period
                        </th>
                        <th className="px-2 py-2.5 text-right font-black whitespace-nowrap">
                          Total Orders
                        </th>
                        <th className="px-2.5 py-2.5 text-right font-black whitespace-nowrap">
                          Gross Amount
                        </th>
                        <th className="px-2.5 py-2.5 text-right font-black whitespace-nowrap">
                          Tax Deduction
                        </th>
                        <th className="px-2.5 py-2.5 text-right font-black whitespace-nowrap">
                          TDS Deduction
                        </th>
                        <th className="px-2 py-2.5 text-right font-black whitespace-nowrap">
                          TCS Deduction
                        </th>
                        <th className="px-2.5 py-2.5 text-right font-black whitespace-nowrap">
                          Total Deductions
                        </th>
                        <th className="px-2.5 py-2.5 text-right font-black whitespace-nowrap bg-emerald-50/70 text-emerald-950">
                          Net Payout Amount
                        </th>
                        <th className="px-2.5 py-2.5 text-left font-black whitespace-nowrap">
                          Status
                        </th>
                        <th className="px-2.5 py-2.5 text-left font-black whitespace-nowrap">
                          UTR
                        </th>
                        <th className="px-2 py-2.5 text-center font-black w-9" title="Row Actions">
                          &nbsp;
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {ob.rows.map((row) => {
                        const isCompleted =
                          String(row.status || '').trim().toLowerCase() === 'completed';
                        const isCancelledRow = /^(cancelled|canceled|failed|rejected|reversed)$/i.test(
                          String(row.status || '').trim()
                        );
                        return (
                          <tr
                            key={row.id}
                            className={`divide-x divide-slate-200/80 transition-colors ${
                              isCancelledRow
                                ? 'bg-rose-50/40 opacity-65'
                                : 'bg-white hover:bg-slate-50/90'
                            }`}
                          >
                            {/* 1. Restaurant ID */}
                            <td className="px-1.5 py-1 align-middle">
                              <input
                                type="text"
                                value={row.restaurantId}
                                onChange={(e) =>
                                  handleOwnlyRowChange(row.id, 'restaurantId', e.target.value)
                                }
                                className="w-24 rounded px-1.5 py-1 font-mono text-[11px] font-bold text-slate-900 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 focus:outline-hidden"
                              />
                            </td>

                            {/* 2. Restaurant Name */}
                            <td className="px-1.5 py-1 align-middle">
                              <input
                                type="text"
                                value={row.restaurantName}
                                onChange={(e) =>
                                  handleOwnlyRowChange(row.id, 'restaurantName', e.target.value)
                                }
                                className="w-40 rounded px-1.5 py-1 text-[11px] font-medium text-slate-900 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 focus:outline-hidden"
                              />
                            </td>

                            {/* 3. Payout Period */}
                            <td className="px-1.5 py-1 align-middle">
                              <input
                                type="text"
                                value={row.payoutPeriod}
                                onChange={(e) =>
                                  handleOwnlyRowChange(row.id, 'payoutPeriod', e.target.value)
                                }
                                placeholder="e.g. 1 October -> 1 October"
                                className="w-44 rounded px-1.5 py-1 text-[11px] text-slate-800 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 focus:outline-hidden"
                              />
                            </td>

                            {/* 4. Total Orders */}
                            <td className="px-1.5 py-1 text-right align-middle">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={row.totalOrders}
                                onChange={(e) =>
                                  handleOwnlyRowChange(row.id, 'totalOrders', e.target.value)
                                }
                                className="w-14 rounded px-1.5 py-1 text-right font-mono text-xs font-semibold text-slate-900 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 focus:outline-hidden"
                              />
                            </td>

                            {/* 5. Gross Amount */}
                            <td className="px-1.5 py-1 text-right align-middle">
                              <input
                                type="number"
                                step="0.01"
                                value={row.grossAmount}
                                onChange={(e) =>
                                  handleOwnlyRowChange(row.id, 'grossAmount', e.target.value)
                                }
                                className="w-24 rounded px-1.5 py-1 text-right font-mono text-xs font-semibold text-slate-900 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 focus:outline-hidden"
                              />
                            </td>

                            {/* 6. Tax Deduction */}
                            <td className="px-1.5 py-1 text-right align-middle">
                              <input
                                type="number"
                                step="0.01"
                                value={row.taxDeduction}
                                onChange={(e) =>
                                  handleOwnlyRowChange(row.id, 'taxDeduction', e.target.value)
                                }
                                className="w-20 rounded px-1.5 py-1 text-right font-mono text-xs text-slate-800 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 focus:outline-hidden"
                              />
                            </td>

                            {/* 7. TDS Deduction */}
                            <td className="px-1.5 py-1 text-right align-middle">
                              <input
                                type="number"
                                step="0.01"
                                value={row.tdsDeduction}
                                onChange={(e) =>
                                  handleOwnlyRowChange(row.id, 'tdsDeduction', e.target.value)
                                }
                                className="w-20 rounded px-1.5 py-1 text-right font-mono text-xs text-slate-800 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 focus:outline-hidden"
                              />
                            </td>

                            {/* 8. TCS Deduction */}
                            <td className="px-1.5 py-1 text-right align-middle">
                              <input
                                type="number"
                                step="0.01"
                                value={row.tcsDeduction}
                                onChange={(e) =>
                                  handleOwnlyRowChange(row.id, 'tcsDeduction', e.target.value)
                                }
                                className="w-16 rounded px-1.5 py-1 text-right font-mono text-xs text-slate-800 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 focus:outline-hidden"
                              />
                            </td>

                            {/* 9. Total Deductions */}
                            <td className="px-1.5 py-1 text-right align-middle">
                              <input
                                type="number"
                                step="0.01"
                                value={row.totalDeductions}
                                onChange={(e) =>
                                  handleOwnlyRowChange(row.id, 'totalDeductions', e.target.value)
                                }
                                className="w-22 rounded px-1.5 py-1 text-right font-mono text-xs font-semibold text-rose-800 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 focus:outline-hidden"
                              />
                            </td>

                            {/* 10. Net Payout Amount (with ₹ prefix matching screenshot) */}
                            <td className="px-2 py-1 text-right align-middle bg-emerald-50/35">
                              <div className="inline-flex items-center justify-end gap-0.5">
                                <span className="font-mono text-[11px] font-bold text-emerald-800">
                                  ₹
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={row.netPayoutAmount}
                                  onChange={(e) =>
                                    handleOwnlyRowChange(row.id, 'netPayoutAmount', e.target.value)
                                  }
                                  className="w-24 rounded px-1.5 py-1 text-right font-mono text-xs font-bold text-emerald-950 bg-white/80 hover:bg-white focus:bg-white border border-emerald-200 focus:border-emerald-500 focus:outline-hidden"
                                />
                              </div>
                            </td>

                            {/* 11. Status */}
                            <td className="px-1.5 py-1 align-middle">
                              <select
                                value={row.status || 'completed'}
                                onChange={(e) =>
                                  handleOwnlyRowChange(row.id, 'status', e.target.value)
                                }
                                className={`rounded-md px-2 py-1 text-[11px] font-semibold border focus:outline-hidden ${
                                  isCompleted
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : isCancelledRow
                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                              >
                                <option value="completed">completed</option>
                                <option value="pending">pending</option>
                                <option value="processing">processing</option>
                                <option value="cancelled">cancelled</option>
                              </select>
                            </td>

                            {/* 12. UTR */}
                            <td className="px-1.5 py-1 align-middle">
                              <input
                                type="text"
                                value={row.utr}
                                onChange={(e) =>
                                  handleOwnlyRowChange(row.id, 'utr', e.target.value)
                                }
                                placeholder="UTR number"
                                className="w-32 rounded px-1.5 py-1 font-mono text-[11px] text-slate-800 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 focus:outline-hidden"
                              />
                            </td>

                            {/* Delete Row Action */}
                            <td className="px-1 py-1 text-center align-middle">
                              <button
                                type="button"
                                onClick={() => handleRemoveOwnlyRow(row.id)}
                                disabled={ob.rows.length <= 1}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                                title="Remove settlement row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* Bold Column Totals Row */}
                    <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-950">
                      <tr className="divide-x divide-slate-200">
                        <td colSpan={3} className="px-3 py-2.5 text-left font-black text-slate-900">
                          Total ({ob.rows.length}{' '}
                          {ob.rows.length === 1 ? 'Settlement' : 'Settlements'} · {current.month})
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono font-black">
                          {ob.totalOrders}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono font-black">
                          {formatSwiggySheetNum(ob.totalGrossAmount)}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono font-bold text-slate-800">
                          {formatSwiggySheetNum(ob.totalTaxDeduction)}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono font-bold text-slate-800">
                          {formatSwiggySheetNum(ob.totalTdsDeduction)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono font-bold text-slate-800">
                          {formatSwiggySheetNum(ob.totalTcsDeduction)}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono font-black text-rose-800">
                          {formatSwiggySheetNum(ob.totalDeductions)}
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono font-black text-emerald-900 bg-emerald-100/70">
                          {formatZomatoSheetINR(ob.reportedNetPayout)}
                        </td>
                        <td colSpan={3} className="px-2.5 py-2.5 text-left text-[11px] font-semibold text-slate-600">
                          {ob.rows.filter((r) => Boolean(r.utr?.trim())).length} UTRs recorded
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Ownly Final Net Payout Verification & Bank Settlement Bar */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-emerald-950 rounded-2xl p-5 text-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-slate-300">
                      Gross Amount ({ob.totalOrders} Orders)
                    </span>
                    <div className="text-base font-mono font-bold text-white">
                      {formatINR(ob.totalGrossAmount)}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Pre-Tax Food: {formatINR(ob.preTaxFoodSubtotal)}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[11px] text-rose-300">Total Deductions</span>
                    <div className="text-base font-mono font-bold text-rose-300">
                      -{formatINR(ob.totalDeductions)}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Tax {formatINR(ob.totalTaxDeduction)} · TDS {formatINR(ob.totalTdsDeduction)} · TCS{' '}
                      {formatINR(ob.totalTcsDeduction)}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[11px] text-indigo-200 flex items-center gap-1">
                      <Calculator className="w-3.5 h-3.5 text-indigo-300" />
                      Calculated Net Payout
                    </span>
                    <div className="text-lg font-mono font-black text-indigo-200">
                      {formatINR(ob.calculatedNetPayout)}
                    </div>
                    <button
                      type="button"
                      onClick={() => updateOwnlyBreakup((m) => m, true)}
                      className="text-[10px] font-bold text-emerald-300 hover:text-emerald-200 underline cursor-pointer"
                    >
                      Sync Final Payout to Calculated Net →
                    </button>
                  </div>

                  <div className="bg-white/10 p-3 rounded-xl border border-emerald-400/40">
                    <label className="block text-[11px] font-bold text-emerald-300 mb-1">
                      Confirmed Ownly Net Payout (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={ob.reportedNetPayout}
                      onChange={(e) => handleOwnlyReportedPayoutChange(e.target.value)}
                      className="w-full bg-slate-950/80 border border-emerald-400/50 rounded-lg px-3 py-1.5 font-mono text-base font-black text-emerald-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
                    />
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">Formula Diff:</span>
                      <span
                        className={`font-mono font-bold ${
                          Math.abs(current.settlementDifference) <= 10
                            ? 'text-emerald-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {formatINR(current.settlementDifference)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================================
               FALLBACK GENERIC PAYOUT SEGREGATION FORM
               ======================================================================== */
            <>
              {/* Section 2: Orders & Order Value Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl p-4.5 border border-slate-200 space-y-3.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center justify-between">
                    <span>2. Orders &amp; Order Value</span>
                    <span className="text-[11px] font-mono font-bold text-emerald-700">
                      Net Order Value: {formatINR(current.netSales)}
                    </span>
                  </h3>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Total Delivered Orders
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={current.orderCount}
                        onChange={(e) => handleNumberChange('orderCount', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Cancelled Orders Count
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={current.cancelledOrders || 0}
                        onChange={(e) => handleNumberChange('cancelledOrders', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-semibold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-slate-800 mb-1">
                        Total Order Value / Gross Sales (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={current.grossSales}
                        onChange={(e) => handleNumberChange('grossSales', e.target.value)}
                        className="w-full bg-emerald-50/40 border border-emerald-300 rounded-xl px-3 py-2 font-mono text-sm font-black text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Packaging Charges (+) (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={current.packagingCharges || 0}
                        onChange={(e) => handleNumberChange('packagingCharges', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Promo / Customer Discounts (-) (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={current.customerDiscounts}
                        onChange={(e) => handleNumberChange('customerDiscounts', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-semibold text-rose-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Commission, Cancellation & Core Platform Charges */}
                <div className="bg-white rounded-2xl p-4.5 border border-slate-200 space-y-3.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center justify-between">
                    <span>3. Commission, Cancellation &amp; Taxes</span>
                    <span className="text-[11px] font-mono font-semibold text-rose-700">
                      Comm Rate: {current.commissionRate.toFixed(1)}%
                    </span>
                  </h3>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-800 mb-1">
                        Commission / Service Fee (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={current.commissionAmount}
                        onChange={(e) => handleNumberChange('commissionAmount', e.target.value)}
                        className="w-full bg-rose-50/40 border border-rose-300 rounded-xl px-3 py-2 font-mono font-bold text-rose-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-800 mb-1">
                        Cancellation Charge / Refund (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={current.cancellationCharges}
                        onChange={(e) =>
                          handleNumberChange('cancellationCharges', e.target.value)
                        }
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Payment Gateway / Collection (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={current.paymentGatewayFee}
                        onChange={(e) => handleNumberChange('paymentGatewayFee', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Ads / CPC / Marketing Spend (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={current.advertisingSpend}
                        onChange={(e) => handleNumberChange('advertisingSpend', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-800 mb-1">
                        GST (on Fees / Sec 9(5)) (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={current.gstOnCommission}
                        onChange={(e) => handleNumberChange('gstOnCommission', e.target.value)}
                        className="w-full bg-amber-50/40 border border-amber-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          TCS (₹)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={current.tcsDeduction}
                          onChange={(e) => handleNumberChange('tcsDeduction', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 font-mono font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          TDS 194O (₹)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={current.tdsDeduction}
                          onChange={(e) => handleNumberChange('tdsDeduction', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 font-mono font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Swiggy Assure & All Other Excel Charges */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl p-4.5 border border-slate-200 space-y-3.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    4. Platform-Specific Deductions (Swiggy Assure)
                  </h3>

                  <div
                    className={`p-3.5 rounded-xl border transition-all ${
                      current.platform === 'swiggy' || (current.swiggyAssureFee || 0) > 0
                        ? 'bg-amber-50/70 border-amber-300'
                        : 'bg-slate-50 border-slate-200 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <span>Swiggy Assure Fee</span>
                        {current.platform === 'swiggy' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                            Swiggy Active
                          </span>
                        )}
                      </label>
                      <span className="text-[10px] text-amber-800 font-semibold">
                        Program Charge
                      </span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={current.swiggyAssureFee || 0}
                      onChange={(e) => handleNumberChange('swiggyAssureFee', e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 font-mono text-xs font-bold text-amber-950 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Dynamic Other Charges Extracted from Payout Excel */}
                <div className="bg-white rounded-2xl p-4.5 border border-slate-200 flex flex-col justify-between space-y-3">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        5. All Other Charges (from Payout Excel)
                      </h3>
                      <button
                        type="button"
                        onClick={handleAddOtherCharge}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Charge</span>
                      </button>
                    </div>

                    {(current.otherChargesBreakdown || []).length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
                        No extra miscellaneous fees detected in this payout sheet. Click{' '}
                        <strong>Add Charge</strong> if your statement includes Long Distance, Pocket Hero, Logistics, or Penalty charges.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                        {(current.otherChargesBreakdown || []).map((item) => (
                          <div key={item.id} className="flex items-center gap-2 text-xs">
                            <input
                              type="text"
                              value={item.label}
                              onChange={(e) =>
                                handleUpdateOtherCharge(item.id, { label: e.target.value })
                              }
                              placeholder="Charge description"
                              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={item.amount}
                              onChange={(e) =>
                                handleUpdateOtherCharge(item.id, {
                                  amount: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="w-28 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-mono font-bold text-slate-900 text-right focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveOtherCharge(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Remove charge"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">Total Other Charges:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatINR(current.otherPlatformFees)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 6: Net Payout Summary & Bank Settlement Confirmation */}
              <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 rounded-2xl p-5 text-white space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-slate-300">Net Order Value</span>
                    <div className="text-base font-mono font-bold text-white">
                      {formatINR(current.netSales)}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Gross + Packaging - Discounts
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[11px] text-rose-300">
                      Total Deductions &amp; Offsets
                    </span>
                    <div className="text-base font-mono font-bold text-rose-300">
                      -{formatINR(totalDeductionsAndOffsets)}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Comm + Cancel + GST + {current.platform === 'swiggy' ? 'Assure' : 'Other'}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[11px] text-indigo-200 flex items-center gap-1">
                      <Calculator className="w-3.5 h-3.5 text-indigo-300" />
                      Calculated Net Payout
                    </span>
                    <div className="text-lg font-mono font-black text-indigo-200">
                      {formatINR(current.calculatedNetPayout)}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateCurrent((prev) => ({
                          ...prev,
                          actualBankSettlement: prev.calculatedNetPayout,
                        }))
                      }
                      className="text-[10px] font-bold text-emerald-300 hover:text-emerald-200 underline cursor-pointer"
                    >
                      Copy to Final Net Payout →
                    </button>
                  </div>

                  <div className="bg-white/10 p-3 rounded-xl border border-emerald-400/40">
                    <label className="block text-[11px] font-bold text-emerald-300 mb-1">
                      Final Net Payout (Bank Settlement ₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={current.actualBankSettlement}
                      onChange={(e) =>
                        handleNumberChange('actualBankSettlement', e.target.value)
                      }
                      className="w-full bg-slate-950/80 border border-emerald-400/50 rounded-lg px-3 py-1.5 font-mono text-base font-black text-emerald-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
                    />
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">Formula Diff:</span>
                      <span
                        className={`font-mono font-bold ${
                          Math.abs(current.settlementDifference) <= 10
                            ? 'text-emerald-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {formatINR(current.settlementDifference)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Confirming persists {drafts.length > 1 ? `all ${drafts.length} statements` : 'this statement'} into{' '}
              <code className="font-mono text-[11px] bg-slate-200/80 px-1.5 py-0.5 rounded">
                platform_payout_reconciliation
              </code>{' '}
              and updates the POS Reconciliation Matrix.
            </span>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmAll}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Persisting to Supabase...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {mode === 'create'
                      ? `Confirm & Save ${drafts.length > 1 ? `(${drafts.length})` : ''} to Supabase`
                      : 'Save Updated Statement to Supabase'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
