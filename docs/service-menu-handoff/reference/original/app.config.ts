import {Config} from './src/types/config';
import {detectInitialLanguageFromDevice} from './src/utils/deviceLanguage';

// Pre pevné nastavenie jazyka pri prvom spustení aplikácie
// Ak je nastavené, použije sa tento jazyk namiesto detekcie zo zariadenia
// Ak je undefined alebo prázdny string, použije sa automatická detekcia
export const FORCE_INITIAL_LANGUAGE: string | undefined = 'sk'; // Jazyk sa nastaví dynamicky z procedúry init

export const BROKER_URL_PROD = 'ssl://mqtt.agevolt.com:8883';
export const BROKER_URL_UAT = 'tcp://mqtt-staging.agevolt.com';

export const isProd = false;
export const isUat = true;

const domain = isProd
  ? 'agevolt.com'
  : isUat
  ? 'my.agevolt.com'
  : 'dev-ec1.agevolt.com';

export const appConfig: Config = {
  /** Legacy FW upload (CMD 1–4); false = CMD 65 + 68–71 (bez CMD 01 pred prenosom) */
  useLegacyFwUpdatingFlow: false,
  apiUrl: 'https://api.' + domain,
  // apiUrl: 'http://192.168.0.207:8266',
  // apiUrl: 'http://localhost:8266',
  api1Url: 'https://api1.' + domain,
  appType: 'TOUCHPOINT_CLIENT',
  origin: domain,
  // origin: 'localhost', // na testovanie platieb
  appIdentifier: 'agevolt',
  facebookRedirectLink: 'https://my.agevolt.com/auth/login',
  country: 'SVK',
  // AUTO: Ak je FORCE_INITIAL_LANGUAGE nastavený, použije sa ten; inak SK pre zariadenia SK/CZ, inak EN
  language: detectInitialLanguageFromDevice(FORCE_INITIAL_LANGUAGE),
  availableLanguages: ['sk', 'en'],
  appVersion: '4.6.0 (160)',
  tpVersion: '1.45',
  tpClientVersion: '1.0.24 (171)',
  location: {lat: 48.16879708609126, lng: 17.129568606008743},
  // Google OAuth Web Client ID - potrebné pre natívny Google Sign-In na Androide
  // Získaj z Google Cloud Console: https://console.cloud.google.com/apis/credentials
  // Typ: "Web application" (nie Android!)
  googleWebClientId:
    '170540526959-jlo6csmtjslthf5225mmq2v6qr1t271j.apps.googleusercontent.com',
  // Google OAuth iOS Client ID - potrebné pre natívny Google Sign-In na iOS
  // Získaj z Google Cloud Console: https://console.cloud.google.com/apis/credentials
  // Typ: "iOS" - musí mať správny Bundle ID (com.agevolt.agevoltplus)
  googleIosClientId:
    '170540526959-7nk8130mtrcn6movl3tmge67o9kh50gi.apps.googleusercontent.com',
};
