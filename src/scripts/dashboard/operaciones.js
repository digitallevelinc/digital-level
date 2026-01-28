// src/scripts/dashboard/operaciones.js

/**
 * Procesa y actualiza la sección de Volumen de Operaciones
 * @param {Object} kpis - Objeto principal de la API
 */
export function updateOperacionesUI(kpis = {}) {
    // Helper para evitar errores si el elemento no existe en el DOM
    const inject = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    // Extraemos los objetos con safe-navigation para evitar crashes
    const ops = kpis.operations || {};
    const wallets = kpis.wallets || {};

    // 1. TOTAL GENERAL (Suma de todas las ventas y compras registradas)
    // El servidor ya proporciona totalOperations para mayor precisión.
    const totalOps = ops.totalOperations ?? (Number(ops.buys?.count || 0) + Number(ops.sells?.count || 0));
    inject('ops-total-count', totalOps.toLocaleString());

    // 2. P2P: Ventas / Compras 
    // Representa el flujo principal de intercambio
    const p2pSales = ops.sells?.count || 0;
    const p2pBuys = ops.buys?.count || 0;
    inject('ops-p2p-counts', `${p2pSales} / ${p2pBuys}`);

    // 3. PAY: Depósitos (Received) / Retiros (Sent)
    // Datos provenientes de la Wallet Pay interna
    const payIn = wallets.pay?.payReceivedCount || 0;
    const payOut = wallets.pay?.paySentCount || 0;
    inject('ops-pay-counts', `${payIn} / ${payOut}`);

    // 4. RED: Entradas (In) / Salidas (Out)
    // Monitoreo de flujo de la Caja Roja (RED)
    const redIn = wallets.red?.countIn || 0;
    const redOut = wallets.red?.countOut || 0;
    inject('ops-red-counts', `${redIn} / ${redOut}`);

    // 5. SWITCH: Transferencias Internas Spot <-> Fondos
    // Mapeo de movimientos entre billeteras de Binance/Exchange
    const s2f = wallets.switch?.countIn || 0;
    const f2s = wallets.switch?.countOut || 0;
    inject('ops-switch-counts', `${s2f} / ${f2s}`);
}