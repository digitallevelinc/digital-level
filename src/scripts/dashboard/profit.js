import { fUSDT, fVES, inject } from './utils.js';
import Chart from 'chart.js/auto';

function parseNumeric(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
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

function updateProfitTooltip(kpis = {}, bankInsights = []) {
    const critical = kpis.critical || {};
    const hasCanonicalProfit = critical.profitTotalUSDT !== null
        && critical.profitTotalUSDT !== undefined
        && Number.isFinite(Number(critical.profitTotalUSDT));

    const hasLedgerSpreads = bankInsights && bankInsights.some(b => b.ledgerSpreadReady);
    const backendProfit = parseNumeric(critical.profitTotalUSDT);
    const judgeProfit = parseNumeric(kpis.judge?.completedCycles?.totalProfit);
    const sellFees = getSellFeesTotal(kpis, bankInsights);
    const fallbackJudgeProfit = judgeProfit - sellFees;
    const displayedProfit = hasCanonicalProfit ? backendProfit : fallbackJudgeProfit;

    if (hasLedgerSpreads) {
        const spreadsTotal = (bankInsights || []).reduce((sum, b) => sum + parseNumeric(b.spreadProfitUsdt), 0);
        const ledgerNetProfit = spreadsTotal - sellFees;

        setText(
            'audit-profit-tooltip-summary',
            hasCanonicalProfit
                ? 'El valor visible se mantiene en el profit canonico del backend. El ledger se muestra abajo solo como referencia de contraste.'
                : 'No llego profit canonico del backend. Se usa el fallback del judge y se muestra el ledger como referencia.'
        );
        const formulaEl = document.getElementById('audit-profit-tooltip-formula');
        if (formulaEl) {
            formulaEl.innerHTML = hasCanonicalProfit
                ? '<strong>Regla:</strong> Profit Operativo = critical.profitTotalUSDT'
                : '<strong>Regla:</strong> Profit Operativo = judge.completedCycles.totalProfit - fees de venta';
        }

        const judgeRow = document.getElementById('audit-profit-tooltip-judge');
        if (judgeRow && judgeRow.previousElementSibling) {
            judgeRow.previousElementSibling.textContent = 'Judge ciclos cerrados';
        }

        setText('audit-profit-tooltip-result', fUSDT(displayedProfit));
        setText('audit-profit-tooltip-backend', fUSDT(backendProfit));
        setText('audit-profit-tooltip-judge', fUSDT(judgeProfit));
        setText('audit-profit-tooltip-sell-fees', fUSDT(sellFees));

        setText('audit-profit-tooltip-fallback', fUSDT(ledgerNetProfit));
        const fallbackLabel = document.getElementById('audit-profit-tooltip-fallback')?.previousElementSibling;
        if (fallbackLabel) fallbackLabel.textContent = 'Referencia ledger';

        setText(
            'audit-profit-tooltip-note',
            hasCanonicalProfit
                ? 'Aunque el ledger recalcule spreads despues, el numero visible no debe pisar el profit canonico del backend.'
                : 'No llego profit canonico del backend. La referencia ledger se deja visible solo para comparar contra el fallback.'
        );

    } else {
        setText(
            'audit-profit-tooltip-summary',
            hasCanonicalProfit
                ? 'Se muestra el profit canonico entregado por el backend para el rango actual.'
                : 'El backend no envio un profit canonico y la UI reconstruyo el valor mostrado.'
        );
        const formulaHtml = hasCanonicalProfit
            ? '<strong>Regla:</strong> Profit Operativo = critical.profitTotalUSDT'
            : '<strong>Regla:</strong> Profit Operativo = judge.completedCycles.totalProfit - fees de venta';
        const formulaEl = document.getElementById('audit-profit-tooltip-formula');
        if (formulaEl) formulaEl.innerHTML = formulaHtml;

        const judgeRow = document.getElementById('audit-profit-tooltip-judge');
        if (judgeRow && judgeRow.previousElementSibling) {
            judgeRow.previousElementSibling.textContent = 'Judge ciclos cerrados';
        }

        setText('audit-profit-tooltip-result', fUSDT(displayedProfit));
        setText('audit-profit-tooltip-backend', fUSDT(backendProfit));
        setText('audit-profit-tooltip-judge', fUSDT(judgeProfit));
        setText('audit-profit-tooltip-sell-fees', fUSDT(sellFees));
        setText('audit-profit-tooltip-fallback', fUSDT(fallbackJudgeProfit));

        const fallbackLabel = document.getElementById('audit-profit-tooltip-fallback')?.previousElementSibling;
        if (fallbackLabel) fallbackLabel.textContent = 'Fallback visual';

        setText(
            'audit-profit-tooltip-note',
            hasCanonicalProfit
                ? 'Referencia de respaldo: judge cerrado - fees de venta. El valor visible sigue siendo el canonico del backend.'
                : 'La UI uso el fallback porque no llego critical.profitTotalUSDT desde el backend.'
        );
    }

    return displayedProfit;
}

export function updateProfitUI(kpis = {}, bankInsights = []) {
    const critical = kpis.critical || {};
    const operations = kpis.operations || {};
    const audit = kpis.audit || {};
    const dispersor = kpis.judge?.dispersor || kpis.dispersor || {};

    const displayedProfit = updateProfitTooltip(kpis, bankInsights);

    // This card must reflect Binance API balance only; never fall back to reconstructed totals.
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
    renderProfitChart(kpis.chartData);
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
            renderProfitChart(pendingChartData);
            pendingChartData = null;
        }
    });
}

// --- CHART LOGIC ---
let profitChartInstance = null;

function renderProfitChart(chartData = []) {
    const ctx = document.getElementById('profit-chart');
    if (!ctx) return;

    // Defer render if chart panel is collapsed
    const body = document.getElementById('evolution-chart-body');
    if (body && body.classList.contains('hidden')) {
        pendingChartData = chartData;
        return;
    }

    // Destroy existing chart to prevent canvas reuse errors
    if (profitChartInstance) {
        profitChartInstance.destroy();
    }

    if (!chartData || chartData.length === 0) {
        return;
    }

    const sortedData = [...chartData].sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = sortedData.map(d => {
        const date = new Date(d.date);
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
