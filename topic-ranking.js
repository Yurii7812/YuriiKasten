const L = require('./lib');
function rank(note, topics, notes, recent = [], query = '') {
  const frequencies = new Map(); for (const n of notes) for (const k of new Set(n.keywords || [])) frequencies.set(k, (frequencies.get(k) || 0) + 1);
  const related = new Set();
  for (const t of L.tokens(note.body || '')) if (t.k === 'ref') related.add((t.sp || note.s) + ':' + t.id);
  for (const n of notes) if (L.tokens(n.body || '').some(t => t.k === 'ref' && t.id === note.id && (t.sp || n.s) === note.s)) related.add(n.s + ':' + n.id);
  const parent = n => L.parentIn(n.id, id => notes.some(x => x.s === n.s && x.id === id));
  const tokens = id => L.tok(id), ancestor = (a,b) => { const x=tokens(a),y=tokens(b); return x.length < y.length && x.every((v,i)=>y[i]===v); };
  const q = query.trim().toLowerCase(), out = new Map();
  for (const t of topics) {
    const rows = L.mergeTopic(t).rows, own = t.entry?.s === note.s && t.entry.id === note.id;
    const direct = rows.some(r => r[note.s].some(x => L.splitAnchor(x).id === note.id));
    const exact = rows.filter(r => (note.keywords || []).includes(r.kw));
    const e = t.entry && notes.find(n => n.s === t.entry.s && n.id === t.entry.id);
    const adjacent = e && e.s === note.s && (parent(note) === e.id || parent(e) === note.id);
    const linked = (e && related.has(e.s + ':' + e.id)) || rows.some(r => ['d','p'].some(s => r[s].some(x => related.has(s+':'+L.splitAnchor(x).id))));
    const ancestry = e && e.s === note.s && (ancestor(e.id,note.id) || ancestor(note.id,e.id));
    const sameRoot = e && e.s === note.s && !note.noid && !e.noid && L.root(e.id) === L.root(note.id);
    const specificity = exact.reduce((sum,r)=>sum+1/(frequencies.get(r.kw)||1),0);
    const names = [t.name, ...rows.map(r=>r.kw)].map(x=>x.toLowerCase());
    const match = !q ? 0 : names.some(x=>x===q) ? 3 : names.some(x=>x.startsWith(q)) ? 2 : names.some(x=>x.includes(q)) ? 1 : -1;
    if(match<0)continue;
    // Tiered evidence prevents recency/general roots from overwhelming concrete relationships.
    const tier = own||direct ? 6 : exact.length ? 5 : adjacent ? 4 : linked ? 3 : ancestry ? 2 : sameRoot ? 1 : 0;
    const why = [own&&'自トピック',direct&&'直接所属',exact.length&&'一致キーワード: '+exact.map(r=>r.kw).join('・'),adjacent&&'直接の親・子',linked&&'直接リンク',ancestry&&!adjacent&&'祖先・子孫',sameRoot&&!ancestry&&!adjacent&&'同じ系統'].filter(Boolean);
    const ri=recent.indexOf(t.name), score=match*1e9+tier*1e6+specificity*1000;
    out.set(t.name,{score,near:tier>0,why,recency:ri<0?Infinity:ri});
  }
  return out;
}
function compare(map,a,b) {const x=map.get(a.name),y=map.get(b.name);return (y?.score||0)-(x?.score||0)||(x?.recency??Infinity)-(y?.recency??Infinity)||a.name.localeCompare(b.name,'ja');}
module.exports={rank,compare};
