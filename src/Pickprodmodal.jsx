import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { formatPrice } from './productData'
import './Pickprodmodal.css'

const TOP_ORDER = ['XS', 'S', 'M', 'L', 'XL']

const STYLE_LABELS = {
  streetwear: 'Streetwear',
  minimalist: 'Minimalist',
  vintage: 'Vintage',
  bold: 'Bold Statement',
  y2k: 'Y2K',
}

const CM_PER_INCH = 2.54

export const computeBmi = (weightKg, heightCm) => weightKg / (heightCm / 100) ** 2

export const BMI_LIMITS = [18, 21, 24, 27]
export const bmiToTopIndex = (bmi) => BMI_LIMITS.filter((limit) => bmi >= limit).length

export const weightToTopIndex = (w) => (w < 50 ? 0 : w < 61 ? 1 : w < 73 ? 2 : w < 86 ? 3 : 4)

const clampWaist = (n) => Math.round(Math.max(26, Math.min(44, n)))

export const estimateWaistFromBmi = (bmi) => clampWaist(28 + (bmi - 18.5))

export const estimateWaistFromWeight = (w) => clampWaist(28 + (w - 50) * 0.25)

export function inseamFromHeight(heightCm) {
  const inches = heightCm / CM_PER_INCH
  if (inches < 68) return [28, 30]
  if (inches < 72) return [30, 32] 
  if (inches < 75) return [32, 34] 
  return [34, 36] 
}

export function cutFromHeight(heightCm) {
  const inches = heightCm / CM_PER_INCH
  if (inches > 74) return 'Tall' 
  if (inches < 64) return 'Petite/Short' 
  return null
}

export function computeSizing({ weight, height, waist }) {
  const wRaw = Number(weight) || 0
  const hRaw = Number(height) || 0
  const w = wRaw >= 30 && wRaw <= 250 ? wRaw : 0
  const h = hRaw >= 120 && hRaw <= 230 ? hRaw : 0
  const wa = Number(waist) || 0

  const bmi = w && h ? computeBmi(w, h) : null

  const estWaist = bmi ? estimateWaistFromBmi(bmi) : w ? estimateWaistFromWeight(w) : null

  // Build: ihambing ang tunay na waist sa inaasahang waist
  let build = null
  if (wa && estWaist) {
    const diff = wa - estWaist
    build = diff >= 2 ? 'midsection' : diff <= -2 ? 'athletic' : 'average'
  }

  let topSize = null
  let topBasis = null
  if (w) {
    let idx = bmi ? bmiToTopIndex(bmi) : weightToTopIndex(w)
    topBasis = bmi ? 'bmi' : 'weight'
    // Maliit ang waist pero mabigat = nasa itaas na katawan ang bigat (muscle): size up ang shirt
    if (build === 'athletic') idx = Math.min(idx + 1, TOP_ORDER.length - 1)
    topSize = TOP_ORDER[idx]
  }

  // Ang nilagay na waist ang laging mas pinaniniwalaan; BMI/timbang lang kung wala
  const bottomWaist = wa || estWaist || null

  return {
    topSize,
    topBasis,
    bmi,
    cut: h ? cutFromHeight(h) : null,
    bottomWaist,
    waistMeasured: !!wa,
    inseam: h ? inseamFromHeight(h) : null,
    build,
  }
}

/* ------------------------------------------------------------------
   Pagtutugma sa mga size na meron ang produkto
------------------------------------------------------------------ */
export function fitTop(item, sizing) {
  if (!sizing.topSize) return { kind: 'unknown', need: 'weight' }

  const estimate = sizing.topSize
  const available = (item.sizes || []).filter((s) => TOP_ORDER.includes(s))
  if (available.length === 0) return { kind: 'unknown', estimate, need: 'sizes' }
  if (available.includes(estimate)) return { kind: 'exact', estimate, size: estimate }

  const ei = TOP_ORDER.indexOf(estimate)
  const nearest = [...available].sort(
    (a, b) =>
      Math.abs(TOP_ORDER.indexOf(a) - ei) - Math.abs(TOP_ORDER.indexOf(b) - ei) ||
      TOP_ORDER.indexOf(b) - TOP_ORDER.indexOf(a) // kapag pantay, mas malaki
  )[0]
  const dist = Math.abs(TOP_ORDER.indexOf(nearest) - ei)
  return { kind: dist <= 1 ? 'near' : 'far', estimate, size: nearest }
}

export function fitBottom(item, sizing) {
  if (!sizing.bottomWaist) return { kind: 'unknown', need: 'waist' }

  const w = sizing.bottomWaist
  const estimated = !sizing.waistMeasured
  const available = (item.sizes || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)
  if (available.length === 0) return { kind: 'unknown', estimate: w, estimated, need: 'sizes' }
  if (available.includes(w)) return { kind: 'exact', estimate: w, estimated, size: String(w) }

  const nearest = [...available].sort((a, b) => Math.abs(a - w) - Math.abs(b - w) || b - a)[0]
  const diff = Math.abs(nearest - w)
  return { kind: diff <= 1.5 ? 'near' : 'far', estimate: w, estimated, size: String(nearest) }
}

