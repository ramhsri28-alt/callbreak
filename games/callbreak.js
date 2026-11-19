/**
 * Call Break Game Engine — Standard Nepali/Indian rules
 *
 * Rule assumptions stated before coding:
 * ───────────────────────────────────────
 * 1. 4 players, 52-card deck (no jokers), 13 cards each, 5 rounds.
 * 2. Spades are always trump.
 * 3. Play order is counter-clockwise (seat+1 mod 4).
 * 4. Dealer rotates counter-clockwise each round.
 * 5. Bidding starts from the player after the dealer (CCW).
 * 6. Valid bids: 0.5 (½), 1, 2, 3, 4, 5, 6, 7, 8.
 * 7. Following: must follow led suit and beat current highest if possible.
 *    If no led suit, must play spade (trump) and beat current highest spade if possible.
 *    Otherwise, discard any card.
 * 8. Scoring: if won >= bid → score = bid + 0.1*(extra tricks).
 *    If won < bid → score = -bid. All rounded to 1 decimal.
 * 9. Cryptographically secure Fisher-Yates shuffle via crypto.randomInt.
 * 10. Server emits events array with every broadcast — the client animates these.
 */

const crypto = require('crypto');

const SUITS     = ['S','H','D','C'];
const RANKS     = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VAL  = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
const SUIT_SORT = { 'S':0,'H':1,'C':2,'D':3 };
const VALID_BIDS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8];

function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ id: `${suit}-${rank}`, suit, rank, value: RANK_VAL[rank] });
  return deck;
}

function secureShuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function sortHand(cards) {
  return [...cards].sort((a, b) => {
    if (SUIT_SORT[a.suit] !== SUIT_SORT[b.suit]) return SUIT_SORT[a.suit] - SUIT_SORT[b.suit];
    return b.value - a.value;
  });
}

class CallBreakGame {
  constructor(players, options = {}) {
    if (players.length !== 4) throw new Error('Call Break requires exactly 4 players.');

    this.options = {
      totalRounds:  5,
      redealEnabled: false,
      botDifficulty: 'medium',
      ...options
    };

    this.players = players.map((p, idx) => ({
      id: p.id, name: p.name, seat: idx,
      isHost: !!p.isHost, isConnected: p.isConnected !== false, isBot: !!p.isBot,
      hand: [], bid: null, tricksWon: 0, roundScores: [], totalScore: 0
    }));

    this.round        = 1;
    this.dealerSeat   = 0;
    this.currentTurnSeat = null;
    this.phase        = 'dealing';
    this.currentTrick = [];
    this.lastTrick    = null;
    this.scoreHistory = [];
    this.isPaused     = false;
    this.disconnectedPlayerName = null;
    this.winner       = null;
    this.botThinking  = null;

    // Events emitted since last broadcast; server clears after each send
    this.pendingEvents = [];

    this._startRound(true);
  }

  /* ── helpers ── */
  nextSeat(s) { return (s + 1) % 4; }

  emit(event) { this.pendingEvents.push(event); }

  flushEvents() {
    const evs = this.pendingEvents;
    this.pendingEvents = [];
    return evs;
  }

  /* ── round lifecycle ── */
  _startRound(isFirstRound = false) {
    // Deal (with optional redeal rule)
    let ok = false, tries = 0;
    while (!ok && tries++ < 10) {
      const deck = secureShuffle(createDeck());
      for (let i = 0; i < 4; i++) {
        this.players[i].hand      = sortHand(deck.splice(0, 13));
        this.players[i].bid       = null;
        this.players[i].tricksWon = 0;
      }

      if (this.options.redealEnabled) {
        const bad = this.players.some(p =>
          !p.hand.some(c => c.suit === 'S') || !p.hand.some(c => c.value >= 11));
        if (bad) continue;
      }
      ok = true;
    }

    this.currentTrick = [];
    this.lastTrick    = null;
    this.botThinking  = null;
    this.phase        = 'bidding';
    this.currentTurnSeat = this.nextSeat(this.dealerSeat);

    // Emit sequence: roundStart → shuffle → deal
    this.emit({ type: 'roundStart', round: this.round, dealer: this.dealerSeat });
    this.emit({ type: 'shuffle' });
    this.emit({ type: 'deal', dealerSeat: this.dealerSeat });
    this.emit({ type: 'bidTurn', seat: this.currentTurnSeat });
  }

