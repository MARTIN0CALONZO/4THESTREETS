import { useNavigate } from "react-router-dom";
import { auth } from "../auth";
import logo from "../assets/Logo.png"; // same logo as the store header (Nav.jsx)

export default function Header() {
  const navigate = useNavigate();

  const handleLogout = () => {
    auth.clear();
    navigate("/");
  };
  return (
    <header className="topbar">
      <div className="brand">
        <img src={logo} alt="4THESTREETS" className="brand-logo" />
      </div>

      <div className="admin-user">
        <span>Admin</span>
        <span className="user-icon"><i className="fa fa-user"></i></span>
        <button type="button" className="logout-btn" onClick={handleLogout}>
          <i className="fas fa-sign-out-alt"></i> Logout
        </button>
      </div>
    </header>
  );
}