// Inhalte aus JSON rendern (läuft auch ohne WebGL).
// Neue Standorte / Geschichts-Stationen einfach in /data/*.json ergänzen.

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function loadJSON(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Standorte
const locations = await loadJSON('data/standorte.json');
const list = document.getElementById('locations');
if (list && Array.isArray(locations) && locations.length) {
  list.innerHTML = locations.map((l) => {
    const route = `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${l.strasse}, ${l.ort}`)}`;
    return `<li class="location">
      <h3>${esc(l.name)}</h3>
      ${l.info ? `<p>${esc(l.info)}</p>` : ''}
      <p>${esc(l.strasse)}<br>${esc(l.ort)}</p>
      ${l.ansprechpartner ? `<p>Ansprechpartner: ${esc(l.ansprechpartner)}</p>` : ''}
      ${l.zeiten ? `<p>${esc(l.zeiten)}</p>` : ''}
      ${l.telefon ? `<p><a href="tel:${esc(l.telefon.replace(/\s/g, ''))}">${esc(l.telefon)}</a></p>` : ''}
      ${l.email ? `<p><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></p>` : ''}
      <a class="route" href="${route}" target="_blank" rel="noopener">Auf Karte zeigen ↗</a>
    </li>`;
  }).join('');
}

// Geschichte: nur fertige Einträge (ohne "entwurf": true) anzeigen
const history = await loadJSON('data/geschichte.json');
const tl = document.getElementById('timeline');
const done = Array.isArray(history) ? history.filter((h) => !h.entwurf && h.jahr) : [];
if (tl && done.length) {
  tl.innerHTML = done.map((h) => `<li>
    <span class="year">${esc(h.jahr)}</span>
    <h3>${esc(h.titel)}</h3>
    <p>${esc(h.text)}</p>
  </li>`).join('');
  tl.hidden = false;
}

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
