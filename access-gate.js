(() => {
  'use strict';

  const STORAGE_KEY='cowriter-field-access-0.4.0.5';
  const EXPECTED_HASH='df32c167c26f0bb6d123c59cd3c20e3ac7239de5cf21d497c8f7d83f7112f4db';
  const gate=document.getElementById('accessGate');
  const form=document.getElementById('accessGateForm');
  const input=document.getElementById('accessGateCode');
  const error=document.getElementById('accessGateError');

  function unlock(remember=false){
    if(remember)try{localStorage.setItem(STORAGE_KEY,'approved');}catch(_error){}
    gate.hidden=true;
    document.documentElement.classList.remove('access-locked');
  }

  async function digest(value){
    const bytes=new TextEncoder().encode(value.trim().toLowerCase());
    const result=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(result),byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  try{if(localStorage.getItem(STORAGE_KEY)==='approved'){unlock();return;}}catch(_error){}
  gate.hidden=false;
  requestAnimationFrame(()=>input.focus());
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    error.textContent='';
    const button=form.querySelector('button');
    button.disabled=true;
    try{
      if(await digest(input.value)===EXPECTED_HASH){unlock(true);return;}
      error.textContent='That access code is not recognised.';
      input.select();
    }catch(_error){error.textContent='This browser could not check the access code. Try updating Safari or Chrome.';}
    button.disabled=false;
  });
})();
