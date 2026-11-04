import * as XLSX from 'xlsx';
import { ColumnMapping, PosLayoutConfig, RawSalesRecord, ReconciliationReport } from '../types/restaurant';
import { detectOutletFromItemName } from './outletGroupingManager';

export interface ParseResult {
  fileName: string;
  sheetNames: string[];
  selectedSheetName: string;
  rawMatrix: any[][]; // Raw rows for visual layout inspector
  headers: string[];
  sampleRows: Record<string, any>[];
  detectedMapping: ColumnMapping;
  isConfirmed: boolean;
  layoutConfig: PosLayoutConfig;
}

export interface PosPresetItem {
  id: string;
  name: string;
  description: string;
  config: PosLayoutConfig;
  isCustom?: boolean;
}

export const DEFAULT_POS_LAYOUT_PRESETS: PosPresetItem[] = [
  {
    id: 'petpooja-item-wise',
    name: 'Petpooja: Item-wise Sales Report',
    description: 'Detailed line-item sales report (Column Heading Row 5, Row Heading Row 6, Skip 1 Footer Row)',
    config: {
      presetId: 'petpooja-item-wise',
      presetName: 'Petpooja Item-wise Sales Report',
      headerRow: 5,
      dataStartRow: 6,
      sheetIndex: 0,
      skipFooterRows: 1,
    },
  },
  {
    id: 'petpooja-highest-selling',
    name: 'Petpooja: Highest Selling Items',
    description: 'Summary item ranking report (Column Heading Row 6, Row Heading Row 11, Skip 1 Footer Row)',
    config: {
      presetId: 'petpooja-highest-selling',
      presetName: 'Petpooja Highest Selling Items',
      headerRow: 6,
      dataStartRow: 11,
      sheetIndex: 0,
      skipFooterRows: 1,
    },
  },
  {
    id: 'standard-flat',
    name: 'Standard POS Flat Table',
    description: 'Header at Row 1, dish items start at Row 2, 0 footer rows',
    config: {
      presetId: 'standard-flat',
      presetName: 'Standard Flat Table',
      headerRow: 1,
      dataStartRow: 2,
      sheetIndex: 0,
      skipFooterRows: 0,
    },
  },
  {
    id: 'custom-pos',
    name: 'Custom POS Structure',
    description: 'User-configured Column Heading Row, Row Heading Row, and Footer Summary Rows',
    config: {
      presetId: 'custom-pos',
      presetName: 'Custom POS Structure',
      headerRow: 6,
      dataStartRow: 11,
      sheetIndex: 0,
      skipFooterRows: 0,
    },
  },
];

// Backward-compatible reference
export let POS_LAYOUT_PRESETS: PosPresetItem[] = [...DEFAULT_POS_LAYOUT_PRESETS];

const POS_PRESETS_STORAGE_KEY = 'menumind_pos_report_presets_v2';
const POS_ACTIVE_LAYOUT_STORAGE_KEY = 'menumind_pos_layout_config_v1';

/**
 * Retrieve all saved POS presets from localStorage, falling back to defaults
 */
export function getSavedPosPresets(): PosPresetItem[] {
  try {
    const raw = localStorage.getItem(POS_PRESETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge with defaults to ensure all required presets exist
        const map = new Map<string, PosPresetItem>();
        DEFAULT_POS_LAYOUT_PRESETS.forEach((p) => map.set(p.id, { ...p }));
        parsed.forEach((p: PosPresetItem) => {
          if (p && p.id) {
            const existing = map.get(p.id);
            map.set(p.id, {
              ...existing,
              ...p,
              config: {
                ...existing?.config,
                ...p.config,
                presetId: p.id,
              },
            });
          }
        });
        const merged = Array.from(map.values());
        POS_LAYOUT_PRESETS = merged;
        return merged;
      }
    }
  } catch (err) {
    console.error('Failed to load saved POS report presets', err);
  }
  POS_LAYOUT_PRESETS = [...DEFAULT_POS_LAYOUT_PRESETS];
  return [...DEFAULT_POS_LAYOUT_PRESETS];
}

