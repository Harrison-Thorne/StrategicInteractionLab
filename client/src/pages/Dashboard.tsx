import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../auth/AuthContext';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    async function run() {
      try {
        const res = await api.get('/api/hello');
        setMessage(res.data?.message || '');
      } catch (e) { // eslint-disable-line @typescript-eslint/no-unused-vars
        setMessage('');
      }
    }
    run();
  }, []);

  return (
    <div className="container page-animate">
      <div className="card dashboard-card">
        <div className="dashboard-art">
          <img
            src="https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=800&q=80"
            alt="Interactive data visualization"
          />
          <div className="dashboard-art-label">Multi-agent dynamics</div>
        </div>
        <div className="section-header">
          <div>
            <h2 className="page-title">Hi, {user?.email}</h2>
            <p className="page-subtitle">{message || '...'}</p>
          </div>
          <div className="section-meta">
            <div className="pill">
              <span className="pill-dot" />
              🧪 Live Lab Session
            </div>
            <div className="pill">
              <span className="pill-dot accent" />
              🎲 Game-theoretic Experiments
            </div>
          </div>
        </div>
        <div className="metric-grid">
          <div className="metric-item">
            <div className="metric-label">Simulated Episodes (demo)</div>
            <div className="metric-value">
              <span className="metric-icon">Σ</span>
              1,280
            </div>
            <div className="metric-chip-row">
              <span className="pill" style={{ padding: '0.15rem 0.55rem' }}>RPS / MP / PD</span>
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-label">Strategies Tracked</div>
            <div className="metric-value">
              <span className="metric-icon">π</span>
              12
            </div>
            <div className="metric-chip-row">
              <span className="pill" style={{ padding: '0.15rem 0.55rem' }}>Hedge · Regret · FP</span>
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-label">Evaluation Runs</div>
            <div className="metric-value">
              <span className="metric-icon">★</span>
              36
            </div>
            <div className="metric-chip-row">
              <span className="pill" style={{ padding: '0.15rem 0.55rem' }}>Exploration snapshot</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
