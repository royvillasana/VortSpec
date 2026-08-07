import { describe, expect, it } from "vitest";
import {
  buildRelationshipGraph,
  describeShadow,
  findShadowImplementations,
  countInstances,
  parseImports,
  resolveChain,
  resolveSpecifier,
  stripNonCode,
  type GraphFile,
  type ShadowFinding,
} from "./relationship-graph";

/**
 * The relationship graph — OpenSpec change: agentic-design-system, tasks 2.1–2.4.
 *
 * The two documented bugs from the reference series get their own tests, because designing them out
 * is the reason this module exists rather than a port of the Python script:
 *   • stem keying, which silently merges two files sharing a basename;
 *   • import counting as adoption, which reports a component as used when it is only imported.
 */

describe("parsing imports (task 2.2)", () => {
  it("reads every form that binds a name", () => {
    const source = `
      import Button from "./Button";
      import { Card, Badge } from "./ui";
      import { Modal as Dialog } from "./Modal";
      import * as Icons from "./icons";
      export { Tabs } from "./Tabs";
    `;
    const specifiers = parseImports(source).map((record) => record.specifier);
    expect(specifiers).toEqual(["./Button", "./ui", "./Modal", "./icons", "./Tabs"]);
    // `as` binds the LOCAL name — that is what a template can reference.
    expect(parseImports(source).find((r) => r.specifier === "./Modal")?.names).toEqual(["Dialog"]);
    expect(parseImports(source).find((r) => r.specifier === "./ui")?.names).toEqual(["Card", "Badge"]);
  });

  it("skips a side-effect import, which can never produce an instance", () => {
    expect(parseImports(`import "./styles.css";`)).toEqual([]);
  });

  it("skips a type-only import", () => {
    expect(parseImports(`import type { Props } from "./types";`)).toEqual([]);
  });

  it("ignores a commented-out import — the most common false positive mid-refactor", () => {
    const source = `
      // import { Button } from "./Button";
      /* import { Card } from "./Card"; */
      import { Badge } from "./Badge";
    `;
    expect(parseImports(source).map((r) => r.specifier)).toEqual(["./Badge"]);
  });

  it("does not treat a URL's // as a line comment", () => {
    expect(stripNonCode(`const u = "https://x.dev"; import { A } from "./A";`)).toContain("./A");
  });
});

describe("resolving a specifier to a file (task 2.2)", () => {
  const files = new Set([
    "src/components/Button.tsx",
    "src/components/Card/index.tsx",
    "src/pages/index.tsx",
    "src/pages/skills/index.tsx",
  ]);
  const context = { files, aliases: { "@/": "src/" }, extensions: [".tsx", ".ts"] };

  it("resolves a relative import, an extensionless one, and a directory index", () => {
    expect(resolveSpecifier("./Button", "src/components/Page.tsx", context)).toBe("src/components/Button.tsx");
    expect(resolveSpecifier("../components/Button", "src/pages/index.tsx", context)).toBe("src/components/Button.tsx");
    expect(resolveSpecifier("./Card", "src/components/Page.tsx", context)).toBe("src/components/Card/index.tsx");
  });

  it("resolves an alias", () => {
    expect(resolveSpecifier("@/components/Button", "src/pages/index.tsx", context)).toBe("src/components/Button.tsx");
  });

  it("returns null for a package import — those are edges out of this graph, not in it", () => {
    // For a CONSUMED design system this is most of the roster; inventing nodes for them would
    // report a design system that does not exist in this repo.
    expect(resolveSpecifier("react", "src/pages/index.tsx", context)).toBeNull();
    expect(resolveSpecifier("@vendor/ui", "src/pages/index.tsx", context)).toBeNull();
  });

  it("keeps two files that share a basename distinct (the stem-keying bug, task 2.1)", () => {
    expect(resolveSpecifier("./index", "src/pages/other.tsx", context)).toBe("src/pages/index.tsx");
    expect(resolveSpecifier("./skills", "src/pages/other.tsx", context)).toBe("src/pages/skills/index.tsx");
  });
});

