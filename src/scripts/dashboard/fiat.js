// src/scripts/dashboard/fiat.js
import { fVES, inject } from './utils.js';

/**
 * Actualiza la sección de Balance FIAT con los datos provenientes de la API.
 * @param {Object} kpis - El objeto de datos global de la API.
 */
export function updateFiatSection(kpis = {}) {
    const wallets = kpis.wallets || {};
    const ops = kpis.operations || {};

    // 1. Balance FIAT
    // Nota: El ID 'fiat-amount' está en el H3, así que 'inject' podría fallar si busca dentro.
    // Lo actualizamos directamente para mayor seguridad.
    const fiatBalance = wallets.balanceFiat ?? wallets.fiatBalance ?? 0;
    const amountEl = document.getElementById('fiat-amount');
    if (amountEl) {
        amountEl.textContent = fVES(fiatBalance);
        // Opcional: Si queremos mantener el estilo del span grande/pequeño, tendríamos que reconstruir el HTML
        // Pero fVES ya agrega "VES", así que mostrar solo texto es correcto.
    }

    // 2. Datos de Operaciones (Totales)
    // Usamos ?. para evitar crash si ops.buys no existe
    const buysCount = ops.buys?.count || 0;
    const sellsCount = ops.sells?.count || 0;
    const totalOps = buysCount + sellsCount;

    // 3. Volúmenes (Compras = Ingresos de Fiat a la plataforma?, Ventas = Salidas?)
    // Depende de la perspectiva. 
    // "Comprado (FIAT)" en bancos.js usaba buyFiat. 
    // "Compras (Cant)" aquí en fiat.astro probablemente se refiere a Buys.
    // Ops tipo BUY -> Gastamos Fiat, Recibimos USDT. -> Egresos de Fiat ???
    // Ops tipo SELL -> Vendemos USDT, Recibimos Fiat. -> Ingresos de Fiat ???

    // REVISAR LOGICA DE IMPORTACION PREVIA:
    // const depoCount = summary.fiatDepoCount ?? 0; 
    // Depo = Deposito = Ingreso.
    // Si yo vendo USDT, me depositan Fiat. -> Sell = Income de Fiat.
    // Si yo compro USDT, transfiero Fiat. -> Buy = Expense de Fiat.

    // Sin embargo, en dashboard/bancos.astro:
    // "Comprado (FIAT)" -> buyFiat.
    // "Vendido (FIAT)" -> sellFiat.

    // Vamos a mapear literalmente:
    // "Compras" -> Buys
    // "Ventas" -> Sells

    const buysFiat = ops.buys?.totalFiat || 0;
    const sellsFiat = ops.sells?.totalFiat || 0;

    // Injection
    // Usamos inject todavía para estos porque en fiat.astro parecen ser spans simples con ID?
    // fiat.astro: <span id="fiat-total-ops"...>N/A</span>. Direct IDs.
    // Si inject busca hijos, fallará si el ID es el elemento final.
    // Mejor usamos getElementById directo para todo en este archivo.

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    set('fiat-total-ops', totalOps.toString());

    // Compras (Cant y Vol)
    set('fiat-depo-count', buysCount.toString());
    set('fiat-depo-vol', fVES(buysFiat));

    // Ventas (Cant y Vol)
    set('fiat-withdrawal-count', sellsCount.toString());
    set('fiat-withdrawal-vol', fVES(sellsFiat));

    // 4. Link Sheet
    const sheetLink = document.getElementById('link-fiat-sheet');
    if (sheetLink && kpis.config?.fiatSheetUrl) {
        sheetLink.href = kpis.config.fiatSheetUrl;
    }
}