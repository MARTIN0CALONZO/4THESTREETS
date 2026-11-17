import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from './api'

export function ProfileEditModal({ user, onClose, onSaved }) {
    const [form, setForm] = useState({
        fullName: user.fullName || '',
        phone: user.phone || '',
        birthDate: user.birthDate ? user.birthDate.slice(0, 10) : '',
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && !saving && onClose()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose, saving])

    const set = (name) => (e) => setForm({ ...form, [name]: e.target.value })

    const submit = async (e) => {
        e.preventDefault()

        if (!form.fullName.trim()) {
        setError('Full name is required.')
        return
        }
        if (form.phone.trim() && !/^[0-9+()\-\s]{7,20}$/.test(form.phone.trim())) {
        setError('Please enter a valid phone number.')
        return
        }

        setSaving(true)
        setError('')
        try {
        const { user: updated } = await api('/profile', {
            method: 'PUT',
            body: {
            fullName: form.fullName.trim(),
            phone: form.phone.trim(),
            birthDate: form.birthDate,
            },
        })
        onSaved(updated)
        } catch (err) {
        setError(err.message)
        setSaving(false)
        }
    }

    return createPortal(
        <div
        className="addr-overlay"
        onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}
        >
        <div className="addr-modal" role="dialog" aria-modal="true">
            <div className="addr-header">
            <h3>Edit Contact Details</h3>
            <button type="button" className="addr-close" onClick={onClose} disabled={saving}>
                ✕
            </button>
            </div>

            <form onSubmit={submit} className="addr-body">
            <label className="addr-field">
                <span>Email</span>
                <input type="email" value={user.email || ''} disabled />
            </label>

            <label className="addr-field">
                <span>Full Name</span>
                <input
                type="text"
                maxLength={100}
                value={form.fullName}
                onChange={set('fullName')}
                autoFocus
                />
            </label>

            <div className="addr-row">
                <label className="addr-field">
                <span>Phone</span>
                <input
                    type="tel"
                    maxLength={20}
                    placeholder="+63 912 345 6789"
                    value={form.phone}
                    onChange={set('phone')}
                />
                </label>
                <label className="addr-field">
                <span>Birth Date</span>
                <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={form.birthDate}
                    onChange={set('birthDate')}
                />
                </label>
            </div>

            {error && <p className="addr-error">{error}</p>}

            <div className="addr-actions">
                <button type="button" className="addr-btn secondary" onClick={onClose} disabled={saving}>
                Cancel
                </button>
                <button type="submit" className="addr-btn primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
            </form>
        </div>
        </div>,
        document.body
    )
}