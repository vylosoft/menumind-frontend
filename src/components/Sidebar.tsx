import React from 'react';
import {
  LayoutDashboard,
  Upload,
  FolderTree,
  UtensilsCrossed,
  TrendingUp,
  Grid2X2,
  CalendarDays,
  Sparkles,
  Scissors,
  BotMessageSquare,
  FileSpreadsheet,
  CheckCircle2,
  ChevronRight,
  BookOpen,
  DollarSign,
  Calculator,
  ShieldAlert,
  Building2,
  Coins,
  Users,
  ShoppingBag,
  Landmark,
} from 'lucide-react';

export type NavTab =
  | 'overview'
  | 'finance'
  | 'purchases'
  | 'catering'
  | 'staff'
  | 'profit-center'
  | 'recipe-costing'
  | 'smart-pricing'
  | 'ingredient-risk'
  | 'operating-costs'
  | 'break-even'
  | 'upload'
  | 'grouping'
  | 'performance'
  | 'monthly'
  | 'engineering'
  | 'forecasting'
  | 'opportunities'
  | 'removal'
  | 'advisor'
  | 'reports'
  | 'verification';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  dishCount: number;
  totalRevenue: number;
  groupingMode?: 'dish' | 'outlet';
}

interface NavSection {
  title: string;
  items: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Executive Dashboards',
    items: [
      { id: 'overview', label: 'Sales Overview', icon: LayoutDashboard },
      { id: 'finance', label: 'Finance Command Center', icon: DollarSign, badge: 'P&L' },
      { id: 'purchases', label: 'Purchases & COGS', icon: ShoppingBag, badge: 'Hyperpure' },
      { id: 'catering', label: 'Bulk Catering & Events', icon: UtensilsCrossed, badge: 'Direct' },
      { id: 'staff', label: 'Staff & Wage Directory', icon: Users, badge: 'Editable' },
      { id: 'profit-center', label: 'Profitability Command Center', icon: Coins, badge: '10 KPIs' },
    ],
  },
  {
    title: 'Recipe & Unit Economics',
    items: [
      { id: 'recipe-costing', label: 'Recipe Costing & BOM', icon: BookOpen, badge: 'BOM' },
      { id: 'operating-costs', label: 'Outlet Operating Overheads', icon: Landmark, badge: '14 Costs' },
      { id: 'break-even', label: 'Break-Even Intelligence', icon: Building2, badge: 'Rent' },
      { id: 'smart-pricing', label: 'Smart Pricing & Simulator', icon: Calculator, badge: 'Pricing' },
      { id: 'ingredient-risk', label: 'Ingredient Risk Monitor', icon: ShieldAlert, badge: 'Shocks' },
    ],
  },
  {
    title: 'POS Sales & Grouping',
    items: [
      { id: 'upload', label: 'Upload POS Data', icon: Upload },
      { id: 'grouping', label: 'Dish Grouping Review', icon: FolderTree, badge: 'Crucial' },
      { id: 'performance', label: 'Dish Performance', icon: UtensilsCrossed },
      { id: 'monthly', label: 'Monthly Trends', icon: TrendingUp },
    ],
  },
  {
    title: 'Strategy & Intelligence',
    items: [
      { id: 'engineering', label: 'Menu Engineering Matrix', icon: Grid2X2 },
      { id: 'forecasting', label: 'Demand Forecasting', icon: CalendarDays },
      { id: 'opportunities', label: 'Double Down Opportunities', icon: Sparkles, badge: 'AI Action' },
      { id: 'removal', label: 'Removal Simulator', icon: Scissors },
      { id: 'advisor', label: 'AI Business CFO', icon: BotMessageSquare, badge: 'Gemini' },
      { id: 'reports', label: 'Reports & Exports', icon: FileSpreadsheet },
      { id: 'verification', label: 'Verification & Testing', icon: CheckCircle2, badge: '17/17' },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, dishCount, groupingMode = 'dish' }) => {
  return (
    <aside className="w-72 bg-slate-900 text-slate-200 flex flex-col shrink-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-teal-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-teal-500/20 font-bold text-xl">
            M
          </div>
          <div>
            <h1 className="font-bold text-white text-base tracking-tight leading-tight flex items-center gap-1.5">
              MenuMind AI
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                PRO
              </span>
            </h1>
            <p className="text-xs text-slate-400">Demand &amp; Profit Intelligence</p>
          </div>
        </div>

        {/* Core Promise Pill */}
        <div className="mt-3 p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300 font-medium leading-relaxed">
          <span className="text-amber-400 font-semibold block text-[10px] uppercase tracking-wider mb-0.5">
            Mission
          </span>
          &ldquo;Know What Sells. Understand What Earns. Decide What Stays.&rdquo;
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {section.title}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              // Dynamic title for grouping: 'Outlet Grouping' when in outlet mode vs 'Dish Grouping Review' when in highest selling mode
              const displayLabel =
                item.id === 'grouping'
                  ? groupingMode === 'outlet'
                    ? 'Outlet Grouping'
                    : 'Dish Grouping Review'
                  : item.label;
              const displayBadge =
                item.id === 'grouping'
                  ? groupingMode === 'outlet'
                    ? 'W vs B'
                    : 'Crucial'
                  : item.badge;

              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-sm font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-teal-400'
                      }`}
                    />
                    <span className="truncate">{displayLabel}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {displayBadge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : displayBadge === 'Crucial'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : displayBadge === 'W vs B'
                            ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold'
                            : item.badge === '17/17'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                        }`}
                      >
                        {displayBadge}
                      </span>
                    )}
                    <ChevronRight
                      className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                        isActive ? 'opacity-100' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Dataset Status Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Normalized Dishes
          </span>
          <span className="font-semibold text-slate-200">{dishCount} Parent Items</span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400 text-center">
          Engineered for Petpooja POS Reports
        </div>
      </div>
    </aside>
  );
};
