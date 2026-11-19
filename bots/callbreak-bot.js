/**
 * Call Break Bot Engine (bots/callbreak-bot.js)
 * 
 * Strict Privacy & Fair Play Guarantees:
 * - Bots run ONLY on the server.
 * - Bots receive ONLY their own hand and public trick history.
 * - Bots NEVER see other players' hidden cards.
 * - Bots follow the exact same validation and rules as human players.
 * 
 * Difficulties Supported:
 * - 'easy': Random legal plays and simple bids.
 * - 'medium' (default): Strategic bidding based on hand strength,
 *   winning tricks as cheaply as possible, saving trumps, and discarding low junk cards.
 */

const SUITS = ['S', 'H', 'D', 'C'];

class CallBreakBot {
  /**
   * Calculate bid for a bot based on its private hand and selected difficulty.
   */
  static calculateBid(hand, difficulty = 'medium') {
    if (difficulty === 'easy') {
      // Easy bots bid realistically between 1 and 3
      return Math.floor(Math.random() * 3) + 1;
    }

    // Medium Difficulty Bidding Heuristic:
    let estimatedTricks = 0;

    // 1. Evaluate Spades (Trumps)
    const spades = hand.filter(c => c.suit === 'S');
    const spadeCount = spades.length;

    if (spades.some(c => c.rank === 'A')) estimatedTricks += 1.0;
    if (spades.some(c => c.rank === 'K')) estimatedTricks += 0.9;
    if (spades.some(c => c.rank === 'Q')) estimatedTricks += 0.7;
    if (spades.some(c => c.rank === 'J') && spadeCount >= 3) estimatedTricks += 0.5;

    // Long spade suit bonus (ruffing / trumping power)
    if (spadeCount >= 4) {
      estimatedTricks += (spadeCount - 3) * 0.4;
    }

    // 2. Evaluate Non-Spade Suits (Hearts, Diamonds, Clubs)
    ['H', 'D', 'C'].forEach(suit => {
      const suitCards = hand.filter(c => c.suit === suit);
      const count = suitCards.length;

      const hasAce = suitCards.some(c => c.rank === 'A');
      const hasKing = suitCards.some(c => c.rank === 'K');
      const hasQueen = suitCards.some(c => c.rank === 'Q');

      // Aces usually win if suit length is 1 to 4
      if (hasAce) {
        if (count <= 4) estimatedTricks += 1.0;
        else estimatedTricks += 0.7; // Risk of being trumped if suit is long
      }

      // Kings are guarded if there are other cards in the suit
      if (hasKing) {
        if (count >= 2 && count <= 4) estimatedTricks += 0.65;
        else if (count === 1) estimatedTricks += 0.25; // Singleton King risky
      }

      // Queens guarded
      if (hasQueen && count >= 3 && count <= 4) {
        estimatedTricks += 0.3;
      }
    });

    let finalBid = Math.round(estimatedTricks);
    // Standard Call Break bounds: min 1, max 8
    finalBid = Math.max(1, Math.min(8, finalBid));
    return finalBid;
  }

  /**
   * Choose the best legal card to play from the bot's hand.
   */
  static chooseCardToPlay({ hand, legalCardIds, currentTrick, difficulty = 'medium' }) {
    if (!legalCardIds || legalCardIds.length === 0) {
      return null;
    }

    const legalCards = hand.filter(c => legalCardIds.includes(c.id));
    if (legalCards.length === 1) {
      return legalCards[0].id;
    }

    // Easy Difficulty: pick a random legal card
    if (difficulty === 'easy') {
      const randomIdx = Math.floor(Math.random() * legalCards.length);
      return legalCards[randomIdx].id;
    }

    // Medium Difficulty: Strategic Decision Engine
    // -------------------------------------------------------------
    // Case 1: Bot is LEADING the trick (first card of trick)
    // -------------------------------------------------------------
    if (!currentTrick || currentTrick.length === 0) {
      // 1. Cash non-spade Aces first
      const nonSpadeAces = legalCards.filter(c => c.suit !== 'S' && c.rank === 'A');
      if (nonSpadeAces.length > 0) {
        return nonSpadeAces[0].id;
      }

      // 2. Lead low from a long non-spade suit to drain or establish suit
      const nonSpades = legalCards.filter(c => c.suit !== 'S');
      if (nonSpades.length > 0) {
        // Sort lowest value first
        nonSpades.sort((a, b) => a.value - b.value);
        return nonSpades[0].id;
      }

      // 3. If only spades left, lead lowest spade
      legalCards.sort((a, b) => a.value - b.value);
      return legalCards[0].id;
    }

    // -------------------------------------------------------------
    // Case 2: Bot is FOLLOWING the trick
    // -------------------------------------------------------------
    const ledSuit = currentTrick[0].card.suit;
    const sameSuitCards = legalCards.filter(c => c.suit === ledSuit);

    // Determine current winning card in the trick
    let currentWinnerEntry = currentTrick[0];
    for (let i = 1; i < currentTrick.length; i++) {
      const entry = currentTrick[i];
      const winCard = currentWinnerEntry.card;
      const currCard = entry.card;

      if (currCard.suit === 'S' && winCard.suit !== 'S') {
        currentWinnerEntry = entry;
      } else if (currCard.suit === winCard.suit && currCard.value > winCard.value) {
        currentWinnerEntry = entry;
      }
    }

    const winningCard = currentWinnerEntry.card;
    const isTrumpedBySpade = winningCard.suit === 'S';

    // Subcase 2A: Bot has the led suit
    if (sameSuitCards.length > 0) {
      // If trick is NOT trumped by a spade yet, can bot beat the current led card?
      if (!isTrumpedBySpade) {
        const winningCandidates = sameSuitCards.filter(c => c.value > winningCard.value);
        if (winningCandidates.length > 0) {
          // Win as CHEAPLY as possible! (Lowest card that still beats the current winner)
          winningCandidates.sort((a, b) => a.value - b.value);
          return winningCandidates[0].id;
        }
      }

      // Cannot win the trick: discard the LOWEST card of the led suit to preserve high cards
      sameSuitCards.sort((a, b) => a.value - b.value);
      return sameSuitCards[0].id;
    }

    // Subcase 2B: Bot has NO cards of led suit, but MUST play spade (trump)
    const spades = legalCards.filter(c => c.suit === 'S');
    if (spades.length > 0) {
      if (isTrumpedBySpade) {
        // A spade was already played by an earlier player
        const higherSpades = spades.filter(c => c.value > winningCard.value);
        if (higherSpades.length > 0) {
          // Win over earlier spade as cheaply as possible
          higherSpades.sort((a, b) => a.value - b.value);
          return higherSpades[0].id;
        }
        // Cannot beat earlier spade: discard lowest spade
        spades.sort((a, b) => a.value - b.value);
        return spades[0].id;
      } else {
        // No spade played yet: win trick with the lowest spade!
        spades.sort((a, b) => a.value - b.value);
        return spades[0].id;
      }
    }

    // Subcase 2C: Bot has neither led suit nor spades (sloughing / discarding)
    // Discard the lowest value junk card
    legalCards.sort((a, b) => a.value - b.value);
    return legalCards[0].id;
  }
}

module.exports = CallBreakBot;
