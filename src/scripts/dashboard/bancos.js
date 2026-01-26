import { fUSDT, fVES } from './utils.js';

const safeFloat = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    return Number(val.toString().replace(',', '.')) || 0;
};

export function updateBancosUI(insights = []) {
    if (!insights) return;

    const getBankId = (name) => {
        const lower = name.toLowerCase().trim();
        if (lower.includes('pago') || lower.includes('movil')) return 'pagomovil';
        if (lower === 'bbvabank') return 'bbvabank'; // Specific match
        if (lower.includes('bbva') || lower.includes('provincial')) return 'provincial';
        if (lower.includes('bnc')) return 'bnc';
        if (lower.includes('banesco')) return 'banesco';
        if (lower.includes('mercantil')) return 'mercantil';
        if (lower.includes('bancamiga')) return 'bancamiga';
        if (lower.includes('fintech') || lower === 'bank') return 'bank';
        return lower.split(' ')[0].replace(/\s+/g, ''); // Fallback default
    };

    // Extraemos el objeto global de Pago Móvil para replicarlo en todos los bancos
    const globalBankPM = insights.find(b => getBankId(b.bank) === 'pagomovil') || {};
    // Usamos el subcentro .pm si existe (estructura nueva), si no, usamos el objeto entero (fallback)
    const globalPM = (globalBankPM.pm && Object.keys(globalBankPM.pm).length > 0) ? globalBankPM.pm : globalBankPM;

    insights.forEach(b => {
        // Normalización ROBUSTA del ID para coincidir con bancos.astro
        const id = getBankId(b.bank);

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
            ctot: document.getElementById(`bank-ctot-${id}`),
            // Elementos de la nueva barra triple
            barRecompra: document.getElementById(`bank-bar-recompra-${id}`),
            barComprado: document.getElementById(`bank-bar-comprado-${id}`),
            barProfit: document.getElementById(`bank-bar-profit-${id}`),
            cycleText: document.getElementById(`bank-cycle-text-${id}`),
            // Nuevos elementos para el contrato v2
            trOps: document.getElementById(`bank-tr-ops-${id}`),
            pmOps: document.getElementById(`bank-pm-ops-${id}`),
            sellPM: document.getElementById(`bank-sell-pm-${id}`),
            volSellPM: document.getElementById(`bank-vol-sell-pm-${id}`),
            feeSellPM: document.getElementById(`bank-fee-sell-pm-${id}`),
            buyPM: document.getElementById(`bank-buy-pm-${id}`),
            volBuyPM: document.getElementById(`bank-vol-buy-pm-${id}`),
            feeBuyPM: document.getElementById(`bank-fee-buy-pm-${id}`),
            buyingPower: document.getElementById(`bank-buying-power-${id}`),
            opsCount: document.getElementById(`bank-ops-count-${id}`),
            // Missing BreakEven selectors
            breakeven: document.getElementById(`bank-breakeven-${id}`),
            ideal: document.getElementById(`bank-ideal-${id}`),
            beInfo: document.getElementById(`bank-be-info-${id}`)
        };

        // --- DEFINICIÓN DE VARIABLES (Robustez Máxima) ---
        // Buscamos datos en todas las ubicaciones posibles (Legacy vs V2)

        // 1. Datos Básicos (Balances)
        const fiatBal = b.fiatBalance ?? b.currentCycleFiatRemaining ?? 0;
        const usdtBal = b.usdtBalance ?? b.currentCycleRecoveredUSDT ?? 0;
        const bankProfit = b.profit ?? b.currentCycleProfitUSDT ?? 0;

        // 2. Contadores de Operaciones
        const countBuy = Number(b.countBuy ?? b.buyCount ?? b.opsBuy ?? 0);
        const countSell = Number(b.countSell ?? b.sellCount ?? b.opsSell ?? 0);

        // 3. Datos Pago Móvil
        // ESTRATEGIA: "Pago Móvil" se reporta como una entidad separada en el backend.
        // Para bancos individuales (Banesco, Mercantil), el objeto .pm viene vacío o en 0.
        // Por lo tanto, usamos el objeto GLOBAL 'Pago Movil' (globalPM) para rellenar esos datos en todas las tarjetas,
        // SALVO que el banco traiga explícitamente datos propios de PM (futuro).

        const hasLocalPM = b.pm && (Number(b.pm.sellVol || 0) > 0 || Number(b.pm.buyVol || 0) > 0);
        const rawPM = hasLocalPM ? b.pm : globalPM;

        const pm = {
            // API V2 Spec: sellCount, buyCount
            sellCount: Number(rawPM.sellCount ?? 0),
            buyCount: Number(rawPM.buyCount ?? 0),

            // API V2 Spec: sellVol, buyVol (en VES)
            sellVol: Number(rawPM.sellVol ?? 0),
            buyVol: Number(rawPM.buyVol ?? 0),

            // API V2 Spec: sellFee, buyFee
            sellFee: Number(rawPM.sellFee ?? 0),
            buyFee: Number(rawPM.buyFee ?? 0)
        };

        // --- BINDING DE ELEMENTOS UI ---

        // A. Balances
        if (ui.fiat) ui.fiat.textContent = fVES(fiatBal);
        if (ui.usdt) ui.usdt.textContent = fUSDT(usdtBal);
        if (ui.profit) ui.profit.textContent = `${fUSDT(bankProfit)} ≈ Profit`;

        // 1. Header TRF Count (Total Transferencias)
        if (ui.trOps) {
            ui.trOps.textContent = `${b.trf.buyCount + b.trf.sellCount} OPS`;
        }

        // Vueltas P2P (Legacy vs V2)
        if (ui.ctot) {
            const cycles = b.completedCycles ?? b.cycles ?? 0;
            ui.ctot.textContent = cycles.toString();
        }

        // 2. Sección Pago Móvil (PM)
        if (ui.pmOps) ui.pmOps.textContent = `${pm.buyCount + pm.sellCount} OPS`;

        // PM Ventas
        if (ui.sellPM) ui.sellPM.textContent = pm.sellCount.toString();
        if (ui.volSellPM) ui.volSellPM.textContent = fVES(pm.sellVol);
        if (ui.feeSellPM) ui.feeSellPM.textContent = pm.sellFee.toFixed(2);

        // PM Compras
        if (ui.buyPM) ui.buyPM.textContent = pm.buyCount.toString();
        if (ui.volBuyPM) ui.volBuyPM.textContent = fVES(pm.buyVol);
        if (ui.feeBuyPM) ui.feeBuyPM.textContent = pm.buyFee.toFixed(2);


        // 3. Footer & Buying Power
        if (ui.buyingPower) {
            const rate = b.buyRate || b.sellRate || 1;
            const power = rate > 0 ? (fiatBal / rate) : 0;
            ui.buyingPower.textContent = `≈ ${fUSDT(power)}`;
        }

        if (ui.opsCount) {
            const totalOps = b.trf.buyCount + b.trf.sellCount + pm.buyCount + pm.sellCount;
            ui.opsCount.textContent = `${totalOps} / 1k`;
        }

        // --- MAPEO BLOQUE TRF (Transferencias) ---
        if (ui.buy) ui.buy.textContent = safeFloat(b.trf.buyRate).toFixed(2);
        if (ui.sell) ui.sell.textContent = safeFloat(b.trf.sellRate).toFixed(2);

        if (ui.volBuy) ui.volBuy.textContent = fVES(b.trf.buyVol || 0);
        if (ui.volSell) ui.volSell.textContent = fVES(b.trf.sellVol || 0);

        if (ui.feeBuy) ui.feeBuy.textContent = fUSDT(b.trf.buyFee || 0);
        if (ui.feeSell) ui.feeSell.textContent = fUSDT(b.trf.sellFee || 0);




        // --- 4. TECHO y IDEAL (Breakeven) ---
        // Buscamos rate de breakeven (legacy o v2), con fallbacks progresivos
        // Usamos safeFloat porque los rates pueden venir como strings "123,45"
        const beRate = safeFloat(b.breakEvenRate) || safeFloat(b.weightedBreakEvenRate) || safeFloat(b.avgBuyRate) || safeFloat(b.buyRate) || safeFloat(b.sellRate) || 0;

        if (ui.breakeven) {
            ui.breakeven.textContent = beRate > 0 ? beRate.toFixed(2) : '0.00';
        }

        // Calculamos ideal como BE - 0.5% extra (aprox) o usamos idealRate si existe
        // Si usamos fallback de buyRate/sellRate, agregamos un margen dummy (ej. 1%) para que no sea igual al BE
        const idealRate = safeFloat(b.idealRate) || (beRate > 0 ? (beRate * 0.995) : 0);

        if (ui.ideal) {
            ui.ideal.textContent = idealRate > 0 ? idealRate.toFixed(2) : '0.00';
        }

        // Status Pill (Esperando... / Gap)
        if (ui.beInfo) {
            if (!beRate) {
                ui.beInfo.textContent = "Esperando...";
                ui.beInfo.className = "text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-gray-500 font-bold uppercase tracking-tighter";
            } else {
                const currentBuy = safeFloat(b.buyRate);
                // Diferencia porcentual entre el BE y la tasa de compra actual
                const diff = currentBuy > 0 ? ((beRate - currentBuy) / currentBuy) * 100 : 0;

                ui.beInfo.textContent = `Gap: ${diff.toFixed(2)}%`;
                // Color coding: Verde si hay espacio (Gap >= 0), Rojo si estamos por encima (Gap < 0)
                ui.beInfo.className = `text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${diff >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`;
            }
        }


        // 2. Lógica de la Barra de Ciclo (Tricolor)
        if (ui.barRecompra && ui.barComprado && ui.barProfit) {
            let pRecompra = 0;
            let pComprado = 0;
            let pProfit = 0;
            let pctComprado = 0;

            // CASO A: Datos nuevos (bankBreakdown)
            if (b.currentCycleTotalFiat !== undefined) {
                // Usamos weightedBreakEvenRate para convertir el remanente FIAT a USDT y tener escala común
                // Si no hay tasa, fallback a 1 (no ideal pero evita NaN)
                const rate = b.weightedBreakEvenRate || b.sellRate || 1;

                const fiatRemainingUSD = (b.currentCycleFiatRemaining || 0) / rate;
                const recoveredUSD = b.currentCycleRecoveredUSDT || 0;
                const profitUSD = b.currentCycleProfitUSDT || 0;

                const totalCycleUSD = fiatRemainingUSD + recoveredUSD + profitUSD;

                if (totalCycleUSD > 0) {
                    pRecompra = (fiatRemainingUSD / totalCycleUSD) * 100;
                    pComprado = (recoveredUSD / totalCycleUSD) * 100;
                    pProfit = (profitUSD / totalCycleUSD) * 100;
                }

                // El porcentaje de "progreso" o "comprado" puede venir directo
                pctComprado = b.currentCycleProgress || pComprado;

            } else {
                // CASO B: Datos antiguos (Legacy / insights)
                // Usamos el beRate calculado previamente (que ya tiene fallbacks) como tasa de conversión
                // Si todo falla, fallback a 1 para evitar división por cero (aunque el valor sea irreal, muestra algo)
                const conversionRate = beRate > 0 ? beRate : (b.sellRate || b.buyRate || 1);

                const fiatInUsdt = conversionRate > 0 ? (fiatBal / conversionRate) : 0;
                const usdtActual = usdtBal; // Ya tenemos usdtBal safe arriba
                const profitActual = bankProfit; // Ya tenemos bankProfit safe arriba

                const totalCycle = fiatInUsdt + usdtActual + profitActual;

                if (totalCycle > 0) {
                    pRecompra = Math.max(0, (fiatInUsdt / totalCycle) * 100);
                    pComprado = Math.max(0, (usdtActual / totalCycle) * 100);
                    pProfit = Math.max(0, (profitActual / totalCycle) * 100);
                }
                pctComprado = pComprado;
            }

            ui.barRecompra.style.width = `${Math.max(0, pRecompra)}%`;
            ui.barComprado.style.width = `${Math.max(0, pComprado)}%`;
            ui.barProfit.style.width = `${Math.max(0, pProfit)}%`;

            if (ui.cycleText) {
                ui.cycleText.textContent = `${Math.round(pctComprado)}% Comprado`;
            }
        }

        // 3. Margen y Colores
        // 3. Margen y Colores
        if (ui.margin) {
            ui.margin.textContent = `${b.margin || 0}%`;

            // Fix: Aplicar clases al elemento directo, no al contenedor padre
            if (b.margin >= 0) {
                ui.margin.className = 'bg-emerald-500/10 text-emerald-400 px-5 py-2 rounded-full border border-emerald-500/20 text-[13px] font-black shadow-lg';
            } else {
                ui.margin.className = 'bg-rose-500/10 text-rose-400 px-5 py-2 rounded-full border border-rose-500/20 text-[13px] font-black shadow-lg';
            }
        }
    });
}