// === OpenStreetMap + Leaflet Karte ===
const map = L.map('map').setView([51.2277, 6.7735], 13); // Start Düsseldorf

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap-Mitwirkende'
}).addTo(map);

let startMarker, endMarker, routeLayer;

// === Mein Standort ===
document.getElementById('btnMyLocation').addEventListener('click', () => {
    if (!navigator.geolocation) {
        alert("Geolocation wird nicht unterstützt.");
        return;
    }

    navigator.geolocation.getCurrentPosition(pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setStartPoint(lat, lng);
        map.setView([lat, lng], 14);
    }, err => {
        alert("Standort nicht verfügbar: " + err.message);
    });
});

// === Startpunkt setzen ===
function setStartPoint(lat, lng) {
    if (startMarker) {
        startMarker.setLatLng([lat, lng]);
    } else {
        startMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    }
}

// === Zielpunkt setzen ===
function setEndPoint(lat, lng) {
    if (endMarker) {
        endMarker.setLatLng([lat, lng]);
    } else {
        endMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    }
}

// === Route berechnen ===
async function getRoute(startCoords, endCoords) {
    const apiKey = '5b3ce3597851110001cf6248'; // HIER einfügen!
    const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

    const body = {
        coordinates: [
            [startCoords.lng, startCoords.lat],
            [endCoords.lng, endCoords.lat]
        ],
        // Option: keine Autobahnen
        extra_info: [],
        options: {
            avoid_features: ["highways", "tollways", "ferries"]
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': apiKey
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(`API-Fehler: ${response.statusText}`);

        const data = await response.json();

        if (!data.features || data.features.length === 0) throw new Error("Keine Route gefunden.");

        if (routeLayer) map.removeLayer(routeLayer);

        routeLayer = L.geoJSON(data, {
            style: { color: 'blue', weight: 4 }
        }).addTo(map);

        map.fitBounds(routeLayer.getBounds());

    } catch (error) {
        alert("Route fehlgeschlagen: " + error.message);
    }
}

// === Button-Event für Route ===
document.getElementById('btnRoute').addEventListener('click', () => {
    if (!startMarker || !endMarker) {
        alert("Bitte Start- und Zielpunkt setzen.");
        return;
    }
    const startCoords = startMarker.getLatLng();
    const endCoords = endMarker.getLatLng();
    getRoute({ lat: startCoords.lat, lng: startCoords.lng }, { lat: endCoords.lat, lng: endCoords.lng });
});

// === Klick auf Karte ===
map.on('click', e => {
    if (!startMarker) {
        setStartPoint(e.latlng.lat, e.latlng.lng);
    } else if (!endMarker) {
        setEndPoint(e.latlng.lat, e.latlng.lng);
    }
});
