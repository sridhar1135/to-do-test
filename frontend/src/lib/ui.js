// @ts-nocheck
/*
 * The app UI, ported from the approved UX mockup (ux-mockup/todo-mockup.html).
 * Same markup, wording and interactions; the mockup's localStorage sample data is
 * replaced by the real store (IndexedDB + sync to the FastAPI backend).
 * Layout: "phone" (iPhone/iPad portrait) under 900px wide, "desk" (Mac/browser) above.
 */
import {
  S, liveTasks, liveTags, liveSaved, saveTask, deleteTask, saveTag, saveSaved,
  startSync, syncStatus, syncNow
} from './store';

/* ---------- utilities ---------- */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SVG={
  inbox:'<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.6 5h12.8L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z"/>',
  today:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  cal:'<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  tag:'<path d="M3 11.6V4a1 1 0 0 1 1-1h7.6l9.1 9.1a1 1 0 0 1 0 1.4l-7.2 7.2a1 1 0 0 1-1.4 0z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  done:'<circle cx="12" cy="12" r="9"/><path d="m8.2 12.2 2.6 2.6 5-5.6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  filter:'<path d="M4 5h16l-6.2 7.6V19l-3.6-1.8v-4.6z"/>',
  bookmark:'<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
  sync:'<path d="M20 11a8 8 0 0 0-14.3-4.2L4 9M4 4v5h5M4 13a8 8 0 0 0 14.3 4.2L20 15M20 20v-5h-5"/>',
  chev:'<path d="m6 9 6 6 6-6"/>'
};
const ic=n=>'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+SVG[n]+'</svg>';
const DAY=864e5;
const today0=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const addDays=n=>{const d=today0();d.setDate(d.getDate()+n);return iso(d)};
const parseIso=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const dayDiff=s=>Math.round((parseIso(s)-today0())/DAY);
const shortDate=s=>parseIso(s).toLocaleDateString('en-US',{month:'short',day:'numeric'});
function fmtDue(s){const n=dayDiff(s);
  if(n===0)return'Today'; if(n===1)return'Tomorrow'; if(n===-1)return'Yesterday';
  if(n>1&&n<7)return parseIso(s).toLocaleDateString('en-US',{weekday:'long'});
  return shortDate(s);}
function ago(ts){const m=Math.round((Date.now()-ts)/6e4); if(m<1)return'just now'; if(m<60)return m+' min ago'; const h=Math.round(m/60); if(h<24)return h+' hr ago'; return Math.round(h/24)+' days ago';}
const COLORS=['t1','t2','t3','t4','t5','t6','t7','t8'];
const TITLES={inbox:'Inbox',today:'Today',upcoming:'Next 7 days',done:'Completed',tags:'Tags'};

/* ---------- state ---------- */
const ui={
  phone:{view:'inbox',filter:[],mode:'any',sheet:null,task:null,picker:false,pq:'',qa:'',caret:0,sug:0,noSug:false,showDone:false,added:null,focus:null},
  desk:{view:'inbox',filter:[],mode:'any',task:null,picker:false,pq:'',qa:'',caret:0,sug:0,noSug:false,showDone:false,focus:null}
};
let lastAdded={id:null,at:0};
let root=null, dev='phone';

