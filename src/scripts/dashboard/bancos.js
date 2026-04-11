import { fUSDT, fVES } from './utils.js';

const FIAT_COVERAGE_COMPLETION_TOLERANCE = 500;

const safeFloat = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    return Number(val.toString().replace(',', '.')) || 0;
};

const formatSignedUsdtPlain = (val) => {
    const num = Number(val || 0);
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
};

const getPromiseSellRate = (bank = {}) => {
    const promisedUsdt = safeFloat(bank.rangePromisedUsdt);
    const promisedFiat = safeFloat(bank.rangePromisedFiat);
    if (promisedUsdt <= 0 || promisedFiat <= 0) return 0;
    return promisedFiat / promisedUsdt;
};

export function updateBancosUI(insights = [], kpis = {}) {
    if (!insights) return;

    const normalizeBankName = (value) => {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return '';
        if (raw.includes('bbva') || raw.includes('provincial')) return 'provincial';
        if (raw.includes('mercantil')) return 'mercantil';
        if (raw.includes('banesco')) return 'banesco';
        if (raw.includes('bnc')) return 'bnc';
        if (raw.includes('bancamiga')) return 'bancamiga';
        if (raw.includes('fintech') || raw === 'bank') return 'bank';
        return raw.replace(/\s+/g, '');
    };

    const normalizeBankLimitKey = (bank) => normalizeBankName(bank?.bankName || bank?.bank || '');
    const clampPercent = (value) => Math.max(0, Math.min(100, Number(value || 0)));
    const formatVesInline = (value) => Number(value || 0).toLocaleString('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const terminalVerdictStatuses = new Set([
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
    const isTerminalVerdict = (verdict = {}) => {
        const rawStatus = String(verdict?.status || verdict?.orderStatus || '').trim().toUpperCase();
        if (rawStatus) {
            if (terminalVerdictStatuses.has(rawStatus)) return true;
            if (rawStatus.startsWith('CLOSE')) return true;
            if (rawStatus.startsWith('COMPLETE')) return true;
            if (rawStatus.startsWith('CANCEL')) return true;
            if (rawStatus.startsWith('EXPIRE')) return true;
            if (rawStatus.startsWith('RELEASE')) return true;
        }

        return Boolean(verdict?.closedAt || verdict?.completedAt || verdict?.releasedAt);
    };
    const getActiveOpenVerdicts = (inputKpis = {}) => {
        const openVerdicts = Array.isArray(inputKpis?.judge?.openVerdicts) ? inputKpis.judge.openVerdicts : [];
        return openVerdicts.filter((verdict) => !isTerminalVerdict(verdict));
    };

    const buildVesControlSummaryByBank = (inputKpis = {}) => {
        const hasLiveVerdictsFeed = Array.isArray(inputKpis?.judge?.openVerdicts);
        const openVerdicts = getActiveOpenVerdicts(inputKpis);
        const summary = new Map();

        if (!hasLiveVerdictsFeed) {
            (Array.isArray(insights) ? insights : []).forEach((bank) => {
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
                });
            });
        }

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
            };

            bucket.inflowFiat += boundedExpected;
            bucket.availableFiat += boundedRemaining;
            bucket.consumedFiat += consumed;

            summary.set(bankKey, bucket);
        });

        return summary;
    };

    const buildBankVesLimitLabel = (bank, vesControlSummaryByBank = new Map()) => {
        const key = normalizeBankLimitKey(bank);
        const dynamicSummary = vesControlSummaryByBank.get(key);

        if (!dynamicSummary) {
            return {
                value: '0.00 / 0.00',
                meta: 'Sin flujo activo',
                progress: 0,
            };
        }

        const available = Number(dynamicSummary.availableFiat || 0);
        const consumed = Number(dynamicSummary.consumedFiat || 0);
        const inflowFiat = Number(dynamicSummary.inflowFiat || 0);
        let effectiveCap = Math.max(0, inflowFiat, available + consumed);

        if (available > effectiveCap) {
            effectiveCap = available;
        }

        if (effectiveCap <= 0) {
            return {
                value: '0.00 / 0.00',
                meta: 'Sin flujo activo',
                progress: 0,
            };
        }

        const availableNormalized = available >= Math.max(0, effectiveCap - FIAT_COVERAGE_COMPLETION_TOLERANCE)
            ? effectiveCap
            : available;
        const progress = availableNormalized <= 0 ? 0 : clampPercent((availableNormalized / effectiveCap) * 100);
        const burned = Math.max(0, effectiveCap - availableNormalized);

        return {
            value: `${formatVesInline(availableNormalized)} / ${formatVesInline(effectiveCap)}`,
            meta: burned <= 0
                ? 'Barra llena'
                : availableNormalized <= 0.01
                    ? 'Lote quemado'
                    : `${formatVesInline(burned)} gastado`,
            progress,
        };
    };

    const vesControlSummaryByBank = buildVesControlSummaryByBank(kpis);

    const getBankId = (name) => {
        const lower = name.toLowerCase().trim();
        if (lower.includes('pago') || lower.includes('movil') || lower === 'pm') return 'pagomovil';
        if (lower.includes('bbva') || lower.includes('provincial')) return 'provincial';
        if (lower.includes('bnc')) return 'bnc';
        if (lower.includes('banesco')) return 'banesco';
        if (lower.includes('mercantil')) return 'mercantil';
        if (lower.includes('bancamiga')) return 'bancamiga';
        if (lower.includes('fintech') || lower === 'bank') return 'bank';
        return lower.split(' ')[0].replace(/\s+/g, '');
    };

    insights.forEach(b => {
        const id = getBankId(b.bank);

        const ui = {
            fiat: document.getElementById(`bank-fiat-${id}`),
            usdt: document.getElementById(`bank-usdt-${id}`),
            buy: document.getElementById(`bank-buy-${id}`),
            sell: document.getElementById(`bank-sell-${id}`),
            volBuyVes: document.getElementById(`bank-vol-buy-ves-${id}`),
            volBuyUsd: document.getElementById(`bank-vol-buy-usd-${id}`),
            volSellVes: document.getElementById(`bank-vol-sell-ves-${id}`),
            volSellUsd: document.getElementById(`bank-vol-sell-usd-${id}`),
            feeBuy: document.getElementById(`bank-fee-buy-${id}`),
            feeSell: document.getElementById(`bank-fee-sell-${id}`),
            profit: document.getElementById(`bank-profit-${id}`),
            margin: document.getElementById(`bank-margin-${id}`),
            trOps: document.getElementById(`bank-tr-ops-${id}`),
            pmOps: document.getElementById(`bank-pm-ops-${id}`),
            sellPM: document.getElementById(`bank-sell-pm-${id}`),
            volSellPM: document.getElementById(`bank-vol-sell-pm-${id}`),
            feeSellPM: document.getElementById(`bank-fee-sell-pm-${id}`),
            buyPM: document.getElementById(`bank-buy-pm-${id}`),
            volBuyPM: document.getElementById(`bank-vol-buy-pm-${id}`),
            feeBuyPM: document.getElementById(`bank-fee-buy-pm-${id}`),
            buyingPower: document.getElementById(`bank-buying-power-${id}`),
            breakevenLabel: document.getElementById(`bank-breakeven-label-${id}`),
            breakeven: document.getElementById(`bank-breakeven-${id}`),
            beInfo: document.getElementById(`bank-be-info-${id}`),
            beMeta: document.getElementById(`bank-be-meta-${id}`),
            beSale: document.getElementById(`bank-be-sale-${id}`),
            spreadUsdt: document.getElementById(`bank-spread-usdt-${id}`),
            spreadPercent: document.getElementById(`bank-spread-percent-${id}`),
            pmBadge: document.getElementById(`bank-pm-badge-${id}`),
            vesValue: document.getElementById(`bank-ves-value-${id}`),
            vesMeta: document.getElementById(`bank-ves-meta-${id}`),
            vesBar: document.getElementById(`bank-ves-bar-${id}`),
            vesDelta: document.getElementById(`bank-ves-delta-${id}`),
        };

        const fiatBal = safeFloat(b.fiatBalance);
        const usdtBal = safeFloat(b.usdtBalance);
        const bankProfit = safeFloat(b.profit);
        const pm = b.pm || {
            sellCount: 0,
            buyCount: 0,
            sellVol: 0,
            buyVol: 0,
            sellFee: 0,
            buyFee: 0,
            avgBuyRate: 0,
            avgSellRate: 0
        };
        const trf = b.trf || {
            buyCount: 0,
            sellCount: 0,
            buyVol: 0,
            sellVol: 0,
            buyVolUSDT: 0,
            sellVolUSDT: 0,
            buyFee: 0,
            sellFee: 0
        };

        if (ui.fiat) ui.fiat.textContent = fVES(fiatBal);
        if (ui.usdt) ui.usdt.textContent = fUSDT(usdtBal);
        if (ui.profit) ui.profit.textContent = `${fUSDT(bankProfit)} ≈ Profit Neto`;
        if (ui.trOps) ui.trOps.textContent = `${trf.buyCount + trf.sellCount} OPS`;

        if (ui.pmOps) ui.pmOps.textContent = `${pm.buyCount + pm.sellCount} OPS`;

        const pmSellRate = safeFloat(pm.avgSellRate || pm.sellRate || 0);
        const pmBuyRate = safeFloat(pm.avgBuyRate || pm.buyRate || 0);

        if (ui.sellPM) ui.sellPM.textContent = pmSellRate > 0 ? pmSellRate.toFixed(2) : '---';
        if (ui.volSellPM) ui.volSellPM.textContent = fVES(pm.sellVol);
        if (ui.feeSellPM) ui.feeSellPM.textContent = pm.sellFee.toFixed(2);

        if (ui.buyPM) ui.buyPM.textContent = pmBuyRate > 0 ? pmBuyRate.toFixed(2) : '---';
        if (ui.volBuyPM) ui.volBuyPM.textContent = fVES(pm.buyVol);
        if (ui.feeBuyPM) ui.feeBuyPM.textContent = pm.buyFee.toFixed(2);

        if (ui.buyingPower) {
            const rate = b.buyRate || b.sellRate || 1;
            const power = rate > 0 ? (fiatBal / rate) : 0;
            ui.buyingPower.textContent = `≈ ${fUSDT(power)}`;
        }

        if (ui.pmBadge) {
            const hasPM = (pm.buyCount + pm.sellCount) > 0 || (pm.buyVol + pm.sellVol) > 0;
            ui.pmBadge.classList.toggle('hidden', !hasPM);
        }

        const fallbackPromiseRate = getPromiseSellRate(b);
        const buyRate = safeFloat(b.weightedAvgBuyRate);
        const sellRate = safeFloat(b.weightedAvgSellRate || b.sellRate || fallbackPromiseRate);

        if (ui.buy) ui.buy.textContent = buyRate > 0 ? buyRate.toFixed(2) : '---';
        if (ui.sell) ui.sell.textContent = sellRate > 0 ? sellRate.toFixed(2) : '---';

        const trfBuyVol = safeFloat(trf.buyVol);
        const trfSellVol = safeFloat(trf.sellVol);
        const trfBuyVolUSD = safeFloat(trf.buyVolUSDT);
        const trfSellVolUSD = safeFloat(trf.sellVolUSDT);

        if (ui.volBuyVes) ui.volBuyVes.textContent = fVES(trfBuyVol);
        if (ui.volBuyUsd) ui.volBuyUsd.textContent = fUSDT(trfBuyVolUSD);
        if (ui.volSellVes) ui.volSellVes.textContent = fVES(trfSellVol);
        if (ui.volSellUsd) ui.volSellUsd.textContent = fUSDT(trfSellVolUSD);

        const totalFeeBuy = (trf.buyFee || 0) + (pm.buyFee || 0);
        const totalFeeSell = (trf.sellFee || 0) + (pm.sellFee || 0);

        if (ui.feeBuy) ui.feeBuy.textContent = fUSDT(totalFeeBuy);
        if (ui.feeSell) ui.feeSell.textContent = fUSDT(totalFeeSell);

        const techo = safeFloat(b.ceilingRate || b.breakEvenRate || fallbackPromiseRate || 0);
        const baseVerificationPercent = safeFloat(b.verificationPercent);
        const lastSellRole = String(b.lastSellRole || 'TAKER').toUpperCase();
        const appliedPercent = safeFloat(
            b.ceilingAppliedPercent !== undefined
                ? b.ceilingAppliedPercent
                : (baseVerificationPercent > 0
                    ? baseVerificationPercent * (lastSellRole === 'MAKER' ? 2 : 1)
                    : 0)
        );
        const lastSellRate = safeFloat(b.lastSellRate || fallbackPromiseRate);
        const spreadProfitUsdt = safeFloat(b.spreadProfitUsdt);
        const profitPercent = safeFloat(b.profitPercent || b.margin);
        const verificationLevel = String(b.verificationLevel || '').trim();
        const levelLabel = verificationLevel
            ? verificationLevel.charAt(0).toUpperCase() + verificationLevel.slice(1)
            : 'Sin nivel';

        if (ui.breakeven) {
            ui.breakeven.textContent = techo > 0 ? techo.toFixed(2) : '0.00';
        }

        if (ui.breakevenLabel) {
            ui.breakevenLabel.textContent = appliedPercent > 0
                ? `Techo (-${appliedPercent.toFixed(2)}%)`
                : 'Techo';
            ui.breakevenLabel.title = [
                `Nivel: ${levelLabel}`,
                `Ultima venta: ${lastSellRole}`,
                `Porcentaje base: ${baseVerificationPercent.toFixed(2)}%`,
                `Porcentaje aplicado al techo: ${appliedPercent.toFixed(2)}%`,
            ].join('\n');
        }

        if (ui.beMeta) {
            ui.beMeta.textContent = `${levelLabel} ${baseVerificationPercent.toFixed(2)}%`;
        }

        if (ui.beSale) {
            ui.beSale.textContent = lastSellRate > 0
                ? `${lastSellRole} ${lastSellRate.toFixed(2)}`
                : `${lastSellRole} --`;
        }

        if (ui.beInfo) {
            if (!techo) {
                ui.beInfo.textContent = 'Esperando...';
                ui.beInfo.className = 'text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-gray-500 font-bold uppercase tracking-tighter';
            } else {
                const currentBuy = safeFloat(b.buyRate);
                const diff = currentBuy > 0 ? ((techo - currentBuy) / currentBuy) * 100 : 0;

                ui.beInfo.textContent = `Gap: ${diff.toFixed(2)}%`;
                ui.beInfo.className = `text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${diff >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`;
                ui.beInfo.title = 'GAP: Diferencia entre Techo y tu Compra.\n(+) Tienes espacio para subir.\n(-) Estas comprando por encima del Techo.';
            }
        }

        if (ui.spreadUsdt) {
            if (buyRate > 0 && sellRate > 0 || Math.abs(spreadProfitUsdt) > 0.0001 || Math.abs(bankProfit) > 0.0001) {
                ui.spreadUsdt.textContent =
                    `${formatSignedUsdtPlain(spreadProfitUsdt)} | Neto ${formatSignedUsdtPlain(bankProfit)}`;
                ui.spreadUsdt.className = `text-[15px] font-black tracking-tight ${spreadProfitUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
                ui.spreadUsdt.removeAttribute('title');
            } else {
                ui.spreadUsdt.textContent = '0.00 USDT | Neto 0.00 USDT';
                ui.spreadUsdt.className = 'text-[15px] font-black tracking-tight text-slate-400';
                ui.spreadUsdt.removeAttribute('title');
            }
        }

        if (ui.spreadPercent) {
            ui.spreadPercent.textContent = `${profitPercent.toFixed(2)}%`;
            ui.spreadPercent.className = `text-[12px] font-black uppercase tracking-[0.12em] ${profitPercent >= 0 ? 'text-[#F3BA2F]' : 'text-rose-400'}`;
        }

        if (ui.margin) {
            const marginVal = safeFloat(b.margin);
            ui.margin.textContent = `${marginVal.toFixed(2)}%`;

            if (marginVal >= 0) {
                ui.margin.className = 'bg-emerald-500/10 text-emerald-400 px-5 py-2 rounded-full border border-emerald-500/20 text-[13px] font-black shadow-lg';
            } else {
                ui.margin.className = 'bg-rose-500/10 text-rose-400 px-5 py-2 rounded-full border border-rose-500/20 text-[13px] font-black shadow-lg';
            }
        }

        const vesControl = buildBankVesLimitLabel(b, vesControlSummaryByBank);
        if (ui.vesValue) ui.vesValue.textContent = vesControl.value;
        if (ui.vesMeta) ui.vesMeta.textContent = vesControl.meta;
        if (ui.vesBar) ui.vesBar.style.width = `${vesControl.progress}%`;

        // Dispersor reconciliation: fiatBalance (net VES from ops) vs rangeVesAvailableFiat
        // (VES committed to active promises). Delta > 0 means orphaned VES on this card.
        if (ui.vesDelta) {
            const bankKey = normalizeBankLimitKey(b);
            const summary = vesControlSummaryByBank.get(bankKey);
            const availableFromPromise = summary ? Number(summary.availableFiat || 0) : 0;
            const delta = fiatBal - availableFromPromise;
            const THRESHOLD = 100; // VES

            if (Math.abs(delta) < THRESHOLD || (fiatBal <= 0.01 && availableFromPromise <= 0.01)) {
                ui.vesDelta.classList.add('hidden');
            } else if (delta > THRESHOLD) {
                ui.vesDelta.textContent = `${formatVesInline(delta)} FIAT sin promesa activa`;
                ui.vesDelta.className = 'mt-2 text-xs font-mono font-bold text-amber-400 truncate';
            } else {
                ui.vesDelta.textContent = `${formatVesInline(Math.abs(delta))} FIAT en promesa pendiente`;
                ui.vesDelta.className = 'mt-2 text-xs font-mono font-bold text-sky-400 truncate';
            }
        }
    });

    sortBankCards(insights, getBankId);
}

function sortBankCards(insights, getBankIdFn) {
    const grid = document.getElementById('banks-grid');
    if (!grid) return;

    const cards = Array.from(grid.children);

    cards.sort((a, b) => {
        const idA = a.getAttribute('data-bank-id');
        const idB = b.getAttribute('data-bank-id');
        const idxA = Number(a.getAttribute('data-original-index') || 999);
        const idxB = Number(b.getAttribute('data-original-index') || 999);

        const dataA = insights.find(i => getBankIdFn(i.bank) === idA);
        const dataB = insights.find(i => getBankIdFn(i.bank) === idB);

        const isTrue = (val) => val === true || val === 'true';

        const isFavA = isTrue(dataA?.isFavorite);
        const isFavB = isTrue(dataB?.isFavorite);

        if (isFavA && !isFavB) return -1;
        if (!isFavA && isFavB) return 1;

        return idxA - idxB;
    });

    cards.forEach(card => grid.appendChild(card));

    insights.forEach(b => {
        const id = getBankIdFn(b.bank);
        const starBtn = document.getElementById(`fav-${id}`);
        if (starBtn) {
            const isFav = b.isFavorite === true || b.isFavorite === 'true';
            if (isFav) {
                starBtn.classList.remove('text-gray-600');
                starBtn.classList.add('text-yellow-400');
            } else {
                starBtn.classList.add('text-gray-600');
                starBtn.classList.remove('text-yellow-400');
            }
        }
    });
}
