# Demin

Demin is a node CLI application for de-minifying (de-compiling) compiled AMD <sup>(?)</sup> files. Demin does **not** guarantee that output code that executes identically to the source file; do not expect the code to export. The intent **is** to produce somewhat-readable code.z

## Example Transformation

<!-- prettier-ignore-start -->
```js
define("module",["require","exports","tslib"],function(e,r,i){r.default=i.__assign({},{idk:!0,yo:void 0})})
define("another",["require","exports","module","lib/wrapper","vendor/wrapper"],function(e,r,i,o,d){r.default=o.wrap(d.wrap(i))})
```
<!-- prettier-ignore-end -->

becomes

```js
/* module.js */
import * as Tslib from 'tslib'
var P = {
  idk: true,
  yo: undefined,
}
exports.default = Tslib.__assign({}, P)

/* another.js */
import * as Wrapper from 'lib/wrapper'
import * as Wrapper1 from 'vendor/wrapper'
import * as Module from 'module'
exports.default = Wrapper.wrap(Wrapper1.wrap(Module))
```

## Features

Current features:

- change required module names from `define` to ES6 module `import` statements
- change `!0`, `!1`, and `void 0` to their typical identifiers `true`, `false`, and `undefined`
- run Prettier

Currently-planned features:

- get nearly all `require` calls converted to `import` statements
- change `exports.default =` and `exports.name = ` calls to ES6 module `export default` and `export const` calls.
- remove the comma operator when possible (e.g. `return a(), b(), c();` → `a(); b(); return c();`)
- change `*.createElement` calls to JSX syntax

## Installation

```bash
git clone https://github.com/jared-hughes/demin demin
cd demin && npm install && npm run build
sudo npm install -g .
```

This installs `demin` to your `$PATH`, so you can call it like the example usage below.

## Uninstall

```bash
sudo npm uninstall -g demin
```

## Usage

### Suggested usage:

`demin -i file.js -o output --clean --prettier`

(note: `--prettier` is pretty slow if you have many output files or large files)

### Minimal usage:

`demin -i file.js -o output`

### All options:

See `demin --help` for all options

(you probably don't want to mix `--dry` and `--quiet` because that's useless)
