import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const CATEGORIES = [
  { key: 'tops', label: 'TOPS' },
  { key: 'bottoms', label: 'BOTTOMS' },
  { key: 'accessories', label: 'ACCESSORIES' },
]

const GREEN = [167, 240, 0]
const BLACK = [10, 10, 10]
const DARK = [33, 33, 33]
const GRAY = [110, 116, 120]
const LIGHT = [245, 246, 247]
const RED = [200, 40, 40]

const LOW_STOCK = 5

// jsPDF's built-in fonts can't draw the peso sign, so we use "PHP"
const money = (n) =>
  `PHP ${Number(n || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—')

// "S: 5, M: 3" when the product has per-size stock, else the plain size list
const sizeText = (p) => {
  if (Array.isArray(p.sizeStock) && p.sizeStock.length) {
    return p.sizeStock.map((s) => `${s.size}: ${s.stock ?? 0}`).join(', ')
  }
  return Array.isArray(p.sizes) && p.sizes.length ? p.sizes.join(', ') : '—'
}

export function exportInventoryPdf(products = []) {
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
  doc.text('INVENTORY REPORT', M, 70)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(200, 200, 200)
  doc.text(
    now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }),
    W - M, 50, { align: 'right' }
  )
  doc.text(
    now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
    W - M, 66, { align: 'right' }
  )

  // ---------- Summary cards ----------
  const totalUnits = products.reduce((s, p) => s + (p.stock || 0), 0)
  const totalValue = products.reduce((s, p) => s + (p.stock || 0) * (p.price || 0), 0)
  const lowCount = products.filter((p) => (p.stock || 0) <= LOW_STOCK).length

  const cards = [
    ['TOTAL PRODUCTS', String(products.length)],
    ['TOTAL UNITS', totalUnits.toLocaleString('en-PH')],
    ['LOW / OUT OF STOCK', String(lowCount)],
    ['STOCK VALUE', money(totalValue)],
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

    doc.setFontSize(i === 3 ? 11 : 15)
    doc.setTextColor(...BLACK)
    doc.text(value, x + 12, cardY + 42)
  })

  let y = cardY + 54 + 30

  // ---------- One section per category ----------
  CATEGORIES.forEach(({ key, label }) => {
    const items = products
      .filter((p) => p.category === key)
      .sort(
        (a, b) =>
          (a.subcategory || '').localeCompare(b.subcategory || '') ||
          (a.name || '').localeCompare(b.name || '')
      )

    // start a new page if the heading + a few rows won't fit
    if (y > H - 150) {
      doc.addPage()
      y = M
    }

    const units = items.reduce((s, p) => s + (p.stock || 0), 0)
    const value = items.reduce((s, p) => s + (p.stock || 0) * (p.price || 0), 0)

    // Section heading bar
    doc.setFillColor(...BLACK)
    doc.rect(M, y, W - M * 2, 26, 'F')
    doc.setFillColor(...GREEN)
    doc.rect(M, y, 5, 26, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(255, 255, 255)
    doc.text(label, M + 16, y + 17)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...GREEN)
    doc.text(
      `${items.length} item${items.length === 1 ? '' : 's'}  |  ${units} units  |  ${money(value)}`,
      W - M - 10, y + 17, { align: 'right' }
    )

    y += 26

    if (items.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...GRAY)
      doc.text('No products in this category.', M + 8, y + 22)
      y += 46
      return
    }

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: M, bottom: 50 },
      theme: 'plain',
      head: [['Code', 'Product', 'Type', 'Color', 'Sizes (stock)', 'Total', 'Price', 'Stock Value']],
      body: items.map((p) => [
        p.code || '—',
        p.name || '—',
        cap(p.subcategory),
        cap(p.color),
        sizeText(p),
        p.stock > 0 ? String(p.stock) : 'Out',
        money(p.price),
        money((p.stock || 0) * (p.price || 0)),
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
        0: { cellWidth: 58, fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 56 },
        3: { cellWidth: 48 },
        4: { cellWidth: 90 },
        5: { cellWidth: 36, halign: 'center' },
        6: { cellWidth: 62, halign: 'right' },
        7: { cellWidth: 72, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        // right-align the numeric headers too
        if (data.section === 'head') {
          if (data.column.index === 5) data.cell.styles.halign = 'center'
          if (data.column.index >= 6) data.cell.styles.halign = 'right'
        }
        // flag low / out of stock
        if (data.section === 'body' && data.column.index === 5) {
          const stock = items[data.row.index].stock || 0
          if (stock <= LOW_STOCK) {
            data.cell.styles.textColor = RED
            data.cell.styles.fontStyle = 'bold'
          }
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
    doc.text('4THESTREETS  |  Inventory Report', M, H - 20)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 20, { align: 'right' })
    if (i === pages) {
      doc.text(`Low stock = ${LOW_STOCK} units or fewer`, W / 2, H - 20, { align: 'center' })
    }
  }

  doc.save(`4thestreets-inventory-${now.toISOString().slice(0, 10)}.pdf`)
}