const tagOf=n=>liveTags().find(t=>t.name===n);
const taskById=id=>liveTasks().find(t=>t.id===id);
const sortedTags=()=>liveTags().slice().sort((a,b)=>a.name.localeCompare(b.name));
function normTag(s){return String(s).toLowerCase().trim().replace(/^#+/,'').replace(/\s+/g,'-').replace(/[^\p{L}\p{N}_\-\/]/gu,'').replace(/\/{2,}/g,'/').replace(/^\/+|\/+$/g,'');}
function ensureTag(raw){const n=normTag(raw); if(!n)return null; let path='';
  n.split('/').forEach((p,i)=>{path=i?path+'/'+p:p; if(!tagOf(path)){const parent=i?tagOf(path.slice(0,path.lastIndexOf('/'))):null;
    const old=S.tags.find(t=>t.name===path);
    const color=parent?parent.color:COLORS[liveTags().filter(t=>!t.name.includes('/')).length%COLORS.length];
    if(old){old.deleted_at=null;saveTag(old);}else saveTag({name:path,color,updated_at:'',deleted_at:null});}});
  return n;}
const hasTag=(t,f)=>t.tags.some(x=>x===f||x.startsWith(f+'/'));
const matches=(t,u)=>!u.filter.length||(u.mode==='all'?u.filter.every(f=>hasTag(t,f)):u.filter.some(f=>hasTag(t,f)));
const countTag=n=>liveTasks().filter(t=>!t.done&&hasTag(t,n)).length;
const dd=t=>t.due?dayDiff(t.due):999;
const sortT=(a,b)=>(b.pri-a.pri)||(dd(a)-dd(b))||(b.created-a.created);

function groups(u){
  const all=liveTasks();
  const open=all.filter(t=>!t.done&&matches(t,u)).sort(sortT);
  if(u.view==='inbox'){const un=open.filter(t=>!t.tags.length),tg=open.filter(t=>t.tags.length);
    const g=[]; if(un.length)g.push({label:'Needs a tag',note:'captured, not sorted yet',tasks:un}); if(tg.length)g.push({label:un.length?'Tagged':'',tasks:tg}); return g;}
  if(u.view==='today'){const o=open.filter(t=>t.due&&dd(t)<0),td=open.filter(t=>t.due&&dd(t)===0);const g=[];
    if(o.length)g.push({label:'Overdue',tasks:o}); if(td.length)g.push({label:'Today',tasks:td}); return g;}
  if(u.view==='upcoming'){const m=new Map(); open.filter(t=>t.due&&dd(t)>=0&&dd(t)<=6).sort((a,b)=>dd(a)-dd(b)||b.pri-a.pri).forEach(t=>{if(!m.has(t.due))m.set(t.due,[]);m.get(t.due).push(t)});
    return [...m].map(([d,ts])=>({label:fmtDue(d),note:dayDiff(d)>1?shortDate(d):'',tasks:ts}));}
  if(u.view==='done'){const d=all.filter(t=>t.done&&matches(t,u)).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));return d.length?[{label:'',tasks:d}]:[];}
  return [];
}
const counts=()=>{const all=liveTasks(),open=all.filter(t=>!t.done);return{inbox:open.length,today:open.filter(t=>t.due&&dd(t)<=0).length,upcoming:open.filter(t=>t.due&&dd(t)>=0&&dd(t)<=6).length,done:all.length-open.length};};

/* ---------- quick-add parsing (same rules as backend/app/services.py) ---------- */
const WD=['sun','mon','tue','wed','thu','fri','sat'],WDF=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function dateWord(w){w=w.toLowerCase().replace(/[.,]$/,'');
  if(w==='today'||w==='tonight')return addDays(0);
  if(w==='tomorrow'||w==='tmrw'||w==='tmr')return addDays(1);
  let i=WD.indexOf(w); if(i<0)i=WDF.indexOf(w);
  if(i>=0){const n=(i-new Date().getDay()+7)%7||7;return addDays(n);} return null;}
