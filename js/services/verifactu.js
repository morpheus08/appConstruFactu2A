(function(CF) {
  CF.VeriFactu = {
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
      };
})(window.ConstruFactu);
