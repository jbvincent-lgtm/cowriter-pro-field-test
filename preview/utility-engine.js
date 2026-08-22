(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.UtilityEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SECTION_PATTERNS = [
    { re: /^(?:\[\s*)?(verse)(?:\s+(\d+|[a-z]))?(?:\s*\])?\s*:?[\s]*$/i, label: (m) => `Verse${m[2] ? ` ${String(m[2]).toUpperCase()}` : ''}` },
    { re: /^(?:\[\s*)?(pre[-\s]?chorus|pre)(?:\s+(\d+|[a-z]))?(?:\s*\])?\s*:?[\s]*$/i, label: (m) => `Pre-Chorus${m[2] ? ` ${String(m[2]).toUpperCase()}` : ''}` },
    { re: /^(?:\[\s*)?(chorus)(?:\s+(\d+|[a-z]))?(?:\s*\])?\s*:?[\s]*$/i, label: (m) => `Chorus${m[2] ? ` ${String(m[2]).toUpperCase()}` : ''}` },
    { re: /^(?:\[\s*)?(refrain)(?:\s+(\d+|[a-z]))?(?:\s*\])?\s*:?[\s]*$/i, label: (m) => `Refrain${m[2] ? ` ${String(m[2]).toUpperCase()}` : ''}` },
    { re: /^(?:\[\s*)?(bridge|middle eight)(?:\s+(\d+|[a-z]))?(?:\s*\])?\s*:?[\s]*$/i, label: (m) => `Bridge${m[2] ? ` ${String(m[2]).toUpperCase()}` : ''}` },
    { re: /^(?:\[\s*)?(intro)(?:\s+(\d+|[a-z]))?(?:\s*\])?\s*:?[\s]*$/i, label: (m) => `Intro${m[2] ? ` ${String(m[2]).toUpperCase()}` : ''}` },
    { re: /^(?:\[\s*)?(outro|ending)(?:\s+(\d+|[a-z]))?(?:\s*\])?\s*:?[\s]*$/i, label: (m) => `Outro${m[2] ? ` ${String(m[2]).toUpperCase()}` : ''}` },
    { re: /^(?:\[\s*)?(instrumental|solo|interlude)(?:\s+(\d+|[a-z]))?(?:\s*\])?\s*:?[\s]*$/i, label: (m) => `Instrumental${m[2] ? ` ${String(m[2]).toUpperCase()}` : ''}` },
    { re: /^(?:\[\s*)?(tag)(?:\s+(\d+|[a-z]))?(?:\s*\])?\s*:?[\s]*$/i, label: (m) => `Tag${m[2] ? ` ${String(m[2]).toUpperCase()}` : ''}` }
  ];

  function sectionHeading(line) {
    const value = String(line || '').trim();
    for (const item of SECTION_PATTERNS) {
      const match = value.match(item.re);
      if (match) return item.label(match);
    }
    return null;
  }

  function cleanText(text, options = {}) {
    const preserveMarkdown = options.preserveMarkdown !== false;
    let value = String(text ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;|\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\t/g, '  ')
      .replace(/[ ]{3,}/g, '  ')
      .replace(/[ ]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n');
    if (!preserveMarkdown) value = value.replace(/\*\*(.*?)\*\*/g, '$1').replace(/_(.*?)_/g, '$1');
    return value;
  }

  function parseStructuredPaste(text) {
    const cleaned = cleanText(text);
    const rows = cleaned.split('\n');
    const sections = [];
    let current = null;
    let sawHeading = false;
    for (const raw of rows) {
      const heading = sectionHeading(raw);
      if (heading) {
        sawHeading = true;
        current = { label: heading, lines: [] };
        sections.push(current);
        continue;
      }
      if (!current) {
        current = { label: null, lines: [] };
        sections.push(current);
      }
      if (raw.trim() || current.lines.length) current.lines.push(raw.trimEnd());
    }
    sections.forEach(section => {
      while (section.lines.length && !section.lines[0].trim()) section.lines.shift();
      while (section.lines.length && !section.lines.at(-1).trim()) section.lines.pop();
    });
    const useful = sections.filter(section => section.label || section.lines.some(line => line.trim()));
    return { structured: sawHeading, sections: useful, lines: cleaned.split('\n').filter(line => line.trim()) };
  }

  function nextSectionLabel(type, sections = []) {
    const cleanType = String(type || 'Verse').trim() || 'Verse';
    if (!/^Verse$/i.test(cleanType) && !/^Chorus$/i.test(cleanType)) return cleanType;
    const count = sections.filter(section => new RegExp(`^${cleanType}(?:\\s|$)`, 'i').test(section.label || '')).length;
    if (/^Chorus$/i.test(cleanType)) return count === 0 ? 'Chorus' : `Chorus ${count + 1}`;
    return `Verse ${count + 1}`;
  }

  function wrapSelection(text, start, end, marker) {
    const value = String(text ?? '');
    if (end <= start) return { text: value, start, end };
    const selected = value.slice(start, end);
    const wrapped = `${marker}${selected}${marker}`;
    return { text: `${value.slice(0, start)}${wrapped}${value.slice(end)}`, start: start + marker.length, end: end + marker.length };
  }

  return { sectionHeading, cleanText, parseStructuredPaste, nextSectionLabel, wrapSelection };
});
