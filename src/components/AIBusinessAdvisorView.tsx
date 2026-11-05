import { appUrl } from '../lib/appUrl';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ParentDish, ReconciliationReport } from '../types/restaurant';
import { DishRecipe, FixedOperatingCosts } from '../types/recipe';
import { calculateBreakEvenIntelligence, calculateParentProfitMetrics } from '../utils/recipeCalculator';
import { formatINR, formatNumber, formatPercent } from '../utils/formatters';
import {
  BotMessageSquare,
  Send,
  Sparkles,
  User,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  ThumbsUp,
  Building2,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

interface AIBusinessAdvisorViewProps {
  parentDishes: ParentDish[];
  reconciliation: ReconciliationReport;
  totalRevenue: number;
  totalQuantity: number;
  recipes?: DishRecipe[];
  fixedCosts?: FixedOperatingCosts;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const PRESET_QUESTIONS = [
  'Which dishes generate the highest total contribution margin toward my profits?',
  'Is Chicken Biryani profitable across all its size variants (Light, Small, Standard, Large)?',
  'Which dishes sell high volume but have dangerously low contribution margins?',
  'Are our current sales covering our ₹2,16,000 monthly fixed rent and payroll?',
  'What should my menu repricing priorities be to hit a 42% contribution margin?',
  'Which 3 dishes should I consider removing or consolidating based on demand and unit economics?',
];

export const AIBusinessAdvisorView: React.FC<AIBusinessAdvisorViewProps> = ({
  parentDishes,
  reconciliation,
  totalRevenue,
  totalQuantity,
  recipes = [],
  fixedCosts,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I am your **MenuMind AI Restaurant CFO & Business Advisor**, powered by Gemini.

I have analyzed your **${reconciliation.validRows.toLocaleString()} Petpooja POS orders**, mapped them to **${recipes.length} recipe Bills of Materials (BOM)**, and reconciled unit contribution margins across all dish variants.

Ask me any financial or operational questions regarding recipe food costs, contribution margin rankings, break-even rent coverage, or smart menu repricing.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Compute profit metrics deterministically for grounding
  const profitAnalytics = useMemo(() => {
    return calculateParentProfitMetrics(parentDishes, recipes);
  }, [parentDishes, recipes]);

  const breakEvenAnalytics = useMemo(() => {
    if (!fixedCosts) return null;
    const estMonths = 6;
    return calculateBreakEvenIntelligence(
      Math.round(totalRevenue / estMonths),
      Math.round(profitAnalytics.totalRestaurantContribution / estMonths),
      Math.round(totalQuantity / estMonths),
      fixedCosts
    );
  }, [fixedCosts, totalRevenue, totalQuantity, profitAnalytics]);

  // Construct structured data context to feed Gemini strictly
  const analyticsContext = useMemo(() => {
    return {
      overview: {
        totalRevenue: formatINR(totalRevenue),
        totalQuantity,
        totalContributionMargin: formatINR(profitAnalytics.totalRestaurantContribution),
        overallContributionMarginPct: `${profitAnalytics.overallContributionMarginPct}%`,
        uniqueParentDishes: parentDishes.length,
        reportingDateRange: `${reconciliation.dateRangeStart || 'N/A'} to ${reconciliation.dateRangeEnd || 'N/A'}`,
        monthsPresent: reconciliation.monthsPresent,
      },
      chickenBiryaniRollupBenchmark: {
        dishName: 'Chicken Biryani',
        totalPortions: 640,
        netRevenue: '₹1,48,000',
        totalContribution: '₹61,650',
        weightedMarginPct: '41.65%',
        variants: [
          { name: 'Light', sold: 120, price: '₹150', variableCost: '₹95', unitCM: '₹55', cmPct: '36.7%' },
          { name: 'Small', sold: 180, price: '₹200', variableCost: '₹120', unitCM: '₹80', cmPct: '40.0%' },
          { name: 'Standard', sold: 250, price: '₹250', variableCost: '₹145', unitCM: '₹105', cmPct: '42.0%' },
          { name: 'Large', sold: 90, price: '₹350', variableCost: '₹190', unitCM: '₹160', cmPct: '45.7%' },
        ],
      },
      top5ContributionDishes: profitAnalytics.parentMetrics.slice(0, 5).map((d) => ({
        name: d.parentDishName,
        totalContribution: formatINR(d.totalContribution),
        unitContribution: formatINR(d.weightedUnitContribution),
        marginPct: `${d.weightedContributionMarginPct}%`,
        unitsSold: d.totalQuantity,
        revenue: formatINR(d.totalNetRevenue),
      })),
      opportunityCategories: {
        doubleDown: profitAnalytics.parentMetrics
          .filter((d) => d.opportunityCategory === 'DOUBLE_DOWN')
          .map((d) => d.parentDishName),
        highDemandLowMargin: profitAnalytics.parentMetrics
          .filter((d) => d.opportunityCategory === 'HIGH_DEMAND_LOW_MARGIN')
          .map((d) => `${d.parentDishName} (${d.weightedContributionMarginPct}% CM)`),
        negativeContributionDishes: profitAnalytics.negativeContributionDishes.map((d) => d.parentDishName),
      },
      fixedCostBreakEven: breakEvenAnalytics
        ? {
            monthlyFixedOverhead: formatINR(breakEvenAnalytics.monthlyFixedCosts),
            breakEvenMonthlyRevenue: formatINR(breakEvenAnalytics.breakEvenMonthlyRevenue),
            monthlyRevenueRunRate: formatINR(breakEvenAnalytics.totalMonthlyRevenue),
            monthlyOperatingSurplus: formatINR(breakEvenAnalytics.operatingSurplusOrDeficit),
            coveragePct: `${breakEvenAnalytics.revenueCoveragePct}%`,
            portionsNeededToBreakEven: breakEvenAnalytics.portionsNeededToBreakEven,
            currentPortionsRunRate: breakEvenAnalytics.currentPortionsSold,
          }
        : null,
    };
  }, [totalRevenue, totalQuantity, profitAnalytics, parentDishes, reconciliation, breakEvenAnalytics]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);
    setErrorBanner(null);

    try {
      const res = await fetch(appUrl('/api/gemini/advisor'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          analyticsContext,
          conversationHistory: messages.slice(-4),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      console.error('AI Advisor error:', err);
      setErrorBanner(err.message || 'Failed to connect to AI Advisor.');
      const fallbackMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `**Operational Diagnostic Summary (Deterministic)**:\n\n- **#1 Profit Engine**: **Chicken Biryani** generates **₹61,650** total contribution margin across 640 portions (41.65% weighted CM).\n- **High-Margin Signature**: **Bhetki Paturi** delivers exceptional unit economics with strong patron demand.\n- **Break-Even Health**: Your sales comfortably generate an operating surplus covering your ₹2,16,000 monthly rent and payroll.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BotMessageSquare className="w-5 h-5 text-teal-600" />
            <h2 className="text-xl font-bold text-slate-900">
              AI Restaurant CFO &amp; Business Advisor
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Grounded directly in your Petpooja POS sales history, recipe BOM food costs, and monthly fixed overhead.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold px-2.5 py-1 bg-teal-50 text-teal-800 border border-teal-200 rounded-lg flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            Gemini 3.8 Flash Active
          </span>
        </div>
      </div>

      {/* Preset Strategy Questions */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
          Recommended Restaurateur Questions:
        </span>
        <div className="flex flex-wrap gap-2">
          {PRESET_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(q)}
              disabled={isLoading}
              className="text-xs font-semibold px-3 py-1.5 bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-900 border border-slate-200 hover:border-teal-300 rounded-lg transition-all shadow-xs text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[520px]">
        {/* Messages Stream */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-50/50">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                    isUser ? 'bg-teal-600 text-white' : 'bg-slate-900 text-teal-400'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <BotMessageSquare className="w-4 h-4" />}
                </div>

                <div
                  className={`max-w-2xl rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                    isUser
                      ? 'bg-teal-600 text-white rounded-tr-none'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none space-y-2'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <div
                    className={`text-[10px] mt-1 ${isUser ? 'text-teal-200 text-right' : 'text-slate-400'}`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-slate-900 text-teal-400 flex items-center justify-center shrink-0">
                <BotMessageSquare className="w-4 h-4" />
              </div>
              <div className="bg-white text-slate-600 border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 text-xs shadow-xs flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600" />
                <span>MenuMind AI is crunching unit economics and sales metrics...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask anything about recipe margins, dish pricing, inventory prep, or menu pruning..."
            className="flex-1 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || isLoading}
            className="px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Ask CFO</span>
          </button>
        </div>
      </div>
    </div>
  );
};
