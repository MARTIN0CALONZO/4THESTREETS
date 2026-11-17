const Coupon = require('../models/Coupon')
const express = require('express')
const Order = require('../models/Orders_item')
const Product = require('../models/Product')
const User = require('../models/User')
const Conversation = require('../models/Conversation')
const Review = require('../models/Review')

const authModule = require('../middleware/auth')
const requireAuth =
  typeof authModule === 'function'
    ? authModule
    : authModule.requireAuth ||
      authModule.protect ||
      authModule.auth ||
      authModule.verifyToken ||
      authModule.authenticate

if (typeof requireAuth !== 'function') {
  throw new Error(
    'Walang login middleware na nahanap sa middleware/auth.js. Mga na-export: ' +
      Object.keys(authModule || {}).join(', ')
  )
}

const { adminOnly } = authModule 

const router = express.Router()

const CONFIRMED = { status: { $ne: 'pending' }, cancelReason: { $in: [null, ''] } }

const FREE_SHIPPING_MIN = 2000
const SHIPPING_FEE = 150

// ========================================
// CUSTOMER CANCEL ORDER
// POST /api/orders/:id/cancel
// ========================================

router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const orderId = req.params.id
    const userId = req.user.id || req.user._id

    if (!Order.db.base.isValidObjectId(orderId)) {
      return res.status(400).json({
        message: 'Invalid order ID.'
      })
    }

    const order = await Order.findOne({
      _id: orderId,
      user: userId
    })

    if (!order) {
      return res.status(404).json({
        message: 'Order not found.'
      })
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({
        message: 'This order is already cancelled.'
      })
    }

    if (!['pending', 'paid'].includes(order.status)) {
      return res.status(400).json({
        message: 'Shipped or delivered orders cannot be cancelled.'
      })
    }

    const wasPaid = order.status === 'paid'

    // Claim the cancellation once to prevent duplicate requests.
    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: orderId,
        user: userId,
        status: order.status
      },
      {
        $set: {
          status: 'cancelled',
          cancelReason: 'Cancelled by customer'
        }
      },
      { new: true }
    )

    if (!updatedOrder) {
      return res.status(409).json({
        message: 'Order status changed. Please refresh and try again.'
      })
    }

    // Restore stock only when it was previously deducted.
    if (updatedOrder.stockDeducted === true) {
      for (const item of updatedOrder.items) {
        if (!item.product) continue

        const product = await Product.findById(item.product)
        if (!product) continue

        const quantity = Number(item.qty) || 0
        if (quantity <= 0) continue

        const hasSize = product.sizeStock?.some(
          (s) => s.size === item.size
        )

        const changes = {
          stock: quantity,
          sold: -quantity
        }

        if (hasSize) {
          changes['sizeStock.$[s].stock'] = quantity
        }

        await Product.updateOne(
          { _id: item.product },
          { $inc: changes },
          hasSize
            ? { arrayFilters: [{ 's.size': item.size }] }
            : {}
        )
      }
    }

    // Release coupon usage.
    if (updatedOrder.coupon) {
      await Coupon.updateOne(
        {
          code: updatedOrder.coupon,
          usedCount: { $gt: 0 }
        },
        {
          $inc: { usedCount: -1 }
        }
      )
    }

    // This is NOT an automatic refund.
    const refund = wasPaid
      ? {
          status: 'pending',
          message: 'Refund requires manual processing.'
        }
      : null

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully.',
      order: updatedOrder,
      refund
    })

  } catch (error) {
    console.error('Cancel order error:', error)

    return res.status(500).json({
      success: false,
      message: 'Unable to complete cancellation. Please contact support.'
    })
  }
})

