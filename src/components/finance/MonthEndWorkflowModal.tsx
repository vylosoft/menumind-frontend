/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { MonthEndCloseStep } from '../../types/finance';
import {
  X,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Calendar,
  Lock,
} from 'lucide-react';

interface MonthEndWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  steps: MonthEndCloseStep[];
  onToggleStep: (stepId: number) => void;
  onCertifyMonth: () => void;
}

export const MonthEndWorkflowModal: React.FC<MonthEndWorkflowModalProps> = ({
  isOpen,
  onClose,
  steps,
  onToggleStep,
  onCertifyMonth,
}) => {
  if (!isOpen) return null;

  const completedCount = steps.filter((s) => s.isCompleted).length;
  const progressPct = Math.round((completedCount / steps.length) * 100);
  const isFullyComplete = completedCount === steps.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Audit Protocol
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> October 2026 Close
              </span>
            </div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              13-Step Month-End Financial Close Checklist
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Systematic procedure ensuring complete reconciliation between Petpooja POS, aggregator settlements, and kitchen ledgers.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-800">
              {completedCount} of {steps.length} Steps Completed
            </span>
            <div className="w-48 h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              ></div>
            </div>
          </div>
          <span className="font-bold text-emerald-700">{progressPct}% Certified</span>
        </div>

        {/* Checklist Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-3 divide-y divide-slate-100 flex-1">
          {steps.map((step) => (
            <div
              key={step.id}
              onClick={() => onToggleStep(step.id)}
              className="pt-3 first:pt-0 flex items-start gap-3 cursor-pointer group"
            >
              <div className="pt-0.5">
                <input
                  type="checkbox"
                  checked={step.isCompleted}
                  onChange={() => {}} // handled by parent div
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
              </div>

              <div className="flex-1 text-xs">
                <div className="flex items-center justify-between">
                  <span
                    className={`font-bold ${
                      step.isCompleted
                        ? 'text-slate-900 line-through opacity-80'
                        : 'text-slate-900 group-hover:text-emerald-700'
                    }`}
                  >
                    {step.id}. {step.title}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600">
                    {step.category}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            {isFullyComplete ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> All verification gates satisfied
              </span>
            ) : (
              <span>{steps.length - completedCount} verification steps remaining</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => {
                onCertifyMonth();
                onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer font-bold"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Certify &amp; Lock October 2026 P&amp;L</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
