import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { StatusBar } from 'expo-status-bar';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  Text as RNTextBase,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  INFO_BLOCK_IDS,
  type ConnectorStatus,
  type InfoBlockId,
  type LanguageCode,
  t,
  tInfoBlock,
} from './i18n';
import { BubbleSnapScroll, BUBBLE_SNAP_SCROLL_FAB_RIGHT_INFO } from './BubbleSnapScroll';
import {
  getConnectorOverviewStatusLabel,
  isBlockedByStationStatus,
  isConnectCountdownStatus,
  isConnectorSessionVehicleBubbleStatus,
  isFaultWithTransactionStatus,
  isFaultWithoutTransactionStatus,
  isFinishedByVehicleStatus,
  isTxActiveStatus,
  nextMockConnectorStatus,
  normalizeConnectorStatus,
} from './connectorStatus';
import { KioskViewport } from './KioskViewport';
import { KIOSK_WIDTH, SCREEN_SCROLL_VERTICAL } from './kioskSpec';
import {
  SERVICE_PIN,
  SERVICE_PIN_LENGTH,
  TRANSACTION_SESSION_PIN,
  TRANSACTION_SESSION_PIN_LENGTH,
} from './serviceMenu/pins';
import { LocalQrCode } from './LocalQrCode';
import {
  buildStationConnectorDecision,
  findRfidAccountByCredentials,
  findVehicleById,
  getSpacesForStationAccount,
  getStationCardSnapshot,
  isTxAuthorizedForRfidUid,
} from './rfidStationLogic';
import type {
  ConnectorRfidAccountPolicy,
  MockAccount,
  MockRfidCard,
  MockSpace,
  MockVehicle,
  StationCardAccessMode,
  StationCardSnapshot,
  StationConnectorDecision,
} from './rfidStationTypes';

function formatVehicleOneLine(v: { plate: string; name?: string }): string {
  const p = (v.plate ?? '').trim();
  const n = (v.name ?? '').trim();
  if (p.length > 0 && n.length > 0) return `${p} | ${n}`;
  if (n.length > 0) return n;
  return p;
}

type StationVehicleUi = { kind: 'vehicle'; vehicleId: string } | { kind: 'without' };

/** Web: žiadny výber textu myšou (klávesnica, štítky; Modaly mimo hlavného stromu). */
const KIOSK_NO_SELECT_WEB: TextStyle =
  Platform.OS === 'web' ? ({ userSelect: 'none', WebkitUserSelect: 'none' } as TextStyle) : {};

/** Medzi dvoma klepnutiami na logo: ak je medzera dlhšia, počítadlo sa vynuluje (sekvencia 5× začína odznova). */
const LOGO_SERVICE_TAP_GAP_MS = 5000;

/** `Alert.alert` na webe nerobí nič (RN len iOS/Android). */
function showKioskToastAlert(title: string, message?: string) {
  const m = message?.trim() ?? '';
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(m ? `${title}\n\n${m}` : title);
    }
  } else {
    Alert.alert(title, m || undefined);
  }
}

/** Web test: Ctrl+A–D = simulácia RFID (CustomEvent). Presety konektorov v `applyDevRfidConnectorPresetForTag`. */
const DEV_RFID_TAP_EVENT = 'agevolt-dev-rfid-tap';
/** Známa aktívna, TX na ľavom konektore (charging, linkedCardUid = táto karta). */
const DEV_RFID_TAG_CTRL_A = 'TESTCTRL_AA';
/** Známa aktívna, žiadna TX priradená tejto karte (iná karta nabíja vpravo). */
const DEV_RFID_TAG_CTRL_B = 'TESTCTRL_BB';
/** Známa blokovaná, bez TX. */
const DEV_RFID_TAG_CTRL_C = 'TESTCTRL_CC';
/** Neznáma karta. */
const DEV_RFID_TAG_CTRL_D = 'TESTCTRL_DD';
const DEV_RFID_TEST_TAGS = new Set([
  DEV_RFID_TAG_CTRL_A,
  DEV_RFID_TAG_CTRL_B,
  DEV_RFID_TAG_CTRL_C,
  DEV_RFID_TAG_CTRL_D,
]);
/** Dĺžka zobrazenia fajky / zamietnutia pred začatím fade-outu (simulácia priloženia karty). */
const RFID_TAP_FEEDBACK_SHOW_MS = 2000;
/** Musí pokrývať `animationType="fade"` na modále — inak zmizne ikona skôr než overlay a ostane prázdny rámček. */
const RFID_MODAL_FADE_OUT_MS = 320;
/** Po úplnom zhasnutí modálu ešte nepúšťať ďalšie priloženie (Ctrl+A–D). */
const RFID_TAP_POST_MODAL_COOLDOWN_MS = 1000;
/** Predvyplnenie pri kroku „Prihlásiť do konta“ — zodpovedá `acc-jozef` v mock konfigurácii. */
const STATION_RFID_PREFILL_LOGIN = 'jozef';
const STATION_RFID_PREFILL_PASSWORD = 'heslo123';

/** Jeden kontext + `resume()` pred každým beepom — nový AudioContext pri každom tuku často ostane `suspended` a zvuk neznie. */
let rfidTapAudioContext: AudioContext | null = null;

function getRfidTapAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const W = window as unknown as {
      AudioContext: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AC = W.AudioContext ?? W.webkitAudioContext;
    if (!AC) return null;
    if (!rfidTapAudioContext || rfidTapAudioContext.state === 'closed') {
      rfidTapAudioContext = new AC();
    }
    return rfidTapAudioContext;
  } catch {
    return null;
  }
}

function playRfidTapSound(accepted: boolean): void {
  const ctx = getRfidTapAudioContext();
  if (!ctx) return;
  const beep = (freq: number, t0: number, dur: number, vol: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + t0);
    osc.stop(ctx.currentTime + t0 + dur);
  };
  void ctx.resume().then(() => {
    try {
      if (ctx.state === 'closed') return;
      if (accepted) {
        beep(880, 0, 0.055, 0.11);
        beep(1180, 0.07, 0.07, 0.1);
      } else {
        beep(200, 0, 0.1, 0.12);
        beep(160, 0.14, 0.12, 0.11);
      }
    } catch {
      /* ignore */
    }
  });
}

function RNText(props: React.ComponentProps<typeof RNTextBase>) {
  const { style, selectable: _s, ...rest } = props;
  return <RNTextBase {...rest} selectable={false} style={[KIOSK_NO_SELECT_WEB, style]} />;
}

type Screen =
  | 'home'
  | 'language'
  | 'support'
  | 'info'
  | 'qr'
  | 'servicePin'
  | 'serviceSettings'
  | 'serviceSystem'
  | 'serviceConnections'
  | 'serviceStation'
  | 'serviceOperator'
  | 'serviceOcppConfig'
  | 'serviceFirmware'
  | 'serviceConnectors'
  | 'serviceConnectorOverview'
  | 'serviceConnectorEvm'
  | 'serviceConnectorEvmManual'
  | 'serviceConnectorElm'
  | 'serviceConnectorOcpp'
  | 'serviceConnectorPolicy'
  | 'serviceConnectorTx'
  | 'serviceBrowser';

const CONNECTOR_IDLE_SCREENS: Screen[] = ['home', 'language', 'support', 'info', 'qr'];

/** Clear connector scope after this long with no pointer activity (any touch on the kiosk shell resets the timer). */
const CONNECTOR_SCOPE_IDLE_MS = 60_000;

type NetworkType = 'wifi' | '4g' | 'eth';
type IconType = 'regular' | 'solid';
type OcppConnectionState = 'ok' | 'connecting' | 'offline';
type QrTarget = {
  title: string;
  value: string;
  returnTo: Screen;
  showPaymentOptions: boolean;
};
type HelpId = InfoBlockId;
type HelpSectionType = 'standard' | 'important' | 'locate';
type HelpSection = {
  type: HelpSectionType;
  title: string;
  body: string;
};
type HelpPage = {
  id: HelpId;
  title: string;
  intro: string;
  sections: HelpSection[];
};

type PublicPolicy = {
  price: number;
  sessionFee: number;
  parkingPerHour: number;
  graceMinutes: number;
  graceFrom: 'start' | 'end';
  occupyPerHour: number;
};

type ActiveTx = {
  id: string;
  chargingTime: string;
  costWithVat: number;
  /** Z BE: jednotková cena za kWh pre túto transakciu (len pri spoplatnenom / zdieľanom prístupe). */
  pricePerKwh?: number | null;
  /** Z BE: ďalšie poplatky (session, parkovanie, …). Ak chýba, odvodí sa z `publicPolicy`. */
  hasAdditionalFees?: boolean;
  /** RFID tag ktorý spustil TX (autorizácia v modáli). */
  rfidTag?: string | null;
  /** Nadradený tag (pool) pri TX. */
  parentTag?: string | null;
  linkedCardUid?: string | null;
  accountId?: string | null;
  vehicleId?: string | null;
  vehiclePlate?: string | null;
  vehicleName?: string | null;
  driverEmail?: string | null;
  accessMode?: StationCardAccessMode | 'eroaming' | null;
};

type TpConnector = {
  id: string;
  evseCpoId: string;
  parkingSpot: string;
  chargingLink?: string;
  plugType: string;
  powerType: 'AC' | 'DC';
  phases: 1 | 3;
  maxAmps: number;
  access: {
    unauthorizedFreeCharging: boolean;
    publicCharging: boolean;
    roamingCharging: boolean;
    privateCharging: boolean;
  };
  hasPublicPolicy: boolean;
  /** eRoaming / Hubject: ak true, môžu štartovať aj karty z eroamingEmpList */
  hasEroamingHubject?: boolean;
  /** Zoznam EMP / operátorov pre eRoaming karty (zobrazí sa pri hasEroamingHubject) */
  eroamingEmpList?: string[];
  publicPolicy: PublicPolicy;
  budgetAmps?: number;
  vehicleSignalV?: 12 | 9 | 6;
  connectTimeoutSec?: number;
  txTotalSec?: number;
  chargingActiveSec?: number;
  meter: { power: number; energy: number };
  ocpp: { status: ConnectorStatus; _status?: ConnectorStatus[] };
  rfidAccountPolicies?: ConnectorRfidAccountPolicy[];
  activeTx: ActiveTx | null;
};

type TouchpointMockConfig = {
  system?: {
    networkOnline?: boolean;
    activeNetwork?: NetworkType;
    iconType?: IconType;
    ocppConnectionState?: OcppConnectionState;
  };
  operator: {
    owner: { name: string };
    provider: { logo: string; name?: string };
    helpdeskNumber: string;
    helpdeskEmail: string;
    appleStoreLink?: string;
    androidStoreLink?: string;
    chargingLink?: string;
  };
  station: {
    location?: { name?: string };
    name?: string;
    ocppDeviceId?: string;
    defaultLanguage: Exclude<LanguageCode, 'DEV'>;
    currency: string;
    vatRate: number;
    networkOnline?: boolean;
    networkType?: NetworkType;
  };
  rfidCards: MockRfidCard[];
  accounts: MockAccount[];
  connectors: TpConnector[];
};

type StationRfidStep = 'summary' | 'login' | 'pickSpace' | 'pickVehicle' | 'createVehicle' | 'confirmLink';

const mockConfig = require('./mock-config/touchpoint-home.json') as TouchpointMockConfig;
const AGEVOLT_LOGO = require('./assets/branding/agevolt-logo.png');
const RFID_CARD_ICON = require('./assets/rfid-card.webp');
const APP_ICON_TYPE: IconType = mockConfig.system?.iconType ?? 'solid';
const faProSolid = require('@fortawesome/pro-solid-svg-icons') as Record<string, IconDefinition>;
const faProRegular = require('@fortawesome/pro-regular-svg-icons') as Record<string, IconDefinition>;

const LANGUAGES: LanguageCode[] = ['SK', 'EN', 'DE', 'DEV'];
const SERVICE_LANGUAGE_OPTIONS: Exclude<LanguageCode, 'DEV'>[] = ['SK', 'EN', 'DE'];
const SERVICE_OCPP_MEASURAND_OPTIONS = [
  'Energy.Active.Export.Register',
  'Energy.Active.Import.Register',
  'Energy.Reactive.Export.Register',
  'Energy.Reactive.Import.Register',
  'Energy.Active.Export.Interval',
  'Energy.Active.Import.Interval',
  'Energy.Reactive.Export.Interval',
  'Energy.Reactive.Import.Interval',
  'Power.Active.Export',
  'Power.Active.Import',
  'Power.Offered',
  'Power.Reactive.Export',
  'Power.Reactive.Import',
  'Power.Factor',
  'Current.Import',
  'Current.Export',
  'Current.Offered',
  'Voltage',
  'Frequency',
  'Temperature',
  'SoC',
  'RPM',
] as const;
const SERVICE_CONNECTOR_PHASE_ROTATION_OPTIONS = [
  'NotApplicable',
  'Unknown',
  'RST',
  'RTS',
  'SRT',
  'STR',
  'TRS',
  'TSR',
] as const;
const SERVICE_SK_FIELD_LABELS: Record<string, string> = {
  'system.model': 'Model',
  'system.product': 'Produkt',
  'system.deviceId': 'Device ID',
  'system.tpLifecycleState': 'Stav Touchpointu',
  'system.online': 'Internet',
  'system.activeNetwork': 'Aktívna sieť',
  'system.dataMetered': 'Spoplatnená sieť',
  'system.cellular.internet': 'Dáta',
  'system.wifi.internet': 'Wi-Fi',
  'system.ethernet.internet': 'ETH',
  'system.ocppConnected': 'OCPP online',
  'system.mqttConnected': 'MQTT online',
  'system.rs485ready': 'RS485 ready',
  'system.stat.net.totalRxBytes': 'RX celkom',
  'system.stat.net.totalTxBytes': 'TX celkom',
  'system.stat.net.totalRxBytesLast': 'RX od bootu',
  'system.stat.net.totalTxBytesLast': 'TX od bootu',
  'system.location.point': 'Poloha',
  'connectivity.mqtt.url': 'URL',
  'connectivity.mqtt.topicPublish': 'Publish topic',
  'connectivity.mqtt.topicSubscribe': 'Subscribe topic',
  'connectivity.mqtt.connectionId': 'Connection ID',
  'connectivity.mqtt.deviceId': 'Device ID',
  'connectivity.mqtt.user': 'User',
  'connectivity.mqtt.password': 'Password',
  'connectivity.ocpp.version': 'Verzia',
  'connectivity.ocpp.url': 'URL',
  'connectivity.ocpp.deviceId': 'Device ID',
  'connectivity.ocpp.basicAuth': 'Basic auth',
  'connectivity.ocpp.registrationAccepted': 'Registrácia OK',
  'connectivity.ocpp.serverTimeOffsetMs': 'Offset času',
  'connectivity.ocpp.heartbeatIntervalSec': 'Heartbeat',
  'connectivity.ocpp.bootRetryIntervalSec': 'Boot retry',
  'system.stationBound': 'Stanica naviazaná',
  'station.boundSn': 'SN',
  'station.vendor': 'Výrobca',
  'station.model': 'Model',
  'station.country': 'Krajina',
  'station.defaultLanguage': 'Jazyk',
  'station.timeZone': 'Časová zóna',
  'station.currency': 'Mena',
  'station.fxToEurRate': 'Kurz EUR',
  'station.vatRate': 'DPH',
  'station.modbusMeter': 'Modbus meter',
  'station.meterS0count': 'S0 count',
  'operator.paymentAllowed': 'Platby kartou',
  'operator.owner.name': 'Prevádzkovateľ',
  'operator.helpdeskNumber': 'Helpdesk',
  'operator.appleStoreLink': 'Apple Store',
  'operator.androidStoreLink': 'Google Play',
  'operator.chargingLink': 'Charging link',
  'connectivity.ocpp.key.AllowOfflineTxForUnknownId': 'Unknown ID offline',
  'connectivity.ocpp.key.AuthorizationCacheEnabled': 'Auth cache',
  'connectivity.ocpp.key.AuthorizeRemoteTxRequests': 'Remote auth',
  'connectivity.ocpp.key.LocalAuthorizeOffline': 'Offline auth',
  'connectivity.ocpp.key.LocalPreAuthorize': 'Pre-auth',
  'connectivity.ocpp.key.LocalAuthListEnabled': 'Local auth list',
  'connectivity.ocpp.key.LocalAuthListMaxLength': 'Local list max',
  'connectivity.ocpp.key.SendLocalListMaxLength': 'SendLocalList max',
  'connectivity.ocpp.key.MaxEnergyOnInvalidId': 'Max energia invalid ID',
  'connectivity.ocpp.key.StopTransactionOnInvalidId': 'Stop na invalid ID',
  'connectivity.ocpp.key.BlinkRepeat': 'Blink repeat',
  'connectivity.ocpp.key.ClockAlignedDataInterval': 'Clock aligned',
  'connectivity.ocpp.key.ConnectionTimeOut': 'Connect timeout',
  'connectivity.ocpp.key.GetConfigurationMaxKeys': 'GetConfig max',
  'connectivity.ocpp.key.HeartbeatInterval': 'Heartbeat',
  'connectivity.ocpp.key.LightIntensity': 'LED intenzita',
  'connectivity.ocpp.key.MeterValueSampleInterval': 'Sample interval',
  'connectivity.ocpp.key.MinimumStatusDuration': 'Min. status',
  'connectivity.ocpp.key.ResetRetries': 'Reset retries',
  'connectivity.ocpp.key.TransactionMessageAttempts': 'TX attempts',
  'connectivity.ocpp.key.TransactionMessageRetryInterval': 'TX retry',
  'connectivity.ocpp.key.WebSocketPingInterval': 'WS ping',
  'connectivity.ocpp.key.MeterValuesAlignedData': 'Aligned data',
  'connectivity.ocpp.key.MeterValuesAlignedDataMaxLength': 'Aligned max',
  'connectivity.ocpp.key.MeterValuesSampledData': 'Sampled data',
  'connectivity.ocpp.key.MeterValuesSampledDataMaxLength': 'Sampled max',
  'connectivity.ocpp.key.StopTxnAlignedData': 'Stop aligned',
  'connectivity.ocpp.key.StopTxnAlignedDataMaxLength': 'Stop aligned max',
  'connectivity.ocpp.key.StopTxnSampledData': 'Stop sampled',
  'connectivity.ocpp.key.StopTxnSampledDataMaxLength': 'Stop sampled max',
  'connectivity.ocpp.key.NumberOfConnectors': 'Počet konektorov',
  'connectivity.ocpp.key.ConnectorPhaseRotationMaxLength': 'Phase rot. max',
  'connectivity.ocpp.key.StopTransactionOnEVSideDisconnect': 'Stop po odpojení EV',
  'connectivity.ocpp.key.UnlockConnectorOnEVSideDisconnect': 'Unlock po odpojení',
  'connectivity.ocpp.key.SupportedFeatureProfiles': 'Feature profily',
  'connectivity.ocpp.key.SupportedFeatureProfilesMaxLength': 'Profiles max',
  'connectivity.ocpp.key.ReserveConnectorZeroSupported': 'Reserve 0',
  'connectivity.ocpp.key.ChargeProfileMaxStackLevel': 'Profile stack',
  'connectivity.ocpp.key.ChargingScheduleAllowedChargingRateUnit': 'Rate unit',
  'connectivity.ocpp.key.ChargingScheduleMaxPeriods': 'Schedule max',
  'connectivity.ocpp.key.ConnectorSwitch3to1PhaseSupported': '3->1 phase',
  'connectivity.ocpp.key.MaxChargingProfilesInstalled': 'Profiles max count',
  'system.fwUpdate.status': 'Stav',
  'system.fwUpdate.fileVersion': 'Verzia súboru',
  'system.fwUpdate.moduleProgress': 'Priebeh',
  'firmware.fileName': 'Súbor',
  'firmware.sendState': 'Odosielanie',
  'connector[].evseCpoId': 'EVSE ID',
  'connector[].powerType': 'Typ výkonu',
  'connector[].plugType': 'Konektor',
  'connector[].maxAmps': 'Max prúd',
  'connector[].parkingSpot': 'Miesto',
  'connector[].evm.state': 'Stav EVM',
  'connector[].meter.state': 'Stav meter',
  'connector[].ocpp.status': 'OCPP stav',
  'connector[].activeTx.id': 'TX ID',
  'connector[].evm.manual.enabled': 'Manual',
  'connector[].hasPublicPolicy': 'Public policy',
  'connector[].hasEroamingHubject': 'Hubject',
  'connector[].phases': 'Fázy',
  'connector[].publicPolicy.validNow': 'Policy now',
  'connector[].publicPolicy.price': 'Cena',
  'connector[].publicPolicy.validTo': 'Platí do',
  'connector[].evm.lastResponse': 'Posl. odpoveď',
  'connector[].evm.budget': 'Budget',
  'connector[].evm.rcdEnabled': 'RCD',
  'connector[].evm.permanentLock': 'Permanent lock',
  'connector[].evm.fw.version': 'FW verzia',
  'connector[].evm.hwAddress': 'HW adresa',
  'connector[].evm.cibEnabled': 'CIB',
  'connector[].evm.cpV': 'CP V',
  'connector[].evm.rcdErr': 'RCD chyba',
  'connector[].evm.do1': 'DO1',
  'connector[].evm.do2': 'DO2',
  'connector[].evm.lock': 'Lock',
  'connector[].evm.manual.budget': 'Manual budget',
  'connector[].evm.manual.do1': 'Manual DO1',
  'connector[].evm.manual.do2': 'Manual DO2',
  'connector[].evm.manual.lock': 'Manual lock',
  'connector[].evm.manual.ignoreRcd': 'Ignore RCD',
  'connector[].meter.lastResponse': 'Posl. odpoveď',
  'connector[].meter.energy': 'Energia',
  'connector[].meter.energy.phase[]': 'Energia fázy',
  'connector[].meter.voltage.phase[]': 'Napätie fázy',
  'connector[].meter.power': 'Výkon',
  'connector[].meter.power.phase[]': 'Výkon fázy',
  'connector[].meter.current.phase[]': 'Prúd fázy',
  'connector[].meter.countImp': 'Impulzy',
  'connector[].meter.countImpLast': 'Impulzy last',
  'connector[].ocpp.statusLastSent': 'Posl. odoslaný',
  'connector[].ocpp.statusChangedAt': 'Zmena od',
  'connector[].eroamingEmpList': 'EMP list',
  'connector[].publicPolicy.policyEndUtc': 'Policy end',
  'connector[].publicPolicy.withoutTimeSchedule': 'Bez schedule',
  'connector[].publicPolicy.scheduleActiveNow': 'Schedule now',
  'connector[].publicPolicy.schedule[]': 'Schedule',
  'connector[].activeTx.hasReachedCharging': 'Prešlo do charge',
  'connector[].activeTx.meterValueStartWh': 'Meter start',
  'connector[].activeTx.meterValueEndWh': 'Meter end',
  'connector[].activeTx.tagId': 'Tag',
  'connector[].activeTx.userId': 'User',
  'connector[].activeTx.avPolicyType': 'Policy typ',
  'connector[].activeTx.priceMeta': 'Price meta',
  'connector[].activeTx.chargingTime': 'Čas nabíjania',
  'connector[].activeTx.suspendedByUserTime': 'Pauza user',
  'connector[].activeTx.vatRate': 'DPH',
  'connector[].activeTx.costWithVat': 'Cena s DPH',
  'connector[].activeTx.chargingStartTs': 'Štart',
  'connector[].activeTx.chargingEndTs': 'Koniec',
};
type ServiceConnectorSubscreen =
  | 'serviceConnectorOverview'
  | 'serviceConnectorEvm'
  | 'serviceConnectorEvmManual'
  | 'serviceConnectorElm'
  | 'serviceConnectorOcpp'
  | 'serviceConnectorPolicy'
  | 'serviceConnectorTx';
type ServiceConnectorState = {
  evmLastResponse: string;
  evmBudget: number;
  evmRcdEnabled: boolean;
  evmPermanentLock: boolean;
  evmManualEnabled: boolean;
  evmManualBudget: number;
  evmManualDo1: boolean;
  evmManualDo2: boolean;
  evmManualLock: boolean;
  evmManualIgnoreRcd: boolean;
  evmFwVersion: number;
  evmHwAddress: string;
  evmCibEnabled: boolean;
  evmCpV: number;
  evmRcdErr: boolean;
  evmDo1: boolean;
  evmDo2: boolean;
  evmLock: boolean;
  evmState: 'COM_ERR' | 'INIT' | 'FW_UPDATE' | 'MANUAL' | 'AVAILABLE';
  publicPolicyValidNow: boolean;
  publicPolicyValidTo: string;
  publicPolicyPolicyEndUtc: string;
  publicPolicyWithoutTimeSchedule: boolean;
  publicPolicyScheduleActiveNow: boolean;
  publicPolicySchedule: string[];
  meterLastResponse: string;
  meterEnergy: number;
  meterEnergyPhase: number[];
  meterVoltagePhase: number[];
  meterPower: number;
  meterPowerPhase: number[];
  meterCurrentPhase: number[];
  meterCountImp: number;
  meterCountImpLast: number;
  meterState: 'COM_ERR' | 'AVAILABLE' | 'UNAVAILABLE';
  ocppStatusLastSent: string;
  ocppStatusChangedAt: string;
  activeTxHasReachedCharging: boolean;
  activeTxMeterValueStartWh: number;
  activeTxMeterValueEndWh: number;
  activeTxTagId: string;
  activeTxUserId: string;
  activeTxAvPolicyType: string;
  activeTxPriceMeta: Record<string, unknown>;
  activeTxChargingTime: string;
  activeTxSuspendedByUserTime: string;
  activeTxVatRate: number;
  activeTxCostWithVat: number;
  activeTxChargingStartTs: string;
  activeTxChargingEndTs: string | null;
  connectorPhaseRotation: (typeof SERVICE_CONNECTOR_PHASE_ROTATION_OPTIONS)[number];
};
const ContentTextScaleContext = createContext(1);
const ContentIconScaleContext = createContext(1);
const ServiceLanguageContext = createContext<LanguageCode>('SK');

function cycleValue<T extends readonly string[]>(options: T, current: T[number]): T[number] {
  const idx = options.indexOf(current);
  return options[(idx + 1 + options.length) % options.length];
}

function maskServiceSecret(raw: string | null | undefined): string {
  return (raw ?? '').trim() || '—';
}

function serviceLocale(lang: LanguageCode): string {
  return lang === 'DE' ? 'de-DE' : lang === 'EN' ? 'en-GB' : 'sk-SK';
}

function formatServiceNumber(lang: LanguageCode, value: number, digits = 0): string {
  return value.toLocaleString(serviceLocale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatServiceDateTime(lang: LanguageCode, raw: string | null | undefined): string {
  if (!raw) return '—';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return new Intl.DateTimeFormat(serviceLocale(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
}

function serviceFieldLabelText(lang: LanguageCode, key: string): string {
  if (lang === 'DEV') return key;
  if (key.startsWith('connectivity.ocpp.key.ConnectorPhaseRotation.')) {
    const suffix = key.split('.').slice(-1)[0];
    return `Fázy ${suffix}`;
  }
  return SERVICE_SK_FIELD_LABELS[key] ?? key;
}

function serviceHumanValue(lang: LanguageCode, key: string, value: string): string {
  if (lang === 'DEV') return value;
  const map: Record<string, string> = {
    READY: 'Pripravený',
    WAIT_INTERNET: 'Čaká na internet',
    AVAILABLE: 'Dostupný',
    UNAVAILABLE: 'Nedostupný',
    COM_ERR: 'Chyba komunikácie',
    MANUAL: 'Manual',
    INIT: 'Init',
    FW_UPDATE: 'FW update',
    charging: 'Nabíjanie',
    available: 'Voľný',
    preparing: 'Príprava',
    suspendedEV: 'Pozastavené EV',
    suspendedEVSE: 'Pozastavené EVSE',
    faultedWithTransa: 'Chyba s TX',
    faultedWithoutTransa: 'Chyba bez TX',
    wifi: 'Wi-Fi',
    WIFI: 'Wi-Fi',
    eth: 'ETH',
    ETH: 'ETH',
    '4g': 'Dáta',
    shared: 'Zdieľaný',
    public: 'Verejný',
    private: 'Súkromný',
    RUNNING: 'Beží',
  };
  if (key === 'connectivity.ocpp.version' && value === '1.6J') return 'OCPP 1.6J';
  return map[value] ?? value;
}

function buildServiceConnectorState(connector: TpConnector, index: number): ServiceConnectorState {
  const activeTx = connector.activeTx;
  const now = new Date();
  const lastResponse = new Date(now.getTime() - (index + 1) * 17_000).toISOString();
  const meterResponse = new Date(now.getTime() - (index + 1) * 9_000).toISOString();
  const defaultSchedule =
    index % 2 === 0
      ? ['Mon-Fri 07:00-19:00', 'Sat 09:00-12:00']
      : ['Daily 00:00-23:59'];
  return {
    evmLastResponse: lastResponse,
    evmBudget: connector.budgetAmps ?? connector.maxAmps,
    evmRcdEnabled: true,
    evmPermanentLock: index === 1,
    evmManualEnabled: index === 1,
    evmManualBudget: index === 1 ? 10 : 0,
    evmManualDo1: false,
    evmManualDo2: index === 1,
    evmManualLock: index === 1,
    evmManualIgnoreRcd: false,
    evmFwVersion: 53 + index,
    evmHwAddress: index === 0 ? '00A1' : '00B2',
    evmCibEnabled: index === 0,
    evmCpV: connector.vehicleSignalV ?? 12,
    evmRcdErr: false,
    evmDo1: index === 1,
    evmDo2: false,
    evmLock: index === 1,
    evmState: index === 1 ? 'MANUAL' : 'AVAILABLE',
    publicPolicyValidNow: connector.hasPublicPolicy,
    publicPolicyValidTo: new Date(now.getTime() + (index + 2) * 86_400_000).toISOString(),
    publicPolicyPolicyEndUtc: new Date(now.getTime() + (index + 10) * 86_400_000).toISOString(),
    publicPolicyWithoutTimeSchedule: index === 1,
    publicPolicyScheduleActiveNow: connector.hasPublicPolicy,
    publicPolicySchedule: defaultSchedule,
    meterLastResponse: meterResponse,
    meterEnergy: Math.round((connector.meter.energy * 1000 + index * 1420) * 10) / 10,
    meterEnergyPhase: [4520 + index * 140, 4475 + index * 125, 4498 + index * 110],
    meterVoltagePhase: [230.5, 229.8, 231.2],
    meterPower: connector.meter.power,
    meterPowerPhase: [2.7, 2.8, 2.7],
    meterCurrentPhase: [11.4, 11.2, 11.3],
    meterCountImp: 15400 + index * 730,
    meterCountImpLast: 15344 + index * 730,
    meterState: connector.hasPublicPolicy ? 'AVAILABLE' : 'UNAVAILABLE',
    ocppStatusLastSent: connector.ocpp.status,
    ocppStatusChangedAt: new Date(now.getTime() - (index + 1) * 305_000).toISOString(),
    activeTxHasReachedCharging: activeTx != null,
    activeTxMeterValueStartWh: activeTx ? 15220 : 0,
    activeTxMeterValueEndWh: activeTx ? 18435 : 0,
    activeTxTagId: activeTx?.rfidTag ?? '—',
    activeTxUserId: activeTx?.accountId ?? '—',
    activeTxAvPolicyType: activeTx?.accessMode ?? (connector.hasPublicPolicy ? 'public' : 'private'),
    activeTxPriceMeta: activeTx
      ? {
          pricePerKwh: activeTx.pricePerKwh ?? connector.publicPolicy.price,
          hasAdditionalFees: activeTx.hasAdditionalFees ?? false,
        }
      : {},
    activeTxChargingTime: activeTx?.chargingTime ?? '00:00:00',
    activeTxSuspendedByUserTime: activeTx ? '00:03:10' : '00:00:00',
    activeTxVatRate: 0.23,
    activeTxCostWithVat: activeTx?.costWithVat ?? 0,
    activeTxChargingStartTs: activeTx
      ? new Date(now.getTime() - 3_900_000).toISOString()
      : new Date(now.getTime() - 900_000).toISOString(),
    activeTxChargingEndTs: activeTx ? null : new Date(now.getTime() - 240_000).toISOString(),
    connectorPhaseRotation: index === 0 ? 'RST' : 'RTS',
  };
}

function buildInitialServiceConnectorState(connectors: TpConnector[]): Record<string, ServiceConnectorState> {
  return Object.fromEntries(connectors.map((connector, index) => [connector.id, buildServiceConnectorState(connector, index)]));
}

function scaleTextStyle(style: StyleProp<TextStyle>, scale: number): StyleProp<TextStyle> {
  if (scale === 1) return style;
  const flat = StyleSheet.flatten(style);
  if (!flat) return style;
  const next: TextStyle = { ...flat };
  if (typeof next.fontSize === 'number') next.fontSize *= scale;
  if (typeof next.lineHeight === 'number') next.lineHeight *= scale;
  return next;
}

function Text(props: React.ComponentProps<typeof RNTextBase>) {
  const scale = useContext(ContentTextScaleContext);
  const { style, ...rest } = props;
  return <RNText {...rest} style={scaleTextStyle(style, scale)} />;
}

function wordWrap(input: string, maxLines: number, charsPerLine: number): string[] {
  const text = input.trim().replace(/\s+/g, ' ');
  if (!text) return [''];
  const words = text.split(' ');
  if (maxLines <= 1) return [text];
  if (words.length <= 1) return [text];

  const target = Math.max(3, charsPerLine);
  const lines: string[] = [];
  let cur = '';

  for (let i = 0; i < words.length; i += 1) {
    const candidate = cur ? `${cur} ${words[i]}` : words[i];
    if (candidate.length <= target || !cur) {
      cur = candidate;
    } else {
      lines.push(cur);
      cur = words[i];
      if (lines.length >= maxLines - 1) {
        cur = [cur, ...words.slice(i + 1)].join(' ');
        break;
      }
    }
  }
  lines.push(cur);
  return lines.slice(0, maxLines);
}

const CHAR_WIDTH_RATIO = 0.55;

let _measureCanvas: HTMLCanvasElement | null = null;
function measureTextPx(text: string, fontSizePx: number, fontWeight: string): number {
  if (Platform.OS !== 'web') return text.length * fontSizePx * CHAR_WIDTH_RATIO;
  try {
    if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
    const ctx = _measureCanvas.getContext('2d');
    if (!ctx) return text.length * fontSizePx * CHAR_WIDTH_RATIO;
    ctx.font = `${fontWeight} ${fontSizePx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    return ctx.measureText(text).width;
  } catch {
    return text.length * fontSizePx * CHAR_WIDTH_RATIO;
  }
}

/** Najväčší `fontSizePx`, pri ktorom `measureTextPx(text, …) * 1.02` zmestí do `maxTextWidthPx` (jeden riadok, bez …). */
function fitFontSizeForTextWidthPx(
  text: string,
  maxTextWidthPx: number,
  maxFontPx: number,
  minFontPx: number,
  fontWeight: string
): number {
  const safety = 1.02;
  const floorPx = 6;
  if (maxTextWidthPx <= 0 || !text) return Math.max(floorPx, minFontPx);
  if (measureTextPx(text, maxFontPx, fontWeight) * safety <= maxTextWidthPx) return maxFontPx;
  if (measureTextPx(text, minFontPx, fontWeight) * safety > maxTextWidthPx) {
    let lo = floorPx;
    let hi = minFontPx;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const w = measureTextPx(text, mid, fontWeight) * safety;
      if (w <= maxTextWidthPx) lo = mid;
      else hi = mid;
    }
    return Math.max(floorPx, Math.floor(lo * 100) / 100);
  }
  let lo = minFontPx;
  let hi = maxFontPx;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const w = measureTextPx(text, mid, fontWeight) * safety;
    if (w <= maxTextWidthPx) lo = mid;
    else hi = mid;
  }
  return Math.max(minFontPx, Math.floor(lo * 100) / 100);
}

function ZoomAdaptiveText({
  children,
  style,
  zoomMaxLines,
  zoomTargetCharsPerLine,
  zoomMinScale = 0.55,
  allowBaseScaleShrink = true,
  fitSingleLine = false,
  numberOfLines: _nol,
  ellipsizeMode: _em,
  ...rest
}: React.ComponentProps<typeof RNText> & {
  zoomMaxLines: number;
  zoomTargetCharsPerLine: number;
  zoomMinScale?: number;
  allowBaseScaleShrink?: boolean;
  fitSingleLine?: boolean;
}) {
  const widthRef = useRef(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const desiredScale = useContext(ContentTextScaleContext);
  const text = typeof children === 'string' ? children : '';
  const flat = StyleSheet.flatten(style) ?? {};
  const baseFontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
  const fontWeight = String((flat as Record<string, unknown>).fontWeight ?? '400');
  const maxLines = fitSingleLine ? 1 : Math.max(1, zoomMaxLines);
  const maxScale = Math.max(zoomMinScale, desiredScale);
  const minScale = allowBaseScaleShrink || desiredScale > 1 ? Math.min(zoomMinScale, maxScale) : maxScale;

  const measured = containerWidth > 0;
  const isMultiWord = text.trim().includes(' ');
  const targetFontPx = baseFontSize * maxScale;

  function scaleForLines(lines: string[]): number {
    const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b), '');
    if (longest.length === 0) return maxScale;
    if (!measured) return Math.min(maxScale, 1);
    const w = measureTextPx(longest, targetFontPx, fontWeight) * 1.02;
    return w > containerWidth ? Math.max(minScale, maxScale * (containerWidth / w)) : maxScale;
  }

  const singleLines = [text];
  const singleScale = text.length > 0 ? scaleForLines(singleLines) : maxScale;

  let bestLines = singleLines;
  let bestScale = singleScale;

  if (isMultiWord && maxLines >= 2) {
    const multiLines = wordWrap(text, maxLines, zoomTargetCharsPerLine);
    const multiScale = scaleForLines(multiLines);
    if (multiScale > singleScale) {
      bestLines = multiLines;
      bestScale = multiScale;
    }
  }

  const renderedText = bestLines.join('\n');
  const effectiveScale = bestScale;
  const fontSize = Math.max(6, Math.round(baseFontSize * effectiveScale * 100) / 100);
  const lineHeight = Math.max(Math.ceil(fontSize * 1.22), fontSize + 2);

  const flatLayout = flat as Record<string, unknown>;
  const wrapperStyle: Record<string, unknown> = { minWidth: 0, overflow: 'hidden' as const };
  if (flatLayout.flex !== undefined) wrapperStyle.flex = flatLayout.flex;
  if (flatLayout.flexGrow !== undefined) wrapperStyle.flexGrow = flatLayout.flexGrow;
  if (flatLayout.flexShrink !== undefined) wrapperStyle.flexShrink = flatLayout.flexShrink;
  if (flatLayout.alignSelf !== undefined) wrapperStyle.alignSelf = flatLayout.alignSelf;
  if (flatLayout.minWidth !== undefined) wrapperStyle.minWidth = flatLayout.minWidth;
  if (flatLayout.maxWidth !== undefined) wrapperStyle.maxWidth = flatLayout.maxWidth;
  if (flatLayout.width !== undefined) wrapperStyle.width = flatLayout.width;
  if (wrapperStyle.flex === undefined && wrapperStyle.width === undefined) {
    wrapperStyle.alignSelf = wrapperStyle.alignSelf ?? 'stretch';
  }

  const handleLayout = useCallback((event: { nativeEvent: { layout: { width: number } } }) => {
    const w = Math.round(event.nativeEvent.layout.width);
    if (w > 0 && Math.abs(w - widthRef.current) >= 2) {
      widthRef.current = w;
      setContainerWidth(w);
    }
  }, []);

  return (
    <View style={wrapperStyle as ViewStyle} onLayout={handleLayout}>
      <RNText
        {...rest}
        allowFontScaling={false}
        ellipsizeMode="clip"
        numberOfLines={fitSingleLine ? 1 : bestLines.length}
        style={[
          style,
          { fontSize, lineHeight },
          /* Web: bez pred-meraním skrytia — inak môže zostať measured=false a len ikony sú viditeľné. */
          !measured && Platform.OS !== 'web' ? { opacity: 0 } : null,
          Platform.OS === 'web'
            ? ({
                textOverflow: 'clip',
                wordBreak: 'keep-all',
                overflowWrap: 'normal',
                hyphens: 'none',
              } as unknown as TextStyle)
            : null,
        ]}
      >
        {typeof children === 'string' ? renderedText : children}
      </RNText>
    </View>
  );
}

function parseHmsToSec(value: string | undefined): number {
  if (!value) return 0;
  const parts = value.split(':').map((item) => Number(item));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n) || n < 0)) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatSecToHms(totalSec: number): string {
  const clamped = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function devVar(lang: LanguageCode, value: string, key: string): string {
  if (lang === 'DEV') return `{${key}}`;
  return value;
}

function getVisibleInfoBlockIds(connectors: TpConnector[]): HelpId[] {
  const hasFree = connectors.some((c) => c.access.unauthorizedFreeCharging);
  const hasPublic = connectors.some((c) => c.hasPublicPolicy || c.access.publicCharging);
  const hasEroaming = connectors.some(
    (c) => c.hasEroamingHubject && c.access.roamingCharging
  );
  return INFO_BLOCK_IDS.filter((id) => {
    if (id === 'info-free') return hasFree;
    if (id === 'info-pricing') return hasPublic;
    if (id === 'info-eroaming') return hasEroaming;
    return true;
  });
}

function toHelpIndex(initialHelp: number | HelpId, visibleIds?: readonly HelpId[]): number {
  const ids = visibleIds ?? INFO_BLOCK_IDS;
  if (typeof initialHelp === 'number') {
    return Math.max(0, Math.min(ids.length - 1, initialHelp));
  }
  const idx = ids.indexOf(initialHelp);
  return idx < 0 ? 0 : idx;
}

function resolveHelpIdFromContext(selectedConnectorId: string | null, connectors: TpConnector[]): HelpId {
  if (!selectedConnectorId) return 'info-1';
  const c = connectors.find((x) => x.id === selectedConnectorId);
  if (!c) return 'info-1';
  const st = c.ocpp.status;
  if (st === 'charging') return 'info-4';
  if (st === 'available' || st === 'EVconnected') return 'info-2';
  if (st === 'connectEV' || st === 'preparing') return 'info-3';
  if (st === 'suspendedEV') return 'info-6';
  if (st === 'disconnectEV') return 'info-6';
  if (st === 'suspendedEVSE') return 'info-7';
  if (st === 'faultedWithTransa' || st === 'faultedWithoutTransa') return 'info-8';
  return 'info-1';
}

function buildHelpPage(lang: LanguageCode, id: HelpId): HelpPage {
  const prefix = `info.page.${id}`;
  return {
    id,
    title: tInfoBlock(lang, id, 'title'),
    intro: t(lang, `${prefix}.intro`),
    sections: [
      {
        type: 'standard',
        title: t(lang, 'info.reader.section.howto'),
        body: t(lang, `${prefix}.howto`),
      },
      {
        type: 'important',
        title: t(lang, 'info.reader.section.important'),
        body: t(lang, `${prefix}.important`),
      },
      {
        type: 'locate',
        title: t(lang, 'info.reader.section.locate'),
        body: t(lang, `${prefix}.locate`),
      },
    ],
  };
}

const SERVICE_FIRMWARE_GLOBAL_FILE = 'C-EV-2505M-TP-115200+7.tfw';
const SERVICE_FIRMWARE_GLOBAL_VERSION = '5.4.0';

type ServiceFirmwareConnectorMock =
  | { inSync: true }
  | { inSync: false; phase: 'uploading' | 'waiting'; percent: number };

/** Mock: zhoda s globálnym súborom / fáza odosielania do EV modulu konektora. */
const SERVICE_FIRMWARE_CONNECTOR_MOCK: Record<string, ServiceFirmwareConnectorMock> = {
  c1: { inSync: true },
  c2: { inSync: false, phase: 'uploading', percent: 57.3 },
};

function formatServiceFirmwarePercent(lang: LanguageCode, value: number): string {
  const locale = lang === 'DE' ? 'de-DE' : lang === 'EN' ? 'en-GB' : 'sk-SK';
  const s = value.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  return `${s} %`;
}

function serviceFirmwareConnectorStatusText(lang: LanguageCode, connectorId: string): string {
  const mock = SERVICE_FIRMWARE_CONNECTOR_MOCK[connectorId] ?? { inSync: true };
  if (mock.inSync) {
    return t(lang, 'service.firmware.sameAsStation');
  }
  const phaseLabel =
    mock.phase === 'uploading'
      ? t(lang, 'service.firmware.phaseUploading')
      : t(lang, 'service.firmware.phaseWaiting');
  return `${phaseLabel} · ${formatServiceFirmwarePercent(lang, mock.percent)}`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [language, setLanguage] = useState<LanguageCode>(mockConfig.station.defaultLanguage);
  const [infoBlockIndex, setInfoBlockIndex] = useState(0);
  const [infoReturnTarget, setInfoReturnTarget] = useState<Screen>('home');
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null);
  const previousQrTargetRef = useRef<QrTarget | null>(null);
  const [magnifierOn, setMagnifierOn] = useState(false);
  const [servicePinInput, setServicePinInput] = useState('');
  const [servicePinError, setServicePinError] = useState('');
  const [serviceBrowserUrl, setServiceBrowserUrl] = useState('https://agevolt.sk');
  const [mockServiceContrast, setMockServiceContrast] = useState(true);
  const [mockServiceInverseContrast, setMockServiceInverseContrast] = useState(false);
  const [connectorsConfigTick, setConnectorsConfigTick] = useState(0);
  const logoTapCountRef = useRef(0);
  const logoTapResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [rfidTapFeedback, setRfidTapFeedback] = useState<'ok' | 'reject' | null>(null);
  /** Oddelené od `rfidTapFeedback`, aby sa pri `visible={false}` ešte renderovala ikona počas fade-outu. */
  const [rfidTapModalVisible, setRfidTapModalVisible] = useState(false);
  const rfidTapTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Kým `Date.now() <` hodnoty, ignorujeme ďalšie simulované priloženie (modal + fade + cooldown). */
  const rfidDevTapBlockedUntilRef = useRef(0);
  const [accountsRuntime, setAccountsRuntime] = useState<MockAccount[]>(() => mockConfig.accounts ?? []);
  const [rfidCardsRuntime, setRfidCardsRuntime] = useState<MockRfidCard[]>(() => mockConfig.rfidCards ?? []);
  const [stationRfidUid, setStationRfidUid] = useState<string | null>(null);
  const [stationRfidStep, setStationRfidStep] = useState<StationRfidStep>('summary');
  const [stationLoginInput, setStationLoginInput] = useState('');
  const [stationPasswordInput, setStationPasswordInput] = useState('');
  const [stationLoginError, setStationLoginError] = useState('');
  const [stationLinkedAccountId, setStationLinkedAccountId] = useState<string | null>(null);
  const [stationSelectedSpaceId, setStationSelectedSpaceId] = useState<string | null>(null);
  const [stationSpaceSearch, setStationSpaceSearch] = useState('');
  const [stationVehicleSearch, setStationVehicleSearch] = useState('');
  const [stationPendingLink, setStationPendingLink] = useState<{
    vehicleId: string | null;
    blocked: boolean;
  } | null>(null);
  /** Predvolený výber v kroku Vozidlo (prvé vozidlo alebo Bez vozidla). */
  const [stationVehicleUi, setStationVehicleUi] = useState<StationVehicleUi | null>(null);
  /** Full-screen výber priestoru / vozidla (namiesto dlhého zoznamu v kroku). */
  const [stationRfidPicker, setStationRfidPicker] = useState<null | 'space' | 'vehicle'>(null);
  const [stationCreatePlate, setStationCreatePlate] = useState('');
  const [stationCreateVehicleName, setStationCreateVehicleName] = useState('');
  const [stationCreateError, setStationCreateError] = useState('');
  const connectorIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenRef = useRef<Screen>(screen);
  const effectiveConnectorIdRef = useRef<string | null>(null);
  const connectorIdleMoveBumpAtRef = useRef(0);
  /** Mock: prepínač dvojkonektor / jedenkonektor v UI (klik na Device ID v hlavičke stanice). */
  const [mockDevDualConnectorLayout, setMockDevDualConnectorLayout] = useState(true);
  const [connectorRuntime, setConnectorRuntime] = useState(() =>
    Object.fromEntries(
      mockConfig.connectors.map((connector) => [
        connector.id,
        {
          status: normalizeConnectorStatus(connector.ocpp.status),
          activeTx: connector.activeTx as ActiveTx | null,
        },
      ])
    ) as Record<string, { status: ConnectorStatus; activeTx: ActiveTx | null }>
  );
  const runtimeConnectors = useMemo(
    () =>
      mockConfig.connectors.map((connector) => {
        const runtime = connectorRuntime[connector.id];
        return {
          ...connector,
          ocpp: { status: normalizeConnectorStatus(runtime?.status ?? connector.ocpp.status) },
          activeTx: runtime?.activeTx ?? connector.activeTx,
        };
      }),
    [connectorRuntime]
  );
  /** Konektory zobrazené na domovskej obrazovke (pri „jednonabíjačke“ len prvý). */
  const homeUiConnectors = useMemo(
    () =>
      mockDevDualConnectorLayout || runtimeConnectors.length <= 1
        ? runtimeConnectors
        : runtimeConnectors.slice(0, 1),
    [mockDevDualConnectorLayout, runtimeConnectors]
  );
  const stationRfidCard = useMemo<StationCardSnapshot | null>(
    () =>
      stationRfidUid
        ? getStationCardSnapshot(stationRfidUid, rfidCardsRuntime, accountsRuntime, mockConfig.rfidCards)
        : null,
    [stationRfidUid, rfidCardsRuntime, accountsRuntime]
  );
  /** Horná bublina modálu: ŠPZ/názov/e-mail z účtu; ak chýba, z autorizovanej TX (dev Ctrl+A). */
  const stationRfidSummaryVehicleDriver = useMemo(() => {
    if (!stationRfidCard?.known) {
      return { plate: '', vehicleName: '', driverEmail: '' };
    }
    const uid = stationRfidCard.uid;
    const parent = stationRfidCard.cardParentTag ?? null;
    let plate = (stationRfidCard.vehicle?.plate ?? '').trim();
    let vname = (stationRfidCard.vehicle?.name ?? '').trim();
    let email = (stationRfidCard.driverEmail ?? '').trim();
    if (!plate && !vname) {
      for (const c of homeUiConnectors) {
        const tx = c.activeTx;
        if (!tx || !isTxAuthorizedForRfidUid(tx, uid, parent)) continue;
        const tp = (tx.vehiclePlate ?? '').trim();
        const tn = (tx.vehicleName ?? '').trim();
        if (tp || tn) {
          plate = tp || plate;
          vname = tn || vname;
          break;
        }
      }
    }
    if (!email) {
      for (const c of homeUiConnectors) {
        const tx = c.activeTx;
        if (!tx || !isTxAuthorizedForRfidUid(tx, uid, parent)) continue;
        const em = (tx.driverEmail ?? '').trim();
        if (em) {
          email = em;
          break;
        }
      }
    }
    return { plate, vehicleName: vname, driverEmail: email };
  }, [stationRfidCard, homeUiConnectors]);
  const stationLinkedAccount = useMemo(
    () => accountsRuntime.find((item) => item.id === stationLinkedAccountId) ?? null,
    [accountsRuntime, stationLinkedAccountId]
  );
  /** Kompaktný výber vozidla: ŠPZ + názov — vyššia bublina a dva riadky textu. */
  const stationRfidPickVehicleCompactTwoLines = useMemo(() => {
    if (stationRfidStep !== 'pickVehicle' || !stationLinkedAccount || stationVehicleUi?.kind !== 'vehicle') {
      return false;
    }
    const v = stationLinkedAccount.vehicles.find((x) => x.id === stationVehicleUi.vehicleId);
    const p = (v?.plate ?? '').trim();
    const n = (v?.name ?? '').trim();
    return p.length > 0 && n.length > 0;
  }, [stationRfidStep, stationLinkedAccount, stationVehicleUi]);
  const stationConnectorDecisions = useMemo<StationConnectorDecision[]>(
    () =>
      stationRfidCard
        ? homeUiConnectors.map((connector) =>
            buildStationConnectorDecision(connector, stationRfidCard, mockConfig.station.currency)
          )
        : [],
    [homeUiConnectors, stationRfidCard]
  );
  /** Ak aspoň jeden konektor v modáli ukazuje sumu, ostatné dostanú prázdny slot rovnakej výšky (zarovnanie Detail). */
  const stationRfidAnyConnectorCostRow = useMemo(
    () => stationConnectorDecisions.some((d) => Boolean(d.txTotalCostLabel)),
    [stationConnectorDecisions]
  );
  const stationRfidModalOpen = stationRfidUid !== null;
  /** RFID „stanica“ aj pri jednom konektore — rovnaký flow ako dvojkonektor (prehľad → detail). */
  const isStationOverviewRfidContext =
    screen === 'home' && selectedConnectorId === null && homeUiConnectors.length >= 1;

  const cycleMockConnectorStatus = useCallback((connectorId: string) => {
    setConnectorRuntime((prev) => {
      const cur = prev[connectorId];
      const curStatus = normalizeConnectorStatus(cur?.status);
      const nextStatus = nextMockConnectorStatus(curStatus);
      const needsTx = isTxActiveStatus(nextStatus);
      const cfg = mockConfig.connectors.find((c) => c.id === connectorId);
      const pp = cfg?.publicPolicy;
      const mockTx: ActiveTx = {
        id: 'mock-tx',
        chargingTime: '00:05:00',
        costWithVat: 0.42,
        pricePerKwh: pp?.price ?? null,
        hasAdditionalFees:
          (pp?.sessionFee ?? 0) > 0 || (pp?.parkingPerHour ?? 0) > 0 || (pp?.occupyPerHour ?? 0) > 0,
        rfidTag: cur?.activeTx?.rfidTag ?? cur?.activeTx?.linkedCardUid ?? 'mock-rfid',
        parentTag: cur?.activeTx?.parentTag ?? null,
        linkedCardUid: cur?.activeTx?.linkedCardUid ?? 'mock-rfid',
      };
      return {
        ...prev,
        [connectorId]: {
          status: nextStatus,
          activeTx: needsTx ? (cur?.activeTx ?? mockTx) : null,
        },
      };
    });
  }, []);
  const resetStationRfidStepState = useCallback(() => {
    setStationRfidStep('summary');
    setStationLoginInput('');
    setStationPasswordInput('');
    setStationLoginError('');
    setStationLinkedAccountId(null);
    setStationSelectedSpaceId(null);
    setStationSpaceSearch('');
    setStationVehicleSearch('');
    setStationPendingLink(null);
    setStationVehicleUi(null);
    setStationRfidPicker(null);
    setStationCreatePlate('');
    setStationCreateVehicleName('');
    setStationCreateError('');
  }, []);
  const closeStationRfidFlow = useCallback(() => {
    resetStationRfidStepState();
    setStationRfidUid(null);
  }, [resetStationRfidStepState]);

  const openStationRfidLoginStep = useCallback(() => {
    setStationLoginInput(STATION_RFID_PREFILL_LOGIN);
    setStationPasswordInput(STATION_RFID_PREFILL_PASSWORD);
    setStationLoginError('');
    setStationRfidStep('login');
  }, []);

  /** Dev (Ctrl+A–D): nastaví stav konektorov podľa testovacej karty pred otvorením RFID modálu. */
  const applyDevRfidConnectorPresetForTag = useCallback((tag: string) => {
    if (Platform.OS !== 'web' || !DEV_RFID_TEST_TAGS.has(tag)) return;
    const txForScannedCard = (uid: string): ActiveTx => ({
      id: `tx-preset-${uid}`,
      chargingTime: '01:02:03',
      costWithVat: 6.84,
      pricePerKwh: 0.18,
      hasAdditionalFees: true,
      rfidTag: uid,
      parentTag: null,
      linkedCardUid: uid,
      accountId: 'acc-jozef',
      vehicleId: 'veh-enyaq',
      vehiclePlate: 'BA 123XY',
      vehicleName: 'Skoda Enyaq 80 Max',
      driverEmail: 'jozef.novak.skoda@example.com',
      accessMode: 'shared',
    });
    const txOtherCard: ActiveTx = {
      id: 'tx-preset-remote-other',
      chargingTime: '00:45:11',
      costWithVat: 3.2,
      pricePerKwh: 0.39,
      hasAdditionalFees: false,
      rfidTag: 'REMOTE_OTHER_CARD',
      parentTag: null,
      linkedCardUid: 'REMOTE_OTHER_CARD',
      accountId: 'acc-anna',
      vehicleId: 'veh-tesla',
      vehiclePlate: 'BL 777EL',
      vehicleName: 'Tesla Model 3',
      driverEmail: 'anna.fischer.ev@example.com',
      accessMode: 'private',
    };
    const idle = { status: 'available' as const, activeTx: null };
    setConnectorRuntime((prev) => {
      if (tag === DEV_RFID_TAG_CTRL_A) {
        return {
          ...prev,
          c1: { status: 'charging', activeTx: txForScannedCard(tag) },
          c2: idle,
        };
      }
      if (tag === DEV_RFID_TAG_CTRL_B) {
        return {
          ...prev,
          c1: idle,
          c2: { status: 'charging', activeTx: txOtherCard },
        };
      }
      if (tag === DEV_RFID_TAG_CTRL_C || tag === DEV_RFID_TAG_CTRL_D) {
        return { ...prev, c1: idle, c2: idle };
      }
      return prev;
    });
  }, []);

  const openStationRfidFlow = useCallback(
    (uid: string) => {
      resetStationRfidStepState();
      setStationRfidUid(uid);
    },
    [resetStationRfidStepState]
  );
  const applyStationCardLink = useCallback(
    (
      accountId: string,
      vehicleId: string | null,
      opts?: { blocked?: boolean; spaceId?: string | null }
    ) => {
      if (!stationRfidUid) return;
      const blocked = opts?.blocked ?? false;
      const spaceId = opts?.spaceId ?? null;
      setRfidCardsRuntime((prev) => {
        const nextCard: MockRfidCard = {
          uid: stationRfidUid,
          known: true,
          blocked,
          accountId,
          spaceId,
          vehicleId,
        };
        const idx = prev.findIndex((item) => item.uid === stationRfidUid);
        if (idx < 0) return [...prev, nextCard];
        return prev.map((item, index) => (index === idx ? { ...item, ...nextCard } : item));
      });
      setStationLinkedAccountId(accountId);
      setStationRfidStep('summary');
      setStationLoginInput('');
      setStationPasswordInput('');
      setStationLoginError('');
      setStationCreatePlate('');
      setStationCreateVehicleName('');
      setStationCreateError('');
      setStationPendingLink(null);
    },
    [stationRfidUid]
  );
  const openStationConnectorDetail = useCallback(
    (connectorId: string) => {
      closeStationRfidFlow();
      setSelectedConnectorId(connectorId);
    },
    [closeStationRfidFlow]
  );
  const handleStationConnectorStop = useCallback(
    (connectorId: string) => {
      setConnectorRuntime((prev) => ({
        ...prev,
        [connectorId]: {
          status: 'available',
          activeTx: null,
        },
      }));
      closeStationRfidFlow();
    },
    [closeStationRfidFlow]
  );
  const handleStationConnectorStart = useCallback(
    (connectorId: string, decision: StationConnectorDecision) => {
      if (!stationRfidUid || !stationRfidCard) return;
      setConnectorRuntime((prev) => {
        const current = runtimeConnectors.find((item) => item.id === connectorId);
        if (!current) return prev;
        const policy =
          stationRfidCard.account?.id != null
            ? current.rfidAccountPolicies?.find((item) => item.accountId === stationRfidCard.account?.id) ?? null
            : null;
        const nextTx: ActiveTx = {
          id: `tx-${connectorId}-${Date.now()}`,
          chargingTime: '00:00:00',
          costWithVat: 0,
          pricePerKwh:
            decision.pricePerKwh ??
            policy?.pricePerKwh ??
            (current.hasPublicPolicy ? current.publicPolicy.price : null),
          hasAdditionalFees: policy?.hasAdditionalFees ?? false,
          rfidTag: stationRfidUid,
          parentTag: null,
          linkedCardUid: stationRfidUid,
          accountId: stationRfidCard.account?.id ?? null,
          vehicleId: stationRfidCard.vehicle?.id ?? null,
          vehiclePlate: stationRfidCard.vehicle?.plate ?? null,
          vehicleName: stationRfidCard.vehicle?.name ?? null,
          driverEmail: stationRfidCard.driverEmail ?? null,
          accessMode: decision.accessMode,
        };
        return {
          ...prev,
          [connectorId]: {
            status: 'preparing',
            activeTx: nextTx,
          },
        };
      });
      closeStationRfidFlow();
      setSelectedConnectorId(connectorId);
    },
    [closeStationRfidFlow, runtimeConnectors, stationRfidCard, stationRfidUid]
  );
  const handleStationLoginSubmit = useCallback(() => {
    const account = findRfidAccountByCredentials(
      accountsRuntime,
      stationLoginInput,
      stationPasswordInput
    );
    if (!account) {
      setStationLoginError(t(language, 'rfid.station.loginInvalid'));
      return;
    }
    setStationLinkedAccountId(account.id);
    setStationLoginError('');
    const fallbackSpace =
      mockConfig.station.location?.name ?? mockConfig.operator.owner.name ?? 'Priestor';
    const spaces = getSpacesForStationAccount(account, fallbackSpace);
    setStationSelectedSpaceId(spaces.length > 0 ? spaces[0].id : null);
    setStationSpaceSearch('');
    setStationVehicleSearch('');
    setStationRfidStep('pickSpace');
  }, [accountsRuntime, language, stationLoginInput, stationPasswordInput]);
  const handleStationCreateVehicle = useCallback(() => {
    if (!stationLinkedAccountId) return;
    const plate = stationCreatePlate.trim().toUpperCase();
    const name = stationCreateVehicleName.trim();
    if (!plate && !name) {
      setStationCreateError(t(language, 'rfid.station.createVehiclePlateOrNameRequired'));
      return;
    }
    const nextVehicle: MockVehicle = {
      id: `veh-${Date.now()}`,
      plate,
      name: name || undefined,
    };
    setAccountsRuntime((prev) =>
      prev.map((account) =>
        account.id === stationLinkedAccountId
          ? { ...account, vehicles: [...account.vehicles, nextVehicle] }
          : account
      )
    );
    setStationPendingLink({ vehicleId: nextVehicle.id, blocked: false });
    setStationCreatePlate('');
    setStationCreateVehicleName('');
    setStationCreateError('');
    setStationRfidStep('confirmLink');
  }, [language, stationCreatePlate, stationCreateVehicleName, stationLinkedAccountId]);
  const effectiveConnectorIdForContext = useMemo(() => selectedConnectorId, [selectedConnectorId]);
  screenRef.current = screen;
  effectiveConnectorIdRef.current = effectiveConnectorIdForContext;
  const [isNetworkOnline, setIsNetworkOnline] = useState(
    mockConfig.system?.networkOnline ?? mockConfig.station.networkOnline ?? true
  );
  const [networkType, setNetworkType] = useState<NetworkType>(
    mockConfig.system?.activeNetwork ?? mockConfig.station.networkType ?? 'wifi'
  );
  const [ocppConnectionState, setOcppConnectionState] = useState<OcppConnectionState>(
    mockConfig.system?.ocppConnectionState ?? 'ok'
  );
  const integrationsOcppWsUrlLine = useMemo(() => {
    const host = 'ocpp.my.agevolt.com';
    const port = 443;
    const pathSeg = 'ocpp';
    const scheme = port === 443 ? 'wss' : 'ws';
    return `${scheme}://${host}:${port}/${pathSeg.replace(/^\/+/, '')}`;
  }, []);
  const integrationsOcppClientVersion = '2.0.1';
  const integrationsMqttClientVersion = '1.4.0';
  const integrationsOcppStatusText = useMemo(() => {
    if (ocppConnectionState === 'ok') return t(language, 'service.integrations.ocppStateOk');
    if (ocppConnectionState === 'connecting') return t(language, 'service.integrations.ocppStateConnecting');
    return t(language, 'service.integrations.ocppStateOffline');
  }, [language, ocppConnectionState]);
  const integrationsStatusRows = useMemo(() => {
    const online = t(language, 'service.integrations.online');
    const offline = t(language, 'service.integrations.offline');
    const wifiUp = networkType === 'wifi' && isNetworkOnline;
    const dataUp = networkType === '4g' && isNetworkOnline;
    const ethUp = networkType === 'eth' && isNetworkOnline;
    const wifiVal = wifiUp ? `${online} · Hotel-Lesná · -62 dBm` : offline;
    const dataVal = dataUp ? `${online} · 4/5` : offline;
    const ethVal = ethUp ? `${online} · 192.168.88.1` : offline;
    const internetVal = !isNetworkOnline
      ? offline
      : networkType === 'wifi'
        ? t(language, 'service.integrations.internetRouteWifi')
        : networkType === '4g'
          ? t(language, 'service.integrations.internetRouteData')
          : t(language, 'service.integrations.internetRouteEth');
    const hotspotActive = true;
    const hotspotClients = 2;
    const hotspotVal = hotspotActive
      ? `${online} · ${hotspotClients} ${t(language, 'service.integrations.devices')}`
      : offline;
    const ethShareActive = false;
    const ethShareClients = 0;
    const ethShareVal = ethShareActive
      ? `${online} · ${ethShareClients} ${t(language, 'service.integrations.devices')}`
      : offline;
    return [
      { key: 'wifi', label: t(language, 'service.integrations.labelWifi'), value: wifiVal },
      { key: 'data', label: t(language, 'service.integrations.labelData'), value: dataVal },
      { key: 'eth', label: t(language, 'service.integrations.labelEth'), value: ethVal },
      { key: 'internet', label: t(language, 'service.integrations.labelInternet'), value: internetVal },
      { key: 'hotspot', label: t(language, 'service.integrations.labelHotspot'), value: hotspotVal },
      { key: 'ethShare', label: t(language, 'service.integrations.labelEthShare'), value: ethShareVal },
    ] as const;
  }, [language, networkType, isNetworkOnline]);
  const [serviceStationDefaultLanguage, setServiceStationDefaultLanguage] = useState<Exclude<LanguageCode, 'DEV'>>(
    mockConfig.station.defaultLanguage
  );
  const [serviceStationModbusMeter, setServiceStationModbusMeter] = useState(true);
  const [serviceStationMeterS0count, setServiceStationMeterS0count] = useState(1000);
  const [serviceOperatorPaymentAllowed, setServiceOperatorPaymentAllowed] = useState(false);
  const [serviceOperatorOwnerName, setServiceOperatorOwnerName] = useState(mockConfig.operator.owner.name ?? '');
  const [serviceOperatorHelpdeskNumber, setServiceOperatorHelpdeskNumber] = useState(
    mockConfig.operator.helpdeskNumber ?? ''
  );
  const [serviceOperatorAppleStoreLink, setServiceOperatorAppleStoreLink] = useState(
    mockConfig.operator.appleStoreLink ?? ''
  );
  const [serviceOperatorAndroidStoreLink, setServiceOperatorAndroidStoreLink] = useState(
    mockConfig.operator.androidStoreLink ?? ''
  );
  const [serviceOperatorChargingLink, setServiceOperatorChargingLink] = useState(
    mockConfig.operator.chargingLink ?? ''
  );
  const [serviceSelectedConnectorId, setServiceSelectedConnectorId] = useState<string | null>(
    mockConfig.connectors[0]?.id ?? null
  );
  const [serviceConnectorState, setServiceConnectorState] = useState<Record<string, ServiceConnectorState>>(
    () => buildInitialServiceConnectorState(mockConfig.connectors)
  );
  const [serviceOcppConfig, setServiceOcppConfig] = useState(() => ({
    AllowOfflineTxForUnknownId: false,
    AuthorizationCacheEnabled: false,
    AuthorizeRemoteTxRequests: true,
    LocalAuthorizeOffline: false,
    LocalPreAuthorize: false,
    LocalAuthListEnabled: false,
    LocalAuthListMaxLength: 0,
    SendLocalListMaxLength: 0,
    MaxEnergyOnInvalidId: 0,
    StopTransactionOnInvalidId: true,
    BlinkRepeat: 0,
    ClockAlignedDataInterval: 0,
    ConnectionTimeOut: 60,
    GetConfigurationMaxKeys: 50,
    HeartbeatInterval: 3600,
    LightIntensity: 100,
    MeterValueSampleInterval: 60,
    MinimumStatusDuration: 0,
    ResetRetries: 0,
    TransactionMessageAttempts: 3,
    TransactionMessageRetryInterval: 60,
    WebSocketPingInterval: 50,
    MeterValuesAlignedData: [] as string[],
    MeterValuesAlignedDataMaxLength: 0,
    MeterValuesSampledData: [
      'Energy.Active.Import.Register',
      'Current.Import',
      'Current.Offered',
      'Power.Active.Import',
      'Voltage',
    ] as string[],
    MeterValuesSampledDataMaxLength: 6,
    StopTxnAlignedData: [] as string[],
    StopTxnAlignedDataMaxLength: 0,
    StopTxnSampledData: ['Energy.Active.Import.Register', 'Power.Active.Import'] as string[],
    StopTxnSampledDataMaxLength: 0,
    NumberOfConnectors: mockConfig.connectors.length,
    ConnectorPhaseRotationMaxLength: mockConfig.connectors.length,
    SupportedFeatureProfiles: ['Core'] as string[],
    SupportedFeatureProfilesMaxLength: 1,
    ReserveConnectorZeroSupported: false,
    ChargeProfileMaxStackLevel: 0,
    ChargingScheduleAllowedChargingRateUnit: ['Current'] as string[],
    ChargingScheduleMaxPeriods: 0,
    ConnectorSwitch3to1PhaseSupported: false,
    MaxChargingProfilesInstalled: 0,
    StopTransactionOnEVSideDisconnect: true,
    UnlockConnectorOnEVSideDisconnect: true,
  }));
  const serviceSelectedConnector = useMemo(
    () => runtimeConnectors.find((connector) => connector.id === serviceSelectedConnectorId) ?? runtimeConnectors[0] ?? null,
    [runtimeConnectors, serviceSelectedConnectorId]
  );
  const serviceSelectedConnectorData = serviceSelectedConnector
    ? serviceConnectorState[serviceSelectedConnector.id]
    : null;
  const stationLocationName = mockConfig.station.location?.name ?? 'Location';
  /** Workspace / vlastník karty – rovnaký údaj ako v hornom riadku hlavičky (`user-tie` + meno). */
  const operatorOwnerName = mockConfig.operator.owner.name ?? '';
  const stationSpacesForRfid = useMemo((): MockSpace[] => {
    if (!stationLinkedAccount) return [];
    const fb =
      mockConfig.station.location?.name ?? (operatorOwnerName.length > 0 ? operatorOwnerName : stationLocationName);
    return getSpacesForStationAccount(stationLinkedAccount, fb);
  }, [stationLinkedAccount, operatorOwnerName, stationLocationName]);

  useEffect(() => {
    if (stationRfidStep !== 'pickVehicle' || !stationLinkedAccount) return;
    if (stationVehicleUi != null) return;
    const v = stationLinkedAccount.vehicles ?? [];
    setStationVehicleUi(v.length > 0 ? { kind: 'vehicle', vehicleId: v[0].id } : { kind: 'without' });
  }, [stationRfidStep, stationLinkedAccount, stationVehicleUi]);
  const stationName = mockConfig.station.name ?? 'Station 01';
  const stationDeviceId = mockConfig.station.ocppDeviceId ?? 'TP-DEVICE-001';
  const androidStoreLink = mockConfig.operator.androidStoreLink ?? 'https://play.google.com/store';
  const appleStoreLink = mockConfig.operator.appleStoreLink ?? 'https://apps.apple.com';
  const chargingLink = mockConfig.operator.chargingLink ?? 'https://charge.agevolt.com';
  const operatorProviderName =
    mockConfig.operator.provider?.name ?? mockConfig.operator.owner.name ?? 'AgeVolt';
  const overlayBackAccessibilityLabel = t(language, 'info.reader.back');
  const scrollUpAccessibilityLabel = t(language, 'actions.scrollUp');
  const scrollDownAccessibilityLabel = t(language, 'actions.scrollDown');
  const contentTextScale = magnifierOn ? 2 : 1;
  const contentIconScale = magnifierOn ? 1.5 : 1;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'a' && key !== 'b' && key !== 'c' && key !== 'd') return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (stationRfidModalOpen) {
        e.preventDefault();
        return;
      }
      if (Date.now() < rfidDevTapBlockedUntilRef.current) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const tagMap: Record<string, string> = {
        a: DEV_RFID_TAG_CTRL_A,
        b: DEV_RFID_TAG_CTRL_B,
        c: DEV_RFID_TAG_CTRL_C,
        d: DEV_RFID_TAG_CTRL_D,
      };
      const tag = tagMap[key];
      /** Len pri simulovanom tuku — neprepisuje runtime pri iných vstupoch RFID. */
      applyDevRfidConnectorPresetForTag(tag);
      window.dispatchEvent(new CustomEvent(DEV_RFID_TAP_EVENT, { detail: { tag } }));
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [stationRfidModalOpen, applyDevRfidConnectorPresetForTag]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const clearRfidTapTimers = () => {
      rfidTapTimersRef.current.forEach(clearTimeout);
      rfidTapTimersRef.current = [];
    };
    const onRfidTap = (ev: Event) => {
      if (Date.now() < rfidDevTapBlockedUntilRef.current) return;
      const detail = (ev as CustomEvent<{ tag?: string; accepted?: boolean }>).detail;
      const tag = detail?.tag;
      let accepted = detail?.accepted;
      if (accepted === undefined) {
        accepted = tag !== DEV_RFID_TAG_CTRL_D;
      }
      if (tag && isStationOverviewRfidContext) {
        playRfidTapSound(accepted);
        openStationRfidFlow(tag);
        return;
      }
      const showMs = RFID_TAP_FEEDBACK_SHOW_MS;
      rfidDevTapBlockedUntilRef.current =
        Date.now() + showMs + RFID_MODAL_FADE_OUT_MS + RFID_TAP_POST_MODAL_COOLDOWN_MS;
      playRfidTapSound(accepted);
      clearRfidTapTimers();
      if (accepted) {
        setRfidTapFeedback('ok');
      } else {
        setRfidTapFeedback('reject');
      }
      setRfidTapModalVisible(true);
      const tHide = setTimeout(() => {
        setRfidTapModalVisible(false);
      }, showMs);
      const tClear = setTimeout(() => {
        setRfidTapFeedback(null);
      }, showMs + RFID_MODAL_FADE_OUT_MS);
      rfidTapTimersRef.current.push(tHide, tClear);
    };
    window.addEventListener(DEV_RFID_TAP_EVENT, onRfidTap as EventListener);
    return () => {
      window.removeEventListener(DEV_RFID_TAP_EVENT, onRfidTap as EventListener);
      clearRfidTapTimers();
    };
  }, [isStationOverviewRfidContext, openStationRfidFlow]);

  useEffect(() => {
    return () => {
      if (connectorIdleTimeoutRef.current) clearTimeout(connectorIdleTimeoutRef.current);
      if (logoTapResetTimerRef.current) clearTimeout(logoTapResetTimerRef.current);
    };
  }, []);

  const clearConnectorIdleTimeout = useCallback(() => {
    if (connectorIdleTimeoutRef.current) {
      clearTimeout(connectorIdleTimeoutRef.current);
      connectorIdleTimeoutRef.current = null;
    }
  }, []);

  const clearConnectorSession = useCallback(() => {
    closeStationRfidFlow();
    setSelectedConnectorId(null);
  }, [closeStationRfidFlow]);

  /** One place: any pointer down/move on the shell (incl. header) resets the 1 min idle timer. */
  const bumpConnectorScopeActivity = useCallback(() => {
    if (effectiveConnectorIdRef.current === null) return;
    if (!CONNECTOR_IDLE_SCREENS.includes(screenRef.current)) return;
    if (connectorIdleTimeoutRef.current) {
      clearTimeout(connectorIdleTimeoutRef.current);
      connectorIdleTimeoutRef.current = null;
    }
    connectorIdleTimeoutRef.current = setTimeout(() => {
      connectorIdleTimeoutRef.current = null;
      clearConnectorSession();
      if (screenRef.current !== 'home') setScreen('home');
    }, CONNECTOR_SCOPE_IDLE_MS);
  }, [clearConnectorSession]);

  const handleSelectConnector = useCallback((connectorId: string) => {
    closeStationRfidFlow();
    setSelectedConnectorId(connectorId);
  }, [closeStationRfidFlow]);

  /** Pri prepnutí na jednonabíjačku zavri detail druhého konektora (nie je v UI). */
  useEffect(() => {
    if (mockDevDualConnectorLayout) return;
    if (runtimeConnectors.length <= 1) return;
    const firstId = runtimeConnectors[0]?.id ?? null;
    if (selectedConnectorId != null && selectedConnectorId !== firstId) {
      setSelectedConnectorId(null);
    }
  }, [mockDevDualConnectorLayout, runtimeConnectors, selectedConnectorId]);

  const visibleInfoBlockIds = useMemo(
    () => getVisibleInfoBlockIds(runtimeConnectors),
    [runtimeConnectors]
  );

  const openInfo = (initialHelp?: number | HelpId, returnTarget: Screen = 'home') => {
    const resolvedId =
      initialHelp === undefined
        ? resolveHelpIdFromContext(effectiveConnectorIdForContext, homeUiConnectors)
        : initialHelp;
    const idx = toHelpIndex(resolvedId, visibleInfoBlockIds);
    setInfoBlockIndex(idx);
    setInfoReturnTarget(returnTarget === 'info' ? 'home' : returnTarget);
    setScreen('info');
  };

  /** Arm or clear idle timeout when connector scope / screen changes (navigation = fresh minute). */
  useEffect(() => {
    if (effectiveConnectorIdForContext === null || !CONNECTOR_IDLE_SCREENS.includes(screen)) {
      clearConnectorIdleTimeout();
      return;
    }
    bumpConnectorScopeActivity();
  }, [screen, effectiveConnectorIdForContext, bumpConnectorScopeActivity, clearConnectorIdleTimeout]);
  const openQr = (
    title: string,
    value: string,
    options?: { returnTo?: Screen; showPaymentOptions?: boolean }
  ) => {
    if (screen === 'qr' && qrTarget) {
      previousQrTargetRef.current = qrTarget;
    } else {
      previousQrTargetRef.current = null;
    }
    setQrTarget({
      title,
      value,
      returnTo: options?.returnTo ?? 'support',
      showPaymentOptions: options?.showPaymentOptions ?? false,
    });
    setScreen('qr');
  };

  const cycleNetworkState = () => {
    if (!isNetworkOnline) {
      setIsNetworkOnline(true);
      setNetworkType('wifi');
      return;
    }
    if (networkType === 'wifi') {
      setNetworkType('4g');
      return;
    }
    if (networkType === '4g') {
      setNetworkType('eth');
      return;
    }
    setIsNetworkOnline(false);
  };

  const cycleOcppState = () => {
    setOcppConnectionState((prev) =>
      prev === 'ok' ? 'connecting' : prev === 'connecting' ? 'offline' : 'ok'
    );
  };
  const updateServiceConnectorState = useCallback(
    <K extends keyof ServiceConnectorState>(connectorId: string, key: K, value: ServiceConnectorState[K]) => {
      setServiceConnectorState((prev) => ({
        ...prev,
        [connectorId]: {
          ...prev[connectorId],
          [key]: value,
        },
      }));
    },
    []
  );
  const toggleServiceOcppArrayValue = useCallback(
    (
      key:
        | 'MeterValuesAlignedData'
        | 'MeterValuesSampledData'
        | 'StopTxnAlignedData'
        | 'StopTxnSampledData',
      value: string
    ) => {
      setServiceOcppConfig((prev) => {
        const list = prev[key];
        const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
        return { ...prev, [key]: next };
      });
    },
    []
  );
  const openServiceConnectorScreen = useCallback(
    (nextScreen: ServiceConnectorSubscreen, connectorId?: string) => {
      if (connectorId) setServiceSelectedConnectorId(connectorId);
      setScreen(nextScreen);
    },
    []
  );
  const serviceSystemModel = 'Wiseasy P5L SSK';
  const serviceSystemProduct = 'wiseasy-p5l-ssk';
  const serviceSystemDeviceId = 'TP-ANDROID-P5L-001';
  const serviceSystemLocationPoint = 'POINT(48.7332 19.1464)';
  const serviceMqttConnected = false;
  const serviceMqttUrl = 'mqtts://mqtt.agevolt.com:8883';
  const serviceMqttTopicPublish = 'agevolt/touchpoint/out';
  const serviceMqttTopicSubscribe = 'agevolt/touchpoint/in';
  const serviceMqttConnectionId = 'tp-socket-01';
  const serviceMqttDeviceId = mockConfig.station.ocppDeviceId ?? 'TP-SK-HOTEL-001';
  const serviceMqttUser = 'tp-client';
  const serviceMqttPassword = 'agevolt-mqtt-secret';
  const serviceOcppVersion = '1.6J';
  const serviceOcppDeviceId = mockConfig.station.ocppDeviceId ?? 'TP-SK-HOTEL-001';
  const serviceOcppBasicAuth = 'tp-basic-auth-secret';
  const serviceOcppRegistrationAccepted = ocppConnectionState === 'ok';
  const serviceOcppServerTimeOffsetMs = 126;
  const serviceOcppHeartbeatIntervalSec = 3600;
  const serviceOcppBootRetryIntervalSec = 500;
  const serviceStationBound = Boolean('ST-2026-001');
  const serviceStationBoundSn = 'ST-2026-001';
  const serviceStationVendor = 'AgeVolt';
  const serviceStationModel = 'Touchpoint CSMS';
  const serviceStationCountry = 'SK';
  const serviceStationTimeZone = 'Europe/Bratislava';
  const serviceStationCurrency = mockConfig.station.currency ?? 'EUR';
  const serviceStationFxToEurRate = 1;
  const serviceStationVatRate = mockConfig.station.vatRate ?? 0.23;
  const serviceSystemTotalRxBytes = 123_456_789;
  const serviceSystemTotalTxBytes = 45_678_123;
  const serviceSystemTotalRxBytesLast = 12_340_000;
  const serviceSystemTotalTxBytesLast = 4_560_000;
  const serviceTpLifecycleState = isNetworkOnline ? 'READY' : 'WAIT_INTERNET';
  const serviceFirmwareStatus =
    SERVICE_FIRMWARE_CONNECTOR_MOCK[serviceSelectedConnector?.id ?? '']?.inSync === false ? 'RUNNING' : 'READY';
  const serviceFirmwareModuleProgress = Object.values(SERVICE_FIRMWARE_CONNECTOR_MOCK).filter(
    (item) => item.inSync || (item.inSync === false && item.phase === 'waiting')
  ).length;

  const isServiceScreen =
    screen === 'servicePin' ||
    screen === 'serviceSettings' ||
    screen === 'serviceSystem' ||
    screen === 'serviceConnections' ||
    screen === 'serviceStation' ||
    screen === 'serviceOperator' ||
    screen === 'serviceOcppConfig' ||
    screen === 'serviceFirmware' ||
    screen === 'serviceConnectors' ||
    screen === 'serviceConnectorOverview' ||
    screen === 'serviceConnectorEvm' ||
    screen === 'serviceConnectorEvmManual' ||
    screen === 'serviceConnectorElm' ||
    screen === 'serviceConnectorOcpp' ||
    screen === 'serviceConnectorPolicy' ||
    screen === 'serviceConnectorTx' ||
    screen === 'serviceBrowser';

  const resetServicePin = useCallback(() => {
    setServicePinInput('');
    setServicePinError('');
  }, []);

  const goHomeFromHeader = useCallback(() => {
    clearConnectorSession();
    resetServicePin();
    setScreen('home');
  }, [clearConnectorSession, resetServicePin]);

  const onLogoTap = useCallback(() => {
    if (isServiceScreen) {
      resetServicePin();
      setScreen('home');
      return;
    }

    logoTapCountRef.current += 1;
    if (logoTapResetTimerRef.current) clearTimeout(logoTapResetTimerRef.current);
    logoTapResetTimerRef.current = setTimeout(() => {
      logoTapCountRef.current = 0;
    }, LOGO_SERVICE_TAP_GAP_MS);

    if (logoTapCountRef.current >= 5) {
      logoTapCountRef.current = 0;
      if (logoTapResetTimerRef.current) clearTimeout(logoTapResetTimerRef.current);
      resetServicePin();
      setScreen('servicePin');
    }
  }, [isServiceScreen, resetServicePin]);

  return (
    <>
      <StatusBar style="dark" />
      <KioskViewport>
        <View
          style={styles.appFrame}
          onStartShouldSetResponderCapture={() => {
            bumpConnectorScopeActivity();
            return false;
          }}
          onMoveShouldSetResponderCapture={() => {
            const t = Date.now();
            if (t - connectorIdleMoveBumpAtRef.current < 400) return false;
            connectorIdleMoveBumpAtRef.current = t;
            bumpConnectorScopeActivity();
            return false;
          }}
          {...(Platform.OS === 'web' ? { onPointerDown: bumpConnectorScopeActivity } : {})}
        >
          <TopHeader
            lang={language}
            providerName={mockConfig.operator.owner.name}
            providerLogo={mockConfig.operator.provider.logo}
            now={now}
            isNetworkOnline={isNetworkOnline}
            networkType={networkType}
            ocppConnectionState={ocppConnectionState}
            onCycleNetwork={cycleNetworkState}
            onCycleOcpp={cycleOcppState}
            magnifierOn={magnifierOn}
            onToggleMagnifier={() => setMagnifierOn((prev) => !prev)}
            onLogoTap={onLogoTap}
            onOwnerPress={goHomeFromHeader}
          />

          <View style={styles.contentViewport}>
            <ServiceLanguageContext.Provider value={language}>
              <ContentTextScaleContext.Provider value={contentTextScale}>
                <ContentIconScaleContext.Provider value={contentIconScale}>
                <View style={styles.contentZoomLayer}>
              {screen === 'home' && (
                  <View style={styles.homeNoScroll}>
                    <QuickActionsBar
                      lang={language}
                      onInfo={() => openInfo()}
                      onSupport={() => setScreen('support')}
                      onLanguage={() => setScreen('language')}
                    />
                    <ContentTextScaleContext.Provider value={1}>
                      <ContentIconScaleContext.Provider value={1}>
                        <StationSection
                          lang={language}
                          stationLocationName={stationLocationName}
                          stationName={stationName}
                          stationDeviceId={stationDeviceId}
                          compact={magnifierOn}
                          showStationBack={selectedConnectorId !== null}
                          onStationHomePress={clearConnectorSession}
                          onStationDeviceIdPress={
                            mockConfig.connectors.length > 1 && selectedConnectorId === null
                              ? () => setMockDevDualConnectorLayout((prev) => !prev)
                              : undefined
                          }
                        >
                          <HomeOverviewScreen
                            lang={language}
                            connectors={homeUiConnectors}
                            currency={mockConfig.station.currency}
                            fallbackChargingLink={chargingLink}
                            selectedConnectorId={selectedConnectorId}
                            onSelectConnector={handleSelectConnector}
                            onBackToOverview={clearConnectorSession}
                            onOpenInfoHelp2={() => openInfo('info-2', 'home')}
                            onOpenSupport={() => setScreen('support')}
                            onOpenQr={openQr}
                            operatorProviderName={operatorProviderName}
                            ownerName={mockConfig.operator.owner.name}
                            openInfo={openInfo}
                            magnifierOn={magnifierOn}
                            onDevCycleConnectorStatus={
                              selectedConnectorId
                                ? () => cycleMockConnectorStatus(selectedConnectorId)
                                : homeUiConnectors.length === 1 && homeUiConnectors[0]
                                  ? () => cycleMockConnectorStatus(homeUiConnectors[0].id)
                                  : undefined
                            }
                          />
                        </StationSection>
                      </ContentIconScaleContext.Provider>
                    </ContentTextScaleContext.Provider>
                  </View>
                )}

              {screen === 'home' && stationRfidModalOpen && stationRfidCard ? (
                <View style={styles.stationRfidModalRoot}>
                  <Pressable style={styles.stationRfidModalBackdrop} onPress={closeStationRfidFlow} />
                  <View style={styles.stationRfidModalShell}>
                    <ScrollView
                      style={styles.stationRfidModalCard}
                      contentContainerStyle={styles.stationRfidModalContent}
                      showsVerticalScrollIndicator={false}
                      bounces={false}
                    >
                      {stationRfidStep === 'summary' ? (
                        <>
                          <View style={styles.stationRfidSummaryCard}>
                            <View style={styles.stationRfidSummaryTop}>
                              <View style={styles.stationRfidSummaryUidLine}>
                                <View style={styles.stationRfidSummaryIconSlot}>
                                  <AppIcon name="id-card" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                </View>
                                <FitText
                                  style={styles.stationRfidSummaryUid}
                                  numberOfLines={1}
                                  targetChars={18}
                                  minScale={0.42}
                                >
                                  {stationRfidCard.uid}
                                </FitText>
                              </View>
                              {!stationRfidCard.known ? (
                                <View style={styles.stationRfidSummaryUnknownBlock}>
                                  <FitText
                                    style={styles.stationRfidSummaryUid}
                                    numberOfLines={1}
                                    targetChars={20}
                                    minScale={0.4}
                                  >
                                    {t(language, 'rfid.station.cardUnknown')}
                                  </FitText>
                                  <FitText
                                    style={styles.stationRfidSummaryUnknownRoamingLine}
                                    numberOfLines={2}
                                    targetChars={36}
                                    minScale={0.35}
                                  >
                                    {t(language, 'rfid.station.cardUnknownRoamingLine')}
                                  </FitText>
                                  <StationRfidQuickAction
                                    label={t(language, 'rfid.station.action.linkCardShort')}
                                    omitIcon
                                    onPress={openStationRfidLoginStep}
                                  />
                                </View>
                              ) : null}
                              {stationRfidCard.known && stationRfidCard.blocked ? (
                                <View style={styles.stationRfidSummaryBlockedBanner}>
                                  <View style={styles.stationRfidSummaryUidLine}>
                                    <View style={styles.stationRfidSummaryLeadIconCol}>
                                      <AppIcon name="do-not-enter" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                    </View>
                                    <FitText
                                      style={styles.stationRfidSummaryUid}
                                      numberOfLines={2}
                                      targetChars={24}
                                      minScale={0.35}
                                    >
                                      {t(language, 'rfid.station.cardBlocked')}
                                    </FitText>
                                  </View>
                                </View>
                              ) : null}
                              {stationRfidCard.known ? (
                                <>
                                  {operatorOwnerName.trim().length > 0 ? (
                                    <View style={styles.stationRfidSummaryUidLine}>
                                      <View style={styles.stationRfidSummaryLeadIconCol}>
                                        <AppIcon name="user-tie" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                      </View>
                                      <FitText
                                        style={styles.stationRfidSummaryUid}
                                        numberOfLines={2}
                                        targetChars={28}
                                        minScale={0.35}
                                      >
                                        {operatorOwnerName}
                                      </FitText>
                                    </View>
                                  ) : null}
                                  {(() => {
                                    const plate = stationRfidSummaryVehicleDriver.plate;
                                    const vname = stationRfidSummaryVehicleDriver.vehicleName;
                                    const hasPlate = plate.length > 0;
                                    const hasName = vname.length > 0;
                                    if (!hasPlate && !hasName) {
                                      return null;
                                    }
                                    if (hasPlate && hasName) {
                                      return (
                                        <View style={styles.stationRfidSummaryUidLine}>
                                          <View style={styles.stationRfidSummaryLeadIconCol}>
                                            <AppIcon name="car-side" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                          </View>
                                          <View style={styles.stationRfidSummaryStackedUidCol}>
                                            <FitText
                                              style={styles.stationRfidSummaryPrimaryStackLine}
                                              numberOfLines={1}
                                              targetChars={14}
                                              minScale={0.32}
                                            >
                                              {plate}
                                            </FitText>
                                            <FitText
                                              style={styles.stationRfidSummarySecondaryStackLine}
                                              numberOfLines={2}
                                              targetChars={36}
                                              minScale={0.32}
                                            >
                                              {vname}
                                            </FitText>
                                          </View>
                                        </View>
                                      );
                                    }
                                    const single = hasPlate ? plate : vname;
                                    return (
                                      <View style={styles.stationRfidSummaryUidLine}>
                                        <View style={styles.stationRfidSummaryLeadIconCol}>
                                          <AppIcon name="car-side" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                        </View>
                                        <FitText
                                          style={styles.stationRfidSummaryUid}
                                          numberOfLines={2}
                                          targetChars={36}
                                          minScale={0.32}
                                        >
                                          {single}
                                        </FitText>
                                      </View>
                                    );
                                  })()}
                                  {(() => {
                                    const raw = stationRfidSummaryVehicleDriver.driverEmail.trim();
                                    const parts = raw ? splitEmailAtSign(raw) : null;
                                    if (!raw) {
                                      return null;
                                    }
                                    if (!parts) {
                                      return (
                                        <View style={styles.stationRfidSummaryUidLine}>
                                          <View style={styles.stationRfidSummaryLeadIconCol}>
                                            <AppIcon name="user" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                          </View>
                                          <FitText
                                            style={styles.stationRfidSummaryUid}
                                            numberOfLines={2}
                                            targetChars={40}
                                            minScale={0.28}
                                          >
                                            {raw}
                                          </FitText>
                                        </View>
                                      );
                                    }
                                    return (
                                      <View style={styles.stationRfidSummaryUidLine}>
                                        <View style={styles.stationRfidSummaryLeadIconCol}>
                                          <AppIcon name="user" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                        </View>
                                        <View style={styles.stationRfidSummaryStackedUidCol}>
                                          <FitText
                                            style={styles.stationRfidSummaryPrimaryStackLine}
                                            numberOfLines={1}
                                            targetChars={22}
                                            minScale={0.28}
                                          >
                                            {parts.local}
                                          </FitText>
                                          <FitText
                                            style={styles.stationRfidSummarySecondaryStackLine}
                                            numberOfLines={2}
                                            targetChars={40}
                                            minScale={0.28}
                                          >
                                            {`@${parts.domain}`}
                                          </FitText>
                                        </View>
                                      </View>
                                    );
                                  })()}
                                </>
                              ) : null}
                            </View>
                          </View>

                          <View
                            style={[
                              styles.stationRfidConnectorGrid,
                              magnifierOn && styles.stationRfidConnectorGridStack,
                            ]}
                          >
                            {stationConnectorDecisions.map((decision) => (
                              <View
                                key={decision.connectorId}
                                style={[
                                  styles.stationRfidConnectorGridCell,
                                  magnifierOn && styles.stationRfidConnectorGridCellStack,
                                ]}
                              >
                                <StationRfidConnectorPanel
                                  lang={language}
                                  decision={decision}
                                  cardBlocked={stationRfidCard.known && stationRfidCard.blocked}
                                  reserveCostRowSlot={
                                    stationRfidAnyConnectorCostRow && !decision.txTotalCostLabel
                                  }
                                  onStart={() => handleStationConnectorStart(decision.connectorId, decision)}
                                  onStop={() => handleStationConnectorStop(decision.connectorId)}
                                  onMoreInfo={() => openStationConnectorDetail(decision.connectorId)}
                                />
                              </View>
                            ))}
                          </View>

                          <View style={styles.stationRfidFooterActions}>
                            <StationRfidQuickAction
                              label={t(language, 'rfid.station.action.close')}
                              icon="times-circle"
                              onPress={closeStationRfidFlow}
                            />
                          </View>
                        </>
                      ) : stationRfidStep === 'login' ? (
                        <View style={styles.stationRfidStepWrap}>
                          <Text style={styles.stationRfidStepTitle}>{t(language, 'rfid.station.loginTitle')}</Text>
                          <TextInput
                            value={stationLoginInput}
                            onChangeText={(value) => {
                              setStationLoginInput(value);
                              setStationLoginError('');
                            }}
                            placeholder={t(language, 'rfid.station.loginEmailPlaceholder')}
                            placeholderTextColor="#6b6b6b"
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={styles.stationRfidTextInput}
                          />
                          <TextInput
                            value={stationPasswordInput}
                            onChangeText={(value) => {
                              setStationPasswordInput(value);
                              setStationLoginError('');
                            }}
                            placeholder={t(language, 'rfid.station.loginPasswordPlaceholder')}
                            placeholderTextColor="#6b6b6b"
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={styles.stationRfidTextInput}
                          />
                          {stationLoginError ? (
                            <Text style={styles.stationRfidErrorText}>{stationLoginError}</Text>
                          ) : null}
                          <View style={[styles.stationRfidFooterActions, styles.stationRfidFooterActionsRow]}>
                            <View style={styles.stationRfidFooterRowActionCell}>
                              <StationRfidQuickAction
                                label={t(language, 'rfid.station.action.back')}
                                omitIcon
                                stripPosition="left"
                                onPress={() => {
                                  setStationLoginError('');
                                  setStationRfidStep('summary');
                                }}
                                secondary
                                style={styles.stationRfidFooterRowAction}
                              />
                            </View>
                            <View style={styles.stationRfidFooterRowActionCell}>
                              <StationRfidQuickAction
                                label={t(language, 'rfid.station.action.continue')}
                                omitIcon
                                onPress={handleStationLoginSubmit}
                                style={styles.stationRfidFooterRowAction}
                              />
                            </View>
                          </View>
                        </View>
                      ) : stationRfidStep === 'pickSpace' && stationLinkedAccount ? (
                        <View style={styles.stationRfidStepWrap}>
                          <View style={styles.stationRfidStepHeadingOuter}>
                            <View style={styles.stationRfidStepHeadingCluster}>
                              <AppIcon name="user-tie" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                              <FitText
                                style={[styles.stationRfidStepTitle, styles.stationRfidStepTitleHeadingClusterText]}
                                numberOfLines={1}
                                targetChars={14}
                                minScale={0.4}
                              >
                                {t(language, 'rfid.station.pickSpaceTitle')}
                              </FitText>
                            </View>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setStationRfidPicker('space')}
                            style={({ pressed }) => [
                              styles.stationRfidCompactSelectRow,
                              pressed && styles.connectorBubblePressed,
                            ]}
                          >
                            <View style={styles.stationRfidSummaryLeadIconCol}>
                              <AppIcon name="user-tie" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                            </View>
                            <FitText
                              style={[styles.stationRfidPickRowLabel, styles.stationRfidCompactSelectLabel]}
                              numberOfLines={2}
                              targetChars={32}
                              minScale={0.36}
                            >
                              {(
                                stationSpacesForRfid.find((s) => s.id === stationSelectedSpaceId) ??
                                stationSpacesForRfid[0]
                              )?.name ?? ''}
                            </FitText>
                            <AppIcon name="chevron-down" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                          </Pressable>
                          <View style={[styles.stationRfidFooterActions, styles.stationRfidFooterActionsRow]}>
                            <View style={styles.stationRfidFooterRowActionCell}>
                              <StationRfidQuickAction
                                label={t(language, 'rfid.station.action.back')}
                                omitIcon
                                stripPosition="left"
                                onPress={() => {
                                  setStationSpaceSearch('');
                                  setStationRfidStep('login');
                                }}
                                secondary
                                style={styles.stationRfidFooterRowAction}
                              />
                            </View>
                            <View style={styles.stationRfidFooterRowActionCell}>
                              <StationRfidQuickAction
                                label={t(language, 'rfid.station.action.next')}
                                omitIcon
                                disabled={!stationSelectedSpaceId && stationSpacesForRfid.length > 0}
                                onPress={() => {
                                  const v = stationLinkedAccount.vehicles ?? [];
                                  if (v.length > 0) {
                                    setStationVehicleUi({ kind: 'vehicle', vehicleId: v[0].id });
                                  } else {
                                    setStationVehicleUi({ kind: 'without' });
                                  }
                                  setStationVehicleSearch('');
                                  setStationRfidStep('pickVehicle');
                                }}
                                style={styles.stationRfidFooterRowAction}
                              />
                            </View>
                          </View>
                        </View>
                      ) : stationRfidStep === 'pickVehicle' && stationLinkedAccount ? (
                        <View style={styles.stationRfidStepWrap}>
                          <View style={styles.stationRfidStepHeadingOuter}>
                            <View style={styles.stationRfidStepHeadingCluster}>
                              <AppIcon name="car-side" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                              <FitText
                                style={[styles.stationRfidStepTitle, styles.stationRfidStepTitleHeadingClusterText]}
                                numberOfLines={1}
                                targetChars={12}
                                minScale={0.4}
                              >
                                {t(language, 'rfid.station.pickVehicleShortTitle')}
                              </FitText>
                            </View>
                          </View>
                          {(() => {
                            const sp = stationSpacesForRfid.find((s) => s.id === stationSelectedSpaceId);
                            if (!sp) return null;
                            return (
                              <View style={styles.stationRfidTitleWithIconRow}>
                                <View style={styles.stationRfidSummaryLeadIconCol}>
                                  <AppIcon name="user-tie" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                </View>
                                <FitText
                                  style={styles.stationRfidPickRowLabel}
                                  numberOfLines={2}
                                  targetChars={30}
                                  minScale={0.38}
                                >
                                  {sp.name}
                                </FitText>
                              </View>
                            );
                          })()}
                          {stationVehicleUi ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => setStationRfidPicker('vehicle')}
                              style={({ pressed }) => [
                                styles.stationRfidCompactSelectRow,
                                stationRfidPickVehicleCompactTwoLines && styles.stationRfidCompactSelectRowTwoLine,
                                pressed && styles.connectorBubblePressed,
                              ]}
                            >
                              {stationVehicleUi.kind === 'without' ? (
                                <View style={styles.stationRfidSummaryLeadIconCol}>
                                  <AppIcon name="do-not-enter" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                </View>
                              ) : (
                                <View style={styles.stationRfidSummaryLeadIconCol}>
                                  <AppIcon name="car" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                </View>
                              )}
                              {stationVehicleUi.kind === 'without' ? (
                                <FitText
                                  style={[styles.stationRfidPickRowLabel, styles.stationRfidCompactSelectLabel]}
                                  numberOfLines={2}
                                  targetChars={36}
                                  minScale={0.34}
                                >
                                  {t(language, 'rfid.station.withoutVehicle')}
                                </FitText>
                              ) : (() => {
                                  const veh = stationLinkedAccount.vehicles.find(
                                    (x) => x.id === stationVehicleUi.vehicleId
                                  );
                                  const plate = (veh?.plate ?? '').trim();
                                  const name = (veh?.name ?? '').trim();
                                  if (plate.length > 0 && name.length > 0) {
                                    return (
                                      <View style={styles.stationRfidCompactSelectVehicleStack}>
                                        <FitText
                                          style={styles.stationRfidCompactSelectVehiclePlateLine}
                                          numberOfLines={1}
                                          targetChars={14}
                                          minScale={0.32}
                                        >
                                          {plate}
                                        </FitText>
                                        <FitText
                                          style={styles.stationRfidCompactSelectVehicleNameLine}
                                          numberOfLines={2}
                                          targetChars={36}
                                          minScale={0.32}
                                        >
                                          {name}
                                        </FitText>
                                      </View>
                                    );
                                  }
                                  const single = plate.length > 0 ? plate : name;
                                  return (
                                    <FitText
                                      style={[styles.stationRfidPickRowLabel, styles.stationRfidCompactSelectLabel]}
                                      numberOfLines={2}
                                      targetChars={36}
                                      minScale={0.34}
                                    >
                                      {single.length > 0 ? single : '—'}
                                    </FitText>
                                  );
                                })()}
                              <AppIcon name="chevron-down" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                            </Pressable>
                          ) : null}
                          <View style={styles.stationRfidFooterActions}>
                            <StationRfidQuickAction
                              label={t(language, 'rfid.station.action.createVehicle')}
                              omitIcon
                              onPress={() => setStationRfidStep('createVehicle')}
                              style={styles.stationRfidFooterRowAction}
                            />
                            <StationRfidQuickAction
                              label={t(language, 'rfid.station.withoutVehicle')}
                              omitIcon
                              onPress={() => {
                                setStationVehicleUi({ kind: 'without' });
                                setStationPendingLink({ vehicleId: null, blocked: true });
                                setStationRfidStep('confirmLink');
                              }}
                              style={styles.stationRfidFooterRowAction}
                            />
                          </View>
                          <View style={[styles.stationRfidFooterActions, styles.stationRfidFooterActionsRow]}>
                            <View style={styles.stationRfidFooterRowActionCell}>
                              <StationRfidQuickAction
                                label={t(language, 'rfid.station.action.back')}
                                omitIcon
                                stripPosition="left"
                                onPress={() => {
                                  setStationVehicleSearch('');
                                  setStationRfidStep('pickSpace');
                                }}
                                secondary
                                style={styles.stationRfidFooterRowAction}
                              />
                            </View>
                            <View style={styles.stationRfidFooterRowActionCell}>
                              <StationRfidQuickAction
                                label={t(language, 'rfid.station.action.next')}
                                omitIcon
                                disabled={stationVehicleUi == null}
                                onPress={() => {
                                  if (!stationVehicleUi) return;
                                  if (stationVehicleUi.kind === 'without') {
                                    setStationPendingLink({ vehicleId: null, blocked: true });
                                  } else {
                                    setStationPendingLink({
                                      vehicleId: stationVehicleUi.vehicleId,
                                      blocked: false,
                                    });
                                  }
                                  setStationRfidStep('confirmLink');
                                }}
                                style={styles.stationRfidFooterRowAction}
                              />
                            </View>
                          </View>
                        </View>
                      ) : stationRfidStep === 'confirmLink' && stationLinkedAccount && stationPendingLink ? (
                        <View style={styles.stationRfidStepWrap}>
                          <Text style={styles.stationRfidStepTitle}>
                            {t(language, 'rfid.station.confirmSaveTitle')}
                          </Text>
                          {(() => {
                            const spName =
                              stationSpacesForRfid.find((s) => s.id === stationSelectedSpaceId)?.name ?? '';
                            const veh =
                              stationPendingLink.vehicleId != null
                                ? stationLinkedAccount.vehicles.find(
                                    (v) => v.id === stationPendingLink.vehicleId
                                  ) ?? null
                                : null;
                            const showBlocked = stationPendingLink.blocked || !veh;
                            return (
                              <View style={styles.stationRfidConfirmSummary}>
                                <View style={styles.stationRfidConfirmIconRow}>
                                  <View style={styles.stationRfidSummaryLeadIconCol}>
                                    <AppIcon name="user-tie" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                  </View>
                                  <FitText
                                    style={[styles.stationRfidPickRowLabel, styles.stationRfidConfirmSummaryText]}
                                    numberOfLines={2}
                                    targetChars={28}
                                    minScale={0.36}
                                  >
                                    {spName}
                                  </FitText>
                                </View>
                                <View style={styles.stationRfidConfirmIconRow}>
                                  <View style={styles.stationRfidSummaryLeadIconCol}>
                                    <AppIcon name="car-side" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
                                  </View>
                                  <View style={styles.stationRfidConfirmVehicleTextCol}>
                                    {showBlocked ? (
                                      <>
                                        <FitText
                                          style={styles.stationRfidConfirmVehicleLine}
                                          numberOfLines={2}
                                          targetChars={24}
                                          minScale={0.36}
                                        >
                                          {t(language, 'rfid.station.withoutVehicle')}
                                        </FitText>
                                        <FitText
                                          style={styles.stationRfidConfirmVehicleSubline}
                                          numberOfLines={2}
                                          targetChars={20}
                                          minScale={0.36}
                                        >
                                          {t(language, 'rfid.station.confirmBlockedStatus')}
                                        </FitText>
                                      </>
                                    ) : veh ? (
                                      (() => {
                                        const plateT = (veh.plate ?? '').trim();
                                        const nameT = (veh.name ?? '').trim();
                                        if (plateT.length > 0 && nameT.length > 0) {
                                          return (
                                            <>
                                              <FitText
                                                style={styles.stationRfidConfirmVehicleLine}
                                                numberOfLines={1}
                                                targetChars={16}
                                                minScale={0.38}
                                              >
                                                {plateT}
                                              </FitText>
                                              <FitText
                                                style={styles.stationRfidConfirmVehicleSubline}
                                                numberOfLines={2}
                                                targetChars={32}
                                                minScale={0.34}
                                              >
                                                {nameT}
                                              </FitText>
                                            </>
                                          );
                                        }
                                        if (plateT.length > 0) {
                                          return (
                                            <FitText
                                              style={styles.stationRfidConfirmVehicleLine}
                                              numberOfLines={2}
                                              targetChars={28}
                                              minScale={0.36}
                                            >
                                              {plateT}
                                            </FitText>
                                          );
                                        }
                                        if (nameT.length > 0) {
                                          return (
                                            <FitText
                                              style={styles.stationRfidConfirmVehicleLine}
                                              numberOfLines={2}
                                              targetChars={36}
                                              minScale={0.34}
                                            >
                                              {nameT}
                                            </FitText>
                                          );
                                        }
                                        return null;
                                      })()
                                    ) : null}
                                  </View>
                                </View>
                              </View>
                            );
                          })()}
                          <View style={[styles.stationRfidFooterActions, styles.stationRfidFooterActionsRow]}>
                            <View style={styles.stationRfidFooterRowActionCell}>
                              <StationRfidQuickAction
                                label={t(language, 'rfid.station.action.back')}
                                omitIcon
                                stripPosition="left"
                                onPress={() => {
                                  setStationPendingLink(null);
                                  setStationRfidStep('pickVehicle');
                                }}
                                secondary
                                style={styles.stationRfidFooterRowAction}
                              />
                            </View>
                            <View style={styles.stationRfidFooterRowActionCell}>
                              <StationRfidQuickAction
                                label={t(language, 'rfid.station.action.confirmSave')}
                                icon="save"
                                onPress={() => {
                                  if (!stationLinkedAccountId) return;
                                  applyStationCardLink(stationLinkedAccountId, stationPendingLink.vehicleId, {
                                    blocked: stationPendingLink.blocked,
                                    spaceId: stationSelectedSpaceId,
                                  });
                                }}
                                style={styles.stationRfidFooterRowAction}
                              />
                            </View>
                          </View>
                        </View>
                      ) : stationRfidStep === 'createVehicle' ? (
                        <View style={styles.stationRfidStepWrap}>
                          <Text style={styles.stationRfidStepTitle}>
                            {t(language, 'rfid.station.createVehicleTitle')}
                          </Text>
                          <TextInput
                            value={stationCreatePlate}
                            onChangeText={(value) => {
                              setStationCreatePlate(value);
                              setStationCreateError('');
                            }}
                            placeholder={t(language, 'rfid.station.createVehiclePlate')}
                            placeholderTextColor="#6b6b6b"
                            autoCapitalize="characters"
                            autoCorrect={false}
                            style={styles.stationRfidTextInput}
                          />
                          <TextInput
                            value={stationCreateVehicleName}
                            onChangeText={(value) => {
                              setStationCreateVehicleName(value);
                              setStationCreateError('');
                            }}
                            placeholder={t(language, 'rfid.station.createVehicleName')}
                            placeholderTextColor="#6b6b6b"
                            autoCorrect={false}
                            style={styles.stationRfidTextInput}
                          />
                          {stationCreateError ? (
                            <Text style={styles.stationRfidErrorText}>{stationCreateError}</Text>
                          ) : null}
                          <View style={[styles.stationRfidFooterActions, styles.stationRfidFooterActionsRow]}>
                            <View style={styles.stationRfidFooterRowActionCell}>
                              <StationRfidQuickAction
                                label={t(language, 'rfid.station.action.back')}
                                omitIcon
                                stripPosition="left"
                                onPress={() => setStationRfidStep('pickVehicle')}
                                secondary
                                style={styles.stationRfidFooterRowAction}
                              />
                            </View>
                            <View style={styles.stationRfidFooterRowActionCell}>
                              <StationRfidQuickAction
                                label={t(language, 'rfid.station.action.next')}
                                omitIcon
                                onPress={handleStationCreateVehicle}
                                style={styles.stationRfidFooterRowAction}
                              />
                            </View>
                          </View>
                        </View>
                      ) : null}
                    </ScrollView>
                    <Modal
                      visible={stationRfidPicker === 'space'}
                      animationType="slide"
                      onRequestClose={() => {
                        setStationRfidPicker(null);
                        setStationSpaceSearch('');
                      }}
                    >
                      <View style={styles.stationRfidPickerModalRoot}>
                        <Text style={styles.stationRfidPickerModalTitle}>
                          {t(language, 'rfid.station.pickSpacePickerTitle')}
                        </Text>
                        <TextInput
                          value={stationSpaceSearch}
                          onChangeText={setStationSpaceSearch}
                          placeholder={t(language, 'rfid.station.searchSpaces')}
                          placeholderTextColor="#6b6b6b"
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={styles.stationRfidTextInput}
                        />
                        <ScrollView
                          style={styles.stationRfidPickerModalScroll}
                          contentContainerStyle={styles.stationRfidPickerModalScrollContent}
                          keyboardShouldPersistTaps="handled"
                          showsVerticalScrollIndicator={false}
                        >
                          {stationSpacesForRfid
                            .filter((s) =>
                              s.name.toLowerCase().includes(stationSpaceSearch.trim().toLowerCase())
                            )
                            .map((space) => (
                              <StationRfidQuickAction
                                key={space.id}
                                label={space.name}
                                icon="user-tie"
                                onPress={() => {
                                  setStationSelectedSpaceId(space.id);
                                  setStationRfidPicker(null);
                                  setStationSpaceSearch('');
                                }}
                              />
                            ))}
                        </ScrollView>
                        <StationRfidQuickAction
                          label={t(language, 'rfid.station.action.back')}
                          omitIcon
                          stripPosition="left"
                          onPress={() => {
                            setStationRfidPicker(null);
                            setStationSpaceSearch('');
                          }}
                          secondary
                        />
                      </View>
                    </Modal>
                    <Modal
                      visible={stationRfidPicker === 'vehicle'}
                      animationType="slide"
                      onRequestClose={() => {
                        setStationRfidPicker(null);
                        setStationVehicleSearch('');
                      }}
                    >
                      <View style={styles.stationRfidPickerModalRoot}>
                        <Text style={styles.stationRfidPickerModalTitle}>
                          {t(language, 'rfid.station.pickVehiclePickerTitle')}
                        </Text>
                        <TextInput
                          value={stationVehicleSearch}
                          onChangeText={setStationVehicleSearch}
                          placeholder={t(language, 'rfid.station.searchVehicles')}
                          placeholderTextColor="#6b6b6b"
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={styles.stationRfidTextInput}
                        />
                        <ScrollView
                          style={styles.stationRfidPickerModalScroll}
                          contentContainerStyle={styles.stationRfidPickerModalScrollContent}
                          keyboardShouldPersistTaps="handled"
                          showsVerticalScrollIndicator={false}
                        >
                          {(stationLinkedAccount?.vehicles ?? [])
                            .filter((v) => {
                              const q = stationVehicleSearch.trim().toLowerCase();
                              if (!q) return true;
                              return (
                                v.plate.toLowerCase().includes(q) ||
                                (v.name ?? '').toLowerCase().includes(q)
                              );
                            })
                            .map((vehicle) => (
                              <StationRfidPickerVehicleRow
                                key={vehicle.id}
                                vehicle={vehicle}
                                onPress={() => {
                                  setStationVehicleUi({ kind: 'vehicle', vehicleId: vehicle.id });
                                  setStationRfidPicker(null);
                                  setStationVehicleSearch('');
                                }}
                              />
                            ))}
                        </ScrollView>
                        <StationRfidQuickAction
                          label={t(language, 'rfid.station.action.back')}
                          omitIcon
                          stripPosition="left"
                          onPress={() => {
                            setStationRfidPicker(null);
                            setStationVehicleSearch('');
                          }}
                          secondary
                        />
                      </View>
                    </Modal>
                  </View>
                </View>
              ) : null}

              {screen === 'language' && (
                <FullscreenOverlay
                  headerIcon="globe-europe"
                  title={t(language, 'language.overlayTitle')}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.language}
                  onClose={() => setScreen('home')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                >
                  <Text style={styles.overlayText}>{t(language, 'language.pick')}</Text>
                  <View style={styles.languageRow}>
                    {LANGUAGES.map((item) => (
                      <Pressable
                        key={item}
                        style={({ pressed }) => [
                          styles.languageButton,
                          language === item && styles.languageButtonActive,
                          pressed && styles.infoActionPressed,
                        ]}
                        onPress={() => {
                          setLanguage(item);
                          setScreen('home');
                        }}
                      >
                        <View style={styles.languageButtonMain}>
                          <Text
                            style={[
                              styles.languageButtonText,
                              language === item && styles.languageButtonTextActive,
                            ]}
                          >
                            {t(language, `language.name.${item}`)}
                          </Text>
                        </View>
                        <View style={styles.languageButtonStrip}>
                          <RNText style={styles.languageButtonStripArrow}>›</RNText>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'support' && (
                <FullscreenOverlay
                  headerIcon="headset"
                  title={t(language, 'support.overlayTitle')}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.support}
                  bubbleSnapScroll
                  onClose={() => setScreen('home')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <SupportContent
                    lang={language}
                    onToggleZoom={() => setMagnifierOn((prev) => !prev)}
                    helpdeskNumber={devVar(language, mockConfig.operator.helpdeskNumber, 'operator.helpdeskNumber')}
                    helpdeskEmail={devVar(language, mockConfig.operator.helpdeskEmail, 'operator.helpdeskEmail')}
                    androidStoreLink={devVar(language, androidStoreLink, 'operator.androidStoreLink')}
                    appleStoreLink={devVar(language, appleStoreLink, 'operator.appleStoreLink')}
                    chargingLink={devVar(language, chargingLink, 'operator.chargingLink')}
                    onOpenQr={openQr}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'info' && (
                <InfoReader
                  lang={language}
                  index={infoBlockIndex}
                  visibleBlockIds={visibleInfoBlockIds}
                  onBack={() => setScreen(infoReturnTarget)}
                  onPrev={() => setInfoBlockIndex((prev) => Math.max(0, prev - 1))}
                  onNext={() =>
                    setInfoBlockIndex((prev) => Math.min(visibleInfoBlockIds.length - 1, prev + 1))
                  }
                  onSelectTopic={(nextIndex) =>
                    setInfoBlockIndex(Math.max(0, Math.min(visibleInfoBlockIds.length - 1, nextIndex)))
                  }
                />
              )}

              {screen === 'qr' && qrTarget && (
                <FullscreenOverlay
                  headerIcon="search"
                  title={formatQrHeaderEvseId(qrTarget.title)}
                  scrollVertical
                  bubbleSnapScroll
                  onClose={() => {
                    if (qrTarget.returnTo === 'qr' && previousQrTargetRef.current) {
                      setQrTarget(previousQrTargetRef.current);
                      previousQrTargetRef.current = null;
                    } else {
                      setScreen(qrTarget.returnTo);
                    }
                  }}
                  useBackButton
                  titleLarge
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                  secondaryRowFirst
                  secondaryRow={
                    <QuickActionsBar
                      lang={language}
                      onInfo={() => openInfo(undefined, 'qr')}
                      onSupport={() => setScreen('support')}
                      onLanguage={() => setScreen('language')}
                    />
                  }
                >
                  <QrContent
                    lang={language}
                    value={qrTarget.value}
                    evseId={formatQrHeaderEvseId(qrTarget.title)}
                    showPaymentOptions={qrTarget.showPaymentOptions}
                    androidStoreLink={androidStoreLink}
                    appleStoreLink={appleStoreLink}
                    onOpenQr={openQr}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'servicePin' && (
                <FullscreenOverlay
                  title={t(language, 'service.menu.title')}
                  scrollVertical={false}
                  onClose={() => {
                    resetServicePin();
                    setScreen('home');
                  }}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                >
                  <ServicePinContent
                    title={t(language, 'service.pinPrompt')}
                    pinInput={servicePinInput}
                    error={servicePinError}
                    onInput={(digit) => {
                      if (servicePinInput.length >= SERVICE_PIN_LENGTH) return;
                      setServicePinError('');
                      setServicePinInput((prev) => `${prev}${digit}`);
                    }}
                    onDelete={() => {
                      setServicePinError('');
                      setServicePinInput((prev) => prev.slice(0, -1));
                    }}
                    onSubmit={() => {
                      if (servicePinInput === SERVICE_PIN) {
                        resetServicePin();
                        setScreen('serviceSettings');
                        return;
                      }
                      setServicePinError(t(language, 'connector.session.pinWrong'));
                    }}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'serviceSettings' && (
                <FullscreenOverlay
                  title={t(language, 'service.menu.title')}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('home')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <StationRfidQuickAction icon="desktop" label="System" onPress={() => setScreen('serviceSystem')} />
                    <StationRfidQuickAction
                      icon="network-wired"
                      label="Pripojenia"
                      onPress={() => setScreen('serviceConnections')}
                    />
                    <StationRfidQuickAction icon="charging-station" label="Stanica" onPress={() => setScreen('serviceStation')} />
                    <StationRfidQuickAction icon="user-tie" label="Operátor" onPress={() => setScreen('serviceOperator')} />
                    <StationRfidQuickAction icon="sliders-h" label="OCPP" onPress={() => setScreen('serviceOcppConfig')} />
                    <StationRfidQuickAction icon="microchip" label="Firmware update" onPress={() => setScreen('serviceFirmware')} />
                    <StationRfidQuickAction icon="plug" label="Konektory" onPress={() => setScreen('serviceConnectors')} />
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceSystem' && (
                <FullscreenOverlay
                  title="System"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceSettings')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="1.1 Zariadenie">
                      <ServiceReadRow label="system.model" value={serviceSystemModel} />
                      <ServiceReadRow label="system.product" value={serviceSystemProduct} />
                      <ServiceReadRow label="system.deviceId" value={serviceSystemDeviceId} />
                      <ServiceReadRow label="system.tpLifecycleState" value={serviceTpLifecycleState} />
                    </ServiceSectionCard>
                    <ServiceSectionCard title="1.2 Sieť a stav">
                      <ServiceStatusRow label="system.online" on={isNetworkOnline} />
                      <ServiceReadRow label="system.activeNetwork" value={networkType.toUpperCase()} />
                      <ServiceStatusRow label="system.dataMetered" on={networkType === '4g'} />
                      <ServiceStatusRow label="system.cellular.internet" on={networkType === '4g' && isNetworkOnline} />
                      <ServiceStatusRow label="system.wifi.internet" on={networkType === 'wifi' && isNetworkOnline} />
                      <ServiceStatusRow label="system.ethernet.internet" on={networkType === 'eth' && isNetworkOnline} />
                      <ServiceStatusRow label="system.ocppConnected" on={ocppConnectionState === 'ok'} />
                      <ServiceStatusRow label="system.mqttConnected" on={serviceMqttConnected} />
                      <ServiceStatusRow label="system.rs485ready" on={true} />
                    </ServiceSectionCard>
                    <ServiceSectionCard title="1.3 Prenos a poloha">
                      <ServiceReadRow label="system.stat.net.totalRxBytes" value={formatServiceNumber(language, serviceSystemTotalRxBytes)} />
                      <ServiceReadRow label="system.stat.net.totalTxBytes" value={formatServiceNumber(language, serviceSystemTotalTxBytes)} />
                      <ServiceReadRow label="system.stat.net.totalRxBytesLast" value={formatServiceNumber(language, serviceSystemTotalRxBytesLast)} />
                      <ServiceReadRow label="system.stat.net.totalTxBytesLast" value={formatServiceNumber(language, serviceSystemTotalTxBytesLast)} />
                      <ServiceReadRow label="system.location.point" value={serviceSystemLocationPoint} targetChars={56} />
                    </ServiceSectionCard>
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceConnections' && (
                <FullscreenOverlay
                  title="Pripojenia"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceSettings')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="2.1 MQTT">
                      <ServiceReadRow label="connectivity.mqtt.url" value={serviceMqttUrl} targetChars={64} />
                      <ServiceReadRow label="connectivity.mqtt.topicPublish" value={serviceMqttTopicPublish} targetChars={64} />
                      <ServiceReadRow label="connectivity.mqtt.topicSubscribe" value={serviceMqttTopicSubscribe} targetChars={64} />
                      <ServiceReadRow label="connectivity.mqtt.connectionId" value={serviceMqttConnectionId} />
                      <ServiceReadRow label="connectivity.mqtt.deviceId" value={serviceMqttDeviceId} />
                      <ServiceReadRow label="connectivity.mqtt.user" value={serviceMqttUser} />
                      <ServiceReadRow label="connectivity.mqtt.password" value={serviceMqttPassword} />
                    </ServiceSectionCard>
                    <ServiceSectionCard title="2.2 OCPP spojenie a runtime">
                      <ServiceReadRow label="connectivity.ocpp.version" value={serviceOcppVersion} />
                      <ServiceReadRow label="connectivity.ocpp.url" value={integrationsOcppWsUrlLine} targetChars={64} />
                      <ServiceReadRow label="connectivity.ocpp.deviceId" value={serviceOcppDeviceId} />
                      <ServiceReadRow label="connectivity.ocpp.basicAuth" value={serviceOcppBasicAuth} />
                      <ServiceStatusRow label="connectivity.ocpp.registrationAccepted" on={serviceOcppRegistrationAccepted} />
                      <ServiceReadRow label="connectivity.ocpp.serverTimeOffsetMs" value={formatServiceNumber(language, serviceOcppServerTimeOffsetMs)} />
                      <ServiceReadRow label="connectivity.ocpp.heartbeatIntervalSec" value={formatServiceNumber(language, serviceOcppHeartbeatIntervalSec)} />
                      <ServiceReadRow label="connectivity.ocpp.bootRetryIntervalSec" value={formatServiceNumber(language, serviceOcppBootRetryIntervalSec)} />
                    </ServiceSectionCard>
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceStation' && (
                <FullscreenOverlay
                  title="Stanica"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceSettings')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="3.1 Väzba a identita stanice">
                      <ServiceStatusRow label="system.stationBound" on={serviceStationBound} />
                      <ServiceReadRow label="station.boundSn" value={serviceStationBoundSn} />
                      <ServiceReadRow label="station.vendor" value={serviceStationVendor} />
                      <ServiceReadRow label="station.model" value={serviceStationModel} />
                    </ServiceSectionCard>
                    <ServiceSectionCard title="3.2 Región, jazyk a meranie">
                      <ServiceReadRow label="station.country" value={serviceStationCountry} />
                      <ServiceSelectRow
                        label="station.defaultLanguage"
                        value={serviceStationDefaultLanguage}
                        onPress={() => {
                          const next = cycleValue(SERVICE_LANGUAGE_OPTIONS, serviceStationDefaultLanguage);
                          setServiceStationDefaultLanguage(next);
                          setLanguage(next);
                        }}
                      />
                      <ServiceReadRow label="station.timeZone" value={serviceStationTimeZone} />
                      <ServiceReadRow label="station.currency" value={serviceStationCurrency} />
                      <ServiceReadRow label="station.fxToEurRate" value={formatServiceNumber(language, serviceStationFxToEurRate, 2)} />
                      <ServiceReadRow label="station.vatRate" value={formatServiceNumber(language, serviceStationVatRate, 2)} />
                      <ServiceToggleRow
                        label="station.modbusMeter"
                        on={serviceStationModbusMeter}
                        onToggle={() => setServiceStationModbusMeter((value) => !value)}
                      />
                      <ServiceInputRow
                        label="station.meterS0count"
                        value={String(serviceStationMeterS0count)}
                        onChangeText={(value) => setServiceStationMeterS0count(Number(value.replace(/[^\d]/g, '')) || 0)}
                        keyboardType="numeric"
                      />
                    </ServiceSectionCard>
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceOperator' && (
                <FullscreenOverlay
                  title="Operátor"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceSettings')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="4.1 Kontakt a odkazy">
                      <ServiceToggleRow
                        label="operator.paymentAllowed"
                        on={serviceOperatorPaymentAllowed}
                        onToggle={() => setServiceOperatorPaymentAllowed((value) => !value)}
                      />
                      <ServiceInputRow label="operator.owner.name" value={serviceOperatorOwnerName} onChangeText={setServiceOperatorOwnerName} />
                      <ServiceInputRow
                        label="operator.helpdeskNumber"
                        value={serviceOperatorHelpdeskNumber}
                        onChangeText={setServiceOperatorHelpdeskNumber}
                        keyboardType="phone-pad"
                      />
                      <ServiceInputRow label="operator.appleStoreLink" value={serviceOperatorAppleStoreLink} onChangeText={setServiceOperatorAppleStoreLink} />
                      <ServiceInputRow label="operator.androidStoreLink" value={serviceOperatorAndroidStoreLink} onChangeText={setServiceOperatorAndroidStoreLink} />
                      <ServiceInputRow label="operator.chargingLink" value={serviceOperatorChargingLink} onChangeText={setServiceOperatorChargingLink} />
                    </ServiceSectionCard>
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceOcppConfig' && (
                <FullscreenOverlay
                  title="OCPP"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceSettings')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="5.1 Autorizácia">
                      <ServiceToggleRow label="connectivity.ocpp.key.AllowOfflineTxForUnknownId" on={serviceOcppConfig.AllowOfflineTxForUnknownId} onToggle={() => setServiceOcppConfig((prev) => ({ ...prev, AllowOfflineTxForUnknownId: !prev.AllowOfflineTxForUnknownId }))} />
                      <ServiceToggleRow label="connectivity.ocpp.key.AuthorizationCacheEnabled" on={serviceOcppConfig.AuthorizationCacheEnabled} onToggle={() => setServiceOcppConfig((prev) => ({ ...prev, AuthorizationCacheEnabled: !prev.AuthorizationCacheEnabled }))} />
                      <ServiceToggleRow label="connectivity.ocpp.key.AuthorizeRemoteTxRequests" on={serviceOcppConfig.AuthorizeRemoteTxRequests} onToggle={() => setServiceOcppConfig((prev) => ({ ...prev, AuthorizeRemoteTxRequests: !prev.AuthorizeRemoteTxRequests }))} />
                      <ServiceToggleRow label="connectivity.ocpp.key.LocalAuthorizeOffline" on={serviceOcppConfig.LocalAuthorizeOffline} onToggle={() => setServiceOcppConfig((prev) => ({ ...prev, LocalAuthorizeOffline: !prev.LocalAuthorizeOffline }))} />
                      <ServiceToggleRow label="connectivity.ocpp.key.LocalPreAuthorize" on={serviceOcppConfig.LocalPreAuthorize} onToggle={() => setServiceOcppConfig((prev) => ({ ...prev, LocalPreAuthorize: !prev.LocalPreAuthorize }))} />
                      <ServiceToggleRow label="connectivity.ocpp.key.LocalAuthListEnabled" on={serviceOcppConfig.LocalAuthListEnabled} onToggle={() => setServiceOcppConfig((prev) => ({ ...prev, LocalAuthListEnabled: !prev.LocalAuthListEnabled }))} />
                      <ServiceReadRow label="connectivity.ocpp.key.LocalAuthListMaxLength" value={formatServiceNumber(language, serviceOcppConfig.LocalAuthListMaxLength)} />
                      <ServiceReadRow label="connectivity.ocpp.key.SendLocalListMaxLength" value={formatServiceNumber(language, serviceOcppConfig.SendLocalListMaxLength)} />
                      <ServiceInputRow label="connectivity.ocpp.key.MaxEnergyOnInvalidId" value={String(serviceOcppConfig.MaxEnergyOnInvalidId)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, MaxEnergyOnInvalidId: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                      <ServiceToggleRow label="connectivity.ocpp.key.StopTransactionOnInvalidId" on={serviceOcppConfig.StopTransactionOnInvalidId} onToggle={() => setServiceOcppConfig((prev) => ({ ...prev, StopTransactionOnInvalidId: !prev.StopTransactionOnInvalidId }))} />
                    </ServiceSectionCard>
                    <ServiceSectionCard title="5.2 Timery a retry">
                      <ServiceInputRow label="connectivity.ocpp.key.BlinkRepeat" value={String(serviceOcppConfig.BlinkRepeat)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, BlinkRepeat: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                      <ServiceInputRow label="connectivity.ocpp.key.ClockAlignedDataInterval" value={String(serviceOcppConfig.ClockAlignedDataInterval)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, ClockAlignedDataInterval: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                      <ServiceInputRow label="connectivity.ocpp.key.ConnectionTimeOut" value={String(serviceOcppConfig.ConnectionTimeOut)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, ConnectionTimeOut: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                      <ServiceReadRow label="connectivity.ocpp.key.GetConfigurationMaxKeys" value={formatServiceNumber(language, serviceOcppConfig.GetConfigurationMaxKeys)} />
                      <ServiceInputRow label="connectivity.ocpp.key.HeartbeatInterval" value={String(serviceOcppConfig.HeartbeatInterval)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, HeartbeatInterval: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                      <ServiceInputRow label="connectivity.ocpp.key.LightIntensity" value={String(serviceOcppConfig.LightIntensity)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, LightIntensity: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                      <ServiceInputRow label="connectivity.ocpp.key.MeterValueSampleInterval" value={String(serviceOcppConfig.MeterValueSampleInterval)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, MeterValueSampleInterval: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                      <ServiceInputRow label="connectivity.ocpp.key.MinimumStatusDuration" value={String(serviceOcppConfig.MinimumStatusDuration)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, MinimumStatusDuration: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                      <ServiceInputRow label="connectivity.ocpp.key.ResetRetries" value={String(serviceOcppConfig.ResetRetries)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, ResetRetries: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                      <ServiceInputRow label="connectivity.ocpp.key.TransactionMessageAttempts" value={String(serviceOcppConfig.TransactionMessageAttempts)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, TransactionMessageAttempts: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                      <ServiceInputRow label="connectivity.ocpp.key.TransactionMessageRetryInterval" value={String(serviceOcppConfig.TransactionMessageRetryInterval)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, TransactionMessageRetryInterval: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                      <ServiceInputRow label="connectivity.ocpp.key.WebSocketPingInterval" value={String(serviceOcppConfig.WebSocketPingInterval)} onChangeText={(value) => setServiceOcppConfig((prev) => ({ ...prev, WebSocketPingInterval: Number(value.replace(/[^\d]/g, '')) || 0 }))} keyboardType="numeric" />
                    </ServiceSectionCard>
                    <ServiceSectionCard title="5.3 Metering payloady">
                      <ServiceChipsRow label="connectivity.ocpp.key.MeterValuesAlignedData" values={serviceOcppConfig.MeterValuesAlignedData} options={SERVICE_OCPP_MEASURAND_OPTIONS} editable onToggle={(value) => toggleServiceOcppArrayValue('MeterValuesAlignedData', value)} />
                      <ServiceReadRow label="connectivity.ocpp.key.MeterValuesAlignedDataMaxLength" value={formatServiceNumber(language, serviceOcppConfig.MeterValuesAlignedDataMaxLength)} />
                      <ServiceChipsRow label="connectivity.ocpp.key.MeterValuesSampledData" values={serviceOcppConfig.MeterValuesSampledData} options={SERVICE_OCPP_MEASURAND_OPTIONS} editable onToggle={(value) => toggleServiceOcppArrayValue('MeterValuesSampledData', value)} />
                      <ServiceReadRow label="connectivity.ocpp.key.MeterValuesSampledDataMaxLength" value={formatServiceNumber(language, serviceOcppConfig.MeterValuesSampledDataMaxLength)} />
                      <ServiceChipsRow label="connectivity.ocpp.key.StopTxnAlignedData" values={serviceOcppConfig.StopTxnAlignedData} options={SERVICE_OCPP_MEASURAND_OPTIONS} editable onToggle={(value) => toggleServiceOcppArrayValue('StopTxnAlignedData', value)} />
                      <ServiceReadRow label="connectivity.ocpp.key.StopTxnAlignedDataMaxLength" value={formatServiceNumber(language, serviceOcppConfig.StopTxnAlignedDataMaxLength)} />
                      <ServiceChipsRow label="connectivity.ocpp.key.StopTxnSampledData" values={serviceOcppConfig.StopTxnSampledData} options={SERVICE_OCPP_MEASURAND_OPTIONS} editable onToggle={(value) => toggleServiceOcppArrayValue('StopTxnSampledData', value)} />
                      <ServiceReadRow label="connectivity.ocpp.key.StopTxnSampledDataMaxLength" value={formatServiceNumber(language, serviceOcppConfig.StopTxnSampledDataMaxLength)} />
                    </ServiceSectionCard>
                    <ServiceSectionCard title="5.4 Konektory a fázy">
                      <ServiceReadRow label="connectivity.ocpp.key.NumberOfConnectors" value={formatServiceNumber(language, serviceOcppConfig.NumberOfConnectors)} />
                      {runtimeConnectors.map((connector) => (
                        <ServiceSelectRow
                          key={`phase-${connector.id}`}
                          label={`connectivity.ocpp.key.ConnectorPhaseRotation.${connector.parkingSpot}`}
                          value={serviceConnectorState[connector.id]?.connectorPhaseRotation ?? 'Unknown'}
                          onPress={() =>
                            updateServiceConnectorState(
                              connector.id,
                              'connectorPhaseRotation',
                              cycleValue(
                                SERVICE_CONNECTOR_PHASE_ROTATION_OPTIONS,
                                serviceConnectorState[connector.id]?.connectorPhaseRotation ?? 'Unknown'
                              )
                            )
                          }
                        />
                      ))}
                      <ServiceReadRow label="connectivity.ocpp.key.ConnectorPhaseRotationMaxLength" value={formatServiceNumber(language, serviceOcppConfig.ConnectorPhaseRotationMaxLength)} />
                      <ServiceToggleRow label="connectivity.ocpp.key.StopTransactionOnEVSideDisconnect" on={serviceOcppConfig.StopTransactionOnEVSideDisconnect} onToggle={() => setServiceOcppConfig((prev) => ({ ...prev, StopTransactionOnEVSideDisconnect: !prev.StopTransactionOnEVSideDisconnect }))} />
                      <ServiceToggleRow label="connectivity.ocpp.key.UnlockConnectorOnEVSideDisconnect" on={serviceOcppConfig.UnlockConnectorOnEVSideDisconnect} onToggle={() => setServiceOcppConfig((prev) => ({ ...prev, UnlockConnectorOnEVSideDisconnect: !prev.UnlockConnectorOnEVSideDisconnect }))} />
                      <ServiceChipsRow label="connectivity.ocpp.key.SupportedFeatureProfiles" values={serviceOcppConfig.SupportedFeatureProfiles} />
                      <ServiceReadRow label="connectivity.ocpp.key.SupportedFeatureProfilesMaxLength" value={formatServiceNumber(language, serviceOcppConfig.SupportedFeatureProfilesMaxLength)} />
                      <ServiceStatusRow label="connectivity.ocpp.key.ReserveConnectorZeroSupported" on={serviceOcppConfig.ReserveConnectorZeroSupported} />
                      <ServiceReadRow label="connectivity.ocpp.key.ChargeProfileMaxStackLevel" value={formatServiceNumber(language, serviceOcppConfig.ChargeProfileMaxStackLevel)} />
                      <ServiceChipsRow label="connectivity.ocpp.key.ChargingScheduleAllowedChargingRateUnit" values={serviceOcppConfig.ChargingScheduleAllowedChargingRateUnit} />
                      <ServiceReadRow label="connectivity.ocpp.key.ChargingScheduleMaxPeriods" value={formatServiceNumber(language, serviceOcppConfig.ChargingScheduleMaxPeriods)} />
                      <ServiceStatusRow label="connectivity.ocpp.key.ConnectorSwitch3to1PhaseSupported" on={serviceOcppConfig.ConnectorSwitch3to1PhaseSupported} />
                      <ServiceReadRow label="connectivity.ocpp.key.MaxChargingProfilesInstalled" value={formatServiceNumber(language, serviceOcppConfig.MaxChargingProfilesInstalled)} />
                    </ServiceSectionCard>
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceFirmware' && (
                <FullscreenOverlay
                  title="Firmware update"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceSettings')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="6.1 Stav update">
                      <ServiceReadRow label="system.fwUpdate.status" value={serviceFirmwareStatus} />
                      <ServiceReadRow label="system.fwUpdate.fileVersion" value={SERVICE_FIRMWARE_GLOBAL_VERSION} />
                      <ServiceProgressRow label="system.fwUpdate.moduleProgress" current={serviceFirmwareModuleProgress} max={runtimeConnectors.length} />
                      <ServiceReadRow label="firmware.fileName" value={SERVICE_FIRMWARE_GLOBAL_FILE} targetChars={56} />
                    </ServiceSectionCard>
                    {runtimeConnectors.map((connector) => (
                      <ServiceSectionCard key={`fw-${connector.id}`} title={connector.parkingSpot}>
                        <ServiceReadRow label="connector[].evm.fw.version" value={serviceConnectorState[connector.id]?.evmFwVersion ?? 0} />
                        <ServiceReadRow label="firmware.sendState" value={serviceFirmwareConnectorStatusText(language, connector.id)} targetChars={54} />
                      </ServiceSectionCard>
                    ))}
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceConnectors' && (
                <FullscreenOverlay
                  title="Konektory"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceSettings')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="7.1 Zoznam konektorov">
                      <Text style={styles.infoReaderCardText}>Vyberte konektor pre detailné servisné obrazovky.</Text>
                    </ServiceSectionCard>
                    {runtimeConnectors.map((connector) => (
                      <ServiceSectionCard key={`connector-list-${connector.id}`} title={connector.parkingSpot}>
                        <ServiceReadRow label="connector[].evseCpoId" value={connector.evseCpoId} />
                        <ServiceReadRow label="connector[].powerType" value={connector.powerType} />
                        <ServiceReadRow label="connector[].plugType" value={connector.plugType} />
                        <ServiceReadRow label="connector[].maxAmps" value={formatServiceNumber(language, connector.maxAmps)} />
                        <ServiceReadRow label="connector[].parkingSpot" value={connector.parkingSpot} />
                        <ServiceReadRow label="connector[].evm.state" value={serviceConnectorState[connector.id]?.evmState ?? 'AVAILABLE'} />
                        <ServiceReadRow label="connector[].meter.state" value={serviceConnectorState[connector.id]?.meterState ?? 'AVAILABLE'} />
                        <ServiceReadRow label="connector[].ocpp.status" value={connector.ocpp.status} />
                        <ServiceReadRow label="connector[].activeTx.id" value={connector.activeTx?.id ?? '—'} />
                        <ServiceToggleRow
                          label="connector[].evm.manual.enabled"
                          on={serviceConnectorState[connector.id]?.evmManualEnabled ?? false}
                          onToggle={() =>
                            updateServiceConnectorState(
                              connector.id,
                              'evmManualEnabled',
                              !(serviceConnectorState[connector.id]?.evmManualEnabled ?? false)
                            )
                          }
                        />
                        <ServiceStatusRow label="connector[].hasPublicPolicy" on={connector.hasPublicPolicy} />
                        <ServiceStatusRow label="connector[].hasEroamingHubject" on={Boolean(connector.hasEroamingHubject)} />
                        <StationRfidQuickAction
                          icon="cog"
                          label="Setup"
                          onPress={() => openServiceConnectorScreen('serviceConnectorOverview', connector.id)}
                        />
                      </ServiceSectionCard>
                    ))}
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceConnectorOverview' && serviceSelectedConnector && serviceSelectedConnectorData && (
                <FullscreenOverlay
                  title={`${serviceSelectedConnector.parkingSpot} / Prehľad`}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceConnectors')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="7.2 Konektor / Prehľad">
                      <ServiceReadRow label="connector[].evseCpoId" value={serviceSelectedConnector.evseCpoId} />
                      <ServiceReadRow label="connector[].powerType" value={serviceSelectedConnector.powerType} />
                      <ServiceReadRow label="connector[].phases" value={formatServiceNumber(language, serviceSelectedConnector.phases)} />
                      <ServiceReadRow label="connector[].maxAmps" value={formatServiceNumber(language, serviceSelectedConnector.maxAmps)} />
                      <ServiceReadRow label="connector[].plugType" value={serviceSelectedConnector.plugType} />
                      <ServiceReadRow label="connector[].parkingSpot" value={serviceSelectedConnector.parkingSpot} />
                      <ServiceReadRow label="connector[].evm.state" value={serviceSelectedConnectorData.evmState} />
                      <ServiceReadRow label="connector[].meter.state" value={serviceSelectedConnectorData.meterState} />
                      <ServiceReadRow label="connector[].ocpp.status" value={serviceSelectedConnector.ocpp.status} />
                      <ServiceReadRow label="connector[].activeTx.id" value={serviceSelectedConnector.activeTx?.id ?? '—'} />
                      <ServiceToggleRow
                        label="connector[].evm.manual.enabled"
                        on={serviceSelectedConnectorData.evmManualEnabled}
                        onToggle={() =>
                          updateServiceConnectorState(
                            serviceSelectedConnector.id,
                            'evmManualEnabled',
                            !serviceSelectedConnectorData.evmManualEnabled
                          )
                        }
                      />
                      <ServiceStatusRow label="connector[].hasPublicPolicy" on={serviceSelectedConnector.hasPublicPolicy} />
                      <ServiceStatusRow label="connector[].hasEroamingHubject" on={Boolean(serviceSelectedConnector.hasEroamingHubject)} />
                      <ServiceStatusRow label="connector[].publicPolicy.validNow" on={serviceSelectedConnectorData.publicPolicyValidNow} />
                      <ServiceReadRow label="connector[].publicPolicy.price" value={formatServiceNumber(language, serviceSelectedConnector.publicPolicy.price, 2)} />
                      <ServiceReadRow label="connector[].publicPolicy.validTo" value={formatServiceDateTime(language, serviceSelectedConnectorData.publicPolicyValidTo)} />
                    </ServiceSectionCard>
                    <StationRfidQuickAction icon="microchip" label="EVM" onPress={() => openServiceConnectorScreen('serviceConnectorEvm')} />
                    <StationRfidQuickAction icon="tools" label="Manual" onPress={() => openServiceConnectorScreen('serviceConnectorEvmManual')} />
                    <StationRfidQuickAction icon="chart-line" label="ELM meter" onPress={() => openServiceConnectorScreen('serviceConnectorElm')} />
                    <StationRfidQuickAction icon="link" label="OCPP" onPress={() => openServiceConnectorScreen('serviceConnectorOcpp')} />
                    <StationRfidQuickAction icon="globe" label="Policy" onPress={() => openServiceConnectorScreen('serviceConnectorPolicy')} />
                    <StationRfidQuickAction icon="receipt" label="TX" onPress={() => openServiceConnectorScreen('serviceConnectorTx')} />
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceConnectorEvm' && serviceSelectedConnector && serviceSelectedConnectorData && (
                <FullscreenOverlay
                  title={`${serviceSelectedConnector.parkingSpot} / EVM`}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceConnectorOverview')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="7.3 Konektor / EVM">
                      <ServiceReadRow label="connector[].evm.lastResponse" value={formatServiceDateTime(language, serviceSelectedConnectorData.evmLastResponse)} />
                      <ServiceReadRow label="connector[].evm.budget" value={formatServiceNumber(language, serviceSelectedConnectorData.evmBudget)} />
                      <ServiceToggleRow label="connector[].evm.rcdEnabled" on={serviceSelectedConnectorData.evmRcdEnabled} onToggle={() => updateServiceConnectorState(serviceSelectedConnector.id, 'evmRcdEnabled', !serviceSelectedConnectorData.evmRcdEnabled)} />
                      <ServiceToggleRow label="connector[].evm.permanentLock" on={serviceSelectedConnectorData.evmPermanentLock} onToggle={() => updateServiceConnectorState(serviceSelectedConnector.id, 'evmPermanentLock', !serviceSelectedConnectorData.evmPermanentLock)} />
                      <ServiceReadRow label="connector[].evm.fw.version" value={formatServiceNumber(language, serviceSelectedConnectorData.evmFwVersion)} />
                      <ServiceReadRow label="connector[].evm.hwAddress" value={serviceSelectedConnectorData.evmHwAddress} />
                      <ServiceStatusRow label="connector[].evm.cibEnabled" on={serviceSelectedConnectorData.evmCibEnabled} />
                      <ServiceReadRow label="connector[].evm.cpV" value={formatServiceNumber(language, serviceSelectedConnectorData.evmCpV)} />
                      <ServiceStatusRow label="connector[].evm.rcdErr" on={serviceSelectedConnectorData.evmRcdErr} />
                      <ServiceStatusRow label="connector[].evm.do1" on={serviceSelectedConnectorData.evmDo1} />
                      <ServiceStatusRow label="connector[].evm.do2" on={serviceSelectedConnectorData.evmDo2} />
                      <ServiceStatusRow label="connector[].evm.lock" on={serviceSelectedConnectorData.evmLock} />
                      <ServiceReadRow label="connector[].evm.state" value={serviceSelectedConnectorData.evmState} />
                    </ServiceSectionCard>
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceConnectorEvmManual' && serviceSelectedConnector && serviceSelectedConnectorData && (
                <FullscreenOverlay
                  title={`${serviceSelectedConnector.parkingSpot} / EVM manual`}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceConnectorOverview')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="7.4 Konektor / EVM manual">
                      <ServiceToggleRow label="connector[].evm.manual.enabled" on={serviceSelectedConnectorData.evmManualEnabled} onToggle={() => updateServiceConnectorState(serviceSelectedConnector.id, 'evmManualEnabled', !serviceSelectedConnectorData.evmManualEnabled)} />
                      <ServiceInputRow label="connector[].evm.manual.budget" value={String(serviceSelectedConnectorData.evmManualBudget)} onChangeText={(value) => updateServiceConnectorState(serviceSelectedConnector.id, 'evmManualBudget', Number(value.replace(/[^\d]/g, '')) || 0)} keyboardType="numeric" />
                      <ServiceToggleRow label="connector[].evm.manual.do1" on={serviceSelectedConnectorData.evmManualDo1} onToggle={() => updateServiceConnectorState(serviceSelectedConnector.id, 'evmManualDo1', !serviceSelectedConnectorData.evmManualDo1)} />
                      <ServiceToggleRow label="connector[].evm.manual.do2" on={serviceSelectedConnectorData.evmManualDo2} onToggle={() => updateServiceConnectorState(serviceSelectedConnector.id, 'evmManualDo2', !serviceSelectedConnectorData.evmManualDo2)} />
                      <ServiceToggleRow label="connector[].evm.manual.lock" on={serviceSelectedConnectorData.evmManualLock} onToggle={() => updateServiceConnectorState(serviceSelectedConnector.id, 'evmManualLock', !serviceSelectedConnectorData.evmManualLock)} />
                      <ServiceToggleRow label="connector[].evm.manual.ignoreRcd" on={serviceSelectedConnectorData.evmManualIgnoreRcd} onToggle={() => updateServiceConnectorState(serviceSelectedConnector.id, 'evmManualIgnoreRcd', !serviceSelectedConnectorData.evmManualIgnoreRcd)} />
                    </ServiceSectionCard>
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceConnectorElm' && serviceSelectedConnector && serviceSelectedConnectorData && (
                <FullscreenOverlay
                  title={`${serviceSelectedConnector.parkingSpot} / ELM meter`}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceConnectorOverview')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="7.5 Konektor / ELM meter">
                      <ServiceReadRow label="connector[].meter.lastResponse" value={formatServiceDateTime(language, serviceSelectedConnectorData.meterLastResponse)} />
                      <ServiceReadRow label="connector[].meter.energy" value={formatServiceNumber(language, serviceSelectedConnectorData.meterEnergy, 1)} />
                      <ServiceChipsRow label="connector[].meter.energy.phase[]" values={serviceSelectedConnectorData.meterEnergyPhase.map((value, idx) => `L${idx + 1}: ${formatServiceNumber(language, value, 0)}`)} />
                      <ServiceChipsRow label="connector[].meter.voltage.phase[]" values={serviceSelectedConnectorData.meterVoltagePhase.map((value, idx) => `L${idx + 1}: ${formatServiceNumber(language, value, 1)}`)} />
                      <ServiceReadRow label="connector[].meter.power" value={formatServiceNumber(language, serviceSelectedConnectorData.meterPower, 1)} />
                      <ServiceChipsRow label="connector[].meter.power.phase[]" values={serviceSelectedConnectorData.meterPowerPhase.map((value, idx) => `L${idx + 1}: ${formatServiceNumber(language, value, 1)}`)} />
                      <ServiceChipsRow label="connector[].meter.current.phase[]" values={serviceSelectedConnectorData.meterCurrentPhase.map((value, idx) => `L${idx + 1}: ${formatServiceNumber(language, value, 1)}`)} />
                      <ServiceReadRow label="connector[].meter.countImp" value={formatServiceNumber(language, serviceSelectedConnectorData.meterCountImp)} />
                      <ServiceReadRow label="connector[].meter.countImpLast" value={formatServiceNumber(language, serviceSelectedConnectorData.meterCountImpLast)} />
                      <ServiceReadRow label="connector[].meter.state" value={serviceSelectedConnectorData.meterState} />
                    </ServiceSectionCard>
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceConnectorOcpp' && serviceSelectedConnector && serviceSelectedConnectorData && (
                <FullscreenOverlay
                  title={`${serviceSelectedConnector.parkingSpot} / OCPP`}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceConnectorOverview')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="7.6 Konektor / OCPP">
                      <ServiceReadRow label="connector[].ocpp.status" value={serviceSelectedConnector.ocpp.status} />
                      <ServiceReadRow label="connector[].ocpp.statusLastSent" value={serviceSelectedConnectorData.ocppStatusLastSent} />
                      <ServiceReadRow label="connector[].ocpp.statusChangedAt" value={formatServiceDateTime(language, serviceSelectedConnectorData.ocppStatusChangedAt)} />
                    </ServiceSectionCard>
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceConnectorPolicy' && serviceSelectedConnector && serviceSelectedConnectorData && (
                <FullscreenOverlay
                  title={`${serviceSelectedConnector.parkingSpot} / Politika a roaming`}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceConnectorOverview')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="7.7 Konektor / Politika a roaming">
                      <ServiceChipsRow label="connector[].eroamingEmpList" values={serviceSelectedConnector.eroamingEmpList ?? []} />
                      <ServiceReadRow label="connector[].publicPolicy.policyEndUtc" value={formatServiceDateTime(language, serviceSelectedConnectorData.publicPolicyPolicyEndUtc)} />
                      <ServiceStatusRow label="connector[].publicPolicy.withoutTimeSchedule" on={serviceSelectedConnectorData.publicPolicyWithoutTimeSchedule} />
                      <ServiceStatusRow label="connector[].publicPolicy.scheduleActiveNow" on={serviceSelectedConnectorData.publicPolicyScheduleActiveNow} />
                      <ServiceChipsRow label="connector[].publicPolicy.schedule[]" values={serviceSelectedConnectorData.publicPolicySchedule} />
                    </ServiceSectionCard>
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceConnectorTx' && serviceSelectedConnector && serviceSelectedConnectorData && (
                <FullscreenOverlay
                  title={`${serviceSelectedConnector.parkingSpot} / Aktívna transakcia`}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceConnectorOverview')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title="7.8 Konektor / Aktívna transakcia">
                      <ServiceReadRow label="connector[].activeTx.id" value={serviceSelectedConnector.activeTx?.id ?? '—'} />
                      <ServiceStatusRow label="connector[].activeTx.hasReachedCharging" on={serviceSelectedConnectorData.activeTxHasReachedCharging} />
                      <ServiceReadRow label="connector[].activeTx.meterValueStartWh" value={formatServiceNumber(language, serviceSelectedConnectorData.activeTxMeterValueStartWh)} />
                      <ServiceReadRow label="connector[].activeTx.meterValueEndWh" value={formatServiceNumber(language, serviceSelectedConnectorData.activeTxMeterValueEndWh)} />
                      <ServiceReadRow label="connector[].activeTx.tagId" value={serviceSelectedConnectorData.activeTxTagId} />
                      <ServiceReadRow label="connector[].activeTx.userId" value={serviceSelectedConnectorData.activeTxUserId} />
                      <ServiceReadRow label="connector[].activeTx.avPolicyType" value={serviceSelectedConnectorData.activeTxAvPolicyType} />
                      <ServiceJsonRow label="connector[].activeTx.priceMeta" value={serviceSelectedConnectorData.activeTxPriceMeta} />
                      <ServiceReadRow label="connector[].activeTx.chargingTime" value={serviceSelectedConnectorData.activeTxChargingTime} />
                      <ServiceReadRow label="connector[].activeTx.suspendedByUserTime" value={serviceSelectedConnectorData.activeTxSuspendedByUserTime} />
                      <ServiceReadRow label="connector[].activeTx.vatRate" value={formatServiceNumber(language, serviceSelectedConnectorData.activeTxVatRate, 2)} />
                      <ServiceReadRow label="connector[].activeTx.costWithVat" value={formatServiceNumber(language, serviceSelectedConnectorData.activeTxCostWithVat, 2)} />
                      <ServiceReadRow label="connector[].activeTx.chargingStartTs" value={formatServiceDateTime(language, serviceSelectedConnectorData.activeTxChargingStartTs)} />
                      <ServiceReadRow label="connector[].activeTx.chargingEndTs" value={formatServiceDateTime(language, serviceSelectedConnectorData.activeTxChargingEndTs)} />
                    </ServiceSectionCard>
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'serviceBrowser' && (
                <FullscreenOverlay
                  title={t(language, 'service.browser.title')}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.serviceMenu}
                  bubbleSnapScroll
                  onClose={() => setScreen('serviceSettings')}
                  useBackButton
                  backAccessibilityLabel={overlayBackAccessibilityLabel}
                  scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
                  scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
                >
                  <View style={styles.infoReaderScrollInner}>
                    <ServiceSectionCard title={t(language, 'service.card.browser')}>
                      <Text style={styles.serviceFieldLabel}>{t(language, 'service.browser.url')}</Text>
                      <TextInput
                        value={serviceBrowserUrl}
                        onChangeText={setServiceBrowserUrl}
                        style={styles.serviceUrlInput}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <Text style={styles.infoReaderCardText}>{t(language, 'service.browser.hint')}</Text>
                    </ServiceSectionCard>
                    <ServiceQuickPair
                      left={
                        <StationRfidQuickAction
                          icon="qrcode"
                          label={t(language, 'service.browser.showQr')}
                          onPress={() =>
                            openQr(t(language, 'service.browser.title'), serviceBrowserUrl, { returnTo: 'serviceBrowser' })
                          }
                        />
                      }
                      right={
                        <StationRfidQuickAction
                          icon="external-link-alt"
                          label={t(language, 'service.browser.open')}
                          onPress={() => {
                            void Linking.openURL(serviceBrowserUrl).catch(() =>
                              showKioskToastAlert(
                                t(language, 'service.browser.title'),
                                t(language, 'service.browser.openFailed')
                              )
                            );
                          }}
                        />
                      }
                    />
                  </View>
                </FullscreenOverlay>
              )}

                </View>
                </ContentIconScaleContext.Provider>
              </ContentTextScaleContext.Provider>
            </ServiceLanguageContext.Provider>
          </View>
        </View>
      </KioskViewport>

      <Modal visible={rfidTapModalVisible} transparent animationType="fade">
        <View style={[styles.rfidTapModalRoot, KIOSK_NO_SELECT_WEB]} pointerEvents="none">
          <View style={styles.rfidTapModalCard}>
            {rfidTapFeedback === 'ok' ? (
              <AppIcon name="check" size={112} color="#000000" />
            ) : rfidTapFeedback === 'reject' ? (
              <AppIcon name="do-not-enter" size={112} color="#000000" />
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

function ServicePinContent({
  title,
  pinLength = SERVICE_PIN_LENGTH,
  compact = false,
  pinInput,
  error,
  onInput,
  onDelete,
  onSubmit,
}: {
  title: string;
  pinLength?: number;
  /** Modal mimo KioskViewport: menšia typografia, aby sa zhodovalo s FullscreenOverlay v 720px plátne. */
  compact?: boolean;
  pinInput: string;
  error: string;
  onInput: (digit: string) => void;
  onDelete: () => void;
  onSubmit: () => void;
}) {
  const keypadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];
  const backspaceIconSize = compact
    ? Math.round(STATION_FONT * 0.58)
    : Math.round(STATION_FONT * 0.95);
  const titleStyle = compact ? styles.servicePinTitleCompact : styles.servicePinTitle;
  const boxStyle = compact ? styles.servicePinBoxCompact : styles.servicePinBox;
  const valueStyle = compact ? styles.servicePinValueCompact : styles.servicePinValue;
  const errorStyle = compact ? styles.servicePinErrorCompact : styles.servicePinError;
  const keyTextStyle = compact ? styles.serviceKeyTextCompact : styles.serviceKeyText;
  const okTextStyle = compact ? styles.serviceKeyOkTextCompact : styles.serviceKeyOkText;
  return (
    <ContentTextScaleContext.Provider value={1}>
      <ContentIconScaleContext.Provider value={1}>
        <View style={styles.servicePinWrap}>
          <View style={styles.servicePinTop}>
            <FitText
              style={titleStyle}
              numberOfLines={compact ? 3 : 4}
              targetChars={compact ? 40 : 48}
              minScale={0.26}
            >
              {title}
            </FitText>
            <View style={boxStyle}>
              <Text style={valueStyle}>{pinInput.replace(/./g, '*').padEnd(pinLength, '_')}</Text>
            </View>
            {error ? (
              <FitText style={errorStyle} numberOfLines={5} targetChars={60} minScale={0.24}>
                {error}
              </FitText>
            ) : null}
          </View>

          <View style={styles.serviceKeypad}>
            {keypadRows.map((row) => (
              <View key={row.join('-')} style={styles.serviceKeypadRow}>
                {row.map((cell) => (
                  <Pressable
                    key={cell}
                    style={({ pressed }) => [styles.serviceKey, pressed && styles.infoActionPressed]}
                    onPress={() => onInput(cell)}
                  >
                    <Text style={keyTextStyle}>{cell}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            <View style={styles.serviceKeypadRow}>
              <Pressable
                accessibilityLabel="Zmazať poslednú číslicu"
                style={({ pressed }) => [styles.serviceKey, styles.serviceKeyDelete, pressed && styles.infoActionPressed]}
                onPress={onDelete}
              >
                <AppIcon name="backspace" size={backspaceIconSize} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.serviceKey, pressed && styles.infoActionPressed]}
                onPress={() => onInput('0')}
              >
                <Text style={keyTextStyle}>0</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="OK"
                style={({ pressed }) => [styles.serviceKey, styles.serviceKeyOk, pressed && styles.infoActionPressed]}
                onPress={onSubmit}
              >
                <Text style={okTextStyle}>OK</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ContentIconScaleContext.Provider>
    </ContentTextScaleContext.Provider>
  );
}

function TopHeader({
  lang,
  providerName,
  providerLogo,
  now,
  isNetworkOnline,
  networkType,
  ocppConnectionState,
  onCycleNetwork,
  onCycleOcpp,
  magnifierOn,
  onToggleMagnifier,
  onLogoTap,
  onOwnerPress,
}: {
  lang: LanguageCode;
  providerName: string;
  providerLogo: string;
  now: Date;
  isNetworkOnline: boolean;
  networkType: NetworkType;
  ocppConnectionState: OcppConnectionState;
  onCycleNetwork: () => void;
  onCycleOcpp: () => void;
  magnifierOn: boolean;
  onToggleMagnifier: () => void;
  onLogoTap: () => void;
  onOwnerPress: () => void;
}) {
  const providerMultiWord = providerName.trim().includes(' ');
  const locale = lang === 'DE' ? 'de-DE' : lang === 'EN' ? 'en-GB' : 'sk-SK';
  const dateTime = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  const networkIcon: React.ComponentProps<typeof FontAwesome5>['name'] =
    networkType === 'wifi' ? 'wifi' : networkType === '4g' ? 'signal' : 'network-wired';
  const ocppIcon: React.ComponentProps<typeof FontAwesome5>['name'] =
    ocppConnectionState === 'ok'
      ? 'link'
      : ocppConnectionState === 'connecting'
        ? 'sync-alt'
        : 'unlink';

  return (
    <View style={styles.header}>
      <Pressable
        style={({ pressed }) => [styles.headerThird, styles.headerThirdLeft, styles.headerOwnerPressable, pressed && styles.headerOwnerPressed]}
        onPress={onOwnerPress}
        accessibilityRole="button"
        accessibilityLabel="Domov"
      >
        <View style={styles.ownerNameRow}>
          {lang === 'DEV' ? (
            <FitText style={styles.headerIconTypeKey} minScale={0.52} targetChars={18}>
              {'{system.iconType}'}
            </FitText>
          ) : (
            <AppIcon name="user-tie" size={28} />
          )}
          <ZoomAdaptiveText
            style={styles.headerProviderName}
            zoomMaxLines={providerMultiWord ? 2 : 1}
            zoomTargetCharsPerLine={providerMultiWord ? 9 : 14}
            zoomMinScale={0.6}
            fitSingleLine={!providerMultiWord}
          >
            {devVar(lang, providerName, 'operator.owner.name')}
          </ZoomAdaptiveText>
        </View>
      </Pressable>

      <View style={[styles.headerThird, styles.headerThirdCenter]}>
        <FitText style={styles.headerDateTime} minScale={0.52} targetChars={22} numberOfLines={1}>
          {dateTime}
        </FitText>
        <View style={styles.networkLine}>
          <Pressable onPress={onCycleNetwork} style={styles.headerIconPressTarget}>
            {lang === 'DEV' ? (
              <FitText style={styles.headerNetworkKey} minScale={0.52} targetChars={20}>
                {'{system.activeNetwork}'}
              </FitText>
            ) : isNetworkOnline ? (
              <AppIcon name={networkIcon} size={18} />
            ) : (
              <AppIcon name="times-circle" size={17} />
            )}
          </Pressable>
          {lang !== 'DEV' ? (
            <Pressable onPress={onCycleOcpp} style={styles.ocppBadge}>
              <AppIcon name={ocppIcon} size={18} />
              <RNText style={styles.ocppBadgeText}>OCPP</RNText>
            </Pressable>
          ) : null}
          {lang === 'DEV' ? (
            <Pressable onPress={onCycleOcpp} style={styles.headerIconPressTarget}>
              <FitText style={styles.headerNetworkKey} minScale={0.52} targetChars={24}>
                {'{system.ocppConnectionState}'}
              </FitText>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={[styles.headerThird, styles.headerThirdRight]}>
        <View style={styles.headerRightRow}>
          <Pressable style={styles.logoBox} onPress={onLogoTap}>
            {lang === 'DEV' ? (
              <FitText style={styles.logoWordmark} minScale={0.4} targetChars={10}>
                {devVar(lang, providerLogo, 'operator.provider.logo')}
              </FitText>
            ) : (
              <Image source={AGEVOLT_LOGO} style={styles.logoImage} resizeMode="contain" />
            )}
          </Pressable>
          <Pressable
            style={[styles.topMagnifierButton, magnifierOn && styles.topMagnifierButtonActive]}
            onPress={onToggleMagnifier}
          >
            <AppIcon
              name={magnifierOn ? 'search-minus' : 'search-plus'}
              size={magnifierOn ? 46 : 36}
              color={magnifierOn ? '#ffffff' : '#000000'}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function StationSection({
  lang,
  stationLocationName,
  stationName,
  stationDeviceId,
  children,
  showStationBack,
  onStationHomePress,
  onStationDeviceIdPress,
  compact,
}: {
  lang: LanguageCode;
  stationLocationName: string;
  stationName: string;
  stationDeviceId: string;
  children: ReactNode;
  showStationBack?: boolean;
  onStationHomePress?: () => void;
  /** Mock: prepínač 1× / 2× konektor v UI (tap na Device ID) — len na prehľade stanice, nie v detaile konektora. */
  onStationDeviceIdPress?: () => void;
  compact?: boolean;
}) {
  const locationLabel = lang === 'DEV' ? '{station.location.name}' : stationLocationName;
  const nameLabel = lang === 'DEV' ? '{station.name}' : stationName;
  const deviceIdRaw = lang === 'DEV' ? '{station.ocppDeviceId}' : stationDeviceId;
  const deviceIdShort = lang === 'DEV' ? deviceIdRaw : deviceIdRaw.slice(0, 8);
  const deviceIdMaxLines = deviceIdShort.length > 8 ? 2 : 1;

  const headerContent = (
    <>
      {showStationBack ? (
        <View style={[styles.stationBackStrip, { pointerEvents: 'none' }]}>
          <RNText style={styles.stationBackArrow}>‹</RNText>
        </View>
      ) : null}
      <View style={[styles.stationHeaderLeft, showStationBack && styles.stationHeaderLeftWithBack]}>
        <View style={styles.stationHeaderNameRow}>
          <ContentIconScaleContext.Provider value={1}>
            <AppIcon name="location-dot" size={39} />
          </ContentIconScaleContext.Provider>
          <ZoomAdaptiveText
            style={styles.stationHeaderText}
            zoomMaxLines={1}
            zoomTargetCharsPerLine={18}
            zoomMinScale={0.28}
            fitSingleLine
          >
            {locationLabel}
          </ZoomAdaptiveText>
        </View>
        <View style={styles.stationHeaderNameRow}>
          <ContentIconScaleContext.Provider value={1}>
            <AppIcon name="charging-station" size={39} />
          </ContentIconScaleContext.Provider>
          <ZoomAdaptiveText
            style={styles.stationHeaderText}
            zoomMaxLines={1}
            zoomTargetCharsPerLine={18}
            zoomMinScale={0.28}
            fitSingleLine
          >
            {nameLabel}
          </ZoomAdaptiveText>
        </View>
      </View>
      <View style={styles.stationHeaderDivider} />
      <View style={styles.stationHeaderRight}>
        {onStationDeviceIdPress ? (
          <Pressable
            onPress={onStationDeviceIdPress}
            accessibilityRole="button"
            accessibilityLabel="Toggle single / dual connector UI (mock)"
            style={styles.stationHeaderDeviceIdPress}
          >
            <ZoomAdaptiveText
              style={styles.stationHeaderIdText}
              zoomMaxLines={deviceIdMaxLines}
              zoomTargetCharsPerLine={8}
              zoomMinScale={0.26}
              fitSingleLine={deviceIdMaxLines === 1}
            >
              {deviceIdShort}
            </ZoomAdaptiveText>
          </Pressable>
        ) : (
          <ZoomAdaptiveText
            style={styles.stationHeaderIdText}
            zoomMaxLines={deviceIdMaxLines}
            zoomTargetCharsPerLine={8}
            zoomMinScale={0.26}
            fitSingleLine={deviceIdMaxLines === 1}
          >
            {deviceIdShort}
          </ZoomAdaptiveText>
        )}
      </View>
    </>
  );

  return (
    <View style={[styles.stationShell, compact && styles.stationShellCompact]}>
      {showStationBack && onStationHomePress ? (
        <Pressable
          style={({ pressed }) => [
            styles.stationHeader,
            styles.stationHeaderWithBackStrip,
            pressed && styles.stationHeaderPressed,
          ]}
          onPress={onStationHomePress}
        >
          {headerContent}
        </Pressable>
      ) : (
        <View style={styles.stationHeader}>{headerContent}</View>
      )}
      <View style={styles.stationBody}>{children}</View>
    </View>
  );
}

function QuickActionsBar({
  lang,
  onInfo,
  onSupport,
  onLanguage,
}: {
  lang: LanguageCode;
  onInfo: () => void;
  onSupport: () => void;
  onLanguage: () => void;
}) {
  return (
    <View style={styles.actionsRow}>
      <ActionButton icon="info-circle" label={t(lang, 'actions.info')} onPress={onInfo} />
      <ActionButton icon="headset" label={t(lang, 'actions.support')} onPress={onSupport} />
      <ActionButton
        icon="globe-europe"
        label={lang}
        onPress={onLanguage}
      />
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof FontAwesome5>['name'];
  label: string;
  onPress: () => void;
}) {
  const contentTextScale = useContext(ContentTextScaleContext);
  const isZoomed = contentTextScale > 1;
  return (
    <Pressable style={[styles.actionButton, isZoomed && styles.actionButtonZoom]} onPress={onPress}>
      <View style={[styles.actionIconSlot, isZoomed && styles.actionIconSlotZoom]}>
        <ContentIconScaleContext.Provider value={1}>
          <AppIcon name={icon} size={isZoomed ? 39 : 26} />
        </ContentIconScaleContext.Provider>
      </View>
      <ZoomAdaptiveText
        style={styles.actionLabel}
        zoomMaxLines={isZoomed ? 1 : 2}
        zoomTargetCharsPerLine={10}
        zoomMinScale={0.35}
      >
        {label}
      </ZoomAdaptiveText>
      <View style={styles.actionButtonStrip}>
        <RNText style={styles.actionButtonStripArrow}>›</RNText>
      </View>
    </Pressable>
  );
}

function FitText({
  children,
  style,
  minScale = 0.28,
  targetChars = 14,
  numberOfLines,
}: {
  children: ReactNode;
  style: StyleProp<TextStyle>;
  minScale?: number;
  targetChars?: number;
  numberOfLines?: number;
}) {
  const lines = numberOfLines ?? 2;
  const targetCharsPerLine = Math.max(3, Math.ceil(targetChars / lines));

  return (
    <ZoomAdaptiveText
      style={style}
      zoomMaxLines={lines}
      zoomTargetCharsPerLine={targetCharsPerLine}
      zoomMinScale={minScale}
      fitSingleLine={lines === 1}
    >
      {children}
    </ZoomAdaptiveText>
  );
}

function toFaExportName(name: string): string {
  const parts = name.split('-').filter(Boolean);
  return `fa${parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`;
}

function resolveProIcon(name: string, preferRegular: boolean): IconDefinition | null {
  const exportName = toFaExportName(name);
  const regular = faProRegular[exportName];
  const solid = faProSolid[exportName];
  if (preferRegular) return regular ?? solid ?? null;
  return solid ?? regular ?? null;
}

function AppIcon({
  name,
  size,
  color = '#000000',
}: {
  name: React.ComponentProps<typeof FontAwesome5>['name'] | 'car-side-bolt' | 'do-not-enter';
  size?: number;
  color?: string;
}) {
  const useRegular = APP_ICON_TYPE === 'regular';
  const contentIconScale = useContext(ContentIconScaleContext);
  const renderedSize = Math.max(size ?? ICON_SIZE, ICON_SIZE) * contentIconScale;
  /** FA6 check — RFID OK modál, neprebíja Pro. */
  if (name === 'check') {
    return <FontAwesome6 name="check" size={renderedSize} color={color} />;
  }
  const proIcon = resolveProIcon(name, useRegular);
  if (proIcon) {
    return <FontAwesomeIcon icon={proIcon} size={renderedSize} color={color} />;
  }
  if (name === 'car-side-bolt') {
    return <FontAwesome6 name="car-side-bolt" size={renderedSize} color={color} />;
  }
  /** FA6 — RFID zamietnuté (kruh s čiarou). */
  if (name === 'do-not-enter') {
    return <FontAwesome6 name="circle-minus" size={renderedSize} color={color} />;
  }
  return (
    <FontAwesome5
      name={name}
      size={renderedSize}
      color={color}
      solid={!useRegular}
      regular={useRegular}
    />
  );
}

function getPlugTypeTranslationKey(plugType: string): string | null {
  const value = plugType.trim().toLowerCase();
  if (value === 'type 2 outlet') return 'connector.plugType.type2Outlet';
  return null;
}

function buildIdleRfidLines(lang: LanguageCode, providerName: string, connector: TpConnector): string[] {
  const lead = t(lang, 'connector.detail.rfid.lead').replace('{provider}', providerName);
  const lines = [lead];
  if (connector.hasEroamingHubject && (connector.eroamingEmpList?.length ?? 0) > 0) {
    const list = (connector.eroamingEmpList ?? []).join(', ');
    lines.push(t(lang, 'connector.detail.rfid.roaming').replace('{list}', list));
  }
  return lines;
}

function formatQrHeaderEvseId(rawTitle: string): string {
  const evseId = rawTitle.includes(' - ') ? rawTitle.split(' - ').slice(-1)[0].trim() : rawTitle;
  if (!evseId.startsWith('SK*AGV')) return evseId;
  let stars = 0;
  for (let i = 0; i < evseId.length; i += 1) {
    if (evseId[i] === '*') {
      stars += 1;
      if (stars === 3) return evseId.slice(i + 1);
    }
  }
  return evseId;
}

type AccessMode = 'free' | 'private' | 'public';

/** Rozdelenie e-mailu pred / za @ pre dva riadky (iba ak sú obe časti neprázdne). */
function splitEmailAtSign(email: string): { local: string; domain: string } | null {
  const s = email.trim();
  const i = s.indexOf('@');
  if (i <= 0 || i >= s.length - 1) return null;
  const local = s.slice(0, i).trim();
  const domain = s.slice(i + 1).trim();
  if (!local || !domain) return null;
  return { local, domain };
}

function getAccessModeFromConnector(connector: TpConnector): AccessMode {
  if (connector.access.unauthorizedFreeCharging) return 'free';
  if (connector.access.publicCharging) return 'public';
  return 'private';
}

/** Riadok vo full-screen výbere vozidla: SPZ a názov oddelene (bez „|“), prázdne riadky sa nevykreslia. */
function StationRfidPickerVehicleRow({ vehicle, onPress }: { vehicle: MockVehicle; onPress: () => void }) {
  const plate = (vehicle.plate ?? '').trim();
  const name = (vehicle.name ?? '').trim();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.stationRfidPickerVehicleRowButton,
        pressed && styles.connectorBubblePressed,
      ]}
    >
      <View style={styles.stationRfidPickerVehicleRowMain}>
        <AppIcon name="car" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
        <View style={styles.stationRfidPickerVehicleLines}>
          {plate.length > 0 ? (
            <FitText
              style={styles.stationRfidPickerVehiclePlateLine}
              numberOfLines={1}
              targetChars={14}
              minScale={0.36}
            >
              {plate}
            </FitText>
          ) : null}
          {name.length > 0 ? (
            <FitText
              style={styles.stationRfidPickerVehicleNameLine}
              numberOfLines={2}
              targetChars={28}
              minScale={0.34}
            >
              {name}
            </FitText>
          ) : null}
        </View>
      </View>
      <View style={[styles.stationRfidActionButtonStrip, styles.stationRfidActionButtonStripRight]}>
        <RNText style={styles.stationRfidActionButtonArrow}>›</RNText>
      </View>
    </Pressable>
  );
}

function StationRfidQuickAction({
  label,
  icon,
  onPress,
  secondary = false,
  omitIcon = false,
  stripPosition = 'right',
  disabled = false,
  style,
}: {
  label: string;
  icon?: React.ComponentProps<typeof FontAwesome5>['name'] | 'do-not-enter';
  onPress: () => void;
  secondary?: boolean;
  /** Len text + šípka (napr. „Pridať do konta“ bez ikony karty). */
  omitIcon?: boolean;
  /** Čierny pruh: vpravo (štandard) alebo vľavo (napr. Späť v prihlasovacom kroku). */
  stripPosition?: 'left' | 'right';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const contentTextScale = useContext(ContentTextScaleContext);
  const isZoomed = contentTextScale > 1;
  /** Pri lupe musí bublina narásť — pevná maxHeight 96 px text orezávala. */
  const bubbleMinHeight = Math.round(CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT * (isZoomed ? contentTextScale : 1));
  const stripW = Math.round(34 * (isZoomed ? contentTextScale : 1));
  const mainPadEnd = Math.round(44 * (isZoomed ? contentTextScale : 1));
  const iconSize = Math.round(CONNECTOR_IDLE_ROW_ICON_SIZE * (isZoomed ? contentTextScale : 1));
  const stripOnLeft = stripPosition === 'left';
  const stripStyle = isZoomed ? { width: stripW, minWidth: stripW, maxWidth: stripW } : null;
  const mainStripStyle = stripOnLeft
    ? { paddingLeft: mainPadEnd, paddingRight: 12 }
    : { paddingLeft: 12, paddingRight: mainPadEnd };
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stationRfidActionButton,
        !isZoomed && styles.stationRfidActionButtonHeightLock,
        isZoomed && { minHeight: bubbleMinHeight },
        secondary && styles.stationRfidActionButtonSecondary,
        !disabled && pressed && styles.connectorBubblePressed,
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {stripOnLeft ? (
        <View style={[styles.stationRfidActionButtonStrip, styles.stationRfidActionButtonStripLeft, stripStyle]}>
          <RNText style={styles.stationRfidActionButtonArrow}>‹</RNText>
        </View>
      ) : null}
      <View
        style={[
          styles.stationRfidActionButtonMain,
          stripOnLeft ? styles.stationRfidActionButtonMainStripLeft : styles.stationRfidActionButtonMainStripRight,
          isZoomed && mainStripStyle,
          isZoomed && { minHeight: bubbleMinHeight },
        ]}
      >
        {!omitIcon && icon ? <AppIcon name={icon} size={iconSize} /> : null}
        <FitText
          style={styles.stationRfidModalActionLabelText}
          numberOfLines={2}
          targetChars={omitIcon ? 22 : 16}
          minScale={0.38}
        >
          {label}
        </FitText>
      </View>
      {!stripOnLeft ? (
        <View style={[styles.stationRfidActionButtonStrip, styles.stationRfidActionButtonStripRight, stripStyle]}>
          <RNText style={styles.stationRfidActionButtonArrow}>›</RNText>
        </View>
      ) : null}
    </Pressable>
  );
}

function ServiceSectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.infoReaderCard}>
      <RNText style={styles.infoReaderCardTitle}>{title}</RNText>
      <View style={styles.serviceSectionCardBody}>{children}</View>
    </View>
  );
}

function ServiceQuickPair({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <View style={styles.serviceQuickPairRow}>
      <View style={styles.serviceQuickPairCell}>{left}</View>
      <View style={styles.serviceQuickPairCell}>{right}</View>
    </View>
  );
}

function ServiceToggleChip({
  on,
  onToggle,
  disabled = false,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const scale = useContext(ContentTextScaleContext);
  return (
    <Pressable
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.serviceToggleChipBase,
        scale > 1 && styles.serviceToggleChipBaseZoom,
        on ? styles.serviceToggleChipOn : styles.serviceToggleChipOff,
        pressed && !disabled && styles.infoActionPressed,
      ]}
    >
      <RNText style={on ? styles.serviceToggleChipTextOn : styles.serviceToggleChipTextOff}>{on ? 'ON' : 'OFF'}</RNText>
    </Pressable>
  );
}

function ServiceFieldLabel({ label }: { label: string }) {
  const lang = useContext(ServiceLanguageContext);
  return (
    <FitText style={styles.serviceFieldKeyLabel} minScale={0.66} targetChars={18}>
      {serviceFieldLabelText(lang, label)}
    </FitText>
  );
}

function ServiceReadRow({
  label,
  value,
  targetChars = 42,
}: {
  label: string;
  value: string | number | null | undefined;
  targetChars?: number;
}) {
  const lang = useContext(ServiceLanguageContext);
  const text = value == null || value === '' ? '—' : String(value);
  return (
    <View style={styles.serviceFieldRow}>
      <ServiceFieldLabel label={label} />
      <View style={styles.serviceFieldValueWrap}>
        <FitText style={styles.serviceFieldValue} minScale={0.62} targetChars={targetChars}>
          {serviceHumanValue(lang, label, text)}
        </FitText>
      </View>
    </View>
  );
}

function ServiceStatusRow({ label, on }: { label: string; on: boolean }) {
  const lang = useContext(ServiceLanguageContext);
  return (
    <View style={styles.serviceFieldRowBetween}>
      <Text style={styles.serviceFieldLabelFlex}>{serviceFieldLabelText(lang, label)}</Text>
      <ServiceToggleChip on={on} onToggle={() => undefined} disabled />
    </View>
  );
}

function ServiceToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  const lang = useContext(ServiceLanguageContext);
  return (
    <View style={styles.serviceFieldRowBetween}>
      <Text style={styles.serviceFieldLabelFlex}>{serviceFieldLabelText(lang, label)}</Text>
      <ServiceToggleChip on={on} onToggle={onToggle} />
    </View>
  );
}

function ServiceInputRow({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  masked = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  masked?: boolean;
  multiline?: boolean;
}) {
  const scale = useContext(ContentTextScaleContext);
  return (
    <View style={styles.serviceFieldStack}>
      <ServiceFieldLabel label={label} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[
          styles.serviceFieldInput,
          multiline && styles.serviceFieldInputMultiline,
          scale > 1 && styles.serviceFieldInputZoom,
        ]}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={masked}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

function ServiceSelectRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const lang = useContext(ServiceLanguageContext);
  return (
    <View style={styles.serviceFieldRowBetween}>
      <Text style={styles.serviceFieldLabelFlex}>{serviceFieldLabelText(lang, label)}</Text>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.serviceValueChip, pressed && styles.infoActionPressed]}>
        <FitText style={styles.serviceValueChipText} minScale={0.42} targetChars={12}>
          {serviceHumanValue(lang, label, value)}
        </FitText>
      </Pressable>
    </View>
  );
}

function ServiceChipsRow({
  label,
  values,
  options,
  editable = false,
  onToggle,
}: {
  label: string;
  values: string[];
  options?: readonly string[];
  editable?: boolean;
  onToggle?: (value: string) => void;
}) {
  const lang = useContext(ServiceLanguageContext);
  const shownValues = editable ? options ?? [] : values;
  return (
    <View style={styles.serviceFieldStack}>
      <ServiceFieldLabel label={label} />
      <View style={styles.serviceChipWrap}>
        {shownValues.map((item) => {
          const active = values.includes(item);
          if (editable && onToggle) {
            return (
              <Pressable
                key={`${label}-${item}`}
                onPress={() => onToggle(item)}
                style={({ pressed }) => [
                  styles.servicePill,
                  active ? styles.servicePillActive : styles.servicePillInactive,
                  pressed && styles.infoActionPressed,
                ]}
              >
                <Text style={active ? styles.servicePillTextActive : styles.servicePillTextInactive}>
                  {serviceHumanValue(lang, label, item)}
                </Text>
              </Pressable>
            );
          }
          return (
            <View key={`${label}-${item}`} style={[styles.servicePill, styles.servicePillActive]}>
              <Text style={styles.servicePillTextActive}>{serviceHumanValue(lang, label, item)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ServiceJsonRow({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown>;
}) {
  const lang = useContext(ServiceLanguageContext);
  return (
    <View style={styles.serviceFieldStack}>
      <ServiceFieldLabel label={label} />
      <View style={styles.serviceJsonBox}>
        <Text style={styles.serviceJsonText}>{lang === 'DEV' ? JSON.stringify(value, null, 2) : JSON.stringify(value, null, 2)}</Text>
      </View>
    </View>
  );
}

function ServiceProgressRow({
  label,
  current,
  max,
}: {
  label: string;
  current: number;
  max: number;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return (
    <View style={styles.serviceFieldStack}>
      <ServiceReadRow label={label} value={`${current} / ${max}`} />
      <View style={styles.serviceProgressTrack}>
        <View style={[styles.serviceProgressFill, { width: `${ratio * 100}%` }]} />
      </View>
    </View>
  );
}

function StationRfidConnectorPanel({
  lang,
  decision,
  cardBlocked = false,
  reserveCostRowSlot = false,
  onStart,
  onStop,
  onMoreInfo,
}: {
  lang: LanguageCode;
  decision: StationConnectorDecision;
  /** Blokovaná karta: v bubline len Detail, bez ikony zákazu (tá je v hornom banneri). */
  cardBlocked?: boolean;
  /** Prázdny riadok rovnakej výšky ako suma — keď v druhom paneli suma je (zarovnanie tlačidiel). */
  reserveCostRowSlot?: boolean;
  onStart: () => void;
  onStop: () => void;
  onMoreInfo: () => void;
}) {
  const showPrimaryBlocked =
    !decision.canStop && !decision.canStart && !decision.canStartRoaming;
  const denyReason = decision.denyReasonKey ? t(lang, decision.denyReasonKey) : '';
  /** Pri aktívnej TX na konektore (cudzia / neautorizovaná) len Detail, bez ikony zákazu. */
  const showBlockedIconRow = showPrimaryBlocked && !cardBlocked && !decision.txActive && !decision.denyReasonKey;
  /** Stop / Start / blokácia pod Detailom — Detail má tenší okraj len ak niečo nasleduje. */
  const hasExtraActionsBelowDetail =
    decision.canStop || decision.canStart || decision.canStartRoaming || showBlockedIconRow || Boolean(denyReason);
  const startLabel = decision.canStart
    ? t(lang, 'rfid.station.action.start')
    : decision.canStartRoaming
      ? t(lang, 'rfid.station.action.startRoaming')
      : '';
  const startIcon = decision.canStartRoaming ? 'exchange-alt' : 'bolt';

  return (
    <View style={styles.stationRfidConnectorPanel}>
      <FitText style={styles.stationRfidConnectorSpot} numberOfLines={1} targetChars={6} minScale={0.52}>
        {decision.parkingSpot}
      </FitText>
      {decision.txTotalCostLabel ? (
        <View style={styles.connectorPreparingDetailMetricRowLeft}>
          <View style={styles.connectorVehicleSessionIconColumn}>
            <AppIcon name="coins" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
          </View>
          <View style={styles.connectorChargingTimeValueCol}>
            <FitText
              style={styles.stationRfidConnectorCostLine}
              numberOfLines={1}
              targetChars={14}
              minScale={0.42}
            >
              {decision.txTotalCostLabel}
            </FitText>
          </View>
        </View>
      ) : reserveCostRowSlot ? (
        <View
          style={[styles.connectorPreparingDetailMetricRowLeft, styles.stationRfidConnectorCostRowPlaceholder]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      {denyReason ? (
        <View style={styles.stationRfidConnectorReasonBox}>
          <FitText style={styles.stationRfidConnectorReasonText} numberOfLines={3} targetChars={42} minScale={0.28}>
            {denyReason}
          </FitText>
        </View>
      ) : null}

      <View style={styles.stationRfidConnectorActions}>
        {decision.canMoreInfo ? (
          <StationRfidQuickAction
            label={t(lang, 'rfid.station.action.moreInfo')}
            icon="info-circle"
            onPress={onMoreInfo}
            secondary={hasExtraActionsBelowDetail}
          />
        ) : null}
        {decision.canStop ? (
          <StationRfidQuickAction label={t(lang, 'rfid.station.action.stop')} icon="stop-circle" onPress={onStop} />
        ) : null}
        {!decision.canStop && (decision.canStart || decision.canStartRoaming) ? (
          <StationRfidQuickAction label={startLabel} icon={startIcon} onPress={onStart} />
        ) : null}
        {showBlockedIconRow ? (
          <View style={styles.stationRfidConnectorBlockedRow}>
            <AppIcon name="do-not-enter" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function sessionIsPaid(connector: TpConnector): boolean {
  return (
    connector.hasPublicPolicy &&
    (connector.publicPolicy.price > 0 ||
      connector.publicPolicy.sessionFee > 0 ||
      connector.publicPolicy.parkingPerHour > 0 ||
      connector.publicPolicy.occupyPerHour > 0)
  );
}

/** Voľný / EVconnected: riadok „+ Ďalšie poplatky“ len ak sú v politike nejaké položky okrem kWh. */
function idleConnectorShowsAdditionalFeesLine(connector: TpConnector): boolean {
  if (!connector.hasPublicPolicy || !sessionIsPaid(connector)) return false;
  const p = connector.publicPolicy;
  return p.sessionFee > 0 || p.parkingPerHour > 0 || p.occupyPerHour > 0;
}

const PAID_HEADER_ICON = 'globe-americas' as const;
const EROAMING_BUBBLE_ICON = 'exchange-alt' as const;

function ConnectorPolicyExtraFeesModal({
  visible,
  onClose,
  lang,
  currency,
  connector,
  vatRate,
}: {
  visible: boolean;
  onClose: () => void;
  lang: LanguageCode;
  currency: string;
  connector: TpConnector;
  vatRate: number;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const p = connector.publicPolicy;
  const gross = (n: number) => n * (1 + vatRate);
  const fmt = (n: number) => `${gross(n).toFixed(2)} ${currency}`;
  const rows: { label: string; value: string }[] = [];
  if (p.sessionFee > 0) {
    rows.push({ label: t(lang, 'connector.detail.feeLineSession'), value: fmt(p.sessionFee) });
  }
  if (p.parkingPerHour > 0) {
    rows.push({ label: t(lang, 'connector.detail.feeLineParking'), value: `${fmt(p.parkingPerHour)}/h` });
  }
  if (p.occupyPerHour > 0) {
    rows.push({ label: t(lang, 'connector.detail.feeLineOccupy'), value: `${fmt(p.occupyPerHour)}/h` });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.overlayWrap,
          styles.transactionPinModalOuter,
          KIOSK_NO_SELECT_WEB,
          {
            width: '100%',
            minHeight: windowHeight,
            ...(Platform.OS === 'web' ? { height: windowHeight } : null),
          },
        ]}
      >
        <View style={styles.transactionPinModalColumn}>
          <Pressable
            style={({ pressed }) => [
              styles.overlayHeader,
              styles.overlayHeaderIntegratedBack,
              pressed && styles.stationHeaderPressed,
            ]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'info.reader.back')}
          >
            <View style={[styles.stationBackStrip, { pointerEvents: 'none' }]}>
              <RNText style={styles.stationBackArrow}>‹</RNText>
            </View>
            <View style={[styles.overlayTitleRow, styles.overlayTitleRowIntegratedBack]}>
              <View style={styles.overlayTitleTextShrinkStandalone}>
                <FitText style={styles.overlayTitle} numberOfLines={2} targetChars={28} minScale={0.22}>
                  {t(lang, 'connector.detail.extraFeesModalTitle')}
                </FitText>
              </View>
            </View>
          </Pressable>
          <ScrollView
            style={[styles.overlayCard, styles.connectorPolicyFeeModalScroll]}
            contentContainerStyle={styles.connectorPolicyFeeModalScrollContent}
            showsVerticalScrollIndicator
            bounces={false}
          >
            {rows.map((row) => (
              <View key={row.label} style={styles.connectorPolicyFeeModalRow}>
                <FitText style={styles.connectorPolicyFeeModalLabel} numberOfLines={3} targetChars={36} minScale={0.22}>
                  {row.label}
                </FitText>
                <RNText style={styles.connectorPolicyFeeModalValue}>{row.value}</RNText>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ConnectorEroamingListModal({
  visible,
  onClose,
  lang,
  operators,
}: {
  visible: boolean;
  onClose: () => void;
  lang: LanguageCode;
  operators: readonly string[];
}) {
  const { height: windowHeight } = useWindowDimensions();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.overlayWrap,
          styles.transactionPinModalOuter,
          KIOSK_NO_SELECT_WEB,
          {
            width: '100%',
            minHeight: windowHeight,
            ...(Platform.OS === 'web' ? { height: windowHeight } : null),
          },
        ]}
      >
        <View style={styles.transactionPinModalColumn}>
          <Pressable
            style={({ pressed }) => [
              styles.overlayHeader,
              styles.overlayHeaderIntegratedBack,
              pressed && styles.stationHeaderPressed,
            ]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'info.reader.back')}
          >
            <View style={[styles.stationBackStrip, { pointerEvents: 'none' }]}>
              <RNText style={styles.stationBackArrow}>‹</RNText>
            </View>
            <View style={[styles.overlayTitleRow, styles.overlayTitleRowIntegratedBack]}>
              <View style={styles.overlayTitleTextShrinkStandalone}>
                <FitText style={styles.overlayTitle} numberOfLines={2} targetChars={26} minScale={0.22}>
                  {t(lang, 'connector.detail.eroamingListModalTitle')}
                </FitText>
              </View>
            </View>
          </Pressable>
          <ScrollView
            style={[styles.overlayCard, styles.connectorPolicyFeeModalScroll]}
            contentContainerStyle={styles.connectorPolicyFeeModalScrollContent}
            showsVerticalScrollIndicator
            bounces={false}
          >
            {operators.map((op) => (
              <View key={op} style={styles.connectorEroamingListLine}>
                <RNText style={styles.connectorEroamingListBullet}>•</RNText>
                <FitText style={styles.connectorEroamingListItem} numberOfLines={3} targetChars={40} minScale={0.22}>
                  {op}
                </FitText>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ConnectorAccessBubble({
  connector,
  currency,
  lang,
  ownerName,
  onOpenInfoPricing,
  onOpenInfoEroaming,
  onOpenInfoFree,
}: {
  connector: TpConnector;
  currency: string;
  lang: LanguageCode;
  ownerName: string;
  onOpenInfoPricing: () => void;
  onOpenInfoEroaming: () => void;
  onOpenInfoFree: () => void;
}) {
  const vatRate = mockConfig.station.vatRate ?? 0;
  const [extraFeesModalOpen, setExtraFeesModalOpen] = useState(false);
  const [eroamingListModalOpen, setEroamingListModalOpen] = useState(false);

  const accessMode = getAccessModeFromConnector(connector);
  const showPaid =
    accessMode === 'public' && connector.hasPublicPolicy && sessionIsPaid(connector);
  const emps = connector.eroamingEmpList ?? [];
  const showEroaming = Boolean(connector.hasEroamingHubject && emps.length > 0);
  const showPrivateOnly = accessMode === 'private';
  const showFree = accessMode === 'free';

  const extraFeesLine = idleConnectorShowsAdditionalFeesLine(connector);
  const extraCount = Math.max(0, emps.length - 3);

  const paidBubble = showPaid ? (
    <View style={[styles.connectorBubble, styles.connectorAccessBubble, styles.connectorAccessBubbleInfoInset]}>
      <Pressable
        onPress={onOpenInfoPricing}
        style={({ pressed }) => [styles.connectorIdleRfidInfoIcon, pressed && styles.connectorBubblePressed]}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t(lang, 'info.reader.title')}
      >
        <AppIcon name="info-circle" size={52} />
      </Pressable>
      <View style={styles.connectorAccessHeaderRow}>
        <ContentIconScaleContext.Provider value={1}>
          <AppIcon name={PAID_HEADER_ICON} size={52} />
        </ContentIconScaleContext.Provider>
        <RNText style={styles.connectorAccessTitle}>{t(lang, 'access.mode.paid')}</RNText>
      </View>
      <RNText style={styles.connectorAccessPriceHero}>
        {`${connector.publicPolicy.price.toFixed(2)} ${currency}/kWh`}
      </RNText>
      {extraFeesLine ? (
        <Pressable
          onPress={() => setExtraFeesModalOpen(true)}
          style={({ pressed }) => [styles.connectorAccessLinkPressable, pressed && styles.connectorBubblePressed]}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'connector.detail.extraFees')}
        >
          <RNText style={[styles.connectorAccessNote, styles.connectorAccessLinkText]}>
            {`+ ${t(lang, 'connector.detail.extraFees')}`}
          </RNText>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const eroamingBubble = showEroaming ? (
    <View style={[styles.connectorBubble, styles.connectorAccessBubble, styles.connectorAccessBubbleInfoInset]}>
      <Pressable
        onPress={onOpenInfoEroaming}
        style={({ pressed }) => [styles.connectorIdleRfidInfoIcon, pressed && styles.connectorBubblePressed]}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t(lang, 'info.reader.title')}
      >
        <AppIcon name="info-circle" size={52} />
      </Pressable>
      <View style={styles.connectorAccessHeaderRow}>
        <AppIcon name={EROAMING_BUBBLE_ICON} size={52} />
        <RNText style={styles.connectorAccessTitle}>{t(lang, 'connector.session.value.eroaming')}</RNText>
      </View>
      <View style={styles.connectorAccessEroamingEmpCol}>
        <RNText style={styles.connectorAccessEroamingLine}>{emps.slice(0, 3).join(', ')}</RNText>
        {extraCount > 0 ? (
          <Pressable
            onPress={() => setEroamingListModalOpen(true)}
            style={({ pressed }) => [styles.connectorAccessLinkPressable, pressed && styles.connectorBubblePressed]}
            accessibilityRole="button"
            accessibilityLabel={`${extraCount} ${t(lang, 'access.eroaming.more')}`}
          >
            <RNText style={[styles.connectorAccessEroamingLine, styles.connectorAccessLinkText]}>
              {`+ ${extraCount} ${t(lang, 'access.eroaming.more')}`}
            </RNText>
          </Pressable>
        ) : null}
      </View>
    </View>
  ) : null;

  const privateBubble = showPrivateOnly ? (
    <View style={[styles.connectorBubble, styles.connectorAccessBubble]}>
      <View style={styles.connectorAccessHeaderRow}>
        <AppIcon name="lock" size={52} />
        <RNText style={styles.connectorAccessTitle}>{t(lang, 'access.mode.private')}</RNText>
      </View>
      <RNText style={styles.connectorAccessNote}>
        {t(lang, 'access.private.hint').replace('{owner}', ownerName)}
      </RNText>
    </View>
  ) : null;

  const freeBubble = showFree ? (
    <View style={[styles.connectorBubble, styles.connectorAccessBubble, styles.connectorAccessBubbleInfoInset]}>
      <Pressable
        onPress={onOpenInfoFree}
        style={({ pressed }) => [styles.connectorIdleRfidInfoIcon, pressed && styles.connectorBubblePressed]}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t(lang, 'info.reader.title')}
      >
        <AppIcon name="info-circle" size={52} />
      </Pressable>
      <View style={styles.connectorAccessHeaderRow}>
        <AppIcon name="unlock" size={52} />
        <RNText style={styles.connectorAccessTitle}>{t(lang, 'access.mode.free')}</RNText>
      </View>
      <RNText style={styles.connectorAccessNote}>{t(lang, 'access.free.hint')}</RNText>
    </View>
  ) : null;

  return (
    <>
      {showFree ? freeBubble : null}
      {showPrivateOnly ? privateBubble : null}
      {showPaid ? paidBubble : null}
      {showEroaming ? eroamingBubble : null}
      <ConnectorPolicyExtraFeesModal
        visible={extraFeesModalOpen}
        onClose={() => setExtraFeesModalOpen(false)}
        lang={lang}
        currency={currency}
        connector={connector}
        vatRate={vatRate}
      />
      <ConnectorEroamingListModal
        visible={eroamingListModalOpen}
        onClose={() => setEroamingListModalOpen(false)}
        lang={lang}
        operators={emps}
      />
    </>
  );
}

function getSessionAccessValueKey(connector: TpConnector): string {
  const a = connector.access;
  if (a.roamingCharging && connector.hasEroamingHubject) return 'connector.session.value.eroaming';
  if (a.publicCharging && a.privateCharging) return 'connector.session.value.shared';
  if (a.privateCharging && !a.publicCharging) return 'connector.session.value.private';
  if (a.unauthorizedFreeCharging) return 'connector.session.value.free';
  if (connector.hasPublicPolicy && sessionIsPaid(connector)) return 'connector.session.value.paid';
  return 'connector.session.value.free';
}

/** Poradie pri demo cyklovaní ťukom na hodnotu typu prístupu (v bublině Vozidlo). */
const SESSION_ACCESS_VALUE_CYCLE_KEYS = [
  'connector.session.value.eroaming',
  'connector.session.value.paid',
  'connector.session.value.free',
  'connector.session.value.private',
  'connector.session.value.shared',
] as const;

function sessionAccessCycleIndexForConnector(connector: TpConnector): number {
  const k = getSessionAccessValueKey(connector);
  const i = SESSION_ACCESS_VALUE_CYCLE_KEYS.indexOf(
    k as (typeof SESSION_ACCESS_VALUE_CYCLE_KEYS)[number]
  );
  return i >= 0 ? i : 0;
}

/** Cena za kWh z transakcie len pri verejnom spoplatnení alebo zdieľanom prístupe; nie čisté privátne / zdarma. */
function connectorSessionEligibleForTxKwhPrice(connector: TpConnector): boolean {
  if (connector.access.unauthorizedFreeCharging) return false;
  if (connector.access.privateCharging && !connector.access.publicCharging) return false;
  const shared = connector.access.publicCharging && connector.access.privateCharging;
  const paidPublic = connector.hasPublicPolicy && sessionIsPaid(connector);
  return shared || paidPublic;
}

/** Jednotková cena z BE; ak chýba alebo ≤ 0, nezobrazujeme. */
function sessionTxUnitPriceForDisplay(connector: TpConnector): number | null {
  if (!connectorSessionEligibleForTxKwhPrice(connector)) return null;
  const tx = connector.activeTx;
  if (!tx || typeof tx.pricePerKwh !== 'number' || Number.isNaN(tx.pricePerKwh) || tx.pricePerKwh <= 0) {
    return null;
  }
  return tx.pricePerKwh;
}

function sessionTxShowAdditionalFeesLine(connector: TpConnector, unitPriceShown: boolean): boolean {
  if (!unitPriceShown) return false;
  const tx = connector.activeTx;
  if (tx?.hasAdditionalFees === false) return false;
  if (tx?.hasAdditionalFees === true) return true;
  const p = connector.publicPolicy;
  return p.sessionFee > 0 || p.parkingPerHour > 0 || p.occupyPerHour > 0;
}

/** Rozpad cien len s DPH (zobrazované); celkom z `activeTx.costWithVat` ak je k dispozícii. */
function chargingSessionPriceIncVat(
  connector: TpConnector,
  vatRate: number
): { energyInc: number; parkingInc: number; sessionInc: number; totalInc: number } {
  const p = connector.publicPolicy;
  const energy = connector.meter.energy;
  const unitNet = sessionTxUnitPriceForDisplay(connector);
  const energyInc =
    unitNet != null && unitNet > 0 && energy > 0 ? energy * unitNet * (1 + vatRate) : 0;
  const parkingInc = p.parkingPerHour > 0 ? p.parkingPerHour * (1 + vatRate) : 0;
  const sessionInc = p.sessionFee > 0 ? p.sessionFee * (1 + vatRate) : 0;
  const sumParts = energyInc + parkingInc + sessionInc;
  const tx = connector.activeTx;
  const totalInc =
    tx != null &&
    typeof tx.costWithVat === 'number' &&
    !Number.isNaN(tx.costWithVat) &&
    tx.costWithVat > 0
      ? tx.costWithVat
      : sumParts;
  return { energyInc, parkingInc, sessionInc, totalInc };
}

/** V zozname len časť do @ vrátane + „…“; celá adresa sa zobrazí v modale po kliknutí. */
function formatEmailTruncatedAfterAt(email: string): string {
  const s = email.trim();
  const at = s.indexOf('@');
  if (at < 0) return s;
  return `${s.slice(0, at + 1)}...`;
}

/** Spoločný obsah: stav stanica/auto + kW + kWh (Príprava aj Nabíjanie). */
function ConnectorPreparingStatusInner({
  connector,
  hideStationVehicleRow,
}: {
  connector: TpConnector;
  /** Detail nabíjania (live bublina): prvý riadok (stanica/auto/oddeľovač) sa nezobrazuje. */
  hideStationVehicleRow?: boolean;
}) {
  const budgetAmps = connector.budgetAmps ?? 10;
  const budgetOk = budgetAmps >= 6;
  const vehicleOk = (connector.vehicleSignalV ?? 6) === 6;
  const powerNumberText = connector.meter.power.toFixed(1);
  const energyNumberText = connector.meter.energy.toFixed(2);

  return (
    <>
      {hideStationVehicleRow ? null : (
        <View style={styles.connectorPreparingDetailIconRow}>
          <View style={styles.connectorPreparingDetailPair}>
            <AppIcon name="charging-station" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
            <Text style={styles.connectorPrepareStatusMark}>{budgetOk ? '✓' : '✕'}</Text>
          </View>
          <View style={styles.connectorPreparingDetailPairDivider} />
          <View style={styles.connectorPreparingDetailPair}>
            <AppIcon name="car-side-bolt" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
            <Text style={styles.connectorPrepareStatusMark}>{vehicleOk ? '✓' : '✕'}</Text>
          </View>
        </View>
      )}
      <View style={styles.connectorPreparingDetailMetricRowLeft}>
        <View style={styles.connectorVehicleSessionIconColumn}>
          <AppIcon name="bolt" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
        </View>
        <Text style={styles.connectorPreparingDetailMetricValue} numberOfLines={1}>
          {powerNumberText}
        </Text>
        <Text style={styles.connectorPreparingDetailMetricUnit}>kW</Text>
      </View>
      <View style={styles.connectorPreparingDetailMetricRowLeft}>
        <View style={styles.connectorVehicleSessionIconColumn}>
          <AppIcon name="battery-half" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
        </View>
        <Text style={styles.connectorPreparingDetailMetricValue} numberOfLines={1}>
          {energyNumberText}
        </Text>
        <Text style={styles.connectorPreparingDetailMetricUnit}>kWh</Text>
      </View>
    </>
  );
}

function ConnectorPreparingStatusBubble({ connector }: { connector: TpConnector }) {
  return (
    <View style={[styles.connectorBubble, styles.connectorAccessBubble, styles.connectorPreparingStatusBubble]}>
      <ContentIconScaleContext.Provider value={1}>
        <ConnectorPreparingStatusInner connector={connector} />
      </ContentIconScaleContext.Provider>
    </View>
  );
}

function ConnectorChargingLiveBubble({
  connector,
  lang,
  currency,
  sessionLoggedIn,
}: {
  connector: TpConnector;
  lang: LanguageCode;
  currency: string;
  sessionLoggedIn: boolean;
}) {
  const vatRate = mockConfig.station.vatRate ?? 0;
  const txTotalSec =
    connector.txTotalSec ?? parseHmsToSec(connector.activeTx?.chargingTime) ?? 0;
  const chargingActiveSec = connector.chargingActiveSec ?? Math.max(0, txTotalSec);
  const { energyInc, parkingInc, sessionInc, totalInc } = chargingSessionPriceIncVat(connector, vatRate);
  const feesInc = parkingInc + sessionInc;
  const showEnergyFeesSplit =
    sessionLoggedIn && energyInc > 0.001 && feesInc > 0.001;
  const fmt = (n: number) => `${n.toFixed(2)} ${currency}`;

  return (
    <View style={[styles.connectorBubble, styles.connectorAccessBubble, styles.connectorChargingLiveBubble]}>
      <ContentIconScaleContext.Provider value={1}>
        <ConnectorPreparingStatusInner connector={connector} hideStationVehicleRow />
        <View style={styles.connectorPreparingDetailMetricRowLeft}>
          <View style={styles.connectorVehicleSessionIconColumn}>
            <AppIcon name="clock" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
          </View>
          <View style={styles.connectorChargingTimeValueCol}>
            <Text style={styles.connectorPreparingDetailMetricValue} numberOfLines={1}>
              {formatSecToHms(txTotalSec)}
            </Text>
          </View>
        </View>
        <View style={styles.connectorPreparingDetailMetricRowLeft}>
          <View style={styles.connectorVehicleSessionIconColumn}>
            <AppIcon name="bolt" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
          </View>
          <View style={styles.connectorChargingTimeValueCol}>
            <Text style={styles.connectorPreparingDetailMetricValue} numberOfLines={1}>
              {formatSecToHms(chargingActiveSec)}
            </Text>
          </View>
        </View>
        {sessionLoggedIn ? (
          <>
            <View style={styles.connectorPreparingDetailMetricRowLeft}>
              <View style={styles.connectorVehicleSessionIconColumn}>
                <AppIcon name="coins" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
              </View>
              <View style={styles.connectorChargingTimeValueCol}>
                <Text style={styles.connectorPreparingDetailMetricValue} numberOfLines={1}>
                  {fmt(totalInc)}
                </Text>
              </View>
            </View>
            {showEnergyFeesSplit ? (
              <View style={[styles.connectorChargingBreakdownList, styles.connectorChargingPriceBreakdownIndent]}>
                <View style={styles.connectorChargingBreakdownRow}>
                  <Text style={styles.connectorChargingFeeMeta}>{t(lang, 'connector.charging.breakdown.kwh')}</Text>
                  <Text style={styles.connectorPreparingDetailMetricValue} numberOfLines={1}>
                    {fmt(energyInc)}
                  </Text>
                </View>
                <View style={styles.connectorChargingBreakdownRow}>
                  <Text style={styles.connectorChargingFeeMeta}>{t(lang, 'connector.charging.breakdown.fees')}</Text>
                  <Text style={styles.connectorPreparingDetailMetricValue} numberOfLines={1}>
                    {fmt(feesInc)}
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ContentIconScaleContext.Provider>
    </View>
  );
}

/** Po ukončení TX: len časy + kWh (bez prípravy, výkonu, cien). Ikony časov ako pri nabíjaní (hodiny + blesk). */
function ConnectorDisconnectSummaryBubble({ connector }: { connector: TpConnector }) {
  const txTotalSec =
    connector.txTotalSec ?? parseHmsToSec(connector.activeTx?.chargingTime) ?? 0;
  const chargingActiveSec = connector.chargingActiveSec ?? Math.max(0, txTotalSec);
  const energyNumberText = connector.meter.energy.toFixed(2);

  return (
    <View style={[styles.connectorBubble, styles.connectorAccessBubble, styles.connectorDisconnectSummaryBubble]}>
      <ContentIconScaleContext.Provider value={1}>
        <View style={styles.connectorPreparingDetailMetricRowLeft}>
          <View style={styles.connectorVehicleSessionIconColumn}>
            <AppIcon name="clock" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
          </View>
          <View style={styles.connectorChargingTimeValueCol}>
            <Text style={styles.connectorPreparingDetailMetricValue} numberOfLines={1}>
              {formatSecToHms(txTotalSec)}
            </Text>
          </View>
        </View>
        <View style={styles.connectorPreparingDetailMetricRowLeft}>
          <View style={styles.connectorVehicleSessionIconColumn}>
            <AppIcon name="bolt" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
          </View>
          <View style={styles.connectorChargingTimeValueCol}>
            <Text style={styles.connectorPreparingDetailMetricValue} numberOfLines={1}>
              {formatSecToHms(chargingActiveSec)}
            </Text>
          </View>
        </View>
        <View style={styles.connectorPreparingDetailMetricRowLeft}>
          <View style={styles.connectorVehicleSessionIconColumn}>
            <AppIcon name="battery-half" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
          </View>
          <Text style={styles.connectorPreparingDetailMetricValue} numberOfLines={1}>
            {energyNumberText}
          </Text>
          <Text style={styles.connectorPreparingDetailMetricUnit}>kWh</Text>
        </View>
      </ContentIconScaleContext.Provider>
    </View>
  );
}

/** Porucha bez TX: jedna akcia Podpora — rovnaký shell ako Prihlásiť/Ukončiť (centrovanie + čierny pruh ›). */
function ConnectorFaultNoTxSupportBubble({
  lang,
  onPress,
}: {
  lang: LanguageCode;
  onPress: () => void;
}) {
  const label = t(lang, 'actions.support');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.connectorBubble,
        styles.connectorPrimaryActionShell,
        styles.connectorEndChargeQuickBubble,
        pressed && styles.connectorBubblePressed,
      ]}
    >
      <View style={styles.connectorPrimaryActionContentRow}>
        <View style={styles.connectorPrimaryActionCenterSpacer} />
        <View style={styles.connectorPrimaryActionCluster}>
          <View style={styles.connectorIdleRfidIcons}>
            <AppIcon name="headset" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
          </View>
          <RNText allowFontScaling={false} style={styles.connectorPrimaryActionLabelText} numberOfLines={1}>
            {label}
          </RNText>
        </View>
        <View style={styles.connectorPrimaryActionCenterSpacer} />
      </View>
      <View style={[styles.connectorVehicleAuthStrip, { pointerEvents: 'none' }]}>
        <RNText style={styles.connectorVehicleAuthStripText}>›</RNText>
      </View>
    </Pressable>
  );
}

const CONNECTOR_OVERVIEW_TIME_ICON_SIZE = 52;
const CONNECTOR_OVERVIEW_TIME_GAP_PX = 10;

/** Prehľad stanice: ikona + čas v jednom riadku; veľkosť písma z `fitFontSizeForTextWidthPx` + `measureTextPx` (žiadne …). */
function ConnectorOverviewTimeInline({
  iconName,
  timeHms,
}: {
  iconName: 'clock' | 'bolt';
  timeHms: string;
}) {
  const widthRef = useRef(0);
  const [rowWidth, setRowWidth] = useState(0);
  const maxFontPx = TYPO.superLarge * 1.62;
  const minFontPx = 8;
  const fontWeight = '900';

  const fontSize = useMemo(() => {
    if (rowWidth <= 0) return maxFontPx;
    const textBudget = rowWidth - CONNECTOR_OVERVIEW_TIME_ICON_SIZE - CONNECTOR_OVERVIEW_TIME_GAP_PX;
    return fitFontSizeForTextWidthPx(timeHms, textBudget, maxFontPx, minFontPx, fontWeight);
  }, [timeHms, rowWidth, maxFontPx]);

  const lineHeight = useMemo(() => lh(fontSize, 1.02), [fontSize]);

  const onLayoutRow = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && Math.abs(w - widthRef.current) >= 2) {
      widthRef.current = w;
      setRowWidth(w);
    }
  }, []);

  return (
    <View style={styles.connectorOverviewTimeInlineRow} onLayout={onLayoutRow}>
      <AppIcon name={iconName} size={CONNECTOR_OVERVIEW_TIME_ICON_SIZE} />
      <RNText
        allowFontScaling={false}
        numberOfLines={1}
        ellipsizeMode="clip"
        style={[
          styles.connectorOverviewTxValueInline,
          {
            fontSize,
            lineHeight,
            flexShrink: 0,
            opacity: rowWidth > 0 ? 1 : 0,
          },
        ]}
      >
        {timeHms}
      </RNText>
    </View>
  );
}

function ConnectorSessionAccessBubble({
  lang,
  connector,
  currency,
  sessionLoggedIn,
}: {
  lang: LanguageCode;
  connector: TpConnector;
  currency: string;
  /** Cena za kWh / ďalšie poplatky len po prihlásení (RFID/PIN); nikdy nie zoznam EMP ako na idle. */
  sessionLoggedIn: boolean;
}) {
  const [accessCycleIndex, setAccessCycleIndex] = useState(() => sessionAccessCycleIndexForConnector(connector));
  const [extraFeesModalOpen, setExtraFeesModalOpen] = useState(false);
  const vatRate = mockConfig.station.vatRate ?? 0;

  useEffect(() => {
    setAccessCycleIndex(sessionAccessCycleIndexForConnector(connector));
  }, [connector.id]);

  useEffect(() => {
    setExtraFeesModalOpen(false);
  }, [connector.id]);

  const accessLabel = t(lang, 'connector.session.label.access');
  const accessValueKey = SESSION_ACCESS_VALUE_CYCLE_KEYS[accessCycleIndex];
  const accessValue = t(lang, accessValueKey);

  const cycleAccessPreview = () => {
    setAccessCycleIndex((i) => (i + 1) % SESSION_ACCESS_VALUE_CYCLE_KEYS.length);
  };

  const unitPrice = sessionTxUnitPriceForDisplay(connector);
  const showPriceBlock = sessionLoggedIn && unitPrice != null;
  const showExtraFees = sessionTxShowAdditionalFeesLine(connector, Boolean(showPriceBlock));

  return (
    <>
      <View style={[styles.connectorBubble, styles.connectorAccessBubble, styles.connectorSessionAccessBubbleStack]}>
        <View style={styles.connectorVehicleSessionRow}>
          <View
            style={styles.connectorVehicleSessionIconColumn}
            accessible
            accessibilityLabel={accessLabel}
            accessibilityRole="text"
          >
            <ContentIconScaleContext.Provider value={1}>
              <AppIcon name="key" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
            </ContentIconScaleContext.Provider>
          </View>
          <View style={styles.connectorVehicleSessionValueFitWrap}>
            <View style={styles.connectorVehicleSessionValueFitVertCenter}>
              <Pressable
                onPress={cycleAccessPreview}
                accessibilityRole="button"
                accessibilityLabel={`${accessLabel}: ${accessValue}`}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.connectorVehicleSessionAccessValuePressableInner,
                  pressed && styles.connectorBubblePressed,
                ]}
              >
                <FitText
                  style={styles.connectorVehicleSessionValueFit}
                  minScale={0.22}
                  targetChars={22}
                  numberOfLines={1}
                >
                  {accessValue}
                </FitText>
              </Pressable>
            </View>
          </View>
        </View>
        {showPriceBlock && unitPrice != null ? (
          <>
            <RNText style={styles.connectorAccessPriceHero}>
              {`${unitPrice.toFixed(2)} ${currency}/kWh`}
            </RNText>
            {showExtraFees ? (
              <Pressable
                onPress={() => setExtraFeesModalOpen(true)}
                style={({ pressed }) => [styles.connectorAccessLinkPressable, pressed && styles.connectorBubblePressed]}
                accessibilityRole="button"
                accessibilityLabel={t(lang, 'connector.detail.extraFees')}
              >
                <RNText style={[styles.connectorAccessNote, styles.connectorAccessLinkText]}>
                  {`+ ${t(lang, 'connector.detail.extraFees')}`}
                </RNText>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
      <ConnectorPolicyExtraFeesModal
        visible={extraFeesModalOpen}
        onClose={() => setExtraFeesModalOpen(false)}
        lang={lang}
        currency={currency}
        connector={connector}
        vatRate={vatRate}
      />
    </>
  );
}

type ConnectorVehicleSessionBubbleHandle = {
  requestEndCharge: () => void;
  requestLogin: () => void;
};

const ConnectorVehicleSessionBubble = forwardRef(function ConnectorVehicleSessionBubble(
  {
    lang,
    connector,
    stackedLayout,
    sessionLoggedIn,
    onSessionLoggedInChange,
  }: {
    lang: LanguageCode;
    connector: TpConnector;
    /** Pri lúpe: štítok a hodnota pod sebou, väčší text bez stlačenia do úzkého stĺpca. */
    stackedLayout: boolean;
    sessionLoggedIn: boolean;
    onSessionLoggedInChange: (loggedIn: boolean) => void;
  },
  ref: Ref<ConnectorVehicleSessionBubbleHandle>
) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [driverEmailModalOpen, setDriverEmailModalOpen] = useState(false);
  const [txPinModalOpen, setTxPinModalOpen] = useState(false);
  const [txPinInput, setTxPinInput] = useState('');
  const [txPinError, setTxPinError] = useState('');
  const [endChargeWaitOpen, setEndChargeWaitOpen] = useState(false);
  const [endChargeWaitPhase, setEndChargeWaitPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const endChargeWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Preferuj runtime aktívnej transakcie; DEV fallback ostáva len pre staré mock stavy bez doplnených dát. */
  const mockVehicleName = connector.activeTx?.vehicleName ?? devVar(lang, 'Škoda Enyaq 80 Max', 'vehicle.name');
  const mockPlate = connector.activeTx?.vehiclePlate ?? devVar(lang, 'BA 123XY', 'vehicle.plate');
  const mockEmail =
    connector.activeTx?.driverEmail ?? devVar(lang, 'jozef.novak.skoda@example.com', 'vehicle.email');
  const nameT = mockVehicleName.trim();
  const plateT = mockPlate.trim();
  const emailT = mockEmail.trim();
  const showVehicleIdentityBeforeLogin = plateT.length > 0;
  const showNoRegistration = sessionLoggedIn && !nameT && !plateT && !emailT;
  const showVehicleSessionBubbleContent = sessionLoggedIn
    ? showNoRegistration || plateT.length > 0 || nameT.length > 0 || emailT.length > 0
    : showVehicleIdentityBeforeLogin;

  const clearEndChargeWaitTimer = useCallback(() => {
    if (endChargeWaitTimerRef.current != null) {
      clearTimeout(endChargeWaitTimerRef.current);
      endChargeWaitTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setDriverEmailModalOpen(false);
    setTxPinModalOpen(false);
    setTxPinInput('');
    setTxPinError('');
    clearEndChargeWaitTimer();
    setEndChargeWaitOpen(false);
    setEndChargeWaitPhase('loading');
  }, [connector.id, clearEndChargeWaitTimer]);

  useEffect(() => () => clearEndChargeWaitTimer(), [clearEndChargeWaitTimer]);

  useEffect(() => {
    if (!sessionLoggedIn) setDriverEmailModalOpen(false);
  }, [sessionLoggedIn]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onDevRfid = (ev: Event) => {
      const tag = (ev as CustomEvent<{ tag?: string }>).detail?.tag;
      if (!tag) return;
      if (tag === DEV_RFID_TAG_CTRL_A) {
        onSessionLoggedInChange(true);
        setTxPinModalOpen(false);
        setTxPinInput('');
        setTxPinError('');
      }
    };
    window.addEventListener(DEV_RFID_TAP_EVENT, onDevRfid);
    return () => window.removeEventListener(DEV_RFID_TAP_EVENT, onDevRfid);
  }, [onSessionLoggedInChange]);

  const labelText = (key: string) => t(lang, key);
  const vehicleLabel = labelText('connector.session.label.vehicle');
  const driverLabel = labelText('connector.session.label.driver');

  const dismissEndChargeWaitModal = useCallback(() => {
    const phase = endChargeWaitPhase;
    clearEndChargeWaitTimer();
    setEndChargeWaitOpen(false);
    if (phase === 'success') onSessionLoggedInChange(false);
  }, [endChargeWaitPhase, clearEndChargeWaitTimer, onSessionLoggedInChange]);

  const beginEndChargeWait = useCallback(() => {
    clearEndChargeWaitTimer();
    setEndChargeWaitPhase('loading');
    setEndChargeWaitOpen(true);
    endChargeWaitTimerRef.current = setTimeout(() => {
      endChargeWaitTimerRef.current = null;
      const ok = Math.random() > 0.28;
      setEndChargeWaitPhase(ok ? 'success' : 'error');
    }, 2000);
  }, [clearEndChargeWaitTimer]);

  useImperativeHandle(
    ref,
    () => ({
      requestEndCharge: () => beginEndChargeWait(),
      requestLogin: () => {
        setTxPinInput('');
        setTxPinError('');
        setTxPinModalOpen(true);
      },
    }),
    [beginEndChargeWait]
  );

  /**
   * Ľavý stĺpec: Font Awesome ikona (bez textu), a11y cez labelA11y.
   * Hodnota: RNText (nie FitText) kvôli stabilnému vykresleniu pri mounte.
   */
  const VehicleSessionField = ({
    labelA11y,
    labelSlot,
    value,
    valueLines = 2,
  }: {
    labelA11y: string;
    labelSlot: ReactNode;
    value: string;
    valueLines?: number;
  }) => {
    const valueStyle = stackedLayout
      ? styles.connectorVehicleSessionValueStaticStack
      : styles.connectorVehicleSessionValueStatic;
    const labelCol = stackedLayout ? (
      <View style={styles.connectorVehicleSessionIconLabelStackWrap}>
        <View
          style={styles.connectorVehicleSessionIconColumn}
          accessible
          accessibilityLabel={labelA11y}
          accessibilityRole="text"
        >
          <ContentIconScaleContext.Provider value={1}>{labelSlot}</ContentIconScaleContext.Provider>
        </View>
      </View>
    ) : (
      <View
        style={styles.connectorVehicleSessionIconColumn}
        accessible
        accessibilityLabel={labelA11y}
        accessibilityRole="text"
      >
        <ContentIconScaleContext.Provider value={1}>{labelSlot}</ContentIconScaleContext.Provider>
      </View>
    );
    if (stackedLayout) {
      return (
        <View style={styles.connectorVehicleSessionStackBlock}>
          {labelCol}
          <View style={styles.connectorVehicleSessionValueStackWrap}>
            <RNText style={valueStyle} numberOfLines={valueLines}>
              {value}
            </RNText>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.connectorVehicleSessionRow}>
        {labelCol}
        <View style={styles.connectorVehicleSessionValueFitWrap}>
          <View style={styles.connectorVehicleSessionValueFitVertCenter}>
            <RNText style={valueStyle} numberOfLines={valueLines}>
              {value}
            </RNText>
          </View>
        </View>
      </View>
    );
  };

  /** SPZ pred/po prihlásení, ak je v dátach. */
  const iconPlateRow =
    plateT.length > 0 ? (
      <View style={styles.connectorVehicleSessionIconPlateRow}>
        <View style={styles.connectorVehicleSessionIconColumn}>
          <AppIcon name="car-side-bolt" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
        </View>
        <View style={styles.connectorVehicleSessionPlateBesideIcon}>
          <RNText style={styles.connectorVehicleSessionPlateTop} numberOfLines={1}>
            {plateT}
          </RNText>
        </View>
      </View>
    ) : null;

  const driverEmailMasked = formatEmailTruncatedAfterAt(mockEmail);
  const driverRow = stackedLayout ? (
    <View style={styles.connectorVehicleSessionStackBlock}>
      <View style={styles.connectorVehicleSessionIconLabelStackWrap}>
        <View
          style={styles.connectorVehicleSessionIconColumn}
          accessible
          accessibilityLabel={driverLabel}
          accessibilityRole="text"
        >
          <ContentIconScaleContext.Provider value={1}>
            <AppIcon name="user" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
          </ContentIconScaleContext.Provider>
        </View>
      </View>
      <View style={styles.connectorVehicleSessionValueStackWrap}>
        <Pressable
          onPress={() => setDriverEmailModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${driverLabel}. ${t(lang, 'connector.session.emailShowFull')}`}
          hitSlop={8}
          style={({ pressed }) => [
            styles.connectorVehicleSessionDriverEmailPressableStack,
            pressed && styles.connectorBubblePressed,
          ]}
        >
          <FitText
            style={styles.connectorVehicleSessionValueFit}
            minScale={0.2}
            targetChars={40}
            numberOfLines={1}
          >
            {driverEmailMasked}
          </FitText>
        </Pressable>
      </View>
    </View>
  ) : (
    <View style={styles.connectorVehicleSessionRow}>
      <View
        style={styles.connectorVehicleSessionIconColumn}
        accessible
        accessibilityLabel={driverLabel}
        accessibilityRole="text"
      >
        <ContentIconScaleContext.Provider value={1}>
          <AppIcon name="user" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
        </ContentIconScaleContext.Provider>
      </View>
      <View style={styles.connectorVehicleSessionValueFitWrap}>
        <View style={styles.connectorVehicleSessionValueFitVertCenter}>
          <Pressable
            onPress={() => setDriverEmailModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${driverLabel}. ${t(lang, 'connector.session.emailShowFull')}`}
            hitSlop={8}
            style={({ pressed }) => [styles.connectorVehicleSessionDriverEmailPressable, pressed && styles.connectorBubblePressed]}
          >
            <FitText
              style={styles.connectorVehicleSessionValueFit}
              minScale={0.2}
              targetChars={40}
              numberOfLines={1}
            >
              {driverEmailMasked}
            </FitText>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <>
      {showVehicleSessionBubbleContent ? (
        <View style={[styles.connectorBubble, styles.connectorAccessBubble, styles.connectorVehicleSessionBubble]}>
          <View style={styles.connectorVehicleSessionFields}>
            {!sessionLoggedIn ? (
              <>
                {plateT ? iconPlateRow : null}
              </>
            ) : showNoRegistration ? (
              <View style={styles.connectorVehicleSessionNoRegWrap}>
                <FitText
                  style={styles.connectorVehicleSessionNoRegText}
                  minScale={0.28}
                  targetChars={28}
                  numberOfLines={2}
                >
                  {t(lang, 'connector.session.noRegistration')}
                </FitText>
              </View>
            ) : (
              <>
                {plateT ? iconPlateRow : null}
                {nameT ? (
                  <VehicleSessionField
                    labelA11y={vehicleLabel}
                    labelSlot={<AppIcon name="car" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />}
                    value={nameT}
                    valueLines={2}
                  />
                ) : null}
                {emailT ? driverRow : null}
              </>
            )}
          </View>
        </View>
      ) : null}

      <Modal
        visible={txPinModalOpen}
        animationType="slide"
        onRequestClose={() => {
          setTxPinModalOpen(false);
          setTxPinInput('');
          setTxPinError('');
        }}
      >
        <View
          style={[
            styles.overlayWrap,
            styles.transactionPinModalOuter,
            KIOSK_NO_SELECT_WEB,
            {
              width: '100%',
              minHeight: windowHeight,
              ...(Platform.OS === 'web' ? { height: windowHeight } : null),
            },
          ]}
        >
          <View style={styles.transactionPinModalColumn}>
            <Pressable
              style={({ pressed }) => [
                styles.overlayHeader,
                styles.overlayHeaderIntegratedBack,
                pressed && styles.stationHeaderPressed,
              ]}
              onPress={() => {
                setTxPinModalOpen(false);
                setTxPinInput('');
                setTxPinError('');
              }}
              accessibilityRole="button"
              accessibilityLabel={t(lang, 'info.reader.back')}
            >
              <View
                style={[
                  styles.stationBackStrip,
                  stackedLayout && styles.overlayBackStripZoom,
                  { pointerEvents: 'none' },
                ]}
              >
                <RNText style={[styles.stationBackArrow, stackedLayout && styles.overlayBackStripArrowZoom]}>‹</RNText>
              </View>
              <View style={[styles.overlayTitleRow, styles.overlayTitleRowIntegratedBack]}>
                <View style={styles.overlayTitleTextShrinkStandalone}>
                  <FitText style={styles.overlayTitle} numberOfLines={2} targetChars={28} minScale={0.22}>
                    {t(lang, 'connector.session.transactionPinOverlayTitle')}
                  </FitText>
                </View>
              </View>
            </Pressable>
            <View style={[styles.overlayCard, styles.transactionPinModalBody]}>
              <ServicePinContent
                compact
                title={t(lang, 'connector.session.transactionPinPrompt')}
                pinLength={TRANSACTION_SESSION_PIN_LENGTH}
                pinInput={txPinInput}
                error={txPinError}
                onInput={(digit) => {
                  if (txPinInput.length >= TRANSACTION_SESSION_PIN_LENGTH) return;
                  setTxPinError('');
                  setTxPinInput((prev) => `${prev}${digit}`);
                }}
                onDelete={() => {
                  setTxPinError('');
                  setTxPinInput((prev) => prev.slice(0, -1));
                }}
                onSubmit={() => {
                  if (txPinInput === TRANSACTION_SESSION_PIN) {
                    onSessionLoggedInChange(true);
                    setTxPinModalOpen(false);
                    setTxPinInput('');
                    setTxPinError('');
                    return;
                  }
                  setTxPinError(t(lang, 'connector.session.pinWrong'));
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={driverEmailModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDriverEmailModalOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'connector.session.emailModalDismiss')}
          style={[styles.emailRevealModalRoot, KIOSK_NO_SELECT_WEB]}
          onPress={() => setDriverEmailModalOpen(false)}
        >
          <View style={[styles.emailRevealModalCard, { maxWidth: Math.max(0, windowWidth - 32) }]}>
            <FitText style={styles.emailRevealModalEmail} numberOfLines={3} targetChars={36} minScale={0.2}>
              {mockEmail.trim()}
            </FitText>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={endChargeWaitOpen}
        transparent
        animationType="fade"
        onRequestClose={dismissEndChargeWaitModal}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'connector.session.endChargeWait.dismiss')}
          style={[styles.emailRevealModalRoot, KIOSK_NO_SELECT_WEB]}
          onPress={dismissEndChargeWaitModal}
        >
          <View style={[styles.sessionWaitModalCard, { maxWidth: Math.max(0, windowWidth - 32) }]}>
            {endChargeWaitPhase === 'loading' ? (
              <View style={styles.sessionWaitModalLoading}>
                <ActivityIndicator size="large" color="#000000" />
                <FitText style={styles.sessionWaitModalText} numberOfLines={4} targetChars={56} minScale={0.22}>
                  {t(lang, 'connector.session.endChargeWait.loading')}
                </FitText>
              </View>
            ) : (
              <FitText style={styles.sessionWaitModalText} numberOfLines={6} targetChars={64} minScale={0.2}>
                {endChargeWaitPhase === 'success'
                  ? t(lang, 'connector.session.endChargeWait.success')
                  : t(lang, 'connector.session.endChargeWait.error')}
              </FitText>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
});

ConnectorVehicleSessionBubble.displayName = 'ConnectorVehicleSessionBubble';

function HomeOverviewScreen({
  lang,
  connectors,
  currency,
  fallbackChargingLink,
  selectedConnectorId,
  onSelectConnector,
  onOpenSupport,
  onOpenQr,
  onBackToOverview,
  onOpenInfoHelp2,
  operatorProviderName,
  ownerName,
  openInfo,
  onDevCycleConnectorStatus,
  magnifierOn,
}: {
  lang: LanguageCode;
  connectors: TpConnector[];
  currency: string;
  fallbackChargingLink: string;
  selectedConnectorId: string | null;
  onSelectConnector: (connectorId: string) => void;
  onOpenSupport: () => void;
  onOpenQr: (
    title: string,
    value: string,
    options?: { returnTo?: Screen; showPaymentOptions?: boolean }
  ) => void;
  onBackToOverview: () => void;
  onOpenInfoHelp2: () => void;
  operatorProviderName: string;
  ownerName: string;
  openInfo: (initialHelp?: number | HelpId, returnTarget?: Screen) => void;
  onDevCycleConnectorStatus?: () => void;
  magnifierOn: boolean;
}) {
  const connectStartByConnectorRef = useRef<Record<string, number>>({});
  const singleConnector = connectors.length === 1;
  /** Rovnaký flow ako pri viacerých konektoroch: najprv prehľad (bubliny), detail až po výbere. */
  const focusedConnector =
    selectedConnectorId != null
      ? connectors.find((item) => item.id === selectedConnectorId) ?? null
      : null;
  const [idlePriceExpanded, setIdlePriceExpanded] = useState(false);
  const [sessionLoggedIn, setSessionLoggedIn] = useState(false);
  const vehicleSessionBubbleRef = useRef<ConnectorVehicleSessionBubbleHandle | null>(null);
  useEffect(() => {
    setIdlePriceExpanded(false);
  }, [focusedConnector?.id]);
  useEffect(() => {
    setSessionLoggedIn(false);
  }, [focusedConnector?.id]);

  const getStatusLabel = (connector: TpConnector): string => {
    return getConnectorOverviewStatusLabel(lang, connector.ocpp.status);
  };

  const renderOverviewCard = (connector: TpConnector, cardIndex: number) => {
    const connectorPowerBadge = connector.powerType === 'AC' ? `AC${connector.phases}` : 'DC';
    const maxPowerKw = calculateMaxPowerKw(connector.powerType, connector.phases, connector.maxAmps);
    const isRightConnector = singleConnector || cardIndex % 2 === 1;
    const status = connector.ocpp.status;
    const isDisconnectEv = status === 'disconnectEV';
    const isFaultNoTxOverview = status === 'faultedWithoutTransa';
    const txActiveByStatus = isTxActiveStatus(status);
    const statusPreview = getStatusLabel(connector);
    const mobileCtaLines = wordWrap(t(lang, 'connector.detail.mobileCta'), 2, 8);
    const isFaultWithoutTx = isFaultWithoutTransactionStatus(status);
    const isFaultWithTx = isFaultWithTransactionStatus(status);
    const showConnectCountdown = isConnectCountdownStatus(status);
    const showLiveSessionData = txActiveByStatus;
    const isPreparingPhase = status === 'preparing';
    const isChargingPhase = status === 'charging';
    const isFinishedByVehicle = isFinishedByVehicleStatus(status);
    const isBlockedByStation = isBlockedByStationStatus(status);
    const showTimeRowsInMiddle = isChargingPhase || isFinishedByVehicle || isBlockedByStation;
    const showEnergyOnlyInBottom = isFinishedByVehicle || isBlockedByStation || isFaultWithTx;
    const showSecondBubbleAction = !txActiveByStatus || isFaultWithoutTx || isFaultWithTx;
    const budgetAmps = connector.budgetAmps ?? 10;
    const vehicleSignalV = connector.vehicleSignalV ?? 6;
    const budgetOk = budgetAmps >= 6;
    const vehicleOk = vehicleSignalV === 6;
    const vehicleState =
      vehicleSignalV === 12
        ? {
            icon: 'unlink' as React.ComponentProps<typeof FontAwesome5>['name'],
            label: t(lang, 'connector.vehicleState.disconnected'),
          }
        : vehicleSignalV === 9
          ? {
              icon: 'pause-circle' as React.ComponentProps<typeof FontAwesome5>['name'],
              label: t(lang, 'connector.vehicleState.waiting'),
            }
          : {
              icon: 'check-circle' as React.ComponentProps<typeof FontAwesome5>['name'],
              label: t(lang, 'connector.vehicleState.ready'),
            };
    const connectTimeoutSec = connector.connectTimeoutSec ?? 300;
    const txTotalSec =
      connector.txTotalSec ?? parseHmsToSec(connector.activeTx?.chargingTime) ?? 0;
    const chargingActiveSec =
      connector.chargingActiveSec ?? Math.max(0, txTotalSec);
    if (txActiveByStatus && !connectStartByConnectorRef.current[connector.id]) {
      connectStartByConnectorRef.current[connector.id] = Date.now();
    }
    if (!txActiveByStatus && connectStartByConnectorRef.current[connector.id]) {
      delete connectStartByConnectorRef.current[connector.id];
    }
    const connectElapsedSec = txActiveByStatus
      ? Math.floor((Date.now() - (connectStartByConnectorRef.current[connector.id] ?? Date.now())) / 1000)
      : 0;
    const connectRemainingSec = Math.max(0, connectTimeoutSec - connectElapsedSec);
    const connectCountdown = `${String(Math.floor(connectRemainingSec / 60)).padStart(2, '0')}:${String(
      connectRemainingSec % 60
    ).padStart(2, '0')}`;
    const powerNumberText = connector.meter.power.toFixed(1);
    const energyNumberText = connector.meter.energy.toFixed(2);
    const connectorLabelRaw = devVar(lang, connector.parkingSpot, 'connector.parkingSpot');
    const connectorLabel =
      lang === 'DEV'
        ? connectorLabelRaw
        : connectorLabelRaw.slice(0, 5).padEnd(5, connectorLabelRaw.slice(-1) || 'X');
    return (
      <View
        key={connector.id}
        style={[
          styles.connectorCard,
          singleConnector && styles.connectorCardSingle,
          styles.connectorCardOverview,
        ]}
      >
        <View style={styles.connectorOverviewBody}>
          <Pressable
            style={({ pressed }) => [
              styles.connectorOverviewRow,
              isRightConnector ? styles.connectorOverviewRowClickable : styles.connectorOverviewRowClickableLeft,
              pressed && styles.connectorBubblePressed,
            ]}
            hitSlop={8}
            onPress={() => onSelectConnector(connector.id)}
          >
            <View
              style={[
                styles.connectorOverviewCellSplit,
                !isRightConnector
                  ? styles.connectorOverviewCellSplitPadLeft
                  : styles.connectorOverviewCellSplitPadRight,
              ]}
            >
              <View style={styles.connectorOverviewCellHalf}>
                <FitText style={styles.connectorNameOverview} minScale={0.62} targetChars={5}>
                  {connectorLabel}
                </FitText>
              </View>
              <View style={styles.connectorOverviewCellDivider} />
              <View style={styles.connectorOverviewCellHalf}>
                <View style={styles.connectorOverviewStatusWrap}>
                  <ZoomAdaptiveText
                    style={styles.connectorOverviewStatusInlineLine}
                    zoomMaxLines={2}
                    zoomTargetCharsPerLine={10}
                    zoomMinScale={0.22}
                  >
                    {statusPreview}
                  </ZoomAdaptiveText>
                </View>
              </View>
            </View>
            {isRightConnector ? (
              <View style={styles.connectorBubbleActionStrip}>
                <RNText style={styles.connectorBubbleActionStripArrow}>›</RNText>
              </View>
            ) : (
              <View style={styles.connectorBubbleActionStripLeft}>
                <RNText style={styles.connectorBubbleActionStripArrow}>‹</RNText>
              </View>
            )}
          </Pressable>

          {isFaultNoTxOverview ? (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.connectorOverviewRow,
                  isRightConnector ? styles.connectorOverviewRowClickable : styles.connectorOverviewRowClickableLeft,
                  pressed && styles.connectorBubblePressed,
                ]}
                hitSlop={8}
                onPress={onOpenSupport}
              >
                <View
                  style={[
                    styles.connectorOverviewCellSplit,
                    !isRightConnector
                      ? styles.connectorOverviewCellSplitPadLeft
                      : styles.connectorOverviewCellSplitPadRight,
                  ]}
                >
                  <View style={styles.connectorOverviewCellHalf}>
                    <View style={styles.connectorOverviewMobileTextWrap}>
                      <FitText style={styles.connectorQrButtonTextMobileLine} minScale={0.45} targetChars={8}>
                        {t(lang, 'actions.support')}
                      </FitText>
                    </View>
                  </View>
                  <View style={styles.connectorOverviewCellDivider} />
                  <View style={styles.connectorOverviewCellHalf}>
                    <View style={styles.connectorOverviewIconRow}>
                      <AppIcon name="headset" size={52} />
                    </View>
                  </View>
                </View>
                {isRightConnector ? (
                  <View style={styles.connectorBubbleActionStrip}>
                    <RNText style={styles.connectorBubbleActionStripArrow}>›</RNText>
                  </View>
                ) : (
                  <View style={styles.connectorBubbleActionStripLeft}>
                    <RNText style={styles.connectorBubbleActionStripArrow}>‹</RNText>
                  </View>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.connectorOverviewRow, pressed && styles.connectorBubblePressed]}
                hitSlop={8}
                onPress={() => onSelectConnector(connector.id)}
              >
                <View style={styles.connectorOverviewCellSplit}>
                  <View style={styles.connectorOverviewCellHalf}>
                    <FitText style={styles.connectorOverviewPowerTypeBig} minScale={0.5} targetChars={4} numberOfLines={1}>
                      {connectorPowerBadge}
                    </FitText>
                  </View>
                  <View style={styles.connectorOverviewCellDivider} />
                  <View style={styles.connectorOverviewCellHalf}>
                    <FitText style={styles.connectorOverviewPowerKwBig} minScale={0.3} targetChars={5} numberOfLines={1}>
                      {`${maxPowerKw.toFixed(0)} kW`}
                    </FitText>
                  </View>
                </View>
              </Pressable>
            </>
          ) : isDisconnectEv ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.connectorOverviewRow, pressed && styles.connectorBubblePressed]}
                hitSlop={8}
                onPress={() => onSelectConnector(connector.id)}
              >
                <View style={styles.connectorOverviewCellSplit}>
                  <View style={styles.connectorOverviewCellHalf}>
                    <ConnectorOverviewTimeInline iconName="clock" timeHms={formatSecToHms(txTotalSec)} />
                  </View>
                  <View style={styles.connectorOverviewCellDivider} />
                  <View style={styles.connectorOverviewCellHalf}>
                    <ConnectorOverviewTimeInline iconName="bolt" timeHms={formatSecToHms(chargingActiveSec)} />
                  </View>
                </View>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.connectorOverviewRow, pressed && styles.connectorBubblePressed]}
                hitSlop={8}
                onPress={() => onSelectConnector(connector.id)}
              >
                <View style={styles.connectorOverviewCellFull}>
                  <FitText
                    style={styles.connectorOverviewLiveValueNumberFull}
                    minScale={0.35}
                    targetChars={6}
                    numberOfLines={1}
                  >
                    {energyNumberText}
                  </FitText>
                  <View style={styles.connectorOverviewUnitRowFull}>
                    <AppIcon name="battery-half" size={52} />
                    <RNText allowFontScaling={false} style={styles.connectorOverviewLiveUnitTextFull}>
                      kWh
                    </RNText>
                  </View>
                </View>
              </Pressable>
            </>
          ) : (
            <>
          <Pressable
            style={({ pressed }) => [
              styles.connectorOverviewRow,
              showSecondBubbleAction
                ? isRightConnector
                  ? styles.connectorOverviewRowClickable
                  : styles.connectorOverviewRowClickableLeft
                : null,
              pressed && styles.connectorBubblePressed,
            ]}
            hitSlop={8}
            onPress={() => {
              if (!showSecondBubbleAction) {
                onSelectConnector(connector.id);
                return;
              }
              if (isFaultWithoutTx || isFaultWithTx) {
                onOpenSupport();
                return;
              }
              if (!txActiveByStatus) {
                onOpenQr(
                  `${devVar(lang, connector.parkingSpot, 'connector.parkingSpot')} - ${devVar(
                    lang,
                    connector.evseCpoId,
                    'connector.evseCpoId'
                  )}`,
                  devVar(lang, connector.chargingLink ?? fallbackChargingLink, 'connector.chargingLink'),
                  { returnTo: 'home', showPaymentOptions: connector.hasPublicPolicy }
                );
                return;
              }
              onSelectConnector(connector.id);
            }}
          >
            <View
              style={[
                styles.connectorOverviewCellSplit,
                showSecondBubbleAction
                  ? !isRightConnector
                    ? styles.connectorOverviewCellSplitPadLeft
                    : styles.connectorOverviewCellSplitPadRight
                  : null,
              ]}
            >
              <View style={styles.connectorOverviewCellHalf}>
                {isFaultWithoutTx || isFaultWithTx ? (
                  <View style={styles.connectorOverviewMobileTextWrap}>
                    <FitText style={styles.connectorQrButtonTextMobileLine} minScale={0.45} targetChars={8}>
                      {t(lang, 'actions.support')}
                    </FitText>
                  </View>
                ) : !txActiveByStatus ? (
                  <View style={styles.connectorOverviewMobileTextWrap}>
                    <FitText style={styles.connectorQrButtonTextMobileLine} minScale={0.45} targetChars={8}>
                      {mobileCtaLines[0]}
                    </FitText>
                    {mobileCtaLines[1] ? (
                      <FitText style={styles.connectorQrButtonTextMobileLine} minScale={0.45} targetChars={8}>
                        {mobileCtaLines[1]}
                      </FitText>
                    ) : null}
                  </View>
                ) : showConnectCountdown ? (
                  <View style={styles.connectorOverviewMobileTextWrap}>
                    <FitText style={styles.connectorTxValue} minScale={0.5} targetChars={8}>
                      {connectCountdown}
                    </FitText>
                  </View>
                ) : isPreparingPhase ? (
                  <View style={styles.connectorPrepareFlowWrap}>
                    <View style={styles.connectorPrepareStatusRow}>
                      <AppIcon name="charging-station" size={52} />
                      <Text style={styles.connectorPrepareStatusMark}>{budgetOk ? '✓' : '✕'}</Text>
                    </View>
                  </View>
                ) : showTimeRowsInMiddle ? (
                  <ConnectorOverviewTimeInline iconName="clock" timeHms={formatSecToHms(txTotalSec)} />
                ) : (
                  <View style={styles.connectorOverviewMobileTextWrap}>
                    <FitText style={styles.connectorMiniLabel} minScale={0.6} targetChars={8}>
                      Budget
                    </FitText>
                    <FitText style={styles.connectorTxValue} minScale={0.5} targetChars={6}>
                      {`${budgetAmps} A`}
                    </FitText>
                  </View>
                )}
              </View>
              <View style={styles.connectorOverviewCellDivider} />
              <View style={styles.connectorOverviewCellHalf}>
                {isFaultWithoutTx || isFaultWithTx ? (
                  <View style={styles.connectorOverviewIconRow}>
                    <AppIcon name="headset" size={52} />
                  </View>
                ) : !txActiveByStatus ? (
                  <View style={styles.connectorOverviewIconRow}>
                    <AppIcon name="qrcode" size={52} />
                    <AppIcon name="mobile-alt" size={52} />
                  </View>
                ) : showConnectCountdown ? (
                  <View style={styles.connectorOverviewIconRow}>
                    <AppIcon name="car-side-bolt" size={52} />
                  </View>
                ) : isPreparingPhase ? (
                  <View style={styles.connectorPrepareFlowWrap}>
                    <View style={styles.connectorPrepareStatusRow}>
                      <AppIcon name="car-side-bolt" size={52} />
                      <Text style={styles.connectorPrepareStatusMark}>{vehicleOk ? '✓' : '✕'}</Text>
                    </View>
                  </View>
                ) : showTimeRowsInMiddle ? (
                  <ConnectorOverviewTimeInline iconName="bolt" timeHms={formatSecToHms(chargingActiveSec)} />
                ) : (
                  <View style={styles.connectorOverviewIconRow}>
                    <AppIcon name={vehicleState.icon} size={52} />
                    <FitText style={styles.connectorMiniLabel} minScale={0.6} targetChars={9}>
                      {vehicleState.label}
                    </FitText>
                  </View>
                )}
              </View>
            </View>
            {showSecondBubbleAction
              ? isRightConnector ? (
                  <View style={styles.connectorBubbleActionStrip}>
                    <RNText style={styles.connectorBubbleActionStripArrow}>›</RNText>
                  </View>
                ) : (
                  <View style={styles.connectorBubbleActionStripLeft}>
                    <RNText style={styles.connectorBubbleActionStripArrow}>‹</RNText>
                  </View>
                )
              : null}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.connectorOverviewRow, pressed && styles.connectorBubblePressed]}
            hitSlop={8}
            onPress={() => onSelectConnector(connector.id)}
          >
            {showEnergyOnlyInBottom ? (
              <View style={styles.connectorOverviewCellFull}>
                <FitText style={styles.connectorOverviewLiveValueNumberFull} minScale={0.35} targetChars={6} numberOfLines={1}>
                  {energyNumberText}
                </FitText>
                <View style={styles.connectorOverviewUnitRowFull}>
                  <AppIcon name="battery-half" size={52} />
                  <RNText allowFontScaling={false} style={styles.connectorOverviewLiveUnitTextFull}>
                    kWh
                  </RNText>
                </View>
              </View>
            ) : (
              <View style={styles.connectorOverviewCellSplit}>
                <View style={styles.connectorOverviewCellHalf}>
                  {showLiveSessionData ? (
                    <>
                      <FitText style={styles.connectorOverviewLiveValueNumber} minScale={0.35} targetChars={5} numberOfLines={1}>
                        {powerNumberText}
                      </FitText>
                      <View style={styles.connectorOverviewUnitRow}>
                        <AppIcon name="bolt" size={52} />
                        <RNText allowFontScaling={false} style={styles.connectorOverviewLiveUnitText}>
                          kW
                        </RNText>
                      </View>
                    </>
                  ) : (
                    <FitText style={styles.connectorOverviewPowerTypeBig} minScale={0.5} targetChars={4} numberOfLines={1}>
                      {connectorPowerBadge}
                    </FitText>
                  )}
                </View>
                <View style={styles.connectorOverviewCellDivider} />
                <View style={styles.connectorOverviewCellHalf}>
                  {showLiveSessionData ? (
                    <>
                      <FitText style={styles.connectorOverviewLiveValueNumber} minScale={0.35} targetChars={6} numberOfLines={1}>
                        {energyNumberText}
                      </FitText>
                      <View style={styles.connectorOverviewUnitRow}>
                        <AppIcon name="battery-half" size={52} />
                        <RNText allowFontScaling={false} style={styles.connectorOverviewLiveUnitText}>
                          kWh
                        </RNText>
                      </View>
                    </>
                  ) : (
                    <FitText style={styles.connectorOverviewPowerKwBig} minScale={0.3} targetChars={5} numberOfLines={1}>
                      {`${maxPowerKw.toFixed(0)} kW`}
                    </FitText>
                  )}
                </View>
              </View>
            )}
          </Pressable>
            </>
          )}

        </View>
      </View>
    );
  };

  if (!focusedConnector) {
    return (
      <ContentTextScaleContext.Provider value={1}>
        <ContentIconScaleContext.Provider value={1}>
          <View style={styles.connectorArea}>
            {connectors.map((connector, idx) => renderOverviewCard(connector, idx))}
          </View>
        </ContentIconScaleContext.Provider>
      </ContentTextScaleContext.Provider>
    );
  }

  const maxPowerKw = calculateMaxPowerKw(
    focusedConnector.powerType,
    focusedConnector.phases,
    focusedConnector.maxAmps
  );
  const focusedConnectorLabelRaw = devVar(lang, focusedConnector.parkingSpot, 'connector.parkingSpot');
  const focusedConnectorLabel = focusedConnectorLabelRaw;
  const connectorPowerBadge = focusedConnector.powerType === 'AC' ? `AC${focusedConnector.phases}` : 'DC';
  const plugTypeKey = getPlugTypeTranslationKey(focusedConnector.plugType);
  const plugTypeLabel = plugTypeKey ? t(lang, plugTypeKey) : focusedConnector.plugType;
  const ocppStatus = focusedConnector.ocpp.status;
  const isIdleStartUi = ocppStatus === 'available' || ocppStatus === 'EVconnected';
  const isDisconnectEvFocused = ocppStatus === 'disconnectEV';
  const isFaultNoTxFocused = ocppStatus === 'faultedWithoutTransa';

  const txActiveByStatusFocused = isTxActiveStatus(ocppStatus);
  if (txActiveByStatusFocused && !connectStartByConnectorRef.current[focusedConnector.id]) {
    connectStartByConnectorRef.current[focusedConnector.id] = Date.now();
  }
  if (!txActiveByStatusFocused && connectStartByConnectorRef.current[focusedConnector.id]) {
    delete connectStartByConnectorRef.current[focusedConnector.id];
  }
  const showConnectCountdownFocused = isConnectCountdownStatus(ocppStatus);
  const connectTimeoutSecFocused = focusedConnector.connectTimeoutSec ?? 300;
  const connectElapsedSecFocused = txActiveByStatusFocused
    ? Math.floor((Date.now() - (connectStartByConnectorRef.current[focusedConnector.id] ?? Date.now())) / 1000)
    : 0;
  const connectRemainingSecFocused = Math.max(0, connectTimeoutSecFocused - connectElapsedSecFocused);
  const connectCountdownFocused = `${String(Math.floor(connectRemainingSecFocused / 60)).padStart(2, '0')}:${String(
    connectRemainingSecFocused % 60
  ).padStart(2, '0')}`;

  const focusedStatusLabel = getStatusLabel(focusedConnector);
  const showVehicleSessionBubble = isConnectorSessionVehicleBubbleStatus(ocppStatus);
  const bubbleScrollNeeded =
    (isIdleStartUi && ocppStatus === 'EVconnected') ||
    showVehicleSessionBubble ||
    isDisconnectEvFocused;

  const idleStartBubble =
    (isIdleStartUi || isDisconnectEvFocused) &&
    !isFaultNoTxFocused &&
    getAccessModeFromConnector(focusedConnector) !== 'free' ? (
      <View style={[styles.connectorBubble, styles.connectorPrimaryActionShell, styles.connectorAccessBubbleInfoInset]}>
        <Pressable
          onPress={onOpenInfoHelp2}
          style={({ pressed }) => [styles.connectorIdleRfidInfoIcon, pressed && styles.connectorBubblePressed]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'info.reader.title')}
        >
          <AppIcon name="info-circle" size={52} />
        </Pressable>
        <View style={[styles.connectorPrimaryActionContentRow, styles.connectorPrimaryActionContentRowInClickableBubble]}>
          <View style={styles.connectorPrimaryActionCenterSpacer} />
          <View style={styles.connectorPrimaryActionCluster}>
            <View style={styles.connectorIdleRfidIcons}>
              <Image source={RFID_CARD_ICON} style={styles.connectorIdleRfidCardImage} resizeMode="contain" />
            </View>
            <RNText allowFontScaling={false} style={styles.connectorPrimaryActionLabelText}>
              {t(lang, 'connector.idle.startCta')}
            </RNText>
          </View>
          <View style={styles.connectorPrimaryActionCenterSpacer} />
        </View>
      </View>
    ) : null;

  const idleAccessBubble =
    isIdleStartUi && !isDisconnectEvFocused && !isFaultNoTxFocused ? (
      <ConnectorAccessBubble
        connector={focusedConnector}
        currency={currency}
        lang={lang}
        ownerName={ownerName}
        onOpenInfoFree={() => openInfo('info-free', 'home')}
        onOpenInfoPricing={() => openInfo('info-pricing', 'home')}
        onOpenInfoEroaming={() => openInfo('info-eroaming', 'home')}
      />
    ) : null;

  const disconnectSummaryBubble = isDisconnectEvFocused ? (
    <ConnectorDisconnectSummaryBubble connector={focusedConnector} />
  ) : null;

  const faultNoTxSupportBubble = isFaultNoTxFocused ? (
    <ConnectorFaultNoTxSupportBubble lang={lang} onPress={onOpenSupport} />
  ) : null;
  const faultWithTxSupportBubble = ocppStatus === 'faultedWithTransa' ? (
    <ConnectorFaultNoTxSupportBubble lang={lang} onPress={onOpenSupport} />
  ) : null;

  const vehicleSessionBubble = showVehicleSessionBubble ? (
    <>
      <ConnectorSessionAccessBubble
        lang={lang}
        connector={focusedConnector}
        currency={currency}
        sessionLoggedIn={sessionLoggedIn}
      />
      {ocppStatus === 'preparing' ? <ConnectorPreparingStatusBubble connector={focusedConnector} /> : null}
      {ocppStatus === 'charging' ? (
        <ConnectorChargingLiveBubble
          connector={focusedConnector}
          lang={lang}
          currency={currency}
          sessionLoggedIn={sessionLoggedIn}
        />
      ) : null}
      <ConnectorVehicleSessionBubble
        ref={vehicleSessionBubbleRef}
        lang={lang}
        connector={focusedConnector}
        stackedLayout={magnifierOn}
        sessionLoggedIn={sessionLoggedIn}
        onSessionLoggedInChange={setSessionLoggedIn}
      />
    </>
  ) : null;

  /** Pod identitou, nad scrolom: neprihlásený = Prihlásiť (+ RFID ako Štart), po prihlásení = Ukončiť nabíjanie (bez ikony). */
  const sessionTopActionBubble = showVehicleSessionBubble ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        sessionLoggedIn ? t(lang, 'connector.session.endCharge') : t(lang, 'connector.session.loginCta')
      }
      style={({ pressed }) => [
        styles.connectorBubble,
        styles.connectorPrimaryActionShell,
        styles.connectorEndChargeQuickBubble,
        pressed && styles.connectorBubblePressed,
      ]}
      onPress={() =>
        sessionLoggedIn
          ? vehicleSessionBubbleRef.current?.requestEndCharge()
          : vehicleSessionBubbleRef.current?.requestLogin()
      }
    >
      <View style={styles.connectorPrimaryActionContentRow}>
        <View style={styles.connectorPrimaryActionCenterSpacer} />
        <View style={styles.connectorPrimaryActionCluster}>
          <View style={styles.connectorIdleRfidIcons}>
            {sessionLoggedIn ? (
              <AppIcon name="stop" size={CONNECTOR_IDLE_ROW_ICON_SIZE} />
            ) : (
              <Image source={RFID_CARD_ICON} style={styles.connectorIdleRfidCardImage} resizeMode="contain" />
            )}
          </View>
          <RNText
            allowFontScaling={false}
            style={styles.connectorPrimaryActionLabelText}
            numberOfLines={1}
          >
            {sessionLoggedIn ? t(lang, 'connector.session.endCharge') : t(lang, 'connector.session.loginCta')}
          </RNText>
        </View>
        <View style={styles.connectorPrimaryActionCenterSpacer} />
      </View>
      <View style={[styles.connectorVehicleAuthStrip, { pointerEvents: 'none' }]}>
        <RNText style={styles.connectorVehicleAuthStripText}>›</RNText>
      </View>
    </Pressable>
  ) : null;

  return (
    <ContentTextScaleContext.Provider value={1}>
      <ContentIconScaleContext.Provider value={1}>
        <View style={styles.connectorArea}>
          <View
            style={[
              styles.connectorCard,
              styles.connectorCardSingle,
              styles.connectorCardFocused,
              bubbleScrollNeeded && styles.connectorCardWithScroll,
            ]}
          >
        <Pressable
          style={({ pressed }) => [
            styles.connectorIdentityRow,
            styles.connectorIdentityRowFocused,
            styles.connectorIdentityBubble,
            styles.connectorIdentityBubbleStatic,
            onDevCycleConnectorStatus && pressed && styles.connectorBubblePressed,
          ]}
          disabled={!onDevCycleConnectorStatus}
          onPress={onDevCycleConnectorStatus}
        >
          <View
            style={[
              styles.connectorIdentityMain,
              styles.connectorIdentityMainFocused,
            ]}
          >
            <View style={styles.connectorIdentitySpotWrap}>
              <FitText style={styles.connectorNameOverview} minScale={0.5} targetChars={9}>
                {focusedConnectorLabel}
              </FitText>
              {showConnectCountdownFocused ? (
                <View style={styles.connectorIdentitySpotCountdownRow}>
                  <AppIcon name="clock" size={CONNECTOR_IDENTITY_CLOCK_ICON_SIZE} />
                  <FitText
                    style={styles.connectorIdentitySpotCountdownText}
                    minScale={0.48}
                    targetChars={6}
                    numberOfLines={1}
                  >
                    {connectCountdownFocused}
                  </FitText>
                </View>
              ) : null}
            </View>
            <View style={styles.connectorIdentityDivider} />
            <View style={[styles.connectorIdentityStatusBlock, styles.connectorIdentityStatusBlockRight]}>
              <ZoomAdaptiveText
                style={styles.connectorNameOverviewStatus}
                zoomMaxLines={2}
                zoomTargetCharsPerLine={10}
                zoomMinScale={0.32}
              >
                {focusedStatusLabel}
              </ZoomAdaptiveText>
            </View>
          </View>
        </Pressable>

        {sessionTopActionBubble}

        {faultWithTxSupportBubble}

        {faultNoTxSupportBubble}

        {bubbleScrollNeeded ? (
          <BubbleSnapScroll gap={8} fabRight={BUBBLE_SNAP_SCROLL_FAB_RIGHT_INFO}>
            {idleStartBubble}
            {idleAccessBubble}
            {disconnectSummaryBubble}
            {vehicleSessionBubble}
          </BubbleSnapScroll>
        ) : (
          <>
            {idleStartBubble}
            {idleAccessBubble}
            {disconnectSummaryBubble}
            {vehicleSessionBubble}
          </>
        )}
          </View>
        </View>
      </ContentIconScaleContext.Provider>
    </ContentTextScaleContext.Provider>
  );
}

function FullscreenOverlay({
  headerIcon,
  title,
  scrollVertical,
  bubbleSnapScroll = false,
  children,
  onClose,
  useBackButton = false,
  titleLarge = false,
  secondaryRow,
  secondaryRowFirst = false,
  showCloseButton = true,
  backAccessibilityLabel = 'Back',
  scrollUpAccessibilityLabel = 'Scroll up',
  scrollDownAccessibilityLabel = 'Scroll down',
}: {
  headerIcon?: React.ComponentProps<typeof FontAwesome5>['name'];
  title: string;
  scrollVertical: boolean;
  /** No system scrollbar; FAB chevrons when content overflows (Podpora, same pattern as Pomoc). */
  bubbleSnapScroll?: boolean;
  children: ReactNode;
  onClose: () => void;
  useBackButton?: boolean;
  titleLarge?: boolean;
  secondaryRow?: ReactNode;
  secondaryRowFirst?: boolean;
  showCloseButton?: boolean;
  backAccessibilityLabel?: string;
  scrollUpAccessibilityLabel?: string;
  scrollDownAccessibilityLabel?: string;
}) {
  const contentTextScale = useContext(ContentTextScaleContext);
  const isZoomed = contentTextScale > 1;
  const titleIsMultiWord = title.trim().includes(' ');
  const prefersTwoLineTitle = titleIsMultiWord && title.trim().length > 17;
  const overlayTitleTextScale = isZoomed ? (prefersTwoLineTitle ? 1.7 : 2) : 1;
  const overlayHeaderIconSize = isZoomed ? 44 : 24;
  const body =
    scrollVertical && bubbleSnapScroll ? (
      <BubbleSnapScroll
        gap={8}
        fabRight={BUBBLE_SNAP_SCROLL_FAB_RIGHT_INFO}
        scrollStyle={[styles.overlayCard, styles.overlayScrollView]}
        contentContainerStyle={styles.overlayScrollContent}
        bounces={false}
        scrollUpAccessibilityLabel={scrollUpAccessibilityLabel}
        scrollDownAccessibilityLabel={scrollDownAccessibilityLabel}
      >
        {children}
      </BubbleSnapScroll>
    ) : scrollVertical ? (
      <ScrollView
        style={[styles.overlayCard, styles.overlayScrollView]}
        contentContainerStyle={styles.overlayScrollContent}
        horizontal={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator
        bounces={false}
      >
        {children}
      </ScrollView>
    ) : (
      <View style={styles.overlayCard}>{children}</View>
    );

  const headerZoomStyle = isZoomed && (prefersTwoLineTitle ? styles.overlayHeaderZoomTwoLine : styles.overlayHeaderZoom);

  const titleBlock = (
    <View
      style={[
        styles.overlayTitleRow,
        useBackButton ? styles.overlayTitleRowIntegratedBack : null,
        useBackButton && isZoomed ? styles.overlayTitleRowIntegratedBackZoom : null,
      ]}
    >
      <View style={styles.overlayTitleCluster}>
        {headerIcon ? (
          <View style={[styles.overlayTitleIconSlot, isZoomed && styles.overlayTitleIconSlotZoom]}>
            <ContentIconScaleContext.Provider value={1}>
              <AppIcon name={headerIcon} size={overlayHeaderIconSize} />
            </ContentIconScaleContext.Provider>
          </View>
        ) : null}
        <View
          style={[
            styles.overlayTitleTextShrink,
            !headerIcon ? styles.overlayTitleTextShrinkStandalone : null,
          ]}
        >
          <ContentTextScaleContext.Provider value={overlayTitleTextScale}>
            <Text
              style={[
                styles.overlayTitle,
                headerIcon ? styles.overlayTitleBesideIcon : null,
                titleLarge && styles.overlayTitleLarge,
              ]}
              numberOfLines={prefersTwoLineTitle ? 2 : 1}
            >
              {title}
            </Text>
          </ContentTextScaleContext.Provider>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.overlayWrap}>
      {secondaryRowFirst && secondaryRow ? <View style={styles.overlaySecondaryRow}>{secondaryRow}</View> : null}
      {useBackButton ? (
        <Pressable
          style={({ pressed }) => [
            styles.overlayHeader,
            styles.overlayHeaderIntegratedBack,
            headerZoomStyle,
            pressed && styles.stationHeaderPressed,
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={backAccessibilityLabel}
        >
          <View style={[styles.stationBackStrip, isZoomed && styles.overlayBackStripZoom, { pointerEvents: 'none' }]}>
            <RNText style={[styles.stationBackArrow, isZoomed && styles.overlayBackStripArrowZoom]}>‹</RNText>
          </View>
          {titleBlock}
        </Pressable>
      ) : (
        <View style={[styles.overlayHeader, headerZoomStyle]}>
          {titleBlock}
          {showCloseButton ? (
            <Pressable style={styles.closeButton} onPress={onClose}>
              <RNText style={styles.closeText}>X</RNText>
            </Pressable>
          ) : null}
        </View>
      )}
      {!secondaryRowFirst && secondaryRow ? <View style={styles.overlaySecondaryRow}>{secondaryRow}</View> : null}
      {body}
    </View>
  );
}

function InfoLine({
  icon,
  value,
}: {
  icon: React.ComponentProps<typeof FontAwesome5>['name'];
  value: string;
}) {
  return (
    <View style={styles.infoLine}>
      <AppIcon name={icon} size={22} />
      <Text style={styles.infoLineText}>{value}</Text>
    </View>
  );
}

function SupportContent({
  lang,
  onToggleZoom,
  helpdeskNumber,
  helpdeskEmail,
  androidStoreLink,
  appleStoreLink,
  chargingLink,
  onOpenQr,
}: {
  lang: LanguageCode;
  onToggleZoom: () => void;
  helpdeskNumber: string;
  helpdeskEmail: string;
  androidStoreLink: string;
  appleStoreLink: string;
  chargingLink: string;
  onOpenQr: (title: string, value: string) => void;
}) {
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchTriggeredRef = useRef(false);
  const isAndroid = Platform.OS === 'android';

  const distance = (a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) =>
    Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

  const onTouchStart = (event: any) => {
    if (!isAndroid) return;
    const touches = event?.nativeEvent?.touches;
    if (!touches || touches.length < 2) return;
    pinchStartDistanceRef.current = distance(touches[0], touches[1]);
    pinchTriggeredRef.current = false;
  };

  const onTouchMove = (event: any) => {
    if (!isAndroid) return;
    const touches = event?.nativeEvent?.touches;
    if (!touches || touches.length < 2 || pinchStartDistanceRef.current == null) return;
    const currentDistance = distance(touches[0], touches[1]);
    const ratio = currentDistance / pinchStartDistanceRef.current;
    if (!pinchTriggeredRef.current && (ratio > 1.18 || ratio < 0.85)) {
      pinchTriggeredRef.current = true;
      onToggleZoom();
    }
  };

  const onTouchEnd = () => {
    pinchStartDistanceRef.current = null;
    pinchTriggeredRef.current = false;
  };

  return (
    <View
      style={styles.supportWrap}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <Text style={styles.supportIntro}>
        {t(lang, 'support.intro')}
      </Text>
      <Text style={styles.supportBody}>
        {t(lang, 'support.lead')}
      </Text>

      <View style={styles.supportCards}>
        <SupportRow
          icon="phone-alt"
          title={helpdeskNumber}
          subtitle={`${t(lang, 'support.phoneCardTitle')} - ${t(lang, 'support.phoneCardHint')}`}
          onOpenQr={() => onOpenQr(t(lang, 'actions.support'), `tel:${helpdeskNumber}`)}
          qrLabel={t(lang, 'support.showQr')}
          emphasizeTitle
        />
        <SupportRow
          icon="envelope"
          title={helpdeskEmail}
          subtitle={`${t(lang, 'support.emailCardTitle')} - ${t(lang, 'support.emailCardHint')}`}
          onOpenQr={() => onOpenQr('E-mail', `mailto:${helpdeskEmail}`)}
          qrLabel={t(lang, 'support.showQr')}
        />
      </View>

      <View style={styles.supportInfoCard}>
        <Text style={styles.supportInfoTitle}>
          {t(lang, 'support.mailPrepTitle')}
        </Text>
        <SupportInfoItem icon="user-tie" text={t(lang, 'support.mailPrepOwner')} />
        <SupportInfoItem icon="charging-station" text={t(lang, 'support.mailPrepStation')} />
        <SupportInfoItem icon="plug" text={t(lang, 'support.mailPrepConnector')} />
        <SupportInfoItem icon="clock" text={t(lang, 'support.mailPrepTime')} />
      </View>

      <Text style={styles.supportFootnote}>
        {t(lang, 'support.callbackHint')}
      </Text>

      <Text style={styles.supportAppsHeading}>
        {t(lang, 'support.appsHint')}
      </Text>
      <View style={styles.supportCards}>
        <SupportRow
          icon="android"
          title={t(lang, 'support.androidApp')}
          subtitle={t(lang, 'support.androidApp')}
          onOpenQr={() => onOpenQr(t(lang, 'support.androidApp'), androidStoreLink)}
          qrLabel={t(lang, 'support.showQr')}
        />
        <SupportRow
          icon="apple"
          title={t(lang, 'support.appleApp')}
          subtitle={t(lang, 'support.appleApp')}
          onOpenQr={() => onOpenQr(t(lang, 'support.appleApp'), appleStoreLink)}
          qrLabel={t(lang, 'support.showQr')}
        />
        <SupportRow
          icon="globe-europe"
          title={t(lang, 'support.webApp')}
          subtitle={t(lang, 'support.webApp')}
          onOpenQr={() => onOpenQr(t(lang, 'support.webApp'), chargingLink)}
          qrLabel={t(lang, 'support.showQr')}
        />
      </View>
    </View>
  );
}

function SupportInfoItem({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof FontAwesome5>['name'];
  text: string;
}) {
  return (
    <View style={styles.supportInfoItemRow}>
      <AppIcon name={icon} size={18} />
      <Text style={styles.supportInfoItem}>{text}</Text>
    </View>
  );
}

function SupportRow({
  icon,
  title,
  subtitle,
  qrLabel,
  onOpenQr,
  emphasizeTitle,
}: {
  icon: React.ComponentProps<typeof FontAwesome5>['name'];
  title: string;
  subtitle: string;
  qrLabel: string;
  onOpenQr: () => void;
  emphasizeTitle?: boolean;
}) {
  return (
    <View style={styles.supportRow}>
      <View style={styles.supportRowMain}>
        <AppIcon name={icon} size={24} />
        <View style={styles.supportRowTextWrap}>
          <FitText
            style={[
              styles.supportRowTitle,
              emphasizeTitle && styles.supportRowTitleStrong,
            ]}
            minScale={0.42}
            targetChars={18}
          >
            {title}
          </FitText>
          <Text style={styles.supportRowSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Pressable style={styles.supportQrButton} onPress={onOpenQr}>
        <AppIcon name="qrcode" size={20} />
        <Text style={styles.supportQrButtonText}>{qrLabel}</Text>
      </Pressable>
    </View>
  );
}

function QrContent({
  lang,
  value,
  evseId,
  showPaymentOptions,
  androidStoreLink,
  appleStoreLink,
  onOpenQr,
}: {
  lang: LanguageCode;
  value: string;
  evseId: string;
  showPaymentOptions: boolean;
  androidStoreLink: string;
  appleStoreLink: string;
  onOpenQr: (title: string, value: string, options?: { returnTo?: Screen; showPaymentOptions?: boolean }) => void;
}) {
  const browserUrl = `https://my.agevolt.com/evse/${evseId}`;
  const paymentOptions: Array<{ icon: React.ComponentProps<typeof FontAwesome5>['name']; label: string }> = [
    { icon: 'credit-card', label: t(lang, 'qr.pay.googlePay') },
    { icon: 'mobile-alt', label: t(lang, 'qr.pay.applePay') },
    { icon: 'credit-card', label: t(lang, 'qr.pay.cards') },
  ];

  if (!showPaymentOptions) {
    return (
      <View style={styles.qrWrapSimple}>
        <Text style={styles.qrScanHeading}>{t(lang, 'qr.scanHeading')}</Text>
        <LocalQrCode value={value} size={420} />
      </View>
    );
  }

  return (
    <View style={styles.qrWrap}>
      <Text style={styles.qrScanHeading}>{t(lang, 'qr.scanHeadingFull')}</Text>
      <LocalQrCode value={value} size={320} />
      <View style={styles.qrLinkHintBubble}>
        <Text style={styles.qrLinkHintText}>
          {t(lang, 'qr.browserHint')}
        </Text>
        <Text style={styles.qrLinkValueText}>{browserUrl}</Text>
      </View>
      <View style={styles.qrPaymentMergedBubble}>
        <Text style={styles.qrLinkHintText}>{t(lang, 'qr.paymentHint')}</Text>
        <View style={styles.qrPaymentGrid}>
          {paymentOptions.map((item) => (
            <View key={item.label} style={styles.qrPaymentChip}>
              <AppIcon name={item.icon} size={24} />
              <FitText style={styles.qrPaymentChipText} minScale={0.66} targetChars={14}>
                {item.label}
              </FitText>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.qrAppCards}>
        <View style={styles.qrAppCardRow}>
          <SupportRow
            icon="android"
            title={t(lang, 'support.androidApp')}
            subtitle={t(lang, 'support.androidApp')}
            onOpenQr={() => onOpenQr(t(lang, 'support.androidApp'), androidStoreLink, { returnTo: 'qr' })}
            qrLabel={t(lang, 'support.showQr')}
          />
        </View>
        <View style={styles.qrAppCardRow}>
          <SupportRow
            icon="apple"
            title={t(lang, 'support.appleApp')}
            subtitle={t(lang, 'support.appleApp')}
            onOpenQr={() => onOpenQr(t(lang, 'support.appleApp'), appleStoreLink, { returnTo: 'qr' })}
            qrLabel={t(lang, 'support.showQr')}
          />
        </View>
      </View>
    </View>
  );
}

function InfoReader({
  lang,
  index,
  visibleBlockIds,
  onBack,
  onPrev,
  onNext,
  onSelectTopic,
}: {
  lang: LanguageCode;
  index: number;
  visibleBlockIds: readonly HelpId[];
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectTopic: (nextIndex: number) => void;
}) {
  const contentTextScale = useContext(ContentTextScaleContext);
  const isZoomed = contentTextScale > 1;
  const [showTopicList, setShowTopicList] = useState(false);
  const n = visibleBlockIds.length;
  const topicIds = visibleBlockIds.slice(0, 15);
  const currentId = visibleBlockIds[index];
  const prevId = index > 0 ? visibleBlockIds[index - 1] : null;
  const nextId = index < n - 1 ? visibleBlockIds[index + 1] : null;
  const page = buildHelpPage(lang, currentId);
  const pagerIconSize = Math.round(TYPO.medium * 2 * contentTextScale);
  const pagerNavMinH = Math.max(66, pagerIconSize + 16);
  const pagerBarMinHeight = Math.max(82, pagerNavMinH + 16);
  const helpHeaderTitleScale = isZoomed ? 2 : 1;
  const helpHeaderIconSize = isZoomed ? 44 : 24;
  /** Title row is only in the flex:left region; counter column (143/164) steals width. Shift right by half so the cluster centers like full-width overlay titles (Podpora). */
  const helpHeaderTitleHorizNudge = (isZoomed ? 164 : 143) / 2;

  return (
    <View style={styles.infoReaderWrap}>
      <View style={[styles.infoReaderHeader, isZoomed && styles.infoReaderHeaderZoom, styles.infoReaderHeaderIntegratedBack]}>
        <Pressable
          style={({ pressed }) => [styles.infoReaderLeftBackZone, pressed && styles.stationHeaderPressed]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'info.reader.back')}
        >
          <View style={[styles.stationBackStrip, isZoomed && styles.overlayBackStripZoom, { pointerEvents: 'none' }]}>
            <RNText style={[styles.stationBackArrow, isZoomed && styles.overlayBackStripArrowZoom]}>‹</RNText>
          </View>
          <ContentTextScaleContext.Provider value={helpHeaderTitleScale}>
            <View
              style={[
                styles.overlayTitleRow,
                styles.overlayTitleRowIntegratedBack,
                isZoomed && styles.overlayTitleRowIntegratedBackZoom,
                { marginLeft: helpHeaderTitleHorizNudge },
              ]}
            >
              <View style={styles.overlayTitleCluster}>
                <View style={[styles.overlayTitleIconSlot, isZoomed && styles.overlayTitleIconSlotZoom]}>
                  <ContentIconScaleContext.Provider value={1}>
                    <AppIcon name="book-open" size={helpHeaderIconSize} />
                  </ContentIconScaleContext.Provider>
                </View>
                <View style={styles.overlayTitleTextShrink}>
                  <Text
                    style={[
                      styles.overlayTitle,
                      styles.overlayTitleBesideIcon,
                      isZoomed && Platform.select({ android: { includeFontPadding: false } }),
                    ]}
                    numberOfLines={2}
                  >
                    {t(lang, 'info.reader.title')}
                  </Text>
                </View>
              </View>
            </View>
          </ContentTextScaleContext.Provider>
        </Pressable>
        <View style={[styles.infoReaderHeaderSideSlot, isZoomed && styles.infoReaderHeaderSideSlotZoom]}>
          <View
            style={[
              styles.infoReaderProgressBox,
              isZoomed && styles.infoReaderProgressBoxZoom,
            ]}
          >
            {isZoomed ? (
              <View style={styles.infoReaderProgressZoomWrap}>
                <Text style={styles.infoReaderProgressZoomLine}>
                  {String(index + 1).padStart(2, '0')}/
                </Text>
                <Text style={styles.infoReaderProgressZoomLine}>
                  {String(n).padStart(2, '0')}
                </Text>
              </View>
            ) : (
              <ZoomAdaptiveText
                style={styles.infoReaderProgressText}
                zoomMaxLines={1}
                zoomTargetCharsPerLine={7}
                zoomMinScale={0.5}
                allowBaseScaleShrink={false}
                fitSingleLine
              >
                {`${String(index + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`}
              </ZoomAdaptiveText>
            )}
          </View>
        </View>
      </View>

      <View style={[styles.infoReaderPagerBar, { minHeight: pagerBarMinHeight }]}>
        <Pressable
          style={({ pressed }) => [
            styles.infoReaderNavBlock,
            styles.infoReaderNavActionBlockLeft,
            { minHeight: pagerNavMinH },
            (!prevId || showTopicList) && styles.infoReaderNavBlockDisabled,
            prevId && !showTopicList && pressed && styles.infoActionPressed,
          ]}
          onPress={onPrev}
          disabled={!prevId || showTopicList}
        >
          <ContentIconScaleContext.Provider value={1}>
            <AppIcon name="angle-double-left" size={pagerIconSize} />
          </ContentIconScaleContext.Provider>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.infoReaderNavBlock,
            styles.infoReaderNavActionBlockBottom,
            styles.infoReaderNavBlockCurrent,
            pressed && styles.infoActionPressed,
          ]}
          onPress={() => setShowTopicList((prev) => !prev)}
        >
          <ZoomAdaptiveText style={styles.infoReaderNavLabel} zoomMaxLines={2} zoomTargetCharsPerLine={7} zoomMinScale={0.35}>
            {t(lang, 'info.reader.topicList')}
          </ZoomAdaptiveText>
          <View style={styles.infoReaderNavActionStripBottom}>
            <RNText style={styles.infoReaderNavActionStripArrowBottom}>∨</RNText>
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.infoReaderNavBlock,
            styles.infoReaderNavActionBlockRight,
            { minHeight: pagerNavMinH },
            (!nextId || showTopicList) && styles.infoReaderNavBlockDisabled,
            nextId && !showTopicList && pressed && styles.infoActionPressed,
          ]}
          onPress={onNext}
          disabled={!nextId || showTopicList}
        >
          <ContentIconScaleContext.Provider value={1}>
            <AppIcon name="angle-double-right" size={pagerIconSize} />
          </ContentIconScaleContext.Provider>
        </Pressable>
      </View>

      <BubbleSnapScroll
        gap={10}
        fabRight={BUBBLE_SNAP_SCROLL_FAB_RIGHT_INFO}
        scrollStyle={styles.infoReaderBody}
        contentContainerStyle={styles.infoReaderBodyContent}
        bounces={false}
        scrollUpAccessibilityLabel={t(lang, 'actions.scrollUp')}
        scrollDownAccessibilityLabel={t(lang, 'actions.scrollDown')}
      >
        <View style={styles.infoReaderScrollInner}>
        {showTopicList ? (
          <>
            <Text style={styles.infoReaderListTitle}>{t(lang, 'info.reader.listTitle')}</Text>
            <Text style={styles.infoReaderListHint}>{t(lang, 'info.reader.listHint')}</Text>
            {topicIds.map((topicId, topicIndex) => (
              <Pressable
                key={topicId}
                style={({ pressed }) => [
                  styles.infoTopicListItem,
                  topicIndex === index && styles.infoTopicListItemActive,
                  pressed && styles.infoActionPressed,
                ]}
                onPress={() => {
                  onSelectTopic(topicIndex);
                  setShowTopicList(false);
                }}
              >
                <View style={styles.infoTopicListItemMain}>
                  <Text style={styles.infoTopicListItemOrder}>
                    {String(topicIndex + 1).padStart(2, '0')} / {String(topicIds.length).padStart(2, '0')}
                  </Text>
                  <ZoomAdaptiveText
                    style={styles.infoTopicListItemTitle}
                    zoomMaxLines={2}
                    zoomTargetCharsPerLine={24}
                    zoomMinScale={0.22}
                  >
                    {tInfoBlock(lang, topicId, 'title')}
                  </ZoomAdaptiveText>
                </View>
                <View style={styles.infoReaderNavActionStrip}>
                  <RNText style={styles.infoReaderNavActionStripArrow}>›</RNText>
                </View>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <View style={styles.infoTopicRow}>
              <AppIcon name="book-open" size={22} />
              <Text style={styles.infoTopicTitle}>{page.title}</Text>
            </View>
            <Text style={styles.infoReaderIntro}>{page.intro}</Text>

            {page.sections.map((section) => (
              <View
                key={`${page.id}-${section.type}-${section.title}`}
                style={[
                  styles.infoReaderCard,
                  section.type === 'important' && styles.infoReaderCardImportant,
                  section.type === 'locate' && styles.infoReaderCardLocate,
                ]}
              >
                <Text style={styles.infoReaderCardTitle}>{section.title}</Text>
                <Text style={styles.infoReaderCardText}>{section.body}</Text>
              </View>
            ))}
          </>
        )}
        </View>
      </BubbleSnapScroll>
    </View>
  );
}

function calculateMaxPowerKw(
  powerType: 'AC' | 'DC',
  phases: 1 | 3,
  maxAmps: number
): number {
  if (powerType === 'DC') return maxAmps * 0.7;
  return (phases * 230 * maxAmps) / 1000;
}

const TEXT_SCALE = 1;
const ICON_SIZE = 34;
const TYPO = {
  large: Math.round(30 * TEXT_SCALE),
  medium: Math.round(24 * TEXT_SCALE),
  small: Math.round(18 * TEXT_SCALE),
  superLarge: Math.round(26 * 1.5 * TEXT_SCALE),
  // Backward-compatible aliases: only 3 real size tiers.
  display: Math.round(30 * TEXT_SCALE),
  title: Math.round(30 * TEXT_SCALE),
  body: Math.round(24 * TEXT_SCALE),
  meta: Math.round(18 * TEXT_SCALE),
};
const lh = (size: number, ratio = 1.2) => Math.round(size * ratio);
const STATION_FONT = Math.round(TYPO.title * 2);

/**
 * Jednotná typografia v bublinách konektora (identita „Voľný | …“, Štart, cenník, session; Prihlásiť je nad scrolom).
 * Primárna veľkosť = rovnaká ako `connectorNameOverview` / stav vedľa parkovacieho miesta.
 */
const CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE = STATION_FONT;
const CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT = lh(STATION_FONT, 1.05);
/** Ikona hodín v identite konektora — vizuálne k primárnemu textu bubliny. */
const CONNECTOR_IDENTITY_CLOCK_ICON_SIZE = Math.round(CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE * 0.72);
/** Hodnoty vedľa ikon (session) — vyšší riadok kvôli spodkom písmen (y, g, j). */
const CONNECTOR_SESSION_VALUE_LINE_HEIGHT = Math.round(CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE * 1.28);
/** Dlhšie vysvetlenia (podnadpisy, zoznamy EMP) — o stupeň menší, stále čitateľné na kiosku. */
const CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE = Math.round(TYPO.medium * 2);
const CONNECTOR_BUBBLE_SECONDARY_LINE_HEIGHT = lh(CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE);
/**
 * Štart / Prihlásiť / Ukončiť — jednotná výška pod identitou.
 * Vyššia než samotná ikona 72px + text, aby `overflow: hidden` neorezal spodky (j, g, y).
 */
const CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT = 96;

/** Rovnaká veľkosť ikon ako na idle karte „Voľný“ (napr. charging-station, car-side-bolt). */
const CONNECTOR_IDLE_ROW_ICON_SIZE = 52;
/** Fixná šírka stĺpca pre ikony (glyph + malý okraj), zarovnanie riadkov. */
const CONNECTOR_SESSION_ICON_COL_WIDTH = 60;
/** Riadok sumy v RFID modáli — rovnaká výška ako skutočný riadok (ikona vs. text). */
const STATION_RFID_COST_ROW_MIN_HEIGHT = Math.max(
  CONNECTOR_IDLE_ROW_ICON_SIZE,
  CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT
);
/** Riadok výberu vozidla (ŠPZ + názov) — vyšší než 96px kvôli dvom riadkom bez orezania. */
const STATION_RFID_PICKER_VEHICLE_ROW_MIN_HEIGHT = Math.round(
  CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT + CONNECTOR_BUBBLE_SECONDARY_LINE_HEIGHT + 20
);

/** Predelovacie čiary (hlavička stanice, konektor, overview, Príprava, Pomoc): 2 px, čierna @ 0.28. */
const KIOSK_DIVIDER_STROKE = 2;
const KIOSK_DIVIDER_COLOR = '#000000';
const KIOSK_DIVIDER_OPACITY = 0.28;

const styles = StyleSheet.create({
  rfidTapModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  rfidTapModalCard: {
    backgroundColor: '#ffffff',
    borderWidth: 4,
    borderColor: '#000000',
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
    minHeight: 160,
  },
  stationRfidModalRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  stationRfidModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  stationRfidModalShell: {
    width: '100%',
    maxWidth: KIOSK_WIDTH - 24,
    maxHeight: '92%',
    gap: 8,
  },
  stationRfidModalCard: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    width: '100%',
  },
  stationRfidModalContent: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  stationRfidSummaryCard: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  stationRfidSummaryTop: {
    width: '100%',
    gap: 8,
  },
  stationRfidSummaryUnknownBlock: {
    width: '100%',
    gap: 10,
  },
  stationRfidSummaryUnknownRoamingLine: {
    width: '100%',
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: lh(CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE, 1.2),
    fontWeight: '700',
  },
  stationRfidSummaryBlockedBanner: {
    width: '100%',
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  stationRfidSummaryUidLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    minWidth: 0,
  },
  stationRfidSummaryIconSlot: {
    width: CONNECTOR_SESSION_ICON_COL_WIDTH,
    height: CONNECTOR_SESSION_ICON_COL_WIDTH,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  /** Rovnaká šírka ako `stationRfidSummaryIconSlot` — otáznik pod ikonou karty. */
  stationRfidSummaryLeadIconCol: {
    width: CONNECTOR_SESSION_ICON_COL_WIDTH,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Dva riadky textu (ŠPZ + názov, e-mail pred/po @) — ikona v `stationRfidSummaryUidLine` sa vystredí k celému bloku. */
  stationRfidSummaryStackedUidCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'center',
  },
  /** Summary stack lines need fixed-width text styles without flex, unlike `stationRfidSummaryUid`. */
  stationRfidSummaryPrimaryStackLine: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    width: '100%',
    minWidth: 0,
  },
  stationRfidSummarySecondaryStackLine: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    width: '100%',
    minWidth: 0,
  },
  /** Rovnaké ako `connectorNameOverview` na prehľade konektora. */
  stationRfidSummaryUid: {
    flex: 1,
    minWidth: 0,
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
  },
  /** Dva riadky pod sebou v `stationRfidSummaryStackedUidCol` — bez `flex: 1`, aby sa nevťahovali výška navzájom. */
  stationRfidSummaryUidStackLine: {
    flex: 0,
    flexGrow: 0,
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
  },
  stationRfidConnectorGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  stationRfidConnectorGridStack: {
    flexDirection: 'column',
  },
  stationRfidConnectorGridCell: {
    flex: 1,
    minWidth: 0,
  },
  stationRfidConnectorGridCellStack: {
    width: '100%',
  },
  /** Blokovaná karta: len názov konektora + do-not-enter (rovnaká veľkosť písma ako UID v hornej bublinke). */
  stationRfidBlockedConnectorBubble: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minWidth: 0,
  },
  stationRfidBlockedConnectorSpot: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  stationRfidConnectorPanel: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    justifyContent: 'flex-start',
  },
  /** Rovnaká veľkosť ako `stationRfidConnectorSpot` / tlačidlá; ikona `coins` ako pri live nabíjaní. */
  stationRfidConnectorCostLine: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    flex: 1,
    minWidth: 0,
    width: '100%',
  },
  /** Prázdny riadok rovnakej výšky ako riadok so sumou (zarovnanie akcií medzi panelmi). */
  stationRfidConnectorCostRowPlaceholder: {
    minHeight: STATION_RFID_COST_ROW_MIN_HEIGHT,
  },
  stationRfidConnectorBlockedRow: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    minHeight: CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT,
    maxHeight: CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  stationRfidConnectorReasonBox: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: '100%',
    minWidth: 0,
  },
  stationRfidConnectorReasonText: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_SECONDARY_LINE_HEIGHT,
    fontWeight: '700',
    width: '100%',
    minWidth: 0,
  },
  stationRfidConnectorSpot: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
  },
  /** Rovnaká ako stav vedľa parkovacieho miesta na prehľade (`connectorNameOverviewStatus`). */
  stationRfidConnectorStatus: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
  },
  stationRfidConnectorInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  stationRfidConnectorInfoText: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_SECONDARY_LINE_HEIGHT,
    fontWeight: '700',
    flexShrink: 1,
    minWidth: 0,
  },
  stationRfidConnectorDetailText: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: lh(CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE, 1.18),
    fontWeight: '700',
  },
  stationRfidConnectorActions: {
    gap: 8,
    width: '100%',
  },
  /** Rovnaká výška a pruh ako `connectorPrimaryActionShell` / session akcie. */
  stationRfidActionButton: {
    position: 'relative',
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
  },
  /** Pevná výška len pri 1× — pri lupe ju v `StationRfidQuickAction` prepíšeme škálovanou min. výškou bez maxHeight. */
  stationRfidActionButtonHeightLock: {
    minHeight: CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT,
    maxHeight: CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT,
  },
  /** Riadok v modálnom zozname vozidiel — dva riadky textu, bez `maxHeight` 96 (inak sa orezá). */
  stationRfidPickerVehicleRowButton: {
    position: 'relative',
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    minHeight: STATION_RFID_PICKER_VEHICLE_ROW_MIN_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
  },
  stationRfidActionButtonSecondary: {
    borderWidth: 2,
  },
  stationRfidActionButtonMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    minHeight: CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT,
  },
  stationRfidActionButtonMainStripRight: {
    paddingLeft: 12,
    paddingRight: 44,
  },
  stationRfidActionButtonMainStripLeft: {
    paddingLeft: 44,
    paddingRight: 12,
  },
  stationRfidPickerVehicleRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    minHeight: STATION_RFID_PICKER_VEHICLE_ROW_MIN_HEIGHT,
    paddingLeft: 12,
    paddingRight: 44,
  },
  stationRfidPickerVehiclePlateLine: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    width: '100%',
    minWidth: 0,
  },
  /** Rovnaká typografia ako `connectorPrimaryActionLabelText`. */
  stationRfidModalActionLabelText: {
    flex: 1,
    minWidth: 0,
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_SESSION_VALUE_LINE_HEIGHT,
    fontWeight: '900',
  },
  stationRfidActionButtonStrip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 34,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationRfidActionButtonStripRight: {
    right: 0,
  },
  stationRfidActionButtonStripLeft: {
    left: 0,
  },
  stationRfidActionButtonArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title, 1),
    fontWeight: '900',
  },
  stationRfidConnectorNoActionBox: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationRfidConnectorNoActionText: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: lh(CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE, 1.15),
    fontWeight: '800',
    textAlign: 'center',
  },
  stationRfidFooterActions: {
    width: '100%',
    gap: 8,
  },
  /** Späť vľavo, primárna akcia vpravo — jeden riadok. */
  stationRfidFooterActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 10,
  },
  stationRfidFooterRowActionCell: {
    flex: 1,
    minWidth: 0,
  },
  stationRfidFooterRowAction: {
    width: '100%',
  },
  stationRfidStepWrap: {
    gap: 10,
  },
  stationRfidStepTitle: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    textAlign: 'center',
  },
  stationRfidStepHint: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_SECONDARY_LINE_HEIGHT,
    fontWeight: '700',
    textAlign: 'center',
  },
  stationRfidTitleWithIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minWidth: 0,
  },
  stationRfidStepTitleInIconRow: {
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
  },
  /** Nadpisy „Priestor“ / „Vozidlo“ — celá skupina ikona+text vycentrovaná; ikona hneď vedľa nadpisu (nie na ľavom okraji obrazovky). */
  stationRfidStepHeadingOuter: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stationRfidStepHeadingCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '100%',
    minWidth: 0,
  },
  /** `maxWidth` na obale merania pre FitText / ZoomAdaptiveText. */
  stationRfidStepTitleHeadingClusterText: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 420,
    textAlign: 'left',
  },
  stationRfidPickerVehicleLines: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    gap: 4,
    justifyContent: 'center',
  },
  stationRfidPickerVehicleNameLine: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_SECONDARY_LINE_HEIGHT,
    fontWeight: '800',
    width: '100%',
    minWidth: 0,
  },
  stationRfidPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minWidth: 0,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    minHeight: CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT,
  },
  stationRfidPickRowSelected: {
    borderWidth: 4,
  },
  stationRfidPickRowLabel: {
    flex: 1,
    minWidth: 0,
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_SESSION_VALUE_LINE_HEIGHT,
    fontWeight: '900',
    textAlign: 'left',
  },
  stationRfidConfirmSummary: {
    width: '100%',
    minWidth: 0,
    gap: 14,
  },
  stationRfidConfirmIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minWidth: 0,
  },
  stationRfidConfirmSummaryText: {
    flex: 1,
    minWidth: 0,
  },
  stationRfidConfirmVehicleTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  stationRfidConfirmVehicleLine: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    width: '100%',
  },
  stationRfidConfirmVehicleSubline: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_SECONDARY_LINE_HEIGHT,
    fontWeight: '800',
    width: '100%',
  },
  stationRfidCompactSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minWidth: 0,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT,
    backgroundColor: '#ffffff',
  },
  stationRfidCompactSelectRowTwoLine: {
    minHeight: STATION_RFID_PICKER_VEHICLE_ROW_MIN_HEIGHT,
  },
  stationRfidCompactSelectVehicleStack: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'center',
  },
  stationRfidCompactSelectVehiclePlateLine: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_SESSION_VALUE_LINE_HEIGHT,
    fontWeight: '900',
    width: '100%',
    minWidth: 0,
  },
  stationRfidCompactSelectVehicleNameLine: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_SECONDARY_LINE_HEIGHT,
    fontWeight: '800',
    width: '100%',
    minWidth: 0,
  },
  stationRfidCompactSelectLabel: {
    flex: 1,
    minWidth: 0,
  },
  stationRfidPickerModalRoot: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingTop: 44,
    paddingBottom: 16,
    gap: 10,
  },
  stationRfidPickerModalTitle: {
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  stationRfidPickerModalScroll: {
    flex: 1,
    minHeight: 160,
    width: '100%',
  },
  stationRfidPickerModalScrollContent: {
    gap: 8,
    paddingBottom: 8,
  },
  stationRfidTextInput: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: lh(CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE, 1.1),
    fontWeight: '700',
    color: '#000000',
    backgroundColor: '#ffffff',
  },
  stationRfidErrorText: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#000000',
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: lh(CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE, 1.18),
    fontWeight: '800',
    textAlign: 'center',
  },
  stationRfidVehicleList: {
    gap: 8,
  },
  appFrame: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    ...(Platform.OS === 'web' ? { userSelect: 'none' } : {}),
  } as ViewStyle,
  contentViewport: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  contentZoomLayer: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  homeNoScroll: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 8,
    gap: 6,
  },
  stationShell: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    padding: 8,
    gap: 6,
  },
  stationShellCompact: {
    gap: 4,
    padding: 6,
  },
  stationHeader: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 0,
  },
  stationHeaderWithBackStrip: {
    paddingLeft: 0,
    paddingRight: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  stationHeaderPressed: {
    opacity: 0.88,
  },
  stationBackStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 34,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  stationBackArrow: {
    color: '#ffffff',
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    fontWeight: '900',
  },
  stationHeaderLeft: {
    width: '68%',
    justifyContent: 'center',
    gap: 4,
    paddingRight: 8,
  },
  stationHeaderLeftWithBack: {
    paddingLeft: 44,
  },
  stationHeaderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  stationHeaderText: {
    flex: 1,
    minWidth: 0,
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT),
    color: '#000000',
    fontWeight: '900',
  },
  stationHeaderDivider: {
    width: KIOSK_DIVIDER_STROKE,
    alignSelf: 'stretch',
    backgroundColor: KIOSK_DIVIDER_COLOR,
    opacity: KIOSK_DIVIDER_OPACITY,
  },
  stationHeaderRight: {
    width: '32%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  stationHeaderDeviceIdPress: {
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationHeaderIdText: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT),
    color: '#000000',
    fontWeight: '800',
    textAlign: 'center',
  },
  stationBody: {
    flex: 1,
    gap: 8,
    minHeight: 0,
  },
  header: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    height: 84,
    minHeight: 84,
    maxHeight: 84,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  headerThird: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  headerThirdLeft: {
    alignItems: 'flex-start',
  },
  headerOwnerPressable: {
    justifyContent: 'center',
  },
  headerOwnerPressed: {
    opacity: 0.88,
  },
  headerThirdCenter: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 1,
  },
  headerThirdRight: {
    alignItems: 'flex-end',
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'flex-end',
    gap: 10,
  },
  ownerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  headerIconTypeKey: {
    fontSize: TYPO.meta,
    lineHeight: lh(TYPO.meta),
    color: '#000000',
    fontWeight: '700',
  },
  headerProviderName: {
    flex: 1,
    minWidth: 0,
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    color: '#000000',
    fontWeight: '800',
  },
  headerDateTime: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1.12),
    color: '#000000',
    fontWeight: '800',
    textAlign: 'center',
  },
  networkLine: {
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '100%',
  },
  headerNetworkKey: {
    fontSize: TYPO.meta,
    lineHeight: lh(TYPO.meta),
    color: '#000000',
    fontWeight: '800',
  },
  headerIconPressTarget: {
    minHeight: 20,
    justifyContent: 'center',
  },
  ocppBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 22,
  },
  ocppBadgeText: {
    fontSize: Math.round(TYPO.medium * 1.14),
    lineHeight: Math.round(TYPO.medium * 1.2),
    color: '#000000',
    fontWeight: '900',
    letterSpacing: 0.12,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  logoBox: {
    borderWidth: 0,
    flex: 1,
    minWidth: 0,
    height: 56,
    minHeight: 56,
    maxHeight: 56,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoWordmark: {
    fontSize: TYPO.medium,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#000000',
  },
  topMagnifierButton: {
    width: 56,
    minWidth: 56,
    maxWidth: 56,
    height: 56,
    minHeight: 56,
    maxHeight: 56,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  topMagnifierButtonActive: {
    backgroundColor: '#000000',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    paddingRight: 38,
  },
  actionButtonZoom: {
    flexDirection: 'column',
    gap: 2,
    paddingHorizontal: 2,
    paddingRight: 34,
    alignItems: 'stretch',
  },
  actionIconSlot: {
    width: 34,
    minWidth: 34,
    maxWidth: 34,
    height: 34,
    minHeight: 34,
    maxHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconSlotZoom: {
    width: 'auto' as any,
    minWidth: 0,
    maxWidth: 'none' as any,
    height: 'auto' as any,
    minHeight: 0,
    maxHeight: 'none' as any,
    alignSelf: 'center',
  },
  actionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  actionButtonStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 34,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  connectorArea: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  connectorCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    padding: 12,
    justifyContent: 'flex-start',
  },
  connectorCardSingle: {
    maxWidth: '100%',
  },
  connectorCardOverview: {
    gap: 6,
    minHeight: 0,
  },
  connectorCardFocused: {
    gap: 8,
  },
  connectorCardWithScroll: {
    minHeight: 0,
  },
  connectorIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  connectorIdentityRowFocused: {
    marginTop: 2,
    justifyContent: 'center',
  },
  connectorIdentityBubble: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    minHeight: 52,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  connectorIdentityBubbleClickable: {
    paddingLeft: 44,
  },
  connectorIdentityBubbleStatic: {
    paddingLeft: 10,
  },
  connectorIdentityBackStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 34,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorIdentityBackStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    fontWeight: '900',
  },
  connectorIdentityMainFocused: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  connectorIdentityMainWithSideArrow: {
    gap: 6,
  },
  connectorIdentityMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 0,
    width: '100%',
  },
  connectorIdentityMainClickable: {
    borderWidth: 2.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flex: 1,
    justifyContent: 'flex-start',
  },
  connectorName: {
    fontSize: TYPO.superLarge,
    lineHeight: lh(TYPO.superLarge, 1.12),
    fontWeight: '900',
    color: '#000000',
  },
  connectorNameOverview: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorNameOverviewStatus: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorIdentityDivider: {
    width: KIOSK_DIVIDER_STROKE,
    alignSelf: 'stretch',
    backgroundColor: KIOSK_DIVIDER_COLOR,
    opacity: KIOSK_DIVIDER_OPACITY,
    marginHorizontal: 4,
    flexShrink: 0,
  },
  connectorIdentityStatusBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 0,
  },
  connectorIdentityStatusBlockRight: {
    alignItems: 'flex-end',
  },
  connectorIdentityStatusBlockLeft: {
    alignItems: 'flex-start',
  },
  connectorIdentitySpotWrap: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '38%',
    gap: 2,
  },
  connectorIdentitySpotCountdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
    minWidth: 0,
  },
  connectorIdentitySpotCountdownText: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    minWidth: 0,
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  connectorSideHintStack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    minWidth: 0,
    marginTop: -4,
  },
  connectorSideHintArrow: {
    fontSize: TYPO.title * 2.18,
    lineHeight: lh(TYPO.title * 2.18, 0.88),
    fontWeight: '900',
    color: '#000000',
  },
  /** Rovnaká výška a okraj ako session horná akcia (Prihlásiť / Ukončiť). */
  connectorPrimaryActionShell: {
    position: 'relative',
    alignSelf: 'stretch',
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
    height: CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT,
    minHeight: CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT,
    maxHeight: CONNECTOR_PRIMARY_ACTION_BUBBLE_HEIGHT,
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 0,
    justifyContent: 'center',
  },
  /** Dva `flex:1` boky + stredný cluster = horizontálne centrovanie; vpravo rezerva na pruh › (session) alebo `connectorBubbleClickable` (Štart). */
  connectorPrimaryActionContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    paddingLeft: 12,
    paddingRight: 44,
  },
  connectorPrimaryActionContentRowInClickableBubble: {
    paddingRight: 0,
  },
  connectorPrimaryActionCenterSpacer: {
    flex: 1,
    minWidth: 0,
  },
  /** RFID + text; `flexShrink: 0` — cluster sa nesmie drviť voči spacerom (inak nestabilná šírka). */
  connectorPrimaryActionCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexShrink: 0,
    minWidth: 0,
    maxWidth: '100%',
  },
  /** Rovnaký pomer výšky riadku ako session metriky — 1.05 na primárnom texte orezával descender. */
  connectorPrimaryActionLabelText: {
    flexShrink: 0,
    minWidth: 0,
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_SESSION_VALUE_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  connectorIdleRfidInfoIcon: {
    position: 'absolute',
    top: 8,
    right: 10,
  },
  connectorIdleRfidIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
  },
  connectorIdleRfidCardImage: {
    width: 72,
    height: 72,
  },
  connectorOverviewBody: {
    flex: 1,
    gap: 10,
    minHeight: 0,
  },
  connectorOverviewRow: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  connectorOverviewRowClickable: {
    overflow: 'hidden',
    paddingLeft: 12,
    paddingRight: 0,
    paddingVertical: 10,
  },
  connectorOverviewRowClickableLeft: {
    overflow: 'hidden',
    paddingLeft: 0,
    paddingRight: 12,
    paddingVertical: 10,
  },
  connectorOverviewCellSplit: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    width: '100%',
  },
  connectorOverviewCellSplitPadLeft: {
    paddingLeft: 44,
  },
  connectorOverviewCellSplitPadRight: {
    paddingRight: 44,
  },
  connectorOverviewCellFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 6,
    gap: 4,
  },
  connectorOverviewCellHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  connectorOverviewCellDivider: {
    height: KIOSK_DIVIDER_STROKE,
    backgroundColor: KIOSK_DIVIDER_COLOR,
    marginVertical: 3,
    opacity: KIOSK_DIVIDER_OPACITY,
  },
  connectorOverviewRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  connectorOverviewRowSplit: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  connectorOverviewRowHalf: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  connectorOverviewStatusBig: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorOverviewStatusInline: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    maxWidth: '100%',
  },
  connectorOverviewStatusWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: '100%',
    paddingBottom: 4,
  },
  connectorOverviewStatusInlineLine: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.15),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    maxWidth: '100%',
    paddingBottom: 4,
  },
  connectorOverviewPowerTypeBig: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorOverviewPowerKwBig: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorOverviewLiveKicker: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorMiniLabel: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorTxValue: {
    fontSize: TYPO.superLarge * 1.62,
    lineHeight: lh(TYPO.superLarge * 1.62, 1.02),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    minWidth: 0,
    width: '100%',
    alignSelf: 'center',
    fontVariant: ['tabular-nums'],
  },
  /** Riadok ikona+čas na prehľade — bez `width: 100%`, aby sa čas neťahal k okraju pri asymetrickom paddingu. */
  connectorOverviewTimeInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minWidth: 0,
    gap: 10,
  },
  connectorOverviewTxValueInline: {
    fontSize: TYPO.superLarge * 1.62,
    lineHeight: lh(TYPO.superLarge * 1.62, 1.02),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    minWidth: 0,
  },
  connectorPrepareFlowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
  },
  connectorPrepareStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  connectorTimeLabel: {
    flex: 1,
    fontSize: TYPO.title * 1.02,
    lineHeight: lh(TYPO.title * 1.02, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    minWidth: 0,
  },
  connectorPrepareStatusMark: {
    fontSize: TYPO.superLarge * 1.95,
    lineHeight: lh(TYPO.superLarge * 1.95, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorPrepareValue: {
    fontSize: TYPO.title * 1.48,
    lineHeight: lh(TYPO.title * 1.48, 1),
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  connectorOverviewLiveValueBig: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorOverviewLiveValueNumber: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    width: '100%',
    minWidth: 0,
    alignSelf: 'center',
    fontVariant: ['tabular-nums'],
  },
  connectorOverviewLiveValueNumberFull: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    width: '100%',
    minWidth: 0,
    alignSelf: 'center',
    fontVariant: ['tabular-nums'],
  },
  connectorOverviewUnitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  connectorOverviewUnitRowFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    minWidth: 0,
  },
  connectorOverviewLiveUnitText: {
    flexGrow: 0,
    flexShrink: 0,
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    minWidth: 0,
  },
  connectorOverviewLiveUnitTextFull: {
    flexGrow: 0,
    flexShrink: 0,
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    minWidth: 0,
  },
  connectorOverviewTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  connectorOverviewPowerType: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT),
    fontWeight: '900',
    color: '#000000',
  },
  connectorOverviewStatus: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'right',
  },
  connectorOverviewLiveLabel: {
    fontSize: TYPO.small,
    lineHeight: lh(TYPO.small),
    fontWeight: '700',
    color: '#000000',
  },
  connectorOverviewLiveValue: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.1),
    fontWeight: '900',
    color: '#000000',
  },
  connectorPowerBarTrack: {
    height: 12,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  connectorPowerBarFill: {
    height: '100%',
    backgroundColor: '#000000',
  },
  connectorOverviewScale: {
    fontSize: TYPO.small,
    lineHeight: lh(TYPO.small),
    fontWeight: '700',
    color: '#000000',
    textAlign: 'right',
  },
  connectorBubble: {
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  connectorBubbleClickable: {
    borderStyle: 'solid',
    borderWidth: 3,
    overflow: 'hidden',
    paddingRight: 44,
  },
  connectorBubblePressed: {
    opacity: 0.86,
  },
  connectorBubbleLabel: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    fontWeight: '700',
    color: '#000000',
  },
  connectorHeroStatus: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
    color: '#000000',
  },
  connectorHeroLive: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    fontWeight: '700',
    color: '#000000',
  },
  connectorBubbleValue: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.15),
    fontWeight: '800',
    color: '#000000',
  },
  connectorTypeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  policyAccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  policyAccessMark: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '900',
    color: '#000000',
  },
  connectorPlugTypeRow: {
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectorPlugTypeText: {
    flex: 1,
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '800',
    color: '#000000',
  },
  connectorMetaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
  },
  accessBadge: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 36,
    justifyContent: 'center',
  },
  accessBadgeText: {
    fontSize: TYPO.medium,
    fontWeight: '700',
    color: '#000000',
  },
  kpiClickableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  accessMoreCta: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
  },
  accessMoreCtaText: {
    fontSize: TYPO.small,
    lineHeight: lh(TYPO.small),
    fontWeight: '800',
    color: '#000000',
  },
  connectorBubbleCtaRow: {
    marginTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: '#000000',
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  connectorBubbleCtaText: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    fontWeight: '900',
    color: '#000000',
  },
  connectorBubbleActionStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 34,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorBubbleActionStripLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 34,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorBubbleActionStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    fontWeight: '900',
  },
  connectorQrButtonTextMobile: {
    fontSize: TYPO.superLarge * 1.42,
    lineHeight: lh(TYPO.superLarge * 1.42, 1.02),
    color: '#000000',
    fontWeight: '900',
    textAlign: 'center',
    flexShrink: 1,
    maxWidth: '100%',
  },
  connectorOverviewMobileTextWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: '100%',
  },
  connectorQrButtonTextMobileLine: {
    fontSize: TYPO.superLarge * 1.16,
    lineHeight: lh(TYPO.superLarge * 1.16, 1.02),
    color: '#000000',
    fontWeight: '900',
    textAlign: 'center',
    maxWidth: '100%',
  },
  connectorOverviewIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 48,
  },
  connectorPrimaryCta: {
    marginTop: 4,
    minHeight: 68,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  connectorPrimaryCtaDisabled: {
    marginTop: 4,
    minHeight: 68,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f2',
  },
  connectorPrimaryCtaText: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  connectorPrimaryCtaTextDisabled: {
    color: '#000000',
  },
  connectorIdleMobileCtaInner: {
    flexDirection: 'column',
    gap: 4,
    paddingVertical: 10,
  },
  connectorDetailMobileHint: {
    fontSize: TYPO.meta,
    lineHeight: lh(TYPO.meta),
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  connectorIdleRfidCallout: {
    gap: 10,
    paddingVertical: 4,
  },
  connectorIdleRfidLine: {
    fontSize: TYPO.meta,
    lineHeight: lh(TYPO.meta),
    fontWeight: '800',
    color: '#000000',
  },
  connectorBubbleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  connectorIdlePriceHero: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    marginBottom: 6,
  },
  connectorIdlePriceToggle: {
    marginTop: 8,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  connectorIdlePriceToggleText: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    fontWeight: '900',
    color: '#000000',
    textDecorationLine: 'underline',
  },
  connectorIdlePriceDetailCol: {
    marginTop: 8,
    gap: 6,
    width: '100%',
  },
  connectorIdlePriceRow: {
    fontSize: TYPO.meta,
    lineHeight: lh(TYPO.meta),
    fontWeight: '700',
    color: '#000000',
  },
  connectorAccessBubble: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  connectorSessionAccessBubbleStack: {
    gap: 8,
  },
  connectorPreparingStatusBubble: {
    gap: 10,
    alignItems: 'stretch',
  },
  connectorChargingLiveBubble: {
    gap: 10,
    alignItems: 'stretch',
  },
  connectorDisconnectSummaryBubble: {
    gap: 10,
    alignItems: 'stretch',
  },
  connectorChargingTimeValueCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  connectorChargingBreakdownList: {
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
  /** Odsadenie pod riadok mince + suma (bez ikon na podriadkoch). */
  connectorChargingPriceBreakdownIndent: {
    paddingLeft: CONNECTOR_SESSION_ICON_COL_WIDTH + 6,
  },
  connectorChargingBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
    minWidth: 0,
  },
  connectorChargingFeeMeta: {
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_SECONDARY_LINE_HEIGHT,
    fontWeight: '700',
    color: '#000000',
    flex: 1,
    minWidth: 0,
  },
  connectorPreparingDetailIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minWidth: 0,
    gap: 6,
    paddingVertical: 2,
  },
  connectorPreparingDetailPair: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 0,
  },
  /** Vertikálne ako `stationHeaderDivider` (nie tenšia 1.5 / plná čierň). */
  connectorPreparingDetailPairDivider: {
    width: KIOSK_DIVIDER_STROKE,
    alignSelf: 'stretch',
    backgroundColor: KIOSK_DIVIDER_COLOR,
    opacity: KIOSK_DIVIDER_OPACITY,
    flexShrink: 0,
  },
  connectorPreparingDetailMetricRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    width: '100%',
    minWidth: 0,
    gap: 6,
  },
  /** Rovnaká veľkosť ako jednotka; bez FitText (žiadne zmenšovanie). Stačí do ~999,9 / 999,99. */
  connectorPreparingDetailMetricValue: {
    flexGrow: 0,
    flexShrink: 0,
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'left',
    fontVariant: ['tabular-nums'],
  },
  connectorPreparingDetailMetricUnit: {
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    color: '#000000',
    flexShrink: 0,
  },
  connectorAccessHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectorAccessTitle: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    flexShrink: 1,
  },
  connectorAccessPriceHero: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_PRIMARY_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    marginTop: 4,
  },
  connectorAccessNote: {
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_SECONDARY_LINE_HEIGHT,
    fontWeight: '700',
    color: '#000000',
    marginTop: 4,
  },
  /** Odsadenie pre absolútne umiestnenú info ikonku vpravo (bublina nie je celoplošne klikateľná). */
  connectorAccessBubbleInfoInset: {
    position: 'relative',
    paddingRight: 48,
  },
  connectorAccessLinkPressable: {
    alignSelf: 'flex-start',
  },
  connectorAccessLinkText: {
    textDecorationLine: 'underline',
  },
  connectorPolicyFeeModalScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 480,
  },
  connectorPolicyFeeModalScrollContent: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 12,
  },
  connectorPolicyFeeModalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
    borderBottomWidth: 1.5,
    borderColor: '#000000',
    paddingBottom: 10,
  },
  connectorPolicyFeeModalLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    fontWeight: '700',
    color: '#000000',
  },
  connectorPolicyFeeModalValue: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    fontWeight: '900',
    color: '#000000',
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  connectorEroamingListLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
    paddingVertical: 4,
  },
  connectorEroamingListBullet: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    fontWeight: '900',
    color: '#000000',
    marginTop: 2,
  },
  connectorEroamingListItem: {
    flex: 1,
    minWidth: 0,
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    fontWeight: '700',
    color: '#000000',
  },
  connectorAccessEroamingEmpCol: {
    alignSelf: 'stretch',
    flexDirection: 'column',
    gap: 4,
    marginTop: 4,
  },
  connectorAccessEroamingLine: {
    fontSize: CONNECTOR_BUBBLE_SECONDARY_FONT_SIZE,
    lineHeight: CONNECTOR_BUBBLE_SECONDARY_LINE_HEIGHT,
    fontWeight: '700',
    color: '#000000',
  },
  connectorVehicleSessionBubble: {
    position: 'relative',
    overflow: 'visible',
  },
  connectorVehicleSessionNoRegWrap: {
    width: '100%',
    alignSelf: 'stretch',
  },
  connectorVehicleSessionNoRegText: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_SESSION_VALUE_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'left',
  },
  /** Prvý riadok (len ak je SPZ): ikona + SPZ hneď vedľa, doľava. */
  connectorVehicleSessionIconPlateRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  /** Rovnaká šírka ako pri Prístup / Vozidlo / Vodič (idle ikony 52 px). */
  connectorVehicleSessionIconColumn: {
    width: CONNECTOR_SESSION_ICON_COL_WIDTH,
    minWidth: CONNECTOR_SESSION_ICON_COL_WIDTH,
    maxWidth: CONNECTOR_SESSION_ICON_COL_WIDTH,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorVehicleSessionPlateBesideIcon: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  connectorVehicleSessionPlateTop: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_SESSION_VALUE_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'left',
    flexShrink: 1,
  },
  connectorVehicleSessionAccessValuePressableInner: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    borderRadius: 8,
    overflow: 'visible',
  },
  connectorVehicleSessionFields: {
    width: '100%',
    alignSelf: 'stretch',
    gap: 8,
    overflow: 'visible',
  },
  connectorVehicleSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  connectorVehicleSessionIconLabelStackWrap: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  /** Obal hodnoty: zvyšok šírky, FitText meria stabilne z flexu. */
  connectorVehicleSessionValueFitWrap: {
    flex: 1,
    minWidth: 0,
    overflow: 'visible',
    alignSelf: 'stretch',
    paddingRight: 2,
    paddingBottom: 2,
  },
  /** Hodnota hneď vedľa ikony, zarovnanie doľava (nie doprava). */
  connectorVehicleSessionValueFitVertCenter: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  connectorVehicleSessionStackBlock: {
    width: '100%',
    alignSelf: 'stretch',
    gap: 6,
  },
  connectorVehicleSessionValueStackWrap: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'visible',
    paddingBottom: 2,
  },
  /** Základ pre FitText na hodnote (riadok vedľa štítku). Bez flex:1 na texte — výšku určuje obal s vert. centrom. */
  connectorVehicleSessionValueFit: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_SESSION_VALUE_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'left',
    width: '100%',
    minWidth: 0,
  },
  /** Základ pre FitText na hodnote (stack / lupa). */
  connectorVehicleSessionValueFitStack: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_SESSION_VALUE_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'left',
    width: '100%',
    alignSelf: 'stretch',
  },
  /** Statický RNText pre hodnoty po prihlásení (bez FitText — žiadne opacity meranie). */
  connectorVehicleSessionValueStatic: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_SESSION_VALUE_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'left',
    width: '100%',
    minWidth: 0,
  },
  connectorVehicleSessionValueStaticStack: {
    fontSize: CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE,
    lineHeight: CONNECTOR_SESSION_VALUE_LINE_HEIGHT,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'left',
    width: '100%',
    alignSelf: 'stretch',
  },
  connectorVehicleSessionDriverEmailPressable: {
    width: '100%',
    minWidth: 0,
    alignItems: 'flex-start',
    borderRadius: 8,
  },
  connectorVehicleSessionDriverEmailPressableStack: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    borderRadius: 8,
  },
  emailRevealModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emailRevealModalCard: {
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 22,
    width: '100%',
    alignSelf: 'center',
  },
  emailRevealModalEmail: {
    fontSize: Math.round(CONNECTOR_BUBBLE_PRIMARY_FONT_SIZE * 1.05),
    lineHeight: Math.round(CONNECTOR_SESSION_VALUE_LINE_HEIGHT * 1.05),
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  sessionWaitModalCard: {
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 28,
    width: '100%',
    alignSelf: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  sessionWaitModalLoading: {
    gap: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionWaitModalText: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.25),
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  serviceSectionCardBody: {
    gap: 10,
    width: '100%',
  },
  serviceQuickPairRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
  },
  serviceQuickPairCell: {
    flex: 1,
    minWidth: 0,
  },
  serviceFieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
  },
  serviceFieldRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
  },
  serviceFieldLabelFlex: {
    color: '#000000',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '800',
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  serviceFieldKeyLabel: {
    color: '#000000',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '800',
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  serviceFieldLabel: {
    color: '#000000',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '800',
    width: 168,
    flexShrink: 0,
  },
  serviceFieldValueWrap: {
    flex: 1,
    minWidth: 0,
  },
  serviceFieldValue: {
    color: '#000000',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '700',
  },
  serviceFieldStack: {
    width: '100%',
    gap: 8,
  },
  serviceFieldInput: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '700',
    color: '#000000',
    width: '100%',
    minHeight: 52,
  },
  serviceFieldInputZoom: {
    minHeight: 72,
  },
  serviceFieldInputMultiline: {
    minHeight: 104,
    textAlignVertical: 'top',
  },
  serviceValueChip: {
    minWidth: 112,
    maxWidth: 180,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#000000',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  serviceValueChipText: {
    color: '#000000',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1),
    fontWeight: '900',
    textAlign: 'center',
  },
  serviceChipWrap: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  servicePill: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servicePillActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  servicePillInactive: {
    backgroundColor: '#ffffff',
    borderColor: '#000000',
  },
  servicePillTextActive: {
    color: '#ffffff',
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.1),
    fontWeight: '800',
  },
  servicePillTextInactive: {
    color: '#000000',
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.1),
    fontWeight: '800',
  },
  serviceJsonBox: {
    width: '100%',
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  serviceJsonText: {
    color: '#000000',
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.3),
    fontWeight: '700',
  },
  serviceProgressTrack: {
    width: '100%',
    height: 18,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  serviceProgressFill: {
    height: '100%',
    backgroundColor: '#000000',
  },
  serviceToggleChipBase: {
    width: 96,
    minWidth: 96,
    maxWidth: 96,
    minHeight: 44,
    maxHeight: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 10,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  serviceToggleChipBaseZoom: {
    width: 116,
    minWidth: 116,
    maxWidth: 116,
    minHeight: 56,
    maxHeight: 56,
  },
  serviceToggleChipOn: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  serviceToggleChipOff: {
    backgroundColor: '#ffffff',
    borderColor: '#000000',
  },
  serviceToggleChipDisabled: {
    opacity: 0.78,
  },
  serviceToggleChipTextOn: {
    color: '#ffffff',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1),
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  serviceToggleChipTextOff: {
    color: '#000000',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1),
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  serviceUrlInput: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: TYPO.body,
    fontWeight: '700',
    color: '#000000',
    width: '100%',
  },
  servicePinWrap: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 0,
    gap: 8,
  },
  servicePinTop: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  servicePinTitle: {
    color: '#000000',
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT),
    fontWeight: '900',
    textAlign: 'center',
  },
  servicePinBox: {
    width: '100%',
    minHeight: Math.round(STATION_FONT * 1.15),
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  servicePinValue: {
    color: '#000000',
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT, 1.05),
    fontWeight: '900',
    letterSpacing: 6,
  },
  servicePinError: {
    color: '#000000',
    fontSize: STATION_FONT,
    lineHeight: lh(STATION_FONT),
    fontWeight: '900',
    textAlign: 'center',
    alignSelf: 'stretch',
    borderWidth: 3,
    borderColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  serviceKeypad: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    gap: 10,
  },
  serviceKeypadRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 0,
  },
  serviceKey: {
    flex: 1,
    minHeight: 0,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  serviceKeyDelete: {
    borderWidth: 4,
    backgroundColor: '#f0f0f0',
  },
  serviceKeyText: {
    color: '#000000',
    fontSize: Math.round(STATION_FONT * 1.08),
    lineHeight: lh(Math.round(STATION_FONT * 1.08), 1),
    fontWeight: '900',
  },
  serviceKeyOk: {
    backgroundColor: '#000000',
  },
  serviceKeyOkText: {
    color: '#ffffff',
    fontSize: Math.round(STATION_FONT * 1.02),
    lineHeight: lh(Math.round(STATION_FONT * 1.02), 1),
    fontWeight: '900',
  },
  /** PIN modal mimo škálovaného KioskViewport (max šírka ako plátno). */
  servicePinTitleCompact: {
    color: '#000000',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
    textAlign: 'center',
  },
  servicePinBoxCompact: {
    width: '100%',
    minHeight: 56,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  servicePinValueCompact: {
    color: '#000000',
    fontSize: Math.round(STATION_FONT * 0.52),
    lineHeight: lh(Math.round(STATION_FONT * 0.52), 1.08),
    fontWeight: '900',
    letterSpacing: 4,
  },
  servicePinErrorCompact: {
    color: '#000000',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.2),
    fontWeight: '900',
    textAlign: 'center',
    alignSelf: 'stretch',
    borderWidth: 3,
    borderColor: '#000000',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  serviceKeyTextCompact: {
    color: '#000000',
    fontSize: Math.round(STATION_FONT * 0.62),
    lineHeight: lh(Math.round(STATION_FONT * 0.62), 1),
    fontWeight: '900',
  },
  serviceKeyOkTextCompact: {
    color: '#ffffff',
    fontSize: Math.round(STATION_FONT * 0.58),
    lineHeight: lh(Math.round(STATION_FONT * 0.58), 1),
    fontWeight: '900',
  },
  /** Pod identitou konektora — zarovnanie s `connectorPrimaryActionShell` (bez duplicitného marginTop z pôvodnej session bubliny). */
  connectorEndChargeQuickBubble: {
    marginTop: 0,
  },
  /** Ako `actionButtonStrip` / `connectorBubbleActionStrip`: absolútne vpravo, orezá sa spolu s borderRadius. */
  connectorVehicleAuthStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 34,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorVehicleAuthStripText: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  transactionPinModalOuter: {
    backgroundColor: '#ffffff',
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  transactionPinModalColumn: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: KIOSK_WIDTH,
    alignSelf: 'center',
    gap: 8,
  },
  transactionPinModalBody: {
    flex: 1,
    minHeight: 0,
  },
  overlayWrap: {
    flex: 1,
    minHeight: 0,
    gap: 8,
    paddingBottom: 10,
  },
  overlaySecondaryRow: {
    width: '100%',
  },
  overlayHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    height: 66,
    minHeight: 66,
    maxHeight: 66,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 0,
    overflow: 'hidden',
  },
  overlayHeaderZoom: {
    height: 98,
    minHeight: 98,
    maxHeight: 98,
    paddingVertical: 8,
  },
  overlayHeaderZoomTwoLine: {
    height: 147,
    minHeight: 147,
    maxHeight: 147,
    paddingVertical: 8,
  },
  overlayTitle: {
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  /** Icon + title grouped and centered as one unit (not icon far left, title centered in the rest). */
  overlayTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignSelf: 'center',
  },
  overlayTitleTextShrink: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  /** Title-only overlay row: use full width so „Detail session“ stays centered. */
  overlayTitleTextShrinkStandalone: {
    width: '100%',
  },
  overlayTitleBesideIcon: {
    textAlign: 'left',
  },
  overlayTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    width: '100%',
  },
  /** Back strip built into overlay header (same idea as station / connector bubble). */
  overlayHeaderIntegratedBack: {
    paddingHorizontal: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  overlayTitleRowIntegratedBack: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 44,
    paddingRight: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  overlayTitleRowIntegratedBackZoom: {
    paddingLeft: 50,
    paddingRight: 14,
  },
  overlayBackStripZoom: {
    width: 40,
  },
  overlayBackStripArrowZoom: {
    fontSize: TYPO.superLarge,
    lineHeight: lh(TYPO.superLarge),
  },
  overlayTitleLarge: {
    fontSize: TYPO.display * 1.22,
    lineHeight: lh(TYPO.display * 1.22),
  },
  overlayTitleIconSlot: {
    width: 28,
    minWidth: 28,
    maxWidth: 28,
    height: 28,
    minHeight: 28,
    maxHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayTitleIconSlotZoom: {
    width: 52,
    minWidth: 52,
    maxWidth: 52,
    height: 52,
    minHeight: 52,
    maxHeight: 52,
  },
  closeButton: {
    position: 'absolute',
    right: 12,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 10,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  closeText: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title, 1),
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  overlayCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    padding: 10,
    gap: 10,
  },
  overlayScrollView: {
    flex: 1,
  },
  overlayScrollContent: {
    gap: 8,
    paddingBottom: 16,
    flexGrow: 1,
  },
  overlayStack: {
    gap: 8,
  },
  overlayText: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    color: '#000000',
    fontWeight: '700',
  },
  overlayHint: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    color: '#000000',
    fontWeight: '600',
  },
  overlayHintStrong: {
    fontWeight: '800',
  },
  languageRow: {
    gap: 10,
  },
  languageButton: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingRight: 42,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  languageButtonActive: {
    backgroundColor: '#f4f4f4',
  },
  languageButtonMain: {
    minHeight: 42,
    justifyContent: 'center',
  },
  languageButtonText: {
    color: '#000000',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '800',
    textAlign: 'left',
  },
  languageButtonTextActive: {
    fontWeight: '900',
  },
  languageButtonStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 30,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageButtonStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  infoLine: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  infoLineText: {
    color: '#000000',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '700',
  },
  infoReaderWrap: {
    flex: 1,
    gap: 8,
    minHeight: 0,
  },
  /** Same shell as `overlayHeader` (Podpora, Jazyk, …) so Pomoc looks like one family. */
  infoReaderHeader: {
    flexDirection: 'row',
    alignItems: 'stretch',
    position: 'relative',
    height: 66,
    minHeight: 66,
    maxHeight: 66,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  infoReaderHeaderIntegratedBack: {
    paddingLeft: 0,
  },
  /** Taller than overlay two-line (147): Pomoc title 2× scaled + 2 lines; no vertical padding on header so back strip fills like Podpora. */
  infoReaderHeaderZoom: {
    height: 186,
    minHeight: 186,
    maxHeight: 186,
    paddingVertical: 0,
  },
  /** No overflow:hidden here — that clips the back strip to a sharp rectangle; outer `infoReaderHeader` already clips with borderRadius (same as overlay Podpora). */
  infoReaderLeftBackZone: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    position: 'relative',
  },
  infoReaderHeaderSideSlot: {
    width: 143,
    minWidth: 143,
    maxWidth: 143,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 10,
    paddingVertical: 6,
  },
  infoReaderHeaderSideSlotZoom: {
    width: 164,
    minWidth: 164,
    maxWidth: 164,
    paddingVertical: 14,
  },
  infoReaderProgressBox: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    height: 52,
    minHeight: 52,
    maxHeight: 52,
    width: 133,
    minWidth: 133,
    maxWidth: 133,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  infoReaderProgressBoxZoom: {
    width: 152,
    minWidth: 152,
    maxWidth: 152,
    height: 142,
    minHeight: 142,
    maxHeight: 142,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  infoReaderProgressText: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    color: '#000000',
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  infoReaderProgressZoomWrap: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  infoReaderProgressZoomLine: {
    width: '100%',
    textAlign: 'center',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title, 1.02),
    color: '#000000',
    fontWeight: '900',
  },
  infoReaderPagerBar: {
    minHeight: 82,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    padding: 8,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#ffffff',
  },
  infoReaderNavBlock: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    minHeight: 66,
  },
  infoReaderNavActionBlockLeft: {
    overflow: 'hidden',
    borderWidth: 3,
  },
  infoReaderNavActionBlockRight: {
    overflow: 'hidden',
    borderWidth: 3,
  },
  infoReaderNavActionBlockBottom: {
    overflow: 'hidden',
    paddingBottom: 34,
    borderWidth: 3,
  },
  infoReaderNavBlockCurrent: {
    backgroundColor: '#f7f7f7',
  },
  infoReaderNavBlockDisabled: {
    opacity: 0.45,
  },
  infoReaderNavLabel: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    color: '#000000',
    fontWeight: '900',
    textAlign: 'center',
  },
  infoReaderNavLabelDivider: {
    height: KIOSK_DIVIDER_STROKE,
    backgroundColor: KIOSK_DIVIDER_COLOR,
    opacity: KIOSK_DIVIDER_OPACITY,
  },
  infoReaderNavTopic: {
    fontSize: TYPO.small,
    lineHeight: lh(TYPO.small, 1.15),
    color: '#000000',
    fontWeight: '600',
    textAlign: 'center',
  },
  infoReaderNavActionStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 30,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoReaderNavActionStripLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 30,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoReaderNavActionStripBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 30,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoReaderNavActionStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  infoReaderNavActionStripArrowBottom: {
    color: '#ffffff',
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1),
    fontWeight: '900',
    marginBottom: 1,
  },
  infoActionPressed: {
    opacity: 0.86,
  },
  infoReaderBody: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 14,
  },
  infoReaderBodyContent: {
    padding: 12,
    paddingBottom: 18,
  },
  infoReaderScrollInner: {
    gap: 10,
  },
  infoReaderListTitle: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    color: '#000000',
    fontWeight: '900',
  },
  infoReaderListHint: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.25),
    color: '#000000',
    fontWeight: '600',
    marginBottom: 4,
  },
  infoTopicListItem: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    minHeight: 84,
    paddingVertical: 8,
    paddingHorizontal: 10,
    paddingRight: 42,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  infoTopicListItemActive: {
    backgroundColor: '#f7f7f7',
  },
  infoTopicListItemMain: {
    gap: 4,
  },
  infoTopicListItemOrder: {
    fontSize: TYPO.small,
    lineHeight: lh(TYPO.small),
    color: '#000000',
    fontWeight: '900',
  },
  infoTopicListItemTitle: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.15),
    color: '#000000',
    fontWeight: '800',
  },
  infoReaderIntro: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.3),
    color: '#000000',
    fontWeight: '600',
  },
  infoReaderCard: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  infoReaderCardImportant: {
    borderWidth: 2.2,
  },
  infoReaderCardLocate: {
    borderStyle: 'dashed',
  },
  infoReaderCardTitle: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    color: '#000000',
    fontWeight: '900',
  },
  infoReaderCardText: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.3),
    color: '#000000',
    fontWeight: '600',
  },
  infoPagerWrap: {
    flex: 1,
    gap: 14,
  },
  infoPagerCounter: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    color: '#000000',
    fontWeight: '800',
  },
  infoTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoTopicTitle: {
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    color: '#000000',
    fontWeight: '900',
    flex: 1,
  },
  infoTopicBody: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.3),
    color: '#000000',
    fontWeight: '600',
  },
  infoNavRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  infoNavCol: {
    flex: 1,
    gap: 8,
  },
  pagerButton: {
    flex: 1,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    height: 96,
    minHeight: 96,
    maxHeight: 96,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 0,
    paddingRight: 42,
    overflow: 'hidden',
  },
  pagerButtonText: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  pagerButtonStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 32,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerButtonStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  infoNavTopic: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1.25),
    color: '#000000',
    fontWeight: '600',
    textAlign: 'center',
  },
  infoNavTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: lh(TYPO.medium, 1.25) * 3 + 2,
  },
  supportWrap: {
    gap: 14,
  },
  supportIntro: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title, 1.3),
    color: '#000000',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  supportBody: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.35),
    color: '#000000',
    fontWeight: '700',
  },
  supportFootnote: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1.25),
    color: '#000000',
    opacity: 0.85,
    fontWeight: '700',
  },
  supportAppsHeading: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title, 1.3),
    color: '#000000',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  supportCards: {
    gap: 10,
  },
  supportInfoCard: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  supportInfoTitle: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    color: '#000000',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  supportInfoItem: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    color: '#000000',
    fontWeight: '600',
  },
  supportInfoItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supportRow: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  supportRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  supportRowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  supportRowTitle: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    color: '#000000',
    fontWeight: '800',
  },
  supportRowTitleStrong: {
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
  },
  supportRowSubtitle: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1.25),
    color: '#000000',
    fontWeight: '700',
    opacity: 0.8,
  },
  supportQrButton: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    minWidth: 86,
    minHeight: 48,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  supportQrButtonText: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    color: '#000000',
    fontWeight: '800',
  },
  qrWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    gap: 12,
  },
  qrWrapSimple: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  qrScanHeading: {
    width: '100%',
    maxWidth: 680,
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  qrImage: {
    width: 320,
    height: 320,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  qrImageLarge: {
    width: 420,
    height: 420,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  qrHint: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.1),
    color: '#000000',
    fontWeight: '800',
    textAlign: 'center',
  },
  qrValue: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.1),
    color: '#000000',
    fontWeight: '700',
    textAlign: 'center',
  },
  qrLinkHintBubble: {
    width: '100%',
    maxWidth: 680,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
    backgroundColor: '#ffffff',
  },
  qrLinkHintText: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '800',
    color: '#000000',
  },
  qrLinkValueText: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1.25),
    fontWeight: '700',
    color: '#000000',
    opacity: 0.8,
  },
  qrAppCards: {
    width: '100%',
    maxWidth: 680,
    gap: 10,
  },
  qrAppCardRow: {
    width: '100%',
  },
  qrPaymentMergedBubble: {
    width: '100%',
    maxWidth: 680,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: '#ffffff',
  },
  qrPaymentGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
  },
  qrPaymentChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
  },
  qrPaymentChipText: {
    flex: 1,
    minWidth: 0,
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1.25),
    fontWeight: '700',
    color: '#000000',
  },
});
