// src/scripts/dashboard.js
import { fUSDT, fVES, inject } from './dashboard/utils.js';
// ... otras importaciones
import { updateComisionesUI } from './dashboard/comisiones.js';
// src/scripts/dashboard.js
import { updateOperacionesUI } from './dashboard/operaciones.js';// <--- Nombre actualizado

export async function updateDashboard(API_BASE, token, alias, range = {}) {
    // ... tu lógica de fetch ...
    const kpis = await kpiRes.json();

    // Llamada a la nueva lógica de comisiones
    if (kpis.transactions) {
        updateComisionesUI(kpis.transactions);
    } else {
        updateComisionesUI([]);
    }
    // ... dentro de updateDashboard ...
    if (kpis.transactions) {
        updateOperacionesUI(kpis.transactions);
    }
    
    // ... resto de actualizaciones (Red, Pay, etc) ...
}