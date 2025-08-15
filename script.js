// === API Key ===
const ORS_API_KEY = "5b3ce3597851110001cf6248";

// === Karte initialisieren ===
const map = L.map('map').setView([51.2277, 6.7735], 13); // Düsseldorf

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let startMarker, endMarker, routeLayer;

// === HTML-Elemente dynamisch erstellen ===
const controls = document.createElement('div');
controls.style.position = 'absolute';
controls.style.top = '10px';
controls.style.left = '50%';
controls.style.transform = 'translateX(-50%)';
controls.style.backgroundColor = 'white';
controls.style.padding = '10px';
controls.style.borderRadius = '8px';
controls.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
controls.style.zIndex = 1000;
controls.innerHTML = `
  <input id="start" type="text" placeholder="Start" style="width:200px; margin:3px;">
  <input id="end" type="text" placeholder="Ziel" style="width:200px; margin:3px;">
  <button id="locateBtn">Mein Standort</button>
  <button id="routeBtn">Route berechnen</button>
`;
document.body.appendChild(controls);

// === Autocomplete Funktion ===
async function autocomplete(inputId) {
    const input = document.getElementById(inputId);
    input.addEventListener("input", async () => {
        const query = input.value;
        if (query.length < 3) return;

        const url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${ORS_API_KEY}&text=${encodeURIComponent(query)}&boundary.country=DE`;
        const res = await fetch(url);
        const data = await res.json();

        // Vorschläge anzeigen (einfach in Konsole oder später als Dropdown)
        console.log("Vorschläge für", inputId, data.features.map(f => f.properties.label));
    });
}
autocomplete("start");
autocomplete("end");

// === Standort holen ===
document.getElementById("locateBtn").addEventListener("click", () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            document.getElementById("start").value = `${lat},${lon}`;
            if (startMarker) map.removeLayer(startMarker);
            startMarker = L.marker([lat, lon]).addTo(map).bindPopup("Mein Standort").openPopup();
            map.setView([lat, lon], 14);
        }, () => alert("Standort nicht verfügbar"));
    } else {
        alert("Geolocation wird nicht unterstützt");
    }
});

// === Route berechnen ===
document.getElementById("routeBtn").addEventListener("click", async () => {
    const startVal = document.getElementById("start").value;
    const endVal = document.getElementById("end").value;
    if (!startVal || !endVal) {
        alert("Bitte Start- und Zieladresse eingeben");
        return;
    }

    const startCoords = await geocode(startVal);
    const endCoords = await geocode(endVal);
    if (!startCoords || !endCoords) {
        alert("Start oder Ziel konnte nicht gefunden werden");
        return;
    }

    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_API_KEY}`;
    const body = {
        coordinates: [
            [startCoords[1], startCoords[0]],
            [endCoords[1], endCoords[0]]
        ],
        options: { avoid_features: ["motorway"] }
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!data.routes || !data.routes[0] || !data.routes[0].geometry) {
        alert("Route fehlgeschlagen");
        return;
    }

    const coords = L.Polyline.fromEncoded(data.routes[0].geometry).getLatLngs();
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.polyline(coords, { color: "blue" }).addTo(map);
    map.fitBounds(routeLayer.getBounds());
});

// === Geocoding Helper ===
async function geocode(query) {
    if (query.includes(",")) {
        const parts = query.split(",");
        return [parseFloat(parts[0]), parseFloat(parts[1])];
    }
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.features && data.features.length > 0) {
        return [data.features[0].geometry.coordinates[1], data.features[0].geometry.coordinates[0]];
    }
    return null;
}
