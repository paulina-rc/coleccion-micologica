// Encabezado común de las páginas con sesión.
//
// Se genera desde aquí y no se copia en cada HTML: así un cambio en el
// menú se hace en un solo archivo y no en doce páginas.
import unedLogo from './img/uned.png';
import ecenLogo from './img/ecen.png';
import cittedLogo from './img/citted.png';
import { signOut } from './auth-guard.js';
import { url, PAGES } from './paths.js';

// Menú principal. Las páginas que todavía no existen se agregan aquí
// cuando se construyan (giras, selecciones, etiquetas…).
const NAV = [
  { id: 'recolectas', label: 'Recolectas', page: PAGES.home },
];

// Iniciales para el círculo del usuario: "Paulina Rojas Carrillo" → "PR".
function initials(name) {
  return (name || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value; // textContent: nunca se interpreta como HTML
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

export function renderHeader(profile, activeId) {
  const brand = el('a', { class: 'brand', href: url(PAGES.home) }, [
    el('img', { src: unedLogo, alt: 'UNED', class: 'brand__uned' }),
    el('img', { src: ecenLogo, alt: 'Escuela de Ciencias Exactas y Naturales', class: 'brand__logo' }),
    el('img', { src: cittedLogo, alt: 'CITTED', class: 'brand__logo' }),
    el('span', { class: 'brand__divider', 'aria-hidden': 'true' }),
    el('span', { class: 'brand__name' }, ['Colección ', el('i', { text: 'Micológica' })]),
  ]);

  const nav = el('nav', { class: 'nav', 'aria-label': 'Principal' },
    NAV.map((item) => el('a', {
      href: url(item.page),
      class: item.id === activeId ? 'nav__link is-active' : 'nav__link',
      ...(item.id === activeId ? { 'aria-current': 'page' } : {}),
      text: item.label,
    })));

  // Menú de la cuenta con <details>: abre y cierra sin JavaScript extra
  // y funciona con teclado.
  const logout = el('button', { type: 'button', class: 'menu__item', text: 'Cerrar sesión' });
  logout.addEventListener('click', signOut);

  const account = el('details', { class: 'account' }, [
    el('summary', { class: 'account__avatar', 'aria-label': 'Mi cuenta', text: initials(profile.full_name) }),
    el('div', { class: 'menu' }, [
      el('p', { class: 'menu__name', text: profile.full_name }),
      el('p', { class: 'menu__role', text: profile.role === 'admin' ? 'Administración' : 'Profesor' }),
      el('a', { class: 'menu__item', href: url(PAGES.changePassword), text: 'Cambiar contraseña' }),
      logout,
    ]),
  ]);

  const header = el('header', { class: 'topbar' }, [
    el('div', { class: 'topbar__inner' }, [brand, nav, account]),
  ]);

  document.body.prepend(header);
}
