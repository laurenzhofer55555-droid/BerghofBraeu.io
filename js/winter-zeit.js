// Wintersaison: vom 1. Advent bis einschließlich 6. Januar (Dreikönig). Außerhalb lädt js/main.js nichts davon.
// Test und Vorschau: ?winter=1 erzwingt die Winterausgabe (auch außerhalb der Saison), ?winter=0 schaltet sie ab.
// Besucher können den Schmuck im Fuß aus- und einblenden, das merkt sich der Browser (localStorage, nur lokal).

export function ersterAdvent(jahr) {
  // 4. Advent = letzter Sonntag am oder vor dem 24. Dezember, der 1. Advent liegt 21 Tage davor
  const sonntag = 24 - new Date(jahr, 11, 24).getDay();
  return new Date(jahr, 11, sonntag - 21);
}

export function inSaison(jetzt = new Date()) {
  const jahr = jetzt.getFullYear();
  return jetzt >= ersterAdvent(jahr) || jetzt < new Date(jahr, 0, 7);
}

// saison: Winterausgabe vorgesehen (Schalter im Fuß), an: Schmuck wird gezeigt
export function winterZeit(jetzt = new Date()) {
  let param = '';
  try { param = new URLSearchParams(location.search).get('winter') || ''; } catch (e) { /* keine Adressleiste */ }
  if (param === '0' || param === 'aus') return { saison: false, an: false };
  if (param === '1' || param === 'an') return { saison: true, an: true };
  let aus = false;
  try { aus = localStorage.getItem('berghof-winter') === 'aus'; } catch (e) { /* Speicher gesperrt */ }
  const saison = inSaison(jetzt);
  return { saison, an: saison && !aus };
}
