// ─────────────────────────────────────────────────────────────
//  ZENTRALE STELLSCHRAUBEN – Farben, Kamera, Licht, Material
//  Alle Werte hier ändern, der Rest des Codes liest nur aus.
//  Einheiten: 1 Einheit = 10 cm (Flasche 228 mm → 2,28 hoch)
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  colors: {
    background: '#F7F4EC', // Creme – identisch mit CSS, damit Canvas und Seite nahtlos sind
    green: '#1F4D2B',      // Tannengrün (Druck auf dem Kronkorken)
    gold: '#B8913A',
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
      attenuationColor: '#E0900C',   // Bernstein-Tönung (satter, wie auf dem Produktfoto)
      attenuationDistance: 0.36,     // kleiner = dunkler
    },
    empty: {
      thickness: 0.12,               // nur die beiden Glaswände
      attenuationColor: '#D0820E',
      attenuationDistance: 0.09,
    },
    tint: {                  // Glas oben (Hals) und unten (Boden) dunkler, wie auf dem Produktfoto: Höhen in mm, k = Helligkeit am Ende
      base: { from: 30, to: 6, k: 0.82 },
      neck: { from: 150, to: 196, k: 0.9 },
    },
    edgeDarken: 0.22,        // Helligkeit am Rand (längerer Lichtweg → dunkler)
    edgePower: 4.6,          // Breite des dunklen Randes (höher = schmalerer heller Kern)
    fillLevelMm: 192,        // Füllhöhe in mm über dem Boden (Bier bis in den Hals)
  },

  dew: {                       // Kondenswasser nur beim Rendern (createBottle … dew: true)
    topMm: 214, bottomMm: 6,   // Höhenbereich der Tropfen
    offsetMm: 0.5,             // Abstand der Hülle über Glas/Etikett
    opacity: 0.92,
    sizes: [                   // [Anzahl, Durchmesser min mm, max mm, Wahrscheinlichkeit] (kleine Tropfen häufiger)
      [3800, 0.9, 1.6, 1], [950, 1.5, 2.6, 1], [150, 2.4, 4.0, 1],
    ],
  },

  bubbles: {                   // Kohlensäure im Bier, nur beim Rendern (createBottle … bubbles: true)
    bottomMm: 7, topMm: 188, wallMm: 3.4,        // Höhenbereich, Dicke der Glaswand (Innenradius = Außenradius − wallMm)
    chains: 26, d0: 0.4, d1: 1.1,                 // Ketten: Anzahl, Durchmesser unten/oben in mm
    mist: 380, mistMin: 0.22, mistMax: 0.5,       // feine Bläschen im Bier
    wall: 170, wallMin: 0.28, wallMax: 0.7,       // Bläschen an der Glasinnenwand
    minPx: 1.8, brightness: 2.7,       // brightness: Leuchtkraft (die Bernsteintönung des Glases dämpft sie wieder)
  },

  cap: {
    color: '#C9A24C',        // Gold
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
