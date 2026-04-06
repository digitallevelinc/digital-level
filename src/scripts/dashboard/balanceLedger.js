const CARACAS_TZ = 'America/Caracas';
const LEDGER_CHANNELS = Object.freeze(['RED', 'P2P', 'PAY']);
const LEDGER_FILTER_OPTIONS = Object.freeze(['ALL', ...LEDGER_CHANNELS]);
const LEDGER_CHANNEL_SET = new Set(LEDGER_CHANNELS);

const state = {
    apiBase: '',
    token: '',
    range: {},
    kpis: {},
    syncKey: '',
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
    loadedOnce: false,
    needsRefresh: true,
    initialized: false,
    requestSeq: 0,
    abortController: null,
    onAuthError: null,
    searchTerm: '',
    searchPending: false,
    searchResultCount: 0,
    searchSeq: 0,
    typeFilter: 'ALL',
    currentTransfers: [],
    transfersCache: new Map(),
    pageNetByPage: new Map(),
    prefetchedPages: new Set(),
    bankData: [],
    closingBalance: null,
    onBankDataUpdate: null,
    spreadTooltipBound: false,
};

let searchDebounceTimer = null;

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatNumber = (value, decimals = 2, locale = 'es-VE') => Number(value || 0).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
});

const formatUsd = (value) => `$${formatNumber(value, 2, 'en-US')}`;
const formatCoveragePercent = (pct, complete = false) => {
    const safePct = Math.max(0, Number(pct || 0));
    if (complete) return '100%';

    const cappedPct = Math.min(safePct, 99.9);
    if (cappedPct >= 99) return `${cappedPct.toFixed(1)}%`;
    if (cappedPct >= 10) return `${Math.round(cappedPct)}%`;
    return `${cappedPct.toFixed(1)}%`;
};
const truncateTowardZero = (value, decimals = 2) => {
    const factor = 10 ** decimals;
    return Math.trunc(Number(value || 0) * factor) / factor;
};
const toFiniteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const getTransferKey = (tx = {}) => String(
    tx?.id
    || tx?.txHash
    || tx?.orderNumber
    || tx?.binanceRawId
    || `${tx?.timestamp ?? ''}_${tx?.amount ?? ''}_${tx?.type ?? ''}`
);
const getTxTimestampMs = (tx = {}) => {
    const raw = tx?.timestamp;
    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const parsed = new Date(raw || 0).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};
const normalizeTextToken = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const WRAPPED_NOTE_PATTERN = /[\(\{]\s*([^\)\}]+?)\s*[\)\}]/s;
const PLAIN_NOTE_PATTERN = /^\s*([^()\{\}\n]+?)\s*$/s;
const PROMISE_ACTIVATION_MAX_USDT = 1.0;
const COVERAGE_COMPLETION_TOLERANCE_FIAT = 1.0;

const normalizeTxType = (tx = {}) => {
    const rawType = String(tx?.type || '').toUpperCase().trim();
    if (!rawType) {
        const tradeType = String(tx?.tradeType || '').toUpperCase().trim();
        if (tradeType === 'BUY') return 'P2P_BUY';
        if (tradeType === 'SELL') return 'P2P_SELL';
        return '';
    }

    if (rawType === 'P2P_BUY' || rawType === 'P2P_SELL') return rawType;

    // Some ledger rows arrive as generic P2P with a tradeType field (BUY/SELL).
    if (rawType === 'P2P' || rawType === 'P2P_TRADE' || rawType === 'P2P_ORDER') {
        const tradeType = String(tx?.tradeType || '').toUpperCase().trim();
        if (tradeType === 'BUY') return 'P2P_BUY';
        if (tradeType === 'SELL') return 'P2P_SELL';
    }

    return rawType;
};

const isSettlementTransfer = (tx = {}) => {
    const excludedReason = String(tx?.excludedReason || '').trim().toUpperCase();
    if (excludedReason === 'INTER_OPERATOR_SETTLEMENT') return true;

    const note = normalizeTextToken(tx?.notes || '');
    if (!note) return false;
    return /\bliq\b/.test(note) || /\bliquidacion\b/.test(note) || /\bliquidar\b/.test(note);
};

const getCategory = (type) => {
    if (!type) return 'OTRO';
    if (type === 'DISPERSOR_PENDING') return 'PARSEO';
    if (type.startsWith('P2P_')) return 'P2P';
    if (type.startsWith('PAY_')) return 'PAY';
    if (type === 'DEPOSIT' || type === 'WITHDRAWAL' || type === 'DIVIDEND') return 'RED';
    if (type === 'INTERNAL_TRANSFER') return 'SWITCH';
    return 'OTRO';
};

const isLedgerChannelAllowed = (tx = {}) => {
    const category = getCategory(String(tx?.type || '').toUpperCase());
    if (state.typeFilter !== 'ALL') {
        return category === state.typeFilter;
    }
    return LEDGER_CHANNEL_SET.has(category);
};

const getRequestedChannels = () => state.typeFilter === 'ALL'
    ? [...LEDGER_CHANNELS]
    : [state.typeFilter];

const getDirection = (type) => {
    switch (String(type || '').toUpperCase()) {
        case 'P2P_BUY':
        case 'PAY_RECEIVED':
        case 'DEPOSIT':
        case 'DIVIDEND':
            return 1;
        case 'P2P_SELL':
        case 'PAY_SENT':
        case 'WITHDRAWAL':
            return -1;
        default:
            return 0;
    }
};

const getSignedAmount = (tx = {}) => {
    const type = normalizeTxType(tx);
    const status = String(tx?.status || '').toUpperCase();
    const asset = String(tx?.asset || '').toUpperCase();
    const pm = String(tx?.paymentMethod || '').toUpperCase();
    const walletFrom = String(tx?.walletFrom || '').toUpperCase();
    const walletTo = String(tx?.walletTo || '').toUpperCase();
    const amount = toFiniteNumber(tx?.amount);

    if (!amount) return 0;
    if (status && status !== 'SUCCESS') return 0;

    // Balance corrido del modulo: solo USDT.
    if (asset && asset !== 'USDT') return 0;

    let delta = 0;

    switch (type) {
        case 'P2P_BUY':
        case 'DEPOSIT':
        case 'DIVIDEND':
            delta += amount;
            break;
        case 'PAY_RECEIVED':
            if (amount <= PROMISE_ACTIVATION_MAX_USDT) {
                // Activación de promesa (micro-monto): usar el USDT prometido real, no el $0.01.
                const promMeta = getPromiseMeta(tx);
                delta += promMeta?.promiseUsdt > 0 ? promMeta.promiseUsdt : amount;
            } else {
                delta += amount;
            }
            break;
        case 'P2P_SELL':
        case 'PAY_SENT':
        case 'WITHDRAWAL':
            delta -= amount;
            break;
        case 'CONVERT':
        case 'SPOT_TRADE':
            if (pm === 'CONVERT_IN' || pm === 'SPOT_SELL') delta += amount;
            else if (pm === 'CONVERT_OUT' || pm === 'SPOT_BUY') delta -= amount;
            break;
        case 'INTERNAL_TRANSFER': {
            const monitored = new Set(['MAIN', 'FUNDING', 'SPOT']);
            const fromMonitored = monitored.has(walletFrom);
            const toMonitored = monitored.has(walletTo);
            if (fromMonitored && !toMonitored) delta -= amount;
            else if (!fromMonitored && toMonitored) delta += amount;
            break;
        }
        default:
            break;
    }

    const fee = toFiniteNumber(tx?.fee);
    const feeCurrency = String(tx?.feeCurrency || '').toUpperCase();
    if (fee > 0 && (!feeCurrency || feeCurrency === 'USDT')) {
        delta -= fee;
    }

    return delta;
};

const getLedgerAnchorBalance = (kpis = {}) => {
    const payloadClosingBalance = Number(state.closingBalance);
    const candidates = [
        kpis?.metrics?.totalBalance,
        kpis?.currentBalance,
        kpis?.audit?.realBalance,
        kpis?.metrics?.balance,
        kpis?.summary?.balance,
    ];
    const verifiedWalletBalance = candidates.reduce((found, candidate) => {
        if (Number.isFinite(found)) return found;
        const numeric = Number(candidate);
        return Number.isFinite(numeric) ? numeric : found;
    }, Number.NaN);
    const todayKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: CARACAS_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
    const rangeFrom = sanitizeDateValue(state.range?.from);
    const rangeTo = sanitizeDateValue(state.range?.to);
    const isLiveRange = !rangeTo || rangeTo === todayKey || (!rangeFrom && !rangeTo);

    if (isLiveRange && Number.isFinite(verifiedWalletBalance)) {
        return verifiedWalletBalance;
    }

    if (Number.isFinite(payloadClosingBalance)) {
        return payloadClosingBalance;
    }

    const premiumLedgerBalance = Number(kpis?.premiumLedgerBalance);
    if (Number.isFinite(premiumLedgerBalance)) {
        return premiumLedgerBalance;
    }

    const wallets = kpis?.wallets || {};
    const isolatedWalletsSum = Number(wallets.balanceP2P || 0)
        + Number(wallets.balancePay || 0);

    if (Number.isFinite(isolatedWalletsSum)) {
        return isolatedWalletsSum;
    }

    if (Number.isFinite(verifiedWalletBalance)) {
        return verifiedWalletBalance;
    }

    const walletsSum = Number(wallets.balanceP2P || 0)
        + Number(wallets.balancePay || 0);

    return Number.isFinite(walletsSum) ? walletsSum : 0;
};

const getKnownNetBeforePage = (page) => {
    if (page <= 1) return 0;

    let netBefore = 0;
    for (let i = 1; i < page; i += 1) {
        if (!state.pageNetByPage.has(i)) return null;
        netBefore += Number(state.pageNetByPage.get(i) || 0);
    }

    return netBefore;
};

const getCategoryTone = (category) => {
    switch (category) {
        case 'P2P':
            return 'text-[#f7c948]';
        case 'PAY':
            return 'text-sky-300';
        case 'LIQUID':
            return 'text-rose-300';
        case 'RED':
            return 'text-violet-300';
        case 'SWITCH':
            return 'text-emerald-300';
        case 'PARSEO':
            return 'text-amber-500';
        default:
            return 'text-white/55';
    }
};

const getCategoryChipClass = (category) => {
    switch (category) {
        case 'P2P':
            return 'ledger-chip ledger-chip-p2p';
        case 'PAY':
            return 'ledger-chip ledger-chip-pay';
        case 'LIQUID':
            return 'ledger-chip ledger-chip-liquid';
        case 'RED':
            return 'ledger-chip ledger-chip-red';
        case 'SWITCH':
            return 'ledger-chip ledger-chip-switch';
        case 'PARSEO':
            return 'ledger-chip ledger-chip-parseo';
        default:
            return 'ledger-chip ledger-chip-neutral';
    }
};

const getRowToneClass = (category, txType = '') => {
    switch (category) {
        case 'P2P':
            if (txType === 'P2P_SELL') return 'ledger-row-p2p-sell';
            if (txType === 'P2P_BUY') return 'ledger-row-p2p-buy';
            return 'ledger-row-p2p';
        case 'PAY':
            return 'ledger-row-pay';
        case 'LIQUID':
            return 'ledger-row-liquid';
        case 'PARSEO':
            return 'ledger-row-parseo';
        default:
            return 'ledger-row-neutral';
    }
};

const formatPostingDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        timeZone: CARACAS_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatRate = (rate) => {
    const n = Number(rate || 0);
    return n > 0 ? `RATE ${formatNumber(n, 2)}` : '';
};

const formatFeeMeta = (tx) => {
    const fee = toFiniteNumber(tx?.fee);
    if (fee <= 0) return '';
    return `FEE ${formatUsd(fee)}`;
};

const parseStructuredNote = (note) => {
    const raw = String(note ?? '').trim();
    if (!raw) return null;

    const wrapped = raw.match(WRAPPED_NOTE_PATTERN);
    const plain = wrapped ? null : raw.match(PLAIN_NOTE_PATTERN);
    const payload = wrapped?.[1]?.trim() ?? plain?.[1]?.trim();
    if (!payload) return null;

    const parts = payload
        .split(/[;:]/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length < 2) return null;
    return { raw, parts };
};

