import React from 'react';
import { useI18n } from '../i18n';

const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { lang, setLang, t } = useI18n();
  const wrapperClass = compact ? 'lang-switcher compact' : 'lang-switcher';
  return (
    <div className={wrapperClass}>
      {!compact && <span className="muted">{t('common.language')}</span>}
      <div className="lang-switcher-buttons">
        <button
          type="button"
          className={lang === 'en' ? 'active' : ''}
          onClick={() => setLang('en')}
        >
          {t('lang.en')}
        </button>
        <button
          type="button"
          className={lang === 'zh' ? 'active' : ''}
          onClick={() => setLang('zh')}
        >
          {t('lang.zh')}
        </button>
      </div>
    </div>
  );
};

export default LanguageSwitcher;
