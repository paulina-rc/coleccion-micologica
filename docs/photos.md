# Fotografías de las recolectas

Cómo se guardan, se nombran y se borran las fotos. Sirve para mantener el sistema, hacer respaldos y migrar a otro hosting.

## Dónde viven

| Qué                             | Dónde                                       |
| ------------------------------- | ------------------------------------------- |
| El archivo                      | Supabase Storage, bucket `photos`           |
| Tipo, número, ruta y recolecta  | Tabla `photos` de la base                   |
| Crédito de quien tomó las fotos | Tabla `person_specimen`, rol `photographer` |

El bucket lo crea `supabase/02_security.sql`: es público, acepta solo WebP y JPEG y como máximo 2 MB por archivo. Solo el personal con sesión puede subir o borrar.

## Nombres

```
CITTED-0077-k7f3q9/                       carpeta: código + clave del QR
├── CITTED-0077_field_01.webp             foto grande
├── CITTED-0077_field_01_thumb.webp       miniatura
├── CITTED-0077_lab_01.webp
└── CITTED-0077_lab_01_thumb.webp
```

- **Carpeta con la clave del QR:** el bucket es público, así que cualquiera con la dirección ve la foto. Con la clave en la carpeta, la dirección no se adivina solo con el código.
- **Tipos** (enum `photo_kind`): `field` (Campo), `lab` (Laboratorio), `detail` (Detalle).
- **Número:** consecutivo por tipo, con dos dígitos. Si se borra la última foto de un tipo, la siguiente vuelve a usar su número.
- **Miniatura:** mismo nombre con `_thumb` antes de la extensión. Su ruta no se guarda en la base; la calcula `thumbPath()` en `src/api/photos.js`.
- La extensión es `.jpg` solo si el navegador no sabe crear WebP (algunos Safari viejos).

## Compresión

La hace el navegador antes de subir (`src/photos.js`), porque el sistema no tiene servidor propio y las transformaciones de imagen de Supabase son de los planes pagos.

| Archivo     | Lado más largo | Formato | Calidad                                |
| ----------- | -------------- | ------- | -------------------------------------- |
| Foto grande | 1600 px        | WebP    | 0,8 (baja a 0,7 y 0,6 si pasa de 2 MB) |
| Miniatura   | 480 px         | WebP    | 0,8                                    |

- La foto se vuelve a dibujar en un `<canvas>`, así el archivo nuevo **no lleva los metadatos EXIF**, que en un celular incluyen las coordenadas GPS exactas.
- Se respeta la orientación de la cámara (`imageOrientation: 'from-image'`).
- Se rechazan archivos que no son imagen y originales de más de 30 MB.
- Las fotos HEIC de iPhone se convierten solas a JPEG al elegirlas en el iPhone; en Windows, Chrome no las puede abrir.

## Subir y quitar

En `app/recolecta-editar.html?c=CITTED-0077`, sección "Fotografías" (`src/photo-gallery.js`).

- Las fotos se guardan **al subirlas**, sin el botón Guardar. Antes del primer guardado la sección está bloqueada: todavía no hay código ni clave para la carpeta.
- Se suben de una en una. Si una falla, las demás siguen y al final se dice cuáles no subieron y por qué.
- **Subir:** número siguiente → foto grande → miniatura → fila en `photos`. Si algo falla, se borran los archivos que alcanzaron a subir.
- **Quitar:** primero la fila y después los dos archivos. Si se corta la conexión en medio, queda un archivo suelto (solo ocupa espacio), nunca una fila que apunta a una foto que no existe.
- El crédito de "Fotografía" sí se guarda con el botón Guardar, como los demás créditos.

## Caché

Las fotos se piden con `?v=<id de la fila>` al final de la dirección (`photoUrls()`). Cuando un número se vuelve a usar, el id es otro, así que el navegador no muestra la foto vieja. Por eso se pueden guardar en caché un año.

## Límites conocidos

- Si dos personas suben al mismo tiempo una foto del mismo tipo a la misma recolecta, a una le falla la subida y tiene que intentar de nuevo. Nunca se reemplaza la foto de la otra.
- Si una foto se quitó pero sus archivos no se borraron (conexión cortada), ese número queda ocupado en Storage y la siguiente subida de ese tipo falla. Se arregla borrando el archivo suelto en Supabase → Storage → `photos`.
- No hay leyenda por foto ni se pueden reordenar. La tabla ya tiene `caption` y `author_person_id` para hacerlo después.
- 1 GB de fotos en el plan gratuito. Si cada foto con su miniatura pesa unos 400 KB, alcanza para unas 2500 (cálculo aproximado; medir con las primeras fotos reales).

## Respaldo y migración

Las fotos no están en el repositorio. El respaldo semanal descarga el bucket completo con sus carpetas (ver la arquitectura, sección 8). Al migrar, se suben con las mismas rutas: así la tabla `photos` sigue sirviendo sin cambios.
