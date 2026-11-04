import {initializeApp,getAuth,signInAnonymously,onAuthStateChanged,connectAuthEmulator,initializeFirestore,persistentLocalCache,persistentMultipleTabManager,collection,doc,setDoc,getDoc,deleteDoc,onSnapshot,writeBatch,serverTimestamp,connectFirestoreEmulator,getDocsFromServer,waitForPendingWrites,query,where} from './vendor/firebase.js';
import * as T from './tools.js?v=7';
const CFG={apiKey:'AIzaSyBzDl3H0OzCSFEl-sL1wWjr5s2esUH6fqo',authDomain:'hvac-notes.firebaseapp.com',projectId:'hvac-notes',storageBucket:'hvac-notes.firebasestorage.app',messagingSenderId:'315070304695',appId:'1:315070304695:web:9739e6600647bfc7db5832'};
const fbApp=initializeApp(CFG),auth=getAuth(fbApp);
const fdb=initializeFirestore(fbApp,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
// test hook: ?emu=1 on localhost talks to the local Firebase emulators
if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)&&new URLSearchParams(location.search).get('emu')){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(fdb,'127.0.0.1',8080)}
const TYPES=['RTU','AHU','Split/Condenser','Furnace','Boiler','Chiller','Exhaust Fan','MAU','VAV','Other'];
const $=s=>document.querySelector(s),app=$('#app');
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const now=()=>new Date().toISOString();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const natCmp=(a,b)=>String(a||'').localeCompare(String(b||''),undefined,{numeric:true,sensitivity:'base'});
let DB={locations:[],units:[],lastExport:null,dataChanged:null};
// ---- storage: IndexedDB with localStorage fallback ----
let idb=null;const KEY='hvac-notes-db';
function openIDB(){return new Promise(res=>{try{const r=indexedDB.open('hvac-notes',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>res(null)}catch(e){res(null)}})}
function idbGet(){return new Promise(res=>{try{const q=idb.transaction('kv').objectStore('kv').get(KEY);q.onsuccess=()=>res(q.result);q.onerror=()=>res(null)}catch(e){res(null)}})}
// old phone-only data (v1), read once so it can be uploaded to the shared list
async function loadLegacy(){idb=await openIDB();let d=idb?await idbGet():null;
 if(!d){try{d=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}}
 return d&&Array.isArray(d.units)?d:{locations:[],units:[]}}
// ---- shared database (Firestore) ----
const myName=()=>localStorage.getItem('hvac-name')||'';
let pending=0,draft=null;
const LIM={tag:100,type:60,customType:100,where:300,make:200,model:200,serial:200,belts:300,notes:20000,filters:50,custom:100,service:1000};
const UF=['tag','type','customType','where','make','model','serial','belts','filters','notes','service','custom'];
function toDoc(u){const d={locationId:String(u.locId||''),updated:u.updated||now(),updatedAt:serverTimestamp(),updatedBy:String(u.updatedBy??myName()).slice(0,60)};
 UF.forEach(k=>{const v=u[k];d[k]=['filters','service','custom'].includes(k)?(Array.isArray(v)?v.slice(0,LIM[k]):[]):String(v??'').slice(0,LIM[k])});d.locationId=d.locationId.slice(0,64);d.updated=String(d.updated).slice(0,40);return d}
const fromUnit=s=>{const d=s.data();return{...d,id:s.id,locId:d.locationId,_pending:s.metadata.hasPendingWrites}};
const badge=u=>u._pending?'<span class="st wait">⏳ Waiting to upload</span>':'<span class="st ok">✓ Saved</span>';
function track(p){pending++;syncStatus();p.catch(e=>{console.error(e);toast(e.code==='permission-denied'?'Not allowed: '+e.code:'Save failed: '+(e.code||e.message))}).finally(()=>{pending--;syncStatus()})}
function putUnit(u,keepStamp){if(!keepStamp){u.updated=now();u.updatedBy=myName()}track(setDoc(doc(fdb,'units',u.id),toDoc(u)))}
function putLoc(l,keepStamp){if(!keepStamp)l.updated=now();track(setDoc(doc(fdb,'locations',l.id),{name:String(l.name).slice(0,200),updated:l.updated||now(),updatedAt:serverTimestamp(),updatedBy:myName()}))}
async function batchWrite(ops){for(let i=0;i<ops.length;i+=400){const b=writeBatch(fdb);ops.slice(i,i+400).forEach(o=>o(b));track(b.commit())}}
function syncStatus(){const el=$('#sync');if(!el)return;const t=!navigator.onLine?'Offline, will sync':pending>0?'Saving…':'Synced';el.textContent=(t==='Synced'?'● ':'○ ')+t;el.className=t==='Synced'?'ok':t==='Saving…'?'busy':'off'}
addEventListener('online',syncStatus);addEventListener('offline',syncStatus);
const toast=m=>{const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',2200)};
const loc=id=>DB.locations.find(l=>l.id===id),unit=id=>DB.units.find(u=>u.id===id)||(draft&&draft.id===id?draft:null);
const unitsAt=id=>DB.units.filter(u=>u.locId===id).sort((a,b)=>natCmp(a.tag,b.tag));
const typeOf=u=>u.type==='Other'&&u.customType?u.customType:(u.type||'');
const filtStr=u=>(u.filters||[]).filter(f=>f.size).map(f=>f.size+(f.qty?' ×'+f.qty:'')).join(', ');
const go=h=>{location.hash=h};
// ---- header ----
$('#back').onclick=()=>{const p=location.hash.split('/');if(p[1]==='unit'){const u=unit(p[2]);if(p[3]==='edit'&&u&&!u._new)go('#/unit/'+u.id);else go(u?'#/loc/'+u.locId:'#/')}else if(p[1]==='tools'){const u=p[3]&&unit(p[3]);go(u?'#/unit/'+u.id:p.length>2?(p[2]==='guide'?'#/tools/guides':'#/tools'):'#/')}else if(p[1]==='print'||p[1]==='loc')go(p[1]==='print'?'#/loc/'+p[2]:'#/');else go('#/')};
$('#home').onclick=()=>go('#/');
const setTitle=t=>{$('#title').textContent=t;$('#back').style.visibility=location.hash.length>2?'visible':'hidden'};
function backupBanner(){if(!DB.units.length)return'';const le=localStorage.getItem('hvac-lastExport');const days=le?Math.floor((Date.now()-new Date(le))/864e5):null;
 if(le&&days<14)return'';return`<div class="warn noprint">💾 The crew list is shared online. Keep a backup file too. ${le?'Last backup '+days+' days ago.':'Not backed up yet.'} <button class="btn alt" data-act="exportAll" style="min-height:48px">Back up now (export)</button></div>`}
// ---- views ----
function vHome(){setTitle('HVAC Notes');
 app.innerHTML=backupBanner()+`<input id="q" type="search" placeholder="🔍 Search tag, model, serial, filter…" aria-label="Search all units">
 <div id="res"></div><h2>Locations</h2>`+DB.locations.slice().sort((a,b)=>natCmp(a.name,b.name)).map(l=>`<button class="card" data-go="#/loc/${l.id}"><b>${esc(l.name)}</b><div class="sub">${unitsAt(l.id).length} units</div></button>`).join('')+
 `<button class="btn" data-act="addLoc">＋ Add location</button><div class="row"><button class="btn alt" data-act="exportAll">Export all</button>${legacyMissing().length?'<button class="btn alt" data-act="uploadOld" id="uploadOld">Upload this phone\'s old units ('+legacyMissing().length+')</button>':''}<button class="btn alt" data-act="import">Import file</button></div>
 <p class="sub">Shared live with your crew. Works offline and syncs when you're back online. You are <b>${esc(myName()||'(no name)')}</b> <button class="mini" data-act="setName">Change name</button></p>`;
 const q=$('#q');q.oninput=()=>{const s=q.value.trim().toLowerCase();if(!s){$('#res').innerHTML='';return}
  const hits=DB.units.filter(u=>[u.tag,u.model,u.serial,u.make,typeOf(u),u.where,filtStr(u),(u.belts||''),u.notes].join(' ').toLowerCase().includes(s)).sort((a,b)=>natCmp(a.tag,b.tag)).slice(0,50);
  $('#res').innerHTML=hits.length?hits.map(uCard).join(''):'<p class="sub">No matches</p>'};}
const uCard=u=>`<button class="card" data-go="#/unit/${u.id}"><b>${esc(u.tag||'(no tag)')}</b> <span class="sub">${esc(typeOf(u))}</span> ${badge(u)}<div class="sub">${esc([u.where,u.make,u.model].filter(Boolean).join(' · '))}${loc(u.locId)&&(location.hash.length<3||location.hash.startsWith('#/tools'))?' — '+esc(loc(u.locId).name):''}</div>${filtStr(u)?`<div class="sub">Filters: ${esc(filtStr(u))}</div>`:''}</button>`;
let locQ={};const collapsed=new Set(JSON.parse(localStorage.getItem('hvac-collapsed')||'[]'));
const hay=u=>[u.tag,typeOf(u),u.model,u.serial,u.make,u.where,u.belts,filtStr(u),u.notes,...(u.custom||[]).map(c=>c.value)].filter(Boolean).join(' ').toLowerCase();
const tKey=u=>{const t=typeOf(u).trim().toLowerCase();return t&&t!=='other'?t:'other'};
const tLabel=(k,us)=>k==='other'?'Other':(k.length<=4?k.toUpperCase():typeOf(us[0]).trim());
function vLoc(id){const l=loc(id);if(!l)return go('#/');setTitle(l.name);
 app.innerHTML=`<button class="btn" data-act="addUnit" data-id="${id}">＋ Add unit</button><div id="lsw"><div class="sbox"><input id="lq" type="search" placeholder="🔍 Search this location…" aria-label="Search units in this location" autocomplete="off" value="${esc(locQ[id]||'')}"><button id="lqx" class="sx" aria-label="Clear search" type="button">✕</button></div><div id="lcount" class="sub"></div></div><div id="ulist"></div>`+
 `<div class="row"><button class="btn alt" data-act="exportLoc" data-id="${id}">Export / share</button><button class="btn alt" data-go="#/print/${id}">Print / text</button></div>
 <div class="row"><button class="btn alt" data-act="renLoc" data-id="${id}">Rename</button><button class="btn danger" data-act="delLoc" data-id="${id}">Delete</button></div>`;
 const q=$('#lq');let tm;q.oninput=()=>{locQ[id]=q.value;clearTimeout(tm);if(DB.units.length>400)tm=setTimeout(()=>drawList(id),120);else drawList(id)};
 $('#lqx').onclick=()=>{q.value='';locQ[id]='';drawList(id);q.focus()};
 $('#ulist').addEventListener('click',e=>{const sm=e.target.closest('summary');if(!sm||(locQ[id]||'').trim())return;const d=sm.parentNode,k=id+'|'+d.dataset.k;d.open?collapsed.add(k):collapsed.delete(k);localStorage.setItem('hvac-collapsed',JSON.stringify([...collapsed]))});
 document.documentElement.style.setProperty('--barh',$('#bar').offsetHeight+'px');drawList(id)}
function drawList(id){const box=$('#ulist');if(!box)return;const all=unitsAt(id),terms=(locQ[id]||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
 const us=terms.length?all.filter(u=>{const h=hay(u);return terms.every(t=>h.includes(t))}):all;
 $('#lqx').hidden=!terms.length;$('#lcount').textContent=terms.length?`${us.length} of ${all.length} units`:`${all.length} unit${all.length===1?'':'s'}`;
 if(!all.length){box.innerHTML='<p class="sub">No units yet. Tap “Add unit” as you walk the building.</p>';return}
 if(!us.length){box.innerHTML='<p class="sub">No units match.</p>';return}
 const g=new Map();us.forEach(u=>{const k=tKey(u);g.has(k)||g.set(k,[]);g.get(k).push(u)});
 const ks=[...g.keys()].sort((a,b)=>a==='other'?1:b==='other'?-1:natCmp(a,b));
 box.innerHTML=ks.map(k=>{const list=g.get(k),open=terms.length||!collapsed.has(id+'|'+k);return`<details class="grp" data-k="${esc(k)}"${open?' open':''}><summary><span>${esc(tLabel(k,list))}</span><span class="cnt">${list.length}</span></summary>${list.map(uCard).join('')}</details>`}).join('')}
function kv(k,v,copy){if(!v)return'';return`<div class="kv"><div class="k">${k}</div><div class="v">${esc(v)}</div>${copy?`<button class="copy" data-copy="${esc(v)}">Copy</button>`:''}</div>`}
function vUnit(id){const u=unit(id);if(!u)return go('#/');setTitle(u.tag||'Unit');const l=loc(u.locId);
 app.innerHTML=`<button class="btn" data-go="#/unit/${id}/edit">✎ Edit</button><div class="sub">${esc(l?l.name:'')} · ${badge(u)} ${T.pmTag(u)}</div><div class="ubtns"><button class="btn" data-go="#/tools/ts/${id}">🩺 Service call</button><div class="row"><button class="btn alt" data-go="${T.eqFor(u)?'#/tools/guide/'+T.eqFor(u):'#/tools/guides'}">📘 Guide for this type</button><button class="btn alt" data-go="#/tools/charge/${id}">⚖️ Charge calc</button></div></div>`+kv('Tag',u.tag,1)+kv('Type',typeOf(u))+kv('Location',u.where)+kv('Make',u.make)+kv('Model',u.model,1)+kv('Serial',u.serial,1)+kv('Belt(s)',u.belts,1)+kv('Refrigerant',T.cget(u,T.RE_REF))+kv('Factory charge',T.cget(u,T.RE_CHG))+
 (u.filters||[]).filter(f=>f.size).map(f=>kv('Filter',f.size+(f.qty?'  ×'+f.qty:''),0)).join('')+(u.custom||[]).filter(c=>(c.label||c.value)&&!T.RE_REF.test(c.label||'')&&!T.RE_CHG.test(c.label||'')).map(c=>kv(esc(c.label),c.value,1)).join('')+
 (u.notes?`<h2>Notes</h2><div style="white-space:pre-wrap">${esc(u.notes)}</div>`:'')+
 `<h2>Service history</h2><div class="row"><input id="sd" type="date" value="${new Date().toLocaleDateString('en-CA')}" aria-label="Date"><input id="sb" placeholder="By" value="${esc(localStorage.getItem('hvac-by')||myName())}" aria-label="By"></div>
 <input id="sw" placeholder="What was done (e.g. changed filters)" aria-label="What was done" style="margin-top:8px"><button class="btn" data-act="addSvc" data-id="${id}">＋ Add service entry</button>`+
 (u.service||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(s=>`<div class="svc"><b>${esc(s.date)}</b> — ${esc(s.by||'')}<div>${esc(s.what)}</div><button class="mini" data-act="delSvc" data-id="${id}" data-s="${s.id}">Delete</button></div>`).join('')+
 `<div class="row" style="margin-top:16px"><button class="btn alt" data-act="dupUnit" data-id="${id}">Duplicate</button><button class="btn danger" data-act="delUnit" data-id="${id}">Delete unit</button></div><p class="sub">Updated ${u.updated?new Date(u.updated).toLocaleString():''}${u.updatedBy?' · edited by '+esc(u.updatedBy):''}</p>`}
function vEdit(id){const u=unit(id);if(!u)return go('#/');setTitle(u._new?'New unit':'Edit '+(u.tag||'unit'));
 const f=(k,lab,ph='')=>`<label for="f_${k}">${lab}</label><input id="f_${k}" data-k="${k}" value="${esc(u[k])}" placeholder="${ph}" autocapitalize="characters">`;
 const filters=(u.filters&&u.filters.length?u.filters:[{size:'',qty:''}]);
 app.innerHTML=`<form id="ef">`+f('tag','Tag','RTU-1')+`<label for="f_type">Unit type</label><select id="f_type" data-k="type"><option value="">—</option>${TYPES.map(t=>`<option${u.type===t?' selected':''}>${t}</option>`).join('')}</select>
 <div id="ct" ${u.type==='Other'?'':'hidden'}>${f('customType','Custom type','e.g. Cooling tower')}</div>`+f('where','Where it is','Roof, mech room 2…')+f('make','Make','Carrier')+f('model','Model')+f('serial','Serial')+f('belts','Belt size(s)','A42, 4L420')+
 `<div class="row"><div><label for="f_ref">Refrigerant (optional)</label><select id="f_ref"><option value="">—</option>${['R-410A','R-454B','R-32','R-22'].concat(T.cget(u,T.RE_REF)&&!['R-410A','R-454B','R-32','R-22'].includes(T.cget(u,T.RE_REF))?[T.cget(u,T.RE_REF)]:[]).map(r=>`<option${T.cget(u,T.RE_REF)===r?' selected':''}>${esc(r)}</option>`).join('')}</select></div><div><label for="f_chg">Factory charge (optional)</label><input id="f_chg" value="${esc(T.cget(u,T.RE_CHG))}" placeholder="7 lb 6 oz or 118"></div></div>`+
 `<label>Filters (size + qty)</label><div id="fl">${filters.map(fRow).join('')}</div><button type="button" class="btn alt" data-act="addF">＋ Filter size</button>
 <label>Custom fields</label><div id="cl">${(u.custom||[]).filter(c=>!T.RE_REF.test(c.label||'')&&!T.RE_CHG.test(c.label||'')).map(cRow).join('')}</div><button type="button" class="btn alt" data-act="addC">＋ Custom field</button>
 <label for="f_notes">Notes</label><textarea id="f_notes" data-k="notes">${esc(u.notes)}</textarea>
 <button class="btn" type="submit">Save</button><button type="button" class="btn alt" data-act="cancelEdit" data-id="${id}">Cancel</button></form>`;
 $('#f_type').onchange=e=>{$('#ct').hidden=e.target.value!=='Other'};
 $('#ef').onsubmit=e=>{e.preventDefault();app.querySelectorAll('[data-k]').forEach(i=>u[i.dataset.k]=i.value.trim());
  u.filters=[...app.querySelectorAll('.fr')].map(r=>({size:r.children[0].value.trim(),qty:r.children[1].value.trim()})).filter(x=>x.size);
  u.custom=[...app.querySelectorAll('.cr')].map(r=>({label:r.children[0].value.trim(),value:r.children[1].value.trim()})).filter(x=>x.label||x.value);
  const rv=$('#f_ref').value.trim(),cv=$('#f_chg').value.trim().slice(0,100);if(rv)u.custom.push({label:'Refrigerant',value:rv});if(cv)u.custom.push({label:'Factory charge',value:cv});
  delete u._new;if(draft===u){draft=null;DB.units.push(u)}putUnit(u);toast('Saved');go('#/unit/'+u.id)};
 if(u._new)$('#f_tag').focus()}
const fRow=x=>`<div class="row fr" style="margin:6px 0"><input value="${esc(x.size)}" placeholder="20x25x2" aria-label="Filter size" style="flex:3"><input value="${esc(x.qty)}" placeholder="Qty" inputmode="numeric" aria-label="Qty"><button type="button" class="mini" data-act="rmRow" style="flex:0">✕</button></div>`;
const cRow=x=>`<div class="row cr" style="margin:6px 0"><input value="${esc(x.label)}" placeholder="Label (e.g. Voltage)"><input value="${esc(x.value)}" placeholder="Value"><button type="button" class="mini" data-act="rmRow" style="flex:0">✕</button></div>`;
function vPrint(id){const l=loc(id);if(!l)return go('#/');setTitle('Print: '+l.name);const txt=locText(l);
 app.innerHTML=`<div class="row noprint"><button class="btn" data-act="print">Print</button><button class="btn alt" data-copy="${esc(txt)}">Copy text</button></div><pre>${esc(txt)}</pre>`}
function locText(l){return l.name.toUpperCase()+'\n'+unitsAt(l.id).length+' units — '+new Date().toLocaleDateString()+'\n\n'+unitsAt(l.id).map(u=>[`${u.tag||'(no tag)'}  ${typeOf(u)}`,u.where&&'  Where: '+u.where,(u.make||u.model)&&`  Make/Model: ${[u.make,u.model].filter(Boolean).join(' ')}`,u.serial&&'  Serial: '+u.serial,u.belts&&'  Belts: '+u.belts,filtStr(u)&&'  Filters: '+filtStr(u),...(u.custom||[]).map(c=>`  ${c.label}: ${c.value}`),u.notes&&'  Notes: '+u.notes.replace(/\n/g,' '),(u.service||[]).length&&'  Last service: '+u.service.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0].date+' '+u.service.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0].what].filter(Boolean).join('\n')).join('\n\n')}
// ---- export / import ----
async function exportData(locIds,name){const data={app:'hvac-notes',version:1,exported:now(),locations:DB.locations.filter(l=>!locIds||locIds.includes(l.id)),units:DB.units.filter(u=>!locIds||locIds.includes(u.locId)).map(u=>{const c={...u};delete c._new;delete c.updatedAt;delete c.locationId;return c})};
 const fn=`hvac-${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${new Date().toLocaleDateString('en-CA')}.json`;
 const blob=new Blob([JSON.stringify(data,null,1)],{type:'application/json'});let done=false;
 try{const file=new File([blob],fn,{type:'application/json'});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:fn});done=true}}catch(e){if(e.name==='AbortError')return}
 if(!done){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fn;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
 if(!locIds)localStorage.setItem('hvac-lastExport',now());toast('Exported '+data.units.length+' units')}
