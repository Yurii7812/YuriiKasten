const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../chat-topic-navigation');
const memos=[
{id:'a',topic:'哲学',ups:['政治思想']},
{id:'b',topic:'認識論',ups:['哲学']},
{id:'c',topic:'科学哲学',ups:['哲学','科学']},
{id:'d',topic:'哲学',ups:['ドイツ思想']},
{id:'e',topic:'哲学',ups:[]}
];
test('属性は各メモの上位・所属から導出し、固定フォルダではない',()=>{
 assert.deepEqual(T.candidates(memos,'哲学').upper.map(x=>x.name),['ドイツ思想','政治思想']);
 assert.deepEqual(T.candidates(memos,'哲学').lower.map(x=>x.name),['科学哲学','認識論']);
 assert.deepEqual(T.filter(memos,'哲学',['政治思想']).map(x=>x.id),['a']);
 assert.deepEqual(T.filter(memos,'哲学',[],['認識論']).map(x=>x.id),['b']);
 assert.deepEqual(T.filter(memos,'哲学',['ドイツ思想'],['科学哲学']).map(x=>x.id),['c','d']);
});
test('選択移動は最後に選択した有効トピックだけを対象にする',()=>{
 assert.equal(T.destination(['ドイツ思想'],[]),'ドイツ思想');
 assert.equal(T.destination(['ドイツ思想'],['認識論']),null);
 assert.equal(T.destination(['ドイツ思想'],['認識論'],'認識論'),'認識論');
});
