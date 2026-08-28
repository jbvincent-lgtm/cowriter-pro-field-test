(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MobileWriteEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rowDropPlan(sections, options) {
    const list = Array.isArray(sections) ? sections : [];
    const source = list.find(section => section.id === options?.sourceSectionId);
    const target = list.find(section => section.id === options?.targetSectionId);
    if (!source || !target) return null;
    const sourceIndex = source.lines.findIndex(line => line.id === options.lineId);
    if (sourceIndex < 0) return null;
    if (!options.targetLineId) {
      return { sourceIndex, targetIndex: target.lines.length, sameSection: source === target, operation: source === target ? 'swap' : 'move' };
    }
    const targetIndex = target.lines.findIndex(line => line.id === options.targetLineId);
    if (targetIndex < 0) return null;
    return {
      sourceIndex,
      targetIndex: source === target ? targetIndex : clamp(targetIndex + (options.dropAfter ? 1 : 0), 0, target.lines.length),
      sameSection: source === target,
      operation: source === target ? 'swap' : 'move'
    };
  }

  function nearestAnchor(slots, clientX) {
    const candidates = (Array.isArray(slots) ? slots : []).filter(slot => Number.isFinite(slot.left) && Number.isFinite(slot.width));
    if (!candidates.length) return null;
    return candidates.reduce((nearest, slot) => {
      const distance = Math.abs(Number(clientX) - (slot.left + slot.width / 2));
      return !nearest || distance < nearest.distance ? { ...slot, distance } : nearest;
    }, null);
  }

  function rowPreview(line, chordDisplay = value => value) {
    const item = line || {};
    if (item.kind === 'progression') return { chords: String(item.text || '').replace(/^\s*\||\|\s*$/g, '').trim(), lyric: 'Chord row' };
    const chords = (item.chords || []).slice().sort((a, b) => a.anchor - b.anchor).map(chord => chordDisplay(chord.value)).join(' · ');
    return { chords, lyric: String(item.text || '').trim() || 'Blank lyric line' };
  }

  return { clamp, rowDropPlan, nearestAnchor, rowPreview };
});
