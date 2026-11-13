import zlib from 'zlib';
import { GoogleGenAI, Type } from '@google/genai';

export type ServerUnit = 'g' | 'kg' | 'ml' | 'l' | 'litre' | 'piece' | 'pc' | 'tbsp' | 'tsp';

export function normalizeServerUnit(raw?: string): ServerUnit {
  const clean = String(raw || 'g').toLowerCase().replace(/\./g, '').trim();
  if (clean === 'kg' || clean === 'kgs' || clean === 'kilogram' || clean === 'kilograms') return 'kg';
  if (clean === 'g' || clean === 'gm' || clean === 'gms' || clean === 'gram' || clean === 'grams') return 'g';
  if (clean === 'l' || clean === 'ltr' || clean === 'ltrs' || clean === 'liter' || clean === 'liters') return 'l';
  if (clean === 'litre' || clean === 'litres') return 'litre';
  if (clean === 'ml' || clean === 'milliliter' || clean === 'millilitre') return 'ml';
  if (clean === 'tbsp' || clean === 'tablespoon' || clean === 'tablespoons') return 'tbsp';
  if (clean === 'tsp' || clean === 'teaspoon' || clean === 'teaspoons') return 'tsp';
  if (clean === 'pc' || clean === 'pcs') return 'pc';
  if (
    clean === 'piece' ||
    clean === 'pieces' ||
    clean === 'no' ||
    clean === 'nos' ||
    clean === 'unit' ||
    clean === 'units' ||
    clean === 'portion' ||
    clean === 'portions' ||
    clean === 'plate' ||
    clean === 'pkt' ||
    clean === 'pack'
  ) {
    return 'piece';
  }
  return 'g';
}

/**
 * Deterministic fallback extractor for uncompressed or FlateDecode text streams in PDFs
 */
export function extractTextFromPdfBuffer(pdfBuffer: Buffer): string {
  const chunks: string[] = [];
  const rawLatin = pdfBuffer.toString('latin1');

  const decodePdfLiteralStrings = (content: string) => {
    const tjRegex = /\((?:\\.|[^\\)])*\)\s*Tj/g;
    let m: RegExpExecArray | null;
    while ((m = tjRegex.exec(content)) !== null) {
      const inner = m[0].replace(/\)\s*Tj$/, '').slice(1);
      chunks.push(
        inner
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, ' ')
          .replace(/\\t/g, ' ')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\')
      );
    }

    const tjArrRegex = /\[(.*?)\]\s*TJ/gs;
    while ((m = tjArrRegex.exec(content)) !== null) {
      const arrBody = m[1];
      const strParts: string[] = [];
      const litRegex = /\((?:\\.|[^\\)])*\)/g;
      let sm: RegExpExecArray | null;
      while ((sm = litRegex.exec(arrBody)) !== null) {
        strParts.push(
          sm[0]
            .slice(1, -1)
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\')
        );
      }
      if (strParts.length > 0) {
        chunks.push(strParts.join(''));
      }
    }
  };

  decodePdfLiteralStrings(rawLatin);

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let sm: RegExpExecArray | null;
  while ((sm = streamRegex.exec(rawLatin)) !== null) {
    try {
      const compressed = Buffer.from(sm[1], 'latin1');
      const inflated = zlib.inflateSync(compressed).toString('latin1');
      decodePdfLiteralStrings(inflated);
    } catch {
      // Ignore non-zlib streams (e.g. embedded images/fonts)
    }
  }

  return chunks.join('\n').replace(/[^\x20-\x7E\n₹]/g, ' ');
}

