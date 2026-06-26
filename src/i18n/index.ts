import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN/common.json';
import enUS from './locales/en-US/common.json';

/** 支持的语言列表 */
export const SUPPORTED_LANGUAGES: Record<string, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
  'zh-TW': '繁體中文',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'fr-FR': 'Français',
  'de-DE': 'Deutsch',
  'es-ES': 'Español',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  'it-IT': 'Italiano',
  'nl-NL': 'Nederlands',
  'pl-PL': 'Polski',
  'ru-RU': 'Русский',
  'uk-UA': 'Українська',
  'cs-CZ': 'Čeština',
  'sk-SK': 'Slovenčina',
  'hu-HU': 'Magyar',
  'ro-RO': 'Română',
  'bg-BG': 'Български',
  'hr-HR': 'Hrvatski',
  'sr-SP': 'Српски',
  'sl-SI': 'Slovenščina',
  'sv-SE': 'Svenska',
  'nb-NO': 'Norsk Bokmål',
  'da-DK': 'Dansk',
  'fi-FI': 'Suomi',
  'tr-TR': 'Türkçe',
  'ar-SA': 'العربية',
  'he-IL': 'עברית',
  'th-TH': 'ไทย',
  'vi-VN': 'Tiếng Việt',
  'id-ID': 'Bahasa Indonesia',
  'ms-MY': 'Bahasa Melayu',
  'hi-IN': 'हिन्दी',
  'bn-IN': 'বাংলা',
  'ta-IN': 'தமிழ்',
  'el-GR': 'Ελληνικά',
  'ca-ES': 'Català',
  'eu-ES': 'Euskara',
  'gl-ES': 'Galego',
  'af-ZA': 'Afrikaans',
};

/** 动态加载语言包 */
const dynamicImports: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  'zh-TW': () => import('./locales/zh-TW/common.json'),
  'ja-JP': () => import('./locales/ja-JP/common.json'),
  'ko-KR': () => import('./locales/ko-KR/common.json'),
  'fr-FR': () => import('./locales/fr-FR/common.json'),
  'de-DE': () => import('./locales/de-DE/common.json'),
  'es-ES': () => import('./locales/es-ES/common.json'),
  'pt-BR': () => import('./locales/pt-BR/common.json'),
  'pt-PT': () => import('./locales/pt-PT/common.json'),
  'it-IT': () => import('./locales/it-IT/common.json'),
  'nl-NL': () => import('./locales/nl-NL/common.json'),
  'pl-PL': () => import('./locales/pl-PL/common.json'),
  'ru-RU': () => import('./locales/ru-RU/common.json'),
  'uk-UA': () => import('./locales/uk-UA/common.json'),
  'cs-CZ': () => import('./locales/cs-CZ/common.json'),
  'sk-SK': () => import('./locales/sk-SK/common.json'),
  'hu-HU': () => import('./locales/hu-HU/common.json'),
  'ro-RO': () => import('./locales/ro-RO/common.json'),
  'bg-BG': () => import('./locales/bg-BG/common.json'),
  'hr-HR': () => import('./locales/hr-HR/common.json'),
  'sr-SP': () => import('./locales/sr-SP/common.json'),
  'sl-SI': () => import('./locales/sl-SI/common.json'),
  'sv-SE': () => import('./locales/sv-SE/common.json'),
  'nb-NO': () => import('./locales/nb-NO/common.json'),
  'da-DK': () => import('./locales/da-DK/common.json'),
  'fi-FI': () => import('./locales/fi-FI/common.json'),
  'tr-TR': () => import('./locales/tr-TR/common.json'),
  'ar-SA': () => import('./locales/ar-SA/common.json'),
  'he-IL': () => import('./locales/he-IL/common.json'),
  'th-TH': () => import('./locales/th-TH/common.json'),
  'vi-VN': () => import('./locales/vi-VN/common.json'),
  'id-ID': () => import('./locales/id-ID/common.json'),
  'ms-MY': () => import('./locales/ms-MY/common.json'),
  'hi-IN': () => import('./locales/hi-IN/common.json'),
  'bn-IN': () => import('./locales/bn-IN/common.json'),
  'ta-IN': () => import('./locales/ta-IN/common.json'),
  'el-GR': () => import('./locales/el-GR/common.json'),
  'ca-ES': () => import('./locales/ca-ES/common.json'),
  'eu-ES': () => import('./locales/eu-ES/common.json'),
  'gl-ES': () => import('./locales/gl-ES/common.json'),
  'af-ZA': () => import('./locales/af-ZA/common.json'),
};

/** 加载指定语言（懒加载） */
export async function loadLanguage(lng: string): Promise<void> {
  if (i18n.hasResourceBundle(lng, 'translation')) return;
  const loader = dynamicImports[lng];
  if (!loader) return;
  const mod = await loader();
  i18n.addResourceBundle(lng, 'translation', mod.default, true, true);
}

/** 切换语言 */
export async function changeLanguage(lng: string): Promise<void> {
  await loadLanguage(lng);
  await i18n.changeLanguage(lng);
}

/** 获取系统语言（匹配支持的语言） */
export function getSystemLanguage(): string {
  const sysLang = navigator.language || 'en-US';
  // 精确匹配
  if (SUPPORTED_LANGUAGES[sysLang]) return sysLang;
  // 语言前缀匹配 (如 zh -> zh-CN)
  const prefix = sysLang.split('-')[0];
  const match = Object.keys(SUPPORTED_LANGUAGES).find(k => k.startsWith(prefix));
  return match || 'en-US';
}

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: getSystemLanguage(),
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
});

export default i18n;
