
// ScootRoute Final Demo with ORS and Nominatim autocomplete + "Mein Standort"
const ORS_API_KEY = "bd54525c361447cfa75aea95f906a41a"; // <-- dein ORS-API-Key (place here)
const ORS_DIRECTIONS = "https://api.openrouteservice.org/v2/directions/driving-car";
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

let map = L.map('map').setView([51.1657,10.4515],6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19, attribution:'&copy; OpenStreetMap contributors'
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

let debounceTimerFrom = null;
let debounceTimerTo = null;
elFrom.addEventListener('input', ()=>{ clearTimeout(debounceTimerFrom); debounceTimerFrom = setTimeout(()=>autocomplete(elFrom.value,'from'),300); });
elTo.addEventListener('input', ()=>{ clearTimeout(debounceTimerTo); debounceTimerTo = setTimeout(()=>autocomplete(elTo.value,'to'),300); });

async function autocomplete(text, which){
  const container = which==='from'? suggestFrom : suggestTo;
  container.innerHTML = '';
  if(!text || text.length<2){ container.classList.add('hidden'); return; }
  try{
    const url = NOMINATIM_SEARCH + '?format=json&q=' + encodeURIComponent(text) + '&addressdetails=1&limit=6&countrycodes=de';
    const res = await fetch(url, {headers:{'Accept-Language':'de'}});
    const data = await res.json();
    if(!data || data.length===0){ container.classList.add('hidden'); return; }
    data.forEach(item=>{
      const div = document.createElement('div');
      div.textContent = item.display_name;
      div.dataset.lon = item.lon;
      div.dataset.lat = item.lat;
      div.addEventListener('click', ()=>{
        if(which==='from'){ elFrom.value = item.display_name; elFrom.dataset.lon=item.lon; elFrom.dataset.lat=item.lat; container.classList.add('hidden'); }
        else { elTo.value = item.display_name; elTo.dataset.lon=item.lon; elTo.dataset.lat=item.lat; container.classList.add('hidden'); }
      });
      container.appendChild(div);
    });
    container.classList.remove('hidden');
  }catch(e){
    console.error('Autocomplete error',e);
    container.classList.add('hidden');
  }
}

async function useMyPosition(){
  if(!navigator.geolocation){ alert('Geolocation nicht verfügbar'); return; }
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    try{
      const rev = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lon+'&accept-language=de');
      const j = await rev.json();
      const name = j.display_name || (lat+','+lon);
      elFrom.value = name;
      elFrom.dataset.lat = lat; elFrom.dataset.lon = lon;
      suggestFrom.classList.add('hidden');
    }catch(err){
      elFrom.value = lat+','+lon;
      elFrom.dataset.lat = lat; elFrom.dataset.lon = lon;
    }
  }, (err)=>{ alert('Standort nicht verfügbar: '+err.message); }, {enableHighAccuracy:true});
}

async function onRoute(){
  let fromCoords = null, toCoords = null;
  try{
    if(elFrom.dataset.lon && elFrom.dataset.lat){
      fromCoords = [parseFloat(elFrom.dataset.lon), parseFloat(elFrom.dataset.lat)];
    } else {
      const g = await geocode(elFrom.value);
      fromCoords = [g[0], g[1]];
    }
    if(elTo.dataset.lon && elTo.dataset.lat){
      toCoords = [parseFloat(elTo.dataset.lon), parseFloat(elTo.dataset.lat)];
    } else {
      const g2 = await geocode(elTo.value);
      toCoords = [g2[0], g2[1]];
    }
  }catch(e){
    alert('Geokodierung fehlgeschlagen: ' + e.message);
    return;
  }
  try{
    btnRoute.disabled = true; btnRoute.textContent = 'Berechne…';
    showMarkers(fromCoords, toCoords);
    await fetchRoute(fromCoords, toCoords);
    btnRoute.disabled = false; btnRoute.textContent = 'Route berechnen';
    startWatchPosition();
  }catch(e){
    alert('Route fehlgeschlagen: '+ (e.message || 'Fehler'));
    console.error(e);
    btnRoute.disabled=false; btnRoute.textContent='Route berechnen';
  }
}

function showMarkers(from,to){
  layer.clearLayers();
  L.marker([from[1],from[0]]).addTo(layer).bindPopup('Start').openPopup();
  L.marker([to[1],to[0]]).addTo(layer).bindPopup('Ziel');
  map.fitBounds(L.latLngBounds([ [from[1],from[0]],[to[1],to[0]] ]).pad(0.4));
}