export function parseIngredientsFromPlainText(text: string): {
  ingredients: any[];
  packagingCost: number;
  cookingFuelCost: number;
  directLaborCost: number;
  otherVariableCost: number;
  batchYieldServings: number;
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3);

  const ingredients: any[] = [];
  let packagingCost = 0;
  let cookingFuelCost = 0;
  let directLaborCost = 0;
  let otherVariableCost = 0;
  let batchYieldServings = 1;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const yieldMatch = lower.match(/(?:yield|servings?|portions?)\s*[:=-]?\s*(\d+(?:\.\d+)?)/);
    if (yieldMatch && lower.length < 40) {
      const y = parseFloat(yieldMatch[1]);
      if (y >= 1 && y <= 500) batchYieldServings = y;
      continue;
    }
    if (
      /^(total|sub\s*total|grand\s*total|net\s*cost|recipe\s*cost|food\s*cost|s\.?\s*no|item\s+name|ingredient\s+qty)/i.test(
        lower
      )
    ) {
      continue;
    }
    if (lower.includes('packaging') || lower.includes('container')) {
      const num = line.match(/(\d+(?:\.\d+)?)\s*$/);
      if (num) packagingCost += parseFloat(num[1]) || 0;
      continue;
    }
    if (lower.includes('fuel') || lower.includes('gas cost')) {
      const num = line.match(/(\d+(?:\.\d+)?)\s*$/);
      if (num) cookingFuelCost += parseFloat(num[1]) || 0;
      continue;
    }
    if (lower.includes('labor') || lower.includes('labour')) {
      const num = line.match(/(\d+(?:\.\d+)?)\s*$/);
      if (num) directLaborCost += parseFloat(num[1]) || 0;
      continue;
    }

    const rowMatch = line.match(
      /^(?:\d+[.)]\s*)?([A-Za-z][A-Za-z0-9\s()&/'-]{1,45}?)\s*[-–:|]?\s*(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gms|grams?|ml|l|ltr|litre|pc|pcs|pieces?|nos?|tbsp|tsp|portion|pkt)?\b.*?(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*$/i
    );
    if (rowMatch) {
      const name = rowMatch[1].replace(/[-–:|]+$/, '').trim();
      const qty = parseFloat(rowMatch[2]) || 1;
      const unit = normalizeServerUnit(rowMatch[3] || 'g');
      const cost = parseFloat(rowMatch[4]) || 0;
      if (name && cost >= 0) {
        ingredients.push({
          name,
          quantity: qty,
          unit,
          purchasePrice: cost,
          purchasePackSize: qty,
          purchasePackUnit: unit,
          yieldPct: 100,
          directPortionCost: cost,
          calculatedCostPerPortion: cost,
        });
      }
    }
  }

  return {
    ingredients,
    packagingCost,
    cookingFuelCost,
    directLaborCost,
    otherVariableCost,
    batchYieldServings,
  };
}

