'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const initialText = `Сәлем, достар!\n\nБүгін сендермен бір ой бөліскім келеді.\n\nКейде алғашқы қадамды жасау үшін бәрінің мінсіз болғанын күтеміз. Дұрыс сәтті, дұрыс сөзді, жеткілікті сенімділікті.\n\nАл шын мәнінде, ең жақсы бастама — дәл қазір қолыңнан келетін кішкентай әрекет.\n\nТерең дем ал. Камераға қара. Асықпай сөйле.\n\nСенің ойың маңызды. Сенің дауысың естілуге лайық.\n\nБүгінгі шағын қадамың ертең үлкен өзгерістің бастауы болуы мүмкін.\n\nЕндеше, бастайық!`;
  const defaults = {speed:40,fontSize:42,textColor:'#f1f2eb',bgColor:'#171a16',mirror:false,guide:true,useCountdown:true,align:'left'};
  const palettes = {studio:['#f1f2eb','#171a16'],paper:['#242a20','#f4f1e7'],midnight:['#c9ddff','#101a2c'],contrast:['#eeff7a','#000000']};
  const storageKey = 'soile-studio-v1';
  let settings = {...defaults}, script = initialText, storageOK = true;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') {
      if (typeof saved.script === 'string') script = saved.script;
      const s = saved.settings || {};
      for (const k of ['speed','fontSize']) if (Number.isFinite(s[k])) settings[k] = Math.min(k === 'speed'?180:96,Math.max(k === 'speed'?10:24,s[k]));
      for (const k of ['textColor','bgColor']) if (/^#[\da-f]{6}$/i.test(s[k])) settings[k] = s[k];
      for (const k of ['mirror','guide','useCountdown']) if (typeof s[k] === 'boolean') settings[k] = s[k];
      if (s.align === 'center') settings.align = s.align;
    }
  } catch { storageOK = false; }
  let running = false, counting = false, countdownToken = 0, lastFrame = 0, elapsed = 0, position = 0, saveTimer, toastTimer, wakeLock;
  const viewport = $('scrollViewport');
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(()=>$('toast').hidden=true,3500); }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {localStorage.setItem(storageKey,JSON.stringify({script:$('script').value,settings})); storageOK=true; $('savedStatus').textContent='Құрылғыда сақталды';}
      catch {storageOK=false; $('savedStatus').textContent='Сақталмады — TXT жүктеңіз';}
    },300);
  }
  function stats() {
    const words = $('script').value.trim().split(/\s+/u).filter(Boolean).length;
    $('wordCount').textContent = `${words} сөз`;
    $('readTime').textContent = `~ ${Math.max(words?1:0,Math.ceil(words/130))} мин`;
    $('emptyPreview').hidden = words !== 0;
    $('playButton').disabled = words === 0;
  }
  function progress() {
    const max = Math.max(0,viewport.scrollHeight-viewport.clientHeight);
    const pct = max ? Math.min(100,viewport.scrollTop/max*100) : 0;
    $('progressFill').style.width = `${pct}%`;
    $('progressLabel').textContent = `${Math.floor(pct)}%`;
    const secs = Math.floor(elapsed/1000);
    $('elapsed').textContent = `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
  }
  function applySettings() {
    document.documentElement.style.setProperty('--reader-bg',settings.bgColor);
    document.documentElement.style.setProperty('--reader-text',settings.textColor);
    document.documentElement.style.setProperty('--font-size',`${settings.fontSize}px`);
    for (const k of ['speed','fontSize','textColor','bgColor']) $(k).value=settings[k];
    for (const k of ['mirror','guide','useCountdown']) $(k).checked=settings[k];
    $('speedValue').innerHTML=`${settings.speed} <small>px/с</small>`;
    $('fontValue').innerHTML=`${settings.fontSize} <small>px</small>`;
    for(const id of ['speed','fontSize']) {const el=$(id);el.style.setProperty('--fill',`${(el.value-el.min)/(el.max-el.min)*100}%`);}
    $('readingText').classList.toggle('mirrored',settings.mirror);
    $('readingText').style.textAlign=settings.align;
    $('readingGuide').hidden=!settings.guide;
    for(const align of ['left','center']) {const el=$(align==='left'?'alignLeft':'alignCenter');el.classList.toggle('selected',settings.align===align);el.setAttribute('aria-pressed',settings.align===align);}
    document.querySelectorAll('[data-theme]').forEach(el=>{const colors=palettes[el.dataset.theme];const selected=colors[0]===settings.textColor&&colors[1]===settings.bgColor;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',selected);});
    requestAnimationFrame(()=>{position=viewport.scrollTop;progress();});
  }
  function paintState(status) {
    $('playIcon').setAttribute('href',running?'#i-pause':'#i-play');
    $('playLabel').textContent=counting?'Болдырмау':running?'Кідірту':'Бастау';
    $('playStatus').textContent=status||(counting?'ДАЙЫНДАЛЫҢЫЗ':running?'ОҚЫЛЫП ЖАТЫР':'КІДІРТІЛДІ');
    $('statusDot').classList.toggle('active',running);
  }
  async function lockScreen() {try {if('wakeLock' in navigator) wakeLock=await navigator.wakeLock.request('screen');}catch{/* Screen wake lock is optional. */}}
  function pause(status) {
    running=false; counting=false; countdownToken++; $('countdown').hidden=true;
    if(wakeLock){wakeLock.release().catch(()=>{});wakeLock=null;}
    paintState(status);
  }
  function frame(now) {
    if(!running)return;
    const delta=Math.min(now-lastFrame,100);lastFrame=now;elapsed+=delta;
    position+=settings.speed*delta/1000;
    viewport.scrollTop=position;
    const max=viewport.scrollHeight-viewport.clientHeight;
    progress();
    if(position>=max){pause('ОҚУ АЯҚТАЛДЫ');toast('Керемет! Мәтін соңына жеттіңіз.');return;}
    requestAnimationFrame(frame);
  }
  async function togglePlay() {
    if(running||counting){pause();return;}
    if(!$('script').value.trim()){toast('Алдымен мәтін енгізіңіз.');return;}
    if(viewport.scrollTop>=viewport.scrollHeight-viewport.clientHeight-2){viewport.scrollTop=0;elapsed=0;}
    if(settings.useCountdown){
      counting=true; const token=++countdownToken;paintState();
      for(let i=3;i>0;i--){if(token!==countdownToken)return;$('countdown').hidden=false;$('countdown').textContent=i;await new Promise(resolve=>setTimeout(resolve,1000));}
      if(token!==countdownToken)return;
      counting=false;$('countdown').hidden=true;
    }
    running=true;position=viewport.scrollTop;lastFrame=performance.now();paintState();lockScreen();requestAnimationFrame(frame);
  }
  function reset() {pause('ОҚУҒА ДАЙЫН');elapsed=0;position=0;viewport.scrollTop=0;progress();}
  function syncFocus() {
    const active=document.body.classList.contains('focus-mode');
    $('previewFull').title=active?'Толық экраннан шығу (Esc)':'Толық экран';
    $('previewFull').setAttribute('aria-label',$('previewFull').title);
    requestAnimationFrame(()=>{position=viewport.scrollTop;progress();});
  }
  async function toggleFullscreen() {
    if(document.body.classList.contains('focus-mode')){
      if(document.fullscreenElement){try{await document.exitFullscreen();}catch{}}
      document.body.classList.remove('focus-mode');
    }else{
      document.body.classList.add('focus-mode');
      try{if($('prompter').requestFullscreen)await $('prompter').requestFullscreen();}catch{toast('Толық бет оқу режимі қосылды. Шығу үшін Esc басыңыз.');}
    }
    syncFocus();
  }
  $('script').value=script;$('readingText').textContent=script;stats();applySettings();paintState('ОҚУҒА ДАЙЫН');
  if(!storageOK)$('savedStatus').textContent='Автосақтау қолжетімсіз';
  $('script').addEventListener('input',()=>{reset();$('readingText').textContent=$('script').value;stats();save();});
  for(const k of ['speed','fontSize','textColor','bgColor']) $(k).addEventListener('input',()=>{settings[k]=['speed','fontSize'].includes(k)?Number($(k).value):$(k).value;applySettings();save();});
  for(const k of ['mirror','guide','useCountdown']) $(k).addEventListener('change',()=>{settings[k]=$(k).checked;applySettings();save();});
  for(const align of ['left','center']) $(align==='left'?'alignLeft':'alignCenter').addEventListener('click',()=>{settings.align=align;applySettings();save();});
  document.querySelectorAll('[data-theme]').forEach(el=>el.addEventListener('click',()=>{[settings.textColor,settings.bgColor]=palettes[el.dataset.theme];applySettings();save();}));
  $('resetSettings').addEventListener('click',()=>{settings={...defaults};applySettings();save();toast('Баптаулар қалпына келтірілді.');});
  $('playButton').addEventListener('click',togglePlay);$('resetButton').addEventListener('click',reset);
  $('focusButton').addEventListener('click',toggleFullscreen);$('previewFull').addEventListener('click',toggleFullscreen);
  document.addEventListener('fullscreenchange',()=>{document.body.classList.toggle('focus-mode',Boolean(document.fullscreenElement));syncFocus();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(running||counting))pause('КІДІРТІЛДІ');});
  viewport.addEventListener('scroll',()=>{if(!running)position=viewport.scrollTop;progress();},{passive:true});
  viewport.addEventListener('wheel',()=>{if(running||counting)pause();},{passive:true});
  viewport.addEventListener('touchstart',()=>{if(running||counting)pause();},{passive:true});
  window.addEventListener('resize',()=>requestAnimationFrame(()=>{position=viewport.scrollTop;progress();}));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.body.classList.contains('focus-mode')&&!document.fullscreenElement){document.body.classList.remove('focus-mode');syncFocus();return;}
    if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,select,[contenteditable="true"]')||$('helpDialog').open)return;
    if(event.code==='Space'&&event.target.closest('button'))return;
    if(event.repeat&&['Space','KeyF','KeyR'].includes(event.code))return;
    if(event.code==='Space'){event.preventDefault();togglePlay();}
    else if(event.code==='KeyF'){event.preventDefault();toggleFullscreen();}
    else if(event.code==='KeyR'){event.preventDefault();reset();}
    else if(['ArrowUp','ArrowDown'].includes(event.code)){event.preventDefault();settings.speed=Math.min(180,Math.max(10,settings.speed+(event.code==='ArrowUp'?5:-5)));applySettings();save();}
  });
  $('importButton').addEventListener('click',()=>$('fileInput').click());
  $('fileInput').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    if(file.size>2*1024*1024){toast('2 МБ-тан кіші TXT файлын таңдаңыз.');event.target.value='';return;}
    try{$('script').value=await file.text();$('script').dispatchEvent(new Event('input'));toast('Мәтін ашылды.');}catch{toast('Файлды ашу мүмкін болмады.');}
    event.target.value='';
  });
  $('exportButton').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([$('script').value],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='soile-script.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('TXT файлы сақталды.');
  });
  $('helpButton').addEventListener('click',()=>{if(running||counting)pause();$('helpDialog').showModal();});
  $('closeHelp').addEventListener('click',()=>$('helpDialog').close());
  $('helpDialog').addEventListener('click',event=>{if(event.target===$('helpDialog')){const b=$('helpDialog').getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)$('helpDialog').close();}});
})();
