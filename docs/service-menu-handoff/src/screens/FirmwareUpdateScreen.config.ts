export const FirmwareUpdateScreenConfig = {
  id: 'firmwareUpdate',
  title: 'Aktualizácia firmvéru EV modulu',
  sections: ['currentVersions', 'download', 'fileInfo', 'progress'],
  quickActions: ['downloadFirmware', 'startUpdate', 'stopUpdate'],
} as const;
