export enum SCREENS {
  LOGIN = 'Login',
  REGISTER_USER = 'RegisterUser',
  HOME = 'Home',
  HOME_MOBILE = 'HomeMobile',
  SETTINGS = 'Settings',
  SETTINGS_MOBILE = 'SettingsMobile',
  MAP = 'Map',
  VEHICLE_MAP = 'VehicleMap',
  BROWSER = 'Browser',
  PAY_CHARGE = 'PayCharge',
  PAY_CHARGE_MOBILE = 'PayChargeMobile',
  CHARGING = 'Charging',
  CHARGING_MOBILE = 'ChargingMobile',
  AUTHORIZATION = 'Authorization',
  SUPPORT = 'Support',
  TEST = 'Test',
  REFUND = 'Refund',
  THANK_YOU = 'ThankYou',
  STATIONS = 'Stations',
  CONNECTORS = 'Connectors',
  PARAMETERS = 'Parameters',
  CHARGING_PAPER = 'ChargingPaper',
  HISTORY = 'History',
  HISTORY_DETAIL = 'HistoryDetail',
  WALLET_DETAIL = 'WalletDetail',
  TOP_UP = 'TopUp',
  INVOICE_SETTINGS = 'InvoiceSettings',
  WALLET_TOPUP_WEBVIEW = 'WalletTopUpWebView',
  OAUTH_WEBVIEW = 'OauthWebView',
  FORGOT_PASSWORD = 'ForgotPassword',
  PORTABLE_CHARGER = 'PortableCharger',
  VEHICLE_DETAIL = 'VehicleDetail',
  VEHICLE_TRIPS = 'VehicleTrips',
  /** ⬇︎ NOVÉ: generický dynamický view screen */
  DYNAMIC_VIEW = 'DynamicView',
  /** ⬇︎ NOVÉ: TripMapChart - mapa s trasou a grafom rýchlosti */
  TRIP_MAP_CHART = 'TripMapChart',
  /** ⬇︎ NOVÉ: LineChart - čiarový graf s dátami z InfluxDB */
  LINE_CHART = 'LineChart',
  /** ⬇︎ NOVÉ: CreateEditRecord - vytvorenie alebo editovanie záznamu v tabuľke */
  CREATE_EDIT_RECORD = 'CreateEditRecord',
  /** Firmware Update screen pre TOUCHPOINT_CLIENT */
  FIRMWARE_UPDATE = 'FirmwareUpdate',
  /** ConnectorsConfig – konfigurácia konektorov (CMD 72 EVM_FW_HW_INFO, RS-485, elektromer) */
  CONNECTORS_CONFIG = 'ConnectorsConfig',
  /** QR a platobné možnosti pre nabíjanie cez mobil (deep link podľa SN stanice) */
  MOBILE_STATION_QR = 'MobileStationQr',
}

export const vehiclesListViewFullName =
  'agevolt_fe_admin_view.devices_vehicles_list_data_fe';
export const vehicleTripsViewFullName =
  'agevolt_fe_admin_view.devices_vehicles_final_trip_data_fe';

export const vehiclesListViewId = '709262d4-bb1c-11f0-863b-06d9b4024973';
export const vehicleTripsViewId = 'f4074d5e-bb23-11f0-863b-06d9b4024973';
