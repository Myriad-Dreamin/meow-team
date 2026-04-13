package team.meow.android

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.text.TextUtils
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
  private lateinit var backendConfigStore: BackendConfigStore
  private lateinit var notificationPoller: NotificationPoller
  private lateinit var backendUrlInput: TextInputEditText
  private lateinit var connectionStatusText: TextView
  private lateinit var notificationRouteText: TextView
  private lateinit var workspaceWebView: WebView
  private var activeBackendBaseUrl: String? = null

  private val notificationPermissionRequest =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      if (!granted) {
        connectionStatusText.text = getString(R.string.notification_permission_denied)
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)

    backendConfigStore = BackendConfigStore(this)
    notificationPoller = NotificationPoller(this, lifecycleScope)
    backendUrlInput = findViewById(R.id.backendUrlInput)
    connectionStatusText = findViewById(R.id.connectionStatusText)
    notificationRouteText = findViewById(R.id.notificationRouteText)
    workspaceWebView = findViewById(R.id.workspaceWebView)

    val launchBackendOverride = readBackendBaseUrlOverride(intent)
    val savedBackendBaseUrl = backendConfigStore.readBackendBaseUrl()
    val shouldAutoConnect =
      launchBackendOverride != null || backendConfigStore.hasStoredBackendBaseUrl()

    connectionStatusText.text = getString(R.string.connection_status_idle)
    notificationRouteText.text =
      getString(
        if (shouldAutoConnect) {
          R.string.notification_route_pending
        } else {
          R.string.notification_route_idle
        },
      )
    backendUrlInput.setText(launchBackendOverride ?: savedBackendBaseUrl)
    requestNotificationPermissionIfNeeded()
    configureWebView()

    findViewById<MaterialButton>(R.id.connectButton).setOnClickListener {
      connect(loadWorkspace = true)
    }

    if (shouldAutoConnect) {
      connect(loadWorkspace = true)
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)

    val launchBackendOverride = readBackendBaseUrlOverride(intent) ?: return
    backendUrlInput.setText(launchBackendOverride)
    connect(loadWorkspace = true)
  }

  override fun onStart() {
    super.onStart()
    activeBackendBaseUrl?.let(notificationPoller::start)
  }

  override fun onStop() {
    notificationPoller.stop()
    super.onStop()
  }

  override fun onDestroy() {
    workspaceWebView.destroy()
    super.onDestroy()
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun configureWebView() {
    workspaceWebView.settings.javaScriptEnabled = true
    workspaceWebView.settings.domStorageEnabled = true
    workspaceWebView.webViewClient =
      object : WebViewClient() {
        override fun onPageFinished(view: WebView?, url: String?) {
          if (!url.isNullOrBlank()) {
            connectionStatusText.text = getString(R.string.workspace_loaded_format, url)
          }
        }

        override fun onReceivedError(
          view: WebView?,
          request: WebResourceRequest?,
          error: WebResourceError?,
        ) {
          if (request?.isForMainFrame == true) {
            connectionStatusText.text =
              getString(
                R.string.workspace_failed_format,
                error?.description?.toString() ?: getString(R.string.workspace_failed_unknown),
              )
          }
        }
      }
  }

  private fun connect(loadWorkspace: Boolean) {
    val rawBackendBaseUrl = backendUrlInput.text?.toString().orEmpty()
    val normalizedBackendBaseUrl =
      try {
        BackendClient.normalizeBaseUrl(rawBackendBaseUrl)
      } catch (error: IllegalArgumentException) {
        connectionStatusText.text = error.message ?: getString(R.string.connection_failed_unknown)
        return
      }

    backendConfigStore.writeBackendBaseUrl(normalizedBackendBaseUrl)
    connectionStatusText.text =
      getString(R.string.connection_status_connecting_format, normalizedBackendBaseUrl)
    notificationRouteText.text = getString(R.string.notification_route_pending)

    lifecycleScope.launch {
      runCatching {
        withContext(Dispatchers.IO) {
          BackendClient.fetchWorkspaceSummary(normalizedBackendBaseUrl)
        }
      }.onSuccess { summary ->
        activeBackendBaseUrl = summary.backendBaseUrl
        backendUrlInput.setText(summary.backendBaseUrl)
        notificationRouteText.text =
          getString(R.string.notification_route_format, summary.notificationTarget.displayName)
        connectionStatusText.text =
          getString(R.string.connection_status_connected_format, summary.backendBaseUrl)
        notificationPoller.start(summary.backendBaseUrl)

        if (loadWorkspace) {
          workspaceWebView.loadUrl(summary.workspaceUrl)
        }
      }.onFailure { error ->
        activeBackendBaseUrl = null
        notificationPoller.stop()
        notificationRouteText.text = getString(R.string.notification_route_unavailable)
        connectionStatusText.text =
          getString(
            R.string.connection_status_failed_format,
            normalizedBackendBaseUrl,
            error.message ?: getString(R.string.connection_failed_unknown),
          )

        if (loadWorkspace) {
          workspaceWebView.loadDataWithBaseURL(
            null,
            buildConnectionErrorHtml(normalizedBackendBaseUrl, error.message),
            "text/html",
            "utf-8",
            null,
          )
        }
      }
    }
  }

  private fun buildConnectionErrorHtml(baseUrl: String, errorMessage: String?): String {
    val encodedBaseUrl = TextUtils.htmlEncode(baseUrl)
    val encodedError =
      TextUtils.htmlEncode(errorMessage ?: getString(R.string.connection_failed_unknown))

    return """
      <html lang="en">
        <body style="font-family: sans-serif; padding: 24px;">
          <h2>Backend unavailable</h2>
          <p>Unable to reach $encodedBaseUrl.</p>
          <p>$encodedError</p>
        </body>
      </html>
    """.trimIndent()
  }

  private fun readBackendBaseUrlOverride(intent: Intent?): String? {
    if (intent == null) {
      return null
    }

    val rawValue =
      intent.getStringExtra(EXTRA_BACKEND_URL)
        ?: intent.data?.getQueryParameter(QUERY_PARAMETER_BACKEND_URL)
        ?: intent.data?.getQueryParameter(QUERY_PARAMETER_BACKEND_URL_CAMEL)
        ?: return null

    return try {
      BackendClient.normalizeBaseUrl(rawValue)
    } catch (_: IllegalArgumentException) {
      null
    }
  }

  private fun requestNotificationPermissionIfNeeded() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return
    }

    if (
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
    ) {
      return
    }

    notificationPermissionRequest.launch(Manifest.permission.POST_NOTIFICATIONS)
  }

  companion object {
    private const val EXTRA_BACKEND_URL = "backend_url"
    private const val QUERY_PARAMETER_BACKEND_URL = "backend_url"
    private const val QUERY_PARAMETER_BACKEND_URL_CAMEL = "backendUrl"
  }
}
