
// ScootRoute Demo (ORS) - minimal PWA-style web demo
// IMPORTANT: This demo includes your ORS key embedded for convenience.
// Later: move the key to server-side or Vercel env var for security.

const ORS_API_KEY = "5b3ce3597851110001cf6248"; // <-- dein ORS-Key (eingebettet)
const ORS_GEOCODE = "https://api.openrouteservice.org/geocode/search";
const ORS_DIRECTIONS = "https://api.openrouteservice.org/v2/directions/driving-car";

let map = L.map('map').setView([51.1657,10.4515],6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19, attribution:'&copy; OpenStreetMap contributors'
}).addTo(map);

let routeLayer = L.layerGroup().addTo(map);
let fromMarker, toMarker, routeLine;
let watchId = null;
let currentRoute = null;
let currentSteps = [];

// DOM
const inputFrom = document.getElementById('input-from');
const inputTo = document.getElementById('input-to');
const btnRoute = document.getElementById('btn-route');
const btnClear = document.getElementById('btn-clear');
const info = document.getElementById('info');

btnRoute.addEventListener('click', onRoute);
btnClear.addEventListener('click', clearAll);

// helper: geocode via ORS
async function geocode(text){
  const url = ORS_GEOCODE + '?api_key=' + ORS_API_KEY + '&text=' + encodeURIComponent(text) + '&size=1&boundary.country=DEU';
  const r = await fetch(url);
  if(!r.ok) throw new Error('Geocoding failed');
  const j = await r.json();
  if(!j.features || j.features.length===0) throw new Error('Ort nicht gefunden');
  const c = j.features[0].geometry.coordinates; // [lon,lat]
  return c;
}

async function onRoute(){
  const a = inputFrom.value.trim();
  const b = inputTo.value.trim();
  if(!a || !b){ alert('Bitte Start und Ziel eingeben'); return; }
  try{
    btnRoute.disabled = true; btnRoute.textContent = 'Berechne…';
    const from = await geocode(a);
    const to = await geocode(b);
    showMarkers(from, to);
    await fetchRoute(from, to);
    btnRoute.disabled = false; btnRoute.textContent = 'Route berechnen';
    startWatchPosition();
  }catch(e){
    alert(e.message || 'Fehler'); btnRoute.disabled=false; btnRoute.textContent='Route berechnen';
    console.error(e);
  }
}

function showMarkers(from, to){
  routeLayer.clearLayers();
  if(fromMarker) map.removeLayer(fromMarker);
  if(toMarker) map.removeLayer(toMarker);
  fromMarker = L.marker([from[1], from[0]]).addTo(routeLayer).bindPopup('Start').openPopup();
  toMarker = L.marker([to[1], to[0]]).addTo(routeLayer).bindPopup('Ziel');
  map.fitBounds(L.latLngBounds([[from[1],from[0]],[to[1],to[0]]]).pad(0.4));
}

async function fetchRoute(from, to){
  // Request body with avoidance of highways/motorways where possible
  const body = {
    coordinates: [[from[0],from[1]],[to[0],to[1]]],
    instructions: true,
    language: "de",
    optimize_waypoints: false,
    preference: "fastest",
    // Options: avoid highways if supported by ORS
    options: {avoid_features:["highways","ferries","tollways"]}
  };
  const res = await fetch(ORS_DIRECTIONS, {
    method: 'POST',
    headers: {'Content-Type':'application/json','Authorization':ORS_API_KEY},
    body: JSON.stringify(body)
  });
  if(!res.ok){ const txt = await res.text(); throw new Error('Routing Fehler: '+txt); }
  const j = await res.json();
  if(!j.routes || j.routes.length===0) throw new Error('Keine Route');
  currentRoute = j.routes[0];
  drawRoute(currentRoute);
  prepareSteps(currentRoute);
}

