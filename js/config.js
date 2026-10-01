// ─────────────────────────────────────────────────────────────
//  ZENTRALE STELLSCHRAUBEN – Farben, Kamera, Licht, Material
//  Alle Werte hier ändern, der Rest des Codes liest nur aus.
//  Einheiten: 1 Einheit = 10 cm (Flasche 228 mm → 2,28 hoch)
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  colors: {
    background: '#F7F4EC', // Creme – identisch mit CSS, damit Canvas und Seite nahtlos sind
    green: '#1F4D2B',      // Tannengrün (Druck auf dem Kronkorken)
    gold: '#A3AAB1',
  },

  // Achtung: Kamera-Änderungen verschieben die Flasche → Standbilder (assets/img/flasche-berghof-hell*.webp)
  // und ihre Position in index.html/css neu erzeugen, sonst springt die Flasche beim Übergang ins 3D.
  camera: {
    fov: 28,
    position: [0, 0.35, 7.25],  // Startposition
    target: [0, -0.435, 0],      // Blickpunkt (tiefer = Flasche steht höher im Bild)
    portraitDistance: 7.87,      // Abstand auf Hochformat-Screens (Handy)
    portraitTargetY: -0.207,      // Blickpunkt auf dem Handy (höher = Flasche rückt nach unten, näher an den Titel)
    parallax: 0.12,              // Maus-Parallaxe (0 = aus)
  },

  bottle: {
    glbUrl: null,            // später z. B. 'assets/models/bottle.glb' → ersetzt die prozedurale Flasche
    idleSpeed: 0.16,         // Idle-Rotation in rad/s
    startRotation: -0.3,     // leicht gedreht, damit das Etikett plastisch wirkt
  },

  // Bernsteinglas, mit Bier gefüllt (unterer Teil) bzw. leer (Hals über dem Füllstand)
  glass: {
    roughness: 0.04,
    ior: 1.5,
    envMapIntensity: 1.0,
    filled: {
      thickness: 0.36,               // Lichtweg durch Glas + Bier (höher = stärkere Lichtbrechung)
      attenuationColor: '#CC7C2C',   // Bernstein-Tönung
      attenuationDistance: 0.36,     // kleiner = dunkler
    },
    empty: {
      thickness: 0.12,               // nur die beiden Glaswände
      attenuationColor: '#B86E2A',
      attenuationDistance: 0.09,
    },
    edgeDarken: 0.04,        // Helligkeit am Rand (längerer Lichtweg → dunkler)
    edgePower: 3.5,          // Breite des dunklen Randes (höher = schmalerer heller Kern)
    fillLevelMm: 192,        // Füllhöhe in mm über dem Boden (Bier bis in den Hals)
  },

  cap: {
    color: '#C8CCD0',        // Silber
    roughness: 0.3,
    printColor: '#1F4D2B',   // Aufdruck in Tannengrün
  },

  lights: {
    exposure: 1.0,
    envIntensity: 1.0,
    key:  { color: '#fff6e8', intensity: 1.25, position: [-4, 6, 5] },  // Softbox schräg oben links
    fill: { color: '#ffffff', intensity: 0.45, position: [5, 2, 4] },
    ambient: 0.2,
  },

  shadow: {
    size: 2.4,          // Fläche des Kontaktschattens
    height: 0.9,        // wie hoch über dem Boden Teile noch Schatten werfen
    opacity: 0.9,
    blur: 2.6,
    darkness: 2.2,
    color: '#3a2412',   // warmes Dunkelbraun
    tint: '#c8781e',    // Bernstein-Schimmer im weichen Schattenbereich (Licht durchs Glas)
  },

  perf: {
    maxDprDesktop: 2,
    maxDprMobile: 2,
    autoDowngradeFps: 38,  // fällt die FPS darunter → Auflösung runter
  },
};