const parseFlexibleNumber = (value) => {
    const cleaned = String(value ?? '').replace(/[^\d.,]/g, '');
    if (!cleaned) return 0;

    let normalized = cleaned;
    if (cleaned.includes(',') && cleaned.includes('.')) {
        normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
            ? cleaned.replace(/\./g, '').replace(',', '.')
            : cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',')) {
        normalized = cleaned.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const hasPromiseHint = (token) => {
    const s = String(token ?? '').toLowerCase();
    return s.includes('$') || /\b(usdt|usd|promesa|promise|prom)\b/.test(s);
};

const getPromiseMeta = (tx = {}) => {
    if (tx?.syntheticPromiseMeta) return tx.syntheticPromiseMeta;
    const type = String(tx?.type || '').toUpperCase();
    if (type !== 'PAY_SENT' && type !== 'PAY_RECEIVED') return null;

    const structured = parseStructuredNote(tx?.notes);
    if (!structured) return null;

    // Standard 3-part format: (BANK; RATE; PROMISE_USDT)
    // 2-part promise format:  (BANK; $PROMISE_USDT) — rate inferred from tx
    let promiseUsdt = parseFlexibleNumber(structured.parts[2]);
    let exchangeRate;

    if (promiseUsdt > 0) {
        const noteRate = parseFlexibleNumber(structured.parts[1]);
        exchangeRate = noteRate > 0 ? noteRate : getTxRate(tx);
    } else if (structured.parts.length === 2 && hasPromiseHint(structured.parts[1])) {
        promiseUsdt = parseFlexibleNumber(structured.parts[1]);
        exchangeRate = getTxRate(tx);
    }

    if (promiseUsdt <= 0) return null;
    if (!exchangeRate || exchangeRate <= 0) return null;

    const txAmountUsdt = Math.abs(Number(tx?.amount || 0));
    const txAmountFiat = resolveFiatAmount(tx);
    const promisedFiat = promiseUsdt * exchangeRate;
    const isReceiver = type === 'PAY_RECEIVED';

    // Convencion operativa: las promesas se activan con un micro-monto (≤ $1 USDT).
    // Si el monto real supera ese umbral, es un pago real, no una activación de promesa.
    // Aplica tanto a PAY_SENT como a PAY_RECEIVED: un PAY normal ($50, $200, etc.)
    // no debe ser tratado como promesa aunque su nota tenga formato estructurado.
    if (txAmountUsdt > PROMISE_ACTIVATION_MAX_USDT) {
        return null;
    }

    // PAY_RECEIVED se usa como activador de promesa (ej: 0.01 con nota),
    // no como abono real que deba descontar del pendiente de la promesa.
    const actualUsdt = isReceiver ? 0 : txAmountUsdt;
    const actualFiat = isReceiver ? 0 : txAmountFiat;
    const pendingUsdt = Math.max(0, promiseUsdt - actualUsdt);
    const pendingFiat = Math.max(0, promisedFiat - actualFiat);

    return {
        rawNote: structured.raw,
        exchangeRate,
        promiseUsdt,
        promisedFiat,
        actualUsdt,
        actualFiat,
        pendingUsdt,
        pendingFiat,
        isReceiver,
    };
};

const isLedgerSellTarget = (tx) => {
    const type = normalizeTxType(tx);
    if (type === 'P2P_SELL') return true;
    if (type === 'PAY_SENT' && getPromiseMeta(tx)?.promiseUsdt > 0) return true;
    return false;
};

const getFiatLabel = (tx = {}) => {
    const fiatCurrency = String(tx?.fiatCurrency || '').trim().toUpperCase();
    if (fiatCurrency) return fiatCurrency;

    const type = String(tx?.type || '').toUpperCase();
    const hasFiatSignal = Number(tx?.fiatAmount || 0) > 0 || Number(tx?.exchangeRate || 0) > 0;
    if ((type === 'PAY_SENT' || type === 'PAY_RECEIVED') && hasFiatSignal) {
        return 'VES';
    }

    return 'FIAT';
};

const maskCounterpartyName = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return raw;
};

const buildDescriptionTop = (tx) => {
    if (tx?.counterpartyName) return maskCounterpartyName(tx.counterpartyName);
    return tx?.notes || tx?.paymentMethod || 'Movimiento sin detalle';
};

const normalizeAdvertisementRole = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'MAKER' || raw === 'M') return 'MAKER';
    if (raw === 'TAKER' || raw === 'T') return 'TAKER';
    return '';
};

const getNoteAdvertisementRole = (tx = {}) => {
    const structured = parseStructuredNote(tx?.notes);
    if (!structured?.parts?.length) return '';
    const trailingToken = structured.parts[structured.parts.length - 1];
    return normalizeAdvertisementRole(trailingToken);
};

const getTxDisplayRole = (tx = {}) => {
    const explicitRole = normalizeAdvertisementRole(tx?.advertisementRole);
    if (explicitRole) return explicitRole;

    const txType = String(tx?.type || '').toUpperCase();
    if ((txType === 'PAY_SENT' || txType === 'PAY_RECEIVED') && getPromiseMeta(tx)) {
        return getNoteAdvertisementRole(tx);
    }

    return '';
};

const buildDescriptionMeta = (tx, topLine = '') => {
    const parts = [];
    const rateText = formatRate(tx?.exchangeRate);
    const feeText = formatFeeMeta(tx);
    const status = String(tx?.status || '').toUpperCase();
    const asset = String(tx?.asset || '').toUpperCase();
    const fiatCurrency = String(tx?.fiatCurrency || '').toUpperCase();
    const promiseMeta = getPromiseMeta(tx);
    const orderNumber = String(tx?.orderNumber || '').trim();

    // Keep sender/receiver identity only in the top line to avoid redundancy.
    if (asset) parts.push(asset);
    if (fiatCurrency) parts.push(fiatCurrency);
    if (feeText) parts.push(feeText);
    if (rateText) parts.push(rateText);
    if (orderNumber) parts.push(`ORD ${orderNumber}`);
    if (tx?.tradeType) parts.push(`TRADE ${tx.tradeType}`);
    const txType = String(tx?.type || '').toUpperCase();
    if (txType === 'P2P_BUY' || txType === 'P2P_SELL') {
        const role = getTxDisplayRole(tx) || inferMakerTakerRole({
            explicitRole: tx?.advertisementRole,
            fee: toFiniteNumber(tx?.fee),
            amount: Math.abs(Number(tx?.amount || 0))
        });
        if (role) parts.push(`__ROLE__${role}`);
    } else if ((txType === 'PAY_SENT' || txType === 'PAY_RECEIVED') && promiseMeta) {
        const role = getTxDisplayRole(tx);
        if (role) parts.push(`__ROLE__${role}`);
    }
    if (tx?.counterpartyId && tx?.counterpartyName !== topLine) {
        parts.push(`ID ${tx.counterpartyId}`);
    }
    if (tx?.walletFrom || tx?.walletTo) {
        parts.push(`${tx.walletFrom || '?'}->${tx.walletTo || '?'}`);
    }
    if (status && status !== 'SUCCESS') parts.push(`STATUS ${status}`);
    if (tx?.notes && tx?.notes !== topLine && tx.notes !== promiseMeta?.rawNote) parts.push(tx.notes);
    return parts;
};

const getTxUsdtVolume = (tx) => {
    const meta = getPromiseMeta(tx);
    if (meta && meta.promiseUsdt > 0) return meta.promiseUsdt;
    return Math.abs(Number(tx?.amount || 0));
};

const getTxRate = (tx) => {
    const directRate = Number(tx?.exchangeRate || 0);
    if (directRate > 0) return directRate;

    const meta = getPromiseMeta(tx);
    if (meta && meta.exchangeRate > 0) return meta.exchangeRate;

    const amount = Math.abs(Number(tx?.amount || 0));
    const fiatAmount = Math.abs(Number(tx?.fiatAmount || 0));
    if (amount > 0 && fiatAmount > 0) return fiatAmount / amount;

    return 0;
};

const resolveFiatAmount = (tx) => {
    const fiatAmount = Math.abs(Number(tx?.fiatAmount || 0));
    if (fiatAmount > 0) return fiatAmount;

    const meta = getPromiseMeta(tx);
    if (meta && meta.promisedFiat > 0) return meta.promisedFiat;

    const amount = Math.abs(Number(tx?.amount || 0));
    if (amount <= 0) return 0;

    const rate = getTxRate(tx);
    if (rate > 0) return amount * rate;

    // Ultimo recurso: mostrar el monto base como FIAT para evitar huecos de datos en UI.
    return amount;
};

const formatFiat = (tx) => {
    const type = String(tx?.type || '').toUpperCase();
    if ((type === 'PAY_SENT' || type === 'PAY_RECEIVED') && !getPromiseMeta(tx)) {
        return '';
    }

    const fiatResolved = resolveFiatAmount(tx);
    return `${formatNumber(fiatResolved, 2)} ${getFiatLabel(tx)}`;
};

const formatAmount = (tx) => {
    if (tx?.type === 'DISPERSOR_PENDING') return 'INFO';
    const type = normalizeTxType(tx);
    const direction = getDirection(type);
    const amount = Number(tx?.amount || 0);
    const sign = direction < 0 ? '-' : direction > 0 ? '+' : '';

    // Display net amount for P2P buys when fee is in USDT.
    const fee = toFiniteNumber(tx?.fee);
    const feeCurrency = String(tx?.feeCurrency || '').toUpperCase();
    const effectiveFee = fee > 0 && (!feeCurrency || feeCurrency === 'USDT') ? fee : 0;
    const absAmount = Math.abs(amount);
    const displayBase = (type === 'P2P_BUY' && direction > 0)
        ? Math.max(0, absAmount - effectiveFee)
        : (type === 'P2P_SELL' && direction < 0)
            ? (absAmount + effectiveFee)
            : absAmount;

    return `${sign}${formatUsd(displayBase)}`;
};

const formatPromiseUsdt = (value) => `${formatNumber(Math.abs(Number(value || 0)), 2, 'en-US')} USDT`;

const formatPromiseFiat = (value, tx) => `${formatNumber(Math.abs(Number(value || 0)), 2)} ${getFiatLabel(tx)}`;

const renderReceiversDetail = (receivers = []) => {
    if (!receivers.length) return '';
    const sorted = [...receivers].sort((a, b) => Number(b?.pendingUsdt || 0) - Number(a?.pendingUsdt || 0));
    const rows = sorted.map((r) => {
        const alias = escapeHtml(r.receiverOperatorAlias || r.receiverLabel || 'Desconocido');
        const promised = Number(r.promisedUsdt || 0);
        const pending = Number(r.pendingUsdt || 0);
        const recovered = Number(r.recoveredUsdtLocal || 0);
        const coverage = Number(r.localCoveragePercent || 0);
        const active = Number(r.activePromises || 0);
        const pendingFiat = Number(r.pendingFiat || 0);
        const isFulfilled = pending < 0.01;
        const barPct = promised > 0 ? Math.min(100, ((promised - pending) / promised) * 100) : 0;
        const statusClass = isFulfilled ? 'dispersor-fulfilled' : pending > promised * 0.5 ? 'dispersor-critical' : 'dispersor-partial';
        return `
            <div class="dispersor-receiver-row ${statusClass}">
                <div class="dispersor-receiver-identity">
                    <span class="dispersor-receiver-avatar">${escapeHtml(alias.charAt(0).toUpperCase())}</span>
                    <div class="dispersor-receiver-info">
                        <span class="dispersor-receiver-name">${alias}</span>
                        <span class="dispersor-receiver-meta">${active} promesa${active !== 1 ? 's' : ''} activa${active !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div class="dispersor-receiver-amounts">
                    <div class="dispersor-receiver-line">
                        <span class="dispersor-receiver-label">Prometido</span>
                        <span class="dispersor-receiver-value">${formatNumber(promised, 2, 'en-US')} USDT</span>
                    </div>
                    <div class="dispersor-receiver-line">
                        <span class="dispersor-receiver-label">Recuperado</span>
                        <span class="dispersor-receiver-value dispersor-value-recovered">${formatNumber(recovered, 2, 'en-US')} USDT</span>
                    </div>
                    <div class="dispersor-receiver-line">
                        <span class="dispersor-receiver-label">Pendiente</span>
                        <span class="dispersor-receiver-value ${isFulfilled ? 'dispersor-value-ok' : 'dispersor-value-pending'}">${isFulfilled ? 'Cubierto' : `${formatNumber(pending, 2, 'en-US')} USDT`}</span>
                    </div>
                    <div class="dispersor-receiver-bar-wrap">
                        <div class="dispersor-receiver-bar" style="width:${barPct.toFixed(1)}%"></div>
                    </div>
                </div>
            </div>`;
    }).join('');
    return `<div class="dispersor-receivers-panel" id="dispersor-receivers-panel" style="display:none">
        <div class="dispersor-receivers-header">
            <span class="dispersor-receivers-title">Desglose por dispersor</span>
            <span class="dispersor-receivers-count">${sorted.length} dispersor${sorted.length !== 1 ? 'es' : ''}</span>
        </div>
        <div class="dispersor-receivers-list">${rows}</div>
    </div>`;
};

const renderMetricCard = ({ label, value, sub = '', sub2 = '', tone = '' }) => `
    <div class="ledger-metric-card ${tone}">
        <span class="ledger-metric-label">${escapeHtml(label)}</span>
        <span class="ledger-metric-value">${escapeHtml(value)}</span>
        <span class="ledger-metric-sub">${escapeHtml(sub)}</span>
        ${sub2 ? `<span class="ledger-metric-sub ledger-metric-sub-secondary">${escapeHtml(sub2)}</span>` : ''}
    </div>
`;

