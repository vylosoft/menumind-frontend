import pg from 'pg';
import {
  applyZomatoBreakupToPayoutRecord,
  ensureZomatoBreakupModelOnRecord,
} from '../utils/zomatoPayoutModel';
const { Pool } = pg;

// Supabase Connection Configuration
// Host db.ognarhapvjisjespxdlc.supabase.co resolves to IPv6; the pooler host aws-0-eu-west-1.pooler.supabase.com
// provides dual IPv4/IPv6 support to the same PostgreSQL database.
function resolveDbConfig(customConfig?: {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}) {
  let host = customConfig?.host || process.env.SUPABASE_DB_HOST || 'aws-0-eu-west-1.pooler.supabase.com';
  let port = Number(customConfig?.port || process.env.SUPABASE_DB_PORT) || 5432;
  let user = customConfig?.user || process.env.SUPABASE_DB_USER || 'postgres.ognarhapvjisjespxdlc';
  let password = customConfig?.password || process.env.SUPABASE_DB_PASSWORD || '';
  let database = customConfig?.database || process.env.SUPABASE_DB_NAME || 'postgres';

  // Sanitize: Supabase database name is always 'postgres'
  if (!database || database === 'MenuMind AI') {
    database = 'postgres';
  }

  // Use pooler host if direct host is specified for IPv4 compatibility
  if (host === 'db.ognarhapvjisjespxdlc.supabase.co') {
    host = 'aws-0-eu-west-1.pooler.supabase.com';
  }

  // Ensure user has tenant suffix on pooler
  if (host.includes('pooler.supabase.com') && (user === 'postgres' || !user.includes('.'))) {
    user = 'postgres.ognarhapvjisjespxdlc';
  }

  // The database password must come from the environment (SUPABASE_DB_PASSWORD); it is never stored in code.
  if (!password || password === 'YOUR_SUPABASE_PASSWORD') {
    console.error('SUPABASE_DB_PASSWORD is not set: Supabase database connection will fail.');
  }

  return { host, port, user, password, database };
}

let pool: pg.Pool | null = null;

export function getDatabasePool(customConfig?: {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}): pg.Pool {
  const cfg = resolveDbConfig(customConfig);

  if (customConfig) {
    return new Pool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
      max: 5,
    });
  }

  if (!pool) {
    pool = new Pool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
      max: 5,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle Supabase client', err);
    });
  }

  return pool;
}

export interface DatabaseStatus {
  connected: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  latencyMs: number;
  serverVersion?: string;
  tablesCount: number;
  tables: Array<{ name: string; rows: number }>;
  error?: string;
}

export async function testConnection(customConfig?: any): Promise<DatabaseStatus> {
  const cfg = resolveDbConfig(customConfig);
  const testPool = getDatabasePool(customConfig);
  const start = Date.now();

  try {
    const client = await testPool.connect();
    const verRes = await client.query('SELECT version(), current_database(), current_user');
    const latencyMs = Date.now() - start;

    // Fetch existing public tables and row counts
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tables: Array<{ name: string; rows: number }> = [];
    for (const t of tablesRes.rows) {
      try {
        const cRes = await client.query(`SELECT count(*) FROM public."${t.table_name}"`);
        tables.push({ name: t.table_name, rows: parseInt(cRes.rows[0].count, 10) });
      } catch {
        tables.push({ name: t.table_name, rows: 0 });
      }
    }

    client.release();
    if (customConfig) {
      await testPool.end();
    }

    return {
      connected: true,
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      latencyMs,
      serverVersion: verRes.rows[0].version?.split(' ')?.[1] || 'PostgreSQL 17',
      tablesCount: tables.length,
      tables,
    };
  } catch (err: any) {
    if (customConfig) {
      await testPool.end();
    }
    return {
      connected: false,
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      latencyMs: Date.now() - start,
      tablesCount: 0,
      tables: [],
      error: err.message || 'Connection failed',
    };
  }
}

export interface SyncPayload {
  restaurantName?: string;
  parentDishes?: any[];
  recipes?: any[];
  fixedCosts?: any;
  groupingRules?: any[];
  reconciliation?: any;
  operatingExpenses?: any[];
  staffDirectory?: any[];
  cateringOrders?: any[];
  purchases?: any[];
  inventorySnapshots?: any[];
  rawRecords?: any[];
  payrollSnapshots?: any[];
  payouts?: any[];
  aggregatorMappings?: any[];
}

const CORE_AGGREGATOR_MAPPINGS = [
  { id: 'map-swiggy-762173', platform: 'swiggy', restaurantId: '762173', brandName: 'Banglar Jhale Jhole', outletId: 'banaswadi', isDefault: true, notes: 'Swiggy · Banglar Jhale Jhole · Banaswadi' },
  { id: 'map-swiggy-881519', platform: 'swiggy', restaurantId: '881519', brandName: 'Banglar Jhale Jhole', outletId: 'whitefield', isDefault: true, notes: 'Swiggy · Banglar Jhale Jhole · Whitefield' },
  { id: 'map-swiggy-1174333', platform: 'swiggy', restaurantId: '1174333', brandName: 'Niraamish', outletId: 'banaswadi', isDefault: true, notes: 'Swiggy · Niraamish · Banaswadi' },
  { id: 'map-swiggy-1332609', platform: 'swiggy', restaurantId: '1332609', brandName: 'Niraamish', outletId: 'whitefield', isDefault: true, notes: 'Swiggy · Niraamish · Whitefield' },
  { id: 'map-zomato-20794526', platform: 'zomato', restaurantId: '20794526', brandName: 'Banglar Jhale Jhole', outletId: 'banaswadi', isDefault: true, notes: 'Zomato · Banglar Jhale Jhole · Banaswadi' },
  { id: 'map-zomato-21176453', platform: 'zomato', restaurantId: '21176453', brandName: 'Banglar Jhale Jhole', outletId: 'whitefield', isDefault: true, notes: 'Zomato · Banglar Jhale Jhole · Whitefield' },
  { id: 'map-zomato-22042748', platform: 'zomato', restaurantId: '22042748', brandName: 'Niraamish', outletId: 'banaswadi', isDefault: true, notes: 'Zomato · Niraamish · Banaswadi' },
  { id: 'map-zomato-22550600', platform: 'zomato', restaurantId: '22550600', brandName: 'Niraamish', outletId: 'whitefield', isDefault: true, notes: 'Zomato · Niraamish · Whitefield' },
  { id: 'map-ownly-RN421127', platform: 'ownly', restaurantId: 'RN421127', brandName: 'Banglar Jhale Jhole', outletId: 'banaswadi', isDefault: true, notes: 'Ownly · Banglar Jhale Jhole · Banaswadi' },
  { id: 'map-ownly-RN421125', platform: 'ownly', restaurantId: 'RN421125', brandName: 'Banglar Jhale Jhole', outletId: 'whitefield', isDefault: true, notes: 'Ownly · Banglar Jhale Jhole (-W) · Whitefield' },
];

/**
 * Ensures aggregator_restaurant_mappings exists (seeded with the 8 core Swiggy/Zomato IDs)
 * and upgrades platform_payout_reconciliation to support multi-brand, weekly payouts, OWNLY,
 * Swiggy Assure, Zomato Hyperpure, other_charges_breakdown JSONB, and duplicate hashes.
 */
async function ensurePayoutSchemaAndMappings(client: any, restaurantId: string): Promise<void> {
  await client.query(
    `INSERT INTO public.restaurant_outlets (id, restaurant_id, code, name, city)
     VALUES
       ('banaswadi', $1, 'BW', 'Banaswadi Outlet', 'Bangalore'),
       ('whitefield', $1, 'WF', 'Whitefield Outlet', 'Bangalore')
     ON CONFLICT (id) DO NOTHING;`,
    [restaurantId]
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.aggregator_restaurant_mappings (
      id VARCHAR(100) PRIMARY KEY,
      restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
      platform VARCHAR(30) NOT NULL,
      aggregator_restaurant_id VARCHAR(50) NOT NULL,
      brand_name VARCHAR(120) NOT NULL,
      outlet_id VARCHAR(50) NOT NULL REFERENCES public.restaurant_outlets(id) ON DELETE RESTRICT,
      is_default BOOLEAN NOT NULL DEFAULT false,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
      UNIQUE (restaurant_id, platform, aggregator_restaurant_id)
    );
  `);

  for (const m of CORE_AGGREGATOR_MAPPINGS) {
    await client.query(
      `INSERT INTO public.aggregator_restaurant_mappings
       (id, restaurant_id, platform, aggregator_restaurant_id, brand_name, outlet_id, is_default, notes)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       ON CONFLICT (restaurant_id, platform, aggregator_restaurant_id) DO UPDATE SET
         brand_name = EXCLUDED.brand_name,
         outlet_id = EXCLUDED.outlet_id,
         is_default = true,
         notes = EXCLUDED.notes,
         updated_at = timezone('utc'::text, now())
       WHERE public.aggregator_restaurant_mappings.is_default = true;`,
      [m.id, restaurantId, m.platform, m.restaurantId, m.brandName, m.outletId, m.notes]
    );
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.platform_payout_reconciliation (
      id VARCHAR(140) PRIMARY KEY,
      restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
      outlet_id VARCHAR(50) NOT NULL REFERENCES public.restaurant_outlets(id) ON DELETE RESTRICT,
      month_year VARCHAR(7) NOT NULL,
      platform VARCHAR(30) NOT NULL,
      gross_sales_reported NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      customer_discounts_borne NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      net_platform_sales NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      commission_deducted NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      gst_on_commission NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      tcs_tds_deducted NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      cancellation_charges NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      marketing_ad_deductions NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      other_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      net_bank_settlement NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      actual_bank_credit_received NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
      settlement_variance NUMERIC(12, 2) DEFAULT 0.00,
      settlement_status VARCHAR(30) NOT NULL DEFAULT 'Reconciled',
      payout_reference_id VARCHAR(200),
      created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
    );
  `);

  // Drop legacy single-brand-per-outlet UNIQUE constraint & legacy platform CHECK constraint that rejected OWNLY
  await client.query(`
    DO $$
    DECLARE
      c RECORD;
    BEGIN
      FOR c IN
        SELECT conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = 'public.platform_payout_reconciliation'::regclass
          AND contype IN ('u', 'c')
      LOOP
        IF c.def ILIKE '%UNIQUE (restaurant_id, outlet_id, month_year, platform)%'
           OR (c.def ILIKE '%platform%' AND c.def NOT ILIKE '%OWNLY%') THEN
          EXECUTE format('ALTER TABLE public.platform_payout_reconciliation DROP CONSTRAINT IF EXISTS %I', c.conname);
        END IF;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;
  `);

  await client.query(`
    ALTER TABLE public.platform_payout_reconciliation
      ALTER COLUMN id TYPE VARCHAR(140),
      ALTER COLUMN payout_reference_id TYPE VARCHAR(200),
      ADD COLUMN IF NOT EXISTS aggregator_restaurant_id VARCHAR(50),
      ADD COLUMN IF NOT EXISTS brand_name VARCHAR(120),
      ADD COLUMN IF NOT EXISTS period_type VARCHAR(20) DEFAULT 'monthly',
      ADD COLUMN IF NOT EXISTS week_label VARCHAR(100),
      ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cancelled_orders INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS packaging_charges NUMERIC(12, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS payment_gateway_fee NUMERIC(12, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS tds_deducted NUMERIC(10, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS swiggy_assure_fee NUMERIC(12, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS hyperpure_recovery NUMERIC(12, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS other_charges_breakdown JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS direct_sales_cash_upi NUMERIC(14, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS file_hash VARCHAR(128),
      ADD COLUMN IF NOT EXISTS data_fingerprint VARCHAR(255),
      ADD COLUMN IF NOT EXISTS zomato_breakup_json JSONB,
      ADD COLUMN IF NOT EXISTS swiggy_breakup_json JSONB,
      ADD COLUMN IF NOT EXISTS ownly_breakup_json JSONB;
  `);
}

