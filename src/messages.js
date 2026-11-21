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
