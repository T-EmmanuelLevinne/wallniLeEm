/* ==========================================================================
   WallRush Dynamic BFS Pathfinding Engine (Supports 11x11 & 13x13+)
   ========================================================================== */

let GRID_SIZE = 11;
let GOAL_POS = { r: 5, c: 5 };

/**
 * Sets grid dimensions dynamically (e.g. 11 for 2-4 players, 13 for 5-8 players)
 */
function setGridDimensions(size) {
  GRID_SIZE = size;
  GOAL_POS = { r: Math.floor(size / 2), c: Math.floor(size / 2) };
}

/**
 * Checks if a movement from (r1, c1) to (r2, c2) is blocked by any wall.
 */
function isMoveBlocked(r1, c1, r2, c2, walls) {
  // Determine movement direction
  const dr = r2 - r1;
  const dc = c2 - c1;

  for (const wall of walls) {
    // Horizontal wall placed at (wall.r, wall.c) blocks vertical movement between row wall.r and row wall.r + 1
    if (wall.orientation === 'H') {
      if (dr === 1 && r1 === wall.r && (c1 === wall.c || c1 === wall.c + 1)) return true; // Moving down
      if (dr === -1 && r2 === wall.r && (c1 === wall.c || c1 === wall.c + 1)) return true; // Moving up
    }
    // Vertical wall placed at (wall.r, wall.c) blocks horizontal movement between col wall.c and col wall.c + 1
    else if (wall.orientation === 'V') {
      if (dc === 1 && c1 === wall.c && (r1 === wall.r || r1 === wall.r + 1)) return true; // Moving right
      if (dc === -1 && c2 === wall.c && (r1 === wall.r || r1 === wall.r + 1)) return true; // Moving left
    }
  }

  return false;
}

/**
 * BFS algorithm to verify if a player can reach the goal.
 */
function hasPathToGoal(startPos, walls, gridSize, goalPos) {
  const gSize = gridSize || GRID_SIZE;
  const gPos = goalPos || GOAL_POS;

  if (startPos.r === gPos.r && startPos.c === gPos.c) return true;

  const visited = Array.from({ length: gSize }, () => Array(gSize).fill(false));
  const queue = [{ r: startPos.r, c: startPos.c }];
  visited[startPos.r][startPos.c] = true;

  const directions = [
    { dr: -1, dc: 0 }, // Up
    { dr: 1, dc: 0 },  // Down
    { dr: 0, dc: -1 }, // Left
    { dr: 0, dc: 1 }   // Right
  ];

  while (queue.length > 0) {
    const curr = queue.shift();

    if (curr.r === gPos.r && curr.c === gPos.c) {
      return true;
    }

    for (const d of directions) {
      const nr = curr.r + d.dr;
      const nc = curr.c + d.dc;

      // Check bounds
      if (nr >= 0 && nr < gSize && nc >= 0 && nc < gSize) {
        if (!visited[nr][nc]) {
          // Check if movement between curr and neighbor is blocked by a wall
          if (!isMoveBlocked(curr.r, curr.c, nr, nc, walls)) {
            visited[nr][nc] = true;
            queue.push({ r: nr, c: nc });
          }
        }
      }
    }
  }

  return false;
}

/**
 * Verifies if a proposed wall overlaps with existing walls or board borders.
 */
function isWallOverlapping(proposedWall, existingWalls, gridSize) {
  const gSize = gridSize || GRID_SIZE;

  // Check grid boundaries (walls span 2 cells)
  if (proposedWall.r < 0 || proposedWall.r >= gSize - 1 || proposedWall.c < 0 || proposedWall.c >= gSize - 1) {
    return true;
  }

  for (const wall of existingWalls) {
    // Exact same position
    if (wall.r === proposedWall.r && wall.c === proposedWall.c) {
      return true;
    }

    // Parallel overlapping walls
    if (wall.orientation === proposedWall.orientation) {
      if (wall.orientation === 'H' && wall.r === proposedWall.r) {
        if (Math.abs(wall.c - proposedWall.c) < 2) return true;
      }
      if (wall.orientation === 'V' && wall.c === proposedWall.c) {
        if (Math.abs(wall.r - proposedWall.r) < 2) return true;
      }
    }

    // Intersecting perpendicular walls at the exact center junction
    if (wall.orientation !== proposedWall.orientation) {
      if (wall.r === proposedWall.r && wall.c === proposedWall.c) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Master validation: Checks if placing a wall is legal and leaves ALL players a valid path to center goal.
 */
function isValidWallPlacement(proposedWall, existingWalls, playerPositions, gridSize, goalPos) {
  const gSize = gridSize || GRID_SIZE;
  const gPos = goalPos || GOAL_POS;

  // 1. Check boundary & overlap
  if (isWallOverlapping(proposedWall, existingWalls, gSize)) {
    return { valid: false, reason: 'Wall overlaps with an existing wall or border!' };
  }

  // 2. Simulate wall placement
  const simulatedWalls = [...existingWalls, proposedWall];

  // 3. Test BFS path to goal for ALL active players
  for (const p of playerPositions) {
    if (!p || !p.pos) continue;
    if (!hasPathToGoal(p.pos, simulatedWalls, gSize, gPos)) {
      return { valid: false, reason: 'Path to golden center goal must stay open for all players!' };
    }
  }

  return { valid: true };
}

// Export functions for browser / modular scope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GRID_SIZE, GOAL_POS, setGridDimensions, hasPathToGoal, isWallOverlapping, isValidWallPlacement, isMoveBlocked };
}
