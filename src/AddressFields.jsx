import { useEffect, useState } from 'react'

const API = 'https://psgc.gitlab.io/api'

// Metro Manila (NCR) has no provinces in PSGC, so we treat the region as one
const NCR = { code: '130000000', name: 'Metro Manila (NCR)', isRegion: true }

export const emptyAddress = { street: '', province: null, city: null, barangay: '' }

// "123 Rizal St., Brgy. Poblacion, Makati City, Metro Manila (NCR)"
export const formatAddress = (a) =>
  [a.street.trim(), a.barangay && `Brgy. ${a.barangay}`, a.city?.name, a.province?.name]
    .filter(Boolean)
    .join(', ')

export const isAddressComplete = (a) =>
  a.street.trim() && a.province && a.city && a.barangay

// Cache each request so reopening a modal doesn't refetch the same list
const cache = new Map()

const getList = (path) => {
  if (!cache.has(path)) {
    const req = fetch(`${API}${path}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load address data')
        return r.json()
      })
      .then((list) => list.sort((a, b) => a.name.localeCompare(b.name)))
      .catch((err) => {
        cache.delete(path) // allow retry after a failure
        throw err
      })
    cache.set(path, req)
  }
  return cache.get(path)
}

const citiesPath = (province) =>
  province.isRegion
    ? `/regions/${province.code}/cities-municipalities/`
    : `/provinces/${province.code}/cities-municipalities/`

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

/**
 * Turns SAVED names (strings) back into dropdown selections (objects with codes),
 * so editing an existing address shows the right province / city / barangay.
 * Anything it can't match is left empty and the user just picks again.
 */
export async function resolveAddress({ street = '', province = '', city = '', barangay = '' }) {
  const base = { ...emptyAddress, street }
  if (!province) return base

  const provinces = [NCR, ...(await getList('/provinces/'))]
  const isNcr = same(province, 'metro manila') || same(province, 'ncr')
  const p = isNcr ? NCR : provinces.find((x) => same(x.name, province))
  if (!p) return base

  const cities = await getList(citiesPath(p))
  const c = cities.find((x) => same(x.name, city))
  if (!c) return { ...base, province: p }

  const barangays = await getList(`/cities-municipalities/${c.code}/barangays/`)
  const b = barangays.find((x) => same(x.name, barangay))
  return { ...base, province: p, city: c, barangay: b ? b.name : '' }
}

export default function AddressFields({ value, onChange }) {
  const [provinces, setProvinces] = useState([])
  const [cities, setCities] = useState([])
  const [barangays, setBarangays] = useState([])
  const [error, setError] = useState('')

  // Provinces: load once
  useEffect(() => {
    getList('/provinces/')
      .then((list) => setProvinces([NCR, ...list]))
      .catch((e) => setError(e.message))
  }, [])

  // Cities/municipalities: reload when the province changes
  useEffect(() => {
    setCities([])
    if (!value.province) return
    let cancelled = false
    getList(citiesPath(value.province))
      .then((list) => !cancelled && setCities(list))
      .catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [value.province])

  // Barangays: reload when the city changes
  useEffect(() => {
    setBarangays([])
    if (!value.city) return
    let cancelled = false
    getList(`/cities-municipalities/${value.city.code}/barangays/`)
      .then((list) => !cancelled && setBarangays(list))
      .catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [value.city])

  const pickProvince = (code) =>
    onChange({
      ...value,
      province: provinces.find((p) => p.code === code) || null,
      city: null,
      barangay: '',
    })

  const pickCity = (code) =>
    onChange({
      ...value,
      city: cities.find((c) => c.code === code) || null,
      barangay: '',
    })

  return (
    <>
      <input
        type="text"
        placeholder="House Number, Street Name"
        value={value.street}
        onChange={(e) => onChange({ ...value, street: e.target.value })}
      />

      <div className="twoinput">
        <select value={value.province?.code || ''} onChange={(e) => pickProvince(e.target.value)}>
          <option value="">Province</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>

        <select
          value={value.city?.code || ''}
          onChange={(e) => pickCity(e.target.value)}
          disabled={!value.province}
        >
          <option value="">Municipality / City</option>
          {cities.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>

      <select
        className="full-select"
        value={value.barangay}
        onChange={(e) => onChange({ ...value, barangay: e.target.value })}
        disabled={!value.city}
      >
        <option value="">Barangay</option>
        {barangays.map((b) => (
          <option key={b.code} value={b.name}>{b.name}</option>
        ))}
      </select>

      {error && <p style={{ color: '#ef4444', fontSize: '14px' }}>{error}</p>}
    </>
  )
}