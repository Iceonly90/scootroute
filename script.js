// === API KEYS EINTRAGEN ===
const ORS_API_KEY = "5b3ce3597851110001cf6248"; // dein ORS Key

// === Karte initialisieren ===
const map = L.map("map").setView([51.2277, 6.7735], 13); // Düsseldorf
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);

let startCoords = null;
let zielCoords = null;
let routeLayer = null;

// === Geocoding Funktion ===
async function geocode(query) {
  const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.features && data.features.length > 0) {
    const [lon, lat] = data.features[0].geometry.coordinates;
    return { lat, lon };
  }
  throw new Error("Adresse nicht gefunden: " + query);
}

// === Route berechnen ===
async function calculateRoute() {
  const startInput = document.getElementById("start").value.trim();
  const zielInput = document.getElementById("ziel").value.trim();

  if (!startInput || !zielInput) {
    alert("Bitte Start- und Zieladresse eingeben.");
    return;
  }

  try {
    startCoords = await geocode(startInput);
    zielCoords = await geocode(zielInput);

    const body = {
      coordinates: [
        [startCoords.lon, startCoords.lat],
        [zielCoords.lon, zielCoords.lat]
      ],
      profile: "driving-car",
      format: "geojson",
      options: {
        avoid_features: ["highways", "motorway", "trunk"]
      }
    };

    const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": ORS_API_KEY
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error("Routing fehlgeschlagen: " + res.status);

    const json = await res.json();

    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.geoJSON(json, { style: { color: "blue", weight: 4 } }).addTo(map);
    map.fitBounds(routeLayer.getBounds());

  } catch (err) {
    alert("Route fehlgeschlagen: " + err.message);
  }
}

// === Mein Standort ===
document.getElementById("myloc").addEventListener("click", () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      startCoords = { lat: latitude, lon: longitude };
      document.getElementById("start").value = "Mein Standort";
      L.marker([latitude, longitude]).addTo(map).bindPopup("Mein Standort").openPopup();
    }, err => {
      alert("Standort nicht verfügbar: " + err.message);
    });
  } else {
    alert("Geolocation wird nicht unterstützt.");
  }
});

// === Button-Listener ===
document.getElementById("routeBtn").addEventListener("click", calculateRoute);
