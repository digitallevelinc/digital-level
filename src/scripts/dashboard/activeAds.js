const CARACAS_TZ = "America/Caracas";

function getEl(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = getEl(id);
  if (!el) return;
  el.textContent = String(value ?? "--");
}

function formatNumber(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return num.toLocaleString("es-VE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPrice(price, fiat) {
  const hasPrice = Number.isFinite(Number(price));
  if (!hasPrice) return "--";
  const fiatText = String(fiat || "").trim();
  return fiatText
    ? `${formatNumber(price, 4)} ${fiatText}`
    : formatNumber(price, 4);
}

function formatRemaining(amount, asset) {
  const hasAmount = Number.isFinite(Number(amount));
  if (!hasAmount) return "--";
  const assetText = String(asset || "").trim();
  return assetText
    ? `${formatNumber(amount, 2)} ${assetText}`
    : formatNumber(amount, 2);
}

function getFiatLiquidityValue(ad) {
  const remaining = Number(ad?.remainingAmount);
  const price = Number(ad?.price);
  if (!Number.isFinite(remaining) || !Number.isFinite(price)) return null;
  return remaining * price;
}

function formatFiatLiquidity(ad) {
  const value = getFiatLiquidityValue(ad);
  if (!Number.isFinite(value)) return "--";
  const fiatText = String(ad?.fiat || "").trim().toUpperCase();
  if (fiatText === "VES") return `${formatNumber(value, 2)} Bs`;
  return fiatText
    ? `${formatNumber(value, 2)} ${fiatText}`
    : formatNumber(value, 2);
}

function formatAmountAndLiquidity(ad) {
  const amountText = formatRemaining(ad?.remainingAmount, ad?.asset);
  const fiatLiquidityText = formatFiatLiquidity(ad);

  if (amountText === "--") return fiatLiquidityText;
  if (fiatLiquidityText === "--") return amountText;
  return `${amountText} | ${fiatLiquidityText}`;
}

function calculateTotalBolivarLiquidity(activeAds) {
  const rows = Array.isArray(activeAds) ? activeAds : [];
  return rows.reduce((sum, ad) => {
    const fiatText = String(ad?.fiat || "").trim().toUpperCase();
    if (fiatText !== "VES") return sum;
    const value = getFiatLiquidityValue(ad);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function formatDateTime(isoValue) {
  if (!isoValue) return "--";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("es-VE", {
    timeZone: CARACAS_TZ,
    hour12: false,
  });
}

function normalizeSource(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "direct") return "Directo";
  if (raw === "inferred") return "Inferido";
  if (raw === "none") return "No disponible";
  return "--";
}

function normalizeType(value) {
  const type = String(value || "").trim().toUpperCase();
  if (type === "BUY") return "Compra";
  if (type === "SELL") return "Venta";
  return "Desconocido";
}

function translateStatus(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";

  const map = {
    COMPLETED: "Completada",
    CANCELLED: "Cancelada",
    CANCELED: "Cancelada",
    EXPIRED: "Expirada",
    PENDING: "Pendiente",
    PAID: "Pagada",
    APPEALING: "En apelacion",
    CANCELLED_BY_SYSTEM: "Cancelada por sistema",
    CANCELED_BY_SYSTEM: "Cancelada por sistema",
    IN_PROGRESS: "En progreso",
    TRADING: "En curso",
    OPEN: "Abierta",
    CLOSED: "Cerrada",
    ACTIVE: "Activa",
    INACTIVE: "Inactiva",
    ONLINE: "En linea",
    OFFLINE: "Fuera de linea",
  };

  return map[raw] || raw.replaceAll("_", " ").toLowerCase();
}

function translateConfidence(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "high") return "alta";
  if (raw === "medium") return "media";
  if (raw === "low") return "baja";
  return raw || "";
}

function translateWarning(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const exactMap = {
    "Direct ads endpoint returned no active ads, using inferred mode from order history":
      "No se detectaron ordenes P2P activas en modo directo. Se uso modo inferido por historial de ordenes.",
    "Direct ads endpoint returned no data (unsupported or no permission)":
      "El endpoint directo no devolvio datos (sin soporte o sin permisos para esta cuenta).",
    "No inferred active ads found in current history window":
      "No se detectaron ordenes P2P activas por historial. En modo inferido, solo aparecen ordenes con actividad reciente/en curso.",
    "Operator has no Binance API credentials configured":
      "El operador no tiene credenciales API de Binance configuradas.",
    "P2P client unavailable":
      "Cliente P2P no disponible.",
  };

  if (exactMap[text]) return exactMap[text];
  return text;
}

function getWarningTone(warnings = []) {
  const joined = warnings.map((w) => String(w || "").toLowerCase()).join(" ");
  const isInfo =
    joined.includes("using inferred mode from order history") &&
    !joined.includes("unavailable") &&
    !joined.includes("no permission") &&
    !joined.includes("no data");

  if (isInfo) return "info";
  return "warning";
}

function makeCell(text, className = "") {
  const td = document.createElement("td");
  td.className = `px-3 py-3 align-top ${className}`.trim();
  td.textContent = text;
  return td;
}

function renderWarnings(warnings) {
  const warningEl = getEl("active-ads-warning");
  if (!warningEl) return;

  const list = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
  if (list.length === 0) {
    warningEl.textContent = "";
    warningEl.classList.add("hidden");
    return;
  }

  const translated = list.map(translateWarning);
  const tone = getWarningTone(list);

  warningEl.classList.remove(
    "text-amber-300/90",
    "bg-amber-500/10",
    "border-amber-400/20",
    "text-sky-200",
    "bg-sky-500/10",
    "border-sky-400/20",
  );

  if (tone === "info") {
    warningEl.classList.add("text-sky-200", "bg-sky-500/10", "border-sky-400/20");
  } else {
    warningEl.classList.add(
      "text-amber-300/90",
      "bg-amber-500/10",
      "border-amber-400/20",
    );
  }

  warningEl.textContent = translated.join(" | ");
  warningEl.classList.remove("hidden");
}

function renderRows(activeAds) {
  const tbody = getEl("active-ads-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  const rows = Array.isArray(activeAds) ? activeAds : [];
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "border-t border-white/5";

    const td = document.createElement("td");
    td.className = "px-3 py-3 text-white/50";
    td.colSpan = 8;
    td.textContent = "No hay ordenes P2P activas en este momento.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((ad) => {
    const tr = document.createElement("tr");
    tr.className = "border-t border-white/5";

    const payMethods = Array.isArray(ad?.payMethods)
      ? ad.payMethods.filter(Boolean).slice(0, 3).join(", ")
      : "";

    const openOrders = Number.isFinite(Number(ad?.openOrders))
      ? Number(ad.openOrders)
      : null;
    const totalOrders = Number.isFinite(Number(ad?.totalOrders))
      ? Number(ad.totalOrders)
      : null;

    const ordersText =
      openOrders !== null || totalOrders !== null
        ? `${openOrders ?? 0} / ${totalOrders ?? 0}`
        : "--";

    const stateParts = [
      ad?.statusRaw ? translateStatus(ad.statusRaw) : null,
      ad?.latestOrderStatus
        ? `Ultima: ${translateStatus(ad.latestOrderStatus)}`
        : null,
      ad?.confidence ? `Confianza: ${translateConfidence(ad.confidence)}` : null,
      ad?.latestOrderTime ? formatDateTime(ad.latestOrderTime) : null,
    ].filter(Boolean);

    const pair = `${String(ad?.asset || "--")}/${String(ad?.fiat || "--")}`;

    tr.appendChild(makeCell(String(ad?.adId || "--"), "font-mono text-[13px]"));
    tr.appendChild(
      makeCell(
        normalizeType(ad?.tradeType),
        normalizeType(ad?.tradeType) === "Compra"
          ? "text-emerald-400 font-bold"
          : normalizeType(ad?.tradeType) === "Venta"
            ? "text-rose-400 font-bold"
            : "text-white/60",
      ),
    );
    tr.appendChild(makeCell(pair));
    tr.appendChild(makeCell(formatPrice(ad?.price, ad?.fiat)));
    tr.appendChild(makeCell(formatAmountAndLiquidity(ad)));
    tr.appendChild(makeCell(payMethods || "--"));
    tr.appendChild(makeCell(ordersText));
    tr.appendChild(makeCell(stateParts.join(" | ") || "--", "text-white/70"));

    tbody.appendChild(tr);
  });
}

function renderError(message) {
  setText("active-ads-count", "0");
  setText("active-ads-source", "Error");
  setText("active-ads-total-fiat", "--");
  setText("active-ads-updated", "--");
  renderWarnings([message]);
  renderRows([]);
}

export async function refreshActiveAds(
  API_BASE,
  token,
  options = {},
) {
  const card = getEl("active-ads-card");
  if (!card) return;

  const { signal, onAuthError } = options;

  try {
    const params = new URLSearchParams();
    // Use auto mode:
    // 1) direct active ads detection first
    // 2) inferred history fallback only when direct has no active results
    params.set("mode", "auto");
    params.set("days", "7");
    params.set("_ts", String(Date.now()));

    const res = await fetch(`${API_BASE}/api/p2p/ads/active?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal,
    });

    if (res.status === 401 || res.status === 403) {
      if (typeof onAuthError === "function") {
        onAuthError();
      }
      return;
    }

    if (!res.ok) {
      let backendError = "";
      try {
        const errData = await res.json();
        backendError = errData?.error || "";
      } catch {
        // ignore parse errors
      }
      throw new Error(
        backendError || `No se pudieron consultar ordenes P2P activas (${res.status})`,
      );
    }

    const payload = await res.json();
    const activeAds = Array.isArray(payload?.activeAds) ? payload.activeAds : [];
    const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
    const source = normalizeSource(payload?.source);
    const windowDays = Number(payload?.windowDays);
    const windowLabel =
      Number.isFinite(windowDays) && windowDays > 0
        ? `${windowDays} dias`
        : "--";
    const updatedAt = formatDateTime(payload?.detectedAt);

    setText("active-ads-count", String(activeAds.length));
    setText("active-ads-source", source);
    setText(
      "active-ads-total-fiat",
      `${formatNumber(calculateTotalBolivarLiquidity(activeAds), 2)} Bs`,
    );
    setText("active-ads-window", windowLabel);
    setText("active-ads-updated", updatedAt);

    renderWarnings(warnings);
    renderRows(activeAds);
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error("Active ads refresh failed:", error);
    renderError(error instanceof Error ? error.message : "Error desconocido");
  }
}
