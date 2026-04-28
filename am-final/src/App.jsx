import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Pencil, Check, X, Plus, RotateCcw,
  Search, Zap, CheckCircle2, LayoutGrid, Trash2, PackagePlus,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'automation_manager_v4'

function loadState() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null }
  catch { return null }
}
function saveState(payload) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)) } catch {}
}

let _uid = 700
function uid() { return _uid++ }

// ─────────────────────────────────────────────────────────────────────────────
// Defaults  (ean:'', przygotowane/doWlaczenia added — fully backward-compat)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_BRANDS = [
  {
    id: 'brand-a', name: 'Brand A',
    available: [
      { id: 1, name: 'Subskrypcja Premium',    ean: '', przygotowane: false, doWlaczenia: false },
      { id: 2, name: 'Eksport CSV bez grafik', ean: '', przygotowane: false, doWlaczenia: true  },
      { id: 3, name: 'Powiadomienia Email',    ean: '', przygotowane: true,  doWlaczenia: true  },
      { id: 4, name: 'Raport Tygodniowy',      ean: '', przygotowane: false, doWlaczenia: false },
    ],
    active: [
      { id: 101, name: 'Integracja API',    ean: '' },
      { id: 102, name: 'Backup bez grafik', ean: '' },
    ],
  },
  {
    id: 'brand-b', name: 'Brand B',
    available: [
      { id: 10, name: 'Panel Raportów bez grafik', ean: '', przygotowane: false, doWlaczenia: false },
      { id: 11, name: 'Synchronizacja danych',     ean: '', przygotowane: true,  doWlaczenia: true  },
    ],
    active: [{ id: 110, name: 'Monitoring 24/7', ean: '' }],
  },
  { id: 'brand-c', name: 'Brand C', available: [], active: [] },
  { id: 'brand-d', name: 'Brand D', available: [], active: [] },
  { id: 'brand-e', name: 'Brand E', available: [], active: [] },
]

const DEFAULT_LABELS = {
  col_name:         'Produkt',
  col_ean:          'EAN',
  col_przygotowane: 'Przygotowane',
  col_doWlaczenia:  'Do włączenia',
  col_wlaczone:     'Włączone',
  col_akcje:        'Akcje',
  col_powrot:       'Powrót',
  section1:         'Produkty do aktywacji',
  section2:         'Produkty aktywne',
}

// Special tab ID — never matches any real brand id
const ADD_TAB_ID = '__add__'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function sortAvailable(list) {
  return [...list].sort((a, b) => {
    if ((b.doWlaczenia ? 1 : 0) !== (a.doWlaczenia ? 1 : 0))
      return (b.doWlaczenia ? 1 : 0) - (a.doWlaczenia ? 1 : 0)
    if ((a.przygotowane ? 1 : 0) !== (b.przygotowane ? 1 : 0))
      return (a.przygotowane ? 1 : 0) - (b.przygotowane ? 1 : 0)
    return a.name.localeCompare(b.name, 'pl')
  })
}

function nameColorClass(p) {
  if (!p.przygotowane && p.doWlaczenia) return 'name-red'
  if (/bez grafik/i.test(p.name))       return 'name-orange'
  return ''
}

