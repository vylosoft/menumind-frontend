// Supabase PostgreSQL DDL SQL script for MenuMind AI
export const SUPABASE_SCHEMA_SQL = `-- ==============================================================================
-- MENUMIND AI — RESTAURANT DEMAND & PROFIT INTELLIGENCE
-- COMPLETE SUPABASE / POSTGRESQL PRODUCTION RELATIONAL DATABASE DDL
-- ==============================================================================
-- Target Engine: PostgreSQL 14+ / Supabase
-- Features: Multi-Tenant RLS, Foreign Key Cascades, Compound Indexes, 
--           Automated Timestamp Triggers, Audit Trail, Analytical Views.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- For gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- For case-insensitive dish/variant matching

-- ==============================================================================
-- 2. CUSTOM TYPES & DOMAIN ENUMS
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM (
        'OWNER', 
        'GENERAL_MANAGER', 
        'HEAD_CHEF', 
        'FINANCIAL_ANALYST', 
        'VIEWER'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE menu_classification_enum AS ENUM (
        'DEMAND_LEADER',
        'REVENUE_CHAMPION',
        'RISING_STAR',
        'HIDDEN_GEM',
        'DECLINING',
        'EXIT_CANDIDATE',
        'STABLE'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE action_recommendation_enum AS ENUM (
        'DOUBLE_DOWN',
        'PROMOTE',
        'OPTIMIZE',
        'MONITOR',
        'CONSIDER_REMOVING'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE matrix_quadrant_enum AS ENUM (
        'STAR',
        'PLOWHORSE',
        'PUZZLE',
        'DOG'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE profit_opportunity_enum AS ENUM (
        'DOUBLE_DOWN',
        'HIGH_DEMAND_LOW_MARGIN',
        'HIGH_MARGIN_LOW_DEMAND',
        'LOW_DEMAND_LOW_MARGIN',
        'NEGATIVE_CONTRIBUTION'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sales_channel_enum AS ENUM (
        'DINE_IN',
        'TAKEAWAY',
        'DIRECT_DELIVERY',
        'SWIGGY',
        'ZOMATO',
        'MAGICPIN',
        'OTHER'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE measurement_unit_enum AS ENUM (
        'g',
        'kg',
        'ml',
        'l',
        'litre',
        'piece',
        'pc',
        'tbsp',
        'tsp',
        'portion'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ingredient_category_enum AS ENUM (
        'Meat & Poultry',
        'Seafood',
        'Dairy',
        'Grains & Flour',
        'Oils & Ghee',
        'Vegetables',
        'Spices & Condiments',
        'Packaging',
        'Beverages',
        'Other'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE rule_match_type_enum AS ENUM (
        'EXACT',
        'REGEX',
        'CONTAINS',
        'FUZZY'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ==============================================================================
-- 3. CORE MULTI-TENANT ENTITIES
-- ==============================================================================

-- Restaurants / Outlets Master Table
CREATE TABLE IF NOT EXISTS public.restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    brand_name TEXT,
    gstin VARCHAR(15),
    fssai_license VARCHAR(20),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    city TEXT,
    state TEXT,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    pos_type VARCHAR(50) NOT NULL DEFAULT 'PETPOOJA',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Organization / Restaurant Membership linked to Supabase Auth (auth.users)
CREATE TABLE IF NOT EXISTS public.restaurant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role_enum NOT NULL DEFAULT 'OWNER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, user_id)
);

-- ==============================================================================
-- 4. POS INGESTION & AUDIT TRAIL
-- ==============================================================================

-- POS Upload Batches (Tracking Petpooja/POS file ingestion and validation)
CREATE TABLE IF NOT EXISTS public.pos_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type VARCHAR(20) NOT NULL, -- 'XLSX', 'XLS', 'CSV'
    file_size_bytes BIGINT,
    raw_rows_count INTEGER NOT NULL DEFAULT 0,
    valid_rows_count INTEGER NOT NULL DEFAULT 0,
    discarded_rows_count INTEGER NOT NULL DEFAULT 0,
    duplicate_rows_count INTEGER NOT NULL DEFAULT 0,
    date_start DATE,
    date_end DATE,
    total_reported_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_overlapping_warning BOOLEAN NOT NULL DEFAULT false,
    column_mapping_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    layout_config_json JSONB NOT NULL DEFAULT '{"headerRow": 6, "dataStartRow": 11}'::jsonb,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Raw Sales Records (Original line items exported from Petpooja)
CREATE TABLE IF NOT EXISTS public.raw_pos_sales_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.pos_import_batches(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    source_row_index INTEGER NOT NULL,
    invoice_id VARCHAR(100),
    sale_date DATE,
    raw_item_name CITEXT NOT NULL,
    raw_variant_name CITEXT,
    quantity NUMERIC(10, 3) NOT NULL DEFAULT 1.000,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gross_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_return_or_cancelled BOOLEAN NOT NULL DEFAULT false,
    raw_category VARCHAR(100),
    order_type VARCHAR(50), -- 'Dine In', 'Take Away', 'Delivery'
    sales_channel VARCHAR(50), -- 'Zomato', 'Swiggy', 'Petpooja POS Direct'
    outlet_name VARCHAR(100),
    raw_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 5. CANONICAL DISH TAXONOMY & NORMALIZATION
-- ==============================================================================

-- Normalized Parent Dishes (Master canonical dish list)
CREATE TABLE IF NOT EXISTS public.parent_dishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name CITEXT NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Main Course',
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    cultural_importance BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, name)
);

-- Dish Variants (e.g. Standard, Light, Small, Large, Half, Full)
CREATE TABLE IF NOT EXISTS public.dish_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    parent_dish_id UUID NOT NULL REFERENCES public.parent_dishes(id) ON DELETE CASCADE,
    variant_name CITEXT NOT NULL DEFAULT 'Standard',
    portion_size_grams NUMERIC(8, 2),
    default_price NUMERIC(10, 2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (parent_dish_id, variant_name)
);

-- Intelligent Grouping & Normalization Rules (Taxonomy mapping dictionary)
CREATE TABLE IF NOT EXISTS public.dish_grouping_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    raw_pattern TEXT NOT NULL,
    match_type rule_match_type_enum NOT NULL DEFAULT 'EXACT',
    parent_dish_id UUID NOT NULL REFERENCES public.parent_dishes(id) ON DELETE CASCADE,
    target_variant_name TEXT NOT NULL DEFAULT 'Standard',
    confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    is_approved BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, raw_pattern)
);

-- Pre-Computed Monthly Sales Aggregates (For high-speed dashboard analytics)
CREATE TABLE IF NOT EXISTS public.monthly_dish_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    parent_dish_id UUID NOT NULL REFERENCES public.parent_dishes(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL, -- Format: 'YYYY-MM'
    total_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
    total_net_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    average_realized_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    mom_qty_growth_pct NUMERIC(8, 2),
    mom_rev_growth_pct NUMERIC(8, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (parent_dish_id, month_year)
);

-- ==============================================================================
-- 6. RECIPE COSTING, BILL OF MATERIALS (BOM) & COMMODITIES
-- ==============================================================================

-- Raw Material Ingredients & Packaging Catalog
CREATE TABLE IF NOT EXISTS public.ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name CITEXT NOT NULL,
    category ingredient_category_enum NOT NULL DEFAULT 'Other',
    purchase_pack_size NUMERIC(10, 3) NOT NULL DEFAULT 1.000,
    purchase_pack_unit measurement_unit_enum NOT NULL DEFAULT 'kg',
    default_purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Price in INR
    current_market_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,   -- Monitored price
    edible_yield_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.00 CHECK (edible_yield_pct > 0 AND edible_yield_pct <= 100.00),
    prep_loss_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (prep_loss_pct >= 0 AND prep_loss_pct < 100.00),
    standard_base_unit measurement_unit_enum NOT NULL DEFAULT 'g',
    supplier_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, name)
);

-- Recipe Headers (Bill of Materials linked to parent dishes & variants)
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    parent_dish_id UUID NOT NULL REFERENCES public.parent_dishes(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.dish_variants(id) ON DELETE SET NULL,
    recipe_name TEXT NOT NULL,
    batch_yield_servings NUMERIC(8, 2) NOT NULL DEFAULT 1.00 CHECK (batch_yield_servings > 0),
    packaging_cost_per_portion NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cooking_fuel_cost_per_portion NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    direct_labor_cost_per_portion NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    other_variable_cost_per_portion NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, parent_dish_id, recipe_name)
);

-- Recipe Ingredients (Join table for Recipe BOM lines)
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
    quantity_per_batch NUMERIC(10, 3) NOT NULL CHECK (quantity_per_batch > 0),
    unit measurement_unit_enum NOT NULL DEFAULT 'g',
    calculated_portion_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 7. CHANNEL PRICING PROFILES & PRICING SIMULATION
-- ==============================================================================

-- Sales Channel Fee Profiles (Dine-In, Takeaway, Aggregators)
CREATE TABLE IF NOT EXISTS public.channel_pricing_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    channel_name VARCHAR(50) NOT NULL,
    platform_commission_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    commission_gst_pct NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
    restaurant_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    packaging_charge_customer NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    packaging_cost_actual NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    customer_gst_pct NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    payment_gateway_fee_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, channel_name)
);

-- Smart Pricing Recommendations & Simulated Scenarios
CREATE TABLE IF NOT EXISTS public.dish_pricing_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    parent_dish_id UUID NOT NULL REFERENCES public.parent_dishes(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.dish_variants(id) ON DELETE SET NULL,
    channel_profile_id UUID REFERENCES public.channel_pricing_profiles(id) ON DELETE SET NULL,
    current_listed_price NUMERIC(10, 2) NOT NULL,
    current_realized_price NUMERIC(10, 2) NOT NULL,
    total_variable_cost NUMERIC(10, 2) NOT NULL,
    current_contribution_margin_pct NUMERIC(6, 2) NOT NULL,
    target_contribution_margin_pct NUMERIC(6, 2) NOT NULL DEFAULT 40.00,
    minimum_break_even_price NUMERIC(10, 2) NOT NULL,
    recommended_listed_price NUMERIC(10, 2) NOT NULL,
    suggested_price_delta NUMERIC(10, 2) NOT NULL,
    estimated_margin_gain_monthly NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 8. FIXED OVERHEAD, BREAK-EVEN & COMMODITY WATCH
-- ==============================================================================

-- Monthly Fixed Operating Costs
CREATE TABLE IF NOT EXISTS public.fixed_operating_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    effective_month VARCHAR(7) NOT NULL, -- 'YYYY-MM'
    monthly_rent NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    fixed_salaries NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    fixed_utilities NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    software_subscriptions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    other_fixed_expenses NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_monthly_fixed_costs NUMERIC(12, 2) GENERATED ALWAYS AS (
        monthly_rent + fixed_salaries + fixed_utilities + software_subscriptions + other_fixed_expenses
    ) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, effective_month)
);

-- Commodity Price Watch & Inflation Shock Triggers
CREATE TABLE IF NOT EXISTS public.commodity_price_watch (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
    baseline_price NUMERIC(12, 2) NOT NULL,
    current_market_price NUMERIC(12, 2) NOT NULL,
    price_delta_pct NUMERIC(6, 2) GENERATED ALWAYS AS (
        CASE WHEN baseline_price > 0 
             THEN ROUND(((current_market_price - baseline_price) / baseline_price) * 100.0, 2)
             ELSE 0.00 END
    ) STORED,
    alert_threshold_pct NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
    status VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (status IN ('NORMAL', 'WATCH', 'ALERT', 'CRITICAL')),
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (restaurant_id, ingredient_id)
);

-- Demand Forecast Projections
CREATE TABLE IF NOT EXISTS public.demand_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    parent_dish_id UUID NOT NULL REFERENCES public.parent_dishes(id) ON DELETE CASCADE,
    forecast_horizon_days INTEGER NOT NULL DEFAULT 14,
    base_projected_qty NUMERIC(10, 2) NOT NULL,
    conservative_qty NUMERIC(10, 2) NOT NULL,
    optimistic_qty NUMERIC(10, 2) NOT NULL,
    confidence_score_pct NUMERIC(5, 2) NOT NULL DEFAULT 85.00,
    forecast_method VARCHAR(50) NOT NULL DEFAULT 'WEIGHTED_RECENCY_TREND',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 9. PERFORMANCE COMPOUND & FOREIGN KEY INDEXES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_raw_sales_restaurant_date 
    ON public.raw_pos_sales_records (restaurant_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_raw_sales_item_name 
    ON public.raw_pos_sales_records (restaurant_id, raw_item_name);

CREATE INDEX IF NOT EXISTS idx_raw_sales_batch 
    ON public.raw_pos_sales_records (batch_id);

CREATE INDEX IF NOT EXISTS idx_parent_dishes_rest_cat 
    ON public.parent_dishes (restaurant_id, category);

CREATE INDEX IF NOT EXISTS idx_dish_variants_parent 
    ON public.dish_variants (parent_dish_id);

CREATE INDEX IF NOT EXISTS idx_grouping_rules_rest_pattern 
    ON public.dish_grouping_rules (restaurant_id, raw_pattern);

CREATE INDEX IF NOT EXISTS idx_monthly_aggregates_rest_dish_month 
    ON public.monthly_dish_aggregates (restaurant_id, parent_dish_id, month_year);

CREATE INDEX IF NOT EXISTS idx_ingredients_rest_category 
    ON public.ingredients (restaurant_id, category);

CREATE INDEX IF NOT EXISTS idx_recipes_dish_variant 
    ON public.recipes (parent_dish_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe 
    ON public.recipe_ingredients (recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient 
    ON public.recipe_ingredients (ingredient_id);

CREATE INDEX IF NOT EXISTS idx_pricing_rec_dish_channel 
    ON public.dish_pricing_recommendations (parent_dish_id, channel_profile_id);

CREATE INDEX IF NOT EXISTS idx_demand_forecast_rest_dish 
    ON public.demand_forecasts (restaurant_id, parent_dish_id);

-- ==============================================================================
-- 10. AUTOMATED TIMESTAMP UPDATER TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_restaurants_updated_at
    BEFORE UPDATE ON public.restaurants
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_parent_dishes_updated_at
    BEFORE UPDATE ON public.parent_dishes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_dish_variants_updated_at
    BEFORE UPDATE ON public.dish_variants
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_ingredients_updated_at
    BEFORE UPDATE ON public.ingredients
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_recipes_updated_at
    BEFORE UPDATE ON public.recipes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_channel_profiles_updated_at
    BEFORE UPDATE ON public.channel_pricing_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_fixed_costs_updated_at
    BEFORE UPDATE ON public.fixed_operating_costs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 11. SUPABASE ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_pos_sales_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_grouping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_dish_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_pricing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_pricing_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_operating_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commodity_price_watch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_forecasts ENABLE ROW LEVEL SECURITY;

-- Helper security function: Returns list of restaurant IDs the current authenticated user belongs to
CREATE OR REPLACE FUNCTION public.get_auth_user_restaurant_ids()
RETURNS TABLE (restaurant_id UUID) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT ru.restaurant_id
    FROM public.restaurant_users ru
    WHERE ru.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql;

-- RLS: Restaurants table
CREATE POLICY "Users can view and manage their affiliated restaurants"
    ON public.restaurants
    FOR ALL
    USING (id IN (SELECT get_auth_user_restaurant_ids()));

-- RLS: Restaurant Users table
CREATE POLICY "Users can view members of their restaurant"
    ON public.restaurant_users
    FOR SELECT
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Owners can manage restaurant user memberships"
    ON public.restaurant_users
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.restaurant_users ru
            WHERE ru.restaurant_id = public.restaurant_users.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.role = 'OWNER'
        )
    );

-- Tenant access policies on all data tables
CREATE POLICY "Tenant access on pos_import_batches"
    ON public.pos_import_batches FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on raw_pos_sales_records"
    ON public.raw_pos_sales_records FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on parent_dishes"
    ON public.parent_dishes FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on dish_variants"
    ON public.dish_variants FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on dish_grouping_rules"
    ON public.dish_grouping_rules FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on monthly_dish_aggregates"
    ON public.monthly_dish_aggregates FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on ingredients"
    ON public.ingredients FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on recipes"
    ON public.recipes FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on recipe_ingredients"
    ON public.recipe_ingredients FOR ALL
    USING (
        recipe_id IN (
            SELECT r.id FROM public.recipes r
            WHERE r.restaurant_id IN (SELECT get_auth_user_restaurant_ids())
        )
    );

CREATE POLICY "Tenant access on channel_pricing_profiles"
    ON public.channel_pricing_profiles FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on dish_pricing_recommendations"
    ON public.dish_pricing_recommendations FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on fixed_operating_costs"
    ON public.fixed_operating_costs FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on commodity_price_watch"
    ON public.commodity_price_watch FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

CREATE POLICY "Tenant access on demand_forecasts"
    ON public.demand_forecasts FOR ALL
    USING (restaurant_id IN (SELECT get_auth_user_restaurant_ids()));

-- ==============================================================================
-- 12. ANALYTICAL VIEWS FOR REPORTING & REAL-TIME DASHBOARDS
-- ==============================================================================

-- View: Calculated Recipe Unit Economics & Contribution Margins
CREATE OR REPLACE VIEW public.v_dish_contribution_margin AS
WITH recipe_totals AS (
    SELECT 
        r.id AS recipe_id,
        r.restaurant_id,
        r.parent_dish_id,
        r.variant_id,
        r.recipe_name,
        r.batch_yield_servings,
        COALESCE(SUM(ri.calculated_portion_cost), 0.00) AS ingredient_cost_per_portion,
        r.packaging_cost_per_portion,
        r.cooking_fuel_cost_per_portion,
        r.direct_labor_cost_per_portion,
        r.other_variable_cost_per_portion,
        (
            COALESCE(SUM(ri.calculated_portion_cost), 0.00) +
            r.packaging_cost_per_portion +
            r.cooking_fuel_cost_per_portion +
            r.direct_labor_cost_per_portion +
            r.other_variable_cost_per_portion
        ) AS total_variable_cost_per_portion
    FROM public.recipes r
    LEFT JOIN public.recipe_ingredients ri ON r.id = ri.recipe_id
    GROUP BY r.id
),
sales_metrics AS (
    SELECT 
        mda.parent_dish_id,
        SUM(mda.total_quantity) AS lifetime_quantity,
        SUM(mda.total_net_revenue) AS lifetime_net_revenue,
        CASE WHEN SUM(mda.total_quantity) > 0 
             THEN ROUND(SUM(mda.total_net_revenue) / SUM(mda.total_quantity), 2)
             ELSE 0.00 END AS average_realized_price
    FROM public.monthly_dish_aggregates mda
    GROUP BY mda.parent_dish_id
)
SELECT 
    pd.id AS parent_dish_id,
    pd.restaurant_id,
    pd.name AS parent_dish_name,
    pd.category,
    COALESCE(dv.variant_name, 'Standard') AS variant_name,
    rt.recipe_name,
    rt.ingredient_cost_per_portion,
    rt.packaging_cost_per_portion,
    rt.total_variable_cost_per_portion,
    COALESCE(sm.average_realized_price, dv.default_price, 0.00) AS realized_price,
    (COALESCE(sm.average_realized_price, dv.default_price, 0.00) - COALESCE(rt.total_variable_cost_per_portion, 0.00)) AS unit_contribution_margin,
    CASE 
        WHEN COALESCE(sm.average_realized_price, dv.default_price, 0.00) > 0 
        THEN ROUND(
            ((COALESCE(sm.average_realized_price, dv.default_price, 0.00) - COALESCE(rt.total_variable_cost_per_portion, 0.00)) / 
             COALESCE(sm.average_realized_price, dv.default_price, 0.00)) * 100.0, 
            2
        )
        ELSE 0.00 
    END AS contribution_margin_pct,
    COALESCE(sm.lifetime_quantity, 0) AS total_portions_sold,
    ROUND(
        COALESCE(sm.lifetime_quantity, 0) * 
        (COALESCE(sm.average_realized_price, dv.default_price, 0.00) - COALESCE(rt.total_variable_cost_per_portion, 0.00)), 
        2
    ) AS total_contribution_inr
FROM public.parent_dishes pd
LEFT JOIN public.dish_variants dv ON pd.id = dv.parent_dish_id
LEFT JOIN recipe_totals rt ON pd.id = rt.parent_dish_id AND (rt.variant_id = dv.id OR rt.variant_id IS NULL)
LEFT JOIN sales_metrics sm ON pd.id = sm.parent_dish_id;

-- View: High-level Restaurant Monthly Sales Rollup
CREATE OR REPLACE VIEW public.v_monthly_sales_summary AS
SELECT 
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    mda.month_year,
    COUNT(DISTINCT mda.parent_dish_id) AS active_dishes_count,
    SUM(mda.total_quantity) AS total_portions_sold,
    SUM(mda.total_net_revenue) AS total_net_revenue,
    CASE WHEN SUM(mda.total_quantity) > 0 
         THEN ROUND(SUM(mda.total_net_revenue) / SUM(mda.total_quantity), 2)
         ELSE 0.00 END AS average_order_value
FROM public.restaurants r
JOIN public.monthly_dish_aggregates mda ON r.id = mda.restaurant_id
GROUP BY r.id, r.name, mda.month_year
ORDER BY mda.month_year DESC;
`;