const renderPromiseColumnMeta = (tx) => {
    const promiseMeta = getPromiseMeta(tx);
    if (!promiseMeta) {
        // Liquidaciones: mostrar "Promesa pagada" con el monto de la tx.
        if (isSettlementTransfer(tx)) {
            const paidUsdt = Math.abs(toFiniteNumber(tx?.amount));
            return renderMetricCard({
                label: 'Promesa pagada',
                value: paidUsdt > 0 ? formatPromiseUsdt(paidUsdt) : '--',
                sub: 'Liquidación registrada',
                tone: 'ledger-metric-promise'
            });
        }
        return renderMetricCard({
            label: 'Promesa',
            value: '--',
            sub: 'Sin promesa activa',
            tone: 'ledger-metric-muted'
        });
    }

    const isInternalCoverage = promiseMeta.isReceiver
        && Boolean(tx?.isInternalCounterparty || tx?.internalCounterpartyAlias);

    if (String(tx?.type || '').toUpperCase() === 'DISPERSOR_PENDING') {
        const localSummary = promiseMeta.actualUsdt > 0.009
            ? `Local ${formatPromiseUsdt(promiseMeta.actualUsdt)}`
            : 'Sin cobertura local';
        const pendingSummary = promiseMeta.pendingUsdt > 0.009
            ? `Pendiente ${formatPromiseUsdt(promiseMeta.pendingUsdt)}`
            : 'Cobertura completa';

        return renderMetricCard({
            label: 'Promesa total',
            value: formatPromiseUsdt(promiseMeta.promiseUsdt),
            sub: formatPromiseFiat(promiseMeta.promisedFiat, tx),
            sub2: `${localSummary} | ${pendingSummary}`,
            tone: 'ledger-metric-promise'
        });
    }

    if (isInternalCoverage) {
        const internalAlias = String(tx?.internalCounterpartyAlias || tx?.counterpartyName || '').trim();
        const coverageSummary = promiseMeta.pendingUsdt > 0.009
            ? `Pendiente ${formatPromiseUsdt(promiseMeta.pendingUsdt)}`
            : 'Cobertura registrada';
        const actorSummary = internalAlias ? `Equipo ${internalAlias}` : 'Equipo interno';

        return renderMetricCard({
            label: 'Cobertura interna',
            value: formatPromiseUsdt(promiseMeta.promiseUsdt),
            sub: formatPromiseFiat(promiseMeta.promisedFiat, tx),
            sub2: `${actorSummary} | ${coverageSummary}`,
            tone: 'ledger-metric-warning'
        });
    }

    const promiseLabel = promiseMeta.isReceiver ? 'Promesa recibida' : 'Promesa';
    const promiseVes = formatPromiseFiat(promiseMeta.promisedFiat, tx);
    const pendingSummary = promiseMeta.isReceiver
        ? (promiseMeta.pendingUsdt > 0.009
            ? `Pendiente ${formatPromiseUsdt(promiseMeta.pendingUsdt)}`
            : 'Promesa cubierta')
        : formatPromiseFiat(promiseMeta.promisedFiat, tx);

    return renderMetricCard({
        label: promiseLabel,
        value: formatPromiseUsdt(promiseMeta.promiseUsdt),
        sub: promiseVes,
        sub2: promiseMeta.isReceiver ? pendingSummary : '',
        tone: promiseMeta.isReceiver ? 'ledger-metric-warning' : 'ledger-metric-promise'
    });
};

const getElements = () => ({
    panel: document.getElementById('balance-ledger-panel'),
    body: document.getElementById('balance-ledger-body'),
    count: document.getElementById('balance-ledger-count'),
    results: document.getElementById('balance-ledger-results'),
    pageIndicator: document.getElementById('balance-ledger-page-indicator'),
    prevBtn: document.getElementById('balance-ledger-prev'),
    nextBtn: document.getElementById('balance-ledger-next'),
    scroll: document.getElementById('balance-ledger-scroll'),
    searchInput: document.getElementById('balance-ledger-search'),
    typeFilters: Array.from(document.querySelectorAll('[data-ledger-type]')),
});

const sanitizeDateValue = (value) => {
    const trimmed = String(value ?? '').trim();
    return trimmed || undefined;
};

const isSameRange = (a = {}, b = {}) => sanitizeDateValue(a?.from) === sanitizeDateValue(b?.from)
    && sanitizeDateValue(a?.to) === sanitizeDateValue(b?.to);

const buildTransfersUrl = (apiBase, range = {}, page = 1, limit = 12, includeChannels = true) => {
    const params = new URLSearchParams();
    const from = sanitizeDateValue(range?.from);
    const to = sanitizeDateValue(range?.to);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (includeChannels) {
        params.set('channels', getRequestedChannels().join(','));
    }
    params.set('_ts', String(Date.now()));
    return `${String(apiBase || '').replace(/\/+$/, '')}/api/transfers?${params.toString()}`;
};

const getEffectiveSearchTerm = () => {
    const { searchInput } = getElements();
    const liveValue = String(searchInput?.value || '').trim();
    if (liveValue) return liveValue;
    return String(state.searchTerm || '').trim();
};

const hasActiveSearch = () => Boolean(getEffectiveSearchTerm());

const areAllPagesCached = () => {
    if (state.totalPages <= 0) return false;
    for (let page = 1; page <= state.totalPages; page += 1) {
        if (!state.prefetchedPages.has(page)) return false;
    }
    return true;
};

const updatePaginationUI = () => {
    const { results, pageIndicator, prevBtn, nextBtn } = getElements();
    const searchActive = hasActiveSearch();

    if (results) {
        if (searchActive && state.searchPending) {
            results.textContent = 'Buscando...';
        } else {
            const resultsValue = searchActive ? state.searchResultCount : state.total;
            results.textContent = `${resultsValue} Resultados`;
        }
    }

    if (pageIndicator) {
        if (searchActive && state.searchPending) {
            pageIndicator.textContent = 'Buscando en todo el rango';
        } else if (searchActive) {
            pageIndicator.textContent = 'Busqueda global';
        } else {
            pageIndicator.textContent = `Pagina ${state.totalPages ? state.page : 0} / ${state.totalPages}`;
        }
    }

    if (prevBtn) prevBtn.disabled = searchActive || state.page <= 1 || state.totalPages === 0;
    if (nextBtn) nextBtn.disabled = searchActive || state.page >= state.totalPages || state.totalPages === 0;
};

const updateTypeFilterUI = () => {
    const { typeFilters } = getElements();
    typeFilters.forEach((button) => {
        const buttonType = String(button?.dataset?.ledgerType || '').toUpperCase();
        button.classList.toggle('is-active', buttonType === state.typeFilter);
        button.setAttribute('aria-pressed', buttonType === state.typeFilter ? 'true' : 'false');
    });
};

const renderPlaceholder = (message, toneClass = 'text-white') => {
    const { body } = getElements();
    if (!body) return;
    body.innerHTML = `
        <div class="px-4 py-10 text-center text-[15px] font-medium ${toneClass} md:px-6">
            ${escapeHtml(message)}
        </div>
    `;
};

const renderLoading = () => {
    const { count } = getElements();
    if (count) count.textContent = `Cargando pagina ${state.page}...`;
    renderPlaceholder('Cargando historial...');
};

const renderError = (message) => {
    const { count } = getElements();
    if (count) count.textContent = 'No se pudo cargar el historial';
    state.total = 0;
    state.totalPages = 0;
    state.closingBalance = null;
    updatePaginationUI();
    renderPlaceholder(message, 'text-rose-300');
};

const renderEmpty = () => {
    const { count } = getElements();
    if (count) count.textContent = 'Sin movimientos en el rango actual';
    state.total = 0;
    state.totalPages = 0;
    state.currentTransfers = [];
    updatePaginationUI();
    renderPlaceholder('Sin movimientos para el rango seleccionado.');
};

const matchesSearch = (tx, searchTerm) => {
    const needle = String(searchTerm || '').trim().toLowerCase();
    if (!needle) return true;

    const haystack = [
        tx?.counterpartyName,
        tx?.paymentMethod,
        tx?.notes,
        tx?.orderNumber,
        tx?.txHash,
        tx?.binanceRawId,
        tx?.type,
        tx?.fiatCurrency,
        formatRate(tx?.exchangeRate),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return haystack.includes(needle);
};

const getCachedScopedTransfers = () => Array.from(state.transfersCache.values())
    .sort((a, b) => getTxTimestampMs(b) - getTxTimestampMs(a))
    .filter((tx) => isLedgerChannelAllowed(tx));

const buildRowsWithBalance = (transfers = []) => {
    let rows = Array.isArray(transfers) ? [...transfers] : [];

    if (state.page === 1) {
        const dispersor = state.kpis?.judge?.dispersor || state.kpis?.dispersor;
        const pendingUsdt = Number(dispersor?.pendingUsdt || 0);
        const promisedUsdt = Number(dispersor?.promisedUsdt || 0);
        const activePromises = Number(dispersor?.activePromises || 0);

        if (promisedUsdt > 0 || activePromises > 0) {
            const pendingFiat = Number(dispersor?.pendingFiat || 0);
            const recoveredUsdt = Number(dispersor?.recoveredUsdtLocal || 0);
            const recoveredFiat = Number(dispersor?.recoveredFiatLocal || 0);
            const promisedFiat = Number(dispersor?.promisedFiat || 0);

            const syntheticTx = {
                id: 'synthetic-dispersor',
                timestamp: Date.now(),
                type: 'DISPERSOR_PENDING',
                amount: 0,
                asset: 'USDT',
                fiatAmount: 0,
                fiatCurrency: 'VES',
                status: 'PENDING',
                counterpartyName: 'Cobertura local consolidada',
                notes: 'Parseo 2.0 integrado al balance general.',
                paymentMethod: 'BALANCE GENERAL',
                syntheticPromiseMeta: {
                    isReceiver: true,
                    promiseUsdt: promisedUsdt,
                    promisedFiat: promisedFiat > 0 ? promisedFiat : (pendingFiat + recoveredFiat),
                    actualUsdt: recoveredUsdt,
                    actualFiat: recoveredFiat,
                    pendingUsdt: pendingUsdt,
                    pendingFiat: pendingFiat,
                    receivers: Array.isArray(dispersor?.receivers) ? dispersor.receivers : []
                }
            };
            rows.unshift(syntheticTx);
        }
    }
    rows = rows.filter((tx) => isLedgerChannelAllowed(tx));

    const pageNet = rows.reduce((sum, tx) => sum + getSignedAmount(tx), 0);
    state.pageNetByPage.set(state.page, pageNet);

    const anchorBalance = getLedgerAnchorBalance(state.kpis);
    const knownNetBefore = getKnownNetBeforePage(state.page);
    let runningBalance = anchorBalance - Number(knownNetBefore || 0);

    return rows.map((tx) => {
        const row = {
            tx,
            balance: runningBalance,
        };
        runningBalance -= getSignedAmount(tx);
        return row;
    });
};

const buildRowsWithRangeBalance = (transfers = []) => {
    const rows = Array.isArray(transfers)
        ? [...transfers].sort((a, b) => getTxTimestampMs(b) - getTxTimestampMs(a))
        : [];

    let runningBalance = getLedgerAnchorBalance(state.kpis);

    return rows.map((tx) => {
        const row = {
            tx,
            balance: runningBalance,
        };
        runningBalance -= getSignedAmount(tx);
        return row;
    });
};

const normalizeBankKey = (value) => {
    const raw = String(value || '').toLowerCase().trim();
    if (!raw) return '';
    if (raw.includes('pago') || raw.includes('movil')) return '';
    if (raw.includes('bbva') || raw.includes('provincial')) return 'provincial';
    if (raw.includes('mercantil')) return 'mercantil';
    if (raw.includes('banesco')) return 'banesco';
    if (raw.includes('bancamiga')) return 'bancamiga';
    if (raw === 'bank' || raw.includes('fintech')) return 'bank';
    if (raw.includes('bnc')) return 'bnc';
    return raw.replace(/\s+/g, '');
};

const matchTxToBank = (tx) => {
    const txBankKey = normalizeBankKey(tx?.bankName || tx?.bank || tx?.paymentMethod);
    if (!txBankKey || !state.bankData.length) return null;

    return state.bankData.find((bank) => {
        const bankKey = normalizeBankKey(bank?.bank || bank?.bankName);
        if (!bankKey) return false;
        return bankKey === txBankKey || txBankKey.includes(bankKey) || bankKey.includes(txBankKey);
    }) || null;
};

const getBankPromiseRate = (bank = {}) => {
    const promisedUsdt = Number(bank?.rangePromisedUsdt || 0);
    const promisedFiat = Number(bank?.rangePromisedFiat || 0);
    if (promisedUsdt <= 0 || promisedFiat <= 0) return 0;
    return promisedFiat / promisedUsdt;
};


const getWeightedSellReferenceRateFromBanks = () => {
    if (!Array.isArray(state.bankData) || state.bankData.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    state.bankData.forEach((bank) => {
        const rate = [
            Number(bank?.lastSellRate || 0),
            Number(bank?.sellRate || 0),
            Number(bank?.avgSellRate || 0),
            Number(bank?.weightedAvgSellRate || 0),
            Number(bank?.ceilingRate || 0),
            getBankPromiseRate(bank),
        ].find((value) => value > 0) || 0;

        if (rate <= 0) return;

        const weight = [
            Number(bank?.sellVolUSDT || 0),
            Number(bank?.realizedVolumeUSDT || 0),
            Number(bank?.spreadSellUsdt || 0),
            Number(bank?.rangePromisedUsdt || 0),
        ].find((value) => value > 0) || 1;

        weightedSum += rate * weight;
        totalWeight += weight;
    });

    if (totalWeight <= 0) return 0;
    return weightedSum / totalWeight;
};

// Weighted average rate from the current page's transactions (buy or sell).
const getPageAvgRate = (typesToMatch) => {
    if (!state.currentTransfers?.length) return 0;
    let weightedSum = 0;
    let totalAmount = 0;

    for (const tx of state.currentTransfers) {
        const type = normalizeTxType(tx);
        if (!typesToMatch.includes(type)) continue;

        const rate = getTxRate(tx);
        if (rate <= 0) continue;

        const amount = getTxUsdtVolume(tx);
        if (amount <= 0) continue;

        weightedSum += rate * amount;
        totalAmount += amount;
    }

    return totalAmount > 0 ? weightedSum / totalAmount : 0;
};

const getPageAvgRateForBank = (typesToMatch, txToMatch) => {
    const bankKey = normalizeBankKey(txToMatch?.bankName || txToMatch?.bank || txToMatch?.paymentMethod);
    if (!bankKey) return 0;
    if (!state.currentTransfers?.length) return 0;

    let weightedSum = 0;
    let totalAmount = 0;

    for (const tx of state.currentTransfers) {
        const type = normalizeTxType(tx);
        if (!typesToMatch.includes(type)) continue;

        const txBankKey = normalizeBankKey(tx?.bankName || tx?.bank || tx?.paymentMethod);
        if (!txBankKey) continue;
        if (!(txBankKey === bankKey || txBankKey.includes(bankKey) || bankKey.includes(txBankKey))) continue;

        const rate = getTxRate(tx);
        if (rate <= 0) continue;

        const amount = getTxUsdtVolume(tx);
        if (amount <= 0) continue;

        weightedSum += rate * amount;
        totalAmount += amount;
    }

    return totalAmount > 0 ? weightedSum / totalAmount : 0;
};

const getAvgTakerSellFeeForBank = (txToMatch) => {
    const bankKey = normalizeBankKey(txToMatch?.bankName || txToMatch?.bank || txToMatch?.paymentMethod);
    if (!bankKey || !state.currentTransfers?.length) return 0;

    let feeSum = 0;
    let count = 0;

    for (const tx of state.currentTransfers) {
        if (!isLedgerSellTarget(tx)) continue;

        const role = getTxDisplayRole(tx);
        if (role && role !== 'TAKER') continue;

        const txBankKey = normalizeBankKey(tx?.bankName || tx?.bank || tx?.paymentMethod);
        if (!txBankKey) continue;
        if (!(txBankKey === bankKey || txBankKey.includes(bankKey) || bankKey.includes(txBankKey))) continue;

        const fee = toFiniteNumber(tx?.fee);
        const feeCurrency = String(tx?.feeCurrency || '').toUpperCase();
        if (!(fee > 0 && (!feeCurrency || feeCurrency === 'USDT'))) continue;

        feeSum += fee;
        count += 1;
    }

    return count > 0 ? feeSum / count : 0;
};

const BANK_GENERIC_PAIRING_WINDOW_MS = 30 * 60 * 1000; // 30 min strict window for generic BANK

const getNearestSellForBuy = (buyTx) => {
    // Search the full cache (all visited pages) so sells on page 2 are found when browsing page 1.
    const searchPool = state.transfersCache.size > 0
        ? Array.from(state.transfersCache.values())
        : state.currentTransfers;
    if (!searchPool?.length) return null;
    const buyBankKey = normalizeBankKey(buyTx?.bankName || buyTx?.bank || buyTx?.paymentMethod);
    if (!buyBankKey) return null;
    const isGenericBank = buyBankKey === 'bank';

    const buyTs = new Date(buyTx?.timestamp || 0).getTime();
    if (!Number.isFinite(buyTs) || buyTs <= 0) return null;

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const tx of searchPool) {
        if (tx === buyTx) continue;
        if (!isLedgerSellTarget(tx)) continue;

        const role = getTxDisplayRole(tx);

        const sellBankKey = normalizeBankKey(tx?.bankName || tx?.bank || tx?.paymentMethod);
        if (!sellBankKey) continue;
        if (!(sellBankKey === buyBankKey || sellBankKey.includes(buyBankKey) || buyBankKey.includes(sellBankKey))) continue;

        const rate = getTxRate(tx);
        if (rate <= 0) continue;

        const fee = toFiniteNumber(tx?.fee);
        const feeCurrency = String(tx?.feeCurrency || '').toUpperCase();
        const effectiveFee = fee > 0 && (!feeCurrency || feeCurrency === 'USDT') ? fee : 0;

        const sellTs = new Date(tx?.timestamp || 0).getTime();
        if (!Number.isFinite(sellTs) || sellTs <= 0) continue;

        // For generic BANK label enforce a strict time window to avoid false pairings.
        if (isGenericBank && Math.abs(buyTs - sellTs) > BANK_GENERIC_PAIRING_WINDOW_MS) continue;

        // Prefer nearest previous sell; if none, nearest absolute.
        const isPrevious = sellTs <= buyTs;
        const delta = Math.abs(buyTs - sellTs);
        const score = (isPrevious ? 0 : 1_000_000_000_000) + delta;

        if (score < bestScore) {
            bestScore = score;
            const amount = getTxUsdtVolume(tx);
            best = {
                rate,
                fee: effectiveFee,
                role: role || '',
                amount,
                isPromise: Boolean(getPromiseMeta(tx)?.promiseUsdt > 0),
                tx,
                key: getTransferKey(tx),
                timestampMs: sellTs,
                fiatAmount: resolveFiatAmount(tx),
            };
        }
    }

    return best;
};

// Like getNearestSellForBuy but skips the bank-key restriction.
// Used ONLY to infer the sell role when bank matching was skipped (e.g. generic 'BANK').
// Never used for rate — rate comes from getPageAvgRateForBank / getPageAvgRate.
const MAX_SELL_ROLE_LOOKUP_MS = 4 * 60 * 60 * 1000; // 4h window
const getNearestSellRoleForBuy = (buyTx) => {
    // Search the full cache (all visited pages) so sells on page 2 are found when browsing page 1.
    const searchPool = state.transfersCache.size > 0
        ? Array.from(state.transfersCache.values())
        : state.currentTransfers;
    if (!searchPool?.length) return null;
    const buyTs = new Date(buyTx?.timestamp || 0).getTime();
    if (!Number.isFinite(buyTs) || buyTs <= 0) return null;

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const tx of searchPool) {
        if (tx === buyTx) continue;
        if (!isLedgerSellTarget(tx)) continue;

        const sellTs = new Date(tx?.timestamp || 0).getTime();
        if (!Number.isFinite(sellTs) || sellTs <= 0) continue;

        const delta = Math.abs(buyTs - sellTs);
        if (delta > MAX_SELL_ROLE_LOOKUP_MS) continue;

        const isPrevious = sellTs <= buyTs;
        const score = (isPrevious ? 0 : 1_000_000_000_000) + delta;

        if (score < bestScore) {
            bestScore = score;
            const role = getTxDisplayRole(tx);
            const fee = toFiniteNumber(tx?.fee);
            const feeCurrency = String(tx?.feeCurrency || '').toUpperCase();
            best = {
                role: role || '',
                fee: fee > 0 && (!feeCurrency || feeCurrency === 'USDT') ? fee : 0,
                amount: getTxUsdtVolume(tx),
                isPromise: Boolean(getPromiseMeta(tx)?.promiseUsdt > 0),
            };
        }
    }

    return best;
};

