# Páginas y rutas del sistema

Lista de todas las páginas, su dirección y para qué sirve cada una.
Se actualiza cada vez que se agrega o cambia una página.

## Direcciones base

| Entorno   | Dirección base                                       | Cuándo se usa                                                   |
| --------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Local     | `http://localhost:5173/coleccion-micologica/`        | Con `npm run dev`. Muestra la rama en la que se está trabajando |
| Publicado | `https://paulina-rc.github.io/coleccion-micologica/` | GitHub Pages. Solo muestra lo que ya está en `main`             |

Para abrir una página, se une la dirección base con la ruta de la tabla.
Ejemplo: `http://localhost:5173/coleccion-micologica/` + `app/recolecta-editar.html`.

Un cambio que está en una rama (por ejemplo `feat/specimen-form`) solo se ve en local hasta que se une a `main` con un pull request.

## Páginas

| Ruta                                      | Página               | ¿Pide sesión?       | Qué hace                                                                                         | Estado      |
| ----------------------------------------- | -------------------- | ------------------- | ------------------------------------------------------------------------------------------------ | ----------- |
| `/`                                       | Raíz                 | No                  | Redirige a `app/recolectas.html`. No hay página de inicio pública                                | Paso 3      |
| `app/ingresar.html`                       | Iniciar sesión       | No                  | Correo y contraseña. Si se llegó desde otra página, vuelve a ella después de ingresar (`?next=`) | Paso 3      |
| `app/cambiar-contrasena.html`             | Cambiar contraseña   | Sí                  | Obligatoria en el primer ingreso (contraseña temporal). También desde el menú de la cuenta       | Paso 3      |
| `app/recolectas.html`                     | Recolectas           | Sí                  | Página de inicio después de ingresar. Por ahora solo el saludo; el listado llega en el paso 6    | Paso 6      |
| `app/recolecta-editar.html`               | Nueva recolecta      | Sí                  | Formulario para registrar una recolecta. El código CITTED se asigna al guardar                   | Paso 4      |
| `app/recolecta-editar.html?c=CITTED-0077` | Editar recolecta     | Sí                  | El mismo formulario con los datos de esa recolecta. Aquí se suben y se quitan sus fotos          | Pasos 4 y 5 |
| `app/recolecta.html?c=CITTED-0077`        | Detalle              | Sí                  | Todos los datos de una recolecta, sus fotos y su QR                                              | Paso 6      |
| `h/?c=CITTED-0077-k7f3q9`                 | Ficha pública del QR | No                  | Lo que se abre al escanear la etiqueta. Solo recolectas publicadas y sin datos sensibles         | Paso 7      |
| `app/etiquetas.html`                      | Etiquetas            | Sí                  | Imprimir etiquetas con QR en lote                                                                | Paso 8      |
| `app/importar.html`                       | Importar Excel       | Sí (administración) | Cargar recolectas desde el Excel del equipo                                                      | Paso 9      |
| `app/notificaciones.html`                 | Notificaciones       | Sí                  | Avisos cuando otra persona modifica una recolecta propia                                         | Paso 10     |
| `app/selecciones.html`                    | Selecciones          | Sí                  | Crear grupos de recolectas para estudiantes                                                      | Paso 10     |
| `s/?k=xxxxxxxxxx`                         | Selección pública    | No                  | Lista de fichas que comparte un docente                                                          | Paso 10     |

## Parámetros de las direcciones

| Parámetro | Dónde                                             | Ejemplo                                  | Para qué                                                                               |
| --------- | ------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `?c=`     | `app/recolecta-editar.html`, `app/recolecta.html` | `?c=CITTED-0077`                         | Código de la recolecta. Siempre el código, nunca el id interno                         |
| `?c=`     | `h/`                                              | `?c=CITTED-0077-k7f3q9`                  | Código + clave del QR. Es la dirección impresa en la etiqueta: **no se puede cambiar** |
| `?k=`     | `s/`                                              | `?k=xxxxxxxxxx`                          | Clave de una selección                                                                 |
| `?next=`  | `app/ingresar.html`                               | `?next=app/recolecta.html?c=CITTED-0077` | Página a la que se vuelve después de ingresar. Solo acepta páginas de `app/`           |

## Secciones del formulario de recolecta

Se puede saltar directo a una sección agregando `#` y su nombre al final de la dirección:

| Ancla          | Sección                                            |
| -------------- | -------------------------------------------------- |
| `#encabezado`  | Gira, sitio, fecha, horas, localidad y condiciones |
| `#campo`       | Registro de campo                                  |
| `#laboratorio` | Observación en laboratorio                         |
| `#taxonomia`   | Taxonomía e identificación                         |
| `#coleccion`   | Ubicación en la colección del CITTED               |

Ejemplo: `app/recolecta-editar.html#laboratorio`.

## Dónde se definen las rutas en el código

- `src/paths.js`, objeto `PAGES`: las rutas que usa el JavaScript para redirigir. Una página nueva que se abre desde el código se agrega ahí.
- Las direcciones no llevan `/coleccion-micologica/` escrito a mano: se arman con `import.meta.env.BASE_URL`. Al migrar al hosting de la UNED no hay que cambiar ninguna.
- `vite.config.js` publica solo cualquier `.html` nuevo; no hay que registrarlo.
