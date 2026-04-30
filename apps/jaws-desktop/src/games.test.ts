import { describe, expect, test } from "bun:test";
import {
  addHoldemChat,
  advanceHoldemRound,
  advanceSlowGuy,
  applyHoldemAction,
  createHoldemTable,
  createSlowGuyState,
  evaluateHoldemWinners,
  holdemCodeTokenPrize
} from "./games";

describe("Slow Guy mechanics", () => {
  test("moves lanes, collects score, and tracks best score", () => {
    let state = createSlowGuyState();
    state = advanceSlowGuy(state, "left");
    expect(state.lane).toBe(0);
    state = advanceSlowGuy(state, "right");
    expect(state.lane).toBe(1);
    state = advanceSlowGuy(state, "tick");
    expect(state.score).toBeGreaterThan(0);
    expect(state.bestScore).toBe(state.score);
  });

  test("requires the right move to clear hazards", () => {
    const base = {
      ...createSlowGuyState(),
      hazards: [{ id: "h", lane: 1, x: 20, type: "blocker" as const }],
      coins: []
    };
    const clipped = advanceSlowGuy(base, "tick");
    expect(clipped.gameOver).toBe(false);
    expect(clipped.lives).toBe(2);
    expect(clipped.shieldTicks).toBeGreaterThan(0);
    expect(advanceSlowGuy({ ...base, lives: 1 }, "tick").gameOver).toBe(true);
    const jumping = advanceSlowGuy(base, "jump");
    expect(advanceSlowGuy(jumping, "tick").gameOver).toBe(false);
  });

  test("collects code tokens, levels up, and reset preserves best score", () => {
    let state = createSlowGuyState(80);
    state = advanceSlowGuy(state, "dash");
    expect(state.stamina).toBeLessThan(100);
    state = advanceSlowGuy(
      {
        ...state,
        lane: 1,
        score: 158,
        hazards: [],
        coins: [{ id: "coin-test", lane: 1, x: 20 }]
      },
      "tick"
    );
    expect(state.tokens).toBe(1);
    expect(state.level).toBeGreaterThan(1);
    state = advanceSlowGuy({ ...state, bestScore: 220 }, "reset");
    expect(state.bestScore).toBe(220);
  });
});

describe("Hold'em roundtable foundation", () => {
  test("deals seats, community cards, and reaches showdown with winners", () => {
    let table = createHoldemTable("Gaetano", "test-seed");
    table = advanceHoldemRound(table);
    expect(table.phase).toBe("preflop");
    expect(table.seats[0]?.holeCards).toHaveLength(2);
    expect(table.currentBet).toBe(table.bigBlind);
    table = advanceHoldemRound(table);
    expect(table.phase).toBe("flop");
    expect(table.communityCards).toHaveLength(3);
    expect(table.currentBet).toBe(0);
    table = advanceHoldemRound(table);
    table = advanceHoldemRound(table);
    expect(table.phase).toBe("river");
    table = advanceHoldemRound(table);
    expect(table.phase).toBe("showdown");
    expect(table.winners.length).toBeGreaterThan(0);
  });

  test("evaluates known showdown winners with pokersolver", () => {
    const table = {
      ...createHoldemTable("Founder"),
      phase: "river" as const,
      communityCards: ["As", "Ks", "Qs", "Js", "2d"],
      seats: createHoldemTable("Founder").seats.map((seat, index) => ({
        ...seat,
        folded: index > 1,
        holeCards: index === 0 ? ["Ts", "3c"] : index === 1 ? ["Ah", "Ad"] : []
      }))
    };
    const winners = evaluateHoldemWinners(table);
    expect(winners).toEqual([
      expect.objectContaining({
        name: "Founder",
        hand: "Straight Flush"
      })
    ]);
  });

  test("keeps chat bounded and table scoped", () => {
    let table = createHoldemTable("Founder");
    for (let i = 0; i < 14; i += 1) {
      table = addHoldemChat(table, "Founder", `message ${i}`);
    }
    expect(table.chat.length).toBeLessThanOrEqual(11);
    expect(table.chat.at(-1)?.body).toBe("message 13");
  });

  test("supports hold, check, pass, bet, and raise actions with table-token accounting", () => {
    let table = advanceHoldemRound(createHoldemTable("Founder", "action-seed"));
    const startingPot = table.pot;
    const startingChips = table.seats[0]!.chips;

    table = applyHoldemAction(table, "seat-founder", "hold");
    expect(table.seats[0]!.chips).toBeLessThan(startingChips);
    expect(table.pot).toBeGreaterThan(startingPot);

    table = advanceHoldemRound(table);
    table = applyHoldemAction(table, "seat-founder", "check");
    expect(table.lastEvent).toContain("checks");

    table = applyHoldemAction(table, "seat-founder", "bet", 40);
    expect(table.currentBet).toBeGreaterThanOrEqual(40);
    expect(table.pot).toBeGreaterThan(startingPot);

    table = applyHoldemAction(table, "seat-founder", "raise", 40);
    expect(table.currentBet).toBeGreaterThanOrEqual(80);

    table = applyHoldemAction(table, "seat-q", "pass");
    table = applyHoldemAction(table, "seat-opencheek", "pass");
    expect(table.phase).toBe("showdown");
    expect(table.winners[0]?.seatId).toBe("seat-founder");
    expect(holdemCodeTokenPrize(table)).toBeGreaterThan(0);
  });
});
