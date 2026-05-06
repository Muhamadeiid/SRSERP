/**
 * inventory.js — Centralized API layer for Inventory Control
 * Base URL pulled from .env: VITE_API_BASE=http://192.168.1.x/api
 *
 * Usage:
 *   import api from "../api/inventory";
 *   const products = await api.products.list({ site: "SC-01" });
 */

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api";

// ─── Generic fetch wrapper ─────────────────────────────────────────────────
async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? "API Error");
  }

  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

const get    = (path)         => request("GET",    path);
const post   = (path, body)   => request("POST",   path, body);
const put    = (path, body)   => request("PUT",    path, body);
const del    = (path)         => request("DELETE", path);

// ─── Products (New Items) ──────────────────────────────────────────────────
export const productsApi = {
  /** GET /api/products?site=SC-01&cat=Electrical&status=Low&search=... */
  list: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.site   && filters.site   !== "All") params.set("site",   filters.site);
    if (filters.cat    && filters.cat    !== "All") params.set("cat",    filters.cat);
    if (filters.status && filters.status !== "All") params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    const qs = params.toString();
    return get(`/products${qs ? "?" + qs : ""}`);
  },

  /** POST /api/products */
  create: (data) => post("/products", data),

  /** PUT /api/products/{id} */
  update: (id, data) => put(`/products/${id}`, data),

  /** DELETE /api/products/{id} */
  remove: (id) => del(`/products/${id}`),

  /** POST /api/products/import/initial — bulk import from parsed Excel rows */
  importInitial: (rows) => post("/products/import/initial", { rows }),

  /** POST /api/inventory/weekly-import — preview diff (no DB write) */
  weeklyPreview: (rows) => post("/inventory/weekly-import", { rows }),

  /** POST /api/inventory/weekly-import/confirm — apply diff to DB */
  weeklyConfirm: (payload) => post("/inventory/weekly-import/confirm", payload),

  /** GET /api/inventory/weekly-history */
  weeklyHistory: () => get("/inventory/weekly-history"),

  /** GET /api/inventory/consumption-rate?months=3 */
  consumptionRate: (months = 3) => get(`/inventory/consumption-rate?months=${months}`),
};

// ─── Rotables ──────────────────────────────────────────────────────────────
export const rotablesApi = {
  /** GET /api/rotables?site=SC-01&cat=Mechanical&condition=Poor */
  list: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.site      && filters.site      !== "All") params.set("site",      filters.site);
    if (filters.cat       && filters.cat       !== "All") params.set("cat",       filters.cat);
    if (filters.condition && filters.condition !== "All") params.set("condition", filters.condition);
    if (filters.search) params.set("search", filters.search);
    const qs = params.toString();
    return get(`/rotables${qs ? "?" + qs : ""}`);
  },

  /** POST /api/rotables */
  create: (data) => post("/rotables", data),

  /** PUT /api/rotables/{id} */
  update: (id, data) => put(`/rotables/${id}`, data),

  /** DELETE /api/rotables/{id} */
  remove: (id) => del(`/rotables/${id}`),

  /** POST /api/rotables/import */
  import: (rows) => post("/rotables/import", { rows }),
};

// ─── Bad Items ─────────────────────────────────────────────────────────────
export const badItemsApi = {
  /** GET /api/bad-items?site=SC-01&issue_type=Damaged */
  list: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.site       && filters.site       !== "All") params.set("site",       filters.site);
    if (filters.issue_type && filters.issue_type !== "All") params.set("issue_type", filters.issue_type);
    if (filters.search) params.set("search", filters.search);
    const qs = params.toString();
    return get(`/bad-items${qs ? "?" + qs : ""}`);
  },

  /** POST /api/bad-items */
  create: (data) => post("/bad-items", data),

  /** PUT /api/bad-items/{id} */
  update: (id, data) => put(`/bad-items/${id}`, data),

  /** DELETE /api/bad-items/{id} */
  remove: (id) => del(`/bad-items/${id}`),

  /** POST /api/bad-items/import */
  import: (rows) => post("/bad-items/import", { rows }),
};

// ─── Default export (convenience) ─────────────────────────────────────────
const api = { products: productsApi, rotables: rotablesApi, badItems: badItemsApi };
export default api;
