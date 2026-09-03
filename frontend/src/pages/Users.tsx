import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminListUsers, AdminUser, Branch, listBranches } from "../api/client";
import CreateUserModal from "../components/users/CreateUserModal";
import EditUserModal from "../components/users/EditUserModal";
import PasswordModal from "../components/users/PasswordModal";

const branchesLabel = (u: AdminUser): string => {
  if (u.is_superadmin) return "All branches";
  if (u.memberships.length === 0) return "—";
  return u.memberships.map((m) => `${m.branch_code} (${m.role})`).join(", ");
};

const Users: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState<string | null>(null);

  const refresh = async () => {
    const list = await adminListUsers();
    setUsers(list);
  };

  useEffect(() => {
    Promise.all([adminListUsers(), listBranches()])
      .then(([u, b]) => {
        setUsers(u);
        setBranches(b);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app" data-testid="users-page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CUGO</span>
          <span className="brand-dot" />
          <span className="brand-sub">App</span>
        </div>
        <div className="topbar-right">
          <button className="btn-ghost" onClick={() => navigate("/")} data-testid="back-to-dashboard">
            Dashboard
          </button>
          <button
            className="btn-primary"
            onClick={() => setShowCreate(true)}
            data-testid="create-user-button"
          >
            Create user
          </button>
        </div>
      </header>

      <main className="hero users-main">
        <p className="eyebrow">Administration</p>
        <h1 className="title">Users</h1>
        <p className="subtitle">
          Create and manage branch_admin and staff accounts and their branch assignments.
        </p>

        {loading ? (
          <div className="spinner" />
        ) : (
          <div className="table-wrap">
            <table className="data-table" data-testid="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Branches &amp; role</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} data-testid={`user-row-${u.email}`}>
                    <td>{u.full_name ?? "—"}</td>
                    <td>{u.email}</td>
                    <td>{u.is_superadmin ? <span className="badge badge-navy">Super Admin</span> : branchesLabel(u)}</td>
                    <td>
                      <span className={`badge ${u.is_active ? "badge-ok" : "badge-down"}`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      {!u.is_superadmin && (
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => setEditing(u)}
                          data-testid={`manage-user-${u.email}`}
                        >
                          Manage
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showCreate && (
        <CreateUserModal
          branches={branches}
          onClose={() => setShowCreate(false)}
          onCreated={(_, pw) => {
            setShowCreate(false);
            refresh();
            setPassword(pw);
          }}
        />
      )}

      {editing && (
        <EditUserModal
          user={editing}
          branches={branches}
          onClose={() => setEditing(null)}
          onChanged={() => refresh()}
          onPassword={(pw) => setPassword(pw)}
        />
      )}

      {password && (
        <PasswordModal password={password} onClose={() => setPassword(null)} />
      )}
    </div>
  );
};

export default Users;
