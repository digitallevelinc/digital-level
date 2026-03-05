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

function formatUsdtInline(value) {
    return `${formatPlain(value)} USDT`;
}

function weightedAverage(items = [], getValue = () => 0, getWeight = () => 0) {
    let weightedSum = 0;
    let totalWeight = 0;

    items.forEach((item) => {
        const value = Number(getValue(item) || 0);
        const weight = Number(getWeight(item) || 0);
        if (!Number.isFinite(value) || value <= 0) return;
        if (!Number.isFinite(weight) || weight <= 0) return;
        weightedSum += value * weight;
        totalWeight += weight;
    });

    if (totalWeight <= 0) return 0;
    return weightedSum / totalWeight;
}

function getBankMonitorSummary(kpis = {}, bankInsights = []) {
    const banks = Array.isArray(bankInsights) ? bankInsights : [];
    const ceilingBanks = banks.filter((bank) => Number(bank.ceilingRate || 0) > 0);
    const sellReferenceBanks = banks.filter(
        (bank) => Number(bank.lastSellRate || bank.sellRate || bank.weightedAvgSellRate || bank.avgSellRate || 0) > 0
    );
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
    const getSellWeight = (bank) => {
        const sellFiat = Number(bank.sellFiat || 0);
        if (sellFiat > 0) return sellFiat;

        const sellVolUsdt = Number(bank.sellVolUSDT || bank.realizedVolumeUSDT || bank.spreadSellUsdt || 0);
        const sellRate = Number(bank.lastSellRate || bank.sellRate || bank.weightedAvgSellRate || bank.avgSellRate || 0);
        if (sellVolUsdt > 0 && sellRate > 0) return sellVolUsdt * sellRate;
        return sellVolUsdt > 0 ? sellVolUsdt : 0;
    };

    const avgSellRateFromBanks = weightedAverage(
        sellReferenceBanks,
        (bank) => bank.lastSellRate ?? bank.sellRate ?? bank.weightedAvgSellRate ?? bank.avgSellRate,
        getSellWeight
    );
    const avgCeilingRateFromBanks = weightedAverage(
        ceilingBanks,
        (bank) => bank.ceilingRate,
        getSellWeight
    );
    const avgSellRate = avgSellRateFromBanks > 0
        ? avgSellRateFromBanks
        : Number(kpis?.bankSummary?.generalSellRate || 0);
    const avgCeilingRate = avgCeilingRateFromBanks > 0
        ? avgCeilingRateFromBanks
        : Number(kpis?.bankSummary?.generalCeilingRate || 0);

    return {
        levelLabel,
        verificationPercent: Number(firstPercent || 0),
        avgCeilingRate,
        avgSellRate,
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
    const limits = config?.bankPagoMovilLimitsVes && typeof config.bankPagoMovilLimitsVes === 'object'
        ? config.bankPagoMovilLimitsVes
        : config?.bankSpendLimitsVes && typeof config.bankSpendLimitsVes === 'object'
            ? config.bankSpendLimitsVes
        : {};
    const key = normalizeBankLimitKey(bank);
    const limit = Number(limits?.[key] || 0);
    const consumed = Number(bank.pm?.buyVol || 0);

    if (limit <= 0) {
        return {
            value: '0.00 / 0.00',
            meta: 'Sin tope global',
            progress: 0,
        };
    }

    const remaining = Math.max(0, limit - consumed);
    return {
        value: `${fVESInline(remaining)} / ${fVESInline(limit)}`,
        meta: consumed <= limit
            ? `${fVESInline(consumed)} usado`
            : `Exceso ${fVESInline(consumed - limit)}`,
        progress: clampPercent((consumed / limit) * 100),
    };
}

function normalizeBankName(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('bbva') || raw.includes('provincial')) return 'provincial';
    if (raw.includes('mercantil')) return 'mercantil';
    if (raw.includes('banesco')) return 'banesco';
    if (raw.includes('bnc')) return 'bnc';
    if (raw.includes('bancamiga')) return 'bancamiga';
    if (raw.includes('fintech') || raw === 'bank') return 'bank';
    return raw.replace(/\s+/g, '');
}

