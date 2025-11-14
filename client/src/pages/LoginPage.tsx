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
    <div className="container" style={{ maxWidth: 420, marginTop: '12vh' }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Login</h2>
        <form onSubmit={onSubmit} className="col">
          <label>
            <div className="muted">Email</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            <div className="muted">Password</div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="muted" style={{ color: '#f87171' }}>{error}</div>}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button type="button" onClick={fillTest}>Use Test Account</button>
            <button type="submit" className="primary" disabled={loading}>Login</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;

