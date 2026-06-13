// Tutorial stepper. Each step animates 25 balls at 2× speed and pauses.
// Finishing sets the localStorage flag that unlocks room entry on the landing.
(function () {
    const STEPS = window.TUTORIAL_STEPS || [];
    const BALLS = 25;
    const DONE_KEY = 'factory-market.tutorialDone';
    const $ = (id) => document.getElementById(id);

    let i = 0, replay = null;

    function renderDots() {
        $('tut-dots').innerHTML = STEPS.map((_, k) =>
            `<span class="dot ${k === i ? 'on' : ''} ${k < i ? 'done' : ''}"></span>`).join('');
    }
    function load() {
        const step = STEPS[i];
        $('tut-step').textContent = `Step ${i + 1} of ${STEPS.length}`;
        $('tut-title').textContent = step.title;
        $('tut-body').textContent = step.body;
        $('tut-back').disabled = (i === 0);
        $('tut-next').textContent = (i === STEPS.length - 1) ? 'Start playing →' : 'Next ›';
        renderDots();
        if (!replay) replay = new FactoryReplay($('factory-canvas'), { speed: 2 });
        replay.load(JSON.parse(JSON.stringify(step.level)), 1000 + i, BALLS);
    }

    $('tut-next').onclick = () => {
        if (i < STEPS.length - 1) { i++; load(); }
        else { localStorage.setItem(DONE_KEY, '1'); location.href = 'index.html'; }
    };
    $('tut-back').onclick = () => { if (i > 0) { i--; load(); } };
    $('tut-replay').onclick = () => { if (replay) replay.restart(); };

    load();
})();
