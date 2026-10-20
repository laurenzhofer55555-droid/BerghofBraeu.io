# Baut die Berghof-Hell-Flasche in Blender (Cycles) nach demselben Profil und denselben Etiketten wie js/bottle.js.
# Aufruf in Blender (z. B. über den MCP-Server):  ROOT = '<Repo>'; exec(open(ROOT + '/tools/blender/bauen.py').read())
# Maße: 1 Blender-Einheit = 1 cm (Flasche 22,9 Einheiten hoch), Flaschenboden bei z = 0, Kamera blickt von -Y auf die Vorderseite.
import bpy, bmesh, math, re, os
from mathutils import Vector

MM = 0.1                                   # 1 mm = 0,1 Einheiten (cm)
BOTTLE_H = 229.2                           # mm bis Oberkante Kronkorken
CAP_BASE, CAP_H = 222.9, 6.3
FILL_MM = 205.0                            # Füllhöhe: bis knapp unter den Halsansatz (kein sichtbarer Luftbalken)
WALL = 2.7                                 # Glasstärke (mm)
SEG = 160                                  # Segmente um die Achse

# ── Profil aus js/bottle.js lesen und glätten (Catmull-Rom, centripetal wie in three.js) ──
src = open(ROOT + '/js/bottle.js', encoding='utf-8').read()
blk = re.search(r'const PROFILE_MM = \[(.*?)\n\];', src, re.S).group(1)
blk = re.sub(r'//[^\n]*', '', blk)
RAW = [(float(a), float(b)) for a, b in re.findall(r'\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]', blk)]


def catmull(points, per=5):
    P = [Vector((x, y, 0)) for x, y in points]
    out = []
    n = len(P)
    for i in range(n - 1):
        p0 = P[i - 1] if i > 0 else P[i] * 2 - P[i + 1]
        p1, p2 = P[i], P[i + 1]
        p3 = P[i + 2] if i + 2 < n else P[i + 1] * 2 - P[i]
        t0 = 0.0
        t1 = t0 + max((p1 - p0).length, 1e-6) ** 0.5
        t2 = t1 + max((p2 - p1).length, 1e-6) ** 0.5
        t3 = t2 + max((p3 - p2).length, 1e-6) ** 0.5
        for k in range(per):
            t = t1 + (t2 - t1) * k / per
            A1 = p0 * ((t1 - t) / (t1 - t0)) + p1 * ((t - t0) / (t1 - t0))
            A2 = p1 * ((t2 - t) / (t2 - t1)) + p2 * ((t - t1) / (t2 - t1))
            A3 = p2 * ((t3 - t) / (t3 - t2)) + p3 * ((t - t2) / (t3 - t2))
            B1 = A1 * ((t2 - t) / (t2 - t0)) + A2 * ((t - t0) / (t2 - t0))
            B2 = A2 * ((t3 - t) / (t3 - t1)) + A3 * ((t - t1) / (t3 - t1))
            C = B1 * ((t2 - t) / (t2 - t1)) + B2 * ((t - t1) / (t2 - t1))
            out.append((max(C.x, 0.0), C.y))
    out.append(points[-1])
    return out


OUTER_FULL = catmull(RAW)
# Außenprofil bis zum Bohrungsboden (8, 214) – der letzte Punkt (0, 214) der three.js-Liste gehört dort nur zur Füllung
cut = max(i for i, (r, y) in enumerate(OUTER_FULL) if abs(r - 8.0) < 1e-6 and abs(y - 214.0) < 1e-3)
OUTER = [(r, y) for r, y in OUTER_FULL[:cut + 1]]


def r_out(y):                               # Außenradius (mm) auf dem Flaschenkörper, y in mm
    pts = [(r, yy) for r, yy in OUTER if r > 0.01]
    pts.sort(key=lambda p: p[1])
    for i in range(1, len(pts)):
        if pts[i][1] >= y:
            a, b = pts[i - 1], pts[i]
            t = (y - a[1]) / max(b[1] - a[1], 1e-6)
            return a[0] + (b[0] - a[0]) * t
    return pts[-1][0]


