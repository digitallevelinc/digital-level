import { useState, useEffect } from 'react'
import { Dialog, Popover, Transition } from '@headlessui/react'
import { Bars3Icon, XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { 
  FaCalculator, 
  FaRocket, 
  FaBtc,
  FaSyncAlt,
  FaShieldAlt
} from 'react-icons/fa'

const services = [
  { 
    name: 'Calculadora P2P', 
    href: '/calculadora', 
    icon: FaCalculator, 
    description: 'Calcula tus arbitrajes en tiempo real.', 
    badge: 'FREE' 
  },
  { 
    name: 'Sincronización P2P', 
    href: '#ecosistema', 
    icon: FaSyncAlt, 
    description: 'Conexión directa con Binance, TG y Discord.' 
  },
  { 
    name: 'Guías Oficiales Binance', 
    href: '#guias', 
    icon: FaBtc, 
    description: 'Lo que todo comerciante debe tener.' 
  },
]

const company = [
  { name: 'Sobre Nosotros', href: '#nosotros', icon: FaRocket },
]

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function NavbarReact() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

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
        elem.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  // NUEVA FUNCIÓN: Abre el RegistrationModal.astro
  const handleOpenSentinelModal = () => {
    setMobileMenuOpen(false);
    // Verificamos que la función openModal exista en el objeto window (definida por el componente Astro)
    if (typeof window !== 'undefined' && (window as any).openModal) {
      (window as any).openModal('Pro'); 
    } else {
      console.warn("El componente RegistrationModal no parece estar cargado.");
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

          <div className="flex lg:hidden">
            <button onClick={() => setMobileMenuOpen(true)} className="text-gray-400 p-2.5 outline-none">
              <Bars3Icon className="h-8 w-8" />
            </button>
          </div>

          <Popover.Group className="hidden lg:flex lg:gap-x-8 items-center">
            {/* ... Menús de Herramientas y Comunidad se mantienen igual ... */}
            <Popover className="relative">
              {({ close }) => (
                <>
                  <Popover.Button className="flex items-center gap-x-1 text-sm font-semibold text-gray-300 hover:text-[#F3BA2F] uppercase outline-none transition-colors">
                    HERRAMIENTAS <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                  </Popover.Button>
                  <Transition 
                    enter="transition duration-200" enterFrom="opacity-0 translate-y-1" enterTo="opacity-100 translate-y-0" 
                    leave="transition duration-150" leaveFrom="opacity-100 translate-y-0" leaveTo="opacity-0 translate-y-1"
                  >
                    <Popover.Panel className="absolute -left-8 top-full z-10 mt-3 w-screen max-md rounded-2xl bg-[#181a20] border border-gray-800 p-4 shadow-2xl">
                      {services.map((item) => (
                        <a 
                          key={item.name} 
                          href={item.href} 
                          onClick={(e) => {
                            close();
                            handleScrollTo(e, item.href);
                          }}
                          className="group relative flex items-center gap-x-6 rounded-lg p-4 hover:bg-white/5 transition-all"
                        >
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-800 group-hover:bg-[#F3BA2F]/10">
                            <item.icon className="h-6 w-6 text-gray-400 group-hover:text-[#F3BA2F]" />
                          </div>
                          <div>
                            <div className="font-semibold text-white">
                              {item.name} 
                              {item.badge && <span className="ml-2 bg-[#F3BA2F]/10 text-[#F3BA2F] text-[10px] px-2 py-1 rounded-md animate-pulse">{item.badge}</span>}
                            </div>
                            <p className="text-gray-400 text-sm">{item.description}</p>
                          </div>
                        </a>
                      ))}
                    </Popover.Panel>
                  </Transition>
                </>
              )}
            </Popover>

            <a href="#precios" onClick={(e) => handleScrollTo(e, '#precios')} className="text-sm font-semibold text-gray-300 hover:text-[#F3BA2F] uppercase transition-colors">PRECIOS</a>

            <Popover className="relative">
              {({ close }) => (
                <>
                  <Popover.Button className="flex items-center gap-x-1 text-sm font-semibold text-gray-300 hover:text-[#F3BA2F] uppercase outline-none transition-colors">
                    COMUNIDAD <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                  </Popover.Button>
                  <Transition enter="transition duration-200" enterFrom="opacity-0 translate-y-1" enterTo="opacity-100 translate-y-0">
                    <Popover.Panel className="absolute -left-8 top-full z-10 mt-3 w-56 rounded-2xl bg-[#181a20] border border-gray-800 p-2 shadow-2xl">
                      {company.map((item) => (
                        <a 
                          key={item.name} 
                          href={item.href} 
                          onClick={(e) => {
                            close();
                            handleScrollTo(e, item.href);
                          }} 
                          className="flex items-center gap-x-3 rounded-lg p-3 text-sm font-semibold text-gray-300 hover:bg-white/5 hover:text-[#F3BA2F] transition-all"
                        >
                          <item.icon className="h-5 w-5 text-gray-500" /> {item.name}
                        </a>
                      ))}
                    </Popover.Panel>
                  </Transition>
                </>
              )}
            </Popover>
          </Popover.Group>

          <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-4 items-center">
            <a href="/login" className="text-sm font-semibold text-white hover:text-[#F3BA2F]">Iniciar Sesión</a>
            
            {/* BOTÓN DESKTOP: Ahora abre el Modal */}
            <button 
                onClick={handleOpenSentinelModal} 
                className="bg-[#F3BA2F] text-black px-8 py-4 rounded-xl font-extrabold text-lg hover:scale-105 transition-all shadow-[0_0_30px_rgba(243,186,47,0.3)] flex items-center justify-center gap-2"
            >
                <FaShieldAlt className="text-xl" />
                BINANCE SENTINEL
            </button>
        </div>
        </nav>

        {/* Mobile Menu */}
        <Dialog as="div" className="lg:hidden" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
          <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm" />
          <Dialog.Panel className="fixed inset-y-0 right-0 z-[110] w-full bg-[#0b0e11] px-6 py-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold text-white uppercase tracking-tighter">
                DIGITAL<span className="text-[#F3BA2F]">LEVEL</span>
              </span>
              <button onClick={() => setMobileMenuOpen(false)} className="text-gray-400 p-2.5 outline-none">
                <XMarkIcon className="h-7 w-7" />
              </button>
            </div>
            
            <div className="mt-8 flex flex-col h-[calc(100vh-120px)]">
              <div className="flex-1 space-y-4 overflow-y-auto">
                <a href="/calculadora" className="block text-white font-bold text-lg border-b border-gray-800 pb-2">Calculadora P2P</a>
                <a href="#ecosistema" onClick={(e) => handleScrollTo(e, '#ecosistema')} className="block text-white font-bold text-lg border-b border-gray-800 pb-2">Sincronización</a>
                <a href="#guias" onClick={(e) => handleScrollTo(e, '#guias')} className="block text-white font-bold text-lg border-b border-gray-800 pb-2">Guías Binance</a>
                <a href="#precios" onClick={(e) => handleScrollTo(e, '#precios')} className="block text-white font-bold text-lg border-b border-gray-800 pb-2">Precios</a>
                <a href="/login" className="block text-white font-bold text-lg border-b border-gray-800 pb-2">Iniciar Sesión</a>
              </div>
              
              <div className="py-8 border-t border-gray-800 text-center bg-[#0b0e11]">
                {/* BOTÓN MOBILE: Ahora abre el Modal */}
                <button 
                  onClick={handleOpenSentinelModal} 
                  className="inline-block w-full bg-[#F3BA2F] text-black font-black py-4 rounded-full mb-6 shadow-lg shadow-[#F3BA2F]/10 hover:bg-[#ffdb4d] transition-colors"
                >
                  BINANCE SENTINEL
                </button>
                <p className="text-[10px] uppercase font-bold tracking-[0.3em] text-[#F3BA2F] mb-2">IN GOD WE TRUST</p>
                <p className="text-xs text-gray-500">&copy; 2026 Digital Level INC</p>
              </div>
            </div>
          </Dialog.Panel>
        </Dialog>
      </header>
    </div>
  )
}