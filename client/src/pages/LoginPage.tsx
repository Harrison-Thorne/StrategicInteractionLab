import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

const LoginPage: React.FC = () => {
  const { login, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      nav('/');
    } catch (err: any) {
      setError(err?.response?.data?.error || t('login.error'));
    }
  }

  function fillTest() {
    setEmail('test@example.com');
    setPassword('123456');
  }

  return (
    <div className="auth-page">
      <div className="auth-lang-row">
        <LanguageSwitcher />
      </div>
      <div className="card auth-card page-animate">
        <h2 className="auth-title">{t('login.title')}</h2>
        <p className="auth-subtitle muted">{t('login.subtitle')}</p>
        <form onSubmit={onSubmit} className="col">
          <label>
            <div className="muted">{t('login.email')}</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            <div className="muted">{t('login.password')}</div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button type="button" onClick={fillTest}>{t('login.useTest')}</button>
            <button type="submit" className="primary" disabled={loading}>{t('login.submit')}</button>
          </div>
        </form>
        <div className="auth-extra">
          <div className="auth-extra-row">
            <div className="auth-extra-item">
              {t('login.session')}
              <br />
              &nbsp;
            </div>
            <div className="auth-extra-item">
              {t('login.eval')}
              <br />
              &nbsp;
            </div>
            <div className="auth-extra-item">
              {t('login.notes')}
              <br />
              &nbsp;
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
