package team.meow.android

import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URISyntaxException
import java.net.URL
import org.json.JSONObject

enum class NotificationTarget(val wireValue: String, val displayName: String) {
  BROWSER("browser", "Browser"),
  VSCODE("vscode", "VS Code"),
  ANDROID("android", "Android app");

  companion object {
    fun fromWire(value: String): NotificationTarget {
      return entries.firstOrNull { it.wireValue == value }
        ?: throw IllegalStateException("Unsupported notification target: $value")
    }
  }
}

data class WorkspaceSummary(
  val backendBaseUrl: String,
  val workspaceUrl: String,
  val notificationTarget: NotificationTarget,
)

data class AttentionNotification(
  val title: String,
  val body: String,
  val tag: String,
  val fingerprint: String,
  val reason: String,
)

data class NotificationSnapshot(
  val target: NotificationTarget,
  val notifications: List<AttentionNotification>,
)

object BackendClient {
  private const val CONNECT_TIMEOUT_MS = 3_000
  private const val READ_TIMEOUT_MS = 5_000

  fun normalizeBaseUrl(rawValue: String): String {
    val trimmed = rawValue.trim()
    require(trimmed.isNotEmpty()) { "Enter the Next.js backend URL first." }

    val uri =
      try {
        URI(trimmed)
      } catch (_: URISyntaxException) {
        throw IllegalArgumentException("\"$trimmed\" is not a valid HTTP base URL.")
      }

    val scheme = uri.scheme?.lowercase()
    require(scheme == "http" || scheme == "https") {
      "Backend URLs must use http or https."
    }

    val host = uri.host
    require(!host.isNullOrBlank()) { "\"$trimmed\" is not a valid HTTP base URL." }

    val normalizedPath = uri.path?.trimEnd('/').takeUnless { it.isNullOrBlank() }

    return URI(scheme, uri.userInfo, host, uri.port, normalizedPath, null, null)
      .toString()
      .trimEnd('/')
  }

  fun buildWorkspaceUrl(baseUrl: String): String = "${normalizeBaseUrl(baseUrl)}/"

  fun fetchWorkspaceSummary(baseUrl: String): WorkspaceSummary {
    val normalizedBaseUrl = normalizeBaseUrl(baseUrl)
    val payload = requestJson(buildEndpointUrl(normalizedBaseUrl, "api/team/threads"))
    val notifications =
      payload.optJSONObject("notifications")
        ?: throw IllegalStateException("The backend thread snapshot did not include notifications.")
    val notificationTarget = NotificationTarget.fromWire(notifications.getString("target"))

    return WorkspaceSummary(
      backendBaseUrl = normalizedBaseUrl,
      workspaceUrl = buildWorkspaceUrl(normalizedBaseUrl),
      notificationTarget = notificationTarget,
    )
  }

  fun fetchNotifications(baseUrl: String): NotificationSnapshot {
    val normalizedBaseUrl = normalizeBaseUrl(baseUrl)
    val payload = requestJson(buildEndpointUrl(normalizedBaseUrl, "api/team/notifications"))
    val notificationsJson = payload.optJSONArray("notifications")
    val notifications =
      buildList {
        if (notificationsJson == null) {
          return@buildList
        }

        for (index in 0 until notificationsJson.length()) {
          val entry =
            notificationsJson.optJSONObject(index)
              ?: throw IllegalStateException("Notification payload $index was not an object.")
          add(
            AttentionNotification(
              title = entry.getString("title"),
              body = entry.getString("body"),
              tag = entry.getString("tag"),
              fingerprint = entry.getString("fingerprint"),
              reason = entry.getString("reason"),
            ),
          )
        }
      }

    return NotificationSnapshot(
      target = NotificationTarget.fromWire(payload.getString("target")),
      notifications = notifications,
    )
  }

  private fun buildEndpointUrl(baseUrl: String, relativePath: String): String {
    return URI("${normalizeBaseUrl(baseUrl)}/").resolve(relativePath).toString()
  }

  private fun requestJson(urlString: String): JSONObject {
    val connection = URL(urlString).openConnection() as HttpURLConnection
    connection.requestMethod = "GET"
    connection.connectTimeout = CONNECT_TIMEOUT_MS
    connection.readTimeout = READ_TIMEOUT_MS
    connection.setRequestProperty("Accept", "application/json")
    connection.instanceFollowRedirects = true

    try {
      val status = connection.responseCode
      val payloadText = readPayloadText(if (status in 200..299) connection.inputStream else connection.errorStream)

      if (status !in 200..299) {
        throw IllegalStateException(extractBackendError(payloadText, status))
      }

      return JSONObject(payloadText)
    } finally {
      connection.disconnect()
    }
  }

  private fun extractBackendError(payloadText: String, status: Int): String {
    if (payloadText.isBlank()) {
      return "The backend request failed with HTTP $status."
    }

    return runCatching { JSONObject(payloadText).optString("error") }
      .getOrNull()
      ?.takeIf { it.isNotBlank() }
      ?: "The backend request failed with HTTP $status."
  }

  private fun readPayloadText(stream: InputStream?): String {
    return stream?.bufferedReader()?.use { it.readText() } ?: ""
  }
}
