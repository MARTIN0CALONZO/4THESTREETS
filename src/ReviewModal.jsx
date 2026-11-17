
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from './api'
import './reviewModal.css'

const RATINGS = [1, 2, 3, 4, 5]

const STAR_LABELS = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
}

export function ReviewModal({ order, product, onClose, onSaved }) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const item = product

  useEffect(() => {
    setRating(0)
    setHovered(0)
    setComment('')
    setError('')
  }, [order?._id, item?.product])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) {
        onClose()
      }
    }

    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, saving])

  const submit = async (e) => {
    e.preventDefault()

    if (!rating) {
      setError('Please select a star rating.')
      return
    }

    if (comment.trim().length < 10) {
      setError(
        'Please write at least 10 characters about the product.'
      )
      return
    }

    if (!item?.product) {
      setError('Product information is missing.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const { order: updated } = await api(
        `/orders/${order._id}/review`,
        {
          method: 'POST',
          body: {
            rating,
            comment: comment.trim(),
            productId: item.product,
          },
        }
      )

      onSaved?.(updated)

    } catch (err) {
      setError(
        err.message || 'Failed to submit review.'
      )
    } finally {
      setSaving(false)
    }
  }

  const active = hovered || rating

  return createPortal(
    <div
      className="review-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) {
          onClose()
        }
      }}
    >
      <div
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Write a Review"
      >
        <div className="review-header">
          <h3>Write a Review</h3>

          <button
            type="button"
            className="review-close"
            onClick={onClose}
            disabled={saving}
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="review-body">

          {/* Product Preview */}
          <div className="review-product">
            {item?.image && (
              <img
                src={item.image}
                alt={item.name}
                className="review-product-img"
              />
            )}

            <div className="review-product-info">
              <b>{item?.name}</b>

              <span>
                {[
                  item?.size && `Size: ${item.size}`,
                  item?.color && `Color: ${item.color}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>

              <small>
                Order #{order.orderNumber}
              </small>
            </div>
          </div>

          {/* Star Rating */}
          <div className="review-field">
            <label>Your Rating</label>

            <div
              className="review-stars"
              onMouseLeave={() => setHovered(0)}
            >
              {RATINGS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`review-star ${
                    n <= active ? 'on' : ''
                  }`}
                  onMouseEnter={() => setHovered(n)}
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  aria-pressed={rating === n}
                  disabled={saving || !item?.product}
                >
                  ★
                </button>
              ))}

              <span className="review-star-label">
                {active
                  ? STAR_LABELS[active]
                  : 'Tap a star'}
              </span>
            </div>
          </div>

          {/* Review Comment */}
          <div className="review-field">
            <label htmlFor="review-comment">
              Your Review
            </label>

            <textarea
              id="review-comment"
              maxLength={500}
              rows={5}
              placeholder="How was the fit, quality, and style? Share your thoughts..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={saving}
            />

            <div className="review-char-count">
              {comment.length}/500
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <p className="review-error" role="alert">
              {error}
            </p>
          )}

          {/* Action Buttons */}
          <div className="review-actions">
            <button
              type="button"
              className="review-btn secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="review-btn primary"
              disabled={saving || !item?.product}
            >
              {saving
                ? 'Submitting...'
                : 'Submit Review'}
            </button>
          </div>

        </form>
      </div>
    </div>,
    document.body
  )
}
