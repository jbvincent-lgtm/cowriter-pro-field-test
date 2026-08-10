(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StructureEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clone = value => JSON.parse(JSON.stringify(value));

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function findSection(song, sectionId) {
    return (song.sections || []).find(section => section.id === sectionId) || null;
  }

  function moveLine(song, options) {
    const {
      sourceSectionId,
      lineId,
      targetSectionId,
      targetIndex,
      copy = false,
      idFactory = value => value,
      blankLineFactory = null
    } = options || {};
    const source = findSection(song, sourceSectionId);
    const target = findSection(song, targetSectionId);
    if (!source || !target) return null;
    const sourceIndex = source.lines.findIndex(line => line.id === lineId);
    if (sourceIndex < 0) return null;

    const original = source.lines[sourceIndex];
    const item = copy ? clone(original) : original;
    if (copy) item.id = idFactory(item.id);

    let insertAt = clamp(Number(targetIndex) || 0, 0, target.lines.length);
    if (!copy) {
      source.lines.splice(sourceIndex, 1);
      if (source === target && sourceIndex < insertAt) insertAt -= 1;
    }
    insertAt = clamp(insertAt, 0, target.lines.length);
    target.lines.splice(insertAt, 0, item);
    if (!source.lines.length && typeof blankLineFactory === 'function') source.lines.push(blankLineFactory());
    return { item, insertAt, source, target };
  }

  function moveSection(song, options) {
    const { sectionId, targetIndex, copy = false, idFactory = value => value } = options || {};
    const sourceIndex = (song.sections || []).findIndex(section => section.id === sectionId);
    if (sourceIndex < 0) return null;
    const original = song.sections[sourceIndex];
    const item = copy ? clone(original) : original;
    if (copy) {
      item.id = idFactory(item.id);
      (item.lines || []).forEach(line => { line.id = idFactory(line.id); });
    }
    let insertAt = clamp(Number(targetIndex) || 0, 0, song.sections.length);
    if (!copy) {
      song.sections.splice(sourceIndex, 1);
      if (sourceIndex < insertAt) insertAt -= 1;
    }
    insertAt = clamp(insertAt, 0, song.sections.length);
    song.sections.splice(insertAt, 0, item);
    return { item, insertAt };
  }

  function reorderItem(items, sourceIndex, targetIndex) {
    if (!Array.isArray(items) || sourceIndex < 0 || sourceIndex >= items.length) return null;
    let insertAt = clamp(Number(targetIndex) || 0, 0, items.length);
    const [item] = items.splice(sourceIndex, 1);
    if (sourceIndex < insertAt) insertAt -= 1;
    insertAt = clamp(insertAt, 0, items.length);
    items.splice(insertAt, 0, item);
    return { item, insertAt };
  }

  return { clone, clamp, findSection, moveLine, moveSection, reorderItem };
});
