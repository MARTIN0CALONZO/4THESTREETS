import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Modal from "../components/Modal";
import { api } from "../api";
import { exportInventoryPdf } from "../utils/exportInventoryPdf";



// Must match server/models/Product.js
const SUBCATEGORIES = {
  tops: ["shirts", "hoodies", "longsleeves"],
  bottoms: ["pants", "shorts"],
  accessories: []
};
const STYLES = ["streetwear", "minimalist", "vintage", "bold", "y2k"];
const SIZE_OPTIONS = {
  tops: ["XS", "S", "M", "L", "XL"],
  bottoms: ["28", "29", "30", "31", "32", "33", "34", "35"],
  accessories: ["Free"]
};
const IMAGE_SLOTS = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "model", label: "Model" }
];

const CATEGORY_ORDER = ["tops", "bottoms", "accessories"];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
  { value: "category", label: "Category" },
  { value: "subcategory", label: "Subcategory" }
];

const byName = (a, b) =>
  (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });

// Products without a subcategory (accessories) go last
const bySubcategory = (a, b) => {
  const x = a.subcategory || "";
  const y = b.subcategory || "";
  if (!x && y) return 1;
  if (x && !y) return -1;
  return x.localeCompare(y);
};

const emptyForm = {
  code: "",
  name: "",
  category: "tops",
  subcategory: "shirts",
  styles: [],
  price: "",
  sizeStock: {}, // { XS: "10", S: "5" } -> only the selected sizes
  color: "",
  description: ""
};
const emptyImages = { front: "", back: "", model: "" };

// Shrinks a picture in the browser so we don't store huge base64 strings in MongoDB
const resizeImage = (file, max = 700) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff"; // PNG transparency would turn black in a JPEG
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

