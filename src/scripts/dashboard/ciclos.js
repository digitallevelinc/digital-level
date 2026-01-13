// src/scripts/dashboard/ciclos.js
import { fUSDT, fVES, inject } from './utils.js';

export function updateCiclosUI(kpis = {}) {
    // --- MOCK DATA PARA TESTING DE PROFIT POR BANCO ---
    const mockBanks = [
        { name: 'Banesco', vol: 12500, cycles: 8, profit: 45.20, pct: 85, color: '#00aa44' },
        { name: 'Mercantil', vol: 8400, cycles: 5, profit: 32.10, pct: 45, color: '#1d4ed8' },
        { name: 'Provincial', vol: 3200, cycles: 2, profit: 12.80, pct: 20, color: '#004481' }
    ];

    const summary = kpis.metrics || kpis.summary || { cycleProfit: 90.10, cycleCount: 15 };
    const bankInsights = (kpis.bankInsights && kpis.bankInsights.length > 0) ? kpis.bankInsights : mockBanks;

    // 1. KPIs Globales
    inject('kpi-cycle-value', fUSDT(summary.cycleProfit ?? 0));
    inject('cycle-count', (summary.cycleCount ?? 0).toString().padStart(2, '0'));
    inject('active-banks-count', bankInsights.length.toString().padStart(2, '0'));

    // 2. Renderizado de la Tabla de Rendimiento
    const insightsContainer = document.getElementById('cycle-banks-insights');
    if (insightsContainer) {
        insightsContainer.innerHTML = bankInsights.map(bank => {
            const name = bank.name || bank.bankName;
            const vol = bank.vol || bank.volume || 0;
            const cycles = bank.cycles || bank.bankCycles || 0;
            const profit = bank.profit || 0; // Ganancia por este banco
            const color = bank.color || '#F3BA2F';

            return `
            <div class="group/item border-b border-white/[0.03] pb-3 last:border-0">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <div class="flex items-center justify-center w-5 h-5 rounded bg-white/5 border border-white/10 text-[9px] font-bold text-emerald-500">
                            ${cycles}
                        </div>
                        <span class="text-[10px] font-black text-gray-200 uppercase tracking-tighter">${name}</span>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-bold text-emerald-400 leading-none">+${fUSDT(profit)}</p>
                        <p class="text-[7px] text-gray-600 uppercase font-bold mt-1">Profit Banco</p>
                    </div>
                </div>
                
                <div class="flex items-center gap-3">
                    <div class="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                        <div class="h-full transition-all duration-1000" 
                             style="width: ${bank.pct || 50}%; background-color: ${color}">
                        </div>
                    </div>
                    <span class="text-[8px] font-mono text-gray-500">${fVES(vol)}</span>
                </div>
            </div>
            `;
        }).join('');
    }
}