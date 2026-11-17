require('dotenv').config()
const mongoose = require('mongoose')
const Review = require('../models/Review')

async function run() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)

  console.log('Indexes BEFORE:')
  console.log(await Review.collection.getIndexes())

  // binubura ang mga index na wala sa schema, at ginagawa ang kulang
  await Review.syncIndexes()

  console.log('Indexes AFTER:')
  console.log(await Review.collection.getIndexes())

  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})