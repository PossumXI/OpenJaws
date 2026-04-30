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
  lives: number;
  level: number;
  combo: number;
  stamina: number;
  tokens: number;
  shieldTicks: number;
  objective: string;
  hazards: SlowGuyHazard[];
  coins: SlowGuyCoin[];
  lastEvent: string;
}

export type HoldemPhase = "lobby" | "preflop" | "flop" | "turn" | "river" | "showdown";
export type HoldemSeatKind = "user" | "agent" | "open";
export type HoldemAction = "hold" | "check" | "pass" | "bet" | "raise";

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
  currentBet: number;
  minimumRaise: number;
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
    lives: 3,
    level: 1,
    combo: 0,
    stamina: 100,
    tokens: 0,
    shieldTicks: 0,
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
  const speed = 7 + state.level + Math.floor(tick / 54);
  const poseTicks = Math.max(0, state.poseTicks - 1);
  const pose = poseTicks > 0 ? state.pose : "run";
  let score = state.score + 2 + state.combo;
  let combo = state.combo;
  let tokens = state.tokens;
  let shieldTicks = Math.max(0, state.shieldTicks - 1);
  let lastEvent = "Keep moving.";
  const stamina = clamp(state.stamina + 2, 0, 100);

  const hazards = state.hazards
    .map((hazard) => ({ ...hazard, x: hazard.x - speed }))
    .filter((hazard) => hazard.x > -10);
  const coins = state.coins
    .map((coin) => ({ ...coin, x: coin.x - speed }))
    .filter((coin) => coin.x > -10);

  const collision =
    shieldTicks === 0
      ? hazards.find((hazard) => hazard.x <= 18 && hazard.x >= 4 && !canClearHazard({ ...state, pose }, hazard))
      : undefined;
  if (collision) {
    const lives = state.lives - 1;
    const escapedHazards = hazards.filter((hazard) => hazard.id !== collision.id);
    if (lives > 0) {
      return {
        ...state,
        running: true,
        gameOver: false,
        tick,
        pose,
        poseTicks,
        score: Math.max(0, score - 15),
        bestScore: Math.max(state.bestScore, score),
        distance: state.distance + speed,
        lives,
        combo: 0,
        stamina,
        shieldTicks: 8,
        hazards: escapedHazards,
        coins,
        lastEvent: `Clipped a ${collision.type}. Shield is up; ${lives} ${lives === 1 ? "life" : "lives"} left.`
      };
    }

    return {
      ...state,
      running: false,
      gameOver: true,
      tick,
      pose,
      poseTicks,
      hazards: escapedHazards,
      coins,
      lives: 0,
      shieldTicks,
      bestScore: Math.max(state.bestScore, score),
      lastEvent: `Hit a ${collision.type}. Reset to try again.`
    };
  }

  const collected = coins.filter((coin) => coin.x <= 18 && coin.x >= 4 && coin.lane === state.lane);
  if (collected.length > 0) {
    combo += collected.length;
    tokens += collected.length;
    score += 25 * collected.length + combo * 4;
    lastEvent = `Collected ${collected.length} code token${collected.length === 1 ? "" : "s"}.`;
  }

  const nextHazards = hazards.filter((hazard) => hazard.x > 18 || !canClearHazard({ ...state, pose }, hazard));
  const nextCoins = coins.filter((coin) => !collected.some((hit) => hit.id === coin.id));
  if (tick % 8 === 0) nextHazards.push(spawnHazard(tick));
  if (tick % 5 === 0) nextCoins.push(spawnCoin(tick));
  const level = clamp(1 + Math.floor(score / 160), 1, 9);
  const objective =
    score >= 500
      ? "Objective cleared. Keep banking code tokens and raise the best score."
      : `Reach 500 points. Level ${level} speed is active.`;

  return {
    ...state,
    tick,
    pose,
    poseTicks,
    score,
    bestScore: Math.max(state.bestScore, score),
    distance: state.distance + speed,
    level,
    combo,
    stamina,
    tokens,
    shieldTicks,
    objective,
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
    currentBet: 0,
    minimumRaise: 20,
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

function appendTableLog(
  table: HoldemTableState,
  speaker: string,
  body: string,
  channel: HoldemChatMessage["channel"] = "system",
): HoldemChatMessage[] {
  return [
    ...table.chat.slice(-10),
    {
      id: `chat-${table.handId}-${table.chat.length + 1}`,
      speaker,
      body,
      channel
    }
  ];
}

function commitSeatChips(seat: HoldemSeat, amount: number): { seat: HoldemSeat; committed: number } {
  const committed = clamp(Math.round(amount), 0, seat.chips);
  return {
    seat: {
      ...seat,
      chips: seat.chips - committed,
      currentBet: seat.currentBet + committed
    },
    committed
  };
}

function activeHoldemSeats(seats: HoldemSeat[]): HoldemSeat[] {
  return seats.filter((seat) => seat.connected && seat.kind !== "open" && !seat.folded);
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
    currentBet: table.bigBlind,
    minimumRaise: table.bigBlind,
    communityCards: [],
    winners: [],
    chat: appendTableLog(table, "Q Dealer", "Hole cards dealt. Blinds posted.", "agent"),
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
    currentBet: 0,
    minimumRaise: table.bigBlind,
    seats: table.seats.map((seat) => ({ ...seat, currentBet: 0 })),
    chat: appendTableLog(table, "Q Dealer", `${phase[0]!.toUpperCase()}${phase.slice(1)} dealt.`, "agent"),
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
      dealerIndex: (table.dealerIndex + (table.phase === "showdown" ? 1 : 0)) % 3,
      currentBet: 0,
      minimumRaise: table.bigBlind,
      pot: 0
    });
  }
  if (table.phase === "preflop") return dealCommunity(table, 3, "flop");
  if (table.phase === "flop") return dealCommunity(table, 1, "turn");
  if (table.phase === "turn") return dealCommunity(table, 1, "river");
  const winners = evaluateHoldemWinners(table);
  const splitPot = winners.length ? Math.floor(table.pot / winners.length) : 0;
  const seats = table.seats.map((seat) =>
    winners.some((winner) => winner.seatId === seat.id)
      ? { ...seat, chips: seat.chips + splitPot, currentBet: 0 }
      : { ...seat, currentBet: 0 }
  );
  return {
    ...table,
    phase: "showdown",
    winners,
    currentBet: 0,
    seats,
    chat: appendTableLog(
      table,
      "Q Dealer",
      winners.length
        ? `Showdown settled. ${winners.map((winner) => winner.name).join(", ")} split ${table.pot} table tokens.`
        : "Showdown reached with no active winner.",
      "agent"
    ),
    lastEvent: winners.length
      ? `Showdown: ${winners.map((winner) => `${winner.name} with ${winner.description}`).join(", ")}.`
      : "Showdown reached with no active winner."
  };
}

