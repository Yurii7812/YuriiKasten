package net.yurii.note

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Calendar

/** 定期の通知。通知を押すと日記の入力を開く。 */
object Alarm {
    // 旧チャンネルの無音設定を引き継がず、アラーム音で作る。
    const val CHANNEL = "gnosis_capture_alarm_v2"
    const val EXTRA_PROMPT = "prompt"
    private const val REQ = 4201
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("alarm", Context.MODE_PRIVATE)

    fun ensureChannel(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            val ch = NotificationChannel(CHANNEL, I18n.tr("定期のメモ"), NotificationManager.IMPORTANCE_HIGH)
            ch.description = I18n.tr("今まで何をしていたかを書くための通知")
            ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            ch.enableVibration(true)
            nm.createNotificationChannel(ch)
        }
    }

    fun notificationsEnabled(ctx: Context): Boolean {
        ensureChannel(ctx)
        val ch = ctx.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL)
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled() && ch.importance != NotificationManager.IMPORTANCE_NONE
    }

    fun hasNotificationPermission(ctx: Context): Boolean = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun canScheduleExact(ctx: Context): Boolean = Build.VERSION.SDK_INT < 31 || ctx.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
    fun scheduledTime(ctx: Context) = prefs(ctx).getLong("next", 0)

    private fun pending(ctx: Context): PendingIntent =
        PendingIntent.getBroadcast(ctx, REQ, Intent(ctx, AlarmReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun nextTime(s: Settings, now: Long = System.currentTimeMillis()): Long =
        AlarmTiming.next(s.alarmMinutes, s.fromHour, s.toHour, now)

    /** 画面に戻るたびに予定を延期しない。許可変更・消えた予定だけを回復する。 */
    fun ensureScheduled(ctx: Context, s: Settings) {
        val p = prefs(ctx)
        if (s.alarmOn && (scheduledTime(ctx) <= System.currentTimeMillis() || p.getBoolean("exact", false) != canScheduleExact(ctx))) schedule(ctx, s)
    }

    fun schedule(ctx: Context, s: Settings) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        am.cancel(pending(ctx))
        if (!s.alarmOn) { prefs(ctx).edit().remove("next").apply(); return }
        val at = nextTime(s)
        var exact = canScheduleExact(ctx)
        try {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(ctx))
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(ctx))
        } catch (_: SecurityException) {
            exact = false
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(ctx))
        }
        prefs(ctx).edit().putLong("next", at).putBoolean("exact", exact).apply()
    }

    /** 鳴ったあと次にアプリを開いたら日記で書き始める（通知を押さずにアプリから開いた場合も）。 */
    fun takePrompt(ctx: Context): Boolean {
        val p = prefs(ctx).getBoolean("prompt", false)
        if (p) {
            prefs(ctx).edit().remove("prompt").apply()
            ctx.getSystemService(NotificationManager::class.java).cancel(REQ)
        }
        return p
    }

    /**
     * 通知を出す。ringSeconds が 0 より大きいと、その秒数のあいだ音を繰り返し（FLAG_INSISTENT）、
     * 時間が来たら音なしで出し直して止める（通知は残る）。0 なら 1 回だけ鳴らす。
     */
    fun notify(ctx: Context, ringSeconds: Int = Store(ctx).loadSettings().ringSeconds, silent: Boolean = false) {
        ensureChannel(ctx)
        prefs(ctx).edit().putBoolean("prompt", true).apply()
        val open = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_PROMPT, true)
        }
        val pi = PendingIntent.getActivity(ctx, REQ + 1, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_note)
            .setContentTitle(I18n.tr("今まで何してた？"))
            .setContentText(I18n.tr("押すと日記に書けます"))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setSilent(silent)
            .build()
        if (!silent && ringSeconds > 0) n.flags = n.flags or android.app.Notification.FLAG_INSISTENT
        val nm = ctx.getSystemService(NotificationManager::class.java)
        try {
            if (silent) nm.cancel(REQ)   // 繰り返している音は、出し直す前に消すと止まる
            nm.notify(REQ, n)
        } catch (_: SecurityException) { /* 画面側に通知の許可状態を表示する。 */ }
        if (!silent && ringSeconds > 0) scheduleStop(ctx, ringSeconds)
    }

    /** ringSeconds 秒後に音を止める（RingStopReceiver が音なしで出し直す）。 */
    private fun scheduleStop(ctx: Context, seconds: Int) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        val pi = PendingIntent.getBroadcast(ctx, REQ + 2, Intent(ctx, RingStopReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val at = System.currentTimeMillis() + seconds * 1000L
        try {
            if (canScheduleExact(ctx)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } catch (_: SecurityException) { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi) }
    }

    /** 鳴っている通知があれば、音なしで出し直して音を止める（アプリを開いたときも止める）。 */
    fun stopRinging(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.activeNotifications.any { it.id == REQ && (it.notification.flags and android.app.Notification.FLAG_INSISTENT) != 0 })
            notify(ctx, 0, silent = true)
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val s = Store(ctx).loadSettings()
        if (!s.alarmOn) return
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        try {
            // 省電力で配信が遅れて時間帯の外になっていた場合は鳴らさない。
            if (AlarmTiming.inside(s.fromHour, s.toHour, hour)) Alarm.notify(ctx)
        } finally { Alarm.schedule(ctx, s) }
    }
}

class RingStopReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) { Alarm.stopRinging(ctx) }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        Alarm.schedule(ctx, Store(ctx).loadSettings())
    }
}
