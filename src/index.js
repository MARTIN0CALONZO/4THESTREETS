import { useEffect, useState } from 'react'
import { auth } from './auth'
import { api } from './api'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { CartProvider } from './CartContext'
import './index.css'

import Nav from './Nav'
import Footer from './Footer'
import Home from './Home'
import Products from './Product'
import PickProd from './PickProd'
import Developers from './Developers'
import Profile from './profile'

import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Customers from './pages/Customers'
import Orders from './pages/Orders'
import Notifications from './pages/Notifications'
import Coupons from './pages/Coupons'
import AdminReviews from './pages/AdminReviews';

import StockAlerts from './pages/StockAlerts'

const root = ReactDOM.createRoot(document.getElementById('root'))



function StoreLayout() {
  return (
    <div className="page">
      <Nav />

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/pickprod" element={<PickProd />} />
          <Route path="/developers" element={<Developers />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </main>

      <Footer />
    </div>
  )
}

function AdminLayout() {
  const [status, setStatus] = useState('checking') // checking | ok | denied

  useEffect(() => {
    if (!auth.getToken()) {
      setStatus('denied')
      return
    }
    api('/auth/me')
      .then(({ user }) => {
        if (user.role === 'admin') {
          setStatus('ok')
        } else {
          auth.clear()
          setStatus('denied')
        }
      })
      .catch(() => {
        auth.clear()
        setStatus('denied')
      })
  }, [])

  if (status === 'checking') return null
  if (status === 'denied') return <Navigate to="/" replace />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/stock-alerts" element={<StockAlerts />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/coupons" element={<Coupons />} />
        <Route path="reviews" element={<AdminReviews />} />
      </Routes>

    </Layout>
  )
}

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <CartProvider>
        <Routes>
          <Route path="/admin/*" element={<AdminLayout />} />
          <Route path="*" element={<StoreLayout />} />
        </Routes>
      </CartProvider>
    </BrowserRouter>
  </React.StrictMode>
)