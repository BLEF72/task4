import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import api from '../utils/api';
import Toast from '../components/Toast';


function getUniqIdValue(user) {
  return user.id;
}


function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function statusBadge(status) {
  const map = {
    active: 'badge-active',
    blocked: 'badge-blocked',
    unverified: 'badge-unverified',
  };
  return `badge ${map[status] || 'bg-secondary'}`;
}

export default function DashboardPage() {
  const { currentUser, logout, handleAuthError } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);


  const addToast = useCallback((message, type = 'success') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);


  const handleApiError = useCallback((err) => {
    if (err.response?.status === 401) {
      handleAuthError();
      navigate('/login', { replace: true });
      return true;
    }
    return false;
  }, [handleAuthError, navigate]);


  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/api/users');
      setUsers(res.data.users);
    } catch (err) {
      if (!handleApiError(err)) {
        addToast(err.response?.data?.error || 'Failed to load users', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [handleApiError, addToast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);


  const allSelected = users.length > 0 && selected.size === users.length;
  const someSelected = selected.size > 0 && selected.size < users.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map(u => getUniqIdValue(u))));
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };


  const afterAction = async (message) => {
    addToast(message);
    setSelected(new Set());
    await fetchUsers();
  };

  const handleBlock = async () => {
    if (selected.size === 0) return;
    try {
      const res = await api.post('/api/users/block', { ids: [...selected] });
      if (selected.has(currentUser.id)) {
        await logout();
        navigate('/login', { replace: true });
        return;
      }
      await afterAction(res.data.message);
    } catch (err) {
      if (!handleApiError(err)) addToast(err.response?.data?.error || 'Block failed', 'error');
    }
  };

  const handleUnblock = async () => {
    if (selected.size === 0) return;
    try {
      const res = await api.post('/api/users/unblock', { ids: [...selected] });
      await afterAction(res.data.message);
    } catch (err) {
      if (!handleApiError(err)) addToast(err.response?.data?.error || 'Unblock failed', 'error');
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    try {
      const res = await api.delete('/api/users', { data: { ids: [...selected] } });
      if (selected.has(currentUser.id)) {
        await logout();
        navigate('/login', { replace: true });
        return;
      }
      await afterAction(res.data.message);
    } catch (err) {
      if (!handleApiError(err)) addToast(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  const handleDeleteUnverified = async () => {
    try {
      const res = await api.delete('/api/users/unverified');
      const wasCurrentUserDeleted = currentUser.status === 'unverified';
      if (wasCurrentUserDeleted) {
        await logout();
        navigate('/login', { replace: true });
        return;
      }
      await afterAction(res.data.message);
    } catch (err) {
      if (!handleApiError(err)) addToast(err.response?.data?.error || 'Delete unverified failed', 'error');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const noneSelected = selected.size === 0;

  return (
    <div className="min-vh-100 d-flex flex-column">
      <nav className="navbar navbar-dark bg-dark px-3">
        <span className="navbar-brand mb-0 h1">User Management</span>
        <div className="d-flex align-items-center gap-3">
          <span className="text-white-50 small d-none d-sm-inline">
            {currentUser.name} ({currentUser.email})
          </span>
          <span className={statusBadge(currentUser.status)}>{currentUser.status}</span>
          <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
            <i className="bi bi-box-arrow-right me-1" />Logout
          </button>
        </div>
      </nav>
      <div className="container-fluid px-3 py-3 flex-grow-1">
      
        <div className="card mb-0 toolbar-card border-bottom-0">
          <div className="card-body py-2 px-3 d-flex align-items-center gap-2 flex-wrap">
        
            <button
              className="btn btn-sm btn-outline-danger"
              disabled={noneSelected}
              onClick={handleBlock}
              title="Block selected users"
              data-bs-toggle="tooltip"
            >
              <i className="bi bi-lock-fill me-1" />Block
            </button>
          
            <button
              className="btn btn-sm btn-outline-success"
              disabled={noneSelected}
              onClick={handleUnblock}
              title="Unblock selected users"
            >
              <i className="bi bi-unlock-fill" />
            </button>
            
            <button
              className="btn btn-sm btn-outline-secondary"
              disabled={noneSelected}
              onClick={handleDelete}
              title="Delete selected users"
            >
              <i className="bi bi-trash3-fill" />
            </button>
          
            <button
              className="btn btn-sm btn-outline-warning"
              onClick={handleDeleteUnverified}
              title="Delete all unverified users"
            >
              <i className="bi bi-person-x-fill" />
            </button>

            <span className="ms-2 text-muted small">
              {selected.size > 0 ? `${selected.size} selected` : 'No selection'}
            </span>
          </div>
        </div>

       
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status" />
          </div>
        ) : (
          <div className="table-responsive border rounded-bottom">
            <table className="table table-hover table-bordered mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  
                  <th className="col-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={allSelected}
                      ref={el => {
                        
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      title="Select / deselect all"
                    />
                  </th>
                  <th style={{ minWidth: 160 }}>Name</th>
                  <th style={{ minWidth: 200 }}>Email</th>
                  <th style={{ minWidth: 100 }}>Status</th>
                  <th style={{ minWidth: 180 }}>Last Login</th>
                  <th style={{ minWidth: 160 }}>Registered</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-4">No users found</td>
                  </tr>
                ) : users.map(user => {
                  const uid = getUniqIdValue(user);
                  const isMe = uid === currentUser.id;
                  const isSelected = selected.has(uid);
                  return (
                    
                    <tr
                      key={uid}
                      className={user.status === 'blocked' ? 'user-blocked' : ''}
                      style={{ background: isSelected ? 'rgba(13,110,253,0.07)' : undefined }}
                    >
                      <td className="col-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={isSelected}
                          onChange={() => toggleSelect(uid)}
                        />
                      </td>
                      <td>
                        {user.name}
                        {isMe && <span className="badge bg-primary ms-2 small">You</span>}
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <span className={statusBadge(user.status)}>
                          {user.status}
                        </span>
                      </td>
                      <td className="text-end text-nowrap">{formatDate(user.last_login)}</td>
                      <td className="text-end text-nowrap">{formatDate(user.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

   
      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
