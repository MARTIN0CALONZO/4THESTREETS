const mongoose = require('mongoose')

const pendingRegistrationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  username: { type: String, required: true },
  otpHash: { type: String, required: true },
  encryptedPayload: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, required: true },
  expiresAt: {
    type: Date,
    required: true,
    expires: 0,
  },
})

module.exports = mongoose.model(
  'PendingRegistration',
  pendingRegistrationSchema
)