# Details für die Blender-Flasche: Kronkorken mit Zacken und Prägering, Bier mit Tiefe/Trübung, Kohlensäure-Bläschen, Schaumkrone, Kondenswasser außen.
# Läuft nach bauen.py im selben Namensraum:  exec(open(ROOT + '/tools/blender/bauen.py').read()); exec(open(ROOT + '/tools/blender/details.py').read())
import random, time
_T0 = time.time()


def stufe(n):
    print('STUFE', n, round(time.time() - _T0, 1), flush=True)


rng = random.Random(20261017)
D = globals().get('DETAILS', {})
TROPFEN_KLEIN = D.get('tropfen_klein', 20000)
TROPFEN_MITTEL = D.get('tropfen_mittel', 3200)
TROPFEN_GROSS = D.get('tropfen_gross', 160)
BLASEN_KETTEN = D.get('blasen_ketten', 46)
BLASEN_DUNST = D.get('blasen_dunst', 900)


def alt_entfernen(name):
    ob = bpy.data.objects.get(name)
    if ob:
        bpy.data.objects.remove(ob, do_unlink=True)


stufe('Glas: Braunglas (am Hals ohne Bier gut s')
# ── Glas: Braunglas (am Hals ohne Bier gut sichtbar), Bier: sattes Bernstein mit Trübung und Tiefe ──
g = bpy.data.materials['Glas'].node_tree.nodes['GlasAbsorption']
g.inputs['Color'].default_value = D.get('glas_farbe', (0.94, 0.78, 0.10, 1))
_gnt = bpy.data.materials['Glas'].node_tree
_tcg = _gnt.nodes.new('ShaderNodeTexCoord'); _sep = _gnt.nodes.new('ShaderNodeSeparateXYZ'); _mr = _gnt.nodes.new('ShaderNodeMapRange')
_mr.inputs['From Min'].default_value = 0.6; _mr.inputs['From Max'].default_value = 1.4                    # Höhe in cm: massiver Glasboden (unter ~8 mm) schwächer gefärbt
_mr.inputs['To Min'].default_value = D.get('glas_dichte_boden', 1.0); _mr.inputs['To Max'].default_value = D.get('glas_dichte', 13.0)
# dunkle Ränder: je flacher der Blickwinkel auf das Glas, desto dunkler und brauner (wie auf dem Foto, dickere Glaswege am Rand)
_lw = _gnt.nodes.new('ShaderNodeLayerWeight'); _lw.inputs['Blend'].default_value = D.get('rand_blend', 0.35)
_pw = _gnt.nodes.new('ShaderNodeMath'); _pw.operation = 'POWER'; _pw.inputs[1].default_value = D.get('rand_potenz', 1.6)
_gnt.links.new(_lw.outputs['Facing'], _pw.inputs[0])
_mc = _gnt.nodes.new('ShaderNodeMix'); _mc.data_type = 'RGBA'; _mc.inputs['A'].default_value = g.inputs['Color'].default_value; _mc.inputs['B'].default_value = D.get('rand_farbe', (0.20, 0.07, 0.01, 1))
_gnt.links.new(_pw.outputs[0], _mc.inputs['Factor']); _gnt.links.new(_mc.outputs['Result'], g.inputs['Color'])
_gnt.links.new(_tcg.outputs['Object'], _sep.inputs[0]); _gnt.links.new(_sep.outputs['Z'], _mr.inputs['Value']); _gnt.links.new(_mr.outputs['Result'], g.inputs['Density'])

bm_ = bpy.data.materials['Bier']
nt, ln = bm_.node_tree, bm_.node_tree.links
for n in list(nt.nodes):
    if n.name not in ('BierBSDF',) and n.bl_idname != 'ShaderNodeOutputMaterial':
        nt.nodes.remove(n)
out = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeOutputMaterial'][0]
absn = nt.nodes.new('ShaderNodeVolumeAbsorption'); absn.name = 'BierAbsorption'
absn.inputs['Color'].default_value = D.get('bier_farbe', (0.99, 0.905, 0.06, 1)); absn.inputs['Density'].default_value = D.get('bier_dichte', 1.0)
sca = nt.nodes.new('ShaderNodeVolumeScatter'); sca.name = 'BierTruebung'
sca.inputs['Color'].default_value = (1.0, 0.78, 0.38, 1); sca.inputs['Density'].default_value = 0.012; sca.inputs['Anisotropy'].default_value = 0.35
tc = nt.nodes.new('ShaderNodeTexCoord')
noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.55; noise.inputs['Detail'].default_value = 3.0; noise.inputs['Roughness'].default_value = 0.6
rampn = nt.nodes.new('ShaderNodeMapRange'); rampn.inputs['From Min'].default_value = 0.3; rampn.inputs['From Max'].default_value = 0.7; rampn.inputs['To Min'].default_value = 0.8; rampn.inputs['To Max'].default_value = 1.25
mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 1.1
add = nt.nodes.new('ShaderNodeAddShader')
ln.new(tc.outputs['Object'], noise.inputs['Vector']); ln.new(noise.outputs['Fac'], rampn.inputs['Value']); ln.new(rampn.outputs['Result'], mul.inputs[0])
ln.new(mul.outputs[0], absn.inputs['Density'])
ln.new(absn.outputs[0], add.inputs[0]); ln.new(sca.outputs[0], add.inputs[1]); ln.new(add.outputs[0], out.inputs['Volume'])

stufe('Kronkorken neu: 21 Falten, Prägering, Wu')
# ── Kronkorken neu: 21 Falten, Prägering, Wulst am Rand ──
alt_entfernen('Kronkorken')
CAPP = [(13.0, 0.0), (14.6, 0.15), (15.5, 0.6), (15.7, 1.3), (15.45, 2.4), (15.2, 3.6), (15.0, 4.6), (14.5, 5.3), (13.6, 5.75), (12.7, 5.95), (11.6, 5.9),
        (11.0, 5.65), (10.6, 5.95), (9.9, 6.12), (0.0, 6.12)]           # Rand nach innen gebördelt, Prägering bei r ≈ 11, flacher Deckel
CAPS2 = catmull(CAPP[:-1], per=6) + [(0.0, 6.12)]


def falten(r, y, a):
    if r < 1:
        return r
    w = max(0.0, min(1.0, 1.0 - y / 4.9))                      # nur im unteren Teil des Rocks
    ph = (a * 21.0 / (2 * math.pi)) % 1.0
    tri = 1.0 - abs(ph - 0.5) * 2.0                             # 0 … 1 … 0
    s = tri * tri * (3 - 2 * tri)
    return r * (1.0 + 0.075 * w * (s - 0.5)) + 0.35 * w * s     # Zacken ragen nach außen


kork = revolve([(r, y + CAP_BASE) for r, y in CAPS2], 'Kronkorken', seg=21 * 16, wave=lambda r, y, a: falten(r, y - CAP_BASE, a))
km = bpy.data.materials['Kronkorken']
bsdf = km.node_tree.nodes['KorkBSDF']
bsdf.inputs['Base Color'].default_value = (0.62, 0.43, 0.13, 1)
bsdf.inputs['Roughness'].default_value = 0.34
nz = km.node_tree.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 60.0; nz.inputs['Detail'].default_value = 6.0
bump = km.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12; bump.inputs['Distance'].default_value = 0.02
tcn = km.node_tree.nodes.new('ShaderNodeTexCoord')
km.node_tree.links.new(tcn.outputs['Object'], nz.inputs['Vector']); km.node_tree.links.new(nz.outputs['Fac'], bump.inputs['Height']); km.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
kork.data.materials.append(km)

