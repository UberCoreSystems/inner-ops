// Pass 2 Finding 20 remediation: hook moved from src/utils/ to src/hooks/
// to match the convention used by every other hook in the project.

import { useState, useRef } from 'react';
import logger from '../utils/logger';

export const useVoiceInput = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(
    'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
  );
  const recognitionRef = useRef(null);

  // Pass 3 New Finding 4 remediation: distinguish permission denial from
  // other failures and propagate via an explicit onError callback so the
  // calling component can show a clear toast instead of going silent.
  const startListening = (onResult, onEnd, onError) => {
    if (!isSupported) {
      if (onError) onError({ code: 'unsupported', message: 'Speech recognition is not supported in your browser.' });
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        onResult(finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      logger.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (onError) {
        const message =
          event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? 'Microphone permission required. Enable mic access in your browser settings.'
            : event.error === 'no-speech'
              ? 'No speech detected. Try again.'
              : `Speech recognition failed: ${event.error}`;
        onError({ code: event.error, message });
      }
      if (onEnd) onEnd();
    };

    recognition.onend = () => {
      setIsListening(false);
      if (onEnd) onEnd();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      // start() throws synchronously when called twice, when the page is
      // not focused, etc. Surface as a non-fatal error.
      logger.warn('Speech recognition start failed:', err?.message);
      setIsListening(false);
      if (onError) onError({ code: 'start_failed', message: err?.message || 'Could not start microphone.' });
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  return {
    isListening,
    isSupported,
    startListening,
    stopListening
  };
};