const makeOrderNumber = () =>
  'ORD-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 90 + 10)
  router.post('/', requireAuth, async (req, res) => {
    let reservedCouponId = null 
    try {
      const { items, shipping, paymentMethod,coupon } = req.body

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Your cart is empty.' })
      }
      if (!shipping?.name || !shipping?.address || !shipping?.contact) {
        return res.status(400).json({ message: 'Please complete your shipping details.' })
      }
      if (!['gcash', 'maya', 'paypal'].includes(paymentMethod)) {
        return res.status(400).json({ message: 'Invalid payment method.' })
      }

      const ids = items.map((i) => i.productId)
      const products = await Product.find({ _id: { $in: ids } })

      const lines = []
      for (const i of items) {
        const p = products.find((x) => String(x._id) === String(i.productId))
        if (!p) {
          return res.status(400).json({ message: 'A product in your cart is no longer available.' })
        }

        const qty = Math.max(1, parseInt(i.qty, 10) || 1)
        const size = i.size || ''

        const hasSizes = p.sizeStock && p.sizeStock.length > 0
        const entry = hasSizes ? p.sizeStock.find((s) => s.size === size) : null
        const available = hasSizes ? (entry ? entry.stock : 0) : p.stock

        const already = lines
          .filter((l) => String(l.product) === String(p._id) && l.size === size)
          .reduce((n, l) => n + l.qty, 0)
        if (already + qty > available) {
          return res.status(400).json({
            message: `Not enough stock for "${p.name}"${size ? ` (size ${size})` : ''}. Only ${available} left.`,
          })
        }

        lines.push({
          product: p._id,
          name: p.name,
          price: p.price,
          qty,
          color: i.color || p.color || '',
          size,
          image: p.images?.front || p.image || '',
        })
      }

      const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0)
      const shippingFee = subtotal >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE
      let discount = 0
      let couponCode = ''
      if (coupon && String(coupon).trim()) {
        const result = await Coupon.check(coupon, subtotal, req.user._id)
        if (result.error) return res.status(400).json({ message: result.error })

        const reserved = await Coupon.reserve(result.coupon._id)
        if (!reserved) return res.status(400).json({ message: 'This coupon has reached its usage limit.' })

        reservedCouponId = reserved._id
        discount = result.discount
        couponCode = result.coupon.code
      }
      const total = subtotal + shippingFee - discount

      const order = await Order.create({
        orderNumber: makeOrderNumber(),
        user: req.user.id || req.user._id,
        items: lines,
        shipping,
        paymentMethod,
        subtotal,
        shippingFee,
        discount,
        coupon: couponCode,
        total,
        stockDeducted: false, 
      })


      res.status(201).json({ order })
    } catch (err) {
    if (reservedCouponId) await Coupon.release(reservedCouponId).catch(() => {})
    console.error('POST /orders failed:', err)
    res.status(500).json({ message: err.message || 'Could not place order.' })
  }
  })

  router.get('/mine', requireAuth, async (req, res) => {
    try {
      const orders = await Order.find({
      user: req.user.id || req.user._id,
      status: { $ne: 'pending' }
    }).sort({ createdAt: -1 })
      res.json({ orders })
    } catch (err) {
      res.status(500).json({ message: err.message })
    }
  })


  const USER_FIELDS = 'username fullName email phone'

  router.get('/', requireAuth, adminOnly, async (req, res) => {
    try {
      const orders = await Order.find(CONFIRMED).populate('user', USER_FIELDS).sort({ createdAt: -1 })
      res.json({ orders })
    } catch (err) {
      res.status(500).json({ message: err.message })
    }
  })

  router.patch('/:id/status', requireAuth, adminOnly, async (req, res) => {
    try {
      const { status } = req.body
      const allowed = Order.schema.path('status').enumValues
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: 'Invalid status.' })
      }

      const order = await Order.findById(req.params.id).populate('user', USER_FIELDS)
      if (!order) return res.status(404).json({ message: 'Order not found.' })

      if (order.status === 'cancelled' && status !== 'cancelled') {
        return res.status(400).json({ message: 'A cancelled order cannot be reopened.' })
      }

      if (status === 'cancelled' && order.status !== 'cancelled') {
        const items = order.stockDeducted === false ? [] : order.items.filter((i) => i.product)
        const prods = await Product.find({ _id: { $in: items.map((i) => i.product) } })

        if (order.coupon) {
          await Coupon.updateOne(
            { code: order.coupon, usedCount: { $gt: 0 } },
            { $inc: { usedCount: -1 } }
          )
        }

        await Promise.all(
          items.map((i) => {
            const p = prods.find((x) => String(x._id) === String(i.product))
            if (!p) return null // product was deleted since the order
            const sized = p.sizeStock?.some((s) => s.size === i.size)
            return Product.updateOne(
              { _id: i.product },
              {
                $inc: {
                  stock: i.qty,
                  sold: -i.qty,
                  ...(sized && { 'sizeStock.$[s].stock': i.qty }),
                },
              },
              sized ? { arrayFilters: [{ 's.size': i.size }] } : {}
            )
          })
        )
      }

      order.status = status
      await order.save()
      res.json({ order })
    } catch (err) {
      if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid order id.' })
      res.status(500).json({ message: err.message })
    }
  })


  const TZ_MS = 8 * 60 * 60 * 1000 
  const DAY = 24 * 60 * 60 * 1000
  const LOW_STOCK = 5
  const dayKey = (d) => new Date(d.getTime() + TZ_MS).toISOString().slice(0, 10) 

  function buildWindow(range) {
    const now = new Date()

    if (range === 'year') {
      const [y, m] = dayKey(now).split('-').map(Number)
      const keys = []
      for (let i = 11; i >= 0; i--) {
        keys.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7)) // YYYY-MM
      }
      const [sy, sm] = keys[0].split('-')
      return {
        keys,
        start: new Date(`${keys[0]}-01T00:00:00+08:00`),
        prevStart: new Date(`${Number(sy) - 1}-${sm}-01T00:00:00+08:00`),
        bucket: (d) => dayKey(d).slice(0, 7),
      }
    }

    const days = range === '30d' ? 30 : 7
    const keys = []
    for (let i = days - 1; i >= 0; i--) keys.push(dayKey(new Date(now.getTime() - i * DAY)))
    const start = new Date(`${keys[0]}T00:00:00+08:00`)
    return { keys, start, prevStart: new Date(start.getTime() - days * DAY), bucket: dayKey }
  }

  router.get('/stats', requireAuth, adminOnly, async (req, res) => {
    try {
      const range = ['7d', '30d', 'year'].includes(req.query.range) ? req.query.range : '7d'
      const w = buildWindow(range)

      const [orders, products, newCur, newPrev, toShip, unread, recent] = await Promise.all([
        Order.find({ createdAt: { $gte: w.prevStart }, ...CONFIRMED })
          .select('createdAt total status items.product items.name items.qty items.price')
          .lean(),
        Product.find().select('name code category sizeStock stock').lean(),
        User.countDocuments({ role: 'user', createdAt: { $gte: w.start } }),
        User.countDocuments({ role: 'user', createdAt: { $gte: w.prevStart, $lt: w.start } }),
        Order.countDocuments({ status: 'paid' }),
        Conversation.aggregate([{ $group: { _id: null, total: { $sum: '$unreadForAdmin' } } }]),
        Order.find(CONFIRMED)
          .sort({ createdAt: -1 })
          .limit(5)
          .select('orderNumber total status createdAt shipping.name user')
          .populate('user', 'fullName username')
          .lean(),
      ])

      const cur = orders.filter((o) => o.createdAt >= w.start)
      const prev = orders.filter((o) => o.createdAt < w.start)
      const countsAsSale = (o) => o.status !== 'cancelled' && o.status !== 'pending'
      const curSales = cur.filter(countsAsSale)
      const prevSales = prev.filter(countsAsSale)

      const sum = (list) => list.reduce((n, o) => n + (o.total || 0), 0)
      const avg = (list) => (list.length ? sum(list) / list.length : 0)

      const totals = Object.fromEntries(w.keys.map((k) => [k, 0]))
      curSales.forEach((o) => {
        const k = w.bucket(o.createdAt)
        if (k in totals) totals[k] += o.total || 0
      })
      const sales = w.keys.map((key) => ({ key, total: totals[key] }))

      const statusCounts = { pending: 0, paid: 0, shipped: 0, delivered: 0, cancelled: 0 }
      cur.forEach((o) => {
        if (o.status in statusCounts) statusCounts[o.status] += 1
      })

      const categoryOf = new Map(products.map((p) => [String(p._id), p.category]))
      const sold = new Map()
      const byCategory = { tops: 0, bottoms: 0, accessories: 0 }
      curSales.forEach((o) =>
        (o.items || []).forEach((i) => {
          const id = i.product ? String(i.product) : i.name
          const row = sold.get(id) || { name: i.name, sold: 0 }
          row.sold += i.qty || 0
          sold.set(id, row)

          const cat = categoryOf.get(String(i.product))
          if (cat in byCategory) byCategory[cat] += (i.price || 0) * (i.qty || 0)
        })
      )
      const topProducts = [...sold.values()].sort((a, b) => b.sold - a.sold).slice(0, 5)
      const categories = Object.entries(byCategory).map(([category, total]) => ({ category, total }))

      const alerts = []
      for (const p of products) {
        const rows = p.sizeStock?.length
          ? p.sizeStock.map((s) => ({ size: s.size, stock: s.stock }))
          : [{ size: null, stock: p.stock }]
        rows.forEach((r) => {
          if (r.stock <= LOW_STOCK) {
            alerts.push({
              name: p.name,
              size: r.size,
              stock: r.stock,
              level: r.stock <= 0 ? 'out' : 'low',
            })
          }
        })
      }
      alerts.sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name))

      res.json({
        range,
        kpis: {
          revenue: { value: sum(curSales), prev: sum(prevSales) },
          orders: { value: curSales.length, prev: prevSales.length },
          avgOrder: { value: avg(curSales), prev: avg(prevSales) },
          customers: { value: newCur, prev: newPrev },
        },
        actions: {
          toShip,
          outOfStock: alerts.filter((a) => a.level === 'out').length,
          unreadMessages: unread[0]?.total || 0,
        },
        sales,
        statusCounts,
        topProducts,
        categories,
        lowStock: alerts.slice(0, 3),
        recentOrders: recent.map((o) => ({
          _id: o._id,
          orderNumber: o.orderNumber,
          customer: o.user?.fullName || o.shipping?.name || o.user?.username || 'Unknown',
          total: o.total,
          status: o.status,
          createdAt: o.createdAt,
        })),
      })
    } catch (err) {
      console.error('GET /orders/stats failed:', err)
      res.status(500).json({ message: err.message || 'Could not load dashboard.' })
    }
})

module.exports = router