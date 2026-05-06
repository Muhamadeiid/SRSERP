import { useState, useMemo, useEffect, useCallback } from "react";
import ProductModal  from "../components/products/ProductModal";
import ImportModal   from "../components/products/ImportModal";
import RotableTab    from "../components/products/RotableTab";
import BadItemsTab   from "../components/products/BadItemsTab";
import { productsApi } from "../api/inventory";

const SITES    = ["All", "SC-01", "SC-02", "SC-03", "SC-04", "SC-05", "SC-06"];
const CATS     = ["All", "Electrical", "Mechanical", "Consumables", "Safety", "Tools", "Plumbing"];
const STATUSES = ["All", "OK", "Mid", "Low"];
const TABS     = ["New Items", "Rotable", "Bad Items"];

function getStatus(stock, min) {
  if (stock <= min * 0.5) return "Low";
  if (stock <= min)       return "Mid";
  return "OK";
}

const CAT_ICON = {
  Electrical:  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>,
  Mechanical:  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  Consumables: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>,
  Safety:      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>,
  Tools:       <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  Plumbing:    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>,
};

export default function Products() {
  const [activeTab, setActiveTab]       = useState("New Items");

  // ── New Items state ──────────────────────────────────────────────────────
  const [products, setProducts]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [search, setSearch]             = useState("");
  const [filterSite, setFilterSite]     = useState("All");
  const [filterCat, setFilterCat]       = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [productModal, setProductModal] = useState({ open: false, product: null });
  const [importModal, setImportModal]   = useState({ open: false, mode: "weekly" });
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── Load products from API ───────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await productsApi.list({ site: filterSite, cat: filterCat, status: filterStatus });
      setProducts(res.data ?? res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterSite, filterCat, filterStatus]);

  useEffect(() => {
    if (activeTab === "New Items") loadProducts();
  }, [activeTab, loadProducts]);

  // ── Client-side search ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      p.code?.toLowerCase().includes(q) ||
      p.desc?.toLowerCase().includes(q) ||
      p.hrc?.toLowerCase().includes(q)  ||
      p.sup?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const stats = useMemo(() => ({
    total: products.length,
    ok:    products.filter(p => getStatus(p.stock, p.min) === "OK").length,
    mid:   products.filter(p => getStatus(p.stock, p.min) === "Mid").length,
    low:   products.filter(p => getStatus(p.stock, p.min) === "Low").length,
  }), [products]);

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const handleSave = async (data) => {
    try {
      if (data.id) {
        const res = await productsApi.update(data.id, data);
        setProducts(ps => ps.map(p => p.id === data.id ? res.data : p));
      } else {
        const res = await productsApi.create(data);
        setProducts(ps => [...ps, res.data]);
      }
      setProductModal({ open: false, product: null });
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDelete = async (p) => {
    try {
      await productsApi.remove(p.id);
      setProducts(ps => ps.filter(x => x.id !== p.id));
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  // ── Import confirm ───────────────────────────────────────────────────────
  const handleImportConfirm = async (diff) => {
    if (diff.mode === "initial") {
      await productsApi.importInitial(diff.items);
    } else {
      await productsApi.weeklyConfirm({
        changes:    diff.changes,
        not_found:  diff.notFound.length,
        total_rows: diff.totalRows,
      });
    }
    loadProducts();
  };

  // ── Export Excel ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Products");
    ws.columns = [
      { header: "No.",               key: "no",    width: 6  },
      { header: "Site Code",         key: "site",  width: 10 },
      { header: "Category",          key: "cat",   width: 16 },
      { header: "Item Code",         key: "code",  width: 14 },
      { header: "Item Description",  key: "desc",  width: 36 },
      { header: "HRC Part No.",      key: "hrc",   width: 16 },
      { header: "Supplier Part No.", key: "sup",   width: 18 },
      { header: "Unit",              key: "unit",  width: 8  },
      { header: "Current Stock",     key: "stock", width: 14 },
      { header: "Min Stock",         key: "min",   width: 12 },
      { header: "Status",            key: "status",width: 10 },
    ];
    ws.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF004A77" } };
      cell.alignment = { horizontal: "center" };
    });
    products.forEach(p => {
      const status = getStatus(p.stock, p.min);
      const row = ws.addRow({ ...p, status });
      const colors = { OK: "FF22C55E", Mid: "FFEAB308", Low: "FFEF4444" };
      row.getCell("status").font = { bold: true, color: { argb: colors[status] } };
    });
    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `Rotem_Products_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="p-4 sm:p-6 lg:p-7 space-y-6">

          {/* ── Page Header ── */}
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-[28px] font-extrabold text-secondary-700 leading-tight">Inventory Control</h1>
              <p className="text-sm text-neutral-400 mt-1">Real-time status of materials and spare parts across all sites.</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              {stats.low > 0 && activeTab === "New Items" && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                  <div>
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide">Critical Priority</p>
                    <p className="text-xs text-red-500">{stats.low} items below threshold</p>
                  </div>
                </div>
              )}
              {activeTab === "New Items" && (
                <button onClick={handleExport}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-neutral-200 rounded-lg text-sm font-semibold text-secondary hover:bg-neutral-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  Export CSV
                </button>
              )}
            </div>
          </div>

          {/* ── Stats (New Items only) ── */}
          {activeTab === "New Items" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: "ACTIVE SKUS",  value: stats.total, accent: "border-secondary",  sub: `${stats.ok} items healthy`,   subC: "text-neutral-400" },
                { label: "LOW STOCK",    value: stats.low,   accent: stats.low > 0 ? "border-red-500" : "border-green-500",   sub: stats.low > 0 ? "Needs attention" : "All good", subC: stats.low > 0 ? "text-red-500" : "text-green-600" },
                { label: "MID STOCK",    value: stats.mid,   accent: "border-yellow-400", sub: "At minimum level",            subC: "text-yellow-600"  },
                { label: "TOTAL SITES",  value: 6,           accent: "border-primary",    sub: "SC-01 through SC-06",         subC: "text-neutral-400" },
              ].map(s => (
                <div key={s.label} className={`bg-white border border-neutral-100 border-l-4 ${s.accent} rounded-lg px-5 py-4 shadow-sm`}>
                  <p className="text-xs font-semibold text-neutral-400 tracking-widest">{s.label}</p>
                  <p className="text-3xl font-extrabold text-secondary-700 mt-1 tabular-nums">{s.value}</p>
                  <p className={`text-xs mt-1 ${s.subC}`}>{s.sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Tabs + Actions ── */}
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex items-center gap-1 bg-white border border-neutral-200 rounded-lg p-1 overflow-x-auto">
              {TABS.map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all whitespace-nowrap ${
                    activeTab === tab ? "bg-secondary text-white shadow-sm" : "text-neutral-500 hover:text-secondary hover:bg-neutral-50"
                  }`}>
                  {tab}
                  {tab === "Bad Items" && stats.low > 0 && (
                    <span className="ml-1.5 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">{stats.low}</span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === "New Items" && (
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setImportModal({ open: true, mode: "initial" })}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-500 hover:text-secondary bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/></svg>
                  Initial Import
                </button>
                <button onClick={() => setImportModal({ open: true, mode: "weekly" })}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  Weekly Update
                </button>
                <button onClick={() => setProductModal({ open: true, product: null })}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
                  Add Item
                </button>
              </div>
            )}
          </div>

          {/* ── New Items Tab ── */}
          {activeTab === "New Items" && (
            <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
              {/* Table toolbar */}
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 px-4 sm:px-5 py-4 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                  <span className="text-sm font-bold text-secondary-700">Material Ledger</span>
                </div>
                <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3">
                  <div className="relative w-full md:w-auto">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/></svg>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search materials, parts, or reports..."
                      className="pl-8 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-secondary-700 placeholder-neutral-400 outline-none focus:border-primary/50 w-full md:w-64 transition-colors"/>
                  </div>
                  <select value={filterSite} onChange={e => setFilterSite(e.target.value)} className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-secondary-700 outline-none focus:border-primary/50">
                    {SITES.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-secondary-700 outline-none focus:border-primary/50">
                    {CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <div className="flex gap-1 overflow-x-auto">
                    {STATUSES.map(s => (
                      <button key={s} onClick={() => setFilterStatus(s)}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                          filterStatus === s
                            ? s === "All" ? "bg-secondary text-white" : s === "Low" ? "bg-red-500 text-white" : s === "Mid" ? "bg-yellow-400 text-white" : "bg-green-500 text-white"
                            : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                        }`}>
                        {s === "All" ? "All Items" : s === "Low" ? "Low Stock" : s === "Mid" ? "Mid Stock" : "OK"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table content */}
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <span className="ml-2 text-sm text-neutral-400">Loading products...</span>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"/></svg>
                  </div>
                  <p className="text-sm font-semibold text-secondary-700">Failed to load products</p>
                  <p className="text-xs text-neutral-400 mt-1">{error}</p>
                  <button onClick={loadProducts} className="mt-3 px-4 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg">Retry</button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead>
                      <tr className="border-b border-neutral-100 bg-neutral-50/50">
                        <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Item Identification</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Stock Level</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Site</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">HRC / Supplier</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Reorder Point</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400 tracking-widest uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {filtered.map(p => {
                        const status = getStatus(p.stock, p.min);
                        const pct = Math.min(100, Math.round((p.stock / Math.max(p.min * 2, 1)) * 100));
                        const isLow = status === "Low";
                        const isMid = status === "Mid";
                        return (
                          <tr key={p.id} className={`group transition-colors ${isLow ? "bg-red-50/60 border-l-4 border-l-red-400" : "hover:bg-neutral-50/80"}`}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isLow ? "bg-red-100 text-red-500" : "bg-neutral-100 text-secondary-400"}`}>
                                  {isLow
                                    ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                    : CAT_ICON[p.cat] ?? CAT_ICON["Tools"]
                                  }
                                </div>
                                <div>
                                  <p className="font-semibold text-secondary-700 text-sm">{p.desc}</p>
                                  <p className="text-xs text-neutral-400 mt-0.5 font-mono">{p.code}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-sm text-neutral-500">{p.cat}</td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-24 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${isLow ? "bg-red-500" : isMid ? "bg-yellow-400" : "bg-secondary"}`} style={{ width: `${pct}%` }}/>
                                </div>
                                <span className={`text-sm font-semibold tabular-nums ${isLow ? "text-red-500" : isMid ? "text-yellow-600" : "text-secondary-700"}`}>{p.stock} {p.unit}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">{p.site}</span>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="text-xs font-mono text-neutral-500">{p.hrc}</p>
                              <p className="text-xs font-mono text-neutral-400 mt-0.5">{p.sup}</p>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={`text-sm font-semibold tabular-nums ${isLow ? "text-red-500" : "text-neutral-400"}`}>{p.min}</span>
                            </td>
                            <td className="px-4 py-3.5">
                              {isLow ? (
                                <button className="px-3 py-1 text-xs font-bold bg-secondary text-white rounded-md hover:bg-secondary-600 transition-colors">REORDER</button>
                              ) : (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => setProductModal({ open: true, product: p })}
                                    className="p-1.5 rounded hover:bg-primary/10 text-neutral-400 hover:text-primary transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                  </button>
                                  <button onClick={() => setDeleteTarget(p)}
                                    className="p-1.5 rounded hover:bg-red-50 text-neutral-400 hover:text-red-500 transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
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
                  <div className="px-5 py-3 border-t border-neutral-100 flex items-center justify-between">
                    <p className="text-xs text-neutral-400">Showing {filtered.length} of {products.length} materials</p>
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded hover:bg-neutral-100 text-neutral-400 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg></button>
                      <button className="p-1.5 rounded hover:bg-neutral-100 text-neutral-400 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg></button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Rotable Tab ── */}
          {activeTab === "Rotable" && <RotableTab />}

          {/* ── Bad Items Tab ── */}
          {activeTab === "Bad Items" && <BadItemsTab />}

      </div>

      {/* Modals */}
      <ProductModal
        open={productModal.open}
        product={productModal.product}
        onClose={() => setProductModal({ open: false, product: null })}
        onSave={handleSave}
      />
      <ImportModal
        open={importModal.open}
        mode={importModal.mode}
        currentProducts={products}
        onClose={() => setImportModal({ open: false, mode: "weekly" })}
        onConfirm={handleImportConfirm}
      />

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}/>
          <div className="relative bg-white border border-neutral-200 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-secondary-700">Delete Product</h3>
                <p className="text-xs text-neutral-400">This action cannot be undone</p>
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

      {/* FAB */}
      <button onClick={() => setProductModal({ open: true, product: null })}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-12 h-12 rounded-full bg-primary text-white shadow-lg hover:bg-primary-600 transition-colors flex items-center justify-center">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
      </button>
    </div>
  );
}
