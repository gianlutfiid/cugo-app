import React, { useState } from "react";

interface Props {
  password: string;
  title?: string;
  onClose: () => void;
}

const PasswordModal: React.FC<Props> = ({ password, title = "User password", onClose }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="modal-overlay" data-testid="password-modal">
      <div className="modal-card modal-sm">
        <h2 className="modal-title">{title}</h2>
        <p className="modal-note">
          Copy this password now — it is shown only once and is never stored in
          readable form.
        </p>
        <div className="password-box" data-testid="password-value">
          {password}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={copy} data-testid="copy-password-button">
            {copied ? "Copied!" : "Copy"}
          </button>
          <button className="btn-primary" onClick={onClose} data-testid="password-modal-close">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasswordModal;
