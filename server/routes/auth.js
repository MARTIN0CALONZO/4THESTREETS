
const router = require('express').Router()
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs') // gamitin ang 'bcrypt' kung iyon ang naka-install sa project mo

const User = require('../models/User')
const PendingRegistration = require('../models/PendingRegistration')
const PasswordReset = require('../models/PasswordReset')

const OTP_LIFETIME_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_OTP_ATTEMPTS = 5

// ---------------------------------------------------------------
// Cloudflare Turnstile CAPTCHA verification
// ---------------------------------------------------------------
async function verifyTurnstile(token, remoteIp) {
  if (!token || !process.env.TURNSTILE_SECRET_KEY) {
    return false
  }

  const params = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY,
    response: token,
  })

  if (remoteIp) {
    params.set('remoteip', remoteIp)
  }

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    }
  )

  if (!response.ok) return false

  const result = await response.json()
  return result.success === true
}

// ---------------------------------------------------------------
// Encrypt / decrypt registration details while waiting for OTP
// ---------------------------------------------------------------
function getEncryptionKey() {
  const key = process.env.OTP_ENCRYPTION_KEY

  if (!key || !/^[a-f0-9]{64}$/i.test(key)) {
    throw new Error(
      'OTP_ENCRYPTION_KEY must contain 64 hexadecimal characters'
    )
  }

  return Buffer.from(key, 'hex')
}

function encryptPayload(payload) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    iv
  )

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ])

  return [
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    encrypted.toString('hex'),
  ].join(':')
}

function decryptPayload(encryptedPayload) {
  const [ivHex, tagHex, dataHex] = encryptedPayload.split(':')

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivHex, 'hex')
  )
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ])

  return JSON.parse(decrypted.toString('utf8'))
}

