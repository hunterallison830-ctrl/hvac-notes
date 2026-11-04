'use strict';
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
async function load(){idb=await openIDB();let d=idb?await idbGet():null;
 if(!d){try{d=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}}
 if(d)DB=Object.assign(DB,d);
 if(!DB.locations.length&&!DB.seeded){DB.locations.push({id:uid(),name:'Jewish Academy Atlanta',updated:now()});DB.seeded=true;save(false)}
 if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});}
function save(changed=true){if(changed)DB.dataChanged=now();const s=JSON.parse(JSON.stringify(DB));
 if(idb){try{idb.transaction('kv','readwrite').objectStore('kv').put(s,KEY)}catch(e){}}
 try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){}}
const toast=m=>{const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',2200)};
const loc=id=>DB.locations.find(l=>l.id===id),unit=id=>DB.units.find(u=>u.id===id);
const unitsAt=id=>DB.units.filter(u=>u.locId===id).sort((a,b)=>natCmp(a.tag,b.tag));
const typeOf=u=>u.type==='Other'&&u.customType?u.customType:(u.type||'');
const filtStr=u=>(u.filters||[]).filter(f=>f.size).map(f=>f.size+(f.qty?' ×'+f.qty:'')).join(', ');
const go=h=>{location.hash=h};
// ---- header ----
$('#back').onclick=()=>{const p=location.hash.split('/');if(p[1]==='unit'){const u=unit(p[2]);if(p[3]==='edit'&&u&&!u._new)go('#/unit/'+u.id);else go(u?'#/loc/'+u.locId:'#/')}else if(p[1]==='print'||p[1]==='loc')go(p[1]==='print'?'#/loc/'+p[2]:'#/');else go('#/')};
$('#home').onclick=()=>go('#/');
const setTitle=t=>{$('#title').textContent=t;$('#back').style.visibility=location.hash.length>2?'visible':'hidden'};
function backupBanner(){if(!DB.units.length)return'';const le=DB.lastExport?new Date(DB.lastExport):null;
 if(le&&DB.dataChanged&&new Date(DB.dataChanged)<=le)return'';const days=le?Math.floor((Date.now()-le)/864e5):null;
 if(le&&days<7)return'';return`<div class="warn noprint">💾 Data lives only on this phone. ${le?'Last backup '+days+' days ago.':'Not backed up yet.'} <button class="btn alt" data-act="exportAll" style="min-height:48px">Back up now (export)</button></div>`}
// ---- views ----
function vHome(){setTitle('HVAC Notes');
 app.innerHTML=backupBanner()+`<input id="q" type="search" placeholder="🔍 Search tag, model, serial, filter…" aria-label="Search all units">
 <div id="res"></div><h2>Locations</h2>`+DB.locations.slice().sort((a,b)=>natCmp(a.name,b.name)).map(l=>`<button class="card" data-go="#/loc/${l.id}"><b>${esc(l.name)}</b><div class="sub">${unitsAt(l.id).length} units</div></button>`).join('')+
 `<button class="btn" data-act="addLoc">＋ Add location</button><div class="row"><button class="btn alt" data-act="exportAll">Export all</button><button class="btn alt" data-act="import">Import file</button></div>
 <p class="sub">Saved on this phone only, works offline. Export to back up or share with coworkers.</p>`;
 const q=$('#q');q.oninput=()=>{const s=q.value.trim().toLowerCase();if(!s){$('#res').innerHTML='';return}
  const hits=DB.units.filter(u=>[u.tag,u.model,u.serial,u.make,typeOf(u),u.where,filtStr(u),(u.belts||''),u.notes].join(' ').toLowerCase().includes(s)).sort((a,b)=>natCmp(a.tag,b.tag)).slice(0,50);
  $('#res').innerHTML=hits.length?hits.map(uCard).join(''):'<p class="sub">No matches</p>'};}
const uCard=u=>`<button class="card" data-go="#/unit/${u.id}"><b>${esc(u.tag||'(no tag)')}</b> <span class="sub">${esc(typeOf(u))}</span><div class="sub">${esc([u.where,u.make,u.model].filter(Boolean).join(' · '))}${loc(u.locId)&&location.hash.length<3?' — '+esc(loc(u.locId).name):''}</div>${filtStr(u)?`<div class="sub">Filters: ${esc(filtStr(u))}</div>`:''}</button>`;
function vLoc(id){const l=loc(id);if(!l)return go('#/');setTitle(l.name);const us=unitsAt(id);
 app.innerHTML=`<button class="btn" data-act="addUnit" data-id="${id}">＋ Add unit</button>`+(us.length?us.map(uCard).join(''):'<p class="sub">No units yet. Tap “Add unit” as you walk the building.</p>')+
 `<div class="row"><button class="btn alt" data-act="exportLoc" data-id="${id}">Export / share</button><button class="btn alt" data-go="#/print/${id}">Print / text</button></div>
 <div class="row"><button class="btn alt" data-act="renLoc" data-id="${id}">Rename</button><button class="btn danger" data-act="delLoc" data-id="${id}">Delete</button></div>`}
function kv(k,v,copy){if(!v)return'';return`<div class="kv"><div class="k">${k}</div><div class="v">${esc(v)}</div>${copy?`<button class="copy" data-copy="${esc(v)}">Copy</button>`:''}</div>`}
function vUnit(id){const u=unit(id);if(!u)return go('#/');setTitle(u.tag||'Unit');const l=loc(u.locId);
 app.innerHTML=`<button class="btn" data-go="#/unit/${id}/edit">✎ Edit</button><div class="sub">${esc(l?l.name:'')}</div>`+kv('Tag',u.tag,1)+kv('Type',typeOf(u))+kv('Location',u.where)+kv('Make',u.make)+kv('Model',u.model,1)+kv('Serial',u.serial,1)+kv('Belt(s)',u.belts,1)+
 (u.filters||[]).filter(f=>f.size).map(f=>kv('Filter',f.size+(f.qty?'  ×'+f.qty:''),0)).join('')+(u.custom||[]).filter(c=>c.label||c.value).map(c=>kv(esc(c.label),c.value,1)).join('')+
 (u.notes?`<h2>Notes</h2><div style="white-space:pre-wrap">${esc(u.notes)}</div>`:'')+
 `<h2>Service history</h2><div class="row"><input id="sd" type="date" value="${new Date().toLocaleDateString('en-CA')}" aria-label="Date"><input id="sb" placeholder="By" value="${esc(localStorage.getItem('hvac-by')||'')}" aria-label="By"></div>
 <input id="sw" placeholder="What was done (e.g. changed filters)" aria-label="What was done" style="margin-top:8px"><button class="btn" data-act="addSvc" data-id="${id}">＋ Add service entry</button>`+
 (u.service||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(s=>`<div class="svc"><b>${esc(s.date)}</b> — ${esc(s.by||'')}<div>${esc(s.what)}</div><button class="mini" data-act="delSvc" data-id="${id}" data-s="${s.id}">Delete</button></div>`).join('')+
 `<div class="row" style="margin-top:16px"><button class="btn alt" data-act="dupUnit" data-id="${id}">Duplicate</button><button class="btn danger" data-act="delUnit" data-id="${id}">Delete unit</button></div><p class="sub">Updated ${new Date(u.updated).toLocaleString()}</p>`}
function vEdit(id){const u=unit(id);if(!u)return go('#/');setTitle(u._new?'New unit':'Edit '+(u.tag||'unit'));
 const f=(k,lab,ph='')=>`<label for="f_${k}">${lab}</label><input id="f_${k}" data-k="${k}" value="${esc(u[k])}" placeholder="${ph}" autocapitalize="characters">`;
 const filters=(u.filters&&u.filters.length?u.filters:[{size:'',qty:''}]);
 app.innerHTML=`<form id="ef">`+f('tag','Tag','RTU-1')+`<label for="f_type">Unit type</label><select id="f_type" data-k="type"><option value="">—</option>${TYPES.map(t=>`<option${u.type===t?' selected':''}>${t}</option>`).join('')}</select>
 <div id="ct" ${u.type==='Other'?'':'hidden'}>${f('customType','Custom type','e.g. Cooling tower')}</div>`+f('where','Where it is','Roof, mech room 2…')+f('make','Make','Carrier')+f('model','Model')+f('serial','Serial')+f('belts','Belt size(s)','A42, 4L420')+
 `<label>Filters (size + qty)</label><div id="fl">${filters.map(fRow).join('')}</div><button type="button" class="btn alt" data-act="addF">＋ Filter size</button>
 <label>Custom fields</label><div id="cl">${(u.custom||[]).map(cRow).join('')}</div><button type="button" class="btn alt" data-act="addC">＋ Custom field</button>
 <label for="f_notes">Notes</label><textarea id="f_notes" data-k="notes">${esc(u.notes)}</textarea>
 <button class="btn" type="submit">Save</button><button type="button" class="btn alt" data-act="cancelEdit" data-id="${id}">Cancel</button></form>`;
 $('#f_type').onchange=e=>{$('#ct').hidden=e.target.value!=='Other'};
 $('#ef').onsubmit=e=>{e.preventDefault();app.querySelectorAll('[data-k]').forEach(i=>u[i.dataset.k]=i.value.trim());
  u.filters=[...app.querySelectorAll('.fr')].map(r=>({size:r.children[0].value.trim(),qty:r.children[1].value.trim()})).filter(x=>x.size);
  u.custom=[...app.querySelectorAll('.cr')].map(r=>({label:r.children[0].value.trim(),value:r.children[1].value.trim()})).filter(x=>x.label||x.value);
  delete u._new;u.updated=now();save();toast('Saved');go('#/unit/'+u.id)};
 if(u._new)$('#f_tag').focus()}
const fRow=x=>`<div class="row fr" style="margin:6px 0"><input value="${esc(x.size)}" placeholder="20x25x2" aria-label="Filter size" style="flex:3"><input value="${esc(x.qty)}" placeholder="Qty" inputmode="numeric" aria-label="Qty"><button type="button" class="mini" data-act="rmRow" style="flex:0">✕</button></div>`;
const cRow=x=>`<div class="row cr" style="margin:6px 0"><input value="${esc(x.label)}" placeholder="Label (e.g. Voltage)"><input value="${esc(x.value)}" placeholder="Value"><button type="button" class="mini" data-act="rmRow" style="flex:0">✕</button></div>`;
function vPrint(id){const l=loc(id);if(!l)return go('#/');setTitle('Print: '+l.name);const txt=locText(l);
 app.innerHTML=`<div class="row noprint"><button class="btn" data-act="print">Print</button><button class="btn alt" data-copy="${esc(txt)}">Copy text</button></div><pre>${esc(txt)}</pre>`}
function locText(l){return l.name.toUpperCase()+'\n'+unitsAt(l.id).length+' units — '+new Date().toLocaleDateString()+'\n\n'+unitsAt(l.id).map(u=>[`${u.tag||'(no tag)'}  ${typeOf(u)}`,u.where&&'  Where: '+u.where,(u.make||u.model)&&`  Make/Model: ${[u.make,u.model].filter(Boolean).join(' ')}`,u.serial&&'  Serial: '+u.serial,u.belts&&'  Belts: '+u.belts,filtStr(u)&&'  Filters: '+filtStr(u),...(u.custom||[]).map(c=>`  ${c.label}: ${c.value}`),u.notes&&'  Notes: '+u.notes.replace(/\n/g,' '),(u.service||[]).length&&'  Last service: '+u.service.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0].date+' '+u.service.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0].what].filter(Boolean).join('\n')).join('\n\n')}
// ---- export / import ----
async function exportData(locIds,name){const data={app:'hvac-notes',version:1,exported:now(),locations:DB.locations.filter(l=>!locIds||locIds.includes(l.id)),units:DB.units.filter(u=>!locIds||locIds.includes(u.locId)).map(u=>{const c={...u};delete c._new;return c})};
 const fn=`hvac-${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${new Date().toLocaleDateString('en-CA')}.json`;
 const blob=new Blob([JSON.stringify(data,null,1)],{type:'application/json'});let done=false;
 try{const file=new File([blob],fn,{type:'application/json'});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:fn});done=true}}catch(e){if(e.name==='AbortError')return}
 if(!done){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fn;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
 if(!locIds){DB.lastExport=now();save(false)}toast('Exported '+data.units.length+' units')}
