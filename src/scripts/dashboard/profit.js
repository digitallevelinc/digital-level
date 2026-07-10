import { fUSDT, fVES, inject } from './utils.js';
import Chart from 'chart.js/auto';

let cachedLedgerProfitSummary = null;

export function resetProfitLedgerSummary() {
    cachedLedgerProfitSummary = null;
}

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

function setHtml(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}

function setProfitCardSkeleton(isVisible) {
    const skeleton = document.getElementById('audit-total-profit-skeleton');
    const value = document.getElementById('audit-total-profit-display');
    if (!skeleton || !value) return;

    skeleton.classList.toggle('hidden', !isVisible);
    value.classList.toggle('hidden', isVisible);
    value.setAttribute('aria-busy', isVisible ? 'true' : 'false');
}

function formatSignedUsd(value) {
    const amount = Number(value || 0);
    const formatted = fUSDT(Math.abs(amount));
    if (amount < 0) return `-${formatted}`;
    return formatted;
}

function buildSpreadBreakdown(summary = {}) {
    const items = Array.isArray(summary?.spreadByBank) ? summary.spreadByBank : [];
    if (!items.length) return 'Sin desglose del ledger';

    const pieces = items.map((entry) => `${entry.bankLabel} ${formatSignedUsd(entry.spreadUsdt)}`);
    return `${pieces.join(' + ')} = ${fUSDT(summary?.totalSpread || 0)}`;
}

function getUsdtFeesTotal(kpis = {}, bankInsights = []) {
    const totalFeesFromOps = Number(kpis.operations?.totalFeesPaid);
    if (Number.isFinite(totalFeesFromOps)) {
        return totalFeesFromOps;
    }

    return (bankInsights || []).reduce((sum, bank) => (
        sum
        + Number(bank?.trf?.buyFee || 0)
        + Number(bank?.trf?.sellFee || 0)
        + Number(bank?.pm?.buyFee || 0)
        + Number(bank?.pm?.sellFee || 0)
    ), 0);
}

function buildBackendProfitOperation(kpis = {}, displayedProfit = 0) {
    const operations = kpis.operations || {};
    const buyTotal = operations.buys?.totalUSDT ?? operations.buys?.volume;
    const sellTotal = operations.sells?.totalUSDT ?? operations.sells?.volume;
    const feesTotal = operations.totalFeesPaid;

    if ([buyTotal, sellTotal, feesTotal].every(hasFiniteNumber)) {
        return `${fUSDT(buyTotal)} - ${fUSDT(sellTotal)} - ${fUSDT(feesTotal)} = ${fUSDT(displayedProfit)}`;
    }

    return `Profit backend = ${fUSDT(displayedProfit)}`;
}

function applyVisibleProfit(kpis = {}, profit = 0) {
    if (!kpis.critical) kpis.critical = {};
    if (!kpis.metrics) kpis.metrics = {};

    const normalizedProfit = parseNumeric(profit);
    kpis.__ledgerProfitReady = true;
    kpis.critical.profitTotalUSDT = normalizedProfit;
    kpis.metrics.totalProfit = normalizedProfit;

    const completedCycles = parseNumeric(kpis.critical.completedCycles);
    if (completedCycles > 0) {
        kpis.critical.averageCycleProfit = normalizedProfit / completedCycles;
    }

    if (kpis.critical.payroll && typeof kpis.critical.payroll === 'object') {
        const percentage = parseNumeric(kpis.critical.payroll.percentage);
        kpis.critical.payroll.baseProfit = normalizedProfit;
        kpis.critical.payroll.totalAmount = (normalizedProfit * percentage) / 100;
    }
}

function hasNoOperationsInRange(kpis = {}) {
    const totalVolume = parseNumeric(kpis.operations?.totalVolumeUSDT);
    const totalOperations = parseNumeric(kpis.operations?.totalOperations ?? kpis.operations?.totalCount);
    return totalVolume === 0 && totalOperations === 0;
}

