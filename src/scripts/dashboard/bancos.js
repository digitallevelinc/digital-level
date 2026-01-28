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
        if (lower.includes('pago') || lower.includes('movil') || lower === 'pm') return 'pagomovil';
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

        // 1. Datos Básicos (Balances) - Source of Truth
        const fiatBal = safeFloat(b.fiatBalance);
        const usdtBal = safeFloat(b.usdtBalance); // Si el back no manda esto, será 0. Validar si usamos el calculated o raw.
        const bankProfit = safeFloat(b.profit);

        // 2. Contadores (Informativo, ya no para cálculo)
        // La API debe mandar buyVolUSDT/sellVolUSDT agregados

        // 3. Datos Pago Móvil
        // Usamos el objeto .pm directo
        const pm = b.pm || { sellCount: 0, buyCount: 0, sellVol: 0, buyVol: 0, sellFee: 0, buyFee: 0 };

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

        // --- MAPEO TASAS (Source of Truth) ---
        // User Request: Tasa Compra = .weightedAvgBuyRate, Tasa Venta = .weightedAvgSellRate
        const buyRate = safeFloat(b.weightedAvgBuyRate);
        const sellRate = safeFloat(b.weightedAvgSellRate);

        // Volumen (USDT de TRF+PM ya sumado en backend o campo BuyVolUSDT)
        // La UI actual pide 'volBuy' (display VES o USDT?). Original era VES TRF.
        // User Request: "Volumen (USDT) .buyVolUSDT / .sellVolUSDT Volúmenes totales agregados (TRF+PM)."
        // Sin embargo, las tarjetas suelen mostrar volúmenes en VES o USDT. Mantendremos VES si la UI lo espera así, o USDT si el usuario prefiere.
        // Dado el contexto "dashboard.js" A. Tarjetas de Bancos: "Volumen (USDT) .buyVolUSDT".
        // Pero la UI actual tiene `fVES(b.trf.buyVol)`. Cambiaremos a mostrar USDT total si el elemento lo permite,
        // o mapearemos el VES Balance Total.
        // Vamos a asumir que los selectores bank-vol-buy-${id} esperan texto formateado.
        // Si el usuario dijo "Volumen (USDT)", entonces mostramos USDT.

        if (ui.buy) ui.buy.textContent = buyRate > 0 ? buyRate.toFixed(2) : '---';
        if (ui.sell) ui.sell.textContent = sellRate > 0 ? sellRate.toFixed(2) : '---';

        // Usamos buyVolUSDT y sellVolUSDT para volúmenes totales (Requerimiento)
        if (ui.volBuy) ui.volBuy.textContent = fUSDT(b.buyVolUSDT || 0);
        if (ui.volSell) ui.volSell.textContent = fUSDT(b.sellVolUSDT || 0);

        // Fees (USDT)
        // Se puede hacer suma simple visual o, si viene en API, usarlo.
        const totalFeeBuy = (b.trf?.buyFee || 0) + (b.pm?.buyFee || 0);
        const totalFeeSell = (b.trf?.sellFee || 0) + (b.pm?.sellFee || 0);

        if (ui.feeBuy) ui.feeBuy.textContent = fUSDT(totalFeeBuy);
        if (ui.feeSell) ui.feeSell.textContent = fUSDT(totalFeeSell);




        // --- 4. TECHO y IDEAL (Breakeven & Ceiling) ---
        // Request: "Consumir directamente la Fuente de Verdad"

        // Techo: ceiling rate calculate by backend?
        // El usuario mencionó: "Tasa Venta .weightedAvgSellRate (BreakEven)" en una sección,
        // pero luego en "Calculadora" menciona POST /ceiling.
        // En Dashboard Bancos, solemos mostrar el "BreakEven" como referencia.

        // Si la API trae 'ceilingRate' o 'breakEvenRate', lo usamos.
        const techo = safeFloat(b.ceilingRate || b.breakEvenRate || 0);
        // Ideal: suele ser un spread sobre el techo
        const ideal = safeFloat(b.idealRate || 0);

        // Eliminamos overrides manuales (Mercantil etc) porque el backend ya debe manejarlo.
        // Si el backend envía data limpia, confiamos.

        if (ui.breakeven) {
            ui.breakeven.textContent = techo > 0 ? techo.toFixed(2) : '0.00';
        }

        if (ui.ideal) {
            ui.ideal.textContent = ideal > 0 ? ideal.toFixed(2) : '0.00';
        }

        // Status Pill (Esperando... / Gap)
        if (ui.beInfo) {
            if (!techo) {
                ui.beInfo.textContent = "Esperando...";
                ui.beInfo.className = "text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-gray-500 font-bold uppercase tracking-tighter";
            } else {
                const currentBuy = safeFloat(b.buyRate);
                // Diferencia porcentual entre el Techo y la tasa de compra actual
                const diff = currentBuy > 0 ? ((techo - currentBuy) / currentBuy) * 100 : 0;

                ui.beInfo.textContent = `Gap: ${diff.toFixed(2)}%`;
                // Color coding: Verde si hay espacio (Gap >= 0), Rojo si estamos por encima (Gap < 0)
                ui.beInfo.className = `text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${diff >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`;

                // Tooltip explicativo
                ui.beInfo.title = `GAP: Diferencia entre Techo y tu Compra.\n(+) Tienes espacio para subir.\n(-) Estás comprando por ENCIMA del Techo.`;
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
                // Usamos el techo (antes beRate) calculado previamente como tasa de conversión
                // Si todo falla, fallback a 1 para evitar división por cero
                const conversionRate = techo > 0 ? techo : (b.sellRate || b.buyRate || 1);

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
            const marginVal = safeFloat(b.margin);
            ui.margin.textContent = `${marginVal.toFixed(2)}%`;

            // Fix: Aplicar clases al elemento directo, no al contenedor padre
            if (marginVal >= 0) {
                ui.margin.className = 'bg-emerald-500/10 text-emerald-400 px-5 py-2 rounded-full border border-emerald-500/20 text-[13px] font-black shadow-lg';
            } else {
                ui.margin.className = 'bg-rose-500/10 text-rose-400 px-5 py-2 rounded-full border border-rose-500/20 text-[13px] font-black shadow-lg';
            }
        }
    });

    // 4. REORDENAMIENTO VISUAL (NUEVO: Favoritos > Volumen)
    sortBankCards(insights, getBankId);
}

