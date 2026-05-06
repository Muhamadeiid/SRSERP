import { useDispatch, useSelector } from 'react-redux'
import { closeModal } from '../../store/slices/appSlice'
import { X } from 'lucide-react'

export default function Modal() {
  const dispatch = useDispatch()
  const modal = useSelector((state) => state.app.modal)

  if (!modal) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,20,40,0.45)]"
      onClick={() => dispatch(closeModal())}
    >
      <div
        className="bg-white rounded-xl w-[380px] shadow-2xl overflow-hidden animate-[slideUp_0.2s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }`}</style>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e2e4ea]">
          <div className="w-9 h-9 bg-[#fffbeb] rounded-lg flex items-center justify-center text-lg">🚧</div>
          <div>
            <p className="text-sm font-semibold text-[#1a1f36]">{modal}</p>
            <p className="text-xs text-[#8892ab] mt-0.5">Under development</p>
          </div>
          <button onClick={() => dispatch(closeModal())} className="ml-auto w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#f4f5f7] text-[#8892ab] hover:text-[#1a1f36] transition-all">
            <X size={14} />
          </button>
        </div>
        <p className="px-5 py-4 text-[13px] text-[#4a5073] leading-relaxed">
          This module is currently under development and will be available in the next release. All existing data and configurations will be ready on launch.
        </p>
        <div className="flex gap-2 justify-end px-5 py-3 border-t border-[#e2e4ea]">
          <button onClick={() => dispatch(closeModal())} className="px-4 py-2 text-[13px] font-medium rounded-lg bg-[#f4f5f7] text-[#4a5073] border border-[#e2e4ea] hover:bg-[#e8eaf0] transition-all">Close</button>
          <button onClick={() => dispatch(closeModal())} className="px-4 py-2 text-[13px] font-medium rounded-lg bg-[#1e2d5a] text-white hover:bg-[#253468] transition-all">Got it</button>
        </div>
      </div>
    </div>
  )
}