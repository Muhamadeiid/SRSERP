import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/dashboard/Sidebar'
import TopBar  from '../components/dashboard/TopBar'
import { useSidebar } from '../hooks/useSidebar'

const HR_ROUTES = ['/human-resources']

export default function MainLayout() {
  const { collapsed, setCollapsed, sidebarW, isMobile } = useSidebar()
  const location = useLocation()

  const isHRRoute = HR_ROUTES.some(r => location.pathname.startsWith(r))

  if (isHRRoute) return <Outlet />

  return (
    <div className="font-sans bg-neutral-50 min-h-screen overflow-x-hidden">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} isMobile={isMobile} />
      <TopBar
        sidebarW={sidebarW}
        isMobile={isMobile}
        onMenuClick={() => setCollapsed(prev => !prev)}
      />
      <main
        className="pt-[60px] transition-all duration-200 min-w-0"
        style={{ marginLeft: isMobile ? 0 : sidebarW }}
      >
        <Outlet />
      </main>
    </div>
  )
}