function normalizeBankLimitKey(bank) {
    return normalizeBankName(bank?.bankName || bank?.bank || '');
}

function isPromiseVerdict(verdict) {
    const parseMode = String(verdict?.parseMode || '').trim().toUpperCase();
    if (parseMode === 'PROMISE' || parseMode === 'GLOBAL_PROMISE') return true;
    return Number(verdict?.expectedRebuyUsdt || 0) > 0 || Number(verdict?.expectedRebuyFiat || 0) > 0;
}

function buildPromiseSummaryByBank(kpis = {}) {
    const openVerdicts = Array.isArray(kpis?.judge?.openVerdicts) ? kpis.judge.openVerdicts : [];
    const summary = new Map();

    openVerdicts.forEach((verdict) => {
        if (!isPromiseVerdict(verdict)) return;

        const bankKey = normalizeBankName(verdict?.paymentMethod);
        if (!bankKey) return;

        const fallbackUsdt = Number(verdict?.saleAmount || 0);
        const fallbackFiat = Number(verdict?.fiatReceived || 0);
        const expectedUsdt = Number(verdict?.expectedRebuyUsdt ?? fallbackUsdt);
        const expectedFiat = Number(verdict?.expectedRebuyFiat ?? fallbackFiat);
        const consumedUsdt = Math.max(0, Number(verdict?.consumedRebuyUsdt || 0));
        const consumedFiat = Math.max(0, Number(verdict?.consumedRebuyFiat || 0));
        const boundedConsumedUsdt = Math.min(consumedUsdt, expectedUsdt);
        const boundedConsumedFiat = Math.min(consumedFiat, expectedFiat);
        const pendingUsdt = Math.max(0, expectedUsdt - boundedConsumedUsdt);
        const pendingFiat = Math.max(0, expectedFiat - boundedConsumedFiat);
        const status = String(verdict?.status || '').toUpperCase();

        const bucket = summary.get(bankKey) || {
            promisedUsdt: 0,
            promisedFiat: 0,
            pendingUsdt: 0,
            pendingFiat: 0,
            activePromises: 0,
        };

        bucket.promisedUsdt += expectedUsdt;
        bucket.promisedFiat += expectedFiat;
        bucket.pendingUsdt += pendingUsdt;
        bucket.pendingFiat += pendingFiat;
        if (status !== 'CLOSED') {
            bucket.activePromises += 1;
        }

        summary.set(bankKey, bucket);
    });

    return summary;
}

function buildPromiseLabel(bank, promiseSummaryByBank = new Map()) {
    const key = normalizeBankLimitKey(bank);
    const promise = promiseSummaryByBank.get(key) || {
        promisedUsdt: 0,
        promisedFiat: 0,
        pendingUsdt: 0,
        pendingFiat: 0,
        activePromises: 0,
    };
    const pendingUsdt = Number(promise.pendingUsdt || 0);
    const pendingFiat = Number(promise.pendingFiat || 0);
    const promisedUsdt = Number(promise.promisedUsdt || 0);

    return {
        value: `${formatUsdtInline(pendingUsdt)} | ${fVESInline(pendingFiat)} VES`,
        meta: promise.activePromises > 0
            ? `${promise.activePromises} activa${promise.activePromises === 1 ? '' : 's'}`
            : 'Sin promesa activa',
        progress: promisedUsdt > 0 ? clampPercent((pendingUsdt / promisedUsdt) * 100) : 0,
        pendingUsdt,
        pendingFiat,
        activePromises: Number(promise.activePromises || 0),
    };
}

