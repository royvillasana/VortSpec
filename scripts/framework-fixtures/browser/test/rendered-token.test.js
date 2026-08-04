import { expect } from '@esm-bundle/chai';

/**
 * The half of the verify gate that has never existed: what the browser ACTUALLY PAINTS.
 *
 * Honey measured Figma `#CEE4E9` against a component emitting `var(--color-neutral-100)`
 * (`#F8F9FA`) and correctly labelled it specified-value evidence, not a pixel diff. Layer 2 asks
 * "is it a var()?" and cannot ask "is it the RIGHT var()?", so the wrong binding survives every
 * check we have. `getComputedStyle` resolves the cascade the way the user's screen does, which is
 * the first measurement in this repo that can tell those two apart.
 */
const FIGMA_SPEC = 'rgb(206, 228, 233)';   // #CEE4E9
const WRONG_GLOBAL = 'rgb(248, 249, 250)'; // #F8F9FA

let sheetsLoaded = false;
async function loadStyles() {
  if (sheetsLoaded) return;
  for (const href of ['/src/tokens.css', '/src/accordion.css']) {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
    const done = new Promise((res, rej) => { link.onload = res; link.onerror = rej; });
    document.head.appendChild(link);
    await done;
  }
  sheetsLoaded = true;
}

function render(className) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = 'header';
  document.body.appendChild(el);
  return el;
}

const bg = (el) => getComputedStyle(el).backgroundColor;

describe('rendered token identity — what Layer 2 cannot see', () => {
  beforeEach(loadStyles);
  afterEach(() => { document.body.innerHTML = ''; });

  it('B0: the harness can report a MATCH — as-designed renders the Figma value', () => {
    // FALSE POLARITY. Without this an always-mismatch harness passes every other case
    // and proves nothing. This is the one that must come back equal.
    expect(bg(render('header-as-designed'))).to.equal(FIGMA_SPEC);
  });

  it('B1: as-built renders the WRONG colour — the defect, in a browser', () => {
    const painted = bg(render('header-as-built'));
    expect(painted).to.equal(WRONG_GLOBAL);
    expect(painted).to.not.equal(FIGMA_SPEC);
  });

  it('B2: both are syntactically var() — so a syntax check cannot separate them', () => {
    // The Layer-2 blind spot, demonstrated rather than asserted: the two components differ in
    // rendered output while being indistinguishable to "does every colour use var()?".
    const built = bg(render('header-as-built'));
    const designed = bg(render('header-as-designed'));
    expect(built).to.not.equal(designed);
  });

  it('B3: a MISSING token renders as nothing, not as an error', () => {
    // `var(--never-defined)` is valid CSS. The property falls back to its initial value, so a
    // missing component token paints transparent and reports no failure anywhere — which is why
    // the build must fail loudly at bind time rather than relying on anything downstream noticing.
    const painted = bg(render('header-missing-token'));
    expect(painted).to.be.oneOf(['rgba(0, 0, 0, 0)', 'transparent']);
    expect(painted).to.not.equal(FIGMA_SPEC);
  });
});
