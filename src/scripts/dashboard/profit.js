import { fUSDT, inject } from './utils.js';

export function updateProfitUI(kpis = {}) {
    // 1. Datos Teóricos (Suma de canales)
    const wallets = kpis.wallets || {};
    const red = wallets.red?.balanceRed || 0;
    const switchVal = wallets.switch?.balanceSwitch || 0;
    const p2p = wallets.balanceP2P || 0;
    const pay = wallets.pay?.balancePay || 0;
    const theoreticalTotal = red + switchVal + p2p + pay;

    // 2. Datos Reales (Llamada Mock de API Binance)
    const realBinance = kpis.binanceApiBalance || theoreticalTotal - 12.50; // Ejemplo: Faltan 12.50
    const gap = realBinance - theoreticalTotal;

    // 3. Inyectar Balances Principales
    inject('theoretical-balance', fUSDT(theoreticalTotal));
    inject('real-binance-balance', fUSDT(realBinance));
    inject('channel-red', fUSDT(red));
    inject('channel-switch', fUSDT(switchVal));
    inject('channel-p2p', fUSDT(p2p));
    inject('channel-pay', fUSDT(pay));

    // 4. Lógica del GAP (Diferencia) - Mantenemos lógica existente o usamos metrics.totalProfit si fuera el caso
    const gapEl = document.getElementById('balance-gap-value');
    const gapStatus = document.getElementById('balance-gap-status');
    const gapContainer = document.getElementById('balance-gap-container');

    if (gapEl && gapStatus && gapContainer) {
        gapEl.textContent = fUSDT(gap);

        if (Math.abs(gap) < 0.01) {
            gapEl.className = "text-xl font-mono font-bold text-center text-emerald-400";
            gapStatus.textContent = "Balance Cuadrado ✓";
            gapStatus.className = "text-[7px] text-center mt-2 text-emerald-500 font-black";
            gapContainer.className = "bg-emerald-500/5 p-4 rounded-lg border border-emerald-500/20";
        } else {
            gapEl.className = "text-xl font-mono font-bold text-center text-rose-400";
            gapStatus.textContent = `Fuga / Error Detectado: ${fUSDT(gap)}`;
            gapStatus.className = "text-[7px] text-center mt-2 text-rose-500 font-black italic";
            gapContainer.className = "bg-rose-500/5 p-4 rounded-lg border border-rose-500/20";
        }
    }

    // 5. Profit por Banco (Histórico/Acumulado)
    const banks = kpis.bankInsights || [];

    // Colores para bancos
    const bankColors = {
        'Banesco': '#00aa44',
        'Mercantil': '#1d4ed8',
        'Provincial': '#004481',
        'Bancamiga': '#00b386',
        'PagoMovil': '#facc15',
        'BANK': '#6b7280'
    };

    const profitList = document.getElementById('profit-banks-list');
    if (profitList) {
        profitList.innerHTML = banks.map(bank => {
            const name = bank.bank || bank.name || 'Desconocido';
            const color = bankColors[name] || '#F3BA2F';
            const profitVal = bank.profit || 0;

            return `
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <span class="w-1 h-3 rounded-full" style="background-color: ${color}"></span>
                    <span class="text-[10px] font-black text-gray-300 uppercase">${name}</span>
                </div>
                <span class="text-[11px] font-mono font-bold ${profitVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${profitVal >= 0 ? '+' : ''}${fUSDT(profitVal)}</span>
            </div>
            `;
        }).join('');
    }
}