function importText(txt){let d;try{d=JSON.parse(txt)}catch(e){return alert('Not a valid HVAC Notes file.')}
 if(!d||d.app!=='hvac-notes'||!Array.isArray(d.units))return alert('Not a valid HVAC Notes file.');
 const plan={newLoc:[],newU:[],upd:[],keep:0,same:0};
 (d.locations||[]).forEach(l=>{if(!loc(l.id)){const byName=DB.locations.find(x=>x.name.toLowerCase()===String(l.name).toLowerCase());if(byName)l._map=byName.id;else plan.newLoc.push(l)}});
 const mapLoc=id=>{const l=(d.locations||[]).find(x=>x.id===id);return l&&l._map?l._map:id};
 d.units.forEach(u=>{u.locId=mapLoc(u.locId);const ex=unit(u.id);if(!ex)plan.newU.push(u);else if((u.updated||'')>(ex.updated||''))plan.upd.push(u);else if(u.updated===ex.updated)plan.same++;else plan.keep++});
 const msg=`Import summary:\n• ${plan.newLoc.length} new location(s)${plan.newLoc.length?': '+plan.newLoc.map(l=>l.name).join(', '):''}\n• ${plan.newU.length} new unit(s)\n• ${plan.upd.length} unit(s) will be UPDATED (file is newer)${plan.upd.length?': '+plan.upd.map(u=>u.tag).join(', '):''}\n• ${plan.keep} kept (yours is newer)\n• ${plan.same} already identical\n\nApply?`;
 if(!confirm(msg))return;
 const ops=[],locs=new Set(DB.locations.map(l=>l.id));
 plan.newLoc.forEach(l=>{delete l._map;locs.add(l.id);ops.push(b=>b.set(doc(fdb,'locations',String(l.id)),{name:String(l.name||'Imported').slice(0,200),updated:l.updated||now(),updatedAt:serverTimestamp(),updatedBy:myName()}))});
 [...plan.newU,...plan.upd].forEach(u=>{u.id=String(u.id||uid());if(!locs.has(u.locId)){locs.add(u.locId);ops.push(b=>b.set(doc(fdb,'locations',String(u.locId)),{name:'Imported',updated:now(),updatedAt:serverTimestamp(),updatedBy:myName()}))}
  ops.push(b=>b.set(doc(fdb,'units',u.id),toDoc(u)))});
 batchWrite(ops);toast(`Imported: ${plan.newU.length} new, ${plan.upd.length} updated`);render()}
