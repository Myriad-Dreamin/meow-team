package team.meow.android

import android.content.Context

class BackendConfigStore(context: Context) {
  private val preferences =
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  fun hasStoredBackendBaseUrl(): Boolean {
    return preferences.contains(KEY_BACKEND_BASE_URL)
  }

  fun readBackendBaseUrl(): String {
    return preferences.getString(KEY_BACKEND_BASE_URL, DEFAULT_BACKEND_BASE_URL)
      ?: DEFAULT_BACKEND_BASE_URL
  }

  fun writeBackendBaseUrl(value: String) {
    preferences.edit().putString(KEY_BACKEND_BASE_URL, value).apply()
  }

  companion object {
    private const val PREFERENCES_NAME = "meow-team-android"
    private const val KEY_BACKEND_BASE_URL = "backend-base-url"

    const val DEFAULT_BACKEND_BASE_URL = "http://10.0.2.2:3000"
  }
}
