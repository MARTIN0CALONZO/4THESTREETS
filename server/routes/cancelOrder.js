const Order = require('../models/Orders_item')
const Product = require('../models/Product')
const Coupon = require('../models/Coupon')

const sizedUpdate = (p, size) => p.sizeStock?.some((s) => s.size === size)

async function deductItems(order) {
  const items = order.items.filter((i) => i.product)
  const prods = await Product.find({ _id: { $in: items.map((i) => i.product) } })

  await Promise.all(
    items.map((i) => {
      const p = prods.find((x) => String(x._id) === String(i.product))
      if (!p) return null 
      const sized = sizedUpdate(p, i.size)
      return Product.updateOne(
        { _id: i.product },
        {
          $inc: {
            stock: -i.qty,
            sold: i.qty,
            ...(sized && { 'sizeStock.$[s].stock': -i.qty }),
          },
        },
        sized ? { arrayFilters: [{ 's.size': i.size }] } : {}
      )
    })
  )

  const after = await Product.find({ _id: { $in: items.map((i) => i.product) } })
  after.forEach((p) => {
    if (p.stock < 0) console.error(`[orders] BABALA: negatibo na ang stock ng "${p.name}" (${p.stock}) pagkatapos ng order ${order.orderNumber}.`)
  })
}

async function restockItems(order) {
  const items = order.items.filter((i) => i.product)
  const prods = await Product.find({ _id: { $in: items.map((i) => i.product) } })

  await Promise.all(
    items.map((i) => {
      const p = prods.find((x) => String(x._id) === String(i.product))
      if (!p) return null
      const sized = sizedUpdate(p, i.size)
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

async function releaseCoupon(order) {
  if (!order.coupon) return
  await Coupon.updateOne(
    { code: order.coupon, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } }
  )
}

async function markOrderPaid(orderId, paymentId) {
  const before = await Order.findOneAndUpdate(
    { _id: orderId, status: 'pending' },
    {
      $set: {
        status: 'paid',
        paidAt: new Date(),
        paymongoPaymentId: paymentId,
        stockDeducted: true,
      },
    },
    { returnDocument: 'before' }
  )
  if (!before) return null

  if (before.stockDeducted === false) {
    await deductItems(before)
  }
  return before
}

async function cancelUnpaidOrder(orderId, reason = 'Payment not completed') {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: 'pending' },
    { $set: { status: 'cancelled', cancelReason: reason } },
    { returnDocument: 'after' }
  )
  if (!order) return null

  await releaseCoupon(order)

  if (order.stockDeducted !== false) {
    await restockItems(order)
  }
  return order
}

async function expireUnpaidOrders(minutes) {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000)
  const stale = await Order.find({
    status: 'pending',
    checkoutSessionId: { $regex: '.+' },
    createdAt: { $lt: cutoff },
  }).select('_id orderNumber')

  for (const o of stale) {
    const done = await cancelUnpaidOrder(o._id, 'Payment not completed in time')
    if (done) console.log(`[orders] Kinansela ang unpaid order ${o.orderNumber}`)
  }
}

function startUnpaidOrderSweeper() {
  const minutes = Number(process.env.UNPAID_ORDER_MINUTES ?? 30)
  if (!minutes) return

  const run = () => expireUnpaidOrders(minutes).catch((e) => console.error('[orders] sweeper error:', e))
  setTimeout(run, 30 * 1000).unref()
  setInterval(run, 5 * 60 * 1000).unref()
}

module.exports = { markOrderPaid, cancelUnpaidOrder, expireUnpaidOrders, startUnpaidOrderSweeper }