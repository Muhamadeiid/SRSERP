import { useState, useRef } from "react";

/*
  ImportModal handles two modes:
  1. Initial Import  — first time loading products from Excel
  2. Weekly Update   — compare new Excel vs current DB, show diff, confirm

  Uses ExcelJS (safer than SheetJS/xlsx):
  npm install exceljs
*/

const STEPS = ["upload", "preview", "confirm"];

export default function ImportModal({ open, mode = "weekly", currentProducts, onClose, onConfirm }) {
  const [step, setStep]         = useState("upload");
  const [file, setFile]         = useState(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing]   = useState(false);
  const [parseError, setParseError] = useState(null);
  const [diff, setDiff]         = useState(null);   // { matched, added, notFound, changes }
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef();

  if (!open) return null;

  // ─── File handling ────────────────────────────────────────────────────────
  const handleFile = async (f) => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      setParseError("Please upload an Excel (.xlsx / .xls) or CSV file.");
      return;
    }
    setFile(f);
    setParseError(null);
    setParsing(true);

    try {
      const ExcelJS = (await import("exceljs")).default;
      const buf     = await f.arrayBuffer();
      const wb      = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws      = wb.worksheets[0];

      // Build header map from first row
      const headerRow = ws.getRow(1).values; // index starts at 1
      const headers   = {};
      headerRow.forEach((h, i) => { if (h) headers[String(h).trim()] = i; });

      const getCell = (row, name) => {
        const idx = headers[name];
        if (!idx) return "";
        const val = row.getCell(idx).value;
        return val === null || val === undefined ? "" : String(val).trim();
      };

      // Convert worksheet rows → plain objects (skip header row)
      const rows = [];
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // skip header
        rows.push(row);
      });

      if (mode === "initial") {
        // Initial import: map rows directly to products
        const mapped = rows.map((row, i) => ({
          no:    i + 1,
          site:  getCell(row, "Site Code")         || "",
          cat:   getCell(row, "Category")          || "",
          code:  getCell(row, "Item Code")         || "",
          desc:  getCell(row, "Item Description")  || "",
          hrc:   getCell(row, "HRC Part No.")      || "",
          sup:   getCell(row, "Supplier Part No.") || "",
          unit:  getCell(row, "Unit")              || "PCS",
          stock: Number(getCell(row, "Current Stock") || getCell(row, "stock") || 0),
          min:   Number(getCell(row, "Min Stock")     || getCell(row, "min")   || 0),
        })).filter(p => p.code);

        setDiff({ mode: "initial", items: mapped });
      } else {
        // Weekly update: compare with current products
        const incoming = rows.map(row => ({
          code:  getCell(row, "Item Code")      || getCell(row, "code")  || "",
          stock: Number(getCell(row, "Current Stock") || getCell(row, "Qty") || getCell(row, "stock") || 0),
          site:  getCell(row, "Site Code")      || getCell(row, "site")  || null,
        })).filter(r => r.code.trim());

        const currentMap = {};
        (currentProducts || []).forEach(p => { currentMap[p.code] = p; });

        const changes  = [];
        const notFound = [];

        incoming.forEach(row => {
          const existing = currentMap[row.code];
          if (!existing) {
            notFound.push(row);
          } else {
            const delta = row.stock - existing.stock;
            changes.push({
              ...existing,
              newStock: row.stock,
              delta,
              direction: delta > 0 ? "in" : delta < 0 ? "out" : "same",
            });
          }
        });

        setDiff({ mode: "weekly", changes, notFound, totalRows: incoming.length });
      }

      setStep("preview");
    } catch (err) {
      setParseError("Failed to parse file. Please check the format.");
      console.error(err);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm(diff);
      onClose();
    } finally {
      setConfirming(false);
    }
  };

  const reset = () => {
    setStep("upload");
    setFile(null);
    setDiff(null);
    setParseError(null);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-white border border-neutral-200 rounded-2xl shadow-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-secondary-700">
                {mode === "initial" ? "Initial Data Import" : "Weekly Stock Update"}
              </h2>
              <p className="text-xs text-neutral-400">
                {mode === "initial" ? "Import all products from Excel" : "Upload new stock counts to compare & update"}
              </p>
            </div>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mr-8">
            {["Upload", "Preview", "Confirm"].map((s, i) => {
              const idx = STEPS.indexOf(step);
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    i < idx  ? "bg-green-500 text-white" :
                    i === idx ? "bg-primary text-white" :
                    "bg-neutral-200 text-neutral-400"
                  }`}>{i < idx ? "✓" : i + 1}</div>
                  <span className={`text-xs font-medium ${i === idx ? "text-secondary-700" : "text-neutral-400"}`}>{s}</span>
                  {i < 2 && <span className="text-neutral-300 mx-0.5">→</span>}
                </div>
              );
            })}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-secondary transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 min-h-[300px]">

          {/* ── STEP 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-4">
              {mode === "weekly" && (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-primary font-medium">
                  <strong>Required columns:</strong> Item Code, Current Stock (Qty) — Site Code is optional
                </div>
              )}
              {mode === "initial" && (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-primary font-medium">
                  <strong>Required columns:</strong> Item Code, Item Description, Current Stock, Min Stock — others optional
                </div>
              )}

              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-xl py-12 cursor-pointer transition-all ${
                  dragging
                    ? "border-primary bg-primary/5"
                    : "border-neutral-200 hover:border-primary/40 hover:bg-neutral-50"
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-secondary-700">Drag & drop your Excel file here</p>
                  <p className="text-xs text-neutral-400 mt-1">or click to browse — .xlsx, .xls, .csv</p>
                </div>
                {parsing && (
                  <div className="flex items-center gap-2 text-xs text-primary font-medium">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Parsing file...
                  </div>
                )}
                <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => handleFile(e.target.files[0])} />
              </div>

              {parseError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">{parseError}</div>
              )}
            </div>
          )}

          {/* ── STEP 2: Preview ── */}
          {step === "preview" && diff && (
            <div className="space-y-4">
              {diff.mode === "initial" ? (
                <>
                  <div className="flex items-center gap-3">
                    <StatPill label="Items Found" value={diff.items.length} color="blue" />
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-xl border border-neutral-200">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-neutral-50">
                        <tr className="text-neutral-500 border-b border-neutral-200">
                          <th className="px-3 py-2 text-left font-semibold">Code</th>
                          <th className="px-3 py-2 text-left font-semibold">Description</th>
                          <th className="px-3 py-2 text-left font-semibold">Site</th>
                          <th className="px-3 py-2 text-right font-semibold">Stock</th>
                          <th className="px-3 py-2 text-right font-semibold">Min</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {diff.items.map((p, i) => (
                          <tr key={i} className="hover:bg-neutral-50">
                            <td className="px-3 py-2 font-mono text-primary">{p.code}</td>
                            <td className="px-3 py-2 text-secondary-700 max-w-[180px] truncate">{p.desc}</td>
                            <td className="px-3 py-2 text-neutral-500">{p.site}</td>
                            <td className="px-3 py-2 text-right text-secondary-700 font-semibold">{p.stock}</td>
                            <td className="px-3 py-2 text-right text-neutral-400">{p.min}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatPill label="Total Rows" value={diff.totalRows} color="blue" />
                    <StatPill label="Matched" value={diff.changes.filter(c => c.direction !== "same").length} color="yellow" />
                    <StatPill label="No Change" value={diff.changes.filter(c => c.direction === "same").length} color="gray" />
                    <StatPill label="Not Found" value={diff.notFound.length} color="red" />
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-xl border border-neutral-200">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-neutral-50">
                        <tr className="text-neutral-500 border-b border-neutral-200">
                          <th className="px-3 py-2 text-left font-semibold">Item Code</th>
                          <th className="px-3 py-2 text-left font-semibold">Description</th>
                          <th className="px-3 py-2 text-right font-semibold">Old Stock</th>
                          <th className="px-3 py-2 text-right font-semibold">New Stock</th>
                          <th className="px-3 py-2 text-right font-semibold">Change</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {diff.changes.filter(c => c.direction !== "same").map((c, i) => (
                          <tr key={i} className="hover:bg-neutral-50">
                            <td className="px-3 py-2 font-mono text-primary">{c.code}</td>
                            <td className="px-3 py-2 text-secondary-700 max-w-[160px] truncate">{c.desc}</td>
                            <td className="px-3 py-2 text-right text-neutral-500">{c.stock}</td>
                            <td className="px-3 py-2 text-right text-secondary-700 font-semibold">{c.newStock}</td>
                            <td className={`px-3 py-2 text-right font-bold ${
                              c.direction === "in" ? "text-green-600" : "text-red-500"
                            }`}>
                              {c.direction === "in" ? "+" : ""}{c.delta}
                            </td>
                          </tr>
                        ))}
                        {diff.notFound.map((r, i) => (
                          <tr key={"nf" + i} className="bg-red-50/60">
                            <td className="px-3 py-2 font-mono text-red-500">{r.code}</td>
                            <td className="px-3 py-2 text-neutral-400 italic" colSpan={3}>Not found in database</td>
                            <td className="px-3 py-2 text-right text-red-400 text-[10px] font-bold">SKIP</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {diff.notFound.length > 0 && (
                    <p className="text-xs text-yellow-600 font-medium">
                      ⚠ {diff.notFound.length} item(s) not found in DB will be skipped. Add them manually first if needed.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-100 bg-neutral-50/50">
          <button onClick={step === "upload" ? onClose : reset}
            className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-secondary rounded-lg hover:bg-neutral-100 transition-colors">
            {step === "upload" ? "Cancel" : "← Back"}
          </button>

          {step === "preview" && (
            <button onClick={handleConfirm} disabled={confirming}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-primary hover:bg-primary-600 disabled:opacity-50 text-white rounded-lg transition-colors">
              {confirming && (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              )}
              {mode === "initial" ? "Import All Products" : "Confirm & Update Stock"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }) {
  const colors = {
    blue:   "bg-primary/10  text-primary   border-primary/20",
    yellow: "bg-yellow-50   text-yellow-700 border-yellow-200",
    green:  "bg-green-50    text-green-700  border-green-200",
    red:    "bg-red-50      text-red-600    border-red-200",
    gray:   "bg-neutral-100 text-neutral-500 border-neutral-200",
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${colors[color]}`}>
      <span className="text-base font-extrabold">{value}</span>
      <span className="opacity-80">{label}</span>
    </div>
  );
}