const test=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),vm=require('node:vm');
const Scope=require('../display-scope');
test('real graph projection excludes the other namespace and dangling edges',async()=>{
 const bundle=await esbuild.build({entryPoints:['src/graph.js'],bundle:true,write:false,format:'iife',globalName:'Graph',plugins:[{name:'renderer-stub',setup(build){build.onResolve({filter:/^force-graph$/},()=>({path:'force-graph',namespace:'stub'}));build.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export default function() {}'}));}}]});
 const context={};vm.runInNewContext(bundle.outputFiles[0].text,context);
 const notes=[{s:'d',id:'1',title:'digital',body:':1(p)',keywords:['共通']},{s:'p',id:'1',title:'paper',body:':1(d)',keywords:['共通']},{s:'p',id:'1a',title:'paper child',body:':1',keywords:[]}];
 for(const scope of ['all','p','d']) {
  const visible=notes.filter(n=>Scope.includes(scope,n.s));
  const data=context.Graph.loadNotesAndRelations(visible,n=>n.title,'tree',{paper:true,orphans:true});
  const ids=new Set(data.nodes.map(n=>n.id));
  assert.equal(data.nodes.filter(n=>n.kind==='note').length,visible.length);
  for(const n of data.nodes)if(n.kind==='note')assert.ok(Scope.includes(scope,n.s));
  for(const e of data.links){assert.ok(ids.has(e.source));assert.ok(ids.has(e.target));}
 }
});