async function upsertPlatformPayoutRow(client: any, restaurantId: string, p: any): Promise<void> {
  const outletIdVal =
    String(p.outletId || 'banaswadi').toLowerCase().trim() === 'whitefield'
      ? 'whitefield'
      : 'banaswadi';
  const rawPlatformUpper = String(p.platform || 'SWIGGY').toUpperCase().trim();
  const platformVal = rawPlatformUpper === 'TOING' ? 'SWIGGY' : rawPlatformUpper;
  const monthVal = String(p.month || '2026-10').slice(0, 7);
  const resIdVal = p.accountId ? String(p.accountId).trim() : null;
  const brandVal = p.accountName ? String(p.accountName).trim() : null;
  const grossVal = Number(p.grossSales) || 0;
  const packVal = Number(p.packagingCharges) || 0;
  const discVal = Number(p.customerDiscounts) || 0;
  const netVal = Number(p.netSales ?? grossVal + packVal - discVal) || 0;
  const commVal = Number(p.commissionAmount) || 0;
  const pgVal = Number(p.paymentGatewayFee) || 0;
  const gstVal = Number(p.gstOnCommission) || 0;
  const tcsVal = Number(p.tcsDeduction) || 0;
  const tdsVal = Number(p.tdsDeduction) || 0;
  const cancelVal = Number(p.cancellationCharges) || 0;
  const mktVal = Number(p.advertisingSpend) || 0;
  const assureVal = Number(p.swiggyAssureFee) || 0;
  const hyperVal = Number(p.hyperpureRecovery) || 0;
  const otherVal = Number(p.otherPlatformFees) || 0;
  const otherJson = JSON.stringify(Array.isArray(p.otherChargesBreakdown) ? p.otherChargesBreakdown : []);
  const calcNet = Number(p.calculatedNetPayout) || 0;
  const actualCredit = Number(p.actualBankSettlement ?? calcNet) || 0;
  const diff = Number(p.settlementDifference ?? calcNet - actualCredit) || 0;
  const statusVal =
    p.status === 'reconciled'
      ? 'Reconciled'
      : p.status === 'discrepancy'
      ? 'Disputed'
      : 'Pending Bank Credit';
  const periodTypeVal = p.periodType === 'weekly' ? 'weekly' : 'monthly';
  const weekVal = p.weekLabel || null;
  const ordersVal = Math.round(Number(p.orderCount) || 0);
  const cancelledOrdersVal = Math.round(Number(p.cancelledOrders) || 0);
  const fileNameVal = p.sourceFileName || null;
  const fileHashVal = p.fileHash || null;
  const dataFpVal =
    p.dataFingerprint ||
    `${platformVal.toLowerCase()}|${resIdVal || ''}|${outletIdVal}|${monthVal}|${periodTypeVal}|${(weekVal || '').toLowerCase()}|${ordersVal}|${Math.round(grossVal)}|${Math.round(actualCredit)}`;

  const zomatoBreakupJson =
    p.zomatoBreakup && typeof p.zomatoBreakup === 'object'
      ? JSON.stringify(p.zomatoBreakup)
      : null;

  const swiggyBreakupJson =
    p.swiggyBreakup && typeof p.swiggyBreakup === 'object'
      ? JSON.stringify(p.swiggyBreakup)
      : null;

  const ownlyBreakupJson =
    p.ownlyBreakup && typeof p.ownlyBreakup === 'object'
      ? JSON.stringify(p.ownlyBreakup)
      : null;

  const rowId = String(
    p.id || `PAYOUT-${platformVal}-${resIdVal || outletIdVal}-${monthVal}-${periodTypeVal}`
  ).slice(0, 140);

  await client.query(
    `INSERT INTO public.platform_payout_reconciliation (
       id, restaurant_id, outlet_id, month_year, platform,
       aggregator_restaurant_id, brand_name, period_type, week_label,
       order_count, cancelled_orders, gross_sales_reported, packaging_charges,
       customer_discounts_borne, net_platform_sales, commission_deducted,
       payment_gateway_fee, gst_on_commission, tcs_tds_deducted, tds_deducted,
       cancellation_charges, marketing_ad_deductions, swiggy_assure_fee,
       hyperpure_recovery, other_deductions, other_charges_breakdown,
       net_bank_settlement, actual_bank_credit_received, settlement_variance,
       settlement_status, payout_reference_id, file_name, file_hash, data_fingerprint,
       zomato_breakup_json, swiggy_breakup_json, ownly_breakup_json
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9,
       $10, $11, $12, $13,
       $14, $15, $16,
       $17, $18, $19, $20,
       $21, $22, $23,
       $24, $25, $26::jsonb,
       $27, $28, $29,
       $30, $31, $32, $33, $34,
       $35::jsonb, $36::jsonb, $37::jsonb
     )
     ON CONFLICT (id) DO UPDATE SET
       outlet_id = EXCLUDED.outlet_id,
       month_year = EXCLUDED.month_year,
       platform = EXCLUDED.platform,
       aggregator_restaurant_id = EXCLUDED.aggregator_restaurant_id,
       brand_name = EXCLUDED.brand_name,
       period_type = EXCLUDED.period_type,
       week_label = EXCLUDED.week_label,
       order_count = EXCLUDED.order_count,
       cancelled_orders = EXCLUDED.cancelled_orders,
       gross_sales_reported = EXCLUDED.gross_sales_reported,
       packaging_charges = EXCLUDED.packaging_charges,
       customer_discounts_borne = EXCLUDED.customer_discounts_borne,
       net_platform_sales = EXCLUDED.net_platform_sales,
       commission_deducted = EXCLUDED.commission_deducted,
       payment_gateway_fee = EXCLUDED.payment_gateway_fee,
       gst_on_commission = EXCLUDED.gst_on_commission,
       tcs_tds_deducted = EXCLUDED.tcs_tds_deducted,
       tds_deducted = EXCLUDED.tds_deducted,
       cancellation_charges = EXCLUDED.cancellation_charges,
       marketing_ad_deductions = EXCLUDED.marketing_ad_deductions,
       swiggy_assure_fee = EXCLUDED.swiggy_assure_fee,
       hyperpure_recovery = EXCLUDED.hyperpure_recovery,
       other_deductions = EXCLUDED.other_deductions,
       other_charges_breakdown = EXCLUDED.other_charges_breakdown,
       net_bank_settlement = EXCLUDED.net_bank_settlement,
       actual_bank_credit_received = EXCLUDED.actual_bank_credit_received,
       settlement_variance = EXCLUDED.settlement_variance,
       settlement_status = EXCLUDED.settlement_status,
       payout_reference_id = EXCLUDED.payout_reference_id,
       file_name = EXCLUDED.file_name,
       file_hash = EXCLUDED.file_hash,
       data_fingerprint = EXCLUDED.data_fingerprint,
       zomato_breakup_json = EXCLUDED.zomato_breakup_json,
       swiggy_breakup_json = EXCLUDED.swiggy_breakup_json,
       ownly_breakup_json = EXCLUDED.ownly_breakup_json,
       updated_at = now();`,
    [
      rowId,
      restaurantId,
      outletIdVal,
      monthVal,
      platformVal,
      resIdVal,
      brandVal,
      periodTypeVal,
      weekVal,
      ordersVal,
      cancelledOrdersVal,
      grossVal,
      packVal,
      discVal,
      netVal,
      commVal,
      pgVal,
      gstVal,
      tcsVal,
      tdsVal,
      cancelVal,
      mktVal,
      assureVal,
      hyperVal,
      otherVal,
      otherJson,
      calcNet,
      actualCredit,
      diff,
      statusVal,
      fileNameVal,
      fileNameVal,
      fileHashVal,
      dataFpVal,
      zomatoBreakupJson,
      swiggyBreakupJson,
      ownlyBreakupJson,
    ]
  );
}

function mapDbRowToPlatformPayout(r: any) {
  let breakdown: any[] = [];
  if (Array.isArray(r.other_charges_breakdown)) {
    breakdown = r.other_charges_breakdown;
  } else if (typeof r.other_charges_breakdown === 'string') {
    try {
      breakdown = JSON.parse(r.other_charges_breakdown);
    } catch {
      breakdown = [];
    }
  }
  const grossSales = Number(r.gross_sales_reported) || 0;
  const commissionAmount = Number(r.commission_deducted) || 0;
  const rawPlatLower = String(r.platform || 'swiggy').toLowerCase().trim();
  const platformNorm = (rawPlatLower === 'toing' ? 'swiggy' : rawPlatLower) as
    | 'swiggy'
    | 'zomato'
    | 'ownly';

  let zomatoBreakup: any = undefined;
  if (r.zomato_breakup_json && typeof r.zomato_breakup_json === 'object') {
    zomatoBreakup = r.zomato_breakup_json;
  } else if (typeof r.zomato_breakup_json === 'string') {
    try {
      zomatoBreakup = JSON.parse(r.zomato_breakup_json);
    } catch {
      zomatoBreakup = undefined;
    }
  }

  let swiggyBreakup: any = undefined;
  if (r.swiggy_breakup_json && typeof r.swiggy_breakup_json === 'object') {
    swiggyBreakup = r.swiggy_breakup_json;
  } else if (typeof r.swiggy_breakup_json === 'string') {
    try {
      swiggyBreakup = JSON.parse(r.swiggy_breakup_json);
    } catch {
      swiggyBreakup = undefined;
    }
  }

  let ownlyBreakup: any = undefined;
  if (r.ownly_breakup_json && typeof r.ownly_breakup_json === 'object') {
    ownlyBreakup = r.ownly_breakup_json;
  } else if (typeof r.ownly_breakup_json === 'string') {
    try {
      ownlyBreakup = JSON.parse(r.ownly_breakup_json);
    } catch {
      ownlyBreakup = undefined;
    }
  }

  const resolvedDeliveryCharges =
    Number(zomatoBreakup?.row3_selfLogisticsDeliveryCharge?.total || 0) +
    Number(zomatoBreakup?.row6_brandPackSubscriptionFee?.total || 0) +
    Number(zomatoBreakup?.deliveryChargeCollected || 0);

  const baseMapped = {
    id: r.id,
    outletId: (r.outlet_id === 'whitefield' ? 'whitefield' : 'banaswadi') as 'banaswadi' | 'whitefield',
    platform: (['swiggy', 'zomato', 'ownly'].includes(platformNorm) ? platformNorm : 'swiggy') as
      | 'swiggy'
      | 'zomato'
      | 'ownly',
    month: r.month_year,
    accountId: r.aggregator_restaurant_id || undefined,
    accountName: r.brand_name || undefined,
    grossSales,
    packagingCharges: Number(r.packaging_charges) || 0,
    customerDiscounts: Number(r.customer_discounts_borne) || 0,
    netSales: Number(r.net_platform_sales) || 0,
    orderCount: Number(r.order_count) || 0,
    cancelledOrders: Number(r.cancelled_orders) || 0,
    commissionRate: grossSales > 0 ? Math.round((commissionAmount / grossSales) * 10000) / 100 : 0,
    commissionAmount,
    paymentGatewayFee: Number(r.payment_gateway_fee) || 0,
    deliveryChargesCollected: resolvedDeliveryCharges,
    customerDeliveryFeeShare: 0,
    advertisingSpend: Number(r.marketing_ad_deductions) || 0,
    cancellationCharges: Number(r.cancellation_charges) || 0,
    swiggyAssureFee: Number(r.swiggy_assure_fee) || 0,
    otherPlatformFees: Number(r.other_deductions) || 0,
    otherChargesBreakdown: breakdown,
    gstOnCommission: Number(r.gst_on_commission) || 0,
    tcsDeduction: Number(r.tcs_tds_deducted) || 0,
    tdsDeduction: Number(r.tds_deducted) || 0,
    hyperpureRecovery: Number(r.hyperpure_recovery) || 0,
    calculatedNetPayout: Number(r.net_bank_settlement) || 0,
    actualBankSettlement: Number(r.actual_bank_credit_received) || 0,
    settlementDifference: Number(r.settlement_variance) || 0,
    status: (
      r.settlement_status === 'Reconciled'
        ? 'reconciled'
        : r.settlement_status === 'Disputed'
        ? 'discrepancy'
        : 'pending'
    ) as 'reconciled' | 'discrepancy' | 'pending',
    periodType: (r.period_type === 'weekly' ? 'weekly' : 'monthly') as 'monthly' | 'weekly',
    weekLabel: r.week_label || undefined,
    payoutStartDate:
      zomatoBreakup?.payoutStartDate ||
      swiggyBreakup?.payoutStartDate ||
      ownlyBreakup?.payoutStartDate ||
      undefined,
    payoutEndDate:
      zomatoBreakup?.payoutEndDate ||
      swiggyBreakup?.payoutEndDate ||
      ownlyBreakup?.payoutEndDate ||
      undefined,
    directSalesCashUpi: Number(r.direct_sales_cash_upi) || 0,
    sourceFileName: r.file_name || r.payout_reference_id || undefined,
    fileHash: r.file_hash || undefined,
    dataFingerprint: r.data_fingerprint || undefined,
    zomatoBreakup,
    swiggyBreakup,
    ownlyBreakup,
    payoutDate: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : undefined,
  };

  if (baseMapped.platform === 'zomato') {
    const canonicalZb = ensureZomatoBreakupModelOnRecord(baseMapped as any);
    return applyZomatoBreakupToPayoutRecord(baseMapped as any, canonicalZb);
  }

  return baseMapped;
}