def inner_profile():
    """Innenprofil von der Bohrung (8, 214) abwärts bis zur Bodenmitte (0, 8.4): Wand = Außenkontur − WALL (entlang der Normalen)."""
    body = [(r, y) for r, y in OUTER if 16.0 <= y <= 205.0 and r > 20 or (16.0 <= y <= 205.0 and r > 0.01)]
    body = sorted({(round(r, 4), round(y, 4)) for r, y in body}, key=lambda p: p[1])
    res = []
    for i, (r, y) in enumerate(body):
        a = body[max(i - 1, 0)]; b = body[min(i + 1, len(body) - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, ty) or 1.0
        nx, ny = ty / L, -tx / L           # Außennormale (r, y)
        res.append((r - WALL * nx, y - WALL * ny))
    res.sort(key=lambda p: p[1])
    top = res[-1]
    neck = []
    for k in range(1, 9):                   # sanfter Übergang zur Bohrung Ø 16 (r = 8)
        t = k / 8.0
        s = t * t * (3 - 2 * t)
        neck.append((top[0] + (8.0 - top[0]) * s, top[1] + (214.0 - top[1]) * t))
    wall = res + neck                       # aufsteigend bis (8, 214)
    r16 = res[0][0]
    floor = [(r16, res[0][1]), (r16 - 1.2, 12.2), (r16 - 3.6, 9.9), (r16 - 8.0, 8.9), (24.0, 8.5), (12.0, 8.4), (0.0, 8.4)]
    # aufsteigende Reihenfolge der Wand, der Boden danach (absteigend zur Achse): Rückgabe von oben nach unten
    return list(reversed(wall)) + floor


INNER = inner_profile()


def revolve(profile_mm, name, seg=SEG, wave=None, close_axis=False):
    """Dreht ein (r, y)-Profil (mm) um die z-Achse; Fläche zwischen aufeinanderfolgenden Profilpunkten. wave(r, y, a) → neuer Radius."""
    bm = bmesh.new()
    rows = []
    for r, y in profile_mm:
        row = []
        for j in range(seg):
            a = 2 * math.pi * j / seg
            rr = wave(r, y, a) if wave else r
            row.append(bm.verts.new((rr * MM * math.cos(a), rr * MM * math.sin(a), y * MM)))
        rows.append(row)
    for i in range(len(rows) - 1):
        for j in range(seg):
            k = (j + 1) % seg
            try:
                bm.faces.new((rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j]))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ── Szene aufräumen ──
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images, bpy.data.worlds):
    for it in list(coll):
        coll.remove(it)
scene = bpy.context.scene


# ── Materialien ──
def mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    return m


def glas_material():
    m = mat('Glas')
    n, l = m.node_tree.nodes, m.node_tree.links
    out = n.new('ShaderNodeOutputMaterial')
    g = n.new('ShaderNodeBsdfGlass'); g.name = 'GlasBSDF'
    g.inputs['Color'].default_value = (1, 1, 1, 1); g.inputs['Roughness'].default_value = 0.01; g.inputs['IOR'].default_value = 1.5
    v = n.new('ShaderNodeVolumeAbsorption'); v.name = 'GlasAbsorption'
    v.inputs['Color'].default_value = (0.78, 0.40, 0.08, 1); v.inputs['Density'].default_value = 90.0
    l.new(g.outputs[0], out.inputs['Surface']); l.new(v.outputs[0], out.inputs['Volume'])
    return m


