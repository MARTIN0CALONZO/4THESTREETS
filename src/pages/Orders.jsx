import { useState, useEffect, useMemo } from "react";
import Modal from "../components/Modal";
import { api } from "../api";
import { exportOrdersPdf } from "../utils/exportOrdersPdf";

// database status -> label shown in the admin
const STATUS = {
  pending: "Pending",
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled"
};
const STATUS_KEYS = Object.keys(STATUS);
const TABS = ["all", ...STATUS_KEYS];

const SORTS = [
  "Default",
  "Price: Low to High",
  "Price: High to Low",
  "Date: Newest",
  "Date: Oldest"
];

const money = (n) =>
  "PHP " +
  Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

const customerName = (o) =>
  o.user?.fullName || o.shipping?.name || o.user?.username || "Unknown";

const paymentLabel = (m) => (m ? m.charAt(0).toUpperCase() + m.slice(1) : "—");

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [tab, setTab] = useState("all");
  const [sortBy, setSortBy] = useState("Default");
  const [openDropdown, setOpenDropdown] = useState(null);
  const [preview, setPreview] = useState(null); // order shown in the popup
  const [updatingId, setUpdatingId] = useState(null);

  // ---------- load from database ----------
  useEffect(() => {
    api("/orders")
      .then(({ orders }) => setOrders(orders))
      .catch((err) => setPageError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // close the dropdowns when clicking anywhere else
  useEffect(() => {
    if (!openDropdown) return;
    const close = () => setOpenDropdown(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openDropdown]);

  const counts = useMemo(() => {
    const c = { all: orders.length };
    STATUS_KEYS.forEach((s) => (c[s] = orders.filter((o) => o.status === s).length));
    return c;
  }, [orders]);

  const visibleOrders = useMemo(() => {
    const list = tab === "all" ? [...orders] : orders.filter((o) => o.status === tab);

    if (sortBy === "Price: Low to High") list.sort((a, b) => a.total - b.total);
    if (sortBy === "Price: High to Low") list.sort((a, b) => b.total - a.total);
    if (sortBy === "Date: Newest")
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sortBy === "Date: Oldest")
      list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    return list;
  }, [orders, tab, sortBy]);

  // ---------- change status ----------
  const changeStatus = async (order, status) => {
    setOpenDropdown(null);
    if (status === order.status) return;

    if (
      status === "cancelled" &&
      !window.confirm(
        `Cancel order #${order.orderNumber}? The items will be put back in stock.`
      )
    )
      return;

    setUpdatingId(order._id);
    setPageError("");
    try {
      const { order: updated } = await api(`/orders/${order._id}/status`, {
        method: "PATCH",
        body: { status }
      });
      setOrders((list) => list.map((o) => (o._id === updated._id ? updated : o)));
      setPreview((p) => (p && p._id === updated._id ? updated : p));
    } catch (err) {
      setPageError(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const stop = (e) => e.stopPropagation(); // keeps a dropdown open while clicking its button

  const handleExportPdf = () => {
    try {
      exportOrdersPdf(orders); // always the full list, not just the selected tab
    } catch (err) {
      setPageError(`Could not create the PDF: ${err.message}`);
    }
  };

  return (
    <div className="page">
      <div className="order-tabs panel">
        {TABS.map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t === "all" ? "All orders" : STATUS[t]} ({counts[t]})
          </button>
        ))}
      </div>

      <section className="panel order-panel">
        <div className="page-heading">
          <h2>ORDERS</h2>
          <div className="heading-actions">
            <button
              type="button"
              className="export-button"
              onClick={handleExportPdf}
              disabled={loading || orders.length === 0}
            >
              <i className="fas fa-file-pdf"></i> Export PDF
            </button>
          </div>
        </div>

        {pageError && <p className="form-error">{pageError}</p>}

        <div className="order-head orders-grid">
          <span>Order ID</span>
          <span>Customer</span>
          <span>Total</span>
          <span>Date</span>
          <span>Status</span>

          <div className="sort-wrapper" onClick={stop}>
            <button
              className="sort-button"
              onClick={() => setOpenDropdown(openDropdown === "sort" ? null : "sort")}
            >
              <i className="far fa-caret-square-down"></i>
              Sort
            </button>

            {openDropdown === "sort" && (
              <div className="order-dropdown sort-dropdown">
                {SORTS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSortBy(s);
                      setOpenDropdown(null);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading && <div className="no-orders">Loading orders...</div>}

        {visibleOrders.map((o) => (
          <div className="order-row orders-grid" key={o._id}>
            <strong>#{o.orderNumber}</strong>

            <span className="order-customer">{customerName(o)}</span>

            <span>{money(o.total)}</span>

            <span>{formatDate(o.createdAt)}</span>

            <div className="status-wrapper" onClick={stop}>
              <button
                className={`status-button status-${o.status}`}
                disabled={updatingId === o._id}
                onClick={() =>
                  setOpenDropdown(
                    openDropdown === `status-${o._id}` ? null : `status-${o._id}`
                  )
                }
              >
                <i className="far fa-caret-square-down"></i>
                {updatingId === o._id ? "Saving..." : STATUS[o.status] || o.status}
              </button>

              {openDropdown === `status-${o._id}` && (
                <div className="order-dropdown status-dropdown">
                  {STATUS_KEYS.map((s) => (
                    <button key={s} onClick={() => changeStatus(o, s)}>
                      {STATUS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button className="preview-button" onClick={() => setPreview(o)}>
              <i className="far fa-eye"></i> Preview
            </button>
          </div>
        ))}

        {!loading && visibleOrders.length === 0 && !pageError && (
          <div className="no-orders">No orders found.</div>
        )}
      </section>

      {preview && (
        <Modal onClose={() => setPreview(null)}>
          <div className="modal-header">
            <h2>ORDER #{preview.orderNumber}</h2>
            <button onClick={() => setPreview(null)}>×</button>
          </div>

          <div className="order-preview">
            <div className="preview-top">
              <span className={`status-pill status-${preview.status}`}>
                {STATUS[preview.status] || preview.status}
              </span>
              <span className="preview-date">{formatDateTime(preview.createdAt)}</span>
            </div>

            <div className="preview-section">
              <h3>Customer</h3>
              <div className="preview-grid">
                <div>
                  <label>Name</label>
                  <span>{customerName(preview)}</span>
                </div>
                <div>
                  <label>Email</label>
                  <span>{preview.user?.email || "—"}</span>
                </div>
                <div>
                  <label>Contact</label>
                  <span>{preview.shipping?.contact || preview.user?.phone || "—"}</span>
                </div>
                <div>
                  <label>Payment</label>
                  <span>{paymentLabel(preview.paymentMethod)}</span>
                </div>
              </div>
            </div>

            <div className="preview-section">
              <h3>Ship to</h3>
              <p className="preview-address">
                <b>{preview.shipping?.name}</b>
                <br />
                {preview.shipping?.address}
              </p>
            </div>

            <div className="preview-section">
              <h3>Items ({preview.items.reduce((n, i) => n + i.qty, 0)})</h3>
              <div className="preview-items">
                {preview.items.map((i, idx) => (
                  <div className="preview-item" key={idx}>
                    {i.image ? (
                      <img src={i.image} alt={i.name} />
                    ) : (
                      <div className="preview-noimg">T</div>
                    )}
                    <div className="preview-item-info">
                      <strong>{i.name}</strong>
                      <span>
                        {[i.size && `Size: ${i.size}`, i.color && `Color: ${i.color}`]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                      <span>
                        {money(i.price)} × {i.qty}
                      </span>
                    </div>
                    <b>{money(i.price * i.qty)}</b>
                  </div>
                ))}
              </div>
            </div>

            <div className="preview-totals">
              <div>
                <span>Subtotal</span>
                <span>{money(preview.subtotal)}</span>
              </div>
              <div>
                <span>Shipping</span>
                <span>{money(preview.shippingFee)}</span>
              </div>
              {preview.discount > 0 && (
                <div>
                  <span>Discount{preview.coupon ? ` (${preview.coupon})` : ""}</span>
                  <span>-{money(preview.discount)}</span>
                </div>
              )}
              <div className="preview-total">
                <span>Total</span>
                <span>{money(preview.total)}</span>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}