// Pure nameplate OCR text → structured fields. No DOM, no network.
// OCR is approximate; callers must require human review before applying.

const MAKERS=[
  ['Carrier','carrier'],['Bryant','bryant'],['Trane','trane'],['American Standard','american standard'],
  ['York','york'],['Johnson Controls','johnson controls'],['Lennox','lennox'],['Rheem','rheem'],
  ['Ruud','ruud'],['Goodman','goodman'],['Amana','amana'],['Daikin','daikin'],['Mitsubishi','mitsubishi'],
  ['LG','\\blg\\b'],['Samsung','samsung'],['ICP','\\bicp\\b'],['Heil','heil'],['Tempstar','tempstar'],
  ['Comfortmaker','comfortmaker'],['Armstrong','armstrong'],['Aaon','aaon'],['McQuay','mcquay'],
  ['Daikin Applied','daikin applied'],['Reznor','reznor'],['Modine','modine'],['Lochinvar','lochinvar'],
  ['Weil-McLain','weil[- ]?mclain'],['Burnham','burnham'],['Cleaver-Brooks','cleaver[- ]?brooks'],
  ['Bosch','bosch'],['Payne','payne'],['Keeprite','keeprite'],['Coleman','coleman'],['Fraser-Johnston','fraser'],
  ['Mammoth','mammoth'],['Carrier Transicold','transicold']
];

const REF_MAP={
  '410A':'R-410A','R410A':'R-410A','R-410A':'R-410A','410a':'R-410A',
  '454B':'R-454B','R454B':'R-454B','R-454B':'R-454B',
  '32':'R-32','R32':'R-32','R-32':'R-32',
  '22':'R-22','R22':'R-22','R-22':'R-22',
  '407C':'R-407C','R407C':'R-407C','R-407C':'R-407C',
  '134A':'R-134A','R134A':'R-134A','R-134A':'R-134A'
};

const FIELD_META={
  make:{label:'Make',form:'make'},
  model:{label:'Model',form:'model'},
  serial:{label:'Serial',form:'serial'},
  refrigerant:{label:'Refrigerant',form:'ref',spec:'ref'},
  charge:{label:'Factory charge',form:'chg',spec:'chg'},
  tons:{label:'Tons',form:'tons',spec:'tons'},
  fuel:{label:'Fuel',form:'fuel',spec:'fuel'},
  inputBtu:{label:'Input BTU / MBH',form:'inputBtu',spec:'inputBtu'},
  motorHp:{label:'Motor HP',form:'motorHp',spec:'motorHp'},
  voltage:{label:'Voltage',form:'custom'},
  amps:{label:'Amps (RLA/FLA)',form:'custom'},
  phase:{label:'Phase',form:'custom'},
  mca:{label:'MCA',form:'custom'},
  mop:{label:'Max fuse / MOP',form:'custom'}
};

