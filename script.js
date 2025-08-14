// ========= Konfiguration =========
const ORS_API_KEY = "bd54525c361447cfa75aea95f906a41a"; // <-- HIER deinen echten ORS-Key eintragen
const ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car";
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

// Roller-ETA-Annahme (45 km/h):
const SCOOTER_SPEED_KMH = 45;

// ========= Map Setup =========
let map = L.map('map').setView([51.1657, 10.4515], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let layer = L.layerGroup().addTo(map);
let routeLine = null;
let currentRoute = null;
let currentSteps = [];
let watchId = null;
let lastAnnouncedStep = -1;

const elFrom = document.getElementById('input-from');
const elTo = document.getElementById('input-to');
const btnRoute = document.getElementById('btn-route');
const btnClear = document.getElementById('btn-clear');
const btnMyPos = document.getElementById('btn-mypos');
const suggestFrom = document.getElementById('suggest-from');
const suggestTo = document.getElementById('suggest-to');
const info = document.getElementById('info');

btnRoute.addEventListener('click', onRoute);
btnClear.addEventListener('click', clearAll);
btnMyPos.addEventListener('click', useMyPosition);

// ========= Autocomplete (Nominatim) =========
let debounceFrom = null, debounceTo = null;
elFrom.addEventListener('input', () => {
  clearTimeout(debounceFrom);
  debounceFrom = setTimeout(() => autocomplete(elFrom.value, 'from'), 300);
});
elTo.addEventListener('input', () => {
  clearTimeout(debounceTo);
  debounceTo = setTimeout(() => autocomplete(elTo.value, 'to'), 300);
});

async function autocomplete(text, which){
  const box = which === 'from' ? suggestFrom : suggestTo;
  box.innerHTML = '';
  if(!text || text.length < 2){ box.classList.add('hidden'); return; }
  try{
    const url = `${NOMINATIM_SEARCH}?format=json&q=${encodeURIComponent(text)}&addressdetails=1&limit=6&countrycodes=de`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'de' }});
    const data = await res.json();
    if(!Array.isArray(data) || data.length === 0){ box.classList.add('hidden'); return; }
    data.forEach(item => {
      const div = document.createElement('div');
      div.textContent = item.display_name;
      div.dataset.lon = item.lon;
      div.dataset.lat = item.lat;
      div.addEventListener('click', () => {
        if(which === 'from'){
          elFrom.value = item.display_name;
          elFrom.dataset.lon = item.lon;
          elFrom.dataset.lat = item.lat;
          suggestFrom.classList.add('hidden');
        }else{
          elTo.value = item.display_name;
          elTo.dataset.lon = item.lon;
          elTo.dataset.lat = item.lat;
          suggestTo.classList.add('hidden');
        }
      });
      box.appendChild(div);
    });
    box.classList.remove('hidden');
  }catch(err){
    console.error('Autocomplete error', err);
    box.classList.add('hidden');
  }
}

// ========= Mein Standort =========
async function useMyPosition(){
  if(!navigator.geolocation){ alert('Geolocation nicht verfügbar'); return; }
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    try{
      const r = await fetch(`${NOMINATIM_REVERSE}?format=json&lat=${lat}&lon=${lon}&accept-language=de`);
      const j = await r.json();
      const name = j.display_name || `${lat},${lon}`;
      elFrom.value = name;
      elFrom.dataset.lat = lat;
      elFrom.dataset.lon = lon;
      suggestFrom.classList.add('hidden');
    }catch{
      elFrom.value = `${lat},${lon}`;
      elFrom.dataset.lat = lat;
      elFrom.dataset.lon = lon;
    }
  }, err => {
    alert('Standort nicht verfügbar: ' + err.message);
  }, { enableHighAccuracy: true });
}

