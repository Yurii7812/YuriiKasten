// なりきりチャットの履歴を、個別トピックのチャットメモへ移行する。
// 破壊的な削除は行わない。元の会話ノートは移行後も保管し、重複取り込みを防ぐ。
function migrate(data, notes, roleLibrary) {
  data.messages ||= []; data.topics ||= []; data.importedRp ||= {};
  const roles = [...(roleLibrary || [])], newMessages = [], migrated = [], newRoles = [];
  const existing = new Set(data.messages.map(m=>m.id));
  for (const n of notes || []) {
    if (n.kind !== 'rp' || !n.stem || data.importedRp[n.stem]) continue;
    const conv = n.data || {}, rawTitle=(n.title || conv.title || '無題の会話').trim();
    const base='会話: '+rawTitle;
    let topic=base, suffix=2;
    const used=new Set(data.topics.map(t=>t.name).filter(Boolean));
    while(used.has(topic)) topic=base+' ('+(suffix++)+')';
    if(!used.has(topic)) data.topics.push({name:topic,type:'bubble',stamp:true,entry:null});
    const roster=conv.cast || [];
    for(const role of roster) if(role?.id && role.id!=='self' && !roles.some(r=>r.id===role.id)) {
      const fresh={id:role.id,name:role.name || 'キャラクター',icon:role.icon||null};
      roles.push(fresh);newRoles.push(fresh);
    }
    const prefix='legacy-rp-'+n.stem+'-';
    for (const m of conv.messages || []) {
      if (!m?.id || existing.has(prefix+m.id)) continue;
      const result={id:prefix+m.id,topic,t:Number(m.t)||Date.now(),text:m.text || '',
        actor:m.role || 'self',sourceRoleplay:{stem:n.stem,id:m.id}};
      if(m.reply) result.replies=[prefix+m.reply];
      if(m.quote) result.quote=m.quote;
      data.messages.push(result);newMessages.push(result);existing.add(result.id);
    }
    data.importedRp[n.stem]=topic;
    migrated.push({stem:n.stem,topic,count:(conv.messages||[]).length});
  }
  return {data,roles,migrated,newMessages,newRoles};
}
module.exports={migrate};
