(function (root, factory) {
  const api = factory(root.ChordEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NotebookEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ChordEngine) {
  'use strict';

  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function canonicalChord(token, key = 'C') {
    const value = String(token || '').trim();
    if (!value) return null;
    if (ChordEngine) {
      const number = ChordEngine.parseNashville?.(value);
      if (number) return ChordEngine.nashvilleToChord(value, key, 'auto');
      const parsed = ChordEngine.parseChord?.(value);
      if (parsed?.recognised) return value;
    }
    return value;
  }

  function parseBracketLine(raw, key = 'C', idFactory = () => uid('chord')) {
    const source = String(raw || '');
    const chords = [];
    let text = '';
    let cursor = 0;
    const regex = /\[([^\]]+)\]/g;
    let match;
    while ((match = regex.exec(source))) {
      text += source.slice(cursor, match.index);
      const value = canonicalChord(match[1], key);
      if (value) chords.push({ id: idFactory(), value, anchor: text.length, needsReview: false });
      cursor = regex.lastIndex;
    }
    text += source.slice(cursor);
    return { text, chords: normaliseChords(chords, text.length) };
  }

  function serialiseBracketLine(line, transform = value => value) {
    const text = String(line?.text || '');
    const chords = normaliseChords(line?.chords || [], text.length)
      .slice()
      .sort((a, b) => a.anchor - b.anchor || String(a.id).localeCompare(String(b.id)));
    const grouped = new Map();
    chords.forEach(chord => {
      const anchor = clamp(Number(chord.anchor) || 0, 0, text.length);
      if (!grouped.has(anchor)) grouped.set(anchor, []);
      grouped.get(anchor).push(`[${transform(chord.value, chord)}]`);
    });
    let out = '';
    for (let i = 0; i <= text.length; i += 1) {
      if (grouped.has(i)) out += grouped.get(i).join('');
      if (i < text.length) out += text[i];
    }
    return out;
  }

  function normaliseChords(chords, textLength = Infinity) {
    const seen = new Set();
    return (Array.isArray(chords) ? chords : [])
      .filter(Boolean)
      .map(chord => ({
        id: chord.id || uid('chord'),
        value: String(chord.value || chord.chord || '').trim(),
        anchor: clamp(Number.isFinite(Number(chord.anchor)) ? Number(chord.anchor) : 0, 0, Number.isFinite(textLength) ? textLength : Number.MAX_SAFE_INTEGER),
        needsReview: Boolean(chord.needsReview)
      }))
      .filter(chord => chord.value && !seen.has(chord.id) && seen.add(chord.id));
  }

  function repairLegacyChordStacks(chords, textLength = Infinity) {
    const source = normaliseChords(chords, textLength).map((chord,index) => ({...chord,__index:index}));
    const groups = new Map();
    source.forEach(chord => {
      if (!groups.has(chord.anchor)) groups.set(chord.anchor, []);
      groups.get(chord.anchor).push(chord);
    });
    const repeated = new Map();
    groups.forEach(group => {
      if (group.length < 2) return;
      const signature = group.map(chord => chord.value).sort().join('\u0000');
      if (!repeated.has(signature)) repeated.set(signature, []);
      repeated.get(signature).push(group);
    });
    const remove = new Set();
    const preserve = new Set();
    repeated.forEach(matches => {
      if (matches.length < 2) return;
      const keeper = matches.slice().sort((a,b)=>b.at(-1).__index-a.at(-1).__index)[0];
      matches.forEach(group => group.forEach(chord => (group===keeper?preserve:remove).add(chord.id)));
    });
    groups.forEach(group => {
      const remaining = group.filter(chord => !remove.has(chord.id));
      if (remaining.length < 2 || remaining.every(chord => preserve.has(chord.id))) return;
      remaining.slice(0,-1).forEach(chord => remove.add(chord.id));
    });
    return source.filter(chord => !remove.has(chord.id)).map(({__index,...chord}) => chord);
  }

  function wordBoundaries(text) {
    const source = String(text || '');
    const points = [0];
    const regex = /\S+/g;
    let match;
    while ((match = regex.exec(source))) {
      if (!points.includes(match.index)) points.push(match.index);
      const end = match.index + match[0].length;
      if (!points.includes(end)) points.push(end);
    }
    if (!points.includes(source.length)) points.push(source.length);
    return points.sort((a, b) => a - b);
  }

  function wordStarts(text) {
    const source = String(text || '');
    const points = [];
    const regex = /\S+/g;
    let match;
    while ((match = regex.exec(source))) points.push(match.index);
    if (!points.length || points[0] !== 0) points.unshift(0);
    if (!points.includes(source.length)) points.push(source.length);
    return [...new Set(points)].sort((a, b) => a - b);
  }

  function nearestBoundary(text, index, startsOnly = true) {
    const points = startsOnly ? wordStarts(text) : wordBoundaries(text);
    const target = clamp(Number(index) || 0, 0, String(text || '').length);
    return points.reduce((best, point) => Math.abs(point - target) < Math.abs(best - target) ? point : best, points[0] || 0);
  }

  function adjustAnchors(chords, oldText, newText) {
    const before = String(oldText || '');
    const after = String(newText || '');
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < before.length - prefix &&
      suffix < after.length - prefix &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    ) suffix += 1;
    const delta = after.length - before.length;
    return normaliseChords(chords, before.length).map(chord => {
      let anchor = chord.anchor;
      let needsReview = chord.needsReview;
      if (anchor <= prefix) {
        // unchanged before edit
      } else if (anchor >= before.length - suffix) {
        anchor += delta;
      } else {
        anchor = nearestBoundary(after, prefix, true);
        needsReview = true;
      }
      return { ...chord, anchor: clamp(anchor, 0, after.length), needsReview };
    });
  }

  function mergeLines(previous, current) {
    const left = String(previous?.text || '');
    const right = String(current?.text || '');
    const joiner = left && right ? ' ' : '';
    const offset = left.length + joiner.length;
    return {
      ...previous,
      text: left + joiner + right,
      chords: [
        ...normaliseChords(previous?.chords || [], left.length),
        ...normaliseChords(current?.chords || [], right.length).map(chord => ({ ...chord, anchor: chord.anchor + offset }))
      ]
    };
  }

  function splitLine(line, index, idFactory = () => uid('line')) {
    const source = String(line?.text || '');
    const point = clamp(Number(index) || 0, 0, source.length);
    const before = { ...line, text: source.slice(0, point), chords: [] };
    const after = { ...line, id: idFactory(), text: source.slice(point), chords: [] };
    normaliseChords(line?.chords || [], source.length).forEach(chord => {
      if (chord.anchor < point) before.chords.push({ ...chord });
      else after.chords.push({ ...chord, anchor: chord.anchor - point });
    });
    return [before, after];
  }

  function insertChord(line, value, anchor, idFactory = () => uid('chord')) {
    const text = String(line?.text || '');
    const chord = {
      id: idFactory(),
      value: String(value || '').trim(),
      anchor: nearestBoundary(text, anchor, true),
      needsReview: false
    };
    return { ...line, chords: [...normaliseChords(line?.chords || [], text.length), chord] };
  }

  function moveChord(sourceLine, targetLine, chordId, targetAnchor) {
    const sourceChords = normaliseChords(sourceLine?.chords || [], String(sourceLine?.text || '').length);
    const moving = sourceChords.find(chord => chord.id === chordId);
    if (!moving) return { sourceLine, targetLine, moved: false };
    const sameLine = sourceLine === targetLine || sourceLine?.id === targetLine?.id;
    const targetText = String(targetLine?.text || '');
    const movedChord = { ...moving, anchor: nearestBoundary(targetText, targetAnchor, true), needsReview: false };
    if (sameLine) {
      return {
        sourceLine: { ...sourceLine, chords: sourceChords.map(chord => chord.id === chordId ? movedChord : chord) },
        targetLine: null,
        moved: true
      };
    }
    return {
      sourceLine: { ...sourceLine, chords: sourceChords.filter(chord => chord.id !== chordId) },
      targetLine: { ...targetLine, chords: [...normaliseChords(targetLine?.chords || [], targetText.length), movedChord] },
      moved: true
    };
  }

  function positionDefaults(items, startX = 120, startY = 100, columns = 4) {
    return (items || []).map((item, index) => ({
      ...item,
      x: Number.isFinite(Number(item.x)) ? Number(item.x) : startX + (index % columns) * 260,
      y: Number.isFinite(Number(item.y)) ? Number(item.y) : startY + Math.floor(index / columns) * 170,
      w: Number.isFinite(Number(item.w)) ? Number(item.w) : 220,
      h: Number.isFinite(Number(item.h)) ? Number(item.h) : 120
    }));
  }

  return {
    parseBracketLine,
    serialiseBracketLine,
    normaliseChords,
    repairLegacyChordStacks,
    wordBoundaries,
    wordStarts,
    nearestBoundary,
    adjustAnchors,
    mergeLines,
    splitLine,
    insertChord,
    moveChord,
    positionDefaults
  };
});
