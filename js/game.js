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
  let lastMoveAnimation = null; // { playerId, from: { r, c }, to: { r, c }, isJump: boolean, color: string }
  let lastPlacedWall = null;    // { r, c, orientation, color, playerId }
  let isDraggingWall = false;
  let lastWallPlacementTime = 0;
  let activeDragHud = null;
  let activeTouchBeacon = null;
  let activeCrosshairs = { h: null, v: null };
  let lastGuidePos = { clientX: 0, clientY: 0 };

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

  const btnBurnOut = document.getElementById('btn-burn-out');
  const btnBurnOutText = document.getElementById('btn-burn-out-text');
  const modalBurnConfirm = document.getElementById('modal-burn-confirm');
  const btnCancelBurn = document.getElementById('btn-cancel-burn');
  const btnConfirmBurn = document.getElementById('btn-confirm-burn');
  const livePlayersList = document.getElementById('live-players-list');
  const livePlayerCount = document.getElementById('live-player-count');

  let turnTimerInterval = null;
  let turnTimeRemaining = 30;
  let isReconnectingActive = false;
  let reconnectTimeout = null;

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
    }, 3200);
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
    // Only save session if the match has already started (is already playing)
    // If a lobby is still in waiting room, it should not persist or be reconnected to
    if (roomState.code && playerProfile.id && roomState.gameStarted) {
      try {
        localStorage.setItem('wallrush_active_session', JSON.stringify({
          roomCode: roomState.code,
          playerProfile: playerProfile,
          isHost: isHost,
          gameStarted: true,
          timestamp: Date.now()
        }));
      } catch (e) {}
    } else {
      clearActiveSession();
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
  // Requirement: Only reconnect to an existing match that is already playing!
  const savedSessionRaw = localStorage.getItem('wallrush_active_session');
  if (savedSessionRaw && !directJoinCode) {
    try {
      const session = JSON.parse(savedSessionRaw);
      // Valid within last 2 hours AND only if match was already playing
      if (session && session.roomCode && session.gameStarted && (Date.now() - (session.timestamp || 0) < 2 * 60 * 60 * 1000)) {
        attemptReconnection(session);
      } else {
        clearActiveSession();
      }
    } catch (e) {
      clearActiveSession();
    }
  }

  function attemptReconnection(session) {
    isReconnectingActive = true;
    playerProfile = session.playerProfile || playerProfile;
    isHost = !!session.isHost;
    roomState.code = session.roomCode;
    roomState.gameStarted = true;

    showToast(`Reconnecting to active match ${session.roomCode}...`, 'neutral');

    // Strict 3.5s verification timeout: if no active players reply, abandon reconnection cleanly
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(() => {
      failReconnection(`Cannot reconnect: Match ${session.roomCode} no longer exists or has ended.`);
    }, 3500);

    enterLobbyRoom(true);
  }

  function failReconnection(reason) {
    isReconnectingActive = false;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (joinRetryInterval) {
      clearInterval(joinRetryInterval);
      joinRetryInterval = null;
    }
    clearActiveSession();
    cleanupRoomData(roomState.code);

    roomState.code = '';
    roomState.players = [];
    roomState.gameStarted = false;

    showToast(reason || 'Match is no longer available.', 'error');
    showScreen(screens.invite);
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
    if (reconnectTimeout) clearTimeout(reconnectTimeout);

    const isOnlyPlayer = (roomState.players.length <= 1);
    const wasHost = isHost || (roomState.hostId === playerProfile.id);

    // USER REQUIREMENT: "when i leave this lobby ONLY, it should no longer exist and deleted."
    if (isOnlyPlayer || wasHost) {
      broadcastEvent('game_terminated', { reason: 'Lobby closed and deleted.' });
      cleanupRoomData(roomState.code);
    } else {
      broadcastEvent('player_left', { playerId: playerProfile.id });
    }

    clearActiveSession();
    cleanupRoomData(roomState.code);

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

    showScreen(screens.invite);
    showToast('Lobby closed and deleted.', 'neutral');
  });

  // Automatically delete empty lobby if tab is closed or user leaves while alone in waiting room
  window.addEventListener('beforeunload', () => {
    if (roomState.code) {
      const isOnlyPlayer = (roomState.players.length <= 1);
      if (isOnlyPlayer && !roomState.gameStarted) {
        clearActiveSession();
        cleanupRoomData(roomState.code);
        broadcastEvent('game_terminated', { reason: 'Lobby closed and deleted.' });
      }
    }
  });

  // --------------------------------------------------------------------------
  // Realtime Lobby & Unique Color Selection Engine
  // --------------------------------------------------------------------------
  function enterLobbyRoom(isReconnecting = false) {
    displayRoomCode.textContent = roomState.code;
    maxPlayersLabel.textContent = roomState.maxPlayers;
    
    // Only display waiting room screen if NOT a reconnection attempt (avoid showing empty 0/4 lobby!)
    if (!roomState.gameStarted && !isReconnecting) {
      showScreen(screens.lobbyRoom);
    }

    ensureUniquePlayerColor();
    renderLobbySlotsUI();
    renderLobbyColorPickerUI();

    if (joinRetryInterval) clearInterval(joinRetryInterval);

    // Initialize Realtime messaging channel
    joinGameRoomChannel(roomState.code, playerProfile, {
      onSubscribed: () => {
        if (isReconnecting) {
          broadcastEvent('room_reconnect_query', { playerId: playerProfile.id });
          broadcastEvent('room_reconnect', playerProfile);
        } else if (!isHost) {
          const evt = 'room_join_request';
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
      onRoomReconnectQuery: (queryData) => {
        // Any active participant in the room responds to reconnect query with room_sync
        if (roomState.code && roomState.players.length > 0 && queryData.playerId !== playerProfile.id) {
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
          if (roomState.gameStarted) {
            // USER REQUIREMENT: "it reconnected, it can only spectate as well."
            if (existing) {
              existing.burnedOut = true;
              existing.isSpectating = true;
              existing.pos = null;
            } else {
              roomState.players.push({
                ...reconnectingPlayer,
                burnedOut: true,
                isSpectating: true,
                pos: null
              });
            }
            if (roomState.players[roomState.currentTurnIndex]?.id === reconnectingPlayer.id) {
              roomState.currentTurnIndex = getNextActiveTurnIndex(roomState.currentTurnIndex);
            }
          } else {
            if (existing) {
              existing.name = reconnectingPlayer.name || existing.name;
            } else if (roomState.players.length < roomState.maxPlayers) {
              roomState.players.push(reconnectingPlayer);
            }
          }
          saveActiveSession();
          broadcastEvent('room_sync', roomState);
          if (roomState.gameStarted) {
            broadcastEvent('game_started', roomState);
          }
        }
      },
      onPresenceSync: (presenceState) => {
        if (isReconnectingActive && presenceState) {
          const others = Object.keys(presenceState).filter(k => k !== playerProfile.id);
          if (others.length === 0) {
            setTimeout(() => {
              if (isReconnectingActive) {
                failReconnection(`Cannot reconnect: Match ${roomState.code} has no other active players.`);
              }
            }, 2500);
          }
        }
      },
      onRoomSync: (syncedRoomState) => {
        if (joinTimeout) clearTimeout(joinTimeout);
        if (joinRetryInterval) clearInterval(joinRetryInterval);

        if (isReconnectingActive) {
          // Check that there are active players left in the match
          const anyOtherPlayers = (syncedRoomState.players || []).filter(p => p.id !== playerProfile.id);

          if (anyOtherPlayers.length === 0) {
            failReconnection(`Cannot reconnect: Match ${syncedRoomState.code} has no active players left.`);
            return;
          }

          isReconnectingActive = false;
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
          }

          // USER REQUIREMENT: "Dont remove the thing reconnecting to existing lobby that is already playing, it reconnected, it can only spectate as well."
          if (syncedRoomState.gameStarted) {
            playerProfile.burnedOut = true;
            playerProfile.isSpectating = true;

            const meInRoom = syncedRoomState.players.find(p => p.id === playerProfile.id);
            if (meInRoom) {
              meInRoom.burnedOut = true;
              meInRoom.isSpectating = true;
              meInRoom.pos = null;
            } else {
              syncedRoomState.players.push({
                ...playerProfile,
                burnedOut: true,
                isSpectating: true,
                pos: null
              });
            }

            // If it was supposed to be this player's turn, advance turn so match continues
            if (syncedRoomState.currentTurnIndex < syncedRoomState.players.length &&
                syncedRoomState.players[syncedRoomState.currentTurnIndex].id === playerProfile.id) {
              syncedRoomState.currentTurnIndex = getNextActiveTurnIndex(syncedRoomState.currentTurnIndex);
            }

            showToast(`Reconnected to live match ${syncedRoomState.code}! You are spectating.`, 'neutral');
          } else {
            showToast(`Reconnected to match ${syncedRoomState.code}!`, 'success');
          }
        }

        roomState = syncedRoomState;
        
        // Update local playerProfile if host assigned a new unique color or ready status
        const meInRoom = roomState.players.find(p => p.id === playerProfile.id);
        if (meInRoom) {
          playerProfile.color = meInRoom.color;
          playerProfile.hex = meInRoom.hex;
          playerProfile.isReady = !!meInRoom.isReady;
          playerProfile.burnedOut = !!meInRoom.burnedOut;
          playerProfile.isSpectating = !!meInRoom.isSpectating;
        }

        saveActiveSession();

        if (roomState.gameStarted) {
          if (!screens.game.classList.contains('active')) {
            launchActiveGame();
          } else {
            renderBoardState();
          }
        } else {
          showScreen(screens.lobbyRoom);
          renderLobbySlotsUI();
          renderLobbyColorPickerUI();
        }

        if (modalVictory && modalVictory.classList.contains('active')) {
          renderVictoryUI();
        }
      },
      onPlayerBurnOut: (data) => {
        handleRemotePlayerBurnOut(data);
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
        playerProfile.burnedOut = false;
        playerProfile.isSpectating = false;
        saveActiveSession();
        renderBoardState();
        startTurnTimer();
      }
    });

    if (!isHost && !isReconnecting) {
      joinTimeout = setTimeout(() => {
        if (roomState.players.length <= 1 && !isHost) {
          if (joinRetryInterval) clearInterval(joinRetryInterval);
          clearActiveSession();
          cleanupRoomData(roomState.code);
          showToast('Invalid room code. Please verify the code and try again.');
          showScreen(screens.joinLobby);
        }
      }, 5000);
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
    if (playerProfile.burnedOut) return;
    currentActionMode = mode;
    if (mode === 'MOVE') {
      if (btnModeMove) btnModeMove.classList.add('active');
      if (btnModeWall) btnModeWall.classList.remove('active');
      if (btnRotateWall) btnRotateWall.style.display = 'none';
      clearWallDragGuide();
      
      const isMyTurn = (roomState.players[roomState.currentTurnIndex]?.id === playerProfile.id && !playerProfile.burnedOut);
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
    if (playerProfile.burnedOut) return;
    wallPlacementState.orientation = (wallPlacementState.orientation === 'H') ? 'V' : 'H';
    if (btnRotateWall) {
      btnRotateWall.textContent = `Rotate (${wallPlacementState.orientation})`;
    }
    if (currentActionMode === 'WALL') {
      if (isDraggingWall || activeDragHud) {
        renderWallDragGuide(lastGuidePos.clientX, lastGuidePos.clientY, wallPlacementState.hoverR, wallPlacementState.hoverC);
      } else if (wallPlacementState.hoverR >= 0 && wallPlacementState.hoverC >= 0) {
        renderWallPreview(wallPlacementState.hoverR, wallPlacementState.hoverC);
      }
    }
  }

  function clearMoveHighlights() {
    boardGrid.querySelectorAll('.highlighted-move').forEach(el => {
      el.classList.remove('highlighted-move', 'jump-move');
    });
  }

  function getValidMovesForPlayer(player, currentRoomState) {
    if (!player || !player.pos || player.burnedOut) return [];

    const currPos = player.pos;
    const walls = currentRoomState.walls || [];
    const otherPlayers = (currentRoomState.players || []).filter(p => p.id !== player.id && p.pos && !p.burnedOut);
    const validMoves = [];

    const directions = [
      { dr: -1, dc: 0 }, // Up
      { dr: 1, dc: 0 },  // Down
      { dr: 0, dc: -1 }, // Left
      { dr: 0, dc: 1 }   // Right
    ];

    directions.forEach(d => {
      const nr = currPos.r + d.dr;
      const nc = currPos.c + d.dc;

      // 1. Check within board bounds
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) {
        return;
      }

      // 2. Check if movement to adjacent cell is blocked by a wall
      if (isMoveBlocked(currPos.r, currPos.c, nr, nc, walls)) {
        return;
      }

      // 3. Check if adjacent cell is occupied by another player
      const occupyingPlayer = otherPlayers.find(p => p.pos.r === nr && p.pos.c === nc);

      if (!occupyingPlayer) {
        // Normal 1-step move
        validMoves.push({ r: nr, c: nc, type: 'STEP' });
      } else {
        // Occupied: Jump over opponent logic!
        const straightR = nr + d.dr;
        const straightC = nc + d.dc;

        const isStraightInBounds = (straightR >= 0 && straightR < GRID_SIZE && straightC >= 0 && straightC < GRID_SIZE);
        const isStraightWallBlocked = isStraightInBounds ? isMoveBlocked(nr, nc, straightR, straightC, walls) : true;
        const isStraightOccupied = isStraightInBounds ? otherPlayers.some(p => p.pos.r === straightR && p.pos.c === straightC) : true;

        if (isStraightInBounds && !isStraightWallBlocked && !isStraightOccupied) {
          validMoves.push({
            r: straightR,
            c: straightC,
            type: 'JUMP',
            overPlayerId: occupyingPlayer.id,
            overPos: { r: nr, c: nc }
          });
        } else {
          // Straight jump is blocked by a wall behind opponent or board edge; allow diagonal jump to either side
          const perpendiculars = (d.dr !== 0)
            ? [{ pdr: 0, pdc: -1 }, { pdr: 0, pdc: 1 }]
            : [{ pdr: -1, pdc: 0 }, { pdr: 1, pdc: 0 }];

          perpendiculars.forEach(p => {
            const diagR = nr + p.pdr;
            const diagC = nc + p.pdc;

            if (diagR >= 0 && diagR < GRID_SIZE && diagC >= 0 && diagC < GRID_SIZE) {
              if (!isMoveBlocked(nr, nc, diagR, diagC, walls)) {
                if (!otherPlayers.some(pl => pl.pos.r === diagR && pl.pos.c === diagC)) {
                  validMoves.push({
                    r: diagR,
                    c: diagC,
                    type: 'DIAG_JUMP',
                    overPlayerId: occupyingPlayer.id,
                    overPos: { r: nr, c: nc }
                  });
                }
              }
            }
          });
        }
      }
    });

    return validMoves;
  }

  function showMoveHighlights() {
    clearMoveHighlights();
    if (playerProfile.burnedOut) return;

    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer || activePlayer.id !== playerProfile.id || !activePlayer.pos || activePlayer.burnedOut) {
      return;
    }

    const validMoves = getValidMovesForPlayer(activePlayer, roomState);
    validMoves.forEach(m => {
      const cell = getCellElem(m.r, m.c);
      if (cell) {
        cell.classList.add('highlighted-move');
        if (m.type === 'JUMP' || m.type === 'DIAG_JUMP') {
          cell.classList.add('jump-move');
        }
      }
    });
  }

  function getNextActiveTurnIndex(fromIndex) {
    const total = roomState.players.length;
    if (total <= 1) return 0;
    for (let step = 1; step <= total; step++) {
      const idx = (fromIndex + step) % total;
      if (!roomState.players[idx].burnedOut) {
        return idx;
      }
    }
    return fromIndex;
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

    // Spawn ghost trail marker at previous position if a move just occurred
    if (lastMoveAnimation && lastMoveAnimation.from) {
      const fromCell = getCellElem(lastMoveAnimation.from.r, lastMoveAnimation.from.c);
      if (fromCell) {
        const trail = document.createElement('div');
        trail.className = `move-trail-marker ripple-${lastMoveAnimation.color || 'blue'}`;
        fromCell.appendChild(trail);
        setTimeout(() => trail.remove(), 600);
      }
    }

    const isMyTurn = (roomState.players[roomState.currentTurnIndex]?.id === playerProfile.id && !playerProfile.burnedOut);

    roomState.players.forEach(p => {
      if (!p.pos || p.burnedOut) return;
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
            if (!isMyTurn || playerProfile.burnedOut) return;
            setActionMode('MOVE');
            showMoveHighlights();
          });
        }

        cell.appendChild(marble);

        // Check if this player is moving in this render frame
        if (lastMoveAnimation && lastMoveAnimation.playerId === p.id && lastMoveAnimation.from) {
          const fromPos = lastMoveAnimation.from;
          const toPos = p.pos;
          const boardRect = boardGrid.getBoundingClientRect();
          const cellWidth = boardRect.width > 0 ? (boardRect.width / GRID_SIZE) : 48;
          const cellHeight = boardRect.height > 0 ? (boardRect.height / GRID_SIZE) : 48;
          const deltaX = (fromPos.c - toPos.c) * cellWidth;
          const deltaY = (fromPos.r - toPos.r) * cellHeight;

          if (lastMoveAnimation.isJump) {
            marble.style.setProperty('--jump-dx', `${deltaX}px`);
            marble.style.setProperty('--jump-dy', `${deltaY}px`);
            marble.classList.add('marble-jumping');
          } else {
            marble.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            marble.style.transition = 'none';

            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                marble.style.transition = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)';
                marble.style.transform = 'translate(0px, 0px)';
              });
            });
          }

          const animDuration = lastMoveAnimation.isJump ? 380 : 320;
          setTimeout(() => {
            if (cell.contains(marble)) {
              marble.classList.add('marble-landing-bounce');
              const ripple = document.createElement('div');
              ripple.className = `move-landing-ripple ripple-${p.color}`;
              cell.appendChild(ripple);
              setTimeout(() => ripple.remove(), 500);
              setTimeout(() => {
                marble.classList.remove('marble-landing-bounce', 'marble-jumping');
              }, 350);
            }
          }, animDuration);
        }
      }
    });

    // Reset move animation state once consumed for this frame
    lastMoveAnimation = null;

    renderPlacedWallsUI();
    updateTurnHeaderUI();
    renderGamePlayersList();
    updateBurnOutButtonUI();

    if (isMyTurn && currentActionMode === 'MOVE' && !playerProfile.burnedOut) {
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

      const isNewWall = lastPlacedWall &&
        w.r === lastPlacedWall.r &&
        w.c === lastPlacedWall.c &&
        w.orientation === lastPlacedWall.orientation;

      if (isNewWall) {
        wallElem.classList.add('wall-slam-in');
        spawnWallImpactEffect(w, cellWidth, cellHeight);
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

    lastPlacedWall = null;
  }

  function spawnWallImpactEffect(wall, cellWidth, cellHeight) {
    boardGrid.classList.remove('board-slam-shake');
    void boardGrid.offsetWidth;
    boardGrid.classList.add('board-slam-shake');
    setTimeout(() => boardGrid.classList.remove('board-slam-shake'), 260);

    const pulse = document.createElement('div');
    pulse.className = `wall-impact-pulse pulse-${wall.color || 'blue'}`;

    if (wall.orientation === 'H') {
      pulse.style.width = `${cellWidth * 2 + 16}px`;
      pulse.style.height = `22px`;
      pulse.style.left = `${wall.c * cellWidth - 8}px`;
      pulse.style.top = `${(wall.r + 1) * cellHeight - 11}px`;
    } else {
      pulse.style.width = `22px`;
      pulse.style.height = `${cellHeight * 2 + 16}px`;
      pulse.style.left = `${(wall.c + 1) * cellWidth - 11}px`;
      pulse.style.top = `${wall.r * cellHeight - 8}px`;
    }

    boardGrid.appendChild(pulse);
    setTimeout(() => pulse.remove(), 480);
  }

  function updateTurnHeaderUI() {
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer) return;

    if (activePlayer.burnedOut) {
      const nextIdx = getNextActiveTurnIndex(roomState.currentTurnIndex);
      advanceTurn(nextIdx);
      return;
    }

    const isMe = (activePlayer.id === playerProfile.id);
    turnLabel.textContent = isMe ? "Your Turn!" : `${activePlayer.name}'s Turn`;
    turnDot.className = `turn-dot turn-pulse marble-${activePlayer.color}`;
  }

  // --------------------------------------------------------------------------
  // Action Handlers
  // --------------------------------------------------------------------------
  function handleCellClick(r, c) {
    if (playerProfile.burnedOut) return;
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer || activePlayer.id !== playerProfile.id || activePlayer.burnedOut) {
      return;
    }

    // MODE 1: Move Marble
    if (currentActionMode === 'MOVE') {
      const validMoves = getValidMovesForPlayer(activePlayer, roomState);

      // Check if clicking directly on a valid landing tile
      let targetMove = validMoves.find(m => m.r === r && m.c === c);

      // Or if clicking on an adjacent opponent tile to jump over them
      if (!targetMove) {
        targetMove = validMoves.find(m => m.overPos && m.overPos.r === r && m.overPos.c === c && m.type === 'JUMP');
        if (!targetMove) {
          targetMove = validMoves.find(m => m.overPos && m.overPos.r === r && m.overPos.c === c);
        }
      }

      if (targetMove) {
        const destR = targetMove.r;
        const destC = targetMove.c;
        const fromPos = activePlayer.pos ? { r: activePlayer.pos.r, c: activePlayer.pos.c } : null;
        const isJump = (targetMove.type === 'JUMP') || (fromPos && (Math.abs(destR - fromPos.r) > 1 || Math.abs(destC - fromPos.c) > 1));

        if (fromPos) {
          lastMoveAnimation = {
            playerId: activePlayer.id,
            from: fromPos,
            to: { r: destR, c: destC },
            isJump: isJump,
            color: activePlayer.color
          };
        }

        activePlayer.pos = { r: destR, c: destC };
        clearMoveHighlights();

        const nextTurnIndex = getNextActiveTurnIndex(roomState.currentTurnIndex);

        broadcastEvent('player_move', {
          playerId: playerProfile.id,
          pos: { r: destR, c: destC },
          from: fromPos,
          isJump: isJump,
          nextTurnIndex: nextTurnIndex
        });

        advanceTurn(nextTurnIndex);
        saveActiveSession();
        renderBoardState();

        if (destR === GOAL_POS.r && destC === GOAL_POS.c) {
          triggerVictory(activePlayer);
        }
      } else {
        const currPos = activePlayer.pos;
        const dr = Math.abs(r - currPos.r);
        const dc = Math.abs(c - currPos.c);
        const isAdjacent = (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
        const isOccupied = roomState.players.some(p => p.pos && !p.burnedOut && p.pos.r === r && p.pos.c === c);

        if (isAdjacent && isOccupied) {
          showToast('Cannot jump over player: path is blocked!');
        }
      }
      return;
    }

    // MODE 2: Place Wall
    if (currentActionMode === 'WALL') {
      if (Date.now() - lastWallPlacementTime < 350) return;
      const wallR = Math.min(r, GRID_SIZE - 2);
      const wallC = Math.min(c, GRID_SIZE - 2);
      const proposedWall = {
        r: wallR,
        c: wallC,
        orientation: wallPlacementState.orientation,
        color: activePlayer.color,
        playerId: activePlayer.id
      };
      const playerPositions = roomState.players.filter(p => !p.burnedOut).map(p => ({ id: p.id, pos: p.pos }));

      const check = isValidWallPlacement(proposedWall, roomState.walls, playerPositions);

      if (check.valid) {
        lastWallPlacementTime = Date.now();
        lastPlacedWall = proposedWall;
        roomState.walls.push(proposedWall);
        clearWallDragGuide();

        const nextIndex = getNextActiveTurnIndex(roomState.currentTurnIndex);

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

  // --------------------------------------------------------------------------
  // Mobile Wall Drag-to-Place Guidance System
  // --------------------------------------------------------------------------
  function getNearestWallSeam(clientX, clientY, orientation) {
    const rect = boardGrid.getBoundingClientRect();
    const cellWidth = rect.width / GRID_SIZE;
    const cellHeight = rect.height / GRID_SIZE;

    // Upward offset on touch devices so the player's thumb does not obscure the seam
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const offsetY = isTouch ? -16 : 0;

    const x = clientX - rect.left;
    const y = clientY - rect.top + offsetY;

    let r = Math.round((y / cellHeight) - 1);
    let c = Math.round((x / cellWidth) - 1);

    r = Math.max(0, Math.min(GRID_SIZE - 2, r));
    c = Math.max(0, Math.min(GRID_SIZE - 2, c));

    return { r, c };
  }

  function renderWallDragGuide(clientX, clientY, r, c) {
    if (currentActionMode !== 'WALL') return;
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer || activePlayer.id !== playerProfile.id || activePlayer.burnedOut) return;

    lastGuidePos = { clientX, clientY };

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

    const playerPositions = roomState.players.filter(p => !p.burnedOut).map(p => ({ id: p.id, pos: p.pos }));
    const check = isValidWallPlacement(proposedWall, roomState.walls, playerPositions);

    // 1. Snapped Wall Preview on the Grid Seam
    let previewElem = boardGrid.querySelector('.wall-preview');
    if (!previewElem) {
      previewElem = document.createElement('div');
      previewElem.className = 'wall-preview wall-drag-preview';
      boardGrid.appendChild(previewElem);
    }
    previewElem.classList.add('wall-drag-preview');

    if (activePlayer && activePlayer.hex) {
      previewElem.style.borderColor = activePlayer.hex;
      previewElem.style.backgroundColor = `${activePlayer.hex}55`;
    }

    if (!check.valid) {
      previewElem.classList.add('wall-invalid');
    } else {
      previewElem.classList.remove('wall-invalid');
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

    // 2. Crosshair Laser Alignment Lines across the Board
    if (!activeCrosshairs.h) {
      activeCrosshairs.h = document.createElement('div');
      activeCrosshairs.h.className = 'wall-crosshair wall-crosshair-h';
      boardGrid.appendChild(activeCrosshairs.h);
    }
    if (!activeCrosshairs.v) {
      activeCrosshairs.v = document.createElement('div');
      activeCrosshairs.v.className = 'wall-crosshair wall-crosshair-v';
      boardGrid.appendChild(activeCrosshairs.v);
    }

    activeCrosshairs.h.style.top = `${(wallR + 1) * cellHeight}px`;
    activeCrosshairs.v.style.left = `${(wallC + 1) * cellWidth}px`;

    if (!check.valid) {
      activeCrosshairs.h.classList.add('invalid');
      activeCrosshairs.v.classList.add('invalid');
    } else {
      activeCrosshairs.h.classList.remove('invalid');
      activeCrosshairs.v.classList.remove('invalid');
    }

    // 3. Floating Mobile Guide HUD Pill above the touch point
    if (!activeDragHud) {
      activeDragHud = document.createElement('div');
      activeDragHud.className = 'wall-drag-hud';
      document.body.appendChild(activeDragHud);
    }

    activeDragHud.className = `wall-drag-hud ${check.valid ? 'hud-valid' : 'hud-invalid'}`;
    const statusText = check.valid
      ? `Wall (${wallPlacementState.orientation === 'H' ? 'Horiz' : 'Vert'}) • Release`
      : (check.reason || 'Blocked');

    activeDragHud.innerHTML = `
      <div class="hud-status-icon">
        ${check.valid 
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
        }
      </div>
      <span class="hud-text">${statusText}</span>
      <button type="button" class="hud-rotate-btn" title="Rotate Wall">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        Flip
      </button>
    `;

    const hudFlipBtn = activeDragHud.querySelector('.hud-rotate-btn');
    if (hudFlipBtn) {
      hudFlipBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleWallOrientation();
      });
    }

    const hudX = Math.max(120, Math.min(window.innerWidth - 120, clientX));
    const hudY = Math.max(40, clientY - 70);
    activeDragHud.style.left = `${hudX}px`;
    activeDragHud.style.top = `${hudY}px`;

    // 4. Touch Beacon under finger on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) {
      if (!activeTouchBeacon) {
        activeTouchBeacon = document.createElement('div');
        activeTouchBeacon.className = 'wall-touch-beacon';
        document.body.appendChild(activeTouchBeacon);
      }
      activeTouchBeacon.style.left = `${clientX}px`;
      activeTouchBeacon.style.top = `${clientY}px`;
    }
  }

  function clearWallDragGuide() {
    document.querySelectorAll('.wall-preview').forEach(el => el.remove());
    if (activeCrosshairs.h) { activeCrosshairs.h.remove(); activeCrosshairs.h = null; }
    if (activeCrosshairs.v) { activeCrosshairs.v.remove(); activeCrosshairs.v = null; }
    if (activeDragHud) { activeDragHud.remove(); activeDragHud = null; }
    if (activeTouchBeacon) { activeTouchBeacon.remove(); activeTouchBeacon = null; }
    boardGrid.classList.remove('wall-drag-active');
  }

  function renderWallPreview(r, c) {
    if (currentActionMode !== 'WALL') return;
    const boardRect = boardGrid.getBoundingClientRect();
    const cellWidth = boardRect.width / GRID_SIZE;
    const cellHeight = boardRect.height / GRID_SIZE;
    const clientX = boardRect.left + (c + 1) * cellWidth;
    const clientY = boardRect.top + (r + 1) * cellHeight;
    renderWallDragGuide(clientX, clientY, r, c);
  }

  function handleCellHover(r, c) {
    if (currentActionMode !== 'WALL' || isDraggingWall) return;
    wallPlacementState.hoverR = r;
    wallPlacementState.hoverC = c;
    renderWallPreview(r, c);
  }

  // Pointer & Touch Events for Drag-to-Place Wall
  boardGrid.addEventListener('pointerdown', (e) => {
    if (playerProfile.burnedOut) return;
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer || activePlayer.id !== playerProfile.id || activePlayer.burnedOut) return;

    if (currentActionMode === 'WALL') {
      isDraggingWall = true;
      boardGrid.classList.add('wall-drag-active');

      const seam = getNearestWallSeam(e.clientX, e.clientY, wallPlacementState.orientation);
      wallPlacementState.hoverR = seam.r;
      wallPlacementState.hoverC = seam.c;
      renderWallDragGuide(e.clientX, e.clientY, seam.r, seam.c);

      if (e.pointerType === 'touch') {
        e.preventDefault();
      }
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDraggingWall) return;
    if (currentActionMode !== 'WALL') {
      clearWallDragGuide();
      isDraggingWall = false;
      return;
    }

    const seam = getNearestWallSeam(e.clientX, e.clientY, wallPlacementState.orientation);
    wallPlacementState.hoverR = seam.r;
    wallPlacementState.hoverC = seam.c;
    renderWallDragGuide(e.clientX, e.clientY, seam.r, seam.c);
  });

  window.addEventListener('pointerup', (e) => {
    if (!isDraggingWall) return;
    isDraggingWall = false;

    const boardRect = boardGrid.getBoundingClientRect();
    const isInsideBoard = (
      e.clientX >= boardRect.left - 40 &&
      e.clientX <= boardRect.right + 40 &&
      e.clientY >= boardRect.top - 40 &&
      e.clientY <= boardRect.bottom + 40
    );

    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (isInsideBoard && activePlayer && activePlayer.id === playerProfile.id && !activePlayer.burnedOut) {
      const wallR = wallPlacementState.hoverR;
      const wallC = wallPlacementState.hoverC;

      if (wallR >= 0 && wallC >= 0) {
        const proposedWall = {
          r: wallR,
          c: wallC,
          orientation: wallPlacementState.orientation,
          color: activePlayer.color,
          playerId: activePlayer.id
        };
        const playerPositions = roomState.players.filter(p => !p.burnedOut).map(p => ({ id: p.id, pos: p.pos }));
        const check = isValidWallPlacement(proposedWall, roomState.walls, playerPositions);

        clearWallDragGuide();

        if (check.valid) {
          lastWallPlacementTime = Date.now();
          lastPlacedWall = proposedWall;
          roomState.walls.push(proposedWall);
          const nextIndex = getNextActiveTurnIndex(roomState.currentTurnIndex);
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
        return;
      }
    }

    clearWallDragGuide();
  });

  window.addEventListener('pointercancel', () => {
    if (isDraggingWall) {
      isDraggingWall = false;
      clearWallDragGuide();
    }
  });

  // Touch two-finger tap to flip wall orientation quickly on mobile
  boardGrid.addEventListener('touchstart', (e) => {
    if (currentActionMode === 'WALL' && e.touches.length === 2) {
      e.preventDefault();
      toggleWallOrientation();
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'e') {
      toggleWallOrientation();
    }
  });

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
      const nextTurnIndex = getNextActiveTurnIndex(roomState.currentTurnIndex);

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
      const oldPos = data.from || (p.pos ? { r: p.pos.r, c: p.pos.c } : null);
      const isJump = (data.isJump !== undefined)
        ? data.isJump
        : (oldPos ? (Math.abs(data.pos.r - oldPos.r) > 1 || Math.abs(data.pos.c - oldPos.c) > 1) : false);

      if (oldPos && (oldPos.r !== data.pos.r || oldPos.c !== data.pos.c)) {
        lastMoveAnimation = {
          playerId: p.id,
          from: oldPos,
          to: { r: data.pos.r, c: data.pos.c },
          isJump: isJump,
          color: p.color
        };
      }

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
    lastPlacedWall = data.wall;
    roomState.walls.push(data.wall);
    advanceTurn(data.nextTurnIndex);
    saveActiveSession();
    renderBoardState();
  }

  function triggerVictory(winner, customSubtitle) {
    stopTurnTimer();
    winnerTitle.textContent = `${winner.name} Wins!`;
    winnerSubtitle.textContent = customSubtitle || `${winner.name} reached the golden center goal (5, 5)!`;

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
      p.burnedOut = false;
      p.isSpectating = false;
    });

    playerProfile.isReady = false;
    playerProfile.burnedOut = false;
    playerProfile.isSpectating = false;
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

  // --------------------------------------------------------------------------
  // Left Sidebar: Connected Active Players List
  // --------------------------------------------------------------------------
  function renderGamePlayersList() {
    if (!livePlayersList) return;
    livePlayersList.innerHTML = '';

    const activeCount = roomState.players.filter(p => !p.burnedOut).length;
    if (livePlayerCount) {
      livePlayerCount.textContent = `${activeCount}/${roomState.players.length}`;
    }

    roomState.players.forEach((p, idx) => {
      const isCurrentTurn = (idx === roomState.currentTurnIndex && !p.burnedOut);
      const isMe = (p.id === playerProfile.id);
      const isBurned = !!p.burnedOut;

      const card = document.createElement('div');
      card.className = `live-player-card ${isCurrentTurn ? 'active-turn' : ''} ${isBurned ? 'burned-out' : ''}`;

      let statusText = 'Waiting';
      let statusClass = 'status-waiting';
      if (isBurned) {
        statusText = 'Burned Out';
        statusClass = 'status-burned';
      } else if (isCurrentTurn) {
        statusText = isMe ? 'Your Turn!' : 'Taking Turn';
        statusClass = 'status-turn';
      }

      card.innerHTML = `
        <div class="live-player-avatar-wrap">
          <div class="live-player-marble marble-${p.color} ${isBurned ? 'charred-marble' : ''}">
            ${isBurned ? '<svg class="burned-status-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>' : ''}
          </div>
          ${isCurrentTurn ? '<div class="turn-beacon"></div>' : ''}
        </div>
        <div class="live-player-details">
          <div class="live-player-name-row">
            <span class="live-player-name" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</span>
            ${isMe ? '<span class="live-you-tag">YOU</span>' : ''}
          </div>
          <div class="live-player-sub-row">
            <span class="live-player-status-badge ${statusClass}">${statusText}</span>
            ${p.pos && !isBurned ? `<span class="live-player-coords">(${p.pos.r}, ${p.pos.c})</span>` : ''}
          </div>
        </div>
      `;

      livePlayersList.appendChild(card);
    });
  }

  // --------------------------------------------------------------------------
  // Burn Out Button Engine & Confirmation Modal Handlers
  // --------------------------------------------------------------------------
  function updateBurnOutButtonUI() {
    if (!btnBurnOut) return;

    const meInRoom = roomState.players.find(p => p.id === playerProfile.id);
    const amBurned = !!playerProfile.burnedOut || (meInRoom && meInRoom.burnedOut);
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    const isMyTurn = (activePlayer && activePlayer.id === playerProfile.id && !amBurned);

    if (amBurned) {
      btnBurnOut.setAttribute('disabled', 'true');
      btnBurnOut.classList.remove('my-turn');
      if (btnBurnOutText) btnBurnOutText.textContent = 'SPECTATING (BURNED)';
      return;
    }

    if (isMyTurn) {
      btnBurnOut.removeAttribute('disabled');
      btnBurnOut.classList.add('my-turn');
      if (btnBurnOutText) btnBurnOutText.textContent = 'BURN OUT';
    } else {
      btnBurnOut.setAttribute('disabled', 'true');
      btnBurnOut.classList.remove('my-turn');
      if (btnBurnOutText) btnBurnOutText.textContent = 'BURN OUT';
    }
  }

  if (btnBurnOut) {
    btnBurnOut.addEventListener('click', () => {
      const meInRoom = roomState.players.find(p => p.id === playerProfile.id);
      const amBurned = !!playerProfile.burnedOut || (meInRoom && meInRoom.burnedOut);
      const activePlayer = roomState.players[roomState.currentTurnIndex];
      const isMyTurn = (activePlayer && activePlayer.id === playerProfile.id && !amBurned);

      if (!isMyTurn) {
        showToast('A burn out can only be pressed when it is your turn!');
        return;
      }

      const burnSubtitle = document.getElementById('burn-modal-subtitle');
      if (burnSubtitle) {
        if (roomState.players.length === 2) {
          burnSubtitle.textContent = 'You will surrender the match and your opponent will win.';
        } else {
          burnSubtitle.textContent = 'You will surrender from the match, your marble will incinerate, and you will spectate the rest of the game.';
        }
      }

      if (modalBurnConfirm) {
        modalBurnConfirm.classList.add('active');
      }
    });
  }

  if (btnCancelBurn) {
    btnCancelBurn.addEventListener('click', () => {
      if (modalBurnConfirm) modalBurnConfirm.classList.remove('active');
    });
  }

  if (btnConfirmBurn) {
    btnConfirmBurn.addEventListener('click', () => {
      if (modalBurnConfirm) modalBurnConfirm.classList.remove('active');
      executeLocalPlayerBurnOut();
    });
  }

  function executeLocalPlayerBurnOut() {
    const meInRoom = roomState.players.find(p => p.id === playerProfile.id);
    if (!meInRoom || meInRoom.burnedOut) return;

    const burnedPos = meInRoom.pos ? { r: meInRoom.pos.r, c: meInRoom.pos.c } : null;
    const isTwoPlayerGame = (roomState.players.length === 2);

    playerProfile.burnedOut = true;
    meInRoom.burnedOut = true;

    if (burnedPos) {
      playPlayerBurnAnimation(burnedPos, playerProfile.id);
    }

    // Clear highlights & previews
    clearMoveHighlights();
    document.querySelectorAll('.wall-preview').forEach(el => el.remove());

    if (isTwoPlayerGame) {
      // ON 2 PLAYERS: BURNING OUT SURRENDERS THE GAME, NOT SPECTATING!
      playerProfile.isSpectating = false;
      meInRoom.isSpectating = false;

      const winner = roomState.players.find(p => p.id !== playerProfile.id);

      broadcastEvent('player_burn_out', {
        playerId: playerProfile.id,
        burnedPos: burnedPos,
        isSurrender: true,
        winnerId: winner ? winner.id : null
      });

      showToast('You surrendered the match!', 'error');

      // End game and show victory screen for opponent
      setTimeout(() => {
        if (winner) {
          triggerVictory(winner, `${winner.name} Wins! ${playerProfile.name} surrendered.`);
        }
      }, 900);
      return;
    }

    // 3+ players: spectating mode
    playerProfile.isSpectating = true;
    meInRoom.isSpectating = true;

    const nextTurnIndex = getNextActiveTurnIndex(roomState.currentTurnIndex);

    broadcastEvent('player_burn_out', {
      playerId: playerProfile.id,
      burnedPos: burnedPos,
      isSurrender: false,
      nextTurnIndex: nextTurnIndex
    });

    showToast('You burned out and are now spectating.', 'error');

    if (checkBurnOutWinCondition()) return;

    advanceTurn(nextTurnIndex);
    saveActiveSession();
    renderBoardState();
  }

  function handleRemotePlayerBurnOut(data) {
    const p = roomState.players.find(pl => pl.id === data.playerId);
    if (!p) return;

    p.burnedOut = true;

    if (data.burnedPos) {
      playPlayerBurnAnimation(data.burnedPos, data.playerId);
    }

    const isTwoPlayerGame = (data.isSurrender || roomState.players.length === 2);

    if (isTwoPlayerGame) {
      // 2 players: remote player surrendered the match, ending the game
      p.isSpectating = false;
      showToast(`${p.name} surrendered the game!`, 'success');

      setTimeout(() => {
        const winner = roomState.players.find(pl => pl.id !== data.playerId);
        if (winner) {
          triggerVictory(winner, `${winner.name} Wins! ${p.name} surrendered.`);
        }
      }, 900);
      return;
    }

    // 3+ players: remote player spectates
    p.isSpectating = true;
    showToast(`${p.name} burned out and is now spectating!`, 'error');

    if (checkBurnOutWinCondition()) return;

    advanceTurn(data.nextTurnIndex);
    saveActiveSession();
    renderBoardState();
  }

  function playPlayerBurnAnimation(pos, playerId) {
    if (!pos) return;
    const cell = getCellElem(pos.r, pos.c);
    if (!cell) return;

    const marble = cell.querySelector('.marble-sphere');
    if (marble) {
      marble.classList.add('burning-marble');
    }

    const fireBurst = document.createElement('div');
    fireBurst.className = 'player-burn-burst';
    cell.appendChild(fireBurst);

    boardGrid.classList.add('shake-anim');
    setTimeout(() => boardGrid.classList.remove('shake-anim'), 400);

    setTimeout(() => {
      fireBurst.remove();
      if (marble) marble.remove();
      const p = roomState.players.find(pl => pl.id === playerId);
      if (p) p.pos = null;
      renderBoardState();
    }, 1100);
  }

  function checkBurnOutWinCondition() {
    if (!roomState.gameStarted) return false;
    const activePlayers = roomState.players.filter(p => !p.burnedOut);
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      const surrendered = roomState.players.filter(p => p.burnedOut).map(p => p.name).join(', ');
      triggerVictory(winner, `${winner.name} Wins! ${surrendered} surrendered.`);
      return true;
    }
    return false;
  }

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