/**
 * Save and persist an updated configuration for a specific preset (e.g. 'petpooja-item-wise' or 'petpooja-highest-selling')
 */
export function savePosPreset(presetId: string, updatedConfig: Partial<PosLayoutConfig>): PosPresetItem[] {
  const currentPresets = getSavedPosPresets();
  const updatedPresets = currentPresets.map((preset) => {
    if (preset.id === presetId) {
      const newConfig: PosLayoutConfig = {
        ...preset.config,
        ...updatedConfig,
        presetId,
        headerRow: Number(updatedConfig.headerRow) || preset.config.headerRow || 1,
        dataStartRow: Number(updatedConfig.dataStartRow) || preset.config.dataStartRow || 2,
        skipFooterRows: updatedConfig.skipFooterRows !== undefined ? Number(updatedConfig.skipFooterRows) : (preset.config.skipFooterRows ?? 1),
      };
      return {
        ...preset,
        config: newConfig,
      };
    }
    return preset;
  });

  try {
    localStorage.setItem(POS_PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets));
  } catch (err) {
    console.error('Failed to save POS presets to localStorage', err);
  }

  POS_LAYOUT_PRESETS = updatedPresets;
  return updatedPresets;
}

/**
 * Reset a preset back to its original default configuration
 */
export function resetPosPreset(presetId: string): PosLayoutConfig {
  const defaultPreset = DEFAULT_POS_LAYOUT_PRESETS.find((p) => p.id === presetId);
  if (!defaultPreset) {
    return {
      presetId,
      headerRow: 6,
      dataStartRow: 11,
      skipFooterRows: 1,
      sheetIndex: 0,
    };
  }
  savePosPreset(presetId, defaultPreset.config);
  return { ...defaultPreset.config };
}

/**
 * Retrieve the active POS layout config
 */