// "XS (10), S (5)" for the product list
const sizeSummary = (p) => {
  if (p.sizeStock?.length) {
    return p.sizeStock.map((s) => `${s.size} (${s.stock})`).join(", ");
  }
  return p.sizes?.join(", ") || "—";
};

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = adding a new product
  const [form, setForm] = useState(emptyForm);
  const [images, setImages] = useState(emptyImages);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  // search / filter / sort
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subFilter, setSubFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const loadProducts = async () => {
    try {
      const { products } = await api("/products");
      setProducts(products);
      setPageError("");
    } catch (err) {
      setPageError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setImages(emptyImages);
    setFormError("");
    setOpen(true);
  };

  const openEdit = (p) => {
    // Build { size: "stock" } from the saved data
    const sizeStock = {};
    if (p.sizeStock?.length) {
      p.sizeStock.forEach((s) => {
        sizeStock[s.size] = String(s.stock ?? 0);
      });
    } else {
      // Old product (one shared stock): put it all on the first size, admin can adjust
      (p.sizes || []).forEach((s, idx) => {
        sizeStock[s] = idx === 0 ? String(p.stock ?? 0) : "0";
      });
    }

    setEditingId(p._id);
    setForm({
      code: p.code,
      name: p.name,
      category: p.category,
      subcategory: p.subcategory || "",
      styles: p.styles || [],
      price: String(p.price),
      sizeStock,
      color: p.color || "",
      description: p.description || ""
    });
    setImages({
      front: p.images?.front || p.image || "",
      back: p.images?.back || "",
      model: p.images?.model || ""
    });
    setFormError("");
    setOpen(true);
  };

    // Coming from a stock alert: open that product's edit modal automatically
  useEffect(() => {
    const id = location.state?.editProductId;
    if (!id || loading) return;

    const p = products.find((x) => x._id === id);
    if (p) openEdit(p);

    // clear the state so a refresh or back button doesn't reopen it
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, products, location.state]);

  const closeModal = () => {
    setOpen(false);
    setFormError("");
  };

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  // Changing the category resets subcategory + sizes (they depend on it)
  const changeCategory = (category) =>
    setForm((f) => ({
      ...f,
      category,
      subcategory: SUBCATEGORIES[category][0] || "",
      sizeStock: {}
    }));

  const toggleStyle = (value) =>
    setForm((f) => ({
      ...f,
      styles: f.styles.includes(value)
        ? f.styles.filter((v) => v !== value)
        : [...f.styles, value]
    }));

  // Select / unselect a size
  const toggleSize = (size) =>
    setForm((f) => {
      const next = { ...f.sizeStock };
      if (size in next) delete next[size];
      else next[size] = "";
      return { ...f, sizeStock: next };
    });

  const setSizeStock = (size, value) =>
    setForm((f) => ({ ...f, sizeStock: { ...f.sizeStock, [size]: value } }));

  const handleImage = async (slot, e) => {
    const file = e.target.files[0];
    e.target.value = ""; // lets you re-pick the same file later
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      setImages((prev) => ({ ...prev, [slot]: dataUrl }));
    } catch {
      setFormError("Could not read that image. Try a different file.");
    }
  };

  const removeImage = (slot) => setImages((prev) => ({ ...prev, [slot]: "" }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!images.front) return setFormError("Front picture is required.");
    if (form.styles.length === 0) return setFormError("Pick at least one style.");

    // Keep the same order as the size buttons
    const selected = SIZE_OPTIONS[form.category].filter((s) => s in form.sizeStock);
    if (selected.length === 0) return setFormError("Pick at least one size.");

    const sizeStock = selected.map((size) => ({
      size,
      stock: Math.max(0, parseInt(form.sizeStock[size], 10) || 0)
    }));

    const { sizeStock: _unused, ...rest } = form;
    const body = {
      ...rest,
      price: Number(form.price),
      sizeStock,
      images,
      image: images.front // old field kept in sync for PickProd / Products pages
    };

    setSaving(true);
    try {
      if (editingId) {
        await api(`/products/${editingId}`, { method: "PUT", body });
      } else {
        await api("/products", { method: "POST", body });
      }
      await loadProducts();
      window.dispatchEvent(new Event("stock-updated"));
      closeModal();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await api(`/products/${p._id}`, { method: "DELETE" });
      setProducts((list) => list.filter((x) => x._id !== p._id));
    } catch (err) {
      setPageError(err.message);
    }
  };

  const handleExportPdf = () => {
    try {
      exportInventoryPdf(products); // full list only, never a filtered one
    } catch (err) {
      setPageError(`Could not create the PDF: ${err.message}`);
    }
  };

  const subs = SUBCATEGORIES[form.category];
  const selectedSizes = SIZE_OPTIONS[form.category].filter((s) => s in form.sizeStock);
  const totalStock = selectedSizes.reduce(
    (n, s) => n + (parseInt(form.sizeStock[s], 10) || 0),
    0
  );

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    const list = products.filter((p) => {
      if (q && !(p.name || "").toLowerCase().includes(q)) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (subFilter !== "all" && p.subcategory !== subFilter) return false;
      return true;
    });

    // The server already returns newest first, so "newest" needs no sorting
    if (sortBy === "name-asc") list.sort(byName);
    if (sortBy === "name-desc") list.sort((a, b) => byName(b, a));
    if (sortBy === "category")
      list.sort(
        (a, b) =>
          CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
          byName(a, b)
      );
    if (sortBy === "subcategory")
      list.sort((a, b) => bySubcategory(a, b) || byName(a, b));

    return list;
  }, [products, search, categoryFilter, subFilter, sortBy]);

  const filtersActive = search.trim() || categoryFilter !== "all" || subFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setSubFilter("all");
  };

  return (
    <div className="page inventory-page">
      <div className="inventory-background">
        <div className="page-heading">
          <h2>PRODUCT INVENTORY</h2>

          <div className="heading-actions">
            <button
              type="button"
              className="export-button"
              onClick={handleExportPdf}
              disabled={loading || products.length === 0}
            >
              <i className="fas fa-file-pdf"></i> Export PDF
            </button>

            <button className="plus-button" onClick={openAdd}>
              ＋
            </button>
          </div>
        </div>

        <div className="inventory-toolbar">
          <div className="inventory-search">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Search by product name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setSubFilter("all"); // subcategories depend on the category
            }}
          >
            <option value="all">All categories</option>
            <option value="tops">Tops</option>
            <option value="bottoms">Bottoms</option>
            <option value="accessories">Accessories</option>
          </select>

          {categoryFilter !== "all" && SUBCATEGORIES[categoryFilter].length > 0 && (
            <select value={subFilter} onChange={(e) => setSubFilter(e.target.value)}>
              <option value="all">All subcategories</option>
              {SUBCATEGORIES[categoryFilter].map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          )}

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>

          {filtersActive && (
            <button type="button" className="clear-filters" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>

        {!loading && products.length > 0 && (
          <p className="muted-text">
            Showing {visibleProducts.length} of {products.length} products
          </p>
        )}

        {pageError && <p className="form-error">{pageError}</p>}
        {loading && <p className="muted-text">Loading products...</p>}
        {!loading && products.length === 0 && !pageError && (
          <p className="muted-text">No products yet. Press ＋ to add one.</p>
        )}
        {!loading && products.length > 0 && visibleProducts.length === 0 && (
          <p className="muted-text">No products match your search or filters.</p>
        )}

        <div className="product-list">
          {visibleProducts.map((p) => {
            const front = p.images?.front || p.image;
            const count = [front, p.images?.back, p.images?.model].filter(Boolean).length;
            return (
              <div className="product-item" key={p._id}>
                <div className="product-thumb">
                  {front ? (
                    <img src={front} alt={p.name} className="product-image" />
                  ) : (
                    <span>T</span>
                  )}
                </div>

                <div className="product-details">
                  <strong>{p.name}</strong>
                  <span>
                    Code: {p.code} · {p.category}
                    {p.subcategory ? ` / ${p.subcategory}` : ""} · {count}/3 pictures
                  </span>
                  <span>
                    Color: {p.color || "—"} · Sizes: {sizeSummary(p)} · Total stock: {p.stock}
                  </span>
                  <b>Price: PHP {Number(p.price).toFixed(2)}</b>
                </div>

                <button className="edit-button" onClick={() => openEdit(p)}>
                  Edit
                </button>
                <button className="edit-button danger" onClick={() => handleDelete(p)}>
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {open && (
        <Modal onClose={closeModal}>
          <div className="modal-header">
            <h2>{editingId ? "EDIT PRODUCT" : "ADD NEW PRODUCT"}</h2>
            <button onClick={closeModal}>×</button>
          </div>

          <form onSubmit={handleSubmit} className="product-form">
            <label>
              Item code
              <input
                value={form.code}
                onChange={(e) => setField("code", e.target.value)}
                placeholder="SHR002"
                required
              />
            </label>

            <label>
              Item name
              <input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Product name"
                required
              />
            </label>

            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => changeCategory(e.target.value)}
              >
                <option value="tops">Tops</option>
                <option value="bottoms">Bottoms</option>
                <option value="accessories">Accessories</option>
              </select>
            </label>

            {subs.length > 0 && (
              <label>
                Subcategory
                <select
                  value={form.subcategory}
                  onChange={(e) => setField("subcategory", e.target.value)}
                >
                  {subs.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="form-field">
              <span>Styles</span>
              <div className="chip-row">
                {STYLES.map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={`chip ${form.styles.includes(s) ? "selected" : ""}`}
                    onClick={() => toggleStyle(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-field">
              <span>Sizes</span>
              <div className="chip-row">
                {SIZE_OPTIONS[form.category].map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={`chip ${s in form.sizeStock ? "selected" : ""}`}
                    onClick={() => toggleSize(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {selectedSizes.length > 0 && (
              <div className="form-field">
                <span>Stock per size</span>
                <div>
                  <div className="size-stock-grid">
                    {selectedSizes.map((s) => (
                      <label className="size-stock-item" key={s}>
                        <span>{s}</span>
                        <input
                          type="number"
                          min="0"
                          value={form.sizeStock[s]}
                          onChange={(e) => setSizeStock(s, e.target.value)}
                          placeholder="0"
                        />
                      </label>
                    ))}
                  </div>
                  <p className="size-stock-total">Total stock: {totalStock}</p>
                </div>
              </div>
            )}

            <label>
              Price (PHP)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setField("price", e.target.value)}
                placeholder="899"
                required
              />
            </label>

            <label>
              Color
              <input
                value={form.color}
                onChange={(e) => setField("color", e.target.value)}
                placeholder="Black"
              />
            </label>

            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="About product"
              />
            </label>

            {/* THREE PICTURE SLOTS */}
            <div className="form-field">
              <span>Pictures</span>
              <div className="image-slots">
                {IMAGE_SLOTS.map(({ key, label }) => (
                  <label className="image-slot" key={key}>
                    {images[key] ? (
                      <img src={images[key]} alt={label} />
                    ) : (
                      <span className="slot-empty">
                        ＋<br />
                        Upload
                      </span>
                    )}
                    <span className="slot-label">
                      {label}
                      {key === "front" ? " *" : ""}
                    </span>
                    {images[key] && (
                      <button
                        type="button"
                        className="slot-remove"
                        onClick={(e) => {
                          e.preventDefault();
                          removeImage(key);
                        }}
                      >
                        ×
                      </button>
                    )}
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      onChange={(e) => handleImage(key, e)}
                    />
                  </label>
                ))}
              </div>
            </div>

            {formError && <p className="form-error">{formError}</p>}

            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="return-btn" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}