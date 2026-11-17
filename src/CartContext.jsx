import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { auth } from './auth'

const CartContext = createContext(null)

export const useCart = () => useContext(CartContext)

export const itemKey = (i) => `${i.productId}-${i.color}-${i.size}`

// PHP 1,800.00
export const php = (n) =>
  'PHP ' +
  Number(n || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const storageKey = (userId) => `cart:${userId}`

const readSaved = (userId) => {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId))) || []
  } catch {
    return []
  }
}

// Pagsamahin ang naka-save na cart at ang mga idinagdag bago pa ito nakarga
const mergeCarts = (base, extra) => {
  const out = [...base]
  for (const e of extra) {
    const i = out.findIndex((x) => itemKey(x) === itemKey(e))
    if (i >= 0) out[i] = { ...out[i], qty: out[i].qty + e.qty }
    else out.push(e)
  }
  return out
}

export function CartProvider({ children }) {
  const [token, setToken] = useState(() => auth.getToken() || null)
  const [userId, setUserId] = useState(null)
  const [loadedFor, setLoadedFor] = useState(null) // user id na nakarga na ang cart
  const [items, setItems] = useState([])

  const tokenRef = useRef(token)
  const prevToken = useRef(null)

  // Linisin ang lumang (walang user) na cart
  useEffect(() => {
    try {
      localStorage.removeItem('cart')
    } catch {
      /* walang magagawa */
    }
  }, [])

  // Bantayan ang login/logout (pati expired na token)
  useEffect(() => {
    const check = () => {
      const now = auth.getToken() || null
      if (now !== tokenRef.current) {
        tokenRef.current = now
        setToken(now)
      }
    }
    const timer = setInterval(check, 500)
    window.addEventListener('storage', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('storage', check)
    }
  }, [])

  // Kapag nagbago ang token: kunin kung sino ang user, at i-load ang cart niya
  useEffect(() => {
    const was = prevToken.current
    prevToken.current = token

    // Walang naka-login: walang laman ang cart (hindi binubura ang naka-save ni user)
    if (!token) {
      setUserId(null)
      setLoadedFor(null)
      setItems([])
      return
    }

    // Direktang pagpalit ng user: huwag dalhin ang cart ng nauna
    if (was && was !== token) setItems([])
    setLoadedFor(null)

    let cancelled = false
    api('/auth/me')
      .then(({ user }) => {
        if (cancelled) return
        const id = String(user._id || user.id)
        setUserId(id)
        setItems((prev) => mergeCarts(readSaved(id), prev))
        setLoadedFor(id)
      })
      .catch(() => {
        /* kung 401, buburahin ng api() ang token at ma-de-detect ng bantay sa itaas */
      })

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!userId || loadedFor !== userId) return
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(items))
    } catch {

    }
  }, [items, userId, loadedFor])

  const addItem = (item) => {
    if (!auth.getToken()) return false
    setItems((prev) => {
      const found = prev.find((p) => itemKey(p) === itemKey(item))
      if (found) {
        return prev.map((p) =>
          itemKey(p) === itemKey(item) ? { ...p, qty: p.qty + (item.qty || 1) } : p
        )
      }
      return [...prev, { ...item, qty: item.qty || 1 }]
    })
    return true
  }

  const removeItem = (key) => setItems((prev) => prev.filter((p) => itemKey(p) !== key))

  const setQty = (key, qty) =>
    setItems((prev) =>
      qty < 1
        ? prev.filter((p) => itemKey(p) !== key)
        : prev.map((p) => (itemKey(p) === key ? { ...p, qty } : p))
    )

  const clear = () => setItems([])

  // Walang makikitang laman kung walang naka-login
  const loggedIn = !!token
  const visible = loggedIn ? items : []

  const count = visible.reduce((n, i) => n + i.qty, 0)
  const subtotal = visible.reduce((n, i) => n + i.price * i.qty, 0)
  const shippingFee = subtotal === 0 || subtotal >= 2000 ? 0 : 150
  const total = subtotal + shippingFee

  return (
    <CartContext.Provider
      value={{
        items: visible,
        loggedIn,
        addItem,
        removeItem,
        setQty,
        clear,
        count,
        subtotal,
        shippingFee,
        total,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}