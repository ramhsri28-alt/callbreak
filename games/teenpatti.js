/**
 * Teen Patti (Phase 2 Placeholder)
 * Exposes the standard game interface so that new games
 * can be plugged in without changing the core server.
 */

module.exports = {
  id: 'teenpatti',
  name: 'Teen Patti',
  description: 'Classic 3-card Indian poker (Coming in Phase 2)',
  minPlayers: 3,
  maxPlayers: 6,
  isAvailable: false,

  init(players, options = {}) {
    throw new Error('Teen Patti is coming in Phase 2! Stay tuned.');
  },

  handleAction(playerId, action) {
    return { error: 'Teen Patti is not yet available.' };
  },

  getPublicState() {
    return { status: 'coming_soon', name: 'Teen Patti' };
  },

  getPrivateState(playerId) {
    return {};
  }
};
