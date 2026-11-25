// Mapa para marcar dónde se encontró el hongo.
// Leaflet (BSD-2, versión fija en package.json) dibuja el mapa y las
// imágenes del mapa (teselas) vienen de OpenStreetMap: gratis, sin clave
// ni tarjeta. Su política pide mostrar la atribución y no hacer
// descargas masivas; un formulario que carga un mapa a la vez la cumple.
//
// Este módulo no sabe nada del formulario: avisa con onPick(lat, lng)
// cuando la persona toca el mapa o arrastra el marcador, y la página
// decide qué hacer con esas coordenadas.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './css/map.css';

// Vista inicial: Región Huetar Norte (donde se hacen las giras).
const START = { center: [10.55, -84.45], zoom: 9 };
// Al marcar un punto, se acerca lo suficiente para ver caminos y ríos.
const POINT_ZOOM = 15;

export function createLocationMap(element, { onPick }) {
  const map = L.map(element, { ...START, scrollWheelZoom: false });
  // scrollWheelZoom: false → al bajar por el formulario con la rueda del
  // mouse, la página baja y el mapa no se acerca por accidente.

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Marcador dibujado con CSS (map.css) en vez de la imagen de Leaflet:
  // la imagen por defecto se pierde al compilar con Vite y así además
  // lleva los colores UNED.
  const icon = L.divIcon({
    className: 'map-pin',
    html: '<span></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 28], // la punta del marcador queda sobre el punto
  });

  let marker = null;

  function place(lat, lng) {
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      marker = L.marker([lat, lng], { icon, draggable: true, keyboard: false }).addTo(map);
      marker.on('dragend', () => {
        const { lat: newLat, lng: newLng } = marker.getLatLng();
        onPick(newLat, newLng);
      });
    }
  }

  map.on('click', (event) => {
    place(event.latlng.lat, event.latlng.lng);
    onPick(event.latlng.lat, event.latlng.lng);
  });

  return {
    // Mueve el marcador sin avisar con onPick (lo llama la página cuando
    // las coordenadas se escriben a mano o vienen del GPS).
    setPoint(lat, lng) {
      place(lat, lng);
      map.setView([lat, lng], Math.max(map.getZoom(), POINT_ZOOM));
    },
    clear() {
      if (marker) marker.remove();
      marker = null;
    },
  };
}
