const apiKey = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImJkNTQ1MjVjMzYxNDQ3Y2ZhNzVhZWE5NWY5MDZhNDFhIiwiaCI6Im11cm11cjY0In0="; // <-- hier deinen ORS API Key eintragen
let map = L.map('map').setView([51.2277, 6.7735], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let routeLayer;

async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.length === 0) throw new Error("Adresse nicht gefunden: " + address);
  return [parseFloat(data[0].lon), parseFloat(data[0].lat)]; // lon, lat !
}

async function calculateRoute() {
  try {
    const startAddr = document.getElementById("start").value.trim();
    const endAddr = document.getElementById("end").value.trim();

    if (!startAddr || !endAddr) {
      alert("Bitte Start- und Zieladresse eingeben.");
      return;
    }

    const start = await geocode(startAddr);
    const end = await geocode(endAddr);

    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${start[0]},${start[1]}&end=${end[0]},${end[1]}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("ORS Fehler: " + res.status);

    const json = await res.json();

    if (!json.routes || json.routes.length === 0) {
      alert("Keine Route gefunden.");
      return;
    }

    const coords = json.routes[0].geometry.coordinates.map(c => [c[1], c[0]]); // lat, lon für Leaflet

    if (routeLayer) map.removeLayer(routeLayer);

    routeLayer = L.polyline(coords, { color: 'blue', weight: 4 }).addTo(map);
    map.fitBounds(routeLayer.getBounds());

  } catch (err) {
    console.error(err);
    alert("Route fehlgeschlagen: " + err.message);
  }
}
