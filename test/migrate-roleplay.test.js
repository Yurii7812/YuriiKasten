const test = require('node:test');
const assert = require('node:assert/strict');
const {migrate}=require('../migrate-roleplay');
const note={kind:'rp',stem:'20261001010000',title:'ソクラテスとの会話',
data:{cast:[{id:'socrates',name:'ソクラテス'}],messages:[
{id:'m1',t:1,role:'socrates',text:'問い'},
{id:'m2',t:2,role:'self',text:'答え',reply:'m1',quote:{kind:'note',s:'d',id:'1a'}}
]}};
test('なりきりチャットを独立トピックに非破壊で移行し、発言者と返信を保持する',()=>{
 const data={topics:[],messages:[],importedRp:{}};
 const r=migrate(data,[note],[]);
 assert.equal(r.migrated.length,1);
 assert.equal(r.data.topics[0].name,'会話: ソクラテスとの会話');
 assert.equal(r.data.messages.length,2);
 assert.equal(r.data.messages[0].actor,'socrates');
 assert.deepEqual(r.data.messages[1].replies,[r.data.messages[0].id]);
 assert.deepEqual(r.data.messages[1].quote,{kind:'note',s:'d',id:'1a'});
 assert.equal(r.roles[0].name,'ソクラテス');
 assert.equal(note.kind,'rp');
 assert.equal(note.data.messages.length,2);
 assert.equal(migrate(data,[note],r.roles).migrated.length,0);
 assert.equal(data.messages.length,2);
});
