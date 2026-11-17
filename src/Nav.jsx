import { Turnstile } from '@marsidev/react-turnstile'
import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { auth } from './auth'
import { useCart, itemKey, php } from './CartContext'
import { AddressListModal, AddressFormModal } from './addressModal'
// eto yung dinagdag ko boi
import AddressFields, { emptyAddress, formatAddress, isAddressComplete } from './AddressFields'
import './index.css'
import logo from './assets/Logo.png'
import music from './assets/Music.png'
import user from './assets/Profile.png'
import usersel from './assets/ProfSel.png'
import backgroundMusic from './assets/bgm.mp3'
import Home from './assets/Home.png'
import HomeSel from './assets/HomeSel.png'
import Products from './assets/Products.png'
import HighSel from './assets/ProductSel.png'
import PickProd from './assets/PickProd.png'
import PickSel from './assets/PickSel.png'
import search from './assets/search.png'
import Cart from './assets/Cart.png'
import CartSel from './assets/CartSel.png'

import './index.css'

// ==========================================
// HELPER FUNCTIONS & CONSTANTS
// ==========================================
const toChat = (m) => ({
  id: m._id,
  sender: m.sender === 'customer' ? 'user' : 'bot', // your CSS: .user = right, .bot = left
  text: m.text,
})
// Gaano katagal hihintayin ang kumpirmasyon ng PayMongo pagbalik sa site (15 x 2s = 30 segundo)
const PAYMENT_POLL_MS = 2000
const PAYMENT_POLL_TRIES = 15
const shippingFeeFor = (sub) => (sub === 0 || sub >= 2000 ? 0 : 150)

