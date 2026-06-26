import React, { useState } from 'react';
import { SUPPORTED_LANGUAGES, changeLanguage } from '@/i18n';
import { useTranslation } from 'react-i18next';

interface LanguageSelectorProps {
  onClose?: () => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ onClose }) => {
  const { i18n } = useTranslation();
  const [currentLang, setCurrentLang] = useState(i18n.language);

  const handleLanguageChange = async (lng: string) => {
    setCurrentLang(lng);
    await changeLanguage(lng);
    onClose?.();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Language / 语言</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        <div className="dialog-body">
          <div className="language-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '8px',
          }}>
            {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                style={{
                  padding: '8px 12px',
                  border: currentLang === code ? '2px solid #007bff' : '1px solid #ccc',
                  borderRadius: '4px',
                  backgroundColor: currentLang === code ? '#e3f2fd' : '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: currentLang === code ? 'bold' : 'normal' }}>{name}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>{code}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
