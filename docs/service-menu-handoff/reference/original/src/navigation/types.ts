import {SCREENS} from './constants';
import {
  Connector,
  Parking,
  Station,
  Location,
} from '../screens/Connectors/types';
import type {PortableChargerConfig} from '../screens/PortableChargerConfig/types';
import {Vehicle} from '../screens/VehicleDetail/types';
import type {HistoryRow} from '../screens/History/types';
import {DynamicViewRouteParams} from '../screens/DynamicView/types';

type MetaVendorNav = {
  config?: PortableChargerConfig;
  macAddress?: string;
  [key: string]: unknown;
};

export type RootStackParamList = {
  [SCREENS.LOGIN]: undefined;
  [SCREENS.HOME]: undefined;
  [SCREENS.HOME_MOBILE]: undefined;
  [SCREENS.SETTINGS]: undefined;
  [SCREENS.SETTINGS_MOBILE]: undefined;
  [SCREENS.MAP]: {
    connectors: Connector[];
    stations?: Station[];
    parkings?: Parking[];
    locations?: Location[];
  };
  [SCREENS.VEHICLE_MAP]: {lat: number; lng: number; title?: string};
  [SCREENS.BROWSER]: {webAddress: string} | undefined;
  [SCREENS.PAY_CHARGE]: {connectorId: number; isCarConnected: boolean};
  [SCREENS.PAY_CHARGE_MOBILE]: {
    connectorId: string;
    isCarConnected: boolean;
    ocppNumber: number;
  };
  [SCREENS.CHARGING]: {
    connectorId: number;
    authPin?: string;
    shouldResetValues?: boolean;
    creditEnded?: boolean;
    showSummary?: boolean;
    initiateRefund?: boolean;
  };
  [SCREENS.CHARGING_MOBILE]: {connectorId: string; ocppNumber: number};
  [SCREENS.AUTHORIZATION]: {
    connectorId: number;
    mode?: 'charge' | 'refund';
    remainingCents?: number;
    costCents?: number;
    initialCents?: number;
    fromSummary?: boolean;
  };
  [SCREENS.SUPPORT]: undefined;
  [SCREENS.TEST]: undefined;
  [SCREENS.REFUND]: {
    remainingCents: number;
    connectorId: number;
    fromSummary?: boolean;
    costCents?: number;
    initialCents?: number;
  };
  [SCREENS.THANK_YOU]: {
    message?: string;
    remainingCents?: number;
    connectorId: number;
    fromSummary?: boolean;
  };
  [SCREENS.STATIONS]: undefined;
  [SCREENS.CONNECTORS]: {stationSn?: string} | undefined;
  [SCREENS.PARAMETERS]: undefined;
  [SCREENS.CHARGING_PAPER]: undefined;
  [SCREENS.HISTORY]: undefined;
  [SCREENS.HISTORY_DETAIL]: {historyRow: HistoryRow};
  [SCREENS.WALLET_DETAIL]: {topUpResult?: 'success' | 'cancel'} | undefined;
  [SCREENS.TOP_UP]: undefined;
  [SCREENS.INVOICE_SETTINGS]: undefined;
  [SCREENS.WALLET_TOPUP_WEBVIEW]: {
    redirectUrl: string;
    returnUrl: string;
    cancelUrl: string;
  };
  [SCREENS.OAUTH_WEBVIEW]: {
    authorizationUri: string;
    emailHint?: string;
    staySignedIn: boolean;
    userAgent?: string;
    title?: string;
  };
  [SCREENS.REGISTER_USER]: undefined;
  [SCREENS.FORGOT_PASSWORD]: undefined;
  [SCREENS.PORTABLE_CHARGER]: {metaVendor: MetaVendorNav; stationId?: string};
  [SCREENS.VEHICLE_DETAIL]: {vehicleId: string; initialVehicle?: Vehicle};
  [SCREENS.VEHICLE_TRIPS]: {vehicleId: string};
  /** ⬇︎ NOVÉ: generický dynamický view */
  [SCREENS.DYNAMIC_VIEW]: DynamicViewRouteParams;
  /** ⬇︎ NOVÉ: TripMapChart - mapa s trasou a grafom rýchlosti */
  [SCREENS.TRIP_MAP_CHART]: {
    thingId: string;
    localTimeDtStart: string;
    localTimeDtEnd: string;
    additionalFields?: string[];
    vehicleName?: string;
    licensePlate?: string;
    title?: string;
  };
  /** ⬇︎ NOVÉ: LineChart - čiarový graf s dátami z InfluxDB */
  [SCREENS.LINE_CHART]: {
    thingId: string;
    localTimeDtStart: string;
    localTimeDtEnd: string;
    vehicleName?: string;
    licensePlate?: string;
    /** Počiatočné polia pre graf (default: ['speed']) */
    initialFieldKeys?: string[];
    /** Measurement pre InfluxDB (default: 'OBD') */
    measurement?: string;
  };
  /** ⬇︎ NOVÉ: CreateEditRecord - vytvorenie alebo editovanie záznamu v tabuľke */
  [SCREENS.CREATE_EDIT_RECORD]: {
    /** Plný názov view (napr. agevolt_fe_admin_view.devices_vehicles_list_data_fe) */
    viewFullName: string;
    /** Prekladový kľúč pre nadpis */
    titleKey?: string;
    /** Tabuľka do ktorej sa bude vkladať/upravovať (napr. vehicle) */
    table: string;
    /** Schema tabuľky (napr. agevolt) */
    schemaTable: string;
    /** ID záznamu pre editovanie (nepovinné - ak nie je zadané, ide o vytvorenie) */
    recordId?: string;
    /** Dáta záznamu pre editovanie (nepovinné - ak nie je zadané, načítajú sa z backendu) */
    recordData?: Record<string, unknown>;
  };
  [SCREENS.FIRMWARE_UPDATE]:
    | {
        firmwareUrl?: string;
        mqttAutoStart?: boolean;
        connectorId?: number;
      }
    | undefined;
  /** EV Module Config - čítanie konfigurácie EV modulu cez CMD 72 (EVM_FW_HW_INFO) */
  [SCREENS.CONNECTORS_CONFIG]: undefined;
  /** QR kód a možnosti platby pre štart nabíjania z mobilu (URL z Redux SN) */
  [SCREENS.MOBILE_STATION_QR]: undefined;
};

export type ScreenConfig = {
  name: keyof RootStackParamList;
  component: React.ComponentType<any>;
};

export type ListItemLeftProps = {
  color: string;
  style: import('react-native').StyleProp<import('react-native').TextStyle>;
};
export type RouteName = keyof RootStackParamList;
