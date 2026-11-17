export default function Modal({ onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}