def bier_material():
    m = mat('Bier')
    n, l = m.node_tree.nodes, m.node_tree.links
    out = n.new('ShaderNodeOutputMaterial')
    g = n.new('ShaderNodeBsdfGlass'); g.name = 'BierBSDF'
    g.inputs['Color'].default_value = (1, 1, 1, 1); g.inputs['Roughness'].default_value = 0.0; g.inputs['IOR'].default_value = 1.33
    v = n.new('ShaderNodeVolumeAbsorption'); v.name = 'BierAbsorption'
    v.inputs['Color'].default_value = (0.93, 0.62, 0.12, 1); v.inputs['Density'].default_value = 1.2
    l.new(g.outputs[0], out.inputs['Surface']); l.new(v.outputs[0], out.inputs['Volume'])
    return m


def etikett_material(name, png, alpha=False):
    """Papieretikett auf nassem Glas: Papier (diffus) + Durchscheinen (Translucent, Bier und Rückseite glimmen schwach durch) + etwas Transparenz (man sieht Bläschen und Glas dahinter)
    + nasse Klarlackschicht (Reflexe der Softboxen laufen über das Etikett wie über das Glas) + feines Papierkorn."""
    DD = globals().get('DETAILS', {})
    m = mat(name)
    n, l = m.node_tree.nodes, m.node_tree.links
    out = n.new('ShaderNodeOutputMaterial')
    t = n.new('ShaderNodeTexImage'); t.name = 'EtikettBild'
    t.image = bpy.data.images.load(png); t.image.colorspace_settings.name = 'sRGB'; t.interpolation = 'Smart'; t.extension = 'EXTEND'      # EXTEND: sonst mischt die unterste Pixelreihe die oberste (weiß) ein → weißer Haarstrich am unteren Etikettrand
    p = n.new('ShaderNodeBsdfPrincipled'); p.name = 'EtikettBSDF'
    p.inputs['Roughness'].default_value = 0.6
    for key in ('Specular IOR Level', 'Specular'):
        if key in p.inputs:
            p.inputs[key].default_value = 0.2
    for key, val in (('Coat Weight', DD.get('etikett_klarlack', 0.0)), ('Coat Roughness', 0.07), ('Coat IOR', 1.4)):
        if key in p.inputs:
            p.inputs[key].default_value = val
    hsv = n.new('ShaderNodeHueSaturation'); hsv.inputs['Saturation'].default_value = DD.get('etikett_saettigung', 1.0); hsv.inputs['Value'].default_value = DD.get('etikett_helligkeit', 1.0)   # heller und entsättigt, als wäre das Etikett leicht feucht
    l.new(t.outputs['Color'], hsv.inputs['Color']); l.new(hsv.outputs['Color'], p.inputs['Base Color'])
    # Papierkorn
    tc = n.new('ShaderNodeTexCoord'); no = n.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = 900.0; no.inputs['Detail'].default_value = 4.0
    bu = n.new('ShaderNodeBump'); bu.inputs['Strength'].default_value = 0.015; bu.inputs['Distance'].default_value = 0.01
    l.new(tc.outputs['Object'], no.inputs['Vector']); l.new(no.outputs['Fac'], bu.inputs['Height']); l.new(bu.outputs[0], p.inputs['Normal'])
    # Durchscheinen: Licht von hinten (Bier, Glas) färbt das Papier mit
    tr = n.new('ShaderNodeBsdfTranslucent')
    warm = n.new('ShaderNodeMix'); warm.data_type = 'RGBA'; warm.blend_type = 'MULTIPLY'; warm.inputs['Factor'].default_value = 1.0
    warm.inputs['B'].default_value = (1.0, 0.86, 0.62, 1.0)                                    # Papier schimmert warm
    l.new(hsv.outputs['Color'], warm.inputs['A']); l.new(warm.outputs['Result'], tr.inputs['Color'])
    mx = n.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = DD.get('etikett_durchscheinen', 0.0)
    # warmer Schimmer von hinten (Licht im Bier scheint durchs Papier): schwache Emission in Papier-/Bierfarbe
    em = n.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = DD.get('etikett_schimmer', 0.0)
    l.new(warm.outputs['Result'], em.inputs['Color'])
    ad = n.new('ShaderNodeAddShader'); l.new(p.outputs[0], ad.inputs[0]); l.new(em.outputs[0], ad.inputs[1])
    l.new(ad.outputs[0], mx.inputs[1]); l.new(tr.outputs[0], mx.inputs[2])
    # Transparenz: ein Teil des Lichts geht gerade durch (man sieht das Bier, Bläschen und die Rückseite schwach dahinter)
    tp = n.new('ShaderNodeBsdfTransparent')
    mt = n.new('ShaderNodeMixShader')
    al = n.new('ShaderNodeMath'); al.operation = 'MULTIPLY'; al.inputs[1].default_value = DD.get('etikett_deckkraft', 1.0)
    if alpha:
        l.new(t.outputs['Alpha'], al.inputs[0])
    else:
        al.inputs[0].default_value = 1.0
    inv = n.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; l.new(al.outputs[0], inv.inputs[1])
    l.new(inv.outputs[0], mt.inputs['Fac']); l.new(mx.outputs[0], mt.inputs[1]); l.new(tp.outputs[0], mt.inputs[2])
    l.new(mt.outputs[0], out.inputs['Surface'])
    return m


