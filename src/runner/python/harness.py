# Runs a Baekjoon-style Python program inside Pyodide (#50, ADR-0004).
#
# Loaded once per worker; `_cib_run` is called for every run. Each run gets fresh globals,
# a fresh stdin (fd 0 is a real file, so input(), sys.stdin, open(0) and os.read(0, ...)
# all work) and fresh stdout/stderr that write to fds 1 and 2, which the worker captures.
import builtins
import io
import linecache
import os
import sys
import threading
import traceback

_FILENAME = "solution.py"
_STDIN_PATH = "/tmp/cib-stdin"
_DEFAULT_RECURSION_LIMIT = sys.getrecursionlimit()
_BUILTINS = dict(builtins.__dict__)


class _OutputLimit(BaseException):
    """Raised when the program prints too much. A BaseException, so `except Exception` in
    user code does not swallow it."""


class _Counter:
    def __init__(self, limit):
        self.limit = limit
        self.written = 0
        self.exceeded = False
        # Set after the run, so a stream that is flushed late (when garbage collected)
        # neither raises nor leaks into the next run's output.
        self.closed = False


class _Sink(io.RawIOBase):
    """Writes to a file descriptor and stops the program once the output limit is hit."""

    def __init__(self, fd, counter):
        super().__init__()
        self._fd = fd
        self._counter = counter

    def writable(self):
        return True

    def write(self, b):
        n = len(b)
        counter = self._counter
        if counter.closed:
            return n
        if counter.exceeded or counter.written + n > counter.limit:
            counter.exceeded = True
            raise _OutputLimit()
        counter.written += n
        view = memoryview(b)
        while view:
            view = view[os.write(self._fd, view) :]
        return n


def _sync_thread_start(self):
    # Pyodide has no threads. Baekjoon solutions often run main() in a thread only to get a
    # bigger stack (threading.stack_size), so run the target right away instead.
    if self._started.is_set():
        raise RuntimeError("threads can only be started once")
    self._started.set()
    self.run()


def _sync_thread_join(self, timeout=None):
    if not self._started.is_set():
        raise RuntimeError("cannot join thread before it is started")


threading.Thread.start = _sync_thread_start
threading.Thread.join = _sync_thread_join


def _reset_stdin(data):
    with open(_STDIN_PATH, "wb") as f:
        f.write(data)
    fd = os.open(_STDIN_PATH, os.O_RDONLY)
    # open(0) in an earlier run may have closed fd 0, in which case os.open reuses it.
    if fd != 0:
        os.dup2(fd, 0)
        os.close(fd)
    raw = io.FileIO(0, "rb", closefd=False)
    # newline=None turns "\r\n" into "\n", like the judge's LF-only test data.
    return io.TextIOWrapper(io.BufferedReader(raw), encoding="utf-8", newline=None)


def _restore_builtins():
    current = builtins.__dict__
    for name in [n for n in current if n not in _BUILTINS]:
        del current[name]
    current.update(_BUILTINS)


def _user_traceback(e):
    """The traceback without this harness's frames."""
    tb = e.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename != _FILENAME:
        tb = tb.tb_next
    return "".join(traceback.format_exception(type(e), e, tb))


def _summary(e):
    """One line for the result panel, e.g. "ZeroDivisionError: division by zero"."""
    te = traceback.TracebackException.from_exception(e)
    te.__notes__ = None
    lines = "".join(te.format_exception_only()).rstrip("\n").split("\n")
    if isinstance(e, SyntaxError):
        return lines[-1]
    # The "Name: message" line comes after any file/caret lines; keep multi-line messages.
    for i, line in enumerate(lines):
        if line and not line.startswith(" "):
            return "\n".join(lines[i:])
    return lines[-1]


def _exit_code(e):
    code = e.code
    if code is None:
        return 0
    if isinstance(code, int):
        return code
    # sys.exit("message") prints the message to stderr and exits with 1.
    try:
        sys.stderr.write(str(code) + "\n")
    except BaseException:
        pass
    return 1


def _cib_run(code, stdin, output_limit):
    """Returns (exit_code, error, traceback, output_limit_exceeded)."""
    counter = _Counter(output_limit)
    sys.stdin = _reset_stdin(stdin.encode("utf-8", "replace"))
    sys.stdout = io.TextIOWrapper(
        io.BufferedWriter(_Sink(1, counter)), encoding="utf-8", newline="\n"
    )
    sys.stderr = io.TextIOWrapper(
        _Sink(2, counter),
        encoding="utf-8",
        errors="backslashreplace",
        newline="\n",
        write_through=True,
    )
    sys.setrecursionlimit(_DEFAULT_RECURSION_LIMIT)
    linecache.cache[_FILENAME] = (len(code), None, code.splitlines(True), _FILENAME)
    scope = {"__name__": "__main__", "__builtins__": builtins}

    exit_code = 0
    error = None
    trace = None
    try:
        exec(compile(code, _FILENAME, "exec"), scope)
    except SystemExit as e:
        exit_code = _exit_code(e)
    except _OutputLimit:
        exit_code = 1
    except BaseException as e:
        exit_code = 1
        error = _summary(e)
        trace = _user_traceback(e)

    for stream in (sys.stdout, sys.stderr):
        try:
            stream.flush()
        except BaseException:
            # _OutputLimit, or a stream the program closed or replaced.
            pass
    counter.closed = True
    exceeded = counter.exceeded
    if exceeded:
        exit_code = 1

    scope.clear()
    _restore_builtins()
    linecache.cache.pop(_FILENAME, None)
    sys.stdin, sys.stdout, sys.stderr = sys.__stdin__, sys.__stdout__, sys.__stderr__
    sys.setrecursionlimit(_DEFAULT_RECURSION_LIMIT)
    return exit_code, error, trace, exceeded
