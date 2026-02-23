/** @jsxImportSource react */
import { useState, useEffect } from 'react'
import { Dialog, Transition, Disclosure } from '@headlessui/react'
import { Bars3Icon, XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { 
  FaCalculator, FaRocket, FaBtc, FaShieldAlt 
} from 'react-icons/fa'

// Definicion de tipos
interface NavItem {
  name: string;
  href: string;
  icon: any;
  description?: string;
  badge?: string;
}

const services: NavItem[] = [
  { 
    name: 'Calculadora P2P', 
    href: '/calculadora', 
    icon: FaCalculator, 
    description: 'Calcula tus arbitrajes en tiempo real.', 
    badge: 'FREE' 
  },
  { name: 'Guias Oficiales Binance', href: '/#guias', icon: FaBtc, description: 'Lo que todo comerciante debe tener.' },
]

const company: NavItem[] = [{ name: 'Sobre Nosotros', href: '/#nosotros', icon: FaRocket }]

function classNames(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export default function NavbarReact() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [isToolsOpen, setIsToolsOpen] = useState(false)
  const [isCompanyOpen, setIsCompanyOpen] = useState(false)

  // Logica de fecha dinamica para Mobile
  const startYear = 2025;
  const now = new Date();
  const currentYear = now.getFullYear();
  const monthName = now.toLocaleString('es-ES', { month: 'long' });
  const currentMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const yearDisplay = currentYear > startYear ? `${startYear} - ${currentYear}` : `${startYear}`;
  const displayFullDate = `${yearDisplay} ${currentMonth}`;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNavigation = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    setIsToolsOpen(false);
    setIsCompanyOpen(false);
    setMobileMenuOpen(false);

    if (href.startsWith('#') || (href.startsWith('/#') && window.location.pathname === '/')) {
      const targetId = href.split('#')[1] || href.split('#')[0];
      const elem = document.getElementById(targetId.replace('/', ''));
      if (elem) {
        e.preventDefault();
        elem.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const handleOpenSentinelModal = () => {
    setMobileMenuOpen(false);
    setIsToolsOpen(false);
    setIsCompanyOpen(false);
    if (typeof window !== 'undefined' && (window as any).openModal) {
      (window as any).openModal('Pro'); 
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] w-full font-sans">
      <div className="h-[3px] w-full bg-gradient-to-r from-[#F3BA2F] via-[#ffdb4d] to-[#F3BA2F]" />
      
      <header className={classNames(
        "transition-all duration-300", 
        scrolled ? "bg-[#0b0e11]/95 backdrop-blur-md shadow-2xl py-3" : "bg-[#0b0e11] py-5"
      )}>
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex lg:flex-1">
            <a href="/" className="flex items-center gap-3 transition-transform hover:scale-105">
              <img className="h-10 w-auto" src="/img/logo.png" alt="Logo Digital Level" />
              <span className="text-xl font-bold text-white tracking-tighter uppercase">
                DIGITA<span className="text-[#F3BA2F]">LEVEL</span>
              </span>
            </a>
          </div>

          <div className="flex lg:hidden">
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="text-gray-400 p-2.5 outline-none hover:text-white transition-colors">
              <Bars3Icon className="h-8 w-8" />
            </button>
          </div>

          <div className="hidden lg:flex lg:gap-x-8 items-center">
            {/* HERRAMIENTAS DESKTOP */}
            <div className="relative py-2" onMouseEnter={() => setIsToolsOpen(true)} onMouseLeave={() => setIsToolsOpen(false)}>
              <button className={classNames("flex items-center gap-x-1 text-sm font-black uppercase tracking-widest transition-colors", isToolsOpen ? "text-[#F3BA2F]" : "text-gray-300 hover:text-[#F3BA2F]")}>
                Herramientas <ChevronDownIcon className={classNames("h-4 w-4 transition-transform duration-300", isToolsOpen ? "rotate-180" : "")} />
              </button>
              <Transition show={isToolsOpen} enter="transition duration-200" enterFrom="opacity-0 translate-y-2" enterTo="opacity-100 translate-y-0" leave="transition duration-150" leaveFrom="opacity-100 translate-y-0" leaveTo="opacity-0 translate-y-2">
                <div className="absolute -left-8 top-full pt-4 w-screen max-w-md">
                  <div className="rounded-2xl bg-[#181a20] border border-gray-800 p-4 shadow-2xl">
                    {services.map((item) => (
                      <a key={item.name} href={item.href} onClick={(e) => handleNavigation(e, item.href)} className="group flex items-center gap-x-6 rounded-xl p-4 hover:bg-white/5 transition-all">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-800 group-hover:bg-[#F3BA2F]">
                          <item.icon className="h-5 w-5 text-gray-400 group-hover:text-black" />
                        </div>
                        <div>
                          <div className="font-bold text-white">{item.name} {item.badge && <span className="ml-2 bg-[#F3BA2F]/20 text-[#F3BA2F] text-[9px] px-2 py-0.5 rounded border border-[#F3BA2F]/30">{item.badge}</span>}</div>
                          <p className="text-gray-500 text-xs mt-1">{item.description}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </Transition>
            </div>

            <a href="/#precios" onClick={(e) => handleNavigation(e, '/#precios')} className="text-sm font-black text-gray-300 hover:text-[#F3BA2F] uppercase tracking-widest transition-colors">Precios</a>

            <div className="relative py-2" onMouseEnter={() => setIsCompanyOpen(true)} onMouseLeave={() => setIsCompanyOpen(false)}>
              <button className={classNames("flex items-center gap-x-1 text-sm font-black uppercase tracking-widest transition-colors", isCompanyOpen ? "text-[#F3BA2F]" : "text-gray-300 hover:text-[#F3BA2F]")}>
                Comunidad <ChevronDownIcon className="h-4 w-4" />
              </button>
              <Transition show={isCompanyOpen} className="absolute -left-8 top-full pt-4 w-56">
                <div className="rounded-2xl bg-[#181a20] border border-gray-800 p-2 shadow-2xl">
                  {company.map((item) => (
                    <a key={item.name} href={item.href} onClick={(e) => handleNavigation(e, item.href)} className="flex items-center gap-x-3 rounded-lg p-3 text-sm font-bold text-gray-400 hover:bg-white/5 hover:text-[#F3BA2F]">
                      <item.icon className="h-4 w-4" /> {item.name}
                    </a>
                  ))}
                </div>
              </Transition>
            </div>
          </div>

          <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-6 items-center">
            <a href="/login" className="text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white transition-colors">Login</a>
            <button onClick={handleOpenSentinelModal} className="bg-[#F3BA2F] text-black px-5 py-2.5 rounded-xl font-black text-xs uppercase hover:bg-[#ffdb4d] transition-all flex items-center gap-2 group">
              <FaShieldAlt className="text-base group-hover:rotate-12 transition-transform" /> Binance Sentinel
            </button>
          </div>
        </nav>

        {/* MOVIL */}
        <Dialog as="div" className="lg:hidden" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
          <div className="fixed inset-0 z-[100100] bg-[#0b0e11]/90 backdrop-blur-xl" />
          <Dialog.Panel className="fixed inset-y-0 right-0 z-[100101] w-full bg-[#0b0e11] px-6 py-6 overflow-y-auto">
            <div className="flex items-start justify-between mb-10">
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <img src="/img/logo.png" alt="Logo Digital Level" className="h-10 w-10 shrink-0 object-contain rounded-full ring-1 ring-[#F3BA2F]/30" />
                <div className="min-w-0 leading-tight">
                  <p className="text-[clamp(16px,5.4vw,21px)] font-black text-white uppercase tracking-[0.08em]">
                    DIGITAL <span className="text-[#F3BA2F]">LEVEL</span>
                  </p>
                  <p className="mt-1 text-[10px] uppercase font-black tracking-[0.16em] text-gray-500">
                    Sentinel Core v2.0
                  </p>
                </div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="text-gray-400 p-2 ml-1 shrink-0 hover:text-white transition-colors">
                <XMarkIcon className="h-8 w-8" />
              </button>
            </div>
            
            <div className="space-y-4">
              <Disclosure as="div">
                {({ open }) => (
                  <>
                    <Disclosure.Button className="flex w-full items-center justify-between rounded-xl py-4 px-4 text-lg sm:text-xl font-black text-white hover:bg-white/5 uppercase">
                      Herramientas <ChevronDownIcon className={classNames(open ? 'rotate-180' : '', 'h-6 w-6 text-[#F3BA2F]')} />
                    </Disclosure.Button>
                    <Disclosure.Panel className="mt-2 space-y-1 px-4 border-l-2 border-[#F3BA2F]/20 ml-4">
                      {services.map((item) => ( <a key={item.name} href={item.href} onClick={(e) => handleNavigation(e, item.href)} className="block py-3 text-gray-400 font-bold text-base sm:text-lg">{item.name}</a> ))}
                    </Disclosure.Panel>
                  </>
                )}
              </Disclosure>
              <a href="/#precios" onClick={(e) => handleNavigation(e, '/#precios')} className="block py-4 px-4 text-lg sm:text-xl font-black text-white uppercase tracking-tight">Precios</a>
              <a href="/login" onClick={(e) => handleNavigation(e, '/login')} className="block py-4 px-4 text-lg sm:text-xl font-black text-white uppercase tracking-tight rounded-xl border border-[#F3BA2F]/20 bg-[#F3BA2F]/5">Iniciar Sesion</a>
            </div>

            <div className="mt-16 py-8 border-t border-gray-800/50 text-center">
              <button onClick={handleOpenSentinelModal} className="w-full bg-[#F3BA2F] text-black font-black py-5 rounded-2xl shadow-xl text-lg uppercase">Binance Sentinel</button>
              
              <div className="mt-8 space-y-1">
                <p className="text-[10px] uppercase font-black text-[#F3BA2F] tracking-widest">In God We Trust</p>
                <p className="text-[9px] uppercase font-bold text-gray-500 tracking-tighter">
                  © {displayFullDate} Digita Level
                </p>
              </div>
            </div>
          </Dialog.Panel>
        </Dialog>
      </header>
    </div>
  )
}
