import { useState, useEffect, useRef } from "react";
import Modal from "./Modal";
import { api } from "../api";

export default function ChatModal({ title, userId, conversationId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [convId, setConvId] = useState(conversationId || null);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  const query = conversationId ? `id=${conversationId}` : `user=${userId}`;

  useEffect(() => {
    const load = () =>
      api(`/messages/admin/conversation?${query}`)
        .then(({ conversation }) => {
          if (!conversation) return;
          setConvId(conversation._id);
          setMessages(conversation.messages);
          // The server clears the unread count when this loads,
          // so tell the sidebar to refresh its badge.
          if (conversation.unreadForAdmin > 0) {
            window.dispatchEvent(new Event("messages-updated"));
          }
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [query]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      const { conversation } = await api("/messages/admin/reply", {
        method: "POST",
        body: { conversation: convId, user: userId, text: body },
      });
      setConvId(conversation._id);
      setMessages(conversation.messages);
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete one message (admin's or customer's)
  const deleteMessage = async (m) => {
    if (!convId) return;
    if (!window.confirm("Delete this message? The customer will no longer see it.")) return;
    try {
      const { conversation } = await api(
        `/messages/admin/conversation/${convId}/messages/${m._id}`,
        { method: "DELETE" }
      );
      setMessages(conversation.messages);
      window.dispatchEvent(new Event("messages-updated"));
    } catch (err) {
      alert(err.message);
    }
  };

  // Reset the whole conversation to zero
  const resetConversation = async () => {
    if (!convId || messages.length === 0) return;
    if (!window.confirm("Delete ALL messages in this conversation? This cannot be undone.")) return;
    try {
      const { conversation } = await api(
        `/messages/admin/conversation/${convId}/messages`,
        { method: "DELETE" }
      );
      setMessages(conversation.messages);
      window.dispatchEvent(new Event("messages-updated"));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="modal-header">
        <h2>{title}</h2>
        <button onClick={onClose}>×</button>
      </div>

      {convId && messages.length > 0 && (
        <div className="admin-chat-tools">
          <button type="button" className="chat-reset-btn" onClick={resetConversation}>
            <i className="fas fa-trash"></i> Reset conversation
          </button>
        </div>
      )}

      <div className="admin-chat-messages">
        {messages.length === 0 && <p className="admin-chat-empty">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m._id} className={`admin-chat-bubble ${m.sender}`}>
            {m.text}
            <button
              type="button"
              className="bubble-delete"
              title="Delete message"
              onClick={() => deleteMessage(m)}
            >
              ×
            </button>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="admin-chat-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a reply..."
        />
        <button onClick={send}><i className="fas fa-paper-plane"></i></button>
      </div>
    </Modal>
  );
}