// FaithSync's own pop-ups, in place of the browser's confirm() and alert()
// (grey boxes titled "localhost:3000 says"). DialogHost, mounted once in the
// root layout, draws them.
//
//   if (!await confirmDialog('Delete "Prayer"? This can’t be undone.')) return;
//   alertDialog('Could not save: ' + friendlyError(error));
//
// Either takes a message, or { title, message, confirmText, cancelText,
// danger }. Without them, the button and its color come from the message's
// first word: "Delete …" gets a red Delete button, "Approve …" an Approve
// button, anything else Yes / OK.

const listeners = new Set();
let queue = [];
let nextId = 1;

function emit() { listeners.forEach((fn) => fn(queue)); }

export function subscribeDialogs(fn) {
  listeners.add(fn);
  fn(queue);
  return () => listeners.delete(fn);
}

export function closeDialog(id, value) {
  const d = queue.find((x) => x.id === id);
  queue = queue.filter((x) => x.id !== id);
  emit();
  d?.resolve(value);
}

const DANGER = ['Delete', 'Remove', 'Void', 'Unlink', 'Leave', 'Reset', 'Disable', 'Archive'];
const VERBS = [...DANGER, 'Approve', 'Restore', 'Release', 'Send', 'Create', 'Link', 'Make', 'Mark', 'Rebuild',
  'Add', 'Use', 'Move', 'Change', 'Close', 'Cancel'];

function open(kind, input) {
  const o = typeof input === 'string' ? { message: input } : { ...input };
  const verb = VERBS.find((v) => new RegExp(`^${v}\\b`).test(o.message || ''));
  const d = {
    id: nextId++,
    kind,
    title: o.title || '',
    message: o.message || '',
    danger: o.danger ?? DANGER.includes(verb),
    // "Cancel your request?" → [Keep it] [Cancel request], not [Cancel] [Cancel]
    confirmText: o.confirmText || (kind === 'alert' ? 'OK' : verb === 'Cancel' ? 'Yes, cancel' : verb || 'Yes'),
    cancelText: o.cancelText || (verb === 'Cancel' ? 'Keep it' : 'Cancel'),
  };
  return new Promise((resolve) => {
    queue = [...queue, { ...d, resolve }];
    emit();
  });
}

export const confirmDialog = (input) => open('confirm', input);
export const alertDialog = (input) => open('alert', input);
