import { fUSDT, buildSheetLink } from './utils.js';

export const updateRedSection = (kpis) => {
    const container = document.getElementById('wallet-red');
    if (!container) return;

    // Soporte para estructura anidada (kpis.wallets.red) o plana (kpis.wallets)
    const data = kpis.wallets?.red || kpis.wallets || {};
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

    // Validamos si tenemos datos relevantes (balance o operaciones)
    if (data) {
        // Balance: intenta balanceRed (plano) o usa el del objeto red
        const balance = data.balanceRed !== undefined ? data.balanceRed : (data.balance ?? 0);
        if (mainValue) mainValue.textContent = fUSDT(balance);

        // Asignación de datos (Salidas/Enviado)
        // Intenta claves planas específicas (ej: redCountOut) o genéricas usadas en el objeto red
        const countOut = data.redCountOut ?? data.countOut ?? 0;
        const volOut = data.redTotalExpense ?? data.totalExpense ?? 0;

        if (ui.sentCount) ui.sentCount.textContent = countOut.toString();
        if (ui.sentVol) ui.sentVol.textContent = fUSDT(volOut);

        // Entradas/Recibido
        const countIn = data.redCountIn ?? data.countIn ?? 0;
        const volIn = data.redTotalIncome ?? data.totalIncome ?? 0;

        if (ui.receivedCount) ui.receivedCount.textContent = countIn.toString();
        if (ui.receivedVol) ui.receivedVol.textContent = fUSDT(volIn);

        // Total
        const total = data.redTotalOperations ?? data.totalOperations ?? (Number(countIn) + Number(countOut));
        if (ui.totalOps) ui.totalOps.textContent = total.toString();
    }

    if (sheetLink) {
        sheetLink.href = buildSheetLink(kpis.config?.googleSheetId);
        sheetLink.style.opacity = kpis.config?.googleSheetId ? "1" : "0.3";
    }
};