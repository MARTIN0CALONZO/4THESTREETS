import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

const RANGES = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "year", label: "Last 12 months" }
];

// Same order the donut and its legend use
const STATUS = {
  delivered: { label: "Delivered", color: "#a7f000" },
  shipped: { label: "Shipped", color: "#6d8fe8" },
  paid: { label: "Paid", color: "#d782c7" },
  pending: { label: "Pending", color: "#f5b23e" },
  cancelled: { label: "Cancelled", color: "#ff6b6b" }
};
const STATUS_KEYS = Object.keys(STATUS);

const CATEGORY_COLORS = { tops: "#a7f000", bottoms: "#6d8fe8", accessories: "#f5b23e" };

const money = (n) =>
  "PHP " +
  Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

// 12500 -> "12.5k" (for the chart axis)
const compact = (n) =>
  n >= 1000
    ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k"
    : String(Math.round(n));

const TZ = "Asia/Manila";

// Chart keys are "2026-10-28" (a day) or "2026-10" (a month)
const toDate = (key) => new Date(key.length === 7 ? `${key}-01T00:00:00+08:00` : `${key}T00:00:00+08:00`);

const shortLabel = (key, range) => {
  const d = toDate(key);
  if (key.length === 7) return d.toLocaleDateString("en-PH", { month: "short", timeZone: TZ });
  if (range === "7d") return d.toLocaleDateString("en-PH", { weekday: "short", timeZone: TZ });
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: TZ });
};

const longLabel = (key) =>
  toDate(key).toLocaleDateString(
    "en-PH",
    key.length === 7
      ? { month: "long", year: "numeric", timeZone: TZ }
      : { month: "long", day: "numeric", year: "numeric", timeZone: TZ }
  );

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: TZ });

