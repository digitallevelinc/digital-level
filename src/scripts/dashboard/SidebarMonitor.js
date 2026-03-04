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

function formatSignedVesInline(value) {
    const amount = Number(value || 0);
    const sign = amount < 0 ? '-' : '';
    return `${sign}${fVESInline(Math.abs(amount))}`;
}

function formatPlain(value, digits = 2) {
    return Number(value || 0).toLocaleString('es-VE', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function formatSignedUsdt(value) {
    const amount = Number(value || 0);
    const sign = amount > 0 ? '+' : '';
    return `${sign}${formatPlain(amount)} USDT`;
}

function average(values = []) {
    const valid = values
        .map((value) => Number(value || 0))
        .filter((value) => Number.isFinite(value) && value > 0);

    if (valid.length === 0) return 0;
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function getBankMonitorSummary(kpis = {}, bankInsights = []) {
    const banks = Array.isArray(bankInsights) ? bankInsights : [];
    const ceilingBanks = banks.filter((bank) => Number(bank.ceilingRate || 0) > 0);
    const spreadBanks = banks.filter(
        (bank) => Number(bank.spreadSellUsdt || 0) > 0 || Number(bank.spreadProfitUsdt || 0) !== 0
    );

    const firstLevel = banks.find((bank) => String(bank.verificationLevel || '').trim())?.verificationLevel
        || kpis.config?.verificationLevel
        || '';
    const firstPercent = banks.find((bank) => Number(bank.verificationPercent || 0) > 0)?.verificationPercent
        ?? kpis.config?.verificationPercent
        ?? 0;
    const normalizedLevel = String(firstLevel || '').trim();
    const levelLabel = normalizedLevel
        ? normalizedLevel.charAt(0).toUpperCase() + normalizedLevel.slice(1)
        : 'Sin nivel';

    const spreadProfitUsdt = spreadBanks.reduce(
        (sum, bank) => sum + Number(bank.spreadProfitUsdt || 0),
        0
    );
    const spreadBaseUsdt = spreadBanks.reduce(
        (sum, bank) => sum + Number(bank.spreadSellUsdt || 0),
        0
    );

    return {
        levelLabel,
        verificationPercent: Number(firstPercent || 0),
        avgCeilingRate: average(ceilingBanks.map((bank) => bank.ceilingRate)),
        spreadProfitUsdt,
        spreadPercent: spreadBaseUsdt > 0 ? (spreadProfitUsdt / spreadBaseUsdt) * 100 : 0,
        banksWithCeiling: ceilingBanks.length,
    };
}

function buildSpreadLabel(bank) {
    const spread = Number(bank.spreadProfitUsdt || 0);
    const profit = Number(bank.profit || 0);
    return `${formatSignedUsdt(spread)} | Neto ${formatSignedUsdt(profit)}`;
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

function normalizeBankLimitKey(bank) {
    const raw = String(bank?.bankName || bank?.bank || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('bbva') || raw.includes('provincial')) return 'provincial';
    if (raw.includes('mercantil')) return 'mercantil';
    if (raw.includes('banesco')) return 'banesco';
    if (raw.includes('bnc')) return 'bnc';
    if (raw.includes('bancamiga')) return 'bancamiga';
    if (raw.includes('fintech') || raw === 'bank') return 'bank';
    return raw.replace(/\s+/g, '');
}

function buildBankVesLimitLabel(bank, config = {}) {
    const limits = config?.bankSpendLimitsVes && typeof config.bankSpendLimitsVes === 'object'
        ? config.bankSpendLimitsVes
        : {};
    const key = normalizeBankLimitKey(bank);
    const limit = Number(limits?.[key] || 0);
    const current = Number(bank?.fiatBalance || 0);

    if (limit <= 0) {
        return {
            value: `${formatSignedVesInline(current)} / 0.00`,
            meta: 'Sin tope cargado',
            progress: 0,
        };
    }

    const remaining = limit - current;
    const progress = current <= 0 ? 0 : clampPercent((current / limit) * 100);

    return {
        value: `${formatSignedVesInline(current)} / ${fVESInline(limit)}`,
        meta: remaining >= 0
            ? `${fVESInline(remaining)} disponibles`
            : `Exceso ${fVESInline(Math.abs(remaining))}`,
        progress,
    };
}

export function updateSidebarMonitor(kpis = {}, bankInsights = []) {
    const summary = kpis.metrics || kpis.kpis || kpis.summary || {};
    const audit = kpis.audit || {};
    const critical = kpis.critical || {};

    const capitalInicial = parseFloat(critical.capitalInicial || kpis.capitalInicial || audit.initialCapital || 0);
    const profit = parseFloat(critical.profitTotalUSDT || summary.totalProfit || 0);
    const teorico = parseFloat(audit.currentBalanceEstimate || critical.balanceTotal || 0);

    const binanceSource =
        audit.realBalance ??
        summary.totalBalance ??
        critical.realBalance ??
        0;
    const binance = parseFloat(binanceSource || 0);

    const diferencia = critical.balanceGap !== undefined ? parseFloat(critical.balanceGap) : (binance - teorico);
    const bankSummary = getBankMonitorSummary(kpis, bankInsights);

    inject('side-teorico', fUSDT(teorico));
    inject('side-binance', fUSDT(binance));
    inject('side-profit-total', fUSDT(profit));
    inject('side-ceiling-level-label', `TECHO (${String(bankSummary.levelLabel || 'Sin nivel').toUpperCase()})`);
    inject('side-ceiling-level-value', bankSummary.avgCeilingRate > 0 ? formatPlain(bankSummary.avgCeilingRate) : '0.00');
    inject('side-ceiling-level-meta', `${formatPlain(bankSummary.verificationPercent)}% | Prom. de techos`);
    inject('side-ceiling-level-badge', `${bankSummary.banksWithCeiling} Bancos`);
    inject('side-spread-value', formatSignedUsdt(bankSummary.spreadProfitUsdt));
    inject('side-spread-meta', `${formatPlain(bankSummary.spreadPercent)}%`);

    const spreadEl = document.getElementById('side-spread-value');
    if (spreadEl) {
        spreadEl.className = `text-[1.05rem] mt-2 font-mono font-black tracking-tight ${bankSummary.spreadProfitUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    const alias = audit.operatorAlias || kpis.operatorAlias || 'N/A';
    inject('side-operator-alias', alias);
    inject('side-initial-capital', fUSDT(capitalInicial));

    let days = audit.periodDays || 0;
    const startDateStr = audit.startDate || kpis.fechaInicio;

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

    const openVerdicts = kpis.judge?.openVerdictsCount ?? kpis.judge?.summary?.openVerdictsCount ?? 0;
    inject('side-verdicts-count', `${openVerdicts} Open`);

    const listContainer = document.getElementById('side-banks-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    bankInsights.forEach((bank) => {
        const activeVerdicts = Number(bank.activeVerdictsCount || 0);
        const ops = Number(bank.transactionCount ?? bank.totalOps ?? ((bank.countSell || 0) + (bank.countBuy || 0)));
        const pagoMovil = buildPagoMovilLabel(bank, kpis.config || {});
        const vesLimit = buildBankVesLimitLabel(bank, kpis.config || {});
        const spreadLabel = buildSpreadLabel(bank);

        const div = document.createElement('div');
        div.className = 'bg-white/[0.02] p-3 rounded-xl border border-white/5 flex flex-col gap-2 transition-all hover:bg-white/[0.04]';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex flex-col">
                    <span class="text-xs font-black text-white uppercase italic tracking-wider">${bank.bankName || bank.bank}</span>
                    <span class="text-[10px] text-[#F3BA2F] font-black uppercase mt-1 tracking-wide">
                        ${ops} Ops | ${activeVerdicts} Activas
                    </span>
                </div>
                <div class="text-right">
                    <span class="text-sm font-mono font-black ${Number(bank.profit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-500'} tracking-tight">${formatSignedUsdt(bank.profit || 0)}</span>
                    <span class="text-[9px] text-gray-500 block font-black uppercase tracking-wider">Profit Neto</span>
                </div>
            </div>
            <div class="text-[12px] font-mono font-black tracking-tight text-white/90 mt-1">
                ${spreadLabel}
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
            <div class="flex items-center justify-between gap-3 mt-2">
                <span class="text-[10px] text-slate-500 font-black uppercase tracking-[0.18em]">Control VES</span>
                <span class="text-[10px] text-slate-500 font-black tracking-tight">${vesLimit.meta}</span>
            </div>
            <div class="text-[12px] font-mono font-black tracking-tight text-white/90">
                ${vesLimit.value}
            </div>
            <div class="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mt-1">
                <div class="h-full ${Number(bank.fiatBalance || 0) > Number((kpis.config?.bankSpendLimitsVes || {})?.[normalizeBankLimitKey(bank)] || 0) && Number((kpis.config?.bankSpendLimitsVes || {})?.[normalizeBankLimitKey(bank)] || 0) > 0 ? 'bg-rose-400' : 'bg-sky-400'} transition-all duration-700 ease-out" style="width: ${vesLimit.progress}%"></div>
            </div>
        `;
        listContainer.appendChild(div);
    });
}
