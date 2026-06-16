
import React, { useEffect } from 'react';

export default function Toast({ toasts, removeToast }) {
  return (
    <div className="toast-container-custom">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  );
}


function ToastItem({ toast, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`toast show align-items-center text-white border-0 mb-2 ${
        toast.type === 'error' ? 'bg-danger' : 'bg-success'
      }`}
      role="alert"
    >
      <div className="d-flex">
        <div className="toast-body">{toast.message}</div>
        <button
          type="button"
          className="btn-close btn-close-white me-2 m-auto"
          onClick={onClose}
          aria-label="Close"
        />
      </div>
    </div>
  );
}
