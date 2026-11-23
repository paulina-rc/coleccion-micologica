// Configuración de Vite: sitio de varias páginas, sin framework.
import { readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

// Carpetas que no tienen páginas del sitio.
const IGNORED = new Set(['node_modules', 'dist', 'public', 'src', 'supabase', 'docs', '.git', '.github']);

// Busca todos los .html del proyecto para que Vite los publique.
// Así una página nueva entra sola en la compilación: si hubiera que
// listarlas a mano y se olvida una, no se publica y da 404.
function findPages(dir) {
  const pages = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED.has(entry.name)) Object.assign(pages, findPages(path));
    } else if (entry.name.endsWith('.html')) {
      // Nombre interno de la entrada: "h/index", "app/ingresar"…
      pages[relative(root, path).replace(/\\/g, '/').replace(/\.html$/, '')] = path;
    }
  }
  return pages;
}

export default defineConfig({
  // Ruta donde vive el sitio. En GitHub Pages es /coleccion-micologica/.
  // Al migrar al hosting de la UNED se compila con BASE_PATH=/ (ver docs/05).
  base: process.env.BASE_PATH ?? '/coleccion-micologica/',
  // Sitio de varias páginas: si una página no existe, el servidor de
  // desarrollo responde 404. Con el valor por defecto ('spa') devolvía
  // index.html, cuya redirección relativa (app/recolectas.html) apuntaba
  // a app/app/recolectas.html, que tampoco existía: se recargaba sin fin.
  appType: 'mpa',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: findPages(root),
    },
  },
});