$('#file').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(importText);e.target.value=''};
// ---- actions ----
const blankUnit=locId=>({id:uid(),locId,tag:'',type:'',customType:'',where:'',make:'',model:'',serial:'',belts:'',filters:[],notes:'',service:[],custom:[],updated:now(),_new:true});
const A={
 addLoc(){const n=prompt('Location name');if(n&&n.trim()){const l={id:uid(),name:n.trim()};putLoc(l)}},
 renLoc(id){const l=loc(id),n=prompt('Rename location',l.name);if(n&&n.trim()){putLoc({...l,name:n.trim()})}},
 setName(){const n=prompt('Your name (shown on your edits)',myName());if(n!==null){localStorage.setItem('hvac-name',n.trim().slice(0,60));render()}},
 delLoc(id){const l=loc(id),c=unitsAt(id).length;if(confirm(`Delete "${l.name}" and its ${c} unit(s)? This cannot be undone. Export first if unsure.`)&&(!c||prompt('Type DELETE to confirm')==='DELETE')){const ids=unitsAt(id).map(u=>u.id);batchWrite([b=>b.delete(doc(fdb,'locations',id)),...ids.map(u=>b=>b.delete(doc(fdb,'units',u)))]);go('#/')}},
 addUnit(id){const u=blankUnit(id);draft=u;go('#/unit/'+u.id+'/edit')},
 dupUnit(id){const s=unit(id),u=JSON.parse(JSON.stringify(s));u.id=uid();u.serial='';u.service=[];u.updated=now();u._new=true;
  u.tag=(s.tag||'').replace(/(\d+)(?!.*\d)/,m=>String(+m+1));delete u.updatedBy;draft=u;toast('Copied — set the tag & serial');go('#/unit/'+u.id+'/edit')},
 delUnit(id){const u=unit(id);if(confirm(`Delete ${u.tag||'this unit'} for the whole crew? This cannot be undone.`)){track(deleteDoc(doc(fdb,'units',id)));go('#/loc/'+u.locId)}},
 cancelEdit(id){const u=unit(id);if(u._new){draft=null;go('#/loc/'+u.locId)}else go('#/unit/'+id)},
 addSvc(id){const u=unit(id),w=$('#sw').value.trim();if(!w){$('#sw').focus();return toast('Enter what was done')}const by=$('#sb').value.trim();localStorage.setItem('hvac-by',by);
  (u.service=u.service||[]).push({id:uid(),date:$('#sd').value,what:w,by});putUnit(u);toast('Service added');render()},
 delSvc(id,el){const u=unit(id);if(confirm('Delete this service entry?')){u.service=u.service.filter(s=>s.id!==el.dataset.s);putUnit(u);render()}},
 addF(){$('#fl').insertAdjacentHTML('beforeend',fRow({size:'',qty:''}))},addC(){$('#cl').insertAdjacentHTML('beforeend',cRow({label:'',value:''}))},
 rmRow(id,el){el.parentNode.remove()},
 exportAll(){exportData(null,'all')},uploadOld(){if(confirm(`Upload ${legacyMissing().length} unit(s) saved only on this phone?`))uploadLegacy()},exportLoc(id){exportData([id],loc(id).name)},import(){$('#file').click()},print(){window.print()}};
