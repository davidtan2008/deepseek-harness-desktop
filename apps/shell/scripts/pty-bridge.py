#!/usr/bin/env python3
"""Bridge Electron pipes to a real PTY so the shell sees a TTY."""

from __future__ import annotations

import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios


def pack_winsize(rows: int, cols: int) -> bytes:
    return struct.pack("HHHH", rows, cols, 0, 0)


def set_winsize(fd: int, rows: int, cols: int) -> None:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, pack_winsize(rows, cols))


def exit_status(status: int) -> int:
    if hasattr(os, "waitstatus_to_exitcode"):
        return os.waitstatus_to_exitcode(status)
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    if os.WIFSIGNALED(status):
        return 128 + os.WTERMSIG(status)
    return 1


def main() -> None:
    cwd = os.environ.get("DHD_PTY_CWD") or os.getcwd()
    shell = os.environ.get("DHD_PTY_SHELL") or "/bin/zsh"
    cols = max(int(os.environ.get("COLUMNS") or "80"), 2)
    rows = max(int(os.environ.get("LINES") or "24"), 2)
    os.chdir(cwd)
    os.environ.setdefault("TERM", "xterm-256color")
    os.environ["COLUMNS"] = str(cols)
    os.environ["LINES"] = str(rows)

    pid, master = pty.fork()
    if pid == 0:
        os.execvpe(shell, [shell, "-il"], os.environ)

    set_winsize(master, rows, cols)
    try:
        os.kill(pid, signal.SIGWINCH)
    except OSError:
        pass

    stdin = sys.stdin.fileno()
    stdout = sys.stdout.fileno()
    try:
        ctl = 3
        os.fstat(ctl)
    except OSError:
        ctl = None

    for fd in (master, stdin):
        try:
            os.set_blocking(fd, False)
        except OSError:
            pass
    if ctl is not None:
        try:
            os.set_blocking(ctl, False)
        except OSError:
            pass

    watch = [master, stdin]
    if ctl is not None:
        watch.append(ctl)
    pending = b""

    while True:
        try:
            ready, _, _ = select.select(watch, [], [], 0.25)
        except InterruptedError:
            continue

        dead, status = os.waitpid(pid, os.WNOHANG)
        if dead == pid:
            try:
                while True:
                    leftover = os.read(master, 8192)
                    if not leftover:
                        break
                    os.write(stdout, leftover)
            except OSError:
                pass
            sys.exit(exit_status(status))

        if master in ready:
            try:
                data = os.read(master, 8192)
            except (BlockingIOError, OSError):
                data = b""
            if data:
                os.write(stdout, data)

        if stdin in ready:
            try:
                data = os.read(stdin, 8192)
            except (BlockingIOError, OSError):
                data = b""
            if not data:
                watch = [fd for fd in watch if fd != stdin]
                try:
                    os.kill(pid, signal.SIGHUP)
                except OSError:
                    pass
            else:
                try:
                    os.write(master, data)
                except OSError:
                    break

        if ctl is not None and ctl in ready:
            try:
                chunk = os.read(ctl, 256)
            except (BlockingIOError, OSError):
                chunk = b""
            if chunk:
                pending += chunk
                while b"\n" in pending:
                    line, pending = pending.split(b"\n", 1)
                    parts = line.decode("utf-8", "replace").split()
                    if len(parts) < 2:
                        continue
                    try:
                        next_cols, next_rows = int(parts[0]), int(parts[1])
                        set_winsize(master, max(next_rows, 2), max(next_cols, 2))
                        os.kill(pid, signal.SIGWINCH)
                    except (ValueError, OSError):
                        pass


if __name__ == "__main__":
    main()
