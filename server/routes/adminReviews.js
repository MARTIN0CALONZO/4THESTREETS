const express = require('express');
const router = express.Router();
const Review = require('../models/Review');

// Import the exact function names exported by your auth middleware
const { protect, adminOnly } = require('../middleware/auth');

// GET all reviews for admin
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate('user', 'fullName username email')
      .populate('product', 'name images')
      .sort({ createdAt: -1 });
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update a review (Edit comment, hide/unhide, or reply)
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { comment, reply, isHidden, rating } = req.body;
    
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { comment, reply, isHidden, rating },
      { new: true }
    )
    .populate('user', 'fullName username email')
    .populate('product', 'name images');

    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ review });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE a review
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;