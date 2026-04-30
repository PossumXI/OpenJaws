import { Hand } from "pokersolver";

export type SlowGuyAction = "tick" | "left" | "right" | "jump" | "duck" | "dash" | "pause" | "reset";
export type SlowGuyObstacleType = "blocker" | "drone" | "gate";

export interface SlowGuyHazard {
  id: string;
  lane: number;
  x: number;
  type: SlowGuyObstacleType;
}

export interface SlowGuyCoin {
  id: string;
  lane: number;
  x: number;
}

export interface SlowGuyState {
  running: boolean;
  gameOver: boolean;
  tick: number;
  lane: number;
  pose: "run" | "jump" | "duck" | "dash";
  poseTicks: number;
  score: number;
  bestScore: number;
  distance: number;
  combo: number;
  stamina: number;
  objective: string;
  hazards: SlowGuyHazard[];
  coins: SlowGuyCoin[];
  lastEvent: string;
}

export type HoldemPhase = "lobby" | "preflop" | "flop" | "turn" | "river" | "showdown";
export type HoldemSeatKind = "user" | "agent" | "open";

export interface HoldemSeat {
  id: string;
  name: string;
  kind: HoldemSeatKind;
  chips: number;
  currentBet: number;
  folded: boolean;
  connected: boolean;
  holeCards: string[];
  petName?: string;
  agentName?: string;
  secureScopes: string[];
}

export interface HoldemChatMessage {
  id: string;
  speaker: string;
  body: string;
  channel: "table" | "system" | "agent";
}

export interface HoldemWinner {
  seatId: string;
  name: string;
  hand: string;
  description: string;
}

export interface HoldemTableState {
  handId: number;
  phase: HoldemPhase;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  pot: number;
  communityCards: string[];
  deck: string[];
  seats: HoldemSeat[];
  winners: HoldemWinner[];
  chat: HoldemChatMessage[];
  multiplayer: {
    mode: "local-foundation" | "realtime-ready";
    roomCode: string;
    transport: "mock-room" | "secure-websocket";
    presence: string[];
  };
  sandbox: {
    world: "agent-pet-table";
    allowedAgentScopes: string[];
    pendingReview: string[];
  };
  lastEvent: string;
}

