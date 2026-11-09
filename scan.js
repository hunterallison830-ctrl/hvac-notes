// Data-tag scan: on-device Tesseract OCR + review sheet. Applies to form DOM only.
import {parseNameplateText,planApply} from './nameplate.js?v=12';

const MAX_BYTES=12*1024*1024;
const MAX_EDGE=2000;
const OCR_TIMEOUT_MS=120000;
const LOAD_TIMEOUT_MS=90000;
// Resolve asset base without query/hash so Pages ?v= cache-bust on scan.js cannot break relative paths
const HERE=(()=>{const u=new URL(import.meta.url);u.search='';u.hash='';return u})();
const BASE=new URL('./vendor/tesseract/',HERE);

let tessLoading=null,worker=null,scanGen=0,sheetEl=null,busy=false;

function withTimeout(promise,ms,label){
  let t;const to=new Promise((_,rej)=>{t=setTimeout(()=>rej(new Error(label||('Timed out after '+Math.round(ms/1000)+'s'))),ms)});
  return Promise.race([promise,to]).finally(()=>clearTimeout(t));
}

function loadScript(src){
  return new Promise((res,rej)=>{
    const abs=new URL(src,location.href).href;
    if([...document.scripts].some(s=>s.src===abs||s.src===src))return res();
    const s=document.createElement('script');s.src=src;s.async=true;
    s.onload=()=>res();s.onerror=()=>rej(new Error('Could not load OCR engine script. Check signal and try again.'));
    document.head.appendChild(s);
  });
}

async function resetWorker(){
  try{if(worker)await worker.terminate()}catch(_){}
  worker=null;tessLoading=null;
}

async function ensureTess(onProg){
  if(worker)return worker;
  if(tessLoading)return tessLoading;
  tessLoading=(async()=>{
    onProg&&onProg('Loading on-device OCR…');
    await withTimeout(loadScript(new URL('tesseract.min.js',BASE).href),15000,'OCR engine download timed out');
    const T=window.Tesseract;if(!T||!T.createWorker)throw new Error('OCR library missing after load');
    onProg&&onProg('Starting OCR worker…');
    // workerBlobURL:true (default behavior) — blob worker + importScripts(workerPath) is more reliable
    // under service workers than new Worker(absolutePath) on some mobile browsers.
    const w=await withTimeout(T.createWorker('eng',1,{
      workerPath:new URL('worker.min.js',BASE).href,
      corePath:new URL('core/',BASE).href,
      langPath:new URL('lang/',BASE).href,
      workerBlobURL:true,
      cacheMethod:'none',
      logger:m=>{if(!onProg||!m)return;if(m.status==='recognizing text'&&m.progress!=null)onProg('Reading tag… '+Math.round(m.progress*100)+'%');else if(m.status)onProg(String(m.status))}
    }),LOAD_TIMEOUT_MS,'OCR worker startup timed out (language/core download). Try Wi‑Fi and retry.');
    worker=w;return w;
  })();
  try{return await tessLoading}catch(e){tessLoading=null;await resetWorker();throw e}
}

function revokeSoon(url){if(url&&url.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(url),30_000)}

function isHeic(file){
  const n=(file&&file.name||'').toLowerCase();
  const t=(file&&file.type||'').toLowerCase();
  return t.includes('heic')||t.includes('heif')||/\.heic$|\.heif$/i.test(n);
}

function loadViaImageElement(file){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);res(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('Could not decode this photo. Try JPG or PNG.'))};
    img.src=url;
  });
}

