/**
 * client.js — WebSocket Protocol & Game Controller
 */

class CardGameClient {
  constructor() {
    this.ws = null;
    this.sessionToken = localStorage.getItem('cb_session_token') || null;
    this.playerName = localStorage.getItem('cb_player_name') || '';
    this.roomId = 'MAIN';
    this.gameType = 'callbreak';

    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.isConnecting = false;

    this.currentRoom = null;
    this.publicState = null;
    this.privateState = null;
    this.playerId = null;

    this.initSettings();
    this.bindEvents();
    this.connect();
  }

  playCard(cardId) {
    this.send({
      type: 'game_action',
      action: { type: 'play_card', cardId }
    });
  }

  initSettings() {
    // Game Speed
    const savedSpeed = localStorage.getItem('cb_game_speed') || 'normal';
    window.AnimQ.setSpeed(savedSpeed);
    document.querySelectorAll('.speed-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.speed === savedSpeed);
      b.onclick = () => {
        document.querySelectorAll('.speed-btn').forEach(btn => btn.classList.remove('active'));
        b.classList.add('active');
        window.AnimQ.setSpeed(b.dataset.speed);
        localStorage.setItem('cb_game_speed', b.dataset.speed);
      };
    });

    // Lite Mode
    const liteToggle = document.getElementById('toggleLiteMode');
    const isLite = localStorage.getItem('cb_lite_mode') === 'true';
    if (liteToggle) {
      liteToggle.checked = isLite;
      window.AnimQ.setLite(isLite);
      liteToggle.onchange = () => {
        const val = liteToggle.checked;
        window.AnimQ.setLite(val);
        localStorage.setItem('cb_lite_mode', val ? 'true' : 'false');
      };
    }

    // Single Tap Play
    const tapToggle = document.getElementById('toggleSingleTap');
    const isSingle = localStorage.getItem('cb_single_tap') === 'true';
    if (tapToggle) {
      tapToggle.checked = isSingle;
      window.gameUI.singleTap = isSingle;
      tapToggle.onchange = () => {
        const val = tapToggle.checked;
        window.gameUI.singleTap = val;
        localStorage.setItem('cb_single_tap', val ? 'true' : 'false');
      };
    }

    // Sound
    const soundToggle = document.getElementById('toggleSound');
    if (soundToggle) {
      soundToggle.checked = window.soundFX.enabled;
      soundToggle.onchange = () => {
        window.soundFX.enabled = soundToggle.checked;
        localStorage.setItem('cb_sound_enabled', soundToggle.checked ? 'true' : 'false');
        if (soundToggle.checked) window.soundFX.init();
      };
    }

    // Settings Panel Toggle
    const btnMenu = document.getElementById('btnMenu') || document.getElementById('btnOpenSettings');
    const btnCloseSettings = document.getElementById('btnCloseSettings');
    const settingsPanel = document.getElementById('settingsPanel');
    if (btnMenu && settingsPanel) {
      btnMenu.onclick = () => settingsPanel.classList.toggle('open');
    }
    if (btnCloseSettings && settingsPanel) {
      btnCloseSettings.onclick = () => settingsPanel.classList.remove('open');
    }

    // Top-Right Trophy (Scoreboard) Toggle
    const btnTrophy = document.getElementById('btnTrophy');
    const btnCloseScoreModal = document.getElementById('btnCloseScoreModal');
    const scoreModal = document.getElementById('scoreModal');

    if (btnTrophy) {
      btnTrophy.onclick = () => {
        if (!this.publicState) return;
        this.manualScoreModalOpen = true;
        const pub = this.publicState;
        const isHost = pub.players?.some(p => p.id === this.playerId && p.isHost);
        window.gameUI.renderScoreboard(
          pub.scoreHistory,
          pub.players,
          pub.round,
          pub.totalRounds,
          pub.phase === 'game_over',
          () => this.send({ type: 'game_action', action: { type: 'next_round' } }),
          () => this.send({ type: 'game_action', action: { type: 'play_again' } }),
          isHost,
          true // isManualOpen
        );
      };
    }

    if (btnCloseScoreModal && scoreModal) {
      btnCloseScoreModal.onclick = () => {
        this.manualScoreModalOpen = false;
        scoreModal.classList.add('hidden');
      };
    }