const suits = ["s", "h", "d", "c"];
const ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function seededValue(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function deterministicIndex(seed: string, modulo: number): number {
  return seededValue(seed) % modulo;
}

function makeDeck(seed = "jaws"): string[] {
  const deck = ranks.flatMap((rank) => suits.map((suit) => `${rank}${suit}`));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = deterministicIndex(`${seed}:${i}`, i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

function spawnHazard(tick: number): SlowGuyHazard {
  const type: SlowGuyObstacleType = tick % 11 === 0 ? "drone" : tick % 7 === 0 ? "gate" : "blocker";
  return {
    id: `hazard-${tick}`,
    lane: deterministicIndex(`hazard-lane-${tick}`, 3),
    x: 104,
    type
  };
}

function spawnCoin(tick: number): SlowGuyCoin {
  return {
    id: `coin-${tick}`,
    lane: deterministicIndex(`coin-lane-${tick}`, 3),
    x: 110
  };
}

export function createSlowGuyState(bestScore = 0): SlowGuyState {
  return {
    running: true,
    gameOver: false,
    tick: 0,
    lane: 1,
    pose: "run",
    poseTicks: 0,
    score: 0,
    bestScore,
    distance: 0,
    combo: 0,
    stamina: 100,
    objective: "Reach 500 points, collect tokens, and dodge blockers, drones, and gate lanes.",
    hazards: [spawnHazard(5)],
    coins: [spawnCoin(3)],
    lastEvent: "Run started. Use arrows, Space, S, and D."
  };
}

function canClearHazard(state: SlowGuyState, hazard: SlowGuyHazard): boolean {
  if (hazard.lane !== state.lane) return true;
  if (hazard.type === "blocker") return state.pose === "jump" || state.pose === "dash";
  if (hazard.type === "drone") return state.pose === "duck" || state.pose === "dash";
  return false;
}

export function advanceSlowGuy(state: SlowGuyState, action: SlowGuyAction): SlowGuyState {
  if (action === "reset") {
    return createSlowGuyState(state.bestScore);
  }
  if (action === "pause") {
    return {
      ...state,
      running: !state.running,
      lastEvent: state.running ? "Paused." : "Run resumed."
    };
  }
  if (state.gameOver) {
    return state;
  }

  if (action !== "tick") {
    if (action === "left") {
      return { ...state, lane: clamp(state.lane - 1, 0, 2), lastEvent: "Lane left." };
    }
    if (action === "right") {
      return { ...state, lane: clamp(state.lane + 1, 0, 2), lastEvent: "Lane right." };
    }
    if (action === "jump") {
      return { ...state, pose: "jump", poseTicks: 2, lastEvent: "Jump." };
    }
    if (action === "duck") {
      return { ...state, pose: "duck", poseTicks: 2, lastEvent: "Duck." };
    }
    if (action === "dash") {
      if (state.stamina < 22) return { ...state, lastEvent: "Dash needs stamina." };
      return {
        ...state,
        pose: "dash",
        poseTicks: 2,
        stamina: state.stamina - 22,
        score: state.score + 8,
        lastEvent: "Dash bonus."
      };
    }
  }

  if (!state.running) {
    return state;
  }

  const tick = state.tick + 1;
  const speed = 8 + Math.floor(tick / 42);
  const poseTicks = Math.max(0, state.poseTicks - 1);
  const pose = poseTicks > 0 ? state.pose : "run";
  let score = state.score + 2 + state.combo;
  let combo = state.combo;
  let lastEvent = "Keep moving.";
  const stamina = clamp(state.stamina + 2, 0, 100);

  const hazards = state.hazards
    .map((hazard) => ({ ...hazard, x: hazard.x - speed }))
    .filter((hazard) => hazard.x > -10);
  const coins = state.coins
    .map((coin) => ({ ...coin, x: coin.x - speed }))
    .filter((coin) => coin.x > -10);

  const collision = hazards.find((hazard) => hazard.x <= 18 && hazard.x >= 4 && !canClearHazard({ ...state, pose }, hazard));
  if (collision) {
    return {
      ...state,
      running: false,
      gameOver: true,
      tick,
      pose,
      poseTicks,
      hazards,
      coins,
      bestScore: Math.max(state.bestScore, state.score),
      lastEvent: `Hit a ${collision.type}. Reset to try again.`
    };
  }

  const collected = coins.filter((coin) => coin.x <= 18 && coin.x >= 4 && coin.lane === state.lane);
  if (collected.length > 0) {
    combo += collected.length;
    score += 25 * collected.length + combo * 4;
    lastEvent = `Collected ${collected.length} code token${collected.length === 1 ? "" : "s"}.`;
  }

  const nextHazards = hazards.filter((hazard) => hazard.x > 18 || !canClearHazard({ ...state, pose }, hazard));
  const nextCoins = coins.filter((coin) => !collected.some((hit) => hit.id === coin.id));
  if (tick % 8 === 0) nextHazards.push(spawnHazard(tick));
  if (tick % 5 === 0) nextCoins.push(spawnCoin(tick));

  return {
    ...state,
    tick,
    pose,
    poseTicks,
    score,
    bestScore: Math.max(state.bestScore, score),
    distance: state.distance + speed,
    combo,
    stamina,
    hazards: nextHazards,
    coins: nextCoins,
    lastEvent
  };
}

export function createHoldemTable(playerName = "Founder", seed = "jaws-holdem"): HoldemTableState {
  const deck = makeDeck(seed);
  return {
    handId: 1,
    phase: "lobby",
    dealerIndex: 0,
    smallBlind: 10,
    bigBlind: 20,
    pot: 0,
    communityCards: [],
    deck,
    winners: [],
    seats: [
      {
        id: "seat-founder",
        name: playerName || "Founder",
        kind: "user",
        chips: 1500,
        currentBet: 0,
        folded: false,
        connected: true,
        holeCards: [],
        petName: "Cyber Frog",
        secureScopes: ["chat", "pet-presence", "table-action"]
      },
      {
        id: "seat-q",
        name: "Q Dealer",
        kind: "agent",
        chips: 1500,
        currentBet: 0,
        folded: false,
        connected: true,
        holeCards: [],
        agentName: "Q",
        secureScopes: ["deal", "moderate-chat", "audit-log"]
      },
      {
        id: "seat-opencheek",
        name: "OpenCheek",
        kind: "agent",
        chips: 1500,
        currentBet: 0,
        folded: false,
        connected: true,
        holeCards: [],
        agentName: "OpenCheek",
        secureScopes: ["table-action", "agent-presence"]
      },
      {
        id: "seat-open",
        name: "Open PvP Seat",
        kind: "open",
        chips: 1500,
        currentBet: 0,
        folded: true,
        connected: false,
        holeCards: [],
        secureScopes: ["invite-required"]
      }
    ],
    multiplayer: {
      mode: "local-foundation",
      roomCode: "JAW-HOLD",
      transport: "mock-room",
      presence: ["Founder", "Q Dealer", "OpenCheek"]
    },
    sandbox: {
      world: "agent-pet-table",
      allowedAgentScopes: ["chat", "deal", "table-action", "pet-presence", "audit-log"],
      pendingReview: ["real-time websocket auth", "agent sandbox capability signing", "PvP credit boundary"]
    },
    chat: [
      {
        id: "chat-system-1",
        speaker: "JAWS Table",
        body: "Roundtable room staged. Multiplayer transport is mocked until secure websocket auth is wired.",
        channel: "system"
      }
    ],
    lastEvent: "Waiting for dealer."
  };
}

function postBlind(seat: HoldemSeat, amount: number): HoldemSeat {
  const blind = Math.min(seat.chips, amount);
  return {
    ...seat,
    chips: seat.chips - blind,
    currentBet: blind
  };
}

function dealHoleCards(table: HoldemTableState): HoldemTableState {
  const deck = [...table.deck];
  const activeSeats = table.seats.filter((seat) => seat.kind !== "open");
  const seats = table.seats.map((seat) => {
    if (seat.kind === "open") return { ...seat, holeCards: [], currentBet: 0, folded: true };
    return { ...seat, holeCards: [deck.shift()!, deck.shift()!], currentBet: 0, folded: false };
  });
  const smallBlindIndex = table.seats.findIndex((seat) => seat.id === activeSeats[1]?.id);
  const bigBlindIndex = table.seats.findIndex((seat) => seat.id === activeSeats[2]?.id);
  if (smallBlindIndex >= 0) seats[smallBlindIndex] = postBlind(seats[smallBlindIndex]!, table.smallBlind);
  if (bigBlindIndex >= 0) seats[bigBlindIndex] = postBlind(seats[bigBlindIndex]!, table.bigBlind);
  const pot = seats.reduce((total, seat) => total + seat.currentBet, 0);
  return {
    ...table,
    phase: "preflop",
    deck,
    seats,
    pot,
    communityCards: [],
    winners: [],
    lastEvent: "Hole cards dealt. Blinds posted."
  };
}

function dealCommunity(table: HoldemTableState, count: number, phase: HoldemPhase): HoldemTableState {
  const deck = [...table.deck];
  deck.shift(); // burn card
  const communityCards = [...table.communityCards, ...deck.splice(0, count)];
  return {
    ...table,
    phase,
    deck,
    communityCards,
    pot: table.pot + table.seats.filter((seat) => !seat.folded).length * 10,
    lastEvent: `${phase[0]!.toUpperCase()}${phase.slice(1)} dealt.`
  };
}

export function evaluateHoldemWinners(table: HoldemTableState): HoldemWinner[] {
  if (table.communityCards.length < 5) return [];
  const solved = table.seats
    .filter((seat) => !seat.folded && seat.holeCards.length === 2)
    .map((seat) => ({
      seat,
      hand: Hand.solve([...seat.holeCards, ...table.communityCards])
    }));
  const winningHands = Hand.winners(solved.map((entry) => entry.hand));
  return solved
    .filter((entry) => winningHands.includes(entry.hand))
    .map((entry) => ({
      seatId: entry.seat.id,
      name: entry.seat.name,
      hand: entry.hand.name,
      description: entry.hand.descr
    }));
}

export function advanceHoldemRound(table: HoldemTableState): HoldemTableState {
  if (table.phase === "lobby" || table.phase === "showdown") {
    return dealHoleCards({
      ...table,
      handId: table.phase === "showdown" ? table.handId + 1 : table.handId,
      deck: makeDeck(`jaws-holdem-${table.handId + 1}`),
      dealerIndex: (table.dealerIndex + (table.phase === "showdown" ? 1 : 0)) % 3
    });
  }
  if (table.phase === "preflop") return dealCommunity(table, 3, "flop");
  if (table.phase === "flop") return dealCommunity(table, 1, "turn");
  if (table.phase === "turn") return dealCommunity(table, 1, "river");
  const winners = evaluateHoldemWinners(table);
  return {
    ...table,
    phase: "showdown",
    winners,
    lastEvent: winners.length
      ? `Showdown: ${winners.map((winner) => `${winner.name} with ${winner.description}`).join(", ")}.`
      : "Showdown reached with no active winner."
  };
}

export function addHoldemChat(table: HoldemTableState, speaker: string, body: string): HoldemTableState {
  const trimmed = body.trim();
  if (!trimmed) return table;
  return {
    ...table,
    chat: [
      ...table.chat.slice(-10),
      {
        id: `chat-${table.handId}-${table.chat.length + 1}`,
        speaker,
        body: trimmed,
        channel: speaker.includes("Agent") ? "agent" : "table"
      }
    ],
    lastEvent: `${speaker} posted to the room.`
  };
}

export function describeCard(card: string): string {
  const rank = card[0] ?? "?";
  const suit = card[1] ?? "?";
  const rankName: Record<string, string> = {
    A: "Ace",
    K: "King",
    Q: "Queen",
    J: "Jack",
    T: "Ten"
  };
  const suitName: Record<string, string> = {
    s: "spades",
    h: "hearts",
    d: "diamonds",
    c: "clubs"
  };
  return `${rankName[rank] ?? rank} of ${suitName[suit] ?? suit}`;
}
