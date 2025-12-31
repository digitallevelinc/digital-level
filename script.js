// Cambio de color en Navbar al hacer scroll
window.addEventListener('scroll', function() {
    const nav = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        nav.style.background = '#0b0e11';
        nav.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
    } else {
        nav.style.background = 'transparent';
        nav.style.boxShadow = 'none';
    }
});

// Scroll suave para los enlaces
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});