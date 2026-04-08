import { useState, useCallback } from 'react';

const INITIAL_STATE = { isOpen: false, content: '', isLoading: false };

export const useOracleModal = () => {
  const [oracleModal, setOracleModal] = useState(INITIAL_STATE);

  const openLoading = useCallback(() => {
    setOracleModal({ isOpen: true, content: '', isLoading: true });
  }, []);

  const openWithContent = useCallback((content) => {
    setOracleModal({ isOpen: true, content, isLoading: false });
  }, []);

  const close = useCallback(() => {
    setOracleModal(INITIAL_STATE);
  }, []);

  return { oracleModal, openLoading, openWithContent, close };
};
