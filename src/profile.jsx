import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from './api'
import { auth } from './auth'
import { php } from './CartContext'
import { AddressFormModal } from './addressModal'
import { ProfileEditModal } from './ProfileEditModal'
import { ReviewModal } from './ReviewModal'
import { OrderDetailsModal } from './OrdersDetailsModal'

import editbutton from './assets/Profile/edit.png'
import orderbutton from './assets/Profile/order.png'
import logoutbutton from './assets/Profile/logout.png'

import anonuser from './assets/anonuser.png'

// Status ng order sa database -> label at CSS class sa badge
const STATUS = {
  pending: { label: 'Pending', badge: 'in-progress' },
  paid: { label: 'Paid', badge: 'in-progress' },
  shipped: { label: 'Shipped', badge: 'in-progress' },
  delivered: { label: 'Delivered', badge: 'delivered' },
  cancelled: { label: 'Cancelled', badge: 'returns' },
}

const IN_PROGRESS = ['pending', 'paid', 'shipped']

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'progress', label: 'In Progress' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'review', label: 'To Review' },
  { id: 'cancelled', label: 'Returns & Cancelled' },
]

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

const describe = (i) =>
  [i.size && `Size: ${i.size}`, i.color && `Color: ${i.color}`, `Qty: ${i.qty}`]
    .filter(Boolean)
    .join(' · ')