    // New Game & Leave Lobby Buttons in Settings
    const btnRestartGame = document.getElementById('btnRestartGame');
    if (btnRestartGame) {
      btnRestartGame.onclick = () => {
        if (settingsPanel) settingsPanel.classList.remove('open');
        this.send({ type: 'restart_game' });
        window.gameUI.showToast('Starting fresh game…');
      };
    }

    const btnLeaveGame = document.getElementById('btnLeaveGame');
    if (btnLeaveGame) {
      btnLeaveGame.onclick = () => {
        if (settingsPanel) settingsPanel.classList.remove('open');
        this.send({ type: 'reset_to_lobby' });
      };
    }
  }

  connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;
    this.isConnecting = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      clearTimeout(this.reconnectTimer);
      const dot = document.getElementById('connDot');
      if (dot) dot.classList.remove('disconnected');

      window.gameUI.requestWakeLock();

      this.send({
        type: 'init',
        sessionToken: this.sessionToken,
        name: this.playerName || undefined,
        roomId: this.roomId,
        gameType: this.gameType
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (err) {
        console.error('Failed to parse server message:', err);
      }
    };

    this.ws.onclose = () => {
      this.isConnecting = false;
      const dot = document.getElementById('connDot');
      if (dot) dot.classList.add('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 5000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'auth_success':
        this.sessionToken = msg.sessionToken;
        this.playerId = msg.playerId;
        this.playerName = msg.playerName;
        this.roomId = msg.roomId;
        localStorage.setItem('cb_session_token', this.sessionToken);
        localStorage.setItem('cb_player_name', this.playerName);
        break;

      case 'lobby_state':
        this.currentRoom = msg.room;
        this.renderLobby(msg);
        break;

      case 'game_state':
        this.currentRoom = msg.room;
        this.onGameStateUpdate(msg);
        break;

      case 'error':
        window.gameUI.showToast(msg.message);
        break;
    }
  }

  onGameStateUpdate({ publicState, privateState, events }) {
    const prevPhase = this.publicState?.phase;
    this.publicState = publicState;
    this.privateState = privateState;

    document.getElementById('joinModal')?.classList.add('hidden');
    document.getElementById('lobbyModal')?.classList.add('hidden');
    document.getElementById('gameTable')?.classList.remove('hidden');

    // If we just entered the game and there are NO events, play a quick
    // "join in progress" deal animation so the user sees cards arrive
    // instead of them being already face-up on screen.
    const hasEvents = events && events.length > 0;
    const isFirstGameRender = !prevPhase && (publicState.phase === 'bidding' || publicState.phase === 'playing');

    if (!hasEvents && isFirstGameRender) {
      // Synthetic deal animation for reconnect / page refresh
      window.AnimQ.push(async aq => {
        await window.sceneShuffle(aq);
      });
      window.AnimQ.push(async aq => {
        await window.sceneDeal(aq, { publicState, privateState });
      });
      // After the deal animation finishes, sync the full DOM state
      window.AnimQ.push(async () => {
        this.syncDOM();
      });
      return; // Don't syncDOM yet — let the animation finish first
    }

    if (hasEvents) {
      events.forEach(ev => {
        switch (ev.type) {
          case 'roundStart':
            // Queue round-start cleanup through AnimQ to keep proper order
            window.AnimQ.push(async () => {
              // Clear trick cross
              ['ts-bottom','ts-right','ts-top','ts-left'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '';
              });
              // Clear hand and opponent fans so deal animation starts fresh
              const handFan = document.getElementById('handFan');
              if (handFan) handFan.innerHTML = '';
              ['fan-top','fan-left','fan-right'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '';
              });
            });
            break;

          case 'shuffle':
            window.AnimQ.push(async aq => {
              await window.sceneShuffle(aq);
            });
            break;

          case 'deal':
            window.AnimQ.push(async aq => {
              await window.sceneDeal(aq, { publicState, privateState });
            });
            break;

          case 'bidPlaced':
            window.AnimQ.push(async aq => {
              await window.sceneBidPlaced(aq, {
                seat: ev.seat,
                bid: ev.bid,
                mySeat: privateState.seat
              });
            });
            break;

          case 'cardPlayed':
            window.AnimQ.push(async aq => {
              await window.sceneCardPlayed(aq, {
                seat: ev.seat,
                card: ev.card,
                mySeat: privateState.seat
              });
            });
            break;

          case 'trickWon':
            window.AnimQ.push(async aq => {
              await window.sceneTrickWon(aq, {
                winnerSeat: ev.winnerSeat,
                mySeat: privateState.seat,
                wasTrump: ev.wasTrump
              });
            });
            break;
        }
      });
    }

    // Schedule DOM sync to apply state when animations finish
    window.AnimQ.push(async () => {
      this.syncDOM();
    });
  }

  syncDOM() {
    const pub = this.publicState;
    const priv = this.privateState;
    if (!pub || !priv) return;

    // Header info
    const roundEl = document.getElementById('headerRound');
    if (roundEl) roundEl.textContent = `Round ${pub.round} / ${pub.totalRounds}`;

    // Disconnect banner
    const pauseBanner = document.getElementById('pauseBanner');
    if (pauseBanner) {
      if (pub.isPaused) {
        pauseBanner.textContent = `⏸ Waiting for ${pub.disconnectedPlayer || 'player'} to reconnect…`;
        pauseBanner.classList.add('show');
      } else {
        pauseBanner.classList.remove('show');
      }
    }

    // Lead suit chip indicator in center
    const leadChip = document.getElementById('leadChip');
    if (leadChip) {
      if (pub.currentTrick && pub.currentTrick.length > 0) {
        const suitName = { S:'♠ Spades', H:'♥ Hearts', D:'♦ Diamonds', C:'♣ Clubs' }[pub.currentTrick[0].card.suit];
        leadChip.textContent = `Lead: ${suitName}`;
        leadChip.style.display = 'block';
      } else {
        leadChip.style.display = 'none';
      }
    }

    // Render Seats & Avatars
    window.gameUI.renderSeats(pub.players, priv.seat, pub.currentTurnSeat, pub.dealerSeat, pub.botThinking);

    // Render Hand
    const isMyTurnToPlay = pub.phase === 'playing' && pub.currentTurnSeat === priv.seat;
    window.gameUI.renderHand(priv.hand, priv.legalCards || [], isMyTurnToPlay);

    // Render Bidding Panel (above hand!)
    const isMyTurnToBid = pub.phase === 'bidding' && pub.currentTurnSeat === priv.seat;
    window.gameUI.renderBidPanel(isMyTurnToBid, (bidValue) => {
      this.send({
        type: 'game_action',
        action: { type: 'bid', bid: bidValue }
      });
    });

    // Turn Prompt Text
    const promptEl = document.getElementById('turnPrompt');
    if (promptEl) {
      if (pub.botThinking) {
        promptEl.textContent = `🤖 ${pub.botThinking} is thinking…`;
      } else if (pub.phase === 'bidding') {
        const bidder = pub.players.find(p => p.seat === pub.currentTurnSeat);
        promptEl.textContent = isMyTurnToBid ? 'Your turn to bid! Choose ½ to 8 above' : `Waiting for ${bidder ? bidder.name : 'player'} to bid…`;
      } else if (pub.phase === 'playing') {
        const active = pub.players.find(p => p.seat === pub.currentTurnSeat);
        promptEl.textContent = isMyTurnToPlay ? 'Your turn to play! Tap a card' : `Waiting for ${active ? active.name : 'player'}…`;
      } else {
        promptEl.textContent = '';
      }
    }

    // Scoreboard Modal
    const isHost = pub.players.some(p => p.id === this.playerId && p.isHost);
    const showScoreboard = pub.phase === 'round_end' || pub.phase === 'game_over';
    if (showScoreboard) {
      this.manualScoreModalOpen = false;
      window.gameUI.renderScoreboard(
        pub.scoreHistory,
        pub.players,
        pub.round,
        pub.totalRounds,
        pub.phase === 'game_over',
        () => this.send({ type: 'game_action', action: { type: 'next_round' } }),
        () => this.send({ type: 'game_action', action: { type: 'play_again' } }),
        isHost,
        false
      );
    } else if (!this.manualScoreModalOpen) {
      document.getElementById('scoreModal')?.classList.add('hidden');
    }
  }

  bindEvents() {
    const btnJoin = document.getElementById('btnJoinLobby');
    const nameInput = document.getElementById('inputPlayerName');
    const roomInput = document.getElementById('inputRoomId');

    if (this.playerName && nameInput) nameInput.value = this.playerName;

    if (btnJoin) {
      btnJoin.onclick = () => {
        const name = (nameInput.value || '').trim();
        if (!name) { window.gameUI.showToast('Please enter your name!'); return; }
        this.playerName = name;
        this.roomId = (roomInput.value || 'MAIN').trim().toUpperCase();
        localStorage.setItem('cb_player_name', this.playerName);

        this.send({
          type: 'init',
          sessionToken: this.sessionToken,
          name: this.playerName,
          roomId: this.roomId,
          gameType: this.gameType
        });

        document.getElementById('joinModal')?.classList.add('hidden');
      };
    }

    const startBtn = document.getElementById('btnStartGame');
    if (startBtn) {
      startBtn.onclick = () => {
        this.send({ type: 'start_game' });
      };
    }
  }

  renderLobby(data) {
    const joinModal = document.getElementById('joinModal');
    const lobbyModal = document.getElementById('lobbyModal');
    const gameTable = document.getElementById('gameTable');

    if (!this.sessionToken || !this.playerName) {
      joinModal?.classList.remove('hidden');
      lobbyModal?.classList.add('hidden');
      gameTable?.classList.add('hidden');
      return;
    }

    joinModal?.classList.add('hidden');
    gameTable?.classList.add('hidden');
    lobbyModal?.classList.remove('hidden');

    const room = data.room;
    const roomCodeEl = document.getElementById('lobbyRoomCode');
    if (roomCodeEl) roomCodeEl.textContent = room.id;

    const shareLinkEl = document.getElementById('lobbyShareLink');
    if (shareLinkEl) {
      shareLinkEl.textContent = window.location.origin;
    }
    const btnCopyLink = document.getElementById('btnCopyShareLink');
    if (btnCopyLink && !btnCopyLink._bound) {
      btnCopyLink._bound = true;
      btnCopyLink.onclick = () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(window.location.origin);
        }
        window.gameUI.showToast('Hotspot link copied! Share with friends.');
      };
    }

    const playerList = document.getElementById('lobbyPlayerList');
    if (playerList) {
      playerList.innerHTML = '';
      room.players.forEach((p, idx) => {
        const item = document.createElement('div');
        item.className = 'lobby-slot';
        item.innerHTML = `
          <div class="lobby-slot-name">Seat ${idx + 1}: ${p.name} ${p.isHost ? '👑' : ''}</div>
          <div class="lobby-slot-tag ${p.isBot ? 'bot' : ''}">${p.isBot ? 'BOT' : 'READY'}</div>
        `;
        playerList.appendChild(item);
      });

      for (let i = room.players.length; i < 4; i++) {
        const item = document.createElement('div');
        item.className = 'lobby-slot empty anim-breathe';
        item.innerHTML = `
          <div class="lobby-slot-name" style="color:var(--clr-text-muted);">Seat ${i + 1}: Waiting for player…</div>
          <div class="lobby-slot-tag" style="background:rgba(255,255,255,0.06);color:var(--clr-text-muted);">BOT FILL</div>
        `;
        playerList.appendChild(item);
      }
    }

    const isHost = room.hostPlayerId === this.playerId;
    const startBtn = document.getElementById('btnStartGame');
    const waitingMsg = document.getElementById('lobbyWaitingNotice');
    const botDiffSelect = document.getElementById('selectBotDifficulty');

    if (botDiffSelect) {
      botDiffSelect.value = room.options?.botDifficulty || 'medium';
      botDiffSelect.disabled = !isHost;
      botDiffSelect.onchange = () => {
        this.send({
          type: 'update_options',
          options: { botDifficulty: botDiffSelect.value }
        });
      };
    }

    if (isHost && startBtn) {
      startBtn.style.display = 'block';
      startBtn.disabled = false;
      const neededBots = 4 - room.players.length;
      startBtn.textContent = neededBots > 0
        ? `Start Call Break (Fill ${neededBots} Bot${neededBots > 1 ? 's' : ''})`
        : 'Start Call Break (4 Ready)';
      if (waitingMsg) waitingMsg.style.display = 'none';
    } else {
      if (startBtn) startBtn.style.display = 'none';
      if (waitingMsg) {
        waitingMsg.style.display = 'block';
        waitingMsg.textContent = 'Waiting for Host to start game…';
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.clientApp = new CardGameClient();
});
