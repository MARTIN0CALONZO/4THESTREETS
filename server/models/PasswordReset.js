const mongoose = require('mongoose')

const passwordResetSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    otpHash: { type: String, required: true },
    resetTokenHash: { type: String, default: '' }, // set only after the OTP is verified
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, expires: 0 }, // TTL: Mongo deletes it automatically
})

module.exports = mongoose.model('PasswordReset', passwordResetSchema)