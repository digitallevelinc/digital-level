import { fUSDT, fVES, inject } from './utils.js';

export function updateCiclosUI(kpis = {}, bankInsights = []) {
    const activeBanks = bankInsights.filter(b => (b.volumeSell || b.volumeBuy || b.fiatBalance > 0));
    
    // Capital base para definir una vuelta completa
    const CAPITAL_TRABAJO = 500; 

    let totalCyclesAllBanks = 0;
    let totalProfitAcumulado = 0;

    const processedBanks = activeBanks.map(b => {
        const volVendidoUsd = b.volumeSell || (b.volumeSellFiat / (b.sellRate || 1));
        
        // C-TOT: Ciclos cerrados (vueltas completas de capital)
        const ciclosCompletados = Math.floor(volVendidoUsd / CAPITAL_TRABAJO);
        totalCyclesAllBanks += ciclosCompletados;

        // Profit Neto (Realizado hasta ahora)
        const netProfitRealizado = (b.profit || 0) - ((b.feeBuy || 0) + (b.feeSell || 0));
        totalProfitAcumulado += netProfitRealizado;

        // ¿Está el ciclo en progreso? 
        // Si hay bolívares en el banco, significa que la recompra no ha terminado.
        const estaEnProgreso = b.fiatBalance > 100; // Más de 100 VES se considera "trabajando"

        return { ...b, ciclosCompletados, netProfitRealizado, estaEnProgreso };
    });

    // KPI Superior: Ganancia Promedio Real por Ciclo
    const profitPorCicloPromedio = totalCyclesAllBanks > 0 ? (totalProfitAcumulado / totalCyclesAllBanks) : 0;
    
    inject('kpi-cycle-value', `≈ ${fUSDT(profitPorCicloPromedio)}`); 
    inject('cycle-count', totalCyclesAllBanks.toString().padStart(2, '0'));
    inject('active-banks-count', processedBanks.length.toString().padStart(2, '0'));

    const insightsContainer = document.getElementById('cycle-banks-insights');
    if (insightsContainer) {
        insightsContainer.innerHTML = processedBanks.map(bank => {
            const bsEnBanco = bank.fiatBalance || 0;
            const bsYaComprados = bank.volumeBuyFiat || 0;
            const volVentaCiclo = (bank.volumeSellFiat % (CAPITAL_TRABAJO * bank.sellRate)) || (CAPITAL_TRABAJO * bank.sellRate);
            
            // Lógica de Barra
            const totalActual = bsEnBanco + bsYaComprados;
            const pGris = Math.min((bsEnBanco / volVentaCiclo) * 100, 100);
            const pAmarillo = Math.min((bsYaComprados / volVentaCiclo) * 100, 100);
            const pVerde = totalActual > volVentaCiclo ? ((totalActual - volVentaCiclo) / totalActual) * 100 : 0;

            // Render del "Bombillo" de estado
            const statusLight = bank.estaEnProgreso 
                ? `<span class="relative flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                   </span>`
                : `<span class="h-2 w-2 rounded-full bg-gray-700"></span>`;

            const statusText = bank.estaEnProgreso ? 'TRABAJANDO' : 'CICLO CERRADO';

            return `
            <div class="group/item border-b border-white/[0.03] pb-4 last:border-0">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-3">
                        <div class="flex flex-col items-center justify-center min-w-[35px] h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <span class="text-[13px] font-black text-emerald-400 leading-none">${bank.ciclosCompletados}</span>
                            <span class="text-[7px] text-emerald-500/60 font-bold uppercase">C-TOT</span>
                        </div>
                        <div>
                            <div class="flex items-center gap-1.5">
                                ${statusLight}
                                <span class="text-[11px] font-black text-gray-100 uppercase block leading-none">${bank.bank}</span>
                            </div>
                            <span class="text-[8px] ${bank.estaEnProgreso ? 'text-emerald-500/70' : 'text-gray-500'} font-bold uppercase tracking-wider">${statusText}</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-[11px] font-mono font-bold text-emerald-400 leading-none">+${fUSDT(bank.netProfitRealizado)}</p>
                        <p class="text-[7px] text-gray-600 uppercase font-black mt-1 italic">Profit Acumulado</p>
                    </div>
                </div>
                
                <div class="space-y-1.5">
                    <div class="h-1.5 bg-black/40 rounded-full overflow-hidden flex border border-white/5">
                        <div class="h-full bg-gray-600/40 transition-all duration-1000" style="width: ${pGris}%"></div>
                        <div class="h-full bg-[#F3BA2F] transition-all duration-1000" style="width: ${pAmarillo}%"></div>
                        <div class="h-full bg-emerald-500 transition-all duration-1000" style="width: ${pVerde}%"></div>
                    </div>
                    <div class="flex justify-between text-[7px] font-bold uppercase text-gray-500">
                        <span>Faltan: ${fVES(bsEnBanco)}</span>
                        <span>Ritmo: ${fUSDT(profitPorCicloPromedio)} / Ciclo</span>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }
}