import { useState, useEffect } from "react";

const SITES = ["SC-01", "SC-02", "SC-03", "SC-04", "SC-05", "SC-06"];
const CATS  = ["Electrical", "Mechanical", "Consumables", "Safety", "Tools", "Plumbing"];
const UNITS = ["PCS", "KG", "L", "M", "BOX", "SET", "ROLL", "PAIR"];

const EMPTY = { site: "SC-01", cat: "Electrical", code: "", desc: "", hrc: "", sup: "", unit: "PCS", stock: "", min: "" };

export default function ProductModal({ open, product, onClose, onSave }) {
  const [form, setForm]     = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(product ? { ...product } : EMPTY);
      setErrors({});
    }
  }, [open, product]);

  if (!open) return null;

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: null }));
  };

  const validate = () => {
    const e = {};
    if (!form.code.trim())  e.code  = "Required";
    if (!form.desc.trim())  e.desc  = "Required";
    if (form.stock === "" || isNaN(Number(form.stock))) e.stock = "Must be a number";
    if (form.min   === "" || isNaN(Number(form.min)))   e.min   = "Must be a number";
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ ...form, stock: Number(form.stock), min: Number(form.min) });
  };

  const isEdit = !!product;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-white border border-neutral-200 rounded-2xl shadow-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isEdit
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                }
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-secondary-700">{isEdit ? "Edit Product" : "Add New Product"}</h2>
              <p className="text-xs text-neutral-400">{isEdit ? `Editing: ${product.code}` : "Fill in product details below"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-secondary transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Row 1: Site + Category */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Site Code" error={errors.site}>
              <select value={form.site} onChange={e => set("site", e.target.value)} className={SELECT_CLS}>
                {SITES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Category" error={errors.cat}>
              <select value={form.cat} onChange={e => set("cat", e.target.value)} className={SELECT_CLS}>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          {/* Row 2: Item Code + Unit */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Field label="Item Code" error={errors.code}>
                <input value={form.code} onChange={e => set("code", e.target.value)}
                  placeholder="e.g. EL-001" className={INPUT_CLS(errors.code)} />
              </Field>
            </div>
            <Field label="Unit" error={errors.unit}>
              <select value={form.unit} onChange={e => set("unit", e.target.value)} className={SELECT_CLS}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </Field>
          </div>

          {/* Row 3: Description */}
          <Field label="Item Description" error={errors.desc}>
            <input value={form.desc} onChange={e => set("desc", e.target.value)}
              placeholder="Full item description" className={INPUT_CLS(errors.desc)} />
          </Field>

          {/* Row 4: HRC + Supplier */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="HRC Part No." error={errors.hrc}>
              <input value={form.hrc} onChange={e => set("hrc", e.target.value)}
                placeholder="HRC-XXXXX" className={INPUT_CLS()} />
            </Field>
            <Field label="Supplier Part No." error={errors.sup}>
              <input value={form.sup} onChange={e => set("sup", e.target.value)}
                placeholder="SUP-XXXXX" className={INPUT_CLS()} />
            </Field>
          </div>

          {/* Row 5: Stock + Min */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Current Stock" error={errors.stock}>
              <input type="number" min="0" value={form.stock} onChange={e => set("stock", e.target.value)}
                placeholder="0" className={INPUT_CLS(errors.stock)} />
            </Field>
            <Field label="Minimum Stock" error={errors.min}>
              <input type="number" min="0" value={form.min} onChange={e => set("min", e.target.value)}
                placeholder="0" className={INPUT_CLS(errors.min)} />
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-100 bg-neutral-50/50">
          <p className="text-xs text-neutral-400">
            {isEdit ? "Changes will be saved to the database" : "Item will be added to the inventory"}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-secondary rounded-lg hover:bg-neutral-100 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave}
              className="px-5 py-2 text-sm font-bold bg-primary hover:bg-primary-600 text-white rounded-lg transition-colors">
              {isEdit ? "Save Changes" : "Add Product"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

const INPUT_CLS = (err) =>
  `w-full px-3 py-2 text-sm bg-white border rounded-lg text-secondary-700 placeholder-neutral-300 outline-none transition-colors ${
    err
      ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
      : "border-neutral-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
  }`;

const SELECT_CLS =
  "w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg text-secondary-700 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-colors";