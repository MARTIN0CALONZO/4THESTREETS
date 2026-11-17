import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import './index.css'

/* ---------- Content ng bawat topic ---------- */
const TOPICS = {
  faq: {
    title: 'Frequently Asked Questions',
    sections: [
      {
        heading: 'How do I place an order?',
        body: 'Browse our products, choose your size and quantity, then click "Add to Cart" or "Checkout". Log in to your account, select or add a delivery address, apply a coupon if you have one, then choose your payment method and click Order.',
      },
      {
        heading: 'How do I track my order?',
        body: 'Log in and go to your Profile → Orders. You can see the live status of each order (Pending, Paid, Shipped, Delivered). Once shipped, the tracking number is also sent to your email.',
      },
      {
        heading: 'Can I cancel an order?',
        body: 'You can cancel an order while it is still Pending or Paid. Once the order has been shipped, cancellation is no longer possible — you may file a return instead.',
      },
      {
        heading: 'How do I use a coupon?',
        body: 'Enter the coupon code at checkout and press Apply. The discount is computed against the item subtotal (shipping excluded) and reflected immediately in your Order Summary.',
      },
    ],
  },
  returns: {
    title: 'Returns & Exchanges',
    sections: [
      {
        heading: 'Return Window',
        body: 'You may request a return or exchange within 30 days from the date of delivery. Items must be unworn, unwashed, and still have the original tags attached.',
      },
      {
        heading: 'How to start a return',
        body: '1. Message us via Customer Service (chat button at the bottom-right).\n2. Provide your Order Number and a photo of the item.\n3. We will send a prepaid return label if the request is approved.\n4. Pack the item securely and drop it off at the courier.',
      },
      {
        heading: 'Refund Processing',
        body: 'Once we receive and inspect the return, refunds are processed within 5–7 business days back to your original payment method (GCash, Maya, or PayPal).',
      },
      {
        heading: 'Non-returnable items',
        body: 'Accessories (caps, bags, socks) and any items marked final sale cannot be returned or exchanged for hygiene reasons.',
      },
    ],
  },
  shipping: {
    title: 'Shipping & Delivery',
    sections: [
      {
        heading: 'Delivery Time',
        body: 'Metro Manila: 2–3 business days.\nProvincial: 3–5 business days.\nRemote areas (island provinces): 5–7 business days.',
      },
      {
        heading: 'Shipping Fee',
        body: 'Orders below PHP 2,000: flat PHP 150 nationwide.\nOrders PHP 2,000 and above: FREE shipping.',
      },
      {
        heading: 'Courier Partners',
        body: 'We ship through J&T Express, LBC, and Flash Courier depending on your location. The courier is assigned automatically at the time of shipment.',
      },
      {
        heading: 'Tracking',
        body: 'A tracking number is emailed to you once the order is handed to the courier. You can also see it in Profile → Orders → View Details.',
      },
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    sections: [
      {
        heading: '1. Acceptance of Terms',
        body: 'By accessing and using 4THESTREETS, you agree to be bound by these Terms & Conditions. If you do not agree, please discontinue use of the site.',
      },
      {
        heading: '2. Accounts',
        body: 'You are responsible for keeping your login credentials confidential. Notify us immediately if you suspect unauthorized access to your account.',
      },
      {
        heading: '3. Pricing & Availability',
        body: 'All prices are in Philippine Peso (PHP) and are inclusive of applicable taxes. We reserve the right to change prices and to limit quantities at any time without prior notice.',
      },
      {
        heading: '4. Orders & Payment',
        body: 'All orders are subject to confirmation. Payment is processed through PayMongo (GCash, Maya, PayPal). An order is only considered confirmed once payment is verified.',
      },
      {
        heading: '5. Intellectual Property',
        body: 'All content on this site — logos, product photos, and text — is the property of 4THESTREETS and may not be reproduced without written permission.',
      },
      {
        heading: '6. Limitation of Liability',
        body: '4THESTREETS is not liable for indirect or consequential damages arising from the use of our products or website. Our maximum liability is limited to the amount you paid for the specific order.',
      },
    ],
  },
}

/* ---------- Modal component ---------- */
export function HelpModal({ topic, onClose }) {
  const data = TOPICS[topic]

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  if (!data) return null

  return createPortal(
    <div
      className="help-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
      >
        <div className="help-header">
          <h3 id="help-modal-title">{data.title}</h3>
          <button
            type="button"
            className="help-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="help-body">
          {data.sections.map((s, i) => (
            <section key={i} className="help-section">
              <h4>{s.heading}</h4>
              {s.body.split('\n').map((line, j) => (
                <p key={j}>{line}</p>
              ))}
            </section>
          ))}
        </div>

        <div className="help-actions">
          <button type="button" className="help-btn primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}