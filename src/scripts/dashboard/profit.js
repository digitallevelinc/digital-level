import { fUSDT, fVES, inject } from './utils.js';
import Chart from 'chart.js/auto';

let cachedLedgerProfitSummary = null;

function parseNumeric(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function hasFiniteNumber(value) {
    return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function getSellFeesTotal(kpis = {}, bankInsights = []) {
    const sellFeesFromOps = Number(kpis.operations?.totalFeesSell);
    if (Number.isFinite(sellFeesFromOps)) {
        return sellFeesFromOps;
    }

    return (bankInsights || []).reduce((sum, bank) => (
        sum
        + Number(bank?.trf?.sellFee || 0)
        + Number(bank?.pm?.sellFee || 0)
    ), 0);
}

function updateProfitTooltip(kpis = {}, bankInsights = [], ledgerSummary = null) {
    if (ledgerSummary && typeof ledgerSummary === 'object') {
        cachedLedgerProfitSummary = ledgerSummary;
    }

    const critical = kpis.critical || {};
    const hasBackendProfit = hasFiniteNumber(critical.profitTotalUSDT);
    const backendProfit = parseNumeric(critical.profitTotalUSDT);
    const sellFees = getSellFeesTotal(kpis, bankInsights);
    const ledgerSpreadTotal = parseNumeric(cachedLedgerProfitSummary?.totalSpread);
    const hasLedgerProfit = Number.isFinite(ledgerSpreadTotal) && (
        ledgerSpreadTotal !== 0 || parseNumeric(cachedLedgerProfitSummary?.spreadCount) > 0
    );

    if (hasLedgerProfit) {
        const ledgerNetProfit = ledgerSpreadTotal - sellFees;
        const displayedProfit = ledgerNetProfit;

        setText(
            'audit-profit-tooltip-summary',
            'El valor visible es la referencia del ledger. El profit canonico del backend se muestra como verificacion.'
        );
        const formulaEl = document.getElementById('audit-profit-tooltip-formula');
        if (formulaEl) {
            formulaEl.innerHTML = '<strong>Regla visible:</strong> Profit Operativo = referencia ledger';
        }

        setText('audit-profit-tooltip-result', fUSDT(displayedProfit));
        setText('audit-profit-tooltip-backend', fUSDT(backendProfit));
        setText('audit-profit-tooltip-sell-fees', fUSDT(sellFees));

        setText('audit-profit-tooltip-fallback', hasBackendProfit ? fUSDT(backendProfit) : '---');
        const fallbackLabel = document.getElementById('audit-profit-tooltip-fallback')?.previousElementSibling;
        if (fallbackLabel) fallbackLabel.textContent = 'Canonico backend';

        setText(
            'audit-profit-tooltip-note',
            'El ledger calcula el spread neto por ciclos cerrados. El canonico del backend se muestra como referencia de verificacion.'
        );

        return displayedProfit;
    } else {
        const displayedProfit = hasBackendProfit ? backendProfit : 0;
        setText(
            'audit-profit-tooltip-summary',
            hasBackendProfit
                ? 'Todavia no llego el resumen del ledger. El valor visible usa el profit canonico del backend y el fallback queda solo como referencia.'
                : 'Todavia no llego el resumen del ledger ni el profit canonico del backend. Este KPI se mantiene en 0.'
        );
        const formulaHtml = '<strong>Regla visible:</strong> Profit Operativo = profit canonico del backend';
        const formulaEl = document.getElementById('audit-profit-tooltip-formula');
        if (formulaEl) formulaEl.innerHTML = formulaHtml;

        setText('audit-profit-tooltip-result', fUSDT(displayedProfit));
        setText('audit-profit-tooltip-backend', fUSDT(backendProfit));
        setText('audit-profit-tooltip-sell-fees', fUSDT(sellFees));
        setText('audit-profit-tooltip-fallback', '---');

        const fallbackLabel = document.getElementById('audit-profit-tooltip-fallback')?.previousElementSibling;
        if (fallbackLabel) fallbackLabel.textContent = hasBackendProfit ? 'Referencia visual' : 'Referencia pendiente';

        setText(
            'audit-profit-tooltip-note',
            hasBackendProfit
                ? 'Mientras no llegue el ledger, el KPI visible debe seguir el valor canonico del backend.'
                : 'Este KPI no debe reconstruirse con judge, spreads ni otras fuentes mientras falte el valor canonico.'
        );

        return displayedProfit;
    }
}

export function updateProfitUI(kpis = {}, bankInsights = [], ledgerSummary = null) {
    const critical = kpis.critical || {};
    const operations = kpis.operations || {};
    const audit = kpis.audit || {};
    const dispersor = kpis.judge?.dispersor || kpis.dispersor || {};

    const displayedProfit = updateProfitTooltip(kpis, bankInsights, ledgerSummary);

    // This card must reflect Binance API balance only.
    const realBinance = parseNumeric(audit.realBalance);
    inject('real-binance-balance', fUSDT(realBinance));
    inject('audit-total-profit-display', fUSDT(displayedProfit), true);

    inject('audit-total-volume', fUSDT(parseFloat(operations.totalVolumeUSDT || 0)));
    inject('audit-total-fees', fUSDT(parseFloat(operations.totalFeesPaid || 0)));

    const hasDispersorResidualMetrics =
        Object.prototype.hasOwnProperty.call(dispersor, 'principalGrossProfitUsdt')
        || Object.prototype.hasOwnProperty.call(dispersor, 'teamProfitUsdt')
        || Object.prototype.hasOwnProperty.call(dispersor, 'residualProfitUsdt');

    if (hasDispersorResidualMetrics) {
        inject('dispersor-gross-profit', fUSDT(parseNumeric(dispersor.principalGrossProfitUsdt)));
        inject('dispersor-team-profit', fUSDT(parseNumeric(dispersor.teamProfitUsdt)));
        inject('dispersor-residual-profit', fUSDT(parseNumeric(dispersor.residualProfitUsdt)));
        setText('dispersor-linked-count', `${parseNumeric(dispersor.linkedOperatorCount)} ops`);
    } else {
        inject('dispersor-gross-profit', '---');
        inject('dispersor-team-profit', '---');
        inject('dispersor-residual-profit', '---');
        setText('dispersor-linked-count', '-- ops');
    }

    if (critical.profitTotalFiat) {
        inject('audit-profit-fiat', fVES(critical.profitTotalFiat), true);
    }

    const wallets = kpis.wallets || {};
    inject('channel-red', fUSDT(wallets.balanceRed || 0));
    inject('channel-switch', fUSDT(wallets.balanceSwitch || 0));
    inject('channel-p2p', fUSDT(wallets.balanceP2P || 0));
    inject('channel-pay', fUSDT(wallets.balancePay || 0));

    renderBankProfitList(bankInsights);
    initEvolutionToggle();
    renderProfitChart(kpis.chartData, displayedProfit);
}

function renderBankProfitList(bankInsights) {
    const profitList = document.getElementById('profit-banks-list');
    if (!profitList) return;
    profitList.innerHTML = bankInsights.map(bank => {
        const profitVal = bank.profit || 0;
        return `
            <div class="flex justify-between items-center py-1">
                <span class="text-[10px] font-black text-gray-400 uppercase">${bank.bank || 'Banco'}</span>
                <span class="text-[11px] font-mono font-bold ${profitVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                    ${profitVal >= 0 ? '+' : ''}${fUSDT(profitVal)}
                </span>
            </div>
        `;
    }).join('');
}

// --- EVOLUTION CHART TOGGLE ---
let evolutionChartReady = false;
let pendingChartData = null;
let pendingChartTotalProfit = 0;

function initEvolutionToggle() {
    const btn = document.getElementById('toggle-evolution-chart');
    const body = document.getElementById('evolution-chart-body');
    const icon = document.getElementById('evolution-chart-icon');
    if (!btn || !body) return;
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
        const isOpen = !body.classList.contains('hidden');
        body.classList.toggle('hidden', isOpen);
        if (icon) icon.style.transform = isOpen ? '' : 'rotate(90deg)';
        if (!isOpen && pendingChartData) {
            renderProfitChart(pendingChartData, pendingChartTotalProfit);
            pendingChartData = null;
            pendingChartTotalProfit = 0;
        }
    });
}

