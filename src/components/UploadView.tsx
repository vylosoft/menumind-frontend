import { DEMO_ENABLED } from '../config/features';
import { posSalesApi, ChannelSummaryUploadResult } from '../lib/ingestionApi';
import { ApiError } from '../lib/apiClient';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  autoDetectColumnMapping,
  extractRecordsWithMapping,
  getSavedPosLayoutConfig,
  getSavedPosPresets,
  mergeSalesRecords,
  ParseResult,
  parseWorksheetWithLayout,
  POS_LAYOUT_PRESETS,
  PosPresetItem,
  resetPosPreset,
  savePosLayoutConfig,
  savePosPreset,
} from '../utils/petpoojaParser';
import {
  detectOutletFromItemAndRow,
  getSavedOutletOverrides,
  saveOutletOverride,
  SupportedOutlet,
} from '../utils/outletGroupingManager';
import { ColumnMapping, PosLayoutConfig, RawSalesRecord, ReconciliationReport } from '../types/restaurant';
import { formatINR, formatNumber } from '../utils/formatters';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  Database,
  Trash2,
  Calendar,
  Layers,
  Settings,
  TableProperties,
  Sliders,
  Check,
  Eye,
  BookmarkCheck,
  RotateCcw,
  Save,
  Sparkles,
  Info,
  Building2,
  Search,
  ArrowRightLeft,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PlatformPayoutRecord } from '../types/finance';
import { ParentDish } from '../types/restaurant';
import { PurchaseRecord } from '../types/purchases';
import { CateringOrder } from '../types/catering';
import { StaffMember } from '../types/payrollStaff';
import { OutletOperatingExpenseItem } from '../types/operatingCosts';
import { AggregatorPayoutUploadSection } from './finance/payouts/AggregatorPayoutUploadSection';

interface UploadViewProps {
  onDataLoaded: (records: RawSalesRecord[], reconciliation: ReconciliationReport, uploadType?: 'outlet' | 'highest_selling') => void;
  onLoadDemoData: () => void;
  onClearAllData?: () => void;
  currentReconciliation: ReconciliationReport;
  rawRecords?: RawSalesRecord[];
  parentDishes?: ParentDish[];
  payouts?: PlatformPayoutRecord[];
  onUpdatePayouts?: (payouts: PlatformPayoutRecord[]) => void;
  purchases?: PurchaseRecord[];
  cateringOrders?: CateringOrder[];
  staffDirectory?: StaffMember[];
  operatingExpenses?: OutletOperatingExpenseItem[];
  onNavigateTab?: (tab: string) => void;
  onOpenSupabaseModal?: () => void;
}

interface LoadedFileState {
  file: File;
  workbook: XLSX.WorkBook;
  rawMatrix: any[][];
  headers: string[];
  rawRows: Record<string, any>[];
  mapping: ColumnMapping;
  isConfirmed: boolean;
}