export function parse(text){const out={title:'',tags:[],pri:0,due:null};const rest=[];
  text.trim().split(/\s+/).filter(Boolean).forEach(w=>{let m;
    if((m=w.match(/^#([\p{L}\p{N}_\-\/]+)$/u))){const n=normTag(m[1]);if(n&&!out.tags.includes(n))out.tags.push(n);}
    else if((m=w.match(/^!([1-3]|low|med|medium|high)$/i))){const v=m[1].toLowerCase();out.pri=v==='low'?1:v[0]==='m'?2:v==='high'?3:+v;}
    else if(!out.due&&dateWord(w))out.due=dateWord(w);
    else rest.push(w);});
  out.title=rest.join(' ');return out;}
function withDefaults(p,u){p.fromFilter=[];p.dueFromView=false;
  if(!p.tags.length&&u.filter.length&&(u.filter.length===1||u.mode==='all')){p.tags=u.filter.slice();p.fromFilter=u.filter.slice();}
  if(!p.due&&u.view==='today'){p.due=addDays(0);p.dueFromView=true;}
  return p;}
function suggestions(u){if(u.noSug)return null;const before=u.qa.slice(0,u.caret==null?u.qa.length:u.caret);
  const m=before.match(/(?:^|\s)#([\p{L}\p{N}_\-\/]*)$/u); if(!m)return null; const q=m[1].toLowerCase();
  const list=liveTags().filter(t=>t.name.includes(q)).sort((a,b)=>((a.name.startsWith(q)?0:1)-(b.name.startsWith(q)?0:1))||a.name.localeCompare(b.name)).slice(0,6).map(t=>({name:t.name,isNew:false}));
  const nq=normTag(q); if(nq&&!tagOf(nq))list.push({name:nq,isNew:true});
  return list.length?list:null;}

/* ---------- pieces ---------- */
function tagLabel(name){const i=name.lastIndexOf('/');return '<span class="hash">#</span>'+(i>=0?'<span class="tp">'+esc(name.slice(0,i+1))+'</span>'+esc(name.slice(i+1)):esc(name));}
function chip(name,kind,extra){const t=tagOf(name);const c=t?t.color:'t8';const st=' style="--c:var(--'+c+')"';extra=extra||'';
  if(kind==='remove')return '<span class="tag lg"'+st+'>'+tagLabel(name)+'<button class="tag-x" data-act="rmtag:'+esc(name)+'" aria-label="Remove tag '+esc(name)+'">'+ic('x')+'</button></span>';
  if(kind==='unfilter')return '<span class="tag lg"'+st+'>'+tagLabel(name)+'<button class="tag-x" data-act="ftag:'+esc(name)+'" aria-label="Stop filtering by '+esc(name)+'">'+ic('x')+'</button></span>';
  if(kind==='static')return '<span class="tag"'+st+'>'+tagLabel(name)+extra+'</span>';
  return '<button class="tag"'+st+' data-act="ftag-only:'+esc(name)+'" title="Show only #'+esc(name)+'">'+tagLabel(name)+'</button>';}
function row(t,u,dev){
  const n=t.due?dayDiff(t.due):null;
  const due=t.due?'<span class="due '+(n<0&&!t.done?'over':n===0?'today':'')+'">'+ic('cal')+fmtDue(t.due)+'</span>':'';
  const tags=t.tags.map(x=>chip(x,'filter')).join('');
  const add=!t.tags.length&&!t.done?'<button class="addtag" data-act="quicktag:'+t.id+'">+ tag</button>':'';
  const cls=['row',t.done?'done':'',dev==='desk'&&u.task===t.id?'sel':'',lastAdded.id===t.id&&Date.now()-lastAdded.at<1500?'new':''].join(' ');
  const pl=['','Low','Medium','High'][t.pri];
  const imp=t.pri?'<span class="imp p'+t.pri+'" title="'+pl+' importance"><i></i>'+pl+'</span>':'';
  return '<div class="'+cls+'" data-act="open:'+t.id+'" data-row="'+t.id+'">'+
    '<button class="check p'+t.pri+(t.done?' done':'')+'" data-act="toggle:'+t.id+'" aria-label="'+(t.done?'Mark not done':'Complete')+(pl?' ('+pl+' importance)':'')+'">'+ic('check')+'</button>'+
    '<div class="row-body"><div class="row-title">'+esc(t.title)+'</div><div class="row-meta">'+imp+due+tags+add+'</div></div></div>';}
function modeSeg(u){return '<span class="seg" role="group" aria-label="Match"><button class="'+(u.mode==='any'?'on':'')+'" data-act="fmode:any">Any</button><button class="'+(u.mode==='all'?'on':'')+'" data-act="fmode:all">All</button></span>';}
function emptyMsg(u){if(u.filter.length)return 'No open tasks match '+u.filter.map(f=>'#'+esc(f)).join(u.mode==='all'?' and ':' or ')+' here.';
  return {inbox:'Inbox is clear. Add something with +.',today:'Nothing due today.',upcoming:'Nothing due in the next 7 days.',done:'No completed tasks yet.'}[u.view]||'';}
function listBody(u,dev){const gs=groups(u);const total=gs.reduce((a,g)=>a+g.tasks.length,0);
  let h=gs.map(g=>(g.label?'<div class="glabel"><span>'+g.label+(g.note?' <small>· '+g.note+'</small>':'')+'</span><span>'+g.tasks.length+'</span></div>':'')+g.tasks.map(t=>row(t,u,dev)).join('')).join('');
  if(!total)h+='<div class="empty">'+emptyMsg(u)+'</div>';
  if(u.view==='inbox'||u.view==='today'){const d=liveTasks().filter(t=>t.done&&matches(t,u));
    if(d.length){h+='<button class="done-toggle" data-act="showdone">'+ic(u.showDone?'chev':'done')+(u.showDone?'Hide completed':'Completed · '+d.length)+'</button>';
      if(u.showDone)h+=d.map(t=>row(t,u,dev)).join('');}}
  return {html:h,total};}
function previewHTML(u){
  if(!u.qa.trim())return '<span>Try <code>Call plumber tomorrow #home !high</code></span>';
  const p=withDefaults(parse(u.qa),u);
  let h='<span class="pv-title">'+(p.title?esc(p.title):'<i>Add a title</i>')+'</span>';
  p.tags.forEach(n=>{h+=chip(n,'static',!tagOf(n)?'<em>new</em>':p.fromFilter.includes(n)?'<em>from filter</em>':'');});
  if(p.due)h+='<span class="pv-chip">'+ic('cal')+fmtDue(p.due)+'</span>';
  if(p.pri)h+='<span class="imp p'+p.pri+'"><i></i>'+['','Low','Medium','High'][p.pri]+'</span>';
  if(!p.tags.length)h+='<span class="pv-note">no tag yet, goes under Needs a tag</span>';
  return h;}
function pickerList(u,t){if(!t)return'';const q=normTag(u.pq);
  let h=sortedTags().filter(x=>!q||x.name.includes(q)).map(x=>{const d=q?0:x.name.split('/').length-1;
    return '<button class="pk'+(t.tags.includes(x.name)?' on':'')+'" data-act="tagpick:'+esc(x.name)+'" data-keep><span class="ind" style="--d:'+d+'"></span><span class="box">'+ic('check')+'</span>'+chip(x.name,'static')+'<span class="n">'+countTag(x.name)+'</span></button>';}).join('');
  if(q&&!tagOf(q))h+='<button class="pk create" data-act="tagcreate" data-keep>'+ic('plus')+'Create '+chip(q,'static')+'</button>';
  return h||'<div class="empty">No tags yet. Type a name to create one.</div>';}
function picker(u,t,dev){return '<div class="picker"><input data-in="pick" id="'+dev+'-pick" placeholder="Find or create a tag" autocomplete="off" value="'+esc(u.pq)+'"><div class="pk-list" data-slot="pick-list">'+pickerList(u,t)+'</div></div>';}
function dueSeg(t){const opts=[['','None'],['0','Today'],['1','Tomorrow'],['7','Next week']];const cur=t.due==null?'':String(dayDiff(t.due));
  let h=opts.map(([v,l])=>'<button class="'+(cur===v?'on':'')+'" data-act="due:'+v+'">'+l+'</button>').join('');
  if(t.due&&!opts.some(o=>o[0]===cur))h+='<button class="on" disabled>'+fmtDue(t.due)+'</button>';
  return '<div class="seg">'+h+'</div>';}
function priSeg(t){return '<div class="seg">'+['None','Low','Medium','High'].map((l,i)=>'<button class="'+(t.pri===i?'on':'')+'" data-act="pri:'+i+'"><span class="pd p'+i+'"></span>'+l+'</button>').join('')+'</div>';}
function tagFields(u,t,dev){return '<div class="field"><div class="flabel">Tags</div><div class="chips">'+t.tags.map(x=>chip(x,'remove')).join('')+
  '<button class="addtag" data-act="picker">'+(u.picker?'Close':'+ Add tag')+'</button></div>'+(u.picker?picker(u,t,dev):'')+'</div>';}

/* ---------- iPhone / iPad ---------- */
function phoneHTML(){const u=ui.phone;let body;
  if(u.view==='tags'){
    body='<header class="ph-head"><h2 class="ph-title">Tags</h2></header><p class="ph-sub">Tap a tag to see its tasks. Tags with a slash sit under their parent.</p>'+
      (liveTags().length?'':'<div class="empty">No tags yet. Add one with #name when you create a task.</div>')+
      sortedTags().map(t=>{const d=t.name.split('/').length-1,leaf=t.name.slice(t.name.lastIndexOf('/')+1);
        return '<button class="tl-item" data-act="ptag:'+esc(t.name)+'" style="--c:var(--'+t.color+');--d:'+d+'"><i class="dot"></i><span>'+esc(leaf)+'</span><span class="n">'+countTag(t.name)+'</span></button>';}).join('')+
      (liveSaved().length?'<div class="glabel" style="margin-top:24px"><span>Saved filters</span></div>'+
      liveSaved().map(s=>'<button class="saved-item" data-act="saved:'+s.id+'">'+ic('bookmark')+'<span>'+esc(s.name)+'</span></button>').join(''):'');
  } else {
    const L=listBody(u,'phone');
    const chips=liveTags().length?'<div class="chiprow"><button class="fchip'+(u.filter.length?'':' on')+'" data-act="fclear">All</button>'+
      sortedTags().map(t=>'<button class="fchip'+(u.filter.includes(t.name)?' on':'')+'" style="--c:var(--'+t.color+')" data-act="ftag:'+esc(t.name)+'"><i class="dot"></i>#'+esc(t.name)+' <span>'+countTag(t.name)+'</span></button>').join('')+'</div>':'';
    const fl=u.filter.length?'<div class="fline"><span><b>'+L.total+'</b> tagged '+u.filter.map(f=>'#'+esc(f)).join(u.mode==='all'?' and ':' or ')+'</span>'+(u.filter.length>1?modeSeg(u):'')+'<button class="link" data-act="fsave">Save</button><button class="link" data-act="fclear">Clear</button></div>':'';
    body='<header class="ph-head"><h2 class="ph-title">'+TITLES[u.view]+'</h2><span class="ph-count">'+L.total+'</span></header>'+chips+fl+L.html;
  }
  const tabs=[['inbox','inbox','Inbox'],['today','today','Today'],['upcoming','cal','Next 7'],['tags','tag','Tags']].map(([v,i,l])=>'<button class="'+(u.view===v||(v==='inbox'&&u.view==='done')?'on':'')+'" data-act="view:'+v+'">'+ic(i)+l+'</button>').join('');
  let sheet='';
  if(u.sheet==='qa'){
    const dest=withDefaults(parse(''),u);
    sheet='<div class="scrim" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-label="Quick add"><div class="grab"></div>'+
      '<div class="qa-label">New task · '+(dest.fromFilter.length?'tagged '+dest.fromFilter.map(f=>'#'+esc(f)).join(' '):'Inbox')+(dest.dueFromView?', due today':'')+'</div>'+
      '<div class="sug-row" data-slot="qa-sug"></div>'+
      '<div class="qa-box"><input data-in="qa" id="phone-qa" placeholder="What needs doing?" autocomplete="off" enterkeyhint="done" value="'+esc(u.qa)+'"><button class="qa-go" data-act="qa-add" data-keep aria-label="Add task">'+ic('plus')+'</button></div>'+
      '<div class="qa-preview" data-slot="qa-preview"></div>'+
      '<div class="qa-tools"><button data-act="qa-ins:#" data-keep><b>#</b> Tag</button><button data-act="qa-ins:tomorrow" data-keep>Tomorrow</button><button data-act="qa-ins:!high" data-keep><b>!</b> Importance</button></div>'+
      (u.added?'<div class="qa-added">'+ic('check')+'Added “'+esc(u.added)+'”. Keep typing to add another.</div>':'')+'</div>';
  } else if(u.sheet==='task'){
    const t=taskById(u.task);
    if(t)sheet='<div class="scrim" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-label="Task details"><div class="grab"></div>'+
      '<div class="sheet-head"><button class="check p'+t.pri+(t.done?' done':'')+'" data-act="toggle:'+t.id+'" aria-label="Complete">'+ic('check')+'</button><textarea class="t-title" data-in="title" id="phone-title" rows="2">'+esc(t.title)+'</textarea></div>'+
      tagFields(u,t,'phone')+
      '<div class="field"><div class="flabel">Due</div>'+dueSeg(t)+'</div>'+
      '<div class="field"><div class="flabel">Importance</div>'+priSeg(t)+'</div>'+
      '<div class="field"><div class="flabel">Notes</div><textarea class="notes" data-in="notes" id="phone-notes" placeholder="Add notes">'+esc(t.notes||'')+'</textarea></div>'+
      '<div class="sheet-foot"><button class="link danger" data-act="del">Delete task</button><button class="btn" data-act="sheet-close">Done</button></div></div>';
    else u.sheet=null;
  }
  return '<div class="ph">'+
    '<div class="ph-scroll">'+body+'</div>'+
    (u.view!=='tags'?'<button class="fab" data-act="qa-open" aria-label="Quick add a task">'+ic('plus')+'</button>':'')+
    '<nav class="ph-tabs">'+tabs+'</nav>'+sheet+'</div>';
}

/* ---------- Mac / desktop browser ---------- */
function syncFoot(){const s=syncStatus();
  if(s.state==='offline')return '<div class="side-foot"><i class="off"></i>Offline · changes saved on this device</div>';
  if(s.state==='error')return '<div class="side-foot"><i class="err"></i>Can’t reach the server · <button class="link" data-act="sync">Retry</button></div>';
  if(!s.lastSync)return '<div class="side-foot"><i class="off"></i>Syncing…</div>';
  return '<div class="side-foot"><i></i>Synced '+ago(s.lastSync)+'</div>';}
function deskHTML(){const u=ui.desk,c=counts(),L=listBody(u,'desk');
  const smart=[['inbox','inbox'],['today','today'],['upcoming','cal'],['done','done']].map(([v,i])=>'<button class="side-item'+(u.view===v?' on':'')+'" data-act="view:'+v+'">'+ic(i)+TITLES[v]+'<span class="n">'+c[v]+'</span></button>').join('');
  const tags=sortedTags().map(t=>{const d=t.name.split('/').length-1,i=t.name.lastIndexOf('/');
    return '<button class="side-item ftag'+(u.filter.includes(t.name)?' on':'')+'" style="--c:var(--'+t.color+');--d:'+d+'" data-act="stag:'+esc(t.name)+'"><i class="dot"></i><span>'+esc(t.name.slice(i+1))+'</span><span class="n">'+countTag(t.name)+'</span></button>';}).join('');
  const saved=liveSaved().map(s=>'<button class="side-item" data-act="saved:'+s.id+'">'+ic('bookmark')+'<span>'+esc(s.name)+'</span></button>').join('');
  const fbar=u.filter.length?'<div class="fbar">'+ic('filter')+'<span>Tagged</span>'+u.filter.map(f=>chip(f,'unfilter')).join(u.filter.length>1?'<span>'+(u.mode==='all'?'and':'or')+'</span>':'')+(u.filter.length>1?modeSeg(u):'')+'<span class="sp"></span><button class="link" data-act="fsave">Save filter</button><button class="link" data-act="fclear">Clear</button></div>':'';
  const t=taskById(u.task);
  const detail=t?'<div class="sheet-head"><button class="check p'+t.pri+(t.done?' done':'')+'" data-act="toggle:'+t.id+'" aria-label="Complete">'+ic('check')+'</button><textarea class="t-title" data-in="title" id="desk-title" rows="2">'+esc(t.title)+'</textarea></div>'+
      tagFields(u,t,'desk')+
      '<div class="field"><div class="flabel">Due</div>'+dueSeg(t)+'</div>'+
      '<div class="field"><div class="flabel">Importance</div>'+priSeg(t)+'</div>'+
      '<div class="field"><div class="flabel">Notes</div><textarea class="notes" data-in="notes" id="desk-notes" placeholder="Add notes">'+esc(t.notes||'')+'</textarea></div>'+
      '<div class="dt-foot"><span>Added '+ago(t.created)+'</span><button class="link danger" data-act="del">Delete</button></div>'
    :'<div class="dk-empty">'+ic('tag')+'<p>Select a task to edit its tags, due date and importance.</p></div>';
  const dest=withDefaults(parse(''),u);
  const ph='Add to '+(dest.fromFilter.length?dest.fromFilter.map(f=>'#'+f).join(' '):'Inbox')+'. Use #tag, tomorrow, !high';
  return '<div class="dk"><aside class="dk-side">'+smart+
    '<div class="side-h"><span>Tags</span><small>⌘-click to combine</small></div>'+(tags||'<div class="side-h"><small>Add #tags in quick add</small></div>')+
    (saved?'<div class="side-h"><span>Saved filters</span></div>'+saved:'')+
    syncFoot()+'</aside>'+
  '<main class="dk-main"><div class="dk-head"><h2>'+TITLES[u.view]+'</h2><span class="n">'+L.total+(u.view==='done'?'':' open')+'</span></div>'+
    (u.view!=='done'?'<div class="dk-qa-wrap"><div class="dk-qa"><span class="qa-plus">'+ic('plus')+'</span><input data-in="qa" id="desk-qa" placeholder="'+esc(ph)+'" autocomplete="off" value="'+esc(u.qa)+'"><kbd>Enter</kbd></div><div class="sug-pop" data-slot="qa-sug"></div><div class="qa-preview" data-slot="qa-preview"></div></div>':'')+
    fbar+'<div class="dk-list">'+L.html+'</div></main>'+
  '<section class="dk-detail">'+detail+'</section></div>';
}

/* ---------- render ---------- */
function fillQA(){const u=ui[dev];
  const pv=root.querySelector('[data-slot="qa-preview"]'); if(pv)pv.innerHTML=previewHTML(u);
  const sg=root.querySelector('[data-slot="qa-sug"]'); if(sg){const s=suggestions(u); if(s&&u.sug>=s.length)u.sug=0;
    sg.innerHTML=s?s.map((x,i)=>'<button class="sug'+(i===u.sug?' on':'')+'" data-act="sug:'+esc(x.name)+'" data-keep>'+(x.isNew?'<span class="sug-new">Create</span>':'')+chip(x.name,'static')+'<small>'+(x.isNew?'new tag':countTag(x.name)+' open')+'</small></button>').join(''):'';}}
function render(){
  const keep=['.ph-scroll','.dk-list','.pk-list','.dk-side','.sheet','.dk-detail'].map(s=>{const e=root.querySelector(s);return [s,e?e.scrollTop:0];});
  root.className='app '+dev; root.dataset.dev=dev;
  root.innerHTML=dev==='phone'?phoneHTML():deskHTML();
  keep.forEach(([s,v])=>{const e=root.querySelector(s);if(e)e.scrollTop=v;});
  fillQA();
  const u=ui[dev];
  if(u.focus){const el=root.querySelector(u.focus);u.focus=null;if(el){el.focus({preventScroll:true});if(el.dataset.in==='qa'&&el.setSelectionRange)el.setSelectionRange(u.caret,u.caret);}}
}
/** Re-render unless the person is typing in a text field (avoids losing the caret mid-word). */
function renderSoft(){const a=document.activeElement;
  if(a&&root.contains(a)&&a.dataset&&a.dataset.in){const foot=root.querySelector('.side-foot');if(foot)foot.outerHTML=syncFoot();return;}
  render();}
let toastTimer;
function flashSync(){const el=document.getElementById('sync-toast');if(!el)return;
  el.innerHTML=ic('sync')+'Synced from another device';el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1500);}

function setQAInput(){const el=root.querySelector('[data-in="qa"]');if(!el)return;el.value=ui[dev].qa;el.focus();el.setSelectionRange(ui[dev].caret,ui[dev].caret);}
function applySug(name){const u=ui[dev];const c=u.caret==null?u.qa.length:u.caret;
  let before=u.qa.slice(0,c),after=u.qa.slice(c);
  before=before.replace(/#[^\s#]*$/u,'#'+name+' ');after=after.replace(/^\S+/,'').replace(/^\s+/,'');
  u.qa=before+after;u.caret=before.length;u.sug=0;setQAInput();fillQA();}
function insertQA(txt){const u=ui[dev];const c=u.caret==null?u.qa.length:u.caret;const before=u.qa.slice(0,c),after=u.qa.slice(c);
  const sp=before&&!/\s$/.test(before)?' ':'';const tail=txt==='#'?'':' ';
  u.qa=before+sp+txt+tail+after;u.caret=(before+sp+txt+tail).length;u.noSug=false;u.sug=0;setQAInput();fillQA();}
function addTask(){const u=ui[dev];const p=withDefaults(parse(u.qa),u);if(!p.title)return;
  const tags=[...new Set(p.tags.map(ensureTag).filter(Boolean))];
  const id=crypto.randomUUID();
  saveTask({id,title:p.title,tags,due:p.due,pri:p.pri,done:false,doneAt:null,notes:'',created:Date.now(),updated_at:'',deleted_at:null});
  lastAdded={id,at:Date.now()};u.qa='';u.caret=0;u.sug=0;u.noSug=false;
  if(dev==='phone')u.added=p.title;
  u.focus='[data-in="qa"]';render();}
function addTagToTask(t,n){if(!t.tags.includes(n)){t.tags.push(n);saveTask(t);}}
function createTagFromPicker(){const u=ui[dev],t=taskById(u.task);const n=ensureTag(u.pq);if(!n||!t)return;
  addTagToTask(t,n);u.pq='';u.focus='[data-in="pick"]';render();}
function toggleFilter(u,n){const i=u.filter.indexOf(n);if(i<0)u.filter.push(n);else u.filter.splice(i,1);}
function onlyFilter(u,n){u.filter=(u.filter.length===1&&u.filter[0]===n)?[]:[n];}

function act(cmd,arg,e){const u=ui[dev];const t=taskById(u.task);
  switch(cmd){
    case 'view':u.view=arg;u.showDone=false;u.sheet=null;render();break;
    case 'toggle':{const k=taskById(arg);if(k){k.done=!k.done;k.doneAt=k.done?Date.now():null;saveTask(k);render();}break;}
    case 'open':u.task=arg;u.picker=false;u.pq='';if(dev==='phone')u.sheet='task';render();break;
    case 'quicktag':u.task=arg;u.picker=true;u.pq='';if(dev==='phone')u.sheet='task';u.focus='[data-in="pick"]';render();break;
    case 'ftag':toggleFilter(u,arg);render();break;
    case 'ftag-only':onlyFilter(u,arg);u.sheet=null;if(u.view==='tags')u.view='inbox';render();break;
    case 'stag':if(e.metaKey||e.ctrlKey||e.shiftKey)toggleFilter(u,arg);else onlyFilter(u,arg);render();break;
    case 'ptag':u.filter=[arg];u.view='inbox';render();break;
    case 'fmode':u.mode=arg;render();break;
    case 'fclear':u.filter=[];render();break;
    case 'fsave':if(u.filter.length){saveSaved({id:crypto.randomUUID(),name:u.filter.map(f=>'#'+f).join(u.mode==='all'?' + ':' or '),tags:u.filter.slice(),mode:u.mode,updated_at:'',deleted_at:null});render();}break;
    case 'saved':{const s=liveSaved().find(x=>x.id===arg);if(s){u.filter=s.tags.slice();u.mode=s.mode;if(u.view==='tags'||u.view==='done')u.view='inbox';render();}break;}
    case 'qa-open':u.sheet='qa';u.added=null;u.focus='[data-in="qa"]';render();break;
    case 'sheet-close':u.sheet=null;u.picker=false;render();break;
    case 'qa-add':addTask();break;
    case 'sug':applySug(arg);break;
    case 'qa-ins':insertQA(arg);break;
    case 'showdone':u.showDone=!u.showDone;render();break;
    case 'picker':u.picker=!u.picker;u.pq='';u.focus=u.picker?'[data-in="pick"]':null;render();break;
    case 'tagpick':if(t){const i=t.tags.indexOf(arg);if(i<0)t.tags.push(arg);else t.tags.splice(i,1);saveTask(t);render();}break;
    case 'tagcreate':createTagFromPicker();break;
    case 'rmtag':if(t){t.tags=t.tags.filter(x=>x!==arg);saveTask(t);render();}break;
    case 'due':if(t){t.due=arg===''?null:addDays(+arg);saveTask(t);render();}break;
    case 'pri':if(t){t.pri=+arg;saveTask(t);render();}break;
    case 'del':if(t){deleteTask(t);u.task=null;u.sheet=null;render();}break;
    case 'sync':void syncNow();break;
  }}

function devFromEvent(e){return root&&root.contains(e.target)?dev:null;}
function bind(){
  document.addEventListener('mousedown',e=>{if(e.target.closest('[data-keep]'))e.preventDefault();});
  document.addEventListener('click',e=>{if(!devFromEvent(e))return;
    const qa=e.target.closest('[data-in="qa"]');if(qa)ui[dev].caret=qa.selectionStart;
    const el=e.target.closest('[data-act]');if(!el||el.disabled)return;const a=el.dataset.act,i=a.indexOf(':');
    act(i<0?a:a.slice(0,i),i<0?'':a.slice(i+1),e);});
  let textTimer;
  document.addEventListener('input',e=>{const el=e.target,k=el.dataset&&el.dataset.in;if(!k||!devFromEvent(e))return;const u=ui[dev];
    if(k==='qa'){u.qa=el.value;u.caret=el.selectionStart;u.sug=0;u.noSug=false;u.added=null;fillQA();const ad=root.querySelector('.qa-added');if(ad)ad.remove();}
    else if(k==='pick'){u.pq=el.value;const l=root.querySelector('[data-slot="pick-list"]');if(l)l.innerHTML=pickerList(u,taskById(u.task));}
    else if(k==='title'||k==='notes'){const t=taskById(u.task);if(!t)return;t[k]=el.value;
      if(k==='title'){const r=root.querySelector('[data-row="'+t.id+'"] .row-title');if(r)r.textContent=t.title;}
      clearTimeout(textTimer);textTimer=setTimeout(()=>saveTask(t),300);}});
  document.addEventListener('keyup',e=>{const el=e.target;if(el.dataset&&el.dataset.in==='qa'&&/^Arrow(Left|Right)$|^Home$|^End$/.test(e.key)){ui[dev].caret=el.selectionStart;fillQA();}});
  document.addEventListener('keydown',e=>{const el=e.target,k=el.dataset&&el.dataset.in;if(!k||!devFromEvent(e))return;const u=ui[dev];
    if(k==='qa'){if(e.isComposing)return;const s=suggestions(u);
      if(s){if(e.key==='ArrowDown'){e.preventDefault();u.sug=(u.sug+1)%s.length;fillQA();return;}
        if(e.key==='ArrowUp'){e.preventDefault();u.sug=(u.sug-1+s.length)%s.length;fillQA();return;}
        if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();applySug(s[u.sug].name);return;}
        if(e.key==='Escape'){u.noSug=true;fillQA();return;}}
      if(e.key==='Enter'){e.preventDefault();addTask();}
      else if(e.key==='Escape'&&dev==='phone'){u.sheet=null;render();}}
    else if(k==='pick'){
      if(e.key==='Enter'){e.preventDefault();const n=normTag(u.pq),t=taskById(u.task);if(!n||!t)return;
        if(tagOf(n)){addTagToTask(t,n);u.pq='';u.focus='[data-in="pick"]';render();}else createTagFromPicker();}
      else if(e.key==='Escape'){u.picker=false;render();}}
    else if(k==='title'&&e.key==='Enter'){e.preventDefault();el.blur();}});
}

/** Mount the app into `el`. Call once, after loadLocal(). */
export function mount(el){
  root=el;
  const mq=window.matchMedia('(min-width: 900px)');
  dev=mq.matches?'desk':'phone';
  mq.addEventListener('change',()=>{dev=mq.matches?'desk':'phone';render();});
  bind();
  render();
  startSync(()=>{renderSoft();flashSync();},()=>{if(dev==='desk')renderSoft();});
  setInterval(()=>{if(dev==='desk')renderSoft();},60_000); // keep "Synced N min ago" fresh
}
