(function(CF) {
  CF.Store = {
        state: null,
        SCHEMA_VERSION: 3,
        _db: null,
        _queue: Promise.resolve(),
        _writesPending: 0,
        _avisadoSinIDB: false,

        clonarDefecto() { return JSON.parse(JSON.stringify(estadoInicialPorDefecto)); },

        // Fusión profunda: objetos se fusionan, arrays y primitivos los aporta "ext".
        fusionar(base, ext) {
          const esObj = v => v && typeof v === 'object' && !Array.isArray(v);
          if (!esObj(base) || !esObj(ext)) return ext === undefined ? base : ext;
          const out = { ...base };
          for (const k of Object.keys(ext)) out[k] = esObj(base[k]) && esObj(ext[k]) ? this.fusionar(base[k], ext[k]) : ext[k];
          return out;
        },

        // Valida la forma mínima del estado. Devuelve lista de errores (vacía = válido).
        validar(obj, estricto = false) {
          const err = [];
          const esObj = v => v && typeof v === 'object' && !Array.isArray(v);
          if (!esObj(obj)) return ['El contenido no es un objeto JSON.'];
          if (!esObj(obj.empresa)) err.push('Falta "empresa".');
          ['clientes', 'documentos'].forEach(k => { if (!Array.isArray(obj[k])) err.push(`Falta la lista "${k}".`); });
          ['gastos', 'proveedores', 'catalogoPrecios', 'unidades'].forEach(k => {
            if (obj[k] !== undefined && !Array.isArray(obj[k])) err.push(`"${k}" debe ser una lista.`);
          });
          const tipos = ['presupuesto', 'albaran', 'factura', 'rectificativa'];
          (Array.isArray(obj.documentos) ? obj.documentos : []).forEach((d, i) => {
            if (!esObj(d) || !d.id || !tipos.includes(d.tipo) || !Array.isArray(d.lineas)) err.push(`Documento #${i + 1} inválido.`);
          });
          (Array.isArray(obj.clientes) ? obj.clientes : []).forEach((c, i) => {
            if (!esObj(c) || !c.id || typeof c.nombre !== 'string') err.push(`Cliente #${i + 1} inválido.`);
          });
          if (estricto) {
            ['clientes', 'documentos', 'gastos', 'proveedores', 'catalogoPrecios'].forEach(k => (Array.isArray(obj[k]) ? obj[k] : []).forEach(x => {
              if (x && x.id !== undefined && !/^[\w.:-]{1,64}$/.test(String(x.id))) err.push(`Identificador no permitido en "${k}".`);
            }));
          }
          return err.slice(0, 8);
        },

        // Migraciones incrementales por versión de esquema.
        migrar(obj) {
          let v = (obj._meta && obj._meta.schemaVersion) || 1;
          if (v < 2) {
            ['gastos', 'proveedores', 'catalogoPrecios', 'unidades'].forEach(k => { if (!Array.isArray(obj[k])) obj[k] = []; });
            obj.documentos.forEach(d => { if (!Array.isArray(d.lineas)) d.lineas = []; });
            v = 2;
          }
          if (v < 3) {
            // Reconstruye el registro de cadena y los contadores a partir de las facturas oficiales existentes.
            obj.verifactuLog = []; obj.contadoresVerifactu = {};
            let prev = '0'.repeat(64);
            obj.documentos.filter(d => d.estado === 'Oficial' && d.hashVerifactu)
              .sort((x, y) => String(x.fechaHoraRegistro).localeCompare(String(y.fechaHoraRegistro))).forEach((d, i) => {
                const t = ConstruFactu.Money.totalesLegacy(d);
                obj.verifactuLog.push({ n: i + 1, docId: d.id, tipo: d.tipo, numero: d.numero, idEmisor: (obj.empresa || {}).nif || '', fecha: d.fecha,
                  cuota: Number(t.cuota.toFixed(2)), total: Number(t.total.toFixed(2)), fechaHoraRegistro: d.fechaHoraRegistro,
                  huellaAnterior: prev, huella: d.hashVerifactu, formato: 1 });
                prev = d.hashVerifactu;
                const m = String(d.numero).match(/^(.*)-(\d+)$/);
                if (m) obj.contadoresVerifactu[m[1]] = Math.max(obj.contadoresVerifactu[m[1]] || 0, parseInt(m[2], 10));
              });
            v = 3;
          }
          obj._meta = { ...(obj._meta || {}), schemaVersion: v };
          return obj;
        },

        async init() {
          this.state = this.clonarDefecto();
          await this.load();
          try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
        },

        async openIDB() {
          if (this._db) return this._db;
          return new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error('IndexedDB no disponible'));
            const req = indexedDB.open(ConstruFactu.DB_NAME, 1);
            req.onupgradeneeded = (e) => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains(ConstruFactu.STORE_NAME)) db.createObjectStore(ConstruFactu.STORE_NAME);
            };
            req.onsuccess = () => {
              const db = req.result;
              db.onclose = () => { this._db = null; };
              db.onversionchange = () => { db.close(); this._db = null; };
              this._db = db;
              resolve(db);
            };
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña'));
          });
        },

        async _leerIDB() {
          try {
            const db = await this.openIDB();
            return await new Promise((resolve, reject) => {
              const r = db.transaction(ConstruFactu.STORE_NAME, 'readonly').objectStore(ConstruFactu.STORE_NAME).get('construfactu_data');
              r.onsuccess = () => resolve(r.result || null);
              r.onerror = () => reject(r.error);
            });
          } catch (e) { return null; }
        },

        _leerLS() {
          try { return localStorage.getItem('construfactu_fallback_v2'); } catch (e) { return null; }
        },

        _parsear(raw) {
          if (raw == null) return null;
          try {
            const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return this.validar(obj).length ? { corrupto: true, raw } : { obj };
          } catch (e) { return { corrupto: true, raw }; }
        },

        async load() {
          const rawIDB = await this._leerIDB();
          const rawLS = this._leerLS();
          const cands = [this._parsear(rawIDB), this._parsear(rawLS)];
          const validos = cands.filter(c => c && c.obj);
          const corruptos = cands.filter(c => c && c.corrupto);

          // Cuarentena: nunca se pierde un dato ilegible, se aparta antes de sobrescribirlo.
          if (corruptos.length) {
            try {
              localStorage.setItem('construfactu_corrupto_' + Date.now(), typeof corruptos[0].raw === 'string' ? corruptos[0].raw : JSON.stringify(corruptos[0].raw));
            } catch (e) {}
            mostrarAviso('Se detectaron datos dañados. Se ha guardado una copia de rescate y se ha cargado la última versión válida.', 'error');
          }
          if (!validos.length) { ConstruFactu.Licensing.validarIntegridad(); return; }

          // Gana la copia más reciente (IDB en caso de empate).
          validos.sort((a, b) => String((b.obj._meta || {}).savedAt || '').localeCompare(String((a.obj._meta || {}).savedAt || '')));
          const elegido = validos[0].obj;

          if (((elegido._meta || {}).schemaVersion || 1) < this.SCHEMA_VERSION) {
            try { localStorage.setItem('construfactu_premigracion', JSON.stringify(elegido)); } catch (e) {}
            this.migrar(elegido);
          }
          this.state = this.fusionar(this.clonarDefecto(), elegido);
          ConstruFactu.Licensing.validarIntegridad();
        },

        async _persistir(snapshot) {
          let idb = false, ls = false;
          try {
            const db = await this.openIDB();
            await new Promise((resolve, reject) => {
              const tx = db.transaction(ConstruFactu.STORE_NAME, 'readwrite');
              tx.objectStore(ConstruFactu.STORE_NAME).put(snapshot, 'construfactu_data');
              tx.oncomplete = resolve;
              tx.onerror = () => reject(tx.error);
              tx.onabort = () => reject(tx.error || new Error('Transacción abortada'));
            });
            idb = true;
          } catch (e) { console.error('[Store] IndexedDB:', e); }
          try { localStorage.setItem('construfactu_fallback_v2', snapshot); ls = true; }
          catch (e) { console.warn('[Store] localStorage:', e); }
          return { idb, ls };
        },

        // Guardado serializado (sin escrituras solapadas) y con confirmación real.
        async save(opciones) {
          opciones = opciones === true ? { skipCloudSync: true } : (opciones || {});
          ConstruFactu.Licensing.validarIntegridad();
          this.state._meta = { schemaVersion: this.SCHEMA_VERSION, savedAt: new Date().toISOString() };
          const snapshot = JSON.stringify(this.state);
          const run = this._queue.then(() => this._persistir(snapshot));
          this._queue = run.catch(() => {});
          this._writesPending++;
          window.__construfactu_local_write_pending = true;
          try {
            const r = await run;
            if (!r.idb && !r.ls) {
              mostrarAviso('⚠️ NO se pudieron guardar los cambios. Descarga una copia de seguridad ahora.', 'error');
            } else if (!r.idb && !this._avisadoSinIDB) {
              this._avisadoSinIDB = true;
              mostrarAviso('Almacenamiento principal no disponible: se usa el respaldo reducido. Haz copias de seguridad con frecuencia.', 'aviso');
            }
            try { ConstruFactu.UI.actualizarBadgesMenu(); } catch (e) {}
            const guardado = r.idb || r.ls;
            if (guardado && !opciones.skipCloudSync && CF.FirebaseSync && typeof CF.FirebaseSync.subirCambiosBackground === 'function') {
              CF.FirebaseSync.subirCambiosBackground();
            }
            return guardado;
          } finally {
            this._writesPending = Math.max(0, this._writesPending - 1);
            window.__construfactu_local_write_pending = this._writesPending > 0;
          }
        }
      };
})(window.ConstruFactu);
