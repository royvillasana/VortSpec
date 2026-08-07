import { describe, it, expect } from "vitest";
import { electWriter, shouldWrite, shouldWriteOnLeave } from "./live-writer";

describe("exactly one participant writes", () => {
  it("elects the lowest client id", () => {
    expect(electWriter([7, 3, 9])).toBe(3);
  });

  it("gives every participant the SAME answer without them talking", () => {
    // The property the whole approach rests on. Anything that had to be negotiated could disagree,
    // and two participants who disagree about the writer either both write or neither does.
    const ids = [42, 7, 19, 3];
    const answers = ids.map((me) => electWriter([...ids].sort(() => 0)) === me);
    expect(answers.filter(Boolean)).toHaveLength(1);
  });

  it("does not depend on the order the ids arrive in", () => {
    expect(electWriter([9, 3, 7])).toBe(electWriter([3, 7, 9]));
    expect(electWriter([7, 9, 3])).toBe(electWriter([3, 9, 7]));
  });

  it("re-elects when the writer leaves, with nothing to run", () => {
    const before = [3, 7, 9];
    expect(electWriter(before)).toBe(3);
    // 3 disconnects: awareness drops the entry and the next tick answers 7. No procedure, no timer.
    expect(electWriter([7, 9])).toBe(7);
  });

  it("has no writer in an empty room", () => {
    expect(electWriter([])).toBeNull();
  });

  it("ignores a malformed id rather than electing it", () => {
    expect(electWriter([Number.NaN, 5, 8])).toBe(5);
  });
});

describe("who writes, in practice", () => {
  it("a solo editor always writes", () => {
    // The projects that never configure a relay must behave exactly as before — the feature absent,
    // not merely quiet.
    expect(shouldWrite({ live: false, clientIds: [], myClientId: null })).toBe(true);
    expect(shouldWrite({ live: false, clientIds: [3, 7], myClientId: 7 })).toBe(true);
  });

  it("in a session, only the elected participant writes", () => {
    expect(shouldWrite({ live: true, clientIds: [3, 7, 9], myClientId: 3 })).toBe(true);
    expect(shouldWrite({ live: true, clientIds: [3, 7, 9], myClientId: 7 })).toBe(false);
    expect(shouldWrite({ live: true, clientIds: [3, 7, 9], myClientId: 9 })).toBe(false);
  });

  it("exactly one of them writes — never zero", () => {
    // Zero writers is the dangerous direction: everyone assumes somebody else has it and the file
    // is never written at all.
    const ids = [11, 4, 88, 23];
    const writers = ids.filter((me) => shouldWrite({ live: true, clientIds: ids, myClientId: me }));
    expect(writers).toHaveLength(1);
  });

  it("writes rather than staying silent when it has no identity yet", () => {
    // Mid-connection there is no client id. Behaving as if solo risks a duplicate write; behaving as
    // a passenger risks no write at all, and only one of those loses work.
    expect(shouldWrite({ live: true, clientIds: [3], myClientId: null })).toBe(true);
  });
});

describe("leaving", () => {
  it("writes on the way out when it holds unsaved work", () => {
    // Not being the writer is not permission to lose an afternoon because someone else's laptop
    // closed first. Writing the same converged content twice is harmless.
    expect(shouldWriteOnLeave(true)).toBe(true);
  });

  it("writes nothing when there is nothing to write", () => {
    expect(shouldWriteOnLeave(false)).toBe(false);
  });
});
