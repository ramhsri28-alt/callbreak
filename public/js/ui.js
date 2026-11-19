/**
 * ui.js — User Interface & DOM Renderer
 *
 * Guaranteed Touch/Click Handling:
 * Uses event delegation on #handFan so card interaction NEVER fails.
 * Cards can be touched & lifted to inspect at ANY time.
 */

class GameUI {
  constructor() {
    this.liftedCardId = null;
    this.singleTap = localStorage.getItem('cb_single_tap') === 'true';
    this.wakeLock = null;
    this.initHandDelegation();
  }

  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try { this.wakeLock = await navigator.wakeLock.request('screen'); }
      catch (e) {}
    }
  }

  showToast(message, duration = 2800) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  /**
   * Event Delegation: Attached ONCE to #handFan
   * Guaranteed to catch clicks on any card, any time!
   */
  initHandDelegation() {
    const handFan = document.getElementById('handFan');
    if (!handFan) return;

    handFan.addEventListener('click', (e) => {
      const cardEl = e.target.closest('.card');
      if (!cardEl) return;

      const cardId = cardEl.dataset.cardId;
      if (!cardId) return;

      this.handleCardClick(cardEl, cardId);
    });
  }

  handleCardClick(cardEl, cardId) {
    const pub = window.clientApp?.publicState;
    const priv = window.clientApp?.privateState;
    if (!pub || !priv) return;

    const isPlaying = pub.phase === 'playing';
    const isMyTurn = isPlaying && pub.currentTurnSeat === priv.seat;
    const legalCards = priv.legalCards || [];

    // CASE 1: It is your turn to play!
    if (isMyTurn) {
      if (!legalCards.includes(cardId)) {
        window.shakeCard(cardEl);
        this.showToast('Illegal move: follow suit or trump!');
        return;
      }

      // If single tap setting is ON:
      if (this.singleTap) {
        window.clientApp.playCard(cardId);
        return;
      }

      // Two-tap system (first tap lifts, second tap on lifted card plays it)
      if (this.liftedCardId === cardId) {
        this.liftedCardId = null;
        cardEl.classList.remove('lifted');
        window.clientApp.playCard(cardId);
      } else {
        document.querySelectorAll('#handFan .card.lifted').forEach(c => c.classList.remove('lifted'));
        this.liftedCardId = cardId;
        cardEl.classList.add('lifted');
        window.soundFX?.playClick?.();
      }
      return;
    }

    // CASE 2: Not your turn to play (e.g. bidding phase or waiting for opponent)
    // You can STILL touch & lift your cards to look at them!
    if (this.liftedCardId === cardId) {
      this.liftedCardId = null;
      cardEl.classList.remove('lifted');
    } else {
      document.querySelectorAll('#handFan .card.lifted').forEach(c => c.classList.remove('lifted'));
      this.liftedCardId = cardId;
      cardEl.classList.add('lifted');
      window.soundFX?.playClick?.();
    }

    if (pub.phase === 'bidding') {
      this.showToast('Select your bid on the panel above!');
    } else if (pub.phase === 'playing') {
      const activePlayer = pub.players?.find(p => p.seat === pub.currentTurnSeat);
      this.showToast(`Waiting for ${activePlayer ? activePlayer.name : 'opponent'}…`);
    }
  }

  renderSeats(players, mySeat, currentTurnSeat, dealerSeat, botThinking = null) {
    const positions = ['bottom', 'right', 'top', 'left'];

    // Ensure opponent fanned cards are rendered
    if (typeof window.renderOpponentFans === 'function') {
      window.renderOpponentFans();
    }

    players.forEach(p => {
      const relIdx = (p.seat - mySeat + 4) % 4;
      const pos = positions[relIdx];
      const isTurn = currentTurnSeat === p.seat;
      const isDealer = dealerSeat === p.seat;
      const isThinking = botThinking === p.name;

      // Update Dual Score Pill [ Won | Bid ]
      const wonEl = document.getElementById(`won-${pos}`);
      const bidEl = document.getElementById(`bid-${pos}`);

      if (wonEl) {
        wonEl.textContent = p.tricksWon != null ? p.tricksWon : '0';
      }
      if (bidEl) {
        if (p.bid != null) {
          bidEl.textContent = p.bid === 0.5 ? '½' : p.bid;
        } else {
          bidEl.textContent = '-';
        }
      }

      // Bottom player (self) only has the score pill in the wood table layout
      if (pos === 'bottom') return;

      const seatEl = document.getElementById(`seat-${pos}`);
      if (!seatEl) return;

      seatEl.classList.toggle('active', isTurn);
      seatEl.classList.toggle('disconnected', !p.isConnected);

      const nameEl = document.getElementById(`name-${pos}`);
      if (nameEl) {
        let displayName = p.name;
        if (isThinking) {
          displayName += ' ⏳';
        }
        if (isDealer) {
          displayName += ' 🂠';
        }
        nameEl.textContent = displayName;
      }

      const fanEl = document.getElementById(`fan-${pos}`);
      if (fanEl) {
        // Show fanned deck back while player has cards
        fanEl.style.display = (p.cardCount > 0) ? 'block' : 'none';
      }
    });
  }

  renderHand(hand, legalCardIds, isMyTurn) {
    if (window.AnimQ.isDealing) return;

    const handFan = document.getElementById('handFan');
    if (!handFan) return;

    const existingCards = [...handFan.querySelectorAll('.card.card-face')];
    const existingIds = existingCards.map(c => c.dataset.cardId);
    const newIds = hand.map(c => c.id);

    if (existingIds.length === newIds.length && existingIds.every((id, i) => id === newIds[i])) {
      existingCards.forEach(c => {
        const id = c.dataset.cardId;
        const isLegal = isMyTurn && legalCardIds.includes(id);
        c.classList.toggle('legal', isLegal);
        c.classList.toggle('illegal', isMyTurn && !isLegal);
      });
      return;
    }

    handFan.innerHTML = '';
    this.liftedCardId = null;

    hand.forEach(card => {
      const cardEl = window.buildCard(card, true);
      const isLegal = isMyTurn && legalCardIds.includes(card.id);
      cardEl.classList.toggle('legal', isLegal);
      cardEl.classList.toggle('illegal', isMyTurn && !isLegal);
      handFan.appendChild(cardEl);
    });

    window.applyFanTransforms(handFan);
  }

  renderBidPanel(isMyTurnToBid, onBidSelected) {
    const bidPanel = document.getElementById('bidPanel');
    if (!bidPanel) return;

    if (isMyTurnToBid) {
      bidPanel.classList.add('open');
      const grid = document.getElementById('bidGrid');
      grid.innerHTML = '';

      const bidValues = [0.5, 1, 2, 3, 4, 5, 6, 7, 8];
      bidValues.forEach(val => {
        const btn = document.createElement('button');
        btn.className = 'bid-btn';
        btn.textContent = val === 0.5 ? '½' : String(val);
        btn.addEventListener('click', () => {
          window.soundFX?.playBidPop?.();
          bidPanel.classList.remove('open');
          onBidSelected(val);
        });
        grid.appendChild(btn);
      });
    } else {
      bidPanel.classList.remove('open');
    }
  }

  renderScoreboard(scoreHistory, players, currentRound, totalRounds, isGameOver, onNextRound, onPlayAgain, isHost, isManualOpen = false) {
    const modal = document.getElementById('scoreModal');
    if (!modal) return;

    modal.classList.remove('hidden');

    const titleEl = document.getElementById('scoreModalTitle');
    const tableEl = document.getElementById('scoreTable');
    const actionBtn = document.getElementById('scoreActionBtn');

    if (isGameOver) {
      titleEl.textContent = '🏆 Game Over — Final Scores';
      actionBtn.textContent = 'Play Again';
      actionBtn.style.display = isHost ? 'block' : 'none';
      actionBtn.onclick = onPlayAgain;
      window.launchConfetti();
    } else if (isManualOpen) {
      titleEl.textContent = `🏆 Standings (Round ${currentRound || 1} of ${totalRounds || 5})`;
      actionBtn.style.display = 'none';
    } else {
      titleEl.textContent = `Round ${currentRound} of ${totalRounds} Complete`;
      actionBtn.textContent = isHost ? 'Next Round →' : 'Waiting for host…';
      actionBtn.style.display = isHost ? 'block' : 'none';
      actionBtn.onclick = onNextRound;
    }

    const sorted = [...(players || [])].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    const leaderId = sorted[0]?.id;

    let html = `
      <thead>
        <tr>
          <th>Round</th>
          ${(players || []).map(p => `<th>${p.name}${p.id === leaderId ? ' 👑' : ''}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
    `;

    if (scoreHistory && scoreHistory.length > 0) {
      scoreHistory.forEach(r => {
        html += `<tr><td>R${r.round}</td>`;
        players.forEach(p => {
          const res = r.playerResults ? r.playerResults.find(pr => pr.seat === p.seat) : null;
          const score = res ? res.roundScore : '-';
          const clr = typeof score === 'number' ? (score >= 0 ? 'score-pos' : 'score-neg') : '';
          html += `<td class="${clr}">${score > 0 ? '+' : ''}${score}</td>`;
        });
        html += `</tr>`;
      });
    } else {
      html += `<tr><td>R1 Live</td>`;
      (players || []).forEach(p => {
        html += `<td>Bid: ${p.bid != null ? p.bid : '-'} | Won: ${p.tricksWon || 0}</td>`;
      });
      html += `</tr>`;
    }

    html += `
      <tr class="leader">
        <td>Total</td>
        ${(players || []).map(p => `<td>${(p.totalScore || 0) > 0 ? '+' : ''}${p.totalScore || 0}</td>`).join('')}
      </tr>
      </tbody>
    `;

    tableEl.innerHTML = html;
  }
}

window.gameUI = new GameUI();