// ---- Catering: keep the COMPLETE order (all editable fields) alongside the DB columns ----
// The catering_orders table only has a limited set of columns, so the full order object is stored
// (base64 JSON) at the end of the existing `notes` column and restored on pull. No schema change needed.
const MM_ORDER_MARKER = '[[MM_ORDER_JSON:';
function packCateringNotes(order: any): string | null {
  try {
    const clean = String(order?.notes || '').split(MM_ORDER_MARKER)[0].trimEnd();
    const b64 = Buffer.from(JSON.stringify(order), 'utf8').toString('base64');
    return `${clean}\n${MM_ORDER_MARKER}${b64}]]`;
  } catch {
    return order?.notes || null;
  }
}
function unpackCateringNotes(raw: any): { notes: string; stored: any | null } {
  const text = String(raw || '');
  const idx = text.indexOf(MM_ORDER_MARKER);
  if (idx < 0) return { notes: text, stored: null };
  const notes = text.slice(0, idx).trimEnd();
  const end = text.indexOf(']]', idx);
  try {
    const b64 = text.slice(idx + MM_ORDER_MARKER.length, end);
    return { notes, stored: JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) };
  } catch {
    return { notes, stored: null };
  }
}
export async function syncDataToSupabase(payload: SyncPayload): Promise<{
  success: boolean;
  message: string;
  summary: Record<string, number>;
}> {
  const db = getDatabasePool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1. Ensure Restaurant row exists
    let restaurantId: string;
    const restRes = await client.query('SELECT id FROM public.restaurants LIMIT 1');
    if (restRes.rows.length > 0) {
      restaurantId = restRes.rows[0].id;
    } else {
      const createRest = await client.query(
        `INSERT INTO public.restaurants (name, currency, pos_type)
         VALUES ($1, 'INR', 'PETPOOJA') RETURNING id;`,
        [payload.restaurantName || 'MenuMind Grand Dining']
      );
      restaurantId = createRest.rows[0].id;
    }

    // Ensure default Outlets exist
    await client.query(
      `INSERT INTO public.restaurant_outlets (id, restaurant_id, code, name, city)
       VALUES 
         ('banaswadi', $1, 'BW', 'Banaswadi Outlet', 'Bangalore'),
         ('whitefield', $1, 'WF', 'Whitefield Outlet', 'Bangalore')
       ON CONFLICT (id) DO UPDATE SET restaurant_id = EXCLUDED.restaurant_id;`,
      [restaurantId]
    );

    // 2. Batch sync Parent Dishes
    let dishesCount = 0;
    if (payload.parentDishes && payload.parentDishes.length > 0) {
      const dishValues: string[] = [];
      const dishParams: any[] = [restaurantId];
      let pIdx = 2;

      for (const d of payload.parentDishes) {
        dishValues.push(`($1, $${pIdx}, $${pIdx + 1}, true)`);
        dishParams.push(d.name, d.category || 'Main Course');
        pIdx += 2;
      }

      await client.query(
        `INSERT INTO public.parent_dishes (restaurant_id, name, category, is_active)
         VALUES ${dishValues.join(', ')}
         ON CONFLICT (restaurant_id, name)
         DO UPDATE SET category = EXCLUDED.category, updated_at = now();`,
        dishParams
      );
      dishesCount = payload.parentDishes.length;
    }

    // Map parent dish names to IDs for relational linking
    const dishMapRes = await client.query(
      'SELECT id, name FROM public.parent_dishes WHERE restaurant_id = $1;',
      [restaurantId]
    );
    const dishNameToId = new Map<string, string>();
    dishMapRes.rows.forEach((r) => dishNameToId.set(r.name.toLowerCase(), r.id));

    // 3. Batch sync Dish Variants
    let variantsCount = 0;
    if (payload.parentDishes && payload.parentDishes.length > 0) {
      const variantValues: string[] = [];
      const variantParams: any[] = [restaurantId];
      let vIdx = 2;

      for (const d of payload.parentDishes) {
        const pId = dishNameToId.get(d.name.toLowerCase());
        if (pId && Array.isArray(d.variants)) {
          for (const v of d.variants) {
            variantValues.push(`($1, $${vIdx}, $${vIdx + 1}, $${vIdx + 2})`);
            variantParams.push(pId, v.variantName || 'Standard', v.averagePrice || 0);
            vIdx += 3;
            variantsCount++;
          }
        }
      }

      if (variantValues.length > 0) {
        await client.query(
          `INSERT INTO public.dish_variants (restaurant_id, parent_dish_id, variant_name, default_price)
           VALUES ${variantValues.join(', ')}
           ON CONFLICT (parent_dish_id, variant_name)
           DO UPDATE SET default_price = EXCLUDED.default_price, updated_at = now();`,
          variantParams
        );
      }
    }

    // 4. Batch sync Monthly Aggregates
    let aggregatesCount = 0;
    if (payload.parentDishes && payload.parentDishes.length > 0) {
      const aggValues: string[] = [];
      const aggParams: any[] = [restaurantId];
      let aIdx = 2;

      for (const d of payload.parentDishes) {
        const pId = dishNameToId.get(d.name.toLowerCase());
        if (pId && d.monthlyData) {
          for (const [monthYear, data] of Object.entries(d.monthlyData as Record<string, any>)) {
            aggValues.push(`($1, $${aIdx}, $${aIdx + 1}, $${aIdx + 2}, $${aIdx + 3}, $${aIdx + 4})`);
            aggParams.push(pId, monthYear, data.qty || 0, data.revenue || 0, data.avgPrice || 0);
            aIdx += 5;
            aggregatesCount++;
          }
        }
      }

      if (aggValues.length > 0) {
        await client.query(
          `INSERT INTO public.monthly_dish_aggregates 
           (restaurant_id, parent_dish_id, month_year, total_quantity, total_net_revenue, average_realized_price)
           VALUES ${aggValues.join(', ')}
           ON CONFLICT (parent_dish_id, month_year)
           DO UPDATE SET 
             total_quantity = EXCLUDED.total_quantity,
             total_net_revenue = EXCLUDED.total_net_revenue,
             average_realized_price = EXCLUDED.average_realized_price,
             updated_at = now();`,
          aggParams
        );
      }
    }

    await ensureRecipeCostingSchema(client);

    // 5. Batch sync Grouping Rules
    let rulesCount = 0;
    if (payload.groupingRules && payload.groupingRules.length > 0) {
      const ruleValues: string[] = [];
      const ruleParams: any[] = [restaurantId];
      let rIdx = 2;
      const seenPatterns = new Set<string>();

      for (const r of payload.groupingRules) {
        const rawPat = String(r.pattern || r.rawPattern || '').trim();
        const parentName = String(r.parentDishName || '').trim();
        if (!rawPat || !parentName) continue;
        const patLower = rawPat.toLowerCase();
        if (seenPatterns.has(patLower)) continue;
        seenPatterns.add(patLower);

        let pId = dishNameToId.get(parentName.toLowerCase());
        if (!pId) {
          const insParent = await client.query(
            `INSERT INTO public.parent_dishes (restaurant_id, name, category)
             VALUES ($1, $2, 'General')
             ON CONFLICT (restaurant_id, name) DO UPDATE SET updated_at = now()
             RETURNING id;`,
            [restaurantId, parentName]
          );
          pId = insParent.rows[0]?.id;
          if (pId) dishNameToId.set(parentName.toLowerCase(), pId);
        }

        if (pId) {
          const targetVar = String(r.variantName || r.targetVariantName || 'Regular').trim();
          const isApproved = r.isUserApproved !== undefined ? Boolean(r.isUserApproved) : Boolean(r.isApproved ?? true);
          ruleValues.push(`($1, $${rIdx}, 'EXACT', $${rIdx + 1}, $${rIdx + 2}, $${rIdx + 3}, $${rIdx + 4})`);
          ruleParams.push(rawPat, pId, targetVar, Number(r.confidence) || 100, isApproved);
          rIdx += 5;
          rulesCount++;
        }
      }

      if (ruleValues.length > 0) {
        await client.query(
          `INSERT INTO public.dish_grouping_rules 
           (restaurant_id, raw_pattern, match_type, parent_dish_id, target_variant_name, confidence_score, is_approved)
           VALUES ${ruleValues.join(', ')}
           ON CONFLICT (restaurant_id, raw_pattern)
           DO UPDATE SET 
             parent_dish_id = EXCLUDED.parent_dish_id,
             target_variant_name = EXCLUDED.target_variant_name,
             confidence_score = EXCLUDED.confidence_score,
             is_approved = EXCLUDED.is_approved;`,
          ruleParams
        );
      }
    }

    // 6. Batch sync Ingredients & Recipes
    let recipesCount = 0;
    let ingredientsCount = 0;
    if (payload.recipes && payload.recipes.length > 0) {
      const ingMap = new Map<string, { displayName: string; unit: string; price: number; packSize: number }>();
      payload.recipes.forEach((rec) => {
        if (Array.isArray(rec.ingredients)) {
          rec.ingredients.forEach((ing: any) => {
            const cleanName = String(ing.name || '').trim();
            if (cleanName && !ingMap.has(cleanName.toLowerCase())) {
              ingMap.set(cleanName.toLowerCase(), {
                displayName: cleanName,
                unit: normalizeDbMeasurementUnit(ing.purchasePackUnit || ing.unit),
                price: Number(ing.purchasePrice ?? ing.directPortionCost ?? 0) || 0,
                packSize: Math.max(0.001, Number(ing.purchasePackSize) || 1),
              });
            }
          });
        }
      });

      if (ingMap.size > 0) {
        const ingValues: string[] = [];
        const ingParams: any[] = [restaurantId];
        let iIdx = 2;

        for (const [, data] of ingMap.entries()) {
          ingValues.push(`($1, $${iIdx}, $${iIdx + 1}, $${iIdx + 2}, $${iIdx + 3})`);
          ingParams.push(data.displayName, data.price, data.packSize, data.unit);
          iIdx += 4;
          ingredientsCount++;
        }

        await client.query(
          `INSERT INTO public.ingredients (restaurant_id, name, default_purchase_price, purchase_pack_size, purchase_pack_unit)
           VALUES ${ingValues.join(', ')}
           ON CONFLICT (restaurant_id, name)
           DO UPDATE SET 
             default_purchase_price = EXCLUDED.default_purchase_price,
             purchase_pack_size = EXCLUDED.purchase_pack_size,
             purchase_pack_unit = EXCLUDED.purchase_pack_unit,
             updated_at = now();`,
          ingParams
        );
      }

      const ingDbRes = await client.query(
        'SELECT id, name FROM public.ingredients WHERE restaurant_id = $1;',
        [restaurantId]
      );
      const ingNameToId = new Map<string, string>();
      ingDbRes.rows.forEach((r) => ingNameToId.set(String(r.name || '').toLowerCase(), r.id));

      for (const rec of payload.recipes) {
        const pName = String(rec.parentDishName || '').trim();
        if (!pName) continue;
        let pId = dishNameToId.get(pName.toLowerCase());
        if (!pId) {
          const insParent = await client.query(
            `INSERT INTO public.parent_dishes (restaurant_id, name, category)
             VALUES ($1, $2, 'General')
             ON CONFLICT (restaurant_id, name) DO UPDATE SET updated_at = now()
             RETURNING id;`,
            [restaurantId, pName]
          );
          pId = insParent.rows[0]?.id;
          if (pId) dishNameToId.set(pName.toLowerCase(), pId);
        }
        if (!pId) continue;

        const isManualOnly =
          Boolean(rec.isManualCostOnly) ||
          ((!Array.isArray(rec.ingredients) || rec.ingredients.length === 0) &&
            rec.manualUnitCost !== undefined);
        const unitCostOverride =
          rec.manualUnitCost !== undefined && rec.manualUnitCost !== null
            ? Number(rec.manualUnitCost)
            : Number(rec.totalVariableCostPerPortion ?? rec.totalIngredientCost ?? 0);

        const recipeRes = await client.query(
          `INSERT INTO public.recipes 
           (restaurant_id, parent_dish_id, recipe_name, variant_name, batch_yield_servings, packaging_cost_per_portion, cooking_fuel_cost_per_portion, direct_labor_cost_per_portion, other_variable_cost_per_portion, unit_cost_override, is_manual_cost_only, source_pdf_name, bom_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (restaurant_id, parent_dish_id, recipe_name)
           DO UPDATE SET 
             variant_name = EXCLUDED.variant_name,
             batch_yield_servings = EXCLUDED.batch_yield_servings,
             packaging_cost_per_portion = EXCLUDED.packaging_cost_per_portion,
             cooking_fuel_cost_per_portion = EXCLUDED.cooking_fuel_cost_per_portion,
             direct_labor_cost_per_portion = EXCLUDED.direct_labor_cost_per_portion,
             other_variable_cost_per_portion = EXCLUDED.other_variable_cost_per_portion,
             unit_cost_override = EXCLUDED.unit_cost_override,
             is_manual_cost_only = EXCLUDED.is_manual_cost_only,
             source_pdf_name = COALESCE(EXCLUDED.source_pdf_name, public.recipes.source_pdf_name),
             bom_json = EXCLUDED.bom_json,
             updated_at = now()
           RETURNING id;`,
          [
            restaurantId,
            pId,
            rec.recipeName || `${pName} Recipe`,
            rec.variantName || 'All Variants',
            Math.max(1, Number(rec.batchYieldServings) || 1),
            Number(rec.packagingCost) || 0,
            Number(rec.cookingFuelCost) || 0,
            Number(rec.directLaborCost) || 0,
            Number(rec.otherVariableCost) || 0,
            unitCostOverride,
            isManualOnly,
            rec.sourcePdfName || null,
            JSON.stringify(Array.isArray(rec.ingredients) ? rec.ingredients : []),
          ]
        );

        const recipeId = recipeRes.rows[0].id;
        recipesCount++;

        await client.query('DELETE FROM public.recipe_ingredients WHERE recipe_id = $1;', [recipeId]);

        if (Array.isArray(rec.ingredients) && rec.ingredients.length > 0) {
          const bomValues: string[] = [];
          const bomParams: any[] = [recipeId];
          let bIdx = 2;
          const seenIngIds = new Set<string>();

          for (const ing of rec.ingredients) {
            const ingId = ingNameToId.get(String(ing.name || '').trim().toLowerCase());
            if (ingId && !seenIngIds.has(ingId)) {
              seenIngIds.add(ingId);
              bomValues.push(`($1, $${bIdx}, $${bIdx + 1}, $${bIdx + 2}, $${bIdx + 3})`);
              bomParams.push(
                ingId,
                Math.max(0.001, Number(ing.quantity) || 1),
                normalizeDbMeasurementUnit(ing.unit),
                Number(ing.calculatedCostPerPortion ?? ing.directPortionCost ?? 0) || 0
              );
              bIdx += 4;
            }
          }

          if (bomValues.length > 0) {
            await client.query(
              `INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_per_batch, unit, calculated_portion_cost)
               VALUES ${bomValues.join(', ')};`,
              bomParams
            );
          }
        }
      }
    }

    // 7. Sync Fixed Operating Costs (Legacy)
    if (payload.fixedCosts) {
      const monthStr = new Date().toISOString().slice(0, 7);
      await client.query(
        `INSERT INTO public.fixed_operating_costs 
         (restaurant_id, effective_month, monthly_rent, fixed_salaries, fixed_utilities, software_subscriptions, other_fixed_expenses)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (restaurant_id, effective_month)
         DO UPDATE SET 
           monthly_rent = EXCLUDED.monthly_rent,
           fixed_salaries = EXCLUDED.fixed_salaries,
           fixed_utilities = EXCLUDED.fixed_utilities,
           software_subscriptions = EXCLUDED.software_subscriptions,
           other_fixed_expenses = EXCLUDED.other_fixed_expenses,
           updated_at = now();`,
        [
          restaurantId,
          monthStr,
          payload.fixedCosts.monthlyRent || 0,
          payload.fixedCosts.fixedSalaries || 0,
          payload.fixedCosts.fixedUtilities || 0,
          payload.fixedCosts.softwareSubscriptions || 0,
          payload.fixedCosts.otherFixedExpenses || 0,
        ]
      );
    }

    // ==============================================================================
    // 8. NEW: Sync Outlet Operating Overheads (14 Categories & 50-50 Split Engine)
    // ==============================================================================
    let overheadsCount = 0;
    if (Array.isArray(payload.operatingExpenses) && payload.operatingExpenses.length > 0) {
      for (const item of payload.operatingExpenses) {
        await client.query(
          `INSERT INTO public.outlet_operating_expenses
           (id, restaurant_id, name, category_group, description, is_combined, combined_total_amount, split_pct_banaswadi, split_pct_whitefield, banaswadi_amount, whitefield_amount, is_custom, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO UPDATE SET 
             name = EXCLUDED.name,
             category_group = EXCLUDED.category_group,
             description = EXCLUDED.description,
             is_combined = EXCLUDED.is_combined,
             combined_total_amount = EXCLUDED.combined_total_amount,
             split_pct_banaswadi = EXCLUDED.split_pct_banaswadi,
             split_pct_whitefield = EXCLUDED.split_pct_whitefield,
             banaswadi_amount = EXCLUDED.banaswadi_amount,
             whitefield_amount = EXCLUDED.whitefield_amount,
             is_custom = EXCLUDED.is_custom,
             notes = EXCLUDED.notes,
             updated_at = now();`,
          [
            item.id,
            restaurantId,
            item.name,
            item.categoryGroup || 'Facility & Rent',
            item.description || null,
            !!item.isCombined,
            Number(item.combinedTotalAmount) || 0,
            Number(item.splitPctBanaswadi ?? 50),
            Number(item.splitPctWhitefield ?? 50),
            Number(item.banaswadiAmount) || 0,
            Number(item.whitefieldAmount) || 0,
            !!item.isCustom,
            item.notes || null,
          ]
        );
        overheadsCount++;
      }
    }

    // ==============================================================================
    // 9. NEW: Sync Staff Directory (Wages, ₹130 Food Rule, Multi-Outlet Allocation)
    // ==============================================================================
    let staffCount = 0;
    if (Array.isArray(payload.staffDirectory) && payload.staffDirectory.length > 0) {
      for (const staff of payload.staffDirectory) {
        await client.query(
          `INSERT INTO public.staff_directory
           (id, restaurant_id, name, role, outlet_id, secondary_outlet_id, primary_outlet_allocation_pct, joining_date, status, base_salary, salary_effective_date, is_food_allowance_eligible, food_allowance_rate_per_day, max_allowance_days, insurance_premium_monthly, other_allowances, other_employer_costs, salary_advances, payroll_adjustments, bank_account_number, bank_ifsc, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
           ON CONFLICT (id) DO UPDATE SET 
             name = EXCLUDED.name,
             role = EXCLUDED.role,
             outlet_id = EXCLUDED.outlet_id,
             secondary_outlet_id = EXCLUDED.secondary_outlet_id,
             primary_outlet_allocation_pct = EXCLUDED.primary_outlet_allocation_pct,
             joining_date = EXCLUDED.joining_date,
             status = EXCLUDED.status,
             base_salary = EXCLUDED.base_salary,
             salary_effective_date = EXCLUDED.salary_effective_date,
             is_food_allowance_eligible = EXCLUDED.is_food_allowance_eligible,
             food_allowance_rate_per_day = EXCLUDED.food_allowance_rate_per_day,
             insurance_premium_monthly = EXCLUDED.insurance_premium_monthly,
             other_allowances = EXCLUDED.other_allowances,
             other_employer_costs = EXCLUDED.other_employer_costs,
             salary_advances = EXCLUDED.salary_advances,
             payroll_adjustments = EXCLUDED.payroll_adjustments,
             bank_account_number = EXCLUDED.bank_account_number,
             bank_ifsc = EXCLUDED.bank_ifsc,
             notes = EXCLUDED.notes,
             updated_at = now();`,
          [
            staff.id,
            restaurantId,
            staff.name,
            staff.role,
            staff.outletId || 'whitefield',
            staff.secondaryOutletId || null,
            Number(staff.primaryOutletAllocationPct ?? 100),
            staff.joiningDate || '2025-01-01',
            staff.status || 'active',
            Number(staff.baseSalary) || 0,
            staff.salaryEffectiveDate || '2026-01-01',
            staff.isFoodAllowanceEligible !== false,
            Number(staff.foodAllowanceRatePerDay ?? 130),
            Number(staff.maxAllowanceDays ?? 30),
            Number(staff.insurancePremiumMonthly ?? 1500),
            Number(staff.otherAllowances) || 0,
            Number(staff.otherEmployerCosts) || 0,
            Number(staff.salaryAdvances) || 0,
            Number(staff.payrollAdjustments) || 0,
            staff.bankAccountNumber || null,
            staff.bankIfsc || null,
            staff.notes || null,
          ]
        );
        staffCount++;
      }
    }

    // ==============================================================================
    // 10. NEW: Sync Bulk Catering & Event Orders
    // ==============================================================================
    let cateringCount = 0;
    if (Array.isArray(payload.cateringOrders) && payload.cateringOrders.length > 0) {
      for (const order of payload.cateringOrders) {
        // Normalize event category safely
        const rawCategory = String(order.eventCategory || 'Other Custom Event').trim();
        let normalizedCategory = rawCategory;
        const lowerCat = rawCategory.toLowerCase();
        if (lowerCat === 'anniversaries' || lowerCat === 'anniversary') normalizedCategory = 'Anniversary';
        else if (lowerCat === 'birthdays' || lowerCat === 'birthday') normalizedCategory = 'Birthday';
        else if (lowerCat === 'weddings' || lowerCat === 'wedding') normalizedCategory = 'Wedding';
        else if (lowerCat.includes('durga')) normalizedCategory = 'Durga Puja';
        else if (lowerCat.includes('kali')) normalizedCategory = 'Kali Puja';
        else if (lowerCat.includes('saraswati')) normalizedCategory = 'Saraswati Puja';
        else if (lowerCat.includes('griha') || lowerCat.includes('housewarm')) normalizedCategory = 'Griha Pravesh';
        else if (lowerCat.includes('corporate')) normalizedCategory = 'Corporate Events';
        else if (lowerCat.includes('community')) normalizedCategory = 'Community Gatherings';
        else if (lowerCat.includes('residential') || lowerCat.includes('society')) normalizedCategory = 'Residential Society';
        else if (lowerCat.includes('private') || lowerCat.includes('family')) normalizedCategory = 'Private Family';
        else if (lowerCat.includes('custom') || lowerCat.includes('other')) normalizedCategory = 'Other Custom Event';
        else if (!normalizedCategory) normalizedCategory = 'Other Custom Event';

        // Normalize payment status
        const rawPayment = String(order.paymentStatus || '').toLowerCase().replace(/_/g, ' ').trim();
        let normPayment = 'Partially Paid';
        if (rawPayment.includes('unpaid')) normPayment = 'Unpaid';
        else if (rawPayment.includes('fully') || rawPayment.includes('full')) normPayment = 'Fully Paid';
        else if (rawPayment.includes('part') || rawPayment.includes('advance')) normPayment = 'Partially Paid';
        else if (order.paymentStatus) normPayment = String(order.paymentStatus);

        // Normalize fulfillment status
        const rawFulfillment = String(order.fulfillmentStatus || order.status || '').toLowerCase().replace(/_/g, ' ').trim();
        let normFulfillment = 'Confirmed';
        if (rawFulfillment.includes('draft') || rawFulfillment.includes('enquiry') || rawFulfillment.includes('quotation')) normFulfillment = 'Draft';
        else if (rawFulfillment.includes('prep')) normFulfillment = 'In Preparation';
        else if (rawFulfillment.includes('deliver')) normFulfillment = 'Delivered';
        else if (rawFulfillment.includes('complete') || rawFulfillment.includes('fully paid')) normFulfillment = 'Completed';
        else if (rawFulfillment.includes('cancel')) normFulfillment = 'Cancelled';
        else if (order.fulfillmentStatus) normFulfillment = String(order.fulfillmentStatus);

        const grossVal = Number(order.grossOrderValue ?? order.agreedOrderValue) || 0;
        const discountVal = Number(order.discountAmount ?? order.customerDiscount) || 0;
        const gstVal = Number(order.gstAmount ?? order.taxAmount) || 0;
        const netVal = Number(order.netOrderValue ?? (grossVal - discountVal + (Number(order.additionalDeliveryCharges) || 0) + (Number(order.otherAgreedCharges) || 0))) || 0;
        const advVal = Number(order.advancePaymentAmount ?? order.advanceAmountCollected ?? order.totalAmountCollected) || 0;
        const balVal = Number(order.balanceAmount ?? order.remainingAmountDue ?? Math.max(0, netVal - advVal)) || 0;
        const outletIdVal = (order.outletId || 'whitefield').toLowerCase().trim() === 'banaswadi' ? 'banaswadi' : 'whitefield';
        const pricingTypeVal = order.pricingType === 'LUMP_SUM' ? 'LUMP_SUM' : 'PER_PLATE';
        const deliveryAddressVal = order.deliveryAddress || order.deliveryLocation || null;
        const guestCountVal = Math.max(1, Number(order.guestCount) || 50);

        await client.query(
          `INSERT INTO public.catering_orders
           (id, restaurant_id, outlet_id, event_name, event_category, customer_name, customer_contact, customer_email, delivery_address, event_date, order_confirmation_date, guest_count, food_package_type, pricing_type, price_per_plate, lump_sum_amount, gross_order_value, discount_amount, gst_amount, net_order_value, advance_payment_amount, balance_amount, payment_status, fulfillment_status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
           ON CONFLICT (id) DO UPDATE SET 
             outlet_id = EXCLUDED.outlet_id,
             event_name = EXCLUDED.event_name,
             event_category = EXCLUDED.event_category,
             customer_name = EXCLUDED.customer_name,
             customer_contact = EXCLUDED.customer_contact,
             customer_email = EXCLUDED.customer_email,
             delivery_address = EXCLUDED.delivery_address,
             event_date = EXCLUDED.event_date,
             guest_count = EXCLUDED.guest_count,
             food_package_type = EXCLUDED.food_package_type,
             pricing_type = EXCLUDED.pricing_type,
             price_per_plate = EXCLUDED.price_per_plate,
             lump_sum_amount = EXCLUDED.lump_sum_amount,
             gross_order_value = EXCLUDED.gross_order_value,
             discount_amount = EXCLUDED.discount_amount,
             gst_amount = EXCLUDED.gst_amount,
             net_order_value = EXCLUDED.net_order_value,
             advance_payment_amount = EXCLUDED.advance_payment_amount,
             balance_amount = EXCLUDED.balance_amount,
             payment_status = EXCLUDED.payment_status,
             fulfillment_status = EXCLUDED.fulfillment_status,
             notes = EXCLUDED.notes,
             updated_at = now();`,
          [
            order.id,
            restaurantId,
            outletIdVal,
            order.eventName || 'Event Catering',
            normalizedCategory,
            order.customerName || null,
            order.customerContact || null,
            order.customerEmail || null,
            deliveryAddressVal,
            order.eventDate || new Date().toISOString().slice(0, 10),
            order.orderConfirmationDate || new Date().toISOString().slice(0, 10),
            guestCountVal,
            order.foodPackageType || null,
            pricingTypeVal,
            Number(order.pricePerPlate) || 0,
            Number(order.lumpSumAmount) || 0,
            grossVal,
            discountVal,
            gstVal,
            netVal,
            advVal,
            balVal,
            normPayment,
            normFulfillment,
            packCateringNotes(order),
          ]
        );
        cateringCount++;
      }
    }

    // ==============================================================================
    // 11. NEW: Sync Ingredient Purchases (Hyperpure, Meat, Vegetables, Porter)
    // ==============================================================================
    let purchasesCount = 0;
    if (Array.isArray(payload.purchases) && payload.purchases.length > 0) {
      for (const pur of payload.purchases) {
        await client.query(
          `INSERT INTO public.ingredient_purchases
           (id, restaurant_id, outlet_id, accounting_month, purchase_date, supplier_name, category, invoice_number, item_description, quantity, unit, rate_per_unit, gross_amount, gst_amount, delivery_or_porter_charge, total_amount_inr, payment_status, payment_mode, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
           ON CONFLICT (id) DO UPDATE SET 
             outlet_id = EXCLUDED.outlet_id,
             accounting_month = EXCLUDED.accounting_month,
             purchase_date = EXCLUDED.purchase_date,
             supplier_name = EXCLUDED.supplier_name,
             category = EXCLUDED.category,
             invoice_number = EXCLUDED.invoice_number,
             item_description = EXCLUDED.item_description,
             quantity = EXCLUDED.quantity,
             unit = EXCLUDED.unit,
             rate_per_unit = EXCLUDED.rate_per_unit,
             gross_amount = EXCLUDED.gross_amount,
             gst_amount = EXCLUDED.gst_amount,
             delivery_or_porter_charge = EXCLUDED.delivery_or_porter_charge,
             total_amount_inr = EXCLUDED.total_amount_inr,
             payment_status = EXCLUDED.payment_status,
             payment_mode = EXCLUDED.payment_mode,
             notes = EXCLUDED.notes,
             updated_at = now();`,
          [
            pur.id,
            restaurantId,
            pur.outletId || 'whitefield',
            pur.accountingMonth || pur.month || (pur.purchaseDate ? String(pur.purchaseDate).slice(0, 7) : null) || new Date().toISOString().slice(0, 7),
            pur.purchaseDate || new Date().toISOString().slice(0, 10),
            pur.supplierName || 'Hyperpure',
            pur.category || 'Hyperpure',
            pur.invoiceNumber || null,
            pur.itemDescription || null,
            Number(pur.quantity) || 1,
            pur.unit || pur.unitOfMeasure || 'kg',
            Number(pur.ratePerUnit ?? pur.unitPrice) || 0,
            Number(pur.grossAmount) || 0,
            Number(pur.gstAmount) || 0,
            Number(pur.deliveryOrPorterCharge ?? pur.transportationExpense) || 0,
            Number(pur.totalAmountINR ?? pur.totalAmount) || 0,
            pur.paymentStatus || 'Paid',
            pur.paymentMode || pur.paymentMethod || 'Bank Transfer',
            pur.notes || null,
          ]
        );
        purchasesCount++;
      }
    }

    // ==============================================================================
    // 12. NEW: Sync Monthly Inventory Snapshots
    // ==============================================================================
    let inventoryCount = 0;
    if (Array.isArray(payload.inventorySnapshots) && payload.inventorySnapshots.length > 0) {
      for (const inv of payload.inventorySnapshots) {
        await client.query(
          `INSERT INTO public.monthly_inventory_snapshots
           (id, restaurant_id, outlet_id, month_year, opening_inventory_value, total_purchases_value, closing_inventory_value, reported_recipe_theoretical_cogs, variance_spoilage_value, costing_basis)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (restaurant_id, outlet_id, month_year) DO UPDATE SET 
             opening_inventory_value = EXCLUDED.opening_inventory_value,
             total_purchases_value = EXCLUDED.total_purchases_value,
             closing_inventory_value = EXCLUDED.closing_inventory_value,
             reported_recipe_theoretical_cogs = EXCLUDED.reported_recipe_theoretical_cogs,
             variance_spoilage_value = EXCLUDED.variance_spoilage_value,
             costing_basis = EXCLUDED.costing_basis,
             updated_at = now();`,
          [
            inv.id || `INV-${inv.monthYear || '2026-10'}-${inv.outletId || 'whitefield'}`,
            restaurantId,
            inv.outletId || 'whitefield',
            inv.monthYear || '2026-10',
            Number(inv.openingInventoryValue) || 0,
            Number(inv.totalPurchasesValue) || 0,
            Number(inv.closingInventoryValue) || 0,
            Number(inv.reportedRecipeTheoreticalCOGS) || 0,
            Number(inv.varianceSpoilageValue) || 0,
            inv.costingBasis || 'PURCHASE_BASED',
          ]
        );
        inventoryCount++;
      }
    }

    // ==============================================================================
    // 13. NEW: Sync Monthly Payroll Snapshots (October Wages, Food Allowance, Insurance)
    // ==============================================================================
    let payrollSnapshotsCount = 0;
    if (Array.isArray(payload.payrollSnapshots) && payload.payrollSnapshots.length > 0) {
      for (const p of payload.payrollSnapshots) {
        await client.query(
          `INSERT INTO public.monthly_payroll_snapshots
           (id, restaurant_id, staff_id, month_year, outlet_id, secondary_outlet_id, primary_allocation_pct, days_worked, effective_base_salary, calculated_food_allowance, insurance_cost, other_employer_costs, salary_advances_deducted, payroll_adjustments, total_employer_cost, net_payable_to_employee, payment_status, payment_date, payment_mode, is_audited)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
           ON CONFLICT (staff_id, month_year, outlet_id) DO UPDATE SET 
             days_worked = EXCLUDED.days_worked,
             effective_base_salary = EXCLUDED.effective_base_salary,
             calculated_food_allowance = EXCLUDED.calculated_food_allowance,
             insurance_cost = EXCLUDED.insurance_cost,
             other_employer_costs = EXCLUDED.other_employer_costs,
             salary_advances_deducted = EXCLUDED.salary_advances_deducted,
             payroll_adjustments = EXCLUDED.payroll_adjustments,
             total_employer_cost = EXCLUDED.total_employer_cost,
             net_payable_to_employee = EXCLUDED.net_payable_to_employee,
             payment_status = EXCLUDED.payment_status,
             is_audited = EXCLUDED.is_audited,
             updated_at = now();`,
          [
            p.id || `PAY-${p.month || '2026-10'}-${p.staffId}-${p.outletId}`,
            restaurantId,
            p.staffId,
            p.month || '2026-10',
            p.outletId || 'whitefield',
            p.secondaryOutletId || null,
            Number(p.primaryAllocationPct) || 100,
            Number(p.daysWorked ?? 30),
            Number(p.effectiveBaseSalary) || 0,
            Number(p.calculatedFoodAllowance) || 0,
            Number(p.insuranceCost) || 0,
            Number(p.otherEmployerCosts) || 0,
            Number(p.salaryAdvancesDeducted) || 0,
            Number(p.payrollAdjustments) || 0,
            Number(p.totalEmployerCost) || 0,
            Number(p.netPayableToEmployee) || 0,
            p.paymentStatus || 'Approved',
            p.paymentDate || null,
            p.paymentMethod || 'Bank Transfer',
            !!p.isAudited,
          ]
        );
        payrollSnapshotsCount++;
      }
    }

    // ==============================================================================
    // 14. Sync Aggregator Restaurant ID Mappings & Platform Payouts (Swiggy, Zomato, Ownly)
    // ==============================================================================
    await ensurePayoutSchemaAndMappings(client, restaurantId);

    if (Array.isArray(payload.aggregatorMappings) && payload.aggregatorMappings.length > 0) {
      for (const m of payload.aggregatorMappings) {
        if (!m?.restaurantId) continue;
        const plat = String(m.platform || 'swiggy').toLowerCase().trim();
        const resIdStr = String(m.restaurantId).trim();
        const outId = String(m.outletId || 'banaswadi').toLowerCase().includes('white')
          ? 'whitefield'
          : 'banaswadi';
        await client.query(
          `INSERT INTO public.aggregator_restaurant_mappings
           (id, restaurant_id, platform, aggregator_restaurant_id, brand_name, outlet_id, is_default, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (restaurant_id, platform, aggregator_restaurant_id) DO UPDATE SET
             brand_name = EXCLUDED.brand_name,
             outlet_id = EXCLUDED.outlet_id,
             notes = EXCLUDED.notes,
             updated_at = now();`,
          [
            m.id || `map-${plat}-${resIdStr}`,
            restaurantId,
            plat,
            resIdStr,
            String(m.brandName || 'Banglar Jhale Jhole').trim(),
            outId,
            Boolean(m.isDefault),
            m.notes || null,
          ]
        );
      }
    }

    let payoutsCount = 0;
    if (Array.isArray(payload.payouts) && payload.payouts.length > 0) {
      for (const p of payload.payouts) {
        await upsertPlatformPayoutRow(client, restaurantId, p);
        payoutsCount++;
      }
    }

    await client.query('COMMIT');
    client.release();

    // If raw sales records were provided, sync them as well
    let salesCount = 0;
    if (Array.isArray(payload.rawRecords) && payload.rawRecords.length > 0) {
      const salesResult = await syncSalesRecordsToSupabase({
        rawRecords: payload.rawRecords,
        reconciliation: payload.reconciliation,
        restaurantName: payload.restaurantName,
      });
      salesCount = salesResult.rowsInserted;
    }

    return {
      success: true,
      message: `Successfully synchronized all modules to Supabase!`,
      summary: {
        parentDishes: dishesCount,
        variants: variantsCount,
        monthlyAggregates: aggregatesCount,
        recipes: recipesCount,
        ingredients: ingredientsCount,
        groupingRules: rulesCount,
        operatingExpenses: overheadsCount,
        staffDirectory: staffCount,
        payrollSnapshots: payrollSnapshotsCount,
        cateringOrders: cateringCount,
        purchases: purchasesCount,
        inventorySnapshots: inventoryCount,
        platformPayouts: payoutsCount,
        rawSalesRecords: salesCount,
      },
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }
}

