import { useState } from "react";

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");

  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "Hello! How can I help you?"
    }
  ]);

  const sendMessage = () => {
    if (!message.trim()) return;

    setMessages((prev) => [
      ...prev,
      {
        sender: "user",
        text: message
      }
    ]);

    setMessage("");

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "Thanks for your message! I'll help you with that."
        }
      ]);
    }, 500);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  };

  return (
    <>
      <button
        type="button"
        className="chatbot-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open chatbot"
      >
        <i
          className={
            isOpen
              ? "fas fa-times"
              : "fas fa-comment-dots"
          }
        ></i>
      </button>

      {isOpen && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <div className="chatbot-title">
              <div className="chatbot-icon">
                <i className="fas fa-robot"></i>
              </div>

              <div>
                <h3>Admin Assistant</h3>

                <span>
                  <i className="fas fa-circle"></i>
                  Online
                </span>
              </div>
            </div>

            <button
              type="button"
              className="chatbot-close"
              onClick={() => setIsOpen(false)}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="chatbot-messages">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`chatbot-message ${
                  msg.sender === "user"
                    ? "user-message"
                    : "bot-message"
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          <div className="chatbot-input">
            <input
              type="text"
              placeholder="Type a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
            />

            <button
              type="button"
              onClick={sendMessage}
              aria-label="Send message"
            >
              <i className="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      )}
    </>
  );
}