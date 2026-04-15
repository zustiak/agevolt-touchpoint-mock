import type {ConnectorsConfigData} from './types';

/**
 * Veľkosti jednotlivých polí v odpovedi CMD 72 (EVM_FW_HW_INFO, 0x48) v bajtoch.
 * Poradie zodpovedá poradiu polí v odpovedi.
 */
const FIELD_SIZES = {
  serialNumber: 7, // string
  hardwareAddress: 2, // UINT16
  hardwareType: 16, // string
  firmwareVersion: 6, // string
  modulType: 2, // UINT16
  orderNumber: 10, // string
  vendor: 10, // string
  hardwareVersion: 5, // string
  tfwVersion: 6, // string
  maxAmpsLimit: 1, // UINT8
  minAmpsLimit: 1, // UINT8
  lightIntensity: 1, // UINT8
  simulateEnergyMeter: 1, // UINT8
  permanentLock: 1, // UINT8
  freeMode: 1, // UINT8
  ledMode: 1, // UINT8
  sampleInterval: 1, // UINT8
  residualUsed: 1, // UINT8
  kwhPerImpulse: 2, // UINT16
} as const;

/** Polia CMD 72 / legacy CMD 5 v poradí až po tfwVersion (bez tailu). */
const EVM_FW_HW_INFO_FIELDS_THROUGH_TFW = [
  'serialNumber',
  'hardwareAddress',
  'hardwareType',
  'firmwareVersion',
  'modulType',
  'orderNumber',
  'vendor',
  'hardwareVersion',
  'tfwVersion',
] as const satisfies ReadonlyArray<keyof typeof FIELD_SIZES>;

/**
 * Dĺžka dátovej časti po prípadnom PayloadStatus (bajty až po tfwVersion).
 * Z logu: celý Modbus payload = 65 B = 1× PayloadStatus + 64 B dát (bez tailu).
 */
const EVM_FW_HW_INFO_DATA_THROUGH_TFW_BYTES =
  EVM_FW_HW_INFO_FIELDS_THROUGH_TFW.reduce(
    (sum, key) => sum + FIELD_SIZES[key],
    0,
  );

/**
 * Celková veľkosť payload dát odpovede (všetky polia vrátane tailu) = 75 bytov.
 */
export const EVM_FW_HW_INFO_PAYLOAD_SIZE = Object.values(FIELD_SIZES).reduce(
  (sum, size) => sum + size,
  0,
);

/** Dĺžky raw payloadu: voliteľný 1 B PayloadStatus (ako pri ostatných EVM FC 0x41). */
const EVM_FW_HW_INFO_RAW_PAYLOAD_LENGTH = {
  WITH_STATUS_THROUGH_TFW: EVM_FW_HW_INFO_DATA_THROUGH_TFW_BYTES + 1,
  WITH_STATUS_FULL: EVM_FW_HW_INFO_PAYLOAD_SIZE + 1,
} as const;

const DEFAULT_TAIL_U8 = 0;

/**
 * Odstráni prvý bajt PayloadStatus, ak dĺžka zodpovedá formátu CMD 72 z Excel/EVM.
 */
const withoutLeadingPayloadStatus = (payload: number[]): number[] => {
  if (
    payload.length === EVM_FW_HW_INFO_RAW_PAYLOAD_LENGTH.WITH_STATUS_THROUGH_TFW ||
    payload.length === EVM_FW_HW_INFO_RAW_PAYLOAD_LENGTH.WITH_STATUS_FULL
  ) {
    return payload.slice(1);
  }
  return payload;
};

const readTailU8 = (data: number[], index: number): number =>
  data[index] ?? DEFAULT_TAIL_U8;

const readTailUint16LE = (data: number[], index: number): number => {
  const lo = data[index];
  const hi = data[index + 1];
  if (lo === undefined || hi === undefined) {
    return 0;
  }
  return (hi << 8) | lo;
};

/**
 * Extrahuje string z byte poľa a odstráni null terminátory.
 *
 * @param data - Pole bajtov
 * @param offset - Počiatočný index
 * @param length - Dĺžka reťazca v bajtoch
 * @returns Vyčistený string
 */
const extractString = (
  data: number[],
  offset: number,
  length: number,
): string => {
  const bytes = data.slice(offset, offset + length);
  return String.fromCharCode(...bytes)
    .replace(/\0/g, '')
    .trim();
};

/**
 * Extrahuje UINT16 hodnotu z byte poľa (little-endian).
 *
 * @param data - Pole bajtov
 * @param offset - Počiatočný index
 * @returns Číselná UINT16 hodnota
 */
const extractUint16 = (data: number[], offset: number): number => {
  return (data[offset + 1] << 8) | data[offset];
};

