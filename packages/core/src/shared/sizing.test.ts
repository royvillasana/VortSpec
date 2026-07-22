import { describe, it, expect } from "vitest";
import { detectSizeMode, sizeModeCss, isMainAxis } from "./sizing";

describe("isMainAxis", () => {
  it("width is main in a row, height is main in a column", () => {
    expect(isMainAxis("width", "row")).toBe(true);
    expect(isMainAxis("height", "row")).toBe(false);
    expect(isMainAxis("height", "column")).toBe(true);
    expect(isMainAxis("width", "column")).toBe(false);
    expect(isMainAxis("width", "block")).toBe(false);
  });
});

describe("detectSizeMode", () => {
  it("reads Fixed from an explicit px value", () => {
    expect(detectSizeMode("width", { width: "240px", "flex-grow": "0" }, "row")).toBe("fixed");
  });
  it("reads Hug from auto/fit-content", () => {
    expect(detectSizeMode("width", { width: "auto" }, "row")).toBe("hug");
    expect(detectSizeMode("height", { height: "fit-content" }, "column")).toBe("hug");
  });
  it("reads Fill from flex-grow on the MAIN axis", () => {
    expect(detectSizeMode("width", { width: "auto", "flex-grow": "1" }, "row")).toBe("fill");
    // grow doesn't imply fill on the CROSS axis
    expect(detectSizeMode("height", { height: "auto", "flex-grow": "1" }, "row")).toBe("hug");
  });
  it("reads Fill from align-self:stretch on the CROSS axis", () => {
    expect(detectSizeMode("height", { height: "auto", "align-self": "stretch" }, "row")).toBe("fill");
  });
  it("reads Fill from 100% under a block parent", () => {
    expect(detectSizeMode("width", { width: "100%" }, "block")).toBe("fill");
  });
  it("reads Fill when a block child's px-resolved width spans the parent content box", () => {
    // getComputedStyle resolves w-full to px, never "100%" — detect Fill by geometry.
    expect(detectSizeMode("width", { width: "1083px" }, "block", { size: 1083, parentContent: 1083 })).toBe("fill");
    // A genuinely fixed, narrower child stays Fixed.
    expect(detectSizeMode("width", { width: "400px" }, "block", { size: 400, parentContent: 1083 })).toBe("fixed");
    // Height doesn't fill by default in block flow even when it happens to match.
    expect(detectSizeMode("height", { height: "172px" }, "block", { size: 172, parentContent: 172 })).toBe("fixed");
  });
});

describe("sizeModeCss", () => {
  it("Fixed keeps the px value and pins flex on the main axis", () => {
    expect(sizeModeCss("width", "fixed", "row", "180px")).toMatchObject({ width: "180px", "flex-grow": "0", "flex-shrink": "0" });
  });
  it("Hug sizes to content", () => {
    expect(sizeModeCss("width", "hug", "row")).toMatchObject({ width: "fit-content", "flex-grow": "0" });
    expect(sizeModeCss("height", "hug", "column")).toMatchObject({ height: "fit-content" });
  });
  it("Fill on the main axis grows the flex item", () => {
    expect(sizeModeCss("width", "fill", "row")).toMatchObject({ width: "auto", "flex-grow": "1", "flex-basis": "0%" });
  });
  it("Fill on the cross axis stretches", () => {
    expect(sizeModeCss("height", "fill", "row")).toMatchObject({ "align-self": "stretch", height: "auto" });
  });
  it("Fill under a block parent is 100%", () => {
    expect(sizeModeCss("width", "fill", "block")).toEqual({ width: "100%" });
  });
});
