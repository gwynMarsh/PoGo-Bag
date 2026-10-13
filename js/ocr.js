// Pokémon GO Item Bag OCR: match item-name text boxes to nearby count text boxes.
// Conservative by design: nothing is saved until the user approves the review rows.
const normalize = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function tokens(blocks, width) {
  const all = [];
  for (const block of blocks || []) for (const para of block.paragraphs || []) for (const line of para.lines || []) {
    let words = (line.words || []).filter(w => w.text && w.bbox).sort((a,b)=>a.bbox.x0-b.bbox.x0);
    if (!words.length) {
      if (line.bbox && line.text) all.push({text: line.text, box:line.bbox});
      continue;
    }
    let group = [];
    const flush = () => {
      if (!group.length) return;
      all.push({text:group.map(x=>x.text).join(' '), box:{
        x0:Math.min(...group.map(x=>x.bbox.x0)),x1:Math.max(...group.map(x=>x.bbox.x1)),
        y0:Math.min(...group.map(x=>x.bbox.y0)),y1:Math.max(...group.map(x=>x.bbox.y1))
      }});
      group = [];
    };
    for (const w of words) {
      if (group.length && w.bbox.x0 - group.at(-1).bbox.x1 > Math.max(25, width*0.065)) flush();
      group.push(w);
    }
    flush();
  }
  return all;
}
function quantity(s) {
  // Item Bag counts are visibly marked by an x, ×, or OCR confusion such as «.
  // Never parse a lone 'I', 'l' or other page text as a quantity.
  const m = String(s).match(/(?:^|[^\p{L}\p{N}])[x×✕«‹]\s*([0-9OoIl|]{1,6})(?=$|[^\p{L}\p{N}])/iu);
  if(!m) return null;
  const n = Number(m[1].replace(/[Oo]/g,'0').replace(/[Il|]/g,'1'));
  return Number.isSafeInteger(n) && n >= 0 && n <= 999999 ? {n,marked:true} : null;
}
export function parseItemBoxes(blocks,catalog,width,height) {
  const boxes=tokens(blocks,width);
  const lookup=[...catalog].sort((a,b)=>b.name.length-a.name.length);
  const names=[];
  for(const box of boxes) {
    const normalized=normalize(box.text);
    const item=lookup.find(i=>normalized===normalize(i.name)||normalized.startsWith(normalize(i.name)+' '));
    if(!item) continue;
    const cx=(box.box.x0+box.box.x1)/2;
    // Name labels in list view appear on the right of the artwork.
    names.push({...box,item,cx,cy:(box.box.y0+box.box.y1)/2});
  }
  const amounts=boxes.map(b=>({...b,qty:quantity(b.text),cx:(b.box.x0+b.box.x1)/2,cy:(b.box.y0+b.box.y1)/2})).filter(b=>b.qty);
  const used=new Set(),matches=[];
  // List view: the text column occupies the right, quantity badges occupy the left.
  // Pair using the vertical item band, not adjacency in OCR reading order.
  const listNames=names.filter(n=>n.cx>width*.30 && n.box.x0>width*.22).sort((a,b)=>a.cy-b.cy);
  const listAmounts=amounts.filter(a=>a.cx<width*.30);
  if(listNames.length>=2 && listAmounts.length) {
    for(let ni=0;ni<listNames.length;ni++){
      const name=listNames[ni],next=listNames[ni+1];
      const endY=Math.min(next?.cy ?? height,name.cy+width*.32);
      const choices=listAmounts.map((v,i)=>({v,i}))
        .filter(x=>!used.has(x.v)&&x.v.cy>name.cy-width*.045&&x.v.cy<endY)
        .sort((a,b)=>Math.abs(a.v.cy-(name.cy+width*.14))-Math.abs(b.v.cy-(name.cy+width*.14)));
      if(!choices.length)continue;
      const chosen=choices[0];used.add(chosen.v);
      matches.push({id:name.item.id,quantity:chosen.v.qty.n});
    }
  }
  // Grid view: quantity badge is above the item label, at the same horizontal center.
  // Also run as fallback for any list names not successfully matched.
  for(const name of names) {
    if(matches.some(m=>m.id===name.item.id))continue;
    const options=amounts.filter(a=>!used.has(a)).map(a=>{
      const dx=Math.abs(a.cx-name.cx),dy=name.cy-a.cy;
      const grid=dy>0&&dy<width*.36&&dx<width*.15;
      const list=a.cx<width*.30&&name.cx>width*.30&&a.cy>name.cy-width*.04&&a.cy<name.cy+width*.31;
      if(!grid&&!list)return null;
      return {a,score:grid?(dx/width+dy/height):(Math.abs(a.cy-name.cy)/height+Math.abs(a.cx-name.cx)/(width*3))};
    }).filter(Boolean).sort((a,b)=>a.score-b.score);
    if(!options.length)continue;
    used.add(options[0].a);
    matches.push({id:name.item.id,quantity:options[0].a.qty.n});
  }
  return matches;
}

let loader;
async function getTesseract() {
  if(window.Tesseract)return window.Tesseract;
  if (!loader) loader=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';
    script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('OCR library unavailable'));
    script.onerror=()=>reject(new Error('OCR download blocked; check internet and Safari content blockers'));
    document.head.append(script);
  }).catch(e=>{loader=null;throw e});
  return loader;
}
async function prepared(file) {
  const url=URL.createObjectURL(file);
  try {
    const img = new Image();img.src=url;await img.decode();
    const scale=Math.min(1.4,1600/img.naturalWidth,2900/img.naturalHeight);
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.filter='grayscale(1) contrast(1.4)';
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas;
  } finally {URL.revokeObjectURL(url)}
}
export async function scanItemBag(files,catalog,onProgress=()=>{}) {
  const Tesseract=await getTesseract();
  let worker; const images=[];
  try {
    onProgress('Starting on-device recognition…');
    worker=await Tesseract.createWorker('eng');
    for(let i=0;i<files.length;i++){
      onProgress('Recognizing screenshot '+(i+1)+' of '+files.length+'…');
      const canvas=await prepared(files[i]);
      try {
        const output=await worker.recognize(canvas,{}, {blocks:true,text:true});
        const found=parseItemBoxes(output.data.blocks,catalog,canvas.width,canvas.height);
        images.push({filename:files[i].name,found,raw:output.data.text||''});
      } finally {canvas.width=canvas.height=0}
    }
  } finally {if(worker)await worker.terminate()}
  const groups=new Map();
  for(const screenshot of images)for(const x of screenshot.found){
    if(!groups.has(x.id))groups.set(x.id,new Set());
    groups.get(x.id).add(x.quantity);
  }
  const proposed=[...groups].map(([id,counts])=>({
    id,qty:[...counts][0],check:false,conflict:counts.size>1
  }));
  return {proposed,images};
}
