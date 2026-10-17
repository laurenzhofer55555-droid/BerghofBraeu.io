# Baut die komplette Szene im Hintergrund (ohne Blender-Fenster): Blender -b --python bauen_cli.py -- <ausgabe.blend> [klein mittel gross ketten dunst]
import bpy, sys, time
ROOT = '/private/tmp/claude-501/-Users-agnes-Desktop-Berghof-Helle-Hofer-BR-u-Website/260b0afe-2c3a-4561-b31f-331411fbc907/scratchpad/wt-blender'
args = sys.argv[sys.argv.index('--') + 1:]
DETAILS = {}
if len(args) > 1:
    DETAILS = dict(zip(('tropfen_klein', 'tropfen_mittel', 'tropfen_gross', 'blasen_ketten', 'blasen_dunst'), map(int, args[1:6])))
t0 = time.time()
exec(open(ROOT + '/tools/blender/bauen.py').read())
t1 = time.time()
exec(open(ROOT + '/tools/blender/details.py').read())
print('ZEIT bauen', round(t1 - t0, 1), 'details', round(time.time() - t1, 1), result)
bpy.ops.wm.save_as_mainfile(filepath=args[0])
print('GESPEICHERT', args[0])
