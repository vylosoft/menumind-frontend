import { appUrl } from '../lib/appUrl';
import React, { useState, useMemo, useEffect } from 'react';
import { DishRecipe, MeasurementUnit, RecipeIngredient } from '../types/recipe';
import { GroupingRule, ParentDish } from '../types/restaurant';
import { computeRecipeTotalCost, normalizeMeasurementUnit } from '../utils/recipeCalculator';
import { formatINR, formatNumber } from '../utils/formatters';
import {
  ChefHat,
  Plus,
  Trash2,
  Check,
  X,
  FileText,
  Upload,
  AlertCircle,
  CheckCircle2,
  FolderTree,
  Search,
  RefreshCw,
  GitMerge,
  Eye,
  Database,
  ArrowRight,
  Layers,
} from 'lucide-react';

interface RecipeCostingViewProps {
  recipes: DishRecipe[];
  parentDishes: ParentDish[];
  groupingRules?: GroupingRule[];
  isDishGroupingConfirmed?: boolean;
  onConfirmDishGrouping?: (navigateToRecipeCosting?: boolean) => void;
  onUpdateRules?: (rules: GroupingRule[]) => void;
  onUpdateRecipes: (recipes: DishRecipe[]) => void;
  onNavigateTab?: (tab: string) => void;
}

