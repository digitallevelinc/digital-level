// src/scripts/dashboard/ciclos.js
import { fUSDT, fVES, inject } from './utils.js';

export function updateCiclosUI(kpis = {}) {
    // --- MOCK DATA PARA TESTING DE PROFIT POR BANCO (Fallback si no hay data) ---
    const mockBanks = [];

    const summary = kpis.metrics || kpis.summary || {};
    const bankInsights = (kpis.bankInsights && kpis.bankInsights.length > 0) ? kpis.bankInsights : mockBanks;

    // 1. KPIs Globales
    // Usamos cycleProfit directo de metrics
    inject('kpi-cycle-value', fUSDT(summary.cycleProfit ?? 0));

    // Si no viene cycleCount en metrics, sumamos los ciclos de los bancos (buyCount + sellCount o transactionCount)
    // El JSON trae transactionCount por banco.
    const totalCycles = summary.cycleCount ?? bankInsights.reduce((acc, b) => acc + (b.transactionCount || 0), 0);
    inject('cycle-count', (totalCycles).toString().padStart(2, '0'));

    inject('active-banks-count', bankInsights.length.toString().padStart(2, '0'));

    // 2. Renderizado de la Tabla de Rendimiento
    const insightsContainer = document.getElementById('cycle-banks-insights');
    if (insightsContainer) {
        // Mapa de colores por banco (Hardcoded o dinámico)
        const bankColors = {
            'Banesco': '#00aa44',
            'Mercantil': '#1d4ed8',
            'Provincial': '#004481',
            'Bancamiga': '#00b386', // Ejemplo color
            'PagoMovil': '#facc15', // Ejemplo color
            'BANK': '#6b7280'
        };

        insightsContainer.innerHTML = bankInsights.map(bank => {
            const name = bank.bank || bank.name || 'Desconocido';
            const vol = bank.volumeSell || bank.sellFiat || 0; // Volumen de venta en VES suele ser el relevante para "ciclo"
            const cycles = bank.transactionCount || ((bank.buyCount || 0) + (bank.sellCount || 0)) || 0;
            const profit = bank.profit || 0;
            const color = bankColors[name] || '#F3BA2F';

            // Calculamos porcentaje visual para la barra basado en volumen o profit relativo
            // Si el backend no envía 'pct', calculamos relativo al total de volumen de venta
            const totalVol = bankInsights.reduce((acc, b) => acc + (b.volumeSell || b.sellFiat || 0), 0) || 1;
            const pct = bank.margin !== undefined ? Math.abs(bank.margin) : ((vol / totalVol) * 100);
            // Nota: margin puede ser negativo en el JSON (-77%), visualmente la barra de "progreso" quizás deba ser volumen.
            // Voy a usar (vol / totalVol) * 100 para la barra visual o un valor fijo si se prefiere. 
            // En el código original usaban bank.pct.

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
                        <p class="text-[10px] font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'} leading-none">${profit >= 0 ? '+' : ''}${fUSDT(profit)}</p>
                        <p class="text-[7px] text-gray-600 uppercase font-bold mt-1">Profit Banco</p>
                    </div>
                </div>
                
                <div class="flex items-center gap-3">
                    <div class="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                        <div class="h-full transition-all duration-1000" 
                             style="width: ${Math.min(pct * 2, 100)}%; background-color: ${color}">
                        </div>
                    </div>
                    <span class="text-[8px] font-mono text-gray-500">${fVES(vol)}</span>
                </div>
            </div>
            `;
        }).join('');
    }
}