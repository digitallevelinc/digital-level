// 1. IMPORTACIONES (Deben ir todas al inicio del archivo)
import { fUSDT, fVES, inject } from './dashboard/utils.js';
import { updateRedSection } from './dashboard/red.js';
import { updatePaySection } from './dashboard/pay.js';
import { updateSwitchSection } from './dashboard/switch.js';
import { updateP2PSection } from './dashboard/p2p.js';

// Nuevos módulos refactorizados
import { updateComisionesUI } from './dashboard/comisiones.js';
import { updateOperacionesUI } from './dashboard/operaciones.js';
import { updateBancosUI } from './dashboard/bancos.js'; // Asegúrate de que este archivo existe

export async function updateDashboard(API_BASE, token, alias, range = {}) {
    if (!token) return;

    try {
        // ... tu lógica de fetch para kpiRes y statsRes ...
        // (Asumiendo que kpis y stats ya están definidos aquí)
        
        const kpis = await kpiRes.json();
        const stats = await statsRes.json();

        // 2. INYECCIONES DE RENDIMIENTO CRÍTICO
        inject('kpi-balance', fUSDT(stats.currentBalance || kpis.critical.balanceTotal));
        inject('kpi-profit', fUSDT(kpis.critical.profitTotalUSDT), true);

        // 3. LOGÍSTICA DE CARTERAS
        updateRedSection(kpis);
        updatePaySection(kpis);
        updateSwitchSection(kpis);
        updateP2PSection(kpis);

        // 4. NUEVOS MÓDULOS (Operaciones, Comisiones y Bancos)
        const transactions = kpis.transactions || [];
        
        updateComisionesUI(transactions);
        updateOperacionesUI(transactions);
        
        if (kpis.bankInsights) {
            updateBancosUI(kpis.bankInsights);
        }

    } catch (err) {
        console.error("Sync Error:", err);
    }
}