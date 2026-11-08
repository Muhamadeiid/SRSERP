import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Copy, Layers, Pause, Play, Search } from 'lucide-react'
import ExplodedViewer from '../components/inventory/ExplodedViewer'
import { CATALOGUE, SAMPLE_STOCK } from '../data/partsCatalogue'

const findFigure = id => {
  for (const system of CATALOGUE) {
    for (const subsystem of system.subsystems) {
      const figure = subsystem.children.find(child => child.id === id)
      if (figure) return { system, subsystem, figure }
    }
  }
  return null
}

function StockBadge({ partNumber }) {
  const stock = SAMPLE_STOCK[partNumber]
  if (!stock) return <span className="text-xs text-neutral-400">—</span>
  return stock.onHand > 0
    ? <span className="inline-flex rounded-md bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">{stock.onHand} in stock</span>
    : <span className="inline-flex rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Out of stock</span>
}

export default function PartsCataloguePage() {
  const [figureId, setFigureId] = useState('cylinder-head')
  const [explode, setExplode] = useState(0)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState('')
  const animation = useRef(null)
  const { system, subsystem, figure } = findFigure(figureId)

  const animateTo = target => {
    cancelAnimationFrame(animation.current)
    const from = explode
    const started = performance.now()
    const step = now => {
      const p = Math.min(1, (now - started) / 1400)
      const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      setExplode(from + (target - from) * eased)
      if (p < 1) animation.current = requestAnimationFrame(step)
    }
    animation.current = requestAnimationFrame(step)
  }
  useEffect(() => () => cancelAnimationFrame(animation.current), [])

  const select = item => {
    setSelected(item)
    if (explode < 0.6) animateTo(1)
  }

  const items = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return figure.items
    return figure.items.filter(row =>
      row.partNumber.toLowerCase().includes(term)
      || row.description.toLowerCase().includes(term)
      || String(row.item) === term)
  }, [figure, query])

  const searchSubmit = event => {
    event.preventDefault()
    if (items.length === 1) select(items[0].item)
  }

  const current = figure.items.find(row => row.item === selected)
  const stock = current ? SAMPLE_STOCK[current.partNumber] : null
  const copy = text => {
    navigator.clipboard?.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(''), 1500)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-secondary">Parts Catalogue</h1>
          <p className="text-sm text-neutral-500">Find a spare part on its assembly drawing, then check its stock.</p>
        </div>
        <span className="rounded-md bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">Trial: stock figures are sample values</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-neutral-200 bg-white p-3">
          <p className="mb-2 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-400"><BookOpen className="h-3.5 w-3.5" />Systems</p>
          {CATALOGUE.map(sys => (
            <div key={sys.id}>
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-secondary"><ChevronDown className="h-4 w-4 text-neutral-400" />{sys.name}</div>
              {sys.subsystems.map(sub => (
                <div key={sub.id} className="ml-4 border-l border-neutral-100 pl-2">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-neutral-600"><ChevronDown className="h-3.5 w-3.5 text-neutral-400" />{sub.name}<span className="ml-auto text-[11px] text-neutral-400">{sub.figure}</span></div>
                  {sub.children.map(child => (
                    <button key={child.id} type="button" onClick={() => { setFigureId(child.id); setSelected(null) }}
                      className={`ml-4 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm ${child.id === figureId ? 'bg-primary-50 font-semibold text-primary' : 'text-neutral-600 hover:bg-neutral-50'}`}>
                      <Layers className="h-3.5 w-3.5" />{child.name}<span className="ml-auto text-[11px] text-neutral-400">{child.figure}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
          <p className="mt-3 border-t border-neutral-100 px-2 pt-3 text-xs text-neutral-400">More systems are added as their figures are prepared.</p>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-neutral-500">
              <span>Ch. {system.chapter} · {system.name}</span><ChevronRight className="h-3.5 w-3.5" />
              <span>{subsystem.name}</span><ChevronRight className="h-3.5 w-3.5" />
              <span className="font-semibold text-secondary">Figure {figure.figure} · {figure.name}</span>
              <span className="ml-auto text-xs text-neutral-400">Assembly {figure.assembly.partNumber} · HRC {figure.assembly.hrc}</span>
            </div>
            <ExplodedViewer buildModel={figure.buildModel} explode={explode} selected={selected} onSelect={select} />
            <div className="mt-3 flex items-center gap-3 text-sm text-neutral-500">
              <span>Assembled</span>
              <input type="range" min="0" max="100" step="1" value={Math.round(explode * 100)}
                onChange={event => { cancelAnimationFrame(animation.current); setExplode(Number(event.target.value) / 100) }}
                className="flex-1 accent-primary" aria-label="Take the assembly apart" />
              <span>Exploded</span>
              <button type="button" onClick={() => animateTo(explode > 0.5 ? 0 : 1)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600">
                {explode > 0.5 ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{explode > 0.5 ? 'Put back' : 'Take apart'}
              </button>
            </div>
          </div>

          {current && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-100 bg-primary-50/50 px-4 py-3">
              <div>
                <p className="text-base font-bold text-secondary">Item {current.item} · {current.description}</p>
                <p className="mt-0.5 flex items-center gap-2 text-sm text-neutral-600">
                  Part no. <span className="font-mono font-semibold text-secondary">{current.partNumber}</span>
                  <button type="button" onClick={() => copy(current.partNumber)} className="rounded p-1 text-neutral-400 hover:bg-white hover:text-primary" aria-label="Copy part number"><Copy className="h-3.5 w-3.5" /></button>
                  {copied === current.partNumber && <span className="text-xs text-green-700">Copied</span>}
                  · {current.supplier} · {current.qty} per assembly
                </p>
              </div>
              <div className="text-right">
                <StockBadge partNumber={current.partNumber} />
                {stock && <p className="mt-1 text-xs text-neutral-500">{stock.location}</p>}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-neutral-200 bg-white">
            <form onSubmit={searchSubmit} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 p-3">
              <p className="mr-auto text-sm font-semibold text-secondary">Table {figure.figure} · {figure.name}</p>
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Part number or name"
                  className="h-9 w-64 rounded-md border border-neutral-200 pl-8 pr-3 text-sm focus:border-primary focus:outline-none" />
              </label>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                  <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Part number</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Supplier</th><th className="px-3 py-2">Stock</th></tr>
                </thead>
                <tbody>
                  {items.map(row => (
                    <tr key={row.item} onClick={() => select(row.item)}
                      className={`cursor-pointer border-t border-neutral-100 ${row.item === selected ? 'bg-primary-50' : 'hover:bg-neutral-50'}`}>
                      <td className="px-3 py-2 font-semibold text-secondary">{row.item}</td>
                      <td className="px-3 py-2">{row.description}</td>
                      <td className="px-3 py-2 font-mono">{row.partNumber}</td>
                      <td className="px-3 py-2">{row.qty}</td>
                      <td className="px-3 py-2 text-neutral-500">{row.supplier}</td>
                      <td className="px-3 py-2"><StockBadge partNumber={row.partNumber} /></td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-400">No part matches “{query}” in this figure.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
