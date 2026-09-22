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
    wallsLeft: 10,
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
  const wallsCountVal = document.getElementById('walls-count-val');

  const modalVictory = document.getElementById('modal-victory');
  const winnerTitle = document.getElementById('winner-title');
  const winnerSubtitle = document.getElementById('winner-subtitle');

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

  // Check URL parameters for direct join link e.g. ?join=X7K2P9
  const urlParams = new URLSearchParams(window.location.search);
  const directJoinCode = urlParams.get('join');

  if (directJoinCode) {
    inputJoinCode.value = directJoinCode.toUpperCase();
    showScreen(screens.profile);
  }

  // --------------------------------------------------------------------------
  // Event Listeners: Configuration & Menus
  // --------------------------------------------------------------------------
  document.getElementById('btn-submit-invite').addEventListener('click', () => {
    const code = inputInviteCode.value.trim();
    if (code === DEFAULT_INVITATION_CODE) {
      showScreen(screens.profile);
    } else {
      inputInviteCode.classList.add('shake-anim');
      showToast('Invalid access code. Please enter 784921');
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

    enterLobbyRoom();
  });

  // Join Lobby Confirm
  document.getElementById('btn-confirm-join').addEventListener('click', () => {
    const code = inputJoinCode.value.trim().toUpperCase();
    if (code.length === 6) {
      isHost = false;
      roomState.code = code;
      roomState.players = [playerProfile];
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
    showScreen(screens.profile);
  });

  // --------------------------------------------------------------------------
  // Realtime Lobby & Unique Color Selection Engine
  // --------------------------------------------------------------------------
  function enterLobbyRoom() {
    displayRoomCode.textContent = roomState.code;
    maxPlayersLabel.textContent = roomState.maxPlayers;
    showScreen(screens.lobbyRoom);

    ensureUniquePlayerColor();
    renderLobbySlotsUI();
    renderLobbyColorPickerUI();

    if (joinRetryInterval) clearInterval(joinRetryInterval);

    // Initialize Realtime messaging channel
    joinGameRoomChannel(roomState.code, playerProfile, {
      onSubscribed: () => {
        if (!isHost) {
          broadcastEvent('room_join_request', playerProfile);
          joinRetryInterval = setInterval(() => {
            if (roomState.players.length > 1 || isHost) {
              clearInterval(joinRetryInterval);
            } else {
              broadcastEvent('room_join_request', playerProfile);
            }
          }, 800);
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
          broadcastEvent('room_sync', roomState);
          renderLobbySlotsUI();
          renderLobbyColorPickerUI();
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

        renderLobbySlotsUI();
        renderLobbyColorPickerUI();
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
          if (isHost) {
            broadcastEvent('room_sync', roomState);
          }
        }
      },
      onGameStarted: (startedState) => {
        roomState = startedState;
        launchActiveGame();
      },
      onPlayerMove: (moveData) => {
        handleRemoteMove(moveData);
      },
      onWallPlaced: (wallData) => {
        handleRemoteWall(wallData);
      },
      onPlayAgain: (resetState) => {
        modalVictory.classList.remove('active');
        roomState = resetState;
        renderBoardState();
      }
    });

    if (!isHost) {
      joinTimeout = setTimeout(() => {
        if (roomState.players.length === 1 && !isHost) {
          if (joinRetryInterval) clearInterval(joinRetryInterval);
          showToast('Invalid room code. Please verify the code and try again.');
          showScreen(screens.joinLobby);
        }
      }, 6000);
    }
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
      p.wallsLeft = 10;
    });

    roomState.currentTurnIndex = 0;
    roomState.gameStarted = true;
    roomState.walls = [];

    broadcastEvent('game_started', roomState);
    launchActiveGame();
  });

  // --------------------------------------------------------------------------
  // 11x11 Game Engine & Rendering
  // --------------------------------------------------------------------------
  function launchActiveGame() {
    showScreen(screens.game);
    renderBoardState();
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

    roomState.players.forEach(p => {
      if (!p.pos) return;
      const cell = getCellElem(p.pos.r, p.pos.c);
      if (cell) {
        const marble = document.createElement('div');
        marble.className = `marble-sphere marble-${p.color}`;
        cell.appendChild(marble);
      }
    });

    renderPlacedWallsUI();
    updateTurnHeaderUI();
  }

  function renderPlacedWallsUI() {
    document.querySelectorAll('.wall-block').forEach(el => el.remove());

    const boardRect = boardGrid.getBoundingClientRect();
    const cellWidth = boardRect.width / GRID_SIZE;
    const cellHeight = boardRect.height / GRID_SIZE;

    roomState.walls.forEach(w => {
      const wallElem = document.createElement('div');
      wallElem.className = 'wall-block';

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

    const me = roomState.players.find(p => p.id === playerProfile.id);
    wallsCountVal.textContent = me ? me.wallsLeft : 10;
  }

  // --------------------------------------------------------------------------
  // Action Handlers
  // --------------------------------------------------------------------------
  function handleCellClick(r, c) {
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer || activePlayer.id !== playerProfile.id) {
      return;
    }

    const currPos = activePlayer.pos;
    const dr = Math.abs(r - currPos.r);
    const dc = Math.abs(c - currPos.c);

    // 1. Move Marble Action
    if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
      if (!isMoveBlocked(currPos.r, currPos.c, r, c, roomState.walls)) {
        activePlayer.pos = { r, c };
        
        broadcastEvent('player_move', {
          playerId: playerProfile.id,
          pos: { r, c },
          nextTurnIndex: (roomState.currentTurnIndex + 1) % roomState.players.length
        });

        advanceTurn((roomState.currentTurnIndex + 1) % roomState.players.length);
        renderBoardState();

        if (r === GOAL_POS.r && c === GOAL_POS.c) {
          triggerVictory(activePlayer);
        }
        return;
      }
    }

    // 2. Place Wall Action
    if (activePlayer.wallsLeft > 0) {
      const proposedWall = { r: Math.min(r, GRID_SIZE - 2), c: Math.min(c, GRID_SIZE - 2), orientation: wallPlacementState.orientation };
      const playerPositions = roomState.players.map(p => ({ id: p.id, pos: p.pos }));

      const check = isValidWallPlacement(proposedWall, roomState.walls, playerPositions);

      if (check.valid) {
        roomState.walls.push(proposedWall);
        activePlayer.wallsLeft--;

        const nextIndex = (roomState.currentTurnIndex + 1) % roomState.players.length;

        broadcastEvent('wall_placed', {
          wall: proposedWall,
          wallsLeft: activePlayer.wallsLeft,
          nextTurnIndex: nextIndex
        });

        advanceTurn(nextIndex);
        renderBoardState();
      } else {
        boardGrid.classList.add('shake-anim');
        showToast(check.reason || 'Invalid wall placement');
        setTimeout(() => boardGrid.classList.remove('shake-anim'), 400);
      }
    }
  }

  function handleCellHover(r, c) {
    wallPlacementState.hoverR = r;
    wallPlacementState.hoverC = c;
    renderWallPreview(r, c);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'e') {
      wallPlacementState.orientation = (wallPlacementState.orientation === 'H') ? 'V' : 'H';
      renderWallPreview(wallPlacementState.hoverR, wallPlacementState.hoverC);
    }
  });

  function renderWallPreview(r, c) {
    document.querySelectorAll('.wall-preview').forEach(el => el.remove());
    if (r < 0 || c < 0) return;

    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (!activePlayer || activePlayer.id !== playerProfile.id || activePlayer.wallsLeft <= 0) return;

    const wallR = Math.min(r, GRID_SIZE - 2);
    const wallC = Math.min(c, GRID_SIZE - 2);
    const proposedWall = { r: wallR, c: wallC, orientation: wallPlacementState.orientation };

    const boardRect = boardGrid.getBoundingClientRect();
    const cellWidth = boardRect.width / GRID_SIZE;
    const cellHeight = boardRect.height / GRID_SIZE;

    const previewElem = document.createElement('div');
    previewElem.className = 'wall-preview';

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
  }

  function handleRemoteMove(data) {
    const p = roomState.players.find(pl => pl.id === data.playerId);
    if (p) {
      p.pos = data.pos;
      advanceTurn(data.nextTurnIndex);
      renderBoardState();

      if (data.pos.r === GOAL_POS.r && data.pos.c === GOAL_POS.c) {
        triggerVictory(p);
      }
    }
  }

  function handleRemoteWall(data) {
    roomState.walls.push(data.wall);
    const activePlayer = roomState.players[roomState.currentTurnIndex];
    if (activePlayer) {
      activePlayer.wallsLeft = data.wallsLeft;
    }
    advanceTurn(data.nextTurnIndex);
    renderBoardState();
  }

  function triggerVictory(winner) {
    winnerTitle.textContent = `${winner.name} Wins!`;
    winnerSubtitle.textContent = `Stepped on the center golden goal (5, 5)!`;
    modalVictory.classList.add('active');

    if (window.confetti) {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }

  document.getElementById('btn-play-again').addEventListener('click', () => {
    const initialPositions = getOuterPerimeterSpawnPositions(roomState.players.length);
    roomState.players.forEach((p, idx) => {
      p.pos = initialPositions[idx];
      p.wallsLeft = 10;
    });

    roomState.walls = [];
    roomState.currentTurnIndex = 0;

    broadcastEvent('play_again', roomState);
    modalVictory.classList.remove('active');
    renderBoardState();
  });

  document.getElementById('btn-exit-game').addEventListener('click', () => {
    modalVictory.classList.remove('active');
    showScreen(screens.profile);
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
