// Karte erst nach Klick laden (Datenschutz: vorher keine Verbindung zu OpenStreetMap)
document.querySelectorAll('[data-map-src]').forEach((button) => {
  button.addEventListener('click', () => {
    const map = button.closest('.map');
    const frame = document.createElement('iframe');
    frame.src = button.dataset.mapSrc;
    frame.title = 'Karte: Berghof Agatharied, Berg 112, Hausham';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer';
    map.replaceChildren(frame);
    map.classList.add('map--loaded');
  });
});