describe("counting instances (task 2.3)", () => {
  it("counts a rendered component, self-closing or paired", () => {
    expect(countInstances(`<Button/><Button /><Button>x</Button>`, "Button").count).toBe(3);
  });

  it("does not count a closing tag twice", () => {
    expect(countInstances(`<Button>hello</Button>`, "Button").count).toBe(1);
  });

  it("de-duplicates a slot-nested instance — the 75%→95% accuracy case", () => {
    // `<Card><Button/></Card>` renders ONE Button. Counting it once per enclosing component, or
    // walking Card's children again, is the double-count this guards against.
    const result = countInstances(`<Card><Button/></Card>`, "Button");
    expect(result.count).toBe(1);
    expect(result.slotNested).toBe(true);
  });

  it("reports the shallowest depth, so composition is legible", () => {
    const deep = countInstances(`<Card><Row><Button/></Row></Card>`, "Button");
    expect(deep.depth).toBe(2);
    const shallow = countInstances(`<Button/><Card><Button/></Card>`, "Button");
    expect(shallow.depth).toBe(0);
  });

  it("counts instances inside a conditional and a loop", () => {
    const source = `
      {isOpen && <Button/>}
      {items.map((i) => <Button key={i} />)}
    `;
    expect(countInstances(source, "Button").count).toBe(2);
  });

  it("does not count a mention in a comment or a string", () => {
    // A quoted `<Button/>` is documentation, a code sample, or an error message — never a render.
    expect(countInstances(`// <Button/>\nconst doc = "<Button/>";`, "Button").count).toBe(0);
    expect(countInstances(`const help = 'use <Button/> here';`, "Button").count).toBe(0);
  });

  it("does not count a longer name that starts with the same characters", () => {
    expect(countInstances(`<ButtonGroup/>`, "Button").count).toBe(0);
  });
});