async function prepareImage(file){
  if(!file)throw new Error('No image selected');
  if(isHeic(file))throw new Error('HEIC/HEIF photos are not supported in this scanner. In iPhone Camera settings, use “Most Compatible” (JPG), or export/share as JPG, then Upload Photo.');
  const okType=/^image\/(jpeg|jpg|png|webp|gif|bmp)$/i.test(file.type||'');
  const okName=/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name||'');
  if(!okType&&!okName&&file.type&&file.type.startsWith('image/')){
    // unknown image/* — try decode, but warn in UI later if needed
  }else if(!okType&&!okName){
    throw new Error('Unsupported file. Upload a JPG or PNG of the data tag.');
  }
  if(file.size>MAX_BYTES)throw new Error('Photo too large (max 12 MB). Move closer and retake, or crop first.');

  let source=null,sw=0,sh=0;
  // Prefer createImageBitmap when available; fall back to <img> for iOS quirks
  if(typeof createImageBitmap==='function'){
    try{
      const bmp=await createImageBitmap(file);
      source=bmp;sw=bmp.width;sh=bmp.height;
    }catch(_){source=null}
  }
  if(!source){
    const img=await loadViaImageElement(file);
    source=img;sw=img.naturalWidth||img.width;sh=img.naturalHeight||img.height;
  }
  if(!sw||!sh)throw new Error('Photo decoded with no dimensions. Try another JPG/PNG.');

  const scale=Math.min(1,MAX_EDGE/Math.max(sw,sh));
  const w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Canvas unavailable in this browser');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  ctx.drawImage(source,0,0,w,h);
  if(source.close)try{source.close()}catch(_){}
  try{
    const img=ctx.getImageData(0,0,w,h),d=img.data;
    for(let i=0;i<d.length;i+=4){
      const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
      const v=g<128?Math.max(0,g*0.85):Math.min(255,g*1.1);
      d[i]=d[i+1]=d[i+2]=v;
    }
    ctx.putImageData(img,0,0);
  }catch(_){}
  const blob=await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('Could not prepare photo for OCR')),'image/jpeg',0.92));
  return{canvas,blob,width:w,height:h};
}

function closeSheet(){
  if(sheetEl){sheetEl.remove();sheetEl=null}
  document.body.classList.remove('sheet-open');
  busy=false;
}

function openSheet(title){
  closeSheet();
  const el=document.createElement('div');
  el.className='wsheet scan-sheet';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
  el.innerHTML=`<div class="wshead"><div class="wsrow"><div class="wstitle">${title}</div><button type="button" class="btn alt wscancel" data-scan="cancel">Cancel</button></div></div><div class="wsbody" id="scanbody"></div>`;
  document.body.appendChild(el);document.body.classList.add('sheet-open');sheetEl=el;
  el.addEventListener('click',e=>{if(e.target.closest('[data-scan="cancel"]')){scanGen++;closeSheet()}});
  return el;
}

function setBody(html){const b=document.getElementById('scanbody');if(b)b.innerHTML=html}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function readCurrentFromForm(formRoot){
  const g=id=>{const el=formRoot.querySelector(id);return el?el.value:''};
  const custom={};
  formRoot.querySelectorAll('.cr').forEach(r=>{
    const lab=(r.children[0]&&r.children[0].value||'').trim();
    const val=(r.children[1]&&r.children[1].value||'').trim();
    if(lab)custom[lab]=val;
  });
  ['Voltage','Amps (RLA/FLA)','Phase','MCA','Max fuse / MOP'].forEach(lab=>{if(custom[lab]==null)custom[lab]=''});
  return{
    make:g('#f_make'),model:g('#f_model'),serial:g('#f_serial'),
    ref:g('#f_ref'),chg:g('#f_chg'),tons:g('#f_tons'),fuel:g('#f_fuel'),
    inputBtu:g('#f_inputBtu'),motorHp:g('#f_motorHp'),custom
  };
}

function renderReview({plan,raw,previewUrl,warnings,onApply}){
  const rows=plan.rows||[];
  setBody(`
    <p class="sub">Review required — OCR often swaps 0/O and 1/I in model/serial even at high confidence (not auto-flagged). Empty fields are checked by default; existing values stay unless you check Replace.</p>
    ${previewUrl?`<img class="scan-prev" src="${previewUrl}" alt="Data tag preview">`:''}
    ${warnings.map(w=>`<div class="warn">${esc(w)}</div>`).join('')}
    <div id="scanrows">${rows.length?rows.map((r,i)=>rowHtml(r,i)).join(''):'<p class="sub">Nothing extracted. Retake closer/flatter, or enter manually.</p>'}</div>
    <details class="scan-raw"><summary>Show raw OCR text</summary><pre class="scan-pre">${esc(raw||'')}</pre></details>
    <button type="button" class="btn" data-scan="apply" ${rows.length?'':'disabled'}>Apply selected to form</button>
    <button type="button" class="btn alt" data-scan="cancel">Cancel — change nothing</button>
    <p class="sub">Apply only fills the open form. Tap Save on the unit to store anything.</p>`);
  const body=document.getElementById('scanbody');
  const applyBtn=body.querySelector('[data-scan="apply"]');
  if(applyBtn)applyBtn.onclick=()=>{
    const selected=rows.map((r,i)=>{
      const box=body.querySelector(`#scan_sel_${i}`);
      const val=body.querySelector(`#scan_val_${i}`);
      return{...r,selected:!!(box&&box.checked),value:val?val.value:r.value};
    });
    onApply({...plan,rows:selected});
  };
}

