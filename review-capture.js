(() => {
  'use strict';

  const VERSION = '0.4.0.5';
  const encoder = new TextEncoder();
  const now = () => new Date().toISOString();
  const clone = value => JSON.parse(JSON.stringify(value));
  const safe = value => String(value ?? '').replace(/[<>]/g, character => character === '<' ? '&lt;' : '&gt;');

  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  }

  function zipStore(files) {
    const chunks = [];
    const directory = [];
    let offset = 0;
    const u16 = value => [value & 255, value >>> 8 & 255];
    const u32 = value => [value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255];
    Object.entries(files).forEach(([name, source]) => {
      const filename = encoder.encode(name);
      const data = source instanceof Uint8Array ? source : encoder.encode(String(source));
      const crc = crc32(data);
      const local = new Uint8Array([80,75,3,4,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(filename.length),0,0,...filename]);
      chunks.push(local, data);
      const central = new Uint8Array([80,75,1,2,20,0,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(filename.length),0,0,0,0,0,0,0,0,0,0,...u32(offset),...filename]);
      directory.push(central);
      offset += local.length + data.length;
    });
    const directorySize = directory.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array([80,75,5,6,0,0,0,0,...u16(directory.length),...u16(directory.length),...u32(directorySize),...u32(offset),0,0]);
    return new Blob([...chunks, ...directory, end], {type:'application/zip'});
  }

  function dataUrlBytes(url) {
    const binary = atob(url.split(',')[1]);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function create(options) {
    let session = null;
    let stream = null;
    let sequence = 0;
    const originalConsole = {};

    const panel = document.createElement('div');
    panel.className = 'review-capture no-print';
    panel.innerHTML = '<button class="review-start">Start review</button><div class="review-active hidden"><span><i></i><b>Review</b> <small>0 captures</small></span><button class="review-shot">Capture</button><button class="review-issue">Mark issue</button><button class="review-export">Export ZIP</button><button class="review-stop" aria-label="Stop review">×</button></div>';
    document.body.append(panel);
    const startButton = panel.querySelector('.review-start');
    const active = panel.querySelector('.review-active');
    const count = panel.querySelector('small');

    function context() {
      return options.getContext?.() || {};
    }

    function record(type, detail = {}) {
      if (!session) return;
      session.workflow.push({sequence:++sequence, at:now(), elapsedMs:Date.now() - session.startedMs, type, context:context(), ...detail});
    }

    function interceptConsole() {
      ['error','warn'].forEach(level => {
        originalConsole[level] = console[level];
        console[level] = (...args) => {
          session?.console.push({at:now(), level, message:args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')});
          originalConsole[level](...args);
        };
      });
      window.addEventListener('error', onWindowError);
      window.addEventListener('unhandledrejection', onRejection);
    }

    function restoreConsole() {
      Object.entries(originalConsole).forEach(([level, method]) => { console[level] = method; });
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onRejection);
    }

    function onWindowError(event) { session?.console.push({at:now(), level:'error', message:event.message, source:event.filename, line:event.lineno}); }
    function onRejection(event) { session?.console.push({at:now(), level:'error', message:`Unhandled rejection: ${String(event.reason)}`}); }

    async function start() {
      session = {id:`review-${Date.now()}`, version:VERSION, startedAt:now(), startedMs:Date.now(), browser:{userAgent:navigator.userAgent, language:navigator.language, platform:navigator.platform, viewport:{width:innerWidth,height:innerHeight,devicePixelRatio}}, workflow:[], issues:[], screenshots:[], states:[], console:[]};
      sequence = 0;
      interceptConsole();
      startButton.classList.add('hidden');
      active.classList.remove('hidden');
      record('session-start');
      try {
        if (navigator.mediaDevices?.getDisplayMedia) {
          stream = await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:false});
          record('screen-source-ready');
        } else record('screen-source-unavailable');
      } catch (error) {
        record('screen-source-declined', {message:error.message});
      }
    }

    function stateSnapshot(label) {
      const filename = `${String(session.states.length + 1).padStart(3,'0')}-${label}.json`;
      session.states.push({filename, at:now(), data:clone(options.getState?.() || {})});
      return filename;
    }

    async function capture(label = 'capture') {
      if (!session) return;
      const cleanLabel = label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'capture';
      const stateFile = stateSnapshot(cleanLabel);
      if (!stream?.active) {
        record('capture-missed', {reason:'No shared screen source', stateFile});
        options.notify?.('State captured. Share this browser window to include screenshots.');
        return null;
      }
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video,0,0);
      video.pause();
      video.srcObject = null;
      const filename = `${String(session.screenshots.length + 1).padStart(3,'0')}-${cleanLabel}.png`;
      session.screenshots.push({filename, at:now(), context:context(), dataUrl:canvas.toDataURL('image/png'), stateFile});
      count.textContent = `${session.screenshots.length} capture${session.screenshots.length === 1 ? '' : 's'}`;
      record('screenshot', {filename, stateFile, label});
      options.notify?.('Review screenshot captured');
      return filename;
    }

    async function markIssue() {
      if (!session) return;
      const note = prompt('What needs attention?');
      if (!note?.trim()) return;
      const screenshot = await capture(`issue-${session.issues.length + 1}`);
      const issue = {id:`issue-${session.issues.length + 1}`, at:now(), note:note.trim(), context:context(), screenshot, stateFile:session.states.at(-1)?.filename || null};
      session.issues.push(issue);
      record('issue-marked', {issueId:issue.id, note:issue.note});
      options.notify?.('Issue marked');
    }

    function reviewHtml() {
      const shots = session.screenshots.map(item => `<article><h2>${safe(item.filename)}</h2><p>${safe(item.context.page || '')} · ${safe(item.context.view || '')} · ${safe(item.context.songTitle || '')}</p><img src="screenshots/${safe(item.filename)}" alt="${safe(item.filename)}"></article>`).join('');
      const issues = session.issues.map(item => `<li><strong>${safe(item.id)}</strong> ${safe(item.note)} <small>${safe(item.context.view || '')}</small></li>`).join('') || '<li>No issues marked.</li>';
      return `<!doctype html><meta charset="utf-8"><title>Co-Writer Pro review</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 24px;color:#25251f}img{max-width:100%;border:1px solid #ccc}article{margin:40px 0}small{color:#666}</style><h1>Co-Writer Pro review</h1><p>${safe(session.startedAt)} · ${session.screenshots.length} screenshots · ${session.issues.length} issues</p><h2>Issues</h2><ol>${issues}</ol>${shots}`;
    }

    function exportZip() {
      if (!session) return;
      record('session-export');
      const endedAt = now();
      const files = {
        'review.html':reviewHtml(),
        'summary.md':`# Co-Writer Pro Review\n\n- Version: ${VERSION}\n- Started: ${session.startedAt}\n- Exported: ${endedAt}\n- Screenshots: ${session.screenshots.length}\n- Issues: ${session.issues.length}\n- Workflow events: ${session.workflow.length}\n- Console warnings/errors: ${session.console.length}\n`,
        'workflow.json':JSON.stringify(session.workflow,null,2),
        'issues.json':JSON.stringify(session.issues,null,2),
        'console-log.txt':session.console.map(item => `[${item.at}] ${item.level.toUpperCase()} ${item.message}`).join('\n') || 'No console warnings or errors captured.\n'
      };
      session.states.forEach(item => { files[`states/${item.filename}`] = JSON.stringify(item.data,null,2); });
      session.screenshots.forEach(item => { files[`screenshots/${item.filename}`] = dataUrlBytes(item.dataUrl); });
      const url = URL.createObjectURL(zipStore(files));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cowriter-review-session.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url),1000);
      options.notify?.('Review ZIP exported');
    }

    function stop() {
      if (!session || !confirm('Stop this review session? Export first if you want to keep it.')) return;
      record('session-stop');
      restoreConsole();
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      session = null;
      active.classList.add('hidden');
      startButton.classList.remove('hidden');
      count.textContent = '0 captures';
    }

    document.addEventListener('click', event => {
      if (!session || event.target.closest('.review-capture')) return;
      const target = event.target.closest('button,a,[role="button"]');
      if (target) record('action', {label:(target.getAttribute('aria-label') || target.title || target.textContent || '').trim().replace(/\s+/g,' ').slice(0,120)});
    }, true);
    startButton.onclick = start;
    panel.querySelector('.review-shot').onclick = () => capture(context().view || context().page || 'capture');
    panel.querySelector('.review-issue').onclick = markIssue;
    panel.querySelector('.review-export').onclick = exportZip;
    panel.querySelector('.review-stop').onclick = stop;
    return {record};
  }

  window.CoWriterReviewCapture = {create, zipStore, crc32};
})();
