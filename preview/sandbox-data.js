(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CoWriterSandboxData=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const FIXED_NOW='2026-07-31T05:30:00.000Z';
  let sequence=0;
  const id=prefix=>`${prefix}_sandbox_${(++sequence).toString(36)}`;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const line=(text='',kind='lyric',extra={})=>({id:id('line'),text,kind,chords:[],syllableOverride:null,attention:false,style:{},...extra});
  const section=(label,lines=[],x=170,y=150,extra={})=>({id:id('section'),label,lines,collapsed:false,keyOverride:null,shape:{x,y,w:340,h:270},...extra});
  const block=(type,text,x,y,extra={})=>({id:id('block'),type,text,chords:[],x,y,w:220,h:120,createdAt:FIXED_NOW,...extra});
  const profile=(name,shapeKey,capo,tuning='Standard')=>({id:id('profile'),name,shapeKey,capo,tuning});
  const writer=name=>({id:id('writer'),name,ipi:'',pro:'APRA AMCOS',role:'Music & lyrics'});
  const baseSong=(key,title,order,stage='draft')=>{
    const chart=profile('Standard chart',key,0,'Standard');
    return {
      id:id('song'),title,libraryStatus:'active',stage,favourite:false,key,spelling:'auto',tuning:'Standard',tuningNote:'',
      plan:{brainDump:''},shapeBlocks:[],sections:[],alternatives:[],versions:[],writers:[writer('Sandbox Writer')],
      chartProfiles:[chart],activeProfileId:chart.id,createdAt:FIXED_NOW,updatedAt:new Date(Date.parse(FIXED_NOW)-order*60000).toISOString(),
      lastView:'write',viewMemory:{},shapeView:{panX:80,panY:55,zoom:1},workbench:{progression:'| 1 | 5/7 | 6m | 4 |'},
      format:{fontFamily:'serif',fontSize:19,lineHeight:1.65,pageWidth:860},
      isDemo:true,isSandbox:true,sandboxKey:keyFor(title),sandboxOrder:order
    };
  };
  const keyFor=title=>title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').split('-').slice(0,3).join('-');
  const lineAlt=(song,target,label,text)=>song.alternatives.push({id:id('alt'),type:'lyric',targetType:'line',targetId:target.id,label,content:{line:{text,kind:'lyric',chords:[],style:{}}},createdAt:FIXED_NOW});
  const chordAlt=(song,targetLine,targetChordIndex,label,value)=>song.alternatives.push({id:id('alt'),type:'harmony',targetType:'chord',targetId:`pending-${targetLine.id}-${targetChordIndex}`,parentLineId:targetLine.id,label,content:{chord:{value,anchor:0}},createdAt:FIXED_NOW,pendingChordIndex:targetChordIndex});
  const sectionAlt=(song,target,label)=>song.alternatives.push({id:id('alt'),type:'harmony',targetType:'section',targetId:target.id,label,content:{section:clone(target)},createdAt:FIXED_NOW});
  const titleAlt=(song,label,text)=>song.alternatives.push({id:id('alt'),type:'title',targetType:'song',targetId:song.id,label,content:{text},createdAt:FIXED_NOW});
  const compactSnapshot=(song,name,sectionCount=2)=>({
    id:id('version'),name,createdAt:FIXED_NOW,snapshot:{...clone(song),shapeBlocks:clone(song.shapeBlocks.slice(0,10)),sections:clone(song.sections.slice(0,sectionCount)),alternatives:[],versions:[]}
  });
  const addVersions=(song,names)=>names.forEach((name,index)=>song.versions.push({...compactSnapshot(song,name,Math.min(song.sections.length,1+(index%4))),createdAt:new Date(Date.parse(FIXED_NOW)-(names.length-index)*3600000).toISOString()}));

  function lastLight(){
    const song=baseSong('G','The Last Light On — Working Draft',0,'draft');song.sandboxKey='last-light';
    song.plan.brainDump=`Sunday night at the old house after everyone has gone. The relationship is already over, but the porch light is still burning as though somebody might come back.\n\nThe gravel after rain. Dad's ute disappearing at the corner. A mug left beside the sink. The key still under the blue pot.\n\nPossible title: The Last Light On / Leave the Hallway Burning.\n\nMaybe the chorus does not explain the breakup. It only notices the light, the empty rooms and how habit survives the people who made it.\n\nG – D/F# – Em7 – Cadd9. Keep the verse conversational. Let the bridge lift somewhere brighter and make that brightness hurt.`;
    const verse1=section('Verse 1',[
      line('[G]Rain on the bonnet, [D/F#]keys in your hand'),line('[Em7]Half of a sentence we [Cadd9]both understand'),line('[G]You watched the driveway, I [D]watched the clock'),line('Like one of us might find the courage to stop')
    ],170,150);
    const chorus=section('Chorus',[
      line('[Cadd9]Leave the last light [G]on'),line('[Em7]Long after everyone is [D]gone'),line('[C]Habit keeps a house a[G]live'),line('[Am7]Even when the people [D]don’t')
    ],180,570);
    const verse2=section('Verse 2',[
      line('[G]Your coffee cup was [D/F#]waiting by the sink'),line('[Em7]I left it there because I [Cadd9]didn’t want to think'),line('')
    ],590,180);
    song.sections=[verse1,chorus,verse2];
    const pieces=[
      ['fragment','The porch light stayed on after everybody left'],['fragment','Your tyres wrote a river through the gravel'],['fragment','The bridge could be the phone call neither of us makes'],['title','Leave the Hallway Burning'],['harmony','| G | D/F# | Em7 | Cadd9 |'],['fragment','The hallway clock is louder after midnight'],['fragment','A coat still hanging where the shoulders used to be'],['fragment','Maybe the bridge begins with daylight'],['title','The Last Light On'],['harmony','| 6m | 4 | 1 | 5 |'],['fragment','We learnt the rooms by what was missing'],['fragment','Do not explain the argument'],['fragment','A neighbour closing a gate across the road'],['fragment','The porch bulb buzzing in the rain'],['fragment','Leave the key beneath the pot'],['fragment','Could the last chorus lose the drums?'],['harmony','| 4 | 1/3 | 2m | 5 |'],['fragment','The house keeps practising our names']
    ];
    song.shapeBlocks=pieces.map(([type,text],i)=>block(type,text,520+(i%4)*250,150+Math.floor(i/4)*160,{sourcePlanRef:`last-light-plan-${i+1}`}));
    lineAlt(song,chorus.lines[0],'Quieter hook','[Cadd9]Keep the last light [G]on');
    lineAlt(song,chorus.lines[1],'Earlier chorus wording','[Em7]Burning when there’s nobody [D]home');
    lineAlt(song,chorus.lines[2],'House image','[C]Every empty room stays [G]alive');
    titleAlt(song,'Title alternative','Leave the Hallway Burning');
    sectionAlt(song,chorus,'Chorus progression alternative');sectionAlt(song,chorus,'Half-time final chorus');
    chordAlt(song,chorus.lines[0],0,'Chord alternative','Am7');chordAlt(song,chorus.lines[3],0,'Minor colour','Cm');
    addVersions(song,['First page','Chorus found','Verse two opened','Current working draft']);
    song.chartProfiles=[profile('D shapes · capo 5','D',5,'Standard')];song.activeProfileId=song.chartProfiles[0].id;
    return song;
  }

  function sundayClothes(){
    const song=baseSong('C','Sunday Clothes — Early Idea',1,'developing');song.sandboxKey='sunday-clothes';song.lastView='plan';song.format.fontSize=20;
    song.plan.brainDump=`Sunday lunch after church, but nobody in the family really goes anymore. The clothes remain as ritual: ironed collar, polished shoes, the good plates, the quiet performance of being fine.\n\nGrandmother called them Sunday clothes even on Christmas morning. Dad hated ties and kept one rolled in the glovebox. Mum could tell whether a week had gone badly by how long he stood at the ironing board.\n\nPossible titles: Sunday Clothes / The Good Shirt / Kept for Company / All Dressed Up.\n\nImages: starch in the kitchen air; a loose button in the sugar bowl; shoes lined under the spare bed; sunlight finding dust on the shoulders; a family photograph where everyone is looking just left of the camera.\n\nDo not make it nostalgic too quickly. The clothes are armour and kindness at once. Maybe the singer finally wears the good shirt to an ordinary Tuesday appointment.\n\nRough movement: C — Am — F — G. Chorus may begin on F. Keep melody narrow in the verse.\n\nHalf-lines:\nYou kept your Sunday clothes for people coming round\nThe collar knew the shape of every word you swallowed\nWe dressed the grief before we gave it any name\nA clean white shirt can make a liar of a man\n\nQuestions: Is the narrator the child or adult? Is Dad alive? Does the last verse use the clothes or give them away?`;
    const ideas=[['fragment','A clean white shirt can make a liar of a man'],['title','Sunday Clothes'],['fragment','Starch hanging in the kitchen light'],['fragment','The good shoes under the spare bed'],['harmony','| C | Am | F | G |'],['fragment','The collar knew each swallowed word'],['fragment','Tuesday appointment in the good shirt'],['fragment','Do not resolve Dad too neatly']];
    song.shapeBlocks=ideas.map(([type,text],i)=>block(type,text,160+(i%4)*270,130+Math.floor(i/4)*190,{sourcePlanRef:`sunday-plan-${i}`}));
    const verse=section('Verse 1',[line('[C]Steam on the window, [Am]iron on the board'),line('[F]Your one good shirt was [G]waiting by the door'),line('')],180,560);song.sections=[verse];
    lineAlt(song,verse.lines[0],'Less literal opening','[C]Morning made a mirror [Am]of the kitchen glass');titleAlt(song,'Title option','The Good Shirt');sectionAlt(song,verse,'Verse beginning on relative minor');
    addVersions(song,['First notes','Verse opening']);return song;
  }

  function nothingLeft(){
    const song=baseSong('D','Nothing Left to Prove — Lyric Workshop',2,'draft');song.sandboxKey='nothing-left';song.format.fontSize=22;song.format.lineHeight=1.75;
    const labels=['Verse 1','Pre-Chorus','Chorus','Verse 2','Chorus 2','Bridge','Final Chorus'];
    const rows=[
      ['I learnt to make a room go quiet','Before I learnt to raise my voice','I wore ambition like a jacket','And called the weight of it a choice','The mirror kept the better angle','The night kept every other noise'],
      ['Now the applause arrives much later','And leaves before I close the door','I used to count the people watching','I do not count them anymore','',''],
      ['I have nothing left to prove','No clean defence, no perfect move','Let the good name lose its shine','I can live with what is mine','I have nothing left to prove','Except the life I choose'],
      ['The old awards are in a carton','Behind the winter coats upstairs','A photograph of borrowed confidence that never quite belonged to me','A younger face rehearsing care','I thought success would make me certain','It only taught me how to stare'],
      ['I have nothing left to prove','No final speech, no grand excuse','Let the headline miss my name','I can love the work the same','I have nothing left to prove','Except the truth I use'],
      ['Maybe peace is not surrender','Maybe quiet is not defeat','Maybe all the doors I wanted','Were just walls dressed up as streets','I can leave the room unfinished','I can walk on ordinary feet'],
      ['I have nothing left to prove','No clean defence, no perfect move','Let the good name lose its shine','I can live with what is mine','I have nothing left to prove','And nothing left to lose']
    ];
    song.sections=labels.map((label,si)=>section(label,rows[si].map((text,li)=>line(text?`[${li%3===0?'D':li%3===1?'G':'Bm'}]${text}`:'', 'lyric', li===1&&si===5?{syllableOverride:8}:li===4&&si===5?{attention:true}:{})),170+(si%3)*390,140+Math.floor(si/3)*390));
    const candidates=['No medal ever learnt my middle name','The room gets smaller when the praise arrives','I kept the speech and lost the reason','A trophy is a very patient mirror','Let the silence take the photograph','Success came dressed as borrowed weather','I can leave before the final question','An ordinary life is not a lesser one','The old suit still remembers every stage','I owe nobody the ending'];
    song.shapeBlocks=candidates.map((text,i)=>block('fragment',text,170+(i%4)*245,1250+Math.floor(i/4)*150));
    for(let i=0;i<14;i++){const target=song.sections[i%7].lines[i%6];lineAlt(song,target,`Line option ${i+1}`,`[${i%2?'G':'D'}]${candidates[i%candidates.length]}`);}
    addVersions(song,['Loose first pass','Chorus rewrite','Second verse reordered','Bridge alternatives','Font-size check','Current lyric workshop']);return song;
  }

  function northbound(){
    const song=baseSong('D','Northbound — Harmony Workshop',3,'draft');song.sandboxKey='northbound';song.tuning='Drop D';song.spelling='sharp';
    const specs=[
      ['Intro',[line('| D | A/C# | Bm7 | Gadd9 |','progression'),line('| D/F# | Gm6 | D/A | Asus4 A |','progression')]],
      ['Verse 1',[line('[D]White lines leaning [A/C#]into the rain'),line('[Bm7]Northbound trucks like a [Gadd9]slow moving train'),line('[D/F#]Your old map folded [G]under my knee'),line('[Em7]Every wrong turn still [Asus4]looked like me'),line('[D]Static on the radio [A/C#]calling my name')]],
      ['Pre-Chorus',[line('[Bm7]I can feel the city [Gadd9]letting go'),line('[D/F#]One more mile and I [A]will know')]],
      ['Chorus',[line('[Gadd9]Northbound, carry me [D/F#]over'),line('[Em7]Past the exits we [A7sus4]missed'),line('[G]Let the cold road make me [Gm6]sober'),line('[D/A]Let me learn what leaving [A]is'),line('| Gadd9 | D/F# | Em7 | A7sus4 A |','progression')]],
      ['Bridge',[line('[Bbmaj7]Maybe every border is a [D/A]story'),line('[Gm6]Maybe every home is partly [D/F#]gone'),line('[Em9]I keep driving through the [A7b9]morning'),line('[Dadd9]Northbound with the headlights on')]]
    ];
    song.sections=specs.map(([label,lines],si)=>section(label,lines,180+(si%3)*390,140+Math.floor(si/3)*410));
    const harmony=['| D | F#m/C# | G/B | Gm/Bb |','| 1 | 5/7 | 6m7 | 4add9 |','D5(add9)','A7sus4','Gm6/Bb','Cmaj7(#11)','Em9','A7b9','D/F# → Gm6','N.C. · pickup'];
    song.shapeBlocks=harmony.map((text,i)=>block('harmony',text,740+(i%3)*260,900+Math.floor(i/3)*150));
    const lyricLines=song.sections.flatMap(s=>s.lines).filter(l=>l.kind==='lyric');
    const values=['Dsus2','A/C#','Bm11','G6','D/F#','Gm6','Em9','A7'];
    for(let i=0;i<8;i++)chordAlt(song,lyricLines[i%lyricLines.length],0,`Chord colour ${i+1}`,values[i]);
    for(let i=0;i<4;i++)sectionAlt(song,song.sections[(i+1)%song.sections.length],`Progression route ${i+1}`);
    addVersions(song,['Drop D sketch','Slash-bass pass','Borrowed iv added','Nashville check','Harmony workshop']);return song;
  }

  function halfwayHome(){
    const song=baseSong('B','Halfway Home — Capo & Transposition',4,'draft');song.sandboxKey='halfway-home';song.lastView='chart';song.spelling='sharp';
    song.plan.brainDump='Sounds in B. Keep the vocal centre, but test G shapes at capo 4 against A shapes at capo 2. Bridge lifts to C# without making the chart unreadable.';
    song.chartProfiles=[profile('G shapes · capo 4','G',4),profile('A shapes · capo 2','A',2),profile('Sounding chords','B',0)];song.activeProfileId=song.chartProfiles[0].id;
    const specs=[
      ['Verse 1',['[B]Halfway home with the [F#/A#]dashboard low','[G#m7]Counting every town I [Eadd9]used to know','[B/D#]Your name in the glass when the [E]headlights turn','[C#m7]Some roads remember what the [F#sus4]drivers learn']],
      ['Pre-Chorus',['[G#m]No sign says where the [E]old life ends','[B/F#]Only where the highway [F#]bends']],
      ['Chorus',['[E]Halfway home, half [B/D#]gone','[C#m7]Holding the wheel till the [F#]morning comes','[E]If I arrive before the [G#m]feeling does','[B/F#]Leave the porch light [F#]on']],
      ['Verse 2',['[B]Service station coffee and a [F#/A#]paper cup','[G#m7]All the little reasons I was [Eadd9]giving up','[B/D#]The radio changed key but the [E]road stayed true','[C#m7]Every mile was one more [F#]mile from you']],
      ['Bridge',['[C#]Lift me over what I [G#/B#]cannot name','[A#m7]Let the new key carry the [F#add9]same old pain','[C#/E#]Halfway is a country with no [F#]border sign','[D#m7]I was yours in B, I am [G#sus4]leaving in C#']]
    ];
    song.sections=specs.map(([label,rows],si)=>section(label,rows.map(text=>line(text)),170+(si%3)*390,140+Math.floor(si/3)*400,label==='Bridge'?{keyOverride:'C#'}:{}));
    const chorus=song.sections[2];lineAlt(song,chorus.lines[0],'Less symmetrical hook','[E]Nearly home and nearly [B/D#]gone');chordAlt(song,chorus.lines[2],1,'Relative minor pull','E/G#');
    song.alternatives.push({id:id('alt'),type:'harmony',targetType:'song',targetId:song.id,label:'Whole song in A',content:{harmony:{key:'A',note:'Earlier sounding key'}},createdAt:FIXED_NOW});
    for(let i=0;i<6;i++)sectionAlt(song,song.sections[i%5],`Transposition preview ${i+1}`);
    addVersions(song,['Original in A','Moved to B','G-shapes profile','Bridge modulation','Flat spelling review','A-shapes comparison','Current capo draft']);return song;
  }

  function paperCrown(){
    const song=baseSong('Am','Paper Crown — Shape Canvas',5,'developing');song.sandboxKey='paper-crown';song.lastView='shape';song.shapeView={panX:220,panY:120,zoom:.72};
    song.plan.brainDump='A song about inheriting a role nobody actually wanted. Keep the images handmade: paper crown, kitchen-table kingdom, tape on the sceptre, names written on the back of receipts.';
    const a=['paper crown','kitchen kingdom','receipt-paper flag','tape on the sceptre','the chair at the head','a borrowed family name','gold pen running dry','the room after speeches','folded edges','rain through the cardboard','someone practising the wave','a throne beside the fridge'];
    const b=['You wore it lightly','Nobody voted for the king','The glue did not survive summer','We mistook duty for destiny','Every room had a smaller room inside','The crown fit everyone badly','A kingdom drawn in blue biro','The table knew the truth','We bowed because Dad laughed','The paper cut was real','Leave the title on the chair','No heir, only witnesses'];
    for(let i=0;i<60;i++){
      const type=i%17===0?'title':i%11===0?'harmony':'fragment';
      const text=type==='harmony'?`| ${['1m','b6','b3','b7'][i%4]} | ${['4m','5','b7','1m'][i%4]} |`:type==='title'?(i%2?'The Kitchen Kingdom':'Paper Crown'):`${a[i%a.length]} — ${b[(i*5)%b.length]}`;
      song.shapeBlocks.push(block(type,text,120+(i%10)*255+((i%3)-1)*28,110+Math.floor(i/10)*185+((i%4)-2)*22,{sourcePlanRef:`paper-plan-${i}`,shapeGroup:i<15?'Verse thoughts':i<32?'Chorus gravity':i<46?'Family images':'Loose endings'}));
    }
    song.sections=[section('Chorus',[line('[F]Paper crown on a [C/E]kitchen king'),line('[Dm7]All that weight from a [E7]folded thing')],450,450),section('Verse possibilities',[line('[Am]Names on the back of a [G]supermarket bill'),line('[F]Everybody leaving but the [E7]chair stayed still')],1320,760)];
    for(let i=0;i<5;i++)lineAlt(song,song.sections[i%2].lines[i%2],`Shape-linked line ${i+1}`,`[${i%2?'F':'Am'}]${b[i+2]}`);
    addVersions(song,['First scraps','Two loose groups','Sections emerging']);return song;
  }

  function stressTest(){
    const song=baseSong('Eb','Long Song Stress Test',6,'draft');song.sandboxKey='stress-test';song.format={fontFamily:'serif',fontSize:18,lineHeight:1.55,pageWidth:940};
    song.plan.brainDump=Array.from({length:32},(_,i)=>`Notebook page ${i+1}: This is a deliberately long planning paragraph with punctuation — commas, apostrophes, “quotation marks”, café names, naïve promises and repeated structural notes. It tests continuous saving, cleaning and scrolling without pretending to be finished prose.`).join('\n\n');
    const labels=['Intro','Verse 1','Verse 2','Pre-Chorus','Chorus','Post-Chorus','Verse 3','Turnaround','Chorus 2','Bridge A','Bridge B','Instrumental','Verse 4','Breakdown','Final Chorus','Tag','Outro','Custom: Afterword'];
    const cycle=['Eb','Bb/D','Cm7','Abadd9','Fm7','Gm/Bb','Abm6','Bb7sus4','Eb/G','Dbmaj7'];
    song.sections=labels.map((label,si)=>{
      const count=si<2?6:7;const lines=[];
      for(let li=0;li<count;li++){
        const first=cycle[(si+li)%cycle.length],second=cycle[(si+li+3)%cycle.length];
        let text=`[${first}]Section ${si+1}, line ${li+1} carries a long but valid lyric with café windows, em dashes — and an apostrophe that shouldn't break. [${second}]The ending keeps moving.`;
        if((si+li)%11===0)text='';
        if((si+li)%13===0)text=`[${first}]A very long wrapped line deliberately continues beyond the usual notebook width so font sizing, chord anchors, scrolling and export pagination can all be tested without inventing another object model for the same sentence.`;
        lines.push(line(text));
      }
      if(si%5===0)lines.push(line('| 1 | 5/7 | 6m7 | 4add9 |','progression'));
      return section(label,lines,150+(si%4)*370,130+Math.floor(si/4)*360,si===9?{keyOverride:'F'}:si===10?{keyOverride:'Gb'}:{});
    });
    for(let i=0;i<75;i++){
      const type=i%9===0?'harmony':i%19===0?'title':'fragment';
      const text=type==='harmony'?`| ${1+(i%7)}${i%3?'m':''} | ${(i+4)%7+1} | ${(i+5)%7+1}/3 |`:type==='title'?`Stress title ${Math.floor(i/19)+1}`:`Spare fragment ${String(i+1).padStart(2,'0')} — an unused image with enough text to wrap and remain searchable.`;
      song.shapeBlocks.push(block(type,text,110+(i%12)*240,100+Math.floor(i/12)*160,{sourcePlanRef:`stress-${i}`}));
    }
    const lyricLines=song.sections.flatMap(s=>s.lines).filter(l=>l.kind==='lyric');
    for(let i=0;i<30;i++)lineAlt(song,lyricLines[(i*7)%lyricLines.length],`Stress alternative ${i+1}`,`[${cycle[i%cycle.length]}]Alternative wording ${i+1} retains punctuation, café accents and a stable target.`);
    for(let i=0;i<15;i++)song.versions.push({id:id('version'),name:`Stress checkpoint ${String(i+1).padStart(2,'0')}`,createdAt:new Date(Date.parse(FIXED_NOW)-i*10800000).toISOString(),snapshot:{...clone(song),plan:{brainDump:`Compact stress snapshot ${i+1}`},sections:clone(song.sections.slice(0,2+(i%4))),shapeBlocks:[],alternatives:[],versions:[]}});
    return song;
  }

  function visualReview(){
    const song=lastLight();
    song.id=id('song');song.title='Visual Review Song';song.sandboxKey='visual-review';song.sandboxOrder=7;song.lastView='write';
    song.plan.brainDump=`SCREENSHOT NOTEBOOK\n\nA deliberately complete song for reviewing Welcome, Ideas, Songs, Plan, Write, Shape, Words & Music, Alternatives and Chart without preparing content first.\n\nVisual anchors: porch light in rain; red dust on the case; a motel key; handwriting in the chart margin.\n\nPhone Write acceptance: move the marked long line above the short line, undo, move it into Chorus, move a slash chord one word, reload, then confirm lyric order and chord anchors persist.\n\nReview path: capture Plan, edit and rearrange Write, arrange the labelled fragments in Shape, open Words & Music, select a chorus line and open Alternatives, then finish in Chart settings.`;
    const verse=song.sections[0],chorus=song.sections[1];
    const progression=line('| G | D/F# | Em7 Cadd9 | G/B D |','progression',{label:'Verse movement',demoKey:'mobile-progression-ribbon'});
    const longLine=line('[G]The porch light kept a small and stubborn [D/F#]weather of its own when every other room went dark','lyric',{demoKey:'mobile-long-line'});
    const shortLine=line('[Em7]Still on','lyric',{demoKey:'mobile-short-line'});
    verse.lines.unshift(progression);
    verse.lines.push(longLine,shortLine);
    chorus.lines.push(line('| Cadd9 | G/B | Am7 | Dsus4 D |','progression',{label:'Chorus turnaround',demoKey:'mobile-chorus-ribbon'}));
    lineAlt(song,longLine,'Tighter phone line','[G]The porch light made its [D/F#]own weather after dark');
    song.shapeBlocks.push(
      block('fragment','REVIEW: drag this loose line into Verse 2',1020,170,{shapeGroup:'Review markers'}),
      block('title','VISUAL REVIEW SONG',1020,330,{shapeGroup:'Review markers'}),
      block('harmony','| 4 | 1 | 6m | 5 |',1020,490,{shapeGroup:'Review markers'})
    );
    song.workbench.progression='| G | D/F# | Em7 | Cadd9 |\n| C | G/B | Am7 | D |';
    song.tuningNote='Visual review: Standard tuning, G shapes, no capo.';
    song.mobileWriteAcceptance={sourceLineId:longLine.id,swapTargetLineId:shortLine.id,targetSectionId:chorus.id,progressionLineId:progression.id};
    song.favourite=true;
    addVersions(song,['Review baseline','Words & Music populated','Chart-ready review']);
    return song;
  }

  const manifest=[
    {key:'last-light',title:'The Last Light On — Working Draft',purpose:'Balanced workflow'},
    {key:'sunday-clothes',title:'Sunday Clothes — Early Idea',purpose:'Plan and early shaping'},
    {key:'nothing-left',title:'Nothing Left to Prove — Lyric Workshop',purpose:'Long lyric editing'},
    {key:'northbound',title:'Northbound — Harmony Workshop',purpose:'Chord editing and Nashville'},
    {key:'halfway-home',title:'Halfway Home — Capo & Transposition',purpose:'Key, shapes, capo and modulation'},
    {key:'paper-crown',title:'Paper Crown — Shape Canvas',purpose:'Spatial movement stress'},
    {key:'stress-test',title:'Long Song Stress Test',purpose:'Scale and performance'},
    {key:'visual-review',title:'Visual Review Song',purpose:'Screenshot and workflow review'}
  ];

  function createLibrary(){sequence=0;return [lastLight(),sundayClothes(),nothingLeft(),northbound(),halfwayHome(),paperCrown(),stressTest(),visualReview()];}
  function createSongByKey(key){return createLibrary().find(song=>song.sandboxKey===key)||createLibrary()[0];}
  return {manifest,createLibrary,createSongByKey};
});
