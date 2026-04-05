/**
 * Response kódy pre CMD 01 (INIT) – Modbus odpoveď 0x81 (ID 129)
 *
 * 0 = bez chyby, môže sa posielať FW
 * 1 = chyba, daný FW nie je možné poslať, nešpecifická chyba
 * 2 = prebieha nabíjanie, nie je možné aktualizovať FW
 * 3 = FW version v APP je rovnaká alebo staršia ako FW v module
 *     (len warning, ak sa chce, môže sa poslať)
 */
export enum InitResponseCode {
  /** Bez chyby – môže sa posielať FW */
  OK = 0,
  /** Chyba – daný FW nie je možné poslať (nešpecifická chyba) */
  ERROR = 1,
  /** Prebieha nabíjanie – nie je možné aktualizovať FW */
  CHARGING_IN_PROGRESS = 2,
  /** FW verzia v APP je rovnaká alebo staršia ako FW v module (len warning) */
  SAME_OR_OLDER_VERSION = 3,
}

/**
 * Po CMD 68–71 sa na zbernici používa `EVM_PAYLOAD_STATUS` z `evmCommunication/types`.
 * Nižšie enumy sú ponechané ako referencia staršieho CMD 02–04 správania (nie aktívne v hooku).
 */
export enum DataChunkResponseCode {
  OK = 0,
  ERROR = 1,
}

export enum PageCommitResponseCode {
  OK = 0,
  CRC_MISMATCH = 1,
  WRITE_FAILED = 2,
}

export enum UpdateResponseCode {
  OK = 0,
  FIRMWARE_DAMAGED = 1,
  INVALID_HEADER = 2,
  WRONG_MODULE_TYPE = 3,
}

/**
 * Voľby pre `readModuleInfo` – počas celého FW uploadu môže rodič držať
 * `isModbusPollingSuspended` a vypnúť toggle v `readModuleInfo`.
 */
export interface ReadModuleInfoOptions {
  readonly skipPollingSuspendToggle?: boolean;
}

/**
 * Hook options (predávané z route params)
 */
export interface FirmwareUpdateHookOptions {
  /** Custom firmware URL (z MQTT príkazu). Fallback na FIRMWARE_URL. */
  firmwareUrl?: string;
  /** Ak true, automaticky stiahne a spustí aktualizáciu. */
  mqttAutoStart?: boolean;
  /** Callback po dokončení celého procesu (pre MQTT reporting). */
  onFinished?: (result: {success: boolean; error?: string}) => void;
  /** ID konektora pre aktualizáciu (z MQTT príkazu). */
  connectorId?: number;
}

/**
 * Hook return type
 */
export interface FirmwareUpdateHookReturn {
  isDownloading: boolean;
  isDownloadComplete: boolean;
  fileName: string;
  fileSize: number;
  fileVersion: string;
  sendProgress: number;
  isUpdatingFW: boolean;
  isCRCOK: boolean;
  downloadFile: () => Promise<void>;
  cancelUpdate: () => void;
  sendFirmwareData: () => Promise<void>;
  statusMessage: string;
  errorMessage: string;
  /** True keď beží akákoľvek operácia (download alebo update) – zamyká UI */
  isBusy: boolean;
  /** True keď bol hook spustený cez MQTT auto-start */
  isMqttAutoStart: boolean;
  /** Názov firmvérového súboru na stiahnutie */
  firmwareFilename: string;
  /** Index vybraného konektora (0 pre Connector 1, 1 pre Connector 2) */
  selectedConnectorIndex: number;
  /** Funkcia na zmenu vybraného konektora */
  setSelectedConnectorIndex: (index: number) => void;
  /** Aktuálna verzia firmvéru v moduloch (mapované na index konektora 0/1) */
  currentFirmwareVersions: Record<number, string>;
}
