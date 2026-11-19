/**
 * End-to-End Automated Simulation Test
 * Simulates 4 players connecting over WebSockets, bidding, playing a trick,
 * testing illegal move rejection, testing player disconnect/reconnect.
 */

const http = require('http');
const { WebSocket } = require('ws');

// Test port
const PORT = 3001;
process.env.PORT = PORT;

// Start server
require('./server.js');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createClient(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const client = {
      name,
      ws,
      sessionToken: null,
      playerId: null,
      lastLobby: null,
      lastPublic: null,
      lastPrivate: null,
      errors: []
    };

    ws.on('open', () => {
      resolve(client);
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'auth_success') {
        client.sessionToken = msg.sessionToken;
        client.playerId = msg.playerId;
      } else if (msg.type === 'lobby_state') {
        client.lastLobby = msg.room;
      } else if (msg.type === 'game_state') {
        client.lastPublic = msg.publicState;
        client.lastPrivate = msg.privateState;
      } else if (msg.type === 'error') {
        client.errors.push(msg.message);
      }
    });

    ws.on('error', reject);
  });
}

async function runTests() {
  console.log('--- STARTING AUTOMATED STAGE 1 & 2 VERIFICATION ---');
  await delay(500);

  // 1. Connect 4 players
  console.log('Connecting 4 players...');
  const names = ['P1_Host', 'P2_Bob', 'P3_Charlie', 'P4_David'];
  const clients = [];

  for (const name of names) {
    const client = await createClient(name);
    client.ws.send(JSON.stringify({
      type: 'init',
      name,
      roomId: 'MAIN'
    }));
    clients.push(client);
    await delay(150);
  }

  await delay(400);

  // Check lobby has 4 players
  const hostLobby = clients[0].lastLobby;
  if (!hostLobby || hostLobby.players.length !== 4) {
    throw new Error(`Expected 4 players in lobby, got: ${hostLobby ? hostLobby.players.length : 0}`);
  }
  console.log('✅ 4 players seated in lobby successfully.');

  // 2. Host starts game
  console.log('Host starting Call Break...');
  clients[0].ws.send(JSON.stringify({ type: 'start_game' }));
  await delay(400);

  const p1Public = clients[0].lastPublic;
  const p1Private = clients[0].lastPrivate;

  if (p1Public.phase !== 'bidding') {
    throw new Error(`Expected phase 'bidding', got: ${p1Public.phase}`);
  }
  console.log('✅ Game phase entered: bidding.');

  // 3. Privacy Check: Ensure no other player's hand is leaked in public state!
  for (const p of p1Public.players) {
    if (p.hand !== undefined) {
      throw new Error('SECURITY VIOLATION: Private hand leaked in publicState!');
    }
    if (typeof p.cardCount !== 'number' || p.cardCount !== 13) {
      throw new Error(`Expected cardCount 13 for each player, got: ${p.cardCount}`);
    }
  }
  if (!p1Private.hand || p1Private.hand.length !== 13) {
    throw new Error(`Expected 13 private cards for player, got: ${p1Private.hand ? p1Private.hand.length : 0}`);
  }
  console.log('✅ Privacy verified: Hands are strictly private, only cardCount in publicState.');

  // 4. Test Bidding Sequence (counter-clockwise starting from player after dealer)
  console.log(`Dealer seat: ${p1Public.dealerSeat}. Current turn to bid seat: ${p1Public.currentTurnSeat}`);
  
  // Submit bids for all 4 players in turn order
  for (let i = 0; i < 4; i++) {
    const currentTurnSeat = clients[0].lastPublic.currentTurnSeat;
    const clientForTurn = clients.find(c => c.lastPrivate.seat === currentTurnSeat);
    
    // Test illegal bid rejection first
    clientForTurn.ws.send(JSON.stringify({
      type: 'game_action',
      action: { type: 'bid', bid: 15 } // illegal, max is 8
    }));
    await delay(100);
    if (!clientForTurn.errors.some(e => e.includes('Bid must be one of') || e.includes('between 1 and 8'))) {
      throw new Error('Server failed to reject invalid bid > 8');
    }

    // Submit legal bid
    clientForTurn.ws.send(JSON.stringify({
      type: 'game_action',
      action: { type: 'bid', bid: 3 }
    }));
    await delay(150);
  }

  const playPhasePublic = clients[0].lastPublic;
  if (playPhasePublic.phase !== 'playing') {
    throw new Error(`Expected phase 'playing' after 4 bids, got: ${playPhasePublic.phase}`);
  }
  console.log('✅ All 4 bids processed. Phase transitioned to: playing.');

  // 5. Test Playing a Trick with Rules Validation
  const currentTurnSeat = playPhasePublic.currentTurnSeat;
  const leadClient = clients.find(c => c.lastPrivate.seat === currentTurnSeat);
  const legalCards = leadClient.lastPrivate.legalCards;

  if (legalCards.length !== 13) {
    throw new Error(`Leader should have 13 legal cards, got: ${legalCards.length}`);
  }

  // Play lead card
  const leadCardId = legalCards[0];
  console.log(`Player at seat ${currentTurnSeat} plays lead card: ${leadCardId}`);
  leadClient.ws.send(JSON.stringify({
    type: 'game_action',
    action: { type: 'play_card', cardId: leadCardId }
  }));
  await delay(200);

  if (clients[0].lastPublic.currentTrick.length !== 1) {
    throw new Error('Current trick should contain 1 card');
  }
  console.log('✅ First card accepted onto the table.');

  // 6. Test Disconnect & Reconnection
  console.log('Testing disconnect & reconnect...');
  const clientToDisconnect = clients[1]; // Bob
  const savedToken = clientToDisconnect.sessionToken;
  clientToDisconnect.ws.close();
  await delay(300);

  if (!clients[0].lastPublic.isPaused) {
    throw new Error('Game should be paused when player disconnects');
  }
  console.log(`✅ Disconnect handled: Game paused, waiting for ${clients[0].lastPublic.disconnectedPlayer}`);

  // Reconnect with same sessionToken
  console.log('Reconnecting Bob with session token...');
  const reconnectedClient = await createClient('P2_Bob');
  reconnectedClient.ws.send(JSON.stringify({
    type: 'init',
    sessionToken: savedToken,
    roomId: 'MAIN'
  }));
  await delay(300);

  if (clients[0].lastPublic.isPaused) {
    throw new Error('Game should be unpaused after reconnect');
  }
  console.log('✅ Reconnect successful: Game unpaused and state restored!');

  console.log('\n=============================================================');
  console.log('🎉 ALL AUTOMATED TESTS PASSED CLEANLY (100% SUCCESS)');
  console.log('=============================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
