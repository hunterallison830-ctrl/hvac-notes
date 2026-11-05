// Tools tab: FieldBench guides, charge calc, lineset chart, troubleshoot, parts, PM. All offline.
import {t as EQUIP,r as SYMPTOMS0,n as GUIDES,a as guideById} from './vendor/fb-catalog.js';
import {LIQUID_SIZES,SUCTION_SIZES,REFRIGERANTS,REFRIGERANT_LIST,MAKERS,MAKER_LIST,TONNAGE,calcCharge,fmtLbOz,fmtNum,refrigerantNotes,systemNotes,CHECKLISTS,liquidRate,tableRate} from './vendor/fb-charge.js';
export const FB_TS='https://zephyr-kind-polar-lotus.grok.me/troubleshoot';
const WHO={anyone:'Anyone',helper:'Helper',tech:'Licensed tech',setup:'Setup'};
const SYMPTOMS=[...SYMPTOMS0,{id:'no-air',name:'No airflow'}];
const PM_DAYS=90;
let X;// context from app.js
const st={q:'',gq:'',ch:{sys:'split',ref:'r410a',mk:'typical',liq:'3/8',len:50,oz:118,tab:'recover',done:{},unit:null},
 ls:{sys:'split',mk:'typical',ref:'r410a',tons:3,liq:'3/8',suc:'3/4',len:50,pre:15,oz:118,out:'level',rise:0,fit:false},
 ts:{unit:null,eq:'',sym:'',done:{},findings:'',parts:''}};
// Working-on selection (location → unit), kept across Tools subpages via sessionStorage
const WK='hvac-working';
const wk=(()=>{try{return Object.assign({locId:'',unitId:'',lq:'',uq:'',mode:''},JSON.parse(sessionStorage.getItem(WK)||'{}'))}catch(e){return{locId:'',unitId:'',lq:'',uq:'',mode:''}}})();
const wkSave=()=>{try{sessionStorage.setItem(WK,JSON.stringify({locId:wk.locId,unitId:wk.unitId}))}catch(e){}};
function wkSetUnit(u){if(!u){wk.unitId='';wkSave();return}wk.locId=u.locId;wk.unitId=u.id;wk.mode='';wkSave()}
function ensureLoc(){if(wk.locId&&X.loc(wk.locId))return;const ls=X.DB().locations;if(ls.length===1){wk.locId=ls[0].id;wkSave()}else if(wk.locId){wk.locId='';wk.unitId='';wkSave()}}
function locPickList(){const t=wk.lq.trim().toLowerCase().split(/\s+/).filter(Boolean);let ls=X.DB().locations.slice().sort((a,b)=>X.natCmp(a.name,b.name));
 if(t.length)ls=ls.filter(l=>t.every(w=>String(l.name).toLowerCase().includes(w)));
 return ls.length?ls.map(l=>`<button type="button" class="card" data-t="wkLoc" data-v="${E(l.id)}"><b>${E(l.name)}</b><div class="sub">${X.unitsAt(l.id).length} units</div></button>`).join(''):'<p class="sub">No locations match.</p>'}
function unitPickList(){if(!wk.locId)return'<p class="sub">Pick a location first.</p>';
 const t=wk.uq.trim().toLowerCase().split(/\s+/).filter(Boolean);let us=X.unitsAt(wk.locId);
 if(t.length)us=us.filter(u=>{const h=[u.tag,X.typeOf(u),u.model,u.serial,u.make,u.where].join(' ').toLowerCase();return t.every(w=>h.includes(w))});
 return us.length?us.slice(0,80).map(u=>`<button type="button" class="card" data-t="wkUnit" data-v="${E(u.id)}"><b>${E(u.tag||'(no tag)')}</b> <span class="sub">${E(X.typeOf(u))}</span><div class="sub">${E([u.where,u.make,u.model].filter(Boolean).join(' · '))}</div></button>`).join(''):'<p class="sub">No units match.</p>'}
function workBar(){ensureLoc();
 const l=wk.locId&&X.loc(wk.locId),u=wk.unitId&&X.unit(wk.unitId);
 if(wk.unitId&&!u){wk.unitId='';wkSave()}
 if(wk.locId&&!l){wk.locId='';wk.unitId='';wkSave()}
 if(u&&wk.locId!==u.locId){wk.locId=u.locId;wkSave()}
 document.documentElement.style.setProperty('--barh',(document.getElementById('bar')?.offsetHeight||64)+'px');
 let h=`<div class="work" id="work"><div class="whead"><b>Working on</b>${(wk.locId||wk.unitId)&&!wk.mode?`<button type="button" class="mini wclr" data-t="wkClear">Clear</button>`:''}</div>`;
 h+=`<button type="button" class="pickbtn" data-t="wkMode" data-v="loc"><span class="plab"><span class="pnum">1</span>${l?`<span class="ch">${E(l.name)}</span>`:`<span class="ph">Location</span>`}</span><span class="pcaret">▾</span></button>`;
 h+=`<button type="button" class="pickbtn" data-t="wkMode" data-v="unit"${l?'':' disabled'}><span class="plab"><span class="pnum">2</span>${u?`<span class="ch">${E(u.tag||'(no tag)')}</span> <span class="sub">${E(X.typeOf(u))}</span>`:`<span class="ph">${l?'Unit':'Pick location first'}</span>`}</span><span class="pcaret">▾</span></button>`;
 if(u){const last=lastSvc(u);
  h+=`<div class="wcard"><div class="wtop"><b>${E(u.tag||'(no tag)')}</b> · ${E(X.typeOf(u)||'?')} ${pmTag(u)}</div>
  <div class="sub">${E([u.where,u.make,u.model&&'Model '+u.model,u.serial&&'S/N '+u.serial].filter(Boolean).join(' · '))}</div>
  <div class="sub">${E([u.belts&&'Belt '+u.belts,X.filtStr(u)&&'Filters '+X.filtStr(u),cget(u,RE_REF),cget(u,RE_CHG)&&'Charge '+cget(u,RE_CHG)].filter(Boolean).join(' · '))||'No belt / filter / refrigerant on record'}</div>
  ${last?`<div class="sub">Last service: ${E(last.date)} — ${E(last.what)}</div>`:'<div class="sub">No service logged yet</div>'}
  <div class="wacts">
   <button type="button" class="btn" data-go="#/tools/ts/${u.id}">🩺 Service call</button>
   <button type="button" class="btn alt" data-go="${eqFor(u)?'#/tools/guide/'+eqFor(u):'#/tools/guides'}">📘 Guide</button>
   <button type="button" class="btn alt" data-go="#/tools/charge/${u.id}">⚖️ Charge</button>
   <button type="button" class="btn alt" data-t="wkAi">📋 Copy for AI</button>
  </div>
  <button type="button" class="mini wopen" data-go="#/unit/${u.id}">Open unit sheet →</button></div>`}
 h+='</div>';return h}
