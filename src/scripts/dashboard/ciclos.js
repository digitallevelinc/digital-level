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
        const ciclosCompletados = Number(b.countSell || b.sellCount || 0);
        const fees = Number(b.feeBuy || 0) + Number(b.feeSell || 0);
        const netProfit = Number(b.profit || 0) - fees;

        const fiatBalance = Number(b.fiatBalance || 0);
        // Consideramos activo si tiene vueltas o si tiene más de 100 VES por recomprar
        const estaRecomprando = fiatBalance > 100;
        const tieneHistorial = ciclosCompletados > 0;
        
        if (estaRecomprando || tieneHistorial) {
            countBancosOperando++;
        }

        totalCyclesAllBanks += ciclosCompletados;
        totalProfitNetoAcumulado += netProfit;

        return { 
            ...b, 
            ciclosCompletados, 
            netProfit, 
            estaRecomprando, 
            fiatBalance,
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
            
            // Meta visual: cuanto FIAT representa el capital de trabajo
            const metaFiat = bank.CAPITAL_TRABAJO * tasaVenta;
            
            // LÓGICA DE BARRA BINANCE:
            // pGris: Lo que queda en el banco (saldo actual)
            // pAmarillo: Lo que ya se "gastó" o recompró (Capital Total - Saldo Actual)
            const pGris = Math.min((bank.fiatBalance / metaFiat) * 100, 100);
            const pAmarillo = Math.max(0, 100 - pGris);

            return `
            <div class="group/item border-b border-white/[0.03] py-4 last:border-0 px-1 hover:bg-white/[0.01] transition-colors">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-3">
                        <div class="flex flex-col items-center justify-center min-w-[40px] h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shadow-lg">
                            <span class="text-[14px] font-black text-emerald-400 leading-none">${bank.ciclosCompletados}</span>
                            <span class="text-[6px] text-emerald-500/60 font-black uppercase tracking-tight">VUELTAS</span>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="relative flex h-2 w-2">
                                    ${bank.estaRecomprando ? '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>' : ''}
                                    <span class="relative inline-flex rounded-full h-2 w-2 ${bank.estaRecomprando ? 'bg-emerald-500' : 'bg-gray-700'}"></span>
                                </span>
                                <span class="text-[12px] font-black text-gray-100 uppercase tracking-tight">${bank.bank}</span>
                            </div>
                            <p class="text-[8px] text-gray-500 font-bold uppercase mt-1 italic tracking-tighter">
                                ${bank.estaRecomprando ? 'Consumiendo FIAT...' : 'Ciclo Completado'}
                            </p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-[12px] font-mono font-black text-emerald-400 leading-none">+${fUSDT(bank.netProfit)}</p>
                        <p class="text-[7px] text-gray-600 uppercase font-black mt-1 italic tracking-tighter">Profit Acumulado</p>
                    </div>
                </div>
                
                <div class="space-y-1.5">
                    <div class="h-1.5 bg-black/40 rounded-full overflow-hidden flex border border-white/5 shadow-inner">
                        <div class="h-full bg-[#F3BA2F] transition-all duration-1000 shadow-[0_0_8px_rgba(243,186,47,0.4)]" 
                             style="width: ${pAmarillo}%"></div>
                        <div class="h-full bg-gray-600/30 transition-all duration-1000" 
                             style="width: ${pGris}%"></div>
                    </div>
                    <div class="flex justify-between text-[7px] font-bold uppercase tracking-tighter">
                        <span class="${pAmarillo > 90 ? 'text-[#F3BA2F]' : 'text-gray-500'}">
                            Recomprado: ${Math.round(pAmarillo)}%
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