function normSpace(s){return String(s||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\r/g,'')}
function cleanToken(s){return String(s||'').trim().replace(/^[:#.\-\s]+|[:#.\-\s]+$/g,'').toUpperCase()}
function looksCode(s){return /^[A-Z0-9][A-Z0-9\-\/.]{2,}$/i.test(s)&&/[A-Z]/i.test(s)&&/\d/.test(s)}
function looksSerialish(s){const t=cleanToken(s);return t.length>=6&&t.length<=30&&/^[A-Z0-9]+$/.test(t)&&/\d/.test(t)&&/[A-Z]/.test(t)}

function conf(v,unclear,reason){return{value:v,confidence:unclear?'low':(v?'high':'none'),unclear:!!unclear,reason:reason||''}}

function findMaker(text){
  const low=text.toLowerCase();
  for(const [name,re] of MAKERS){
    const m=low.match(new RegExp(re,'i'));
    if(m)return conf(name,false,'Matched manufacturer name');
  }
  const m=text.match(/(?:^|\n)\s*(?:MFG|MFR|MANUFACTURER|MAKE|BRAND)\s*[:#]?\s*([A-Za-z][A-Za-z0-9 .&\-]{1,40})/i);
  if(m){
    const v=m[1].trim().replace(/\s{2,}/g,' ');
    const junk=/model|serial|volt|refrig|charge|electrical/i.test(v);
    return conf(v,junk||v.length<2,junk?'Manufacturer label ambiguous':'Labeled manufacturer');
  }
  return null;
}

function labeled(text,labels){
  const re=new RegExp('(?:^|\\n)\\s*(?:'+labels+')\\s*[:#]?\\s*([^\\n]{2,60})','im');
  const m=text.match(re);
  return m?m[1].trim():'';
}

function parseCharge(raw){
  if(!raw)return null;
  const s=raw.replace(/,/g,'');
  let m=s.match(/(\d+)\s*(?:lb|lbs|pounds?)\s*(\d+)\s*(?:oz|ounces?)/i);
  if(m)return conf(`${m[1]} lb ${m[2]} oz`,false,'Labeled charge');
  m=s.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?)\b/i);
  if(m)return conf(`${m[1]} lb`,false,'Labeled charge');
  m=s.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\b/i);
  if(m)return conf(`${m[1]} oz`,false,'Labeled charge');
  m=s.match(/\b(\d{2,4}(?:\.\d+)?)\b/);
  if(m)return conf(m[1],true,'Numeric charge without unit — confirm');
  return null;
}

function parseRefrigerant(text){
  const labeledRef=labeled(text,'REFRIGERANT(?:\\s*TYPE)?|REF(?:RIG)?(?:\\.|\\s*TYPE)?|TYPE\\s*OF\\s*REFRIGERANT');
  const blob=labeledRef||text;
  const m=blob.match(/\bR[-\s]?((?:410A|454B|407C|134A|32|22))\b/i)||blob.match(/\b(410A|454B|407C|134A)\b/i);
  if(!m)return null;
  const key=(m[0].toUpperCase().replace(/\s+/g,'').replace(/^R(?=\d)/,'R-').replace(/R(\d)/,'R-$1'));
  const canon=REF_MAP[m[1].toUpperCase()]||REF_MAP[key]||('R-'+m[1].toUpperCase());
  const unclear=!labeledRef&&!/refrig|ref\b/i.test(text);
  return conf(canon,unclear,unclear?'Refrigerant token without clear label':'Labeled refrigerant');
}

function parseVoltage(text){
  const labeledV=labeled(text,'VOLTAGE|VOLTS?|V\\s*/\\s*PH\\s*/\\s*HZ|ELECTRICAL');
  const blob=labeledV||text;
  let m=blob.match(/\b(208\s*\/\s*230|230\s*\/\s*208|240\s*\/\s*208|460|480|277|115|120|208|230|240)\b/);
  if(m){
    let v=m[1].replace(/\s+/g,'');
    if(/208\/230|230\/208/.test(v))v='208/230';
    const unclear=!labeledV&&!/\b(volt|v\/ph|electrical)\b/i.test(text);
    return conf(v,unclear,unclear?'Voltage-like number without label':'Labeled voltage');
  }
  m=blob.match(/\b(\d{2,3})\s*V(?:AC)?\b/i);
  if(m)return conf(m[1],!labeledV,'Voltage with V suffix');
  return null;
}

function parsePhase(text){
  const m=text.match(/\b([13])\s*(?:PH|PHASE|Ø)\b/i)||text.match(/\b(?:PH|PHASE|Ø)\s*[:#]?\s*([13])\b/i)||text.match(/\b(SINGLE|THREE)[-\s]?PHASE\b/i);
  if(!m)return null;
  const v=/3|THREE/i.test(m[1])?'3':(/1|SINGLE/i.test(m[1])?'1':m[1]);
  return conf(v,false,'Phase marking');
}

function parseAmps(text){
  const m=text.match(/\b(?:RLA|FLA|FLA\/RLA|RATED\s*AMPS?|AMPS?)\s*[:#]?\s*(\d+(?:\.\d+)?)/i);
  if(m)return conf(m[1],false,'Labeled amps');
  return null;
}

function parseMca(text){
  const m=text.match(/\bMCA\s*[:#]?\s*(\d+(?:\.\d+)?)/i);
  return m?conf(m[1],false,'Labeled MCA'):null;
}

function parseMop(text){
  const m=text.match(/\b(?:MOP|MAX(?:IMUM)?\s*(?:FUSE|HACR\s*BREAKER|OVERCURRENT)|MAX\s*FUSE)\s*[:#]?\s*(\d+(?:\.\d+)?)/i);
  return m?conf(m[1],false,'Labeled MOP/max fuse'):null;
}

function parseTons(text){
  // Only explicit tons/capacity — never invent from model digits
  const m=text.match(/\b(?:CAPACITY|NOMINAL\s*CAPACITY|TONS?|TONNAGE)\s*[:#]?\s*(\d+(?:\.\d+)?)\s*(?:TONS?)?\b/i);
  if(m)return conf(m[1],false,'Labeled capacity/tons');
  const m2=text.match(/\b(\d+(?:\.\d+)?)\s*TONS?\b/i);
  if(m2)return conf(m2[1],false,'Tons with unit');
  return null;
}

function parseFuel(text){
  if(/\bNATURAL\s*GAS\b|\bN\.?\s*G\.?\b|\bGAS\s*FIRED\b/i.test(text))return conf('Gas',false,'Fuel marking');
  if(/\bPROPANE\b|\bLP\s*GAS\b|\bLPG\b/i.test(text))return conf('Gas',true,'Propane/LP — confirm Fuel field');
  if(/\bFUEL\s*OIL\b|\b#?\s*2\s*OIL\b|\bOIL\s*FIRED\b/i.test(text))return conf('Oil',false,'Fuel marking');
  if(/\bELECTRIC\s*(?:HEAT|BOILER|FURNACE)?\b/i.test(text)&&/\bFUEL\b|\bHEAT\s*SOURCE\b/i.test(text))return conf('Electric',false,'Fuel marking');
  const lab=labeled(text,'FUEL(?:\\s*TYPE)?|HEAT\\s*SOURCE');
  if(lab){
    if(/gas|propane|ng/i.test(lab))return conf('Gas',false,'Labeled fuel');
    if(/oil/i.test(lab))return conf('Oil',false,'Labeled fuel');
    if(/elec/i.test(lab))return conf('Electric',false,'Labeled fuel');
    return conf(lab.slice(0,40),true,'Fuel label needs review');
  }
  return null;
}

function parseInputBtu(text){
  let m=text.match(/\b(?:INPUT|HEATING\s*INPUT|INPUT\s*RATE)\s*[:#]?\s*(\d[\d,]*(?:\.\d+)?)\s*(MBH|BTU\/?H?|BTUH|MBTU)?\b/i);
  if(m){
    const n=m[1].replace(/,/g,'');
    const unit=(m[2]||'BTU').toUpperCase().replace('BTUH','BTU').replace('BTU/H','BTU');
    return conf(unit.includes('MBH')||unit.includes('MBTU')?`${n} MBH`:`${n} BTU`,false,'Labeled input');
  }
  m=text.match(/\b(\d{3,5})\s*(MBH)\b/i);
  if(m)return conf(`${m[1]} MBH`,false,'MBH marking');
  return null;
}

function parseMotorHp(text){
  const m=text.match(/\b(?:MOTOR\s*)?(?:HP|H\.P\.|HORSEPOWER)\s*[:#]?\s*(\d+(?:\.\d+)?|\d+\/\d+)\b/i)||text.match(/\b(\d+(?:\.\d+)?|\d+\/\d+)\s*(?:HP|H\.P\.)\b/i);
  return m?conf(String(m[1])+' HP',false,'Motor HP'):null;
}

function parseModelSerial(text){
  const modelLab=labeled(text,'MODEL(?:\\s*(?:NO|NUMBER|#))?|MOD(?:EL)?\\s*#');
  const serialLab=labeled(text,'SERIAL(?:\\s*(?:NO|NUMBER|#))?|SER(?:IAL)?\\s*#|S\\/N');
  let model=null,serial=null;
  if(modelLab){
    const tok=cleanToken(modelLab.split(/\s{2,}|[\s]{1}(?=[A-Z]*SERIAL)/i)[0].split(/\s/)[0]);
    const unclear=!looksCode(tok)&&tok.length<4;
    model=conf(tok,unclear||tok.length>40,'Labeled model');
  }
  if(serialLab){
    const tok=cleanToken(serialLab.split(/\s+/)[0]);
    const unclear=!looksSerialish(tok)&&tok.length<6;
    serial=conf(tok,unclear,'Labeled serial');
  }
  // Unlabeled fallback: only if exactly one strong model-like and one serial-like on separate lines
  if(!model||!serial){
    const lines=text.split(/\n/).map(l=>cleanToken(l)).filter(Boolean);
    const codes=lines.filter(looksCode);
    if(!model){
      const cand=codes.find(c=>!serial||c!==serial.value);
      if(cand&&/model/i.test(text))model=conf(cand,true,'Model-like code near “model” — confirm');
    }
    if(!serial){
      const cand=codes.find(c=>(!model||c!==model.value)&&looksSerialish(c));
      if(cand&&/serial|s\/n/i.test(text))serial=conf(cand,true,'Serial-like code near “serial” — confirm');
    }
  }
  // Ambiguity: both unlabeled and two codes
  if(model&&serial&&model.value===serial.value){
    model={...model,unclear:true,confidence:'low',reason:'Model/serial same token — confirm'};
    serial={...serial,unclear:true,confidence:'low',reason:'Model/serial same token — confirm'};
  }
  return{model,serial};
}

export function parseNameplateText(rawText,opts={}){
  const raw=normSpace(rawText);
  const text=raw.replace(/[|]/g,'I'); // common OCR pipe→I
  const fields=[];
  const push=(key,hit)=>{if(!hit||!hit.value)return;fields.push({key,label:FIELD_META[key].label,...hit})};

  push('make',findMaker(text));
  const ms=parseModelSerial(text);
  push('model',ms.model);push('serial',ms.serial);
  push('refrigerant',parseRefrigerant(text));
  const chgLab=labeled(text,'FACTORY\\s*CHARGE|REF(?:RIG(?:ERANT)?)?\\s*CHARGE|CHARGE(?:\\s*WT)?|NET\\s*CHARGE');
  push('charge',parseCharge(chgLab||((/charge/i.test(text)&&labeled(text,'CHARGE'))||'')));
  // If charge label block exists with units in surrounding lines
  if(!fields.some(f=>f.key==='charge')){
    const around=text.match(/(?:FACTORY\s*)?CHARGE[^\n]{0,40}/i);
    if(around)push('charge',parseCharge(around[0]));
  }
  push('voltage',parseVoltage(text));
  push('phase',parsePhase(text));
  push('amps',parseAmps(text));
  push('mca',parseMca(text));
  push('mop',parseMop(text));
  push('tons',parseTons(text));
  push('fuel',parseFuel(text));
  push('inputBtu',parseInputBtu(text));
  push('motorHp',parseMotorHp(text));

  // Preserve zeros: if someone OCR'd "0" for tons etc., keep it — parseTons already allows 0 via \d+

  const warnings=[];
  if(!fields.length)warnings.push('No nameplate fields recognized. Retake closer / flatter / brighter, or enter manually.');
  if(fields.some(f=>f.unclear))warnings.push('Some readings are unclear — review flagged rows before applying.');
  warnings.push('On-device OCR is approximate. ALWAYS double-check model and serial for 0/O and 1/I look-alikes — even when confidence looks high (unclear is NOT auto-flagged for that). Review every value. Nothing is saved until you tap Save on the unit form.');

  return{raw,fields,warnings,meta:FIELD_META};
}

/** Build apply plan vs current form values. Does not mutate anything. */
export function planApply({fields,unitType,typeSpec,current}){
  const cur=current||{};
  const sp=typeSpec||{};
  const rows=[];
  for(const f of fields){
    const meta=FIELD_META[f.key];if(!meta)continue;
    if(meta.spec&&!sp[meta.spec])continue; // not applicable to this equipment type
    if(meta.form==='custom'){
      const existing=String(cur.custom&&cur.custom[meta.label]||'');
      const occupied=!!existing.trim();
      rows.push({
        key:f.key,label:meta.label,target:'custom',customLabel:meta.label,
        value:f.value,confidence:f.confidence,unclear:f.unclear,reason:f.reason,
        existing,occupied,selected:!occupied // default: only fill empties
      });
      continue;
    }
    const formKey=meta.form;
    const existing=String(cur[formKey]??'');
    const occupied=!!existing.trim();
    rows.push({
      key:f.key,label:meta.label,target:formKey,
      value:f.value,confidence:f.confidence,unclear:f.unclear,reason:f.reason,
      existing,occupied,selected:!occupied
    });
  }
  return{unitType:unitType||'',rows};
}

export function applyPlanToValues(plan,current){
  // Pure: returns new values object; never called against live DB by this module
  const next={
    make:current.make||'',model:current.model||'',serial:current.serial||'',
    ref:current.ref||'',chg:current.chg||'',tons:current.tons||'',fuel:current.fuel||'',
    inputBtu:current.inputBtu||'',motorHp:current.motorHp||'',
    custom:{...(current.custom||{})}
  };
  for(const r of plan.rows||[]){
    if(!r.selected||!String(r.value||'').trim())continue;
    if(r.occupied&&!r.selected)continue;
    if(r.target==='custom')next.custom[r.customLabel]=String(r.value);
    else next[r.target]=String(r.value);
  }
  return next;
}

export const _test={cleanToken,looksCode,looksSerialish,REF_MAP,FIELD_META,MAKERS};
