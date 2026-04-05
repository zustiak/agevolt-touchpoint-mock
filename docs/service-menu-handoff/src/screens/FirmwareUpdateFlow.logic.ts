/**
 * Simplified firmware update flow extracted from useFirmwareUpdate.ts.
 */
export type FirmwareUpdateStage =
  | 'idle'
  | 'downloading'
  | 'crc_check'
  | 'init_session'
  | 'sending_blocks'
  | 'apply'
  | 'done'
  | 'error';

export interface FirmwareUpdatePlan {
  firmwareUrl: string;
  connectorCount: number;
  connectorId?: number;
  mqttAutoStart?: boolean;
}

export const firmwareUpdateAlgorithm = [
  'ensure modbus initialized',
  'download tfw file',
  'read file as bytes',
  'verify full file CRC + header CRC',
  'read current firmware versions per connector',
  'suspend modbus polling',
  'start FW session (legacy CMD 01 or new CMD 65)',
  'send blocks/chunks over RS-485',
  'apply firmware',
  'resume polling',
  'report result',
] as const;
