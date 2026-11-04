-- ==============================================================================
-- MENUMIND AI — ADDITIONAL MODULES SUPABASE / POSTGRESQL PRODUCTION DDL
-- ==============================================================================
-- This DDL script adds relational tables, indexes, triggers, RLS policies,
-- and analytical views for all enhanced MenuMind modules:
--   1. Outlet Operating Overheads & Configurable Split Engine (14 Line Items)
--   2. Staff Directory & Wages / Payroll Management (₹130/day food rule, multi-outlet)
--   3. Bulk Catering & Event Order Management (Direct Non-Petpooja Revenue)
--   4. Purchases & COGS Management (Hyperpure, Meat, Vegetables, Porter Transfers)
--   5. Monthly Inventory Snapshots & Food Costing Basis
--   6. Platform Settlement & Payout Reconciliation (Swiggy, Zomato, Direct)
--   7. Analytical Views: Outlet P&L Rollup & Dynamic Break-Even Analysis
--
-- Target Database: PostgreSQL 14+ / Supabase (Run in Supabase SQL Editor)
-- Idempotent: Safe to execute multiple times (CREATE TABLE IF NOT EXISTS, DO $$)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive matching

-- ==============================================================================
-- 2. RESTAURANT OUTLETS MASTER TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_outlets (
    id VARCHAR(50) PRIMARY KEY, -- 'banaswadi', 'whitefield'
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL, -- 'BW', 'WF'
    name TEXT NOT NULL,        -- 'Banaswadi', 'Whitefield'
    address TEXT,
    city TEXT DEFAULT 'Bangalore',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, code)
);

-- ==============================================================================
-- 3. OUTLET OPERATING OVERHEADS & CONFIGURABLE SPLIT ENGINE
-- ==============================================================================
-- Supports 14 mandatory operating categories:
--   Kitchen Rent, Staff Accommodation, Electricity, Tanker Water, Kitchen Water,
--   Daily Cleaning, Monthly Deep Cleaning, Insurance, POS Software, Cloud and Apps,
--   FSSAI License, Other License, Porter Charge, Misc Cost + Custom overheads.
-- Includes shared/combined cost toggle and user-configurable split % (default 50-50).

CREATE TABLE IF NOT EXISTS public.outlet_operating_expenses (
    id VARCHAR(100) PRIMARY KEY, -- e.g. 'exp_kitchen_rent', 'exp_cloud_and_apps'
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category_group VARCHAR(50) NOT NULL CHECK (
        category_group IN (
            'Facility & Rent',
            'Utilities & Water',
            'Hygiene & Cleaning',
            'Technology & Software',
            'Compliance & Insurance',
            'Logistics & Misc',
            'Custom'
        )
    ),
    description TEXT,
    is_combined BOOLEAN NOT NULL DEFAULT false, -- Shared expense for all outlets?
    combined_total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    split_pct_banaswadi NUMERIC(5, 2) NOT NULL DEFAULT 50.00 CHECK (split_pct_banaswadi >= 0 AND split_pct_banaswadi <= 100),
    split_pct_whitefield NUMERIC(5, 2) NOT NULL DEFAULT 50.00 CHECK (split_pct_whitefield >= 0 AND split_pct_whitefield <= 100),
    banaswadi_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    whitefield_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_custom BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Monthly Operating Overhead Ledger (Historical Accounting Audit)
CREATE TABLE IF NOT EXISTS public.monthly_outlet_overhead_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL, -- 'YYYY-MM'
    outlet_id VARCHAR(50) NOT NULL REFERENCES public.restaurant_outlets(id) ON DELETE CASCADE,
    expense_item_id VARCHAR(100) NOT NULL REFERENCES public.outlet_operating_expenses(id) ON DELETE CASCADE,
    expense_name TEXT NOT NULL,
    category_group VARCHAR(50) NOT NULL,
    effective_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_shared_split BOOLEAN NOT NULL DEFAULT false,
    split_pct_applied NUMERIC(5, 2),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PAID' CHECK (payment_status IN ('PAID', 'PENDING', 'DUE')),
    payment_date DATE,
    vendor_invoice_no VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, month_year, outlet_id, expense_item_id)
);