interface PendingPdfModalState {
  dish: ParentDish;
  mode: 'pdf_confirm' | 'edit_bom';
  draftRecipe: DishRecipe;
  dishTitleInPdf?: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

export const RecipeCostingView: React.FC<RecipeCostingViewProps> = ({
  recipes,
  parentDishes,
  groupingRules = [],
  isDishGroupingConfirmed = false,
  onConfirmDishGrouping,
  onUpdateRules,
  onUpdateRecipes,
  onNavigateTab,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [costFilter, setCostFilter] = useState<'all' | 'costed' | 'pending'>('all');
  const [showGroupingPreview, setShowGroupingPreview] = useState<boolean>(false);

  // Quick inline merge state inside the Dish Grouping Review panel
  const [quickMergeSourceId, setQuickMergeSourceId] = useState<string>('');
  const [quickMergeTargetId, setQuickMergeTargetId] = useState<string>('');

  // Local editable 1-unit cost inputs keyed by normalized dish name
  const [unitCostInputs, setUnitCostInputs] = useState<Record<string, string>>({});
  const [savingDishKey, setSavingDishKey] = useState<string | null>(null);
  const [savedDishBadgeKey, setSavedDishBadgeKey] = useState<string | null>(null);

  // Per-dish PDF parsing state
  const [parsingPdfDishId, setParsingPdfDishId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Recipe PDF Confirmation Popup Modal state
  const [pdfModal, setPdfModal] = useState<PendingPdfModalState | null>(null);
  const [isSubmittingModalToSupabase, setIsSubmittingModalToSupabase] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Map canonical recipe per unique Parent Dish
  const recipeByDishKey = useMemo(() => {
    const map = new Map<string, DishRecipe>();
    for (const r of recipes) {
      const key = r.parentDishName.toLowerCase().trim();
      const existing = map.get(key);
      if (
        !existing ||
        r.variantName.toLowerCase() === 'all variants' ||
        (r.ingredients.length > 0 && existing.ingredients.length === 0)
      ) {
        map.set(key, r);
      }
    }
    return map;
  }, [recipes]);

  // Synchronize text box values whenever parentDishes or recipes update
  useEffect(() => {
    setUnitCostInputs((prev) => {
      const next = { ...prev };
      for (const dish of parentDishes) {
        const key = dish.name.toLowerCase().trim();
        const rec = recipeByDishKey.get(key);
        if (rec) {
          next[key] = String(rec.totalVariableCostPerPortion);
        } else if (dish.unitCost !== undefined && dish.unitCost > 0 && next[key] === undefined) {
          next[key] = String(dish.unitCost);
        } else if (next[key] === undefined) {
          next[key] = '';
        }
      }
      return next;
    });
  }, [parentDishes, recipeByDishKey]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    parentDishes.forEach((d) => {
      if (d.category) set.add(d.category);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [parentDishes]);

  const filteredDishes = useMemo(() => {
    return parentDishes.filter((dish) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        dish.name.toLowerCase().includes(q) ||
        dish.category.toLowerCase().includes(q) ||
        dish.variants.some(
          (v) => v.rawName.toLowerCase().includes(q) || v.variantName.toLowerCase().includes(q)
        );
      const matchesCategory = selectedCategory === 'ALL' || dish.category === selectedCategory;

      const key = dish.name.toLowerCase().trim();
      const rec = recipeByDishKey.get(key);
      const hasCost = Boolean(rec && rec.totalVariableCostPerPortion > 0);
      const matchesCost =
        costFilter === 'all' ||
        (costFilter === 'costed' && hasCost) ||
        (costFilter === 'pending' && !hasCost);

      return matchesSearch && matchesCategory && matchesCost;
    });
  }, [parentDishes, searchQuery, selectedCategory, costFilter, recipeByDishKey]);

  const totalRawVariations = useMemo(
    () => parentDishes.reduce((sum, d) => sum + d.variants.length, 0),
    [parentDishes]
  );

  const multiVariantDishes = useMemo(
    () => parentDishes.filter((d) => d.variants.length > 1),
    [parentDishes]
  );

  const costedDishesCount = useMemo(() => {
    return parentDishes.filter((d) => {
      const r = recipeByDishKey.get(d.name.toLowerCase().trim());
      return Boolean(r && r.totalVariableCostPerPortion > 0);
    }).length;
  }, [parentDishes, recipeByDishKey]);

  const pdfVerifiedCount = useMemo(() => {
    return parentDishes.filter((d) => {
      const r = recipeByDishKey.get(d.name.toLowerCase().trim());
      return Boolean(r && r.ingredients.length > 0);
    }).length;
  }, [parentDishes, recipeByDishKey]);

  const upsertLocalRecipe = (updatedRecipe: DishRecipe) => {
    const targetKey = updatedRecipe.parentDishName.toLowerCase().trim();
    const filtered = recipes.filter((r) => r.parentDishName.toLowerCase().trim() !== targetKey);
    onUpdateRecipes([...filtered, updatedRecipe]);
  };

  const persistRecipeToSupabase = async (
    recipeToSave: DishRecipe,
    dish: ParentDish
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const response = await fetch(appUrl('/api/supabase/recipes/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe: recipeToSave,
          parentDish: dish,
          groupingRules,
          restaurantName: 'MenuMind Grand Dining',
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        return { ok: false, error: data.error || 'Failed to save recipe costing to Supabase' };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Network error while saving to Supabase' };
    }
  };

  // Save 1-unit price/cost directly from the right-side text box
  const handleSaveManualUnitCost = async (dish: ParentDish) => {
    const key = dish.name.toLowerCase().trim();
    const rawVal = unitCostInputs[key];
    const parsedCost = parseFloat(String(rawVal ?? '').trim());

    if (Number.isNaN(parsedCost) || parsedCost < 0) {
      setBannerMessage({
        type: 'error',
        text: `Please enter a valid 1-unit cost (₹) for "${dish.name}".`,
      });
      return;
    }

    const roundedCost = Math.round(parsedCost * 100) / 100;
    const existing = recipeByDishKey.get(key);

    let nextRecipe: DishRecipe;
    if (existing && existing.ingredients.length > 0) {
      // Adjust otherVariableCost or scale cleanly if user overrides total 1-unit cost on top of an existing BOM
      const baseBom = existing.totalIngredientCost + existing.packagingCost + existing.cookingFuelCost + existing.directLaborCost;
      const delta = Math.round((roundedCost - baseBom) * 100) / 100;
      nextRecipe = {
        ...existing,
        manualUnitCost: roundedCost,
        otherVariableCost: delta >= 0 ? delta : 0,
        totalIngredientCost: delta < 0 ? Math.max(0, Math.round((existing.totalIngredientCost + delta) * 100) / 100) : existing.totalIngredientCost,
        totalVariableCostPerPortion: roundedCost,
        lastUpdated: new Date().toISOString(),
      };
    } else {
      nextRecipe = computeRecipeTotalCost({
        id: existing?.id || `rcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        parentDishName: dish.name,
        variantName: 'All Variants',
        recipeName: `${dish.name} Standard Cost`,
        batchYieldServings: 1,
        ingredients: [],
        totalIngredientCost: roundedCost,
        packagingCost: 0,
        cookingFuelCost: 0,
        directLaborCost: 0,
        otherVariableCost: 0,
        totalVariableCostPerPortion: roundedCost,
        manualUnitCost: roundedCost,
        isManualCostOnly: true,
        lastUpdated: new Date().toISOString(),
      });
    }

    setSavingDishKey(key);
    upsertLocalRecipe(nextRecipe);
    setUnitCostInputs((prev) => ({ ...prev, [key]: String(roundedCost) }));

    const supaRes = await persistRecipeToSupabase(nextRecipe, dish);
    setSavingDishKey(null);

    if (supaRes.ok) {
      setSavedDishBadgeKey(key);
      setTimeout(() => {
        setSavedDishBadgeKey((curr) => (curr === key ? null : curr));
      }, 2500);
      setBannerMessage({
        type: 'success',
        text: `Saved 1-unit cost ${formatINR(roundedCost)} for "${dish.name}" (${dish.variants.length} POS variation${dish.variants.length > 1 ? 's' : ''}) to Supabase.`,
      });
    } else {
      setBannerMessage({
        type: 'info',
        text: `Updated 1-unit cost ${formatINR(roundedCost)} for "${dish.name}" locally (${supaRes.error}).`,
      });
    }
  };

  // Upload Recipe PDF for a specific dish -> Parse on server -> Open Confirmation Popup Modal
  const handleDishPdfUpload = async (dish: ParentDish, file?: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setBannerMessage({
        type: 'error',
        text: 'Please upload a valid PDF (.pdf) recipe sheet.',
      });
      return;
    }

    setParsingPdfDishId(dish.id);
    setBannerMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const pdfBase64 = arrayBufferToBase64(buffer);

      const response = await fetch(appUrl('/api/recipes/parse-pdf'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishName: dish.name,
          fileName: file.name,
          pdfBase64,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success || !data.parsedRecipe) {
        throw new Error(data.error || 'Failed to read ingredients and cost from the uploaded PDF.');
      }

      const parsed = data.parsedRecipe;
      const existing = recipeByDishKey.get(dish.name.toLowerCase().trim());

      const draft: DishRecipe = computeRecipeTotalCost({
        id: existing?.id || `rcp-pdf-${Date.now()}`,
        parentDishName: dish.name,
        variantName: 'All Variants',
        recipeName: `${dish.name} Recipe BOM`,
        batchYieldServings: Math.max(1, Number(parsed.batchYieldServings) || 1),
        ingredients: (parsed.ingredients || []).map((ing: any, idx: number) => {
          const qty = Math.max(0.001, Number(ing.quantity) || 1);
          const unit = normalizeMeasurementUnit(ing.unit);
          const lineCost = Math.max(0, Number(ing.calculatedCostPerPortion ?? ing.directPortionCost ?? 0) || 0);
          return {
            id: ing.id || `pdf-ing-${Date.now()}-${idx}`,
            name: String(ing.name || 'Ingredient').trim(),
            quantity: qty,
            unit,
            purchasePrice: lineCost,
            purchasePackSize: qty,
            purchasePackUnit: unit,
            yieldPct: Number(ing.yieldPct) || 100,
            preparationLossPct: 0,
            directPortionCost: lineCost,
            calculatedCostPerPortion: lineCost,
            notes: ing.notes,
          };
        }),
        totalIngredientCost: Number(parsed.totalIngredientCost) || 0,
        packagingCost: Number(parsed.packagingCost) || 0,
        cookingFuelCost: Number(parsed.cookingFuelCost) || 0,
        directLaborCost: Number(parsed.directLaborCost) || 0,
        otherVariableCost: Number(parsed.otherVariableCost) || 0,
        totalVariableCostPerPortion: Number(parsed.totalVariableCostPerPortion) || 0,
        sourcePdfName: file.name,
        isManualCostOnly: false,
        lastUpdated: new Date().toISOString(),
      });

      setModalError(null);
      setPdfModal({
        dish,
        mode: 'pdf_confirm',
        draftRecipe: draft,
        dishTitleInPdf: parsed.dishTitleInPdf,
      });
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: err?.message || `Could not parse Recipe PDF for "${dish.name}".`,
      });
    } finally {
      setParsingPdfDishId(null);
    }
  };

  // Open BOM inspector/editor popup for an existing dish
  const handleOpenBomEditor = (dish: ParentDish) => {
    const key = dish.name.toLowerCase().trim();
    const existing = recipeByDishKey.get(key);
    const draft: DishRecipe = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          id: `rcp-${Date.now()}`,
          parentDishName: dish.name,
          variantName: 'All Variants',
          recipeName: `${dish.name} Recipe BOM`,
          batchYieldServings: 1,
          ingredients: [],
          totalIngredientCost: 0,
          packagingCost: 0,
          cookingFuelCost: 0,
          directLaborCost: 0,
          otherVariableCost: 0,
          totalVariableCostPerPortion: 0,
          isManualCostOnly: false,
        };

    setModalError(null);
    setPdfModal({
      dish,
      mode: 'edit_bom',
      draftRecipe: draft,
    });
  };

  // Handlers inside the Recipe PDF Confirmation Popup Modal
  const updateModalIngredient = (
    ingId: string,
    field: 'name' | 'quantity' | 'unit' | 'portionCost',
    value: string | number
  ) => {
    if (!pdfModal) return;
    const updatedIngredients = pdfModal.draftRecipe.ingredients.map((ing) => {
      if (ing.id !== ingId) return ing;
      if (field === 'name') {
        return { ...ing, name: String(value) };
      }
      if (field === 'unit') {
        const nextUnit = normalizeMeasurementUnit(String(value));
        return {
          ...ing,
          unit: nextUnit,
          purchasePackUnit: nextUnit,
        };
      }
      if (field === 'quantity') {
        const nextQty = Math.max(0.001, Number(value) || 0.001);
        const currentCost = ing.calculatedCostPerPortion;
        return {
          ...ing,
          quantity: nextQty,
          purchasePackSize: nextQty,
          purchasePrice: currentCost,
          directPortionCost: currentCost,
        };
      }
      // portionCost edited directly
      const nextCost = Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
      return {
        ...ing,
        purchasePrice: nextCost,
        purchasePackSize: Math.max(0.001, ing.quantity || 1),
        purchasePackUnit: ing.unit,
        directPortionCost: nextCost,
        calculatedCostPerPortion: nextCost,
      };
    });

    const recomputed = computeRecipeTotalCost({
      ...pdfModal.draftRecipe,
      isManualCostOnly: false,
      ingredients: updatedIngredients,
    });

    setPdfModal({
      ...pdfModal,
      draftRecipe: recomputed,
    });
  };

  const handleAddModalIngredient = () => {
    if (!pdfModal) return;
    const newIng: RecipeIngredient = {
      id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: '',
      quantity: 100,
      unit: 'g',
      purchasePrice: 10,
      purchasePackSize: 100,
      purchasePackUnit: 'g',
      yieldPct: 100,
      preparationLossPct: 0,
      directPortionCost: 10,
      calculatedCostPerPortion: 10,
    };
    const recomputed = computeRecipeTotalCost({
      ...pdfModal.draftRecipe,
      isManualCostOnly: false,
      ingredients: [...pdfModal.draftRecipe.ingredients, newIng],
    });
    setPdfModal({ ...pdfModal, draftRecipe: recomputed });
  };

  const handleRemoveModalIngredient = (ingId: string) => {
    if (!pdfModal) return;
    const remaining = pdfModal.draftRecipe.ingredients.filter((i) => i.id !== ingId);
    const recomputed = computeRecipeTotalCost({
      ...pdfModal.draftRecipe,
      ingredients: remaining,
    });
    setPdfModal({ ...pdfModal, draftRecipe: recomputed });
  };

  const handleConfirmPdfModalAndSubmitToSupabase = async () => {
    if (!pdfModal) return;
    const cleanIngredients = pdfModal.draftRecipe.ingredients.filter(
      (i) => i.name.trim().length > 0
    );
    if (cleanIngredients.length === 0) {
      setModalError('Please include at least one ingredient row or use the 1-unit price input box.');
      return;
    }

    setIsSubmittingModalToSupabase(true);
    setModalError(null);

    const finalizedRecipe = computeRecipeTotalCost({
      ...pdfModal.draftRecipe,
      ingredients: cleanIngredients,
      manualUnitCost: undefined,
      isManualCostOnly: false,
      lastUpdated: new Date().toISOString(),
    });

    const supaRes = await persistRecipeToSupabase(finalizedRecipe, pdfModal.dish);
    setIsSubmittingModalToSupabase(false);

    if (!supaRes.ok) {
      setModalError(supaRes.error || 'Could not submit recipe to Supabase. Please check database connection.');
      return;
    }

    const key = pdfModal.dish.name.toLowerCase().trim();
    upsertLocalRecipe(finalizedRecipe);
    setUnitCostInputs((prev) => ({
      ...prev,
      [key]: String(finalizedRecipe.totalVariableCostPerPortion),
    }));
    setSavedDishBadgeKey(key);
    setTimeout(() => {
      setSavedDishBadgeKey((curr) => (curr === key ? null : curr));
    }, 3000);

    setBannerMessage({
      type: 'success',
      text: `Confirmed "${pdfModal.dish.name}" BOM (${finalizedRecipe.ingredients.length} ingredients • ${formatINR(finalizedRecipe.totalVariableCostPerPortion)} / unit) and saved to Supabase!`,
    });
    setPdfModal(null);
  };

  // Quick inline merge of two dishes inside the Dish Grouping Review panel
  const handleQuickInlineMerge = () => {
    if (!quickMergeSourceId || !quickMergeTargetId || !onUpdateRules) return;
    const sourceDish = parentDishes.find((d) => d.id === quickMergeSourceId);
    const targetDish = parentDishes.find((d) => d.id === quickMergeTargetId);
    if (!sourceDish || !targetDish || sourceDish.id === targetDish.id) return;

    const nextRules = [...groupingRules];
    sourceDish.variants.forEach((v) => {
      const idx = nextRules.findIndex((r) => r.pattern.toLowerCase() === v.rawName.toLowerCase());
      if (idx >= 0) {
        nextRules[idx] = {
          ...nextRules[idx],
          parentDishName: targetDish.name,
          isUserApproved: true,
          matchType: 'manual',
        };
      } else {
        nextRules.push({
          id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          pattern: v.rawName,
          parentDishName: targetDish.name,
          variantName: v.variantName,
          isUserApproved: true,
          confidence: 100,
          matchType: 'manual',
        });
      }
    });
    onUpdateRules(nextRules);
    setQuickMergeSourceId('');
    setQuickMergeTargetId('');
    setBannerMessage({
      type: 'success',
      text: `Merged "${sourceDish.name}" into unique dish "${targetDish.name}".`,
    });
  };

  // Empty state if no POS Highest Selling Items uploaded yet
  if (parentDishes.length === 0) {
    return (
      <div className="max-w-5xl mx-auto py-10 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-xs space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center mx-auto">
            <ChefHat className="w-7 h-7 text-teal-600" />
          </div>
          <div className="max-w-xl mx-auto space-y-2">
            <h2 className="text-xl font-extrabold text-slate-900">
              Recipe Costing &amp; BOM Matrix (POS-Driven)
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Upload your <strong>POS Highest Selling Items</strong> report first. MenuMind will automatically read
              every dish name, apply <strong>Dish Grouping</strong> to consolidate item variations (for example,{' '}
              <em>&ldquo;Veg Thali Only Rice&rdquo;</em> and <em>&ldquo;Vg Thali 2pc Roti and Rice&rdquo;</em> into{' '}
              <strong>Veg Thali</strong>), and build your Recipe Costing &amp; PDF BOM tabular matrix.
            </p>
          </div>
          {onNavigateTab && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigateTab('upload')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Go to Upload POS Highest Selling Data</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-14">
      {/* Header & KPI Summary */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 text-xs font-bold border border-teal-200 mb-1.5">
              <ChefHat className="w-3.5 h-3.5 text-teal-700" />
              POS Highest Selling Items &rarr; Dish Grouping &rarr; Recipe Costing &amp; PDF BOM
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">
              Unique Dish Recipe Costing &amp; Bill of Materials Matrix
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Derived directly from your uploaded POS Highest Selling data using Dish Grouping. Confirm unique dishes,
              enter the 1-unit cost directly on the right, or upload a Recipe PDF per dish to auto-extract ingredients
              and populate unit cost with Supabase confirmation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowGroupingPreview((prev) => !prev)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FolderTree className="w-3.5 h-3.5 text-teal-700" />
              <span>
                {showGroupingPreview || !isDishGroupingConfirmed
                  ? 'Hide Grouping Inspector'
                  : 'Inspect Grouped Variations'}
              </span>
            </button>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('grouping')}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>Full Dish Grouping Editor</span>
              </button>
            )}
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">
              POS Raw Item Variations
            </span>
            <span className="text-lg font-extrabold text-slate-900 block mt-0.5">
              {formatNumber(totalRawVariations)} POS Rows
            </span>
            <span className="text-[11px] text-slate-500">From Highest Selling upload</span>
          </div>

          <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200">
            <span className="text-[10px] font-bold uppercase text-teal-700 block">
              Unique Grouped Dishes
            </span>
            <span className="text-lg font-extrabold text-teal-950 block mt-0.5">
              {formatNumber(parentDishes.length)} Unique Dishes
            </span>
            <span className="text-[11px] text-teal-700">
              {multiVariantDishes.length} multi-variation dishes merged
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[10px] font-bold uppercase text-emerald-700 block">
              Costed Unique Dishes
            </span>
            <span className="text-lg font-extrabold text-emerald-950 block mt-0.5">
              {costedDishesCount} / {parentDishes.length}
            </span>
            <span className="text-[11px] text-emerald-700">
              {Math.round((costedDishesCount / Math.max(1, parentDishes.length)) * 100)}% unit cost coverage
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
            <span className="text-[10px] font-bold uppercase text-indigo-700 block">
              PDF Ingredient BOMs
            </span>
            <span className="text-lg font-extrabold text-indigo-950 block mt-0.5">
              {pdfVerifiedCount} Dishes
            </span>
            <span className="text-[11px] text-indigo-700">Verified &amp; synced with Supabase</span>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {bannerMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : bannerMessage.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-amber-50 border-amber-300 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {bannerMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-slate-400 hover:text-slate-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 1: Dish Grouping Review & Confirmation Panel (Shown automatically until user confirms Dish Grouping) */}
      {(!isDishGroupingConfirmed || showGroupingPreview) && (
        <div className="bg-amber-50/70 rounded-2xl p-6 border border-amber-300 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300">
                <FolderTree className="w-3.5 h-3.5 text-amber-700" />
                {isDishGroupingConfirmed
                  ? 'Confirmed Dish Grouping Overview'
                  : 'Step 1 Required: Confirm Dish Grouping Before Recipe Costing'}
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                Review Unique Dishes Consolidated from POS Variations ({parentDishes.length} Unique Dishes)
              </h3>
              <p className="text-xs text-slate-600 max-w-3xl">
                Check that POS variations belonging to the same dish (such as{' '}
                <em>&ldquo;Veg Thali Only Rice&rdquo;</em> and{' '}
                <em>&ldquo;Vg Thali 2pc Roti and Rice&rdquo;</em> &rarr; <strong>Veg Thali</strong>) are grouped
                together. Use quick merge below if any two items still need combining, then click{' '}
                <strong>Confirm Dish Grouping</strong> to unlock or refresh the Recipe Costing matrix.
              </p>
            </div>

            {onConfirmDishGrouping && (
              <button
                type="button"
                onClick={() => {
                  onConfirmDishGrouping(false);
                  setShowGroupingPreview(false);
                }}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-sm transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isDishGroupingConfirmed
                    ? `Done Reviewing (${parentDishes.length} Unique Dishes)`
                    : `Confirm Dish Grouping (${parentDishes.length} Unique Dishes)`}
                </span>
              </button>
            )}
          </div>

          {/* Quick Merge Bar */}
          {onUpdateRules && parentDishes.length > 1 && (
            <div className="bg-white rounded-xl p-3.5 border border-amber-200 flex flex-col sm:flex-row sm:items-center gap-2.5 text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5 shrink-0">
                <GitMerge className="w-3.5 h-3.5 text-teal-600" />
                Quick Merge Variations:
              </span>
              <select
                value={quickMergeSourceId}
                onChange={(e) => setQuickMergeSourceId(e.target.value)}
                className="flex-1 p-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 font-medium"
              >
                <option value="">Select duplicate/variant dish...</option>
                {parentDishes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.variants.map((v) => v.rawName).join(', ')})
                  </option>
                ))}
              </select>
              <span className="text-slate-400 font-bold text-center">into &rarr;</span>
              <select
                value={quickMergeTargetId}
                onChange={(e) => setQuickMergeTargetId(e.target.value)}
                className="flex-1 p-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 font-medium"
              >
                <option value="">Select canonical unique dish...</option>
                {parentDishes
                  .filter((d) => d.id !== quickMergeSourceId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!quickMergeSourceId || !quickMergeTargetId}
                onClick={handleQuickInlineMerge}
                className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold shrink-0 cursor-pointer"
              >
                Merge Dish
              </button>
            </div>
          )}

          {/* Grouped Dishes Preview Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
            {parentDishes.map((d) => (
              <div
                key={d.id}
                className={`p-3 rounded-xl border bg-white text-xs space-y-1.5 ${
                  d.variants.length > 1 ? 'border-teal-300 ring-1 ring-teal-500/15' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-slate-900 truncate">{d.name}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                      d.variants.length > 1
                        ? 'bg-teal-100 text-teal-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {d.variants.length} POS {d.variants.length === 1 ? 'item' : 'variations'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.variants.map((v) => (
                    <span
                      key={v.rawName}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono truncate max-w-full"
                      title={`POS Raw: ${v.rawName}`}
                    >
                      {v.variantName}: &ldquo;{v.rawName}&rdquo;
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Tabular Matrix of Uniquely Identified Dishes (Unlocked once Dish Grouping is confirmed) */}
      {isDishGroupingConfirmed && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Matrix Filter Bar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search unique dish or POS variation name..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'ALL' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>

              <div className="inline-flex rounded-xl p-0.5 bg-slate-200/70 border border-slate-300">
                {(['all', 'costed', 'pending'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCostFilter(mode)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-colors cursor-pointer ${
                      costFilter === mode
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode === 'all'
                      ? `All (${parentDishes.length})`
                      : mode === 'costed'
                      ? `Costed (${costedDishesCount})`
                      : `Pending (${parentDishes.length - costedDishesCount})`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tabular Matrix */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-[11px] uppercase tracking-wider">
                  <th className="py-3.5 px-4 font-bold w-12">#</th>
                  <th className="py-3.5 px-4 font-bold min-w-[280px]">
                    Unique Dish &amp; Grouped POS Variations
                  </th>
                  <th className="py-3.5 px-4 font-bold text-right whitespace-nowrap">
                    POS Qty &amp; Avg Price
                  </th>
                  <th className="py-3.5 px-4 font-bold min-w-[250px]">
                    Recipe PDF &amp; Ingredient BOM
                  </th>
                  <th className="py-3.5 px-4 font-bold text-right min-w-[250px]">
                    Price / Cost for 1 Unit (₹)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredDishes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      No unique dishes match your current filter.
                    </td>
                  </tr>
                ) : (
                  filteredDishes.map((dish, idx) => {
                    const key = dish.name.toLowerCase().trim();
                    const rec = recipeByDishKey.get(key);
                    const inputVal = unitCostInputs[key] ?? '';
                    const numericInputCost = parseFloat(inputVal);
                    const activeUnitCost = !Number.isNaN(numericInputCost)
                      ? numericInputCost
                      : rec?.totalVariableCostPerPortion ?? 0;
                    const foodCostPct =
                      dish.averageRealizedPrice > 0 && activeUnitCost > 0
                        ? Math.round((activeUnitCost / dish.averageRealizedPrice) * 1000) / 10
                        : null;
                    const isParsingThisPdf = parsingPdfDishId === dish.id;
                    const isSavingThisRow = savingDishKey === key;
                    const isSavedRecently = savedDishBadgeKey === key;

                    return (
                      <tr
                        key={dish.id}
                        className="hover:bg-slate-50/80 transition-colors align-top"
                      >
                        {/* # */}
                        <td className="py-3.5 px-4 font-mono text-slate-400 font-semibold">
                          {idx + 1}
                        </td>

                        {/* Left Column: Unique Dish & Grouped POS Variations */}
                        <td className="py-3.5 px-4 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-sm">
                              {dish.name}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                              {dish.category}
                            </span>
                            {dish.variants.length > 1 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-bold">
                                {dish.variants.length} Variations Grouped
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {dish.variants.map((v) => (
                              <span
                                key={v.rawName}
                                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80 font-medium"
                                title={`Raw POS Item: "${v.rawName}" • ${v.quantity} sold @ ${formatINR(v.averagePrice)}`}
                              >
                                <strong className="text-slate-900">{v.variantName}</strong>
                                <span className="text-slate-400 font-mono truncate max-w-[190px]">
                                  ({v.rawName})
                                </span>
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* POS Volume & Avg Selling Price */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {formatINR(dish.averageRealizedPrice)}
                            <span className="text-[10px] text-slate-400 font-normal"> / unit</span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatNumber(dish.totalQuantity)} sold &bull; {formatINR(dish.totalRevenue)}
                          </div>
                        </td>

                        {/* Middle Column: Per-Dish Recipe PDF Upload & BOM Actions */}
                        <td className="py-3.5 px-4 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <label
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                isParsingThisPdf
                                  ? 'bg-slate-100 text-slate-500 border-slate-300 pointer-events-none'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
                              }`}
                            >
                              {isParsingThisPdf ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                                  <span>Reading PDF...</span>
                                </>
                              ) : (
                                <>
                                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Upload Recipe PDF</span>
                                </>
                              )}
                              <input
                                type="file"
                                accept=".pdf,application/pdf"
                                disabled={isParsingThisPdf}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  void handleDishPdfUpload(dish, f);
                                }}
                                className="hidden"
                              />
                            </label>

                            {rec && rec.ingredients.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleOpenBomEditor(dish)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-teal-600" />
                                <span>BOM ({rec.ingredients.length})</span>
                              </button>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            {rec && rec.ingredients.length > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                {rec.sourcePdfName
                                  ? `PDF: ${rec.sourcePdfName}`
                                  : `${rec.ingredients.length} ingredients configured`}
                              </span>
                            ) : rec && rec.totalVariableCostPerPortion > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-semibold">
                                <Check className="w-3 h-3 text-teal-600" />
                                Manual 1-Unit Price Set
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                Upload PDF or enter 1-unit cost &rarr;
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Right Column: Text Box for 1-Unit Price / Cost (₹) */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="relative w-32">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                                ₹
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={inputVal}
                                onChange={(e) =>
                                  setUnitCostInputs((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    void handleSaveManualUnitCost(dish);
                                  }
                                }}
                                className="w-full pl-6 pr-2.5 py-1.5 text-right font-mono font-extrabold text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                              />
                            </div>

                            <button
                              type="button"
                              disabled={isSavingThisRow || inputVal.trim() === ''}
                              onClick={() => void handleSaveManualUnitCost(dish)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                isSavedRecently
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white'
                              }`}
                            >
                              {isSavingThisRow ? '...' : isSavedRecently ? 'Saved ✓' : 'Save'}
                            </button>
                          </div>

                          {foodCostPct !== null && (
                            <div className="text-right mt-1 text-[10px]">
                              <span
                                className={`font-bold ${
                                  foodCostPct > 45
                                    ? 'text-rose-600'
                                    : foodCostPct > 35
                                    ? 'text-amber-600'
                                    : 'text-emerald-700'
                                }`}
                              >
                                {foodCostPct}% Food Cost
                              </span>
                              <span className="text-slate-400">
                                {' '}
                                &bull; Margin{' '}
                                {formatINR(Math.max(0, dish.averageRealizedPrice - activeUnitCost))}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Popup Confirmation Modal Before Submitting Extracted Recipe PDF (or BOM Edits) to Supabase */}
      {pdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    {pdfModal.mode === 'pdf_confirm'
                      ? 'Confirm Extracted Recipe PDF Before Supabase Save'
                      : 'Dish Bill of Materials (BOM) Editor'}
                  </span>
                  {pdfModal.draftRecipe.sourcePdfName && (
                    <span className="text-[11px] text-slate-300 font-mono">
                      {pdfModal.draftRecipe.sourcePdfName}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-extrabold text-white mt-1">
                  {pdfModal.dish.name}{' '}
                  <span className="text-xs font-normal text-slate-300">
                    ({pdfModal.dish.variants.map((v) => v.variantName).join(', ')})
                  </span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPdfModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
              {pdfModal.mode === 'pdf_confirm' && (
                <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 flex items-start gap-2.5">
                  <FileText className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">
                      Verify Extracted Ingredients &amp; 1-Unit Cost Before Submitting to Supabase
                    </span>
                    <span className="text-[11px] text-indigo-800">
                      We extracted{' '}
                      <strong>{pdfModal.draftRecipe.ingredients.length} ingredients</strong> from{' '}
                      <strong>{pdfModal.draftRecipe.sourcePdfName}</strong>
                      {pdfModal.dishTitleInPdf ? ` ("${pdfModal.dishTitleInPdf}")` : ''}. Review or adjust any
                      quantities or costs below, then click <strong>Confirm &amp; Submit to Supabase</strong>.
                    </span>
                  </div>
                </div>
              )}

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Batch Yield & Per-Unit Variable Add-ons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Batch Yield (Units / Portions)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={pdfModal.draftRecipe.batchYieldServings}
                    onChange={(e) =>
                      setPdfModal({
                        ...pdfModal,
                        draftRecipe: computeRecipeTotalCost({
                          ...pdfModal.draftRecipe,
                          batchYieldServings: Math.max(1, parseInt(e.target.value, 10) || 1),
                        }),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Packaging / Unit (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={pdfModal.draftRecipe.packagingCost}
                    onChange={(e) =>
                      setPdfModal({
                        ...pdfModal,
                        draftRecipe: computeRecipeTotalCost({
                          ...pdfModal.draftRecipe,
                          packagingCost: Math.max(0, parseFloat(e.target.value) || 0),
                        }),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Fuel &amp; Gas / Unit (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={pdfModal.draftRecipe.cookingFuelCost}
                    onChange={(e) =>
                      setPdfModal({
                        ...pdfModal,
                        draftRecipe: computeRecipeTotalCost({
                          ...pdfModal.draftRecipe,
                          cookingFuelCost: Math.max(0, parseFloat(e.target.value) || 0),
                        }),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Direct Labor / Unit (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={pdfModal.draftRecipe.directLaborCost}
                    onChange={(e) =>
                      setPdfModal({
                        ...pdfModal,
                        draftRecipe: computeRecipeTotalCost({
                          ...pdfModal.draftRecipe,
                          directLaborCost: Math.max(0, parseFloat(e.target.value) || 0),
                        }),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Editable Extracted Ingredients Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900">
                    Ingredients &amp; Cost Breakdown ({pdfModal.draftRecipe.ingredients.length} items)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddModalIngredient}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Ingredient</span>
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Ingredient Name</th>
                        <th className="py-2.5 px-3 w-28 text-right">Quantity</th>
                        <th className="py-2.5 px-3 w-28">Unit</th>
                        <th className="py-2.5 px-3 w-36 text-right">Batch Line Cost (₹)</th>
                        <th className="py-2.5 px-3 w-12 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pdfModal.draftRecipe.ingredients.map((ing) => (
                        <tr key={ing.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={ing.name}
                              placeholder="Ingredient name"
                              onChange={(e) =>
                                updateModalIngredient(ing.id, 'name', e.target.value)
                              }
                              className="w-full px-2.5 py-1 rounded border border-slate-300 bg-white font-semibold text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={ing.quantity}
                              onChange={(e) =>
                                updateModalIngredient(ing.id, 'quantity', e.target.value)
                              }
                              className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-right font-mono text-slate-800"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={ing.unit}
                              onChange={(e) =>
                                updateModalIngredient(ing.id, 'unit', e.target.value)
                              }
                              className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-slate-800 font-medium"
                            >
                              <option value="g">g</option>
                              <option value="kg">kg</option>
                              <option value="ml">ml</option>
                              <option value="l">l</option>
                              <option value="piece">piece</option>
                              <option value="tbsp">tbsp</option>
                              <option value="tsp">tsp</option>
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={ing.calculatedCostPerPortion}
                              onChange={(e) =>
                                updateModalIngredient(ing.id, 'portionCost', e.target.value)
                              }
                              className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-right font-mono font-bold text-teal-900"
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveModalIngredient(ing.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Remove ingredient"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Computed 1-Unit Total Cost Summary */}
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800 block">
                    Auto-Calculated Cost for 1 Unit ({pdfModal.dish.name})
                  </span>
                  <span className="text-xs text-teal-700">
                    Ingredients/Unit: <strong>{formatINR(pdfModal.draftRecipe.totalIngredientCost)}</strong>
                    {' + '}Add-ons/Unit:{' '}
                    <strong>
                      {formatINR(
                        pdfModal.draftRecipe.packagingCost +
                          pdfModal.draftRecipe.cookingFuelCost +
                          pdfModal.draftRecipe.directLaborCost +
                          pdfModal.draftRecipe.otherVariableCost
                      )}
                    </strong>{' '}
                    (POS Avg Selling Price: {formatINR(pdfModal.dish.averageRealizedPrice)})
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-extrabold text-teal-950 font-mono">
                    {formatINR(pdfModal.draftRecipe.totalVariableCostPerPortion)}
                  </span>
                  <span className="text-[11px] text-teal-800 font-semibold block">
                    per 1 unit (auto-populates matrix)
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={isSubmittingModalToSupabase}
                onClick={() => setPdfModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isSubmittingModalToSupabase}
                onClick={() => void handleConfirmPdfModalAndSubmitToSupabase()}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isSubmittingModalToSupabase ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Submitting to Supabase...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>Confirm &amp; Submit to Supabase</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
