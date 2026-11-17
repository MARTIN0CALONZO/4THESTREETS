const express = require('express')
const mongoose = require('mongoose')
const Order = require('../models/Orders_item')
const Review = require('../models/Review')

const authModule = require('../middleware/auth')

const requireAuth =
  typeof authModule === 'function'
    ? authModule
    : authModule.requireAuth ||
      authModule.protect ||
      authModule.auth ||
      authModule.verifyToken ||
      authModule.authenticate

if (typeof requireAuth !== 'function') {
  throw new Error('Authentication middleware not found.')
}

const router = express.Router()

// ========================================
// GET PUBLIC PRODUCT REVIEWS
// ========================================
// Mounted at /api/orders:
// GET /api/orders/reviews/product/:productId

router.get('/reviews/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        message: 'Invalid product ID.'
      })
    }

    // Hidden reviews must never reach the public store.
    // $ne: true also matches older reviews that have no isHidden field.
    const reviews = await Review.find({
      product: productId,
      isHidden: { $ne: true }
    })
      .populate('user', 'username fullName')
      .sort({ createdAt: -1 })
      .lean()

    const totalReviews = reviews.length

    const averageRating = totalReviews
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews
      : 0

    return res.json({
      reviews: reviews.map((review) => ({
        _id: review._id,
        userId: review.user?._id || null,
        username:
          review.user?.fullName ||
          review.user?.username ||
          'Customer',
        rating: review.rating,
        comment: review.comment,
        reply: review.reply || '',
        createdAt: review.createdAt
      })),
      totalReviews,
      averageRating: Number(averageRating.toFixed(1))
    })
  } catch (error) {
    console.error('GET product reviews failed:', error)

    return res.status(500).json({
      message: 'Could not load product reviews.'
    })
  }
})

// ========================================
// SUBMIT PRODUCT REVIEW
// ========================================
// POST /api/orders/:id/review

router.post('/:id/review', requireAuth, async (req, res) => {
  try {
    const { rating, comment, productId } = req.body || {}
    const userId = req.user?.id || req.user?._id

    if (!userId) {
      return res.status(401).json({
        message: 'Please log in first.'
      })
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid order ID.'
      })
    }

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        message: 'Please select a valid product to review.'
      })
    }

    const numericRating = Number(rating)

    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        message: 'Please select a rating from 1 to 5.'
      })
    }

    if (
      typeof comment !== 'string' ||
      comment.trim().length < 10 ||
      comment.trim().length > 500
    ) {
      return res.status(400).json({
        message: 'Review must contain 10 to 500 characters.'
      })
    }

    const order = await Order.findOne({
      _id: req.params.id,
      user: userId
    })

    if (!order) {
      return res.status(404).json({
        message: 'Order not found.'
      })
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({
        message: 'Only delivered orders can be reviewed.'
      })
    }

    // Verify that the product belongs to this order.
    const item = order.items.find(
      (item) => String(item.product) === String(productId)
    )

    if (!item) {
      return res.status(400).json({
        message: 'This product is not included in your order.'
      })
    }

    // Only one review per product per order.
    const existing = await Review.findOne({
      order: order._id,
      product: productId
    })

    if (existing) {
      return res.status(409).json({
        message: 'You have already reviewed this product.'
      })
    }

    const review = await Review.create({
      user: userId,
      order: order._id,
      product: productId,
      rating: numericRating,
      comment: comment.trim()
    })

    // Maintain compatibility with existing order.reviewed.
    // True only when all distinct products have reviews.
    const productIds = [
      ...new Set(
        order.items
          .filter((item) => item.product)
          .map((item) => String(item.product))
      )
    ]

    const reviewedProductIds = await Review.distinct(
      'product',
      { order: order._id }
    )

    const reviewedSet = new Set(
      reviewedProductIds.map(String)
    )

    order.reviewed = productIds.every(
      (id) => reviewedSet.has(id)
    )

    await order.save()

    return res.status(201).json({
      message: 'Product review submitted successfully!',
      review,
      order
    })
  } catch (error) {
    console.error('POST order review failed:', error)

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'You have already reviewed this product.'
      })
    }

    return res.status(500).json({
      message: 'Could not submit review.'
    })
  }
})

// ========================================
// GET MY REVIEWS FOR AN ORDER
// ========================================
// GET /api/orders/:id/reviews

router.get('/:id/reviews', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid order ID.'
      })
    }

    const order = await Order.findOne({
      _id: req.params.id,
      user: userId
    })

    if (!order) {
      return res.status(404).json({
        message: 'Order not found.'
      })
    }

    const reviews = await Review.find({
      order: order._id,
      user: userId
    }).sort({ createdAt: -1 })

    return res.json({ reviews })
  } catch (error) {
    console.error('GET order reviews failed:', error)

    return res.status(500).json({
      message: 'Could not load order reviews.'
    })
  }
})

// ========================================
// LEGACY SINGLE REVIEW ENDPOINT
// ========================================
// GET /api/orders/:id/review
// Retained for existing frontend compatibility.

router.get('/:id/review', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid order ID.'
      })
    }

    const order = await Order.findOne({
      _id: req.params.id,
      user: userId
    })

    if (!order) {
      return res.status(404).json({
        message: 'Order not found.'
      })
    }

    const review = await Review.findOne({
      order: order._id,
      user: userId
    }).sort({ createdAt: -1 })

    return res.json({ review })
  } catch (error) {
    console.error('GET order review failed:', error)

    return res.status(500).json({
      message: 'Could not load review.'
    })
  }
})

module.exports = router