// Round the top of the chart up to 1, 2, 5 or 10 x a power of ten
const niceCeil = (max) => {
  if (max <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = max / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

/* ---------- small pieces ---------- */

function Delta({ now, before }) {
  if (!before) {
    return (
      <span className="dash-delta muted">{now > 0 ? "New this period" : "No change"}</span>
    );
  }
  const pct = ((now - before) / before) * 100;
  const up = pct >= 0;
  return (
    <span className={`dash-delta ${up ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%<em>vs previous period</em>
    </span>
  );
}

function Kpi({ label, value, now, before }) {
  return (
    <section className="panel dash-card">
      <div className="dash-label">{label}</div>
      <div className="dash-value">{value}</div>
      <Delta now={now} before={before} />
    </section>
  );
}

function SalesChart({ sales, range }) {
  const W = 640, H = 220, L = 46, R = 14, T = 14, B = 44;
  const iw = W - L - R;
  const ih = H - T - B;
  const n = sales.length;
  const max = niceCeil(Math.max(0, ...sales.map((s) => s.total)));

  const x = (i) => (n < 2 ? L + iw / 2 : L + (i * iw) / (n - 1));
  const y = (v) => T + ih - (v / max) * ih;

  const line = sales.map((s, i) => `${x(i)},${y(s.total)}`).join(" ");
  const area = n ? `${x(0)},${T + ih} ${line} ${x(n - 1)},${T + ih}` : "";
  const step = n > 12 ? 5 : 1;
  const total = sales.reduce((a, s) => a + s.total, 0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="dash-chart"
      role="img"
      aria-label={`Line chart of sales, ${money(total)} in total`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="#2a3033" />
          <text x={L - 8} y={y(max * f) + 4} textAnchor="end">
            {compact(max * f)}
          </text>
        </g>
      ))}

      {n > 0 && <polygon points={area} fill="#a7f000" fillOpacity="0.12" />}
      <polyline
        points={line}
        fill="none"
        stroke="#a7f000"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {sales.map((s, i) => (
        <g key={s.key}>
          <circle
            cx={x(i)}
            cy={y(s.total)}
            r={n > 14 ? 3 : 4}
            fill="#000"
            stroke="#a7f000"
            strokeWidth="2"
          >
            <title>{`${longLabel(s.key)}: ${money(s.total)}`}</title>
          </circle>
          {(n - 1 - i) % step === 0 && (
            <text x={x(i)} y={T + ih + 20} textAnchor="middle">
              {shortLabel(s.key, range)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function StatusDonut({ counts }) {
  const total = STATUS_KEYS.reduce((n, k) => n + (counts[k] || 0), 0);
  const C = 2 * Math.PI * 40;
  let offset = 0;

  return (
    <div className="dash-donut">
      <svg
        viewBox="0 0 100 100"
        className="dash-donut-svg"
        role="img"
        aria-label={`Donut chart of ${total} orders by status`}
      >
        <g fill="none" strokeWidth="14" transform="rotate(-90 50 50)">
          {total === 0 && <circle cx="50" cy="50" r="40" stroke="#2a3033" />}
          {STATUS_KEYS.map((k) => {
            const v = counts[k] || 0;
            if (!v) return null;
            const len = (v / total) * C;
            const el = (
              <circle
                key={k}
                cx="50"
                cy="50"
                r="40"
                stroke={STATUS[k].color}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="50" y="49" textAnchor="middle" className="donut-total">
          {total}
        </text>
        <text x="50" y="62" textAnchor="middle" className="donut-sub">
          orders
        </text>
      </svg>

      <ul className="dash-legend">
        {STATUS_KEYS.map((k) => (
          <li key={k}>
            <span className="dot" style={{ background: STATUS[k].color }}></span>
            {STATUS[k].label} · {counts[k] || 0}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- page ---------- */

export default function Dashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState("7d");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      api(`/orders/stats?range=${range}`)
        .then((d) => {
          setData(d);
          setError("");
        })
        .catch((err) => setError(err.message)),
    [range]
  );

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const k = data?.kpis;
  const maxSold = Math.max(1, ...(data?.topProducts || []).map((p) => p.sold));
  const catTotal = (data?.categories || []).reduce((n, c) => n + c.total, 0);

  return (
    <div className="page">
      <div className="dash">
        {/* Header + date range */}
        <header className="panel dash-header">
          <div>
            <h1>Dashboard</h1>
            <p className="dash-sub">Store overview</p>
          </div>

          <div className="dash-ranges">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`dash-range ${range === r.id ? "on" : ""}`}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </header>

        {error && <p className="form-error">{error}</p>}
        {!data && !error && <p className="muted-text">Loading dashboard...</p>}

        {data && (
          <>
            {/* KPI cards */}
            <div className="dash-kpis">
              <Kpi
                label="Revenue"
                value={money(k.revenue.value)}
                now={k.revenue.value}
                before={k.revenue.prev}
              />
              <Kpi
                label="Orders"
                value={k.orders.value}
                now={k.orders.value}
                before={k.orders.prev}
              />
              <Kpi
                label="Avg. order value"
                value={money(k.avgOrder.value)}
                now={k.avgOrder.value}
                before={k.avgOrder.prev}
              />
              <Kpi
                label="New customers"
                value={k.customers.value}
                now={k.customers.value}
                before={k.customers.prev}
              />
            </div>

            {/* Things that need the admin's attention */}
            <div className="dash-actions">
              <div className="dash-action warn">
                <div>
                  <strong>{data.actions.toShip}</strong>
                  <span>Orders waiting to be shipped</span>
                </div>
                <button type="button" onClick={() => navigate("/admin/orders")}>
                  Review
                </button>
              </div>

              <div className="dash-action danger">
                <div>
                  <strong>{data.actions.outOfStock}</strong>
                  <span>Items out of stock</span>
                </div>
                <button type="button" onClick={() => navigate("/admin/stock-alerts")}>
                  Restock
                </button>
              </div>

              <div className="dash-action ok">
                <div>
                  <strong>{data.actions.unreadMessages}</strong>
                  <span>Unread customer messages</span>
                </div>
                <button type="button" onClick={() => navigate("/admin/notifications")}>
                  Reply
                </button>
              </div>
            </div>

            {/* Sales chart + status donut */}
            <div className="dash-row">
              <section className="panel dash-card">
                <div className="dash-card-head">
                  <h2>Sales over time</h2>
                  <span className="dash-label">
                    PHP per {range === "year" ? "month" : "day"}
                  </span>
                </div>
                <SalesChart sales={data.sales} range={range} />
              </section>

              <section className="panel dash-card">
                <div className="dash-card-head">
                  <h2>Orders by status</h2>
                </div>
                <StatusDonut counts={data.statusCounts} />
              </section>
            </div>

            {/* Recent orders + top sellers */}
            <div className="dash-row">
              <section className="panel dash-card">
                <div className="dash-card-head">
                  <h2>Recent orders</h2>
                  <button
                    type="button"
                    className="green-link"
                    onClick={() => navigate("/admin/orders")}
                  >
                    View all
                  </button>
                </div>

                {data.recentOrders.length === 0 ? (
                  <p className="dash-empty">No orders yet.</p>
                ) : (
                  <div className="dash-table-wrap">
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Customer</th>
                          <th>Date</th>
                          <th>Total</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentOrders.map((o) => (
                          <tr key={o._id}>
                            <td>
                              <strong>#{o.orderNumber}</strong>
                            </td>
                            <td>{o.customer}</td>
                            <td>{formatDate(o.createdAt)}</td>
                            <td>{money(o.total)}</td>
                            <td>
                              <span className={`dash-pill ${o.status}`}>
                                {STATUS[o.status]?.label || o.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="panel dash-card">
                <div className="dash-card-head">
                  <h2>Top selling products</h2>
                </div>

                {data.topProducts.length === 0 ? (
                  <p className="dash-empty">No sales in this period.</p>
                ) : (
                  <div className="dash-bars">
                    {data.topProducts.map((p) => (
                      <div key={p.name}>
                        <div className="dash-bar-row">
                          <span>{p.name}</span>
                          <b>{p.sold} sold</b>
                        </div>
                        <div className="dash-bar">
                          <i style={{ width: `${(p.sold / maxSold) * 100}%` }}></i>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Low stock + categories */}
            <div className="dash-row even">
              <section className="panel dash-card">
                <div className="dash-card-head">
                  <h2>Low stock</h2>
                  <button
                    type="button"
                    className="green-link"
                    onClick={() => navigate("/admin/stock-alerts")}
                  >
                    Manage
                  </button>
                </div>

                {data.lowStock.length === 0 ? (
                  <p className="dash-empty">All products are well stocked.</p>
                ) : (
                  <div className="dash-low-list">
                    {data.lowStock.map((a, i) => (
                      <div className={`dash-low ${a.level}`} key={`${a.name}-${a.size}-${i}`}>
                        <div>
                          <strong>{a.name}</strong>
                          <span>{a.size ? `Size ${a.size}` : "All sizes"}</span>
                        </div>
                        <span className={`dash-pill ${a.level === "out" ? "cancelled" : "pending"}`}>
                          {a.level === "out" ? "Out of stock" : `Only ${a.stock} left`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="panel dash-card">
                <div className="dash-card-head">
                  <h2>Sales by category</h2>
                </div>

                {catTotal === 0 ? (
                  <p className="dash-empty">No sales in this period.</p>
                ) : (
                  <div className="dash-bars big">
                    {data.categories.map((c) => {
                      const pct = Math.round((c.total / catTotal) * 100);
                      return (
                        <div key={c.category}>
                          <div className="dash-bar-row">
                            <span className="cap">{c.category}</span>
                            <b>{pct}%</b>
                          </div>
                          <div className="dash-bar">
                            <i
                              style={{
                                width: `${pct}%`,
                                background: CATEGORY_COLORS[c.category]
                              }}
                            ></i>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}