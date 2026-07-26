import { useState, useCallback, useRef } from 'react';

const INITIAL_STATE = {
  isOpen: false,
  content: '',
  isLoading: false,
  entryCount: null,
  metacognitiveDepth: null,
  entryText: '',
  entryModuleName: '',
  // Whether `content` came from Claude or from the local template composer.
  // null means "not Oracle output at all" — system messages such as a save
  // failure go through this modal too and must not be labeled either way.
  provenance: null,
  fallbackReason: null,
  // The call failed outright: `content` is a system message and the entry
  // carries no reading. Distinct from provenance, which describes prose that
  // does exist.
  oracleUnavailable: false,
};

export const useOracleModal = () => {
  const [oracleModal, setOracleModal] = useState(INITIAL_STATE);
  // An Oracle call can take up to 30s. If the user dismisses the loading modal
  // in that window, the call resolving must not shove the surface back in front
  // of them — the entry and its feedback are saved regardless, and the reading
  // is there when they open the entry.
  const isLoadingRef = useRef(false);
  const dismissedWhileLoadingRef = useRef(false);

  const openLoading = useCallback(() => {
    isLoadingRef.current = true;
    dismissedWhileLoadingRef.current = false;
    setOracleModal({ ...INITIAL_STATE, isOpen: true, isLoading: true });
  }, []);

  // BER-197: entryCount threads the low-data calibration constraint to OracleModal regen
  // BER-225: metacognitiveDepth passes journal depth classification through to OracleModal
  // BER-238: entryText + entryModuleName enable regen and follow-up buttons (canRegen/canFollowUp gate on !!entryText)
  //
  // Options object rather than positional args: this had already reached five
  // parameters, and callers were passing `null, null, ''` to reach the last one.
  const openWithContent = useCallback(({ content = '', ...rest } = {}) => {
    if (dismissedWhileLoadingRef.current) {
      dismissedWhileLoadingRef.current = false;
      return;
    }
    isLoadingRef.current = false;
    setOracleModal({ ...INITIAL_STATE, ...rest, isOpen: true, isLoading: false, content });
  }, []);

  const close = useCallback(() => {
    if (isLoadingRef.current) dismissedWhileLoadingRef.current = true;
    isLoadingRef.current = false;
    setOracleModal(INITIAL_STATE);
  }, []);

  return { oracleModal, openLoading, openWithContent, close };
};
