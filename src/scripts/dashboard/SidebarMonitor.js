import { fUSDT, inject } from './utils.js';

export function updateSidebarMonitor(kpis = {}, bankInsights = []) {
    // 1. Unificamos lógica con profit.js para consistencia total
    const summary = kpis.metrics || kpis.kpis || kpis.summary || {};
    const audit = kpis.audit || {};

    // 2. Extraer valores (Lógica Espejo de profit.js)
    // Prioridad: 1. audit.initialCapital, 2. kpis.initialCapital, 3. config, 4. default
    const CAPITAL_INICIAL = parseFloat(audit.initialCapital || kpis.initialCapital || kpis.config?.initialCapital || 5400);
    const profit = summary.totalProfit ?? 0; // Inyectado desde el orquestador

    // Cálculos Sincronizados
    const teorico = CAPITAL_INICIAL + profit;
    const binance = parseFloat(audit.realBalance || 0);
    const diferencia = binance - teorico;

    // Cálculo Dinámico de Promedio (Igual que ciclos.js)
    let totalCycles = 0;
    let totalNetProfit = 0;

    bankInsights.forEach(b => {
        const cycles = Number(b.completedCycles ?? b.countSell ?? b.sellCount ?? 0);
        const fees = Number(b.feeBuy || 0) + Number(b.feeSell || 0);
        const rawProfit = b.totalProfitUSDT ?? b.profit ?? 0;
        const net = Number(rawProfit) - fees;

        totalCycles += cycles;
        totalNetProfit += net;
    });

    const avg = totalCycles > 0 ? (totalNetProfit / totalCycles) : 0;

    // 3. Inyectar en los IDs del Sidebar
    inject('side-teorico', fUSDT(teorico));
    inject('side-binance', fUSDT(binance));
    inject('side-profit-total', fUSDT(profit));
    inject('side-avg-ciclo', fUSDT(avg));

    // 3.1 Inyectar información del operador
    inject('side-operator-alias', audit.operatorAlias || 'N/A');
    inject('side-initial-capital', fUSDT(parseFloat(audit.initialCapital || 0)));
    inject('side-period-days', audit.periodDays || 0);

    // Calcular fecha de inicio (hoy - periodDays)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (audit.periodDays || 0));
    const formattedStartDate = startDate.toLocaleDateString('es-VE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    inject('side-start-date', formattedStartDate);

    // 3.2 Integrity & Verdicts
    const integrity = audit.integrityScore ?? 100;
    const integrityEl = document.getElementById('side-integrity-score');
    if (integrityEl) {
        integrityEl.textContent = `${integrity}% Score`;
        integrityEl.className = `text-[10px] font-black px-2 py-0.5 rounded border ${integrity < 80 ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`;
    }

    // 4. Manejo de la Discrepancia
    const discEl = document.getElementById('side-discrepancia');
    if (discEl) {
        discEl.textContent = fUSDT(diferencia);
        // Misma lógica visual: si es negativo es dinero "en la calle" (no necesariamente malo, pero rojo para alerta)
        discEl.className = `text-sm font-mono font-black tracking-tighter ${diferencia < 0 ? 'text-rose-500' : 'text-emerald-400'}`;
    }

    // 4.1 Verdicts Count
    const openVerdicts = kpis.judge?.openVerdictsCount ?? 0;
    inject('side-verdicts-count', `${openVerdicts} Open`);

    // 5. Lista de Bancos
    const listContainer = document.getElementById('side-banks-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    bankInsights.forEach(bank => {
        // Fallbacks robustos tras el merge
        const activeVerdicts = bank.activeVerdictsCount ?? 0;
        const cycles = bank.completedCycles ?? bank.countSell ?? 0;
        const ops = bank.transactionCount ?? bank.totalOps ?? ((bank.countSell || 0) + (bank.countBuy || 0));

        const progress = Math.min((ops / 1000) * 100, 100);

        const div = document.createElement('div');
        div.className = 'bg-white/[0.02] p-3 rounded-xl border border-white/5 flex flex-col gap-2 transition-all hover:bg-white/[0.04]';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex flex-col">
                    <span class="text-xs font-black text-white uppercase italic tracking-wider">${bank.bankName || bank.bank}</span>
                    <span class="text-[10px] text-[#F3BA2F] font-black uppercase mt-1 tracking-wide">
                        ${cycles} Vueltas • ${activeVerdicts} Activas
                    </span>
                </div>
                <div class="text-right">
                    <span class="text-sm font-mono font-black ${ops >= 900 ? 'text-rose-500' : 'text-emerald-400'} tracking-tight">${ops}</span>
                    <span class="text-[9px] text-gray-500 block font-black uppercase tracking-wider">Ops Mes</span>
                </div>
            </div>
            <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-[#F3BA2F] transition-all duration-700 ease-out" style="width: ${progress}%"></div>
            </div>
        `;
        listContainer.appendChild(div);
    });
}