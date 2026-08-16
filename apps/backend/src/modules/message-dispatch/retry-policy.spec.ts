import { needsRetry } from "./retry-policy";

describe("needsRetry", () => {
  const baseConfig = {
    maxRetryAttempts: 2,
    retryOnCallStatuses: "5,6,7,8",
    retryOnConversationStatuses: "110,150,300",
    retryMinCallDurationSeconds: 10,
  } as any;

  it("is false when maxRetryAttempts is 0", () => {
    expect(needsRetry({ ...baseConfig, maxRetryAttempts: 0 }, 1, { callStatus: "7", conversationStatus: null, duration: null })).toBe(false);
  });

  it("is false once attempts are exhausted", () => {
    // maxRetryAttempts=2 allows attempt counts 1 and 2 to still retry (producing attempts 2 and 3)
    expect(needsRetry(baseConfig, 3, { callStatus: "7", conversationStatus: null, duration: null })).toBe(false);
  });

  it("is true when the call status matches the configured retry list", () => {
    expect(needsRetry(baseConfig, 1, { callStatus: "7", conversationStatus: null, duration: null })).toBe(true);
  });

  it("is true when the conversation status matches the configured retry list", () => {
    expect(needsRetry(baseConfig, 1, { callStatus: "4", conversationStatus: "110", duration: 60 })).toBe(true);
  });

  it("is true when the call duration is under the configured minimum", () => {
    expect(needsRetry(baseConfig, 1, { callStatus: "4", conversationStatus: "100", duration: 3 })).toBe(true);
  });

  it("is false when nothing about the call matches any configured condition", () => {
    expect(needsRetry(baseConfig, 1, { callStatus: "4", conversationStatus: "100", duration: 60 })).toBe(false);
  });

  it("ignores duration when retryMinCallDurationSeconds is unset", () => {
    expect(
      needsRetry({ ...baseConfig, retryMinCallDurationSeconds: null }, 1, {
        callStatus: "4",
        conversationStatus: "100",
        duration: 1,
      }),
    ).toBe(false);
  });
});
