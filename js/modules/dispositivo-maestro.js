// js/modules/dispositivo-maestro.js
// Lógica del modal para elegir el Dispositivo Maestro (Verifactu).
(function (CF) {
  'use strict';
  if (!CF) return;

  let modalId = 'modal-dispositivo-maestro';

  CF.DispositivoMaestro = {
    init: function () {
      var estado = window.ConstruFactu.Store.state;
      
      // Si Verifactu está apagado, no hacemos nada
      if (!estado || !estado.VERIFACTU_ENABLED) return; 
      
      // Si ya se eligió un rol, no mostramos el modal de nuevo
      if (estado.dispositivoRol === 'maestro' || estado.dispositivoRol === 'satelite') return;

      this.mostrarModal();
    },

    mostrarModal: function () {
      // Evitar duplicados
      if (document.getElementById(modalId)) return;

      const html = `
        <div id="${modalId}" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 transition-opacity duration-300 opacity-0">
          <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden transform scale-95 transition-transform duration-300" id="${modalId}-content">
            
            <div class="bg-slate-900 px-6 py-4 flex justify-between items-center">
              <h3 class="text-lg font-bold text-white">Configuración del Dispositivo Maestro</h3>
              <button id="${modalId}-btn-cerrar-x" class="text-slate-400 hover:text-white transition-colors">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div class="p-6">
              <div class="flex items-start mb-4">
                <div class="flex-shrink-0 bg-amber-100 rounded-full p-2 mr-3 mt-1">
                  <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <p class="text-sm text-slate-700 leading-relaxed">
                  Este dispositivo será el que genere y encadene las facturas oficiales. Si lo pierdes, se estropea o lo cambias sin haber exportado una copia, <strong>perderás tus registros fiscales</strong> y no podrás justificarlos ante Hacienda durante los 4 años que exige la ley. Debes configurar y ejecutar copias de seguridad periódicas.
                </p>
              </div>

              <label class="flex items-start space-x-3 bg-slate-50 p-4 rounded-lg border border-slate-200 cursor-pointer mb-6">
                <input type="checkbox" id="${modalId}-check" class="mt-1 w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-900 cursor-pointer">
                <span class="text-sm font-medium text-slate-800">Entiendo y acepto esta responsabilidad.</span>
              </label>

              <div class="flex flex-col space-y-3">
                <button id="${modalId}-btn-maestro" disabled class="w-full bg-slate-900 text-white font-bold py-3 px-4 rounded-lg hover:bg-slate-800 transition-colors opacity-50 cursor-not-allowed disabled:opacity-50">
                  Elegir este dispositivo como maestro
                </button>
                <button id="${modalId}-btn-satelite" class="w-full bg-slate-100 text-slate-800 font-bold py-3 px-4 rounded-lg hover:bg-slate-200 transition-colors">
                  Usar este dispositivo como satélite
                </button>
                <button id="${modalId}-btn-tarde" class="w-full text-slate-500 font-medium py-2 hover:text-slate-800 transition-colors text-sm">
                  Decidir más tarde
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', html);

      const modal = document.getElementById(modalId);
      const content = document.getElementById(`${modalId}-content`);
      const btnMaestro = document.getElementById(`${modalId}-btn-maestro`);
      const check = document.getElementById(`${modalId}-check`);

      // Animación de entrada
      setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
      }, 10);

      // Lógica del checkbox
      check.addEventListener('change', (e) => {
        btnMaestro.disabled = !e.target.checked;
        if (e.target.checked) {
          btnMaestro.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
          btnMaestro.classList.add('opacity-50', 'cursor-not-allowed');
        }
      });

      // Acciones
      const guardarRol = (rol) => {
        const estado = window.ConstruFactu.Store.state;
        estado.dispositivoRol = rol;
        estado.rolAceptadoEn = new Date().toISOString();
        
        // Guardar en IndexedDB
        window.ConstruFactu.Store.save();
        
        // Cerrar modal
        modal.classList.add('opacity-0');
        content.classList.add('scale-95');
        setTimeout(() => modal.remove(), 300);
      };

      btnMaestro.addEventListener('click', () => guardarRol('maestro'));
      document.getElementById(`${modalId}-btn-satelite`).addEventListener('click', () => guardarRol('satelite'));

      // Cerrar sin guardar
      const cerrar = () => {
        modal.classList.add('opacity-0');
        content.classList.add('scale-95');
        setTimeout(() => modal.remove(), 300);
      };

      document.getElementById(`${modalId}-btn-cerrar-x`).addEventListener('click', cerrar);
      document.getElementById(`${modalId}-btn-tarde`).addEventListener('click', cerrar);
    }
  };
})(window.ConstruFactu);