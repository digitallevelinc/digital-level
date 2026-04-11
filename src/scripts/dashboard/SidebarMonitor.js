import { fUSDT, inject } from './utils.js';

const SIDEBAR_BANK_COLLAPSE_KEY = 'sidebar_bank_cards_collapsed_v1';
const FIAT_COVERAGE_COMPLETION_TOLERANCE = 500;

// Cache the last ledger summary so dashboard refreshes don't flicker the spread back to 0
let _cachedLedgerSummary = null;

function isAdminCycleActionEnabled() {
    try {
        return sessionStorage.getItem('admin_impersonation') === 'true';
    } catch (_error) {
        return false;
    }
}

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

function resolveBankAverageSellRate(bank = {}) {
    const promisedUsdt = Number(bank.rangePromisedUsdt || 0);
    const promisedFiat = Number(bank.rangePromisedFiat || 0);
    const promiseRate = promisedUsdt > 0 && promisedFiat > 0
        ? promisedFiat / promisedUsdt
        : 0;

    return Number(
        bank.weightedAvgSellRate
        || bank.avgSellRate
        || bank.sellRate
        || bank.lastSellRate
        || promiseRate
        || 0
    );
}

function resolveBankCeilingRate(bank = {}, fallbackRate = 0) {
    return Number(bank.ceilingRate || fallbackRate || 0);
}

function getBankMonitorSummary(kpis = {}, bankInsights = []) {
    const banks = Array.isArray(bankInsights) ? bankInsights : [];
    const ceilingBanks = banks.filter((bank) => Number(bank.ceilingRate || 0) > 0);
    const sellReferenceBanks = banks.filter(
        (bank) => resolveBankAverageSellRate(bank) > 0
    );
    const spreadBanks = banks.filter(
        (bank) => bank?.ledgerSpreadReady === true
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
        (sum, bank) => sum + getLedgerSpreadProfit(bank),
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
        const sellRate = resolveBankAverageSellRate(bank);
        if (sellVolUsdt > 0 && sellRate > 0) return sellVolUsdt * sellRate;
        const promisedFiat = Number(bank.rangePromisedFiat || 0);
        if (promisedFiat > 0) return promisedFiat;
        return sellVolUsdt > 0 ? sellVolUsdt : 0;
    };

    const avgSellRateFromBanks = weightedAverage(
        sellReferenceBanks,
        (bank) => resolveBankAverageSellRate(bank),
        getSellWeight
    );
    const avgCeilingRateFromBanks = weightedAverage(
        ceilingBanks,
        (bank) => resolveBankCeilingRate(bank),
        getSellWeight
    );
    const referenceSellBanks = ceilingBanks.length > 0 ? ceilingBanks : sellReferenceBanks;
    const referenceSellRateFromBanks = weightedAverage(
        referenceSellBanks,
        (bank) => resolveBankAverageSellRate(bank),
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
        spreadBaseUsdt,
        spreadPercent: spreadBaseUsdt > 0 ? (spreadProfitUsdt / spreadBaseUsdt) * 100 : 0,
        banksWithCeiling: ceilingBanks.length,
        banksWithSell: sellReferenceBanks.length,
    };
}

const _memoizedSpreads = new Map();
const _memoizedCoverage = new Map(); // bankKey → { totalFiat, pendingFiat }
const _memoizedFiatCycles = new Map(); // bankKey → { totalFiat, remainingFiat, consumedFiat }

function getLedgerSpreadProfit(bank = {}) {
    const key = String(bank?.bank || bank?.bankName || '').toLowerCase().trim();
    if (bank?.ledgerSpreadReady === true) {
        const val = toNumber(bank.spreadProfitUsdt);
        if (key) _memoizedSpreads.set(key + '_usdt', val);
        return val;
    }
    return key && _memoizedSpreads.has(key + '_usdt') ? _memoizedSpreads.get(key + '_usdt') : 0;
}

