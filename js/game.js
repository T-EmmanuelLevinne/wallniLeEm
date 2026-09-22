/* ==========================================================================
   WallRush 11x11 Main Game Controller Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --------------------------------------------------------------------------
  // Global App State & Color Palette
  // --------------------------------------------------------------------------
  const DEFAULT_INVITATION_CODE = "784921";
  
  const COLOR_PALETTE = [
    { color: 'green', hex: '#2ecc71' },
    { color: 'blue', hex: '#3498db' },
    { color: 'red', hex: '#e74c3c' },
    { color: 'amber', hex: '#f39c12' },
    { color: 'purple', hex: '#9b59b6' },
    { color: 'cyan', hex: '#1abc9c' },
    { color: 'orange', hex: '#e67e22' },
    { color: 'pink', hex: '#fd79a8' }
  ];

  let playerProfile = {
    id: 'p_' + Math.random().toString(36).substring(2, 9),
    name: 'Player 1',
    color: 'green',
    hex: '#2ecc71',
    isReady: false
  };

  let roomState = {
    code: '',
    hostId: '',
    maxPlayers: 4,
    players: [],
    currentTurnIndex: 0,
    gameStarted: false,
    walls: [],
    winner: null
  };

  let isHost = false;
  let joinTimeout = null;
  let joinRetryInterval = null;

  let wallPlacementState = {
    orientation: 'H',
    hoverR: -1,
    hoverC: -1
  };

  let currentActionMode = 'MOVE'; // 'MOVE' or 'WALL'

  // --------------------------------------------------------------------------
  // DOM Element References & Toast System
  // --------------------------------------------------------------------------
  const screens = {
    invite: document.getElementById('screen-invite'),
    profile: document.getElementById('screen-profile'),
    createLobby: document.getElementById('screen-create-lobby'),
    joinLobby: document.getElementById('screen-join-lobby'),
    lobbyRoom: document.getElementById('screen-lobby-room'),
    game: document.getElementById('screen-game')
  };

  const inputInviteCode = document.getElementById('invite-code');
  const inputPlayerName = document.getElementById('player-name');
  const inputJoinCode = document.getElementById('join-room-code');
  const selectMaxPlayers = document.getElementById('max-players-select');
  
  const displayRoomCode = document.getElementById('display-room-code');
  const playerCountLabel = document.getElementById('player-count-label');
  const maxPlayersLabel = document.getElementById('max-players-label');
  const lobbyPlayersList = document.getElementById('lobby-players-list');
  const lobbyColorPicker = document.getElementById('lobby-color-picker');
  const btnStartGame = document.getElementById('btn-start-game');
  const btnReadyToggle = document.getElementById('btn-ready-toggle');
  
  const boardGrid = document.getElementById('board-grid');
  const turnLabel = document.getElementById('turn-label');
  const turnDot = document.getElementById('current-turn-dot');
  const btnModeMove = document.getElementById('btn-mode-move');
  const btnModeWall = document.getElementById('btn-mode-wall');
  const btnRotateWall = document.getElementById('btn-rotate-wall');

  const modalVictory = document.getElementById('modal-victory');
  const winnerTitle = document.getElementById('winner-title');
  const winnerSubtitle = document.getElementById('winner-subtitle');
  const victoryPlayersList = document.getElementById('victory-players-list');
  const victoryWaitingLabel = document.getElementById('victory-waiting-label');
  const btnVictoryReady = document.getElementById('btn-victory-ready');
  const btnPlayAgain = document.getElementById('btn-play-again');
  const btnExitGame = document.getElementById('btn-exit-game');

  const btnToggleInviteVisibility = document.getElementById('btn-toggle-invite-visibility');
  const turnTimerBadge = document.getElementById('turn-timer-badge');
  const turnTimerSeconds = document.getElementById('turn-timer-seconds');

  let turnTimerInterval = null;
  let turnTimeRemaining = 30;

  function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --------------------------------------------------------------------------
  // Navigation & Screen Transitions
  // --------------------------------------------------------------------------
  function showScreen(targetScreen) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    targetScreen.classList.add('active');
  }

  // --------------------------------------------------------------------------
  // Session Recovery & Reconnection Engine
  // --------------------------------------------------------------------------
  function saveActiveSession() {
    if (roomState.code && playerProfile.id) {
      try {
        localStorage.setItem('wallrush_active_session', JSON.stringify({
          roomCode: roomState.code,
          playerProfile: playerProfile,
          isHost: isHost,
          gameStarted: roomState.gameStarted,
          timestamp: Date.now()
        }));
      } catch (e) {}
    }
  }

  function clearActiveSession() {
    try {
      localStorage.removeItem('wallrush_active_session');
    } catch (e) {}
  }

  // Check URL parameters for direct join link e.g. ?join=X7K2P9
  const urlParams = new URLSearchParams(window.location.search);
  const directJoinCode = urlParams.get('join');

  if (directJoinCode) {
    inputJoinCode.value = directJoinCode.toUpperCase();
    showScreen(screens.profile);
  }

  // Auto-Rejoin detection if browser tab was accidentally closed or refreshed
  const savedSessionRaw = localStorage.getItem('wallrush_active_session');
  if (savedSessionRaw && !directJoinCode) {
    try {
      const session = JSON.parse(savedSessionRaw);
      // Valid within last 2 hours
      if (session && session.roomCode && (Date.now() - (session.timestamp || 0) < 2 * 60 * 60 * 1000)) {
        playerProfile = session.playerProfile || playerProfile;
        isHost = !!session.isHost;
        roomState.code = session.roomCode;
        roomState.gameStarted = !!session.gameStarted;
        showToast(`Rejoining match ${session.roomCode}...`, 'success');
        enterLobbyRoom(true);
      }
    } catch (e) {
      clearActiveSession();
    }
  }

  // --------------------------------------------------------------------------
  // Event Listeners: Configuration & Menus
  // --------------------------------------------------------------------------
  if (btnToggleInviteVisibility && inputInviteCode) {
    btnToggleInviteVisibility.addEventListener('click', () => {
      if (inputInviteCode.type === 'password') {
        inputInviteCode.type = 'text';
        btnToggleInviteVisibility.textContent = 'Hide';
      } else {
        inputInviteCode.type = 'password';
        btnToggleInviteVisibility.textContent = 'Show';
      }
    });
  }

  document.getElementById('btn-submit-invite').addEventListener('click', () => {
    const code = inputInviteCode.value.trim();
    if (code === DEFAULT_INVITATION_CODE) {
      showScreen(screens.profile);
    } else {
      inputInviteCode.classList.add('shake-anim');
      showToast('Invalid access code. Please check your invitation code.');
      setTimeout(() => inputInviteCode.classList.remove('shake-anim'), 400);
    }
  });

  // Player Name input
  inputPlayerName.addEventListener('input', (e) => {
    playerProfile.name = e.target.value.trim() || 'Player 1';
  });

  // Profile Screen Actions
  document.getElementById('btn-nav-create').addEventListener('click', () => {
    showScreen(screens.createLobby);
  });

  document.getElementById('btn-nav-join').addEventListener('click', () => {
    showScreen(screens.joinLobby);
  });

  document.getElementById('btn-back-profile-1').addEventListener('click', () => showScreen(screens.profile));
  document.getElementById('btn-back-profile-2').addEventListener('click', () => showScreen(screens.profile));

  // Create Lobby Confirm
  document.getElementById('btn-confirm-create').addEventListener('click', () => {
    isHost = true;
    roomState.code = generateRoomCode();
    roomState.maxPlayers = parseInt(selectMaxPlayers.value);
    roomState.hostId = playerProfile.id;
    roomState.players = [playerProfile];

    saveActiveSession();
    enterLobbyRoom();
  });

  // Join Lobby Confirm
  document.getElementById('btn-confirm-join').addEventListener('click', () => {
    const code = inputJoinCode.value.trim().toUpperCase();
    if (code.length === 6) {
      isHost = false;
      roomState.code = code;
      roomState.players = [playerProfile];
      saveActiveSession();
      enterLobbyRoom();
    } else {
      inputJoinCode.classList.add('shake-anim');
      showToast('Room code must be 6 characters');
      setTimeout(() => inputJoinCode.classList.remove('shake-anim'), 400);
    }
  });

  // 1-Click Copy Invite Link
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const link = `${window.location.origin}${window.location.pathname}?join=${roomState.code}`;
    navigator.clipboard.writeText(link).then(() => {
      const btn = document.getElementById('btn-copy-link');
      btn.textContent = 'Copied!';
      showToast('Invite link copied to clipboard', 'success');
      setTimeout(() => btn.textContent = 'Copy Invite Link', 2000);
    });
  });

  document.getElementById('btn-leave-lobby').addEventListener('click', () => {
    if (joinTimeout) clearTimeout(joinTimeout);
    if (joinRetryInterval) clearInterval(joinRetryInterval);
    broadcastEvent('player_left', { playerId: playerProfile.id });
    clearActiveSession();
    cleanupRoomData(roomState.code);
    showScreen(screens.invite);
  });

  // --------------------------------------------------------------------------
  // Realtime Lobby & Unique Color Selection Engine
  // --------------------------------------------------------------------------
  function enterLobbyRoom(isReconnecting = false) {
    displayRoomCode.textContent = roomState.code;
    maxPlayersLabel.textContent = roomState.maxPlayers;
    
    if (!roomState.gameStarted) {
      showScreen(screens.lobbyRoom);
    }

    ensureUniquePlayerColor();
    renderLobbySlotsUI();
    renderLobbyColorPickerUI();

    if (joinRetryInterval) clearInterval(joinRetryInterval);

    // Initialize Realtime messaging channel
    joinGameRoomChannel(roomState.code, playerProfile, {
      onSubscribed: () => {
        if (!isHost) {
          const evt = isReconnecting ? 'room_reconnect' : 'room_join_request';
          broadcastEvent(evt, playerProfile);
          joinRetryInterval = setInterval(() => {
            if (roomState.players.length > 1 || isHost) {
              clearInterval(joinRetryInterval);
            } else {
              broadcastEvent(evt, playerProfile);
            }
          }, 800);
        } else {
          broadcastEvent('room_sync', roomState);
        }
      },
      onRoomJoinRequest: (joiningPlayer) => {
        if (isHost && roomState.players.length < roomState.maxPlayers) {
          if (!roomState.players.some(p => p.id === joiningPlayer.id)) {
            // Assign first available unique color to joining player
            const claimed = roomState.players.map(p => p.color);
            const avail = COLOR_PALETTE.find(c => !claimed.includes(c.color));
            if (avail) {
              joiningPlayer.color = avail.color;
              joiningPlayer.hex = avail.hex;
            }
            joiningPlayer.isReady = false;
            roomState.players.push(joiningPlayer);
          }
          saveActiveSession();
          broadcastEvent('room_sync', roomState);
          renderLobbySlotsUI();
          renderLobbyColorPickerUI();
        }
      },
      onRoomReconnect: (reconnectingPlayer) => {
        if (isHost) {
          const existing = roomState.players.find(p => p.id === reconnectingPlayer.id);
          if (existing) {
            existing.name = reconnectingPlayer.name || existing.name;
          } else if (roomState.players.length < roomState.maxPlayers) {
            roomState.players.push(reconnectingPlayer);
          }
          saveActiveSession();
          broadcastEvent('room_sync', roomState);
          if (roomState.gameStarted) {
            broadcastEvent('game_started', roomState);
          }
        }
      },
      onRoomSync: (syncedRoomState) => {
        if (joinTimeout) clearTimeout(joinTimeout);
        if (joinRetryInterval) clearInterval(joinRetryInterval);

        roomState = syncedRoomState;
        
        // Update local playerProfile if host assigned a new unique color or ready status
        const meInRoom = roomState.players.find(p => p.id === playerProfile.id);
        if (meInRoom) {
          playerProfile.color = meInRoom.color;
          playerProfile.hex = meInRoom.hex;
          playerProfile.isReady = !!meInRoom.isReady;
        }

        saveActiveSession();

        if (roomState.gameStarted) {
          if (!screens.game.classList.contains('active')) {
            launchActiveGame();
          } else {
            renderBoardState();
          }
        } else {
          renderLobbySlotsUI();
          renderLobbyColorPickerUI();
        }

        if (modalVictory && modalVictory.classList.contains('active')) {
          renderVictoryUI();
        }
      },
      onPlayerColorChanged: (data) => {
        const p = roomState.players.find(pl => pl.id === data.playerId);
        if (p) {
          p.color = data.color;
          p.hex = data.hex;
          renderLobbySlotsUI();
          renderLobbyColorPickerUI();
        }
      },
      onPlayerReadyChanged: (data) => {
        const p = roomState.players.find(pl => pl.id === data.playerId);
        if (p) {
          p.isReady = data.isReady;
          renderLobbySlotsUI();
          if (modalVictory && modalVictory.classList.contains('active')) {
            renderVictoryUI();
          }
          if (isHost) {
            saveActiveSession();
            broadcastEvent('room_sync', roomState);
          }
        }
      },
      onPlayerLeft: (data) => {
        handlePlayerDeparture(data.playerId);
      },
      onPresenceLeave: (key, leftPresences) => {
        if (Array.isArray(leftPresences)) {
          leftPresences.forEach(pres => {
            if (pres.id && pres.id !== playerProfile.id) {
              handlePlayerDeparture(pres.id);
            }
          });
        }
      },
      onGameTerminated: (data) => {
        terminateAndReturnToInvite(data?.reason || 'The match was ended.');
      },
      onGameStarted: (startedState) => {
        roomState = startedState;
        saveActiveSession();
        launchActiveGame();
      },
      onPlayerMove: (moveData) => {
        handleRemoteMove(moveData);
      },
      onWallPlaced: (wallData) => {
        handleRemoteWall(wallData);
      },
      onTurnTimeout: (data) => {
        const timedOutPlayer = roomState.players.find(p => p.id === data.playerId);
        const name = timedOutPlayer ? timedOutPlayer.name : 'Player';
        showToast(`${name}'s turn timed out! Skipped.`);
        advanceTurn(data.nextTurnIndex);
        saveActiveSession();
        renderBoardState();
      },
      onPlayAgain: (resetState) => {
        modalVictory.classList.remove('active');
        roomState = resetState;
        playerProfile.isReady = false;
        saveActiveSession();
        renderBoardState();
        startTurnTimer();
      }
    });

    if (!isHost && !isReconnecting) {
      joinTimeout = setTimeout(() => {
        if (roomState.players.length === 1 && !isHost) {
          if (joinRetryInterval) clearInterval(joinRetryInterval);
          showToast('Invalid room code. Please verify the code and try again.');
          showScreen(screens.joinLobby);
        }
      }, 6000);
    }
  }

  function handlePlayerDeparture(departedPlayerId) {
    const wasInRoom = roomState.players.some(p => p.id === departedPlayerId);
    if (!wasInRoom) return;

    roomState.players = roomState.players.filter(p => p.id !== departedPlayerId);

    if (roomState.gameStarted) {
      // If only 1 player remains in an active match, terminate and return to invitation
      if (roomState.players.length <= 1) {
        terminateAndReturnToInvite('Only 1 player remaining. Game ended and cleaned.');
        return;
      }
      if (roomState.currentTurnIndex >= roomState.players.length) {
        roomState.currentTurnIndex = 0;
      }
      saveActiveSession();
      renderBoardState();
    } else {
      saveActiveSession();
      renderLobbySlotsUI();
    }
  }

  function terminateAndReturnToInvite(reason) {
    stopTurnTimer();
    showToast(reason || 'Match ended.');
    clearActiveSession();
    cleanupRoomData(roomState.code);

    if (joinTimeout) clearTimeout(joinTimeout);
    if (joinRetryInterval) clearInterval(joinRetryInterval);

    roomState = {
      code: '',
      hostId: '',
      maxPlayers: 4,
      players: [],
      currentTurnIndex: 0,
      gameStarted: false,
      walls: [],
      winner: null
    };
    playerProfile.isReady = false;

    modalVictory.classList.remove('active');
    showScreen(screens.invite);
  }

  function ensureUniquePlayerColor() {
    const claimedByOthers = roomState.players
      .filter(p => p.id !== playerProfile.id)
      .map(p => p.color);

    if (claimedByOthers.includes(playerProfile.color)) {
      const avail = COLOR_PALETTE.find(c => !claimedByOthers.includes(c.color));
      if (avail) {
        playerProfile.color = avail.color;
        playerProfile.hex = avail.hex;
      }
    }

    const meInRoom = roomState.players.find(p => p.id === playerProfile.id);
    if (meInRoom) {
      meInRoom.color = playerProfile.color;
      meInRoom.hex = playerProfile.hex;
    }
  }

  function renderLobbyColorPickerUI() {
    if (!lobbyColorPicker) return;
    lobbyColorPicker.innerHTML = '';

    const claimedByOthers = roomState.players
      .filter(p => p.id !== playerProfile.id)
      .map(p => p.color);

    COLOR_PALETTE.forEach(c => {
      const opt = document.createElement('div');
      opt.className = `color-option marble-${c.color}`;
      opt.dataset.color = c.color;
      opt.dataset.hex = c.hex;

      if (c.color === playerProfile.color) {
        opt.classList.add('selected');
      } else if (claimedByOthers.includes(c.color)) {
        opt.classList.add('claimed');
      } else {
        opt.addEventListener('click', () => {
          handleColorSelection(c.color, c.hex);
        });
      }

      lobbyColorPicker.appendChild(opt);
    });
  }

  function handleColorSelection(color, hex) {
    playerProfile.color = color;
    playerProfile.hex = hex;

    const meInRoom = roomState.players.find(p => p.id === playerProfile.id);
    if (meInRoom) {
      meInRoom.color = color;
      meInRoom.hex = hex;
    }

    broadcastEvent('player_color_changed', {
      playerId: playerProfile.id,
      color: color,
      hex: hex
    });

    if (isHost) {
      broadcastEvent('room_sync', roomState);
    }

    renderLobbySlotsUI();
    renderLobbyColorPickerUI();
  }

  function renderLobbySlotsUI() {
    lobbyPlayersList.innerHTML = '';
    playerCountLabel.textContent = roomState.players.length;
    maxPlayersLabel.textContent = roomState.maxPlayers;

    for (let i = 0; i < roomState.maxPlayers; i++) {
      const p = roomState.players[i];
      const slot = document.createElement('div');
      slot.className = `player-slot ${p ? 'filled' : ''}`;

      if (p) {
        const isPlayerHost = (p.id === roomState.hostId || i === 0);
        const isMe = (p.id === playerProfile.id);

        let badgeHTML = '';
        if (isPlayerHost) {
          badgeHTML = '<span class="player-slot-badge">Host</span>';
        } else {
          badgeHTML = p.isReady
            ? '<span class="player-slot-badge ready">Ready</span>'
            : '<span class="player-slot-badge not-ready">Not Ready</span>';
        }

        slot.innerHTML = `
          <div class="player-slot-marble marble-${p.color}"></div>
          <span class="player-slot-name">${escapeHTML(p.name)} ${isMe ? '<span style="opacity:0.75; font-size:0.85em;">(You)</span>' : ''}</span>
          ${badgeHTML}
        `;
      } else {
        slot.innerHTML = `
          <div class="player-slot-marble" style="background: rgba(255,255,255,0.1);"></div>
          <span class="player-slot-waiting">Waiting for player<span class="wave-dots"><span>.</span><span>.</span><span>.</span></span></span>
        `;
      }

      lobbyPlayersList.appendChild(slot);
    }

    const meIsHost = (playerProfile.id === roomState.hostId) || (roomState.players[0] && roomState.players[0].id === playerProfile.id);

    if (meIsHost) {
      btnStartGame.style.display = 'flex';
      if (btnReadyToggle) btnReadyToggle.style.display = 'none';

      // Start Game requires: at least 2 players AND all non-host members are Ready
      const nonHostMembers = roomState.players.slice(1);
      const allMembersReady = nonHostMembers.length > 0 && nonHostMembers.every(m => m.isReady);

      if (roomState.players.length >= 2 && allMembersReady) {
        btnStartGame.removeAttribute('disabled');
      } else {
        btnStartGame.setAttribute('disabled', 'true');
      }
    } else {
      btnStartGame.style.display = 'none';
      if (btnReadyToggle) {
        btnReadyToggle.style.display = 'flex';
        
        const mySlot = roomState.players.find(p => p.id === playerProfile.id);
        const amReady = mySlot ? mySlot.isReady : playerProfile.isReady;

        if (amReady) {
          btnReadyToggle.textContent = 'Cancel Ready';
          btnReadyToggle.classList.add('btn-ready-active');
        } else {
          btnReadyToggle.textContent = 'Ready';
          btnReadyToggle.classList.remove('btn-ready-active');
        }
      }
    }
  }

  // Member Clicks Ready Toggle
  if (btnReadyToggle) {
    btnReadyToggle.addEventListener('click', () => {
      playerProfile.isReady = !playerProfile.isReady;

      const meInRoom = roomState.players.find(p => p.id === playerProfile.id);
      if (meInRoom) {
        meInRoom.isReady = playerProfile.isReady;
      }

      broadcastEvent('player_ready_changed', {
        playerId: playerProfile.id,
        isReady: playerProfile.isReady
      });

      renderLobbySlotsUI();
    });
  }

  // Host Clicks Start Game
  btnStartGame.addEventListener('click', () => {
    if (!isHost && playerProfile.id !== roomState.hostId) return;

    const initialPositions = getOuterPerimeterSpawnPositions(roomState.players.length);

    roomState.players.forEach((p, idx) => {
      p.pos = initialPositions[idx];
    });

    // Randomize who starts the match
    roomState.currentTurnIndex = Math.floor(Math.random() * roomState.players.length);
    roomState.gameStarted = true;
    roomState.walls = [];

    saveActiveSession();
    broadcastEvent('game_started', roomState);
    launchActiveGame();
  });

  // --------------------------------------------------------------------------
  // 11x11 Game Engine & Action Mode Controls
  // --------------------------------------------------------------------------
  function launchActiveGame() {
    currentActionMode = 'MOVE';
    showScreen(screens.game);
    saveActiveSession();
    renderBoardState();
    startTurnTimer();
  }

  function getOuterPerimeterSpawnPositions(numPlayers) {
    const presets = [
      { r: 0, c: 5 },   // Top
      { r: 10, c: 5 },  // Bottom
      { r: 5, c: 0 },   // Left
      { r: 5, c: 10 },  // Right
      { r: 0, c: 2 },   // Top-Left
      { r: 0, c: 8 },   // Top-Right
      { r: 10, c: 2 },  // Bottom-Left
      { r: 10, c: 8 }   // Bottom-Right
    ];
    return presets.slice(0, numPlayers);
  }

  function setActionMode(mode) {
    currentActionMode = mode;
    if (mode === 'MOVE') {
      if (btnModeMove) btnModeMove.classList.add('active');
      if (btnModeWall) btnModeWall.classList.remove('active');
      if (btnRotateWall) btnRotateWall.style.display = 'none';
      document.querySelectorAll('.wall-preview').forEach(el => el.remove());
      
      const isMyTurn = (roomState.players[roomState.currentTurnIndex]?.id === playerProfile.id);
      if (isMyTurn) {
        showMoveHighlights();
      }
    } else {
      if (btnModeWall) btnModeWall.classList.add('active');
      if (btnModeMove) btnModeMove.classList.remove('active');
      if (btnRotateWall) {
        btnRotateWall.style.display = 'inline-block';
        btnRotateWall.textContent = `Rotate (${wallPlacementState.orientation})`;
      }
      clearMoveHighlights();
    }
  }

  if (btnModeMove) btnModeMove.addEventListener('click', () => setActionMode('MOVE'));
  if (btnModeWall) btnModeWall.addEventListener('click', () => setActionMode('WALL'));
  if (btnRotateWall) {
    btnRotateWall.addEventListener('click', () => {
      toggleWallOrientation();
    });
  }

  function toggleWallOrientation() {
    wallPlacementState.orientation = (wallPlacementState.orientation === 'H') ? 'V' : 'H';
    if (btnRotateWall) {
      btnRotateWall.textContent = `Rotate (${wallPlacementState.orientation})`;
    }
    if (currentActionMode === 'WALL' && wallPlacementState.hoverR >= 0 && wallPlacementState.hoverC >= 0) {
      renderWallPreview(wallPlacementState.hoverR, wallPlacementState.hoverC);
    }
  }

  function clearMoveHighlights() {
    boardGrid.querySelectorAll('.highlighted-move').forEach(el => {
      el.classList.remove('highlighted-move');
    });
  }

  function showMoveHighlights() {
    clearMoveHighlights();

    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer || activePlayer.id !== playerProfile.id || !activePlayer.pos) {
      return;
    }

    const currPos = activePlayer.pos;
    const directions = [
      { dr: -1, dc: 0 }, // Up
      { dr: 1, dc: 0 },  // Down
      { dr: 0, dc: -1 }, // Left
      { dr: 0, dc: 1 }   // Right
    ];

    directions.forEach(d => {
      const nr = currPos.r + d.dr;
      const nc = currPos.c + d.dc;

      // Check within board bounds
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
        // Check if movement is not blocked by a wall
        if (!isMoveBlocked(currPos.r, currPos.c, nr, nc, roomState.walls)) {
          // Check cell not occupied by another player
          const isOccupied = roomState.players.some(p => p.pos && p.pos.r === nr && p.pos.c === nc);
          if (!isOccupied) {
            const cell = getCellElem(nr, nc);
            if (cell) {
              cell.classList.add('highlighted-move');
            }
          }
        }
      }
    });
  }

  function renderBoardState() {
    boardGrid.innerHTML = '';

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        if (r === GOAL_POS.r && c === GOAL_POS.c) {
          cell.classList.add('goal-cell');
          const goalRing = document.createElement('div');
          goalRing.className = 'goal-inner-ring';
          cell.appendChild(goalRing);
        }

        cell.addEventListener('click', () => handleCellClick(r, c));
        cell.addEventListener('mouseenter', () => handleCellHover(r, c));

        boardGrid.appendChild(cell);
      }
    }

    const isMyTurn = (roomState.players[roomState.currentTurnIndex]?.id === playerProfile.id);

    roomState.players.forEach(p => {
      if (!p.pos) return;
      const cell = getCellElem(p.pos.r, p.pos.c);
      if (cell) {
        const marble = document.createElement('div');
        marble.className = `marble-sphere marble-${p.color}`;
        
        const isMe = (p.id === playerProfile.id);
        if (isMe) {
          if (isMyTurn) {
            marble.classList.add('selected-player');
          }
          // Clicking the player's circle directly activates Move mode and highlights reachable squares in blue
          marble.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isMyTurn) return;
            setActionMode('MOVE');
            showMoveHighlights();
          });
        }

        cell.appendChild(marble);
      }
    });

    renderPlacedWallsUI();
    updateTurnHeaderUI();

    if (isMyTurn && currentActionMode === 'MOVE') {
      showMoveHighlights();
    } else {
      clearMoveHighlights();
    }
  }

  function renderPlacedWallsUI() {
    document.querySelectorAll('.wall-block').forEach(el => el.remove());

    const boardRect = boardGrid.getBoundingClientRect();
    const cellWidth = boardRect.width / GRID_SIZE;
    const cellHeight = boardRect.height / GRID_SIZE;

    roomState.walls.forEach(w => {
      const wallElem = document.createElement('div');
      wallElem.className = 'wall-block';
      if (w.color) {
        wallElem.classList.add(`wall-${w.color}`);
      }

      if (w.orientation === 'H') {
        wallElem.style.width = `${cellWidth * 2 - 4}px`;
        wallElem.style.height = `8px`;
        wallElem.style.left = `${w.c * cellWidth + 2}px`;
        wallElem.style.top = `${(w.r + 1) * cellHeight - 4}px`;
      } else {
        wallElem.style.width = `8px`;
        wallElem.style.height = `${cellHeight * 2 - 4}px`;
        wallElem.style.left = `${(w.c + 1) * cellWidth - 4}px`;
        wallElem.style.top = `${w.r * cellHeight + 2}px`;
      }

      boardGrid.appendChild(wallElem);
    });
  }

  function updateTurnHeaderUI() {
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer) return;

    turnLabel.textContent = `${activePlayer.name}'s Turn`;
    turnDot.className = `turn-dot turn-pulse marble-${activePlayer.color}`;
  }

  // --------------------------------------------------------------------------
  // Action Handlers
  // --------------------------------------------------------------------------
  function handleCellClick(r, c) {
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer || activePlayer.id !== playerProfile.id) {
      return;
    }

    // MODE 1: Move Marble
    if (currentActionMode === 'MOVE') {
      const currPos = activePlayer.pos;
      const dr = Math.abs(r - currPos.r);
      const dc = Math.abs(c - currPos.c);
      const isAdjacent = (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
      const cellElem = getCellElem(r, c);
      const isHighlighted = cellElem?.classList.contains('highlighted-move');

      if (isHighlighted || (isAdjacent && !isMoveBlocked(currPos.r, currPos.c, r, c, roomState.walls) && !roomState.players.some(p => p.pos && p.pos.r === r && p.pos.c === c))) {
        activePlayer.pos = { r, c };
        clearMoveHighlights();

        const nextTurnIndex = (roomState.currentTurnIndex + 1) % roomState.players.length;

        broadcastEvent('player_move', {
          playerId: playerProfile.id,
          pos: { r, c },
          nextTurnIndex: nextTurnIndex
        });

        advanceTurn(nextTurnIndex);
        saveActiveSession();
        renderBoardState();

        if (r === GOAL_POS.r && c === GOAL_POS.c) {
          triggerVictory(activePlayer);
        }
      }
      return;
    }

    // MODE 2: Place Wall
    if (currentActionMode === 'WALL') {
      const wallR = Math.min(r, GRID_SIZE - 2);
      const wallC = Math.min(c, GRID_SIZE - 2);
      const proposedWall = {
        r: wallR,
        c: wallC,
        orientation: wallPlacementState.orientation,
        color: activePlayer.color,
        playerId: activePlayer.id
      };
      const playerPositions = roomState.players.map(p => ({ id: p.id, pos: p.pos }));

      const check = isValidWallPlacement(proposedWall, roomState.walls, playerPositions);

      if (check.valid) {
        roomState.walls.push(proposedWall);
        document.querySelectorAll('.wall-preview').forEach(el => el.remove());

        const nextIndex = (roomState.currentTurnIndex + 1) % roomState.players.length;

        broadcastEvent('wall_placed', {
          wall: proposedWall,
          nextTurnIndex: nextIndex
        });

        advanceTurn(nextIndex);
        saveActiveSession();
        renderBoardState();
      } else {
        boardGrid.classList.add('shake-anim');
        showToast(check.reason || 'Invalid wall placement');
        setTimeout(() => boardGrid.classList.remove('shake-anim'), 400);
      }
    }
  }

  function handleCellHover(r, c) {
    if (currentActionMode !== 'WALL') return;
    wallPlacementState.hoverR = r;
    wallPlacementState.hoverC = c;
    renderWallPreview(r, c);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'e') {
      toggleWallOrientation();
    }
  });

  function renderWallPreview(r, c) {
    document.querySelectorAll('.wall-preview').forEach(el => el.remove());
    if (currentActionMode !== 'WALL') return;
    if (r < 0 || c < 0) return;

    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer || activePlayer.id !== playerProfile.id) return;

    const wallR = Math.min(r, GRID_SIZE - 2);
    const wallC = Math.min(c, GRID_SIZE - 2);
    const proposedWall = {
      r: wallR,
      c: wallC,
      orientation: wallPlacementState.orientation,
      color: activePlayer.color,
      playerId: activePlayer.id
    };

    const boardRect = boardGrid.getBoundingClientRect();
    const cellWidth = boardRect.width / GRID_SIZE;
    const cellHeight = boardRect.height / GRID_SIZE;

    const previewElem = document.createElement('div');
    previewElem.className = 'wall-preview';

    if (activePlayer && activePlayer.hex) {
      previewElem.style.borderColor = activePlayer.hex;
      previewElem.style.backgroundColor = `${activePlayer.hex}55`;
    }

    const check = isValidWallPlacement(proposedWall, roomState.walls, roomState.players.map(p => ({ id: p.id, pos: p.pos })));
    if (!check.valid) {
      previewElem.classList.add('wall-invalid');
    }

    if (wallPlacementState.orientation === 'H') {
      previewElem.style.width = `${cellWidth * 2 - 4}px`;
      previewElem.style.height = `8px`;
      previewElem.style.left = `${wallC * cellWidth + 2}px`;
      previewElem.style.top = `${(wallR + 1) * cellHeight - 4}px`;
    } else {
      previewElem.style.width = `8px`;
      previewElem.style.height = `${cellHeight * 2 - 4}px`;
      previewElem.style.left = `${(wallC + 1) * cellWidth - 4}px`;
      previewElem.style.top = `${wallR * cellHeight + 2}px`;
    }

    boardGrid.appendChild(previewElem);
  }

  function advanceTurn(nextIndex) {
    roomState.currentTurnIndex = nextIndex;
    resetTurnTimer();
  }

  // --------------------------------------------------------------------------
  // 30-Second Turn Countdown Timer & Auto-Skip Engine
  // --------------------------------------------------------------------------
  function startTurnTimer() {
    stopTurnTimer();
    turnTimeRemaining = 30;
    updateTimerBadgeUI(30);

    turnTimerInterval = setInterval(() => {
      turnTimeRemaining--;
      updateTimerBadgeUI(turnTimeRemaining);

      if (turnTimeRemaining <= 0) {
        stopTurnTimer();
        handleTurnTimeout();
      }
    }, 1000);
  }

  function stopTurnTimer() {
    if (turnTimerInterval) {
      clearInterval(turnTimerInterval);
      turnTimerInterval = null;
    }
  }

  function resetTurnTimer() {
    startTurnTimer();
  }

  function updateTimerBadgeUI(seconds) {
    if (!turnTimerSeconds) return;
    const s = Math.max(0, seconds);
    turnTimerSeconds.textContent = s;

    if (turnTimerBadge) {
      turnTimerBadge.classList.remove('warning', 'critical');
      if (s <= 5) {
        turnTimerBadge.classList.add('critical');
      } else if (s <= 10) {
        turnTimerBadge.classList.add('warning');
      }
    }
  }

  function handleTurnTimeout() {
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer) return;

    // Both the active player and the host can initiate the turn skip
    const isMyTurn = (activePlayer.id === playerProfile.id);
    const isMeHost = (playerProfile.id === roomState.hostId) || (roomState.players[0] && roomState.players[0].id === playerProfile.id);

    if (isMyTurn || isMeHost) {
      const nextTurnIndex = (roomState.currentTurnIndex + 1) % roomState.players.length;

      broadcastEvent('turn_timeout', {
        playerId: activePlayer.id,
        nextTurnIndex: nextTurnIndex
      });

      advanceTurn(nextTurnIndex);
      saveActiveSession();
      renderBoardState();
      showToast(`${activePlayer.name}'s turn timed out! Skipped.`);
    }
  }

  function handleRemoteMove(data) {
    const p = roomState.players.find(pl => pl.id === data.playerId);
    if (p) {
      p.pos = data.pos;
      advanceTurn(data.nextTurnIndex);
      saveActiveSession();
      renderBoardState();

      if (data.pos.r === GOAL_POS.r && data.pos.c === GOAL_POS.c) {
        triggerVictory(p);
      }
    }
  }

  function handleRemoteWall(data) {
    roomState.walls.push(data.wall);
    advanceTurn(data.nextTurnIndex);
    saveActiveSession();
    renderBoardState();
  }

  function triggerVictory(winner) {
    stopTurnTimer();
    winnerTitle.textContent = `${winner.name} Wins!`;
    winnerSubtitle.textContent = `${winner.name} reached the golden center goal (5, 5)!`;

    // Reset member ready flags for the next round
    roomState.players.forEach(p => {
      p.isReady = false;
    });
    playerProfile.isReady = false;

    renderVictoryUI();
    modalVictory.classList.add('active');

    if (window.confetti) {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }

  function renderVictoryUI() {
    if (!victoryPlayersList) return;
    victoryPlayersList.innerHTML = '';

    const meIsHost = (playerProfile.id === roomState.hostId) || (roomState.players[0] && roomState.players[0].id === playerProfile.id);

    const nonHostMembers = roomState.players.slice(1);
    const allMembersReady = nonHostMembers.length > 0 && nonHostMembers.every(m => m.isReady);

    roomState.players.forEach((p, idx) => {
      const slot = document.createElement('div');
      slot.className = 'player-slot filled';

      const isHostSlot = (p.id === roomState.hostId || idx === 0);
      const isMe = (p.id === playerProfile.id);

      let badgeHTML = '';
      if (isHostSlot) {
        badgeHTML = '<span class="player-slot-badge">Host</span>';
      } else {
        badgeHTML = p.isReady
          ? '<span class="player-slot-badge ready">Ready</span>'
          : '<span class="player-slot-badge not-ready">Not Ready</span>';
      }

      slot.innerHTML = `
        <div class="player-slot-marble marble-${p.color}"></div>
        <span class="player-slot-name">${escapeHTML(p.name)} ${isMe ? '<span style="opacity:0.75; font-size:0.85em;">(You)</span>' : ''}</span>
        ${badgeHTML}
      `;

      victoryPlayersList.appendChild(slot);
    });

    if (meIsHost) {
      btnPlayAgain.style.display = 'block';
      if (btnVictoryReady) btnVictoryReady.style.display = 'none';

      if (allMembersReady && roomState.players.length >= 2) {
        btnPlayAgain.removeAttribute('disabled');
        if (victoryWaitingLabel) victoryWaitingLabel.textContent = 'All players ready! Click Play Again to restart match.';
      } else {
        btnPlayAgain.setAttribute('disabled', 'true');
        if (victoryWaitingLabel) victoryWaitingLabel.textContent = 'Waiting for player to ready...';
      }
    } else {
      btnPlayAgain.style.display = 'none';
      if (btnVictoryReady) {
        btnVictoryReady.style.display = 'block';
        const mySlot = roomState.players.find(p => p.id === playerProfile.id);
        const amReady = mySlot ? mySlot.isReady : playerProfile.isReady;

        if (amReady) {
          btnVictoryReady.textContent = 'Cancel Ready';
          btnVictoryReady.classList.add('btn-ready-active');
          if (victoryWaitingLabel) victoryWaitingLabel.textContent = 'You are ready. Waiting for host to start...';
        } else {
          btnVictoryReady.textContent = 'Ready';
          btnVictoryReady.classList.remove('btn-ready-active');
          if (victoryWaitingLabel) victoryWaitingLabel.textContent = 'Waiting for player to ready...';
        }
      }
    }
  }

  // Member ready toggle button in victory modal
  if (btnVictoryReady) {
    btnVictoryReady.addEventListener('click', () => {
      playerProfile.isReady = !playerProfile.isReady;
      const meInRoom = roomState.players.find(p => p.id === playerProfile.id);
      if (meInRoom) {
        meInRoom.isReady = playerProfile.isReady;
      }

      broadcastEvent('player_ready_changed', {
        playerId: playerProfile.id,
        isReady: playerProfile.isReady
      });

      renderVictoryUI();
    });
  }

  btnPlayAgain.addEventListener('click', () => {
    const isPlayerHost = (playerProfile.id === roomState.hostId) || (roomState.players[0] && roomState.players[0].id === playerProfile.id);
    if (!isPlayerHost) return;

    const initialPositions = getOuterPerimeterSpawnPositions(roomState.players.length);
    roomState.players.forEach((p, idx) => {
      p.pos = initialPositions[idx];
      p.isReady = false;
    });

    playerProfile.isReady = false;
    roomState.walls = [];
    roomState.currentTurnIndex = Math.floor(Math.random() * roomState.players.length);
    roomState.winner = null;

    if (supabaseClient && roomState.code) {
      supabaseClient.from('matches').delete().eq('room_code', roomState.code).then(() => {}).catch(() => {});
    }

    broadcastEvent('play_again', roomState);
    modalVictory.classList.remove('active');
    saveActiveSession();
    renderBoardState();
    startTurnTimer();
  });

  btnExitGame.addEventListener('click', () => {
    const isPlayerHost = (playerProfile.id === roomState.hostId) || (roomState.players[0] && roomState.players[0].id === playerProfile.id);
    if (isPlayerHost) {
      broadcastEvent('game_terminated', { reason: 'Host exited the game.' });
    } else {
      broadcastEvent('player_left', { playerId: playerProfile.id });
    }
    terminateAndReturnToInvite('Returned to invitation menu.');
  });

  function getCellElem(r, c) {
    return boardGrid.querySelector(`[data-r="${r}"][data-c="${c}"]`);
  }

  function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

});
