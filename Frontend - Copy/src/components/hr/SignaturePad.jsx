import { useRef, useEffect, useState } from 'react'
import { RotateCcw, Upload, Check } from 'lucide-react'

export default function SignaturePad({ onSave, initialSignature = null, readOnly = false, label = 'Draw signature here' }) {
  const canvasRef  = useRef(null)
  const drawing    = useRef(false)
  const lastPos    = useRef({ x: 0, y: 0 })
  const [dirty, setDirty]     = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (initialSignature) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      img.src    = initialSignature
    }
  }, [initialSignature])

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = canvasRef.current.width  / rect.width
    const scaleY = canvasRef.current.height / rect.height
    const src    = e.touches ? e.touches[0] : e
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    }
  }

  const startDraw = (e) => {
    if (readOnly) return
    drawing.current = true
    lastPos.current = getPos(e)
    setSaved(false)
  }

  const draw = (e) => {
    if (!drawing.current || readOnly) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.beginPath()
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth   = 1.8
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    setDirty(true)
  }

  const stopDraw = () => { drawing.current = false }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setDirty(false)
    setSaved(false)
  }

  const save = async () => {
    const dataURL = canvasRef.current.toDataURL('image/png')
    await onSave?.(dataURL)
    setSaved(true)
    setDirty(false)
  }

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        const ctx    = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        // Scale to fit canvas keeping aspect ratio
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height)
        const w = img.width  * scale
        const h = img.height * scale
        const x = (canvas.width  - w) / 2
        const y = (canvas.height - h) / 2
        ctx.drawImage(img, x, y, w, h)
        setDirty(true)
        setSaved(false)
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-xs text-neutral-400">{label}</p>}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={420} height={110}
          className={`w-full rounded-xl border-2 bg-white touch-none ${
            readOnly
              ? 'border-neutral-100 cursor-default'
              : 'border-dashed border-neutral-300 cursor-crosshair hover:border-primary/40 transition-colors'
          }`}
          style={{ height: 110 }}
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={stopDraw}
          onPointerLeave={stopDraw}
        />
        {!initialSignature && !dirty && !readOnly && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-300 pointer-events-none select-none">
            ✍️ {label}
          </span>
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={clear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-neutral-200 rounded-lg hover:bg-neutral-50 text-neutral-500 transition-colors">
            <RotateCcw className="w-3 h-3" /> Clear
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-neutral-200 rounded-lg hover:bg-neutral-50 text-neutral-500 cursor-pointer transition-colors">
            <Upload className="w-3 h-3" /> Upload
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>
          <button type="button" onClick={save} disabled={!dirty && !initialSignature}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              saved
                ? 'bg-green-600 text-white'
                : 'bg-primary text-white hover:bg-primary/90 disabled:opacity-40'
            }`}>
            <Check className="w-3 h-3" />
            {saved ? 'Saved!' : 'Save Signature'}
          </button>
        </div>
      )}
    </div>
  )
}
