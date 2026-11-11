const test = require('node:test');
const assert = require('node:assert/strict');
const Scope = require('../display-scope');
const L = require('../lib');

test('global index projects independent namespaces and unscanned IDs without modifying input', () => {
  const notes = [{s:'d',id:'1a',keywords:['共有']},{s:'p',id:'1a',keywords:['共有']}];
  const pending = [{kw:'共有',reading:'きょうゆう',ids:['1a','2']}];
  const before = JSON.stringify({notes,pending});
  assert.deepEqual(Scope.index(notes,pending,{},'all'), [['共有',{d:['1a'],p:['1a','2']}]]);
  assert.deepEqual(Scope.index(notes,pending,{},'p'), [['共有',{d:[],p:['1a','2']}]]);
  assert.deepEqual(Scope.index(notes,pending,{},'d'), [['共有',{d:['1a'],p:[]}]]);
  assert.equal(JSON.stringify({notes,pending}), before);
});
test('topic rows, semantic refs, named topics and memos follow the display scope', () => {
  const t={entry:{s:'d',id:'1'},text:'共通 1(d) 1(p)\n^ 上位 2(p)\n= まとめ 3(d)\n+ 紙索引\n+ 電子索引\n@仕事'};
  const targets=[{name:'紙索引',entry:{s:'p',id:'2'}},{name:'電子索引',entry:{s:'d',id:'2'}}];
  const original=JSON.stringify(t), p=Scope.topic(t,'p',targets), d=Scope.topic(t,'d',targets);
  assert.deepEqual(p.rows[0],{kw:'共通',d:[],p:['1']});
  assert.deepEqual(p.refs.map(r=>r.id),['2']); assert.deepEqual(p.stars,['紙索引']); assert.deepEqual(p.chats,[]);
  assert.deepEqual(d.refs.map(r=>r.id),['3']); assert.deepEqual(d.stars,['電子索引']); assert.deepEqual(d.chats,['仕事']);
  assert.equal(JSON.stringify(t),original);
});
test('topic picker inserts a valid keyword and namespace even for numeric titles', () => {
  for (const title of ['タイトル','2026','^ 上位','']) {
    const text=Scope.topicInsertion({id:'1a',s:'p',title},'d');
    const merged=L.mergeTopic({text});
    assert.equal(merged.rows.length,1); assert.deepEqual(merged.rows[0].p,['1a']);
  }
  assert.equal(Scope.topicInsertion({id:'1',kind:'memo'}),'');
  assert.equal(Scope.topicInsertion({id:'1',noid:true}),'');
});
test('invalid persisted scopes safely default to all',()=>{
  assert.equal(Scope.normalize('bad'),'all');assert.equal(Scope.normalize(null),'all');
  assert.equal(Scope.includes('p','d'),false);assert.equal(Scope.includes('all','p'),true);
});