const SIZE_SCORE = { exact: 1, near: 0.7, far: 0.3 }

export function computeAccuracy(outfit, inputs, fits) {
  const items = [outfit.top, outfit.bottom, outfit.accessory]

  const styleScore = items.filter((i) => i.styles?.includes(inputs.style)).length / items.length
  const budgetScore = outfit.total >= inputs.min && outfit.total <= inputs.max ? 1 : 0

  // Mas mababa ang tiwala kung tantiya lang mula sa timbang ang waist
  const scores = [fits.top, fits.bottom]
    .filter((f) => f.kind !== 'unknown')
    .map((f) => SIZE_SCORE[f.kind] * (f.estimated ? 0.9 : 1))
  const sizeScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  // Style 40%, Budget 30%, Size 30% (kung may nilagay na sukat)
  const parts = [
    [styleScore, 40],
    [budgetScore, 30],
  ]
  if (sizeScore !== null) parts.push([sizeScore, 30])

  const weight = parts.reduce((n, [, w]) => n + w, 0)
  const pct = Math.round((parts.reduce((n, [s, w]) => n + s * w, 0) / weight) * 100)

  return { pct, styleScore, budgetScore, sizeScore }
}

const verdict = (pct) =>
  pct >= 85 ? 'Excellent match' : pct >= 65 ? 'Good match' : 'Fair match'

const BUILD_NOTES = {
  athletic:
    'Your waist is smaller than typical for your weight, so we sized your shirt up by one (the extra weight is likely in your upper body).',
  midsection:
    'Your waist is larger than typical for your weight, so your pants waist uses your measured waist instead of your weight.',
}

function SizeLine({ part, fit }) {
  if (part === 'accessory') return <span className="pp-ok">Free size</span>

  if (fit.kind === 'unknown') {
    if (fit.need === 'sizes') return <span className="pp-muted">No sizes listed for this item</span>
    return (
      <span className="pp-muted">
        {fit.need === 'waist'
          ? 'Add your waist size or weight to get a size recommendation'
          : 'Add your weight to get a size recommendation'}
      </span>
    )
  }

  const est = part === 'bottom' ? `waist ${fit.estimate}"` : fit.estimate
  const tag = fit.estimated ? ' (estimated from weight)' : ''

  if (fit.kind === 'exact') {
    return (
      <span className="pp-ok">
        ✓ Your size ({est}) is available{tag}
      </span>
    )
  }

  return (
    <span className={fit.kind === 'near' ? 'pp-warn' : 'pp-bad'}>
      Your size ({est}) is not available. Closest: <b>{fit.size}</b>
      {fit.kind === 'far' && ' (may not fit well)'}
      {tag}
    </span>
  )
}

