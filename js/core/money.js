(function(CF) {
  CF.Money = {
    _esc(v, dec) {                                   // número → entero escalado 10^dec, redondeo half-away
      if (typeof v === 'string') v = v.replace(',', '.');
      const n = Number(v);
      if (!isFinite(n)) return 0;
      return (n < 0 ? -1 : 1) * Math.floor(Number(Math.abs(n).toFixed(8) + 'e' + dec) + 0.5);
    },
    aCent(euros) { return this._esc(euros, 2); },
    lineaC(cantidad, precio) {                       // milésimas × diezmilésimas / 100000
      const p = this._esc(cantidad, 3) * this._esc(precio, 4);
      return (p < 0 ? -1 : 1) * Math.floor((Math.abs(p) + 50000) / 100000);
    },
    cuotaC(baseC, ivaPct) {
      const bp = Math.round((Number(ivaPct) || 0) * 100);
      const p = baseC * bp;
      return (p < 0 ? -1 : 1) * Math.floor((Math.abs(p) + 5000) / 10000);
    },
    totales(doc) {
      const lineasC = (doc.lineas || []).map(l => this.lineaC(l.cantidad, l.precio));
      const baseC = lineasC.reduce((a, c) => a + c, 0), cuotaC = this.cuotaC(baseC, doc.iva), totalC = baseC + cuotaC;
      return { baseC, cuotaC, totalC, lineasC, base: baseC / 100, cuota: cuotaC / 100, total: totalC / 100 };
    },
    // Fórmula anterior (coma flotante, sin redondeo por línea). SOLO para facturas oficiales emitidas antes de los céntimos.
    totalesLegacy(doc) {
      const base = (doc.lineas || []).reduce((a, l) => a + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0);
      const cuota = base * ((Number(doc.iva) || 0) / 100);
      return { base, cuota, total: base + cuota };
    },
    gasto(g) {
      const baseC = this.aCent(g.base), cuotaC = this.cuotaC(baseC, g.iva);
      return { baseC, cuotaC, totalC: baseC + cuotaC };
    }
  };
})(window.ConstruFactu);
