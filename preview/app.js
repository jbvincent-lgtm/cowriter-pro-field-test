(() => {
  'use strict';

  const CE = window.ChordEngine;
  const SE = window.StructureEngine;
  const UE = window.UtilityEngine;
  const NE = window.NotebookEngine;
  const ATE = window.AudioTrimEngine;
  const MWE = window.MobileWriteEngine;
  const SD = window.CoWriterSandboxData;
  const FE = window.CoWriterFieldExchange;

  const RELEASE_CHANNEL = document.documentElement.dataset.releaseChannel || 'stable';
  const DB_NAME = RELEASE_CHANNEL === 'stable' ? 'cowriter-pro-01' : `cowriter-pro-01-${RELEASE_CHANNEL}`;
  const DB_VERSION = 2;
  const STORE = 'app';
  const AUDIO_STORE = 'audio';
  const STATE_KEY = 'state';
  const DEMO_SESSION_KEY = `cowriter-pro-demo-0.4.0.12${RELEASE_CHANNEL === 'stable' ? '' : `-${RELEASE_CHANNEL}`}`;
  const KEYS = ['C','C#','Db','D','Eb','E','F','F#','Gb','G','Ab','A','Bb','B','Cm','C#m','Dm','Ebm','Em','Fm','F#m','Gm','Abm','Am','Bbm','Bm'];
  const SECTION_TYPES = ['Verse','Pre-Chorus','Chorus','Bridge','Refrain','Tag','Intro','Outro','Instrumental','Custom'];
  const STAGE_OPTIONS = [['idea','Idea'],['writing','Writing'],['draft','Draft'],['finished','Finished']];
  const BUILTIN_TUNINGS = ['Standard','E♭ Standard','D Standard','Drop D','Double Drop D','DADGAD','Open D','Open G','Open Em7 / G6','C Modal'];
  const SHAPE_SECTION_HEADER = 38;
  const SONG_VIEW_ORDER = ['plan','write','shape','chart'];

  const $ = id => document.getElementById(id);
  const els = Object.fromEntries([
    'app','appNav','appNavBrand','appNavHome','appNavIdeas','appNavSongs','appNavNewIdea','appNavMore','welcomePage','welcomeContinueCard','welcomeContinueTitle','welcomeContinueMeta','welcomeContinue','welcomeCapture','welcomeIdeaInput','welcomeIdeaSave','welcomeIdeaStatus','welcomeRecentIdeas','welcomeRecentSongs','welcomeNewIdea','welcomeIdeas','welcomeNewSong','welcomeLibrary','welcomeGetStarted','welcomeMainActions','welcomeQuietActions','welcomeMorningLines','welcomeRecordIdea','welcomeMore','welcomeInstall','welcomeConnection','welcomeDemo','welcomeImport','ideasPage','ideasHome','ideasSongs','ideasNew','ideaSearch','ideaFilters','ideaList','sidebar','libraryHome','libraryMenu','collapseSidebar','expandSidebar','homeButton','mainShell','newSong','emptyNewSong','emptyOpenLibrary','songSearch','songList','libraryFilters','libraryTools','libraryFilterButton','librarySortButton','projectsPanel','projectList','newProject','loadDemo','importBackup','exportBackup','backupFile',
    'saveState','fieldStatus','modeNav','undoButton','redoButton','songNewIdea','themeToggle','shortcutsButton','songMenu','emptyState','workspace','songTitle','songContext','utilityToolbar','viewHost',
    'workbench','workbenchResize','workbenchSubtitle','closeWorkbench','workbenchTabs','workbenchBody','alternativesTray','alternativesTrayContext','alternativesTrayBody','closeAlternativesTray','demoGuide','demoGuideProgress','demoGuideBody','closeDemoGuide','demoGuideExit','demoGuideBack','demoGuideNext','recordingTransport','toast','overlayLayer'
  ].map(id => [id, $(id)]));

  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const now = () => new Date().toISOString();
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

  let db;
  let state;
  let saveTimer;
  let toastTimer;
  let undoStack = [];
  let redoStack = [];
  let activeLineId = null;
  let activeSectionId = null;
  let activeChordId = null;
  let selectedChordIds = new Set();
  let activeChordLineId = null;
  let pendingChordAnchor = null;
  let activeEditor = null;
  let lastEditorBlurAt = 0;
  let keyboardNavigation = false;
  let dragData = null;
  let selectionBar = null;
  let resizeStart = null;
  let shapeSelection = new Set();
  let shapeInteraction = null;
  let spaceHeld = false;
  let transientPanel = null;
  let shapeEditingKey = null;
  let demoSession = null;
  let activeProgressionToken = null;
  let shapeAutoPanFrame = null;
  let chordClipboard = [];
  let progressionClipboard = '';
  let mediaRecorder = null;
  let recordingStream = null;
  let recordingChunks = [];
  let recordingStartedAt = 0;
  let recordingPausedAt = 0;
  let recordingPausedMs = 0;
  let recordingTimer = null;
  let recordingTarget = null;
  let studioLogUrls = [];
  let ideaAudioUrls = [];
  let deferredInstallPrompt = null;
  let demoTourTimer = null;
  let mobileTouchDrag = null;
  let mobileTouchSuppressClick = null;
  let mobileShapeExpandedSectionId = null;
  let reviewCaptureController = null;

  function defaultState() {
    return {
      schemaVersion: 14,
      shellPage: 'welcome',
      selectedSongId: null,
      filter: 'active',
      libraryStageFilter: 'all',
      libraryProjectFilter: 'all',
      libraryTuningFilter: 'all',
      librarySort: 'edited',
      projects: [],
      customTunings: [],
      view: 'plan',
      theme: 'light',
      sidebarCollapsed: false,
      workbenchOpen: false,
      workbenchTab: 'words',
      alternativesTrayOpen: false,
      workbenchWidth: 370,
      alternativeScope: 'current',
      chordDisplay: 'shapes',
      chartMode: 'shapes',
      focusMode: false,
      chartFontSize: 16,
      onboardingComplete: false,
      shapeTool: 'select',
      songs: [],
      ideas: [],
      ideaFilter: 'recent',
      unattachedTakes: [],
      fieldProfile: {name:''},
      deletedSongs: []
    };
  }

  function createLine(text = '', kind = 'lyric', key = 'G') {
    if (kind === 'progression') return { id:uid('line'), text:String(text||''), kind, chords:[], syllableOverride:null, attention:false, style:{}, shape:null };
    const parsed = NE.parseBracketLine(String(text||''), key, () => uid('chord'));
    return { id:uid('line'), text:parsed.text, kind:'lyric', chords:parsed.chords, anchorModel:'single-slot-v1', syllableOverride:null, attention:false, style:{}, shape:null };
  }

  function createSection(label = 'Verse', lines = [], x = 180, y = 150) {
    return { id:uid('section'), label, lines, collapsed:false, keyOverride:null, shape:{x,y,w:340,h:270} };
  }

  function createBlock(type = 'fragment', text = '', x = 150, y = 120, chords = []) {
    const value=String(text||'');const longest=value.split('\n').reduce((max,line)=>Math.max(max,line.length),0);
    return { id:uid('block'), type, text:value, chords:NE.normaliseChords(chords,value.length), x,y,w:clamp(132+longest*4.1,180,340),h:clamp(72+Math.ceil(Math.max(value.length,1)/34)*20,88,220), createdAt:now() };
  }

  function createSong(title = 'Untitled Song') {
    const createdAt = now();
    const profile = { id:uid('profile'), name:'Standard chart', shapeKey:'G', capo:0, tuning:'Standard', keepMode:'sounding', showSounding:false, showNashville:false, showHarmonica:false };
    return {
      id:uid('song'), title, libraryStatus:'active', stage:'idea', favourite:false, projectIds:[],
      key:'G', spelling:'auto', tuning:'Standard', tuningNote:'', recentChords:[],
      plan:{brainDump:''}, shapeBlocks:[], sections:[], alternatives:[], versions:[], writers:[],
      chartProfiles:[profile], activeProfileId:profile.id,
      createdAt, updatedAt:createdAt, lastView:'plan', viewMemory:{},
      shapeView:{panX:80,panY:55,zoom:1},
      workbench:{progression:'| 1 | 5/7 | 6m | 4 |'},
      timeline:[], takes:[], exchangeHistory:[], sourceSongId:null, ideaLinks:[],
      format:{fontFamily:'serif',textColor:'ink',fontSize:19,lineHeight:1.65,pageWidth:980},
      chartLayout:{fontFamily:'song',pageSize:'a4',orientation:'portrait',margin:'normal',columns:1,sectionSpacing:'normal',lineSpacing:'normal',showMeta:true}
    };
  }

  function createIdea(text = '', takeIds = []) {
    const createdAt = now();
    return {id:uid('idea'),text:String(text||''),takeIds:[...new Set(takeIds)],createdAt,updatedAt:createdAt,favourite:false,usedInSongIds:[]};
  }

  function demoSong(stage = 'draft') {
    const song = createSong('The Last Light On');
    song.isDemo = true;
    song.demoStage = stage;
    song.stage = stage === 'idea' ? 'idea' : stage === 'chart-ready' ? 'finished' : 'draft';
    song.key = 'G';
    song.plan.brainDump = `Sunday night at the old house after everyone has gone. The relationship is already over, but the porch light is still burning as though somebody might come back.

The gravel after rain. Dad's ute disappearing at the corner. A mug left beside the sink. The key still under the blue pot.

Possible title: The Last Light On / Leave the Hallway Burning.

Maybe the chorus does not explain the breakup. It only notices the light, the empty rooms and how habit survives the people who made it.

G – D/F# – Em7 – Cadd9. Keep the verse conversational. Let the bridge lift somewhere brighter and make that brightness hurt.`;

    const porch = createBlock('fragment','The porch light stayed on after everybody left',760,170);
    porch.demoKey = 'porch-light';
    const gravel = createBlock('fragment','Your tyres wrote a river through the gravel',1040,360);
    gravel.demoKey = 'gravel-line';
    const phone = createBlock('fragment','The bridge could be the phone call neither of us makes',590,520);
    phone.demoKey = 'bridge-thought';
    const title = createBlock('title','Leave the Hallway Burning',1110,130);
    title.demoKey = 'title-option';
    const progression = createBlock('harmony','| G | D/F# | Em7 | Cadd9 |',840,650);
    progression.demoKey = 'progression';
    song.shapeBlocks = [porch,gravel,phone,title,progression];

    const verse1 = createSection('Verse 1',[
      createLine('[G]Rain on the bonnet, [D/F#]keys in your hand','lyric','G'),
      createLine('[Em7]Half of a sentence we [Cadd9]both understand','lyric','G'),
      createLine('[G]You watched the driveway, I [D]watched the clock','lyric','G'),
      createLine('Like one of us might find the courage to stop','lyric','G')
    ],170,150);
    verse1.demoKey='verse-1';
    const chorus = createSection('Chorus',[
      createLine('[Cadd9]Leave the last light [G]on','lyric','G'),
      createLine('[Em7]Long after everyone is [D]gone','lyric','G'),
      createLine('[C]Habit keeps a house a[G]live','lyric','G'),
      createLine('[Am7]Even when the people [D]don’t','lyric','G')
    ],180,570);
    chorus.demoKey='chorus';
    chorus.lines[1].demoKey='alternative-target';
    const verse2 = createSection('Verse 2',[
      createLine('[G]Your coffee cup was [D/F#]waiting by the sink','lyric','G'),
      createLine('[Em7]I left it there because I [Cadd9]didn’t want to think','lyric','G'),
      createLine('','lyric','G')
    ],590,180);
    verse2.demoKey='verse-2';
    verse2.lines[2].demoKey='blank-demo-row';

    song.sections = stage === 'idea' ? [chorus] : [verse1,chorus,verse2];

    if (stage === 'chart-ready') {
      verse2.lines[2] = createLine('[G]The key beneath the [D/F#]flowerpot stayed dry','lyric','G');
      verse2.lines.push(createLine('[Em7]Some doors keep their promises [Cadd9]after goodbye','lyric','G'));
      const bridge = createSection('Bridge',[
        createLine('[A]Morning made the hallway [E/G#]gold','lyric','A'),
        createLine('[F#m7]Nothing in the house was [Dadd9]ours to hold','lyric','A'),
        createLine('| A | E/G# | F#m7 | Dadd9 |','progression','A')
      ],600,610);
      bridge.keyOverride='A'; bridge.demoKey='bridge';
      song.sections.push(bridge);
    }

    const target = chorus.lines[1];
    song.alternatives = [
      {id:uid('alt'),type:'lyric',targetType:'line',targetId:target.id,label:'Earlier chorus wording',content:{line:{text:'Burning when there’s nobody home',kind:'lyric',chords:NE.parseBracketLine('[Em7]Burning when there’s nobody [D]home','G',()=>uid('chord')).chords,style:{}}},createdAt:now()},
      {id:uid('alt'),type:'title',targetType:'song',targetId:song.id,label:'Title alternative',content:{text:'Leave the Hallway Burning'},createdAt:now()},
      {id:uid('alt'),type:'harmony',targetType:'section',targetId:chorus.id,label:'Chorus progression alternative',content:{section:{...clone(chorus),lines:chorus.lines.map(line=>clone(line))}},createdAt:now()}
    ];
    const firstChord=chorus.lines[0].chords[0];
    if(firstChord) song.alternatives.push({id:uid('alt'),type:'harmony',targetType:'chord',targetId:firstChord.id,parentLineId:chorus.lines[0].id,label:'Chord alternative',content:{chord:{value:'Am7',anchor:firstChord.anchor}},createdAt:now()});
    song.versions = [
      {id:uid('version'),name:'Chorus found',createdAt:new Date(Date.now()-86400000).toISOString(),snapshot:snapshotSong(song)}
    ];
    song.writers=[{id:uid('writer'),name:'Demo Writer',ipi:'',pro:'APRA AMCOS',role:'Music & lyrics'}];
    song.chartProfiles=[{id:uid('profile'),name:'D shapes · capo 5',shapeKey:'D',capo:5,tuning:'Standard'}];
    song.activeProfileId=song.chartProfiles[0].id;
    song.lastView=stage==='idea'?'plan':stage==='chart-ready'?'chart':'write';
    return normaliseSong(song);
  }

  const DEMO_STEPS = [
    {view:'plan',mode:'Plan',title:'Catch one thought',copy:'Plan is the loose page. Nothing needs to be arranged or finished yet.',task:'Click in the page and add or change one sentence.',target:'.brain-dump'},
    {view:'write',mode:'Write',title:'Join words and chords',copy:'Write keeps the lyric readable while harmony stays attached to the words.',task:'Use the blank Verse 2 row, type a line, then add a chord above a word.',target:'[data-demo-key="blank-demo-row"]'},
    {view:'shape',mode:'Shape',title:'Move the pieces',copy:'Shape is the optional overview for arranging sections and loose lines when the form needs room.',task:'Drag “The porch light stayed on…” to a place that feels right.',target:'[data-demo-key="porch-light"]'},
    {view:'chart',mode:'Chart',title:'See the playing copy',copy:'Chart removes the working tools and prepares a clean hand-off.',task:'Try chord names, Nashville numbers or lyrics-only, then open Export.',target:'.chart-page'}
  ];

  function openDatabase() {
    return new Promise((resolve,reject) => {
      const request = indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
        if (!database.objectStoreNames.contains(AUDIO_STORE)) database.createObjectStore(AUDIO_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function dbGet(key) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function dbSet(key,value) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(value,key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function audioGet(key) {
    return new Promise((resolve,reject) => {
      const tx=db.transaction(AUDIO_STORE,'readonly');const request=tx.objectStore(AUDIO_STORE).get(key);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
  }

  function audioSet(key,value) {
    return new Promise((resolve,reject) => {
      const tx=db.transaction(AUDIO_STORE,'readwrite');tx.objectStore(AUDIO_STORE).put(value,key);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }

  function audioDelete(key) {
    return new Promise((resolve,reject) => {
      const tx=db.transaction(AUDIO_STORE,'readwrite');tx.objectStore(AUDIO_STORE).delete(key);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }

  function normaliseLine(line, songKey) {
    const item = line && typeof line === 'object' ? line : createLine('', 'lyric', songKey);
    item.id ||= uid('line');
    item.kind ||= looksLikeProgression(item.text) ? 'progression' : 'lyric';
    item.text = String(item.text || '');
    item.style = item.style && typeof item.style === 'object' ? item.style : {};
    item.syllableOverride ??= null;
    item.attention = Boolean(item.attention);
    item.shape = item.shape && typeof item.shape === 'object' ? item.shape : null;
    if (item.kind === 'lyric') {
      const repairAnchors = item.anchorModel !== 'single-slot-v1';
      if (!Array.isArray(item.chords)) {
        const parsed = NE.parseBracketLine(item.text,songKey,() => uid('chord'));
        item.text = parsed.text;
        item.chords = parsed.chords;
      } else {
        if (/\[[^\]]+\]/.test(item.text)) {
          const parsed = NE.parseBracketLine(item.text,songKey,() => uid('chord'));
          item.text = parsed.text;
          item.chords = [...NE.normaliseChords(item.chords,item.text.length),...parsed.chords];
        }
        item.chords = NE.normaliseChords(item.chords,item.text.length);
      }
      if (repairAnchors) item.chords = NE.repairLegacyChordStacks(item.chords,item.text.length);
      item.anchorModel = 'single-slot-v1';
    } else item.chords = [];
    return item;
  }

  function ensureSectionLineShapes(section) {
    const usableWidth = Math.max(180,Number(section.shape?.w||340)-24);
    section.lines.forEach((line,index) => {
      const fallback = {x:12,y:10+index*68,w:usableWidth,h:line.kind==='progression'?52:58};
      line.shape = {...fallback,...(line.shape || {})};
      line.shape.x = Number.isFinite(Number(line.shape.x)) ? Number(line.shape.x) : fallback.x;
      line.shape.y = Number.isFinite(Number(line.shape.y)) ? Number(line.shape.y) : fallback.y;
      line.shape.w = Math.max(150,Number(line.shape.w)||fallback.w);
      line.shape.h = Math.max(42,Number(line.shape.h)||fallback.h);
    });
    expandSectionToContents(section);
  }

  function expandSectionToContents(section) {
    if (!section?.shape) return;
    const right = section.lines.reduce((max,line)=>Math.max(max,(line.shape?.x||0)+(line.shape?.w||220)),0);
    const bottom = section.lines.reduce((max,line)=>Math.max(max,(line.shape?.y||0)+(line.shape?.h||54)),0);
    section.shape.w = Math.max(Number(section.shape.w)||340,right+20,260);
    section.shape.h = Math.max(Number(section.shape.h)||180,SHAPE_SECTION_HEADER+bottom+18,150);
  }

  function sortSectionLinesByShape(section) {
    section.lines.sort((a,b)=>((a.shape?.y||0)-(b.shape?.y||0))||((a.shape?.x||0)-(b.shape?.x||0)));
  }

  function normaliseAlternative(alt,song) {
    const item = alt && typeof alt === 'object' ? alt : {};
    item.id ||= uid('alt');
    item.type ||= 'lyric';
    item.targetType ||= 'line';
    item.targetId ||= song.id;
    item.label ||= 'Alternative';
    item.content ||= {};
    item.createdAt ||= now();
    if (item.targetType === 'line' && item.content.text !== undefined && !item.content.line) {
      const target = findLine(song,item.targetId)?.line;
      const parsed = NE.parseBracketLine(item.content.text,song.key,() => uid('chord'));
      item.content.line = { text:parsed.text, chords:parsed.chords, kind:target?.kind || 'lyric', style:{} };
      delete item.content.text;
    }
    return item;
  }

  function normaliseSong(raw) {
    const song = raw && typeof raw === 'object' ? raw : createSong();
    song.id ||= uid('song'); song.title ||= 'Untitled Song'; song.libraryStatus ||= song.status || 'active';
    song.stage ||= song.libraryStatus === 'finished' ? 'finished' : ((song.sections || []).length ? 'draft' : 'idea');
    if (song.stage === 'seed') song.stage = 'idea';
    if (song.stage === 'developing') song.stage = 'writing';
    if (!STAGE_OPTIONS.some(([value])=>value===song.stage)) song.stage='idea';
    song.projectIds = Array.isArray(song.projectIds) ? [...new Set(song.projectIds)] : [];
    song.key ||= 'G'; song.spelling ||= 'auto'; song.tuning ||= 'Standard'; song.tuningNote ||= '';
    song.recentChords = Array.isArray(song.recentChords) ? song.recentChords.slice(0,12) : [];
    song.createdAt ||= now(); song.updatedAt ||= song.createdAt; song.favourite = Boolean(song.favourite);
    const oldWorkbench = song.workbench && typeof song.workbench === 'object' ? song.workbench : {};
    song.plan = song.plan && typeof song.plan === 'object' ? song.plan : {};
    song.plan.brainDump = song.plan.brainDump ?? oldWorkbench.brainDump ?? song.notes ?? '';
    song.shapeBlocks = Array.isArray(song.shapeBlocks) ? song.shapeBlocks : [];
    if (!song.shapeBlocks.length && Array.isArray(oldWorkbench.spareParts)) {
      song.shapeBlocks = oldWorkbench.spareParts.map((part,index) => createBlock(part.type === 'Chord' ? 'harmony' : part.type === 'Title' ? 'title' : 'fragment',part.text || '',150+(index%3)*260,120+Math.floor(index/3)*170));
    }
    song.shapeBlocks = NE.positionDefaults(song.shapeBlocks.map(block => {
      block.id ||= uid('block');
      if (['lyric','image','question','plan','note'].includes(block.type)) block.type = 'fragment';
      block.type ||= 'fragment'; block.text = String(block.text || ''); block.createdAt ||= now();
      block.chords = NE.normaliseChords(block.chords || [],block.text.length);
      return block;
    }),150,120,4);
    song.sections = Array.isArray(song.sections) ? song.sections : [];
    song.sections.forEach((section,index) => {
      section.id ||= uid('section'); section.label ||= 'Section'; section.collapsed = Boolean(section.collapsed); section.keyOverride ||= null;
      section.lines = Array.isArray(section.lines) ? section.lines.map(line => normaliseLine(line,section.keyOverride || song.key)) : [];
      section.shape = {x:170+(index%3)*390,y:150+Math.floor(index/3)*390,w:340,h:270,...(section.shape || {})};
      ensureSectionLineShapes(section);
    });
    song.alternatives = Array.isArray(song.alternatives) ? song.alternatives : [];
    if (Array.isArray(song.harmonyAlternatives)) {
      song.harmonyAlternatives.forEach(item => song.alternatives.push({id:item.id||uid('alt'),type:'harmony',targetType:'song',targetId:song.id,label:item.name||'Harmony alternative',content:{harmony:item.harmony},createdAt:item.createdAt||now()}));
      delete song.harmonyAlternatives;
    }
    song.alternatives = song.alternatives.map(alt => normaliseAlternative(alt,song));
    song.versions = Array.isArray(song.versions) ? song.versions : [];
    song.writers = Array.isArray(song.writers) ? song.writers : [];
    song.chartProfiles = Array.isArray(song.chartProfiles) && song.chartProfiles.length ? song.chartProfiles : [{id:uid('profile'),name:'Standard chart',shapeKey:song.shapeKey||song.key,capo:Number(song.capo||0),tuning:song.tuning||'Standard'}];
    song.chartProfiles.forEach(profile => {
      profile.id ||= uid('profile'); profile.name ||= 'Chart profile'; profile.shapeKey ||= song.key;
      profile.capo = Number(profile.capo || 0); profile.tuning ||= song.tuning || 'Standard'; profile.keepMode ||= 'sounding';
      profile.showSounding=Boolean(profile.showSounding);profile.showNashville=Boolean(profile.showNashville);profile.showHarmonica=Boolean(profile.showHarmonica);
    });
    song.activeProfileId ||= song.chartProfiles[0]?.id || null;
    song.shapeView = {panX:80,panY:55,zoom:1,selection:[],...(song.shapeView || {})};
    song.shapeView.zoom = clamp(Number(song.shapeView.zoom)||1,.35,2.25);
    song.shapeView.selection = Array.isArray(song.shapeView.selection) ? song.shapeView.selection : [];
    song.workbench = {progression:oldWorkbench.progression || '| 1 | 5/7 | 6m | 4 |'};
    song.timeline = Array.isArray(song.timeline) ? song.timeline : [];
    song.takes = Array.isArray(song.takes) ? song.takes : [];
    song.exchangeHistory = Array.isArray(song.exchangeHistory) ? song.exchangeHistory : [];
    song.sourceSongId ||= null;
    song.ideaLinks = Array.isArray(song.ideaLinks) ? song.ideaLinks.filter(link=>link&&link.ideaId).map(link=>({ideaId:link.ideaId,relation:link.relation==='saved'?'saved':'source',addedAt:link.addedAt||song.createdAt||now()})) : [];
    if(Array.isArray(song.sourceIdeaIds))song.sourceIdeaIds.forEach(ideaId=>{if(ideaId&&!song.ideaLinks.some(link=>link.ideaId===ideaId))song.ideaLinks.push({ideaId,relation:'source',addedAt:song.createdAt||now()});});
    delete song.sourceIdeaIds;
    song.format = {fontFamily:'serif',textColor:'ink',fontSize:19,lineHeight:1.65,pageWidth:980,...(song.format || {})};
    song.format.fontSize = clamp(Number(song.format.fontSize)||19,14,28);
    song.format.lineHeight = clamp(Number(song.format.lineHeight)||1.65,1.3,2.05);
    song.format.pageWidth = clamp(Number(song.format.pageWidth)||980,640,1180);
    song.chartLayout = {fontFamily:'song',pageSize:'a4',orientation:'portrait',margin:'normal',columns:1,sectionSpacing:'normal',lineSpacing:'normal',showMeta:true,...(song.chartLayout || {})};
    if (!['song','sans','serif','typewriter'].includes(song.chartLayout.fontFamily)) song.chartLayout.fontFamily='song';
    song.chartLayout.columns = Number(song.chartLayout.columns) === 2 ? 2 : 1;
    song.lastView = SONG_VIEW_ORDER.includes(song.lastView) ? song.lastView : (song.sections.length ? 'write' : 'plan');
    song.viewMemory ||= {};
    delete song.capo; delete song.shapeKey; delete song.status; delete song.notes;
    return song;
  }

  function normaliseState(raw) {
    const result = {...defaultState(),...(raw || {})};
    result.schemaVersion = 14;
    result.songs = Array.isArray(result.songs) ? result.songs.map(normaliseSong) : [];
    result.deletedSongs = Array.isArray(result.deletedSongs) ? result.deletedSongs : [];
    result.unattachedTakes = Array.isArray(result.unattachedTakes) ? result.unattachedTakes : [];
    result.ideas = Array.isArray(result.ideas) ? result.ideas.map(idea=>({
      id:idea?.id||uid('idea'),text:String(idea?.text||''),takeIds:Array.isArray(idea?.takeIds)?[...new Set(idea.takeIds)]:[],
      createdAt:idea?.createdAt||now(),updatedAt:idea?.updatedAt||idea?.createdAt||now(),favourite:Boolean(idea?.favourite),
      usedInSongIds:Array.isArray(idea?.usedInSongIds)?[...new Set(idea.usedInSongIds)]:[]
    })) : [];
    result.unattachedTakes.forEach(take=>{if(!result.ideas.some(idea=>idea.takeIds.includes(take.id)))result.ideas.push({id:`idea_${take.id}`,text:'',takeIds:[take.id],createdAt:take.createdAt||now(),updatedAt:take.createdAt||now(),favourite:false,usedInSongIds:[]});});
    result.ideas.forEach(idea=>idea.usedInSongIds.forEach(songId=>{const song=result.songs.find(item=>item.id===songId);if(song&&!song.ideaLinks.some(link=>link.ideaId===idea.id))song.ideaLinks.push({ideaId:idea.id,relation:'source',addedAt:idea.updatedAt||idea.createdAt||now()});}));
    result.ideaFilter = ['recent','text','recordings'].includes(result.ideaFilter) ? result.ideaFilter : 'recent';
    result.fieldProfile = result.fieldProfile && typeof result.fieldProfile==='object' ? result.fieldProfile : {name:''};
    result.fieldProfile.name = String(result.fieldProfile.name||'');
    result.projects = Array.isArray(result.projects) ? result.projects.map(project=>({id:project.id||uid('project'),name:String(project.name||'Project')})) : [];
    result.customTunings = Array.isArray(result.customTunings) ? result.customTunings.map(tuning=>({id:tuning.id||uid('tuning'),name:String(tuning.name||'Custom tuning'),strings:Array.isArray(tuning.strings)?tuning.strings.slice(0,6):[],note:String(tuning.note||'')})) : [];
    result.libraryStageFilter ||= 'all'; result.libraryProjectFilter ||= 'all'; result.libraryTuningFilter ||= 'all'; result.librarySort ||= 'edited';
    result.chordDisplay = result.chordDisplay === 'chords' ? 'shapes' : (['shapes','sounding','numbers'].includes(result.chordDisplay)?result.chordDisplay:'shapes');
    result.chartMode = result.chartMode === 'chords' ? 'shapes' : (['shapes','sounding','numbers','dual','lyrics','progressions'].includes(result.chartMode)?result.chartMode:'shapes');
    result.view = ['plan','shape','write','chart'].includes(result.view) ? result.view : 'plan';
    result.workbenchWidth = clamp(Number(result.workbenchWidth)||370,300,420);
    result.workbenchTab = result.workbenchTab==='spare'?'words':result.workbenchTab==='chords'?'music':(['words','music'].includes(result.workbenchTab)?result.workbenchTab:'words');
    result.shellPage = ['welcome','ideas','library','workspace'].includes(result.shellPage) ? result.shellPage : (result.selectedSongId?'workspace':'welcome');
    result.alternativesTrayOpen = Boolean(result.alternativesTrayOpen);
    result.workbenchOpen = Boolean(result.workbenchOpen);if(result.workbenchOpen)result.alternativesTrayOpen=false;
    result.focusMode = Boolean(result.focusMode);
    result.alternativeScope = ['current','section','song'].includes(result.alternativeScope) ? result.alternativeScope : 'current';
    result.shapeTool = result.shapeTool === 'hand' ? 'hand' : 'select';
    return result;
  }

  function currentSong() {
    if (demoSession?.active) {
      if (demoSession.mode === 'sandbox') return demoSession.sandboxSongs?.find(song => song.id === demoSession.selectedSandboxSongId) || demoSession.sandboxSongs?.[0] || null;
      return demoSession.song || null;
    }
    return state.songs.find(song => song.id === state.selectedSongId) || null;
  }
  function inDemoMode(){ return Boolean(demoSession?.active); }
  function inSandboxMode(){ return Boolean(demoSession?.active && demoSession.mode === 'sandbox'); }
  function inGuidedDemoMode(){ return Boolean(demoSession?.active && demoSession.mode !== 'sandbox'); }
  function resolveSandboxLinks(song){
    if(!song?.isSandbox)return song;
    (song.alternatives||[]).forEach(alt=>{
      if(Number.isInteger(alt.pendingChordIndex)&&alt.parentLineId){const found=findLine(song,alt.parentLineId);const chord=found?.line?.chords?.[alt.pendingChordIndex];if(chord)alt.targetId=chord.id;}
    });
    return song;
  }
  function findSection(song,id) { return song?.sections?.find(section => section.id === id) || null; }
  function findLine(song,id) { for (const section of song?.sections || []) { const line = section.lines.find(item => item.id === id); if (line) return {line,section}; } return null; }
  function findChord(song,lineId,chordId) { const found = findLine(song,lineId); if (!found) return null; const chord = found.line.chords?.find(item => item.id === chordId); return chord ? {...found,chord} : null; }
  function activeProfile(song) { return song.chartProfiles.find(profile => profile.id === song.activeProfileId) || song.chartProfiles[0] || {shapeKey:song.key,capo:0,tuning:song.tuning}; }
  function sectionKey(song,section) { return section?.keyOverride || song.key; }

  function touch(song) { song.updatedAt = now(); scheduleSave(); }
  function persistDemoSession(){
    try { if(inDemoMode()) sessionStorage.setItem(DEMO_SESSION_KEY,JSON.stringify(demoSession)); else sessionStorage.removeItem(DEMO_SESSION_KEY); }
    catch(error){ console.warn('Demo session could not be persisted',error); }
  }
  function scheduleSave() {
    els.saveState.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await dbSet(STATE_KEY,state); persistDemoSession();
        els.saveState.textContent = 'Saved';
        clearTimeout(els.saveState._fadeTimer);
        els.saveState._fadeTimer=setTimeout(()=>{if(els.saveState.textContent==='Saved')els.saveState.textContent='';},1100);
      } catch (error) {
        console.error(error); els.saveState.textContent = 'Couldn’t save';
        toast('Your latest changes could not be saved. Keep this page open and try again.');
      }
    },180);
  }

  function runtimeSnapshot(){ return {state:clone(state),demoSession:clone(demoSession)}; }
  function restoreRuntime(value){
    state=normaliseState(value.state);demoSession=value.demoSession?clone(value.demoSession):null;
    if(demoSession?.song)demoSession.song=normaliseSong(demoSession.song);
    if(Array.isArray(demoSession?.sandboxSongs))demoSession.sandboxSongs=demoSession.sandboxSongs.map(song=>resolveSandboxLinks(normaliseSong(song)));
  }
  function currentPanelState(){return{workbenchOpen:state.workbenchOpen,workbenchTab:state.workbenchTab,alternativesTrayOpen:state.alternativesTrayOpen};}
  function restorePanelState(panel){state.workbenchOpen=panel.workbenchOpen;state.workbenchTab=panel.workbenchTab;state.alternativesTrayOpen=panel.alternativesTrayOpen;}
  function snapshot(label) { undoStack.push({label,runtime:runtimeSnapshot()}); if (undoStack.length > 40) undoStack.shift(); redoStack = []; updateUndoButtons(); }
  function undo() { const item = undoStack.pop(); if (!item) return; const panel=currentPanelState();redoStack.push({label:item.label,runtime:runtimeSnapshot()}); restoreRuntime(item.runtime);restorePanelState(panel);resetActiveSelection(); scheduleSave(); render(); updateUndoButtons(); }
  function redo() { const item = redoStack.pop(); if (!item) return; const panel=currentPanelState();undoStack.push({label:item.label,runtime:runtimeSnapshot()}); restoreRuntime(item.runtime);restorePanelState(panel);resetActiveSelection(); scheduleSave(); render(); updateUndoButtons(); }
  function updateUndoButtons() { els.undoButton.disabled = !undoStack.length; els.redoButton.disabled = !redoStack.length; els.undoButton.title = undoStack.length ? `Undo ${undoStack.at(-1).label.toLowerCase()}` : 'Undo'; els.redoButton.title = redoStack.length ? `Redo ${redoStack.at(-1).label.toLowerCase()}` : 'Redo'; }
  function perform(label,mutate,_message=label,after=null) { snapshot(label); mutate(); const song = currentSong(); if (song) touch(song); render(); after?.(); }

  function resetActiveSelection() { activeLineId=null; activeSectionId=null; activeChordId=null; activeChordLineId=null; selectedChordIds.clear(); activeProgressionToken=null; pendingChordAnchor=null; activeEditor=null; shapeSelection.clear(); shapeInteraction=null; stopShapeAutoPan(); closeSelectionBar(); closeOverlay(); }

  function toast(message,action=null) { els.toast.replaceChildren(); const span=document.createElement('span');span.textContent=message;els.toast.append(span); if(action){const button=document.createElement('button');button.textContent='Undo';button.onclick=action;els.toast.append(button);}els.toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>els.toast.classList.remove('visible'),action?5000:2200); }
  function relativeDate(iso) { const diff=Date.now()-new Date(iso).getTime(); if(diff<60000)return'now';if(diff<3600000)return`${Math.floor(diff/60000)}m`;if(diff<86400000)return`${Math.floor(diff/3600000)}h`;if(diff<604800000)return`${Math.floor(diff/86400000)}d`;return new Date(iso).toLocaleDateString(undefined,{day:'numeric',month:'short'}); }
  function stageLabel(stage){ return stage==='finished'?'Finished':stage==='draft'?'Draft':stage==='writing'?'Writing':'Idea'; }
  function projectName(id){ return state.projects.find(project=>project.id===id)?.name || ''; }
  function allTuningOptions(){ return [...BUILTIN_TUNINGS,...state.customTunings.map(tuning=>tuning.name)]; }
  function customTuning(name){ return state.customTunings.find(tuning=>tuning.name===name) || null; }
  function tuningIsAutomatic(name){ if(customTuning(name))return false; return CE.supportsAutomaticShapes(name); }
  function profileTuningOffset(profile){ const custom=customTuning(profile?.tuning); if(custom)return null; return CE.tuningOffset(profile?.tuning||'Standard'); }
  function compactKey(key){ return CE.formatKey(key); }
  function displayModeLabel(mode){ return mode==='numbers'?'Nashville numbers':mode==='sounding'?'Sounding chords':'Playing shapes'; }
  function addRecentChord(song,value){ const chord=String(value||'').trim();if(!chord)return;song.recentChords=[chord,...song.recentChords.filter(item=>item!==chord)].slice(0,10); }
  function longKeyLabel(key){ const parsed=CE.parseKey(key); return `${parsed.tonic} ${parsed.mode==='minor'?'minor':'major'}`; }
  function intervalLabel(semitones){ const value=Number(semitones)||0; if(value===0)return 'No change'; return `${value>0?'Up':'Down'} ${Math.abs(value)} semitone${Math.abs(value)===1?'':'s'}`; }
  function stripChords(text) { return String(text||'').replace(/\[[^\]]+\]/g,'').replace(/\*\*(.*?)\*\*/g,'$1').replace(/_(.*?)_/g,'$1').trim(); }
  function looksLikeProgression(text) { const value=String(text||'').trim();if(!value)return false;const tokens=value.replace(/\|/g,' ').split(/\s+/).filter(Boolean);return value.includes('|')&&tokens.some(token=>CE.parseChord(token)?.recognised||CE.parseNashville(token)); }
  function autoGrow(textarea,min=40){textarea.style.height='auto';textarea.style.height=`${Math.max(min,textarea.scrollHeight)}px`;}
  function escapeHtml(value){return String(value??'').replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]));}
  function safeName(value){return String(value||'song').replace(/[^a-z0-9-_ ]/gi,'').trim().replace(/\s+/g,'-')||'song';}

  function standaloneMode(){return window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;}
  function updateConnectionStatus(){const online=navigator.onLine;const label=online?'On this device':'Offline · saved here';if(els.fieldStatus){els.fieldStatus.textContent=label;els.fieldStatus.classList.toggle('offline',!online);}if(els.welcomeConnection)els.welcomeConnection.textContent=standaloneMode()?(online?'Installed · ready offline':'Installed · working offline'):(online?'Saved on this device':'Offline · saved on this device');}
  async function installForOffline(){
    try{if(navigator.storage?.persist)await navigator.storage.persist();}catch(error){console.warn('Persistent storage request was not available',error);}
    if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;toast('Co-Writer is ready from your app launcher');return;}
    const body=document.createElement('div');body.className='install-guide';const isApple=/Mac|iPhone|iPad/.test(navigator.platform)||/iPhone|iPad/.test(navigator.userAgent);body.innerHTML=isApple?'<p><strong>Safari on iPhone or iPad</strong><br>Tap Share, choose <em>Add to Home Screen</em>, then turn on <em>Open as Web App</em>.</p><p><strong>Safari on Mac</strong><br>Choose File → Add to Dock.</p>':'<p><strong>Chrome</strong><br>Open the browser menu and choose <em>Install Co-Writer</em> or <em>Install page as app</em>.</p>';openModal('Install for offline',body);
  }
  async function registerOfflineShell(){if(!('serviceWorker'in navigator)||!/^https?:$/.test(location.protocol))return;try{await navigator.serviceWorker.register('./service-worker.js');}catch(error){console.warn('Offline shell could not be registered',error);}}

  function formatDuration(ms){const seconds=Math.max(0,Math.round(Number(ms||0)/1000));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
  function recordingDuration(){return Math.max(0,Date.now()-recordingStartedAt-recordingPausedMs-(recordingPausedAt?Date.now()-recordingPausedAt:0));}
  function updateRecordingTransport(){const time=els.recordingTransport?.querySelector('time');if(time)time.textContent=formatDuration(recordingDuration());}
  function supportedRecordingMime(){if(!window.MediaRecorder?.isTypeSupported)return'';return['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type))||'';}
  function downloadBlob(filename,blob){const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

  async function startWorkTape(song=null,source='workspace',ideaId=null){
    if(mediaRecorder){toast('A Work Tape is already recording');return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Audio recording is not available in this browser');return;}
    try{
      recordingStream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mimeType=supportedRecordingMime();mediaRecorder=mimeType?new MediaRecorder(recordingStream,{mimeType}):new MediaRecorder(recordingStream);
      recordingChunks=[];recordingStartedAt=Date.now();recordingPausedAt=0;recordingPausedMs=0;
      recordingTarget={songId:song?.id||null,ideaId:ideaId||null,view:song?state.view:'ideas',source,takeId:uid('take')};
      mediaRecorder.ondataavailable=event=>{if(event.data?.size)recordingChunks.push(event.data);};
      mediaRecorder.onerror=event=>{console.error('Work Tape recording error',event.error||event);toast('Recording stopped because of an audio error');};
      mediaRecorder.onstop=finishWorkTape;
      mediaRecorder.start(500);
      els.recordingTransport.classList.remove('hidden');els.recordingTransport.setAttribute('aria-hidden','false');
      const pause=els.recordingTransport.querySelector('[data-record-action="pause"]');if(pause)pause.textContent='Pause';
      updateRecordingTransport();recordingTimer=setInterval(updateRecordingTransport,250);toast('Work Tape recording');
    }catch(error){console.warn('Microphone permission was not available',error);recordingStream?.getTracks().forEach(track=>track.stop());recordingStream=null;mediaRecorder=null;toast('Microphone access is needed to record a Work Tape');}
  }

  function toggleRecordingPause(){
    if(!mediaRecorder)return;const button=els.recordingTransport.querySelector('[data-record-action="pause"]');
    if(mediaRecorder.state==='recording'){mediaRecorder.pause();recordingPausedAt=Date.now();if(button)button.textContent='Resume';}
    else if(mediaRecorder.state==='paused'){recordingPausedMs+=Date.now()-recordingPausedAt;recordingPausedAt=0;mediaRecorder.resume();if(button)button.textContent='Pause';}
  }

  function stopWorkTape(){if(mediaRecorder&&mediaRecorder.state!=='inactive')mediaRecorder.stop();}

  async function finishWorkTape(){
    const recorder=mediaRecorder,target=recordingTarget,durationMs=recordingDuration();
    clearInterval(recordingTimer);recordingTimer=null;els.recordingTransport.classList.add('hidden');els.recordingTransport.setAttribute('aria-hidden','true');
    recordingStream?.getTracks().forEach(track=>track.stop());recordingStream=null;mediaRecorder=null;recordingTarget=null;
    if(!target||!recordingChunks.length){recordingChunks=[];toast('No audio was captured');return;}
    const mimeType=recorder?.mimeType||recordingChunks[0]?.type||'audio/webm';const blob=new Blob(recordingChunks,{type:mimeType});recordingChunks=[];
    const take={id:target.takeId,name:`Work Tape ${new Date().toLocaleDateString(undefined,{day:'numeric',month:'short'})}`,createdAt:now(),durationMs,mimeType,view:target.view,note:''};
    try{await audioSet(take.id,blob);}catch(error){console.error(error);toast('The recording could not be saved');return;}
    const song=state.songs.find(item=>item.id===target.songId);
    if(song){song.takes.unshift(take);song.timeline.unshift({id:uid('log'),type:'take',takeId:take.id,createdAt:take.createdAt,view:take.view});touch(song);}
    else{
      state.unattachedTakes.unshift(take);
      let idea=state.ideas.find(item=>item.id===target.ideaId);
      if(!idea){idea=createIdea();state.ideas.unshift(idea);target.ideaId=idea.id;}
      if(!idea.takeIds.includes(take.id))idea.takeIds.unshift(take.id);
      idea.updatedAt=now();scheduleSave();renderWelcome();
    }
    openWorkTapeTrimmer(take,blob,target);
  }

  function revealSavedWorkTape(take,target){
    closeOverlay();const song=state.songs.find(item=>item.id===target.songId);
    if(song){toast('Work Tape saved');openStudioLog(song);}
    else{state.shellPage='ideas';scheduleSave();render();toast('Recording saved in Ideas');}
  }

  async function openWorkTapeTrimmer(take,blob,target){
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!ATE||!AudioContextClass){toast('Work Tape saved — trimming is not available here');revealSavedWorkTape(take,target);return;}
    let audioBuffer,audioContext;
    try{audioContext=new AudioContextClass();audioBuffer=await audioContext.decodeAudioData(await blob.arrayBuffer());await audioContext.close?.();}
    catch(error){console.warn('Work Tape waveform could not be decoded',error);try{await audioContext?.close?.();}catch{}revealSavedWorkTape(take,target);return;}
    const duration=audioBuffer.duration||take.durationMs/1000;take.durationMs=Math.round(duration*1000);const song=state.songs.find(item=>item.id===target.songId);if(song)touch(song);else scheduleSave();
    const body=document.createElement('div');body.className='work-tape-trimmer';const intro=document.createElement('p');intro.className='trim-intro';intro.textContent='Drag either edge to remove the start or ending. The shaded middle is what will be saved.';
    const canvas=document.createElement('canvas');canvas.className='trim-waveform';canvas.width=900;canvas.height=160;canvas.tabIndex=0;canvas.setAttribute('role','img');
    const controls=document.createElement('div');controls.className='trim-range-controls';const startLabel=document.createElement('label');startLabel.innerHTML='<span>Start</span>';const startInput=document.createElement('input');startInput.type='range';startInput.min='0';startInput.max=String(duration);startInput.step='.05';startInput.value='0';startInput.setAttribute('aria-label','Trim start');startLabel.append(startInput);const endLabel=document.createElement('label');endLabel.innerHTML='<span>End</span>';const endInput=document.createElement('input');endInput.type='range';endInput.min='0';endInput.max=String(duration);endInput.step='.05';endInput.value=String(duration);endInput.setAttribute('aria-label','Trim end');endLabel.append(endInput);controls.append(startLabel,endLabel);
    const transport=document.createElement('div');transport.className='trim-transport';const preview=document.createElement('button');preview.className='ghost-button';preview.textContent='▶ Preview selection';const readout=document.createElement('strong');transport.append(preview,readout);body.append(intro,canvas,controls,transport);
    const keep=document.createElement('button');keep.className='ghost-button';keep.textContent='Keep whole take';const save=document.createElement('button');save.className='primary-button';save.textContent='Save trim';
    const modalParts=openModal('Trim Work Tape',body,[keep,save]);const sourceUrl=URL.createObjectURL(blob);studioLogUrls.push(sourceUrl);const audio=document.createElement('audio');audio.src=sourceUrl;audio.preload='auto';
    const peaks=ATE.peakEnvelope(audioBuffer,canvas.width);let start=0,end=duration,dragging=null;
    const precise=value=>{const minutes=Math.floor(value/60),seconds=value-minutes*60;return`${String(minutes).padStart(2,'0')}:${seconds.toFixed(1).padStart(4,'0')}`;};
    const draw=()=>{const context=canvas.getContext('2d'),width=canvas.width,height=canvas.height,middle=height/2;context.clearRect(0,0,width,height);context.fillStyle='#e8e4da';context.fillRect(0,0,width,height);const maxPeak=Math.max(.05,...peaks),scale=(height*.42)/maxPeak;context.strokeStyle='#5d5b54';context.lineWidth=1;context.beginPath();peaks.forEach((peak,index)=>{const x=index/(peaks.length-1||1)*width,amount=Math.max(1,peak*scale);context.moveTo(x,middle-amount);context.lineTo(x,middle+amount);});context.stroke();const startX=duration?start/duration*width:0,endX=duration?end/duration*width:width;context.fillStyle='rgba(245,242,234,.76)';context.fillRect(0,0,startX,height);context.fillRect(endX,0,width-endX,height);context.fillStyle='rgba(114,84,184,.12)';context.fillRect(startX,0,endX-startX,height);context.strokeStyle='#7254b8';context.lineWidth=4;[startX,endX].forEach(x=>{context.beginPath();context.moveTo(x,0);context.lineTo(x,height);context.stroke();context.beginPath();context.arc(x,18,8,0,Math.PI*2);context.fillStyle='#7254b8';context.fill();});canvas.setAttribute('aria-label',`Waveform selection from ${precise(start)} to ${precise(end)}`);readout.textContent=`${precise(start)} — ${precise(end)} · ${(end-start).toFixed(1)} sec`;};
    const setBounds=(nextStart,nextEnd)=>{const bounds=ATE.trimBounds(duration,nextStart,nextEnd,.1);start=bounds.start;end=bounds.end;startInput.value=String(start);endInput.value=String(end);draw();};
    startInput.oninput=()=>setBounds(Math.min(Number(startInput.value),end-.1),end);endInput.oninput=()=>setBounds(start,Math.max(Number(endInput.value),start+.1));
    const pointTime=event=>{const rect=canvas.getBoundingClientRect();return clamp((event.clientX-rect.left)/Math.max(1,rect.width)*duration,0,duration);};
    canvas.onpointerdown=event=>{const time=pointTime(event);dragging=Math.abs(time-start)<=Math.abs(time-end)?'start':'end';canvas.setPointerCapture?.(event.pointerId);if(dragging==='start')setBounds(Math.min(time,end-.1),end);else setBounds(start,Math.max(time,start+.1));};
    canvas.onpointermove=event=>{if(!dragging)return;const time=pointTime(event);if(dragging==='start')setBounds(Math.min(time,end-.1),end);else setBounds(start,Math.max(time,start+.1));};canvas.onpointerup=canvas.onpointercancel=()=>dragging=null;
    const stopPreview=()=>{audio.pause();preview.textContent='▶ Preview selection';};audio.ontimeupdate=()=>{if(audio.currentTime>=end)stopPreview();};audio.onended=stopPreview;preview.onclick=async()=>{if(!audio.paused){stopPreview();return;}audio.currentTime=start;try{await audio.play();preview.textContent='■ Stop preview';}catch{toast('Preview could not start');}};
    const finish=()=>{stopPreview();revealSavedWorkTape(take,target);};keep.onclick=finish;modalParts.modal.querySelector('.modal-head .icon-button').onclick=finish;modalParts.backdrop.onclick=event=>{if(event.target===modalParts.backdrop)finish();};
    save.onclick=async()=>{save.disabled=true;keep.disabled=true;save.textContent='Saving trim…';await new Promise(resolve=>requestAnimationFrame(resolve));try{const bounds=ATE.trimBounds(duration,start,end,.1);const trimmed=ATE.encodeTrimmedWav(audioBuffer,bounds.start,bounds.end);await audioSet(take.id,trimmed);take.durationMs=Math.round(bounds.duration*1000);take.mimeType='audio/wav';take.trim={startMs:Math.round(bounds.start*1000),endMs:Math.round(bounds.end*1000),sourceDurationMs:Math.round(duration*1000)};if(song)touch(song);else scheduleSave();finish();}catch(error){console.error(error);save.disabled=false;keep.disabled=false;save.textContent='Save trim';toast('The trim could not be saved — the whole take is still safe');}};
    setBounds(0,duration);
  }

  async function populateTapeAudio(row,take){
    try{const blob=await audioGet(take.id);if(!blob){row.classList.add('audio-missing');return;}const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';const url=URL.createObjectURL(blob);studioLogUrls.push(url);audio.src=url;row.querySelector('.studio-log-audio')?.append(audio);const download=row.querySelector('[data-download]');if(download)download.onclick=()=>downloadBlob(`${safeName(take.name)}.${audioExtension(take)}`,blob);}
    catch(error){console.error('Could not load Work Tape',error);row.classList.add('audio-missing');}
  }

  function ideaTitle(idea){return idea.text.split(/\n/).map(line=>line.trim()).find(Boolean)?.slice(0,72)||'Audio idea';}
  function rememberOpenSong(){const song=currentSong();if(song&&state.shellPage==='workspace')rememberViewWorkspace(song,state.view);}
  function openHome(){rememberOpenSong();if(inDemoMode())exitDemo(false);state.shellPage='welcome';state.sidebarCollapsed=true;scheduleSave();render();}
  function openIdeas(){rememberOpenSong();if(inDemoMode())exitDemo(false);state.shellPage='ideas';state.sidebarCollapsed=true;scheduleSave();render();}
  function openSongs(){rememberOpenSong();state.filter='active';state.shellPage='library';state.sidebarCollapsed=false;scheduleSave();render();}
  function openSong(song){if(!song)return;state.selectedSongId=song.id;state.view=song.lastView||'plan';state.shellPage='workspace';state.sidebarCollapsed=true;state.workbenchOpen=false;resetActiveSelection();scheduleSave();render();}

  function openIdeaComposer(existing=null){
    let idea=existing;const body=document.createElement('div');body.className='idea-composer';
    const input=document.createElement('textarea');input.rows=7;input.value=idea?.text||'';input.placeholder='Write a line, title, chord, or thought…';input.setAttribute('aria-label','Idea');
    const note=document.createElement('small');note.textContent='Saved on this device as you type. No title or song details required.';body.append(input,note);
    const ensureIdea=()=>{if(!idea){idea=createIdea();state.ideas.unshift(idea);}return idea;};
    input.oninput=()=>{const current=ensureIdea();current.text=input.value;current.updatedAt=now();scheduleSave();};
    const cancel=document.createElement('button');cancel.className='ghost-button';cancel.textContent='Close';cancel.onclick=()=>{closeOverlay();if(idea&&(idea.text.trim()||idea.takeIds.length)){state.shellPage='ideas';scheduleSave();render();}};
    const record=document.createElement('button');record.className='ghost-button idea-record-button';record.textContent='● Record';record.onclick=()=>{const current=ensureIdea();current.text=input.value;current.updatedAt=now();scheduleSave();closeOverlay();startWorkTape(null,'ideas',current.id);};
    const done=document.createElement('button');done.className='primary-button';done.textContent='Done';done.onclick=()=>{if(idea){idea.text=input.value;idea.updatedAt=now();if(!idea.text.trim()&&!idea.takeIds.length)state.ideas=state.ideas.filter(item=>item.id!==idea.id);}closeOverlay();state.shellPage='ideas';scheduleSave();render();};
    const modal=openModal(existing?'Edit idea':'New idea',body,[cancel,record,done]);
    modal.modal.querySelector('.modal-head .icon-button').onclick=done.onclick;modal.backdrop.onclick=event=>{if(event.target===modal.backdrop)done.onclick();};
    requestAnimationFrame(()=>input.focus());
  }

  async function copyIdeaTakesToSong(idea,song){
    for(const sourceId of idea.takeIds){
      const source=state.unattachedTakes.find(take=>take.id===sourceId);if(!source)continue;
      const blob=await audioGet(sourceId);if(!blob)continue;
      const copy={...clone(source),id:uid('take'),view:'idea'};await audioSet(copy.id,blob);song.takes.unshift(copy);song.timeline.unshift({id:uid('log'),type:'take',takeId:copy.id,createdAt:copy.createdAt,view:'idea'});
    }
  }

  async function useIdeaInSong(idea,song,openAfter=true){
    const linked=song.ideaLinks.some(link=>link.ideaId===idea.id);const text=idea.text.trim();if(!linked&&text)song.plan.brainDump=[song.plan.brainDump.trim(),text].filter(Boolean).join('\n\n');
    if(!linked)await copyIdeaTakesToSong(idea,song);if(!song.ideaLinks.some(link=>link.ideaId===idea.id))song.ideaLinks.push({ideaId:idea.id,relation:'source',addedAt:now()});if(!idea.usedInSongIds.includes(song.id))idea.usedInSongIds.push(song.id);idea.updatedAt=now();touch(song);
    if(openAfter){state.selectedSongId=song.id;state.view='plan';state.shellPage='workspace';state.sidebarCollapsed=true;render();toast(linked?`Already connected to ${song.title}`:`Added to ${song.title}`);}
  }

  async function turnIdeaIntoSong(idea){
    const song=createSong(ideaTitle(idea));state.songs.unshift(song);state.selectedSongId=song.id;await useIdeaInSong(idea,song,false);state.view='plan';state.shellPage='workspace';state.sidebarCollapsed=true;scheduleSave();render();toast('Song started — the original stays in Ideas');
  }

  function chooseSongForIdea(idea){
    if(!state.songs.length){turnIdeaIntoSong(idea);return;}
    openChoiceModal('Add to a song',state.songs.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).map(song=>[song.title,()=>useIdeaInSong(idea,song)]),'The original will stay in Ideas.');
  }

  async function deleteIdea(idea){
    if(!confirm(`Delete “${ideaTitle(idea)}”? Recordings stored only with this idea will also be removed from this device.`))return;
    for(const takeId of idea.takeIds){await audioDelete(takeId);state.unattachedTakes=state.unattachedTakes.filter(take=>take.id!==takeId);}
    state.ideas=state.ideas.filter(item=>item.id!==idea.id);state.songs.forEach(song=>song.ideaLinks=song.ideaLinks.filter(link=>link.ideaId!==idea.id));scheduleSave();renderIdeas();toast('Idea deleted');
  }

  async function populateIdeaAudio(wrap,take){
    try{const blob=await audioGet(take.id);if(!blob){wrap.textContent='Recording unavailable on this device';return;}const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';const url=URL.createObjectURL(blob);ideaAudioUrls.push(url);audio.src=url;const download=document.createElement('button');download.className='text-button';download.textContent='Download recording';download.onclick=()=>downloadBlob(`${safeName(take.name)}.${audioExtension(take)}`,blob);wrap.append(audio,download);}catch(error){console.error(error);wrap.textContent='Recording could not be opened';}
  }

  function renderIdeas(){
    if(!els.ideaList)return;ideaAudioUrls.forEach(url=>URL.revokeObjectURL(url));ideaAudioUrls=[];els.ideaList.replaceChildren();
    if(state.shellPage!=='ideas')return;
    [...els.ideaFilters.querySelectorAll('[data-idea-filter]')].forEach(button=>button.classList.toggle('active',button.dataset.ideaFilter===state.ideaFilter));
    const query=els.ideaSearch.value.trim().toLowerCase();const ideas=state.ideas.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).filter(idea=>{
      if(state.ideaFilter==='text'&&!idea.text.trim())return false;if(state.ideaFilter==='recordings'&&!idea.takeIds.length)return false;return !query||idea.text.toLowerCase().includes(query);
    });
    if(!ideas.length){const empty=document.createElement('section');empty.className='ideas-empty';empty.innerHTML=`<h2>${query?'No ideas found.':'Nothing to organise yet.'}</h2><p>${query?'Try another search.':'Catch a line, melody, chord, title, or thought. It does not need to be a song yet.'}</p>`;const add=document.createElement('button');add.className='primary-button';add.textContent='New idea';add.onclick=()=>openIdeaComposer();empty.append(add);els.ideaList.append(empty);return;}
    ideas.forEach(idea=>{const card=document.createElement('article');card.className='idea-card';
      const usedSongs=idea.usedInSongIds.map(id=>state.songs.find(song=>song.id===id)?.title).filter(Boolean);const copy=document.createElement('button');copy.className='idea-card-copy';copy.onclick=()=>openIdeaComposer(idea);const text=idea.text.trim();copy.innerHTML=`<strong>${escapeHtml(ideaTitle(idea))}</strong>${text?`<p>${escapeHtml(text.slice(0,320))}</p>`:'<p class="idea-audio-label">Recorded idea</p>'}<small>${escapeHtml(relativeDate(idea.updatedAt))}${usedSongs.length?` · in ${escapeHtml(usedSongs.slice(0,2).join(' · '))}`:''}</small>`;
      const audio=document.createElement('div');audio.className='idea-card-audio';idea.takeIds.forEach(id=>{const take=state.unattachedTakes.find(item=>item.id===id);if(take)populateIdeaAudio(audio,take);});
      const actions=document.createElement('div');actions.className='idea-card-actions';const edit=document.createElement('button');edit.className='text-button';edit.textContent='Edit';edit.onclick=()=>openIdeaComposer(idea);const turn=document.createElement('button');turn.className='primary-button';turn.textContent='Start a song';turn.onclick=()=>turnIdeaIntoSong(idea);const use=document.createElement('button');use.className='ghost-button';use.textContent='Add to song';use.onclick=()=>chooseSongForIdea(idea);const more=document.createElement('button');more.className='icon-button';more.textContent='•••';more.title='Idea menu';more.onclick=()=>openMenu(more,[[idea.favourite?'Remove favourite':'Favourite',()=>{idea.favourite=!idea.favourite;idea.updatedAt=now();scheduleSave();renderIdeas();}],['Delete idea',()=>deleteIdea(idea),'danger']]);actions.append(edit,use,turn,more);card.append(copy);if(idea.takeIds.length)card.append(audio);card.append(actions);els.ideaList.append(card);});
  }

  function openStudioLog(song){
    const body=document.createElement('div');body.className='studio-log';const composer=document.createElement('form');composer.className='studio-log-composer';const note=document.createElement('textarea');note.placeholder='Add a studio note…';note.rows=2;const add=document.createElement('button');add.className='primary-button';add.textContent='Add note';composer.append(note,add);composer.onsubmit=event=>{event.preventDefault();const text=note.value.trim();if(!text)return;song.timeline.unshift({id:uid('log'),type:'note',text,createdAt:now(),view:state.view});touch(song);openStudioLog(song);};body.append(composer);
    const record=document.createElement('button');record.className='ghost-button studio-record-button';record.textContent='● Record new Work Tape';record.onclick=()=>{closeOverlay();startWorkTape(song,'studio-log');};body.append(record);
    const list=document.createElement('div');list.className='studio-log-list';const entries=song.timeline.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    if(!entries.length){const empty=document.createElement('div');empty.className='workbench-empty';empty.textContent='Record a Work Tape or add a note. This log stays with the song.';list.append(empty);}
    entries.forEach(entry=>{const row=document.createElement('article');row.className=`studio-log-entry ${entry.type}`;const take=entry.type==='take'?song.takes.find(item=>item.id===entry.takeId):null;const head=document.createElement('header');const label=document.createElement('div');const entryLabel=take?.name||(entry.type==='note'?'Studio note':entry.type==='exchange'?'Field exchange':'Missing Work Tape');label.innerHTML=`<strong>${escapeHtml(entryLabel)}</strong><small>${escapeHtml(new Date(entry.createdAt).toLocaleString())}${entry.view?` · ${escapeHtml(entry.view)}`:''}${take?` · ${escapeHtml(formatDuration(take.durationMs))}`:''}</small>`;head.append(label);row.append(head);
      if(entry.type==='note'||entry.type==='exchange'){const copy=document.createElement('p');copy.textContent=entry.text;row.append(copy);}
      else if(take){const audioWrap=document.createElement('div');audioWrap.className='studio-log-audio';const actions=document.createElement('div');actions.className='studio-log-actions';const rename=document.createElement('button');rename.className='text-button';rename.textContent='Rename';rename.onclick=()=>openFormModal('Rename Work Tape',[{name:'name',label:'Name',type:'text',value:take.name,required:true}],values=>{take.name=values.name.trim();touch(song);openStudioLog(song);});const download=document.createElement('button');download.className='text-button';download.dataset.download='';download.textContent='Download';const remove=document.createElement('button');remove.className='text-button danger';remove.textContent='Delete';remove.onclick=async()=>{if(!confirm(`Delete “${take.name}”? This removes the local audio.`))return;await audioDelete(take.id);song.takes=song.takes.filter(item=>item.id!==take.id);song.timeline=song.timeline.filter(item=>item.takeId!==take.id);touch(song);openStudioLog(song);toast('Work Tape deleted');};actions.append(rename,download,remove);row.append(audioWrap,actions);populateTapeAudio(row,take);}
      list.append(row);});body.append(list);openModal('Studio Log',body);
  }

  function storedChordToDisplay(token,song,mode='shapes',harmonyKey=song.key,profile=activeProfile(song)) {
    if (mode === 'numbers') return CE.chordToNashville(token,harmonyKey);
    if (mode === 'sounding' || mode === 'stored') return token;
    const chord = CE.parseChord(token);
    if (!chord?.recognised || chord.noChord) return token;
    if (tuningIsAutomatic(profile.tuning)) {
      const offset=profileTuningOffset(profile) || 0;
      return CE.transposeChord(token,-(Number(profile.capo||0)+offset),profile.shapeKey,song.spelling);
    }
    return token;
  }

  function displayedChordToStored(token,song,harmonyKey=song.key,profile=activeProfile(song)) {
    const value = String(token||'').trim();
    if (!value) return null;
    if (CE.parseNashville(value)) return CE.nashvilleToChord(value,harmonyKey,song.spelling);
    if (CE.parseChord(value)?.recognised && state.chordDisplay==='shapes' && tuningIsAutomatic(profile.tuning)) {
      const offset=profileTuningOffset(profile) || 0;
      return CE.transposeChord(value,Number(profile.capo||0)+offset,harmonyKey,song.spelling);
    }
    return value;
  }

  function displayProgression(text,song,mode='shapes',harmonyKey=song.key,profile=activeProfile(song)) {
    const displayMode=mode==='chords'?'shapes':mode;
    return String(text||'').split(/(\s+|\|+)/g).map(part => {
      if (!part || /^\s+$/.test(part) || /^\|+$/.test(part)) return part;
      if (displayMode === 'stored') return part;
      const number=CE.parseNashville(part);
      const canonical=number?CE.nashvilleToChord(part,harmonyKey,song.spelling):part;
      if(!CE.parseChord(canonical)?.recognised)return part;
      return storedChordToDisplay(canonical,song,displayMode,harmonyKey,profile);
    }).join('');
  }

  function displayedProgressionToStored(text,song,harmonyKey=song.key,profile=activeProfile(song)) {
    return String(text||'').split(/(\s+|\|+)/g).map(part => {
      if (!part || /^\s+$/.test(part) || /^\|+$/.test(part)) return part;
      return displayedChordToStored(part,song,harmonyKey,profile) || part;
    }).join('');
  }

  function lineToBracket(song,section,line,mode='stored') {
    if (line.kind === 'progression') return mode === 'stored' ? line.text : displayProgression(line.text,song,mode,sectionKey(song,section));
    return NE.serialiseBracketLine(line,value => mode === 'stored' ? value : storedChordToDisplay(value,song,mode,sectionKey(song,section)));
  }

  function captureHarmony(song) {
    return {key:song.key,spelling:song.spelling,tuning:song.tuning,sections:song.sections.map(section=>({id:section.id,keyOverride:section.keyOverride,lines:section.lines.map(line=>({id:line.id,text:line.text,kind:line.kind,chords:clone(line.chords||[])}))}))};
  }

  function applyHarmony(song,harmony) {
    song.key = harmony.key || song.key; song.spelling = harmony.spelling || song.spelling; song.tuning = harmony.tuning || song.tuning;
    harmony.sections?.forEach(savedSection => {
      const section = findSection(song,savedSection.id); if(!section)return; section.keyOverride = savedSection.keyOverride || null;
      savedSection.lines?.forEach(savedLine => { const line=section.lines.find(item=>item.id===savedLine.id); if(line){line.text=savedLine.text;line.kind=savedLine.kind;line.chords=clone(savedLine.chords||[]);} });
    });
  }

  function transposedHarmony(song,targetKey) {
    const result = captureHarmony(song); const semitones = CE.signedKeyDistance(song.key,targetKey); result.key = targetKey;
    result.sections.forEach(section => {
      const sourceSection = findSection(song,section.id); const oldKey = sectionKey(song,sourceSection);
      const sectionTarget = sourceSection?.keyOverride ? `${CE.noteName(CE.noteIndex(CE.parseKey(oldKey).tonic)+semitones,targetKey,song.spelling)}${CE.parseKey(oldKey).mode==='minor'?'m':''}` : targetKey;
      if (section.keyOverride) section.keyOverride = sectionTarget;
      section.lines.forEach(line => {
        if (line.kind === 'progression') line.text = String(line.text||'').split(/(\s+|\|+)/g).map(part=>CE.parseChord(part)?.recognised?CE.transposeChord(part,semitones,sectionTarget,song.spelling):part).join('');
        else line.chords = (line.chords||[]).map(chord=>({...chord,value:CE.transposeChord(chord.value,semitones,sectionTarget,song.spelling)}));
      });
    });
    return result;
  }

  function fontFamilyStack(value) { return value === 'sans' ? '"Helvetica Neue",Helvetica,Arial,sans-serif' : value === 'typewriter' ? '"Courier Prime","Courier New",Courier,monospace' : value === 'song' ? 'var(--song-font)' : 'Georgia,"Times New Roman",serif'; }
  function applyFormatVariables(song) {
    const font = fontFamilyStack(song.format.fontFamily);
    document.documentElement.style.setProperty('--song-font',font);
    document.documentElement.style.setProperty('--song-ink',song.format.textColor==='red'?'#9f332c':song.format.textColor==='blue'?'#2457a6':'var(--ink)');
    document.documentElement.style.setProperty('--song-size',`${song.format.fontSize}px`);
    document.documentElement.style.setProperty('--song-line',String(song.format.lineHeight));
    document.documentElement.style.setProperty('--page-width',`${song.format.pageWidth}px`);
  }

  function selectedChordsOnLine(line){const ids=selectedChordIds.size?selectedChordIds:(activeChordId?new Set([activeChordId]):null);return ids?(line.chords||[]).filter(chord=>ids.has(chord.id)):(line.chords||[]);}
  function copyActiveChords(song){const found=findLine(song,activeLineId);if(!found){toast('Select a line or chord first');return;}if(found.line.kind==='progression'){progressionClipboard=found.line.text;toast('Chord row copied');return;}const selected=selectedChordsOnLine(found.line);chordClipboard=clone(selected);toast(`${chordClipboard.length} chord${chordClipboard.length===1?'':'s'} copied`);}
  function pasteActiveChords(song){const found=findLine(song,activeLineId);if(!found){toast('Select a lyric line or chord row first');return;}if(found.line.kind==='progression'){if(!progressionClipboard){toast('Copy a chord row first');return;}const index=found.section.lines.indexOf(found.line);perform('Pasted chord row',()=>{const copy=createLine(progressionClipboard,'progression',sectionKey(song,found.section));found.section.lines.splice(index+1,0,copy);activeLineId=copy.id;activeSectionId=found.section.id;},'Chord row pasted');return;}if(!chordClipboard.length){toast('Copy a chord or line of chords first');return;}perform('Pasted chords',()=>{selectedChordIds.clear();chordClipboard.forEach(chord=>{const anchor=NE.nearestBoundary(found.line.text,chord.anchor,true);found.line.chords=found.line.chords.filter(existing=>NE.nearestBoundary(found.line.text,existing.anchor,true)!==anchor);const copy={...clone(chord),id:uid('chord'),anchor};found.line.chords.push(copy);selectedChordIds.add(copy.id);activeChordId=copy.id;activeChordLineId=found.line.id;});},`${chordClipboard.length} chord${chordClipboard.length===1?'':'s'} pasted`);}
  function duplicateActiveChords(song){const found=findLine(song,activeLineId);copyActiveChords(song);if(found?.line.kind==='progression'?Boolean(progressionClipboard):Boolean(chordClipboard.length))pasteActiveChords(song);}
  function removeActiveChords(song){if(activeProgressionToken){const found=findLine(song,activeProgressionToken.lineId);if(!found)return;perform('Removed chord',()=>{const bars=progressionParts(found.line.text).map(bar=>bar.split(/\s+/).filter(Boolean));bars[activeProgressionToken.barIndex]?.splice(activeProgressionToken.chordIndex,1);found.line.text=serialiseProgressionBars(bars);activeProgressionToken=null;},'Chord removed');return;}const found=findLine(song,activeChordLineId||activeLineId);if(!found||found.line.kind!=='lyric')return;const selected=selectedChordsOnLine(found.line);if(!selected.length)return;const ids=new Set(selected.map(chord=>chord.id));perform('Removed chord',()=>{found.line.chords=found.line.chords.filter(chord=>!ids.has(chord.id));selectedChordIds.clear();activeChordId=null;activeChordLineId=null;},`${selected.length} chord${selected.length===1?'':'s'} removed`);}

  function render() {
    const song = currentSong();
    updateConnectionStatus();
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.style.setProperty('--workbench-width',`${state.workbenchWidth}px`);
    if(inDemoMode() && state.shellPage!=='library') state.shellPage='workspace';
    if(state.shellPage==='workspace'&&!song) state.shellPage=state.songs.length?'library':'welcome';
    els.app.classList.toggle('page-welcome',state.shellPage==='welcome');
    els.app.classList.toggle('page-ideas',state.shellPage==='ideas');
    els.app.classList.toggle('page-library',state.shellPage==='library');
    els.app.classList.toggle('page-workspace',state.shellPage==='workspace');
    [...els.appNav.querySelectorAll('[data-page]')].forEach(button=>{const active=button.dataset.page===state.shellPage;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    els.app.classList.toggle('sidebar-collapsed',state.sidebarCollapsed);
    const shelfAllowed=Boolean(song&&state.shellPage==='workspace'&&(state.view!=='chart'||transientPanel));
    els.app.classList.toggle('workbench-open',Boolean(shelfAllowed&&state.workbenchOpen));
    els.app.classList.toggle('alternatives-open',Boolean(song&&state.shellPage==='workspace'&&state.view==='write'&&state.alternativesTrayOpen));
    els.app.classList.toggle('chart-view-active',state.view==='chart');
    els.app.classList.toggle('demo-mode',inDemoMode());
    els.app.classList.toggle('demo-guide-open',Boolean(inGuidedDemoMode()&&demoSession.guideOpen));
    els.welcomePage.classList.toggle('hidden',state.shellPage!=='welcome');
    els.ideasPage.classList.toggle('hidden',state.shellPage!=='ideas');
    renderWelcome();
    renderIdeas();
    renderLibrary();
    [...els.modeNav.querySelectorAll('button[data-view]')].forEach(button=>button.classList.toggle('active',button.dataset.view===state.view));
    updateUndoButtons();
    if(state.shellPage!=='workspace') { renderAlternativesTray(); renderDemoGuide(); return; }
    if (!song) {
      els.emptyState.classList.remove('hidden'); els.workspace.classList.add('hidden'); els.workbenchBody.replaceChildren(); renderAlternativesTray(); renderDemoGuide(); return;
    }
    applyFormatVariables(song);
    els.emptyState.classList.add('hidden'); els.workspace.classList.remove('hidden');
    els.songTitle.value = song.title;
    els.songContext.innerHTML = `${inSandboxMode()?'<span class="demo-badge sandbox-badge">SANDBOX · NOT IN SONGS</span>':inDemoMode()?'<span class="demo-badge">DEMO · NOT IN SONGS</span>':''}`;
    renderToolbar(song);
    renderView(song);
    renderWorkbench();
    renderAlternativesTray();
    renderDemoGuide();
  }

  function renderWelcome(){
    if(!els.welcomeContinueCard)return;
    const song=state.songs.find(item=>item.id===state.selectedSongId)||state.songs.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt))[0];
    els.welcomeContinueCard.classList.toggle('hidden',!song);els.welcomeContinueCard.tabIndex=song?0:-1;els.welcomeContinueCard.setAttribute('role',song?'button':'region');
    els.welcomePage.classList.toggle('has-song',Boolean(song));
    const introduced=Boolean(state.onboardingComplete);const guideHome=introduced?els.welcomeQuietActions:els.welcomeMainActions;if(els.welcomeGetStarted.parentElement!==guideHome){if(introduced)guideHome.prepend(els.welcomeGetStarted);else guideHome.append(els.welcomeGetStarted);}els.welcomeGetStarted.textContent=introduced?'Guide':'Start here';els.welcomeGetStarted.classList.toggle('ghost-button',!introduced);els.welcomeGetStarted.classList.toggle('welcome-start-here',!introduced);els.welcomeGetStarted.classList.toggle('text-button',introduced);els.welcomeGetStarted.classList.toggle('welcome-secondary',introduced);
    if(song){els.welcomeContinueTitle.textContent=song.title;els.welcomeContinueMeta.textContent=`${stageLabel(song.stage)} · edited ${relativeDate(song.updatedAt)}${song.takes.length?` · ${song.takes.length} tape${song.takes.length===1?'':'s'}`:''}`;}
    els.welcomeRecordIdea.textContent=mediaRecorder?'● Recording…':'● Record';els.welcomeRecordIdea.disabled=Boolean(mediaRecorder);renderHomeRecents();
  }

  function renderHomeRecents(){
    if(!els.welcomeRecentIdeas||!els.welcomeRecentSongs)return;els.welcomeRecentIdeas.replaceChildren();els.welcomeRecentSongs.replaceChildren();
    const ideas=state.ideas.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,3);const songs=state.songs.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,3);
    if(!ideas.length){const empty=document.createElement('p');empty.className='home-recent-empty';empty.textContent='Ideas you catch will collect here.';els.welcomeRecentIdeas.append(empty);}else ideas.forEach(idea=>{const button=document.createElement('button');button.className='home-recent-item';button.innerHTML=`<strong>${escapeHtml(ideaTitle(idea))}</strong><small>${escapeHtml(relativeDate(idea.updatedAt))}${idea.takeIds.length?' · recording':''}</small>`;button.onclick=()=>openIdeaComposer(idea);els.welcomeRecentIdeas.append(button);});
    if(!songs.length){const empty=document.createElement('p');empty.className='home-recent-empty';empty.textContent='Songs begin when an idea needs more room.';els.welcomeRecentSongs.append(empty);}else songs.forEach(song=>{const button=document.createElement('button');button.className='home-recent-item';button.innerHTML=`<strong>${escapeHtml(song.title)}</strong><small>${escapeHtml(stageLabel(song.stage))} · ${escapeHtml(song.lastView[0].toUpperCase()+song.lastView.slice(1))}</small>`;button.onclick=()=>openSong(song);els.welcomeRecentSongs.append(button);});
  }

  function saveHomeIdea(){const text=els.welcomeIdeaInput.value.trim();if(!text)return;const idea=createIdea(text);state.ideas.unshift(idea);els.welcomeIdeaInput.value='';els.welcomeIdeaSave.disabled=true;els.welcomeIdeaStatus.textContent='Saved in Ideas.';scheduleSave();renderHomeRecents();toast('Idea saved');requestAnimationFrame(()=>els.welcomeIdeaInput.focus());}

  function renderLibrary() {
    const query = els.songSearch.value.trim().toLowerCase();
    [...els.libraryFilters.querySelectorAll('button')].forEach(button=>{button.classList.toggle('active',button.dataset.filter===state.filter);button.disabled=inSandboxMode()&&button.dataset.filter!=='active';});
    els.projectsPanel.classList.toggle('hidden',inDemoMode());
    els.libraryTools.classList.toggle('hidden',inDemoMode());
    els.songList.replaceChildren();
    renderProjects();
    const source=inSandboxMode()?(demoSession.sandboxSongs||[]):inGuidedDemoMode()?[currentSong()].filter(Boolean):state.songs;
    let songs=source.filter(song => {
      if (!inDemoMode()) {
        if (state.filter === 'finished' && song.stage !== 'finished') return false;
        if (state.filter === 'favourite' && !song.favourite) return false;
        if (state.filter === 'archived' && song.libraryStatus !== 'archived') return false;
        if (state.filter === 'active' && (song.libraryStatus === 'archived' || song.stage==='finished')) return false;
        if (state.libraryStageFilter!=='all'&&song.stage!==state.libraryStageFilter)return false;
        if (state.libraryProjectFilter!=='all'&&!song.projectIds.includes(state.libraryProjectFilter))return false;
        const tuning=activeProfile(song).tuning||song.tuning;
        if(state.libraryTuningFilter!=='all'&&tuning!==state.libraryTuningFilter)return false;
      }
      const projects=song.projectIds.map(projectName).join(' ');
      const haystack = `${song.title} ${song.plan.brainDump} ${song.sections.flatMap(section=>section.lines.map(line=>line.text)).join(' ')} ${song.writers.map(writer=>writer.name).join(' ')} ${projects}`.toLowerCase();
      return !query || haystack.includes(query);
    });
    if(inSandboxMode())songs.sort((a,b)=>(a.sandboxOrder||0)-(b.sandboxOrder||0));
    else if(state.librarySort==='created')songs.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    else if(state.librarySort==='title')songs.sort((a,b)=>a.title.localeCompare(b.title));
    else songs.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
    if(!songs.length){
      const empty=document.createElement('section');empty.className='library-empty';
      const hasQuery=Boolean(query);
      const selectedProject=state.libraryProjectFilter!=='all';
      const copy=hasQuery?'No songs found.':selectedProject?'No songs in this project yet.':state.filter==='finished'?'No finished songs yet.':'No songs here yet.';
      const detail=hasQuery?'Clear the search or filters to see more songs.':selectedProject?'Add an existing song or create a new song in this project.':state.filter==='finished'?'Songs marked Finished will appear here.':'Create a new song to begin.';
      empty.innerHTML=`<h2>${escapeHtml(copy)}</h2><p>${escapeHtml(detail)}</p>`;
      if(hasQuery||state.filter!=='active'||selectedProject){const button=document.createElement('button');button.className='ghost-button';button.textContent=hasQuery?'Clear search':'View working songs';button.onclick=()=>{els.songSearch.value='';state.filter='active';state.libraryProjectFilter='all';state.libraryStageFilter='all';state.libraryTuningFilter='all';scheduleSave();renderLibrary();};empty.append(button);}
      els.songList.append(empty);
      return;
    }
    songs.forEach(song => {
      const selectedId=inSandboxMode()?demoSession.selectedSandboxSongId:inGuidedDemoMode()?song.id:state.selectedSongId;
      const article=document.createElement('article');article.className=`song-item${song.id===selectedId?' active':''}`;if(!inDemoMode()){article.draggable=true;article.ondragstart=event=>{dragData={kind:'library-song',songId:song.id};event.dataTransfer.setData('text/plain',song.id);};article.ondragend=()=>dragData=null;}
      const open=document.createElement('button');open.className='song-item-open';
      const opening=song.sections.flatMap(section=>section.lines).find(line=>line.text.trim())?.text||song.plan.brainDump||'';
      const purpose=inSandboxMode()?SD?.manifest?.find(item=>item.key===song.sandboxKey)?.purpose:null;
      const project=song.projectIds.map(projectName).filter(Boolean).slice(0,2).join(' · ');
      const tuning=activeProfile(song).tuning||song.tuning;
      open.innerHTML=`<div class="song-item-title">${escapeHtml(song.title)}</div><div class="song-item-meta"><span>${escapeHtml(stageLabel(song.stage))}</span><span>${inSandboxMode()?escapeHtml(purpose||'Sandbox song'):inGuidedDemoMode()?'Demo':relativeDate(song.updatedAt)}</span>${song.takes.length?`<span class="song-item-tapes">● ${song.takes.length}</span>`:''}</div>${project?`<div class="song-item-project">${escapeHtml(project)}</div>`:''}${tuning&&tuning!=='Standard'?`<div class="song-item-tuning">${escapeHtml(tuning)}</div>`:''}${opening?`<div class="song-item-opening">${escapeHtml(stripChords(opening))}</div>`:''}`;
      open.onclick=()=>{
        if(inSandboxMode()){demoSession.selectedSandboxSongId=song.id;state.view=song.lastView||'plan';state.shellPage='workspace';state.sidebarCollapsed=true;state.workbenchOpen=false;resetActiveSelection();scheduleSave();render();return;}
        if(inGuidedDemoMode())return;
        state.selectedSongId=song.id;state.view=song.lastView||'plan';state.shellPage='workspace';state.sidebarCollapsed=true;resetActiveSelection();scheduleSave();render();
      };
      article.append(open);
      if(!inDemoMode()){
        const stage=document.createElement('button');stage.className='song-stage-button';stage.textContent=stageLabel(song.stage);stage.title='Change progress';stage.onclick=event=>{event.stopPropagation();openStagePicker(song,stage);};article.append(stage);
      }
      els.songList.append(article);
    });
  }


  function renderProjects(){
    els.projectList.replaceChildren();if(inDemoMode())return;
    const all=document.createElement('button');all.className=`project-button${state.libraryProjectFilter==='all'?' active':''}`;all.textContent='All projects';all.onclick=()=>{state.libraryProjectFilter='all';scheduleSave();renderLibrary();};els.projectList.append(all);
    state.projects.forEach(project=>{const button=document.createElement('button');button.className=`project-button${state.libraryProjectFilter===project.id?' active':''}`;button.textContent=project.name;button.onclick=()=>{state.libraryProjectFilter=project.id;scheduleSave();renderLibrary();};button.ondragover=event=>{if(dragData?.kind==='library-song'){event.preventDefault();button.classList.add('drop-target');}};button.ondragleave=()=>button.classList.remove('drop-target');button.ondrop=event=>{if(dragData?.kind!=='library-song')return;event.preventDefault();button.classList.remove('drop-target');const song=state.songs.find(item=>item.id===dragData.songId);if(song&&!song.projectIds.includes(project.id)){song.projectIds.push(project.id);touch(song);renderLibrary();toast(`Added to ${project.name}`);}dragData=null;};button.oncontextmenu=event=>{event.preventDefault();openMenu(button,[['Rename…',()=>renameProject(project)],['Delete project',()=>deleteProject(project),'danger']]);};els.projectList.append(button);});
  }
  function createProject(){openFormModal('New project',[{name:'name',label:'Project name',type:'text',required:true,placeholder:'Something in the Water'}],values=>{const project={id:uid('project'),name:values.name.trim()};state.projects.push(project);state.libraryProjectFilter=project.id;scheduleSave();render();toast('Project created');});}
  function renameProject(project){openFormModal('Rename project',[{name:'name',label:'Project name',type:'text',required:true,value:project.name}],values=>{project.name=values.name.trim();scheduleSave();render();});}
  function deleteProject(project){state.projects=state.projects.filter(item=>item.id!==project.id);state.songs.forEach(song=>song.projectIds=song.projectIds.filter(id=>id!==project.id));if(state.libraryProjectFilter===project.id)state.libraryProjectFilter='all';scheduleSave();render();toast('Project removed. Songs remain available.');}
  function openStagePicker(song,anchor){openChoicePopover(anchor,'Progress',STAGE_OPTIONS.map(([value,label])=>[label,()=>setSongStage(song,value)]));}
  function openLibraryFilter(anchor){
    const body=document.createElement('div');body.className='side-tool-form';
    const stageField=document.createElement('label');stageField.className='side-field';stageField.innerHTML='<span>Progress</span>';const stage=document.createElement('select');[['all','Any progress'],...STAGE_OPTIONS].forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;stage.append(option);});stage.value=state.libraryStageFilter;stageField.append(stage);
    const projectField=document.createElement('label');projectField.className='side-field';projectField.innerHTML='<span>Project</span>';const project=document.createElement('select');[['all','Any project'],...state.projects.map(item=>[item.id,item.name])].forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;project.append(option);});project.value=state.libraryProjectFilter;projectField.append(project);
    const tuningField=document.createElement('label');tuningField.className='side-field';tuningField.innerHTML='<span>Tuning</span>';const tuning=document.createElement('select');[['all','Any tuning'],...allTuningOptions().map(value=>[value,value])].forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;tuning.append(option);});tuning.value=state.libraryTuningFilter;tuningField.append(tuning);
    const clear=document.createElement('button');clear.className='ghost-button';clear.textContent='Clear filters';clear.onclick=()=>{state.libraryStageFilter='all';state.libraryProjectFilter='all';state.libraryTuningFilter='all';closeOverlay();scheduleSave();renderLibrary();};
    const done=document.createElement('button');done.className='primary-button';done.textContent='Done';done.onclick=()=>{state.libraryStageFilter=stage.value;state.libraryProjectFilter=project.value;state.libraryTuningFilter=tuning.value;closeOverlay();scheduleSave();renderLibrary();};
    body.append(stageField,projectField,tuningField);openModal('Filter songs',body,[clear,done]);
  }
  function openLibrarySort(anchor){openChoicePopover(anchor,'Sort songs',[['Recently edited',()=>setLibrarySort('edited')],['Recently created',()=>setLibrarySort('created')],['Title',()=>setLibrarySort('title')]]);}
  function setLibrarySort(value){state.librarySort=value;els.librarySortButton.textContent=value==='created'?'Recently created':value==='title'?'Title':'Recently edited';scheduleSave();renderLibrary();}

  function syncViewContext(song,fromView,toView){
    if(toView==='shape'&&fromView==='write'){
      const found=activeLineId?findLine(song,activeLineId):null;const section=found?.section||findSection(song,activeSectionId);
      if(found||section){shapeSelection.clear();shapeSelection.add(found?shapeKey('line',found.line.id):shapeKey('section',section.id));activeSectionId=section.id;mobileShapeExpandedSectionId=section.id;rememberShapeSelection(song);}
    }
    if(toView==='write'&&fromView==='shape'){
      const selected=[...shapeSelection].map(parseShapeKey);const lineSelection=selected.find(item=>item.kind==='line');const sectionSelection=selected.find(item=>item.kind==='section');
      if(lineSelection){const found=shapeLineOwner(song,lineSelection.id);if(found){activeSectionId=found.section.id;activeLineId=found.line.id;}}
      else if(sectionSelection){const section=findSection(song,sectionSelection.id);if(section){activeSectionId=section.id;activeLineId=section.lines[0]?.id||null;}}
    }
  }

  function rememberViewWorkspace(song,view=state.view){
    if(!song||!SONG_VIEW_ORDER.includes(view))return;
    const memory=song.viewMemory[view]||={};
    if(view===state.view&&els.viewHost)memory.scrollTop=els.viewHost.scrollTop;
    memory.activeSectionId=activeSectionId||null;
    memory.activeLineId=activeLineId||null;
    if(view!=='chart'){
      memory.workbenchOpen=Boolean(state.workbenchOpen&&!transientPanel);
      memory.workbenchTab=state.workbenchTab;
    }
  }

  function restoreViewWorkspace(song,view){
    const memory=song.viewMemory?.[view];
    if(!memory)return;
    if(!activeSectionId&&memory.activeSectionId&&findSection(song,memory.activeSectionId))activeSectionId=memory.activeSectionId;
    if(!activeLineId&&memory.activeLineId&&findLine(song,memory.activeLineId))activeLineId=memory.activeLineId;
    if(view!=='chart'){
      if(typeof memory.workbenchOpen==='boolean')state.workbenchOpen=memory.workbenchOpen;
      if(['words','music'].includes(memory.workbenchTab))state.workbenchTab=memory.workbenchTab;
    }
  }

  function revealViewContext(song,view){
    if(view==='write'&&activeLineId){document.querySelector(`.notebook-row[data-line-id="${CSS.escape(activeLineId)}"]`)?.scrollIntoView({block:'nearest'});return;}
    if(view!=='shape'||!shapeSelection.size)return;
    if(phoneShapeLayout()){const target=activeLineId?document.querySelector(`[data-mobile-line-id="${CSS.escape(activeLineId)}"]`):activeSectionId?document.querySelector(`[data-mobile-section-id="${CSS.escape(activeSectionId)}"]`):null;target?.scrollIntoView({block:'nearest'});return;}
    const viewport=document.querySelector('.shape-viewport'),target=document.querySelector('.shape-line-chip.selected,.shape-object.selected');if(!viewport||!target)return;const bounds=target.getBoundingClientRect(),frame=viewport.getBoundingClientRect(),margin=24;if(bounds.right<frame.left+margin||bounds.left>frame.right-margin||bounds.bottom<frame.top+margin||bounds.top>frame.bottom-margin)centreShapeSelection(song);
  }

  function setView(view) {
    const song=currentSong();if(!song||!SONG_VIEW_ORDER.includes(view))return;
    stopUnattendedDemo();
    const previousView=state.view;rememberViewWorkspace(song,previousView);syncViewContext(song,previousView,view);
    state.view=view;song.lastView=view;state.shellPage='workspace';restoreViewWorkspace(song,view);if(view==='chart'){state.workbenchOpen=false;state.alternativesTrayOpen=false;}else if(view!=='write')state.alternativesTrayOpen=false;closeSelectionBar();closeOverlay();activeEditor=null;pendingChordAnchor=null;activeChordId=null;activeChordLineId=null;activeProgressionToken=null;scheduleSave();render();
    requestAnimationFrame(()=>{const memory=song.viewMemory?.[view];if(memory?.scrollTop!==undefined)els.viewHost.scrollTop=memory.scrollTop;if(view==='plan'&&!song.plan.brainDump)document.querySelector('.brain-dump')?.focus();revealViewContext(song,view);});
  }

  function scrollWorkspaceToTop(){els.viewHost.scrollTo({top:0,behavior:'auto'});}

  function renderView(song) {
    els.viewHost.replaceChildren();
    if (state.view==='plan') renderPlan(song);
    else if (state.view==='shape') renderShape(song);
    else if (state.view==='write') renderWrite(song);
    else renderChart(song);
  }

  function toolButton(label,title,action,className='') { const button=document.createElement('button');button.type='button';button.className=`tool-button ${className}`.trim();button.textContent=label;button.title=title||label;button.onclick=action;return button; }
  function toolSelect(value,options,onchange,title='') { const select=document.createElement('select');select.className='tool-select';select.title=title;options.forEach(option=>{const data=typeof option==='object'?option:{value:option,label:option};const element=document.createElement('option');element.value=data.value;element.textContent=data.label;select.append(element);});select.value=String(value);select.onchange=()=>onchange(select.value);return select; }
  function divider(){const span=document.createElement('span');span.className='tool-divider';return span;}

  function setShapeTool(tool,song){state.shapeTool=tool==='hand'?'hand':'select';scheduleSave();renderToolbar(song);const viewport=document.querySelector('.shape-viewport');if(viewport)viewport.classList.toggle('hand',state.shapeTool==='hand');}

  function openTextMenu(song,anchor,context){
    closeOverlay();
    const rect=anchor.getBoundingClientRect();
    const backdrop=document.createElement('div');backdrop.className='overlay-backdrop clear';
    const panel=document.createElement('div');panel.className='text-popover';
    const group=(label,className='')=>{const wrap=document.createElement('div');wrap.className=`format-group ${className}`.trim();const heading=document.createElement('span');heading.className='format-label';heading.textContent=label;const controls=document.createElement('div');controls.className='format-controls';wrap.append(heading,controls);return{wrap,controls};};
    const fonts=group('Song typeface','format-fonts');[['sans','Contemporary'],['serif','Traditional'],['typewriter','Typewriter']].forEach(([value,label])=>{const button=document.createElement('button');button.type='button';button.className=`font-tile font-${value}${(song.format.fontFamily||'serif')===value?' active':''}`;button.textContent=label;button.setAttribute('aria-pressed',String((song.format.fontFamily||'serif')===value));button.onclick=()=>{song.format.fontFamily=value;fonts.controls.querySelectorAll('button').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});touch(song);applyFormatVariables(song);renderView(song);};fonts.controls.append(button);});
    const appearance=group(context==='write'?'Song size · selected line colour':'Song size & colour','format-appearance');const size=document.createElement('select');size.setAttribute('aria-label','Point size');[14,16,18,19,20,22,24,28].forEach(value=>{const option=document.createElement('option');option.value=String(value);option.textContent=`${value} pt`;size.append(option);});size.value=String(song.format.fontSize);size.onchange=()=>{song.format.fontSize=Number(size.value);touch(song);applyFormatVariables(song);if(context==='write')renderView(song);};appearance.controls.append(size);
    const selectedColor=context==='write'?(findLine(song,activeLineId)?.line.style?.color||'ink'):(song.format.textColor||'ink');[['ink','Black'],['red','Red'],['blue','Blue']].forEach(([value,label])=>{const button=document.createElement('button');button.type='button';button.className=`color-swatch color-${value}${selectedColor===value?' active':''}`;button.title=label;button.setAttribute('aria-label',`${label} text`);button.setAttribute('aria-pressed',String(selectedColor===value));button.onclick=()=>{if(context==='write'){const found=findLine(song,activeLineId);if(!found){toast('Select a lyric line first');return;}found.line.style||={};found.line.style.color=value;}else song.format.textColor=value;appearance.controls.querySelectorAll('.color-swatch').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});touch(song);applyFormatVariables(song);renderView(song);};appearance.controls.append(button);});
    const styles=group('Style','format-styles');
    const bold=document.createElement('button');bold.textContent='B';bold.title='Bold';bold.onclick=()=>context==='plan'?wrapTextareaSelection('**'):toggleLineStyle(song,'bold');
    const italic=document.createElement('button');italic.textContent='I';italic.title='Italic';italic.onclick=()=>context==='plan'?wrapTextareaSelection('_'):toggleLineStyle(song,'italic');
    const clean=document.createElement('button');clean.textContent='Clean pasted text';clean.onclick=()=>{context==='plan'?cleanPlan(song):cleanWrite(song);closeOverlay();};
    styles.controls.append(bold,italic,clean);panel.append(fonts.wrap,appearance.wrap);
    const more=document.createElement('details');more.className='format-more';const moreLabel=document.createElement('summary');moreLabel.textContent='More text options';const moreBody=document.createElement('div');moreBody.className='format-more-body';moreBody.append(styles.wrap);
    if(context==='write'){const layout=group('Page & rhythm','format-layout');const width=document.createElement('select');width.setAttribute('aria-label','Writing page width');[[760,'Narrow'],[900,'Notebook'],[980,'Roomy'],[1040,'Wide'],[1180,'Studio wide']].forEach(([value,label])=>{const option=document.createElement('option');option.value=String(value);option.textContent=label;width.append(option);});width.value=String(song.format.pageWidth);width.onchange=()=>{song.format.pageWidth=Number(width.value);touch(song);applyFormatVariables(song);renderView(song);};const spacing=document.createElement('select');spacing.setAttribute('aria-label','Line spacing');[[1.35,'Tight'],[1.55,'Regular'],[1.65,'Comfortable'],[1.75,'Open'],[2,'Airy']].forEach(([value,label])=>{const option=document.createElement('option');option.value=String(value);option.textContent=label;spacing.append(option);});spacing.value=String(song.format.lineHeight);spacing.onchange=()=>{song.format.lineHeight=Number(spacing.value);touch(song);applyFormatVariables(song);renderView(song);};layout.controls.append(width,spacing);moreBody.append(layout.wrap);}
    more.append(moreLabel,moreBody);panel.append(more);
    placePopover(panel,rect,{width:560,height:300,prefer:'below'});
    backdrop.append(panel);backdrop.onclick=event=>{if(event.target===backdrop)closeOverlay();};els.overlayLayer.append(backdrop);
  }

  function placePopover(element,anchorRect,{width=360,height=320,prefer='right'}={}){
    const margin=12;let left,top;
    const roomRight=window.innerWidth-anchorRect.right-margin;
    const roomLeft=anchorRect.left-margin;
    if(prefer==='right'&&roomRight>=width){left=anchorRect.right+8;top=anchorRect.top;}
    else if(prefer==='right'&&roomLeft>=width){left=anchorRect.left-width-8;top=anchorRect.top;}
    else if(prefer==='below'&&window.innerHeight-anchorRect.bottom-margin>=height){left=anchorRect.left;top=anchorRect.bottom+7;}
    else {left=anchorRect.left;top=anchorRect.top-height-7;}
    left=clamp(left,margin,Math.max(margin,window.innerWidth-width-margin));
    top=clamp(top,margin,Math.max(margin,window.innerHeight-height-margin));
    element.style.left=`${left}px`;element.style.top=`${top}px`;
  }

  function renderToolbar(song) {
    els.utilityToolbar.replaceChildren();
    const left=document.createElement('div');left.className='tool-group';
    const right=document.createElement('div');right.className='tool-group right';
    if(phoneShapeLayout()&&state.view!=='chart'){renderPhoneToolbar(song,left,right);els.utilityToolbar.append(left,right);return;}
    if (state.view==='plan') {
      left.append(toolButton('Send to Write','Copy the selection or current paragraph into the lyric notebook',()=>sendPlanToWrite(song),'primary-action'),toolButton('From Ideas','Add an existing idea to this Plan',()=>chooseIdeaForPlan(song)));right.append(toolButton('Words & Music','Open words or music',()=>toggleWorkbench(state.workbenchTab||'words'),state.workbenchOpen?'active':''),toolButton('More','Open Plan tools',event=>openContextualTools(song,event.currentTarget,'plan')));
    } else if (state.view==='shape') {
      if(phoneShapeLayout()){
        left.append(toolButton('+ Loose line','Add a loose line',()=>addMobileShapeBlock(song),'primary-action'),toolButton('+ Section','Add a section',()=>addMobileShapeSection(song)));
        right.append(toolButton('Words & Music','Open words or music',()=>toggleWorkbench(state.workbenchTab||'words'),state.workbenchOpen?'active':''));
        els.utilityToolbar.append(left,right);return;
      }
      left.append(
        toolButton('Select','Select and move pieces',()=>setShapeTool('select',song),state.shapeTool==='select'?'active':''),
        toolButton('Hand','Pan the Shape canvas',()=>setShapeTool('hand',song),state.shapeTool==='hand'?'active':''),
        divider(),toolButton('+ Loose line','Create a loose line',()=>addShapeBlock(song,'fragment'),'primary-action'),
        toolButton('+ Section','Create a movable section',event=>openSectionPicker(song,song.sections.length,'',false,event.currentTarget))
      );
      right.append(toolButton('Arrange','Lay pieces out without overlaps',()=>arrangeShape(song)),toolButton(playerSetupLabel(song),'Sounding key, playing shapes and capo',event=>openInlineHarmonyPopover(song,event.currentTarget),'music-setup'),toolButton('Words & Music','Open words or music',()=>toggleWorkbench(state.workbenchTab||'words'),state.workbenchOpen?'active':''));
      if(shapeSelection.size){const selected=[...shapeSelection].map(parseShapeKey);const onlySection=selected.length===1&&selected[0].kind==='section';const onlyLines=selected.every(item=>item.kind==='line');if(onlyLines)right.append(toolButton('Make loose','Move the selected lines out of their section',()=>liftSelectedShapeLines(song),'selection-action'));else right.append(toolButton(onlySection?'Open in Write':'Place in Write','Place selected material in the lyric notebook',()=>sendShapeSelectionToWrite(song),'selection-action'));}
    } else if (state.view==='write') {
      left.append(toolButton('+ Section','Add a section after the active section',event=>openSectionPicker(song,sectionInsertIndex(song),'',true,event.currentTarget),'primary-action'),toolButton('+ Chord','Place a chord above the active word',()=>addChordFromToolbar(song)),toolButton('Try another','Preserve the current choice and try another',()=>tryAnother(song)),toolButton('Words & Music','Open words or music',()=>toggleWorkbench(state.workbenchTab||'words'),state.workbenchOpen?'active':''));
      right.append(toolButton(playerSetupLabel(song),'Sounding key, playing shapes and capo',event=>openInlineHarmonyPopover(song,event.currentTarget),'music-setup'),toolButton('Text','Point size, width and restrained formatting',event=>openTextMenu(song,event.currentTarget,'write')));
    } else {
      left.append(toolSelect(state.chartMode,[{value:'shapes',label:'Playing shapes'},{value:'sounding',label:'Sounding chords'},{value:'numbers',label:'Nashville numbers'},{value:'dual',label:'Shapes + sounding'},{value:'lyrics',label:'Lyrics only'},{value:'progressions',label:'Progressions'}],value=>{state.chartMode=value;scheduleSave();renderView(song);},'Chart view'),toolButton('Key/Capo','Sounds in, shapes and capo',event=>openInlineHarmonyPopover(song,event.currentTarget)),toolButton('Layout','Chart font size and spacing',()=>openChartLayout(song)),toolButton('Export','Print, text or ChordPro',()=>openChartExport(song),'primary-action'));
    }
    if(state.view!=='chart'&&!inDemoMode())right.prepend(toolButton('● Work Tape',mediaRecorder?'A Work Tape is recording':'Record or open this song’s Studio Log',event=>mediaRecorder?toast('Use the recording controls below'):openChoicePopover(event.currentTarget,'Work Tape',[['Start recording',()=>startWorkTape(song)],['Open Studio Log',()=>openStudioLog(song)]]),song.takes.length?'has-takes':''));
    els.utilityToolbar.append(left,right);
  }

  function openContextualTools(song,anchor,context){
    const items=[];
    if(context==='plan')items.push(['From Ideas',()=>chooseIdeaForPlan(song)],['Save selection as Idea',()=>savePlanSelectionAsIdea(song)],['Copy selection to Shape',()=>sendPlanToShape(song)],['Text appearance',()=>openTextMenu(song,anchor,'plan')],['Player setup',()=>openInlineHarmonyPopover(song,anchor)]);
    if(context==='shape')items.push(['Player setup',()=>openInlineHarmonyPopover(song,anchor)]);
    if(context==='write')items.push(['Try another',()=>tryAnother(song)],['Add chord',()=>addChordFromToolbar(song)],['Text appearance',()=>openTextMenu(song,anchor,'write')],['Player setup',()=>openInlineHarmonyPopover(song,anchor)]);
    if(!inDemoMode())items.push(['Record Work Tape',()=>startWorkTape(song)],['Open Studio Log',()=>openStudioLog(song)]);
    openChoicePopover(anchor,'More tools',items);
  }
  function renderPhoneToolbar(song,left,right){
    if(state.view==='plan')left.append(toolButton('Send to Write','Copy selected writing into the lyric notebook',()=>sendPlanToWrite(song),'primary-action'));
    else if(state.view==='shape')left.append(toolButton('Add','Add a loose line or section',event=>openChoicePopover(event.currentTarget,'Add to Shape',[['Loose line',()=>addMobileShapeBlock(song)],['Section',()=>addMobileShapeSection(song)]]),'primary-action'));
    else if(state.view==='write')left.append(toolButton('Add','Add to the active section',event=>{const section=findSection(song,activeSectionId)||song.sections[song.sections.length-1];const items=[['Section',()=>openSectionPicker(song,sectionInsertIndex(song),'',true,event.currentTarget)]];if(section)items.unshift(['Lyric line',()=>addLine(song,section,'lyric')],['Chord row',()=>addLine(song,section,'progression')]);openChoicePopover(event.currentTarget,'Add to song',items);},'primary-action'));
    left.append(toolButton('Words & Music','Open words or music',()=>toggleWorkbench(state.workbenchTab||'words'),state.workbenchOpen?'active':''));
    const more=toolButton('More','Open contextual tools',event=>openContextualTools(song,event.currentTarget,state.view));right.append(more);
  }

  function playerSetupLabel(song){const profile=activeProfile(song);return `${compactKey(song.key)} sound · ${compactKey(profile.shapeKey)} shapes · C${profile.capo||0}`;}

  function wrapTextareaSelection(marker) {
    const editor=activeEditor&&document.body.contains(activeEditor)?activeEditor:document.activeElement;
    if(!editor||editor.tagName!=='TEXTAREA'||editor.selectionEnd<=editor.selectionStart){toast('Select some text first');return;}
    const wrapped=UE.wrapSelection(editor.value,editor.selectionStart,editor.selectionEnd,marker);editor.value=wrapped.text;editor.selectionStart=wrapped.start;editor.selectionEnd=wrapped.end;editor.dispatchEvent(new Event('input'));editor.focus();
  }

  function toggleLineStyle(song,property) { const found=findLine(song,activeLineId);if(!found){toast('Select a lyric line first');return;}found.line.style ||= {};found.line.style[property]=!found.line.style[property];touch(song);renderView(song); }
  function cleanPlan(song) { const area=document.querySelector('.brain-dump');if(!area)return;const start=area.selectionStart,end=area.selectionEnd;if(end>start)area.setRangeText(UE.cleanText(area.value.slice(start,end)),start,end,'select');else area.value=UE.cleanText(area.value);song.plan.brainDump=area.value;touch(song);toast('Pasted formatting cleaned');area.focus(); }
  function cleanWrite(song) { const found=findLine(song,activeLineId);if(!found){toast('Select a line first');return;}found.line.text=UE.cleanText(found.line.text).replace(/\n$/,'');found.line.style={};touch(song);renderView(song);toast('Line formatting cleaned'); }

  function renderPlan(song) {
    const view=document.createElement('div');view.className='plan-view';
    const page=document.createElement('article');page.className='plan-page';
    const linked=song.ideaLinks.map(link=>({link,idea:state.ideas.find(idea=>idea.id===link.ideaId)})).filter(item=>item.idea);if(linked.length){const ideas=document.createElement('aside');ideas.className='plan-idea-links';const label=document.createElement('strong');label.textContent='Related ideas';const list=document.createElement('div');linked.forEach(({link,idea})=>{const button=document.createElement('button');button.type='button';button.className='plan-idea-link';button.innerHTML=`<span>${link.relation==='saved'?'Saved to Ideas':'From Ideas'}</span><strong>${escapeHtml(ideaTitle(idea))}</strong>`;button.onclick=()=>openIdeaComposer(idea);list.append(button);});ideas.append(label,list);page.append(ideas);}
    const textarea=document.createElement('textarea');textarea.className='brain-dump';textarea.placeholder='';textarea.value=song.plan.brainDump;
    textarea.onfocus=()=>{activeEditor=textarea;};textarea.oninput=()=>{song.plan.brainDump=textarea.value;touch(song);autoGrow(textarea,620);};
    page.append(textarea);view.append(page);els.viewHost.append(view);requestAnimationFrame(()=>autoGrow(textarea,620));
  }

  function selectedPlanText() { const area=document.querySelector('.brain-dump');if(!area)return null;const start=area.selectionStart,end=area.selectionEnd;let text=area.value.slice(start,end).trim();if(!text){const before=area.value.lastIndexOf('\n',Math.max(0,start-1))+1;const after=area.value.indexOf('\n',start);const finish=after<0?area.value.length:after;text=area.value.slice(before,finish).trim();}return {area,start,end,text}; }
  function chooseIdeaForPlan(song){const available=state.ideas.filter(idea=>!song.ideaLinks.some(link=>link.ideaId===idea.id)).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));if(!available.length){toast(state.ideas.length?'All Ideas are already connected to this song':'Capture an Idea first');if(!state.ideas.length)openIdeaComposer();return;}openChoiceModal('Add from Ideas',available.map(idea=>[ideaTitle(idea),()=>useIdeaInSong(idea,song)]),'The Idea stays in Ideas. A copy is added to this Plan.');}
  function savePlanSelectionAsIdea(song){const selected=selectedPlanText();if(!selected?.text){toast('Select a passage or place the caret on a line first');return;}const idea=createIdea(selected.text);idea.usedInSongIds.push(song.id);state.ideas.unshift(idea);song.ideaLinks.push({ideaId:idea.id,relation:'saved',addedAt:now()});touch(song);renderView(song);toast('Saved to Ideas');}
  function planSelectionMaterial(text){const groups=String(text||'').trim().split(/\n\s*\n+/).map(group=>group.split('\n').map(line=>line.trim()).filter(Boolean)).filter(group=>group.length);const sectionPattern=/^(verse|pre[- ]?chorus|chorus|bridge|refrain|tag|intro|outro|instrumental)(?:\s+\d+)?\s*:?$/i;return groups.flatMap(lines=>sectionPattern.test(lines[0])&&lines.length>1?[{kind:'section',label:lines[0].replace(/:$/,''),lines:lines.slice(1)}]:lines.map(text=>({kind:'fragment',text})));}
  function planLine(text,key){return createLine(text,looksLikeProgression(text)?'progression':'lyric',key);}
  function sendPlanToWrite(song){
    const selected=selectedPlanText();if(!selected?.text){toast('Write or select something first');return;}const material=planSelectionMaterial(selected.text),lineCount=material.reduce((total,item)=>total+(item.kind==='section'?item.lines.length:1),0);let firstSection=null,firstLine=null;
    perform('Copy to Write',()=>{let target=findSection(song,activeSectionId)||song.sections.at(-1)||null;material.forEach(item=>{if(item.kind==='section'){const lines=item.lines.map(text=>planLine(text,song.key));const section=createSection(item.label,lines);section.shape.h=Math.max(180,70+lines.length*68);const point=findOpenShapePoint(song,section.shape.w,section.shape.h,{x:180,y:150});section.shape.x=point.x;section.shape.y=point.y;song.sections.push(section);target=section;}else{if(!target){target=createSection('Verse 1',[]);const point=findOpenShapePoint(song,target.shape.w,target.shape.h,{x:180,y:150});target.shape.x=point.x;target.shape.y=point.y;song.sections.push(target);}target.lines.push(planLine(item.text,sectionKey(song,target)));}const added=item.kind==='section'?target.lines[0]:target.lines.at(-1);firstSection ||= target;firstLine ||= added||null;});activeSectionId=firstSection?.id||activeSectionId;activeLineId=firstLine?.id||activeLineId;},lineCount===1?'Copied one line to Write':`Copied ${lineCount} lines to Write`,()=>setView('write'));
  }
  function sendPlanToShape(song) { const selected=selectedPlanText();if(!selected?.text){toast('Write or select something first');return;}const material=planSelectionMaterial(selected.text),center=visibleShapeCenter(song);perform('Copy to Shape',()=>{material.forEach(item=>{if(item.kind==='section'){const section=createSection(item.label,item.lines.map(line=>planLine(line,song.key)),center.x,center.y);section.shape.h=Math.max(180,70+item.lines.length*68);const point=findOpenShapePoint(song,section.shape.w,section.shape.h,center);section.shape.x=point.x;section.shape.y=point.y;song.sections.push(section);}else{const block=createBlock('fragment',item.text,center.x,center.y);const point=findOpenShapePoint(song,block.w,block.h,center);block.x=point.x;block.y=point.y;song.shapeBlocks.push(block);}});},material.length===1?'Copied to Shape':`${material.length} pieces copied to Shape`); }
  function showPlanSelectionBar(){ closeSelectionBar(); }

  function closeSelectionBar(){selectionBar?.remove();selectionBar=null;}

  function visibleShapeCenter(song) { const viewport=document.querySelector('.shape-viewport');const width=viewport?.clientWidth||900,height=viewport?.clientHeight||650;return{x:(width/2-song.shapeView.panX)/song.shapeView.zoom-110,y:(height/2-song.shapeView.panY)/song.shapeView.zoom-60}; }
  function shapeTopLevelBoxes(song){return[...(song.shapeBlocks||[]).map(block=>({x:Number(block.x)||0,y:Number(block.y)||0,w:Number(block.w)||220,h:Number(block.h)||100})),...(song.sections||[]).map(section=>({x:Number(section.shape?.x)||0,y:Number(section.shape?.y)||0,w:Number(section.shape?.w)||340,h:Number(section.shape?.h)||220}))];}
  function boxesOverlap(a,b,padding=24){return a.x<b.x+b.w+padding&&a.x+a.w+padding>b.x&&a.y<b.y+b.h+padding&&a.y+a.h+padding>b.y;}
  function findOpenShapePoint(song,w,h,preferred=visibleShapeCenter(song)){const occupied=shapeTopLevelBoxes(song),step=56;for(let ring=0;ring<24;ring+=1){const offsets=ring===0?[[0,0]]:[];if(ring){for(let x=-ring;x<=ring;x+=1){offsets.push([x,-ring],[x,ring]);}for(let y=-ring+1;y<ring;y+=1){offsets.push([-ring,y],[ring,y]);}}for(const [dx,dy] of offsets){const candidate={x:Math.round(preferred.x+dx*step),y:Math.round(preferred.y+dy*step),w,h};if(!occupied.some(box=>boxesOverlap(candidate,box)))return{x:candidate.x,y:candidate.y};}}return{x:preferred.x,y:preferred.y+occupied.length*step};}
  function arrangeShape(song){perform('Arranged Shape',()=>{const items=[...(song.sections||[]).map(section=>({kind:'section',item:section,w:section.shape.w||340,h:section.shape.h||220,x:section.shape.x,y:section.shape.y})),...(song.shapeBlocks||[]).map(block=>({kind:'block',item:block,w:block.w||220,h:block.h||100,x:block.x,y:block.y}))].sort((a,b)=>(a.y-b.y)||(a.x-b.x));let x=120,y=110,columnWidth=0;items.forEach(entry=>{if(y+entry.h>1050&&y>110){x+=columnWidth+70;y=110;columnWidth=0;}if(entry.kind==='section'){entry.item.shape.x=x;entry.item.shape.y=y;}else{entry.item.x=x;entry.item.y=y;}y+=entry.h+46;columnWidth=Math.max(columnWidth,entry.w);});},'Shape arranged');}
  function shapeKey(kind,id){return `${kind}:${id}`;}
  function parseShapeKey(key){const [kind,...rest]=key.split(':');return{kind,id:rest.join(':')};}
  function shapeLineOwner(song,lineId){for(const section of song.sections||[]){const line=section.lines.find(item=>item.id===lineId);if(line)return{section,line};}return null;}
  function shapeObject(song,key){const parsed=parseShapeKey(key);if(parsed.kind==='block')return song.shapeBlocks.find(item=>item.id===parsed.id);if(parsed.kind==='section')return song.sections.find(item=>item.id===parsed.id);return shapeLineOwner(song,parsed.id)?.line||null;}
  function shapeAbsoluteBox(song,key){const parsed=parseShapeKey(key);if(parsed.kind==='block'){const item=shapeObject(song,key);return item?{x:Number(item.x)||0,y:Number(item.y)||0,w:Number(item.w)||220,h:Number(item.h)||120}:null;}if(parsed.kind==='section'){const item=shapeObject(song,key);return item?{x:Number(item.shape.x)||0,y:Number(item.shape.y)||0,w:Number(item.shape.w)||340,h:Number(item.shape.h)||180}:null;}const found=shapeLineOwner(song,parsed.id);if(!found)return null;return{x:(Number(found.section.shape.x)||0)+(Number(found.line.shape?.x)||0),y:(Number(found.section.shape.y)||0)+SHAPE_SECTION_HEADER+(Number(found.line.shape?.y)||0),w:Number(found.line.shape?.w)||220,h:Number(found.line.shape?.h)||54};}
  function setShapeAbsolutePosition(song,key,x,y){const parsed=parseShapeKey(key);if(parsed.kind==='block'){const item=shapeObject(song,key);if(item){item.x=x;item.y=y;}}else if(parsed.kind==='section'){const item=shapeObject(song,key);if(item){item.shape.x=x;item.shape.y=y;}}else{const found=shapeLineOwner(song,parsed.id);if(found){found.line.shape ||= {x:12,y:10,w:240,h:56};found.line.shape.x=x-found.section.shape.x;found.line.shape.y=y-found.section.shape.y-SHAPE_SECTION_HEADER;}}}
  function allShapeEntries(song){return[...(song.shapeBlocks||[]).map(block=>shapeKey('block',block.id)),...(song.sections||[]).map(section=>shapeKey('section',section.id)),...(song.sections||[]).flatMap(section=>section.lines.map(line=>shapeKey('line',line.id)))];}
  function updateShapeTransform(song,viewport=document.querySelector('.shape-viewport')){const world=viewport?.querySelector('.shape-world');if(world)world.style.transform=`translate(${song.shapeView.panX}px,${song.shapeView.panY}px) scale(${song.shapeView.zoom})`;const label=viewport?.parentElement?.querySelector('.shape-zoom-label');if(label)label.textContent=`${Math.round(song.shapeView.zoom*100)}%`;}
  function rememberShapeSelection(song){song.shapeView.selection=[...shapeSelection];scheduleSave();}
  function restoreShapeSelection(song){if(shapeSelection.size)return;const valid=new Set(allShapeEntries(song));(song.shapeView.selection||[]).forEach(key=>{if(valid.has(key))shapeSelection.add(key);});}

  function phoneShapeLayout(){return window.matchMedia?.('(max-width: 700px), (max-width: 950px) and (max-height: 500px)').matches;}
  function touchCraftLayout(){return window.matchMedia?.('(max-width: 1366px)').matches;}
  function mobileDragHandle(button,item,selector,onDrop,label='Move item',lift=item,targetResolver=null,axis='y'){
    button.classList.add('mobile-drag-handle');button.title=`Drag to ${label.toLowerCase()}`;button.setAttribute('aria-label',label);button.setAttribute('aria-description','Touch and drag to reorder.');
    button.onpointerdown=event=>{if(!touchCraftLayout())return;event.preventDefault();event.stopPropagation();closeOverlay();mobileTouchDrag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,startScrollTop:els.viewHost?.scrollTop||0,item,lift,selector,onDrop,targetResolver,axis,target:null,dropAfter:false,moved:false};button.setPointerCapture?.(event.pointerId);item.classList.add('mobile-drag-source');lift.classList.add('mobile-dragging');document.body.classList.add('mobile-reordering');navigator.vibrate?.(7);};
  }
  function mobileDragTargetAtPoint(drag,event){const hits=document.elementsFromPoint?.(event.clientX,event.clientY)||[document.elementFromPoint(event.clientX,event.clientY)].filter(Boolean);for(const under of hits){if(under===drag.item||drag.item.contains(under))continue;const resolved=drag.targetResolver?drag.targetResolver(under,event,drag):under.closest?.(drag.selector);if(resolved&&resolved!==drag.item)return resolved;}return null;}
  function mobileTouchPointerMove(event){
    const drag=mobileTouchDrag;if(!drag||event.pointerId!==drag.pointerId)return;event.preventDefault();drag.lastX=event.clientX;drag.lastY=event.clientY;const host=els.viewHost,deltaX=drag.axis==='both'?event.clientX-drag.startX:0,deltaY=event.clientY-drag.startY+((host?.scrollTop||0)-drag.startScrollTop);if(Math.hypot(deltaX,deltaY)>4)drag.moved=true;drag.lift.style.transform=`translate3d(${deltaX}px,${deltaY}px,0)`;const previousTarget=drag.target;drag.target?.classList.remove('mobile-drop-target','mobile-drop-before','mobile-drop-after');drag.target=mobileDragTargetAtPoint(drag,event);if(drag.target){const bounds=drag.target.getBoundingClientRect();drag.dropAfter=Boolean(drag.target.dataset.lineId)&&event.clientY>=bounds.top+bounds.height/2;drag.target.classList.add('mobile-drop-target',drag.dropAfter?'mobile-drop-after':'mobile-drop-before');}if(drag.target&&drag.target!==previousTarget)navigator.vibrate?.(4);const rect=host?.getBoundingClientRect();if(rect){const edge=Math.min(82,rect.height*.16);if(event.clientY<rect.top+edge)host.scrollTop-=Math.max(8,(rect.top+edge-event.clientY)*.22);else if(event.clientY>rect.bottom-edge)host.scrollTop+=Math.max(8,(event.clientY-(rect.bottom-edge))* .22);}
  }
  function mobileTouchPointerUp(event){
    const drag=mobileTouchDrag;if(!drag||event.pointerId!==drag.pointerId)return;mobileTouchDrag=null;const previousTarget=drag.target;if(event.type!=='pointercancel'){drag.target=mobileDragTargetAtPoint(drag,event);if(drag.target?.dataset.lineId){const bounds=drag.target.getBoundingClientRect();drag.dropAfter=event.clientY>=bounds.top+bounds.height/2;}}previousTarget?.classList.remove('mobile-drop-target','mobile-drop-before','mobile-drop-after');drag.target?.classList.remove('mobile-drop-target','mobile-drop-before','mobile-drop-after');drag.item.classList.remove('mobile-drag-source');drag.lift.classList.remove('mobile-dragging');drag.lift.style.transform='';document.body.classList.remove('mobile-reordering');if(event.type!=='pointercancel'&&drag.moved){mobileTouchSuppressClick=drag.item;requestAnimationFrame(()=>{if(mobileTouchSuppressClick===drag.item)mobileTouchSuppressClick=null;});if(drag.target)drag.onDrop(drag.target,drag);}
  }
  function writeMobileDropTarget(under,event,sourceRow,sourceSectionId){const targetRow=under?.closest?.('.notebook-row');if(targetRow&&targetRow!==sourceRow)return targetRow;const targetSection=under?.closest?.('.write-section');if(!targetSection)return null;if(targetSection.dataset.sectionId!==sourceSectionId)return targetSection;const remaining=[...targetSection.querySelectorAll('.notebook-row')].filter(item=>item!==sourceRow);const last=remaining.at(-1);return !last||event.clientY>last.getBoundingClientRect().bottom?targetSection:null;}
  function mobileResetLinePositions(section){section.lines.forEach((line,index)=>{line.shape={x:12,y:10+index*68,w:Math.max(180,(section.shape?.w||340)-24),h:line.kind==='progression'?52:58};});expandSectionToContents(section);}
  function mobileReorderBlocks(song,block,targetBlock){const ordered=song.shapeBlocks.slice().sort((a,b)=>(a.y-b.y)||(a.x-b.x)),from=ordered.indexOf(block),to=ordered.indexOf(targetBlock);if(from<0||to<0||from===to)return;perform('Moved loose line',()=>{ordered.splice(from,1);ordered.splice(to,0,block);let y=100;ordered.forEach(item=>{item.y=y;y+=Math.max(84,Number(item.h)||100)+24;});},'Loose line moved');}
  function mobileMoveSectionToIndex(song,section,target){const index=song.sections.indexOf(section),next=clamp(target,0,song.sections.length-1);if(index===next)return;perform('Moved section',()=>{song.sections.splice(index,1);song.sections.splice(next,0,section);let y=120;song.sections.forEach(item=>{item.shape.x=160;item.shape.y=y;y+=(item.shape.h||180)+60;});},'Section moved');}
  function mobileMoveSection(song,section,direction){const index=song.sections.indexOf(section),target=clamp(index+direction,0,song.sections.length-1);if(index===target)return;perform('Moved section',()=>{song.sections.splice(index,1);song.sections.splice(target,0,section);let y=120;song.sections.forEach(item=>{item.shape.x=160;item.shape.y=y;y+=(item.shape.h||180)+60;});},'Section moved');}
  function mobileMoveLine(song,source,line,target,index){perform(source===target?'Moved line':'Moved line to section',()=>{source.lines=source.lines.filter(item=>item.id!==line.id);target.lines.splice(clamp(index,0,target.lines.length),0,line);mobileResetLinePositions(source);if(target!==source)mobileResetLinePositions(target);activeSectionId=target.id;activeLineId=line.id;},source===target?'Line moved':`Moved to ${target.label}`);}
  function focusMobileShapeEditor(selector,select=false){requestAnimationFrame(()=>{const editor=document.querySelector(selector);if(!editor)return;editor.focus();if(select&&editor.select)editor.select();if(editor.tagName==='TEXTAREA')autoGrow(editor,44);editor.scrollIntoView({block:'center'});});}
  function mobileShapeTextEditor(value,placeholder,label,oninput,onblur){const editor=document.createElement('textarea');editor.className='shape-mobile-copy';editor.rows=1;editor.value=value||'';editor.placeholder=placeholder;editor.setAttribute('aria-label',label);editor.onfocus=()=>{activeEditor=editor;autoGrow(editor,44);};editor.oninput=()=>{oninput(editor.value);autoGrow(editor,44);};editor.onkeydown=event=>{if(event.key==='Escape'||((event.metaKey||event.ctrlKey)&&event.key==='Enter')){event.preventDefault();editor.blur();}};editor.onblur=()=>{if(activeEditor===editor)activeEditor=null;onblur?.(editor.value);};requestAnimationFrame(()=>{if(document.body.contains(editor))autoGrow(editor,44);});return editor;}
  function addMobileShapeBlock(song){const block=createBlock('fragment','',160,100+song.shapeBlocks.length*120);song.shapeBlocks.push(block);touch(song);render();focusMobileShapeEditor(`[data-mobile-block-id="${CSS.escape(block.id)}"] .shape-mobile-copy`);}
  function addMobileShapeSection(song){const section=createSection('New section',[],160,120+song.sections.length*250);section.shape.h=180;song.sections.push(section);mobileShapeExpandedSectionId=section.id;activeSectionId=section.id;touch(song);render();focusMobileShapeEditor(`[data-mobile-section-id="${CSS.escape(section.id)}"] .shape-mobile-section-title`,true);}
  function addMobileShapeLine(song,section,kind='lyric'){const line=createLine('',kind,sectionKey(song,section));section.lines.push(line);section.collapsed=false;mobileShapeExpandedSectionId=section.id;activeSectionId=section.id;mobileResetLinePositions(section);touch(song);render();focusMobileShapeEditor(`[data-mobile-line-id="${CSS.escape(line.id)}"] .shape-mobile-copy`);}
  function duplicateMobileShapeBlock(song,block){perform('Duplicated loose line',()=>{const copy=clone(block);copy.id=uid('block');copy.x+=24;copy.y+=70;song.shapeBlocks.push(copy);},'Loose line duplicated');}
  function moveMobileBlock(song,block){const choices=song.sections.map(section=>[section.label,()=>addShapeBlockToSection(song,block,section)]);if(!choices.length){toast('Add a section first');return;}openChoiceModal('Move loose line to',choices,'It becomes a line in that section.');}
  function moveMobileShapeLine(song,section,line){const choices=[['Loose lines',()=>liftLineToShape(song,section,line,160,100+song.shapeBlocks.length*120)],...song.sections.filter(item=>item.id!==section.id).map(target=>[target.label,()=>mobileMoveLine(song,section,line,target,target.lines.length)])];openChoiceModal('Move line to',choices,'Words and attached chords move together.');}
  function mobileSectionMenu(song,section,anchor){const index=song.sections.indexOf(section),items=[];if(index>0)items.push(['Move section up',()=>mobileMoveSection(song,section,-1)]);if(index<song.sections.length-1)items.push(['Move section down',()=>mobileMoveSection(song,section,1)]);items.push(['Add chord row',()=>addMobileShapeLine(song,section,'progression')],['Delete section',()=>perform('Deleted section',()=>song.sections=song.sections.filter(item=>item.id!==section.id),'Section deleted'),'danger']);openMenu(anchor,items);}

  function renderMobileShape(song){
    if(!song.sections.some(section=>section.id===mobileShapeExpandedSectionId))mobileShapeExpandedSectionId=activeSectionId&&song.sections.some(section=>section.id===activeSectionId)?activeSectionId:song.sections[0]?.id||null;
    const view=document.createElement('div');view.className='shape-mobile';const intro=document.createElement('header');intro.className='shape-mobile-intro';intro.innerHTML='<div><span>SHAPE</span><h2>See the whole song.</h2></div><p>Move sections and loose lines. Open one section when you need its detail.</p>';view.append(intro);
    const loose=document.createElement('section');loose.className='shape-mobile-group loose';const looseHead=document.createElement('header');looseHead.innerHTML=`<div><strong>Loose lines</strong><small>${song.shapeBlocks.length} ${song.shapeBlocks.length===1?'piece':'pieces'}</small></div>`;const addLoose=document.createElement('button');addLoose.className='text-button';addLoose.textContent='+ Add';addLoose.onclick=()=>addMobileShapeBlock(song);looseHead.append(addLoose);loose.append(looseHead);
    const orderedBlocks=song.shapeBlocks.slice().sort((a,b)=>(a.y-b.y)||(a.x-b.x));if(!orderedBlocks.length){const empty=document.createElement('p');empty.className='shape-mobile-empty';empty.textContent='No loose lines. Add one here, or move a line out of a section.';loose.append(empty);}
    orderedBlocks.forEach((block,index)=>{
      const card=document.createElement('article');card.className=`shape-mobile-fragment${block.type==='harmony'?' is-harmony':''}`;card.dataset.mobileBlockId=block.id;
      const edit=mobileShapeTextEditor(block.text,'Write a loose line…',block.type==='harmony'?'Progression':'Loose line',value=>{block.text=value;touch(song);},value=>{if(block.type==='fragment'&&looksLikeProgression(value))block.type='harmony';touch(song);});
      const actions=document.createElement('div');actions.className='shape-mobile-actions';const drag=document.createElement('button');drag.className='icon-button';drag.textContent='⋮⋮';mobileDragHandle(drag,card,'[data-mobile-block-id]',target=>mobileReorderBlocks(song,block,song.shapeBlocks.find(item=>item.id===target.dataset.mobileBlockId)),'Move loose line');
      const move=document.createElement('button');move.className='ghost-button';move.textContent='To section';move.onclick=()=>moveMobileBlock(song,block);
      const more=document.createElement('button');more.className='icon-button';more.textContent='•••';more.setAttribute('aria-label','Loose line menu');more.onclick=()=>{const items=[];if(index>0)items.push(['Move up',()=>mobileReorderBlocks(song,block,orderedBlocks[index-1])]);if(index<orderedBlocks.length-1)items.push(['Move down',()=>mobileReorderBlocks(song,block,orderedBlocks[index+1])]);items.push(['Duplicate',()=>duplicateMobileShapeBlock(song,block)],['Delete',()=>perform('Deleted loose line',()=>song.shapeBlocks=song.shapeBlocks.filter(item=>item.id!==block.id),'Loose line deleted'),'danger']);openMenu(more,items);};
      actions.append(drag,move,more);card.append(edit,actions);loose.append(card);
    });view.append(loose);
    const sections=document.createElement('section');sections.className='shape-mobile-sections';const heading=document.createElement('header');heading.innerHTML=`<div><strong>Sections</strong><small>${song.sections.length}</small></div>`;const addSection=document.createElement('button');addSection.className='text-button';addSection.textContent='+ Add';addSection.onclick=()=>addMobileShapeSection(song);heading.append(addSection);sections.append(heading);
    if(!song.sections.length){const empty=document.createElement('p');empty.className='shape-mobile-empty';empty.textContent='No sections yet. Add the first one when the song starts to take shape.';sections.append(empty);}
    song.sections.forEach(section=>{
      const card=document.createElement('details');card.className='shape-mobile-section';card.dataset.mobileSectionId=section.id;card.open=section.id===mobileShapeExpandedSectionId;card.ontoggle=()=>{if(card.open){mobileShapeExpandedSectionId=section.id;activeSectionId=section.id;document.querySelectorAll('.shape-mobile-section[open]').forEach(item=>{if(item!==card)item.open=false;});requestAnimationFrame(()=>card.scrollIntoView({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));}else if(mobileShapeExpandedSectionId===section.id)mobileShapeExpandedSectionId=null;};
      const summary=document.createElement('summary');summary.className='shape-mobile-section-summary';const title=document.createElement('input');title.className='shape-mobile-section-title';title.value=section.label;title.setAttribute('aria-label','Section name');title.onpointerdown=event=>event.stopPropagation();title.onclick=event=>event.stopPropagation();title.oninput=()=>{section.label=title.value;touch(song);};title.onkeydown=event=>{if(event.key==='Enter'||event.key==='Escape'){event.preventDefault();title.blur();}};title.onblur=()=>{if(!title.value.trim()){section.label='Untitled section';title.value=section.label;touch(song);}};const chordCount=section.lines.reduce((total,line)=>total+(line.kind==='progression'?progressionTokens(line.text).length:(line.chords||[]).length),0);const count=document.createElement('small');count.textContent=`${section.lines.length} ${section.lines.length===1?'line':'lines'}${chordCount?` · ${chordCount} chord${chordCount===1?'':'s'}`:''}`;const preview=document.createElement('p');preview.className='shape-mobile-section-preview';preview.textContent=section.lines.find(line=>line.text.trim())?.text||'Empty section';summary.append(title,count,preview);
      const controls=document.createElement('div');controls.className='shape-mobile-actions shape-mobile-section-actions';const drag=document.createElement('button');drag.className='icon-button';drag.textContent='⋮⋮';mobileDragHandle(drag,card,'[data-mobile-section-id]',target=>mobileMoveSectionToIndex(song,section,song.sections.findIndex(item=>item.id===target.dataset.mobileSectionId)),'Move section',controls);const write=document.createElement('button');write.className='ghost-button';write.textContent='Write';write.onclick=()=>{activeSectionId=section.id;activeLineId=section.lines[0]?.id||null;setView('write');requestAnimationFrame(()=>document.getElementById(`write-${section.id}`)?.scrollIntoView({block:'start'}));};const more=document.createElement('button');more.className='icon-button';more.textContent='•••';more.setAttribute('aria-label',`${section.label} section menu`);more.onclick=()=>mobileSectionMenu(song,section,more);controls.append(drag,write,more);card.append(summary,controls);
      const list=document.createElement('div');list.className='shape-mobile-lines';if(!section.lines.length){const empty=document.createElement('p');empty.className='shape-mobile-empty';empty.textContent='No lines in this section.';list.append(empty);}
      section.lines.forEach((line,lineIndex)=>{
        const row=document.createElement('article');row.className=`shape-mobile-line${line.kind==='progression'?' is-progression':''}`;row.dataset.mobileLineId=line.id;row.dataset.mobileSectionId=section.id;
        const copy=mobileShapeTextEditor(line.text,line.kind==='progression'?'Add chords…':'Write a line…',line.kind==='progression'?'Chord row':'Lyric line',value=>{if(line.kind==='lyric')line.chords=NE.adjustAnchors(line.chords||[],line.text,value);line.text=value;touch(song);},()=>{mobileResetLinePositions(section);touch(song);});
        const rowActions=document.createElement('div');rowActions.className='shape-mobile-actions';const lineDrag=document.createElement('button');lineDrag.className='icon-button';lineDrag.textContent='⋮⋮';mobileDragHandle(lineDrag,row,'[data-mobile-line-id],.shape-mobile-section',target=>{const targetLineId=target.dataset.mobileLineId;if(targetLineId){const found=findLine(song,targetLineId);if(found)mobileMoveLine(song,section,line,found.section,found.section.lines.indexOf(found.line));}else{const targetSection=findSection(song,target.dataset.mobileSectionId);if(targetSection)mobileMoveLine(song,section,line,targetSection,targetSection.lines.length);}},'Move line');const more=document.createElement('button');more.className='icon-button shape-mobile-line-menu';more.textContent='•••';more.setAttribute('aria-label','Line menu');more.onclick=()=>{const items=[];if(lineIndex>0)items.push(['Move up',()=>mobileMoveLine(song,section,line,section,lineIndex-1)]);if(lineIndex<section.lines.length-1)items.push(['Move down',()=>mobileMoveLine(song,section,line,section,lineIndex+1)]);items.push(['Move to another section…',()=>moveMobileShapeLine(song,section,line)]);openMenu(more,items);};rowActions.append(lineDrag,more);row.append(copy,rowActions);list.append(row);
      });
      const add=document.createElement('button');add.className='shape-mobile-add-line';add.textContent='+ Add line';add.onclick=()=>addMobileShapeLine(song,section,'lyric');list.append(add);card.append(list);sections.append(card);
    });view.append(sections);els.viewHost.append(view);
  }

  function renderShape(song) {
    if(phoneShapeLayout()){renderMobileShape(song);return;}
    restoreShapeSelection(song);
    song.sections.forEach(ensureSectionLineShapes);
    const view=document.createElement('div');view.className='shape-view';
    const viewport=document.createElement('div');viewport.className=`shape-viewport${state.shapeTool==='hand'?' hand':''}`;
    const world=document.createElement('div');world.className='shape-world';world.style.transform=`translate(${song.shapeView.panX}px,${song.shapeView.panY}px) scale(${song.shapeView.zoom})`;
    song.shapeBlocks.forEach(block=>world.append(renderShapeBlock(song,block)));
    song.sections.forEach(section=>world.append(renderShapeSection(song,section)));
    viewport.append(world);
    viewport.onpointerdown=event=>beginShapeCanvasPointer(event,song,viewport,world);
    viewport.onwheel=event=>handleShapeWheel(event,song,viewport);
    viewport.ondblclick=event=>{if(event.target!==viewport&&event.target!==world)return;event.preventDefault();const point=clientToWorld(event.clientX,event.clientY,viewport,song);addShapeBlock(song,'fragment',point);};
    viewport.ondragover=event=>{if(['shape-line','shelf-chord','shelf-progression'].includes(dragData?.kind))event.preventDefault();};
    viewport.ondrop=event=>dropToShapeBoard(event,song,viewport);
    const zoom=document.createElement('div');zoom.className='shape-zoom';
    const minus=document.createElement('button');minus.textContent='−';minus.title='Zoom out';minus.onclick=()=>setShapeZoom(song,song.shapeView.zoom-.1);
    const label=document.createElement('button');label.className='shape-zoom-label';label.textContent=`${Math.round(song.shapeView.zoom*100)}%`;label.title='Shape view options';label.onclick=()=>openMenu(label,[['100%',()=>setShapeZoom(song,1)],['Fit board',()=>fitShapeView(song,false)],['Fit selection',()=>fitShapeView(song,true)],['Centre selection',()=>centreShapeSelection(song)]]);
    const plus=document.createElement('button');plus.textContent='+';plus.title='Zoom in';plus.onclick=()=>setShapeZoom(song,song.shapeView.zoom+.1);
    zoom.append(minus,label,plus);
    view.append(viewport,zoom);els.viewHost.append(view);
  }

  function renderShapeBlock(song,block) {
    const key=shapeKey('block',block.id);const article=document.createElement('article');article.className=`shape-object shape-block${shapeSelection.has(key)?' selected':''}`;article.dataset.type=block.type;article.dataset.shapeKey=key;if(block.demoKey)article.dataset.demoKey=block.demoKey;article.style.left=`${block.x}px`;article.style.top=`${block.y}px`;article.style.width=`${block.w||220}px`;article.style.height=`${block.h||96}px`;
    const head=document.createElement('header');head.className='shape-block-head';const grip=document.createElement('button');grip.className='shape-grip';grip.textContent='⋮⋮';grip.title='Move loose line';grip.setAttribute('aria-label','Move loose line');grip.onpointerdown=event=>beginShapeObjectPointer(event,song,key,true);const label=document.createElement('span');label.className='shape-label';label.textContent=block.type==='harmony'?'Progression':block.type==='title'?'Title':'';const more=document.createElement('button');more.className='shape-more';more.textContent='•••';more.setAttribute('aria-label','Loose line menu');more.onclick=event=>{event.stopPropagation();openShapeBlockMenu(song,block,more);};head.append(grip,label,more);article.append(head);
    if(shapeEditingKey===key){const textarea=document.createElement('textarea');textarea.value=block.text;textarea.placeholder='Loose line';textarea.onpointerdown=event=>event.stopPropagation();textarea.oninput=()=>{block.text=textarea.value;autoGrow(textarea,62);requestAnimationFrame(()=>{block.h=Math.max(88,article.offsetHeight);touch(song);});};textarea.onblur=()=>{shapeEditingKey=null;block.h=Math.max(88,article.offsetHeight);touch(song);renderView(song);};textarea.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();textarea.blur();}};article.append(textarea);requestAnimationFrame(()=>{autoGrow(textarea,62);textarea.focus();textarea.selectionStart=textarea.selectionEnd=textarea.value.length;});}
    else{const copy=document.createElement('div');copy.className=`shape-copy${block.type==='harmony'?' progression-copy':''}`;copy.textContent=block.type==='harmony'?displayProgression(block.text,song,state.chordDisplay,song.key):(block.text||'Blank loose line');article.append(copy);}
    if(block.chords?.length&&shapeSelection.has(key)){const summary=document.createElement('button');summary.className='shape-chord-summary';summary.textContent=`${block.chords.length} chord${block.chords.length===1?'':'s'}`;summary.title='Attached harmony returns with this lyric when placed in the song';summary.onclick=event=>{event.stopPropagation();openChoicePopover(summary,'Attached chords',block.chords.map(chord=>[storedChordToDisplay(chord.value,song,state.chordDisplay,song.key),()=>{}]));};article.append(summary);}
    const resize=document.createElement('button');resize.className='shape-resize-handle';resize.textContent='↘';resize.setAttribute('aria-label','Resize loose line');resize.onpointerdown=event=>beginShapeResizePointer(event,song,key,article);article.append(resize);
    article.onpointerdown=event=>beginShapeObjectPointer(event,song,key,false);article.onpointerup=event=>{if(event.target.closest('textarea'))return;const width=Math.round(article.offsetWidth),height=Math.round(article.offsetHeight);if(width!==block.w||height!==block.h){block.w=width;block.h=height;block.userSized=true;touch(song);}};article.ondblclick=event=>{if(event.target.closest('button'))return;event.preventDefault();event.stopPropagation();shapeEditingKey=key;selectShapeObject(key,false);rememberShapeSelection(song);renderView(song);};return article;
  }

  function renderShapeSection(song,section) {
    ensureSectionLineShapes(section);
    const key=shapeKey('section',section.id);const article=document.createElement('section');article.className=`shape-object shape-section${shapeSelection.has(key)?' selected':''}`;article.dataset.shapeKey=key;if(section.demoKey)article.dataset.demoKey=section.demoKey;article.style.left=`${section.shape.x}px`;article.style.top=`${section.shape.y}px`;article.style.width=`${section.shape.w}px`;article.style.height=`${section.shape.h}px`;
    const head=document.createElement('header');head.className='shape-section-head';const grip=document.createElement('button');grip.className='shape-grip';grip.textContent='⋮⋮';grip.title='Move section';grip.setAttribute('aria-label','Move section');grip.onpointerdown=event=>beginShapeObjectPointer(event,song,key,true);const title=document.createElement('div');title.className='shape-section-title';title.textContent=section.label;title.onpointerdown=event=>beginShapeObjectPointer(event,song,key,true);title.ondblclick=event=>{event.preventDefault();event.stopPropagation();openFormModal('Rename section',[{name:'label',label:'Section name',type:'text',value:section.label,required:true}],values=>{section.label=values.label.trim();touch(song);render();});};const more=document.createElement('button');more.className='shape-more';more.textContent='•••';more.setAttribute('aria-label',`${section.label} section menu`);more.onclick=e=>{e.stopPropagation();openSectionMenu(song,section,more);};head.append(grip,title,more);
    const canvas=document.createElement('div');canvas.className='shape-section-canvas';
    section.lines.forEach(line=>canvas.append(renderShapeSectionLine(song,section,line)));
    if(!section.lines.length){const empty=document.createElement('div');empty.className='shape-empty';empty.textContent='Drop a loose line here';canvas.append(empty);}
    const resize=document.createElement('button');resize.className='shape-resize-handle';resize.textContent='↘';resize.setAttribute('aria-label',`Resize ${section.label} section`);resize.onpointerdown=event=>beginShapeResizePointer(event,song,key,article);article.append(head,canvas,resize);
    article.onpointerdown=event=>{if(event.target.closest('.shape-section-head,.shape-line-chip,button,textarea'))return;event.stopPropagation();selectShapeObject(key,event.shiftKey);updateShapeSelectionUI(song);};
    article.onpointerup=()=>{const width=Math.round(article.offsetWidth),height=Math.round(article.offsetHeight);if(width!==section.shape.w||height!==section.shape.h){section.shape.w=width;section.shape.h=height;touch(song);}};
    return article;
  }

  function renderShapeSectionLine(song,section,line){
    const key=shapeKey('line',line.id);const chip=document.createElement('article');chip.className=`shape-line-chip${line.kind==='progression'?' harmony':''}${shapeSelection.has(key)?' selected':''}`;chip.dataset.shapeKey=key;chip.dataset.lineId=line.id;chip.style.left=`${line.shape.x}px`;chip.style.top=`${line.shape.y}px`;chip.style.width=`${line.shape.w}px`;chip.style.minHeight=`${line.shape.h}px`;
    if(shapeEditingKey===key){const textarea=document.createElement('textarea');textarea.value=line.text;textarea.onpointerdown=event=>event.stopPropagation();textarea.oninput=()=>{const previous=line.text;line.text=textarea.value;if(line.kind==='lyric')line.chords=NE.adjustAnchors(line.chords,previous,line.text);autoGrow(textarea,42);requestAnimationFrame(()=>{line.shape.h=Math.max(42,chip.offsetHeight);expandSectionToContents(section);touch(song);});};textarea.onblur=()=>{shapeEditingKey=null;line.shape.h=Math.max(42,chip.offsetHeight);expandSectionToContents(section);sortSectionLinesByShape(section);touch(song);renderView(song);};textarea.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();textarea.blur();}};chip.append(textarea);requestAnimationFrame(()=>{autoGrow(textarea,42);textarea.focus();textarea.selectionStart=textarea.selectionEnd=textarea.value.length;});}
    else{const copy=document.createElement('div');copy.className='shape-line-copy';copy.textContent=line.kind==='progression'?displayProgression(line.text,song,state.chordDisplay,sectionKey(song,section)):(line.text||'Blank line');chip.append(copy);const more=document.createElement('button');more.className='shape-line-more';more.textContent='•••';more.title='Line options';more.setAttribute('aria-label','Line options');more.onclick=event=>{event.stopPropagation();openMenu(more,[['Make loose',()=>liftLineToShape(song,section,line,section.shape.x+line.shape.x,section.shape.y+SHAPE_SECTION_HEADER+line.shape.y)],['Open in Write',()=>{activeSectionId=section.id;activeLineId=line.id;setView('write');requestAnimationFrame(()=>document.querySelector(`[data-line-id="${CSS.escape(line.id)}"]`)?.scrollIntoView({block:'center'}));}],['Delete',()=>perform('Deleted line',()=>section.lines=section.lines.filter(item=>item.id!==line.id),'Line deleted'),'danger']]);};chip.append(more);}
    chip.onpointerdown=event=>beginShapeObjectPointer(event,song,key,false);chip.ondblclick=event=>{if(event.target.closest('button'))return;event.preventDefault();event.stopPropagation();shapeEditingKey=key;selectShapeObject(key,false);rememberShapeSelection(song);renderView(song);};requestAnimationFrame(()=>{line.shape.h=Math.max(42,chip.offsetHeight);});return chip;
  }

  function selectShapeObject(key,add=false){
    const song=currentSong(),parsed=parseShapeKey(key);
    if(!add)shapeSelection.clear();
    if(add&&shapeSelection.has(key))shapeSelection.delete(key);else shapeSelection.add(key);
    if(song&&parsed.kind==='section'){const section=findSection(song,parsed.id);section?.lines.forEach(line=>shapeSelection.delete(shapeKey('line',line.id)));}
    if(song&&parsed.kind==='line'){const owner=shapeLineOwner(song,parsed.id);if(owner)shapeSelection.delete(shapeKey('section',owner.section.id));}
  }

  function beginShapeObjectPointer(event,song,key,fromGrip=false){
    if(event.button!==0)return;
    if(event.target.closest('textarea,input')||(!fromGrip&&event.target.closest('button')))return;
    if(!fromGrip){const rect=event.currentTarget.getBoundingClientRect();if(event.clientX>=rect.right-20&&event.clientY>=rect.bottom-20)return;}
    if(state.shapeTool==='hand'||spaceHeld){const viewport=document.querySelector('.shape-viewport');if(viewport){event.preventDefault();event.stopPropagation();shapeInteraction={type:'pan-pending',song,viewport,world:viewport.querySelector('.shape-world'),startX:event.clientX,startY:event.clientY,panX:song.shapeView.panX,panY:song.shapeView.panY,add:false,pointerId:event.pointerId,lastX:event.clientX,lastY:event.clientY};try{viewport.setPointerCapture(event.pointerId);}catch(_error){}}return;}
    event.preventDefault();event.stopPropagation();
    if(event.shiftKey){if(shapeSelection.has(key))shapeSelection.delete(key);else shapeSelection.add(key);}else if(!shapeSelection.has(key)){shapeSelection.clear();shapeSelection.add(key);}
    updateShapeSelectionUI(song);
    const origins={};shapeSelection.forEach(selected=>{const box=shapeAbsoluteBox(song,selected);if(box)origins[selected]={x:box.x,y:box.y};});
    const viewport=document.querySelector('.shape-viewport');
    shapeInteraction={type:'object-pending',song,key,startX:event.clientX,startY:event.clientY,startWorld:clientToWorld(event.clientX,event.clientY,viewport,song),origins,moved:false,fromGrip,pointerId:event.pointerId,target:event.currentTarget,viewport,lastX:event.clientX,lastY:event.clientY};
    try{event.currentTarget.setPointerCapture(event.pointerId);}catch(_error){}
  }

  function updateShapeSelectionUI(song){document.querySelectorAll('.shape-object[data-shape-key],.shape-line-chip[data-shape-key]').forEach(element=>element.classList.toggle('selected',shapeSelection.has(element.dataset.shapeKey)));rememberShapeSelection(song);renderToolbar(song);}
  function beginShapeMove(event,song,key){beginShapeObjectPointer(event,song,key,true);}
  function beginShapeResizePointer(event,song,key,element){
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();const box=shapeAbsoluteBox(song,key),viewport=document.querySelector('.shape-viewport');if(!box||!viewport)return;shapeSelection.clear();shapeSelection.add(key);updateShapeSelectionUI(song);shapeInteraction={type:'resize-pending',song,key,element,viewport,startX:event.clientX,startY:event.clientY,startW:box.w,startH:box.h,pointerId:event.pointerId,moved:false};try{event.currentTarget.setPointerCapture(event.pointerId);}catch(_error){}
  }
  function beginShapeCanvasPointer(event,song,viewport,world){if(event.target!==viewport&&event.target!==world)return;const panMode=state.shapeTool==='hand'||spaceHeld||event.button===1;event.preventDefault();shapeInteraction={type:panMode?'pan-pending':'canvas-pending',song,viewport,world,startX:event.clientX,startY:event.clientY,panX:song.shapeView.panX,panY:song.shapeView.panY,add:event.shiftKey,pointerId:event.pointerId,lastX:event.clientX,lastY:event.clientY};try{viewport.setPointerCapture(event.pointerId);}catch(_error){}}
  function clientToWorld(clientX,clientY,viewport,song){const rect=viewport.getBoundingClientRect();return{x:(clientX-rect.left-song.shapeView.panX)/song.shapeView.zoom,y:(clientY-rect.top-song.shapeView.panY)/song.shapeView.zoom};}

  function handleShapeWheel(event,song,viewport){
    if(event.target.closest('textarea,input,select,[contenteditable="true"],.menu,.modal-card,.workbench'))return;
    event.preventDefault();
    if(event.ctrlKey||event.metaKey){const factor=Math.exp(-event.deltaY*.008);setShapeZoomAt(song,song.shapeView.zoom*factor,event.clientX,event.clientY,viewport,false);}
    else{const horizontal=event.shiftKey&&Math.abs(event.deltaX)<1?event.deltaY:event.deltaX;song.shapeView.panX-=horizontal;song.shapeView.panY-=event.shiftKey?0:event.deltaY;updateShapeTransform(song,viewport);}
    clearTimeout(viewport._wheelSaveTimer);viewport._wheelSaveTimer=setTimeout(scheduleSave,140);
  }

  function applyShapeMove(interaction,clientX,clientY){const song=interaction.song;const current=clientToWorld(clientX,clientY,interaction.viewport,song);const dx=current.x-interaction.startWorld.x,dy=current.y-interaction.startWorld.y;Object.entries(interaction.origins).forEach(([key,origin])=>{setShapeAbsolutePosition(song,key,Math.round(origin.x+dx),Math.round(origin.y+dy));const parsed=parseShapeKey(key),element=document.querySelector(`[data-shape-key="${CSS.escape(key)}"]`);if(!element)return;if(parsed.kind==='line'){const found=shapeLineOwner(song,parsed.id);if(found){element.style.left=`${Math.round(found.line.shape.x)}px`;element.style.top=`${Math.round(found.line.shape.y)}px`;}}else{const item=shapeObject(song,key),box=parsed.kind==='section'?item.shape:item;element.style.left=`${Math.round(box.x)}px`;element.style.top=`${Math.round(box.y)}px`;}});}

  function autoPanSpeed(position,start,end){const edge=54;if(position<start+edge)return-Math.ceil((start+edge-position)/7);if(position>end-edge)return Math.ceil((position-(end-edge))/7);return 0;}
  function startShapeAutoPan(){if(shapeAutoPanFrame)return;const tick=()=>{shapeAutoPanFrame=null;const interaction=shapeInteraction;if(!interaction||interaction.type!=='move')return;const rect=interaction.viewport.getBoundingClientRect();const dx=autoPanSpeed(interaction.lastX,rect.left,rect.right),dy=autoPanSpeed(interaction.lastY,rect.top,rect.bottom);if(dx||dy){interaction.song.shapeView.panX-=dx;interaction.song.shapeView.panY-=dy;updateShapeTransform(interaction.song,interaction.viewport);applyShapeMove(interaction,interaction.lastX,interaction.lastY);}shapeAutoPanFrame=requestAnimationFrame(tick);};shapeAutoPanFrame=requestAnimationFrame(tick);}
  function stopShapeAutoPan(){if(shapeAutoPanFrame)cancelAnimationFrame(shapeAutoPanFrame);shapeAutoPanFrame=null;}

  function shapePointerMove(event){
    if(!shapeInteraction)return;const interaction=shapeInteraction;const song=interaction.song;interaction.lastX=event.clientX;interaction.lastY=event.clientY;const distance=Math.hypot(event.clientX-interaction.startX,event.clientY-interaction.startY);
    if(interaction.type==='object-pending'&&distance>=6){snapshot('Moved Shape material');interaction.type='move';interaction.moved=true;Object.keys(interaction.origins).forEach(key=>document.querySelector(`[data-shape-key="${CSS.escape(key)}"]`)?.classList.add('moving'));startShapeAutoPan();}
    if(interaction.type==='resize-pending'&&distance>=4){snapshot('Resized Shape material');interaction.type='resize';interaction.moved=true;interaction.element.classList.add('resizing');}
    if(interaction.type==='pan-pending'&&distance>=4){interaction.type='pan';interaction.viewport.classList.add('panning');}
    if(interaction.type==='canvas-pending'&&distance>=6){if(!interaction.add)shapeSelection.clear();const point=clientToWorld(interaction.startX,interaction.startY,interaction.viewport,song);const lasso=document.createElement('div');lasso.className='shape-lasso';interaction.viewport.append(lasso);interaction.type='lasso';interaction.start=point;interaction.startClientX=interaction.startX;interaction.startClientY=interaction.startY;interaction.lasso=lasso;}
    if(interaction.type==='move')applyShapeMove(interaction,event.clientX,event.clientY);
    else if(interaction.type==='resize'){const parsed=parseShapeKey(interaction.key),scale=song.shapeView.zoom||1,minW=parsed.kind==='section'?260:150,minH=parsed.kind==='section'?160:88,w=Math.round(clamp(interaction.startW+(event.clientX-interaction.startX)/scale,minW,900)),h=Math.round(clamp(interaction.startH+(event.clientY-interaction.startY)/scale,minH,1100)),item=shapeObject(song,interaction.key),box=parsed.kind==='section'?item?.shape:item;if(box){box.w=w;box.h=h;if(parsed.kind==='block')box.userSized=true;interaction.element.style.width=`${w}px`;interaction.element.style.height=`${h}px`;}}
    else if(interaction.type==='pan'){song.shapeView.panX=interaction.panX+(event.clientX-interaction.startX);song.shapeView.panY=interaction.panY+(event.clientY-interaction.startY);updateShapeTransform(song,interaction.viewport);}
    else if(interaction.type==='lasso'){const rect=interaction.viewport.getBoundingClientRect();const x=Math.min(interaction.startClientX,event.clientX)-rect.left,y=Math.min(interaction.startClientY,event.clientY)-rect.top,w=Math.abs(event.clientX-interaction.startClientX),h=Math.abs(event.clientY-interaction.startClientY);Object.assign(interaction.lasso.style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`});}
  }

  function sectionAtPoint(song,x,y,excludeId=null){return song.sections.find(section=>section.id!==excludeId&&x>=section.shape.x&&x<=section.shape.x+section.shape.w&&y>=section.shape.y+SHAPE_SECTION_HEADER&&y<=section.shape.y+section.shape.h)||null;}
  function resolveShapeMove(song){
    let changedContainer=false;const affected=new Set();const nextSelection=new Set(shapeSelection);
    [...shapeSelection].forEach(key=>{const parsed=parseShapeKey(key),box=shapeAbsoluteBox(song,key);if(!box||parsed.kind==='section')return;const center={x:box.x+box.w/2,y:box.y+box.h/2};
      if(parsed.kind==='block'){const block=shapeObject(song,key),target=sectionAtPoint(song,center.x,center.y);if(!block||!target)return;const line=createLine(block.text,block.type==='harmony'?'progression':'lyric',sectionKey(song,target));if(block.sourceLineId)line.id=block.sourceLineId;if(block.chords?.length&&line.kind==='lyric')line.chords=clone(block.chords);line.shape={x:Math.max(8,box.x-target.shape.x),y:Math.max(8,box.y-target.shape.y-SHAPE_SECTION_HEADER),w:Math.max(160,box.w),h:Math.max(42,box.h)};target.lines.push(line);song.shapeBlocks=song.shapeBlocks.filter(item=>item.id!==block.id);nextSelection.delete(key);nextSelection.add(shapeKey('line',line.id));affected.add(target);changedContainer=true;return;}
      const found=shapeLineOwner(song,parsed.id);if(!found)return;const target=sectionAtPoint(song,center.x,center.y);if(target){if(target.id!==found.section.id){found.section.lines=found.section.lines.filter(item=>item.id!==found.line.id);target.lines.push(found.line);affected.add(found.section);changedContainer=true;}found.line.shape.x=Math.max(8,box.x-target.shape.x);found.line.shape.y=Math.max(8,box.y-target.shape.y-SHAPE_SECTION_HEADER);affected.add(target);}else{const block=createBlock(found.line.kind==='progression'?'harmony':'fragment',found.line.text,box.x,box.y,found.line.chords);block.w=box.w;block.h=box.h;block.sourceLineId=found.line.id;song.shapeBlocks.push(block);found.section.lines=found.section.lines.filter(item=>item.id!==found.line.id);affected.add(found.section);nextSelection.delete(key);nextSelection.add(shapeKey('block',block.id));changedContainer=true;}});
    affected.forEach(section=>{sortSectionLinesByShape(section);expandSectionToContents(section);});shapeSelection=nextSelection;rememberShapeSelection(song);return changedContainer;
  }

  function shapePointerUp(event){
    if(!shapeInteraction)return;const interaction=shapeInteraction;shapeInteraction=null;stopShapeAutoPan();const song=interaction.song;
    if(interaction.type==='object-pending'||interaction.type==='resize-pending'){updateShapeSelectionUI(song);return;}
    if(interaction.type==='canvas-pending'){if(!interaction.add)shapeSelection.clear();updateShapeSelectionUI(song);return;}
    if(interaction.type==='pan-pending')return;
    if(interaction.type==='move'){document.querySelectorAll('.shape-object.moving,.shape-line-chip.moving').forEach(el=>el.classList.remove('moving'));const changedContainer=resolveShapeMove(song);touch(song);render();toast(changedContainer?'Shape material placed':'Shape material moved',undo);return;}
    if(interaction.type==='resize'){interaction.element.classList.remove('resizing');touch(song);render();toast('Shape material resized',undo);return;}
    if(interaction.type==='pan'){interaction.viewport.classList.remove('panning');scheduleSave();return;}
    if(interaction.type==='lasso'){const end=clientToWorld(event.clientX,event.clientY,interaction.viewport,song);const box={x:Math.min(interaction.start.x,end.x),y:Math.min(interaction.start.y,end.y),w:Math.abs(end.x-interaction.start.x),h:Math.abs(end.y-interaction.start.y)};interaction.lasso.remove();allShapeEntries(song).forEach(key=>{const item=shapeAbsoluteBox(song,key);if(item&&item.x<box.x+box.w&&item.x+item.w>box.x&&item.y<box.y+box.h&&item.y+item.h>box.y)shapeSelection.add(key);});song.sections.forEach(section=>{if(shapeSelection.has(shapeKey('section',section.id)))section.lines.forEach(line=>shapeSelection.delete(shapeKey('line',line.id)));});updateShapeSelectionUI(song);}
  }

  function setShapeZoomAt(song,value,clientX,clientY,viewport=document.querySelector('.shape-viewport'),rerender=true){if(!viewport)return;const rect=viewport.getBoundingClientRect(),oldZoom=song.shapeView.zoom,newZoom=clamp(Math.round(value*1000)/1000,.35,2.25);const worldX=(clientX-rect.left-song.shapeView.panX)/oldZoom,worldY=(clientY-rect.top-song.shapeView.panY)/oldZoom;song.shapeView.zoom=newZoom;song.shapeView.panX=(clientX-rect.left)-worldX*newZoom;song.shapeView.panY=(clientY-rect.top)-worldY*newZoom;scheduleSave();if(rerender)renderView(song);else updateShapeTransform(song,viewport);}
  function setShapeZoom(song,value){const viewport=document.querySelector('.shape-viewport');if(!viewport)return;const rect=viewport.getBoundingClientRect();setShapeZoomAt(song,value,rect.left+rect.width/2,rect.top+rect.height/2,viewport,true);}
  function shapeBounds(song,selectionOnly=false){const keys=selectionOnly?[...shapeSelection]:allShapeEntries(song).filter(key=>parseShapeKey(key).kind!=='line'||!shapeSelection.has(shapeKey('section',shapeLineOwner(song,parseShapeKey(key).id)?.section.id||'')));const boxes=keys.map(key=>shapeAbsoluteBox(song,key)).filter(Boolean);if(!boxes.length)return null;return{x:Math.min(...boxes.map(box=>box.x)),y:Math.min(...boxes.map(box=>box.y)),right:Math.max(...boxes.map(box=>box.x+box.w)),bottom:Math.max(...boxes.map(box=>box.y+box.h))};}
  function fitShapeView(song,selectionOnly=false){const viewport=document.querySelector('.shape-viewport'),bounds=shapeBounds(song,selectionOnly);if(!viewport||!bounds){toast(selectionOnly?'Select something first':'Shape is empty');return;}const padding=80,zoom=clamp(Math.min((viewport.clientWidth-padding)/(bounds.right-bounds.x||1),(viewport.clientHeight-padding)/(bounds.bottom-bounds.y||1)),.35,1.5);song.shapeView.zoom=zoom;song.shapeView.panX=(viewport.clientWidth-(bounds.right-bounds.x)*zoom)/2-bounds.x*zoom;song.shapeView.panY=(viewport.clientHeight-(bounds.bottom-bounds.y)*zoom)/2-bounds.y*zoom;scheduleSave();renderView(song);}
  function centreShapeSelection(song){const viewport=document.querySelector('.shape-viewport'),bounds=shapeBounds(song,true);if(!viewport||!bounds){toast('Select something first');return;}song.shapeView.panX=viewport.clientWidth/2-((bounds.x+bounds.right)/2)*song.shapeView.zoom;song.shapeView.panY=viewport.clientHeight/2-((bounds.y+bounds.bottom)/2)*song.shapeView.zoom;scheduleSave();renderView(song);}
  function addShapeBlock(song,type='fragment',point=null){const center=point||visibleShapeCenter(song);snapshot('Created Shape loose line');const block=createBlock(type,'',center.x,center.y);const open=findOpenShapePoint(song,block.w,block.h,center);block.x=open.x;block.y=open.y;song.shapeBlocks.push(block);shapeSelection.clear();shapeSelection.add(shapeKey('block',block.id));rememberShapeSelection(song);touch(song);shapeEditingKey=shapeKey('block',block.id);render();}
  function liftLineToShape(song,section,line,x,y){perform('Made line loose',()=>{const block=createBlock(line.kind==='progression'?'harmony':'fragment',line.text,x,y,line.chords);block.sourceLineId=line.id;block.w=line.shape?.w||220;block.h=line.shape?.h||96;song.shapeBlocks.push(block);section.lines=section.lines.filter(item=>item.id!==line.id);shapeSelection.clear();shapeSelection.add(shapeKey('block',block.id));rememberShapeSelection(song);},'Line moved to Loose lines');}
  function liftSelectedShapeLines(song){const lines=[...shapeSelection].map(parseShapeKey).filter(item=>item.kind==='line').map(item=>shapeLineOwner(song,item.id)).filter(Boolean);if(!lines.length)return;perform('Made lines loose',()=>{const next=new Set(shapeSelection);lines.forEach(({section,line})=>{const box=shapeAbsoluteBox(song,shapeKey('line',line.id));const block=createBlock(line.kind==='progression'?'harmony':'fragment',line.text,box.x,box.y,line.chords);block.sourceLineId=line.id;block.w=box.w;block.h=box.h;song.shapeBlocks.push(block);section.lines=section.lines.filter(item=>item.id!==line.id);next.delete(shapeKey('line',line.id));next.add(shapeKey('block',block.id));});shapeSelection=next;rememberShapeSelection(song);},lines.length===1?'Line moved to Loose lines':'Lines moved to Loose lines');}
  function dropToShapeBoard(event,song,viewport){if(!dragData)return;const point=clientToWorld(event.clientX,event.clientY,viewport,song);if(dragData.kind==='shape-line'){event.preventDefault();const found=findLine(song,dragData.lineId);if(found)liftLineToShape(song,found.section,found.line,point.x,point.y);}else if(dragData.kind==='shelf-chord'){event.preventDefault();perform('Added chord to Shape',()=>song.shapeBlocks.push(createBlock('harmony',dragData.value,point.x,point.y)),'Chord placed on Shape');}else if(dragData.kind==='shelf-progression'){event.preventDefault();perform('Added progression to Shape',()=>song.shapeBlocks.push(createBlock('harmony',dragData.text,point.x,point.y)),'Progression placed on Shape');}dragData=null;}
  function openShapeBlockMenu(song,block,anchor){
    const destinations=song.sections.map(section=>[section.label,()=>addShapeBlockToSection(song,block,section)]);
    openMenu(anchor,[['Edit loose line',()=>{shapeEditingKey=shapeKey('block',block.id);shapeSelection.clear();shapeSelection.add(shapeEditingKey);rememberShapeSelection(song);renderView(song);}],['Place in Write',()=>{shapeSelection.clear();shapeSelection.add(shapeKey('block',block.id));sendShapeSelectionToWrite(song);}],...(destinations.length?[['Place in section…',()=>openChoiceModal('Place in section',destinations)]]:[]),['Convert to loose line',()=>{block.type='fragment';touch(song);render();}],['Convert to title',()=>{block.type='title';touch(song);render();}],['Convert to progression',()=>{block.type='harmony';touch(song);render();}],['Delete',()=>perform('Deleted loose line',()=>song.shapeBlocks=song.shapeBlocks.filter(item=>item.id!==block.id),'Loose line deleted'),'danger']]);
  }
  function addShapeBlockToSection(song,block,section){perform('Place loose line in section',()=>{const line=createLine(block.text,block.type==='harmony'?'progression':'lyric',sectionKey(song,section));if(block.sourceLineId)line.id=block.sourceLineId;if(block.chords?.length&&line.kind==='lyric')line.chords=clone(block.chords);line.shape={x:12,y:12+section.lines.length*68,w:Math.max(180,section.shape.w-24),h:line.kind==='progression'?52:58};section.lines.push(line);sortSectionLinesByShape(section);expandSectionToContents(section);song.shapeBlocks=song.shapeBlocks.filter(item=>item.id!==block.id);shapeSelection.delete(shapeKey('block',block.id));shapeSelection.add(shapeKey('line',line.id));rememberShapeSelection(song);activeSectionId=section.id;activeLineId=line.id;},`Added to ${section.label}`);}

  function sendShapeSelectionToWrite(song){
    const selected=[...shapeSelection];if(!selected.length){toast('Select a loose line or section first');return;}
    const parsed=selected.map(parseShapeKey);const sections=parsed.filter(item=>item.kind==='section').map(item=>findSection(song,item.id)).filter(Boolean);const blocks=parsed.filter(item=>item.kind==='block').map(item=>song.shapeBlocks.find(block=>block.id===item.id)).filter(Boolean).sort((a,b)=>(a.y-b.y)||(a.x-b.x));
    if(sections.length&&!blocks.length){activeSectionId=sections[0].id;activeLineId=sections[0].lines[0]?.id||null;setView('write');requestAnimationFrame(()=>document.getElementById(`write-${sections[0].id}`)?.scrollIntoView({block:'start'}));return;}
    let target=findSection(song,activeSectionId)||song.sections[0]||null;
    perform('Place Shape material in song',()=>{
      if(!target){target=createSection('Verse 1',[]);song.sections.push(target);}
      blocks.forEach(block=>{const line=createLine(block.text,block.type==='harmony'?'progression':'lyric',sectionKey(song,target));if(block.sourceLineId)line.id=block.sourceLineId;if(block.chords?.length&&line.kind==='lyric')line.chords=clone(block.chords);target.lines.push(line);});
      song.shapeBlocks=song.shapeBlocks.filter(block=>!blocks.some(selectedBlock=>selectedBlock.id===block.id));shapeSelection.clear();activeSectionId=target.id;activeLineId=target.lines.at(-1)?.id||null;
    },`Placed in ${target?.label||'Verse 1'}`,()=>setView('write'));
  }

  function sectionInsertIndex(song){const index=song.sections.findIndex(section=>section.id===activeSectionId);return index<0?song.sections.length:index+1;}
  function openSectionPicker(song,index=song.sections.length,startingText='',switchToWrite=true,anchor=null){
    const choose=type=>insertSection(song,type,index,startingText,switchToWrite);
    const common=['Verse','Pre-Chorus','Chorus','Bridge'].map(type=>[type,()=>choose(type)]);
    const more=['Intro','Outro','Instrumental','Tag','Refrain','Custom'].map(type=>[type,()=>choose(type)]);
    common.push(['More…',()=>{if(anchor)openChoicePopover(anchor,'More sections',more);else openChoiceModal('More sections',more);}]);
    if(anchor)openChoicePopover(anchor,'Add section',common);else openChoiceModal('Add section',common,switchToWrite?'Start writing in the new section.':'Create the section, then add or drag loose lines into it.');
  }

  function insertSection(song,type,index,startingText='',switchToWrite=true){const finish=label=>{const raw=String(startingText||'');const lines=raw?raw.split(/\n+/).map(value=>value.trim()).filter(Boolean).map(value=>createLine(value,looksLikeProgression(value)?'progression':'lyric',song.key)):(switchToWrite?[createLine('', 'lyric', song.key)]:[]);const center=visibleShapeCenter(song);const section=createSection(label,lines,center.x,center.y);section.shape.h=Math.max(180,70+lines.length*68);const open=findOpenShapePoint(song,section.shape.w,section.shape.h,center);section.shape.x=open.x;section.shape.y=open.y;perform('Created section',()=>{song.sections.splice(index,0,section);activeSectionId=section.id;activeLineId=section.lines[0]?.id||null;},`${section.label} created`,()=>{if(switchToWrite){setView('write');requestAnimationFrame(()=>section.lines[0]&&openLineEditor(song,section,section.lines[0],0));}else setView('shape');});};if(type==='Custom')openFormModal('Custom section',[{name:'label',label:'Section name',type:'text',placeholder:'Post-Chorus',required:true}],values=>{finish(values.label.trim());});else finish(UE.nextSectionLabel(type,song.sections));}

  function renderWrite(song) {
    const view=document.createElement('div');view.className='write-view';
    const sticky=document.createElement('div');sticky.className='write-sticky no-print';
    if(song.sections.length){const current=findSection(song,activeSectionId)||song.sections[0];const jump=document.createElement('button');jump.className='section-jump';jump.textContent=`${current.label} ▾`;jump.onclick=()=>openChoicePopover(jump,'Go to section',song.sections.map(section=>[section.label,()=>{activeSectionId=section.id;activeLineId=section.lines[0]?.id||null;document.getElementById(`write-${section.id}`)?.scrollIntoView({behavior:'smooth',block:'start'});renderToolbar(song);renderWorkbench();}]));sticky.append(jump);}
    const wrap=document.createElement('div');wrap.className='document-wrap';const page=document.createElement('article');page.className='document-page';
    const profile=activeProfile(song);const meta=document.createElement('button');meta.className='notebook-meta';meta.title='Key, capo, tuning and chord display';meta.setAttribute('aria-label',`${compactKey(profile.shapeKey)} shapes, ${profile.capo?`capo ${profile.capo}`:'no capo'}, sounds in ${compactKey(song.key)}. Open player setup.`);const playing=document.createElement('strong');playing.textContent=`${compactKey(profile.shapeKey)} shapes · ${profile.capo?`Capo ${profile.capo}`:'No capo'}`;const sounding=document.createElement('small');sounding.textContent=`Sounds ${compactKey(song.key)}${profile.tuning&&profile.tuning!=='Standard'?` · ${profile.tuning}`:''}`;meta.append(playing,sounding);meta.onclick=()=>openNotebookMetaMenu(song,meta);sticky.append(meta);
    const sections=document.createElement('div');if(!song.sections.length){const empty=document.createElement('div');empty.className='first-section';const button=document.createElement('button');button.className='first-section-button';button.textContent='+ Add section';button.onclick=()=>openSectionPicker(song,0,'',true);empty.append(button);sections.append(empty);}else{song.sections.forEach((section,index)=>{sections.append(renderSectionInsert(song,index),renderWriteSection(song,section));});sections.append(renderSectionInsert(song,song.sections.length));}
    page.append(sections);wrap.append(page);view.append(sticky,wrap);els.viewHost.append(view);
  }


  function openNotebookMetaMenu(song,anchor){openMenu(anchor,[['Playing shapes',()=>{state.chordDisplay='shapes';scheduleSave();renderView(song);}],['Sounding chords',()=>{state.chordDisplay='sounding';scheduleSave();renderView(song);}],['Nashville numbers',()=>{state.chordDisplay='numbers';scheduleSave();renderView(song);}],['Key, capo and tuning…',()=>openKeyCapoPanel(song)],['Transpose song…',()=>openTransposePanel(song,'song')]]);}

  function metaButton(label,action){const button=document.createElement('button');button.className='meta-pill';button.textContent=label;button.onclick=()=>action(button);return button;}
  function renderSectionInsert(song,index){const wrap=document.createElement('div');wrap.className='section-insert';const button=document.createElement('button');button.textContent='+';button.title='Add section here';button.setAttribute('aria-label','Add section here');button.onclick=()=>openSectionPicker(song,index,'',true,button);wrap.append(button);return wrap;}

  function renderWriteSection(song,section){
    const article=document.createElement('section');article.className=`write-section${section.collapsed?' collapsed':''}`;article.id=`write-${section.id}`;article.dataset.sectionId=section.id;if(section.demoKey)article.dataset.demoKey=section.demoKey;
    const head=document.createElement('header');head.className='write-section-head';const grip=document.createElement('button');grip.className='section-grip';grip.textContent='⋮⋮';grip.draggable=!touchCraftLayout();grip.title='Move section';grip.setAttribute('aria-label','Move section');grip.ondragstart=event=>{dragData={kind:'section',id:section.id};event.dataTransfer.setData('text/plain',section.id);};grip.ondragend=()=>dragData=null;mobileDragHandle(grip,article,'.write-section',target=>mobileMoveSectionToIndex(song,section,song.sections.findIndex(item=>item.id===target.dataset.sectionId)),'Move section',head);const label=document.createElement('input');label.className='write-section-label';label.value=section.label;label.setAttribute('aria-label','Section name');label.onfocus=()=>{activeSectionId=section.id;};label.oninput=()=>{section.label=label.value;touch(song);renderLibrary();};const actions=document.createElement('div');actions.className='section-actions';const collapse=document.createElement('button');collapse.textContent=section.collapsed?'⌄':'⌃';collapse.title=section.collapsed?'Open section':'Close section';collapse.setAttribute('aria-label',collapse.title);collapse.onclick=()=>{section.collapsed=!section.collapsed;touch(song);renderView(song);};const more=document.createElement('button');more.textContent='•••';more.setAttribute('aria-label',`${section.label} section menu`);more.onclick=()=>openSectionMenu(song,section,more);actions.append(collapse,more);head.append(grip,label);if(section.keyOverride){const note=document.createElement('span');note.className='section-key-note';note.textContent=section.keyOverride;head.append(note);}head.append(actions);article.append(head);
    article.ondragover=event=>{if(dragData?.kind==='section'){event.preventDefault();article.classList.add('drop-section');}};article.ondragleave=event=>{if(!article.contains(event.relatedTarget))article.classList.remove('drop-section');};article.ondrop=event=>{if(dragData?.kind!=='section')return;event.preventDefault();article.classList.remove('drop-section');const from=song.sections.findIndex(item=>item.id===dragData.id),to=song.sections.findIndex(item=>item.id===section.id);if(from!==to)perform('Moved section',()=>{const [moved]=song.sections.splice(from,1);song.sections.splice(to,0,moved);},'Section moved');dragData=null;};
    if(!section.collapsed){const lines=document.createElement('div');lines.className='notebook-lines';section.lines.forEach((line,index)=>lines.append(renderNotebookRow(song,section,line,index)));const add=document.createElement('button');add.className='add-row-menu';add.textContent='+';add.title='Add lyric line or chord row';add.onclick=()=>openChoicePopover(add,'Add to section',[['Lyric line',()=>addLine(song,section,'lyric')],['Chord row',()=>addLine(song,section,'progression')]]);article.append(lines,add);}return article;
  }

  function addLine(song,section,kind='lyric'){const line=createLine('',kind,sectionKey(song,section));section.lines.push(line);touch(song);activeSectionId=section.id;activeLineId=line.id;renderView(song);requestAnimationFrame(()=>openLineEditor(song,section,line,0));}
  function lineAlternativeCount(song,line){return song.alternatives.filter(alt=>alt.targetType==='line'&&alt.targetId===line.id).length;}

  function renderNotebookRow(song,section,line,index){
    const row=document.createElement('div');row.className=`notebook-row${line.id===activeLineId?' active':''}${line.kind==='progression'?' chord-row':''}`;row.dataset.lineId=line.id;row.dataset.sectionId=section.id;if(line.demoKey)row.dataset.demoKey=line.demoKey;
    const grip=document.createElement('button');grip.className='line-grip';grip.textContent='⋮⋮';grip.draggable=!touchCraftLayout();grip.title='Move row';grip.setAttribute('aria-label','Move row');grip.ondragstart=event=>{dragData={kind:'line',lineId:line.id,sectionId:section.id};event.dataTransfer.setData('text/plain',line.id);event.dataTransfer.effectAllowed='move';};grip.ondragend=()=>{dragData=null;row.classList.remove('drop-before','drop-after');};
    const previewData=MWE.rowPreview(line,value=>storedChordToDisplay(value,song,state.chordDisplay,sectionKey(song,section)));const dragPreview=document.createElement('div');dragPreview.className='mobile-row-drag-preview';if(previewData.chords){const previewChords=document.createElement('strong');previewChords.textContent=previewData.chords;dragPreview.append(previewChords);}const previewLyric=document.createElement('span');previewLyric.textContent=previewData.lyric;dragPreview.append(previewLyric);
    mobileDragHandle(grip,row,'.notebook-row,.write-section',(target,drag)=>{const targetSectionId=target.dataset.sectionId;const plan=MWE.rowDropPlan(song.sections,{sourceSectionId:section.id,lineId:line.id,targetSectionId,targetLineId:target.dataset.lineId||null,dropAfter:drag.dropAfter});if(plan)moveLine(song,section.id,line.id,targetSectionId,plan.targetIndex);},'Move row',dragPreview,(under,event)=>writeMobileDropTarget(under,event,row,section.id));
    const paper=document.createElement('div');paper.className='line-paper';if(line.style?.bold)paper.style.fontWeight='700';if(line.style?.italic)paper.style.fontStyle='italic';if(line.style?.color&&line.style.color!=='ink')paper.dataset.textColor=line.style.color;
    if(line.kind==='progression')paper.append(renderChordRow(song,section,line));else paper.append(renderNotebookContent(song,section,line));
    const right=document.createElement('div');right.className='line-right';const count=lineAlternativeCount(song,line);if(count){const alt=document.createElement('button');alt.className='alt-count';alt.textContent=`${count} alternative${count===1?'':'s'}`;alt.setAttribute('aria-label',`Open ${count} alternative${count===1?'':'s'}`);alt.onclick=event=>{event.stopPropagation();activeLineId=line.id;activeSectionId=section.id;openAlternativesTray();};right.append(alt);}const menu=document.createElement('button');menu.className='line-menu-button';menu.textContent='•••';menu.title='Row menu';menu.setAttribute('aria-label','Row menu');menu.onclick=event=>{event.stopPropagation();openLineMenu(song,section,line,menu);};right.append(menu);row.append(grip,dragPreview,paper,right);
    paper.onclick=event=>{if(event.target.closest('button,.word-text,.chord-slot,.chord-row-token,textarea'))return;event.stopPropagation();activeLineId=line.id;activeSectionId=section.id;openLineEditor(song,section,line,line.text.length);};
    row.onclick=event=>{if(event.target.closest('button,.word-text,.chord-slot,.chord-row-token,textarea,.line-paper'))return;activeLineId=line.id;activeSectionId=section.id;activeChordId=null;activeChordLineId=null;activeProgressionToken=null;renderView(song);renderToolbar(song);renderWorkbench();};
    row.ondragover=event=>{if(!['line','chord','shelf-fragment','shelf-chord','shelf-progression'].includes(dragData?.kind))return;event.preventDefault();row.classList.remove('drop-before','drop-after','drop-content');clearWriteChordDrop(row);if(['chord','shelf-chord'].includes(dragData.kind)&&line.kind==='lyric'){nearestWriteChordDrop(row,event.clientX)?.slot.classList.add('drop-target');return;}if(dragData.kind==='shelf-fragment'){row.classList.add('drop-content');return;}if(dragData.kind==='line'&&dragData.sectionId===section.id){row.classList.add('drop-content');return;}const rect=row.getBoundingClientRect();row.classList.toggle('drop-before',event.clientY<rect.top+rect.height/2);row.classList.toggle('drop-after',event.clientY>=rect.top+rect.height/2);};row.ondragleave=()=>{row.classList.remove('drop-before','drop-after','drop-content');clearWriteChordDrop(row);};row.ondrop=event=>{if(!dragData)return;event.preventDefault();const payload={...dragData};const rect=row.getBoundingClientRect(),targetIndex=index+(event.clientY>=rect.top+rect.height/2?1:0),chordDrop=nearestWriteChordDrop(row,event.clientX);row.classList.remove('drop-before','drop-after','drop-content');clearWriteChordDrop(row);if(payload.kind==='line')moveLine(song,payload.sectionId,payload.lineId,section.id,payload.sectionId===section.id?index:targetIndex);else if(payload.kind==='chord'&&line.kind==='lyric'&&chordDrop)moveChord(song,payload.lineId,payload.chordId,line.id,chordDrop.anchor);else if(payload.kind==='shelf-fragment'){const block=song.shapeBlocks.find(item=>item.id===payload.blockId);if(block)addSavedBlockAsAlternative(song,block,{section,line});}else if(payload.kind==='shelf-chord'&&line.kind==='lyric'&&chordDrop){perform('Added chord',()=>{const canonical=displayedChordToStored(payload.value,song,sectionKey(song,section))||payload.value;line.chords.push({id:uid('chord'),value:canonical,anchor:chordDrop.anchor});activeLineId=line.id;activeSectionId=section.id;},`Chord placed above “${chordDrop.text||'line'}”`);}else if(payload.kind==='shelf-progression'){perform('Added chord row',()=>section.lines.splice(targetIndex,0,createLine(payload.text,'progression',sectionKey(song,section))),'Progression added to section');}dragData=null;};return row;
  }

  function progressionParts(text){
    const source=String(text||'').trim();
    if(!source)return [''];
    const bars=source.includes('|')?source.split('|').map(value=>value.trim()).filter((value,index,array)=>value||index>0&&index<array.length-1):[source];
    return bars.length?bars:[''];
  }

  function progressionTokens(text){const output=[];progressionParts(text).forEach((bar,barIndex)=>bar.split(/\s+/).filter(Boolean).forEach((value,chordIndex)=>output.push({barIndex,chordIndex,value})));return output;}
  function replaceProgressionToken(line,token,value){const bars=progressionParts(line.text).map(bar=>bar.split(/\s+/).filter(Boolean));bars[token.barIndex] ||= [];bars[token.barIndex][token.chordIndex]=value;line.text=serialiseProgressionBars(bars);}
  function serialiseProgressionBars(bars){return `| ${bars.map(chords=>(chords||[]).join(' ')).join(' | ')} |`;}
  function moveProgressionToken(line,source,targetBar){const bars=progressionParts(line.text).map(bar=>bar.split(/\s+/).filter(Boolean));const moving=bars[source.barIndex]?.splice(source.chordIndex,1)?.[0];if(!moving)return false;bars[targetBar] ||= [];bars[targetBar].push(moving);line.text=serialiseProgressionBars(bars);return true;}
  function addProgressionBar(line){const bars=progressionParts(line.text).map(bar=>bar.split(/\s+/).filter(Boolean));bars.push([]);line.text=serialiseProgressionBars(bars);}

  function renderChordRow(song,section,line){
    const wrapper=document.createElement('div');wrapper.className='chord-row-content';
    if(line.label){const label=document.createElement('span');label.className='chord-row-label';label.textContent=line.label;wrapper.append(label);}
    const container=document.createElement('div');container.className='chord-row-bars';const bars=progressionParts(line.text);const profile=activeProfile(song);
    bars.forEach((bar,barIndex)=>{
      const cell=document.createElement('span');cell.className='chord-bar';cell.dataset.bar=String(barIndex);
      const values=bar.split(/\s+/).filter(Boolean);if(!values.length){const blank=document.createElement('span');blank.className='chord-row-blank';blank.textContent=' ';cell.append(blank);}
      values.forEach((rawValue,chordIndex)=>{
        const canonical=CE.parseNashville(rawValue)?CE.nashvilleToChord(rawValue,sectionKey(song,section),song.spelling):rawValue;
        const display=storedChordToDisplay(canonical,song,state.chordDisplay,sectionKey(song,section));
        const token=document.createElement('button');token.className=`chord-row-token${activeProgressionToken?.lineId===line.id&&activeProgressionToken.barIndex===barIndex&&activeProgressionToken.chordIndex===chordIndex?' selected':''}`;token.draggable=!touchCraftLayout();token.dataset.bar=String(barIndex);token.dataset.chord=String(chordIndex);token.setAttribute('aria-label',`Chord ${display}`);
        const main=document.createElement('span');main.textContent=display;token.append(main);
        if(profile.showSounding&&state.chordDisplay==='shapes'){const secondary=document.createElement('small');secondary.textContent=canonical;token.append(secondary);}
        if(profile.showNashville&&state.chordDisplay!=='numbers'){const number=document.createElement('small');number.textContent=CE.chordToNashville(canonical,sectionKey(song,section));token.append(number);}
        token.onpointerdown=event=>event.stopPropagation();
        token.onclick=event=>{event.preventDefault();event.stopPropagation();if(mobileTouchSuppressClick===token){mobileTouchSuppressClick=null;return;}activeLineId=line.id;activeSectionId=section.id;activeChordId=null;activeChordLineId=null;activeProgressionToken={lineId:line.id,barIndex,chordIndex,value:canonical};pendingChordAnchor=null;toggleWorkbench('music');renderView(song);};
        token.ondragstart=event=>{event.stopPropagation();dragData={kind:'progression-chord',lineId:line.id,barIndex,chordIndex};event.dataTransfer.setData('text/plain',canonical);event.dataTransfer.effectAllowed='move';};token.ondragend=()=>dragData=null;
        mobileDragHandle(token,token,'.chord-bar',target=>{const targetRow=target.closest('.notebook-row');if(targetRow?.dataset.lineId!==line.id)return;const targetBar=Number(target.dataset.bar);perform('Moved chord in chord row',()=>{moveProgressionToken(line,{lineId:line.id,barIndex,chordIndex},targetBar);activeProgressionToken=null;},'Chord moved');},`Move chord ${display}`,token,under=>under.closest?.('.chord-bar'),'both');
        cell.append(token);
      });
      cell.ondragover=event=>{if(dragData?.kind==='progression-chord'&&dragData.lineId===line.id){event.preventDefault();cell.classList.add('drop-target');}};cell.ondragleave=()=>cell.classList.remove('drop-target');cell.ondrop=event=>{if(dragData?.kind!=='progression-chord'||dragData.lineId!==line.id)return;event.preventDefault();cell.classList.remove('drop-target');const source={...dragData};perform('Moved chord in chord row',()=>{moveProgressionToken(line,source,barIndex);activeProgressionToken=null;},'Chord moved');dragData=null;};container.append(cell);
    });
    container.ondblclick=event=>{if(event.target.closest('.chord-row-token'))return;openLineEditor(song,section,line,line.text.length);};container.onclick=event=>{if(event.target.closest('.chord-row-token'))return;activeLineId=line.id;activeSectionId=section.id;activeChordId=null;activeProgressionToken=null;renderView(song);renderWorkbench();};wrapper.append(container);return wrapper;
  }

  function wordRanges(text){const source=String(text||'');const starts=NE.wordStarts(source);const ranges=[];for(let index=0;index<starts.length-1;index++)ranges.push({start:starts[index],end:starts[index+1],text:source.slice(starts[index],starts[index+1])});if(!ranges.length)ranges.push({start:0,end:0,text:''});if(!ranges.some(range=>range.start===source.length))ranges.push({start:source.length,end:source.length,text:''});return ranges;}

  function clearWriteChordDrop(row){row.querySelectorAll('.chord-slot.drop-target').forEach(slot=>slot.classList.remove('drop-target'));}
  function nearestWriteChordDrop(row,clientX){const slots=[...row.querySelectorAll('.chord-slot')];const nearest=MWE.nearestAnchor(slots.map(slot=>{const bounds=slot.getBoundingClientRect();return{slot,anchor:Number(slot.dataset.anchor)||0,left:bounds.left,width:bounds.width};}),clientX);if(!nearest)return null;return{slot:nearest.slot,anchor:nearest.anchor,text:nearest.slot.closest('.word-stack')?.querySelector('.word-text')?.textContent?.trim()||''};}

  function renderNotebookContent(song,section,line){const content=document.createElement('div');content.className='notebook-content';const ranges=wordRanges(line.text);ranges.forEach(range=>{const stack=document.createElement('span');stack.className='word-stack';stack.dataset.anchor=String(range.start);const slot=document.createElement('span');slot.className='chord-slot';slot.dataset.anchor=String(range.start);const chords=(line.chords||[]).filter(chord=>NE.nearestBoundary(line.text,chord.anchor,true)===range.start);chords.forEach(chord=>slot.append(renderChordToken(song,section,line,chord)));slot.onclick=event=>{if(event.target.closest('.chord-token'))return;event.stopPropagation();activeLineId=line.id;activeSectionId=section.id;activeChordId=null;activeChordLineId=null;activeProgressionToken=null;pendingChordAnchor={lineId:line.id,anchor:range.start};toggleWorkbench('music');renderView(song);};slot.ondragover=event=>{if(['chord','shelf-chord'].includes(dragData?.kind)){event.preventDefault();slot.classList.add('drop-target');}};slot.ondragleave=()=>slot.classList.remove('drop-target');slot.ondrop=event=>{if(!['chord','shelf-chord'].includes(dragData?.kind))return;event.preventDefault();event.stopPropagation();slot.classList.remove('drop-target');if(dragData.kind==='chord')moveChord(song,dragData.lineId,dragData.chordId,line.id,range.start);else perform('Placed chord',()=>{const canonical=displayedChordToStored(dragData.value,song,sectionKey(song,section))||dragData.value;line.chords.push({id:uid('chord'),value:canonical,anchor:range.start});activeLineId=line.id;activeSectionId=section.id;},`Chord placed above “${range.text.trim()||'line'}”`);dragData=null;};const word=document.createElement('span');word.className='word-text';word.textContent=range.text||' ';word.onclick=event=>{event.stopPropagation();openLineEditor(song,section,line,range.start);};stack.append(slot,word);content.append(stack);});content.onclick=()=>openLineEditor(song,section,line,line.text.length);return content;}

  function renderChordToken(song,section,line,chord){
    const display=storedChordToDisplay(chord.value,song,state.chordDisplay,sectionKey(song,section));
    const button=document.createElement('button');button.className=`chord-token${selectedChordIds.has(chord.id)||chord.id===activeChordId?' selected':''}${chord.needsReview?' needs-review':''}`;button.title=chord.needsReview?'Check chord position':'Select chord';button.draggable=!touchCraftLayout();button.setAttribute('aria-label',`Chord ${display}`);
    const main=document.createElement('span');main.textContent=display;button.append(main);const profile=activeProfile(song);if(profile.showSounding&&state.chordDisplay==='shapes'){const secondary=document.createElement('small');secondary.textContent=chord.value;button.append(secondary);}if(profile.showNashville&&state.chordDisplay!=='numbers'){const number=document.createElement('small');number.textContent=CE.chordToNashville(chord.value,sectionKey(song,section));button.append(number);}
    button.onpointerdown=event=>event.stopPropagation();button.ondragstart=event=>{event.stopPropagation();dragData={kind:'chord',lineId:line.id,chordId:chord.id};event.dataTransfer.setData('text/plain',chord.id);event.dataTransfer.effectAllowed='move';};button.ondragend=()=>dragData=null;
    button.onclick=event=>{event.preventDefault();event.stopPropagation();if(mobileTouchSuppressClick===button){mobileTouchSuppressClick=null;return;}if(activeChordLineId!==line.id)selectedChordIds.clear();if(event.shiftKey&&activeChordId){const ordered=(line.chords||[]).slice().sort((a,b)=>a.anchor-b.anchor),from=ordered.findIndex(item=>item.id===activeChordId),to=ordered.findIndex(item=>item.id===chord.id);if(from>=0&&to>=0)ordered.slice(Math.min(from,to),Math.max(from,to)+1).forEach(item=>selectedChordIds.add(item.id));}else if(event.metaKey||event.ctrlKey){if(selectedChordIds.has(chord.id))selectedChordIds.delete(chord.id);else selectedChordIds.add(chord.id);}else{selectedChordIds.clear();selectedChordIds.add(chord.id);}activeLineId=line.id;activeSectionId=section.id;activeChordId=chord.id;activeChordLineId=line.id;activeProgressionToken=null;pendingChordAnchor=null;toggleWorkbench('music');renderView(song);};
    mobileDragHandle(button,button,'.chord-slot',target=>{const targetLineId=target.closest('.notebook-row')?.dataset.lineId;if(!targetLineId)return;moveChord(song,line.id,chord.id,targetLineId,Number(target.dataset.anchor)||0);},`Move chord ${display}`,button,under=>under.closest?.('.chord-slot'),'both');
    return button;
  }

  function openLineEditor(song,section,line,cursor=null){activeLineId=line.id;activeSectionId=section.id;activeChordId=null;activeChordLineId=null;selectedChordIds.clear();activeProgressionToken=null;pendingChordAnchor=null;if(state.workbenchOpen&&!transientPanel)renderWorkbench();const existing=document.querySelector(`.notebook-row[data-line-id="${CSS.escape(line.id)}"] .line-editor`);if(existing){existing.focus();if(cursor!==null)existing.selectionStart=existing.selectionEnd=clamp(cursor,0,existing.value.length);return;}if(activeEditor)activeEditor.blur();const row=document.querySelector(`.notebook-row[data-line-id="${CSS.escape(line.id)}"]`);if(!row)return;row.classList.add('active');const paper=row.querySelector('.line-paper');const display=paper.querySelector('.notebook-content,.chord-row-content');if(!display)return;const textarea=document.createElement('textarea');textarea.rows=1;textarea.className=`line-editor${line.kind==='progression'?' chord-row-editor':line.chords?.length?' has-chords':''}`;textarea.value=line.kind==='progression'?displayProgression(line.text,song,state.chordDisplay,sectionKey(song,section)):line.text;if(line.kind==='lyric'&&line.chords?.length){const editor=document.createElement('div');editor.className='inline-lyric-editor';const chordGuide=display.cloneNode(true);chordGuide.classList.add('editor-chord-guide');chordGuide.setAttribute('aria-hidden','true');chordGuide.querySelectorAll('button').forEach(button=>{button.tabIndex=-1;button.removeAttribute('draggable');});editor.append(chordGuide,textarea);display.replaceWith(editor);}else display.replaceWith(textarea);activeEditor=textarea;textarea.focus();textarea.selectionStart=textarea.selectionEnd=cursor===null?textarea.value.length:clamp(cursor,0,textarea.value.length);const editorMinHeight=line.kind==='progression'?42:34;autoGrow(textarea,editorMinHeight);
    textarea.oninput=()=>{if(line.kind==='progression')line.text=displayedProgressionToStored(textarea.value,song,sectionKey(song,section));else consumeLyricInput(song,section,line,textarea);touch(song);autoGrow(textarea,editorMinHeight);};
    textarea.onpaste=event=>{const pasted=event.clipboardData?.getData('text/plain')||'';if(!pasted.includes('\n'))return;event.preventDefault();insertPastedMaterial(song,section,line,pasted);};
    textarea.onkeydown=event=>handleLineKeydown(event,song,section,line,textarea);
    textarea.onblur=()=>{lastEditorBlurAt=performance.now();if(activeEditor===textarea)activeEditor=null;touch(song);if(!state.workbenchOpen&&!state.alternativesTrayOpen){renderView(song);renderWorkbench();}};
  }

  function consumeLyricInput(song,section,line,textarea){const raw=textarea.value;if(/\[[^\]]+\]/.test(raw)){const old=line.text;const parsed=NE.parseBracketLine(raw,sectionKey(song,section),()=>uid('chord'));const adjusted=NE.adjustAnchors(line.chords||[],old,parsed.text);const existingKeys=new Set(adjusted.map(chord=>`${chord.value}|${chord.anchor}`));parsed.chords.forEach(chord=>{chord.value=displayedChordToStored(chord.value,song,sectionKey(song,section))||chord.value;if(!existingKeys.has(`${chord.value}|${chord.anchor}`))adjusted.push(chord);});const oldCursor=textarea.selectionStart;const before=raw.slice(0,oldCursor);const removed=(before.match(/\[[^\]]+\]/g)||[]).join('').length;line.text=parsed.text;line.chords=NE.normaliseChords(adjusted,line.text.length);textarea.value=line.text;textarea.selectionStart=textarea.selectionEnd=Math.max(0,oldCursor-removed);}else{line.chords=NE.adjustAnchors(line.chords||[],line.text,raw);line.text=raw;}}

  function handleLineKeydown(event,song,section,line,textarea){const mod=event.metaKey||event.ctrlKey;if(mod&&event.key==='Enter'){event.preventDefault();textarea.blur();openSectionPicker(song,song.sections.indexOf(section)+1,'',true);return;}if(line.kind==='progression'){if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();const next=createLine('', 'progression', sectionKey(song,section));const index=section.lines.indexOf(line);section.lines.splice(index+1,0,next);touch(song);activeEditor=null;renderView(song);requestAnimationFrame(()=>openLineEditor(song,section,next,0));return;}if(event.key==='Escape'){event.preventDefault();textarea.blur();}return;}if(event.key==='Enter'&&!event.shiftKey){const slash=textarea.value.trim().match(/^\/(.+)$/);const heading=slash?UE.sectionHeading(slash[1]):null;if(heading){event.preventDefault();const index=song.sections.indexOf(section)+1;section.lines=section.lines.filter(item=>item.id!==line.id);insertSection(song,heading.replace(/\s+\d+$/,''),index,'',true);return;}event.preventDefault();const start=textarea.selectionStart,end=textarea.selectionEnd;if(end>start){const nextText=textarea.value.slice(0,start)+textarea.value.slice(end);line.chords=NE.adjustAnchors(line.chords,line.text,nextText);line.text=nextText;}const [before,after]=NE.splitLine(line,start,()=>uid('line'));Object.assign(line,before);const lineIndex=section.lines.findIndex(item=>item.id===line.id);section.lines.splice(lineIndex+1,0,after);touch(song);activeEditor=null;renderView(song);requestAnimationFrame(()=>openLineEditor(song,section,after,0));return;}if(event.key==='Backspace'&&textarea.selectionStart===0&&textarea.selectionEnd===0){const index=section.lines.findIndex(item=>item.id===line.id);if(index>0&&section.lines[index-1].kind==='lyric'){event.preventDefault();const previous=section.lines[index-1];const merged=NE.mergeLines(previous,line);perform('Merged lyric rows',()=>{Object.assign(previous,merged);section.lines.splice(index,1);activeLineId=previous.id;},'Rows merged',()=>requestAnimationFrame(()=>openLineEditor(song,section,previous,previous.text.length)));}}else if(event.key==='Escape')textarea.blur();}

  function insertPastedMaterial(song,section,line,text){const parsed=UE.parseStructuredPaste(text);snapshot('Pasted song material');if(parsed.structured){const sourceIndex=song.sections.indexOf(section);const lineIndex=section.lines.indexOf(line);if(!line.text.trim()&&!line.chords.length)section.lines.splice(lineIndex,1);let insertAt=sourceIndex+1;parsed.sections.forEach((part,index)=>{if(!part.label&&index===0){part.lines.forEach(value=>section.lines.push(createLine(value,looksLikeProgression(value)?'progression':'lyric',sectionKey(song,section))));return;}const label=part.label||UE.nextSectionLabel('Verse',song.sections);song.sections.splice(insertAt++,0,createSection(label,part.lines.length?part.lines.map(value=>createLine(value,looksLikeProgression(value)?'progression':'lyric',song.key)):[createLine('', 'lyric', song.key)]));});toast('Pasted lyrics converted into sections',undo);}else{const values=parsed.lines;const index=section.lines.indexOf(line);if(values.length){const first=createLine(values[0],looksLikeProgression(values[0])?'progression':'lyric',sectionKey(song,section));Object.assign(line,{text:first.text,kind:first.kind,chords:first.chords});values.slice(1).forEach((value,offset)=>section.lines.splice(index+1+offset,0,createLine(value,looksLikeProgression(value)?'progression':'lyric',sectionKey(song,section))));}toast(`${values.length} rows pasted`,undo);}touch(song);activeEditor=null;renderView(song);}

  function moveLine(song,sourceSectionId,lineId,targetSectionId,targetIndex){const source=findSection(song,sourceSectionId),target=findSection(song,targetSectionId);if(!source||!target)return;perform(source===target?'Swapped lyric rows':'Moved lyric row',()=>{const index=source.lines.findIndex(line=>line.id===lineId);if(index<0)return;if(source===target){const swapIndex=clamp(targetIndex>=source.lines.length?source.lines.length-1:targetIndex,0,source.lines.length-1);if(index!==swapIndex)[source.lines[index],source.lines[swapIndex]]=[source.lines[swapIndex],source.lines[index]];}else{const [line]=source.lines.splice(index,1);target.lines.splice(clamp(targetIndex,0,target.lines.length),0,line);}activeSectionId=target.id;activeLineId=lineId;},source===target?'Rows swapped':`Row moved to ${target.label}`);}
  function moveLineToSpare(song,section,line){perform('Made line loose',()=>{const block=createBlock(line.kind==='progression'?'harmony':'fragment',line.text,section.shape.x+section.shape.w+40,section.shape.y+50,line.chords);block.sourceLineId=line.id;song.shapeBlocks.push(block);section.lines=section.lines.filter(item=>item.id!==line.id);activeLineId=null;},'Line moved to Loose lines');}

  function addChordFromToolbar(song){const found=findLine(song,activeLineId);if(!found||found.line.kind!=='lyric'){toast('Select a lyric line first');return;}let anchor=0;if(activeEditor&&document.body.contains(activeEditor))anchor=activeEditor.selectionStart;else if(pendingChordAnchor?.lineId===found.line.id)anchor=pendingChordAnchor.anchor;anchor=NE.nearestBoundary(found.line.text,anchor,true);pendingChordAnchor={lineId:found.line.id,anchor};activeProgressionToken=null;toggleWorkbench('music');}

  function chordContext(song){if(activeProgressionToken){const found=findLine(song,activeProgressionToken.lineId);if(found&&found.line.kind==='progression')return{mode:'progression-replace',...found,token:activeProgressionToken};}if(activeChordId&&activeChordLineId){const found=findChord(song,activeChordLineId,activeChordId);if(found)return{mode:'replace',...found};}if(pendingChordAnchor){const found=findLine(song,pendingChordAnchor.lineId);if(found)return{mode:'insert',...found,anchor:pendingChordAnchor.anchor};}const found=findLine(song,activeLineId);if(found&&found.line.kind==='lyric')return{mode:'insert',...found,anchor:activeEditor?.selectionStart||0};return null;}

  function applyChordChoice(song,value){const context=chordContext(song);if(!context){toast('Select a lyric position, chord or chord row');return;}const canonical=displayedChordToStored(value,song,sectionKey(song,context.section));if(!canonical){toast('Enter a chord or Nashville number');return;}addRecentChord(song,canonical);if(context.mode==='progression-replace'){perform('Replaced chord',()=>{replaceProgressionToken(context.line,context.token,canonical);activeProgressionToken={...context.token,value:canonical};},`${storedChordToDisplay(canonical,song,state.chordDisplay,sectionKey(song,context.section))} selected`);}else if(context.mode==='replace'){perform('Replaced chord',()=>{context.chord.value=canonical;context.chord.needsReview=false;},`${storedChordToDisplay(canonical,song,state.chordDisplay,sectionKey(song,context.section))} selected`);}else{perform('Inserted chord',()=>{const anchor=NE.nearestBoundary(context.line.text,context.anchor,true);context.line.chords=context.line.chords.filter(chord=>NE.nearestBoundary(context.line.text,chord.anchor,true)!==anchor);const inserted={id:uid('chord'),value:canonical,anchor};context.line.chords.push(inserted);selectedChordIds.clear();selectedChordIds.add(inserted.id);activeChordId=inserted.id;activeChordLineId=context.line.id;pendingChordAnchor=null;},'Chord placed');}}

  function moveChord(song,sourceLineId,chordId,targetLineId,targetAnchor){const source=findLine(song,sourceLineId),target=findLine(song,targetLineId);if(!source||!target)return;perform('Moved chord',()=>{const result=NE.moveChord(source.line,target.line,chordId,targetAnchor);if(!result.moved)return;Object.assign(source.line,result.sourceLine);if(result.targetLine)Object.assign(target.line,result.targetLine);const anchor=NE.nearestBoundary(target.line.text,targetAnchor,true);target.line.chords=target.line.chords.filter(chord=>chord.id===chordId||NE.nearestBoundary(target.line.text,chord.anchor,true)!==anchor);selectedChordIds.clear();selectedChordIds.add(chordId);activeChordId=chordId;activeChordLineId=target.line.id;activeLineId=target.line.id;activeSectionId=target.section.id;},'Chord moved');}

  function openChordPalette(song,section,line,chord,anchor){activeLineId=line.id;activeSectionId=section.id;activeProgressionToken=null;if(chord){activeChordId=chord.id;activeChordLineId=line.id;pendingChordAnchor=null;}else{activeChordId=null;activeChordLineId=null;pendingChordAnchor={lineId:line.id,anchor};}toggleWorkbench('music');renderView(song);}

  function moveChordByWord(song,line,chord,direction){const starts=NE.wordStarts(line.text);let index=starts.findIndex(point=>point===NE.nearestBoundary(line.text,chord.anchor,true));if(index<0)index=0;const target=starts[clamp(index+direction,0,starts.length-1)];perform('Moved chord',()=>{chord.anchor=target;chord.needsReview=false;},'Chord moved');}
  function saveChordAlternative(song,line,chord){perform('Saved chord alternative',()=>song.alternatives.unshift({id:uid('alt'),type:'harmony',targetType:'chord',targetId:chord.id,parentLineId:line.id,label:'Chord alternative',content:{chord:{value:chord.value,anchor:chord.anchor}},createdAt:now()}),'Chord saved as an alternative');}

  function tryAnother(song){
    const progressionFound=activeProgressionToken?findLine(song,activeProgressionToken.lineId):findLine(song,activeLineId);
    if(progressionFound?.line.kind==='progression'){
      perform('Started another progression',()=>{song.alternatives.unshift({id:uid('alt'),type:'harmony',targetType:'line',targetId:progressionFound.line.id,label:'Previous progression',content:{line:clone({text:progressionFound.line.text,chords:[],kind:'progression',style:progressionFound.line.style})},createdAt:now()});activeLineId=progressionFound.line.id;activeSectionId=progressionFound.section.id;activeProgressionToken=null;state.alternativesTrayOpen=true;},'Previous progression saved to Alternatives',()=>requestAnimationFrame(()=>openLineEditor(song,progressionFound.section,progressionFound.line,progressionFound.line.text.length)));return;
    }
    if(activeChordId&&activeChordLineId){const found=findChord(song,activeChordLineId,activeChordId);if(!found){toast('Select a line or chord first');return;}saveChordAlternative(song,found.line,found.chord);pendingChordAnchor=null;toggleWorkbench('music');return;}
    const found=findLine(song,activeLineId);if(!found){toast('Select a lyric line first');return;}if(!found.line.text.trim()&&!found.line.chords.length)return;
    perform('Started another lyric',()=>{song.alternatives.unshift({id:uid('alt'),type:'lyric',targetType:'line',targetId:found.line.id,label:'Previous wording',content:{line:clone({text:found.line.text,chords:found.line.chords,kind:'lyric',style:found.line.style})},createdAt:now()});found.line.text='';found.line.chords=[];state.alternativesTrayOpen=true;},'Previous wording saved to Alternatives',()=>requestAnimationFrame(()=>openLineEditor(song,found.section,found.line,0)));
  }

  function renderWorkbench(){
    const song=currentSong();if(!song||!state.workbenchOpen){els.workbenchBody.replaceChildren();return;}
    const title=els.workbench.querySelector('.workbench-title');
    if(transientPanel){
      title.textContent=transientPanel.type==='transpose'?'Transpose':transientPanel.type==='interpret'?'Set key':transientPanel.type==='keycapo'?'Player setup':'Words & Music';
      els.workbenchSubtitle.textContent=transientPanel.type==='keycapo'?'Playing profile':(transientPanel.label||song.title);els.workbenchTabs.classList.add('hidden');els.workbenchBody.replaceChildren();
      if(transientPanel.type==='transpose')renderTransposePanel(song,transientPanel);
      else if(transientPanel.type==='interpret')renderInterpretPanel(song,transientPanel);
      else if(transientPanel.type==='keycapo')renderKeyCapoPanel(song);
      return;
    }
    title.textContent='Words & Music';els.workbenchTabs.classList.remove('hidden');els.workbenchSubtitle.textContent='';[...els.workbenchTabs.querySelectorAll('button')].forEach(button=>button.classList.toggle('active',button.dataset.tab===state.workbenchTab));els.workbenchBody.replaceChildren();
    if(state.workbenchTab==='music'){
      const tools=document.createElement('div');tools.className='shelf-music-tools';
      const setup=document.createElement('button');setup.className='ghost-button';setup.textContent='Player setup';setup.onclick=()=>openKeyCapoPanel(song);
      const transpose=document.createElement('button');transpose.className='ghost-button';transpose.textContent='Transpose…';transpose.onclick=()=>openTransposePanel(song,activeChordId?'chord':activeLineId&&findLine(song,activeLineId)?.line.kind==='progression'?'progression':activeSectionId?'section':'song',{lineId:activeLineId,chordId:activeChordId,sectionId:activeSectionId});
      tools.append(setup,transpose);els.workbenchBody.append(tools);renderWorkbenchChords(song);
    }else renderWorkbenchSpare(song);
  }
  function toggleWorkbench(tab){const target=tab==='chords'?'music':tab==='spare'?'words':(['words','music'].includes(tab)?tab:'words');if(state.workbenchOpen&&!transientPanel&&state.workbenchTab===target){state.workbenchOpen=false;scheduleSave();render();return;}transientPanel=null;state.workbenchOpen=true;state.workbenchTab=target;state.alternativesTrayOpen=false;scheduleSave();render();}
  function renderWorkbenchAlternatives(song){const scope=document.createElement('div');scope.className='workbench-scope';[['current','Selected'],['section','Section'],['song','Whole song']].forEach(([value,label])=>{const button=document.createElement('button');button.textContent=label;button.classList.toggle('active',state.alternativeScope===value);button.onclick=()=>{state.alternativeScope=value;scheduleSave();renderWorkbenchAlternativesReset(song);};scope.append(button);});els.workbenchBody.append(scope);const stack=document.createElement('div');stack.className='workbench-stack';let alternatives=song.alternatives;if(state.alternativeScope==='current'){if(activeChordId)alternatives=alternatives.filter(alt=>alt.targetType==='chord'&&alt.targetId===activeChordId);else if(activeLineId)alternatives=alternatives.filter(alt=>alt.targetType==='line'&&alt.targetId===activeLineId);else if(activeSectionId)alternatives=alternatives.filter(alt=>alt.targetType==='section'&&alt.targetId===activeSectionId);else alternatives=[];}else if(state.alternativeScope==='section'&&activeSectionId){const section=findSection(song,activeSectionId);const ids=new Set(section?.lines.map(line=>line.id)||[]);const chordIds=new Set(section?.lines.flatMap(line=>line.chords.map(chord=>chord.id))||[]);alternatives=alternatives.filter(alt=>(alt.targetType==='section'&&alt.targetId===activeSectionId)||(alt.targetType==='line'&&ids.has(alt.targetId))||(alt.targetType==='chord'&&chordIds.has(alt.targetId)));}
    alternatives.forEach(alt=>stack.append(renderAlternativeCard(song,alt)));if(!alternatives.length){const empty=document.createElement('div');empty.className='workbench-empty';empty.textContent=state.alternativeScope==='current'?'Alternatives for the selected line, chord or section appear here.':'No alternatives here.';stack.append(empty);}els.workbenchBody.append(stack);}
  function renderWorkbenchAlternativesReset(song){els.workbenchBody.replaceChildren();renderWorkbenchAlternatives(song);}
  function alternativePreview(alt){if(alt.content?.line)return alt.content.line.kind==='progression'?alt.content.line.text:alt.content.line.text;if(alt.content?.chord)return alt.content.chord.value;if(alt.content?.section)return alt.content.section.lines.map(line=>line.text).join(' / ');if(alt.content?.harmony)return`Sounds in ${alt.content.harmony.key}`;if(alt.content?.text)return alt.content.text;return'Alternative';}
  function alternativeTargetLabel(song,alt){if(alt.targetType==='song')return song.title;if(alt.targetType==='section')return findSection(song,alt.targetId)?.label||'Missing section';if(alt.targetType==='chord'){const found=findChord(song,alt.parentLineId,alt.targetId);return found?`${found.section.label} · chord`:'Unplaced chord';}const found=findLine(song,alt.targetId);if(found)return`${found.section.label} · line ${found.section.lines.indexOf(found.line)+1}`;const spare=song.shapeBlocks.find(block=>block.sourceLineId===alt.targetId);return spare?'Saved line':'Unplaced alternative';}
  function renderAlternativeCard(song,alt){const card=document.createElement('article');card.className=`shelf-card${alt.type==='harmony'?' harmony':alt.type==='title'?' title':''}`;card.innerHTML=`<div class="shelf-meta">${escapeHtml(alternativeTargetLabel(song,alt))}</div><div class="shelf-copy">${escapeHtml(alternativePreview(alt))}</div>`;const actions=document.createElement('div');actions.className='shelf-actions';const use=document.createElement('button');use.textContent='Use this';use.onclick=()=>activateAlternative(song,alt);const keep=document.createElement('button');keep.textContent='Keep in Words';keep.onclick=()=>alternativeToSpare(song,alt);const more=document.createElement('button');more.textContent='•••';more.setAttribute('aria-label','Alternative menu');more.onclick=()=>openMenu(more,[['Compare with current',()=>openAlternativeCompare(song,alt)],['Delete',()=>perform('Deleted alternative',()=>song.alternatives=song.alternatives.filter(item=>item.id!==alt.id),'Alternative deleted'),'danger']]);actions.append(use,keep,more);card.append(actions);return card;}


  function openAlternativesTray(){state.alternativesTrayOpen=true;state.workbenchOpen=false;scheduleSave();render();}
  function closeAlternativesTray(){state.alternativesTrayOpen=false;scheduleSave();render();}
  function currentAlternatives(song){
    if(activeChordId)return song.alternatives.filter(alt=>alt.targetType==='chord'&&alt.targetId===activeChordId);
    if(activeLineId)return song.alternatives.filter(alt=>alt.targetType==='line'&&alt.targetId===activeLineId);
    if(activeSectionId)return song.alternatives.filter(alt=>alt.targetType==='section'&&alt.targetId===activeSectionId);
    return [];
  }
  function renderAlternativesTray(){
    if(!els.alternativesTrayBody)return;els.alternativesTrayBody.replaceChildren();
    const song=currentSong();if(!song||state.view!=='write'||!state.alternativesTrayOpen)return;
    const found=activeLineId?findLine(song,activeLineId):null;
    els.alternativesTrayContext.textContent=activeChordId?'Temporary options · selected chord':found?`Temporary options · ${found.section.label} · line ${found.section.lines.indexOf(found.line)+1}`:activeSectionId?`Temporary options · ${findSection(song,activeSectionId)?.label||'selected section'}`:'Select a line, chord or section';
    const alternatives=currentAlternatives(song);
    if(!alternatives.length){const empty=document.createElement('div');empty.className='workbench-empty';empty.textContent='Other versions of the selected line, chord or section appear here.';els.alternativesTrayBody.append(empty);return;}
    const current=document.createElement('article');current.className='shelf-card alternative-choice current';current.innerHTML=`<div class="alternative-letter">A</div><div class="shelf-meta">Current</div><div class="shelf-copy">${escapeHtml(activeChordId?findChord(song,activeChordLineId,activeChordId)?.chord?.value||'':found?.line?.text||findSection(song,activeSectionId)?.label||'Current choice')}</div>`;els.alternativesTrayBody.append(current);
    alternatives.forEach((alt,index)=>{const card=renderAlternativeCard(song,alt);card.classList.add('alternative-choice');const letter=document.createElement('div');letter.className='alternative-letter';letter.textContent=String.fromCharCode(66+index);card.prepend(letter);els.alternativesTrayBody.append(card);});
  }

  function currentAlternativePreview(song,alt){
    if(alt.targetType==='line'){const found=findLine(song,alt.targetId);return found?.line?.text||'Line no longer on the page';}
    if(alt.targetType==='chord'){const found=findChord(song,alt.parentLineId,alt.targetId);return found?.chord?.value||'Chord no longer on the page';}
    if(alt.targetType==='section'){const section=findSection(song,alt.targetId);return section?.lines.map(line=>line.text).filter(Boolean).join(' / ')||'Section no longer on the page';}
    if(alt.type==='title')return song.title;
    return song.title;
  }
  function openAlternativeCompare(song,alt){
    state.alternativesTrayOpen=true;els.alternativesTrayBody.replaceChildren();
    const compare=document.createElement('div');compare.className='alternatives-compare-inline';
    compare.innerHTML=`<article><span>Current</span><p>${escapeHtml(currentAlternativePreview(song,alt))}</p></article><article><span>Alternative</span><p>${escapeHtml(alternativePreview(alt))}</p></article>`;
    const actions=document.createElement('div');actions.className='alternatives-compare-actions';
    const back=document.createElement('button');back.className='ghost-button';back.textContent='Back';back.onclick=renderAlternativesTray;
    const use=document.createElement('button');use.className='primary-button';use.textContent='Use alternative';use.onclick=()=>activateAlternative(song,alt);
    actions.append(back,use);compare.append(actions);els.alternativesTrayBody.append(compare);
  }

  function activateAlternative(song,alt){perform('Activated alternative',()=>{if(alt.targetType==='line'){const found=findLine(song,alt.targetId);if(found){const current=clone({text:found.line.text,chords:found.line.chords,kind:found.line.kind,style:found.line.style});const next=clone(alt.content.line||{text:alt.content.text||'',chords:[],kind:found.line.kind,style:{}});Object.assign(found.line,next);alt.content.line=current;delete alt.content.text;activeLineId=found.line.id;activeSectionId=found.section.id;}else{const spare=song.shapeBlocks.find(block=>block.sourceLineId===alt.targetId);if(!spare)return;const current={text:spare.text,chords:clone(spare.chords||[]),kind:spare.type==='harmony'?'progression':'lyric',style:{}};const next=clone(alt.content.line||{text:alt.content.text||'',chords:[],kind:current.kind,style:{}});spare.text=next.text;spare.chords=clone(next.chords||[]);spare.type=next.kind==='progression'?'harmony':'fragment';alt.content.line=current;delete alt.content.text;}}else if(alt.targetType==='chord'){const found=findChord(song,alt.parentLineId,alt.targetId);if(!found)return;const current={value:found.chord.value,anchor:found.chord.anchor};found.chord.value=alt.content.chord.value;found.chord.anchor=alt.content.chord.anchor;alt.content.chord=current;activeChordId=found.chord.id;activeChordLineId=found.line.id;activeLineId=found.line.id;activeSectionId=found.section.id;}else if(alt.targetType==='section'){const index=song.sections.findIndex(section=>section.id===alt.targetId);if(index<0)return;const current=clone(song.sections[index]);const replacement=clone(alt.content.section);replacement.id=current.id;song.sections[index]=replacement;alt.content.section=current;}else if(alt.type==='harmony'&&alt.content.harmony){const current=captureHarmony(song);applyHarmony(song,alt.content.harmony);alt.content.harmony=current;}else if(alt.type==='title'){const current=song.title;song.title=alt.content.text;alt.content.text=current;}},'Alternative made active');}
  function alternativeToSpare(song,alt){const source=alternativeTargetLabel(song,alt);perform('Kept alternative in Words',()=>{const material=alt.content?.line;const block=material?createBlock(material.kind==='progression'?'harmony':'fragment',material.text,180,140,material.chords):createBlock(alt.type==='harmony'?'harmony':alt.type==='title'?'title':'fragment',alternativePreview(alt),180,140);const point=findOpenShapePoint(song,block.w,block.h,{x:180,y:140});block.x=point.x;block.y=point.y;block.savedFrom=`From ${source}`;song.shapeBlocks.push(block);song.alternatives=song.alternatives.filter(item=>item.id!==alt.id);state.alternativesTrayOpen=false;state.workbenchOpen=true;state.workbenchTab='words';},'Kept in Words');}

  function savedBlockTarget(song,block){const found=findLine(song,activeLineId);if(!found)return null;if(block.type==='title')return null;if(block.type==='harmony'&&found.line.kind!=='progression')return null;if(block.type!=='harmony'&&found.line.kind!=='lyric')return null;return found;}
  function bindPanelAction(button,action){let handled=false;const run=()=>{if(handled)return;handled=true;action();};const early=event=>{if(!activeEditor||handled)return;event.preventDefault();event.stopPropagation();run();};button.onpointerdown=early;button.onmousedown=early;button.onfocus=()=>{if(!keyboardNavigation&&performance.now()-lastEditorBlurAt<500)run();};button.onclick=()=>run();}
  function addSavedBlockAsAlternative(song,block,target=savedBlockTarget(song,block)){
    if(!target){toast(block.type==='harmony'?'Select a chord row first':'Select a lyric line first');return;}
    const count=lineAlternativeCount(song,target.line);
    perform('Created lyric alternative',()=>{song.alternatives.unshift({id:uid('alt'),type:block.type==='harmony'?'harmony':'lyric',targetType:'line',targetId:target.line.id,label:`Option ${String.fromCharCode(66+count)}`,content:{line:{text:block.text,chords:clone(block.chords||[]),kind:block.type==='harmony'?'progression':'lyric',style:{}}},createdAt:now()});state.alternativesTrayOpen=true;state.workbenchOpen=false;activeLineId=target.line.id;activeSectionId=target.section.id;},'Added as an alternative');
  }
  function insertSpareBlock(song,block){shapeSelection.clear();shapeSelection.add(shapeKey('block',block.id));rememberShapeSelection(song);sendShapeSelectionToWrite(song);}

  function renderWorkbenchSpare(song){
    const found=state.view==='write'?findLine(song,activeLineId):null;
    const guide=document.createElement('div');guide.className='words-alternatives-guide';
    if(found){const count=lineAlternativeCount(song,found.line);guide.innerHTML=`<div><strong>${escapeHtml(found.section.label)} · line ${found.section.lines.indexOf(found.line)+1}</strong><span>Try saved wording here as a temporary alternative.</span></div>`;if(count){const open=document.createElement('button');open.className='ghost-button';open.textContent=`Alternatives (${count})`;open.onclick=openAlternativesTray;guide.append(open);}}
    else guide.innerHTML=`<div><strong>Saved words</strong><span>${state.view==='write'?'Select a lyric line to try saved wording as an alternative.':'Lines and titles you want to keep for later.'}</span></div>`;
    els.workbenchBody.append(guide);
    const add=document.createElement('button');add.className='shelf-add';add.textContent='+ Save a line';
    add.onclick=()=>openFormModal('Save a line',[{name:'text',label:'Line or note',type:'textarea',placeholder:'Write something to keep…',required:true}],values=>{const text=values.text.trim();if(!text)return false;const center=visibleShapeCenter(song);const block=createBlock('fragment',text,center.x,center.y);const point=findOpenShapePoint(song,block.w,block.h,center);block.x=point.x;block.y=point.y;song.shapeBlocks.push(block);touch(song);if(state.view==='shape')renderView(song);renderWorkbench();});
    els.workbenchBody.append(add);
    const stack=document.createElement('div');stack.className='workbench-stack';
    song.shapeBlocks.forEach(block=>{
      const card=document.createElement('article');card.className=`shelf-card${block.type==='harmony'?' harmony':block.type==='title'?' title':''}`;card.draggable=true;card.ondragstart=event=>{dragData={kind:block.type==='harmony'?'shelf-progression':'shelf-fragment',blockId:block.id,text:block.text};event.dataTransfer.setData('text/plain',block.text);event.dataTransfer.effectAllowed='copy';};card.ondragend=()=>dragData=null;
      const kind=block.type==='harmony'?'Progression':block.type==='title'?'Title':'Saved line';card.innerHTML=`<div class="shelf-meta">${escapeHtml(block.savedFrom||kind)}</div><div class="shelf-copy">${escapeHtml(block.text||'Blank saved line')}</div>`;
      const actions=document.createElement('div');actions.className='shelf-actions';
      const target=savedBlockTarget(song,block);const use=document.createElement('button');use.textContent=state.view==='plan'?'Copy to Plan':state.view==='shape'?'Place in Shape':target?'Try as alternative':'Add as new line';
      const useAction=()=>{
        if(state.view==='plan'){
          const join=song.plan.brainDump.trim()?`\n\n${block.text}`:block.text;song.plan.brainDump+=join;touch(song);renderView(song);toast('Copied to Plan');
        }else if(state.view==='shape'){
          shapeSelection.clear();shapeSelection.add(shapeKey('block',block.id));renderView(song);requestAnimationFrame(()=>centreShapeSelection(song));
        }else if(target)addSavedBlockAsAlternative(song,block,target);else insertSpareBlock(song,block);
      };bindPanelAction(use,useAction);
      const secondary=document.createElement('button');secondary.textContent=state.view==='shape'?'Add to Write':state.view==='write'&&target?'Add as new line':'Open in Shape';
      const secondaryAction=()=>{if(state.view==='shape'||state.view==='write'&&target)insertSpareBlock(song,block);else{shapeSelection.clear();shapeSelection.add(shapeKey('block',block.id));setView('shape');}};bindPanelAction(secondary,secondaryAction);
      const more=document.createElement('button');more.textContent='•••';
      more.setAttribute('aria-label','Saved item menu');more.onclick=()=>openMenu(more,[['Duplicate',()=>{const copy=clone(block);copy.id=uid('block');copy.x+=28;copy.y+=28;song.shapeBlocks.push(copy);touch(song);renderWorkbench();}],['Delete',()=>perform('Deleted saved item',()=>song.shapeBlocks=song.shapeBlocks.filter(item=>item.id!==block.id),'Saved item deleted'),'danger']]);
      actions.append(use,secondary,more);card.append(actions);stack.append(card);
    });
    if(!song.shapeBlocks.length){const empty=document.createElement('div');empty.className='workbench-empty';empty.textContent='Nothing saved yet. Keep a line, title or note here for later.';stack.append(empty);}
    els.workbenchBody.append(stack);
  }

  function renderWorkbenchChords(song){const context=chordContext(song);const profile=activeProfile(song);const key=context?sectionKey(song,context.section):song.key;const info=document.createElement('div');info.className='workbench-empty';const representation=state.chordDisplay==='shapes'?(tuningIsAutomatic(profile.tuning)?`In ${profile.shapeKey} shapes`:'Manual chord names'):state.chordDisplay==='numbers'?'Nashville numbers':`In ${compactKey(key)} sounding chords`;const selectedCount=selectedChordIds.size||((context?.mode==='replace'||context?.mode==='progression-replace')?1:0);info.innerHTML=`<strong>${escapeHtml(representation)}</strong><br>${selectedCount>1?`${selectedCount} chords selected. Shift-click selects a range.`:context?.mode==='replace'?`Choose a replacement for ${escapeHtml(storedChordToDisplay(context.chord.value,song,state.chordDisplay,key))}.`:context?.mode==='progression-replace'?`Choose a replacement for ${escapeHtml(storedChordToDisplay(context.token.value,song,state.chordDisplay,key))}.`:context?'Add a chord above this word.':'Select a lyric position, chord or chord row.'}`;if(selectedCount){const actions=document.createElement('div');actions.className='chord-selection-actions';if(phoneShapeLayout()&&context?.mode==='replace'){const moveLeft=document.createElement('button');moveLeft.className='ghost-button';moveLeft.textContent='← Move';moveLeft.onclick=()=>moveChordByWord(song,context.line,context.chord,-1);const moveRight=document.createElement('button');moveRight.className='ghost-button';moveRight.textContent='Move →';moveRight.onclick=()=>moveChordByWord(song,context.line,context.chord,1);actions.append(moveLeft,moveRight);}const remove=document.createElement('button');remove.className='ghost-button danger';remove.textContent=selectedCount>1?'Remove selected chords':'Remove chord';remove.onclick=()=>removeActiveChords(song);const copy=document.createElement('button');copy.className='ghost-button';copy.textContent='Copy';copy.onclick=()=>copyActiveChords(song);actions.append(copy,remove);info.append(actions);}els.workbenchBody.append(info);
    const addSection=(label,items,target=els.workbenchBody)=>{if(!items.length)return;const heading=document.createElement('div');heading.className='shelf-section-heading';heading.textContent=label;target.append(heading);const grid=document.createElement('div');grid.className='chord-helper-grid';items.forEach(item=>{const canonical=item.chord||item;const button=document.createElement('button');button.className='chord-choice';button.draggable=true;button.innerHTML=`<span>${escapeHtml(storedChordToDisplay(canonical,song,state.chordDisplay,key))}</span>${item.number?`<span>${escapeHtml(item.number)}</span>`:''}`;button.onclick=()=>applyChordChoice(song,storedChordToDisplay(canonical,song,state.chordDisplay,key));button.ondragstart=event=>{dragData={kind:'shelf-chord',value:canonical};event.dataTransfer.setData('text/plain',canonical);event.dataTransfer.effectAllowed='copy';};button.ondragend=()=>dragData=null;grid.append(button);});target.append(grid);};
    addSection('Recent',(song.recentChords||[]).map(chord=>({chord})));
    addSection('In key',CE.keyScaleChords(key,song.spelling));
    const more=document.createElement('details');more.className='chord-suggestion-more';const moreSummary=document.createElement('summary');moreSummary.textContent='More chord colours';const moreBody=document.createElement('div');moreBody.className='chord-suggestion-more-body';more.append(moreSummary,moreBody);addSection('Borrowed',CE.borrowedChords(key,song.spelling),moreBody);addSection('Open & extended',CE.songwriterChords(key,song.spelling),moreBody);els.workbenchBody.append(more);
    const custom=document.createElement('form');custom.className='shelf-chord-entry';const input=document.createElement('input');input.placeholder='F#m7, Bb/D, 4m, 5/7…';const use=document.createElement('button');use.className='primary-button';use.textContent=context?.mode?.includes('replace')?'Replace':'Add';custom.append(input,use);custom.onsubmit=event=>{event.preventDefault();applyChordChoice(song,input.value);input.value='';};els.workbenchBody.append(custom);
    const details=document.createElement('details');details.className='progression-pad';const summary=document.createElement('summary');summary.textContent='Save or drag a progression';details.append(summary);const progression=document.createElement('textarea');progression.className='shelf-progression-entry';progression.value=song.workbench.progression;progression.placeholder='| 1 | 5/7 | 6m | 4 |';progression.oninput=()=>{song.workbench.progression=progression.value;touch(song);};progression.draggable=true;progression.ondragstart=event=>{dragData={kind:'shelf-progression',text:progression.value};event.dataTransfer.setData('text/plain',progression.value);event.dataTransfer.effectAllowed='copy';};progression.ondragend=()=>dragData=null;const save=document.createElement('button');save.className='ghost-button full-width';save.textContent='Save to Loose lines';save.onclick=()=>perform('Saved progression to Loose lines',()=>song.shapeBlocks.push(createBlock('harmony',progression.value,180,140)),'Saved to Loose lines');details.append(progression,save);els.workbenchBody.append(details);
  }

  function openLineMenu(song,section,line,anchor){const items=[['Move up',()=>moveLine(song,section.id,line.id,section.id,Math.max(0,section.lines.indexOf(line)-1))],['Move down',()=>moveLine(song,section.id,line.id,section.id,Math.min(section.lines.length-1,section.lines.indexOf(line)+1))],['Move to…',()=>openMoveLineMenu(song,section,line,anchor)],['Move to Shape',()=>moveLineToSpare(song,section,line)],['Copy to Shape',()=>perform('Copied line to Shape',()=>song.shapeBlocks.push(createBlock(line.kind==='progression'?'harmony':'fragment',line.text,section.shape.x+section.shape.w+40,section.shape.y+50,line.chords)),'Copied to Loose lines')],['Duplicate',()=>perform('Duplicated line',()=>{const index=section.lines.indexOf(line);const copy=clone(line);copy.id=uid('line');copy.chords.forEach(chord=>chord.id=uid('chord'));section.lines.splice(index+1,0,copy);},'Line duplicated')]];if(line.kind==='progression'){items.push(['Copy chord row',()=>{activeLineId=line.id;copyActiveChords(song);}],['Paste chord row',()=>{activeLineId=line.id;pasteActiveChords(song);}],['Duplicate chord row',()=>{activeLineId=line.id;copyActiveChords(song);pasteActiveChords(song);}],['Add bar',()=>perform('Added bar',()=>addProgressionBar(line),'Bar added')],['Transpose chord row…',()=>openTransposePanel(song,'progression',{lineId:line.id})],['Label chord row…',()=>openFormModal('Label chord row',[{name:'label',label:'Label',type:'text',value:line.label||'',placeholder:'Turnaround'}],values=>{line.label=values.label.trim();touch(song);render();})]);}else items.push(['Copy chords',()=>{activeLineId=line.id;activeChordId=null;copyActiveChords(song);}],['Paste chords',()=>{activeLineId=line.id;pasteActiveChords(song);}],['Duplicate chords',()=>{activeLineId=line.id;activeChordId=null;duplicateActiveChords(song);}],['Split line at cursor',()=>{const editor=document.querySelector(`.notebook-row[data-line-id="${CSS.escape(line.id)}"] .line-editor`);if(editor){const [before,after]=NE.splitLine(line,editor.selectionStart,()=>uid('line'));Object.assign(line,before);section.lines.splice(section.lines.indexOf(line)+1,0,after);touch(song);render();}}],['Merge with line above',()=>{const index=section.lines.indexOf(line);if(index>0){const previous=section.lines[index-1];perform('Merged lyric rows',()=>{Object.assign(previous,NE.mergeLines(previous,line));section.lines.splice(index,1);},'Lines merged');}}]);items.push(['Store as alternative',()=>{song.alternatives.unshift({id:uid('alt'),type:line.kind==='progression'?'harmony':'lyric',targetType:'line',targetId:line.id,label:'Stored alternative',content:{line:clone({text:line.text,chords:line.chords,kind:line.kind,style:line.style})},createdAt:now()});touch(song);renderWorkbench();toast('Stored as an alternative');}],['Delete',()=>perform('Deleted line',()=>{section.lines=section.lines.filter(item=>item.id!==line.id);song.alternatives.forEach(alt=>{if(alt.targetType==='line'&&alt.targetId===line.id)alt.targetId=`unplaced:${line.id}`;});},'Line deleted'),'danger']);openMenu(anchor,items);}

  function openMoveLineMenu(song,source,line,anchor=null){const choices=song.sections.filter(section=>section.id!==source.id).map(section=>[section.label,()=>moveLine(song,source.id,line.id,section.id,section.lines.length)]);if(!choices.length){toast('There is no other section yet');return;}if(anchor)openChoicePopover(anchor,'Move row to',choices);else openChoiceModal('Move row to section',choices,'The lyric row and its chord lane move together.');}
  function openLineDetails(song,line){openFormModal('Line details',[{name:'syllables',label:'Sung syllable count',type:'number',value:line.syllableOverride??''},{name:'attention',label:'Needs attention',type:'select',value:line.attention?'yes':'no',options:[{value:'no',label:'No'},{value:'yes',label:'Yes'}]}],values=>{line.syllableOverride=values.syllables===''?null:Number(values.syllables);line.attention=values.attention==='yes';touch(song);render();});}
  function openSectionMenu(song,section,anchor){const items=[['Add lyric line',()=>addLine(song,section)],['Add chord row',()=>addLine(song,section,'progression')],['Rename…',()=>openFormModal('Rename section',[{name:'label',label:'Section name',type:'text',value:section.label,required:true}],values=>{section.label=values.label.trim();touch(song);render();})],['Move up',()=>moveSectionBy(song,section,-1)],['Move down',()=>moveSectionBy(song,section,1)],['Duplicate',()=>perform('Duplicated section',()=>{const index=song.sections.indexOf(section);const copy=clone(section);copy.id=uid('section');copy.lines.forEach(line=>{line.id=uid('line');line.chords.forEach(chord=>chord.id=uid('chord'));});copy.shape.x+=40;copy.shape.y+=40;song.sections.splice(index+1,0,copy);},'Section duplicated')],['Try another',()=>saveSectionAlternative(song,section)],['Transpose…',()=>openTransposePanel(song,'section',{sectionId:section.id})],['Set section key…',()=>openInterpretPanel(song,'section',{sectionId:section.id})]];if(section.keyOverride)items.push(['Use song key',()=>perform('Removed section key',()=>section.keyOverride=null,`${section.label} now uses ${song.key}`)]);items.push(['Delete section',()=>perform('Deleted section',()=>song.sections=song.sections.filter(item=>item.id!==section.id),'Section deleted'),'danger']);openMenu(anchor,items);}

  function moveSectionBy(song,section,direction){const index=song.sections.indexOf(section),target=clamp(index+direction,0,song.sections.length-1);if(index===target)return;perform('Moved section',()=>{song.sections.splice(index,1);song.sections.splice(target,0,section);},'Section moved');}
  function saveSectionAlternative(song,section){perform('Saved section alternative',()=>song.alternatives.unshift({id:uid('alt'),type:'section',targetType:'section',targetId:section.id,label:`${section.label} alternative`,content:{section:clone(section)},createdAt:now()}),'Section saved to Alternatives');}

  function renderChart(song){const layout=song.chartLayout;const view=document.createElement('div');view.className='chart-view';const page=document.createElement('article');page.className='chart-page';page.dataset.pageSize=layout.pageSize;page.dataset.orientation=layout.orientation;page.dataset.margin=layout.margin;page.dataset.columns=String(layout.columns);page.dataset.sectionSpacing=layout.sectionSpacing;page.dataset.lineSpacing=layout.lineSpacing;page.dataset.fontFamily=layout.fontFamily;page.style.fontSize=`${state.chartFontSize}px`;page.style.setProperty('--chart-font',fontFamilyStack(layout.fontFamily));page.innerHTML=`<h1 class="chart-title">${escapeHtml(song.title)}</h1>${layout.showMeta?`<div class="chart-meta">${escapeHtml(chartMeta(song))}</div>`:''}`;const sections=document.createElement('div');sections.className='chart-sections';song.sections.forEach(section=>{const sectionEl=document.createElement('section');sectionEl.className='chart-section';sectionEl.innerHTML=`<h3>${escapeHtml(section.label)}${section.keyOverride?` · ${escapeHtml(section.keyOverride)}`:''}</h3>`;section.lines.forEach(line=>{if(state.chartMode==='progressions'&&line.kind!=='progression'&&!line.chords.length)return;if(state.chartMode==='lyrics'&&line.kind==='progression')return;const row=document.createElement('div');row.className=`chart-line${line.kind==='progression'?' chart-chord-row':''}`;if(line.label&&line.kind==='progression'){const label=document.createElement('span');label.className='chart-row-label';label.textContent=line.label;row.append(label);}if(state.chartMode==='lyrics')row.append(document.createTextNode(line.text));else if(line.kind==='progression'){if(state.chartMode==='dual'){const shapes=document.createElement('div');shapes.textContent=displayProgression(line.text,song,'shapes',sectionKey(song,section));const sounding=document.createElement('div');sounding.className='secondary-chords';sounding.textContent=displayProgression(line.text,song,'sounding',sectionKey(song,section));row.append(shapes,sounding);}else row.append(document.createTextNode(displayProgression(line.text,song,state.chartMode==='progressions'?'sounding':state.chartMode,sectionKey(song,section))));}else if(state.chartMode==='progressions')row.append(document.createTextNode((line.chords||[]).map(chord=>storedChordToDisplay(chord.value,song,'sounding',sectionKey(song,section))).join('  ')));else if(state.chartMode==='dual'){renderStaticBracket(row,lineToBracket(song,section,line,'shapes'));const secondary=document.createElement('div');secondary.className='secondary-chords';secondary.textContent=(line.chords||[]).map(chord=>storedChordToDisplay(chord.value,song,'sounding',sectionKey(song,section))).join('  ');row.append(secondary);}else renderStaticBracket(row,lineToBracket(song,section,line,state.chartMode));sectionEl.append(row);});sections.append(sectionEl);});page.append(sections);view.append(page);els.viewHost.append(view);}

  function renderStaticBracket(container,text){let cursor=0;while(cursor<text.length){const start=text.indexOf('[',cursor);if(start<0){container.append(document.createTextNode(text.slice(cursor)));break;}if(start>cursor)container.append(document.createTextNode(text.slice(cursor,start)));let scan=start,chords=[];while(text[scan]==='['){const end=text.indexOf(']',scan+1);if(end<0)break;chords.push(text.slice(scan+1,end));scan=end+1;}if(!chords.length){container.append(document.createTextNode(text[start]));cursor=start+1;continue;}const rest=text.slice(scan),wordMatch=rest.match(/^(\s*)([^\s\[]+)?/),spaces=wordMatch?.[1]||'',word=wordMatch?.[2]||'';if(spaces)container.append(document.createTextNode(spaces));const group=document.createElement('span');group.className='anchor-group';const chordLane=document.createElement('span');chordLane.className='anchor-chord';chordLane.textContent=chords.join('  ');const wordLane=document.createElement('span');wordLane.className='anchor-word';wordLane.textContent=word||' ';group.append(chordLane,wordLane);container.append(group);cursor=scan+spaces.length+word.length;}}
  function chartMeta(song){const profile=activeProfile(song);const shape=profile.capo?`${profile.shapeKey} shapes · capo ${profile.capo}`:`${profile.shapeKey} shapes · no capo`;const writers=song.writers.map(writer=>writer.name).filter(Boolean).join(', ');const harp=profile.showHarmonica?CE.harmonicaMatches(song.key,song.spelling).cross:null;return[`Sounds in ${song.key}`,shape,profile.tuning||song.tuning,harp?`Harmonica ${harp.key} · ${harp.position}`:'',writers].filter(Boolean).join(' · ');}

  function chartText(song){const mode=state.chartMode==='lyrics'?'lyrics':state.chartMode==='numbers'?'numbers':state.chartMode==='shapes'?'shapes':'sounding';const out=[song.title,chartMeta(song),''];song.sections.forEach(section=>{out.push(section.label.toUpperCase());section.lines.forEach(line=>out.push(line.kind==='progression'?displayProgression(line.text,song,mode,sectionKey(song,section)):mode==='lyrics'?line.text:lineToBracket(song,section,line,mode)));out.push('');});return out.join('\n');}

  function chordProText(song){const out=[`{title: ${song.title}}`,`{key: ${song.key}}`];song.writers.forEach(writer=>out.push(`{composer: ${writer.name}${writer.ipi?` · IPI ${writer.ipi}`:''}}`));song.sections.forEach(section=>{out.push('',`{start_of_section: ${section.label}}`);section.lines.forEach(line=>out.push(line.kind==='progression'?line.text:lineToBracket(song,section,line,'stored')));out.push('{end_of_section}');});return out.join('\n');}
  function openChartLayout(song){const layout=song.chartLayout;openFormModal('Chart layout',[{name:'size',label:'Text size',type:'select',value:String(state.chartFontSize),options:[12,14,16,18,20,22].map(value=>({value:String(value),label:`${value} pt`}))},{name:'fontFamily',label:'Chart typeface',type:'select',value:layout.fontFamily,options:[{value:'song',label:'Match Write'},{value:'sans',label:'Contemporary'},{value:'serif',label:'Traditional'},{value:'typewriter',label:'Typewriter'}]},{name:'pageSize',label:'Page size',type:'select',value:layout.pageSize,options:[{value:'a4',label:'A4'},{value:'letter',label:'US Letter'}]},{name:'orientation',label:'Orientation',type:'select',value:layout.orientation,options:[{value:'portrait',label:'Portrait'},{value:'landscape',label:'Landscape'}]},{name:'margin',label:'Margins',type:'select',value:layout.margin,options:[{value:'compact',label:'Compact'},{value:'normal',label:'Normal'},{value:'wide',label:'Wide'}]},{name:'columns',label:'Columns',type:'select',value:String(layout.columns),options:[{value:'1',label:'One column'},{value:'2',label:'Two columns'}]},{name:'sectionSpacing',label:'Section spacing',type:'select',value:layout.sectionSpacing,options:[{value:'compact',label:'Compact'},{value:'normal',label:'Normal'},{value:'open',label:'Open'}]},{name:'lineSpacing',label:'Line spacing',type:'select',value:layout.lineSpacing,options:[{value:'compact',label:'Compact'},{value:'normal',label:'Normal'},{value:'open',label:'Open'}]},{name:'showMeta',label:'Song details',type:'select',value:layout.showMeta?'yes':'no',options:[{value:'yes',label:'Show'},{value:'no',label:'Hide'}]}],values=>{state.chartFontSize=Number(values.size);Object.assign(song.chartLayout,{fontFamily:values.fontFamily,pageSize:values.pageSize,orientation:values.orientation,margin:values.margin,columns:Number(values.columns),sectionSpacing:values.sectionSpacing,lineSpacing:values.lineSpacing,showMeta:values.showMeta==='yes'});touch(song);renderView(song);});}
  function openChartExport(song){openChoiceModal('Export chart',[['Print / PDF',()=>window.print()],['Plain text',()=>downloadText(`${safeName(song.title)}.txt`,chartText(song))],['ChordPro',()=>downloadText(`${safeName(song.title)}.cho`,chordProText(song))],['Complete song bundle',()=>exportSongBundle(song)],['Song metadata JSON',()=>downloadText(`${safeName(song.title)}.json`,JSON.stringify({type:'cowriter-song-0.4.0.12',song},null,2))]]);}

  function openKeyModal(song,anchor=null){
    if(anchor)openMenu(anchor,[['Transpose song…',()=>openTransposePanel(song,'song')],['Set song key without moving chords…',()=>openInterpretPanel(song,'song')],['Key/Capo…',()=>openKeyCapoPanel(song)]]);
    else openTransposePanel(song,'song');
  }
  function openTransposePreview(song,targetKey){openTransposePanel(song,'song',{targetKey});}
  function openSectionTranspose(song,section){openTransposePanel(song,'section',{sectionId:section.id});}

  function openTransientPanel(panel){transientPanel=panel;state.workbenchOpen=true;scheduleSave();render();}
  function closeTransientPanel(){transientPanel=null;state.workbenchOpen=false;scheduleSave();render();}

  function transposeScopeContext(song,scope,options={}){
    if(scope==='chord'){
      const found=findChord(song,options.lineId||activeChordLineId,options.chordId||activeChordId);return found?{scope,label:`${found.section.label} · ${found.chord.value}`,sourceKey:sectionKey(song,found.section),...found}:null;
    }
    if(scope==='progression'){
      const found=findLine(song,options.lineId||activeLineId);return found&&found.line.kind==='progression'?{scope,label:`${found.section.label} progression`,sourceKey:sectionKey(song,found.section),...found}:null;
    }
    if(scope==='section'){
      const section=findSection(song,options.sectionId||activeSectionId);return section?{scope,label:section.label,sourceKey:sectionKey(song,section),section}:null;
    }
    return{scope:'song',label:song.title,sourceKey:song.key,song};
  }

  function openTransposePanel(song,scope='song',options={}){
    const context=transposeScopeContext(song,scope,options);if(!context){toast('Select a chord, progression or section to transpose');return;}
    const candidates=KEYS.filter(key=>CE.sameMode(key,context.sourceKey));const currentIndex=Math.max(0,candidates.indexOf(context.sourceKey));const targetKey=options.targetKey||candidates[(currentIndex+2)%candidates.length]||context.sourceKey;
    openTransientPanel({type:'transpose',scope,contextOptions:options,label:context.label,targetKey,spelling:song.spelling||'auto'});
  }

  function transposePreviewPairs(song,context,targetKey,spelling){
    const semitones=CE.signedKeyDistance(context.sourceKey,targetKey);let chords=[];
    if(context.scope==='chord')chords=[context.chord.value];
    else if(context.scope==='progression')chords=String(context.line.text||'').split(/\s+|\|/).filter(token=>CE.parseChord(token)?.recognised);
    else if(context.scope==='section')chords=context.section.lines.flatMap(line=>line.kind==='progression'?String(line.text||'').split(/\s+|\|/).filter(token=>CE.parseChord(token)?.recognised):(line.chords||[]).map(chord=>chord.value));
    else chords=song.sections.flatMap(section=>section.lines.flatMap(line=>line.kind==='progression'?String(line.text||'').split(/\s+|\|/).filter(token=>CE.parseChord(token)?.recognised):(line.chords||[]).map(chord=>chord.value)));
    return [...new Set(chords)].slice(0,10).map(value=>({from:value,to:CE.transposeChord(value,semitones,targetKey,spelling)}));
  }

  function transposeSongHarmony(song,targetKey,spelling=song.spelling||'auto',preserve=false){
    const semitones=CE.signedKeyDistance(song.key,targetKey);if(!semitones)return;
    const current=captureHarmony(song);if(preserve)song.alternatives.unshift({id:uid('alt'),type:'harmony',targetType:'song',targetId:song.id,label:`${current.key} arrangement`,content:{harmony:current},createdAt:now()});
    song.key=targetKey;song.spelling=spelling;
    song.sections.forEach(section=>{if(section.keyOverride){const parsed=CE.parseKey(section.keyOverride);section.keyOverride=`${CE.noteName(CE.noteIndex(parsed.tonic)+semitones,targetKey,spelling)}${parsed.mode==='minor'?'m':''}`;}section.lines.forEach(line=>{if(line.kind==='progression')line.text=String(line.text||'').split(/(\s+|\|+)/g).map(part=>CE.parseChord(part)?.recognised?CE.transposeChord(part,semitones,targetKey,spelling):part).join('');else line.chords=(line.chords||[]).map(chord=>({...chord,value:CE.transposeChord(chord.value,semitones,targetKey,spelling)}));});});
    song.chartProfiles.forEach(profile=>{if(tuningIsAutomatic(profile.tuning))profile.capo=CE.capoForKeysWithTuning(targetKey,profile.shapeKey,profile.tuning);profile.name=`${profile.shapeKey} shapes · ${profile.capo?`capo ${profile.capo}`:'no capo'}`;});
  }

  function renderTransposePanel(song,panel){
    const context=transposeScopeContext(song,panel.scope,panel.contextOptions);if(!context){transientPanel=null;renderWorkbench();return;}
    const form=document.createElement('div');form.className='side-tool-form';
    const scope=document.createElement('div');scope.className='tool-summary';scope.innerHTML=`<span>Change</span><strong>${escapeHtml(context.scope==='song'?'Whole song':context.scope==='section'?context.section.label:context.scope==='progression'?'Selected progression':'Selected chord')}</strong>`;
    const current=document.createElement('div');current.className='tool-summary';current.innerHTML=`<span>From</span><strong>${escapeHtml(longKeyLabel(context.sourceKey))}</strong>`;
    const keyField=document.createElement('label');keyField.className='side-field';keyField.innerHTML='<span>To</span>';const keySelect=document.createElement('select');KEYS.filter(key=>CE.sameMode(key,context.sourceKey)).forEach(key=>{const option=document.createElement('option');option.value=key;option.textContent=longKeyLabel(key);keySelect.append(option);});keySelect.value=panel.targetKey;keyField.append(keySelect);
    const spellingField=document.createElement('label');spellingField.className='side-field';spellingField.innerHTML='<span>Chord spelling</span>';const spelling=document.createElement('select');[['auto','Automatic'],['sharp','Prefer sharps'],['flat','Prefer flats']].forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;spelling.append(option);});spelling.value=panel.spelling||'auto';spellingField.append(spelling);
    const interval=document.createElement('div');interval.className='tool-summary';
    const preview=document.createElement('div');preview.className='transpose-preview';
    const update=()=>{panel.targetKey=keySelect.value;panel.spelling=spelling.value;const semitones=CE.signedKeyDistance(context.sourceKey,panel.targetKey);interval.innerHTML=`<span>Move</span><strong>${intervalLabel(semitones)}</strong>`;preview.replaceChildren();const heading=document.createElement('div');heading.className='preview-heading';heading.textContent='Preview';preview.append(heading);const pairs=transposePreviewPairs(song,context,panel.targetKey,panel.spelling);if(!pairs.length){const empty=document.createElement('div');empty.className='workbench-empty';empty.textContent='No chords to preview.';preview.append(empty);}else pairs.forEach(pair=>{const row=document.createElement('div');row.className='preview-pair';row.innerHTML=`<span>${escapeHtml(pair.from)}</span><span>→</span><strong>${escapeHtml(pair.to)}</strong>`;preview.append(row);});};keySelect.onchange=update;spelling.onchange=update;
    const actions=document.createElement('div');actions.className='side-tool-actions';const cancel=document.createElement('button');cancel.className='ghost-button';cancel.textContent='Cancel';cancel.onclick=closeTransientPanel;const apply=document.createElement('button');apply.className='primary-button';apply.textContent='Apply';apply.onclick=()=>applyTransposePanel(song,panel,false);const more=document.createElement('button');more.className='ghost-button compact';more.textContent='▾';more.title='More apply options';more.onclick=()=>openMenu(more,[['Apply and keep current as an alternative',()=>applyTransposePanel(song,panel,true)]]);actions.append(cancel,apply,more);
    form.append(scope,current,keyField,interval,spellingField,preview,actions);els.workbenchBody.append(form);update();
  }

  function applyTransposePanel(song,panel,preserve){
    const context=transposeScopeContext(song,panel.scope,panel.contextOptions);if(!context)return;const targetKey=panel.targetKey;if(targetKey===context.sourceKey){toast('Choose a different key');return;}const semitones=CE.signedKeyDistance(context.sourceKey,targetKey);const spelling=panel.spelling||song.spelling;
    perform(`Transposed ${panel.scope}`,()=>{
      if(context.scope==='song')transposeSongHarmony(song,targetKey,spelling,preserve);
      else if(context.scope==='section'){
        if(preserve)song.alternatives.unshift({id:uid('alt'),type:'section',targetType:'section',targetId:context.section.id,label:`${context.section.label} in ${context.sourceKey}`,content:{section:clone(context.section)},createdAt:now()});context.section.keyOverride=targetKey;context.section.lines.forEach(line=>{if(line.kind==='progression')line.text=String(line.text||'').split(/(\s+|\|+)/g).map(part=>CE.parseChord(part)?.recognised?CE.transposeChord(part,semitones,targetKey,spelling):part).join('');else line.chords=(line.chords||[]).map(chord=>({...chord,value:CE.transposeChord(chord.value,semitones,targetKey,spelling)}));});
      }else if(context.scope==='progression'){
        if(preserve)song.alternatives.unshift({id:uid('alt'),type:'harmony',targetType:'line',targetId:context.line.id,label:'Previous progression',content:{line:clone({text:context.line.text,chords:[],kind:'progression',style:context.line.style})},createdAt:now()});context.line.text=String(context.line.text||'').split(/(\s+|\|+)/g).map(part=>CE.parseChord(part)?.recognised?CE.transposeChord(part,semitones,targetKey,spelling):part).join('');
      }else{if(preserve)saveChordAlternativeInline(song,context.line,context.chord);context.chord.value=CE.transposeChord(context.chord.value,semitones,targetKey,spelling);context.chord.needsReview=false;}
    },`${context.scope==='song'?'Song':context.scope==='section'?context.section.label:context.scope==='progression'?'Chord row':'Chord'} transposed to ${compactKey(targetKey)}.`,()=>{transientPanel=null;state.workbenchOpen=false;render();});
  }

  function saveChordAlternativeInline(song,line,chord){song.alternatives.unshift({id:uid('alt'),type:'harmony',targetType:'chord',targetId:chord.id,parentLineId:line.id,label:'Chord alternative',content:{chord:{value:chord.value,anchor:chord.anchor}},createdAt:now()});}

  function openInterpretPanel(song,scope='song',options={}){const context=transposeScopeContext(song,scope,options);if(!context)return;openTransientPanel({type:'interpret',scope,contextOptions:options,label:context.label,targetKey:context.sourceKey});}
  function renderInterpretPanel(song,panel){const context=transposeScopeContext(song,panel.scope,panel.contextOptions);const form=document.createElement('div');form.className='side-tool-form';const copy=document.createElement('div');copy.className='workbench-empty';copy.textContent='Chord symbols stay where they are. Nashville numbers and in-key suggestions use the new key.';const field=document.createElement('label');field.className='side-field';field.innerHTML='<span>Set key</span>';const select=document.createElement('select');KEYS.forEach(key=>{const option=document.createElement('option');option.value=key;option.textContent=longKeyLabel(key);select.append(option);});select.value=context.sourceKey;field.append(select);const actions=document.createElement('div');actions.className='side-tool-actions';const cancel=document.createElement('button');cancel.className='ghost-button';cancel.textContent='Cancel';cancel.onclick=closeTransientPanel;const apply=document.createElement('button');apply.className='primary-button';apply.textContent='Apply';apply.onclick=()=>perform('Set key without moving chords',()=>{if(panel.scope==='section')context.section.keyOverride=select.value;else song.key=select.value;},`Song key set to ${select.value}. Chords unchanged.`,()=>{transientPanel=null;state.workbenchOpen=false;render();});actions.append(cancel,apply);form.append(copy,field,actions);els.workbenchBody.append(form);}

  function changePlayingProfile(song,profile,next,changed,after=null){
    snapshot('Changed playing profile');const previousSound=song.key;const automatic=tuningIsAutomatic(next.tuning);
    if(!automatic){profile.tuning=next.tuning;profile.shapeKey=next.shapeKey;profile.capo=next.capo;song.tuning=next.tuning;}
    else if(profile.keepMode==='sounding'){
      profile.tuning=next.tuning;
      if(changed==='shape'){profile.shapeKey=next.shapeKey;profile.capo=CE.capoForKeysWithTuning(song.key,profile.shapeKey,profile.tuning);}
      else if(changed==='capo'){profile.capo=next.capo;profile.shapeKey=CE.shapeKeyForCapoWithTuning(song.key,profile.capo,profile.tuning,song.spelling);}
      else{profile.shapeKey=profile.shapeKey||next.shapeKey;profile.capo=CE.capoForKeysWithTuning(song.key,profile.shapeKey,profile.tuning);}
    }else{
      profile.shapeKey=next.shapeKey;profile.capo=next.capo;profile.tuning=next.tuning;
      const newSound=CE.soundingKeyFromShapeWithTuning(profile.shapeKey,profile.capo,profile.tuning,song.spelling);
      if(newSound!==previousSound){applyHarmony(song,transposedHarmony(song,newSound));song.chartProfiles.forEach(other=>{if(other.id!==profile.id&&tuningIsAutomatic(other.tuning))other.capo=CE.capoForKeysWithTuning(song.key,other.shapeKey,other.tuning);});}
    }
    song.tuning=profile.tuning;profile.name=`${profile.shapeKey} shapes · ${profile.capo?`capo ${profile.capo}`:'no capo'}`;touch(song);render();after?.();toast(profile.keepMode==='sounding'?`Still sounds in ${compactKey(song.key)}. Now using ${profile.shapeKey} shapes${profile.capo?` with capo ${profile.capo}`:''}.`:`Now sounds in ${compactKey(song.key)}.`,undo);
  }

  function keyBySemitone(key,amount,spelling='auto'){const parsed=CE.parseKey(key),target=((CE.noteIndex(parsed.tonic)+amount)%12+12)%12;const matches=KEYS.filter(value=>CE.sameMode(value,key)&&CE.noteIndex(CE.parseKey(value).tonic)===target);const accidental=spelling==='flat'?'b':spelling==='sharp'?'#':parsed.tonic.includes('b')?'b':parsed.tonic.includes('#')?'#':'';return matches.find(value=>accidental&&CE.parseKey(value).tonic.includes(accidental))||matches[0]||key;}
  function openInlineHarmonyPopover(song,anchor){
    closeOverlay();const rect=anchor.getBoundingClientRect();const profile=activeProfile(song);const backdrop=document.createElement('div');backdrop.className='overlay-backdrop clear';const panel=document.createElement('section');panel.className='harmony-popover';
    const head=document.createElement('header');head.className='harmony-popover-head';const heading=document.createElement('div');heading.innerHTML='<strong>Capo & shapes</strong><span>How this song is played</span>';const close=document.createElement('button');close.className='icon-button';close.textContent='×';close.setAttribute('aria-label','Close harmony controls');close.onclick=closeOverlay;head.append(heading,close);
    const soundDetails=document.createElement('details');soundDetails.className='harmony-sounding-extra';const soundSummary=document.createElement('summary');const soundSummaryLabel=document.createElement('span');soundSummaryLabel.textContent='Sounds in';const soundSummaryKey=document.createElement('strong');soundSummary.append(soundSummaryLabel,soundSummaryKey);const soundField=document.createElement('label');soundField.className='harmony-inline-field harmony-sounding';const soundLabel=document.createElement('span');soundLabel.textContent='Transpose sounding song';const soundControls=document.createElement('div');soundControls.className='harmony-key-stepper';const down=document.createElement('button');down.type='button';down.textContent='−';down.title='Transpose down one semitone';down.setAttribute('aria-label','Transpose down one semitone');const sound=document.createElement('select');sound.setAttribute('aria-label','Sounding key');const up=document.createElement('button');up.type='button';up.textContent='+';up.title='Transpose up one semitone';up.setAttribute('aria-label','Transpose up one semitone');soundControls.append(down,sound,up);soundField.append(soundLabel,soundControls);soundDetails.append(soundSummary,soundField);
    const playing=document.createElement('div');playing.className='harmony-playing-grid';const shapeField=document.createElement('label');shapeField.className='harmony-inline-field';const shapeLabel=document.createElement('span');shapeLabel.textContent='Playing shapes';const shape=document.createElement('select');shape.setAttribute('aria-label','Playing shapes');KEYS.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=CE.formatKey(value);shape.append(option);});shapeField.append(shapeLabel,shape);const capoField=document.createElement('label');capoField.className='harmony-inline-field';const capoLabel=document.createElement('span');capoLabel.textContent='Capo';const capo=document.createElement('select');capo.setAttribute('aria-label','Capo');for(let value=0;value<=11;value++){const option=document.createElement('option');option.value=String(value);option.textContent=value===0?'None':String(value);capo.append(option);}capoField.append(capoLabel,capo);playing.append(shapeField,capoField);
    const keep=document.createElement('div');keep.className='keep-choice harmony-inline-keep';const keepLabel=document.createElement('span');keepLabel.textContent='Keep';keep.append(keepLabel);const keepButtons={};[['sounding','Sounding key'],['shapes','Playing shapes']].forEach(([value,label])=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{snapshot('Changed transpose lock');profile.keepMode=value;touch(song);render();sync();toast(value==='sounding'?'Capo and shapes now follow the sounding key.':'Changing capo or shapes will transpose the song.');};keepButtons[value]=button;keep.append(button);});
    const note=document.createElement('p');note.className='harmony-inline-note';const advanced=document.createElement('button');advanced.type='button';advanced.className='harmony-advanced';advanced.textContent='Tuning & player tools…';advanced.onclick=()=>{closeOverlay();openKeyCapoPanel(song);};
    panel.append(head,playing,keep,note,soundDetails,advanced);backdrop.append(panel);backdrop.onclick=event=>{if(event.target===backdrop)closeOverlay();};els.overlayLayer.append(backdrop);placePopover(panel,rect,{width:430,height:340,prefer:'below'});
    const refreshSoundOptions=()=>{const current=sound.value;sound.replaceChildren();KEYS.filter(value=>CE.sameMode(value,song.key)).forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=longKeyLabel(value);sound.append(option);});sound.value=KEYS.includes(current)&&CE.sameMode(current,song.key)?current:song.key;};
    const sync=()=>{refreshSoundOptions();sound.value=song.key;soundSummaryKey.textContent=longKeyLabel(song.key);shape.value=profile.shapeKey;capo.value=String(profile.capo||0);const automatic=tuningIsAutomatic(profile.tuning);Object.entries(keepButtons).forEach(([value,button])=>{button.classList.toggle('active',profile.keepMode===value);button.disabled=!automatic;});note.textContent=automatic?(profile.keepMode==='sounding'?'Shapes and capo adjust without changing the sounding song.':'Changing shapes or capo transposes every chord in the song.'):`${profile.tuning}: entered chord names stay manual.`;};
    const transposeTo=target=>{if(!target||target===song.key)return;perform('Transposed song',()=>transposeSongHarmony(song,target,song.spelling||'auto'),`Song transposed to ${compactKey(target)}.`,sync);};
    sound.onchange=()=>transposeTo(sound.value);down.onclick=()=>transposeTo(keyBySemitone(song.key,-1,song.spelling));up.onclick=()=>transposeTo(keyBySemitone(song.key,1,song.spelling));
    const changeProfile=changed=>changePlayingProfile(song,profile,{shapeKey:shape.value,capo:Number(capo.value),tuning:profile.tuning},changed,sync);shape.onchange=()=>changeProfile('shape');capo.onchange=()=>changeProfile('capo');sync();
  }

  function openKeyCapoPanel(song){openTransientPanel({type:'keycapo',label:'Playing profile'});}
  function renderKeyCapoPanel(song){
    const profile=activeProfile(song);const form=document.createElement('div');form.className='side-tool-form';
    const current=document.createElement('div');current.className='tool-summary';current.innerHTML=`<span>Sounds in</span><strong>${escapeHtml(longKeyLabel(song.key))}</strong>`;
    const keep=document.createElement('div');keep.className='keep-choice';const keepLabel=document.createElement('span');keepLabel.textContent='Keep';keep.append(keepLabel);[['sounding','Sounding key'],['shapes','Playing shapes']].forEach(([value,label])=>{const button=document.createElement('button');button.className=profile.keepMode===value?'active':'';button.textContent=label;button.onclick=()=>{profile.keepMode=value;touch(song);renderWorkbench();};keep.append(button);});
    const shapeField=document.createElement('label');shapeField.className='side-field';shapeField.innerHTML='<span>Play shapes</span>';const shape=document.createElement('select');KEYS.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=CE.formatKey(value);shape.append(option);});shape.value=profile.shapeKey;shapeField.append(shape);
    const capoField=document.createElement('label');capoField.className='side-field';capoField.innerHTML='<span>Capo</span>';const capo=document.createElement('select');for(let value=0;value<=11;value++){const option=document.createElement('option');option.value=String(value);option.textContent=value===0?'No capo':String(value);capo.append(option);}capo.value=String(profile.capo||0);capoField.append(capo);
    const tuningField=document.createElement('label');tuningField.className='side-field';tuningField.innerHTML='<span>Tuning</span>';const tuning=document.createElement('select');allTuningOptions().forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;tuning.append(option);});const custom=document.createElement('option');custom.value='__custom__';custom.textContent='Custom tuning…';tuning.append(custom);tuning.value=profile.tuning||song.tuning;tuningField.append(tuning);
    const note=document.createElement('div');note.className='workbench-empty';note.textContent=tuningIsAutomatic(profile.tuning)?'Changes stay linked. Sounding harmony remains fixed by default.':'Chord shapes are entered manually for this tuning.';
    const tools=document.createElement('details');tools.className='player-tools';const summary=document.createElement('summary');summary.textContent='Player tools';tools.append(summary);const harp=CE.harmonicaMatches(song.key,song.spelling);const harpBlock=document.createElement('div');harpBlock.className='harp-match';harpBlock.innerHTML=`<strong>Harmonica match</strong><span>${escapeHtml(harp.straight.key)} · straight</span><span>${escapeHtml(harp.cross.key)} · cross</span><span>${escapeHtml(harp.third.key)} · third position</span>`;tools.append(harpBlock);[['showSounding','Show sounding chords underneath'],['showNashville','Show Nashville numbers'],['showHarmonica','Show harmonica match in Chart']].forEach(([property,label])=>{const row=document.createElement('label');row.className='check-row';const box=document.createElement('input');box.type='checkbox';box.checked=Boolean(profile[property]);box.onchange=()=>{snapshot('Changed player display');profile[property]=box.checked;touch(song);render();};row.append(box,document.createTextNode(label));tools.append(row);});
    const updateFromControls=(changed)=>{const nextTuning=tuning.value;if(nextTuning==='__custom__'){openCustomTuning(song,profile);return;}changePlayingProfile(song,profile,{shapeKey:shape.value,capo:Number(capo.value),tuning:nextTuning},changed);};
    shape.onchange=()=>updateFromControls('shape');capo.onchange=()=>updateFromControls('capo');tuning.onchange=()=>updateFromControls('tuning');
    const transpose=document.createElement('button');transpose.className='ghost-button full-width';transpose.textContent='Transpose sounding harmony…';transpose.onclick=()=>openTransposePanel(song,'song');
    form.append(current,keep,shapeField,capoField,tuningField,note,tools,transpose);els.workbenchBody.append(form);
  }

  function openCustomTuning(song,profile){openFormModal('Custom tuning',[{name:'name',label:'Name',type:'text',required:true,placeholder:'DAEAC#E'},{name:'strings',label:'Strings, low to high',type:'text',required:true,placeholder:'D A E A C# E'},{name:'note',label:'Note',type:'text',placeholder:'Optional playing note'}],values=>{const strings=values.strings.trim().split(/[\s,]+/).filter(Boolean).slice(0,6);if(strings.length!==6){toast('Enter six string pitches, low to high');return false;}const tuning={id:uid('tuning'),name:values.name.trim(),strings,note:values.note.trim()};state.customTunings.push(tuning);profile.tuning=tuning.name;song.tuning=tuning.name;touch(song);render();toast('Custom tuning saved');});}

  function openChartProfiles(song){const body=document.createElement('div');body.className='choice-list';song.chartProfiles.forEach(profile=>{const button=document.createElement('button');button.className='choice-button';button.innerHTML=`<strong>${escapeHtml(profile.name)}</strong><br><span class="workbench-subtitle">${escapeHtml(profile.shapeKey)} shapes · capo ${profile.capo} · ${escapeHtml(profile.tuning)}</span>`;button.onclick=()=>{song.activeProfileId=profile.id;touch(song);closeOverlay();render();};body.append(button);});const add=document.createElement('button');add.className='primary-button full-width';add.textContent='Add chart profile';add.onclick=()=>{closeOverlay();openProfileForm(song);};body.append(add);openModal('Key, capo and tuning',body);}
  function openProfileForm(song){const options=CE.capoOptions(song.key,song.spelling);openFormModal('New chart profile',[{name:'name',label:'Name',type:'text',placeholder:'G shapes, capo 4'},{name:'shape',label:'Play shapes',type:'select',value:options[0]?.shapeKey||song.key,options:options.map(item=>({value:item.shapeKey,label:`${item.shapeKey} — capo ${item.capo}`}))},{name:'tuning',label:'Tuning',type:'select',value:'Standard',options:allTuningOptions().map(value=>({value,label:value}))}],values=>{const capo=CE.capoForKeysWithTuning(song.key,values.shape,values.tuning);perform('Created chart profile',()=>{const profile={id:uid('profile'),name:values.name.trim()||`${values.shape} shapes · capo ${capo}`,shapeKey:values.shape,capo,tuning:values.tuning,keepMode:'sounding'};song.chartProfiles.push(profile);song.activeProfileId=profile.id;},'Chart profile created');});}

  function openVersions(song){const body=document.createElement('div');body.className='choice-list';const save=document.createElement('button');save.className='primary-button full-width';save.textContent='Save named version';save.onclick=()=>{closeOverlay();openFormModal('Save version',[{name:'name',label:'Version name',type:'text',placeholder:'First full draft',required:true}],values=>{perform('Saved version',()=>song.versions.unshift({id:uid('version'),name:values.name.trim(),createdAt:now(),snapshot:snapshotSong(song)}),'Version saved');});};body.append(save);song.versions.forEach(version=>{const button=document.createElement('button');button.className='choice-button';button.innerHTML=`<strong>${escapeHtml(version.name)}</strong><br><span class="workbench-subtitle">${new Date(version.createdAt).toLocaleString()}</span>`;button.onclick=()=>{closeOverlay();perform('Restored version',()=>restoreSnapshot(song,version.snapshot),'Version restored');};body.append(button);});openModal('Versions',body);}
  function snapshotSong(song){const copy=clone(song);delete copy.versions;return copy;}
  function restoreSnapshot(song,snapshotValue){const restored=normaliseSong(clone(snapshotValue));const versions=song.versions;Object.keys(song).forEach(key=>delete song[key]);Object.assign(song,restored,{versions});}
  function openWriters(song){const body=document.createElement('div');body.className='choice-list';song.writers.forEach(writer=>{const row=document.createElement('button');row.className='choice-button';row.innerHTML=`<strong>${escapeHtml(writer.name||'Unnamed writer')}</strong><br><span class="workbench-subtitle">${escapeHtml(writer.role||'Music & lyrics')} · ${escapeHtml(writer.pro||'')} ${escapeHtml(writer.ipi||'')}</span>`;body.append(row);});const add=document.createElement('button');add.className='primary-button full-width';add.textContent='Add writer';add.onclick=()=>{closeOverlay();openFormModal('Add writer',[{name:'name',label:'Name',type:'text',required:true},{name:'ipi',label:'IPI / CAE',type:'text'},{name:'pro',label:'Society / PRO',type:'text',placeholder:'APRA AMCOS'},{name:'role',label:'Role',type:'text',value:'Music & lyrics'}],values=>perform('Added writer',()=>song.writers.push({id:uid('writer'),...values}),'Writer added'));};body.append(add);openModal('Writers & IPI',body);}

  function openSongMenu(anchor){
    const song=currentSong();if(!song)return;
    if(inSandboxMode()){openMenu(anchor,[['Return to demo song',returnToDemoSong],['Reset this sandbox song',()=>{if(confirm(`Reset “${song.title}” to its seed data?`))resetCurrentSandboxSong();}],['Reset sandbox library',()=>{if(confirm('Reset all eight sandbox songs?'))resetSandboxLibrary();}],['Save a copy',saveCurrentSandboxCopy],['Exit demo',()=>exitDemo(true)],['Transpose song…',()=>openTransposePanel(song,'song')],['Set song key without moving chords…',()=>openInterpretPanel(song,'song')],['Writers & IPI',()=>openWriters(song)],['Versions',()=>openVersions(song)],['Export sandbox song JSON',()=>downloadText(`${safeName(song.title)}-sandbox.json`,JSON.stringify({type:'cowriter-song-0.4.0.12',song},null,2))]]);return;}
    if(inDemoMode()){openMenu(anchor,[[demoSession.guideOpen?'Pause guide':'Resume guide',()=>{demoSession.guideOpen=!demoSession.guideOpen;if(demoSession.guideOpen){demoSession.guideStep=clamp(demoSession.guideStep||0,0,DEMO_STEPS.length-1);state.view=DEMO_STEPS[demoSession.guideStep].view;}scheduleSave();render();}],['Restart four-step guide',()=>{resetDemo();demoSession.guideOpen=true;state.view='plan';scheduleSave();render();}],['Jump to demo stage…',()=>openChoiceModal('Jump to demo stage',[['Idea',()=>setDemoStage('idea')],['Draft',()=>setDemoStage('draft')],['Chart-ready',()=>setDemoStage('chart-ready')]])],['Open Sandbox Library',enterSandbox],['Reset demo song',()=>{if(confirm('Reset every change made in this demo?'))resetDemo();}],['Save a copy',saveDemoCopy],['Exit demo',leaveDemoForWelcome],['Transpose song…',()=>openTransposePanel(song,'song')],['Set song key without moving chords…',()=>openInterpretPanel(song,'song')],['Writers & IPI',()=>openWriters(song)],['Versions',()=>openVersions(song)]]);return;}
    openMenu(anchor,[['Start review capture',startReviewCapture],['Export complete song…',()=>exportSongBundle(song)],['Studio Log',()=>openStudioLog(song)],['Record Work Tape',()=>startWorkTape(song)],['Change progress…',()=>openStagePicker(song,anchor)],['Add to project…',()=>openProjectMembership(song)],['Transpose song…',()=>openTransposePanel(song,'song')],['Set song key without moving chords…',()=>openInterpretPanel(song,'song')],['Key, capo and tuning…',()=>openKeyCapoPanel(song)],['Writers & IPI',()=>openWriters(song)],['Versions',()=>openVersions(song)],[song.favourite?'Remove favourite':'Favourite',()=>{song.favourite=!song.favourite;touch(song);render();}],['Duplicate song',()=>duplicateSong(song)],['Export song metadata JSON',()=>downloadText(`${safeName(song.title)}.json`,JSON.stringify({type:'cowriter-song-0.4.0.12',song},null,2))],['Archive',()=>{song.libraryStatus='archived';touch(song);render();}],['Move to Trash',()=>{snapshot('Move song to Trash');state.deletedSongs.unshift(song);state.songs=state.songs.filter(item=>item.id!==song.id);state.selectedSongId=state.songs[0]?.id||null;scheduleSave();render();toast('Song moved to Trash',undo);},'danger']]);
  }


  function openProjectMembership(song){const body=document.createElement('div');body.className='project-membership';if(!state.projects.length){const empty=document.createElement('div');empty.className='workbench-empty';empty.textContent='Create a project first.';body.append(empty);}state.projects.forEach(project=>{const row=document.createElement('label');row.className='check-row';const box=document.createElement('input');box.type='checkbox';box.checked=song.projectIds.includes(project.id);box.onchange=()=>{if(box.checked)song.projectIds=[...new Set([...song.projectIds,project.id])];else song.projectIds=song.projectIds.filter(id=>id!==project.id);touch(song);renderLibrary();};row.append(box,document.createTextNode(project.name));body.append(row);});const add=document.createElement('button');add.className='ghost-button full-width';add.textContent='New project';add.onclick=()=>{closeOverlay();createProject();};body.append(add);openModal('Projects',body);}

  function setSongStage(song,stage){song.stage=stage;if(stage==='finished')song.libraryStatus='finished';else if(song.libraryStatus==='finished')song.libraryStatus='active';touch(song);render();}

  function duplicateSong(song){const copy=normaliseSong(clone(song));copy.id=uid('song');copy.title=`${song.title} copy`;copy.createdAt=copy.updatedAt=now();copy.versions=[];copy.takes=[];copy.timeline=copy.timeline.filter(entry=>entry.type!=='take');state.songs.unshift(copy);state.selectedSongId=copy.id;state.view=copy.lastView;scheduleSave();render();toast('Song duplicated without its audio recordings');}

  function openChoicePopover(anchor,title,choices){closeOverlay();const rect=anchor.getBoundingClientRect();const backdrop=document.createElement('div');backdrop.className='overlay-backdrop clear';const menu=document.createElement('div');menu.className='menu-popover choice-popover';if(title){const heading=document.createElement('div');heading.className='menu-heading';heading.textContent=title;menu.append(heading);}choices.forEach(([label,action])=>{const button=document.createElement('button');button.textContent=label;button.onclick=()=>{closeOverlay();action();};menu.append(button);});placePopover(menu,rect,{width:225,height:Math.min(360,46+choices.length*38),prefer:'below'});backdrop.append(menu);backdrop.onclick=event=>{if(event.target===backdrop)closeOverlay();};els.overlayLayer.append(backdrop);}

  function openMenu(anchor,items){closeOverlay();const rect=anchor.getBoundingClientRect();const backdrop=document.createElement('div');backdrop.className='overlay-backdrop clear';const menu=document.createElement('div');menu.className='menu-popover';menu.style.visibility='hidden';items.forEach(([label,action,kind])=>{const button=document.createElement('button');button.textContent=label;if(kind==='danger')button.className='danger';button.onclick=()=>{closeOverlay();action();};menu.append(button);});backdrop.append(menu);backdrop.onclick=event=>{if(event.target===backdrop)closeOverlay();};els.overlayLayer.append(backdrop);const viewport=window.visualViewport;const viewLeft=viewport?.offsetLeft||0,viewTop=viewport?.offsetTop||0,viewWidth=viewport?.width||window.innerWidth,viewHeight=viewport?.height||window.innerHeight,margin=10;const width=Math.min(225,viewWidth-margin*2),availableHeight=Math.max(1,viewHeight-margin*2);menu.style.width=`${width}px`;menu.style.maxHeight=`${availableHeight}px`;const height=Math.min(menu.scrollHeight,availableHeight);const left=clamp(rect.right-width,viewLeft+margin,Math.max(viewLeft+margin,viewLeft+viewWidth-width-margin));const below=viewTop+viewHeight-rect.bottom-margin,above=rect.top-viewTop-margin;const preferredTop=below>=height?rect.bottom+6:above>=height?rect.top-height-6:viewTop+margin;const top=clamp(preferredTop,viewTop+margin,Math.max(viewTop+margin,viewTop+viewHeight-height-margin));menu.style.left=`${left}px`;menu.style.top=`${top}px`;menu.style.visibility='visible';}
  function openModal(title,body,footer=[]){closeOverlay();const backdrop=document.createElement('div');backdrop.className='overlay-backdrop';const modal=document.createElement('section');modal.className='modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');const head=document.createElement('header');head.className='modal-head';const heading=document.createElement('h3');heading.textContent=title;heading.id=uid('dialog-title');modal.setAttribute('aria-labelledby',heading.id);const close=document.createElement('button');close.className='icon-button';close.textContent='×';close.setAttribute('aria-label',`Close ${title}`);close.onclick=closeOverlay;head.append(heading,close);const content=document.createElement('div');content.className='modal-body';content.append(body);modal.append(head,content);if(footer.length){const foot=document.createElement('footer');foot.className='modal-foot';footer.forEach(item=>foot.append(item));modal.append(foot);}backdrop.append(modal);backdrop.onclick=event=>{if(event.target===backdrop)closeOverlay();};els.overlayLayer.append(backdrop);return{modal,content,backdrop};}
  function openAbout(){const body=document.createElement('div');body.className='about-card';body.innerHTML='<strong>Co-Writer</strong><span>Private Alpha · 0.4.0.12</span><p>A songwriter’s notebook for capturing ideas, planning, writing, shaping and sharing songs.</p><small>Your Songs, Ideas and recordings are saved on this device.</small>';openModal('About',body);}
  function startReviewCapture(){if(!reviewCaptureController?.start){toast('Review capture is unavailable');return;}reviewCaptureController.start();toast('Review capture started');}
  function openStartHere(){const body=document.createElement('div');body.className='start-here';body.innerHTML='<p class="start-here-intro">Capture an Idea when it arrives. Start a Song only when you are ready to develop it.</p><div class="start-here-path"><article><span>01</span><div><strong>Ideas</strong><p>Save a line, title, melody, chord, or thought immediately.</p></div></article><article><span>02</span><div><strong>Plan</strong><p>Think freely inside a song and keep the rough edges.</p></div></article><article><span>03</span><div><strong>Write</strong><p>Edit the current lyric and keep chords attached.</p></div></article><article><span>04</span><div><strong>Shape</strong><p>Open the overview when sections and loose lines need arranging.</p></div></article><article><span>05</span><div><strong>Chart</strong><p>Make a clean copy to play or share.</p></div></article></div>';const tour=document.createElement('button');tour.className='ghost-button';tour.textContent='Walk through a song';tour.onclick=()=>{closeOverlay();enterDemo(true);};const capture=document.createElement('button');capture.className='ghost-button';capture.textContent='Capture an idea';capture.onclick=()=>{closeOverlay();openIdeaComposer();};const begin=document.createElement('button');begin.className='primary-button';begin.textContent='Start a blank song';begin.onclick=()=>{closeOverlay();createNewSong();};openModal('Start here',body,[tour,capture,begin]);}
  function closeOverlay(){studioLogUrls.forEach(url=>URL.revokeObjectURL(url));studioLogUrls=[];els.overlayLayer.replaceChildren();}
  function openShortcutsPanel(){const view=state.shellPage==='workspace'?state.view:'songs';const common=view==='songs'?[['⌘ N','New song'],['⌥ I','Ideas'],['?','This panel']]:[['⌥ I / 1–4','Ideas / song views'],['⌘ \\','Words & Music'],['⌘ Z / ⇧⌘ Z','Undo / Redo'],['⌘ F','Search this song'],['?','This panel']];const contextual=view==='write'?[['⌘ K','Add chord'],['⌘ C','Copy selected chords'],['⌘ X','Cut selected chords'],['⌘ V','Paste chords'],['Delete','Remove selected chord']]:view==='shape'?[['− / =','Zoom out / in'],['0 / ⇧ 0','Fit board / 100%'],['F / C','Fit / centre selection'],['V / H','Select / hand tool'],['Space + drag','Temporary hand']]:view==='plan'?[['⌘ N','New song'],['Select text','Send selection to Write']]:[];const body=document.createElement('div');body.className='shortcuts-list';[...contextual,...common].slice(0,10).forEach(([keys,label])=>{const row=document.createElement('div');const key=document.createElement('kbd');key.textContent=keys;const copy=document.createElement('span');copy.textContent=label;row.append(key,copy);body.append(row);});openModal(`${view[0].toUpperCase()+view.slice(1)} shortcuts`,body);}
  function openChoiceModal(title,choices,description=''){const body=document.createElement('div');if(description){const copy=document.createElement('div');copy.className='workbench-empty';copy.textContent=description;copy.style.marginBottom='10px';body.append(copy);}const list=document.createElement('div');list.className='choice-list';choices.forEach(([label,action])=>{const button=document.createElement('button');button.className='choice-button';button.textContent=label;button.onclick=()=>{closeOverlay();action();};list.append(button);});body.append(list);openModal(title,body);}
  function openFormModal(title,fields,onSubmit){const form=document.createElement('form');form.id=uid('form');const inputs={};fields.forEach(field=>{const wrap=document.createElement('div');wrap.className='field';const label=document.createElement('label');label.textContent=field.label;let input;if(field.type==='textarea')input=document.createElement('textarea');else if(field.type==='select'){input=document.createElement('select');(field.options||[]).forEach(option=>{const element=document.createElement('option');element.value=option.value;element.textContent=option.label;input.append(element);});}else{input=document.createElement('input');input.type=field.type||'text';}input.name=field.name;input.placeholder=field.placeholder||'';input.required=Boolean(field.required);if(field.value!==undefined)input.value=field.value;wrap.append(label,input);form.append(wrap);inputs[field.name]=input;});const cancel=document.createElement('button');cancel.type='button';cancel.className='ghost-button';cancel.textContent='Cancel';cancel.onclick=closeOverlay;const submit=document.createElement('button');submit.type='button';submit.className='primary-button';submit.textContent='Done';submit.onclick=event=>{event.preventDefault();form.requestSubmit();};form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;const values=Object.fromEntries(Object.entries(inputs).map(([name,input])=>[name,input.value]));const result=onSubmit(values);if(result!==false)closeOverlay();};openModal(title,form,[cancel,submit]);requestAnimationFrame(()=>Object.values(inputs)[0]?.focus());}

  function renderDemoGuide(){
    if(!els.demoGuide)return;
    const open=Boolean(inGuidedDemoMode()&&demoSession.guideOpen);
    els.demoGuide.classList.toggle('visible',open);
    clearDemoHighlight();
    if(!open){els.demoGuideBody.replaceChildren();return;}
    const index=clamp(Number(demoSession.guideStep)||0,0,DEMO_STEPS.length-1);demoSession.guideStep=index;
    const step=DEMO_STEPS[index];els.demoGuide.querySelector('.demo-guide-kicker').textContent=demoSession.unattended?'UNATTENDED TOUR':'DEMO GUIDE';els.demoGuideProgress.textContent=`${index+1} of ${DEMO_STEPS.length} · ${step.mode}`;
    els.demoGuideBody.replaceChildren();
    const purpose=document.createElement('div');purpose.className='demo-guide-purpose demo-guide-safety';purpose.innerHTML='<strong>Safe demonstration</strong><span>This song is not in your Songs. Change anything.</span>';
    const mode=document.createElement('div');mode.className='demo-guide-mode';mode.textContent=step.mode;
    const title=document.createElement('h3');title.textContent=step.title;
    const copy=document.createElement('p');copy.textContent=step.copy;
    const task=document.createElement('div');task.className='demo-guide-task';task.innerHTML='<span>TRY THIS</span>';const taskCopy=document.createElement('p');taskCopy.textContent=step.task;task.append(taskCopy);
    els.demoGuideBody.append(purpose,mode,title,copy,task);
    if(state.view!==step.view){const openView=document.createElement('button');openView.className='primary-button full-width';openView.textContent=`Open ${step.view[0].toUpperCase()+step.view.slice(1)}`;openView.onclick=()=>{state.view=step.view;demoSession.song.lastView=step.view;scheduleSave();render();};els.demoGuideBody.append(openView);}
    else requestAnimationFrame(()=>highlightDemoTarget(step.target));
    els.demoGuideBack.disabled=index===0;els.demoGuideNext.textContent=index===DEMO_STEPS.length-1?'Finish':'Next';
  }
  function highlightDemoTarget(selector){clearDemoHighlight();if(!selector)return;const target=document.querySelector(selector);if(!target)return;target.classList.add('demo-highlight');target.scrollIntoView?.({block:'nearest',inline:'nearest'});}
  function clearDemoHighlight(){document.querySelectorAll('.demo-highlight').forEach(element=>element.classList.remove('demo-highlight'));}
  function pauseDemoGuide(){if(!inGuidedDemoMode())return;stopUnattendedDemo();demoSession.unattended=false;demoSession.guideOpen=false;scheduleSave();render();toast('Guide paused · reopen it from the song menu');}
  function leaveDemoForWelcome(){if(!inDemoMode())return;exitDemo(false);state.shellPage='welcome';state.sidebarCollapsed=true;scheduleSave();render();}
  function finishDemoGuide(){if(!inGuidedDemoMode())return;stopUnattendedDemo();demoSession.unattended=false;demoSession.guideOpen=false;state.onboardingComplete=true;scheduleSave();render();const body=document.createElement('div');body.className='demo-complete';body.innerHTML='<span>YOU HAVE SEEN THE WHOLE NOTEBOOK</span><h3>Now begin with your own song.</h3><p>The demonstration never entered your Songs. Your real songs and recordings are unchanged.</p>';const home=document.createElement('button');home.className='text-button';home.textContent='Back to Home';home.onclick=()=>{closeOverlay();leaveDemoForWelcome();};const explore=document.createElement('button');explore.className='ghost-button';explore.textContent='Keep exploring';explore.onclick=closeOverlay;const begin=document.createElement('button');begin.className='primary-button';begin.textContent='Start your own song';begin.onclick=()=>{closeOverlay();createNewSong();};openModal('Guide complete',body,[home,explore,begin]);}
  function changeDemoGuideStep(direction){if(!inGuidedDemoMode())return;if(direction>0&&demoSession.guideStep===DEMO_STEPS.length-1){finishDemoGuide();return;}const next=clamp((demoSession.guideStep||0)+direction,0,DEMO_STEPS.length-1);demoSession.guideStep=next;state.view=DEMO_STEPS[next].view;demoSession.song.lastView=state.view;state.workbenchOpen=false;resetActiveSelection();scheduleSave();render();}

  function createNewSong(){if(inDemoMode())exitDemo(false);state.onboardingComplete=true;const song=createSong();state.songs.unshift(song);state.selectedSongId=song.id;state.view='plan';state.shellPage='workspace';state.sidebarCollapsed=true;state.workbenchOpen=false;state.alternativesTrayOpen=false;resetActiveSelection();scheduleSave();render();requestAnimationFrame(()=>document.querySelector('.brain-dump')?.focus());}
  function ensureDemoSessionBase(){
    if(!inDemoMode())demoSession={active:true,mode:'demo',stage:'draft',song:demoSong('draft'),sandboxSongs:null,selectedSandboxSongId:null,guideOpen:false,guideStep:0,previous:{selectedSongId:state.selectedSongId,view:state.view,workbenchOpen:state.workbenchOpen,workbenchTab:state.workbenchTab}};
    demoSession.mode ||= 'demo';return demoSession;
  }
  function enterDemo(startGuide=false){
    ensureDemoSessionBase();demoSession.mode='demo';demoSession.song ||= demoSong('draft');demoSession.guideOpen=Boolean(startGuide);demoSession.unattended=false;if(startGuide)demoSession.guideStep=0;
    state.view=startGuide?'plan':demoSession.song.lastView||'write';state.shellPage='workspace';state.sidebarCollapsed=true;state.workbenchOpen=false;resetActiveSelection();undoStack=[];redoStack=[];scheduleSave();render();
    if(!startGuide)toast('Demo opened');
  }
  function stopUnattendedDemo(){if(demoTourTimer){clearInterval(demoTourTimer);demoTourTimer=null;}}
  function startUnattendedDemo(){stopUnattendedDemo();ensureDemoSessionBase();demoSession.mode='demo';demoSession.stage='draft';demoSession.song=demoSong('draft');demoSession.guideOpen=true;demoSession.guideStep=0;demoSession.unattended=true;state.view='plan';state.shellPage='workspace';state.sidebarCollapsed=true;state.workbenchOpen=false;resetActiveSelection();undoStack=[];redoStack=[];scheduleSave();render();demoTourTimer=setInterval(()=>{if(!inGuidedDemoMode()){stopUnattendedDemo();return;}const next=Number(demoSession.guideStep||0)+1;if(next>=DEMO_STEPS.length){finishDemoGuide();return;}demoSession.guideStep=next;state.view=DEMO_STEPS[next].view;demoSession.song.lastView=state.view;state.workbenchOpen=false;resetActiveSelection();scheduleSave();render();},18000);toast('Tour playing · touch anything to take over');}
  function enterSandbox(){
    ensureDemoSessionBase();demoSession.mode='sandbox';demoSession.guideOpen=false;
    if(!Array.isArray(demoSession.sandboxSongs)||!demoSession.sandboxSongs.length)demoSession.sandboxSongs=(SD?.createLibrary?.()||[]).map(song=>resolveSandboxLinks(normaliseSong(song)));
    if(!demoSession.sandboxSongs.length){toast('The Sandbox Library could not be loaded.');return;}
    if(!demoSession.sandboxSongs.some(song=>song.id===demoSession.selectedSandboxSongId))demoSession.selectedSandboxSongId=demoSession.sandboxSongs[0].id;
    const song=currentSong();state.filter='active';state.view=song?.lastView||'write';state.shellPage='workspace';state.sidebarCollapsed=true;state.workbenchOpen=false;resetActiveSelection();undoStack=[];redoStack=[];scheduleSave();render();toast('Sandbox Library opened');
  }
  function returnToDemoSong(){ensureDemoSessionBase();demoSession.mode='demo';demoSession.song ||= demoSong('draft');demoSession.guideOpen=false;state.view=demoSession.song.lastView||'write';state.shellPage='workspace';state.sidebarCollapsed=true;state.workbenchOpen=false;resetActiveSelection();undoStack=[];redoStack=[];scheduleSave();render();toast('Returned to the demo song');}
  function loadDemo(){
    openChoiceModal('Explore Co-Writer',[['Explore Demo Song',()=>enterDemo(false)],['Start four-step guide',()=>enterDemo(true)],['Play unattended tour',startUnattendedDemo],['Open Sandbox Library',enterSandbox]],'Demo and Sandbox songs are isolated from your real Library. Change anything safely.');
  }
  function resetDemo(){if(!inGuidedDemoMode())return;const guideOpen=demoSession.guideOpen;demoSession.stage='draft';demoSession.song=demoSong('draft');demoSession.guideStep=0;demoSession.guideOpen=guideOpen;state.view=guideOpen?'plan':'write';state.workbenchOpen=false;resetActiveSelection();undoStack=[];redoStack=[];scheduleSave();render();toast('Demo reset');}
  function setDemoStage(stage){if(!inGuidedDemoMode())return;demoSession.stage=stage;demoSession.song=demoSong(stage);demoSession.guideStep=0;state.view=stage==='idea'?'plan':stage==='chart-ready'?'chart':'write';state.workbenchOpen=false;resetActiveSelection();undoStack=[];redoStack=[];scheduleSave();render();toast(`Demo stage: ${stage==='chart-ready'?'Chart-ready':stage[0].toUpperCase()+stage.slice(1)}`);}
  function resetCurrentSandboxSong(){if(!inSandboxMode())return;const current=currentSong();const index=demoSession.sandboxSongs.findIndex(song=>song.id===current.id);const replacement=resolveSandboxLinks(normaliseSong(SD.createSongByKey(current.sandboxKey)));replacement.sandboxOrder=current.sandboxOrder;if(index>=0)demoSession.sandboxSongs[index]=replacement;demoSession.selectedSandboxSongId=replacement.id;state.view=replacement.lastView||'write';state.workbenchOpen=false;resetActiveSelection();undoStack=[];redoStack=[];scheduleSave();render();toast('Sandbox song reset');}
  function resetSandboxLibrary(){if(!inSandboxMode())return;demoSession.sandboxSongs=SD.createLibrary().map(song=>resolveSandboxLinks(normaliseSong(song)));demoSession.selectedSandboxSongId=demoSession.sandboxSongs[0].id;state.view=demoSession.sandboxSongs[0].lastView||'write';state.workbenchOpen=false;resetActiveSelection();undoStack=[];redoStack=[];scheduleSave();render();toast('Entire Sandbox Library reset');}
  function stripDemoMetadata(value){if(Array.isArray(value)){value.forEach(stripDemoMetadata);return value;}if(!value||typeof value!=='object')return value;delete value.isDemo;delete value.demoStage;delete value.demoKey;delete value.isSandbox;delete value.sandboxKey;delete value.sandboxOrder;delete value.sourcePlanRef;delete value.shapeGroup;delete value.pendingChordIndex;Object.values(value).forEach(stripDemoMetadata);return value;}
  function cleanDemoCopy(song){const copy=normaliseSong(clone(song));stripDemoMetadata(copy);copy.id=uid('song');copy.title=`${song.title} — Copy`;copy.createdAt=copy.updatedAt=now();return copy;}
  function saveDemoCopy(){if(!inGuidedDemoMode())return;const copy=cleanDemoCopy(demoSession.song);state.songs.unshift(copy);state.selectedSongId=copy.id;demoSession=null;sessionStorage.removeItem(DEMO_SESSION_KEY);state.view=copy.lastView||'write';state.workbenchOpen=false;resetActiveSelection();scheduleSave();render();toast('Copy added to Songs');}
  function saveCurrentSandboxCopy(){if(!inSandboxMode())return;const copy=cleanDemoCopy(currentSong());state.songs.unshift(copy);scheduleSave();toast(`Saved “${copy.title}” to your Songs`);}
  function exitDemo(showToast=true){if(!inDemoMode())return;stopUnattendedDemo();const previous=demoSession.previous||{};demoSession=null;sessionStorage.removeItem(DEMO_SESSION_KEY);state.selectedSongId=previous.selectedSongId||state.selectedSongId;const previousSong=state.songs.find(song=>song.id===state.selectedSongId);state.view=previous.view||previousSong?.lastView||'plan';state.shellPage='library';state.workbenchOpen=Boolean(previous.workbenchOpen);state.workbenchTab=previous.workbenchTab||state.workbenchTab;resetActiveSelection();undoStack=[];redoStack=[];scheduleSave();render();if(showToast)toast('Returned to Songs');}

  function songSearchItems(song,query){
    const needle=String(query||'').trim().toLowerCase();if(!needle)return[];const results=[];
    const add=(location,text,view,sectionId=null,lineId=null)=>{if(String(text||'').toLowerCase().includes(needle))results.push({location,text:String(text||''),view,sectionId,lineId});};
    add('Plan',song.plan.brainDump,'plan');
    song.shapeBlocks.forEach(block=>add('Shape',block.text,'shape'));
    song.sections.forEach(section=>section.lines.forEach(line=>add(section.label,line.text,'write',section.id,line.id)));
    song.alternatives.forEach(alt=>add('Alternative',alt.content?.line?.text||alt.content?.text||alt.label,'write'));
    return results.slice(0,50);
  }
  function openSongSearch(song){
    closeOverlay();const body=document.createElement('div');const input=document.createElement('input');input.type='search';input.className='song-search-input';input.placeholder='Search this song';input.setAttribute('aria-label','Search this song');const results=document.createElement('div');results.className='choice-list song-search-results';
    const draw=()=>{results.replaceChildren();const items=songSearchItems(song,input.value);if(!input.value.trim()){const empty=document.createElement('div');empty.className='workbench-empty';empty.textContent='Search Plan, Write, Shape and alternatives.';results.append(empty);return;}if(!items.length){const empty=document.createElement('div');empty.className='workbench-empty';empty.textContent='No matches in this song.';results.append(empty);return;}items.forEach(item=>{const button=document.createElement('button');button.className='choice-button';button.innerHTML=`<strong>${escapeHtml(item.location)}</strong><br><span class="workbench-subtitle">${escapeHtml(item.text.slice(0,140))}</span>`;button.onclick=()=>{if(item.sectionId)activeSectionId=item.sectionId;if(item.lineId)activeLineId=item.lineId;setView(item.view);requestAnimationFrame(()=>item.lineId?document.querySelector(`[data-line-id="${CSS.escape(item.lineId)}"]`)?.scrollIntoView({block:'center'}):null);};results.append(button);});};
    input.oninput=draw;body.append(input,results);openModal('Search this song',body);draw();requestAnimationFrame(()=>input.focus());
  }

  function audioExtension(take){return take?.mimeType?.includes('wav')?'wav':take?.mimeType?.includes('mp4')?'m4a':take?.mimeType?.includes('ogg')?'ogg':'webm';}
  function ensureFieldContributor(action){if(state.fieldProfile.name.trim()){action();return;}openFormModal('Who is carrying the notebook?',[{name:'name',label:'Your name',type:'text',placeholder:'Writer name',required:true}],values=>{state.fieldProfile.name=values.name.trim();scheduleSave();setTimeout(action);});}
  async function exportSongBundle(song){
    if(!FE){toast('Field Exchange could not start');return;}
    if(!state.fieldProfile.name.trim()){ensureFieldContributor(()=>exportSongBundle(song));return;}
    const exchangeId=uid('exchange'),createdAt=now(),contributor=state.fieldProfile.name.trim();
    song.exchangeHistory.push({id:exchangeId,type:'sent',at:createdAt,by:contributor,device:navigator.userAgent.slice(0,120)});song.timeline.unshift({id:uid('log'),type:'exchange',text:`Complete song bundle prepared by ${contributor}.`,createdAt,view:state.view});touch(song);
    const files={},audio=[],missing=[];
    for(const take of song.takes){const blob=await audioGet(take.id);if(!blob){missing.push(take.name);continue;}const suffix=String(take.id).split('_').at(-1).slice(-6);const path=`audio/${safeName(take.name||'Work Tape')}-${suffix}.${audioExtension(take)}`;files[path]=new Uint8Array(await blob.arrayBuffer());audio.push({takeId:take.id,name:take.name,path,mimeType:take.mimeType,size:blob.size});}
    const manifest={type:'cowriter-song-bundle',version:'0.4.0.12',exchangeId,createdAt,contributor,sourceSongId:song.sourceSongId||song.id,songId:song.id,title:song.title,audio,missingAudio:missing};
    files['manifest.json']=JSON.stringify(manifest,null,2);files['song.json']=JSON.stringify(song,null,2);files['README.txt']=`Co-Writer 0.4.0.12 Field Exchange\n\nSong: ${song.title}\nSent by: ${contributor}\nCreated: ${new Date(createdAt).toLocaleString()}\n\nImport this .cowriter-song.zip from Home or Songs.\n${missing.length?`\nMissing audio: ${missing.join(', ')}\n`:''}`;
    downloadBlob(`${safeName(song.title)}-${safeName(contributor)}.cowriter-song.zip`,FE.zipStore(files));toast(missing.length?`Song bundle exported; ${missing.length} tape${missing.length===1?' is':'s are'} missing on this device`:'Complete song bundle exported');
  }

  async function applyImportedBundle(bundle,mode,existing){
    const incoming=normaliseSong(clone(bundle.song)),manifest=bundle.manifest,receivedAt=now(),contributor=manifest.contributor||'Another writer';
    await dbSet(`recovery-before-exchange-${Date.now()}`,clone(state));
    const takeIds=new Map();for(const take of incoming.takes){const previous=take.id,next=uid('take');take.id=next;takeIds.set(previous,next);const audioMeta=(manifest.audio||[]).find(item=>item.takeId===previous);if(audioMeta&&bundle.entries[audioMeta.path])await audioSet(next,new Blob([bundle.entries[audioMeta.path]],{type:audioMeta.mimeType||take.mimeType||'audio/webm'}));}
    incoming.timeline.forEach(entry=>{if(entry.takeId&&takeIds.has(entry.takeId))entry.takeId=takeIds.get(entry.takeId);});incoming.sourceSongId=manifest.sourceSongId||incoming.sourceSongId||incoming.id;incoming.exchangeHistory.push({id:uid('exchange'),type:'received',at:receivedAt,by:state.fieldProfile.name||'This device',from:contributor,exchangeId:manifest.exchangeId});incoming.timeline.unshift({id:uid('log'),type:'exchange',text:`Received complete song bundle from ${contributor}.`,createdAt:receivedAt,view:'field exchange'});incoming.updatedAt=receivedAt;
    if(mode==='replace'&&existing){const recovery={id:uid('version'),name:`Before exchange from ${contributor}`,createdAt:receivedAt,snapshot:snapshotSong(existing)};const id=existing.id;incoming.id=id;incoming.versions=[recovery,...(existing.versions||[]),...(incoming.versions||[])];Object.keys(existing).forEach(key=>delete existing[key]);Object.assign(existing,incoming);state.selectedSongId=id;}
    else{incoming.id=uid('song');state.songs.unshift(incoming);state.selectedSongId=incoming.id;}
    state.view=incoming.lastView||'write';state.shellPage='workspace';state.sidebarCollapsed=true;scheduleSave();render();toast(mode==='replace'?'Song updated; recovery version saved':`Added copy from ${contributor}`);
  }

  function openBundlePreview(bundle){
    const {manifest}=bundle,incoming=normaliseSong(clone(bundle.song)),sourceId=manifest.sourceSongId||incoming.sourceSongId||incoming.id;const existing=state.songs.find(song=>song.id===sourceId||song.sourceSongId===sourceId);const lineCount=incoming.sections.reduce((sum,section)=>sum+section.lines.length,0),body=document.createElement('div');body.className='exchange-preview';body.innerHTML=`<div class="exchange-stamp"><span>FROM</span><strong>${escapeHtml(manifest.contributor||'Another writer')}</strong><small>${escapeHtml(new Date(manifest.createdAt||Date.now()).toLocaleString())}</small></div><dl><div><dt>Song</dt><dd>${escapeHtml(incoming.title)}</dd></div><div><dt>Material</dt><dd>${incoming.sections.length} sections · ${lineCount} lines</dd></div><div><dt>Work Tapes</dt><dd>${incoming.takes.length} included</dd></div></dl>${manifest.missingAudio?.length?`<p class="exchange-warning">The sender reported ${manifest.missingAudio.length} unavailable recording${manifest.missingAudio.length===1?'':'s'}.</p>`:''}<p>No existing song will be silently overwritten. A recovery copy is saved before an update.</p>`;
    const cancel=document.createElement('button');cancel.className='ghost-button';cancel.textContent='Cancel';cancel.onclick=closeOverlay;const add=document.createElement('button');add.className='primary-button';add.textContent=existing?'Add as separate copy':'Add to Songs';add.onclick=()=>{closeOverlay();applyImportedBundle(bundle,'copy',existing).catch(error=>{console.error(error);toast('The song bundle could not be imported');});};const footer=[cancel,add];if(existing){const replace=document.createElement('button');replace.className='ghost-button';replace.textContent='Update existing song';replace.onclick=()=>{closeOverlay();applyImportedBundle(bundle,'replace',existing).catch(error=>{console.error(error);toast('The song bundle could not be imported');});};footer.push(replace);}openModal('Review exchanged song',body,footer);
  }

  async function importFieldBundle(file){const entries=await FE.parseStoredZip(file),manifest=FE.readJson(entries,'manifest.json'),song=FE.readJson(entries,'song.json');if(manifest.type!=='cowriter-song-bundle')throw new Error('Not a Co-Writer song bundle');openBundlePreview({entries,manifest,song});}
  function importJsonFile(file){const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(reader.result);snapshot('Imported backup');if(parsed.song){const song=normaliseSong(parsed.song);state.songs.unshift(song);state.selectedSongId=song.id;}else if(parsed.state)state=normaliseState(parsed.state);else if(Array.isArray(parsed.songs))state=normaliseState(parsed);else throw new Error('Unknown format');scheduleSave();render();toast('Import complete');}catch(error){console.error(error);toast('That file could not be imported. Your Songs have not been changed.');}};reader.readAsText(file);}
  function importFile(file){if(!file)return;if(file.name.toLowerCase().endsWith('.zip')||file.type==='application/zip'){importFieldBundle(file).catch(error=>{console.error(error);toast(error.message||'That song bundle could not be read');});return;}importJsonFile(file);}

  function exportBackup(){downloadText(`Co-Writer-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({type:'cowriter-pro-backup',version:'0.4.0.12',exportedAt:now(),audioNotice:'Use Export complete song for a transferable bundle containing Work Tapes.',state},null,2));}
  function downloadText(filename,text){const blob=new Blob([text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

  function bind(){
    const continueWriting=()=>{const song=state.songs.find(item=>item.id===state.selectedSongId)||state.songs.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt))[0];if(!song){createNewSong();return;}state.selectedSongId=song.id;state.view=song.lastView||'write';state.shellPage='workspace';state.sidebarCollapsed=true;state.workbenchOpen=false;scheduleSave();render();};
    const openLibrary=openSongs;
    const chooseImport=()=>{els.backupFile.value='';els.backupFile.click();};
    const openAppMore=anchor=>openChoicePopover(anchor,'Co-Writer',[['Guide',openStartHere],['Exercises',()=>window.CoWriterMorningLines?.open()],['Explore demo',loadDemo],['Start review capture',startReviewCapture],['Import song or backup…',chooseImport],['Backup Songs metadata',exportBackup],['Install for offline',installForOffline],['About',openAbout]]);
    els.appNavBrand.onclick=openHome;els.appNavHome.onclick=openHome;els.appNavIdeas.onclick=openIdeas;els.appNavSongs.onclick=openSongs;els.appNavNewIdea.onclick=()=>openIdeaComposer();els.appNavMore.onclick=()=>openAppMore(els.appNavMore);
    els.newSong.onclick=createNewSong;els.emptyNewSong.onclick=createNewSong;els.welcomeNewSong.onclick=createNewSong;
    els.welcomeNewIdea.onclick=()=>openIdeaComposer();els.ideasNew.onclick=()=>openIdeaComposer();
    els.welcomeCapture.onsubmit=event=>{event.preventDefault();saveHomeIdea();};els.welcomeIdeaInput.oninput=()=>{els.welcomeIdeaSave.disabled=!els.welcomeIdeaInput.value.trim();els.welcomeIdeaStatus.textContent='No title or song details required.';autoGrow(els.welcomeIdeaInput,48);};els.welcomeIdeaInput.onkeydown=event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();saveHomeIdea();}};
    els.welcomeIdeas.onclick=openIdeas;
    els.welcomeContinue.onclick=continueWriting;els.welcomeContinueCard.onclick=event=>{if(event.target.closest('button'))return;continueWriting();};els.welcomeContinueCard.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();continueWriting();}};
    els.welcomeLibrary.onclick=openLibrary;
    els.welcomeGetStarted.onclick=openStartHere;
    els.welcomeMorningLines.onclick=()=>window.CoWriterMorningLines?.open();
    els.welcomeRecordIdea.onclick=()=>startWorkTape(null,'welcome');
    els.welcomeInstall.onclick=installForOffline;
    els.welcomeDemo.onclick=()=>enterDemo(false);els.welcomeImport.onclick=chooseImport;
    els.welcomeMore.onclick=()=>openChoicePopover(els.welcomeMore,'More ways to begin',[['Explore demo',()=>enterDemo(false)],['Play unattended tour',startUnattendedDemo],['Start review capture',startReviewCapture],['Import song or backup…',chooseImport],['Install for offline',installForOffline],['About',openAbout]]);
    els.emptyOpenLibrary.onclick=()=>{state.shellPage='library';scheduleSave();render();};
    els.ideasHome.onclick=openHome;els.ideasSongs.onclick=openLibrary;
    els.ideaSearch.oninput=renderIdeas;els.ideaFilters.onclick=event=>{const button=event.target.closest('[data-idea-filter]');if(!button)return;state.ideaFilter=button.dataset.ideaFilter;scheduleSave();renderIdeas();};
    els.homeButton.onclick=openHome;els.libraryHome.onclick=openHome;els.songNewIdea.onclick=()=>openIdeaComposer();
    els.libraryMenu.onclick=()=>openMenu(els.libraryMenu,[['Explore demo',loadDemo],['Start review capture',startReviewCapture],['Import song or backup…',chooseImport],['Backup Songs metadata',exportBackup],['Install for offline',installForOffline],['About',openAbout]]);
    els.loadDemo.onclick=loadDemo;
    els.closeDemoGuide.onclick=pauseDemoGuide;els.demoGuideExit.onclick=leaveDemoForWelcome;els.demoGuideBack.onclick=()=>changeDemoGuideStep(-1);els.demoGuideNext.onclick=()=>changeDemoGuideStep(1);
    const takeOverTour=()=>{if(!demoTourTimer)return;stopUnattendedDemo();if(demoSession)demoSession.unattended=false;scheduleSave();renderDemoGuide();toast('Tour paused — you’re in control');};document.addEventListener('pointerdown',takeOverTour,true);document.addEventListener('keydown',takeOverTour,true);document.addEventListener('pointerdown',()=>{keyboardNavigation=false;},true);document.addEventListener('keydown',event=>{if(event.key==='Tab')keyboardNavigation=true;},true);
    els.collapseSidebar.onclick=()=>{if(state.shellPage==='library'){state.shellPage='workspace';state.sidebarCollapsed=true;}else state.sidebarCollapsed=true;scheduleSave();render();};
    els.expandSidebar.onclick=()=>{state.shellPage='library';state.sidebarCollapsed=false;scheduleSave();render();};
    els.songSearch.oninput=renderLibrary;els.libraryFilterButton.onclick=()=>openLibraryFilter(els.libraryFilterButton);els.librarySortButton.onclick=()=>openLibrarySort(els.librarySortButton);els.newProject.onclick=createProject;
    els.libraryFilters.onclick=event=>{const button=event.target.closest('button[data-filter]');if(!button)return;state.filter=button.dataset.filter;scheduleSave();renderLibrary();};
    els.modeNav.onclick=event=>{const button=event.target.closest('button[data-view]');if(!button)return;if(button.dataset.view===state.view&&phoneShapeLayout()){scrollWorkspaceToTop();return;}setView(button.dataset.view);};
    els.songTitle.oninput=()=>{const song=currentSong();if(!song)return;song.title=els.songTitle.value;touch(song);renderLibrary();els.workbenchSubtitle.textContent='';};
    els.undoButton.onclick=undo;els.redoButton.onclick=redo;els.themeToggle.onclick=()=>{state.theme=state.theme==='light'?'dark':'light';scheduleSave();render();};els.shortcutsButton.onclick=openShortcutsPanel;els.songMenu.onclick=()=>openSongMenu(els.songMenu);
    els.exportBackup.onclick=exportBackup;els.importBackup.onclick=chooseImport;els.backupFile.onchange=()=>{const file=els.backupFile.files[0];if(file)importFile(file);els.backupFile.value='';};
    els.closeWorkbench.onclick=()=>{transientPanel=null;state.workbenchOpen=false;scheduleSave();render();};
    els.closeAlternativesTray.onclick=closeAlternativesTray;
    els.recordingTransport.onclick=event=>{const action=event.target.closest('[data-record-action]')?.dataset.recordAction;if(action==='pause')toggleRecordingPause();if(action==='stop')stopWorkTape();};
    els.fieldStatus.onclick=installForOffline;
    window.addEventListener('online',updateConnectionStatus);window.addEventListener('offline',updateConnectionStatus);
    window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;els.welcomeInstall.textContent='Install app';});
    window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;updateConnectionStatus();toast('Co-Writer installed');});
    els.workbenchTabs.onclick=event=>{const button=event.target.closest('button[data-tab]');if(!button)return;transientPanel=null;state.workbenchTab=button.dataset.tab;scheduleSave();renderWorkbench();};
    els.workbenchResize.onmousedown=event=>{resizeStart={x:event.clientX,width:state.workbenchWidth};document.body.style.cursor='col-resize';};
    window.addEventListener('mousemove',event=>{if(resizeStart){state.workbenchWidth=clamp(resizeStart.width+(resizeStart.x-event.clientX),290,540);document.documentElement.style.setProperty('--workbench-width',`${state.workbenchWidth}px`);}});
    window.addEventListener('mouseup',()=>{if(resizeStart){resizeStart=null;document.body.style.cursor='';scheduleSave();}});
    window.addEventListener('pointermove',shapePointerMove);window.addEventListener('pointerup',shapePointerUp);
    window.addEventListener('pointermove',mobileTouchPointerMove,{passive:false});window.addEventListener('pointerup',mobileTouchPointerUp);window.addEventListener('pointercancel',mobileTouchPointerUp);
    els.viewHost.addEventListener('scroll',()=>{const song=currentSong();if(!song)return;clearTimeout(els.viewHost._scrollTimer);els.viewHost._scrollTimer=setTimeout(()=>{song.viewMemory[state.view]||={};song.viewMemory[state.view].scrollTop=els.viewHost.scrollTop;touch(song);},120);});
    window.addEventListener('scroll',event=>{const floating=els.overlayLayer.querySelector('.menu-popover,.text-popover');if(floating&&!floating.contains(event.target))floating.closest('.overlay-backdrop')?.remove();},true);
    document.addEventListener('keydown',event=>{
      const mod=event.metaKey||event.ctrlKey;
      const editing=['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;
      const optionView=!mod&&event.altKey&&!event.shiftKey?({Digit1:'plan',Digit2:'write',Digit3:'shape',Digit4:'chart'})[event.code]:null;
      const song=currentSong();
      if(!mod&&event.altKey&&!event.shiftKey&&!editing&&event.code==='KeyI'){event.preventDefault();openIdeas();return;}
      if(optionView&&!editing&&state.shellPage==='workspace'&&song){event.preventDefault();setView(optionView);return;}
      if(mod&&!event.altKey&&!event.shiftKey&&!editing&&event.key==='\\'&&song&&state.shellPage==='workspace'&&state.view!=='chart'){event.preventDefault();toggleWorkbench(state.workbenchTab);return;}
      if(event.code==='Space'&&!editing){spaceHeld=true;if(state.view==='shape')event.preventDefault();}
      if(mod&&state.view==='write'&&!editing&&event.key.toLowerCase()==='c'&&activeLineId){event.preventDefault();copyActiveChords(song);}
      else if(mod&&state.view==='write'&&!editing&&event.key.toLowerCase()==='x'&&activeLineId){event.preventDefault();copyActiveChords(song);removeActiveChords(song);}
      else if(mod&&state.view==='write'&&!editing&&event.key.toLowerCase()==='v'&&activeLineId){event.preventDefault();pasteActiveChords(song);}
      else if(mod&&state.view==='write'&&!editing&&event.key.toLowerCase()==='d'&&activeLineId){event.preventDefault();duplicateActiveChords(song);}
      else if(state.view==='write'&&!editing&&(event.key==='Backspace'||event.key==='Delete')&&(activeChordId||activeProgressionToken)){event.preventDefault();removeActiveChords(song);}
      else if(!editing&&!mod&&!event.altKey&&event.key==='?'){event.preventDefault();openShortcutsPanel();}
      else if(mod&&!event.shiftKey&&event.key.toLowerCase()==='z'){event.preventDefault();undo();}
      else if(mod&&event.shiftKey&&event.key.toLowerCase()==='z'){event.preventDefault();redo();}
      else if(mod&&event.key.toLowerCase()==='n'){event.preventDefault();createNewSong();}
      else if(mod&&event.key.toLowerCase()==='f'&&song){event.preventDefault();openSongSearch(song);}
      else if(mod&&event.key.toLowerCase()==='k'&&state.view==='write'){event.preventDefault();addChordFromToolbar(song);}
      else if(state.view==='shape'&&!mod&&!event.altKey&&!editing&&event.code==='Digit0'){event.preventDefault();event.shiftKey?setShapeZoom(song,1):fitShapeView(song,false);}
      else if(state.view==='shape'&&!mod&&!event.altKey&&!editing&&['-','_'].includes(event.key)){event.preventDefault();setShapeZoom(song,song.shapeView.zoom-.1);}
      else if(state.view==='shape'&&!mod&&!event.altKey&&!editing&&['=','+'].includes(event.key)){event.preventDefault();setShapeZoom(song,song.shapeView.zoom+.1);}
      else if(state.view==='shape'&&!mod&&!event.altKey&&!editing&&event.key.toLowerCase()==='f'){event.preventDefault();fitShapeView(song,true);}
      else if(state.view==='shape'&&!mod&&!event.altKey&&!editing&&event.key.toLowerCase()==='c'){event.preventDefault();centreShapeSelection(song);}
      else if(state.view==='shape'&&!mod&&!event.altKey&&!editing&&event.key.toLowerCase()==='v'){event.preventDefault();setShapeTool('select',song);}
      else if(state.view==='shape'&&!mod&&!event.altKey&&!editing&&event.key.toLowerCase()==='h'){event.preventDefault();setShapeTool('hand',song);}
      else if(event.key==='Escape'){closeSelectionBar();closeOverlay();if(state.alternativesTrayOpen){closeAlternativesTray();}else if(transientPanel){transientPanel=null;state.workbenchOpen=false;scheduleSave();render();}else if(activeEditor)activeEditor.blur();}
    });
    document.addEventListener('keyup',event=>{if(event.code==='Space')spaceHeld=false;});document.addEventListener('mousedown',event=>{if(selectionBar&&!event.target.closest('.selection-bar')&&!event.target.closest('textarea'))closeSelectionBar();});
  }

  async function init(){bind();window.CoWriterMorningLines?.init();registerOfflineShell();db=await openDatabase();const loaded=await dbGet(STATE_KEY);const needsMigration=loaded&&Number(loaded.schemaVersion||0)<14;if(needsMigration)await dbSet('migration-backup-pre-0.4.0.9',loaded);state=normaliseState(loaded);if(!state.songs.length){state.songs=[];state.selectedSongId=null;if(state.shellPage==='workspace'||state.shellPage==='library')state.shellPage=state.ideas.length?'ideas':'welcome';}else if(!state.songs.some(song=>song.id===state.selectedSongId))state.selectedSongId=state.songs[0].id;try{const savedDemo=JSON.parse(sessionStorage.getItem(DEMO_SESSION_KEY)||'null');if(savedDemo?.active&&(savedDemo.song||savedDemo.sandboxSongs)){demoSession=savedDemo;demoSession.mode ||= 'demo';if(savedDemo.song)demoSession.song=normaliseSong(savedDemo.song);if(Array.isArray(savedDemo.sandboxSongs))demoSession.sandboxSongs=savedDemo.sandboxSongs.map(normaliseSong);state.shellPage='workspace';}}catch(error){sessionStorage.removeItem(DEMO_SESSION_KEY);}if(currentSong())state.view=inSandboxMode()?currentSong().lastView||'write':inDemoMode()?(demoSession.guideOpen?DEMO_STEPS[demoSession.guideStep||0].view:demoSession.song.lastView||'write'):currentSong().lastView||state.view;render();reviewCaptureController=window.CoWriterReviewCapture?.create({getState:()=>runtimeSnapshot(),getContext:()=>{const song=currentSong();return{page:document.body.classList.contains('morning-lines-open')?'morning-lines':state.shellPage,view:state.view,songId:song?.id||null,songTitle:song?.title||null,shelf:state.workbenchOpen?state.workbenchTab:null,alternativesOpen:state.alternativesTrayOpen};},notify:toast})||null;}
  init().catch(error=>{console.error(error);document.body.innerHTML='<pre style="padding:30px">Co-Writer could not start. Open the browser console for details.</pre>';});
})();
