# 「普通のグラフ」2案: ⑤全体（点と線・位置固定） ⑥このノートの周り（ローカル）
import math, random, html, os, re
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'graph.py')).read().split('# ============ ①')[0])
random.seed(7)
def esc(s): return html.escape(s)
# ---- ⑤ 力学配置を計算して固定
ids=list(NOTES); kws=list(KW); nodes=ids+['K:'+k for k in kws]
edges=[(p,c,'tree') for p,c in TREE]+[(a,b,'link') for a,b in LINKS]+[('K:'+k,i,'kw') for k,v in KW.items() for i in v]
W,H=1400,720
P={n:[W/2+random.uniform(-250,250),H/2+random.uniform(-200,200)] for n in nodes}
for it in range(900):
    F={n:[0,0] for n in nodes}
    for a in nodes:
        for b in nodes:
            if a<b:
                dx=P[a][0]-P[b][0];dy=P[a][1]-P[b][1];d=math.hypot(dx,dy)+.1;f=26000/(d*d)
                F[a][0]+=dx/d*f;F[a][1]+=dy/d*f;F[b][0]-=dx/d*f;F[b][1]-=dy/d*f
    for a,b,k in edges:
        dx=P[b][0]-P[a][0];dy=P[b][1]-P[a][1];d=math.hypot(dx,dy)+.1;f=(d-(130 if k!='kw' else 150))*.02
        F[a][0]+=dx/d*f;F[a][1]+=dy/d*f;F[b][0]-=dx/d*f;F[b][1]-=dy/d*f
    for n in nodes:
        F[n][0]+=(W/2-P[n][0])*.004;F[n][1]+=(H/2-P[n][1])*.004
        P[n][0]+=max(-8,min(8,F[n][0]));P[n][1]+=max(-8,min(8,F[n][1]))
xs=[p[0] for p in P.values()];ys=[p[1] for p in P.values()]
sx=(W-240)/(max(xs)-min(xs));sy=(H-170)/(max(ys)-min(ys));s=min(sx,sy)
for n in P: P[n]=[120+(P[n][0]-min(xs))*s*(1 if s==sx else 1),95+(P[n][1]-min(ys))*s]
deg={n:0 for n in nodes}
for a,b,k in edges: deg[a]+=1;deg[b]+=1
o=''
for a,b,k in edges:
    col={'tree':'#9aa3bd','link':ACC,'kw':'#e3b3ad'}[k]
    dash='stroke-dasharray="5 4"' if k=='kw' else ''
    ar=' marker-end="url(#ar)"' if k=='link' else ''
    o+=f'<line x1="{P[a][0]:.0f}" y1="{P[a][1]:.0f}" x2="{P[b][0]:.0f}" y2="{P[b][1]:.0f}" stroke="{col}" stroke-width="{2 if k!="kw" else 1.3}" {dash}{ar}/>'
for n in nodes:
    x,y=P[n]
    if n.startswith('K:'):
        o+=f'<circle cx="{x:.0f}" cy="{y:.0f}" r="9" fill="{RED}"/>'+t(x,y+27,n[2:],13,RED,'middle',700)
    else:
        r=9+deg[n]*2.2
        o+=f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" fill="{"#dbe4ff" if n in("1a",) else "#fff"}" stroke="{ACC}" stroke-width="2.2"/>'
        o+=t(x,y+4,n,11,SUB)+t(x,y+r+17,NOTES[n],13,INK,'middle',500)
defs='<defs><marker id="ar" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="%s"/></marker></defs>'%ACC
leg=(f'<g transform="translate(40,{H-40})"><circle cx="0" cy="0" r="7" fill="#fff" stroke="{ACC}" stroke-width="2"/>'+t(14,4,'ノート（大きいほどつながりが多い）',12,SUB,'start')
 +f'<line x1="260" y1="0" x2="290" y2="0" stroke="#9aa3bd" stroke-width="2"/>'+t(298,4,'番号の親子',12,SUB,'start')
 +f'<line x1="380" y1="0" x2="410" y2="0" stroke="{ACC}" stroke-width="2"/>'+t(418,4,':ID のリンク',12,SUB,'start')
 +f'<circle cx="530" cy="0" r="6" fill="{RED}"/>'+t(542,4,'キーワード',12,SUB,'start')+'</g>')
