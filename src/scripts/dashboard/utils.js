// src/scripts/dashboard/utils.js

export const fUSDT = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fVES = (v) => `${Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES`;

export const inject = (id, value, isProfit = false) => {
    const container = document.getElementById(id);
    if (!container) return;
    const el = container.querySelector('h3') || container.querySelector('.text-white') || container.querySelector('span') || container;
    if (el) {
        el.textContent = value !== undefined && value !== null ? value : "N/A";
        if (isProfit && value !== "N/A") {
            const num = parseFloat(String(value).replace(/[^0-9.-]+/g, ""));
            el.style.color = num >= 0 ? "#10b981" : "#ef4444";
        }
    }
};

export const buildSheetLink = (id, gid = null) => {
    if (!id) return "#";
    return `https://docs.google.com/spreadsheets/d/${id}${gid ? '/edit#gid=' + gid : ''}`;
};

export const setSheetLinkState = (
    linkEl,
    {
        sheetId,
        gid = null,
        customUrl = null,
        enabledTitle = "Abrir Google Sheet",
        disabledTitle = "Este usuario no tiene Google Sheet configurado."
    } = {}
) => {
    if (!linkEl) return;

    const cleanCustomUrl = String(customUrl || "").trim();
    const cleanSheetId = String(sheetId || "").trim();
    const hasConfig = Boolean(cleanCustomUrl || cleanSheetId);
    const href = cleanCustomUrl || buildSheetLink(cleanSheetId, gid);

    linkEl.href = hasConfig ? href : "#";
    linkEl.style.opacity = hasConfig ? "1" : "0.35";
    linkEl.style.cursor = hasConfig ? "pointer" : "not-allowed";
    linkEl.setAttribute("aria-disabled", hasConfig ? "false" : "true");
    linkEl.setAttribute("title", hasConfig ? enabledTitle : disabledTitle);

    if (!linkEl.dataset.sheetGuardBound) {
        linkEl.addEventListener("click", (event) => {
            if (linkEl.getAttribute("aria-disabled") === "true") {
                event.preventDefault();
                event.stopPropagation();
                const statusEl = document.getElementById("last-update");
                if (statusEl) {
                    statusEl.textContent = disabledTitle;
                }
            }
        });
        linkEl.dataset.sheetGuardBound = "1";
    }
};
