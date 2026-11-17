
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from './api'
import { php } from './CartContext'
import Carou1 from './assets/Carou1.png'
import Carou2 from './assets/Carou2.png'
import Carou3 from './assets/Carou3.png'
import Streetwearvid from './assets/streetwearvid.mp4'
import TopsImage from './assets/Categories/Tops.jpg'
import BottomsImage from './assets/Categories/Bottoms.jpg'
import AccessoriesImage from './assets/Categories/Accessories.jpg'

import martinvid from './assets/martin.mp4'
import rhayvid from './assets/rhayzzie.mp4'
import edrianvid from './assets/edrian.mp4'
import rodnervid from './assets/rodner.mp4'
import gadvid from './assets/gad.mp4'
import jcvid from './assets/jc.mp4'

// Ilan ang ipapakita sa NEW ARRIVALS
const NEW_ARRIVALS_COUNT = 4

// Developers (static list, so it lives outside the component)
const devs = [
  { id: 1, name: "Calonzo, Martin S.", role: "Back-End Developer", year: "2006", style: "collected/plain", video: martinvid },
  { id: 2, name: "Dela Cruz, Rhayzzie Juslene G.", role: "Researcher", year: "2006", style: "feminine", video: rhayvid },
  { id: 3, name: "Francia, Gad Daniel Kellyn C.", role: "Front-End Developer", year: "2006", style: "cool", video: gadvid },
  { id: 4, name: "Halili, Edrian Sedrik E.", role: "Back-End Developer", year: "2006", style: "wild", video: edrianvid },
  { id: 5, name: "Perez, Jan Christian C.", role: "Front-End Developer", year: "2003", style: "playful", video: jcvid },
  { id: 6, name: "Santos, Rodner L.", role: "Researcher", year: "2006", style: "cool", video: rodnervid },
]

// Kunin ang larawan ng product kahit ano pa ang pangalan ng field
const productImage = (p) => {
  if (p.image) return p.image
  if (p.thumbnail) return p.thumbnail
  if (Array.isArray(p.images) && p.images.length) {
    const first = p.images[0]
    return typeof first === 'string' ? first : first?.url || ''
  }
  return ''
}

// Pinakabago muna: ayon sa createdAt, o sa _id kung walang createdAt
const newestFirst = (a, b) => {
  if (a.createdAt && b.createdAt) {
    return new Date(b.createdAt) - new Date(a.createdAt)
  }
  return String(b._id || '').localeCompare(String(a._id || ''))
}

