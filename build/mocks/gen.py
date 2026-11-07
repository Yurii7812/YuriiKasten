# UI モックの生成（HTML）。アプリ本体は変えない。同じ内容を、考え方の違う4つの方向で並べる
ROWS = [
  ('topic', '1-PKM', '入口 1'),
  ('n', 'PKMとは何か', '1'),
  ('n', 'ツェッテルカステンの基本', '1a', True),
  ('n', '番号のつけ方', '1a1'),
  ('n', '索引カード', '1b'),
  ('n', '日記の書き方', '2'),
  ('topic', '7-GUI', '入口 7'),
  ('n', 'GUI の考え方', '7'),
]
BODY = """
<h2>基本の考え方</h2>
<ul class="ck"><li><i class="on"></i><s>1枚に、1つのことだけ書く</s></li><li><i></i>番号をつけて、つなぐ</li><li><i></i>索引に入れる</li></ul>
<p>つながりは、番号で書く。たとえば <a>:1a1</a> は「番号のつけ方」へ続き、<a>1b(1)</a> は索引カードの引用になる。</p>
<p class="mu">紙でもデジタルでも、同じ番号の考え方で、あとから整理できる。</p>
"""
BACK = [('1', 'PKMとは何か', '…基本は <mark>:1a</mark> に書いた。まず、1枚に1つのこと。'),
        ('1b', '索引カード', '…<mark>:1a</mark> の番号の話を、索引と結びつける。'),
        ('日記', '11-07（土）', '<mark>:1a</mark> を書いた。')]

def rows():
    o = ''
    for r in ROWS:
        if r[0] == 'topic':
            o += f'<div class="r tp"><span class="tb">トピックIndex</span>{r[1]}<em>{r[2]}</em></div>'
        else:
            o += f'<div class="r{" on" if len(r) > 3 else ""}"><b>{r[1]}</b><em>{r[2]}</em></div>'
    return o

def back():
    return ''.join(f'<div class="bl"><div class="bh"><b>{t}</b><em>{i}</em></div><p>{c}</p></div>' for i, t, c in BACK)

COMMON = """
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font:15px/1.7 "Noto Sans CJK JP","Noto Sans JP",system-ui,sans-serif;color:#2b2d33;background:#fff;overflow:hidden}
a{color:#3b5bdb;text-decoration:none}mark{background:#fff0a8;border-radius:2px;padding:0 1px}
ul.ck{list-style:none;padding:0;margin:.2em 0 .8em}ul.ck li{display:flex;gap:9px;align-items:center;padding:2px 0}
ul.ck i{width:15px;height:15px;border:1.5px solid #b9bdc9;border-radius:4px;display:inline-block}ul.ck i.on{background:#3b5bdb;border-color:#3b5bdb;position:relative}
ul.ck i.on:after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
s{color:#9aa0ae}h2{font-size:1.25em;margin:1.2em 0 .4em}p{margin:.5em 0}.mu{color:#8b909c}
.ico{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;vertical-align:-3px}
"""
SVG = {
 'note': '<svg class="ico" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/></svg>',
 'diary': '<svg class="ico" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18"/></svg>',
 'chat': '<svg class="ico" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
 'paper': '<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M4 10h16"/></svg>',
 'search': '<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
 'plus': '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
 'more': '<svg class="ico" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
 'back': '<svg class="ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
 'fwd': '<svg class="ico" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
 'copy': '<svg class="ico" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 011-1h9"/></svg>',
}
def rail():
    return f'<nav class="rail"><button class="on">{SVG["note"]}</button><button>{SVG["diary"]}</button><button>{SVG["chat"]}</button><button>{SVG["paper"]}</button></nav>'
TABS = '<div class="tabs"><span class="on">デジタル</span><span>紙</span><span>未整理</span><span>Index</span></div>'

