const router = require('express').Router()
const Conversation = require('../models/Conversation')
const { protect, adminOnly, optionalAuth } = require('../middleware/auth')

const clean = (t) => String(t || '').trim().slice(0, 1000)

const QUICK_REPLIES = {
  shipping: {
    label: 'Shipping & Delivery',
    response: `Shipping Information:\n\n• Delivery Time: 3-5 business days\n• Free Shipping: On orders over PHP 2,000\n• Tracking: You'll receive a tracking number via email once your order ships.\n\nFor international shipping, please allow 7-14 business days.`,
  },
  returns: {
    label: 'Returns & Exchanges',
    response: `Returns Policy:\n\n• Return Window: 30 days from delivery\n• Condition: Items must be unworn, unwashed, with tags attached\n• Process: Contact us to initiate a return. We'll provide a prepaid shipping label.\n\nRefunds are processed within 5-7 business days after we receive your return.`,
  },
  payment: {
    label: 'Payment Methods',
    response: `We accept:\n\n• Credit/Debit Cards (Visa, Mastercard, Amex)\n• GCash\n• Maya\n• PayPal\n• Bank Transfer\n\nAll transactions are secure and encrypted.`,
  },
  contact: {
    label: 'Contact Us',
    response: `Get in touch:\n\n• Email: support@4thestreets.com\n• Phone: +63 (2) 1234-5678\n• Hours: Mon-Fri 9AM - 6PM\n\nWe typically respond within 24 hours.`,
  },
  order: {
    label: 'Order Status',
    response: `Order Status:\n\nTo check your order status:\n1. Log in to your account\n2. Go to "My Orders"\n3. Click "Track Order" on your recent purchase\n\nYou can also use the tracking number sent to your email.\n\nNeed help? Contact us with your order number!`,
  },
  sizing: {
    label: 'Size Guide',
    response: `Size Guide:\n\nOur streetwear fits are designed to be:\n• Oversized: Go 1 size down for regular fit\n• Regular: True to size\n• Slim: Go 1 size up for comfortable fit\n\nMeasurements (in inches):\n• XS: Chest 34-36, Waist 28-30\n• S: Chest 36-38, Waist 30-32\n• M: Chest 38-40, Waist 32-34\n• L: Chest 40-42, Waist 34-36\n• XL: Chest 42-44, Waist 36-38\n\nNeed help? Message us your measurements!`,
  },
}

/* ---------- CUSTOMER / GUEST ---------- */

// Load my conversation
router.get('/mine', optionalAuth, async (req, res) => {
  const guestId = req.headers['x-guest-id']
  let conv = null
  if (req.user) conv = await Conversation.findOne({ user: req.user._id })
  else if (guestId) conv = await Conversation.findOne({ guestId, user: null })

  if (conv?.unreadForCustomer)
    await Conversation.updateOne({ _id: conv._id }, { unreadForCustomer: 0 })

  res.json({ messages: conv ? conv.messages : [] })
})

// Send a message (creates the conversation on the first message)
router.post('/', optionalAuth, async (req, res) => {
  const text = clean(req.body.text)
  if (!text) return res.status(400).json({ message: 'Message is empty' })

  const guestId = req.headers['x-guest-id']
  if (!req.user && !guestId) return res.status(400).json({ message: 'Missing guest id' })

  const filter = req.user ? { user: req.user._id } : { guestId, user: null }
  const update = {
    $push: { messages: { sender: 'customer', text } },
    $set: { lastMessageAt: new Date() },
    $inc: { unreadForAdmin: 1 },
  }
  if (!req.user)
    update.$setOnInsert = { guestName: clean(req.body.guestName) || `Guest ${guestId.slice(0, 4)}` }

  const conv = await Conversation.findOneAndUpdate(filter, update, {
    upsert: true, returnDocument: 'after',
  })
  res.status(201).json({ message: conv.messages[conv.messages.length - 1] })
})

