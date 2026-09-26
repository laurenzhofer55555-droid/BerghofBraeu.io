// Altersabfrage 16+ (nur index.html).
// Das kleine Skript im <head> setzt html.age-gate, solange keine gültige Bestätigung gespeichert ist.
// „Ja“ merkt sich die Bestätigung 30 Tage und blendet das Overlay aus, „Nein“ zeigt einen Hinweis (kein Zugriff).
// `confirmed` ist erfüllt, sobald die Seite freigegeben ist; erst dann startet die Scroll-Sequenz (js/main.js).

const KEY = 'berghof-ab16';
const DAYS = 30;
const root = document.documentElement;
const dialog = document.getElementById('altersabfrage');

export const gated = root.classList.contains('age-gate') && !!dialog;

export const confirmed = new Promise((resolve) => {
  if (!gated) { resolve(); return; }

  // Rest der Seite für Tastatur und Screenreader sperren, solange die Frage offen ist
  const others = [...document.body.children].filter((el) => el !== dialog);
  others.forEach((el) => { el.inert = true; });
  dialog.focus();

  dialog.querySelector('[data-age="ja"]').addEventListener('click', () => {
    try {
      localStorage.setItem(KEY, String(Date.now() + DAYS * 24 * 60 * 60 * 1000));
    } catch (e) { /* Speicher gesperrt: Bestätigung gilt nur für diesen Besuch */ }
    others.forEach((el) => { el.inert = false; });
    root.classList.add('age-leaving');
    const fade = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
    setTimeout(() => root.classList.remove('age-gate', 'age-leaving'), fade);
    resolve();
  });

  dialog.querySelector('[data-age="nein"]').addEventListener('click', () => {
    root.classList.add('age-denied');
    dialog.querySelector('.age__no').focus();
  });
});
