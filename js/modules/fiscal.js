(function(CF) {
function renderEstado() {
      const documentosActivos = (ConstruFactu.Store.state.documentos || []).filter(d => !d.deletedAt);
      const gastosActivos = (ConstruFactu.Store.state.gastos || []).filter(g => !g.deletedAt);
      const ventas = documentosActivos.filter(d => d.estado === 'Oficial').reduce((acc, d) => acc + calcTotalesDoc(d).baseC, 0) / 100;
      const ivaRep = documentosActivos.filter(d => d.estado === 'Oficial').reduce((acc, d) => acc + calcTotalesDoc(d).cuotaC, 0) / 100;
      const ivaSop = gastosActivos.reduce((acc, g) => acc + ConstruFactu.Money.gasto(g).cuotaC, 0) / 100;
      document.getElementById('est-ventas-base').textContent = fmtEuro(ventas);
      document.getElementById('est-iva-rep').textContent = fmtEuro(ivaRep);
      document.getElementById('est-iva-sop').textContent = fmtEuro(ivaSop);
      document.getElementById('est-iva-neto').textContent = fmtEuro(ivaRep - ivaSop);
    }

    function exportarCSVFacturas() {
      const filas = [['Tipo', 'Numero', 'Fecha', 'Base', 'IVA', 'Total']];
      ConstruFactu.Store.state.documentos.filter(d => !d.deletedAt && d.estado === 'Oficial').forEach(d => {
        const t = calcTotalesDoc(d);
        filas.push([d.tipo, d.numero, d.fecha, t.base.toFixed(2), t.cuota.toFixed(2), t.total.toFixed(2)]);
      });
      const blob = new Blob([filas.map(r => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'libro_facturas.csv'; a.click();
    }

    function exportarCSVGastos() {
      const filas = [['Proveedor', 'NIF', 'Concepto', 'Fecha', 'Base', 'IVA', 'Total']];
      (ConstruFactu.Store.state.gastos || []).filter(g => !g.deletedAt).forEach(g => {
        const tot = ConstruFactu.Money.gasto(g).totalC / 100;
        filas.push([g.proveedor, g.nif || '', g.concepto, g.fecha, Number(g.base).toFixed(2), (ConstruFactu.Money.gasto(g).cuotaC / 100).toFixed(2), tot.toFixed(2)]);
      });
      const blob = new Blob([filas.map(r => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'libro_gastos.csv'; a.click();
    }
  CF.renderEstado = function() { return renderEstado.apply(this, arguments); };
  window.renderEstado = CF.renderEstado;
  CF.exportarCSVFacturas = function() { return exportarCSVFacturas.apply(this, arguments); };
  window.exportarCSVFacturas = CF.exportarCSVFacturas;
  CF.exportarCSVGastos = function() { return exportarCSVGastos.apply(this, arguments); };
  window.exportarCSVGastos = CF.exportarCSVGastos;
})(window.ConstruFactu);
