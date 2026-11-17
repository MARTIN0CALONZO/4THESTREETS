import { useState, useEffect, useMemo } from "react";
import Modal from "../components/Modal";
import { api } from "../api";

const RATINGS = [5, 4, 3, 2, 1];

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [open, setOpen] = useState(false);
  const [editingReview, setEditingReview] = useState(null);
  const [form, setForm] = useState({ rating: 5, comment: "", reply: "", isHidden: false });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { reviews } = await api("/admin/reviews");
      setReviews(reviews);
    } catch (err) {
      setPageError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visibleReviews = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (ratingFilter !== "all" && String(r.rating) !== String(ratingFilter)) return false;
      if (statusFilter === "hidden" && !r.isHidden) return false;
      if (statusFilter === "visible" && r.isHidden) return false;
      if (!q) return true;
      
      const customerName = (r.user?.fullName || r.user?.username || "").toLowerCase();
      const productName = (r.product?.name || "").toLowerCase();
      const comment = (r.comment || "").toLowerCase();
      
      return customerName.includes(q) || productName.includes(q) || comment.includes(q);
    });
  }, [reviews, search, ratingFilter, statusFilter]);

  const openEdit = (review) => {
    setEditingReview(review);
    setForm({
      rating: review.rating || 5,
      comment: review.comment || "",
      reply: review.reply || "",
      isHidden: !!review.isHidden,
    });
    setOpen(true);
  };

  const closeEdit = () => {
    setOpen(false);
    setEditingReview(null);
  };

  const toggleHide = async (review) => {
    try {
      const { review: updated } = await api(`/admin/reviews/${review._id}`, {
        method: "PUT",
        body: { ...review, isHidden: !review.isHidden }
      });
      setReviews((list) => list.map((r) => (r._id === updated._id ? updated : r)));
    } catch (err) {
      setPageError(err.message);
    }
  };

  const handleDelete = async (review) => {
    if (!window.confirm("Delete this review? This action cannot be undone.")) return;
    try {
      await api(`/admin/reviews/${review._id}`, { method: "DELETE" });
      setReviews((list) => list.filter((r) => r._id !== review._id));
    } catch (err) {
      setPageError(err.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { review: updated } = await api(`/admin/reviews/${editingReview._id}`, {
        method: "PUT",
        body: form
      });
      setReviews((list) => list.map((r) => (r._id === updated._id ? updated : r)));
      closeEdit();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <section className="panel table-panel">
        <div className="page-heading">
          <h2>MANAGE REVIEWS</h2>
        </div>

        {pageError && <p className="form-error">{pageError}</p>}

        <div className="inventory-toolbar">
          <div className="inventory-search">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Search by customer, product, or comment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)}>
            <option value="all">All Ratings</option>
            {RATINGS.map((r) => (
              <option key={r} value={r}>{r} Stars</option>
            ))}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </select>

          {(search.trim() || ratingFilter !== "all" || statusFilter !== "all") && (
            <button type="button" className="clear-filters" onClick={() => {
              setSearch("");
              setRatingFilter("all");
              setStatusFilter("all");
            }}>
              Clear
            </button>
          )}
        </div>

        {loading && <p className="muted-text">Loading reviews...</p>}
        {!loading && reviews.length === 0 && <p className="muted-text">No reviews yet.</p>}

        {visibleReviews.length > 0 && (
          <div className="coupon-table">
            <div className="table-head coupon-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr 3fr 1.5fr" }}>
              <span>Product</span>
              <span>Customer</span>
              <span>Rating</span>
              <span>Review & Reply</span>
              <span>Actions</span>
            </div>

            {visibleReviews.map((r) => (
              <div className="table-row coupon-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr 3fr 1.5fr" }} key={r._id}>
                <div className="coupon-code-cell">
                  <strong className="coupon-code">{r.product?.name || "Unknown Product"}</strong>
                </div>

                <span>{r.user?.fullName || r.user?.username || "Guest"}</span>

                <span style={{ color: "#f5b23e" }}>
                  {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                </span>

                <div className="coupon-stack">
                  <span style={{ fontStyle: r.isHidden ? "italic" : "normal", color: r.isHidden ? "#999" : "inherit" }}>
                    "{r.comment}"
                  </span>
                  {r.reply && <small style={{ color: "#a7f000", marginTop: "4px" }}>↳ Admin: {r.reply}</small>}
                </div>

                <div className="customer-actions">
                  <button type="button" className="block-button" onClick={() => openEdit(r)}>
                    <i className="fas fa-edit"></i> Edit
                  </button>
                  <button 
                    type="button" 
                    className={`block-button ${r.isHidden ? "is-blocked" : ""}`} 
                    onClick={() => toggleHide(r)}
                  >
                    <i className={r.isHidden ? "fas fa-eye" : "fas fa-eye-slash"}></i>
                    {r.isHidden ? "Unhide" : "Hide"}
                  </button>
                  <button type="button" className="block-button coupon-delete" onClick={() => handleDelete(r)}>
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {open && editingReview && (
        <Modal onClose={closeEdit}>
          <div className="modal-header">
            <h2>EDIT REVIEW</h2>
            <button onClick={closeEdit}>×</button>
          </div>

          <form onSubmit={handleSave} className="product-form">
            <label>
              Customer Comment
              <textarea
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                rows={3}
                required
              />
            </label>

            <label>
              Admin Reply (Public)
              <textarea
                value={form.reply}
                onChange={(e) => setForm({ ...form, reply: e.target.value })}
                placeholder="Write a response to the customer..."
                rows={3}
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
              <input 
                type="checkbox" 
                checked={form.isHidden} 
                onChange={(e) => setForm({ ...form, isHidden: e.target.checked })}
                style={{ width: "auto", margin: 0 }}
              />
              Hide this review from the public store
            </label>

            <div className="modal-actions" style={{ marginTop: "20px" }}>
              <button type="button" className="cancel-btn" onClick={closeEdit}>Cancel</button>
              <button type="submit" className="return-btn" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}