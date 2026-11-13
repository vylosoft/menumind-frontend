/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AggregatorBrandOutletMapping } from '../types/finance';

const STORAGE_KEY_AGGREGATOR_MAPPINGS = 'menumind_aggregator_restaurant_mappings_v1';

/**
 * Official Aggregator Restaurant ID -> Brand & Outlet Location Mapping Table
 *
 * Swiggy:
 *  - Banglar Jhale Jhole | Restaurant ID: 762173  | Outlet: Banaswadi
 *  - Banglar Jhale Jhole | Restaurant ID: 881519  | Outlet: Whitefield
 *  - Niraamish           | Restaurant ID: 1174333 | Outlet: Banaswadi
 *  - Niraamish           | Restaurant ID: 1332609 | Outlet: Whitefield
 *
 * Zomato:
 *  - Banglar Jhale Jhole | Restaurant ID: 20794526 | Outlet: Banaswadi
 *  - Banglar Jhale Jhole | Restaurant ID: 21176453 | Outlet: Whitefield
 *  - Niraamish           | Restaurant ID: 22042748 | Outlet: Banaswadi
 *  - Niraamish           | Restaurant ID: 22550600 | Outlet: Whitefield
 *
 * Ownly:
 *  - Banglar Jhale Jhole | Restaurant ID: RN421127 | Outlet: Banaswadi
 *  - Banglar Jhale Jhole | Restaurant ID: RN421125 | Outlet: Whitefield (Banglar Jhale Jhole -W)
 */
export const DEFAULT_AGGREGATOR_MAPPINGS: AggregatorBrandOutletMapping[] = [
  {
    id: 'map-swiggy-762173',
    platform: 'swiggy',
    restaurantId: '762173',
    brandName: 'Banglar Jhale Jhole',
    outletId: 'banaswadi',
    isDefault: true,
    notes: 'Swiggy · Banglar Jhale Jhole · Banaswadi Outlet',
  },
  {
    id: 'map-swiggy-881519',
    platform: 'swiggy',
    restaurantId: '881519',
    brandName: 'Banglar Jhale Jhole',
    outletId: 'whitefield',
    isDefault: true,
    notes: 'Swiggy · Banglar Jhale Jhole · Whitefield Outlet',
  },
  {
    id: 'map-swiggy-1174333',
    platform: 'swiggy',
    restaurantId: '1174333',
    brandName: 'Niraamish',
    outletId: 'banaswadi',
    isDefault: true,
    notes: 'Swiggy · Niraamish · Banaswadi Outlet',
  },
  {
    id: 'map-swiggy-1332609',
    platform: 'swiggy',
    restaurantId: '1332609',
    brandName: 'Niraamish',
    outletId: 'whitefield',
    isDefault: true,
    notes: 'Swiggy · Niraamish · Whitefield Outlet',
  },
  {
    id: 'map-zomato-20794526',
    platform: 'zomato',
    restaurantId: '20794526',
    brandName: 'Banglar Jhale Jhole',
    outletId: 'banaswadi',
    isDefault: true,
    notes: 'Zomato · Banglar Jhale Jhole · Banaswadi Outlet',
  },
  {
    id: 'map-zomato-21176453',
    platform: 'zomato',
    restaurantId: '21176453',
    brandName: 'Banglar Jhale Jhole',
    outletId: 'whitefield',
    isDefault: true,
    notes: 'Zomato · Banglar Jhale Jhole · Whitefield Outlet',
  },
  {
    id: 'map-zomato-22042748',
    platform: 'zomato',
    restaurantId: '22042748',
    brandName: 'Niraamish',
    outletId: 'banaswadi',
    isDefault: true,
    notes: 'Zomato · Niraamish · Banaswadi Outlet',
  },
  {
    id: 'map-zomato-22550600',
    platform: 'zomato',
    restaurantId: '22550600',
    brandName: 'Niraamish',
    outletId: 'whitefield',
    isDefault: true,
    notes: 'Zomato · Niraamish · Whitefield Outlet',
  },
  {
    id: 'map-ownly-RN421127',
    platform: 'ownly',
    restaurantId: 'RN421127',
    brandName: 'Banglar Jhale Jhole',
    outletId: 'banaswadi',
    isDefault: true,
    notes: 'Ownly · Banglar Jhale Jhole · Banaswadi Outlet',
  },
  {
    id: 'map-ownly-RN421125',
    platform: 'ownly',
    restaurantId: 'RN421125',
    brandName: 'Banglar Jhale Jhole',
    outletId: 'whitefield',
    isDefault: true,
    notes: 'Ownly · Banglar Jhale Jhole (-W) · Whitefield Outlet',
  },
];

/**
 * Merges custom/cloud mappings with guaranteed baseline mappings so the 10 core IDs are always present
 * unless explicitly overridden by restaurantId + platform.
 */
