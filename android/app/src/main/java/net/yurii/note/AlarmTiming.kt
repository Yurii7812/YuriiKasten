package net.yurii.note

import java.util.Calendar

/** 時間帯は開始を含み終了を含まない。同時刻と 0〜24 は24時間。夜をまたぐ時間帯にも対応。 */
object AlarmTiming {
    fun inside(from: Int, to: Int, hour: Int): Boolean = when {
        from == to || (from == 0 && to == 24) -> true
        from < to -> hour >= from && hour < to
        else -> hour >= from || hour < to
    }

    fun next(minutes: Int, from: Int, to: Int, now: Long): Long {
        val c = Calendar.getInstance().apply { timeInMillis = now + minutes.coerceAtLeast(1) * 60_000L }
        if (!inside(from, to, c.get(Calendar.HOUR_OF_DAY))) {
            // 候補の当日の開始か、すでに過ぎていれば翌日の開始。
            val candidate = c.timeInMillis
            c.set(Calendar.HOUR_OF_DAY, from)
            c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
            if (c.timeInMillis <= candidate) c.add(Calendar.DAY_OF_YEAR, 1)
        }
        return c.timeInMillis
    }
}
