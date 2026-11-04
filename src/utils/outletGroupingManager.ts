import { RawSalesRecord } from '../types/restaurant';

export type SupportedOutlet = 'banaswadi' | 'whitefield';

/**
 * Extended detection result containing outlet, channel, clean name, and rule explanation.
 */
export interface OutletDetectionResult {
  outlet: SupportedOutlet;
  hasTrailingW: boolean;
  cleanItemName: string;
  detectedChannel?: string;
  matchedPattern?: string;
  detectionReason?: string;
}

/**
 * Trailing 'W' pattern for identifying Whitefield outlet in Petpooja exports.
 */
export const TRAILING_W_REGEX = /(?:[\s\-_/]+[wW]|\s*\([wW]\)|\s*\[[wW]\])$/;

/**
 * Intelligent Outlet Detection based on User Specification:
 * 1. Check '-' (Hyphen):
 *    - Right side of '-' is considered as Channel (e.g. Swiggy, Zomato, Ownly).
 *    - Left side of '-' check if ending with 'W' or 'w':
 *      - If YES: Map to Whitefield outlet.
 *      - If NO: Map to Banaswadi outlet.
 * 2. If NO '-' (Hyphen) found:
 *    - Check for 'Take Away' or 'Delivery':
 *      - If YES: Map to Banaswadi outlet.
 *    - Check for 'Dine-in':
 *      - If YES: Map to Whitefield outlet.
 *    - Default: Banaswadi.
 */
export function detectOutletFromItemAndRow(
  rawItem: string,
  rawVariant?: string,
  orderType?: string,
  category?: string
): OutletDetectionResult {
  const itemText = (rawItem || '').trim();
  const variantText = (rawVariant || '').trim();
  const orderTypeText = (orderType || '').trim();
  const categoryText = (category || '').trim();

  // 1. Check for hyphen '-' (or en-dash/em-dash) in the item name or variant
  const targetText = itemText || variantText;
  const hasHyphen = /[-–—]/.test(targetText);

  if (hasHyphen) {
    // Split by hyphen
    const parts = targetText.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);

    if (parts.length >= 2) {
      // Right side of the last hyphen is considered as Channel (or trailing W if ending with W)
      const rightSide = parts[parts.length - 1];
      const leftParts = parts.slice(0, parts.length - 1);
      const leftSide = leftParts.join(' - ');

      // Check if right side itself is 'W' or 'w' (e.g., "Chicken Biryani - W")
      const isRightSideW = /^[wW]$/.test(rightSide) || /\b[wW]$/.test(rightSide);

      // Check if left side is ending with 'W' or 'w'
      // Handles: "Chicken Biryani - W", "Chicken Biryani W", "Chicken Biryani (W)", "Chicken Biryani [W]"
      const isLeftSideW =
        /(?:[\s\-_/]+[wW]|\s*\([wW]\)|\s*\[[wW]\]|^[wW])$/i.test(leftSide) ||
        /\b[wW]$/i.test(leftSide) ||
        leftParts[leftParts.length - 1]?.toUpperCase() === 'W';

      // Identify channel from right side
      let channel: string | undefined = undefined;
      const lowerRight = rightSide.toLowerCase();
      if (
        lowerRight.includes('swiggy') ||
        lowerRight.includes('zomato') ||
        lowerRight.includes('ownly') ||
        lowerRight.includes('pos') ||
        lowerRight.includes('direct') ||
        lowerRight.includes('delivery') ||
        lowerRight.includes('takeaway') ||
        lowerRight.includes('dine')
      ) {
        channel = rightSide;
      } else if (!isRightSideW) {
        channel = rightSide;
      }

      if (isLeftSideW || isRightSideW) {
        // Whitefield outlet: clean item name by stripping the W and channel
        let clean = leftSide;
        clean = clean.replace(/(?:[\s\-_/]+[wW]|\s*\([wW]\)|\s*\[[wW]\])$/i, '').trim();
        if (isRightSideW) {
          clean = leftSide;
        }

        return {
          outlet: 'whitefield',
          hasTrailingW: true,
          cleanItemName: clean || leftSide || itemText,
          detectedChannel: channel,
          matchedPattern: isLeftSideW ? "Left side of '-' ends with W" : "Right side of '-' is W",
          detectionReason: isLeftSideW
            ? `Hyphen found: Left side ("${leftSide}") ends with 'W' -> Whitefield (Channel: ${rightSide})`
            : `Hyphen found: Right side is 'W' -> Whitefield`,
        };
      }

      // Hyphen found, but left side does NOT end with W -> Banaswadi
      return {
        outlet: 'banaswadi',
        hasTrailingW: false,
        cleanItemName: leftSide || itemText,
        detectedChannel: channel,
        matchedPattern: "Right side is channel; Left does not end with W",
        detectionReason: `Hyphen found: Channel "${rightSide}"; left side does not end with 'W' -> Banaswadi`,
      };
    }
  }

  // 2. NO HYPHEN '-' IN ITEM NAME:
  // "if you don't see any '-' check Take Away or Delivery, if yes map with Banaswadi and if Dine-in map with Whitefield."
  const combinedContext = `${itemText} ${variantText} ${orderTypeText} ${categoryText}`.toLowerCase();

  const isDineIn =
    combinedContext.includes('dine-in') ||
    combinedContext.includes('dine in') ||
    combinedContext.includes('dinein');

  const isTakeAwayOrDelivery =
    combinedContext.includes('take away') ||
    combinedContext.includes('takeaway') ||
    combinedContext.includes('take-away') ||
    combinedContext.includes('delivery') ||
    combinedContext.includes('parcel');

  if (isTakeAwayOrDelivery) {
    return {
      outlet: 'banaswadi',
      hasTrailingW: false,
      cleanItemName: itemText,
      matchedPattern: 'Take Away / Delivery service type',
      detectionReason: `No '-' found: matches Take Away / Delivery -> Banaswadi`,
    };
  }

  if (isDineIn) {
    return {
      outlet: 'whitefield',
      hasTrailingW: false,
      cleanItemName: itemText,
      matchedPattern: 'Dine-in service type',
      detectionReason: `No '-' found: matches Dine-in -> Whitefield`,
    };
  }

  // Check if item text has standalone trailing W (e.g. "Chicken Biryani W" or "(W)")
  if (TRAILING_W_REGEX.test(itemText)) {
    const cleanItemName = itemText.replace(TRAILING_W_REGEX, '').trim();
    return {
      outlet: 'whitefield',
      hasTrailingW: true,
      cleanItemName: cleanItemName || itemText,
      matchedPattern: 'Item name ends with W',
      detectionReason: `Ends with 'W' -> Whitefield`,
    };
  }

  // Default fallback if no hyphen and neither Takeaway/Delivery nor Dine-in: Banaswadi
  return {
    outlet: 'banaswadi',
    hasTrailingW: false,
    cleanItemName: itemText,
    matchedPattern: 'Standard default',
    detectionReason: `No '-' or service type indicator found -> default Banaswadi`,
  };
}

