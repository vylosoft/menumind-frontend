import { GroupingRule } from '../types/restaurant';

// Known size and portion variant markers (ordered from longest to shortest to avoid partial matches)
export const KNOWN_VARIANTS = [
  'standard',
  'regular',
  'special',
  'light',
  'small',
  'large',
  'medium',
  'half',
  'full',
  'quarter',
  'mini',
  'jumbo',
  'single',
  'double',
  'triple',
  '1 piece',
  '2 piece',
  '1 pieces',
  '2 pieces',
  '1 pc',
  '2 pcs',
  '3 pcs',
  '4 pcs',
  '100g',
  '150g',
  '200g',
  '250g',
  '300g',
  '400g',
  '500g',
  '1kg',
  'plate',
  'bowl',
  'box',
  'combo',
  'dine-in',
  'delivery',
  'takeaway',
  'extra mutton',
  'extra chicken',
  'single chicken',
  'double chicken',
  'single egg single chicken',
  'awadhi style',
];

// Prefixes that can be stripped if requested and safe
export const COMMON_PREFIXES = [
  'kolkata ',
  'bengali ',
  'special ',
  'chef special ',
  'dhaba ',
  'signature ',
  'hyderabadi ',
  'lucknowi ',
  'royal ',
  'authentic ',
  'classic ',
];

// Distinct dish pairs that MUST NEVER be merged automatically
const PROHIBITED_MERGES: [RegExp, RegExp][] = [
  [/chicken biryani/i, /mutton biryani/i],
  [/chicken biryani/i, /fried rice/i],
  [/chicken roll/i, /egg chicken roll/i],
  [/chicken roll/i, /paneer roll/i],
  [/rohu kalia/i, /katla kalia/i],
  [/shorshe ilish/i, /ilish jhol/i],
  [/veg thali/i, /non-veg/i],
  [/veg thali/i, /chicken thali/i],
  [/veg thali/i, /fish thali/i],
  [/paneer/i, /chicken/i],
  [/mutton/i, /chicken/i],
  [/fish/i, /chicken/i],
  [/fish/i, /mutton/i],
  [/rohu/i, /katla/i],
];

export function canMergeSafely(dishA: string, dishB: string): boolean {
  const normA = dishA.toLowerCase().trim();
  const normB = dishB.toLowerCase().trim();
  if (normA === normB) return true;

  for (const [reA, reB] of PROHIBITED_MERGES) {
    if ((reA.test(normA) && reB.test(normB)) || (reB.test(normA) && reA.test(normB))) {
      return false;
    }
  }
  return true;
}

// Local storage key for persistent user-approved dictionary
const LOCAL_STORAGE_KEY = 'menumind_dish_grouping_rules_v1';

export function getSavedGroupingRules(): GroupingRule[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to load saved grouping rules from storage', err);
  }
  return [];
}

export function saveGroupingRules(rules: GroupingRule[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(rules));
  } catch (err) {
    console.error('Failed to save grouping rules to storage', err);
  }
}

export interface NormalizationResult {
  rawName: string;
  parentDishName: string;
  variantName: string;
  confidence: number; // 0 - 100
  matchType: 'deterministic' | 'dictionary' | 'fuzzy' | 'ai' | 'manual';
  notes?: string;
}

/**
 * Normalizes a raw Petpooja item name into parent dish and variant name
 */
export function normalizeDishName(
  rawItem: string,
  rawVariantFromPos?: string,
  userRules: GroupingRule[] = [],
  options: { stripPrefixes?: boolean } = { stripPrefixes: true }
): NormalizationResult {
  const cleanRaw = rawItem.trim();

  // 1. Check user manual rules first (highest precedence)
  const exactRule = userRules.find(
    (r) => r.pattern.toLowerCase().trim() === cleanRaw.toLowerCase() && r.isUserApproved
  );
  if (exactRule) {
    return {
      rawName: cleanRaw,
      parentDishName: exactRule.parentDishName,
      variantName: exactRule.variantName || 'Regular',
      confidence: 100,
      matchType: exactRule.matchType || 'manual',
      notes: 'User custom approved mapping',
    };
  }

  // If POS already had an explicit variant column and it has a value
  let explicitVariant = rawVariantFromPos?.trim() || '';
  let workingName = cleanRaw;

  // 2. Pattern extraction for separators: " - ", " / ", " (", ")", " : ", etc.
  let extractedVariant = '';
  const separatorMatch = workingName.match(/^(.*?)(?:\s*[-–—/:]\s*|\s*\((.*?)\)|\s*\[(.*?)\])(.*)$/i);
  if (separatorMatch) {
    const mainPart = separatorMatch[1].trim();
    const candidateVariant = (separatorMatch[2] || separatorMatch[3] || separatorMatch[4] || '').trim();

    if (candidateVariant) {
      // Check if candidate variant matches known variant keywords
      const lowerCandidate = candidateVariant.toLowerCase();
      const isKnown = KNOWN_VARIANTS.some((kv) => lowerCandidate.includes(kv));
      if (isKnown || lowerCandidate.length <= 15) {
        workingName = mainPart;
        extractedVariant = candidateVariant;
      }
    }
  }

  // 3. Suffix check: e.g. "Chicken Biryani Light" or "Rohu Kalia Half"
  if (!extractedVariant) {
    for (const v of KNOWN_VARIANTS) {
      const regex = new RegExp(`\\b${v}\\b$`, 'i');
      if (regex.test(workingName)) {
        extractedVariant = workingName.match(regex)![0];
        workingName = workingName.replace(regex, '').trim();
        break;
      }
    }
  }

  // 4. Handle prefix stripping (e.g. "Kolkata Chicken Biryani" -> "Chicken Biryani")
  let strippedPrefix = '';
  if (options.stripPrefixes) {
    const lowerWorking = workingName.toLowerCase();
    for (const pref of COMMON_PREFIXES) {
      if (lowerWorking.startsWith(pref)) {
        const potentialStem = workingName.substring(pref.length).trim();
        // Guard: don't strip if it leaves something too short or destroys meaning
        if (potentialStem.length >= 4) {
          strippedPrefix = pref.trim();
          workingName = potentialStem;
          break;
        }
      }
    }
  }

  // Clean up punctuation and spacing
  workingName = workingName
    .replace(/^[-–—/:\s]+|[-–—/:\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalize nicely: Title Case
  const parentDishName = toTitleCase(workingName);
  const finalVariantName = explicitVariant || extractedVariant ? toTitleCase(explicitVariant || extractedVariant) : 'Regular';

  // Calculate confidence score
  let confidence = 85;
  if (extractedVariant || explicitVariant) {
    confidence = 95;
  }
  if (strippedPrefix) {
    confidence = Math.max(confidence - 5, 80);
  }

  return {
    rawName: cleanRaw,
    parentDishName,
    variantName: finalVariantName,
    confidence,
    matchType: extractedVariant ? 'deterministic' : 'dictionary',
    notes: extractedVariant ? `Extracted variant "${finalVariantName}"` : undefined,
  };
}

export function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => {
      if (word.length === 0) return '';
      // keep small words lowercase unless first
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
