import { useState } from 'react'
import { HelpModal } from './HelpModal'
import facebook from './assets/facebook.png'
import instagram from './assets/instagram.png'
import tiktok from './assets/tiktok.png'
import x from './assets/x.png'

const HELP_LINKS = [
  { id: 'faq', label: 'FAQ' },
  { id: 'returns', label: 'Return' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'terms', label: 'Terms and Condition' },
]

function Footer() {
  const [helpTopic, setHelpTopic] = useState(null)

  return (
    <>
      <footer>
        <div>
          <h2>ABOUT US</h2>
          <p>We're a streetwear e-commerce brand from Bulacan State University – Hagonoy Campus, created for anyone who loves street style. We bring together affordable pieces and diverse looks, making it easier to find styles that match your vibe without breaking the bank.</p>
        </div>

        <div>
          <h2>VISION</h2>
          <p>To be a go-to destination for streetwear lovers, offering affordable and diverse styles that inspire people to express their individuality and make street style their own.</p>
        </div>

        <div id="footcont">
          <div className="ConHelp">
            <h2>CONTACT US</h2>
            <p>EMAIL: forthestreetss1business@gmail.com</p>
            <p>NUMBER: 09268569873</p>
            <p>Barangay Iba and Carillo, Hagonoy, Bulacan</p>
            <p>7:00AM - 7:00PM MON TO SAT</p>
          </div>

          <div className="ConHelp">
            <h2>HELP</h2>
            {HELP_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                className="footer-help-link"
                onClick={() => setHelpTopic(link.id)}
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>

        <div id="botcontact">
          <p id='copyright'>© 2026 All rights reserved.</p>
          <a href="https://www.facebook.com/people/4TheStreet/61595994033204/">
          <img src={facebook} className="footerlogo" alt="Facebook" />
          </a>
        <a href="https://www.instagram.com/4thestreet_2026/">
          <img src={instagram} className="footerlogo" alt="Instagram" />
        </a>
        <a href="https://www.tiktok.com/@4thestreet_2026">
          <img src={tiktok} className="footerlogo" alt="TikTok" />
        </a>
        <a href="https://x.com/4TheStreet_2026">
          <img src={x} className="footerlogo" alt="X" />
        </a>
        </div>
      </footer>

      {helpTopic && (
        <HelpModal topic={helpTopic} onClose={() => setHelpTopic(null)} />
      )}
    </>
  )
}

export default Footer