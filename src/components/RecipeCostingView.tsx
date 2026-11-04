import React, { useState, useMemo } from 'react';
import { DishRecipe, MeasurementUnit, RecipeIngredient } from '../types/recipe';
import { ParentDish } from '../types/restaurant';
import { computeRecipeTotalCost } from '../utils/recipeCalculator';
import { formatINR } from '../utils/formatters';
import {
  ChefHat,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  Scale,
  DollarSign,
  Package,
  Flame,
  Info,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface RecipeCostingViewProps {
  recipes: DishRecipe[];
  parentDishes: ParentDish[];
  onUpdateRecipes: (recipes: DishRecipe[]) => void;
}

export const RecipeCostingView: React.FC<RecipeCostingViewProps> = ({
  recipes,
  parentDishes,
  onUpdateRecipes,
}) => {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(
    recipes[2]?.id || recipes[0]?.id || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<DishRecipe | null>(null);

  // New Ingredient form inside recipe editor
  const [newIngName, setNewIngName] = useState('');
  const [newIngQty, setNewIngQty] = useState<number>(100);
  const [newIngUnit, setNewIngUnit] = useState<MeasurementUnit>('g');
  const [newIngPrice, setNewIngPrice] = useState<number>(200);
  const [newIngPackSize, setNewIngPackSize] = useState<number>(1);
  const [newIngPackUnit, setNewIngPackUnit] = useState<MeasurementUnit>('kg');
  const [newIngYield, setNewIngYield] = useState<number>(100);

  // Recipe upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const selectedRecipe = useMemo(() => {
    return recipes.find((r) => r.id === selectedRecipeId) || recipes[0];
  }, [recipes, selectedRecipeId]);

  const filteredRecipes = useMemo(() => {
    return recipes.filter(
      (r) =>
        r.parentDishName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.variantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.recipeName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [recipes, searchQuery]);

  const handleStartEdit = (recipe: DishRecipe) => {
    setEditingRecipe(JSON.parse(JSON.stringify(recipe)));
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!editingRecipe) return;
    const computed = computeRecipeTotalCost(editingRecipe);
    const updated = recipes.map((r) => (r.id === computed.id ? computed : r));
    onUpdateRecipes(updated);
    setIsEditing(false);
    setEditingRecipe(null);
  };

  const handleAddIngredient = () => {
    if (!editingRecipe || !newIngName.trim()) return;
    const newIngredient: RecipeIngredient = {
      id: `ing-${Date.now()}`,
      name: newIngName.trim(),
      quantity: newIngQty,
      unit: newIngUnit,
      purchasePrice: newIngPrice,
      purchasePackSize: newIngPackSize,
      purchasePackUnit: newIngPackUnit,
      yieldPct: newIngYield,
      preparationLossPct: 0,
      calculatedCostPerPortion: 0,
    };
    const updatedIngs = [...editingRecipe.ingredients, newIngredient];
    const updatedRecipe = computeRecipeTotalCost({
      ...editingRecipe,
      ingredients: updatedIngs,
    });
    setEditingRecipe(updatedRecipe);
    setNewIngName('');
    setNewIngQty(100);
  };

  const handleRemoveIngredient = (ingId: string) => {
    if (!editingRecipe) return;
    const updatedIngs = editingRecipe.ingredients.filter((i) => i.id !== ingId);
    const updatedRecipe = computeRecipeTotalCost({
      ...editingRecipe,
      ingredients: updatedIngs,
    });
    setEditingRecipe(updatedRecipe);
  };

  // Recipe Excel/CSV file upload parser
  const handleUploadRecipeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

      if (rawRows.length === 0) {
        setUploadMessage('Uploaded file has no recognizable data rows.');
        return;
      }

      // Group rows by Parent Dish + Variant
      const recipeGroupMap = new Map<string, RecipeIngredient[]>();
      const recipeMetaMap = new Map<string, { parent: string; variant: string; name: string }>();

      rawRows.forEach((row) => {
        const parent = String(row['Parent Dish'] || row['Dish'] || row['Item Name'] || 'Chef Special').trim();
        const variant = String(row['Variant'] || row['Variation'] || 'Standard').trim();
        const ingName = String(row['Ingredient Name'] || row['Ingredient'] || 'Item').trim();
        const qty = parseFloat(String(row['Quantity'] || 100)) || 100;
        const unit = (String(row['Unit'] || 'g').toLowerCase().trim()) as MeasurementUnit;
        const price = parseFloat(String(row['Purchase Price'] || row['Cost'] || 100)) || 100;
        const packSize = parseFloat(String(row['Pack Size'] || 1)) || 1;
        const packUnit = (String(row['Pack Unit'] || 'kg').toLowerCase().trim()) as MeasurementUnit;
        const yieldPct = parseFloat(String(row['Yield %'] || 100)) || 100;

        const key = `${parent.toLowerCase()}||${variant.toLowerCase()}`;
        if (!recipeGroupMap.has(key)) {
          recipeGroupMap.set(key, []);
          recipeMetaMap.set(key, { parent, variant, name: `${parent} (${variant})` });
        }

        recipeGroupMap.get(key)!.push({
          id: `up-ing-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: ingName,
          quantity: qty,
          unit,
          purchasePrice: price,
          purchasePackSize: packSize,
          purchasePackUnit: packUnit,
          yieldPct,
          preparationLossPct: 0,
          calculatedCostPerPortion: 0,
        });
      });

      const parsedRecipes: DishRecipe[] = [];
      recipeGroupMap.forEach((ingredients, key) => {
        const meta = recipeMetaMap.get(key)!;
        const draft: DishRecipe = {
          id: `rcp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          parentDishName: meta.parent,
          variantName: meta.variant,
          recipeName: meta.name,
          batchYieldServings: 1,
          ingredients,
          totalIngredientCost: 0,
          packagingCost: 10,
          cookingFuelCost: 5,
          directLaborCost: 10,
          otherVariableCost: 5,
          totalVariableCostPerPortion: 0,
        };
        parsedRecipes.push(computeRecipeTotalCost(draft));
      });

      // Merge into existing recipes
      const merged = [...recipes];
      parsedRecipes.forEach((pr) => {
        const existingIdx = merged.findIndex(
          (r) =>
            r.parentDishName.toLowerCase() === pr.parentDishName.toLowerCase() &&
            r.variantName.toLowerCase() === pr.variantName.toLowerCase()
        );
        if (existingIdx >= 0) {
          merged[existingIdx] = pr;
        } else {
          merged.push(pr);
        }
      });

      onUpdateRecipes(merged);
      setUploadMessage(`Successfully imported ${parsedRecipes.length} recipes!`);
      setShowUploadModal(false);
    } catch (err: any) {
      console.error(err);
      setUploadMessage(err?.message || 'Failed to process recipe spreadsheet');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold border border-teal-300 mb-1.5">
            <ChefHat className="w-3.5 h-3.5 text-teal-700" />
            Module 1: Recipe Costing &amp; Unit Economics
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Dish Recipe Costing &amp; Ingredient Economics
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
            Calculates exact quantity-weighted food costs per portion using purchasing pack sizes, edible yield adjustments,
            and preparation loss percentages. Connects at the individual variant level.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Recipe File (.xlsx, .csv)</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleUploadRecipeFile}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {uploadMessage && (
        <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-center justify-between">
          <span>{uploadMessage}</span>
          <button onClick={() => setUploadMessage(null)} className="text-slate-400 hover:text-slate-600">
            &times;
          </button>
        </div>
      )}

      {/* Main Layout: Left Recipe Selector (1 Col) & Right Recipe Card Detail (2 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recipe List */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Configured Recipes ({recipes.length})
            </h3>
            <span className="text-[11px] text-slate-400">Variant-level</span>
          </div>

          <input
            type="text"
            placeholder="Search dish or variant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-teal-500"
          />

          <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
            {filteredRecipes.map((r) => {
              const isSelected = r.id === selectedRecipeId;
              const isBiryani = r.parentDishName.toLowerCase().includes('biryani');

              return (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedRecipeId(r.id);
                    setIsEditing(false);
                  }}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-teal-50/80 border-teal-400 ring-1 ring-teal-500/20 font-semibold'
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 truncate">{r.parentDishName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-700">
                      {r.variantName}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{r.ingredients.length} ingredients</span>
                    <span className="font-extrabold text-slate-900">
                      {formatINR(r.totalVariableCostPerPortion)}/portion
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Recipe Card Breakdown & Ingredient Inspector */}
        <div className="lg:col-span-2 space-y-4">
          {selectedRecipe && !isEditing ? (
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-5">
              {/* Recipe Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-extrabold text-slate-900">
                      {selectedRecipe.parentDishName} — {selectedRecipe.variantName}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-100 text-teal-800">
                      Servings: {selectedRecipe.batchYieldServings}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedRecipe.recipeName}</p>
                </div>

                <button
                  onClick={() => handleStartEdit(selectedRecipe)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs border border-slate-300 transition-colors self-start sm:self-auto"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Recipe &amp; Costs</span>
                </button>
              </div>

              {/* Cost Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Ingredient Cost
                  </span>
                  <span className="text-lg font-extrabold text-slate-900 block mt-1">
                    {formatINR(selectedRecipe.totalIngredientCost)}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {selectedRecipe.ingredients.length} items
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Packaging Cost
                  </span>
                  <span className="text-lg font-extrabold text-slate-900 block mt-1">
                    {formatINR(selectedRecipe.packagingCost)}
                  </span>
                  <span className="text-[10px] text-slate-500">Containers, cutlery, box</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Fuel &amp; Variable Labor
                  </span>
                  <span className="text-lg font-extrabold text-slate-900 block mt-1">
                    {formatINR(selectedRecipe.cookingFuelCost + selectedRecipe.directLaborCost)}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Gas: {formatINR(selectedRecipe.cookingFuelCost)} &bull; Labor: {formatINR(selectedRecipe.directLaborCost)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-teal-50/80 border border-teal-200">
                  <span className="text-teal-700 block text-[10px] uppercase font-bold">
                    Total Variable Cost
                  </span>
                  <span className="text-lg font-extrabold text-teal-950 block mt-1">
                    {formatINR(selectedRecipe.totalVariableCostPerPortion)}
                  </span>
                  <span className="text-[10px] text-teal-700 font-semibold">per portion</span>
                </div>
              </div>

              {/* Ingredients Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                  <span>Ingredient Bill of Materials (BOM)</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Calculated with Edible Yield % and Prep Loss
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Ingredient</th>
                        <th className="py-2.5 px-3 text-right">Portion Qty</th>
                        <th className="py-2.5 px-3 text-right">Purchase Price</th>
                        <th className="py-2.5 px-3 text-center">Edible Yield %</th>
                        <th className="py-2.5 px-3 text-right font-extrabold text-teal-950">
                          Portion Cost
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedRecipe.ingredients.map((ing) => (
                        <tr key={ing.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{ing.name}</td>
                          <td className="py-2.5 px-3 text-right text-slate-700 font-mono">
                            {ing.quantity} {ing.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600">
                            {formatINR(ing.purchasePrice)} / {ing.purchasePackSize} {ing.purchasePackUnit}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                              {ing.yieldPct}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">
                            {formatINR(ing.calculatedCostPerPortion)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-3 text-slate-800">
                          Subtotal Ingredient Cost per Portion:
                        </td>
                        <td className="py-2.5 px-3 text-right text-teal-900 text-sm font-extrabold">
                          {formatINR(selectedRecipe.totalIngredientCost)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          ) : editingRecipe ? (
            /* Recipe Editor Mode */
            <div className="bg-white rounded-xl p-6 border border-teal-300 shadow-md space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Editing Recipe: {editingRecipe.parentDishName} ({editingRecipe.variantName})
                  </h3>
                  <span className="text-xs text-slate-500">Update ingredients, pack prices, and packaging</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white shadow-xs"
                  >
                    Save Changes
                  </button>
                </div>
              </div>

              {/* Variable Overheads Inputs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block text-[11px]">Packaging Cost (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editingRecipe.packagingCost}
                    onChange={(e) =>
                      setEditingRecipe(
                        computeRecipeTotalCost({
                          ...editingRecipe,
                          packagingCost: parseFloat(e.target.value) || 0,
                        })
                      )
                    }
                    className="w-full p-2 border border-slate-300 rounded-lg font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block text-[11px]">Fuel Cost (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editingRecipe.cookingFuelCost}
                    onChange={(e) =>
                      setEditingRecipe(
                        computeRecipeTotalCost({
                          ...editingRecipe,
                          cookingFuelCost: parseFloat(e.target.value) || 0,
                        })
                      )
                    }
                    className="w-full p-2 border border-slate-300 rounded-lg font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block text-[11px]">Direct Labor (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editingRecipe.directLaborCost}
                    onChange={(e) =>
                      setEditingRecipe(
                        computeRecipeTotalCost({
                          ...editingRecipe,
                          directLaborCost: parseFloat(e.target.value) || 0,
                        })
                      )
                    }
                    className="w-full p-2 border border-slate-300 rounded-lg font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block text-[11px]">Batch Yield (Servings)</label>
                  <input
                    type="number"
                    min="1"
                    value={editingRecipe.batchYieldServings}
                    onChange={(e) =>
                      setEditingRecipe(
                        computeRecipeTotalCost({
                          ...editingRecipe,
                          batchYieldServings: parseInt(e.target.value, 10) || 1,
                        })
                      )
                    }
                    className="w-full p-2 border border-slate-300 rounded-lg font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Editable Ingredients Table */}
              <div className="space-y-3">
                <span className="font-bold text-slate-900 text-xs block">Current Ingredients</span>
                <div className="space-y-2">
                  {editingRecipe.ingredients.map((ing) => (
                    <div
                      key={ing.id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs gap-3"
                    >
                      <div className="flex-1 font-semibold text-slate-900">{ing.name}</div>
                      <div className="text-slate-600 font-mono text-[11px]">
                        {ing.quantity} {ing.unit} @ {formatINR(ing.purchasePrice)}/{ing.purchasePackSize} {ing.purchasePackUnit}
                      </div>
                      <div className="font-bold text-teal-800 font-mono">
                        {formatINR(ing.calculatedCostPerPortion)}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredient(ing.id)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add New Ingredient Subform */}
                <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-200 space-y-2 text-xs">
                  <span className="font-bold text-teal-900 block text-[11px]">Add New Ingredient</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="Ingredient Name"
                      value={newIngName}
                      onChange={(e) => setNewIngName(e.target.value)}
                      className="p-1.5 border border-slate-300 rounded bg-white text-slate-900"
                    />
                    <div className="flex gap-1">
                      <input
                        type="number"
                        placeholder="Qty"
                        value={newIngQty}
                        onChange={(e) => setNewIngQty(parseFloat(e.target.value) || 0)}
                        className="w-20 p-1.5 border border-slate-300 rounded bg-white text-slate-900"
                      />
                      <select
                        value={newIngUnit}
                        onChange={(e) => setNewIngUnit(e.target.value as any)}
                        className="p-1.5 border border-slate-300 rounded bg-white text-slate-900"
                      >
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="l">l</option>
                        <option value="piece">pc</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">₹</span>
                      <input
                        type="number"
                        placeholder="Price"
                        value={newIngPrice}
                        onChange={(e) => setNewIngPrice(parseFloat(e.target.value) || 0)}
                        className="w-full p-1.5 border border-slate-300 rounded bg-white text-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddIngredient}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-10 border border-slate-200 shadow-xs text-center space-y-4">
              <ChefHat className="w-12 h-12 text-slate-300 mx-auto" />
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="font-bold text-slate-800 text-base">No Recipes Configured Yet</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Upload an ingredient Excel/CSV spreadsheet or create recipe definitions to track exact quantity-weighted portion costs, packaging, and edible yields.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
