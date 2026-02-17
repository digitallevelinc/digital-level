import { fUSDT, fVES, inject } from './utils.js';
import Chart from 'chart.js/auto';

export function updateProfitUI(kpis = {}, bankInsights = []) {
    const critical = kpis.critical || {};
    const operations = kpis.operations || {};
    const audit = kpis.audit || {};

    // 1. CAPITAL INICIAL (Dato maestro)
    const CAPITAL_INICIAL = parseFloat(critical.capitalInicial || kpis.capitalInicial || 0);
    inject('audit-initial-capital', fUSDT(CAPITAL_INICIAL));
    inject('audit-period-days', audit.periodDays || 0);

    // 2. PROFIT REAL (Desde Backend)
    const totalProfitUSDT = parseFloat(critical.profitTotalUSDT || 0);

    // 3. BALANCE TEÓRICO (Desde Backend)
    // 3. CAPITAL INICIAL (Desde Backend)
    // Antes 'Balance Teórico', ahora representa el Capital Inicial del periodo seleccionado
    const theoreticalTotal = parseFloat(audit.currentBalanceEstimate || critical.balanceTotal || 0);

    // 4. ROI GLOBAL (Desde Backend)
    const roiPercent = parseFloat(critical.globalMarginPercent || 0);

    // --- INYECCIONES EN UI ---

    // A. Balance Teórico
    inject('theoretical-balance', fUSDT(theoreticalTotal));

    // B. Balance Real (debe ser independiente del filtro temporal).
    // Nunca usar critical.balanceTotal aquí porque ese valor representa el capital del periodo.
    const realBinanceSource =
        audit.realBalance ??
        kpis.metrics?.totalBalance ??
        critical.realBalance ??
        0;
    const realBinance = parseFloat(realBinanceSource || 0);
    inject('real-binance-balance', fUSDT(realBinance));

    // C. Discrepancia / GAP (Ahora debería venir del backend, usamos fallback visual si no viene)
    // C. PROFIT GENERADO (Discrepancy)
    // Mapeamos audit.discrepancy como el Profit del periodo.
    const gap = audit.discrepancy !== undefined ? parseFloat(audit.discrepancy) : (realBinance - theoreticalTotal);
    inject('balance-gap-value', fUSDT(gap));

    // D. Profit Total
    inject('audit-total-profit-display', fUSDT(totalProfitUSDT));

    // E. Crecimiento %
    inject('audit-growth-percent', `${roiPercent >= 0 ? '+' : ''}${roiPercent.toFixed(2)}%`);

    // F. Volumen y Fees (Operaciones)
    // F. Volumen y Fees (Operaciones)
    inject('audit-total-volume', fUSDT(parseFloat(operations.totalVolumeUSDT || 0)));
    inject('audit-total-fees', fUSDT(parseFloat(operations.totalFeesPaid || 0)));

    // G. Datos Fiat (Request)
    // Agregamos inyeccion para profitTotalFiat si existe elemento
    if (critical.profitTotalFiat) {
        inject('audit-profit-fiat', fVES(critical.profitTotalFiat), true);
    }

    // Inyectar balances de canales (Visualización)
    const wallets = kpis.wallets || {};
    inject('channel-red', fUSDT(wallets.balanceRed || 0));
    inject('channel-switch', fUSDT(wallets.balanceSwitch || 0));
    inject('channel-p2p', fUSDT(wallets.balanceP2P || 0));
    inject('channel-pay', fUSDT(wallets.balancePay || 0));

    // Lógica visual del GAP (Estado)
    const gapStatus = document.getElementById('balance-gap-status');
    const gapContainer = document.getElementById('balance-gap-container');
    if (gapStatus && gapContainer) {
        if (Math.abs(gap) < 2.0) {
            gapStatus.textContent = "Sin Movimiento (Neutro)";
            gapContainer.className = "bg-emerald-500/5 p-4 rounded-lg border border-emerald-500/20 flex flex-col justify-center";
        } else {
            gapStatus.textContent = gap < 0 ? "Pérdida (Drawdown)" : "Profit Positivo";
            gapContainer.className = "bg-rose-500/5 p-4 rounded-lg border border-rose-500/20 flex flex-col justify-center";
        }
    }

    renderBankProfitList(bankInsights);
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

// --- CHART LOGIC ---
let profitChartInstance = null;

function renderProfitChart(chartData = []) {
    const ctx = document.getElementById('profit-chart');
    if (!ctx) return;

    // Destroy existing chart to prevent canvas reuse errors
    if (profitChartInstance) {
        profitChartInstance.destroy();
    }

    if (!chartData || chartData.length === 0) {
        // Optional: Show "No data" message?
        return;
    }

    // Sort by date just in case
    const sortedData = [...chartData].sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = sortedData.map(d => {
        const date = new Date(d.date);
        // Format: "Mon 12" (short day + date)
        return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
    });

    const profitData = sortedData.map(d => d.profit);
    const feesData = sortedData.map(d => d.fees);
    const capitalData = sortedData.map(d => d.capital);
    const cyclesData = sortedData.map(d => d.cycles); // Optional

    profitChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Profit (USDT)',
                    data: profitData,
                    backgroundColor: '#4ade80', // emerald-400
                    stack: 'Stack 0',
                    order: 2,
                    yAxisID: 'y'
                },
                {
                    label: 'Fees (USDT)',
                    data: feesData,
                    backgroundColor: '#f87171', // red-400
                    stack: 'Stack 0',
                    order: 3,
                    yAxisID: 'y'
                },
                {
                    label: 'Capital',
                    data: capitalData,
                    type: 'line',
                    borderColor: '#60a5fa', // blue-400
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3,
                    order: 0,
                    yAxisID: 'y1'
                },
                // Optional Cycles Line/Points
                {
                    label: 'Ciclos',
                    data: cyclesData,
                    type: 'line',
                    borderColor: '#fbbf24', // amber-400
                    borderDash: [5, 5],
                    pointStyle: 'circle',
                    pointRadius: 3,
                    backgroundColor: '#fbbf24',
                    borderWidth: 1,
                    order: 1,
                    yAxisID: 'y2',
                    hidden: true // Hidden by default to avoid clutter
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
                            if (label) {
                                label += ': ';
                            }
                            if (context.raw !== null) {
                                if (label.includes('Profit') || label.includes('Fees') || label.includes('Capital')) {
                                    label += fUSDT(context.raw);
                                } else {
                                    label += context.raw;
                                }
                            }
                            return label;
                        }
                    }
                },
                legend: {
                    labels: {
                        color: '#9ca3af', // gray-400
                        font: { size: 10 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y: { // Profit & Fees Axis
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#4ade80' }
                },
                y1: { // Capital Axis
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false }, // only want the grid lines for one axis to show up
                    ticks: { color: '#60a5fa' }
                },
                y2: { // Cycles Axis (Hidden or Small)
                    type: 'linear',
                    display: false, // Hide axis labels but keep scaling
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    min: 0,
                    suggestedMax: 10 // Assuming daily cycles are low
                }
            }
        }
    });
}
