package local.localify.app;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaLibraryPlugin.class);
        super.onCreate(savedInstanceState);
        // No bridge when the phone has no WebView: Capacitor is already showing its own message.
        if (bridge == null) return;
        // Songs and videos go through MediaServer so seeking works; everything else is Capacitor's.
        bridge.setWebViewClient(
            new BridgeWebViewClient(bridge) {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    String p = request.getUrl().getPath();
                    if (p != null && p.startsWith("/_localify/")) return MediaServer.serve(p.substring(11), request.getRequestHeaders());
                    return super.shouldInterceptRequest(view, request);
                }
            }
        );
    }
}