function updateProfitTooltip(kpis = {}, bankInsights = [], ledgerSummary = null) {
    if (ledgerSummary && typeof ledgerSummary === 'object') {
        cachedLedgerProfitSummary = ledgerSummary;
    }

    const critical = kpis.critical || {};
    const metrics = kpis.metrics || {};
    const hasBackendProfit = hasFiniteNumber(critical.profitTotalUSDT)
        || hasFiniteNumber(metrics.totalProfit);
    const backendProfit = hasFiniteNumber(critical.profitTotalUSDT)
        ? Number(critical.profitTotalUSDT)
        : Number(metrics.totalProfit);
    const usdtFees = getUsdtFeesTotal(kpis, bankInsights);
    const ledgerSpreadTotal = parseNumeric(cachedLedgerProfitSummary?.totalSpread);
    const ledgerSpreadCount = parseNumeric(cachedLedgerProfitSummary?.spreadCount);
    const ledgerReported = ledgerSummary !== null || (
        Number.isFinite(ledgerSpreadTotal) && Number.isFinite(ledgerSpreadCount)
    );
    const noOperations = hasNoOperationsInRange(kpis);

    // Profit Operativo is canonical from the backend. The ledger spread summary
    // is only a reference in the tooltip, because it can use a different
    // pairing/truncation model than the accounting formula.
    if (hasBackendProfit || noOperations) {
        const displayedProfit = hasBackendProfit ? backendProfit : 0;
        applyVisibleProfit(kpis, displayedProfit);

        setText(
            'audit-profit-tooltip-summary',
            hasBackendProfit
                ? 'Profit neto P2P del rango enviado por backend.'
                : 'No hay operaciones en el rango seleccionado.'
        );
        setHtml(
            'audit-profit-tooltip-formula',
            '<strong>Regla visible:</strong> Profit Operativo = P2P comprado - P2P vendido - fees USDT'
        );

        setText('audit-profit-tooltip-result', fUSDT(displayedProfit));
        setText('audit-profit-tooltip-source-label', 'Backend KPI');
        setText('audit-profit-tooltip-source-value', fUSDT(displayedProfit));
        setText('audit-profit-tooltip-backend', hasBackendProfit ? fUSDT(backendProfit) : '---');
        setText('audit-profit-tooltip-sell-fees', fUSDT(usdtFees));
        setText(
            'audit-profit-tooltip-operation',
            hasBackendProfit ? buildBackendProfitOperation(kpis, displayedProfit) : 'Sin operaciones = $0.00'
        );
        setText(
            'audit-profit-tooltip-spread-breakdown',
            ledgerReported ? buildSpreadBreakdown(cachedLedgerProfitSummary) : 'Esperando referencia del ledger'
        );
        setText('audit-profit-tooltip-fallback', 'Sin fallback');

        const fallbackLabel = document.getElementById('audit-profit-tooltip-fallback')?.previousElementSibling;
        if (fallbackLabel) fallbackLabel.textContent = 'Fallback';

        setText(
            'audit-profit-tooltip-note',
            ledgerReported
                ? `Ledger referencial: ${ledgerSpreadCount} spreads suman ${fUSDT(ledgerSpreadTotal)}. El KPI visible usa el neto P2P canonico.`
                : 'El KPI visible usa el neto P2P canonico del backend.'
        );

        return displayedProfit;
    }

    const displayedProfit = null;
    setText(
        'audit-profit-tooltip-summary',
        'Esperando profit neto del backend para este rango.'
    );
    setHtml(
        'audit-profit-tooltip-formula',
        '<strong>Regla visible:</strong> Profit Operativo = P2P comprado - P2P vendido - fees USDT'
    );

    setText('audit-profit-tooltip-result', 'Pendiente');
    setText('audit-profit-tooltip-source-label', 'Backend KPI');
    setText('audit-profit-tooltip-source-value', '---');
    setText('audit-profit-tooltip-backend', '---');
    setText('audit-profit-tooltip-sell-fees', fUSDT(usdtFees));
    setText('audit-profit-tooltip-operation', 'Esperando backend...');
    setText(
        'audit-profit-tooltip-spread-breakdown',
        ledgerReported ? buildSpreadBreakdown(cachedLedgerProfitSummary) : 'Esperando referencia del ledger'
    );
    setText('audit-profit-tooltip-fallback', 'Sin fallback');

    const fallbackLabel = document.getElementById('audit-profit-tooltip-fallback')?.previousElementSibling;
    if (fallbackLabel) fallbackLabel.textContent = 'Fallback';

    setText(
        'audit-profit-tooltip-note',
        'El KPI permanece pendiente hasta que el backend envie el profit neto del rango.'
    );

    return displayedProfit;
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
    setProfitCardSkeleton(displayedProfit === null);
    if (displayedProfit !== null) {
        inject('audit-total-profit-display', fUSDT(displayedProfit), true);
    }

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

    // For single-day ranges the entire chart is one bar — sync it with the
    // displayed profit so chart and KPI card always agree. The displayed
    // profit now follows the canonical backend value (see updateProfitTooltip),
    // so we propagate that consistently into the chart bar.
    let chartDataToRender = Array.isArray(kpis.chartData) ? kpis.chartData : [];
    if (displayedProfit != null && chartDataToRender.length === 1) {
        chartDataToRender = [{ ...chartDataToRender[0], profit: displayedProfit }];
    }

    renderProfitChart(chartDataToRender, displayedProfit);
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
            // Defer to next frame so the browser calculates layout after removing hidden
            requestAnimationFrame(() => {
                renderProfitChart(pendingChartData, pendingChartTotalProfit);
                pendingChartData = null;
                pendingChartTotalProfit = 0;
            });
        }
    });
}

