const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const logger = require('./logger');

autoUpdater.logger = logger;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function initUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.on('update-available', (info) =>
    logger.info('Update available', { version: info.version }),
  );
  autoUpdater.on('update-not-available', () => logger.info('No updates available'));
  autoUpdater.on('error', (error) => logger.error('Update failed', { error: error.message }));

  autoUpdater.on('update-downloaded', async (info) => {
    logger.info('Update downloaded', { version: info.version });

    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Перезапустити зараз', 'Пізніше'],
      defaultId: 0,
      cancelId: 1,
      title: 'Доступне оновлення',
      message: `Версія ${info.version} завантажена.`,
      detail: 'Перезапустіть застосунок, щоб встановити оновлення.',
    });

    if (response === 0) {
      setImmediate(() => autoUpdater.quitAndInstall());
    }
  });

  autoUpdater
    .checkForUpdates()
    .catch((error) => logger.error('Update check failed', { error: error.message }));
}

module.exports = { initUpdater };
