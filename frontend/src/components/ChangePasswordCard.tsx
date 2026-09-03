import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiChangePassword, formatApiError } from "../api/client";

function policyError(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters long.";
  if (pw.length > 72) return "Password must be at most 72 characters long.";
  if (!/[a-zA-Z]/.test(pw)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
  return null;
}

const ChangePasswordCard: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!current || !next || !confirm) {
      setError("All fields are required.");
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    const pe = policyError(next);
    if (pe) {
      setError(pe);
      return;
    }

    setSubmitting(true);
    try {
      const { message } = await apiChangePassword(current, next);
      setSuccess(`${message}`);
      setCurrent("");
      setNext("");
      setConfirm("");
      timeoutRef.current = setTimeout(async () => {
        await logout();
        navigate("/login", { replace: true });
      }, 1600);
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail) || "Unable to change password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="status-card" data-testid="change-password-card">
      <div className="status-card-head">
        <h2>Change password</h2>
      </div>
      <form onSubmit={handleSubmit} className="auth-form">
        <label className="field">
          <span className="field-label">Current password</span>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            data-testid="current-password-input"
          />
        </label>
        <label className="field">
          <span className="field-label">New password</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 10 chars, letters and numbers"
            data-testid="new-password-input"
          />
        </label>
        <label className="field">
          <span className="field-label">Confirm new password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            data-testid="confirm-password-input"
          />
        </label>

        {error && (
          <div className="auth-error" data-testid="change-password-error">
            {error}
          </div>
        )}
        {success && (
          <div className="auth-success" data-testid="change-password-success">
            {success}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={submitting}
          data-testid="change-password-submit"
        >
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </section>
  );
};

export default ChangePasswordCard;
