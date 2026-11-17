import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";
const items = [
  ["/admin", "DASHBOARD"],
  ["/admin/inventory", "PRODUCT INVENTORY"],
  ["/admin/stock-alerts", "STOCK ALERTS"],
  ["/admin/customers", "CUSTOMER"],
  ["/admin/orders", "ORDERS"],
  ["/admin/coupons", "COUPONS"],
  ["/admin/notifications", "MESSAGES"],
  ["/admin/reviews", "REVIEWS"]
];

export default function Sidebar() {
  const [unread, setUnread] = useState(0);
  const [lowCount, setLowCount] = useState(0);

  useEffect(() => {
    const load = () => {
      api("/messages/admin/unread")
        .then(({ count }) => setUnread(count))
        .catch(() => {});
      api("/products/low-stock")
        .then(({ alerts }) => setLowCount(alerts.length))
        .catch(() => {});
    };

    load();
    const timer = setInterval(load, 5000);
    window.addEventListener("messages-updated", load);
    window.addEventListener("stock-updated", load);

    return () => {
      clearInterval(timer);
      window.removeEventListener("messages-updated", load);
      window.removeEventListener("stock-updated", load);
    };
  }, []);

  const badgeFor = (to) => {
    if (to === "/admin/notifications") return unread;
    if (to === "/admin/stock-alerts") return lowCount;
    return 0;
  };

  return (
    <aside className="sidebar">
      <div className="side-nav">
        {items.map(([to, label]) => {
          const badge = badgeFor(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={to === "/admin"}
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            >
              {label}
              {badge > 0 && (
                <span className="side-badge">{badge > 99 ? "99+" : badge}</span>
              )}
            </NavLink>
          );
        })}
      </div>
    </aside>
  );
}