// ---------------------------------------------------------------
// Send OTP through Gmail
// ---------------------------------------------------------------
async function sendOtpEmail(email, otp) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Gmail environment variables are missing')
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })

  await transporter.sendMail({
    from: `"4THESTREETS" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Your 4THESTREETS verification code',
    text: `Your verification code is ${otp}. It expires in 5 minutes. If you did not request this code, ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif">
        <h2>4THESTREETS Email Verification</h2>
        <p>Your verification code is:</p>
        <h1 style="letter-spacing: 6px">${otp}</h1>
        <p>This code expires in 5 minutes.</p>
        <p>If you did not request this code, ignore this email.</p>
      </div>
    `,
  })
}

const RESET_WINDOW_MS = 10 * 60 * 1000 // time allowed to type the new password after the OTP

async function sendResetEmail(email, otp) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Gmail environment variables are missing')
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  })

  await transporter.sendMail({
    from: `"4THESTREETS" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Reset your 4THESTREETS password',
    text: `Your password reset code is ${otp}. It expires in 5 minutes. If you did not request this, ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif">
        <h2>4THESTREETS Password Reset</h2>
        <p>Your password reset code is:</p>
        <h1 style="letter-spacing: 6px">${otp}</h1>
        <p>This code expires in 5 minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  })
}

// ---------------------------------------------------------------
// POST /api/auth/register/request-otp
// ---------------------------------------------------------------
router.post('/register/request-otp', async (req, res) => {
  try {
    const {
      username,
      fullName,
      email: rawEmail,
      phone,
      address,
      addressParts,
      birthDate,
      password,
      confirmPassword,
    } = req.body

    // 1. Validate required fields
    if (
      !username?.trim() ||
      !fullName?.trim() ||
      !rawEmail?.trim() ||
      !phone?.trim() ||
      !address?.trim() ||
      !birthDate ||
      !password
    ) {
      return res.status(400).json({
        message: 'Please complete all required registration fields.',
      })
    }

    const email = rawEmail.trim().toLowerCase()
    const cleanUsername = username.trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        message: 'Please enter a valid email address.',
      })
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters.',
      })
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({
        message: 'Passwords do not match.',
      })
    }

    if (
      !addressParts ||
      !['street', 'barangay', 'city', 'province'].every(
        (field) =>
          typeof addressParts[field] === 'string' &&
          addressParts[field].trim()
      )
    ) {
      return res.status(400).json({
        message: 'Please complete your address.',
      })
    }

    // 2. Verify Cloudflare CAPTCHA
    const captchaToken = req.body.captchaToken || req.body.turnstileToken
    const captchaValid = await verifyTurnstile(captchaToken, req.ip)

    if (!captchaValid) {
      return res.status(400).json({
        message: 'CAPTCHA verification failed. Please try again.',
      })
    }

    // 3. Check whether the account already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username: cleanUsername }],
    })

    if (existingUser) {
      return res.status(409).json({
        message: 'Username or email already used.',
      })
    }

    // 4. Prevent repeated OTP requests
    const existingPending = await PendingRegistration.findOne({ email })

    if (
      existingPending &&
      Date.now() - existingPending.lastSentAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      return res.status(429).json({
        message: 'Please wait 60 seconds before requesting another code.',
      })
    }

    // 5. Generate OTP and encrypt pending registration details
    const otp = crypto.randomInt(100000, 1000000).toString()
    const now = new Date()

    const registration = {
      username: cleanUsername,
      fullName: fullName.trim(),
      email,
      phone: phone.trim(),
      address: address.trim(),
      addressParts: {
        street: addressParts.street.trim(),
        barangay: addressParts.barangay.trim(),
        city: addressParts.city.trim(),
        province: addressParts.province.trim(),
        ...(addressParts.zip ? { zip: addressParts.zip.trim() } : {}),
      },
      birthDate,
      password,
    }

    const encryptedPayload = encryptPayload(registration)
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex')

    // 6. Send email before saving the new OTP
    await sendOtpEmail(email, otp)

    // 7. Save pending registration; never store the plain OTP/password
    await PendingRegistration.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          username: cleanUsername,
          otpHash,
          encryptedPayload,
          attempts: 0,
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    )

    return res.status(200).json({
      message: 'Verification code sent to your email.',
    })
  } catch (error) {
    console.error('Request OTP error:', error)

    return res.status(500).json({
      message: 'Could not send verification code. Please try again.',
    })
  }
})

// ---------------------------------------------------------------
// POST /api/auth/register/verify-otp
// ---------------------------------------------------------------
router.post('/register/verify-otp', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const otp = String(req.body.otp || '').trim()

    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: 'Please enter the six-digit verification code.',
      })
    }

    const pending = await PendingRegistration.findOne({ email })

    if (!pending || pending.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({
        message: 'Verification code expired. Please request a new one.',
      })
    }

    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      await PendingRegistration.deleteOne({ _id: pending._id })
      return res.status(429).json({
        message: 'Too many incorrect attempts. Please request a new code.',
      })
    }

    // Compare OTP hashes in constant time
    const submittedHash = crypto.createHash('sha256').update(otp).digest()
    const storedHash = Buffer.from(pending.otpHash, 'hex')

    if (!crypto.timingSafeEqual(submittedHash, storedHash)) {
      pending.attempts += 1
      await pending.save()
      return res.status(400).json({
        message: 'Incorrect verification code.',
      })
    }

    // OTP is correct: decrypt the saved registration details
    const data = decryptPayload(pending.encryptedPayload)

    // Re-check in case someone registered while the OTP was pending
    const existingUser = await User.findOne({
      $or: [{ email: data.email }, { username: data.username }],
    })

    if (existingUser) {
      await PendingRegistration.deleteOne({ _id: pending._id })
      return res.status(409).json({
        message: 'Username or email already used.',
      })
    }

    // NOTE: kung may pre('save') hash hook na ang User model mo,
    // palitan ito ng: const passwordHash = data.password
    const passwordHash = await bcrypt.hash(data.password, 10)

    const user = await User.create({
      username: data.username,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      address: data.address,
      addressParts: data.addressParts,
      birthDate: data.birthDate,
      password: passwordHash,
    })

    await PendingRegistration.deleteOne({ _id: pending._id })

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    return res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Verify OTP error:', error)

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Username or email already used.',
      })
    }

    return res.status(500).json({
      message: 'Could not verify the code. Please try again.',
    })
  }
})

// ---------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const identifier = String(req.body.identifier || '').trim()
    const password = String(req.body.password || '')

    if (!identifier || !password) {
      return res.status(400).json({
        message: 'Please enter your username and password.',
      })
    }

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    })

    // Same message for both cases so attackers can't tell which accounts exist
    const invalid = () =>
      res.status(401).json({ message: 'Invalid username or password.' })

    if (!user) return invalid()

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return invalid()

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    return res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ message: 'Login failed. Please try again.' })
  }
})

// ---------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------
router.get('/me', async (req, res) => {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated.' })
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.id).select('-password')

    if (!user) {
      return res.status(401).json({ message: 'User not found.' })
    }

    return res.json({ user })
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' })
  }
})

// Test route: buksan sa browser -> http://localhost:5000/api/auth/ping
router.get('/ping', (req, res) => res.json({ ok: true, routes: 'auth loaded' }))

// ---------------------------------------------------------------
// STEP 1: POST /api/auth/forgot/request-otp   body: { email, captchaToken }
// ---------------------------------------------------------------
router.post('/forgot/request-otp', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' })
    }

    const captchaToken = req.body.captchaToken || req.body.turnstileToken
    if (!(await verifyTurnstile(captchaToken, req.ip))) {
      return res.status(400).json({ message: 'CAPTCHA verification failed. Please try again.' })
    }

    // Same answer whether or not the email exists, so nobody can probe which emails are registered
    const generic = {
      message: 'If that email is registered, a verification code has been sent.',
    }

    const user = await User.findOne({ email })
    if (!user) return res.status(200).json(generic)

    const existing = await PasswordReset.findOne({ email })
    if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      return res.status(429).json({
        message: 'Please wait 60 seconds before requesting another code.',
      })
    }

    const otp = crypto.randomInt(100000, 1000000).toString()
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex')
    const now = new Date()

    await sendResetEmail(email, otp)

    await PasswordReset.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          otpHash,
          resetTokenHash: '',
          attempts: 0,
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
        },
      },
      { upsert: true, new: true, runValidators: true }
    )

    return res.status(200).json(generic)
  } catch (error) {
    console.error('Forgot request OTP error:', error)
    return res.status(500).json({ message: 'Could not send verification code. Please try again.' })
  }
})

// ---------------------------------------------------------------
// STEP 2: POST /api/auth/forgot/verify-otp   body: { email, otp }
// Returns a one-time resetToken that STEP 3 needs.
// ---------------------------------------------------------------
router.post('/forgot/verify-otp', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const otp = String(req.body.otp || '').trim()

    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: 'Please enter the six-digit verification code.' })
    }

    const pending = await PasswordReset.findOne({ email })

    // resetTokenHash already set = this code was already used
    if (!pending || pending.resetTokenHash || pending.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({
        message: 'Verification code expired. Please request a new one.',
      })
    }

    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      await PasswordReset.deleteOne({ _id: pending._id })
      return res.status(429).json({
        message: 'Too many incorrect attempts. Please request a new code.',
      })
    }

    const submittedHash = crypto.createHash('sha256').update(otp).digest()
    const storedHash = Buffer.from(pending.otpHash, 'hex')

    if (!crypto.timingSafeEqual(submittedHash, storedHash)) {
      pending.attempts += 1
      await pending.save()
      return res.status(400).json({ message: 'Incorrect verification code.' })
    }

    // OTP is correct: issue a one-time reset token (only its hash is stored)
    const resetToken = crypto.randomBytes(32).toString('hex')
    pending.resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex')
    pending.expiresAt = new Date(Date.now() + RESET_WINDOW_MS)
    await pending.save()

    return res.json({ resetToken })
  } catch (error) {
    console.error('Forgot verify OTP error:', error)
    return res.status(500).json({ message: 'Could not verify the code. Please try again.' })
  }
})

// ---------------------------------------------------------------
// STEP 3: POST /api/auth/forgot/reset   body: { email, resetToken, password, confirmPassword }
// ---------------------------------------------------------------
router.post('/forgot/reset', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const resetToken = String(req.body.resetToken || '')
    const password = String(req.body.password || '')
    const confirmPassword = req.body.confirmPassword

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' })
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' })
    }

    const pending = await PasswordReset.findOne({ email })

    if (!pending || !pending.resetTokenHash || pending.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({
        message: 'Your reset session expired. Please start again.',
      })
    }

    const submitted = crypto.createHash('sha256').update(resetToken).digest()
    const stored = Buffer.from(pending.resetTokenHash, 'hex')

    if (submitted.length !== stored.length || !crypto.timingSafeEqual(submitted, stored)) {
      return res.status(400).json({ message: 'Invalid reset session. Please start again.' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      await PasswordReset.deleteOne({ _id: pending._id })
      return res.status(400).json({ message: 'Account not found.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    // updateOne skips full validation, so old accounts with missing fields still work
    await User.updateOne({ _id: user._id }, { $set: { password: passwordHash } })

    await PasswordReset.deleteOne({ _id: pending._id })

    return res.json({ message: 'Password changed. You can now log in.' })
  } catch (error) {
    console.error('Forgot reset error:', error)
    return res.status(500).json({ message: 'Could not change the password. Please try again.' })
  }
})

module.exports = router