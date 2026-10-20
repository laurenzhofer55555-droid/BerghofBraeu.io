# Baut die komplette Szene im Hintergrund (ohne Blender-Fenster): Blender -b --python bauen_cli.py -- <ausgabe.blend> [klein mittel gross ketten dunst]
import bpy, sys, time, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))      # Projektordner
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
