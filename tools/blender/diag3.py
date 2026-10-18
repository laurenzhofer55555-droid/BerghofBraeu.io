import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
out, var = a[0], a[1]
sc = bpy.context.scene
m = bpy.data.materials['Etikett_vorn']; nt = m.node_tree
if 'emis' in var:
    o = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeOutputMaterial'][0]
    img = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeTexImage'][0]
    e = nt.nodes.new('ShaderNodeEmission'); nt.links.new(img.outputs['Color'], e.inputs['Color']); e.inputs['Strength'].default_value = 0.5
    nt.links.new(e.outputs[0], o.inputs['Surface'])
if 'ior1' in var:
    for n in bpy.data.materials['Wasser'].node_tree.nodes:
        if n.bl_idname == 'ShaderNodeBsdfGlass' and abs(n.inputs['IOR'].default_value - 1.33) < 1e-3: n.inputs['IOR'].default_value = 1.0
if 'bounce' in var:
    sc.cycles.transmission_bounces = 32; sc.cycles.max_bounces = 40; sc.cycles.diffuse_bounces = 8; sc.cycles.transparent_max_bounces = 40
if 'nolights' in var:
    for o in bpy.data.objects:
        if o.type == 'LIGHT': o.hide_render = True
if 'diffuse' in var:
    o = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeOutputMaterial'][0]
    img = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeTexImage'][0]
    df = nt.nodes.new('ShaderNodeBsdfDiffuse'); nt.links.new(img.outputs['Color'], df.inputs['Color']); nt.links.new(df.outputs[0], o.inputs['Surface'])
if 'shellhide' in var:
    bpy.data.objects['Tropfenflaeche'].visible_diffuse = False
if 'light' in var:
    sc.cycles.use_light_tree = False
sc.render.resolution_x, sc.render.resolution_y = 1000, 2400
sc.render.use_border = True; sc.render.use_crop_to_border = True
sc.render.border_min_x, sc.render.border_max_x = 0.3, 0.7
sc.render.border_min_y, sc.render.border_max_y = 1 - 0.56, 1 - 0.46
p = bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type = 'METAL'; p.get_devices()
for d in p.devices: d.use = d.type != 'CPU'
sc.cycles.device = 'GPU'; sc.cycles.samples = 160
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