const inferMakerTakerRole = ({ explicitRole = '', fee = 0, amount = 0 } = {}) => {
    const role = String(explicitRole || '').toUpperCase().trim();
    if (role === 'MAKER' || role === 'TAKER') return role;

    const feeNum = Math.abs(Number(fee || 0));
    const amountNum = Math.abs(Number(amount || 0));
    const makerFeeRate = Number(state.kpis?.config?.verificationPercent || 0) / 100;

    if (feeNum > 0 && amountNum > 0) {
        // If fee roughly matches maker percentage fee, classify as MAKER; otherwise TAKER.
        const expectedMakerFee = amountNum * makerFeeRate;
        if (expectedMakerFee > 0) {
            const relativeDiff = Math.abs(feeNum - expectedMakerFee) / expectedMakerFee;
            if (relativeDiff <= 0.2) return 'MAKER';
        }
        return 'TAKER';
    }

    return makerFeeRate > 0 ? 'MAKER' : '';
};

const buildSpreadSellSnapshot = (tx = {}, options = {}) => {
    const settings = typeof options === 'number'
        ? { remainingFiat: options }
        : (options || {});
    const remainingFiat = Number(settings.remainingFiat || 0);
    const consumedFiat = Number(settings.consumedFiat || 0);
    const counterparty = String(buildDescriptionTop(tx) || 'Venta sin detalle').trim();
    const paymentMethod = String(tx?.paymentMethod || tx?.bankName || tx?.bank || '').trim().toUpperCase();
    const orderNumber = String(tx?.orderNumber || '').trim();
    const rate = getTxRate(tx);
    const fiatAmount = resolveFiatAmount(tx);
    const usdtAmount = getTxUsdtVolume(tx);
    const role = inferMakerTakerRole({
        explicitRole: getTxDisplayRole(tx),
        fee: toFiniteNumber(tx?.fee),
        amount: Math.abs(Number(tx?.amount || 0)),
    });

    return {
        key: getTransferKey(tx),
        counterparty,
        paymentMethod,
        orderNumber,
        timestampLabel: formatPostingDate(tx?.timestamp),
        rate,
        fiatAmount,
        remainingFiat: remainingFiat > 0 ? remainingFiat : fiatAmount,
        consumedFiat: consumedFiat > 0 ? consumedFiat : 0,
        usdtAmount,
        role,
    };
};

const buildJudgeSellContextFromVerdict = (verdict = {}, existing = {}) => {
    const saleRate = Number(verdict?.saleRate || 0);
    if (!(saleRate > 0)) return existing || null;

    const saleTransferKey = String(verdict?.saleTransferId || verdict?.saleId || '').trim();
    const saleTx = saleTransferKey ? state.transfersCache.get(saleTransferKey) : null;
    const explicitRole = String(verdict?.advertisementRole || '').trim().toUpperCase();
    const resolvedRole = explicitRole === 'MAKER' || explicitRole === 'TAKER'
        ? explicitRole
        : getTxDisplayRole(saleTx || {});
    const saleFee = toFiniteNumber(saleTx?.fee);
    const saleFeeCurrency = String(saleTx?.feeCurrency || '').toUpperCase();

    return {
        ...(existing || {}),
        rateOverride: saleRate,
        sellContextOverride: {
            rate: saleRate,
            role: resolvedRole || '',
            fee: saleFee > 0 && (!saleFeeCurrency || saleFeeCurrency === 'USDT') ? saleFee : 0,
            amount: Number(verdict?.saleAmount || 0) > 0
                ? Number(verdict.saleAmount)
                : getTxUsdtVolume(saleTx || {}),
            isPromise: Boolean(Number(verdict?.expectedRebuyUsdt || 0) > 0),
            forceSellRole: resolvedRole === 'MAKER' || resolvedRole === 'TAKER',
        },
        ...(saleTx
            ? {
                spreadReference: {
                    mode: 'single',
                    rate: saleRate,
                    sells: [buildSpreadSellSnapshot(saleTx)],
                },
            }
            : {}),
    };
};


const getFallbackSellReferenceRate = () => {
    const directCandidates = [
        state.kpis?.bankSummary?.referenceSellRate,
        state.kpis?.bankSummary?.generalSellRate,
        state.kpis?.operations?.weightedAvgSellRate,
        state.kpis?.rates?.sellRate,
        state.kpis?.rates?.sell,
        state.kpis?.bankSummary?.generalCeilingRate,
    ];

    for (const candidate of directCandidates) {
        const n = Number(candidate || 0);
        if (n > 0) return n;
    }

    // Compute from the current page's actual sell transactions.
    const pageRate = getPageAvgRate(['P2P_SELL']);
    if (pageRate > 0) return pageRate;

    const bankRate = getWeightedSellReferenceRateFromBanks();
    if (bankRate > 0) return bankRate;

    // breakEvenRate as absolute last resort for sell reference is acceptable
    // (underestimates buy spread rather than inverting sell spread).
    return Number(state.kpis?.critical?.breakEvenRate || 0);
};

const getFallbackSpreadPercent = () => {
    const candidates = [
        state.kpis?.bankSummary?.spreadPercent,
        state.kpis?.critical?.globalMarginPercent,
        state.kpis?.metrics?.globalMarginPct,
    ];

    for (const candidate of candidates) {
        const n = Number(candidate || 0);
        if (n !== 0 && Number.isFinite(n)) return n;
    }

    return 0;
};

