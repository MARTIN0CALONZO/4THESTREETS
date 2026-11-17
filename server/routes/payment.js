const router = require('express').Router()
const jwt = require('jsonwebtoken')
const Order = require('../models/Orders_item')
const { cancelUnpaidOrder, markOrderPaid } = require('./cancelOrder')

const PAYMONGO_URL = 'https://api.paymongo.com/v2/checkout_sessions'

const MOCK = process.env.PAYMENT_MODE === 'mock'
if (MOCK) console.warn('[payments] MOCK payment mode is ON (simulation lang, walang totoong bayad).')

const isLiveKey = (key) => String(key || '').startsWith('sk_live_')
if (!MOCK && isLiveKey(process.env.PAYMONGO_SECRET_KEY)) {
  console.error('[payments] BABALA: sk_live_ key ang nasa PAYMONGO_SECRET_KEY. Tatanggihan ang lahat ng checkout. Gamitin ang sk_test_ key.')
}

const PAYMENT_METHODS = ['gcash']

function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ message: 'Not authenticated.' })
    req.userId = jwt.verify(token, process.env.JWT_SECRET).id
    next()
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' })
  }
}

router.post('/checkout', requireAuth, async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.body.orderId, user: req.userId })
        if (!order) return res.status(404).json({ message: 'Order not found.' })
        if (order.status !== 'pending') {
        return res.status(400).json({ message: 'This order can no longer be paid.' })
        }

        if (MOCK) {
        const mockToken = jwt.sign(
            { orderId: String(order._id), purpose: 'mock-pay' },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        )
        const serverUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`

        order.checkoutSessionId = `mock_${Date.now()}`
        order.paymentMethod = 'gcash'
        await order.save()

        return res.json({
            checkoutUrl: `${serverUrl}/api/payments/mock-checkout?token=${encodeURIComponent(mockToken)}`,
        })
        }

        if (!process.env.PAYMONGO_SECRET_KEY) {
        throw new Error('PAYMONGO_SECRET_KEY is missing')
        }

        // Huwag payagan ang live key (totoong pera)
        if (isLiveKey(process.env.PAYMONGO_SECRET_KEY)) {
        console.error('[payments] Tinanggihan ang checkout: sk_live_ key ang gamit. Palitan ng sk_test_.')
        return res.status(500).json({
            message: 'Live payments are disabled in this project. Please use a test key.',
        })
        }

        // PayMongo gumagamit ng centavos (₱150.00 = 15000)
        const expected = Math.round(Number(order.total) * 100)

        let lineItems = order.items.map((i) => ({
        name: i.name,
        amount: Math.round(Number(i.price) * 100),
        currency: 'PHP',
        quantity: Number(i.qty),
        }))
        if (Number(order.shippingFee) > 0) {
        lineItems.push({
            name: 'Shipping fee',
            amount: Math.round(Number(order.shippingFee) * 100),
            currency: 'PHP',
            quantity: 1,
        })
        }

        const sum = lineItems.reduce((s, i) => s + i.amount * i.quantity, 0)
        if (sum !== expected) {
        lineItems = [
            { name: `Order #${order.orderNumber}`, amount: expected, currency: 'PHP', quantity: 1 },
        ]
        }

        const client = process.env.CLIENT_URL || 'http://localhost:3000'

        const response = await fetch(PAYMONGO_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization:
            'Basic ' + Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64'),
        },
        body: JSON.stringify({
            data: {
            attributes: {
                line_items: lineItems,
                payment_method_types: PAYMENT_METHODS,
                success_url: `${client}/?payment=success&order=${order.orderNumber}`,
                cancel_url: `${client}/?payment=cancelled&order=${order.orderNumber}`,
                reference_number: String(order.orderNumber),
                send_email_receipt: true,
                metadata: { orderId: String(order._id) },
            },
            },
        }),
    })

    const json = await response.json()

    if (!response.ok) {
      console.error('PayMongo error:', JSON.stringify(json))
      return res.status(502).json({ message: 'Could not start payment. Please try again.' })
    }

    order.checkoutSessionId = json.data.id
    order.paymentMethod = 'gcash'
    await order.save()

    return res.json({ checkoutUrl: json.data.attributes.checkout_url })
  } catch (error) {
    console.error('Create checkout error:', error)
    return res.status(500).json({ message: 'Could not start payment. Please try again.' })
  }
})

async function fetchPaidPayment(sessionId) {
  const key = process.env.PAYMONGO_SECRET_KEY
  if (!key || isLiveKey(key)) return null 

  const headers = { Authorization: 'Basic ' + Buffer.from(`${key}:`).toString('base64') }

  for (const version of ['v2', 'v1']) {
    const r = await fetch(`https://api.paymongo.com/${version}/checkout_sessions/${sessionId}`, { headers })
    if (!r.ok) continue

    const json = await r.json()
    const attrs = json.data?.attributes || json.attributes || {}
    const paid = (attrs.payments || []).find((p) => (p.attributes?.status ?? p.status) === 'paid')
    if (!paid) return null

    return { id: paid.id, amount: paid.attributes?.amount ?? paid.amount }
  }
  return null
}

