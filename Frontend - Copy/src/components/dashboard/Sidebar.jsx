import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "../../store/slices/authSlice";

export default function Sidebar({ collapsed: collapsedProp, setCollapsed: setCollapsedProp, isMobile = false } = {}) {
  const [collapsedLocal, setCollapsedLocal] = useState(false);
  const collapsed    = collapsedProp    !== undefined ? collapsedProp    : collapsedLocal
  const setCollapsed = setCollapsedProp !== undefined ? setCollapsedProp : setCollapsedLocal
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const handleLogout = () => { dispatch(logout()); navigate('/login') }

  const role       = user?.role ?? 'staff'
  const dept       = user?.department ?? ''
  const isDashFull = ['admin', 'depot_manager'].includes(role)
  const isProcFull = ['admin', 'depot_manager', 'purchasing'].includes(role)
  const isHRFull   = ['admin', 'depot_manager', 'hr'].includes(role)

  const navItems = [
    {
      label: "Dashboard",
      path: "/",
      exact: true,
      show: true,
      icon: (
        <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      label: "Human Resources",
      path: "/human-resources",
      show: isHRFull,
      icon: (
        <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-2-3.46" />
        </svg>
      ),
    },
    {
      label: "Maintenance",
      path: "/maintenance",
      show: role === 'admin',
      icon: (
        <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: "Inventory",
      path: "/inventory",
      show: isDashFull,
      icon: (
        <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      label: "Control",
      path: "/control",
      show: isDashFull,
      icon: (
        <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
    },
    {
      label: "Leave Requests",
      path: "/human-resources/leave",
      show: true,
      icon: (
        <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: isProcFull ? "Procurement" : "New PRF",
      path: isProcFull ? "/procurement" : "/procurement/new",
      show: true,
      icon: (
        <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
  ].filter(item => item.show)

  const sidebarWidth = collapsed ? "w-[68px]" : "w-[230px]";
  const sidebarVisible = !isMobile || !collapsed;

  return (
    <>
      {/* ── Mobile overlay ── */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 lg:hidden transition-opacity duration-200 ${
          sidebarVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setCollapsed(true)}
      />

      <aside
        className={`fixed top-0 left-0 bottom-0 bg-white border-r border-neutral-100 flex flex-col justify-between z-50 transition-all duration-200 ${sidebarWidth} ${isMobile && !sidebarVisible ? "-translate-x-full" : "translate-x-0"}`}
      >
        {/* ── Logo ── */}
        <div>
          <div className="flex items-center gap-3 px-4 py-5 border-b border-neutral-100 min-h-[64px] overflow-hidden">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="shrink-0 hover:opacity-80 transition-opacity"
            >
              <img src="/logo.png" alt="Rotem SRS Egypt" className={`transition-all duration-200 ${collapsed ? 'h-8 w-8 object-cover object-left' : 'h-10 w-auto'} object-contain`} />
            </button>

            <div
              className={`flex flex-col leading-tight overflow-hidden transition-all duration-200 ${
                collapsed ? "w-0 opacity-0" : "w-full opacity-100"
              }`}
            >
              <span className="text-[10px] text-neutral-400 tracking-widest uppercase whitespace-nowrap mt-0.5">
                Industrial Operations
              </span>
            </div>
          </div>

          {/* ── Nav ── */}
          <nav className="p-2 space-y-0.5 mt-1">
            {navItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.path}
                end={item.exact}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) => `
                  relative w-full flex items-center rounded-lg text-sm font-medium
                  transition-all duration-150 cursor-pointer no-underline
                  ${collapsed ? "justify-center px-0 py-3" : "gap-2.5 px-3 py-2.5"}
                  ${isActive
                    ? "bg-primary-50 text-primary font-bold"
                    : "text-secondary hover:bg-neutral-50"
                  }
                `}
              >
                {item.icon}

                <span
                  className={`flex-1 text-left whitespace-nowrap transition-all duration-200 ${
                    collapsed ? "w-0 opacity-0 overflow-hidden" : "w-full opacity-100"
                  }`}
                >
                  {item.label}
                </span>

                {/* Badge — full when expanded, dot when collapsed */}
                {item.badge && !collapsed && (
                  <span className="bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
                {item.badge && collapsed && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-600 rounded-full" />
                )}
              </NavLink>
            ))}
            {/* Admin only — User Management */}
            {user?.role === 'admin' && (
              <>
                <div className={`px-3 pt-3 pb-1 ${collapsed ? 'hidden' : ''}`}>
                  <p className="text-[10px] text-neutral-300 uppercase tracking-widest font-semibold">Admin</p>
                </div>
                <NavLink
                  to="/users"
                  title={collapsed ? "User Management" : undefined}
                  className={({ isActive }) => `
                    relative w-full flex items-center rounded-lg text-sm font-medium
                    transition-all duration-150 cursor-pointer no-underline
                    ${collapsed ? "justify-center px-0 py-3" : "gap-2.5 px-3 py-2.5"}
                    ${isActive
                      ? "bg-primary-50 text-primary font-bold"
                      : "text-secondary hover:bg-neutral-50"
                    }
                  `}
                >
                  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span className={`flex-1 text-left whitespace-nowrap transition-all duration-200 ${collapsed ? "w-0 opacity-0 overflow-hidden" : "w-full opacity-100"}`}>
                    User Management
                  </span>
                </NavLink>
              </>
            )}
          </nav>
        </div>

        {/* ── Bottom: Logout ── */}
        <div className="p-2">
          <button
            onClick={handleLogout}
            title={collapsed ? "Logout" : undefined}
            className={`w-full flex items-center py-2.5 text-red-500 hover:text-white hover:bg-red-500 text-sm font-semibold rounded-lg transition-colors duration-150
              ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"}
            `}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
