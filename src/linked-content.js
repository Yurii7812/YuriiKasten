import { WidgetType, Decoration, EditorView } from '@codemirror/view';
import { StateField } from '@codemirror/state';
import Core from '../link-core.js';
import L from '../lib.js';
import Urls from '../url-links.js';
import { ctx, $, esc, dialog, toast, popMenu, renderMd, uid } from './shared.js';
let links = { items: [] }, display = { occurrences: {} }, cache = {}, version = 0;
const widgets = new Set();
export function init(docs) {
  if (!ctx.hasPending?.('doc:links')) links = docs.K_links || { items: [] };
  if (!ctx.hasPending?.('doc:display')) display = docs.K_display || { occurrences: {} };
  links.items ||= []; display.occurrences ||= {}; cache = docs.K_urlCache?.items || {}; version++;
}
export const allLinks = () => links.items;
export const memos = () => ctx.memos?.() || [];
export const sources = () => [...ctx.notes().map(n=>({...n,kind:'note',text:n.body||''})), ...memos().map(m=>({...m,kind:'memo',title:(m.text||'').split('\n')[0],body:m.text||''})), ...(ctx.diaries?.()||[]).map(d=>({...d,recordKind:d.kind,kind:'diary',id:d.stem,title:d.title||d.date,text:d.body||''}))];
const saveLinks = () => { ctx.saveDocument('doc:links','K_links',links); version++; refresh(); };
const saveDisplay = () => ctx.saveDocument('doc:display','K_display',display);
const href = link => `[${Core.safeTitle(link.title)}](link:${link.id})`;
const sourceTitle = x => x.title || (x.text||x.body||'').split('\n')[0] || x.id;
function targetTitle(t) {return Core.resolve(t,ctx.notes(),memos()).title;}
export function targetNote(n, selection) { return Core.targetOf({...n,kind:'note'},selection?.from,selection?.to); }
export function targetMemo(m, selection) { return Core.targetOf({...m,kind:'memo'},selection?.from,selection?.to); }
export function search(query) {
  const q=query.trim().toLowerCase();
  return sources().filter(x=>x.kind!=='diary' && (!ctx.inScope || ctx.inScope(x.s || 'd'))).map(x=>{
    const fields=[x.id,x.title,x.text,...(x.keywords||[]),x.topic,...(x.ups||[])].filter(Boolean).map(v=>String(v).toLowerCase());
    return {x,score:!q?0:fields.some(v=>v===q)?3:fields.some(v=>v.startsWith(q))?2:fields.some(v=>v.includes(q))?1:-1};
  }).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||(b.x.t||L.parseTime(b.x.created)?.getTime()||0)-(a.x.t||L.parseTime(a.x.created)?.getTime()||0)||String(a.x.id).localeCompare(String(b.x.id))).map(x=>x.x);
}
export function openTarget(target) {
  const item=Core.resolve(target,ctx.notes(),memos());
  if(item.missing)return toast('参照先が見つかりません');
  if ($('#modal').style.display === 'flex' && !$('#ln-targets')) $('#modal').style.display = 'none';
  if(target.kind==='memo') {ctx.gotoMemo(target.id);if(target.range)setTimeout(()=>ctx.highlightMemo?.(target.id,target.range),0);return;}
  ctx.openNote(item.source.s,item.source.id);
  if(item.range&&target.range)ctx.selectRange?.(item.range.from,item.range.to);
}
function sourceLink(hit) {
  const b=document.createElement('button');b.className='link-backlink';b.textContent=(hit.source.kind==='memo'?'💬 ':'📝 ')+sourceTitle(hit.source);
  b.onclick=()=>{if(hit.source.kind==='diary')ctx.openDiary(hit.source.date,false,hit.source.recordKind||'日記');else openTarget(Core.targetOf(hit.source));if(hit.source.kind!=='memo')ctx.selectRange?.(hit.from,hit.to);};return b;
}
export function edit(initial=[], existing=null) {
  let draft=existing?JSON.parse(JSON.stringify(existing)):{id:uid(),title:'',targets:initial,order:'newest'}, manualEditing=false;
  dialog(`<div class="link-dialog"><h3>${existing?'リンクを編集':'リンクを作成'}</h3><label>タイトル<input id="ln-title" value="${esc(draft.title)}" placeholder="リンクのタイトル"></label>
    <div class="link-search"><input id="ln-query" placeholder="本文・ID・トピックを検索"><div id="ln-results" class="link-results"></div></div>
    <div class="row"><b id="ln-count"></b><select id="ln-order" aria-label="参照先の表示順"></select></div><div id="ln-targets" class="link-targets"></div>
    <section id="ln-range" hidden><p>元の文章から参照する範囲を選択してください。参照先の本文は変更しません。</p><textarea id="ln-range-text" readonly></textarea><button id="ln-range-ok">選択範囲を使う</button><button id="ln-range-all">全体を参照</button><button id="ln-range-no">閉じる</button></section>
    <div id="ln-backlinks"></div><div id="ln-error" role="alert"></div><div class="row"><button class="p" id="ln-save">保存</button><button id="ln-cancel">やめる</button></div></div>`,close=>{
    let candidates=[],active=0,searchLimit=40,rangeIndex=-1;
    const drawSearch=()=>{candidates=search($('#ln-query').value);active=Math.min(active,Math.max(0,candidates.length-1));$('#ln-results').innerHTML=candidates.slice(0,searchLimit).map((x,i)=>`<button class="link-result${i===active?' on':''}" data-ln-add="${i}"><b data-user>${esc(sourceTitle(x).slice(0,100))}</b><small>${x.kind==='memo'?'💬 チャットメモ':x.s==='p'?'📜 紙ノート':'📝 ノート'} ${esc(x.id)}</small></button>`).join('')+(candidates.length>searchLimit?'<button id="ln-more">さらに表示</button>':'');};
    const draw=()=>{
      const data=Core.ordered(draft,ctx.notes(),memos());
      $('#ln-count').textContent=`参照先 ${draft.targets.length}件`;
      $('#ln-order').innerHTML=[['newest','日付：新しい順'],['oldest','日付：古い順'],['kind','種別順'],['manual',draft.manual?'指定順':'順序を指定']].map(([v,l])=>`<option value="${v}"${(manualEditing?'manual':draft.order)===v?' selected':''}>${l}</option>`).join('');
      $('#ln-targets').innerHTML=data.map((r,i)=>`<div class="link-target"><button data-ln-open="${i}" data-user>${esc(r.title)}</button>${r.target.range?'<small>範囲参照</small>':''}<span class="grow"></span>${manualEditing||draft.order==='manual'?`<button data-ln-move="${i}" data-delta="-1"${i===0?' disabled':''}>↑</button><button data-ln-move="${i}" data-delta="1"${i===data.length-1?' disabled':''}>↓</button>`:''}<button data-ln-range="${i}">範囲</button><button data-ln-remove="${i}" aria-label="参照先を外す">×</button></div>`).join('');
      const box=$('#ln-backlinks');box.replaceChildren();if(existing){const hits=Core.backlinks(draft.id,sources());const h=document.createElement('h4');h.textContent=`バックリンク ${hits.length}件`;box.append(h,...hits.map(sourceLink));}
    };
    $('#ln-query').oninput=()=>{active=0;searchLimit=40;drawSearch();};
    $('#ln-query').onkeydown=e=>{if(e.isComposing)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();active=Math.max(0,Math.min(candidates.length-1,active+(e.key==='ArrowDown'?1:-1)));searchLimit=Math.max(searchLimit,active+1);drawSearch();}if(e.key==='Enter'){e.preventDefault();add(active);}};
    function add(i){const x=candidates[i];if(!x)return;const t=Core.targetOf(x);if(!draft.targets.some(y=>Core.keyOf(y)===Core.keyOf(t)))draft.targets.push(t);if(draft.manual&&!draft.manual.includes(Core.keyOf(t)))draft.manual.push(Core.keyOf(t));draw();$('#ln-query').focus();}
    $('#ln-results').onclick=e=>{const b=e.target.closest('[data-ln-add]');if(b)add(+b.dataset.lnAdd);if(e.target.id==='ln-more'){searchLimit+=40;drawSearch();}};
    $('#ln-order').onchange=e=>{if(e.target.value==='manual'&&!draft.manual){manualEditing=true;}else{manualEditing=false;draft.order=e.target.value;}draw();};
    $('#ln-targets').onclick=e=>{
      const data=Core.ordered(draft,ctx.notes(),memos()),b=e.target.closest('button');if(!b)return;
      if(b.dataset.lnMove!==undefined){const i=+b.dataset.lnMove;draft=Core.move(draft,data.map(r=>Core.keyOf(r.target)),i,i+(+b.dataset.delta));manualEditing=false;draw();}
      if(b.dataset.lnOpen!==undefined)openTarget(data[+b.dataset.lnOpen].target);
      if(b.dataset.lnRemove!==undefined){const key=Core.keyOf(data[+b.dataset.lnRemove].target);draft.targets=draft.targets.filter(t=>Core.keyOf(t)!==key);if(draft.manual)draft.manual=draft.manual.filter(k=>k!==key);draw();}
      if(b.dataset.lnRange!==undefined){const t=data[+b.dataset.lnRange].target;rangeIndex=draft.targets.findIndex(x=>Core.keyOf(x)===Core.keyOf(t));const r=Core.resolve({...t,range:null},ctx.notes(),memos());if(r.missing)return;$('#ln-range').hidden=false;$('#ln-range-text').value=r.text;const old=Core.locate(r.text,t.range);if(old)$('#ln-range-text').setSelectionRange(old.from,old.to);$('#ln-range-text').focus();}
    };
    $('#ln-range-no').onclick=()=>{$('#ln-range').hidden=true;};
    $('#ln-range-text').onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();$('#ln-range').hidden=true;}};
    const setRange=all=>{const input=$('#ln-range-text');try{const t=draft.targets[rangeIndex],oldKey=Core.keyOf(t);if(all)delete t.range;else t.range=Core.rangeOf(input.value,input.selectionStart,input.selectionEnd);if(draft.manual)draft.manual=draft.manual.map(k=>k===oldKey?Core.keyOf(t):k);$('#ln-range').hidden=true;draw();}catch(e){$('#ln-error').textContent=e.message;}};
    $('#ln-range-ok').onclick=()=>setRange(false);$('#ln-range-all').onclick=()=>setRange(true);
    $('#ln-cancel').onclick=close;
    $('#ln-save').onclick=async()=>{try{draft.title=$('#ln-title').value;draft=Core.normalizeLink(draft,existing);const i=links.items.findIndex(x=>x.id===draft.id);if(i<0)links.items.push(draft);else links.items[i]=draft;saveLinks();await ctx.flush();close();detail(draft.id);}catch(e){$('#ln-error').textContent=e.message;}};
    draw();drawSearch();$('#ln-title').focus();
  });
}
export function detail(id) {
  const link=links.items.find(l=>l.id===id);if(!link)return toast('リンクが見つかりません');
  dialog(`<h3 data-user>${esc(link.title)}</h3><div id="ln-preview"></div><div class="row"><button id="ln-copy">リンクをコピー</button><button id="ln-note">通常ノートを作成</button><button id="ln-edit">リンクを編集</button><button id="ln-close">閉じる</button></div><h4>バックリンク</h4><div id="ln-uses"></div>`,close=>{
    $('#ln-preview').append(embed(`link:${id}`,[],`link-detail:${id}`));
    $('#ln-copy').onclick=async()=>{await navigator.clipboard.writeText(href(link));toast('リンクをコピーしました');};
    $('#ln-note').onclick=async()=>{try{await ctx.flush();const n=await ctx.api.createNote({kind:'text',title:link.title,body:'!'+href(link)+'\n'});ctx.addNote(n);await ctx.refreshDiaries();close();ctx.openNote(n.s,n.id);}catch{toast('ノートを保存できませんでした');}};
    $('#ln-edit').onclick=()=>{close();edit([],link);};$('#ln-close').onclick=close;
    $('#ln-uses').append(...Core.backlinks(id,sources().filter(x => !ctx.inScope || ctx.inScope(x.s || 'd'))).map(sourceLink));
  });
}
export function browse() {dialog('<h3>リンク</h3><button id="ln-new">リンクを作成</button><div id="ln-library"></div>',()=>{const box=$('#ln-library');for(const l of links.items.filter(l => l.targets.some(t => !ctx.inScope || ctx.inScope(t.s || 'd')))){const b=document.createElement('button');b.textContent=l.title;b.onclick=()=>detail(l.id);box.append(b);}$('#ln-new').onclick=()=>edit();});}
export function chooseMemo(onChoose) {
  dialog('<h3>チャットメモを選ぶ</h3><input id="ln-memo-query" placeholder="本文・トピックを検索"><div id="ln-memo-results" class="link-results"></div>', close => {
    let count = 40;
    const draw = () => {
      const results = search($('#ln-memo-query').value).filter(x => x.kind === 'memo'), box = $('#ln-memo-results');
      box.replaceChildren();
      for (const m of results.slice(0,count)) { const b = document.createElement('button'); b.textContent = sourceTitle(m); b.onclick = () => { close(); onChoose(m); }; box.append(b); }
      if (results.length > count) { const b = document.createElement('button'); b.textContent = 'さらに表示'; b.onclick = () => { count += 40; draw(); }; box.append(b); }
    };
    $('#ln-memo-query').oninput = () => { count = 40; draw(); }; draw(); $('#ln-memo-query').focus();
  });
}
export function memoBacklinks(memo) {
  const uses = [...Core.backlinks(memo.id,sources(),'memo'),...Core.backlinks(memo.id,sources(),'reply')];
  return uses.map(hit => `<a data-file="${esc(hit.source.kind==='memo'?'memo:'+hit.source.id:'note:'+hit.source.stem+'#range='+hit.from+'-'+hit.to)}">${hit.kind==='reply'?'↩ リプライ':'@ メンション'} ${esc(sourceTitle(hit.source))}</a>`).join('') +
    links.items.filter(l=>l.targets.some(t=>t.kind==='memo'&&t.id===memo.id)).map(l=>`<a data-file="link:${esc(l.id)}">🔗 ${esc(l.title)}</a>`).join('');
}
function pref(key){return display.occurrences[key]||{};}
function changePref(key,data){display.occurrences[key]={...pref(key),...data};saveDisplay();}
export function embed(uri,path=[],occurrence='',label='',virtualLink=null,existingRoot=null) {
  const root=existingRoot||document.createElement('section');root.className='linked-expansion';root.dataset.user='';root._lcBound=true;Object.assign(root.dataset,{uri,path:JSON.stringify(path),occurrence,label});
  const key=occurrence||uri,prefs=pref(key),id=uri.slice(uri.indexOf(':')+1),kind=uri.split(':')[0];
  if(path.includes(uri)){root.innerHTML=`<a data-file="${esc(uri)}">循環参照：${esc(label||id)}</a>`;return root;}
  const legacy=kind==='link'&&id.startsWith('legacy-')?ctx.notes().find(n=>n.stem===id.slice(7)):null;
  const link=virtualLink||(legacy?{id,title:legacy.title,targets:(legacy.data?.memoIds||[]).map(id=>({kind:'memo',id})),order:'newest'}:kind==='link'?links.items.find(l=>l.id===id):null);
  const note=kind==='note'?ctx.notes().find(n=>n.stem===id):null;
  const data=link?Core.ordered(link,ctx.notes(),memos(),prefs.order||link.order):kind==='memo'?[Core.resolve({kind:'memo',id},ctx.notes(),memos())]:note?[Core.resolve(Core.targetOf({...note,kind:'note'}),ctx.notes(),memos())]:[];
  root.innerHTML=`<header class="linked-head"><button class="linked-fold" aria-expanded="${!prefs.collapsed}">${prefs.collapsed?'▸':'▾'}</button><a data-file="${esc(uri)}" class="linked-title">${esc(link?.title||label||data[0]?.title||'参照先が見つかりません')}</a>${data.some(x=>x.kind==='memo')?`<label><input type="checkbox" class="linked-time"${prefs.time?' checked':''}>日時</label>`:''}${link?`<select class="linked-order" aria-label="展開の表示順">${[['newest','日付：新しい順'],['oldest','日付：古い順'],['kind','種別順'],...(!link.id.startsWith('legacy-')?[['manual',link.manual?'指定順':'順序を指定']]:[])].map(([v,l])=>`<option value="${v}"${(prefs.order||link.order)===v?' selected':''}>${l}</option>`).join('')}</select>`:''}</header><div class="linked-prose"${prefs.collapsed?' hidden':''}></div>`;
  const body=root.querySelector('.linked-prose');
  for(const r of data.filter(r => !ctx.inScope || ctx.inScope(r.source?.s || r.target?.s || 'd'))){const section=document.createElement('div');section.className='linked-source';
    const title=document.createElement('a');title.className='linked-source-title';title.textContent=r.title;title.onclick=e=>{e.preventDefault();e.stopPropagation();openTarget(r.target);};section.append(title);
    if(prefs.time&&r.date){const time=document.createElement('time');time.textContent=new Date(r.date).toLocaleString();section.append(time);}
    const content=document.createElement('div');
    const route=r.target.kind==='memo'?`memo:${r.target.id}`:`note:${r.source?.stem}`;
    if(r.missing||r.missingRange)content.textContent=r.missing?'参照先が見つかりません':'参照範囲が変更または削除されています。リンクの編集で範囲を確認してください。';
    else if(path.includes(route))content.innerHTML=`<a data-file="${esc(route)}">循環参照を開く</a>`;
    else {content.innerHTML=renderMd(r.text,{path:[...path,uri,route],owner:route});if(r.source?.s==='p'&&r.source.image){const img=document.createElement('img');img.src=r.source.image;img.className='linked-paper';content.prepend(img);}}
    section.append(content);body.append(section);
  }
  root.querySelector('.linked-fold').onclick=e=>{e.stopPropagation();changePref(key,{collapsed:!pref(key).collapsed});replace();};
  root.querySelector('.linked-time')?.addEventListener('change',e=>{changePref(key,{time:e.target.checked});replace();});
  root.querySelector('.linked-order')?.addEventListener('change',e=>{if(e.target.value==='manual'&&!link.manual){edit([],link);return;}changePref(key,{order:e.target.value});replace();});
  function replace(){embed(uri,path,occurrence,label,virtualLink,root);}
  return root;
}
const pendingMetadata=new Map();
export function urlPreview(url,key,existingRoot=null,label='') {
  const root=existingRoot||document.createElement('div');root.replaceChildren();root.className='url-preview';root.dataset.user='';root._lcBound=true;label=label||root.dataset.label||'';Object.assign(root.dataset,{url,occurrence:key,label});const hidden=pref(key).preview===false,data=cache[url];root.classList.toggle('url-preview-off',hidden||!!data?.error);
  const link=document.createElement('a');link.dataset.file=url;link.className='url-preview-link';
  if(hidden||data?.error){link.textContent=label||url;}else{
    if(data?.thumbnail&&/^data:image\/(png|jpeg|webp|gif|x-icon|vnd.microsoft.icon);base64,/.test(data.thumbnail)){const img=document.createElement('img');img.src=data.thumbnail;img.alt='';link.append(img);}
    const texts=document.createElement('span'),title=document.createElement('b'),description=document.createElement('small'),domain=document.createElement('small');title.textContent=data?.title||url;description.textContent=data?.description||'';try{domain.textContent=new URL(url).hostname;}catch{}texts.append(title,description,domain);link.append(texts);
  }
  const menu=document.createElement('button');menu.className='url-menu';menu.textContent='⋯';menu.title='URLプレビューの設定';
  menu.onclick=e=>{e.preventDefault();e.stopPropagation();popMenu({clientX:e.clientX,clientY:e.clientY},[[hidden?'プレビューを表示':'プレビューを非表示',()=>{changePref(key,{preview:hidden});urlPreview(url,key,root);}],['情報を再取得',async()=>{try{cache[url]=await ctx.api.urlPreview(url,true);urlPreview(url,key,root);}catch{toast('URL情報を取得できませんでした');}}]]);};root.append(link,menu);
  if(!data&&!pendingMetadata.has(url)&&ctx.api.urlPreview){const request=Promise.resolve(ctx.api.urlPreview(url)).then(data=>{cache[url]=data||{error:'取得できません'};for(const el of document.querySelectorAll('.url-preview[data-url]'))if(el.dataset.url===url)urlPreview(url,el.dataset.occurrence,el);refresh();}).catch(()=>{cache[url]={error:'取得できません'};}).finally(()=>pendingMetadata.delete(url));pendingMetadata.set(url,request);}
  return root;
}
function occurrenceKey(owner,text,from,uri){const prefix=text.slice(Math.max(0,from-32),from),before=text.slice(0,from);const nth=before.split(uri).length-1;return JSON.stringify([owner,uri,prefix,nth]);}
export function enhance(el,{path=[],owner='rendered'}={}) {
  owner=JSON.stringify([path,owner]);
  for(const img of [...el.querySelectorAll('img')]){const src=img.getAttribute('src')||'';let uri=src;if(/^\d{14}(?:-\d+)?\.md$/.test(src))uri='note:'+src.slice(0,-3);if(/^(link|memo|note):/.test(uri))img.replaceWith(embed(uri,path,JSON.stringify([owner,uri,img.alt]),img.alt));}
  for(const a of [...el.querySelectorAll('p>a:only-child')]){const url=a.dataset.file||a.getAttribute('href');if(!/^https?:\/\//.test(url||''))continue;const p=a.parentElement;if(p.textContent.trim()!==a.textContent.trim())continue;const index=[...el.querySelectorAll('a')].filter(x=>(x.dataset.file||x.getAttribute('href'))===url).indexOf(a);p.replaceWith(urlPreview(url,JSON.stringify([owner,url,index]),null,a.textContent));}
}
export class ContentWidget extends WidgetType {
  constructor(uri,label,key,path=[]){super();Object.assign(this,{uri,label,key,path,version});}
  eq(o){return o.uri===this.uri&&o.label===this.label&&o.key===this.key&&o.version===this.version;}
  toDOM(){return /^https?:/.test(this.uri)?urlPreview(this.uri,this.key,null,this.label):embed(this.uri,this.path,this.key,this.label);}
  ignoreEvent(){return true;}
}
export function decorations(owner,space='d') {
  const build=state=>{const result=[],text=state.doc.toString(),blocked=L.codeRanges(text);let pos=0;
    for(const line of text.split('\n')){
      if(!blocked.some(([a,b])=>pos>=a&&pos<b)){
        let embeds=0;
        for(const m of line.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)){
          const at=pos+m.index;if(line[m.index-1]==='\\'||blocked.some(([a,b])=>at>=a&&at<b))continue;
          let uri=m[2];if(/^\d{14}(?:-\d+)?\.md$/.test(uri))uri='note:'+uri.slice(0,-3);
          if(/^(link|memo|note):/.test(uri)){embeds++;result.push(Decoration.widget({widget:new ContentWidget(uri,m[1],occurrenceKey(owner,text,at,uri),[owner]),block:true,side:embeds}).range(pos+line.length));}
        }
        if(!embeds){
          const token=line.trim(),md=/^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/.exec(token),url=md?.[2]||(/^https?:\/\/\S+$/.test(token)?token:null);
          if(url)result.push(Decoration.widget({widget:new ContentWidget(url,md?.[1]||'',occurrenceKey(owner,text,pos,url)),block:true,side:1}).range(pos+line.length));
        }
      }
      pos+=line.length+1;
    }
    return Decoration.set(result,true);
  };
  return StateField.define({create:build,update:(v,tr)=>tr.docChanged||tr.effects.some(e=>e.is(refreshEffect))?build(tr.state):v,provide:f=>EditorView.decorations.from(f)});
}
import { StateEffect } from '@codemirror/state';
const refreshEffect=StateEffect.define();
export function registerView(view){widgets.add(view);}
export function refresh(){version++;for(const el of document.querySelectorAll('.linked-expansion[data-uri]'))if(el.isConnected&&!el.closest('.cm-editor'))embed(el.dataset.uri,JSON.parse(el.dataset.path||'[]'),el.dataset.occurrence,el.dataset.label,null,el);for(const v of widgets){if(!v.dom.isConnected){widgets.delete(v);continue;}try{v.dispatch({effects:refreshEffect.of(null)});}catch{}}}
export function openUri(uri){const [kind,id]=[uri.slice(0,uri.indexOf(':')),uri.slice(uri.indexOf(':')+1)];if(kind==='link'){detail(id);return true;}if(kind==='memo'||kind==='reply'){ctx.gotoMemo(id);return true;}if(kind==='note'){const [stem,location]=id.split('#'),n=ctx.notes().find(n=>n.stem===stem);if(n){ctx.openNote(n.s,n.id);const m=/^range=(\d+)-(\d+)$/.exec(location||'');if(m)ctx.selectRange?.(+m[1],Math.min(+m[2],n.body.length));}else toast('参照先が見つかりません');return true;}return false;}
// HTML returned by renderMd is inserted by callers. Restore interactive controls
// after insertion without serializing event handlers into Markdown or user data.
export function install() {
  const hydrate = () => {
    for (const root of document.querySelectorAll('.linked-expansion[data-uri],.url-preview[data-url]')) {
      if (root._lcBound || !root.isConnected) continue;
      if (root.dataset.uri) embed(root.dataset.uri,JSON.parse(root.dataset.path||'[]'),root.dataset.occurrence,root.dataset.label,null,root);
      else urlPreview(root.dataset.url,root.dataset.occurrence,root);
    }
  };
  const observer=new MutationObserver(hydrate);observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',e=>{const a=e.target.closest('.linked-expansion [data-file],.url-preview [data-file]');if(a){e.preventDefault();e.stopImmediatePropagation();ctx.openLink(a.dataset.file);}},true);
}
export function legacyGroup(el,note) {
  const descriptor={id:'legacy-'+note.stem,title:note.title||'元のチャットメモ',targets:(note.data?.memoIds||[]).map(id=>({kind:'memo',id})),order:'newest'};
  el.replaceChildren(embed('link:'+descriptor.id,[],'legacy:'+note.stem,note.title,descriptor));
}
