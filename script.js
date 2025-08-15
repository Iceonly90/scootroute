const ORS_API_KEY = "5b3ce3597851110001cf6248"; // Dein ORS Key

let map = L.map('map').setView([51.2277, 6.7735], 13); // Düsseldorf Startansicht
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap-Mitwirkende'
}).addTo(map);

let startCoords = null;
let endCoords = null;
let routeLayer = null;

function addAutocomplete(inputId, suggestionsId, callback) {
    const input = document.getElementById(inputId);
    const suggestionsBox = document.getElementById(suggestionsId);

    input.addEventListener("input", async () => {
        const query = input.value.trim();
        if (query.length < 3) {
            suggestionsBox.innerHTML = "";
            return;
        }
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`;
        const res = await fetch(url);
        const data = await res.json();
        suggestionsBox.innerHTML = "";
        data.forEach(item => {
            const div = document.createElement("div");
            div.classList.add("suggestion-item");
            div.textContent = item.display_name;
            div.onclick = () => {
                input.value = item.display_name;
                suggestionsBox.innerHTML = "";
                callback([parseFloat(item.lat), parseFloat(item.lon)]);
            };
            suggestionsBox.appendChild(div);
        });
    });
}

// Autocomplete für Start/Ziel
addAutocomplete("start", "start-suggestions", coords => { startCoords = coords; });
addAutocomplete("end", "end-suggestions", coords => { endCoords = coords; });

// Mein Standort
document.getElementById("myLocation").addEventListener("click", () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            startCoords = [pos.coords.latitude, pos.coords.longitude];
            document.getElementById("start").value = "Mein Standort";
            map.setView(startCoords, 14);
        }, err => {
            alert("Standort nicht verfügbar: " + err.message);
        });
    } else {
        alert("Geolocation wird nicht unterstützt.");
    }
});

// Route berechnen
document.getElementById("routeBtn").addEventListener("click", async () => {
    if (!startCoords || !endCoords) {
        alert("Bitte Start- und Zieladresse auswählen.");
        return;
    }

    const body = {
        coordinates: [
            [startCoords[1], startCoords[0]],
            [endCoords[1], endCoords[0]]
        ],
        profile: "driving-car",
        options: { avoid_features: ["motorway", "ferry"] },
        extra_info: ["waytype", "surface"]
    };

    const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
        method: "POST",
        headers: {
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        alert("Routing fehlgeschlagen: " + res.statusText);
        return;
    }

    const json = await res.json();
    if (!json.features || json.features.length === 0) {
        alert("Keine Route gefunden.");
        return;
    }

    if (routeLayer) {
        map.removeLayer(routeLayer);
    }

    routeLayer = L.geoJSON(json, { style: { color: "blue", weight: 4 } }).addTo(map);
    map.fitBounds(routeLayer.getBounds());
});
