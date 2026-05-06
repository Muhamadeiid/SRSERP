// src/pages/Dashboard.jsx
import { useState } from "react";
import StatCard           from "../components/dashboard/StatCard";
import ModuleCard         from "../components/dashboard/ModuleCard";
import HRCard             from "../components/dashboard/HRCard";
import MaintenanceCard    from "../components/dashboard/MaintenanceCard";
import InventoryTable     from "../components/dashboard/InventoryTable";
import RecentActivity     from "../components/dashboard/RecentActivity";
import Alerts             from "../components/dashboard/Alerts";

const MOCK_STATS = [
  { label: "Open Work Orders",    value: 14, sub: "↑ 3 since yesterday", subColor: "text-red-500"     },
  { label: "Scheduled This Week", value: 28, sub: "Across 6 sites",       subColor: "text-neutral-400" },
  { label: "Low Stock Items",     value: 7,  sub: "↑ 2 new alerts",       subColor: "text-red-500"     },
  { label: "Active Technicians",  value: 12, sub: "On shift now",          subColor: "text-green-600"   },
];

const MOCK_MODULES = [
  { icon: "🔧", title: "Corrective Maintenance",  description: "Breakdown repairs, fault tracking, and corrective work order management in real time.",                                                                                                         badge: "Coming Soon", stats: [{ value: 14, label: "Open" }, { value: 3, label: "Critical" }] },
  { icon: "🛡", title: "Preventive Maintenance",  description: "Scheduled tasks, inspection routines, and periodic service intervals across all equipment.",                                                                                                   badge: "Coming Soon", stats: [{ value: 28, label: "Scheduled" }, { value: 5, label: "Overdue" }] },
  { icon: "👥", title: "Human Resource",           description: "Technician assignments, shift schedules, attendance, certifications, and performance tracking.",                                                                                               badge: "Coming Soon", stats: [{ value: 12, label: "On Shift" }, { value: 4, label: "Teams" }] },
  { icon: "📦", title: "Material Control",         description: "Material requests, procurement tracking, supplier management, and delivery status for spare parts.",                                                                                          badge: "Coming Soon", stats: [{ value: 9, label: "Pending" }, { value: 2, label: "Suppliers" }] },
  { icon: "☰", title: "Inventory Control",        description: "Full stock management across all 6 sites. Monitor levels, track movements, import weekly sheets, manage bad items, and forecast purchasing needs.", badge: "Live", badgeLabel: "StockManager v2", highlight: true, stats: [{ value: 24, label: "Items" }, { value: 6, label: "Sites" }, { value: 7, label: "Low Stock" }] },
];

const MOCK_HR = { totalStaff: 142, onShift: 38, hrChange: "+4% vs LW", safetyCertsExpiring: 2, avatars: ["A", "B", "C"] };

const MOCK_MAINTENANCE = {
  openTickets: 24, criticalTickets: 5, mttr: "4.2h", mttrChange: "12%", weeklyProgress: 82,
  recentTasks: [
    { title: "Conveyor A-4 Overheat",      urgency: "High Urgency", time: "12m ago", color: "#e53935" },
    { title: "HVAC Monthly Filter Change",  urgency: "Scheduled",    time: "1h ago",  color: "#004A77" },
  ],
};

const MOCK_INVENTORY_ITEMS = [
  { id: "BR-9022", name: "Ceramic Bearing Set",       status: "LOW STOCK", available: "12 units", forecast: null },
  { id: "SL-4011", name: "Hydraulic Seal Kit (L)",    status: "ORDERED",   available: "0 units",  forecast: "ETA: 2 Days" },
  { id: "WR-1100", name: "Industrial Wiring (12AWG)", status: "STABLE",    available: "840 ft",   forecast: null },
];

const MOCK_ACTIVITY = [
  { type: "stock-in",  description: "Received 50x Hydraulic Seal Kit (L)", user: "Ahmed K.", time: "10m ago", site: "SC-01" },
  { type: "stock-out", description: "Issued 3x Ceramic Bearing Set",        user: "Sara M.",  time: "25m ago", site: "SC-03" },
  { type: "bad-item",  description: "Reported damaged Industrial Wiring",    user: "Omar R.",  time: "1h ago",  site: "SC-02" },
  { type: "import",    description: "Weekly sheet imported — Week 24",       user: "Admin",    time: "2h ago",  site: "All"   },
  { type: "stock-out", description: "Issued 10x Safety Gloves (L)",         user: "Mona T.",  time: "3h ago",  site: "SC-05" },
];

const MOCK_ALERTS = [
  { severity: "critical", message: "BR-9022 Ceramic Bearing Set below minimum stock", site: "SC-01", time: "5m ago"  },
  { severity: "critical", message: "SL-4011 Hydraulic Seal Kit — 0 units remaining",  site: "SC-03", time: "20m ago" },
  { severity: "critical", message: "Safety Certs expiring for 2 technicians",          site: "SC-02", time: "1h ago"  },
  { severity: "warning",  message: "Weekly import not yet submitted for SC-04",        site: "SC-04", time: "2h ago"  },
  { severity: "info",     message: "8 requisitions awaiting approval",                 site: "All",   time: "3h ago"  },
];

export default function DashboardPage() {
  const [activeNav, setActiveNav] = useState("Dashboard");

  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-6">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-extrabold text-secondary-700 leading-tight">Operations Overview</h1>
          <p className="text-sm text-neutral-400 mt-1">Real-time performance metrics for industrial assets and teams.</p>
        </div>
        <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
          <button className="px-4 py-2.5 bg-white border border-neutral-100 rounded-lg text-sm font-semibold text-secondary hover:bg-neutral-50 transition-colors">Export Report</button>
          <button className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-colors">📅 June 14, 2024</button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MOCK_STATS.map((s, i) => <StatCard key={i} {...s} />)}
      </div>

      {/* Modules */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest mb-4">Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_MODULES.slice(0, 3).map((m, i) => <ModuleCard key={i} {...m} onClick={() => setActiveNav(m.title)} />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {MOCK_MODULES.slice(3).map((m, i) => <ModuleCard key={i} {...m} onClick={() => setActiveNav(m.title)} />)}
        </div>
      </div>

      {/* HR + Maintenance */}
      <div className="flex flex-col lg:flex-row gap-4">
        <HRCard          data={MOCK_HR} />
        <MaintenanceCard data={MOCK_MAINTENANCE} />
      </div>

      {/* Inventory */}
      <InventoryTable items={MOCK_INVENTORY_ITEMS} onManageAll={() => setActiveNav("Inventory")} />

      {/* Recent Activity + Alerts */}
      <div className="flex flex-col lg:flex-row gap-4">
        <RecentActivity activities={MOCK_ACTIVITY} onViewAll={() => {}} />
        <Alerts         alerts={MOCK_ALERTS}       onViewAll={() => {}} />
      </div>

      {/* Footer */}
      <div className="flex flex-wrap justify-between items-center pt-2 text-xs text-neutral-400 border-t border-neutral-100 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          SYSTEM STATUS: OPTIMAL
          <span className="ml-4">LAST BACKUP: 14M AGO</span>
        </div>
        <span>© 2024 Rotem Industrial SRS Command Center • Version 1.0</span>
      </div>

    </div>
  );
}
