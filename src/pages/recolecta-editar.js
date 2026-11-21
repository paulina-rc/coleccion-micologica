// app/recolecta-editar.html
// Crear una recolecta nueva (sin ?c) o editar una existente (?c=CITTED-0077).
// Cada sección del formulario se agrega en su propio elemento del paso 4.
import { requireSession } from '../auth-guard.js';
import { renderHeader } from '../layout.js';
import { PAGES, url, go, SPECIMEN_CODE } from '../paths.js';

const { profile } = await requireSession();
renderHeader(profile, 'recolectas');

// ---- Modo: nueva o edición ----
// Se usa el código (no el id interno) en la URL, igual que en el resto del sistema.
const params = new URLSearchParams(window.location.search);
const code = params.get('c');

if (code !== null && !SPECIMEN_CODE.test(code)) {
  // Un ?c= mal escrito no abre un formulario vacío que parezca "nueva":
  // vuelve al listado.
  go(PAGES.home);
}

const isEdit = code !== null;

if (isEdit) {
  const title = document.querySelector('#page-title');
  title.replaceChildren('Editar ', Object.assign(document.createElement('i'), { textContent: 'recolecta' }));
  const tag = document.querySelector('#code-tag');
  tag.textContent = code;
  tag.classList.remove('code-tag--pending');
  document.title = `Editar ${code} · Colección Micológica`;
}

document.querySelector('#cancel-link').href = url(PAGES.home);

// ---- Índice de secciones ----
// Marca en el índice la sección que se está viendo. IntersectionObserver
// avisa cuando una tarjeta entra en la franja superior de la pantalla,
// sin calcular posiciones en cada scroll.
const links = new Map(
  [...document.querySelectorAll('.steps__link')].map((link) => [link.hash.slice(1), link]),
);

function markCurrent(id) {
  for (const [sectionId, link] of links) {
    link.classList.toggle('is-current', sectionId === id);
    if (sectionId === id) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  }
}

const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting);
  if (visible.length) markCurrent(visible[0].target.id);
}, { rootMargin: '0px 0px -70% 0px' }); // solo cuenta el 30 % superior de la pantalla

for (const id of links.keys()) {
  const section = document.getElementById(id);
  if (section) observer.observe(section);
}
markCurrent('encabezado');

// ---- Guardar ----
// Por ahora solo evita que el formulario recargue la página.
// El guardado real con save_specimen llega en el elemento 14.
document.querySelector('#specimen-form').addEventListener('submit', (event) => {
  event.preventDefault();
});
