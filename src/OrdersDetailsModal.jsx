import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from './api'
import { php } from './CartContext'
import './ordersDetailsModal.css'
import './orderCancel.css'

const STATUS = {
    pending: { label: 'Pending', badge: 'pending' },
    paid: { label: 'Paid', badge: 'paid' },
    shipped: { label: 'Shipped', badge: 'shipped' },
    delivered: { label: 'Delivered', badge: 'delivered' },
    cancelled: { label: 'Cancelled', badge: 'cancelled' },
}

// Pending at paid lang ang puwedeng kanselahin ng customer
const CANCELLABLE = ['pending', 'paid']

const REFUND_LABEL = {
    succeeded: 'Refunded',
    pending: 'Refund processing',
    processing: 'Refund processing',
    failed: 'Refund being reviewed',
    simulated: 'Simulated payment (no refund needed)',
}

const formatDate = (d) =>
    new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

const describe = (i) =>
    [i.size && `Size: ${i.size}`, i.color && `Color: ${i.color}`, `Qty: ${i.qty}`]
        .filter(Boolean)
        .join(' · ')

// Mensahe pagkatapos makansela
const cancelNotice = (wasPaid, refund) => {
  if (!wasPaid) {
    return {
      type: 'success',
      text: 'Your order was cancelled successfully.'
    }
  }

  if (refund?.status === 'succeeded') {
    return {
      type: 'success',
      text: 'Your order was cancelled and your refund was processed.'
    }
  }

  return {
    type: 'warn',
    text: 'Your order was cancelled. Your refund is pending processing. Please contact support for updates.'
  }
}

