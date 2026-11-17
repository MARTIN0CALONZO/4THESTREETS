import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

const CATEGORY_ORDER = ["tops", "bottoms", "accessories"];

const SORT_OPTIONS = [
  { value: "lowest", label: "Lowest stock first" },
  { value: "highest", label: "Highest stock first" },
  { value: "out-first", label: "Out of stock first" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
  { value: "category", label: "Category" }
];

const byName = (a, b) =>
  (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });

export default function StockAlerts() {
  const navigate = useNavigate();
  const [lowStock, setLowStock] = useState([]);
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(true);

  // search / filter / sort
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all"); // all | out | low
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("lowest");

  const loadStock = useCallback(
    () =>
      api("/products/low-stock")
        .then(({ alerts, threshold }) => {
          setLowStock(alerts);
          setThreshold(threshold);
        })
        .catch(() => {})
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    loadStock();
    const timer = setInterval(loadStock, 5000);
    return () => clearInterval(timer);
  }, [loadStock]);

  // The list refreshes every 5 seconds, so filter, search and sort run on every render
  const visibleAlerts = useMemo(() => {
    const q = search.trim().toLowerCase();

    const list = lowStock.filter((a) => {
      if (levelFilter !== "all" && a.level !== levelFilter) return false;
      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        (a.name || "").toLowerCase().includes(q) ||
        (a.code || "").toLowerCase().includes(q) ||
        (a.size || "").toLowerCase().includes(q)
      );
    });

    if (sortBy === "lowest") list.sort((a, b) => a.stock - b.stock || byName(a, b));
    if (sortBy === "highest") list.sort((a, b) => b.stock - a.stock || byName(a, b));
    if (sortBy === "out-first")
      list.sort(
        (a, b) =>
          Number(b.level === "out") - Number(a.level === "out") ||
          a.stock - b.stock ||
          byName(a, b)
      );
    if (sortBy === "name-asc") list.sort(byName);
    if (sortBy === "name-desc") list.sort((a, b) => byName(b, a));
    if (sortBy === "category")
      list.sort(
        (a, b) =>
          CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
          byName(a, b)
      );

    return list;
  }, [lowStock, search, levelFilter, categoryFilter, sortBy]);

  const filtersActive =
    search.trim() || levelFilter !== "all" || categoryFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setLevelFilter("all");
    setCategoryFilter("all");
  };

  return (
    <div className="page">
      <section className="panel notifications-panel stock-alerts-panel">
        <div className="panel-title">
          <h2>
            Stock Alerts
            {lowStock.length > 0 && (
              <span className="msg-badge alert-count">{lowStock.length}</span>
            )}
          </h2>
        </div>

        {lowStock.length > 0 && (
          <>
            <div className="inventory-toolbar">
              <div className="inventory-search">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="Search by name, code or size..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                aria-label="Filter by stock level"
              >
                <option value="all">All levels</option>
                <option value="out">Out of stock</option>
                <option value="low">Low stock</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="all">All categories</option>
                <option value="tops">Tops</option>
                <option value="bottoms">Bottoms</option>
                <option value="accessories">Accessories</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort alerts"
              >
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

            <p className="muted-text">
              Showing {visibleAlerts.length} of {lowStock.length} alerts
            </p>
          </>
        )}

        {loading && <div className="no-orders">Loading stock alerts...</div>}

        {!loading && lowStock.length === 0 && (
          <div className="no-orders">
            All products are well stocked (above {threshold} units).
          </div>
        )}

        {lowStock.length > 0 && visibleAlerts.length === 0 && (
          <div className="no-orders">No alerts match your search or filters.</div>
        )}

        {visibleAlerts.length > 0 && (
          <div className="stock-alert-list">
            {visibleAlerts.map((a) => (
              <div
                className={`stock-alert ${a.level}`}
                key={`${a.productId}-${a.size ?? "all"}`}
              >
                <i
                  className={
                    a.level === "out"
                      ? "fas fa-exclamation-circle"
                      : "fas fa-exclamation-triangle"
                  }
                ></i>

                <div className="stock-alert-text">
                  <strong>{a.name}</strong>
                  <span>
                    Code: {a.code}
                    {a.size ? ` · Size: ${a.size}` : ""}
                  </span>
                </div>

                <span className={`stock-alert-pill ${a.level}`}>
                  {a.level === "out" ? "Out of stock" : `Only ${a.stock} left`}
                </span>

                <button
                  type="button"
                  className="stock-alert-btn"
                  onClick={() =>
                    navigate("/admin/inventory", {
                      state: { editProductId: a.productId },
                    })
                  }
                >
                  Update Stock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}