export function getSavedPosLayoutConfig(): PosLayoutConfig {
  try {
    const raw = localStorage.getItem(POS_ACTIVE_LAYOUT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const presetId = parsed.presetId || 'petpooja-highest-selling';
        const presets = getSavedPosPresets();
        const found = presets.find((p) => p.id === presetId);
        if (found) {
          return {
            ...found.config,
            ...parsed,
            presetId: found.id,
            presetName: found.config.presetName,
          };
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load active POS layout config', err);
  }

  // Default to Petpooja Highest Selling Items
  const presets = getSavedPosPresets();
  const highestSelling = presets.find((p) => p.id === 'petpooja-highest-selling');
  return highestSelling?.config || {
    presetId: 'petpooja-highest-selling',
    presetName: 'Petpooja Highest Selling Items',
    headerRow: 6,
    dataStartRow: 11,
    sheetIndex: 0,
    skipFooterRows: 1,
  };
}

/**
 * Save the active POS layout configuration and also sync its preset in localStorage
 */
export function savePosLayoutConfig(config: PosLayoutConfig): void {
  try {
    localStorage.setItem(POS_ACTIVE_LAYOUT_STORAGE_KEY, JSON.stringify(config));
    if (config.presetId) {
      savePosPreset(config.presetId, config);
    }
  } catch (err) {
    console.error('Failed to save POS layout config', err);
  }
}

// Candidates for intelligent column matching
const COLUMN_CANDIDATES = {
  itemName: [
    'item name',
    'item',
    'item description',
    'dish name',
    'dish',
    'product name',
    'product',
    'menu item',
    'particulars',
    'item_name',
  ],
  variantName: [
    'variation',
    'variant',
    'item variation',
    'portion',
    'size',
    'variant name',
    'variation name',
    'portion name',
  ],
  quantity: [
    'quantity',
    'qty',
    'qty sold',
    'total qty',
    'units',
    'quantity sold',
    'sold qty',
    'item qty',
    'count',
  ],
  revenue: [
    'net sales',
    'net amount',
    'net total',
    'total amount',
    'item amount',
    'gross amount',
    'amount',
    'revenue',
    'total sales',
    'sales',
    'net value',
    'bill amount',
  ],
  date: [
    'date',
    'bill date',
    'order date',
    'sales date',
    'transaction date',
    'invoice date',
    'order_date',
    'bill_date',
  ],
  category: [
    'category',
    'item category',
    'menu category',
    'group',
    'sub category',
    'category name',
  ],
  orderType: [
    'order type',
    'service type',
    'type',
    'delivery/dine-in',
    'order_type',
  ],
  salesChannel: [
    'sales channel',
    'channel',
    'source',
    'platform',
    'aggregator',
    'order source',
  ],
  discount: [
    'discount',
    'discount amount',
    'item discount',
    'disc',
  ],
  returns: [
    'returns',
    'returned',
    'cancelled',
    'void',
    'refund',
    'return amount',
  ],
  outlet: [
    'outlet',
    'branch',
    'store',
    'location',
    'restaurant name',
    'outlet name',
  ],
};

/**
 * Score how well a column header matches expected field candidates
 */
function scoreHeaderMatch(header: string, candidates: string[]): number {
  const norm = header.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  for (const cand of candidates) {
    if (norm === cand) return 100;
    if (norm.startsWith(cand) || norm.endsWith(cand)) return 85;
    if (norm.includes(cand)) return 70;
  }
  return 0;
}

/**
 * Automatically detects the best column mapping from a list of headers
 */
export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    itemName: '',
    quantity: '',
    revenue: '',
  };

  const findBest = (candidates: string[]): string => {
    let bestHeader = '';
    let highestScore = 0;
    for (const h of headers) {
      const score = scoreHeaderMatch(h, candidates);
      if (score > highestScore && score >= 70) {
        highestScore = score;
        bestHeader = h;
      }
    }
    return bestHeader;
  };

  mapping.itemName = findBest(COLUMN_CANDIDATES.itemName);
  mapping.variantName = findBest(COLUMN_CANDIDATES.variantName) || undefined;
  mapping.quantity = findBest(COLUMN_CANDIDATES.quantity);
  mapping.revenue = findBest(COLUMN_CANDIDATES.revenue);
  mapping.date = findBest(COLUMN_CANDIDATES.date) || undefined;
  mapping.category = findBest(COLUMN_CANDIDATES.category) || undefined;
  mapping.orderType = findBest(COLUMN_CANDIDATES.orderType) || undefined;
  mapping.salesChannel = findBest(COLUMN_CANDIDATES.salesChannel) || undefined;
  mapping.discount = findBest(COLUMN_CANDIDATES.discount) || undefined;
  mapping.returns = findBest(COLUMN_CANDIDATES.returns) || undefined;
  mapping.outlet = findBest(COLUMN_CANDIDATES.outlet) || undefined;

  return mapping;
}

/**
 * Extracts raw 2D array and converts to row objects based on PosLayoutConfig
 */
