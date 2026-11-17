const router = require('express').Router()
const Product = require('../models/Product')
const { protect, adminOnly } = require('../middleware/auth')
const { FOLDER, isDataUrl, uploadImage } = require('../config/cloudinary')

// Only these fields can be set from the browser
const FIELDS = [
  'code', 'name', 'category', 'subcategory', 'styles', 'price',
  'sizes', 'stock', 'sizeStock', 'color', 'description', 'image', 'images',
]
const SLOTS = ['front', 'back', 'model']

const pick = (body) =>
  Object.fromEntries(FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]))

const sendError = (res, err) => {
  if (err.name === 'UploadError')
    return res.status(502).json({ message: `Image upload failed: ${err.message}` })
  if (err.code === 11000) return res.status(400).json({ message: 'Item code already exists' })
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((e) => e.message).join('. ')
    return res.status(400).json({ message })
  }
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid product id' })
  console.error(err)
  res.status(500).json({ message: 'Server error' })
}

// Replaces every base64 picture on the product with a Cloudinary URL.
// Pictures that are already URLs are left untouched.
async function moveImagesToCloudinary(product) {
  const code = String(product.code || 'item').replace(/[^A-Za-z0-9_-]/g, '_')
  const stamp = Date.now() // unique id, so a failed/duplicate save can never overwrite another product's picture

  await Promise.all(
    SLOTS.map(async (slot) => {
      const value = product.images?.[slot]
      if (!isDataUrl(value)) return
      const url = await uploadImage(value, `${FOLDER}/products/${code}/${slot}-${stamp}`)
      product.set(`images.${slot}`, url)
    })
  )

  // keep the old single-image field mirroring the front picture
  product.image = product.images.front
}

const LOW_STOCK = 5

// ADMIN: every product/size that is low or out of stock
router.get('/low-stock', protect, adminOnly, async (req, res) => {
  try {
    // skip the pictures, we don't need them here
    const products = await Product.find().select('-images -image').sort({ name: 1 })

    const alerts = []
    for (const p of products) {
      // products with per-size stock are checked size by size;
      // old products (no sizeStock) are checked using their total stock
      const rows = p.sizeStock?.length
        ? p.sizeStock.map((s) => ({ size: s.size, stock: s.stock }))
        : [{ size: null, stock: p.stock }]

      for (const r of rows) {
        if (r.stock <= LOW_STOCK) {
          alerts.push({
            productId: p._id,
            code: p.code,
            name: p.name,
            category: p.category,
            size: r.size,
            stock: r.stock,
            level: r.stock <= 0 ? 'out' : 'low',
          })
        }
      }
    }

    // out of stock first, then the lowest numbers
    alerts.sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name))
    res.json({ alerts, threshold: LOW_STOCK })
  } catch (err) {
    sendError(res, err)
  }
})

// PUBLIC: list products. Used by the store pages and PickProd.
// /api/products?category=tops&style=streetwear&minPrice=500&maxPrice=1500
// The admin Inventory page adds ?full=1 to also get the back/model pictures.
router.get('/', async (req, res) => {
  try {
    const { category, subcategory, style, minPrice, maxPrice, inStock, full } = req.query
    const filter = {}
    if (category) filter.category = category
    if (subcategory) filter.subcategory = subcategory
    if (style) filter.styles = style
    if (inStock === 'true') filter.stock = { $gt: 0 }
    if (minPrice || maxPrice) {
      filter.price = {}
      if (minPrice) filter.price.$gte = Number(minPrice)
      if (maxPrice) filter.price.$lte = Number(maxPrice)
    }

    // The store only needs the front picture, so skip the extras.
    const fields = full === '1' ? '' : '-images.back -images.model'
    const products = await Product.find(filter).select(fields).sort({ createdAt: -1 }).lean()

    if (full !== '1') {
      // Old products only have `image`; always hand the store a usable front picture
      for (const p of products) {
        const front = p.images?.front || p.image || ''
        p.images = { front }
        p.image = front
      }
    }
    res.json({ products })
  } catch (err) {
    sendError(res, err)
  }
})

// ADMIN: create
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const product = new Product(pick(req.body))
    await product.validate() // fail early, before spending any uploads

    if (await Product.exists({ code: product.code }))
      return res.status(400).json({ message: 'Item code already exists' })

    await moveImagesToCloudinary(product)
    await product.save()
    res.status(201).json({ product })
  } catch (err) {
    sendError(res, err)
  }
})

// ADMIN: update
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ message: 'Product not found' })

    product.set(pick(req.body))
    await product.validate() // full validation, including the subcategory rule

    if (
      product.isModified('code') &&
      (await Product.exists({ code: product.code, _id: { $ne: product._id } }))
    )
      return res.status(400).json({ message: 'Item code already exists' })

    await moveImagesToCloudinary(product)
    await product.save()
    res.json({ product })
  } catch (err) {
    sendError(res, err)
  }
})

// ADMIN: delete
// (Cloudinary pictures are kept on purpose: old orders still show them.)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id)
    if (!product) return res.status(404).json({ message: 'Product not found' })
    res.json({ message: 'Product deleted' })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router