const CARACAS_TZ = 'America/Caracas';

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
const formatVes = (value) => `${formatNumber(value, 2)} VES`;

const getCategory = (type) => {
    if (!type) return 'OTRO';
    if (type.startsWith('P2P_')) return 'P2P';
    if (type.startsWith('PAY_')) return 'PAY';
    if (type === 'DEPOSIT' || type === 'WITHDRAWAL' || type === 'DIVIDEND') return 'RED';
    if (type === 'INTERNAL_TRANSFER') return 'SWITCH';
    return 'OTRO';
};

const shouldInclude = (tx) => ['P2P', 'PAY', 'RED'].includes(getCategory(tx?.type));

const getDirection = (type) => {
    switch (type) {
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

const getCategoryBalance = (kpis, category) => {
    const wallets = kpis?.wallets || {};
    switch (category) {
        case 'P2P':
            return Number(wallets.balanceP2P || 0);
        case 'PAY':
            return Number(wallets.balancePay || 0);
        case 'RED':
            return Number(wallets.balanceRed || 0);
        case 'SWITCH':
            return Number(wallets.balanceSwitch || 0);
        default:
            return 0;
    }
};

const getCategoryTone = (category) => {
    switch (category) {
        case 'P2P':
            return 'text-[#f7c948]';
        case 'PAY':
            return 'text-sky-300';
        case 'RED':
            return 'text-violet-300';
        default:
            return 'text-white/55';
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

const buildDescriptionTop = (tx) => {
    return tx?.counterpartyName
        || tx?.paymentMethod
        || tx?.notes
        || 'Movimiento sin detalle';
};

const buildDescriptionMeta = (tx) => {
    const parts = [];

    const rateText = formatRate(tx?.exchangeRate);
    if (tx?.paymentMethod) parts.push(tx.paymentMethod);
    if (tx?.counterpartyName) parts.push(tx.counterpartyName);
    if (rateText) parts.push(rateText);
    if (tx?.orderNumber) parts.push(`ORDER ${tx.orderNumber}`);
    if (tx?.txHash || tx?.binanceRawId) parts.push(`TX ${tx.txHash || tx.binanceRawId}`);

    return parts.slice(0, 3);
};

const formatFiat = (tx) => {
    const fiatAmount = Number(tx?.fiatAmount || 0);
    if (fiatAmount) {
        return `${formatNumber(Math.abs(fiatAmount), 2)} ${escapeHtml(tx?.fiatCurrency || 'FIAT')}`;
    }
    const rateText = formatRate(tx?.exchangeRate);
    return rateText || 'SIN DATO FIAT';
};

const formatAmount = (tx) => {
    const direction = getDirection(tx?.type);
    const amount = Number(tx?.amount || 0);
    const sign = direction < 0 ? '-' : direction > 0 ? '+' : '';
    return `${sign}${formatUsd(Math.abs(amount))}`;
};

const setSummaryCard = (card, value, sublabel, isNegative = false) => {
    if (!card) return;
    const valueEl = card.querySelector('[data-balance-value]');
    const subEl = card.querySelector('[data-balance-sub]');
    if (valueEl) {
        valueEl.textContent = value;
        valueEl.classList.toggle('text-red-400', isNegative);
        valueEl.classList.toggle('text-white', !isNegative && !value.includes('VES'));
        valueEl.classList.toggle('text-emerald-400', !isNegative && value.includes('VES'));
    }
    if (subEl) subEl.textContent = sublabel;
};

const renderSummary = (kpis = {}) => {
    const summary = document.getElementById('balance-summary');
    if (!summary) return;

    const wallets = kpis.wallets || {};
    const cards = Array.from(summary.children);
    const p2p = Number(wallets.balanceP2P || 0);
    const pay = Number(wallets.balancePay || 0);
    const red = Number(wallets.balanceRed || 0);
    const fiat = Number(wallets.balanceFiat || 0);
    const fiatUsd = Number(wallets.fiatBalanceUSDT || kpis.operations?.fiatBalanceUSDT || 0);

    setSummaryCard(cards[0], formatUsd(Math.abs(p2p)).replace('$', p2p < 0 ? '-$' : '$'), 'Balance actual', p2p < 0);
    setSummaryCard(cards[1], formatUsd(Math.abs(pay)).replace('$', pay < 0 ? '-$' : '$'), 'Balance actual', pay < 0);
    setSummaryCard(cards[2], formatUsd(Math.abs(red)).replace('$', red < 0 ? '-$' : '$'), 'Balance actual', red < 0);
    setSummaryCard(cards[3], `${fiat < 0 ? '-' : ''}${formatVes(Math.abs(fiat))}`, `≈ ${formatNumber(Math.abs(fiatUsd), 2, 'en-US')} USD`, fiat < 0);

    const switchPill = document.getElementById('balance-switch-pill');
    const switchValue = document.getElementById('balance-switch-value');
    const switchBalance = Number(wallets.balanceSwitch || 0);
    if (switchPill && switchValue) {
        switchPill.classList.remove('hidden');
        switchValue.textContent = `${switchBalance < 0 ? '-' : ''}${formatUsd(Math.abs(switchBalance))}`;
        switchValue.className = switchBalance < 0 ? 'text-red-400' : 'text-white/80';
    }
};

const renderRow = (tx, kpis) => {
    const category = getCategory(tx.type);
    const signedAmount = Number(tx?.amount || 0) * getDirection(tx?.type);
    const amountTone = signedAmount < 0 ? 'text-red-400' : 'text-white';
    const categoryBalance = getCategoryBalance(kpis, category);
    const balanceTone = categoryBalance < 0 ? 'text-red-400' : 'text-white';
    const top = escapeHtml(buildDescriptionTop(tx));
    const meta = buildDescriptionMeta(tx);
    const metaHtml = meta.map((line) => `<span>${escapeHtml(line)}</span>`).join('<span class="text-white/18">•</span>');

    return `
    <article class="grid gap-4 px-4 py-4 md:px-6 lg:grid-cols-[120px_minmax(0,1.6fr)_92px_130px_140px] lg:items-center">
        <div class="text-[12px] font-semibold text-white/42">${escapeHtml(formatPostingDate(tx.timestamp))}</div>
        <div class="min-w-0">
            <div class="break-words text-[15px] font-semibold text-white">${top}</div>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/40">${metaHtml || '<span>Sin metadata extra</span>'}</div>
        </div>
        <div class="text-left lg:text-center">
            <span class="text-[1.1rem] font-black uppercase tracking-[0.12em] ${getCategoryTone(category)}">${category}</span>
        </div>
        <div class="text-left lg:text-right">
            <div class="text-[1.35rem] font-black leading-none ${amountTone}">${formatAmount(tx)}</div>
            <div class="mt-1 text-[11px] font-semibold text-white/40">${escapeHtml(formatFiat(tx))}</div>
        </div>
        <div class="text-left lg:text-right">
            <div class="text-[1.15rem] font-black leading-none ${balanceTone}">${categoryBalance < 0 ? '-' : ''}${formatUsd(Math.abs(categoryBalance))}</div>
            <div class="mt-1 text-[11px] font-medium text-white/35">Balance actual</div>
        </div>
    </article>`;
};

export const updateBalanceLedgerUI = (kpis = {}, payload = {}) => {
    renderSummary(kpis);

    const container = document.getElementById('balance-ledger-body');
    const counter = document.getElementById('balance-ledger-count');
    if (!container) return;

    const transfers = Array.isArray(payload?.transfers)
        ? payload.transfers.filter(shouldInclude).slice(0, 8)
        : [];

    if (transfers.length === 0) {
        if (counter) counter.textContent = 'Sin movimientos en el rango actual';
        container.innerHTML = `
        <div class="px-6 py-10 text-center text-sm font-medium text-white/45">
            Sin movimientos RED / PAY / P2P para el rango seleccionado.
        </div>`;
        return;
    }

    if (counter) {
        counter.textContent = `${transfers.length} movimiento${transfers.length === 1 ? '' : 's'} recientes`;
    }

    container.innerHTML = transfers.map((tx) => renderRow(tx, kpis)).join('');
};