function settleFoldWin(table: HoldemTableState, winner: HoldemSeat): HoldemTableState {
  const winners = [
    {
      seatId: winner.id,
      name: winner.name,
      hand: "Fold Win",
      description: "last active player after the table passed"
    }
  ];
  return {
    ...table,
    phase: "showdown",
    currentBet: 0,
    seats: table.seats.map((seat) =>
      seat.id === winner.id
        ? { ...seat, chips: seat.chips + table.pot, currentBet: 0 }
        : { ...seat, currentBet: 0 }
    ),
    winners,
    chat: appendTableLog(table, "Q Dealer", `${winner.name} wins ${table.pot} table tokens after passes.`, "agent"),
    lastEvent: `${winner.name} wins the hand after the table passed.`
  };
}

function applyAgentResponses(table: HoldemTableState): HoldemTableState {
  if (table.phase === "lobby" || table.phase === "showdown" || table.currentBet <= 0) return table;

  let pot = table.pot;
  let event = table.lastEvent;
  const seats = table.seats.map((seat) => {
    if (seat.kind !== "agent" || seat.folded || !seat.connected || seat.currentBet >= table.currentBet) {
      return seat;
    }
    const needed = table.currentBet - seat.currentBet;
    if (needed > seat.chips && seat.chips < table.bigBlind) {
      event = `${event} ${seat.name} passes.`;
      return { ...seat, folded: true };
    }
    const committed = commitSeatChips(seat, needed);
    pot += committed.committed;
    event = `${event} ${seat.name} holds for ${committed.committed}.`;
    return committed.seat;
  });

  const activeSeats = activeHoldemSeats(seats);
  if (activeSeats.length === 1) {
    return settleFoldWin({ ...table, seats, pot, lastEvent: event }, activeSeats[0]!);
  }

  return {
    ...table,
    seats,
    pot,
    lastEvent: event,
    chat: appendTableLog(table, "Q Dealer", event, "agent")
  };
}

