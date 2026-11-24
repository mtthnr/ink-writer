// Registre des dossiers récents : stocké uniquement dans ce navigateur (localStorage).

const KEY = 'enclair.registre.v1';
const MAX = 12;

export function loadRegistry() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveToRegistry(entry) {
  const list = loadRegistry().filter((e) => e.id !== entry.id);
  list.unshift({ ...entry, updatedAt: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    return true;
  } catch {
    return false;
  }
}

/** Retire une entrée du registre. Renvoie la liste mise à jour. */
export function removeFromRegistry(id) {
  const list = loadRegistry().filter((e) => e.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible : la liste affichée reste à jour pour cette session */
  }
  return list;
}

export function readPref(key, fallback) {
  try {
    return localStorage.getItem(`enclair.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    localStorage.setItem(`enclair.${key}`, value);
  } catch {
    /* préférence non persistée : sans gravité */
  }
}