def gold_material():
    m = mat('Kronkorken')
    n, l = m.node_tree.nodes, m.node_tree.links
    out = n.new('ShaderNodeOutputMaterial')
    p = n.new('ShaderNodeBsdfPrincipled'); p.name = 'KorkBSDF'
    p.inputs['Base Color'].default_value = (0.79, 0.64, 0.30, 1)
    p.inputs['Metallic'].default_value = 1.0; p.inputs['Roughness'].default_value = 0.28
    l.new(p.outputs[0], out.inputs['Surface'])
    return m


# ── Glas, Bier ──
glas = revolve(OUTER + INNER[1:], 'Flaschenglas')
glas.data.materials.append(glas_material())

wall_gap = 0.03
inner_up = list(reversed(INNER))                         # von der Bodenmitte aufwärts
bier_pts = [(0.0, inner_up[0][1] + wall_gap)]
for r, y in inner_up[1:]:
    if y > FILL_MM - 0.5:
        break
    bier_pts.append((max(r - wall_gap, 0.0), max(y, 8.4 + wall_gap)))
rf = r_out(FILL_MM) - WALL
bier_pts.append((rf - wall_gap, FILL_MM)); bier_pts.append((0.0, FILL_MM))
bier = revolve(bier_pts, 'Bier')
bier.data.materials.append(bier_material())

# ── Kronkorken ──
CAP = [(14.4, 0), (15.3, 0.2), (15.9, 0.8), (15.8, 1.6), (15.4, 2.8), (15.25, 4.2), (15.1, 5), (14.6, 5.7), (13.7, 6.15), (13.1, 6.3), (0.0, 6.3)]
CAPS = catmull(CAP[:-1], per=6) + [(0.0, 6.3)]


def zacken(r, y, a):                                      # 21 Zacken am unteren Rand des Kronkorkens
    w = max(0.0, 1.0 - y / 4.6)
    ph = (a * 21 / (2 * math.pi)) % 1.0
    tri = abs(ph - 0.5) * 2.0
    return r * (1.0 + 0.045 * w * (tri - 0.5))


kork = revolve([(r, y + CAP_BASE) for r, y in CAPS], 'Kronkorken', seg=21 * 12, wave=lambda r, y, a: zacken(r, y - CAP_BASE, a) if r > 1 else r)
kork.data.materials.append(gold_material())


