// src/scripts/dashboard/switch.js
import { fUSDT, buildSheetLink } from './utils.js';

export const updateSwitchSection = (kpis) => {
    const container = document.getElementById('wallet-switch');
    if (!container) return;
    
    const data = kpis.wallets?.switch;
    const mainValue = document.getElementById('switch-balance-total'); // Asegúrate de que este ID esté en tu H3 del Astro
    const sheetLink = document.getElementById('link-switch-sheet');

    const ui = {
        inCount: document.getElementById('switch-in-count'),
        inVol: document.getElementById('switch-in-vol'),
        outCount: document.getElementById('switch-out-count'),
        outVol: document.getElementById('switch-out-vol'),
        totalOps: document.getElementById('switch-total-ops')
    };

    if (data) {
        // CORRECCIÓN DEL BALANCE GRANDE:
        // Si data.balanceSwitch es 0 o undefined, pero hay volumen enviado/devuelto,
        // tomamos el balance reportado de la wallet o el total de la operativa de switch.
        const actualBalance = data.balanceSwitch || data.totalIn || data.totalOut || 0;

        if (mainValue) {
            mainValue.textContent = fUSDT(actualBalance);
        }
        
        // Movimientos
        if (ui.inCount) ui.inCount.textContent = data.countIn ?? "0";
        if (ui.inVol) ui.inVol.textContent = fUSDT(data.totalIn ?? 0);
        
        if (ui.outCount) ui.outCount.textContent = data.countOut ?? "0";
        if (ui.outVol) ui.outVol.textContent = fUSDT(data.totalOut ?? 0);

        // Total de Operaciones
        if (ui.totalOps) {
            ui.totalOps.textContent = (data.totalOperations || (Number(data.countIn || 0) + Number(data.countOut || 0))).toString();
        }
    }
    
    if (sheetLink) {
        sheetLink.href = buildSheetLink(kpis.config?.googleSheetId, "1474172895");
        sheetLink.style.opacity = kpis.config?.googleSheetId ? "1" : "0.3";
    }
};