// --- CHART LOGIC ---
let profitChartInstance = null;

function parseChartDateKey(value) {
    if (value instanceof Date) {
        return value;
    }

    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return new Date(value);
    }

    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
}

function renderProfitChart(chartData = [], totalProfit = 0) {
    const ctx = document.getElementById('profit-chart');
    if (!ctx) return;

    // Defer render if chart panel is collapsed
    const body = document.getElementById('evolution-chart-body');
    if (body && body.classList.contains('hidden')) {
        pendingChartData = chartData;
        pendingChartTotalProfit = totalProfit;
        return;
    }

    // Destroy existing chart to prevent canvas reuse errors
    if (profitChartInstance) {
        profitChartInstance.destroy();
    }

    if (!chartData || chartData.length === 0) {
        return;
    }

    // The chart profit MUST always match the Profit Operativo KPI.
    // Distribute totalProfit (= displayedProfit) across days proportionally
    // by cycle count so the sum of chart bars equals the KPI exactly.
    let normalizedData = chartData;
    if (Math.abs(totalProfit) > 0.001) {
        const totalCycles = chartData.reduce((sum, d) => sum + (d.cycles || 0), 0);
        if (totalCycles > 0) {
            normalizedData = chartData.map(d => ({
                ...d,
                profit: Math.round((totalProfit * ((d.cycles || 0) / totalCycles)) * 100) / 100
            }));
        } else {
            // No cycle info — assign full profit to the last day with fees, or last day
            const lastWithFees = [...chartData].reverse().findIndex(d => (d.fees || 0) > 0);
            const targetIdx = chartData.length - 1 - (lastWithFees >= 0 ? lastWithFees : 0);
            normalizedData = chartData.map((d, i) => ({
                ...d,
                profit: i === targetIdx ? totalProfit : 0
            }));
        }
    } else {
        normalizedData = chartData.map(d => ({ ...d, profit: 0 }));
    }

    const sortedData = [...normalizedData].sort((a, b) => (
        parseChartDateKey(a.date) - parseChartDateKey(b.date)
    ));

    const labels = sortedData.map(d => {
        const date = parseChartDateKey(d.date);
        return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
    });

    const profitData = sortedData.map(d => d.profit);
    const feesData = sortedData.map(d => d.fees);
    const capitalData = sortedData.map(d => d.capital);
    const cyclesData = sortedData.map(d => d.cycles ?? 0);
    profitChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Fees (USDT)',
                    data: feesData,
                    backgroundColor: '#f87171',
                    stack: 'Stack 0',
                    order: 3,
                    yAxisID: 'y'
                },
                {
                    label: 'Profit (USDT)',
                    data: profitData,
                    backgroundColor: '#4ade80',
                    stack: 'Stack 0',
                    order: 2,
                    yAxisID: 'y'
                },
                {
                    label: 'Capital',
                    data: capitalData,
                    type: 'line',
                    borderColor: '#60a5fa',
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3,
                    order: 0,
                    yAxisID: 'y1'
                },
                {
                    label: 'Ciclos',
                    data: cyclesData,
                    type: 'line',
                    borderColor: '#f3ba2f',
                    backgroundColor: 'rgba(243,186,47,0.08)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#f3ba2f',
                    tension: 0.3,
                    order: 1,
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.raw !== null) {
                                if (label.includes('Ciclos')) {
                                    label += context.raw;
                                } else {
                                    label += fUSDT(context.raw);
                                }
                            }
                            return label;
                        }
                    }
                },
                legend: {
                    labels: {
                        color: '#9ca3af',
                        font: { size: 10 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#4ade80' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#60a5fa' }
                },
                y2: {
                    type: 'linear',
                    display: false,
                    position: 'right',
                }
            }
        }
    });
}
