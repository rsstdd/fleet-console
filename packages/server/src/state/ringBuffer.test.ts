import { describe, expect, it } from "vitest";

import { RingBuffer } from "./ringBuffer.ts";

describe("RingBuffer", () => {
  it("rejects a capacity that cannot hold history", () => {
    expect(() => new RingBuffer<number>(0)).toThrow(RangeError);
    expect(() => new RingBuffer<number>(-1)).toThrow(RangeError);
    expect(() => new RingBuffer<number>(2.5)).toThrow(RangeError);
  });

  it("returns entries oldest-first before it fills", () => {
    const buffer = new RingBuffer<number>(4);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);

    expect(buffer.size).toBe(3);
    expect(buffer.isFull).toBe(false);
    expect(buffer.toArray()).toEqual([1, 2, 3]);
  });

  it("discards the oldest entry on wraparound rather than growing", () => {
    const buffer = new RingBuffer<number>(3);
    for (const value of [1, 2, 3, 4, 5]) buffer.push(value);

    expect(buffer.size).toBe(3);
    expect(buffer.isFull).toBe(true);
    expect(buffer.toArray()).toEqual([3, 4, 5]);
  });

  it("stays ordered across several wraparounds", () => {
    const buffer = new RingBuffer<number>(3);
    for (let value = 0; value < 10; value += 1) buffer.push(value);

    expect(buffer.toArray()).toEqual([7, 8, 9]);
    expect(buffer.last()).toBe(9);
  });

  it("reports the newest entry without scanning history", () => {
    const buffer = new RingBuffer<string>(2);
    expect(buffer.last()).toBeUndefined();

    buffer.push("a");
    expect(buffer.last()).toBe("a");
    buffer.push("b");
    buffer.push("c");
    expect(buffer.last()).toBe("c");
  });

  it("empties without losing its capacity", () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);
    buffer.clear();

    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
    expect(buffer.capacity).toBe(3);

    buffer.push(9);
    expect(buffer.toArray()).toEqual([9]);
  });

  it("does not alias its internal storage to the caller", () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);

    const snapshot = buffer.toArray();
    buffer.push(2);

    expect(snapshot).toEqual([1]);
  });
});
