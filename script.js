const apiKey = "5b3ce3597851110001cf6248"; // <-- deinen ORS Key hier einfügen
let map = L.map("map").setView([51.2277, 6.7735], 13);

// Hintergrundkarte (OpenStreetMap)
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap-Mitwirkende"
}).addTo(map);

let routeLayer;

// Adresse in Koordinaten umwandeln (Geocoding)
async function geocode(address) {
  const url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(address)}&size=1`;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Geocoding fehlgeschlagen");

  const data = await response.json();
  if (data.features.length === 0) throw new Error("Adresse nicht gefunden");

  const coords = data.features[0].geometry.coordinates; // [lng, lat]
  return [coords[1], coords[0]]; // [lat, lng]
}

// Route berechnen und anzeigen
async function route() {
  const startAddr = document.getElementById("start").value;
  const endAddr = document.getElementById("end").value;

  if (!startAddr || !endAddr) {
    alert("Bitte Start- und Zieladresse eingeben.");
    return;
  }

  try {
    const start = await geocode(startAddr);
    const end = await geocode(endAddr);

    const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
    const body = {
      coordinates: [
        [start[1], start[0]],
        [end[1], end[0]]
      ],
      options: {
        avoid_features: ["highways", "motorways"]
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error(`ORS Fehler: ${response.status}`);

    const json = await response.json();

    if (!json.features || json.features.length === 0) {
      throw new Error("Keine Route gefunden");
    }

    if (routeLayer) map.removeLayer(routeLayer);

    routeLayer = L.geoJSON(json, {
      style: { color: "blue", weight: 4 }
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds());

  } catch (err) {
    alert("Route fehlgeschlagen: " + err.message);
    console.error(err);
  }
}