export function parseWorksheetWithLayout(
  worksheet: XLSX.WorkSheet,
  config: PosLayoutConfig
): { headers: string[]; rows: Record<string, any>[]; rawMatrix: any[][] } {
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rawMatrix.length === 0) {
    return { headers: [], rows: [], rawMatrix: [] };
  }

  // 1-indexed to 0-indexed header row
  const headerIdx = Math.max(0, Math.min(rawMatrix.length - 1, (config.headerRow || 1) - 1));
  const rawHeaderRow = rawMatrix[headerIdx] || [];

  // Extract clean unique column names
  const headers: string[] = [];
  const seenHeaderCounts = new Map<string, number>();

  rawHeaderRow.forEach((colVal: any, colIdx: number) => {
    let title = String(colVal || '').trim();
    if (!title) {
      title = `Column_${colIdx + 1}`;
    }
    const count = seenHeaderCounts.get(title) || 0;
    seenHeaderCounts.set(title, count + 1);
    if (count > 0) {
      title = `${title}_${count + 1}`;
    }
    headers.push(title);
  });

  // 1-indexed to 0-indexed data start row
  const dataStartIdx = Math.max(
    headerIdx + 1,
    Math.min(rawMatrix.length, (config.dataStartRow || 2) - 1)
  );
  const skipFooter = Math.max(0, config.skipFooterRows || 0);
  const dataEndIdx = Math.max(dataStartIdx, rawMatrix.length - skipFooter);

  const rows: Record<string, any>[] = [];

  for (let r = dataStartIdx; r < dataEndIdx; r++) {
    const rawRow = rawMatrix[r];
    if (!rawRow || !Array.isArray(rawRow)) continue;

    // Skip blank rows
    const hasValues = rawRow.some((val) => val !== '' && val !== null && val !== undefined);
    if (!hasValues) continue;

    // Skip summary/footer lines like "Total", "Grand Total"
    const firstCell = String(rawRow[0] || '').toLowerCase().trim();
    if (
      firstCell === 'total' ||
      firstCell === 'grand total' ||
      firstCell === 'total qty' ||
      firstCell === 'sub total' ||
      firstCell.startsWith('printed by') ||
      firstCell.startsWith('page')
    ) {
      continue;
    }

    const rowObj: Record<string, any> = {};
    headers.forEach((h, colIdx) => {
      rowObj[h] = rawRow[colIdx] !== undefined ? rawRow[colIdx] : '';
    });

    rows.push(rowObj);
  }

  return { headers, rows, rawMatrix };
}

/**
 * Reads a File object (.xlsx, .xls, .csv) and extracts sheets & headers using PosLayoutConfig
 */
export async function parseFileForPreview(file: File, customConfig?: PosLayoutConfig): Promise<ParseResult> {
  const config = customConfig || getSavedPosLayoutConfig();
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames;
  const sheetIdx = Math.max(0, Math.min(sheetNames.length - 1, config.sheetIndex || 0));
  const selectedSheetName = sheetNames[sheetIdx] || sheetNames[0];
  const worksheet = workbook.Sheets[selectedSheetName];

  const { headers, rows, rawMatrix } = parseWorksheetWithLayout(worksheet, config);

  if (rawMatrix.length === 0) {
    throw new Error(`The file "${file.name}" is empty or has no recognizable data rows.`);
  }

  const sampleRows = rows.slice(0, 10);
  const detectedMapping = autoDetectColumnMapping(headers);

  // If critical columns are mapped with high confidence, consider it tentatively confirmed
  const isConfirmed = Boolean(detectedMapping.itemName && detectedMapping.quantity && detectedMapping.revenue);

  return {
    fileName: file.name,
    sheetNames,
    selectedSheetName,
    rawMatrix: rawMatrix.slice(0, 25), // first 25 rows for visual preview
    headers,
    sampleRows: rows.slice(0, 5),
    detectedMapping,
    isConfirmed,
    layoutConfig: config,
  };
}

/**
 * Parses raw records from a file using an approved column mapping
 */
