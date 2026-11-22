import { describe, expect, it } from "vitest";
import { suggestEmail } from "@/lib/email-typo";

describe("suggestEmail", () => {
  it("catches a missing letter", () => {
    expect(suggestEmail("sam@gmai.com")).toBe("sam@gmail.com");
  });
  it("catches swapped letters and a wrong ending", () => {
    expect(suggestEmail("sam@gmial.com")).toBe("sam@gmail.com");
    expect(suggestEmail("sam@yahoo.con")).toBe("sam@yahoo.com");
  });
  it("leaves correct and unrelated addresses alone", () => {
    expect(suggestEmail("sam@gmail.com")).toBeNull();
    expect(suggestEmail("sam@me.com")).toBeNull();
    expect(suggestEmail("sam@example.org")).toBeNull();
    expect(suggestEmail("not-an-email")).toBeNull();
  });
});
