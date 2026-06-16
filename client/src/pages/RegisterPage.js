import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/api/register', { name, email, password });
      setSuccess(res.data.message);
      setName(''); setEmail(''); setPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
      <div className="card shadow-sm" style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-body p-4">
          <h1 className="h4 mb-1 fw-bold">Create account</h1>
          <p className="text-muted small mb-4">User Management System</p>

          {success && (
            <div className="alert alert-success">
              {success}
              <div className="mt-2">
                <Link to="/login" className="alert-link">Go to login →</Link>
              </div>
            </div>
          )}
          {error && <div className="alert alert-danger py-2">{error}</div>}

          {!success && (
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-3">
                <label htmlFor="name" className="form-label">Full name</label>
                <input
                  id="name"
                  type="text"
                  className="form-control"
                  placeholder="John Doe"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="mb-3">
                <label htmlFor="email" className="form-label">Email address</label>
                <input
                  id="email"
                  type="email"
                  className="form-control"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="mb-4">
                <label htmlFor="password" className="form-label">Password</label>
                <input
                  id="password"
                  type="password"
                  className="form-control"
                  placeholder="Any non-empty password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <div className="form-text">Any password works, even a single character.</div>
              </div>
              <button
                type="submit"
                className="btn btn-primary w-100"
                disabled={loading}
              >
                {loading
                  ? <><span className="spinner-border spinner-border-sm me-2" />Registering…</>
                  : 'Register'}
              </button>
            </form>
          )}

          <hr className="my-3" />
          <p className="text-center mb-0 small">
            Already have an account?{' '}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