function buildVesControlSummaryByBank(kpis = {}) {
    const openVerdicts = Array.isArray(kpis?.judge?.openVerdicts) ? kpis.judge.openVerdicts : [];
    const summary = new Map();

    openVerdicts.forEach((verdict) => {
        const bankKey = normalizeBankName(verdict?.paymentMethod);
        if (!bankKey) return;

        const saleRate = Number(verdict?.saleRate || 0);
        const fallbackExpectedFiat = Number(verdict?.fiatReceived || 0);
        const expectedUsdt = Number(verdict?.expectedRebuyUsdt ?? verdict?.saleAmount ?? 0);
        const expectedFiat = Number(
            verdict?.expectedRebuyFiat
            ?? (expectedUsdt > 0 && saleRate > 0 ? expectedUsdt * saleRate : fallbackExpectedFiat)
            ?? 0
        );

        let remainingFiat = Number(verdict?.remainingFiat);
        if (!Number.isFinite(remainingFiat)) {
            const consumedFiat = Number(verdict?.consumedRebuyFiat || 0);
            remainingFiat = Math.max(0, expectedFiat - Math.max(0, consumedFiat));
        }

        const boundedExpected = Math.max(0, expectedFiat);
        const boundedRemaining = Math.min(Math.max(0, remainingFiat), boundedExpected);
        const consumed = Math.max(0, boundedExpected - boundedRemaining);

        const bucket = summary.get(bankKey) || {
            inflowFiat: 0,
            availableFiat: 0,
            consumedFiat: 0,
            activeVerdicts: 0,
        };

        bucket.inflowFiat += boundedExpected;
        bucket.availableFiat += boundedRemaining;
        bucket.consumedFiat += consumed;
        bucket.activeVerdicts += 1;

        summary.set(bankKey, bucket);
    });

    return summary;
}

