import { useEffect, useState } from 'react';
import Modal from './Modal';
import type { ReleaseNotes } from '../../types';

/**
 * Shown once after an update, with the notes of the release that was installed.
 */
function WhatsNewModal() {
  const [release, setRelease] = useState<ReleaseNotes | null>(null);

  useEffect(() => {
    void window.electron.getReleaseNotes().then(setRelease);
  }, []);

  if (!release) return null;

  return (
    <Modal isOpen onClose={() => setRelease(null)} title={`Що нового у версії ${release.version}`}>
      <p className="whitespace-pre-wrap text-gray-700 leading-relaxed">{release.notes}</p>
    </Modal>
  );
}

export default WhatsNewModal;
