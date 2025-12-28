import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import LanguageSwitcher from './LanguageSwitcher';

const Navbar: React.FC = () => {
  const { user, logout, loading } = useAuth();
  const nav = useNavigate();
  const { t } = useI18n();
  return (
    <div className="navbar">
      <div className="brand">
        <span className="brand-pip" />
        {t('nav.brand')}
      </div>
      {user && (
        <div className="right">
          <Link to="/arena" className="nav-link">{t('nav.arena')}</Link>
          <Link to="/rl" className="nav-link">{t('nav.rl')}</Link>
          <Link to="/notes" className="nav-link">{t('nav.notes')}</Link>
          <Link to="/eval" className="nav-link">{t('nav.eval')}</Link>
          <LanguageSwitcher compact />
          <span className="nav-user">{user.email}</span>
          <button onClick={async () => { await logout(); nav('/login'); }} disabled={loading}>{t('nav.logout')}</button>
        </div>
      )}
    </div>
  );
};

export default Navbar;
