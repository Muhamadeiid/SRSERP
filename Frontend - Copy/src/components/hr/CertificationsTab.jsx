// src/components/HR/CertificationsTab.jsx
import { ShieldCheck } from 'lucide-react'

export default function CertificationsTab() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-white border border-neutral-100 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldCheck className="w-6 h-6 text-primary" />
        </div>
        <p className="text-sm font-semibold text-secondary-700">Certifications</p>
        <p className="text-xs text-neutral-400 mt-1">Coming soon</p>
      </div>
    </div>
  )
}
