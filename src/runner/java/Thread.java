/**
 * Injected only when the solution creates a Thread. Shadows java.lang.Thread (same-package types win
 * over the implicit java.lang.* import) so the common "big stack" idiom
 * `new Thread(null, runnable, "name", 1 << 26).start()` runs the task synchronously: TeaVM's Wasm
 * backend has no real threads and no 4-argument constructor.
 */
public class Thread implements Runnable {
    private final Runnable task;

    public Thread() {
        this.task = null;
    }

    public Thread(Runnable task) {
        this.task = task;
    }

    public Thread(Runnable task, String name) {
        this.task = task;
    }

    public Thread(Object group, Runnable task, String name) {
        this.task = task;
    }

    public Thread(Object group, Runnable task, String name, long stackSize) {
        this.task = task;
    }

    @Override
    public void run() {
        if (task != null) {
            task.run();
        }
    }

    public void start() {
        run();
    }

    public void join() throws InterruptedException {
    }

    public void join(long millis) throws InterruptedException {
    }

    public void setDaemon(boolean on) {
    }

    public void interrupt() {
    }

    public static void sleep(long millis) throws InterruptedException {
    }

    public static java.lang.Thread currentThread() {
        return java.lang.Thread.currentThread();
    }
}