app.addEventListener('click',e=>{const t=e.target.closest('[data-go],[data-act],[data-copy]');if(!t)return;
 if(t.dataset.copy!==undefined){const v=t.dataset.copy;(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(()=>toast('Copied'),()=>{const ta=document.createElement('textarea');ta.value=v;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Copied')});return}
 if(t.dataset.go)return go(t.dataset.go);e.preventDefault();A[t.dataset.act]&&A[t.dataset.act](t.dataset.id,t)});
function render(keep){if(!started)return vGate();const p=location.hash.split('/');if(!keep)window.scrollTo(0,0);
 if(p[1]==='loc')vLoc(p[2]);else if(p[1]==='unit'&&p[3]==='edit')vEdit(p[2]);else if(p[1]==='unit')vUnit(p[2]);else if(p[1]==='print')vPrint(p[2]);else if(p[1]==='tools')T.render(p);else vHome();
 document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('on',(p[1]==='tools')===(a.dataset.n==='tools')))}
window.addEventListener('hashchange',()=>{const p=location.hash.split('/');if(draft&&!(p[1]==='unit'&&p[2]===draft.id))draft=null;render()});
T.init({app,DB:()=>DB,unit,loc,unitsAt,typeOf,filtStr,esc,go,setTitle,putUnit,toast,myName,uid,natCmp,uCard});
window.__hvac={importText,get DB(){return DB},get pending(){return pending}};
// live refresh without wiping a form someone is typing in
function refresh(){if(!started)return;if(T.busy())return;if(/^#\/loc\//.test(location.hash)&&$('#ulist')){drawList(location.hash.split('/')[2]);return}const a=document.activeElement;if(location.hash.includes('/edit')||(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&a.value))return;render(true)}
// ---- passcode gate + boot ----
let started=false,me=null,meP=null,gateMsg='';
function vGate(){setTitle('HVAC Notes');$('#back').style.visibility='hidden';
 app.innerHTML=`<h2>Join your crew</h2><p class="sub">Enter the crew passcode once on this phone.</p>
 <form id="gf"><label for="g_code">Crew passcode</label><input id="g_code" autocomplete="off" autocapitalize="none" spellcheck="false" required>
 <label for="g_name">Your name (shown on your edits)</label><input id="g_name" value="${esc(myName())}" placeholder="e.g. Mike">
 <button class="btn" type="submit">Join</button></form><p id="gmsg" class="sub">${esc(gateMsg)}</p>`;
 $('#gf').onsubmit=async e=>{e.preventDefault();const code=$('#g_code').value.trim(),name=$('#g_name').value.trim().slice(0,60);if(!code)return;
  if(!me)me=await meP.catch(()=>null);if(!me)return(gm('No internet. Connect once to join.'));
  gm('Checking…');localStorage.setItem('hvac-name',name);
  try{await setDoc(doc(fdb,'members',me.uid),{code,name,joined:serverTimestamp()});localStorage.setItem('hvac-member',me.uid);begin()}
  catch(err){gm(err.code==='permission-denied'?'Wrong passcode. Try again.':'Could not join: '+(err.code||err.message))}}}
const gm=m=>{gateMsg=m;const e=$('#gmsg');if(e)e.textContent=m};
async function boot(){render();
 me=await (meP=new Promise(r=>{const off=onAuthStateChanged(auth,u=>{if(u){off();r(u)}});setTimeout(()=>{if(!auth.currentUser)signInAnonymously(auth).catch(e=>{gateMsg='No internet. Connect once to join the crew.';render()})},50)}));
 if(localStorage.getItem('hvac-member')===me.uid)return begin();
 try{const m=await getDoc(doc(fdb,'members',me.uid));if(m.exists()){localStorage.setItem('hvac-member',me.uid);return begin()}}catch(e){}
 if(!$('#gf'))render()}
let gotL=false,gotU=false,firstDone=false;
function begin(){if(started)return;started=true;render();syncStatus();
 onSnapshot(collection(fdb,'locations'),{includeMetadataChanges:true},s=>{DB.locations=s.docs.map(d=>({id:d.id,...d.data()}));if(!s.metadata.fromCache)gotL=true;after()},e=>toast('Sync error: '+e.code));
 onSnapshot(collection(fdb,'units'),{includeMetadataChanges:true},s=>{DB.units=s.docs.map(fromUnit);if(!s.metadata.fromCache)gotU=true;after()},e=>toast('Sync error: '+e.code))}
function after(){syncStatus();if(gotL&&gotU&&!firstDone){firstDone=true;firstSync()}refresh()}
// ---- old phone-only (v1) units: find any not yet in the shared list ----
let LEGACY={locations:[],units:[]},upBusy=false;
const upDone=()=>{try{return new Set(JSON.parse(localStorage.getItem('hvac-uploaded-ids')||'[]'))}catch(e){return new Set()}};
function legacyMissing(){const have=new Set(DB.units.map(u=>u.id)),done=upDone();return LEGACY.units.filter(u=>u&&u.id&&!have.has(String(u.id))&&!done.has(String(u.id)))}
async function uploadLegacy(){const miss=legacyMissing();if(!miss.length||upBusy)return;upBusy=true;
 try{const byName={};DB.locations.forEach(l=>{byName[String(l.name).trim().toLowerCase()]=l.id});
  const ops=[],map={};
  (LEGACY.locations||[]).forEach(l=>{const nm=String(l.name||'').trim().slice(0,200)||'Imported location',k=nm.toLowerCase();
   if(!byName[k]){let id=String(l.id||uid()).slice(0,64);if(DB.locations.some(x=>x.id===id))id=uid();byName[k]=id;
    ops.push(b=>b.set(doc(fdb,'locations',id),{name:nm,updated:String(l.updated||now()).slice(0,40),updatedAt:serverTimestamp(),updatedBy:myName().slice(0,60)}))}
   map[l.id]=byName[k]});
  miss.forEach(u=>{let li=map[u.locId];if(!li){const k='imported units';if(!byName[k]){const id=uid();byName[k]=id;ops.push(b=>b.set(doc(fdb,'locations',id),{name:'Imported units',updated:now(),updatedAt:serverTimestamp(),updatedBy:myName().slice(0,60)}))}li=byName[k]}
   const c={...u,locId:li};ops.push(b=>b.set(doc(fdb,'units',String(u.id).slice(0,64)),toDoc(c)))});
  for(let i=0;i<ops.length;i+=400){const b=writeBatch(fdb);ops.slice(i,i+400).forEach(o=>o(b));const pr=b.commit();track(pr);await pr}
  const done=upDone();miss.forEach(u=>done.add(String(u.id)));localStorage.setItem('hvac-uploaded-ids',JSON.stringify([...done]));
  toast('Uploaded '+miss.length+' unit(s)')}
 catch(e){console.error(e);toast('Upload failed, try again: '+(e.code||e.message))}
 finally{upBusy=false;refresh()}}
async function firstSync(){LEGACY=await loadLegacy();const miss=legacyMissing();
 if(miss.length&&confirm(`Upload ${miss.length} unit(s) saved only on this phone?`))await uploadLegacy();
 if(!DB.locations.length)putLoc({id:'jewish-academy-atlanta',name:'Jewish Academy Atlanta'});
 refresh()}
boot();
// ---- Auto-update (v7) ----
if('serviceWorker'in navigator){const sw=navigator.serviceWorker;let hadCtl=!!sw.controller,reloading=false;
 sw.register('sw.js?v=7',{updateViaCache:'none'}).then(r=>{const up=()=>{if(navigator.onLine)r.update().catch(()=>{})};up();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')up()});addEventListener('focus',up);addEventListener('online',up);
  if(r.waiting)r.waiting.postMessage('skip')}).catch(()=>{});
 sw.addEventListener('controllerchange',()=>{if(!hadCtl){hadCtl=true;return}if(reloading)return;
  if(typeof formOpen==='function'&&formOpen()){const b=document.getElementById('rbanner');clearTimeout(rb.t);b.className='warn';b.textContent='Update ready, tap to reload';b.hidden=false;b.style.cursor='pointer';b.onclick=()=>{if(!formOpen()||confirm('Reload now? Unsaved typing will be lost.')){reloading=true;location.reload()}};return}
  reloading=true;location.reload()})}

// ---- Refresh / "did it save?" check (no page reload, never wipes an open form) ----
const formOpen=()=>{const a=document.activeElement;return location.hash.includes('/edit')||!!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&a.id!=='q'&&a.value)};
const tmo=(p,ms)=>Promise.race([p.then(()=>true),new Promise(r=>setTimeout(()=>r(false),ms))]);
function rb(cls,msg){const b=$('#rbanner');b.className=cls;b.textContent=msg;b.hidden=false;clearTimeout(rb.t);if(cls!=='busy')rb.t=setTimeout(()=>b.hidden=true,15000)}
async function swCheck(){try{if(!('serviceWorker'in navigator)||!navigator.onLine)return false;const r=await navigator.serviceWorker.getRegistration();if(!r)return false;
 await tmo(r.update(),5000);const w=r.installing||r.waiting;if(!w)return false;
 if(w.state!=='activated')await new Promise(res=>{const t=setTimeout(res,6000);w.addEventListener('statechange',()=>{if(w.state==='activated'){clearTimeout(t);res()}})});return true}catch(e){return false}}
let rBusy=false;
async function doRefresh(){if(rBusy)return;
 if(!started){location.reload();return}
 const open=formOpen();
 if(open&&!confirm('You have an edit open that is NOT saved yet.\n\nTap Save first if you want it checked.\n\nCheck the server anyway? (Your typing stays, nothing is reloaded.)'))return;
 rBusy=true;const btn=$('#refresh');btn.disabled=true;rb('busy','Checking with server…');
 try{const p=location.hash.split('/');let scope=null;
  if(p[1]==='loc'||p[1]==='print')scope=p[2];else if(p[1]==='unit'){const u=unit(p[2]);scope=u?u.locId:null}
  const upd=swCheck();
  const flushed=navigator.onLine?await tmo(waitForPendingWrites(fdb),8000):false;
  let srv=null;
  if(navigator.onLine){try{const q=scope?query(collection(fdb,'units'),where('locationId','==',scope)):collection(fdb,'units');
   srv=await Promise.race([getDocsFromServer(q),new Promise((_,j)=>setTimeout(()=>j(new Error('timeout')),10000))])}catch(e){console.warn(e);srv=null}}
  const inScope=u=>!scope||u.locId===scope;
  const waiting=()=>Math.max(pending,DB.units.filter(u=>u._pending).length);
  const matches=()=>{const local=DB.units.filter(inScope);if(local.length!==srv.size)return false;const m=new Map(local.map(u=>[u.id,u.updated]));return srv.docs.every(d=>m.get(d.id)===d.data().updated)};
  if(srv&&!matches())await new Promise(r=>setTimeout(r,1500)); // let live sync catch up
  if(!open)render(true);
  const t=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),w=waiting(),where_=scope&&loc(scope)?' at '+loc(scope).name:'';
  if(!srv)rb(w?'bad':'warn',navigator.onLine?`Couldn't reach server${w?' – '+w+' change(s) waiting to upload':''}. Checked ${t}`:`Not saved yet – offline${w?', '+w+' change(s) waiting':''}. They upload when you have signal. Checked ${t}`);
  else if(w||!flushed)rb('warn',`Not saved yet – ${w||'some'} change(s) waiting (offline / weak signal?). Checked ${t}`);
  else if(!matches())rb('warn',`Server had newer info – screen updated. ${srv.size} units on server${where_}. Checked ${t}`);
  else rb('good',`All saved ✓ – ${srv.size} unit${srv.size===1?'':'s'} on server${where_}, checked ${t}`);
  if(await upd){if(formOpen())rb('warn','New app version ready – save your edit, then tap Refresh again to load it.');else{rb('busy','New app version – loading…');setTimeout(()=>location.reload(),1200)}}
 }finally{rBusy=false;btn.disabled=false}}
$('#refresh').onclick=doRefresh;$('#rbanner').onclick=()=>$('#rbanner').hidden=true;