function rowHtml(r,i){
  const flag=r.unclear?'<span class="scan-flag">Unclear</span>':'';
  const occ=r.occupied?`<div class="sub">Current: <b>${esc(r.existing)}</b> — check Replace to overwrite</div>`:'<div class="sub">Empty — will fill if checked</div>';
  return `<div class="scan-row ${r.unclear?'unclear':''}">
    <label class="scan-check"><input type="checkbox" id="scan_sel_${i}" ${r.selected?'checked':''}> <span>${esc(r.label)} ${flag}</span></label>
    <input id="scan_val_${i}" value="${esc(r.value)}" aria-label="${esc(r.label)} value">
    ${occ}
    ${r.reason?`<div class="sub">${esc(r.reason)} · ${esc(r.confidence)} confidence</div>`:''}
  </div>`;
}

function setCustomField(formRoot,label,value){
  const rows=[...formRoot.querySelectorAll('.cr')];
  for(const r of rows){
    const lab=(r.children[0]&&r.children[0].value||'').trim();
    if(lab.toLowerCase()===label.toLowerCase()){r.children[1].value=value;return}
  }
  const cl=formRoot.querySelector('#cl');
  if(!cl)return;
  const div=document.createElement('div');
  div.className='row cr';div.style.cssText='margin:6px 0';
  div.innerHTML=`<input value="${esc(label)}" placeholder="Label"><input value="${esc(value)}" placeholder="Value"><button type="button" class="mini" data-act="rmRow" style="flex:0">✕</button>`;
  cl.appendChild(div);
}

