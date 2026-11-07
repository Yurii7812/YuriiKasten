# グラフ表示のモック（動かない配置）。同じサンプルで、考え方の違う4案
import math, os, html
here = os.path.dirname(os.path.abspath(__file__))

# ---- サンプル: 番号の木 + リンク + キーワード
NOTES = {  # id: タイトル
 '1':'PKMとは何か','1a':'ツェッテルカステンの基本','1a1':'番号のつけ方','1a2':'リンクの書き方','1b':'索引カード','1b1':'キーワード','1b2':'トピックIndex',
 '2':'日記の書き方','2a':'朝のメモ','7':'GUI の考え方','7a':'ボタンの数','7b':'色と余白',
}
LINKS = [('1a','1a1'),('1a1','1a2'),('1b','1a'),('2','1'),('7a','7b'),('1b2','7'),('2a','1a')]   # :ID のリンク（有向）
KW = {'PKM':['1','1a','1b'],'番号':['1a','1a1'],'GUI':['7','7a','7b','1b2'],'日記':['2','2a']}
def parent(i):
    import re
    t=re.findall(r'\d+|[a-z]+',i)
    while len(t)>1:
        t.pop(); p=''.join(t)
        if p in NOTES: return p
    return None
TREE=[(parent(i),i) for i in NOTES if parent(i)]
CHILD={}
for p,c in TREE: CHILD.setdefault(p,[]).append(c)
ROOTS=[i for i in NOTES if not parent(i)]
INK='#2b2d33'; ACC='#3b5bdb'; RED='#c0392b'; SUB='#8b909c'; LINE='#c9cdd8'

FONT='font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif'
def page(w,h,inner,title,note):
    return f'''<meta charset="utf-8"><style>*{{box-sizing:border-box}}body{{margin:0;background:#fff;{FONT};color:{INK}}}
.hd{{padding:18px 26px 6px;font-size:18px;font-weight:700}}.nt{{padding:0 26px 4px;font-size:13px;color:{SUB}}}</style>
<div class="hd">{html.escape(title)}</div><div class="nt">{html.escape(note)}</div>
<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" style="{FONT}">{inner}</svg>'''
def t(x,y,s,size=13,fill=INK,anchor='middle',weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" font-weight="{weight}">{html.escape(s)}</text>'
def node(x,y,i,sel=False,r=0):
    lab=NOTES[i]; w=max(86,len(lab)*13+22);
    return (f'<rect x="{x-w/2}" y="{y-20}" width="{w}" height="40" rx="9" fill="{"#e8edff" if sel else "#fff"}" stroke="{ACC if sel else LINE}" stroke-width="{2 if sel else 1.3}"/>'
            + t(x,y-2,lab,13,INK,'middle',600 if sel else 500)+t(x,y+13,i,10.5,SUB))
def kwnode(x,y,k):
    w=len(k)*13+26
    return f'<rect x="{x-w/2}" y="{y-13}" width="{w}" height="26" rx="13" fill="#fdf1ef" stroke="{RED}" stroke-width="1.2"/>'+t(x,y+5,k,12.5,RED,'middle',600)
def curve(x1,y1,x2,y2,col=LINE,w=1.6,dash='',arrow=False,bend=0.5):
    my=(y1+y2)/2
    d=f'M{x1},{y1} C{x1},{my} {x2},{my} {x2},{y2}'
    return f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w}" {"stroke-dasharray=%s"%chr(34)+dash+chr(34) if dash else ""}/>'

