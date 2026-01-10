// src/scripts/dashboard.js

// 1. TODAS las importaciones deben ir al principio
import { fUSDT, fVES, inject } from './dashboard/utils.js';
import { updateRedSection } from './dashboard/red.js';
import { updatePaySection } from './dashboard/pay.js';
import { updateSwitchSection } from './dashboard/switch.js';
import { updateP2PSection } from './dashboard/p2p.js';
import { updateComisionesUI } from './dashboard/comisiones.js';
import { updateOperacionesUI } from './dashboard/operaciones.js';
import { updateBancosUI } from './dashboard/bancos.js';

// 2. Esta es la función que el index.astro está buscando y no encuentra
export async function initDashboard() {
    // Aquí va la lógica inicial (configurar botones, cargar datos por primera vez, etc.)
    console.log("Dashboard iniciado...");
    
    // Si tienes una función principal de actualización, llámala aquí
    // await updateDashboard(API_BASE, token, alias);
}

// 3. Tu función principal de actualización
export async function updateDashboard(API_BASE, token, alias, range = {}) {
    if (!token) return;

    try {
        // ... tu lógica de fetch para kpiRes ...
        const kpiRes = await fetch(`${API_BASE}/api/kpis`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        const kpis = await kpiRes.json();

        // Actualización de los nuevos módulos
        const transactions = kpis.transactions || [];
        updateComisionesUI(transactions);
        updateOperacionesUI(transactions);
        
        if (kpis.bankInsights) {
            updateBancosUI(kpis.bankInsights);
        }

        // ... resto de tus actualizaciones (Red, Pay, etc.)
        updateRedSection(kpis);
        updatePaySection(kpis);
        updateSwitchSection(kpis);
        updateP2PSection(kpis);

    } catch (err) {
        console.error("Error en sincronización:", err);
    }
}