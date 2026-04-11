import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '../firebase';
import {
  isOuraConnected,
  getTodaysBiometrics,
  getHrvBaseline,
  initiateOuraOAuth,
} from '../utils/ouraService';
import logger from '../utils/logger';

const HRV_ALERT_RATIO = 0.85;   // alert when HRV < 85% of 7-day baseline
const READINESS_THRESHOLD = 60; // alert when readiness score < 60

export function useOuraData() {
  const [connected, setConnected] = useState(false);
  const [biometrics, setBiometrics] = useState(null);
  const [hrvBaseline, setHrvBaseline] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let authUnsub = null;

    const setup = async () => {
      const auth = await getAuth();
      authUnsub = onAuthStateChanged(auth, async (user) => {
        if (cancelled) return;

        if (!user) {
          setConnected(false);
          setBiometrics(null);
          setHrvBaseline(null);
          setLoading(false);
          return;
        }

        try {
          const conn = await isOuraConnected(user.uid);
          if (cancelled) return;
          setConnected(conn);

          if (conn) {
            const [bio, baseline] = await Promise.all([
              getTodaysBiometrics(user.uid),
              getHrvBaseline(user.uid),
            ]);
            if (cancelled) return;
            setBiometrics(bio);
            setHrvBaseline(baseline);
          }
        } catch (err) {
          logger.warn('useOuraData: failed to load biometrics:', err);
        } finally {
          if (!cancelled) setLoading(false);
        }
      });
    };

    setup();
    return () => {
      cancelled = true;
      if (authUnsub) authUnsub();
    };
  }, []);

  const isHrvAlert =
    biometrics?.hrv != null &&
    hrvBaseline != null &&
    biometrics.hrv < hrvBaseline * HRV_ALERT_RATIO;

  const isReadinessAlert =
    biometrics?.readinessScore != null &&
    biometrics.readinessScore < READINESS_THRESHOLD;

  const isPhysiologicalAlert = isHrvAlert || isReadinessAlert;

  return {
    connected,
    biometrics,
    hrvBaseline,
    loading,
    isPhysiologicalAlert,
    isHrvAlert,
    isReadinessAlert,
    connectOura: initiateOuraOAuth,
  };
}
