(function(CF) {
  CF.Gestor = {
    generarCSV(desde, hasta) {
      const documentos = ConstruFactu.Store.state.documentos || [];
      const facturas = documentos.filter(doc =>
        !doc.deletedAt &&
        (doc.tipo === 'factura' || doc.tipo === 'rectificativa') &&
        doc.estado === 'Oficial' &&
        doc.fecha >= desde &&
        doc.fecha <= hasta
      );

      const filas = ['Tipo;Numero;Fecha;NIF_Cliente;Nombre_Cliente;Base_Imponible;IVA;Total;Huella_VeriFactu'];
      const escapar = valor => String(valor == null ? '' : valor).replace(/"/g, '""');
      const euro = valor => Number(valor).toFixed(2).replace('.', ',');

      facturas.forEach(doc => {
        const cliente = (ConstruFactu.Store.state.clientes || []).find(c => c.id === doc.clienteId) || {};
        const totales = ConstruFactu.Money.totales(doc);
        filas.push([
          escapar(doc.tipo),
          escapar(doc.numero),
          escapar(doc.fecha),
          escapar(cliente.nif),
          `"${escapar(cliente.nombre)}"`,
          euro(totales.base),
          euro(totales.cuota),
          euro(totales.total),
          escapar(doc.hashVerifactu)
        ].join(';'));
      });

      return filas.join('\r\n') + '\r\n';
    },

    generarCSVGastos(desde, hasta) {
      const gastos = (ConstruFactu.Store.state.gastos || []).filter(g =>
        !g.deletedAt &&
        g.fecha >= desde &&
        g.fecha <= hasta
      );

      const filas = ['Fecha;Proveedor;NIF;NumFactura;Concepto;Base;IVA;Total'];
      const escapar = valor => String(valor == null ? '' : valor).replace(/"/g, '""');
      const euro = valor => (Number(valor) / 100).toFixed(2).replace('.', ',');

      gastos.forEach(g => {
        const totales = ConstruFactu.Money.gasto(g);
        filas.push([
          escapar(g.fecha),
          `"${escapar(g.proveedor)}"`,
          escapar(g.nif),
          escapar(g.numFactura),
          `"${escapar(g.concepto)}"`,
          euro(totales.baseC),
          euro(totales.cuotaC),
          euro(ConstruFactu.Money.gasto(g).totalC)
        ].join(';'));
      });

      return filas.join('\r\n') + '\r\n';
    },

    async exportarGestor(desde, hasta) {
      const documentos = ConstruFactu.Store.state.documentos || [];
      const facturas = documentos.filter(doc =>
        !doc.deletedAt &&
        (doc.tipo === 'factura' || doc.tipo === 'rectificativa') &&
        doc.estado === 'Oficial' &&
        doc.fecha >= desde &&
        doc.fecha <= hasta
      );
      const gastos = (ConstruFactu.Store.state.gastos || []).filter(g =>
        !g.deletedAt &&
        g.fecha >= desde &&
        g.fecha <= hasta
      );

      const csvString = this.generarCSV(desde, hasta);
      const csvGastos = this.generarCSVGastos(desde, hasta);
      const zip = new JSZip();
      zip.file('Libro_Facturas_Emitidas.csv', csvString);
      zip.file('Libro_Gastos.csv', csvGastos);

      for (const doc of facturas) {
        const pdf = await ConstruFactu.generarPDFVectorial(doc.id);
        const blob = pdf.output('blob');
        zip.file(doc.numero + '.pdf', blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `Envio_Gestoria_${desde}_${hasta}.zip`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  };
})(window.ConstruFactu);