function drawRoute(route){
  if(routeLine) map.removeLayer(routeLine);
  const coords = route.geometry.coordinates.map(c=>[c[1],c[0]]);
  routeLine = L.polyline(coords, {color:'#0ea5a4',weight:6,opacity:0.9}).addTo(routeLayer);
  map.fitBounds(routeLine.getBounds().pad(0.2));
  // show summary
  const mins = Math.round(route.summary.duration/60);
  const km = (route.summary.distance/1000).toFixed(1);
  info.classList.remove('hidden');
  info.textContent = `~ ${mins} min — ${km} km`;
}

function prepareSteps(route){
  currentSteps = [];
  // ORS returns segments[0].steps array with 'instruction' and 'distance'
  try{
    const steps = route.segments[0].steps;
    for(const s of steps){
      currentSteps.push({distance:s.distance, instruction:s.instruction, location:s.way_points && s.way_points.length? s.way_points[0]:null});
    }
  }catch(e){
    currentSteps = [];
  }
  // initial speak
  if(currentSteps.length){
    speak(`Route berechnet. Entfernung ${(route.summary.distance/1000).toFixed(1)} Kilometer. Geschätzte Fahrzeit ${Math.round(route.summary.duration/60)} Minuten.`);
  }
}

// simple TTS
function speak(text){
  if(!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE'; u.rate = 1; u.pitch = 1;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

// watch position and detect off-route (approx)
function startWatchPosition(){
  if(!('geolocation' in navigator)){ console.warn('No geolocation'); return; }
  if(watchId) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPos, onPosErr, {enableHighAccuracy:true,maximumAge:1000});
}

function onPosErr(e){ console.warn('Geolocation error', e); }

function onPos(p){
  const lat = p.coords.latitude, lon = p.coords.longitude;
  // show current pos marker
  if(!map._currentPosMarker){
    map._currentPosMarker = L.circleMarker([lat,lon],{radius:6,fillColor:'#ff6b6b',color:'#fff',weight:2}).addTo(routeLayer);
  }else{
    map._currentPosMarker.setLatLng([lat,lon]);
  }
  // check off-route distance to routeLine
  if(routeLine){
    let minDist = Infinity;
    const latlngs = routeLine.getLatLngs();
    for(const pt of latlngs){
      const d = haversine(pt.lat, pt.lng, lat, lon);
      if(d < minDist) minDist = d;
    }
    if(minDist > 40){ // off-route threshold 40m
      speak('Route verpasst. Neuberechnung.');
      const from = [lon, lat];
      const toCoords = currentRoute.geometry.coordinates.slice(-1)[0]; // lon,lat
      fetchRoute(from, toCoords);
    }else{
      checkNextStepProximity(lat,lon);
    }
  }
}

let lastAnnouncedStep = -1;
function checkNextStepProximity(lat,lon){
  if(!currentSteps || currentSteps.length===0) return;
  for(let i=0;i<currentSteps.length;i++){
    if(i===lastAnnouncedStep) continue;
    const step = currentSteps[i];
    if(!step.location) continue;
    const routeCoords = currentRoute.geometry.coordinates.map(c=>[c[1],c[0]]);
    const target = routeCoords[Math.min(routeCoords.length-1, Math.max(0, Math.floor(i * routeCoords.length / currentSteps.length)))];
    const d = haversine(target[0], target[1], lat, lon);
    if(d < 60){ // within 60m announce
      speak(step.instruction);
      lastAnnouncedStep = i;
      break;
    }
  }
}

// haversine in meters
function haversine(lat1,lon1,lat2,lon2){
  const R = 6371000;
  const toRad = x=> x * Math.PI/180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)*Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function clearAll(){
  routeLayer.clearLayers();
  if(routeLine) map.removeLayer(routeLine);
  routeLine = null; currentRoute = null; currentSteps = []; lastAnnouncedStep = -1;
  info.classList.add('hidden');
  if(watchId){ navigator.geolocation.clearWatch(watchId); watchId=null; }
  inputFrom.value=''; inputTo.value='';
}

window.addEventListener('load', ()=>{
  if('permissions' in navigator){
    try{ navigator.permissions.query({name:'geolocation'}).then(()=>{}); }catch(e){};
  }
});