const computeTxSpread = (tx = {}, override = 0) => {
    const type = normalizeTxType(tx);
    if (isLedgerSellTarget(tx)) return 0; // Ventas y promesas no muestran spread individual
    if (type !== 'P2P_BUY') return 0;

    // Monto neto recibido en la compra (getSignedAmount ya descuenta el fee)
    const buyUsdtIn = getSignedAmount(tx);
    if (buyUsdtIn <= 0) return 0;

    const nearestSell = getNearestSellForBuy(tx);
    const hasStructuredOverride = override && typeof override === 'object';
    const overrideContext = hasStructuredOverride ? override : null;
    const overrideRate = hasStructuredOverride
        ? Number(overrideContext?.rate || overrideContext?.rateOverride || 0)
        : Number(override || 0);

    // Si no hay una venta pairable en la página actual (p.ej. la página 1 tiene compras
    // cuyas ventas correspondientes están en la página 2), usamos la tasa de referencia
    // global del KPI para estimar igualmente el spread en vez de devolver 0.
    let sellRate, sellRoleSource, sellFeeSource, sellAmountSource, sellIsPromise = false, forceSellRole = false;
    if (overrideRate > 0) {
        // Cuando el ciclo ya resolvió qué venta(s) consumió este BUY, respetamos
        // esa referencia exacta. Si fue una sola venta, también heredamos su rol.
        sellRate = overrideRate;
        sellRoleSource = overrideContext?.role || nearestSell?.role || '';
        sellFeeSource = Number(overrideContext?.fee || 0) || nearestSell?.fee || 0;
        sellAmountSource = Number(overrideContext?.amount || 0) || nearestSell?.amount || buyUsdtIn;
        sellIsPromise = Boolean(overrideContext?.isPromise ?? nearestSell?.isPromise);
        forceSellRole = Boolean(overrideContext?.forceSellRole);
    } else if (nearestSell && nearestSell.rate > 0) {
        sellRate = nearestSell.rate;
        sellRoleSource = nearestSell.role;
        sellFeeSource = nearestSell.fee;
        sellAmountSource = nearestSell.amount;
        sellIsPromise = Boolean(nearestSell.isPromise);
    } else {
        sellRate = getFallbackSellReferenceRate();
        if (sellRate <= 0) return 0;

        // Intentar inferir el rol desde la venta más cercana sin restricción de banco.
        const nearestSellRole = getNearestSellRoleForBuy(tx);
        sellRoleSource = nearestSellRole?.role || '';
        sellFeeSource = nearestSellRole?.fee || 0;
        sellAmountSource = nearestSellRole?.amount || buyUsdtIn;
        sellIsPromise = Boolean(nearestSellRole?.isPromise);
    }

    // Fórmula de venta: se usan los VES de la COMPRA divididos por la tasa de la venta.
    // Así comparamos el mismo volumen fiat: cuánto costó comprarlo vs cuánto costaría venderlo.
    const buyFiat = resolveFiatAmount(tx);
    const sellGross = buyFiat > 0
        ? buyFiat / sellRate
        : sellAmountSource; // fallback si no hay fiat en la compra

    // Las promesas y los BUYs ya enlazados a una venta consumida específica
    // deben usar el rol de la VENTA. Fuera de eso mantenemos el comportamiento
    // previo y usamos el rol del BUY como referencia principal.
    const buyRole = inferMakerTakerRole({
        explicitRole: tx?.advertisementRole,
        fee: toFiniteNumber(tx?.fee),
        amount: Math.abs(Number(tx?.amount || 0)),
    });
    const inferredSellRole = inferMakerTakerRole({
        explicitRole: sellRoleSource,
        fee: sellFeeSource,
        amount: sellAmountSource,
    });
    const effectiveSellRole = (sellIsPromise || forceSellRole)
        ? inferredSellRole
        : (buyRole === 'MAKER' || buyRole === 'TAKER' ? buyRole : inferredSellRole);

    const makerFeeRate = Number(state.kpis?.config?.verificationPercent || 0) / 100;
    // sellFee solo aplica en la rama TAKER (fórmula a). La rama MAKER usa makerFeeRate,
    // no sellFeeSource, por lo que tomar el fee de la venta pareada (que puede ser MAKER = 0.02)
    // generaba un cálculo incorrecto cuando el BUY es TAKER.
    const sellFee = 0.06;

    // Fórmula a (TAKER):  VES/rate + fee
    // Fórmula b (MAKER):  VES/rate  (sin ajuste de comisión)
    const sellUsdtOut = effectiveSellRole === 'TAKER'
        ? sellGross + sellFee
        : sellGross;

    // Spread = monto neto compra − costo total venta
    return buyUsdtIn - sellUsdtOut;
};

// Cobertura basada en recuperación de bolívares:
// Cada P2P_SELL / PAY_SENT prometido conserva su propio avance de cobertura.
// Los P2P_BUY posteriores consumen los VES pendientes en orden cronológico (FIFO).
// Si hay varias ventas abiertas a la vez, el BUY puede seguir usando una referencia
// ponderada combinada para su spread, pero sin sobrescribir el progreso individual
// de cada venta. Esto evita que varias coberturas terminen mostrando el mismo valor.
// Si el gap entre ventas consecutivas supera CYCLE_MAX_SELL_GAP_MS, se cierran como
// incompletas para evitar que páginas históricas prefetcheadas contaminen ventas recientes.
// Returns Map<txKey, { complete, totalSellFiat, recoveredFiat, recoveredPct, rateOverride?, spreadReference? }>.
const CYCLE_MAX_SELL_GAP_MS = 6 * 60 * 60 * 1000; // 6 horas
const computeCycleSpreads = (transfers) => {
    const result = new Map();
    let openSells = [];
    let lastSellTs = 0;

    const upsertSellCoverage = (entry, forceComplete = null) => {
        const totalSellFiat = Number(entry?.totalSellFiat || 0);
        const recoveredFiat = Math.min(totalSellFiat, Math.max(0, Number(entry?.recoveredFiat || 0)));
        const remainingFiat = Math.max(0, totalSellFiat - recoveredFiat);
        const complete = forceComplete ?? (remainingFiat <= COVERAGE_COMPLETION_TOLERANCE_FIAT);
        const pct = totalSellFiat > 0
            ? Math.min(100, (recoveredFiat / totalSellFiat) * 100)
            : 0;

        result.set(entry.key, {
            complete,
            totalSellFiat,
            recoveredFiat,
            recoveredPct: pct,
        });
    };

    const closeOpenSells = (forceComplete = false) => {
        for (const entry of openSells) {
            upsertSellCoverage(entry, forceComplete ? true : null);
        }
        openSells = [];
        lastSellTs = 0;
    };

    // Recorrer de más antiguo a más reciente (el array viene newest-first)
    for (let i = transfers.length - 1; i >= 0; i--) {
        const tx = transfers[i];
        const type = normalizeTxType(tx);

        if (isLedgerSellTarget(tx)) {
            // Una venta agrega VES al pool de recuperación (se acumulan).
            // Para PAY_SENT promesa: usar el fiat prometido (rate × usdt), no el
            // fiat real de la micro-activación ($0.01 × rate = 6.63 VES), que es
            // incorrecto para el seguimiento del ciclo (promesa real = 66.300 VES).
            const sellType = normalizeTxType(tx);
            const sellTs = getTxTimestampMs(tx);

            // Si hay un ciclo abierto pero el gap con la última venta es demasiado grande
            // (ej. páginas históricas traídas por el prefetch), cerramos el ciclo anterior
            // antes de iniciar uno nuevo. Esto evita que ventas de días distintos compartan pool.
            if (openSells.length > 0 && lastSellTs > 0 && sellTs > 0) {
                const gap = Math.abs(sellTs - lastSellTs);
                if (gap > CYCLE_MAX_SELL_GAP_MS) {
                    closeOpenSells(false);
                }
            }

            // PAY_SENT promesas NO entran al pool de ciclos P2P.
            // Su volumen VES (tasa × USDT prometido) es órdenes de magnitud mayor que un
            // P2P_SELL y dominaría el rateOverride ponderado → spreads incorrectos.
            // Las promesas PAY tienen su propio seguimiento en la columna PROMESA.
            if (sellType === 'PAY_SENT') continue;

            const sellFiat = resolveFiatAmount(tx);
            if (sellFiat > 0) {
                const key = getTransferKey(tx);
                openSells.push({
                    key,
                    tx,
                    totalSellFiat: sellFiat,
                    recoveredFiat: 0,
                    remainingFiat: sellFiat,
                });
                upsertSellCoverage(openSells[openSells.length - 1], false);
                if (sellTs > 0) lastSellTs = sellTs;
            }
        } else if (type === 'P2P_BUY' && openSells.length > 0) {
            // Una compra consume VES del pool y aporta su spread
            const buyFiat = resolveFiatAmount(tx);
            const consumedSpreadEntries = [];
            let consumedTotalFiat = 0;
            let consumedTotalUsdt = 0;

            if (buyFiat > 0) {
                let remainingBuyFiat = buyFiat;
                for (const entry of openSells) {
                    if (remainingBuyFiat <= COVERAGE_COMPLETION_TOLERANCE_FIAT) break;
                    if (entry.remainingFiat <= COVERAGE_COMPLETION_TOLERANCE_FIAT) continue;

                    const consumedFiat = Math.min(entry.remainingFiat, remainingBuyFiat);
                    const sellRate = getTxRate(entry.tx);
                    if (consumedFiat > COVERAGE_COMPLETION_TOLERANCE_FIAT && sellRate > 0) {
                        consumedTotalFiat += consumedFiat;
                        consumedTotalUsdt += consumedFiat / sellRate;
                        consumedSpreadEntries.push({
                            tx: entry.tx,
                            snapshot: buildSpreadSellSnapshot(entry.tx, { consumedFiat }),
                        });
                    }
                    entry.recoveredFiat += consumedFiat;
                    entry.remainingFiat = Math.max(0, entry.remainingFiat - consumedFiat);
                    remainingBuyFiat = Math.max(0, remainingBuyFiat - consumedFiat);
                    upsertSellCoverage(entry);
                }

                openSells = openSells.filter((entry) => entry.remainingFiat > COVERAGE_COMPLETION_TOLERANCE_FIAT);
            }

            const cycleRateOverride = consumedTotalUsdt > 0
                ? consumedTotalFiat / consumedTotalUsdt
                : 0;
            if (cycleRateOverride > 0) {
                const buyKey = getTransferKey(tx);
                const existing = result.get(buyKey) || {};
                const singleConsumedSell = consumedSpreadEntries.length === 1
                    ? consumedSpreadEntries[0]?.tx
                    : null;
                const singleConsumedFee = toFiniteNumber(singleConsumedSell?.fee);
                const singleConsumedFeeCurrency = String(singleConsumedSell?.feeCurrency || '').toUpperCase();

                result.set(buyKey, {
                    ...existing,
                    rateOverride: cycleRateOverride,
                    sellContextOverride: singleConsumedSell
                        ? {
                            rate: cycleRateOverride,
                            role: getTxDisplayRole(singleConsumedSell),
                            fee: singleConsumedFee > 0 && (!singleConsumedFeeCurrency || singleConsumedFeeCurrency === 'USDT')
                                ? singleConsumedFee
                                : 0,
                            amount: getTxUsdtVolume(singleConsumedSell),
                            isPromise: Boolean(getPromiseMeta(singleConsumedSell)?.promiseUsdt > 0),
                            forceSellRole: true,
                        }
                        : existing.sellContextOverride,
                    spreadReference: consumedSpreadEntries.length > 0
                        ? {
                            mode: consumedSpreadEntries.length > 1 ? 'cycle' : 'single',
                            rate: cycleRateOverride,
                            sells: consumedSpreadEntries.map((entry) => entry.snapshot),
                        }
                        : existing.spreadReference,
                });
            }

            // ¿Se recuperaron todos los VES? → ciclo cerrado
            if (openSells.length === 0) {
                lastSellTs = 0;
            }
        }
        // Compras sin ciclo abierto se ignoran para acumulación de ciclo
        // (siguen mostrando su spread individual en la columna SPREAD)
    }

    // Ciclo abierto restante (ventas sin recuperación completa en esta página)
    if (openSells.length > 0) {
        closeOpenSells(false);
    }

    return result;
};

const getSpreadReferenceMeta = (tx = {}, cycleData = undefined) => {
    if (normalizeTxType(tx) !== 'P2P_BUY') return null;

    const cycleReference = cycleData?.spreadReference;
    if (cycleReference?.sells?.length > 0) {
        return cycleReference;
    }

    const nearestSell = getNearestSellForBuy(tx);
    if (nearestSell?.tx) {
        return {
            mode: 'single',
            rate: nearestSell.rate,
            sells: [buildSpreadSellSnapshot(nearestSell.tx)],
        };
    }

    return null;
};

