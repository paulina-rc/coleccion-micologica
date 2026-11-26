// Galería de fotos de una recolecta: subir, ver y quitar.
//
// A diferencia del resto del formulario, las fotos se guardan al subirlas,
// sin el botón Guardar: un archivo no cabe en save_specimen (que recibe
// texto) y así una foto ya subida no se pierde si falla otro dato.
//
// Este módulo no sabe del resto del formulario. La página lo crea una
// vez y llama a load(code) cuando la recolecta ya tiene código: al abrir
// ?c=CITTED-0077 o después del primer guardado.
import './css/photos.css';
import { compressPhoto, PhotoError } from './photos.js';
import { PHOTO_KINDS, listPhotos, uploadPhoto, deletePhoto, photoUrls } from './api/photos.js';
import { showMessage, hideMessage } from './messages.js';

// section: la <section id="fotos"> de recolecta-editar.html.
export function createPhotoGallery(section) {
  const locked = section.querySelector('[data-photos-locked]');
  const panel = section.querySelector('[data-photos]');
  const kindSelect = section.querySelector('[data-photo-kind]');
  const input = section.querySelector('[data-photo-input]');
  const pickButton = input.closest('label');
  const status = section.querySelector('[data-photos-status]');
  const message = section.querySelector('[data-photos-message]');
  const groups = section.querySelector('[data-photos-groups]');

  // Lo que devuelve listPhotos(): código, id, carpeta y fotos.
  let specimen = null;
  let busy = false;

  function setBusy(value) {
    busy = value;
    input.disabled = value;
    kindSelect.disabled = value;
    pickButton.classList.toggle('is-busy', value);
    groups.setAttribute('aria-busy', String(value));
  }

  // ---- Dibujar la galería ----
  // Con createElement y textContent (no innerHTML), igual que en el resto
  // del sistema: ningún texto se interpreta como HTML.
  function photoLabel(photo) {
    return `${PHOTO_KINDS[photo.kind]} ${String(photo.position).padStart(2, '0')}`;
  }

  function renderPhoto(photo) {
    const { full, thumb } = photoUrls(photo);
    const label = photoLabel(photo);

    const img = Object.assign(document.createElement('img'), {
      className: 'photo__img',
      src: thumb,
      alt: `Fotografía ${label} de ${specimen.code}`,
      loading: 'lazy',
      width: 480,
      height: 480,
    });
    // La foto grande se abre aparte: no se descarga hasta que se pide.
    const link = Object.assign(document.createElement('a'), {
      className: 'photo__link',
      href: full,
      target: '_blank',
      rel: 'noopener',
    });
    link.append(img);

    const name = Object.assign(document.createElement('span'), {
      className: 'photo__name',
      textContent: label,
    });
    const remove = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'photo__delete',
      textContent: 'Quitar',
    });
    remove.setAttribute('aria-label', `Quitar la foto ${label}`);
    remove.addEventListener('click', () => removePhoto(photo, remove));

    const foot = Object.assign(document.createElement('div'), { className: 'photo__foot' });
    foot.append(name, remove);

    const item = Object.assign(document.createElement('li'), { className: 'photo' });
    item.append(link, foot);
    return item;
  }

  function render() {
    groups.replaceChildren();

    if (!specimen.photos.length) {
      groups.append(
        Object.assign(document.createElement('p'), {
          className: 'photos__empty',
          textContent: 'Esta recolecta todavía no tiene fotografías.',
        })
      );
      return;
    }

    // Un grupo por tipo, en el orden de PHOTO_KINDS; los vacíos no se muestran.
    for (const [kind, kindName] of Object.entries(PHOTO_KINDS)) {
      const photos = specimen.photos.filter((photo) => photo.kind === kind);
      if (!photos.length) continue;

      const title = Object.assign(document.createElement('h3'), {
        className: 'photos__group-title',
        textContent: `${kindName} (${photos.length})`,
      });
      const list = Object.assign(document.createElement('ul'), { className: 'photos__grid' });
      list.append(...photos.map(renderPhoto));

      const group = Object.assign(document.createElement('div'), { className: 'photos__group' });
      group.append(title, list);
      groups.append(group);
    }
  }

  // ---- Subir ----
  // De una en una, no todas a la vez: con señal débil en campo, varias
  // subidas juntas se estorban y fallan todas.
  async function uploadFiles(files) {
    hideMessage(message);
    setBusy(true);
    const kind = kindSelect.value;
    const failed = [];

    for (const [index, file] of files.entries()) {
      status.textContent =
        files.length > 1
          ? `Subiendo foto ${index + 1} de ${files.length}…`
          : 'Comprimiendo y subiendo la foto…';
      try {
        const photo = await uploadPhoto(specimen, kind, await compressPhoto(file));
        specimen.photos.push(photo);
        render(); // cada foto aparece apenas sube, no al final de todas
      } catch (error) {
        if (!(error instanceof PhotoError)) console.error(error);
        const reason =
          error instanceof PhotoError ? error.message : 'No se pudo subir. Revise su conexión.';
        failed.push(`${file.name}: ${reason}`);
      }
    }

    status.textContent = '';
    setBusy(false);
    if (failed.length) {
      showMessage(
        message,
        `${failed.length === 1 ? 'Una foto no se subió' : `${failed.length} fotos no se subieron`}. ${failed.join(' · ')}`
      );
    }
  }

  input.addEventListener('change', () => {
    const files = [...input.files];
    // Se vacía para que elegir otra vez la misma foto también dispare "change".
    input.value = '';
    if (files.length) uploadFiles(files);
  });

  // ---- Quitar ----
  async function removePhoto(photo, button) {
    if (busy) return;
    if (!window.confirm(`¿Quitar la foto ${photoLabel(photo)}? No se puede deshacer.`)) return;

    hideMessage(message);
    button.disabled = true;
    try {
      await deletePhoto(photo);
      specimen.photos = specimen.photos.filter((item) => item.id !== photo.id);
      render();
    } catch (error) {
      console.error(error);
      button.disabled = false;
      showMessage(message, 'No se pudo quitar la foto. Revise su conexión e intente de nuevo.');
    }
  }

  // Salir de la página a media subida dejaría fotos sin subir sin avisar.
  window.addEventListener('beforeunload', (event) => {
    if (busy) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // ---- Cargar ----
  async function load(code) {
    locked.hidden = true;
    panel.hidden = false;
    hideMessage(message);
    setBusy(true);
    status.textContent = 'Cargando fotografías…';
    try {
      specimen = await listPhotos(code);
      if (specimen) {
        render();
        setBusy(false);
      } else {
        showMessage(message, `No se encontró la recolecta ${code}.`);
      }
    } catch (error) {
      console.error(error);
      showMessage(
        message,
        'No se pudieron cargar las fotografías. Revise su conexión y recargue la página.'
      );
    } finally {
      status.textContent = '';
    }
  }

  return { load };
}
