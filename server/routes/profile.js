const express = require('express')
const User = require('../models/User')

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
  throw new Error(
    'Walang login middleware na nahanap sa middleware/auth.js. Mga na-export: ' +
      Object.keys(authModule || {}).join(', ')
  )
}

function addressesSchemaProblem() {
  const path = User.schema.path('addresses')
  if (!path) return 'Walang "addresses" field sa User model.'
  const sub = path.schema
  if (!sub) return 'Dapat array ng subdocument ang "addresses" sa User model.'
  const missing = ['label', 'address', 'isDefault', 'street', 'barangay', 'city', 'province', 'zip'].filter(
    (k) => !sub.path(k)
  )
  if (missing.length) {
    return `Kulang ang mga field sa addresses ng User model: ${missing.join(', ')}.`
  }
  const required = Object.keys(sub.paths).filter(
    (k) => sub.paths[k].isRequired && k !== 'address' && k !== '_id'
  )
  if (required.length) {
    return `May required na field sa addresses na hindi ko ipinapadala: ${required.join(', ')}.`
  }
  return null
}

{
  const problem = addressesSchemaProblem()
  if (problem) {
    console.error(
      '⚠️  ' + problem + ' Palitan ang "addresses" sa models/User.js ng nasa gabay.'
    )
  }
}

const router = express.Router()
const userId = (req) => req.user.id || req.user._id

const EDITABLE = ['fullName', 'phone']

