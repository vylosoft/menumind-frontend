/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OutletId } from './finance';

export type StandardPurchaseCategory =
  | 'Hyperpure'
  | 'Local Vegetables'
  | 'Chicken'
  | 'Mutton'
  | 'Fish'
  | 'Porter'
  | 'Miscellaneous';

export type CostClassification =
  | 'food_ingredient'        // Food ingredient purchase (counts towards ingredient COGS)
  | 'ingredient_freight'      // Ingredient freight / landed cost (adds to landed ingredient COGS)
  | 'packaging'               // Takeaway / delivery packaging materials (packaging COGS)
  | 'kitchen_consumable'      // Cleaning chemicals, grease paper, foil rolls (operating expense)
  | 'operating_expense'       // General kitchen operational overhead
  | 'asset_purchase'          // Kitchen appliances, utensils, balance sheet asset (non-COGS)
  | 'other_review';           // Requires classification review

export type PaymentMethod =
  | 'cash'
  | 'upi'
  | 'bank_transfer'
  | 'card'
  | 'supplier_credit'
  | 'platform_deduction';

export type PaymentStatus =
  | 'paid'
  | 'partially_paid'
  | 'pending'
  | 'supplier_credit';

export type DocumentationStatus =
  | 'tax_invoice'            // Official GST Tax Invoice
  | 'cash_memo'              // Cash receipt / delivery challan
  | 'kacha_bill'             // Vendor estimate / kacha parcha
  | 'no_bill';               // Self-voucher / undocumented

export type PorterClassification =
  | 'ingredient_freight'      // Directly attributable to purchased ingredients
  | 'operational_transport'   // General operational transport (gas cylinders, repairs)
  | 'catering_delivery'       // Delivery for bulk catering event
  | 'other_transport';        // Miscellaneous conveyance

export type PorterAllocationMethod =
  | 'purchase_reference'      // Linked to specific purchase record
  | 'value_ratio'             // Allocated proportionally by invoice value
  | 'weight_ratio'            // Allocated proportionally by kilogram weight
  | 'manual';                 // Explicit manual rupee allocation

export type PurchaseApprovalStatus =
  | 'Draft'
  | 'Under Review'
  | 'Approved'
  | 'Locked';

export type FoodCostingBasis =
  | 'recipe_based'           // Primary: Recipe Bill of Materials × Sales volumes
  | 'purchase_based'         // Alternative: Actual landed ingredient purchases
  | 'inventory_based';       // Stock-Audited: Opening + Net Purchases - Closing

export interface PurchaseAuditEntry {
  id: string;
  timestamp: string;
  purchaseId?: string;
  user: string;
  fieldChanged: string;
  oldValue: any;
  newValue: any;
  reason: string;
}

export interface PurchaseRecord {
  id: string;
  purchaseDate: string;           // YYYY-MM-DD
  month: string;                  // YYYY-MM e.g. "2026-10"
  outletId: 'banaswadi' | 'whitefield';
  category: string;               // Predefined or custom category
  isCustomCategory?: boolean;
  classification: CostClassification;
  supplierName: string;
  itemDescription: string;
  quantity?: number;
  unitOfMeasure?: string;         // 'kg', 'gm', 'ltr', 'units', 'crates', 'bunches', 'boxes'
  unitPrice?: number;
  totalAmount: number;            // Total invoice amount
  gstAmount: number;              // Total GST included or charged
  recoverableTax: number;         // ITC eligible amount to deduct from cost
  netAmount: number;              // totalAmount - recoverableTax
  transportationExpense: number;  // Porter freight attributable directly to this purchase
  landedCost: number;             // netAmount + transportationExpense
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  balancePayable: number;
  paymentDate?: string;
  invoiceNumber?: string;
  supportingDocumentRef?: string;
  documentationStatus: DocumentationStatus;
  notes?: string;
  isHyperpureImported?: boolean;
  isMonthlySummaryEntry?: boolean;// True if entered as a lump-sum monthly category total
  approvalStatus: PurchaseApprovalStatus;
  createdDate: string;
  lastModifiedDate?: string;
  revisionHistory?: PurchaseAuditEntry[];
}

export interface PorterAllocation {
  id: string;
  porterPurchaseId: string;
  targetPurchaseId: string;
  targetItemDescription: string;
  allocatedFreightAmount: number;
  method: PorterAllocationMethod;
  notes?: string;
}

export interface InventorySnapshot {
  outletId: 'banaswadi' | 'whitefield';
  month: string;                  // YYYY-MM
  openingInventoryValue: number;
  closingInventoryValue: number;
  purchaseReturns: number;
  spoilageOrWastageAllowance?: number;
  isVerified: boolean;
  lastStockAuditDate?: string;
  auditedBy?: string;
  notes?: string;
}

export interface CategoryBudget {
  outletId: 'banaswadi' | 'whitefield';
  month: string;
  category: string;
  budgetedAmount: number;
}

export interface MonthlyPurchaseSummaryMetrics {
  outletId: OutletId;
  month: string;
  hyperpurePurchases: number;
  localVegetablePurchases: number;
  chickenPurchases: number;
  muttonPurchases: number;
  fishPurchases: number;
  miscFoodPurchases: number;
  ingredientFreight: number;
  packagingPurchases: number;
  otherNonFoodPurchases: number;
  totalIngredientPurchases: number;
  totalLandedIngredientPurchases: number;
  totalPaymentsMade: number;
  outstandingSupplierPayables: number;
  // Comparative views
  recipeBasedCOGS: number;
  purchaseBasedCOGSProxy: number;
  inventoryBasedCOGS?: number;
  hasInventoryData: boolean;
  cogsVarianceRecipeVsPurchases: number; // Purchases - Recipe COGS
  foodCostRatioToRevenue: number;        // Landed Purchases / Net Revenue %
  approvalStatus: PurchaseApprovalStatus;
  lineItemsCount: number;
}
