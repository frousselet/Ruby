(function () {
    pagination(true);

    // Scroll-based parallax for full-width Koenig images.
    // Runs per-frame via rAF; honors prefers-reduced-motion.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const images = document.querySelectorAll('.kg-card.kg-image-card.kg-width-full > .kg-image');
    if (!images.length) return;

    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const maxOffset = isMobile ? 40 : 120; // px, one direction
    const scale = isMobile ? 1.15 : 1.4;

    let ticking = false;
    let visible = [];

    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                if (!visible.includes(e.target)) visible.push(e.target);
            } else {
                visible = visible.filter(el => el !== e.target);
            }
        });
        update();
    }, { rootMargin: '50px 0px' });

    images.forEach(img => io.observe(img));

    function update() {
        const vh = window.innerHeight;
        visible.forEach(img => {
            const rect = img.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            // progress: -1 when center is at viewport bottom, +1 when at top
            const progress = Math.max(-1, Math.min(1, (vh / 2 - center) / (vh / 2)));
            const y = progress * maxOffset;
            img.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`;
        });
    }

    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            update();
            ticking = false;
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    update();
})();
