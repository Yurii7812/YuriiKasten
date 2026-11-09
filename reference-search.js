const L = require('./lib'), Core = require('./link-core');
function suppressed(text,pos) {
  if(L.codeRanges(text).some(([a,b])=>pos>a&&pos<=b))return true;
  const line=text.slice(text.lastIndexOf('\n',pos-1)+1,pos);
  if((line.match(/`+/g)||[]).length%2===1 || /(?:^|\s)(?:const|let|var|return|function)\b/.test(line) || /[{}]/.test(line) || /["'][^"']*["']\s*:$/.test(line))return true;
  if(/(?:https?|ftp|file|mailto|memo|link|note|reply):[^\s]*$/i.test(line)||/\d{1,2}:\d*$/.test(line))return true;
  if(/\]\([^)]*$/.test(line)||/\[[^\]]*$/.test(line)||/[)\]]\s*:$/.test(line)||/:[0-9]+[a-z0-9]*(?:\([pd]\))?:$/.test(line))return true;
  return false;
}
class Session {
  constructor(){this.active=null;}
  close(){this.active=null;}
  update(text,pos,inserted='') {
    if(this.active){const a=this.active;if(pos<a.colon+1||text[a.colon]!==':'||/[\s\n:]/.test(text.slice(a.colon+1,pos))||suppressed(text,a.colon+1)){this.close();return null;}a.to=pos;a.query=a.before||text.slice(a.colon+1,pos);return a;}
    if(!inserted.includes(':')||text[pos-1]!==':'||suppressed(text,pos))return null;
    const before=text.slice(0,pos-1),word=before.match(/(?:^|[\s、。！？(])([^\s:：\[\]()`~{};=]+)$/u),last=word?.[1]||'';
    if(last&&(L.isId(last)||/[/=;{}]$/.test(last)))return null; // Existing Folgezettel postfix/time/code.
    const from=last?pos-1-last.length:pos-1;
    this.active={from,colon:pos-1,to:pos,query:last,before:last};return this.active;
  }
}
function insertion(item,postfix,space='d'){return Core.reference(item,postfix,space);}
module.exports={Session,suppressed,insertion};
