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

  let selectedCreateGameMode = 'ffa'; // 'ffa' or 'team'

  let roomState = {
    code: '',
    hostId: '',
    gameMode: 'ffa', // 'ffa' or 'team'
    gridSize: 11,    // 11 (2-4 players) or 13 (5-8 players)
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

  function isMobileDevice() {
    return window.matchMedia('(pointer: coarse)').matches ||
      ('ontouchstart' in window && window.innerWidth <= 1024) ||
      (navigator.maxTouchPoints > 0 && window.innerWidth <= 1024);
  }

  // --------------------------------------------------------------------------
  // DOM Element References & Toast System
  // --------------------------------------------------------------------------
  const screens = {
    profile: document.getElementById('screen-profile'),
    createLobby: document.getElementById('screen-create-lobby'),
    joinLobby: document.getElementById('screen-join-lobby'),
    lobbyRoom: document.getElementById('screen-lobby-room'),
    game: document.getElementById('screen-game')
  };

  const inputPlayerName = document.getElementById('player-name');
  const devTagPreview = document.getElementById('dev-tag-preview');
  const inputJoinCode = document.getElementById('join-room-code');
  const selectMaxPlayers = document.getElementById('max-players-select');
  const btnModeFfa = document.getElementById('btn-mode-ffa');
  const btnModeTeam = document.getElementById('btn-mode-team');
  const lobbyModeHelperNote = document.getElementById('lobby-mode-helper-note');

  const displayRoomCode = document.getElementById('display-room-code');
  const lobbyModeBadge = document.getElementById('lobby-mode-badge');
  const lobbyGridBadge = document.getElementById('lobby-grid-badge');
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

  const turnTimerBadge = document.getElementById('turn-timer-badge');
  const turnTimerSeconds = document.getElementById('turn-timer-seconds');

  const modalDevPasscode = document.getElementById('modal-dev-passcode');
  const devPasscodeInput = document.getElementById('dev-passcode-input');
  const btnCancelPasscode = document.getElementById('btn-cancel-passcode');
  const btnVerifyPasscode = document.getElementById('btn-verify-passcode');

  const btnBurnOut = document.getElementById('btn-burn-out');
  const btnBurnOutText = document.getElementById('btn-burn-out-text');
  const btnSukunaMode = document.getElementById('btn-sukuna-mode');
  let isSukunaButtonRevealed = false;
  let isSukunaModeActive = false;
  const sukunaArsenalBar = document.getElementById('sukuna-arsenal-bar');
  const btnSukunaDismantle = document.getElementById('btn-sukuna-dismantle');
  const btnSukunaCleave = document.getElementById('btn-sukuna-cleave');
  const btnSukunaDomain = document.getElementById('btn-sukuna-domain');
  const modalDismantleTarget = document.getElementById('modal-dismantle-target');
  const btnCancelDismantle = document.getElementById('btn-cancel-dismantle');
  const dismantleTargetsList = document.getElementById('dismantle-targets-list');
  const modalBurnConfirm = document.getElementById('modal-burn-confirm');
  const btnCancelBurn = document.getElementById('btn-cancel-burn');
  const btnConfirmBurn = document.getElementById('btn-confirm-burn');
  const livePlayersList = document.getElementById('live-players-list');
  const livePlayerCount = document.getElementById('live-player-count');
  const sidebarHeadingText = document.getElementById('sidebar-heading-text');

  let isDevVerified = false;
  let pendingDevName = '';
  let turnTimerInterval = null;
  let turnTimeRemaining = 30;
  let isReconnectingActive = false;
  let reconnectTimeout = null;

  // Helper to ensure burned out or spectating status never leaks across lobbies
  function resetPlayerStatus() {
    playerProfile.burnedOut = false;
    playerProfile.isSpectating = false;
    playerProfile.isReady = false;
  }

  // Helper: Computes odd grid dimension with an exact single center tile
  // 2-4: 11x11 (center: 5,5), 5: 13x13 (center: 6,6), 6: 17x17 (center: 8,8), 7: 19x19 (center: 9,9), 8: 23x23 (center: 11,11)
  function getGridSizeForPlayerCount(count) {
    const c = parseInt(count, 10);
    if (c <= 4) return 11;
    if (c === 5) return 13;
    if (c === 6) return 17;
    if (c === 7) return 19;
    return 23; // 8 players
  }

  let lastToastInfo = { message: '', timestamp: 0 };

  function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    if (!container || !message) return;

    const trimmedMsg = String(message).trim();

    // 1. Debounce exact same message within 2.5 seconds
    const now = Date.now();
    if (lastToastInfo.message === trimmedMsg && (now - lastToastInfo.timestamp) < 2500) {
      return;
    }

    // 2. Prevent duplicate identical toasts currently visible in the DOM
    const activeToasts = Array.from(container.children);
    if (activeToasts.some(t => t.textContent.trim() === trimmedMsg)) {
      return;
    }

    lastToastInfo = { message: trimmedMsg, timestamp: now };

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
      } catch (e) { }
    } else {
      clearActiveSession();
    }
  }

  function clearActiveSession() {
    try {
      localStorage.removeItem('wallrush_active_session');
    } catch (e) { }
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
    if (playerProfile && playerProfile.name && playerProfile.name.trim().toLowerCase() === 'le em' && playerProfile.isDev) {
      isDevVerified = true;
    }
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
    resetPlayerStatus();

    showToast(reason || 'Match is no longer available.', 'error');
    showScreen(screens.profile);
  }

  // --------------------------------------------------------------------------
  // Developer Passcode Verification for 'Le Em' [DEV] (Passcode: 8119)
  // --------------------------------------------------------------------------
  function isDeveloper(pOrName) {
    if (!pOrName) return false;

    // 1. If passed a player object
    if (typeof pOrName === 'object') {
      if (pOrName.isDev) return true;
      if (pOrName.id === playerProfile.id && isDevVerified) return true;
      if (pOrName.name && pOrName.name.trim().toLowerCase() === 'le em') {
        if (pOrName.id === playerProfile.id) return isDevVerified;
        if (roomState && Array.isArray(roomState.players)) {
          const match = roomState.players.find(pl => pl.id === pOrName.id);
          if (match && match.isDev) return true;
        }
        return !!pOrName.isDev;
      }
      return false;
    }

    // 2. If passed a name string (e.g. 'Le Em' or p.name)
    if (typeof pOrName === 'string') {
      const isMatch = pOrName.trim().toLowerCase() === 'le em';
      if (!isMatch) return false;

      // Check if local player is verified Le Em
      if (playerProfile && playerProfile.name && playerProfile.name.trim().toLowerCase() === 'le em' && isDevVerified) {
        return true;
      }

      // Check if any player in the current room is verified Le Em
      if (roomState && Array.isArray(roomState.players)) {
        const devInRoom = roomState.players.find(p =>
          p.name && p.name.trim().toLowerCase() === 'le em' && (p.isDev || (p.id === playerProfile.id && isDevVerified))
        );
        if (devInRoom) return true;
      }

      return false;
    }

    return false;
  }

  function updateDevTagPreview(name) {
    if (!devTagPreview) return;
    if (isDeveloper(name)) {
      devTagPreview.style.display = 'inline-flex';
    } else {
      devTagPreview.style.display = 'none';
    }
  }

  function openDevPasscodeModal() {
    if (!modalDevPasscode) return;
    modalDevPasscode.classList.add('active');
    if (devPasscodeInput) {
      devPasscodeInput.value = '';
      setTimeout(() => devPasscodeInput.focus(), 150);
    }
  }

  function closeDevPasscodeModal() {
    if (!modalDevPasscode) return;
    modalDevPasscode.classList.remove('active');
    if (devPasscodeInput) devPasscodeInput.value = '';
  }

  function handleVerifyPasscode() {
    if (!devPasscodeInput) return;
    const entered = devPasscodeInput.value.trim();
    if (entered === '8119') {
      isDevVerified = true;
      playerProfile.isDev = true;
      playerProfile.name = pendingDevName || 'Le Em';
      inputPlayerName.value = playerProfile.name;
      updateDevTagPreview(playerProfile.name);
      closeDevPasscodeModal();
      showToast('Developer verified! Welcome Le Em [DEV].', 'success');
    } else {
      devPasscodeInput.classList.add('shake-anim');
      showToast('Incorrect developer passcode. Access denied.', 'error');
      setTimeout(() => devPasscodeInput.classList.remove('shake-anim'), 400);
      devPasscodeInput.value = '';
    }
  }

  function handleCancelPasscode() {
    isDevVerified = false;
    playerProfile.isDev = false;
    playerProfile.name = 'Player 1';
    inputPlayerName.value = 'Player 1';
    updateDevTagPreview('Player 1');
    closeDevPasscodeModal();
    showToast('Developer verification cancelled.', 'neutral');
  }

  if (btnVerifyPasscode) {
    btnVerifyPasscode.addEventListener('click', handleVerifyPasscode);
  }
  if (btnCancelPasscode) {
    btnCancelPasscode.addEventListener('click', handleCancelPasscode);
  }
  if (devPasscodeInput) {
    devPasscodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleVerifyPasscode();
      } else if (e.key === 'Escape') {
        handleCancelPasscode();
      }
    });
  }

  // Player Name input
  inputPlayerName.addEventListener('input', (e) => {
    const raw = e.target.value;
    const trimmed = raw.trim();
    if (trimmed.toLowerCase() === 'le em') {
      if (!isDevVerified) {
        pendingDevName = trimmed;
        openDevPasscodeModal();
        return;
      }
    } else {
      isDevVerified = false;
      playerProfile.isDev = false;
    }
    playerProfile.name = trimmed || 'Player 1';
    updateDevTagPreview(playerProfile.name);
  });

  // Profile Screen Actions
  document.getElementById('btn-nav-create').addEventListener('click', () => {
    if (inputPlayerName.value.trim().toLowerCase() === 'le em' && !isDevVerified) {
      pendingDevName = inputPlayerName.value.trim();
      openDevPasscodeModal();
      return;
    }
    showScreen(screens.createLobby);
  });

  document.getElementById('btn-nav-join').addEventListener('click', () => {
    if (inputPlayerName.value.trim().toLowerCase() === 'le em' && !isDevVerified) {
      pendingDevName = inputPlayerName.value.trim();
      openDevPasscodeModal();
      return;
    }
    showScreen(screens.joinLobby);
  });

  document.getElementById('btn-back-profile-1').addEventListener('click', () => showScreen(screens.profile));
  document.getElementById('btn-back-profile-2').addEventListener('click', () => showScreen(screens.profile));

  // Mode Selection in Create Lobby: Free For All vs Team Mode
  function updateCreateLobbyModeUI(mode) {
    selectedCreateGameMode = mode;
    if (mode === 'ffa') {
      if (btnModeFfa) btnModeFfa.classList.add('active');
      if (btnModeTeam) btnModeTeam.classList.remove('active');
      if (selectMaxPlayers) {
        selectMaxPlayers.innerHTML = `
          <option value="2">2 Players</option>
          <option value="3">3 Players</option>
          <option value="4" selected>4 Players</option>
          <option value="5">5 Players</option>
          <option value="6">6 Players</option>
          <option value="7">7 Players</option>
          <option value="8">8 Players</option>
        `;
      }
      if (lobbyModeHelperNote) {
        lobbyModeHelperNote.style.display = 'none';
        lobbyModeHelperNote.textContent = '';
      }
    } else {
      if (btnModeTeam) btnModeTeam.classList.add('active');
      if (btnModeFfa) btnModeFfa.classList.remove('active');
      if (selectMaxPlayers) {
        selectMaxPlayers.innerHTML = `
          <option value="4" selected>4 Players (2 Teams)</option>
          <option value="6">6 Players (3 Teams)</option>
          <option value="8">8 Players (4 Teams)</option>
        `;
      }
      if (lobbyModeHelperNote) {
        lobbyModeHelperNote.style.display = 'none';
        lobbyModeHelperNote.textContent = '';
      }
    }
  }

  if (btnModeFfa) {
    btnModeFfa.addEventListener('click', () => updateCreateLobbyModeUI('ffa'));
  }
  if (btnModeTeam) {
    btnModeTeam.addEventListener('click', () => updateCreateLobbyModeUI('team'));
  }

  // Create Lobby Confirm
  document.getElementById('btn-confirm-create').addEventListener('click', () => {
    isHost = true;
    resetPlayerStatus();

    const maxPlayers = parseInt(selectMaxPlayers.value, 10);
    const chosenGridSize = getGridSizeForPlayerCount(maxPlayers);

    setGridDimensions(chosenGridSize);

    roomState.code = generateRoomCode();
    roomState.gameMode = selectedCreateGameMode;
    roomState.gridSize = chosenGridSize;
    roomState.maxPlayers = maxPlayers;
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
      resetPlayerStatus();
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
    resetPlayerStatus();

    roomState = {
      code: '',
      hostId: '',
      gameMode: 'ffa',
      gridSize: 11,
      maxPlayers: 4,
      players: [],
      currentTurnIndex: 0,
      gameStarted: false,
      walls: [],
      winner: null
    };

    showScreen(screens.profile);
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
              if (reconnectingPlayer.isDev !== undefined) existing.isDev = reconnectingPlayer.isDev;
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
              if (reconnectingPlayer.isDev !== undefined) existing.isDev = reconnectingPlayer.isDev;
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
        const gSize = roomState.gridSize || getGridSizeForPlayerCount(Math.max(roomState.players.length, roomState.maxPlayers));
        setGridDimensions(gSize);

        // Update local playerProfile if host assigned a new unique color or ready status
        const meInRoom = roomState.players.find(p => p.id === playerProfile.id);
        if (meInRoom) {
          playerProfile.color = meInRoom.color;
          playerProfile.hex = meInRoom.hex;
          playerProfile.isReady = !!meInRoom.isReady;
          playerProfile.burnedOut = !!meInRoom.burnedOut;
          playerProfile.isSpectating = !!meInRoom.isSpectating;
          if (meInRoom.isDev !== undefined) playerProfile.isDev = !!meInRoom.isDev;
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
        const gSize = roomState.gridSize || getGridSizeForPlayerCount(Math.max(roomState.players.length, roomState.maxPlayers));
        setGridDimensions(gSize);
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
        if (data && data.turnIndex !== undefined && lastHandledTimeoutTurn === data.turnIndex) {
          return;
        }
        if (data && data.turnIndex !== undefined) {
          lastHandledTimeoutTurn = data.turnIndex;
        } else {
          lastHandledTimeoutTurn = roomState.currentTurnIndex;
        }
        const timedOutPlayer = roomState.players.find(p => p.id === data.playerId);
        const name = timedOutPlayer ? timedOutPlayer.name : 'Player';
        showToast(`${name}'s turn timed out! Skipped.`);
        advanceTurn(data.nextTurnIndex);
        saveActiveSession();
        renderBoardState();
      },
      onPlayerSukunaMode: (data) => {
        const p = roomState.players.find(pl => pl.id === data.playerId);
        if (p) {
          p.isSukuna = !!data.isSukuna;
          if (data.isSukuna) {
            p.sukunaTransformedAt = Date.now();
            triggerSukunaAnimeVFX();
            playAudio('audio/gambale.mp3', 0.95);
          }
          renderBoardState();
        }
      },
      onSukunaDismantle: (payload) => {
        performSukunaDismantleSequence(payload.casterId, payload.targetId, payload);
      },
      onSukunaCleave: (payload) => {
        performSukunaCleaveSequence(payload.casterId, payload.targetId, payload);
      },
      onSukunaDomain: (payload) => {
        performSukunaDomainSequence(payload.casterId, payload);
      },
      onPlayAgain: (resetState) => {
        modalVictory.classList.remove('active');
        roomState = resetState;
        const gSize = roomState.gridSize || getGridSizeForPlayerCount(Math.max(roomState.players.length, roomState.maxPlayers));
        setGridDimensions(gSize);
        resetPlayerStatus();
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
    resetPlayerStatus();

    if (joinTimeout) clearTimeout(joinTimeout);
    if (joinRetryInterval) clearInterval(joinRetryInterval);

    roomState = {
      code: '',
      hostId: '',
      gameMode: 'ffa',
      gridSize: 11,
      maxPlayers: 4,
      players: [],
      currentTurnIndex: 0,
      gameStarted: false,
      walls: [],
      winner: null
    };

    modalVictory.classList.remove('active');
    showScreen(screens.profile);
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

    if (lobbyModeBadge) {
      lobbyModeBadge.textContent = roomState.gameMode === 'team' ? 'Team Mode (2/team)' : 'Free For All';
    }
    if (lobbyGridBadge) {
      const gSize = roomState.gridSize || (roomState.maxPlayers >= 5 ? 13 : 11);
      lobbyGridBadge.textContent = `${gSize}x${gSize} Grid`;
    }

    for (let i = 0; i < roomState.maxPlayers; i++) {
      const p = roomState.players[i];
      const slot = document.createElement('div');
      slot.className = `player-slot ${p ? 'filled' : ''}`;

      if (p) {
        const isPlayerHost = (p.id === roomState.hostId || i === 0);
        const isMe = (p.id === playerProfile.id);
        const devBadgeHTML = isDeveloper(p) ? '<span class="dev-badge">Dev</span>' : '';

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
          <span class="player-slot-name">${escapeHTML(p.name)}${devBadgeHTML} ${isMe ? '<span style="opacity:0.75; font-size:0.85em;">(You)</span>' : ''}</span>
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

    // USER REQUIREMENT: Odd grid scaling with single exact center (11, 13, 17, 19, 23)
    const numPlayers = roomState.players.length;
    const activeGridSize = roomState.gridSize || getGridSizeForPlayerCount(Math.max(numPlayers, roomState.maxPlayers));
    roomState.gridSize = activeGridSize;
    setGridDimensions(activeGridSize);

    // USER REQUIREMENT: Team mode with 2 players randomly assigned per team & sorted turn order
    if (roomState.gameMode === 'team') {
      const shuffled = [...roomState.players].sort(() => Math.random() - 0.5);

      const teamConfigs = [
        { id: 'A', name: 'Team A', badgeClass: 'team-badge-a' },
        { id: 'B', name: 'Team B', badgeClass: 'team-badge-b' },
        { id: 'C', name: 'Team C', badgeClass: 'team-badge-c' },
        { id: 'D', name: 'Team D', badgeClass: 'team-badge-d' }
      ];

      const numTeams = Math.max(2, Math.floor(shuffled.length / 2));
      const teamBuckets = [];
      for (let t = 0; t < numTeams; t++) {
        teamBuckets.push([]);
      }

      shuffled.forEach((p, idx) => {
        const teamIdx = Math.floor(idx / 2);
        const config = teamConfigs[Math.min(teamIdx, teamConfigs.length - 1)];
        p.teamId = config.id;
        p.teamName = config.name;
        p.teamBadgeClass = config.badgeClass;
        teamBuckets[Math.min(teamIdx, numTeams - 1)].push(p);
      });

      // Interleave turn order: Team A1 -> Team B1 -> (Team C1) -> (Team D1) -> Team A2 -> Team B2 -> ...
      const interleaved = [];
      for (let memberIdx = 0; memberIdx < 2; memberIdx++) {
        for (let t = 0; t < numTeams; t++) {
          if (teamBuckets[t][memberIdx]) {
            interleaved.push(teamBuckets[t][memberIdx]);
          }
        }
      }
      roomState.players = interleaved;
    }

    const initialPositions = getOuterPerimeterSpawnPositions(roomState.players.length, activeGridSize);

    roomState.players.forEach((p, idx) => {
      p.pos = initialPositions[idx];
      p.turnOrder = idx + 1;
    });

    roomState.currentTurnIndex = 0;
    roomState.gameStarted = true;
    roomState.walls = [];

    saveActiveSession();
    broadcastEvent('game_started', roomState);
    launchActiveGame();
  });

  // --------------------------------------------------------------------------
  // Game Engine & Action Mode Controls
  // --------------------------------------------------------------------------
  function launchActiveGame() {
    const activeGridSize = roomState.gridSize || getGridSizeForPlayerCount(Math.max(roomState.players.length, roomState.maxPlayers));
    setGridDimensions(activeGridSize);
    currentActionMode = 'MOVE';
    showScreen(screens.game);
    if (isSukunaButtonRevealed && btnSukunaMode) {
      btnSukunaMode.style.display = 'inline-flex';
    }
    if (isSukunaModeActive && isLeEmPlayer() && sukunaArsenalBar) {
      sukunaArsenalBar.style.display = 'flex';
    }
    saveActiveSession();
    renderBoardState();
    startTurnTimer();
  }

  function getOuterPerimeterSpawnPositions(numPlayers, gridSize = 11) {
    const mid = Math.floor(gridSize / 2);
    const max = gridSize - 1;
    const q1 = Math.max(1, Math.round(gridSize * 0.25));
    const q2 = max - q1;

    const presets = [
      { r: 0, c: mid },   // Top Center
      { r: max, c: mid },  // Bottom Center
      { r: mid, c: 0 },   // Left Center
      { r: mid, c: max },  // Right Center
      { r: 0, c: q1 },    // Top Left offset
      { r: 0, c: q2 },    // Top Right offset
      { r: max, c: q1 },  // Bottom Left offset
      { r: max, c: q2 }   // Bottom Right offset
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
      boardGrid.classList.remove('wall-mode-active');
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

      if (isMobileDevice()) {
        boardGrid.classList.add('wall-mode-active');
        // Default wall position in the middle of the board on mobile
        const mid = Math.max(0, Math.floor((GRID_SIZE - 2) / 2));
        wallPlacementState.hoverR = mid;
        wallPlacementState.hoverC = mid;
        renderWallPreview(mid, mid);
      } else {
        boardGrid.classList.remove('wall-mode-active');
        if (activeDragHud) {
          activeDragHud.remove();
          activeDragHud = null;
        }
      }
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
      const firstOccupying = otherPlayers.find(p => p.pos.r === nr && p.pos.c === nc);

      if (!firstOccupying) {
        // Normal 1-step move
        validMoves.push({ r: nr, c: nc, type: 'STEP' });
      } else {
        // Consecutive chain jump over 1, 2, or how many players are in front of them
        let lastPlayerPos = { r: nr, c: nc };
        let lastPlayerId = firstOccupying.id;
        const jumpedPlayers = [firstOccupying];
        const jumpedPositions = [{ r: nr, c: nc }];
        let straightBlocked = false;
        let scanR = nr;
        let scanC = nc;

        while (true) {
          const nextR = scanR + d.dr;
          const nextC = scanC + d.dc;

          // 3a. Check if movement from currently scanned player to next cell is blocked by a wall
          if (isMoveBlocked(scanR, scanC, nextR, nextC, walls)) {
            straightBlocked = true;
            break;
          }

          // 3b. Check if next cell is within board boundaries
          if (nextR < 0 || nextR >= GRID_SIZE || nextC < 0 || nextC >= GRID_SIZE) {
            straightBlocked = true;
            break;
          }

          // 3c. Check if next cell is occupied by another player
          const nextOccupying = otherPlayers.find(p => p.pos.r === nextR && p.pos.c === nextC);
          if (nextOccupying) {
            // Consecutive chain continues over this player!
            jumpedPlayers.push(nextOccupying);
            jumpedPositions.push({ r: nextR, c: nextC });
            lastPlayerPos = { r: nextR, c: nextC };
            lastPlayerId = nextOccupying.id;
            scanR = nextR;
            scanC = nextC;
          } else {
            // Found unoccupied landing cell past the player(s)!
            validMoves.push({
              r: nextR,
              c: nextC,
              type: 'JUMP',
              jumpCount: jumpedPlayers.length,
              overPlayerId: lastPlayerId,
              overPos: lastPlayerPos,
              jumpedPositions: jumpedPositions
            });
            break;
          }
        }

        // If straight landing is blocked by a wall behind the last opponent or board edge,
        // allow diagonal jump to either side from the last jumped player's position
        if (straightBlocked) {
          const perpendiculars = (d.dr !== 0)
            ? [{ pdr: 0, pdc: -1 }, { pdr: 0, pdc: 1 }]
            : [{ pdr: -1, pdc: 0 }, { pdr: 1, pdc: 0 }];

          perpendiculars.forEach(p => {
            const diagR = lastPlayerPos.r + p.pdr;
            const diagC = lastPlayerPos.c + p.pdc;

            if (diagR >= 0 && diagR < GRID_SIZE && diagC >= 0 && diagC < GRID_SIZE) {
              if (!isMoveBlocked(lastPlayerPos.r, lastPlayerPos.c, diagR, diagC, walls)) {
                if (!otherPlayers.some(pl => pl.pos.r === diagR && pl.pos.c === diagC)) {
                  validMoves.push({
                    r: diagR,
                    c: diagC,
                    type: 'DIAG_JUMP',
                    jumpCount: jumpedPlayers.length,
                    overPlayerId: lastPlayerId,
                    overPos: lastPlayerPos,
                    jumpedPositions: jumpedPositions
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
    boardGrid.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
    boardGrid.style.gridTemplateRows = `repeat(${GRID_SIZE}, 1fr)`;

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        if (c === GRID_SIZE - 1) cell.classList.add('no-border-right');
        if (r === GRID_SIZE - 1) cell.classList.add('no-border-bottom');

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

        // Sukuna Mode Transformation Check
        const isSukuna = !!(p.isSukuna || (p.id === playerProfile.id && isSukunaModeActive));
        if (isSukuna) {
          marble.classList.add('sukuna-transformed');
          const tattooOverlay = document.createElement('div');
          tattooOverlay.className = 'sukuna-tattoos-overlay';
          const isFreshTransform = (Date.now() - (p.sukunaTransformedAt || 0) < 2400);
          tattooOverlay.innerHTML = getSukunaTattooSvg(isFreshTransform);
          marble.appendChild(tattooOverlay);
        }

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
    const devBadge = isDeveloper(activePlayer) ? '<span class="dev-badge">Dev</span>' : '';
    const teamTag = (roomState.gameMode === 'team' && activePlayer.teamName) ? ` <span style="opacity:0.85; font-size:0.85em;">(${escapeHTML(activePlayer.teamName)})</span>` : '';

    if (isMe) {
      turnLabel.innerHTML = `Your Turn!${devBadge}${teamTag}`;
    } else {
      turnLabel.innerHTML = `${escapeHTML(activePlayer.name)}${devBadge}'s Turn${teamTag}`;
    }
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

      // Or if clicking on any opponent tile in the line of jump to jump over them
      if (!targetMove) {
        targetMove = validMoves.find(m => m.jumpedPositions && m.jumpedPositions.some(jp => jp.r === r && jp.c === c) && m.type === 'JUMP');
        if (!targetMove) {
          targetMove = validMoves.find(m => m.jumpedPositions && m.jumpedPositions.some(jp => jp.r === r && jp.c === c));
        }
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
      const wallR = Math.min(r, GRID_SIZE - 2);
      const wallC = Math.min(c, GRID_SIZE - 2);
      wallPlacementState.hoverR = wallR;
      wallPlacementState.hoverC = wallC;

      if (!isMobileDevice()) {
        // ON PC / LAPTOP: Click directly places the wall!
        confirmWallPlacement();
        return;
      }

      // ON MOBILE: Restrict direct click to place!
      // Only reposition the preview, player must tap the "PLACE" button to confirm!
      renderWallPreview(wallR, wallC);
      return;
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

    // 3. Floating Mobile Guide HUD Pill above the touch point - ONLY on mobile!
    if (isMobileDevice()) {
      if (!activeDragHud) {
        activeDragHud = document.createElement('div');
        activeDragHud.className = 'wall-drag-hud';
        document.body.appendChild(activeDragHud);

        activeDragHud.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
        });

        activeDragHud.addEventListener('click', (e) => {
          e.stopPropagation();
          const placeBtn = e.target.closest('.hud-place-btn');
          if (placeBtn) {
            confirmWallPlacement();
            return;
          }
          const rotateBtn = e.target.closest('.hud-rotate-btn');
          const rotatableText = e.target.closest('.hud-rotatable');
          if (rotateBtn || rotatableText) {
            toggleWallOrientation();
            return;
          }
        });
      }

      activeDragHud.className = `wall-drag-hud ${check.valid ? 'hud-valid' : 'hud-invalid'}`;
      const statusText = check.valid
        ? `Wall (${wallPlacementState.orientation === 'H' ? 'Horiz' : 'Vert'})`
        : (check.reason || 'Blocked');

      activeDragHud.innerHTML = `
        <div class="hud-status-icon">
          ${check.valid
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
        }
        </div>
        <span class="hud-text hud-rotatable" title="Tap to rotate">
          ${statusText}
        </span>
        <button type="button" class="hud-rotate-btn" title="Rotate Wall">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        </button>
        <button type="button" class="hud-place-btn ${check.valid ? 'can-place' : 'disabled'}" title="Confirm Wall Placement">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Place
        </button>
      `;

      const hudX = Math.max(110, Math.min(window.innerWidth - 110, clientX));
      const hudY = (clientY < 130) ? (clientY + 65) : Math.max(40, clientY - 70);
      activeDragHud.style.left = `${hudX}px`;
      activeDragHud.style.top = `${hudY}px`;
    } else {
      if (activeDragHud) {
        activeDragHud.remove();
        activeDragHud = null;
      }
    }

    // 4. Touch Beacon under finger on touch devices during active drag
    if (isDraggingWall && window.matchMedia('(pointer: coarse)').matches) {
      if (!activeTouchBeacon) {
        activeTouchBeacon = document.createElement('div');
        activeTouchBeacon.className = 'wall-touch-beacon';
        document.body.appendChild(activeTouchBeacon);
      }
      activeTouchBeacon.style.left = `${clientX}px`;
      activeTouchBeacon.style.top = `${clientY}px`;
    } else if (!isDraggingWall && activeTouchBeacon) {
      activeTouchBeacon.remove();
      activeTouchBeacon = null;
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
    if (isMobileDevice()) return;
    wallPlacementState.hoverR = Math.min(r, GRID_SIZE - 2);
    wallPlacementState.hoverC = Math.min(c, GRID_SIZE - 2);
    renderWallPreview(wallPlacementState.hoverR, wallPlacementState.hoverC);
  }

  // Pointer & Touch Events for Drag-to-Place Wall
  boardGrid.addEventListener('pointerdown', (e) => {
    if (playerProfile.burnedOut) return;
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer || activePlayer.id !== playerProfile.id || activePlayer.burnedOut) return;

    if (currentActionMode === 'WALL') {
      if (isMobileDevice() || e.pointerType === 'touch') {
        isDraggingWall = true;
        boardGrid.classList.add('wall-drag-active');
        try {
          boardGrid.setPointerCapture(e.pointerId);
        } catch (err) { }

        const seam = getNearestWallSeam(e.clientX, e.clientY, wallPlacementState.orientation);
        wallPlacementState.hoverR = seam.r;
        wallPlacementState.hoverC = seam.c;
        renderWallDragGuide(e.clientX, e.clientY, seam.r, seam.c);

        if (e.pointerType === 'touch') {
          e.preventDefault();
        }
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
    boardGrid.classList.remove('wall-drag-active');
    try {
      boardGrid.releasePointerCapture(e.pointerId);
    } catch (err) { }

    if (activeTouchBeacon) {
      activeTouchBeacon.remove();
      activeTouchBeacon = null;
    }

    // Keep guide, crosshairs, and preview active so user can easily adjust or tap "Place"!
  });

  window.addEventListener('pointercancel', (e) => {
    if (isDraggingWall) {
      isDraggingWall = false;
      boardGrid.classList.remove('wall-drag-active');
      try {
        boardGrid.releasePointerCapture(e.pointerId);
      } catch (err) { }
      if (activeTouchBeacon) {
        activeTouchBeacon.remove();
        activeTouchBeacon = null;
      }
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
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;

    if (e.key.toLowerCase() === 's') {
      if (isLeEmPlayer()) {
        revealSukunaButton();
      }
    } else if (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'e') {
      toggleWallOrientation();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (currentActionMode === 'WALL') {
        confirmWallPlacement();
      }
    }
  });

  function confirmWallPlacement() {
    if (playerProfile.burnedOut) return;
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer || activePlayer.id !== playerProfile.id || activePlayer.burnedOut) {
      showToast("It's not your turn!");
      return;
    }

    const wallR = wallPlacementState.hoverR;
    const wallC = wallPlacementState.hoverC;

    if (wallR < 0 || wallC < 0) {
      showToast("Position your wall first.");
      return;
    }

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
      setActionMode('MOVE');
    } else {
      boardGrid.classList.add('shake-anim');
      if (activeDragHud) {
        activeDragHud.classList.add('shake-anim');
        setTimeout(() => activeDragHud && activeDragHud.classList.remove('shake-anim'), 400);
      }
      showToast(check.reason || 'Invalid wall placement');
      setTimeout(() => boardGrid.classList.remove('shake-anim'), 400);
    }
  }

  function advanceTurn(nextIndex) {
    roomState.currentTurnIndex = nextIndex;
    lastHandledTimeoutTurn = -1;
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

  let lastHandledTimeoutTurn = -1;

  function handleTurnTimeout() {
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer) return;
    if (lastHandledTimeoutTurn === roomState.currentTurnIndex) return;

    // Both the active player and the host can initiate the turn skip
    const isMyTurn = (activePlayer.id === playerProfile.id);
    const isMeHost = (playerProfile.id === roomState.hostId) || (roomState.players[0] && roomState.players[0].id === playerProfile.id);

    if (isMyTurn || isMeHost) {
      const currentIdx = roomState.currentTurnIndex;
      lastHandledTimeoutTurn = currentIdx;
      const nextTurnIndex = getNextActiveTurnIndex(currentIdx);

      broadcastEvent('turn_timeout', {
        playerId: activePlayer.id,
        turnIndex: currentIdx,
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
    const isTeam = (roomState.gameMode === 'team' && winner.teamName);
    const devBadge = isDeveloper(winner) ? '<span class="dev-badge">Dev</span>' : '';
    winnerTitle.innerHTML = isTeam ? `${escapeHTML(winner.teamName)} Wins!` : `${escapeHTML(winner.name)}${devBadge} Wins!`;
    const defaultSubtitle = isTeam
      ? `${escapeHTML(winner.name)}${devBadge} led ${escapeHTML(winner.teamName)} to the golden center goal (${GOAL_POS.r}, ${GOAL_POS.c})!`
      : `${escapeHTML(winner.name)}${devBadge} reached the golden center goal (${GOAL_POS.r}, ${GOAL_POS.c})!`;
    winnerSubtitle.innerHTML = customSubtitle || defaultSubtitle;

    // Reset member ready flags and burnout statuses when game ends
    roomState.players.forEach(p => {
      p.isReady = false;
      p.burnedOut = false;
      p.isSpectating = false;
    });
    resetPlayerStatus();

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
      const devBadgeHTML = isDeveloper(p) ? '<span class="dev-badge">Dev</span>' : '';
      const teamTag = (roomState.gameMode === 'team' && p.teamName) ? ` <span style="opacity:0.75; font-size:0.8em; color:var(--text-muted);">(${escapeHTML(p.teamName)})</span>` : '';

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
        <span class="player-slot-name">${escapeHTML(p.name)}${devBadgeHTML}${teamTag} ${isMe ? '<span style="opacity:0.75; font-size:0.85em;">(You)</span>' : ''}</span>
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

    const activeGridSize = roomState.gridSize || getGridSizeForPlayerCount(Math.max(roomState.players.length, roomState.maxPlayers));
    setGridDimensions(activeGridSize);
    roomState.gridSize = activeGridSize;

    if (roomState.gameMode === 'team') {
      const shuffled = [...roomState.players].sort(() => Math.random() - 0.5);
      const teamConfigs = [
        { id: 'A', name: 'Team A', badgeClass: 'team-badge-a' },
        { id: 'B', name: 'Team B', badgeClass: 'team-badge-b' },
        { id: 'C', name: 'Team C', badgeClass: 'team-badge-c' },
        { id: 'D', name: 'Team D', badgeClass: 'team-badge-d' }
      ];
      const numTeams = Math.max(2, Math.floor(shuffled.length / 2));
      const teamBuckets = [];
      for (let t = 0; t < numTeams; t++) teamBuckets.push([]);
      shuffled.forEach((p, idx) => {
        const teamIdx = Math.floor(idx / 2);
        const config = teamConfigs[Math.min(teamIdx, teamConfigs.length - 1)];
        p.teamId = config.id;
        p.teamName = config.name;
        p.teamBadgeClass = config.badgeClass;
        teamBuckets[Math.min(teamIdx, numTeams - 1)].push(p);
      });
      const interleaved = [];
      for (let memberIdx = 0; memberIdx < 2; memberIdx++) {
        for (let t = 0; t < numTeams; t++) {
          if (teamBuckets[t][memberIdx]) {
            interleaved.push(teamBuckets[t][memberIdx]);
          }
        }
      }
      roomState.players = interleaved;
    }

    const initialPositions = getOuterPerimeterSpawnPositions(roomState.players.length, activeGridSize);
    roomState.players.forEach((p, idx) => {
      p.pos = initialPositions[idx];
      p.turnOrder = idx + 1;
      p.isReady = false;
      p.burnedOut = false;
      p.isSpectating = false;
    });

    playerProfile.isReady = false;
    playerProfile.burnedOut = false;
    playerProfile.isSpectating = false;
    roomState.walls = [];
    roomState.currentTurnIndex = 0;
    roomState.winner = null;

    if (supabaseClient && roomState.code) {
      supabaseClient.from('matches').delete().eq('room_code', roomState.code).then(() => { }).catch(() => { });
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

    if (sidebarHeadingText) {
      sidebarHeadingText.textContent = roomState.gameMode === 'team' ? 'TEAMS' : 'PLAYERS';
    }

    const currentActivePlayer = roomState.players[roomState.currentTurnIndex];

    if (roomState.gameMode === 'team') {
      // USER REQUIREMENT: Team structure:
      // Team A
      // Player
      // Player
      // Team B
      // Player
      // Player
      const teamMap = new Map();
      roomState.players.forEach(p => {
        const tId = p.teamId || 'A';
        const tName = p.teamName || `Team ${tId}`;
        const tBadge = p.teamBadgeClass || `team-badge-${tId.toLowerCase()}`;
        if (!teamMap.has(tId)) {
          teamMap.set(tId, { id: tId, name: tName, badgeClass: tBadge, players: [] });
        }
        teamMap.get(tId).players.push(p);
      });

      teamMap.forEach(team => {
        const teamBlock = document.createElement('div');
        teamBlock.className = 'team-group-block';

        const isTeamActive = currentActivePlayer && (currentActivePlayer.teamId === team.id) && !currentActivePlayer.burnedOut;
        if (isTeamActive) {
          teamBlock.classList.add('team-turn-active');
        }

        const header = document.createElement('div');
        header.className = 'team-group-header';
        header.innerHTML = `
          <span class="team-group-title ${team.badgeClass}">${escapeHTML(team.name)}</span>
          ${isTeamActive ? '<span class="team-turn-indicator">ACTIVE TURN</span>' : ''}
        `;
        teamBlock.appendChild(header);

        team.players.forEach(p => {
          const isCurrentTurn = (p.id === currentActivePlayer?.id && !p.burnedOut);
          const isMe = (p.id === playerProfile.id);
          const isBurned = !!p.burnedOut;
          const devBadge = isDeveloper(p) ? '<span class="dev-badge">Dev</span>' : '';

          const card = document.createElement('div');
          card.className = `live-player-card ${isCurrentTurn ? 'active-turn' : ''} ${isBurned ? 'burned-out' : ''}`;

          let statusText = `Turn #${p.turnOrder || ''}`;
          let statusClass = 'status-waiting';
          if (isBurned) {
            statusText = 'Burned Out';
            statusClass = 'status-burned';
          } else if (isCurrentTurn) {
            statusText = isMe ? 'Your Turn!' : `Turn #${p.turnOrder}`;
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
                ${devBadge}
                ${isMe ? '<span class="live-you-tag">YOU</span>' : ''}
              </div>
              <div class="live-player-sub-row">
                <span class="live-player-status-badge ${statusClass}">${statusText}</span>
                ${p.pos && !isBurned ? `<span class="live-player-coords">(${p.pos.r}, ${p.pos.c})</span>` : ''}
              </div>
            </div>
          `;
          teamBlock.appendChild(card);
        });

        livePlayersList.appendChild(teamBlock);
      });
    } else {
      roomState.players.forEach((p, idx) => {
        const isCurrentTurn = (idx === roomState.currentTurnIndex && !p.burnedOut);
        const isMe = (p.id === playerProfile.id);
        const isBurned = !!p.burnedOut;
        const devBadge = isDeveloper(p) ? '<span class="dev-badge">Dev</span>' : '';

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
              ${devBadge}
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
        if (roomState.gameMode !== 'team' && roomState.players.length === 2) {
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
    const isTwoPlayerGame = (roomState.gameMode !== 'team' && roomState.players.length === 2);

    playerProfile.burnedOut = true;
    meInRoom.burnedOut = true;

    if (burnedPos) {
      playPlayerBurnAnimation(burnedPos, playerProfile.id);
    }

    // Clear highlights & previews
    clearMoveHighlights();
    document.querySelectorAll('.wall-preview').forEach(el => el.remove());

    if (isTwoPlayerGame) {
      // ON 2 PLAYERS FFA: BURNING OUT SURRENDERS THE GAME, NOT SPECTATING!
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

    // 3+ players (or Team mode): spectating mode
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

    const isTwoPlayerGame = (data.isSurrender || (roomState.gameMode !== 'team' && roomState.players.length === 2));

    if (isTwoPlayerGame) {
      // 2 players FFA: remote player surrendered the match, ending the game
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

    if (roomState.gameMode === 'team') {
      const activePlayers = roomState.players.filter(p => !p.burnedOut);
      const activeTeams = new Set(activePlayers.map(p => p.teamId));

      if (activeTeams.size === 1) {
        const winningTeamId = [...activeTeams][0];
        const winner = activePlayers.find(p => p.teamId === winningTeamId) || activePlayers[0];
        triggerVictory(winner, `${winner.teamName} Wins! All opposing teams burned out.`);
        return true;
      }
      return false;
    } else {
      const activePlayers = roomState.players.filter(p => !p.burnedOut);
      if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        const surrendered = roomState.players.filter(p => p.burnedOut).map(p => p.name).join(', ');
        triggerVictory(winner, `${winner.name} Wins! ${surrendered} surrendered.`);
        return true;
      }
      return false;
    }
  }

  btnExitGame.addEventListener('click', () => {
    resetPlayerStatus();
    const isPlayerHost = (playerProfile.id === roomState.hostId) || (roomState.players[0] && roomState.players[0].id === playerProfile.id);
    if (isPlayerHost) {
      broadcastEvent('game_terminated', { reason: 'Host exited the game.' });
    } else {
      broadcastEvent('player_left', { playerId: playerProfile.id });
    }
    terminateAndReturnToInvite('Returned to main menu.');
  });

  // --------------------------------------------------------------------------
  // Sukuna Mode System (Exclusive for Developer 'Le Em')
  // --------------------------------------------------------------------------
  function playAudio(path, volume = 0.85) {
    try {
      const audio = new Audio(path);
      audio.volume = volume;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn(`Audio playback for ${path} was prevented:`, err);
        });
      }
      return audio;
    } catch (e) {
      console.warn(`Error playing ${path}:`, e);
      return null;
    }
  }

  function isLeEmPlayer() {
    if (isDevVerified) return true;
    if (playerProfile && playerProfile.isDev) return true;
    if (playerProfile && playerProfile.name && playerProfile.name.trim().toLowerCase() === 'le em') {
      return true;
    }
    return false;
  }

  function revealSukunaButton() {
    const btn = document.getElementById('btn-sukuna-mode');
    if (!btn) return;

    btn.style.display = 'inline-flex';
    btn.classList.add('sukuna-unlocked-pop');
    setTimeout(() => btn.classList.remove('sukuna-unlocked-pop'), 800);

    // Play gambale.mp3
    playAudio('audio/gambale.mp3', 0.95);

    if (!isSukunaButtonRevealed) {
      isSukunaButtonRevealed = true;
      showToast('Cursed energy stirred... Sukuna Mode unlocked!', 'success');
    }
  }

  function handleSukunaModeToggle() {
    if (!isLeEmPlayer()) return;

    isSukunaModeActive = !isSukunaModeActive;
    playerProfile.isSukuna = isSukunaModeActive;
    if (isSukunaModeActive) {
      playerProfile.sukunaTransformedAt = Date.now();
    }

    const meInRoom = roomState.players.find(p => p.id === playerProfile.id);
    if (meInRoom) {
      meInRoom.isSukuna = isSukunaModeActive;
      if (isSukunaModeActive) {
        meInRoom.sukunaTransformedAt = Date.now();
      }
    }

    const btn = document.getElementById('btn-sukuna-mode');
    if (btn) {
      const textSpan = btn.querySelector('.sukuna-text');
      if (isSukunaModeActive) {
        btn.classList.add('active');
        if (textSpan) textSpan.textContent = 'SUKUNA ACTIVE';
      } else {
        btn.classList.remove('active');
        if (textSpan) textSpan.textContent = 'SUKUNA MODE';
      }
    }

    if (sukunaArsenalBar) {
      sukunaArsenalBar.style.display = isSukunaModeActive ? 'flex' : 'none';
    }

    if (isSukunaModeActive) {
      // 1. Play ONLY gambale.mp3 as requested
      playAudio('audio/gambale.mp3', 0.95);

      // 2. Trigger dramatic anime VFX sequence
      triggerSukunaAnimeVFX();
    }

    // 3. Broadcast to all peers in the room
    broadcastEvent('player_sukuna_mode', {
      playerId: playerProfile.id,
      isSukuna: isSukunaModeActive
    });

    saveActiveSession();
    renderBoardState();
  }

  function triggerSukunaAnimeVFX() {
    const existing = document.querySelector('.sukuna-anime-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'sukuna-anime-overlay';
    overlay.innerHTML = `
      <div class="sukuna-domain-flash"></div>
      <div class="sukuna-cleave-line sukuna-cleave-1"></div>
      <div class="sukuna-cleave-line sukuna-cleave-2"></div>
      <div class="sukuna-cleave-line sukuna-cleave-3"></div>
      <div class="sukuna-anime-banner">
        <div class="sukuna-banner-kanji">宿 儺</div>
        <div class="sukuna-banner-title">SUKUNA MODE</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const gameScreen = document.querySelector('.game-screen') || document.body;
    gameScreen.classList.add('sukuna-screen-shake');

    setTimeout(() => {
      gameScreen.classList.remove('sukuna-screen-shake');
    }, 700);

    setTimeout(() => {
      overlay.remove();
    }, 2200);
  }

  function getSukunaTattooSvg(isIntro = false) {
    const animClass = isIntro ? 'sukuna-etch-anim' : '';
    return `
      <svg class="sukuna-tattoo-svg ${animClass}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <g class="sukuna-ink-layer" fill="#0b0a10">
          <!-- 1. FOREHEAD TRIDENT / CROWN TRIBAL MARK -->
          <ellipse cx="50" cy="20" rx="3" ry="6.2" />
          <path d="M 44 14 C 41 21 45 28 47 33 C 46.5 27 44 21 47 15 Z" />
          <path d="M 56 14 C 59 21 55 28 53 33 C 53.5 27 56 21 53 15 Z" />
          <path d="M 39 17 C 35 24 38 31 42 36 C 40 30 38 24 42 18 Z" />
          <path d="M 61 17 C 65 24 62 31 58 36 C 60 30 62 24 58 18 Z" />

          <!-- 2. NOSE BRIDGE TRIBAL STRIPE -->
          <path d="M 34 52 Q 50 48 66 52 Q 50 56.5 34 52 Z" />

          <!-- 3. CHEEK TRIBAL MARKS -->
          <!-- Left Cheek -->
          <path d="M 10 44 Q 22 47 28 52 Q 21 53.5 10 48 Z" />
          <path d="M 14 53 Q 26 56 31 61 Q 24 62.5 14 57 Z" />
          <!-- Right Cheek -->
          <path d="M 90 44 Q 78 47 72 52 Q 79 53.5 90 48 Z" />
          <path d="M 86 53 Q 74 56 69 61 Q 76 62.5 86 57 Z" />

          <!-- 4. JAW & CHIN TRIBAL MARKINGS -->
          <path d="M 22 67 Q 34 77 44 79 Q 34 74 22 67 Z" />
          <path d="M 78 67 Q 66 77 56 79 Q 66 74 78 67 Z" />
          <rect x="43.5" y="78" width="3.2" height="13" rx="1.5" />
          <rect x="53.3" y="78" width="3.2" height="13" rx="1.5" />
        </g>
      </svg>
    `;
  }

  if (btnSukunaMode) {
    btnSukunaMode.addEventListener('click', () => {
      handleSukunaModeToggle();
    });
  }

  // --------------------------------------------------------------------------
  // Sukuna Arsenal & Dismantle Technique Handlers
  // --------------------------------------------------------------------------
  function openTechniqueTargetModal(techType = 'dismantle') {
    if (!modalDismantleTarget || !dismantleTargetsList) return;
    dismantleTargetsList.innerHTML = '';

    const modalTitle = document.getElementById('sukuna-modal-title');
    const modalDesc = document.getElementById('sukuna-modal-desc');
    const modalTag = document.getElementById('sukuna-modal-tag');

    if (techType === 'cleave') {
      if (modalTag) modalTag.textContent = 'INNATE TECHNIQUE';
      if (modalTitle) modalTitle.innerHTML = 'CLEAVE <span>「 捌 」</span>';
      if (modalDesc) modalDesc.textContent = 'Select an opponent to unleash a relentless 3-second slashing barrage.';
    } else if (techType === 'domain') {
      if (modalTag) modalTag.textContent = 'BARRIER TECHNIQUE';
      if (modalTitle) modalTitle.innerHTML = 'DOMAIN EXPANSION <span>「 伏魔御廚子 」</span>';
      if (modalDesc) modalDesc.textContent = 'Select an opponent to entrap within Malevolent Shrine.';
    } else {
      if (modalTag) modalTag.textContent = 'JUJUTSU TECHNIQUE';
      if (modalTitle) modalTitle.innerHTML = 'DISMANTLE <span>「 解 」</span>';
      if (modalDesc) modalDesc.textContent = 'Select an opponent to slice through with an invisible slash.';
    }

    const activeOpponents = roomState.players.filter(p => p.id !== playerProfile.id && !p.burnedOut && p.pos);

    if (activeOpponents.length === 0) {
      showToast('No active opponents available to target!', 'error');
      return;
    }

    activeOpponents.forEach(opp => {
      const btn = document.createElement('button');
      btn.className = 'dismantle-target-btn';

      let strikeTagHTML = '<div class="dismantle-strike-tag">DISMANTLE</div>';
      if (techType === 'cleave') {
        strikeTagHTML = '<div class="cleave-strike-tag">CLEAVE</div>';
      } else if (techType === 'domain') {
        strikeTagHTML = '<div class="domain-strike-tag">EXPAND DOMAIN</div>';
      }

      btn.innerHTML = `
        <div class="dismantle-target-info">
          <div class="dismantle-target-marble marble-${opp.color}"></div>
          <span class="dismantle-target-name">${escapeHTML(opp.name)}</span>
          <span class="dismantle-target-coords">(${opp.pos.r}, ${opp.pos.c})</span>
        </div>
        ${strikeTagHTML}
      `;

      btn.addEventListener('click', () => {
        modalDismantleTarget.classList.remove('active');
        if (techType === 'cleave') {
          executeCleaveAttack(opp.id);
        } else if (techType === 'domain') {
          executeDomainExpansionAttack();
        } else {
          executeDismantleAttack(opp.id);
        }
      });

      dismantleTargetsList.appendChild(btn);
    });

    modalDismantleTarget.classList.add('active');
  }

  function openDismantleTargetModal() {
    openTechniqueTargetModal('dismantle');
  }

  function showSukunaChantBubble(cell, text) {
    const existing = document.querySelectorAll('.sukuna-chant-bubble');
    existing.forEach(el => el.remove());

    let centerX = window.innerWidth / 2;
    let targetTop = 130;

    if (cell) {
      const marble = cell.querySelector('.marble-sphere') || cell;
      const rect = marble.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        centerX = rect.left + rect.width / 2;
        targetTop = rect.top - 14;
      }
    }

    const bubble = document.createElement('div');
    bubble.className = 'sukuna-chant-bubble';
    bubble.style.left = `${centerX}px`;
    bubble.style.top = `${targetTop}px`;
    bubble.innerHTML = `
      <span class="sukuna-chant-text"></span>
      <span class="sukuna-chant-caret"></span>
    `;
    document.body.appendChild(bubble);

    const textEl = bubble.querySelector('.sukuna-chant-text');
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      textEl.textContent = text.slice(0, idx);
      if (idx >= text.length) {
        clearInterval(interval);
        // Stay for exactly 2 seconds, then smoothly fade out
        setTimeout(() => {
          bubble.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
          bubble.style.opacity = '0';
          bubble.style.transform = 'translate(-50%, -125%)';
          setTimeout(() => bubble.remove(), 520);
        }, 2000);
      }
    }, 25);
  }

  // --------------------------------------------------------------------------
  // DISMANTLE TECHNIQUE
  // --------------------------------------------------------------------------
  function executeDismantleAttack(targetId) {
    if (!isLeEmPlayer()) return;
    const target = roomState.players.find(p => p.id === targetId);
    if (!target || target.burnedOut) return;

    // Play dismantle.mp3 immediately at the exact instant the player is selected
    playAudio('audio/dismantle.mp3', 1.0);

    const payload = {
      casterId: playerProfile.id,
      targetId: targetId,
      casterPos: playerProfile.pos ? { r: playerProfile.pos.r, c: playerProfile.pos.c } : null,
      targetPos: target.pos ? { r: target.pos.r, c: target.pos.c } : null
    };

    // Broadcast to all clients in the match
    broadcastEvent('sukuna_dismantle', payload);

    // Execute locally
    performSukunaDismantleSequence(playerProfile.id, targetId, payload);
  }

  function performSukunaDismantleSequence(casterId, targetId, payload = {}) {
    const caster = roomState.players.find(p => p.id === casterId);
    const target = roomState.players.find(p => p.id === targetId);

    const cPos = (caster && caster.pos) || payload.casterPos || null;
    const tPos = (target && target.pos) || payload.targetPos || null;

    // Play audio
    playAudio('audio/dismantle.mp3', 1.0);

    // Chant speech bubble on caster circle: "Dismantle..." (stays 2 seconds then fades out)
    if (cPos) {
      const casterCell = getCellElem(cPos.r, cPos.c);
      if (casterCell) {
        showSukunaChantBubble(casterCell, 'Dismantle...');
      }
    }

    // Animated white & black visible slash cutting through target circle in grid
    setTimeout(() => {
      let targetCell = tPos ? getCellElem(tPos.r, tPos.c) : null;
      triggerDismantleSlashVFX(targetCell);
    }, 320);

    // After slash animation + 0.5s rest (~1270ms), target burns out
    setTimeout(() => {
      executeTargetDismantledBurnOut(targetId, casterId, tPos, 'Dismantle');
    }, 1270);
  }

  function triggerDismantleSlashVFX(targetCell) {
    let centerX = window.innerWidth / 2;
    let centerY = window.innerHeight / 2;

    if (targetCell) {
      const marble = targetCell.querySelector('.marble-sphere') || targetCell;
      const rect = marble.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
      } else {
        const cellRect = targetCell.getBoundingClientRect();
        if (cellRect.width > 0 && cellRect.height > 0) {
          centerX = cellRect.left + cellRect.width / 2;
          centerY = cellRect.top + cellRect.height / 2;
        }
      }

      if (marble && marble.classList.contains('marble-sphere')) {
        marble.classList.add('dismantle-bisected');
        const scar = document.createElement('div');
        scar.className = 'dismantle-cut-scar';
        marble.appendChild(scar);
        setTimeout(() => {
          scar.remove();
          marble.classList.remove('dismantle-bisected');
        }, 1250);
      }
    }

    const existing = document.querySelector('.dismantle-cinema-overlay');
    if (existing) existing.remove();

    const slashOverlay = document.createElement('div');
    slashOverlay.className = 'dismantle-cinema-overlay';
    slashOverlay.style.left = `${centerX}px`;
    slashOverlay.style.top = `${centerY}px`;

    slashOverlay.innerHTML = `
      <div class="dismantle-impact-flash"></div>
      <div class="dismantle-blade-streak blade-1">
        <div class="blade-core-black"></div>
        <div class="blade-edge-white"></div>
      </div>
      <div class="dismantle-blade-streak blade-2">
        <div class="blade-core-black"></div>
        <div class="blade-edge-white"></div>
      </div>
      <div class="dismantle-blade-streak blade-3">
        <div class="blade-core-black"></div>
        <div class="blade-edge-white"></div>
      </div>
      <div class="dismantle-ink-rift rift-1"></div>
      <div class="dismantle-ink-rift rift-2"></div>
      <div class="dismantle-ink-rift rift-3"></div>
      <div class="slash-impact-flash"></div>
    `;

    document.body.appendChild(slashOverlay);

    const gameScreen = document.querySelector('.game-screen') || document.body;
    gameScreen.classList.add('dismantle-impact-shake');
    setTimeout(() => gameScreen.classList.remove('dismantle-impact-shake'), 450);

    setTimeout(() => {
      slashOverlay.remove();
    }, 700);
  }

  // --------------------------------------------------------------------------
  // CLEAVE TECHNIQUE (Consistent slashes for 3 seconds)
  // --------------------------------------------------------------------------
  function executeCleaveAttack(targetId) {
    if (!isLeEmPlayer()) return;
    const target = roomState.players.find(p => p.id === targetId);
    if (!target || target.burnedOut) return;

    // Play cleave.mp3 immediately at the exact instant the player is selected
    playAudio('audio/cleave.mp3', 1.0);

    const payload = {
      casterId: playerProfile.id,
      targetId: targetId,
      casterPos: playerProfile.pos ? { r: playerProfile.pos.r, c: playerProfile.pos.c } : null,
      targetPos: target.pos ? { r: target.pos.r, c: target.pos.c } : null
    };

    // Broadcast to all clients in the match
    broadcastEvent('sukuna_cleave', payload);

    // Execute locally
    performSukunaCleaveSequence(playerProfile.id, targetId, payload);
  }

  function performSukunaCleaveSequence(casterId, targetId, payload = {}) {
    const caster = roomState.players.find(p => p.id === casterId);
    const target = roomState.players.find(p => p.id === targetId);

    const cPos = (caster && caster.pos) || payload.casterPos || null;
    const tPos = (target && target.pos) || payload.targetPos || null;

    // 1. Play cleave.mp3 immediately at the exact instant the button/player was selected
    playAudio('audio/cleave.mp3', 1.0);

    // 2. Chant speech bubble on caster circle: "Cleave..." (stays 2 seconds then fades out)
    if (cPos) {
      const casterCell = getCellElem(cPos.r, cPos.c);
      if (casterCell) {
        showSukunaChantBubble(casterCell, 'Cleave...');
      }
    }

    // 3. Consistent continuous slashing barrage for 3 full seconds!
    let targetCell = tPos ? getCellElem(tPos.r, tPos.c) : null;
    triggerCleaveConsistentBarrageVFX(targetCell, 3000);

    // 4. After 3 seconds consistent slashes + 0.5 seconds rest (3500ms total), the target burns out
    setTimeout(() => {
      executeTargetDismantledBurnOut(targetId, casterId, tPos, 'Cleave');
    }, 3500);
  }

  function triggerCleaveConsistentBarrageVFX(targetCell, durationMs = 3000) {
    if (!targetCell) return;
    const marble = targetCell.querySelector('.marble-sphere') || targetCell;

    // Get real-time viewport center of target marble
    function getTargetCenter() {
      const rect = marble.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      const cellRect = targetCell.getBoundingClientRect();
      return { x: cellRect.left + cellRect.width / 2, y: cellRect.top + cellRect.height / 2 };
    }

    const initialCenter = getTargetCenter();

    // Clean up any prior barrage overlay
    const existing = document.querySelector('.cleave-barrage-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'cleave-barrage-overlay';
    overlay.style.left = `${initialCenter.x}px`;
    overlay.style.top = `${initialCenter.y}px`;
    overlay.innerHTML = `
      <div class="cleave-barrage-core-vortex"></div>
    `;
    document.body.appendChild(overlay);

    // Marble heavy cursed reaction
    if (marble && marble.classList.contains('marble-sphere')) {
      marble.classList.add('cleave-bisected-heavy');
    }

    const gameScreen = document.querySelector('.game-screen') || document.body;
    gameScreen.classList.add('cleave-continuous-shake');
    if (boardGrid) boardGrid.classList.add('cleave-continuous-shake');

    // Choreographed storm of realistic slicing angles directly through the targeted player
    const cutAngles = [
      -45, 45, -15, 75, -70, 20, -85, 55,
      -35, 88, -10, 65, -80, 15, -55, 38,
      -90, 0, -65, 80, -25, 50, -40, 85,
      -75, 30, -20, 42, -48, 90, -90, 135
    ];

    let step = 0;
    const slashInterval = setInterval(() => {
      step++;
      const center = getTargetCenter();
      overlay.style.left = `${center.x}px`;
      overlay.style.top = `${center.y}px`;

      const angle = cutAngles[step % cutAngles.length];
      const lateralOffset = ((step % 5) - 2) * 6; // slight variance (-12px to +12px) across diameter

      // 1. Multi-Angle Rotated Track that accurately cuts through the target center
      const track = document.createElement('div');
      track.className = 'cleave-cut-track';
      track.style.transform = `rotate(${angle}deg) translateY(${lateralOffset}px)`;
      track.innerHTML = `
        <div class="cleave-cut-blade">
          <div class="blade-core-black"></div>
          <div class="blade-edge-white"></div>
        </div>
      `;
      overlay.appendChild(track);

      // 2. Real-time razor cut scar etched onto the target marble itself at this angle
      if (marble && marble.classList.contains('marble-sphere')) {
        const wound = document.createElement('div');
        wound.className = 'cleave-marble-wound';
        wound.style.transform = `translateY(calc(-50% + ${lateralOffset}px)) rotate(${angle}deg)`;
        marble.appendChild(wound);
        setTimeout(() => wound.remove(), 600);
      }

      // 3. Directional cursed sparks spraying along cutting trajectory
      for (let s = 0; s < 3; s++) {
        const spark = document.createElement('div');
        spark.className = 'cleave-spark';
        const dist = 35 + Math.random() * 65;
        const rad = (angle + (Math.random() * 40 - 20)) * (Math.PI / 180);
        spark.style.setProperty('--tx', `${Math.cos(rad) * dist}px`);
        spark.style.setProperty('--ty', `${Math.sin(rad) * dist}px`);
        overlay.appendChild(spark);
        setTimeout(() => spark.remove(), 280);
      }

      setTimeout(() => track.remove(), 230);
    }, 90);

    // Stop barrage after durationMs (3000ms)
    setTimeout(() => {
      clearInterval(slashInterval);
      gameScreen.classList.remove('cleave-continuous-shake');
      if (boardGrid) boardGrid.classList.remove('cleave-continuous-shake');

      if (marble && marble.classList.contains('marble-sphere')) {
        marble.classList.remove('cleave-bisected-heavy');
      }

      // Final devastating severance impact flash
      const finalFlash = document.createElement('div');
      finalFlash.className = 'dismantle-impact-flash';
      overlay.appendChild(finalFlash);

      setTimeout(() => {
        overlay.remove();
      }, 500);
    }, durationMs);
  }

  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // DOMAIN EXPANSION: MALEVOLENT SHRINE (Cinematic 17.8s anime cataclysm)
  // --------------------------------------------------------------------------
  let isDomainExpansionActive = false;

  function executeDomainExpansionAttack() {
    if (!isLeEmPlayer() || isDomainExpansionActive) return;
    isDomainExpansionActive = true;
    setTimeout(() => { isDomainExpansionActive = false; }, 20000);

    // Play domainexpansion.mp3 immediately at the exact instant the button was clicked
    playAudio('audio/domainexpansion.mp3', 1.0);

    const payload = {
      casterId: playerProfile.id,
      casterPos: playerProfile.pos ? { r: playerProfile.pos.r, c: playerProfile.pos.c } : null
    };

    // Broadcast to all clients in the match
    broadcastEvent('sukuna_domain', payload);

    // Execute locally
    performSukunaDomainSequence(playerProfile.id, payload);
  }

  function performSukunaDomainSequence(casterId, payload = {}) {
    isDomainExpansionActive = true;
    setTimeout(() => { isDomainExpansionActive = false; }, 20000);

    // 1. Play audio domainexpansion.mp3 at the exact same instant (for remote peers)
    if (casterId !== playerProfile.id) {
      playAudio('audio/domainexpansion.mp3', 1.0);
    }

    const caster = roomState.players.find(p => p.id === casterId);
    const cPos = (caster && caster.pos) || payload.casterPos || null;

    // Get caster center coordinates in real-time
    let casterCell = cPos ? getCellElem(cPos.r, cPos.c) : null;
    let casterCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let originalMarble = null;
    if (casterCell) {
      originalMarble = casterCell.querySelector('.marble-sphere') || casterCell;
      const rect = originalMarble.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        casterCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }

    // Typewriter chant bubble on caster: "Domain Expansion..." (stays 2 seconds then fades out)
    if (casterCell) {
      showSukunaChantBubble(casterCell, 'Domain Expansion...');
    }

    // ------------------------------------------------------------------------
    // PHASE 1 (0.0s to 4.0s):
    // The entire screen will slowly fade out for 4 seconds,
    // Le Em and hand sign stay present above the fade out!
    // ------------------------------------------------------------------------
    const voidFadeout = document.createElement('div');
    voidFadeout.className = 'domain-void-fadeout';
    document.body.appendChild(voidFadeout);
    requestAnimationFrame(() => voidFadeout.classList.add('active'));

    // Caster spotlight: Le Em stays present and unaffected by the fade out
    const casterSpotlight = document.createElement('div');
    casterSpotlight.className = 'domain-caster-spotlight';
    casterSpotlight.style.left = `${casterCenter.x}px`;
    casterSpotlight.style.top = `${casterCenter.y}px`;

    // Clone the caster marble so Le Em's circle player is 100% visible and present above the black fadeout
    let clonedMarbleHTML = '';
    if (originalMarble && originalMarble.classList.contains('marble-sphere')) {
      clonedMarbleHTML = originalMarble.outerHTML;
    } else {
      clonedMarbleHTML = '<div class="marble-sphere marble-red player-sukuna-active domain-caster-marble-clone"></div>';
    }

    // Hand sign mudra placed at circle player (Only the hand visible, shrunk, no circle behind it)
    casterSpotlight.innerHTML = `
      <div class="domain-handsign-emblem">
        <img src="img/sukuna_handsign_custom.svg" alt="Domain Hand Sign">
      </div>
    `;
    document.body.appendChild(casterSpotlight);

    // ------------------------------------------------------------------------
    // PHASE 2 (4.0s to 7.3s):
    // After 4s, the shrine behind Le Em will slowly rise for 3.3s
    // and fade in back to normal with the house present (Only the house visible)
    // ------------------------------------------------------------------------
    let shrineContainer = null;
    setTimeout(() => {
      // Fade screen back to normal over 3.3s
      voidFadeout.classList.remove('active');
      voidFadeout.classList.add('fade-back');

      // The shrine ("little house") behind player Le Em (Only the house visible)
      shrineContainer = document.createElement('div');
      shrineContainer.className = 'domain-shrine-container';
      shrineContainer.style.left = `${casterCenter.x}px`;
      shrineContainer.style.top = `${casterCenter.y}px`;
      shrineContainer.innerHTML = `
        <img src="img/malevolent_shrine_custom.svg" class="domain-shrine-img" alt="Malevolent Shrine">
      `;
      document.body.appendChild(shrineContainer);

      requestAnimationFrame(() => {
        shrineContainer.classList.add('shrine-risen');
      });
    }, 4000);

    // ------------------------------------------------------------------------
    // PHASE 3 (7.3s to 17.3s):
    // White, red, black SLASHES EVERYWHERE (DIFFERENT SIZES TAKING UP ENTIRE SCREEN)
    // FOR 10 SECONDS WITH CONTINUOUS GROUND SHAKING
    // ------------------------------------------------------------------------
    let slashOverlay = null;
    let slashInterval = null;
    setTimeout(() => {
      if (voidFadeout.parentNode) voidFadeout.remove();

      const gameScreen = document.querySelector('.game-screen') || document.body;
      gameScreen.classList.add('domain-cataclysm-earthquake');
      if (boardGrid) boardGrid.classList.add('domain-cataclysm-earthquake');

      slashOverlay = document.createElement('div');
      slashOverlay.className = 'domain-fullscreen-slashes';
      document.body.appendChild(slashOverlay);

      // Collect opponent cells for direct slashing strikes
      const opponentCells = [];
      roomState.players.forEach(p => {
        if (p.id !== casterId && !p.burnedOut && p.pos) {
          const c = getCellElem(p.pos.r, p.pos.c);
          if (c) {
            opponentCells.push({ cell: c, marble: c.querySelector('.marble-sphere') || c });
          }
        }
      });

      const omniAngles = [-60, 45, -30, 80, -75, 15, -85, 50, -40, 90, 0, 135, -120, 30, -55, 65, 20, -15, -45, 110];
      let cutCount = 0;

      // Balanced performance-optimized slashing storm: runs every 90ms
      slashInterval = setInterval(() => {
        cutCount++;
        const angle = omniAngles[cutCount % omniAngles.length];

        // 4 SIZES: Colossal (spans entire screen), Large, Medium, Small
        const roll = Math.random();
        let sizeClass = 'size-medium';
        let slashWidth = 420;
        let posX = Math.random() * window.innerWidth;
        let posY = Math.random() * window.innerHeight;

        if (roll < 0.22) {
          // COLOSSAL: Takes up the ENTIRE SCREEN from corner to corner
          sizeClass = 'size-colossal';
          slashWidth = Math.max(window.innerWidth, window.innerHeight) * 1.35;
          posX = window.innerWidth / 2 + (Math.random() * 200 - 100);
          posY = window.innerHeight / 2 + (Math.random() * 200 - 100);

          // Screen fracture scar that lingers across the screen
          if (cutCount % 3 === 0) {
            const fracture = document.createElement('div');
            fracture.className = 'domain-screen-fracture';
            fracture.style.left = `${posX}px`;
            fracture.style.top = `${posY}px`;
            fracture.style.width = `${slashWidth * 0.75}px`;
            fracture.style.marginLeft = `${-(slashWidth * 0.75) / 2}px`;
            fracture.style.transform = `rotate(${angle}deg)`;
            slashOverlay.appendChild(fracture);
            setTimeout(() => fracture.remove(), 300);
          }
        } else if (roll < 0.50) {
          // LARGE: Broad sweep across board sections
          sizeClass = 'size-large';
          slashWidth = 600 + Math.random() * 380;
        } else if (roll < 0.78) {
          // MEDIUM: Focused cleave
          sizeClass = 'size-medium';
          slashWidth = 340 + Math.random() * 220;
        } else {
          // SMALL: Rapid micro razor cut
          sizeClass = 'size-small';
          slashWidth = 160 + Math.random() * 160;
        }

        // Direct hits on opponent marbles with deep cut wounds
        if (cutCount % 3 === 0 && opponentCells.length > 0) {
          const opp = opponentCells[cutCount % opponentCells.length];
          const rect = opp.marble.getBoundingClientRect();
          if (rect.width > 0) {
            posX = rect.left + rect.width / 2;
            posY = rect.top + rect.height / 2;
            const wound = document.createElement('div');
            wound.className = 'cleave-marble-wound';
            wound.style.transform = `translateY(-50%) rotate(${angle}deg)`;
            opp.marble.appendChild(wound);
            setTimeout(() => wound.remove(), 450);
          }
        }

        const slashEl = document.createElement('div');
        slashEl.className = `domain-omni-slash ${sizeClass}`;
        slashEl.style.left = `${posX}px`;
        slashEl.style.top = `${posY}px`;
        slashEl.style.width = `${slashWidth}px`;
        slashEl.style.marginLeft = `${-slashWidth / 2}px`;
        slashEl.style.transform = `rotate(${angle}deg)`;
        slashEl.innerHTML = `
          <div class="domain-omni-blade">
            <div class="blade-aura-red"></div>
            <div class="blade-core-black"></div>
            <div class="blade-edge-white"></div>
          </div>
        `;
        slashOverlay.appendChild(slashEl);

        setTimeout(() => slashEl.remove(), 210);

        // Ambient flash pulse
        if (cutCount % 8 === 0) {
          const flash = document.createElement('div');
          flash.className = 'domain-ambient-flash';
          document.body.appendChild(flash);
          setTimeout(() => flash.remove(), 220);
        }
      }, 90);
    }, 7300);

    // ------------------------------------------------------------------------
    // PHASE 4 (17.3s to 17.8s):
    // AFTER THE SLASH, GIVE IT A REST FOR 0.5 SECONDS
    // ------------------------------------------------------------------------
    setTimeout(() => {
      clearInterval(slashInterval);
      if (slashOverlay) slashOverlay.remove();

      const gameScreen = document.querySelector('.game-screen') || document.body;
      gameScreen.classList.remove('domain-cataclysm-earthquake');
      if (boardGrid) boardGrid.classList.remove('domain-cataclysm-earthquake');

      // 0.5 seconds of stillness and silence
    }, 17300);

    // ------------------------------------------------------------------------
    // PHASE 5 (17.8s):
    // ALL OF THE PLAYERS WILL BURN OUT!
    // ------------------------------------------------------------------------
    setTimeout(() => {
      if (casterSpotlight) casterSpotlight.remove();
      if (shrineContainer) {
        shrineContainer.style.transition = 'opacity 1.5s ease';
        shrineContainer.style.opacity = '0';
        setTimeout(() => shrineContainer.remove(), 1500);
      }

      executeDomainAllPlayersBurnOut(casterId);
    }, 17800);
  }

  function executeDomainAllPlayersBurnOut(casterId) {
    const isMeCaster = (playerProfile.id === casterId);
    const opponents = roomState.players.filter(p => p.id !== casterId);

    // Burn out all opponents
    opponents.forEach(p => {
      p.burnedOut = true;
      if (p.id === playerProfile.id) {
        playerProfile.burnedOut = true;
        clearMoveHighlights();
        document.querySelectorAll('.wall-preview').forEach(el => el.remove());
        updateBurnOutButtonUI();
      }
      if (p.pos) {
        playPlayerBurnAnimation(p.pos, p.id);
      }
    });

    const caster = roomState.players.find(p => p.id === casterId);
    const casterName = caster ? caster.name : 'Le Em';

    showToast('Domain Expansion: Malevolent Shrine consumed all opponents!', 'error');

    // Authoritative broadcast from caster to sync all peers and end game
    if (isMeCaster) {
      opponents.forEach(p => {
        broadcastEvent('player_burn_out', {
          playerId: p.id,
          burnedPos: p.pos ? { r: p.pos.r, c: p.pos.c } : null,
          isSurrender: true,
          winnerId: casterId
        });
      });
      saveActiveSession();
      broadcastEvent('room_sync', roomState);
    }

    setTimeout(() => {
      if (caster) {
        triggerVictory(caster, `${casterName} Wins! Malevolent Shrine consumed the entire domain.`);
      }
    }, 1000);
  }

  // --------------------------------------------------------------------------
  // Authoritative Technique Burn Out and Match Resolution
  // --------------------------------------------------------------------------
  function executeTargetDismantledBurnOut(targetId, casterId, fallbackPos, techniqueName = 'Dismantle') {
    const target = roomState.players.find(p => p.id === targetId);
    if (!target || target.burnedOut) return;

    const burnedPos = target.pos ? { r: target.pos.r, c: target.pos.c } : fallbackPos;

    target.burnedOut = true;

    if (burnedPos) {
      playPlayerBurnAnimation(burnedPos, target.id);
    }

    const isMe = (target.id === playerProfile.id);
    if (isMe) {
      playerProfile.burnedOut = true;
      clearMoveHighlights();
      document.querySelectorAll('.wall-preview').forEach(el => el.remove());
      updateBurnOutButtonUI();
    }

    const isTwoPlayerGame = (roomState.gameMode !== 'team' && roomState.players.length === 2);

    if (isTwoPlayerGame) {
      target.isSpectating = false;
      if (isMe) playerProfile.isSpectating = false;

      const winner = roomState.players.find(p => p.id !== target.id);
      showToast(`${target.name} was defeated by ${techniqueName}!`, 'error');

      // Authoritative broadcast fallback from caster to sync all peers and end game
      if (playerProfile.id === casterId) {
        broadcastEvent('player_burn_out', {
          playerId: target.id,
          burnedPos: burnedPos,
          isSurrender: true,
          winnerId: winner ? winner.id : null
        });
        saveActiveSession();
        broadcastEvent('room_sync', roomState);
      }

      setTimeout(() => {
        if (winner) {
          triggerVictory(winner, `${winner.name} Wins! ${target.name} was ${techniqueName}d.`);
        }
      }, 900);
      return;
    }

    // 3+ players: spectating mode
    target.isSpectating = true;
    if (isMe) playerProfile.isSpectating = true;

    showToast(`${target.name} was defeated by ${techniqueName} and burned out!`, 'error');

    if (playerProfile.id === casterId) {
      broadcastEvent('player_burn_out', {
        playerId: target.id,
        burnedPos: burnedPos,
        isSurrender: false,
        nextTurnIndex: roomState.currentTurnIndex
      });
      saveActiveSession();
      broadcastEvent('room_sync', roomState);
    }

    if (checkBurnOutWinCondition()) return;

    // If it was the target's turn, advance turn
    if (roomState.currentTurnIndex === roomState.players.indexOf(target)) {
      const nextTurnIndex = getNextActiveTurnIndex(roomState.currentTurnIndex);
      advanceTurn(nextTurnIndex);
    }

    saveActiveSession();
    renderBoardState();
  }

  if (btnSukunaDismantle) {
    btnSukunaDismantle.addEventListener('click', () => {
      if (!isLeEmPlayer() || !isSukunaModeActive) return;
      openTechniqueTargetModal('dismantle');
    });
  }

  if (btnSukunaCleave) {
    btnSukunaCleave.addEventListener('click', () => {
      if (!isLeEmPlayer() || !isSukunaModeActive) return;
      openTechniqueTargetModal('cleave');
    });
  }

  if (btnSukunaDomain) {
    btnSukunaDomain.addEventListener('click', () => {
      if (!isLeEmPlayer() || !isSukunaModeActive) return;
      executeDomainExpansionAttack();
    });
  }

  if (btnCancelDismantle) {
    btnCancelDismantle.addEventListener('click', () => {
      if (modalDismantleTarget) modalDismantleTarget.classList.remove('active');
    });
  }

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