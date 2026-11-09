// URLs allowed to open outside the vault. Never hand javascript:, data:, file:, or app protocols to the OS.
function externalUri(input) {
  const raw = String(input || '').trim();
  const candidate = /^www\./i.test(raw) ? 'https://' + raw : raw;
  try {
    const u = new URL(candidate);
    return ['https:', 'http:', 'mailto:'].includes(u.protocol) ? candidate : null;
  } catch { return null; }
}
function fencedRanges(text) {
  const result = [], lines = String(text || '').match(/[^\n]*(?:\n|$)/g) || [];
  let cursor = 0, start = null, marker = null, size = 0;
  for (const line of lines) {
    if (!line) continue;
    const trimmed = line.trim(), fence = trimmed.match(/^(\x60{3,}|~{3,})/);
    if (start === null && fence) { start = cursor; marker = fence[1][0]; size = fence[1].length; }
    else if (start !== null && trimmed.length >= size && [...trimmed].every(ch=>ch===marker)) {
      result.push([start,cursor+line.length]); start=null; marker=null;
    }
    cursor += line.length;
  }
  if (start !== null) result.push([start,text.length]);
  return result;
}
const overlaps = (from,to,blocked) => blocked.some(([a,b]) => from < b && a < to);
function bareUrls(text, blocked = []) {
  text = String(text || '');
  const fences = fencedRanges(text);
  const ignore = [...blocked,...fences];
  for (const m of text.matchAll(/\x60[^\x60\n]*\x60/g))
    if (!overlaps(m.index,m.index+m[0].length,fences)) ignore.push([m.index,m.index+m[0].length]);
  const out=[], rx=/(?:https?:\/\/|www\.)[^\s<>"'\x60]+/gi;
  for(const m of text.matchAll(rx)) {
    let token=m[0].replace(/[.,;!?。，、]+$/u,'');
    const opens=(token.match(/\(/g)||[]).length, closes=(token.match(/\)/g)||[]).length;
    for(let n=closes; n>opens && token.endsWith(')'); n--) token=token.slice(0,-1);
    token=token.replace(/[\]]+$/,'');
    if(!token)continue;
    const from=m.index,to=from+token.length,url=externalUri(token);
    if (url && !overlaps(from,to,ignore)) out.push({from,to,url});
  }
  return out;
}
module.exports={externalUri,bareUrls,fencedRanges};