function buildBankVesLimitLabel(bank, _config = {}, vesControlSummaryByBank = new Map()) {
    const key = normalizeBankLimitKey(bank);
    const dynamicSummary = vesControlSummaryByBank.get(key);
    const hasDynamic = Boolean(dynamicSummary);
    if (!hasDynamic) {
        return {
            value: '0.00 / 0.00',
            meta: 'Sin flujo activo',
            progress: 0,
            limit: 0,
            current: 0,
            hasFlow: false,
        };
    }

    const available = Number(dynamicSummary.availableFiat || 0);
    const consumed = Number(dynamicSummary.consumedFiat || 0);
    const inflowFiat = Number(dynamicSummary.inflowFiat || 0);
    const inferredCapFromFlow = Math.max(0, inflowFiat, available + consumed);
    let effectiveCap = Math.max(0, inferredCapFromFlow);

    if (available > effectiveCap) {
        effectiveCap = available;
    }

    if (effectiveCap <= 0) {
        return {
            value: '0.00 / 0.00',
            meta: 'Sin flujo activo',
            progress: 0,
            limit: 0,
            current: 0,
            hasFlow: false,
        };
    }

    const progress = available <= 0 ? 0 : clampPercent((available / effectiveCap) * 100);
    const burned = Math.max(0, effectiveCap - available);

    return {
        value: `${fVESInline(available)} / ${fVESInline(effectiveCap)}`,
        meta: burned <= 0.01
            ? 'Barra llena'
            : available <= 0.01
                ? 'Lote quemado'
                : `${fVESInline(burned)} quemado`,
        progress,
        limit: effectiveCap,
        current: available,
        hasFlow: true,
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
    inject('side-ceiling-level-meta', `${formatPlain(bankSummary.verificationPercent)}% | Techo prom. ponderado`);
    inject('side-ceiling-sell-rate', `Venta prom. ponderada: ${formatPlain(bankSummary.avgSellRate)} VES/USDT`);
    inject('side-ceiling-level-badge', `${bankSummary.banksWithCeiling} Bancos`);
    inject('side-spread-value', formatSignedUsdt(bankSummary.spreadProfitUsdt));
    inject('side-spread-meta', `${formatPlain(bankSummary.spreadPercent)}%`);

    const spreadEl = document.getElementById('side-spread-value');
    if (spreadEl) {
        spreadEl.className = `text-[1.2rem] mt-2 font-mono font-black tracking-tight ${bankSummary.spreadProfitUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
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
    const promiseSummaryByBank = buildPromiseSummaryByBank(kpis);
    const vesControlSummaryByBank = buildVesControlSummaryByBank(kpis);

    bankInsights.forEach((bank) => {
        const activeVerdicts = Number(bank.activeVerdictsCount || 0);
        const ops = Number(bank.transactionCount ?? bank.totalOps ?? ((bank.countSell || 0) + (bank.countBuy || 0)));
        const pagoMovil = buildPagoMovilLabel(bank, kpis.config || {});
        const vesLimit = buildBankVesLimitLabel(
            bank,
            kpis.config || {},
            vesControlSummaryByBank
        );
        const spreadLabel = buildSpreadLabel(bank);
        const promiseLabel = buildPromiseLabel(bank, promiseSummaryByBank);
        const promiseTextClass = promiseLabel.pendingUsdt > 0 || promiseLabel.pendingFiat > 0
            ? 'text-amber-300'
            : 'text-white/90';
        const vesBarClass = vesLimit.hasFlow ? 'bg-sky-400' : 'bg-slate-500/40';
        const statusLabel = `${ops} Ops | ${activeVerdicts} Activas`;

        const div = document.createElement('div');
        div.className = 'bg-white/[0.02] p-4 rounded-xl border border-white/5 flex flex-col gap-2.5 transition-all hover:bg-white/[0.04]';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex flex-col">
                    <span class="text-[13px] font-black text-white uppercase italic tracking-wider">${bank.bankName || bank.bank}</span>
                    <span class="text-[11px] text-[#F3BA2F] font-black uppercase mt-1 tracking-wide">
                        ${statusLabel}
                    </span>
                </div>
                <div class="text-right">
                    <span class="text-[1rem] font-mono font-black ${Number(bank.profit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-500'} tracking-tight">${formatSignedUsdt(bank.profit || 0)}</span>
                    <span class="text-[9px] text-gray-500 block font-black uppercase tracking-wider">Profit Neto</span>
                </div>
            </div>
            <div class="text-[13px] font-mono font-black tracking-tight text-white/90 mt-1">
                ${spreadLabel}
            </div>
            <div class="flex items-center justify-between gap-3 mt-1">
                <span class="text-[11px] text-slate-500 font-black uppercase tracking-[0.18em]">Parseo 2.0</span>
                <span class="text-[11px] text-slate-500 font-black tracking-tight">${promiseLabel.meta}</span>
            </div>
            <div class="text-[13px] font-mono font-black tracking-tight ${promiseTextClass}">
                ${promiseLabel.value}
            </div>
            <div class="flex items-center justify-between gap-3 mt-1">
                <span class="text-[11px] text-slate-500 font-black uppercase tracking-[0.18em]">Pago Movil</span>
                <span class="text-[11px] text-slate-500 font-black tracking-tight">${pagoMovil.meta}</span>
            </div>
            <div class="text-[13px] font-mono font-black tracking-tight text-white/90">
                ${pagoMovil.value}
            </div>
            <div class="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-[#F3BA2F] transition-all duration-700 ease-out" style="width: ${pagoMovil.progress}%"></div>
            </div>
            <div class="flex items-center justify-between gap-3 mt-2">
                <span class="text-[11px] text-slate-500 font-black uppercase tracking-[0.18em]">Control VES</span>
                <span class="text-[11px] text-slate-500 font-black tracking-tight">${vesLimit.meta}</span>
            </div>
            <div class="text-[13px] font-mono font-black tracking-tight text-white/90">
                ${vesLimit.value}
            </div>
            <div class="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mt-1">
                <div class="h-full ${vesBarClass} transition-all duration-700 ease-out" style="width: ${vesLimit.progress}%"></div>
            </div>
        `;
        listContainer.appendChild(div);
    });
}
