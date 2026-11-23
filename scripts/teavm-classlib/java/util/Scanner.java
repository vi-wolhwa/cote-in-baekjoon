package java.util;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.Reader;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;

/**
 * Minimal java.util.Scanner for the in-browser runner (TeaVM's class library has none).
 * Reads the whole source up front (stdin is known before the program starts) and splits on
 * whitespace like the JDK's default delimiter. Positions follow the JDK: token methods leave the
 * line terminator, nextLine() returns the rest of the current line.
 */
public final class Scanner implements Closeable, Iterator<String> {
    private final String s;
    private int pos;
    private boolean closed;

    public Scanner(InputStream in) {
        this.s = readAll(in);
    }

    public Scanner(InputStream in, String charsetName) {
        this(in);
    }

    public Scanner(Readable source) {
        StringBuilder sb = new StringBuilder();
        if (source instanceof Reader) {
            Reader r = (Reader) source;
            char[] buf = new char[8192];
            try {
                int n;
                while ((n = r.read(buf)) > 0) {
                    sb.append(buf, 0, n);
                }
            } catch (IOException e) {
                // keep what was read
            }
        }
        this.s = sb.toString();
    }

    public Scanner(String source) {
        this.s = source;
    }

    private static String readAll(InputStream in) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        try {
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
            }
        } catch (IOException e) {
            // EOF
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private void ensureOpen() {
        if (closed) {
            throw new IllegalStateException("Scanner closed");
        }
    }

    private static boolean ws(char c) {
        return Character.isWhitespace(c);
    }

    private int tokenStart() {
        int i = pos;
        int n = s.length();
        while (i < n && ws(s.charAt(i))) {
            i++;
        }
        return i;
    }

    private int tokenEnd(int start) {
        int i = start;
        int n = s.length();
        while (i < n && !ws(s.charAt(i))) {
            i++;
        }
        return i;
    }

    private String peekToken() {
        ensureOpen();
        int a = tokenStart();
        if (a >= s.length()) {
            return null;
        }
        return s.substring(a, tokenEnd(a));
    }

    @Override
    public boolean hasNext() {
        return peekToken() != null;
    }

    @Override
    public String next() {
        ensureOpen();
        int a = tokenStart();
        if (a >= s.length()) {
            throw new NoSuchElementException();
        }
        int b = tokenEnd(a);
        pos = b;
        return s.substring(a, b);
    }

    private String nextNumberToken() {
        String t = peekToken();
        if (t == null) {
            throw new NoSuchElementException();
        }
        return t;
    }

    private void consume() {
        pos = tokenEnd(tokenStart());
    }

    public int nextInt() {
        return nextInt(10);
    }

    public int nextInt(int radix) {
        String t = nextNumberToken();
        int v;
        try {
            v = Integer.parseInt(t, radix);
        } catch (NumberFormatException e) {
            throw new InputMismatchException("For input string: \"" + t + "\"");
        }
        consume();
        return v;
    }

    public long nextLong() {
        String t = nextNumberToken();
        long v;
        try {
            v = Long.parseLong(t);
        } catch (NumberFormatException e) {
            throw new InputMismatchException("For input string: \"" + t + "\"");
        }
        consume();
        return v;
    }

    public short nextShort() {
        return (short) nextInt();
    }

    public byte nextByte() {
        return (byte) nextInt();
    }

    public double nextDouble() {
        String t = nextNumberToken();
        double v;
        try {
            v = Double.parseDouble(t);
        } catch (NumberFormatException e) {
            throw new InputMismatchException("For input string: \"" + t + "\"");
        }
        consume();
        return v;
    }

    public float nextFloat() {
        return (float) nextDouble();
    }

    public boolean nextBoolean() {
        String t = nextNumberToken();
        if (!t.equalsIgnoreCase("true") && !t.equalsIgnoreCase("false")) {
            throw new InputMismatchException(t);
        }
        consume();
        return t.equalsIgnoreCase("true");
    }

    public BigInteger nextBigInteger() {
        String t = nextNumberToken();
        BigInteger v;
        try {
            v = new BigInteger(t);
        } catch (NumberFormatException e) {
            throw new InputMismatchException(t);
        }
        consume();
        return v;
    }

    public BigDecimal nextBigDecimal() {
        String t = nextNumberToken();
        BigDecimal v;
        try {
            v = new BigDecimal(t);
        } catch (NumberFormatException e) {
            throw new InputMismatchException(t);
        }
        consume();
        return v;
    }

    public boolean hasNextInt() {
        String t = peekToken();
        if (t == null) {
            return false;
        }
        try {
            Integer.parseInt(t);
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    public boolean hasNextLong() {
        String t = peekToken();
        if (t == null) {
            return false;
        }
        try {
            Long.parseLong(t);
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    public boolean hasNextDouble() {
        String t = peekToken();
        if (t == null) {
            return false;
        }
        try {
            Double.parseDouble(t);
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    public boolean hasNextLine() {
        ensureOpen();
        return pos < s.length();
    }

    public String nextLine() {
        ensureOpen();
        int n = s.length();
        if (pos >= n) {
            throw new NoSuchElementException("No line found");
        }
        int i = pos;
        while (i < n && s.charAt(i) != '\n' && s.charAt(i) != '\r') {
            i++;
        }
        String line = s.substring(pos, i);
        if (i < n && s.charAt(i) == '\r') {
            i++;
        }
        if (i < n && s.charAt(i) == '\n') {
            i++;
        }
        pos = i;
        return line;
    }

    @Override
    public void remove() {
        throw new UnsupportedOperationException();
    }

    @Override
    public void close() {
        closed = true;
    }
}
