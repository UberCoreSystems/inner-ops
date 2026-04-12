import { useState, useCallback } from 'react';

const INITIAL_STATE = { isOpen: false, content: '', isLoading: false, entryCount: null };

export const useOracleModal = () => {
  const [oracleModal, setOracleModal] = useState(INITIAL_STATE);

  const openLoading = useCallback(() => {
    setOracleModal({ isOpen: true, content: '', isLoading: true, entryCount: null });
  }, []);

  // BER-197: entryCount threads the low-data calibration constraint to OracleModal regen
  const openWithContent = useCallback((content, entryCount = null) => {
    setOracleModal({ isOpen: true, content, isLoading: false, entryCount });
  }, []);

  const close = useCallback(() => {
    setOracleModal(INITIAL_STATE);
  }, []);

  return { oracleModal, openLoading, openWithContent, close };
};
