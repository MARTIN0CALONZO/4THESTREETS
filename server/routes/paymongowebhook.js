const crypto = require('crypto')
const Order = require('../models/Orders_item')
const { markOrderPaid } = require('./cancelOrder')

function isValidSignature(rawBody, header, secret) {
  if (!header || !secret) return false

  const parts = {}
  for (const piece of header.split(',')) {
    const [k, ...v] = piece.split('=')
    parts[k.trim()] = v.join('=').trim()
  }

  const provided = parts.li || parts.te
  if (!parts.t || !provided) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex')

  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

module.exports = async (req, res) => {
  const rawBody = req.body.toString('utf8')

  console.log('[webhook] may dumating na request galing sa PayMongo')

  if (!process.env.PAYMONGO_WEBHOOK_SECRET) {
    console.error('[webhook] WALANG PAYMONGO_WEBHOOK_SECRET sa .env (o hindi na-restart ang server).')
  }
  if (!isValidSignature(rawBody, req.headers['paymongo-signature'], process.env.PAYMONGO_WEBHOOK_SECRET)) {
    console.error('[webhook] INVALID SIGNATURE: tingnan kung tama ang PAYMONGO_WEBHOOK_SECRET (whsk_...) ng mismong webhook na ito.')
    return res.status(400).json({ message: 'Invalid signature.' })
  }

  res.status(200).json({ received: true })

  try {
    const body = JSON.parse(rawBody)

    const evt = body.data || {}
    const type = evt.type || evt.attributes?.type
    const session = evt.data || evt.attributes?.data

    if (type !== 'checkout_session.payment.paid' || !session) {
      console.log(`[webhook] na-skip ang event na "${type}" (kailangan: checkout_session.payment.paid)`)
      return
    }

    const reference = session.attributes?.reference_number
    const payment = (session.attributes?.payments || []).find(
      (p) => p.attributes?.status === 'paid'
    )
    if (!reference || !payment) return

    const order = await Order.findOne({ orderNumber: reference })
    if (!order) return console.error('Webhook: order not found', reference)

    // Nakansela na ang order (hal. kinansela ng customer o na-expire) pero may pumasok na bayad
    if (order.status === 'cancelled') {
      console.error(
        `Webhook: may bayad (${payment.id}) para sa NAKANSELANG order ${reference}. I-refund sa PayMongo dashboard.`
      )
      return
    }

    const paidAmount = payment.attributes.amount
    const expected = Math.round(Number(order.total) * 100)
    if (paidAmount !== expected) {
      console.error(`Webhook: amount mismatch for ${reference}: paid ${paidAmount}, expected ${expected}`)
      return
    }

    const done = await markOrderPaid(order._id, payment.id)
    console.log(done ? `[webhook] PAID na ang order ${reference}` : `[webhook] ${reference} ay hindi na pending (na-update na dati)`)
  } catch (err) {
    console.error('Webhook processing error:', err)
  }
}