/**
 * Persists raw POS sales records and batches into Supabase tables raw_pos_sales_records and pos_import_batches.
 */
export async function syncSalesRecordsToSupabase(payload: {
  rawRecords: any[];
  reconciliation?: any;
  restaurantName?: string;
}): Promise<{
  success: boolean;
  message: string;
  batchId?: string;
  rowsInserted: number;
}> {
  const db = getDatabasePool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1. Ensure restaurant exists
    let restaurantId: string;
    const restRes = await client.query('SELECT id FROM public.restaurants LIMIT 1');
    if (restRes.rows.length > 0) {
      restaurantId = restRes.rows[0].id;
    } else {
      const createRest = await client.query(
        `INSERT INTO public.restaurants (name, currency, pos_type)
         VALUES ($1, 'INR', 'PETPOOJA') RETURNING id;`,
        [payload.restaurantName || 'MenuMind Grand Dining']
      );
      restaurantId = createRest.rows[0].id;
    }

    // 2. Insert into pos_import_batches
    const rec = payload.reconciliation || {};
    const fileNames = Array.isArray(rec.fileNames) && rec.fileNames.length > 0
      ? rec.fileNames.join(', ')
      : 'Petpooja_POS_Sales.xlsx';

    const totalRev = Number(rec.totalReportedRevenue) ||
      payload.rawRecords.reduce((sum, r) => sum + (Number(r.revenue) || 0), 0);

    const batchRes = await client.query(
      `INSERT INTO public.pos_import_batches
       (restaurant_id, file_name, file_type, raw_rows_count, valid_rows_count, discarded_rows_count, duplicate_rows_count, date_start, date_end, total_reported_revenue, column_mapping_json, layout_config_json)
       VALUES ($1, $2, 'PETPOOJA_EXCEL', $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id;`,
      [
        restaurantId,
        fileNames,
        payload.rawRecords.length,
        rec.validRows || payload.rawRecords.length,
        rec.invalidRows || 0,
        rec.duplicatesSkipped || 0,
        rec.dateRangeStart && /^\d{4}-\d{2}-\d{2}/.test(rec.dateRangeStart) ? rec.dateRangeStart : null,
        rec.dateRangeEnd && /^\d{4}-\d{2}-\d{2}/.test(rec.dateRangeEnd) ? rec.dateRangeEnd : null,
        totalRev,
        JSON.stringify(rec.columnMapping || {}),
        JSON.stringify(rec.layoutConfig || {}),
      ]
    );

    const batchId = batchRes.rows[0].id;

    // 3. Insert raw sales records in chunks of 200
    const CHUNK_SIZE = 200;
    let rowsInserted = 0;

    for (let i = 0; i < payload.rawRecords.length; i += CHUNK_SIZE) {
      const chunk = payload.rawRecords.slice(i, i + CHUNK_SIZE);
      const rowValues: string[] = [];
      const rowParams: any[] = [];
      let pIdx = 1;

      chunk.forEach((row, idx) => {
        const sourceIndex = i + idx + 1;
        const invoiceId = String(row.invoiceId || row.rowId || `INV-${sourceIndex}`).slice(0, 50);
        const saleDate = row.date && /^\d{4}-\d{2}-\d{2}/.test(row.date) ? row.date.slice(0, 10) : null;
        const rawItemName = (row.rawItemName || 'Unnamed Dish').trim();
        const rawVariantName = row.rawVariantName ? String(row.rawVariantName).trim() : null;
        const quantity = Number(row.quantity) || 1;
        const netRev = Number(row.revenue) || 0;
        const unitPrice = quantity > 0 ? netRev / quantity : 0;
        const grossRev = netRev;
        const discountAmt = Number(row.discount) || 0;
        const isCancelled = Boolean(row.isReturnOrCancelled);
        const category = row.category ? String(row.category).slice(0, 50) : 'Main Course';
        const orderType = row.orderType ? String(row.orderType).slice(0, 50) : null;
        const salesChannel = row.salesChannel ? String(row.salesChannel).slice(0, 50) : null;
        const outletName = row.outlet ? String(row.outlet).slice(0, 50) : 'Whitefield';

        rowValues.push(
          `($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5}, $${pIdx + 6}, $${pIdx + 7}, $${pIdx + 8}, $${pIdx + 9}, $${pIdx + 10}, $${pIdx + 11}, $${pIdx + 12}, $${pIdx + 13}, $${pIdx + 14}, $${pIdx + 15}, $${pIdx + 16})`
        );

        rowParams.push(
          batchId,
          restaurantId,
          sourceIndex,
          invoiceId,
          saleDate,
          rawItemName,
          rawVariantName,
          quantity,
          unitPrice,
          grossRev,
          discountAmt,
          netRev,
          isCancelled,
          category,
          orderType,
          salesChannel,
          outletName
        );

        pIdx += 17;
      });

      if (rowValues.length > 0) {
        await client.query(
          `INSERT INTO public.raw_pos_sales_records
           (batch_id, restaurant_id, source_row_index, invoice_id, sale_date, raw_item_name, raw_variant_name, quantity, unit_price, gross_revenue, discount_amount, net_revenue, is_return_or_cancelled, raw_category, order_type, sales_channel, outlet_name)
           VALUES ${rowValues.join(', ')};`,
          rowParams
        );
        rowsInserted += chunk.length;
      }
    }

    // 4. Ensure parent dishes are created for these sales items
    const uniqueDishes = new Map<string, string>();
    payload.rawRecords.forEach((r) => {
      const name = (r.rawItemName || '').trim();
      if (name && !uniqueDishes.has(name.toLowerCase())) {
        uniqueDishes.set(name.toLowerCase(), name);
      }
    });

    for (const [, name] of uniqueDishes.entries()) {
      await client.query(
        `INSERT INTO public.parent_dishes (restaurant_id, name, category, is_active)
         VALUES ($1, $2, 'Main Course', true)
         ON CONFLICT (restaurant_id, name) DO NOTHING;`,
        [restaurantId, name]
      );
    }

    await client.query('COMMIT');
    client.release();

    return {
      success: true,
      message: `Successfully synchronized ${rowsInserted} POS sales records to Supabase (Batch ID: ${batchId})!`,
      batchId,
      rowsInserted,
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Error in syncSalesRecordsToSupabase:', err);
    throw err;
  }
}

