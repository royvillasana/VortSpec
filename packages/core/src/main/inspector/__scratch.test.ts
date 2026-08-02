import { it } from "vitest";
import { serveLightPages, lightPageUrl } from "../lite/light-serve";
const P = "/Users/royvillasana/Desktop/Roy Villasana/VortSpec/testing project/AstryxTest";
it("hold server open", async () => {
  const base = await serveLightPages(P);
  console.log("URL:", lightPageUrl(base, "shopdev"));
  await new Promise((r) => setTimeout(r, 120000));
}, 130000);