function importText(txt){let d;try{d=JSON.parse(txt)}catch(e){return alert('Not a valid HVAC Notes file.')}
 if(!d||d.app!=='hvac-notes'||!Array.isArray(d.units))return alert('Not a valid HVAC Notes file.');
 const plan={newLoc:[],newU:[],upd:[],keep:0,same:0};
 (d.locations||[]).forEach(l=>{if(!loc(l.id)){const byName=DB.locations.find(x=>x.name.toLowerCase()===String(l.name).toLowerCase());if(byName)l._map=byName.id;else plan.newLoc.push(l)}});
 const mapLoc=id=>{const l=(d.locations||[]).find(x=>x.id===id);return l&&l._map?l._map:id};
 d.units.forEach(u=>{u.locId=mapLoc(u.locId);const ex=unit(u.id);if(!ex)plan.newU.push(u);else if((u.updated||'')>(ex.updated||''))plan.upd.push(u);else if(u.updated===ex.updated)plan.same++;else plan.keep++});
 const msg=`Import summary:\n• ${plan.newLoc.length} new location(s)${plan.newLoc.length?': '+plan.newLoc.map(l=>l.name).join(', '):''}\n• ${plan.newU.length} new unit(s)\n• ${plan.upd.length} unit(s) will be UPDATED (file is newer)${plan.upd.length?': '+plan.upd.map(u=>u.tag).join(', '):''}\n• ${plan.keep} kept (yours is newer)\n• ${plan.same} already identical\n\nApply?`;
 if(!confirm(msg))return;
 plan.newLoc.forEach(l=>{delete l._map;DB.locations.push(l)});plan.newU.forEach(u=>DB.units.push(u));
 plan.upd.forEach(u=>{const i=DB.units.findIndex(x=>x.id===u.id);DB.units[i]=u});
 DB.units.forEach(u=>{if(!loc(u.locId)){const l={id:u.locId,name:'Imported',updated:now()};DB.locations.push(l)}});
 save();toast(`Imported: ${plan.newU.length} new, ${plan.upd.length} updated`);render()}
