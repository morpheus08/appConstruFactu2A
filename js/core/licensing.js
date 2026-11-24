(function(CF) {
  CF.Licensing = {
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
          const facturasEmitidas = (ConstruFactu.Store.state.documentos || []).filter(d =>
            !d.deletedAt && (d.tipo === 'factura' || d.tipo === 'rectificativa') && d.estado === 'Oficial'
          ).length;
          if (emp.licenciaTipo === 'prueba' && facturasEmitidas >= 10) {
            return { texto: 'PRUEBA AGOTADA', badgeClass: 'bg-rose-100 text-rose-900', desc: 'Has alcanzado el límite de 10 facturas. Activa tu licencia PRO para seguir facturando.', vigente: false };
          }

          const inicio = new Date(emp.fechaCreacionSistema);
          const hoy = new Date();
          const diffTime = hoy - inicio;
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          const diasRestantes = Math.max(0, 15 - diffDays);
          
          if (diasRestantes === 0) {
            return { texto: 'PRUEBA CADUCADA', badgeClass: 'bg-rose-100 text-rose-900', desc: 'Periodo de prueba expirado. Introduce clave PRO.', vigente: false };
          }
          return { texto: `PRUEBA (${10 - facturasEmitidas} facturas restantes)`, badgeClass: 'bg-amber-100 text-amber-900', desc: `Te quedan ${diasRestantes} días de prueba gratuita.`, vigente: true };
        },
        async activarClave(clave) {
          const c = clave.trim().toUpperCase();
          if (!c.startsWith('CF-PRO-')) return false;
          const partes = c.split('-');
          if (partes.length !== 4 || partes[0] !== 'CF' || partes[1] !== 'PRO' ||
              !/^\d{8}$/.test(partes[2]) || !/^[0-9A-F]{8}$/.test(partes[3])) return false;

          const fecha = partes[2];
          const hashEsperado = await ConstruFactu.VeriFactu.sha256('CONSTRUFACTU_SECRET_SALT_' + fecha);
          if (partes[3] !== hashEsperado.slice(0, 8).toUpperCase()) return false;

          const anio = Number(fecha.slice(0, 4));
          const mes = Number(fecha.slice(4, 6));
          const dia = Number(fecha.slice(6, 8));
          const fechaUTC = new Date(Date.UTC(anio, mes - 1, dia));
          if (fechaUTC.getUTCFullYear() !== anio || fechaUTC.getUTCMonth() !== mes - 1 || fechaUTC.getUTCDate() !== dia) return false;

          const ahora = new Date();
          const hoy = `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}`;
          if (fecha <= hoy) return false;

          ConstruFactu.Store.state.empresa.licenciaTipo = 'pro';
          ConstruFactu.Store.state.empresa.licenciaExpiracion = new Date(Date.UTC(anio, mes - 1, dia, 23, 59, 59, 999)).toISOString();
          if (!(await ConstruFactu.Store.save())) throw new Error('No se pudo guardar la licencia.');
          return true;
        }
      };
})(window.ConstruFactu);
