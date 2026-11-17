
const router = require('express').Router()
const mongoose = require('mongoose')
const User = require('../models/User')
const { protect, adminOnly } = require('../middleware/auth')

// Every route in this file is admin-only
router.use(protect, adminOnly)

const PARTS = ['street', 'barangay', 'city', 'province', 'zip']

const REQUIRED = {
  street: 'street or house number',
  barangay: 'barangay',
  city: 'city / municipality',
  province: 'province',
}

const compose = (p) =>
  [p.street, p.barangay, p.city, p.province]
    .filter(Boolean)
    .join(', ') + (p.zip ? ' ' + p.zip : '')

// Shape sent to the admin Customers page
const customerView = (u) => {
  const saved = (u.addresses || []).map((a) => ({
    id: a._id,
    label: a.label || 'Address',
    address: a.address || a.details || '',
    street: a.street || '',
    barangay: a.barangay || '',
    city: a.city || '',
    province: a.province || '',
    zip: a.zip || '',
    isDefault: !!a.isDefault,
  }))

  const addresses = saved.length
    ? saved
    : u.address
      ? [{
          id: 'legacy',
          label: 'Home',
          address: u.address,
          street: '',
          barangay: '',
          city: '',
          province: '',
          zip: '',
          isDefault: true,
        }]
      : []

  return {
    id: u._id,
    username: u.username,
    fullName: u.fullName || '',
    email: u.email,
    phone: u.phone || '',
    blocked: !!u.blocked,
    createdAt: u.createdAt,
    addresses,
  }
}

const CUSTOMER = { role: { $ne: 'admin' } }

router.get('/', async (req, res) => {
  try {
    const users = await User.find(CUSTOMER).sort({ createdAt: -1 })

    res.json({
      customers: users.map(customerView),
    })
  } catch (err) {
    console.error('List customers error:', err)
    res.status(500).json({
      message: 'Could not load customers.',
    })
  }
})

router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid customer ID.',
      })
    }

    const user = await User.findOne({
      _id: req.params.id,
      ...CUSTOMER,
    })

    if (!user) {
      return res.status(404).json({
        message: 'Customer not found.',
      })
    }

    const { fullName, phone, email, addresses } = req.body

    if (fullName !== undefined) user.fullName = fullName
    if (phone !== undefined) user.phone = phone
    if (email !== undefined) user.email = email

    if (Array.isArray(addresses)) {
      const list = []

      for (const a of addresses) {
        const parts = Object.fromEntries(
          PARTS.map((k) => [k, String(a[k] ?? '').trim()])
        )

        let address = String(
          a.address || a.details || ''
        ).trim()

        if (PARTS.some((k) => parts[k])) {
          for (const [k, name] of Object.entries(REQUIRED)) {
            if (!parts[k]) {
              return res.status(400).json({
                message: `Please enter the ${name}.`,
              })
            }
          }

          address = compose(parts)
        }

        if (!address) continue

        list.push({
          ...(mongoose.isValidObjectId(a.id)
            ? { _id: a.id }
            : {}),

          label: String(a.label || 'Address')
            .trim()
            .slice(0, 30) || 'Address',

          address,
          details: address,

          ...parts,

          isDefault: !!a.isDefault,
        })
      }

      const defaultIndex = list.findIndex(
        (a) => a.isDefault
      )

      list.forEach((a, i) => {
        a.isDefault = i === (
          defaultIndex >= 0 ? defaultIndex : 0
        )
      })

      user.addresses = list

      user.address =
        list.find((a) => a.isDefault)?.address || ''
    }

    await user.save()

    res.json({
      customer: customerView(user),
    })
  } catch (err) {
    console.error('Update customer error:', err)

    if (err.code === 11000) {
      return res.status(400).json({
        message: 'Email already used.',
      })
    }

    res.status(400).json({
      message: err.message,
    })
  }
})

router.patch('/:id/block', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid customer ID.',
      })
    }

    const { blocked } = req.body

    if (typeof blocked !== 'boolean') {
      return res.status(400).json({
        message: 'Blocked must be true or false.',
      })
    }

    const user = await User.findOne({
      _id: req.params.id,
      ...CUSTOMER,
    })

    if (!user) {
      return res.status(404).json({
        message: 'Customer not found.',
      })
    }

    user.blocked = blocked

    await user.save()

    res.json({
      customer: customerView(user),
    })
  } catch (err) {
    console.error('Block customer error:', err)

    res.status(400).json({
      message: err.message,
    })
  }
})

module.exports = router