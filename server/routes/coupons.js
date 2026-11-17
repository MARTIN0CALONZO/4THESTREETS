const router = require('express').Router()
const Coupon = require('../models/Coupon')
const { protect, adminOnly } = require('../middleware/auth')

// Only these fields can be set from the browser.
// usedCount and blocked are NOT here; they have their own rules.
const FIELDS = [
  'description', 'discountType', 'discountValue', 'minSubtotal', 'maxDiscount',
  'startsAt', 'expiresAt', 'usageLimit', 'perUserLimit',
]

const pick = (body) =>
  Object.fromEntries(FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]))

const sendError = (res, err) => {
  if (err.code === 11000) return res.status(400).json({ message: 'That coupon code already exists' })
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((e) => e.message).join('. ')
    return res.status(400).json({ message })
  }
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid coupon id' })
  console.error(err)
  res.status(500).json({ message: 'Server error' })
}

/* ---------- CUSTOMER (logged in) ---------- */

// POST /api/coupons/validate   body: { code, subtotal }
// Only a preview for the checkout. POST /api/orders checks again.
router.post('/validate', protect, async (req, res) => {
  try {
    const result = await Coupon.check(req.body.code, Number(req.body.subtotal) || 0, req.user._id)
    if (result.error) return res.status(400).json({ message: result.error })
    res.json({
      code: result.coupon.code,
      discount: result.discount,
      description: result.coupon.description,
    })
  } catch (err) {
    sendError(res, err)
  }
})

/* ---------- ADMIN ---------- */

// GET /api/coupons
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 })
    res.json({ coupons })
  } catch (err) {
    sendError(res, err)
  }
})

// POST /api/coupons
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const coupon = await Coupon.create({ code: req.body.code, ...pick(req.body) })
    res.status(201).json({ coupon })
  } catch (err) {
    sendError(res, err)
  }
})

// PUT /api/coupons/:id  (the code itself cannot change, orders remember it)
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' })
    coupon.set(pick(req.body))
    await coupon.save()
    res.json({ coupon })
  } catch (err) {
    sendError(res, err)
  }
})

// PATCH /api/coupons/:id/block   body: { blocked: true | false }
router.patch('/:id/block', protect, adminOnly, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' })
    coupon.blocked = Boolean(req.body.blocked)
    await coupon.save()
    res.json({ coupon })
  } catch (err) {
    sendError(res, err)
  }
})

// DELETE /api/coupons/:id
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id)
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' })
    res.json({ message: 'Coupon deleted' })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router