// --- CHART LOGIC ---
let profitChartInstance = null;
const CHART_DATE_TZ = 'America/Caracas';

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

function formatChartAxisDate(value) {
    const date = parseChartDateKey(value);
    return date.toLocaleDateString('es-ES', {
        timeZone: CHART_DATE_TZ,
        day: 'numeric',
        month: 'short',
    });
}

function formatChartTooltipDate(value) {
    const date = parseChartDateKey(value);
    return date.toLocaleDateString('es-ES', {
        timeZone: CHART_DATE_TZ,
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
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
        profitChartInstance = null;
    }

    const wrapper = ctx.parentElement;

    if (!chartData || chartData.length === 0) {
        if (wrapper) {
            let noDataMsg = wrapper.querySelector('.chart-no-data-msg');
            if (!noDataMsg) {
                noDataMsg = document.createElement('div');
                noDataMsg.className = 'chart-no-data-msg absolute inset-0 flex h-full w-full items-center justify-center text-white/40 text-sm';
                noDataMsg.textContent = 'No hay datos históricos para el rango seleccionado.';
                wrapper.appendChild(noDataMsg);
            }
        }
        return;
    }

    if (wrapper) {
        const noDataMsg = wrapper.querySelector('.chart-no-data-msg');
        if (noDataMsg) noDataMsg.remove();
    }

    // The backend now provides real daily profit/fee/capital/cycle values for
    // the selected range. Do not redistribute the total KPI across days here.
    const sortedData = [...chartData].sort((a, b) => (
        parseChartDateKey(a.date) - parseChartDateKey(b.date)
    ));

    const labels = sortedData.map(d => formatChartAxisDate(d.date));

    const profitData = sortedData.map(d => d.profit);
    const feesData = sortedData.map(d => d.fees);
    const capitalData = sortedData.map(d => d.capital);
    // A null cycle count means the Caracas day has not closed yet. Keep the
    // gap rather than making the yellow line plunge to a misleading zero.
    const cyclesData = sortedData.map(d => (
        d.cycles == null ? null : Number(d.cycles)
    ));
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
                        title: function (items) {
                            const index = items?.[0]?.dataIndex;
                            if (typeof index !== 'number' || !sortedData[index]) {
                                return '';
                            }
                            return formatChartTooltipDate(sortedData[index].date);
                        },
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