open('g5-points.html','w').write(page(W,H,defs+o+leg,'⑤ 全体の点と線（Obsidianのグラフに近い。ただし位置は固定）','ノート＝丸、番号の親子＝灰色の線、リンク＝青い矢印、キーワード＝赤い点。タップするとそのノートが開く／再読み込みしても配置は同じ。'))

# ---- ⑥ このノートの周り（ローカルグラフ）: 中心=1a
C='1a'; cx,cy=700,290
par=parent(C); ch=CHILD.get(C,[])
out_=[b for a,b in LINKS if a==C]; inn=[a for a,b in LINKS if b==C]
mykw=[k for k,v in KW.items() if C in v]
def card(x,y,i,big=False,col=LINE,fill='#fff'):
    lab=NOTES[i]; w=max(120,len(lab)*14+30) if not big else max(180,len(lab)*18+40); h=58 if big else 46
    return (f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{col}" stroke-width="{2.4 if big else 1.4}"/>'
            +t(x,y-2,lab,16 if big else 13.5,INK,'middle',700 if big else 500)+t(x,y+(17 if big else 15),i,11,SUB))
def ln(x1,y1,x2,y2,col,dash='',ar=False):
    return f'<path d="M{x1},{y1} C{x1},{(y1+y2)/2} {x2},{(y1+y2)/2} {x2},{y2}" fill="none" stroke="{col}" stroke-width="2" {dash}{" marker-end=%sURL(#ar2)%s"%(chr(34),chr(34)) if ar else ""}/>'
def lnh(x1,y1,x2,y2,col,ar=False):
    return f'<path d="M{x1},{y1} C{(x1+x2)/2},{y1} {(x1+x2)/2},{y2} {x2},{y2}" fill="none" stroke="{col}" stroke-width="2" {"marker-end=%sURL(#ar)%s"%(chr(34),chr(34)) if ar else ""}/>'
o=''
def lab(x,y,s,c=SUB): return t(x,y,s,12,c,'middle',600)
o+=lab(cx,70,'親（番号で一つ上）')
if par: o+=ln(cx,100,cx,cy-29,'#9aa3bd')+card(cx,100-0,par)
o+=lab(cx,H_:=0) if False else ''
# 子
o+=lab(cx,cy+70,'子（番号で一つ下）')
n=len(ch)
for k,c in enumerate(ch):
    x=cx+(k-(n-1)/2)*210; y=cy+140; o+=ln(cx,cy+29,x,y-23,'#9aa3bd')+card(x,y,c)
# リンク
o+=lab(cx-420,cy-110,'このノートを参照している')
for k,i in enumerate(inn):
    y=cy+(k-(len(inn)-1)/2)*70; o+=lnh(cx-355,y,cx-129,cy,ACC,True)+card(cx-420,y,i)
o+=lab(cx+420,cy-110,'このノートが参照している')
for k,i in enumerate(out_):
    y=cy+(k-(len(out_)-1)/2)*70; o+=lnh(cx+129,cy,cx+355,y,ACC,True)+card(cx+420,y,i)
# キーワード
o+=lab(cx,cy+235,'キーワード（同じキーワードのノート）',RED)
for k,kw in enumerate(mykw):
    x=cx+(k-(len(mykw)-1)/2)*280; w=len(kw)*14+30
    o+=f'<rect x="{x-w/2}" y="{cy+250}" width="{w}" height="30" rx="15" fill="#fdf1ef" stroke="{RED}"/>'+t(x,cy+270,kw,14,RED,'middle',700)
    o+=t(x,cy+301,'・'.join(i for i in KW[kw] if i!=C),11.5,SUB)
o+=card(cx,cy,C,True,ACC,'#e8edff')
defs='<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="%s"/></marker></defs>'%ACC
open('g6-local.html','w').write(page(1400,760,defs+o,'⑥ このノートの周り（今開いているノートが中心）','上=親、下=子、左右=リンク、一番下=キーワード。ノートを開くたびに作り直す。全体は⑤、周りだけは⑥と切り替え。'))