function applyToForm(formRoot,plan){
  const set=(sel,val)=>{const el=formRoot.querySelector(sel);if(!el||val==null)return;el.value=String(val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
  let n=0;
  for(const r of plan.rows||[]){
    if(!r.selected||!String(r.value||'').trim())continue;
    if(r.target==='custom'){setCustomField(formRoot,r.customLabel,String(r.value).trim());n++;continue}
    const map={make:'#f_make',model:'#f_model',serial:'#f_serial',ref:'#f_ref',chg:'#f_chg',tons:'#f_tons',fuel:'#f_fuel',inputBtu:'#f_inputBtu',motorHp:'#f_motorHp'};
    const sel=map[r.target];if(!sel)continue;
    const el=formRoot.querySelector(sel);
    if(el&&el.tagName==='SELECT'){
      const v=String(r.value).trim();
      let opt=[...el.options].find(o=>o.value===v||o.textContent===v);
      if(!opt){opt=document.createElement('option');opt.value=v;opt.textContent=v;el.appendChild(opt)}
      [...el.options].forEach(o=>{o.selected=(o===opt)});
      el.value=v;n++;continue;
    }
    set(sel,String(r.value).trim());n++;
  }
  return n;
}

function friendlyErr(e){
  const m=String(e&&e.message||e||'Unknown error');
  if(/heic|heif/i.test(m))return m;
  if(/timed out/i.test(m))return m+' If this keeps happening, use Upload Photo on Wi‑Fi.';
  if(/OCR engine|OCR library|worker|language|core/i.test(m))return m+' The first scan downloads on-device OCR files (~20MB).';
  if(/decode|dimensions|Canvas|Unsupported|too large|No image/i.test(m))return m;
  return 'Scan failed: '+m+'. Try Upload Photo with a bright, flat JPG of the tag.';
}

/** Wire Take Photo + Upload Photo into an edit form. */
export function mountScanButton(opts){
  const {formRoot,getType,getTypeSpec,toast}=opts;
  if(!formRoot||formRoot.querySelector('#scanBar'))return;
  const wrap=document.createElement('div');
  wrap.className='scan-bar noprint';wrap.id='scanBar';
  wrap.innerHTML=`
    <div class="row" style="margin:0">
      <button type="button" class="btn alt" id="scanTakeBtn">📷 Take Photo</button>
      <button type="button" class="btn alt" id="scanUploadBtn">🖼️ Upload Photo</button>
    </div>
    <input type="file" id="scanFileCamera" accept="image/*" capture="environment" hidden>
    <input type="file" id="scanFileGallery" accept="image/*" hidden>
    <p class="sub">Photo stays on this phone. On-device OCR opens a review sheet — it does not auto-save. Prefer JPG/PNG (not HEIC).</p>`;
  const dyn=formRoot.querySelector('#dyn')||formRoot;
  formRoot.insertBefore(wrap,dyn);
  const cam=wrap.querySelector('#scanFileCamera');
  const gal=wrap.querySelector('#scanFileGallery');
  const start=async(input)=>{
    if(busy)return toast&&toast('Scan already running');
    input.value='';
    input.onchange=async()=>{
      const f=input.files&&input.files[0];
      input.value='';
      input.onchange=null;
      if(!f)return; // user canceled picker
      await runScan({file:f,formRoot,getType,getTypeSpec,toast});
    };
    input.click();
  };
  wrap.querySelector('#scanTakeBtn').onclick=()=>start(cam);
  wrap.querySelector('#scanUploadBtn').onclick=()=>start(gal);
}

export async function runScan({file,formRoot,getType,getTypeSpec,toast,rawText}){
  const my=++scanGen;busy=true;
  openSheet('Scan data tag');
  let previewUrl='';
  try{
    setBody(`<p class="sub" id="scanprog">Preparing photo…</p><div class="scan-prog"><i id="scanbar"></i></div>`);
    const prog=m=>{const el=document.getElementById('scanprog');if(el)el.textContent=m};
    let text=rawText||'';
    if(!text){
      const prepared=await prepareImage(file);
      if(my!==scanGen)return;
      previewUrl=URL.createObjectURL(prepared.blob);revokeSoon(previewUrl);
      setBody(`<p class="sub" id="scanprog">Preparing photo…</p><img class="scan-prev" src="${previewUrl}" alt=""><div class="scan-prog"><i id="scanbar"></i></div>`);
      const w=await ensureTess(prog);
      if(my!==scanGen)return;
      prog('Reading tag…');
      const result=await withTimeout(w.recognize(prepared.canvas),OCR_TIMEOUT_MS,'Reading the tag timed out');
      if(my!==scanGen)return;
      text=(result&&result.data&&result.data.text)||'';
    }
    const type=getType?getType():'';
    const typeSpec=getTypeSpec?getTypeSpec(type):{};
    const parsed=parseNameplateText(text,{unitType:type});
    const current=readCurrentFromForm(formRoot);
    const plan=planApply({fields:parsed.fields,unitType:type,typeSpec,current});
    if(my!==scanGen)return;
    renderReview({plan,raw:parsed.raw,previewUrl,warnings:parsed.warnings,onApply:(finalPlan)=>{
      const n=applyToForm(formRoot,finalPlan);
      closeSheet();
      toast&&toast(n?`Applied ${n} field${n===1?'':'s'} to form — tap Save to store`:'Nothing applied');
    }});
  }catch(e){
    if(my!==scanGen)return;
    console.error(e);
    await resetWorker();
    setBody(`<div class="warn">${esc(friendlyErr(e))}</div>
      <button type="button" class="btn alt" data-scan="cancel">Close</button>`);
  }finally{
    if(my===scanGen)busy=false;
  }
}

export function isScanBusy(){return busy}
export function cancelScan(){scanGen++;closeSheet()}

export const __scan={prepareImage,ensureTess,applyToForm,readCurrentFromForm,MAX_BYTES,resetWorker,BASE:BASE.href,isHeic,friendlyErr};