export const UploadView: React.FC<UploadViewProps> = ({
  onDataLoaded,
  onLoadDemoData,
  onClearAllData,
  currentReconciliation,
  rawRecords = [],
  parentDishes = [],
  payouts = [],
  onUpdatePayouts = () => {},
  purchases = [],
  cateringOrders = [],
  staffDirectory = [],
  operatingExpenses = [],
  onNavigateTab,
  onOpenSupabaseModal,
}) => {
  // Tab switcher between POS upload and Aggregator Payouts upload
  const [activeUploadTab, setActiveUploadTab] = useState<'pos' | 'payouts'>('pos');

  // POS File Layout Configuration State with persistent presets for both Item-wise and Highest Selling
  const [posConfig, setPosConfig] = useState<PosLayoutConfig>(() => getSavedPosLayoutConfig());
  const [presets, setPresets] = useState<PosPresetItem[]>(() => getSavedPosPresets());
  const [activePresetId, setActivePresetId] = useState<string>(() => posConfig.presetId || 'petpooja-highest-selling');
  const [saveAsDefault, setSaveAsDefault] = useState<boolean>(true);
  const [showConfigSettings, setShowConfigSettings] = useState<boolean>(false);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSaveNotification(msg);
    setTimeout(() => setSaveNotification(null), 3500);
  };

  // Loaded files state
  const [loadedFiles, setLoadedFiles] = useState<LoadedFileState[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  
  // Multi-step workflow: 'upload' -> 'layout_config' -> 'column_mapping'
  const [currentStep, setCurrentStep] = useState<'upload' | 'layout_config' | 'column_mapping'>('upload');

  // Manual outlet attribution remapping state before confirmation
  const [outletOverrides, setOutletOverrides] = useState<Record<string, SupportedOutlet>>(() =>
    getSavedOutletOverrides()
  );
  const [outletRemapSearch, setOutletRemapSearch] = useState<string>('');
  const [outletRemapFilter, setOutletRemapFilter] = useState<'all' | 'whitefield' | 'banaswadi' | 'overridden'>('all');

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [channelSummaryResult, setChannelSummaryResult] = useState<ChannelSummaryUploadResult[] | null>(null);

  // Petpooja "Order Report: Sub-Order Wise" has no items: it is a channel-level sales summary.
  const isSubOrderSummaryMatrix = (matrix: any[][]): boolean =>
    matrix.slice(0, 20).some((row) => {
      const cells = (row || []).map((c: any) => String(c ?? '').toLowerCase().trim());
      return cells.some((c) => c.startsWith('sub order type')) && cells.some((c) => c.startsWith('net sales')) && cells.some((c) => c.includes('bills'));
    });

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply layout configuration to a workbook and extract headers + rows
  const parseWorkbookWithConfig = (
    workbook: XLSX.WorkBook,
    config: PosLayoutConfig
  ): { headers: string[]; rawRows: Record<string, any>[]; rawMatrix: any[][] } => {
    const sheetName = workbook.SheetNames[config.sheetIndex || 0] || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const { headers, rows, rawMatrix } = parseWorksheetWithLayout(worksheet, config);
    return { headers, rawRows: rows, rawMatrix };
  };

  // Petpooja "Order Report: Sub-Order Wise" layout: column titles on row 5, channel rows from row 6
  const SUB_ORDER_LAYOUT: PosLayoutConfig = {
    presetId: 'custom-pos',
    presetName: 'Petpooja Order Report: Sub-Order Wise',
    headerRow: 5,
    dataStartRow: 6,
    sheetIndex: 0,
    skipFooterRows: 0,
  };

  const subOrderMapping = (headers: string[]): ColumnMapping => {
    const find = (re: RegExp) => headers.find((h) => re.test(h.toLowerCase().trim())) || '';
    const auto = autoDetectColumnMapping(headers);
    return {
      ...auto,
      itemName: find(/^sub order type/) || auto.itemName,
      variantName: undefined,
      quantity: find(/no\. of bills|bills/) || auto.quantity,
      revenue: find(/^net sales/) || auto.revenue,
      orderType: find(/^order type/) || auto.orderType,
      category: find(/^restaurants?$/) || auto.category,
      salesChannel: find(/^sub order type/) || auto.salesChannel,
      discount: find(/^total discount/) || auto.discount,
      date: undefined,
      returns: undefined,
      outlet: undefined,
    };
  };

  // Loads saved Sub-Order Wise rows into the app the same way as any other POS upload.
  const loadChannelSummaries = (summaries: ChannelSummaryUploadResult[]) => {
    setChannelSummaryResult(summaries);
    const total = summaries.reduce((s, c) => s + c.totalNetSales, 0);
    showToast(`Saved channel sales summary (${formatINR(total)}) to the database.`);
    const recordsByFile = summaries.map((cs) => ({
      fileName: cs.fileName,
      invalidCount: 0,
      records: cs.rows.map((r, i) => ({
        rowId: `${cs.fileName}-r${i + 1}`,
        sourceFile: cs.fileName,
        rawItemName: r.subOrderType,
        quantity: r.bills,
        revenue: r.netSales,
        isNetSales: true,
        date: cs.period.from,
        category: r.restaurant,
        orderType: r.orderType || undefined,
        salesChannel: r.subOrderType,
        discount: 0,
        returnAmount: 0,
        outlet: r.outlet,
        isReturnOrCancelled: false,
      })) as RawSalesRecord[],
    }));
    if (recordsByFile.some((f) => f.records.length > 0)) {
      const { mergedRecords, reconciliation } = mergeSalesRecords(recordsByFile);
      onDataLoaded(mergedRecords, reconciliation, 'outlet');
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const newFiles: LoadedFileState[] = [];
      let summaryCount = 0;
      setChannelSummaryResult(null);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        const fullMatrix: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
        const isSubOrder = isSubOrderSummaryMatrix(fullMatrix);
        if (isSubOrder) summaryCount++;

        // Parse with current layout config (Sub-Order Wise reports open with their own row layout pre-selected)
        const layoutForFile = isSubOrder ? SUB_ORDER_LAYOUT : posConfig;
        const { headers, rawRows, rawMatrix } = parseWorkbookWithConfig(workbook, layoutForFile);

        if (rawMatrix.length === 0) {
          throw new Error(`File "${file.name}" has no readable rows.`);
        }

        const detectedMapping = isSubOrder ? subOrderMapping(headers) : autoDetectColumnMapping(headers);

        newFiles.push({
          file,
          workbook,
          rawMatrix: rawMatrix.slice(0, 30), // first 30 rows for visual inspector
          headers,
          rawRows,
          mapping: detectedMapping,
          isConfirmed: Boolean(
            detectedMapping.itemName && detectedMapping.quantity && detectedMapping.revenue
          ),
        });
      }

      if (summaryCount > 0 && summaryCount < newFiles.length) {
        throw new Error('Upload Order Report (Sub-Order Wise) files separately from item-wise sales reports.');
      }
      if (summaryCount > 0) {
        setPosConfig(SUB_ORDER_LAYOUT);
        setActivePresetId('custom-pos');
        showToast('Order Report: Sub-Order Wise detected. Column Heading Row 5, data from Row 6 and columns pre-selected; review and confirm.');
      }

      setLoadedFiles(newFiles);
      setActiveFileIndex(0);
      // Immediately open Step 1: Layout Configuration so user can inspect and verify row numbers
      setCurrentStep('layout_config');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || 'Failed to read spreadsheet file');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // Re-parse all loaded files when row numbers change
  const reparseAllFilesWithConfig = (config: PosLayoutConfig) => {
    if (loadedFiles.length === 0) return;

    setLoadedFiles((prev) =>
      prev.map((item) => {
        const { headers, rawRows, rawMatrix } = parseWorkbookWithConfig(item.workbook, config);
        const isSubOrderHeader = headers.some((h) => /^sub order type/i.test(h.trim()));
        const detectedMapping = isSubOrderHeader ? subOrderMapping(headers) : autoDetectColumnMapping(headers);
        return {
          ...item,
          rawMatrix: rawMatrix.slice(0, 30),
          headers,
          rawRows,
          mapping: detectedMapping,
          isConfirmed: Boolean(
            detectedMapping.itemName && detectedMapping.quantity && detectedMapping.revenue
          ),
        };
      })
    );
  };

  // Preset Selection - switches between Item Wise Sales Report, Highest Selling Items, Flat Table, etc.
  const handleSelectPreset = (presetId: string) => {
    setActivePresetId(presetId);
    const allPresets = getSavedPosPresets();
    setPresets(allPresets);
    const preset = allPresets.find((p) => p.id === presetId);
    if (!preset) return;
    const newConf: PosLayoutConfig = {
      ...preset.config,
      presetId,
    };
    setPosConfig(newConf);
    if (saveAsDefault) {
      savePosLayoutConfig(newConf);
    }
    reparseAllFilesWithConfig(newConf);
    showToast(`Loaded layout: "${preset.name}".`);
  };

  // Update specific fields: Column Heading Row, Row Heading Row (Data Start Row), Footer Summary Rows to Skip
  const handleConfigChange = (field: keyof PosLayoutConfig, rawValue: any) => {
    const numValue = Math.max(0, parseInt(rawValue, 10) || 0);
    const updated: PosLayoutConfig = {
      ...posConfig,
      [field]: numValue,
      presetId: activePresetId,
    };
    setPosConfig(updated);

    // Update in-memory preset so it reflects immediately
    const updatedPresets = presets.map((p) =>
      p.id === activePresetId
        ? {
            ...p,
            config: {
              ...p.config,
              ...updated,
            },
          }
        : p
    );
    setPresets(updatedPresets);

    if (saveAsDefault) {
      savePosLayoutConfig(updated);
      savePosPreset(activePresetId, updated);
    }
    reparseAllFilesWithConfig(updated);
  };

  // Explicit Save Configuration for Future
  const handleSaveActivePreset = () => {
    savePosPreset(activePresetId, posConfig);
    savePosLayoutConfig(posConfig);
    const refreshed = getSavedPosPresets();
    setPresets(refreshed);
    const activeName = presets.find((p) => p.id === activePresetId)?.name || posConfig.presetName || 'Preset';
    showToast(`Configuration saved for "${activeName}"! Column Heading Row: ${posConfig.headerRow}, Row Heading Row: ${posConfig.dataStartRow}, Footer Skip: ${posConfig.skipFooterRows || 0} rows.`);
  };

  // Reset preset to factory Petpooja default
  const handleResetActivePreset = () => {
    const activeName = presets.find((p) => p.id === activePresetId)?.name || 'Preset';
    if (window.confirm(`Reset "${activeName}" back to original default Petpooja rows?`)) {
      const resetConfig = resetPosPreset(activePresetId);
      setPosConfig(resetConfig);
      const refreshed = getSavedPosPresets();
      setPresets(refreshed);
      reparseAllFilesWithConfig(resetConfig);
      showToast(`Reset "${activeName}" to Petpooja defaults.`);
    }
  };

  const setRowAsHeader = (rowNum: number) => {
    const dataStart = Math.max(rowNum + 1, posConfig.dataStartRow);
    const updated: PosLayoutConfig = {
      ...posConfig,
      headerRow: rowNum,
      dataStartRow: dataStart,
      presetId: activePresetId,
    };
    setPosConfig(updated);
    if (saveAsDefault) {
      savePosLayoutConfig(updated);
      savePosPreset(activePresetId, updated);
    }
    reparseAllFilesWithConfig(updated);
    showToast(`Row #${rowNum} set as Column Heading Row.`);
  };

  const setRowAsDataStart = (rowNum: number) => {
    const header = Math.min(rowNum - 1, posConfig.headerRow);
    const updated: PosLayoutConfig = {
      ...posConfig,
      headerRow: header,
      dataStartRow: rowNum,
      presetId: activePresetId,
    };
    setPosConfig(updated);
    if (saveAsDefault) {
      savePosLayoutConfig(updated);
      savePosPreset(activePresetId, updated);
    }
    reparseAllFilesWithConfig(updated);
    showToast(`Row #${rowNum} set as Row Heading / Data Start Row.`);
  };

  const updateMappingField = (fileIndex: number, fieldKey: keyof ColumnMapping, value: string) => {
    setLoadedFiles((prev) => {
      const updated = [...prev];
      updated[fileIndex].mapping[fieldKey] = value;
      return updated;
    });
  };

  const removeFile = (idx: number) => {
    const updated = loadedFiles.filter((_, i) => i !== idx);
    setLoadedFiles(updated);
    if (updated.length === 0) {
      setCurrentStep('upload');
    } else {
      setActiveFileIndex(Math.min(activeFileIndex, updated.length - 1));
    }
  };

  // Proceed to Step 2: Column Mapping
  const handleProceedToColumnMapping = () => {
    if (saveAsDefault) {
      savePosLayoutConfig(posConfig);
    }
    setCurrentStep('column_mapping');
  };

  // Compute unique items across loaded files with automated outlet detection and user remappings
  const previewItemsWithOutlet = useMemo(() => {
    if (loadedFiles.length === 0) return [];
    const map = new Map<
      string,
      {
        rawItemName: string;
        orderType?: string;
        category?: string;
        occurrences: number;
        sampleRevenue: number;
        detectedOutlet: SupportedOutlet;
        detectedChannel?: string;
        cleanItemName: string;
        detectionReason?: string;
        assignedOutlet: SupportedOutlet;
        isManuallyOverridden: boolean;
      }
    >();

    loadedFiles.forEach((fileItem) => {
      if (!fileItem.mapping.itemName) return;
      fileItem.rawRows.forEach((row) => {
        const rawName = String(row[fileItem.mapping.itemName] || '').trim();
        if (!rawName) return;
        const normKey = rawName.toLowerCase().trim();
        const rawVar = fileItem.mapping.variantName ? String(row[fileItem.mapping.variantName] || '').trim() : undefined;
        const orderType = fileItem.mapping.orderType ? String(row[fileItem.mapping.orderType] || '').trim() : undefined;
        const cat = fileItem.mapping.category ? String(row[fileItem.mapping.category] || '').trim() : undefined;
        const rawRev = Number(row[fileItem.mapping.revenue]) || 0;

        if (!map.has(normKey)) {
          const detection = detectOutletFromItemAndRow(rawName, rawVar, orderType, cat);
          const overrideVal = outletOverrides[normKey];
          map.set(normKey, {
            rawItemName: rawName,
            orderType,
            category: cat,
            occurrences: 1,
            sampleRevenue: rawRev,
            detectedOutlet: detection.outlet,
            detectedChannel: detection.detectedChannel,
            cleanItemName: detection.cleanItemName,
            detectionReason: detection.detectionReason,
            assignedOutlet: overrideVal || detection.outlet,
            isManuallyOverridden: Boolean(overrideVal),
          });
        } else {
          const existing = map.get(normKey)!;
          existing.occurrences++;
          existing.sampleRevenue += rawRev;
        }
      });
    });

    return Array.from(map.values());
  }, [loadedFiles, outletOverrides]);

  const filteredPreviewItems = useMemo(() => {
    return previewItemsWithOutlet.filter((item) => {
      const q = outletRemapSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.rawItemName.toLowerCase().includes(q) ||
        item.cleanItemName.toLowerCase().includes(q) ||
        (item.detectedChannel && item.detectedChannel.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q));

      let matchesFilter = true;
      if (outletRemapFilter === 'whitefield') matchesFilter = item.assignedOutlet === 'whitefield';
      if (outletRemapFilter === 'banaswadi') matchesFilter = item.assignedOutlet === 'banaswadi';
      if (outletRemapFilter === 'overridden') matchesFilter = item.isManuallyOverridden;

      return matchesSearch && matchesFilter;
    });
  }, [previewItemsWithOutlet, outletRemapSearch, outletRemapFilter]);

  const handleItemOutletChange = (rawItemName: string, newOutlet: SupportedOutlet) => {
    const key = rawItemName.toLowerCase().trim();
    saveOutletOverride(rawItemName, newOutlet);
    setOutletOverrides((prev) => ({
      ...prev,
      [key]: newOutlet,
    }));
    showToast(`Remapped "${rawItemName}" to ${newOutlet === 'whitefield' ? 'Whitefield' : 'Banaswadi'}.`);
  };

  const handleBulkSetOutlet = (targetOutlet: SupportedOutlet, itemsToUpdate: typeof filteredPreviewItems) => {
    const updated = { ...outletOverrides };
    itemsToUpdate.forEach((item) => {
      const key = item.rawItemName.toLowerCase().trim();
      updated[key] = targetOutlet;
      saveOutletOverride(item.rawItemName, targetOutlet);
    });
    setOutletOverrides(updated);
    showToast(`Set ${itemsToUpdate.length} items to ${targetOutlet === 'whitefield' ? 'Whitefield' : 'Banaswadi'}.`);
  };

  const handleResetOverrides = () => {
    localStorage.removeItem('menumind_outlet_overrides_v1');
    setOutletOverrides({});
    showToast('Reset all items to automated detection rules.');
  };

  // Final step: send files + confirmed layout/mappings to the API, which parses and stores them.
  const handleConfirmAndProcess = async (replace = false) => {
    if (loadedFiles.length === 0 || isProcessing) return;

    for (const item of loadedFiles) {
      if (!item.mapping.itemName || !item.mapping.quantity || !item.mapping.revenue) {
        setErrorMessage(
          `Please map Item Name, Quantity, and Revenue for "${item.file.name}".`
        );
        return;
      }
    }

    // Client-side preview to determine upload type before sending
    const previewResults = loadedFiles.map((fp) => {
      const extracted = extractRecordsWithMapping(fp.rawRows, fp.mapping, fp.file.name, outletOverrides);
      return { fileName: fp.file.name, records: extracted.validRecords, invalidCount: extracted.invalidCount };
    });
    const { mergedRecords: previewRecords, reconciliation: previewRec } = mergeSalesRecords(previewResults);
    if (previewRecords.length === 0) {
      setErrorMessage('No valid sales records could be extracted with the selected mappings.');
      return;
    }

    let detectedType: 'outlet' | 'highest_selling' = 'highest_selling';
    if (activePresetId === 'petpooja-item-wise' || previewRec.hasOutletGrouping) {
      detectedType = 'outlet';
    }

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const result = await posSalesApi.upload({
        files: loadedFiles.map((f) => f.file),
        layout: { ...posConfig, presetId: activePresetId },
        mappings: Object.fromEntries(loadedFiles.map((f) => [f.file.name, f.mapping])),
        outletOverrides,
        uploadType: detectedType,
        replace,
      });

      if ((result.channelSummaries || []).length > 0 && result.batches.length === 0) {
        loadChannelSummaries(result.channelSummaries);
        return;
      }

      const inserted = result.batches.reduce((s, b) => s + b.insertedRows, 0);
      const dupes = result.batches.reduce((s, b) => s + b.duplicateRows, 0);
      showToast(
        `Saved ${inserted} sales row(s) to the database${dupes ? ` (${dupes} duplicate row(s) skipped)` : ''}.`
      );
      onDataLoaded(result.records, result.reconciliation, detectedType);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409 && !replace) {
        const names = Array.isArray(err.invalid) ? err.invalid.map((d: any) => d.fileName).join(', ') : 'These files';
        if (window.confirm(`${err.message}\n\nAlready saved: ${names}\n\nOK = replace the saved data with this upload.\nCancel = keep the saved data and add nothing.`)) {
          setIsProcessing(false);
          await handleConfirmAndProcess(true);
          return;
        }
      }
      setErrorMessage(err?.message || 'Upload failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const activeFile = loadedFiles[activeFileIndex];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Primary Section Switcher: POS Sales Upload vs Aggregator Payouts */}
      <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-2">
        <button
          onClick={() => setActiveUploadTab('pos')}
          className={`flex-1 w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeUploadTab === 'pos'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-teal-600" />
          <span>1. Upload POS Sales Data (Petpooja Excel / CSV)</span>
          {currentReconciliation.totalRawRows > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-100 text-teal-800 font-extrabold">
              {currentReconciliation.totalRawRows} rows
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveUploadTab('payouts')}
          className={`flex-1 w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeUploadTab === 'payouts'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span>2. Upload Swiggy, Zomato, Ownly Payouts &amp; Match Revenue</span>
          {payouts.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-extrabold">
              {payouts.length} statements
            </span>
          )}
        </button>
      </div>

      {activeUploadTab === 'payouts' ? (
        <AggregatorPayoutUploadSection
          payouts={payouts}
          onUpdatePayouts={onUpdatePayouts}
          rawRecords={rawRecords}
          parentDishes={parentDishes}
          purchases={purchases}
          cateringOrders={cateringOrders}
          staffDirectory={staffDirectory}
          operatingExpenses={operatingExpenses}
          onNavigateTab={onNavigateTab}
          onOpenSupabaseModal={onOpenSupabaseModal}
        />
      ) : (
        <>
          {/* Recommendation Banner if POS data is active */}
          {currentReconciliation.totalRawRows > 0 && (
            <div className="bg-gradient-to-r from-teal-50 via-indigo-50 to-teal-50 border border-teal-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-teal-600 text-white shadow-xs">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    POS Sales Data Active ({currentReconciliation.totalRawRows} records &bull; {formatINR(currentReconciliation.totalReportedRevenue)})
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Match these sales records with Swiggy, Zomato, and Ownly monthly/weekly payouts to calculate net realization, reconcile Hyperpure bills, and verify break-even point.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveUploadTab('payouts')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-xs shrink-0 cursor-pointer"
              >
                <span>Upload Aggregator Payouts &rarr;</span>
              </button>
            </div>
          )}

          {/* Upload Header Card */}
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Upload POS Sales Data</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Supports Petpooja and other POS system exports in Excel (.xlsx, .xls) and CSV (.csv). Records automatically update and persist to Supabase PostgreSQL database tables (<code>raw_pos_sales_records</code> &amp; <code>pos_import_batches</code>).
                </p>
              </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfigSettings(!showConfigSettings)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 transition-colors"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>POS File Layout Settings</span>
            </button>
            {DEMO_ENABLED && (
            <button
              onClick={onLoadDemoData}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-xs transition-colors shrink-0"
              title="Load demo data for testing"
            >
              <Database className="w-4 h-4 text-slate-950" />
              Load Sample Demo Data
            </button>
            )}
            {onClearAllData && (
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to remove all data and reset to a clean blank state?')) {
                    onClearAllData();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 font-semibold text-xs transition-colors shrink-0"
                title="Wipe all data and reset to empty state"
              >
                <Trash2 className="w-4 h-4 text-slate-500 hover:text-rose-600" />
                <span>Clear All Data</span>
              </button>
            )}
          </div>
        </div>

        {/* Global POS File Layout Config Drawer/Card */}
        {(showConfigSettings || currentStep === 'layout_config') && (
          <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4 shadow-xl border border-slate-700/80">
            {/* Header with Title and Active Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
                  <TableProperties className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-100 flex items-center gap-2">
                    <span>POS File Layout &amp; Row Configuration</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                      Editable &amp; Saved for Future
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Customize Column Heading Row, Row Heading Row, and Footer Summary Rows to skip for <strong>Item Wise Sales Report</strong> and <strong>Highest Selling Items</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700">
                  Active Format: <strong className="text-teal-300 font-bold">{presets.find((p) => p.id === activePresetId)?.name || posConfig.presetName || 'Selected Format'}</strong>
                </span>
              </div>
            </div>

            {/* In-Panel Save Notification */}
            {saveNotification && (
              <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between gap-2 animate-fade-in shadow-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{saveNotification}</span>
                </div>
                <button
                  onClick={() => setSaveNotification(null)}
                  className="text-emerald-400 hover:text-white text-xs font-bold px-2 py-0.5"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Presets Grid */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Select Report Format to Configure or Upload:</span>
                <span className="text-[11px] text-slate-400 font-normal">
                  Click any card to load and edit its row parameters
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {presets.map((preset) => {
                  const isSelected = preset.id === activePresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`p-3 rounded-xl text-left text-xs transition-all border flex flex-col justify-between gap-2.5 relative cursor-pointer ${
                        isSelected
                          ? 'bg-gradient-to-br from-teal-900/90 to-slate-900 border-teal-400 text-white shadow-md ring-2 ring-teal-500/40'
                          : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/80 hover:border-slate-600'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-100 text-xs">{preset.name}</span>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse shrink-0"></span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                          {preset.description}
                        </p>
                      </div>

                      {/* Current Config Badges */}
                      <div className="pt-2 border-t border-slate-700/60 flex flex-wrap gap-1 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-mono font-semibold">
                          Col Heading: #{preset.config.headerRow}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-semibold">
                          Row Heading: #{preset.config.dataStartRow}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-semibold">
                          Skip Footer: {preset.config.skipFooterRows || 0}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row Number Configuration Controls */}
            <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-teal-400" />
                  <span>Configure Row Numbers for: <strong className="text-teal-300">{presets.find((p) => p.id === activePresetId)?.name}</strong></span>
                </span>
                <span className="text-[11px] text-slate-400">
                  All 3 parameters are editable and saved per report type
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 1. Column Heading Row */}
                <div className="space-y-1.5 bg-slate-900/90 p-3 rounded-xl border border-slate-700">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200">
                      Column Heading Row
                    </label>
                    <span className="text-xs text-teal-400 font-mono font-bold bg-teal-500/20 px-2 py-0.5 rounded border border-teal-500/30">
                      Row #{posConfig.headerRow}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={posConfig.headerRow}
                    onChange={(e) => handleConfigChange('headerRow', e.target.value)}
                    className="w-full p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm font-black text-white focus:ring-2 focus:ring-teal-400 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400 block leading-tight">
                    Row containing column titles (Item Name, Quantity, Total Net Amount). Default: <strong>Row 5</strong> for Item-wise, <strong>Row 6</strong> for Highest Selling.
                  </span>
                </div>

                {/* 2. Row Heading Row (Dish Data Begins) */}
                <div className="space-y-1.5 bg-slate-900/90 p-3 rounded-xl border border-slate-700">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200">
                      Row Heading Row (Data Start)
                    </label>
                    <span className="text-xs text-emerald-400 font-mono font-bold bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                      Row #{posConfig.dataStartRow}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={posConfig.dataStartRow}
                    onChange={(e) => handleConfigChange('dataStartRow', e.target.value)}
                    className="w-full p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm font-black text-white focus:ring-2 focus:ring-emerald-400 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400 block leading-tight">
                    First row where dish item records begin (skips report banners). Default: <strong>Row 6</strong> for Item-wise, <strong>Row 11</strong> for Highest Selling.
                  </span>
                </div>

                {/* 3. Footer Summary Rows to Skip */}
                <div className="space-y-1.5 bg-slate-900/90 p-3 rounded-xl border border-slate-700">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200">
                      Footer Summary Rows to Skip
                    </label>
                    <span className="text-xs text-amber-400 font-mono font-bold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                      {posConfig.skipFooterRows || 0} rows
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={posConfig.skipFooterRows ?? 1}
                    onChange={(e) => handleConfigChange('skipFooterRows', e.target.value)}
                    className="w-full p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm font-black text-white focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400 block leading-tight">
                    Number of bottom total rows to skip at the end of the sheet (e.g. Grand Total, Total Qty, Printed Timestamps).
                  </span>
                </div>
              </div>

              {/* Action Buttons & Save Configuration Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-700/80">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveActivePreset}
                    className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer"
                    title="Save this configuration permanently for future uploads"
                  >
                    <Save className="w-4 h-4 text-slate-950" />
                    <span>Save Configuration for Future</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetActivePreset}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
                    title="Restore default Petpooja row layout"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Reset to Default</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs">
                    <input
                      type="checkbox"
                      checked={saveAsDefault}
                      onChange={(e) => {
                        setSaveAsDefault(e.target.checked);
                        if (e.target.checked) {
                          savePosLayoutConfig(posConfig);
                          savePosPreset(activePresetId, posConfig);
                          showToast('Auto-save enabled for this report layout.');
                        }
                      }}
                      className="rounded text-teal-500 focus:ring-teal-400"
                    />
                    <span>Auto-save changes for future uploads</span>
                  </label>

                  {currentStep === 'layout_config' && (
                    <button
                      type="button"
                      onClick={handleProceedToColumnMapping}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer shrink-0"
                    >
                      <span>Proceed to Column Mapping</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Drag & Drop Upload Zone (always accessible) */}
        <div
          onClick={openFilePicker}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mt-4 border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer relative group ${
            isDragging
              ? 'border-teal-500 bg-teal-50/50 scale-[1.01]'
              : 'border-slate-300 hover:border-teal-500 bg-slate-50 hover:bg-teal-50/20'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={handleFileChange}
            onClick={(e) => {
              (e.target as HTMLInputElement).value = '';
            }}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <Upload className="w-7 h-7" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-800 block">
                {isDragging ? 'Drop your Petpooja sales reports now' : 'Click anywhere here or drag & drop Petpooja files'}
              </span>
              <p className="text-xs text-slate-500 mt-1">
                Supports Excel (.xlsx, .xls) and CSV (.csv) exports
              </p>
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openFilePicker();
              }}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Browse Files (.xlsx, .xls, .csv)</span>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {channelSummaryResult && channelSummaryResult.length > 0 && (
          <div className="space-y-4">
            {channelSummaryResult.map((cs) => (
              <div key={cs.batchId} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-bold">{cs.reportName || 'Channel sales summary'} saved</span>
                  </div>
                  <span className="text-xs text-emerald-800 font-medium">
                    {cs.period.from} to {cs.period.to} · {formatNumber(cs.totalBills)} bills · {formatINR(cs.totalNetSales)} net sales
                    {cs.reportTotalVerified ? ' · matches report Total ✓' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {cs.byOutlet.map((o) => (
                    <div key={o.outlet_id} className="bg-white rounded-lg border border-emerald-100 p-2.5">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{o.outlet_id}</p>
                      <p className="text-sm font-bold text-slate-900">{formatINR(o.netSales)}</p>
                      <p className="text-[11px] text-slate-500">{formatNumber(o.bills)} bills</p>
                    </div>
                  ))}
                  {cs.byChannel.map((c) => (
                    <div key={c.channel} className="bg-white rounded-lg border border-emerald-100 p-2.5">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{c.channel}</p>
                      <p className="text-sm font-bold text-slate-900">{formatINR(c.netSales)}</p>
                      <p className="text-[11px] text-slate-500">{formatNumber(c.bills)} bills</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto bg-white rounded-lg border border-emerald-100">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Restaurant</th>
                        <th className="text-left px-3 py-2 font-semibold">Order Type</th>
                        <th className="text-left px-3 py-2 font-semibold">Sub Order Type</th>
                        <th className="text-left px-3 py-2 font-semibold">Outlet</th>
                        <th className="text-left px-3 py-2 font-semibold">Channel</th>
                        <th className="text-right px-3 py-2 font-semibold">Bills</th>
                        <th className="text-right px-3 py-2 font-semibold">Net Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cs.rows.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-700">{r.restaurant}</td>
                          <td className="px-3 py-1.5 text-slate-600">{r.orderType}</td>
                          <td className="px-3 py-1.5 text-slate-900 font-medium">{r.subOrderType}</td>
                          <td className="px-3 py-1.5 capitalize">{r.outlet}</td>
                          <td className="px-3 py-1.5 capitalize">{r.channel}</td>
                          <td className="px-3 py-1.5 text-right">{formatNumber(r.bills)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold">{formatINR(r.netSales)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {cs.warnings.length > 0 && <p className="text-[11px] text-amber-700">{cs.warnings.join(' ')}</p>}
                <p className="text-[11px] text-slate-600">
                  This report has channel totals (no dish names), so it is used for revenue matching in the
                  Swiggy / Zomato / Ownly payouts tab. Upload an Item Wise report for dish analytics.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STEP 1: INTERACTIVE VISUAL SHEET INSPECTOR (When in layout_config) */}
      {currentStep === 'layout_config' && activeFile && (
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold border border-teal-300 mb-1.5">
                <TableProperties className="w-3.5 h-3.5" />
                Step 1: Visual Sheet Row Inspector
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Inspect Raw Rows for: {activeFile.file.name}
              </h3>
              <p className="text-xs text-slate-500">
                Click any row in the spreadsheet preview below to set it as the <strong>Column Heading Row</strong> or <strong>First Dish Data Row</strong>.
              </p>
            </div>

            <button
              type="button"
              onClick={handleProceedToColumnMapping}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 shrink-0"
            >
              <span>Looks Good &rarr; Proceed to Column Mapping</span>
            </button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="font-semibold text-slate-700">Row Guide:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-teal-500"></span>
              <span className="font-medium text-slate-800">
                Row #{posConfig.headerRow}: Column Heading Row ({activeFile.headers.length} columns detected)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500"></span>
              <span className="font-medium text-slate-800">
                Row #{posConfig.dataStartRow}: Row Heading Row / Dish Data Begins ({activeFile.rawRows.length} items extracted)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-500"></span>
              <span className="font-medium text-slate-800">
                Skipping bottom {posConfig.skipFooterRows || 0} footer summary rows
              </span>
            </div>
          </div>

          {/* Interactive Sheet Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-20 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-16 text-center">Row #</th>
                  <th className="py-2.5 px-3 w-52">Status / Role</th>
                  <th className="py-2.5 px-3">Col A</th>
                  <th className="py-2.5 px-3">Col B</th>
                  <th className="py-2.5 px-3">Col C</th>
                  <th className="py-2.5 px-3">Col D</th>
                  <th className="py-2.5 px-3">Col E</th>
                  <th className="py-2.5 px-3 text-right">Row Assignment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {activeFile.rawMatrix.map((rowCells, rIdx) => {
                  const rowNum = rIdx + 1;
                  const isHeader = rowNum === posConfig.headerRow;
                  const isDataStart = rowNum === posConfig.dataStartRow;
                  const isMetadata = rowNum < posConfig.headerRow;
                  const isIntermediate = rowNum > posConfig.headerRow && rowNum < posConfig.dataStartRow;
                  const isDataRow = rowNum >= posConfig.dataStartRow;

                  return (
                    <tr
                      key={rowNum}
                      className={`transition-colors ${
                        isHeader
                          ? 'bg-teal-50/90 font-bold text-teal-950 border-y-2 border-teal-500'
                          : isDataStart
                          ? 'bg-emerald-50/90 font-bold text-emerald-950 border-y-2 border-emerald-500'
                          : isMetadata
                          ? 'bg-slate-50 text-slate-500 italic'
                          : isIntermediate
                          ? 'bg-amber-50/40 text-slate-500'
                          : 'bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <td className="py-2 px-3 text-center font-bold">
                        {rowNum}
                      </td>
                      <td className="py-2 px-3 font-sans">
                        {isHeader && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-600 text-white shadow-2xs">
                            COLUMN HEADING ROW
                          </span>
                        )}
                        {isDataStart && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
                            ROW HEADING / DATA START
                          </span>
                        )}
                        {isMetadata && (
                          <span className="text-[10px] text-slate-400">Report Header / Title Meta</span>
                        )}
                        {isIntermediate && (
                          <span className="text-[10px] text-amber-600">Subheader / Intermediary</span>
                        )}
                        {isDataRow && !isDataStart && (
                          <span className="text-[10px] text-slate-500">Dish Sales Data Line</span>
                        )}
                      </td>
                      <td className="py-2 px-3 truncate max-w-[150px]">
                        {String(rowCells[0] !== undefined ? rowCells[0] : '')}
                      </td>
                      <td className="py-2 px-3 truncate max-w-[150px]">
                        {String(rowCells[1] !== undefined ? rowCells[1] : '')}
                      </td>
                      <td className="py-2 px-3 truncate max-w-[150px]">
                        {String(rowCells[2] !== undefined ? rowCells[2] : '')}
                      </td>
                      <td className="py-2 px-3 truncate max-w-[150px]">
                        {String(rowCells[3] !== undefined ? rowCells[3] : '')}
                      </td>
                      <td className="py-2 px-3 truncate max-w-[150px]">
                        {String(rowCells[4] !== undefined ? rowCells[4] : '')}
                      </td>
                      <td className="py-2 px-3 text-right font-sans">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isHeader && (
                            <button
                              type="button"
                              onClick={() => setRowAsHeader(rowNum)}
                              className="px-2 py-1 rounded-md text-[10px] font-bold bg-white hover:bg-teal-50 text-teal-800 border border-slate-300 hover:border-teal-400 cursor-pointer shadow-xs"
                              title={`Set Row #${rowNum} as Column Heading Row`}
                            >
                              Set as Column Heading
                            </button>
                          )}
                          {!isDataStart && (
                            <button
                              type="button"
                              onClick={() => setRowAsDataStart(rowNum)}
                              className="px-2 py-1 rounded-md text-[10px] font-bold bg-white hover:bg-emerald-50 text-emerald-800 border border-slate-300 hover:border-emerald-400 cursor-pointer shadow-xs"
                              title={`Set Row #${rowNum} as Row Heading / Data Start Row`}
                            >
                              Set as Row Heading
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 2: COLUMN MAPPING ACTIVITY */}
      {currentStep === 'column_mapping' && loadedFiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300 mb-1.5">
                <Check className="w-3.5 h-3.5" />
                Step 2: Column Mapping Activity
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Confirm Mapped Columns for Extracted Dish Records
              </h3>
              <p className="text-xs text-slate-500">
                Parsed using Header Row #{posConfig.headerRow} and Data Row #{posConfig.dataStartRow}.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentStep('layout_config')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sheet Row Setup</span>
              </button>

              <button
                type="button"
                onClick={() => handleConfirmAndProcess()}
                  disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all"
              >
                <span>{isProcessing ? 'Saving to database…' : 'Confirm & Save Records'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Files List and Mapping Cards */}
          {loadedFiles.map((item, fIdx) => (
            <div
              key={item.file.name}
              className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-teal-600" />
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">{item.file.name}</h4>
                    <span className="text-[11px] text-slate-500">
                      {item.rawRows.length.toLocaleString()} valid dish items extracted &bull;{' '}
                      {item.headers.length} columns detected from Row #{posConfig.headerRow}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(fIdx)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Column Mapping Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* Item Name (Required) */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 flex items-center gap-1">
                    Item / Dish Name <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={item.mapping.itemName || ''}
                    onChange={(e) => updateMappingField(fIdx, 'itemName', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 font-medium text-slate-800 focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">-- Select Column --</option>
                    {item.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Variant Name (Optional) */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Variant / Portion Column</label>
                  <select
                    value={item.mapping.variantName || ''}
                    onChange={(e) => updateMappingField(fIdx, 'variantName', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 font-medium text-slate-800 focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">(None - embedded in Item Name)</option>
                    {item.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity Sold (Required) */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 flex items-center gap-1">
                    Quantity Sold <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={item.mapping.quantity || ''}
                    onChange={(e) => updateMappingField(fIdx, 'quantity', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 font-medium text-slate-800 focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">-- Select Column --</option>
                    {item.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Total Revenue / Net Sales (Required) */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 flex items-center gap-1">
                    Revenue / Net Sales <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={item.mapping.revenue || ''}
                    onChange={(e) => updateMappingField(fIdx, 'revenue', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 font-medium text-slate-800 focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">-- Select Column --</option>
                    {item.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Column */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Sales Date</label>
                  <select
                    value={item.mapping.date || ''}
                    onChange={(e) => updateMappingField(fIdx, 'date', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 font-medium text-slate-800 focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">(No date in this report)</option>
                    {item.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Column */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Category</label>
                  <select
                    value={item.mapping.category || ''}
                    onChange={(e) => updateMappingField(fIdx, 'category', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 font-medium text-slate-800 focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">(None)</option>
                    {item.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sales Channel */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Sales Channel / Platform</label>
                  <select
                    value={item.mapping.salesChannel || ''}
                    onChange={(e) => updateMappingField(fIdx, 'salesChannel', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 font-medium text-slate-800 focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">(None)</option>
                    {item.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Returns / Cancellations */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Returns / Cancelled Column</label>
                  <select
                    value={item.mapping.returns || ''}
                    onChange={(e) => updateMappingField(fIdx, 'returns', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 font-medium text-slate-800 focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">(None)</option>
                    {item.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sample Data Extracted */}
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2">Row</th>
                      <th className="p-2 text-teal-800">Mapped Item Name</th>
                      <th className="p-2 text-teal-800">Mapped Qty</th>
                      <th className="p-2 text-teal-800">Mapped Revenue</th>
                      <th className="p-2">Date</th>
                      <th className="p-2">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {item.rawRows.slice(0, 5).map((sr, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50">
                        <td className="p-2 text-slate-400 font-mono">#{posConfig.dataStartRow + rIdx}</td>
                        <td className="p-2 font-medium text-slate-900">
                          {sr[item.mapping.itemName] || '-'}
                        </td>
                        <td className="p-2 text-slate-700">
                          {sr[item.mapping.quantity] || '-'}
                        </td>
                        <td className="p-2 font-semibold text-slate-900">
                          ₹{sr[item.mapping.revenue] || '-'}
                        </td>
                        <td className="p-2 text-slate-500">
                          {item.mapping.date ? sr[item.mapping.date] || '-' : '-'}
                        </td>
                        <td className="p-2 text-slate-500">
                          {item.mapping.category ? sr[item.mapping.category] || '-' : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* OUTLET ATTRIBUTION & REMAPPING (BEFORE CONFIRMATION) */}
          {previewItemsWithOutlet.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-900 text-xs font-bold border border-teal-300 mb-1.5">
                    <Building2 className="w-3.5 h-3.5 text-teal-700" />
                    <span>Review &amp; Remap Outlets Before Confirmation</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    Verify Outlet Attribution: Banaswadi vs. Whitefield
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <strong>Rule:</strong> If &apos;-&apos; is found, right side is Channel (Swiggy/Zomato/Ownly) and left side ending with &apos;W&apos;/&apos;w&apos; &rarr; <strong>Whitefield</strong>; otherwise <strong>Banaswadi</strong>. If no &apos;-&apos; found, Take Away/Delivery &rarr; <strong>Banaswadi</strong>, Dine-in &rarr; <strong>Whitefield</strong>. You can correct any item below.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleConfirmAndProcess()}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all shrink-0 cursor-pointer"
                >
                  <span>{isProcessing ? 'Saving to database…' : 'Confirm & Save Records'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Status Metric Badges */}
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold border border-slate-300">
                  Total Items: {previewItemsWithOutlet.length}
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-900 font-bold border border-amber-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Banaswadi: {previewItemsWithOutlet.filter((i) => i.assignedOutlet === 'banaswadi').length} items
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-teal-50 text-teal-900 font-bold border border-teal-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                  Whitefield: {previewItemsWithOutlet.filter((i) => i.assignedOutlet === 'whitefield').length} items
                </span>
                {previewItemsWithOutlet.some((i) => i.isManuallyOverridden) && (
                  <span className="px-3 py-1.5 rounded-xl bg-purple-50 text-purple-900 font-bold border border-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    User Remapped: {previewItemsWithOutlet.filter((i) => i.isManuallyOverridden).length} items
                  </span>
                )}
              </div>

              {/* Filter, Search & Bulk Actions Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search item or channel..."
                      value={outletRemapSearch}
                      onChange={(e) => setOutletRemapSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500 w-44 sm:w-56"
                    />
                  </div>

                  <div className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setOutletRemapFilter('all')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                        outletRemapFilter === 'all'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      All ({previewItemsWithOutlet.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutletRemapFilter('whitefield')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                        outletRemapFilter === 'whitefield'
                          ? 'bg-teal-600 text-white'
                          : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      Whitefield ({previewItemsWithOutlet.filter((i) => i.assignedOutlet === 'whitefield').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutletRemapFilter('banaswadi')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                        outletRemapFilter === 'banaswadi'
                          ? 'bg-amber-600 text-white'
                          : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      Banaswadi ({previewItemsWithOutlet.filter((i) => i.assignedOutlet === 'banaswadi').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutletRemapFilter('overridden')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                        outletRemapFilter === 'overridden'
                          ? 'bg-purple-600 text-white'
                          : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      Remapped ({previewItemsWithOutlet.filter((i) => i.isManuallyOverridden).length})
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleBulkSetOutlet('whitefield', filteredPreviewItems)}
                    className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 font-bold text-[11px] transition-colors"
                    title="Set all currently filtered items to Whitefield"
                  >
                    Set Filtered &rarr; Whitefield
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkSetOutlet('banaswadi', filteredPreviewItems)}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[11px] transition-colors"
                    title="Set all currently filtered items to Banaswadi"
                  >
                    Set Filtered &rarr; Banaswadi
                  </button>
                  {previewItemsWithOutlet.some((i) => i.isManuallyOverridden) && (
                    <button
                      type="button"
                      onClick={handleResetOverrides}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-300 font-semibold text-[11px] transition-colors"
                      title="Reset all manual corrections to automated rules"
                    >
                      Reset Overrides
                    </button>
                  )}
                </div>
              </div>

              {/* Remapping Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[380px] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Raw POS Item Name</th>
                      <th className="py-2.5 px-3">Clean Core Dish</th>
                      <th className="py-2.5 px-3">Channel</th>
                      <th className="py-2.5 px-3">Attribution Logic / Reason</th>
                      <th className="py-2.5 px-3 text-center w-56">Assigned Outlet (Click to Remap)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {filteredPreviewItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No items match the current search or filter.
                        </td>
                      </tr>
                    ) : (
                      filteredPreviewItems.map((item, idx) => {
                        const isWhitefield = item.assignedOutlet === 'whitefield';
                        return (
                          <tr
                            key={item.rawItemName}
                            className={`transition-colors ${
                              item.isManuallyOverridden
                                ? 'bg-purple-50/40 hover:bg-purple-50/70'
                                : isWhitefield
                                ? 'bg-teal-50/20 hover:bg-teal-50/40'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2 px-3 font-mono font-medium text-slate-900 max-w-xs truncate">
                              <span title={item.rawItemName}>{item.rawItemName}</span>
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-800">
                              {item.cleanItemName}
                            </td>
                            <td className="py-2 px-3">
                              {item.detectedChannel ? (
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px]">
                                  {item.detectedChannel}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-600 text-[10px]">
                              <span>{item.detectionReason}</span>
                              {item.isManuallyOverridden && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[9px] uppercase">
                                  Remapped
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="inline-flex rounded-lg p-0.5 bg-slate-200 border border-slate-300">
                                <button
                                  type="button"
                                  onClick={() => handleItemOutletChange(item.rawItemName, 'banaswadi')}
                                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                    !isWhitefield
                                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                  title="Assign this item to Banaswadi Outlet"
                                >
                                  Banaswadi
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleItemOutletChange(item.rawItemName, 'whitefield')}
                                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                    isWhitefield
                                      ? 'bg-teal-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                  title="Assign this item to Whitefield Outlet"
                                >
                                  Whitefield
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Confirm Bar */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-500">
                  Showing {filteredPreviewItems.length} of {previewItemsWithOutlet.length} items. All selections will be applied upon loading.
                </span>
                <button
                  type="button"
                  onClick={() => handleConfirmAndProcess()}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  <span>{isProcessing ? 'Saving to database…' : 'Confirm & Save Records'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current Dataset Reconciliation Audit Card */}
      {currentReconciliation.validRows > 0 && (
        <div className="bg-slate-900 text-white rounded-xl p-6 border border-slate-800 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">Active Dataset Reconciliation Report</h3>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-teal-400 font-semibold border border-slate-700">
              Granularity: {currentReconciliation.detectedGranularity.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-2">
            <div>
              <span className="text-slate-400 block">Valid Processed Rows</span>
              <span className="text-lg font-bold text-white">
                {currentReconciliation.validRows.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Duplicates Filtered</span>
              <span className="text-lg font-bold text-amber-400">
                {currentReconciliation.duplicatesSkipped.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Total Reconciled Revenue</span>
              <span className="text-lg font-bold text-teal-300">
                {formatINR(currentReconciliation.totalReportedRevenue)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Total Portions Sold</span>
              <span className="text-lg font-bold text-white">
                {formatNumber(currentReconciliation.totalUnitsSold)}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800 flex items-center justify-between">
            <span>
              Files: {currentReconciliation.fileNames.join(', ')}
            </span>
            <span>
              {currentReconciliation.dateRangeStart
                ? `Covering ${currentReconciliation.dateRangeStart} to ${currentReconciliation.dateRangeEnd}`
                : 'Aggregate totals without daily timestamps'}
            </span>
          </div>
        </div>
      )}
    </>
  )}
</div>
  );
};