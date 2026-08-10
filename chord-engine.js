(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChordEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const NOTE_INDEX = {
    C: 0, 'B#': 0,
    'C#': 1, Db: 1,
    D: 2,
    'D#': 3, Eb: 3,
    E: 4, Fb: 4,
    'E#': 5, F: 5,
    'F#': 6, Gb: 6,
    G: 7,
    'G#': 8, Ab: 8,
    A: 9,
    'A#': 10, Bb: 10,
    B: 11, Cb: 11
  };

  const MAJOR_DEGREES = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
  const MINOR_DEGREES = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
  const DEGREE_TO_OFFSET = {
    '1': 0, '#1': 1, 'b2': 1,
    '2': 2, '#2': 3, 'b3': 3,
    '3': 4, 'b4': 4,
    '#3': 5, '4': 5,
    '#4': 6, 'b5': 6,
    '5': 7, '#5': 8, 'b6': 8,
    '6': 9, '#6': 10, 'b7': 10,
    '7': 11, 'b1': 11
  };

  // Correct diatonic spellings for the common keys exposed by the app.
  const KEY_SCALES = {
    C: ['C','D','E','F','G','A','B'],
    'C#': ['C#','D#','E#','F#','G#','A#','B#'],
    Db: ['Db','Eb','F','Gb','Ab','Bb','C'],
    D: ['D','E','F#','G','A','B','C#'],
    Eb: ['Eb','F','G','Ab','Bb','C','D'],
    E: ['E','F#','G#','A','B','C#','D#'],
    F: ['F','G','A','Bb','C','D','E'],
    'F#': ['F#','G#','A#','B','C#','D#','E#'],
    Gb: ['Gb','Ab','Bb','Cb','Db','Eb','F'],
    G: ['G','A','B','C','D','E','F#'],
    Ab: ['Ab','Bb','C','Db','Eb','F','G'],
    A: ['A','B','C#','D','E','F#','G#'],
    Bb: ['Bb','C','D','Eb','F','G','A'],
    B: ['B','C#','D#','E','F#','G#','A#'],

    Cm: ['C','D','Eb','F','G','Ab','Bb'],
    'C#m': ['C#','D#','E','F#','G#','A','B'],
    Dm: ['D','E','F','G','A','Bb','C'],
    Ebm: ['Eb','F','Gb','Ab','Bb','Cb','Db'],
    Em: ['E','F#','G','A','B','C','D'],
    Fm: ['F','G','Ab','Bb','C','Db','Eb'],
    'F#m': ['F#','G#','A','B','C#','D','E'],
    Gm: ['G','A','Bb','C','D','Eb','F'],
    Abm: ['Ab','Bb','Cb','Db','Eb','Fb','Gb'],
    Am: ['A','B','C','D','E','F','G'],
    Bbm: ['Bb','C','Db','Eb','F','Gb','Ab'],
    Bm: ['B','C#','D','E','F#','G','A']
  };

  const FLAT_MAJOR_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
  const FLAT_MINOR_KEYS = new Set(['D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab']);
  const CONVENTIONAL_MAJOR_KEYS = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const CONVENTIONAL_MINOR_KEYS = ['Cm','C#m','Dm','Ebm','Em','Fm','F#m','Gm','G#m','Am','Bbm','Bm'];
  const STANDARD_SHAPE_TUNINGS = new Set(['standard', 'eb standard', 'e♭ standard', 'd standard', 'drop d']);

  const TUNING_DEFINITIONS = {
    'standard': { name:'Standard', strings:['E','A','D','G','B','E'], offset:0, automatic:true },
    'eb standard': { name:'E♭ Standard', strings:['Eb','Ab','Db','Gb','Bb','Eb'], offset:-1, automatic:true },
    'e♭ standard': { name:'E♭ Standard', strings:['Eb','Ab','Db','Gb','Bb','Eb'], offset:-1, automatic:true },
    'd standard': { name:'D Standard', strings:['D','G','C','F','A','D'], offset:-2, automatic:true },
    'drop d': { name:'Drop D', strings:['D','A','D','G','B','E'], offset:0, automatic:true },
    'double drop d': { name:'Double Drop D', strings:['D','A','D','G','B','D'], offset:null, automatic:false },
    'dadgad': { name:'DADGAD', strings:['D','A','D','G','A','D'], offset:null, automatic:false },
    'open d': { name:'Open D', strings:['D','A','D','F#','A','D'], offset:null, automatic:false },
    'open g': { name:'Open G', strings:['D','G','D','G','B','D'], offset:null, automatic:false },
    'open em7 / g6': { name:'Open Em7 / G6', strings:['E','G','D','G','B','D'], offset:null, automatic:false },
    'c modal': { name:'C Modal', strings:['C','G','D','G','A','D'], offset:null, automatic:false }
  };

  function normaliseAccidentals(value) {
    return String(value || '').replace(/♯/g, '#').replace(/♭/g, 'b').trim();
  }

  function parseKey(key) {
    const value = normaliseAccidentals(key);
    const match = value.match(/^([A-G](?:#|b)?)(?:\s*(m|min|minor))?$/i);
    if (!match) return { tonic: 'C', mode: 'major' };
    const tonic = match[1][0].toUpperCase() + match[1].slice(1);
    return { tonic, mode: match[2] ? 'minor' : 'major' };
  }

  function formatKey(key) {
    const parsed = parseKey(key);
    return `${parsed.tonic}${parsed.mode === 'minor' ? 'm' : ''}`;
  }

  function keyId(key) {
    return formatKey(key);
  }

  function noteIndex(note) {
    const n = normaliseAccidentals(note);
    return Object.prototype.hasOwnProperty.call(NOTE_INDEX, n) ? NOTE_INDEX[n] : null;
  }

  function chooseSpelling(key, preference) {
    if (preference === 'sharp' || preference === 'flat') return preference;
    const parsed = parseKey(key);
    if (parsed.mode === 'minor') return FLAT_MINOR_KEYS.has(parsed.tonic) ? 'flat' : 'sharp';
    return FLAT_MAJOR_KEYS.has(parsed.tonic) ? 'flat' : 'sharp';
  }

  function noteName(index, key, preference) {
    const notes = chooseSpelling(key, preference) === 'flat' ? FLAT_NOTES : SHARP_NOTES;
    return notes[((index % 12) + 12) % 12];
  }

  function accidentalValue(note) {
    const suffix = normaliseAccidentals(note).slice(1);
    let value = 0;
    for (const char of suffix) value += char === '#' ? 1 : char === 'b' ? -1 : 0;
    return value;
  }

  function renderAccidental(value) {
    if (value > 0) return '#'.repeat(value);
    if (value < 0) return 'b'.repeat(Math.abs(value));
    return '';
  }

  function adjustLetterSpelling(note, semitoneDelta) {
    const base = normaliseAccidentals(note);
    return `${base[0]}${renderAccidental(accidentalValue(base) + semitoneDelta)}`;
  }

  function scaleForKey(key) {
    const id = keyId(key);
    if (KEY_SCALES[id]) return KEY_SCALES[id].slice();
    const parsed = parseKey(key);
    const tonicIndex = noteIndex(parsed.tonic);
    const offsets = parsed.mode === 'minor' ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
    return offsets.map(offset => noteName(tonicIndex + offset, key, 'auto'));
  }

  function parseChord(value) {
    const raw = normaliseAccidentals(value);
    if (!raw) return null;
    if (/^(N\.?C\.?|no\s*chord)$/i.test(raw)) return { raw, noChord: true, recognised: true };
    const match = raw.match(/^([A-G](?:#{1,2}|b{1,2})?)([^/]*)?(?:\/([A-G](?:#{1,2}|b{1,2})?))?$/);
    if (!match) return { raw, recognised: false };
    const root = match[1];
    const suffix = match[2] || '';
    const bass = match[3] || null;
    if (noteIndex(root) === null || (bass && noteIndex(bass) === null)) return { raw, recognised: false };
    return { raw, root, suffix, bass, recognised: true, noChord: false };
  }

  function parseNashville(value) {
    const raw = normaliseAccidentals(value);
    const match = raw.match(/^([b#]?[1-7])([^/]*)?(?:\/([b#]?[1-7]))?$/i);
    if (!match) return null;
    return { raw, degree: match[1], suffix: match[2] || '', bassDegree: match[3] || null };
  }

  function transposeNote(note, semitones, targetKey, preference) {
    const index = noteIndex(note);
    if (index === null) return note;
    return noteName(index + Number(semitones || 0), targetKey, preference);
  }

  function transposeChord(chordValue, semitones, targetKey, preference) {
    const chord = parseChord(chordValue);
    if (!chord || !chord.recognised || chord.noChord) return chordValue;
    const root = transposeNote(chord.root, semitones, targetKey, preference);
    const bass = chord.bass ? transposeNote(chord.bass, semitones, targetKey, preference) : null;
    return `${root}${chord.suffix}${bass ? `/${bass}` : ''}`;
  }

  function degreeForNote(note, key) {
    const parsedKey = parseKey(key);
    const tonicIndex = noteIndex(parsedKey.tonic);
    const valueIndex = noteIndex(note);
    if (tonicIndex === null || valueIndex === null) return null;
    const offset = ((valueIndex - tonicIndex) % 12 + 12) % 12;
    return (parsedKey.mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES)[offset];
  }

  function chordToNashville(chordValue, key) {
    const chord = parseChord(chordValue);
    if (!chord || !chord.recognised || chord.noChord) return chordValue;
    const degree = degreeForNote(chord.root, key);
    const bassDegree = chord.bass ? degreeForNote(chord.bass, key) : null;
    if (!degree) return chordValue;
    return `${degree}${chord.suffix}${bassDegree ? `/${bassDegree}` : ''}`;
  }

  function degreeToNote(degree, key, preference) {
    const parsedDegree = String(degree || '').match(/^([b#]?)([1-7])$/);
    if (!parsedDegree) return null;
    const accidental = parsedDegree[1] === 'b' ? -1 : parsedDegree[1] === '#' ? 1 : 0;
    const degreeIndex = Number(parsedDegree[2]) - 1;
    const parsedKey = parseKey(key);
    // Nashville degrees are measured against the parallel major scale even when
    // the song tonic is minor: in A minor, b3 is C (not Cb).
    const majorKey = parsedKey.tonic;
    const scale = KEY_SCALES[majorKey] ? KEY_SCALES[majorKey].slice() : scaleForKey(majorKey);
    const natural = scale[degreeIndex];
    if (!natural) return null;
    if (!accidental) return natural;
    const adjusted = adjustLetterSpelling(natural, accidental);
    // Respect an explicit global spelling preference for chromatic degrees only when it
    // does not destroy the scale degree letter. The degree letter remains authoritative.
    return adjusted;
  }

  function nashvilleToChord(numberValue, key, preference) {
    const parsed = parseNashville(numberValue);
    if (!parsed) return numberValue;
    const rootNote = degreeToNote(parsed.degree, key, preference);
    const bassNote = parsed.bassDegree ? degreeToNote(parsed.bassDegree, key, preference) : null;
    if (!rootNote) return numberValue;
    return `${rootNote}${parsed.suffix}${bassNote ? `/${bassNote}` : ''}`;
  }

  function transformBracketTokens(text, transform) {
    return String(text || '').replace(/\[([^\]]+)\]/g, (full, token) => `[${transform(token)}]`);
  }

  function normaliseLineNumbersToChords(text, key, preference) {
    return transformBracketTokens(text, token => parseNashville(token) ? nashvilleToChord(token, key, preference) : token);
  }

  function transposeLine(text, semitones, targetKey, preference) {
    return transformBracketTokens(text, token => transposeChord(token, semitones, targetKey, preference));
  }

  function displayLine(text, mode, key) {
    if (mode !== 'numbers') return text;
    return transformBracketTokens(text, token => chordToNashville(token, key));
  }

  function keyScaleChords(key, preference) {
    const parsed = parseKey(key);
    const scale = scaleForKey(key);
    const minor = parsed.mode === 'minor';
    const qualities = minor ? ['m', 'dim', '', 'm', 'm', '', ''] : ['', 'm', 'm', '', '', 'm', 'dim'];
    const numbers = minor ? ['1m', '2dim', 'b3', '4m', '5m', 'b6', 'b7'] : ['1', '2m', '3m', '4', '5', '6m', '7dim'];
    return scale.map((note, index) => ({ chord: `${note}${qualities[index]}`, number: numbers[index] }));
  }

  function borrowedChords(key, preference) {
    const parsed = parseKey(key);
    if (parsed.mode === 'minor') {
      return [
        { number: '5', chord: nashvilleToChord('5', key, preference), label: 'major V' },
        { number: '4', chord: nashvilleToChord('4', key, preference), label: 'major IV' },
        { number: 'b2', chord: nashvilleToChord('b2', key, preference), label: 'flat II' },
        { number: '1', chord: nashvilleToChord('1', key, preference), label: 'major tonic' }
      ];
    }
    return [
      { number: 'b7', chord: nashvilleToChord('b7', key, preference), label: 'flat VII' },
      { number: '2', chord: nashvilleToChord('2', key, preference), label: 'major II' },
      { number: '4m', chord: nashvilleToChord('4m', key, preference), label: 'minor IV' },
      { number: '57', chord: nashvilleToChord('57', key, preference), label: 'dominant V' }
    ];
  }

  function sameMode(keyA, keyB) {
    return parseKey(keyA).mode === parseKey(keyB).mode;
  }

  function capoForKeys(soundingKey, shapeKey) {
    const sound = noteIndex(parseKey(soundingKey).tonic);
    const shape = noteIndex(parseKey(shapeKey).tonic);
    if (sound === null || shape === null) return 0;
    return ((sound - shape) % 12 + 12) % 12;
  }

  function shapeKeyForCapo(soundingKey, capo, preference) {
    const parsed = parseKey(soundingKey);
    const tonic = noteName(noteIndex(parsed.tonic) - Number(capo || 0), soundingKey, preference);
    return `${tonic}${parsed.mode === 'minor' ? 'm' : ''}`;
  }

  function soundingKeyFromShape(shapeKey, capo, preference) {
    const parsed = parseKey(shapeKey);
    const tonic = noteName(noteIndex(parsed.tonic) + Number(capo || 0), shapeKey, preference);
    return `${tonic}${parsed.mode === 'minor' ? 'm' : ''}`;
  }

  function capoOptions(key, preference) {
    const parsed = parseKey(key);
    const shapes = parsed.mode === 'minor' ? ['Am', 'Em', 'Dm', 'Bm', 'Gm', 'Cm'] : ['C', 'D', 'E', 'G', 'A', 'B'];
    const options = shapes
      .filter(shape => sameMode(key, shape))
      .map(shape => ({ shapeKey: shape, capo: capoForKeys(key, shape) }))
      .filter(option => option.capo <= 7);
    if (!options.some(option => option.capo === 0)) options.unshift({ shapeKey: formatKey(key), capo: 0 });
    return options.sort((a, b) => a.capo - b.capo || a.shapeKey.localeCompare(b.shapeKey));
  }

  function keySemitoneDistance(fromKey, toKey) {
    const from = noteIndex(parseKey(fromKey).tonic);
    const to = noteIndex(parseKey(toKey).tonic);
    return ((to - from) % 12 + 12) % 12;
  }

  function signedKeyDistance(fromKey, toKey) {
    const up = keySemitoneDistance(fromKey, toKey);
    return up > 6 ? up - 12 : up;
  }

  function supportsAutomaticShapes(tuning) {
    return STANDARD_SHAPE_TUNINGS.has(String(tuning || 'Standard').trim().toLowerCase());
  }


  function tuningDefinition(tuning) {
    const key = String(tuning || 'Standard').trim().toLowerCase();
    return TUNING_DEFINITIONS[key] || { name:String(tuning || 'Custom'), strings:[], offset:null, automatic:false };
  }

  function tuningOffset(tuning) {
    const value = tuningDefinition(tuning).offset;
    return Number.isFinite(value) ? value : null;
  }

  function capoForKeysWithTuning(soundingKey, shapeKey, tuning) {
    const offset = tuningOffset(tuning);
    if (offset === null) return capoForKeys(soundingKey, shapeKey);
    const sound = noteIndex(parseKey(soundingKey).tonic);
    const shape = noteIndex(parseKey(shapeKey).tonic);
    if (sound === null || shape === null) return 0;
    return ((sound - shape - offset) % 12 + 12) % 12;
  }

  function conventionalKeyAt(index, mode = 'major', preference = 'auto', contextKey = 'C') {
    const pitch = ((Number(index) % 12) + 12) % 12;
    if (preference === 'sharp' || preference === 'flat') {
      const tonic = noteName(pitch, contextKey, preference);
      return `${tonic}${mode === 'minor' ? 'm' : ''}`;
    }
    return mode === 'minor' ? CONVENTIONAL_MINOR_KEYS[pitch] : CONVENTIONAL_MAJOR_KEYS[pitch];
  }

  function shapeKeyForCapoWithTuning(soundingKey, capo, tuning, preference) {
    const parsed = parseKey(soundingKey);
    const offset = tuningOffset(tuning);
    if (offset === null) return formatKey(soundingKey);
    return conventionalKeyAt(noteIndex(parsed.tonic) - Number(capo || 0) - offset, parsed.mode, preference, soundingKey);
  }

  function soundingKeyFromShapeWithTuning(shapeKey, capo, tuning, preference) {
    const parsed = parseKey(shapeKey);
    const offset = tuningOffset(tuning);
    if (offset === null) return formatKey(shapeKey);
    return conventionalKeyAt(noteIndex(parsed.tonic) + Number(capo || 0) + offset, parsed.mode, preference, shapeKey);
  }

  function harmonicaMatches(key, preference) {
    const parsed = parseKey(key);
    const tonic = noteIndex(parsed.tonic);
    const plain = index => noteName(index, key, preference);
    return {
      straight: { key: plain(tonic), position:'1st position', use: parsed.mode === 'minor' ? 'melody or natural-minor harp' : 'melody, folk and country' },
      cross: { key: plain(tonic + 5), position:'2nd position', use:'blues, rock and country bends' },
      third: { key: plain(tonic - 2), position:'3rd position', use: parsed.mode === 'minor' ? 'minor and darker blues' : 'minor, Dorian and darker blues' }
    };
  }

  function validateCapoProfile(soundingKey, shapeKey, capo, tuning) {
    if (!supportsAutomaticShapes(tuning)) {
      return { valid: true, automatic: false, message: 'Alternate tuning: capo is stored, but chord-shape conversion is manual.' };
    }
    if (!sameMode(soundingKey, shapeKey)) {
      return { valid: false, automatic: true, message: 'Sounding key and shape key must use the same major/minor mode.' };
    }
    const expected = capoForKeysWithTuning(soundingKey, shapeKey, tuning);
    const actual = ((Number(capo || 0) % 12) + 12) % 12;
    return expected === actual
      ? { valid: true, automatic: true, message: 'Capo profile is musically consistent.' }
      : { valid: false, automatic: true, expectedCapo: expected, message: `${shapeKey} shapes need capo ${expected} to sound in ${soundingKey}.` };
  }

  return {
    SHARP_NOTES,
    FLAT_NOTES,
    KEY_SCALES,
    parseKey,
    formatKey,
    parseChord,
    parseNashville,
    chooseSpelling,
    transposeChord,
    chordToNashville,
    nashvilleToChord,
    normaliseLineNumbersToChords,
    transposeLine,
    displayLine,
    keySemitoneDistance,
    signedKeyDistance,
    degreeForNote,
    degreeToNote,
    noteIndex,
    noteName,
    scaleForKey,
    keyScaleChords,
    borrowedChords,
    sameMode,
    capoForKeys,
    shapeKeyForCapo,
    soundingKeyFromShape,
    capoOptions,
    supportsAutomaticShapes,
    validateCapoProfile,
    TUNING_DEFINITIONS,
    tuningDefinition,
    tuningOffset,
    capoForKeysWithTuning,
    shapeKeyForCapoWithTuning,
    soundingKeyFromShapeWithTuning,
    harmonicaMatches,
    transformBracketTokens
  };
});
