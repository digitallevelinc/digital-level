/** @jsxImportSource react */
import React, { useEffect, useState } from 'react';

// 1. Funciones auxiliares para fechas y números
const getPreviousMonth = () => {
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const now = new Date();
    const lastMonthIndex = (now.getMonth() - 1 + 12) % 12;
    return meses[lastMonthIndex];
};

const getSubscriptionsCount = () => Math.floor(Math.random() * (70 - 40 + 1)) + 40;

const SocialProofMini: React.FC = () => {
    const [current, setCurrent] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const ROTATION_TIME = 7000; // Actualizado a 7 segundos

    const mockRecent = [
        { name: "Andrés M.", plan: "Business Pro", time: "1h ago" },
        { name: "Mariana G.", plan: "Plan Básico", time: "2h ago" },
        { name: "Roberto V.", plan: "Mesa VIP", time: "3h ago" },
        { name: "Elena R.", plan: "Business Pro", time: "4h ago" },
        { name: "Carlos T.", plan: "Plan Básico", time: "5h ago" },
        { name: "Yusneidy P.", plan: "Mesa VIP", time: "6h ago" },
        { name: "Javier L.", plan: "Business Pro", time: "7h ago" },
        { name: "Sofía M.", plan: "Mesa VIP", time: "8h ago" },
        { name: "Ricardo S.", plan: "Business Pro", time: "9h ago" },
        { name: "Beatriz D.", plan: "Plan Básico", time: "10h ago" },
        { name: "Fernando K.", plan: "Mesa VIP", time: "12h ago" },
        { name: "Lucía P.", plan: "Business Pro", time: "14h ago" },
        { name: "Diego H.", plan: "Plan Básico", time: "15h ago" },
        { name: "Patricia G.", plan: "Mesa VIP", time: "17h ago" },
        { name: "Gabriel C.", plan: "Business Pro", time: "18h ago" },
        { name: "Mónica F.", plan: "Plan Básico", time: "20h ago" },
        { name: "Raúl Z.", plan: "Mesa VIP", time: "21h ago" },
        { name: "Silvia J.", plan: "Business Pro", time: "22h ago" },
        { name: "Hugo B.", plan: "Plan Básico", time: "23h ago" },
        { name: "Carmen L.", plan: "Mesa VIP", time: "23h ago" }
    ];

    const slides = [
        ...mockRecent.map(r => ({
            icon: "⚡",
            content: (
                <div className="text-[11px] leading-tight text-gray-200">
                    <div className="flex justify-between items-start">
                        <b className="text-[#F3BA2F]">{r.name}</b> 
                        <span className="text-[9px] text-gray-500 font-normal uppercase ml-2">{r.time}</span>
                    </div>
                    adquirió su <span className="text-white font-bold">{r.plan}</span> <br/>
                    <span className="text-[10px] text-[#F3BA2F]/80 italic">¡Acceso concedido!</span>
                </div>
            )
        })),
        { 
            icon: "📈", 
            content: <p className="text-[11px] font-bold text-white pt-1">{getSubscriptionsCount()} suscripciones en {getPreviousMonth()}</p> 
        },
        { 
            icon: "⭐", 
            content: <p className="text-[11px] font-bold text-[#F3BA2F] pt-1">5 Estrellas en Google & Facebook</p> 
        }
    ];

    useEffect(() => {
        const showTimer = setTimeout(() => setIsVisible(true), 4000);
        
        const interval = setInterval(() => {
            setCurrent(prev => (prev + 1) % slides.length);
        }, ROTATION_TIME);

        return () => { 
            clearTimeout(showTimer); 
            clearInterval(interval); 
        };
    }, [slides.length]);

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-6 left-6 z-[10000] bg-[#0b0e11]/95 backdrop-blur-md border border-[#F3BA2F]/20 p-3 rounded-xl shadow-[0_15px_40px_rgba(0,0,0,0.6)] max-w-[220px] animate-in slide-in-from-left-12 duration-1000">
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 bg-[#F3BA2F]/10 w-9 h-9 rounded-full flex items-center justify-center text-sm shadow-[0_0_15px_rgba(243,186,47,0.15)]">
                    {slides[current].icon}
                </div>
                <div className="flex-1 min-w-0 pt-0.5 text-left">
                    {slides[current].content}
                </div>
                <button 
                    onClick={() => setIsVisible(false)} 
                    className="flex-shrink-0 text-gray-600 hover:text-white transition-colors mt-0.5"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default SocialProofMini;