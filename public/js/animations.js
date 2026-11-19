/**
 * animations.js — True 2D Animation Engine & Shuffle/Deal Choreography
 * Hippo / Comfun Call Break Style
 */

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };

const wait = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

function getCenter(el) {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function animateElement(el, keyframes, options) {
  el.style.willChange = 'transform, opacity';
  const a = el.animate(keyframes, {
    fill: 'forwards',
    easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
    ...options
  });
  return a.finished.finally(() => {
    el.style.willChange = '';
  });
}

/**
 * Build Playing Card matching the game screenshot
 */
function buildCard(card, isFaceUp = true) {
  const el = document.createElement('div');

  if (isFaceUp && card) {
    el.className = `card card-face suit-${card.suit}`;
    el.dataset.cardId = card.id;

    const sym = SUIT_SYMBOLS[card.suit] || '♠';
    const isCourt = ['J', 'Q', 'K'].includes(card.rank);

    let centerHtml = `<span class="card-center-pip">${sym}</span>`;
    if (isCourt) {
      const crown = card.rank === 'K' ? '♚' : (card.rank === 'Q' ? '♛' : '⚔');
      centerHtml = `
        <div class="court-crest">
          <span class="court-crest-crown">${crown}</span>
          <span class="court-crest-rank">${card.rank}</span>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="card-corner top-left">
        <span class="card-rank">${card.rank}</span>
        <span class="card-mini-suit">${sym}</span>
      </div>
      <div class="card-center">${centerHtml}</div>
      <div class="card-corner bottom-right">
        <span class="card-rank">${card.rank}</span>
        <span class="card-mini-suit">${sym}</span>
      </div>
    `;
  } else {
    // Burgundy ornate card back matching screenshot
    el.className = 'card card-back';
    el.innerHTML = `<div class="card-back-ornament">♠</div>`;
  }

  return el;
}

/**
 * Render Opponents' Fanned Card Decks (Matching Screenshot)
 */
function renderOpponentFans() {
  ['top', 'left', 'right'].forEach(pos => {
    const fanEl = document.getElementById(`fan-${pos}`);
    if (!fanEl) return;
    if (fanEl.children.length === 0) {
      for (let i = 0; i < 6; i++) {
        const back = document.createElement('div');
        back.className = 'card card-back';
        back.innerHTML = `<div class="card-back-ornament">♠</div>`;
        fanEl.appendChild(back);
      }
    }
  });
}

/**
 * Flip card face up using smooth scaleX
 */
async function flipCard(cardEl, realCard, durationMs = 240) {
  cardEl.style.transition = `transform ${durationMs / 2}ms ease-in`;
  cardEl.style.transform = 'scaleX(0)';

  await wait(durationMs / 2);

  const sym = SUIT_SYMBOLS[realCard.suit] || '♠';
  const isCourt = ['J', 'Q', 'K'].includes(realCard.rank);
  let centerHtml = `<span class="card-center-pip">${sym}</span>`;
  if (isCourt) {
    const crown = realCard.rank === 'K' ? '♚' : (realCard.rank === 'Q' ? '♛' : '⚔');
    centerHtml = `
      <div class="court-crest">
        <span class="court-crest-crown">${crown}</span>
        <span class="court-crest-rank">${realCard.rank}</span>
      </div>
    `;
  }

  cardEl.className = `card card-face suit-${realCard.suit}`;
  cardEl.dataset.cardId = realCard.id;
  cardEl.innerHTML = `
    <div class="card-corner top-left">
      <span class="card-rank">${realCard.rank}</span>
      <span class="card-mini-suit">${sym}</span>
    </div>
    <div class="card-center">${centerHtml}</div>
    <div class="card-corner bottom-right">
      <span class="card-rank">${realCard.rank}</span>
      <span class="card-mini-suit">${sym}</span>
    </div>
  `;

  cardEl.style.transition = `transform ${durationMs / 2}ms ease-out`;
  cardEl.style.transform = 'scaleX(1)';

  await wait(durationMs / 2);
  cardEl.style.transition = '';
}

/**
 * Apply gentle curve / overlap to hand fan
 */
function applyFanTransforms(handFan) {
  const cards = [...handFan.children].filter(c => c.classList.contains('card'));
  const n = cards.length;
  if (!n) return;

  cards.forEach((card, i) => {
    const offset = i - (n - 1) / 2;
    const rotDeg = offset * 1.2;
    const yPx = Math.abs(offset) * 1.6;
    card.style.transform = `rotate(${rotDeg}deg) translateY(${yPx}px)`;
  });
}

class AnimQueue {
  constructor() {
    this.queue = [];
    this.running = false;
    this.inputLocked = false;
    this.isDealing = false;
    this._speed = 'normal';
    this._lite = false;
    this._mult = 1;
  }

  d(ms) {
    return ms * this._mult;
  }

  setSpeed(speedName) {
    this._speed = speedName;
    this._mult = { slow: 1.4, normal: 1, fast: 0.6 }[speedName] || 1;
    if (this._lite) this._mult = 0.35;
  }

  setLite(on) {
    this._lite = on;
    this._mult = on ? 0.35 : ({ slow: 1.4, normal: 1, fast: 0.6 }[this._speed] || 1);
    document.body.classList.toggle('lite-mode', on);
  }

  push(sceneFn) {
    this.queue.push(sceneFn);
    if (!this.running) this._run();
  }

  async _run() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const scene = this.queue.shift();
      try {
        await scene(this);
      } catch (err) {
        console.warn('Animation error:', err);
      }
    }

    this.running = false;
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SCENE 1: SHUFFLE ANIMATION (~0.8s)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function sceneShuffle(aq) {
  const deckZone = document.getElementById('deckZone');
  const shuffleCards = document.getElementById('shuffleCards');
  const label = document.getElementById('shuffleLabel');
  if (!deckZone) return;

  const targetContainer = shuffleCards || deckZone;
  targetContainer.innerHTML = '';

  if (label) {
    label.style.display = 'block';
    label.textContent = 'Shuffling Cards…';
  }

  window.soundFX?.playCardSlide?.();

  const pileLeft = document.createElement('div');
  pileLeft.className = 'shuffle-stack';
  for (let i = 0; i < 4; i++) {
    const c = buildCard(null, false);
    c.style.position = 'absolute';
    c.style.transform = `translateY(${-i * 1}px)`;
    pileLeft.appendChild(c);
  }

  const pileRight = document.createElement('div');
  pileRight.className = 'shuffle-stack';
  for (let i = 0; i < 4; i++) {
    const c = buildCard(null, false);
    c.style.position = 'absolute';
    c.style.transform = `translateY(${-i * 1}px)`;
    pileRight.appendChild(c);
  }

  targetContainer.appendChild(pileLeft);
  targetContainer.appendChild(pileRight);

  if (aq._lite) {
    await wait(aq.d(200));
    targetContainer.innerHTML = '';
    if (label) label.style.display = 'none';
    return;
  }

  // Split piles left & right
  await Promise.all([
    animateElement(pileLeft, [{ transform: 'translateX(0)' }, { transform: 'translateX(-32px) rotate(-6deg)' }], { duration: aq.d(260) }),
    animateElement(pileRight, [{ transform: 'translateX(0)' }, { transform: 'translateX(32px) rotate(6deg)' }], { duration: aq.d(260) })
  ]);

  await wait(aq.d(50));
  window.soundFX?.playCardSlide?.();

  // Interleave back together in the center
  await Promise.all([
    animateElement(pileLeft, [{ transform: 'translateX(-32px) rotate(-6deg)' }, { transform: 'translateX(0) rotate(0deg)' }], { duration: aq.d(300) }),
    animateElement(pileRight, [{ transform: 'translateX(32px) rotate(6deg)' }, { transform: 'translateX(0) rotate(0deg)' }], { duration: aq.d(300) })
  ]);

  window.soundFX?.playClick?.();

  if (label) label.style.display = 'none';
  await wait(aq.d(80));
  targetContainer.innerHTML = '';
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SCENE 2: CARD DEAL ANIMATION (~1.1s)
   Swift packet dealing to opponents + cascading fan & ripple flip
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function sceneDeal(aq, { publicState, privateState }) {
  aq.isDealing = true;
  try {
    const deckZone = document.getElementById('deckZone');
    const handFan = document.getElementById('handFan');
    const myHand = privateState.hand;
    const mySeat = privateState.seat;
    const dealerSeat = publicState.dealerSeat;

    if (handFan) handFan.innerHTML = '';
    renderOpponentFans();

    const positions = ['bottom', 'right', 'top', 'left'];
    const dealOrder = [
      (dealerSeat + 1) % 4,
      (dealerSeat + 2) % 4,
      (dealerSeat + 3) % 4,
      dealerSeat
    ];

    const deckCenter = getCenter(deckZone);
    const flyEl = document.getElementById('flyCard');

    // 1. Rapid staccato packet deal to each seat
    if (flyEl && !aq._lite) {
      flyEl.innerHTML = `<div class="card card-back"><div class="card-back-ornament">♠</div></div>`;
      flyEl.style.display = 'block';

      for (const seat of dealOrder) {
        const pos = positions[(seat - mySeat + 4) % 4];
        const targetEl = document.getElementById(pos === 'bottom' ? 'handZone' : `seat-${pos}`);
        const dest = getCenter(targetEl);

        const sx = deckCenter.x - 28;
        const sy = deckCenter.y - 40;
        const ex = dest.x - 28;
        const ey = dest.y - 40;

        window.soundFX?.playCardSlide?.();
        await animateElement(flyEl, [
          { transform: `translate(${sx}px, ${sy}px) scale(0.9)`, opacity: 1 },
          { transform: `translate(${ex}px, ${ey}px) scale(1)`, opacity: 1 }
        ], { duration: aq.d(100) });

        await wait(aq.d(20));
      }

      flyEl.style.display = 'none';
    }

    // 2. Cascade 13 face-down cards into player's hand fan
    if (handFan) {
      for (let i = 0; i < myHand.length; i++) {
        const cardBack = buildCard(null, false);
        cardBack.style.opacity = '0';
        cardBack.style.transform = 'translateY(-24px) scale(0.85)';
        handFan.appendChild(cardBack);
      }
      applyFanTransforms(handFan);

      const cards = handFan.querySelectorAll('.card');
      for (let i = 0; i < cards.length; i++) {
        cards[i].style.transition = 'opacity 0.12s ease-out, transform 0.16s cubic-bezier(0.2, 0.9, 0.3, 1)';
        cards[i].style.opacity = '1';
        cards[i].style.transform = '';
        if (i % 4 === 0) window.soundFX?.playCardSlide?.();
        await wait(aq.d(22));
      }

      // 3. Ripple flip each card face up upright from left to right!
      const backCards = [...handFan.querySelectorAll('.card.card-back')];
      if (backCards.length === myHand.length) {
        for (let i = 0; i < backCards.length; i++) {
          await flipCard(backCards[i], myHand[i], aq.d(140));
          await wait(aq.d(15));
        }
      }

      applyFanTransforms(handFan);
    }

    if (deckZone) {
      const shuffleCards = document.getElementById('shuffleCards');
      if (shuffleCards) shuffleCards.innerHTML = '';
    }
  } finally {
    aq.isDealing = false;
  }

  await wait(aq.d(80));
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SCENE 3: CARD PLAYED (Fly from seat to trick cross)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function sceneCardPlayed(aq, { seat, card, mySeat }) {
  const positions = ['bottom', 'right', 'top', 'left'];
  const pos = positions[(seat - mySeat + 4) % 4];
  const trickSlot = document.getElementById(`ts-${pos}`);
  const isMe = seat === mySeat;

  let sourceEl;
  if (isMe) {
    const handFan = document.getElementById('handFan');
    sourceEl = handFan?.querySelector(`[data-card-id="${card.id}"]`);
  } else {
    sourceEl = document.getElementById(`seat-${pos}`);
  }

  const start = getCenter(sourceEl || document.getElementById(`seat-${pos}`));
  const end = getCenter(trickSlot);

  const flyEl = document.getElementById('flyCard');
  if (flyEl && !aq._lite) {
    flyEl.innerHTML = '';
    const visualCard = buildCard(card, true);
    flyEl.appendChild(visualCard);
    flyEl.style.display = 'block';

    const sx = start.x - 28;
    const sy = start.y - 40;
    const ex = end.x - 28;
    const ey = end.y - 40;

    window.soundFX?.playCardSlide?.();

    await animateElement(flyEl, [
      { transform: `translate(${sx}px, ${sy}px) scale(1)`, opacity: 1 },
      { transform: `translate(${ex}px, ${ey}px) scale(0.96)`, opacity: 1 }
    ], { duration: aq.d(200) });

    flyEl.style.display = 'none';
  }

  // Remove card from my hand
  if (isMe) {
    const handFan = document.getElementById('handFan');
    const inHand = handFan?.querySelector(`[data-card-id="${card.id}"]`);
    if (inHand) inHand.remove();
    if (handFan) applyFanTransforms(handFan);
  }

  // Place card in trick slot
  if (trickSlot) {
    trickSlot.innerHTML = '';
    const placed = buildCard(card, true);
    trickSlot.appendChild(placed);
  }

  await wait(aq.d(50));
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SCENE 4: TRICK WON — ALL 4 CARDS SLIDE TO THE WINNER'S SIDE!
   Smooth sliding effect across the wooden table directly to the winner
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function sceneTrickWon(aq, { winnerSeat, mySeat, wasTrump }) {
  const positions = ['bottom', 'right', 'top', 'left'];
  const winPos = positions[(winnerSeat - mySeat + 4) % 4];
  const slots = ['ts-bottom', 'ts-right', 'ts-top', 'ts-left'];

  // 1. Brief 320ms pause so players see the completed trick
  await wait(aq.d(320));

  // 2. Highlight the winning card with a bold golden glow
  const winSlot = document.getElementById(`ts-${winPos}`);
  const winCard = winSlot?.querySelector('.card') || winSlot?.firstChild;
  if (winCard) {
    winCard.style.boxShadow = '0 0 24px 6px #facc15, 0 4px 14px rgba(0,0,0,0.7)';
    winCard.style.zIndex = '10';
  }

  window.soundFX?.playTrickWin?.();
  await wait(aq.d(260));

  // 3. Compute destination coordinates on the winner's side
  let destX = window.innerWidth / 2;
  let destY = window.innerHeight / 2;

  if (winPos === 'bottom') {
    // Slides straight down into user's side (trick stash)
    destX = window.innerWidth / 2;
    destY = window.innerHeight + 100;
  } else if (winPos === 'top') {
    // Slides straight up to top opponent
    const topEl = document.getElementById('seat-top');
    const r = topEl ? topEl.getBoundingClientRect() : null;
    destX = r ? (r.left + r.width / 2) : (window.innerWidth / 2);
    destY = r ? (r.top + r.height / 2) : -80;
  } else if (winPos === 'left') {
    // Slides left to left opponent
    const leftEl = document.getElementById('seat-left');
    const r = leftEl ? leftEl.getBoundingClientRect() : null;
    destX = r ? (r.left + r.width / 2) : -80;
    destY = r ? (r.top + r.height / 2) : (window.innerHeight * 0.42);
  } else if (winPos === 'right') {
    // Slides right to right opponent
    const rightEl = document.getElementById('seat-right');
    const r = rightEl ? rightEl.getBoundingClientRect() : null;
    destX = r ? (r.left + r.width / 2) : (window.innerWidth + 80);
    destY = r ? (r.top + r.height / 2) : (window.innerHeight * 0.42);
  }

  window.soundFX?.playCardSlide?.();

  // 4. Animate ALL 4 cards simultaneously sliding smoothly to the winner's side!
  if (!aq._lite) {
    const anims = slots.map(id => {
      const slot = document.getElementById(id);
      const cardEl = slot?.querySelector('.card') || slot?.firstChild;
      if (!cardEl) return Promise.resolve();

      const cardCenter = getCenter(cardEl);
      const dx = destX - cardCenter.x;
      const dy = destY - cardCenter.y;
      const tilt = dx !== 0 ? (dx > 0 ? 12 : -12) : (dy > 0 ? 0 : 6);

      return animateElement(cardEl, [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.4}px, ${dy * 0.4}px) scale(0.9) rotate(${tilt * 0.5}deg)`, opacity: 0.95, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.4) rotate(${tilt}deg)`, opacity: 0 }
      ], {
        duration: aq.d(420),
        easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
      });
    });

    await Promise.all(anims);
  }

  // 5. As cards arrive on the winner's side, pop the winner's score pill!
  const wonEl = document.getElementById(`won-${winPos}`);
  if (wonEl) {
    const curVal = parseInt(wonEl.textContent, 10);
    if (!isNaN(curVal)) {
      wonEl.textContent = curVal + 1;
    }
    const pill = wonEl.closest('.score-pill');
    if (pill) {
      pill.classList.remove('anim-pop');
      void pill.offsetWidth; // trigger reflow
      pill.classList.add('anim-pop');
      setTimeout(() => pill.classList.remove('anim-pop'), 350);
    }
  }

  // 6. Clear all trick slots
  slots.forEach(id => {
    const s = document.getElementById(id);
    if (s) s.innerHTML = '';
  });

  await wait(aq.d(100));
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SCENE 5: BID POP
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function sceneBidPlaced(aq, { seat, bid, mySeat }) {
  const positions = ['bottom', 'right', 'top', 'left'];
  const pos = positions[(seat - mySeat + 4) % 4];
  const bidEl = document.getElementById(`bid-${pos}`);
  if (bidEl) {
    bidEl.textContent = bid === 0.5 ? '½' : String(bid);
    bidEl.parentElement?.classList.add('anim-shake');
    setTimeout(() => bidEl.parentElement?.classList.remove('anim-shake'), 240);
  }
  await wait(aq.d(100));
}

function shakeCard(cardEl) {
  if (!cardEl) return;
  window.soundFX?.playIllegal?.();
  cardEl.classList.add('anim-shake');
  setTimeout(() => cardEl.classList.remove('anim-shake'), 240);
}

function launchConfetti() {
  if (document.body.classList.contains('lite-mode')) return;
  const colors = ['#eab308', '#22c55e', '#ef4444', '#3b82f6', '#f97316'];
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.setProperty('--cf-dur', `${1.2 + Math.random() * 0.8}s`);
    p.style.setProperty('--cf-delay', `${Math.random() * 0.5}s`);
    p.style.setProperty('--cf-y', `${55 + Math.random() * 30}vh`);
    p.style.setProperty('--cf-r', `${Math.random() * 500 - 250}deg`);
    p.style.left = `${Math.random() * 100}vw`;
    p.style.background = colors[i % colors.length];
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

// Global Exports
window.AnimQ = new AnimQueue();
window.buildCard = buildCard;
window.renderOpponentFans = renderOpponentFans;
window.flipCard = flipCard;
window.applyFanTransforms = applyFanTransforms;
window.sceneShuffle = sceneShuffle;
window.sceneDeal = sceneDeal;
window.sceneCardPlayed = sceneCardPlayed;
window.sceneTrickWon = sceneTrickWon;
window.sceneBidPlaced = sceneBidPlaced;
window.shakeCard = shakeCard;
window.launchConfetti = launchConfetti;
