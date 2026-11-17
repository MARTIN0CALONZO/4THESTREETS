import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from './api'
import { auth } from './auth'
import { useCart, php } from './CartContext'
import { createPortal } from 'react-dom'
import "./index.css"
const FEATURED_LIMIT = 8


function Products() {
  const { addItem } = useCart()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()


  const [allProducts, setAllProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')


  // PRODUCT DETAIL STATES
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedImage, setSelectedImage] = useState('')
  const [selectedSize, setSelectedSize] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [showSizeChart, setShowSizeChart] = useState(false)


  // PRODUCT REVIEW STATES
  const [productReviews, setProductReviews] = useState([])
  const [reviewSummary, setReviewSummary] = useState({
    averageRating: 0,
    totalReviews: 0
  })
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [showReviewsModal, setShowReviewsModal] = useState(false)


  // FETCH PRODUCT REVIEWS
  useEffect(() => {
    if (!selectedProduct?._id) return


    let cancelled = false


    setReviewsLoading(true)
    setProductReviews([])
    setReviewSummary({ averageRating: 0, totalReviews: 0 })
    setShowReviewsModal(false)


    api(`/orders/reviews/product/${selectedProduct._id}`)
      .then((data) => {
        if (cancelled) return


        setProductReviews(data.reviews || [])
        setReviewSummary({
          averageRating: Number(data.averageRating) || 0,
          totalReviews: Number(data.totalReviews) || 0,
        })
      })
      .catch((error) => {
        console.error('Failed to load product reviews:', error)
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false)
      })


    return () => {
      cancelled = true
    }
  }, [selectedProduct?._id])


  const getInitialCategory = () => {
    const queryCategory = new URLSearchParams(location.search).get('category')
    const category = String(
      location.state?.category || queryCategory || 'new-arrival'
    ).toLowerCase().trim()


    return [
      'tops', 'bottoms', 'accessories', 'shirts', 'hoodies',
      'longsleeves', 'pants', 'shorts', 'new-arrival', 'best-sellers',
    ].includes(category)
      ? category
      : 'new-arrival'
  }


  const [selectedCategory, setSelectedCategory] = useState(getInitialCategory)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sortBy, setSortBy] = useState('')


  // Product detail overlay


  const searchKeyword = (searchParams.get('search') || '')
    .trim()
    .toLowerCase()


  const requestedProductId = searchParams.get('product')


  const renderStars = (rating) => {
    const safe = Math.min(5, Math.max(0, Math.round(Number(rating) || 0)))
    return '★'.repeat(safe) + '☆'.repeat(5 - safe)
  }


  useEffect(() => {
    setSelectedCategory(getInitialCategory())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.state])


  // Fetch products from the backend
  useEffect(() => {
    let cancelled = false


    api('/products?full=1')
      .then(({ products }) => {
        if (!cancelled) {
          setAllProducts(Array.isArray(products) ? products : [])
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load products.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })


    return () => {
      cancelled = true
    }
  }, [])


  const imageOf = (product) => {
    if (!product) return ''


    if (
      product.images &&
      !Array.isArray(product.images) &&
      typeof product.images === 'object'
    ) {
      return product.images.front || product.image || ''
    }


    if (Array.isArray(product.images)) {
      const firstImage = product.images.find((image) => {
        if (typeof image === 'string') return Boolean(image)
        return Boolean(image && (image.url || image.src || image.image))
      })


      if (typeof firstImage === 'string') return firstImage


      if (firstImage && typeof firstImage === 'object') {
        return (
          firstImage.url ||
          firstImage.src ||
          firstImage.image ||
          product.image ||
          ''
        )
      }
    }


    return product.image || ''
  }


  // Supports images arrays and objects such as front, back, and side
  const imagesOf = (product) => {
    if (!product) return []


    const imageValues = Array.isArray(product.images)
      ? product.images
      : product.images && typeof product.images === 'object'
        ? Object.values(product.images)
        : []


    const normalizedImages = imageValues
      .map((image) => {
        if (typeof image === 'string') return image


        if (image && typeof image === 'object') {
          return image.url || image.src || image.image || ''
        }


        return ''
      })
      .filter(Boolean)


    return [...new Set([imageOf(product), ...normalizedImages].filter(Boolean))]
  }


  const byNewest = (a, b) =>
    new Date(b.createdAt || 0) - new Date(a.createdAt || 0)


  // Search first, then apply price and sorting filters.
  // When there is no search, use the normal category filters.
  const products = useMemo(() => {
    let list = [...allProducts]


    if (searchKeyword) {
      list = list.filter((product) => {
        const name = String(product.name || '').toLowerCase()
        const category = String(product.category || '').toLowerCase()
        const subcategory = String(product.subcategory || '').toLowerCase()
        const description = String(product.description || '').toLowerCase()


        return (
          name.includes(searchKeyword) ||
          category.includes(searchKeyword) ||
          subcategory.includes(searchKeyword) ||
          description.includes(searchKeyword)
        )
      })
    } else {
      if (selectedCategory === 'new-arrival') {
        list = list.sort(byNewest).slice(0, FEATURED_LIMIT)
      } else if (selectedCategory === 'best-sellers') {
        list = list
          .sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0))
          .slice(0, FEATURED_LIMIT)
      } else if (['tops', 'bottoms', 'accessories'].includes(selectedCategory)) {
        list = list.filter(
          (p) => String(p.category || '').toLowerCase() === selectedCategory
        )
      } else {
        list = list.filter(
          (p) => String(p.subcategory || '').toLowerCase() === selectedCategory
        )
      }
    }


    // Price range
    if (minPrice !== '') {
      list = list.filter((p) => Number(p.price) >= Number(minPrice))
    }


    if (maxPrice !== '') {
      list = list.filter((p) => Number(p.price) <= Number(maxPrice))
    }


    // Sorting
    if (sortBy === 'newest') list.sort(byNewest)


    if (sortBy === 'sold') {
      list.sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0))
    }


    if (sortBy === 'rating') {
      list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
    }


    if (sortBy === 'low') {
      list.sort((a, b) => Number(a.price) - Number(b.price))
    }


    if (sortBy === 'high') {
      list.sort((a, b) => Number(b.price) - Number(a.price))
    }


    return list
  }, [
    allProducts,
    selectedCategory,
    minPrice,
    maxPrice,
    sortBy,
    searchKeyword,
  ])


  const handleCategoryChange = (value) => {
    setSelectedCategory(value)


    // Clear search when the user manually selects a category
    if (searchParams.has('search')) {
      const params = new URLSearchParams(location.search)
      params.delete('search')


      navigate(
        `${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`,
        { replace: true, state: location.state }
      )
    }
  }


  const openProductDetail = (product) => {
    setSelectedProduct(product)
    setSelectedImage(imagesOf(product)[0] || '')
    setSelectedSize('')
    setQuantity(1)
    setShowSizeChart(false)
    document.body.style.overflow = 'hidden'
  }


  const closeProductDetail = () => {
    setSelectedProduct(null)
    setSelectedImage('')
    setShowSizeChart(false)
    setShowReviewsModal(false)  
    document.body.style.overflow = 'auto'


    // Remove the direct-product query but keep other query parameters
    if (new URLSearchParams(location.search).has('product')) {
      const params = new URLSearchParams(location.search)
      params.delete('product')


      navigate(
        `${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`,
        { replace: true, state: location.state }
      )
    }
  }


  // Open a specific product from URLs such as /products?product=PRODUCT_ID
  useEffect(() => {
    if (!requestedProductId || loading || !allProducts.length) return


    const product = allProducts.find(
      (p) => String(p._id) === String(requestedProductId)
    )


    if (product) openProductDetail(product)


    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedProductId, loading, allProducts])


  // Restore scrolling if the page unmounts while the overlay is open
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [])


  // Stock of the selected size; older products use total stock
  const stockOf = (product, size) => {
    if (!product) return 0


    return Array.isArray(product.sizeStock) && product.sizeStock.length
      ? Number(product.sizeStock.find((s) => s.size === size)?.stock ?? 0)
      : Number(product.stock ?? 0)
  }


  const canBuy = () => {
    if (!auth.getToken()) {
      closeProductDetail()


      window.dispatchEvent(
        new CustomEvent('open-login', {
          detail: { message: 'Please login to access this feature.' },
        })
      )


      return false
    }


    if (!selectedSize) {
      alert('Please select a size')
      return false
    }


    const availableStock = stockOf(selectedProduct, selectedSize)


    if (availableStock <= 0) {
      alert('This size is sold out.')
      return false
    }


    if (quantity > availableStock) {
      alert(`Only ${availableStock} item(s) available for this size.`)
      return false
    }


    return true
  }


  const selectedItem = () => ({
    productId: selectedProduct._id,
    name: selectedProduct.name,
    price: selectedProduct.price,
    image: imageOf(selectedProduct),
    color: selectedProduct.color || '-',
    size: selectedSize,
    qty: quantity,
  })


  const handleAddToCart = () => {
    if (!canBuy()) return


    addItem(selectedItem())
    closeProductDetail()
  }


  const handleCheckout = () => {
    if (!canBuy()) return


    const item = selectedItem()
    closeProductDetail()


    window.dispatchEvent(
      new CustomEvent('open-checkout', { detail: { item } })
    )
  }


  const soldOut = selectedProduct && Number(selectedProduct.stock) <= 0


  // Stock ng kasalukuyang napiling size (para sa stock info sa ilalim ng size buttons)
  const selectedSizeStock = selectedSize ? stockOf(selectedProduct, selectedSize) : 0


  const categoryRadio = (
    value,
    label,
    className = 'specific-categories'
  ) => (
    <label className={className} key={value}>
      <input
        type="radio"
        name="categories"
        value={value}
        checked={selectedCategory === value}
        onChange={(e) => handleCategoryChange(e.target.value)}
      />
      {label}
    </label>
  )


  return (
    <div className="products-page">
      <h1 className="TitleText" id="title-product-page">02 PRODUCTS</h1>


      <div className="filter-content">
        <input
          type="number"
          min="0"
          placeholder="Minimum ₱"
          className="filter-input"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
        />


        <input
          type="number"
          min="0"
          placeholder="Maximum ₱"
          className="filter-input"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
        />


        <select
          className="dropdown-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="">Sort By</option>
          <option value="newest">By Release Date</option>
          <option value="sold">By Amount of sold</option>
          <option value="rating">By Highest Ratings</option>
          <option value="low">Price: Low to High</option>
          <option value="high">Price: High to Low</option>
        </select>
      </div>


      <div className="products-wrapper">
        <div className="products-sidebar">
          <div className="category-container">
            <p className="TitleText" id="sidebar-title">Featured</p>
            {categoryRadio('new-arrival', 'New Arrival')}
            {categoryRadio('best-sellers', 'Best Sellers')}
          </div>


          <div className="category-container">
            <p className="TitleText" id="sidebar-title">Categories</p>
            {categoryRadio('tops', 'Tops', 'sub-category')}
            {categoryRadio('shirts', 'Shirts')}
            {categoryRadio('hoodies', 'Hoodies')}
            {categoryRadio('longsleeves', 'Longsleeves')}
            {categoryRadio('bottoms', 'Bottoms', 'sub-category')}
            {categoryRadio('pants', 'Pants')}
            {categoryRadio('shorts', 'Shorts')}
            {categoryRadio('accessories', 'Accessories', 'sub-category')}
          </div>
        </div>


        <div className="product-grid" id="product-grid-page">
          {searchKeyword && (
            <div className="search-results-heading">
              <h2>Search results for "{searchParams.get('search')}"</h2>
              <p>{products.length} product(s) found</p>
            </div>
          )}


          {loading && <p>Loading products...</p>}


          {error && <p style={{ color: '#ef4444' }}>{error}</p>}


          {!loading && !error && products.length === 0 && (
            <p style={{ gridColumn: '1 / -1' }}>
              {searchKeyword
                ? `No products found matching "${searchParams.get('search')}".`
                : 'No products found.'}
            </p>
          )}


          {!loading && !error && products.map((product) => (
            <div
              key={product._id}
              className="product-card"
              id="product-card-page"
              onClick={() => openProductDetail(product)}
            >
              <img
                src={imageOf(product)}
                alt={product.name}
                className="product-image"
              />


              <p className="product-name">{product.name}</p>


              <p className="product-rating">
                {Number(product.stock) <= 0
                  ? 'Sold out'
                  : `☆ ${Number(product.rating ?? 5).toFixed(1)}`}
              </p>


              <p className="product-price">{php(product.price)}</p>
            </div>
          ))}
        </div>


        {/* PRODUCT DETAIL */}
        {selectedProduct && (
          <div className="product-overlay" onClick={closeProductDetail}>
            <div
              className="product-overlay-content"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="overlay-close"
                onClick={closeProductDetail}
              >
                ✕
              </button>


              <div className="overlay-inner">
                <div className="overlay-gallery">
                  <div className="overlay-image-container">
                    {selectedImage ? (
                      <img
                        src={selectedImage}
                        alt={`${selectedProduct.name} product view`}
                        className="gallery-main-image"
                      />
                    ) : (
                      <div className="gallery-no-image">
                        No product image available
                      </div>
                    )}
                  </div>


                  {imagesOf(selectedProduct).length > 1 && (
                    <div
                      className="product-image-thumbnails"
                      aria-label="Product images"
                    >
                      {imagesOf(selectedProduct).map((image, index) => (
                        <button
                          type="button"
                          key={`${image}-${index}`}
                          className={`product-thumbnail ${
                            selectedImage === image ? 'active' : ''
                          }`}
                          onClick={() => setSelectedImage(image)}
                          aria-label={`View product image ${index + 1}`}
                          aria-pressed={selectedImage === image}
                        >
                          <img
                            src={image}
                            alt={`${selectedProduct.name} view ${index + 1}`}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>


                <div className="overlay-info">
                  <h2 className="overlay-product-name">
                    {selectedProduct.name}
                  </h2>


                  <p className="overlay-product-price">
                    {php(selectedProduct.price)}
                  </p>


                  {selectedProduct.description && (
                    <p>{selectedProduct.description}</p>
                  )}
                  <section className="product-reviews-section">
                    <div className="reviews-header">
                      <h3 className="reviews-title">Customer Reviews</h3>


                      {!reviewsLoading && productReviews.length > 0 && (
                        <button
                          type="button"
                          className="view-reviews-btn"
                          onClick={() => setShowReviewsModal(true)}
                        >
                          View Reviews →
                        </button>
                      )}
                    </div>


                    <div className="product-rating-preview">
                      <span className="product-rating-stars">
                        {renderStars(reviewSummary.averageRating)}
                      </span>


                      <span className="product-rating-score">
                        {reviewSummary.totalReviews > 0
                          ? reviewSummary.averageRating.toFixed(1)
                          : '0.0'}
                      </span>


                      <span className="product-rating-count">
                        ({reviewSummary.totalReviews} reviews)
                      </span>
                    </div>


                    {reviewsLoading && <p className="no-reviews-text">Loading reviews...</p>}


                    {!reviewsLoading && productReviews.length === 0 && (
                      <p className="no-reviews-text">No reviews yet.</p>
                    )}


                    {!reviewsLoading && productReviews.length > 0 && (() => {
                     
                      const top = [...productReviews].sort((a, b) => b.rating - a.rating)[0]


                      return (
                        <div className="review-inline" key={top._id}>
                          <div className="review-inline-top">
                            <strong>{top.username}</strong>
                            <span className="product-rating-stars">{renderStars(top.rating)}</span>
                          </div>


                          {top.comment && <p className="review-inline-comment">{top.comment}</p>}


                          {top.reply && (
                            <div className="review-reply">
                              <strong className="review-reply-label">Response from 4thestreets</strong>
                              <p className="review-reply-text">{top.reply}</p>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </section>


                  <div className="size-section">
                    <div className="size-header">
                      <p className="size-label">Size:</p>


                      {selectedProduct.category === 'tops' && (
                        <button
                          type="button"
                          className="size-chart-link"
                          onClick={() => setShowSizeChart(true)}
                        >
                          Size Chart
                        </button>
                      )}
                    </div>


                    <div className="size-buttons">
                      {(selectedProduct.sizes || []).map((size) => {
                        const left = stockOf(selectedProduct, size)


                        return (
                          <button
                            type="button"
                            key={size}
                            className={`size-btn ${
                              selectedSize === size ? 'selected' : ''
                            }`}
                            disabled={left <= 0}
                            style={
                              left <= 0
                                ? { opacity: 0.4, cursor: 'not-allowed' }
                                : undefined
                            }
                            onClick={() => {
                              setSelectedSize(size)
                              setQuantity(1)
                            }}
                          >
                            <span className="size-name">{size}</span>
                            <span className="size-stock">
                              {left > 0 ? `${left} left` : 'Sold out'}
                            </span>
                          </button>
                        )
                      })}
                    </div>


                    {selectedSize && (
                      <p
                        className={`stock-info ${selectedSizeStock <= 5 ? 'low' : ''}`}
                      >
                        {selectedSizeStock} in stock for size {selectedSize}
                        {selectedSizeStock <= 5 && selectedSizeStock > 0 && ' · Almost sold out!'}
                      </p>
                    )}
                  </div>


                  <div className="quantity-section">
                    <label className="quantity-label">Quantity:</label>


                    <div className="quantity-controls">
                      <button
                        type="button"
                        className="qty-btn"
                        disabled={quantity <= 1}
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      >
                        −
                      </button>


                      <span className="qty-value">{quantity}</span>


                      <button
                        type="button"
                        className="qty-btn"
                        disabled={
                          (selectedSize
                            ? stockOf(selectedProduct, selectedSize)
                            : Number(selectedProduct.stock || 0)) <= quantity
                        }
                        onClick={() => {
                          const maxStock = selectedSize
                            ? stockOf(selectedProduct, selectedSize)
                            : Number(selectedProduct.stock || 0)


                          setQuantity(Math.min(maxStock, quantity + 1))
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>


                  <div className="overlay-actions">
                    <button
                      type="button"
                      className="add-to-cart-btn"
                      onClick={handleAddToCart}
                      disabled={Boolean(soldOut)}
                    >
                      {soldOut ? 'Sold Out' : 'Add to Cart'}
                    </button>


                    <button
                      type="button"
                      className="checkout-btn"
                      onClick={handleCheckout}
                      disabled={Boolean(soldOut)}
                    >
                      Checkout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* SIZE CHART MODAL */}
        {showSizeChart && (
          <div
            className="size-chart-overlay"
            onClick={() => setShowSizeChart(false)}
          >
            <div
              className="size-chart-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="size-chart-close"
                onClick={() => setShowSizeChart(false)}
              >
                ✕
              </button>


              <h2 className="size-chart-title">Size Chart</h2>
              <p className="size-chart-subtitle">Measurements in inches</p>


              <div className="size-chart-table-wrapper">
                <table className="size-chart-table">
                  <thead>
                    <tr>
                      <th>Size</th>
                      <th>Chest / Width</th>
                      <th>Length</th>
                      <th>Shoulder</th>
                    </tr>
                  </thead>


                  <tbody>
                    <tr><td>S</td><td>20"</td><td>27"</td><td>18"</td></tr>
                    <tr><td>M</td><td>21"</td><td>28"</td><td>19"</td></tr>
                    <tr><td>L</td><td>22"</td><td>29"</td><td>20"</td></tr>
                    <tr><td>XL</td><td>23"</td><td>30"</td><td>21"</td></tr>
                    <tr><td>2XL</td><td>24"</td><td>31"</td><td>22"</td></tr>
                    <tr><td>3XL</td><td>25"</td><td>32"</td><td>23"</td></tr>
                  </tbody>
                </table>
              </div>


              <p className="size-chart-note">
                * Please allow 1-2 inches difference due to manual measurement.
              </p>
            </div>
          </div>
        )}
        {/* REVIEWS MODAL */}
          {showReviewsModal && selectedProduct &&
            createPortal(
              <div
                className="reviews-modal-overlay"
                onClick={() => setShowReviewsModal(false)}
              >
                <div
                  className="reviews-modal"
                  role="dialog"
                  aria-modal="true"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="reviews-modal-header">
                    <div>
                      <h2 className="reviews-modal-title">Customer Reviews</h2>
                      <p className="reviews-modal-product">{selectedProduct.name}</p>
                    </div>


                    <button
                      type="button"
                      className="reviews-modal-close"
                      onClick={() => setShowReviewsModal(false)}
                      aria-label="Close reviews"
                    >
                      ✕
                    </button>
                  </div>


                  <div className="reviews-modal-summary">
                    <span className="reviews-modal-score">
                      {reviewSummary.averageRating.toFixed(1)}
                    </span>


                    <div className="reviews-modal-summary-info">
                      <span className="product-rating-stars">
                        {renderStars(reviewSummary.averageRating)}
                      </span>
                      <span className="product-rating-count">
                        {reviewSummary.totalReviews}{' '}
                        {reviewSummary.totalReviews === 1 ? 'review' : 'reviews'}
                      </span>
                    </div>
                  </div>


                  <div className="reviews-modal-list">
                    {productReviews.map((review) => (
                      <div className="review-card" key={review._id}>
                        <div className="review-card-top">
                          <div className="review-avatar">
                            {String(review.username || '?').charAt(0).toUpperCase()}
                          </div>


                          <div className="review-card-meta">
                            <strong className="review-username">{review.username}</strong>
                            <span className="product-rating-stars review-card-stars">
                              {renderStars(review.rating)}
                            </span>
                          </div>


                          <small className="review-date">
                            {new Date(review.createdAt).toLocaleDateString('en-PH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </small>
                        </div>


                        {review.comment && (
                          <p className="review-comment">{review.comment}</p>
                        )}


                        {review.reply && (
                          <div className="review-reply">
                            <strong className="review-reply-label">Response from 4thestreets</strong>
                            <p className="review-reply-text">{review.reply}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>,
              document.body
            )}
      </div>
    </div>
  )
}


export default Products