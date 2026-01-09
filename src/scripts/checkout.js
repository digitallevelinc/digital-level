// src/scripts/checkout.js
export const CheckoutUI = {
    renderReceipt: (container, data) => {
        if (!container) return;
        
        // Configuración de precios
        const prices = { 'Básico': '24.99', 'Pro': '49.99', 'VIP': '99.99' };
        const amount = prices[data.plan] || '49.99';
        
        // --- TUS DATOS ---
        // Asegúrate de usar el número completo con código de país 
        const MI_BINANCE_ID = "173109190"; 
        const MI_WHATSAPP = "14482045984"; // Actualizado al número completo
        // -----------------

        // Construcción del mensaje profesional para WhatsApp
        const message = encodeURIComponent(
            `🌐 *NUEVA ORDEN - DIGITAL LEVEL*\n` + // Agregamos el mundito para identificar origen
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Hola! He realizado mi pago por Binance Pay. Aquí están mis detalles:\n\n` +
            `🆔 *ORDEN:* ${data.orderId}\n` +
            `👤 *NOMBRE:* ${data.name}\n` +
            `📱 *TELÉFONO:* ${data.phone}\n` +
            `📧 *EMAIL:* ${data.email}\n` +
            `💎 *PLAN:* ${data.plan}\n` +
            `💰 *MONTO:* $${amount} USDT\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔔 *QUEDO ATENTO A LA ACTIVACIÓN*`
        );

        const whatsappUrl = `https://wa.me/${MI_WHATSAPP}?text=${message}`;

        container.innerHTML = `
            <div class="animate-in fade-in zoom-in duration-500 space-y-6 text-left">
                <div class="flex justify-center mb-2">
                    <div class="bg-[#F3BA2F]/10 border border-[#F3BA2F]/20 px-4 py-1 rounded-full flex items-center gap-2">
                        <span class="w-2 h-2 bg-[#F3BA2F] rounded-full animate-pulse"></span>
                        <span class="text-[10px] font-bold text-[#F3BA2F] uppercase tracking-widest">Esperando Pago</span>
                    </div>
                </div>

                <div class="text-center space-y-1">
                    <div class="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Orden: ${data.orderId}</div>
                    <div class="text-4xl font-black text-white">$${amount} <span class="text-sm text-gray-500 font-normal tracking-normal">USDT</span></div>
                </div>

                <div class="bg-[#0b0e11]/80 border border-gray-800 rounded-2xl p-5 space-y-3 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-[#F3BA2F]/5 blur-3xl -z-10"></div>
                    <div class="flex justify-between text-xs">
                        <span class="text-gray-500 font-bold uppercase">Plan Seleccionado</span>
                        <span class="text-[#F3BA2F] font-black uppercase tracking-wider">${data.plan}</span>
                    </div>
                    <div class="flex justify-between text-xs border-t border-gray-800/50 pt-3">
                        <span class="text-gray-500 font-bold uppercase">Usuario</span>
                        <span class="text-white font-medium italic">${data.name}</span>
                    </div>
                </div>

                <div class="flex flex-col items-center gap-5 bg-white/[0.03] border border-dashed border-gray-700 rounded-3xl p-6 transition-all hover:border-[#F3BA2F]/50">
                    <div class="bg-white p-2 rounded-2xl shadow-[0_0_30_rgba(255,255,255,0.05)]">
                        <img src="/img/qr.png" alt="QR Binance" class="w-36 h-36 object-contain" />
                    </div>
                    
                    <div class="text-center w-full">
                        <p class="text-[9px] text-gray-500 uppercase font-black mb-2 tracking-widest">Binance Pay ID (Toca para copiar)</p>
                        <button type="button" 
                                onclick="navigator.clipboard.writeText('${MI_BINANCE_ID}'); alert('ID Copiado!');" 
                                class="group w-full flex items-center justify-between bg-[#1e2329] px-5 py-3 rounded-xl border border-gray-700 hover:border-[#F3BA2F] transition-all active:scale-95">
                            <span class="text-[#F3BA2F] font-mono font-bold text-lg">${MI_BINANCE_ID}</span>
                            <i class="fas fa-copy text-gray-500 group-hover:text-white transition-colors"></i>
                        </button>
                    </div>
                </div>

                <a href="${whatsappUrl}" 
                target="_blank"
                rel="noopener noreferrer"
                class="w-full py-4 bg-[#25D366] text-white font-black uppercase tracking-widest rounded-xl text-center block text-xs shadow-[0_10px_20px_rgba(37,211,102,0.2)] hover:bg-[#20bd5a] transition-all hover:-translate-y-1">
                    <i class="fab fa-whatsapp text-lg mr-2"></i> Confirmar Pago en WhatsApp
                </a>
                
                <p class="text-[9px] text-center text-gray-600 font-bold uppercase tracking-tight italic">
                    El acceso será activado tras confirmar la transacción.
                </p>
            </div>
        `;
    }
};