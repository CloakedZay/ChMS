'use client';

import { useEffect, useRef } from 'react';

// Keyboard and screen-reader behaviour for a pop-up panel:
//   • the cursor moves into it when it opens (first field; on touch screens
//     the panel itself, so the keyboard doesn't jump up)
//   • Tab and Shift+Tab stay inside it
//   • Esc closes it
//   • when it closes, the cursor goes back to the button that opened it
//
//   const formRef = useDialog(showModal, () => setShowModal(false));
//   <div ref={formRef} role="dialog" aria-modal="true" aria-label="New entry" …>
//
// Esc is heard on the panel itself, so a date picker or confirm box opened
// from inside it (rendered elsewhere on the page) closes first, on its own.
const FIELDS = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
const FOCUSABLE = `${FIELDS}, button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])`;

export function useDialog(open, onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    const opener = document.activeElement;

    const finePointer = window.matchMedia?.('(pointer: fine)').matches;
    const first = finePointer ? (panel.querySelector(FIELDS) || panel.querySelector(FOCUSABLE)) : null;
    if (first) first.focus({ preventScroll: true });
    else {
      if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
      panel.focus({ preventScroll: true });
    }

    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const head = items[0], tail = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === head || document.activeElement === panel)) {
        e.preventDefault(); tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault(); head.focus();
      }
    };
    panel.addEventListener('keydown', onKey);
    return () => {
      panel.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);

  return ref;
}
