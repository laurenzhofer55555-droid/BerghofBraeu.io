import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
out, var = a[0], a[1]
sc = bpy.context.scene
m = bpy.data.materials['Etikett_vorn']
if 'coat' in var:
    for n in m.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeBsdfPrincipled': n.inputs['Coat Weight'].default_value = 0.0
if 'flags' in var:
    w = bpy.data.worlds['Studio'].node_tree
    for n in w.nodes:
        if n.bl_idname == 'ShaderNodeMix': n.inputs['Factor'].default_value = 0.0
        if n.bl_idname == 'ShaderNodeMapRange': n.inputs['To Min'].default_value = 0.0; n.inputs['To Max'].default_value = 0.0
if 'bump' in var:
    for n in m.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeBump': n.inputs['Strength'].default_value = 0.0
if 'rgb' in var:
    sc.cycles.denoising_input_passes = 'RGB'
if 'nodenoise' in var:
    sc.cycles.use_denoising = False
if 'dof' in var:
    sc.camera.data.dof.use_dof = False
sc.render.resolution_x, sc.render.resolution_y = 1000, 2400
sc.render.use_border = True; sc.render.use_crop_to_border = True
sc.render.border_min_x, sc.render.border_max_x = 0.3, 0.7
sc.render.border_min_y, sc.render.border_max_y = 1 - 0.56, 1 - 0.46
p = bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type = 'METAL'; p.get_devices()
for d in p.devices: d.use = d.type != 'CPU'
sc.cycles.device = 'GPU'; sc.cycles.samples = 64
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