async function geocode(text){
  const url = NOMINATIM_SEARCH + '?format=json&q=' + encodeURIComponent(text) + '&limit=1&countrycodes=de';
  const r = await fetch(url, {headers:{'Accept-Language':'de'}});
  if(!r.ok) throw new Error('Geocode failed');
  const j = await r.json();
  if(!j[0]) throw new Error('Ort nicht gefunden');
  return [parseFloat(j[0].lon), parseFloat(j[0].lat)];
}

async function fetchRoute(from,to){
  const body = {
    coordinates: [from, to],
    instructions: true,
    language: "de",
    preference: "fastest",
    options: {avoid_features:["highways","ferries","tollways"]}
  };
  const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
    method: 'POST',
    headers: {'Content-Type':'application/json','Authorization':ORS_API_KEY},
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error('Routing error: '+t);
  }
  const j = await res.json();
  if(!j.routes || j.routes.length===0) throw new Error('Keine Route');
  currentRoute = j.routes[0];
  drawRoute(currentRoute);
  prepareSteps(currentRoute);
}

function drawRoute(route){
  if(routeLine) map.removeLayer(routeLine);
  const coords = route.geometry.coordinates.map(c=>[c[1],c[0]]);
  routeLine = L.polyline(coords, {color:'#0ea5a4',weight:6,opacity:0.95}).addTo(layer);
  map.fitBounds(routeLine.getBounds().pad(0.2));
  const mins = Math.round(route.summary.duration/60);
  const km = (route.summary.distance/1000).toFixed(1);
  info.classList.remove('hidden');
  info.textContent = `~ ${mins} min — ${km} km`;
}

function prepareSteps(route){
  currentSteps = [];
  try{
    const steps = route.segments[0].steps;
    for(const s of steps){
      currentSteps.push({distance:s.distance, instruction:s.instruction, location:s.way_points && s.way_points.length? s.way_points[0]:null});
    }
  }catch(e){
    currentSteps = [];
  }
  if(currentSteps.length){
    speak(`Route berechnet. Entfernung ${(route.summary.distance/1000).toFixed(1)} Kilometer. Geschätzte Fahrzeit ${Math.round(route.summary.duration/60)} Minuten.`);
  }
}

function speak(text){
  if(!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE'; u.rate = 1; u.pitch = 1;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

function startWatchPosition(){
  if(!('geolocation' in navigator)){ console.warn('No geolocation'); return; }
  if(watchId) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPos, onPosErr, {enableHighAccuracy:true,maximumAge:1000});
}

function onPosErr(e){ console.warn('Geolocation error', e); }

function onPos(p){
  const lat = p.coords.latitude, lon = p.coords.longitude;
  if(!map._currentPosMarker){
    map._currentPosMarker = L.circleMarker([lat,lon],{radius:6,fillColor:'#ff6b6b',color:'#fff',weight:2}).addTo(layer);
  }else{
    map._currentPosMarker.setLatLng([lat,lon]);
  }
  if(routeLine){
    let minDist = Infinity;
    const latlngs = routeLine.getLatLngs();
    for(const pt of latlngs){
      const d = haversine(pt.lat, pt.lng, lat, lon);
      if(d < minDist) minDist = d;
    }
    if(minDist > 40){
      speak('Route verpasst. Neuberechnung.');
      const from = [lon, lat];
      const toCoords = currentRoute.geometry.coordinates.slice(-1)[0];
      fetchRoute(from, toCoords);
    }else{
      checkNextStepProximity(lat,lon);
    }
  }
}

function checkNextStepProximity(lat,lon){
  if(!currentSteps || currentSteps.length===0) return;
  for(let i=0;i<currentSteps.length;i++){
    if(i===lastAnnouncedStep) continue;
    const step = currentSteps[i];
    if(!step.location) continue;
    const routeCoords = currentRoute.geometry.coordinates.map(c=>[c[1],c[0]]);
    const target = routeCoords[Math.min(routeCoords.length-1, Math.max(0, Math.floor(i * routeCoords.length / currentSteps.length)))];
    const d = haversine(target[0], target[1], lat, lon);
    if(d < 60){
      speak(step.instruction);
      lastAnnouncedStep = i;
      break;
    }
  }
}

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
  layer.clearLayers();
  if(routeLine) map.removeLayer(routeLine);
  routeLine = null; currentRoute = null; currentSteps = []; lastAnnouncedStep = -1;
  info.classList.add('hidden');
  if(watchId){ navigator.geolocation.clearWatch(watchId); watchId=null; }
  elFrom.value=''; elTo.value=''; delete elFrom.dataset.lat; delete elFrom.dataset.lon; delete elTo.dataset.lat; delete elTo.dataset.lon;
}

window.addEventListener('load', ()=>{
  // click outside suggestions closes them
  document.addEventListener('click', (e)=>{
    if(!e.target.closest('.input-group')){ suggestFrom.classList.add('hidden'); suggestTo.classList.add('hidden'); }
  });
});