/**
 * Backwards-compatible convenience wrapper
 */
export function detectOutletFromItemName(
  rawItem: string,
  rawVariant?: string,
  orderType?: string,
  category?: string
): OutletDetectionResult {
  return detectOutletFromItemAndRow(rawItem, rawVariant, orderType, category);
}

/**
 * Clean item name by stripping trailing 'W' outlet marker if present
 */
export function cleanItemNameWithoutOutlet(rawItem: string): string {
  const result = detectOutletFromItemName(rawItem);
  return result.cleanItemName;
}

export interface OutletDishItem {
  cleanName: string;
  rawName: string;
  category: string;
  quantity: number;
  revenue: number;
  averagePrice: number;
  outlet: SupportedOutlet;
  hasTrailingW: boolean;
  orderCount: number;
}

export interface CrossOutletComparisonItem {
  cleanName: string;
  category: string;
  banaswadiQty: number;
  banaswadiRevenue: number;
  banaswadiAvgPrice: number;
  whitefieldQty: number;
  whitefieldRevenue: number;
  whitefieldAvgPrice: number;
  totalQty: number;
  totalRevenue: number;
  dominantOutlet: 'banaswadi' | 'whitefield' | 'equal';
  banaswadiSharePct: number;
  whitefieldSharePct: number;
}

