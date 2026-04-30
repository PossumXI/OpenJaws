import { describe, expect, test } from "bun:test";
import {
  addHoldemChat,
  advanceHoldemRound,
  advanceSlowGuy,
  createHoldemTable,
  createSlowGuyState,
  evaluateHoldemWinners
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
    expect(advanceSlowGuy(base, "tick").gameOver).toBe(true);
    const jumping = advanceSlowGuy(base, "jump");
    expect(advanceSlowGuy(jumping, "tick").gameOver).toBe(false);
  });

  test("dash spends stamina and reset preserves best score", () => {
    let state = createSlowGuyState(80);
    state = advanceSlowGuy(state, "dash");
    expect(state.stamina).toBeLessThan(100);
    state = advanceSlowGuy({ ...state, bestScore: 120 }, "reset");
    expect(state.bestScore).toBe(120);
  });
});

describe("Hold'em roundtable foundation", () => {
  test("deals seats, community cards, and reaches showdown with winners", () => {
    let table = createHoldemTable("Gaetano", "test-seed");
    table = advanceHoldemRound(table);
    expect(table.phase).toBe("preflop");
    expect(table.seats[0]?.holeCards).toHaveLength(2);
    table = advanceHoldemRound(table);
    expect(table.phase).toBe("flop");
    expect(table.communityCards).toHaveLength(3);
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
});