$('#file').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(importText);e.target.value=''};
// ---- actions ----
const blankUnit=locId=>({id:uid(),locId,tag:'',type:'',customType:'',where:'',make:'',model:'',serial:'',belts:'',filters:[],notes:'',service:[],custom:[],updated:now(),_new:true});
const A={
 addLoc(){const n=prompt('Location name');if(n&&n.trim()){DB.locations.push({id:uid(),name:n.trim(),updated:now()});save();render()}},
 renLoc(id){const l=loc(id),n=prompt('Rename location',l.name);if(n&&n.trim()){l.name=n.trim();l.updated=now();save();render()}},
 delLoc(id){const l=loc(id),c=unitsAt(id).length;if(confirm(`Delete "${l.name}" and its ${c} unit(s)? This cannot be undone. Export first if unsure.`)&&(!c||prompt('Type DELETE to confirm')==='DELETE')){DB.locations=DB.locations.filter(x=>x.id!==id);DB.units=DB.units.filter(u=>u.locId!==id);save();go('#/')}},
 addUnit(id){const u=blankUnit(id);DB.units.push(u);go('#/unit/'+u.id+'/edit')},
 dupUnit(id){const s=unit(id),u=JSON.parse(JSON.stringify(s));u.id=uid();u.serial='';u.service=[];u.updated=now();u._new=true;
  u.tag=(s.tag||'').replace(/(\d+)(?!.*\d)/,m=>String(+m+1));DB.units.push(u);toast('Copied — set the tag & serial');go('#/unit/'+u.id+'/edit')},
 delUnit(id){if(confirm('Delete this unit?')){const u=unit(id);DB.units=DB.units.filter(x=>x.id!==id);save();go('#/loc/'+u.locId)}},
 cancelEdit(id){const u=unit(id);if(u._new){DB.units=DB.units.filter(x=>x.id!==id);go('#/loc/'+u.locId)}else go('#/unit/'+id)},
 addSvc(id){const u=unit(id),w=$('#sw').value.trim();if(!w){$('#sw').focus();return toast('Enter what was done')}const by=$('#sb').value.trim();localStorage.setItem('hvac-by',by);
  (u.service=u.service||[]).push({id:uid(),date:$('#sd').value,what:w,by});u.updated=now();save();toast('Service added');render()},
 delSvc(id,el){const u=unit(id);if(confirm('Delete this service entry?')){u.service=u.service.filter(s=>s.id!==el.dataset.s);u.updated=now();save();render()}},
 addF(){$('#fl').insertAdjacentHTML('beforeend',fRow({size:'',qty:''}))},addC(){$('#cl').insertAdjacentHTML('beforeend',cRow({label:'',value:''}))},
 rmRow(id,el){el.parentNode.remove()},
 exportAll(){exportData(null,'all')},exportLoc(id){exportData([id],loc(id).name)},import(){$('#file').click()},print(){window.print()}};
app.addEventListener('click',e=>{const t=e.target.closest('[data-go],[data-act],[data-copy]');if(!t)return;
 if(t.dataset.copy!==undefined){const v=t.dataset.copy;(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(()=>toast('Copied'),()=>{const ta=document.createElement('textarea');ta.value=v;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Copied')});return}
 if(t.dataset.go)return go(t.dataset.go);e.preventDefault();A[t.dataset.act]&&A[t.dataset.act](t.dataset.id,t)});
function render(){const p=location.hash.split('/');window.scrollTo(0,0);
 if(p[1]==='loc')vLoc(p[2]);else if(p[1]==='unit'&&p[3]==='edit')vEdit(p[2]);else if(p[1]==='unit')vUnit(p[2]);else if(p[1]==='print')vPrint(p[2]);else vHome()}
window.addEventListener('hashchange',()=>{const p=location.hash.split('/');DB.units.filter(u=>u._new&&!(p[1]==='unit'&&p[2]===u.id)).forEach(u=>DB.units.splice(DB.units.indexOf(u),1));render()});
window.__hvac={importText,get DB(){return DB}};
load().then(render);
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