export interface OutletGroupedData {
  banaswadi: {
    totalRevenue: number;
    totalQuantity: number;
    dishCount: number;
    revenueSharePct: number;
    averageItemPrice: number;
    items: OutletDishItem[];
  };
  whitefield: {
    totalRevenue: number;
    totalQuantity: number;
    dishCount: number;
    revenueSharePct: number;
    averageItemPrice: number;
    items: OutletDishItem[];
    trailingWItemsCount: number;
  };
  totalRevenue: number;
  totalQuantity: number;
  totalDishes: number;
  crossOutletComparison: CrossOutletComparisonItem[];
  trailingWCount: number;
}

const OUTLET_OVERRIDES_KEY = 'menumind_outlet_overrides_v1';

export function getSavedOutletOverrides(): Record<string, SupportedOutlet> {
  try {
    const raw = localStorage.getItem(OUTLET_OVERRIDES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load outlet overrides', e);
  }
  return {};
}

export function saveOutletOverride(rawItemName: string, outlet: SupportedOutlet): void {
  try {
    const current = getSavedOutletOverrides();
    current[rawItemName.toLowerCase().trim()] = outlet;
    localStorage.setItem(OUTLET_OVERRIDES_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Failed to save outlet override', e);
  }
}

/**
 * Groups raw sales records into Banaswadi and Whitefield outlets based on trailing 'W'
 * or existing outlet tagging, producing metrics and side-by-side comparison.
 */
export function groupSalesByOutlet(
  records: RawSalesRecord[],
  manualOverrides: Record<string, SupportedOutlet> = {}
): OutletGroupedData {
  let banaswadiRev = 0;
  let banaswadiQty = 0;
  let whitefieldRev = 0;
  let whitefieldQty = 0;
  let trailingWCount = 0;

  const banaswadiItemMap = new Map<string, OutletDishItem>();
  const whitefieldItemMap = new Map<string, OutletDishItem>();
  const crossMap = new Map<string, CrossOutletComparisonItem>();

  records.forEach((rec) => {
    const normKey = rec.rawItemName.toLowerCase().trim();
    const manualOutlet = manualOverrides[normKey];

    const detection = detectOutletFromItemName(
      rec.rawItemName,
      rec.rawVariantName,
      rec.orderType,
      rec.category
    );
    if (detection.hasTrailingW || detection.outlet === 'whitefield') {
      trailingWCount++;
    }

    // Determine final outlet:
    // 1. Manual user override (if set)
    // 2. Trailing 'W' detection -> Whitefield
    // 3. Existing record.outlet field if explicitly 'whitefield' or 'banaswadi'
    // 4. Default: 'banaswadi'
    let assignedOutlet: SupportedOutlet = 'banaswadi';
    if (manualOutlet) {
      assignedOutlet = manualOutlet;
    } else if (detection.hasTrailingW) {
      assignedOutlet = 'whitefield';
    } else if (rec.outlet) {
      const lower = rec.outlet.toLowerCase();
      if (lower.includes('whitefield') || lower === 'w') {
        assignedOutlet = 'whitefield';
      } else if (lower.includes('banaswadi') || lower === 'b') {
        assignedOutlet = 'banaswadi';
      }
    }

    const cleanName = detection.cleanItemName;
    const cat = rec.category || 'General';

    if (assignedOutlet === 'whitefield') {
      whitefieldRev += rec.revenue;
      whitefieldQty += rec.quantity;

      const existing = whitefieldItemMap.get(cleanName);
      if (existing) {
        existing.quantity += rec.quantity;
        existing.revenue += rec.revenue;
        existing.averagePrice = existing.quantity > 0 ? existing.revenue / existing.quantity : 0;
        existing.orderCount++;
      } else {
        whitefieldItemMap.set(cleanName, {
          cleanName,
          rawName: rec.rawItemName,
          category: cat,
          quantity: rec.quantity,
          revenue: rec.revenue,
          averagePrice: rec.quantity > 0 ? rec.revenue / rec.quantity : 0,
          outlet: 'whitefield',
          hasTrailingW: detection.hasTrailingW,
          orderCount: 1,
        });
      }
    } else {
      banaswadiRev += rec.revenue;
      banaswadiQty += rec.quantity;

      const existing = banaswadiItemMap.get(cleanName);
      if (existing) {
        existing.quantity += rec.quantity;
        existing.revenue += rec.revenue;
        existing.averagePrice = existing.quantity > 0 ? existing.revenue / existing.quantity : 0;
        existing.orderCount++;
      } else {
        banaswadiItemMap.set(cleanName, {
          cleanName,
          rawName: rec.rawItemName,
          category: cat,
          quantity: rec.quantity,
          revenue: rec.revenue,
          averagePrice: rec.quantity > 0 ? rec.revenue / rec.quantity : 0,
          outlet: 'banaswadi',
          hasTrailingW: false,
          orderCount: 1,
        });
      }
    }

    // Cross-outlet comparison rollup
    if (!crossMap.has(cleanName)) {
      crossMap.set(cleanName, {
        cleanName,
        category: cat,
        banaswadiQty: 0,
        banaswadiRevenue: 0,
        banaswadiAvgPrice: 0,
        whitefieldQty: 0,
        whitefieldRevenue: 0,
        whitefieldAvgPrice: 0,
        totalQty: 0,
        totalRevenue: 0,
        dominantOutlet: 'equal',
        banaswadiSharePct: 0,
        whitefieldSharePct: 0,
      });
    }

    const crossItem = crossMap.get(cleanName)!;
    if (assignedOutlet === 'whitefield') {
      crossItem.whitefieldQty += rec.quantity;
      crossItem.whitefieldRevenue += rec.revenue;
    } else {
      crossItem.banaswadiQty += rec.quantity;
      crossItem.banaswadiRevenue += rec.revenue;
    }
  });

  const totalRev = banaswadiRev + whitefieldRev;
  const totalQty = banaswadiQty + whitefieldQty;

  // Finalize cross-outlet item calculations
  const crossOutletComparison: CrossOutletComparisonItem[] = Array.from(crossMap.values())
    .map((item) => {
      const totQty = item.banaswadiQty + item.whitefieldQty;
      const totRev = item.banaswadiRevenue + item.whitefieldRevenue;
      const bAvg = item.banaswadiQty > 0 ? item.banaswadiRevenue / item.banaswadiQty : 0;
      const wAvg = item.whitefieldQty > 0 ? item.whitefieldRevenue / item.whitefieldQty : 0;
      const bShare = totRev > 0 ? (item.banaswadiRevenue / totRev) * 100 : 0;
      const wShare = totRev > 0 ? (item.whitefieldRevenue / totRev) * 100 : 0;

      let dominant: 'banaswadi' | 'whitefield' | 'equal' = 'equal';
      if (item.banaswadiRevenue > item.whitefieldRevenue * 1.05) dominant = 'banaswadi';
      else if (item.whitefieldRevenue > item.banaswadiRevenue * 1.05) dominant = 'whitefield';

      return {
        ...item,
        totalQty: totQty,
        totalRevenue: totRev,
        banaswadiAvgPrice: Math.round(bAvg),
        whitefieldAvgPrice: Math.round(wAvg),
        banaswadiSharePct: Math.round(bShare * 10) / 10,
        whitefieldSharePct: Math.round(wShare * 10) / 10,
        dominantOutlet: dominant,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const banaswadiItems = Array.from(banaswadiItemMap.values()).sort((a, b) => b.revenue - a.revenue);
  const whitefieldItems = Array.from(whitefieldItemMap.values()).sort((a, b) => b.revenue - a.revenue);

  return {
    banaswadi: {
      totalRevenue: banaswadiRev,
      totalQuantity: banaswadiQty,
      dishCount: banaswadiItems.length,
      revenueSharePct: totalRev > 0 ? Math.round((banaswadiRev / totalRev) * 1000) / 10 : 0,
      averageItemPrice: banaswadiQty > 0 ? Math.round(banaswadiRev / banaswadiQty) : 0,
      items: banaswadiItems,
    },
    whitefield: {
      totalRevenue: whitefieldRev,
      totalQuantity: whitefieldQty,
      dishCount: whitefieldItems.length,
      revenueSharePct: totalRev > 0 ? Math.round((whitefieldRev / totalRev) * 1000) / 10 : 0,
      averageItemPrice: whitefieldQty > 0 ? Math.round(whitefieldRev / whitefieldQty) : 0,
      items: whitefieldItems,
      trailingWItemsCount: trailingWCount,
    },
    totalRevenue: totalRev,
    totalQuantity: totalQty,
    totalDishes: crossMap.size,
    crossOutletComparison,
    trailingWCount,
  };
}
