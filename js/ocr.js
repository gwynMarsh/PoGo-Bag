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
  const m = String(s).trim().match(/(?:^|\s)[x×✕]\s*([0-9OoIl|]{1,6})(?:\s|$)/i);
  const alone = String(s).trim().match(/^([0-9OoIl|]{1,6})$/);
  const v = m?.[1] || alone?.[1];
  if (!v) return null;
  const n = Number(v.replace(/[Oo]/g,'0').replace(/[Il|]/g,'1'));
  return Number.isSafeInteger(n) && n >= 0 && n <= 999999 ? {n,marked:!!m} : null;
}
export function parseItemBoxes(blocks, catalog, width, height) {
  const boxes = tokens(blocks,width);
  const names = [];
  for (const box of boxes) {
    const text = normalize(box.text);
    const item = [...catalog].sort((a,b)=>b.name.length-a.name.length)
      .find(i=> text === normalize(i.name) || text.startsWith(normalize(i.name)+' '));
    if (item) names.push({...box,item});
  }
  const amounts = boxes.map(box=>({...box,qty:quantity(box.text)})).filter(b=>b.qty);
  const matched=[], used = new Set();
  for (const name of names) {
    const nx=(name.box.x0+name.box.x1)/2, ny=(name.box.y0+name.box.y1)/2;
    const options = amounts.map((amount,i)=>{
      if (used.has(i)) return null;
      const bx=(amount.box.x0+amount.box.x1)/2, by=(amount.box.y0+amount.box.y1)/2;
      const dx=Math.abs(nx-bx),dy=ny-by;
      const grid=dy>0 && dy<Math.min(260,width*0.27) && dx<width*0.17;
      const list=bx<nx && dx<width*.48 && Math.abs(dy)<Math.min(145,width*.15);
      if (!grid && !list) return null;
      const score=(grid?dx/width+dy/height:dx/width*.6+Math.abs(dy)/height)+(amount.qty.marked?0:.27);
      return {amount,i,score};
    }).filter(Boolean).sort((a,b)=>a.score-b.score);
    if (!options.length || options[0].score>.43) continue;
    const chosen=options[0];used.add(chosen.i);
    matched.push({id:name.item.id,quantity:chosen.amount.qty.n});
  }
  return matched;
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
