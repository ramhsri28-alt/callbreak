/**
 * server.js — Offline Card Game Server
 * Node.js + Express + ws — zero native modules, zero cloud, zero DB.
 * Optimised for Android Termux hotspot hosting.
 */

const http   = require('http');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

const express                 = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const GAMES = {
  callbreak:  require('./games/callbreak'),
  teenpatti:  require('./games/teenpatti')
};
const CallBreakBot = require('./bots/callbreak-bot');

const PORT = process.env.PORT || 3000;
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const rooms   = new Map(); // roomId → Room
const sessions = new Map(); // token  → { playerId, roomId }

function mkRoom(id, gameType) {
  return {
    id,
    hostPlayerId: null,
    gameType: gameType in GAMES ? gameType : 'callbreak',
    options: { redealEnabled: false, botDifficulty: 'medium' },
    players: [],
    game:    null,
    status:  'lobby',
    botTimer: null
  };
}

function getOrCreateRoom(roomId, gameType) {
  const id = (roomId || 'MAIN').trim().toUpperCase();
  if (!rooms.has(id)) rooms.set(id, mkRoom(id, gameType));
  return rooms.get(id);
}

function broadcastRoom(room, suppressEvents = false) {
  if (!room) return;

  if (room.status === 'playing' && room.game) {
    const pub    = room.game.getPublicState();
    const events = suppressEvents ? [] : room.game.flushEvents();

    for (const player of room.players) {
      if (!player.ws || player.ws.readyState !== WebSocket.OPEN) continue;
      const priv = room.game.getPrivateState(player.id);
      player.ws.send(JSON.stringify({
        type: 'game_state',
        room: { id: room.id, gameType: room.gameType, status: room.status,
                hostPlayerId: room.hostPlayerId, options: room.options },
        publicState:  pub,
        privateState: priv,
        events
      }));
    }
  } else {
    const lobbyMsg = {
      type: 'lobby_state',
      room: {
        id: room.id, gameType: room.gameType, status: room.status,
        hostPlayerId: room.hostPlayerId, options: room.options,
        players: room.players.map(p => ({
          id: p.id, name: p.name, isBot: !!p.isBot,
          isHost: p.id === room.hostPlayerId, isConnected: p.isConnected
        }))
      },
      availableGames: Object.values(GAMES).map(g => ({
        id: g.id, name: g.name, description: g.description,
        isAvailable: g.isAvailable, minPlayers: g.minPlayers, maxPlayers: g.maxPlayers
      }))
    };
    for (const player of room.players) {
      if (player.ws && player.ws.readyState === WebSocket.OPEN)
        player.ws.send(JSON.stringify(lobbyMsg));
    }
  }
}

function triggerBotIfNeeded(room, isRoundStart = false) {
  if (!room?.game || room.game.isPaused) return;
  if (room.game.phase !== 'bidding' && room.game.phase !== 'playing') return;

  const seat = room.game.currentTurnSeat;
  if (seat === null) return;

  const p = room.game.players[seat];
  if (!p?.isBot) return;

  if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }

  // At round start, give 2.2s for shuffle & deal animations to run on client
  const delay = isRoundStart
    ? (2200 + Math.floor(Math.random() * 400))
    : (700 + Math.floor(Math.random() * 500));

  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!room.game || room.game.isPaused) return;
    if (room.game.currentTurnSeat !== seat) return;

    room.game.botThinking = p.name;
    broadcastRoom(room);

    setTimeout(() => {
      if (!room.game || room.game.isPaused) return;
      if (room.game.currentTurnSeat !== seat) return;

      if (room.game.phase === 'bidding') {
        const bid = CallBreakBot.calculateBid(p.hand, room.options.botDifficulty);
        room.game.handleAction(p.id, { type: 'bid', bid });
      } else if (room.game.phase === 'playing') {
        const legal  = room.game.getLegalCardsForPlayer(seat);
        const cardId = CallBreakBot.chooseCardToPlay({
          hand: p.hand, legalCardIds: legal,
          currentTrick: room.game.currentTrick,
          difficulty: room.options.botDifficulty
        });
        room.game.handleAction(p.id, { type: 'play_card', cardId });
      }

      room.game.botThinking = null;
      broadcastRoom(room);
      triggerBotIfNeeded(room, false);
    }, 400);
  }, delay);
}