  /* ── legal card logic ── */
  getLegalCardsForPlayer(seat) {
    if (this.phase !== 'playing' || this.currentTurnSeat !== seat) return [];

    const hand = this.players[seat].hand;
    if (this.currentTrick.length === 0) return hand.map(c => c.id); // leading: any card

    const ledSuit = this.currentTrick[0].card.suit;
    const sameSuit = hand.filter(c => c.suit === ledSuit);
    const highestLed = this.currentTrick
      .filter(e => e.card.suit === ledSuit)
      .reduce((m, e) => Math.max(m, e.card.value), 0);

    if (sameSuit.length > 0) {
      const higher = sameSuit.filter(c => c.value > highestLed);
      return (higher.length > 0 ? higher : sameSuit).map(c => c.id);
    }

    const spades = hand.filter(c => c.suit === 'S');
    if (spades.length > 0) {
      const highestSpade = this.currentTrick
        .filter(e => e.card.suit === 'S')
        .reduce((m, e) => Math.max(m, e.card.value), 0);
      if (highestSpade > 0) {
        const higher = spades.filter(c => c.value > highestSpade);
        return (higher.length > 0 ? higher : spades).map(c => c.id);
      }
      return spades.map(c => c.id);
    }

    return hand.map(c => c.id); // discard anything
  }

  /* ── action dispatcher ── */
  handleAction(playerId, action) {
    if (this.isPaused) return { error: 'Game is paused — waiting for reconnect.' };

    const seat = this.players.findIndex(p => p.id === playerId);
    if (seat === -1) return { error: 'Player not found.' };

    switch (action.type) {
      case 'bid':       return this._bid(seat, action.bid);
      case 'play_card': return this._playCard(seat, action.cardId);
      case 'next_round':return this._nextRound(seat);
      case 'play_again':return this._playAgain(seat);
      default:          return { error: `Unknown action: ${action.type}` };
    }
  }

  _bid(seat, rawBid) {
    if (this.phase !== 'bidding')               return { error: 'Not in bidding phase.' };
    if (this.currentTurnSeat !== seat)           return { error: 'Not your turn to bid.' };

    const numBid = parseFloat(rawBid);
    if (!VALID_BIDS.includes(numBid))
      return { error: `Bid must be one of: ${VALID_BIDS.join(', ')}` };

    this.players[seat].bid = numBid;
    this.emit({ type: 'bidPlaced', seat, bid: numBid });

    const allBid = this.players.every(p => p.bid !== null);
    if (allBid) {
      this.phase = 'playing';
      this.currentTurnSeat = this.nextSeat(this.dealerSeat);
      this.emit({ type: 'playPhaseStart', firstTurnSeat: this.currentTurnSeat });
      this.emit({ type: 'turn', seat: this.currentTurnSeat });
    } else {
      this.currentTurnSeat = this.nextSeat(seat);
      this.emit({ type: 'bidTurn', seat: this.currentTurnSeat });
    }

    return { success: true };
  }

  _playCard(seat, cardId) {
    if (this.phase !== 'playing')       return { error: 'Not in playing phase.' };
    if (this.currentTurnSeat !== seat)  return { error: 'Not your turn to play.' };

    const player    = this.players[seat];
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1)               return { error: 'Card not in your hand.' };

    const legal = this.getLegalCardsForPlayer(seat);
    if (!legal.includes(cardId))        return { error: 'Illegal move — follow suit or trump.' };

    const [card] = player.hand.splice(cardIndex, 1);
    this.currentTrick.push({ seat, playerId: player.id, playerName: player.name, card });

    this.emit({ type: 'cardPlayed', seat, card, isFirst: this.currentTrick.length === 1 });

    if (this.currentTrick.length === 4) {
      const winnerSeat = this._trickWinner(this.currentTrick);
      this.players[winnerSeat].tricksWon++;

      const wasTrump = this.currentTrick.some(e => e.card.suit === 'S' && e.seat !== winnerSeat
        || (e.card.suit === 'S' && this.currentTrick[0].card.suit !== 'S'));

      this.lastTrick = {
        winnerSeat,
        winnerName: this.players[winnerSeat].name,
        cards: [...this.currentTrick]
      };
      this.emit({ type: 'trickWon', winnerSeat, winnerName: this.players[winnerSeat].name,
                  cards: this.currentTrick.map(e => ({ seat: e.seat, card: e.card })),
                  wasTrump });
      this.currentTrick = [];

      if (player.hand.length === 0) {         // all 13 tricks done
        this._endRound();
      } else {
        this.currentTurnSeat = winnerSeat;
        this.emit({ type: 'turn', seat: winnerSeat });
      }
    } else {
      this.currentTurnSeat = this.nextSeat(seat);
      this.emit({ type: 'turn', seat: this.currentTurnSeat });
    }

