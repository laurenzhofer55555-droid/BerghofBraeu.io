// Nur Vorschau (feature/farbvarianten): ?farbe=silber-gruen | silber-navy | silber-navy-grau | gold-navy | mix, optional &navy=tief
const q = new URLSearchParams(location.search), f = q.get('farbe'), n = q.get('navy');
if (f) document.documentElement.dataset.farbe = f;
if (n) document.documentElement.dataset.navy = n;