wss.on('connection', (ws) => {
  let boundPlayerId = null;
  let boundRoomId   = null;

  ws.on('pong', () => {});

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { ws.send(JSON.stringify({ type: 'error', message: 'Bad JSON' })); return; }
    handleMessage(msg);
  });

  ws.on('close', () => {
    if (boundRoomId && boundPlayerId) onDisconnect(boundRoomId, boundPlayerId);
  });

  ws.on('error', () => ws.close());

  function handleMessage(msg) {
    switch (msg.type) {

      case 'init': {
        const { sessionToken, name, roomId, gameType } = msg;
        const targetRoom = getOrCreateRoom(roomId, gameType);

        if (sessionToken && sessions.has(sessionToken)) {
          const sess = sessions.get(sessionToken);
          const exRoom = rooms.get(sess.roomId);
          if (exRoom) {
            const player = exRoom.players.find(p => p.id === sess.playerId);
            if (player) {
              player.ws = ws; player.isConnected = true;
              boundPlayerId = player.id; boundRoomId = exRoom.id;
              exRoom.game?.setPlayerConnection?.(player.id, true);

              ws.send(JSON.stringify({
                type: 'auth_success', sessionToken,
                playerId: player.id, playerName: player.name, roomId: exRoom.id
              }));
              broadcastRoom(exRoom, true);
              triggerBotIfNeeded(exRoom, false);
              return;
            }
          }
        }

        if (targetRoom.status === 'playing') {
          if (targetRoom.game?.phase === 'round_end') {
            const botIdx = targetRoom.players.findIndex(p => p.isBot);
            if (botIdx !== -1) {
              const newId    = 'p_' + crypto.randomBytes(6).toString('hex');
              const newToken = crypto.randomBytes(16).toString('hex');
              const cleanName = (name || 'Player').trim().slice(0, 16) || 'Player';

              const newPlayer = {
                id: newId, name: cleanName, isBot: false,
                sessionToken: newToken, ws, isConnected: true
              };
              targetRoom.players[botIdx] = newPlayer;

              const gp = targetRoom.game.players[botIdx];
              gp.id = newId; gp.name = cleanName; gp.isBot = false; gp.isConnected = true;

              sessions.set(newToken, { playerId: newId, roomId: targetRoom.id });
              boundPlayerId = newId; boundRoomId = targetRoom.id;

              ws.send(JSON.stringify({
                type: 'auth_success', sessionToken: newToken,
                playerId: newId, playerName: cleanName, roomId: targetRoom.id
              }));
              broadcastRoom(targetRoom, true);
              return;
            }
          }
          ws.send(JSON.stringify({ type: 'error', message: 'Game in progress. Wait until a round ends to take a bot seat.' }));
          return;
        }

        if (targetRoom.players.filter(p => !p.isBot).length >= 4) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full (4 players).' }));
          return;
        }

        const cleanName = (name || 'Player').trim().slice(0, 16) || 'Player';
        const newId    = 'p_' + crypto.randomBytes(6).toString('hex');
        const newToken = crypto.randomBytes(16).toString('hex');
        const isHost   = targetRoom.players.length === 0;

        const newPlayer = {
          id: newId, name: cleanName, isBot: false,
          isHost, sessionToken: newToken, ws, isConnected: true
        };
        if (isHost) targetRoom.hostPlayerId = newId;
        targetRoom.players.push(newPlayer);
        sessions.set(newToken, { playerId: newId, roomId: targetRoom.id });

        boundPlayerId = newId; boundRoomId = targetRoom.id;
        ws.send(JSON.stringify({
          type: 'auth_success', sessionToken: newToken,
          playerId: newId, playerName: cleanName, roomId: targetRoom.id
        }));
        broadcastRoom(targetRoom);
        break;
      }

      case 'start_game': {
        if (!boundRoomId || !boundPlayerId) return;
        const room = rooms.get(boundRoomId);
        if (!room) return;
        if (room.hostPlayerId !== boundPlayerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Only the host can start.' })); return;
        }

        let botN = 1;
        while (room.players.length < 4) {
          room.players.push({
            id: `bot_${botN}_${crypto.randomBytes(3).toString('hex')}`,
            name: `Bot ${botN}`, isBot: true,
            sessionToken: null, ws: null, isConnected: true
          });
          botN++;
        }

        const eng = GAMES[room.gameType];
        if (!eng?.isAvailable) {
          ws.send(JSON.stringify({ type: 'error', message: 'Game not available.' })); return;
        }

        try {
          room.game   = eng.init(room.players, room.options);
          room.status = 'playing';
          broadcastRoom(room);
          triggerBotIfNeeded(room, true);
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', message: e.message }));
        }
        break;
      }

      case 'game_action': {
        if (!boundRoomId || !boundPlayerId) return;
        const room = rooms.get(boundRoomId);
        if (!room?.game) return;

        const result = room.game.handleAction(boundPlayerId, msg.action || {});
        if (result?.error) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return; }

        broadcastRoom(room);
        triggerBotIfNeeded(room, false);
        break;
      }

      case 'update_options': {
        if (!boundRoomId || !boundPlayerId) return;
        const room = rooms.get(boundRoomId);
        if (!room || room.hostPlayerId !== boundPlayerId) return;
        if (msg.options) { room.options = { ...room.options, ...msg.options }; broadcastRoom(room); }
        break;
      }

      case 'reset_to_lobby': {
        if (!boundRoomId || !boundPlayerId) return;
        const room = rooms.get(boundRoomId);
        if (!room) return;
        if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
        room.players = room.players.filter(p => !p.isBot);
        room.status  = 'lobby';
        room.game    = null;
        broadcastRoom(room);
        break;
      }

      case 'restart_game': {
        if (!boundRoomId || !boundPlayerId) return;
        const room = rooms.get(boundRoomId);
        if (!room) return;
        if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }

        let botN = 1;
        while (room.players.length < 4) {
          room.players.push({
            id: `bot_${botN}_${crypto.randomBytes(3).toString('hex')}`,
            name: `Bot ${botN}`, isBot: true,
            sessionToken: null, ws: null, isConnected: true
          });
          botN++;
        }

        const eng = GAMES[room.gameType];
        if (eng?.isAvailable) {
          room.game   = eng.init(room.players, room.options);
          room.status = 'playing';
          broadcastRoom(room);
          triggerBotIfNeeded(room, true);
        }
        break;
      }
    }
  }

  function onDisconnect(roomId, playerId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (!player || player.isBot) return;

    player.isConnected = false; player.ws = null;

    if (room.status === 'playing' && room.game) {
      room.game.setPlayerConnection(playerId, false);
      if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
    } else if (room.status === 'lobby') {
      room.players = room.players.filter(p => p.id !== playerId);
      if (room.hostPlayerId === playerId && room.players.length > 0) {
        room.hostPlayerId = room.players[0].id;
      }
    }

    broadcastRoom(room);
  }
});