# ① ゼン: 余白だけ。UI は、ほぼ見えない
Z = COMMON + """
.app{display:flex;height:100%}
.rail{width:44px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 0}
.rail button{width:30px;height:30px;border:0;background:none;border-radius:8px;color:#b7bbc6}.rail button.on{color:#3b5bdb}
.side{width:250px;padding:14px 6px 10px 6px;overflow:hidden}
.side .tabs{display:flex;gap:14px;padding:0 12px 10px;font-size:12.5px;color:#b0b4c0}.side .tabs .on{color:#2b2d33}
.r{padding:7px 12px;border-radius:7px;line-height:1.35}.r b{display:block;font-weight:500;font-size:14px}.r em{display:block;font-style:normal;font-size:11px;color:#a3a8b5}
.r.on{background:#f3f4f8}.r.tp{padding:6px 12px;color:#6b7080;font-size:12.5px}.r.tp em{display:inline;margin-left:8px}
.tb{font-size:10px;color:#8b94c8;border:1px solid #d6dbf3;border-radius:4px;padding:0 5px;margin-right:7px}
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.top{display:flex;align-items:center;gap:2px;padding:12px 18px 0;color:#b7bbc6}.top .sp{flex:1}.top button{border:0;background:none;color:inherit;width:28px;height:28px;border-radius:7px}
.tabstrip{display:flex;gap:18px;padding:4px 30px 0;font-size:13px;color:#aeb2bf}.tabstrip .on{color:#2b2d33}
.page{width:720px;margin:0 auto;padding:44px 0 0}
.idline{display:flex;align-items:center;gap:6px;font-size:12px;color:#a9aebb}.idline button{border:0;background:none;color:#b7bbc6;padding:0;width:18px}
.title{font-size:30px;font-weight:700;letter-spacing:.01em;margin:4px 0 14px;line-height:1.3}
.meta{display:grid;grid-template-columns:auto 1fr;gap:3px 14px;font-size:12.5px;margin-bottom:26px;color:#8b909c;align-items:center}
.meta .l{color:#b0b4c0}.chip{display:inline-block;color:#4a4f5e;margin-right:12px}.chip i{font-style:normal;color:#c2c6d1;margin-left:3px}.chip.in{color:#3b5bdb}.pl{color:#b7bbc6}
.bk{margin-top:54px;padding-top:14px;border-top:1px solid #f0f0f3}.bk .h{font-size:12px;color:#a0a5b3;margin-bottom:6px}
.bl{padding:6px 0}.bh{font-size:13px}.bh em{font-style:normal;color:#b0b4c0;font-size:11.5px;margin-left:8px}.bl p{margin:1px 0 0;font-size:13px;color:#7a7f8e}
"""
def zen():
    return f"""<style>{Z}</style><div class="app">{rail()}<div class="side">{TABS}{rows()}</div>
<div class="main"><div class="top"><button>{SVG['back']}</button><button>{SVG['fwd']}</button><span class="sp"></span><button>{SVG['search']}</button><button>{SVG['plus']}</button><button>{SVG['more']}</button></div>
<div class="tabstrip"><span class="on">ツェッテルカステンの基本</span><span>PKMとは何か</span></div>
<div class="page"><div class="idline"><button>{SVG['copy']}</button>1a</div><div class="title">ツェッテルカステンの基本</div>
<div class="meta"><span class="l">キーワード</span><span><span class="chip">PKM<i>×</i></span><span class="chip">番号<i>×</i></span><span class="pl">＋</span></span>
<span class="l">トピックIndex</span><span><span class="chip in">1-PKM　入口</span><span class="chip">7-GUI · 機能の追加</span><span class="pl">＋</span></span></div>
{BODY}<div class="bk"><div class="h">バックリンク 3</div>{back()}</div></div></div></div>"""