export function applyHoldemAction(
  table: HoldemTableState,
  seatId: string,
  action: HoldemAction,
  amount = table.bigBlind,
): HoldemTableState {
  if (table.phase === "lobby" || table.phase === "showdown") {
    return {
      ...table,
      lastEvent: table.phase === "lobby" ? "Deal the hand before acting." : "Start the next hand before acting."
    };
  }

  const seatIndex = table.seats.findIndex((seat) => seat.id === seatId);
  const seat = table.seats[seatIndex];
  if (!seat || seat.kind === "open" || seat.folded || !seat.connected) {
    return { ...table, lastEvent: "That seat cannot act right now." };
  }

  if (action === "pass") {
    const seats = table.seats.map((candidate) =>
      candidate.id === seat.id ? { ...candidate, folded: true, currentBet: 0 } : candidate
    );
    const activeSeats = activeHoldemSeats(seats);
    const next = {
      ...table,
      seats,
      lastEvent: `${seat.name} passed and folded.`
    };
    return activeSeats.length === 1 ? settleFoldWin(next, activeSeats[0]!) : next;
  }

  let nextSeats = [...table.seats];
  let pot = table.pot;
  let currentBet = table.currentBet;
  let minimumRaise = table.minimumRaise;
  let lastEvent = table.lastEvent;

  if (action === "check") {
    if (seat.currentBet < currentBet) {
      return {
        ...table,
        lastEvent: `${seat.name} cannot check into ${currentBet}. Hold/call, raise, or pass.`
      };
    }
    lastEvent = `${seat.name} checks.`;
  }

  if (action === "hold") {
    const needed = Math.max(0, currentBet - seat.currentBet);
    if (needed > 0) {
      const committed = commitSeatChips(seat, needed);
      nextSeats[seatIndex] = committed.seat;
      pot += committed.committed;
      lastEvent = `${seat.name} holds and calls ${committed.committed}.`;
    } else {
      lastEvent = `${seat.name} holds.`;
    }
  }

  if (action === "bet") {
    if (currentBet > 0) {
      return {
        ...table,
        lastEvent: `${seat.name} cannot open a bet while ${currentBet} is already live. Raise or hold instead.`
      };
    }
    const wager = clamp(Math.round(amount), table.bigBlind, seat.chips);
    const committed = commitSeatChips(seat, wager);
    nextSeats[seatIndex] = committed.seat;
    pot += committed.committed;
    currentBet = committed.seat.currentBet;
    minimumRaise = table.bigBlind;
    lastEvent = `${seat.name} bets ${committed.committed}.`;
  }

  if (action === "raise") {
    const raiseBy = clamp(Math.round(amount), minimumRaise, seat.chips);
    const targetBet = currentBet + raiseBy;
    const needed = Math.max(0, targetBet - seat.currentBet);
    const committed = commitSeatChips(seat, needed);
    nextSeats[seatIndex] = committed.seat;
    pot += committed.committed;
    currentBet = Math.max(currentBet, committed.seat.currentBet);
    minimumRaise = Math.max(table.bigBlind, raiseBy);
    lastEvent = `${seat.name} raises ${raiseBy}.`;
  }

  return applyAgentResponses({
    ...table,
    seats: nextSeats,
    pot,
    currentBet,
    minimumRaise,
    lastEvent,
    chat: appendTableLog(table, seat.name, lastEvent, seat.kind === "agent" ? "agent" : "table")
  });
}

export function holdemCodeTokenPrize(table: HoldemTableState, seatId = "seat-founder"): number {
  if (table.phase !== "showdown") return 0;
  if (table.winners.some((winner) => winner.seatId === seatId)) {
    return clamp(18 + Math.floor(table.pot / 100), 18, 60);
  }
  return 4;
}

export function addHoldemChat(table: HoldemTableState, speaker: string, body: string): HoldemTableState {
  const trimmed = body.trim();
  if (!trimmed) return table;
  return {
    ...table,
    chat: appendTableLog(table, speaker, trimmed, speaker.includes("Agent") ? "agent" : "table"),
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
