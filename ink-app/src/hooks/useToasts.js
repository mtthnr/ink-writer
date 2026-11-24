import { useCallback, useRef, useState } from 'react';

/** Télégrammes : kind = 'ok' (REÇU) | 'err' (ÉCHEC) | 'wait' (EN COURS). */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const notify = useCallback((kind, message, { ttl = kind === 'err' ? 9000 : 4500, replace } = {}) => {
    seq.current += 1;
    const id = replace ?? seq.current;
    // Un télégramme « en cours » sans durée de vie est une opération active : il affiche un indicateur.
    const busy = kind === 'wait' && !ttl;
    setToasts((list) => [...list.filter((t) => t.id !== id), { id, kind, message, busy }].slice(-4));
    if (ttl) setTimeout(() => dismiss(id), ttl);
    return id;
  }, [dismiss]);

  return { toasts, notify, dismiss };
}
