import { fUSDT, fVES, inject } from './utils.js';

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
    // El backend envía el 'balanceTotal'
    const theoreticalTotal = parseFloat(critical.balanceTotal || 0);

    // 4. ROI GLOBAL (Desde Backend)
    const roiPercent = parseFloat(critical.globalMarginPercent || 0);

    // --- INYECCIONES EN UI ---

    // A. Balance Teórico
    inject('theoretical-balance', fUSDT(theoreticalTotal));

    // B. Balance Real (Consistencia con valores de auditoría si existen)
    // B. Balance Real (Consistencia con valores de auditoría si existen)
    // Fallback: Si no viene realBalance explícito, usamos balanceTotal (que suele ser el real reportado por API)
    const realBinance = parseFloat(critical.realBalance || audit.realBalance || critical.balanceTotal || 0);
    inject('real-binance-balance', fUSDT(realBinance));

    // C. Discrepancia / GAP (Ahora debería venir del backend, usamos fallback visual si no viene)
    // Si el backend no envía 'balanceGap', asumimos que el cálculo se hace allá y esto es solo display.
    // Mantenemos una resta simple SOLO para display si no viene el campo explícito, para no romper la UI.
    const gap = critical.balanceGap !== undefined ? parseFloat(critical.balanceGap) : (realBinance - theoreticalTotal);
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
            gapStatus.textContent = "Balance Cuadrado ✓";
            gapContainer.className = "bg-emerald-500/5 p-4 rounded-lg border border-emerald-500/20 flex flex-col justify-center";
        } else {
            gapStatus.textContent = gap < 0 ? "Capital en Circulacion" : "Excedente Detectado";
            gapContainer.className = "bg-rose-500/5 p-4 rounded-lg border border-rose-500/20 flex flex-col justify-center";
        }
    }

    renderBankProfitList(bankInsights);
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