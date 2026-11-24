package local.localify.app;

import android.webkit.WebResourceResponse;
import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Serves /_localify/media/<id> and /_localify/video/<id> with real HTTP Range support, so seeking works
 * (Capacitor's own file server always streams from byte 0). Only files listed by MediaLibraryPlugin are served.
 */
final class MediaServer {

    private static final Pattern KEY = Pattern.compile("^(media|video)/[0-9a-f]{16}$");
    private static final Pattern RANGE = Pattern.compile("^bytes=(\\d*)-(\\d*)$");
    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("mp3", "audio/mpeg");
        MIME.put("flac", "audio/flac");
        MIME.put("m4a", "audio/mp4");
        MIME.put("aac", "audio/aac");
        MIME.put("wav", "audio/wav");
        MIME.put("ogg", "audio/ogg");
        MIME.put("opus", "audio/ogg");
        MIME.put("mp4", "video/mp4");
        MIME.put("m4v", "video/mp4");
        MIME.put("mov", "video/mp4");
        MIME.put("webm", "video/webm");
        MIME.put("mkv", "video/webm");
    }

    private MediaServer() {}

    static WebResourceResponse serve(String key, Map<String, String> requestHeaders) {
        String path = KEY.matcher(key).matches() ? MediaLibraryPlugin.FILES.get(key) : null;
        File f = path == null ? null : new File(path);
        if (f == null || !f.isFile() || f.length() == 0) return status(404, "Not Found", null);
        long size = f.length(), start = 0, end = size - 1;
        String range = header(requestHeaders, "Range");
        boolean partial = range != null;
        if (partial) {
            Matcher m = RANGE.matcher(range.trim());
            if (!m.matches() || (m.group(1).isEmpty() && m.group(2).isEmpty())) return unsatisfiable(size);
            if (m.group(1).isEmpty()) start = Math.max(0, size - Long.parseLong(m.group(2)));
            else {
                start = Long.parseLong(m.group(1));
                if (!m.group(2).isEmpty()) end = Math.min(end, Long.parseLong(m.group(2)));
            }
            if (start > end || start >= size) return unsatisfiable(size);
        }
        try {
            InputStream in = new FileInputStream(f);
            long skipped = 0;
            while (skipped < start) {
                long n = in.skip(start - skipped);
                if (n <= 0) throw new IOException("skip failed");
                skipped += n;
            }
            Map<String, String> h = new HashMap<>();
            h.put("Accept-Ranges", "bytes");
            h.put("Content-Length", String.valueOf(end - start + 1));
            if (partial) h.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
            String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            return new WebResourceResponse(mime, null, partial ? 206 : 200, partial ? "Partial Content" : "OK", h, new Limited(in, end - start + 1));
        } catch (IOException e) {
            return status(404, "Not Found", null);
        }
    }

    private static String header(Map<String, String> headers, String name) {
        if (headers == null) return null;
        for (Map.Entry<String, String> e : headers.entrySet()) if (e.getKey().equalsIgnoreCase(name)) return e.getValue();
        return null;
    }

    private static WebResourceResponse unsatisfiable(long size) {
        Map<String, String> h = new HashMap<>();
        h.put("Content-Range", "bytes */" + size);
        return status(416, "Range Not Satisfiable", h);
    }

    private static WebResourceResponse status(int code, String reason, Map<String, String> headers) {
        return new WebResourceResponse("text/plain", "utf-8", code, reason, headers == null ? new HashMap<>() : headers, null);
    }

    /** Stops after the requested number of bytes. */
    private static final class Limited extends FilterInputStream {
        private long left;

        Limited(InputStream in, long left) {
            super(in);
            this.left = left;
        }

        @Override
        public int read() throws IOException {
            if (left <= 0) return -1;
            int b = super.read();
            if (b >= 0) left--;
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int n = super.read(buf, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), left);
        }
    }
}
