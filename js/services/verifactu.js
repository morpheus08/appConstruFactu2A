(function(CF) {
  CF.VeriFactu = {
        ZERO: '0'.repeat(64),
        _emitiendo: false,

        _sha256Puro(txt) {
          const bytes = [];
          for (let i = 0; i < txt.length; i++) {
            let cp = txt.codePointAt(i);
            if (cp > 0xffff) i++;
            if (cp <= 0x7f) {
              bytes.push(cp);
            } else if (cp <= 0x7ff) {
              bytes.push(0xc0 | (cp >>> 6), 0x80 | (cp & 0x3f));
            } else if (cp <= 0xffff) {
              bytes.push(0xe0 | (cp >>> 12), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
            } else {
              bytes.push(0xf0 | (cp >>> 18), 0x80 | ((cp >>> 12) & 0x3f), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
            }
          }

          const rotR = (v, n) => (v >>> n) | (v << (32 - n));
          const sha = (x, y, z) => ((x & y) ^ (~x & z)) >>> 0;
          const maj = (x, y, z) => ((x & y) ^ (x & z) ^ (y & z)) >>> 0;
          const sigma0 = x => (rotR(x, 2) ^ rotR(x, 13) ^ rotR(x, 22)) >>> 0;
          const sigma1 = x => (rotR(x, 6) ^ rotR(x, 11) ^ rotR(x, 25)) >>> 0;
          const gamma0 = x => (rotR(x, 7) ^ rotR(x, 18) ^ (x >>> 3)) >>> 0;
          const gamma1 = x => (rotR(x, 17) ^ rotR(x, 19) ^ (x >>> 10)) >>> 0;

          const K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
          ];

          const bitLengthLow = (bytes.length * 8) >>> 0;
          const bitLengthHigh = Math.floor(bytes.length / 0x20000000);
          bytes.push(0x80);
          while ((bytes.length % 64) !== 56) bytes.push(0);
          bytes.push(
            (bitLengthHigh >>> 24) & 0xff, (bitLengthHigh >>> 16) & 0xff,
            (bitLengthHigh >>> 8) & 0xff, bitLengthHigh & 0xff,
            (bitLengthLow >>> 24) & 0xff, (bitLengthLow >>> 16) & 0xff,
            (bitLengthLow >>> 8) & 0xff, bitLengthLow & 0xff
          );

          let H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
          let H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;
          const W = new Array(64);

          for (let offset = 0; offset < bytes.length; offset += 64) {
            for (let i = 0; i < 16; i++) {
              const j = offset + i * 4;
              W[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
            }
            for (let i = 16; i < 64; i++) {
              W[i] = (gamma1(W[i - 2]) + W[i - 7] + gamma0(W[i - 15]) + W[i - 16]) >>> 0;
            }

            let a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;
            for (let i = 0; i < 64; i++) {
              const t1 = (h + sigma1(e) + sha(e, f, g) + K[i] + W[i]) >>> 0;
              const t2 = (sigma0(a) + maj(a, b, c)) >>> 0;
              h = g; g = f; f = e; e = (d + t1) >>> 0;
              d = c; c = b; b = a; a = (t1 + t2) >>> 0;
            }
            H0 = (H0 + a) >>> 0; H1 = (H1 + b) >>> 0;
            H2 = (H2 + c) >>> 0; H3 = (H3 + d) >>> 0;
            H4 = (H4 + e) >>> 0; H5 = (H5 + f) >>> 0;
            H6 = (H6 + g) >>> 0; H7 = (H7 + h) >>> 0;
          }

          return [H0, H1, H2, H3, H4, H5, H6, H7]
            .map(v => ('00000000' + (v >>> 0).toString(16)).slice(-8))
            .join('');
        },

        async sha256(txt) {
          try {
            if (!(globalThis.crypto && crypto.subtle)) throw new Error('crypto.subtle no disponible');
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
          } catch (e) {
            return this._sha256Puro(txt);
          }
        },

        // formato 1 = legacy (sin FechaHoraRegistro) · formato 2 = actual (el sello temporal entra en el hash)
        cadena(r) {
          const base = `IDEmisor=${r.idEmisor}&NumSerie=${r.numero}&Fecha=${r.fecha}&Cuota=${Number(r.cuota).toFixed(2)}&Total=${Number(r.total).toFixed(2)}`;
          return r.formato === 1
            ? `${base}&HuellaAnterior=${r.huellaAnterior}`
            : `${base}&FechaHoraRegistro=${r.fechaHoraRegistro}&HuellaAnterior=${r.huellaAnterior}`;
        },

        async emitirOficial(docId) {
          const lic = ConstruFactu.Licensing.obtenerEstado();
          if (lic.vigente === false) {
            throw new Error('Límite de prueba alcanzado. Por favor, adquiere una licencia PRO para emitir más facturas.');
          }
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
      };
})(window.ConstruFactu);