export function extractRecordsWithMapping(
  rows: Record<string, any>[],
  mapping: ColumnMapping,
  fileName: string,
  customOutletOverrides?: Record<string, string>
): { validRecords: RawSalesRecord[]; invalidCount: number; returnCount: number } {
  const validRecords: RawSalesRecord[] = [];
  let invalidCount = 0;
  let returnCount = 0;

  rows.forEach((row, idx) => {
    const rawItem = String(row[mapping.itemName] || '').trim();
    const rawVariant = mapping.variantName ? String(row[mapping.variantName] || '').trim() : undefined;
    
    // Parse quantity
    const rawQty = row[mapping.quantity];
    const qtyNum = typeof rawQty === 'number' ? rawQty : parseFloat(String(rawQty).replace(/[^0-9.-]/g, ''));

    // Parse revenue
    const rawRev = row[mapping.revenue];
    const revNum = typeof rawRev === 'number' ? rawRev : parseFloat(String(rawRev).replace(/[^0-9.-]/g, ''));

    if (!rawItem || isNaN(qtyNum) || isNaN(revNum)) {
      invalidCount++;
      return;
    }

    // Check for returns or cancellations
    let isReturn = false;
    if (qtyNum < 0 || revNum < 0) {
      isReturn = true;
    }
    if (mapping.returns && row[mapping.returns]) {
      const retVal = String(row[mapping.returns]).toLowerCase();
      if (retVal.includes('return') || retVal.includes('cancel') || retVal.includes('void') || retVal === 'yes') {
        isReturn = true;
      }
    }

    if (isReturn) {
      returnCount++;
    }

    // Parse date
    let dateStr: string | undefined;
    if (mapping.date && row[mapping.date]) {
      const rawDate = row[mapping.date];
      dateStr = parseDateString(rawDate);
    }

    const isNetSales = mapping.revenue.toLowerCase().includes('net');

    const rowOrderType = mapping.orderType ? String(row[mapping.orderType] || '').trim() : undefined;
    const rowCategory = mapping.category ? String(row[mapping.category] || '').trim() : undefined;
    const rowSalesChannel = mapping.salesChannel ? String(row[mapping.salesChannel] || '').trim() : undefined;

    // Intelligent Outlet Detection:
    // 1. Check '-' (hyphen): right side is channel, left side ending with 'W' or 'w' -> Whitefield; otherwise Banaswadi.
    // 2. No '-' found: check Take Away or Delivery -> Banaswadi; Dine-in -> Whitefield.
    // 3. User manual override/remapping takes precedence before confirmation.
    const outletDetection = detectOutletFromItemName(rawItem, rawVariant, rowOrderType, rowCategory);
    const itemKey = rawItem.toLowerCase().trim();
    const manualOverride = customOutletOverrides?.[itemKey];

    let resolvedOutlet = manualOverride || outletDetection.outlet;
    if (!manualOverride && mapping.outlet && row[mapping.outlet]) {
      const colOutlet = String(row[mapping.outlet]).trim().toLowerCase();
      if (colOutlet.includes('whitefield') || colOutlet === 'w') {
        resolvedOutlet = 'whitefield';
      } else if (colOutlet.includes('banaswadi') || colOutlet === 'b') {
        resolvedOutlet = 'banaswadi';
      } else if (colOutlet) {
        resolvedOutlet = colOutlet;
      }
    }

    validRecords.push({
      rowId: `${fileName}-r${idx + 1}`,
      sourceFile: fileName,
      rawItemName: rawItem,
      rawVariantName: rawVariant || undefined,
      quantity: Math.abs(qtyNum),
      revenue: Math.abs(revNum),
      isNetSales,
      date: dateStr,
      category: rowCategory,
      orderType: rowOrderType,
      salesChannel: rowSalesChannel || outletDetection.detectedChannel,
      discount: mapping.discount ? parseFloat(String(row[mapping.discount] || 0)) : 0,
      returnAmount: isReturn ? Math.abs(revNum) : 0,
      outlet: resolvedOutlet,
      isReturnOrCancelled: isReturn,
    });
  });

  return { validRecords, invalidCount, returnCount };
}

/**
 * Standardize various POS date formats into YYYY-MM-DD
 */
export function parseDateString(val: any): string | undefined {
  if (!val) return undefined;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return undefined;
    return val.toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  // Check if standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  // Check DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  // Try standard Date.parse
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return undefined;
}

/**
 * Merges records from multiple files, detects exact duplicate rows, and produces reconciliation report
 */
