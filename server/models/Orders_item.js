const mongoose = require('mongoose')

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        price: Number,
        qty: Number,
        color: String,
        size: String,
        image: String,
        
      },
    ],

    shipping: {
      name: { type: String, required: true },
      address: { type: String, required: true },
      contact: { type: String, required: true },
    },

    paymentMethod: { type: String, enum: ['gcash', 'maya', 'paypal'], required: true },

    subtotal: Number,
    shippingFee: Number,
    discount: { type: Number, default: 0 },
    coupon: { type: String, default: '' },
    total: Number,


    status: {
      type: String,
      enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },

    stockDeducted: { type: Boolean, default: true },

    checkoutSessionId: { type: String, default: '' },
    paymongoPaymentId: { type: String, default: '' },
    paidAt: Date,
    cancelReason: { type: String, default: '' },
    
    reviewed: {
      type: Boolean,
      default: false
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Order', orderSchema)