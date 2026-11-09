// Fetch HTML and raster thumbnails through the same bounded, public-network-only path.
const http = require('node:http'), https = require('node:https'), dns = require('node:dns').promises, net = require('node:net');
const { clean } = require('./urltitle');
const U = require('./url-links');
function publicAddress(ip) {
  if (net.isIP(ip) === 4) { const [a,b] = ip.split('.').map(Number); return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0))||(a===198&&(b===18||b===19))||a===255); }
  if (net.isIP(ip) === 6) return /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:db8:/i.test(ip);
  return false;
}
function checkedUrl(raw) { const u = new URL(raw); if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&![80,443].includes(+u.port)||/^(localhost|.*\.(local|internal|localhost))$/i.test(u.hostname))throw Error('自動取得できないURLです');return u; }
async function readPublic(raw, { limit = 2000000, timeout = 6000, lookup = dns.lookup, redirects = 5, request = (u, opts, cb) => (u.protocol === 'https:' ? https : http).get(u, opts, cb) } = {}) {
  const start = Date.now(); let u = checkedUrl(raw);
  for(let hop=0;hop<=redirects;hop++) {
    let dnsTimer;
    const addresses = await Promise.race([lookup(u.hostname.replace(/^\[|\]$/g,''),{all:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('DNS timeout')),timeout);})]).finally(()=>clearTimeout(dnsTimer));
    if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('プライベートネットワークにはアクセスしません');
    const remaining=timeout-(Date.now()-start);if(remaining<=0)throw Error('timeout');
    const result=await new Promise((resolve,reject)=>{
      const pin=addresses.find(a=>a.family===4)||addresses[0];
      const req=request(u,{headers:{'User-Agent':'YuriiNote/1.1 URL preview',Accept:'text/html,image/png,image/jpeg,image/webp,image/gif','Accept-Encoding':'identity'},lookup:(_host,opts,cb)=>opts.all?cb(null,[pin]):cb(null,pin.address,pin.family)},res=>{
        if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.resume();resolve({redirect:new URL(res.headers.location,u).href});return;}
        if(res.statusCode<200||res.statusCode>=300){res.resume();reject(Error('HTTP '+res.statusCode));return;}
        if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.resume();reject(Error('unsupported encoding'));return;}
        const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>limit){req.destroy(Error('response too large'));return;}chunks.push(chunk);});
        res.on('end',()=>resolve({bytes:Buffer.concat(chunks),type:res.headers['content-type']||'',url:u.href}));res.on('error',reject);
      });
      const timer=setTimeout(()=>req.destroy(Error('timeout')),remaining);req.on('close',()=>clearTimeout(timer));req.on('error',reject);
    });
    if(result.redirect){u=checkedUrl(result.redirect);continue;}return result;
  }
  throw Error('too many redirects');
}
function metadata(html, base) {
  const values={};
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]) {
    const attrs={};for(const a of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[a[1].toLowerCase()]=a[2]??a[3]??a[4];
    const key=(attrs.property||attrs.name||'').toLowerCase();if(attrs.content&&!values[key])values[key]=attrs.content;
  }
  const resolve=x=>{if(!x)return '';try{return checkedUrl(new URL(x,base).href).href;}catch{return '';}};
  let icon='';for(const tag of html.match(/<link\b[^>]*>/gi)||[])if(/rel\s*=\s*["'][^"']*icon/i.test(tag)){const m=/href\s*=\s*["']([^"']*)/i.exec(tag);if(m){icon=resolve(m[1]);break;}}
  return {title:clean(values['og:title']||values['twitter:title']||(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||''),description:clean(values['og:description']||values.description||''),domain:new URL(base).hostname,image:resolve(values['og:image']||values['twitter:image']||''),icon:icon||resolve('/favicon.ico')};
}
async function raster(url, read=readPublic, thumbnailer=null) {
  if(!url)return '';
  try{const r=await read(url,{limit:750000});const type=r.type.split(';')[0].trim();if(!['image/png','image/jpeg','image/webp','image/gif','image/x-icon','image/vnd.microsoft.icon'].includes(type))return '';const bytes=thumbnailer?thumbnailer(r.bytes):r.bytes;return `data:${thumbnailer?'image/png':type};base64,${bytes.toString('base64')}`;}catch{return '';}
}
async function fetchMetadata(url,{read=readPublic,thumbnailer=null}={}) {
  const response=await read(url);if(!/text\/html|application\/xhtml\+xml/i.test(response.type))throw Error('HTMLではありません');
  let html;try{html=new TextDecoder((/charset=["']?([\w-]+)/i.exec(response.type)||[])[1]||'utf-8').decode(response.bytes);}catch{html=response.bytes.toString('utf8');}
  const data=metadata(html,response.url||url);
  data.thumbnail=await raster(data.image,read,thumbnailer)||await raster(data.icon,read,thumbnailer);delete data.image;delete data.icon;return data;
}
function urlsIn(text) { const urls=U.bareUrls(text).map(x=>x.url);for(const m of String(text||'').matchAll(/\]\((https?:\/\/[^\s)]+)\)/g))urls.push(m[1]);return [...new Set(urls)].filter(x=>{try{checkedUrl(x);return true;}catch{return false;}}); }
function createService(store,{fetcher=fetchMetadata,onProgress=()=>{}}={}) {
  const doc=(store.state().docs||{}).K_urlCache||{items:{},scanned:false};doc.items||={};let progress={running:false,total:0,done:0,failed:0,...doc.progress,running:false},inflight=new Map(),active=0,waiting=[];
  const persist=()=>store.saveDoc('K_urlCache',doc);
  async function fetchOne(url,force=false){checkedUrl(url);if(!force&&doc.items[url])return doc.items[url];if(inflight.has(url))return inflight.get(url);
    const p=(async()=>{if(active>=3)await new Promise(r=>waiting.push(r));active++;
      try{const item={...await fetcher(url),url,fetchedAt:Date.now()};doc.items[url]=item;persist();return item;}
      catch(e){const item={...(doc.items[url]||{}),url,error:String(e.message||e),fetchedAt:Date.now()};doc.items[url]=item;persist();return item;}
      finally{active--;waiting.shift()?.();inflight.delete(url);}
    })();inflight.set(url,p);return p;
  }
  async function refresh(force=false){if(progress.running)return {...progress};const state=store.state(),texts=[...state.notes.map(n=>n.body),...state.diaries.map(d=>d.body),...((state.docs.C_チャット||{}).messages||[]).map(m=>m.text)];
    const urls=[...new Set(texts.flatMap(urlsIn))].filter(u=>force||!doc.items[u]);if(!urls.length&&!force&&doc.scanned)return {...progress};progress={running:true,total:urls.length,done:0,failed:0};onProgress({...progress});
    await Promise.all(urls.map(async url=>{try{const item=await fetchOne(url,force);if(item.error)progress.failed++;}catch{progress.failed++;}progress.done++;onProgress({...progress});}));
    progress.running=false;doc.scanned=true;doc.progress={...progress};persist();onProgress({...progress});return {...progress};
  }
  return {get:fetchOne,refresh,status:()=>({...progress}),cache:()=>doc.items};
}
module.exports={publicAddress,checkedUrl,readPublic,metadata,fetchMetadata,urlsIn,createService};
