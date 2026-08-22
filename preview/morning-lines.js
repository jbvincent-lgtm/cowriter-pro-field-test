(() => {
  'use strict';

  const STORAGE_KEY = 'cowriter-pro-morning-lines-0.4.0.3';
  const exercises = [
    {name:'Keep the hand moving', prompt:'Write without stopping or correcting. Follow the next true sentence, even when it changes direction.'},
    {name:'Object in the room', prompt:'Choose one ordinary object nearby. Describe it until it begins to carry a memory, a person or a place.'},
    {name:'I remember', prompt:'Begin every new thought with “I remember.” Specific details matter more than a complete story.'},
    {name:'First line, no song', prompt:'Write ten possible opening lines. Do not turn them into a song yet; let each one open a different door.'},
    {name:'Change one sense', prompt:'Write a scene through sound, touch, smell and taste. Leave sight until the final paragraph.'},
    {name:'What is unsaid', prompt:'Write a conversation in which neither person names the thing they are actually discussing.'}
  ];
  const $ = id => document.getElementById(id);
  let selectedMinutes = 5;
  let deadline = null;
  let timer = null;
  let saveTimer = null;
  let keyFeedbackTimer = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function save(extra = {}) {
    const prior = load();
    const value = {...prior,...extra,text:$('morningLinesEditor').value,exercise:Number($('morningLinesExercise').value)||0,minutes:selectedMinutes,updatedAt:new Date().toISOString()};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(value));
    $('morningLinesSaved').textContent = 'Saved locally';
  }

  function renderPrompt() {
    const exercise = exercises[Number($('morningLinesExercise').value)||0];
    $('morningLinesPrompt').textContent = exercise.prompt;
    $('morningLinesExerciseName').textContent = exercise.name;
  }

  function chooseMinutes(minutes) {
    selectedMinutes = minutes;
    document.querySelectorAll('.morning-lines-times button').forEach(button => button.classList.toggle('active',Number(button.dataset.minutes)===minutes));
    $('morningLinesTimer').textContent = `${String(minutes).padStart(2,'0')}:00`;
  }

  function updateCount() {
    const words = $('morningLinesEditor').value.trim().match(/\S+/g)?.length || 0;
    $('morningLinesWords').textContent = `${words} word${words===1?'':'s'}`;
    $('morningLinesSaved').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(),300);
    const editor=$('morningLinesEditor');
    editor.classList.add('key-strike');
    clearTimeout(keyFeedbackTimer);
    keyFeedbackTimer=setTimeout(()=>editor.classList.remove('key-strike'),70);
  }

  function tick() {
    const remaining = Math.max(0,deadline-Date.now());
    const seconds = Math.ceil(remaining/1000);
    $('morningLinesTimer').textContent = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    if (remaining<=0) {
      clearInterval(timer);timer=null;
      $('morningLinesTimer').textContent='Time';
      $('morningLines').classList.add('time-complete');
      save({completedAt:new Date().toISOString()});
    }
  }

  function begin() {
    $('morningLines').classList.remove('time-complete');
    $('morningLines').querySelector('.morning-lines-setup').classList.add('hidden');
    $('morningLines').querySelector('.morning-lines-desk').classList.remove('hidden');
    deadline=Date.now()+selectedMinutes*60000;
    clearInterval(timer);timer=setInterval(tick,250);tick();
    renderPrompt();save({startedAt:new Date().toISOString()});
    requestAnimationFrame(()=>$('morningLinesEditor').focus());
  }

  function open() {
    const saved=load();
    document.body.classList.add('morning-lines-open');
    $('morningLines').classList.remove('hidden');
    $('morningLinesExercise').value=String(saved.exercise||0);
    $('morningLinesEditor').value=saved.text||'';
    chooseMinutes(saved.minutes||5);renderPrompt();updateCount();
  }

  function close() {
    save();clearInterval(timer);timer=null;
    document.body.classList.remove('morning-lines-open');
    $('morningLines').classList.add('hidden');
  }

  function newPage() {
    if ($('morningLinesEditor').value.trim() && !confirm('Start a fresh exercise page? The current page will be replaced.')) return;
    clearInterval(timer);timer=null;deadline=null;
    $('morningLinesEditor').value='';updateCount();
    $('morningLines').classList.remove('time-complete');
    $('morningLines').querySelector('.morning-lines-desk').classList.add('hidden');
    $('morningLines').querySelector('.morning-lines-setup').classList.remove('hidden');
    save({startedAt:null,completedAt:null});
  }

  function init() {
    const select=$('morningLinesExercise');
    exercises.forEach((exercise,index)=>select.add(new Option(exercise.name,String(index))));
    select.onchange=renderPrompt;
    document.querySelectorAll('.morning-lines-times button').forEach(button=>button.onclick=()=>chooseMinutes(Number(button.dataset.minutes)));
    $('morningLinesBegin').onclick=begin;
    $('morningLinesClose').onclick=close;
    $('morningLinesNew').onclick=newPage;
    $('morningLinesEditor').oninput=updateCount;
    chooseMinutes(5);renderPrompt();
  }

  window.CoWriterMorningLines={init,open};
})();
