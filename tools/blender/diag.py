import bpy, sys
args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]; aus = [a for a in args[1].split(',') if a]
sc = bpy.context.scene
for n in aus:
    ob = bpy.data.objects.get(n)
    if ob: ob.hide_render = True
    else: print('KEIN OBJEKT', n)
p = bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type = 'METAL'; p.get_devices()
for d in p.devices: d.use = d.type != 'CPU'
sc.cycles.device = 'GPU'; sc.cycles.samples = 24
sc.render.resolution_x, sc.render.resolution_y = 300, 720
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
