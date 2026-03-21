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
    const referenceSellBanks = ceilingBanks.length > 0 ? ceilingBanks : sellReferenceBanks;
    const referenceSellRateFromBanks = weightedAverage(
        referenceSellBanks,
        (bank) => bank.lastSellRate ?? bank.sellRate ?? bank.weightedAvgSellRate ?? bank.avgSellRate,
        getSellWeight
    );
    const avgSellRate = avgSellRateFromBanks > 0
        ? avgSellRateFromBanks
        : Number(kpis?.bankSummary?.generalSellRate || 0);
    const avgCeilingRate = avgCeilingRateFromBanks > 0
        ? avgCeilingRateFromBanks
        : Number(kpis?.bankSummary?.generalCeilingRate || 0);
    const referenceSellRate = referenceSellRateFromBanks > 0 ? referenceSellRateFromBanks : avgSellRate;

    return {
        levelLabel,
        verificationPercent: Number(firstPercent || 0),
        avgCeilingRate,
        avgSellRate,
        referenceSellRate,
        spreadProfitUsdt,
        spreadPercent: spreadBaseUsdt > 0 ? (spreadProfitUsdt / spreadBaseUsdt) * 100 : 0,
        banksWithCeiling: ceilingBanks.length,
        banksWithSell: sellReferenceBanks.length,
    };
}

function buildSpreadLabel(bank, cyclesCompleted = 0) {
    const spread = Number(bank.spreadProfitUsdt || 0);
    const profit = Number(bank.profit || 0);
    if (Math.abs(spread) < 0.0001 && Math.abs(profit) < 0.0001 && Number(cyclesCompleted || 0) <= 0) {
        return 'Sin spread realizado aun';
    }
    return `Spread ${formatSignedUsdt(spread)} | Neto ${formatSignedUsdt(profit)}`;
}

