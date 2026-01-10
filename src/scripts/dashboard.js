import { fUSDT, fVES, inject } from './dashboard/utils.js';
import { updateRedSection } from './dashboard/red.js';
import { updatePaySection } from './dashboard/pay.js';
import { updateSwitchSection } from './dashboard/switch.js';
import { updateP2PSection } from './dashboard/p2p.js';

// Mantén aquí getPresetRange, buildRangeQuery y renderRangeLabel por ahora
// ... (copia esas funciones del original) ...

export async function updateDashboard(API_BASE, token, alias, range = {}) {
    if (!token) return;
    try {
        renderRangeLabel(range);
        const query = buildRangeQuery(range);
        const [kpiRes, statsRes] = await Promise.all([
            fetch(`${API_BASE}/api/kpis${query}`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE}/api/stats${query}`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (!kpiRes.ok || !statsRes.ok) throw new Error("Error de servidor");
        const kpis = await kpiRes.json();
        const stats = await statsRes.json();

        // Inyecciones Críticas
        inject('kpi-balance', fUSDT(stats.currentBalance || kpis.critical.balanceTotal));
        inject('kpi-profit', fUSDT(kpis.critical.profitTotalUSDT), true);
        // ... rest of your injects ...

        // Llamadas modulares
        updateRedSection(kpis);
        updatePaySection(kpis);
        updateSwitchSection(kpis);
        updateP2PSection(kpis);

        // Lógica de tabla de bancos (podemos modularizarla luego)
        renderBankTable(kpis.bankInsights);

    } catch (err) {
        console.error("Sync Error:", err);
    }
}

function renderBankTable(insights) {
    const tableBody = document.getElementById('bank-table-body');
    if (!tableBody || !insights) return;
    tableBody.innerHTML = insights.map(b => `
        <tr class="hover:bg-white/[0.02] border-l-4 border-l-gray-700">
            <td class="px-3 py-4 font-bold text-white">${b.bank}</td>
            <td class="px-3 py-4 text-center font-mono">${fVES(b.fiatBalance)}</td>
            <td class="px-3 py-4 text-center font-bold" style="color: ${b.profit >= 0 ? '#10b981' : '#ef4444'}">${fUSDT(b.profit)}</td>
        </tr>
    `).join('');
}

export function initDashboard() {
    // ... tu lógica de initDashboard igual que antes ...
}