/**
 * Parsuje payload odpovede CMD 72 (EVM_FW_HW_INFO) na ConnectorsConfigData.
 *
 * Formát zbernice: `[Addr][0x41][CMD+0x80][PayloadLen][Payload…]`.
 * CMD 72 často posiela `PayloadLen === 65`: prvý bajt payloadu je PayloadStatus (0 = OK),
 * potom 64 B polí až po tfwVersion; tail (maxAmps… kWh/imp) modul nemusí poslať.
 * Legacy CMD 5 mohol posielať 75 B dát bez tohto bajtu – ten stále podporujeme.
 *
 * @param payload - Bajty za PayloadLen (vrátane prípadného PayloadStatus)
 * @returns Rozparsované konfiguračné dáta modulu
 */
export const parseEvmFwHwInfoResponse = (
  payload: number[],
): ConnectorsConfigData => {
  const data = withoutLeadingPayloadStatus(payload);
  let offset = 0;

  const serialNumber = extractString(data, offset, FIELD_SIZES.serialNumber);
  offset += FIELD_SIZES.serialNumber;

  const hardwareAddress = extractUint16(data, offset);
  offset += FIELD_SIZES.hardwareAddress;

  const hardwareType = extractString(data, offset, FIELD_SIZES.hardwareType);
  offset += FIELD_SIZES.hardwareType;

  const firmwareVersion = extractString(
    data,
    offset,
    FIELD_SIZES.firmwareVersion,
  );
  offset += FIELD_SIZES.firmwareVersion;

  const modulType = extractUint16(data, offset);
  offset += FIELD_SIZES.modulType;

  const orderNumber = extractString(data, offset, FIELD_SIZES.orderNumber);
  offset += FIELD_SIZES.orderNumber;

  const vendor = extractString(data, offset, FIELD_SIZES.vendor);
  offset += FIELD_SIZES.vendor;

  const hardwareVersion = extractString(
    data,
    offset,
    FIELD_SIZES.hardwareVersion,
  );
  offset += FIELD_SIZES.hardwareVersion;

  const tfwVersion = extractString(data, offset, FIELD_SIZES.tfwVersion);
  offset += FIELD_SIZES.tfwVersion;

  const maxAmpsLimit = readTailU8(data, offset);
  offset += FIELD_SIZES.maxAmpsLimit;

  const minAmpsLimit = readTailU8(data, offset);
  offset += FIELD_SIZES.minAmpsLimit;

  const lightIntensity = readTailU8(data, offset);
  offset += FIELD_SIZES.lightIntensity;

  const simulateEnergyMeter = readTailU8(data, offset);
  offset += FIELD_SIZES.simulateEnergyMeter;

  const permanentLock = readTailU8(data, offset);
  offset += FIELD_SIZES.permanentLock;

  const freeMode = readTailU8(data, offset);
  offset += FIELD_SIZES.freeMode;

  const ledMode = readTailU8(data, offset);
  offset += FIELD_SIZES.ledMode;

  const sampleInterval = readTailU8(data, offset);
  offset += FIELD_SIZES.sampleInterval;

  const residualUsed = readTailU8(data, offset);
  offset += FIELD_SIZES.residualUsed;

  const kwhPerImpulse = readTailUint16LE(data, offset);

  return {
    serialNumber,
    hardwareAddress,
    hardwareType,
    firmwareVersion,
    modulType,
    orderNumber,
    vendor,
    hardwareVersion,
    tfwVersion,
    maxAmpsLimit,
    minAmpsLimit,
    lightIntensity,
    simulateEnergyMeter,
    permanentLock,
    freeMode,
    ledMode,
    sampleInterval,
    residualUsed,
    kwhPerImpulse,
  };
};

/**
 * Formátuje hardvérovú adresu EV modulu ako 16-bit hex (s prefixom 0x).
 *
 * @param address - Hardvérová adresa (UINT16)
 * @returns Napr. "0x0002", "0x00AB"
 */
export const formatHardwareAddress = (address: number): string => {
  const hex = address.toString(16).toUpperCase().padStart(4, '0');
  return `0x${hex}`;
};

/**
 * Formátuje fwVersion z EVM init (16b) na čitateľný reťazec.
 * Konvencia: high byte = major, low byte = minor (napr. 0x0503 → "5.3").
 *
 * @param version - 16-bitová hodnota fwVersion z EVM init odpovede
 * @returns Formátovaný reťazec alebo prázdny ak version === 0
 */
export const formatFwVersionFromRedux = (version: number): string => {
  if (!version) return '';
  const major = (version >> 8) & 0xff;
  const minor = version & 0xff;
  return `${major}.${minor}`;
};
