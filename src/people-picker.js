// Selector de personas para los créditos de una recolecta.
// Un selector por rol (colector, asistentes, identifica, describe): se
// escribe un nombre, se elige de la lista o se agrega uno nuevo, y cada
// nombre elegido queda como una etiqueta que se puede quitar.
//
// Por qué no un <datalist>: el del navegador no se puede rediseñar, en
// celular se ve distinto en cada sistema y no sirve para varios nombres.
//
// Este módulo no llama a Supabase ni sabe del resto del formulario:
// recibe la lista de personas y la página le pide los nombres al guardar.
import './css/people-picker.css';
import { setFieldError } from './messages.js';

const MAX_SUGGESTIONS = 8;

// "  S.   Valerio " → "S. Valerio"
export function cleanName(text) {
    return text.replace(/\s+/g, ' ').trim();
}

// Para comparar sin mayúsculas ni tildes: "Mónica" = "monica".
// Importa porque en la base credit_name es único tal como se escribe:
// "s. valerio" y "S. Valerio" serían dos personas distintas.
function fold(text) {
    return cleanName(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// field: el <div class="field"> con su <label> y su <input>.
// people: lista compartida por todos los selectores de la página. Si en
// "Colector" se agrega a alguien nuevo, ya aparece como sugerencia en
// "Identifica" sin tener que escribirlo igual otra vez.
export function createPeoplePicker(field, { people }) {
    const input = field.querySelector('input');
    const label = field.querySelector('label').textContent.trim();
    const listId = `${input.id}-list`;

    // ---- Estructura: etiquetas arriba, campo y lista de sugerencias abajo ----
    const chips = document.createElement('ul');
    chips.className = 'people__chips';
    chips.setAttribute('aria-label', `${label}: personas agregadas`);
    chips.hidden = true;

    const box = document.createElement('div');
    box.className = 'people__box';
    const list = document.createElement('ul');
    list.className = 'people__list';
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', `Sugerencias para ${label}`);
    list.hidden = true;

    input.replaceWith(box);
    box.append(input, list);
    box.before(chips);

    // Patrón "combobox" de ARIA: el lector de pantalla anuncia que hay
    // sugerencias y lee la opción marcada con las flechas.
    Object.assign(input, { autocomplete: 'off', spellcheck: false });
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-expanded', 'false');

    let names = [];    // nombres elegidos, en orden: es el orden del crédito
    let options = [];  // sugerencias que se ven ahora
    let active = -1;   // sugerencia marcada con las flechas (-1: ninguna)

    function findPerson(text) {
        const key = fold(text);
        return people.find((person) => fold(person.credit_name) === key);
    }

    // ---- Etiquetas ----
    function renderChips() {
        chips.replaceChildren(...names.map((name) => {
            const person = findPerson(name);
            const isNew = !person || person.id === undefined;

            const chip = document.createElement('li');
            chip.className = isNew ? 'people__chip people__chip--new' : 'people__chip';

            const text = document.createElement('span');
            text.textContent = name;
            chip.append(text);

            // Una persona nueva se marca distinto: así se nota si fue un error
            // de escritura antes de guardar y crearla en la base.
            if (isNew) {
                const tag = document.createElement('span');
                tag.className = 'people__tag';
                tag.textContent = 'nueva';
                chip.append(tag);
            }

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'people__remove';
            remove.setAttribute('aria-label', `Quitar a ${name} de ${label}`);
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                removeName(name);
                input.focus();
            });
            chip.append(remove);
            return chip;
        }));
        chips.hidden = names.length === 0;
    }

    // Avisa a la página que cambió la lista (lo usará el aviso de cambios
    // sin guardar, elemento 16). Las etiquetas no disparan "input" solas.
    function notify() {
        field.dispatchEvent(new CustomEvent('peoplechange', { bubbles: true, detail: { names: [...names] } }));
    }

    function addName(text) {
        const typed = cleanName(text);
        if (!typed) return;

        // Si ya existe con otras mayúsculas o tildes, se usa el nombre de la
        // base: escribir "s. valerio" agrega a "S. Valerio", no a otra persona.
        const person = findPerson(typed);
        const name = person ? person.credit_name : typed;
        if (!person) people.push({ credit_name: name, full_name: null }); // sin id: aún no está en la base

        if (!names.some((chosen) => fold(chosen) === fold(name))) {
            names.push(name);
            renderChips();
            notify();
        }
        input.value = '';
        setFieldError(input, '');
        close();
    }

    function removeName(name) {
        names = names.filter((chosen) => chosen !== name);
        renderChips();
        notify();
    }

    // ---- Sugerencias ----
    function close() {
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        active = -1;
    }

    function setActive(index) {
        active = index;
        [...list.children].forEach((option, i) => {
            option.classList.toggle('is-active', i === index);
            option.setAttribute('aria-selected', String(i === index));
        });
        if (index >= 0) {
            const option = list.children[index];
            input.setAttribute('aria-activedescendant', option.id);
            option.scrollIntoView({ block: 'nearest' });
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    }

    function open() {
        const query = fold(input.value);
        const taken = new Set(names.map(fold));

        // Primero los que empiezan con lo escrito, después los que lo
        // contienen ("val" encuentra "S. Valerio"). También busca en el
        // nombre completo.
        const matches = people
            .filter((person) => !taken.has(fold(person.credit_name)))
            .map((person) => {
                const credit = fold(person.credit_name);
                const full = person.full_name ? fold(person.full_name) : '';
                const rank = !query || credit.startsWith(query) ? 0
                    : credit.includes(query) || full.includes(query) ? 1 : -1;
                return { person, rank };
            })
            .filter(({ rank }) => rank >= 0)
            .sort((a, b) => a.rank - b.rank || a.person.credit_name.localeCompare(b.person.credit_name, 'es'))
            .slice(0, MAX_SUGGESTIONS);

        options = matches.map(({ person }) => ({ name: person.credit_name, detail: person.full_name, isNew: person.id === undefined }));

        // Si lo escrito no es nadie de la lista, se ofrece al final como
        // persona nueva, para que quede claro que se va a crear.
        const typed = cleanName(input.value);
        if (typed && !findPerson(typed)) options.push({ name: typed, create: true });

        if (!options.length) {
            close();
            return;
        }

        list.replaceChildren(...options.map((item, index) => {
            const option = document.createElement('li');
            option.id = `${listId}-${index}`;
            option.className = item.create ? 'people__option people__option--create' : 'people__option';
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', 'false');

            const main = document.createElement('span');
            main.textContent = item.create ? `Agregar «${item.name}» como persona nueva` : item.name;
            option.append(main);
            if (item.detail || item.isNew) {
                const detail = document.createElement('small');
                detail.textContent = item.detail || 'nueva (se crea al guardar)';
                option.append(detail);
            }

            // pointerdown con preventDefault: el campo no pierde el foco al
            // tocar la opción, así la lista no se cierra antes del clic.
            option.addEventListener('pointerdown', (event) => event.preventDefault());
            option.addEventListener('click', () => addName(item.name));
            return option;
        }));

        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        setActive(-1);
    }

    // ---- Teclado ----
    // Enter sin opción marcada agrega exactamente lo escrito: así Enter
    // nunca cambia "M. Mata" por "M. Matamoros" sin que la persona lo vea.
    input.addEventListener('keydown', (event) => {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (list.hidden) open();
                else setActive(Math.min(active + 1, options.length - 1));
                break;
            case 'ArrowUp':
                event.preventDefault();
                if (!list.hidden) setActive(Math.max(active - 1, -1));
                break;
            case 'Enter':
                event.preventDefault(); // dentro del formulario, Enter lo enviaría
                addName(active >= 0 ? options[active].name : input.value);
                break;
            case 'Escape':
                if (!list.hidden) {
                    event.preventDefault();
                    close();
                }
                break;
            case 'Backspace':
                if (!input.value && names.length) removeName(names.at(-1));
                break;
        }
    });

    input.addEventListener('input', () => {
        setFieldError(input, '');
        open();
    });
    input.addEventListener('focus', open);

    // Al salir con un nombre escrito y sin agregar, no se agrega solo
    // (podría ser un nombre a medias), pero se avisa para que no se pierda.
    input.addEventListener('blur', () => {
        close();
        if (cleanName(input.value)) {
            setFieldError(input, 'Toque un nombre de la lista o pulse Enter para agregarlo.');
        }
    });

    return {
        getNames: () => [...names],
        // Para cargar una recolecta existente (elemento 15). No avisa cambios.
        setNames(list) {
            names = [];
            for (const name of list.map(cleanName)) {
                if (name && !names.some((chosen) => fold(chosen) === fold(name))) names.push(name);
            }
            renderChips();
        },
        hasPendingText: () => cleanName(input.value) !== '',
        input,
    };
}