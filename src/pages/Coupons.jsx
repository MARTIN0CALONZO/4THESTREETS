import { useState, useEffect, useMemo } from "react";
import Modal from "../components/Modal";
import { api } from "../api";


const STATUS_LABEL = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  "used-up": "Used up",
  blocked: "Blocked"
};
const FILTERS = ["all", ...Object.keys(STATUS_LABEL)];

const money = (n) =>
  "PHP " +
  Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const formatDT = (iso) =>
  new Date(iso)
    .toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Manila"
    })
    .replace(/[\u202f\u00a0]/g, " ");

// ISO date -> value for <input type="datetime-local">
const toInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
};

// datetime-local value -> ISO (or null when empty)
const toIso = (v) => (v ? new Date(v).toISOString() : null);

const emptyForm = () => ({
  code: "",
  description: "",
  discountType: "percent",
  discountValue: "",
  minSubtotal: "",
  maxDiscount: "",
  startsAt: toInput(new Date().toISOString()),
  expiresAt: "",
  usageLimit: "",
  perUserLimit: "1"
});

const randomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

const discountText = (c) =>
  c.discountType === "percent"
    ? `${c.discountValue}% off${c.maxDiscount > 0 ? ` (max ${money(c.maxDiscount)})` : ""}`
    : `${money(c.discountValue)} off`;

