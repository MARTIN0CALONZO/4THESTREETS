const mongoose = require('mongoose')

const SUBCATEGORIES = {
  tops: ['shirts', 'hoodies', 'longsleeves'],
  bottoms: ['pants', 'shorts'],
  accessories: [],
}
const STYLES = ['streetwear', 'minimalist', 'vintage', 'bold', 'y2k']

const productSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: Object.keys(SUBCATEGORIES), required: true },
    subcategory: { type: String, default: '' },
    styles: {
      type: [{ type: String, enum: STYLES }],
      validate: { validator: (v) => v.length > 0, message: 'Pick at least one style' },
    },
    price: { type: Number, required: true, min: 0 },
        sizes: { type: [String], default: [] },
    stock: { type: Number, default: 0, min: 0 }, // now = total of all sizes
    sizeStock: {
      type: [
        {
          _id: false,
          size: { type: String, required: true },
          stock: { type: Number, default: 0, min: 0 },
        },
      ],
      default: [],
    },
    color: { type: String, default: '' },
    description: { type: String, default: '' },

    // NEW: up to three pictures (base64 data URLs, resized in the browser)
    images: {
      front: { type: String, default: '' },
      back:  { type: String, default: '' },
      model: { type: String, default: '' },
    },
    // Old single-image field: always mirrors images.front so PickProd/Products keep working
    image: { type: String, default: '' },

    sold: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 5, min: 0, max: 5 },
  },
  { timestamps: true }
)

productSchema.pre('validate', function () {
  const subs = SUBCATEGORIES[this.category]
    // Per-size stock drives the sizes list and the total stock
  if (this.sizeStock && this.sizeStock.length) {
    this.sizes = this.sizeStock.map((s) => s.size)
    this.stock = this.sizeStock.reduce((n, s) => n + (s.stock || 0), 0)
  }
  if (subs && subs.length && !subs.includes(this.subcategory)) {
    this.invalidate('subcategory', `Subcategory must be one of: ${subs.join(', ')}`)
  }
  if (subs && subs.length === 0) this.subcategory = ''

  // Old products only have `image` -> treat it as the front picture
  if (!this.images.front && this.image) this.images.front = this.image
  if (!this.images.front) this.invalidate('images.front', 'Front picture is required')
  this.image = this.images.front
})

const Product = mongoose.model('Product', productSchema)
Product.SUBCATEGORIES = SUBCATEGORIES
Product.STYLES = STYLES
module.exports = Product