import { useState, useEffect } from 'react'
import { Dialog, Transition, Disclosure } from '@headlessui/react'
import { Bars3Icon, XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { 
  FaCalculator, FaRocket, FaBtc, FaSyncAlt, FaShieldAlt 
} from 'react-icons/fa'

const services = [
  { name: 'Calculadora P2P', href: '/calculadora', icon: FaCalculator, description: 'Calcula tus arbitrajes en tiempo real.', badge: 'FREE' },
  { name: 'Sincronización P2P', href: '#ecosistema', icon: FaSyncAlt, description: 'Conexión directa con Binance, TG y Discord.' },
  { name: 'Guías Oficiales Binance', href: '#guias', icon: FaBtc, description: 'Lo que todo comerciante debe tener.' },
]

const company = [{ name: 'Sobre Nosotros', href: '#nosotros', icon: FaRocket }]

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function NavbarReact() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  
  // Estados para controlar el HOVER en Desktop
  const [isToolsOpen, setIsToolsOpen] = useState(false)
  const [isCompanyOpen, setIsCompanyOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleScrollTo = (e, href) => {
    if (href.startsWith('#')) {
      e.preventDefault();
      const targetId = href.replace('#', '');
      const elem = document.getElementById(targetId);
      if (elem) {
        setMobileMenuOpen(false);
        setIsToolsOpen(false);
        setIsCompanyOpen(false);
        elem.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const handleOpenSentinelModal = () => {
    setMobileMenuOpen(false);
    setIsToolsOpen(false);
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
              <img className="h-10 w-auto" src="/img/logo.png" alt="Logo" />
              <span className="text-xl font-bold text-white tracking-tighter">
                DIGITAL<span className="text-[#F3BA2F]">LEVEL</span>
              </span>
            </a>
          </div>

          {/* Hamburguesa Móvil */}
          <div className="flex lg:hidden">
            <button onClick={() => setMobileMenuOpen(true)} className="text-gray-400 p-2.5 outline-none">
              <Bars3Icon className="h-8 w-8" />
            </button>
          </div>

          {/* MENU DESKTOP CON HOVER */}
          <div className="hidden lg:flex lg:gap-x-8 items-center">
            
            {/* HERRAMIENTAS */}
            <div 
              className="relative py-2"
              onMouseEnter={() => setIsToolsOpen(true)}
              onMouseLeave={() => setIsToolsOpen(false)}
            >
              <button className={classNames(
                "flex items-center gap-x-1 text-sm font-semibold uppercase outline-none transition-colors",
                isToolsOpen ? "text-[#F3BA2F]" : "text-gray-300 hover:text-[#F3BA2F]"
              )}>
                HERRAMIENTAS 
                <ChevronDownIcon className={classNames("h-5 w-5 transition-transform", isToolsOpen ? "rotate-180" : "")} />
              </button>

              <Transition
                show={isToolsOpen}
                enter="transition duration-200 ease-out"
                enterFrom="opacity-0 translate-y-1"
                enterTo="opacity-100 translate-y-0"
                leave="transition duration-150 ease-in"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 translate-y-1"
              >
                <div className="absolute -left-8 top-full pt-4 w-screen max-w-md">
                  <div className="rounded-2xl bg-[#181a20] border border-gray-800 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                    {services.map((item) => (
                      <a key={item.name} href={item.href} onClick={(e) => handleScrollTo(e, item.href)} className="group relative flex items-center gap-x-6 rounded-xl p-4 hover:bg-white/5 transition-all">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-800 group-hover:bg-[#F3BA2F]/10">
                          <item.icon className="h-6 w-6 text-gray-400 group-hover:text-[#F3BA2F]" />
                        </div>
                        <div>
                          <div className="font-semibold text-white">{item.name} {item.badge && <span className="ml-2 bg-[#F3BA2F]/10 text-[#F3BA2F] text-[10px] px-2 py-1 rounded-md">{item.badge}</span>}</div>
                          <p className="text-gray-400 text-sm">{item.description}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </Transition>
            </div>

            <a href="#precios" onClick={(e) => handleScrollTo(e, '#precios')} className="text-sm font-semibold text-gray-300 hover:text-[#F3BA2F] uppercase transition-colors">PRECIOS</a>

            {/* COMUNIDAD */}
            <div 
              className="relative py-2"
              onMouseEnter={() => setIsCompanyOpen(true)}
              onMouseLeave={() => setIsCompanyOpen(false)}
            >
              <button className={classNames(
                "flex items-center gap-x-1 text-sm font-semibold uppercase outline-none transition-colors",
                isCompanyOpen ? "text-[#F3BA2F]" : "text-gray-300 hover:text-[#F3BA2F]"
              )}>
                COMUNIDAD 
                <ChevronDownIcon className={classNames("h-5 w-5 transition-transform", isCompanyOpen ? "rotate-180" : "")} />
              </button>

              <Transition
                show={isCompanyOpen}
                enter="transition duration-200 ease-out"
                enterFrom="opacity-0 translate-y-1"
                enterTo="opacity-100 translate-y-0"
                leave="transition duration-150 ease-in"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 translate-y-1"
              >
                <div className="absolute -left-8 top-full pt-4 w-56">
                  <div className="rounded-2xl bg-[#181a20] border border-gray-800 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                    {company.map((item) => (
                      <a key={item.name} href={item.href} onClick={(e) => handleScrollTo(e, item.href)} className="flex items-center gap-x-3 rounded-lg p-3 text-sm font-semibold text-gray-300 hover:bg-white/5 hover:text-[#F3BA2F] transition-all">
                        <item.icon className="h-5 w-5 text-gray-500" /> {item.name}
                      </a>
                    ))}
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          {/* Botones Derecha */}
          <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-4 items-center">
            <a href="/login" className="text-sm font-semibold text-white hover:text-[#F3BA2F]">Iniciar Sesión</a>
            <button onClick={handleOpenSentinelModal} className="bg-[#F3BA2F] text-black px-8 py-4 rounded-xl font-extrabold text-lg hover:scale-105 transition-all shadow-[0_0_30px_rgba(243,186,47,0.3)] flex items-center justify-center gap-2">
              <FaShieldAlt className="text-xl" /> BINANCE SENTINEL
            </button>
          </div>
        </nav>

        {/* MOBILE DIALOG (Mantiene su lógica de click porque en móvil NO hay hover) */}
        <Dialog as="div" className="lg:hidden" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
          <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm" />
          <Dialog.Panel className="fixed inset-y-0 right-0 z-[110] w-full bg-[#0b0e11] px-6 py-6 shadow-2xl overflow-y-auto">
             <div className="flex items-center justify-between mb-8">
              <span className="text-xl font-bold text-white uppercase tracking-tighter">DIGITAL<span className="text-[#F3BA2F]">LEVEL</span></span>
              <button onClick={() => setMobileMenuOpen(false)} className="text-gray-400 p-2.5 outline-none"><XMarkIcon className="h-7 w-7" /></button>
            </div>
            <div className="space-y-2">
              <Disclosure as="div" className="-mx-3">
                {({ open }) => (
                  <>
                    <Disclosure.Button className="flex w-full items-center justify-between rounded-lg py-3 px-3 text-lg font-bold text-white hover:bg-gray-800 uppercase">
                      Herramientas <ChevronDownIcon className={classNames(open ? 'rotate-180' : '', 'h-6 w-6 transition-transform text-gray-500')} />
                    </Disclosure.Button>
                    <Disclosure.Panel className="mt-2 space-y-2 px-4 border-l-2 border-[#F3BA2F]/30 ml-2">
                      {services.map((item) => ( <a key={item.name} href={item.href} onClick={(e) => handleScrollTo(e, item.href)} className="block py-2 text-gray-300 font-medium">{item.name}</a> ))}
                    </Disclosure.Panel>
                  </>
                )}
              </Disclosure>
              <a href="#precios" onClick={(e) => handleScrollTo(e, '#precios')} className="block py-3 text-lg font-bold text-white uppercase">Precios</a>
              <Disclosure as="div" className="-mx-3">
                {({ open }) => (
                  <>
                    <Disclosure.Button className="flex w-full items-center justify-between rounded-lg py-3 px-3 text-lg font-bold text-white hover:bg-gray-800 uppercase">
                      Comunidad <ChevronDownIcon className={classNames(open ? 'rotate-180' : '', 'h-6 w-6 transition-transform text-gray-500')} />
                    </Disclosure.Button>
                    <Disclosure.Panel className="mt-2 space-y-2 px-4 border-l-2 border-[#F3BA2F]/30 ml-2">
                      {company.map((item) => ( <a key={item.name} href={item.href} onClick={(e) => handleScrollTo(e, item.href)} className="block py-2 text-gray-300 font-medium">{item.name}</a> ))}
                    </Disclosure.Panel>
                  </>
                )}
              </Disclosure>
              <a href="/login" className="block py-3 text-lg font-bold text-white uppercase">Iniciar Sesión</a>
            </div>
            <div className="mt-10 py-8 border-t border-gray-800 text-center">
              <button onClick={handleOpenSentinelModal} className="w-full bg-[#F3BA2F] text-black font-black py-4 rounded-full mb-6 shadow-lg shadow-[#F3BA2F]/10">BINANCE SENTINEL</button>
              <p className="text-[10px] uppercase font-bold tracking-[0.3em] text-[#F3BA2F] mb-2">IN GOD WE TRUST</p>
              <p className="text-xs text-gray-500">&copy; 2026 Digital Level INC</p>
            </div>
          </Dialog.Panel>
        </Dialog>
      </header>
    </div>
  )
}