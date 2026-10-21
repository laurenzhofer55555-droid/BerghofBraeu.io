# Rendert die Scroll-Sequenz der Startseite aus der Blender-Szene (gleicher Kamerapfad wie tools/sequenz-rendern.html).
# Aufruf: Blender -b flasche_v7.blend --python sequenz_blender.py -- <sequenz.json> <Ausgabeordner> <desktop|mobil|poster-quer|poster-hoch> <von> <bis> <Samples>
# Ausgabe: RGBA-PNG (freigestellt, Schatten als Alpha) nach <Ausgabeordner>/rgba-<set>/NNN.png; Kronkorken-Mitte je Bild nach <Ausgabeordner>/kappe-<set>.json
# Die Bilder werden danach mit tools/blender/sequenz_komposit.py auf Creme gelegt und mit tools/sequenz.py in WebP umgewandelt.
import bpy, sys, json, math, os
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

a = sys.argv[sys.argv.index('--') + 1:]
JSON, OUT, NAME, VON, BIS, SAMPLES = a[0], a[1], a[2], int(a[3]), int(a[4]), int(a[5])
seq = json.load(open(JSON, encoding='utf-8'))
CONFIG_FOV = 28.0                                   # js/config.js → camera.fov (Stationen ohne eigenen Bildwinkel)
BH = 2.2920                                         # Flaschenhöhe in three.js-Einheiten (Boden bis Oberkante Kronkorken)
FORMATS = {                                         # (Breite, Höhe, Hochformat, Satz, Bildwinkel-Station) – Bewegungsbilder in Zielgröße, Bild 1 als großes Ruhebild
    'desktop': dict(w=1600, h=800, still=(2880, 1440), portrait=False),
    'mobil': dict(w=700, h=1129, still=(1200, 1935), portrait=True),
    'poster-quer': dict(w=4000, h=2500, still=None, portrait=False),
    'poster-hoch': dict(w=1280, h=2771, still=None, portrait=True),
}
F = FORMATS[NAME]
setname = 'mobil' if F['portrait'] else 'desktop'
spec = seq['sets'][setname]
st = spec['stations']
tan = spec.get('tangent', 1.0)


def V(v):
    return Vector(v)


def same(x, y):
    return (x - y).length_squared < 1e-10


def hermite(values, f):
    i = 0
    while i < len(st) - 2 and f > st[i + 1]['frame']:
        i += 1
    f0, f1 = st[i]['frame'], st[i + 1]['frame']
    t = min(1.0, max(0.0, (f - f0) / (f1 - f0)))

    def tangent(k):
        if k == 0 or k == len(st) - 1:
            return values[k] * 0
        prev, cur, nxt = values[k - 1], values[k], values[k + 1]
        if same(prev, cur) or same(cur, nxt):
            return cur * 0
        return (nxt - prev) / (st[k + 1]['frame'] - st[k - 1]['frame']) * tan
    span = f1 - f0; t2 = t * t; t3 = t2 * t
    h00 = 2 * t3 - 3 * t2 + 1; h10 = t3 - 2 * t2 + t; h01 = -2 * t3 + 3 * t2; h11 = t3 - t2
    return values[i] * h00 + tangent(i) * (h10 * span) + values[i + 1] * h01 + tangent(i + 1) * (h11 * span)


def ease_zoom(t, p=1.5):
    return 1 - (1 - t) ** p


def pose(f):
    pos = [V(s['cam']['pos']) for s in st]; target = [V(s['cam']['target']) for s in st]
    rot = [Vector((s['rot'], 0, 0)) for s in st]; shift = [Vector((s.get('shift', 0), 0, 0)) for s in st]
    fovs = [Vector((s.get('fov', CONFIG_FOV), 0, 0)) for s in st]
    last = len(st) - 1
    zooming = st[last].get('zoom') and f > st[last - 1]['frame']
    if zooming:
        t = ease_zoom((f - st[last - 1]['frame']) / (st[last]['frame'] - st[last - 1]['frame']), spec.get('zoomEase', 1.5))
        tg = target[last - 1].lerp(target[last], t)
        dA = (pos[last - 1] - target[last - 1]).length; dB = (pos[last] - target[last]).length
        dirA = (pos[last - 1] - target[last - 1]).normalized(); dirB = (pos[last] - target[last]).normalized()
        d = dirA.lerp(dirB, t).normalized()
        p = tg + d * (dA * (dB / dA) ** t)
    else:
        p = hermite(pos, f); tg = hermite(target, f)
    return dict(pos=p, target=tg, rot=hermite(rot, f).x, shift=shift[last].x if zooming else hermite(shift, f).x,
                fov=fovs[last].x if zooming else hermite(fovs, f).x)