// ─────────────────────────────────────────────────────────────────────────────
// EditableLabel
// ─────────────────────────────────────────────────────────────────────────────
function EditableLabel({ value, onChange, className = '', inputW = 'w-44', tag: Tag = 'span' }) {
  const [on,    setOn]    = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef(null)

  useEffect(() => { if (on) ref.current?.select() }, [on])
  useEffect(() => { if (!on) setDraft(value) }, [value, on])

  const commit = () => { const v = draft.trim(); if (v) onChange(v); else setDraft(value); setOn(false) }
  const cancel = () => { setDraft(value); setOn(false) }
  const onKey  = e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }

  if (on) return (
    <span className="inline-flex items-center gap-1">
      <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={onKey} onBlur={commit} className={`edit-input ${inputW}`} />
      <button onClick={commit} className="icon-confirm"><Check size={12}/></button>
      <button onClick={cancel} className="icon-cancel"><X size={12}/></button>
    </span>
  )

  return (
    <span className="inline-flex items-center gap-1 group/lbl">
      <Tag className={className}>{value}</Tag>
      <button onClick={() => setOn(true)} className="edit-pencil" title="Edytuj">
        <Pencil size={10}/>
      </button>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TH — editable table header cell
// ─────────────────────────────────────────────────────────────────────────────
function TH({ label, onChange, left = false, cls = '' }) {
  return (
    <th className={`th ${left ? '' : 'text-center'} ${cls}`}>
      <EditableLabel value={label} onChange={onChange} className="th-txt" inputW="w-28"/>
    </th>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — Multi-select brand dropdown
// ─────────────────────────────────────────────────────────────────────────────
function BrandMultiSelect({ brands, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const toggle = id => onChange(
    selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
  )

  const triggerLabel = selected.length === 0
    ? 'Wybierz markę…'
    : brands.filter(b => selected.includes(b.id)).map(b => b.name).join(', ')

  return (
    <div className="bms-root" ref={ref}>
      <button type="button" className="bms-trigger" onClick={() => setOpen(o => !o)}>
        <span className="bms-trigger-label">{triggerLabel}</span>
        <span className={`bms-arrow ${open ? 'bms-arrow--open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="bms-menu">
          {brands.map(b => (
            <label key={b.id} className="bms-item">
              <input
                type="checkbox"
                className="bms-cb"
                checked={selected.includes(b.id)}
                onChange={() => toggle(b.id)}
              />
              <span className="bms-item-name">{b.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — Add Product view
// ─────────────────────────────────────────────────────────────────────────────
function AddProductView({ brands, onAddToMany }) {
  const [name,           setName]           = useState('')
  const [ean,            setEan]            = useState('')
  const [selectedBrands, setSelectedBrands] = useState([])
  const [flash,          setFlash]          = useState(null)
  const nameRef = useRef(null)

  const submit = e => {
    e.preventDefault()
    const trimName = name.trim()
    if (!trimName || selectedBrands.length === 0) return
    onAddToMany(trimName, ean.trim(), selectedBrands)
    const addedTo = brands.filter(b => selectedBrands.includes(b.id)).map(b => b.name).join(', ')
    setFlash(`"${trimName}" dodano do: ${addedTo}`)
    setName(''); setEan(''); setSelectedBrands([])
    nameRef.current?.focus()
    setTimeout(() => setFlash(null), 3500)
  }

  return (
    <div className="main">
      <div className="section apv-section">
        <div className="sec-head">
          <div className="sec-icon sec-icon--orange"><PackagePlus size={15}/></div>
          <div className="sec-head-text">
            <h2 className="sec-title">Dodaj nowy produkt</h2>
            <span className="sec-count-sub">Produkt zostanie przypisany do wybranych marek</span>
          </div>
        </div>

        <form className="apv-form" onSubmit={submit}>
          <div className="apv-row">
            <label className="apv-label">
              Nazwa produktu <span className="apv-req">*</span>
            </label>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="np. Subskrypcja Premium"
              className="add-input"
              autoFocus
            />
          </div>

          <div className="apv-row">
            <label className="apv-label">
              EAN <span className="apv-opt">(opcjonalnie)</span>
            </label>
            <input
              value={ean}
              onChange={e => setEan(e.target.value)}
              placeholder="np. 5901234567890"
              className="add-input"
            />
          </div>

          <div className="apv-row">
            <label className="apv-label">
              Marka <span className="apv-req">*</span>
            </label>
            {/* PART 3 — dropdown labelled "Marka", properly scrollable */}
            <BrandMultiSelect
              brands={brands}
              selected={selectedBrands}
              onChange={setSelectedBrands}
            />
            {selectedBrands.length > 0 && (
              <p className="apv-hint">
                {selectedBrands.length} {selectedBrands.length === 1 ? 'marka wybrana' : 'marki wybrane'}
              </p>
            )}
          </div>

          <div className="apv-actions">
            <button
              type="submit"
              className="btn-add"
              disabled={!name.trim() || selectedBrands.length === 0}
            >
              <Plus size={14}/>
              Dodaj produkt
            </button>
          </div>

          {flash && (
            <div className="apv-flash">
              <CheckCircle2 size={14}/> {flash}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — Search bar with brand filter
// ─────────────────────────────────────────────────────────────────────────────
function SearchBar({ search, setSearch, brands, filterBrands, setFilterBrands }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const toggle = id =>
    setFilterBrands(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const filterLabel = filterBrands.length === 0
    ? 'Wszystkie marki'
    : brands.filter(b => filterBrands.includes(b.id)).map(b => b.name).join(', ')

  return (
    <div className="sb-root" ref={ref}>
      {/* text search */}
      <div className="srch-wrap">
        <Search size={14} className="srch-ico"/>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Szukaj po nazwie lub EAN…"
          className="srch-inp"
        />
        {search && (
          <button onClick={() => setSearch('')} className="srch-clr"><X size={12}/></button>
        )}
      </div>

      {/* brand filter button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`sb-filter-btn ${filterBrands.length > 0 ? 'sb-filter-btn--active' : ''}`}
        title="Filtruj po marce"
      >
        <span className="sb-filter-label">{filterLabel}</span>
        {filterBrands.length > 0 && (
          <span className="sb-filter-badge">{filterBrands.length}</span>
        )}
        <span className={`bms-arrow ${open ? 'bms-arrow--open' : ''}`}>▾</span>
      </button>

      {/* brand filter dropdown — portal-like, z-index high */}
      {open && (
        <div className="sb-filter-menu">
          <label className="bms-item bms-item--all">
            <input
              type="checkbox"
              className="bms-cb"
              checked={filterBrands.length === 0}
              onChange={() => setFilterBrands([])}
            />
            <span className="bms-item-name" style={{ fontWeight: 600 }}>Wszystkie marki</span>
          </label>
          <div className="bms-divider"/>
          {brands.map(b => (
            <label key={b.id} className="bms-item">
              <input
                type="checkbox"
                className="bms-cb"
                checked={filterBrands.includes(b.id)}
                onChange={() => toggle(b.id)}
              />
              <span className="bms-item-name">{b.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — Cross-brand search results panel
// ─────────────────────────────────────────────────────────────────────────────
function SearchResultsView({ brands, search, filterBrands, labels }) {
  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    const targets = filterBrands.length > 0
      ? brands.filter(b => filterBrands.includes(b.id))
      : brands
    const rows = []
    for (const brand of targets) {
      for (const p of brand.available) {
        const nameHit = p.name.toLowerCase().includes(q)
        const eanHit  = (p.ean ?? '').trim().toLowerCase() === q
        if (nameHit || eanHit)
          rows.push({ ...p, _brandName: brand.name, _table: 'available' })
      }
      for (const p of brand.active) {
        const nameHit = p.name.toLowerCase().includes(q)
        const eanHit  = (p.ean ?? '').trim().toLowerCase() === q
        if (nameHit || eanHit)
          rows.push({ ...p, _brandName: brand.name, _table: 'active' })
      }
    }
    return rows
  }, [brands, search, filterBrands])

  if (!search.trim()) return null

  return (
    <div className="section search-section">
      <div className="sec-head">
        <div className="sec-icon sec-icon--orange"><Search size={15}/></div>
        <div className="sec-head-text">
          <h2 className="sec-title">Wyniki wyszukiwania</h2>
          <span className="sec-count-sub">
            {results.length} {results.length === 1 ? 'wynik' : 'wyników'} dla „{search}"
            {filterBrands.length > 0 && ` · ${filterBrands.length} ${filterBrands.length === 1 ? 'marka' : 'marki'}`}
          </span>
        </div>
        <span className="sec-big-num">{String(results.length).padStart(2, '0')}</span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="th" style={{ textAlign: 'left', width: 130 }}>Marka</th>
              <TH left label={labels.col_name} onChange={() => {}} cls="col-name"/>
              <TH      label={labels.col_ean}  onChange={() => {}} cls="col-ean"/>
              <th className="th" style={{ textAlign: 'left', width: 100 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr><td colSpan={4} className="empty-row">Brak wyników</td></tr>
            ) : results.map((p, i) => (
              <tr key={`${p._brandName}-${p.id}-${p._table}`}
                  className={`tr ${i % 2 ? 'tr-stripe' : ''}`}>
                <td className="td">
                  <span className="res-brand-badge">{p._brandName}</span>
                </td>
                <td className="td td-name-cell">
                  <span className={`name-dot ${p._table === 'active' ? 'dot-g' : 'dot-o'}`}/>
                  <span className={`pname ${p._table === 'available'
                    ? nameColorClass(p)
                    : /bez grafik/i.test(p.name) ? 'name-orange' : ''}`}>
                    {p.name}
                  </span>
                </td>
                <td className="td td-cb">
                  <span className="ean-display">{p.ean || '—'}</span>
                </td>
                <td className="td">
                  <span className={`res-status ${p._table === 'active' ? 'res-status--active' : 'res-status--queue'}`}>
                    {p._table === 'active' ? 'Aktywny' : 'W kolejce'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Produkty do aktywacji
// ─────────────────────────────────────────────────────────────────────────────
function Section1({ brand, labels, setLabels, search, onAdd, onToggle, onActivate, onRename, onDelete, onEanChange }) {
  const [draft,   setDraft]   = useState('')
  const [exiting, setExiting] = useState(new Set())
  const inputRef = useRef(null)

  const exit = useCallback((id, cb) => {
    setExiting(p => new Set([...p, id]))
    setTimeout(() => {
      cb(id)
      setExiting(p => { const s = new Set(p); s.delete(id); return s })
    }, 220)
  }, [])

  const add = () => {
    const v = draft.trim(); if (!v) return
    onAdd(v); setDraft(''); inputRef.current?.focus()
  }

  const sorted   = useMemo(() => sortAvailable(brand.available), [brand.available])
  const products = useMemo(() => {
    if (!search) return sorted
    const q = search.trim().toLowerCase()
    return sorted.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.ean ?? '').trim().toLowerCase() === q
    )
  }, [sorted, search])

  return (
    <div className="section">
      <div className="sec-head">
        <div className="sec-icon sec-icon--orange"><Zap size={15}/></div>
        <div className="sec-head-text">
          <EditableLabel value={labels.section1}
            onChange={v => setLabels(l => ({ ...l, section1: v }))}
            tag="h2" className="sec-title" inputW="w-56"/>
          <span className="sec-count-sub">{brand.available.length} produktów w kolejce</span>
        </div>
        <span className="sec-big-num">{String(brand.available.length).padStart(2, '0')}</span>
      </div>

      <div className="add-bar">
        <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Dodaj nowy produkt…" className="add-input"/>
        <button onClick={add} className="btn-add"><Plus size={14}/>Dodaj</button>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <TH left label={labels.col_name}
                onChange={v => setLabels(l => ({ ...l, col_name: v }))} cls="col-name"/>
              {/* PART 2 — EAN column between Produkt and Przygotowane */}
              <TH label={labels.col_ean}
                onChange={v => setLabels(l => ({ ...l, col_ean: v }))} cls="col-ean"/>
              <TH label={labels.col_przygotowane}
                onChange={v => setLabels(l => ({ ...l, col_przygotowane: v }))} cls="col-check"/>
              <TH label={labels.col_doWlaczenia}
                onChange={v => setLabels(l => ({ ...l, col_doWlaczenia: v }))} cls="col-check"/>
              <TH label={labels.col_wlaczone}
                onChange={v => setLabels(l => ({ ...l, col_wlaczone: v }))} cls="col-check th-orange"/>
              <TH label={labels.col_akcje}
                onChange={v => setLabels(l => ({ ...l, col_akcje: v }))} cls="col-actions"/>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan={6} className="empty-row">
                {search ? `Brak wyników dla „${search}"` : 'Brak produktów do aktywacji'}
              </td></tr>
            ) : products.map((p, i) => (
              <tr key={p.id}
                className={`tr ${exiting.has(p.id) ? 'tr-exit' : 'tr-enter'} ${i % 2 ? 'tr-stripe' : ''}`}>

                <td className="td td-name-cell">
                  <span className={`name-dot ${
                    !p.przygotowane && p.doWlaczenia ? 'dot-r'
                    : /bez grafik/i.test(p.name) ? 'dot-o' : 'dot-g'
                  }`}/>
                  <EditableLabel value={p.name}
                    onChange={v => onRename(p.id, v, 'available')}
                    className={`pname ${nameColorClass(p)}`} inputW="w-52"/>
                </td>

                {/* PART 2 — EAN input, optional */}
                <td className="td td-cb">
                  <input
                    type="text"
                    value={p.ean ?? ''}
                    onChange={e => onEanChange(p.id, e.target.value, 'available')}
                    placeholder="—"
                    className="ean-input"
                  />
                </td>

                <td className="td td-cb">
                  <input type="checkbox" className="cb cb-violet"
                    checked={!!p.przygotowane}
                    onChange={() => onToggle(p.id, 'przygotowane')}/>
                </td>

                <td className="td td-cb">
                  <input type="checkbox" className="cb cb-slate"
                    checked={!!p.doWlaczenia}
                    onChange={() => onToggle(p.id, 'doWlaczenia')}/>
                </td>

                <td className="td td-cb">
                  <input type="checkbox" className="cb cb-orange"
                    checked={false}
                    onChange={() => exit(p.id, onActivate)}
                    title="Aktywuj"/>
                </td>

                <td className="td td-cb">
                  <button onClick={() => exit(p.id, id => onDelete(id, 'available'))}
                    className="btn-del" title="Usuń">
                    <Trash2 size={13}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        <span className="leg leg-r">● Nieprzygotowane + Do włączenia</span>
        <span className="leg leg-o">● Zawiera "bez grafik"</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Produkty aktywne
// ─────────────────────────────────────────────────────────────────────────────
function Section2({ brand, labels, setLabels, search, onReturn, onRename, onDelete, onEanChange }) {
  const [exiting, setExiting] = useState(new Set())

  const exit = useCallback((id, cb) => {
    setExiting(p => new Set([...p, id]))
    setTimeout(() => {
      cb(id)
      setExiting(p => { const s = new Set(p); s.delete(id); return s })
    }, 220)
  }, [])

  const products = useMemo(() => {
    const list = [...brand.active].sort((a, b) => a.name.localeCompare(b.name, 'pl'))
    if (!search) return list
    const q = search.trim().toLowerCase()
    return list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.ean ?? '').trim().toLowerCase() === q
    )
  }, [brand.active, search])

  return (
    <div className="section">
      <div className="sec-head">
        <div className="sec-icon sec-icon--green"><CheckCircle2 size={15}/></div>
        <div className="sec-head-text">
          <EditableLabel value={labels.section2}
            onChange={v => setLabels(l => ({ ...l, section2: v }))}
            tag="h2" className="sec-title" inputW="w-56"/>
          <span className="sec-count-sub">{brand.active.length} produktów aktywnych</span>
        </div>
        <span className="sec-big-num">{String(brand.active.length).padStart(2, '0')}</span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <TH left label={labels.col_name}
                onChange={v => setLabels(l => ({ ...l, col_name: v }))} cls="col-name"/>
              <TH label={labels.col_ean}
                onChange={v => setLabels(l => ({ ...l, col_ean: v }))} cls="col-ean"/>
              <TH label={labels.col_powrot}
                onChange={v => setLabels(l => ({ ...l, col_powrot: v }))} cls="col-check"/>
              <TH label={labels.col_akcje}
                onChange={v => setLabels(l => ({ ...l, col_akcje: v }))} cls="col-actions"/>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan={4} className="empty-row">
                {search ? `Brak wyników dla „${search}"` : 'Brak aktywnych produktów'}
              </td></tr>
            ) : products.map((p, i) => (
              <tr key={p.id}
                className={`tr ${exiting.has(p.id) ? 'tr-exit' : 'tr-enter'} ${i % 2 ? 'tr-stripe' : ''}`}>

                <td className="td td-name-cell">
                  <span className="name-dot dot-g"/>
                  <EditableLabel value={p.name}
                    onChange={v => onRename(p.id, v, 'active')}
                    className={`pname ${/bez grafik/i.test(p.name) ? 'name-orange' : ''}`}
                    inputW="w-52"/>
                </td>

                <td className="td td-cb">
                  <input
                    type="text"
                    value={p.ean ?? ''}
                    onChange={e => onEanChange(p.id, e.target.value, 'active')}
                    placeholder="—"
                    className="ean-input"
                  />
                </td>

                <td className="td td-cb">
                  <button onClick={() => exit(p.id, onReturn)} className="btn-return">
                    <RotateCcw size={11} className="btn-return-ico"/>
                    {labels.col_powrot}
                  </button>
                </td>

                <td className="td td-cb">
                  <button onClick={() => exit(p.id, id => onDelete(id, 'active'))}
                    className="btn-del" title="Usuń">
                    <Trash2 size={13}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — Nav tabs  ("Add Product" tab is always FIRST)
// ─────────────────────────────────────────────────────────────────────────────
function NavTabs({ brands, active, onSelect, onRename }) {
  return (
    <div className="tabs-bar">
      {/* Add Product tab — pinned first */}
      <button
        onClick={() => onSelect(ADD_TAB_ID)}
        className={`tab tab--add ${active === ADD_TAB_ID ? 'tab--on' : ''}`}
      >
        <span className={`tab-letter tab-letter--add ${active === ADD_TAB_ID ? 'tab-letter--on' : ''}`}>
          <Plus size={10}/>
        </span>
        Dodaj produkt
      </button>

      {/* Brand tabs */}
      {brands.map((b, i) => {
        const on = b.id === active
        return (
          <button key={b.id} onClick={() => onSelect(b.id)}
            className={`tab ${on ? 'tab--on' : ''}`}>
            <span className={`tab-letter ${on ? 'tab-letter--on' : ''}`}>
              {String.fromCharCode(65 + i)}
            </span>
            <EditableLabel value={b.name} onChange={v => onRename(b.id, v)}
              className="tab-name" inputW="w-20"/>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// App root
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── hydrate from localStorage, backfill new fields if missing ─────────────
  const [brands, setBrands] = useState(() => {
    const s = loadState()
    if (s?.brands) return s.brands.map(b => ({
      ...b,
      available: b.available.map(p => ({ ean: '', przygotowane: false, doWlaczenia: false, ...p })),
      active:    b.active.map(p => ({ ean: '', ...p })),
    }))
    return DEFAULT_BRANDS
  })

  const [activeId, setActiveId] = useState(() => {
    const s = loadState()
    // If saved activeId is a brand that still exists, use it; otherwise Add tab
    const s_id = s?.activeBrandId
    return s_id ?? ADD_TAB_ID
  })

  const [labels, setLabels] = useState(() => ({
    ...DEFAULT_LABELS, ...(loadState()?.labels ?? {})
  }))

  const [search,       setSearch]       = useState('')
  const [filterBrands, setFilterBrands] = useState([])

  // persist every change
  useEffect(() => {
    saveState({ brands, labels, activeBrandId: activeId })
  }, [brands, labels, activeId])

  const brand = brands.find(b => b.id === activeId) ?? brands[0]

  const upd = useCallback((id, fn) =>
    setBrands(p => p.map(b => b.id === id ? fn(b) : b)), [])

  // ── handlers ───────────────────────────────────────────────────────────────
  const renameBrand = useCallback((id, name) =>
    setBrands(p => p.map(b => b.id === id ? { ...b, name } : b)), [])

  // PART 1 — add same product to multiple brands
  const addToMany = useCallback((name, ean, brandIds) => {
    // Each brand gets its own copy with a unique id
    setBrands(prev => prev.map(b => {
      if (!brandIds.includes(b.id)) return b
      return {
        ...b,
        available: [
          ...b.available,
          { id: uid(), name, ean, przygotowane: false, doWlaczenia: false },
        ],
      }
    }))
  }, [])

  const addProduct = useCallback(name =>
    upd(activeId, b => ({
      ...b,
      available: [...b.available, { id: uid(), name, ean: '', przygotowane: false, doWlaczenia: false }],
    })), [activeId, upd])

  const toggleField = useCallback((id, f) =>
    upd(activeId, b => ({
      ...b,
      available: b.available.map(p => p.id === id ? { ...p, [f]: !p[f] } : p),
    })), [activeId, upd])

  const activateProd = useCallback(id =>
    upd(activeId, b => {
      const p = b.available.find(x => x.id === id); if (!p) return b
      return {
        ...b,
        available: b.available.filter(x => x.id !== id),
        active:    [...b.active, { id: p.id, name: p.name, ean: p.ean ?? '' }],
      }
    }), [activeId, upd])

  const returnProd = useCallback(id =>
    upd(activeId, b => {
      const p = b.active.find(x => x.id === id); if (!p) return b
      return {
        ...b,
        active:    b.active.filter(x => x.id !== id),
        available: [...b.available, { id: p.id, name: p.name, ean: p.ean ?? '', przygotowane: false, doWlaczenia: false }],
      }
    }), [activeId, upd])

  const renameProd = useCallback((id, name, tbl) =>
    upd(activeId, b => ({ ...b, [tbl]: b[tbl].map(p => p.id === id ? { ...p, name } : p) })),
    [activeId, upd])

  const deleteProd = useCallback((id, tbl) =>
    upd(activeId, b => ({ ...b, [tbl]: b[tbl].filter(p => p.id !== id) })),
    [activeId, upd])

  // PART 2 — EAN inline edit
  const changeEan = useCallback((id, ean, tbl) =>
    upd(activeId, b => ({ ...b, [tbl]: b[tbl].map(p => p.id === id ? { ...p, ean } : p) })),
    [activeId, upd])

  const totalActive = brands.reduce((s, b) => s + b.active.length, 0)
  const totalQueue  = brands.reduce((s, b) => s + b.available.length, 0)

  // Show cross-brand results whenever search is non-empty and we're in a brand view
  const showCrossBrand = Boolean(search.trim()) && activeId !== ADD_TAB_ID

  return (
    <div className="root">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="hdr">
        <div className="hdr-top">
          <div className="hdr-logo">
            <div className="logo-box"><LayoutGrid size={17} className="text-white"/></div>
            <div>
              <h1 className="logo-title">Automation Manager</h1>
              <p className="logo-sub">Zarządzanie produktami per marka</p>
            </div>
          </div>

          {/* PART 4 — search hidden on Add Product tab */}
          {activeId !== ADD_TAB_ID && (
            <SearchBar
              search={search} setSearch={setSearch}
              brands={brands}
              filterBrands={filterBrands} setFilterBrands={setFilterBrands}
            />
          )}

          <div className="hdr-pills">
            <span className="pill pill-grn">
              <span className="pdot pdot-pulse"/>{ totalActive } aktywnych
            </span>
            <span className="pill pill-org">
              <span className="pdot"/>{ totalQueue } w kolejce
            </span>
          </div>
        </div>

        {/* PART 1 + 3 — "Dodaj produkt" tab is always first */}
        <NavTabs
          brands={brands}
          active={activeId}
          onSelect={id => { setActiveId(id); setSearch(''); setFilterBrands([]) }}
          onRename={renameBrand}
        />
      </header>

      {/* ── MAIN ───────────────────────────────────────────────────────────── */}
      {activeId === ADD_TAB_ID ? (
        <AddProductView brands={brands} onAddToMany={addToMany}/>
      ) : (
        <main className="main">
          <div className="bc">
            <span className="bc-brand">{brand.name}</span>
            <span className="bc-sep">›</span>
            <span>{brand.available.length} do aktywacji</span>
            <span className="bc-dot">·</span>
            <span>{brand.active.length} aktywnych</span>
            {search && <><span className="bc-dot">·</span><span>filtr: <strong>„{search}"</strong></span></>}
            {filterBrands.length > 0 && <><span className="bc-dot">·</span><span>marki: <strong>{filterBrands.length}</strong></span></>}
          </div>

          {/* PART 4 — cross-brand results panel */}
          {showCrossBrand && (
            <SearchResultsView
              brands={brands} search={search}
              filterBrands={filterBrands} labels={labels}
            />
          )}

          <Section1
            brand={brand} labels={labels} setLabels={setLabels}
            search={showCrossBrand ? '' : search}
            onAdd={addProduct} onToggle={toggleField} onActivate={activateProd}
            onRename={renameProd} onDelete={deleteProd} onEanChange={changeEan}
          />

          <Section2
            brand={brand} labels={labels} setLabels={setLabels}
            search={showCrossBrand ? '' : search}
            onReturn={returnProd} onRename={renameProd}
            onDelete={deleteProd} onEanChange={changeEan}
          />
        </main>
      )}

      <footer className="ftr">
        <span>AUTOMATION MANAGER</span>
        <span>Dane zapisywane lokalnie · {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
