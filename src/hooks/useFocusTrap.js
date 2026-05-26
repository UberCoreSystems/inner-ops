import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Trap keyboard focus inside a container while it is mounted, restore focus
// to the previously-focused element on unmount. Used by every modal in the
// app (OracleModal, TodaysReflectionModal, KillClosureModal, EmergencyButton).
//
// Usage:
//   const ref = useFocusTrap(isOpen);
//   return <div ref={ref}>...modal markup...</div>
//
// Behavior:
// - On open: captures the currently-focused element, then moves focus to the
//   first focusable child of the container (or the container itself).
// - On Tab/Shift+Tab: cycles within the container only.
// - On unmount/close: returns focus to the originally-focused element.
//
// Skip the trap when `active` is false. The hook is a no-op until active.
export function useFocusTrap(active) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    const previouslyFocused = typeof document !== 'undefined' ? document.activeElement : null;

    const focusable = () => Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);

    // Move focus into the modal on open. Prefer first focusable; fall back to
    // the container itself (made temporarily focusable) so screen readers
    // announce the dialog.
    const initial = focusable()[0];
    if (initial && typeof initial.focus === 'function') {
      initial.focus();
    } else if (container.tabIndex < 0) {
      container.tabIndex = -1;
      container.focus();
    }

    const handleKeyDown = (event) => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;

      if (event.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus(); } catch { /* ignore */ }
      }
    };
  }, [active]);

  return containerRef;
}