const renderSpreadReferenceTrigger = (tx = {}, cycleData = undefined) => {
    const reference = getSpreadReferenceMeta(tx, cycleData);
    if (!reference?.sells?.length) return '';

    const visibleSells = reference.sells.slice(0, 3);
    const hiddenCount = Math.max(0, reference.sells.length - visibleSells.length);
    const isCycle = reference.mode === 'cycle' && reference.sells.length > 1;
    const title = isCycle
        ? `Ventas del ciclo (${reference.sells.length})`
        : 'Venta asociada';
    const headRate = reference.rate > 0
        ? `${isCycle ? 'Rate ponderado' : 'Rate'} ${formatNumber(reference.rate, 2)}`
        : 'Rate no disponible';
    const rowsHtml = visibleSells.map((sell) => {
        const metaParts = [];
        if (sell.paymentMethod) metaParts.push(sell.paymentMethod);
        if (sell.orderNumber) metaParts.push(`ORD ${sell.orderNumber}`);
        if (sell.role) metaParts.push(sell.role);
        const secondaryParts = [];
        if (sell.usdtAmount > 0) secondaryParts.push(`${formatNumber(sell.usdtAmount, 2, 'en-US')} USDT`);
        if (sell.fiatAmount > 0) secondaryParts.push(`${formatNumber(sell.fiatAmount, 2)} VES`);
        if (isCycle && sell.consumedFiat > 0) {
            secondaryParts.push(`Usado ${formatNumber(sell.consumedFiat, 2)} VES`);
        } else if (isCycle && sell.remainingFiat > 0 && Math.abs(sell.remainingFiat - sell.fiatAmount) > COVERAGE_COMPLETION_TOLERANCE_FIAT) {
            secondaryParts.push(`Pendiente ${formatNumber(sell.remainingFiat, 2)} VES`);
        }

        return `
            <div class="ledger-spread-tooltip-item">
                <div class="ledger-spread-tooltip-item-head">
                    <span class="ledger-spread-tooltip-name">${escapeHtml(sell.counterparty)}</span>
                    <span class="ledger-spread-tooltip-time">${escapeHtml(sell.timestampLabel)}</span>
                </div>
                ${metaParts.length ? `<div class="ledger-spread-tooltip-meta">${escapeHtml(metaParts.join(' | '))}</div>` : ''}
                <div class="ledger-spread-tooltip-stats">
                    <span>${escapeHtml(secondaryParts.join(' | ') || 'Sin montos visibles')}</span>
                    <span>${escapeHtml(sell.rate > 0 ? `RATE ${formatNumber(sell.rate, 2)}` : 'RATE --')}</span>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="ledger-spread-anchor" data-spread-anchor>
            <button
                type="button"
                class="ledger-spread-link"
                data-spread-toggle
                aria-expanded="false"
                aria-label="${escapeHtml(title)}"
                title="${escapeHtml(title)}"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Z"/>
                    <path d="M6 9.1V15.5c0 1.2 2.7 2.5 6 2.5s6-1.3 6-2.5V9.1"/>
                    <path d="M9 13h6"/>
                </svg>
            </button>
            <div class="ledger-spread-tooltip" role="tooltip">
                <div class="ledger-spread-tooltip-head">
                    <span class="ledger-spread-tooltip-title">${escapeHtml(title)}</span>
                    <span class="ledger-spread-tooltip-rate">${escapeHtml(headRate)}</span>
                </div>
                <div class="ledger-spread-tooltip-list">
                    ${rowsHtml}
                </div>
                ${hiddenCount > 0 ? `<div class="ledger-spread-tooltip-more">+${hiddenCount} venta${hiddenCount === 1 ? '' : 's'} adicional${hiddenCount === 1 ? '' : 'es'}</div>` : ''}
            </div>
        </div>
    `;
};

const closeSpreadTooltips = (root = document) => {
    root.querySelectorAll('[data-spread-anchor].is-open').forEach((anchor) => {
        anchor.classList.remove('is-open');
        const button = anchor.querySelector('[data-spread-toggle]');
        if (button) button.setAttribute('aria-expanded', 'false');
    });
};

const wireSpreadTooltips = (root) => {
    if (!root) return;

    root.querySelectorAll('[data-spread-toggle]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const anchor = button.closest('[data-spread-anchor]');
            if (!anchor) return;

            const willOpen = !anchor.classList.contains('is-open');
            closeSpreadTooltips(document);
            if (willOpen) {
                anchor.classList.add('is-open');
                button.setAttribute('aria-expanded', 'true');
            }
        });
    });

    if (!state.spreadTooltipBound) {
        document.addEventListener('click', (event) => {
            if (event.target.closest('[data-spread-anchor]')) return;
            closeSpreadTooltips(document);
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeSpreadTooltips(document);
        });
        state.spreadTooltipBound = true;
    }
};

const isPromiseVerdict = (verdict = {}) => {
    const parseMode = String(verdict?.parseMode || '').trim().toUpperCase();
    if (parseMode === 'PROMISE' || parseMode === 'GLOBAL_PROMISE') return true;
    return Number(verdict?.expectedRebuyUsdt || 0) > 0 || Number(verdict?.expectedRebuyFiat || 0) > 0;
};

const getVerdictCoverageDateStr = (verdict = {}) => {
    const coverageDate = verdict?.promiseActivatedAt || verdict?.createdAt;
    if (!coverageDate) return null;

    const date = new Date(coverageDate);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-CA', { timeZone: CARACAS_TZ });
};

const updateCoverageBadge = (transfers = [], cycleSpreads = new Map()) => {
    const badge = document.getElementById('balance-ledger-coverage-badge');
    const label = document.getElementById('balance-ledger-coverage-label');
    const tooltip = document.getElementById('balance-ledger-coverage-tooltip');
    if (!badge || !label || !tooltip) return;

    // Build a set of transfer IDs that the judge considers open promises.
    // If judge data is available, only show promises that are genuinely open.
    // This prevents settled/closed promises from persisting in the coverage badge.
    const judgeOpenVerdicts = Array.isArray(state.kpis?.judge?.openVerdicts)
        ? state.kpis.judge.openVerdicts
        : null;

    // Filter to only non-terminal verdicts
    const judgeActiveVerdicts = judgeOpenVerdicts
        ? judgeOpenVerdicts.filter((v) => {
            const s = String(v?.status || '').toUpperCase();
            return !s.startsWith('CLOS') && !s.startsWith('CANCEL') && !s.startsWith('COMPLET');
          })
        : null;

    // Map saleTransferId → verdict for quick lookup in cycle entries
    const verdictBySaleId = judgeActiveVerdicts
        ? new Map(
            judgeActiveVerdicts
                .map((v) => [String(v?.saleTransferId || v?.saleId || ''), v])
                .filter(([k]) => k)
          )
        : null;

    const activeByKey = new Map();

    if (verdictBySaleId !== null) {
        // Judge data available: iterate over open verdicts directly.
        // Filtered to the current date range so sells from other days don't bleed in.
        const rangeFrom = sanitizeDateValue(state.range?.from);
        const rangeTo = sanitizeDateValue(state.range?.to);
        // When no explicit range is set, default to today so yesterday's open cycles
        // don't appear in today's badge with a confusingly "future" sale time.
        const todayDateStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: CARACAS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
        const effectiveFrom = rangeFrom || todayDateStr;
        const effectiveTo = rangeTo || todayDateStr;

        for (const verdict of verdictBySaleId.values()) {
            const isPromise = isPromiseVerdict(verdict);
            const fallbackUsdt = Number(verdict?.saleAmount || 0);
            const fallbackFiat = Number(verdict?.fiatReceived || 0);
            const expectedUsdt = Number(verdict?.expectedRebuyUsdt ?? fallbackUsdt);
            const expectedFiat = Number(verdict?.expectedRebuyFiat ?? fallbackFiat);
            const consumedUsdt = Math.max(0, Number(verdict?.consumedRebuyUsdt || 0));
            const consumedFiat = Math.max(0, Number(verdict?.consumedRebuyFiat || 0));
            const boundedConsumedUsdt = Math.min(consumedUsdt, expectedUsdt);
            const boundedConsumedFiat = Math.min(consumedFiat, expectedFiat);
            const pendingUsdt = Math.max(0, expectedUsdt - boundedConsumedUsdt);
            const pendingFiat = Math.max(0, expectedFiat - boundedConsumedFiat);
            const totalSellFiat = isPromise ? expectedFiat : Number(verdict.fiatReceived || 0);
            const remainingFiat = isPromise ? pendingFiat : Number(verdict.remainingFiat || 0);
            if (isPromise) {
                if (pendingUsdt <= 0.009 && pendingFiat <= COVERAGE_COMPLETION_TOLERANCE_FIAT) continue;
            } else if (remainingFiat <= COVERAGE_COMPLETION_TOLERANCE_FIAT) {
                continue;
            }

            // Restrict to current viewing range
            const verdictDateStr = getVerdictCoverageDateStr(verdict);
            if (verdictDateStr) {
                if (verdictDateStr < effectiveFrom) continue;
                if (verdictDateStr > effectiveTo) continue;
            }

            const key = String(verdict.saleTransferId || verdict.saleId || '');
            if (!key) continue;

            if (isPromise) {
                const actualUsdt = boundedConsumedUsdt;
                const actualFiat = boundedConsumedFiat;
                activeByKey.set(key, {
                    kind: 'promise',
                    name: verdict.counterpartyName || 'Sin nombre',
                    actualUsdt,
                    actualFiat,
                    pendingUsdt,
                    pendingFiat,
                    pct: expectedUsdt > 0 ? Math.min(100, (actualUsdt / expectedUsdt) * 100) : 0,
                    fiatLabel: 'VES',
                });
            } else {
                const recoveredFiat = Math.max(0, totalSellFiat - remainingFiat);
                activeByKey.set(key, {
                    kind: 'cycle',
                    name: verdict.counterpartyName || 'Sin nombre',
                    recoveredFiat,
                    remainingFiat,
                    pct: totalSellFiat > 0 ? Math.min(100, (recoveredFiat / totalSellFiat) * 100) : 0,
                    fiatLabel: 'VES',
                });
            }
        }
    } else {
        // Fallback: no judge data — scan transfer cache for open P2P_SELL cycles and PAY promises
        for (const tx of transfers) {
            const txType = normalizeTxType(tx);
            if (txType === 'PAY_SENT') {
                const promiseMeta = getPromiseMeta(tx);
                if (!promiseMeta) continue;
                if (promiseMeta.pendingUsdt <= 0.009 && promiseMeta.pendingFiat <= COVERAGE_COMPLETION_TOLERANCE_FIAT) continue;

                const key = getTransferKey(tx);
                activeByKey.set(key, {
                    kind: 'promise',
                    name: tx?.counterpartyName || tx?.internalCounterpartyAlias || 'Sin nombre',
                    actualUsdt: Number(promiseMeta.actualUsdt || 0),
                    actualFiat: Number(promiseMeta.actualFiat || 0),
                    pendingUsdt: Number(promiseMeta.pendingUsdt || 0),
                    pendingFiat: Number(promiseMeta.pendingFiat || 0),
                    pct: Number(promiseMeta.promiseUsdt || 0) > 0
                        ? Math.min(100, (Number(promiseMeta.actualUsdt || 0) / Number(promiseMeta.promiseUsdt || 0)) * 100)
                        : 0,
                    fiatLabel: getFiatLabel(tx),
                });
                continue;
            }

            if (txType !== 'P2P_SELL') continue;
            const key = getTransferKey(tx);
            const cycleData = cycleSpreads.get(key);
            if (!cycleData || cycleData.complete) continue;
            const totalSellFiat = Number(cycleData.totalSellFiat || 0);
            const recoveredFiat = Number(cycleData.recoveredFiat || 0);
            const remainingFiat = Math.max(0, totalSellFiat - recoveredFiat);
            if (remainingFiat > COVERAGE_COMPLETION_TOLERANCE_FIAT) {
                activeByKey.set(key, {
                    kind: 'cycle',
                    name: tx?.counterpartyName || tx?.internalCounterpartyAlias || 'Sin nombre',
                    recoveredFiat,
                    remainingFiat,
                    pct: Number(cycleData.recoveredPct || 0),
                    fiatLabel: getFiatLabel(tx),
                });
            }
        }
    }
    const active = Array.from(activeByKey.values());

    if (active.length === 0) {
        badge.style.display = 'none';
        return;
    }

    badge.style.display = '';
    label.textContent = `${active.length} cobertura${active.length !== 1 ? 's' : ''} activa${active.length !== 1 ? 's' : ''}`;
    tooltip.innerHTML = active.map((entry) => {
        if (entry.kind === 'cycle') {
            const complete = entry.remainingFiat <= COVERAGE_COMPLETION_TOLERANCE_FIAT;
            const progressText = formatCoveragePercent(entry.pct, complete);
            return `
        <div class="ledger-coverage-tooltip-item">
            <div class="ledger-coverage-tooltip-head">
                <span class="ledger-coverage-tooltip-name">${escapeHtml(entry.name)}</span>
                <span class="ledger-coverage-tooltip-state ${complete ? 'is-complete' : 'is-active'}">${complete ? 'Completado' : 'En progreso'}</span>
            </div>
            <div class="ledger-coverage-tooltip-stats">
                <div class="ledger-coverage-stat">
                    <span class="ledger-coverage-stat-label">Llevas</span>
                    <span class="ledger-coverage-stat-value">${formatNumber(entry.recoveredFiat, 2)} ${escapeHtml(entry.fiatLabel)}</span>
                </div>
                <div class="ledger-coverage-stat">
                    <span class="ledger-coverage-stat-label">Falta</span>
                    <span class="ledger-coverage-stat-value ${complete ? 'is-complete' : ''}">${complete ? `0,00 ${escapeHtml(entry.fiatLabel)}` : `${formatNumber(entry.remainingFiat, 2)} ${escapeHtml(entry.fiatLabel)}`}</span>
                </div>
                <div class="ledger-coverage-stat ledger-coverage-stat-progress">
                    <span class="ledger-coverage-stat-label">Progreso</span>
                    <span class="ledger-coverage-stat-value">${progressText}</span>
                </div>
            </div>
        </div>`;
        }

        const complete = entry.pendingUsdt <= 0.009;
        const progressText = formatCoveragePercent(entry.pct, complete);
        return `
        <div class="ledger-coverage-tooltip-item">
            <div class="ledger-coverage-tooltip-head">
                <span class="ledger-coverage-tooltip-name">${escapeHtml(entry.name)}</span>
                <span class="ledger-coverage-tooltip-state ${complete ? 'is-complete' : 'is-active'}">${complete ? 'Completado' : 'En progreso'}</span>
            </div>
            <div class="ledger-coverage-tooltip-stats">
                <div class="ledger-coverage-stat">
                    <span class="ledger-coverage-stat-label">Llevas</span>
                    <span class="ledger-coverage-stat-value">${formatPromiseUsdt(entry.actualUsdt)}<small>${formatNumber(entry.actualFiat, 2)} ${escapeHtml(entry.fiatLabel)}</small></span>
                </div>
                <div class="ledger-coverage-stat">
                    <span class="ledger-coverage-stat-label">Falta</span>
                    <span class="ledger-coverage-stat-value ${complete ? 'is-complete' : ''}">${complete ? '0.00 USDT' : formatPromiseUsdt(entry.pendingUsdt)}<small>${complete ? `0,00 ${escapeHtml(entry.fiatLabel)}` : `${formatNumber(entry.pendingFiat, 2)} ${escapeHtml(entry.fiatLabel)}`}</small></span>
                </div>
                <div class="ledger-coverage-stat ledger-coverage-stat-progress">
                    <span class="ledger-coverage-stat-label">Progreso</span>
                    <span class="ledger-coverage-stat-value">${progressText}</span>
                </div>
            </div>
        </div>`;
    }).join('');
};

