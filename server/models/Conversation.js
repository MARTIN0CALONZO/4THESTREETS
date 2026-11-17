const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema({
  sender: { type: String, enum: ['customer', 'admin', 'bot'], required: true },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  quick: { type: Boolean, default: false }, // true = a canned quick-reply exchange
  createdAt: { type: Date, default: Date.now },
})

const conversationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = guest
  guestId: { type: String, default: null, index: true },
  guestName: { type: String, default: '' },
  messages: [messageSchema],
  lastMessageAt: { type: Date, default: Date.now },
  unreadForAdmin: { type: Number, default: 0 },
  unreadForCustomer: { type: Number, default: 0 },
}, { timestamps: true })

module.exports = mongoose.model('Conversation', conversationSchema)