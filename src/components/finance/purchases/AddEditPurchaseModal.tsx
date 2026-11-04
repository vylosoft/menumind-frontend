/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  PurchaseRecord,
  CostClassification,
  PaymentMethod,
  PaymentStatus,
  DocumentationStatus,
  PurchaseApprovalStatus,
} from '../../../types/purchases';
import { PREDEFINED_PURCHASE_CATEGORIES } from '../../../data/demoPurchasesDataset';
import { checkDuplicateCategorySummary } from '../../../utils/purchaseCalculations';
import { formatINR } from '../../../utils/financeCalculations';
import {
  X,
  Plus,
  AlertTriangle,
  Receipt,
  Truck,
  CheckCircle2,
  Calendar,
  Building2,
  DollarSign,
  Tag,
  ShieldCheck,
  FileText,
} from 'lucide-react';

interface AddEditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePurchase: (purchase: PurchaseRecord, isEditing: boolean) => void;
  existingPurchase?: PurchaseRecord | null;
  existingPurchases: PurchaseRecord[];
  currentOutlet: 'banaswadi' | 'whitefield';
  selectedMonth: string;
  customCategories: string[];
  onAddCustomCategory: (cat: string) => void;
}

export const AddEditPurchaseModal: React.FC<AddEditPurchaseModalProps> = ({
  isOpen,
  onClose,
  onSavePurchase,
  existingPurchase,
  existingPurchases,
  currentOutlet,
  selectedMonth,
  customCategories,
  onAddCustomCategory,
}) => {
  const isEditing = !!existingPurchase;

  // Form states
  const [purchaseDate, setPurchaseDate] = useState(
    existingPurchase?.purchaseDate || `${selectedMonth}-15`
  );
  const [month, setMonth] = useState(existingPurchase?.month || selectedMonth);
  const [outletId, setOutletId] = useState<'banaswadi' | 'whitefield'>(
    existingPurchase?.outletId || currentOutlet
  );
  const [category, setCategory] = useState<string>(
    existingPurchase?.category || 'Local Vegetables'
  );
  const [newCatInput, setNewCatInput] = useState('');
  const [showNewCatInput, setShowNewCatInput] = useState(false);

  const [classification, setClassification] = useState<CostClassification>(
    existingPurchase?.classification || 'food_ingredient'
  );
  const [supplierName, setSupplierName] = useState(
    existingPurchase?.supplierName || ''
  );
  const [itemDescription, setItemDescription] = useState(
    existingPurchase?.itemDescription || ''
  );
  const [quantity, setQuantity] = useState<number | ''>(
    existingPurchase?.quantity ?? ''
  );
  const [unitOfMeasure, setUnitOfMeasure] = useState(
    existingPurchase?.unitOfMeasure || 'kg'
  );
  const [unitPrice, setUnitPrice] = useState<number | ''>(
    existingPurchase?.unitPrice ?? ''
  );
  const [totalAmount, setTotalAmount] = useState<number>(
    existingPurchase?.totalAmount || 0
  );
  const [gstAmount, setGstAmount] = useState<number>(
    existingPurchase?.gstAmount || 0
  );
  const [recoverableTax, setRecoverableTax] = useState<number>(
    existingPurchase?.recoverableTax || 0
  );
  const [transportationExpense, setTransportationExpense] = useState<number>(
    existingPurchase?.transportationExpense || 0
  );

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    existingPurchase?.paymentMethod || 'upi'
  );
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    existingPurchase?.paymentStatus || 'paid'
  );
  const [paidAmount, setPaidAmount] = useState<number>(
    existingPurchase?.paidAmount || 0
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    existingPurchase?.invoiceNumber || ''
  );
  const [supportingDocumentRef, setSupportingDocumentRef] = useState(
    existingPurchase?.supportingDocumentRef || ''
  );
  const [documentationStatus, setDocumentationStatus] =
    useState<DocumentationStatus>(
      existingPurchase?.documentationStatus || 'cash_memo'
    );
  const [isMonthlySummaryEntry, setIsMonthlySummaryEntry] = useState(
    existingPurchase?.isMonthlySummaryEntry || false
  );
  const [approvalStatus, setApprovalStatus] = useState<PurchaseApprovalStatus>(
    existingPurchase?.approvalStatus || 'Approved'
  );
  const [notes, setNotes] = useState(existingPurchase?.notes || '');

  // Reset or fill when opened
  useEffect(() => {
    if (existingPurchase) {
      setPurchaseDate(existingPurchase.purchaseDate);
      setMonth(existingPurchase.month);
      setOutletId(existingPurchase.outletId);
      setCategory(existingPurchase.category);
      setClassification(existingPurchase.classification);
      setSupplierName(existingPurchase.supplierName);
      setItemDescription(existingPurchase.itemDescription);
      setQuantity(existingPurchase.quantity ?? '');
      setUnitOfMeasure(existingPurchase.unitOfMeasure || 'kg');
      setUnitPrice(existingPurchase.unitPrice ?? '');
      setTotalAmount(existingPurchase.totalAmount);
      setGstAmount(existingPurchase.gstAmount);
      setRecoverableTax(existingPurchase.recoverableTax);
      setTransportationExpense(existingPurchase.transportationExpense);
      setPaymentMethod(existingPurchase.paymentMethod);
      setPaymentStatus(existingPurchase.paymentStatus);
      setPaidAmount(existingPurchase.paidAmount);
      setInvoiceNumber(existingPurchase.invoiceNumber || '');
      setSupportingDocumentRef(existingPurchase.supportingDocumentRef || '');
      setDocumentationStatus(existingPurchase.documentationStatus);
      setIsMonthlySummaryEntry(existingPurchase.isMonthlySummaryEntry || false);
      setApprovalStatus(existingPurchase.approvalStatus);
      setNotes(existingPurchase.notes || '');
    } else {
      setPurchaseDate(`${selectedMonth}-15`);
      setMonth(selectedMonth);
      setOutletId(currentOutlet);
      setCategory('Local Vegetables');
      setClassification('food_ingredient');
      setSupplierName('');
      setItemDescription('');
      setQuantity('');
      setUnitOfMeasure('kg');
      setUnitPrice('');
      setTotalAmount(0);
      setGstAmount(0);
      setRecoverableTax(0);
      setTransportationExpense(0);
      setPaymentMethod('upi');
      setPaymentStatus('paid');
      setPaidAmount(0);
      setInvoiceNumber('');
      setSupportingDocumentRef('');
      setDocumentationStatus('cash_memo');
      setIsMonthlySummaryEntry(false);
      setApprovalStatus('Approved');
      setNotes('');
    }
  }, [existingPurchase, isOpen, currentOutlet, selectedMonth]);

  // Auto-sync paid amount if payment status is 'paid'
  useEffect(() => {
    if (paymentStatus === 'paid') {
      setPaidAmount(totalAmount);
    } else if (paymentStatus === 'pending') {
      setPaidAmount(0);
    }
  }, [paymentStatus, totalAmount]);

  // Auto-classify when category changes
  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    if (cat === 'Porter') {
      setClassification('ingredient_freight');
    } else if (cat.toLowerCase().includes('packaging')) {
      setClassification('packaging');
    } else if (
      cat === 'Hyperpure' ||
      cat === 'Local Vegetables' ||
      cat === 'Chicken' ||
      cat === 'Mutton' ||
      cat === 'Fish' ||
      cat === 'Rice' ||
      cat === 'Oil and Ghee' ||
      cat === 'Spices' ||
      cat === 'Eggs' ||
      cat === 'Dairy' ||
      cat === 'Seafood' ||
      cat === 'Fruits' ||
      cat === 'Dry Groceries'
    ) {
      setClassification('food_ingredient');
    }
  };

  // Duplicate Check for Monthly Category Summary
  const duplicateWarning = useMemo(() => {
    if (!isMonthlySummaryEntry) return null;
    const check = checkDuplicateCategorySummary(
      existingPurchases,
      outletId,
      month,
      category
    );
    if (check.hasRisk) {
      return `Warning: ${check.lineCount} individual line items (totaling ${formatINR(
        check.currentTotal
      )}) already exist in "${category}" for ${month}. Entering a monthly category lump-sum may cause double-counting!`;
    }
    return null;
  }, [isMonthlySummaryEntry, existingPurchases, outletId, month, category]);

  // Derived financials
  const netAmount = Math.max(0, totalAmount - recoverableTax);
  const landedCost = netAmount + transportationExpense;
  const balancePayable = Math.max(0, totalAmount - paidAmount);

  const allAvailableCategories = useMemo(() => {
    const set = new Set([...PREDEFINED_PURCHASE_CATEGORIES, ...customCategories]);
    return Array.from(set);
  }, [customCategories]);

  const handleCreateCategory = () => {
    if (!newCatInput.trim()) return;
    const trimmed = newCatInput.trim();
    onAddCustomCategory(trimmed);
    setCategory(trimmed);
    setNewCatInput('');
    setShowNewCatInput(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!supplierName.trim()) {
      alert('Please provide a supplier or merchant name.');
      return;
    }
    if (!itemDescription.trim()) {
      alert('Please describe the purchased item or ingredients.');
      return;
    }
    if (totalAmount <= 0) {
      alert('Total amount must be greater than zero.');
      return;
    }

    const newRecord: PurchaseRecord = {
      id: existingPurchase?.id || `pur-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      purchaseDate,
      month,
      outletId,
      category,
      isCustomCategory: !PREDEFINED_PURCHASE_CATEGORIES.includes(category as any),
      classification,
      supplierName: supplierName.trim(),
      itemDescription: itemDescription.trim(),
      quantity: quantity !== '' ? Number(quantity) : undefined,
      unitOfMeasure,
      unitPrice: unitPrice !== '' ? Number(unitPrice) : undefined,
      totalAmount,
      gstAmount,
      recoverableTax,
      netAmount,
      transportationExpense,
      landedCost,
      paymentMethod,
      paymentStatus,
      paidAmount,
      balancePayable,
      paymentDate: paymentStatus === 'paid' ? purchaseDate : undefined,
      invoiceNumber: invoiceNumber.trim() || undefined,
      supportingDocumentRef: supportingDocumentRef.trim() || undefined,
      documentationStatus,
      notes: notes.trim() || undefined,
      isHyperpureImported: category === 'Hyperpure',
      isMonthlySummaryEntry,
      approvalStatus,
      createdDate: existingPurchase?.createdDate || new Date().toISOString(),
      lastModifiedDate: new Date().toISOString(),
    };

    onSavePurchase(newRecord, isEditing);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 font-bold">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                {isEditing ? 'Edit Purchase Transaction' : 'Record New Purchase Line-Item'}
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-teal-400/20 text-teal-300 border border-teal-400/30">
                  {outletId === 'whitefield' ? 'Whitefield' : 'Banaswadi'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Landed ingredient costs, supplier payables, and anti-double-counting classification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Section 1: Accounting & Outlet Routing */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200/80">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Target Kitchen Outlet
              </label>
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              >
                <option value="whitefield">Whitefield Kitchen</option>
                <option value="banaswadi">Banaswadi Kitchen</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Purchase Date
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => {
                  setPurchaseDate(e.target.value);
                  if (e.target.value.length >= 7) {
                    setMonth(e.target.value.substring(0, 7));
                  }
                }}
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Accounting Period
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Section 2: Category & COGS Classification */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Purchase Category
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewCatInput(!showNewCatInput)}
                  className="text-[11px] text-teal-600 font-bold hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Custom Category
                </button>
              </div>

              {showNewCatInput ? (
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="e.g. Spices, Dairy, Oil"
                    value={newCatInput}
                    onChange={(e) => setNewCatInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-white border border-teal-400 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-bold"
                  >
                    Add
                  </button>
                </div>
              ) : null}

              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              >
                <optgroup label="Core Predefined Categories">
                  {PREDEFINED_PURCHASE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Custom / Specialized Categories">
                  {customCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Cost Classification (Anti-Inflation)</span>
                <span className="text-[10px] text-indigo-600 font-semibold lowercase">
                  Prevents non-food COGS inflation
                </span>
              </label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value as CostClassification)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-indigo-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="food_ingredient">Food ingredient purchase (Included in Food COGS)</option>
                <option value="ingredient_freight">Ingredient freight / landed cost (Landed COGS)</option>
                <option value="packaging">Packaging purchase (Delivery Packaging COGS)</option>
                <option value="kitchen_consumable">Kitchen consumable (Operating Expense - Not Food)</option>
                <option value="operating_expense">Operating expense (Fixed Kitchen Overhead)</option>
                <option value="asset_purchase">Asset purchase (Balance Sheet CapEx - Non-P&L)</option>
                <option value="other_review">Other / Requires Classification Review</option>
              </select>
            </div>
          </div>

          {/* Duplicate Category Summary Warning */}
          {duplicateWarning && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{duplicateWarning}</span>
            </div>
          )}

          {/* Section 3: Supplier & Item Particulars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Supplier / Merchant Name
              </label>
              <input
                type="text"
                placeholder="e.g. Shivaji Nagar Fish Merchant / Suguna Broilers"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Ingredient / Item Description
              </label>
              <input
                type="text"
                placeholder="e.g. Fresh Broiler Curry Cut (80kg @ ₹190/kg)"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Section 4: Quantities, Pricing & Landed Cost Breakdown */}
          <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Quantity (Optional)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 50"
                  value={quantity}
                  onChange={(e) => {
                    const q = e.target.value !== '' ? Number(e.target.value) : '';
                    setQuantity(q);
                    if (q !== '' && unitPrice !== '') {
                      setTotalAmount(Math.round(Number(q) * Number(unitPrice)));
                    }
                  }}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Unit of Measure
                </label>
                <select
                  value={unitOfMeasure}
                  onChange={(e) => setUnitOfMeasure(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
                >
                  <option value="kg">Kilograms (kg)</option>
                  <option value="gm">Grams (gm)</option>
                  <option value="ltr">Liters (ltr)</option>
                  <option value="pcs">Pieces (pcs)</option>
                  <option value="crates">Crates</option>
                  <option value="boxes">Boxes</option>
                  <option value="bunches">Bunches</option>
                  <option value="units">Units</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Unit Price (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="₹/unit"
                  value={unitPrice}
                  onChange={(e) => {
                    const p = e.target.value !== '' ? Number(e.target.value) : '';
                    setUnitPrice(p);
                    if (quantity !== '' && p !== '') {
                      setTotalAmount(Math.round(Number(quantity) * Number(p)));
                    }
                  }}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Total Bill Amount (₹)*
                </label>
                <input
                  type="number"
                  required
                  value={totalAmount || ''}
                  onChange={(e) => setTotalAmount(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-white border border-teal-500 rounded-lg text-xs font-bold text-teal-950 focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  GST Amount (₹)
                </label>
                <input
                  type="number"
                  value={gstAmount || ''}
                  onChange={(e) => setGstAmount(Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Recoverable Tax (ITC)
                </label>
                <input
                  type="number"
                  value={recoverableTax || ''}
                  onChange={(e) => setRecoverableTax(Number(e.target.value))}
                  placeholder="₹0 if restaurant"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Porter Freight Attributed (₹)
                </label>
                <input
                  type="number"
                  value={transportationExpense || ''}
                  onChange={(e) => setTransportationExpense(Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>
            </div>

            {/* Live Landed Cost Indicator */}
            <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl flex items-center justify-between text-xs">
              <span className="font-semibold text-teal-950">
                Landed Ingredient Cost recognized in COGS:
              </span>
              <span className="text-sm font-black text-teal-900">
                {formatINR(landedCost)}
                <span className="text-[10px] font-normal text-slate-500 ml-1.5">
                  (Bill {formatINR(totalAmount)} − ITC {formatINR(recoverableTax)} + Freight {formatINR(transportationExpense)})
                </span>
              </span>
            </div>
          </div>

          {/* Section 5: Payment & Settlement */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
              >
                <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                <option value="cash">Cash on Delivery / Mandi Cash</option>
                <option value="bank_transfer">Bank Transfer (NEFT / IMPS)</option>
                <option value="card">Company Debit / Credit Card</option>
                <option value="supplier_credit">Supplier Credit Ledger</option>
                <option value="platform_deduction">Platform Payout Offset (Hyperpure)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Payment Status
              </label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
              >
                <option value="paid">Paid in Full</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="pending">Payment Pending</option>
                <option value="supplier_credit">On Supplier Credit</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Paid Rupee Amount (₹)
              </label>
              <input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
              />
              {balancePayable > 0 && (
                <div className="text-[10px] text-rose-600 font-bold mt-1">
                  Outstanding Payable: {formatINR(balancePayable)}
                </div>
              )}
            </div>
          </div>

          {/* Section 6: Tax Invoice & Documentation Compliance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Invoice / Bill Number
              </label>
              <input
                type="text"
                placeholder="e.g. HP-BLR-0982 / Cash Memo #12"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Documentation Status
              </label>
              <select
                value={documentationStatus}
                onChange={(e) => setDocumentationStatus(e.target.value as DocumentationStatus)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
              >
                <option value="tax_invoice">GST Tax Invoice Attached</option>
                <option value="cash_memo">Cash Memo / Delivery Challan</option>
                <option value="kacha_bill">Kacha Bill / Estimate Slip</option>
                <option value="no_bill">No Bill / Self-Voucher</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Approval Workflow Status
              </label>
              <select
                value={approvalStatus}
                onChange={(e) => setApprovalStatus(e.target.value as PurchaseApprovalStatus)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
              >
                <option value="Approved">Approved (Audit Passed)</option>
                <option value="Under Review">Under Review</option>
                <option value="Draft">Draft Entry</option>
                <option value="Locked">Locked (Certified Period)</option>
              </select>
            </div>
          </div>

          {/* Checkbox for Monthly Summary Lump Sum */}
          <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <input
              type="checkbox"
              id="isMonthlySummaryEntry"
              checked={isMonthlySummaryEntry}
              onChange={(e) => setIsMonthlySummaryEntry(e.target.checked)}
              className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500 cursor-pointer"
            />
            <label htmlFor="isMonthlySummaryEntry" className="text-xs text-slate-700 font-medium cursor-pointer">
              Mark as a <strong>Monthly Category Lump-Sum Summary</strong> (e.g. entering the total month's poultry bill rather than individual receipts).
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Internal Kitchen / Audit Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Wholesale rate negotiated with Babu Bhai; transported in morning ice crates."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-teal-600/20 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isEditing ? 'Save Changes' : 'Record Purchase'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