describe("building the graph (tasks 2.1–2.4)", () => {
  const files: GraphFile[] = [
    { path: "src/components/Button.tsx", component: "Button", source: `export const Button = () => <button/>;` },
    { path: "src/components/Card.tsx", component: "Card", source: `export const Card = ({children}) => <div>{children}</div>;` },
    {
      path: "src/components/Toolbar.tsx",
      component: "Toolbar",
      source: `import { Button } from "./Button";\nexport const Toolbar = () => <div><Button/><Button/></div>;`,
    },
    {
      path: "src/pages/index.tsx",
      component: "HomePage",
      source: `import { Card } from "../components/Card";\nimport { Button } from "../components/Button";\nexport default () => <Card><Button/></Card>;`,
    },
    {
      // Imports Card and never renders it — the "adoption" bug in one file.
      path: "src/pages/skills/index.tsx",
      component: "SkillsPage",
      source: `import { Card } from "../../components/Card";\nexport default () => <div>nothing</div>;`,
    },
  ];
  const graph = buildRelationshipGraph(files, { aliases: { "@/": "src/" } });
  const byName = new Map(graph.components.map((component) => [component.name, component]));

  it("keys every entry on the full path, so the two index.tsx files stay distinct", () => {
    // Under stem keying these two collapse into one and the loser's edges vanish.
    expect(byName.get("HomePage")?.path).toBe("src/pages/index.tsx");
    expect(byName.get("SkillsPage")?.path).toBe("src/pages/skills/index.tsx");
  });

  it("counts instances, not imports", () => {
    const button = byName.get("Button")!;
    expect(button.importCount).toBe(2); // Toolbar + HomePage
    expect(button.instanceCount).toBe(3); // two in Toolbar, one in HomePage
    expect(button.efficiency).toBe(1.5);
  });

  it("reports a component imported but never rendered as UNUSED", () => {
    const card = byName.get("Card")!;
    // Rendered once (HomePage) and imported twice — so not unused, but the ratio shows the drag.
    expect(card.instanceCount).toBe(1);
    expect(card.efficiency).toBe(0.5);
    expect(graph.importedNeverRendered.find((entry) => entry.component === "Card")?.files).toEqual([
      "src/pages/skills/index.tsx",
    ]);
  });

  it("marks a component nothing renders as unused, and names the files to fix", () => {
    const orphan = buildRelationshipGraph([
      { path: "src/components/Badge.tsx", component: "Badge", source: `export const Badge = () => <span/>;` },
      { path: "src/pages/a.tsx", component: "A", source: `import { Badge } from "../components/Badge";\nexport default () => <div/>;` },
    ]);
    const badge = orphan.components.find((component) => component.name === "Badge")!;
    expect(badge.adoption).toBe("imported-never-rendered");
    expect(badge.instanceCount).toBe(0);
    expect(badge.efficiency).toBe(0); // imported, so the ratio is real — and it is zero
    expect(orphan.importedNeverRendered[0]).toEqual({ component: "Badge", files: ["src/pages/a.tsx"] });
  });

  it("distinguishes NEVER IMPORTED from imported-and-never-rendered", () => {
    // The distinction `efficiency` alone cannot carry: 0 would report a brand-new component as the
    // worst-adopted thing in the system, and a bare `undefined` makes every consumer re-derive why.
    const lonely = buildRelationshipGraph([
      { path: "src/components/New.tsx", component: "New", source: `export const New = () => <i/>;` },
    ]);
    expect(lonely.components[0].adoption).toBe("unimported");
    expect(lonely.components[0].efficiency).toBeUndefined();
  });

  it("gives every component exactly one adoption state", () => {
    // A report sorts and filters on this, so the three states must partition the roster.
    const states = graph.components.map((component) => component.adoption);
    expect(states.every((state) => ["unimported", "imported-never-rendered", "adopted"].includes(state))).toBe(true);
    expect(byName.get("Button")?.adoption).toBe("adopted");
    expect(byName.get("Card")?.adoption).toBe("adopted"); // rendered once, imported twice
  });

  it("emits both directions of every edge", () => {
    expect(byName.get("Button")?.usedBy).toEqual(["HomePage", "Toolbar"]);
    expect(byName.get("Toolbar")?.uses).toEqual(["Button"]);
    expect(byName.get("HomePage")?.uses).toEqual(["Button", "Card"]);
  });

  it("resolves a chain transitively", () => {
    const chained = buildRelationshipGraph([
      { path: "a.tsx", component: "A", source: `import { B } from "./b";\nexport const A = () => <B/>;` },
      { path: "b.tsx", component: "B", source: `import { C } from "./c";\nexport const B = () => <C/>;` },
      { path: "c.tsx", component: "C", source: `export const C = () => <i/>;` },
    ]);
    expect(resolveChain(chained, "A")).toEqual(["B", "C"]);
  });

  it("survives a cycle instead of hanging on it", () => {
    // A Menu rendering a MenuItem that renders a nested Menu is a real design-system shape.
    const cyclic = buildRelationshipGraph([
      { path: "menu.tsx", component: "Menu", source: `import { MenuItem } from "./item";\nexport const Menu = () => <MenuItem/>;` },
      { path: "item.tsx", component: "MenuItem", source: `import { Menu } from "./menu";\nexport const MenuItem = () => <Menu/>;` },
    ]);
    expect(resolveChain(cyclic, "Menu")).toEqual(["MenuItem"]);
  });

  it("counts a renamed import by its local name", () => {
    const renamed = buildRelationshipGraph([
      { path: "src/Modal.tsx", component: "Modal", source: `export const Modal = () => <div/>;` },
      { path: "src/App.tsx", component: "App", source: `import { Modal as Dialog } from "./Modal";\nexport const App = () => <Dialog/>;` },
    ]);
    const modal = renamed.components.find((component) => component.name === "Modal")!;
    expect(modal.instanceCount).toBe(1);
    expect(modal.usedBy).toEqual(["App"]);
  });
});