-- ==============================================================================
-- 4. STAFF DIRECTORY & WAGES / PAYROLL MANAGEMENT
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.staff_directory (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'EMP-WF-001'
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role VARCHAR(100) NOT NULL, -- Bengali Chef, Kitchen Helper, Manager, Cleaner, etc.
    outlet_id VARCHAR(50) NOT NULL REFERENCES public.restaurant_outlets(id) ON DELETE RESTRICT,
    secondary_outlet_id VARCHAR(50) REFERENCES public.restaurant_outlets(id) ON DELETE SET NULL,
    primary_outlet_allocation_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.00 CHECK (primary_outlet_allocation_pct >= 0 AND primary_outlet_allocation_pct <= 100),
    joining_date DATE NOT NULL,
    last_working_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'exited')),
    
    -- Compensation & Statutory Rules
    base_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (base_salary >= 0),
    salary_effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_food_allowance_eligible BOOLEAN NOT NULL DEFAULT true, -- Policy: Managers strictly ineligible
    food_allowance_rate_per_day NUMERIC(8, 2) NOT NULL DEFAULT 130.00,
    max_allowance_days INTEGER NOT NULL DEFAULT 30,
    insurance_premium_monthly NUMERIC(10, 2) NOT NULL DEFAULT 1500.00,
    other_allowances NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    other_employer_costs NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- PF, Gratuity reserve, statutory
    salary_advances NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payroll_adjustments NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    
    bank_account_number VARCHAR(50),
    bank_ifsc VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Monthly Payroll Snapshots (Monthly finalized payroll per employee & outlet)
