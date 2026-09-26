// ─────────────────────────────────────────────────────────────
//  ZENTRALE STELLSCHRAUBEN – Kamera, Licht, Material, Effekte
//  Alle Werte hier ändern, der Rest des Codes liest nur aus.
//  Einheiten: 1 Einheit ≈ 10 cm (Flasche ist ca. 2,2 hoch)
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  colors: {
    green: '#038244',      // Etikett-Grün
    cream: '#f4efe4',      // Etikett-Creme
    bgCenter: '#3a2010',   // warmer Lichtfleck hinter der Flasche
    bgEdge: '#070504',     // dunkler Rand
  },

  camera: {
    fov: 30,
    position: [0, 0.1, 6.6],    // Startposition
    target: [0, -0.5, 0],        // Blickpunkt (tiefer = Flasche wirkt höher im Bild)
    portraitDistance: 7.8,       // Abstand auf Hochformat-Screens (Handy)
    parallax: 0.18,              // Maus-Parallaxe (0 = aus)
  },

  bottle: {
    glbUrl: null,            // später z. B. 'assets/models/bottle.glb' → ersetzt die prozedurale Flasche
    idleSpeed: 0.18,         // Idle-Rotation in rad/s
    startRotation: -0.35,    // leicht gedreht, damit das Etikett nicht flach wirkt
  },

  glass: {
    color: '#ffffff',
    roughness: 0.06,
    ior: 1.5,
    thickness: 0.35,
    attenuationColor: '#e0a458', // Braunglas-Tönung
    attenuationDistance: 0.35,   // kleiner = dunkleres Glas
    envMapIntensity: 1.6,
    dropletStrength: 0.55,       // Kondenswasser Normal-Map-Stärke
    dropletCount: 2600,
    edgeDarken: 0.04,            // Helligkeit am Glasrand (echtes Braunglas ist am Rand dunkler)
    edgePower: 4.0,              // Breite des dunklen Randes
  },

  beer: {
    color: '#140802',       // Grundfarbe (fast schwarz, nur Glanz sichtbar)
    core: '#ff8c14',        // Leuchten in der Mitte (Gegenlicht durchs Bier)
    edge: '#2a0e02',        // dunkle Ränder
    glowIntensity: 1.0, 
    falloff: 7.0,           // höher = dunklere, breitere Ränder
    fillHeight: 0.88,       // Füllhöhe relativ zur Flaschenhöhe
  },

  cap: {
    color: '#d7ad4f',
    roughness: 0.26,
    metalness: 1.0,
  },

  lights: {
    ambient: 0.12,
    key:  { color: '#fff1dc', intensity: 2.6, position: [-3.5, 5, 4] },     // Studiolicht schräg oben
    rimL: { color: '#ffb466', intensity: 14, position: [-2.6, 1.6, -3.2] }, // Rimlight links hinten
    rimR: { color: '#ffd29a', intensity: 12, position: [2.8, 2.2, -3.0] },  // Rimlight rechts hinten
    fill: { color: '#ffe3c0', intensity: 0.5, position: [3, -1, 5] },
    envIntensity: 1.0,
  },

  post: {
    exposure: 1.05,
    bloom: { strength: 0.28, radius: 0.5, threshold: 0.95 }, // nur Glanzlichter blühen
    dof: { enabled: true, focus: 6.6, aperture: 0.0009, maxblur: 0.006 }, // sanfte Tiefenunschärfe
    grain: 0.055,      // Filmkorn
    vignette: 0.9,
  },

  perf: {
    maxDprDesktop: 2,
    maxDprMobile: 1.5,
    autoDowngradeFps: 42,  // fällt die FPS darunter → DOF/Bloom aus, DPR runter
  },
};
