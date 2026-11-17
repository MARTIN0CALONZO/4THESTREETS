const mongoose = require('mongoose')

// Mga saved address ng user (checkout, /profile/addresses at admin Customers page)
// `address` at `details` ay laging pareho ang laman (tingnan ang pre('validate') sa ibaba).
const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: 'Home' },
    address: { type: String, trim: true }, // buong address na text (ginagamit ng admin page)
    details: { type: String, trim: true }, // parehong laman (ginagamit ng Nav.js sa checkout)
    isDefault: { type: Boolean, default: false },
    recipient: { type: String, trim: true },
    phone: { type: String, trim: true },
    street: { type: String, trim: true },
    barangay: { type: String, trim: true },
    city: { type: String, trim: true },
    province: { type: String, trim: true },
    zip: { type: String, trim: true },
  },
  { strict: false } // hindi mawawala ang ibang field na ipinapadala ng ibang form
)

// Walang `next` parameter: hindi na ito sinusuportahan ng bagong Mongoose.
addressSchema.pre('validate', function () {
  if (!this.address && this.details) this.address = this.details
  if (!this.details && this.address) this.details = this.address

  // Kung walang buong address, buuin mula sa mga parte
  if (!this.address) {
    const built =
      [this.street, this.barangay, this.city, this.province].filter(Boolean).join(', ') +
      (this.zip ? ' ' + this.zip : '')
    if (built.trim()) {
      this.address = built.trim()
      this.details = built.trim()
    }
  }

  if (!this.address) {
    this.invalidate('address', 'Address is required.')
  }
})

// NOTE: Ang password dito ay HASHED na (ginagawa sa routes/auth.js).
// Walang pre('save') hook, kaya walang double-hash.
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, required: true, trim: true },
    // Hindi na required: puwedeng ma-empty kapag binura ng admin ang lahat ng address.
    // Sa registration, ang routes/auth.js ang nagche-check na may laman ito.
    address: { type: String, trim: true, default: '' },
    addressParts: {
      street: String,
      barangay: String,
      city: String,
      province: String,
      zip: String,
    },
    addresses: { type: [addressSchema], default: [] },
    // Hindi na required: may mga lumang account na walang birthDate
    birthDate: { type: Date },
    password: { type: String, required: true },
    // 'user' ang gamit ng admin Customers page; 'customer' ay tinanggap lang para sa
    // mga account na nagawa habang 'customer' ang default.
    role: { type: String, enum: ['user', 'customer', 'admin'], default: 'user' },
    blocked: { type: Boolean, default: false },
  },
  { timestamps: true }
)

if (mongoose.models.User) {
  console.warn(
    "[models/User.js] May ibang 'User' model na naka-register na. Alisin ang duplicate mongoose.model('User', ...) sa ibang file."
  )
}

module.exports = mongoose.models.User || mongoose.model('User', userSchema)