/**
 * Loads all restaurant records from Supabase tables to hydrate application state.
 */
export async function loadDataFromSupabase(targetRestaurantId?: string): Promise<{
  success: boolean;
  data: {
    restaurant: any;
    parentDishes: any[];
    recipes: any[];
    groupingRules: any[];
    fixedCosts: any;
    operatingExpenses: any[];
    staffDirectory: any[];
    payrollSnapshots: any[];
    cateringOrders: any[];
    purchases: any[];
    inventorySnapshots: any[];
    rawRecords: any[];
    reconciliation: any;
    payouts?: any[];
    aggregatorMappings?: any[];
  };
}> {
  const db = getDatabasePool();
  const client = await db.connect();

  try {
    // 1. Get restaurant
    let rRes: any;
    if (targetRestaurantId) {
      rRes = await client.query('SELECT * FROM public.restaurants WHERE id = $1 LIMIT 1;', [targetRestaurantId]);
    } else {
      rRes = await client.query('SELECT * FROM public.restaurants LIMIT 1;');
    }
    const restaurant = rRes.rows[0] || null;
    const restId = restaurant?.id;

    if (!restId) {
      client.release();
      return {
        success: false,
        data: {
          restaurant: null,
          parentDishes: [],
          recipes: [],
          groupingRules: [],
          fixedCosts: null,
          operatingExpenses: [],
          staffDirectory: [],
          payrollSnapshots: [],
          cateringOrders: [],
          purchases: [],
          inventorySnapshots: [],
          rawRecords: [],
          reconciliation: null,
        },
      };
    }

    // 2. Load Operating Expenses
    const ovhRes = await client.query(
      `SELECT * FROM public.outlet_operating_expenses WHERE restaurant_id = $1 ORDER BY id ASC;`,
      [restId]
    );
    const operatingExpenses = ovhRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      categoryGroup: r.category_group,
      description: r.description,
      isCombined: r.is_combined,
      combinedTotalAmount: Number(r.combined_total_amount) || 0,
      splitPctBanaswadi: Number(r.split_pct_banaswadi) || 50,
      splitPctWhitefield: Number(r.split_pct_whitefield) || 50,
      banaswadiAmount: Number(r.banaswadi_amount) || 0,
      whitefieldAmount: Number(r.whitefield_amount) || 0,
      isCustom: r.is_custom,
      notes: r.notes || '',
    }));

    // 3. Load Staff Directory
    const staffRes = await client.query(
      `SELECT * FROM public.staff_directory WHERE restaurant_id = $1 ORDER BY name ASC;`,
      [restId]
    );
    const staffDirectory = staffRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      outletId: r.outlet_id,
      secondaryOutletId: r.secondary_outlet_id,
      primaryOutletAllocationPct: Number(r.primary_outlet_allocation_pct) || 100,
      joiningDate: r.joining_date ? r.joining_date.toISOString().slice(0, 10) : '2025-01-01',
      lastWorkingDate: r.last_working_date ? r.last_working_date.toISOString().slice(0, 10) : undefined,
      status: r.status,
      baseSalary: Number(r.base_salary) || 0,
      salaryEffectiveDate: r.salary_effective_date ? r.salary_effective_date.toISOString().slice(0, 10) : '2026-01-01',
      isFoodAllowanceEligible: r.is_food_allowance_eligible,
      foodAllowanceRatePerDay: Number(r.food_allowance_rate_per_day) || 130,
      maxAllowanceDays: Number(r.max_allowance_days) || 30,
      insurancePremiumMonthly: Number(r.insurance_premium_monthly) || 1500,
      otherAllowances: Number(r.other_allowances) || 0,
      otherEmployerCosts: Number(r.other_employer_costs) || 0,
      salaryAdvances: Number(r.salary_advances) || 0,
      payrollAdjustments: Number(r.payroll_adjustments) || 0,
      bankAccountNumber: r.bank_account_number || '',
      bankIfsc: r.bank_ifsc || '',
      notes: r.notes || '',
      updatedAt: r.updated_at ? r.updated_at.toISOString() : new Date().toISOString(),
    }));

    // 4. Load Catering Orders
    const catRes = await client.query(
      `SELECT * FROM public.catering_orders WHERE restaurant_id = $1 ORDER BY event_date DESC;`,
      [restId]
    );
    const cateringOrders = catRes.rows.map((r) => {
      const grossVal = Number(r.gross_order_value) || 0;
      const discount = Number(r.discount_amount) || 0;
      const taxAmt = Number(r.gst_amount) || 0;
      const netVal = Number(r.net_order_value) || Math.max(0, grossVal - discount);
      const extraCharges = Math.max(0, Math.round((netVal - Math.max(0, grossVal - discount)) * 100) / 100);
      const advAmt = Number(r.advance_payment_amount) || 0;
      const balAmt = Number(r.balance_amount) || Math.max(0, netVal - advAmt);
      const fulfills = r.fulfillment_status || 'Confirmed';
      const isCompleted = fulfills === 'Completed' || fulfills === 'Delivered';
      const uiStatus =
        fulfills === 'Draft' ? 'enquiry'
        : fulfills === 'In Preparation' ? 'preparing'
        : fulfills === 'Cancelled' ? 'cancelled'
        : isCompleted ? 'completed'
        : 'confirmed';
      const payRaw = String(r.payment_status || '').toLowerCase();
      const uiPayment =
        payRaw.includes('unpaid') ? 'unpaid'
        : payRaw.includes('fully') ? 'fully_paid'
        : 'partially_paid';

      const { notes: cleanNotes, stored } = unpackCateringNotes(r.notes);
      const base: any = {
        id: r.id,
        outletId: r.outlet_id === 'banaswadi' ? 'banaswadi' : 'whitefield',
        eventName: r.event_name,
        eventCategory: r.event_category,
        customerName: r.customer_name || '',
        customerContact: r.customer_contact || '',
        customerEmail: r.customer_email || '',
        deliveryAddress: r.delivery_address || '',
        deliveryLocation: r.delivery_address || '',
        eventDate: r.event_date ? r.event_date.toISOString().slice(0, 10) : '',
        orderConfirmationDate: r.order_confirmation_date ? r.order_confirmation_date.toISOString().slice(0, 10) : '',
        guestCount: Number(r.guest_count) || 50,
        foodPackageType: r.food_package_type || '',
        pricingType: r.pricing_type || 'PER_PLATE',
        pricePerPlate: Number(r.price_per_plate) || 0,
        lumpSumAmount: Number(r.lump_sum_amount) || 0,

        // Database column mirrors
        grossOrderValue: grossVal,
        discountAmount: discount,
        gstAmount: taxAmt,
        netOrderValue: netVal,
        advancePaymentAmount: advAmt,
        balanceAmount: balAmt,
        paymentStatus: uiPayment,
        fulfillmentStatus: fulfills,

        // Frontend CateringOrder model properties
        agreedOrderValue: grossVal,
        customerDiscount: discount,
        additionalDeliveryCharges: extraCharges,
        otherAgreedCharges: 0,
        taxInclusive: true,
        taxRatePct: 5,
        taxAmount: taxAmt,
        netRecognizedValue: isCompleted ? netVal : 0,
        advanceAmountCollected: advAmt,
        remainingAmountDue: balAmt,
        totalAmountCollected: advAmt,
        refunds: 0,
        adjustments: 0,
        status: uiStatus,
        posInvoiceStatus: 'not_generated',
        gstClassification: '5% Restaurant (No ITC)',
        isTaxable: true,
        taxReviewStatus: 'Reviewed & Confirmed',
        menuItems: [],
        expenses: {
          ingredientCost: Math.round(netVal * 0.35),
          packagingCost: Math.round(netVal * 0.05),
          transportationDeliveryExpense: 1500,
          temporaryStaffExpense: 2000,
          venueEquipmentExpense: 1000,
          otherDirectExpenses: 300,
          totalDirectVariableCost: Math.round(netVal * 0.4) + 4800,
        },
        isDirectCostProvisional: !isCompleted,
        cateringContribution: isCompleted ? Math.round(netVal * 0.5) : 0,
        cateringContributionPct: 50,
        isRevenueRecognized: isCompleted,
        revenueRecognitionMonth: r.event_date ? r.event_date.toISOString().slice(0, 7) : '2026-10',
        isPotentialDuplicate: false,
        duplicateConfirmed: false,
        payments: [
          {
            id: `PAY-${r.id}`,
            date: r.order_confirmation_date ? r.order_confirmation_date.toISOString().slice(0, 10) : '',
            amount: advAmt,
            method: 'Bank Transfer',
            type: advAmt >= netVal ? 'final' : 'advance',
          },
        ],
        notes: cleanNotes,
        createdAt: r.created_at ? r.created_at.toISOString() : new Date().toISOString(),
        updatedAt: r.updated_at ? r.updated_at.toISOString() : new Date().toISOString(),
      };
      // Restore every editable field exactly as it was saved
      return stored ? { ...base, ...stored, id: r.id, notes: cleanNotes } : base;
    });

    // 5. Load Purchases
    const purRes = await client.query(
      `SELECT * FROM public.ingredient_purchases WHERE restaurant_id = $1 ORDER BY purchase_date DESC;`,
      [restId]
    );
    const purchases = purRes.rows.map((r) => ({
      id: r.id,
      outletId: r.outlet_id,
      accountingMonth: r.accounting_month,
      purchaseDate: r.purchase_date ? r.purchase_date.toISOString().slice(0, 10) : '',
      supplierName: r.supplier_name,
      category: r.category,
      invoiceNumber: r.invoice_number || '',
      itemDescription: r.item_description || '',
      quantity: Number(r.quantity) || 1,
      unit: r.unit || 'kg',
      ratePerUnit: Number(r.rate_per_unit) || 0,
      grossAmount: Number(r.gross_amount) || 0,
      gstAmount: Number(r.gst_amount) || 0,
      deliveryOrPorterCharge: Number(r.delivery_or_porter_charge) || 0,
      totalAmountINR: Number(r.total_amount_inr) || 0,
      // Same values under the field names the Purchases & COGS screens and Hyperpure audit read
      month: r.accounting_month || (r.purchase_date ? r.purchase_date.toISOString().slice(0, 7) : ''),
      totalAmount: Number(r.total_amount_inr) || 0,
      unitOfMeasure: r.unit || 'kg',
      unitPrice: Number(r.rate_per_unit) || 0,
      transportationExpense: Number(r.delivery_or_porter_charge) || 0,
      paymentMethod: r.payment_mode || 'Bank Transfer',
      paymentStatus: r.payment_status || 'Paid',
      paymentMode: r.payment_mode || 'Bank Transfer',
      notes: r.notes || '',
      createdAt: r.created_at ? r.created_at.toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? r.updated_at.toISOString() : new Date().toISOString(),
    }));

    // 6. Load Inventory Snapshots
    const invRes = await client.query(
      `SELECT * FROM public.monthly_inventory_snapshots WHERE restaurant_id = $1 ORDER BY month_year DESC;`,
      [restId]
    );
    const inventorySnapshots = invRes.rows.map((r) => ({
      id: r.id,
      outletId: r.outlet_id,
      monthYear: r.month_year,
      openingInventoryValue: Number(r.opening_inventory_value) || 0,
      totalPurchasesValue: Number(r.total_purchases_value) || 0,
      closingInventoryValue: Number(r.closing_inventory_value) || 0,
      consumptionCOGSValue: Number(r.consumption_cogs_value) || 0,
      reportedRecipeTheoreticalCOGS: Number(r.reported_recipe_theoretical_cogs) || 0,
      varianceSpoilageValue: Number(r.variance_spoilage_value) || 0,
      costingBasis: r.costing_basis || 'PURCHASE_BASED',
      updatedAt: r.updated_at ? r.updated_at.toISOString() : new Date().toISOString(),
    }));

    // 7. Load Grouping Rules
    const rulesRes = await client.query(
      `SELECT r.*, p.name as parent_dish_name 
       FROM public.dish_grouping_rules r
       JOIN public.parent_dishes p ON r.parent_dish_id = p.id
       WHERE r.restaurant_id = $1;`,
      [restId]
    );
    const groupingRules = rulesRes.rows.map((r) => ({
      id: r.id,
      pattern: r.raw_pattern,
      rawPattern: r.raw_pattern,
      parentDishName: r.parent_dish_name,
      variantName: r.target_variant_name || 'Regular',
      targetVariantName: r.target_variant_name || 'Regular',
      confidence: Number(r.confidence_score) || 100,
      isUserApproved: Boolean(r.is_approved ?? true),
      isApproved: Boolean(r.is_approved ?? true),
      matchType: 'manual' as const,
    }));

    // 7b. Load Dish Recipes & BOMs
    let loadedRecipes: any[] = [];
    try {
      await ensureRecipeCostingSchema(client);
      const recRes = await client.query(
        `SELECT r.*, p.name AS parent_dish_name
         FROM public.recipes r
         JOIN public.parent_dishes p ON r.parent_dish_id = p.id
         WHERE r.restaurant_id = $1
         ORDER BY r.updated_at DESC;`,
        [restId]
      );

      const bomLinesRes = await client.query(
        `SELECT ri.*, i.name AS ingredient_name, i.default_purchase_price, i.purchase_pack_size, i.purchase_pack_unit, i.edible_yield_pct, i.prep_loss_pct
         FROM public.recipe_ingredients ri
         JOIN public.recipes r ON ri.recipe_id = r.id
         JOIN public.ingredients i ON ri.ingredient_id = i.id
         WHERE r.restaurant_id = $1;`,
        [restId]
      );

      const bomByRecipeId = new Map<string, any[]>();
      for (const row of bomLinesRes.rows) {
        const list = bomByRecipeId.get(row.recipe_id) || [];
        list.push({
          id: row.id,
          name: row.ingredient_name,
          quantity: Number(row.quantity_per_batch) || 1,
          unit: normalizeDbMeasurementUnit(row.unit),
          purchasePrice: Number(row.default_purchase_price) || 0,
          purchasePackSize: Number(row.purchase_pack_size) || 1,
          purchasePackUnit: normalizeDbMeasurementUnit(row.purchase_pack_unit),
          yieldPct: Number(row.edible_yield_pct) || 100,
          preparationLossPct: Number(row.prep_loss_pct) || 0,
          calculatedCostPerPortion: Number(row.calculated_portion_cost) || 0,
        });
        bomByRecipeId.set(row.recipe_id, list);
      }

      loadedRecipes = recRes.rows.map((r) => {
        const jsonIngredients = Array.isArray(r.bom_json) ? r.bom_json : [];
        const ingredients =
          jsonIngredients.length > 0 ? jsonIngredients : bomByRecipeId.get(r.id) || [];
        const batchYield = Math.max(1, Number(r.batch_yield_servings) || 1);
        const pkg = Number(r.packaging_cost_per_portion) || 0;
        const fuel = Number(r.cooking_fuel_cost_per_portion) || 0;
        const labor = Number(r.direct_labor_cost_per_portion) || 0;
        const other = Number(r.other_variable_cost_per_portion) || 0;
        const isManualOnly =
          Boolean(r.is_manual_cost_only) ||
          (ingredients.length === 0 && r.unit_cost_override !== null && r.unit_cost_override !== undefined);

        const sumIng = ingredients.reduce(
          (acc: number, item: any) => acc + (Number(item.calculatedCostPerPortion ?? item.directPortionCost) || 0),
          0
        );
        const totalIngCost = isManualOnly
          ? Number(r.unit_cost_override) || 0
          : Math.round((sumIng / batchYield) * 100) / 100;
        const totalVarCost = Math.round((totalIngCost + pkg + fuel + labor + other) * 100) / 100;

        return {
          id: r.id,
          parentDishName: r.parent_dish_name,
          variantName: r.variant_name || 'All Variants',
          recipeName: r.recipe_name,
          batchYieldServings: batchYield,
          ingredients,
          totalIngredientCost: totalIngCost,
          packagingCost: pkg,
          cookingFuelCost: fuel,
          directLaborCost: labor,
          otherVariableCost: other,
          totalVariableCostPerPortion: totalVarCost,
          manualUnitCost:
            r.unit_cost_override !== null && r.unit_cost_override !== undefined
              ? Number(r.unit_cost_override)
              : undefined,
          isManualCostOnly: isManualOnly,
          sourcePdfName: r.source_pdf_name || undefined,
          lastUpdated: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
        };
      });
    } catch (recErr) {
      console.warn('Could not load recipes from Supabase:', recErr);
    }

    // 8. Load Fixed Operating Costs
    const fcRes = await client.query(
      `SELECT * FROM public.fixed_operating_costs WHERE restaurant_id = $1 ORDER BY effective_month DESC LIMIT 1;`,
      [restId]
    );
    const fixedCosts = fcRes.rows[0]
      ? {
          monthlyRent: Number(fcRes.rows[0].monthly_rent) || 0,
          fixedSalaries: Number(fcRes.rows[0].fixed_salaries) || 0,
          fixedUtilities: Number(fcRes.rows[0].fixed_utilities) || 0,
          softwareSubscriptions: Number(fcRes.rows[0].software_subscriptions) || 0,
          otherFixedExpenses: Number(fcRes.rows[0].other_fixed_expenses) || 0,
          totalMonthlyFixedCosts: Number(fcRes.rows[0].total_monthly_fixed_costs) || 0,
        }
      : null;

    // 9. Load Monthly Payroll Snapshots (October Wages & Allowances)
    let payrollSnapshots: any[] = [];
    try {
      const paySnapRes = await client.query(
        `SELECT p.*, s.name as staff_name, s.role as staff_role
         FROM public.monthly_payroll_snapshots p
         JOIN public.staff_directory s ON p.staff_id = s.id
         WHERE p.restaurant_id = $1
         ORDER BY p.month_year DESC, s.name ASC;`,
        [restId]
      );
      payrollSnapshots = paySnapRes.rows.map((r) => ({
        id: r.id,
        month: r.month_year,
        staffId: r.staff_id,
        staffName: r.staff_name,
        role: r.staff_role,
        outletId: r.outlet_id,
        secondaryOutletId: r.secondary_outlet_id,
        primaryAllocationPct: Number(r.primary_allocation_pct) || 100,
        daysWorked: Number(r.days_worked) || 30,
        effectiveBaseSalary: Number(r.effective_base_salary) || 0,
        calculatedFoodAllowance: Number(r.calculated_food_allowance) || 0,
        insuranceCost: Number(r.insurance_cost) || 0,
        otherEmployerCosts: Number(r.other_employer_costs) || 0,
        salaryAdvancesDeducted: Number(r.salary_advances_deducted) || 0,
        payrollAdjustments: Number(r.payroll_adjustments) || 0,
        totalEmployerCost: Number(r.total_employer_cost) || 0,
        netPayableToEmployee: Number(r.net_payable_to_employee) || 0,
        paymentStatus: r.payment_status || 'Approved',
        paymentDate: r.payment_date ? r.payment_date.toISOString().slice(0, 10) : undefined,
        paymentMethod: r.payment_mode || 'Bank Transfer',
        isAudited: r.is_audited,
        notes: r.payment_reference || '',
      }));
    } catch (payErr) {
      console.warn('Could not load monthly_payroll_snapshots:', payErr);
    }

    // 10. Load POS Sales Records and Batch Reconciliation
    let rawRecords: any[] = [];
    let reconciliation: any = null;
    try {
      const batchRes = await client.query(
        `SELECT * FROM public.pos_import_batches WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 1;`,
        [restId]
      );

      if (batchRes.rows.length > 0) {
        const latestBatch = batchRes.rows[0];
        const salesRes = await client.query(
          `SELECT * FROM public.raw_pos_sales_records WHERE batch_id = $1 ORDER BY source_row_index ASC LIMIT 10000;`,
          [latestBatch.id]
        );

        rawRecords = salesRes.rows.map((r) => ({
          rowId: r.invoice_id || r.id,
          sourceFile: latestBatch.file_name,
          rawItemName: r.raw_item_name,
          rawVariantName: r.raw_variant_name || undefined,
          quantity: Number(r.quantity) || 1,
          revenue: Number(r.net_revenue) || 0,
          isNetSales: true,
          date: r.sale_date ? r.sale_date.toISOString().slice(0, 10) : undefined,
          category: r.raw_category || undefined,
          orderType: r.order_type || undefined,
          salesChannel: r.sales_channel || undefined,
          outlet: r.outlet_name || undefined,
          isReturnOrCancelled: r.is_return_or_cancelled,
        }));

        const totalRev = Number(latestBatch.total_reported_revenue) ||
          rawRecords.reduce((sum, r) => sum + r.revenue, 0);

        reconciliation = {
          totalFiles: 1,
          fileNames: [latestBatch.file_name],
          totalRawRows: latestBatch.raw_rows_count || rawRecords.length,
          validRows: latestBatch.valid_rows_count || rawRecords.length,
          invalidRows: latestBatch.discarded_rows_count || 0,
          duplicatesSkipped: latestBatch.duplicate_rows_count || 0,
          returnsOrCancelledCount: 0,
          returnsRevenueExcluded: 0,
          totalReportedRevenue: totalRev,
          isNetSales: true,
          totalUnitsSold: rawRecords.reduce((sum, r) => sum + r.quantity, 0),
          uniqueRawItems: new Set(rawRecords.map((r) => r.rawItemName)).size,
          uniqueParentDishes: new Set(rawRecords.map((r) => r.rawItemName)).size,
          detectedGranularity: 'daily',
          monthsPresent: ['2026-10'],
          dateRangeStart: latestBatch.date_start ? latestBatch.date_start.toISOString().slice(0, 10) : undefined,
          dateRangeEnd: latestBatch.date_end ? latestBatch.date_end.toISOString().slice(0, 10) : undefined,
          hasOutletGrouping: true,
        };
      }
    } catch (salesErr) {
      console.warn('Could not load raw_pos_sales_records:', salesErr);
    }

    // 11. Load Platform Payout Reconciliation Records & Aggregator Restaurant ID Mappings
    let payouts: any[] = [];
    let aggregatorMappings: any[] = [];
    try {
      await ensurePayoutSchemaAndMappings(client, restId);
      const payoutRes = await client.query(
        `SELECT * FROM public.platform_payout_reconciliation WHERE restaurant_id = $1 ORDER BY month_year DESC, updated_at DESC;`,
        [restId]
      );
      payouts = payoutRes.rows.map(mapDbRowToPlatformPayout);

      const mapRes = await client.query(
        `SELECT * FROM public.aggregator_restaurant_mappings WHERE restaurant_id = $1 ORDER BY platform ASC, brand_name ASC;`,
        [restId]
      );
      aggregatorMappings = mapRes.rows.map((m: any) => ({
        id: m.id,
        platform: String(m.platform || 'swiggy').toLowerCase(),
        restaurantId: m.aggregator_restaurant_id,
        brandName: m.brand_name,
        outletId: m.outlet_id === 'whitefield' ? 'whitefield' : 'banaswadi',
        isDefault: Boolean(m.is_default),
        notes: m.notes || undefined,
      }));
    } catch (payoutErr) {
      console.warn('Could not load platform_payout_reconciliation:', payoutErr);
    }

    client.release();

    return {
      success: true,
      data: {
        restaurant,
        parentDishes: [], // Loaded from POS imports
        recipes: loadedRecipes,
        groupingRules,
        fixedCosts,
        operatingExpenses,
        staffDirectory,
        payrollSnapshots,
        cateringOrders,
        purchases,
        inventorySnapshots,
        rawRecords,
        reconciliation,
        payouts,
        aggregatorMappings,
      },
    };
  } catch (err: any) {
    client.release();
    console.error('Error loading data from Supabase:', err);
    throw err;
  }
}

