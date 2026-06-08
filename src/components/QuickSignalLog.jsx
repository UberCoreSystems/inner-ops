import { useState } from 'react';
import VoiceInputButton from './VoiceInputButton';
import { writeData } from '../utils/firebaseUtils';
import { buildQuickSignalEntry } from '../utils/buildQuickSignalEntry';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

// QuickSignalLog — in-the-moment voice capture for The Signal. Tap, speak (or
// type), confirm. Writes a minimal precursor-only relapseEntries doc so a user
// can log the instant a craving/precursor hits without the full 5-step wizard.
// The wizard remains the only path for a confirmed relapse (see
// buildQuickSignalEntry). On success it calls onLogged so the parent can
// refresh the radar's pattern data.
export default function QuickSignalLog({ onLogged }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setText('');
    setOpen(false);
  };

  const handleLog = async () => {
    const entry = buildQuickSignalEntry(text, new Date().toISOString());
    if (!entry) {
      ouraToast.error('Say or write something to log.');
      return;
    }
    setSaving(true);
    try {
      await writeData('relapseEntries', entry);
      ouraToast.success('Signal logged');
      reset();
      if (onLogged) onLogged();
    } catch (error) {
      logger.error('Quick signal log failed:', { code: error?.code, name: error?.name });
      ouraToast.error('Could not log the signal. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-[#00d4aa] border border-[#00d4aa]/30 hover:border-[#00d4aa]/60 rounded-xl px-4 py-2 min-h-11 transition-colors"
      >
        ⚡ Quick log
      </button>
    );
  }

  return (
    <div className="oura-card p-4 border border-[#00d4aa]/20 w-full sm:w-96">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[#858585] text-[10px] uppercase tracking-widest">Quick signal — precursor only</p>
        <button
          type="button"
          onClick={reset}
          className="text-[#858585] hover:text-white text-xs min-h-8"
        >
          Cancel
        </button>
      </div>
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What did you notice? Speak or type the condition stacking up…"
          className="w-full h-24 p-3 pr-12 bg-oura-card text-white rounded-2xl border border-oura-border focus:border-oura-cyan focus:outline-none resize-none transition-colors text-sm"
        />
        <div className="absolute right-2 top-2">
          <VoiceInputButton
            onTranscript={(t) => setText((prev) => prev + (prev ? ' ' : '') + t)}
            disabled={saving}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={handleLog}
        disabled={saving || !text.trim()}
        className="mt-3 w-full bg-[#00d4aa] text-black font-medium rounded-2xl py-2.5 min-h-11 disabled:opacity-20 hover:bg-[#00e6b8] transition-colors text-sm"
      >
        {saving ? 'Logging…' : 'Log signal'}
      </button>
    </div>
  );
}
