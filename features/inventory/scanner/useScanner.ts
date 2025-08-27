// features/inventory/scanner/useScanner.ts
import { useCameraPermissions } from "expo-camera";
import { useCallback, useRef } from "react";

export function useScanner(throttleMs = 800) {
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanRef = useRef<number>(0);

  const ensurePermission = useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      return res.granted === true;
    }
    return true;
  }, [permission?.granted, requestPermission]);

  const canHandle = useCallback(() => {
    const now = Date.now();
    if (now - lastScanRef.current < throttleMs) return false;
    lastScanRef.current = now;
    return true;
  }, [throttleMs]);

  return {
    hasPermission: permission?.granted === true,
    ensurePermission,
    canHandle,
  };
}
