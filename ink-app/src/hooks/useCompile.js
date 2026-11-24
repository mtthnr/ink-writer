import { useEffect, useState } from 'react';
import { compileSource } from '../lib/api.js';

/**
 * Compile la source via le serveur (debounce), sans IA.
 * `fresh` est vrai quand le résultat correspond exactement à la source courante.
 * @returns {{ result: object|null, error: string|null, fresh: boolean }}
 */
export function useCompile(source, delay = 450) {
  const [state, setState] = useState({ source: null, result: null, error: null });

  useEffect(() => {
    if (source == null) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await compileSource(source);
      if (cancelled) return;
      if (r.stage === 'compile') setState({ source, result: r.compile, error: null });
      else setState({ source, result: null, error: r.error || 'Compilation impossible' });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, delay]);

  return { ...state, fresh: source != null && state.source === source };
}
