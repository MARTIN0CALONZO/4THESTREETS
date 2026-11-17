import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// Same order as the tabs in the admin Orders page
const STATUSES = [
  { key: 'pending', label: 'PENDING', color: [245, 178, 62] },
  { key: 'paid', label: 'PAID', color: [215, 130, 199] },
  { key: 'shipped', label: 'SHIPPED', color: [109, 143, 232] },
  { key: 'delivered', label: 'DELIVERED', color: [167, 240, 0] },
  { key: 'cancelled', label: 'CANCELLED', color: [255, 107, 107] },
]

const GREEN = [167, 240, 0]
const BLACK = [10, 10, 10]
const DARK = [33, 33, 33]
const GRAY = [110, 116, 120]
const LIGHT = [245, 246, 247]

const TZ = 'Asia/Manila'

// jsPDF's built-in fonts can't draw the peso sign, so we use "PHP"
const money = (n) =>
  `PHP ${Number(n || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

// Newer browsers put a narrow no-break space before "pm"; the PDF font can't draw it
const dateText = (iso) =>
  new Date(iso)
    .toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: TZ,
    })
    .replace(/[\u202f\u00a0]/g, ' ')

const customerName = (o) =>
  o.user?.fullName || o.shipping?.name || o.user?.username || 'Unknown'

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '-')

const unitsOf = (o) => (o.items || []).reduce((n, i) => n + (i.qty || 0), 0)

export function exportOrdersPdf(orders = []) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40
  const now = new Date()

  // ---------- Header band ----------
  doc.setFillColor(...BLACK)
  doc.rect(0, 0, W, 90, 'F')
  doc.setFillColor(...GREEN)
  doc.rect(0, 90, W, 4, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(255, 255, 255)
  doc.text('4THESTREETS', M, 50)

  doc.setFontSize(11)
  doc.setTextColor(...GREEN)
  doc.text('ORDERS REPORT', M, 70)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(200, 200, 200)
  doc.text(
    now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ }),
    W - M, 50, { align: 'right' }
  )
  doc.text(
    now
      .toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
      .replace(/[\u202f\u00a0]/g, ' '),
    W - M, 66, { align: 'right' }
  )

  // ---------- Summary cards (cancelled orders are not sales) ----------
  const sales = orders.filter((o) => o.status !== 'cancelled')
  const revenue = sales.reduce((n, o) => n + (o.total || 0), 0)
  const cancelled = orders.length - sales.length
  const avg = sales.length ? revenue / sales.length : 0

  const cards = [
    ['TOTAL ORDERS', String(orders.length)],
    ['SALES (NO CANCELLED)', money(revenue)],
    ['AVG. ORDER VALUE', money(avg)],
    ['CANCELLED', String(cancelled)],
  ]
  const gap = 10
  const cardW = (W - M * 2 - gap * 3) / 4
  const cardY = 114

  cards.forEach(([label, value], i) => {
    const x = M + i * (cardW + gap)
    doc.setFillColor(...LIGHT)
    doc.roundedRect(x, cardY, cardW, 54, 6, 6, 'F')
    doc.setFillColor(...GREEN)
    doc.rect(x, cardY + 10, 3, 34, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    doc.text(label, x + 12, cardY + 22)

    doc.setFontSize(i === 1 || i === 2 ? 11 : 15)
    doc.setTextColor(...BLACK)
    doc.text(value, x + 12, cardY + 42)
  })

  let y = cardY + 54 + 30

  // ---------- One section per status, newest order first ----------
  STATUSES.forEach(({ key, label, color }) => {
    const items = orders
      .filter((o) => o.status === key)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    // start a new page if the heading + a few rows won't fit
    if (y > H - 150) {
      doc.addPage()
      y = M
    }

    const total = items.reduce((n, o) => n + (o.total || 0), 0)

    // Section heading bar
    doc.setFillColor(...BLACK)
    doc.rect(M, y, W - M * 2, 26, 'F')
    doc.setFillColor(...color)
    doc.rect(M, y, 5, 26, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(255, 255, 255)
    doc.text(label, M + 16, y + 17)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...color)
    doc.text(
      `${items.length} order${items.length === 1 ? '' : 's'}  |  ${money(total)}` +
        (key === 'cancelled' ? '  (not counted as sales)' : ''),
      W - M - 10, y + 17, { align: 'right' }
    )

    y += 26

    if (items.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...GRAY)
      doc.text('No orders with this status.', M + 8, y + 22)
      y += 46
      return
    }

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: M, bottom: 50 },
      theme: 'plain',
      head: [['Order ID', 'Date', 'Customer', 'Items', 'Payment', 'Total']],
      body: items.map((o) => [
        `#${o.orderNumber}`,
        dateText(o.createdAt),
        customerName(o),
        String(unitsOf(o)),
        cap(o.paymentMethod),
        money(o.total),
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        textColor: DARK,
        cellPadding: { top: 6, bottom: 6, left: 6, right: 6 },
        lineColor: [225, 228, 230],
        lineWidth: { bottom: 0.5 },
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [236, 238, 240],
        textColor: BLACK,
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [250, 251, 251] },
      columnStyles: {
        0: { cellWidth: 74, fontStyle: 'bold' },
        1: { cellWidth: 100 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 36, halign: 'center' },
        4: { cellWidth: 56 },
        5: { cellWidth: 80, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        // line the numeric headers up with their columns
        if (data.section === 'head') {
          if (data.column.index === 3) data.cell.styles.halign = 'center'
          if (data.column.index === 5) data.cell.styles.halign = 'right'
        }
      },
    })

    y = doc.lastAutoTable.finalY + 28
  })

  // ---------- Footer on every page ----------
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(220, 222, 224)
    doc.setLineWidth(0.5)
    doc.line(M, H - 34, W - M, H - 34)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('4THESTREETS  |  Orders Report', M, H - 20)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 20, { align: 'right' })
    if (i === pages) {
      doc.text('Newest orders first within each status', W / 2, H - 20, { align: 'center' })
    }
  }

  doc.save(`4thestreets-orders-${now.toISOString().slice(0, 10)}.pdf`)
}