export default function Coupons() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = new coupon
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { coupons } = await api("/coupons");
      setCoupons(coupons);
      setPageError("");
    } catch (err) {
      setPageError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // statuses depend on the clock, so refresh once a minute
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  const counts = useMemo(() => {
    const c = { all: coupons.length };
    Object.keys(STATUS_LABEL).forEach(
      (s) => (c[s] = coupons.filter((x) => x.status === s).length)
    );
    return c;
  }, [coupons]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return coupons.filter(
      (c) =>
        (statusFilter === "all" || c.status === statusFilter) &&
        (!q ||
          c.code.toLowerCase().includes(q) ||
          (c.description || "").toLowerCase().includes(q))
    );
  }, [coupons, search, statusFilter]);

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError("");
    setOpen(true);
  };

  const openEdit = (c) => {
    setEditingId(c._id);
    setForm({
      code: c.code,
      description: c.description || "",
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      minSubtotal: c.minSubtotal ? String(c.minSubtotal) : "",
      maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "",
      startsAt: toInput(c.startsAt),
      expiresAt: toInput(c.expiresAt),
      usageLimit: c.usageLimit ? String(c.usageLimit) : "",
      perUserLimit: String(c.perUserLimit ?? 1)
    });
    setFormError("");
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setFormError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const value = Number(form.discountValue);
    if (!value || value <= 0) return setFormError("Enter a discount greater than 0.");
    if (form.discountType === "percent" && value > 100)
      return setFormError("A percent discount cannot be more than 100.");
    if (!form.startsAt) return setFormError("Pick a start date and time.");
    if (form.expiresAt && new Date(form.expiresAt) <= new Date(form.startsAt))
      return setFormError("Expiry must be after the start time.");

    const body = {
      description: form.description.trim(),
      discountType: form.discountType,
      discountValue: value,
      minSubtotal: Number(form.minSubtotal) || 0,
      maxDiscount: form.discountType === "percent" ? Number(form.maxDiscount) || 0 : 0,
      startsAt: toIso(form.startsAt),
      expiresAt: toIso(form.expiresAt),
      usageLimit: parseInt(form.usageLimit, 10) || 0,
      perUserLimit: parseInt(form.perUserLimit, 10) || 0
    };
    if (!editingId) body.code = form.code.trim().toUpperCase();

    setSaving(true);
    try {
      if (editingId) await api(`/coupons/${editingId}`, { method: "PUT", body });
      else await api("/coupons", { method: "POST", body });
      await load();
      closeModal();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleBlock = async (c) => {
    const blocking = !c.blocked;
    const ok = window.confirm(
      blocking
        ? `Block ${c.code}? Customers will not be able to use it.`
        : `Unblock ${c.code}? Customers will be able to use it again.`
    );
    if (!ok) return;
    try {
      const { coupon } = await api(`/coupons/${c._id}/block`, {
        method: "PATCH",
        body: { blocked: blocking }
      });
      setCoupons((list) => list.map((x) => (x._id === coupon._id ? coupon : x)));
    } catch (err) {
      setPageError(err.message);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete coupon "${c.code}"? This cannot be undone.`)) return;
    try {
      await api(`/coupons/${c._id}`, { method: "DELETE" });
      setCoupons((list) => list.filter((x) => x._id !== c._id));
    } catch (err) {
      setPageError(err.message);
    }
  };

  return (
    <div className="page">
      <section className="panel table-panel">
        <div className="page-heading">
          <h2>COUPONS</h2>
          <div className="heading-actions">
            <button className="plus-button" onClick={openAdd} title="New coupon">
              ＋
            </button>
          </div>
        </div>

        {pageError && <p className="form-error">{pageError}</p>}

        <div className="inventory-toolbar">
          <div className="inventory-search">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Search by code or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            {FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : STATUS_LABEL[s]} ({counts[s] ?? 0})
              </option>
            ))}
          </select>

          {(search.trim() || statusFilter !== "all") && (
            <button
              type="button"
              className="clear-filters"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
            >
              Clear
            </button>
          )}
        </div>

        {loading && <p className="muted-text">Loading coupons...</p>}
        {!loading && coupons.length === 0 && !pageError && (
          <p className="muted-text">No coupons yet. Press ＋ to create one.</p>
        )}
        {!loading && coupons.length > 0 && visible.length === 0 && (
          <p className="muted-text">No coupons match your search or filter.</p>
        )}

        {visible.length > 0 && (
          <div className="coupon-table">
            <div className="table-head coupon-grid">
              <span>Code</span>
              <span>Discount</span>
              <span>Time of use</span>
              <span>Used</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {visible.map((c) => (
              <div className="table-row coupon-grid" key={c._id}>
                <div className="coupon-code-cell">
                  <strong className="coupon-code">{c.code}</strong>
                  {c.description && <span className="coupon-desc">{c.description}</span>}
                </div>

                <div className="coupon-stack">
                  <span>{discountText(c)}</span>
                  {c.minSubtotal > 0 && <small>Min. spend {money(c.minSubtotal)}</small>}
                </div>

                <div className="coupon-stack">
                  <span>From {formatDT(c.startsAt)}</span>
                  <small>{c.expiresAt ? `Until ${formatDT(c.expiresAt)}` : "No expiry"}</small>
                </div>

                <div className="coupon-stack">
                  <span>
                    {c.usedCount} / {c.usageLimit > 0 ? c.usageLimit : "∞"}
                  </span>
                  <small>
                    {c.perUserLimit > 0 ? `${c.perUserLimit} per customer` : "Unlimited per customer"}
                  </small>
                </div>

                <span className={`coupon-pill ${c.status}`}>{STATUS_LABEL[c.status]}</span>

                <div className="customer-actions">
                  <button type="button" className="block-button" onClick={() => openEdit(c)}>
                    <i className="fas fa-edit"></i>
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    className={`block-button ${c.blocked ? "is-blocked" : ""}`}
                    onClick={() => toggleBlock(c)}
                  >
                    <i className={c.blocked ? "fas fa-unlock" : "fas fa-ban"}></i>
                    <span>{c.blocked ? "Unblock" : "Block"}</span>
                  </button>
                  <button
                    type="button"
                    className="block-button coupon-delete"
                    onClick={() => handleDelete(c)}
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {open && (
        <Modal onClose={closeModal}>
          <div className="modal-header">
            <h2>{editingId ? "EDIT COUPON" : "NEW COUPON"}</h2>
            <button onClick={closeModal}>×</button>
          </div>

          <form onSubmit={handleSubmit} className="product-form coupon-form">
            <label>
              Code
              <div className="file-row">
                <input
                  value={form.code}
                  onChange={(e) => setField("code", e.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                  maxLength={20}
                  disabled={!!editingId}
                  required
                />
                {!editingId && (
                  <button
                    type="button"
                    className="add-file"
                    onClick={() => setField("code", randomCode())}
                  >
                    Generate
                  </button>
                )}
              </div>
            </label>

            <label>
              Description
              <input
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Optional note for yourself"
                maxLength={120}
              />
            </label>

            <label>
              Discount type
              <select
                value={form.discountType}
                onChange={(e) => setField("discountType", e.target.value)}
              >
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed amount (PHP)</option>
              </select>
            </label>

            <label>
              {form.discountType === "percent" ? "Percent off" : "Amount off (PHP)"}
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={form.discountType === "percent" ? 100 : undefined}
                value={form.discountValue}
                onChange={(e) => setField("discountValue", e.target.value)}
                placeholder={form.discountType === "percent" ? "10" : "100"}
                required
              />
            </label>

            {form.discountType === "percent" && (
              <label>
                Max discount (PHP)
                <input
                  type="number"
                  min="0"
                  value={form.maxDiscount}
                  onChange={(e) => setField("maxDiscount", e.target.value)}
                  placeholder="Blank = no cap"
                />
              </label>
            )}

            <label>
              Min. spend (PHP)
              <input
                type="number"
                min="0"
                value={form.minSubtotal}
                onChange={(e) => setField("minSubtotal", e.target.value)}
                placeholder="Blank = no minimum"
              />
            </label>

            <label>
              Starts at
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setField("startsAt", e.target.value)}
                required
              />
            </label>

            <label>
              Expires at
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setField("expiresAt", e.target.value)}
              />
            </label>
            <p className="coupon-hint">Leave "Expires at" empty if the coupon never expires.</p>

            <label>
              Total uses
              <input
                type="number"
                min="0"
                value={form.usageLimit}
                onChange={(e) => setField("usageLimit", e.target.value)}
                placeholder="Blank = unlimited"
              />
            </label>

            <label>
              Uses per customer
              <input
                type="number"
                min="0"
                value={form.perUserLimit}
                onChange={(e) => setField("perUserLimit", e.target.value)}
                placeholder="0 = unlimited"
              />
            </label>

            {formError && <p className="form-error">{formError}</p>}

            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="return-btn" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save Changes" : "Create Coupon"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}