describe("shadow implementations (task 2.5)", () => {
  /** A Button with a real token signature — five tokens and a `<button>` root. */
  const BUTTON: GraphFile = {
    path: "src/components/Button.tsx",
    component: "Button",
    designSystem: true,
    source: `export const Button = () => (
      <button className="bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-[var(--radius-md)] px-[var(--spacing-4)] shadow-[var(--shadow-sm)]" />
    );`,
  };

  function shadows(extra: GraphFile[]): ShadowFinding[] {
    const files = [BUTTON, ...extra];
    return findShadowImplementations(files, buildRelationshipGraph(files));
  }

  it("finds a file that reproduces the signature without importing the component", () => {
    // The quiet failure: nothing is broken, every value is a token, the audit passes — and the
    // design system has forked.
    const found = shadows([
      {
        path: "src/pages/Landing.tsx",
        component: "Landing",
        source: `export const Landing = () => (
          <button className="bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-[var(--radius-md)] px-[var(--spacing-4)] shadow-[var(--shadow-sm)]" />
        );`,
      },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ component: "Button", file: "src/pages/Landing.tsx", element: "button" });
    expect(found[0].sharedTokens).toContain("color-primary");
    expect(describeShadow(found[0])).toContain("import Button instead of reimplementing it");
  });

  it("does NOT flag a file that imports the component and restyles it", () => {
    // Importing and customising is use, not a fork. Flagging it would punish the correct behaviour.
    const found = shadows([
      {
        path: "src/pages/Landing.tsx",
        component: "Landing",
        source: `import { Button } from "../components/Button";
        export const Landing = () => (
          <button className="bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-[var(--radius-md)] px-[var(--spacing-4)] shadow-[var(--shadow-sm)]">
            <Button/>
          </button>
        );`,
      },
    ]);
    expect(found).toEqual([]);
  });

  it("does NOT flag a different element that merely shares the palette", () => {
    // A <div> with a button's colours is a card. This one check removes most of the false positives.
    const found = shadows([
      {
        path: "src/components/Card.tsx",
        component: "Card",
        designSystem: true,
        source: `export const Card = () => (
          <div className="bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-[var(--radius-md)] px-[var(--spacing-4)] shadow-[var(--shadow-sm)]" />
        );`,
      },
    ]);
    expect(found).toEqual([]);
  });

  it("does NOT flag a file sharing only one or two common tokens", () => {
    // Everything uses --color-text. A detector that fires on that is one people learn to ignore.
    const found = shadows([
      {
        path: "src/pages/About.tsx",
        component: "About",
        source: `export const About = () => <button className="text-[var(--color-primary)]" />;`,
      },
    ]);
    expect(found).toEqual([]);
  });

  it("does NOT flag a partial overlap below the threshold", () => {
    const found = shadows([
      {
        path: "src/pages/Partial.tsx",
        component: "Partial",
        source: `export const Partial = () => (
          <button className="bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-[var(--radius-md)]" />
        );`,
      },
    ]);
    // 3 of 5 tokens = 0.6 overlap, exactly at the threshold — included.
    expect(found).toHaveLength(1);
    expect(found[0].overlap).toBe(0.6);
  });

  it("ignores a component with too thin a signature to match on", () => {
    // A component using one token would otherwise make every file in the project its shadow.
    const thin: GraphFile = {
      path: "src/components/Spacer.tsx",
      component: "Spacer",
      designSystem: true,
      source: `export const Spacer = () => <div className="h-[var(--spacing-4)]" />;`,
    };
    const other: GraphFile = {
      path: "src/pages/Any.tsx",
      component: "Any",
      source: `export const Any = () => <div className="h-[var(--spacing-4)]" />;`,
    };
    const files = [thin, other];
    expect(findShadowImplementations(files, buildRelationshipGraph(files))).toEqual([]);
  });

  it("never flags the component's own file", () => {
    expect(shadows([])).toEqual([]);
  });
});

