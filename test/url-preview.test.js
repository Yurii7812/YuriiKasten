const test=require('node:test'),assert=require('node:assert/strict');
const U=require('../url-preview');
test('preview network guard rejects local, mapped IPv6, credentials and non-HTTP URLs',()=>{
 for(const ip of ['127.0.0.1','10.1.1.1','192.168.1.1','169.254.169.254','172.16.1.1','100.64.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1'])assert.equal(U.publicAddress(ip),false,ip);
 assert.equal(U.publicAddress('8.8.8.8'),true);assert.equal(U.publicAddress('2606:4700::1111'),true);
 for(const url of ['file:///a','javascript:alert(1)','http://user:pass@host.example','http://localhost','http://device.local'])assert.throws(()=>U.checkedUrl(url));
});
test('HTML metadata is extracted without inventing images; thumbnails use the guarded reader',async()=>{
 const calls=[];const read=async url=>{calls.push(url);if(url.endsWith('/pic.png'))return {type:'image/png',bytes:Buffer.from([1,2,3])};return {type:'text/html',url:'https://example.com/page',bytes:Buffer.from('<title>fallback</title><meta content="正式な題" property="og:title"><meta name="description" content="説明"><meta property="og:image" content="/pic.png">')};};
 const data=await U.fetchMetadata('https://example.com/page',{read});assert.equal(data.title,'正式な題');assert.equal(data.description,'説明');assert.equal(data.domain,'example.com');assert.match(data.thumbnail,/^data:image\/png;base64,/);assert.deepEqual(calls,['https://example.com/page','https://example.com/pic.png']);
 assert.equal(U.metadata('<title>title only</title>','https://example.com').image,'');
});
test('batch refresh deduplicates cached URLs, handles failures, preserves Markdown and limits concurrency',async()=>{
 const docs={},state={notes:[{body:'https://a.example\nhttps://a.example\n[別](https://b.example/path?x=1#top)'}],diaries:[{body:'https://c.example'}],docs:{'C_チャット':{messages:[{text:'https://a.example'}]}}};
 let active=0,max=0,calls=0;const fetcher=async url=>{active++;max=Math.max(max,active);calls++;await new Promise(r=>setTimeout(r,5));active--;if(url.includes('c.example'))throw Error('offline');return {title:url};};
 const store={state:()=>({...state,docs:{...state.docs,...docs}}),saveDoc:(n,o)=>{docs[n]=o;return {ok:true};}},before=JSON.stringify(state);
 const service=U.createService(store,{fetcher});let progress=await service.refresh();assert.equal(progress.total,3);assert.equal(progress.done,3);assert.equal(progress.failed,1);assert.ok(max<=3);assert.equal(calls,3);
 await service.refresh();assert.equal(calls,3);assert.equal(JSON.stringify(state),before);
 const reopened=U.createService(store,{fetcher});await reopened.get('https://a.example');assert.equal(calls,3);await reopened.refresh(true);assert.equal(calls,6);
});
test('request rejects private DNS before sending data, including an address mixed into public results',async()=>{
 await assert.rejects(U.readPublic('https://public.example',{lookup:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]}),/プライベート/);
});

test('redirects are validated before following; oversized bodies and request timeouts reject',async()=>{
 const {EventEmitter}=require('node:events');let requests=0;
 const makeRequest=(status,headers,body,hang=false)=>(url,opts,callback)=>{
   requests++;const req=new EventEmitter();req.destroy=error=>{req.emit('error',error);req.emit('close');};
   setImmediate(()=>{const res=new EventEmitter();res.statusCode=status;res.headers=headers;res.resume=()=>{};callback(res);if(!hang){if(body)res.emit('data',Buffer.from(body));res.emit('end');req.emit('close');}});return req;
 };
 const lookup=async host=>[{address:host==='127.0.0.1'?'127.0.0.1':'8.8.8.8',family:4}];
 await assert.rejects(U.readPublic('https://public.example',{lookup,request:makeRequest(302,{location:'http://127.0.0.1/private'})}),/プライベート/);assert.equal(requests,1);
 await assert.rejects(U.readPublic('https://public.example',{lookup,limit:3,request:makeRequest(200,{'content-type':'text/html'},'too long')}),/too large/);
 await assert.rejects(U.readPublic('https://public.example',{lookup,timeout:10,request:makeRequest(200,{},'',true)}),/timeout/);
});
