// Mensajes de error o aviso dentro de un formulario.
// textContent (no innerHTML): el texto nunca se interpreta como HTML.
export function showMessage(element, text, type = 'error') {
  element.textContent = text;
  element.className = `alert alert--${type}`;
  element.hidden = false;
}

export function hideMessage(element) {
  element.hidden = true;
  element.textContent = '';
}

// Error de un campo: borde rojo y mensaje debajo, dentro de su .field.
// aria-describedby hace que el lector de pantalla lea el mensaje al
// llegar al campo. Con text vacío se quita el error.
export function setFieldError(input, text) {
  const field = input.closest('.field');
  let error = field.querySelector('.field__error');
  if (!error) {
    error = document.createElement('span');
    error.className = 'field__error';
    error.id = `error-${crypto.randomUUID()}`;
    field.append(error);
  }
  error.textContent = text;
  field.classList.toggle('is-invalid', Boolean(text));
  if (text) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', error.id);
  } else {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
}
