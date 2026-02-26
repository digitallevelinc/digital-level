import { fUSDT, setSheetLinkState } from './utils.js';

export const updateP2PSection = (kpis) => {
    const container = document.getElementById('wallet-p2p-logic');
    if (!container) return;

    const data = kpis.operations || kpis.metrics?.operations;
    const wallets = kpis.wallets || kpis.metrics?.wallets || {};
    const mainValue = document.getElementById('p2p-balance-total');
    const sheetLink = document.getElementById('link-p2p-sheet');

    // Referencias específicas por ID actualizadas
    const ui = {
        sellCount: document.getElementById('p2p-sell-count'),
        sellVol: document.getElementById('p2p-sell-vol'),
        buyCount: document.getElementById('p2p-buy-count'),
        buyVol: document.getElementById('p2p-buy-vol'),
        totalOps: document.getElementById('p2p-total-ops') // Nuevo ID
    };

    if (data && wallets) {
        // Balance principal (Source of Truth: wallets.balanceP2P)
        if (mainValue) mainValue.textContent = fUSDT(wallets.balanceP2P || 0);

        // --- Ventas (Sells) ---
        const sells = data.sells?.count ?? 0;
        if (ui.sellCount) ui.sellCount.textContent = sells.toString();
        if (ui.sellVol) ui.sellVol.textContent = fUSDT(data.sells?.volume ?? data.sells?.totalUSDT ?? 0);

        // --- Compras (Buys) ---
        const buys = data.buys?.count ?? 0;
        if (ui.buyCount) ui.buyCount.textContent = buys.toString();
        if (ui.buyVol) ui.buyVol.textContent = fUSDT(data.buys?.volume ?? data.buys?.totalUSDT ?? 0);

        // --- Total de Operaciones ---
        if (ui.totalOps) {
            const total = data.totalOperations ?? (sells + buys);
            ui.totalOps.textContent = total.toString();
        }
    }

    if (sheetLink) {
        setSheetLinkState(sheetLink, {
            sheetId: kpis.config?.googleSheetId,
            enabledTitle: "Abrir Google Sheet P2P"
        });
    }
};
