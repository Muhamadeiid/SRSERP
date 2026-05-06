import { useEffect, useState } from 'react'
 
// Hook مشترك لإدارة حالة الـ Sidebar
// نستخدمه في كل صفحة عشان الـ layout يتمد مع الـ Sidebar
 
export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 1024
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const onResize = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      setCollapsed(prev => (mobile ? true : prev))
    }

    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const sidebarW = isMobile ? '0px' : (collapsed ? '68px' : '230px')

  return { collapsed, setCollapsed, sidebarW, isMobile }
}
