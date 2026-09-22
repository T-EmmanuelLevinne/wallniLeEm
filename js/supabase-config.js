/* ==========================================================================
   WallRush Realtime Messaging & Room Sync Layer
   ========================================================================== */

// Configurable Supabase credentials
let SUPABASE_URL = "https://llsvqtyhujpsvgwrpskp.supabase.co";
let SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3ZxdHlodWpwc3Znd3Jwc2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODk3MjUsImV4cCI6MjEwNTY2NTcyNX0.mn65Ro_e-bsMu_RfoXWa6oBGUdtHKPTouVp2ffYraLw";

let supabaseClient = null;
let currentChannel = null;

function initSupabase() {
  if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log("Supabase Realtime client initialized!");
    } catch (e) {
      console.warn("Supabase init warning:", e);
    }
  }
}

/**
 * Connects to a real-time room channel for WebSockets & Broadcasts
 */
function joinGameRoomChannel(roomCode, playerProfile, callbacks) {
  if (!supabaseClient) {
    initSupabase();
  }

  // Fallback to local multi-tab broadcast channel if live Supabase keys aren't added yet
  if (!supabaseClient) {
    console.log("Using BroadcastChannel fallback for multi-tab testing.");
    return initLocalBroadcastFallback(roomCode, playerProfile, callbacks);
  }

  const channelName = `wallrush_room_${roomCode}`;
  
  if (currentChannel) {
    supabaseClient.removeChannel(currentChannel);
  }

  currentChannel = supabaseClient.channel(channelName, {
    config: {
      broadcast: { ack: false, self: false },
      presence: { key: playerProfile.id }
    }
  });

  currentChannel
    .on('broadcast', { event: 'room_join_request' }, ({ payload }) => {
      if (callbacks.onRoomJoinRequest) callbacks.onRoomJoinRequest(payload);
    })
    .on('broadcast', { event: 'room_sync' }, ({ payload }) => {
      if (callbacks.onRoomSync) callbacks.onRoomSync(payload);
    })
    .on('broadcast', { event: 'player_color_changed' }, ({ payload }) => {
      if (callbacks.onPlayerColorChanged) callbacks.onPlayerColorChanged(payload);
    })
    .on('broadcast', { event: 'player_ready_changed' }, ({ payload }) => {
      if (callbacks.onPlayerReadyChanged) callbacks.onPlayerReadyChanged(payload);
    })
    .on('broadcast', { event: 'player_move' }, ({ payload }) => {
      if (callbacks.onPlayerMove) callbacks.onPlayerMove(payload);
    })
    .on('broadcast', { event: 'wall_placed' }, ({ payload }) => {
      if (callbacks.onWallPlaced) callbacks.onWallPlaced(payload);
    })
    .on('broadcast', { event: 'game_started' }, ({ payload }) => {
      if (callbacks.onGameStarted) callbacks.onGameStarted(payload);
    })
    .on('broadcast', { event: 'play_again' }, ({ payload }) => {
      if (callbacks.onPlayAgain) callbacks.onPlayAgain(payload);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log("Supabase channel subscribed:", channelName);
        await currentChannel.track(playerProfile);
        if (callbacks.onSubscribed) callbacks.onSubscribed();
      }
    });

  return currentChannel;
}

/**
 * Multi-tab BroadcastChannel implementation for offline / local testing
 */
let localBroadcast = null;

function initLocalBroadcastFallback(roomCode, playerProfile, callbacks) {
  const channelName = `wallrush_local_${roomCode}`;
  if (localBroadcast) {
    localBroadcast.close();
  }
  localBroadcast = new BroadcastChannel(channelName);

  localBroadcast.onmessage = (event) => {
    const { type, payload } = event.data;
    if (type === 'room_join_request' && callbacks.onRoomJoinRequest) callbacks.onRoomJoinRequest(payload);
    if (type === 'room_sync' && callbacks.onRoomSync) callbacks.onRoomSync(payload);
    if (type === 'player_color_changed' && callbacks.onPlayerColorChanged) callbacks.onPlayerColorChanged(payload);
    if (type === 'player_ready_changed' && callbacks.onPlayerReadyChanged) callbacks.onPlayerReadyChanged(payload);
    if (type === 'player_move' && callbacks.onPlayerMove) callbacks.onPlayerMove(payload);
    if (type === 'wall_placed' && callbacks.onWallPlaced) callbacks.onWallPlaced(payload);
    if (type === 'game_started' && callbacks.onGameStarted) callbacks.onGameStarted(payload);
    if (type === 'play_again' && callbacks.onPlayAgain) callbacks.onPlayAgain(payload);
  };

  setTimeout(() => {
    if (callbacks.onSubscribed) callbacks.onSubscribed();
  }, 50);

  return {
    send: ({ type, event, payload }) => {
      broadcastEvent(event, payload);
    }
  };
}

function broadcastEvent(event, payload) {
  if (currentChannel) {
    currentChannel.send({
      type: 'broadcast',
      event: event,
      payload: payload
    });
  } else if (localBroadcast) {
    localBroadcast.postMessage({ type: event, payload: payload });
  }
}
