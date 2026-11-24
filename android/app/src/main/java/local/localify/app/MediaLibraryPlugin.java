package local.localify.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Lists songs and videos inside the chosen folders, from Android's media index, and opens Android's folder picker.
 * Only listed files can be played (see MediaServer).
 */
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

    /** Opens Android's folder picker; resolves {path} or {canceled, unsupported?}. */
    @PluginMethod
    public void pickFolder(PluginCall call) {
        startActivityForResult(call, new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        Uri uri = result.getResultCode() == Activity.RESULT_OK && data != null ? data.getData() : null;
        String path = uri == null ? null : treeToPath(uri);
        JSObject r = new JSObject();
        if (path != null) r.put("path", path);
        else {
            r.put("canceled", true);
            if (uri != null) r.put("unsupported", true);
        }
        call.resolve(r);
    }

    /** "primary:Music/Rock" -> /storage/emulated/0/Music/Rock; "1A2B-3C4D:Music" -> /storage/1A2B-3C4D/Music. */
    static String treeToPath(Uri uri) {
        String id;
        try {
            id = DocumentsContract.getTreeDocumentId(uri);
        } catch (IllegalArgumentException e) {
            return null;
        }
        if (id.startsWith("raw:")) return id.substring(4);
        int c = id.indexOf(':');
        if (c <= 0 || !"com.android.externalstorage.documents".equals(uri.getAuthority())) return null;
        String vol = id.substring(0, c), rel = id.substring(c + 1);
        String root = vol.equalsIgnoreCase("primary") ? Environment.getExternalStorageDirectory().getPath() : "/storage/" + vol;
        return rel.isEmpty() ? root : root + "/" + rel;
    }

    /** Takes {music: [folders], video: [folders]}; asks for permission only once there is a folder to read. */
    @PluginMethod
    public void list(PluginCall call) {
        if (folders(call, "music").isEmpty() && folders(call, "video").isEmpty()) {
            respond(call);
            return;
        }
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
        List<String> musicDirs = folders(call, "music"), videoDirs = folders(call, "video");
        boolean audio = allowed("audio"), video = allowed("video");
        Map<String, String> next = new HashMap<>();
        JSObject r = new JSObject();
        r.put("granted", audio || video);
        r.put("audio", audio ? query("media", MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, MediaStore.Audio.Media.IS_MUSIC + " != 0", true, musicDirs, next) : new JSArray());
        r.put("video", video ? query("video", MediaStore.Video.Media.EXTERNAL_CONTENT_URI, null, false, videoDirs, next) : new JSArray());
        // Swap in the new list without emptying it first, so a song that is playing never 404s mid-rescan.
        FILES.putAll(next);
        FILES.keySet().retainAll(next.keySet());
        call.resolve(r);
    }

    private static List<String> folders(PluginCall call, String key) {
        List<String> out = new ArrayList<>();
        JSArray a = call.getArray(key, new JSArray());
        for (int i = 0; i < a.length(); i++) {
            String f = a.optString(i, "");
            if (f.startsWith("/")) out.add(f.endsWith("/") ? f : f + "/");
        }
        return out;
    }

    private static boolean inside(String path, List<String> dirs) {
        for (String d : dirs) if (path.startsWith(d)) return true;
        return false;
    }

    private JSArray query(String kind, Uri uri, String where, boolean audio, List<String> dirs, Map<String, String> files) {
        JSArray out = new JSArray();
        String[] cols = audio
            ? new String[] { "_id", "_data", "title", "artist", "album", "track", "year", "duration", "_size", "date_added" }
            : new String[] { "_id", "_data", "duration", "_size", "date_added" };
        try (Cursor c = getContext().getContentResolver().query(uri, cols, where, null, null)) {
            if (c == null) return out;
            while (c.moveToNext()) {
                String path = c.getString(1);
                if (path == null || !inside(path, dirs)) continue;
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