function getLedgerSpreadProfitFiat(bank = {}) {
    const key = String(bank?.bank || bank?.bankName || '').toLowerCase().trim();
    if (bank?.ledgerSpreadReady === true) {
        const val = toNumber(bank.spreadProfitFiat);
        if (key) _memoizedSpreads.set(key + '_fiat', val);
        return val;
    }
    return key && _memoizedSpreads.has(key + '_fiat') ? _memoizedSpreads.get(key + '_fiat') : 0;
}

function getLedgerCoverage(bank = {}) {
    const key = String(bank?.bank || bank?.bankName || '').toLowerCase().trim();
    if (bank?.ledgerSpreadReady === true) {
        const totalFiat = toNumber(bank.coverageTotalFiat);
        const pendingFiat = toNumber(bank.coveragePendingFiat);
        if (key && totalFiat > 0) {
            _memoizedCoverage.set(key, { totalFiat, pendingFiat });
        } else if (key && totalFiat === 0) {
            // Ledger explicitly found no active cycle → clear memo
            _memoizedCoverage.delete(key);
        }
        return { totalFiat, pendingFiat };
    }
    if (key && _memoizedCoverage.has(key)) {
        return _memoizedCoverage.get(key);
    }
    return { totalFiat: toNumber(bank.coverageTotalFiat), pendingFiat: toNumber(bank.coveragePendingFiat) };
}

