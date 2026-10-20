# Rendert die Szene aus flasche.blend im Hintergrund (Metal-GPU). Aufruf:
#   Blender -b flasche.blend --python render_still.py -- <ausgabe.png> [samples] [breite hoehe]
import bpy, sys
args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]; samples = int(args[1]) if len(args) > 1 else 64
sc = bpy.context.scene
if len(args) > 3:
    sc.render.resolution_x, sc.render.resolution_y = int(args[2]), int(args[3])
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type != 'CPU' or False
sc.cycles.device = 'GPU'
sc.cycles.samples = samples
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('FERTIG', out)
