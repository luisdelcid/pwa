(function ($) {
  'use strict';

  /**
   * =============================================================
   *  PWA "TT Censo 2025" — main.js (versión expandida y documentada)
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
  const BRAND = 'TT Censo 2025';
  const APP_VERSION = '5.9.1';
  const API_BASE = 'https://todoterreno.prueba.in';
  const IDBVER = 7; // Versión del esquema de IndexedDB

  // ---------------------------------------------------------------------------
  // Utilidades: configuración y helpers de URL
  // ---------------------------------------------------------------------------

  /**
   * Obtiene la base fija de la API.
   */
  function getApiBase() {
    return API_BASE;
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

    // Guarda la última ruta visitada para restaurarla al reiniciar la app.
    if (path !== '/') {
      localStorage.setItem('lastPath', location.hash);
    } else {
      localStorage.removeItem('lastPath');
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
    routesAll: [],
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

    $('#chip-pending').text('Pendientes: ' + pending);
    $('#chip-synced').text('Completados: ' + synced);
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
    async function fetchRoutesAll() {
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
     * Descarga respuestas previamente sincronizadas del usuario.
     */
    async function fetchPreviousResponses() {
      const base = trimSlash(getApiBase());
      const jwt = localStorage.getItem('jwt') || '';

      try {
        if (base && jwt) {
          const u = base + '/wp-json/myapp/v1/responses/mine';
          const r = await fetch(u, { headers: { Authorization: 'Bearer ' + jwt } });
          if (r.ok) return r.json();
        }
      } catch (e) {}

      return [];
    }

    /**
     * Descarga y guarda en IndexedDB las respuestas previas.
     */
    async function downloadPreviousResponses() {
      const list = await fetchPreviousResponses();
      await loadCached();
      const existing = await idb.all('responses');

      for (const it of list) {
        const pdvId = String(it.pdv_id || it.pdvId);
        const info = findPdvById(pdvId);
        const routeId = info ? info.route.id : '';
        let row = existing.find((x) => String(x.pdvId) === pdvId) || {};

        row = Object.assign({}, row, {
          pdvId: pdvId,
          routeId: routeId,
          answers: it.answers || {},
          status: 'synced',
          createdAt: row.createdAt || Date.now(),
          updatedAt: Date.now(),
        });

        if (row.localId) {
          await idb.put('responses', row);
        } else {
          await idb.add('responses', row);
        }

        setPDVStatusLocal(pdvId, 'synced');
      }

      await refreshCounts();
      alert('Descarga completa');
    }

  /**
   * Descarga y persiste en IndexedDB los catálogos + rutas.
   */
  async function bootstrapData() {
    const catalogs = await fetchCatalogs();
    await idb.put('appdata', { key: 'catalogs', value: catalogs, ts: Date.now() });

    const routesAll = await fetchRoutesAll();
    await idb.put('appdata', { key: 'routes_all', value: routesAll, ts: Date.now() });
  }

  /**
   * Carga desde IndexedDB a memoria (store) los catálogos + rutas.
   */
  async function loadCached() {
    const c = await idb.get('appdata', 'catalogs');
    let p = await idb.get('appdata', 'routes_all');

    store.catalogs = (c && c.value) || { version: 1, fields: [] };

    if (p && p.value) {
      store.routesAll = p.value;
    } else {
      const legacy = await idb.get('appdata', 'pdvs_all');
      store.routesAll = legacy ? legacyRoutesFromPdvs(legacy.value || []) : [];
      if (legacy && legacy.value) {
        await idb.put('appdata', { key: 'routes_all', value: store.routesAll, ts: Date.now() });
      }
    }
  }

  /**
   * Elimina todas las entradas de Cache Storage de la aplicación.
   * @param {boolean} [alertUser=false] Muestra un alert al finalizar
   */
  async function clearCacheStorage(alertUser = false) {
    if (window.caches) {
      const ks = await caches.keys();
      for (const k of ks) await caches.delete(k);
    }

    if (alertUser) {
      alert('Caché limpiada. Recarga la app.');
    }
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

    // Si hay sesión previa, restaurar la última ruta visitada o ir a rutas.
    const lastPath = localStorage.getItem('lastPath');
    if (hasSession() && lastPath) {
      navigateTo(lastPath);
    } else if (hasSession() && (!location.hash || location.hash === '#/')) {
      navigateTo('#/routes');
    } else {
      navigateTo();
    }
  })();

  // ---------------------------------------------------------------------------
  // Operaciones sobre PDVs en memoria + persistencia
  // ---------------------------------------------------------------------------

  /**
   * Actualiza el status de un PDV en el array en memoria y persiste en IDB.
   */
  function setPDVStatusLocal(pdvId, status) {
    for (const r of store.routesAll) {
      for (const sr of r.subroutes || []) {
        const idx = sr.pdvs.findIndex((p) => String(p.id) === String(pdvId));
        if (idx >= 0) {
          sr.pdvs[idx].status = status;
          idb.put('appdata', { key: 'routes_all', value: store.routesAll, ts: Date.now() });
          return;
        }
      }
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

  function pdvsFromRoute(route) {
    const map = new Map();
    (route.subroutes || []).forEach((sr) => {
      (sr.pdvs || []).forEach((p) => {
        const id = String(p.id);
        if (!map.has(id)) {
          // Clonar para evitar referencias compartidas y agregar sub-rutas asociadas
          const clone = Object.assign({}, p);
          clone.subroutes = [];
          map.set(id, clone);
        }
        map.get(id).subroutes.push({ id: String(sr.id), title: sr.title });
      });
    });
    return Array.from(map.values());
  }

  function legacyRoutesFromPdvs(pdvs) {
    const map = new Map();
    (pdvs || []).forEach((p) => {
      const rId = p.route && p.route.id ? String(p.route.id) : '';
      if (!rId) return;
      if (!map.has(rId)) {
        map.set(rId, { id: rId, title: p.route.title || ('Ruta ' + rId), subroutes: [] });
      }
      const route = map.get(rId);
      const srId = p.subroute && p.subroute.id ? String(p.subroute.id) : '';
      let sr = route.subroutes.find((s) => s.id === srId);
      if (!sr) {
        sr = { id: srId, title: (p.subroute && p.subroute.title) || '', pdvs: [] };
        route.subroutes.push(sr);
      }
      sr.pdvs.push(p);
    });
    return Array.from(map.values());
  }

  function findPdvById(id) {
    for (const r of store.routesAll) {
      for (const sr of r.subroutes || []) {
        for (const p of sr.pdvs || []) {
          if (String(p.id) === String(id)) return { pdv: p, route: r, subroute: sr };
        }
      }
    }
    return null;
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
        '<button class="btn btn-outline-primary btn-lg btn-block mb-3" id="btn-offline">Entrar en modo offline</button>'
      : '';

    $c.html(
      '<div class="container py-3">' +
        '<div class="card card-tap">' +
          '<div class="card-body">' +
            '<h5 class="card-title mb-3">Iniciar sesión</h5>' +
            offlineHint +
            '<div class="form-group">' +
              '<label class="compact-label">Usuario</label>' +
              '<input type="text" class="form-control form-control-lg" id="user">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="compact-label">Contraseña</label>' +
              '<input type="password" class="form-control form-control-lg" id="pass">' +
            '</div>' +
            '<div class="text-danger small mb-2" id="login-error"></div>' +
            '<button class="btn btn-primary btn-lg btn-block" id="btn-login">Entrar</button>' +
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

        await clearCacheStorage();
        await bootstrapData();
        await loadCached();
        updateAuthIcon();

        location.hash = '#/routes';
        location.reload();
      } catch (e) {
        $('#login-error').text('Error de login/bootstrap: ' + (e.message || e));
      }
    });
  }

  /**
   * Devuelve HTML de chip de estado para un PDV.
   */
  function statusChip(s) {
    if (s === 'synced') return '<span class="badge status synced">Completado</span>';
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

    if (!store.routesAll.length) {
      try {
        await bootstrapData();
        await loadCached();
      } catch (e) {}
    }

    const routes = (store.routesAll || [])
      .slice()
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    const allPdvs = [];
    routes.forEach((r) => {
      allPdvs.push(...pdvsFromRoute(r));
    });
    const overall = summarizeProgress(allPdvs);

    $c.html(
      '<div class="container py-3">' +
        '<h5 class="mb-3">Rutas</h5>' +
        '<div class="mb-3">' +
          '<div class="d-flex align-items-center mb-1">' +
            '<small class="text-muted mr-2">Progreso</small>' +
            '<span class="badge badge-light">' + overall.done + '/' + overall.total + '</span>' +
            '<span class="ml-auto small text-muted">' + overall.pct + '%</span>' +
          '</div>' +
          '<div class="progress thin"><div class="progress-bar" style="width:' + overall.pct + '%"></div></div>' +
        '</div>' +
        '<div class="list-group" id="route-list"></div>' +
      '</div>'
    );

    const $list = $('#route-list');
    if (!routes.length) {
      $list.append('<div class="list-group-item small text-muted">No hay rutas asignadas.</div>');
    } else {
      routes.forEach((r) => {
        const prog = summarizeProgress(pdvsFromRoute(r));
        const $i = $('<div/>')
          .addClass('list-group-item list-group-item-action')
          .attr('data-id', r.id)
          .html(
            '<div class="d-flex w-100 justify-content-between align-items-center">' +
              '<div class="font-weight-bold">' + r.title + '</div>' +
              '<div class="d-flex align-items-center">' +
                '<span class="badge badge-light mr-2">' + prog.done + '/' + prog.total + '</span>' +
                '<small class="text-muted">' + prog.pct + '%</small>' +
              '</div>' +
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

    if (!store.routesAll.length) {
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

    const route = (store.routesAll || []).find(
      (r) => String(r.id) === String(selectedRoute)
    );
    if (!route) {
      location.hash = '#/routes';
      return;
    }

    const routeTitle = route.title || ('Ruta ' + selectedRoute);

    const selectedSub = (query.subrouteId || '').trim();

    const subOptions = (route.subroutes || [])
      .map((s) => ({ id: String(s.id), title: s.title }))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    const allPdvs = pdvsFromRoute(route);
    const filtered = selectedSub
      ? allPdvs.filter((p) => p.subroutes.some((sr) => String(sr.id) === String(selectedSub)))
      : allPdvs;

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
            '<label class="mr-2 mb-0 small text-muted">Filtrar</label>' +
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

        '<div class="mb-3">' +
            '<input type="text" class="form-control form-control-lg" id="pdv-search" placeholder="Buscar puntos de venta" />' +
        '</div>' +

        '<div class="list-group" id="pdv-list"></div>' +
      '</div>'
    );

    const $sel = $('#subroute-filter');
    $sel.append('<option value="">Todos</option>');
    subOptions.forEach((s) => $sel.append('<option value="' + s.id + '">' + s.title + '</option>'));
    if (selectedSub) $sel.val(selectedSub);

    const $list = $('#pdv-list');
    $list.on('click', '.list-group-item', function () {
      const id = $(this).data('id');
      if (id) location.hash = '#/form?pdvId=' + encodeURIComponent(id);
    });

    function renderRows() {
      $list.empty();
      const term = ($('#pdv-search').val() || '').toLowerCase();
      const items = allPdvs
        .filter((p) => {
          if (selectedSub && !p.subroutes.some((sr) => String(sr.id) === String(selectedSub))) return false;
          if (term) {
            const haystack = ((p.name || '') + ' ' + (p.address || '') + ' ' + (p.code || '')).toLowerCase();
            if (!haystack.includes(term)) return false;
          }
          return true;
        })
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      if (!items.length) {
        $list.append('<div class="list-group-item small text-muted">No hay PDVs para el filtro seleccionado.</div>');
        return;
      }

      items.forEach((p) => {
        const subs = p.subroutes.map((sr) => sr.title).join(', ');
        const $i = $('<div/>')
          .addClass('list-group-item list-group-item-action')
          .attr('data-id', p.id)
          .html(
            '<div class="d-flex w-100 justify-content-between align-items-start">' +
              '<div>' +
                '<div class="font-weight-bold">' + (p.code || '') + ' — ' + p.name + '</div>' +
                '<div class="small text-muted">' + (p.address || '') + '</div>' +
                '<div class="small text-muted">Sub-rutas: ' + subs + '</div>' +
              '</div>' +
              '<div>' + statusChip(p.status || 'pending') + '</div>' +
            '</div>'
          );

        $list.append($i);
      });
    }

    renderRows();
    $('#pdv-search').on('input', renderRows);

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
  function buildCameraUI(title, opts = {}) {
    const hasPhoto = !!(opts && opts.hasPhoto);
    const $w = $('<div class="mb-3"></div>');

    // Título de paso
    $w.append($('<div class="form-step-title mb-2"></div>').text(title || ''));

    // Contenedores del preview
    const $wrap = $('<div class="camera-wrap mt-2"></div>');
    const $frame = $('<div class="camera-frame"></div>');
    const $video = $('<video playsinline autoplay muted class="media rounded" style="display:none"></video>');
    const $canvas = $('<canvas class="media rounded" style="display:none"></canvas>');

    $frame.append($video).append($canvas);
    $wrap.append($frame);

    // Controles (se muestran cuando corresponde)
    const $controls = $('<div class="camera-controls mt-2 d-flex justify-content-between" style="display:none"></div>');
    const $btnShot = $('<button type="button" class="btn btn-outline-primary btn-block btn-lg" style="display:none">Capturar</button>');
    const $btnRetake = $('<button type="button" class="btn btn-outline-warning btn-lg mt-0" style="display:none">Repetir</button>');

    $controls.append($btnShot, $btnRetake);

    // Estado + botón principal
    const initMsg = hasPhoto
      ? 'Ya hay una foto almacenada. Puedes reemplazarla.'
      : 'Para iniciar, enciende la cámara.';
    const initBtn = hasPhoto ? 'Reemplazar la foto actual' : 'Encender cámara';
    const $status = $('<div class="small text-muted mt-2"></div>').text(initMsg);
    const $btnStart = $('<button type="button" class="btn btn-outline-primary btn-block btn-lg"></button>').text(initBtn);

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

      const $label = $('<label for="' + id + '" class="card select-card border"><div class="card-body p-3"><div class="title">' + opt.label + '</div></div></label>');

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
    const info = findPdvById(pdvId);
    const pdv = info ? info.pdv : null;
    const routeId = info ? info.route.id : '';
    const routeTitle = info ? (info.route.title || ('Ruta ' + info.route.id)) : '';

    const existingResp = (await idb.all('responses')).find((r) => String(r.pdvId) === String(pdvId));
    let answers = existingResp ? (existingResp.answers || {}) : {};
    let step = 0;

    const photoField = fields.find((f) => f.type === 'photo');
    let existingPhotoBase64 = existingResp ? (existingResp.photoBase64 || null) : null;
    const cam = buildCameraUI(photoField ? (photoField.label + (photoField.required ? ' *' : '')) : '', { hasPhoto: !!existingPhotoBase64 });
    let photoBlob = null;

    function shouldShowField(f) {
      if (!f.show_if) return true;
      const val = answers[f.show_if.id];
      const exp = f.show_if.value;
      return Array.isArray(exp) ? exp.includes(val) : val === exp;
    }

    function visibleFields() {
      return fields.filter(shouldShowField);
    }

    function hasValue(f) {
      const val = answers[f.id];
      if (f.type === 'photo') return !!photoBlob || !!existingPhotoBase64;
      if (f.type === 'checkbox') return Array.isArray(val) && val.length > 0;
      if (f.type === 'geo') return val && val.lat && val.lng;
      if (typeof val === 'string') return val.trim() !== '';
      return val !== undefined && val !== null;
    }

    setBreadcrumbs([
      { label: 'Rutas', href: '#/routes' },
      { label: routeTitle, href: '#/pdvs?routeId=' + encodeURIComponent(routeId) },
      { label: (pdv ? (pdv.code + ' — ' + pdv.name) : 'Formulario'), active: true },
    ]);

    $c.html(
      '<div class="container py-3">' +
        '<div class="d-flex align-items-center mb-2">' +
          '<button class="btn btn-outline-secondary btn-sm" id="btn-back">← Volver</button>' +
          '<div class="ml-auto"><span class="badge badge-primary" id="step-label">1/1</span></div>' +
        '</div>' +
        '<div class="progress thin mb-3"><div class="progress-bar" id="progressbar" style="width:0%"></div></div>' +
        '<div id="form-body"></div>' +
        '<div class="sticky-actions mt-3">' +
          '<button class="btn btn-primary btn-lg btn-block" id="btn-next">Siguiente</button>' +
        '</div>' +
      '</div>'
    );

    function updateStepUI(total, field) {
      const pct = total > 1 ? Math.round((step / (total - 1)) * 100) : 100;
      $('#progressbar').css('width', pct + '%');
      $('#step-label').text((step + 1) + '/' + total);
      $('#btn-next').text(step === (total - 1) && step !== 0 ? 'Completar' : 'Siguiente');
      if (field && field.required) {
        $('#btn-next').prop('disabled', !hasValue(field));
      } else {
        $('#btn-next').prop('disabled', false);
      }
    }

    function renderField(f, val, onChange) {
      if (f.type === 'radio' || f.type === 'checkbox') {
        return renderFieldCard(f, val, onChange);
      }
      if (f.type === 'textarea') {
    const $ta = $('<textarea class="form-control form-control-lg" rows="5"></textarea>').val(val || '');
        $ta.on('input', () => onChange($ta.val()));
        return $('<div class="mb-3"></div>')
          .append('<div class="form-step-title mb-2">' + f.label + '</div>')
          .append($ta);
      }
      if (f.type === 'number') {
    const $num = $('<input type="number" inputmode="numeric" pattern="[0-9]*" class="form-control form-control-lg">').val(val || '');
        $num.on('input', () => onChange($num.val()));
        return $('<div class="mb-3"></div>')
          .append('<div class="form-step-title mb-2">' + f.label + '</div>')
          .append($num);
      }
      const $in = $('<input type="text" class="form-control form-control-lg">').val(val || '');
      $in.on('input', () => onChange($in.val()));
      return $('<div class="mb-3"></div>')
        .append('<div class="form-step-title mb-2">' + f.label + '</div>')
        .append($in);
    }

    function geoUI(onChange, initial) {
      const $w = $('<div class="mb-3"></div>');
      const hasInit = initial && initial.lat && initial.lng;
      const btnText = hasInit ? 'Actualizar ubicación' : 'Obtener ubicación';
      const txt = hasInit
        ? 'Lat: ' + initial.lat + ', Lng: ' + initial.lng + ', Precisión: ' + initial.accuracy + ' m'
        : 'Aún sin datos';
      const $b = $('<button class="btn btn-outline-primary btn-lg btn-block" type="button"></button>').text(btnText);
      const $o = $('<div class="small text-muted mt-2"></div>').text(txt);

      $b.on('click', () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude.toFixed(6);
            const lng = pos.coords.longitude.toFixed(6);
            const acc = Math.round(pos.coords.accuracy);
            $o.text('Lat: ' + lat + ', Lng: ' + lng + ', Precisión: ' + acc + ' m');
            onChange({ lat, lng, accuracy: acc });
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

    async function mount() {
      const seq = visibleFields();
      if (seq.length === 0) return;
      if (step >= seq.length) step = seq.length - 1;

      const f = seq[step];
      const $b = $('#form-body');
      // Preservamos los eventos del widget de cámara al cambiar de paso
      cam.$root.detach();
      $b.empty();

      if (f.type === 'photo') {
        $b.append(cam.$root);
        cam.oncapture(function (blob) {
          photoBlob = blob;
          existingPhotoBase64 = null;
          updateStepUI(seq.length, f);
        });
      } else if (f.type === 'geo') {
        try { await cam.stop(); } catch (e) {}
        $b.append('<div class="form-step-title mb-2">' + f.label + '</div>')
          .append(geoUI((v) => { answers[f.id] = v; updateStepUI(seq.length, f); }, answers[f.id]));
      } else {
        try { await cam.stop(); } catch (e) {}
        const val = answers[f.id];
        $b.append(renderField(f, val, (v) => { answers[f.id] = v; updateStepUI(seq.length, f); }));
      }

      updateStepUI(seq.length, f);
    }

    async function finalize() {
      const photoBase64 = photoBlob ? await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(photoBlob);
      }) : existingPhotoBase64;

      const payload = {
        pdvId: pdvId,
        routeId: routeId,
        answers: answers,
        photoBase64: photoBase64,
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

    $('#app-main').off('click', '#btn-next').on('click', '#btn-next', async function () {
      const seq = visibleFields();
      const f = seq[step];
      if (f.required && !hasValue(f)) {
        alert('Completa el campo requerido.');
        return;
      }

      if (step === (seq.length - 1)) {
        await finalize();
        return;
      }

      step++;
      mount();
    });

    $('#app-main').off('click', '#btn-back').on('click', '#btn-back', async function () {
      if (step > 0) {
        step--;
        await mount();
      } else {
        try { await cam.stop(); } catch (e) {}
        location.hash = '#/pdvs?routeId=' + encodeURIComponent(routeId);
      }
    });

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
          photo_base64: it.photoBase64,
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

    $c.html(
      '<div class="container py-3">' +
        '<h5 class="mb-2">Pendientes</h5>' +
        '<div id="list" class="list-group mb-3"></div>' +
        '<button class="btn btn-primary btn-lg btn-block" id="btn-sync">Sincronizar</button>' +
      '</div>'
    );

    const $list = $('#list');
    const $btn = $('#btn-sync');
    $btn.prop('disabled', !rows.length);

    if (!rows.length) {
      $list.html('<div class="text-muted small">No hay registros.</div>');
    } else {
      rows.forEach((r) => {
        $list.append(
          '<div class="list-group-item d-flex justify-content-between">' +
            '<div>PDV: ' + r.pdvId + '</div>' +
            '<small>' + new Date(r.createdAt).toLocaleString() + '</small>' +
          '</div>'
        );
      });

      $btn.on('click', async function () {
        await tryProcessQueue();
        navigateTo('#/pending');
      });
    }
  }

  /**
   * Vista: Completados
   */
  async function renderSynced($c) {
    setBreadcrumbs([{ label: 'Rutas', href: '#/routes' }, { label: 'Completados', active: true }]);

    const rows = (await idb.all('responses')).filter((x) => x.status === 'synced');

    $c.html('<div class="container py-3"><h5>Completados</h5><div id="list" class="list-group"></div></div>');

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
          '<button class="btn btn-primary btn-lg ml-auto" id="btn-sync">Sincronizar ahora</button>' +
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

    const downloadBtn = hasSession()
      ? '<button class="btn btn-outline-secondary btn-lg btn-block mb-2" id="btn-download-responses">Descargar anteriores</button>'
      : '';

    $c.html(
      '<div class="container py-3">' +
        '<h5>Ajustes</h5>' +
        '<div class="text-muted small mb-3">Versión: ' + APP_VERSION + '</div>' +
        '<div class="card card-tap mb-3">' +
          '<div class="card-body">' +
            '<div>' +
              '<button class="btn btn-outline-secondary btn-lg btn-block mb-2" id="btn-update-app">Actualizar</button>' +
              downloadBtn +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    // Forzar actualización de Service Worker
    $('#btn-update-app').on('click', async function () {
      const $btn = $(this);
      $btn.prop('disabled', true).text('Actualizando…');
      const reg = await navigator.serviceWorker.getRegistration('./');
      if (reg) {
        await reg.update();
        if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
      }
      await clearCacheStorage();
      location.reload();
    });

    // Descargar respuestas previas del servidor
    if (hasSession()) {
      $('#btn-download-responses').on('click', async function () {
        await downloadPreviousResponses();
      });
    }
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

  $(document).on('click', '#btn-auth', async function () {
    if (hasSession()) {
      localStorage.removeItem('jwt');
      localStorage.removeItem('sessionActive');
      await clearCacheStorage();
      location.hash = '#/';
      location.reload();
    } else {
      location.hash = '#/';
      updateAuthIcon();
    }
  });


  // Estado inicial de breadcrumbs en DOM ready
  $(function () {
    setBreadcrumbs([{ label: 'Inicio', href: '#/', active: true }]);
    updateAuthIcon();
  });

})(jQuery);