function Profile() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('orders')

  // Orders ng naka-login na user
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')

  // Edit profile (pop-up)
  const [profileModal, setProfileModal] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Mga address (maraming address bawat user)
  const [addresses, setAddresses] = useState([])
  const [addrModal, setAddrModal] = useState(null) // null | { address }
  const [addrError, setAddrError] = useState('')

  // Modals para sa order details at review
  const [detailsOrder, setDetailsOrder] = useState(null)
  const [reviewOrder, setReviewOrder] = useState(null)
  const [selectedReviewProduct, setSelectedReviewProduct] = useState(null)

  useEffect(() => {
    if (!auth.getToken()) {
      navigate('/')
      return
    }

    api('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => {
        auth.clear()
        navigate('/')
      })
  }, [navigate])

  useEffect(() => {
    if (!user) return
    api('/orders/mine')
      .then(({ orders }) => setOrders(orders))
      .catch((err) => setOrdersError(err.message))
      .finally(() => setOrdersLoading(false))
  }, [user])

  useEffect(() => {
    if (!user) return
    api('/profile/addresses')
      .then(({ addresses }) => setAddresses(addresses))
      .catch((err) => setAddrError(err.message))
  }, [user])

  const handleSignOut = () => {
    auth.clear()
    navigate('/')
    window.scrollTo(0, 0)
  }

  // Bilang para sa To Ship / To Receive / To Review
  const toShip = orders.filter((o) => o.status === 'pending' || o.status === 'paid').length
  const toReceive = orders.filter((o) => o.status === 'shipped').length
  const toReview = orders.filter((o) => o.status === 'delivered' && !o.reviewed).length

  // Ang pinakabagong order na hindi pa dumarating
  const upcoming = orders.find((o) => IN_PROGRESS.includes(o.status))

  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (filter === 'progress' && !IN_PROGRESS.includes(o.status)) return false
      if (filter === 'delivered' && o.status !== 'delivered') return false
      if (filter === 'review' && !(o.status === 'delivered' && !o.reviewed)) return false
      if (filter === 'cancelled' && o.status !== 'cancelled') return false
      if (!q) return true
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q))
      )
    })
  }, [orders, filter, query])

  // ----- Mga address -----
  const openAddrModal = (a) => {
    setAddrError('')
    setAddrModal({ address: a || null })
  }

  const makeDefaultAddress = async (id) => {
    setAddrError('')
    try {
      const { addresses: list } = await api(`/profile/addresses/${id}`, {
        method: 'PUT',
        body: { isDefault: true },
      })
      setAddresses(list)
    } catch (err) {
      setAddrError(err.message)
    }
  }

  const removeAddress = async (id) => {
    if (!window.confirm('Remove this address?')) return
    setAddrError('')
    try {
      const { addresses: list } = await api(`/profile/addresses/${id}`, { method: 'DELETE' })
      setAddresses(list)
    } catch (err) {
      setAddrError(err.message)
    }
  }

  if (!user) return <p style={{ marginTop: '150px', textAlign: 'center' }}>Loading...</p>

  return (
    <>
      <div className="profile-page-wrapper">
        <div className="profile-container">

          <div className="pic-name">
            <img src={anonuser} alt="" id='display-photo' />
            <div className='profile-flex'>
              <h2 className='user-credential'>{user.username}</h2>
              <h2 className='user-credential'>{user.email}</h2>
            </div>
          </div>

          <div className='profile-functions'>
            <label className='profile-buttons'>
              <input type="radio" name="profile-function" value='' checked={activeTab === 'orders'}
                onChange={() => setActiveTab('orders')} />
              <img src={orderbutton} alt="" className='profile-graphics' />
              Orders
            </label>

            <label className='profile-buttons'>
              <input type="radio" name="profile-function" value='' checked={activeTab === 'edit'}
                onChange={() => setActiveTab('edit')} />
              <img src={editbutton} alt="" className='profile-graphics' />
              Account Details
            </label>

            <label className='profile-buttons' id='logout'>
              <input type="radio" name="profile-function" value='' onChange={handleSignOut} />
              <img src={logoutbutton} alt="" className='profile-graphics' />
              Sign Out
            </label>
          </div>

          <div className='profile-content'>
            {activeTab === 'orders' && (
              <>
                <div className="profile-layout">
                  <div className="profile-column-left">
                    <div className="status-upcoming">
                      <div className='order-status'>
                        <label className='status-title' onClick={() => setFilter('progress')} style={{ cursor: 'pointer' }}>
                          To Ship
                          <div className='status-amount'>{toShip}</div>
                        </label>

                        <label className='status-title' onClick={() => setFilter('progress')} style={{ cursor: 'pointer' }}>
                          To Receive
                          <div className='status-amount'>{toReceive}</div>
                        </label>

                        <label className='status-title' onClick={() => setFilter('review')} style={{ cursor: 'pointer' }}>
                          To Review
                          <div className='status-amount'>{toReview}</div>
                        </label>
                      </div>

                      <div className='upcoming-product'>
                        <h1 className='up-title'>Upcoming Product</h1>

                        {upcoming ? (
                          <div className='product-card-profile'>
                            <img src={upcoming.items[0]?.image} alt={upcoming.items[0]?.name} />

                            <div className='product-info'>
                              <h4>
                                {upcoming.items[0]?.name}
                                {upcoming.items.length > 1 && ` +${upcoming.items.length - 1} more`}
                              </h4>
                              <p>{describe(upcoming.items[0])}</p>
                              <p className='product-price'>{php(upcoming.total)}</p>
                            </div>

                            <span className='product-status shipping'>
                              {STATUS[upcoming.status]?.label}
                            </span>
                          </div>
                        ) : (
                          <p>No upcoming orders.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="profile-column-right">
                    <div className='order-history'>
                      {/* Header */}
                      <div className='order-header'>
                        <h1>Order History</h1>
                        <p className='order-subtext'>Track and manage all your orders in one place</p>
                        <div className='order-search'>
                          <input
                            type="text"
                            placeholder="Search orders by product name or order ID..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                          <button className='search-btn'>🔍</button>
                        </div>
                      </div>

                      {/* Filter Buttons */}
                      <div className='order-filters'>
                        {FILTERS.map((f) => (
                          <button
                            key={f.id}
                            className={`filter-btn ${filter === f.id ? 'active' : ''}`}
                            onClick={() => setFilter(f.id)}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      {/* Order List */}
                      <div className='order-list'>
                        {ordersLoading && <p>Loading your orders...</p>}
                        {ordersError && <p style={{ color: '#ef4444' }}>{ordersError}</p>}
                        {!ordersLoading && !ordersError && orders.length === 0 && (
                          <p>You haven't placed any orders yet.</p>
                        )}
                        {!ordersLoading && orders.length > 0 && visibleOrders.length === 0 && (
                          <p>No orders match your search.</p>
                        )}

                        {visibleOrders.map((o) => {
                          const first = o.items[0]
                          const st = STATUS[o.status] || STATUS.pending

                          return (
                            <div key={o._id}>
                              <div className='order-item'>
                                <div className='order-item-left'>
                                  <img src={first?.image} alt={first?.name} className='order-product-img' />
                                  <div className='order-product-info'>
                                    <h4>
                                      {first?.name}
                                      {o.items.length > 1 && ` +${o.items.length - 1} more`}
                                    </h4>
                                    <p className='order-product-desc'>
                                      #{o.orderNumber} · {describe(first)}
                                    </p>
                                    <p className='order-product-price'>{php(o.total)}</p>
                                  </div>
                                </div>
                                <div className='order-item-right'>
                                  <span className={`order-status-badge ${st.badge}`}>{st.label}</span>
                                  <p className='order-date'>Ordered: {formatDate(o.createdAt)}</p>
                                  <button
                                    className='order-details-btn'
                                    onClick={() => setDetailsOrder(o)}
                                  >
                                    View Details
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'edit' && (
              <>
                {saveMsg && <p style={{ color: '#16a34a' }}>{saveMsg}</p>}

                {/* Contact Details */}
                <div className="contact-details">
                  <div className="section-header">
                    <div className="section-title-group">
                      <h1>Contact Details</h1>
                      <p className="section-subtext">Manage your personal information</p>
                    </div>
                    <button
                      className="edit-btn"
                      onClick={() => {
                        setSaveMsg('')
                        setProfileModal(true)
                      }}
                    >
                      Edit
                    </button>
                  </div>

                  <div className="details-grid">
                    <div className="detail-item">
                      <h3>Email</h3>
                      <h2>{user.email}</h2>
                    </div>
                    <div className="detail-item">
                      <h3>Full Name</h3>
                      <h2>{user.fullName || '—'}</h2>
                    </div>
                    <div className="detail-item">
                      <h3>Phone</h3>
                      <h2>{user.phone || '—'}</h2>
                    </div>
                    <div className="detail-item">
                      <h3>Birth Date</h3>
                      <h2>
                        {user.birthDate
                          ? new Date(user.birthDate).toLocaleDateString('en-PH', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                              timeZone: 'UTC',
                            })
                          : '—'}
                      </h2>
                    </div>
                  </div>
                </div>

                {/* Saved Addresses */}
                <div className="saved-addresses">
                  <div className="section-header">
                    <div className="section-title-group">
                      <h1>Saved Addresses</h1>
                      <p className="section-subtext">Manage your shipping addresses</p>
                    </div>
                    <button className="add-btn" onClick={() => openAddrModal(null)}>
                      + Add Address
                    </button>
                  </div>

                  {addrError && <p style={{ color: '#ef4444', fontSize: '14px' }}>{addrError}</p>}

                  <div className="address-grid">
                    {addresses.length === 0 && !addrError && <p>No address saved.</p>}

                    {addresses.map((a) => (
                      <div key={a._id} className={`address-card ${a.isDefault ? 'default' : ''}`}>
                        <div className="address-header">
                          <span className="address-label">{a.label}</span>
                          {a.isDefault && <span className="address-badge">Default</span>}
                        </div>
                        <p className="address-details">{a.details}</p>
                        <div className="address-actions">
                          <button className="address-edit-btn" onClick={() => openAddrModal(a)}>Edit</button>
                          {!a.isDefault && (
                            <button className="address-edit-btn" onClick={() => makeDefaultAddress(a._id)}>
                              Set Default
                            </button>
                          )}
                          <button className="address-remove-btn" onClick={() => removeAddress(a._id)}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {profileModal && (
        <ProfileEditModal
          user={user}
          onClose={() => setProfileModal(false)}
          onSaved={(updated) => {
            setUser((prev) => ({ ...prev, ...updated }))
            setProfileModal(false)
            setSaveMsg('Saved!')
          }}
        />
      )}

      {addrModal && (
        <AddressFormModal
          address={addrModal.address}
          isFirst={addresses.length === 0}
          onClose={() => setAddrModal(null)}
          onSaved={(list) => {
            setAddresses(list)
            setAddrModal(null)
          }}
        />
      )}

      {detailsOrder && (
        <OrderDetailsModal
          order={detailsOrder}
          onClose={() => setDetailsOrder(null)}
          onWriteReview={(item) => {
            setSelectedReviewProduct(item)
            setReviewOrder(detailsOrder)
            setDetailsOrder(null)
          }}
        />
      )}

      {reviewOrder && selectedReviewProduct && (
        <ReviewModal
          key={`${reviewOrder._id}-${selectedReviewProduct.product}`}
          order={reviewOrder}
          product={selectedReviewProduct}
          onClose={() => {
            setDetailsOrder(reviewOrder)
            setReviewOrder(null)
            setSelectedReviewProduct(null)
          }}
          onSaved={(updated) => {
            setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)))
            setDetailsOrder(updated)
            setReviewOrder(null)
            setSelectedReviewProduct(null)
          }}
        />
      )}
    </>
  )
}

export default Profile