function Nav() {
  const navigate = useNavigate()
  const location = useLocation()

  // ==========================================
  // REFS
  // ==========================================
  const audioRef = useRef(null)
  const loginIntent = useRef(null)
  const searchRef = useRef(null)

  // ==========================================
  // STATE: UI & Modals
  // ==========================================
  const [playing, setPlaying] = useState(false)
  const [showLogin, setshowLogin] = useState(false)
  const [showReg, setshowReg] = useState(false)
  const [showForgot, setshowForgot] = useState(false)
  const [hoveredNav, setHoveredNav] = useState(null)
  const [darkMode, setDarkMode] = useState(false)

  // ==========================================
  // STATE: Cart & Customer Service
  // ==========================================
  const [showCart, setShowCart] = useState(false)
  const [showCustomerService, setShowCustomerService] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [showChatOptions, setShowChatOptions] = useState(true)
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [unreadChat, setUnreadChat] = useState(0)
  const [unselected, setUnselected] = useState([]) // keys ng items na HINDI napili sa cart
  const [pendingRemove, setPendingRemove] = useState([]) // keys ng cart items na tatanggalin pagkatapos magbayad

  // ==========================================
  // STATE: Checkout
  // ==========================================
  const [showCheckout, setShowCheckout] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState('gcash')
  const [showPaymentResult, setShowPaymentResult] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState(null)
  const [shipping, setShipping] = useState({ name: '', address: '', contact: '' })
  const [coupon, setCoupon] = useState('')
  const [couponApplied, setCouponApplied] = useState(null) // { code, discount }
  const [couponMsg, setCouponMsg] = useState(null)         // { type: 'ok' | 'error', text }
  const [couponLoading, setCouponLoading] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [orderNumber, setOrderNumber] = useState(null)
  const [paidTotal, setPaidTotal] = useState(0)
  const [checkoutError, setCheckoutError] = useState('')
  const [savedAddresses, setSavedAddresses] = useState([])
  const [showAddrList, setShowAddrList] = useState(false)
  const [addrLoadError, setAddrLoadError] = useState('')
  const [showAddrForm, setShowAddrForm] = useState(false)
  const [directItems, setDirectItems] = useState(null)
  const [checkoutFromCart, setCheckoutFromCart] = useState(false)

  // ==========================================
  // STATE: Search
  // ==========================================
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [searchError, setSearchError] = useState('')

  // ==========================================
  // STATE: Login Form
  // ==========================================
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginNotice, setLoginNotice] = useState('')

  // ==========================================
  // STATE: Register Form
  // ==========================================
  // eto yung dinagdag ko boi (inalis ang `address` dito, hiwalay na ang regAddr)
  const [reg, setReg] = useState({
    fullName: '', username: '', birthDate: '', phone: '',
    email: '', password: '', confirmPassword: '',
  })
  // eto yung dinagdag ko boi
  const [regAddr, setRegAddr] = useState(emptyAddress)
  const [regError, setRegError] = useState('')
  const [regStep, setRegStep] = useState('details')
  const [otp, setOtp] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [captchaResetKey, setCaptchaResetKey] = useState(0)

  // ==========================================
  // STATE: Forgot Password Form
  // ==========================================
  const [forgotStep, setForgotStep] = useState('email') // email | otp | reset
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotOtp, setForgotOtp] = useState('')
  const [forgotPw, setForgotPw] = useState({ password: '', confirm: '' })
  const [resetToken, setResetToken] = useState('')
  const [forgotMsg, setForgotMsg] = useState(null) // { type: 'ok' | 'error', text }
  const [forgotLoading, setForgotLoading] = useState(false)

  // ==========================================
  // CART CONTEXT & SELECTION LOGIC
  // ==========================================
  const { items, removeItem, setQty } = useCart()

  // Mga napiling item sa cart (default: lahat ng bago ay napili)
  const selectedItems = items.filter((i) => !unselected.includes(itemKey(i)))
  const selCount = selectedItems.reduce((n, i) => n + Number(i.qty || 0), 0)
  const selSubtotal = selectedItems.reduce(
    (n, i) => n + Number(i.price || 0) * Number(i.qty || 0),
    0
  )
  const selShipping = shippingFeeFor(selSubtotal)
  const selTotal = selSubtotal + selShipping
  const allSelected = items.length > 0 && selectedItems.length === items.length

  const toggleItem = (key) =>
    setUnselected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  const toggleAll = () => setUnselected(allSelected ? items.map(itemKey) : [])

  // Linisin ang pagpili kapag natanggal na ang item sa cart
  useEffect(() => {
    setUnselected((prev) => {
      const next = prev.filter((k) => items.some((i) => itemKey(i) === k))
      return next.length === prev.length ? prev : next
    })
  }, [items])

  // ==========================================
  // CHECKOUT CALCULATIONS
  // ==========================================
  const checkoutItems = directItems ?? items
  const checkoutCount = checkoutItems.reduce((sum, item) => sum + Number(item.qty || 0), 0)
  const checkoutSubtotal = checkoutItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0)
  const checkoutShippingFee = shippingFeeFor(checkoutSubtotal)
  const checkoutDiscount = Math.min(couponApplied?.discount || 0, checkoutSubtotal)
  const checkoutTotal = checkoutSubtotal - checkoutDiscount + checkoutShippingFee

  useEffect(() => {
    setCouponApplied(null)
    setCouponMsg(null)
  }, [checkoutSubtotal])

  // ==========================================
  // EFFECTS: GLOBAL LISTENERS & PAYMENT POLLING
  // ==========================================
  useEffect(() => {
    const openCartEvent = () => {
      if (!auth.getToken()) {
        loginIntent.current = 'stay'
        setLoginError('Please log in to view your cart.')
        setshowLogin(true)
      } else {
        setShowCart(true)
      }
    }
    const openLoginEvent = (e) => {
      loginIntent.current = 'stay'
      setLoginError(e.detail?.message || '')
      setshowLogin(true)
    }
    window.addEventListener('open-cart', openCartEvent)
    window.addEventListener('open-login', openLoginEvent)
    return () => {
      window.removeEventListener('open-cart', openCartEvent)
      window.removeEventListener('open-login', openLoginEvent)
    }
  }, [])

  useEffect(() => {
    if (showCustomerService) {
      setUnreadChat(0)

      const load = () =>
        api('/messages/mine')
          .then(({ messages }) => {
            setChatMessages((prev) => {
              const seen = new Set(prev.map((m) => m.id))
              const fresh = messages.filter((m) => !seen.has(m._id)).map(toChat)
              return fresh.length ? [...prev, ...fresh] : prev
            })
          })
          .catch(() => {})

      load()
      const timer = setInterval(load, 4000)
      return () => clearInterval(timer)
    }

    const check = () =>
      api('/messages/mine/unread')
        .then(({ count }) => setUnreadChat(count))
        .catch(() => {})

    check()
    const timer = setInterval(check, 10000)
    return () => clearInterval(timer)
  }, [showCustomerService])

  useEffect(() => {
    document.body.classList.toggle('dark-mode', darkMode)
    return () => document.body.classList.remove('dark-mode')
  }, [darkMode])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('payment')
    if (!status) return

    const orderNo = params.get('order')

    let saved = {}
    try {
      saved = JSON.parse(sessionStorage.getItem('lastOrder')) || {}
      sessionStorage.removeItem('lastOrder')
    } catch {
      /* walang magagawa */
    }

    setOrderNumber(orderNo)
    setPaidTotal(saved.total || 0)
    if (saved.payment) setSelectedPayment(saved.payment)
    setShowPaymentResult(true)

    if (status === 'success' && orderNo) {
      setPaymentStatus('processing')

      let tries = 0
      const check = async () => {
        try {
          const { status: s } = await api(`/payments/status?order=${encodeURIComponent(orderNo)}`)

          if (['paid', 'shipped', 'delivered'].includes(s)) {
            // Kumpirmado na ng PayMongo
            setPaymentStatus('success')
            setPendingRemove(saved.cartKeys || [])
            return
          }
          if (s === 'cancelled') {
            setPaymentStatus('failed')
            setCheckoutError('This order was cancelled.')
            return
          }
        } catch {
          /* subukan ulit */
        }

        tries += 1
        if (tries < PAYMENT_POLL_TRIES) setTimeout(check, PAYMENT_POLL_MS)
      }
      check()
    } else {
      setPaymentStatus('failed')
      setCheckoutError('Payment was cancelled. Your order was cancelled and the items are still in your cart.')
      // Kanselahin ang order para hindi ito mabilang bilang order at maibalik ang stock
      if (orderNo && auth.getToken()) {
        api('/payments/cancel', { method: 'POST', body: { orderNumber: orderNo } }).catch(() => {})
      }
    }

    // Linisin ang ?payment=... sa address bar
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  // Tanggalin sa cart ang mga na-order na, kapag nai-load na ang cart
  useEffect(() => {
    if (!pendingRemove.length || !items.length) return
    pendingRemove.forEach((key) => removeItem(key))
    setPendingRemove([])
  }, [items, pendingRemove])

  // ==========================================
  // SEARCH PRODUCTS EFFECT
  // ==========================================
  useEffect(() => {
    const query = searchQuery.trim()

    if (!query) {
      setSearchResults([])
      setSearchLoading(false)
      setSearchError('')
      return
    }

    let cancelled = false

    const timer = setTimeout(async () => {
      setSearchLoading(true)
      setSearchError('')

      try {
        const response = await api('/products')

        const products = Array.isArray(response)
          ? response
          : Array.isArray(response?.products)
            ? response.products
            : Array.isArray(response?.data?.products)
              ? response.data.products
              : Array.isArray(response?.data)
                ? response.data
                : []

        const keyword = query.toLowerCase()

        const filtered = products.filter((product) => {
          const name = String(product?.name || '').toLowerCase()
          const category = String(product?.category || '').toLowerCase()
          const code = String(product?.code || '').toLowerCase()
          const description = String(product?.description || '').toLowerCase()

          return (
            name.includes(keyword) ||
            category.includes(keyword) ||
            code.includes(keyword) ||
            description.includes(keyword)
          )
        })

        if (!cancelled) {
          setSearchResults(filtered.slice(0, 8))
        }
      } catch (err) {
        if (!cancelled) {
          setSearchResults([])
          setSearchError(err.message || 'Could not search products.')
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false)
        }
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target)
      ) {
        setShowSearchResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // ==========================================
  // CHAT FUNCTIONS & DATA
  // ==========================================
  const chatOptions = [
    {
      id: 'shipping',
      label: 'Shipping & Delivery',
      response: 'Shipping Information:\n\n• Delivery Time: 3-5 business days\n• Free Shipping: On orders over PHP 2,000\n• Tracking: You\'ll receive a tracking number via email once your order ships.\n\nFor international shipping, please allow 7-14 business days.'
    },
    {
      id: 'returns',
      label: 'Returns & Exchanges',
      response: 'Returns Policy:\n\n• Return Window: 30 days from delivery\n• Condition: Items must be unworn, unwashed, with tags attached\n• Process: Contact us to initiate a return. We\'ll provide a prepaid shipping label.\n\nRefunds are processed within 5-7 business days after we receive your return.'
    },
    {
      id: 'payment',
      label: 'Payment Methods',
      response: 'We accept:\n\n• Credit/Debit Cards (Visa, Mastercard, Amex)\n• GCash\n• Maya\n• PayPal\n• Bank Transfer\n\nAll transactions are secure and encrypted.'
    },
    {
      id: 'contact',
      label: 'Contact Us',
      response: 'Get in touch:\n\n• Email: support@4thestreets.com\n• Phone: +63 (2) 1234-5678\n• Hours: Mon-Fri 9AM - 6PM\n\nWe typically respond within 24 hours.'
    },
    {
      id: 'order',
      label: 'Order Status',
      response: 'Order Status:\n\nTo check your order status:\n1. Log in to your account\n2. Go to "My Orders"\n3. Click "Track Order" on your recent purchase\n\nYou can also use the tracking number sent to your email.\n\nNeed help? Contact us with your order number!'
    },
    {
      id: 'sizing',
      label: 'Size Guide',
      response: 'Size Guide:\n\nOur streetwear fits are designed to be:\n• Oversized: Go 1 size down for regular fit\n• Regular: True to size\n• Slim: Go 1 size up for comfortable fit\n\nMeasurements (in inches):\n• XS: Chest 34-36, Waist 28-30\n• S: Chest 36-38, Waist 30-32\n• M: Chest 38-40, Waist 32-34\n• L: Chest 40-42, Waist 34-36\n• XL: Chest 42-44, Waist 36-38\n\nNeed help? Message us your measurements!'
    },
  ]

  const startChat = () => {
    setChatMessages([
      {
        id: 1,
        sender: 'bot',
        text: 'Hello! Welcome to 4THESTREETS Customer Service. How can I help you today?'
      }
    ])
    setShowChatOptions(true)
  }

  const handleOptionClick = (option) => {
    // Add user message
    setChatMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'user',
      text: option.label
    }])

    setShowChatOptions(false)

    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'bot',
        text: option.response
      }])
      setShowChatOptions(true)
    }, 500)
  }

  const handleSendMessage = async () => {
    const text = inputMessage.trim()
    if (!text) return
    setInputMessage('')
    try {
      const { message } = await api('/messages', { method: 'POST', body: { text } })
      setChatMessages((prev) => [...prev, toChat(message)])
    } catch (err) {
      setChatMessages((prev) => [...prev, { id: Date.now(), sender: 'bot', text: err.message }])
    }
  }

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage()
    }
  }

  const closeChat = () => {
    setShowCustomerService(false)
    setChatMessages([])
    setShowChatOptions(true)
    setIsTyping(false)
    setInputMessage('')
  }

  // ==========================================
  // ACTIONS: Auth, Cart, & Checkout
  // ==========================================
  const requireLogin = (message = '') => {
    loginIntent.current = 'stay'
    setShowCart(false)
    setShowCheckout(false)
    setLoginError(message)
    setshowLogin(true)
  }

  const openCheckout = async (itemsToCheckout = null, fromCart = false) => {
    if (!auth.getToken()) {
      requireLogin('Please log in to place an order.')
      return
    }

    // null = checkout from cart
    // array = direct checkout / Buy Now
    setDirectItems(itemsToCheckout?.length ? itemsToCheckout : null)
    setCheckoutFromCart(fromCart)

    setShowCart(false)
    setCheckoutError('')
    setCoupon('')
    setCouponApplied(null)
    setCouponMsg(null)
    setShowCheckout(true)
    setAddrLoadError('')

    try {
      const [{ user: me }, { addresses }] = await Promise.all([
        api('/auth/me'),
        api('/profile/addresses'),
      ])

      setSavedAddresses(addresses)

      const def = addresses.find((a) => a.isDefault) || addresses[0]

      setShipping((prev) => ({
        name: prev.name || me.fullName || '',
        contact: prev.contact || me.phone || '',
        address: def ? def.details : prev.address || me.address || '',
      }))
    } catch (err) {
      setAddrLoadError(err.message)
    }
  }

  useEffect(() => {
    const handleDirectCheckout = (e) => {
      // Puwedeng isang item (Buy Now) o maraming items (Shop This Outfit).
      const detail = e.detail || {}
      const products = Array.isArray(detail.items)
        ? detail.items
        : detail.item
          ? [detail.item]
          : []

      if (!products.length) {
        console.error('Direct checkout: walang product/items na natanggap.')
        return
      }

      openCheckout(
        products.map((product) => ({
          ...product,
          qty: Number(product.qty) || 1,
        }))
      )
    }

    window.addEventListener('open-checkout', handleDirectCheckout)

    return () => {
      window.removeEventListener('open-checkout', handleDirectCheckout)
    }
  }, [])

  const handlePaymentSelect = (method) => {
    setSelectedPayment(method)
  }

  const handlePlaceOrder = async () => {
    if (!auth.getToken()) {
      requireLogin('Please log in to place an order.')
      return
    }
    if (!checkoutItems.length) return
    if (!shipping.name.trim() || !shipping.address.trim() || !shipping.contact.trim()) {
      setCheckoutError('Please fill in your name, address and contact.')
      return
    }

    setPlacing(true)
    setCheckoutError('')
    let createdOrder = null
    try {
      // 1. Gumawa ng order (pending pa, naka-reserve ang stock)
      const { order } = await api('/orders', {
        method: 'POST',
        body: {
          items: checkoutItems.map(({ productId, qty, color, size }) => ({ productId, qty, color, size })),
          shipping,
          paymentMethod: selectedPayment,
          coupon: coupon.trim() || undefined,
        },
      })
      createdOrder = order

      // 2. Kumuha ng payment link mula sa backend
      const { checkoutUrl } = await api('/payments/checkout', {
        method: 'POST',
        body: { orderId: order._id || order.id },
      })

      // 3. Tandaan ang detalye para sa pagbalik galing sa payment page.
      //    HINDI pa tinatanggal ang items sa cart: tatanggalin lang ito kapag nabayaran na.
      try {
        sessionStorage.setItem(
          'lastOrder',
          JSON.stringify({
            total: order.total ?? checkoutTotal,
            payment: selectedPayment,
            cartKeys: checkoutFromCart ? checkoutItems.map(itemKey) : [],
          })
        )
      } catch {
        /* okay lang kung hindi ma-save */
      }

      setDirectItems(null)
      setCheckoutFromCart(false)
      setCoupon('')

      // 4. Pumunta sa payment page
      window.location.href = checkoutUrl
    } catch (err) {
      // Kung nagawa na ang order pero hindi nakapunta sa payment, bawiin ito
      if (createdOrder?.orderNumber) {
        api('/payments/cancel', {
          method: 'POST',
          body: { orderNumber: createdOrder.orderNumber },
        }).catch(() => {})
      }

      setOrderNumber(null)
      setPaidTotal(checkoutTotal)
      setPaymentStatus('failed')
      setCheckoutError(err.message)
      setShowCheckout(false)
      setShowPaymentResult(true)
      setPlacing(false)
    }
  }

  const applyCoupon = async () => {
    const code = coupon.trim()
    if (!code) {
      setCouponMsg({ type: 'error', text: 'Enter a coupon code.' })
      return
    }
    setCouponLoading(true)
    setCouponMsg(null)
    try {
      const res = await api('/coupons/validate', {
        method: 'POST',
        body: { code, subtotal: checkoutSubtotal },
      })
      const c = res.coupon || res

      // Kung diretsong discount ang binalik ng backend, gamitin iyon.
      // Kung hindi, kuwentahin mula sa type at value ng coupon.
      let discount = Number(res.discount ?? c.discountAmount ?? c.discount)
      if (!Number.isFinite(discount)) {
        const value = Number(c.value ?? c.amount ?? 0)
        const type = String(c.type ?? c.discountType ?? '').toLowerCase()
        discount = type.startsWith('percent') ? (checkoutSubtotal * value) / 100 : value
      }
      discount = Math.max(0, Math.min(Math.round(discount * 100) / 100, checkoutSubtotal))
      if (!discount) throw new Error('This coupon gives no discount for your order.')

      setCouponApplied({ code: String(c.code || code).toUpperCase(), discount })
      setCouponMsg({ type: 'ok', text: `Coupon applied: -${php(discount)}` })
    } catch (err) {
      setCouponApplied(null)
      setCouponMsg({ type: 'error', text: err.message || 'Invalid coupon code.' })
    } finally {
      setCouponLoading(false)
    }
  }

  const removeCoupon = () => {
    setCoupon('')
    setCouponApplied(null)
    setCouponMsg(null)
  }

  const closePaymentResult = () => {
    setShowPaymentResult(false)
    setPaymentStatus(null)
  }

  // ==========================================
  // ACTIONS: Login / Register / Forgot Password
  // ==========================================
  const handleLogin = async () => {
    setLoginNotice('')
    if (!username.trim() || !password.trim()) {
      setLoginError('Please enter your username and password.')
      return
    }

    try {
      const { token, user } = await api('/auth/login', {
        method: 'POST',
        body: { identifier: username, password },
      })

      auth.save(token, user.role)

      setshowLogin(false)
      setUsername('')
      setPassword('')
      setLoginError('')

      const stay = loginIntent.current === 'stay'
      loginIntent.current = null
      if (user.role === 'admin') navigate('/admin')
      else if (!stay) navigate('/profile')
    } catch (err) {
      setLoginError(err.message)
    }
  }

  const buildRegistrationBody = () => {
    const { confirmPassword, ...rest } = reg

    return {
      ...rest,
      fullName: reg.fullName.trim(),
      username: reg.username.trim(),
      email: reg.email.trim().toLowerCase(),
      phone: reg.phone.trim(),
      address: formatAddress(regAddr),
      addressParts: {
        street: regAddr.street.trim(),
        barangay: regAddr.barangay,
        city: regAddr.city.name,
        province: regAddr.province.name,
      },
    }
  }

  const handleRegister = async () => {
    if (
      !reg.fullName.trim() ||
      !reg.username.trim() ||
      !reg.birthDate ||
      !reg.phone.trim() ||
      !reg.email.trim() ||
      !reg.password
    ) {
      setRegError('Please complete all required registration fields.')
      return
    }

    if (!isAddressComplete(regAddr)) {
      setRegError(
        'Please complete your address (street, province, municipality and barangay).'
      )
      return
    }

    if (reg.password !== reg.confirmPassword) {
      setRegError('Passwords do not match.')
      return
    }

    if (reg.password.length < 8) {
      setRegError('Password must be at least 8 characters long.')
      return
    }

    if (!turnstileToken) {
      setRegError('Please complete the CAPTCHA first.')
      return
    }

    setRegLoading(true)
    setRegError('')

    try {
      await api('/auth/register/request-otp', {
        method: 'POST',
        body: {
          ...buildRegistrationBody(),
          captchaToken: turnstileToken,
        },
      })

      setOtp('')
      setRegStep('otp')
      setRegError('Verification code sent. Please check your email.')
    } catch (err) {
      setRegError(err.message)
    } finally {
      setRegLoading(false)
      setTurnstileToken('')
      setCaptchaResetKey((key) => key + 1)
    }
  }

  const handleVerifyOtp = async () => {
    const code = otp.trim()

    if (!/^\d{6}$/.test(code)) {
      setRegError('Please enter the six-digit verification code.')
      return
    }

    setRegLoading(true)
    setRegError('')

    try {
      const { token, user } = await api('/auth/register/verify-otp', {
        method: 'POST',
        body: {
          email: reg.email.trim().toLowerCase(),
          otp: code,
        },
      })

      auth.save(token, user.role)

      setshowReg(false)
      setRegStep('details')
      setOtp('')
      setTurnstileToken('')
      setCaptchaResetKey((key) => key + 1)
      setRegError('')
      setReg({
        fullName: '',
        username: '',
        birthDate: '',
        phone: '',
        email: '',
        password: '',
        confirmPassword: '',
      })
      setRegAddr(emptyAddress)

      navigate('/profile')
    } catch (err) {
      setRegError(err.message)
    } finally {
      setRegLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (!turnstileToken) {
      setRegError('Please complete the CAPTCHA before requesting another code.')
      return
    }

    setRegLoading(true)
    setRegError('')

    try {
      const result = await api('/auth/register/request-otp', {
        method: 'POST',
        body: {
          ...buildRegistrationBody(),
          captchaToken: turnstileToken,
        },
      })

      setOtp('')
      setRegError(result.message || 'A new verification code has been sent.')
    } catch (err) {
      setRegError(err.message)
    } finally {
      setRegLoading(false)
      setTurnstileToken('')
      setCaptchaResetKey((key) => key + 1)
    }
  }

  const resetForgotState = () => {
    setForgotStep('email')
    setForgotEmail('')
    setForgotOtp('')
    setForgotPw({ password: '', confirm: '' })
    setResetToken('')
    setForgotMsg(null)
    setForgotLoading(false)
    setTurnstileToken('')
    setCaptchaResetKey((k) => k + 1)
  }

  const closeForgot = (backToLogin = false) => {
    setshowForgot(false)
    resetForgotState()
    if (backToLogin) setshowLogin(true)
  }

  // Step 1 (also used by "Resend code")
  const handleForgotRequest = async () => {
    const email = forgotEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setForgotMsg({ type: 'error', text: 'Please enter a valid email address.' })
      return
    }
    if (!turnstileToken) {
      setForgotMsg({ type: 'error', text: 'Please complete the CAPTCHA first.' })
      return
    }

    setForgotLoading(true)
    setForgotMsg(null)
    try {
      const res = await api('/auth/forgot/request-otp', {
        method: 'POST',
        body: { email, captchaToken: turnstileToken },
      })
      setForgotOtp('')
      setForgotStep('otp')
      setForgotMsg({ type: 'ok', text: res.message })
    } catch (err) {
      setForgotMsg({ type: 'error', text: err.message })
    } finally {
      setForgotLoading(false)
      setTurnstileToken('')
      setCaptchaResetKey((k) => k + 1)
    }
  }

  // Step 2
  const handleForgotVerify = async () => {
    const code = forgotOtp.trim()
    if (!/^\d{6}$/.test(code)) {
      setForgotMsg({ type: 'error', text: 'Please enter the six-digit verification code.' })
      return
    }

    setForgotLoading(true)
    setForgotMsg(null)
    try {
      const { resetToken } = await api('/auth/forgot/verify-otp', {
        method: 'POST',
        body: { email: forgotEmail.trim().toLowerCase(), otp: code },
      })
      setResetToken(resetToken)
      setForgotStep('reset')
    } catch (err) {
      setForgotMsg({ type: 'error', text: err.message })
    } finally {
      setForgotLoading(false)
    }
  }

  // Step 3
  const handleForgotReset = async () => {
    if (forgotPw.password.length < 8) {
      setForgotMsg({ type: 'error', text: 'Password must be at least 8 characters long.' })
      return
    }
    if (forgotPw.password !== forgotPw.confirm) {
      setForgotMsg({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    setForgotLoading(true)
    setForgotMsg(null)
    try {
      const res = await api('/auth/forgot/reset', {
        method: 'POST',
        body: {
          email: forgotEmail.trim().toLowerCase(),
          resetToken,
          password: forgotPw.password,
          confirmPassword: forgotPw.confirm,
        },
      })
      closeForgot(true) // go straight back to the login modal
      setLoginError('')
      setLoginNotice(res.message)
    } catch (err) {
      setForgotMsg({ type: 'error', text: err.message })
    } finally {
      setForgotLoading(false)
    }
  }

  // ==========================================
  // HELPERS: Navigation & Music
  // ==========================================
  const toggleMusic = () => {
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }

  const openCart = () => {
    if (!auth.getToken()) {
      requireLogin('Please login to access this features.')
      return
    }
    setShowCart(true)
  }

  const selectedAddr = savedAddresses.find((a) => a.details === shipping.address)

    const openAddressPicker = () => {
    if (!auth.getToken()) {
      requireLogin('Please log in to manage your addresses.')
      return
    }
    setShowAddrList(true)
  }

  const toggleDarkMode = () => setDarkMode((d) => !d)

  // Highlight the icon of the page you are on
  const isActive = (id) => {
    const p = location.pathname
    if (id === 'home') return p === '/'
    if (id === 'products') return p.startsWith('/products')
    if (id === 'pickprod') return p.startsWith('/pickprod')
    if (id === 'user') return p === '/profile' || p.startsWith('/admin')
    return false
  }

  const navItems = [
    { id: 'home', default: Home, selected: HomeSel, alt: 'Home', path: '/' },
    { id: 'products', default: Products, selected: HighSel, alt: 'Products', path: '/products' },
    { id: 'pickprod', default: PickProd, selected: PickSel, alt: 'PickProd', path: '/pickprod' },
    { id: 'cart', default: Cart, selected: CartSel, alt: 'Cart', path: null },
    { id: 'user', default: user, selected: usersel, alt: 'Profile', path: null },
  ]

  // ==========================================
  // ACTIONS: Search Handlers
  // ==========================================
  const handleSearchProduct = (product) => {
    const productId =
      product?._id || product?.id || product?.productId

    if (!productId) {
      console.error('Product ID is missing:', product)
      setSearchError('Unable to open this product. Product ID is missing.')
      return
    }

    setShowSearchResults(false)
    setSearchQuery('')
    setSearchResults([])
    setSearchError('')

    // Use the Products page and pass the selected product in the URL.
    navigate(`/products?product=${encodeURIComponent(productId)}`)
    window.scrollTo(0, 0)
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()

    const query = searchQuery.trim()
    if (!query) return

    setShowSearchResults(false)

    navigate(`/products?search=${encodeURIComponent(query)}`)
    window.scrollTo(0, 0)
  }

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <>
      {/* ========================================== */}
      {/* MAIN NAVBAR */}
      {/* ========================================== */}
      <nav className="top-nav">
        <img src={logo} id="logo" alt="Logo" />
        
        <div className="searchbox" ref={searchRef}>
          <form className="search-form" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              id="search"
              placeholder="Search Products..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowSearchResults(true)
              }}
              onFocus={() => setShowSearchResults(true)}
              autoComplete="off"
            />

            <button
              type="submit"
              className="search-submit"
              aria-label="Search products"
            >
              <img src={search} id="searchicon" alt="" />
            </button>
          </form>

          {showSearchResults && searchQuery.trim() && (
            <div className="search-dropdown">
              {searchLoading && (
                <p className="search-message">
                  Searching products...
                </p>
              )}

              {!searchLoading && searchError && (
                <p className="search-message">
                  {searchError}
                </p>
              )}

              {!searchLoading && !searchError && searchResults.length === 0 && (
                <p className="search-message">
                  No products found.
                </p>
              )}

              {!searchLoading && !searchError && searchResults.map((product) => {
                const productId = product._id || product.id || product.productId
                const imageUrl = product.images?.front || product.image || ''

                return (
                  <button
                    type="button"
                    key={productId || product.name}
                    className="search-result-item"
                    onClick={() => handleSearchProduct(product)}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={product.name || 'Product'}
                        className="search-product-img"
                      />
                    ) : (
                      <div className="search-product-placeholder">
                        No Image
                      </div>
                    )}

                    <div className="search-product-info">
                      <strong>{product.name || 'Unnamed Product'}</strong>
                      <span>{product.category || 'Product'}</span>
                      <b>{php(product.price)}</b>
                    </div>
                  </button>
                )
              })}

              {!searchLoading && !searchError && searchResults.length > 0 && (
                <button
                  type="button"
                  className="search-view-all"
                  onClick={handleSearchSubmit}
                >
                  View all results for "{searchQuery}"
                </button>
              )}
            </div>
          )}
        </div>

        <div className="nav-icons">
          {navItems.map((item) => {
            const active = isActive(item.id)
            const showSelected = hoveredNav === item.id || active
            return (
              <img
                key={item.id}
                src={showSelected ? item.selected : item.default}
                className={`grapnav ${active ? 'active-page' : ''}`}
                alt={item.alt}
                onMouseEnter={() => setHoveredNav(item.id)}
                onMouseLeave={() => setHoveredNav(null)}
                onClick={() => {
                  if (item.id === 'user') {
                    if (auth.getToken()) {
                      navigate(auth.getRole() === 'admin' ? '/admin' : '/profile')
                      setTimeout(() => window.scrollTo(0, 0), 50)
                    } else {
                      loginIntent.current = null
                      setLoginError('')
                      setshowLogin(true)
                    }
                  } else if (item.id === 'cart') {
                    openCart()
                  } else if (item.path) {
                    navigate(item.path)
                    setTimeout(() => {
                      window.scrollTo(0, 0)
                    }, 50)
                  }
                }}
              />
            )
          })}
        </div>
      </nav>

      <audio ref={audioRef} src={backgroundMusic} loop />

      {/* ========================================== */}
      {/* LOGIN MODAL */}
      {/* ========================================== */}
      {showLogin && (
        <div className="Login" onClick={() => setshowLogin(false)}>
          <div className="input" onClick={(e) => e.stopPropagation()}>
            <div className="close">
              <button onClick={() => setshowLogin(false)}>✕</button>
            </div>
            <h2>LOGIN</h2>
            <input
              type="text"
              placeholder="Username/Email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            {loginNotice && <p style={{ color: '#16a34a', fontSize: '14px' }}>{loginNotice}</p>}
            {loginError && <p style={{ color: '#ef4444', fontSize: '14px' }}>{loginError}</p>}
            <button onClick={handleLogin}>LOGIN</button>
            <div className="links">
              <p onClick={() => { setshowLogin(false); setLoginNotice(''); setshowForgot(true); }}>Forgot Password?</p>
              <p onClick={() => { setshowLogin(false); setshowReg(true); }}>Register</p>
            </div>
          </div>
          <div className="imgbg">
            <img src={logo} alt="Logo" />
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* REGISTER MODAL */}
      {/* ========================================== */}
      {showReg && (
        <div className="Login" onClick={() => setshowReg(false)}>
          <div className="rinput" onClick={(e) => e.stopPropagation()}>
            <div className="close">
              <button
                onClick={() => {
                  setshowReg(false)
                  setRegStep('details')
                  setRegError('')
                  setOtp('')
                  setTurnstileToken('')
                  setCaptchaResetKey((key) => key + 1)
                  setshowLogin(true)
                }}
                title="Back to Login"
              >
                ←
              </button>
            </div>

            {regStep === 'details' ? (
              <>
                <h2>Register</h2>

                <div className="twoinput">
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={reg.fullName}
                    onChange={(e) =>
                      setReg({ ...reg, fullName: e.target.value })
                    }
                  />

                  <input
                    type="date"
                    value={reg.birthDate}
                    onChange={(e) =>
                      setReg({ ...reg, birthDate: e.target.value })
                    }
                  />
                </div>

                <input
                  type="text"
                  placeholder="Username"
                  value={reg.username}
                  onChange={(e) =>
                    setReg({ ...reg, username: e.target.value })
                  }
                />

                <input
                  type="text"
                  placeholder="Phone no."
                  value={reg.phone}
                  onChange={(e) =>
                    setReg({ ...reg, phone: e.target.value })
                  }
                />

                <AddressFields value={regAddr} onChange={setRegAddr} />

                <input
                  type="email"
                  placeholder="Email Address"
                  value={reg.email}
                  onChange={(e) =>
                    setReg({ ...reg, email: e.target.value })
                  }
                />

                <div className="twoinput">
                  <input
                    type="password"
                    placeholder="Password"
                    value={reg.password}
                    onChange={(e) =>
                      setReg({ ...reg, password: e.target.value })
                    }
                  />

                  <input
                    type="password"
                    placeholder="Re-Enter Password"
                    value={reg.confirmPassword}
                    onChange={(e) =>
                      setReg({ ...reg, confirmPassword: e.target.value })
                    }
                  />
                </div>

                <div style={{ margin: '16px 0' }}>
                  <Turnstile
                    key={`register-${captchaResetKey}`}
                    siteKey={process.env.REACT_APP_TURNSTILE_SITE_KEY}
                    onSuccess={(token) => {
                      setTurnstileToken(token)
                      setRegError('')
                    }}
                    onExpire={() => setTurnstileToken('')}
                    onError={() => {
                      setTurnstileToken('')
                      setRegError('CAPTCHA failed to load. Please try again.')
                    }}
                  />
                </div>

                {regError && (
                  <p style={{ color: '#ef4444', fontSize: '14px' }}>
                    {regError}
                  </p>
                )}

                <button onClick={handleRegister} disabled={regLoading}>
                  {regLoading ? 'Sending Code...' : 'Continue'}
                </button>
              </>
            ) : (
              <>
                <h2>Verify Your Email</h2>

                <p>
                  Enter the six-digit code sent to{' '}
                  <strong>{reg.email}</strong>.
                </p>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !regLoading) {
                      handleVerifyOtp()
                    }
                  }}
                />

                <p style={{ fontSize: '13px' }}>
                  The code expires after 5 minutes.
                </p>

                <div style={{ margin: '16px 0' }}>
                  <Turnstile
                    key={`verify-${captchaResetKey}`}
                    siteKey={process.env.REACT_APP_TURNSTILE_SITE_KEY}
                    onSuccess={(token) => {
                      setTurnstileToken(token)
                      setRegError('')
                    }}
                    onExpire={() => setTurnstileToken('')}
                    onError={() => {
                      setTurnstileToken('')
                      setRegError('CAPTCHA failed to load. Please try again.')
                    }}
                  />
                </div>

                {regError && (
                  <p style={{ color: '#ef4444', fontSize: '14px' }}>
                    {regError}
                  </p>
                )}

                <button
                  onClick={handleVerifyOtp}
                  disabled={regLoading}
                >
                  {regLoading ? 'Verifying...' : 'Verify & Create Account'}
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={regLoading || !turnstileToken}
                  style={{ marginTop: '10px' }}
                >
                  {regLoading ? 'Please wait...' : 'Resend OTP'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRegStep('details')
                    setRegError('')
                    setOtp('')
                    setTurnstileToken('')
                    setCaptchaResetKey((key) => key + 1)
                  }}
                  disabled={regLoading}
                  style={{ marginTop: '10px' }}
                >
                  Back to Registration
                </button>
              </>
            )}
          </div>

          <div className="imgbg">
            <img src={logo} alt="Logo" />
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* FORGOT PASSWORD MODAL */}
      {/* ========================================== */}
      {showForgot && (
        <div className="Login" onClick={() => closeForgot(false)}>
          <div className="input" onClick={(e) => e.stopPropagation()}>
            <div className="close">
              <button
                onClick={() => {
                  if (forgotStep === 'email') closeForgot(true)
                  else {
                    setForgotStep(forgotStep === 'reset' ? 'otp' : 'email')
                    setForgotMsg(null)
                  }
                }}
                title="Back"
              >
                ←
              </button>
            </div>

            {forgotStep === 'email' && (
              <>
                <h2>Forgot Password</h2>
                <p style={{ fontSize: '14px', textAlign: 'center' }}>
                  Enter your account email and we'll send you a verification code.
                </p>
                <input
                  type="email"
                  placeholder="Enter Email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
                <Turnstile
                  key={`forgot-${captchaResetKey}`}
                  siteKey={process.env.REACT_APP_TURNSTILE_SITE_KEY}
                  onSuccess={(token) => { setTurnstileToken(token); setForgotMsg(null) }}
                  onExpire={() => setTurnstileToken('')}
                  onError={() => {
                    setTurnstileToken('')
                    setForgotMsg({ type: 'error', text: 'CAPTCHA failed to load. Please try again.' })
                  }}
                />
                {forgotMsg && (
                  <p style={{ color: forgotMsg.type === 'ok' ? '#16a34a' : '#ef4444', fontSize: '14px' }}>
                    {forgotMsg.text}
                  </p>
                )}
                <button onClick={handleForgotRequest} disabled={forgotLoading}>
                  {forgotLoading ? 'Sending Code...' : 'Send Code'}
                </button>
              </>
            )}

            {forgotStep === 'otp' && (
              <>
                <h2>Verify Your Email</h2>
                <p style={{ fontSize: '14px', textAlign: 'center' }}>
                  Enter the six-digit code sent to <strong>{forgotEmail}</strong>.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && !forgotLoading && handleForgotVerify()}
                />
                <p style={{ fontSize: '13px' }}>The code expires after 5 minutes.</p>
                {forgotMsg && (
                  <p style={{ color: forgotMsg.type === 'ok' ? '#16a34a' : '#ef4444', fontSize: '14px' }}>
                    {forgotMsg.text}
                  </p>
                )}
                <button onClick={handleForgotVerify} disabled={forgotLoading}>
                  {forgotLoading ? 'Verifying...' : 'Verify Code'}
                </button>

                {/* CAPTCHA is only needed to request another code */}
                <Turnstile
                  key={`forgot-resend-${captchaResetKey}`}
                  siteKey={process.env.REACT_APP_TURNSTILE_SITE_KEY}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken('')}
                  onError={() => setTurnstileToken('')}
                />
                <button
                  type="button"
                  onClick={handleForgotRequest}
                  disabled={forgotLoading || !turnstileToken}
                >
                  {forgotLoading ? 'Please wait...' : 'Resend OTP'}
                </button>
              </>
            )}

            {forgotStep === 'reset' && (
              <>
                <h2>New Password</h2>
                <input
                  type="password"
                  placeholder="New Password"
                  value={forgotPw.password}
                  onChange={(e) => setForgotPw({ ...forgotPw, password: e.target.value })}
                />
                <input
                  type="password"
                  placeholder="Re-Enter Password"
                  value={forgotPw.confirm}
                  onChange={(e) => setForgotPw({ ...forgotPw, confirm: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && !forgotLoading && handleForgotReset()}
                />
                {forgotMsg && (
                  <p style={{ color: forgotMsg.type === 'ok' ? '#16a34a' : '#ef4444', fontSize: '14px' }}>
                    {forgotMsg.text}
                  </p>
                )}
                <button onClick={handleForgotReset} disabled={forgotLoading}>
                  {forgotLoading ? 'Saving...' : 'Change Password'}
                </button>
              </>
            )}
          </div>
          <div className="imgbg">
            <img src={logo} alt="Logo" />
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* FLOATING BUTTONS */}
      {/* ========================================== */}
      <div className="bottom-right-buttons">
        <div className="floating-btn service-btn" onClick={() => setShowCustomerService(true)}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            <path d="M8 10h.01M12 10h.01M16 10h.01" strokeLinecap="round"/>
          </svg>
          {unreadChat > 0 && <span className="cart-badge">{unreadChat > 99 ? '99+' : unreadChat}</span>}
        </div>

        <div className="floating-btn dark-mode-btn" onClick={toggleDarkMode} title="Toggle Dark Mode">
          {darkMode ? (
            // Sun icon
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"></circle>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
            </svg>
          ) : (
            // Moon icon
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </div>

        <div className="floating-btn music-btn" onClick={toggleMusic}>
          <img src={music} className={playing ? 'spinning' : ''} alt="Toggle Music" />
        </div>
      </div>

      {/* ========================================== */}
      {/* CART MODAL */}
      {/* ========================================== */}
      {showCart && (
        <div className="cart-overlay" onClick={() => setShowCart(false)}>
          <div className="cart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cart-header">
              <h2>Cart</h2>
              <button className="cart-close" onClick={() => setShowCart(false)}>✕</button>
            </div>

            {items.length > 0 && (
              <label className="cart-select-all">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                <span>Select all ({items.length})</span>
              </label>
            )}

            <div className="cart-items">
              {items.length === 0 && <p>Your cart is empty.</p>}
              {items.map((i) => {
                const key = itemKey(i)
                const checked = !unselected.includes(key)
                return (
                  <div className={`cart-item ${checked ? '' : 'unselected'}`} key={key}>
                    <input
                      type="checkbox"
                      className="cart-item-check"
                      checked={checked}
                      onChange={() => toggleItem(key)}
                      aria-label={`Select ${i.name}`}
                    />
                    <img src={i.image} alt={i.name} className="cart-item-image" />
                    <div className="cart-item-details">
                      <h4>{i.name}</h4>
                      <p>Color: {i.color}</p>
                      <p>Size: {i.size}</p>
                      <div className="cart-item-actions">
                        <div className="qty-control">
                          <button
                            type="button"
                            className="qty-btn"
                            onClick={() => setQty(key, i.qty - 1)}
                            disabled={i.qty <= 1}
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className="qty-value">{i.qty}</span>
                          <button
                            type="button"
                            className="qty-btn"
                            onClick={() => setQty(key, i.qty + 1)}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className="cart-remove-btn"
                          onClick={() => removeItem(key)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="cart-item-price">{php(i.price * i.qty)}</div>
                  </div>
                )
              })}
            </div>

            <div className="cart-summary">
              <h3>Order Summary</h3>
              <div className="summary-row">
                <span>Items ({selCount})</span>
                <span>{php(selSubtotal)}</span>
              </div>
              <div className="summary-row">
                <span>Shipping</span>
                <span>{php(selShipping)}</span>
              </div>
              <div className="summary-total">
                <span>Order Total</span>
                <span>{php(selTotal)}</span>
              </div>
              <button
                className="checkout-btn-cart"
                onClick={() => openCheckout(selectedItems, true)}
                disabled={!selectedItems.length}
              >
                Proceed to Checkout{selCount > 0 ? ` (${selCount})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* CHECKOUT MODAL */}
      {/* ========================================== */}
      {showCheckout && (
        <div className="checkout-overlay" onClick={() => setShowCheckout(false)}>
          <div className="checkout-modal" onClick={(e) => e.stopPropagation()}>
            <div className="checkout-header">
              <h2>Checkout</h2>
              <button className="checkout-close" onClick={() => setShowCheckout(false)}>✕</button>
            </div>

            <div className="checkout-content">
              {/* Left Side - Customer Info */}
              <div className="checkout-form">
                <div className="form-group">
                  <label>Customer Name:</label>
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={shipping.name}
                    onChange={(e) => setShipping({ ...shipping, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Delivery Address:</label>
                  {shipping.address ? (
                    <div className="addr-summary">
                      {selectedAddr && <b>{selectedAddr.label}</b>}
                      <p>{shipping.address}</p>
                    </div>
                  ) : (
                    <div className="addr-summary">
                      <p>No address selected.</p>
                    </div>
                  )}
                  {addrLoadError && (
                    <p style={{ color: '#ef4444', fontSize: '14px' }}>
                      Could not load your saved addresses: {addrLoadError}
                    </p>
                  )}
                  <button type="button" className="addr-change-btn" onClick={openAddressPicker}>
                    {savedAddresses.length > 0 ? 'Change' : '+ Add Address'}
                  </button>
                </div>
                <div className="form-group">
                  <label>Contact:</label>
                  <input
                    type="text"
                    placeholder="Enter your phone number"
                    value={shipping.contact}
                    onChange={(e) => setShipping({ ...shipping, contact: e.target.value })}
                  />
                </div>
              </div>

              {/* Right Side - Order Summary */}
              <div className="checkout-summary">
                <h3>Order Summary</h3>

                <div className="checkout-items">
                  {checkoutItems.map((i) => (
                    <div className="checkout-item" key={itemKey(i)}>
                      <span className="checkout-item-name">{i.name}</span>
                      <span className="checkout-item-qty">×{i.qty}</span>
                      <span className="checkout-item-price">{php(i.price * i.qty)}</span>
                    </div>
                  ))}
                </div>

                <div className="checkout-summary-row">
                  <span>Items ({checkoutCount})</span>
                  <span>{php(checkoutSubtotal)}</span>
                </div>
                <div className="checkout-summary-row">
                  <span>Shipping</span>
                  <span>{php(checkoutShippingFee)}</span>
                </div>

                {checkoutDiscount > 0 && (
                  <div className="checkout-summary-row">
                    <span>Discount ({couponApplied.code})</span>
                    <span>-{php(checkoutDiscount)}</span>
                  </div>
                )}
                
                {/* Coupon Section */}
                <div className="checkout-coupon">
                  <input
                    type="text"
                    placeholder="Coupon Code"
                    value={coupon}
                    disabled={!!couponApplied}
                    onChange={(e) => setCoupon(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !couponApplied && applyCoupon()}
                  />
                  {couponApplied ? (
                    <button type="button" onClick={removeCoupon}>Remove</button>
                  ) : (
                    <button
                      type="button"
                      onClick={applyCoupon}
                      disabled={couponLoading || !coupon.trim()}
                    >
                      {couponLoading ? 'Checking...' : 'Apply'}
                    </button>
                  )}
                </div>
                {couponMsg && (
                  <p style={{ color: couponMsg.type === 'ok' ? '#16a34a' : '#ef4444', fontSize: '13px' }}>
                    {couponMsg.text}
                  </p>
                )}

                {/* Payment Method */}
                <div className="checkout-payment">
                  <p>Payment Method</p>
                  <div className="payment-options">
                    <label className={`payment-option ${selectedPayment === 'gcash' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="payment"
                        value="gcash"
                        checked={selectedPayment === 'gcash'}
                        onChange={() => handlePaymentSelect('gcash')}
                      />
                      <span>G-cash</span>
                    </label>
                  </div>
                </div>

                <div className="checkout-total">
                  <span>Total</span>
                  <span>{php(checkoutTotal)}</span>
                </div>

                {checkoutError && (
                  <p style={{ color: '#ef4444', fontSize: '14px' }}>{checkoutError}</p>
                )}

                <button
                  className="order-btn"
                  onClick={handlePlaceOrder}
                  disabled={placing || !checkoutItems.length}
                >
                  {placing ? 'Placing...' : 'Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* PAYMENT RESULT OVERLAY */}
      {/* ========================================== */}
      {showPaymentResult && (
        <div className="result-overlay" onClick={closePaymentResult}>
          <div className={`result-modal ${paymentStatus === 'success' ? 'success' : paymentStatus === 'processing' ? '' : 'failed'}`} onClick={(e) => e.stopPropagation()}>
            <div className="result-icon">
              {paymentStatus === 'success' ? (
                <span className="success-icon">✅</span>
              ) : paymentStatus === 'processing' ? (
                <span>⏳</span>
              ) : (
                <span className="failed-icon">❌</span>
              )}
            </div>

            <h2 className="result-title">
              {paymentStatus === 'success'
                ? 'Order Placed!'
                : paymentStatus === 'processing'
                ? 'Confirming Payment...'
                : 'Order Failed'}
            </h2>

            <p className="result-message">
              {paymentStatus === 'success'
                ? 'Your payment was confirmed and your order has been placed. You will receive a confirmation email shortly.'
                : paymentStatus === 'processing'
                ? 'Waiting for PayMongo to confirm your payment. This usually takes a few seconds. Please do not pay again.'
                : checkoutError || 'There was an issue placing your order. Please try again.'
              }
            </p>

            <div className="result-details">
              <div className="result-row">
                <span>Order Number</span>
                <span>{orderNumber ? `#${orderNumber}` : 'N/A'}</span>
              </div>
              <div className="result-row">
                <span>Payment Method</span>
                <span>{selectedPayment.charAt(0).toUpperCase() + selectedPayment.slice(1)}</span>
              </div>
              <div className="result-row">
                <span>Total Amount</span>
                <span>{php(paidTotal)}</span>
              </div>
            </div>

            <button className="result-btn" onClick={closePaymentResult}>
              {paymentStatus === 'success'
                ? 'Continue Shopping'
                : paymentStatus === 'processing'
                ? 'Close'
                : 'Try Again'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* ADDRESS MODALS (Checkout) */}
      {/* ========================================== */}
      {showAddrList && (
        <AddressListModal
          addresses={savedAddresses}
          locked={showAddrForm}
          onChange={setSavedAddresses}
          onAdd={() => setShowAddrForm(true)}
          onClose={() => setShowAddrList(false)}
          onDone={(addr) => {
            if (addr) setShipping((prev) => ({ ...prev, address: addr.details }))
            setShowAddrList(false)
          }}
        />
      )}

      {showAddrForm && (
        <AddressFormModal
          address={null}
          isFirst={savedAddresses.length === 0}
          onClose={() => setShowAddrForm(false)}
          onSaved={(list) => {
            setSavedAddresses(list)
            setShowAddrForm(false)
            // Kung walang listahang nakabukas, ang bagong address ang agad gagamitin
            if (!showAddrList) {
              const def = list.find((a) => a.isDefault) || list[0]
              if (def) setShipping((prev) => ({ ...prev, address: def.details }))
            }
          }}
        />
      )}

      {/* ========================================== */}
      {/* CUSTOMER SERVICE CHAT MODAL */}
      {/* ========================================== */}
      {showCustomerService && (
        <div className="service-overlay" onClick={closeChat}>
          <div className="service-modal chat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="service-header">
              <h2>Customer Service</h2>
              <button className="service-close" onClick={closeChat}>✕</button>
            </div>

            <div className="chat-messages" id="chatMessages">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`chat-message ${msg.sender}`}>
                  <div className="message-bubble">
                    {msg.text.split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="chat-message bot">
                  <div className="message-bubble typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
            </div>

            {showChatOptions && chatMessages.length > 0 && (
              <div className="chat-options">
                <div className="chat-options-divider">
                  <span>Quick Replies</span>
                </div>
                {chatOptions.map((option) => (
                  <button
                    key={option.id}
                    className="chat-option-btn"
                    onClick={() => handleOptionClick(option)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {chatMessages.length > 0 && (
              <div className="chat-input-container">
                                <input
                  type="text"
                  className="chat-input"
                  placeholder="Type your message..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isTyping}
                />
                <button
                  className="chat-send-btn"
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || isTyping}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
            )}

            {chatMessages.length === 0 && (
              <div className="chat-start">
                <p>Click the button below to start chatting with us.</p>
                <button className="start-chat-btn" onClick={startChat}>
                  Start Chat
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default Nav