/**
 * Persists user-confirmed Aggregator Payout statement(s) to Supabase after duplicate check.
 */
export async function saveConfirmedPayoutsToSupabase(payload: {
  payouts: any[];
  mappings?: any[];
  mode?: 'create' | 'edit';
  restaurantName?: string;
}): Promise<{
  success: boolean;
  savedCount: number;
  allPayouts: any[];
}> {
  const db = getDatabasePool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    let restaurantId: string;
    const restRes = await client.query('SELECT id FROM public.restaurants LIMIT 1');
    if (restRes.rows.length > 0) {
      restaurantId = restRes.rows[0].id;
    } else {
      const createRest = await client.query(
        `INSERT INTO public.restaurants (name, currency, pos_type)
         VALUES ($1, 'INR', 'PETPOOJA') RETURNING id;`,
        [payload.restaurantName || 'MenuMind Grand Dining']
      );
      restaurantId = createRest.rows[0].id;
    }

    await ensurePayoutSchemaAndMappings(client, restaurantId);

    // Server-side duplicate rejection on newly uploaded files
    if (payload.mode !== 'edit') {
      for (const p of payload.payouts) {
        const rowId = String(p.id || '');
        const fileHash = p.fileHash ? String(p.fileHash).trim() : '';
        const fileName = p.sourceFileName ? String(p.sourceFileName).trim() : '';
        const dataFp = p.dataFingerprint ? String(p.dataFingerprint).trim() : '';

        if (fileHash) {
          const dupHash = await client.query(
            `SELECT id, file_name, brand_name, outlet_id, month_year
             FROM public.platform_payout_reconciliation
             WHERE restaurant_id = $1 AND file_hash = $2 AND id <> $3
             LIMIT 1;`,
            [restaurantId, fileHash, rowId]
          );
          if (dupHash.rows.length > 0) {
            const ex = dupHash.rows[0];
            const err: any = new Error(
              `Duplicate File Rejected by Supabase: "${fileName || 'File'}" matches already-stored statement "${ex.file_name || ex.id}" (${ex.brand_name || ''} · ${ex.outlet_id} · ${ex.month_year}).`
            );
            err.statusCode = 409;
            throw err;
          }
        }

        if (fileName) {
          const dupName = await client.query(
            `SELECT id, file_name, brand_name, outlet_id, month_year
             FROM public.platform_payout_reconciliation
             WHERE restaurant_id = $1 AND LOWER(COALESCE(file_name, payout_reference_id, '')) = LOWER($2) AND id <> $3
             LIMIT 1;`,
            [restaurantId, fileName, rowId]
          );
          if (dupName.rows.length > 0) {
            const ex = dupName.rows[0];
            const err: any = new Error(
              `Duplicate File Rejected by Supabase: "${fileName}" was already uploaded (${ex.brand_name || ''} · ${ex.outlet_id} · ${ex.month_year}).`
            );
            err.statusCode = 409;
            throw err;
          }
        }

        if (dataFp) {
          const dupFp = await client.query(
            `SELECT id, file_name, brand_name, outlet_id, month_year
             FROM public.platform_payout_reconciliation
             WHERE restaurant_id = $1 AND data_fingerprint = $2 AND id <> $3
             LIMIT 1;`,
            [restaurantId, dataFp, rowId]
          );
          if (dupFp.rows.length > 0) {
            const ex = dupFp.rows[0];
            const err: any = new Error(
              `Duplicate Payout Data Rejected by Supabase: Identical settlement figures already exist in "${ex.file_name || ex.id}" (${ex.brand_name || ''} · ${ex.outlet_id} · ${ex.month_year}).`
            );
            err.statusCode = 409;
            throw err;
          }
        }
      }
    }

    // Upsert any newly added/updated Restaurant ID mappings
    if (Array.isArray(payload.mappings) && payload.mappings.length > 0) {
      for (const m of payload.mappings) {
        if (!m?.restaurantId) continue;
        const plat = String(m.platform || 'swiggy').toLowerCase().trim();
        const resIdStr = String(m.restaurantId).trim();
        const outId = String(m.outletId || 'banaswadi').toLowerCase().includes('white')
          ? 'whitefield'
          : 'banaswadi';
        await client.query(
          `INSERT INTO public.aggregator_restaurant_mappings
           (id, restaurant_id, platform, aggregator_restaurant_id, brand_name, outlet_id, is_default, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (restaurant_id, platform, aggregator_restaurant_id) DO UPDATE SET
             brand_name = EXCLUDED.brand_name,
             outlet_id = EXCLUDED.outlet_id,
             notes = EXCLUDED.notes,
             updated_at = now();`,
          [
            m.id || `map-${plat}-${resIdStr}`,
            restaurantId,
            plat,
            resIdStr,
            String(m.brandName || 'Banglar Jhale Jhole').trim(),
            outId,
            Boolean(m.isDefault),
            m.notes || null,
          ]
        );
      }
    }

    for (const p of payload.payouts) {
      await upsertPlatformPayoutRow(client, restaurantId, p);
    }

    const allRes = await client.query(
      `SELECT * FROM public.platform_payout_reconciliation WHERE restaurant_id = $1 ORDER BY month_year DESC, updated_at DESC;`,
      [restaurantId]
    );

    await client.query('COMMIT');
    client.release();

    return {
      success: true,
      savedCount: payload.payouts.length,
      allPayouts: allRes.rows.map(mapDbRowToPlatformPayout),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }
}

