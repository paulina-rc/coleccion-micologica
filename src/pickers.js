// Calendario y selector de hora con el estilo del sistema.
// Los de <input type="date"> y "time" los dibuja el sistema operativo y no
// se pueden cambiar con CSS; flatpickr (MIT, versión fija en package.json)
// dibuja los suyos con HTML normal, así que sí aceptan los colores UNED.
//
// El valor que se guarda sigue siendo el formato de la base
// ("2026-10-19", "08:30"); lo que ve la persona es otro campo (altInput)
// con el formato de Costa Rica ("19 oct 2026", "8:30 AM").
import flatpickr from 'flatpickr';
import { Spanish } from 'flatpickr/dist/l10n/es.js';
import 'flatpickr/dist/flatpickr.css';
import './css/pickers.css';

const COMMON = {
  locale: Spanish,
  // El calendario es el mismo en celular y computadora (si no, en celular
  // vuelve a salir el del sistema operativo).
  disableMobile: true,
  altInput: true,
};

// Mismo formato que el resto del sistema ("19 oct 2026", en minúscula);
// el de flatpickr en español escribe "19 Oct 2026".
const dateLabel = new Intl.DateTimeFormat('es-CR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function datePicker(input, options = {}) {
  return flatpickr(input, {
    ...COMMON,
    dateFormat: 'Y-m-d',
    altFormat: 'label',
    // Formato propio solo para lo que ve la persona; el valor que se
    // guarda sigue saliendo de flatpickr ("2026-10-19").
    formatDate: (date, format) =>
      format === 'label' ? dateLabel.format(date) : flatpickr.formatDate(date, format),
    ...options,
  });
}

export function timePicker(input, options = {}) {
  return flatpickr(input, {
    ...COMMON,
    enableTime: true,
    noCalendar: true,
    dateFormat: 'H:i',
    altFormat: 'h:i K',
    time_24hr: false,
    minuteIncrement: 5, // las flechas suben de 5 en 5; el número se puede escribir
    ...options,
  });
}
