# Rendert nur einen Ausschnitt (Nahaufnahme) im Hintergrund: Blender -b <datei.blend> --python render_crop.py -- <ausgabe.png> [samples] [x0 y0 x1 y1 in Bruchteilen, y von oben]
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
out = a[0]; samples = int(a[1]) if len(a) > 1 else 128
x0, y0, x1, y1 = (map(float, a[2:6]) if len(a) > 5 else (0.25, 0.0, 0.75, 0.26))
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y = 1000, 2400
sc.render.use_border = True; sc.render.use_crop_to_border = True
sc.render.border_min_x, sc.render.border_max_x = x0, x1
sc.render.border_min_y, sc.render.border_max_y = 1 - y1, 1 - y0
p = bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type = 'METAL'; p.get_devices()
for d in p.devices: d.use = d.type != 'CPU'
sc.cycles.device = 'GPU'; sc.cycles.samples = samples
sc.render.filepath = out; bpy.ops.render.render(write_still=True); print('FERTIG', out)
