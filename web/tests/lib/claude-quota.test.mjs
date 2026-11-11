import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRateLimitLine, quotaFromStream } from "../../src/lib/claude-quota.mjs";

const LINE = JSON.stringify({
  type: "rate_limit_event",
  rate_limit_info: {
    status: "allowed",
    rateLimitType: "five_hour",
    unifiedWindows: {
      five_hour: { utilization: 0.83, resetsAt: 1794426000, status: "allowed" },
      seven_day: { utilization: 0.36, resetsAt: 1794722400, status: "allowed" },
    },
  },
});

test("lit les deux fenêtres du quota réel", () => {
  const q = parseRateLimitLine(LINE);
  assert.equal(q.fiveHour.percent, 83);
  assert.equal(q.sevenDay.percent, 36);
  assert.equal(q.fiveHour.resetsAt, 1794426000 * 1000);
  assert.equal(q.status, "allowed");
});

test("ignore les autres lignes et le JSON invalide", () => {
  assert.equal(parseRateLimitLine('{"type":"result"}'), null);
  assert.equal(parseRateLimitLine('{"type":"rate_limit_event"'), null);
  assert.equal(parseRateLimitLine(JSON.stringify({ type: "rate_limit_event", rate_limit_info: {} })), null);
});

test("ancien format à fenêtre unique", () => {
  const q = parseRateLimitLine(
    JSON.stringify({ type: "rate_limit_event", rate_limit_info: { rateLimitType: "seven_day", utilization: 0.5 } }),
  );
  assert.equal(q.fiveHour, null);
  assert.equal(q.sevenDay.percent, 50);
});

test("garde le dernier quota d'un flux", () => {
  const later = LINE.replace("0.83", "0.9");
  const q = quotaFromStream(`{"type":"system"}\n${LINE}\n${later}\n{"type":"result"}`);
  assert.equal(q.fiveHour.percent, 90);
});
