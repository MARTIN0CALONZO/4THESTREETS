const mongoose = require('mongoose')

const money = (n) =>
  'PHP ' +
  Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9_-]{3,20}$/, 'Code must be 3-20 characters (letters, numbers, - or _)'],
    },
    description: { type: String, default: '', trim: true, maxlength: 120 },

    // 'percent' = 10 means 10% off, 'fixed' = 100 means PHP 100 off
    discountType: { type: String, enum: ['percent', 'fixed'], required: true },
    discountValue: { type: Number, required: true, min: [0.01, 'Discount must be more than 0'] },

    minSubtotal: { type: Number, default: 0, min: 0 }, // minimum items total to use it
    maxDiscount: { type: Number, default: 0, min: 0 }, // cap for percent coupons (0 = no cap)

    // TIME OF USE
    startsAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null }, // null = never expires

    usageLimit: { type: Number, default: 0, min: 0 }, // total uses (0 = unlimited)
    perUserLimit: { type: Number, default: 1, min: 0 }, // uses per customer (0 = unlimited)
    usedCount: { type: Number, default: 0, min: 0 },

    blocked: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true } }
)

couponSchema.pre('validate', function () {
  if (this.discountType === 'percent' && this.discountValue > 100) {
    this.invalidate('discountValue', 'A percent discount cannot be more than 100')
  }
  if (this.expiresAt && this.startsAt && this.expiresAt <= this.startsAt) {
    this.invalidate('expiresAt', 'Expiry must be after the start time')
  }
})

// active | scheduled | expired | used-up | blocked  (computed every time, never stored)
couponSchema.virtual('status').get(function () {
  const now = new Date()
  if (this.blocked) return 'blocked'
  if (this.startsAt && now < this.startsAt) return 'scheduled'
  if (this.expiresAt && now > this.expiresAt) return 'expired'
  if (this.usageLimit > 0 && this.usedCount >= this.usageLimit) return 'used-up'
  return 'active'
})

const STATUS_MESSAGE = {
  blocked: 'This coupon is not available.',
  scheduled: 'This coupon is not active yet.',
  expired: 'This coupon has expired.',
  'used-up': 'This coupon has reached its usage limit.',
}

// The ONE place that decides if a code works and how much it takes off.
// Used by the checkout preview (/coupons/validate) and by POST /orders.
// Returns { coupon, discount } or { error }.
couponSchema.statics.check = async function (rawCode, subtotal, userId) {
  const code = String(rawCode || '').trim().toUpperCase()
  if (!code) return { error: 'Please enter a coupon code.' }

  const coupon = await this.findOne({ code })
  if (!coupon) return { error: 'Invalid coupon code.' }

  if (coupon.status !== 'active') return { error: STATUS_MESSAGE[coupon.status] }

  if (subtotal < coupon.minSubtotal) {
    return { error: `Spend at least ${money(coupon.minSubtotal)} to use this coupon.` }
  }

  if (coupon.perUserLimit > 0 && userId) {
    const used = await mongoose.model('Order').countDocuments({
      user: userId,
      coupon: coupon.code,
      status: { $ne: 'cancelled' },
    })
    if (used >= coupon.perUserLimit) {
      return { error: 'You have already used this coupon.' }
    }
  }

  let discount =
    coupon.discountType === 'percent'
      ? (subtotal * coupon.discountValue) / 100
      : coupon.discountValue

  if (coupon.discountType === 'percent' && coupon.maxDiscount > 0) {
    discount = Math.min(discount, coupon.maxDiscount)
  }
  discount = Math.round(Math.min(discount, subtotal) * 100) / 100

  return { coupon, discount }
}

// Adds 1 to usedCount only if there is still room (safe when two people check out at once)
couponSchema.statics.reserve = function (id) {
  return this.findOneAndUpdate(
    {
      _id: id,
      $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }],
    },
    { $inc: { usedCount: 1 } },
    { new: true }
  )
}

couponSchema.statics.release = function (id) {
  return this.updateOne({ _id: id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } })
}

module.exports = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema)