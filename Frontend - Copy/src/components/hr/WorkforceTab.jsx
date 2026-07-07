// src/components/HR/WorkforceTab.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  FileText,
  Upload,
  Download,
  RefreshCw,
  AlertCircle,
  Loader2,
  X,
  Wrench,
  HardHat,
  Activity,
  Users,
  CheckCircle2,
  XCircle,
  Phone,
  MapPin,
  GraduationCap,
  Shield,
  AlertTriangle,
  FileCheck,
  Settings,
  Hammer,
} from "lucide-react";
import {
  getEmployees,
  getEmployeeStats,
  importEmployees,
  exportEmployees,
  downloadBlob,
  createEmployee,
  updateEmployee,
  bulkUpdateSaturdayGroup,
} from "../../services/employeeService";
import { saveEmployeeSignature, getLeaveBalance, updateLeaveBalance } from "../../services/leaveService";
import SignaturePad from "./SignaturePad";
import { useLookups } from "../../hooks/useLookups";
import { searchPositions } from "../../services/positionService";
import { listProjects } from "../../services/projectService";

// ── Config ──────────────────────────────────────────────────
const DEPT = {
  cm:              { label: "CM",               icon: Wrench,     color: "text-primary" },
  hm:              { label: "HM",               icon: Hammer,     color: "text-orange-600" },
  pm:              { label: "PM",               icon: HardHat,    color: "text-blue-600" },
  warranty:        { label: "Warranty",         icon: FileCheck,  color: "text-green-600" },
  cm_intervention: { label: "CM (Intervention)",icon: Activity,   color: "text-secondary" },
  intervention:    { label: "CM (Intervention)",icon: Activity,   color: "text-secondary" },
  admin:           { label: "Admin",            icon: Settings,   color: "text-purple-600" },
};
const STATUS = {
  on_site: {
    label: "On Site",
    cls: "bg-green-50 text-green-700 border-green-200",
  },
  annual_leave: {
    label: "Annual Leave",
    cls: "bg-primary-50 text-primary border-primary-200",
  },
  cert_expired: {
    label: "Cert Expired",
    cls: "bg-red-50 text-red-600 border-red-200",
  },
  suspended: {
    label: "Suspended",
    cls: "bg-orange-50 text-orange-600 border-orange-200",
  },
  terminated: {
    label: "Terminated",
    cls: "bg-neutral-100 text-neutral-500 border-neutral-200",
  },
  remote: {
    label: "Remote",
    cls: "bg-secondary-50 text-secondary border-secondary-200",
  },
};
const LOC_COLOR = {
  Kozzika: "bg-amber-50  text-amber-700  border-amber-200",
  Tura:    "bg-blue-50   text-blue-700   border-blue-200",
  Ganz:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  Mainline:"bg-purple-50 text-purple-700 border-purple-200",
};
const AVATAR = [
  "bg-primary",
  "bg-secondary",
  "bg-tertiary",
  "bg-primary-300",
  "bg-secondary-300",
];
const DOCS = [
  { key: "doc_birth_certificate", label: "Birth Certificate" },
  { key: "doc_edu_certificate", label: "Education Certificate" },
  { key: "doc_military_certificate", label: "Military Certificate" },
  { key: "doc_criminal_sheet", label: "Criminal Sheet" },
  { key: "doc_national_id", label: "National ID" },
  { key: "doc_social_insurance_print", label: "Social Insurance Print" },
  { key: "doc_personal_photos", label: "Personal Photos" },
  { key: "doc_union_card", label: "Union Card / Skills Cert" },
];

