(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AudioTrimEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function trimBounds(duration, start = 0, end = duration, minimum = 0.1) {
    const total = Math.max(0, Number(duration) || 0);
    const min = Math.min(Math.max(0.01, Number(minimum) || 0.1), total || 0.1);
    let from = Math.max(0, Math.min(total, Number(start) || 0));
    let to = Math.max(from, Math.min(total, Number(end) || total));
    if (to - from < min) {
      if (from + min <= total) to = from + min;
      else from = Math.max(0, to - min);
    }
    return { start:from, end:to, duration:Math.max(0, to - from) };
  }

  function peakEnvelope(buffer, bins = 720) {
    const length = Math.max(0, Number(buffer?.length) || 0);
    const channels = Math.max(0, Number(buffer?.numberOfChannels) || 0);
    const count = Math.max(1, Math.min(Math.floor(Number(bins) || 720), length || 1));
    const peaks = new Float32Array(count);
    if (!length || !channels) return peaks;
    const block = Math.max(1, Math.ceil(length / count));
    for (let index = 0; index < count; index += 1) {
      const from = index * block;
      const to = Math.min(length, from + block);
      let peak = 0;
      for (let channel = 0; channel < channels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let frame = from; frame < to; frame += 1) peak = Math.max(peak, Math.abs(data[frame] || 0));
      }
      peaks[index] = peak;
    }
    return peaks;
  }

  function encodeTrimmedWav(buffer, start, end) {
    if (!buffer?.getChannelData || !buffer.sampleRate || !buffer.length) throw new Error('Decoded audio is required');
    const bounds = trimBounds(buffer.duration || buffer.length / buffer.sampleRate, start, end);
    const channels = Math.max(1, Number(buffer.numberOfChannels) || 1);
    const firstFrame = Math.max(0, Math.floor(bounds.start * buffer.sampleRate));
    const lastFrame = Math.min(buffer.length, Math.ceil(bounds.end * buffer.sampleRate));
    const frames = Math.max(1, lastFrame - firstFrame);
    const bytesPerSample = 2;
    const dataSize = frames * channels * bytesPerSample;
    const output = new ArrayBuffer(44 + dataSize);
    const view = new DataView(output);
    const write = (offset, text) => { for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index)); };
    write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE'); write(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, dataSize, true);
    const channelData = Array.from({length:channels}, (_, channel) => buffer.getChannelData(channel));
    let offset = 44;
    for (let frame = firstFrame; frame < lastFrame; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][frame] || 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += bytesPerSample;
      }
    }
    return new Blob([output], {type:'audio/wav'});
  }

  return { trimBounds, peakEnvelope, encodeTrimmedWav };
});