stufe('Schaumkrone im Hals (über dem Bier) ──')
# ── Schaumkrone im Hals (über dem Bier) ──
alt_entfernen('Schaum')
ri = lambda y: next((r for r, yy in reversed(INNER) if yy >= y), 8.0)
r_foam = min(r_out(FILL_MM) - WALL, 14.0) - 0.06
schaum = revolve([(0.0, FILL_MM - 0.2), (r_foam, FILL_MM - 0.2), (r_foam - 0.15, FILL_MM + 2.6), (r_foam - 0.7, FILL_MM + 4.4), (0.0, FILL_MM + 4.8)], 'Schaum')
sm = mat('Schaum'); sn, sl = sm.node_tree.nodes, sm.node_tree.links
so = sn.new('ShaderNodeOutputMaterial'); sp = sn.new('ShaderNodeBsdfPrincipled')
sp.inputs['Base Color'].default_value = (0.96, 0.90, 0.76, 1); sp.inputs['Roughness'].default_value = 0.85
sl.new(sp.outputs[0], so.inputs['Surface'])
schaum.data.materials.append(sm)

stufe('Kohlensäure-Bläschen (undurchsichtig-gla')
# ── Kohlensäure-Bläschen (undurchsichtig-glasig, Brechungsindex Luft in Bier ≈ 0,75) ──
alt_entfernen('Blasen')
# Einheitskugel (8 × 6) einmal, dann für jedes Bläschen verschoben und skaliert (schnell: Listen, kein bmesh pro Kugel)
_U, _V = 8, 6
_tv = [(0.0, 0.0, 1.0)]
for j in range(1, _V):
    th = math.pi * j / _V
    for i in range(_U):
        ph = math.tau * i / _U
        _tv.append((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
_tv.append((0.0, 0.0, -1.0))
_tf = []
for i in range(_U):
    _tf.append((0, 1 + i, 1 + (i + 1) % _U))
for j in range(_V - 2):
    for i in range(_U):
        a_, b_ = 1 + j * _U + i, 1 + j * _U + (i + 1) % _U
        _tf.append((a_, a_ + _U, b_ + _U, b_))
_last = len(_tv) - 1
for i in range(_U):
    _tf.append((_last, 1 + (_V - 2) * _U + (i + 1) % _U, 1 + (_V - 2) * _U + i))
bv, bf = [], []


def blase(x, y, z, r):
    o = len(bv)
    for (vx, vy, vz) in _tv:
        bv.append(((x + vx * r) * MM, (y + vy * r) * MM, (z + vz * r) * MM))
    for f in _tf:
        bf.append(tuple(o + k for k in f))


inner_r = lambda yy: next((r for r, y_ in reversed(INNER) if y_ >= yy), 20.0)
for c in range(BLASEN_KETTEN):
    a = rng.random() * math.tau
    rho = math.sqrt(rng.random()) * 0.78
    R = (r_out(60) - WALL) * rho
    x0, z0 = math.cos(a) * R, math.sin(a) * R
    y = 12.0 + rng.random() * 8
    while y < FILL_MM - 6:
        t = (y - 12.0) / (FILL_MM - 18.0)
        d = 0.22 + 0.55 * t * (0.8 + 0.4 * rng.random())          # Radius mm: unten klein, oben größer
        wob = 0.3 + 1.1 * t
        px = x0 + math.sin(y * 0.09 + a) * wob
        pz = z0 + math.cos(y * 0.07 + a * 1.3) * wob
        lim = r_out(y) - WALL - d - 0.3
        k = min(1.0, lim / max(math.hypot(px, pz), 1e-6))
        blase(px * k, pz * k, y, d)                                # (x, y, z) wird unten auf Blender-Achsen gedreht
        y += d * (3.4 + 3.0 * rng.random() + 5.0 * t)
for i in range(BLASEN_DUNST):
    y = 12 + rng.random() * (FILL_MM - 20)
    a = rng.random() * math.tau
    R = math.sqrt(rng.random()) * (r_out(y) - WALL - 0.6)
    blase(math.cos(a) * R, math.sin(a) * R, y, 0.12 + 0.2 * rng.random() ** 2)
mb = bpy.data.meshes.new('Blasen'); mb.from_pydata(bv, [], bf); mb.update()
for p in mb.polygons:
    p.use_smooth = True
blasen = bpy.data.objects.new('Blasen', mb); scene.collection.objects.link(blasen)
bam = mat('Blase'); bn, bl_ = bam.node_tree.nodes, bam.node_tree.links
bo_ = bn.new('ShaderNodeOutputMaterial'); bg_ = bn.new('ShaderNodeBsdfGlass')
bg_.inputs['IOR'].default_value = 0.75; bg_.inputs['Roughness'].default_value = 0.0
bl_.new(bg_.outputs[0], bo_.inputs['Surface'])
blasen.data.materials.append(bam)

stufe('Kondenswasser (Shader)')
# ── Kondenswasser: durchsichtige Hülle knapp über Glas und Etiketten; die Tropfen entstehen im Shader (Voronoi-Zellen → Kuppelhöhe → Bump-Normale → Glas-BSDF mit IOR 1,33),
# in drei Größen übereinander. Außerhalb der Tropfen ist die Hülle völlig durchsichtig. Kein Geometrieaufwand, die Brechung entsteht aus der Normale.
alt_entfernen('Tropfenflaeche')
fl = revolve([(r_out(y) + 0.27, y) for y in [5 + 0.5 * i for i in range(0, 421)]], 'Tropfenflaeche', seg=192)
fm = mat('Wasser'); wn, wl = fm.node_tree.nodes, fm.node_tree.links
wo = wn.new('ShaderNodeOutputMaterial')
tcw = wn.new('ShaderNodeTexCoord'); sepw = wn.new('ShaderNodeSeparateXYZ')
wl.new(tcw.outputs['Object'], sepw.inputs[0])
atn = wn.new('ShaderNodeMath'); atn.operation = 'ARCTAN2'; wl.new(sepw.outputs['Y'], atn.inputs[0]); wl.new(sepw.outputs['X'], atn.inputs[1])
um = wn.new('ShaderNodeMath'); um.operation = 'MULTIPLY'; um.inputs[1].default_value = 3.5; wl.new(atn.outputs[0], um.inputs[0])      # Bogenlänge ≈ Winkel × Radius (cm)
comb = wn.new('ShaderNodeCombineXYZ'); wl.new(um.outputs[0], comb.inputs['X']); wl.new(sepw.outputs['Z'], comb.inputs['Y'])
trans = wn.new('ShaderNodeBsdfTransparent')
shader = trans.outputs[0]


def mth(op, a=None, b=None, clamp=False):
    n = wn.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
    if a is not None:
        (wl.new(a, n.inputs[0]) if not isinstance(a, (int, float)) else setattr(n.inputs[0], 'default_value', a))
    if b is not None:
        (wl.new(b, n.inputs[1]) if not isinstance(b, (int, float)) else setattr(n.inputs[1], 'default_value', b))
    return n.outputs[0]


def schicht(scale, rmin, rmax, dichte, seed, hoehe):
    v = wn.new('ShaderNodeTexVoronoi'); v.feature = 'F1'; v.inputs['Scale'].default_value = scale; v.inputs['Randomness'].default_value = 1.0
    v.voronoi_dimensions = '3D'
    off = wn.new('ShaderNodeVectorMath'); off.operation = 'ADD'; off.inputs[1].default_value = (seed * 17.3, seed * 9.1, seed * 5.7)      # eigene Zufallsverteilung je Schicht
    wl.new(comb.outputs[0], off.inputs[0]); wl.new(off.outputs[0], v.inputs['Vector'])
    sp = wn.new('ShaderNodeSeparateColor'); wl.new(v.outputs['Color'], sp.inputs[0])
    rad = mth('ADD', mth('MULTIPLY', sp.outputs['Red'], rmax - rmin), rmin)                    # Radius je Zelle (in Zelleinheiten)
    rad = mth('MULTIPLY', rad, mth('GREATER_THAN', sp.outputs['Green'], 1.0 - dichte))           # nur ein Teil der Zellen trägt einen Tropfen
    d = v.outputs['Distance']
    inside = mth('SUBTRACT', rad, d)                                                           # > 0 im Tropfen
    mask = mth('SMOOTH_MAX', mth('MULTIPLY', inside, 60.0, True), 0.0)
    q = mth('DIVIDE', d, mth('MAXIMUM', rad, 0.001))
    dome = mth('SQRT', mth('SUBTRACT', 1.0, mth('MULTIPLY', q, q)), None, True)               # Kuppelprofil 0 … 1
    h = mth('MULTIPLY', dome, mth('MULTIPLY', rad, hoehe / scale))                             # Höhe in cm = Radius × Wölbung
    bu = wn.new('ShaderNodeBump'); bu.inputs['Distance'].default_value = 1.0; bu.inputs['Strength'].default_value = 1.0
    wl.new(h, bu.inputs['Height'])
    gl = wn.new('ShaderNodeBsdfGlass'); gl.inputs['IOR'].default_value = 1.33; gl.inputs['Roughness'].default_value = 0.0
    wl.new(bu.outputs[0], gl.inputs['Normal'])
    return gl.outputs[0], mask


global_sh = shader
for sc_, rn, rx, dn, sd, hh in ((16.0, 0.12, 0.34, 0.95, 3.0, 0.8), (7.5, 0.14, 0.36, 0.85, 1.0, 0.8), (3.0, 0.14, 0.36, 0.55, 7.0, 0.8), (1.2, 0.15, 0.34, 0.12, 13.0, 0.8)):
    g_, m_ = schicht(sc_, rn, rx, dn, sd, hh)
    mx = wn.new('ShaderNodeMixShader'); wl.new(m_, mx.inputs['Fac']); wl.new(global_sh, mx.inputs[1]); wl.new(g_, mx.inputs[2])
    global_sh = mx.outputs[0]
# Etikettenbereiche bleiben trocken: Winkel θ von der Vorderseite (−Y) aus; vorn |θ| < 1,339 + Rand (y 17,8–122,2 mm), hinten |θ| > 2,108 − Rand (y 25,8–114,2 mm), Hals |θ| < ~1,07–1,7 (y 149,6–186,4 mm)
th = wn.new('ShaderNodeMath'); th.operation = 'ARCTAN2'
negy = mth('MULTIPLY', sepw.outputs['Y'], -1.0)
wl.new(sepw.outputs['X'], th.inputs[0]); wl.new(negy, th.inputs[1])
ath = mth('ABSOLUTE', th.outputs[0])
zc = sepw.outputs['Z']
def zone(z0, z1):                                              # 1 innerhalb der Höhe (cm), weicher Rand 0,05 cm
    return mth('MULTIPLY', mth('GREATER_THAN', zc, z0), mth('LESS_THAN', zc, z1))
vorn = mth('MULTIPLY', zone(1.68, 12.32), mth('LESS_THAN', ath, 1.41))
hinten = mth('MULTIPLY', zone(2.5, 11.5), mth('GREATER_THAN', ath, 2.04))
half = wn.new('ShaderNodeMapRange'); half.inputs['From Min'].default_value = 14.9; half.inputs['From Max'].default_value = 18.7; half.inputs['To Min'].default_value = 1.14; half.inputs['To Max'].default_value = 1.78; half.clamp = True
wl.new(zc, half.inputs['Value'])
hals = mth('MULTIPLY', zone(14.9, 18.7), mth('LESS_THAN', ath, half.outputs['Result']))
trocken = mth('MAXIMUM', mth('MAXIMUM', vorn, hinten), hals)
mixl = wn.new('ShaderNodeMixShader'); wl.new(trocken, mixl.inputs['Fac']); wl.new(global_sh, mixl.inputs[1]); wl.new(trans.outputs[0], mixl.inputs[2])
wl.new(mixl.outputs[0], wo.inputs['Surface'])
fl.data.materials.append(fm)
for _n in ('Flaschenglas', 'Bier', 'Blasen', 'Schaum', 'Tropfenflaeche'):               # Glas wirft keinen Schatten: sonst bleibt das Innere (Schaum, Trübung) unbeleuchtet
    bpy.data.objects[_n].visible_shadow = False

result = {"tropfen": "Shader", "blasen_verts": len(blasen.data.vertices), "kork_verts": len(kork.data.vertices)}
