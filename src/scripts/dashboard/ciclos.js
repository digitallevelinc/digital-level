import { fUSDT, fVES, inject } from './utils.js';

export function updateCiclosUI(kpis = {}, bankInsights = []) {
    // 1. CONFIGURACIÓN INICIAL
    const CAPITAL_TRABAJO = kpis.config?.capitalTrabajo || kpis.capitalTrabajo || 500;

    let totalCyclesAllBanks = 0;
    let totalProfitNetoAcumulado = 0;
    let countBancosOperando = 0;

    if (!bankInsights || bankInsights.length === 0) return;

    // 2. PROCESAMIENTO DE DATOS
    const processedBanks = bankInsights.map(b => {
        // Mapeo híbrido: soporta bankBreakdown (nuevo) y bankInsights (viejo)
        const ciclosCompletados = Number(b.completedCycles ?? b.countSell ?? b.sellCount ?? 0);

        // Fees: En bankBreakdown no veo fees explícitos en el ejemplo, asumimos 0 o usamos los legacy si disponibles
        const fees = Number(b.feeBuy || 0) + Number(b.feeSell || 0);

        // Profit: En bankBreakdown tenemos 'totalProfitUSDT' (acumulado) o 'currentCycleProfitUSDT'.
        // Para "Profit Acumulado" usamos totalProfitUSDT.
        const rawProfit = b.totalProfitUSDT ?? b.profit ?? 0;
        const netProfit = Number(rawProfit) - fees; // Si fees ya están deducidos en backend, esto podría redundar, pero por seguridad.

        // FIAT Balance
        // En bankBreakdown: "currentCycleFiatRemaining"? O "currentCycleTotalFiat"? 
        // Usualmente el balance real es lo que queda por gastar.
        const fiatBalance = Number(b.currentCycleFiatRemaining ?? b.fiatBalance ?? 0);

        // Estado:
        // Si hay fiatRemaining > rango minimo (ej 100), está recomprando.
        const estaRecomprando = fiatBalance > 100;
        const tieneHistorial = ciclosCompletados > 0;

        if (estaRecomprando || tieneHistorial) {
            countBancosOperando++;
        }

        totalCyclesAllBanks += ciclosCompletados;
        totalProfitNetoAcumulado += netProfit;

        // Para la barra de progreso (Recomprado vs Saldo)
        // Necesitamos saber cuánto es el "Total" del ciclo.
        // En bankBreakdown tenemos: currentCycleTotalFiat = currentCycleFiatRemaining + currentCycleFiatSpent
        // Si no, estimamos con CAPITAL_TRABAJO * tasa
        const totalFiatCiclo = b.currentCycleTotalFiat ?? ((b.CAPITAL_TRABAJO || 500) * (b.sellRate || 1));

        return {
            ...b,
            ciclosCompletados,
            netProfit,
            estaRecomprando,
            fiatBalance,
            totalFiatCiclo, // Dato extra para cálculo preciso de porcentaje
            CAPITAL_TRABAJO
        };
    });

    // 3. CÁLCULO DE KPIS SUPERIORES
    const profitPorCiclo = totalCyclesAllBanks > 0
        ? (totalProfitNetoAcumulado / totalCyclesAllBanks)
        : 0;

    inject('kpi-cycle-value', `≈ ${fUSDT(profitPorCiclo)}`);
    inject('cycle-count', totalCyclesAllBanks.toString().padStart(2, '0'));
    inject('active-banks-count', countBancosOperando.toString().padStart(2, '0'));

    // 4. RENDERIZADO DE LA LISTA
    const insightsContainer = document.getElementById('cycle-banks-insights');
    if (insightsContainer) {
        const activeList = processedBanks.filter(b => b.ciclosCompletados > 0 || b.estaRecomprando);

        if (activeList.length === 0) {
            insightsContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 opacity-30">
                    <div class="text-[10px] font-black uppercase tracking-widest">No hay ciclos activos</div>
                    <div class="text-[8px] mt-1 italic font-bold text-emerald-500">Esperando venta P2P...</div>
                </div>`;
            return;
        }

        insightsContainer.innerHTML = activeList.map(bank => {
            const tasaVenta = Number(bank.sellRate || 1);
            const metaFiat = bank.CAPITAL_TRABAJO * tasaVenta;
            const pGris = Math.min((bank.fiatBalance / metaFiat) * 100, 100);
            const pAmarillo = Math.max(0, 100 - pGris);

            // Estilos dinámicos para estado de ciclos
            const isZeroCycles = bank.ciclosCompletados === 0;
            const cycleContainerClass = isZeroCycles
                ? "bg-gray-500/5 border-gray-500/10 text-gray-600"
                : "bg-emerald-500/10 border-emerald-500/20 shadow-lg text-emerald-400";

            const cycleNumberClass = isZeroCycles ? "text-gray-500" : "text-emerald-400";
            const cycleLabelClass = isZeroCycles ? "text-gray-600" : "text-emerald-500/60";

            return `
            <div class="group/item border-b border-white/[0.03] py-4 last:border-0 px-2 hover:bg-white/[0.01] transition-colors">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-4">
                        <div class="flex flex-col items-center justify-center min-w-[48px] h-12 rounded-xl border backdrop-blur-sm ${cycleContainerClass}">
                            <span class="text-lg font-black leading-none tracking-tight ${cycleNumberClass}">${bank.ciclosCompletados}</span>
                            <span class="text-[9px] font-black uppercase tracking-wide mt-0.5 ${cycleLabelClass}">VUELTAS</span>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="relative flex h-2.5 w-2.5">
                                    ${bank.estaRecomprando ? '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>' : ''}
                                    <span class="relative inline-flex rounded-full h-2.5 w-2.5 ${bank.estaRecomprando ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-gray-700'}"></span>
                                </span>
                                <span class="text-sm font-black text-gray-100 uppercase tracking-wide">${bank.bank}</span>
                            </div>
                            <p class="text-[10px] text-gray-500 font-bold uppercase mt-1 italic tracking-wide">
                                ${bank.estaRecomprando ? 'Consumiendo FIAT...' : (isZeroCycles ? 'Esperando inicio...' : 'Ciclo Completado')}
                            </p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-base font-mono font-black ${bank.netProfit > 0 ? 'text-emerald-400' : 'text-gray-500'} leading-none tracking-tight">+${fUSDT(bank.netProfit)}</p>
                        <p class="text-[9px] text-gray-600 uppercase font-black mt-1 italic tracking-wide">Profit Acumulado</p>
                    </div>
                </div>
                
                <div class="space-y-1.5 px-1">
                    <div class="h-2 bg-black/40 rounded-full overflow-hidden flex border border-white/5 shadow-inner">
                        <div class="h-full bg-[#F3BA2F] transition-all duration-1000 shadow-[0_0_12px_rgba(243,186,47,0.3)]" 
                             style="width: ${pAmarillo}%"></div>
                        <div class="h-full bg-gray-600/30 transition-all duration-1000" 
                             style="width: ${pGris}%"></div>
                    </div>
                    <div class="flex justify-between text-[9px] font-bold uppercase tracking-wide">
                        <span class="${pAmarillo > 90 ? 'text-[#F3BA2F]' : (pAmarillo === 0 ? 'text-gray-600' : 'text-gray-500')} transition-colors">
                            ${pAmarillo === 0 ? 'Sin compras P2P' : `Recomprado: ${Math.round(pAmarillo)}%`}
                        </span>
                        <span class="text-gray-500 italic">
                            Saldo en Banco: ${fVES(bank.fiatBalance)}
                        </span>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }
}