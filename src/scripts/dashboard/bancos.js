// src/scripts/dashboard/bancos.js
import { fUSDT, fVES } from './utils.js';

export function updateBancosUI(insights = []) {
    if (!insights) return;

    insights.forEach(b => {
        // Normalización del ID para coincidir con el .astro
        const id = b.bank.toLowerCase().split(' ')[0].replace(/\s+/g, '');

        const ui = {
            fiat: document.getElementById(`bank-fiat-${id}`),
            usdt: document.getElementById(`bank-usdt-${id}`),
            buy: document.getElementById(`bank-buy-${id}`),
            sell: document.getElementById(`bank-sell-${id}`),
            volBuy: document.getElementById(`bank-vol-buy-${id}`),
            volSell: document.getElementById(`bank-vol-sell-${id}`),
            feeBuy: document.getElementById(`bank-fee-buy-${id}`),
            feeSell: document.getElementById(`bank-fee-sell-${id}`),
            profit: document.getElementById(`bank-profit-${id}`),
            margin: document.getElementById(`bank-margin-${id}`),
            // Elementos de la nueva barra triple
            barRecompra: document.getElementById(`bank-bar-recompra-${id}`),
            barComprado: document.getElementById(`bank-bar-comprado-${id}`),
            barProfit: document.getElementById(`bank-bar-profit-${id}`),
            cycleText: document.getElementById(`bank-cycle-text-${id}`)
        };

        // 1. Datos Básicos
        if (ui.fiat) ui.fiat.textContent = fVES(b.fiatBalance);
        if (ui.usdt) ui.usdt.textContent = fUSDT(b.usdtBalance || 0);
        if (ui.buy) ui.buy.textContent = b.buyRate || '0.00';
        if (ui.sell) ui.sell.textContent = b.sellRate || '0.00';

        // CORRECCIÓN: Usamos los campos explícitos de Fiat y Fees del backend
        if (ui.volBuy) ui.volBuy.textContent = fVES(b.buyFiat || 0); // Ahora es VES
        if (ui.volSell) ui.volSell.textContent = fVES(b.sellFiat || 0); // Ahora es VES
        if (ui.feeBuy) ui.feeBuy.textContent = fVES(b.feeBuy || 0); // Fees suelen ser en VES/USDT dependiendo, asumimos VES si es operación bancaria, pero el JSON dice "feeBuy": 3.40 (parece poco para VES). 
        // REVISANDO EL JSON:
        // "feeBuy": 46.05 (Mercantil), "buyFiat": 14645086... 
        // Si feeBuy fuera VES sería nada. Probablemente es USDT o una escala diferente? 
        // El usuario dijo: "feeBuy: (String/Number) Total de comisiones pagadas en compras."
        // En los datos de ejemplo: "transactions": { "fee": 0.19 } (USDT). 
        // Si es P2P en binance, el fee es en el asset (USDT).
        // Si es comision bancaria, es en VES.
        // El JSON muestra "feeBuy": 3.49 -> parece USDT.
        // Voy a usar fUSDT para fees por seguridad si son montos bajos, o fVES si son montos altos. 
        // 3.49 USDT suena logico. 3.49 VES es nada. Usaré fUSDT.

        if (ui.feeBuy) ui.feeBuy.textContent = fUSDT(b.feeBuy || 0);
        if (ui.feeSell) ui.feeSell.textContent = fUSDT(b.feeSell || 0);

        if (ui.profit) ui.profit.textContent = `${fUSDT(b.profit)} ≈ Profit`;

        // 2. Lógica de la Barra de Ciclo (Tricolor)
        if (ui.barRecompra && ui.barComprado && ui.barProfit) {
            // Calculamos el valor del FIAT en términos de USDT para poder sumar peras con peras
            const fiatInUsdt = b.sellRate > 0 ? (b.fiatBalance / b.sellRate) : 0;
            const usdtActual = b.usdtBalance || 0;
            const profitActual = b.profit || 0;

            // El "Capital Total en el Banco" es lo que falta comprar + lo comprado + la ganancia
            const totalCycle = fiatInUsdt + usdtActual + profitActual;

            if (totalCycle > 0) {
                const pRecompra = Math.max(0, (fiatInUsdt / totalCycle) * 100);
                const pComprado = Math.max(0, (usdtActual / totalCycle) * 100);
                const pProfit = Math.max(0, (profitActual / totalCycle) * 100);

                ui.barRecompra.style.width = `${pRecompra}%`;
                ui.barComprado.style.width = `${pComprado}%`;
                ui.barProfit.style.width = `${pProfit}%`;

                if (ui.cycleText) {
                    ui.cycleText.textContent = `${Math.round(pComprado)}% Comprado`;
                }
            }
        }

        // 3. Margen y Colores
        if (ui.margin) {
            ui.margin.textContent = `${b.margin || 0}%`;
            const container = ui.margin.parentElement;
            if (b.margin >= 0) {
                container.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400';
            } else {
                container.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400';
            }
        }
    });
}