/* ------------------------------------------------------------------
   POP-UP: Fit Check ng napiling outfit

   Props:
     outfit       - { top, bottom, accessory, total }
     inputs       - ang nilagay ni user nang i-generate:
                    { min, max, style, weight, height, waist }
     onClose      - isara ang modal
     onRegenerate - gumawa ulit ng bagong outfit
------------------------------------------------------------------ */
export function OutfitFitModal({ outfit, inputs, onClose, onRegenerate }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sizing = computeSizing(inputs)
  const fits = {
    top: fitTop(outfit.top, sizing),
    bottom: fitBottom(outfit.bottom, sizing),
  }
  const acc = computeAccuracy(outfit, inputs, fits)

  const parts = [
    { key: 'top', label: 'Top', item: outfit.top, fit: fits.top },
    { key: 'bottom', label: 'Bottom', item: outfit.bottom, fit: fits.bottom },
    { key: 'accessory', label: 'Accessory', item: outfit.accessory, fit: null },
  ]

  const underMax = inputs.max - outfit.total
  const dash = (v, unit) => (v ? `${v} ${unit}` : '—')
  const hasMeasure = !!(Number(inputs.weight) || Number(inputs.waist))

  const cutText = sizing.cut
    ? `${sizing.cut} cut recommended (${sizing.cut === 'Tall' ? "over 6'2\"" : "under 5'4\""})`
    : null
  const inseamText = sizing.inseam ? `${sizing.inseam[0]}" or ${sizing.inseam[1]}"` : null

  return createPortal(
    <div className="pp-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pp-modal" role="dialog" aria-modal="true">
        <div className="pp-header">
          <h3>Outfit Fit Check</h3>
          <button type="button" className="pp-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="pp-body">
          {/* ---------- Accuracy ---------- */}
          <div className="pp-score">
            <div className="pp-score-circle" style={{ '--pct': acc.pct }}>
              <span>{acc.pct}%</span>
            </div>
            <div>
              <h4>{verdict(acc.pct)}</h4>
              <p>
                Based on your style, budget
                {acc.sizeScore !== null ? ' and measurements.' : '. Add measurements for size accuracy.'}
              </p>
            </div>
          </div>

          {/* ---------- Ang mga nilagay ni user ---------- */}
          <h4 className="pp-section">Your Details</h4>
          <div className="pp-details">
            <div>
              <span>Budget</span>
              <b>
                {formatPrice(inputs.min)} – {formatPrice(inputs.max)}
              </b>
            </div>
            <div>
              <span>Style</span>
              <b>{STYLE_LABELS[inputs.style] || inputs.style}</b>
            </div>
            <div>
              <span>Weight</span>
              <b>{dash(inputs.weight, 'kg')}</b>
            </div>
            <div>
              <span>Height</span>
              <b>{dash(inputs.height, 'cm')}</b>
            </div>
            <div>
              <span>Waist</span>
              <b>{dash(inputs.waist, 'in')}</b>
            </div>
          </div>

          {/* ---------- Size profile ---------- */}
          <h4 className="pp-section">Your Size Profile</h4>
          {hasMeasure || sizing.inseam || sizing.cut ? (
            <div className="pp-profile">
              <div>
                <span>Shirt size</span>
                <b>{sizing.topSize || '—'}</b>
                <small>
                  {sizing.topBasis === 'bmi'
                    ? `from your BMI (${sizing.bmi.toFixed(1)})`
                    : sizing.topBasis === 'weight'
                      ? 'from your weight. Add your height for a better estimate'
                      : 'add your weight and height'}
                  {cutText ? ` · ${cutText}` : ''}
                </small>
              </div>
              <div>
                <span>Pants waist</span>
                <b>{sizing.bottomWaist ? `${sizing.bottomWaist}"` : '—'}</b>
                <small>
                  {sizing.bottomWaist
                    ? sizing.waistMeasured
                      ? 'from your measured waist'
                      : sizing.bmi
                        ? 'estimated from your BMI'
                        : 'estimated from your weight'
                    : 'add your waist or weight'}
                </small>
              </div>
              <div>
                <span>Pants inseam</span>
                <b>{inseamText || '—'}</b>
                <small>{inseamText ? 'from your height' : 'add your height'}</small>
              </div>
            </div>
          ) : (
            <p className="pp-muted pp-small">
              Add your weight, height and waist size to get size recommendations.
            </p>
          )}
          {BUILD_NOTES[sizing.build] && <p className="pp-build">{BUILD_NOTES[sizing.build]}</p>}

          {/* ---------- Bawat piraso ---------- */}
          <h4 className="pp-section">Your Outfit</h4>
          <div className="pp-items">
            {parts.map(({ key, label, item, fit }) => (
              <div className="pp-item" key={key}>
                <img src={item.image} alt={item.name} />
                <div className="pp-item-info">
                  <div className="pp-item-top">
                    <span className="pp-item-label">{label}</span>
                    <b>{formatPrice(item.price)}</b>
                  </div>
                  <p className="pp-item-name">{item.name}</p>

                  <div className="pp-row">
                    <span className="pp-row-label">Style</span>
                    <span className="pp-chips">
                      {(item.styles || []).map((s) => (
                        <i key={s} className={s === inputs.style ? 'match' : ''}>
                          {STYLE_LABELS[s] || s}
                        </i>
                      ))}
                    </span>
                  </div>

                  <div className="pp-row">
                    <span className="pp-row-label">Size</span>
                    <SizeLine part={key} fit={fit} />
                  </div>

                  {key === 'top' && cutText && (
                    <div className="pp-row">
                      <span className="pp-row-label">Cut</span>
                      <span className="pp-muted">{cutText}. Check the size guide.</span>
                    </div>
                  )}

                  {key === 'bottom' && inseamText && (
                    <div className="pp-row">
                      <span className="pp-row-label">Length</span>
                      <span className="pp-muted">Inseam {inseamText} recommended. Check the size guide.</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ---------- Budget ---------- */}
          <div className="pp-total">
            <span>Total</span>
            <b>{formatPrice(outfit.total)}</b>
          </div>
          <p className={`pp-budget ${acc.budgetScore ? 'pp-ok' : 'pp-bad'}`}>
            {acc.budgetScore
              ? `✓ Within your budget (${formatPrice(underMax)} left to your max)`
              : 'Outside your budget'}
          </p>

          <p className="pp-disclaimer">
            Your BMI (weight and height) decides your shirt size, and your height decides the length. These are
            estimates, so please check the size guide before ordering.
          </p>

          <div className="pp-actions">
            <button type="button" className="pp-btn secondary" onClick={onRegenerate}>
              Try Another Outfit
            </button>
            <button type="button" className="pp-btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}