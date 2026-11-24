import { memo, useEffect, useMemo, useRef } from 'react';
import { tokenizeLine } from '../lib/inkParse.js';
import './CodeEditor.css';

const LINE_H = 24;
const PAD_TOP = 10;

/** Découpe les jetons de coloration aux bornes des marques (soulignements). */
function splitByMarks(tokens, marks) {
  if (!marks?.length) return tokens;
  const out = [];
  let offset = 0;
  for (const tk of tokens) {
    const end = offset + tk.t.length;
    const cuts = new Set([offset, end]);
    for (const m of marks) {
      if (m.from > offset && m.from < end) cuts.add(m.from);
      if (m.to > offset && m.to < end) cuts.add(m.to);
    }
    const points = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const mark = marks.find((m) => m.from <= a && m.to >= b);
      out.push({ ...tk, t: tk.t.slice(a - offset, b - offset), mark: mark?.cls });
    }
    offset = end;
  }
  return out;
}

const Line = memo(
  function Line({ text, tone, marks }) {
    const tokens = splitByMarks(tokenizeLine(text), marks);
    return (
      <div className={`ce-line${tone ? ` ce-line--${tone}` : ''}`}>
        {tokens.length === 0
          ? ' '
          : tokens.map((t, i) => (
            <span key={i} className={`sx-${t.k}${t.b ? ' sx-b' : ''}${t.i ? ' sx-i' : ''}${t.mark ? ` ce-mark ${t.mark.split(' ').map((m) => `ce-mark--${m}`).join(' ')}` : ''}`}>{t.t}</span>
          ))}
      </div>
    );
  },
  (a, b) => a.text === b.text && a.tone === b.tone && a.marksKey === b.marksKey,
);

/**
 * Éditeur de code ink : un textarea transparent superposé au rendu coloré.
 * @param {object} props
 * @param {string} props.source
 * @param {(v: string) => void} props.onChange
 * @param {Map<number, {tone?: string, mark?: string}>} props.decor   décor par ligne (1-based)
 * @param {{start: number, end: number, cls: string}[]} props.ranges  soulignements (offsets globaux)
 * @param {{line: number, nonce: number}|null} props.focus            saut demandé
 * @param {(pos: {line: number, col: number}) => void} props.onCursor
 */
export default function CodeEditor({ source, onChange, decor, ranges, focus, onCursor, cursorLine }) {
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const lines = useMemo(() => source.split('\n'), [source]);

  const lineStarts = useMemo(() => {
    const starts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
    return starts;
  }, [source]);

  // Marques par ligne (offsets relatifs à la ligne).
  const marksByLine = useMemo(() => {
    const map = new Map();
    for (const r of ranges ?? []) {
      for (let l = 0; l < lineStarts.length; l++) {
        const ls = lineStarts[l];
        const le = l + 1 < lineStarts.length ? lineStarts[l + 1] - 1 : source.length;
        if (r.end <= ls || r.start > le) continue;
        const from = Math.max(r.start, ls) - ls;
        const to = Math.min(r.end, le) - ls;
        if (to <= from) continue;
        if (!map.has(l + 1)) map.set(l + 1, []);
        map.get(l + 1).push({ from, to, cls: r.cls });
      }
    }
    return map;
  }, [ranges, lineStarts, source.length]);

  const report = () => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = source.slice(0, pos);
    const line = before.split('\n').length;
    onCursor?.({ line, col: pos - before.lastIndexOf('\n') });
  };

  useEffect(() => {
    if (!focus?.line) return;
    const ta = taRef.current;
    const box = scrollRef.current;
    const offset = lineStarts[Math.min(focus.line, lineStarts.length) - 1] ?? 0;
    if (ta) {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(offset, offset);
    }
    if (box) box.scrollTop = Math.max(0, PAD_TOP + (focus.line - 1) * LINE_H - box.clientHeight / 3);
    onCursor?.({ line: focus.line, col: 1 });
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="ce ec-scroll" ref={scrollRef}>
      <div className="ce__grid">
        <div className="ce__gutter" aria-hidden="true">
          {lines.map((_, i) => {
            const d = decor.get(i + 1);
            const current = cursorLine === i + 1;
            return (
              <div
                key={i}
                className={`ce__num${current ? ' is-current' : ''}`}
                style={{ borderLeftColor: d?.mark ?? (current ? 'var(--ec-lampe-filet)' : 'transparent'), background: d?.tone === 'error' ? 'var(--ec-tampon-ligne)' : current ? 'var(--ec-curseur)' : undefined }}
                title={d?.title}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
        <div className="ce__code">
          <div className="ce__hl" aria-hidden="true">
            {lines.map((text, i) => {
              const marks = marksByLine.get(i + 1);
              const tone = decor.get(i + 1)?.tone ?? (cursorLine === i + 1 ? 'cursor' : undefined);
              return <Line key={i} text={text} tone={tone} marks={marks} marksKey={marks ? JSON.stringify(marks) : ''} />;
            })}
          </div>
          <textarea
            ref={taRef}
            className="ce__ta"
            value={source}
            onChange={(e) => onChange(e.target.value)}
            onSelect={report}
            onKeyUp={report}
            onClick={report}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            wrap="off"
            aria-label="Source ink"
          />
        </div>
      </div>
    </div>
  );
}