# ============ ① 番号の木（ツリー）: 上から下へ。リンクは曲線、キーワードは下の帯 ============
def g1():
    W,H=1400,640; pos={}
    # 葉の数で横幅を割り当てる
    def leaves(i): return 1 if i not in CHILD else sum(leaves(c) for c in CHILD[i])
    x=60; xs={}
    def place(i,depth,left):
        n=leaves(i); cx=left+n*170/2
        pos[i]=(cx,70+depth*110)
        l=left
        for c in CHILD.get(i,[]): place(c,depth+1,l); l+=leaves(c)*170
        return n
    l=60
    for r in ROOTS: place(r,0,l); l+=leaves(r)*170+30
    o=''
    for p,c in TREE: o+=curve(*pos[p],*pos[c],col='#aab0c4',w=2)               # 番号の親子（実線）
    for a,b in LINKS:                                                           # リンク（青の点線の弧）
        x1,y1=pos[a]; x2,y2=pos[b]; mx=(x1+x2)/2; my=max(y1,y2)+58
        o+=f'<path d="M{x1},{y1+20} Q{mx},{my} {x2},{y2+20}" fill="none" stroke="{ACC}" stroke-width="1.5" stroke-dasharray="5 4"/>'
    for i,(x,y) in pos.items(): o+=node(x,y,i,sel=(i=='1a'))
    # キーワードの帯（下）: 結んだノートへ細い赤線
    ky=H-60; kx=130
    for k,ids in KW.items():
        for i in ids: o+=f'<path d="M{kx},{ky-13} L{pos[i][0]},{pos[i][1]+20}" stroke="#e8b0aa" stroke-width="1" fill="none"/>'
        o+=kwnode(kx,ky,k); kx+=len(k)*13+190
    o+=t(60,H-18,'実線＝番号の親子　青い点線＝リンク　赤＝索引（キーワード）',12,SUB,'start')
    return page(W,H,o,'① 番号の木','上から下へ、番号の親子。リンクは下の弧、索引は下の帯から線で結ぶ。紙のカードの「並び」に最も近い')

# ============ ② 横の木（左から右）: 深さ＝桁。マインドマップ風で、読みやすい ============
def g2():
    W,H=1180,640; pos={}; row=[0]
    def place(i,depth):
        if i not in CHILD: y=60+row[0]*52; row[0]+=1
        else:
            ys=[place(c,depth+1) for c in CHILD[i]]; y=sum(ys)/len(ys)
        pos[i]=(110+depth*210,y); return y
    for r in ROOTS: place(r,0); row[0]+=0.6
    o=''
    for p,c in TREE:
        x1,y1=pos[p]; x2,y2=pos[c]; mx=(x1+x2)/2
        o+=f'<path d="M{x1+50},{y1} C{mx+20},{y1} {mx-20},{y2} {x2-50},{y2}" fill="none" stroke="#aab0c4" stroke-width="2"/>'
    for a,b in LINKS:
        x1,y1=pos[a]; x2,y2=pos[b]
        o+=f'<path d="M{x1+50},{y1+10} C{x1+150},{y1+60} {x2-150},{y2-60} {x2-50},{y2-10}" fill="none" stroke="{ACC}" stroke-width="1.4" stroke-dasharray="5 4" opacity=".75"/>'
    for i,(x,y) in pos.items(): o+=node(x,y,i,sel=(i=='1a'))
    # キーワード（右の列）
    kx=1090; ky=80
    for k,ids in KW.items():
        for i in ids: o+=f'<path d="M{pos[i][0]+50},{pos[i][1]} Q{(pos[i][0]+kx)/2},{pos[i][1]-30} {kx-30},{ky}" stroke="#ecc0ba" stroke-width="1" fill="none"/>'
        o+=kwnode(kx,ky,k); ky+=96
    o+=t(60,H-20,'実線＝番号の親子（左から右へ、桁が深くなる）　青い点線＝リンク　赤＝索引',12,SUB,'start')
    return page(W,H,o,'② 横の木（左から右）','マインドマップのように、深さが右へ進む。長いタイトルも読みやすい。キーワードは右端に縦に並ぶ')

