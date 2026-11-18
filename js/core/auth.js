(function(CF) {
  CF.Auth = {
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
  };
})(window.ConstruFactu);
