const apiKey = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImJkNTQ1MjVjMzYxNDQ3Y2ZhNzVhZWE5NWY5MDZhNDFhIiwiaCI6Im11cm11cjY0In0="; // <-- deinen kompletten ORS-Key einfügen

async function calculateRoute() {
  try {
    // Test: feste Koordinaten für Düsseldorf
    const start = [6.78227, 51.2365]; // lon, lat (Schwerinstraße 5 ca.)
    const end   = [6.7723, 51.2395];  // lon, lat (Kaiserswerther Straße 26 ca.)

    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${start[0]},${start[1]}&end=${end[0]},${end[1]}`;
    console.log("ORS URL:", url);

    const res = await fetch(url);
    const json = await res.json();
    console.log("ORS Antwort:", json);

    if (!json.routes || json.routes.length === 0) {
      alert("Keine Route gefunden.");
      return;
    }

    const coords = json.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.polyline(coords, { color: 'blue', weight: 4 }).addTo(map);
    map.fitBounds(routeLayer.getBounds());

  } catch (err) {
    console.error(err);
    alert("Route fehlgeschlagen: " + err.message);
  }
}