export function OrderDetailsModal({ order: initialOrder, onClose, onWriteReview, onCancelled }) {
    const [order, setOrder] = useState(initialOrder)
    const [confirming, setConfirming] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState(null)
    const [myReviews, setMyReviews] = useState([])
    const [reviewsLoading, setReviewsLoading] = useState(false)

    useEffect(() => {
        setOrder(initialOrder)
    }, [initialOrder])

    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && !busy && onClose()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose, busy])

    useEffect(() => {
        if (order.status !== 'delivered') {
            setMyReviews([])
            return
        }
        let cancelled = false
        setReviewsLoading(true)
        api(`/orders/${order._id}/reviews`)
            .then(({ reviews }) => { if (!cancelled) setMyReviews(reviews || []) })
            .catch((err) => { if (!cancelled) setError(err.message || 'Could not load review status.') })
            .finally(() => { if (!cancelled) setReviewsLoading(false) })
        return () => { cancelled = true }
    }, [order._id, order.status])

    const st = STATUS[order.status] || STATUS.pending
    const canCancel = CANCELLABLE.includes(order.status)
    const lockedForCancel = order.status === 'shipped' || order.status === 'delivered'
    const refundLabel = order.status === 'cancelled' ? REFUND_LABEL[order.refundStatus] : ''

    const cancelOrder = async () => {
        setBusy(true)
        setError('')
        try {
            const wasPaid = order.status === 'paid'
            const { order: updated, refund, warnings } = await api(`/orders/${order._id}/cancel`, {
                method: 'POST',
                body: {},
            })

            const merged = { ...order, ...updated }
            setOrder(merged)
            setConfirming(false)
            setNotice(warnings?.length ? { type: 'warn', text: `Order cancelled. ${warnings.join(' ')}` } : cancelNotice(wasPaid, refund))
            if (onCancelled) onCancelled(merged)
        } catch (err) {
            setError(err.message || 'Could not cancel the order.')
        } finally {
            setBusy(false)
        }
    }

    const close = () => {
        if (!busy) onClose()
    }

    return createPortal(
        <div
        className="od-overlay"
        onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
        <div className="od-modal" role="dialog" aria-modal="true">
            <div className="od-header">
            <div>
                <h3>Order Details</h3>
                <p className="od-sub">
                #{order.orderNumber} · Ordered {formatDate(order.createdAt)}
                </p>
            </div>
            <button type="button" className="od-close" onClick={close}>
                ✕
            </button>
            </div>

            <div className="od-body">
            {/* Status + total summary */}
            <div className="od-summary">
                <div>
                <span className="od-label">Status</span>
                <span className={`od-badge ${st.badge}`}>{st.label}</span>
                </div>
                <div>
                <span className="od-label">Payment</span>
                <b>{order.paymentMethod || '—'}</b>
                </div>
                <div>
                <span className="od-label">Total</span>
                <b className="od-total">{php(order.total)}</b>
                </div>
            </div>

            {notice && <p className={`od-notice ${notice.type}`}>{notice.text}</p>}

            {refundLabel && !notice && <p className="od-hint">{refundLabel}</p>}

            {/* Items */}
            <h4 className="od-section">Items</h4>
            <div className="od-items">
                {order.items.map((i, idx) => (
                <div key={idx} className="od-item">
                    {i.image ? (
                    <img src={i.image} alt={i.name} className="od-item-img" />
                    ) : (
                    <div className="od-item-img od-item-noimg">?</div>
                    )}
                    <div className="od-item-info">
                    <b>{i.name}</b>
                    <span>{describe(i)}</span>
                    </div>
                    <b className="od-item-price">{php(i.price * i.qty)}</b>
                    {order.status === 'delivered' && (
                        myReviews.some((r) => String(r.product) === String(i.product)) ? (
                            <span className="od-reviewed">✓ Reviewed</span>
                        ) : (
                            <button
                                type="button"
                                className="od-btn primary"
                                disabled={reviewsLoading || busy}
                                onClick={() => onWriteReview?.(i)}
                            >
                                ⭐ Write a Review
                            </button>
                        )
                    )}
                </div>
                ))}
            </div>

            {/* Shipping */}
            <h4 className="od-section">Shipping</h4>
            <div className="od-shipping">
                <p><span>Name</span><b>{order.shipping?.name || '—'}</b></p>
                <p><span>Address</span><b>{order.shipping?.address || '—'}</b></p>
                <p><span>Contact</span><b>{order.shipping?.contact || '—'}</b></p>
            </div>

            {/* Totals */}
            <h4 className="od-section">Payment Summary</h4>
            <div className="od-totals">
                <div><span>Subtotal</span><span>{php(order.subtotal)}</span></div>
                <div><span>Shipping</span><span>{php(order.shippingFee)}</span></div>
                {order.discount > 0 && (
                <div><span>Discount</span><span>-{php(order.discount)}</span></div>
                )}
                <div className="od-total-row">
                <span>Total</span>
                <b>{php(order.total)}</b>
                </div>
            </div>

            {/* Review status */}
            {order.status === 'delivered' && order.reviewed && (
                <p className="od-reviewed">✓ Reviewed — thanks for your feedback!</p>
            )}

            {/* Hindi na puwedeng kanselahin */}
            {lockedForCancel && (
                <p className="od-hint">
                Orders that are already shipped or delivered can no longer be cancelled.
                </p>
            )}

            {/* Kumpirmasyon bago kanselahin */}
            {canCancel && confirming && (
                <div className="od-cancel-box">
                <b>Cancel this order?</b>
                <p>
                    {order.status === 'paid'
                    ? `Cancellation requires refund review for your payment of ${php(order.total)}. This cannot be undone.`
                    : 'This cannot be undone.'}
                </p>
                {error && <p className="od-notice error">{error}</p>}
                <div className="od-cancel-actions">
                    <button
                    type="button"
                    className="od-btn secondary"
                    disabled={busy}
                    onClick={() => {
                        setConfirming(false)
                        setError('')
                    }}
                    >
                    Keep Order
                    </button>
                    <button
                    type="button"
                    className="od-btn danger"
                    disabled={busy}
                    onClick={cancelOrder}
                    >
                    {busy ? 'Cancelling...' : 'Yes, Cancel Order'}
                    </button>
                </div>
                </div>
            )}
            </div>

            <div className="od-actions">
            <button type="button" className="od-btn secondary" onClick={close} disabled={busy}>
                Close
            </button>
            {canCancel && !confirming && (
                <button
                type="button"
                className="od-btn danger"
                onClick={() => setConfirming(true)}
                >
                Cancel Order
                </button>
            )}
            </div>
        </div>
        </div>,
        document.body
    )
}