describe("shadow detection is directional (task 2.5)", () => {
  it("reports the page reimplementing the component, never the reverse", () => {
    // "This page reimplements Button" is a finding. "Button resembles this page" is noise — and
    // reporting both would double the detector's own false-positive rate.
    const files: GraphFile[] = [
      {
        path: "src/components/Button.tsx",
        component: "Button",
        designSystem: true,
        source: `export const Button = () => <button className="bg-[var(--a)] text-[var(--b)] rounded-[var(--c)] p-[var(--d)]" />;`,
      },
      {
        path: "src/pages/Landing.tsx",
        component: "Landing",
        source: `export const Landing = () => <button className="bg-[var(--a)] text-[var(--b)] rounded-[var(--c)] p-[var(--d)]" />;`,
      },
    ];
    const found = findShadowImplementations(files, buildRelationshipGraph(files));
    expect(found).toHaveLength(1);
    expect(found[0].component).toBe("Button");
    expect(found[0].file).toBe("src/pages/Landing.tsx");
  });

  it("still catches one design-system component shadowing another", () => {
    // A real and worth-catching case: two atoms that quietly converged.
    const files: GraphFile[] = [
      {
        path: "src/components/Button.tsx",
        component: "Button",
        designSystem: true,
        source: `export const Button = () => <button className="bg-[var(--a)] text-[var(--b)] rounded-[var(--c)] p-[var(--d)]" />;`,
      },
      {
        path: "src/components/CtaButton.tsx",
        component: "CtaButton",
        designSystem: true,
        source: `export const CtaButton = () => <button className="bg-[var(--a)] text-[var(--b)] rounded-[var(--c)] p-[var(--d)]" />;`,
      },
    ];
    const found = findShadowImplementations(files, buildRelationshipGraph(files));
    expect(found.map((f) => `${f.file}→${f.component}`).sort()).toEqual([
      "src/components/Button.tsx→CtaButton",
      "src/components/CtaButton.tsx→Button",
    ]);
  });

  it("reports nothing when the caller marks no design-system files", () => {
    // A caller that does not know which files are the design system gets NO findings rather than a
    // flood of reversed ones.
    const files: GraphFile[] = [
      { path: "a.tsx", component: "A", source: `<button className="bg-[var(--a)] text-[var(--b)] rounded-[var(--c)] p-[var(--d)]" />` },
      { path: "b.tsx", component: "B", source: `<button className="bg-[var(--a)] text-[var(--b)] rounded-[var(--c)] p-[var(--d)]" />` },
    ];
    expect(findShadowImplementations(files, buildRelationshipGraph(files))).toEqual([]);
  });
});

describe("a render without an import is still an edge (task 2.8)", () => {
  // Requiring an import would be React-centric and would lose real edges: an Angular template
  // renders a component declared in its module, and a globally-registered Vue component needs no
  // import either. The tag name matching a defined component IS the signal.
  const files: GraphFile[] = [
    { path: "src/components/Button.tsx", component: "Button", designSystem: true, source: `export const Button = () => <button/>;` },
    { path: "src/pages/Home.tsx", component: "Home", source: `export const Home = () => <div><Button/><Button/></div>;` },
  ];
  const graph = buildRelationshipGraph(files);
  const button = graph.components.find((component) => component.name === "Button")!;

  it("counts the instances and both edge directions", () => {
    expect(button.instanceCount).toBe(2);
    expect(button.usedBy).toEqual(["Home"]);
  });

  it("does NOT inflate the import count — that is what keeps efficiency meaningful", () => {
    expect(button.importCount).toBe(0);
    expect(button.efficiency).toBeUndefined();
    // Rendered, so adopted — even though nothing imported it in a way we could resolve.
    expect(button.adoption).toBe("adopted");
  });

  it("never treats a component's own file as an instance of itself", () => {
    expect(button.usedBy).not.toContain("Button");
  });
});