# ② コンパクト: タブと検索を1行に
C = COMMON + """
.app{display:flex;flex-direction:column;height:100%}
.bar{display:flex;align-items:center;gap:2px;padding:0 8px;height:38px;border-bottom:1px solid #eeeef1;background:#fbfbfc}
.bar button{border:0;background:none;color:#8b909c;width:28px;height:28px;border-radius:6px}
.tab{display:flex;align-items:center;gap:6px;height:38px;padding:0 12px;font-size:13px;color:#8b909c;border-right:1px solid #f0f0f3;max-width:200px;white-space:nowrap}
.tab.on{background:#fff;color:#2b2d33;box-shadow:inset 0 -2px #3b5bdb}.tab small{color:#b7bbc6}
.sp{flex:1}.sbox{display:flex;align-items:center;gap:6px;background:#f0f1f5;border-radius:7px;padding:3px 10px;width:200px;font-size:13px;color:#a0a5b3;margin-right:4px}
.body{flex:1;display:flex;min-height:0}
.rail{width:38px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 0;background:#fbfbfc;border-right:1px solid #eeeef1}
.rail button{width:28px;height:28px;border:0;background:none;border-radius:6px;color:#b0b4c0}.rail button.on{color:#3b5bdb;background:#e9edfb}
.side{width:236px;border-right:1px solid #eeeef1;background:#fbfbfc;overflow:hidden}
.side .tabs{display:flex;padding:8px 8px 4px;gap:2px;font-size:12px}.side .tabs span{padding:3px 9px;border-radius:5px;color:#9aa0ae}.side .tabs .on{background:#e9edfb;color:#3b5bdb;font-weight:600}
.r{padding:5px 12px;line-height:1.3;border-left:2px solid transparent}.r b{display:block;font-weight:500;font-size:13.5px}.r em{display:block;font-style:normal;font-size:10.5px;color:#a3a8b5}
.r.on{background:#fff;border-left-color:#3b5bdb}.r.tp{color:#6b7080;font-size:12px}.r.tp em{display:inline;margin-left:8px}
.tb{font-size:9.5px;color:#fff;background:#8d9bd8;border-radius:3px;padding:0 4px;margin-right:6px}
.main{flex:1;overflow:hidden}
.page{width:780px;margin:0 auto;padding:28px 36px 0}
.head{display:flex;align-items:baseline;gap:10px}.idb{display:inline-flex;align-items:center;gap:3px;font-size:13px;color:#3b5bdb;background:#eef1fd;border-radius:5px;padding:0 7px;font-weight:600}.idb svg{width:13px;height:13px}
.title{font-size:25px;font-weight:700;line-height:1.3}
.meta{margin:10px 0 18px;font-size:12.5px;display:flex;flex-direction:column;gap:5px}.meta div{display:flex;gap:10px;align-items:center}.meta .l{width:84px;color:#a0a5b3;flex:none}
.chip{background:#f1f2f6;border-radius:12px;padding:0 9px;color:#4a4f5e}.chip.in{background:#e9edfb;color:#3b5bdb}.pl{color:#b0b4c0;border:1px dashed #d5d8e1;border-radius:12px;padding:0 8px}
.bk{margin-top:36px;border-top:1px solid #eeeef1;padding-top:10px}.bk .h{font-size:12px;color:#8b909c;font-weight:600;margin-bottom:4px}
.bl{padding:4px 0}.bh{font-size:13px}.bh em{font-style:normal;color:#a3a8b5;font-size:11.5px;margin-left:8px}.bl p{margin:0;font-size:12.5px;color:#7a7f8e}
"""
def compact():
    return f"""<style>{C}</style><div class="app"><div class="bar"><button>{SVG['back']}</button><button>{SVG['fwd']}</button><div class="tab on">ツェッテルカステンの基本 <small>1a</small></div><div class="tab">PKMとは何か <small>1</small></div><button>{SVG['plus']}</button><span class="sp"></span><div class="sbox">{SVG['search']} 検索</div><button>{SVG['more']}</button></div>
<div class="body">{rail()}<div class="side">{TABS}{rows()}</div>
<div class="main"><div class="page"><div class="head"><span class="idb">{SVG['copy']}1a</span><span class="title">ツェッテルカステンの基本</span></div>
<div class="meta"><div><span class="l">キーワード</span><span class="chip">PKM ×</span><span class="chip">番号 ×</span><span class="pl">＋</span></div>
<div><span class="l">トピックIndex</span><span class="chip in">1-PKM　入口</span><span class="chip">7-GUI · 機能の追加</span><span class="pl">＋</span></div></div>
{BODY}<div class="bk"><div class="h">バックリンク 3</div>{back()}</div></div></div></div></div>"""