const renderRow = (tx, rowBalance, cycleData = undefined) => {
    const isSettlement = isSettlementTransfer(tx);
    const category = isSettlement ? 'LIQUID' : getCategory(tx.type);
    const signedAmount = getSignedAmount(tx);
    const amountTone = signedAmount < 0 ? 'ledger-amount-negative' : 'ledger-amount-positive';
    const rowTone = getRowToneClass(category, normalizeTxType(tx));
    const typePillTone = getCategoryChipClass(category);
    const topRaw = buildDescriptionTop(tx);
    const top = escapeHtml(topRaw);
    const meta = buildDescriptionMeta(tx, topRaw);
    const metaHtml = meta.map((line) => {
        if (line.startsWith('__ROLE__')) {
            const role = line.slice('__ROLE__'.length);
            const roleClass = role === 'MAKER' ? 'ledger-meta-chip-maker' : 'ledger-meta-chip-taker';
            return `<span class="ledger-meta-chip ${roleClass}">${escapeHtml(role)}</span>`;
        }
        return `<span class="ledger-meta-chip">${escapeHtml(line)}</span>`;
    }).join('');

    const isCycleSell = isLedgerSellTarget(tx) && cycleData != null;
    const isCycleBuyOverride = normalizeTxType(tx) === 'P2P_BUY' && cycleData?.rateOverride > 0;

    let spreadMetric;
    {
        const spreadValRaw = isCycleBuyOverride
            ? computeTxSpread(tx, cycleData?.sellContextOverride || cycleData.rateOverride)
            : computeTxSpread(tx);
        const spreadVal = truncateTowardZero(spreadValRaw, 2);
        const spreadTone = spreadVal > 0
            ? 'ledger-metric-positive'
            : spreadVal < 0
                ? 'ledger-metric-negative'
                : 'ledger-metric-muted';
        spreadMetric = renderMetricCard({
            label: 'Spread',
            value: spreadVal !== 0 ? `${spreadVal > 0 ? '+' : '-'}${formatUsd(Math.abs(spreadVal))}` : '--',
            sub: spreadVal !== 0 ? '' : 'Sin spread calculable',
            tone: spreadTone
        });
    }
    const promiseMetaForBalance = getPromiseMeta(tx);
    const hasPromiseTooltip = promiseMetaForBalance && promiseMetaForBalance.promiseUsdt > 0;
    let balanceMetric;
    if (hasPromiseTooltip) {
        const senderName = escapeHtml(tx?.counterpartyName || tx?.internalCounterpartyAlias || '--');
        const receiverName = escapeHtml(tx?.internalCounterpartyAlias || tx?.notes || '--');
        balanceMetric = `
    <div class="ledger-metric-card ${rowBalance < 0 ? 'ledger-metric-negative' : 'ledger-metric-balance'} ledger-metric-has-tooltip">
        <span class="ledger-metric-label">Balance</span>
        <span class="ledger-metric-value">${escapeHtml(`${rowBalance < 0 ? '-' : ''}${formatUsd(Math.abs(rowBalance))}`)}</span>
        <span class="ledger-metric-sub">${escapeHtml(rowBalance < 0 ? 'Balance comprometido' : 'Balance disponible')}</span>
        <div class="ledger-balance-tooltip">
            <div class="ledger-balance-tooltip-row"><span>Balance total</span><span>${escapeHtml(`${rowBalance < 0 ? '-' : ''}${formatUsd(Math.abs(rowBalance))}`)}</span></div>
            <div class="ledger-balance-tooltip-row"><span>Promesa</span><span>${escapeHtml(formatUsd(promiseMetaForBalance.promiseUsdt))} USDT</span></div>
            <div class="ledger-balance-tooltip-row"><span>Enviado por</span><span>${senderName}</span></div>
            ${promiseMetaForBalance.isReceiver ? `<div class="ledger-balance-tooltip-row"><span>Recibido por</span><span>${receiverName}</span></div>` : ''}
        </div>
    </div>`;
    } else {
        balanceMetric = renderMetricCard({
            label: 'Balance',
            value: `${rowBalance < 0 ? '-' : ''}${formatUsd(Math.abs(rowBalance))}`,
            sub: rowBalance < 0 ? 'Balance comprometido' : 'Balance disponible',
            tone: rowBalance < 0 ? 'ledger-metric-negative' : 'ledger-metric-balance'
        });
    }

    // COBERTURA column: para ventas con ciclo muestra progreso de recuperación de VES;
    // para el resto muestra la promesa normal.
    let promiseMetric;
    if (isCycleSell) {
        const { complete, totalSellFiat, recoveredFiat, recoveredPct } = cycleData;
        const remaining = Math.max(0, totalSellFiat - recoveredFiat);
        promiseMetric = renderMetricCard({
            label: 'Cobertura',
            value: formatCoveragePercent(recoveredPct, complete),
            sub: complete
                ? `${formatNumber(totalSellFiat, 0)} VES cubierto`
                : `Faltan ${formatNumber(remaining, 0)} VES`,
            tone: complete ? 'ledger-metric-positive' : 'ledger-metric-warning',
        });
    } else {
        promiseMetric = renderPromiseColumnMeta(tx);
    }

    const methodText = tx?.paymentMethod ? escapeHtml(String(tx.paymentMethod).toUpperCase()) : '';
    const directionLabel = signedAmount < 0 ? 'Salida' : 'Entrada';
    const spreadReferenceTrigger = renderSpreadReferenceTrigger(tx, cycleData);
    const fiatText = formatFiat(tx);
    const fiatHtml = fiatText ? `<div class="ledger-mobile-sub">${escapeHtml(fiatText)}</div>` : '';
    const fiatDesktopHtml = fiatText ? `<div class="ledger-amount-sub">${escapeHtml(fiatText)}</div>` : '';

    const isDispersorPending = String(tx?.type || '').toUpperCase() === 'DISPERSOR_PENDING';
    const receivers = isDispersorPending ? (tx?.syntheticPromiseMeta?.receivers || []) : [];
    const hasReceivers = receivers.length > 0;
    const toggleBtnHtml = hasReceivers
        ? `<button class="dispersor-toggle-btn" data-dispersor-toggle title="Ver desglose por dispersor">
            <svg class="dispersor-toggle-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            <span>${receivers.length} dispersor${receivers.length !== 1 ? 'es' : ''}</span>
           </button>`
        : '';
    const receiversHtml = hasReceivers ? renderReceiversDetail(receivers) : '';

    return `
        <article class="ledger-row ${rowTone}${isDispersorPending ? ' ledger-row-dispersor-pending' : ''}">
            <div class="ledger-mobile-card">
                <div class="ledger-mobile-header">
                    <div class="ledger-mobile-badge-stack">
                        <div class="${typePillTone}">${category}</div>
                        <div class="ledger-mobile-date">${escapeHtml(formatPostingDate(tx.timestamp))}</div>
                    </div>
                    <div class="ledger-mobile-amount-block">
                        <div class="ledger-mobile-amount ${amountTone}">${formatAmount(tx)}</div>
                        ${fiatHtml}
                    </div>
                </div>

                <div class="ledger-mobile-title">${top}</div>
                <div class="ledger-mobile-kicker-row">
                    <div class="ledger-mobile-kicker-block">
                        <div class="ledger-mobile-kicker-text">${directionLabel}${methodText ? ` | ${methodText}` : ''}</div>
                        ${spreadReferenceTrigger ? `<div class="ledger-mobile-kicker-action">${spreadReferenceTrigger}</div>` : ''}
                    </div>
                    ${toggleBtnHtml}
                </div>

                <div class="ledger-mobile-meta">
                    ${metaHtml || '<span class="ledger-meta-chip ledger-meta-chip-muted">Sin metadata extra</span>'}
                </div>

                <div class="ledger-mobile-metrics">
                    ${promiseMetric}
                    ${balanceMetric}
                    ${spreadMetric}
                </div>
            </div>

            <div class="ledger-desktop-row">
                <div class="ledger-date-col">
                    <div class="ledger-date-main">${escapeHtml(formatPostingDate(tx.timestamp))}</div>
                    <div class="ledger-direction-stack">
                        <div class="ledger-date-sub">${directionLabel}</div>
                        ${spreadReferenceTrigger ? `<div class="ledger-date-action">${spreadReferenceTrigger}</div>` : ''}
                    </div>
                </div>
                <div class="ledger-description-col">
                    <div class="ledger-title-row">
                        <div class="ledger-title">${top}</div>
                        ${toggleBtnHtml}
                    </div>
                    <div class="ledger-subtitle">${methodText || 'Operacion del ledger'}</div>
                    <div class="ledger-meta-strip">
                        ${metaHtml || '<span class="ledger-meta-chip ledger-meta-chip-muted">Sin metadata extra</span>'}
                    </div>
                </div>
                <div class="ledger-type-col">
                    <span class="${typePillTone}">${category}</span>
                </div>
                <div class="ledger-amount-col">
                    <div class="ledger-amount-main ${amountTone}">${formatAmount(tx)}</div>
                    ${fiatDesktopHtml}
                </div>
                <div class="ledger-metric-col">
                    ${promiseMetric}
                </div>
                <div class="ledger-metric-col">
                    ${balanceMetric}
                </div>
                <div class="ledger-metric-col">
                    ${spreadMetric}
                </div>
            </div>
            ${receiversHtml}
        </article>
    `;
};

const renderTransfers = (transfers = [], options = {}) => {
    const { body, count, scroll } = getElements();
    if (!body) return;

    // Only reset scroll when explicitly requested (first load, pagination, filter change).
    // Silent refreshes preserve position so the list does not jump to the top.
    const resetScroll = options.resetScroll === true;
    const savedScrollTop = scroll && !resetScroll ? scroll.scrollTop : 0;

    const allTransfers = Array.isArray(transfers) ? transfers : [];
    const searchTerm = getEffectiveSearchTerm();
    if (searchTerm !== state.searchTerm) {
        state.searchTerm = searchTerm;
    }
    const searchActive = Boolean(searchTerm);

    // Llenar el caché global con las transacciones recién cargadas
    allTransfers.forEach((tx) => {
        const key = getTransferKey(tx);
        if (key) state.transfersCache.set(key, tx);
    });

    const scopedTransfers = allTransfers.filter((tx) => isLedgerChannelAllowed(tx));
    state.currentTransfers = scopedTransfers;

    if (scopedTransfers.length === 0) {
        renderEmpty();
        return;
    }

    const rowsWithBalance = buildRowsWithBalance(scopedTransfers);

    // Los ciclos se calculan sobre TODO el caché (para que compras de págs previas sumen al spread)
    const cachedScopedTransfers = getCachedScopedTransfers();
    const cycleSpreads = computeCycleSpreads(cachedScopedTransfers);

    // Cross-day cycle fix: inject rateOverride for P2P_BUY entries that the judge has
    // already linked to an open cycle whose sell happened on the previous day.
    // computeCycleSpreads can't see that sell (different date → different cache page),
    // so without this fix those buys calculate their spread against no sell → negative.
    {
        const judgeVerdicts = Array.isArray(state.kpis?.judge?.openVerdicts)
            ? state.kpis.judge.openVerdicts : [];
        for (const verdict of judgeVerdicts) {
            for (const purchaseId of (verdict.linkedPurchases || [])) {
                const key = String(purchaseId || '');
                if (!key) continue;
                const existing = cycleSpreads.get(key);
                const exactSellContext = buildJudgeSellContextFromVerdict(verdict, existing);
                if (exactSellContext) {
                    cycleSpreads.set(key, exactSellContext);
                }
            }
        }
    }

    if (searchActive && !areAllPagesCached() && !state.searchPending) {
        state.searchPending = true;
        updatePaginationUI();
        const scheduledSearchTerm = searchTerm;
        void prefetchSellContextPages().then(() => {
            if (getEffectiveSearchTerm() !== scheduledSearchTerm) return;
            state.searchPending = !areAllPagesCached();
            renderTransfers(state.currentTransfers, { resetScroll: false });
        });
    }

    const searchableRows = searchActive
        ? buildRowsWithRangeBalance(cachedScopedTransfers)
        : rowsWithBalance;
    const filteredRows = searchableRows.filter(({ tx }) => matchesSearch(tx, searchTerm));
    state.searchResultCount = filteredRows.length;

    if (count) {
        const filterLabel = state.typeFilter === 'ALL' ? '' : ` | ${state.typeFilter}`;
        if (searchActive) {
            const statusLabel = state.searchPending ? 'Buscando' : 'Mostrando';
            count.textContent = `${statusLabel} ${filteredRows.length} coincidencia${filteredRows.length === 1 ? '' : 's'} en ${state.total} movimiento${state.total === 1 ? '' : 's'}${filterLabel}`;
        } else {
            count.textContent = `Mostrando ${scopedTransfers.length} movimiento${scopedTransfers.length === 1 ? '' : 's'} de ${state.total}${filterLabel}`;
        }
    }

    if (filteredRows.length === 0) {
        body.innerHTML = `
            <div class="px-4 py-10 text-center text-[14px] font-medium text-white md:px-6">
                ${searchActive ? 'No hay coincidencias en el rango seleccionado.' : 'No hay coincidencias en esta pagina.'}
            </div>
        `;
        updatePaginationUI();
        if (scroll) {
            if (resetScroll) {
                scroll.scrollTop = 0;
            } else {
                requestAnimationFrame(() => {
                    const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
                    scroll.scrollTop = Math.min(savedScrollTop, max);
                });
            }
        }
        return;
    }

    body.innerHTML = filteredRows.map(({ tx, balance }) => renderRow(tx, balance, cycleSpreads.get(getTransferKey(tx)))).join('');

    // Actualizar badge de coberturas activas
    updateCoverageBadge(cachedScopedTransfers, cycleSpreads);

    // Wire dispersor toggle buttons
    body.querySelectorAll('[data-dispersor-toggle]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const article = btn.closest('.ledger-row-dispersor-pending');
            if (!article) return;
            const panel = article.querySelector('.dispersor-receivers-panel');
            if (!panel) return;
            const isOpen = panel.style.display !== 'none';
            panel.style.display = isOpen ? 'none' : 'block';
            btn.classList.toggle('dispersor-toggle-open', !isOpen);
        });
    });

    wireSpreadTooltips(body);

    updatePaginationUI();
    if (scroll) {
        if (resetScroll) {
            scroll.scrollTop = 0;
        } else {
            requestAnimationFrame(() => {
                const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
                scroll.scrollTop = Math.min(savedScrollTop, max);
            });
        }
    }
};

