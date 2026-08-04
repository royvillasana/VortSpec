#!/usr/bin/env bash
# Does Angular's `strictTemplates` inherit through `extends`, and does a leaf override win?
#
# I1/I2/I3 compile the SAME bad binding and differ only in config; I4 compiles a different source
# on purpose. Two cases discriminate, and they discriminate different things:
#   I3 — without it, I2 failing is equally consistent with the control ALWAYS failing, so the
#        inheritance conclusion would be unearned.
#   I4 — without it, the measurement can decay to "exited non-zero" and every other case still
#        passes, because in a healthy workspace the exit codes are right anyway.
# Prints each compiler artifact verbatim rather than asserting a predicate over output nobody
# looked at.
#
#   NGC=/path/to/node_modules/.bin/ngc bash GUIDES/angular-inherit-control.sh
#
# See GUIDES/ANGULAR_STRICTTEMPLATES_INHERITANCE_CONTROL.md for the recorded result and scope.
set -uo pipefail

NGC="${NGC:-$HOME/.buzz/.scratch/angular-fixture/node_modules/.bin/ngc}"
if [ ! -x "$NGC" ]; then
  echo "no ngc at $NGC — pass NGC=/path/to/node_modules/.bin/ngc" >&2
  exit 2
fi
# Version-sensitive compiler behaviour, so record both exactly — "19.x" is not a reproducible claim.
MODS="$(cd "$(dirname "$NGC")/.." && pwd)"
ver() { node -e "process.stdout.write(require('$MODS/$1/package.json').version)" 2>/dev/null || echo '?'; }
echo "@angular/compiler-cli $(ver @angular/compiler-cli)  typescript $(ver typescript)  node $(node --version)"

# Everything is written under the temp root and nowhere else. The first version created this and
# then wrote beside the compiler install anyway, while both the script and its guide said "temp
# dir" — a false claim about the artifact whose whole job is not making false claims. It only
# looked fine because the install used to develop it happened to sit in a writable tree.
#
# `@angular/core` in the sources resolves by walking up from the source file, so a symlinked
# `node_modules` makes the install reachable from the temp workspace without writing to it.
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT
mkdir -p "$DIR/src"
ln -s "$MODS" "$DIR/node_modules"

cat > "$DIR/src/button.component.ts" <<'EOF'
import { Component, Input, Output, EventEmitter } from '@angular/core';
@Component({ selector: 'app-button', standalone: true, templateUrl: './button.component.html' })
export class ButtonComponent {
  @Input() count = 0;
  @Output() changed = new EventEmitter<number>();
}
EOF
cat > "$DIR/src/button.component.html" <<'EOF'
<button (click)="changed.emit(count)">{{ count }}</button>
EOF
cat > "$DIR/src/host.component.ts" <<'EOF'
import { Component } from '@angular/core';
import { ButtonComponent } from './button.component';
@Component({ selector: 'app-host', standalone: true, imports: [ButtonComponent], templateUrl: './host.component.html' })
export class HostComponent {}
EOF
# The bad binding, identical across I1/I2/I3 — they differ only in tsconfig. I4 uses its own source.
cat > "$DIR/src/host.component.html" <<'EOF'
<app-button [count]="'definitely not a number'"></app-button>
EOF

OPTS='"target":"ES2022","module":"ES2022","moduleResolution":"bundler","strict":true,"skipLibCheck":true,"experimentalDecorators":true,"noEmit":true'
FILES='"files":["src/button.component.ts","src/host.component.ts"]'
cat > "$DIR/tsconfig.base.json"  <<EOF
{ "compilerOptions": { $OPTS }, "angularCompilerOptions": { "strictTemplates": true } }
EOF
cat > "$DIR/tsconfig.I1.json" <<EOF
{ "compilerOptions": { $OPTS }, "angularCompilerOptions": { "strictTemplates": true }, $FILES }
EOF
cat > "$DIR/tsconfig.I2.json" <<EOF
{ "extends": "./tsconfig.base.json", $FILES }
EOF
cat > "$DIR/tsconfig.I3.json" <<EOF
{ "extends": "./tsconfig.base.json", "angularCompilerOptions": { "strictTemplates": false }, $FILES }
EOF
# I4's source: a genuine compile failure that has nothing to do with strictTemplates.
cat > "$DIR/src/unrelated.component.ts" <<'EOF'
import { Component } from '@angular/core';
import { Nowhere } from './does-not-exist';
@Component({ selector: 'app-unrelated', standalone: true, template: '<p>{{ x }}</p>' })
export class UnrelatedComponent { x: Nowhere = null!; }
EOF
cat > "$DIR/tsconfig.I4.json" <<EOF
{ "extends": "./tsconfig.base.json", "files": ["src/unrelated.component.ts"] }
EOF

