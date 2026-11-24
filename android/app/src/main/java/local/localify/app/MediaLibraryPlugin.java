package local.localify.app;

import android.Manifest;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Lists songs and videos from Android's media index. Only listed files can be played (see MediaServer). */
@CapacitorPlugin(
    name = "MediaLibrary",
    permissions = {
        // Android 13+ asks for music and videos separately; each is used on its own if granted.
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "video", strings = { Manifest.permission.READ_MEDIA_VIDEO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class MediaLibraryPlugin extends Plugin {

    /** "media/<id>" or "video/<id>" -> absolute file path. */
    static final Map<String, String> FILES = new ConcurrentHashMap<>();

    private static final boolean SPLIT = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU;

    private boolean allowed(String kind) {
        return getPermissionState(SPLIT ? kind : "storage") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void list(PluginCall call) {
        if (!allowed("audio") || !allowed("video")) {
            // Android shows no dialog again for a permission the user refused for good; the callback still runs.
            requestPermissionForAliases(SPLIT ? new String[] { "audio", "video" } : new String[] { "storage" }, call, "permissionDone");
            return;
        }
        respond(call);
    }

    @PermissionCallback
    private void permissionDone(PluginCall call) {
        respond(call);
    }

    private void respond(PluginCall call) {
        boolean audio = allowed("audio"), video = allowed("video");
        Map<String, String> next = new HashMap<>();
        JSObject r = new JSObject();
        r.put("granted", audio || video);
        r.put("audio", audio ? query("media", MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, MediaStore.Audio.Media.IS_MUSIC + " != 0", true, next) : new JSArray());
        r.put("video", video ? query("video", MediaStore.Video.Media.EXTERNAL_CONTENT_URI, null, false, next) : new JSArray());
        // Swap in the new list without emptying it first, so a song that is playing never 404s mid-rescan.
        FILES.putAll(next);
        FILES.keySet().retainAll(next.keySet());
        call.resolve(r);
    }

    private JSArray query(String kind, Uri uri, String where, boolean audio, Map<String, String> files) {
        JSArray out = new JSArray();
        String[] cols = audio
            ? new String[] { "_id", "_data", "title", "artist", "album", "track", "year", "duration", "_size", "date_added" }
            : new String[] { "_id", "_data", "duration", "_size", "date_added" };
        try (Cursor c = getContext().getContentResolver().query(uri, cols, where, null, null)) {
            if (c == null) return out;
            while (c.moveToNext()) {
                String path = c.getString(1);
                if (path == null) continue;
                String id = String.format("%016x", c.getLong(0));
                files.put(kind + "/" + id, path);
                JSObject o = new JSObject();
                o.put("id", id);
                o.put("path", path);
                for (int i = 2; i < cols.length; i++) o.put(camel(cols[i]), c.getString(i));
                out.put(o);
            }
        } catch (SecurityException e) {
            // Permission was only partly granted (for example audio but not video): show what we can.
        }
        return out;
    }

    private static String camel(String col) {
        return col.equals("_size") ? "size" : col.equals("date_added") ? "dateAdded" : col;
    }
}
