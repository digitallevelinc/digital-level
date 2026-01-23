// src/scripts/dashboard/switch.js
import { fUSDT, buildSheetLink } from './utils.js';

export const updateSwitchSection = (kpis) => {
    const container = document.getElementById('wallet-switch');
    if (!container) return;

    const data = kpis.wallets?.switch || kpis.wallets || {};
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
        // Soporte para claves planas (switchTotalIn/Out) si no existen las genéricas
        const valIn = data.switchTotalIn ?? data.totalIn ?? 0;
        const valOut = data.switchTotalOut ?? data.totalOut ?? 0;
        const countIn = data.switchCountIn ?? data.countIn ?? 0;
        const countOut = data.switchCountOut ?? data.countOut ?? 0;

        const actualBalance = data.balanceSwitch !== undefined ? data.balanceSwitch : (valIn || valOut || 0);

        if (mainValue) {
            mainValue.textContent = fUSDT(actualBalance);
        }

        // Movimientos
        if (ui.inCount) ui.inCount.textContent = countIn.toString();
        if (ui.inVol) ui.inVol.textContent = fUSDT(valIn);

        if (ui.outCount) ui.outCount.textContent = countOut.toString();
        if (ui.outVol) ui.outVol.textContent = fUSDT(valOut);

        // Total de Operaciones
        if (ui.totalOps) {
            const total = data.switchTotalOperations ?? data.totalOperations ?? (Number(countIn) + Number(countOut));
            ui.totalOps.textContent = total.toString();
        }
    }

    if (sheetLink) {
        sheetLink.href = buildSheetLink(kpis.config?.googleSheetId, "1474172895");
        sheetLink.style.opacity = kpis.config?.googleSheetId ? "1" : "0.3";
    }
};