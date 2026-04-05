export interface ServiceMenuApi {
  openHelpdeskChat(url: string): Promise<void>;
  saveGeneral(data: unknown): Promise<void>;
  saveIntegrations(data: unknown): Promise<void>;
  connectOcpp(): Promise<void>;
  disconnectOcpp(): Promise<void>;
  connectModbus(): Promise<void>;
  disconnectModbus(): Promise<void>;
  connectMqtt(): Promise<void>;
  disconnectMqtt(): Promise<void>;
  downloadFirmware(url: string): Promise<void>;
  startFirmwareUpdate(params: { connectorId?: number }): Promise<void>;
  stopFirmwareUpdate(): Promise<void>;
  readConnectorsConfig(): Promise<void>;
}