export function mergeSalesRecords(
  recordsByFile: { fileName: string; records: RawSalesRecord[]; invalidCount: number }[]
): {
  mergedRecords: RawSalesRecord[];
  reconciliation: ReconciliationReport;
  overlapWarnings: string[];
} {
  const seenRowSignatures = new Set<string>();
  const mergedRecords: RawSalesRecord[] = [];
  let duplicatesSkipped = 0;
  let totalRawRows = 0;
  let totalInvalidRows = 0;
  let returnsCount = 0;
  let returnsRevenue = 0;
  let totalReportedRevenue = 0;
  let totalUnits = 0;
  const fileNames: string[] = [];
  const datesSet = new Set<string>();
  const rawItemsSet = new Set<string>();
  const overlapWarnings: string[] = [];

  recordsByFile.forEach(({ fileName, records, invalidCount }) => {
    fileNames.push(fileName);
    totalRawRows += records.length + invalidCount;
    totalInvalidRows += invalidCount;

    const fileDates: string[] = [];

    records.forEach((rec) => {
      // Signature for exact duplicate detection: date + rawItem + variant + qty + rev
      const sig = `${rec.date || 'nodate'}|${rec.rawItemName}|${rec.rawVariantName || ''}|${rec.quantity}|${rec.revenue}|${rec.outlet || ''}`;
      if (seenRowSignatures.has(sig)) {
        duplicatesSkipped++;
        return;
      }
      seenRowSignatures.add(sig);

      if (rec.isReturnOrCancelled) {
        returnsCount++;
        returnsRevenue += rec.revenue;
        // Do not add returns as positive revenue in net sales
        return;
      }

      mergedRecords.push(rec);
      totalReportedRevenue += rec.revenue;
      totalUnits += rec.quantity;
      rawItemsSet.add(rec.rawItemName);

      if (rec.date) {
        datesSet.add(rec.date);
        fileDates.push(rec.date);
      }
    });

    if (fileDates.length > 0) {
      fileDates.sort();
      const minD = fileDates[0];
      const maxD = fileDates[fileDates.length - 1];
      // Check if overlapping with other files
      // We can record file range
    }
  });

  const sortedDates = Array.from(datesSet).sort();
  const dateRangeStart = sortedDates[0];
  const dateRangeEnd = sortedDates[sortedDates.length - 1];

  // Determine granularity
  let detectedGranularity: 'daily' | 'monthly' | 'aggregate_only' = 'aggregate_only';
  const monthsSet = new Set<string>();

  if (sortedDates.length > 0) {
    sortedDates.forEach((d) => {
      monthsSet.add(d.slice(0, 7));
    });
    // If distinct days > distinct months * 3, it's daily data
    if (sortedDates.length > monthsSet.size * 2) {
      detectedGranularity = 'daily';
    } else {
      detectedGranularity = 'monthly';
    }
  }

  const monthsPresent = Array.from(monthsSet).sort();

  // Multi-Outlet Separation Metrics (Banaswadi vs Whitefield trailing 'W')
  let banaswadiRows = 0;
  let whitefieldRows = 0;
  let banaswadiRevenue = 0;
  let whitefieldRevenue = 0;
  let banaswadiUnits = 0;
  let whitefieldUnits = 0;

  mergedRecords.forEach((rec) => {
    const isW = (rec.outlet || '').toLowerCase().includes('whitefield') || rec.outlet === 'w';
    if (isW) {
      whitefieldRows++;
      whitefieldRevenue += rec.revenue;
      whitefieldUnits += rec.quantity;
    } else {
      banaswadiRows++;
      banaswadiRevenue += rec.revenue;
      banaswadiUnits += rec.quantity;
    }
  });

  const hasOutletGrouping = whitefieldRows > 0;

  const reconciliation: ReconciliationReport = {
    totalFiles: fileNames.length,
    fileNames,
    totalRawRows,
    validRows: mergedRecords.length,
    invalidRows: totalInvalidRows,
    duplicatesSkipped,
    returnsOrCancelledCount: returnsCount,
    returnsRevenueExcluded: returnsRevenue,
    totalReportedRevenue,
    isNetSales: true,
    totalUnitsSold: totalUnits,
    uniqueRawItems: rawItemsSet.size,
    uniqueParentDishes: 0, // will be populated after normalization
    detectedGranularity,
    dateRangeStart,
    dateRangeEnd,
    monthsPresent,
    hasOutletGrouping,
    outletCounts: {
      banaswadiRows,
      whitefieldRows,
      banaswadiRevenue,
      whitefieldRevenue,
      banaswadiUnits,
      whitefieldUnits,
    },
  };

  return {
    mergedRecords,
    reconciliation,
    overlapWarnings,
  };
}
