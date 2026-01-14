import { fUSDT, buildSheetLink } from './utils.js';

export const updateRedSection = (kpis) => {
    const container = document.getElementById('wallet-red');
    if (!container) return;
    
    const data = kpis.wallets?.red;
    const mainValue = document.getElementById('red-balance-total');
    const sheetLink = document.getElementById('link-red-sheet');

    // Mapeo por IDs específicos
    const ui = {
        sentCount: document.getElementById('red-sent-count'),
        sentVol: document.getElementById('red-sent-vol'),
        receivedCount: document.getElementById('red-received-count'),
        receivedVol: document.getElementById('red-received-vol'),
        totalOps: document.getElementById('red-total-ops')
    };

    if (data && Object.keys(data).length > 0) {
        if (mainValue) mainValue.textContent = fUSDT(data.balanceRed);
        
        // Asignación de datos (Salidas/Enviado arriba)
        if (ui.sentCount) ui.sentCount.textContent = data.countOut ?? "0";
        if (ui.sentVol) ui.sentVol.textContent = fUSDT(data.totalExpense ?? 0);
        
        // Entradas/Recibido abajo
        if (ui.receivedCount) ui.receivedCount.textContent = data.countIn ?? "0";
        if (ui.receivedVol) ui.receivedVol.textContent = fUSDT(data.totalIncome ?? 0);

        // Total
        if (ui.totalOps) ui.totalOps.textContent = data.totalOperations ?? "0";
    }
    
    if (sheetLink) {
        sheetLink.href = buildSheetLink(kpis.config?.googleSheetId);
        sheetLink.style.opacity = kpis.config?.googleSheetId ? "1" : "0.3";
    }
};