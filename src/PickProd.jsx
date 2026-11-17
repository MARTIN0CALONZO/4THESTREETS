import { useState, useEffect, useRef } from 'react'
import pickprodImage from './assets/pickprodimage.png'
import useProductData, { formatPrice } from './productData'
import { OutfitFitModal } from './Pickprodmodal'

function PickProd() {
  const { productData, loading, error } = useProductData()

  const [minBudget, setMinBudget] = useState('')
  const [maxBudget, setMaxBudget] = useState('')
  const [selectedStyle, setSelectedStyle] = useState('')

  const [outfit, setOutfit] = useState(null)   
  const [isGenerating, setIsGenerating] = useState(false)
  const [shuffleData, setShuffleData] = useState(null)
  const timerRef = useRef(null)
  const featureRef = useRef(null)   // para sa START BUILDING scroll

  // ETO YUNG PANG POP-UP MODALS PARA SA ACCURACY LANG
  const [showFit, setShowFit] = useState(false)
  const [lastInputs, setLastInputs] = useState(null)

  useEffect(() => () => clearInterval(timerRef.current), [])

  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [waistSize, setWaistSize] = useState('')

  const handleGenerateOutfit = () => {
    if (!minBudget || !maxBudget || !selectedStyle) {
      alert('Please set your budget (min and max) and select a style preference!')
      return
    }

    const min = Number(minBudget)
    const max = Number(maxBudget)

    // style must match AND the item must still be in stock
    const matchesStyle = (item) => item.styles?.includes(selectedStyle) && item.stock > 0

    const tops = productData.tops.filter(matchesStyle)
    const bottoms = productData.bottoms.filter(matchesStyle)
    const accessories = productData.accessories.filter(matchesStyle)

    const validOutfits = []
    for (const top of tops) {
      for (const bottom of bottoms) {
        for (const accessory of accessories) {
          const total = top.price + bottom.price + accessory.price
          if (total >= min && total <= max) {
            validOutfits.push({ top, bottom, accessory, total })
          }
        }
      }
    }

    if (validOutfits.length === 0) {
      setOutfit(null)
      setShuffleData(null)
      setShowFit(false)
      alert('No outfit found for that budget and style. Try a wider budget range!')
      return
    }

    setLastInputs({
      min,
      max,
      style: selectedStyle,
      weight,
      height,
      waist: waistSize,
    })
    setShowFit(false)

    setIsGenerating(true)
    setOutfit(null) // Hide the old outfit

    let shuffleCount = 0
    const maxShuffles = 10 // Number of rapid changes
    const shuffleSpeed = 100 // milliseconds per change

    clearInterval(timerRef.current)
    const interval = setInterval(() => {
      // Pick random items to display during the shuffle
      const randomTop = tops[Math.floor(Math.random() * tops.length)]
      const randomBottom = bottoms[Math.floor(Math.random() * bottoms.length)]
      const randomAcc = accessories[Math.floor(Math.random() * accessories.length)]

      setShuffleData({
        top: randomTop,
        bottom: randomBottom,
        accessory: randomAcc
      })

      shuffleCount++

      // When done shuffling, show the final result
      if (shuffleCount >= maxShuffles) {
        clearInterval(interval)
        const randomOutfit = validOutfits[Math.floor(Math.random() * validOutfits.length)]
        
        setTimeout(() => {
          setOutfit(randomOutfit)
          setShuffleData(null)
          setIsGenerating(false)
          setShowFit(true) // lalabas ang pop-up pagkatapos ng shuffle
        }, 150) // Slight pause before revealing the final result
      }
    }, shuffleSpeed)
    timerRef.current = interval
  }

  // Buksan ang parehong checkout modal na ginagamit ng Nav.jsx.
  // Isasama sa checkout ang top, bottom, at accessory bilang magkakahiwalay na items.
  const handleShopOutfit = () => {
    if (!outfit) return

    const items = [outfit.top, outfit.bottom, outfit.accessory].map((item) => ({
      ...item,
      productId: item.productId || item._id || item.id,
      name: item.name,
      price: Number(item.price) || 0,
      image: item.image,
      qty: 1,
      // Dati '' ang size/color kaya walang mahanap na stock ang backend.
      // Ngayon: gamitin ang default size (unang size na may stock) at unang color.
      color: item.defaultColor || (Array.isArray(item.color) ? item.color[0] : item.color) || '',
      size: item.size || item.sizeOptions?.[0] || '',
    }))

    if (items.some((item) => !item.productId)) {
      console.error('Shop This Outfit: may product na walang productId sa productData.')
      alert('Unable to checkout this outfit because a product ID is missing.')
      return
    }

    window.dispatchEvent(
      new CustomEvent('open-checkout', {
        detail: { items },
      })
    )
  }

  // START BUILDING: mag-scroll pababa sa form ng PickProd
  const handleStartBuilding = () => {
    featureRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // what the right-hand card shows: the shuffle while animating, else the final outfit
  const shown = isGenerating ? shuffleData : outfit

  return (
    <div className='home-container'>
      {/* TOP SECTION - Introduction */}
      <div className='Introduction'>
        <div className='HomeTextContainer'>
          <div id='IntroText'>
            <h2 className='TitleText'>03 PICKPROD</h2>
            <p className='introSubtext'>
              Welcome to PICKPROD — your personal AI-powered styling assistant!
            </p>
            <p className='introSubtext'>
              Simply set your budget and choose your preferred styles, and our intelligent 
              system will curate a complete outfit just for you. We'll handpick the perfect 
              combination of a top, bottom, and accessory from our extensive collection — 
              all tailored to fit your taste and budget. Whether you're going for streetwear 
              chic, minimalist vibes, or bold statement looks, PICKPROD makes styling effortless.
            </p>
            <button id='introShopBtn' onClick={handleStartBuilding}>START BUILDING</button>
          </div>

          <div id='pickprodCarouselWrapper'>
            <div id='introCarousel'>      
              <div className='carousel-content-wrapper' style={{ justifyContent: 'center' }}>
                <img 
                  src={pickprodImage} 
                  alt="PickProd"
                  className='carousel-model'
                  id ='pickprod-img'
                  style={{ margin: '0 auto' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PICKPROD FEATURE */}
      <div className='pickprod-feature' ref={featureRef} style={{ scrollMarginTop: '90px' }}>
        
        <div className='pickprod-container'>
          
          {/* Left - Input Section */}
          <div className='pickprod-inputs'>
            <h2 className='section-title' id='pickprod-title'>BUILD YOUR OUTFIT</h2>
            
            {/* Budget */}
            <div className='pickprod-group'>
              <label>Set Your Budget</label>
              <div className='budget-inputs'>
                <input 
                  type='number' 
                  placeholder='Min (₱)' 
                  className='budget-input'
                  value={minBudget}
                  onChange={(e) => setMinBudget(e.target.value)}
                />
                <span>—</span>
                <input 
                  type='number' 
                  placeholder='Max (₱)' 
                  className='budget-input'
                  value={maxBudget}
                  onChange={(e) => setMaxBudget(e.target.value)}
                />
              </div>
            </div>

            {/* Body Measurements */}
            <div className='pickprod-group'>
              <label>Body Measurements</label>
              <div className='measurement-inputs'>
                <div className='measurement-field'>
                  <input 
                    type='number' 
                    placeholder='Weight (kg)' 
                    className='measurement-input'
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </div>
                <div className='measurement-field'>
                  <input 
                    type='number' 
                    placeholder='Height (cm)' 
                    className='measurement-input'
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                  />
                </div>
                <div className='measurement-field'>
                  <input 
                    type='number' 
                    placeholder='Waist Size (inches)' 
                    className='measurement-input'
                    value={waistSize}
                    onChange={(e) => setWaistSize(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Style */}
            <div className='pickprod-group'>
              <label>Choose Your Style</label>
              <div className='style-options'>
                <button 
                  className={`style-btn ${selectedStyle === 'streetwear' ? 'active' : ''}`}
                  onClick={() => setSelectedStyle('streetwear')}
                >
                  Streetwear
                </button>
                <button 
                  className={`style-btn ${selectedStyle === 'minimalist' ? 'active' : ''}`}
                  onClick={() => setSelectedStyle('minimalist')}
                >
                  Minimalist
                </button>
                <button 
                  className={`style-btn ${selectedStyle === 'vintage' ? 'active' : ''}`}
                  onClick={() => setSelectedStyle('vintage')}
                >
                  Vintage
                </button>
                <button 
                  className={`style-btn ${selectedStyle === 'bold' ? 'active' : ''}`}
                  onClick={() => setSelectedStyle('bold')}
                >
                  Bold Statement
                </button>
                <button 
                  className={`style-btn ${selectedStyle === 'y2k' ? 'active' : ''}`}
                  onClick={() => setSelectedStyle('y2k')}
                >
                  Y2K
                </button>
              </div>
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: '14px' }}>{error}</p>}

            <button 
              className='generate-btn' 
              onClick={handleGenerateOutfit}
              disabled={isGenerating || loading}
              style={{ opacity: isGenerating ? 0.7 : 1, cursor: isGenerating ? 'wait' : 'pointer' }}
            >
              {loading ? 'Loading products...' : isGenerating ? 'Styling...' : 'Generate Outfit'}
            </button>
          </div>

          {/* Right - Suggestion Output */}
          <div className='pickprod-suggestion'>
            <h3>Your Outfit</h3>
            
            {shown ? (
              <div className={`outfit-result ${isGenerating ? 'shuffling' : ''}`}>
                
                {/* Top */}
                <div className='outfit-item-with-image'>
                  <img 
                    src={shown.top.image} 
                    alt="Top" 
                    className='outfit-product-image' 
                  />
                  <div className='outfit-item-details'>
                    <span className='outfit-label'>Top</span>
                    <span className='outfit-value'>
                      {shown.top.name}
                    </span>
                    {!isGenerating && (
                      <span className='outfit-price'>{formatPrice(shown.top.price)}</span>
                    )}
                  </div>
                </div>

                {/* Bottom */}
                <div className='outfit-item-with-image'>
                  <img 
                    src={shown.bottom.image} 
                    alt="Bottom" 
                    className='outfit-product-image' 
                  />
                  <div className='outfit-item-details'>
                    <span className='outfit-label'>Bottom</span>
                    <span className='outfit-value'>
                      {shown.bottom.name}
                    </span>
                    {!isGenerating && (
                      <span className='outfit-price'>{formatPrice(shown.bottom.price)}</span>
                    )}
                  </div>
                </div>

                {/* Accessory */}
                <div className='outfit-item-with-image'>
                  <img 
                    src={shown.accessory.image} 
                    alt="Accessory" 
                    className='outfit-product-image' 
                  />
                  <div className='outfit-item-details'>
                    <span className='outfit-label'>Accessory</span>
                    <span className='outfit-value'>
                      {shown.accessory.name}
                    </span>
                    {!isGenerating && (
                      <span className='outfit-price'>{formatPrice(shown.accessory.price)}</span>
                    )}
                  </div>
                </div>

                {!isGenerating && (
                  <>
                    <div className='outfit-total'>
                      <span>Total:</span>
                      <span>{formatPrice(shown.total)}</span>
                    </div>
                    <button className='shop-outfit-btn' onClick={() => setShowFit(true)}>
                      View Fit Details
                    </button>
                    <button className='shop-outfit-btn' onClick={handleShopOutfit}>Shop This Outfit</button>
                  </>
                )}
              </div>
            ) : (
              <div className='outfit-placeholder'>
                <div className='placeholder-icon'>✨</div>
                <p>Ready to get styled?</p>
                <p className='placeholder-sub'>Set your budget and choose a style on the left, then click "Generate Outfit" to see your personalized look.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* POP-UP: Fit Check */}
      {showFit && outfit && lastInputs && (
        <OutfitFitModal
          outfit={outfit}
          inputs={lastInputs}
          onClose={() => setShowFit(false)}
          onRegenerate={() => {
            setShowFit(false)
            handleGenerateOutfit()
          }}
        />
      )}
    </div>
  )
}

export default PickProd