function buildPagoMovilLabel(bank, config = {}) {
    const limits = config?.bankPagoMovilLimitsVes && typeof config.bankPagoMovilLimitsVes === 'object'
        ? config.bankPagoMovilLimitsVes
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
        meta: consumed > limit
            ? `Exceso ${fVESInline(consumed - limit)} | Reinicia 12:00`
            : remaining <= 0.01
                ? 'Tope agotado | Reinicia 12:00'
                : consumed <= 0.01
                    ? 'Reinicia 12:00'
                    : `${fVESInline(consumed)} usado | Reinicia 12:00`,
        progress: clampPercent((remaining / limit) * 100),
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

const CANONICAL_BANK_LABELS = {
    provincial: 'BBVA/Provincial',
    mercantil: 'Mercantil',
    banesco: 'Banesco',
    bnc: 'BNC',
    bancamiga: 'Bancamiga',
    bank: 'BANK',
    pagomovil: 'Pago Movil',
};

function toNumber(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function getCanonicalBankDisplayName(value) {
    const normalized = normalizeBankName(value);
    if (!normalized) return String(value || '').trim();
    return CANONICAL_BANK_LABELS[normalized] || String(value || '').trim() || normalized.toUpperCase();
}

function mergeWeightedMetric(currentValue, currentWeight, nextValue, nextWeight) {
    const leftValue = toNumber(currentValue);
    const rightValue = toNumber(nextValue);
    const leftWeight = Math.max(0, toNumber(currentWeight));
    const rightWeight = Math.max(0, toNumber(nextWeight));
    const totalWeight = leftWeight + rightWeight;

    if (totalWeight > 0) {
        return (leftValue * leftWeight + rightValue * rightWeight) / totalWeight;
    }

    return rightValue > 0 ? rightValue : leftValue;
}

function mergeChannelStats(current = {}, incoming = {}) {
    const currentBuyWeight = toNumber(current.buyVol || current.buyVolUSDT);
    const incomingBuyWeight = toNumber(incoming.buyVol || incoming.buyVolUSDT);
    const currentSellWeight = toNumber(current.sellVol || current.sellVolUSDT);
    const incomingSellWeight = toNumber(incoming.sellVol || incoming.sellVolUSDT);

    return {
        ...current,
        sellCount: toNumber(current.sellCount) + toNumber(incoming.sellCount),
        buyCount: toNumber(current.buyCount) + toNumber(incoming.buyCount),
        sellVol: toNumber(current.sellVol) + toNumber(incoming.sellVol),
        buyVol: toNumber(current.buyVol) + toNumber(incoming.buyVol),
        sellFee: toNumber(current.sellFee) + toNumber(incoming.sellFee),
        buyFee: toNumber(current.buyFee) + toNumber(incoming.buyFee),
        avgBuyRate: mergeWeightedMetric(current.avgBuyRate, currentBuyWeight, incoming.avgBuyRate, incomingBuyWeight),
        avgSellRate: mergeWeightedMetric(current.avgSellRate, currentSellWeight, incoming.avgSellRate, incomingSellWeight),
        buyVolUSDT: toNumber(current.buyVolUSDT) + toNumber(incoming.buyVolUSDT),
        sellVolUSDT: toNumber(current.sellVolUSDT) + toNumber(incoming.sellVolUSDT),
    };
}

function mergeBankInsightsByAlias(bankInsights = []) {
    const mergedByKey = new Map();

    bankInsights.forEach((entry) => {
        const key = normalizeBankLimitKey(entry) || normalizeBankName(entry?.bankName || entry?.bank);
        if (!key) return;

        const current = mergedByKey.get(key);
        if (!current) {
            const displayName = getCanonicalBankDisplayName(entry?.bankName || entry?.bank);
            mergedByKey.set(key, {
                ...entry,
                bank: displayName || entry?.bank || entry?.bankName || '',
                bankName: displayName || entry?.bankName || entry?.bank || '',
                pm: { ...(entry?.pm || {}) },
                trf: { ...(entry?.trf || {}) },
            });
            return;
        }

        const currentBuyWeight = toNumber(current.buyFiat || current.buyVolUSDT || current.pm?.buyVol || current.trf?.buyVol);
        const entryBuyWeight = toNumber(entry.buyFiat || entry.buyVolUSDT || entry.pm?.buyVol || entry.trf?.buyVol);
        const currentSellWeight = toNumber(current.sellFiat || current.sellVolUSDT || current.realizedVolumeUSDT || current.pm?.sellVol || current.trf?.sellVol);
        const entrySellWeight = toNumber(entry.sellFiat || entry.sellVolUSDT || entry.realizedVolumeUSDT || entry.pm?.sellVol || entry.trf?.sellVol);
        const currentCycleWeight = toNumber(current.currentCycleTotalFiat || current.currentCycleSaleUSDT || current.completedCycles);
        const entryCycleWeight = toNumber(entry.currentCycleTotalFiat || entry.currentCycleSaleUSDT || entry.completedCycles);
        const currentProfitWeight = toNumber(current.currentCycleFiatSpent || current.currentCycleTotalFiat || current.currentCycleSaleUSDT);
        const entryProfitWeight = toNumber(entry.currentCycleFiatSpent || entry.currentCycleTotalFiat || entry.currentCycleSaleUSDT);
        const currentBreakEvenWeight = toNumber(current.currentCycleFiatRemaining || current.currentCycleSaleUSDT);
        const entryBreakEvenWeight = toNumber(entry.currentCycleFiatRemaining || entry.currentCycleSaleUSDT);
        const displayName = getCanonicalBankDisplayName(current.bankName || current.bank || entry.bankName || entry.bank);

        const merged = {
            ...current,
            bank: displayName || current.bank || entry.bank || '',
            bankName: displayName || current.bankName || entry.bankName || '',
            isFavorite: Boolean(current.isFavorite || entry.isFavorite),
            fiatBalance: toNumber(current.fiatBalance) + toNumber(entry.fiatBalance),
            usdtBalance: toNumber(current.usdtBalance) + toNumber(entry.usdtBalance),
            profit: toNumber(current.profit) + toNumber(entry.profit),
            buyFiat: toNumber(current.buyFiat) + toNumber(entry.buyFiat),
            sellFiat: toNumber(current.sellFiat) + toNumber(entry.sellFiat),
            buyVolUSDT: toNumber(current.buyVolUSDT) + toNumber(entry.buyVolUSDT),
            sellVolUSDT: toNumber(current.sellVolUSDT) + toNumber(entry.sellVolUSDT),
            realizedFiatBase: toNumber(current.realizedFiatBase) + toNumber(entry.realizedFiatBase),
            realizedVolumeUSDT: toNumber(current.realizedVolumeUSDT) + toNumber(entry.realizedVolumeUSDT),
            spreadBuyUsdt: toNumber(current.spreadBuyUsdt) + toNumber(entry.spreadBuyUsdt),
            spreadSellUsdt: toNumber(current.spreadSellUsdt) + toNumber(entry.spreadSellUsdt),
            spreadProfitUsdt: toNumber(current.spreadProfitUsdt) + toNumber(entry.spreadProfitUsdt),
            transactionCount: toNumber(current.transactionCount) + toNumber(entry.transactionCount),
            monthlyTransactionCount: toNumber(current.monthlyTransactionCount) + toNumber(entry.monthlyTransactionCount),
            avgBuyRate: mergeWeightedMetric(current.avgBuyRate, currentBuyWeight, entry.avgBuyRate, entryBuyWeight),
            avgSellRate: mergeWeightedMetric(current.avgSellRate, currentSellWeight, entry.avgSellRate, entrySellWeight),
            buyRate: mergeWeightedMetric(current.buyRate, currentBuyWeight, entry.buyRate, entryBuyWeight),
            sellRate: mergeWeightedMetric(current.sellRate, currentSellWeight, entry.sellRate, entrySellWeight),
            countBuy: toNumber(current.countBuy) + toNumber(entry.countBuy),
            countSell: toNumber(current.countSell) + toNumber(entry.countSell),
            completedCycles: toNumber(current.completedCycles) + toNumber(entry.completedCycles),
            weightedAvgBuyRate: mergeWeightedMetric(current.weightedAvgBuyRate, currentBuyWeight, entry.weightedAvgBuyRate, entryBuyWeight),
            weightedAvgSellRate: mergeWeightedMetric(current.weightedAvgSellRate, currentSellWeight, entry.weightedAvgSellRate, entrySellWeight),
            activeVerdictsCount: toNumber(current.activeVerdictsCount) + toNumber(entry.activeVerdictsCount),
            currentCycleSaleUSDT: toNumber(current.currentCycleSaleUSDT) + toNumber(entry.currentCycleSaleUSDT),
            currentCycleProgress: mergeWeightedMetric(current.currentCycleProgress, currentCycleWeight, entry.currentCycleProgress, entryCycleWeight),
            currentCycleFiatRemaining: toNumber(current.currentCycleFiatRemaining) + toNumber(entry.currentCycleFiatRemaining),
            currentCycleTotalFiat: toNumber(current.currentCycleTotalFiat) + toNumber(entry.currentCycleTotalFiat),
            currentCycleFiatSpent: toNumber(current.currentCycleFiatSpent) + toNumber(entry.currentCycleFiatSpent),
            currentCycleRecoveredUSDT: toNumber(current.currentCycleRecoveredUSDT) + toNumber(entry.currentCycleRecoveredUSDT),
            currentCycleProfitUSDT: toNumber(current.currentCycleProfitUSDT) + toNumber(entry.currentCycleProfitUSDT),
            currentCycleProfitFiat: toNumber(current.currentCycleProfitFiat) + toNumber(entry.currentCycleProfitFiat),
            currentCycleProfitPercent: mergeWeightedMetric(current.currentCycleProfitPercent, currentProfitWeight, entry.currentCycleProfitPercent, entryProfitWeight),
            weightedBreakEvenRate: mergeWeightedMetric(current.weightedBreakEvenRate, currentBreakEvenWeight, entry.weightedBreakEvenRate, entryBreakEvenWeight),
            breakEvenRate: mergeWeightedMetric(current.breakEvenRate, currentBreakEvenWeight || currentSellWeight, entry.breakEvenRate, entryBreakEvenWeight || entrySellWeight),
            ceilingRate: mergeWeightedMetric(current.ceilingRate, currentSellWeight, entry.ceilingRate, entrySellWeight),
            ceilingAppliedPercent: Math.max(toNumber(current.ceilingAppliedPercent), toNumber(entry.ceilingAppliedPercent)),
            lastSellRate: mergeWeightedMetric(
                current.lastSellRate,
                Math.max(1, currentSellWeight),
                entry.lastSellRate,
                Math.max(1, entrySellWeight),
            ),
            lastSellRole: entry.lastSellRate ? entry.lastSellRole : (current.lastSellRole || entry.lastSellRole),
            verificationLevel: current.verificationLevel || entry.verificationLevel,
            verificationPercent: Math.max(toNumber(current.verificationPercent), toNumber(entry.verificationPercent)),
            pm: mergeChannelStats(current.pm, entry.pm),
            trf: mergeChannelStats(current.trf, entry.trf),
        };

        const performanceBase = toNumber(merged.spreadSellUsdt || merged.realizedVolumeUSDT || merged.sellVolUSDT);
        if (performanceBase > 0) {
            const performancePercent = (toNumber(merged.spreadProfitUsdt || merged.profit) / performanceBase) * 100;
            merged.profitPercent = performancePercent;
            merged.margin = performancePercent;
        } else {
            merged.profitPercent = Math.max(toNumber(current.profitPercent), toNumber(entry.profitPercent));
            merged.margin = Math.max(toNumber(current.margin), toNumber(entry.margin));
        }

        mergedByKey.set(key, merged);
    });

    return Array.from(mergedByKey.values());
}

function buildJudgeSummaryByBank(entries = []) {
    const mergedByKey = new Map();

    entries.forEach((entry) => {
        const key = normalizeBankName(entry?.bank);
        if (!key) return;

        const current = mergedByKey.get(key);
        if (!current) {
            mergedByKey.set(key, {
                ...entry,
                bank: getCanonicalBankDisplayName(entry?.bank),
            });
            return;
        }

        const currentCycleWeight = toNumber(current.currentCycleTotalFiat || current.currentCycleSaleUSDT || current.completedCycles);
        const entryCycleWeight = toNumber(entry.currentCycleTotalFiat || entry.currentCycleSaleUSDT || entry.completedCycles);
        const currentProfitWeight = toNumber(current.currentCycleFiatSpent || current.currentCycleTotalFiat || current.currentCycleSaleUSDT);
        const entryProfitWeight = toNumber(entry.currentCycleFiatSpent || entry.currentCycleTotalFiat || entry.currentCycleSaleUSDT);
        const currentBreakEvenWeight = toNumber(current.currentCycleFiatRemaining || current.currentCycleSaleUSDT);
        const entryBreakEvenWeight = toNumber(entry.currentCycleFiatRemaining || entry.currentCycleSaleUSDT);

        mergedByKey.set(key, {
            bank: getCanonicalBankDisplayName(current.bank || entry.bank),
            completedCycles: toNumber(current.completedCycles) + toNumber(entry.completedCycles),
            totalProfitUSDT: toNumber(current.totalProfitUSDT) + toNumber(entry.totalProfitUSDT),
            avgProfitPercent: mergeWeightedMetric(current.avgProfitPercent, currentCycleWeight, entry.avgProfitPercent, entryCycleWeight),
            activeVerdictsCount: toNumber(current.activeVerdictsCount) + toNumber(entry.activeVerdictsCount),
            currentCycleSaleUSDT: toNumber(current.currentCycleSaleUSDT) + toNumber(entry.currentCycleSaleUSDT),
            currentCycleProgress: mergeWeightedMetric(current.currentCycleProgress, currentCycleWeight, entry.currentCycleProgress, entryCycleWeight),
            currentCycleFiatRemaining: toNumber(current.currentCycleFiatRemaining) + toNumber(entry.currentCycleFiatRemaining),
            currentCycleTotalFiat: toNumber(current.currentCycleTotalFiat) + toNumber(entry.currentCycleTotalFiat),
            currentCycleFiatSpent: toNumber(current.currentCycleFiatSpent) + toNumber(entry.currentCycleFiatSpent),
            currentCycleRecoveredUSDT: toNumber(current.currentCycleRecoveredUSDT) + toNumber(entry.currentCycleRecoveredUSDT),
            currentCycleProfitUSDT: toNumber(current.currentCycleProfitUSDT) + toNumber(entry.currentCycleProfitUSDT),
            currentCycleProfitFiat: toNumber(current.currentCycleProfitFiat) + toNumber(entry.currentCycleProfitFiat),
            currentCycleProfitPercent: mergeWeightedMetric(current.currentCycleProfitPercent, currentProfitWeight, entry.currentCycleProfitPercent, entryProfitWeight),
            weightedBreakEvenRate: mergeWeightedMetric(current.weightedBreakEvenRate, currentBreakEvenWeight, entry.weightedBreakEvenRate, entryBreakEvenWeight),
        });
    });

    return mergedByKey;
}

function resolveConfiguredBankSpendLimit(bank, config = {}) {
    const limits = config?.bankSpendLimitsVes && typeof config.bankSpendLimitsVes === 'object'
        ? config.bankSpendLimitsVes
        : {};
    const key = normalizeBankLimitKey(bank);
    return Number(limits?.[key] || 0);
}

function resolveVerdictBankKey(verdict = {}, knownBankKeys = new Set()) {
    const candidates = [
        verdict?.bankName,
        verdict?.bank,
        verdict?.paymentMethod,
        verdict?.paymentMethodResolved,
        verdict?.pmBank,
        verdict?.counterpartyBank,
        verdict?.metadata?.bankName,
        verdict?.metadata?.paymentMethod,
        verdict?.meta?.bankName,
        verdict?.meta?.paymentMethod,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeBankName(candidate);
        if (!normalized) continue;
        if (knownBankKeys.size === 0 || knownBankKeys.has(normalized)) return normalized;
    }

    const blob = String(
        verdict?.notes
        || verdict?.rawNote
        || verdict?.note
        || verdict?.paymentMethod
        || ''
    ).toLowerCase();
    if (blob && knownBankKeys.size > 0) {
        for (const key of knownBankKeys) {
            if (blob.includes(key)) return key;
        }
    }

    return normalizeBankName(verdict?.paymentMethod);
}

function isPromiseVerdict(verdict) {
    const parseMode = String(verdict?.parseMode || '').trim().toUpperCase();
    if (parseMode === 'PROMISE' || parseMode === 'GLOBAL_PROMISE') return true;
    return Number(verdict?.expectedRebuyUsdt || 0) > 0 || Number(verdict?.expectedRebuyFiat || 0) > 0;
}

function buildPromiseSummaryByBank(kpis = {}, bankInsights = []) {
    const openVerdicts = Array.isArray(kpis?.judge?.openVerdicts) ? kpis.judge.openVerdicts : [];
    const knownBankKeys = new Set(
        (Array.isArray(bankInsights) ? bankInsights : [])
            .map((bank) => normalizeBankName(bank?.bankName || bank?.bank))
            .filter(Boolean)
    );
    const summary = new Map();

    (Array.isArray(bankInsights) ? bankInsights : []).forEach((bank) => {
        const bankKey = normalizeBankLimitKey(bank);
        if (!bankKey) return;

        const promisedUsdt = Number(bank?.rangePromisedUsdt || 0);
        const promisedFiat = Number(bank?.rangePromisedFiat || 0);
        const pendingUsdt = Number(bank?.rangePendingUsdt || 0);
        const pendingFiat = Number(bank?.rangePendingFiat || 0);
        const activePromises = Number(bank?.rangeActivePromises || 0);

        if (
            promisedUsdt <= 0.00001
            && promisedFiat <= 0.00001
            && pendingUsdt <= 0.00001
            && pendingFiat <= 0.00001
            && activePromises <= 0
        ) {
            return;
        }

        summary.set(bankKey, {
            promisedUsdt,
            promisedFiat,
            pendingUsdt,
            pendingFiat,
            activePromises,
        });
    });

    openVerdicts.forEach((verdict) => {
        if (!isPromiseVerdict(verdict)) return;

        const bankKey = resolveVerdictBankKey(verdict, knownBankKeys);
        if (!bankKey) return;
        if (summary.has(bankKey)) return;

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
    const promisedFiat = Number(promise.promisedFiat || 0);
    const hasPromise = promisedUsdt > 0 || promise.activePromises > 0;
    const hasPending = pendingUsdt > 0.00001 || pendingFiat > 0.00001;

    if (hasPromise) {
        return {
            value: `${formatUsdtInline(pendingUsdt)} | ${fVESInline(pendingFiat)} VES`,
            meta: hasPending
                ? `Pendiente de promesa (${promise.activePromises} activa${promise.activePromises === 1 ? '' : 's'})`
                : `Promesa cubierta (${promise.activePromises} activa${promise.activePromises === 1 ? '' : 's'})`,
            promisedLine: `${formatUsdtInline(promisedUsdt)} | ${fVESInline(promisedFiat)} VES`,
            promisedLabel: 'Prometido',
            promisedLineClass: 'text-sky-200/95',
            pendingLabel: 'Pendiente',
            progress: promisedUsdt > 0 ? clampPercent((pendingUsdt / promisedUsdt) * 100) : 0,
            pendingUsdt,
            pendingFiat,
            activePromises: Number(promise.activePromises || 0),
        };
    }

    return {
        value: `${formatUsdtInline(pendingUsdt)} | ${fVESInline(pendingFiat)} VES`,
        meta: 'Sin promesa activa',
        promisedLine: '',
        promisedLabel: 'Prometido',
        promisedLineClass: 'text-sky-200/95',
        pendingLabel: 'Pendiente',
        progress: 0,
        pendingUsdt,
        pendingFiat,
        activePromises: Number(promise.activePromises || 0),
    };
}

function buildVesControlSummaryByBank(kpis = {}, bankInsights = []) {
    const openVerdicts = Array.isArray(kpis?.judge?.openVerdicts) ? kpis.judge.openVerdicts : [];
    const knownBankKeys = new Set(
        (Array.isArray(bankInsights) ? bankInsights : [])
            .map((bank) => normalizeBankName(bank?.bankName || bank?.bank))
            .filter(Boolean)
    );
    const summary = new Map();

    (Array.isArray(bankInsights) ? bankInsights : []).forEach((bank) => {
        const bankKey = normalizeBankLimitKey(bank);
        if (!bankKey) return;

        const inflowFiat = Number(bank?.rangeVesInflowFiat || 0);
        const availableFiat = Number(bank?.rangeVesAvailableFiat || 0);
        const consumedFiat = Number(bank?.rangeVesConsumedFiat || 0);

        if (inflowFiat <= 0.00001 && availableFiat <= 0.00001 && consumedFiat <= 0.00001) {
            return;
        }

        summary.set(bankKey, {
            inflowFiat,
            availableFiat,
            consumedFiat,
            activeVerdicts: Number(bank?.activeVerdictsCount || 0),
        });
    });

    openVerdicts.forEach((verdict) => {
        const bankKey = resolveVerdictBankKey(verdict, knownBankKeys) || normalizeBankName(verdict?.paymentMethod);
        if (!bankKey) return;
        if (summary.has(bankKey)) return;

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

function buildLatestCycleByBank(kpis = {}, bankInsights = []) {
    const openVerdicts = Array.isArray(kpis?.judge?.openVerdicts) ? kpis.judge.openVerdicts : [];
    const knownBankKeys = new Set(
        (Array.isArray(bankInsights) ? bankInsights : [])
            .map((bank) => normalizeBankName(bank?.bankName || bank?.bank))
            .filter(Boolean)
    );
    const latest = new Map();

    openVerdicts.forEach((verdict) => {
        const bankKey = resolveVerdictBankKey(verdict, knownBankKeys) || normalizeBankName(verdict?.paymentMethod);
        if (!bankKey) return;

        const createdAtMs = new Date(verdict?.createdAt || verdict?.timestamp || 0).getTime() || 0;
        const prev = latest.get(bankKey);
        if (prev && prev.createdAtMs > createdAtMs) return;

        const saleRate = Number(verdict?.saleRate || 0);
        const fallbackExpectedUsdt = Number(verdict?.saleAmount || 0);
        const fallbackExpectedFiat = Number(verdict?.fiatReceived || 0);
        const expectedUsdt = Number(verdict?.expectedRebuyUsdt ?? fallbackExpectedUsdt);
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

        const cycleTotalFiat = Math.max(0, expectedFiat);
        const cycleRemainingFiat = Math.min(cycleTotalFiat, Math.max(0, remainingFiat));
        const cycleTotalUsdt = Math.max(0, expectedUsdt);

        latest.set(bankKey, {
            createdAtMs,
            cycleTotalFiat,
            cycleRemainingFiat,
            cycleTotalUsdt,
        });
    });

    return latest;
}

function buildBankVesLimitLabel(bank, _config = {}, vesControlSummaryByBank = new Map()) {
    const key = normalizeBankLimitKey(bank);
    const dynamicSummary = vesControlSummaryByBank.get(key);
    const configuredLimit = resolveConfiguredBankSpendLimit(bank, _config);

    if (configuredLimit > 0) {
        const rawAvailable = dynamicSummary
            ? Number(dynamicSummary.availableFiat || 0)
            : configuredLimit;
        const available = Math.min(configuredLimit, Math.max(0, rawAvailable));
        const burned = Math.max(0, configuredLimit - available);
        const progress = configuredLimit > 0 ? clampPercent((available / configuredLimit) * 100) : 0;

        return {
            value: `${fVESInline(available)} / ${fVESInline(configuredLimit)}`,
            meta: burned <= 0.01
                ? 'Barra llena'
                : available <= 0.01
                    ? 'Lote quemado'
                    : `${fVESInline(burned)} quemado`,
            progress,
            limit: configuredLimit,
            current: available,
            hasFlow: true,
        };
    }

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
    const completedCycles = kpis.judge?.completedCycles || {};
    const normalizedBankInsights = mergeBankInsightsByAlias(Array.isArray(bankInsights) ? bankInsights : []);

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
    const bankSummary = getBankMonitorSummary(kpis, normalizedBankInsights);
    const judgeBreakdown = Array.isArray(kpis?.judge?.bankBreakdown) ? kpis.judge.bankBreakdown : [];
    const judgeByBank = buildJudgeSummaryByBank(judgeBreakdown);

    inject('side-teorico', fUSDT(teorico));
    inject('side-binance', fUSDT(binance));
    inject('side-profit-total', fUSDT(profit));
    inject('side-spread-value', formatSignedUsdt(bankSummary.spreadProfitUsdt));
    inject('side-spread-meta', `${formatPlain(bankSummary.spreadPercent)}%`);
    const cyclesCount = Number(completedCycles.count || 0);
    const cyclesTotalProfit = Number(completedCycles.totalProfit || 0);
    const avgProfitPerCycle = cyclesCount > 0 ? cyclesTotalProfit / cyclesCount : 0;
    inject('side-cycle-avg', formatPlain(avgProfitPerCycle));
    inject('side-cycle-count', formatPlain(cyclesCount, 0));

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
    const promiseSummaryByBank = buildPromiseSummaryByBank(kpis, normalizedBankInsights);
    const latestCycleByBank = buildLatestCycleByBank(kpis, normalizedBankInsights);
    const bankCards = normalizedBankInsights.map((bank) => {
        const ops = Number(bank.monthlyTransactionCount ?? bank.transactionCount ?? bank.totalOps ?? ((bank.countSell || 0) + (bank.countBuy || 0)));
        const pagoMovil = buildPagoMovilLabel(bank, kpis.config || {});
        const promiseLabel = buildPromiseLabel(bank, promiseSummaryByBank);
        const bankKey = normalizeBankLimitKey(bank);
        const judgeBank = judgeByBank.get(bankKey) || {};
        const latestCycle = latestCycleByBank.get(bankKey) || {};
        const completedByJudge = Number(judgeBank.completedCycles || 0);
        const completedByInsight = Number(bank.completedCycles || 0);
        const cyclesCompleted = Math.max(completedByJudge, completedByInsight, 0);
        const spreadLabel = buildSpreadLabel(bank, cyclesCompleted);
        const explicitCeiling = Number(
            latestCycle.cycleTotalFiat
            || judgeBank.currentCycleTotalFiat
            || bank.currentCycleTotalFiat
            || 0
        );
        const explicitRemaining = Number(
            latestCycle.cycleRemainingFiat
            || judgeBank.currentCycleFiatRemaining
            || bank.currentCycleFiatRemaining
            || 0
        );
        const bankCeiling = explicitCeiling > 0 ? explicitCeiling : 0;
        const bankRemaining = bankCeiling > 0
            ? Math.min(bankCeiling, Math.max(0, explicitRemaining))
            : 0;
        const burned = Math.max(0, bankCeiling - bankRemaining);
        const vesControl = bankCeiling > 0
            ? {
                value: `${fVESInline(bankRemaining)} / ${fVESInline(bankCeiling)}`,
                meta: burned <= 0.01
                    ? 'Barra llena'
                    : bankRemaining <= 0.01
                        ? 'Lote quemado'
                        : `${fVESInline(burned)} quemado`,
                progress: clampPercent((bankRemaining / bankCeiling) * 100),
                limit: bankCeiling,
                current: bankRemaining,
                hasFlow: true,
            }
            : {
                value: '0.00 / 0.00',
                meta: 'Sin ciclo activo',
                progress: 0,
                limit: 0,
                current: 0,
                hasFlow: false,
            };
        const explicitCeilingUsdt = Number(
            latestCycle.cycleTotalUsdt
            || judgeBank.currentCycleSaleUSDT
            || bank.currentCycleSaleUSDT
            || 0
        );
        const ceilingRate = Number(
            bank.ceilingRate
            || bank.lastSellRate
            || bank.sellRate
            || bank.weightedAvgSellRate
            || bank.avgSellRate
            || bankSummary.referenceSellRate
            || 0
        );
        const inferredCeilingUsdt = bankCeiling > 0 && ceilingRate > 0 ? (bankCeiling / ceilingRate) : 0;
        const bankCeilingUsdt = explicitCeilingUsdt > 0 ? explicitCeilingUsdt : inferredCeilingUsdt;

        return {
            bank,
            ops,
            vesControl,
            pagoMovil,
            spreadLabel,
            promiseLabel,
            cyclesCompleted,
            bankCeiling,
            bankCeilingUsdt,
        };
    });

    const activeBankCards = bankCards.filter((entry) => Number(entry.bankCeiling || 0) > 0);
    const bankCeilings = activeBankCards
        .map((entry) => Number(entry.bankCeiling || 0))
        .filter((value) => value > 0);
    const bankCeilingsUsdt = activeBankCards
        .map((entry) => Number(entry.bankCeilingUsdt || 0))
        .filter((value) => value > 0);
    const averageBankCeiling = bankCeilings.length
        ? bankCeilings.reduce((sum, value) => sum + value, 0) / bankCeilings.length
        : 0;
    const averageBankCeilingUsdt = bankCeilingsUsdt.length
        ? bankCeilingsUsdt.reduce((sum, value) => sum + value, 0) / bankCeilingsUsdt.length
        : 0;
    const fallbackCeilingRate = Number(
        bankSummary.avgCeilingRate
        || bankSummary.referenceSellRate
        || bankSummary.avgSellRate
        || 0
    );

    inject('side-ceiling-level-label', 'TECHO GENERAL');
    inject(
        'side-ceiling-level-value',
        bankSummary.avgSellRate > 0 || bankSummary.avgCeilingRate > 0
            ? `${formatPlain(bankSummary.avgSellRate)} Venta | ${formatPlain(bankSummary.avgCeilingRate)} Techo`
            : '0,00 Venta | 0,00 Techo'
    );
    inject('side-ceiling-level-meta', bankSummary.banksWithSell > 0
        ? `Tasa promedio de ${formatPlain(bankSummary.banksWithSell, 0)} bancos con venta`
        : 'Sin bancos con venta activa');
    inject('side-ceiling-sell-rate', `Nivel ${String(bankSummary.levelLabel || 'Sin nivel').toUpperCase()} | ${formatPlain(bankSummary.verificationPercent)}%`);
    inject('side-ceiling-level-badge', `${formatPlain(activeBankCards.length, 0)} Bancos`);

    bankCards.forEach(({ bank, ops, vesControl, pagoMovil, spreadLabel, promiseLabel, cyclesCompleted, bankCeiling, bankCeilingUsdt }) => {
        const performancePercent = Number(bank.profitPercent ?? bank.margin ?? 0);
        const hasReliablePerformanceBase = (
            Math.abs(Number(bank.spreadSellUsdt || 0)) > 0.0001
            || Math.abs(Number(bank.realizedVolumeUSDT || 0)) > 0.0001
            || Math.abs(Number(bank.sellVolUSDT || 0)) > 0.0001
        );
        const showPerformanceBadge = Number.isFinite(performancePercent) && hasReliablePerformanceBase;
        const promiseTextClass = promiseLabel.pendingUsdt > 0 || promiseLabel.pendingFiat > 0
            ? 'text-amber-300'
            : 'text-white/90';
        const statusLabel = `Ciclos ${formatPlain(cyclesCompleted, 0)} | Ops ${formatPlain(ops, 0)}`;
        const performanceClass = performancePercent >= 0
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            : 'border-rose-500/20 bg-rose-500/10 text-rose-300';
        const performanceLabel = `${performancePercent >= 0 ? '+' : ''}${formatPlain(performancePercent, 2)}%`;

        const div = document.createElement('div');
        div.className = 'bg-[#1a2027] p-4 rounded-xl border border-white/10 flex flex-col gap-2.5 transition-all hover:bg-[#202730] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex flex-col">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[13px] font-black text-white uppercase italic tracking-wider">${bank.bankName || bank.bank}</span>
                        ${showPerformanceBadge ? `
                            <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black tracking-tight ${performanceClass}">
                                ${performanceLabel}
                            </span>
                        ` : ''}
                    </div>
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
            ${promiseLabel.promisedLine ? `
                <div class="text-[11px] font-mono font-black tracking-tight ${promiseLabel.promisedLineClass}">
                    ${promiseLabel.promisedLabel}: ${promiseLabel.promisedLine}
                </div>
            ` : ''}
            <div class="text-[13px] font-mono font-black tracking-tight ${promiseTextClass}">
                ${promiseLabel.pendingLabel}: ${promiseLabel.value}
            </div>
            <div class="flex items-center justify-between gap-3 mt-1">
                <span class="text-[11px] text-slate-500 font-black uppercase tracking-[0.18em]">Control VES</span>
                <div class="flex items-center gap-1.5">
                    <span class="text-[11px] text-slate-500 font-black tracking-tight">${vesControl.meta}</span>
                    ${vesControl.hasFlow ? `<button data-close-bank="${(bank.bankName || bank.bank || '').toUpperCase()}" class="btn-close-bank-ves text-[8px] text-slate-500 hover:text-rose-400 bg-transparent hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 px-1 py-0 rounded cursor-pointer transition-all leading-tight" title="Forzar cierre de ciclos VES en este banco">&#10005;</button>` : ''}
                </div>
            </div>
            <div class="text-[13px] font-mono font-black tracking-tight text-white/90">
                ${vesControl.value}
            </div>
            <div class="text-[11px] font-mono font-black tracking-tight text-[#F3BA2F]">
                Venta: ${formatPlain(Number(bank.lastSellRate || bank.sellRate || bank.weightedAvgSellRate || bank.avgSellRate || 0))} | Techo: ${formatPlain(Number(bank.ceilingRate || 0))}
            </div>
            <div class="h-1.5 w-full bg-[#313842] rounded-full overflow-hidden mt-1">
                <div class="h-full bg-[#F3BA2F] transition-all duration-700 ease-out" style="width: ${vesControl.progress}%"></div>
            </div>
            <div class="flex items-center justify-between gap-3 mt-1">
                <span class="text-[11px] text-slate-500 font-black uppercase tracking-[0.18em]">Pago Movil</span>
                <span class="text-[11px] text-slate-500 font-black tracking-tight">${pagoMovil.meta}</span>
            </div>
            <div class="text-[13px] font-mono font-black tracking-tight text-white/90">
                ${pagoMovil.value}
            </div>
            <div class="h-1.5 w-full bg-[#313842] rounded-full overflow-hidden mt-1">
                <div class="h-full bg-[#F3BA2F] transition-all duration-700 ease-out" style="width: ${pagoMovil.progress}%"></div>
            </div>
        `;
        listContainer.appendChild(div);
    });

    // Wire up "Limpiar VES" button for closing stale/orphaned verdicts
    const cleanBtn = document.getElementById('btn-clean-stale-ves');
    if (cleanBtn && !cleanBtn.dataset.wired) {
        cleanBtn.dataset.wired = '1';
        cleanBtn.addEventListener('click', async () => {
            if (!confirm('Cerrar ciclos VES viejos sin parseo (>48h sin compras vinculadas)?')) return;
            cleanBtn.disabled = true;
            cleanBtn.textContent = 'Limpiando...';
            try {
                const apiBase = (localStorage.getItem('api_base') || window.location.origin).replace(/\/+$/, '');
                const token = sessionStorage.getItem('auth_token') || sessionStorage.getItem('session_token');
                const res = await fetch(`${apiBase}/api/judge/verdicts/close-stale`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ force: false }),
                });
                const data = await res.json();
                cleanBtn.textContent = data.closed > 0 ? `${data.closed} cerrados` : 'Sin cambios';
                setTimeout(() => { cleanBtn.textContent = 'Limpiar VES'; }, 3000);
            } catch (err) {
                cleanBtn.textContent = 'Error';
                setTimeout(() => { cleanBtn.textContent = 'Limpiar VES'; }, 3000);
            } finally {
                cleanBtn.disabled = false;
            }
        });
    }

    // Per-bank force-close buttons (event delegation on list container)
    if (listContainer && !listContainer.dataset.closeBankWired) {
        listContainer.dataset.closeBankWired = '1';
        listContainer.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-close-bank-ves');
            if (!btn) return;
            const bankName = btn.dataset.closeBank;
            if (!bankName) return;
            if (!confirm(`Forzar cierre de TODOS los ciclos VES abiertos en ${bankName}?`)) return;
            btn.disabled = true;
            btn.textContent = '...';
            try {
                const apiBase = (localStorage.getItem('api_base') || window.location.origin).replace(/\/+$/, '');
                const token = sessionStorage.getItem('auth_token') || sessionStorage.getItem('session_token');
                const res = await fetch(`${apiBase}/api/judge/verdicts/close-stale`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ bank: bankName, force: true }),
                });
                const data = await res.json();
                btn.textContent = data.closed > 0 ? `${data.closed}` : '0';
                btn.className = btn.className.replace('text-slate-500', 'text-emerald-400');
                setTimeout(() => { btn.innerHTML = '&#10005;'; btn.className = btn.className.replace('text-emerald-400', 'text-slate-500'); }, 2500);
            } catch {
                btn.textContent = '!';
                setTimeout(() => { btn.innerHTML = '&#10005;'; }, 2500);
            } finally {
                btn.disabled = false;
            }
        });
    }
}
