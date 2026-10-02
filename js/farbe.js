// Nur Vorschau (feature/farbvarianten): ?farbe=silber-gruen | silber-navy | silber-navy-grau | gold-navy | mix, optional &navy=tief
const q = new URLSearchParams(location.search), f = q.get('farbe'), n = q.get('navy');
if (f) document.documentElement.dataset.farbe = f;
if (n) document.documentElement.dataset.navy = n;
// Navy-Varianten: Flasche im Zutaten-Abschnitt mit dunkelblauem Etikett (die Intro-Sequenz bleibt in der Vorschau grün)
if (f && f.includes('navy')) {
  const img = document.querySelector('.zf__bild');
  if (img) {
    img.srcset = 'assets/img/flasche-navy-180.webp 180w, assets/img/flasche-navy-360.webp 360w, assets/img/flasche-navy-540.webp 392w';
    img.src = 'assets/img/flasche-navy-360.webp';
  }
}