router.get('/status', requireAuth, async (req, res) => {
  try {
    const order = await Order.findOne({
      orderNumber: String(req.query.order || ''),
      user: req.userId,
    })
    if (!order) return res.status(404).json({ message: 'Order not found.' })

    let status = order.status

    if (status === 'pending' && String(order.checkoutSessionId || '').startsWith('cs_')) {
      try {
        const paid = await fetchPaidPayment(order.checkoutSessionId)
        if (paid) {
          const expected = Math.round(Number(order.total) * 100)
          if (paid.amount == null || paid.amount === expected) {
            await markOrderPaid(order._id, paid.id)
          } else {
            console.error(`Verify: amount mismatch for ${order.orderNumber}: paid ${paid.amount}, expected ${expected}`)
          }
          status = (await Order.findById(order._id)).status
        }
      } catch (e) {
        console.error('Verify payment error:', e.message)
      }
    }

    return res.json({ status })
  } catch (error) {
    console.error('Payment status error:', error)
    return res.status(500).json({ message: 'Could not check the payment.' })
  }
})

router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const order = await Order.findOne({
      orderNumber: String(req.body.orderNumber || ''),
      user: req.userId,
    })
    if (!order) return res.status(404).json({ message: 'Order not found.' })

    const cancelled = await cancelUnpaidOrder(order._id, 'Payment cancelled by customer')

    const current = cancelled || (await Order.findById(order._id))
    return res.json({ cancelled: !!cancelled, status: current.status })
  } catch (error) {
    console.error('Cancel order error:', error)
    return res.status(500).json({ message: 'Could not cancel the order.' })
  }
})

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const peso = (n) =>
  'PHP ' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function readMockToken(token) {
  const payload = jwt.verify(String(token || ''), process.env.JWT_SECRET)
  if (payload.purpose !== 'mock-pay') throw new Error('Wrong token')
  return payload.orderId
}

router.get('/mock-checkout', async (req, res) => {
  if (!MOCK) return res.status(404).send('Not found')

  try {
    const orderId = readMockToken(req.query.token)
    const order = await Order.findById(orderId)
    if (!order) return res.status(404).send('Order not found.')

    const token = esc(req.query.token)

    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Simulated GCash Payment</title>
<style>
  body { font-family: Arial, sans-serif; background: #f3f4f6; margin: 0; display: flex;
         justify-content: center; align-items: center; min-height: 100vh; }
  .card { background: #fff; width: 360px; max-width: 92vw; border-radius: 14px;
          box-shadow: 0 10px 30px rgba(0,0,0,.12); overflow: hidden; }
  .banner { background: #fef3c7; color: #92400e; font-size: 12px; text-align: center; padding: 8px; }
  .head { background: #007dfe; color: #fff; padding: 20px; }
  .head h1 { margin: 0; font-size: 20px; }
  .body { padding: 20px; }
  .row { display: flex; justify-content: space-between; margin: 10px 0; font-size: 15px; }
  .total { font-weight: 700; font-size: 18px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  button { width: 100%; padding: 13px; border: 0; border-radius: 8px; font-size: 15px;
           font-weight: 700; cursor: pointer; margin-top: 10px; }
  .pay { background: #007dfe; color: #fff; }
  .cancel { background: #e5e7eb; color: #111; }
</style>
</head>
<body>
  <div class="card">
    <div class="banner">SIMULATION ONLY &mdash; walang totoong pera na gagalaw</div>
    <div class="head"><h1>GCash (Simulated)</h1></div>
    <div class="body">
      <div class="row"><span>Merchant</span><span>4THESTREETS</span></div>
      <div class="row"><span>Order</span><span>#${esc(order.orderNumber)}</span></div>
      <div class="row total"><span>Amount</span><span>${esc(peso(order.total))}</span></div>

      <form method="POST" action="/api/payments/mock-checkout/complete">
        <input type="hidden" name="token" value="${token}">
        <button class="pay" name="result" value="paid">Pay (simulate success)</button>
        <button class="cancel" name="result" value="cancel">Cancel / Fail</button>
      </form>
    </div>
  </div>
</body>
</html>`)
  } catch {
    res.status(400).send('Invalid or expired payment link. Please place your order again.')
  }
})

router.post('/mock-checkout/complete', require('express').urlencoded({ extended: false }), async (req, res) => {
  if (!MOCK) return res.status(404).send('Not found')

  try {
    const orderId = readMockToken(req.body.token)
    const order = await Order.findById(orderId)
    if (!order) return res.status(404).send('Order not found.')

    const client = process.env.CLIENT_URL || 'http://localhost:3000'

    if (req.body.result === 'paid') {
      await markOrderPaid(order._id, `mock_pay_${Date.now()}`)
      return res.redirect(303, `${client}/?payment=success&order=${encodeURIComponent(order.orderNumber)}`)
    }

    return res.redirect(303, `${client}/?payment=cancelled&order=${encodeURIComponent(order.orderNumber)}`)
  } catch {
    res.status(400).send('Invalid or expired payment link. Please place your order again.')
  }
})

module.exports = router