import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceBreakdown } from "../components/ui/PriceBreakdown";
import { load } from "./auth-harness";

test("a price summary renders each supplied financial value once without recalculating it", () => {
  const html = renderToStaticMarkup(createElement(PriceBreakdown, { total: 900, fee: 90, workerNet: 810 }));
  assert.equal((html.match(/KSh 900/g) ?? []).length, 1);
  assert.equal((html.match(/KSh 90</g) ?? []).length, 1);
  assert.equal((html.match(/KSh 810/g) ?? []).length, 1);
  assert.ok(html.includes("<dl>")); assert.ok(html.includes("COPIC fee included"));
});
test("a proposed price breakdown retains individual extras and the explicitly supplied total", () => {
  const html = renderToStaticMarkup(createElement(PriceBreakdown, { lines: [{ label: "Cornrows", amount: 700 }, { label: "Washing", amount: 100 }, { label: "Drying", amount: 100 }], totalLabel: "Proposed client total", total: 900, fee: 90, workerNet: 810, note: "Maximum budget: KSh 1,000" }));
  for (const text of ["Cornrows", "Washing", "Drying", "Proposed client total", "Maximum budget: KSh 1,000"]) assert.ok(html.includes(text));
  assert.equal((html.match(/KSh 900/g) ?? []).length, 1);
});

async function dialogFixture() {
  type Keyboard = { key: string; shiftKey?: boolean; prevented?: boolean; preventDefault: () => void; stopPropagation: () => void };
  const effects: Array<() => (() => void) | undefined> = [], frames: Array<() => void> = [];
  const handlers = new Set<(event: Keyboard) => void>();
  const focusState: { element: Element | null } = { element: null };
  class Element {
    isConnected = true;
    visible = true;
    controls: Element[] = [];
    focus() { focusState.element = this; }
    getClientRects() { return this.visible ? [{}] : []; }
    closest() { return null; }
    contains(element: Element) { return element === this || this.controls.includes(element); }
    querySelectorAll() { return this.controls; }
  }
  const outside = new Element(), first = new Element(), last = new Element(), root = new Element();
  root.controls = [first, last]; focusState.element = outside;
  const dialogs = [root], body = { style: { overflow: "auto" } };
  const doc = { body, get activeElement() { return focusState.element; }, querySelectorAll: () => dialogs, addEventListener: (_name: string, handler: (event: Keyboard) => void) => handlers.add(handler), removeEventListener: (_name: string, handler: (event: Keyboard) => void) => handlers.delete(handler) };
  const fixtureModule = await load("hooks/useDialogFocus.ts", { react: { useRef: (value: unknown) => ({ current: value }), useEffect: (effect: () => (() => void) | undefined) => effects.push(effect) } }, { document: doc, HTMLElement: Element, requestAnimationFrame: (callback: () => void) => { frames.push(callback); return 1; }, cancelAnimationFrame: () => {} });
  let closed = 0;
  const ref = fixtureModule.useDialogFocus(true, () => closed++); ref.current = root;
  const cleanups = effects.map(effect => effect()); frames.forEach(frame => frame());
  const key = (value: string, shiftKey = false) => { const event: Keyboard = { key: value, shiftKey, preventDefault() { this.prevented = true; }, stopPropagation() {} }; handlers.forEach(handler => handler(event)); return event; };
  return { root, first, last, outside, dialogs, body, key, get active() { return focusState.element; }, get closed() { return closed; }, cleanup: () => cleanups.forEach(cleanup => cleanup?.()) };
}
test("dialogs focus their first control, contain keyboard traversal, dismiss on Escape and restore focus", async () => {
  const fixture = await dialogFixture();
  assert.equal(fixture.active, fixture.first); assert.equal(fixture.body.style.overflow, "hidden");
  fixture.last.focus(); assert.equal(fixture.key("Tab").prevented, true); assert.equal(fixture.active, fixture.first);
  fixture.key("Tab", true); assert.equal(fixture.active, fixture.last);
  fixture.key("Escape"); assert.equal(fixture.closed, 1);
  fixture.cleanup(); assert.equal(fixture.active, fixture.outside); assert.equal(fixture.body.style.overflow, "auto");
});
test("an outer dialog leaves keyboard input to an open nested dialog", async () => {
  const fixture = await dialogFixture(); fixture.dialogs.push(fixture.first);
  fixture.key("Escape"); assert.equal(fixture.closed, 0);
  fixture.dialogs.pop(); fixture.key("Escape"); assert.equal(fixture.closed, 1);
  fixture.cleanup();
});