fail=0

# THE measurement, used in both polarities. An exit code alone is not one: `ngc` exits 1 on a
# module-resolution error exactly as it does on TS2322, so a case checking only the code goes
# green in a broken workspace while proving nothing about strictTemplates.
failedWith() { # exit_code output diagnostic
  [ "$1" -ne 0 ] && grep -q "error $3" <<<"$2"
}

# The second measurement. Bumble found that theirs had collapsed to a single assertion when its
# other users moved to `failedWith` — one case out of eighteen was the whole margin. Mine was
# worse: the clean check lived inline in the `clean` branch, so I3 was its ONLY user and no case
# ever required it to be false. Stub it out and the script still reported 4/4. It is a shared
# function now, asserted TRUE by I3 and FALSE by every failing case.
compiledClean() { # exit_code output
  [ "$1" -eq 0 ] && [ -z "${2//[[:space:]]/}" ]
}

# Bumble's V10 is why I4 exists. Asserting the diagnostic in every FAILING case is not enough:
# revert `failedWith` to a bare `exit != 0` and I1/I2/I3 all still pass, because in a healthy
# workspace the exit codes are right anyway. The regression is invisible. Only a case that
# requires the measurement to be FALSE while the compile genuinely fails can see it — that is I4,
# and it is the entire margin.
# I4 needs BOTH halves. Thor caught that declaring it `notdiag:TS2322` only required "non-zero and
# not TS2322" — a syntax error would have satisfied it while the case reported that the
# missing-module scenario behaved as declared. The label claimed more than the measurement asked
# for, which is this thread's defect in miniature, inside the case built to stop it.
check() { # name want description [forbid]   —  want: diag:CODE | clean
  local name="$1" want="$2" desc="$3" forbid="${4:-}" out code why="" pat="${2#*:}"
  # ngc colours its output, so `error` and `TS2322` are not adjacent in the raw bytes. Strip the
  # escapes before matching rather than weakening the pattern to the bare code — matching
  # "error TS2322" is what distinguishes a diagnostic from the word appearing in a filename.
  out="$("$NGC" -p "$DIR/tsconfig.$name.json" 2>&1 | sed $'s/\033\\[[0-9;]*m//g')"
  code=${PIPESTATUS[0]}
  case "$want" in
    diag:*) failedWith "$code" "$out" "$pat" || why="expected to fail with $pat (exit=$code)"
            compiledClean "$code" "$out" && why="${why:+$why; }measured as a clean compile, but must not be" ;;
    clean)  compiledClean "$code" "$out" || why="expected a clean compile (exit=$code, output=${#out} bytes)" ;;
  esac
  if [ -n "$forbid" ] && failedWith "$code" "$out" "$forbid"; then
    why="${why:+$why; }must NOT report $forbid, but did"
  fi
  if [ -z "$why" ]; then printf 'PASS  %-3s exit=%s  %s\n' "$name" "$code" "$desc"
  else printf 'FAIL  %-3s %s  %s\n' "$name" "$why" "$desc"; fail=1; fi
  printf '      -- artifact --\n%s\n\n' "${out:-      (no compiler output)}"
}

cd "$DIR"
check I1 diag:TS2322    "leaf sets strictTemplates: true            -> the bad binding IS reported"
check I2 diag:TS2322    "leaf extends a base that sets it, omits it -> inherits true (absent != false)"
check I3 clean          "leaf extends that base, overrides to false -> leaf wins, compiles clean"
check I4 diag:TS2307    "an unrelated failure (missing module)      -> TS2307, and NOT TS2322" TS2322

if [ "$fail" -eq 0 ]; then
  echo "4/4 behaved as declared: strictTemplates inherits, the leaf overrides, and a"
  echo "non-zero exit is not by itself evidence that the binding was checked."
else
  echo "control did NOT behave as declared — read the artifacts above before trusting either claim."
fi
exit "$fail"
