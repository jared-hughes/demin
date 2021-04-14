Installation

```bash
npm install
npm run build
sudo npm install -g .
```

This installs `demin` to your `$PATH`, so you can call it like the examples below.

Uninstall:

```bash
sudo npm uninstall -g requirejs-decompile
```

CLI:

Suggested usage:

`demin -i file.js -o output --clean --prettier`

(note: `--prettier` is pretty slow)

Minimal usage:

`demin -i file.js -o output`

All options:

See `demin --help` for all options

(you probably don't want to mix `--dry` and `--quiet` because that's useless)
