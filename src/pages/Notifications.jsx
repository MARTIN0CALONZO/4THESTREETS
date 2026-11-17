
import { useState, useEffect, useCallback, useMemo } from "react";
import ChatModal from "../components/ChatModal";
import { api } from "../api";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "unread", label: "Unread first" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" }
];

export default function Notifications() {
  const [conversations, setConversations] = useState([]);
  const [open, setOpen] = useState(null);
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");

  const load = useCallback(
    () =>
      api("/messages/admin/conversations")
        .then(({ conversations }) => setConversations(conversations))
        .catch(() => {}),
    []
  );

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const nameOf = (c) =>
    c.user ? c.user.fullName || c.user.username : c.guestName || "Guest";

  const byName = (a, b) =>
    nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" });

  const byDate = (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt);

  // The list refreshes every 5 seconds, so search and sort are applied on every render
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();

    // Search by customer name or by the last message
    const list = conversations.filter(  
  (c) =>
    c.lastMessage &&
    (!q || nameOf(c).toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q))
);

    if (sortBy === "newest") list.sort(byDate);
    if (sortBy === "oldest") list.sort((a, b) => byDate(b, a));
    if (sortBy === "unread")
      list.sort((a, b) => b.unreadForAdmin - a.unreadForAdmin || byDate(a, b));
    if (sortBy === "name-asc") list.sort(byName);
    if (sortBy === "name-desc") list.sort((a, b) => byName(b, a));

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, sortBy, search]);

  const closeChat = () => {
    setOpen(null);
    load(); // refresh so the unread count disappears right away
  };

  return (
    <div className="page">
      <section className="panel notifications-panel">
        <div className="panel-title">
          <h2>Messages</h2>
        </div>

        <div className="inventory-toolbar">
          <div className="inventory-search">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Search by customer name or message..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort messages"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>

          {search.trim() && (
            <button type="button" className="clear-filters" onClick={() => setSearch("")}>
              Clear
            </button>
          )}
        </div>

        <div className="notification-head">
          <span>Customer name</span>
          <span>Message</span>
          <span>Date</span>
        </div>

        {sorted.length === 0 && (
          <div className="no-orders">
            {conversations.length === 0
              ? "No messages yet."
              : "No messages match your search."}
          </div>
        )}

        {sorted.map((c) => (
          <div
            className={`notification-row ${c.unreadForAdmin > 0 ? "unread" : ""}`}
            key={c._id}
          >
            <div className="notif-name">
              <button
                type="button"
                className="customer-name-button"
                onClick={() => setOpen(c)}
              >
                {nameOf(c)}
              </button>

              {!c.user && <span className="guest-tag">Guest</span>}

              {c.unreadForAdmin > 0 && (
                <span className="msg-badge">{c.unreadForAdmin}</span>
              )}
            </div>

            <span className="notif-preview">{c.lastMessage}</span>

            <span>{new Date(c.lastMessageAt).toLocaleString()}</span>
          </div>
        ))}
      </section>

      {open && (
        <ChatModal
          title={`Chat with ${nameOf(open)}`}
          conversationId={open._id}
          onClose={closeChat}
        />
      )}
    </div>
  );
}