// ========= Route berechnen =========
async function onRoute(){
  let from, to;
  try{
    from = await ensureCoords(elFrom);
    to   = await ensureCoords(elTo);
  }catch(err){
    alert(err.message || 'Start/Ziel konnte nicht ermittelt werden.');
    return;
  }

  try{
    btnRoute.disabled = true; btnRoute.textContent = 'Berechne…';
    showMarkers(from, to);
    await fetchRoute(from, to);
    startWatchPosition();
  }catch(err){
    console.error(err);
    alert(cleanErr(err));
  }finally{
    btnRoute.disabled = false; btnRoute.textContent = 'Route berechnen';
  }
}

async function ensureCoords(inputEl){
  if(inputEl.dataset.lon && inputEl.dataset.lat){
    return [parseFloat(inputEl.dataset.lon), parseFloat(inputEl.dataset.lat)]; // [lon, lat]
  }
  const text = (inputEl.value || '').trim();
  if(!text) throw new Error('Bitte Adresse eingeben.');
  const geo = await geocode(text);
  return [geo[0], geo[1]];
}

async function geocode(q){
  const url = `${NOMINATIM_SEARCH}?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=de`;
  const r = await fetch(url, { headers: { 'Accept-Language': 'de' }});
  if(!r.ok) throw new Error('Geocoding fehlgeschlagen.');
  const j = await r.json();
  if(!j[0]) throw new Error('Adresse nicht gefunden.');
  return [parseFloat(j[0].lon), parseFloat(j[0].lat)];
}

function showMarkers(from, to){
  layer.clearLayers();
  L.marker([from[1], from[0]]).addTo(layer).bindPopup('Start').openPopup();
  L.marker([to[1], to[0]]).addTo(layer).bindPopup('Ziel');
  map.fitBounds(L.latLngBounds([[from[1],from[0]], [to[1],to[0]]]).pad(0.4));
}

