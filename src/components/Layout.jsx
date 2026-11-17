import Sidebar from "./Sidebar";
import Header from "./Header";

export default function Layout({ children }) {
  return (
    <div className="app-shell">
      <Header />
      <div className="body-shell">
        <Sidebar />
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}