const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const logger = require('./logger');

autoUpdater.logger = logger;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Release notes of the downloaded version, kept on disk so they survive the
// restart and can be shown once the new version is actually running.
const notesFile = path.join(app.getPath('userData'), 'pending-release-notes.json');

// GitHub hands the notes over as rendered HTML, or as a list of versions when
// several releases are being skipped at once.
function toPlainText(releaseNotes) {
  const html = Array.isArray(releaseNotes)
    ? releaseNotes.map((r) => `<h3>${r.version}</h3>${r.note || ''}`).join('')
    : releaseNotes || '';

  return html
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h\d|ul|ol|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function savePendingNotes(version, notes) {
  try {
    fs.writeFileSync(notesFile, JSON.stringify({ version, notes }));
  } catch (error) {
    logger.error('Failed to save release notes', { error: error.message });
  }
}

// Returns the notes once, only if they belong to the version now running.
function consumeReleaseNotes() {
  try {
    if (!fs.existsSync(notesFile)) return null;
    const pending = JSON.parse(fs.readFileSync(notesFile, 'utf8'));
    fs.unlinkSync(notesFile);
    if (pending.version !== app.getVersion() || !pending.notes) return null;
    return pending;
  } catch (error) {
    logger.error('Failed to read release notes', { error: error.message });
    return null;
  }
}

function initUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.on('update-available', (info) =>
    logger.info('Update available', { version: info.version }),
  );
  autoUpdater.on('update-not-available', () => logger.info('No updates available'));
  autoUpdater.on('error', (error) => logger.error('Update failed', { error: error.message }));

  autoUpdater.on('update-downloaded', async (info) => {
    logger.info('Update downloaded', { version: info.version });
    savePendingNotes(info.version, toPlainText(info.releaseNotes));

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

module.exports = { initUpdater, consumeReleaseNotes };
