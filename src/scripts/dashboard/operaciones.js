// src/scripts/dashboard/operaciones.js

export function updateOperacionesUI(transactions = []) {
    const getEl = (id) => document.getElementById(id);

    // 1. Totales Generales
    if (getEl('ops-total-count')) getEl('ops-total-count').textContent = transactions.length;

    // Helper para contar
    const count = (cat, type) => transactions.filter(t => 
        t.category === cat && String(t.type).toUpperCase() === type
    ).length;

    // 2. P2P: Ventas / Compras
    const p2pSales = count('P2P', 'VENTA') + count('P2P', 'SELL');
    const p2pBuys = count('P2P', 'COMPRA') + count('P2P', 'BUY');
    if (getEl('ops-p2p-counts')) getEl('ops-p2p-counts').textContent = `${p2pSales}/${p2pBuys}`;

    // 3. PAY: Depósitos / Retiros
    const payIn = count('PAY', 'DEPOSITO') + count('PAY', 'IN');
    const payOut = count('PAY', 'RETIRO') + count('PAY', 'OUT');
    if (getEl('ops-pay-counts')) getEl('ops-pay-counts').textContent = `${payIn}/${payOut}`;

    // 4. RED: Depósitos / Retiros
    const redIn = count('RED', 'DEPOSITO') + count('RED', 'IN');
    const redOut = count('RED', 'RETIRO') + count('RED', 'OUT');
    if (getEl('ops-red-counts')) getEl('ops-red-counts').textContent = `${redIn}/${redOut}`;

    // 5. SWITCH: Spot->Fondos (S2F) / Fondos->Spot (F2S)
    const s2f = count('SWITCH', 'S2F');
    const f2s = count('SWITCH', 'F2S');
    if (getEl('ops-switch-counts')) getEl('ops-switch-counts').textContent = `${s2f}/${f2s}`;
}