# ── Etiketten (Gitter, folgt dem Flaschenradius + 0,22 mm) ──
def etikett(name, png, y0, y1, width, phi, alpha=False, ny=70, nx=90):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UV')
    vs = []
    for iy in range(ny + 1):
        y = y0 + (y1 - y0) * iy / ny
        R = r_out(y) + 0.22
        row = []
        for ix in range(nx + 1):
            s = -width / 2 + width * ix / nx
            a = phi + s / R
            row.append(bm.verts.new((R * MM * math.sin(a), -R * MM * math.cos(a), y * MM)))
        vs.append(row)
    for iy in range(ny):
        for ix in range(nx):
            f = bm.faces.new((vs[iy][ix], vs[iy][ix + 1], vs[iy + 1][ix + 1], vs[iy + 1][ix]))
            for lp, (ux, uy) in zip(f.loops, ((ix, iy), (ix + 1, iy), (ix + 1, iy + 1), (ix, iy + 1))):
                lp[uv].uv = (ux / nx, uy / ny)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.data.materials.append(etikett_material(name, os.path.join(ROOT, 'tools/blender/tex', png), alpha))
    return ob


# Maße wie LABELS in js/bottle.js
etikett('Etikett_vorn', 'label-front.png', 17.8, 122.2, 94.4, 0.0)
etikett('Etikett_hinten', 'label-back.png', 25.75, 114.25, 72.8, math.pi)
etikett('Etikett_hals', 'label-neck.png', 149.6, 186.4, 68.6, 0.0, alpha=True)

# ── Boden für den Kontaktschatten (Shadow Catcher) ──
bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, -0.001))
boden = bpy.context.active_object; boden.name = 'Boden'
boden.is_shadow_catcher = True
boden.visible_glossy = False; boden.visible_transmission = False; boden.visible_diffuse = False      # nur der Schatten zählt, keine Spiegelung/Brechung des Bodens

# ── Licht: Softboxen (Flächenlichter) ──
def flaeche(name, pos, size, power, target=(0, 0, 11.5), color=(1, 0.98, 0.94)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = 'RECTANGLE'; ld.size, ld.size_y = size
    ld.energy = power; ld.color = color
    ob = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(ob)
    ob.location = pos
    c = ob.constraints.new('TRACK_TO'); c.target = bpy.data.objects.get('Ziel') or None
    c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return ob


ziel = bpy.data.objects.new('Ziel', None); scene.collection.objects.link(ziel); ziel.location = (0, 0, 11.5)
lights = [
    flaeche('Licht_Softbox', (-95, -90, 40), (95, 130), 20000),        # große weiche Softbox schräg von oben links
    flaeche('Licht_KanteL', (-62, 52, 14), (7, 170), 4900),           # schmaler Streifen seitlich hinten links: dunkle Glaskanten, helle senkrechte Reflexstreifen
    flaeche('Licht_KanteR', (62, 52, 14), (7, 170), 14000),            # … hinten rechts
    flaeche('Licht_Front', (0, -140, 14), (120, 60), 1200),             # schwacher Aufheller, damit die Etiketten lesbar bleiben
]
for o in lights:
    o.constraints['Track To'].target = ziel

# ── Welt: Creme für Kamera- und Brechungsstrahlen, neutrales weiches Licht sonst ──
w = bpy.data.worlds.new('Studio'); scene.world = w; w.use_nodes = True
nt = w.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputWorld')
lp = nt.nodes.new('ShaderNodeLightPath')
mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'
cream = nt.nodes.new('ShaderNodeBackground'); cream.name = 'WeltCreme'; cream.inputs['Color'].default_value = (0.9301, 0.9047, 0.8388, 1); cream.inputs['Strength'].default_value = 1.0   # sRGB 247/244/236
# schwarze Blenden links und rechts (wie im Studio): Strahlen, die seitlich wegbrechen, sehen Dunkel → dunkle Flaschenränder
tcw = nt.nodes.new('ShaderNodeTexCoord'); sepw = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tcw.outputs['Generated'], sepw.inputs[0])
absx = nt.nodes.new('ShaderNodeMath'); absx.operation = 'ABSOLUTE'; nt.links.new(sepw.outputs['X'], absx.inputs[0])
rmp = nt.nodes.new('ShaderNodeMapRange'); rmp.clamp = True; rmp.inputs['From Min'].default_value = globals().get('DETAILS', {}).get('blende_von', 0.18); rmp.inputs['From Max'].default_value = globals().get('DETAILS', {}).get('blende_bis', 0.7)
nt.links.new(absx.outputs[0], rmp.inputs['Value'])
mcr = nt.nodes.new('ShaderNodeMix'); mcr.data_type = 'RGBA'; mcr.inputs['A'].default_value = (0.9301, 0.9047, 0.8388, 1); mcr.inputs['B'].default_value = (0.07, 0.05, 0.035, 1)
nt.links.new(rmp.outputs['Result'], mcr.inputs['Factor']); nt.links.new(mcr.outputs['Result'], cream.inputs['Color'])
neutral = nt.nodes.new('ShaderNodeBackground'); neutral.name = 'WeltNeutral'; neutral.inputs['Color'].default_value = (1, 1, 1, 1); neutral.inputs['Strength'].default_value = 0.5
mix = nt.nodes.new('ShaderNodeMixShader')
nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs[0]); nt.links.new(lp.outputs['Is Transmission Ray'], mx.inputs[1])
nt.links.new(mx.outputs[0], mix.inputs['Fac']); nt.links.new(neutral.outputs[0], mix.inputs[1]); nt.links.new(cream.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], out.inputs['Surface'])