# ③ 余白メモ: 索引とバックリンクを、右の余白に置く（本の欄外メモのように）
M = COMMON + """
.app{display:flex;height:100%}
.rail{width:42px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 0;border-right:1px solid #f0f0f3}
.rail button{width:30px;height:30px;border:0;background:none;border-radius:8px;color:#b7bbc6}.rail button.on{color:#3b5bdb;background:#f0f2fb}
.side{width:240px;border-right:1px solid #f0f0f3;padding-top:12px;overflow:hidden}
.side .tabs{display:flex;gap:12px;padding:0 14px 8px;font-size:12.5px;color:#aeb2bf}.side .tabs .on{color:#2b2d33;font-weight:600}
.r{padding:6px 14px;line-height:1.35}.r b{display:block;font-weight:500;font-size:14px}.r em{display:block;font-style:normal;font-size:10.5px;color:#a3a8b5}
.r.on{background:#f5f6fa}.r.tp{color:#6b7080;font-size:12.5px}.r.tp em{display:inline;margin-left:8px}
.tb{font-size:10px;color:#8b94c8;border:1px solid #d6dbf3;border-radius:4px;padding:0 5px;margin-right:6px}
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.top{display:flex;align-items:center;gap:2px;padding:8px 14px;color:#b0b4c0;border-bottom:1px solid #f4f4f6}.top .sp{flex:1}.top button{border:0;background:none;color:inherit;width:28px;height:28px;border-radius:7px}
.sbox{background:#f4f5f8;border-radius:7px;padding:3px 12px;width:180px;font-size:13px;color:#a8adba;margin:0 6px}
.stage{flex:1;display:flex;overflow:hidden}
.col{width:640px;margin-left:auto;padding:34px 36px 0 0}
.margin{width:250px;margin:0 auto 0 28px;padding:40px 0 0;font-size:12.5px;color:#7a7f8e;border-left:1px solid #f0f0f3;padding-left:20px}
.title{font-size:30px;font-weight:700;line-height:1.3;margin-bottom:6px}
.idline{display:flex;align-items:center;gap:6px;font-size:12px;color:#a9aebb;margin-bottom:6px}.idline button{border:0;background:none;color:#b7bbc6;padding:0;width:18px}
.margin .sec{margin-bottom:22px}.margin .sec>.l{font-size:11px;color:#b0b4c0;letter-spacing:.06em;margin-bottom:5px}
.chip{display:block;color:#4a4f5e;padding:1px 0;font-size:13px}.chip small{color:#a3a8b5;margin-left:6px}.chip.in{color:#3b5bdb}.pl{color:#b7bbc6;font-size:12px}
.bl{padding:5px 0;border-bottom:1px solid #f4f4f6}.bh{font-size:12.5px;color:#4a4f5e}.bh em{font-style:normal;color:#b0b4c0;font-size:11px;margin-left:6px}.bl p{margin:2px 0 0;font-size:12px;color:#8b909c;line-height:1.55}
"""
def margin():
    return f"""<style>{M}</style><div class="app">{rail()}<div class="side">{TABS}{rows()}</div>
<div class="main"><div class="top"><button>{SVG['back']}</button><button>{SVG['fwd']}</button><span class="sp"></span><div class="sbox">検索</div><button>{SVG['plus']}</button><button>{SVG['more']}</button></div>
<div class="stage"><div class="col"><div class="idline"><button>{SVG['copy']}</button>1a</div><div class="title">ツェッテルカステンの基本</div>{BODY}</div>
<div class="margin"><div class="sec"><div class="l">キーワード</div><span class="chip">PKM</span><span class="chip">番号</span><span class="pl">＋ 追加</span></div>
<div class="sec"><div class="l">トピックIndex</div><span class="chip in">1-PKM<small>入口</small></span><span class="chip">7-GUI<small>機能の追加</small></span><span class="pl">＋ 追加</span></div>
<div class="sec"><div class="l">バックリンク 3</div>{back()}</div></div></div></div></div>"""

