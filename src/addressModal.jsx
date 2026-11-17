import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from './api'
import AddressFields, { emptyAddress, isAddressComplete, resolveAddress } from './AddressFields'
import './addressModals.css'

const LABELS = ['Home', 'Work', 'Studio', 'Other']

// Close the modal when Escape is pressed
function useEscape(handler, disabled) {
  useEffect(() => {
    if (disabled) return
    const onKey = (e) => e.key === 'Escape' && handler()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handler, disabled])
}

/* ------------------------------------------------------------------
   MODAL 1: Form for adding or editing an address

   Props:
     address  - the address object when editing; null when adding
     isFirst  - true if this is the user's first address (automatically default)
     onClose  - close the modal
     onSaved  - called with the new address list: onSaved(list)
------------------------------------------------------------------ */
export function AddressFormModal({ address, isFirst, onClose, onSaved }) {
  const editing = !!address

  // Saved with the structured fields (street/barangay/city/province)?
  const hasParts =
    editing && !!(address.street || address.barangay || address.city || address.province)
  // Old address saved as one line of text
  const isLegacy = editing && !hasParts

  const [label, setLabel] = useState(address?.label || 'Home')
  const [zip, setZip] = useState(address?.zip || '')
  const [isDefault, setIsDefault] = useState(editing ? !!address.isDefault : !!isFirst)
  const [addr, setAddr] = useState({
    ...emptyAddress,
    street: hasParts ? address.street : isLegacy ? address.details : '',
  })
  const [loadingAddr, setLoadingAddr] = useState(hasParts)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEscape(() => !saving && onClose(), false)

  // When editing, turn the saved names back into dropdown selections
  useEffect(() => {
    if (!hasParts) return
    let cancelled = false
    resolveAddress(address)
      .then((a) => !cancelled && setAddr(a))
      .catch(() => {}) // if it fails, the user can just pick again
      .finally(() => !cancelled && setLoadingAddr(false))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e) => {
    e.preventDefault()

    if (!isAddressComplete(addr)) {
      setError('Please complete the address: street, province, city / municipality and barangay.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const body = {
        label: label.trim() || 'Home',
        street: addr.street.trim(),
        barangay: addr.barangay,
        city: addr.city.name,
        province: addr.province.name,
        zip: zip.trim(),
        isDefault,
      }
      const { addresses } = editing
        ? await api(`/profile/addresses/${address._id}`, { method: 'PUT', body })
        : await api('/profile/addresses', { method: 'POST', body })
      onSaved(addresses)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="addr-overlay addr-overlay-top"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="addr-modal" role="dialog" aria-modal="true">
        <div className="addr-header">
          <h3>{editing ? 'Edit Address' : 'Add New Address'}</h3>
          <button type="button" className="addr-close" onClick={onClose} disabled={saving}>
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="addr-body">
          {isLegacy && (
            <p className="addr-note">
              This address was saved as one line. Please re-enter it using the fields below.
            </p>
          )}

          <label className="addr-field">
            <span>Label</span>
            <input
              type="text"
              list="addr-label-options"
              maxLength={30}
              placeholder="Home, Work, Studio..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <datalist id="addr-label-options">
              {LABELS.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </label>

          <div className="addr-field">
            <span>Address</span>
            {loadingAddr ? (
              <p className="addr-hint">Loading address...</p>
            ) : (
              <div className="addr-psgc">
                <AddressFields value={addr} onChange={setAddr} />
              </div>
            )}
          </div>

          <label className="addr-field">
            <span>ZIP Code (optional)</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </label>

          <label className="addr-check">
            <input
              type="checkbox"
              checked={isDefault}
              disabled={isFirst || (editing && address.isDefault)}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Set as default address
          </label>

          {error && <p className="addr-error">{error}</p>}

          <div className="addr-actions">
            <button type="button" className="addr-btn secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="addr-btn primary" disabled={saving || loadingAddr}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Save Address'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

/* ------------------------------------------------------------------
   MODAL 2: List of addresses (for Checkout)
   The radio button marks the default address. There is also a button to add a new one.

   Props:
     addresses - the user's address list
     onChange  - called with the new list: onChange(list)
     onAdd     - open the form for a new address
     onDone    - called with the default address when "Use This Address" is pressed
     onClose   - close the modal
     locked    - true if another modal is on top of this one (so it ignores Escape)
------------------------------------------------------------------ */
export function AddressListModal({ addresses, onChange, onAdd, onDone, onClose, locked }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  useEscape(onClose, locked)

  const current = addresses.find((a) => a.isDefault) || addresses[0]

  const makeDefault = async (id) => {
    if (busyId) return
    setBusyId(id)
    setError('')
    try {
      const { addresses: list } = await api(`/profile/addresses/${id}`, {
        method: 'PUT',
        body: { isDefault: true },
      })
      onChange(list)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return createPortal(
    <div className="addr-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="addr-modal" role="dialog" aria-modal="true">
        <div className="addr-header">
          <h3>Select Address</h3>
          <button type="button" className="addr-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="addr-body">
          <p className="addr-hint">The selected address will be your default and used for this order.</p>

          {addresses.length === 0 && (
            <p className="addr-note">You have no saved addresses yet. Add one below.</p>
          )}

          <div className="addr-list">
            {addresses.map((a) => (
              <label key={a._id} className={`addr-option ${a.isDefault ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="addr-default"
                  checked={!!a.isDefault}
                  disabled={!!busyId}
                  onChange={() => makeDefault(a._id)}
                />
                <div className="addr-option-text">
                  <div className="addr-option-title">
                    <b>{a.label}</b>
                    {a.isDefault && <span className="addr-badge">Default</span>}
                    {busyId === a._id && <span className="addr-saving">Saving...</span>}
                  </div>
                  <p>{a.details}</p>
                </div>
              </label>
            ))}
          </div>

          <button type="button" className="addr-add-btn" onClick={onAdd}>
            + Add New Address
          </button>

          {error && <p className="addr-error">{error}</p>}

          <div className="addr-actions">
            <button type="button" className="addr-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="addr-btn primary"
              disabled={!current || !!busyId}
              onClick={() => onDone(current)}
            >
              Use This Address
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}