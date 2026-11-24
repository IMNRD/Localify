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
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Lists songs and videos from Android's media index. Only listed files can be played (see MediaServer). */
@CapacitorPlugin(
    name = "MediaLibrary",
    permissions = {
        @Permission(alias = "media", strings = { Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_MEDIA_VIDEO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class MediaLibraryPlugin extends Plugin {

    /** "media/<id>" or "video/<id>" -> absolute file path. */
    static final Map<String, String> FILES = new ConcurrentHashMap<>();

    private static String alias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "media" : "storage";
    }

    @PluginMethod
    public void list(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias(), call, "permissionDone");
            return;
        }
        respond(call);
    }

    @PermissionCallback
    private void permissionDone(PluginCall call) {
        if (getPermissionState(alias()) == PermissionState.GRANTED) respond(call);
        else {
            JSObject r = new JSObject();
            r.put("granted", false);
            r.put("audio", new JSArray());
            r.put("video", new JSArray());
            call.resolve(r);
        }
    }

    private void respond(PluginCall call) {
        FILES.clear();
        JSObject r = new JSObject();
        r.put("granted", true);
        r.put("audio", query("media", MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, MediaStore.Audio.Media.IS_MUSIC + " != 0", true));
        r.put("video", query("video", MediaStore.Video.Media.EXTERNAL_CONTENT_URI, null, false));
        call.resolve(r);
    }

    private JSArray query(String kind, Uri uri, String where, boolean audio) {
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
                FILES.put(kind + "/" + id, path);
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
