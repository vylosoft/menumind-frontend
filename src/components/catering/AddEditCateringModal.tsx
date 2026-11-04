/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  CateringOrder,
  CateringOrderStatus,
  CateringPaymentStatus,
  PaymentMethod,
  PosInvoiceStatus,
  GstClassification,
  CateringDishItem,
} from '../../types/catering';
import { ParentDish } from '../../types/restaurant';
import { DishRecipe } from '../../types/recipe';
import { formatINR } from '../../utils/financeCalculations';
import { computeCateringEconomics, checkCateringDuplicate } from '../../utils/cateringCalculations';
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  DollarSign,
  Utensils,
  Truck,
  ShieldCheck,
  Building2,
  Users,
} from 'lucide-react';

interface AddEditCateringModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderToEdit?: CateringOrder | null;
  parentDishes: ParentDish[];
  recipes: DishRecipe[];
  onSave: (order: CateringOrder) => void;
}

const EVENT_CATEGORIES = [
  'Durga Puja',
  'Kali Puja',
  'Saraswati Puja',
  'Griha Pravesh',
  'Anniversary',
  'Birthday',
  'Wedding',
  'Corporate Events',
  'Community Gatherings',
  'Residential Society',
  'Private Family',
  'Other Custom Event',
];

export const AddEditCateringModal: React.FC<AddEditCateringModalProps> = ({
  isOpen,
  onClose,
  orderToEdit,
  parentDishes,
  recipes,
  onSave,
}) => {
  if (!isOpen) return null;

  const isEditing = !!orderToEdit;

  // Form State
  const [id] = useState(orderToEdit?.id || `CAT-2026-10-${String(Math.floor(Math.random() * 900) + 100)}`);
  const [eventName, setEventName] = useState(orderToEdit?.eventName || '');
  const [eventCategory, setEventCategory] = useState(orderToEdit?.eventCategory || 'Durga Puja');
  const [customCategory, setCustomCategory] = useState('');
  const [customerName, setCustomerName] = useState(orderToEdit?.customerName || '');
  const [customerContact, setCustomerContact] = useState(orderToEdit?.customerContact || '');
  const [eventDate, setEventDate] = useState(orderToEdit?.eventDate || '2026-10-24');
  const [orderConfirmationDate, setOrderConfirmationDate] = useState(
    orderToEdit?.orderConfirmationDate || '2026-10-10'
  );
  const [outletId, setOutletId] = useState<'banaswadi' | 'whitefield'>(
    orderToEdit?.outletId || 'banaswadi'
  );
  const [responsibleBrand, setResponsibleBrand] = useState(
    orderToEdit?.responsibleBrand || (outletId === 'whitefield' ? 'Banglar Jhale Jhole-w' : 'Banglar Jhale Jhole')
  );
  const [deliveryLocation, setDeliveryLocation] = useState(orderToEdit?.deliveryLocation || '');
  const [guestCount, setGuestCount] = useState<number>(orderToEdit?.guestCount || 100);
  const [status, setStatus] = useState<CateringOrderStatus>(orderToEdit?.status || 'confirmed');
  const [paymentStatus, setPaymentStatus] = useState<CateringPaymentStatus>(
    orderToEdit?.paymentStatus || 'advance_only'
  );

  // Financials
  const [agreedOrderValue, setAgreedOrderValue] = useState<number>(orderToEdit?.agreedOrderValue || 50000);
  const [customerDiscount, setCustomerDiscount] = useState<number>(orderToEdit?.customerDiscount || 0);
  const [additionalDeliveryCharges, setAdditionalDeliveryCharges] = useState<number>(
    orderToEdit?.additionalDeliveryCharges || 1500
  );
  const [otherAgreedCharges, setOtherAgreedCharges] = useState<number>(orderToEdit?.otherAgreedCharges || 0);
  const [taxInclusive, setTaxInclusive] = useState<boolean>(orderToEdit?.taxInclusive ?? true);
  const [taxRatePct, setTaxRatePct] = useState<number>(orderToEdit?.taxRatePct || 5);
  const [advanceAmountCollected, setAdvanceAmountCollected] = useState<number>(
    orderToEdit?.advanceAmountCollected || 20000
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank Transfer');
  const [paymentRef, setPaymentRef] = useState<string>('');

  // Tax & POS Status
  const [posInvoiceStatus, setPosInvoiceStatus] = useState<PosInvoiceStatus>(
    orderToEdit?.posInvoiceStatus || 'not_generated'
  );
  const [petpoojaInvoiceNo, setPetpoojaInvoiceNo] = useState<string>(
    orderToEdit?.petpoojaInvoiceNo || ''
  );
  const [externalInvoiceNo, setExternalInvoiceNo] = useState<string>(
    orderToEdit?.externalInvoiceNo || ''
  );
  const [gstClassification, setGstClassification] = useState<GstClassification>(
    orderToEdit?.gstClassification || '5% Restaurant (No ITC)'
  );
  const [taxReviewStatus, setTaxReviewStatus] = useState<'Reviewed & Confirmed' | 'Tax Review Pending'>(
    orderToEdit?.taxReviewStatus || 'Tax Review Pending'
  );

  // Menu items
  const [menuItems, setMenuItems] = useState<CateringDishItem[]>(
    orderToEdit?.menuItems || [
      {
        id: 'item-1',
        parentDishName: 'Basanti Pulao',
        variantName: 'Bulk Platter',
        quantity: 100,
        servingUnit: 'portions',
        agreedSellingRate: 150,
        totalSellingAmount: 15000,
        recipeCostPerUnit: 42,
        totalRecipeCost: 4200,
        packagingCostPerUnit: 5,
        totalPackagingCost: 500,
      },
      {
        id: 'item-2',
        parentDishName: 'Kosha Mangsho',
        variantName: 'Special Mutton',
        quantity: 100,
        servingUnit: 'portions',
        agreedSellingRate: 270,
        totalSellingAmount: 27000,
        recipeCostPerUnit: 98,
        totalRecipeCost: 9800,
        packagingCostPerUnit: 6,
        totalPackagingCost: 600,
      },
    ]
  );

  // Direct expenses
  const [ingredientCost, setIngredientCost] = useState<number>(
    orderToEdit?.expenses?.ingredientCost || 14000
  );
  const [packagingCost, setPackagingCost] = useState<number>(
    orderToEdit?.expenses?.packagingCost || 1100
  );
  const [transportationExpense, setTransportationExpense] = useState<number>(
    orderToEdit?.expenses?.transportationDeliveryExpense || 1200
  );
  const [tempStaffExpense, setTempStaffExpense] = useState<number>(
    orderToEdit?.expenses?.temporaryStaffExpense || 2000
  );
  const [venueEquipmentExpense, setVenueEquipmentExpense] = useState<number>(
    orderToEdit?.expenses?.venueEquipmentExpense || 1000
  );
  const [otherDirectExpenses, setOtherDirectExpenses] = useState<number>(
    orderToEdit?.expenses?.otherDirectExpenses || 300
  );

  const [selectedParentDish, setSelectedParentDish] = useState<string>(
    parentDishes[0]?.name || 'Basanti Pulao'
  );

  // Calculate live totals
  const totalDirectCosts =
    ingredientCost +
    packagingCost +
    transportationExpense +
    tempStaffExpense +
    venueEquipmentExpense +
    otherDirectExpenses;

  const totalNetOrderPrice = Math.max(
    0,
    agreedOrderValue - customerDiscount + additionalDeliveryCharges + otherAgreedCharges
  );
  const remainingDue = Math.max(0, totalNetOrderPrice - advanceAmountCollected);

  // Live duplicate check
  const duplicateCheck = checkCateringDuplicate({
    posInvoiceStatus,
    petpoojaInvoiceNo,
    eventDate,
    agreedOrderValue,
  });

  const handleAddDish = () => {
    const parent = parentDishes.find((p) => p.name === selectedParentDish);
    const matchedRecipe = recipes.find(
      (r) => r.parentDishName.toLowerCase() === selectedParentDish.toLowerCase()
    );
    const unitCost = matchedRecipe?.totalIngredientCost || parent?.unitCost || 45;
    const packCost = matchedRecipe?.packagingCost || parent?.packagingCost || 6;
    const rate = parent?.averageRealizedPrice || 160;

    const newItem: CateringDishItem = {
      id: `item-${Date.now()}`,
      parentDishName: selectedParentDish,
      variantName: 'Catering Batch',
      quantity: guestCount,
      servingUnit: 'portions',
      agreedSellingRate: rate,
      totalSellingAmount: rate * guestCount,
      recipeCostPerUnit: unitCost,
      totalRecipeCost: unitCost * guestCount,
      packagingCostPerUnit: packCost,
      totalPackagingCost: packCost * guestCount,
    };

    const updatedItems = [...menuItems, newItem];
    setMenuItems(updatedItems);

    // Auto-update ingredient cost sum
    const newIngrSum = updatedItems.reduce((sum, i) => sum + i.totalRecipeCost, 0);
    const newPackSum = updatedItems.reduce((sum, i) => sum + i.totalPackagingCost, 0);
    setIngredientCost(newIngrSum);
    setPackagingCost(newPackSum);
  };

  const handleRemoveDish = (dishId: string) => {
    const updated = menuItems.filter((i) => i.id !== dishId);
    setMenuItems(updated);
    const newIngrSum = updated.reduce((sum, i) => sum + i.totalRecipeCost, 0);
    const newPackSum = updated.reduce((sum, i) => sum + i.totalPackagingCost, 0);
    setIngredientCost(newIngrSum);
    setPackagingCost(newPackSum);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim()) {
      alert('Please provide an event name.');
      return;
    }

    const finalCategory =
      (eventCategory === 'Other Custom Event' || eventCategory === 'Other Custom Events') && customCategory.trim()
        ? customCategory.trim()
        : eventCategory;

    const isRevenueRecognized = (status === 'completed' || status === 'fully_paid') && !duplicateCheck.isDuplicate;

    const orderData: CateringOrder = {
      id,
      eventName: eventName.trim(),
      eventCategory: finalCategory,
      customerName: customerName.trim(),
      customerContact: customerContact.trim(),
      eventDate,
      orderConfirmationDate,
      outletId,
      responsibleBrand,
      deliveryLocation,
      guestCount: Number(guestCount) || 1,
      status,
      paymentStatus,
      agreedOrderValue: Number(agreedOrderValue) || 0,
      customerDiscount: Number(customerDiscount) || 0,
      additionalDeliveryCharges: Number(additionalDeliveryCharges) || 0,
      otherAgreedCharges: Number(otherAgreedCharges) || 0,
      taxInclusive,
      taxRatePct: Number(taxRatePct) || 5,
      taxAmount: Math.round((totalNetOrderPrice * (taxRatePct / (100 + taxRatePct)))),
      netRecognizedValue: isRevenueRecognized ? totalNetOrderPrice : 0,
      advanceAmountCollected: Number(advanceAmountCollected) || 0,
      remainingAmountDue: remainingDue,
      totalAmountCollected: Number(advanceAmountCollected) || 0,
      refunds: 0,
      adjustments: 0,
      payments: [
        {
          id: `PAY-${Date.now()}`,
          date: orderConfirmationDate,
          amount: Number(advanceAmountCollected) || 0,
          method: paymentMethod,
          referenceNo: paymentRef,
          type: advanceAmountCollected >= totalNetOrderPrice ? 'final' : 'advance',
        },
      ],
      posInvoiceStatus,
      petpoojaInvoiceNo: petpoojaInvoiceNo.trim(),
      externalInvoiceNo: externalInvoiceNo.trim(),
      gstClassification,
      isTaxable: gstClassification !== 'Exempt / Special',
      taxReviewStatus,
      menuItems,
      expenses: {
        ingredientCost,
        packagingCost,
        transportationDeliveryExpense: transportationExpense,
        temporaryStaffExpense: tempStaffExpense,
        venueEquipmentExpense,
        otherDirectExpenses,
        totalDirectVariableCost: totalDirectCosts,
      },
      isDirectCostProvisional: status !== 'completed',
      cateringContribution: isRevenueRecognized ? totalNetOrderPrice - totalDirectCosts : 0,
      cateringContributionPct:
        isRevenueRecognized && totalNetOrderPrice > 0
          ? ((totalNetOrderPrice - totalDirectCosts) / totalNetOrderPrice) * 100
          : 0,
      isRevenueRecognized,
      revenueRecognitionMonth: eventDate.substring(0, 7),
      isPotentialDuplicate: duplicateCheck.isDuplicate,
      duplicateSuspectedSource: duplicateCheck.suspectedSource,
      duplicateConfirmed: duplicateCheck.isDuplicate,
      duplicateNotes: duplicateCheck.reason,
      auditNotes: `Recorded on ${new Date().toLocaleDateString('en-IN')}.`,
      createdAt: orderToEdit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(orderData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/30">
                {id}
              </span>
              <span className="text-xs text-slate-400 capitalize">{outletId} Outlet</span>
            </div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {isEditing ? 'Edit Catering & Event Order' : 'Add New Bulk Catering / Event Order'}
            </h2>
          </div>

          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Duplicate Warning Alert if detected */}
          {duplicateCheck.isDuplicate && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Duplicate Prevention Alert:</strong>
                <span>{duplicateCheck.reason} ({duplicateCheck.suspectedSource}). This order will be recorded for catering records, but will NOT be added to outlet revenue twice.</span>
              </div>
            </div>
          )}

          {/* Section 1: Basic Event Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 pb-1 border-b border-slate-200 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" /> Event &amp; Booking Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-slate-700 font-semibold mb-1">Event Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Durga Puja 2026 Community Bhog"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Event Category</label>
                <select
                  value={eventCategory}
                  onChange={(e) => setEventCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                >
                  {EVENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {eventCategory === 'Other Custom Events' && (
                <div className="sm:col-span-3">
                  <label className="block text-slate-700 font-semibold mb-1">Custom Category Name</label>
                  <input
                    type="text"
                    placeholder="Enter custom occasion name"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Target Outlet *</label>
                <select
                  value={outletId}
                  onChange={(e) => {
                    const o = e.target.value as 'banaswadi' | 'whitefield';
                    setOutletId(o);
                    setResponsibleBrand(o === 'whitefield' ? 'Banglar Jhale Jhole-w' : 'Banglar Jhale Jhole');
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500 font-bold"
                >
                  <option value="banaswadi">Banaswadi Kitchen</option>
                  <option value="whitefield">Whitefield Kitchen (-w)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Number of Guests *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Operational Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CateringOrderStatus)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500 font-bold capitalize"
                >
                  <option value="enquiry">Enquiry</option>
                  <option value="quotation">Quotation Sent</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="advance_received">Advance Received</option>
                  <option value="preparing">In Kitchen Preparation</option>
                  <option value="completed">Completed &amp; Dispatched (Revenue Recognized)</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="fully_paid">Fully Paid &amp; Closed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Event Date *</label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Customer / Organization Name</label>
                <input
                  type="text"
                  placeholder="e.g. Kalyan Nagar Bengali Association"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Customer Phone / Contact</label>
                <input
                  type="text"
                  placeholder="+91 98450 XXXXX"
                  value={customerContact}
                  onChange={(e) => setCustomerContact(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-slate-700 font-semibold mb-1">Delivery / Venue Location</label>
                <input
                  type="text"
                  placeholder="e.g. OMBR Layout Community Hall or Customer Residence"
                  value={deliveryLocation}
                  onChange={(e) => setDeliveryLocation(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Financial Terms & Advance Accounting */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-slate-900 pb-1 border-b border-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" /> Commercial Terms &amp; Advance Accounting
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                Advances held as liabilities until event completion
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Agreed Order Value (₹) *</label>
                <input
                  type="number"
                  required
                  value={agreedOrderValue}
                  onChange={(e) => setAgreedOrderValue(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Customer Discount (₹)</label>
                <input
                  type="number"
                  value={customerDiscount}
                  onChange={(e) => setCustomerDiscount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Delivery Charges (₹)</label>
                <input
                  type="number"
                  value={additionalDeliveryCharges}
                  onChange={(e) => setAdditionalDeliveryCharges(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Other Agreed Charges (₹)</label>
                <input
                  type="number"
                  value={otherAgreedCharges}
                  onChange={(e) => setOtherAgreedCharges(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Advance Amount Collected (₹)</label>
                <input
                  type="number"
                  value={advanceAmountCollected}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setAdvanceAmountCollected(val);
                    if (val >= totalNetOrderPrice) setPaymentStatus('fully_paid');
                    else if (val > 0) setPaymentStatus('partially_paid');
                    else setPaymentStatus('unpaid');
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500 font-bold text-teal-700"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                >
                  <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                  <option value="UPI">UPI (GPay / PhonePe / QR)</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card Swipe</option>
                  <option value="Payment Gateway">Payment Gateway Link</option>
                  <option value="Multiple / Split">Multiple / Split Payments</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Payment Reference / UTR</label>
                <input
                  type="text"
                  placeholder="e.g. UTR / IMPS ref"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col justify-center">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Remaining Amount Due</span>
                <span className="text-base font-black text-rose-700">{formatINR(remainingDue)}</span>
              </div>
            </div>
          </div>

          {/* Section 3: Tax & POS Invoice Classification */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-slate-900 pb-1 border-b border-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" /> Tax &amp; POS Invoice Compliance
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">POS Invoice Status</label>
                <select
                  value={posInvoiceStatus}
                  onChange={(e) => setPosInvoiceStatus(e.target.value as PosInvoiceStatus)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                >
                  <option value="not_generated">Not Generated in POS (Manual Direct Order)</option>
                  <option value="generated_in_petpooja">Generated in Petpooja (Duplicate Check Flag)</option>
                  <option value="external_invoice_issued">External GST Invoice Issued</option>
                  <option value="pending_review">Pending Accountant Review</option>
                </select>
              </div>

              {posInvoiceStatus === 'generated_in_petpooja' && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Petpooja Bill / Invoice #</label>
                  <input
                    type="text"
                    placeholder="e.g. BILL-9142"
                    value={petpoojaInvoiceNo}
                    onChange={(e) => setPetpoojaInvoiceNo(e.target.value)}
                    className="w-full bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-amber-900 focus:outline-amber-500 font-mono"
                  />
                </div>
              )}

              {posInvoiceStatus === 'external_invoice_issued' && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">External Invoice #</label>
                  <input
                    type="text"
                    placeholder="e.g. INV/CAT/2026/04"
                    value={externalInvoiceNo}
                    onChange={(e) => setExternalInvoiceNo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">GST Classification</label>
                <select
                  value={gstClassification}
                  onChange={(e) => setGstClassification(e.target.value as GstClassification)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500"
                >
                  <option value="5% Restaurant (No ITC)">5% Restaurant Supply (No ITC)</option>
                  <option value="18% Outdoor Catering (With ITC)">18% Outdoor Catering (With ITC)</option>
                  <option value="Exempt / Special">Exempt / Special</option>
                  <option value="Tax Review Pending">Tax Review Pending</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tax Audit Status</label>
                <select
                  value={taxReviewStatus}
                  onChange={(e) => setTaxReviewStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-teal-500 font-semibold"
                >
                  <option value="Reviewed &amp; Confirmed">Reviewed &amp; Confirmed</option>
                  <option value="Tax Review Pending">Tax Review Pending</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Dishes & Menu Quantities */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Utensils className="w-4 h-4 text-purple-600" /> Menu Items &amp; Bulk Quantities ({menuItems.length} dishes)
              </h3>

              <div className="flex items-center gap-2">
                <select
                  value={selectedParentDish}
                  onChange={(e) => setSelectedParentDish(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-800 text-xs"
                >
                  {parentDishes.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleAddDish}
                  className="flex items-center gap-1 px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold text-xs cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Dish
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-semibold">
                    <th className="py-2.5 px-3">Dish &amp; Variant</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                    <th className="py-2.5 px-3 text-right">Unit Rate</th>
                    <th className="py-2.5 px-3 text-right">Total Selling</th>
                    <th className="py-2.5 px-3 text-right">Ingredient Cost</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {menuItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        {item.parentDishName}
                        <span className="text-[10px] text-slate-400 block font-normal">{item.variantName}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-medium">
                        {item.quantity} {item.servingUnit}
                      </td>
                      <td className="py-2 px-3 text-right">{formatINR(item.agreedSellingRate)}</td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        {formatINR(item.totalSellingAmount)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600">
                        {formatINR(item.totalRecipeCost)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveDish(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5: Direct Variable Expenses & Unit Economics */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-slate-900 pb-1 border-b border-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-600" /> Direct Variable Catering Expenses (No Overhead Duplication)
              </span>
              <span className="text-xs font-bold text-slate-700">
                Total Direct Cost: {formatINR(totalDirectCosts)}
              </span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Ingredient Cost (₹)</label>
                <input
                  type="number"
                  value={ingredientCost}
                  onChange={(e) => setIngredientCost(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-semibold"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Packaging (₹)</label>
                <input
                  type="number"
                  value={packagingCost}
                  onChange={(e) => setPackagingCost(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-semibold"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Delivery / Transport (₹)</label>
                <input
                  type="number"
                  value={transportationExpense}
                  onChange={(e) => setTransportationExpense(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-semibold"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Temp Event Staff (₹)</label>
                <input
                  type="number"
                  value={tempStaffExpense}
                  onChange={(e) => setTempStaffExpense(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-semibold"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Venue / Warmer Rent (₹)</label>
                <input
                  type="number"
                  value={venueEquipmentExpense}
                  onChange={(e) => setVenueEquipmentExpense(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-semibold"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Other Direct Costs (₹)</label>
                <input
                  type="number"
                  value={otherDirectExpenses}
                  onChange={(e) => setOtherDirectExpenses(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-semibold"
                />
              </div>
            </div>

            {/* Live Contribution Summary Box */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-900 block">
                  Projected Catering Contribution Margin
                </span>
                <span className="text-[11px] text-emerald-700">
                  Agreed Net Revenue ({formatINR(totalNetOrderPrice)}) − Direct Variable Costs ({formatINR(totalDirectCosts)})
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-emerald-700">
                  {formatINR(totalNetOrderPrice - totalDirectCosts)}
                </span>
                <span className="text-xs font-bold text-emerald-800 block">
                  {totalNetOrderPrice > 0
                    ? `${(((totalNetOrderPrice - totalDirectCosts) / totalNetOrderPrice) * 100).toFixed(1)}% CM`
                    : '0%'}
                </span>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-[11px] text-slate-500">
              {status === 'completed' || status === 'fully_paid' ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Order completed: Revenue will be recognized in {outletId.toUpperCase()} P&amp;L.
                </span>
              ) : (
                <span className="text-amber-700 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Unfulfilled order: Advance ({formatINR(advanceAmountCollected)}) recorded as liability until completed.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white font-bold transition-colors shadow-sm cursor-pointer"
              >
                {isEditing ? 'Save Changes' : 'Confirm & Save Catering Order'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