setInterval(() => {
  wss.clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.ping(); });
}, 10_000);

function localIPs() {
  const ifaces = os.networkInterfaces();
  const list   = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal)
        list.push({ name, address: iface.address,
          isHotspot: iface.address.startsWith('192.168.43.') ||
                     name.toLowerCase().includes('wlan') ||
                     name.toLowerCase().includes('ap') });
    }
  }
  return list;
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = localIPs();
  console.log('\n=============================================================');
  console.log(' 🃏  CALL BREAK — OFFLINE MULTIPLAYER SERVER READY');
  console.log('=============================================================');
  console.log(` Port: ${PORT}  |  Bots: ON  |  Internet required: NO`);
  console.log('-------------------------------------------------------------');
  const hs = ips.find(i => i.isHotspot);
  if (hs) {
    console.log(` 🌟 HOTSPOT LINK (share with friends on your hotspot):`);
    console.log(`    👉  http://${hs.address}:${PORT}`);
    console.log('-------------------------------------------------------------');
  }
  if (ips.length === 0) {
    console.log(` 👉  http://localhost:${PORT}`);
  } else {
    console.log(' All interfaces:');
    ips.forEach(i => console.log(`   • ${i.name}: http://${i.address}:${PORT}`));
  }
  console.log('=============================================================\n');
});
