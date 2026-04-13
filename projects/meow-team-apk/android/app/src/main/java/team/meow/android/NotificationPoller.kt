package team.meow.android

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.LinkedHashSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray

class NotificationPoller(
  private val context: Context,
  private val scope: CoroutineScope,
) {
  private val preferences =
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
  private val deliveredFingerprints = LinkedHashSet(readStoredFingerprints())
  private var activeBackendBaseUrl: String? = null
  private var pollJob: Job? = null

  fun start(baseUrl: String) {
    if (pollJob?.isActive == true && activeBackendBaseUrl == baseUrl) {
      return
    }

    stop()
    activeBackendBaseUrl = baseUrl
    ensureNotificationChannel()

    pollJob =
      scope.launch {
        while (isActive) {
          runCatching {
            withContext(Dispatchers.IO) {
              BackendClient.fetchNotifications(baseUrl)
            }
          }.onSuccess { snapshot ->
            if (snapshot.target == NotificationTarget.ANDROID) {
              deliver(snapshot.notifications)
            }
          }

          delay(POLL_INTERVAL_MS)
        }
      }
  }

  fun stop() {
    pollJob?.cancel()
    pollJob = null
    activeBackendBaseUrl = null
  }

  private fun deliver(notifications: List<AttentionNotification>) {
    for (notification in notifications) {
      if (deliveredFingerprints.contains(notification.fingerprint)) {
        continue
      }

      val launchIntent =
        Intent(context, MainActivity::class.java).apply {
          flags =
            Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_CLEAR_TOP or
              Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
      val pendingIntent =
        PendingIntent.getActivity(
          context,
          notification.tag.hashCode(),
          launchIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      val priority =
        if (notification.reason == "awaiting_human_approval") {
          NotificationCompat.PRIORITY_HIGH
        } else {
          NotificationCompat.PRIORITY_DEFAULT
        }

      val androidNotification =
        NotificationCompat.Builder(context, CHANNEL_ID)
          .setSmallIcon(android.R.drawable.stat_notify_more)
          .setContentTitle(notification.title)
          .setContentText(notification.body)
          .setStyle(NotificationCompat.BigTextStyle().bigText(notification.body))
          .setAutoCancel(true)
          .setContentIntent(pendingIntent)
          .setPriority(priority)
          .build()

      try {
        NotificationManagerCompat.from(context).notify(
          notification.tag,
          notification.tag.hashCode(),
          androidNotification,
        )
        rememberFingerprint(notification.fingerprint)
      } catch (_: SecurityException) {
        return
      }
    }
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val channel =
      NotificationChannel(
        CHANNEL_ID,
        context.getString(R.string.notification_channel_name),
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = context.getString(R.string.notification_channel_description)
      }

    val notificationManager =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    notificationManager.createNotificationChannel(channel)
  }

  private fun rememberFingerprint(fingerprint: String) {
    deliveredFingerprints += fingerprint
    while (deliveredFingerprints.size > MAX_STORED_ATTENTION_FINGERPRINTS) {
      val oldest = deliveredFingerprints.firstOrNull() ?: break
      deliveredFingerprints.remove(oldest)
    }
    persistDeliveredFingerprints()
  }

  private fun readStoredFingerprints(): Set<String> {
    val rawValue = preferences.getString(KEY_DELIVERED_FINGERPRINTS, "[]") ?: "[]"
    return runCatching {
      val array = JSONArray(rawValue)
      buildSet {
        for (index in 0 until array.length()) {
          add(array.getString(index))
        }
      }
    }.getOrElse {
      emptySet()
    }
  }

  private fun persistDeliveredFingerprints() {
    val payload =
      JSONArray().apply {
        deliveredFingerprints.forEach { fingerprint ->
          put(fingerprint)
        }
      }

    preferences.edit().putString(KEY_DELIVERED_FINGERPRINTS, payload.toString()).apply()
  }

  companion object {
    private const val CHANNEL_ID = "meow-team-attention"
    private const val KEY_DELIVERED_FINGERPRINTS = "delivered-attention-fingerprints"
    private const val MAX_STORED_ATTENTION_FINGERPRINTS = 64
    private const val POLL_INTERVAL_MS = 5_000L
    private const val PREFERENCES_NAME = "meow-team-android"
  }
}
