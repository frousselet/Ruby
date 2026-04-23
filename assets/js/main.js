(function () {
    pagination(true);

    // Split the site title into per-character spans so the CSS
    // continuous focus-breathe animation can stagger via --i.
    // Skipped for image logos.
    document.querySelectorAll('.gh-head-logo').forEach(logo => {
        if (logo.querySelector('img')) return;
        const text = logo.textContent.trim();
        if (!text) return;
        logo.setAttribute('aria-label', text);
        const chars = [...text];
        const lastIndex = chars.length - 1 || 1;
        logo.innerHTML = chars.map((char, i) => {
            const c = char === ' ' ? '\u00A0' : char;
            const r = (Math.random() * 2 - 1).toFixed(3);       // -1..1 — jitter on delay
            const a = (0.7 + Math.random() * 0.6).toFixed(3);   // 0.7..1.3 — amplitude multiplier
            const pos = (2 * i) / lastIndex - 1;                 // -1..+1 — position from centre
            const absPos = Math.abs(pos).toFixed(3);             // 0 at centre, 1 at the ends
            return `<span class="gh-head-logo-char" style="--i: ${i}; --r: ${r}; --a: ${a}; --pos: ${pos.toFixed(3)}; --abs-pos: ${absPos}" aria-hidden="true">${c}</span>`;
        }).join('');

        // Trigger the intro wave; remove the class once the whole staggered
        // animation has settled so :hover can take over cleanly without
        // replaying the intro when the cursor leaves.
        logo.classList.add('is-intro');
        const settleMs = 700 + chars.length * 40 + 100;
        setTimeout(() => logo.classList.remove('is-intro'), settleMs);
    });

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