def bl(v):                                          # three.js (x, y, z; 1 Einheit = 10 cm; Ursprung Flaschenmitte) → Blender (cm; Boden z = 0, Vorderseite −Y)
    return Vector((v.x * 10, -v.z * 10, (v.y + BH / 2) * 10))


def smooth01(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def szene_einrichten():
    """Kontaktschatten wie auf der Seite: der Boden bekommt nur einen weichen Oberlicht-Schatten, die übrigen Lichter (Softbox, Randstreifen) beleuchten nur die Flasche."""
    O = bpy.data.objects
    teile = [o for o in O if o.type == 'MESH' and o.name != 'Boden']
    koerper = bpy.data.collections.new('FlaschenTeile'); sc.collection.children.link(koerper)
    for o in teile:
        koerper.objects.link(o)
    for l in [o for o in O if o.type == 'LIGHT']:
        l.light_linking.receiver_collection = koerper                        # Licht nur auf die Flasche, nicht auf den Boden
    boden = O['Boden']
    bc = bpy.data.collections.new('BodenTeil'); sc.collection.children.link(bc); bc.objects.link(boden)
    # Schattenkörper: unsichtbar für alle Strahlen außer Schatten, wirft den Kontaktschatten (Glas, Bier und Wasser werfen sonst keinen)
    glas = O['Flaschenglas']
    sk = O.new('Schattenkoerper', glas.data) if hasattr(O, 'new') else bpy.data.objects.new('Schattenkoerper', glas.data)
    sc.collection.objects.link(sk)
    sk.visible_camera = sk.visible_diffuse = sk.visible_glossy = sk.visible_transmission = sk.visible_volume_scatter = False
    sk.visible_shadow = True
    bk = bpy.data.collections.new('SchattenWerfer'); sc.collection.children.link(bk); bk.objects.link(sk)
    ld = bpy.data.lights.new('Licht_Boden', 'AREA'); ld.shape = 'SQUARE'; ld.size = SCHATTEN['groesse']; ld.energy = SCHATTEN['energie']; ld.color = (1, 1, 1)
    lo = bpy.data.objects.new('Licht_Boden', ld); sc.collection.objects.link(lo); lo.location = (0, 0, SCHATTEN['hoehe'])
    lo.light_linking.receiver_collection = bc
    lo.light_linking.blocker_collection = bk
    # nicht sichtbar für Kamerastrahlen (Fläche ist weit oben; zur Sicherheit)
    lo.visible_camera = False
    for l in [o for o in O if o.type == 'LIGHT' and o.name != 'Licht_Boden']:
        l.light_linking.blocker_collection = None
    bpy.context.view_layer.update()


SCHATTEN = dict(groesse=45.0, energie=float(os.environ.get('SCHATTEN_E', '6000')), hoehe=float(os.environ.get('SCHATTEN_H', '70')))


def kork_nah_einrichten():
    """Kronkorken im Zoom: geglättete Studio-Spiegelung (oben dunkles Braun, unten helles Gold wie beim alten Modell). Ein Farbverlauf nach der Spiegelrichtung ersetzt die gleichmäßige Weltreflexion,
    die das Metall im Nahbild flach und stumpf aussehen lässt. Die Überblendung (Knoten 'KorkNah') läuft über die Bildnummer, die Frontansicht bleibt unverändert."""
    m = bpy.data.materials['Kronkorken']; nt = m.node_tree; n, l = nt.nodes, nt.links
    out = [x for x in n if x.bl_idname == 'ShaderNodeOutputMaterial'][0]
    alt = out.inputs['Surface'].links[0].from_socket
    geo = n.new('ShaderNodeNewGeometry')
    vt = n.new('ShaderNodeVectorTransform'); vt.vector_type = 'POINT'; vt.convert_from = 'WORLD'; vt.convert_to = 'CAMERA'       # Punkt im Kamerabild: oben/unten bleibt gleich, egal wie die Kamera steht
    l.new(geo.outputs['Position'], vt.inputs[0])
    sep = n.new('ShaderNodeSeparateXYZ'); l.new(vt.outputs[0], sep.inputs[0])
    mitte = n.new('ShaderNodeValue'); mitte.name = 'KorkMitte'
    sub = n.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; l.new(sep.outputs['Y'], sub.inputs[0]); l.new(mitte.outputs[0], sub.inputs[1])    # Abstand von der Kappenmitte (cm, nach oben im Bild)
    nt_ = n.new('ShaderNodeVectorTransform'); nt_.vector_type = 'NORMAL'; nt_.convert_from = 'WORLD'; nt_.convert_to = 'CAMERA'
    l.new(geo.outputs['Normal'], nt_.inputs[0])
    nsep = n.new('ShaderNodeSeparateXYZ'); l.new(nt_.outputs[0], nsep.inputs[0])
    nmul = n.new('ShaderNodeMath'); nmul.operation = 'MULTIPLY'; nmul.inputs[1].default_value = KORK_NAH['normal_cm']; l.new(nsep.outputs['Y'], nmul.inputs[0])   # Flächen, die nach oben im Bild kippen, spiegeln den dunklen Raum (Kappenrand, Falten)
    sub2 = n.new('ShaderNodeMath'); sub2.operation = 'ADD'; l.new(sub.outputs[0], sub2.inputs[0]); l.new(nmul.outputs[0], sub2.inputs[1])
    vorz = KORK_NAH['vorzeichen']
    t = n.new('ShaderNodeMapRange'); t.clamp = True
    t.inputs['From Min'].default_value = -KORK_NAH['breite'] * vorz; t.inputs['From Max'].default_value = KORK_NAH['breite'] * vorz
    t.inputs['To Min'].default_value = 1.0; t.inputs['To Max'].default_value = 0.0                    # 1 = hell (vorn/unten im Bild), 0 = dunkel (hinten/oben)
    l.new(sub2.outputs[0], t.inputs['Value'])
    rp = n.new('ShaderNodeValToRGB')
    for i, (pos, col) in enumerate(KORK_NAH['rampe']):
        if i >= len(rp.color_ramp.elements):
            rp.color_ramp.elements.new(pos)
        rp.color_ramp.elements[i].position = pos; rp.color_ramp.elements[i].color = col
    l.new(t.outputs['Result'], rp.inputs['Fac'])
    em = n.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = KORK_NAH['staerke']; l.new(rp.outputs['Color'], em.inputs['Color'])
    pb = n.new('ShaderNodeBsdfPrincipled'); pb.inputs['Base Color'].default_value = KORK_NAH['basis']
    pb.inputs['Metallic'].default_value = 1.0; pb.inputs['Roughness'].default_value = KORK_NAH['rauheit']
    if os.environ.get('KN_DEBUG'):
        dm = n.new('ShaderNodeMapRange'); dm.inputs['From Min'].default_value = -1; dm.inputs['From Max'].default_value = 1
        l.new({'y': sep.outputs['Y'], 'sub': sub.outputs[0]}[os.environ['KN_DEBUG']], dm.inputs['Value'])
        cb = n.new('ShaderNodeCombineColor'); [l.new(dm.outputs[0], cb.inputs[i]) for i in range(3)]; l.new(cb.outputs[0], em.inputs['Color']); em.inputs['Strength'].default_value = 1.0
    ad = n.new('ShaderNodeAddShader'); l.new(em.outputs[0], ad.inputs[0]); l.new(pb.outputs[0], ad.inputs[1])
    mix = n.new('ShaderNodeMixShader'); mix.name = 'KorkNahMix'
    wert = n.new('ShaderNodeValue'); wert.name = 'KorkNah'; wert.outputs[0].default_value = 0.0
    nz = n.new('ShaderNodeSeparateXYZ'); l.new(geo.outputs['Normal'], nz.inputs[0])
    nr = n.new('ShaderNodeMapRange'); nr.clamp = True; nr.inputs['From Min'].default_value = 0.45; nr.inputs['From Max'].default_value = 0.8; l.new(nz.outputs['Z'], nr.inputs['Value'])     # nur nach oben zeigende Flächen (Deckel) bekommen den Verlauf, der Rock bleibt wie im freigegebenen Bild
    fm = n.new('ShaderNodeMath'); fm.operation = 'MULTIPLY'; l.new(wert.outputs[0], fm.inputs[0]); l.new(nr.outputs['Result'], fm.inputs[1])
    l.new(fm.outputs[0], mix.inputs['Fac']); l.new(alt, mix.inputs[1]); l.new(ad.outputs[0], mix.inputs[2])
    l.new(mix.outputs[0], out.inputs['Surface'])
    return wert, mitte


KORK_NAH = dict(
    vorzeichen=float(os.environ.get('KN_VORZ', '1')), breite=float(os.environ.get('KN_BREITE', '1.4')), staerke=float(os.environ.get('KN_STAERKE', '2.8')),
    rauheit=0.2, basis=(0.25, 0.17, 0.04, 1.0), normal_cm=float(os.environ.get('KN_NORMAL', '3.0')),
    rampe=[(0.0, (0.05, 0.025, 0.005, 1)), (0.35, (0.30, 0.16, 0.025, 1)), (0.6, (0.60, 0.37, 0.06, 1)), (0.85, (0.72, 0.47, 0.10, 1)), (1.0, (0.80, 0.56, 0.14, 1))],
)
KORK_WERT = None


sc = bpy.context.scene
szene_einrichten()
KORK_WERT, KORK_MITTE = kork_nah_einrichten()
_kb = bpy.data.materials['Kronkorken'].node_tree.nodes['KorkBSDF']
if os.environ.get('KORK_FARBE'):
    _kb.inputs['Base Color'].default_value = tuple(float(x) for x in os.environ['KORK_FARBE'].split(',')) + (1.0,)
if os.environ.get('KORK_RAUH'):
    _kb.inputs['Roughness'].default_value = float(os.environ['KORK_RAUH'])
if os.environ.get('KORK_METALL'):
    _kb.inputs['Metallic'].default_value = float(os.environ['KORK_METALL'])
cam = sc.camera
cd = cam.data
cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24.0
cd.dof.use_dof = False
cd.clip_start = 0.05; cd.clip_end = 3000
for c in list(cam.constraints):
    cam.constraints.remove(c)
cam.rotation_mode = 'XYZ'
p = bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type = 'METAL'; p.get_devices()
for d in p.devices:
    d.use = d.type != 'CPU'
sc.cycles.device = 'GPU'; sc.cycles.samples = SAMPLES
sc.cycles.use_animated_seed = False; sc.cycles.seed = 7                 # gleiche Rauschverteilung in jedem Bild → kein Flimmern
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '8'
sc.render.use_border = False
if NAME == 'poster-quer':                                           # nur der Mittelstreifen (Flasche + Schatten), der Rest ist Creme: spart Renderzeit; tools/blender/sequenz_komposit.py setzt ihn auf die volle Fläche
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = 0.40, 0.60, 0.0, 1.0
sc.render.resolution_percentage = 100
bottle = [o for o in bpy.data.objects if o.type == 'MESH' and o.name != 'Boden']
outdir = os.path.join(OUT, 'rgba-' + NAME); os.makedirs(outdir, exist_ok=True)
caps = {}
capfile = os.path.join(OUT, f'kappe-{NAME}.json')
if os.path.exists(capfile):
    caps = json.load(open(capfile))
for f in range(VON, BIS + 1):
    ps = pose(f)
    w, h = (F['still'] if (F['still'] and f == st[0]['frame']) else (F['w'], F['h']))
    sc.render.resolution_x, sc.render.resolution_y = w, h
    cd.lens = 12.0 / math.tan(math.radians(ps['fov']) / 2)
    cd.shift_x = 0.0; cd.shift_y = -ps['shift']                       # three: positive Verschiebung rückt das Bild nach oben, Blender: nach unten
    cam.location = bl(ps['pos'])
    cam.rotation_euler = (bl(ps['target']) - bl(ps['pos'])).to_track_quat('-Z', 'Y').to_euler()
    for o in bottle:
        o.rotation_euler = (0.0, 0.0, ps['rot'])
    bpy.context.view_layer.update()
    KORK_MITTE.outputs[0].default_value = float((cam.matrix_world.inverted() @ Vector((0, 0, BH * 10))).y)      # Höhe der Kappenmitte im Kamerabild
    KORK_WERT.outputs[0].default_value = float(os.environ['KN_FIX']) if os.environ.get('KN_FIX') else smooth01((f - 4) / 10.0)
    bpy.context.view_layer.update()
    # Mitte der Kronkorken-Oberseite im Bild (0…1 von links/oben) – dort beginnt der Farbwechsel zu Bier (js/sequenz.js)
    sc.render.resolution_x, sc.render.resolution_y = (1600, 800) if not F['portrait'] else (1600, 2580)
    uv = world_to_camera_view(sc, cam, Vector((0, 0, BH * 10)))
    caps[str(f)] = [round(uv.x, 4), round(1 - uv.y, 4)]
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.filepath = os.path.join(outdir, f'{f + 1:03d}.png')
    bpy.ops.render.render(write_still=True)
    json.dump(caps, open(capfile, 'w'))
    print('BILD', NAME, f + 1, w, h, flush=True)
print('FERTIG', NAME, VON, BIS)
