import { fUSDT, inject } from './utils.js';

export function updateSidebarMonitor(kpis = {}, bankInsights = []) {
    // 1. Unificamos lógica con profit.js para consistencia total
    const summary = kpis.metrics || kpis.kpis || kpis.summary || {};
    const audit = kpis.audit || {};

    // 2. Extraer valores (Lógica Espejo de profit.js)
    const critical = kpis.critical || {};

    // CAPITAL: Prioridad Mirror de profit.js
    const CAPITAL_INICIAL = parseFloat(critical.capitalInicial || kpis.capitalInicial || audit.initialCapital || 0);

    // PROFIT: Prioridad Mirror
    const profit = parseFloat(critical.profitTotalUSDT || summary.totalProfit || 0);

    // BALANCES: Prioridad Mirror
    // El 'teorico' es lo que el sistema dice que deberíamos tener (Balance Dinámico del Back)
    const teorico = parseFloat(critical.balanceTotal || 0);

    // El 'binance' es el real verificado (si no hay, espejamos teorico para balance cuadrado)
    const binance = parseFloat(critical.realBalance || audit.realBalance || critical.balanceTotal || 0);

    // La diferencia/gap
    const diferencia = critical.balanceGap !== undefined ? parseFloat(critical.balanceGap) : (binance - teorico);

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

    const avg = kpis.critical?.averageCycleProfit ?? (totalCycles > 0 ? (totalNetProfit / totalCycles) : 0);

    // 3. Inyectar en los IDs del Sidebar
    inject('side-teorico', fUSDT(teorico));
    inject('side-binance', fUSDT(binance));
    inject('side-profit-total', fUSDT(profit));
    inject('side-avg-ciclo', fUSDT(avg));

    // 3.1 Inyectar información del operador
    const alias = audit.operatorAlias || kpis.operatorAlias || 'N/A';
    inject('side-operator-alias', alias);
    inject('side-initial-capital', fUSDT(CAPITAL_INICIAL));

    // Calcular días y fecha inicio
    let days = audit.periodDays || 0;
    let startDateStr = audit.startDate || kpis.fechaInicio;

    if (startDateStr) {
        // Si tenemos fecha de inicio, calculamos días
        const start = new Date(startDateStr);
        const now = new Date();
        const diffTime = Math.abs(now - start);
        days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    inject('side-period-days', days);

    // Formatear fecha de inicio
    let formattedStartDate = '---';
    if (startDateStr) {
        const d = new Date(startDateStr);
        formattedStartDate = d.toLocaleDateString('es-VE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } else if (days > 0) {
        // Fallback si tenemos días pero no fecha (calculado hacia atrás)
        const d = new Date();
        d.setDate(d.getDate() - days);
        formattedStartDate = d.toLocaleDateString('es-VE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

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