const ini = (n) =>
  (n ?? "")
    .split(" ")
    .map((c) => c[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
const fmtD = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const Row = ({ label, value }) =>
  value ? (
    <div className="flex gap-2 text-xs">
      <span className="text-neutral-400 w-32 shrink-0">{label}</span>
      <span className="text-secondary-700 font-medium break-all">{value}</span>
    </div>
  ) : null;

// ── Employee Detail Drawer ───────────────────────────────────
function EmployeeDrawer({ emp, onClose, idx, onEdit }) {
  if (!emp) return null;
  const statusCfg = STATUS[emp.status] ?? STATUS.on_site;
  const deptCfg = DEPT[emp.department];
  const DeptIcon = deptCfg?.icon;
  const docsOk = DOCS.filter((d) => emp[d.key]).length;

  const [bal, setBal]           = useState(null);
  const [balEdit, setBalEdit]   = useState(false);
  const [balForm, setBalForm]   = useState({});
  const [balSaving, setBalSaving] = useState(false);

  useEffect(() => {
    setBal(null); setBalEdit(false);
    if (!emp?.id) return;
    getLeaveBalance(emp.id)
      .then(r => { const d = r.data ?? {}; setBal(d); setBalForm({ annual: d.annual ?? 21, casual: d.casual ?? 7, sick: d.sick ?? 90, early: d.early ?? 0 }); })
      .catch(() => setBal({}));
  }, [emp?.id]);

  const saveBalance = async () => {
    setBalSaving(true);
    try {
      const r = await updateLeaveBalance(emp.id, balForm);
      setBal(r.data ?? bal);
      setBalEdit(false);
    } catch (_) {}
    finally { setBalSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl border-l border-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full ${AVATAR[idx % AVATAR.length]} flex items-center justify-center text-white text-sm font-bold`}
            >
              {ini(emp.name)}
            </div>
            <div>
              <p className="text-sm font-semibold text-secondary-700 leading-tight">
                {emp.name}
              </p>
              <p className="text-[10px] text-neutral-400 font-mono">
                IBS: {emp.ibs_code} · P: {emp.punch_code}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(emp)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <span
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusCfg.cls}`}
            >
              {statusCfg.label}
            </span>
            <span
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${LOC_COLOR[emp.work_location] ?? "bg-neutral-50 text-neutral-600 border-neutral-200"}`}
            >
              {emp.work_location}
            </span>
            <span
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${emp.category === "White Collar" ? "bg-indigo-50 text-indigo-600 border-indigo-200" : "bg-neutral-100 text-neutral-600 border-neutral-200"}`}
            >
              {emp.category}
            </span>
            {deptCfg && (
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-neutral-50 text-secondary-700 border-neutral-200">
                <DeptIcon className={`w-3 h-3 ${deptCfg.color}`} />
                {deptCfg.label}
              </span>
            )}
          </div>

          {/* ── Section: Job Info ── */}
          <section>
            <h4 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Job Information
            </h4>
            <div className="space-y-1.5">
              <Row label="Position" value={emp.position} />
              <Row label="Position (AR)" value={emp.position_arabic} />
              <Row label="Rotem Code" value={emp.rotem_code} />
              <Row label="Project Budget" value={emp.project_budget} />
              <Row label="Saturday Group" value={emp.saturday_group} />
              <Row label="Weekly Off Day" value={emp.weekly_off_day !== null && emp.weekly_off_day !== undefined ? WEEK_DAYS.find(d => d.value === Number(emp.weekly_off_day))?.label : null} />
              <Row label="Hiring Date" value={fmtD(emp.hiring_date)} />
              <Row label="Contract Start" value={fmtD(emp.contract_start)} />
              <Row label="Contract End" value={fmtD(emp.contract_end)} />
            </div>
          </section>

          {/* ── Section: Personal ── */}
          <section>
            <h4 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Personal Information
            </h4>
            <div className="space-y-1.5">
              <Row label="Arabic Name" value={emp.arabic_name} />
              <Row label="National ID" value={emp.national_id} />
              <Row label="Birth Date" value={fmtD(emp.birth_date)} />
              <Row label="Phone" value={emp.phone} />
              <Row label="Another Phone" value={emp.another_phone} />
            </div>
          </section>

          {/* ── Section: Address ── */}
          <section>
            <h4 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> Address
            </h4>
            <div className="space-y-1.5">
              <Row label="City" value={emp.city} />
              <Row label="Address" value={emp.address} />
            </div>
          </section>

          {/* ── Section: Education ── */}
          <section>
            <h4 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <GraduationCap className="w-3 h-3" /> Education
            </h4>
            <div className="space-y-1.5">
              <Row label="Type" value={emp.education_type} />
              <Row label="School/Univ." value={emp.education_school} />
              <Row label="Major" value={emp.education_major} />
              <Row label="Graduation Year" value={emp.education_year} />
            </div>
          </section>

          {/* ── Section: Military ── */}
          <section>
            <h4 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Shield className="w-3 h-3" /> Military Service
            </h4>
            <div className="space-y-1.5">
              <Row label="Status" value={emp.military_status} />
              <Row
                label="Serving Period"
                value={
                  emp.military_serving_years != null ||
                  emp.military_serving_months != null
                    ? `${emp.military_serving_years ?? 0}Y ${emp.military_serving_months ?? 0}M ${emp.military_serving_days ?? 0}D`
                    : null
                }
              />
            </div>
          </section>

          {/* ── Section: Emergency Contact ── */}
          <section>
            <h4 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> Emergency Contact
            </h4>
            <div className="space-y-1.5">
              <Row label="Relation" value={emp.emergency_contact_type} />
              <Row label="Name (EN)" value={emp.emergency_contact_name} />
              <Row label="Name (AR)" value={emp.emergency_contact_name_ar} />
              <Row label="Phone" value={emp.emergency_contact_phone} />
            </div>
          </section>

          {/* ── Section: Documents ── */}
          <section>
            <h4 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <FileCheck className="w-3 h-3" /> Documents ({docsOk}/8)
            </h4>
            {/* Progress bar */}
            <div className="h-1.5 bg-neutral-100 rounded-full mb-3 overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${(docsOk / 8) * 100}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {DOCS.map((d) => (
                <div
                  key={d.key}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg border ${emp[d.key] ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-500"}`}
                >
                  {emp[d.key] ? (
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                  ) : (
                    <XCircle className="w-3 h-3 shrink-0" />
                  )}
                  <span className="truncate text-[11px]">{d.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Section: Leave Balance ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                <FileText className="w-3 h-3" /> Leave Balance
              </h4>
              {bal && !balEdit && (
                <button onClick={() => setBalEdit(true)} className="text-[10px] font-semibold text-primary hover:underline">Edit</button>
              )}
            </div>
            {bal === null ? (
              <div className="flex items-center gap-2 text-xs text-neutral-400"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>
            ) : balEdit ? (
              <div className="space-y-2">
                {[['annual','Annual',21],['casual','Casual (sub-limit)',7],['sick','Sick',90],['early','Early Leave',0]].map(([k, label, def]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-xs text-secondary-700 w-36">{label}</span>
                    <input
                      type="number" min={0} max={365} step={0.25}
                      value={balForm[k] ?? def}
                      onChange={e => setBalForm(f => ({ ...f, [k]: parseFloat(e.target.value) || 0 }))}
                      className="w-20 text-sm text-center border border-neutral-200 rounded-lg px-2 py-1 outline-none focus:border-primary/50"
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button onClick={saveBalance} disabled={balSaving} className="flex-1 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50">
                    {balSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setBalEdit(false)} className="flex-1 py-1.5 border border-neutral-200 text-xs font-semibold rounded-lg hover:bg-neutral-50">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Annual', total: bal.annual ?? 21, rem: bal.annual_remaining_effective ?? bal.annual ?? 21, color: 'bg-blue-500' },
                  { label: 'Casual', total: bal.casual ?? 7,  rem: bal.casual_remaining_effective  ?? bal.casual  ?? 7,  color: 'bg-purple-500' },
                  { label: 'Sick',   total: bal.sick   ?? 90, rem: bal.sick_remaining_effective   ?? bal.sick   ?? 90, color: 'bg-amber-500' },
                  { label: 'Early',  total: bal.early  ?? 0,  rem: bal.early_remaining_effective  ?? bal.early  ?? 0,  color: 'bg-green-500' },
                ].map(({ label, total, rem, color }) => (
                  <div key={label} className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
                    <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-lg font-black text-secondary-700 leading-none">{rem}<span className="text-xs font-normal text-neutral-400 ml-0.5">/ {total}d</span></p>
                    <div className="h-1 bg-neutral-200 rounded-full mt-2 overflow-hidden">
                      <div className={`h-full ${color} rounded-full`} style={{ width: total > 0 ? `${Math.min(100,(rem/total)*100)}%` : '0%' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Section: Insurance ── */}
          <section>
            <h4 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> Insurance & Forms
            </h4>
            <div className="space-y-1.5">
              <Row label="Social Ins. No" value={emp.social_insurance_number} />
              <Row label="Insurance Status" value={emp.insurance_status} />
              <Row label="Insurance Co." value={emp.insurance_company} />
              <Row
                label="Form 1"
                value={emp.form_1 ? "✓ Available" : "✗ Missing"}
              />
              <Row label="Insurance Date" value={fmtD(emp.insurance_date)} />
              <Row label="Vacation Form" value={emp.vacation_form} />
              <Row label="Sanctions Form" value={emp.sanctions_form} />
              <Row
                label="Marital Status Form"
                value={emp.marital_status_form}
              />
              <Row
                label="Warning Letters"
                value={
                  emp.no_warning_letters > 0
                    ? `${emp.no_warning_letters} Warning(s)`
                    : null
                }
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Main WorkforceTab ────────────────────────────────────────
export default function WorkforceTab() {
  const { departments: lookupDepts, locations: lookupLocs } = useLookups()
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({
    total: 0,
    per_page: 12,
    current_page: 1,
    last_page: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState(null); // employee for drawer
  const [selIdx, setSelIdx] = useState(0);
  const [bulkSelectedIds, setBulkSelectedIds] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [projects, setProjects] = useState([]);

  const [locFilter,  setLocFilter]  = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState("active"); // "active" | "ex"

  const fileRef = useRef(null);
  const searchTimer = useRef(null);

  const [searchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [formEmp,  setFormEmp]  = useState(null); // null = new, object = edit
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState(null);
  const [managers, setManagers] = useState([]);  // all employees (for direct manager dropdown)
  const [users,    setUsers]    = useState([]);   // all system users (for user_id link dropdown)

  // Open Add form if sidebar button navigated here with ?add=1
  useEffect(() => {
    if (searchParams.get('add') === '1') { setFormEmp(null); setFormOpen(true); }
  }, []);

  const openAdd  = () => { setFormEmp(null);  setFormErr(null); setFormOpen(true); };
  const openEdit = (emp) => { setFormEmp(emp); setFormErr(null); setFormOpen(true); };

  const handleFormSave = async (data) => {
    setSaving(true);
    setFormErr(null);
    try {
      if (formEmp) {
        await updateEmployee(formEmp.id, data);
      } else {
        await createEmployee(data);
      }
      setFormOpen(false);
      fetchEmployees();
      fetchStats();
    } catch (e) {
      setFormErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getEmployees({
        view,
        location:   locFilter  !== "all" ? locFilter  : undefined,
        project:    projectFilter !== "all" ? projectFilter : undefined,
        department: deptFilter || undefined,
        search:     search     || undefined,
        page,
        per_page: 12,
      });
      setEmployees(res.data);
      setPagination(res.pagination);
      setBulkSelectedIds([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [view, locFilter, projectFilter, deptFilter, search, page]);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await getEmployeeStats());
    } catch { /* stats unavailable */ }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);
  useEffect(() => {
    listProjects().then(items => setProjects(items.filter(p => p.is_active))).catch(() => setProjects([]));
  }, []);
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const visibleIds = employees.map(emp => emp.id);
  const selectedCount = bulkSelectedIds.length;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => bulkSelectedIds.includes(id));

  const toggleBulkSelected = (id) => {
    setBulkSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleVisibleSelected = () => {
    setBulkSelectedIds(prev => {
      if (allVisibleSelected) {
        return prev.filter(id => !visibleIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const applySaturdayGroup = async (group) => {
    if (selectedCount === 0) return;
    setBulkSaving(true);
    setError(null);
    try {
      const res = await bulkUpdateSaturdayGroup(bulkSelectedIds, group);
      const updated = res.data ?? [];
      const byId = Object.fromEntries(updated.map(emp => [emp.id, emp]));
      setEmployees(prev => prev.map(emp => byId[emp.id] ? { ...emp, ...byId[emp.id] } : emp));
      setSelected(prev => prev && byId[prev.id] ? { ...prev, ...byId[prev.id] } : prev);
      setBulkSelectedIds([]);
      fetchStats();
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkSaving(false);
    }
  };

  // Fetch all employees for the direct manager dropdown
  useEffect(() => {
    const token = localStorage.getItem('srs_token');
    const base  = import.meta.env.VITE_API_URL ?? 'https://srs-backend.onrender.com/api';
    const hdrs  = { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

    // Employees list for "Direct Manager" dropdown
    fetch(`${base}/employees?per_page=500`, { headers: hdrs })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setManagers(data.data?.data ?? data.data ?? []))
      .catch(() => setManagers([]));

    // Users list for "System User Account" link dropdown
    fetch(`${base}/users`, { headers: hdrs })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setUsers(Array.isArray(data) ? data : (data.data ?? [])))
      .catch(() => setUsers([]));
  }, []);

  const handleSearch = (v) => {
    clearTimeout(searchTimer.current);
    setSearch(v);
    searchTimer.current = setTimeout(() => setPage(1), 400);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const res = await importEmployees(file);
      let msg = `✅ Imported ${res.imported} employees successfully.`;
      if (res.errors?.length) {
        msg += `\n\n⚠️ ${res.errors.length} row(s) failed:\n`;
        msg += res.errors.map((err, i) => `  ${i + 1}. ${err}`).join('\n');
      }
      alert(msg);
      fetchEmployees();
      fetchStats();
    } catch (err) {
      alert("❌ Import failed: " + err.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportEmployees({
        location:   locFilter  !== "all" ? locFilter  : undefined,
        department: deptFilter || undefined,
      });
      downloadBlob(
        blob,
        `SRS_Employees_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
    } catch (err) {
      alert("❌ Export failed: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  const locations   = stats?.locations ?? [];
  const byLocation  = stats?.by_location ?? {};
  const total        = stats?.total ?? 0;

  // Location cards — pulled from lookups (dynamic)
  const locCards = [
    { key: 'all', label: 'All Staff', value: total, sub: `${stats?.by_status?.on_site ?? 0} on site` },
    ...lookupLocs.map(loc => ({ key: loc.key, label: loc.label_en, value: byLocation[loc.key] ?? 0, sub: null })),
  ];
  const projectCards = [
    { key: 'all', label: 'All Projects', value: total },
    ...projects.map(project => ({ key: project.code, label: project.name, value: project.employees_count ?? 0 })),
  ];

  const pageNums = () => {
    const T = pagination.last_page,
      C = pagination.current_page;
    if (T <= 7) return Array.from({ length: T }, (_, i) => i + 1);
    if (C <= 4) return [1, 2, 3, 4, 5, "…", T];
    if (C >= T - 3) return [1, "…", T - 4, T - 3, T - 2, T - 1, T];
    return [1, "…", C - 1, C, C + 1, "…", T];
  };

  const onSite        = stats?.by_status?.on_site      ?? 0
  const certExpired   = stats?.by_status?.cert_expired ?? 0
  const activePercent = total > 0 ? Math.round((onSite / total) * 100) : 0
  const certPercent   = total > 0 ? Math.round(((total - certExpired) / total) * 100) : 0

  return (
    <div className="p-6 space-y-4">

      {/* ── Active vs Ex-Employees tabs ── */}
      <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-xl">
        {[
          { key: 'active', label: 'Active' },
          { key: 'ex',     label: 'Ex-Employees' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setView(t.key); setPage(1); }}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${
              view === t.key
                ? 'bg-white text-secondary-700 shadow-sm'
                : 'text-neutral-500 hover:text-secondary-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Location filter cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {locCards.map(({ key, label, value, sub }, idx) => {
          const colors = ['text-secondary-700','text-primary','text-amber-600','text-blue-600','text-emerald-600','text-purple-600']
          const color  = colors[idx % colors.length]
          return (
            <button
              key={key}
              onClick={() => { setLocFilter(key); setPage(1); }}
              className={`bg-white rounded-2xl border-2 p-4 text-left transition-all hover:shadow-md ${
                locFilter === key ? 'border-primary shadow-sm' : 'border-neutral-100'
              }`}
            >
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-xs font-semibold text-neutral-500 mt-0.5">{label}</p>
              {sub && <p className="text-[10px] text-neutral-400 mt-0.5">{sub}</p>}
            </button>
          )
        })}
      </div>

      {/* ── Department filter pills ── */}
      <div className="flex flex-wrap gap-2">
        {projectCards.map(({ key, label, value }) => (
          <button
            key={key}
            onClick={() => { setProjectFilter(key); setPage(1); }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
              projectFilter === key
                ? 'bg-secondary text-white border-secondary shadow-sm'
                : 'bg-white text-neutral-500 border-neutral-200 hover:border-secondary/40 hover:text-secondary'
            }`}
          >
            {label}
            <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
              projectFilter === key ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-400'
            }`}>
              {value}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: '', label: 'All Departments' },
          ...lookupDepts.map(d => ({ key: d.key, label: d.label_en })),
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setDeptFilter(key); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              deptFilter === key
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-white text-neutral-500 border-neutral-200 hover:border-primary/40 hover:text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Registry Health bars ── */}
      <div className="bg-white rounded-2xl border border-neutral-100 px-5 py-3 flex gap-8 items-center flex-wrap">
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest shrink-0">Registry Health</p>
        <div className="flex-1 min-w-[140px]">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-neutral-500">Active Deployment</span>
            <span className="font-bold text-secondary-700">{activePercent}%</span>
          </div>
          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${activePercent}%` }} />
          </div>
        </div>
        <div className="flex-1 min-w-[140px]">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-neutral-500">Safety Certs Valid</span>
            <span className="font-bold text-secondary-700">{certPercent}%</span>
          </div>
          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${certPercent}%` }} />
          </div>
        </div>
        <div className="flex-1 min-w-[120px]">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-neutral-500">Missing Docs</span>
            <span className="font-bold text-red-500">{stats?.missing_docs ?? 0}</span>
          </div>
          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div className="h-full bg-red-400 rounded-full transition-all"
              style={{ width: total > 0 ? `${Math.round(((stats?.missing_docs ?? 0) / total) * 100)}%` : '0%' }} />
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-lg px-3 h-9 flex-1 min-w-[180px] max-w-sm">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search name, IBS, position, national ID…"
            className="bg-transparent text-sm placeholder:text-neutral-400 outline-none w-full"
          />
        </div>

<div className="ml-auto flex items-center gap-2">
          <p className="text-sm text-neutral-400 whitespace-nowrap">
            <span className="font-semibold text-secondary-700">
              {pagination.total}
            </span>{" "}
            Personnel
          </p>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 h-9 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Add Member</span>
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 h-9 bg-white border border-neutral-200 rounded-lg text-sm hover:bg-neutral-50 transition-colors disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 h-9 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {importing ? "Loading…" : "Import Excel"}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImport}
          />
          <button
            onClick={fetchEmployees}
            className="p-2 bg-white border border-neutral-200 rounded-lg text-neutral-400 hover:text-secondary"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button className="ml-auto underline" onClick={fetchEmployees}>
            Retry
          </button>
        </div>
      )}

      {/* ── Table ── */}
      {selectedCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-secondary-700">
              {selectedCount} employee{selectedCount > 1 ? "s" : ""} selected
            </p>
            <p className="text-xs text-neutral-400">
              Assign selected employees to Saturday rotation group.
            </p>
          </div>
          <button
            onClick={() => applySaturdayGroup("A")}
            disabled={bulkSaving}
            className="px-4 py-2 rounded-lg bg-white border border-primary/30 text-primary text-sm font-bold hover:bg-primary hover:text-white disabled:opacity-50 transition-all"
          >
            Group A
          </button>
          <button
            onClick={() => applySaturdayGroup("B")}
            disabled={bulkSaving}
            className="px-4 py-2 rounded-lg bg-white border border-secondary/30 text-secondary text-sm font-bold hover:bg-secondary hover:text-white disabled:opacity-50 transition-all"
          >
            Group B
          </button>
          <button
            onClick={() => setBulkSelectedIds([])}
            disabled={bulkSaving}
            className="p-2 rounded-lg text-neutral-400 hover:bg-white hover:text-neutral-600 disabled:opacity-50"
            title="Clear selection"
          >
            {bulkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          </button>
        </div>
      )}

      <div className="bg-white border border-neutral-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px]">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/60">
                <th className="px-4 py-3.5 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleSelected}
                    className="w-4 h-4 rounded border-neutral-300 text-primary focus:ring-primary/30"
                    aria-label="Select visible employees"
                  />
                </th>
                {[
                  "#",
                  "Employee",
                  "Position",
                  "Department",
                  "Location",
                  "Hired",
                  "Category",
                  "Docs",
                  "Status",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[11px] font-semibold text-neutral-400 uppercase tracking-widest px-4 py-3.5 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div
                            className="h-4 bg-neutral-100 rounded animate-pulse"
                            style={{ width: j === 1 ? "140px" : "80px" }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                : employees.map((emp, i) => {
                    const sc = STATUS[emp.status] ?? STATUS.on_site;
                    const dc = DEPT[emp.department];
                    const Icon = dc?.icon;
                    const lc =
                      LOC_COLOR[emp.work_location] ??
                      "bg-neutral-50 text-neutral-600 border-neutral-200";
                    const rowNum =
                      (pagination.current_page - 1) * pagination.per_page +
                      i +
                      1;
                    const docsOk = DOCS.filter((d) => emp[d.key]).length;
                    const isBulkSelected = bulkSelectedIds.includes(emp.id);

                    return (
                      <tr
                        key={emp.id}
                        className={`hover:bg-neutral-50/60 transition-colors group cursor-pointer ${isBulkSelected ? "bg-primary/5" : ""}`}
                        onClick={() => {
                          setSelected(emp);
                          setSelIdx(i);
                        }}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isBulkSelected}
                            onChange={() => toggleBulkSelected(emp.id)}
                            className="w-4 h-4 rounded border-neutral-300 text-primary focus:ring-primary/30"
                            aria-label={`Select ${emp.name}`}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-400 font-mono">
                          {rowNum}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-full ${AVATAR[i % AVATAR.length]} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}
                            >
                              {ini(emp.name)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-secondary-700 leading-tight">
                                {emp.name}
                              </p>
                              <p className="text-[10px] text-neutral-400 font-mono">
                                IBS: {emp.ibs_code} · P: {emp.punch_code}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          <p
                            className="text-sm text-secondary-700 truncate"
                            title={emp.position}
                          >
                            {emp.position}
                          </p>
                          {emp.position_arabic && (
                            <p className="text-[10px] text-neutral-400 truncate">
                              {emp.position_arabic}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {Icon && (
                              <Icon className={`w-3.5 h-3.5 ${dc.color}`} />
                            )}
                            <span className="text-sm text-secondary">
                              {dc?.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${lc}`}
                          >
                            {emp.work_location}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-neutral-500 whitespace-nowrap">
                            {fmtD(emp.hiring_date)}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${emp.category === "White Collar" ? "bg-indigo-50 text-indigo-600 border-indigo-200" : "bg-neutral-100 text-neutral-600 border-neutral-200"}`}
                          >
                            {emp.category}
                          </span>
                        </td>
                        {/* Docs mini bar */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${docsOk >= 7 ? "bg-green-500" : docsOk >= 4 ? "bg-amber-400" : "bg-red-400"}`}
                                style={{ width: `${(docsOk / 8) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-neutral-400">
                              {docsOk}/8
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${sc.cls}`}
                          >
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(emp);
                              setSelIdx(i);
                            }}
                            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-primary-50 text-neutral-400 hover:text-primary transition-all"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              {!loading && employees.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-6 py-12 text-center text-sm text-neutral-400"
                  >
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No personnel match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-neutral-100 flex items-center justify-between">
          <p className="text-xs text-neutral-400">
            Showing {pagination.from ?? 0}–{pagination.to ?? 0} of{" "}
            {pagination.total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.current_page === 1}
              className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {pageNums().map((p, i) =>
              p === "…" ? (
                <span
                  key={`e${i}`}
                  className="w-7 text-center text-neutral-400 text-xs"
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${pagination.current_page === p ? "bg-primary text-white" : "text-neutral-400 hover:bg-neutral-100"}`}
                >
                  {p}
                </button>
              ),
            )}
            <button
              onClick={() =>
                setPage((p) => Math.min(pagination.last_page, p + 1))
              }
              disabled={pagination.current_page === pagination.last_page}
              className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      <EmployeeDrawer
        emp={selected}
        onClose={() => setSelected(null)}
        idx={selIdx}
        onEdit={(emp) => { setSelected(null); openEdit(emp); }}
      />

      {/* Add / Edit Modal */}
      {formOpen && (
        <EmployeeFormModal
          emp={formEmp}
          saving={saving}
          error={formErr}
          onClose={() => setFormOpen(false)}
          onSave={handleFormSave}
          managers={managers}
          users={users}
          onSignatureSave={(empId, dataURL) => {
            setEmployees(prev => prev.map(e => e.id === empId ? { ...e, e_signature: dataURL } : e));
          }}
        />
      )}
    </div>
  );
}

// ── Employee Add / Edit Form Modal ───────────────────────────
const EMPTY = {
  // Identifiers
  ibs_code: '', punch_code: '', rotem_code: '', project_budget: '',
  // Names
  name: '', arabic_name: '',
  // Position
  position: '', position_arabic: '', department: '',
  // Location
  work_location: '', city: '', address: '',
  // Schedule
  saturday_group: '', weekly_off_day: '',
  // Personal
  hiring_date: '', national_id: '', birth_date: '', phone: '', another_phone: '',
  // Education
  education_type: '', education_school: '', education_major: '', education_year: '',
  // Classification
  category: 'Blue Collar', status: 'on_site',
  // Military
  military_status: '', military_serving_days: '', military_serving_months: '', military_serving_years: '',
  // Emergency Contact
  emergency_contact_type: '', emergency_contact_name: '', emergency_contact_name_ar: '', emergency_contact_phone: '',
  // Documents
  doc_birth_certificate: false, doc_edu_certificate: false, doc_military_certificate: false,
  doc_criminal_sheet: false, doc_national_id: false, doc_social_insurance_print: false,
  doc_personal_photos: false, doc_union_card: false,
  // Insurance
  social_insurance_number: '', insurance_status: '', insurance_company: '', form_1: false, insurance_date: '',
  // Contract
  contract_start: '', contract_end: '',
  // HR Forms
  vacation_form: false, sanctions_form: false, marital_status_form: false, no_warning_letters: 0,
  // Direct Manager (employee id, self-referential)
  direct_manager_id: null,
  // System User Account (users.id — for login / approvals)
  user_id: null,
};

const INP = "w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all";
const LBL = "block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1";
const WEEK_DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const FORM_TABS = [
  { key: 'basic',     label: 'Basic Info'        },
  { key: 'personal',  label: 'Personal'          },
  { key: 'edu_mil',   label: 'Education & Military' },
  { key: 'emergency', label: 'Emergency Contact' },
  { key: 'documents', label: 'Documents'         },
  { key: 'insurance', label: 'Insurance & Contract' },
  { key: 'hr_sig',    label: 'Manager & Signature' },
];

function dateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  return val;
}

function buildInitialForm(emp) {
  if (!emp) return { ...EMPTY };
  return {
    ibs_code: emp.ibs_code ?? '', punch_code: emp.punch_code ?? '',
    rotem_code: emp.rotem_code ?? '', project_budget: emp.project_budget ?? '',
    name: emp.name ?? '', arabic_name: emp.arabic_name ?? '',
    position: emp.position ?? '', position_arabic: emp.position_arabic ?? '',
    department: emp.department ?? '',
    work_location: emp.work_location ?? '', city: emp.city ?? '', address: emp.address ?? '',
    saturday_group: emp.saturday_group ?? '',
    weekly_off_day: emp.weekly_off_day ?? '',
    hiring_date: dateStr(emp.hiring_date), national_id: emp.national_id ?? '',
    birth_date: dateStr(emp.birth_date), phone: emp.phone ?? '', another_phone: emp.another_phone ?? '',
    education_type: emp.education_type ?? '', education_school: emp.education_school ?? '',
    education_major: emp.education_major ?? '', education_year: emp.education_year ?? '',
    category: emp.category ?? 'Blue Collar', status: emp.status ?? 'on_site',
    military_status: emp.military_status ?? '',
    military_serving_days: emp.military_serving_days ?? '',
    military_serving_months: emp.military_serving_months ?? '',
    military_serving_years: emp.military_serving_years ?? '',
    emergency_contact_type: emp.emergency_contact_type ?? '',
    emergency_contact_name: emp.emergency_contact_name ?? '',
    emergency_contact_name_ar: emp.emergency_contact_name_ar ?? '',
    emergency_contact_phone: emp.emergency_contact_phone ?? '',
    doc_birth_certificate: !!emp.doc_birth_certificate,
    doc_edu_certificate: !!emp.doc_edu_certificate,
    doc_military_certificate: !!emp.doc_military_certificate,
    doc_criminal_sheet: !!emp.doc_criminal_sheet,
    doc_national_id: !!emp.doc_national_id,
    doc_social_insurance_print: !!emp.doc_social_insurance_print,
    doc_personal_photos: !!emp.doc_personal_photos,
    doc_union_card: !!emp.doc_union_card,
    social_insurance_number: emp.social_insurance_number ?? '',
    insurance_status: emp.insurance_status ?? '',
    insurance_company: emp.insurance_company ?? '',
    form_1: !!emp.form_1,
    insurance_date: dateStr(emp.insurance_date),
    contract_start: dateStr(emp.contract_start),
    contract_end: dateStr(emp.contract_end),
    vacation_form: !!emp.vacation_form,
    sanctions_form: !!emp.sanctions_form,
    marital_status_form: !!emp.marital_status_form,
    no_warning_letters: emp.no_warning_letters ?? 0,
    direct_manager_id: emp.direct_manager_id ?? null,
    user_id:           emp.user_id ?? null,
  };
}

function PositionPicker({ value, valueArabic, onChange, onTextChange }) {
  const [q, setQ] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  useEffect(() => { setQ(value || '') }, [value])

  const handleChange = (v) => {
    setQ(v)
    onTextChange?.(v)
    setOpen(true)
    if (timer.current) clearTimeout(timer.current)
    if (!v || v.length < 1) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setBusy(true)
      try { setResults(await searchPositions(v)) } catch { setResults([]) }
      finally { setBusy(false) }
    }, 200)
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => q.length >= 1 && handleChange(q)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Search or type a new position…"
        className="w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all"
      />
      {busy && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-neutral-300" />}
      {open && results.length > 0 && (
        <div className="absolute z-30 w-full mt-1 bg-white rounded-xl border border-neutral-200 shadow-xl overflow-hidden max-h-56 overflow-y-auto">
          {results.map(p => (
            <button key={p.id} type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(p); setQ(p.name_en); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/5 text-left border-b border-neutral-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-secondary-700 truncate">{p.name_en}</p>
                {p.name_ar && <p className="text-[11px] text-neutral-400 text-right" dir="rtl">{p.name_ar}</p>}
              </div>
              <span className="text-[10px] font-mono text-neutral-400 shrink-0">{p.department_key ?? '—'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EmployeeFormModal({ emp, saving, error, onClose, onSave, managers = [], users = [], onSignatureSave }) {
  const [form, setForm] = useState(() => buildInitialForm(emp));
  const [tab, setTab] = useState('basic');
  const { departments: lookupDepts, categories: lookupCats, locations: lookupLocs } = useLookups();
  const isIntervention = ['cm_intervention', 'intervention'].includes(form.department)
    || String(form.position || '').toLowerCase().includes('intervention');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const chk = (k) => set(k, !form[k]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <h2 className="text-sm font-bold text-secondary-700">
            {emp ? 'Edit Employee' : 'Add New Member'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-0.5 px-6 pt-3 border-b border-neutral-100 overflow-x-auto">
          {FORM_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-t-lg transition-all border-b-2 ${
                tab === t.key
                  ? 'text-primary border-primary bg-primary-50'
                  : 'text-neutral-400 border-transparent hover:text-secondary hover:bg-neutral-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-4">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2.5 rounded-lg">
                {error}
              </div>
            )}

            {/* ── Tab: Basic Info ── */}
            {tab === 'basic' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Full Name <span className="text-red-400">*</span></label>
                    <input value={form.name} onChange={e => set('name', e.target.value)} required className={INP} placeholder="English name" />
                  </div>
                  <div>
                    <label className={LBL}>Arabic Name</label>
                    <input value={form.arabic_name} onChange={e => set('arabic_name', e.target.value)} className={INP} placeholder="الاسم بالعربية" dir="rtl" />
                  </div>
                </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={LBL}>IBS Code</label>
                    <input value={form.ibs_code} onChange={e => set('ibs_code', e.target.value)} className={INP} placeholder="e.g. 199767" />
                  </div>
                  <div>
                    <label className={LBL}>Punch Code</label>
                    <input value={form.punch_code} onChange={e => set('punch_code', e.target.value)} className={INP} placeholder="e.g. 1001" />
                  </div>
                  <div>
                    <label className={LBL}>Rotem Code</label>
                    <input value={form.rotem_code} onChange={e => set('rotem_code', e.target.value)} className={INP} placeholder="Rotem ID" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Project Budget</label>
                    <input value={form.project_budget} onChange={e => set('project_budget', e.target.value)} className={INP} placeholder="Budget code" />
                  </div>
                  <div>
                    <label className={LBL}>Hiring Date</label>
                    <input type="date" value={form.hiring_date} onChange={e => set('hiring_date', e.target.value)} className={INP} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Position <span className="text-red-400">*</span></label>
                    <PositionPicker
                      value={form.position}
                      valueArabic={form.position_arabic}
                      onChange={(pos) => {
                        if (pos) {
                          set('position', pos.name_en)
                          set('position_arabic', pos.name_ar ?? '')
                          set('position_id', pos.id)
                          if (pos.department_key) set('department', pos.department_key)
                        } else {
                          set('position_id', null)
                        }
                      }}
                      onTextChange={(txt) => set('position', txt)}
                    />
                  </div>
                  <div>
                    <label className={LBL}>Position (Arabic)</label>
                    <input value={form.position_arabic} onChange={e => set('position_arabic', e.target.value)} className={INP} placeholder="المسمى الوظيفي" dir="rtl" />
                  </div>
                </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={LBL}>Department</label>
                    <select value={form.department} onChange={e => set('department', e.target.value)} className={INP}>
                      <option value="">— Select —</option>
                      {lookupDepts.map(d => <option key={d.key} value={d.key}>{d.label_en}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LBL}>Category</label>
                    <select value={form.category} onChange={e => set('category', e.target.value)} className={INP}>
                      {lookupCats.map(c => <option key={c.key} value={c.key}>{c.label_en}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LBL}>Status</label>
                    <select value={form.status} onChange={e => set('status', e.target.value)} className={INP}>
                      <option value="on_site">On Site</option>
                      <option value="annual_leave">Annual Leave</option>
                      <option value="cert_expired">Cert Expired</option>
                      <option value="suspended">Suspended</option>
                      <option value="terminated">Terminated</option>
                      <option value="remote">Remote</option>
                    </select>
                  </div>
                </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={LBL}>Work Location</label>
                    <select value={form.work_location} onChange={e => set('work_location', e.target.value)} className={INP}>
                      <option value="">— Select —</option>
                      {lookupLocs.map(loc => <option key={loc.key} value={loc.key}>{loc.label_en}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LBL}>City</label>
                    <input value={form.city} onChange={e => set('city', e.target.value)} className={INP} placeholder="City" />
                  </div>
                  <div>
                    <label className={LBL}>Address</label>
                    <input value={form.address} onChange={e => set('address', e.target.value)} className={INP} placeholder="Full address" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Saturday Group</label>
                    <select
                      value={form.saturday_group ?? ''}
                      onChange={e => set('saturday_group', e.target.value)}
                      disabled={isIntervention}
                      className={`${INP} ${isIntervention ? 'bg-neutral-50 text-neutral-400' : ''}`}
                    >
                      <option value="">— Select —</option>
                      <option value="A">Group A</option>
                      <option value="B">Group B</option>
                    </select>
                  </div>
                  <div>
                    <label className={LBL}>Weekly Off Day</label>
                    <select
                      value={form.weekly_off_day ?? ''}
                      onChange={e => set('weekly_off_day', e.target.value)}
                      disabled={!isIntervention}
                      className={`${INP} ${!isIntervention ? 'bg-neutral-50 text-neutral-400' : ''}`}
                    >
                      <option value="">— Select —</option>
                      {WEEK_DAYS.map(day => (
                        <option key={day.value} value={day.value}>{day.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* ── Tab: Personal ── */}
            {tab === 'personal' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>National ID</label>
                    <input value={form.national_id} onChange={e => set('national_id', e.target.value)} className={INP} placeholder="14-digit ID" />
                  </div>
                  <div>
                    <label className={LBL}>Birth Date</label>
                    <input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} className={INP} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Phone</label>
                    <input value={form.phone} onChange={e => set('phone', e.target.value)} className={INP} placeholder="01xxxxxxxxx" />
                  </div>
                  <div>
                    <label className={LBL}>Another Phone</label>
                    <input value={form.another_phone} onChange={e => set('another_phone', e.target.value)} className={INP} placeholder="01xxxxxxxxx" />
                  </div>
                </div>
              </>
            )}

            {/* ── Tab: Education & Military ── */}
            {tab === 'edu_mil' && (
              <>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Education</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Education Type</label>
                    <input value={form.education_type} onChange={e => set('education_type', e.target.value)} className={INP} placeholder="e.g. Bachelor" />
                  </div>
                  <div>
                    <label className={LBL}>School / University</label>
                    <input value={form.education_school} onChange={e => set('education_school', e.target.value)} className={INP} placeholder="Institution name" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Major / Faculty</label>
                    <input value={form.education_major} onChange={e => set('education_major', e.target.value)} className={INP} placeholder="Field of study" />
                  </div>
                  <div>
                    <label className={LBL}>Graduation Year</label>
                    <input type="number" value={form.education_year} onChange={e => set('education_year', e.target.value)} className={INP} placeholder="e.g. 2015" />
                  </div>
                </div>
                <div className="border-t border-neutral-100 pt-3">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Military Service</p>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className={LBL}>Military Status</label>
                      <select value={form.military_status} onChange={e => set('military_status', e.target.value)} className={INP}>
                        <option value="">— Select —</option>
                        <option value="completed">Completed</option>
                        <option value="exempted">Exempted</option>
                        <option value="serving">Currently Serving</option>
                        <option value="postponed">Postponed</option>
                        <option value="not_applicable">Not Applicable</option>
                      </select>
                    </div>
                  </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className={LBL}>Days</label>
                      <input type="number" value={form.military_serving_days} onChange={e => set('military_serving_days', e.target.value)} className={INP} min="0" />
                    </div>
                    <div>
                      <label className={LBL}>Months</label>
                      <input type="number" value={form.military_serving_months} onChange={e => set('military_serving_months', e.target.value)} className={INP} min="0" />
                    </div>
                    <div>
                      <label className={LBL}>Years</label>
                      <input type="number" value={form.military_serving_years} onChange={e => set('military_serving_years', e.target.value)} className={INP} min="0" />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Tab: Emergency Contact ── */}
            {tab === 'emergency' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Relationship</label>
                    <input value={form.emergency_contact_type} onChange={e => set('emergency_contact_type', e.target.value)} className={INP} placeholder="e.g. Brother, Father" />
                  </div>
                  <div>
                    <label className={LBL}>Phone</label>
                    <input value={form.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)} className={INP} placeholder="01xxxxxxxxx" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Contact Name (English)</label>
                    <input value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} className={INP} placeholder="Full name" />
                  </div>
                  <div>
                    <label className={LBL}>Contact Name (Arabic)</label>
                    <input value={form.emergency_contact_name_ar} onChange={e => set('emergency_contact_name_ar', e.target.value)} className={INP} placeholder="الاسم بالعربية" dir="rtl" />
                  </div>
                </div>
              </>
            )}

            {/* ── Tab: Documents ── */}
            {tab === 'documents' && (
              <>
                <p className="text-xs text-neutral-400 mb-3">Check the documents that have been submitted and verified.</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'doc_birth_certificate',      label: 'Birth Certificate'        },
                    { key: 'doc_edu_certificate',         label: 'Education Certificate'    },
                    { key: 'doc_military_certificate',    label: 'Military Certificate'     },
                    { key: 'doc_criminal_sheet',          label: 'Criminal Record Sheet'    },
                    { key: 'doc_national_id',             label: 'National ID Copy'         },
                    { key: 'doc_social_insurance_print',  label: 'Social Insurance Print'   },
                    { key: 'doc_personal_photos',         label: 'Personal Photos'          },
                    { key: 'doc_union_card',              label: 'Union Card'               },
                  ].map(d => (
                    <label key={d.key} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-200 cursor-pointer hover:bg-neutral-50 transition-all">
                      <input
                        type="checkbox"
                        checked={form[d.key]}
                        onChange={() => chk(d.key)}
                        className="w-4 h-4 accent-primary rounded"
                      />
                      <span className="text-sm font-medium text-secondary-700">{d.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {/* ── Tab: Insurance & Contract ── */}
            {tab === 'insurance' && (
              <>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Social Insurance</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Insurance Number</label>
                    <input value={form.social_insurance_number} onChange={e => set('social_insurance_number', e.target.value)} className={INP} placeholder="Social insurance #" />
                  </div>
                  <div>
                    <label className={LBL}>Insurance Status</label>
                    <select value={form.insurance_status} onChange={e => set('insurance_status', e.target.value)} className={INP}>
                      <option value="">— Select —</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Insurance Company</label>
                    <input value={form.insurance_company} onChange={e => set('insurance_company', e.target.value)} className={INP} placeholder="Company name" />
                  </div>
                  <div>
                    <label className={LBL}>Insurance Date</label>
                    <input type="date" value={form.insurance_date} onChange={e => set('insurance_date', e.target.value)} className={INP} />
                  </div>
                </div>
                <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-200 cursor-pointer hover:bg-neutral-50 transition-all">
                  <input type="checkbox" checked={form.form_1} onChange={() => chk('form_1')} className="w-4 h-4 accent-primary rounded" />
                  <span className="text-sm font-medium text-secondary-700">Form 1 Submitted</span>
                </label>

                <div className="border-t border-neutral-100 pt-3">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Contract</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={LBL}>Contract Start</label>
                      <input type="date" value={form.contract_start} onChange={e => set('contract_start', e.target.value)} className={INP} />
                    </div>
                    <div>
                      <label className={LBL}>Contract End</label>
                      <input type="date" value={form.contract_end} onChange={e => set('contract_end', e.target.value)} className={INP} />
                    </div>
                  </div>
                </div>

                <div className="border-t border-neutral-100 pt-3">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">HR Forms</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'vacation_form',       label: 'Vacation Form'        },
                      { key: 'sanctions_form',       label: 'Sanctions Form'       },
                      { key: 'marital_status_form',  label: 'Marital Status Form'  },
                    ].map(f => (
                      <label key={f.key} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-200 cursor-pointer hover:bg-neutral-50 transition-all">
                        <input type="checkbox" checked={form[f.key]} onChange={() => chk(f.key)} className="w-4 h-4 accent-primary rounded" />
                        <span className="text-sm font-medium text-secondary-700">{f.label}</span>
                      </label>
                    ))}
                    <div>
                      <label className={LBL}>Warning Letters Count</label>
                      <input type="number" value={form.no_warning_letters} onChange={e => set('no_warning_letters', e.target.value)} className={INP} min="0" />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Tab: Manager & Signature ── */}
            {tab === 'hr_sig' && (
              <>
                {/* Direct Manager — any employee */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                    Direct Manager
                  </label>
                  <select
                    value={form.direct_manager_id ?? ''}
                    onChange={e => setForm(f => ({ ...f, direct_manager_id: e.target.value || null }))}
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-primary">
                    <option value="">— None / Depot Manager —</option>
                    {managers
                      .filter(m => !emp || m.id !== emp.id) // can't be own manager
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name}{m.position ? ` — ${m.position}` : ''}{m.department ? ` (${m.department})` : ''}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-neutral-400 mt-1">
                    Any employee can be a direct manager. Leave blank if the Depot Manager approves directly.
                  </p>
                </div>

                {/* System User Account — links this employee to a login account */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                    System User Account
                    <span className="ml-1 text-[10px] font-normal text-neutral-300 normal-case">— for login &amp; leave approvals</span>
                  </label>
                  <select
                    value={form.user_id ?? ''}
                    onChange={e => setForm(f => ({ ...f, user_id: e.target.value || null }))}
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-primary">
                    <option value="">— No system account —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role?.replace('_', ' ')})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-neutral-400 mt-1">
                    Link this employee to their system login. Required for them to receive notifications and approve leave requests.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                    E-Signature
                  </label>
                  {emp?.e_signature && (
                    <div className="mb-2 p-2 border border-neutral-100 rounded-lg bg-neutral-50 inline-block">
                      <img src={emp.e_signature} alt="signature" className="h-12 object-contain" />
                    </div>
                  )}
                  {emp ? (
                    <SignaturePad
                      initialSignature={emp.e_signature ?? null}
                      label="Draw or upload employee signature"
                      onSave={async (dataURL) => {
                        try {
                          await saveEmployeeSignature(emp.id, dataURL)
                          if (onSignatureSave) onSignatureSave(emp.id, dataURL)
                        } catch (err) { alert(err.message) }
                      }}
                    />
                  ) : (
                    <p className="text-xs text-neutral-400">Save the employee first, then come back to add a signature.</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-100 sticky bottom-0 bg-white">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-secondary rounded-lg hover:bg-neutral-100 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-all disabled:opacity-60">
              {saving ? 'Saving...' : emp ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