export async function deletePayoutFromSupabase(payoutId: string): Promise<{ success: boolean }> {
  const db = getDatabasePool();
  const client = await db.connect();
  try {
    await client.query('DELETE FROM public.platform_payout_reconciliation WHERE id = $1;', [payoutId]);
    client.release();
    return { success: true };
  } catch (err) {
    client.release();
    throw err;
  }
}

export async function saveAggregatorMappingsToSupabase(mappings: any[]): Promise<{ success: boolean; count: number }> {
  const db = getDatabasePool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const restRes = await client.query('SELECT id FROM public.restaurants LIMIT 1');
    let restaurantId: string;
    if (restRes.rows.length > 0) {
      restaurantId = restRes.rows[0].id;
    } else {
      const createRest = await client.query(
        `INSERT INTO public.restaurants (name, currency, pos_type)
         VALUES ('MenuMind Grand Dining', 'INR', 'PETPOOJA') RETURNING id;`
      );
      restaurantId = createRest.rows[0].id;
    }

    await ensurePayoutSchemaAndMappings(client, restaurantId);

    // Replace custom/current mappings cleanly
    await client.query(
      'DELETE FROM public.aggregator_restaurant_mappings WHERE restaurant_id = $1;',
      [restaurantId]
    );

    let count = 0;
    for (const m of mappings) {
      if (!m?.restaurantId) continue;
      const plat = String(m.platform || 'swiggy').toLowerCase().trim();
      const resIdStr = String(m.restaurantId).trim();
      const outId = String(m.outletId || 'banaswadi').toLowerCase().includes('white')
        ? 'whitefield'
        : 'banaswadi';
      await client.query(
        `INSERT INTO public.aggregator_restaurant_mappings
         (id, restaurant_id, platform, aggregator_restaurant_id, brand_name, outlet_id, is_default, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (restaurant_id, platform, aggregator_restaurant_id) DO UPDATE SET
           brand_name = EXCLUDED.brand_name,
           outlet_id = EXCLUDED.outlet_id,
           notes = EXCLUDED.notes,
           updated_at = now();`,
        [
          m.id || `map-${plat}-${resIdStr}`,
          restaurantId,
          plat,
          resIdStr,
          String(m.brandName || 'Banglar Jhale Jhole').trim(),
          outId,
          Boolean(m.isDefault),
          m.notes || null,
        ]
      );
      count++;
    }

    await client.query('COMMIT');
    client.release();
    return { success: true, count };
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }
}

