package team.meow.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

class NotificationMonitorService : Service() {
  private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private lateinit var backendConfigStore: BackendConfigStore
  private lateinit var notificationPoller: NotificationPoller

  override fun onCreate() {
    super.onCreate()
    backendConfigStore = BackendConfigStore(this)
    notificationPoller = NotificationPoller(this, serviceScope)
    ensureMonitoringChannel()
    startForegroundWithNotification(buildMonitoringNotification(null))
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP_MONITORING) {
      stopMonitoring()
      return START_NOT_STICKY
    }

    val baseUrl = resolveBaseUrl(intent)
    if (baseUrl == null) {
      stopMonitoring()
      return START_NOT_STICKY
    }

    notificationPoller.start(baseUrl)
    startForegroundWithNotification(buildMonitoringNotification(baseUrl))
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    notificationPoller.stop()
    serviceScope.cancel()
    super.onDestroy()
  }

  private fun resolveBaseUrl(intent: Intent?): String? {
    val explicitBaseUrl =
      intent
        ?.getStringExtra(EXTRA_BACKEND_URL)
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
    if (explicitBaseUrl != null) {
      return explicitBaseUrl
    }

    if (!backendConfigStore.hasStoredBackendBaseUrl()) {
      return null
    }

    return backendConfigStore.readBackendBaseUrl().trim().takeIf { it.isNotEmpty() }
  }

  private fun stopMonitoring() {
    notificationPoller.stop()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun ensureMonitoringChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val channel =
      NotificationChannel(
        MONITORING_CHANNEL_ID,
        getString(R.string.monitoring_channel_name),
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = getString(R.string.monitoring_channel_description)
        lockscreenVisibility = Notification.VISIBILITY_PRIVATE
      }

    val notificationManager =
      getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    notificationManager.createNotificationChannel(channel)
  }

  private fun buildMonitoringNotification(baseUrl: String?): Notification {
    val launchIntent =
      Intent(this, MainActivity::class.java).apply {
        flags =
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
      }
    val contentIntent =
      PendingIntent.getActivity(
        this,
        REQUEST_CODE_OPEN_APP,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    val stopIntent =
      PendingIntent.getService(
        this,
        REQUEST_CODE_STOP_MONITORING,
        createStopIntent(this),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    val contentText =
      if (baseUrl.isNullOrBlank()) {
        getString(R.string.monitoring_notification_starting)
      } else {
        getString(R.string.monitoring_notification_active_format, baseUrl)
      }

    return NotificationCompat.Builder(this, MONITORING_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setContentTitle(getString(R.string.monitoring_notification_title))
      .setContentText(contentText)
      .setStyle(NotificationCompat.BigTextStyle().bigText(contentText))
      .setContentIntent(contentIntent)
      .addAction(0, getString(R.string.monitoring_notification_stop_action), stopIntent)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setSilent(true)
      .build()
  }

  private fun startForegroundWithNotification(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        MONITORING_NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
      return
    }

    startForeground(MONITORING_NOTIFICATION_ID, notification)
  }

  companion object {
    private const val ACTION_START_MONITORING = "team.meow.android.action.START_MONITORING"
    private const val ACTION_STOP_MONITORING = "team.meow.android.action.STOP_MONITORING"
    private const val EXTRA_BACKEND_URL = "backend_url"
    private const val MONITORING_CHANNEL_ID = "meow-team-background-monitoring"
    private const val MONITORING_NOTIFICATION_ID = 1001
    private const val REQUEST_CODE_OPEN_APP = 1001
    private const val REQUEST_CODE_STOP_MONITORING = 1002

    fun start(context: Context, baseUrl: String) {
      val startIntent =
        Intent(context, NotificationMonitorService::class.java).apply {
          action = ACTION_START_MONITORING
          putExtra(EXTRA_BACKEND_URL, baseUrl)
        }
      ContextCompat.startForegroundService(context, startIntent)
    }

    fun stop(context: Context) {
      context.startService(createStopIntent(context))
    }

    private fun createStopIntent(context: Context): Intent {
      return Intent(context, NotificationMonitorService::class.java).apply {
        action = ACTION_STOP_MONITORING
      }
    }
  }
}
