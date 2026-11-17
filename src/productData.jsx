// productData.jsx
import { useEffect, useState } from 'react'
import { api } from './api'

export const formatPrice = (price) =>
  `PHP ${Number(price).toLocaleString('en-PH')}`

// Kuhanin ang TOTAL stock kahit anong hugis ng data ng backend:
//  1. number / numeric string  -> stock, stockQuantity, availableStock, quantity, qty
//  2. object per size          -> { S: 5, M: 3 } o { quantity: 8 }
//  3. array ng variants        -> [{ size, stock }] / [{ size, quantity }]
const getTotalStock = (p) => {
  const direct =
    p.stock ?? p.stockQuantity ?? p.availableStock ?? p.quantity ?? p.qty
  if (direct !== undefined && direct !== null && typeof direct !== 'object') {
    return Number(direct) || 0
  }

  const obj = [p.stock, p.inventory, p.stocks].find(
    (v) => v && typeof v === 'object' && !Array.isArray(v)
  )
  if (obj) {
    if (typeof obj.quantity === 'number') return obj.quantity
    return Object.values(obj).reduce((sum, n) => sum + (Number(n) || 0), 0)
  }

  const arr = [p.variants, p.sizes, p.inventory, p.stock].find(Array.isArray)
  if (arr) {
    return arr.reduce(
      (sum, v) =>
        v && typeof v === 'object'
          ? sum + (Number(v.stock ?? v.quantity ?? v.qty) || 0)
          : sum,
      0
    )
  }

  return 0
}

// Gawing simpleng listahan ng size names ("S", "M", ...) ang sizes,
// at unahin yung may stock. Gumagana sa strings o sa [{ size, stock }].
const getSizeOptions = (sizes) => {
  if (!Array.isArray(sizes)) return []
  const inStock = []
  const outOfStock = []
  sizes.forEach((s) => {
    if (s && typeof s === 'object') {
      const name = s.size ?? s.name ?? s.label
      if (!name) return
      const qty = Number(s.stock ?? s.quantity ?? s.qty ?? 1)
      ;(qty > 0 ? inStock : outOfStock).push(String(name))
    } else if (s !== undefined && s !== null && s !== '') {
      inStock.push(String(s))
    }
  })
  return [...inStock, ...outOfStock]
}

const getDefaultColor = (color) =>
  Array.isArray(color) ? color[0] || '' : color || ''

const toItem = (p) => {
  const sizeOptions = getSizeOptions(p.sizes)

  return {
    id: p._id || p.id,
    _id: p._id || p.id,
    name: p.name,
    price: Number(p.price) || 0,
    image: p.images?.front || p.image,
    images: p.images,
    styles: Array.isArray(p.styles) ? p.styles : [],
    sizes: Array.isArray(p.sizes) ? p.sizes : [],
    sizeOptions,                                  // ["S", "M", "L"] — laging strings
    size: sizeOptions[0] || '',                   // default size para sa checkout
    color: p.color,
    defaultColor: getDefaultColor(p.color),       // laging string
    stock: getTotalStock(p),
    category: p.category,
    subcategory: p.subcategory,
  }
}

export const PickProd = (products = []) => {
  const items = products.map(toItem)
  const cat = (c) => items.filter((p) => p.category === c)
  const sub = (s) => items.filter((p) => p.subcategory === s)

  return {
    tops: cat('tops'),
    bottoms: cat('bottoms'),
    accessories: cat('accessories'),
    shirts: sub('shirts'),
    hoodies: sub('hoodies'),
    longsleeves: sub('longsleeves'),
    pants: sub('pants'),
    shorts: sub('shorts'),
  }
}

let cache = null

export default function useProductData() {
  const [productData, setProductData] = useState(() => PickProd(cache || []))
  const [loading, setLoading] = useState(!cache)
  const [error, setError] = useState('')

  useEffect(() => {
    if (cache) return
    api('/products')
      .then(({ products }) => {
        // console.log('RAW PRODUCT:', products[0])  // i-uncomment para makita ang tunay na shape
        cache = products
        setProductData(PickProd(products))
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return { productData, loading, error }
}