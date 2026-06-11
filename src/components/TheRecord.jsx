import { useEffect, useState } from 'react';
import {
  readMemoryDocs,
  editMemoryContent,
  deleteMemoryReceipt,
  wipeMemory,
} from '../utils/updateMemory';
import { MEMORY_DOC_IDS, MEMORY_MODULE_LABELS } from '../utils/memoryConstants';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

function formatDate(value) {
  try {
    if (!value) return '';
    const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * "The Record" — the mirror's notebook. Shows the global through-line and each
 * module memory: the user's accumulated themes and their own dated receipts.
 * Editable (themes), receipt-deletable, wipeable. All mutations route through
 * server-only callables; the client never writes memory docs directly.
 */
export default function TheRecord() {
  const [docs, setDocs] = useState(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(null); // module id being edited
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);

  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState('');

  const load = async (useCache = true) => {
    setLoading(true);
    try {
      const data = await readMemoryDocs({ useCache });
      setDocs(data);
    } catch (err) {
      logger.warn('TheRecord load failed', { err: err?.message });
      setDocs({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(true); }, []);

  const hasAny = docs && MEMORY_DOC_IDS.some((id) => {
    const d = docs[id];
    return d && (d.content || (d.receipts || []).length);
  });

  const startEdit = (id, content) => { setEditing(id); setEditValue(content || ''); };
  const cancelEdit = () => { setEditing(null); setEditValue(''); };

  const saveEdit = async (id) => {
    setBusy(true);
    try {
      await editMemoryContent(id, editValue);
      await load(false);
      cancelEdit();
      ouraToast.success('Record updated. The mirror argues from your edit now.');
    } catch (err) {
      logger.warn('editMemory failed', { err: err?.message });
      ouraToast.error('Could not update the record');
    } finally {
      setBusy(false);
    }
  };

  const removeReceipt = async (id, quote) => {
    setBusy(true);
    try {
      await deleteMemoryReceipt(id, quote);
      await load(false);
    } catch (err) {
      logger.warn('deleteMemoryReceipt failed', { err: err?.message });
      ouraToast.error('Could not remove that receipt');
    } finally {
      setBusy(false);
    }
  };

  const doWipe = async () => {
    setBusy(true);
    try {
      await wipeMemory('all');
      await load(false);
      setWipeOpen(false);
      setWipeConfirm('');
      ouraToast.success('Record wiped. The mirror starts blind.');
    } catch (err) {
      logger.warn('wipeMemory failed', { err: err?.message });
      ouraToast.error('Could not wipe the record');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#0a0a0a] rounded-2xl p-6 border border-[#1a1a1a]">
      <div className="mb-5">
        <h2 className="text-lg font-light text-white">The Record</h2>
        <p className="text-[#858585] text-xs mt-1">
          What the mirror has on record — your own dated words and the patterns it has logged.
          Edit it and it argues from your edit. Wipe it and it starts blind.
        </p>
      </div>

      {loading ? (
        <p className="text-[#858585] text-sm">Reading the record…</p>
      ) : !hasAny ? (
        <p className="text-[#858585] text-sm">
          The mirror has nothing on record yet. It fills as you write, log, and finalize.
        </p>
      ) : (
        <div className="space-y-4">
          {MEMORY_DOC_IDS.map((id) => {
            const d = docs[id];
            if (!d || (!d.content && !(d.receipts || []).length)) return null;
            const receipts = d.receipts || [];
            const isEditing = editing === id;

            return (
              <div key={id} className="bg-[#050505] rounded-xl p-4 border border-[#1a1a1a]">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white text-sm font-medium">{MEMORY_MODULE_LABELS[id]}</h3>
                    {d.userEdited && (
                      <span className="text-[#00d4aa] text-[10px] uppercase tracking-wide">edited</span>
                    )}
                  </div>
                  {formatDate(d.updatedAt) && (
                    <span className="text-[#5a5a5a] text-[11px]">updated {formatDate(d.updatedAt)}</span>
                  )}
                </div>

                {/* Themes / content */}
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      rows={5}
                      autoFocus
                      className="w-full bg-[#0a0a0a] text-white p-3 rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none resize-none text-sm placeholder-[#828282] transition-colors"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={cancelEdit}
                        disabled={busy}
                        className="px-3 py-1.5 text-xs bg-[#1a1a1a] text-[#858585] rounded-xl disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(id)}
                        disabled={busy}
                        className="px-3 py-1.5 text-xs bg-transparent text-white border border-[#2a2a2a] rounded-xl hover:border-white hover:bg-[#1a1a1a] disabled:opacity-40 transition-colors"
                      >
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[#ababab] text-sm leading-relaxed whitespace-pre-wrap flex-1">
                      {d.content || <span className="text-[#5a5a5a] italic">No themes recorded yet.</span>}
                    </p>
                    <button
                      onClick={() => startEdit(id, d.content)}
                      className="shrink-0 text-[#5a5a5a] hover:text-white text-xs transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                )}

                {/* Receipts */}
                {receipts.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {receipts.map((r, i) => (
                      <div key={`${id}-${i}`} className="flex items-start justify-between gap-3 border-l-2 border-[#2a2a2a] pl-3">
                        <div className="flex-1">
                          <p className="text-[#cfcfcf] text-sm italic">“{r.quote}”</p>
                          {r.date && <p className="text-[#5a5a5a] text-[11px] mt-0.5">{r.date}</p>}
                        </div>
                        <button
                          onClick={() => removeReceipt(id, r.quote)}
                          disabled={busy}
                          aria-label="Remove receipt"
                          className="shrink-0 text-[#5a5a5a] hover:text-[#ef4444] text-xs transition-colors disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Wipe-all — typed confirmation */}
          <div className="border-t border-[#1a1a1a] pt-4">
            {!wipeOpen ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-[#858585] text-xs">
                  Wipe the entire record. The mirror starts blind and rebuilds only from future entries.
                </p>
                <button
                  onClick={() => setWipeOpen(true)}
                  className="shrink-0 px-4 py-2 text-xs bg-transparent text-[#ef4444] hover:bg-[#ef4444]/10 border border-[#ef4444]/40 rounded-xl transition-colors"
                >
                  Wipe the record
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-white text-sm">
                  This deletes every memory the mirror holds. It cannot be recovered — only rebuilt from what you write next.
                </p>
                <label htmlFor="wipe-confirm" className="block text-[#858585] text-xs">
                  Type WIPE to confirm
                </label>
                <input
                  id="wipe-confirm"
                  type="text"
                  value={wipeConfirm}
                  onChange={(e) => setWipeConfirm(e.target.value)}
                  autoComplete="off"
                  className="w-full p-3 bg-[#050505] text-white rounded-xl border border-[#2a2a2a] focus:border-[#ef4444] focus:outline-none text-sm placeholder-[#828282] transition-colors"
                  placeholder="WIPE"
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => { setWipeOpen(false); setWipeConfirm(''); }}
                    disabled={busy}
                    className="px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] disabled:opacity-40 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={doWipe}
                    disabled={busy || wipeConfirm !== 'WIPE'}
                    className="px-4 py-2 text-xs bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-40 rounded-xl transition-colors"
                  >
                    {busy ? 'Wiping…' : 'Wipe everything'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