export async function parseRecipeBomFromPdf(params: {
  dishName?: string;
  fileName?: string;
  pdfBase64: string;
  ai: GoogleGenAI | null;
}): Promise<{
  dishName: string;
  dishTitleInPdf: string;
  sourcePdfName: string;
  batchYieldServings: number;
  ingredients: any[];
  totalIngredientCost: number;
  packagingCost: number;
  cookingFuelCost: number;
  directLaborCost: number;
  otherVariableCost: number;
  totalVariableCostPerPortion: number;
  reportedTotalUnitCostInr: number;
}> {
  const cleanBase64 = params.pdfBase64.replace(/^data:application\/pdf;base64,/i, '').trim();
  const pdfBuffer = Buffer.from(cleanBase64, 'base64');
  if (pdfBuffer.length === 0) {
    throw new Error('Uploaded PDF file appears to be empty.');
  }

  let extractedPayload: any = null;

  if (params.ai) {
    const systemInstruction = `You are a precision Indian restaurant Recipe Costing & Bill of Materials (BOM) auditor.
Extract every ingredient row, quantity, measurement unit, rate/pack cost, and exact line cost in INR (₹) from the attached Recipe PDF for the dish "${params.dishName || 'Selected Dish'}".
RULES:
1. Extract ALL raw food ingredients listed in the recipe PDF. Do not invent ingredients not present in the PDF.
2. Normalize units to one of: "g", "kg", "ml", "l", "piece", "tbsp", "tsp".
3. For each ingredient, provide "portionCostInr" = exact cost in ₹ of the quantity used in this recipe/batch. If the PDF gives bulk rate (e.g. ₹320 per 1 kg) and recipe quantity (e.g. 150 g), compute portionCostInr = 48.00 and populate purchasePrice=320, purchasePackSize=1, purchasePackUnit="kg". If the PDF only gives quantity and line cost (e.g. 150 g = ₹18.00), set portionCostInr=18.00, purchasePrice=18.00, purchasePackSize=150, purchasePackUnit="g".
4. If packaging, fuel/gas, direct labor, or other overhead costs are listed separately in the PDF, extract their per-portion ₹ values; otherwise set them to 0.
5. Set batchYieldServings to the number of portions/servings the recipe yields (default 1 if for 1 portion/thali/plate).`;

    const prompt = `Read this Recipe Costing / Bill of Materials PDF ("${params.fileName || 'recipe.pdf'}") for dish "${params.dishName || ''}" and return all ingredients and costs as structured JSON.`;

    let lastErr: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await params.ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: cleanBase64,
                },
              },
              {
                text: prompt,
              },
            ],
          },
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                dishTitleInPdf: {
                  type: Type.STRING,
                  description: 'Dish name or title found in the PDF.',
                },
                batchYieldServings: {
                  type: Type.NUMBER,
                  description: 'Number of portions/servings produced by this recipe batch (default 1).',
                },
                packagingCostPerPortion: {
                  type: Type.NUMBER,
                  description: 'Packaging cost per 1 unit/portion in INR if listed, else 0.',
                },
                cookingFuelCostPerPortion: {
                  type: Type.NUMBER,
                  description: 'Fuel/gas cost per 1 unit/portion in INR if listed, else 0.',
                },
                directLaborCostPerPortion: {
                  type: Type.NUMBER,
                  description: 'Direct labor cost per 1 unit/portion in INR if listed, else 0.',
                },
                otherVariableCostPerPortion: {
                  type: Type.NUMBER,
                  description: 'Any other variable cost per 1 unit/portion in INR if listed, else 0.',
                },
                reportedTotalUnitCostInr: {
                  type: Type.NUMBER,
                  description: 'Total 1-unit recipe cost in INR reported in the PDF.',
                },
                ingredients: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING, description: 'Ingredient name.' },
                      quantity: { type: Type.NUMBER, description: 'Quantity used in recipe.' },
                      unit: { type: Type.STRING, description: 'Unit: g, kg, ml, l, piece, tbsp, or tsp.' },
                      purchasePrice: { type: Type.NUMBER, description: 'Purchase pack rate in INR.' },
                      purchasePackSize: { type: Type.NUMBER, description: 'Purchase pack size.' },
                      purchasePackUnit: { type: Type.STRING, description: 'Purchase pack unit.' },
                      yieldPct: { type: Type.NUMBER, description: 'Edible yield percentage (default 100).' },
                      portionCostInr: { type: Type.NUMBER, description: 'Exact cost in INR for this ingredient in the recipe.' },
                      notes: { type: Type.STRING, description: 'Optional prep notes.' },
                    },
                    required: ['name', 'quantity', 'unit', 'portionCostInr'],
                  },
                },
              },
              required: ['ingredients', 'batchYieldServings'],
            },
          },
        });

        const jsonText = (response.text ?? '{}').trim();
        extractedPayload = JSON.parse(jsonText);
        break;
      } catch (err: any) {
        lastErr = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    }

    if (!extractedPayload && lastErr) {
      console.warn('Gemini PDF parse error, attempting deterministic PDF text fallback:', lastErr?.message);
    }
  }

  if (!extractedPayload) {
    const plainText = extractTextFromPdfBuffer(pdfBuffer);
    const fallback = parseIngredientsFromPlainText(plainText);
    if (fallback.ingredients.length === 0) {
      const err: any = new Error(
        params.ai
          ? 'Could not extract recognizable ingredient and cost rows from this PDF. Please verify the PDF contains an ingredient table with costs.'
          : 'GEMINI_API_KEY is not configured in Secrets and no plain-text ingredient table could be read from this PDF.'
      );
      err.statusCode = 422;
      throw err;
    }
    extractedPayload = {
      dishTitleInPdf: params.dishName || params.fileName || 'Recipe PDF',
      batchYieldServings: fallback.batchYieldServings,
      packagingCostPerPortion: fallback.packagingCost,
      cookingFuelCostPerPortion: fallback.cookingFuelCost,
      directLaborCostPerPortion: fallback.directLaborCost,
      otherVariableCostPerPortion: fallback.otherVariableCost,
      ingredients: fallback.ingredients,
    };
  }

  const batchYield = Math.max(1, Number(extractedPayload.batchYieldServings) || 1);
  const rawIngs = Array.isArray(extractedPayload.ingredients) ? extractedPayload.ingredients : [];

  const normalizedIngredients = rawIngs
    .filter((ing: any) => ing && String(ing.name || '').trim().length > 0)
    .map((ing: any, index: number) => {
      const qty = Math.max(0.001, Number(ing.quantity) || 1);
      const unit = normalizeServerUnit(ing.unit);
      const lineCost = Math.max(
        0,
        Math.round(
          (Number(ing.portionCostInr ?? ing.calculatedCostPerPortion ?? ing.purchasePrice ?? 0) || 0) * 100
        ) / 100
      );

      const hasValidBulkPack =
        Number(ing.purchasePrice) > 0 &&
        Number(ing.purchasePackSize) > 0 &&
        normalizeServerUnit(ing.purchasePackUnit || unit) === unit &&
        Math.abs((qty / Number(ing.purchasePackSize)) * Number(ing.purchasePrice) - lineCost) < 0.5;

      const packPrice = hasValidBulkPack ? Number(ing.purchasePrice) : lineCost;
      const packSize = hasValidBulkPack ? Number(ing.purchasePackSize) : qty;
      const packUnit = hasValidBulkPack ? normalizeServerUnit(ing.purchasePackUnit) : unit;

      return {
        id: `pdf-ing-${Date.now()}-${index}`,
        name: String(ing.name).trim(),
        quantity: qty,
        unit,
        purchasePrice: packPrice,
        purchasePackSize: packSize,
        purchasePackUnit: packUnit,
        yieldPct: Math.min(100, Math.max(1, Number(ing.yieldPct) || 100)),
        preparationLossPct: 0,
        directPortionCost: lineCost,
        calculatedCostPerPortion: lineCost,
        notes: ing.notes ? String(ing.notes).trim() : undefined,
      };
    });

  const sumBatchIngredients = normalizedIngredients.reduce(
    (sum: number, item: any) => sum + (Number(item.calculatedCostPerPortion) || 0),
    0
  );
  const ingredientCostPerUnit = Math.round((sumBatchIngredients / batchYield) * 100) / 100;
  const packagingCost = Math.max(0, Math.round((Number(extractedPayload.packagingCostPerPortion) || 0) * 100) / 100);
  const cookingFuelCost = Math.max(0, Math.round((Number(extractedPayload.cookingFuelCostPerPortion) || 0) * 100) / 100);
  const directLaborCost = Math.max(0, Math.round((Number(extractedPayload.directLaborCostPerPortion) || 0) * 100) / 100);
  const otherVariableCost = Math.max(
    0,
    Math.round((Number(extractedPayload.otherVariableCostPerPortion) || 0) * 100) / 100
  );
  const totalVariableCostPerPortion =
    Math.round((ingredientCostPerUnit + packagingCost + cookingFuelCost + directLaborCost + otherVariableCost) * 100) /
    100;

  return {
    dishName: params.dishName || extractedPayload.dishTitleInPdf || 'Dish Recipe',
    dishTitleInPdf: extractedPayload.dishTitleInPdf || params.dishName || params.fileName || 'Recipe PDF',
    sourcePdfName: params.fileName || 'recipe.pdf',
    batchYieldServings: batchYield,
    ingredients: normalizedIngredients,
    totalIngredientCost: ingredientCostPerUnit,
    packagingCost,
    cookingFuelCost,
    directLaborCost,
    otherVariableCost,
    totalVariableCostPerPortion,
    reportedTotalUnitCostInr: Number(extractedPayload.reportedTotalUnitCostInr) || totalVariableCostPerPortion,
  };
}
