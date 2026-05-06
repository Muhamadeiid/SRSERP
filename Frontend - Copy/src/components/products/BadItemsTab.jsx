import { useState, useEffect, useMemo } from "react";
import { badItemsApi } from "../../api/inventory";

const SITES       = ["All", "SC-01", "SC-02", "SC-03", "SC-04", "SC-05", "SC-06"];
const ISSUE_TYPES = ["All", "Damaged", "Defective", "Expired"];

const ISSUE_CFG = {
  Damaged:   { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    dot: "bg-red-500"    },
  Defective: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
  Expired:   { bg: "bg-neutral-100", text: "text-neutral-600", border: "border-neutral-200", dot: "bg-neutral-400" },
};

const EMPTY_FORM = {
  site: "SC-01", code: "", desc: "", issue_type: "Damaged",
  reported_by: "", date_reported: new Date().toISOString().slice(0, 10),
  qty: "", notes: "",
};

export default function BadItemsTab() {
  const [items, setItems]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [search, setSearch]           = useState("");
  const [filterSite, setFilterSite]   = useState("All");
  const [filterIssue, setFilterIssue] = useState("All");
  const [modal, setModal]             = useState({ open: false, item: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving]           = useState(false);

  // ─── Load ─────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await badItemsApi.list({ site: filterSite, issue_type: filterIssue, search });
      setItems(res.data ?? res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterSite, filterIssue]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.code?.toLowerCase().includes(q) ||
      i.desc?.toLowerCase().includes(q) ||
      i.reported_by?.toLowerCase().includes(q)
    );
  }, [items, search]);

  const stats = useMemo(() => ({
    total:     items.length,
    damaged:   items.filter(i => i.issue_type === "Damaged").length,
    defective: items.filter(i => i.issue_type === "Defective").length,
    expired:   items.filter(i => i.issue_type === "Expired").length,
  }), [items]);

  // ─── CRUD ─────────────────────────────────────────────────────────────────
  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (form.id) {
        const res = await badItemsApi.update(form.id, form);
        setItems(ps => ps.map(p => p.id === form.id ? res.data : p));
      } else {
        const res = await badItemsApi.create(form);
        setItems(ps => [res.data, ...ps]);
      }
      setModal({ open: false, item: null });
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    try {
      await badItemsApi.remove(item.id);
      setItems(ps => ps.filter(p => p.id !== item.id));
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  // ─── Import Excel ─────────────────────────────────────────────────────────
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      const headerRow = ws.getRow(1).values;
      const headers = {};
      headerRow.forEach((h, i) => { if (h) headers[String(h).trim()] = i; });
      const getCell = (row, name) => {
        const idx = headers[name];
        if (!idx) return "";
        const val = row.getCell(idx).value;
        return val === null || val === undefined ? "" : String(val).trim();
      };
      const rows = [];
      ws.eachRow((row, rn) => {
        if (rn === 1) return;
        const code = getCell(row, "Item Code");
        if (!code) return;
        rows.push({
          code,
          desc:          getCell(row, "Item Description") || "",
          issue_type:    getCell(row, "Issue Type")        || "Damaged",
          reported_by:   getCell(row, "Reported By")       || "",
          date_reported: getCell(row, "Date Reported")     || new Date().toISOString().slice(0,10),
          qty:           Number(getCell(row, "Qty Affected") || 0),
          notes:         getCell(row, "Notes")             || "",
          site:          getCell(row, "Site Code")          || "SC-01",
        });
      });
      await badItemsApi.import(rows);
      load();
    } catch (err) {
      alert("Import failed: " + err.message);
    }
    e.target.value = "";
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          { label: "TOTAL BAD ITEMS", value: stats.total,     accent: "border-secondary",   sub: "all sites"        },
          { label: "DAMAGED",         value: stats.damaged,   accent: "border-red-500",      sub: "physical damage"  },
          { label: "DEFECTIVE",       value: stats.defective, accent: "border-orange-400",   sub: "quality issues"   },
          { label: "EXPIRED",         value: stats.expired,   accent: "border-neutral-400",  sub: "past shelf life"  },
        ].map(s => (
          <div key={s.label} className={`bg-white border border-neutral-100 border-l-4 ${s.accent} rounded-lg px-5 py-4 shadow-sm`}>
            <p className="text-xs font-semibold text-neutral-400 tracking-widest">{s.label}</p>
            <p className="text-3xl font-extrabold text-secondary-700 mt-1 tabular-nums">{s.value}</p>
            <p className="text-xs text-neutral-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 px-4 sm:px-5 py-4 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <span className="text-sm font-bold text-secondary-700">Bad Items Register</span>
          </div>
          <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3">
            {/* Search */}
            <div className="relative w-full md:w-auto">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search bad items..."
                className="pl-8 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-secondary-700 placeholder-neutral-400 outline-none focus:border-primary/50 w-full md:w-52 transition-colors"/>
            </div>
            {/* Site filter */}
            <select value={filterSite} onChange={e => setFilterSite(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-secondary-700 outline-none">
              {SITES.map(s => <option key={s}>{s}</option>)}
            </select>
            {/* Issue type pills */}
            <div className="flex gap-1 overflow-x-auto">
              {ISSUE_TYPES.map(t => (
                <button key={t} onClick={() => setFilterIssue(t)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    filterIssue === t
                      ? t === "All"       ? "bg-secondary text-white"
                      : t === "Damaged"   ? "bg-red-500 text-white"
                      : t === "Defective" ? "bg-orange-400 text-white"
                      : "bg-neutral-500 text-white"
                      : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                  } whitespace-nowrap`}>{t === "All" ? "All" : t}</button>
              ))}
            </div>
            {/* Import */}
            <label className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:text-secondary bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
              </svg>
              Import Excel
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport}/>
            </label>
            {/* Add */}
            <button onClick={() => setModal({ open: true, item: null })}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
              </svg>
              Report Item
            </button>
          </div>
        </div>

        {/* Table body */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="ml-2 text-sm text-neutral-400">Loading bad items...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm font-semibold text-secondary-700">Failed to load</p>
            <p className="text-xs text-neutral-400 mt-1">{error}</p>
            <button onClick={load} className="mt-3 px-4 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-secondary-700">No bad items reported</p>
            <p className="text-xs text-neutral-400 mt-1">All items are in good condition</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Item</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Issue Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Reported By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Qty Affected</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Site</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Notes</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map(item => {
                const cfg = ISSUE_CFG[item.issue_type] ?? ISSUE_CFG["Damaged"];
                return (
                  <tr key={item.id} className="group hover:bg-neutral-50/80 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-secondary-700 text-sm">{item.desc || item.code}</p>
                      <p className="text-xs text-neutral-400 mt-0.5 font-mono">{item.code}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
                        {item.issue_type}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-neutral-600">{item.reported_by || "—"}</td>
                    <td className="px-4 py-3.5 text-sm text-neutral-500 whitespace-nowrap">
                      {item.date_reported ? new Date(item.date_reported).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-secondary-700 tabular-nums">
                      {item.qty ?? "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">{item.site}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-neutral-400 max-w-[160px] truncate" title={item.notes}>{item.notes || "—"}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setModal({ open: true, item })}
                          className="p-1.5 rounded hover:bg-primary/10 text-neutral-400 hover:text-primary transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                        </button>
                        <button onClick={() => setDeleteTarget(item)}
                          className="p-1.5 rounded hover:bg-red-50 text-neutral-400 hover:text-red-500 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        {!loading && !error && (
          <div className="px-5 py-3 border-t border-neutral-100">
            <p className="text-xs text-neutral-400">Showing {filtered.length} of {items.length} bad items</p>
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ── */}
      {modal.open && (
        <BadItemModal item={modal.item} saving={saving} onClose={() => setModal({ open: false, item: null })} onSave={handleSave}/>
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}/>
          <div className="relative bg-white border border-neutral-200 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-secondary-700">Delete Bad Item</h3>
                <p className="text-xs text-neutral-400">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-neutral-500 mb-5">Delete record for <span className="font-semibold text-secondary-700">{deleteTarget.code}</span>?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-secondary rounded-lg hover:bg-neutral-100 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteTarget)} className="px-4 py-2 text-sm font-bold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Bad Item Add/Edit Modal ───────────────────────────────────────────────
function BadItemModal({ item, saving, onClose, onSave }) {
  const [form, setForm]     = useState(item ?? EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: null }));
  };

  const validate = () => {
    const e = {};
    if (!form.code?.trim())       e.code       = "Required";
    if (!form.issue_type?.trim()) e.issue_type  = "Required";
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ ...form, qty: Number(form.qty) || 0 });
  };

  const isEdit = !!item;
  const INPUT  = (err) => `w-full px-3 py-2 text-sm bg-white border rounded-lg text-secondary-700 placeholder-neutral-300 outline-none transition-colors ${err ? "border-red-300 focus:ring-2 focus:ring-red-100" : "border-neutral-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/10"}`;
  const SELECT = "w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg text-secondary-700 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-2xl max-h-[calc(100vh-2rem)] bg-white border border-neutral-200 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-secondary-700">{isEdit ? "Edit Bad Item" : "Report Bad Item"}</h2>
              <p className="text-xs text-neutral-400">{isEdit ? `Editing: ${item.code}` : "Report a damaged, defective, or expired item"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-secondary transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        {/* Body */}
        <div className="px-4 sm:px-6 py-5 space-y-4 overflow-y-auto max-h-[calc(100vh-12rem)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <F label="Site Code"><select value={form.site} onChange={e => set("site", e.target.value)} className={SELECT}>{SITES.filter(s=>s!=="All").map(s=><option key={s}>{s}</option>)}</select></F>
            <F label="Issue Type" error={errors.issue_type}>
              <div className="flex flex-col sm:flex-row gap-2">
                {["Damaged","Defective","Expired"].map(t => (
                  <button key={t} onClick={() => set("issue_type", t)} type="button"
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-colors ${
                      form.issue_type === t
                        ? t === "Damaged"   ? "bg-red-500 text-white border-red-500"
                        : t === "Defective" ? "bg-orange-400 text-white border-orange-400"
                        : "bg-neutral-500 text-white border-neutral-500"
                        : "bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50"
                    }`}>{t}</button>
                ))}
              </div>
            </F>
          </div>
          <F label="Item Code" error={errors.code}><input value={form.code} onChange={e => set("code", e.target.value)} placeholder="e.g. EL-001" className={INPUT(errors.code)}/></F>
          <F label="Item Description"><input value={form.desc} onChange={e => set("desc", e.target.value)} placeholder="Item description (optional)" className={INPUT()}/></F>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <F label="Reported By"><input value={form.reported_by} onChange={e => set("reported_by", e.target.value)} placeholder="Name" className={INPUT()}/></F>
            <F label="Date Reported"><input type="date" value={form.date_reported} onChange={e => set("date_reported", e.target.value)} className={INPUT()}/></F>
            <F label="Qty Affected"><input type="number" min="0" value={form.qty} onChange={e => set("qty", e.target.value)} placeholder="0" className={INPUT()}/></F>
          </div>
          <F label="Notes"><textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Additional notes or description..." rows={2} className={`${INPUT()} resize-none`}/></F>
        </div>
        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-t border-neutral-100 bg-neutral-50/50">
          <p className="text-xs text-neutral-400">{isEdit ? "Changes saved to register" : "Item will be added to bad items register"}</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-secondary rounded-lg hover:bg-neutral-100 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-bold bg-primary hover:bg-primary-600 disabled:opacity-50 text-white rounded-lg transition-colors">
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Report Item"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function F({ label, error, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
