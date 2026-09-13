/**
 * PATROL --sound/suspicion--> INVESTIGATE --timeout--> SEARCH --timeout--> PATROL
 * Any state --suspicion high + recent sound--> CHASE
 * CHASE --lost (low suspicion)--> SEARCH
 */
export function updateMonsterState(current, ctx) {
  const hasRecentSound = ctx.recentSounds.length > 0;
  const timeSinceHeard = ctx.now - (ctx.memory.lastHeardTime || 0);
  const sus = ctx.memory.suspicion;

  // Enter CHASE from any non-chase state
  if (current !== 'CHASE') {
    if (sus >= 70 && (hasRecentSound || timeSinceHeard < 4)) {
      return 'CHASE';
    }
    if (sus >= 90) return 'CHASE';
  }

  switch (current) {
    case 'PATROL':
    case 'IDLE':
      if (hasRecentSound || sus > 25) return 'INVESTIGATE';
      return current;

    case 'INVESTIGATE':
      if (hasRecentSound) return 'INVESTIGATE';
      if (timeSinceHeard > ctx.investigateTimeout) return 'SEARCH';
      if (sus < 5) return 'PATROL';
      return 'INVESTIGATE';

    case 'SEARCH':
      if (hasRecentSound) return 'INVESTIGATE';
      if (timeSinceHeard > ctx.searchTimeout) return 'PATROL';
      return 'SEARCH';

    case 'CHASE':
      if (sus < 30 && timeSinceHeard > 5) return 'SEARCH';
      if (sus < 15) return 'PATROL';
      return 'CHASE';

    default:
      return 'PATROL';
  }
}

export function pickSearchTarget(mem) {
  if (!mem.lastHeardPosition) return null;
  const r = mem.searchRadius * (0.3 + Math.random() * 0.7);
  const a = Math.random() * Math.PI * 2;
  return {
    x: mem.lastHeardPosition.x + Math.cos(a) * r,
    y: mem.lastHeardPosition.y,
    z: mem.lastHeardPosition.z + Math.sin(a) * r,
  };
}
