(function(CF) {
  CF.Gestor = {
    generarCSV(desde, hasta) {
      const documentos = ConstruFactu.Store.state.documentos || [];
      const facturas = documentos.filter(doc =>
        (doc.tipo === 'factura' || doc.tipo === 'rectificativa') &&
        doc.estado === 'Oficial' &&
        doc.fecha >= desde &&
        doc.fecha <= hasta
      );

      if (!facturas.length) return '';

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

    async exportarGestor(desde, hasta) {
      const documentos = ConstruFactu.Store.state.documentos || [];
      const facturas = documentos.filter(doc =>
        (doc.tipo === 'factura' || doc.tipo === 'rectificativa') &&
        doc.estado === 'Oficial' &&
        doc.fecha >= desde &&
        doc.fecha <= hasta
      );

      if (!facturas.length) throw new Error('No hay facturas en ese periodo.');

      const csvString = this.generarCSV(desde, hasta);
      const zip = new JSZip();
      zip.file('Resumen_Facturas.csv', csvString);

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