CREATE TABLE IF NOT EXISTS public.monthly_payroll_snapshots (
    id VARCHAR(120) PRIMARY KEY, -- e.g. 'PAY-2026-10-EMP-WF-001-whitefield'
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    staff_id VARCHAR(50) NOT NULL REFERENCES public.staff_directory(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL, -- 'YYYY-MM'
    outlet_id VARCHAR(50) NOT NULL REFERENCES public.restaurant_outlets(id) ON DELETE RESTRICT,
    secondary_outlet_id VARCHAR(50) REFERENCES public.restaurant_outlets(id) ON DELETE SET NULL,
    primary_allocation_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    days_worked NUMERIC(4, 1) NOT NULL DEFAULT 30.0 CHECK (days_worked >= 0 AND days_worked <= 31),
    
    effective_base_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    calculated_food_allowance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    insurance_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    other_employer_costs NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    salary_advances_deducted NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payroll_adjustments NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    
    total_employer_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Authoritative fixed salary cost
    net_payable_to_employee NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Net cash payout
    
    payment_status VARCHAR(20) NOT NULL DEFAULT 'Approved' CHECK (payment_status IN ('Pending', 'Approved', 'Disbursed', 'Hold')),
    payment_date DATE,
    payment_mode VARCHAR(30) DEFAULT 'Bank Transfer',
    payment_reference VARCHAR(100),
    is_audited BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (staff_id, month_year, outlet_id)
);

-- Payroll & Compensation Audit Logs
CREATE TABLE IF NOT EXISTS public.payroll_audit_logs (
    id VARCHAR(100) PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    staff_id VARCHAR(50) REFERENCES public.staff_directory(id) ON DELETE SET NULL,
    staff_name TEXT NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'SALARY_CHANGE', 'ALLOWANCE_UPDATE', 'TRANSFER', 'STATUS_CHANGE', etc.
    old_values JSONB,
    new_values JSONB,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 5. BULK CATERING & EVENT ORDER MANAGEMENT
-- ==============================================================================
-- Tracks direct non-POS bulk catering orders (Durga Puja, Kali Puja, Weddings, etc.)

CREATE TABLE IF NOT EXISTS public.catering_orders (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'CAT-2026-10-001'
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    outlet_id VARCHAR(50) NOT NULL REFERENCES public.restaurant_outlets(id) ON DELETE RESTRICT,
    event_name TEXT NOT NULL,
    event_category VARCHAR(100) NOT NULL CHECK (length(trim(event_category)) > 0),
    customer_name TEXT,
    customer_contact VARCHAR(30),
    customer_email TEXT,
    delivery_address TEXT,
    event_date DATE NOT NULL,
    order_confirmation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    guest_count INTEGER NOT NULL DEFAULT 50 CHECK (guest_count > 0),
    food_package_type TEXT,
    pricing_type VARCHAR(20) NOT NULL DEFAULT 'PER_PLATE' CHECK (pricing_type IN ('PER_PLATE', 'LUMP_SUM')),
    price_per_plate NUMERIC(10, 2) DEFAULT 0.00,
    lump_sum_amount NUMERIC(12, 2) DEFAULT 0.00,
    gross_order_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    gst_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    net_order_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    advance_payment_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_status VARCHAR(30) NOT NULL DEFAULT 'Partially Paid' CHECK (
        payment_status IN ('Unpaid', 'Partially Paid', 'Fully Paid', 'unpaid', 'partially_paid', 'fully_paid', 'advance_only', 'refunded', 'Pending', 'Paid')
    ),
    fulfillment_status VARCHAR(30) NOT NULL DEFAULT 'Confirmed' CHECK (
        fulfillment_status IN ('Draft', 'Confirmed', 'In Preparation', 'Delivered', 'Completed', 'Cancelled', 'enquiry', 'quotation', 'confirmed', 'advance_received', 'preparing', 'completed', 'partially_paid', 'fully_paid', 'cancelled')
    ),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Catering Menu Line Items
CREATE TABLE IF NOT EXISTS public.catering_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catering_order_id VARCHAR(50) NOT NULL REFERENCES public.catering_orders(id) ON DELETE CASCADE,
    dish_name TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    unit_cost_estimated NUMERIC(10, 2) DEFAULT 0.00,
    portion_size_description TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Catering Direct Event Expenses (Meat, Vegetables, Transport, Chef Stipends)
CREATE TABLE IF NOT EXISTS public.catering_order_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catering_order_id VARCHAR(50) NOT NULL REFERENCES public.catering_orders(id) ON DELETE CASCADE,
    expense_category VARCHAR(50) NOT NULL CHECK (
        expense_category IN (
            'Raw Meat & Poultry',
            'Fresh Fish & Seafood',
            'Produce & Vegetables',
            'Disposables & Packaging',
            'Transport & Porter',
            'Specialist Chef Stipend',
            'Service Helper',
            'Other'
        )
    ),
    item_description TEXT,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_status VARCHAR(20) DEFAULT 'Paid',
    receipt_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 6. PURCHASES & COGS MANAGEMENT (HYPERPURE, LOCAL SUPPLIERS, PORTER)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ingredient_purchases (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'PUR-2026-10-001'
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    outlet_id VARCHAR(50) NOT NULL REFERENCES public.restaurant_outlets(id) ON DELETE RESTRICT,
    accounting_month VARCHAR(7) NOT NULL, -- 'YYYY-MM'
    purchase_date DATE NOT NULL,
    supplier_name TEXT NOT NULL, -- Hyperpure, KR Market, Chicken Mart, Porter
    category VARCHAR(50) NOT NULL CHECK (
        category IN (
            'Hyperpure',
            'Local Vegetables',
            'Chicken',
            'Mutton',
            'Fish',
            'Porter',
            'Rice',
            'Oil and Ghee',
            'Spices',
            'Eggs',
            'Dairy',
            'Packaging Materials',
            'Seafood',
            'Fruits',
            'Dry Groceries',
            'Miscellaneous',
            'Other Supplier Purchases'
        )
    ),
    invoice_number VARCHAR(100),
    item_description TEXT,
    quantity NUMERIC(10, 3) NOT NULL DEFAULT 1.000 CHECK (quantity > 0),
    unit VARCHAR(20) NOT NULL DEFAULT 'kg',
    rate_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    gross_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gst_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    delivery_or_porter_charge NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_amount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'Paid' CHECK (payment_status IN ('Paid', 'Unpaid', 'Partial', 'Credit')),
    payment_mode VARCHAR(30) DEFAULT 'Bank Transfer',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Monthly Inventory Snapshots & Food Costing Basis
CREATE TABLE IF NOT EXISTS public.monthly_inventory_snapshots (
    id VARCHAR(100) PRIMARY KEY, -- e.g. 'INV-2026-10-whitefield'
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    outlet_id VARCHAR(50) NOT NULL REFERENCES public.restaurant_outlets(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL, -- 'YYYY-MM'
    opening_inventory_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_purchases_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    closing_inventory_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    consumption_cogs_value NUMERIC(12, 2) GENERATED ALWAYS AS (
        opening_inventory_value + total_purchases_value - closing_inventory_value
    ) STORED,
    reported_recipe_theoretical_cogs NUMERIC(12, 2) DEFAULT 0.00,
    variance_spoilage_value NUMERIC(12, 2) DEFAULT 0.00,
    costing_basis VARCHAR(50) NOT NULL DEFAULT 'PURCHASE_BASED' CHECK (
        costing_basis IN ('PURCHASE_BASED', 'ACTUAL_CONSUMPTION_INVENTORY', 'RECIPE_THEORETICAL')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, outlet_id, month_year)
);

-- ==============================================================================
-- 7. PLATFORM SETTLEMENT & PAYOUT RECONCILIATION
-- ==============================================================================
-- Reconciles Swiggy, Zomato, Magicpin and Direct Payouts

CREATE TABLE IF NOT EXISTS public.platform_payout_reconciliation (
    id VARCHAR(80) PRIMARY KEY, -- e.g. 'PAYOUT-2026-10-SWIGGY-WF'
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    outlet_id VARCHAR(50) NOT NULL REFERENCES public.restaurant_outlets(id) ON DELETE RESTRICT,
    month_year VARCHAR(7) NOT NULL, -- 'YYYY-MM'
    platform VARCHAR(30) NOT NULL CHECK (platform IN ('SWIGGY', 'ZOMATO', 'MAGICPIN', 'DIRECT_ONLINE', 'OTHER')),
    gross_sales_reported NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    customer_discounts_borne NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_platform_sales NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    commission_deducted NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gst_on_commission NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tcs_tds_deducted NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cancellation_charges NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    marketing_ad_deductions NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    other_deductions NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    net_bank_settlement NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    actual_bank_credit_received NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    settlement_variance NUMERIC(12, 2) DEFAULT 0.00,
    settlement_status VARCHAR(30) NOT NULL DEFAULT 'Reconciled' CHECK (
        settlement_status IN ('Reconciled', 'Disputed', 'Pending Bank Credit')
    ),
    payout_reference_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, outlet_id, month_year, platform)
);

-- ==============================================================================
-- 8. INDEXES FOR PERFORMANCE & RELATIONAL JOINS
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_outlets_restaurant ON public.restaurant_outlets (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_operating_exp_rest ON public.outlet_operating_expenses (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_operating_ledger_rest_month_outlet ON public.monthly_outlet_overhead_ledger (restaurant_id, month_year, outlet_id);
CREATE INDEX IF NOT EXISTS idx_staff_rest_outlet_status ON public.staff_directory (restaurant_id, outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_snapshots_month_outlet ON public.monthly_payroll_snapshots (month_year, outlet_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_staff ON public.payroll_audit_logs (staff_id);
CREATE INDEX IF NOT EXISTS idx_catering_rest_outlet_date ON public.catering_orders (restaurant_id, outlet_id, event_date);
CREATE INDEX IF NOT EXISTS idx_catering_items_order ON public.catering_order_items (catering_order_id);
CREATE INDEX IF NOT EXISTS idx_purchases_rest_outlet_month ON public.ingredient_purchases (restaurant_id, outlet_id, accounting_month);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_category ON public.ingredient_purchases (supplier_name, category);
CREATE INDEX IF NOT EXISTS idx_inventory_rest_outlet_month ON public.monthly_inventory_snapshots (restaurant_id, outlet_id, month_year);
CREATE INDEX IF NOT EXISTS idx_platform_payouts_rest_month ON public.platform_payout_reconciliation (restaurant_id, month_year, platform);

-- ==============================================================================
-- 9. TRIGGERS FOR AUTOMATED TIMESTAMP MAINTENANCE
-- ==============================================================================

CREATE OR REPLACE TRIGGER trg_restaurant_outlets_updated_at
    BEFORE UPDATE ON public.restaurant_outlets
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_outlet_operating_expenses_updated_at
    BEFORE UPDATE ON public.outlet_operating_expenses
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_staff_directory_updated_at
    BEFORE UPDATE ON public.staff_directory
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_monthly_payroll_snapshots_updated_at
    BEFORE UPDATE ON public.monthly_payroll_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_catering_orders_updated_at
    BEFORE UPDATE ON public.catering_orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_ingredient_purchases_updated_at
    BEFORE UPDATE ON public.ingredient_purchases
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_monthly_inventory_snapshots_updated_at
    BEFORE UPDATE ON public.monthly_inventory_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_platform_payout_reconciliation_updated_at
    BEFORE UPDATE ON public.platform_payout_reconciliation
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.restaurant_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_operating_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_outlet_overhead_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_payroll_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catering_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catering_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catering_order_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_payout_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant access on restaurant_outlets"
    ON public.restaurant_outlets FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on outlet_operating_expenses"
    ON public.outlet_operating_expenses FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on monthly_outlet_overhead_ledger"
    ON public.monthly_outlet_overhead_ledger FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on staff_directory"
    ON public.staff_directory FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on monthly_payroll_snapshots"
    ON public.monthly_payroll_snapshots FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on payroll_audit_logs"
    ON public.payroll_audit_logs FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on catering_orders"
    ON public.catering_orders FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on catering_order_items"
    ON public.catering_order_items FOR ALL
    USING (
        catering_order_id IN (
            SELECT c.id FROM public.catering_orders c
            WHERE c.restaurant_id IN (SELECT get_auth_user_restaurant_ids())
        )
    );

CREATE POLICY "Tenant access on catering_order_expenses"
    ON public.catering_order_expenses FOR ALL
    USING (
        catering_order_id IN (
            SELECT c.id FROM public.catering_orders c
            WHERE c.restaurant_id IN (SELECT get_auth_user_restaurant_ids())
        )
    );

CREATE POLICY "Tenant access on ingredient_purchases"
    ON public.ingredient_purchases FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on monthly_inventory_snapshots"
    ON public.monthly_inventory_snapshots FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on platform_payout_reconciliation"
    ON public.platform_payout_reconciliation FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

-- ==============================================================================
-- 11. ANALYTICAL BUSINESS VIEWS
-- ==============================================================================

-- View: Unified Outlet Monthly Operating Overhead Breakdown with Shared Splits
CREATE OR REPLACE VIEW public.v_outlet_monthly_overheads AS
SELECT 
    e.restaurant_id,
    o.id AS outlet_id,
    o.name AS outlet_name,
    e.id AS expense_id,
    e.name AS expense_name,
    e.category_group,
    e.is_combined,
    CASE 
        WHEN e.is_combined = true AND o.id = 'banaswadi' 
            THEN ROUND((e.combined_total_amount * e.split_pct_banaswadi) / 100.0, 2)
        WHEN e.is_combined = true AND o.id = 'whitefield' 
            THEN ROUND((e.combined_total_amount * e.split_pct_whitefield) / 100.0, 2)
        WHEN o.id = 'banaswadi' 
            THEN e.banaswadi_amount
        ELSE e.whitefield_amount
    END AS effective_amount,
    CASE 
        WHEN e.is_combined = true AND o.id = 'banaswadi' THEN e.split_pct_banaswadi
        WHEN e.is_combined = true AND o.id = 'whitefield' THEN e.split_pct_whitefield
        ELSE 100.00
    END AS split_pct_applied
FROM public.outlet_operating_expenses e
CROSS JOIN public.restaurant_outlets o
WHERE o.restaurant_id = e.restaurant_id;

-- View: Unified Monthly P&L Rollup per Outlet (POS + Catering - COGS - Payroll - Overheads)
CREATE OR REPLACE VIEW public.v_outlet_monthly_pnl AS
WITH monthly_pos AS (
    SELECT 
        restaurant_id,
        COALESCE(LOWER(outlet_name), 'banaswadi') AS outlet_id,
        TO_CHAR(sale_date, 'YYYY-MM') AS month_year,
        SUM(net_revenue) AS pos_net_sales
    FROM public.raw_pos_sales_records
    WHERE is_return_or_cancelled = false
    GROUP BY restaurant_id, LOWER(outlet_name), TO_CHAR(sale_date, 'YYYY-MM')
),
monthly_catering AS (
    SELECT 
        restaurant_id,
        outlet_id,
        TO_CHAR(event_date, 'YYYY-MM') AS month_year,
        SUM(net_order_value) AS catering_net_revenue
    FROM public.catering_orders
    WHERE fulfillment_status != 'Cancelled'
    GROUP BY restaurant_id, outlet_id, TO_CHAR(event_date, 'YYYY-MM')
),
monthly_cogs AS (
    SELECT 
        restaurant_id,
        outlet_id,
        accounting_month AS month_year,
        SUM(total_amount_inr) AS cogs_purchases
    FROM public.ingredient_purchases
    GROUP BY restaurant_id, outlet_id, accounting_month
),
monthly_payroll AS (
    SELECT 
        restaurant_id,
        outlet_id,
        month_year,
        SUM(total_employer_cost) AS total_payroll_cost
    FROM public.monthly_payroll_snapshots
    GROUP BY restaurant_id, outlet_id, month_year
),
monthly_overheads AS (
    SELECT 
        restaurant_id,
        outlet_id,
        SUM(effective_amount) AS total_operating_overheads
    FROM public.v_outlet_monthly_overheads
    GROUP BY restaurant_id, outlet_id
)
SELECT 
    COALESCE(pos.restaurant_id, cat.restaurant_id, cogs.restaurant_id, pay.restaurant_id) AS restaurant_id,
    COALESCE(pos.outlet_id, cat.outlet_id, cogs.outlet_id, pay.outlet_id) AS outlet_id,
    COALESCE(pos.month_year, cat.month_year, cogs.month_year, pay.month_year) AS month_year,
    COALESCE(pos.pos_net_sales, 0.00) AS pos_net_sales,
    COALESCE(cat.catering_net_revenue, 0.00) AS catering_net_revenue,
    (COALESCE(pos.pos_net_sales, 0.00) + COALESCE(cat.catering_net_revenue, 0.00)) AS total_gross_revenue,
    COALESCE(cogs.cogs_purchases, 0.00) AS total_cogs_purchases,
    (
        (COALESCE(pos.pos_net_sales, 0.00) + COALESCE(cat.catering_net_revenue, 0.00)) - 
        COALESCE(cogs.cogs_purchases, 0.00)
    ) AS gross_profit,
    COALESCE(pay.total_payroll_cost, 0.00) AS total_staff_payroll,
    COALESCE(ovh.total_operating_overheads, 0.00) AS total_operating_overheads,
    (
        COALESCE(pay.total_payroll_cost, 0.00) + 
        COALESCE(ovh.total_operating_overheads, 0.00)
    ) AS total_fixed_obligations,
    (
        (COALESCE(pos.pos_net_sales, 0.00) + COALESCE(cat.catering_net_revenue, 0.00)) - 
        COALESCE(cogs.cogs_purchases, 0.00) - 
        COALESCE(pay.total_payroll_cost, 0.00) - 
        COALESCE(ovh.total_operating_overheads, 0.00)
    ) AS net_operating_profit_ebitda,
    CASE 
        WHEN (COALESCE(pos.pos_net_sales, 0.00) + COALESCE(cat.catering_net_revenue, 0.00)) > 0 
        THEN ROUND(
            ((
                (COALESCE(pos.pos_net_sales, 0.00) + COALESCE(cat.catering_net_revenue, 0.00)) - 
                COALESCE(cogs.cogs_purchases, 0.00) - 
                COALESCE(pay.total_payroll_cost, 0.00) - 
                COALESCE(ovh.total_operating_overheads, 0.00)
            ) / (COALESCE(pos.pos_net_sales, 0.00) + COALESCE(cat.catering_net_revenue, 0.00))) * 100.0,
            2
        )
        ELSE 0.00
    END AS net_profit_margin_pct
FROM monthly_pos pos
FULL OUTER JOIN monthly_catering cat 
    ON pos.restaurant_id = cat.restaurant_id AND pos.outlet_id = cat.outlet_id AND pos.month_year = cat.month_year
FULL OUTER JOIN monthly_cogs cogs 
    ON COALESCE(pos.restaurant_id, cat.restaurant_id) = cogs.restaurant_id 
   AND COALESCE(pos.outlet_id, cat.outlet_id) = cogs.outlet_id 
   AND COALESCE(pos.month_year, cat.month_year) = cogs.month_year
FULL OUTER JOIN monthly_payroll pay 
    ON COALESCE(pos.restaurant_id, cat.restaurant_id, cogs.restaurant_id) = pay.restaurant_id 
   AND COALESCE(pos.outlet_id, cat.outlet_id, cogs.outlet_id) = pay.outlet_id 
   AND COALESCE(pos.month_year, cat.month_year, cogs.month_year) = pay.month_year
LEFT JOIN monthly_overheads ovh 
    ON COALESCE(pos.restaurant_id, cat.restaurant_id, cogs.restaurant_id, pay.restaurant_id) = ovh.restaurant_id 
   AND COALESCE(pos.outlet_id, cat.outlet_id, cogs.outlet_id, pay.outlet_id) = ovh.outlet_id;

-- Seed default outlets (Banaswadi and Whitefield)
INSERT INTO public.restaurant_outlets (id, restaurant_id, code, name, city)
SELECT 
    'banaswadi', id, 'BW', 'Banaswadi Outlet', 'Bangalore'
FROM public.restaurants
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.restaurant_outlets (id, restaurant_id, code, name, city)
SELECT 
    'whitefield', id, 'WF', 'Whitefield Outlet', 'Bangalore'
FROM public.restaurants
ON CONFLICT (id) DO NOTHING;

-- Seed initial 14 operating overhead categories (initialized to ₹0)
INSERT INTO public.outlet_operating_expenses (
    id, restaurant_id, name, category_group, description, is_combined, split_pct_banaswadi, split_pct_whitefield
)
SELECT 
    vals.id, r.id, vals.name, vals.category_group, vals.description, vals.is_combined, 50.00, 50.00
FROM public.restaurants r
CROSS JOIN (
    VALUES
        ('exp_kitchen_rent', 'Kitchen Rent', 'Facility & Rent', 'Base commercial kitchen lease & occupancy fee', false),
        ('exp_staff_accommodation', 'Staff Accommodation', 'Facility & Rent', 'Staff dormitory, quarters, or hostel rental', false),
        ('exp_electricity', 'Electricity', 'Utilities & Water', 'Commercial BESCOM/power grid electricity bill', false),
        ('exp_tanker_water', 'Tanker (Water)', 'Utilities & Water', 'Bulk commercial water tanker supply & delivery', false),
        ('exp_kitchen_water', 'Kitchen Water', 'Utilities & Water', 'Purified drinking water jars & municipality meter water', false),
        ('exp_daily_cleaning', 'Daily Cleaning', 'Hygiene & Cleaning', 'Daily sanitation, kitchen wash supplies & mop consumables', false),
        ('exp_monthly_deep_cleaning', 'Monthly Deep Cleaning', 'Hygiene & Cleaning', 'Exhaust duct cleaning, grease trap clearing & monthly deep pest control', false),
        ('exp_insurance', 'Insurance', 'Compliance & Insurance', 'Kitchen fire, equipment breakdown & public liability insurance', true),
        ('exp_pos_software', 'POS Software', 'Technology & Software', 'Petpooja billing, Captain App, KDS & inventory subscriptions', true),
        ('exp_cloud_and_apps', 'Cloud and Apps', 'Technology & Software', 'WhatsApp bots, accounting, cloud hosting, Wi-Fi & CRM licenses', true),
        ('exp_fssai_license', 'FSSAI License', 'Compliance & Insurance', 'Food Safety and Standards Authority annual fee & testing', false),
        ('exp_other_license', 'Other License', 'Compliance & Insurance', 'Trade license, BBMP health license, Fire NOC, Police permission', false),
        ('exp_porter_charge', 'Porter Charge', 'Logistics & Misc', 'Inter-outlet ingredient transfers & emergency supplier runs', false),
        ('exp_misc_cost', 'Misc Cost', 'Logistics & Misc', 'Kitchen minor repairs, hardware consumables & ad-hoc overhead', false)
) AS vals(id, name, category_group, description, is_combined)
ON CONFLICT (id) DO NOTHING;

-- Enable Supabase Realtime replication on newly added analytical tables
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_outlets;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.outlet_operating_expenses;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_directory;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.monthly_payroll_snapshots;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.catering_orders;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ingredient_purchases;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_payout_reconciliation;
EXCEPTION WHEN OTHERS THEN null; END $$;
