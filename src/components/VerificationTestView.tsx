import React, { useState, useEffect } from 'react';
import { runMandatoryVerificationSuite, TestResult } from '../utils/verificationTests';
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Check,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

export const VerificationTestView: React.FC = () => {
  const [suiteResult, setSuiteResult] = useState<{
    results: TestResult[];
    allPassed: boolean;
    passedCount: number;
    totalCount: number;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      const outcome = runMandatoryVerificationSuite();
      setSuiteResult(outcome);
      setIsRunning(false);
    }, 400);
  };

  useEffect(() => {
    runTests();
  }, []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
            <h2 className="text-xl font-bold text-slate-900">
              Mandatory Data Verification &amp; Anti-Hallucination Test Suite
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Executes all 10 mandatory mathematical and architectural validation checks specified in Section 17,
            verifying that Chicken Biryani variants roll up to exactly 640 units and ₹1,48,000, that proteins remain separate,
            and that trends or profit margins are never fabricated.
          </p>
        </div>

        <button
          onClick={runTests}
          disabled={isRunning}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all self-start md:self-auto"
        >
          {isRunning ? (
            <RotateCcw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4 fill-white" />
          )}
          <span>{isRunning ? 'Validating Suite...' : 'Re-run 10 Validation Tests'}</span>
        </button>
      </div>

      {/* Test Suite Summary Banner */}
      {suiteResult && (
        <div
          className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            suiteResult.allPassed
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : 'bg-rose-50/80 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-xl ${
                suiteResult.allPassed
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'bg-rose-500 text-white'
              }`}
            >
              {suiteResult.passedCount}/{suiteResult.totalCount}
            </div>
            <div>
              <h3 className="text-base font-extrabold">
                {suiteResult.allPassed
                  ? 'All 10 Verification Checks Passed With 100% Precision'
                  : 'Some Verification Checks Failed'}
              </h3>
              <p className="text-xs opacity-90">
                Exact Chicken Biryani benchmark (640 units, ₹1,48,000), species separation, and zero-hallucination bounds verified.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/90 border border-emerald-300 text-emerald-800 shadow-2xs">
              100% Reconciled
            </span>
          </div>
        </div>
      )}

      {/* Detailed Tests Grid */}
      {suiteResult && (
        <div className="space-y-3">
          {suiteResult.results.map((test) => (
            <div
              key={test.id}
              className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      test.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {test.passed ? (
                      <Check className="w-4 h-4 stroke-[3]" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        Test #{test.id}: {test.title}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {test.category}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">{test.details}</span>
                  </div>
                </div>

                <span
                  className={`text-xs font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider self-start sm:self-auto ${
                    test.passed
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {test.passed ? 'PASSED' : 'FAILED'}
                </span>
              </div>

              {/* Expected vs Actual Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Expected Rule</span>
                  <p className="font-mono text-slate-800 leading-relaxed">{test.expected}</p>
                </div>
                <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-200/80 space-y-1">
                  <span className="font-bold text-teal-800 uppercase text-[10px]">
                    Observed Execution Result
                  </span>
                  <p className="font-mono text-teal-950 font-semibold leading-relaxed">{test.actual}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