    return { success: true };
  }

  _trickWinner(trick) {
    let best = trick[0];
    for (let i = 1; i < trick.length; i++) {
      const c = trick[i], w = best;
      if      (c.card.suit === 'S' && w.card.suit !== 'S')               best = c;
      else if (c.card.suit === w.card.suit && c.card.value > w.card.value) best = c;
    }
    return best.seat;
  }

  _endRound() {
    const results = this.players.map(p => {
      let score;
      if (p.tricksWon >= p.bid) {
        score = p.bid + (p.tricksWon - p.bid) * 0.1;
      } else {
        score = -p.bid;
      }
      score = Math.round(score * 10) / 10;
      p.roundScores.push(score);
      p.totalScore = Math.round((p.totalScore + score) * 10) / 10;
      return { seat: p.seat, name: p.name, bid: p.bid, tricksWon: p.tricksWon, roundScore: score, totalScore: p.totalScore };
    });

    this.scoreHistory.push({ round: this.round, dealerSeat: this.dealerSeat, playerResults: results });
    this.emit({ type: 'roundEnd', scores: results, round: this.round });

    if (this.round >= this.options.totalRounds) {
      this.phase = 'game_over';
      const sorted = [...this.players].sort((a, b) => b.totalScore - a.totalScore);
      this.winner = { seat: sorted[0].seat, name: sorted[0].name, totalScore: sorted[0].totalScore };
      this.currentTurnSeat = null;
      this.emit({ type: 'gameEnd', winner: this.winner, scores: results });
    } else {
      this.phase = 'round_end';
      this.currentTurnSeat = null;
    }
  }

  _nextRound(seat) {
    if (this.phase !== 'round_end') return { error: 'Not in round_end phase.' };
    this.round++;
    this.dealerSeat = this.nextSeat(this.dealerSeat);
    this._startRound();
    return { success: true };
  }

  _playAgain(seat) {
    if (this.phase !== 'game_over') return { error: 'Game is not over yet.' };
    this.round = 1; this.dealerSeat = 0; this.scoreHistory = []; this.winner = null;
    for (const p of this.players) { p.roundScores = []; p.totalScore = 0; }
    this._startRound(true);
    return { success: true };
  }

  setPlayerConnection(playerId, isConnected) {
    const p = this.players.find(p => p.id === playerId);
    if (!p) return;
    p.isConnected = isConnected;
    if (!isConnected && !p.isBot) {
      this.isPaused = true;
      this.disconnectedPlayerName = p.name;
    } else if (isConnected) {
      if (this.players.filter(p => !p.isBot).every(p => p.isConnected)) {
        this.isPaused = false;
        this.disconnectedPlayerName = null;
      }
    }
  }

  /* ── state snapshots (privacy enforced) ── */
  getPublicState() {
    return {
      gameType: 'callbreak',
      phase: this.phase, round: this.round, totalRounds: this.options.totalRounds,
      dealerSeat: this.dealerSeat, currentTurnSeat: this.currentTurnSeat,
      direction: 'counter-clockwise',
      currentTrick: this.currentTrick,
      lastTrick: this.lastTrick,
      isPaused: this.isPaused,
      disconnectedPlayer: this.disconnectedPlayerName,
      winner: this.winner,
      scoreHistory: this.scoreHistory,
      botThinking: this.botThinking,
      players: this.players.map(p => ({
        id: p.id, seat: p.seat, name: p.name,
        isHost: p.isHost, isConnected: p.isConnected, isBot: p.isBot,
        cardCount: p.hand.length, bid: p.bid, tricksWon: p.tricksWon,
        roundScores: p.roundScores, totalScore: p.totalScore
        // hand is NEVER included here
      }))
    };
  }

  getPrivateState(playerId) {
    const p = this.players.find(p => p.id === playerId);
    if (!p) return {};
    return {
      seat: p.seat,
      hand: p.hand,
      legalCards: this.getLegalCardsForPlayer(p.seat)
    };
  }
}

module.exports = {
  id: 'callbreak', name: 'Call Break',
  description: 'Standard 4-player trick-taking game — Nepali & Indian rules',
  minPlayers: 4, maxPlayers: 4, isAvailable: true,
  init(players, options = {}) { return new CallBreakGame(players, options); }
};
