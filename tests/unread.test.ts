import { describe, expect, it } from "vitest";

import { VISIT_GAP_MS, isUnread, nextVisit } from "../src/client/unread";

describe("unread markers", () => {
  it("starts a new visit after a long gap, keeps it across reloads and tabs", () => {
    expect(nextVisit(null, 1000)).toEqual({ since: 1000, lastSeen: 1000 }); // first visit: nothing is new
    const visit = { since: 100, lastSeen: 500 };
    expect(nextVisit(visit, 500 + VISIT_GAP_MS - 1)).toEqual({ since: 100, lastSeen: 500 + VISIT_GAP_MS - 1 });
    expect(nextVisit(visit, 500 + VISIT_GAP_MS + 1)).toEqual({ since: 500, lastSeen: 500 + VISIT_GAP_MS + 1 });
  });

  it("is unread when updated after the visit window and after it was last opened", () => {
    expect(isUnread(200, 100)).toBe(true);
    expect(isUnread(50, 100)).toBe(false);
    expect(isUnread(200, 100, 300)).toBe(false); // opened after the change
    expect(isUnread(undefined, 100)).toBe(false); // hub page or unknown
  });
});
