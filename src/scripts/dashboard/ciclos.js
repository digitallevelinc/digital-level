import { fUSDT, fVES, inject } from './utils.js';

export function updateCiclosUI(kpis = {}, bankInsights = []) {
    const summary = kpis.metrics || kpis.summary || {};
    
    // 1. FILTRADO DE BANCOS ACTIVOS
    // Solo tomamos bancos que tengan volumen o balance para no ensuciar la lista
    const activeBanks = bankInsights.filter(b => (b.volumeSell || b.volumeBuy || b.fiatBalance > 0));

    // 2. CÁLCULO DE CICLOS TOTALES Y MEDIA
    let totalCyclesAllBanks = 0;
    let totalNetProfit = 0;

    activeBanks.forEach(b => {
        // Un ciclo se define por la cantidad de vueltas (ventas completadas)
        // Usamos sellCount como el disparador de ciclo cerrado/en proceso
        const bankCycles = b.countSell || 0; 
        totalCyclesAllBanks += bankCycles;

        // Calculamos Profit Neto del banco (restando fees de Binance)
        const netProfitBanco = (b.profit || 0) - ((b.feeBuy || 0) + (b.feeSell || 0));
        totalNetProfit += netProfitBanco;
    });

    // 3. KPI: GANANCIA MEDIA POR CICLO
    // Media = Profit Total Neto / Cantidad de Ciclos Totales
    const avgProfitPerCycle = totalCyclesAllBanks > 0 
        ? (totalNetProfit / totalCyclesAllBanks) 
        : 0;

    // Inyección de KPIs principales
    inject('kpi-cycle-value', `≈ ${fUSDT(avgProfitPerCycle)}`);
    inject('cycle-count', totalCyclesAllBanks.toString().padStart(2, '0'));
    inject('active-banks-count', activeBanks.length.toString().padStart(2, '0'));

    // 4. RENDERIZADO DEL DESGLOSE OPERATIVO
    const insightsContainer = document.getElementById('cycle-banks-insights');
    if (insightsContainer) {
        const bankColors = {
            'mercantil': '#1d4ed8',
            'banesco': '#00aa44',
            'bnc': '#f97316',
            'provincial': '#004481',
            'pagomovil': '#facc15',
            'bancamiga': '#0b6e4f',
            'bank': '#6b7280',
            'bbvabank': '#004481'
        };

        insightsContainer.innerHTML = activeBanks.map(bank => {
            const id = bank.bank.toLowerCase().split(' ')[0];
            const name = bank.bank;
            const netProfit = (bank.profit || 0) - ((bank.feeBuy || 0) + (bank.feeSell || 0));
            const cycles = bank.countSell || 0;
            const color = bankColors[id] || '#F3BA2F';

            // Lógica de Recompra (Barrita):
            // Si hay mucho FIAT en balance, la barra de "recompra" debe resaltar.
            // Usamos el margen o el volumen de venta para la intensidad.
            const totalVol = activeBanks.reduce((acc, b) => acc + (b.volumeSell || 0), 0) || 1;
            const weightPct = ((bank.volumeSell || 0) / totalVol) * 100;

            return `
            <div class="group/item border-b border-white/[0.03] pb-3 last:border-0">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <div class="flex items-center justify-center w-6 h-6 rounded bg-white/5 border border-white/10 text-[10px] font-mono font-bold text-emerald-500 shadow-inner">
                            ${cycles}
                        </div>
                        <div>
                            <span class="text-[10px] font-black text-gray-200 uppercase tracking-tighter block leading-none">${name}</span>
                            <span class="text-[7px] text-gray-500 font-bold">CICLOS COMPLETADOS</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-mono font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'} leading-none">
                            ${netProfit >= 0 ? '+' : ''}${fUSDT(netProfit)}
                        </p>
                        <p class="text-[7px] text-gray-600 uppercase font-black mt-1">Net Profit</p>
                    </div>
                </div>
                
                <div class="flex items-center gap-3">
                    <div class="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden flex border border-white/5">
                        <div class="h-full transition-all duration-1000 shadow-[0_0_8px] shadow-current" 
                             style="width: ${Math.min(weightPct, 100)}%; background-color: ${color}">
                        </div>
                    </div>
                    <div class="flex flex-col text-right">
                        <span class="text-[8px] font-mono font-bold text-gray-400 leading-none">${fVES(bank.volumeSell || 0)}</span>
                        <span class="text-[6px] text-gray-600 font-bold uppercase">Vol Operado</span>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }
}