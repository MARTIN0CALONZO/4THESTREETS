require('dotenv').config()
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')

const { startUnpaidOrderSweeper } = require('../server/routes/cancelOrder')

const app = express()

const Review = require('./models/Review')

mongoose.connection.once('open', async () => {
  try {
    await Review.syncIndexes()
    console.log('Review indexes synced')
  } catch (err) {
    console.error('Review index sync failed:', err)
  }
})



app.set('trust proxy', 1)
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }))

app.post(
  '/api/payments/webhook',
  express.raw({ type: '*/*' }),
  require('./routes/paymongowebhook')
)

app.use(express.json({ limit: '15mb' }))

app.use('/api/payments', require('./routes/payment'))

app.use('/api/auth', require('./routes/auth'))
app.use('/api/orders', require('./routes/order_items'))
app.use('/api/profile', require('./routes/profile'))
app.use('/api/messages', require('./routes/messages'))
app.use('/api/products', require('./routes/products'))
app.use('/api/users', require('./routes/users'))
app.use('/api/coupons', require('./routes/coupons'))
app.use('/api/admin/reviews', require('./routes/adminReviews'));

app.get('/', (req, res) => res.send('API running'))

const orderReviews = require('./routes/orderReviews')

app.use('/api/orders', orderReviews)

const orderRoutes = require('./routes/order_items')

app.use('/api/orders', orderRoutes)

const PORT = process.env.PORT || 5000

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected')

    startUnpaidOrderSweeper()

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err)
    process.exit(1)
  })