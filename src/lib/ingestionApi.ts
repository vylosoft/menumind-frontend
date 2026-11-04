import { apiRequest } from './apiClient';
import { ColumnMapping, PosLayoutConfig, RawSalesRecord, ReconciliationReport } from '../types/restaurant';
import { ChannelPosMatchReport, PlatformPayoutRecord } from '../types/finance';

export type Outlet = 'banaswadi' | 'whitefield';
export type Platform = 'swiggy' | 'zomato' | 'ownly';

export interface PosUploadBatchResult {
  batchId: string;
  fileName: string;
  sheetName: string;
  insertedRows: number;
  duplicateRows: number;
  invalidRows: number;
  returnRows: number;
  insertedRevenue: number;
  invalidSamples: { row: number; reason: string }[];
}

export interface ChannelSummaryUploadResult {
  batchId: string;
  fileName: string;
  reportName: string | null;
  period: { from: string; to: string };
  insertedRows: number;
  duplicateRows: number;
  totalBills: number;
  totalNetSales: number;
  reportTotalVerified: boolean;
  byChannel: { channel: string; bills: number; netSales: number }[];
  byOutlet: { outlet_id: string; bills: number; netSales: number }[];
  rows: {
    restaurant: string;
    orderType: string;
    subOrderType: string;
    brand: string | null;
    channel: string;
    outlet: string;
    bills: number;
    netSales: number;
  }[];
  warnings: string[];
}

export interface PosUploadResponse {
  reportType: 'item_sales' | 'channel_summary' | 'mixed';
  channelSummaries: ChannelSummaryUploadResult[];
  batches: PosUploadBatchResult[];
  records: RawSalesRecord[];
  reconciliation: ReconciliationReport;
}

export interface PayoutUploadResponse {
  files: Array<{
    batchId: string;
    fileName: string;
    platform: Platform;
    periodType: 'monthly' | 'weekly';
    insertedRows: number;
    duplicateRows: number;
    warnings: string[];
    payouts: PlatformPayoutRecord[];
  }>;
  payouts: PlatformPayoutRecord[];
  summary: { recordCount: number; totalGrossSales: number; totalNetPayout: number; totalHyperpureDeductions: number };
}

interface Paged<T> {
  result: T[];
  count: number;
  page: number;
  perPage: number;
}

const cleanMapping = (m: ColumnMapping) =>
  Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === 'string' && v.trim() !== '')) as Partial<ColumnMapping>;

export const posSalesApi = {
  upload(params: {
    files: File[];
    layout: PosLayoutConfig;
    mappings: Record<string, ColumnMapping>;
    outletOverrides?: Record<string, Outlet>;
    uploadType?: 'outlet' | 'highest_selling';
    replace?: boolean;
  }) {
    const form = new FormData();
    params.files.forEach((f) => form.append('files', f, f.name));
    form.append(
      'layout',
      JSON.stringify({
        headerRow: params.layout.headerRow,
        dataStartRow: params.layout.dataStartRow,
        sheetIndex: params.layout.sheetIndex || 0,
        skipFooterRows: params.layout.skipFooterRows || 0,
      })
    );
    if (params.layout.presetId) form.append('presetId', params.layout.presetId);
    form.append(
      'mappings',
      JSON.stringify(Object.fromEntries(Object.entries(params.mappings).map(([k, v]) => [k, cleanMapping(v)])))
    );
    if (params.outletOverrides && Object.keys(params.outletOverrides).length) {
      form.append('outletOverrides', JSON.stringify(params.outletOverrides));
    }
    if (params.uploadType) form.append('uploadType', params.uploadType);
    form.append('posSystem', 'petpooja');
    form.append('replace', String(Boolean(params.replace)));
    return apiRequest<PosUploadResponse>('/api/pos-sales/upload', { method: 'POST', body: form });
  },

  /** Loads every stored (non-return) POS record, page by page. */
  async fetchAllRecords(maxRecords = 200_000): Promise<RawSalesRecord[]> {
    const perPage = 5000;
    const out: RawSalesRecord[] = [];
    for (let page = 1; out.length < maxRecords; page++) {
      const res = await apiRequest<Paged<RawSalesRecord>>('/api/pos-sales/records', { query: { page, perPage } });
      out.push(...res.result);
      if (res.result.length < perPage || out.length >= res.count) break;
    }
    return out;
  },

  deleteBatch: (id: string) => apiRequest(`/api/pos-sales/batches/${id}`, { method: 'DELETE' }),
};

export const payoutsApi = {
  upload(params: {
    files: File[];
    platform?: Platform;
    outletId?: Outlet;
    month?: string;
    periodType?: 'monthly' | 'weekly';
    replace?: boolean;
  }) {
    const form = new FormData();
    params.files.forEach((f) => form.append('files', f, f.name));
    if (params.platform) form.append('platform', params.platform);
    if (params.outletId) form.append('outletId', params.outletId);
    if (params.month) form.append('month', params.month);
    if (params.periodType) form.append('periodType', params.periodType);
    form.append('replace', String(Boolean(params.replace)));
    return apiRequest<PayoutUploadResponse>('/api/payouts/upload', { method: 'POST', body: form });
  },

  async fetchAll(): Promise<PlatformPayoutRecord[]> {
    const perPage = 500;
    const out: PlatformPayoutRecord[] = [];
    for (let page = 1; page <= 100; page++) {
      const res = await apiRequest<Paged<PlatformPayoutRecord>>('/api/payouts', { query: { page, perPage } });
      out.push(...res.result);
      if (res.result.length < perPage || out.length >= res.count) break;
    }
    return out;
  },

  deleteBatch: (id: string) => apiRequest(`/api/payouts/batches/${id}`, { method: 'DELETE' }),

  reconciliation: (month: string, outletId: Outlet | 'consolidated' = 'consolidated') =>
    apiRequest<ChannelPosMatchReport & { overallVariancePct: number }>('/api/payouts/reconciliation', {
      query: { month, outletId },
    }),
};
