import pg from 'pg';
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

    // 5. Batch sync Grouping Rules
    let rulesCount = 0;
    if (payload.groupingRules && payload.groupingRules.length > 0) {
      const ruleValues: string[] = [];
      const ruleParams: any[] = [restaurantId];
      let rIdx = 2;

      for (const r of payload.groupingRules) {
        const pId = dishNameToId.get(r.parentDishName.toLowerCase());
        if (pId) {
          ruleValues.push(`($1, $${rIdx}, 'EXACT', $${rIdx + 1}, $${rIdx + 2}, $${rIdx + 3}, true)`);
          ruleParams.push(r.rawPattern, pId, r.targetVariantName || 'Standard', r.confidence || 100);
          rIdx += 4;
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
             confidence_score = EXCLUDED.confidence_score;`,
          ruleParams
        );
      }
    }

    // 6. Batch sync Ingredients & Recipes
    let recipesCount = 0;
    let ingredientsCount = 0;
    if (payload.recipes && payload.recipes.length > 0) {
      // Collect unique ingredients
      const ingMap = new Map<string, { unit: string; price: number; packSize: number }>();
      payload.recipes.forEach((rec) => {
        if (Array.isArray(rec.ingredients)) {
          rec.ingredients.forEach((ing: any) => {
            if (ing.name && !ingMap.has(ing.name.toLowerCase())) {
              ingMap.set(ing.name.toLowerCase(), {
                unit: ing.unit || 'g',
                price: ing.purchasePrice || 0,
                packSize: ing.purchasePackSize || 1,
              });
            }
          });
        }
      });

      if (ingMap.size > 0) {
        const ingValues: string[] = [];
        const ingParams: any[] = [restaurantId];
        let iIdx = 2;

        for (const [name, data] of ingMap.entries()) {
          ingValues.push(`($1, $${iIdx}, $${iIdx + 1}, $${iIdx + 2})`);
          ingParams.push(name, data.price, data.packSize);
          iIdx += 3;
          ingredientsCount++;
        }

        await client.query(
          `INSERT INTO public.ingredients (restaurant_id, name, default_purchase_price, purchase_pack_size)
           VALUES ${ingValues.join(', ')}
           ON CONFLICT (restaurant_id, name)
           DO UPDATE SET 
             default_purchase_price = EXCLUDED.default_purchase_price,
             purchase_pack_size = EXCLUDED.purchase_pack_size,
             updated_at = now();`,
          ingParams
        );
      }

      // Map ingredient names to IDs
      const ingDbRes = await client.query(
        'SELECT id, name FROM public.ingredients WHERE restaurant_id = $1;',
        [restaurantId]
      );
      const ingNameToId = new Map<string, string>();
      ingDbRes.rows.forEach((r) => ingNameToId.set(r.name.toLowerCase(), r.id));

      // Sync Recipes
      for (const rec of payload.recipes) {
        const pId = dishNameToId.get((rec.parentDishName || '').toLowerCase());
        if (!pId) continue;

        const recipeRes = await client.query(
          `INSERT INTO public.recipes 
           (restaurant_id, parent_dish_id, recipe_name, batch_yield_servings, packaging_cost_per_portion, cooking_fuel_cost_per_portion, direct_labor_cost_per_portion, other_variable_cost_per_portion)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (restaurant_id, parent_dish_id, recipe_name)
           DO UPDATE SET 
             batch_yield_servings = EXCLUDED.batch_yield_servings,
             packaging_cost_per_portion = EXCLUDED.packaging_cost_per_portion,
             cooking_fuel_cost_per_portion = EXCLUDED.cooking_fuel_cost_per_portion,
             direct_labor_cost_per_portion = EXCLUDED.direct_labor_cost_per_portion,
             other_variable_cost_per_portion = EXCLUDED.other_variable_cost_per_portion,
             updated_at = now()
           RETURNING id;`,
          [
            restaurantId,
            pId,
            rec.recipeName || `${rec.parentDishName} Recipe`,
            rec.batchYieldServings || 1,
            rec.packagingCost || 0,
            rec.cookingFuelCost || 0,
            rec.directLaborCost || 0,
            rec.otherVariableCost || 0,
          ]
        );

        const recipeId = recipeRes.rows[0].id;
        recipesCount++;

        // Clear existing BOM lines for this recipe
        await client.query('DELETE FROM public.recipe_ingredients WHERE recipe_id = $1;', [recipeId]);

        if (Array.isArray(rec.ingredients) && rec.ingredients.length > 0) {
          const bomValues: string[] = [];
          const bomParams: any[] = [recipeId];
          let bIdx = 2;

          for (const ing of rec.ingredients) {
            const ingId = ingNameToId.get((ing.name || '').toLowerCase());
            if (ingId) {
              bomValues.push(`($1, $${bIdx}, $${bIdx + 1}, $${bIdx + 2}, $${bIdx + 3})`);
              bomParams.push(ingId, ing.quantity || 1, ing.unit || 'g', ing.calculatedCostPerPortion || 0);
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
        const netVal = Number(order.netOrderValue ?? order.netRecognizedValue ?? (grossVal - discountVal + (Number(order.additionalDeliveryCharges) || 0))) || 0;
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
            order.notes || null,
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
            pur.accountingMonth || '2026-10',
            pur.purchaseDate || new Date().toISOString().slice(0, 10),
            pur.supplierName || 'Hyperpure',
            pur.category || 'Hyperpure',
            pur.invoiceNumber || null,
            pur.itemDescription || null,
            Number(pur.quantity) || 1,
            pur.unit || 'kg',
            Number(pur.ratePerUnit) || 0,
            Number(pur.grossAmount) || 0,
            Number(pur.gstAmount) || 0,
            Number(pur.deliveryOrPorterCharge) || 0,
            Number(pur.totalAmountINR) || 0,
            pur.paymentStatus || 'Paid',
            pur.paymentMode || 'Bank Transfer',
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
    // 14. NEW: Sync Aggregator Platform Payouts (Swiggy, Zomato, Ownly)
    // ==============================================================================
    let payoutsCount = 0;
    if (Array.isArray(payload.payouts) && payload.payouts.length > 0) {
      for (const p of payload.payouts) {
        const outletIdVal = (p.outletId || 'whitefield').toLowerCase().trim() === 'banaswadi' ? 'banaswadi' : 'whitefield';
        const platformVal = (p.platform || 'ZOMATO').toUpperCase().trim();
        const monthVal = p.month || '2026-10';
        const grossVal = Number(p.grossSales) || 0;
        const discVal = Number(p.customerDiscounts) || 0;
        const netVal = Number(p.netSales) || Math.max(0, grossVal - discVal);
        const commVal = Number(p.commissionAmount) || 0;
        const gstVal = Number(p.gstOnCommission) || Math.round(commVal * 0.18);
        const tcsVal = Number(p.tcsDeduction || (netVal * 0.01)) || 0;
        const cancelVal = Number(p.cancellationCharges) || 0;
        const mktVal = Number(p.advertisingSpend) || 0;
        const otherVal = Number(p.otherPlatformFees || p.paymentGatewayFee) || 0;
        const hyperVal = Number(p.hyperpureRecovery) || 0;
        const calcNet = Number(p.calculatedNetPayout) || Math.max(0, netVal - commVal - gstVal - tcsVal - hyperVal);
        const actualCredit = Number(p.actualBankSettlement) || calcNet;
        const diff = Number(p.settlementDifference) || (calcNet - actualCredit);
        const statusVal = p.status === 'reconciled' ? 'Reconciled' : p.status === 'discrepancy' ? 'Disputed' : 'Pending Bank Credit';
        const periodTypeVal = p.periodType || 'monthly';
        const weekVal = p.weekLabel || null;
        const ordersVal = Number(p.orderCount) || 0;

        await client.query(
          `INSERT INTO public.platform_payout_reconciliation
           (id, restaurant_id, outlet_id, month_year, platform, gross_sales_reported, customer_discounts_borne, net_platform_sales, commission_deducted, gst_on_commission, tcs_tds_deducted, cancellation_charges, marketing_ad_deductions, other_deductions, hyperpure_recovery, net_bank_settlement, actual_bank_credit_received, settlement_variance, settlement_status, payout_reference_id, period_type, week_label, order_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
           ON CONFLICT (restaurant_id, outlet_id, month_year, platform) DO UPDATE SET
             gross_sales_reported = EXCLUDED.gross_sales_reported,
             customer_discounts_borne = EXCLUDED.customer_discounts_borne,
             net_platform_sales = EXCLUDED.net_platform_sales,
             commission_deducted = EXCLUDED.commission_deducted,
             gst_on_commission = EXCLUDED.gst_on_commission,
             tcs_tds_deducted = EXCLUDED.tcs_tds_deducted,
             cancellation_charges = EXCLUDED.cancellation_charges,
             marketing_ad_deductions = EXCLUDED.marketing_ad_deductions,
             other_deductions = EXCLUDED.other_deductions,
             hyperpure_recovery = EXCLUDED.hyperpure_recovery,
             net_bank_settlement = EXCLUDED.net_bank_settlement,
             actual_bank_credit_received = EXCLUDED.actual_bank_credit_received,
             settlement_variance = EXCLUDED.settlement_variance,
             settlement_status = EXCLUDED.settlement_status,
             period_type = EXCLUDED.period_type,
             week_label = EXCLUDED.week_label,
             order_count = EXCLUDED.order_count,
             updated_at = now();`,
          [
            p.id || `PAYOUT-${platformVal}-${outletIdVal}-${monthVal}`,
            restaurantId,
            outletIdVal,
            monthVal,
            platformVal,
            grossVal,
            discVal,
            netVal,
            commVal,
            gstVal,
            tcsVal,
            cancelVal,
            mktVal,
            otherVal,
            hyperVal,
            calcNet,
            actualCredit,
            diff,
            statusVal,
            p.sourceFileName || null,
            periodTypeVal,
            weekVal,
            ordersVal,
          ]
        );
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
      const advAmt = Number(r.advance_payment_amount) || 0;
      const balAmt = Number(r.balance_amount) || Math.max(0, netVal - advAmt);
      const fulfills = r.fulfillment_status || 'Confirmed';
      const isCompleted = fulfills === 'Completed' || fulfills === 'Delivered';

      return {
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
        paymentStatus: r.payment_status || 'Partially Paid',
        fulfillmentStatus: fulfills,

        // Frontend CateringOrder model properties
        agreedOrderValue: grossVal,
        customerDiscount: discount,
        additionalDeliveryCharges: 0,
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
        status: isCompleted ? 'completed' : 'confirmed',
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
        notes: r.notes || '',
        createdAt: r.created_at ? r.created_at.toISOString() : new Date().toISOString(),
        updatedAt: r.updated_at ? r.updated_at.toISOString() : new Date().toISOString(),
      };
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
      rawPattern: r.raw_pattern,
      parentDishName: r.parent_dish_name,
      targetVariantName: r.target_variant_name,
      confidence: Number(r.confidence_score) || 100,
      isApproved: r.is_approved,
    }));

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

    // 11. Load Platform Payout Reconciliation Records (Swiggy, Zomato, Ownly)
    let payouts: any[] = [];
    try {
      const payoutRes = await client.query(
        `SELECT * FROM public.platform_payout_reconciliation WHERE restaurant_id = $1 ORDER BY month_year DESC, platform ASC;`,
        [restId]
      );
      payouts = payoutRes.rows.map((r) => ({
        id: r.id,
        outletId: r.outlet_id === 'banaswadi' ? 'banaswadi' : 'whitefield',
        platform: r.platform,
        month: r.month_year,
        grossSales: Number(r.gross_sales_reported) || 0,
        customerDiscounts: Number(r.customer_discounts_borne) || 0,
        netSales: Number(r.net_platform_sales) || 0,
        commissionAmount: Number(r.commission_deducted) || 0,
        gstOnCommission: Number(r.gst_on_commission) || 0,
        paymentGatewayFee: 0,
        deliveryFees: 0,
        cancellationCharges: Number(r.cancellation_charges) || 0,
        advertisingSpend: Number(r.marketing_ad_deductions) || 0,
        tcsDeduction: Number(r.tcs_tds_deducted) || 0,
        otherPlatformFees: Number(r.other_deductions) || 0,
        hyperpureRecovery: Number(r.hyperpure_recovery) || 0,
        calculatedNetPayout: Number(r.net_bank_settlement) || 0,
        actualBankSettlement: Number(r.actual_bank_credit_received) || 0,
        settlementDifference: Number(r.settlement_variance) || 0,
        status: (r.settlement_status === 'Reconciled' ? 'reconciled' : r.settlement_status === 'Disputed' ? 'discrepancy' : 'pending') as any,
        periodType: r.period_type || 'monthly',
        weekLabel: r.week_label || undefined,
        orderCount: Number(r.order_count) || 0,
        directSalesCashUpi: Number(r.direct_sales_cash_upi) || 0,
        sourceFileName: r.payout_reference_id || undefined,
        payoutDate: r.updated_at ? r.updated_at.toISOString().slice(0, 10) : undefined,
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
        recipes: [],
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
      },
    };
  } catch (err: any) {
    client.release();
    console.error('Error loading data from Supabase:', err);
    throw err;
  }
}
