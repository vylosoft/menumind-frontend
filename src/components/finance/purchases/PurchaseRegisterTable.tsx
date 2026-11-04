/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { PurchaseRecord, StandardPurchaseCategory } from '../../../types/purchases';
import { OutletId } from '../../../types/finance';
import { formatINR } from '../../../utils/financeCalculations';
import { PREDEFINED_PURCHASE_CATEGORIES } from '../../../data/demoPurchasesDataset';
import {
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  FileSpreadsheet,
  Download,
  Building2,
  Layers,
  ShieldCheck,
  Calendar,
  Eye,
  History,
} from 'lucide-react';

interface PurchaseRegisterTableProps {
  currentOutlet: OutletId;
  selectedMonth: string;
  purchases: PurchaseRecord[];
  onOpenAddModal: () => void;
  onEditPurchase: (purchase: PurchaseRecord) => void;
  onDeletePurchase: (purchaseId: string) => void;
  onOpenPorterAllocation: (porterRecord: PurchaseRecord) => void;
  onSelectOutlet: (outlet: OutletId) => void;
}

export const PurchaseRegisterTable: React.FC<PurchaseRegisterTableProps> = ({
  currentOutlet,
  selectedMonth,
  purchases,
  onOpenAddModal,
  onEditPurchase,
  onDeletePurchase,
  onOpenPorterAllocation,
  onSelectOutlet,
}) => {
  const [viewMode, setViewMode] = useState<'detailed' | 'category_summary'>('detailed');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState<string>('all');
  const [selectedDocFilter, setSelectedDocFilter] = useState<string>('all');

  const isConsolidated = currentOutlet === 'consolidated';

  // Filtered purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (p.month !== selectedMonth) return false;
      if (!isConsolidated && p.outletId !== currentOutlet) return false;

      if (selectedCategoryFilter !== 'all' && p.category !== selectedCategoryFilter) return false;
      if (selectedPaymentFilter !== 'all' && p.paymentStatus !== selectedPaymentFilter) return false;
      if (selectedDocFilter !== 'all' && p.documentationStatus !== selectedDocFilter) return false;

      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchSupplier = p.supplierName.toLowerCase().includes(query);
        const matchItem = p.itemDescription.toLowerCase().includes(query);
        const matchInvoice = p.invoiceNumber?.toLowerCase().includes(query);
        const matchCategory = p.category.toLowerCase().includes(query);
        if (!matchSupplier && !matchItem && !matchInvoice && !matchCategory) return false;
      }
      return true;
    });
  }, [
    purchases,
    selectedMonth,
    currentOutlet,
    isConsolidated,
    selectedCategoryFilter,
    selectedPaymentFilter,
    selectedDocFilter,
    searchTerm,
  ]);

  // Category-wise summary table calculations
  const categorySummaries = useMemo(() => {
    const relevant = purchases.filter((p) => {
      if (p.month !== selectedMonth) return false;
      if (!isConsolidated && p.outletId !== currentOutlet) return false;
      return true;
    });

    const categoriesMap: Record<
      string,
      {
        category: string;
        lineItemCount: number;
        totalGross: number;
        totalTax: number;
        totalLanded: number;
        totalPaid: number;
        balancePayable: number;
        isFoodIngredient: boolean;
      }
    > = {};

    // Initialize predefined categories
    PREDEFINED_PURCHASE_CATEGORIES.forEach((cat) => {
      categoriesMap[cat] = {
        category: cat,
        lineItemCount: 0,
        totalGross: 0,
        totalTax: 0,
        totalLanded: 0,
        totalPaid: 0,
        balancePayable: 0,
        isFoodIngredient: cat !== 'Porter' && !cat.toLowerCase().includes('packaging'),
      };
    });

    // Populate actual records
    relevant.forEach((p) => {
      if (!categoriesMap[p.category]) {
        categoriesMap[p.category] = {
          category: p.category,
          lineItemCount: 0,
          totalGross: 0,
          totalTax: 0,
          totalLanded: 0,
          totalPaid: 0,
          balancePayable: 0,
          isFoodIngredient: p.classification === 'food_ingredient',
        };
      }
      const entry = categoriesMap[p.category];
      entry.lineItemCount += 1;
      entry.totalGross += p.totalAmount;
      entry.totalTax += p.gstAmount;
      entry.totalLanded += p.landedCost;
      entry.totalPaid += p.paidAmount;
      entry.balancePayable += p.balancePayable;
    });

    return Object.values(categoriesMap).sort((a, b) => b.totalLanded - a.totalLanded);
  }, [purchases, selectedMonth, currentOutlet, isConsolidated]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Purchase ID',
      'Date',
      'Outlet',
      'Category',
      'Classification',
      'Supplier',
      'Description',
      'Qty',
      'Unit',
      'Total Bill (INR)',
      'GST (INR)',
      'Freight (INR)',
      'Landed Cost (INR)',
      'Payment Status',
      'Paid (INR)',
      'Balance (INR)',
      'Invoice No',
      'Documentation',
    ];

    const rows = filteredPurchases.map((p) => [
      p.id,
      p.purchaseDate,
      p.outletId,
      p.category,
      p.classification,
      `"${p.supplierName.replace(/"/g, '""')}"`,
      `"${p.itemDescription.replace(/"/g, '""')}"`,
      p.quantity || '',
      p.unitOfMeasure || '',
      p.totalAmount,
      p.gstAmount,
      p.transportationExpense,
      p.landedCost,
      p.paymentStatus,
      p.paidAmount,
      p.balancePayable,
      p.invoiceNumber || '',
      p.documentationStatus,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `MenuMind_Purchase_Register_${currentOutlet}_${selectedMonth}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5">
      {/* Table Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Receipt className="w-4 h-4 text-teal-600" />
              Monthly Purchase Register &amp; Invoices
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {filteredPurchases.length} records
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Individual receipts and category totals for {selectedMonth} &bull; {currentOutlet === 'consolidated' ? 'Consolidated Chain' : currentOutlet === 'whitefield' ? 'Whitefield Kitchen' : 'Banaswadi Kitchen'}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View mode toggle */}
          <div className="p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs flex items-center">
            <button
              onClick={() => setViewMode('detailed')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === 'detailed'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Detailed Line-Items
            </button>
            <button
              onClick={() => setViewMode('category_summary')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === 'category_summary'
                  ? 'bg-white shadow-xs text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Category Summary Register
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={onOpenAddModal}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-teal-600/20 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Purchase</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      {viewMode === 'detailed' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/80">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search supplier, item, invoice..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
            >
              <option value="all">All Purchase Categories</option>
              {PREDEFINED_PURCHASE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedPaymentFilter}
              onChange={(e) => setSelectedPaymentFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
            >
              <option value="all">All Payment Statuses</option>
              <option value="paid">Paid in Full</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="pending">Pending</option>
              <option value="supplier_credit">Supplier Credit</option>
            </select>
          </div>

          <div>
            <select
              value={selectedDocFilter}
              onChange={(e) => setSelectedDocFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
            >
              <option value="all">All Documentation Statuses</option>
              <option value="tax_invoice">GST Tax Invoice</option>
              <option value="cash_memo">Cash Memo / Challan</option>
              <option value="kacha_bill">Kacha Bill / Estimate</option>
              <option value="no_bill">No Bill / Self-Voucher</option>
            </select>
          </div>
        </div>
      )}

      {/* View 1: Detailed Line-Item Register */}
      {viewMode === 'detailed' ? (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                <th className="py-2.5 px-3">Date</th>
                {isConsolidated && <th className="py-2.5 px-3">Outlet</th>}
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Classification</th>
                <th className="py-2.5 px-3">Supplier &amp; Description</th>
                <th className="py-2.5 px-3 text-right">Bill Amt</th>
                <th className="py-2.5 px-3 text-right">Freight</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-900">Landed Cost</th>
                <th className="py-2.5 px-3">Payment</th>
                <th className="py-2.5 px-3">Doc Status</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td
                    colSpan={isConsolidated ? 11 : 10}
                    className="py-8 text-center text-slate-400"
                  >
                    No purchase records match the selected filters for {selectedMonth}.
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((p) => {
                  const isHyperpure = p.category === 'Hyperpure';
                  const isPorter = p.category === 'Porter';
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-2 px-3 whitespace-nowrap text-slate-600 font-medium">
                        {p.purchaseDate}
                      </td>
                      {isConsolidated && (
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              p.outletId === 'whitefield'
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {p.outletId === 'whitefield' ? 'WF' : 'BW'}
                          </span>
                        </td>
                      )}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="font-bold text-slate-900">{p.category}</span>
                        {p.isMonthlySummaryEntry && (
                          <span className="ml-1 text-[9px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-semibold">
                            Summary
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            p.classification === 'food_ingredient'
                              ? 'bg-teal-50 text-teal-800'
                              : p.classification === 'ingredient_freight'
                              ? 'bg-sky-50 text-sky-800'
                              : p.classification === 'packaging'
                              ? 'bg-purple-50 text-purple-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {p.classification.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2 px-3 max-w-xs">
                        <div className="font-semibold text-slate-900 truncate">
                          {p.supplierName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {p.itemDescription}
                          {p.quantity ? ` &bull; ${p.quantity} ${p.unitOfMeasure}` : ''}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-slate-800 whitespace-nowrap">
                        {formatINR(p.totalAmount)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600 whitespace-nowrap">
                        {p.transportationExpense > 0 ? (
                          <span className="text-teal-700 font-semibold">
                            +{formatINR(p.transportationExpense)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-950 whitespace-nowrap bg-teal-50/20">
                        {formatINR(p.landedCost)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            p.paymentStatus === 'paid'
                              ? 'bg-emerald-50 text-emerald-700'
                              : p.paymentStatus === 'supplier_credit'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {p.paymentStatus.replace('_', ' ')}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {p.paymentMethod}
                        </div>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="text-[10px] text-slate-600">
                          {p.documentationStatus === 'tax_invoice'
                            ? 'Tax Invoice'
                            : p.documentationStatus === 'cash_memo'
                            ? 'Cash Memo'
                            : p.documentationStatus === 'kacha_bill'
                            ? 'Kacha Bill'
                            : 'No Bill'}
                        </span>
                        {p.invoiceNumber && (
                          <div className="text-[10px] text-slate-400 font-mono truncate max-w-[90px]">
                            #{p.invoiceNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {isPorter && (
                            <button
                              onClick={() => onOpenPorterAllocation(p)}
                              title="Allocate this Porter charge to ingredient purchases"
                              className="p-1 rounded-md text-teal-600 hover:bg-teal-50 border border-teal-200"
                            >
                              <Truck className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => onEditPurchase(p)}
                            title="Edit purchase record"
                            className="p-1 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete purchase "${p.itemDescription}"?`)) {
                                onDeletePurchase(p.id);
                              }
                            }}
                            title="Delete draft record"
                            className="p-1 rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      ) : (
        /* View 2: Monthly Category Summary Register */
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                <th className="py-2.5 px-4">Purchase Category</th>
                <th className="py-2.5 px-4 text-center">Entries</th>
                <th className="py-2.5 px-4 text-right">Gross Total</th>
                <th className="py-2.5 px-4 text-right">GST Charged</th>
                <th className="py-2.5 px-4 text-right font-black text-slate-900">Landed COGS</th>
                <th className="py-2.5 px-4 text-right">Paid to Date</th>
                <th className="py-2.5 px-4 text-right">Outstanding Payables</th>
                <th className="py-2.5 px-4">COGS Treatment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {categorySummaries.map((cat) => {
                const isFood = cat.isFoodIngredient;
                return (
                  <tr key={cat.category} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                      {cat.category}
                      {cat.category === 'Hyperpure' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase font-semibold">
                          Imported &bull; Settled
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center text-slate-500 font-medium">
                      {cat.lineItemCount} bills
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium">
                      {formatINR(cat.totalGross)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-500">
                      {cat.totalTax > 0 ? formatINR(cat.totalTax) : '₹0'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-950 bg-teal-50/30">
                      {formatINR(cat.totalLanded)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-emerald-700 font-semibold">
                      {formatINR(cat.totalPaid)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-semibold text-rose-600">
                      {cat.balancePayable > 0 ? formatINR(cat.balancePayable) : '₹0'}
                    </td>
                    <td className="py-2.5 px-4">
                      {isFood ? (
                        <span className="text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                          Direct Food COGS
                        </span>
                      ) : cat.category === 'Porter' ? (
                        <span className="text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                          Ingredient Freight
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          Packaging / Operating
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/80 font-black text-slate-950 border-t-2 border-slate-300">
                <td className="py-3 px-4">Total Purchases ({selectedMonth})</td>
                <td className="py-3 px-4 text-center">
                  {categorySummaries.reduce((s, c) => s + c.lineItemCount, 0)} bills
                </td>
                <td className="py-3 px-4 text-right">
                  {formatINR(categorySummaries.reduce((s, c) => s + c.totalGross, 0))}
                </td>
                <td className="py-3 px-4 text-right">
                  {formatINR(categorySummaries.reduce((s, c) => s + c.totalTax, 0))}
                </td>
                <td className="py-3 px-4 text-right font-black text-teal-950 bg-teal-100/60">
                  {formatINR(categorySummaries.reduce((s, c) => s + c.totalLanded, 0))}
                </td>
                <td className="py-3 px-4 text-right text-emerald-800">
                  {formatINR(categorySummaries.reduce((s, c) => s + c.totalPaid, 0))}
                </td>
                <td className="py-3 px-4 text-right text-rose-700">
                  {formatINR(categorySummaries.reduce((s, c) => s + c.balancePayable, 0))}
                </td>
                <td className="py-3 px-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};
