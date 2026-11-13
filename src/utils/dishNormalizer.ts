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

// Local storage key for persistent user-approved dictionary & confirmation state
const LOCAL_STORAGE_KEY = 'menumind_dish_grouping_rules_v1';
const GROUPING_CONFIRMED_KEY = 'menumind_dish_grouping_confirmed_v1';
const RECIPES_STORAGE_KEY = 'menumind_recipes_v1';

export function getSavedGroupingRules(): GroupingRule[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((r: any) => r && (r.pattern || r.rawPattern) && r.parentDishName)
          .map((r: any) => ({
            id: r.id || `rule-${Math.random().toString(36).slice(2, 8)}`,
            pattern: r.pattern || r.rawPattern,
            parentDishName: r.parentDishName,
            variantName: r.variantName || r.targetVariantName || 'Regular',
            isUserApproved: r.isUserApproved !== undefined ? Boolean(r.isUserApproved) : Boolean(r.isApproved ?? true),
            confidence: Number(r.confidence) || 100,
            matchType: r.matchType || 'manual',
            notes: r.notes,
          }));
      }
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

export function getSavedDishGroupingConfirmed(): boolean {
  try {
    return localStorage.getItem(GROUPING_CONFIRMED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveDishGroupingConfirmed(confirmed: boolean): void {
  try {
    localStorage.setItem(GROUPING_CONFIRMED_KEY, confirmed ? 'true' : 'false');
  } catch (err) {
    console.error('Failed to save dish grouping confirmation flag', err);
  }
}

export function getSavedRecipesFromStorage<T = any>(): T[] {
  try {
    const raw = localStorage.getItem(RECIPES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Failed to load saved recipes from storage', err);
  }
  return [];
}

export function saveRecipesToStorage<T = any>(recipes: T[]): void {
  try {
    localStorage.setItem(RECIPES_STORAGE_KEY, JSON.stringify(recipes));
  } catch (err) {
    console.error('Failed to save recipes to storage', err);
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
 * Expands safe POS abbreviations/typos without altering protein identity
 * e.g. "Vg Thali 2pc Roti and Rice" -> "Veg Thali 2pc Roti and Rice"
 */
function expandPosAbbreviations(input: string): string {
  return input
    .replace(/\bnon[\s-]*vg\.?\b/gi, 'Non Veg')
    .replace(/\bvg\.?\b/gi, 'Veg')
    .replace(/\bveg\.\b/gi, 'Veg')
    .replace(/\bchk\.?\b/gi, 'Chicken')
    .replace(/\bchkn\.?\b/gi, 'Chicken')
    .replace(/\bmtn\.?\b/gi, 'Mutton')
    .replace(/\bpnr\.?\b/gi, 'Paneer')
    .replace(/\bspcl\.?\b/gi, 'Special')
    .replace(/\bspl\.?\b/gi, 'Special')
    .replace(/\s+/g, ' ')
    .trim();
}

// Accompaniment & combo variation suffix patterns (ordered from most specific to general)
const ACCOMPANIMENT_SUFFIX_PATTERNS: RegExp[] = [
  // e.g. "2pc Roti and Rice", "4 Pcs Luchi & Aloor Dom", "2 Roti with Rice", "3pc Paratha and Rice"
  /\s+(\d+\s*(?:pcs?|pieces?)?\s*(?:roti|chapati|phulka|luchi|paratha|porota|naan|kulcha|puri|kochuri|radhaballavi)(?:\s*(?:and|&|\+|with|\/)\s*(?:steamed\s+|plain\s+|basmati\s+)?(?:rice|pulao|polao|dal|sabzi|gravy|[a-z0-9\s]+))?)$/i,
  // e.g. "Rice and 2pc Roti", "Rice & 2 Roti", "Rice + Luchi"
  /\s+((?:steamed\s+|plain\s+)?(?:rice|pulao|polao)\s*(?:and|&|\+|with|\/)\s*\d*\s*(?:pcs?|pieces?)?\s*(?:roti|chapati|phulka|luchi|paratha|porota|naan|kulcha|puri|kochuri))$/i,
  // e.g. "Only Rice", "Only Roti", "Only Luchi", "Rice Only", "Roti Only"
  /\s+(only\s+(?:steamed\s+|plain\s+)?(?:rice|roti|chapati|luchi|paratha|porota|gravy|fish|chicken|mutton)|(?:rice|roti|luchi|paratha|gravy)\s+only)$/i,
  // e.g. "With Rice", "With 2pc Roti and Rice", "With Luchi", "With Basanti Pulao"
  /\s+(with\s+(?:\d+\s*(?:pcs?|pieces?)\s+)?(?:steamed\s+|plain\s+|basanti\s+)?(?:rice|roti|chapati|luchi|paratha|porota|naan|pulao|polao)(?:\s*(?:and|&|\+)\s*[a-z0-9\s]+)?)$/i,
  // e.g. "Without Onion Garlic", "Without Rice"
  /\s+(without\s+(?:onion\s*(?:and|&)?\s*garlic|rice|roti|egg))$/i,
  // e.g. "Chicken Kosha 4pc", "Paneer Tikka 6pcs", "Rosogolla 2pc"
  /\s+(\d+\s*(?:pcs?|pieces?))$/i,
  // e.g. "250ml", "500ml", "750ml", "650ml"
  /\s+(\d+\s*(?:g|gm|gms|kg|ml|ltr|l))$/i,
];

const VARIANT_HINT_KEYWORDS = [
  ...KNOWN_VARIANTS,
  'only rice',
  'rice only',
  'only roti',
  'roti',
  'chapati',
  'luchi',
  'paratha',
  'porota',
  'naan',
  'with rice',
  'without',
  'pc',
  'pcs',
  'piece',
  'pieces',
];

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
    (r) => (r.pattern || '').toLowerCase().trim() === cleanRaw.toLowerCase() && r.isUserApproved
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

  // Expand POS typos/shorthand safely ("Vg Thali" -> "Veg Thali")
  let explicitVariant = rawVariantFromPos?.trim() || '';
  let workingName = expandPosAbbreviations(cleanRaw);

  // 2. Pattern extraction for separators: " - ", " / ", " (", ")", " : ", etc.
  let extractedVariant = '';
  const separatorMatch = workingName.match(/^(.*?)(?:\s*[-–—/:]\s*|\s*\((.*?)\)|\s*\[(.*?)\])(.*)$/i);
  if (separatorMatch) {
    const mainPart = separatorMatch[1].trim();
    const candidateVariant = (separatorMatch[2] || separatorMatch[3] || separatorMatch[4] || '').trim();

    if (candidateVariant && mainPart.length >= 3) {
      const lowerCandidate = candidateVariant.toLowerCase();
      const isKnown = VARIANT_HINT_KEYWORDS.some((kv) => lowerCandidate.includes(kv));
      if (isKnown || lowerCandidate.length <= 18) {
        workingName = mainPart;
        extractedVariant = candidateVariant;
      }
    }
  }

  // 3. Accompaniment & count variation suffix check
  // Handles e.g. "Veg Thali Only Rice" & "Vg Thali 2pc Roti and Rice" -> Parent: "Veg Thali"
  if (!extractedVariant) {
    for (const pattern of ACCOMPANIMENT_SUFFIX_PATTERNS) {
      const match = workingName.match(pattern);
      if (match && match[1] && match.index !== undefined) {
        const stem = workingName.slice(0, match.index).trim();
        const stemWords = stem.split(/\s+/).filter(Boolean);
        const isStandaloneSingleWordOk =
          stemWords.length >= 2 ||
          /^(biryani|thali|khichuri|polao|pulao|rosogolla|sandesh|rasmalai|gulabjamun|payesh|mishti|samosa|kachori|singara|chop|cutlet|roll|chowmein|noodles|momos|lassi)$/i.test(
            stem
          );
        if (stem.replace(/[-–—/:\s]/g, '').length >= 3 && isStandaloneSingleWordOk) {
          extractedVariant = match[1].trim();
          workingName = stem;
          break;
        }
      }
    }
  }

  // 4. Known suffix check: e.g. "Chicken Biryani Light" or "Rohu Kalia Half"
  if (!extractedVariant) {
    for (const v of KNOWN_VARIANTS) {
      const regex = new RegExp(`\\b${v}\\b$`, 'i');
      if (regex.test(workingName)) {
        const stem = workingName.replace(regex, '').trim();
        if (!stem.replace(/[-–—/:\s]/g, '') || /^(veg|non veg|chicken|mutton|fish|egg|paneer)$/i.test(stem)) {
          break;
        }
        extractedVariant = workingName.match(regex)![0];
        workingName = stem;
        break;
      }
    }
  }

  // 5. Handle prefix stripping (e.g. "Kolkata Chicken Biryani" -> "Chicken Biryani")
  let strippedPrefix = '';
  if (options.stripPrefixes) {
    const lowerWorking = workingName.toLowerCase();
    for (const pref of COMMON_PREFIXES) {
      if (lowerWorking.startsWith(pref)) {
        const potentialStem = workingName.substring(pref.length).trim();
        if (potentialStem.length >= 5 && !/^(thali|combo|meal|platter|curry)$/i.test(potentialStem)) {
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
  const isGenericExplicitVariant = /^(regular|standard|default|none|na|n\/a|-)$/i.test(explicitVariant);
  const chosenVariant =
    extractedVariant && (!explicitVariant || isGenericExplicitVariant)
      ? extractedVariant
      : explicitVariant || extractedVariant;
  const finalVariantName = chosenVariant ? toTitleCase(chosenVariant) : 'Regular';

  // Calculate confidence score
  let confidence = 85;
  if (extractedVariant || (explicitVariant && !isGenericExplicitVariant)) {
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
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
