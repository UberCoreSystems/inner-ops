import { useVoiceInput } from '../hooks/useVoiceInput';
import ouraToast from '../utils/toast';

const VoiceInputButton = ({ onTranscript, disabled = false }) => {
  const { isListening, isSupported, startListening, stopListening } = useVoiceInput();

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      // Pass 3 New Finding 4 remediation: surface mic permission failures
      // to the user via a toast instead of failing silently.
      startListening(
        (transcript) => onTranscript(transcript),
        undefined,
        (err) => ouraToast.error(err?.message || 'Voice input unavailable.')
      );
    }
  };

  if (!isSupported) {
    return null; // Hide button if not supported
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={isListening ? 'Stop recording' : 'Start voice input'}
      className={`p-2.5 rounded-xl border transition-colors ${
        isListening
          ? 'bg-[#ef4444]/15 border-[#ef4444]/40 text-[#ef4444] animate-pulse'
          : 'bg-[#0a0a0a] border-[#1a1a1a] text-[#858585] hover:text-[#ababab] hover:border-[#2a2a2a]'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
      title={isListening ? 'Stop recording' : 'Start voice input'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" opacity="0.7" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
    </button>
  );
};

export default VoiceInputButton;
