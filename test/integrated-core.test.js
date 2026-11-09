const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const C=require('../link-core'),R=require('../reference-search'),T=require('../topic-ranking'),B=require('../topic-bulk'),{openVault}=require('../store');
const notes=[{s:'d',id:'1a',stem:'20261101000001',body:'前文 対象の文章 後文',title:'哲学',created:'2026-11-01 10:00:00',keywords:['認識論']},{s:'p',id:'1a',stem:'20261102000001',body:'紙の文章',title:'紙',created:'2026-11-02 10:00:00',keywords:[]}];
const memos=[{id:'m1',text:'新しいメモ',t:Date.parse('2026-11-03T00:00:00Z')}];
test('stable links mix notes, paper and memo ranges; default order is newest and manual order exists only after moving',()=>{
 const targets=[C.targetOf({...notes[0],kind:'note'}),C.targetOf({...memos[0],kind:'memo'},0,3),C.targetOf({...notes[1],kind:'note'})];
 let l=C.normalizeLink({id:'a',title:'混在',targets});assert.equal(l.order,'newest');assert.equal(l.manual,undefined);
 assert.deepEqual(C.ordered(l,notes,memos).map(x=>x.kind),['memo','paper','note']);
 const keys=C.ordered(l,notes,memos).map(x=>C.keyOf(x.target));
 l=C.move(l,keys,0,2);assert.equal(l.order,'manual');assert.equal(l.manual.length,3);
 const old=[...l.manual];l=C.normalizeLink({...l,order:'oldest',title:'変更',id:'wrong'},l);assert.equal(l.id,'a');assert.deepEqual(l.manual,old);
 const n={...notes[0],id:'9'};assert.equal(C.resolve(targets[0],[n,notes[1]],memos).source.id,'9');
 const p=C.normalizeLink({...l,targets:[...targets,...targets]});assert.equal(p.targets.length,3);
});
test('range follows inserted prose but removed or ambiguous quotes never refer to unrelated text',()=>{
 const range=C.rangeOf(notes[0].body,3,8);assert.equal(C.locate('追記 '+notes[0].body,range).text,'対象の文章');
 assert.equal(C.locate('すべて消えた',range),null);
 assert.equal(C.locate('対象の文章 / 対象の文章',{quote:'対象の文章',prefix:'消えた文脈',suffix:'消えた文脈'}),null);
 assert.equal(C.resolve({...C.targetOf({...notes[0],kind:'note'}),range},[{...notes[0],body:'削除'}],[]).missingRange,true);
});
test('links and ranges survive store restart, ID change and deletion without changing originals',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yn-links-'));try{
 let v=openVault(dir);const n=v.saveNote({s:'d',id:'1',body:'原文そのまま'});const target=C.targetOf({...n,kind:'note'},0,2);
 const link=C.normalizeLink({id:'fixed',title:'参照',targets:[target]});v.saveDoc('K_links',{items:[link]});
 v.rename('d','1','2');v=openVault(dir);const data=v.state();assert.equal(data.docs.K_links.items[0].id,'fixed');assert.equal(C.resolve(target,data.notes,[]).source.id,'2');assert.equal(data.notes[0].body,'原文そのまま');
 v.deleteNotes([{s:'d',id:'2'}]);assert.equal(C.resolve(target,v.state().notes,[]).missing,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('backlinks keep occurrence offsets and distinguish mention and reply; code is ignored',()=>{
 const source={id:'n',kind:'note',text:'[参照](link:a) :[メモ](memo:m1) [返信](reply:m1) ` [code](link:a) `'};
 assert.equal(C.backlinks('a',[source]).length,1);assert.equal(C.backlinks('m1',[source],'memo').length,1);assert.equal(C.backlinks('m1',[source],'reply').length,1);
 assert.equal(C.backlinks('a',[source])[0].from,0);
});
test('reference search directions are determined by Enter/Shift+Enter, with paper IDs kept distinct',()=>{
 assert.equal(R.insertion(notes[0],false),':1a');assert.equal(R.insertion(notes[0],true),'1a:');
 assert.equal(R.insertion(notes[1],false),':1a(p)');assert.equal(R.insertion(notes[1],true),'1a(p):');
 assert.equal(R.insertion({...memos[0],kind:'memo'},false),':[新しいメモ](memo:m1)');assert.equal(R.insertion({...memos[0],kind:'memo'},true),'[新しいメモ](memo:m1):');
 const s=new R.Session();assert.equal(s.update(':',1,':').query,'');assert.equal(s.update(':哲学',3,'哲学').query,'哲学');
 s.close();assert.equal(s.update(':哲学の続き',7,'の続き'),null);assert.equal(s.update(':哲学',2,''),null);assert.ok(s.update(':哲学\n:',5,':'));
 const p=new R.Session();const state=p.update('ヘーゲル:',5,':');assert.equal(state.from,0);assert.equal(state.query,'ヘーゲル');
});
test('reference triggers ignore code fences, inline code, URLs, time and existing references',()=>{
 for(const text of ['```js\nfoo:','~~~\nfoo:','`foo:`','[site](https:','https:','10:','1a:','[memo](memo:']) {
  const p=text.endsWith('`')?text.length-1:text.length;assert.equal(new R.Session().update(text,p,':'),null,text);
 }
});
test('topic proximity prioritizes exact evidence over recency/root, direct parents over remote roots and precise search matches',()=>{
 const n={s:'d',id:'1a1',keywords:['認識論'],body:':8',title:'思想'};
 const all=[n,{s:'d',id:'1a',body:'',keywords:[]},{s:'d',id:'1b',body:'',keywords:[]},{s:'d',id:'8',body:'',keywords:[]}];
 const ts=[{name:'最近',entry:{s:'d',id:'4'},text:''},{name:'遠い系統',entry:{s:'d',id:'1b'},text:''},{name:'親',entry:{s:'d',id:'1a'},text:''},{name:'具体',text:'認識論 9'},{name:'直接リンク',entry:{s:'d',id:'8'},text:''}];
 const rank=T.rank(n,ts,all,['最近']);assert.ok(rank.get('具体').score>rank.get('最近').score);assert.ok(rank.get('親').score>rank.get('遠い系統').score);assert.ok(rank.get('直接リンク').score>rank.get('遠い系統').score);
 const q=T.rank(n,[...ts,{name:'具体的',text:''}],all,[],'具体');assert.ok(q.get('具体').score>q.get('具体的').score);
 assert.deepEqual([...T.rank(n,ts,all)], [...T.rank(n,ts,all)]);
 const digital=T.rank({...n,s:'p'},ts,all);assert.equal(digital.get('親').near,false);
});
test('topic addition preserves differing existing memberships; replacement requires an explicit mode',()=>{
 const before=[{id:'a',topic:'哲学',ups:['思想']},{id:'b',topic:'歴史',ups:[]}];
 const copy=JSON.stringify(before),counts=B.aggregate(before);assert.equal(counts.get('哲学'),1);
 const added=B.assign(before,['認識論']);assert.deepEqual(B.members(added[0]),['哲学','思想','認識論']);assert.deepEqual(B.members(added[1]),['歴史','認識論']);
 assert.equal(JSON.stringify(before),copy);
 const replace=B.assign(before,['認識論'],'replace');assert.deepEqual(replace.map(B.members),[['認識論'],['認識論']]);
 const primary=B.assign(before,[],'add','新しい所属');assert.ok(B.members(primary[0]).includes('哲学'));
});
