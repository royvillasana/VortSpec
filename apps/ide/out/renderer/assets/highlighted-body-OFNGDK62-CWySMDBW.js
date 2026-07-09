import { r as reactExports, R as R$1, L as Li, j as jsxRuntimeExports, A as At } from "./index-dkboC8n_.js";
var R = ({ code: s, language: e, raw: t, className: h, startLine: d, lineNumbers: m, ...p }) => {
  let { shikiTheme: l } = reactExports.useContext(R$1), o = Li(), [a, i] = reactExports.useState(t);
  return reactExports.useEffect(() => {
    if (!o) {
      i(t);
      return;
    }
    let r = o.highlight({ code: s, language: e, themes: l }, (c) => {
      i(c);
    });
    r && i(r);
  }, [s, e, l, o, t]), jsxRuntimeExports.jsx(At, { className: h, language: e, lineNumbers: m, result: a, startLine: d, ...p });
};
export {
  R as HighlightedCodeBlockBody
};