# ============ ③ アーク図: ID を横一列に並べ、リンクを弧で。番号順がそのまま見える ============
def g3():
    W,H=1180,560
    ids=sorted(NOTES, key=lambda s:[(0,int(p)) if p.isdigit() else (1,p) for p in __import__('re').findall(r'\d+|[a-z]+',s)])
    step=(W-120)/(len(ids)-1); X={i:60+k*step for k,i in enumerate(ids)}; base=300
    o=f'<line x1="40" y1="{base}" x2="{W-40}" y2="{base}" stroke="#d7dbe6" stroke-width="2"/>'
    for p,c in TREE: # 番号の親子: 下側の弧（実線）
        x1,x2=X[p],X[c]; h=min(150,abs(x2-x1)*.5)
        o+=f'<path d="M{x1},{base} Q{(x1+x2)/2},{base+h*1.6} {x2},{base}" fill="none" stroke="#aab0c4" stroke-width="2"/>'
    for a,b in LINKS: # リンク: 上側の弧（青）
        x1,x2=X[a],X[b]; h=min(190,abs(x2-x1)*.55+30)
        o+=f'<path d="M{x1},{base} Q{(x1+x2)/2},{base-h*1.5} {x2},{base}" fill="none" stroke="{ACC}" stroke-width="1.6" opacity=".8"/>'
    for i in ids:
        sel=(i=='1a'); o+=f'<circle cx="{X[i]}" cy="{base}" r="{8 if sel else 6}" fill="{ACC if sel else "#fff"}" stroke="{ACC if sel else "#7c84a0"}" stroke-width="2"/>'
        o+=f'<g transform="translate({X[i]},{base+26}) rotate(40)">{t(0,0,i+"  "+NOTES[i],12,INK,"start")}</g>'
    # キーワード: 上の帯に、結んだノートの真上へ
    ky=70; kxs={}
    for n,(k,idl) in enumerate(KW.items()):
        cx=sum(X[i] for i in idl)/len(idl)
        for i in idl: o+=f'<path d="M{cx},{ky+13} L{X[i]},{base-10}" stroke="#ecc0ba" stroke-width="1" fill="none"/>'
        o+=kwnode(cx,ky,k)
    o+=t(60,H-16,'上の弧＝リンク（青）　下の弧＝番号の親子（灰）　上の赤＝索引。横は番号順',12,SUB,'start')
    return page(W,H,o,'③ アーク図','番号順に一列に並べ、リンクを上の弧、親子を下の弧で。「どこが密にリンクされているか」が一目で分かる')

# ============ ④ 入れ子の四角（ツリーマップ）: 親の四角の中に、子の四角。まとまりが面で見える ============
def g4():
    W,H=1200,640
    def weight(i): return 1 if i not in CHILD else sum(weight(c) for c in CHILD[i])
    o=''; rects={}
    TINT=['#f4f6ff','#e9eeff','#dde6ff','#d0dcff']
    def layout(i,x,y,w,h,depth):
        rects[i]=(x,y,w,h)
        fill=TINT[min(depth,3)]
        o_=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{fill}" stroke="{"#3b5bdb" if i=="1a" else "#b3bfe8"}" stroke-width="{2.2 if i=="1a" else 1.3}"/>'
        ch=CHILD.get(i,[])
        if not ch:
            o_+=t(x+w/2,y+h/2-2,NOTES[i] if len(NOTES[i])<=10 else NOTES[i][:9]+'…',13,INK,'middle',600)+t(x+w/2,y+h/2+15,i,10.5,SUB)
            return o_
        o_+=t(x+12,y+20,NOTES[i],14,INK,'start',700)+t(x+w-10,y+20,i,11,SUB,'end')
        pad=8; ix,iy,iw,ih=x+pad,y+30,w-2*pad,h-30-pad
        tot=sum(weight(c) for c in ch); horiz=(depth%2==0); cur=0
        for c in ch:
            frac=weight(c)/tot
            if horiz: cw=iw*frac; o_+=layout(c,ix+cur,iy,cw-6,ih,depth+1); cur+=cw
            else: chh=ih*frac; o_+=layout(c,ix,iy+cur,iw,chh-6,depth+1); cur+=chh
        return o_
    tot=sum(weight(r) for r in ROOTS); cur=40; avail=W-80
    for r in ROOTS:
        w=avail*weight(r)/tot; o+=layout(r,cur,30,w-14,480,0); cur+=w
    for a,b in LINKS:
        (x1,y1,w1,h1),(x2,y2,w2,h2)=rects[a],rects[b]
        o+=f'<path d="M{x1+w1/2},{y1+h1/2} Q{(x1+x2+(w1+w2)/2)/2},{(y1+y2)/2-60} {x2+w2/2},{y2+h2/2}" fill="none" stroke="{ACC}" stroke-width="1.4" stroke-dasharray="5 4" opacity=".8"/>'
    ky=570; kx=120
    for k in KW: o+=kwnode(kx,ky,k); kx+=len(k)*13+120
    o+=t(W-40,ky+5,'四角＝ノート。親の四角の中に、子（桁が深い）。青い点線＝リンク。赤＝索引（キーワード）',12,SUB,'end')
    return page(W,H,o,'④ 入れ子の四角','親の四角の中に、子の四角。どの話題の下に何があるかが、面で見える。ノートが増えるほど、大きな塊が育つのが分かる')

for name,fn in (('g1-tree',g1),('g2-horizontal',g2),('g3-arc',g3),('g4-circles',g4)):
    with open(os.path.join(here,name+'.html'),'w') as f: f.write(fn())
print('ok')
