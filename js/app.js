
    // ==========================================
    // CONSTRUFACTU v0.9.45 - MÓDULO ESTABLE UNIFICADO
    // ==========================================
    const ConstruFactu = window.ConstruFactu;
    Object.assign(ConstruFactu, {
      DB_NAME: 'ConstruFactuDB_v0928',
      STORE_NAME: 'state_store',
      
      Store: {
        state: null,
        SCHEMA_VERSION: 3,
        _db: null,
        _queue: Promise.resolve(),
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
        async save() {
          ConstruFactu.Licensing.validarIntegridad();
          this.state._meta = { schemaVersion: this.SCHEMA_VERSION, savedAt: new Date().toISOString() };
          const snapshot = JSON.stringify(this.state);
          const run = this._queue.then(() => this._persistir(snapshot));
          this._queue = run.catch(() => {});
          const r = await run;
          if (!r.idb && !r.ls) {
            mostrarAviso('⚠️ NO se pudieron guardar los cambios. Descarga una copia de seguridad ahora.', 'error');
          } else if (!r.idb && !this._avisadoSinIDB) {
            this._avisadoSinIDB = true;
            mostrarAviso('Almacenamiento principal no disponible: se usa el respaldo reducido. Haz copias de seguridad con frecuencia.', 'aviso');
          }
          try { ConstruFactu.UI.actualizarBadgesMenu(); } catch (e) {}
          return r.idb || r.ls;
        }
      },

      Licensing: {
        validarIntegridad() {
          const st = ConstruFactu.Store.state;
          if (!st || !st.empresa) return;
          if (!st.empresa.fechaCreacionSistema) {
            st.empresa.fechaCreacionSistema = st.empresa.fechaCreacion || new Date().toISOString();
          }
        },
        obtenerEstado() {
          const emp = ConstruFactu.Store.state.empresa;
          if (!emp.fechaCreacionSistema) {
            emp.fechaCreacionSistema = new Date().toISOString();
          }
          if (emp.licenciaTipo === 'pro') {
            if (emp.licenciaExpiracion) {
              const exp = new Date(emp.licenciaExpiracion);
              const hoy = new Date();
              if (exp > hoy) {
                return { texto: 'PRO ANUAL ACTIVA', badgeClass: 'bg-emerald-100 text-emerald-900', desc: 'Licencia PRO anual activa hasta el ' + exp.toLocaleDateString(), vigente: true };
              } else {
                emp.licenciaTipo = 'prueba';
              }
            } else {
              return { texto: 'PRO ANUAL ACTIVA', badgeClass: 'bg-emerald-100 text-emerald-900', desc: 'Licencia PRO anual activa.', vigente: true };
            }
          }
          const inicio = new Date(emp.fechaCreacionSistema);
          const hoy = new Date();
          const diffTime = hoy - inicio;
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          const diasRestantes = Math.max(0, 15 - diffDays);
          
          if (diasRestantes === 0) {
            return { texto: 'PRUEBA CADUCADA', badgeClass: 'bg-rose-100 text-rose-900', desc: 'Periodo de prueba expirado. Introduce clave PRO.', vigente: false };
          }
          return { texto: `PRUEBA ${diasRestantes} DÍAS`, badgeClass: 'bg-amber-100 text-amber-900', desc: `Te quedan ${diasRestantes} días de prueba gratuita.`, vigente: true };
        },
        async activarClave(clave) {
          const c = clave.trim().toUpperCase();
          if (!c) return false;
          if (c.startsWith('CF-PRO-') || c === 'PRO2026' || c.length >= 12) {
            const fechaExp = new Date();
            fechaExp.setFullYear(fechaExp.getFullYear() + 1);
            ConstruFactu.Store.state.empresa.licenciaTipo = 'pro';
            ConstruFactu.Store.state.empresa.licenciaExpiracion = fechaExp.toISOString();
            await ConstruFactu.Store.save();
            return true;
          }
          return false;
        }
      },

    Auth: {
      ITER: 200000, MAX_INTENTOS: 5,
      _b64(buf) { let s = ''; new Uint8Array(buf).forEach(b => s += String.fromCharCode(b)); return btoa(s); },
      _unb64(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); },

      // PBKDF2-SHA256 (Web Crypto). Nunca se guarda el secreto, solo salt + hash.
      async _hash(secreto, salt, iter) {
        const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), 'PBKDF2', false, ['deriveBits']);
        return this._b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: this._unb64(salt), iterations: iter }, k, 256));
      },
      async _credencial(secreto) {
        const salt = this._b64(crypto.getRandomValues(new Uint8Array(16)));
        return { salt, iter: this.ITER, hash: await this._hash(secreto, salt, this.ITER) };
      },
      async _coincide(cred, secreto) {
        if (!cred || !cred.hash) return false;
        const h = await this._hash(secreto, cred.salt, cred.iter);
        let d = h.length ^ cred.hash.length;                       // comparación en tiempo constante
        for (let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ (cred.hash.charCodeAt(i) || 0);
        return d === 0;
      },
      _normClave: c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      _nuevaClave() {                                              // 20 símbolos de un alfabeto de 32 → sin sesgo (256/32)
        const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const b = crypto.getRandomValues(new Uint8Array(20));
        return Array.from(b, x => A[x & 31]).join('').replace(/(.{5})(?=.)/g, '$1-');
      },

      // ---- Bloqueo por intentos fallidos (persistente) ----
      _segundosBloqueo(auth) { return Math.max(0, Math.ceil(((auth.bloqueadoHasta || 0) - Date.now()) / 1000)); },
      async _fallo(auth) {
        auth.intentos = (auth.intentos || 0) + 1;
        if (auth.intentos >= this.MAX_INTENTOS) auth.bloqueadoHasta = Date.now() + Math.min(900, 30 * 2 ** (auth.intentos - this.MAX_INTENTOS)) * 1000;
        await ConstruFactu.Store.save();
      },
      async _acierto(auth) { if (auth.intentos || auth.bloqueadoHasta) { auth.intentos = 0; auth.bloqueadoHasta = 0; await ConstruFactu.Store.save(); } },

      tieneCuenta() { const a = ConstruFactu.Store.state.auth; return !!(a && a.email && (a.pin || a.password)); },

      async iniciarSesion(u, p) {
        const auth = ConstruFactu.Store.state.auth;
        if (DEV_MODE && u.trim().toLowerCase() === 'admin@construcciones-garcia.es' && p === '1234') return { ok: true };
        const seg = this._segundosBloqueo(auth);
        if (seg) return { ok: false, msg: `Demasiados intentos. Espera ${seg} s.` };
        const emailOk = u.trim().toLowerCase() === String(auth.email || '').toLowerCase();
        let pinOk = false;
        if (auth.pin) pinOk = await this._coincide(auth.pin, p);
        else if (auth.password) {                                   // migración transparente del PIN antiguo en claro
          pinOk = p === auth.password;
          if (pinOk && emailOk) { auth.pin = await this._credencial(p); delete auth.password; delete auth.masterKey; delete auth.tempRecoveryCode; await ConstruFactu.Store.save(); }
        }
        if (emailOk && pinOk) { await this._acierto(auth); return { ok: true }; }
        await this._fallo(auth);
        return { ok: false, msg: 'Credenciales incorrectas.' };
      },

      // Devuelve la clave de recuperación: mostrarla UNA vez al usuario.
      async registrar(emp, nif, email, pin) {
        if (!/^\d{4,}$/.test(pin) && pin.length < 6) throw new Error('El PIN debe tener 4+ dígitos o 6+ caracteres.');
        const st = ConstruFactu.Store.state, clave = this._nuevaClave();
        st.empresa.nombre = emp; st.empresa.nif = nif; st.empresa.fechaCreacionSistema = new Date().toISOString();
        st.auth = { email, pin: await this._credencial(pin), recuperacion: await this._credencial(this._normClave(clave)), intentos: 0, bloqueadoHasta: 0 };
        if (!(await ConstruFactu.Store.save())) throw new Error('No se pudo guardar la cuenta.');
        return clave;
      },

      async recuperar(email, clave, nuevoPin) {
        const auth = ConstruFactu.Store.state.auth;
        const seg = this._segundosBloqueo(auth);
        if (seg) throw new Error(`Demasiados intentos. Espera ${seg} s.`);
        if (!/^\d{4,}$/.test(nuevoPin) && nuevoPin.length < 6) throw new Error('El PIN debe tener 4+ dígitos o 6+ caracteres.');
        const ok = email.trim().toLowerCase() === String(auth.email || '').toLowerCase() && await this._coincide(auth.recuperacion, this._normClave(clave));
        if (!ok) { await this._fallo(auth); throw new Error('Email o clave de recuperación incorrectos.'); }
        const nueva = this._nuevaClave();                           // la clave se rota tras usarse
        auth.pin = await this._credencial(nuevoPin); auth.recuperacion = await this._credencial(this._normClave(nueva));
        delete auth.password; delete auth.masterKey; auth.intentos = 0; auth.bloqueadoHasta = 0;
        await ConstruFactu.Store.save();
        return nueva;
      },

      // Para acciones destructivas (sustituye a la "palabra maestra" y al '1234')
      async verificarPin(pin) {
        const a = ConstruFactu.Store.state.auth;
        if (a.pin) return this._coincide(a.pin, pin);
        if (a.password) return pin === a.password;
        return DEV_MODE && pin === '1234';   // solo en desarrollo y sin cuenta creada
      }
    },

      Clientes: {
        obtenerTodos() { return ConstruFactu.Store.state.clientes || []; },
        buscar(q) {
          q = (q || '').toLowerCase();
          return this.obtenerTodos().filter(c => c.nombre.toLowerCase().includes(q) || c.nif.toLowerCase().includes(q));
        },
        async guardar(datos) {
          const cs = ConstruFactu.Store.state.clientes;
          const idx = cs.findIndex(c => c.id === datos.id);
          if (idx !== -1) {
            cs[idx] = datos;
          } else {
            cs.unshift(datos);
          }
          await ConstruFactu.Store.save();
        },
        async eliminar(id) {
          ConstruFactu.Store.state.clientes = ConstruFactu.Store.state.clientes.filter(c => c.id !== id);
          await ConstruFactu.Store.save();
        },
        exportarCSV() {
          const filas = [['Nombre', 'NIF', 'Direccion', 'CP', 'Poblacion', 'Telefono', 'Movil', 'Email', 'Observaciones']];
          this.obtenerTodos().forEach(c => {
            filas.push([c.nombre, c.nif, c.direccion || '', c.cp || '', c.poblacion || '', c.telefono || '', c.movil || '', c.email || '', c.observaciones || '']);
          });
          const csv = filas.map(r => r.map(col => `"${(col || '').toString().replace(/"/g, '""')}"`).join(';')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
        }
      },

      Tarifario: {
        obtenerTodos() { return ConstruFactu.Store.state.catalogoPrecios || []; },
        buscar(q, cap) {
          q = (q || '').toLowerCase();
          return this.obtenerTodos().filter(p => {
            const matchQ = p.capitulo.toLowerCase().includes(q) || p.concepto.toLowerCase().includes(q);
            const matchCap = !cap || p.capitulo === cap;
            return matchQ && matchCap;
          });
        },
        async guardar(datos) {
          const tp = ConstruFactu.Store.state.catalogoPrecios;
          const idx = tp.findIndex(x => x.id === datos.id);
          if (idx !== -1) {
            tp[idx] = datos;
          } else {
            tp.unshift(datos);
          }
          await ConstruFactu.Store.save();
        },
        async eliminar(id) {
          ConstruFactu.Store.state.catalogoPrecios = ConstruFactu.Store.state.catalogoPrecios.filter(p => p.id !== id);
          await ConstruFactu.Store.save();
        },
        exportarCSV() {
          const filas = [['Capitulo', 'Concepto', 'Unidad', 'Precio']];
          this.obtenerTodos().forEach(p => {
            filas.push([p.capitulo, p.concepto, p.unidad, Number(p.precio).toFixed(2)]);
          });
          const csv = filas.map(r => r.map(c => `"${(c || '').toString().replace(/"/g, '""')}"`).join(';')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `tarifario_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
        }
      },

      Documentos: {
        obtenerTodos() { return ConstruFactu.Store.state.documentos || []; },
        filtrar(tipo) {
          const docs = this.obtenerTodos();
          if (tipo === 'presupuesto' || tipo === 'presupuestos') return docs.filter(d => d.tipo === 'presupuesto');
          if (tipo === 'albaran' || tipo === 'albaranes') return docs.filter(d => d.tipo === 'albaran');
          return docs.filter(d => d.tipo === 'factura' || d.tipo === 'rectificativa');
        },
        calcularTotales(doc) {
          if (doc.estado === 'Oficial') {
            const r = (ConstruFactu.Store.state.verifactuLog || []).find(x => x.docId === doc.id);
            if (r && r.formato === 1) {                       // emitida con la fórmula antigua: importes congelados
              const cuotaC = ConstruFactu.Money.aCent(r.cuota), totalC = ConstruFactu.Money.aCent(r.total);
              return { baseC: totalC - cuotaC, cuotaC, totalC, lineasC: ConstruFactu.Money.totales(doc).lineasC,
                       base: (totalC - cuotaC) / 100, cuota: cuotaC / 100, total: totalC / 100 };
            }
          }
          return ConstruFactu.Money.totales(doc);
        },
        siguienteBorrador(tipo) {
          const nums = this.obtenerTodos().filter(d => d.tipo === tipo && d.estado !== 'Oficial')
            .map(d => parseInt((String(d.numero).match(/(\d+)$/) || [0, 0])[1], 10) || 0);
          return Math.max(0, ...nums) + 1;
        },
        async guardar(docObj) {
          const docs = ConstruFactu.Store.state.documentos;
          const idx = docs.findIndex(d => d.id === docObj.id);
          if (idx !== -1 && docs[idx].estado === 'Oficial' && docs[idx] !== docObj) {
            mostrarAviso('Las facturas oficiales son inmutables. Para corregirla emite una rectificativa.', 'error');
            return false;
          }
          if (idx !== -1) {
            docs[idx] = docObj;
          } else {
            docs.unshift(docObj);
          }
          await ConstruFactu.Store.save();
        }
      },

      VeriFactu: {
        ZERO: '0'.repeat(64),
        _emitiendo: false,

        async sha256(txt) {
          if (!(globalThis.crypto && crypto.subtle)) throw new Error('El navegador no permite SHA-256 (se requiere HTTPS o localhost).');
          const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
          return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        },

        // formato 1 = legacy (sin FechaHoraRegistro) · formato 2 = actual (el sello temporal entra en el hash)
        cadena(r) {
          const base = `IDEmisor=${r.idEmisor}&NumSerie=${r.numero}&Fecha=${r.fecha}&Cuota=${Number(r.cuota).toFixed(2)}&Total=${Number(r.total).toFixed(2)}`;
          return r.formato === 1
            ? `${base}&HuellaAnterior=${r.huellaAnterior}`
            : `${base}&FechaHoraRegistro=${r.fechaHoraRegistro}&HuellaAnterior=${r.huellaAnterior}`;
        },

        async emitirOficial(docId) {
          if (this._emitiendo) throw new Error('Ya hay una emisión en curso.');
          this._emitiendo = true;
          const St = ConstruFactu.Store;
          const st = St.state;
          const doc = st.documentos.find(d => d.id === docId);
          try {
            if (!doc) throw new Error('Documento no encontrado.');
            if (doc.estado === 'Oficial') return doc;           // idempotente: nunca se emite dos veces
            if (doc.tipo !== 'factura' && doc.tipo !== 'rectificativa') throw new Error('Solo se pueden emitir facturas o rectificativas.');
            if (!(doc.lineas || []).length) throw new Error('El documento no tiene líneas.');
            if (!st.empresa.nif) throw new Error('Falta el NIF del emisor en Configuración.');
            if (!st.clientes.some(c => c.id === doc.clienteId)) throw new Error('El cliente del documento ya no existe.');
            const esRect = doc.tipo === 'rectificativa';
            if (esRect) {
              const orig = st.documentos.find(d => d.estado === 'Oficial' && d.tipo === 'factura' && d.numero === doc.facturaRectificadaNum);
              if (!orig) throw new Error('La factura rectificada debe ser una factura oficial existente.');
            }
            const serie = esRect ? (st.empresa.serieRectificativa || 'R2026') : (st.empresa.serie || 'F2026');

            // Contador persistente por serie + garantía de no colisión
            st.contadoresVerifactu = st.contadoresVerifactu || {};
            const contPrev = st.contadoresVerifactu[serie] || 0;
            let n = contPrev + 1, numero = `${serie}-${String(n).padStart(4, '0')}`;
            while (st.documentos.some(d => d.numero === numero)) { n++; numero = `${serie}-${String(n).padStart(4, '0')}`; }

            const tot = ConstruFactu.Documentos.calcularTotales(doc);
            const registro = {
              n: (st.verifactuLog || []).length + 1, docId: doc.id, tipo: doc.tipo, numero,
              idEmisor: st.empresa.nif, fecha: doc.fecha, cuota: tot.cuotaC / 100, total: tot.totalC / 100,
              fechaHoraRegistro: new Date().toISOString(),
              huellaAnterior: st.ultimoHashVerifactu || this.ZERO, formato: 2
            };
            registro.huella = await this.sha256(this.cadena(registro));

            // Estado previo para rollback si el guardado falla
            const antes = { numero: doc.numero, estado: doc.estado, hash: doc.hashVerifactu, fhr: doc.fechaHoraRegistro, ultimo: st.ultimoHashVerifactu, cont: contPrev, tenia: serie in st.contadoresVerifactu };
            doc.numero = numero; doc.estado = 'Oficial'; doc.hashVerifactu = registro.huella; doc.fechaHoraRegistro = registro.fechaHoraRegistro;
            st.verifactuLog = st.verifactuLog || [];
            st.verifactuLog.push(registro);
            st.ultimoHashVerifactu = registro.huella;
            st.contadoresVerifactu[serie] = n;

            if (!(await St.save())) {
              st.verifactuLog.pop();
              doc.numero = antes.numero; doc.estado = antes.estado; doc.hashVerifactu = antes.hash; doc.fechaHoraRegistro = antes.fhr;
              st.ultimoHashVerifactu = antes.ultimo;
              if (antes.tenia) st.contadoresVerifactu[serie] = antes.cont; else delete st.contadoresVerifactu[serie];
              throw new Error('No se pudo guardar el registro. La factura NO se ha emitido.');
            }
            return doc;
          } finally { this._emitiendo = false; }
        },

        // Auditoría completa de la cadena. Acepta un estado externo (p. ej. un backup antes de restaurarlo).
        async verificarCadena(st = ConstruFactu.Store.state) {
          const errores = [], log = st.verifactuLog || [], docs = st.documentos || [];
          let prev = this.ZERO;
          for (let i = 0; i < log.length; i++) {
            const r = log[i], et = `${r.numero || '#' + (i + 1)}`;
            if (r.n !== i + 1) errores.push(`${et}: secuencia del registro alterada.`);
            if (r.huellaAnterior !== prev) errores.push(`${et}: cadena rota (la huella anterior no coincide).`);
            try {
              if ((await this.sha256(this.cadena(r))) !== r.huella) errores.push(`${et}: la huella no corresponde a sus datos.`);
            } catch (e) { errores.push(`${et}: no se pudo calcular el hash (${e.message}).`); break; }
            prev = r.huella;
            const d = docs.find(x => x.id === r.docId);
            if (!d || d.estado !== 'Oficial') { errores.push(`${et}: el documento oficial falta o cambió de estado.`); continue; }
            const L = r.formato === 1 ? ConstruFactu.Money.totalesLegacy(d) : null;
            const t = L ? { cuotaC: ConstruFactu.Money.aCent(L.cuota), totalC: ConstruFactu.Money.aCent(L.total) } : ConstruFactu.Money.totales(d);
            if (d.numero !== r.numero || d.fecha !== r.fecha || d.hashVerifactu !== r.huella ||
                Math.abs(t.cuotaC - ConstruFactu.Money.aCent(r.cuota)) > (r.formato === 1 ? 1 : 0) || Math.abs(t.totalC - ConstruFactu.Money.aCent(r.total)) > (r.formato === 1 ? 1 : 0)) {
              errores.push(`${et}: el documento fue modificado después de emitirse.`);
            }
          }
          const enLog = new Set(log.map(r => r.docId));
          docs.filter(d => d.estado === 'Oficial' && !enLog.has(d.id)).forEach(d => errores.push(`${d.numero}: factura oficial sin registro en la cadena.`));
          const nums = docs.filter(d => d.estado === 'Oficial').map(d => d.numero);
          if (new Set(nums).size !== nums.length) errores.push('Hay números de factura oficiales duplicados.');
          if (log.length && st.ultimoHashVerifactu !== prev) errores.push('La última huella almacenada no coincide con el final de la cadena.');
          return { ok: errores.length === 0, total: log.length, errores };
        }
      },

      UI: {
        ocultarTodas() {
          ['view-login', 'view-menu', 'view-clientes', 'view-cliente-form', 'view-docs', 'view-doc-editor', 'view-gastos', 'view-gasto-form', 'view-tarifario', 'view-tarifario-form', 'view-estado', 'view-config', 'view-ayuda'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
          });
        },
        sesionActiva: false, vistaActual: 'login',
        irA(destino, opts) {
          this.ocultarTodas();
          if (destino === 'login') {
            document.getElementById('view-login').classList.remove('hidden');
          } else if (destino === 'menu') {
            this.actualizarBadgesMenu();
            document.getElementById('view-menu').classList.remove('hidden');
          } else if (destino === 'clientes') {
            renderClientes();
            document.getElementById('view-clientes').classList.remove('hidden');
          } else if (destino === 'presupuestos' || destino === 'albaranes' || destino === 'facturas') {
            abrirListadoDocs(destino);
            document.getElementById('view-docs').classList.remove('hidden');
          } else if (destino === 'gastos') {
            renderGastos();
            document.getElementById('view-gastos').classList.remove('hidden');
          } else if (destino === 'tarifario') {
            renderTarifario();
            document.getElementById('view-tarifario').classList.remove('hidden');
          } else if (destino === 'estado') {
            renderEstado();
            document.getElementById('view-estado').classList.remove('hidden');
          } else if (destino === 'config') {
            cargarVistaConfig();
            document.getElementById('view-config').classList.remove('hidden');
          } else if (destino === 'ayuda') {
            document.getElementById('view-ayuda').classList.remove('hidden');
          }
          window.scrollTo(0, 0);
          setTimeout(this.actualizarBotonScroll, 80);
          const previa = this.vistaActual;
          this.sesionActiva = destino !== 'login'; this.vistaActual = destino;
          if (!(opts && opts.sinHistorial)) {
            try {
              if (destino === 'login' || (destino === 'menu' && previa === 'login')) history.replaceState({ cf: 1, v: destino }, '');
              else if (destino !== previa) history.pushState({ cf: 1, v: destino }, '');
            } catch (e) {}
          }
        },
        actualizarBadgesMenu() {
          const state = ConstruFactu.Store.state;
          document.getElementById('menu-empresa-nombre').textContent = state.empresa.nombre;
          document.getElementById('menu-empresa-nif').textContent = `NIF: ${state.empresa.nif}`;
          
          const lic = ConstruFactu.Licensing.obtenerEstado();
          const menuBadge = document.querySelector('#view-menu .bg-amber-100');
          if (menuBadge) {
            menuBadge.textContent = lic.texto;
            menuBadge.className = `text-[10px] font-extrabold px-2 py-0.5 rounded ${lic.badgeClass}`;
          }
          document.getElementById('badge-presupuestos').textContent = state.documentos.filter(d => d.tipo === 'presupuesto').length;
          document.getElementById('badge-albaranes').textContent = state.documentos.filter(d => d.tipo === 'albaran').length;
          document.getElementById('badge-facturas').textContent = state.documentos.filter(d => d.tipo === 'factura' || d.tipo === 'rectificativa').length;
          document.getElementById('badge-clientes').textContent = `${state.clientes.length} registrados`;
          document.getElementById('badge-gastos').textContent = `${state.gastos.length} gastos`;
          document.getElementById('badge-tarifario').textContent = `${(state.catalogoPrecios || []).length} partidas`;
          
          const logoBox = document.getElementById('menu-logo-box');
          if (state.empresa.logo) {
            logoBox.innerHTML = `<img src="${/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(state.empresa.logo) ? state.empresa.logo : ''}" class="w-full h-full object-cover">`;
          } else {
            logoBox.textContent = 'CF';
          }
        },
        actualizarBotonScroll() {
          const btn = document.getElementById('btn-scroll-float');
          if (!btn) return;
          if (document.documentElement.scrollHeight > window.innerHeight + 90) btn.classList.remove('hidden');
          else btn.classList.add('hidden');
        }
      }
    });

    /* ═══ DINERO: aritmética en céntimos enteros (sin errores de coma flotante) ═══
       · Importes en euros → céntimos con redondeo "half away from zero" (el habitual en facturación).
       · Cantidad: hasta 3 decimales. Precio unitario: hasta 4 decimales (p. ej. 0,125 €/ud).
       · Cada línea se redondea a céntimo; Base = Σ líneas; IVA = redondeo(Base × tipo); Total = Base + IVA. */
    /* ═══ EVENTOS DELEGADOS ═══
       Sustituye a los onclick/oninput/onchange inline. El HTML declara: data-click="funcion" data-click-args='[...]'
       (idem data-input / data-change). Argumentos especiales: "$this" = el elemento, "$value" = su valor.
       Solo se pueden invocar funciones globales propias de la app (nunca nativas como eval/alert). */
    (function iniciarEventosDelegados() {
      ['click', 'input', 'change'].forEach(ev => document.addEventListener(ev, (e) => {
        for (let el = e.target; el && el.nodeType === 1; el = el.parentElement) {      // burbujeo igual que un onclick inline
          const nombre = el.getAttribute('data-' + ev);
          if (!nombre) continue;
          const fn = Object.prototype.hasOwnProperty.call(window, nombre) ? window[nombre] : null;
          if (typeof fn !== 'function' || /\[native code\]/.test(Function.prototype.toString.call(fn))) { console.error('[eventos] acción no permitida o inexistente:', nombre); continue; }
          let args = [];
          try { args = JSON.parse(el.getAttribute('data-' + ev + '-args') || '[]'); } catch (err) { console.error('[eventos] argumentos inválidos en', nombre); continue; }
          args = args.map(a => a === '$this' ? el : a === '$value' ? el.value : a);
          try {
            const r = fn.apply(window, args);
            if (r && typeof r.catch === 'function') r.catch(err => console.error('[' + nombre + ']', err));
          } catch (err) { console.error('[' + nombre + ']', err); }
          if (e.cancelBubble) break;
        }
      }));
    })();

    // Botón "atrás" del móvil/navegador: vuelve a la vista anterior y cierra visor PDF y ventanas emergentes.
    window.addEventListener('popstate', (e) => {
      const UI = ConstruFactu.UI;
      let destino = e.state && e.state.cf ? e.state.v : 'login';
      if (!UI.sesionActiva) destino = 'login';                                 // sin sesión nunca se muestra nada privado
      document.getElementById('view-pdf').classList.add('hidden');
      document.querySelectorAll('[id^="modal-"]').forEach(m => m.classList.add('hidden'));
      if (destino === 'login' && UI.sesionActiva) { history.pushState({ cf: 1, v: UI.vistaActual }, ''); return; }   // «atrás» en el menú no cierra sesión
      UI.irA(destino, { sinHistorial: true });
    });
    try { history.replaceState({ cf: 1, v: 'login' }, ''); } catch (e) {}

    // SheetJS solo se descarga cuando se importa/exporta Excel (la app arranca sin red).
    let _xlsxPromise = null;
    function cargarXLSX() {
      if (typeof XLSX !== 'undefined') return Promise.resolve();
      if (!_xlsxPromise) _xlsxPromise = new Promise((ok, ko) => {
        const sc = document.createElement('script');
        sc.src = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js';
        sc.onload = ok;
        sc.onerror = () => { _xlsxPromise = null; ko(new Error('Para usar Excel se necesita conexión la primera vez.')); };
        document.head.appendChild(sc);
      });
      return _xlsxPromise;
    }

    /* ═══ DIÁLOGOS PROPIOS (sustituyen a alert / confirm / prompt) ═══
       Todos devuelven una Promesa y se encolan (nunca se solapan). Los textos se insertan con textContent:
       sin riesgo de inyección. Accesibles: role="dialog", foco atrapado, Esc cancela, Enter acepta. */
    const Dialogo = {
      _cola: Promise.resolve(),
      _enc(fn) { const p = this._cola.then(fn); this._cola = p.catch(() => {}); return p; },
      _el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; },
      _tipo(m) { m = String(m).trimStart(); if (m.startsWith('✅')) return 'ok'; if (m.startsWith('❌') || /^No se pudo/.test(m)) return 'error'; if (m.startsWith('⚠')) return 'aviso'; return 'info'; },
      _limpiar(m) { return String(m).replace(/^\s*(✅|❌|⚠️|⚠|🔑)\s*/, ''); },

      _abrir({ titulo, mensaje, tipo = 'info', botones, principal, alEscapar, input, extra }) {
        return this._enc(() => new Promise(resolve => {
          const previo = document.activeElement, refs = {};
          const raiz = this._el('div', 'fixed inset-0 z-[200] bg-slate-900/60 flex items-end sm:items-center justify-center p-4');
          raiz.id = 'dlg-root';
          const panel = this._el('div', 'w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto');
          panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'dlg-titulo');
          const colores = { ok: 'bg-emerald-100 text-emerald-700', error: 'bg-rose-100 text-rose-700', aviso: 'bg-amber-100 text-amber-700', info: 'bg-slate-100 text-slate-700' };
          const iconos = { ok: '✓', error: '✕', aviso: '!', info: 'i' };
          const cab = this._el('div', 'flex items-center gap-3');
          cab.appendChild(this._el('div', 'w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-extrabold text-sm ' + colores[tipo], iconos[tipo]));
          const h = this._el('h2', 'font-extrabold text-base text-slate-900', titulo); h.id = 'dlg-titulo'; cab.appendChild(h);
          panel.appendChild(cab);
          const msg = this._el('p', 'text-sm text-slate-700 whitespace-pre-line', mensaje); msg.id = 'dlg-msg'; panel.appendChild(msg);
          let campo = null;
          if (input) {
            campo = this._el('input', 'w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm');
            campo.id = 'dlg-input'; campo.type = input.tipo || 'text'; campo.autocomplete = 'off';
            if (input.placeholder) campo.placeholder = input.placeholder;
            panel.appendChild(campo);
          }
          if (extra) panel.appendChild(extra.nodo);
          const cerrar = (valor) => { document.removeEventListener('keydown', teclas, true); raiz.remove(); if (previo && previo.focus) { try { previo.focus(); } catch (e) {} } resolve(valor); };
          const estilos = { primario: 'bg-slate-900 text-white', peligro: 'bg-rose-600 text-white', neutro: 'bg-slate-100 text-slate-700' };
          const fila = this._el('div', 'flex flex-wrap gap-2 justify-end pt-1');
          botones.forEach(b => {
            const btn = this._el('button', 'px-4 py-2.5 rounded-xl font-extrabold text-xs disabled:opacity-40 ' + estilos[b.estilo], b.texto);
            btn.type = 'button'; btn.setAttribute('data-dlg', b.id); if (b.deshabilitado) btn.disabled = true;
            btn.addEventListener('click', () => b.accion(cerrar, campo, btn));
            refs[b.id] = btn; fila.appendChild(btn);
          });
          panel.appendChild(fila); raiz.appendChild(panel);
          if (extra && extra.alCrear) extra.alCrear(refs);
          const teclas = (e) => {
            if (e.key === 'Escape' && alEscapar) { e.preventDefault(); e.stopPropagation(); alEscapar(cerrar); }
            else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'TEXTAREA' && principal && !refs[principal].disabled) { e.preventDefault(); e.stopPropagation(); refs[principal].click(); }
            else if (e.key === 'Tab') {                                       // el foco no sale del diálogo
              const f = Array.from(panel.querySelectorAll('button:not([disabled]), input, a[href]'));
              if (!f.length) return;
              const i = f.indexOf(document.activeElement);
              if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
            }
          };
          document.addEventListener('keydown', teclas, true);
          document.body.appendChild(raiz);
          (campo || refs[principal] || fila.firstChild).focus();
        }));
      }
    };

    function avisar(mensaje, opc = {}) {
      const tipo = opc.tipo || Dialogo._tipo(mensaje);
      const titulos = { ok: 'Listo', error: 'No se pudo completar', aviso: 'Atención', info: 'Aviso' };
      return Dialogo._abrir({ titulo: opc.titulo || titulos[tipo], mensaje: Dialogo._limpiar(mensaje), tipo, principal: 'aceptar', alEscapar: c => c(),
        botones: [{ id: 'aceptar', texto: 'Entendido', estilo: 'primario', accion: c => c() }] });
    }
    function confirmar(mensaje, opc = {}) {                                  // → true / false
      return Dialogo._abrir({ titulo: opc.titulo || (opc.peligro ? 'Confirmar acción' : 'Confirmar'), mensaje: Dialogo._limpiar(mensaje), tipo: opc.peligro ? 'aviso' : 'info',
        principal: 'aceptar', alEscapar: c => c(false),
        botones: [{ id: 'cancelar', texto: opc.cancelar || 'Cancelar', estilo: 'neutro', accion: c => c(false) },
                  { id: 'aceptar', texto: opc.aceptar || 'Aceptar', estilo: opc.peligro ? 'peligro' : 'primario', accion: c => c(true) }] });
    }
    function pedirTexto(mensaje, opc = {}) {                                 // → texto / null si se cancela
      return Dialogo._abrir({ titulo: opc.titulo || 'Introduce un valor', mensaje: Dialogo._limpiar(mensaje), tipo: opc.peligro ? 'aviso' : 'info',
        input: { tipo: opc.tipo || 'text', placeholder: opc.placeholder }, principal: 'aceptar', alEscapar: c => c(null),
        botones: [{ id: 'cancelar', texto: 'Cancelar', estilo: 'neutro', accion: c => c(null) },
                  { id: 'aceptar', texto: opc.aceptar || 'Aceptar', estilo: opc.peligro ? 'peligro' : 'primario', accion: (c, campo) => c(campo.value) }] });
    }
    function mostrarClaveRecuperacion(clave) {                               // no se puede cerrar sin confirmar que se ha guardado
      const caja = Dialogo._el('div', 'space-y-3');
      const k = Dialogo._el('div', 'font-mono text-base font-extrabold tracking-wider text-center bg-slate-50 border border-slate-200 rounded-xl p-3 select-all break-all', clave);
      k.id = 'dlg-clave'; caja.appendChild(k);
      const lab = Dialogo._el('label', 'flex items-start gap-2 text-xs text-slate-700 cursor-pointer');
      const chk = Dialogo._el('input', 'mt-0.5'); chk.type = 'checkbox'; chk.id = 'dlg-clave-ok';
      lab.appendChild(chk); lab.appendChild(Dialogo._el('span', null, 'He guardado la clave en un lugar seguro, fuera de este dispositivo.'));
      caja.appendChild(lab);
      return Dialogo._abrir({
        titulo: 'Tu clave de recuperación', tipo: 'aviso', principal: 'continuar',
        mensaje: 'Es la única forma de restablecer tu PIN si lo olvidas. Se muestra solo esta vez: guárdala en papel o en un gestor de contraseñas.',
        extra: { nodo: caja, alCrear: (refs) => { chk.addEventListener('change', () => { refs.continuar.disabled = !chk.checked; }); } },
        botones: [
          { id: 'copiar', texto: 'Copiar', estilo: 'neutro', accion: async (c, campo, btn) => { try { await navigator.clipboard.writeText(clave); btn.textContent = 'Copiada ✓'; } catch (e) { btn.textContent = 'No se pudo copiar'; } } },
          { id: 'descargar', texto: 'Descargar .txt', estilo: 'neutro', accion: () => {
              const txt = `ConstruFactu · Clave de recuperación\nEmpresa: ${(ConstruFactu.Store.state.empresa || {}).nombre || ''}\nClave: ${clave}\nGenerada: ${new Date().toLocaleString('es-ES')}\n\nGuarda este archivo fuera del dispositivo. Quien tenga esta clave puede restablecer el PIN.\n`;
              const url = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })), a = document.createElement('a');
              a.href = url; a.download = 'ConstruFactu_clave_recuperacion.txt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); } },
          { id: 'continuar', texto: 'Continuar', estilo: 'primario', deshabilitado: true, accion: c => c(true) }]
      });
    }

    function mostrarAviso(msg, tipo = 'info') {
      const colores = { error: 'bg-rose-700', aviso: 'bg-amber-600', info: 'bg-slate-900' };
      const el = document.createElement('div');
      el.setAttribute('role', 'alert');
      el.className = `fixed top-3 left-1/2 -translate-x-1/2 z-[100] max-w-sm w-[92%] px-4 py-3 rounded-xl text-white text-xs font-bold shadow-xl ${colores[tipo] || colores.info}`;
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), tipo === 'error' ? 9000 : 5000);
    }

    let albaranesSeleccionados = new Set();
    let vistaAnteriorEditor = 'facturas';
    let docActualPDFNombre = 'Documento_A4.pdf';
    let docActualPDFId = null;
    let lineasEditorTemp = [];

    const cpEspanaDB = {
      "41800": "Sanlúcar la Mayor (Sevilla)",
      "41110": "Bollullos de la Mitación (Sevilla)",
      "41001": "Sevilla", "41002": "Sevilla", "41003": "Sevilla", "41004": "Sevilla", "41005": "Sevilla",
      "41006": "Sevilla", "41007": "Sevilla", "41008": "Sevilla", "41009": "Sevilla", "41010": "Sevilla",
      "41011": "Sevilla", "41012": "Sevilla", "41013": "Sevilla", "41014": "Sevilla", "41015": "Sevilla",
      "41016": "Sevilla", "41018": "Sevilla", "41019": "Sevilla", "41020": "Sevilla",
      "41927": "Mairena del Aljarafe (Sevilla)", "41940": "Tomares (Sevilla)", "41900": "Camas (Sevilla)",
      "28001": "Madrid", "08001": "Barcelona", "45001": "Toledo", "50001": "Zaragoza",
      "41": "Provincia de Sevilla", "28": "Comunidad de Madrid", "08": "Barcelona", "45": "Toledo", "50": "Zaragoza"
    };

    function validarYBuscarCP(val) {
      const limpio = val.replace(/\D/g, '').substring(0, 5);
      document.getElementById('cli-cp').value = limpio;
    }

    function validarYBuscarCPModal(val) {
      const limpio = val.replace(/\D/g, '').substring(0, 5);
      document.getElementById('mcli-cp').value = limpio;
    }

    function soloNumeros(input) {
      input.value = input.value.replace(/\D/g, '');
    }

    function accionScrollFlotante() {
      window.scrollBy({ top: 300, behavior: 'smooth' });
    }
    window.addEventListener('scroll', ConstruFactu.UI.actualizarBotonScroll);

    function cambiarTabLogin(tab) {
      document.getElementById('form-login-pane').classList.toggle('hidden', tab !== 'login');
      document.getElementById('form-registro-pane').classList.toggle('hidden', tab !== 'registro');
      document.getElementById('form-recuperar-pane').classList.toggle('hidden', tab !== 'recuperar');
      
      const btnLog = document.getElementById('tab-btn-login');
      const btnReg = document.getElementById('tab-btn-registro');
      if (tab === 'login') {
        btnLog.className = "flex-1 py-2 rounded-lg text-xs font-extrabold bg-slate-900 text-white shadow-sm transition";
        btnReg.className = "flex-1 py-2 rounded-lg text-xs font-extrabold text-slate-600 transition";
      } else if (tab === 'registro') {
        btnReg.className = "flex-1 py-2 rounded-lg text-xs font-extrabold bg-slate-900 text-white shadow-sm transition";
        btnLog.className = "flex-1 py-2 rounded-lg text-xs font-extrabold text-slate-600 transition";
      }
    }

    async function iniciarSesion() {
      const u = document.getElementById('login-user').value.trim();
      const p = document.getElementById('login-pass').value;
      if (!u || !p) { avisar('Introduce usuario y contraseña.'); return; }
      const r = await ConstruFactu.Auth.iniciarSesion(u, p);
      if (r.ok) { document.getElementById('login-pass').value = ''; irA('menu'); }
      else avisar(r.msg || 'Usuario o contraseña incorrectos.');
    }


    async function registrarNuevaCuenta() {
      const emp = document.getElementById('reg-empresa').value.trim();
      const nif = document.getElementById('reg-nif').value.trim().toUpperCase();
      const email = document.getElementById('reg-email').value.trim();
      const pass = document.getElementById('reg-pass').value;
      if (!emp || !nif || !email || !pass) { avisar('Rellena todos los campos del registro.'); return; }
      try {
        const clave = await ConstruFactu.Auth.registrar(emp, nif, email, pass);
        await mostrarClaveRecuperacion(clave);
        document.getElementById('login-user').value = email;
        document.getElementById('login-pass').value = '';
        cambiarTabLogin('login');
      } catch (e) { avisar(e.message); }
    }

    async function enviarRecuperacion() {
      const email = document.getElementById('rec-email').value.trim();
      const clave = document.getElementById('rec-clave').value;
      const pin = document.getElementById('rec-pin').value;
      if (!email || !clave || !pin) { avisar('Rellena email, clave de recuperación y PIN nuevo.'); return; }
      try {
        const nueva = await ConstruFactu.Auth.recuperar(email, clave, pin);
        ['rec-clave', 'rec-pin'].forEach(i => document.getElementById(i).value = '');
        await mostrarClaveRecuperacion(nueva);
        avisar('PIN restablecido. Ya puedes acceder.');
        cambiarTabLogin('login');
      } catch (e) { avisar(e.message); }
    }


    function fmtCant(n) {                                   // 3,5 · 1.250 · 0,125 (formato es-ES, hasta 3 decimales)
      return (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 3 });
    }
    function fmtPrecio(n) {                                  // precio unitario: 2 a 4 decimales (0,125 €), para que cuadre con el importe
      return (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' €';
    }
    function fmtEuro(n) {
      return (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }

    function getCliente(id) {
      return ConstruFactu.Store.state.clientes.find(c => c.id === id) || { nombre: 'Cliente', nif: '-', direccion: '', cp: '', poblacion: '', telefono: '', movil: '', email: '', observaciones: '' };
    }

    function calcTotalesDoc(doc) {
      return ConstruFactu.Documentos.calcularTotales(doc);
    }

    function ocultarTodasLasVistas() {
      ConstruFactu.UI.ocultarTodas();
    }

    function irA(destino, opts) {
      ConstruFactu.UI.irA(destino, opts);
    }

    function actualizarBadgesMenu() {
      ConstruFactu.UI.actualizarBadgesMenu();
    }

    // CLIENTES

	function renderClientes() {
      const q = (document.getElementById('buscar-cliente').value || '').toLowerCase();
      const cont = document.getElementById('lista-clientes');
      const filtrados = ConstruFactu.Clientes.buscar(q);
      cont.innerHTML = filtrados.map(c => `
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div class="flex justify-between items-start">
            <div>
              <h3 class="font-extrabold text-slate-900 text-base whitespace-pre-line">${escapeHTML(c.nombre)}</h3>
              <p class="text-xs text-slate-600">NIF: <strong>${escapeHTML(c.nif)}</strong></p>
              <p class="text-xs text-slate-500 mt-0.5">${escapeHTML(c.poblacion)} (${escapeHTML(c.cp || '')})</p>
              ${c.observaciones ? `<div class="mt-2 p-2 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-900">📝 <strong>Notas:</strong> ${escapeHTML(c.observaciones)}</div>` : ''}
            </div>
            <button data-click="abrirFormCliente" data-click-args='["${escapeHTML(c.id)}"]' class="p-2 rounded-xl bg-slate-100 text-slate-700 text-sm">✏️</button>
          </div>
          <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
            <button data-click="crearDocParaCliente" data-click-args='["${escapeHTML(c.id)}","presupuesto"]' class="py-2 rounded-xl bg-blue-50 text-blue-800 font-extrabold text-[11px]">PRESUPUESTO</button>
            <button data-click="crearDocParaCliente" data-click-args='["${escapeHTML(c.id)}","albaran"]' class="py-2 rounded-xl bg-amber-50 text-amber-800 font-extrabold text-[11px]">ALBARÁN</button>
            <button data-click="crearDocParaCliente" data-click-args='["${escapeHTML(c.id)}","factura"]' class="py-2 rounded-xl bg-slate-900 text-white font-extrabold text-[11px]">FACTURA</button>
          </div>
        </div>
      `).join('');
    }

    function abrirFormCliente(id = '') {
      ocultarTodasLasVistas();
      document.getElementById('view-cliente-form').classList.remove('hidden');
      if (id) {
        const c = ConstruFactu.Store.state.clientes.find(x => x.id === id);
        document.getElementById('titulo-form-cliente').textContent = 'EDITAR CLIENTE';
        document.getElementById('cli-id').value = c.id;
        document.getElementById('cli-nombre').value = c.nombre;
        document.getElementById('cli-nif').value = c.nif;
        document.getElementById('cli-direccion').value = c.direccion || '';
        document.getElementById('cli-cp').value = c.cp || '';
        document.getElementById('cli-poblacion').value = c.poblacion || '';
        document.getElementById('cli-telefono').value = c.telefono || '';
        document.getElementById('cli-movil').value = c.movil || '';
        document.getElementById('cli-email').value = c.email || '';
        document.getElementById('cli-observaciones').value = c.observaciones || '';
        document.getElementById('btn-eliminar-cliente').classList.remove('hidden');
      } else {
        document.getElementById('titulo-form-cliente').textContent = 'NUEVO CLIENTE';
        ['cli-id', 'cli-nombre', 'cli-nif', 'cli-direccion', 'cli-cp', 'cli-poblacion', 'cli-telefono', 'cli-movil', 'cli-email', 'cli-observaciones'].forEach(f => document.getElementById(f).value = '');
        document.getElementById('btn-eliminar-cliente').classList.add('hidden');
      }
    }

    async function guardarCliente() {
      const id = document.getElementById('cli-id').value;
      const nombre = document.getElementById('cli-nombre').value.trim();
      const nif = document.getElementById('cli-nif').value.trim().toUpperCase();
      const cp = document.getElementById('cli-cp').value.trim();
      const poblacion = document.getElementById('cli-poblacion').value.trim();
      
      if (!nombre || !nif) { avisar('El nombre y el NIF son obligatorios.'); return; }
      if (cp && cp.length !== 5) { avisar('El código postal de España debe tener exactamente 5 cifras.'); return; }

      const datos = {
        id: id || 'c' + Date.now(),
        nombre,
        nif,
        direccion: document.getElementById('cli-direccion').value.trim(),
        cp,
        poblacion,
        telefono: document.getElementById('cli-telefono').value.trim(),
        movil: document.getElementById('cli-movil').value.trim(),
        email: document.getElementById('cli-email').value.trim(),
        observaciones: document.getElementById('cli-observaciones').value.trim()
      };

      await ConstruFactu.Clientes.guardar(datos);
      irA('clientes');
    }

    async function eliminarCliente() {
      const id = document.getElementById('cli-id').value;
      if ((await confirmar('¿Eliminar este cliente?', { aceptar: 'Eliminar', peligro: true }))) {
        await ConstruFactu.Clientes.eliminar(id);
        irA('clientes');
      }
    }

    function crearDocParaCliente(clienteId, tipo) {
      vistaAnteriorEditor = tipo === 'presupuesto' ? 'presupuestos' : (tipo === 'albaran' ? 'albaranes' : 'facturas');
      abrirEditorDocumento(null, tipo, clienteId);
    }

    function exportarClientesCSV() { ConstruFactu.Clientes.exportarCSV(); }
    function abrirModalImportarClientes() {
      document.getElementById('file-import-clientes').value = '';
      document.getElementById('txt-file-name-cli-info').textContent = 'Ningún archivo seleccionado';
      document.getElementById('modal-importar-clientes').classList.remove('hidden');
    }
    function cerrarModalImportarClientes() { document.getElementById('modal-importar-clientes').classList.add('hidden'); }
    function actualizarNombreArchivoClientesImportado(input) {
      const txt = document.getElementById('txt-file-name-cli-info');
      txt.textContent = input.files && input.files[0] ? input.files[0].name : 'Ningún archivo seleccionado';
    }
    async function descargarPlantillaClientesXLSX() {
      try { await cargarXLSX(); } catch (e) { avisar(e.message); return; }
      const ws_data = [
        ["Nombre", "NIF", "Direccion", "CP", "Poblacion", "Telefono", "Movil", "Email", "Observaciones"],
        ["Promociones Aljarafe S.L.", "B91234567", "Avda. de Europa 44", "41927", "Mairena del Aljarafe (Sevilla)", "954000000", "654321987", "obras@aljarafe.es", "Forma de pago transferencia 30 días"]
      ];
      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clientes");
      XLSX.writeFile(wb, "plantilla_clientes_ejemplo.xlsx");
    }

    async function ejecutarImportacionClientes() {
      const input = document.getElementById('file-import-clientes');
      if (!input.files || !input.files[0]) { avisar('Selecciona un archivo Excel (.xlsx, .xls) o CSV.'); return; }
      const file = input.files[0];
      const strategy = document.getElementById('import-cli-duplicados-strategy').value;
      const reader = new FileReader();

      reader.onload = async function(e) {
        try {
          await cargarXLSX();
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          if (!jsonRows || jsonRows.length < 2) { avisar('Archivo sin filas válidas.'); return; }

          const header = jsonRows[0].map(h => (h || '').toString().trim().toLowerCase());
          const idxNom = header.findIndex(h => h.includes('nombre') || h.includes('razon'));
          const idxNif = header.findIndex(h => h.includes('nif') || h.includes('cif'));
          const idxDir = header.findIndex(h => h.includes('dir') || h.includes('calle'));
          const idxCp = header.findIndex(h => h.includes('cp') || h.includes('postal'));
          const idxPob = header.findIndex(h => h.includes('pob') || h.includes('ciudad'));
          const idxTel = header.findIndex(h => h.includes('tel') || h.includes('fijo'));
          const idxMov = header.findIndex(h => h.includes('mov') || h.includes('móvil'));
          const idxEmail = header.findIndex(h => h.includes('email') || h.includes('correo'));
          const idxObs = header.findIndex(h => h.includes('obs') || h.includes('nota') || h.includes('pago'));

          if (idxNom === -1 || idxNif === -1) { avisar('Faltan columnas obligatorias ("Nombre" y "NIF").'); return; }

          let nuevos = [];
          for (let i = 1; i < jsonRows.length; i++) {
            const row = jsonRows[i];
            if (!row || row.length === 0) continue;
            const nombre = row[idxNom] ? row[idxNom].toString().trim() : '';
            const nif = row[idxNif] ? row[idxNif].toString().trim().toUpperCase() : '';
            if (nombre && nif) {
              nuevos.push({
                nombre, nif,
                direccion: idxDir !== -1 && row[idxDir] ? row[idxDir].toString().trim() : '',
                cp: idxCp !== -1 && row[idxCp] ? row[idxCp].toString().trim() : '',
                poblacion: idxPob !== -1 && row[idxPob] ? row[idxPob].toString().trim() : '',
                telefono: idxTel !== -1 && row[idxTel] ? row[idxTel].toString().trim() : '',
                movil: idxMov !== -1 && row[idxMov] ? row[idxMov].toString().trim() : '',
                email: idxEmail !== -1 && row[idxEmail] ? row[idxEmail].toString().trim() : '',
                observaciones: idxObs !== -1 && row[idxObs] ? row[idxObs].toString().trim() : ''
              });
            }
          }

          let added = 0, updated = 0, skipped = 0;
          for (let nc of nuevos) {
            const existingIdx = ConstruFactu.Store.state.clientes.findIndex(c => c.nif.toLowerCase() === nc.nif.toLowerCase());
            if (existingIdx !== -1) {
              if (strategy === 'actualizar') {
                Object.assign(ConstruFactu.Store.state.clientes[existingIdx], nc);
                updated++;
              } else if (strategy === 'omitir') {
                skipped++;
              } else {
                ConstruFactu.Store.state.clientes.unshift({ id: 'c' + Date.now() + Math.random().toString(36).substring(2, 6), ...nc });
                added++;
              }
            } else {
              ConstruFactu.Store.state.clientes.unshift({ id: 'c' + Date.now() + Math.random().toString(36).substring(2, 6), ...nc });
              added++;
            }
          }
          await ConstruFactu.Store.save();
          cerrarModalImportarClientes();
          renderClientes();
          avisar(`Importación completada:
- Nuevos: ${added}
- Actualizados: ${updated}
- Omitidos: ${skipped}`);
        } catch (err) { avisar('Error al procesar archivo.'); }
      };
      reader.readAsArrayBuffer(file);
    }

    function abrirModalNuevoCliente() {
      ['mcli-nombre', 'mcli-nif', 'mcli-direccion', 'mcli-cp', 'mcli-poblacion', 'mcli-telefono', 'mcli-movil', 'mcli-email', 'mcli-observaciones'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      document.getElementById('modal-nuevo-cliente').classList.remove('hidden');
    }
    function cerrarModalNuevoCliente() { document.getElementById('modal-nuevo-cliente').classList.add('hidden'); }
    async function guardarClienteDesdeModal() {
      const nombre = document.getElementById('mcli-nombre').value.trim();
      const nif = document.getElementById('mcli-nif').value.trim().toUpperCase();
      const cp = document.getElementById('mcli-cp').value.trim();
      if (!nombre || !nif) { avisar('Nombre y NIF obligatorios.'); return; }
      const nuevoId = 'c' + Date.now();
      const nuevoCli = {
        id: nuevoId, nombre, nif,
        direccion: document.getElementById('mcli-direccion').value.trim(),
        cp,
        poblacion: document.getElementById('mcli-poblacion').value.trim(),
        telefono: document.getElementById('mcli-telefono').value.trim(),
        movil: document.getElementById('mcli-movil').value.trim(),
        email: document.getElementById('mcli-email').value.trim(),
        observaciones: document.getElementById('mcli-observaciones').value.trim()
      };
      await ConstruFactu.Clientes.guardar(nuevoCli);
      poblarSelectClientes(nuevoId);
      cerrarModalNuevoCliente();
    }

    let filtroListadoActual = 'presupuestos';
    function abrirListadoDocs(seccion) {
      filtroListadoActual = seccion;
      albaranesSeleccionados.clear();
      const titulos = { presupuestos: 'PRESUPUESTOS', albaranes: 'ALBARANES', facturas: 'FACTURAS Y RECTIFICATIVAS' };
      document.getElementById('docs-titulo').textContent = titulos[seccion];
      renderListadoDocs();
    }

    function renderListadoDocs() {
      const docs = ConstruFactu.Documentos.filtrar(filtroListadoActual);
      const cont = document.getElementById('lista-docs');
      if (!docs.length) { cont.innerHTML = `<div class="text-center text-xs text-slate-400 py-8">No hay documentos.</div>`; return; }

      cont.innerHTML = docs.map(d => {
        const cli = getCliente(d.clienteId);
        const tot = calcTotalesDoc(d);
        const esRect = d.tipo === 'rectificativa';
        const esOficial = (d.tipo === 'factura' || esRect) && d.estado === 'Oficial';
        let botonRectificar = (esOficial && d.tipo === 'factura') ? `<button data-click="iniciarRectificativa" data-click-args='["${escapeHTML(d.id)}"]' class="py-2 px-3 rounded-xl bg-indigo-50 text-indigo-800 border font-extrabold text-xs">🔄 RECTIFICAR</button>` : '';

        return `
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div class="flex items-start justify-between mb-2">
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-extrabold text-slate-900 text-sm">${escapeHTML(d.numero)}</span>
                  <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700">${esRect ? 'RECTIFICATIVA' : escapeHTML(d.estado)}</span>
                </div>
                <p class="text-xs font-bold text-slate-700 mt-0.5 whitespace-pre-line">${escapeHTML(cli.nombre)}</p>
                ${d.obra ? `<p class="text-xs text-indigo-700 font-semibold mt-0.5">Obra: ${escapeHTML(d.obra)}</p>` : ''}
                <p class="text-[11px] text-slate-400">Fecha: ${escapeHTML(d.fecha)}</p>
              </div>
              <div class="text-right"><div class="text-base font-extrabold text-slate-900">${fmtEuro(tot.total)}</div></div>
            </div>
            <div class="flex gap-2 pt-2 border-t border-slate-100 items-center">
              <button data-click="verPDFDocumento" data-click-args='["${escapeHTML(d.id)}"]' class="flex-1 py-2 rounded-xl bg-slate-100 text-slate-800 font-bold text-xs">📄 PDF A4</button>
              ${!esOficial ? `<button data-click="editarDocumentoExistente" data-click-args='["${escapeHTML(d.id)}"]' class="flex-1 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs">ABRIR</button>` : ''}
              ${botonRectificar}
              ${!esOficial ? `<button data-click="eliminarDocumento" data-click-args='["${escapeHTML(d.id)}"]' class="py-2 px-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs" title="Eliminar">🗑️</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    async function iniciarRectificativa(originalId) {
      const orig = ConstruFactu.Store.state.documentos.find(d => d.id === originalId);
      if (!orig) return;
      const numRects = ConstruFactu.Documentos.siguienteBorrador('rectificativa');
      const serieRect = ConstruFactu.Store.state.empresa.serieRectificativa || 'R2026';
      const rectDoc = {
        id: 'd' + Date.now(), tipo: 'rectificativa',
        numero: `BORRADOR-${serieRect}-${String(numRects).padStart(3, '0')}`,
        clienteId: orig.clienteId, obra: orig.obra || '', fecha: new Date().toISOString().split('T')[0],
        iva: orig.iva, estado: 'Proforma', facturaRectificadaNum: orig.numero, motivoRectificacion: 'Devolución / Corrección',
        observaciones: `Rectificación de ${orig.numero}`,
        lineas: orig.lineas.map(l => ({ ...l, cantidad: -Math.abs(Number(l.cantidad) || 1) }))
      };
      await ConstruFactu.Documentos.guardar(rectDoc);
      vistaAnteriorEditor = 'facturas';
      abrirEditorDocumento(rectDoc.id, 'rectificativa');
    }

    function nuevoDocumento() {
      const mapaTipo = { presupuestos: 'presupuesto', albaranes: 'albaran', facturas: 'factura' };
      vistaAnteriorEditor = filtroListadoActual;
      abrirEditorDocumento(null, mapaTipo[filtroListadoActual]);
    }

    function editarDocumentoExistente(id) {
      const doc = ConstruFactu.Store.state.documentos.find(d => d.id === id);
      if (!doc) return;
      vistaAnteriorEditor = doc.tipo === 'presupuesto' ? 'presupuestos' : (doc.tipo === 'albaran' ? 'albaranes' : 'facturas');
      abrirEditorDocumento(id, doc.tipo);
    }

    function volverDeEditor() { irA(vistaAnteriorEditor); }

    function poblarSelectClientes(seleccionarId = '') {
      const selCli = document.getElementById('doc-cliente');
      selCli.innerHTML = ConstruFactu.Clientes.obtenerTodos().map(c => `<option value="${c.id}">${escapeHTML(c.nombre.split('\n').join(' '))} (${escapeHTML(c.nif)})</option>`).join('');
      if (seleccionarId) selCli.value = seleccionarId;
    }

    function abrirEditorDocumento(docId, tipo, clientePreseleccionado = '') {
      ocultarTodasLasVistas();
      document.getElementById('view-doc-editor').classList.remove('hidden');
      let doc = docId ? ConstruFactu.Store.state.documentos.find(d => d.id === docId) : null;
      const esRect = tipo === 'rectificativa';

      document.getElementById('rectificativa-fields').classList.toggle('hidden', !esRect);
      document.getElementById('wrapper-doc-estado').classList.toggle('hidden', tipo !== 'presupuesto');

      if (doc) {
        poblarSelectClientes(doc.clienteId);
        document.getElementById('doc-id').value = doc.id;
        document.getElementById('doc-tipo').value = doc.tipo;
        document.getElementById('doc-obra').value = doc.obra || '';
        document.getElementById('doc-fecha').value = doc.fecha;
        document.getElementById('doc-iva').value = String(doc.iva);
        
        if (tipo === 'presupuesto') document.getElementById('doc-estado').value = doc.estado || 'Borrador';
        if (esRect) {
          document.getElementById('doc-factura-rectificada').value = doc.facturaRectificadaNum || '';
          document.getElementById('doc-motivo-rectificacion').value = doc.motivoRectificacion || '';
        }
        lineasEditorTemp = JSON.parse(JSON.stringify(doc.lineas || []));
      } else {
        poblarSelectClientes(clientePreseleccionado);
        document.getElementById('doc-id').value = '';
        document.getElementById('doc-tipo').value = tipo;
        document.getElementById('doc-obra').value = '';
        document.getElementById('doc-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('doc-iva').value = '21';
        if (tipo === 'presupuesto') document.getElementById('doc-estado').value = 'Borrador';
        lineasEditorTemp = [{ concepto: '', cantidad: 1, unidad: 'ud', precio: 0 }];
      }

      document.getElementById('btn-convertir-proforma').classList.toggle('hidden', tipo === 'factura' || tipo === 'rectificativa');
      document.getElementById('btn-emitir-verifactu').classList.toggle('hidden', tipo !== 'factura' && tipo !== 'rectificativa');

      renderLineasEditor();
      recalcularEditor();
    }

    function renderLineasEditor() {
      const cont = document.getElementById('editor-lineas');
      const opcionesTarifario = ConstruFactu.Tarifario.obtenerTodos().map(p => `<option value="${p.id}">${escapeHTML(p.concepto)} (${fmtEuro(p.precio)}/${escapeHTML(p.unidad)})</option>`).join('');

      cont.innerHTML = lineasEditorTemp.map((l, idx) => `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div class="flex items-center justify-between text-[11px] font-bold text-slate-500 gap-2">
            <span>Partida #${idx + 1}</span>
            <select data-change="seleccionarPartidaTarifario" data-change-args='[${idx},"$value"]' class="max-w-[150px] sm:max-w-[200px] px-2 py-1 rounded border bg-white text-[10px] text-indigo-700 font-bold truncate">
              <option value="">📐 Tarifario...</option>
              ${opcionesTarifario}
            </select>
          </div>
          <div class="flex gap-2 items-center">
            <textarea rows="2" placeholder="Descripción..." data-input="actualizarCampoLinea" data-input-args='[${idx},"concepto","$value"]' class="flex-1 px-3 py-2 rounded-lg border bg-white text-xs font-semibold resize-y">${escapeHTML(l.concepto)}</textarea>
            <button data-click="eliminarLineaEditor" data-click-args='[${idx}]' class="px-2.5 py-2 rounded-lg bg-rose-100 text-rose-700 font-bold text-xs">✕</button>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div><label class="block text-[9px] font-bold uppercase text-slate-400">Cantidad</label><input type="number" step="0.01" value="${l.cantidad}" data-input="actualizarCampoLinea" data-input-args='[${idx},"cantidad","$value"]' class="w-full px-2 py-1 rounded-lg border text-xs font-bold"></div>
            <div><label class="block text-[9px] font-bold uppercase text-slate-400">Unidad</label><input type="text" value="${escapeHTML(l.unidad)}" data-input="actualizarCampoLinea" data-input-args='[${idx},"unidad","$value"]' class="w-full px-2 py-1 rounded-lg border text-xs font-bold"></div>
            <div><label class="block text-[9px] font-bold uppercase text-slate-400">Precio (€)</label><input type="number" step="0.01" value="${l.precio}" data-input="actualizarCampoLinea" data-input-args='[${idx},"precio","$value"]' class="w-full px-2 py-1 rounded-lg border text-xs font-bold"></div>
          </div>
        </div>
      `).join('');
    }

    function seleccionarPartidaTarifario(idx, tarId) {
      if (!tarId) return;
      const part = ConstruFactu.Tarifario.obtenerTodos().find(p => p.id === tarId);
      if (!part) return;
      lineasEditorTemp[idx].concepto = part.concepto;
      lineasEditorTemp[idx].unidad = part.unidad;
      lineasEditorTemp[idx].precio = part.precio;
      renderLineasEditor();
      recalcularEditor();
    }

    function actualizarCampoLinea(idx, campo, val) {
      lineasEditorTemp[idx][campo] = campo === 'unidad' || campo === 'concepto' ? val : (Number(val) || 0);
      recalcularEditor();
    }

    function agregarLineaEditor() {
      lineasEditorTemp.push({ concepto: '', cantidad: 1, unidad: 'ud', precio: 0 });
      renderLineasEditor();
    }

    function eliminarLineaEditor(idx) {
      if (lineasEditorTemp.length === 1) return;
      lineasEditorTemp.splice(idx, 1);
      renderLineasEditor();
      recalcularEditor();
    }

    function recalcularEditor() {
      const iva = Number(document.getElementById('doc-iva').value) || 0;
      const t = ConstruFactu.Money.totales({ lineas: lineasEditorTemp, iva });
      document.getElementById('ed-base').textContent = fmtEuro(t.base);
      document.getElementById('ed-iva-cuota').textContent = fmtEuro(t.cuota);
      document.getElementById('ed-total').textContent = fmtEuro(t.total);
    }

    async function eliminarDocumento(id) {
      const S = ConstruFactu.Store.state;
      const doc = S.documentos.find(d => d.id === id);
      if (!doc) return;
      // Doble candado: por estado y por pertenecer a la cadena Veri*factu (aunque alguien alterase el estado)
      if (doc.estado === 'Oficial' || (S.verifactuLog || []).some(r => r.docId === id)) {
        avisar('Las facturas oficiales son inmutables y no se pueden eliminar. Para corregirla, emite una rectificativa.', { tipo: 'error' });
        return;
      }
      if (!(await confirmar(`¿Eliminar ${doc.tipo} ${doc.numero}?\n\nEsta acción no se puede deshacer.`, { aceptar: 'Eliminar', peligro: true }))) return;
      const idx = S.documentos.findIndex(d => d.id === id);
      if (idx === -1) return;
      S.documentos.splice(idx, 1);
      if (!(await ConstruFactu.Store.save())) {                       // si no se pudo guardar, no se pierde nada
        S.documentos.splice(idx, 0, doc);
        avisar('No se pudo guardar el borrado. El documento se ha conservado.', { tipo: 'error' });
        return;
      }
      renderListadoDocs();
      actualizarBadgesMenu();
    }

    async function guardarDocumento(vistaPrevia = false) {
      const id = document.getElementById('doc-id').value;
      const tipo = document.getElementById('doc-tipo').value;
      const clienteId = document.getElementById('doc-cliente').value;
      if (!clienteId) { avisar('Selecciona un cliente.'); return null; }

      const lineasLimpias = lineasEditorTemp.map(({ concepto, cantidad, unidad, precio }) => ({ concepto, cantidad, unidad, precio }));
      const obraVal = document.getElementById('doc-obra').value.trim();
      const esRect = tipo === 'rectificativa';

      let estadoVal = 'Borrador';
      if (tipo === 'presupuesto') estadoVal = document.getElementById('doc-estado').value;
      else if (tipo === 'albaran') estadoVal = 'Emitido';
      else if (tipo === 'factura' || tipo === 'rectificativa') estadoVal = 'Proforma';

      let docObj;
      if (id) {
        const existente = ConstruFactu.Store.state.documentos.find(d => d.id === id);
        docObj = {
          ...existente, clienteId, obra: obraVal, fecha: document.getElementById('doc-fecha').value,
          iva: Number(document.getElementById('doc-iva').value), 
          estado: tipo === 'presupuesto' ? estadoVal : existente.estado,
          lineas: lineasLimpias,
          facturaRectificadaNum: esRect ? document.getElementById('doc-factura-rectificada').value.trim().toUpperCase() : undefined,
          motivoRectificacion: esRect ? document.getElementById('doc-motivo-rectificacion').value.trim() : undefined
        };
      } else {
        const prefijos = { presupuesto: 'P2026-', albaran: 'A2026-', factura: 'PROFORMA-', rectificativa: 'BORRADOR-RECT-' };
        const count = ConstruFactu.Documentos.siguienteBorrador(tipo);
        docObj = {
          id: 'd' + Date.now(), tipo, numero: prefijos[tipo] + String(count).padStart(3, '0'),
          clienteId, obra: obraVal, fecha: document.getElementById('doc-fecha').value, iva: Number(document.getElementById('doc-iva').value),
          estado: estadoVal,  lineas: lineasLimpias,
          facturaRectificadaNum: esRect ? document.getElementById('doc-factura-rectificada').value.trim().toUpperCase() : undefined,
          motivoRectificacion: esRect ? document.getElementById('doc-motivo-rectificacion').value.trim() : undefined
        };
      }
      if ((await ConstruFactu.Documentos.guardar(docObj)) === false) return null;
      
      if (vistaPrevia === 'pdf') {
        verPDFDocumento(docObj.id); // Abre la vista preliminar flotante A4
      } else if (vistaPrevia !== 'silent') {
        volverDeEditor();
      }
      return docObj;
    }

    async function convertirAProformaDesdeEditor() {
      const doc = await guardarDocumento('silent');
      if (!doc) return;
      if (doc.estado === 'Oficial') return;
      doc.tipo = 'factura';
      const count = ConstruFactu.Documentos.siguienteBorrador('factura');
      doc.numero = `PROFORMA-${String(count).padStart(3, '0')}`;
      doc.estado = 'Proforma';
      await ConstruFactu.Store.save();
      vistaAnteriorEditor = 'facturas';
      abrirEditorDocumento(doc.id, 'factura');
    }

    function abrirModalVerifactu() { document.getElementById('modal-verifactu').classList.remove('hidden'); }
    function cerrarModalVerifactu() { document.getElementById('modal-verifactu').classList.add('hidden'); }

    async function confirmarEmisionVerifactu() {
      const btn = document.querySelector('#modal-verifactu button[onclick*="confirmarEmision"]');
      if (btn) btn.disabled = true;
      try {
        const doc = await guardarDocumento('silent');
        if (!doc) return;
        cerrarModalVerifactu();
        const actualizado = await ConstruFactu.VeriFactu.emitirOficial(doc.id);
        irA('facturas');
        verPDFDocumento(actualizado.id);
      } catch (e) {
        avisar('❌ No se pudo emitir: ' + e.message);
      } finally { if (btn) btn.disabled = false; }
    }

    async function verificarIntegridadVerifactu() {
      const r = await ConstruFactu.VeriFactu.verificarCadena();
      if (r.ok) avisar(`✅ Cadena Veri*factu íntegra.\nRegistros verificados: ${r.total}`);
      else avisar(`⚠️ Se detectaron ${r.errores.length} incidencia(s):\n\n- ` + r.errores.slice(0, 10).join('\n- '));
    }

    function verPDFDocumento(id) {
      const doc = ConstruFactu.Store.state.documentos.find(d => d.id === id);
      if (!doc) return;
      const cli = getCliente(doc.clienteId);
      const tot = calcTotalesDoc(doc);
      const esRect = doc.tipo === 'rectificativa';
      const esOficial = (doc.tipo === 'factura' || esRect) && doc.estado === 'Oficial';

      docActualPDFNombre = (doc.numero || 'documento') + '.pdf';
      docActualPDFId = doc.id;
      const empresa = ConstruFactu.Store.state.empresa || {};

      const printArea = document.getElementById('print-area');
      printArea.innerHTML = '';

      const container = document.createElement('div');
      container.className = 'flex flex-col justify-between';
      container.style.minHeight = '265mm';

      const topDiv = document.createElement('div');

      const headerDiv = document.createElement('div');
      headerDiv.className = 'border-b-2 border-slate-900 pb-5 mb-6 flex justify-between items-start';

      const leftHead = document.createElement('div');
      leftHead.className = 'flex items-center gap-4';
      if (empresa.logo) {
        const img = document.createElement('img');
        img.src = empresa.logo;
        img.className = 'w-14 h-14 object-cover rounded-xl border';
        leftHead.appendChild(img);
      }
      const titleInfo = document.createElement('div');
      const h1 = document.createElement('h1');
      h1.className = 'font-extrabold text-xl text-slate-900';
      h1.textContent = empresa.nombre || '';
      const pNif = document.createElement('p');
      pNif.className = 'text-xs text-slate-600';
      pNif.innerHTML = 'NIF: <strong>' + (empresa.nif || '') + '</strong>';
      const pDir = document.createElement('p');
      pDir.className = 'text-xs text-slate-600';
      pDir.textContent = empresa.direccion || '';
      titleInfo.appendChild(h1);
      titleInfo.appendChild(pNif);
      titleInfo.appendChild(pDir);
      leftHead.appendChild(titleInfo);

      const rightHead = document.createElement('div');
      rightHead.className = 'text-right';
      const badge = document.createElement('span');
      badge.className = 'px-3 py-1.5 rounded bg-slate-900 text-white font-extrabold text-xs uppercase';
      badge.textContent = doc.tipo;
      const pNum = document.createElement('p');
      pNum.className = 'font-extrabold text-lg text-slate-900 mt-2';
      pNum.textContent = doc.numero;
      const pFec = document.createElement('p');
      pFec.className = 'text-xs text-slate-600';
      pFec.innerHTML = 'Fecha: <strong>' + doc.fecha + '</strong>';
      rightHead.appendChild(badge);
      rightHead.appendChild(pNum);
      rightHead.appendChild(pFec);

      headerDiv.appendChild(leftHead);
      headerDiv.appendChild(rightHead);
      topDiv.appendChild(headerDiv);

      const cliBox = document.createElement('div');
      cliBox.className = 'bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6';
      cliBox.innerHTML = `
        <div class="text-[11px] font-bold uppercase text-slate-400 mb-1">Cliente</div>
        <div class="font-extrabold text-base text-slate-900 whitespace-pre-line">${escapeHTML(cli.nombre)}</div>
        <div class="text-xs text-slate-700 mt-1">NIF: <strong>${escapeHTML(cli.nif)}</strong></div>
        ${cli.direccion ? `<div class="text-xs text-slate-600">${escapeHTML(cli.direccion)}</div>` : ''}
        <div class="text-xs text-slate-600">${escapeHTML(cli.cp || '')} ${escapeHTML(cli.poblacion || '')}</div>
      `;
      topDiv.appendChild(cliBox);
      if (esRect || doc.obra) {
        const info = document.createElement('div');
        info.className = 'text-xs text-slate-700 mb-5 space-y-0.5';
        info.innerHTML = (esRect ? `<div><strong>Rectifica la factura:</strong> ${escapeHTML(doc.facturaRectificadaNum || '')}${doc.motivoRectificacion ? ' · ' + escapeHTML(doc.motivoRectificacion) : ''}</div>` : '')
          + (doc.obra ? `<div><strong>Obra:</strong> ${escapeHTML(doc.obra)}</div>` : '');
        topDiv.appendChild(info);
      }

      const table = document.createElement('table');
      table.className = 'w-full text-left border-collapse mb-6';
      let tableHTML = `
        <thead>
          <tr class="border-b-2 border-slate-800 text-xs uppercase bg-slate-100">
            <th class="py-2.5 px-2">Partida / Concepto</th>
            <th class="py-2.5 px-2 text-right">Cant.</th>
            <th class="py-2.5 px-2 text-right">Precio</th>
            <th class="py-2.5 px-2 text-right">Importe</th>
          </tr>
        </thead>
        <tbody class="divide-y text-xs">
      `;
      (doc.lineas || []).forEach(l => {
        tableHTML += `
          <tr>
            <td class="py-3 px-2">${escapeHTML(l.concepto)}</td>
            <td class="py-3 px-2 text-right whitespace-nowrap">${fmtCant(l.cantidad)} ${escapeHTML(l.unidad)}</td>
            <td class="py-3 px-2 text-right whitespace-nowrap">${fmtPrecio(l.precio)}</td>
            <td class="py-3 px-2 text-right font-bold whitespace-nowrap">${fmtEuro(ConstruFactu.Money.lineaC(l.cantidad, l.precio) / 100)}</td>
          </tr>
        `;
      });
      tableHTML += '</tbody>';
      table.innerHTML = tableHTML;
      topDiv.appendChild(table);

      const totDiv = document.createElement('div');
      totDiv.className = 'flex justify-end mb-6 no-corte';
      totDiv.innerHTML = `
        <div class="w-72 bg-slate-50 p-4 rounded-xl border space-y-1.5 text-right">
          <div class="flex justify-between text-xs"><span>Base:</span><strong>${fmtEuro(tot.base)}</strong></div>
          <div class="flex justify-between text-xs"><span>IVA (${doc.iva}%):</span><strong>${fmtEuro(tot.cuota)}</strong></div>
          <div class="flex justify-between text-lg font-extrabold pt-2 border-t"><span>TOTAL:</span><span>${fmtEuro(tot.total)}</span></div>
        </div>
      `;
      topDiv.appendChild(totDiv);
   
      container.appendChild(topDiv);

      if (esOficial) {
        const bottomDiv = document.createElement('div');
        bottomDiv.className = 'no-corte';
        bottomDiv.innerHTML = `
          <div class="pt-4 border-t-2 border-dashed flex items-center justify-between mt-4">
            <div class="space-y-1">
              <div class="text-[10px] font-extrabold text-slate-800 uppercase">VERI*FACTU - Sistema Informático de Facturación</div>
              <div class="text-[9px] text-slate-600">Huella SHA-256: <span class="font-mono text-[8px]">${doc.hashVerifactu || ''}</span></div>
              <div class="text-[9px] text-slate-500">Sede Electrónica AEAT - Verificable mediante código QR</div>
            </div>
            <div id="qrcode-${doc.id}" class="p-1 bg-white border rounded shadow-sm flex items-center justify-center w-20 h-20"></div>
          </div>
        `;
        container.appendChild(bottomDiv);

        setTimeout(() => {
          const el = document.getElementById('qrcode-' + doc.id);
          if (el && !el.hasChildNodes()) {
            try {
              new QRCode(el, {
                text: urlQrVerifactu(doc, empresa, tot),
                width: 72,
                height: 72
              });
            } catch(err) {
              el.textContent = "QR Veri*factu";
            }
          }
        }, 150);
      }

      printArea.appendChild(container);
      document.getElementById('view-pdf').classList.remove('hidden');
    }

    function escapeHTML(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
      );
    }

    /* ═══ PDF VECTORIAL (jsPDF + autoTable) ═══
       Texto real y seleccionable (~30 KB), cabecera de tabla repetida en cada página, filas que no se parten.
       Independiente de la pantalla: siempre A4. La fuente estándar (Helvetica) admite Windows-1252. */
    function urlQrVerifactu(doc, empresa, tot) {
      return "https://www.agenciatributaria.gob.es/verifactu?nif=" + encodeURIComponent(empresa.nif || '') + "&num=" + encodeURIComponent(doc.numero) + "&fecha=" + encodeURIComponent(doc.fecha) + "&total=" + tot.total.toFixed(2) + "&huella=" + encodeURIComponent(doc.hashVerifactu || '');
    }
    function pdfTxt(v) {
      return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/[^\n\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?');
    }
    function prepararLogo(src) {                                // data URL de imagen → PNG ≤256 px, aplanado sobre blanco, con su proporción
      return new Promise(res => {
        if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src || '')) return res(null);
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, 256 / Math.max(im.naturalWidth, im.naturalHeight, 1)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
          const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);   // aplana la transparencia (evita bordes oscuros)
          g.drawImage(im, 0, 0, c.width, c.height);
          res({ data: c.toDataURL('image/png'), w: c.width, h: c.height });
        };
        im.onerror = () => res(null); im.src = src;
      });
    }
    function dibujarQRVector(pdf, texto, x, y, tam) {           // QR como cuadrados vectoriales (nítido a cualquier zoom)
      const q = new QRCode(document.createElement('div'), { text: texto, width: 128, height: 128, correctLevel: QRCode.CorrectLevel.M });
      const o = q._oQRCode, n = o.getModuleCount(), m = tam / n;
      pdf.setFillColor(0, 0, 0);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (o.isDark(r, c)) pdf.rect(x + c * m, y + r * m, m + 0.02, m + 0.02, 'F');
    }

    async function generarPDFVectorial(docId) {
      const S = ConstruFactu.Store.state;
      const d = S.documentos.find(x => x.id === docId);
      if (!d) throw new Error('Documento no encontrado');
      if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('No se pudo cargar la librería de PDF.');
      const cli = getCliente(d.clienteId) || {}, tot = calcTotalesDoc(d), emp = S.empresa || {};
      const esRect = d.tipo === 'rectificativa', esOficial = (d.tipo === 'factura' || esRect) && d.estado === 'Oficial';
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const L = 16, R = 194, W = R - L, TOP = 14, BOT = 18, PH = 297;
      const C = { ink: [15, 23, 42], gris: [71, 85, 105], suave: [100, 116, 139], claro: [148, 163, 184], f1: [241, 245, 249], f2: [248, 250, 252], borde: [226, 232, 240], ambar: [120, 53, 15] };
      const txt = (c) => pdf.setTextColor(c[0], c[1], c[2]);
      const fuente = (est, tam) => { pdf.setFont('helvetica', est); pdf.setFontSize(tam); };
      const etiqueta = (lab, val, x, y, tam) => { fuente('normal', tam); pdf.text(lab, x, y); const w = pdf.getTextWidth(lab); fuente('bold', tam); pdf.text(val, x + w, y); };
      pdf.setProperties({ title: pdfTxt(d.numero), subject: pdfTxt(d.tipo), author: pdfTxt(emp.nombre), creator: 'ConstruFactu' });

      // ── Cabecera ──
      let y = TOP, xT = L;
      const logo = await prepararLogo(emp.logo);
      if (logo) { const k = Math.min(14 / logo.w, 14 / logo.h), w = logo.w * k, h = logo.h * k; pdf.addImage(logo.data, 'PNG', L + (14 - w) / 2, y + (14 - h) / 2, w, h); xT = L + 18; }
      fuente('bold', 15); txt(C.ink);
      const nom = pdf.splitTextToSize(pdfTxt(emp.nombre || ''), 94); pdf.text(nom, xT, y + 5.5);
      let yl = y + 5.5 + (nom.length - 1) * 6 + 4.8;
      txt(C.gris); etiqueta('NIF: ', pdfTxt(emp.nif || ''), xT, yl, 8.5); txt(C.gris);
      fuente('normal', 8.5); const dir = pdf.splitTextToSize(pdfTxt(emp.direccion || ''), 94);
      if (emp.direccion) { pdf.text(dir, xT, yl + 4.2); yl += 4.2 * dir.length; }
      const tipo = pdfTxt(d.tipo || '').toUpperCase(); fuente('bold', 8);
      const wb = pdf.getTextWidth(tipo) + 7; pdf.setFillColor(...C.ink); pdf.roundedRect(R - wb, y, wb, 6.5, 1.2, 1.2, 'F');
      pdf.setTextColor(255, 255, 255); pdf.text(tipo, R - wb + 3.5, y + 4.5);
      txt(C.ink); fuente('bold', 13); pdf.text(pdfTxt(d.numero || ''), R, y + 13.5, { align: 'right' });
      fuente('bold', 8.5); const wf = pdf.getTextWidth(pdfTxt(d.fecha || '')); fuente('normal', 8.5); txt(C.gris);
      pdf.text('Fecha: ', R - wf - pdf.getTextWidth('Fecha: '), y + 18.2); fuente('bold', 8.5); pdf.text(pdfTxt(d.fecha || ''), R, y + 18.2, { align: 'right' });
      const yh = Math.max(yl, y + 18.2) + 4; pdf.setDrawColor(...C.ink); pdf.setLineWidth(0.6); pdf.line(L, yh, R, yh);
      y = yh + 6;

      // ── Caja de cliente (se mide primero y se dibuja después) ──
      const bloqueCliente = (dibujar, y0) => {
        let yy = y0 + 4.5; const x = L + 5, ancho = W - 10;
        fuente('bold', 6.8); txt(C.claro); if (dibujar) pdf.text('CLIENTE', x, yy + 0.8); yy += 4.6;
        fuente('bold', 11); txt(C.ink); const nm = pdf.splitTextToSize(pdfTxt(cli.nombre || ''), ancho);
        if (dibujar) pdf.text(nm, x, yy + 1.6); yy += 4.9 * nm.length + 0.6;
        fuente('normal', 8.5); txt(C.gris);
        if (dibujar) { fuente('normal', 8.5); pdf.text('NIF: ', x, yy + 1); const w = pdf.getTextWidth('NIF: '); fuente('bold', 8.5); pdf.text(pdfTxt(cli.nif || ''), x + w, yy + 1); fuente('normal', 8.5); } yy += 4.2;
        if (cli.direccion) { const ls = pdf.splitTextToSize(pdfTxt(cli.direccion), ancho); if (dibujar) pdf.text(ls, x, yy + 1); yy += 4 * ls.length; }
        const loc = pdfTxt(((cli.cp || '') + ' ' + (cli.poblacion || '')).trim()); if (loc) { if (dibujar) pdf.text(loc, x, yy + 1); yy += 4; }
        return yy + 3.5 - y0;
      };
      const hc = bloqueCliente(false, y);
      pdf.setFillColor(...C.f2); pdf.setDrawColor(...C.borde); pdf.setLineWidth(0.25); pdf.roundedRect(L, y, W, hc, 2.5, 2.5, 'FD');
      bloqueCliente(true, y); y += hc + 5;

      // ── Rectificativa / obra ──
      fuente('normal', 8.5); txt(C.ink);
      if (esRect) { const t = pdfTxt('Rectifica la factura: ' + (d.facturaRectificadaNum || '') + (d.motivoRectificacion ? '  ·  Motivo: ' + d.motivoRectificacion : '')); const ls = pdf.splitTextToSize(t, W); fuente('bold', 8.5); pdf.text(ls, L, y + 1); y += 4.2 * ls.length; }
      if (d.obra) { const ls = pdf.splitTextToSize(pdfTxt('Obra: ' + d.obra), W); fuente('normal', 8.5); pdf.text(ls, L, y + 1); y += 4.2 * ls.length; }
      if (esRect || d.obra) y += 3;

      // ── Tabla (cabecera repetida en cada página; las filas no se parten) ──
      pdf.autoTable({
        startY: y, margin: { top: TOP, bottom: BOT, left: L, right: 210 - R },
        head: [['PARTIDA / CONCEPTO', 'CANT.', 'PRECIO', 'IMPORTE']],
        body: (d.lineas || []).map((l, i) => [pdfTxt(l.concepto), fmtCant(l.cantidad) + ' ' + pdfTxt(l.unidad), fmtPrecio(l.precio), fmtEuro(tot.lineasC[i] / 100)]),
        theme: 'plain', showHead: 'everyPage', rowPageBreak: 'avoid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 }, textColor: C.ink, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: C.f1, textColor: C.ink, fontStyle: 'bold', fontSize: 7.5 },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 27 }, 2: { halign: 'right', cellWidth: 25 }, 3: { halign: 'right', cellWidth: 28, fontStyle: 'bold' } },
        didParseCell: (h) => { if (h.section === 'head' && h.column.index > 0) h.cell.styles.halign = 'right'; },
        didDrawCell: (h) => { const c = h.cell; pdf.setLineWidth(h.section === 'head' ? 0.5 : 0.2); pdf.setDrawColor(...(h.section === 'head' ? C.ink : C.borde)); pdf.line(c.x, c.y + c.height, c.x + c.width, c.y + c.height); }
      });
      let yy = (pdf.lastAutoTable ? pdf.lastAutoTable.finalY : y) + 7;
      const asegurar = (alto) => { if (yy + alto > PH - BOT) { pdf.addPage(); yy = TOP; } };

      // ── Totales (bloque indivisible) ──
      asegurar(30); const bx = R - 74;
      pdf.setFillColor(...C.f2); pdf.setDrawColor(...C.borde); pdf.setLineWidth(0.25); pdf.roundedRect(bx, yy, 74, 28, 2.5, 2.5, 'FD');
      fuente('normal', 8.5); txt(C.gris); pdf.text('Base:', bx + 5, yy + 7); pdf.text('IVA (' + pdfTxt(d.iva) + '%):', bx + 5, yy + 12.5);
      fuente('bold', 8.5); txt(C.ink); pdf.text(fmtEuro(tot.base), bx + 69, yy + 7, { align: 'right' }); pdf.text(fmtEuro(tot.cuota), bx + 69, yy + 12.5, { align: 'right' });
      pdf.setDrawColor(...C.borde); pdf.line(bx + 5, yy + 16, bx + 69, yy + 16);
      fuente('bold', 12); pdf.text('TOTAL:', bx + 5, yy + 23.2); pdf.text(fmtEuro(tot.total), bx + 69, yy + 23.2, { align: 'right' });
      yy += 28 + 6;

     

      // ── Bloque Veri*factu (huella + QR) ──
      if (esOficial) {
        asegurar(32); yy += 2;
        pdf.setDrawColor(...C.claro); pdf.setLineWidth(0.4); pdf.setLineDashPattern([1.6, 1.6], 0); pdf.line(L, yy, R, yy); pdf.setLineDashPattern([], 0);
        fuente('bold', 7.5); txt(C.ink); pdf.text('VERI*FACTU - SISTEMA INFORMÁTICO DE FACTURACIÓN', L, yy + 6);
        fuente('normal', 7); txt(C.gris); pdf.text('Huella SHA-256:', L, yy + 11);
        pdf.setFont('courier', 'normal'); pdf.setFontSize(6); pdf.text(pdfTxt(d.hashVerifactu || ''), L + 20, yy + 11);
        fuente('normal', 7); txt(C.suave); pdf.text('Sede Electrónica AEAT - Verificable mediante código QR', L, yy + 15.5);
        pdf.setFillColor(255, 255, 255); pdf.setDrawColor(...C.borde); pdf.setLineWidth(0.25); pdf.roundedRect(R - 25, yy + 3, 25, 25, 1.5, 1.5, 'FD');
        dibujarQRVector(pdf, urlQrVerifactu(d, emp, tot), R - 23, yy + 5, 21);
      }

      // ── Pie de página ──
      const n = pdf.internal.getNumberOfPages(), nombre = pdfTxt(d.numero || 'documento');
      for (let i = 1; i <= n; i++) { pdf.setPage(i); fuente('normal', 7.5); txt(C.claro); pdf.text(`${nombre}  ·  Página ${i} de ${n}`, 105, 288, { align: 'center' }); }
      return pdf;
    }

    async function descargarArchivoPDFA4() {
      try {
        const pdf = await generarPDFVectorial(docActualPDFId);
        pdf.save(String(docActualPDFNombre || 'documento.pdf'));
      } catch (e) { avisar('No se pudo generar el PDF: ' + e.message); }
    }
    function cerrarVistaPDF() { document.getElementById('view-pdf').classList.add('hidden'); }

   function renderGastos() {
      const q = (document.getElementById('buscar-gasto').value || '').toLowerCase();
      const cont = document.getElementById('lista-gastos');
      const filtrados = (ConstruFactu.Store.state.gastos || []).filter(g => g.proveedor.toLowerCase().includes(q) || g.concepto.toLowerCase().includes(q));
      if (!filtrados.length) { cont.innerHTML = `<div class="text-center text-xs text-slate-400 py-8">No hay gastos.</div>`; return; }
      cont.innerHTML = filtrados.map(g => {
        const tot = ConstruFactu.Money.gasto(g).totalC / 100;
        return `
          <div class="bg-white p-4 rounded-2xl border shadow-sm flex justify-between items-center">
            <div>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700">${escapeHTML(g.categoria)}</span>
              <h3 class="font-extrabold text-slate-900 text-sm mt-1">${escapeHTML(g.proveedor)}</h3>
              <p class="text-xs text-slate-500">${escapeHTML(g.concepto)} (${escapeHTML(g.fecha)})</p>
            </div>
           <div class="text-right">
              <div class="font-extrabold text-rose-700 text-sm">${fmtEuro(tot)}</div>
              <div class="flex gap-2 justify-end mt-1">
                <button data-click="abrirFormGasto" data-click-args='["${escapeHTML(g.id)}"]' class="text-[10px] text-blue-600 font-bold hover:underline">Editar</button>
                <button data-click="eliminarGasto" data-click-args='["${escapeHTML(g.id)}"]' class="text-[10px] text-slate-400 hover:text-rose-600 font-bold hover:underline">Eliminar</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function abrirFormGasto(id = '') {
      ocultarTodasLasVistas();
      document.getElementById('view-gasto-form').classList.remove('hidden');
      poblarSelectProveedoresGasto();
      
      if (id) {
        const g = (ConstruFactu.Store.state.gastos || []).find(x => x.id === id);
        if (g) {
          document.getElementById('gas-id').value = g.id;
          document.getElementById('gas-nif').value = g.nif || '';
          document.getElementById('gas-num').value = g.numFactura || '';
          document.getElementById('gas-fecha').value = g.fecha || new Date().toISOString().split('T')[0];
          document.getElementById('gas-categoria').value = g.categoria || 'Materiales de obra';
          document.getElementById('gas-concepto').value = g.concepto || '';
          document.getElementById('gas-base').value = g.base || '';
          document.getElementById('gas-iva').value = String(g.iva ?? 21);
          poblarSelectProveedoresGasto(g.proveedor);
        }
      } else {
        ['gas-id', 'gas-nif', 'gas-num', 'gas-concepto', 'gas-base'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('gas-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('gas-iva').value = '21';
        poblarSelectProveedoresGasto();
      }
      recalcularGasto();
    }
    function recalcularGasto() {
      const base = Number(document.getElementById('gas-base').value) || 0;
      const iva = Number(document.getElementById('gas-iva').value) || 0;
      document.getElementById('gas-total-preview').textContent = fmtEuro(ConstruFactu.Money.gasto({ base, iva }).totalC / 100);
    }
    async function guardarGasto() {
      const id = document.getElementById('gas-id').value;
      const proveedor = document.getElementById('gas-proveedor').value.trim();
      const base = ConstruFactu.Money.aCent(document.getElementById('gas-base').value) / 100;
      if (!proveedor || !(base > 0)) { avisar('Proveedor y base obligatorios.'); return; }

      const datosGasto = {
        id: id || 'g' + Date.now(),
        proveedor,
        nif: document.getElementById('gas-nif').value.trim().toUpperCase(),
        numFactura: document.getElementById('gas-num').value.trim(),
        fecha: document.getElementById('gas-fecha').value,
        categoria: document.getElementById('gas-categoria').value,
        concepto: document.getElementById('gas-concepto').value.trim(),
        base,
        iva: Number(document.getElementById('gas-iva').value)
      };

      if (!ConstruFactu.Store.state.gastos) ConstruFactu.Store.state.gastos = [];

      if (id) {
        const idx = ConstruFactu.Store.state.gastos.findIndex(g => g.id === id);
        if (idx !== -1) {
          ConstruFactu.Store.state.gastos[idx] = datosGasto;
        } else {
          ConstruFactu.Store.state.gastos.unshift(datosGasto);
        }
      } else {
        ConstruFactu.Store.state.gastos.unshift(datosGasto);
      }

      await ConstruFactu.Store.save();
      irA('gastos');
    }
    async function eliminarGasto(id) {
      if ((await confirmar('¿Eliminar gasto?', { aceptar: 'Eliminar', peligro: true }))) {
        ConstruFactu.Store.state.gastos = ConstruFactu.Store.state.gastos.filter(g => g.id !== id);
        await ConstruFactu.Store.save();
        renderGastos();
      }
    }

    function renderTarifario() {
      const q = (document.getElementById('buscar-tarifario').value || '').toLowerCase();
      const filtroCap = document.getElementById('filtro-capitulo');
      const capSel = filtroCap ? filtroCap.value : '';

      const capitulosUnicos = Array.from(new Set(ConstruFactu.Tarifario.obtenerTodos().map(p => p.capitulo))).filter(Boolean).sort();
      if (filtroCap) {
        const valActual = filtroCap.value;
        filtroCap.innerHTML = `<option value="">Todos capítulos</option>` + capitulosUnicos.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
        filtroCap.value = valActual;
      }

      const cont = document.getElementById('lista-tarifario');
      const filtrados = ConstruFactu.Tarifario.buscar(q, capSel);
      if (!filtrados.length) { cont.innerHTML = `<div class="text-center text-xs text-slate-400 py-8">No hay partidas.</div>`; return; }

      cont.innerHTML = filtrados.map(p => `
        <div class="bg-white p-3.5 rounded-2xl border flex justify-between items-center shadow-sm">
          <div>
            <span class="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">${escapeHTML(p.capitulo)}</span>
            <p class="font-bold text-xs mt-1 text-slate-900">${escapeHTML(p.concepto)}</p>
          </div>
          <div class="text-right">
            <div class="font-extrabold text-sm text-slate-900">${fmtEuro(p.precio)} / ${escapeHTML(p.unidad)}</div>
            <div class="flex gap-2 justify-end mt-1">
              <button data-click="abrirFormPartidaTarifario" data-click-args='["${escapeHTML(p.id)}"]' class="text-[10px] text-blue-600 font-bold">Editar</button>
              <button data-click="eliminarPartidaTarifario" data-click-args='["${escapeHTML(p.id)}"]' class="text-[10px] text-rose-600 font-bold">Borrar</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    function exportarTarifarioCSV() { ConstruFactu.Tarifario.exportarCSV(); }
    function abrirModalImportarTarifario() {
      document.getElementById('file-import-tarifas').value = '';
      document.getElementById('txt-file-name-info').textContent = 'Ningún archivo seleccionado';
      document.getElementById('modal-importar-tarifario').classList.remove('hidden');
    }
    function cerrarModalImportarTarifario() { document.getElementById('modal-importar-tarifario').classList.add('hidden'); }
    function actualizarNombreArchivoImportado(input) {
      document.getElementById('txt-file-name-info').textContent = input.files && input.files[0] ? input.files[0].name : 'Ningún archivo seleccionado';
    }
    async function descargarPlantillaTarifarioXLSX() {
      try { await cargarXLSX(); } catch (e) { avisar(e.message); return; }
      const ws_data = [
        ["Capitulo", "Concepto", "Unidad", "Precio"],
        ["Albañilería", "Enfoscado maestreado mortero cemento", "m²", 18.50]
      ];
      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tarifas");
      XLSX.writeFile(wb, "plantilla_tarifario_ejemplo.xlsx");
    }

    async function ejecutarImportacionTarifas() {
      const input = document.getElementById('file-import-tarifas');
      if (!input.files || !input.files[0]) { avisar('Selecciona archivo.'); return; }
      const file = input.files[0];
      const strategy = document.getElementById('import-duplicados-strategy').value;
      const reader = new FileReader();

      reader.onload = async function(e) {
        try {
          await cargarXLSX();
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          if (!jsonRows || jsonRows.length < 2) { avisar('Archivo sin filas.'); return; }

          const header = jsonRows[0].map(h => (h || '').toString().trim().toLowerCase());
          const idxCap = header.findIndex(h => h.includes('capitulo') || h.includes('capítulo'));
          const idxCon = header.findIndex(h => h.includes('concepto') || h.includes('descripcion'));
          const idxUni = header.findIndex(h => h.includes('unidad'));
          const idxPre = header.findIndex(h => h.includes('precio') || h.includes('importe'));

          if (idxCon === -1 || idxUni === -1 || idxPre === -1) { avisar('Faltan columnas obligatorias.'); return; }

          let added = 0, updated = 0, skipped = 0;
          for (let i = 1; i < jsonRows.length; i++) {
            const row = jsonRows[i];
            if (!row || row.length === 0) continue;
            const capitulo = idxCap !== -1 && row[idxCap] ? row[idxCap].toString().trim() : 'General';
            const concepto = row[idxCon] ? row[idxCon].toString().trim() : '';
            const unidad = row[idxUni] ? row[idxUni].toString().trim() : 'ud';
            let pr = row[idxPre];
            if (typeof pr === 'string') pr = pr.replace(',', '.').replace(/[^0-9.-]+/g, '');
            const precio = Number(pr) || 0;

            if (concepto) {
              const existingIdx = ConstruFactu.Store.state.catalogoPrecios.findIndex(p => p.concepto.toLowerCase() === concepto.toLowerCase());
              if (existingIdx !== -1) {
                if (strategy === 'actualizar') {
                  ConstruFactu.Store.state.catalogoPrecios[existingIdx] = { ...ConstruFactu.Store.state.catalogoPrecios[existingIdx], capitulo, unidad, precio };
                  updated++;
                } else if (strategy === 'omitir') {
                  skipped++;
                } else {
                  ConstruFactu.Store.state.catalogoPrecios.unshift({ id: 't' + Date.now() + Math.random().toString(36).substring(2, 6), capitulo, concepto, unidad, precio });
                  added++;
                }
              } else {
                ConstruFactu.Store.state.catalogoPrecios.unshift({ id: 't' + Date.now() + Math.random().toString(36).substring(2, 6), capitulo, concepto, unidad, precio });
                added++;
              }
            }
          }
          await ConstruFactu.Store.save();
          cerrarModalImportarTarifario();
          renderTarifario();
          avisar(`Importación completada:
- Añadidas: ${added}
- Actualizadas: ${updated}
- Omitidas: ${skipped}`);
        } catch (err) { avisar('Error al procesar archivo.'); }
      };
      reader.readAsArrayBuffer(file);
    }

    function abrirFormPartidaTarifario(id = '') {
      ocultarTodasLasVistas();
      document.getElementById('view-tarifario-form').classList.remove('hidden');
      if (id) {
        const p = ConstruFactu.Store.state.catalogoPrecios.find(x => x.id === id);
        document.getElementById('tar-id').value = p.id;
        document.getElementById('tar-capitulo').value = p.capitulo;
        document.getElementById('tar-concepto').value = p.concepto;
        document.getElementById('tar-unidad').value = p.unidad;
        document.getElementById('tar-precio').value = p.precio;
      } else {
        ['tar-id', 'tar-capitulo', 'tar-concepto', 'tar-precio'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('tar-unidad').value = 'm²';
      }
    }

    async function guardarPartidaTarifario() {
      const id = document.getElementById('tar-id').value;
      const capitulo = document.getElementById('tar-capitulo').value.trim();
      const concepto = document.getElementById('tar-concepto').value.trim();
      const precio = ConstruFactu.Money._esc(document.getElementById('tar-precio').value, 4) / 1e4;
      if (!capitulo || !concepto || isNaN(precio)) { avisar('Campos obligatorios.'); return; }
      await ConstruFactu.Tarifario.guardar({
        id: id || 't' + Date.now(), capitulo, concepto,
        unidad: document.getElementById('tar-unidad').value.trim() || 'ud',
        precio
      });
      irA('tarifario');
    }

    async function eliminarPartidaTarifario(id) {
      if ((await confirmar('¿Eliminar partida?', { aceptar: 'Eliminar', peligro: true }))) {
        await ConstruFactu.Tarifario.eliminar(id);
        renderTarifario();
      }
    }

    function renderEstado() {
      const ventas = ConstruFactu.Store.state.documentos.filter(d => d.estado === 'Oficial').reduce((acc, d) => acc + calcTotalesDoc(d).baseC, 0) / 100;
      const ivaRep = ConstruFactu.Store.state.documentos.filter(d => d.estado === 'Oficial').reduce((acc, d) => acc + calcTotalesDoc(d).cuotaC, 0) / 100;
      const ivaSop = (ConstruFactu.Store.state.gastos || []).reduce((acc, g) => acc + ConstruFactu.Money.gasto(g).cuotaC, 0) / 100;
      document.getElementById('est-ventas-base').textContent = fmtEuro(ventas);
      document.getElementById('est-iva-rep').textContent = fmtEuro(ivaRep);
      document.getElementById('est-iva-sop').textContent = fmtEuro(ivaSop);
      document.getElementById('est-iva-neto').textContent = fmtEuro(ivaRep - ivaSop);
    }

    function exportarCSVFacturas() {
      const filas = [['Tipo', 'Numero', 'Fecha', 'Base', 'IVA', 'Total']];
      ConstruFactu.Store.state.documentos.filter(d => d.estado === 'Oficial').forEach(d => {
        const t = calcTotalesDoc(d);
        filas.push([d.tipo, d.numero, d.fecha, t.base.toFixed(2), t.cuota.toFixed(2), t.total.toFixed(2)]);
      });
      const blob = new Blob([filas.map(r => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'libro_facturas.csv'; a.click();
    }

    function exportarCSVGastos() {
      const filas = [['Proveedor', 'NIF', 'Concepto', 'Fecha', 'Base', 'IVA', 'Total']];
      (ConstruFactu.Store.state.gastos || []).forEach(g => {
        const tot = ConstruFactu.Money.gasto(g).totalC / 100;
        filas.push([g.proveedor, g.nif || '', g.concepto, g.fecha, Number(g.base).toFixed(2), (ConstruFactu.Money.gasto(g).cuotaC / 100).toFixed(2), tot.toFixed(2)]);
      });
      const blob = new Blob([filas.map(r => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'libro_gastos.csv'; a.click();
    }

    function cargarVistaConfig() {
      const state = ConstruFactu.Store.state;
      document.getElementById('cfg-nombre').value = state.empresa.nombre;
      document.getElementById('cfg-email').value = state.auth.email || '';
      
      const lic = ConstruFactu.Licensing.obtenerEstado();
      document.getElementById('cfg-badge-licencia').textContent = lic.texto;
      document.getElementById('cfg-desc-licencia').innerHTML = lic.desc;
      
      document.getElementById('cfg-nif').value = state.empresa.nif;
      document.getElementById('cfg-serie').value = state.empresa.serie || 'F2026';
      document.getElementById('cfg-direccion').value = state.empresa.direccion || '';
      document.getElementById('cfg-iban').value = state.empresa.iban || '';
      ['cfg-pin-actual', 'cfg-pin-nuevo'].forEach(i => document.getElementById(i).value = '');
      document.getElementById('cfg-frecuencia').value = state.empresa.frecuenciaRecordatorio || '7';
    }

    function cargarLogoEmpresa(input) {
      if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
          ConstruFactu.Store.state.empresa.logo = e.target.result;
          avisar('Logotipo cargado correctamente. Guarda los datos para consolidar.');
        };
        reader.readAsDataURL(input.files[0]);
      }
    }

    async function guardarConfigEmpresa() {
      const state = ConstruFactu.Store.state;
      state.empresa.nombre = document.getElementById('cfg-nombre').value.trim();
      state.empresa.nif = document.getElementById('cfg-nif').value.trim().toUpperCase();
      state.empresa.serie = document.getElementById('cfg-serie').value.trim().toUpperCase();
      state.empresa.direccion = document.getElementById('cfg-direccion').value.trim();
      state.empresa.iban = document.getElementById('cfg-iban').value.trim().toUpperCase();
      state.empresa.frecuenciaRecordatorio = document.getElementById('cfg-frecuencia').value;
      
      const u = document.getElementById('cfg-email').value.trim();
      const pActual = document.getElementById('cfg-pin-actual').value;
      const pNuevo = document.getElementById('cfg-pin-nuevo').value;
      if (pNuevo) {
        if (!(/^\d{4,}$/.test(pNuevo) || pNuevo.length >= 6)) { avisar('El PIN nuevo debe tener 4+ dígitos o 6+ caracteres.'); return; }
        if (!(await ConstruFactu.Auth.verificarPin(pActual))) { avisar('El PIN actual no es correcto.'); return; }
        state.auth.pin = await ConstruFactu.Auth._credencial(pNuevo);
        delete state.auth.password; delete state.auth.masterKey;
      }
      if (u) state.auth.email = u;

      await ConstruFactu.Store.save();
      avisar('Configuración guardada correctamente.');
      irA('menu');
    }

    async function limpiarDatosDemostraciónSeguro() {
      const masterIngresado = (await pedirTexto('⚠️ ATENCIÓN: Estás en entorno de producción.\n\nSe recomienda encarecidamente hacer una copia de seguridad antes de borrar datos.\n\nIntroduce tu PIN para confirmar el borrado:', { tipo: 'password', aceptar: 'Borrar datos', peligro: true, placeholder: 'Tu PIN' }));
      if (!masterIngresado) return;
      
      if (await ConstruFactu.Auth.verificarPin(masterIngresado)) {
        ConstruFactu.Store.state.clientes = [];
        ConstruFactu.Store.state.documentos = ConstruFactu.Store.state.documentos.filter(d => d.estado === 'Oficial'); // las facturas oficiales no se pueden borrar
        ConstruFactu.Store.state.gastos = [];
        ConstruFactu.Store.state.catalogoPrecios = [];
        await ConstruFactu.Store.save();
        avisar('¡Datos borrados con éxito! Entorno limpio.');
        irA('menu');
      } else {
        avisar('PIN incorrecto. No se ha borrado ningún dato.');
      }
    }

    function cerrarSesion() { irA('login'); }

    async function enviarCopiaSeguridadEmail() {
      const fecha = new Date().toISOString().slice(0, 10), nombre = `ConstruFactu_Backup_${fecha}.json`;
      const json = JSON.stringify(ConstruFactu.Store.state, null, 2);

      // 1) Hoja de compartir del sistema, con el archivo ADJUNTO (móviles, tablets y algunos escritorios).
      //    Chrome/Android solo admite ciertos tipos de archivo: si .json no se permite, se comparte como .json.txt (se restaura igual).
      const variantes = [new File([json], nombre, { type: 'application/json' }), new File([json], nombre + '.txt', { type: 'text/plain' })];
      if (navigator.share && navigator.canShare) {
        for (const f of variantes) {
          if (!navigator.canShare({ files: [f] })) continue;
          try { await navigator.share({ title: 'Copia de seguridad ConstruFactu', text: 'Copia de seguridad de ConstruFactu (' + fecha + ').', files: [f] }); return; }
          catch (e) { if (e && e.name === 'AbortError') return; console.error('[compartir]', e); }
        }
      }

      // 2) Sin hoja de compartir (típico en ordenadores): NINGÚN navegador permite adjuntar un archivo desde un enlace mailto:.
      //    Se descarga la copia y se avisa con claridad de que el adjunto lo pone el usuario.
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' })), a = document.createElement('a');
      a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      const abrir = await confirmar(`✅ Copia descargada: ${nombre}\n\nTu navegador no permite adjuntar archivos automáticamente. Si abres el correo, adjunta tú ese archivo (está en tu carpeta de Descargas).`, { aceptar: 'Abrir correo', cancelar: 'Solo descargar' });
      if (abrir) {
        const para = ConstruFactu.Store.state.auth.email || '';
        window.location.href = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent('Copia de seguridad ConstruFactu - ' + fecha)}&body=${encodeURIComponent('Adjunto la copia de seguridad de ConstruFactu (' + nombre + ').')}`;
      }
    }

    function descargarBackupJSON() {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(ConstruFactu.Store.state, null, 2));
      const a = document.createElement('a'); a.href = dataStr;
      a.download = `ConstruFactu_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      avisar('Copia de seguridad descargada con éxito en tu dispositivo.');
    }

    async function restaurarDesdeArchivoJSON(input) {
      if (input.files && input.files[0]) {
        if (!(await confirmar('⚠️ ADVERTENCIA DE SEGURIDAD:\n\nRestaurar una copia de seguridad sobrescribirá todos los datos y documentos actuales de la aplicación.\n\n¿Deseas continuar con la restauración?', { aceptar: 'Restaurar', peligro: true }))) {
          input.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = async function(e) {
          try {
            const parsed = JSON.parse(e.target.result);
            const errores = ConstruFactu.Store.validar(parsed, true);
            if (errores.length) { avisar('Archivo no válido:\n- ' + errores.join('\n- ')); return; }
            const previo = ConstruFactu.Store.state;
            try { localStorage.setItem('construfactu_prerestore', JSON.stringify(previo)); } catch (e2) {}
            ConstruFactu.Store.migrar(parsed);
            ConstruFactu.Store.state = ConstruFactu.Store.fusionar(ConstruFactu.Store.clonarDefecto(), parsed);
            const ver = await ConstruFactu.VeriFactu.verificarCadena(ConstruFactu.Store.state);
            if (!ver.ok && !(await confirmar('⚠️ La copia tiene inconsistencias en la cadena Veri*factu:\n\n- ' + ver.errores.slice(0, 5).join('\n- ') + '\n\n¿Restaurar igualmente?', { aceptar: 'Restaurar igualmente', peligro: true }))) { ConstruFactu.Store.state = previo; return; }
            const ok = await ConstruFactu.Store.save();
            if (!ok) { ConstruFactu.Store.state = previo; avisar('No se pudo guardar la copia restaurada. Se han conservado tus datos actuales.'); return; }
            avisar('¡Copia restaurada con éxito!');
            irA('menu');
          } catch (err) { avisar('Error al leer el archivo JSON.'); }
        };
        reader.readAsText(input.files[0]);
      }
    }

    async function activarLicencia() {
      const clave = document.getElementById('cfg-licencia-input').value.trim();
      const ok = await ConstruFactu.Licensing.activarClave(clave);
      if (ok) {
        avisar('¡Licencia PRO anual activada correctamente!');
        cargarVistaConfig();
        actualizarBadgesMenu();
      } else {
        avisar('Clave no válida.');
      }
    }

    function buscarActualizaciones() { avisar('Versión actual (v0.9.45) al día.'); }

    function poblarSelectProveedoresGasto(seleccionarNombre = '') {
      const sel = document.getElementById('gas-proveedor-select');
      if (!sel) return;
      const provs = ConstruFactu.Store.state.proveedores || [];
      sel.innerHTML = `<option value="">-- Selecciona Proveedor --` + provs.map(p => `<option value="${escapeHTML(p.nombre)}">${escapeHTML(p.nombre)} (${escapeHTML(p.nif || 'Sin NIF')})</option>`).join('');
      if (seleccionarNombre) {
        sel.value = seleccionarNombre;
        document.getElementById('gas-proveedor').value = seleccionarNombre;
      } else if (provs.length > 0) {
        sel.value = provs[0].nombre;
        document.getElementById('gas-proveedor').value = provs[0].nombre;
      }
    }

    function cambiarSelectorProveedorGasto(val) {
      document.getElementById('gas-proveedor').value = val;
    }

    function abrirModalNuevoProveedorGasto() {
      ['mprov-nombre', 'mprov-nif', 'mprov-tel'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('modal-nuevo-proveedor').classList.remove('hidden');
    }

    function cerrarModalNuevoProveedorGasto() {
      document.getElementById('modal-nuevo-proveedor').classList.add('hidden');
    }

    async function guardarProveedorGastoDesdeModal() {
      const nombre = document.getElementById('mprov-nombre').value.trim();
      const nif = document.getElementById('mprov-nif').value.trim().toUpperCase();
      const telefono = document.getElementById('mprov-tel').value.trim();
      if (!nombre) { avisar('El nombre del proveedor es obligatorio.'); return; }
      
      if (!ConstruFactu.Store.state.proveedores) ConstruFactu.Store.state.proveedores = [];
      const nuevoProv = { id: 'prov' + Date.now(), nombre, nif, telefono };
      ConstruFactu.Store.state.proveedores.unshift(nuevoProv);
      await ConstruFactu.Store.save();
      cerrarModalNuevoProveedorGasto();
      poblarSelectProveedoresGasto(nombre);
    }

    window.addEventListener('DOMContentLoaded', async () => {
      await ConstruFactu.Store.init();
      
      // Activar aviso visual si DEV_MODE es true
      if (typeof DEV_MODE !== 'undefined' && DEV_MODE) {
        const bannerDev = document.getElementById('banner-dev-mode');
        if (bannerDev) bannerDev.classList.remove('hidden');
        document.getElementById('login-user').value = 'admin@construcciones-garcia.es';
        document.getElementById('login-pass').value = '1234';
      }
      if (!ConstruFactu.Auth.tieneCuenta() && !(typeof DEV_MODE !== 'undefined' && DEV_MODE)) cambiarTabLogin('registro');

      actualizarBadgesMenu();
      ConstruFactu.VeriFactu.verificarCadena().then(r => { if (!r.ok) mostrarAviso('⚠️ Veri*factu: ' + r.errores[0], 'error'); }).catch(() => {});
    });
  