const fetchTransfersPage = async (page = 1, options = {}) => {
    if (!state.apiBase || !state.token) return;
    const showLoading = options?.showLoading !== false;
    const preserveOnError = options?.preserveOnError === true;

    if (state.abortController) {
        state.abortController.abort();
    }

    state.page = page;
    state.abortController = new AbortController();
    const requestSeq = ++state.requestSeq;
    if (showLoading) {
        renderLoading();
        updatePaginationUI();
    }

    try {
        let res = await fetch(buildTransfersUrl(state.apiBase, state.range, page, state.limit, true), {
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            cache: 'no-store',
            signal: state.abortController.signal
        });

        if (!res.ok && res.status !== 401 && res.status !== 403) {
            const fallbackRes = await fetch(buildTransfersUrl(state.apiBase, state.range, page, state.limit, false), {
                headers: {
                    'Authorization': `Bearer ${state.token}`
                },
                cache: 'no-store',
                signal: state.abortController.signal
            });
            if (fallbackRes.ok) {
                res = fallbackRes;
            }
        }

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                state.onAuthError?.();
                return;
            }
            let detail = '';
            try {
                detail = await res.text();
            } catch {
                detail = '';
            }
            throw new Error(`HTTP ${res.status}${detail ? ` - ${detail.slice(0, 160)}` : ''}`);
        }

        const payload = await res.json();
        if (requestSeq !== state.requestSeq) return;

        const pagination = payload?.pagination || {};
        state.total = Number(pagination.total || 0);
        state.totalPages = Number(pagination.totalPages || 0);
        state.page = Number(pagination.page || page);
        state.prefetchedPages.add(state.page);
        const payloadClosingBalance = Number(payload?.closingBalance);
        state.closingBalance = Number.isFinite(payloadClosingBalance) ? payloadClosingBalance : null;
        state.loadedOnce = true;
        state.needsRefresh = false;

        renderTransfers(Array.isArray(payload?.transfers) ? payload.transfers : [], {
            resetScroll: showLoading,
        });

        // Silently prefetch subsequent pages to populate sell context for spread calculation.
        // This ensures page 1 buys can find their matching sells even on first visit.
        void prefetchSellContextPages();
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.warn('No fue posible cargar el historial de balance:', error);
        if (!preserveOnError) {
            renderError('No fue posible cargar el historial. Intenta de nuevo.');
        }
    } finally {
        if (requestSeq === state.requestSeq) {
            state.abortController = null;
        }
    }
};

// Silently fetches ALL remaining pages into the cache.
// This ensures spread calculation and profit sum cover the full dataset.
const prefetchSellContextPages = async () => {
    if (!state.apiBase || !state.token) return;

    let needsRerender = false;

    for (let p = 1; p <= state.totalPages; p++) {
        if (state.prefetchedPages.has(p)) continue;

        try {
            const res = await fetch(
                buildTransfersUrl(state.apiBase, state.range, p, state.limit, true),
                { headers: { 'Authorization': `Bearer ${state.token}` }, cache: 'no-store' }
            );
            if (!res.ok) continue;

            const payload = await res.json();
            const transfers = Array.isArray(payload?.transfers) ? payload.transfers : [];
            state.prefetchedPages.add(p);

            transfers.forEach((tx) => {
                const key = getTransferKey(tx);
                if (!key) return;
                const hasExisting = state.transfersCache.has(key);
                state.transfersCache.set(key, tx);
                if (!hasExisting) needsRerender = true;
            });
        } catch {
            // Silent failure — prefetch is best-effort and never blocks the UI.
        }
    }

    if (needsRerender && state.currentTransfers.length > 0) {
        renderTransfers(state.currentTransfers, { resetScroll: false });
    }

    // Compute total spread sum scoped to the current date range.
    // allScoped (full history) is needed so computeCycleSpreads can detect cross-day cycle rates,
    // but we only SUM spreads for transactions within the selected range.
    const allCached = Array.from(state.transfersCache.values()).sort((a, b) => getTxTimestampMs(b) - getTxTimestampMs(a));
    const allScoped = allCached.filter(isLedgerChannelAllowed);
    const allCycleSpreads = computeCycleSpreads(allScoped);

    // Inject judge rateOverrides for cross-day buys (same logic as in renderTransfers)
    {
        const judgeVerdicts = Array.isArray(state.kpis?.judge?.openVerdicts) ? state.kpis.judge.openVerdicts : [];
        for (const verdict of judgeVerdicts) {
            for (const purchaseId of (verdict.linkedPurchases || [])) {
                const key = String(purchaseId || '');
                if (!key) continue;
                const existing = allCycleSpreads.get(key);
                const exactSellContext = buildJudgeSellContextFromVerdict(verdict, existing);
                if (exactSellContext) {
                    allCycleSpreads.set(key, exactSellContext);
                }
            }
        }
    }

    // Restrict profit sum to the current viewing range (default: today in VE time)
    const _rangeFrom = sanitizeDateValue(state.range?.from);
    const _rangeTo = sanitizeDateValue(state.range?.to);
    const _todayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: CARACAS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const _effectiveFrom = _rangeFrom || _todayStr;
    const _effectiveTo = _rangeTo || _todayStr;

    let totalSpread = 0;
    const ledgerSpreadByBank = new Map(); // bankKey → spread sum
    for (const tx of allScoped) {
        const txDateStr = new Date(getTxTimestampMs(tx)).toLocaleDateString('en-CA', { timeZone: CARACAS_TZ });
        if (txDateStr < _effectiveFrom || txDateStr > _effectiveTo) continue;
        const cycleEntry = allCycleSpreads.get(getTransferKey(tx));
        const spreadContext = cycleEntry?.sellContextOverride || (cycleEntry?.rateOverride ?? 0);
        const txSpread = truncateTowardZero(computeTxSpread(tx, spreadContext), 2);
        if (txSpread !== 0) {
            const bankKey = normalizeBankKey(tx?.paymentMethod || tx?.bankName || tx?.bank || '');
            if (bankKey) {
                ledgerSpreadByBank.set(bankKey, (ledgerSpreadByBank.get(bankKey) || 0) + txSpread);
            }
        }
        totalSpread += txSpread;
    }
    totalSpread = truncateTowardZero(totalSpread, 2);

    // Inject per-bank ledger spread into bankData and notify the sidebar.
    // Important: if bankData contains duplicate aliases that normalize to the
    // same key (e.g. BANK/Fintech variants), assign the ledger spread only once.
    if (state.bankData.length > 0) {
        const injectedKeys = new Set();
        state.bankData = state.bankData.map((bank) => {
            const key = normalizeBankKey(bank?.bank || bank?.bankName || '');
            if (!key) {
                return { ...bank, ledgerSpreadReady: true };
            }

            if (injectedKeys.has(key)) {
                return {
                    ...bank,
                    spreadProfitUsdt: 0,
                    ledgerSpreadReady: true,
                };
            }

            injectedKeys.add(key);
            const ledgerSpread = truncateTowardZero(ledgerSpreadByBank.get(key) || 0, 2);
            return {
                ...bank,
                spreadProfitUsdt: ledgerSpread,
                ledgerSpreadReady: true,
            };
        });
        // Re-render sidebar with updated per-bank ledger spreads
        if (typeof state.onBankDataUpdate === 'function') {
            state.onBankDataUpdate(state.bankData);
        }
    }

    // totalSpread stays useful for ledger/sidebar analytics, but the visible
    // Profit Operativo KPI must remain the canonical net value from /api/kpis.
};

const bindEventsOnce = () => {
    if (state.initialized) {
        return;
    }

    const applySearchTerm = (rawValue, resetScroll = true) => {
        state.searchTerm = String(rawValue || '').trim();
        state.searchSeq += 1;
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }

        const searchActive = hasActiveSearch();
        state.searchPending = searchActive && !areAllPagesCached();
        renderTransfers(state.currentTransfers, { resetScroll });

        if (!searchActive || !state.searchPending) {
            state.searchPending = false;
            updatePaginationUI();
            return;
        }

        const currentSearchSeq = state.searchSeq;
        searchDebounceTimer = setTimeout(async () => {
            await prefetchSellContextPages();
            if (currentSearchSeq !== state.searchSeq) return;
            state.searchPending = !areAllPagesCached();
            renderTransfers(state.currentTransfers, { resetScroll: false });
        }, 180);
    };

    document.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.id !== 'balance-ledger-search') return;
        applySearchTerm(target.value, true);
    });

    document.addEventListener('search', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.id !== 'balance-ledger-search') return;
        applySearchTerm(target.value, true);
    });

    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const prevBtn = target.closest('#balance-ledger-prev');
        if (prevBtn) {
            if (hasActiveSearch()) return;
            if (state.page <= 1) return;
            void fetchTransfersPage(state.page - 1);
            return;
        }

        const nextBtn = target.closest('#balance-ledger-next');
        if (nextBtn) {
            if (hasActiveSearch()) return;
            if (state.page >= state.totalPages) return;
            void fetchTransfersPage(state.page + 1);
            return;
        }

        const typeButton = target.closest('[data-ledger-type]');
        if (!typeButton) return;

        const nextType = String(typeButton?.dataset?.ledgerType || 'ALL').toUpperCase();
        if (!LEDGER_FILTER_OPTIONS.includes(nextType) || nextType === state.typeFilter) {
            return;
        }
        state.typeFilter = nextType;
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        state.pageNetByPage.clear();
        state.transfersCache.clear();
        state.prefetchedPages.clear();
        state.closingBalance = null;
        state.total = 0;
        state.totalPages = 0;
        state.searchPending = false;
        state.searchResultCount = 0;
        updateTypeFilterUI();
        updatePaginationUI();
        renderPlaceholder('Filtrando movimientos...');
        void fetchTransfersPage(1);
    });

    state.initialized = true;
};

export const updateBalanceLedgerUI = (kpis = {}, context = {}) => {
    bindEventsOnce();

    const nextRange = {
        from: sanitizeDateValue(context?.range?.from),
        to: sanitizeDateValue(context?.range?.to),
    };
    const nextSyncKey = String(kpis?.reportDate || '').trim();
    const rangeChanged = !isSameRange(state.range, nextRange);
    const apiChanged = state.apiBase !== String(context?.apiBase || '').trim();
    const tokenChanged = state.token !== String(context?.token || '').trim();
    const syncChanged = Boolean(nextSyncKey) && state.syncKey !== nextSyncKey;

    state.kpis = kpis || {};
    state.apiBase = String(context?.apiBase || '').trim();
    state.token = String(context?.token || '').trim();
    state.range = nextRange;
    state.syncKey = nextSyncKey;
    state.onAuthError = typeof context?.onAuthError === 'function' ? context.onAuthError : null;
    state.onBankDataUpdate = typeof context?.onBankDataUpdate === 'function' ? context.onBankDataUpdate : null;
    state.bankData = Array.isArray(context?.bankData) ? context.bankData : [];

    const { searchInput } = getElements();
    const domSearchTerm = String(searchInput?.value || '').trim();
    if (domSearchTerm && domSearchTerm !== state.searchTerm) {
        state.searchTerm = domSearchTerm;
    } else if (searchInput && searchInput.value !== state.searchTerm) {
        searchInput.value = state.searchTerm;
    }
    updateTypeFilterUI();

    if (!state.loadedOnce) {
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        state.pageNetByPage.clear();
        state.transfersCache.clear();
        state.prefetchedPages.clear();
        state.closingBalance = null;
        state.needsRefresh = true;
        state.total = 0;
        state.totalPages = 0;
        state.searchPending = false;
        state.searchResultCount = 0;
        updatePaginationUI();
        renderPlaceholder('Cargando historial...');
        void fetchTransfersPage(1);
        return;
    }

    if (rangeChanged || apiChanged || tokenChanged) {
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        state.pageNetByPage.clear();
        state.transfersCache.clear();
        state.prefetchedPages.clear();
        state.closingBalance = null;
        state.needsRefresh = true;
        state.total = 0;
        state.totalPages = 0;
        state.searchPending = false;
        state.searchResultCount = 0;
        updatePaginationUI();
        renderPlaceholder('Actualizando historial...');
        void fetchTransfersPage(1);
        return;
    }

    if (syncChanged) {
        void fetchTransfersPage(state.page || 1, {
            showLoading: false,
            preserveOnError: true,
        });
        return;
    }

    if (state.currentTransfers.length > 0) {
        renderTransfers(state.currentTransfers);
    }
};
