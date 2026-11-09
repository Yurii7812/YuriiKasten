package net.yurii.note

import android.content.Context
import java.io.File

/**
 * アプリのデータの置き場。PC が USB（adb）で読み書きできるように、アプリ専用の外部領域
 * （/sdcard/Android/data/<アプリ>/files）に置く。こうすると、アプリを「デバッグ可能」にしなくて済み
 * （昔は PC が run-as で読むため、デバッグ可能にしていた）、端末がアプリを事前に最適化（AOT）できて、動きが軽くなる。
 * 外部領域が使えないときだけ、アプリの内部の領域を使う。
 * 昔の版が内部に置いたデータは、最初に使うときに、外部へ移す（移せたことを確かめてから、内部を消す）。
 */
object Storage {
    @Volatile private var ready = false

    fun dir(ctx: Context): File {
        val app = ctx.applicationContext
        val ext = app.getExternalFilesDir(null)
        if (!ready) synchronized(this) {
            if (!ready) { if (ext != null) migrate(app.filesDir, ext); ready = true }
        }
        return ext ?: app.filesDir
    }

    private fun count(f: File): Int = if (f.isDirectory) (f.listFiles()?.sumOf { count(it) } ?: 0) else 1

    private fun migrate(from: File, to: File) {
        try {
            to.mkdirs()
            val names = from.list()?.filter { it != "profileInstalled" && !it.endsWith(".tmp") } ?: return
            for (n in names) {
                val src = File(from, n); val dst = File(to, n)
                if (!dst.exists()) src.copyRecursively(dst, overwrite = false)
                // 外へ移せたと確かめられたものだけ、内部を消す（途中で止まっても、データは失わない）
                val same = if (src.isDirectory) dst.isDirectory && count(dst) >= count(src) else dst.isFile && dst.length() == src.length()
                if (same) src.deleteRecursively()
            }
        } catch (e: Exception) { }
    }
}
