import { fUSDT, inject } from './utils.js';

export function updateSidebarMonitor(kpis = {}, bankInsights = []) {
    // 1. Usamos exactamente la misma lógica de tu función updateMainKpis
    const summary = kpis.metrics || kpis.kpis || kpis.summary || {};
    
    // 2. Extraer valores (Espejo de lo que ya ves en el body)
    const teorico = summary.totalBalance ?? summary.balance ?? 0;
    const binance = kpis.binanceBalance ?? summary.binanceBalance ?? 0;
    const profit  = summary.totalProfit ?? 0; // El cumulativeProfit que inyectamos en el orquestador
    const avg     = summary.cycleProfit ?? summary.cycleGain ?? 0;
    const diferencia = Number(binance) - Number(teorico);

    // 3. Inyectar en los IDs del Sidebar
    inject('side-teorico', fUSDT(teorico));
    inject('side-binance', fUSDT(binance));
    inject('side-profit-total', fUSDT(profit));
    inject('side-avg-ciclo', fUSDT(avg));

    // 4. Manejo de la Discrepancia
    const discEl = document.getElementById('side-discrepancia');
    if (discEl) {
        discEl.textContent = fUSDT(diferencia);
        discEl.className = `text-sm font-mono font-black tracking-tighter ${diferencia < 0 ? 'text-rose-500' : 'text-emerald-400'}`;
    }

    // 5. Lista de Bancos
    const listContainer = document.getElementById('side-banks-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    bankInsights.forEach(bank => {
        const ops = bank.totalOps || (Number(bank.countSell || 0) + Number(bank.countBuy || 0));
        const progress = Math.min((ops / 1000) * 100, 100);

        const div = document.createElement('div');
        div.className = 'bg-white/[0.02] p-3 rounded-xl border border-white/5 flex flex-col gap-2';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex flex-col">
                    <span class="text-[10px] font-black text-white uppercase italic">${bank.bankName}</span>
                    <span class="text-[7px] text-[#F3BA2F] font-black uppercase mt-0.5">Vueltas: ${bank.countSell || 0}</span>
                </div>
                <div class="text-right">
                    <span class="text-[11px] font-mono font-black ${ops >= 900 ? 'text-rose-500' : 'text-emerald-400'}">${ops}</span>
                    <span class="text-[6px] text-gray-500 block font-black uppercase">Ops Mes</span>
                </div>
            </div>
            <div class="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div class="h-full bg-[#F3BA2F] transition-all" style="width: ${progress}%"></div>
            </div>
        `;
        listContainer.appendChild(div);
    });
}