import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { cleanPrfNumber } from '../services/prfService'

// The official SRS-PRC-P01-F04 form is shipped as a template and filled in place,
// so page size, margins, logo, header/footer, fonts, borders and colours stay
// identical to the controlled document.
const TEMPLATE_URL = '/templates/PRF_Template.docx'

const NS = {
  w:   'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  r:   'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp:  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a:   'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
}
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'

// Table order in the template body
const T_TOP = 0, T_CATEGORY = 1, T_ITEMS = 2, T_DELIVERY = 3, T_CONTACT = 4, T_NOTES = 5, T_APPROVAL = 6
const MIN_ITEM_ROWS = 7
const EMU_PER_INCH = 914400
const NOTES_IMAGE_MAX_H = 1.0  // inches
const SIGNATURE_MAX_H = 0.38   // inches

// Template label → system category value (system spells some labels differently)
const CATEGORY_ALIASES = {
  'componentsandparts':     ['Components and Parts'],
  'safetyequipment':        ['Safety Equipment'],
  'consumables':            ['Consumables'],
  'officesupplyfurniture':  ['Office Supply / Furniture'],
  'toolsandequipment':      ['Tools and Equipment'],
  'itequipment':            ['IT Equipment'],
  'electronics':            ['Electronics'],
  'others':                 ['Others'],
}
const normalize = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// dd/mm/yyyy — same format the form footer uses for its revision date
const fmtDate = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return String(d)
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${dt.getFullYear()}`
}

// ── XML helpers ─────────────────────────────────────────────────────────────
const wEl  = (doc, name) => doc.createElementNS(NS.w, `w:${name}`)
const kids = (el, name) => Array.from(el.childNodes).filter(n => n.namespaceURI === NS.w && n.localName === name)
const kid  = (el, name) => kids(el, name)[0] || null
const setW = (el, attr, val) => el.setAttributeNS(NS.w, `w:${attr}`, String(val))

function ensure(doc, parent, name, before = []) {
  let el = kid(parent, name)
  if (el) return el
  el = wEl(doc, name)
  const anchor = Array.from(parent.childNodes).find(n => before.includes(n.localName))
  parent.insertBefore(el, anchor || null)
  return el
}

// Run properties for new text: copy the paragraph-mark formatting so filled text
// uses exactly the font/size the form defines for that cell.
function runPropsFrom(p, overrides = {}) {
  const pPr = kid(p, 'pPr')
  const markRPr = pPr && kid(pPr, 'rPr')
  const rPr = markRPr ? markRPr.cloneNode(true) : wEl(p.ownerDocument, 'rPr')
  const doc = p.ownerDocument
  if (overrides.bold === false) { kids(rPr, 'b').forEach(n => n.remove()); kids(rPr, 'bCs').forEach(n => n.remove()) }
  if (overrides.bold === true && !kid(rPr, 'b')) { rPr.insertBefore(wEl(doc, 'bCs'), rPr.firstChild); rPr.insertBefore(wEl(doc, 'b'), rPr.firstChild) }
  if (overrides.size) {
    kids(rPr, 'sz').forEach(n => n.remove()); kids(rPr, 'szCs').forEach(n => n.remove())
    const sz = wEl(doc, 'sz'); setW(sz, 'val', overrides.size)
    const szCs = wEl(doc, 'szCs'); setW(szCs, 'val', overrides.size)
    rPr.appendChild(sz); rPr.appendChild(szCs)
  }
  kids(rPr, 'rtl').forEach(n => n.remove())
  return rPr
}

function textRun(doc, rPr, text) {
  const r = wEl(doc, 'r')
  r.appendChild(rPr.cloneNode(true))
  const t = wEl(doc, 't')
  t.setAttribute('xml:space', 'preserve')
  t.textContent = text
  r.appendChild(t)
  return r
}

function clearRuns(p) {
  Array.from(p.childNodes).forEach(n => { if (n.localName !== 'pPr') n.remove() })
}

function setSpacing(p, { before, after, line } = {}) {
  const doc = p.ownerDocument
  const pPr = ensure(doc, p, 'pPr')
  const sp = ensure(doc, pPr, 'spacing', ['ind', 'jc', 'rPr'])
  if (before !== undefined) setW(sp, 'before', before)
  if (after !== undefined) setW(sp, 'after', after)
  if (line !== undefined) { setW(sp, 'line', line); setW(sp, 'lineRule', 'auto') }
}

function setAlign(p, val) {
  const doc = p.ownerDocument
  const pPr = ensure(doc, p, 'pPr')
  const jc = ensure(doc, pPr, 'jc', ['rPr'])
  setW(jc, 'val', val)
}

// Write (possibly multi-line) text into a cell, reusing the cell's own paragraph
// formatting. Long unbroken strings wrap inside the cell because every filled
// table uses a fixed layout.
function setCellText(tc, text, opts = {}) {
  const doc = tc.ownerDocument
  const paras = kids(tc, 'p')
  const proto = paras[0]
  paras.slice(1).forEach(p => p.remove())
  const lines = String(text ?? '').split(/\r?\n/)
  const rPr = runPropsFrom(proto, opts)
  lines.forEach((line, i) => {
    const p = i === 0 ? proto : proto.cloneNode(true)
    clearRuns(p)
    if (opts.align) setAlign(p, opts.align)
    if (line) p.appendChild(textRun(doc, rPr, line))
    if (i > 0) tc.appendChild(p)
  })
  return proto
}

function fixLayout(tbl) {
  const doc = tbl.ownerDocument
  const tblPr = kid(tbl, 'tblPr')
  if (!tblPr || kid(tblPr, 'tblLayout')) return
  const layout = wEl(doc, 'tblLayout'); setW(layout, 'type', 'fixed')
  const before = Array.from(tblPr.childNodes).find(n => ['tblCellMar', 'tblLook', 'tblCaption'].includes(n.localName))
  tblPr.insertBefore(layout, before || null)
}

// Keep a whole table on one page (Word's "keep with next" on every row but the last)
function keepTogether(tbl) {
  const doc = tbl.ownerDocument
  const rows = kids(tbl, 'tr')
  rows.forEach((tr, i) => {
    markRow(tr, { cantSplit: true })
    if (i === rows.length - 1) return
    kids(tr, 'tc').forEach(tc => kids(tc, 'p').forEach(p => {
      const pPr = ensure(doc, p, 'pPr')
      if (kid(pPr, 'keepNext')) return
      const style = kid(pPr, 'pStyle')
      pPr.insertBefore(wEl(doc, 'keepNext'), style ? style.nextSibling : pPr.firstChild)
    }))
  })
}

function markRow(tr, { header = false, cantSplit = false } = {}) {
  const doc = tr.ownerDocument
  const trPr = ensure(doc, tr, 'trPr', ['tc'])
  if (cantSplit && !kid(trPr, 'cantSplit')) trPr.insertBefore(wEl(doc, 'cantSplit'), trPr.firstChild)
  if (header && !kid(trPr, 'tblHeader')) trPr.appendChild(wEl(doc, 'tblHeader'))
}

// ── Images ──────────────────────────────────────────────────────────────────
function decodeDataUri(uri) {
  if (!uri || typeof uri !== 'string') return null
  const m = uri.match(/^data:image\/(png|jpe?g|gif);base64,(.+)$/i)
  const ext = m ? m[1].toLowerCase().replace('jpg', 'jpeg') : 'png'
  const b64 = m ? m[2] : uri
  try {
    const raw = atob(b64)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    return { bytes, ext, uri: m ? uri : `data:image/png;base64,${uri}` }
  } catch {
    return null
  }
}

function naturalSize(uri) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
    img.onerror = () => resolve(null)
    img.src = uri
  })
}

class ImageStore {
  constructor(zip, relsDoc) {
    this.zip = zip
    this.relsDoc = relsDoc
    this.seq = 0
    this.docPrId = 1000
  }

  // Returns a <w:r> holding the picture scaled to fit maxW×maxH inches.
  async run(doc, dataUri, maxWIn, maxHIn) {
    const img = decodeDataUri(dataUri)
    if (!img) return null
    const size = await naturalSize(img.uri)
    if (!size) return null
    const scale = Math.min(maxWIn / size.w, maxHIn / size.h)
    const cx = Math.round(size.w * scale * EMU_PER_INCH)
    const cy = Math.round(size.h * scale * EMU_PER_INCH)

    this.seq += 1
    const target = `media/prf_image${this.seq}.${img.ext}`
    this.zip.file(`word/${target}`, img.bytes)
    const rId = `rIdPrfImg${this.seq}`
    const rel = this.relsDoc.createElementNS(NS.rel, 'Relationship')
    rel.setAttribute('Id', rId)
    rel.setAttribute('Type', IMAGE_REL)
    rel.setAttribute('Target', target)
    this.relsDoc.documentElement.appendChild(rel)

    const id = ++this.docPrId
    const xml =
      `<w:r xmlns:w="${NS.w}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}" xmlns:r="${NS.r}">` +
        `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
          `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
          `<wp:docPr id="${id}" name="PRF Image ${id}"/>` +
          `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
          `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
            `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="prf_image${this.seq}.${img.ext}"/><pic:cNvPicPr/></pic:nvPicPr>` +
            `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
            `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
            `</pic:pic>` +
          `</a:graphicData></a:graphic>` +
        `</wp:inline></w:drawing></w:r>`
    const frag = new DOMParser().parseFromString(xml, 'application/xml')
    return doc.importNode(frag.documentElement, true)
  }
}

// ── Section fillers ─────────────────────────────────────────────────────────
function fillTopInfo(tbl, prf) {
  const row = kids(tbl, 'tr')[1]
  const [num, date, by] = kids(row, 'tc')
  setCellText(num,  cleanPrfNumber(prf?.prf_number), { bold: true })
  setCellText(date, fmtDate(prf?.date))
  setCellText(by,   prf?.requester?.name ?? '')
}

function fillCategories(tbl, prf) {
  const selected = new Set((Array.isArray(prf?.material_category) ? prf.material_category : []).map(normalize))
  Array.from(tbl.getElementsByTagNameNS(NS.w, 'sdt')).forEach(sdt => {
    const p = sdt.parentNode
    const label = Array.from(p.getElementsByTagNameNS(NS.w, 't'))
      .filter(t => !sdt.contains(t))
      .map(t => t.textContent).join('')
      .split(':')[0]
    const key = normalize(label)
    const aliases = CATEGORY_ALIASES[key] || [label]
    const on = aliases.some(a => selected.has(normalize(a)))

    const checked = sdt.getElementsByTagNameNS(NS.w14, 'checked')[0]
    if (checked) checked.setAttributeNS(NS.w14, 'w14:val', on ? '1' : '0')
    const glyph = sdt.getElementsByTagNameNS(NS.w, 't')[0]
    if (glyph) glyph.textContent = on ? '☒' : '☐'
  })
}

function fillItems(tbl, prf) {
  const rows = kids(tbl, 'tr')
  const [banner, header, ...blank] = rows
  const proto = blank[0]
  blank.forEach(r => r.remove())

  markRow(banner, { header: true, cantSplit: true })
  markRow(header, { header: true, cantSplit: true })

  const items = Array.isArray(prf?.items) ? prf.items : []
  const total = Math.max(MIN_ITEM_ROWS, items.length)
  for (let i = 0; i < total; i++) {
    const tr = proto.cloneNode(true)
    markRow(tr, { cantSplit: true })
    const it = items[i]
    const cells = kids(tr, 'tc')
    const values = it ? [
      String(it.sn ?? i + 1),
      it.description ?? '',
      it.technical_specifications ?? '',
      it.quantity ?? '',
      it.unit ?? '',
      it.ehs_requirements ?? '',
      fmtDate(it.required_by_date),
    ] : [String(i + 1), '', '', '', '', '', '']
    values.forEach((v, c) => cells[c] && setCellText(cells[c], v))
    tbl.appendChild(tr)
  }
}

function fillDelivery(tbl, prf) {
  const [loc, contact] = kids(kids(tbl, 'tr')[2], 'tc')
  setCellText(loc,     prf?.delivery_location ?? '')
  setCellText(contact, prf?.delivery_contact ?? '')
}

function fillContact(tbl, prf) {
  const [name, phone, email] = kids(kids(tbl, 'tr')[2], 'tc')
  setCellText(name,  prf?.requester?.name ?? '')
  setCellText(phone, prf?.requester_phone ?? '')
  setCellText(email, prf?.requester_email ?? prf?.requester?.email ?? '')
}

async function fillNotes(tbl, prf, images) {
  const doc = tbl.ownerDocument
  const tc = kids(kids(tbl, 'tr')[1], 'tc')[0]
  setCellText(tc, prf?.notes ?? '')
  const tcPr = kid(tc, 'tcPr')
  const vAlign = tcPr && kid(tcPr, 'vAlign')
  if (prf?.notes && vAlign) setW(vAlign, 'val', 'top')

  if (prf?.notes_image) {
    // Height capped so a fully-signed PRF with an attachment still fits on one page
    const run = await images.run(doc, prf.notes_image, 6.9, NOTES_IMAGE_MAX_H)
    if (run) {
      const proto = kids(tc, 'p')[0]
      const p = proto.cloneNode(true)
      clearRuns(p)
      setAlign(p, 'center')
      setSpacing(p, { before: 60, after: 60 })
      p.appendChild(run)
      tc.appendChild(p)
      if (vAlign) setW(vAlign, 'val', 'top')
    }
  }
}

async function fillApprovals(tbl, prf, images) {
  const doc = tbl.ownerDocument
  const approvals = Array.isArray(prf?.approvals) ? prf.approvals : []
  const approved = (...roles) => {
    for (const role of roles) {
      const a = approvals.find(x => x.role === role && x.action === 'approved')
      if (a) return a
    }
    return null
  }
  const proc  = approved('procurement')
  const ehs   = approved('ehs_manager', 'ehs')
  const depot = approved('depot_manager')

  // Requester → Procurement Specialist → EHS Manager → Depot Manager
  const slots = [
    { sig: prf?.requester?.e_signature, name: prf?.requester?.name, date: prf?.created_at ?? prf?.date },
    { sig: proc?.approver?.e_signature,  name: proc?.approver?.name,  date: proc?.acted_at },
    { sig: ehs?.approver?.e_signature,   name: ehs?.approver?.name,   date: ehs?.acted_at },
    { sig: depot?.approver?.e_signature, name: depot?.approver?.name, date: depot?.acted_at },
  ]
  const cells = kids(kids(tbl, 'tr')[2], 'tc')

  for (let i = 0; i < cells.length; i++) {
    const tc = cells[i]
    const s = slots[i] || {}
    const proto = kids(tc, 'p')[0]
    kids(tc, 'p').slice(1).forEach(p => p.remove())
    if (!s.name && !s.sig) continue

    const blocks = []

    // Column is 1.83in wide; keep the signature inside the cell padding
    const sigRun = s.sig ? await images.run(doc, s.sig, 1.5, SIGNATURE_MAX_H) : null
    if (sigRun) {
      const p = proto.cloneNode(true); clearRuns(p)
      setAlign(p, 'center'); setSpacing(p, { before: 40, after: 0, line: 240 })
      p.appendChild(sigRun)
      blocks.push(p)
    }
    if (s.name) {
      const p = proto.cloneNode(true); clearRuns(p)
      setAlign(p, 'center'); setSpacing(p, { before: sigRun ? 0 : 40, after: 0, line: 240 })
      p.appendChild(textRun(doc, runPropsFrom(proto, { size: 18 }), s.name))
      blocks.push(p)
    }
    if (s.date) {
      const p = proto.cloneNode(true); clearRuns(p)
      setAlign(p, 'center'); setSpacing(p, { before: 0, after: 40, line: 240 })
      p.appendChild(textRun(doc, runPropsFrom(proto, { size: 16 }), fmtDate(s.date)))
      blocks.push(p)
    }
    if (!blocks.length) continue
    proto.replaceWith(blocks[0])
    blocks.slice(1).forEach(b => tc.appendChild(b))
  }
}

// The template ends with three empty paragraphs after the approval table. They are
// invisible but can push a full form onto a blank second page, so keep a single
// minimal one (Word requires a paragraph after a table).
function trimTrailingParagraphs(body, lastTable) {
  const doc = body.ownerDocument
  const after = []
  for (let n = lastTable.nextSibling; n; n = n.nextSibling) {
    if (n.namespaceURI === NS.w && n.localName === 'p') after.push(n)
  }
  after.slice(1).forEach(p => p.remove())
  const last = after[0]
  if (!last) return
  clearRuns(last)
  setSpacing(last, { before: 0, after: 0, line: 240 })
  const pPr = kid(last, 'pPr')
  kids(pPr, 'rPr').forEach(n => n.remove())
  const rPr = wEl(doc, 'rPr')
  const sz = wEl(doc, 'sz'); setW(sz, 'val', 2)
  const szCs = wEl(doc, 'szCs'); setW(szCs, 'val', 2)
  rPr.appendChild(sz); rPr.appendChild(szCs)
  pPr.appendChild(rPr)
}

// ── main export ─────────────────────────────────────────────────────────────
export async function buildPrfDocx(prf, templateBytes) {
  const zip = await JSZip.loadAsync(templateBytes)
  const parser = new DOMParser()
  const docXml = await zip.file('word/document.xml').async('string')
  const relXml = await zip.file('word/_rels/document.xml.rels').async('string')
  const doc  = parser.parseFromString(docXml, 'application/xml')
  const rels = parser.parseFromString(relXml, 'application/xml')

  const body = doc.getElementsByTagNameNS(NS.w, 'body')[0]
  const tables = kids(body, 'tbl')
  if (tables.length < 7) throw new Error('PRF template is missing expected tables')
  tables.forEach(fixLayout)

  const images = new ImageStore(zip, rels)
  fillTopInfo(tables[T_TOP], prf)
  fillCategories(tables[T_CATEGORY], prf)
  fillItems(tables[T_ITEMS], prf)
  fillDelivery(tables[T_DELIVERY], prf)
  fillContact(tables[T_CONTACT], prf)
  await fillNotes(tables[T_NOTES], prf, images)
  await fillApprovals(tables[T_APPROVAL], prf, images)
  ;[T_TOP, T_CATEGORY, T_DELIVERY, T_CONTACT, T_NOTES, T_APPROVAL].forEach(i => keepTogether(tables[i]))
  trimTrailingParagraphs(body, tables[T_APPROVAL])

  const ser = new XMLSerializer()
  zip.file('word/document.xml', ser.serializeToString(doc))
  zip.file('word/_rels/document.xml.rels', ser.serializeToString(rels))

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  })
}

export async function generatePRF(prf) {
  const res = await fetch(TEMPLATE_URL)
  if (!res.ok) throw new Error('PRF template not found')
  const blob = await buildPrfDocx(prf, await res.arrayBuffer())
  saveAs(blob, `${cleanPrfNumber(prf?.prf_number) || 'PRF'}.docx`)
}
