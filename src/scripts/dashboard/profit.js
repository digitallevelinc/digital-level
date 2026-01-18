import { fUSDT, inject } from './utils.js';

export function updateProfitUI(kpis = {}, bankInsights = []) {
    const audit = kpis.audit || {};
    const wallets = kpis.wallets || {};
    
    // 1. CAPITAL INICIAL DINÁMICO (Desde la API)
    const CAPITAL_INICIAL = kpis.initialCapital || kpis.config?.initialCapital || 5400; 

    // 2. PROFIT REAL ACUMULADO (Suma de los éxitos en los bancos)
    // Este número SOLO sube a menos que haya una pérdida registrada en un ciclo.
    const totalProfitCalculated = bankInsights.reduce((acc, bank) => acc + (bank.profit || 0), 0);

    // 3. DATOS DE OPERACIÓN (Lo que hay físicamente)
    const red = wallets.red?.balanceRed || 0;
    const switchVal = wallets.switch?.balanceSwitch || 0;
    const p2p = wallets.balanceP2P || 0;
    const pay = wallets.pay?.balancePay || 0;
    const totalCripto = red + switchVal + p2p + pay; // Este es el balance actual de la Wallet

    // 4. BALANCE TEÓRICO (Lo que DEBERÍAS tener: Inversión + Ganancia generada)
    const theoreticalTotal = CAPITAL_INICIAL + totalProfitCalculated;

    // 5. DISCREPANCIA (GAP)
    // Comparamos lo que hay en Binance (Wallet) contra el Teórico.
    // Si da negativo, es exactamente el dinero que está "en la calle" (Bancos/Ordenes).
    const realBinance = parseFloat(audit.realBalance || 0);
    const gap = realBinance - theoreticalTotal;

    // --- INYECCIONES EN UI ---

    // A. BALANCE TEÓRICO: Inversión + Profit Acumulado
    inject('theoretical-balance', fUSDT(theoreticalTotal));

    // B. BINANCE WALLET: Lo que hay realmente en la API
    inject('real-binance-balance', fUSDT(realBinance));

    // C. DISCREPANCIA: El dinero que falta por retornar
    inject('balance-gap-value', fUSDT(gap));

    // D. PROFIT ACTUAL TOTAL (Tarjeta Azul): Tu ganancia neta generada
    // Aquí es donde estaba el error. Ahora inyectamos totalProfitCalculated.
    inject('audit-total-profit-display', fUSDT(totalProfitCalculated)); 

    // E. CRECIMIENTO %
    const roiPercent = CAPITAL_INICIAL > 0 ? (totalProfitCalculated / CAPITAL_INICIAL) * 100 : 0;
    inject('audit-growth-percent', `${roiPercent >= 0 ? '+' : ''}${roiPercent.toFixed(2)}%`);

    // Inyectar balances de canales (tus wallets individuales)
    inject('channel-red', fUSDT(red));
    inject('channel-switch', fUSDT(switchVal));
    inject('channel-p2p', fUSDT(p2p));
    inject('channel-pay', fUSDT(pay));

    // Lógica visual del GAP
    const gapStatus = document.getElementById('balance-gap-status');
    const gapContainer = document.getElementById('balance-gap-container');
    if (gapStatus && gapContainer) {
        if (Math.abs(gap) < 2.0) {
            gapStatus.textContent = "Balance Cuadrado ✓";
            gapContainer.className = "bg-emerald-500/5 p-4 rounded-lg border border-emerald-500/20 flex flex-col justify-center";
        } else {
            gapStatus.textContent = gap < 0 ? "Capital en Circulación (Bancos)" : "Excedente Detectado";
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