/**
 * Reordena las tarjetas en el DOM:
 * 1. Favoritos (Star = true)
 * 2. Volumen/Indice original (No favoritos)
 */
function sortBankCards(insights, getBankIdFn) {
    const grid = document.getElementById('banks-grid');
    if (!grid) return;

    // Convertimos NodeList a Array para poder ordenar
    const cards = Array.from(grid.children);

    cards.sort((a, b) => {
        // Obtenemos los data-bank-id del DOM (coincide con nuestros IDs normalizados)
        const idA = a.getAttribute('data-bank-id');
        const idB = b.getAttribute('data-bank-id');
        const idxA = Number(a.getAttribute('data-original-index') || 999);
        const idxB = Number(b.getAttribute('data-original-index') || 999);

        // Buscamos los datos correspondientes en insights para ver si son favoritos
        // Nota: insights tiene la propiedad bankName original, necesitamos matchear con el ID normalizado
        const dataA = insights.find(i => getBankIdFn(i.bank) === idA);
        const dataB = insights.find(i => getBankIdFn(i.bank) === idB);

        // Helper to handle boolean or string "true"
        const isTrue = (val) => val === true || val === 'true';

        const isFavA = isTrue(dataA?.isFavorite);
        const isFavB = isTrue(dataB?.isFavorite);

        // Regla 1: Favoritos primero
        if (isFavA && !isFavB) return -1;
        if (!isFavA && isFavB) return 1;

        // Regla 2: Fallback al orden original (esto respeta el orden estático de bancos.astro o volumen si viniera así)
        return idxA - idxB;
    });

    // Re-append en el nuevo orden (mueve los elementos existentes)
    cards.forEach(card => grid.appendChild(card));

    // Update Star UI
    insights.forEach(b => {
        const id = getBankIdFn(b.bank);
        const starBtn = document.getElementById(`fav-${id}`);
        if (starBtn) {
            const isFav = b.isFavorite === true || b.isFavorite === 'true';
            // Toggle classes
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