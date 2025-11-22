import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const LoginPage: React.FC = () => {
  const { login, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      nav('/');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Login failed');
    }
  }

  function fillTest() {
    setEmail('test@example.com');
    setPassword('123456');
  }

  return (
    <div className="auth-page">
      <div className="card auth-card page-animate">
        <h2 className="auth-title">Login</h2>
        <p className="auth-subtitle muted">Sign in to StrategicInteractionLab</p>
        <form onSubmit={onSubmit} className="col">
          <label>
            <div className="muted">Email</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            <div className="muted">Password</div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button type="button" onClick={fillTest}>Use Test Account</button>
            <button type="submit" className="primary" disabled={loading}>Login</button>
          </div>
        </form>
        <div className="auth-extra">
          <div className="auth-extra-row">
            <div className="auth-extra-item">
              Session-aware arena with
              <br />
              repeated game simulations
            </div>
            <div className="auth-extra-item">
              Evaluation suite for
              <br />
              online learning algorithms
            </div>
            <div className="auth-extra-item">
              Personal notes to capture
              <br />
              experiment observations
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
