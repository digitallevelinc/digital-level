let notificationsPollTimer = null;
let notificationsOpen = false;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatTimestamp(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Ahora';
    return new Intl.DateTimeFormat('es-VE', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(date);
}

const NOTIF_TYPE_STYLE = {
    promise_created:      { icon: '🤝', color: '#F3BA2F',  label: 'Promesa' },
    rebuy_shortfall:      { icon: '⚠️', color: '#f87171',  label: 'Recompra' },
    cycle_incomplete:     { icon: '⏳', color: '#fb923c',  label: 'Ciclo' },
    ves_holding_prolonged:{ icon: '💰', color: '#fbbf24',  label: 'VES Retenido' },
    anomalous_transfer:   { icon: '🚨', color: '#ef4444',  label: 'Anomalia' },
    bank_overuse:         { icon: '🏦', color: '#f97316',  label: 'Banco' },
    admin_note:           { icon: '📝', color: '#60a5fa',  label: 'Nota Admin' },
};

async function sendOperatorReply(apiBase, token, message, replyToNotificationId) {
    try {
        const res = await fetch(`${String(apiBase || '').replace(/\/+$/, '')}/api/notifications/reply`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                ...(replyToNotificationId ? { replyToNotificationId } : {}),
            }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

export function initDashboardNotifications({ apiBase, token }) {
    const root = document.getElementById('dashboard-notifications');
    const toggle = document.getElementById('dashboard-notifications-btn');
    const panel = document.getElementById('dashboard-notifications-panel');
    const badge = document.getElementById('dashboard-notifications-badge');
    const list = document.getElementById('dashboard-notifications-list');
    const markReadBtn = document.getElementById('dashboard-notifications-mark-read');
    const sendNoteBtn = document.getElementById('dashboard-notifications-send-note');

    if (!root || !toggle || !panel || !badge || !list || !token) return;

    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const setOpen = (open) => {
        notificationsOpen = Boolean(open);
        panel.classList.toggle('hidden', !notificationsOpen);
        toggle.setAttribute('aria-expanded', notificationsOpen ? 'true' : 'false');
    };

    const render = (items = [], unreadCount = 0) => {
        const unread = Number(unreadCount || 0);
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.classList.toggle('hidden', unread <= 0);

        if (!Array.isArray(items) || items.length === 0) {
            list.innerHTML = '<div class="px-4 py-5 text-center text-sm font-bold text-white/50">Sin notificaciones por ahora.</div>';
            return;
        }

        list.innerHTML = items.map((item) => {
            const unreadClass = item?.readAt ? 'border-white/8 bg-white/[0.03]' : 'border-[#F3BA2F]/25 bg-[#F3BA2F]/[0.06]';
            const meta = NOTIF_TYPE_STYLE[item?.type] || { icon: '🔔', color: '#F3BA2F', label: '' };
            const isAdminNote = item?.type === 'admin_note';
            const replyBtn = isAdminNote
                ? `<button class="notif-reply-btn mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold text-white/60 hover:bg-white/10 hover:text-white transition-colors" data-notif-id="${escapeHtml(item?.id || '')}">Responder</button>`
                : '';
            return `
                <article class="rounded-2xl border ${unreadClass} px-4 py-3" style="border-left: 3px solid ${meta.color};">
                    <div class="flex items-center gap-1.5 mb-1">
                        <span class="text-sm">${meta.icon}</span>
                        <span class="text-[9px] font-black uppercase tracking-[0.1em]" style="color:${meta.color};">${meta.label}</span>
                    </div>
                    <p class="text-[12px] font-black uppercase tracking-[0.16em] text-[#F3BA2F]">${escapeHtml(item?.title || 'Notificacion')}</p>
                    <p class="mt-2 text-sm leading-relaxed text-white/80">${escapeHtml(item?.message || '')}</p>
                    <p class="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">${escapeHtml(formatTimestamp(item?.createdAt))}</p>
                    ${replyBtn}
                </article>
            `;
        }).join('');

        // Attach reply handlers
        list.querySelectorAll('.notif-reply-btn').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const notifId = btn.getAttribute('data-notif-id');
                const msg = prompt('Tu respuesta:');
                if (!msg || !msg.trim()) return;
                btn.disabled = true;
                btn.textContent = 'Enviando...';
                const ok = await sendOperatorReply(apiBase, token, msg.trim(), notifId);
                btn.textContent = ok ? 'Enviado' : 'Error';
                if (ok) setTimeout(() => fetchNotifications(), 1000);
            });
        });
    };

    const fetchNotifications = async () => {
        const res = await fetch(`${String(apiBase || '').replace(/\/+$/, '')}/api/notifications?limit=12&t=${Date.now()}`, {
            headers,
            cache: 'no-store'
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({ items: [], unreadCount: 0 }));
        render(data?.items || [], data?.unreadCount || 0);
    };

    const markRead = async () => {
        await fetch(`${String(apiBase || '').replace(/\/+$/, '')}/api/notifications/read`, {
            method: 'POST',
            headers,
            body: JSON.stringify({})
        });
        await fetchNotifications();
    };

    if (notificationsPollTimer) {
        clearInterval(notificationsPollTimer);
        notificationsPollTimer = null;
    }

    toggle.addEventListener('click', async (event) => {
        event.stopPropagation();
        const nextOpen = !notificationsOpen;
        setOpen(nextOpen);
        if (nextOpen) {
            await fetchNotifications();
            await markRead();
        }
    });

    markReadBtn?.addEventListener('click', async (event) => {
        event.stopPropagation();
        await markRead();
    });

    sendNoteBtn?.addEventListener('click', async (event) => {
        event.stopPropagation();
        const msg = prompt('Nota para el admin:');
        if (!msg || !msg.trim()) return;
        sendNoteBtn.disabled = true;
        sendNoteBtn.textContent = 'Enviando...';
        const ok = await sendOperatorReply(apiBase, token, msg.trim());
        sendNoteBtn.textContent = ok ? 'Enviada!' : 'Error';
        setTimeout(() => { sendNoteBtn.textContent = 'Enviar nota'; sendNoteBtn.disabled = false; }, 2000);
    });

    document.addEventListener('click', (event) => {
        if (!notificationsOpen) return;
        if (root.contains(event.target)) return;
        setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && notificationsOpen) {
            setOpen(false);
        }
    });

    void fetchNotifications();
    notificationsPollTimer = setInterval(() => {
        if (document.hidden) return;
        void fetchNotifications();
    }, 15000);
}
