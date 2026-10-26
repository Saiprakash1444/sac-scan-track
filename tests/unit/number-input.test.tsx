// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { NumberInput } from "@/components/NumberInput";

afterEach(cleanup);

/** Mirrors how the borrow form owns the value; the committed number is shown in a <output>. */
function Harness({
  initial = 1,
  min = 1,
  max = 8,
}: {
  initial?: number;
  min?: number;
  max?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="qty">Quantity</label>
      <NumberInput id="qty" min={min} max={max} value={value} onValueChange={setValue} />
      <output data-testid="committed">{value}</output>
      <button type="button">elsewhere</button>
    </>
  );
}

function setup(props?: Parameters<typeof Harness>[0]) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  const input = screen.getByLabelText("Quantity") as HTMLInputElement;
  const committed = () => Number(screen.getByTestId("committed").textContent);
  return { user, input, committed };
}

describe("NumberInput (borrow quantity regression)", () => {
  it("lets the default 1 be deleted and replaced with 3", async () => {
    const { user, input, committed } = setup();
    await user.click(input);
    await user.keyboard("{Backspace}");
    expect(input.value).toBe("");
    await user.keyboard("3");
    expect(input.value).toBe("3");
    expect(committed()).toBe(3);
  });

  it("caps a value above the stock limit at the limit", async () => {
    const { user, input, committed } = setup({ max: 8 });
    await user.clear(input);
    await user.type(input, "12");
    expect(input.value).toBe("8");
    expect(committed()).toBe(8);
  });

  it("replaces a multi-digit value", async () => {
    const { user, input, committed } = setup({ initial: 25, max: 90 });
    await user.clear(input);
    await user.type(input, "14");
    expect(committed()).toBe(14);
  });

  it("restores the last valid value when left empty", async () => {
    const { user, input, committed } = setup({ initial: 4 });
    await user.clear(input);
    await user.click(screen.getByText("elsewhere"));
    expect(input.value).toBe("4");
    expect(committed()).toBe(4);
  });

  it("never commits less than the minimum (0 → 1 on blur)", async () => {
    const { user, input, committed } = setup({ initial: 5 });
    await user.clear(input);
    await user.type(input, "0");
    expect(committed()).toBe(1);
    await user.click(screen.getByText("elsewhere"));
    expect(input.value).toBe("1");
  });

  it("floors decimals", async () => {
    const { user, input, committed } = setup();
    await user.clear(input);
    await user.type(input, "2.7");
    await user.click(screen.getByText("elsewhere"));
    expect(committed()).toBe(2);
    expect(input.value).toBe("2");
  });

  it("ignores non-numeric typing", async () => {
    const { user, input, committed } = setup({ initial: 3 });
    await user.type(input, "abc");
    expect(committed()).toBe(3);
  });

  it("re-syncs when the owner changes the value (e.g. stock drops)", async () => {
    function Shrinking() {
      const [max, setMax] = useState(8);
      const [value, setValue] = useState(6);
      return (
        <>
          <label htmlFor="q">Q</label>
          <NumberInput id="q" min={1} max={max} value={value} onValueChange={setValue} />
          <button
            type="button"
            onClick={() => {
              setMax(2);
              setValue((v) => Math.min(v, 2));
            }}
          >
            shrink
          </button>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Shrinking />);
    await user.click(screen.getByText("shrink"));
    expect((screen.getByLabelText("Q") as HTMLInputElement).value).toBe("2");
  });
});