export function mergeWithDefaultMappings(
  custom: AggregatorBrandOutletMapping[]
): AggregatorBrandOutletMapping[] {
  const mapByKey = new Map<string, AggregatorBrandOutletMapping>();
  for (const d of DEFAULT_AGGREGATOR_MAPPINGS) {
    mapByKey.set(`${d.platform.toLowerCase()}|${d.restaurantId.trim()}`, d);
  }
  for (const item of custom || []) {
    if (!item?.restaurantId) continue;
    const normPlatform = (item.platform || 'swiggy').toLowerCase() as 'swiggy' | 'zomato' | 'ownly';
    const normOutlet = (item.outletId || 'banaswadi').toLowerCase().includes('white')
      ? 'whitefield'
      : 'banaswadi';
    const key = `${normPlatform}|${String(item.restaurantId).trim()}`;
    mapByKey.set(key, {
      ...item,
      id: item.id || `map-${normPlatform}-${String(item.restaurantId).trim()}`,
      platform: normPlatform,
      restaurantId: String(item.restaurantId).trim(),
      brandName: (item.brandName || 'Banglar Jhale Jhole').trim(),
      outletId: normOutlet,
    });
  }
  return Array.from(mapByKey.values());
}

export function getSavedAggregatorMappings(): AggregatorBrandOutletMapping[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AGGREGATOR_MAPPINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return mergeWithDefaultMappings(parsed);
      }
    }
  } catch (err) {
    console.warn('Could not read aggregator mappings from localStorage:', err);
  }
  return [...DEFAULT_AGGREGATOR_MAPPINGS];
}

export function saveAggregatorMappings(mappings: AggregatorBrandOutletMapping[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_AGGREGATOR_MAPPINGS, JSON.stringify(mappings));
  } catch (err) {
    console.error('Could not save aggregator mappings to localStorage:', err);
  }
}

export function resetAggregatorMappingsToDefault(): AggregatorBrandOutletMapping[] {
  saveAggregatorMappings(DEFAULT_AGGREGATOR_MAPPINGS);
  return [...DEFAULT_AGGREGATOR_MAPPINGS];
}

/**
 * Scans a filename or spreadsheet cell string for any mapped Restaurant ID.
 * Uses strict non-digit boundaries so e.g. '762173' matches 'payout_762173_oct.xlsx',
 * 'Swiggy-762173.xlsx', '(762173)', '762173.csv', etc., without partial false-positives.
 */
export function detectAggregatorMappingFromText(
  text: string,
  mappings: AggregatorBrandOutletMapping[] = getSavedAggregatorMappings(),
  hintPlatform?: 'swiggy' | 'zomato' | 'ownly'
): AggregatorBrandOutletMapping | null {
  if (!text) return null;
  const source = String(text);

  // Sort by longest restaurantId first so 8-digit IDs match before shorter substrings
  const sorted = [...mappings].sort((a, b) => b.restaurantId.length - a.restaurantId.length);

  const buildIdRegex = (rawId: string): RegExp => {
    const clean = rawId.trim();
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const startsAlpha = /^[a-zA-Z]/.test(clean);
    const endsAlpha = /[a-zA-Z]$/.test(clean);
    const leftBound = startsAlpha ? '(?:^|[^a-zA-Z0-9])' : '(?:^|[^0-9])';
    const rightBound = endsAlpha ? '(?:$|[^a-zA-Z0-9])' : '(?:$|[^0-9])';
    return new RegExp(`${leftBound}${escaped}${rightBound}`, 'i');
  };

  // Pass 1: if hintPlatform is given, prefer exact platform + ID match
  if (hintPlatform) {
    for (const m of sorted) {
      if (m.platform !== hintPlatform) continue;
      if (buildIdRegex(m.restaurantId).test(source)) return m;
    }
  }

  // Pass 2: match any configured Restaurant ID across all platforms
  for (const m of sorted) {
    if (buildIdRegex(m.restaurantId).test(source)) return m;
  }

  return null;
}

/**
 * Extracts a candidate Restaurant ID (Ownly RN\d{4,10} or numeric 6 to 9 digits) from filename
 * if not yet in mapping table (excluding 8-digit YYYYMMDD / DDMMYYYY dates).
 */
export function extractCandidateRestaurantIdFromFilename(fileName: string): string | undefined {
  const base = fileName.replace(/\.[^.]+$/, '');
  const rnMatch = base.match(/(?:^|[^a-zA-Z0-9])(RN\d{4,10})(?:$|[^0-9])/i);
  if (rnMatch) {
    return rnMatch[1].toUpperCase();
  }
  const tokens = base.match(/\d{6,9}/g) || [];
  for (const tok of tokens) {
    // Skip YYYYMMDD date patterns like 20250101..20291231 or DDMMYYYY like 01102026..31122029
    if (/^202\d(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(tok)) continue;
    if (/^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])202\d$/.test(tok)) continue;
    return tok;
  }
  return undefined;
}
