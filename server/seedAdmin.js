require('dotenv').config()
const mongoose = require('mongoose')
const User = require('./models/User')

;(async () => {
  await mongoose.connect(process.env.MONGO_URI)
  if (await User.findOne({ role: 'admin' })) {
    console.log('Admin already exists')
  } else {
    await User.create({
      username: 'admin', fullName: 'Store Admin',
      email: 'admin@4thestreets.com', password: 'admin123', role: 'admin',
    })
    console.log('Admin created')
  }
  process.exit()
})()