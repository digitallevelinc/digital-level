import { fUSDT, inject } from './utils.js';

function clampPercent(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric < 0) return 0;
    if (numeric > 100) return 100;
    return numeric;
}

function fVESInline(value) {
    return Number(value || 0).toLocaleString('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function buildCycleLabel(bank) {
    const saleUsdt = Number(bank.currentCycleSaleUSDT || 0);
    const remainingFiat = Number(bank.currentCycleFiatRemaining || 0);
    const hasCycle = saleUsdt > 0 || remainingFiat > 0 || Number(bank.activeVerdictsCount || 0) > 0;

    if (!hasCycle) {
        return 'Sin ciclo activo';
    }

    return `${fUSDT(saleUsdt)} / ${fVESInline(remainingFiat)}`;
}

function buildPagoMovilLabel(bank, config = {}) {
    const limit = Number(config.pagoMovilLimitVes || 0);
    const consumed = Number(bank.pm?.buyVol || 0);

    if (limit <= 0) {
        return {
            value: '0.00 / 0.00',
            meta: 'Sin monto cargado',
            progress: 0,
        };
    }

    const remaining = Math.max(0, limit - consumed);
    return {
        value: `${fVESInline(remaining)} / ${fVESInline(limit)}`,
        meta: `${fVESInline(consumed)} usado`,
        progress: clampPercent((consumed / limit) * 100),
    };
}

export function updateSidebarMonitor(kpis = {}, bankInsights = []) {
    const summary = kpis.metrics || kpis.kpis || kpis.summary || {};
    const audit = kpis.audit || {};

    const critical = kpis.critical || {};

    const CAPITAL_INICIAL = parseFloat(critical.capitalInicial || kpis.capitalInicial || audit.initialCapital || 0);
    const profit = parseFloat(critical.profitTotalUSDT || summary.totalProfit || 0);
    const teorico = parseFloat(audit.currentBalanceEstimate || critical.balanceTotal || 0);

    const binanceSource =
        audit.realBalance ??
        summary.totalBalance ??
        critical.realBalance ??
        0;
    const binance = parseFloat(binanceSource || 0);

    const diferencia = critical.balanceGap !== undefined ? parseFloat(critical.balanceGap) : (binance - teorico);

    let totalCycles = 0;
    let totalNetProfit = 0;

    bankInsights.forEach(b => {
        const cycles = Number(b.completedCycles ?? b.countSell ?? b.sellCount ?? 0);
        const rawProfit = b.totalProfitUSDT ?? b.profit ?? 0;
        const net = Number(rawProfit);

        totalCycles += cycles;
        totalNetProfit += net;
    });

    const avg = totalCycles > 0
        ? (totalNetProfit / totalCycles)
        : (kpis.critical?.averageCycleProfit ?? 0);

    inject('side-teorico', fUSDT(teorico));
    inject('side-binance', fUSDT(binance));
    inject('side-profit-total', fUSDT(profit));
    inject('side-avg-ciclo', fUSDT(avg));

    const alias = audit.operatorAlias || kpis.operatorAlias || 'N/A';
    inject('side-operator-alias', alias);
    inject('side-initial-capital', fUSDT(CAPITAL_INICIAL));

    let days = audit.periodDays || 0;
    let startDateStr = audit.startDate || kpis.fechaInicio;

    if (startDateStr) {
        const start = new Date(startDateStr);
        const now = new Date();
        const diffTime = Math.abs(now - start);
        days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    inject('side-period-days', days);

    let formattedStartDate = '---';
    if (startDateStr) {
        const d = new Date(startDateStr);
        formattedStartDate = d.toLocaleDateString('es-VE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } else if (days > 0) {
        const d = new Date();
        d.setDate(d.getDate() - days);
        formattedStartDate = d.toLocaleDateString('es-VE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    inject('side-start-date', formattedStartDate);

    const integrity = audit.integrityScore ?? 100;
    const integrityEl = document.getElementById('side-integrity-score');
    if (integrityEl) {
        integrityEl.textContent = `${integrity}% Score`;
        integrityEl.className = `text-[10px] font-black px-2 py-0.5 rounded border ${integrity < 80 ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`;
    }

    const discEl = document.getElementById('side-discrepancia');
    if (discEl) {
        discEl.textContent = fUSDT(diferencia);
        discEl.className = `text-sm font-mono font-black tracking-tighter ${diferencia < 0 ? 'text-rose-500' : 'text-emerald-400'}`;
    }

    const openVerdicts = kpis.judge?.openVerdictsCount ?? 0;
    inject('side-verdicts-count', `${openVerdicts} Open`);

    const listContainer = document.getElementById('side-banks-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    bankInsights.forEach(bank => {
        const activeVerdicts = bank.activeVerdictsCount ?? 0;
        const cycles = bank.completedCycles ?? bank.countSell ?? 0;
        const ops = bank.transactionCount ?? bank.totalOps ?? ((bank.countSell || 0) + (bank.countBuy || 0));
        const progress = clampPercent(bank.currentCycleProgress);
        const cycleLabel = buildCycleLabel(bank);
        const pagoMovil = buildPagoMovilLabel(bank, kpis.config || {});

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
            <div class="text-[12px] font-mono font-black tracking-tight text-white/90 mt-1">
                ${cycleLabel}
            </div>
            <div class="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-[#F3BA2F] transition-all duration-700 ease-out" style="width: ${progress}%"></div>
            </div>
            <div class="flex items-center justify-between gap-3 mt-1">
                <span class="text-[10px] text-slate-500 font-black uppercase tracking-[0.18em]">Pago Movil</span>
                <span class="text-[10px] text-slate-500 font-black tracking-tight">${pagoMovil.meta}</span>
            </div>
            <div class="text-[12px] font-mono font-black tracking-tight text-white/90">
                ${pagoMovil.value}
            </div>
            <div class="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-[#F3BA2F] transition-all duration-700 ease-out" style="width: ${pagoMovil.progress}%"></div>
            </div>
        `;
        listContainer.appendChild(div);
    });
}
