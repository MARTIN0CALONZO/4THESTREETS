import { useState } from 'react'

import martinvid from './assets/martin.mp4'
import rhayvid from './assets/rhayzzie.mp4'
import edrianvid from './assets/edrian.mp4'
import rodnervid from './assets/rodner.mp4'
import gadvid from './assets/gad.mp4'
import jcvid from './assets/jc.mp4'


function Thedevs() {
  const [selectedDev, setSelectedDev] = useState(null)

  const devs = [
    { id: 1, name: "Calonzo, Martin S.", role: "Back-End Developer", year: "2006", style: "minimalist", video: martinvid },
    { id: 2, name: "Dela Cruz, Rhayzzie Juslene G.", role: "Front-End Developer", year: "2006", style: "minimalist", video: rhayvid },
    { id: 3, name: "Francia, Gad Daniel Kellyn C.", role: "Front-End Developer", year: "2006", style: "minimalist", video: gadvid },
    { id: 4, name: "Halili, Edrian Sedrik E.", role: "Back-End Developer", year: "2006", style: "minimalist", video: edrianvid },
    { id: 5, name: "Perez, Jan Christian C.", role: "Front-End Developer", year: "2006", style: "minimalist", video: jcvid },
    { id: 6, name: "Santos, Rodner L.", role: "Back-End Developer", year: "2006", style: "minimalist", video: rodnervid },
  ]

  useState(() => {
    setSelectedDev(devs[0])
  }, [])

  return (
    <div className="dev-video-page">
      {/* Video Container */}
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
        
        {/* Developer Info*/}
        {selectedDev && (
          <div className="dev-overlay-content">
            <div className="dev-desc">
              <h1 className="dev-name">{selectedDev.name}</h1>
              <h2 className="dev-role">{selectedDev.role}</h2>
              <div className="dev-tags">
                <span className="dev-tag"> {selectedDev.year}</span>
                <span className="dev-tag"> {selectedDev.style}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Developer Buttons*/}
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
  )
}

export default Thedevs