router.put('/', requireAuth, async (req, res) => {
  try {
    const updates = {}
    for (const key of EDITABLE) {
      if (req.body[key] !== undefined) updates[key] = String(req.body[key]).trim()
    }

    if (req.body.birthDate !== undefined) {
      if (req.body.birthDate === '' || req.body.birthDate === null) {
        updates.birthDate = null
      } else {
        const d = new Date(req.body.birthDate)
        if (isNaN(d.getTime()) || d > new Date()) {
          return res.status(400).json({ message: 'Please enter a valid birth date.' })
        }
        updates.birthDate = d
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Nothing to update.' })
    }
    if (updates.fullName !== undefined && !updates.fullName) {
      return res.status(400).json({ message: 'Full name is required.' })
    }
    if (updates.phone && !/^[0-9+()\-\s]{7,20}$/.test(updates.phone)) {
      return res.status(400).json({ message: 'Please enter a valid phone number.' })
    }

    const user = await User.findByIdAndUpdate(
      userId(req),
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    ).select('-password')

    if (!user) return res.status(404).json({ message: 'User not found.' })
    res.json({ user })
  } catch (err) {
    console.error('PUT /profile failed:', err)
    res.status(500).json({ message: err.message || 'Could not update profile.' })
  }
})


const schemaReady = (res) => {
  const problem = addressesSchemaProblem()
  if (!problem) return true
  res.status(500).json({
    message: 'Server setup incomplete: ' + problem + ' Ayusin ang "addresses" sa models/User.js.',
  })
  return false
}

async function loadUser(req) {
  const user = await User.findById(userId(req))
  if (!user) return null

  if (user.addresses.length === 0 && user.address) {
    user.addresses.push({ label: 'Home', address: user.address, isDefault: true })
    await user.save({ validateModifiedOnly: true })
  }
  return user
}

function normalizeDefault(user, preferredId) {
  const list = user.addresses
  if (list.length === 0) {
    user.address = ''
    return
  }
  let def = preferredId ? list.id(preferredId) : null
  if (!def) def = list.find((a) => a.isDefault) || list[0]
  list.forEach((a) => {
    a.isDefault = String(a._id) === String(def._id)
  })
  user.address = def.address
}

const clean = (list) =>
  list.map((a) => ({
    _id: a._id,
    label: a.label,
    details: a.address,
    street: a.street || '',
    barangay: a.barangay || '',
    city: a.city || '',
    province: a.province || '',
    zip: a.zip || '',
    isDefault: !!a.isDefault,
  }))

const PART_FIELDS = ['street', 'barangay', 'city', 'province', 'zip']
const REQUIRED_PARTS = {
  street: 'street or house number',
  barangay: 'barangay',
  city: 'city / municipality',
  province: 'province',
}

const composeAddress = (p) =>
  [p.street, p.barangay, p.city, p.province].filter(Boolean).join(', ') +
  (p.zip ? ' ' + p.zip : '')

function validate(body, { partial }) {
  const out = {}

  if (body.label !== undefined || !partial) {
    const label = String(body.label || 'Home').trim() || 'Home'
    if (label.length > 30) return { error: 'Label is too long (max 30 characters).' }
    out.label = label
  }

  const hasParts = PART_FIELDS.some((k) => body[k] !== undefined)
  if (hasParts) {
    const parts = {}
    for (const k of PART_FIELDS) {
      const v = String(body[k] ?? '').trim()
      if (v.length > (k === 'zip' ? 10 : 100)) return { error: `The ${k} is too long.` }
      parts[k] = v
    }
    for (const [k, name] of Object.entries(REQUIRED_PARTS)) {
      if (!parts[k]) return { error: `Please enter the ${name}.` }
    }
    if (parts.zip && !/^[0-9A-Za-z\- ]{3,10}$/.test(parts.zip)) {
      return { error: 'Please enter a valid ZIP code.' }
    }
    out.parts = parts
    out.address = composeAddress(parts)
  } else if (body.details !== undefined || !partial) {
    const details = String(body.details || '').trim()
    if (!details) return { error: 'Please complete the address.' }
    if (details.length > 300) return { error: 'Address is too long (max 300 characters).' }
    out.address = details
  }

  return { value: out }
}

router.get('/addresses', requireAuth, async (req, res) => {
  try {
    if (!schemaReady(res)) return
    const user = await loadUser(req)
    if (!user) return res.status(404).json({ message: 'User not found.' })
    res.json({ addresses: clean(user.addresses) })
  } catch (err) {
    console.error('GET /profile/addresses failed:', err)
    res.status(500).json({ message: err.message })
  }
})

router.post('/addresses', requireAuth, async (req, res) => {
  try {
    if (!schemaReady(res)) return
    const { error, value } = validate(req.body, { partial: false })
    if (error) return res.status(400).json({ message: error })

    const user = await loadUser(req)
    if (!user) return res.status(404).json({ message: 'User not found.' })
    if (user.addresses.length >= 10) {
      return res.status(400).json({ message: 'You can save up to 10 addresses.' })
    }

    user.addresses.push({
      label: value.label,
      address: value.address,
      ...(value.parts || {}),
      isDefault: false,
    })
    const added = user.addresses[user.addresses.length - 1]
    const makeDefault = req.body.isDefault === true || user.addresses.length === 1
    normalizeDefault(user, makeDefault ? added._id : null)

    await user.save({ validateModifiedOnly: true })
    res.status(201).json({ addresses: clean(user.addresses) })
  } catch (err) {
    console.error('POST /profile/addresses failed:', err)
    res.status(500).json({ message: err.message })
  }
})

router.put('/addresses/:id', requireAuth, async (req, res) => {
  try {
    if (!schemaReady(res)) return
    const { error, value } = validate(req.body, { partial: true })
    if (error) return res.status(400).json({ message: error })

    const user = await loadUser(req)
    if (!user) return res.status(404).json({ message: 'User not found.' })

    const addr = user.addresses.id(req.params.id)
    if (!addr) return res.status(404).json({ message: 'Address not found.' })

    if (value.label !== undefined) addr.label = value.label
    if (value.address !== undefined) {
      addr.address = value.address
      if (value.parts) PART_FIELDS.forEach((k) => (addr[k] = value.parts[k]))
    }
    normalizeDefault(user, req.body.isDefault === true ? addr._id : null)

    await user.save({ validateModifiedOnly: true })
    res.json({ addresses: clean(user.addresses) })
  } catch (err) {
    console.error('PUT /profile/addresses failed:', err)
    res.status(500).json({ message: err.message })
  }
})

router.delete('/addresses/:id', requireAuth, async (req, res) => {
  try {
    if (!schemaReady(res)) return
    const user = await loadUser(req)
    if (!user) return res.status(404).json({ message: 'User not found.' })

    const addr = user.addresses.id(req.params.id)
    if (!addr) return res.status(404).json({ message: 'Address not found.' })

    user.addresses.pull(addr._id)
    normalizeDefault(user, null)

    await user.save({ validateModifiedOnly: true })
    res.json({ addresses: clean(user.addresses) })
  } catch (err) {
    console.error('DELETE /profile/addresses failed:', err)
    res.status(500).json({ message: err.message })
  }
})

module.exports = router