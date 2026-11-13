/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AggregatorBrandOutletMapping } from '../../../types/finance';
import {
  Building2,
  Plus,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Check,
  Edit2,
  X,
  Database,
} from 'lucide-react';

interface AggregatorMappingTableCardProps {
  mappings: AggregatorBrandOutletMapping[];
  onSaveMappings: (updated: AggregatorBrandOutletMapping[]) => void;
  onResetDefaults: () => void;
  syncStatus?: 'idle' | 'syncing' | 'synced' | 'local_only';
}

export const AggregatorMappingTableCard: React.FC<AggregatorMappingTableCardProps> = ({
  mappings,
  onSaveMappings,
  onResetDefaults,
  syncStatus = 'idle',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<'all' | 'swiggy' | 'zomato' | 'ownly'>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Add form state
  const [newPlatform, setNewPlatform] = useState<'swiggy' | 'zomato' | 'ownly'>('swiggy');
  const [newResId, setNewResId] = useState('');
  const [newBrand, setNewBrand] = useState('Banglar Jhale Jhole');
  const [newOutlet, setNewOutlet] = useState<'banaswadi' | 'whitefield'>('banaswadi');
  const [formError, setFormError] = useState<string | null>(null);

  // Edit row state
  const [editDraft, setEditDraft] = useState<AggregatorBrandOutletMapping | null>(null);

  const filteredMappings = mappings.filter(
    (m) => platformFilter === 'all' || m.platform === platformFilter
  );

  const handleAddRule = () => {
    const cleanId = newResId.trim();
    const cleanBrand = newBrand.trim();
    if (!cleanId || !cleanBrand) {
      setFormError('Both Restaurant ID and Brand Name are required.');
      return;
    }

    const updated = [
      ...mappings.filter(
        (m) => !(m.platform === newPlatform && m.restaurantId.trim() === cleanId)
      ),
      {
        id: `map-${newPlatform}-${cleanId}`,
        platform: newPlatform,
        restaurantId: cleanId,
        brandName: cleanBrand,
        outletId: newOutlet,
        isDefault: false,
        notes: `${newPlatform.toUpperCase()} · ${cleanBrand} · ${newOutlet}`,
      },
    ];
    onSaveMappings(updated);
    setNewResId('');
    setFormError(null);
    setIsAdding(false);
  };

  const handleSaveEdit = () => {
    if (!editDraft || !editDraft.restaurantId.trim() || !editDraft.brandName.trim()) return;
    const updated = mappings.map((m) =>
      m.id === editingId
        ? {
            ...editDraft,
            restaurantId: editDraft.restaurantId.trim(),
            brandName: editDraft.brandName.trim(),
          }
        : m
    );
    onSaveMappings(updated);
    setEditingId(null);
    setEditDraft(null);
  };

  const handleDelete = (id: string) => {
    onSaveMappings(mappings.filter((m) => m.id !== id));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
            <Building2 className="w-4.5 h-4.5 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Aggregator Restaurant ID → Brand &amp; Outlet Mapping Table
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                {mappings.length} Active IDs
              </span>
              {syncStatus === 'synced' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Database className="w-3 h-3" />
                  Synced with Supabase
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Automatically segregates <strong>Banaswadi</strong> &amp; <strong>Whitefield</strong> outlets from the Restaurant ID in Swiggy, Zomato &amp; Ownly payout filenames.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <span className="text-xs font-semibold text-indigo-600">
            {isExpanded ? 'Hide Mapping Table' : 'View / Edit IDs'}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </div>

      {/* Expandable Mapping Table */}
      {isExpanded && (
        <div className="border-t border-slate-200 p-4.5 space-y-4 bg-slate-50/40">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold w-fit">
              {(['all', 'swiggy', 'zomato', 'ownly'] as const).map((plat) => (
                <button
                  key={plat}
                  type="button"
                  onClick={() => setPlatformFilter(plat)}
                  className={`px-3 py-1 rounded-lg capitalize transition-all cursor-pointer ${
                    platformFilter === plat
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {plat === 'all' ? `All (${mappings.length})` : plat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResetDefaults}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Core 10 IDs</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAdding((prev) => !prev);
                  setFormError(null);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Restaurant ID</span>
              </button>
            </div>
          </div>

          {/* Inline Add Form */}
          {isAdding && (
            <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-3 text-xs">
              <div className="font-bold text-indigo-950">Add New Aggregator Restaurant ID Mapping</div>
              {formError && <div className="text-rose-700 font-semibold">{formError}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <select
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value as 'swiggy' | 'zomato' | 'ownly')}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-2 font-bold text-slate-900"
                >
                  <option value="swiggy">Swiggy</option>
                  <option value="zomato">Zomato</option>
                  <option value="ownly">Ownly</option>
                </select>
                <input
                  type="text"
                  value={newResId}
                  onChange={(e) => setNewResId(e.target.value)}
                  placeholder="Restaurant ID (e.g. 762173 / RN421127)"
                  className="bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold text-slate-900"
                />
                <input
                  type="text"
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  placeholder="Brand Name"
                  className="bg-white border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-900"
                />
                <select
                  value={newOutlet}
                  onChange={(e) => setNewOutlet(e.target.value as 'banaswadi' | 'whitefield')}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-2 font-bold text-slate-900"
                >
                  <option value="banaswadi">Banaswadi</option>
                  <option value="whitefield">Whitefield</option>
                </select>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddRule}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="py-2 px-3 rounded-lg bg-white border border-slate-300 text-slate-600 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Aggregator Name</th>
                  <th className="py-2.5 px-4">Restaurant ID</th>
                  <th className="py-2.5 px-4">Brand / Restaurant Name</th>
                  <th className="py-2.5 px-4">Outlet Location</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMappings.map((m) => {
                  const isEditing = editingId === m.id && editDraft;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4">
                        {isEditing ? (
                          <select
                            value={editDraft.platform}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                platform: e.target.value as 'swiggy' | 'zomato' | 'ownly',
                              })
                            }
                            className="bg-white border border-slate-300 rounded-lg px-2 py-1 font-bold"
                          >
                            <option value="swiggy">Swiggy</option>
                            <option value="zomato">Zomato</option>
                            <option value="ownly">Ownly</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              m.platform === 'swiggy'
                                ? 'bg-amber-100 text-amber-800'
                                : m.platform === 'zomato'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {m.platform}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft.restaurantId}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, restaurantId: e.target.value })
                            }
                            className="bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono font-bold w-32"
                          />
                        ) : (
                          m.restaurantId
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft.brandName}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, brandName: e.target.value })
                            }
                            className="bg-white border border-slate-300 rounded-lg px-2 py-1 font-semibold w-full"
                          />
                        ) : (
                          m.brandName
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        {isEditing ? (
                          <select
                            value={editDraft.outletId}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                outletId: e.target.value as 'banaswadi' | 'whitefield',
                              })
                            }
                            className="bg-white border border-slate-300 rounded-lg px-2 py-1 font-bold"
                          >
                            <option value="banaswadi">Banaswadi</option>
                            <option value="whitefield">Whitefield</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold capitalize ${
                              m.outletId === 'whitefield'
                                ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                                : 'bg-teal-50 text-teal-800 border border-teal-200'
                            }`}
                          >
                            {m.outletId}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditDraft(null);
                              }}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(m.id);
                                setEditDraft({ ...m });
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                              title="Edit mapping"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(m.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Delete mapping"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
