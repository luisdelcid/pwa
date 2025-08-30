(function ($) {
  'use strict';

  /**
   * =============================================================
   *  PWA "Todo Terreno PRO" — main.js (versión expandida y documentada)
   * =============================================================
   *
   * Nota del autor: Este archivo es una versión *sin cambios de lógica*,
   * sólo expandida con indentación y ampliamente comentada para facilitar
   * su mantenimiento. No se ha tocado ningún nombre de función, orden de
   * instrucciones, ni valores. Únicamente se añadieron comentarios y saltos
   * de línea/espacios.
   */

  // ---------------------------------------------------------------------------
  // Constantes base de la aplicación
  // ---------------------------------------------------------------------------
  const BRAND = 'Todo Terreno PRO';
  const API_BASE_DEFAULT = 'https://todoterreno.vistapreliminar.com';
  const IDBVER = 7; // Versión del esquema de IndexedDB

  // ---------------------------------------------------------------------------
  // Utilidades: configuración y helpers de URL
  // ---------------------------------------------------------------------------

  /**
   * Obtiene la base de la API desde localStorage o usa la predeterminada.
   */
  function getApiBase() {
    return (localStorage.getItem('apiBase') || '').trim() || API_BASE_DEFAULT;
  }

  /**
   * Elimina cualquier slash final repetido de una URL (normalización).
   */
  function trimSlash(u) {
    if (!u) return '';
    while (u.endsWith('/')) u = u.slice(0, -1);
    return u;
  }

  /**
   * Renderiza migas de pan (breadcrumbs) en #breadcrumbs.
   * @param {Array<{label:string, href?:string, active?:boolean}>} items
   */
  function setBreadcrumbs(items) {
    const $ol = $('#breadcrumbs').empty();

    items.forEach((it) => {
      const $li = $('<li/>').addClass('breadcrumb-item' + (it.active ? ' active' : ''));

      if (it.active) {
        $li.attr('aria-current', 'page').text(it.label);
      } else {
        $li.append($('<a/>').attr('href', it.href || '#/').text(it.label));
      }

      $ol.append($li);
    });
  }

  // ---------------------------------------------------------------------------
  // Router basado en hash: path -> función de renderizado
  // ---------------------------------------------------------------------------
  const views = {
    '/': renderLogin,
    '/routes': renderRoutes,
    '/pdvs': renderPdvs,
    '/form': renderForm,
    '/settings': renderSettings,
    '/pending': renderPending,
    '/synced': renderSynced,
    '/sync': renderSync,
  };

  /**
   * Parsea location.hash para obtener { path, query }.
   */
  function parseHash() {
    const raw = (location.hash || '#/').slice(1);
    const i = raw.indexOf('?');

    const path = i >= 0 ? raw.slice(0, i) : raw;
    const q = i >= 0 ? raw.slice(i + 1) : '';

    const query = {};
    const sp = new URLSearchParams(q);
    sp.forEach((v, k) => (query[k] = v));

    return { path: path || '/', query };
  }

  /**
   * Navega (y renderiza) a la vista correspondiente al hash actual.
   * @param {string} [hash] Si se proporciona, primero actualiza location.hash
   */
  async function navigateTo(hash) {
    if (hash) location.hash = hash;

    const { path, query } = parseHash();
    const view = views[path] || renderNotFound;

    const $c = $('#app-main').html(
      '<div class="text-center py-5">' +
        '<div class="spinner-border spinner-border-sm"></div>' +
        '<div class="mt-2 small text-muted">Cargando…</div>' +
      '</div>'
    );

    try {
      await view($c, query);
    } catch (e) {
      $c.html('<div class="alert alert-danger m-3">Error al renderizar: ' + (e.message || e) + '</div>');
      console.error(e);
    }
  }

  // Re-render cuando cambia el hash
  $(window).on('hashchange', () => navigateTo());

  // ---------------------------------------------------------------------------
  // IndexedDB wrapper mínimo (promisificado)
  // ---------------------------------------------------------------------------
  const idb = (function () {
    const DB = 'tt_pro_bs_db';
    const VER = IDBVER;

    /**
     * Abre/crea la base de datos y define stores/índices en onupgradeneeded.
     */
    function open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open(DB, VER);

        r.onupgradeneeded = () => {
          const db = r.result;

          // Respuestas locales (formularios)
          if (!db.objectStoreNames.contains('responses')) {
            const s = db.createObjectStore('responses', { keyPath: 'localId', autoIncrement: true });
            s.createIndex('by_status', 'status');
            s.createIndex('by_pdv', 'pdvId');
            s.createIndex('by_route', 'routeId');
          }

          // Datos de aplicación (catálogos, PDVs, etc.)
          if (!db.objectStoreNames.contains('appdata')) db.createObjectStore('appdata', { keyPath: 'key' });

          // Cola de sincronización
          if (!db.objectStoreNames.contains('queue')) {
            const q = db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
            q.createIndex('by_status', 'status');
          }
        };

        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }

    /** put(store, obj) -> obj */
    async function put(store, obj) {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(obj);
        tx.oncomplete = () => res(obj);
        tx.onerror = () => rej(tx.error);
      });
    }

    /** add(store, obj) -> key */
    async function add(store, obj) {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        const rr = tx.objectStore(store).add(obj);
        rr.onsuccess = () => res(rr.result);
        rr.onerror = () => rej(rr.error);
      });
    }

    /** get(store, key) -> value|null */
    async function get(store, key) {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readonly');
        const rr = tx.objectStore(store).get(key);
        rr.onsuccess = () => res(rr.result || null);
        rr.onerror = () => rej(rr.error);
      });
    }

    /** all(store) -> Array */
    async function all(store) {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readonly');
        const rr = tx.objectStore(store).getAll();
        rr.onsuccess = () => res(rr.result || []);
        rr.onerror = () => rej(rr.error);
      });
    }

    return { put, add, get, all };
  })();

  // ---------------------------------------------------------------------------
  // Estado global en memoria (no persistente)
  // ---------------------------------------------------------------------------
  const store = {
    catalogs: { version: 1, fields: [] },
    pdvsAll: [],
    online: navigator.onLine,
    counts: { pending: 0, synced: 0 },
  };

  /**
   * Actualiza el chip visual de estado de conexión.
   */
  function setOnlineUI() {
    const $chip = $('#chip-online');
    $chip
      .text(store.online ? 'Online' : 'Offline')
      .removeClass('badge-warning badge-success')
      .addClass(store.online ? 'badge-success' : 'badge-warning');
  }

  // Eventos del navegador para cambios de conectividad
  $(window).on('online', () => {
    store.online = true;
    setOnlineUI();
    tryProcessQueue();
  });

  $(window).on('offline', () => {
    store.online = false;
    setOnlineUI();
  });

  /**
   * Recalcula y muestra contadores de pendientes/sincronizados.
   */
  async function refreshCounts() {
    const allR = await idb.all('responses');
    const pending = allR.filter((x) => x.status !== 'synced').length;
    const synced = allR.filter((x) => x.status === 'synced').length;

    store.counts = { pending, synced };

    $('#chip-pending').text('Pend: ' + pending);
    $('#chip-synced').text('Sync: ' + synced);
  }

    // ---------------------------------------------------------------------------
    // Fetch helpers
    // ---------------------------------------------------------------------------

    /**
     * Descarga catálogos desde API.
     */
    async function fetchCatalogs() {
      const base = trimSlash(getApiBase());
      const jwt = localStorage.getItem('jwt') || '';

      try {
        if (base && jwt) {
          const u = base + '/wp-json/myapp/v1/catalogs';
          const r = await fetch(u, { headers: { Authorization: 'Bearer ' + jwt } });
          if (r.ok) return r.json();
        }
      } catch (e) {}

      return [];
    }

    /**
     * Descarga PDVs desde API.
     */
    async function fetchPdvsAll() {
      const base = trimSlash(getApiBase());
      const jwt = localStorage.getItem('jwt') || '';

      try {
        if (base && jwt) {
          const u = base + '/wp-json/myapp/v1/pdvs_all';
          const r = await fetch(u, { headers: { Authorization: 'Bearer ' + jwt } });
          if (r.ok) return r.json();
        }
      } catch (e) {}

      return [];
    }

  /**
   * Descarga y persiste en IndexedDB los catálogos + PDVs.
   */
  async function bootstrapData() {
    const catalogs = await fetchCatalogs();
    await idb.put('appdata', { key: 'catalogs', value: catalogs, ts: Date.now() });

    const pdvsAll = await fetchPdvsAll();
    await idb.put('appdata', { key: 'pdvs_all', value: pdvsAll, ts: Date.now() });
  }

  /**
   * Carga desde IndexedDB a memoria (store) los catálogos + PDVs.
   */
  async function loadCached() {
    const c = await idb.get('appdata', 'catalogs');
    const p = await idb.get('appdata', 'pdvs_all');

    store.catalogs = (c && c.value) || { version: 1, fields: [] };
    store.pdvsAll = (p && p.value) || [];
  }

  /**
   * Determina si hay sesión activa (JWT o flag local).
   */
  function hasSession() {
    return !!localStorage.getItem('jwt') || localStorage.getItem('sessionActive') === '1';
  }

  const ICON_LOGIN = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48IS0tIUZvbnQgQXdlc29tZSBQcm8gNi43LjIgYnkgQGZvbnRhd2Vzb21lIC0gaHR0cHM6Ly9mb250YXdlc29tZS5jb20gTGljZW5zZSAtIGh0dHBzOi8vZm9udGF3ZXNvbWUuY29tL2xpY2Vuc2UgKENvbW1lcmNpYWwgTGljZW5zZSkgQ29weXJpZ2h0IDIwMjUgRm9udGljb25zLCBJbmMuLS0+PHBhdGggZD0iTTMxOS4yIDI1Ny44Yy41LS41IC44LTEuMSAuOC0xLjhzLS4zLTEuNC0uOC0xLjhMMTg3LjMgMTI5LjhjLTEuMi0xLjItMi45LTEuOC00LjYtMS44Yy0zLjcgMC02LjcgMy02LjcgNi43bDAgNTcuM2MwIDguOC03LjIgMTYtMTYgMTZMNDAgMjA4Yy00LjQgMC04IDMuNi04IDhsMCA4MGMwIDQuNCAzLjYgOCA4IDhsMTIwIDBjOC44IDAgMTYgNy4yIDE2IDE2bDAgNTcuM2MwIDMuNyAzIDYuNyA2LjcgNi43YzEuNyAwIDMuMy0uNiA0LjYtMS44TDMxOS4yIDI1Ny44ek0zNTIgMjU2YzAgOS41LTMuOSAxOC42LTEwLjggMjUuMUwyMDkuMiA0MDUuNWMtNy4yIDYuOC0xNi43IDEwLjUtMjYuNSAxMC41Yy0yMS40IDAtMzguNy0xNy4zLTM4LjctMzguN2wwLTQxLjNMNDAgMzM2Yy0yMi4xIDAtNDAtMTcuOS00MC00MGwwLTgwYzAtMjIuMSAxNy45LTQwIDQwLTQwbDEwNCAwIDAtNDEuM2MwLTIxLjQgMTcuMy0zOC43IDM4LjctMzguN2M5LjkgMCAxOS4zIDMuOCAyNi41IDEwLjVMMzQxLjIgMjMwLjljNi45IDYuNSAxMC44IDE1LjYgMTAuOCAyNS4xek0zMzYgNDQ4bDk2IDBjMjYuNSAwIDQ4LTIxLjUgNDgtNDhsMC0yODhjMC0yNi41LTIxLjUtNDgtNDgtNDhsLTk2IDBjLTguOCAwLTE2LTcuMi0xNi0xNnM3LjItMTYgMTYtMTZsOTYgMGM0NC4yIDAgODAgMzUuOCA4MCA4MGwwIDI4OGMwIDQ0LjItMzUuOCA4MC04MCA4MGwtOTYgMGMtOC44IDAtMTYtNy4yLTE2LTE2czcuMi0xNiAxNi0xNnoiLz48L3N2Zz4=';
  const ICON_LOGOUT = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48IS0tIUZvbnQgQXdlc29tZSBQcm8gNi43LjIgYnkgQGZvbnRhd2Vzb21lIC0gaHR0cHM6Ly9mb250YXdlc29tZS5jb20gTGljZW5zZSAtIGh0dHBzOi8vZm9udGF3ZXNvbWUuY29tL2xpY2Vuc2UgKENvbW1lcmNpYWwgTGljZW5zZSkgQ29weXJpZ2h0IDIwMjUgRm9udGljb25zLCBJbmMuLS0+PHBhdGggZD0iTTQ3OS4yIDI1NC4yYy41IC41IC44IDEuMSAuOCAxLjhzLS4zIDEuNC0uOCAxLjhMMzQ3LjMgMzgyLjJjLTEuMiAxLjItMi45IDEuOC00LjYgMS44Yy0zLjcgMC02LjctMy02LjctNi43bDAtNTcuM2MwLTguOC03LjItMTYtMTYtMTZsLTEyMCAwYy00LjQgMC04LTMuNi04LThsMC04MGMwLTQuNCAzLjYtOCA4LThsMTIwIDBjOC44IDAgMTYtNy4yIDE2LTE2bDAtNTcuM2MwLTMuNyAzLTYuNyA2LjctNi43YzEuNyAwIDMuMyAuNyA0LjYgMS44TDQ3OS4yIDI1NC4yek01MTIgMjU2YzAtOS41LTMuOS0xOC42LTEwLjgtMjUuMUwzNjkuMiAxMDYuNUMzNjIgOTkuOCAzNTIuNSA5NiAzNDIuNyA5NmMtMjEuNCAwLTM4LjcgMTcuMy0zOC43IDM4LjdsMCA0MS4zLTEwNCAwYy0yMi4xIDAtNDAgMTcuOS00MCA0MGwwIDgwYzAgMjIuMSAxNy45IDQwIDQwIDQwbDEwNCAwIDAgNDEuM2MwIDIxLjQgMTcuMyAzOC43IDM4LjcgMzguN2M5LjkgMCAxOS40LTMuOCAyNi41LTEwLjVMNTAxLjIgMjgxLjFjNi45LTYuNSAxMC44LTE1LjYgMTAuOC0yNS4xek0xNzYgNjRjOC44IDAgMTYtNy4yIDE2LTE2cy03LjItMTYtMTYtMTZMODAgMzJDMzUuOCAzMiAwIDY3LjggMCAxMTJMMCA0MDBjMCA0NC4yIDM1LjggODAgODAgODBsOTYgMGM4LjggMCAxNi03LjIgMTYtMTZzLTcuMi0xNi0xNi0xNmwtOTYgMGMtMjYuNSAwLTQ4LTIxLjUtNDgtNDhsMC0yODhjMC0yNi41IDIxLjUtNDggNDgtNDhsOTYgMHoiLz48L3N2Zz4=';

  function updateAuthIcon() {
    const logged = hasSession();
    $('#icon-auth').attr('src', logged ? ICON_LOGOUT : ICON_LOGIN);
    $('#btn-auth').attr('title', logged ? 'Cerrar sesión' : 'Iniciar sesión');
  }

  /**
   * En rutas protegidas, redirige al login si no hay sesión.
   */
  function ensureAuth($c) {
    if (hasSession()) return true;
    location.hash = '#/';
    $c.html('');
    return false;
  }

  /**
   * Cambia el título del documento.
   */
  function renderHeaderTitle(t) {
    document.title = t + ' — ' + BRAND;
  }

  // Bootstrap inicial
  (async () => {
    await loadCached();
    setOnlineUI();
    await refreshCounts();
    navigateTo();
  })();

  // ---------------------------------------------------------------------------
  // Operaciones sobre PDVs en memoria + persistencia
  // ---------------------------------------------------------------------------

  /**
   * Actualiza el status de un PDV en el array en memoria y persiste en IDB.
   */
  function setPDVStatusLocal(pdvId, status) {
    const idx = store.pdvsAll.findIndex((p) => String(p.id) === String(pdvId));
    if (idx >= 0) {
      store.pdvsAll[idx].status = status;
      idb.put('appdata', { key: 'pdvs_all', value: store.pdvsAll, ts: Date.now() });
    }
  }

  /**
   * Calcula progreso (hechos/total) y porcentaje.
   */
  function summarizeProgress(list) {
    const total = list.length;
    const done = list.filter((p) => p.status === 'filled' || p.status === 'synced').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }

  // ---------------------------------------------------------------------------
  // Vistas
  // ---------------------------------------------------------------------------

  /**
   * Vista: Login
   */
  async function renderLogin($c) {
    renderHeaderTitle('Login');
    setBreadcrumbs([{ label: 'Inicio', href: '#/', active: true }]);

    const offlineHint = (!navigator.onLine && localStorage.getItem('sessionActive') === '1')
      ? '<div class="alert alert-info offline-hint">Sin conexión. Puedes continuar en modo offline con la sesión previa.</div>' +
        '<button class="btn btn-outline-primary btn-block mb-3" id="btn-offline">Entrar en modo offline</button>'
      : '';

    $c.html(
      '<div class="container py-3">' +
        '<div class="card card-tap">' +
          '<div class="card-body">' +
            '<h5 class="card-title mb-3">Iniciar sesión</h5>' +
            offlineHint +
            '<div class="form-group">' +
              '<label class="compact-label">Usuario</label>' +
              '<input type="text" class="form-control" id="user">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="compact-label">Contraseña</label>' +
              '<input type="password" class="form-control" id="pass">' +
            '</div>' +
            '<div class="small text-muted mb-2">Servidor: ' + getApiBase() + '</div>' +
            '<div class="text-danger small mb-2" id="login-error"></div>' +
            '<button class="btn btn-primary btn-block" id="btn-login">Entrar</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    // Prefill de usuario si existe en localStorage
    $('#user').val(localStorage.getItem('user') || '');

    // Botón: entrar en modo offline si hay sesión previa
    $('#btn-offline').on('click', () => {
      if (localStorage.getItem('sessionActive') === '1') {
        location.hash = '#/routes';
      } else {
        alert('No hay sesión previa.');
      }
    });

    // Botón: login online con JWT + bootstrap de datos
    $('#btn-login').on('click', async function () {
      const base = trimSlash(getApiBase());
      const u = $('#user').val().trim();
      const p = $('#pass').val().trim();

      $('#login-error').text('');

      try {
        const url = trimSlash(base) + '/wp-json/jwt-auth/v1/token';
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p }),
        });

        if (!r.ok) throw new Error('HTTP ' + r.status);

        const j = await r.json();
        localStorage.setItem('user', u);
        localStorage.setItem('jwt', j.token);
        localStorage.setItem('sessionActive', '1');

        await bootstrapData();
        await loadCached();
        updateAuthIcon();

        location.hash = '#/routes';
      } catch (e) {
        $('#login-error').text('Error de login/bootstrap: ' + (e.message || e));
      }
    });
  }

  /**
   * Devuelve HTML de chip de estado para un PDV.
   */
  function statusChip(s) {
    if (s === 'synced') return '<span class="badge status synced">Sincronizado</span>';
    if (s === 'filled') return '<span class="badge status filled">Lleno</span>';
    return '<span class="badge status pending">Pendiente</span>';
  }

  /**
   * Vista: Listado de Rutas con progreso.
   */
  async function renderRoutes($c) {
    if (!ensureAuth($c)) return;

    renderHeaderTitle('Rutas');
    setBreadcrumbs([{ label: 'Rutas', href: '#/routes', active: true }]);

    await loadCached();

    if (!store.pdvsAll.length) {
      try {
        await bootstrapData();
        await loadCached();
      } catch (e) {}
    }

    const routeMap = new Map();
    for (const p of store.pdvsAll) {
      if (p.route && p.route.id) {
        const id = String(p.route.id);
        if (!routeMap.has(id)) {
          routeMap.set(id, { title: p.route.title || ('Ruta ' + p.route.id), pdvs: [] });
        }
        routeMap.get(id).pdvs.push(p);
      }
    }

    const routes = Array.from(routeMap.entries())
      .map(([id, info]) => ({ id, title: info.title, pdvs: info.pdvs }))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    $c.html(
      '<div class="container py-3">' +
        '<h5 class="mb-3">Rutas</h5>' +
        '<div class="list-group" id="route-list"></div>' +
      '</div>'
    );

    const $list = $('#route-list');
    if (!routes.length) {
      $list.append('<div class="list-group-item small text-muted">No hay rutas asignadas.</div>');
    } else {
      routes.forEach((r) => {
        const prog = summarizeProgress(r.pdvs);
        const $i = $('<div/>')
          .addClass('list-group-item list-group-item-action')
          .attr('data-id', r.id)
          .html(
            '<div class="d-flex w-100 justify-content-between align-items-center">' +
              '<div class="font-weight-bold">' + r.title + '</div>' +
              '<span class="badge badge-light">' + prog.done + '/' + prog.total + '</span>' +
            '</div>' +
            '<div class="progress thin mt-2"><div class="progress-bar" style="width:' + prog.pct + '%"></div></div>'
          );
        $list.append($i);
      });
    }

    $list.on('click', '.list-group-item', function () {
      const id = $(this).data('id');
      if (id) location.hash = '#/pdvs?routeId=' + encodeURIComponent(id);
    });
  }

  /**
   * Vista: Listado de PDVs por ruta con filtro de sub-ruta.
   */
  async function renderPdvs($c, query) {
    if (!ensureAuth($c)) return;

    await loadCached();

    if (!store.pdvsAll.length) {
      try {
        await bootstrapData();
        await loadCached();
      } catch (e) {}
    }

    const selectedRoute = (query.routeId || '').trim();
    if (!selectedRoute) {
      location.hash = '#/routes';
      return;
    }

    const routePdvs = store.pdvsAll.filter(
      (p) => String(p.route && p.route.id) === String(selectedRoute)
    );
    const routeTitle = routePdvs[0] && routePdvs[0].route ? routePdvs[0].route.title : 'Ruta ' + selectedRoute;

    const selectedSub = (query.subrouteId || '').trim();

    const subrouteMap = new Map();
    for (const p of routePdvs) {
      if (p.subroute && p.subroute.id) {
        subrouteMap.set(String(p.subroute.id), p.subroute.title || p.subroute.id);
      }
    }

    const subOptions = Array.from(subrouteMap.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    const filtered = routePdvs.filter(
      (p) => !selectedSub || String(p.subroute && p.subroute.id) === String(selectedSub)
    );

    const prog = summarizeProgress(filtered);

    renderHeaderTitle(routeTitle);
    setBreadcrumbs([
      { label: 'Rutas', href: '#/routes' },
      { label: routeTitle, active: true },
    ]);

    $c.html(
      '<div class="container py-3">' +
        '<div class="d-flex align-items-center mb-2">' +
          '<h5 class="m-0">' + routeTitle + '</h5>' +
          '<div class="ml-auto d-flex align-items-center">' +
            '<label class="mr-2 mb-0 small text-muted">Día</label>' +
            '<select class="form-control form-control-sm" id="subroute-filter" style="min-width:220px"></select>' +
          '</div>' +
        '</div>' +

        '<div class="mb-3">' +
          '<div class="d-flex align-items-center mb-1">' +
            '<small class="text-muted mr-2">Progreso</small>' +
            '<span class="badge badge-light">' + prog.done + '/' + prog.total + '</span>' +
            '<span class="ml-auto small text-muted">' + prog.pct + '%</span>' +
          '</div>' +
          '<div class="progress thin">' +
            '<div class="progress-bar" role="progressbar" style="width:' + prog.pct + '%" aria-valuenow="' + prog.pct + '" aria-valuemin="0" aria-valuemax="100"></div>' +
          '</div>' +
        '</div>' +

        '<div class="list-group" id="pdv-list"></div>' +
      '</div>'
    );

    const $sel = $('#subroute-filter');
    $sel.append('<option value="">Todos</option>');
    subOptions.forEach((s) => $sel.append('<option value="' + s.id + '">' + s.title + '</option>'));
    if (selectedSub) $sel.val(selectedSub);

    function renderRows() {
      const $list = $('#pdv-list').empty();
      const rows = routePdvs.filter(
        (p) => !selectedSub || String(p.subroute && p.subroute.id) === String(selectedSub)
      );

      if (!rows.length) {
        $list.append('<div class="list-group-item small text-muted">No hay PDVs para el filtro seleccionado.</div>');
        return;
      }

      rows.forEach((p) => {
        const $i = $('<div/>')
          .addClass('list-group-item list-group-item-action')
          .html(
            '<div class="d-flex w-100 justify-content-between align-items-start">' +
              '<div>' +
                '<div class="font-weight-bold">' + (p.code || '') + ' — ' + p.name + '</div>' +
                '<div class="small text-muted">' + (p.address || '') + '</div>' +
              '</div>' +
              '<div>' + statusChip(p.status || 'pending') + '</div>' +
            '</div>' +
            '<div class="mt-2 d-flex">' +
              '<a href="#/form?pdvId=' + encodeURIComponent(p.id) + '" class="btn btn-sm btn-primary">Abrir</a>' +
            '</div>'
          );

        $list.append($i);
      });
    }

    renderRows();

    $sel.on('change', function () {
      const v = $(this).val() || '';
      const base = '#/pdvs?routeId=' + encodeURIComponent(selectedRoute) + (v ? ('&subrouteId=' + encodeURIComponent(v)) : '');
      location.hash = base;
    });
  }

  /**
   * Crea el widget mínimo de cámara (encender, capturar, repetir) y expone API.
   * No arranca la cámara automáticamente; requiere click del usuario.
   */
  function buildCameraUI() {
    const $w = $('<div class="mb-3"></div>');

    // Título de paso
    $w.append('<div class="form-step-title mb-2">Fotografía (requerida)</div>');

    // Contenedores del preview
    const $wrap = $('<div class="camera-wrap"></div>');
    const $frame = $('<div class="camera-frame"></div>');
    const $video = $('<video playsinline autoplay muted class="media rounded" style="display:none"></video>');
    const $canvas = $('<canvas class="media rounded" style="display:none"></canvas>');

    $frame.append($video).append($canvas);
    $wrap.append($frame);

    // Controles (se muestran cuando corresponde)
    const $controls = $('<div class="camera-controls mt-2 d-flex justify-content-between" style="display:none"></div>');
    const $btnShot = $('<button type="button" class="btn btn-primary" style="display:none">Capturar</button>');
    const $btnRetake = $('<button type="button" class="btn btn-outline-warning" style="display:none">Repetir</button>');

    $controls.append($btnShot, $btnRetake);

    // Estado + botón principal
    const $status = $('<div class="small text-muted mt-2">Para iniciar, enciende la cámara.</div>');
    const $btnStart = $('<button type="button" class="btn btn-outline-secondary">Encender cámara</button>');

    $w.append($btnStart, $wrap, $controls, $status);

    // Estado interno del widget
    let stream = null;      // MediaStream activo
    let track = null;       // VideoTrack actual
    let imageBlob = null;   // Última captura (Blob PNG)
    let onCaptureCb = null; // Callback al capturar

    // Muestra/oculta elementos según si cámara está activa
    function setVisible(on) {
      $wrap.css('display', on ? 'block' : 'none');
      $controls.css('display', on ? 'flex' : 'none');

      if (on) {
        $video.show();
        $canvas.hide();
        $btnShot.show().prop('disabled', false);
        $btnRetake.hide();
      } else {
        $btnShot.hide();
        $btnRetake.hide();
        $video.hide();
        $canvas.hide();
      }
    }

    // Detiene todas las pistas del stream si existe
    async function stopStream() {
      try {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }
      } catch (e) {}
      stream = null;
      track = null;
    }

    // Solicita camara (ideal environment) y prepara UI
    async function startCamera() {
      try {
        $status.text('Solicitando cámara…');

        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { min: 1280, ideal: 3000, max: 4096 },
            height: { min: 720, ideal: 2000, max: 4096 },
          },
          audio: false,
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        $video[0].srcObject = stream;

        track = stream.getVideoTracks()[0];
        const s = track.getSettings ? track.getSettings() : {};
        const w = s.width || 'auto',
              h = s.height || 'auto';

        $status.text('Cámara lista ' + w + '×' + h + '.');
        setVisible(true);
      } catch (e) {
        $status.text('No se pudo iniciar la cámara: ' + (e.message || e));
      }
    }

    // Captura un frame al canvas, recorta a 3:2 (centrado) y genera PNG (Blob)
    async function capturePhoto() {
      try {
        imageBlob = null;

        const vid = $video[0];
        const fw = vid.videoWidth,
              fh = vid.videoHeight;

        if (!(fw && fh)) throw new Error('No hay frame de video disponible.');

        // Cálculo de recorte para relación 3:2
        const targetAR = 3 / 2;
        const frameAR = fw / fh;

        let sx = 0, sy = 0, sw = fw, sh = fh;
        if (frameAR > targetAR) {
          // Recorte lateral
          sw = Math.round(fh * targetAR);
          sx = Math.floor((fw - sw) / 2);
        } else {
          // Recorte superior/inferior
          sh = Math.round(fw / targetAR);
          sy = Math.floor((fh - sh) / 2);
        }

        const c = $canvas[0];
        c.width = sw;
        c.height = sh;

        const ctx = c.getContext('2d');
        ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, sw, sh);

        $canvas.show();
        $video.hide();
        $btnShot.hide();
        $btnRetake.show().prop('disabled', false);
        $status.text('Procesando foto…');

        const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
        imageBlob = blob;

        $status.text('Foto capturada (' + Math.round(imageBlob.size / 1024) + ' KB). Puedes repetir.');

        if (onCaptureCb) {
          try { onCaptureCb(imageBlob); } catch (e) { console.warn(e); }
        }

        await stopStream();
      } catch (e) {
        $status.text('Error al capturar: ' + (e.message || e));
      }
    }

    // Permite registrar callback cuando se captura la foto
    function oncapture(cb) {
      onCaptureCb = cb;
    }

    // Wiring de botones del widget
    $btnStart.on('click', startCamera);
    $btnShot.on('click', capturePhoto);

    $btnRetake.on('click', async () => {
      imageBlob = null;
      $canvas.hide();
      $btnRetake.hide();
      $status.text('Reiniciando cámara…');
      await startCamera();
      $status.text('Reintenta la captura.');
    });

    // Inicialmente oculto
    setVisible(false);

    // API pública del widget
    return {
      $root: $w,
      getBlob: () => imageBlob,
      stop: stopStream,
      start: startCamera,
      oncapture,
    };
  }

  /**
   * Render de un campo tipo "cards" (radio/checkbox) o inputs básicos.
   */
  function renderFieldCard(f, val, onChange) {
    const multiple = (f.type === 'checkbox');

    const $wrap = $('<div class="mb-3"></div>');
    $wrap.append('<div class="form-step-title mb-2">' + f.label + (f.required ? ' *' : '') + '</div>');

    const $grid = $('<div class="select-cards"></div>');

    (f.options || []).forEach((opt, i) => {
      const id = f.id + '-' + i;
      const checked = multiple
        ? (Array.isArray(val) && val.includes(opt.value))
        : (val === opt.value);

      const $input = $('<input type="' + (multiple ? 'checkbox' : 'radio') + '" class="select-hidden" name="' + f.id + '" id="' + id + '" value="' + opt.value + '" ' + (checked ? 'checked' : '') + '>');

      const $label = $('<label for="' + id + '" class="card select-card border"><div class="card-body p-2"><div class="title">' + opt.label + '</div></div></label>');

      $grid.append($input).append($label);
    });

    $wrap.append($grid);

    // Propaga cambios al callback de control
    $grid.on('change', 'input', function () {
      if (multiple) {
        const arr = [];
        $grid.find('input:checked').each(function () { arr.push(this.value); });
        onChange(arr);
      } else {
        onChange(this.value);
      }
    });

    return $wrap;
  }

  /**
   * Vista: Formulario de PDV por pasos (campos -> foto -> ubicación)
   */
  async function renderForm($c, query) {
    if (!ensureAuth($c)) return;

    renderHeaderTitle('Formulario');

    const pdvId = query.pdvId || '';

    await loadCached();

    const fields = store.catalogs.fields || [];
    const pdv = (store.pdvsAll || []).find((x) => String(x.id) === String(pdvId));
    const routeId = pdv && pdv.route ? pdv.route.id : '';
    const routeTitle = pdv && pdv.route ? (pdv.route.title || ('Ruta ' + pdv.route.id)) : '';

    let answers = {}; // Respuestas acumuladas por id de campo
    let step = 0;     // Paso actual (0..N)

    const cam = buildCameraUI();
    let photoBlob = null; // Captura resultante

    const total = fields.length + 2; // campos + (foto) + (geo)

    setBreadcrumbs([
      { label: 'Rutas', href: '#/routes' },
      { label: routeTitle, href: '#/pdvs?routeId=' + encodeURIComponent(routeId) },
      { label: (pdv ? (pdv.code + ' — ' + pdv.name) : 'Formulario'), active: true },
    ]);

    $c.html(
      '<div class="container py-3">' +
        '<div class="d-flex align-items-center mb-2">' +
          '<button class="btn btn-outline-secondary btn-sm" id="btn-back">← Volver</button>' +
          '<div class="ml-auto"><span class="badge badge-primary" id="step-label">1/' + total + '</span></div>' +
        '</div>' +

        '<div class="progress thin mb-3"><div class="progress-bar" id="progressbar" style="width:0%"></div></div>' +
        '<div id="form-body"></div>' +

        '<div class="sticky-actions mt-3">' +
          '<button class="btn btn-primary btn-block" id="btn-next">Siguiente</button>' +
        '</div>' +
      '</div>'
    );

    // Actualiza UI de progreso, texto de botón, etc.
    function updateStepUI() {
      const pct = Math.round((step / (total - 1)) * 100);
      $('#progressbar').css('width', pct + '%');
      $('#step-label').text((step + 1) + '/' + total);

      const onCameraStep = (step === fields.length);
      $('#btn-next').text(step === (total - 1) ? 'Finalizar' : 'Siguiente');
      $('#btn-next').prop('disabled', onCameraStep && !photoBlob);
    }

    // Render de un campo según tipo
    function renderField(f, val, onChange) {
      if (f.type === 'radio' || f.type === 'checkbox') {
        return renderFieldCard(f, val, onChange);
      }

      if (f.type === 'textarea') {
        const $ta = $('<textarea class="form-control" rows="5"></textarea>').val(val || '');
        $ta.on('input', () => onChange($ta.val()));
        return $('<div class="mb-3"></div>')
          .append('<div class="form-step-title mb-2">' + f.label + '</div>')
          .append($ta);
      }

      // Input de texto por defecto
      const $in = $('<input type="text" class="form-control">').val(val || '');
      $in.on('input', () => onChange($in.val()));
      return $('<div class="mb-3"></div>')
        .append('<div class="form-step-title mb-2">' + f.label + '</div>')
        .append($in);
    }

    // UI mínima para obtención de geolocalización
    function geoUI() {
      const $w = $('<div class="mb-3"></div>');
      const $b = $('<button class="btn btn-outline-primary btn-block" type="button">Obtener ubicación</button>');
      const $o = $('<div class="small text-muted mt-2">Aún sin datos</div>');

      $b.on('click', () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude.toFixed(6);
            const lng = pos.coords.longitude.toFixed(6);
            const acc = Math.round(pos.coords.accuracy);
            $o.text('Lat: ' + lat + ', Lng: ' + lng + ', Precisión: ' + acc + ' m');
          },
          (err) => {
            $o.text('Error: ' + (err.message || err));
          },
          { enableHighAccuracy: true, timeout: 15000 }
        );
      });

      $w.append($b).append($o);
      return $w;
    }

    // Monta el contenido de cada paso en #form-body
    async function mount() {
      const $b = $('#form-body').empty();

      if (step < fields.length) {
        try { await cam.stop(); } catch (e) {}

        const f = fields[step];
        const val = answers[f.id];

        $b.append(
          renderField(f, val, (v) => { answers[f.id] = v; })
        );
      } else if (step === fields.length) {
        $b.append(cam.$root);
        cam.oncapture(function (blob) {
          photoBlob = blob;
          updateStepUI();
        });
      } else {
        try { await cam.stop(); } catch (e) {}
        $b.append('<div class="form-step-title mb-2">Ubicación</div>').append(geoUI());
      }

      updateStepUI();
    }

    // Al finalizar: guarda en responses + encola para sync y navega a PDVs
    async function finalize() {
      const payload = {
        pdvId: pdvId,
        routeId: routeId,
        answers: answers,
        photo: photoBlob ? { size: photoBlob.size, mime: photoBlob.type } : null,
        status: 'filled',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        dedupeKey: (pdvId + '-' + Date.now()),
      };

      await idb.add('responses', payload);
      await idb.add('queue', {
        type: 'response',
        status: 'queued',
        attempts: 0,
        nextAt: Date.now(),
        payload: payload,
      });

      setPDVStatusLocal(pdvId, 'filled');
      await refreshCounts();

      try { await cam.stop(); } catch (e) {}

      alert('Guardado local ✔️');
      location.hash = '#/pdvs?routeId=' + encodeURIComponent(routeId);
    }

    // Siguiente / Finalizar
    $('#app-main').off('click', '#btn-next').on('click', '#btn-next', async function () {
      if (step === fields.length && !photoBlob) {
        alert('Primero captura una foto.');
        return;
      }

      if (step === (total - 1)) {
        await finalize();
        return;
      }

      step++;
      mount();
    });

    // Volver
    $('#app-main').off('click', '#btn-back').on('click', '#btn-back', async function () {
      if (step > 0) {
        step--;
        await mount();
      } else {
        try { await cam.stop(); } catch (e) {}
        location.hash = '#/pdvs?routeId=' + encodeURIComponent(routeId);
      }
    });

    // Render inicial
    mount();
  }

  /**
   * Intenta procesar la cola de sincronización si hay conexión.
   * Reintentos con backoff exponencial (máx 5 minutos entre intentos).
   */
  async function tryProcessQueue() {
    if (!navigator.onLine) return;

    const qs = await idb.all('queue');
    const pend = qs.filter((q) => q.status !== 'done' && q.nextAt <= Date.now());

    for (const q of pend) {
      q.status = 'sending';
      await idb.put('queue', q);

      try {
        const base = trimSlash(getApiBase());
        const tok = (localStorage.getItem('jwt') || '');
        const url = base + '/wp-json/myapp/v1/responses/bulk';

        // Normaliza payload para el endpoint bulk
        const payload = [q.payload].map((it) => ({
          pdv_id: it.pdvId,
          answers: it.answers,
          created_at: it.createdAt,
          updated_at: it.updatedAt,
          dedupeKey: it.dedupeKey,
        }));

        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + tok,
          },
          body: JSON.stringify(payload),
        });

        if (!r.ok) throw new Error('HTTP ' + r.status);

        // Marcamos como done en cola e igual actualizamos response -> synced
        q.status = 'done';
        await idb.put('queue', q);

        const allR = await idb.all('responses');
        const m = allR.find((x) => x.dedupeKey === q.payload.dedupeKey);
        if (m) {
          m.status = 'synced';
          await idb.put('responses', m);
        }

        setPDVStatusLocal(q.payload.pdvId, 'synced');
      } catch (e) {
        // Backoff exponencial con tope
        q.attempts = (q.attempts || 0) + 1;
        q.status = 'failed';
        q.nextAt = Date.now() + Math.min(300000, 3000 * (2 ** q.attempts));
        q.lastError = e.message || String(e);
        await idb.put('queue', q);
      }
    }

    await refreshCounts();
  }

  // Procesa la cola periódicamente (cada 4s)
  setInterval(() => { tryProcessQueue(); }, 4000);

  /**
   * Vista: Pendientes (no sincronizados)
   */
  async function renderPending($c) {
    setBreadcrumbs([{ label: 'Rutas', href: '#/routes' }, { label: 'Pendientes', active: true }]);

    const rows = (await idb.all('responses')).filter((x) => x.status !== 'synced');

    $c.html('<div class="container py-3"><h5>Pendientes</h5><div id="list" class="list-group"></div></div>');

    const $list = $('#list');
    if (!rows.length) {
      $list.html('<div class="text-muted small">No hay registros.</div>');
      return;
    }

    rows.forEach((r) => {
      $list.append(
        '<div class="list-group-item d-flex justify-content-between">' +
          '<div>PDV: ' + r.pdvId + '</div>' +
          '<small>' + new Date(r.createdAt).toLocaleString() + '</small>' +
        '</div>'
      );
    });
  }

  /**
   * Vista: Sincronizados
   */
  async function renderSynced($c) {
    setBreadcrumbs([{ label: 'Rutas', href: '#/routes' }, { label: 'Sincronizados', active: true }]);

    const rows = (await idb.all('responses')).filter((x) => x.status === 'synced');

    $c.html('<div class="container py-3"><h5>Sincronizados</h5><div id="list" class="list-group"></div></div>');

    const $list = $('#list');
    if (!rows.length) {
      $list.html('<div class="text-muted small">No hay registros.</div>');
      return;
    }

    rows.forEach((r) => {
      $list.append(
        '<div class="list-group-item d-flex justify-content-between">' +
          '<div>PDV: ' + r.pdvId + '</div>' +
          '<small>' + new Date(r.createdAt).toLocaleString() + '</small>' +
        '</div>'
      );
    });
  }

  /**
   * Vista: Sincronización manual (botón)
   */
  async function renderSync($c) {
    setBreadcrumbs([{ label: 'Rutas', href: '#/routes' }, { label: 'Sincronización', active: true }]);

    $c.html(
      '<div class="container py-3">' +
        '<div class="d-flex align-items-center mb-2">' +
          '<h5 class="m-0">Sincronización</h5>' +
          '<button class="btn btn-primary ml-auto" id="btn-sync">Sincronizar ahora</button>' +
        '</div>' +
        '<div class="card card-tap">' +
          '<div class="card-body">' +
            '<pre id="log" class="codebox mb-0" style="max-height:300px; overflow:auto"></pre>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    const $log = $('#log');

    const log = (t) => {
      $log.text($log.text() + t + '\n');
      $log.scrollTop = $log[0].scrollHeight;
    };

    $('#btn-sync').on('click', async function () {
      log('Procesando cola…');
      await tryProcessQueue();
      log('Listo.');
    });
  }

  /**
   * Vista: Ajustes
   */
  async function renderSettings($c) {
    const home = hasSession() ? '#/routes' : '#/';

    setBreadcrumbs([{ label: 'Inicio', href: home }, { label: 'Ajustes', active: true }]);

    $c.html(
      '<div class="container py-3">' +
        '<h5>Ajustes</h5>' +
        '<div class="card card-tap mb-3">' +
          '<div class="card-body">' +
            '<div class="form-group">' +
              '<label>API Base</label>' +
              '<input type="url" id="opt-api" class="form-control" placeholder="https://todoterreno.vistapreliminar.com">' +
              '<small class="form-text text-muted">Edita solo si cambias de dominio.</small>' +
            '</div>' +

            '<div class="d-flex flex-wrap">' +
              '<button class="btn btn-outline-success mr-2 mb-2" id="btn-save-api">Guardar API Base</button>' +
              '<button class="btn btn-outline-secondary mr-2 mb-2" id="btn-reset-api">Restablecer a predeterminado</button>' +
              '<button class="btn btn-outline-secondary mr-2 mb-2" id="btn-update-app">Actualizar app</button>' +
              '<button class="btn btn-outline-danger mr-2 mb-2" id="btn-clear-cache">Limpiar caché</button>' +
              '<button class="btn btn-outline-warning mr-2 mb-2" id="btn-clear-idb">Borrar base local</button>' +
              '<button class="btn btn-outline-primary mr-2 mb-2" id="btn-go-home">Ir al inicio</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    // Valor actual de API Base
    $('#opt-api').val(localStorage.getItem('apiBase') || 'https://todoterreno.vistapreliminar.com');

    // Guardar API Base
    $('#btn-save-api').on('click', function () {
      const v = ($('#opt-api').val() || '').trim();
      if (!v) return alert('Ingresa una URL');
      localStorage.setItem('apiBase', v);
      alert('Guardado.');
    });

    // Restablecer API Base
    $('#btn-reset-api').on('click', function () {
      localStorage.removeItem('apiBase');
      $('#opt-api').val('https://todoterreno.vistapreliminar.com');
      alert('Restablecido.');
    });

    // Forzar actualización de Service Worker
    $('#btn-update-app').on('click', async function () {
      const reg = await navigator.serviceWorker.getRegistration('./');
      if (reg) {
        await reg.update();
        if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
      }
      alert('Actualizando… cierra/abre la PWA si no ves cambios.');
    });

    // Limpiar caches de Cache Storage
    $('#btn-clear-cache').on('click', async function () {
      if (window.caches) {
        const ks = await caches.keys();
        for (const k of ks) await caches.delete(k);
      }
      alert('Caché limpiada. Recarga la app.');
    });

    // Borrar base de datos local (IndexedDB)
    $('#btn-clear-idb').on('click', async function () {
      try {
        await new Promise((r) => {
          const req = indexedDB.deleteDatabase('tt_pro_bs_db');
          req.onsuccess = req.onerror = req.onblocked = () => r();
        });
        alert('Base local borrada. Recarga la app.');
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    // Ir a inicio dependiendo de si hay sesión
    $('#btn-go-home').on('click', function () { location.hash = home; });
  }

  /**
   * Vista: 404 / No encontrada
   */
  async function renderNotFound($c) {
    setBreadcrumbs([{ label: 'Inicio', href: '#/', active: true }]);
    $c.html('<div class="container py-4"><div class="alert alert-warning">Página no encontrada.</div></div>');
  }

  // ---------------------------------------------------------------------------
  // Navegación global en botones/acciones comunes (delegados)
  // ---------------------------------------------------------------------------

  $(document).on('click', '#btn-settings', function () { location.hash = '#/settings'; });

  $(document).on('click', '#btn-auth', function () {
    if (hasSession()) {
      localStorage.removeItem('jwt');
      localStorage.removeItem('sessionActive');
    }
    location.hash = '#/';
    updateAuthIcon();
  });

  $(document).on('click', '#btn-sync-footer', function () { location.hash = '#/sync'; });

  // Estado inicial de breadcrumbs en DOM ready
  $(function () {
    setBreadcrumbs([{ label: 'Inicio', href: '#/', active: true }]);
    updateAuthIcon();
  });

})(jQuery);