# ④ カード: ノートを、紙のカードのように
K = COMMON + """
body{background:#f4f1ea}
.app{display:flex;height:100%}
.rail{width:42px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 0}
.rail button{width:30px;height:30px;border:0;background:none;border-radius:8px;color:#b3aa97}.rail button.on{color:#8a5a20;background:#e9e2d2}
.side{width:244px;padding-top:12px;overflow:hidden}
.side .tabs{display:flex;gap:12px;padding:0 14px 8px;font-size:12.5px;color:#b3aa97}.side .tabs .on{color:#3a3426;font-weight:600}
.r{padding:6px 14px;line-height:1.35;color:#3a3426}.r b{display:block;font-weight:500;font-size:14px}.r em{display:block;font-style:normal;font-size:10.5px;color:#aaa08b}
.r.on{background:#ebe5d6;border-radius:8px}.r.tp{color:#7a705a;font-size:12.5px}.r.tp em{display:inline;margin-left:8px}
.tb{font-size:10px;color:#a0642a;border:1px solid #dcc6a8;border-radius:4px;padding:0 5px;margin-right:6px}
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.top{display:flex;align-items:center;gap:2px;padding:10px 16px;color:#b3aa97}.top .sp{flex:1}.top button{border:0;background:none;color:inherit;width:28px;height:28px;border-radius:7px}
.sbox{background:#ebe5d6;border-radius:8px;padding:3px 12px;width:180px;font-size:13px;color:#a89f8a;margin:0 6px}
.card{width:700px;margin:18px auto 0;background:#fffdf8;border-radius:6px;box-shadow:0 1px 2px rgba(60,50,30,.08),0 8px 30px rgba(60,50,30,.07);padding:30px 44px 26px;position:relative}
.card .idn{position:absolute;left:44px;top:18px;display:flex;align-items:center;gap:6px;font:13px/1 Georgia,"DejaVu Serif",serif;color:#8a5a20}.idn button{border:0;background:none;color:#bfae8c;padding:0;width:16px}
.dot{position:absolute;right:46px;top:18px;width:9px;height:9px;border-radius:50%;background:#d6382e}
.title{font-size:28px;font-weight:700;line-height:1.3;margin:26px 0 8px;font-family:"Noto Serif CJK JP","Noto Serif JP",serif}
.meta{display:flex;flex-direction:column;gap:4px;font-size:12.5px;margin-bottom:22px}.meta div{display:flex;gap:10px;align-items:center}.meta .l{width:86px;color:#b3aa97;flex:none}
.chip{color:#5a5240}.chip i{font-style:normal;color:#cbbfa4;margin-left:3px}.chip.in{color:#a0642a;font-weight:600}.pl{color:#bfae8c}
.bk{margin-top:30px;border-top:1px dashed #e3dac6;padding-top:12px}.bk .h{font-size:12px;color:#aaa08b;margin-bottom:4px}
.bl{padding:4px 0}.bh{font-size:13px}.bh em{font-style:normal;color:#b8ae98;font-size:11.5px;margin-left:8px}.bl p{margin:0;font-size:12.5px;color:#857b66}
"""
def card():
    return f"""<style>{K}</style><div class="app">{rail()}<div class="side">{TABS}{rows()}</div>
<div class="main"><div class="top"><button>{SVG['back']}</button><button>{SVG['fwd']}</button><span class="sp"></span><div class="sbox">検索</div><button>{SVG['plus']}</button><button>{SVG['more']}</button></div>
<div class="card"><div class="idn"><button>{SVG['copy']}</button>1a</div><i class="dot"></i><div class="title">ツェッテルカステンの基本</div>
<div class="meta"><div><span class="l">キーワード</span><span class="chip">PKM<i>×</i></span>　<span class="chip">番号<i>×</i></span>　<span class="pl">＋</span></div>
<div><span class="l">トピックIndex</span><span class="chip in">1-PKM　入口</span>　<span class="chip">7-GUI · 機能の追加</span>　<span class="pl">＋</span></div></div>
{BODY}<div class="bk"><div class="h">バックリンク 3</div>{back()}</div></div></div></div>"""

import os
here = os.path.dirname(os.path.abspath(__file__))
for name, fn in (('1-zen', zen), ('2-compact', compact), ('3-margin', margin), ('4-card', card)):
    with open(os.path.join(here, name + '.html'), 'w') as f:
        f.write('<meta charset="utf-8">' + fn())
print('ok')