function sheet(){if(wk.mode!=='loc'&&wk.mode!=='unit')return'';const l=wk.locId&&X.loc(wk.locId),isL=wk.mode==='loc';
 return`<div class="wsheet" role="dialog" aria-modal="true" aria-label="${isL?'Pick location':'Pick unit'}"><div class="wshead"><div class="wsrow"><button type="button" class="mini wscancel" data-t="wkMode" data-v="">Cancel</button><b class="wstitle">${isL?'1. Location':'2. Unit'+(l?' · '+E(l.name):'')}</b>${isL?'':`<button type="button" class="mini wscancel" data-t="wkMode" data-v="loc">Site</button>`}</div>
 ${isL?`<input id="wlq" type="search" enterkeyhint="search" placeholder="Search locations…" value="${E(wk.lq)}" autocomplete="off" aria-label="Search locations">`:`<input id="wuq" type="search" enterkeyhint="search" placeholder="Tag, type, model…" value="${E(wk.uq)}" autocomplete="off" aria-label="Search units">`}</div>
 <div id="${isL?'wll':'wul'}" class="wsbody">${isL?locPickList():unitPickList()}</div></div>`}
const paint=html=>{X.app.innerHTML=workBar()+html+sheet();document.body.classList.toggle('sheet-open',!!wk.mode)};
export const cget=(u,re)=>((u.custom||[]).find(c=>re.test(c.label||''))||{}).value||'';
export const RE_REF=/^refrigerant$/i,RE_CHG=/^factory charge/i;
export function refId(s){s=String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');return s.includes('410')?'r410a':s.includes('454')?'r454b':/^r?32$/.test(s)?'r32':/^r?22$/.test(s)?'r22':''}
export function chargeOz(s){s=String(s||'').toLowerCase();if(!s.trim())return null;const lb=s.match(/([\d.]+)\s*(lb|lbs|#)/),oz=s.match(/([\d.]+)\s*oz/),kg=s.match(/([\d.]+)\s*kg/);
 if(kg)return Math.round(+kg[1]*35.274*10)/10;if(lb||oz)return(lb?+lb[1]*16:0)+(oz?+oz[1]:0);const n=parseFloat(s);return isFinite(n)?n:null}
export function eqFor(u){const t=(X.typeOf(u)||'').toLowerCase();
 if(/mini|ductless/.test(t))return'mini-split';if(/heat ?pump/.test(t))return'heat-pump';if(/walk|cooler|freezer/.test(t))return'walk-in';
 if(/rtu|roof|mau|make.?up|package/.test(t))return t.includes('package')?'package':'rtu';if(/ahu|air handler|vav|exhaust|fan/.test(t))return'commercial-ahu';
 if(/split|condens/.test(t))return'split-ac';if(/furnace/.test(t))return'gas-furnace';if(/boiler|hydronic/.test(t))return'boiler';if(/chiller|tower/.test(t))return'chiller';return''}
const lastSvc=u=>(u.service||[]).filter(s=>s.date).slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
const daysSince=d=>Math.floor((Date.now()-new Date(d+'T12:00:00'))/864e5);
export function pmTag(u){const s=lastSvc(u);if(!s)return'<span class="st wait">No service logged</span>';const d=daysSince(s.date);
 return d>PM_DAYS?`<span class="st wait">PM due · last ${X.esc(s.date)} (${d}d)</span>`:`<span class="st ok">Serviced ${X.esc(s.date)} (${Math.max(0,d)}d)</span>`}
const E=s=>X.esc(s),opt=(v,cur,l)=>`<option value="${E(v)}"${String(v)===String(cur)?' selected':''}>${E(l??v)}</option>`;
const seg=(name,cur,items)=>`<div class="seg" role="group">${items.map(([v,l])=>`<button type="button" class="${String(v)===String(cur)?'on':''}" data-t="set" data-f="${name}" data-v="${E(v)}">${E(l)}</button>`).join('')}</div>`;
export function unitSummary(u,sym){const l=X.loc(u.locId),last=(u.service||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,3);
 return['HVAC unit: '+(u.tag||'(no tag)')+' — '+(X.typeOf(u)||'type ?'),l&&'Site: '+l.name,u.where&&'Where: '+u.where,(u.make||u.model)&&'Make/model: '+[u.make,u.model].filter(Boolean).join(' '),u.serial&&'Serial: '+u.serial,
 u.belts&&'Belts: '+u.belts,X.filtStr(u)&&'Filters: '+X.filtStr(u),cget(u,RE_REF)&&'Refrigerant: '+cget(u,RE_REF),cget(u,RE_CHG)&&'Factory charge: '+cget(u,RE_CHG),sym&&'Symptom: '+sym,
 last.length&&'Recent service:\n'+last.map(s=>'- '+s.date+' '+s.what).join('\n')].filter(Boolean).join('\n')}
function copyText(v){return (navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).catch(()=>{const ta=document.createElement('textarea');ta.value=v;document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove()})}

export function init(ctx){X=ctx;addEventListener('hashchange',()=>{if(!location.hash.startsWith('#/tools')){wk.mode='';document.body.classList.remove('sheet-open')}});X.app.addEventListener('click',onClick);X.app.addEventListener('input',onInput);X.app.addEventListener('change',onInput)}
export const busy=()=>/^#\/tools\/(charge|ts|lineset)/.test(location.hash);
export function render(p){const v=p[2]||'';
 // Keep Working-on in sync when a unit is opened via Service call / Charge deep link
 if((v==='ts'||v==='charge')&&p[3]){const u=X.unit(p[3]);if(u)wkSetUnit(u)}
 (({'':vHome,guides:vGuides,guide:vGuide,charge:vCharge,lineset:vLineset,ts:vTs,parts:vParts,pm:vPm})[v]||vHome)(p)}

function vHome(){X.setTitle('Tools');const locs=X.DB().locations;
 paint(`<label for="tq">Quick tag search (all locations)</label><input id="tq" placeholder="RTU-3, serial, model…" value="${E(st.q)}" autocomplete="off"><div id="tqr"></div>
 <div class="tgrid"><button class="tile" data-go="#/tools/ts">🩺<b>Troubleshoot</b><span>Symptom → guide steps</span></button><button class="tile" data-go="#/tools/guides">📘<b>Guides</b><span>10 equipment guides</span></button>
 <button class="tile" data-go="#/tools/charge">⚖️<b>Charge calc</b><span>Recover · vacuum · charge</span></button><button class="tile" data-go="#/tools/lineset">📏<b>Lineset chart</b><span>oz/ft tables</span></button>
 <button class="tile" data-go="#/tools/pm">🗓️<b>PM due</b><span>Last serviced</span></button><button class="tile" data-t="parts">🧾<b>Parts list</b><span>Belts &amp; filters</span></button></div>
 ${locs.length>1?`<div id="plocs" hidden>${locs.map(l=>`<button class="card" data-go="#/tools/parts/${l.id}"><b>${E(l.name)}</b> <span class="sub">parts list</span></button>`).join('')}</div>`:''}
 <button class="btn alt" data-t="ai">🤖 AI troubleshoot (FieldBench)</button><p class="sub">Opens FieldBench online. Everything else in Tools works offline. Guides and rates come from FieldBench — always confirm against the unit's IOM and nameplate.</p>`);
 drawTq()}
function drawTq(){const b=document.getElementById('tqr');if(!b)return;const t=st.q.trim().toLowerCase().split(/\s+/).filter(Boolean);if(!t.length){b.innerHTML='';return}
 const r=X.DB().units.filter(u=>{const h=[u.tag,u.serial,u.model,X.typeOf(u)].join(' ').toLowerCase();return t.every(w=>h.includes(w))}).sort((a,b)=>X.natCmp(a.tag,b.tag));
 b.innerHTML=`<p class="sub" id="tqc">${r.length} match${r.length===1?'':'es'}</p>`+r.slice(0,40).map(X.uCard).join('')}

function vGuides(){X.setTitle('Guides');const q=st.gq.trim().toLowerCase();
 paint(`<input id="gq" placeholder="Search guides (e.g. belt, defrost, ice)" value="${E(st.gq)}" autocomplete="off" aria-label="Search guides"><div id="gl"></div>`);drawGuides()}
function drawGuides(){const b=document.getElementById('gl');if(!b)return;const t=st.gq.trim().toLowerCase().split(/\s+/).filter(Boolean);let out='';
 for(const grp of['Commercial','Residential']){const gs=EQUIP.filter(e=>e.group===grp).map(e=>[e,guideById(e.id)]).filter(([e,g])=>{if(!t.length)return true;const h=[e.name,e.blurb,g.title,g.summary,...g.safety,...g.steps.flatMap(s=>[s.title,s.body,WHO[s.who]])].join(' ').toLowerCase();return t.every(w=>h.includes(w))});
  if(!gs.length)continue;out+=`<h2>${grp}</h2>`+gs.map(([e,g])=>{let hit='';if(t.length){const s=g.steps.find(s=>t.every(w=>(s.title+' '+s.body).toLowerCase().includes(w)));if(s)hit=`<div class="sub">→ ${E(s.title)}</div>`}
   return`<button class="card" data-go="#/tools/guide/${e.id}"><b>${E(e.name)}</b><div class="sub">${E(e.blurb)}</div>${hit}</button>`}).join('')}
 b.innerHTML=out||'<p class="sub">No guide matches.</p>'}
function guideHtml(g,focus){return`<p class="sub">${E(g.summary)}</p><div class="safety"><b>⚠ Stop first</b><ul>${g.safety.map(s=>`<li>${E(s)}</li>`).join('')}</ul></div>
 <ol class="steps">${g.steps.map((s,i)=>`<li id="gs${i}" class="${focus&&focus.includes(i)?'focus':''}"><div class="sh"><b>${i+1}. ${E(s.title)}</b><span class="who ${s.who}">${WHO[s.who]||s.who}</span></div><p>${E(s.body)}</p></li>`).join('')}</ol>`}
function vGuide(p){const g=guideById(p[3]);if(!g)return X.go('#/tools/guides');X.setTitle(g.title);
 paint(`<h2 style="margin-top:4px">${E(g.title)}</h2>`+guideHtml(g,(p[4]||'').split(',').filter(Boolean).map(Number))+`<button class="btn alt" data-t="tsFrom" data-v="${g.id}">🩺 Troubleshoot with this guide</button>`);
 if(p[4]){const el=document.getElementById('gs'+p[4].split(',')[0]);el&&el.scrollIntoView()}}

// ---- charge ----
function prefillCharge(u){const c=st.ch;c.unit=u.id;const r=refId(cget(u,RE_REF));if(r)c.ref=r;const oz=chargeOz(cget(u,RE_CHG));if(oz!=null)c.oz=oz;c.sys=/mini|ductless/i.test(X.typeOf(u))?'mini':'split'}
function vCharge(p){const c=st.ch;if(p[3]&&c.unit!==p[3]){const u=X.unit(p[3]);if(u)prefillCharge(u)}else if(!p[3]){const wu=wk.unitId&&X.unit(wk.unitId);if(wu){if(c.unit!==wu.id)prefillCharge(wu)}else c.unit=null}const u=c.unit&&X.unit(c.unit);
 X.setTitle('Charge calc');const g=MAKERS[c.mk],pre=c.sys==='mini'?g.miniPrechargeFt:g.splitPrechargeFt,ref=REFRIGERANTS[c.ref];
 const r=calcCharge({refrigerant:c.ref,maker:c.mk,systemType:c.sys,liquidSize:c.liq,suctionSize:'3/4',lengthFt:+c.len||0,prechargeFt:pre,factoryOz:+c.oz||0,outdoor:'level',riseFt:0,lengthIncludesRise:true,liftReserve:false,fittingsPct:0});
 const cl=CHECKLISTS[c.tab],dn=c.done[c.tab]||{};
 paint((u?`<div class="pf">Prefilled from <b>${E(u.tag||'unit')}</b>${cget(u,RE_REF)?' · '+E(cget(u,RE_REF)):''}${cget(u,RE_CHG)?' · '+E(cget(u,RE_CHG)):''} <button class="mini" data-go="#/unit/${u.id}">Unit</button></div>`:'')+
 `<p class="sub">Use the nameplate first. Extra lineset is added on top. This is licensed EPA 608 work — the page is the sequence, not a shortcut around the cert.</p>
 <label>System</label>${seg('ch.sys',c.sys,[['split','Split / RTU'],['mini','Mini-split']])}
 <label>Refrigerant on the plate</label>${seg('ch.ref',c.ref,REFRIGERANT_LIST.map(x=>[x.id,x.name+' '+x.ashrae]))}
 <label for="c_mk">Brand table for extra feet</label><select id="c_mk" data-f="ch.mk">${MAKER_LIST.map(m=>opt(m.id,c.mk,m.name)).join('')}</select>
 <label for="c_liq">Liquid line OD</label><select id="c_liq" data-f="ch.liq">${LIQUID_SIZES.map(s=>opt(s.id,c.liq,s.label+' OD')).join('')}</select>
 <div class="row"><div><label for="c_oz">Nameplate charge oz</label><input id="c_oz" data-f="ch.oz" inputmode="decimal" value="${E(c.oz)}"></div><div><label for="c_len">Lineset length ft</label><input id="c_len" data-f="ch.len" inputmode="decimal" value="${E(c.len)}"></div></div>
 <p class="sub">Factory already covers ${pre} ft on this table. <a href="#/tools/lineset">Open full lineset chart</a></p>
 <div class="result" id="cres"><div class="sub">${E(ref.name)} · ${c.sys==='mini'?'Mini-split':'Split / packaged'} · ${E(c.liq)}" liquid</div>
 <div class="rrow"><span>Nameplate</span><b>${fmtNum(r.factoryOz)} oz</b><span class="sub">${fmtLbOz(r.factoryOz)}</span></div>
 <div class="rrow"><span>Extra lineset</span><b>${fmtNum(r.extraOz)} oz</b><span class="sub">${r.extraFt} ft past ${pre} ft</span></div>
 <div class="rrow big"><span>Weigh-in target</span><b id="ctarget">${fmtLbOz(r.targetOz)}</b><span class="sub">${fmtNum(r.targetOz)} oz total</span></div>
 <div class="sub">Add-on rate ${fmtNum(r.combinedOzFt)} oz/ft (${r.includeSuction?'liquid + suction volume':'liquid line only'})</div></div>
 ${seg('ch.tab',c.tab,Object.entries(CHECKLISTS).map(([k,v])=>[k,v.title+' '+Object.values(c.done[k]||{}).filter(Boolean).length+'/'+v.steps.length]))}
 <p class="sub">${E(cl.goal)}</p><div class="checks">${cl.steps.map((s,i)=>`<label class="chk"><input type="checkbox" data-f="ch.done" data-v="${s.id}"${dn[s.id]?' checked':''}><span><b>${i+1}. ${E(s.title)}</b> <span class="who ${s.who}">${WHO[s.who]}</span><br>${E(s.body)}</span></label>`).join('')}</div>
 <h2>This refrigerant</h2><ul class="notes">${[...refrigerantNotes(c.ref),...systemNotes(c.sys)].map(n=>`<li>${E(n)}</li>`).join('')}</ul>
 <p class="sub">${E(ref.note)} ${E(g.note)}</p>`);}

// ---- lineset ----
function vLineset(){X.setTitle('Lineset chart');const s=st.ls,g=MAKERS[s.mk],ref=REFRIGERANTS[s.ref];
 const r=calcCharge({refrigerant:s.ref,maker:s.mk,systemType:s.sys,liquidSize:s.liq,suctionSize:s.suc,lengthFt:+s.len||0,prechargeFt:+s.pre||0,factoryOz:+s.oz||0,outdoor:s.out,riseFt:+s.rise||0,lengthIncludesRise:true,liftReserve:true,fittingsPct:s.fit?10:0});
 const liq=LIQUID_SIZES.map(x=>[x.label,liquidRate(s.mk,s.ref,x.id)]),suc=SUCTION_SIZES.map(x=>[x.label,tableRate(s.ref,'suction',x.id)]);
 const bars=(rows,max,cur)=>`<div class="bars">${rows.map(([l,v])=>`<div class="bar${l===cur?' on':''}"><span class="bl">${E(l)}</span><span class="bt"><i style="width:${Math.max(2,v/max*100).toFixed(1)}%"></i></span><span class="bv">${v.toFixed(2)}</span></div>`).join('')}</div>`;
 paint(`<p class="sub">Size the copper between the indoor and outdoor unit, then read ounces to add past the factory precharge.</p>
 <label>System</label>${seg('ls.sys',s.sys,[['split','Split'],['mini','Mini-split']])}<label>Brand tables</label>${seg('ls.mk',s.mk,MAKER_LIST.map(m=>[m.id,m.short]))}
 <label>Refrigerant</label>${seg('ls.ref',s.ref,REFRIGERANT_LIST.map(x=>[x.id,x.name]))}<label>Tonnage</label>${seg('ls.tons',s.tons,TONNAGE.map(t=>[t.tons,t.label]))}
 <div class="row"><div><label for="l_liq">Liquid</label><select id="l_liq" data-f="ls.liq">${LIQUID_SIZES.map(x=>opt(x.id,s.liq,x.label)).join('')}</select></div><div><label for="l_suc">Suction</label><select id="l_suc" data-f="ls.suc">${SUCTION_SIZES.map(x=>opt(x.id,s.suc,x.label)).join('')}</select></div></div>
 <div class="row"><div><label for="l_len">Length ft</label><input id="l_len" data-f="ls.len" inputmode="decimal" value="${E(s.len)}"></div><div><label for="l_pre">Factory covers ft</label><input id="l_pre" data-f="ls.pre" inputmode="decimal" value="${E(s.pre)}"></div><div><label for="l_oz">Nameplate oz</label><input id="l_oz" data-f="ls.oz" inputmode="decimal" value="${E(s.oz)}"></div></div>
 <label>Outdoor unit</label>${seg('ls.out',s.out,[['level','Same grade'],['below','Below indoor'],['above','Above indoor']])}
 ${s.out!=='level'?`<label for="l_rise">Rise ft</label><input id="l_rise" data-f="ls.rise" inputmode="decimal" value="${E(s.rise)}">`:''}
 <label class="chk"><input type="checkbox" data-f="ls.fit"${s.fit?' checked':''}><span>Add 10% for elbows and fittings</span></label>
 <div class="result" id="lres"><div class="sub">${s.sys==='mini'?'Mini-split':'Split'} · ${E(g.short)} · ${E(ref.name)} · ${E(s.liq)} / ${E(s.suc)}</div>
 <div class="rrow"><span>Rate</span><b>${fmtNum(r.combinedOzFt)} oz/ft</b><span class="sub">liquid ${fmtNum(r.liquidOzFt)}${r.includeSuction?' + suction '+fmtNum(r.suctionOzFt):''}</span></div>
 <div class="rrow"><span>In the run</span><b>${fmtLbOz(r.linesetTotalOz)}</b><span class="sub">${r.chargeLengthFt} ft</span></div>
 <div class="rrow"><span>Add past factory</span><b>${fmtNum(r.extraOz)} oz</b><span class="sub">${r.extraFt} ft${r.fittingsOz?' + '+fmtNum(r.fittingsOz)+' oz fittings':''}${r.liftReserveOz?' + '+fmtNum(r.liftReserveOz)+' oz lift':''}</span></div>
 <div class="rrow big"><span>Target weigh-in</span><b id="ltarget">${fmtLbOz(r.targetOz)}</b><span class="sub">${fmtNum(r.targetOz)} oz</span></div>
 ${r.subcoolAddF?`<div class="sub">Raise subcool target ~${r.subcoolAddF}°F for the lift.</div>`:''}${r.liftWarning?`<div class="safety">${E(r.liftWarning)}</div>`:''}</div>
 <h2>Liquid add-on oz/ft · ${E(ref.name)} · ${E(g.short)}</h2>${bars(liq,Math.max(...liq.map(x=>x[1])),LIQUID_SIZES.find(x=>x.id===s.liq).label)}
 <h2>Suction volume oz/ft · ${E(ref.name)}</h2>${bars(suc,Math.max(...suc.map(x=>x[1])),SUCTION_SIZES.find(x=>x.id===s.suc).label)}
 <table class="tbl"><tr><th>Line</th>${REFRIGERANT_LIST.map(x=>`<th>${E(x.name)}</th>`).join('')}</tr>${LIQUID_SIZES.map(x=>`<tr><td>${E(x.label)} liq</td>${REFRIGERANT_LIST.map(rf=>`<td>${tableRate(rf.id,'liquid',x.id).toFixed(2)}</td>`).join('')}</tr>`).join('')}</table>
 <p class="sub">Mini-splits are usually precharged for 25 ft and add refrigerant on the liquid line only. Splits are typically 15 ft. Brand tables follow published long-line add-on rates, not a substitute for that model’s IOM. Finish on subcooling / superheat.</p>`);}

// ---- troubleshoot ----
const SYM_RE={'no-cool':/air|filter|outdoor|coil|ice|condens|charge|stag|call|thermostat|setpoint|power|econo|belt/i,'no-heat':/call|thermostat|ignit|heat|gas|burner|status|defrost|mode|water|air|filter/i,
 'no-start':/power|disconnect|breaker|thermostat|call|status|safet|electr|ignit|remote|communic/i,ice:/air|filter|ice|coil|belt|blower|charge|defrost|evap/i,water:/condens|drain|water|coil|pan/i,
 'short-cycle':/thermostat|call|filter|air|safet|charge|stag|status|ignit/i,noise:/belt|fan|blower|air moving|outdoor|pump|bearing/i,'high-bill':/filter|air|coil|belt|econo|charge|stag|balance/i,
 odor:/combustion|exchanger|gas|burner|ignit|drain|condens/i,uneven:/air|filter|balance|vav|control|damper|stag|zone|loop/i,'no-air':/air|filter|belt|blower|fan|power|disconnect/i};
const AIR=/ice|no-air|high-bill|uneven|no-cool|short-cycle/,BELT=/no-air|noise|high-bill|ice|uneven|no-cool/;
function tsTips(u,sym,eq){const t=[],f=X.filtStr(u),belt=u.belts,ref=cget(u,RE_REF),chg=cget(u,RE_CHG);
 if(f&&AIR.test(sym))t.push(`Filters on record: <b>${E(f)}</b> — pull and check them first${sym==='ice'?'; a loaded filter is the #1 cause of a frozen coil':''}. Bring the right size up.`);
 if(!f&&AIR.test(sym))t.push('No filter size on record — note it while you are there and add it to the unit.');
 if(belt&&BELT.test(sym))t.push(`Belt on record: <b>${E(belt)}</b> — check for a broken, glazed or loose belt${sym==='noise'?' (squeal) and the bearings':''}. Carry a spare.`);
 else if(!belt&&BELT.test(sym)&&/rtu|commercial-ahu|package/.test(eq))t.push('No belt size on record — if it is belt-drive, read the belt and add it to the unit.');
 if((ref||chg)&&/no-cool|ice|short-cycle|high-bill/.test(sym))t.push(`Charge on record: <b>${E([ref,chg].filter(Boolean).join(' · '))}</b> — if charge is suspected, recover and weigh in; do not top off by guesswork. <a href="#/tools/charge/${u.id}">Charge calc</a>`);
 const last=lastSvc(u);if(last){const d=daysSince(last.date);if(d>PM_DAYS)t.push(`Last service was ${d} days ago (${E(last.date)}) — PM is due; check filters, belts and coils while you are here.`)}
 else t.push('No service history for this unit yet.');
 const nm=(SYMPTOMS.find(s=>s.id===sym)||{}).name||'';const rep=(u.service||[]).filter(s=>s.date&&daysSince(s.date)<=60&&(s.symptom===sym||(nm&&(s.what||'').toLowerCase().includes(nm.toLowerCase()))));
 if(rep.length)t.push(`<b>Repeat call:</b> same symptom logged ${rep.map(s=>E(s.date)).join(', ')}. Look past the last fix${rep[0].findings?' (last finding: '+E(rep[0].findings)+')':''}.`);
 return t}
function tsSafety(u,sym){const b=[];if(sym==='odor')b.push('Gas or burning smell: if you smell gas, leave the area, do not flip switches, and call the gas utility / 911 from outside.');
 if(sym==='water')b.push('Water near electrical: kill power at the disconnect before you reach into the unit.');
 const r=u&&refId(cget(u,RE_REF));if(r==='r32'||r==='r454b')b.push('A2L refrigerant (mildly flammable): listed recovery gear, no open flame or brazing on a charged system.');return b}
function vTs(p){const s=st.ts;if(p[3]&&s.unit!==p[3]){const u=X.unit(p[3]);if(u){Object.assign(s,{unit:u.id,eq:eqFor(u),sym:'',done:{},findings:'',parts:''})}}else if(!p[3]){const wu=wk.unitId&&X.unit(wk.unitId);if(wu){if(s.unit!==wu.id)Object.assign(s,{unit:wu.id,eq:eqFor(wu),sym:'',done:{},findings:'',parts:''});else if(!s.eq)s.eq=eqFor(wu)}else if(s.unit){Object.assign(s,{unit:null,sym:'',done:{},findings:'',parts:''})}}
 const u=s.unit&&X.unit(s.unit);X.setTitle(u?'Service call: '+(u.tag||'unit'):'Troubleshoot');const g=s.eq&&guideById(s.eq);
 let h='';if(u){const last=(u.service||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,3);
  h+=`<div class="pf"><b>${E(u.tag||'(no tag)')}</b> · ${E(X.typeOf(u)||'type ?')} ${pmTag(u)}<div class="sub">${E([u.make,u.model&&'Model '+u.model,u.serial&&'S/N '+u.serial].filter(Boolean).join(' · '))}</div>
  <div class="sub">${E([u.belts&&'Belt '+u.belts,X.filtStr(u)&&'Filters '+X.filtStr(u),cget(u,RE_REF),cget(u,RE_CHG)&&'Charge '+cget(u,RE_CHG)].filter(Boolean).join(' · '))}</div>
  ${last.length?`<div class="sub">Recent: ${last.map(x=>E(x.date+' '+x.what)).join(' | ')}</div>`:''}</div>`}
 h+=`<label for="t_eq">Equipment</label><select id="t_eq" data-f="ts.eq"><option value="">— pick equipment —</option>${['Commercial','Residential'].map(gr=>`<optgroup label="${gr}">${EQUIP.filter(e=>e.group===gr).map(e=>opt(e.id,s.eq,e.name)).join('')}</optgroup>`).join('')}</select>
 <label>Symptom</label><div class="chips">${SYMPTOMS.map(x=>`<button type="button" class="${s.sym===x.id?'on':''}" data-t="set" data-f="ts.sym" data-v="${x.id}">${E(x.name)}</button>`).join('')}</div>`;
 if(g&&s.sym){const re=SYM_RE[s.sym],focus=g.steps.map((x,i)=>re&&re.test(x.title+' '+x.body)?i:-1).filter(i=>i>=0),sb=[...tsSafety(u,s.sym),...g.safety];
  h+=`<div class="safety"><b>⚠ Safety first</b><ul>${sb.map(x=>`<li>${E(x)}</li>`).join('')}</ul></div>`;
  if(u){const tips=tsTips(u,s.sym,s.eq);if(tips.length)h+=`<div class="tips"><b>For this unit</b><ul>${tips.map(x=>`<li>${x}</li>`).join('')}</ul></div>`}
  h+=`<h2>Steps · ${E(g.title)}</h2><p class="sub">★ = most likely for “${E(SYMPTOMS.find(x=>x.id===s.sym).name)}”. Tick what you checked. <a href="#/tools/guide/${g.id}/${focus.join(',')}">Open full guide</a></p>
  <div class="checks">${g.steps.map((x,i)=>`<label class="chk${focus.includes(i)?' focus':''}"><input type="checkbox" data-f="ts.done" data-v="${i}"${s.done[i]?' checked':''}><span><b>${focus.includes(i)?'★ ':''}${i+1}. ${E(x.title)}</b> <span class="who ${x.who}">${WHO[x.who]}</span><br>${E(x.body)}</span></label>`).join('')}</div>`;
  if(u)h+=`<h2>Wrap up</h2><label for="t_fi">Findings</label><textarea id="t_fi" data-f="ts.findings" placeholder="What you found / fixed">${E(s.findings)}</textarea>
  <label for="t_pa">Parts used</label><input id="t_pa" data-f="ts.parts" value="${E(s.parts)}" placeholder="e.g. 2× 20x25x2, belt A42"><button class="btn" data-t="saveCall">💾 Save to service log</button>`;
 }else h+=`<p class="sub">${g?'Pick a symptom.':'Pick the equipment and a symptom.'}</p>`;
 h+=`<button class="btn alt" data-t="ai">🤖 AI troubleshoot (FieldBench)</button><p class="sub">${u?'Copies this unit’s summary to paste into FieldBench, then opens it (needs signal).':'Opens FieldBench online (needs signal).'}</p>`;
 paint(h)}

// ---- parts / PM ----
function partsFor(id){const us=X.unitsAt(id),belts=new Map(),filt=new Map();
 for(const u of us){for(const b of String(u.belts||'').split(/[,;/]+|\s+and\s+/i).map(x=>x.trim().toUpperCase()).filter(Boolean)){const m=b.match(/^(\d+)\s*[x×]\s*(.+)$/i)||b.match(/^(.+?)\s*[x×]\s*(\d+)$/i);let sz=b,q=1;if(m){if(/^\d+$/.test(m[1])){q=+m[1];sz=m[2]}else{sz=m[1];q=+m[2]}}
  const e=belts.get(sz)||{n:0,tags:[]};e.n+=q;e.tags.push(u.tag||'?');belts.set(sz,e)}
  for(const f of u.filters||[]){if(!f.size)continue;const sz=f.size.trim().toLowerCase().replace(/\s+/g,'').replace(/×/g,'x');const e=filt.get(sz)||{n:0,tags:[]};e.n+=parseInt(f.qty)||1;e.tags.push(u.tag||'?');filt.set(sz,e)}}
 const srt=m=>[...m.entries()].sort((a,b)=>X.natCmp(a[0],b[0]));return{belts:srt(belts),filt:srt(filt),n:us.length}}
function partsText(l,p){return`PARTS LIST — ${l.name} (${p.n} units)\n\nFILTERS\n`+p.filt.map(([s,e])=>`${s}  ×${e.n}   (${e.tags.join(', ')})`).join('\n')+`\n\nBELTS\n`+p.belts.map(([s,e])=>`${s}  ×${e.n}   (${e.tags.join(', ')})`).join('\n')}
function vParts(p){const l=X.loc(p[3]);if(!l)return X.go('#/tools');X.setTitle('Parts: '+l.name);const pl=partsFor(l.id);
 const tb=(rows,k)=>rows.length?`<table class="tbl"><tr><th>${k}</th><th>Qty</th><th>Units</th></tr>${rows.map(([s,e])=>`<tr><td><b>${E(s)}</b></td><td>${e.n}</td><td class="sub">${E(e.tags.join(', '))}</td></tr>`).join('')}</table>`:'<p class="sub">None on record.</p>';
 paint(`<p class="sub">${pl.n} units · totals across every unit at this location, for ordering and PMs.</p><h2>Filters</h2>${tb(pl.filt,'Size')}<h2>Belts</h2>${tb(pl.belts,'Belt')}<button class="btn" data-t="copyParts" data-v="${l.id}">📋 Copy list</button>`)}
function vPm(){X.setTitle('PM due');const us=X.DB().units.slice().map(u=>[u,lastSvc(u)]).sort((a,b)=>(a[1]?.date||'').localeCompare(b[1]?.date||'')||X.natCmp(a[0].tag,b[0].tag));
 const due=us.filter(([u,s])=>!s||daysSince(s.date)>PM_DAYS).length;
 paint(`<p class="sub">${due} of ${us.length} units have no service logged in the last ${PM_DAYS} days. Oldest first.</p>`+us.map(([u])=>`<button class="card" data-go="#/unit/${u.id}"><b>${E(u.tag||'(no tag)')}</b> <span class="sub">${E(X.typeOf(u))}</span> ${pmTag(u)}<div class="sub">${E(X.loc(u.locId)?.name||'')}</div></button>`).join(''))}

// ---- events ----
function setPath(f,v,el){const [a,k]=f.split('.'),o=st[a];if(k==='done'){const d=a==='ch'?(o.done[o.tab]=o.done[o.tab]||{}):o.done;d[v]=el.checked;return}
 if(k==='fit'){o.fit=el.checked;return}o[k]=v;
 if(a==='ls'&&k==='tons'){const t=TONNAGE.find(t=>String(t.tons)===String(v)),x=t&&t[o.sys];if(x){o.liq=x.liquid;o.suc=x.suction;o.oz=x.factoryOz}}
 if(a==='ls'&&(k==='sys'||k==='mk')){const m=MAKERS[o.mk];o.pre=o.sys==='mini'?m.miniPrechargeFt:m.splitPrechargeFt;const t=TONNAGE.find(t=>String(t.tons)===String(o.tons));if(k==='sys'&&t){o.liq=t[o.sys].liquid;o.suc=t[o.sys].suction;o.oz=t[o.sys].factoryOz}}}
function rerender(keepId){const a=document.activeElement,id=keepId||(a&&a.id),pos=a&&a.selectionStart,y=scrollY;render(location.hash.split('/'));scrollTo(0,y);
 if(id){const e=document.getElementById(id);if(e){e.focus();try{e.setSelectionRange(pos,pos)}catch(_){}}}}
function onInput(e){const el=e.target;if(!location.hash.startsWith('#/tools'))return;
 if((el.id==='wlq'||el.id==='wuq')&&e.type!=='input')return;
 if(el.id==='wlq'){wk.lq=el.value;const b=document.getElementById('wll');if(b)b.innerHTML=locPickList();return}
 if(el.id==='wuq'){wk.uq=el.value;const b=document.getElementById('wul');if(b)b.innerHTML=unitPickList();return}
 if(el.id==='tq'){st.q=el.value;drawTq();return}if(el.id==='gq'){st.gq=el.value;drawGuides();return}
 const f=el.dataset.f;if(!f)return;if(f==='ts.findings'||f==='ts.parts'){setPath(f,el.value,el);return}
 if(el.type==='checkbox'){if(e.type!=='change')return;setPath(f,el.dataset.v,el);if(f==='ch.done')rerender();return}
 if(el.tagName==='SELECT'&&e.type!=='change')return;if(el.tagName==='INPUT'&&e.type==='change')return;setPath(f,el.value,el);rerender()}
function onClick(e){const t=e.target.closest('[data-t]');if(!t||!location.hash.startsWith('#/tools'))return;e.preventDefault();const a=t.dataset.t;
 if(a==='set'){setPath(t.dataset.f,t.dataset.v,t);rerender();return}
 if(a==='wkMode'){wk.mode=t.dataset.v||'';wk.lq='';wk.uq='';const id=wk.mode==='loc'?'wlq':wk.mode==='unit'?'wuq':'';rerender(id||'__none');if(id){const el=document.getElementById(id);el?.focus();const bd=document.querySelector('.wsbody');if(bd)bd.scrollTop=0}return}
 if(a==='wkClear'){wk.locId='';wk.unitId='';wk.mode='';wk.lq='';wk.uq='';wkSave();rerender();return}
 if(a==='wkLoc'){wk.locId=t.dataset.v;if(wk.unitId){const cu=X.unit(wk.unitId);if(!cu||cu.locId!==wk.locId)wk.unitId=''}wk.mode='unit';wk.uq='';wkSave();rerender('wuq');document.getElementById('wuq')?.focus();return}
 if(a==='wkUnit'){const u=X.unit(t.dataset.v);if(!u)return;wkSetUnit(u);Object.assign(st.ts,{unit:u.id,eq:eqFor(u)});rerender();return}
 if(a==='wkAi'){const u=X.unit(wk.unitId);if(!u)return;copyText(unitSummary(u));X.toast('Unit summary copied — paste into FieldBench');window.open(FB_TS,'_blank','noopener');return}
 if(a==='ai'){const u=(st.ts.unit&&location.hash.startsWith('#/tools/ts/')&&X.unit(st.ts.unit))||(wk.unitId&&X.unit(wk.unitId));const sym=u&&st.ts.unit===u.id&&(SYMPTOMS.find(x=>x.id===st.ts.sym)||{}).name;
  if(u){copyText(unitSummary(u,sym));X.toast('Unit summary copied — paste it into FieldBench')}window.open(FB_TS,'_blank','noopener');return}
 if(a==='tsFrom'){st.ts.eq=t.dataset.v;X.go('#/tools/ts');return}
 if(a==='parts'){const ls=X.DB().locations;if(ls.length===1)return X.go('#/tools/parts/'+ls[0].id);if(!ls.length)return X.toast('No locations yet');const b=document.getElementById('plocs');b.hidden=!b.hidden;return}
 if(a==='copyParts'){const l=X.loc(t.dataset.v);copyText(partsText(l,partsFor(l.id))).then(()=>X.toast('Copied'));return}
 if(a==='saveCall'){const s=st.ts,u=X.unit(s.unit);if(!u)return;const g=guideById(s.eq),sym=SYMPTOMS.find(x=>x.id===s.sym);
  const checks=g.steps.filter((x,i)=>s.done[i]).map(x=>x.title),fi=(document.getElementById('t_fi')?.value||'').trim(),pa=(document.getElementById('t_pa')?.value||'').trim();
  if(!fi&&!checks.length)return X.toast('Tick a check or add findings first');
  const what=['Service call: '+sym.name,fi,pa&&'Parts: '+pa].filter(Boolean).join(' — ').slice(0,1000),by=localStorage.getItem('hvac-by')||X.myName();
  (u.service=u.service||[]).push({id:X.uid(),date:new Date().toLocaleDateString('en-CA'),what,by,symptom:s.sym,equipment:s.eq,checks,findings:fi.slice(0,2000),parts:pa.slice(0,500)});
  X.putUnit(u);Object.assign(s,{unit:null,sym:'',done:{},findings:'',parts:''});X.toast('Saved to service log');X.go('#/unit/'+u.id)}}
