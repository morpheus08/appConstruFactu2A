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
      };
})(window.ConstruFactu);
