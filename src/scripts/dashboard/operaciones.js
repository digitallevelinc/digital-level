// src/scripts/dashboard/operaciones.js

export function updateOperacionesUI(kpis = {}) {
    const getEl = (id) => document.getElementById(id);
    const ops = kpis.operations || {};
    const wallets = kpis.wallets || {};

    // 1. Totales Generales (Buys + Sells count)
    const totalOps = (ops.buys?.count || 0) + (ops.sells?.count || 0);
    if (getEl('ops-total-count')) getEl('ops-total-count').textContent = totalOps;

    // 2. P2P: Ventas / Compras (Desde objeto operations)
    const p2pSales = ops.sells?.count || 0;
    const p2pBuys = ops.buys?.count || 0;
    if (getEl('ops-p2p-counts')) getEl('ops-p2p-counts').textContent = `${p2pSales}/${p2pBuys}`;

    // 3. PAY: Depósitos (Received) / Retiros (Sent) (Desde wallets.pay)
    const payIn = wallets.pay?.payReceivedCount || 0;
    const payOut = wallets.pay?.paySentCount || 0;
    if (getEl('ops-pay-counts')) getEl('ops-pay-counts').textContent = `${payIn}/${payOut}`;

    // 4. RED: Entradas (CountIn) / Salidas (CountOut) (Desde wallets.red)
    // Nota: Red suele ser "Caja Roja" o similar. 
    // JSON muestra: "countIn": 46, "countOut": 1
    const redIn = wallets.red?.countIn || 0;
    const redOut = wallets.red?.countOut || 0;
    if (getEl('ops-red-counts')) getEl('ops-red-counts').textContent = `${redIn}/${redOut}`;

    // 5. SWITCH: Spot->Fondos (TotalIn?) / Fondos->Spot (TotalOut?)
    // JSON muestra: "countIn": 17, "countOut": 5. 
    // Asumiremos In/Out mapping directo.
    const s2f = wallets.switch?.countIn || 0;
    const f2s = wallets.switch?.countOut || 0;
    if (getEl('ops-switch-counts')) getEl('ops-switch-counts').textContent = `${s2f}/${f2s}`;
}