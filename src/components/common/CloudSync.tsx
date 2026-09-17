import useCloudSync from '@/hooks/useCloudSync';

/** Mounts the cloud sync hook where the toasts live: inside NotificationProvider. */
function CloudSync() {
  useCloudSync();
  return null;
}

export default CloudSync;