function Home() {
  const navigate = useNavigate()

  // Carousel state
  const [currentSlide, setCurrentSlide] = useState(0)
  const [selectedDev, setSelectedDev] = useState(devs[0])

  // New Arrivals (galing sa database)
  const [newArrivals, setNewArrivals] = useState([])
  const [arrivalsLoading, setArrivalsLoading] = useState(true)
  const [arrivalsError, setArrivalsError] = useState('')

  // Pumunta sa ibang page at bumalik sa taas
  const goTo = (path) => {
    navigate(path)
    setTimeout(() => window.scrollTo(0, 0), 50)
  }

  const openProduct = () => goTo('/products')

  // Carousel data 
  const slides = [
    {
      id: 1,
      modelImage: Carou1,
      subtitle: "4VERYONE",
      text: "Bringing streetstyle fashion to everyone"
    },
    {
      id: 2,
      modelImage: Carou2,
      subtitle: "BEST SELLERS",
      text: "View the best sellers last month"
    },
    {
      id: 3,
      modelImage: Carou3,
      subtitle: "PICKPROD",
      text: "Create an outfit of your choice"
    }
  ]

  const categories = [
  {
    id: 1,
    name: "TOPS",
    image: TopsImage,
    subcategories: ["Hoodies", "Longsleeves", "Shirts"]
  },
  {
    id: 2,
    name: "BOTTOMS",
    image: BottomsImage,
    subcategories: ["Pants","Shorts"]
  },
  {
    id: 3,
    name: "ACCESSORIES",
    image: AccessoriesImage,
    subcategories: [""]
  }
  ]

  // Kunin ang pinakabagong mga product mula sa database
  useEffect(() => {
    let cancelled = false

    api('/products')
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : data?.products || []
        setNewArrivals([...list].sort(newestFirst).slice(0, NEW_ARRIVALS_COUNT))
      })
      .catch((err) => {
        if (!cancelled) setArrivalsError(err.message || 'Could not load products.')
      })
      .finally(() => {
        if (!cancelled) setArrivalsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Auto-slide every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [slides.length])

  const goToSlide = (index) => {
    setCurrentSlide(index)
  }

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)
  }

  return (
    <>
    <div className='home-container'>
    <div className='Introduction'>
      <div className='HomeTextContainer'>
        {/* Left Side - Main Text */}
        <div id='IntroText'>
          <h2 className='TitleText'>01 4THESTREETS</h2>
          <p className='introSubtext'>
            StreetWear Apparel—where the streets meet style, and budget meets quality. 
            We bring you the freshest urban fashion at prices that work for every pocket. 
            From thrift-inspired fits to high-end streetwear essentials, our collection 
            is designed to make everyone look like a million bucks—without spending it. 
            Because real style doesn't discriminate, and neither do we.
          </p>
          <button id='introShopBtn' onClick={() => goTo('/products')}>SHOP NOW</button>
        </div>

        {/* Right Side - Carousel */}
        <div id='introCarouselWrapper'>
          <div id='introCarousel'>
            {/* Fixed Background */}
            <div className='carousel-bg'></div>
            <div className='carousel-content-wrapper'>
              <img 
                src={slides[currentSlide].modelImage} 
                alt={slides[currentSlide].subtitle}
                className='carousel-model'
                key={currentSlide}
              />
              
              {/* Text Overlay right side*/}
              <div className='carousel-text'>
                <h3 className='carousel-title'>{slides[currentSlide].subtitle}</h3>
                <p className='carousel-description'>{slides[currentSlide].text}</p>
                <div className='carousel-dots'>
                  {slides.map((_, index) => (
                    <span
                      key={index}
                      className={`dot ${index === currentSlide ? 'active' : ''}`}
                      onClick={() => goToSlide(index)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Navigation Arrows */}
            <button className='carousel-prev' onClick={prevSlide}>❮</button>
            <button className='carousel-next' onClick={nextSlide}>❯</button>
          </div>
        </div>
      </div>
    </div>

    {/* New Arrival Section */}
    <h1 className='section-title'>NEW ARRIVALS</h1>
    <div className='NewArrival'>
      <div className='product-grid'>
        {arrivalsLoading && (
          <p className='arrivals-status'>Loading new arrivals...</p>
        )}

        {!arrivalsLoading && arrivalsError && (
          <p className='arrivals-status'>Could not load new arrivals. Please try again later.</p>
        )}

        {!arrivalsLoading && !arrivalsError && newArrivals.length === 0 && (
          <p className='arrivals-status'>No new arrivals yet.</p>
        )}

        {newArrivals.map((product) => {
          const img = productImage(product)
          return (
            <div
              key={product._id || product.id}
              className='product-card clickable'
              role='button'
              tabIndex={0}
              onClick={openProduct}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openProduct()
                }
              }}
            >
              {img ? (
                <img src={img} alt={product.name} className='product-image' />
              ) : (
                <div className='product-image product-image-empty' />
              )}
              <p className='product-name'>{product.name}</p>
              <p className='product-price'>{php(product.price)}</p>
            </div>
          )
        })}
      </div>
      <button id='NewArrivalMore' onClick={() => goTo('/products')}>View More</button>
    </div>
    <div className='video-hero-section'>
  <video 
    className='hero-video'
    src={Streetwearvid}
    autoPlay
    loop
    muted
    playsInline
    controls={false}
    disablePictureInPicture
  />
  
  <div className='video-overlay-gradient'></div>
  
  <div className='video-overlay'>
    <h2 className='TitleText' id ='vidtext'>Every street tells a story. Wear yours.</h2>
  </div>
</div>

{/* CATEGORIES */}
<h1 className='section-title'>CATEGORIES</h1>
<div className='category-section'>
  <div className='category-grid-3'>
    {categories.map((category) => (
      <div key={category.id} className='category-card-large'>
        <img src={category.image} alt={category.name} />
        <div className='category-overlay'>
          <h2>{category.name}</h2>
          <p>{category.subcategories.filter(Boolean).join(' · ')}</p>
          <button
            className='shop-category-btn'
            onClick={() =>
              goTo(`/products?category=${encodeURIComponent(category.name.toLowerCase())}`)
            }
          >
            SHOP NOW →
          </button>
        </div>
      </div>
    ))}
  </div>
</div>
    </div>
      <h1 className='section-title' id='categorytitle'>THE DEVELOPERS</h1>
    <div className="dev-video-page">

  <div className="video-container">
    <video
      className="fullscreen-video"
      src={selectedDev?.video || martinvid}
      autoPlay
      loop
      muted
      playsInline
      controls={false}
      disablePictureInPicture
      onContextMenu={(e) => e.preventDefault()}
      key={selectedDev?.id}
    />
    <div className="video-dark-overlay"></div>

    {selectedDev && (
      <div className="dev-overlay-content">
        <div className="dev-desc">
          <h1 className="dev-name">{selectedDev.name}</h1>
          <h2 className="dev-role">{selectedDev.role}</h2>
          <div className="dev-tags">
            <span className="dev-tag">{selectedDev.year}</span>
            <span className="dev-tag">{selectedDev.style}</span>
          </div>
        </div>
      </div>
    )}
  </div>

  <div className="dev-buttons-container">
    <div className="dev-buttons-wrapper">
      {devs.map((dev) => (
        <button
          key={dev.id}
          className={`dev-btn ${selectedDev?.id === dev.id ? 'active' : ''}`}
          onClick={() => setSelectedDev(dev)}
        >
          <span className="dev-btn-name">{dev.name.split(',')[0]}</span>
          <span className="dev-btn-role">{dev.role}</span>
        </button>
      ))}
    </div>
  </div>
</div>
    </>
  )
}

export default Home