// ========= ORS Fetch (mit Filtern für Roller) =========
async function fetchRoute(from, to){
  const body = {
    coordinates: [from, to],           // [ [lon,lat], [lon,lat] ]
    instructions: true,
    language: "de",
    preference: "fastest",
    // harte Ausschlüsse:
    options: {
      avoid_features: [
        "highways",     // Autobahn
        "motorroad",    // Kraftfahrstraße
        "ferry",
        "tollways",
        "steps",
        "track",
        "path",
        "footway",
        "cycleway",
        "bridleway"
      ]
    }
  };

  const res = await fetch(ORS_URL, {
    method: 'POST',
    headers: {
      'Authorization': ORS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if(!res.ok){
    throw new Error(`Routing fehlgeschlagen (${res.status}): ${text}`);
  }

  // ORS v2: routes[0]
  let json;
  try{ json = JSON.parse(text); }catch{ throw new Error('Antwort der Routing-API ist ungültig.'); }
  if(!json.routes || !json.routes[0]) throw new Error('Keine geeignete Roller-Route gefunden.');
  const route = json.routes[0];
  currentRoute = route;

  drawRoute(route);
  prepareSteps(route);
}

// ========= Zeichnen & ETA =========
function drawRoute(route){
  if(routeLine) map.removeLayer(routeLine);
  if(!route.geometry || !route.geometry.coordinates) throw new Error('Route ohne Geometrie.');

  const latlngs = route.geometry.coordinates.map(([lon,lat]) => [lat, lon]);
  routeLine = L.polyline(latlngs, {weight:6, opacity:0.95, color:'#0ea5a4'}).addTo(layer);
  map.fitBounds(routeLine.getBounds().pad(0.2));

  const distMeters = route.summary?.distance ?? 0;
  const durSeconds = route.summary?.duration ?? 0;

  // ORS-ETA (Auto) + Scooter-ETA (45 km/h):
  const km = distMeters / 1000;
  const etaScooterMin = Math.round((km / SCOOTER_SPEED_KMH) * 60); // t = s/v
  const etaORSMin = Math.round(durSeconds / 60);

  info.classList.remove('hidden');
  info.textContent = `~ ${etaScooterMin} min (Roller) • ${etaORSMin} min (Auto-Referenz) — ${km.toFixed(1)} km`;

  speak(`Route berechnet. Entfernung ${km.toFixed(1)} Kilometer. Geschätzte Fahrzeit ${etaScooterMin} Minuten mit dem Roller.`);
}

function prepareSteps(route){
  currentSteps = [];
  try{
    const steps = route.segments?.[0]?.steps || [];
    for(const s of steps){
      currentSteps.push({
        distance: s.distance,
        instruction: s.instruction,
        wayIndex: (s.way_points && s.way_points.length) ? s.way_points[0] : null
      });
    }
  }catch{ currentSteps = []; }
}

function speak(text){
  if(!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ========= Live-Position & Re-Routing =========
function startWatchPosition(){
  if(!('geolocation' in navigator)) return;
  if(watchId) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPos, e => console.warn(e), {
    enableHighAccuracy: true, maximumAge: 1000
  });
}

function onPos(p){
  const lat = p.coords.latitude, lon = p.coords.longitude;
  if(!map._me){
    map._me = L.circleMarker([lat,lon], {radius:6, fillColor:'#ff6b6b', color:'#fff', weight:2}).addTo(layer);
  }else{
    map._me.setLatLng([lat,lon]);
  }
  if(!routeLine || !currentRoute) return;

  // Off-Route? (einfacher Abstandstest zur Liniengeometrie)
  const d = minDistanceToPolyline([lat,lon], routeLine.getLatLngs());
  if(d > 40){ // > 40 m vom Track weg
    speak('Route verpasst. Neuberechnung.');
    const from = [lon, lat];
    const to = currentRoute.geometry.coordinates.slice(-1)[0]; // [lon,lat]
    fetchRoute(from, to).catch(err => alert(cleanErr(err)));
  }else{
    maybeAnnounceStep(lat, lon);
  }
}

function minDistanceToPolyline([lat,lon], latlngs){
  let min = Infinity;
  for(const pt of latlngs){
    const dist = haversine(lat, lon, pt.lat, pt.lng);
    if(dist < min) min = dist;
  }
  return min;
}

function haversine(lat1,lon1,lat2,lon2){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function maybeAnnounceStep(lat,lon){
  if(!currentSteps.length || !currentRoute?.geometry?.coordinates?.length) return;
  const coords = currentRoute.geometry.coordinates.map(([x,y]) => [y,x]);
  // grobe Zuordnung des Wegpunkts
  for(let i=0;i<currentSteps.length;i++){
    if(i===lastAnnouncedStep) continue;
    const step = currentSteps[i];
    const idx = Math.min(coords.length-1, Math.max(0, Math.floor(i * coords.length / currentSteps.length)));
    const target = coords[idx];
    const d = haversine(lat, lon, target[0], target[1]);
    if(d < 60){
      if(step.instruction) speak(step.instruction);
      lastAnnouncedStep = i;
      break;
    }
  }
}

// ========= Utilities =========
function cleanErr(err){
  const msg = (err && err.message) ? err.message : String(err);
  if(/NoRoute|No route found/i.test(msg)) return 'Keine geeignete Roller-Route gefunden.';
  if(/limit|quota|rate/i.test(msg)) return 'API-Limit erreicht. Später erneut versuchen.';
  return 'Route fehlgeschlagen: ' + msg;
}

function clearAll(){
  layer.clearLayers();
  if(routeLine) map.removeLayer(routeLine);
  routeLine = null; currentRoute = null; currentSteps = []; lastAnnouncedStep = -1;
  info.classList.add('hidden');
  if(watchId){ navigator.geolocation.clearWatch(watchId); watchId=null; }
  elFrom.value=''; elTo.value='';
  delete elFrom.dataset.lat; delete elFrom.dataset.lon;
  delete elTo.dataset.lat; delete elTo.dataset.lon;
}

// Klick außerhalb schließt Vorschläge
document.addEventListener('click', (e)=>{
  if(!e.target.closest('.input-group')){
    suggestFrom.classList.add('hidden');
    suggestTo.classList.add('hidden');
  }
});
