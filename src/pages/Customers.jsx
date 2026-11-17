
import { useState, useEffect, useMemo } from "react";
import { api } from "../api";
import ChatModal from "../components/ChatModal";
import AddressFields, {
  emptyAddress,
  isAddressComplete,
  resolveAddress
} from "../AddressFields";

const emptyAddrForm = {
  label: "Home",
  zip: "",
  isDefault: false,
  addr: { ...emptyAddress }
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
  { value: "blocked", label: "Blocked first" },
  { value: "active", label: "Active first" }
];

const displayName = (c) => c.fullName || c.username || "";

const byName = (a, b) =>
  displayName(a).localeCompare(displayName(b), undefined, {
    sensitivity: "base"
  });

const byJoined = (a, b) =>
  new Date(b.createdAt) - new Date(a.createdAt);

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [selected, setSelected] = useState(null);

  const [editingContact, setEditingContact] = useState(false);
  const [contact, setContact] = useState({
    fullName: "",
    phone: "",
    email: ""
  });

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const [editingAddress, setEditingAddress] = useState(null);
  const [addrForm, setAddrForm] = useState(emptyAddrForm);
  const [addrLoading, setAddrLoading] = useState(false);

  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);
  const [chatWith, setChatWith] = useState(null);

  // Load customers
  useEffect(() => {
    let mounted = true;

    api("/users")
      .then(({ customers }) => {
        if (mounted) {
          setCustomers(Array.isArray(customers) ? customers : []);
        }
      })
      .catch((err) => {
        if (mounted) setPageError(err.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Apply updated customer
  const applyUpdate = (updated) => {
    const safe = {
      ...updated,
      addresses: updated.addresses || []
    };

    setCustomers((list) =>
      list.map((c) => (c.id === safe.id ? safe : c))
    );

    setSelected((s) =>
      s && s.id === safe.id ? safe : s
    );
  };

  // Search and sort
  const visibleCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();

    const list = customers.filter(
      (c) =>
        !q ||
        (c.fullName || "").toLowerCase().includes(q) ||
        (c.username || "").toLowerCase().includes(q)
    );

    if (sortBy === "newest") list.sort(byJoined);
    if (sortBy === "oldest") list.sort((a, b) => byJoined(b, a));
    if (sortBy === "name-asc") list.sort(byName);
    if (sortBy === "name-desc") list.sort((a, b) => byName(b, a));

    if (sortBy === "blocked") {
      list.sort(
        (a, b) =>
          Number(b.blocked) - Number(a.blocked) || byName(a, b)
      );
    }

    if (sortBy === "active") {
      list.sort(
        (a, b) =>
          Number(a.blocked) - Number(b.blocked) || byName(a, b)
      );
    }

    return list;
  }, [customers, search, sortBy]);

  // Block / unblock customer
  const toggleBlock = async (customer) => {
    const blocking = !customer.blocked;
    const name = customer.fullName || customer.username;

    const ok = window.confirm(
      blocking
        ? `Block ${name}? They will not be able to log in.`
        : `Unblock ${name}? They will be able to log in again.`
    );

    if (!ok) return;

    try {
      const { customer: updated } = await api(
        `/users/${customer.id}/block`,
        {
          method: "PATCH",
          body: { blocked: blocking }
        }
      );

      applyUpdate(updated);
    } catch (err) {
      setPageError(err.message);
    }
  };

  // Open customer information
  const openCustomerInfo = (customer) => {
    setSelected({
      ...customer,
      addresses: customer.addresses || []
    });

    setContact({
      fullName: customer.fullName || "",
      phone: customer.phone || "",
      email: customer.email || ""
    });

    setEditingContact(false);
    setEditingAddress(null);
    setAddrForm({
      ...emptyAddrForm,
      addr: { ...emptyAddress }
    });
    setModalError("");
  };

  // Close customer information
  const closeCustomerInfo = () => {
    setSelected(null);
    setEditingContact(false);
    setEditingAddress(null);
    setAddrForm({
      ...emptyAddrForm,
      addr: { ...emptyAddress }
    });
    setModalError("");
    setAddrLoading(false);
  };

  // Save contact details
  const handleSaveContact = async () => {
    if (!selected) return;

    setSaving(true);
    setModalError("");

    try {
      const { customer } = await api(`/users/${selected.id}`, {
        method: "PUT",
        body: contact
      });

      applyUpdate(customer);
      setEditingContact(false);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Cancel contact editing
  const cancelContact = () => {
    setContact({
      fullName: selected.fullName || "",
      phone: selected.phone || "",
      email: selected.email || ""
    });

    setEditingContact(false);
    setModalError("");
  };

  // Save address list
  const saveAddresses = async (next) => {
    if (!selected) return false;

    setSaving(true);
    setModalError("");

    try {
      const { customer } = await api(`/users/${selected.id}`, {
        method: "PUT",
        body: {
          addresses: next.map((a) => ({
            id: a.id,
            label: a.label,
            address: a.address,
            street: a.street,
            barangay: a.barangay,
            city: a.city,
            province: a.province,
            zip: a.zip,
            isDefault: a.isDefault
          }))
        }
      });

      applyUpdate(customer);
      return true;
    } catch (err) {
      setModalError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Add address
  const startAddAddress = () => {
    setModalError("");

    setAddrForm({
      ...emptyAddrForm,
      addr: { ...emptyAddress },
      isDefault: selected.addresses.length === 0
    });

    setEditingAddress("new");
  };

  // Edit address
  const startEditAddress = async (a) => {
    setModalError("");
    setEditingAddress(a.id);

    const hasParts = a.street || a.barangay || a.city || a.province;

    setAddrForm({
      label: a.label || "Address",
      zip: a.zip || "",
      isDefault: !!a.isDefault,
      addr: {
        ...emptyAddress,
        street: hasParts ? a.street || "" : a.address || ""
      }
    });

    if (!hasParts) return;

    setAddrLoading(true);

    try {
      const addr = await resolveAddress(a);
      setAddrForm((f) => ({ ...f, addr }));
    } catch {
      // Admin can select the address fields again.
    } finally {
      setAddrLoading(false);
    }
  };

  // Save new or edited address
  const handleSaveAddress = async () => {
    const { addr, label, zip, isDefault } = addrForm;

    if (!isAddressComplete(addr)) {
      setModalError(
        "Please complete the address: street, province, city and barangay."
      );
      return;
    }

    const entry = {
      label: label.trim() || "Home",
      street: addr.street.trim(),
      barangay: addr.barangay,
      city: addr.city.name,
      province: addr.province.name,
      zip: zip.trim(),
      isDefault
    };

    const isNew = editingAddress === "new";

    let next = isNew
      ? [...selected.addresses, entry]
      : selected.addresses.map((a) =>
          a.id === editingAddress ? { ...a, ...entry } : a
        );

    // Only one default address
    if (entry.isDefault) {
      next = next.map((a) => ({
        ...a,
        isDefault: isNew
          ? a === entry
          : a.id === editingAddress
      }));
    }

    if (await saveAddresses(next)) {
      setEditingAddress(null);
      setAddrForm({
        ...emptyAddrForm,
        addr: { ...emptyAddress }
      });
    }
  };

  // Remove address
  const handleRemoveAddress = async (id) => {
    if (!window.confirm("Remove this saved address?")) return;

    await saveAddresses(
      selected.addresses.filter((a) => a.id !== id)
    );
  };

  // Format date
  const formatDate = (iso) => {
    if (!iso) return "—";

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  return (
    <div className="page">
      <section className="panel table-panel">
        <h2>CUSTOMER</h2>

        {pageError && <p className="form-error">{pageError}</p>}

        {loading && (
          <p className="muted-text">Loading customers...</p>
        )}

        {!loading && customers.length === 0 && !pageError && (
          <p className="muted-text">
            No customers have registered yet.
          </p>
        )}

        {customers.length > 0 && (
          <>
            <div className="inventory-toolbar">
              <div className="inventory-search">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="Search by name or username..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort customers"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    Sort: {o.label}
                  </option>
                ))}
              </select>

              {search.trim() && (
                <button
                  type="button"
                  className="clear-filters"
                  onClick={() => setSearch("")}
                >
                  Clear
                </button>
              )}
            </div>

            <p className="muted-text">
              Showing {visibleCustomers.length} of {customers.length} customers
            </p>

            {visibleCustomers.length === 0 && (
              <p className="muted-text">
                No customers match your search.
              </p>
            )}

            <div className="customer-table">
              <div className="table-head customer-grid">
                <span>Name</span>
                <span>Email</span>
                <span>Status</span>
                <span>Actions</span>
              </div>

              {visibleCustomers.map((customer) => (
                <div
                  className="table-row customer-grid"
                  key={customer.id}
                >
                  <button
                    type="button"
                    className="customer-name-button"
                    onClick={() => openCustomerInfo(customer)}
                  >
                    {customer.fullName || customer.username}
                  </button>

                  <span className="customer-email">
                    {customer.email}
                  </span>

                  <span
                    className={`status-badge ${
                      customer.blocked ? "blocked" : "active"
                    }`}
                  >
                    {customer.blocked ? "Blocked" : "Active"}
                  </span>

                  <div className="customer-actions">
                    <button
                      type="button"
                      className="chat-button"
                      title="Message customer"
                      onClick={() => setChatWith(customer)}
                    >
                      <i className="far fa-comment-dots"></i>
                    </button>

                    <button
                      type="button"
                      className={`block-button ${
                        customer.blocked ? "is-blocked" : ""
                      }`}
                      onClick={() => toggleBlock(customer)}
                      title={
                        customer.blocked
                          ? "Unblock customer"
                          : "Block customer"
                      }
                    >
                      <i
                        className={
                          customer.blocked
                            ? "fas fa-unlock"
                            : "fas fa-ban"
                        }
                      ></i>

                      <span>
                        {customer.blocked ? "Unblock" : "Block"}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {selected && (
        <div
          className="customer-modal-backdrop"
          onClick={closeCustomerInfo}
        >
          <div
            className="customer-modal customer-details-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="customer-modal-header">
              <h2>CUSTOMER INFORMATION</h2>

              <button
                type="button"
                className="customer-modal-close"
                onClick={closeCustomerInfo}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {modalError && (
              <p className="form-error modal-error">{modalError}</p>
            )}

            <div className="customer-info-card">
              <div className="customer-card-header">
                <div>
                  <h3>Contact Details</h3>
                  <p>
                    @{selected.username} · Joined{" "}
                    {formatDate(selected.createdAt)} ·{" "}
                    <span
                      className={`status-badge ${
                        selected.blocked ? "blocked" : "active"
                      }`}
                    >
                      {selected.blocked ? "Blocked" : "Active"}
                    </span>
                  </p>
                </div>

                {!editingContact && (
                  <button
                    type="button"
                    className="customer-edit-btn"
                    onClick={() => setEditingContact(true)}
                  >
                    <i className="fas fa-edit"></i>
                    Edit
                  </button>
                )}
              </div>

              <div className="contact-details-grid">
                <div className="contact-field">
                  <label>Full Name</label>

                  {editingContact ? (
                    <input
                      type="text"
                      value={contact.fullName}
                      onChange={(e) =>
                        setContact({
                          ...contact,
                          fullName: e.target.value
                        })
                      }
                    />
                  ) : (
                    <span>{selected.fullName || "—"}</span>
                  )}
                </div>

                <div className="contact-field">
                  <label>Phone Number</label>

                  {editingContact ? (
                    <input
                      type="text"
                      value={contact.phone}
                      onChange={(e) =>
                        setContact({
                          ...contact,
                          phone: e.target.value
                        })
                      }
                    />
                  ) : (
                    <span>{selected.phone || "—"}</span>
                  )}
                </div>

                <div className="contact-field">
                  <label>Email Address</label>

                  {editingContact ? (
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) =>
                        setContact({
                          ...contact,
                          email: e.target.value
                        })
                      }
                    />
                  ) : (
                    <span>{selected.email}</span>
                  )}
                </div>

                <div className="contact-field">
                  <label>Password</label>
                  <span>••••••••</span>
                </div>
              </div>

              {editingContact && (
                <div className="contact-edit-actions">
                  <button
                    type="button"
                    className="contact-cancel-btn"
                    onClick={cancelContact}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="contact-save-btn"
                    onClick={handleSaveContact}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}
            </div>

            <div className="customer-info-card saved-address-card">
              <div className="customer-card-header">
                <div>
                  <h3>Saved Address</h3>
                  <p>Customer delivery addresses</p>
                </div>

                <button
                  type="button"
                  className="customer-add-btn"
                  onClick={startAddAddress}
                >
                  <i className="fas fa-plus"></i>
                  Add Address
                </button>
              </div>

              <div className="address-list">
                {selected.addresses.length === 0 && (
                  <div className="no-address">
                    <i className="fas fa-map-marker-alt"></i>
                    <span>No saved address</span>
                  </div>
                )}

                {selected.addresses.map((address) => (
                  <div
                    className="saved-address-item"
                    key={address.id}
                  >
                    <div className="address-icon">
                      <i className="fas fa-map-marker-alt"></i>
                    </div>

                    <div className="address-content">
                      <strong>{address.label}</strong>
                      <span>{address.address}</span>
                    </div>

                    <div className="address-actions">
                      <button
                        type="button"
                        className="address-edit-btn"
                        onClick={() => startEditAddress(address)}
                        title="Edit address"
                      >
                        <i className="fas fa-edit"></i>
                      </button>

                      <button
                        type="button"
                        className="address-remove-btn"
                        onClick={() => handleRemoveAddress(address.id)}
                        title="Remove address"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {editingAddress !== null && (
                <div className="address-edit-box">
                  <label>
                    {editingAddress === "new"
                      ? "New Address"
                      : "Edit Address"}
                  </label>

                  <div className="admin-psgc">
                    <input
                      type="text"
                      maxLength={30}
                      placeholder="Label (Home, Work...)"
                      value={addrForm.label}
                      onChange={(e) =>
                        setAddrForm((f) => ({
                          ...f,
                          label: e.target.value
                        }))
                      }
                    />

                    {addrLoading ? (
                      <p className="muted-text">Loading address...</p>
                    ) : (
                      <AddressFields
                        value={addrForm.addr}
                        onChange={(addr) =>
                          setAddrForm((f) => ({
                            ...f,
                            addr
                          }))
                        }
                      />
                    )}

                    <input
                      type="text"
                      maxLength={10}
                      placeholder="ZIP code (optional)"
                      value={addrForm.zip}
                      onChange={(e) =>
                        setAddrForm((f) => ({
                          ...f,
                          zip: e.target.value
                        }))
                      }
                    />

                    <label className="address-check">
                      <input
                        type="checkbox"
                        checked={addrForm.isDefault}
                        disabled={
                          selected.addresses.length === 0 ||
                          selected.addresses.find(
                            (a) => a.id === editingAddress
                          )?.isDefault
                        }
                        onChange={(e) =>
                          setAddrForm((f) => ({
                            ...f,
                            isDefault: e.target.checked
                          }))
                        }
                      />
                      Set as default address
                    </label>
                  </div>

                  <div className="address-form-actions">
                    <button
                      type="button"
                      className="address-cancel-btn"
                      onClick={() => {
                        setEditingAddress(null);
                        setAddrForm({
                          ...emptyAddrForm,
                          addr: { ...emptyAddress }
                        });
                        setModalError("");
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className="address-save-btn"
                      onClick={handleSaveAddress}
                      disabled={saving || addrLoading}
                    >
                      {saving ? "Saving..." : "Save Address"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {chatWith && (
        <ChatModal
          title={`Chat with ${
            chatWith.fullName || chatWith.username || chatWith.name
          }`}
          userId={chatWith.id || chatWith._id}
          onClose={() => setChatWith(null)}
        />
      )}
    </div>
  );
}