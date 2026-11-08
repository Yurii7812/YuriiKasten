package net.yurii.kasten

import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest

/**
 * 同期（PC の sync.js と同じ決まり）。ラズパイの同期サーバーと、vault の平らなフォルダを突き合わせる。
 * 最後に同期したときの hash（base）と、手元・サーバーの今の hash を比べて、取る・置く・消す・競合を決める。
 * 両方が変わった: 新しいほうが本体、古いほうは「競合」の IDなしノートに残す。メインスレッドでは呼ばない。
 */
class VaultSync(private val dir: File, url: String, private val token: String, private val lock: Any = Any()) {
    private val base = url.trim().trimEnd('/')
    data class Result(val pulled: Int, val pushed: Int, val deleted: Int, val conflicts: Int)
    class Remote(val name: String, val hash: String, val mtime: Long)

    companion object {
        const val STATE = ".pkm-sync.json"
        fun hashOf(b: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }.take(20)
        fun okName(n: String) = n.isNotEmpty() && n == File(n).name && !n.startsWith(".") && !n.endsWith(".tmp") && !n.contains('\u0000') && n.length < 200
        private fun enc(n: String) = URLEncoder.encode(n, "UTF-8").replace("+", "%20")
    }
    private fun open(path: String, method: String, baseHash: String? = null): HttpURLConnection {
        val c = URL(base + path).openConnection() as HttpURLConnection
        c.requestMethod = method; c.connectTimeout = 8000; c.readTimeout = 30000
        c.setRequestProperty("Authorization", "Bearer $token")
        if (baseHash != null) c.setRequestProperty("X-Base-Hash", baseHash)
        return c
    }
    fun remoteList(): List<Remote> {
        val c = open("/api/files", "GET")
        if (c.responseCode == 401) throw IllegalStateException("合言葉が違います")
        if (c.responseCode != 200) throw IllegalStateException("サーバーに入れません (${c.responseCode})")
        val a = MiniJson.parse(c.inputStream.bufferedReader().readText()) as? List<*> ?: emptyList<Any?>()
        return a.mapNotNull { (it as? Map<*, *>)?.let { m -> Remote(m["name"] as String, m["hash"] as String, (m["mtime"] as? Number)?.toLong() ?: 0) } }
    }
    private fun loadBase(): MutableMap<String, String> {
        val f = File(dir, STATE); if (!f.exists()) return HashMap()
        return try { ((MiniJson.parse(f.readText()) as Map<*, *>)["base"] as? Map<*, *>)?.entries?.associate { it.key as String to it.value as String }?.toMutableMap() ?: HashMap() } catch (e: Exception) { HashMap() }
    }
    private fun saveBase(b: Map<String, String>) {
        File(dir, STATE).writeText("{\"base\":{" + b.entries.joinToString(",") { MiniJson.quote(it.key) + ":" + MiniJson.quote(it.value) } + "}}")
    }
    private fun local(): Map<String, Pair<String, Long>> =
        synchronized(lock) { (dir.listFiles() ?: emptyArray()).filter { it.isFile && okName(it.name) }.associate { it.name to (hashOf(it.readBytes()) to it.lastModified()) } }
    private fun trash(n: String) { val t = File(dir, ".trash"); t.mkdirs(); File(dir, n).renameTo(File(t, "${System.currentTimeMillis()}-$n")) }

    private fun conflictCopy(name: String, buf: ByteArray, why: String): String {
        var t = System.currentTimeMillis(); var n = Fmt.stemOf(t) + ".md"
        while (File(dir, n).exists()) { t += 1000; n = Fmt.stemOf(t) + ".md" }
        val now = Fmt.now(t)
        File(dir, n).writeText("---\nsource: \"digital\"\ncreated: ${MiniJson.quote(now)}\nupdated: ${MiniJson.quote(now)}\ntitle: ${MiniJson.quote("競合 $name")}\n---\n# 競合 $name\n\n<!-- body -->\n競合: $name（$why）\n\n---\n\n${String(buf, Charsets.UTF_8)}\n<!-- nav -->\n")
        return n
    }

    fun sync(): Result {
        val remote = remoteList().associateBy { it.name }; val local = local(); val base = loadBase()
        var pulled = 0; var pushed = 0; var deleted = 0; var conflicts = 0
        fun pull(n: String) {
            val c = open("/api/file/" + enc(n), "GET"); if (c.responseCode != 200) return
            val buf = c.inputStream.readBytes(); synchronized(lock) { val tmp = File(dir, "$n.tmp"); tmp.writeBytes(buf); tmp.renameTo(File(dir, n)) }; base[n] = hashOf(buf); pulled++
        }
        fun push(n: String, b: String) {
            val buf = synchronized(lock) { File(dir, n).readBytes() }; val c = open("/api/file/" + enc(n), "PUT", b); c.doOutput = true
            c.setFixedLengthStreamingMode(buf.size); c.outputStream.use { it.write(buf) }
            if (c.responseCode != 200) throw IllegalStateException("$n を送れません (${c.responseCode})")
            val j = MiniJson.parse(c.inputStream.bufferedReader().readText()) as Map<*, *>
            base[n] = j["hash"] as String; pushed++; if (j["conflict"] != null) conflicts++
        }
        for (n in (local.keys + remote.keys + base.keys).toSet()) {
            val l = local[n]; val r = remote[n]; val b = base[n]
            if (l != null && r != null) {
                when {
                    l.first == r.hash -> base[n] = l.first
                    l.first == b -> pull(n)
                    r.hash == b -> push(n, r.hash)
                    l.second >= r.mtime -> push(n, b ?: "")
                    else -> { conflictCopy(n, File(dir, n).readBytes(), "手元にあった古い版"); conflicts++; pull(n) }
                }
            } else if (l != null) {
                if (b != null && b == l.first) { trash(n); base.remove(n); deleted++ } else push(n, "")
            } else if (r != null) {
                if (b != null && b == r.hash) {
                    val d = open("/api/file/" + enc(n), "DELETE", b)
                    if (d.responseCode == 200) { base.remove(n); deleted++ } else pull(n)
                } else pull(n)
            } else base.remove(n)
        }
        saveBase(base); return Result(pulled, pushed, deleted, conflicts)
    }
}
