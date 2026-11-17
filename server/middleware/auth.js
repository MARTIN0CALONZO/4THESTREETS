const jwt = require('jsonwebtoken')
const User = require('../models/User')

const BLOCKED_MSG = 'Your account has been blocked. Please contact our customer support.'

exports.BLOCKED_MSG = BLOCKED_MSG

exports.protect = async (req, res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ message: 'Not logged in' })

  let user
  try {
    const { id } = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET)
    user = await User.findById(id)
    if (!user) throw new Error()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }

  // A user blocked AFTER logging in is kicked out on their next request
  if (user.blocked) return res.status(403).json({ message: BLOCKED_MSG })

  req.user = user
  next()
}

exports.optionalAuth = async (req, res, next) => {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const { id } = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET)
      req.user = await User.findById(id)
    } catch { /* bad token = treat as guest */ }
  }
  next()
}

exports.adminOnly = (req, res, next) =>
  req.user?.role === 'admin'
    ? next()
    : res.status(403).json({ message: 'Admins only' })