# DeepSeek Harness Desktop overlay

MCP servers from the desktop panel are written to `$DSH_HOME/desktop-mcp.patch.yml` and passed as a **launcher** flag, before web-app flags:

```sh
dsh web --patch ~/.dsh/desktop-mcp.patch.yml --no-open --port 0
```

`--patch` after `--no-open` is forwarded to the web app and fails with `unknown option '--patch'`.

This `cordis.patch.yml` is optional documentation of loopback + OS-assigned port. The desktop shell already passes `--port 0` and `--no-open`, so it does not apply this file by default (a patch replaces the whole webserver row).
