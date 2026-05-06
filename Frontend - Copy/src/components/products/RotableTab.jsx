import { useState, useEffect, useMemo } from "react";
import { rotablesApi } from "../../api/inventory";

const SITES      = ["All", "SC-01", "SC-02", "SC-03", "SC-04", "SC-05", "SC-06"];
const CATS       = ["All", "Electrical", "Mechanical", "Consumables", "Safety", "Tools", "Plumbing"];
const CONDITIONS = ["All", "Good", "Fair", "Poor"];
const UNITS      = ["PCS", "KG", "L", "M", "BOX", "SET", "ROLL", "PAIR"];

const CONDITION_CFG = {
  Good: { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200",  dot: "bg-green-500"  },
  Fair: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-500" },
  Poor: { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    dot: "bg-red-500"    },
};

const CAT_ICON = {
  Electrical:  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>,
  Mechanical:  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  Consumables: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>,
  Safety:      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>,
  Tools:       <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  Plumbing:    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>,
};

const EMPTY_FORM = { site: "SC-01", cat: "Electrical", code: "", desc: "", hrc: "", sup: "", unit: "PCS", condition: "Good" };

export default function RotableTab() {
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [search, setSearch]         = useState("");
  const [filterSite, setFilterSite] = useState("All");
  const [filterCat,  setFilterCat]  = useState("All");
  const [filterCond, setFilterCond] = useState("All");
  const [modal, setModal]           = useState({ open: false, item: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving]         = useState(false);
  const [importRef, setImportRef]   = useState(null);

  // ─── Load data ────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await rotablesApi.list({ site: filterSite, cat: filterCat, condition: filterCond, search });
      setItems(res.data ?? res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterSite, filterCat, filterCond]);

  // Client-side search (fast, no extra API call)
  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.code?.toLowerCase().includes(q) ||
      i.desc?.toLowerCase().includes(q) ||
      i.hrc?.toLowerCase().includes(q)  ||
      i.sup?.toLowerCase().includes(q)
    );
  }, [items, search]);

  const stats = useMemo(() => ({
    total: items.length,
    good: items.filter(i => i.condition === "Good").length,
    fair: items.filter(i => i.condition === "Fair").length,
    poor: items.filter(i => i.condition === "Poor").length,
  }), [items]);

  // ─── CRUD ─────────────────────────────────────────────────────────────────
  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (form.id) {
        const res = await rotablesApi.update(form.id, form);
        setItems(ps => ps.map(p => p.id === form.id ? res.data : p));
      } else {
        const res = await rotablesApi.create(form);
        setItems(ps => [...ps, res.data]);
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
      await rotablesApi.remove(item.id);
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
          desc:      getCell(row, "Item Description"),
          cat:       getCell(row, "Category")         || "Mechanical",
          site:      getCell(row, "Site Code")         || "SC-01",
          hrc:       getCell(row, "HRC Part No.")      || "",
          sup:       getCell(row, "Supplier Part No.") || "",
          unit:      getCell(row, "Unit")              || "PCS",
          condition: getCell(row, "Condition")         || "Good",
        });
      });
      const res = await rotablesApi.import(rows);
      setImportRef(`Imported ${res.imported ?? rows.length} items`);
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
          { label: "TOTAL ROTABLE",  value: stats.total, accent: "border-secondary",  sub: "all sites"      },
          { label: "GOOD CONDITION", value: stats.good,  accent: "border-green-500",  sub: "ready to use"   },
          { label: "FAIR CONDITION", value: stats.fair,  accent: "border-yellow-400", sub: "monitor closely" },
          { label: "POOR CONDITION", value: stats.poor,  accent: "border-red-500",    sub: "needs attention" },
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
          <div className="flex flex-wrap items-center gap-2">
            <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            <span className="text-sm font-bold text-secondary-700">Rotable Ledger</span>
            {importRef && <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{importRef}</span>}
          </div>
          <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3">
            {/* Search */}
            <div className="relative w-full md:w-auto">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search rotable items..."
                className="pl-8 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-secondary-700 placeholder-neutral-400 outline-none focus:border-primary/50 w-full md:w-52 transition-colors"/>
            </div>
            {/* Filters */}
            {[
              { val: filterSite, set: setFilterSite, opts: SITES },
              { val: filterCat,  set: setFilterCat,  opts: CATS  },
            ].map((f, i) => (
              <select key={i} value={f.val} onChange={e => f.set(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-secondary-700 outline-none">
                {f.opts.map(o => <option key={o}>{o}</option>)}
              </select>
            ))}
            {/* Condition pills */}
            <div className="flex gap-1 overflow-x-auto">
              {CONDITIONS.map(c => (
                <button key={c} onClick={() => setFilterCond(c)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    filterCond === c
                      ? c === "All"  ? "bg-secondary text-white"
                      : c === "Poor" ? "bg-red-500 text-white"
                      : c === "Fair" ? "bg-yellow-400 text-white"
                      : "bg-green-500 text-white"
                      : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                  } whitespace-nowrap`}>{c}</button>
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
              Add Rotable
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="ml-2 text-sm text-neutral-400">Loading rotable items...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-secondary-700">Failed to load</p>
            <p className="text-xs text-neutral-400 mt-1">{error}</p>
            <button onClick={load} className="mt-3 px-4 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-secondary-700">No rotable items</p>
            <p className="text-xs text-neutral-400 mt-1">Add items manually or import from Excel</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Item Identification</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Condition</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Site</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">HRC / Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Unit</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map(item => {
                const cond = CONDITION_CFG[item.condition] ?? CONDITION_CFG["Good"];
                const isPoor = item.condition === "Poor";
                return (
                  <tr key={item.id} className={`group transition-colors ${isPoor ? "bg-red-50/40 border-l-4 border-l-red-400" : "hover:bg-neutral-50/80"}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isPoor ? "bg-red-100 text-red-500" : "bg-neutral-100 text-secondary-400"}`}>
                          {CAT_ICON[item.cat] ?? CAT_ICON["Tools"]}
                        </div>
                        <div>
                          <p className="font-semibold text-secondary-700 text-sm">{item.desc}</p>
                          <p className="text-xs text-neutral-400 mt-0.5 font-mono">{item.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-neutral-500">{item.cat}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cond.bg} ${cond.text} ${cond.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cond.dot}`}/>
                        {item.condition}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">{item.site}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs font-mono text-neutral-500">{item.hrc}</p>
                      <p className="text-xs font-mono text-neutral-400 mt-0.5">{item.sup}</p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-neutral-400">{item.unit}</td>
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

        {/* Footer */}
        {!loading && !error && (
          <div className="px-5 py-3 border-t border-neutral-100">
            <p className="text-xs text-neutral-400">Showing {filtered.length} of {items.length} rotable items</p>
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ── */}
      {modal.open && (
        <RotableModal
          item={modal.item}
          saving={saving}
          onClose={() => setModal({ open: false, item: null })}
          onSave={handleSave}
        />
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
                <h3 className="text-sm font-bold text-secondary-700">Delete Rotable Item</h3>
                <p className="text-xs text-neutral-400">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-neutral-500 mb-5">
              Delete <span className="font-semibold text-secondary-700">{deleteTarget.code}</span> — {deleteTarget.desc}?
            </p>
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

// ─── Rotable Add/Edit Modal ────────────────────────────────────────────────
function RotableModal({ item, saving, onClose, onSave }) {
  const [form, setForm]     = useState(item ?? EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: null }));
  };

  const validate = () => {
    const e = {};
    if (!form.code?.trim()) e.code = "Required";
    if (!form.desc?.trim()) e.desc = "Required";
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
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
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-secondary-700">{isEdit ? "Edit Rotable Item" : "Add Rotable Item"}</h2>
              <p className="text-xs text-neutral-400">{isEdit ? `Editing: ${item.code}` : "Fill in rotable item details"}</p>
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
            <F label="Category"><select value={form.cat} onChange={e => set("cat", e.target.value)} className={SELECT}>{CATS.filter(c=>c!=="All").map(c=><option key={c}>{c}</option>)}</select></F>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <F label="Item Code" error={errors.code}><input value={form.code} onChange={e => set("code", e.target.value)} placeholder="e.g. ME-R001" className={INPUT(errors.code)}/></F>
            </div>
            <F label="Unit"><select value={form.unit} onChange={e => set("unit", e.target.value)} className={SELECT}>{UNITS.map(u=><option key={u}>{u}</option>)}</select></F>
          </div>
          <F label="Item Description" error={errors.desc}><input value={form.desc} onChange={e => set("desc", e.target.value)} placeholder="Full item description" className={INPUT(errors.desc)}/></F>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <F label="HRC Part No."><input value={form.hrc} onChange={e => set("hrc", e.target.value)} placeholder="HRC-XXXXX" className={INPUT()}/></F>
            <F label="Supplier Part No."><input value={form.sup} onChange={e => set("sup", e.target.value)} placeholder="SUP-XXXXX" className={INPUT()}/></F>
          </div>
          <F label="Condition">
            <div className="flex flex-col sm:flex-row gap-2">
              {["Good","Fair","Poor"].map(c => (
                <button key={c} onClick={() => set("condition", c)} type="button"
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                    form.condition === c
                      ? c === "Good" ? "bg-green-500 text-white border-green-500"
                      : c === "Fair" ? "bg-yellow-400 text-white border-yellow-400"
                      : "bg-red-500 text-white border-red-500"
                      : "bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50"
                  }`}>{c}</button>
              ))}
            </div>
          </F>
        </div>
        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-t border-neutral-100 bg-neutral-50/50">
          <p className="text-xs text-neutral-400">{isEdit ? "Changes saved to database" : "Item added to rotable inventory"}</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-secondary rounded-lg hover:bg-neutral-100 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-bold bg-primary hover:bg-primary-600 disabled:opacity-50 text-white rounded-lg transition-colors">
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Rotable"}
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