# ── Kamera wie in js (Station „front“): 92 % Bildhöhe, 122,6 cm Abstand ──
cd = bpy.data.cameras.new('Kamera')
dist = 122.6
cd.sensor_fit = 'VERTICAL'
cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24.0; cd.lens = 100.0                      # 100 mm
dist = (BOTTLE_H * MM / 0.92 / 2) / (12.0 / 100.0)                                         # Flasche füllt 92 % der Bildhöhe
cd.dof.use_dof = True; cd.dof.aperture_fstop = 16.0                                        # leichte Tiefenunschärfe
cam = bpy.data.objects.new('Kamera', cd); scene.collection.objects.link(cam)
cam.location = (0, -dist, BOTTLE_H * MM / 2)

cam.rotation_euler = (math.pi / 2, 0, 0)
scene.camera = cam
cd.dof.focus_distance = dist - 3.5                                                         # Schärfe auf der Etikett-Vorderseite

# ── Render-Einstellungen ──
r = scene.render
r.engine = 'CYCLES'; r.resolution_x, r.resolution_y, r.resolution_percentage = 1000, 2400, 100
r.film_transparent = True
r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
try:
    scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    scene.view_settings.look = 'None'
c = scene.cycles
c.samples = 512; c.use_denoising = True; c.denoiser = 'OPENIMAGEDENOISE'
for _k, _v in (('denoising_input_passes', 'RGB_ALBEDO_NORMAL'), ('denoising_prefilter', 'ACCURATE'), ('denoising_quality', 'HIGH')):
    try:
        setattr(c, _k, _v)
    except Exception:
        pass                                                  # Albedo und Normale als Hilfsbilder: der Entrauscher erhält feine Kanten (Kronkorken)
c.max_bounces = 24; c.transmission_bounces = 12; c.glossy_bounces = 12; c.diffuse_bounces = 4; c.volume_bounces = 4; c.transparent_max_bounces = 16
c.caustics_reflective = False; c.caustics_refractive = False
c.use_adaptive_sampling = True
scene.unit_settings.system = 'METRIC'; scene.unit_settings.scale_length = 0.01; scene.unit_settings.length_unit = 'CENTIMETERS'

result = {"glas_verts": len(glas.data.vertices), "bier_verts": len(bier.data.vertices), "innen_punkte": len(INNER), "aussen_punkte": len(OUTER),
          "kamera_fov_grad": round(math.degrees(cd.angle_y), 2), "kork_verts": len(kork.data.vertices)}