function getLedgerFiatCycle(bank = {}) {
    const key = String(bank?.bank || bank?.bankName || '').toLowerCase().trim();
    if (bank?.ledgerSpreadReady === true) {
        const remainingFiat = toNumber(bank.currentCycleFiatRemaining);
        const consumedFiat = toNumber(bank.currentCycleFiatSpent);
        const totalFiat = Math.max(toNumber(bank.currentCycleTotalFiat), remainingFiat + consumedFiat);

        if (key && totalFiat > 0) {
            _memoizedFiatCycles.set(key, { totalFiat, remainingFiat, consumedFiat });
        } else if (key && totalFiat === 0) {
            _memoizedFiatCycles.delete(key);
        }

        return { totalFiat, remainingFiat, consumedFiat };
    }

    if (key && _memoizedFiatCycles.has(key)) {
        return _memoizedFiatCycles.get(key);
    }

    const remainingFiat = toNumber(bank.currentCycleFiatRemaining);
    const consumedFiat = toNumber(bank.currentCycleFiatSpent);
    const totalFiat = Math.max(toNumber(bank.currentCycleTotalFiat), remainingFiat + consumedFiat);
    return { totalFiat, remainingFiat, consumedFiat };
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

function readSidebarBankCollapseState() {
    try {
        const raw = localStorage.getItem(SIDEBAR_BANK_COLLAPSE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeSidebarBankCollapseState(nextState) {
    try {
        localStorage.setItem(SIDEBAR_BANK_COLLAPSE_KEY, JSON.stringify(nextState));
    } catch (_error) { }
}

function isSidebarBankCollapsed(bankKey) {
    if (!bankKey) return false;
    const state = readSidebarBankCollapseState();
    return state[bankKey] === true;
}

function setSidebarBankCollapsed(bankKey, collapsed) {
    if (!bankKey) return;
    const state = readSidebarBankCollapseState();
    state[bankKey] = Boolean(collapsed);
    writeSidebarBankCollapseState(state);
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
            ledgerSpreadReady: Boolean(current.ledgerSpreadReady || entry.ledgerSpreadReady),
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
            spreadProfitFiat: toNumber(current.spreadProfitFiat) + toNumber(entry.spreadProfitFiat),
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
            coverageActiveFiatCount: toNumber(current.coverageActiveFiatCount) + toNumber(entry.coverageActiveFiatCount),
            coveragePendingFiat: toNumber(current.coveragePendingFiat) + toNumber(entry.coveragePendingFiat),
            coverageTotalFiat: toNumber(current.coverageTotalFiat) + toNumber(entry.coverageTotalFiat),
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

const TERMINAL_VERDICT_STATUSES = new Set([
    'CLOSED',
    'COMPLETED',
    'CANCELLED',
    'CANCELED',
    'CANCELLED_BY_SYSTEM',
    'CANCELED_BY_SYSTEM',
    'EXPIRED',
    'RELEASED',
    'FINISHED',
    'DONE',
    'SUCCESS',
]);

function isTerminalVerdict(verdict = {}) {
    const rawStatus = String(verdict?.status || verdict?.orderStatus || '').trim().toUpperCase();
    if (rawStatus) {
        if (TERMINAL_VERDICT_STATUSES.has(rawStatus)) return true;
        if (rawStatus.startsWith('CLOSE')) return true;
        if (rawStatus.startsWith('COMPLETE')) return true;
        if (rawStatus.startsWith('CANCEL')) return true;
        if (rawStatus.startsWith('EXPIRE')) return true;
        if (rawStatus.startsWith('RELEASE')) return true;
    }

    return Boolean(verdict?.closedAt || verdict?.completedAt || verdict?.releasedAt);
}

function getActiveOpenVerdicts(kpis = {}) {
    const openVerdicts = Array.isArray(kpis?.judge?.openVerdicts) ? kpis.judge.openVerdicts : [];
    return openVerdicts.filter((verdict) => !isTerminalVerdict(verdict));
}

function isPromiseVerdict(verdict) {
    const parseMode = String(verdict?.parseMode || '').trim().toUpperCase();
    if (parseMode === 'PROMISE' || parseMode === 'GLOBAL_PROMISE') return true;
    return Number(verdict?.expectedRebuyUsdt || 0) > 0 || Number(verdict?.expectedRebuyFiat || 0) > 0;
}

function buildPromiseSummaryByBank(kpis = {}, bankInsights = []) {
    const hasLiveVerdictsFeed = Array.isArray(kpis?.judge?.openVerdicts);
    const openVerdicts = getActiveOpenVerdicts(kpis);
    const knownBankKeys = new Set(
        (Array.isArray(bankInsights) ? bankInsights : [])
            .map((bank) => normalizeBankName(bank?.bankName || bank?.bank))
            .filter(Boolean)
    );
    const summary = new Map();

    if (!hasLiveVerdictsFeed) {
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
    }

    openVerdicts.forEach((verdict) => {
        if (!isPromiseVerdict(verdict)) return;

        const bankKey = resolveVerdictBankKey(verdict, knownBankKeys);
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
        bucket.activePromises += 1;

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
            value: `${formatUsdtInline(pendingUsdt)} | ${fVESInline(pendingFiat)} FIAT`,
            meta: hasPending
                ? `Pendiente de promesa (${promise.activePromises} activa${promise.activePromises === 1 ? '' : 's'})`
                : `Promesa cubierta (${promise.activePromises} activa${promise.activePromises === 1 ? '' : 's'})`,
            promisedLine: `${formatUsdtInline(promisedUsdt)} | ${fVESInline(promisedFiat)} FIAT`,
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
        value: `${formatUsdtInline(pendingUsdt)} | ${fVESInline(pendingFiat)} FIAT`,
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
    const hasLiveVerdictsFeed = Array.isArray(kpis?.judge?.openVerdicts);
    const openVerdicts = getActiveOpenVerdicts(kpis);
    const knownBankKeys = new Set(
        (Array.isArray(bankInsights) ? bankInsights : [])
            .map((bank) => normalizeBankName(bank?.bankName || bank?.bank))
            .filter(Boolean)
    );
    const summary = new Map();

    if (!hasLiveVerdictsFeed) {
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
    }

    openVerdicts.forEach((verdict) => {
        const bankKey = resolveVerdictBankKey(verdict, knownBankKeys) || normalizeBankName(verdict?.paymentMethod);
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

function buildLatestCycleByBank(kpis = {}, bankInsights = []) {
    const openVerdicts = getActiveOpenVerdicts(kpis);
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
    // Use memoized ledger coverage to survive dashboard poll resets that wipe
    // injected values with stale backend data before the ledger can re-inject.
    const ledgerCov = getLedgerCoverage(bank);
    const fallbackCoveragePendingFiat = Math.max(0, ledgerCov.pendingFiat);
    const fallbackCoverageTotalFiat = Math.max(0, ledgerCov.totalFiat);
    const ledgerCycle = getLedgerFiatCycle(bank);
    const ledgerCycleRemaining = Math.max(0, Number(ledgerCycle?.remainingFiat || 0));
    const ledgerCycleConsumed = Math.max(0, Number(ledgerCycle?.consumedFiat || 0));
    const ledgerCycleTotal = Math.max(
        0,
        Number(ledgerCycle?.totalFiat || 0),
        ledgerCycleRemaining + ledgerCycleConsumed
    );
    const fallbackAvailable = Math.max(
        0,
        Number(bank?.currentCycleFiatRemaining || 0),
        Number(bank?.rangeVesAvailableFiat || 0)
    );
    const fallbackConsumed = Math.max(
        0,
        Number(bank?.currentCycleFiatSpent || 0),
        Number(bank?.rangeVesConsumedFiat || 0)
    );
    const fallbackInflow = Math.max(
        0,
        Number(bank?.currentCycleTotalFiat || 0),
        Number(bank?.rangeVesInflowFiat || 0),
        fallbackAvailable + fallbackConsumed
    );
    const hasFallbackCycleSnapshot =
        fallbackAvailable > 0.00001 || fallbackConsumed > 0.00001 || fallbackInflow > 0.00001;
    const buildVesLabel = (remainingFiat, effectiveCap) => {
        const total = Math.max(0, Number(effectiveCap || 0));
        const remainingRaw = Math.min(total, Math.max(0, Number(remainingFiat || 0)));
        const remaining = remainingRaw <= FIAT_COVERAGE_COMPLETION_TOLERANCE ? 0 : remainingRaw;
        const covered = Math.max(0, total - remaining);
        const progress = total > 0 ? clampPercent((covered / total) * 100) : 0;

        return {
            value: `${fVESInline(covered)} / ${fVESInline(total)}`,
            meta: remaining <= 0 ? 'Barra llena' : `${formatPlain(remaining, 0)} FIAT`,
            progress,
            limit: total,
            current: covered,
            hasFlow: total > 0,
        };
    };

    if (bank?.ledgerSpreadReady === true) {
        if (fallbackCoverageTotalFiat > 0.00001) {
            return buildVesLabel(fallbackCoveragePendingFiat, fallbackCoverageTotalFiat);
        }

        if (ledgerCycleTotal > 0.00001) {
            return buildVesLabel(ledgerCycleRemaining, ledgerCycleTotal);
        }

        return {
            value: '0.00 / 0.00',
            meta: 'Sin flujo activo',
            progress: 0,
            limit: 0,
            current: 0,
            hasFlow: false,
        };
    }

    if (ledgerCycleTotal > 0.00001) {
        return buildVesLabel(ledgerCycleRemaining, ledgerCycleTotal);
    }

    if (fallbackCoverageTotalFiat > 0.00001) {
        return buildVesLabel(fallbackCoveragePendingFiat, fallbackCoverageTotalFiat);
    }

    const hasDynamic = Boolean(dynamicSummary);
    if (!hasDynamic) {
        if (!hasFallbackCycleSnapshot) {
            return {
                value: '0.00 / 0.00',
                meta: 'Sin flujo activo',
                progress: 0,
                limit: 0,
                current: 0,
                hasFlow: false,
            };
        }

        const effectiveCap = Math.max(0, fallbackInflow, fallbackAvailable + fallbackConsumed);
        return buildVesLabel(fallbackAvailable, effectiveCap);
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
        if (!hasFallbackCycleSnapshot) {
            return {
                value: '0.00 / 0.00',
                meta: 'Sin flujo activo',
                progress: 0,
                limit: 0,
                current: 0,
                hasFlow: false,
            };
        }

        effectiveCap = Math.max(0, fallbackInflow, fallbackAvailable + fallbackConsumed);
        if (fallbackAvailable > effectiveCap) {
            effectiveCap = fallbackAvailable;
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

        return buildVesLabel(fallbackAvailable, effectiveCap);
    }

    return buildVesLabel(available, effectiveCap);
}

export function updateSidebarMonitor(kpis = {}, bankInsights = [], ledgerSummary = null) {
    if (ledgerSummary) _cachedLedgerSummary = ledgerSummary;
    const ls = _cachedLedgerSummary || { totalSpread: 0, spreadCount: 0 };
    const canManageCycles = isAdminCycleActionEnabled();
    const summary = kpis.metrics || kpis.kpis || kpis.summary || {};
    const audit = kpis.audit || {};
    const critical = kpis.critical || {};
    const completedCycles = kpis.judge?.completedCycles || {};
    const normalizedBankInsights = mergeBankInsightsByAlias(Array.isArray(bankInsights) ? bankInsights : [])
        .filter(b => normalizeBankName(b.bankName || b.bank) !== 'fiat');

    const capitalInicial = parseFloat(critical.capitalInicial || kpis.capitalInicial || audit.initialCapital || 0);
    const profit = parseFloat(critical.profitTotalUSDT || summary.totalProfit || 0);
    const teorico = parseFloat(audit.currentBalanceEstimate || critical.balanceTotal || 0);

    // Sidebar Binance figure must stay aligned with API-only balance.
    const binance = Number.isFinite(Number(audit.realBalance)) ? Number(audit.realBalance) : 0;

    const diferencia = critical.balanceGap !== undefined ? parseFloat(critical.balanceGap) : (binance - teorico);
    const bankSummary = getBankMonitorSummary(kpis, normalizedBankInsights);
    const judgeBreakdown = Array.isArray(kpis?.judge?.bankBreakdown) ? kpis.judge.bankBreakdown : [];
    const judgeByBank = buildJudgeSummaryByBank(judgeBreakdown);

    inject('side-teorico', fUSDT(teorico));
    inject('side-binance', fUSDT(binance));
    inject('side-profit-total', fUSDT(profit));

    // SPREAD promedio: total spread del ledger / cantidad de spreads individuales
    const avgSpread = ls.spreadCount > 0 ? ls.totalSpread / ls.spreadCount : 0;
    const spreadEl = document.getElementById('side-spread-value');
    if (spreadEl) {
        spreadEl.textContent = formatSignedUsdt(avgSpread);
        spreadEl.className = `text-[1.2rem] mt-2 font-mono font-black tracking-tight ${avgSpread >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }
    inject('side-spread-meta', ls.spreadCount > 0 ? `${ls.spreadCount} spreads` : '—');

    // PROM/CICLO: promedio real desde el desglose por banco del judge
    let totalProfitFromJudge = 0;
    let totalCyclesFromJudge = 0;
    judgeByBank.forEach((bank) => {
        totalProfitFromJudge += Number(bank.totalProfitUSDT || 0);
        totalCyclesFromJudge += Number(bank.completedCycles || 0);
    });
    const criticalCyclesCount = Number(
        critical.cycleEquivalentCount
        ?? critical.completedCycles
        ?? 0
    );
    const judgeCyclesCount = Number(completedCycles.count || 0);
    const cycleCountToDisplay = totalCyclesFromJudge > 0
        ? totalCyclesFromJudge
        : criticalCyclesCount > 0 ? criticalCyclesCount : judgeCyclesCount;
    const avgProfitPerCycle = totalCyclesFromJudge > 0
        ? totalProfitFromJudge / totalCyclesFromJudge
        : (cycleCountToDisplay > 0 ? ls.totalSpread / cycleCountToDisplay : 0);
    inject('side-cycle-avg', formatPlain(avgProfitPerCycle));
    inject('side-cycle-count', formatPlain(cycleCountToDisplay, 0));

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

    const listContainer = document.getElementById('side-banks-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    const promiseSummaryByBank = buildPromiseSummaryByBank(kpis, normalizedBankInsights);
    const vesControlSummaryByBank = buildVesControlSummaryByBank(kpis, normalizedBankInsights);
    const latestCycleByBank = buildLatestCycleByBank(kpis, normalizedBankInsights);
    const bankCards = normalizedBankInsights.map((bank) => {
        const ops = Number(bank.transactionCount || bank.totalOps || ((bank.countSell || 0) + (bank.countBuy || 0)) || bank.monthlyTransactionCount || 0);
        const pagoMovil = buildPagoMovilLabel(bank, kpis.config || {});
        const promiseLabel = buildPromiseLabel(bank, promiseSummaryByBank);
        const bankKey = normalizeBankLimitKey(bank);
        const judgeBank = judgeByBank.get(bankKey) || {};
        const latestCycle = latestCycleByBank.get(bankKey) || {};
        const completedByJudge = Number(judgeBank.completedCycles || 0);
        const completedByInsight = Number(bank.completedCycles || 0);
        const completedByLedger = Number(bank.ledgerCompletedCycles || 0);
        const cyclesCompleted = Math.max(completedByJudge, completedByInsight, completedByLedger, 0);
        // PROFIT NETO del monitor lateral debe salir del ledger del Balance General,
        // no del profit agregado del backend/judge. balanceLedger.js inyecta ese
        // valor por banco cuando termina de recalcular los spreads del rango actual.
        const bankProfit = getLedgerSpreadProfit(bank);
        const bankProfitFiat = getLedgerSpreadProfitFiat(bank);
        const vesControl = buildBankVesLimitLabel(bank, kpis.config || {}, vesControlSummaryByBank);
        const bankCeiling = Number(vesControl.limit || 0);

        return {
            bank,
            ops,
            vesControl,
            pagoMovil,
            promiseLabel,
            cyclesCompleted,
            bankCeiling,
            bankProfit,
            bankProfitFiat,
        };
    });

    inject('side-ceiling-level-label', 'VENTA ACTUAL');
    inject('side-ceiling-level-value', bankSummary.avgSellRate > 0 ? formatPlain(bankSummary.avgSellRate) : '0,00');
    inject(
        'side-ceiling-level-meta',
        `Nivel ${String(bankSummary.levelLabel || 'Sin nivel').toUpperCase()} | ${formatPlain(bankSummary.verificationPercent)}%`
    );

    bankCards.forEach(({ bank, ops, vesControl, pagoMovil, cyclesCompleted, bankProfit, bankProfitFiat }) => {
        const performancePercent = Number(bank.profitPercent ?? bank.margin ?? 0);
        const hasReliablePerformanceBase = (
            Math.abs(Number(bank.spreadSellUsdt || 0)) > 0.0001
            || Math.abs(Number(bank.realizedVolumeUSDT || 0)) > 0.0001
            || Math.abs(Number(bank.sellVolUSDT || 0)) > 0.0001
        );
        const showPerformanceBadge = Number.isFinite(performancePercent) && hasReliablePerformanceBase;
        const statusLabel = `Ciclos ${formatPlain(cyclesCompleted, 0)} | Ops ${formatPlain(ops, 0)}`;
        const performanceClass = performancePercent >= 0
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            : 'border-rose-500/20 bg-rose-500/10 text-rose-300';
        const performanceLabel = `${performancePercent >= 0 ? '+' : ''}${formatPlain(performancePercent, 2)}%`;
        const bankCardKey = normalizeBankLimitKey(bank) || normalizeBankName(bank?.bankName || bank?.bank);
        const isCollapsed = isSidebarBankCollapsed(bankCardKey);

        const div = document.createElement('div');
        div.className = 'sidebar-bank-card bg-[#1a2027] p-4 rounded-xl border border-white/10 flex flex-col gap-2.5 transition-all hover:bg-[#202730] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]';
        div.dataset.bankCard = bankCardKey;
        div.dataset.collapsed = isCollapsed ? 'true' : 'false';
        div.innerHTML = `
            <button type="button" data-bank-toggle="${bankCardKey}" class="w-full flex justify-between items-start gap-3 bg-transparent border-0 p-0 text-left cursor-pointer">
                <div class="flex flex-col min-w-0">
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
                <div class="flex items-start gap-3 shrink-0">
                    <div class="text-right">
                        <span class="text-[1rem] font-mono font-black ${bankProfit >= 0 ? 'text-emerald-400' : 'text-rose-500'} tracking-tight">${formatSignedUsdt(bankProfit)}</span>
                        <span class="text-[9px] text-gray-500 block font-black uppercase tracking-wider">Profit Neto</span>
                    </div>
                    <span data-bank-toggle-icon class="text-[#F3BA2F] text-[14px] leading-none mt-0.5">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
                </div>
            </button>
            <div data-bank-body class="${isCollapsed ? 'hidden ' : ''}mt-2 flex flex-col gap-2.5">
                <div class="flex items-center justify-between gap-3 mt-1">
                    <span class="text-[11px] text-slate-500 font-black uppercase tracking-[0.18em]">Control FIAT</span>
                    <div class="flex items-center gap-1.5">
                        <span class="text-[11px] text-slate-500 font-black tracking-tight">${vesControl.meta}</span>
                        ${canManageCycles && vesControl.hasFlow ? `<button data-close-bank="${(bank.bankName || bank.bank || '').toUpperCase()}" class="btn-close-bank-ves text-[8px] text-slate-500 hover:text-rose-400 bg-transparent hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 px-1 py-0 rounded cursor-pointer transition-all leading-tight" title="Forzar cierre de ciclos FIAT en este banco">&#10005;</button>` : ''}
                    </div>
                </div>
                <div class="text-[13px] font-mono font-black tracking-tight text-white/90">
                    ${vesControl.value}
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
            </div>
        `;
        listContainer.appendChild(div);
    });

    // Wire up "Limpiar FIAT" button for closing stale/orphaned verdicts
    const cleanBtn = document.getElementById('btn-clean-stale-ves');
    if (cleanBtn) {
        cleanBtn.classList.toggle('hidden', !canManageCycles);
    }
    if (cleanBtn && !cleanBtn.dataset.wired) {
        cleanBtn.dataset.wired = '1';
        cleanBtn.addEventListener('click', async () => {
            if (!isAdminCycleActionEnabled()) return;
            if (!confirm('Cerrar ciclos FIAT viejos sin parseo (>48h sin compras vinculadas)?')) return;
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
                setTimeout(() => { cleanBtn.textContent = 'Limpiar FIAT'; }, 3000);
            } catch (err) {
                cleanBtn.textContent = 'Error';
                setTimeout(() => { cleanBtn.textContent = 'Limpiar FIAT'; }, 3000);
            } finally {
                cleanBtn.disabled = false;
            }
        });
    }

    // Per-bank force-close buttons (event delegation on list container)
    if (listContainer && !listContainer.dataset.closeBankWired) {
        listContainer.dataset.closeBankWired = '1';
        listContainer.addEventListener('click', async (e) => {
            const toggle = e.target.closest('[data-bank-toggle]');
            if (toggle) {
                const card = toggle.closest('[data-bank-card]');
                const body = card?.querySelector('[data-bank-body]');
                const icon = toggle.querySelector('[data-bank-toggle-icon]');
                const bankKey = toggle.dataset.bankToggle || card?.dataset.bankCard || '';
                if (!card || !body) return;
                const nextCollapsed = card.dataset.collapsed !== 'true';
                card.dataset.collapsed = nextCollapsed ? 'true' : 'false';
                body.classList.toggle('hidden', nextCollapsed);
                if (icon) icon.innerHTML = nextCollapsed ? '&#9656;' : '&#9662;';
                setSidebarBankCollapsed(bankKey, nextCollapsed);
                return;
            }

            if (!isAdminCycleActionEnabled()) return;
            const btn = e.target.closest('.btn-close-bank-ves');
            if (!btn) return;
            const bankName = btn.dataset.closeBank;
            if (!bankName) return;
            if (!confirm(`Forzar cierre de TODOS los ciclos FIAT abiertos en ${bankName}?`)) return;
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
