import { FORM_NAME, FORM_VERSION, type CaptureMetaInput } from '@mgms/shared';

/**
 * Auto-captured provenance, per page 1 of the form specification: the form
 * name and version, who was signed in and when, the device, a unique instance
 * id, and the start and end time of this particular record.
 *
 * The server stamps received time and submitting IP itself, so those two
 * cannot be forged by a device.
 */
export function buildCapture(options: {
  username: string;
  deviceId: string;
  loginTime: string;
  startedAt: number;
}): CaptureMetaInput {
  return {
    formName: FORM_NAME,
    formVersion: FORM_VERSION,
    username: options.username,
    loginTime: new Date(options.loginTime),
    deviceId: options.deviceId,
    instanceId: crypto.randomUUID(),
    recordStartTime: new Date(options.startedAt),
    recordEndTime: new Date(),
  };
}

/** Serialisable form of the same metadata, for the IndexedDB outbox. */
export function serialiseCapture(capture: CaptureMetaInput) {
  return {
    ...capture,
    loginTime: capture.loginTime.toISOString(),
    recordStartTime: capture.recordStartTime.toISOString(),
    recordEndTime: capture.recordEndTime.toISOString(),
  };
}

/**
 * Best-effort GPS. A camp under a canopy may never get a fix; that is fine.
 *
 * The result is raced against a wall-clock deadline and never rejects. The
 * Geolocation API's own `timeout` only starts once permission is decided, so a
 * prompt the user never answers leaves `getCurrentPosition` pending forever —
 * which would hang the save and silently lose the record. Location is
 * best-effort metadata and must never gate a clinical record.
 */
export function currentPosition(timeoutMs = 6000): Promise<{ latitude: number; longitude: number; accuracyM: number } | null> {
  if (!navigator.geolocation) return Promise.resolve(null);

  const fix = new Promise<{ latitude: number; longitude: number; accuracyM: number } | null>((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: position.coords.accuracy,
          }),
        () => resolve(null),
        { timeout: timeoutMs, maximumAge: 60_000, enableHighAccuracy: false },
      );
    } catch {
      resolve(null);
    }
  });

  const deadline = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });

  return Promise.race([fix, deadline]);
}
