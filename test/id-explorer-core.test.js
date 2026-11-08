const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../id-explorer-core');
const notes = [
  { s:'d', id:'1', stem:'s1', title:'哲学入門', body:'ヘーゲルについて考える', keywords:['哲学'] },
  { s:'d', id:'1a', stem:'s2', title:'国家論', body:'国家元首 :1', keywords:['政治哲学'] },
  { s:'d', id:'1b', stem:'s3', title:'政治', body:':1aを参照', keywords:[] },
  { s:'p', id:'1', stem:'s4', title:'紙の記録', body:'国家論', keywords:['政治哲学'] },
  { s:'d', id:'20261109093000', noid:true, stem:'20261109093000', title:'未整理', body:'新たな発見', keywords:['未分類'] },
  { s:'d', id:'2', kind:'memo-group', title:'ノート化したメモ', body:'チャットの本文', keywords:['学習'] }
];
const topics = [
  { name:'1-哲学', entry:{s:'d',id:'1'}, keyword:'哲学', text:'国家論 1a 1b\n紙の思索 1(p)' },
  { name:'2-学習', entry:{s:'d',id:'2'}, keyword:'', text:'記録 2' }
];
const read = { 哲学:'てつがく', 政治哲学:'せいじてつがく' };
test('本文・タイトル・ID・グローバルIndex・トピックIndexを同時に検索できる',()=>{
  assert.deepEqual(X.search(notes,topics,read,'ヘーゲル').notes.map(n=>n.id),['1']);
  assert.deepEqual(X.search(notes,topics,read,'国家論').topics.map(t=>t.name),['1-哲学']);
  assert.equal(X.search(notes,topics,read,'てつがく').keywords.length,2); // 2種類のキーワードのよみに一致
  assert.equal(X.search(notes,topics,read,'チャットの本文').notes[0].kind,'memo-group');
  assert.equal(X.search(notes,topics,read,'未分類').keywords.length,0); // IDなしのメモはグローバルIndexに載せない
});
test('索引からノートへたどり、紙・デジタルと未登録の参照を分ける',()=>{
  const t=X.topicEntries(topics[0],notes);
  assert.equal(t.entry.id,'1');
  assert.deepEqual(t.rows[0].notes.map(n=>n.s+':'+n.id),['d:1a','d:1b']);
  assert.equal(t.rows[1].notes[0].note.title,'紙の記録');
  assert.deepEqual(X.noteRelations(notes[0],notes,topics).children.map(n=>n.id),['1a','1b']);
  assert.equal(X.noteRelations(notes[1],notes,topics).backlinks[0].id,'1b');
});
test('ID候補はFolgezettelの分岐・並列規則を守り、既存番号を飛ばす',()=>{
  assert.equal(X.suggest(notes, notes[0],'child'),'1c');
  assert.equal(X.suggest(notes, notes[1],'sibling'),'1c');
  assert.equal(X.suggest(notes, notes[3],'child'),null); // 紙のノートをデジタルの親として選ばない
  assert.equal(X.nextRoot(notes),'3');
  assert.equal(X.available(notes,'1a'),false);
  assert.equal(X.available(notes,'1a',notes[1]),true);
  assert.equal(X.available(notes,'20261109093000'),false);
});

test('未取り込みの紙Indexも検索でき、存在しないノートとして区別する',()=>{
  const pending = [{kw:'紙の資料',reading:'かみのしりょう',ids:['9a','9b(1)']}];
  const result = X.search(notes, topics, read, 'かみのしりょう', pending);
  assert.deepEqual(result.keywords.map(k=>k.name),['紙の資料']);
  assert.deepEqual(result.keywords[0].pending,['9a','9b(1)']);
  assert.equal(result.notes.length,0);
  assert.equal(result.topics.length,0);
});