function normalizeDbMeasurementUnit(raw?: string): string {
  const clean = String(raw || 'g').toLowerCase().replace(/\./g, '').trim();
  if (clean === 'kg' || clean === 'kgs' || clean === 'kilogram' || clean === 'kilograms') return 'kg';
  if (clean === 'g' || clean === 'gm' || clean === 'gms' || clean === 'gram' || clean === 'grams') return 'g';
  if (clean === 'l' || clean === 'ltr' || clean === 'ltrs' || clean === 'liter' || clean === 'liters') return 'l';
  if (clean === 'litre' || clean === 'litres') return 'litre';
  if (clean === 'ml' || clean === 'milliliter' || clean === 'millilitre') return 'ml';
  if (clean === 'tbsp' || clean === 'tablespoon' || clean === 'tablespoons') return 'tbsp';
  if (clean === 'tsp' || clean === 'teaspoon' || clean === 'teaspoons') return 'tsp';
  if (clean === 'pc' || clean === 'pcs') return 'pc';
  if (clean === 'portion' || clean === 'portions') return 'portion';
  if (
    clean === 'piece' ||
    clean === 'pieces' ||
    clean === 'no' ||
    clean === 'nos' ||
    clean === 'unit' ||
    clean === 'units' ||
    clean === 'plate' ||
    clean === 'pkt' ||
    clean === 'pack'
  ) {
    return 'piece';
  }
  return 'g';
}

async function ensureRecipeCostingSchema(client: any): Promise<void> {
  await client.query(`
    ALTER TABLE public.recipes
      ADD COLUMN IF NOT EXISTS variant_name TEXT DEFAULT 'All Variants',
      ADD COLUMN IF NOT EXISTS unit_cost_override NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS is_manual_cost_only BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS source_pdf_name TEXT,
      ADD COLUMN IF NOT EXISTS bom_json JSONB;
  `);
}

export async function saveDishRecipeToSupabase(payload: {
  recipe: any;
  parentDish?: any;
  groupingRules?: any[];
  restaurantName?: string;
}): Promise<{
  success: boolean;
  recipeId: string;
  parentDishId: string;
}> {
  const db = getDatabasePool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await ensureRecipeCostingSchema(client);

    const restRes = await client.query('SELECT id FROM public.restaurants LIMIT 1');
    let restaurantId: string;
    if (restRes.rows.length > 0) {
      restaurantId = restRes.rows[0].id;
    } else {
      const createRest = await client.query(
        `INSERT INTO public.restaurants (name, currency, pos_type)
         VALUES ($1, 'INR', 'PETPOOJA') RETURNING id;`,
        [payload.restaurantName || 'MenuMind Grand Dining']
      );
      restaurantId = createRest.rows[0].id;
    }

    const rec = payload.recipe;
    const parentName = String(rec?.parentDishName || payload.parentDish?.name || '').trim();
    if (!parentName) {
      throw new Error('Dish name is required to save recipe costing.');
    }

    const category = String(payload.parentDish?.category || 'General').trim();
    const pdRes = await client.query(
      `INSERT INTO public.parent_dishes (restaurant_id, name, category)
       VALUES ($1, $2, $3)
       ON CONFLICT (restaurant_id, name)
       DO UPDATE SET category = EXCLUDED.category, updated_at = now()
       RETURNING id;`,
      [restaurantId, parentName, category]
    );
    const parentDishId: string = pdRes.rows[0].id;

    if (payload.parentDish && Array.isArray(payload.parentDish.variants)) {
      for (const v of payload.parentDish.variants) {
        if (!v?.rawName) continue;
        await client.query(
          `INSERT INTO public.dish_variants (restaurant_id, parent_dish_id, variant_name, raw_pos_item_name, average_selling_price)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (restaurant_id, raw_pos_item_name)
           DO UPDATE SET
             parent_dish_id = EXCLUDED.parent_dish_id,
             variant_name = EXCLUDED.variant_name,
             average_selling_price = EXCLUDED.average_selling_price,
             updated_at = now();`,
          [
            restaurantId,
            parentDishId,
            v.variantName || 'Regular',
            v.rawName,
            Number(v.averagePrice) || 0,
          ]
        );
      }
    }

    if (Array.isArray(payload.groupingRules) && payload.groupingRules.length > 0) {
      for (const r of payload.groupingRules) {
        const rawPat = String(r.pattern || r.rawPattern || '').trim();
        const ruleParent = String(r.parentDishName || '').trim();
        if (!rawPat || !ruleParent) continue;

        const ruleParentRes = await client.query(
          `INSERT INTO public.parent_dishes (restaurant_id, name, category)
           VALUES ($1, $2, 'General')
           ON CONFLICT (restaurant_id, name) DO UPDATE SET updated_at = now()
           RETURNING id;`,
          [restaurantId, ruleParent]
        );
        const ruleParentId = ruleParentRes.rows[0].id;

        await client.query(
          `INSERT INTO public.dish_grouping_rules
           (restaurant_id, raw_pattern, match_type, parent_dish_id, target_variant_name, confidence_score, is_approved)
           VALUES ($1, $2, 'EXACT', $3, $4, $5, $6)
           ON CONFLICT (restaurant_id, raw_pattern)
           DO UPDATE SET
             parent_dish_id = EXCLUDED.parent_dish_id,
             target_variant_name = EXCLUDED.target_variant_name,
             confidence_score = EXCLUDED.confidence_score,
             is_approved = EXCLUDED.is_approved;`,
          [
            restaurantId,
            rawPat,
            ruleParentId,
            r.variantName || r.targetVariantName || 'Regular',
            Number(r.confidence) || 100,
            r.isUserApproved !== undefined ? Boolean(r.isUserApproved) : true,
          ]
        );
      }
    }

    const ingredients = Array.isArray(rec.ingredients) ? rec.ingredients : [];
    const ingNameToId = new Map<string, string>();
    for (const ing of ingredients) {
      const cleanName = String(ing.name || '').trim();
      if (!cleanName) continue;
      const packUnit = normalizeDbMeasurementUnit(ing.purchasePackUnit || ing.unit);
      const packPrice = Number(ing.purchasePrice ?? ing.directPortionCost ?? 0) || 0;
      const packSize = Math.max(0.001, Number(ing.purchasePackSize) || 1);
      const yieldPct = Math.min(100, Math.max(1, Number(ing.yieldPct) || 100));

      const ingRes = await client.query(
        `INSERT INTO public.ingredients
         (restaurant_id, name, default_purchase_price, purchase_pack_size, purchase_pack_unit, edible_yield_pct)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (restaurant_id, name)
         DO UPDATE SET
           default_purchase_price = EXCLUDED.default_purchase_price,
           purchase_pack_size = EXCLUDED.purchase_pack_size,
           purchase_pack_unit = EXCLUDED.purchase_pack_unit,
           edible_yield_pct = EXCLUDED.edible_yield_pct,
           updated_at = now()
         RETURNING id;`,
        [restaurantId, cleanName, packPrice, packSize, packUnit, yieldPct]
      );
      ingNameToId.set(cleanName.toLowerCase(), ingRes.rows[0].id);
    }

    const isManualOnly =
      Boolean(rec.isManualCostOnly) ||
      (ingredients.length === 0 && rec.manualUnitCost !== undefined);
    const unitCostOverride =
      rec.manualUnitCost !== undefined && rec.manualUnitCost !== null
        ? Number(rec.manualUnitCost)
        : Number(rec.totalVariableCostPerPortion ?? rec.totalIngredientCost ?? 0);

    const canonicalRecipeName = rec.recipeName || `${parentName} Standard BOM`;
    await client.query(
      `DELETE FROM public.recipes WHERE restaurant_id = $1 AND parent_dish_id = $2 AND recipe_name <> $3;`,
      [restaurantId, parentDishId, canonicalRecipeName]
    );

    const recipeDbRes = await client.query(
      `INSERT INTO public.recipes
       (restaurant_id, parent_dish_id, recipe_name, variant_name, batch_yield_servings, packaging_cost_per_portion, cooking_fuel_cost_per_portion, direct_labor_cost_per_portion, other_variable_cost_per_portion, unit_cost_override, is_manual_cost_only, source_pdf_name, bom_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (restaurant_id, parent_dish_id, recipe_name)
       DO UPDATE SET
         variant_name = EXCLUDED.variant_name,
         batch_yield_servings = EXCLUDED.batch_yield_servings,
         packaging_cost_per_portion = EXCLUDED.packaging_cost_per_portion,
         cooking_fuel_cost_per_portion = EXCLUDED.cooking_fuel_cost_per_portion,
         direct_labor_cost_per_portion = EXCLUDED.direct_labor_cost_per_portion,
         other_variable_cost_per_portion = EXCLUDED.other_variable_cost_per_portion,
         unit_cost_override = EXCLUDED.unit_cost_override,
         is_manual_cost_only = EXCLUDED.is_manual_cost_only,
         source_pdf_name = COALESCE(EXCLUDED.source_pdf_name, public.recipes.source_pdf_name),
         bom_json = EXCLUDED.bom_json,
         updated_at = now()
       RETURNING id;`,
      [
        restaurantId,
        parentDishId,
        canonicalRecipeName,
        rec.variantName || 'All Variants',
        Math.max(1, Number(rec.batchYieldServings) || 1),
        Number(rec.packagingCost) || 0,
        Number(rec.cookingFuelCost) || 0,
        Number(rec.directLaborCost) || 0,
        Number(rec.otherVariableCost) || 0,
        unitCostOverride,
        isManualOnly,
        rec.sourcePdfName || null,
        JSON.stringify(ingredients),
      ]
    );
    const recipeId: string = recipeDbRes.rows[0].id;

    await client.query('DELETE FROM public.recipe_ingredients WHERE recipe_id = $1;', [recipeId]);

    const seenIngIds = new Set<string>();
    for (const ing of ingredients) {
      const cleanName = String(ing.name || '').trim().toLowerCase();
      const ingId = ingNameToId.get(cleanName);
      if (!ingId || seenIngIds.has(ingId)) continue;
      seenIngIds.add(ingId);
      await client.query(
        `INSERT INTO public.recipe_ingredients
         (recipe_id, ingredient_id, quantity_per_batch, unit, calculated_portion_cost, notes)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [
          recipeId,
          ingId,
          Math.max(0.001, Number(ing.quantity) || 1),
          normalizeDbMeasurementUnit(ing.unit),
          Number(ing.calculatedCostPerPortion ?? ing.directPortionCost ?? 0) || 0,
          ing.notes || null,
        ]
      );
    }

    await client.query('COMMIT');
    client.release();

    return {
      success: true,
      recipeId,
      parentDishId,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }
}
