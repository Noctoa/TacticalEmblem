import random, sys
from PIL import Image, ImageDraw
T=32; COLS=8; ROWS=3
img=Image.new('RGBA',(T*COLS,T*ROWS),(0,0,0,0))
d=ImageDraw.Draw(img)
rnd=random.Random(7)
def at(i): return (i%COLS)*T,(i//COLS)*T
def noise(i,base,var,dens=0.35,size=1):
    x0,y0=at(i)
    d.rectangle([x0,y0,x0+T-1,y0+T-1],fill=base)
    for _ in range(int(T*T*dens/(size*size))):
        x=x0+rnd.randrange(0,T-size+1); y=y0+rnd.randrange(0,T-size+1)
        c=tuple(max(0,min(255,base[k]+rnd.randint(-var,var))) for k in range(3))+(255,)
        d.rectangle([x,y,x+size-1,y+size-1],fill=c)
GRASS=(104,164,72,255)
def grass(i): noise(i,GRASS,18,0.5,2)
# 0 herbe
grass(0)
# 1 herbe fleurie
grass(1); x0,y0=at(1)
for _ in range(7):
    x=x0+rnd.randrange(3,T-4); y=y0+rnd.randrange(3,T-4)
    c=rnd.choice([(240,230,110),(240,150,170),(250,250,250)])
    d.rectangle([x,y,x+1,y+1],fill=c)
# 2 foret
grass(2); x0,y0=at(2)
for (cx,cy,r) in [(9,12,8),(23,10,7),(16,22,9)]:
    d.rectangle([x0+cx-1,y0+cy+r-3,x0+cx+1,y0+cy+r+2],fill=(92,62,38))
    d.ellipse([x0+cx-r,y0+cy-r,x0+cx+r,y0+cy+r],fill=(38,98,48),outline=(24,64,32))
    d.ellipse([x0+cx-r+3,y0+cy-r+2,x0+cx,y0+cy-1],fill=(60,128,62))
# 3 montagne
grass(3); x0,y0=at(3)
d.polygon([(x0+1,y0+29),(x0+14,y0+6),(x0+27,y0+29)],fill=(138,116,90),outline=(92,74,56))
d.polygon([(x0+12,y0+29),(x0+22,y0+12),(x0+31,y0+29)],fill=(156,132,104),outline=(92,74,56))
d.polygon([(x0+14,y0+6),(x0+10,y0+14),(x0+18,y0+13)],fill=(220,214,200))
# 4 pic
noise(4,(126,110,96,255),14,0.5,2); x0,y0=at(4)
d.polygon([(x0+0,y0+31),(x0+16,y0+1),(x0+31,y0+31)],fill=(110,98,92),outline=(70,60,56))
d.polygon([(x0+16,y0+1),(x0+10,y0+12),(x0+16,y0+10),(x0+22,y0+12)],fill=(240,240,246))
# 5 eau
noise(5,(56,112,186,255),12,0.4,2); x0,y0=at(5)
for yy in (7,17,26):
    for xx in range(2,T-6,10):
        d.line([(x0+xx+(yy%5),y0+yy),(x0+xx+5+(yy%5),y0+yy)],fill=(150,196,236),width=1)
# 6 route (chemin plein, se raccorde dans les deux sens)
noise(6,(196,170,120,255),12,0.45,2); x0,y0=at(6)
for _ in range(14):
    x=x0+rnd.randrange(1,T-2); y=y0+rnd.randrange(1,T-2)
    d.rectangle([x,y,x+1,y+1],fill=(160,136,96))
# 7 pont
noise(7,(56,112,186,255),12,0.4,2); x0,y0=at(7)
d.rectangle([x0,y0+5,x0+T-1,y0+26],fill=(150,104,62))
for xx in range(0,T,6): d.line([(x0+xx,y0+5),(x0+xx,y0+26)],fill=(112,76,44))
d.line([(x0,y0+5),(x0+T-1,y0+5)],fill=(90,60,34),width=2); d.line([(x0,y0+26),(x0+T-1,y0+26)],fill=(90,60,34),width=2)
# 8 sable
noise(8,(222,200,140,255),14,0.5,2)
# 9 fort
grass(9); x0,y0=at(9)
d.rectangle([x0+4,y0+8,x0+27,y0+29],fill=(150,146,140),outline=(80,76,72))
for xx in range(4,28,6): d.rectangle([x0+xx,y0+4,x0+xx+3,y0+8],fill=(150,146,140),outline=(80,76,72))
d.rectangle([x0+12,y0+18,x0+19,y0+29],fill=(70,50,36))
d.line([(x0+16,y0+2),(x0+16,y0-0+0)],fill=(0,0,0))
# 10 village
grass(10); x0,y0=at(10)
d.rectangle([x0+6,y0+14,x0+25,y0+29],fill=(226,204,160),outline=(120,90,60))
d.polygon([(x0+3,y0+15),(x0+16,y0+4),(x0+28,y0+15)],fill=(186,64,52),outline=(120,40,32))
d.rectangle([x0+13,y0+20,x0+18,y0+29],fill=(110,74,44))
# 11 mur
noise(11,(120,116,112,255),10,0.3,2); x0,y0=at(11)
for row,yy in enumerate(range(0,T,8)):
    d.line([(x0,y0+yy),(x0+T-1,y0+yy)],fill=(78,74,70))
    off=0 if row%2 else 8
    for xx in range(off,T,16): d.line([(x0+xx,y0+yy),(x0+xx,y0+yy+7)],fill=(78,74,70))
# 12 sol dalles
noise(12,(176,162,140,255),8,0.3,2); x0,y0=at(12)
for v in range(0,T,16):
    d.line([(x0+v,y0),(x0+v,y0+T-1)],fill=(140,128,110)); d.line([(x0,y0+v),(x0+T-1,y0+v)],fill=(140,128,110))
# 13 trone
noise(13,(150,40,48,255),8,0.3,2); x0,y0=at(13)
d.rectangle([x0+8,y0+4,x0+23,y0+28],fill=(214,176,64),outline=(140,104,30))
d.rectangle([x0+11,y0+12,x0+20,y0+24],fill=(170,40,52))
d.polygon([(x0+8,y0+4),(x0+16,y0+0),(x0+23,y0+4)],fill=(214,176,64))
# 14 maison
grass(14); x0,y0=at(14)
d.rectangle([x0+3,y0+12,x0+28,y0+29],fill=(200,190,170),outline=(110,96,80))
d.polygon([(x0+0,y0+13),(x0+16,y0+2),(x0+31,y0+13)],fill=(96,88,140),outline=(60,54,96))
d.rectangle([x0+7,y0+17,x0+11,y0+21],fill=(250,226,140)); d.rectangle([x0+20,y0+17,x0+24,y0+21],fill=(250,226,140))
# 15 portail
noise(15,(120,116,112,255),10,0.3,2); x0,y0=at(15)
d.rectangle([x0+5,y0+4,x0+26,y0+31],fill=(96,66,40),outline=(60,40,24))
for xx in range(9,26,5): d.line([(x0+xx,y0+4),(x0+xx,y0+31)],fill=(70,48,28))
d.ellipse([x0+20,y0+16,x0+23,y0+19],fill=(220,190,90))
# 16 buisson : herbe + touffes basses
grass(16); x0,y0=at(16)
for (cx,cy,r) in [(9,20,6),(21,18,7),(15,25,6)]:
    d.ellipse([x0+cx-r,y0+cy-r+2,x0+cx+r,y0+cy+r-1],fill=(58,120,52),outline=(30,72,34))
    d.ellipse([x0+cx-r+2,y0+cy-r+3,x0+cx,y0+cy-1],fill=(88,152,70))
for _ in range(5):
    x=x0+rnd.randrange(4,T-4); y=y0+rnd.randrange(14,T-6); d.point((x,y),fill=(196,64,72))
# 17 fourré : végétation dense
noise(17,(44,96,44,255),14,0.5,2); x0,y0=at(17)
for (cx,cy,r) in [(7,8,7),(22,7,7),(14,17,8),(6,25,7),(24,25,7)]:
    d.ellipse([x0+cx-r,y0+cy-r,x0+cx+r,y0+cy+r],fill=(34,84,40),outline=(18,52,24))
    d.ellipse([x0+cx-r+2,y0+cy-r+1,x0+cx,y0+cy-1],fill=(62,122,58))
img.save(sys.argv[1])
print(img.size)
