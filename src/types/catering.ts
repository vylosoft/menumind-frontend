/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CateringOrderStatus =
  | 'enquiry'
  | 'quotation'
  | 'confirmed'
  | 'advance_received'
  | 'preparing'
  | 'completed'
  | 'partially_paid'
  | 'fully_paid'
  | 'cancelled';

export type CateringPaymentStatus =
  | 'unpaid'
  | 'advance_only'
  | 'partially_paid'
  | 'fully_paid'
  | 'refunded';

export type PaymentMethod =
  | 'Cash'
  | 'UPI'
  | 'Bank Transfer'
  | 'Card'
  | 'Payment Gateway'
  | 'Multiple / Split';

export type PosInvoiceStatus =
  | 'not_generated'
  | 'generated_in_petpooja'
  | 'external_invoice_issued'
  | 'pending_review';

export type GstClassification =
  | '5% Restaurant (No ITC)'
  | '18% Outdoor Catering (With ITC)'
  | 'Exempt / Special'
  | 'Tax Review Pending';

export interface CateringPaymentRecord {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  referenceNo?: string;
  type: 'advance' | 'milestone' | 'final' | 'refund';
  notes?: string;
}

export interface CateringDishItem {
  id: string;
  parentDishId?: string;
  parentDishName: string;
  variantName: string;
  quantity: number; // e.g. 150 portions, 20 kg
  servingUnit: string; // 'portions', 'kg', 'platters', 'litres', 'pieces'
  agreedSellingRate: number; // rate per unit
  totalSellingAmount: number; // quantity * rate
  recipeCostPerUnit: number;
  totalRecipeCost: number;
  packagingCostPerUnit: number;
  totalPackagingCost: number;
  specialInstructions?: string;
}

export interface CateringDirectExpenses {
  ingredientCost: number;
  packagingCost: number;
  transportationDeliveryExpense: number;
  temporaryStaffExpense: number;
  venueEquipmentExpense: number;
  otherDirectExpenses: number;
  totalDirectVariableCost: number;
}

export interface CateringOrder {
  id: string; // e.g. CAT-2026-10-001
  eventName: string; // e.g. "Durga Puja Feast 2026"
  eventCategory: string; // e.g. "Durga Puja", "Kali Puja", "Griha Pravesh", etc.
  customerName?: string;
  customerContact?: string;
  eventDate: string; // YYYY-MM-DD
  orderConfirmationDate: string; // YYYY-MM-DD
  outletId: 'banaswadi' | 'whitefield';
  responsibleBrand?: string;
  deliveryLocation?: string;
  guestCount: number;
  status: CateringOrderStatus;
  paymentStatus: CateringPaymentStatus;

  // Financial figures
  agreedOrderValue: number;
  customerDiscount: number;
  additionalDeliveryCharges: number;
  otherAgreedCharges: number;
  taxInclusive: boolean;
  taxRatePct: number; // e.g. 5, 18, 0
  taxAmount: number;
  netRecognizedValue: number; // Net revenue when event is completed
  advanceAmountCollected: number;
  remainingAmountDue: number;
  totalAmountCollected: number;
  refunds: number;
  adjustments: number;
  payments: CateringPaymentRecord[];

  // Tax and POS invoice status
  posInvoiceStatus: PosInvoiceStatus;
  petpoojaInvoiceNo?: string;
  externalInvoiceNo?: string;
  gstClassification: GstClassification;
  isTaxable: boolean;
  taxReviewStatus: 'Reviewed & Confirmed' | 'Tax Review Pending';

  // Menu items and economics
  menuItems: CateringDishItem[];
  expenses: CateringDirectExpenses;
  isDirectCostProvisional: boolean;
  cateringContribution: number;
  cateringContributionPct: number;

  // Accounting and recognition controls
  isRevenueRecognized: boolean; // True ONLY if status === 'completed' or 'fully_paid' post-event
  revenueRecognitionMonth: string; // YYYY-MM

  // Duplicate prevention check
  isPotentialDuplicate: boolean;
  duplicateSuspectedSource?: string; // 'Petpooja Order #9142', 'Ownly #OW-882'
  duplicateConfirmed: boolean; // if true, exclude from non-Petpooja catering addition
  duplicateNotes?: string;

  auditNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CateringSummaryMetrics {
  totalBookings: number;
  completedOrders: number;
  totalRecognizedRevenue: number;
  totalAdvanceLiabilities: number; // Advances held for unfulfilled events
  totalOutstandingReceivables: number;
  totalDirectExpenses: number;
  totalCateringContribution: number;
  cateringContributionPct: number;
  banaswadiRevenue: number;
  whitefieldRevenue: number;
}
