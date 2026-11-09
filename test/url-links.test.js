const test=require('node:test');
const assert=require('node:assert/strict');
const {externalUri,bareUrls}=require('../url-links');
test('external URLs open unchanged, including query and hash fragments',()=>{
  assert.equal(externalUri('https://example.com/a?key=1#section-2'),'https://example.com/a?key=1#section-2');
  assert.equal(externalUri('www.example.org/foo'),'https://www.example.org/foo');
  assert.equal(externalUri('mailto:help@example.org'),'mailto:help@example.org');
  for(const bad of ['javascript:alert(1)','data:text/html,hi','file:///home/a','ftp://example.org',''])assert.equal(externalUri(bad),null);
});
test('bare links in notes exclude Markdown links, inline code, and Mermaid fences',()=>{
  const fence=String.fromCharCode(96).repeat(3);
  const source=[
    'Read https://example.com/a?x=1#top.',
    '[label](https://other.example/a)',
    String.fromCharCode(96)+'https://inline.example'+String.fromCharCode(96),
    fence+'mermaid',
    'A["https://diagram.example"]-->B',
    fence,
    'www.example.org'
  ].join('\n');
  const a=source.indexOf('[label]'),b=a+'[label](https://other.example/a)'.length;
  const results=bareUrls(source,[[a,b]]);
  assert.deepEqual(results.map(x=>x.url),['https://example.com/a?x=1#top','https://www.example.org']);
});
