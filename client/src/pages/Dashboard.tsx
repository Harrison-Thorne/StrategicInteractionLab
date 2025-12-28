import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [message, setMessage] = useState<string>('');
  const { t } = useI18n();

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
            alt={t('dashboard.artAlt')}
          />
          <div className="dashboard-art-label">{t('dashboard.artLabel')}</div>
        </div>
        <div className="section-header">
          <div>
            <h2 className="page-title">{t('dashboard.greeting', { email: user?.email ?? '' })}</h2>
            <p className="page-subtitle">{message || '...'}</p>
          </div>
          <div className="section-meta">
            <div className="pill">
              <span className="pill-dot" />
              🧪 {t('dashboard.live')}
            </div>
            <div className="pill">
              <span className="pill-dot accent" />
              🎲 {t('dashboard.gameTheory')}
            </div>
          </div>
        </div>
        <div className="metric-grid">
          <div className="metric-item">
            <div className="metric-label">{t('dashboard.metricEpisodes')}</div>
            <div className="metric-value">
              <span className="metric-icon">Σ</span>
              1,280
            </div>
            <div className="metric-chip-row">
              <span className="pill" style={{ padding: '0.15rem 0.55rem' }}>{t('dashboard.metricEpisodesChip')}</span>
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-label">{t('dashboard.metricStrategies')}</div>
            <div className="metric-value">
              <span className="metric-icon">π</span>
              12
            </div>
            <div className="metric-chip-row">
              <span className="pill" style={{ padding: '0.15rem 0.55rem' }}>{t('dashboard.metricStrategiesChip')}</span>
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-label">{t('dashboard.metricEval')}</div>
            <div className="metric-value">
              <span className="metric-icon">★</span>
              36
            </div>
            <div className="metric-chip-row">
              <span className="pill" style={{ padding: '0.15rem 0.55rem' }}>{t('dashboard.metricEvalChip')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