// Quick reply: saves the customer's question + the canned answer.
// It does NOT raise any unread badge (nobody needs to answer it).
router.post('/quick', optionalAuth, async (req, res) => {
  try {
    const reply = QUICK_REPLIES[req.body.option]
    if (!reply) return res.status(400).json({ message: 'Unknown option' })

    const guestId = req.headers['x-guest-id']
    if (!req.user && !guestId) return res.status(400).json({ message: 'Missing guest id' })

    const filter = req.user ? { user: req.user._id } : { guestId, user: null }
    const update = {
      $push: {
        messages: {
          $each: [
            { sender: 'customer', text: reply.label, quick: true },
            { sender: 'bot', text: reply.response, quick: true },
          ],
        },
      },
    }
    if (!req.user) update.$setOnInsert = { guestName: `Guest ${guestId.slice(0, 4)}` }

    const conv = await Conversation.findOneAndUpdate(filter, update, {
      upsert: true, returnDocument: 'after',
    })
    res.status(201).json({ messages: conv.messages.slice(-2) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

/* ---------- ADMIN ---------- */

// Inbox list (logged-in customers + guests)
router.get('/admin/conversations', protect, adminOnly, async (req, res) => {
  const list = await Conversation.find()
    .populate('user', 'username fullName email')
    .sort({ lastMessageAt: -1 })

  res.json({
    conversations: list.map((c) => ({
      _id: c._id,
      user: c.user,
      guestName: c.guestName,
      unreadForAdmin: c.unreadForAdmin,
      lastMessageAt: c.lastMessageAt,
      lastMessage: [...c.messages].reverse().find((m) => !m.quick)?.text || '',
    })),
  })
})

// One conversation: by conversation id (inbox) or by user id (Customers page)
router.get('/admin/conversation', protect, adminOnly, async (req, res) => {
  const { id, user } = req.query
  const conversation = id
    ? await Conversation.findById(id)
    : await Conversation.findOne({ user })

  if (conversation?.unreadForAdmin)
    await Conversation.updateOne({ _id: conversation._id }, { unreadForAdmin: 0 })

  res.json({ conversation })
})

// Admin reply (creates the conversation if the admin messages a customer first)
router.post('/admin/reply', protect, adminOnly, async (req, res) => {
  const text = clean(req.body.text)
  const { conversation: id, user } = req.body
  if (!text) return res.status(400).json({ message: 'Message is empty' })
  if (!id && !user) return res.status(400).json({ message: 'No recipient' })

  const conversation = await Conversation.findOneAndUpdate(
    id ? { _id: id } : { user },
    {
      $push: { messages: { sender: 'admin', text } },
      $set: { lastMessageAt: new Date() },
      $inc: { unreadForCustomer: 1 },
    },
    { upsert: !id, returnDocument: 'after' }
  )
  if (!conversation) return res.status(404).json({ message: 'Conversation not found' })
  res.json({ conversation })
})

// Store side: how many admin replies I haven't read (works for guests too)
router.get('/mine/unread', optionalAuth, async (req, res) => {
  const guestId = req.headers['x-guest-id']
  const filter = req.user ? { user: req.user._id } : guestId ? { guestId, user: null } : null
  const conv = filter ? await Conversation.findOne(filter).select('unreadForCustomer') : null
  res.json({ count: conv?.unreadForCustomer || 0 })
})

// Admin side: total unread customer messages across all conversations
router.get('/admin/unread', protect, adminOnly, async (req, res) => {
  const [result] = await Conversation.aggregate([
    { $group: { _id: null, total: { $sum: '$unreadForAdmin' } } },
  ])
  res.json({ count: result?.total || 0 })
})

// ADMIN: delete ONE message (the admin's or the customer's)
router.delete(
  '/admin/conversation/:id/messages/:messageId',
  protect, adminOnly,
  async (req, res) => {
    try {
      const conv = await Conversation.findById(req.params.id)
      if (!conv) return res.status(404).json({ message: 'Conversation not found' })
      if (!conv.messages.id(req.params.messageId))
        return res.status(404).json({ message: 'Message not found' })

      conv.messages.pull(req.params.messageId)

      // keep the inbox preview and unread counters correct
      const last = conv.messages.at(-1)
      conv.lastMessageAt = last ? last.createdAt : conv.createdAt
      const fromCustomer = conv.messages.filter((m) => m.sender === 'customer').length
      const fromAdmin = conv.messages.filter((m) => m.sender === 'admin').length
      conv.unreadForAdmin = Math.min(conv.unreadForAdmin, fromCustomer)
      conv.unreadForCustomer = Math.min(conv.unreadForCustomer, fromAdmin)

      await conv.save()
      res.json({ conversation: conv })
    } catch (err) {
      if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' })
      console.error(err)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

// ADMIN: reset the conversation to zero (deletes ALL its messages)
router.delete('/admin/conversation/:id/messages', protect, adminOnly, async (req, res) => {
  try {
    const conversation = await Conversation.findByIdAndUpdate(
      req.params.id,
      { $set: { messages: [], unreadForAdmin: 0, unreadForCustomer: 0 } },
      { returnDocument: 'after' }
    )
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' })
    res.json({ conversation })
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' })
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router