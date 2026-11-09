package net.yurii.note

import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** 紙のIndex の 1 行: キーワードと、まだデジタルのノートになっていない紙の番号。 */
data class PaperEntry(val kw: String, val ids: List<String>, val reading: String = "")

/** 入口が紙のトピックIndex: 名前・入口の紙の番号・本文（1 行に「キーワード 番号 番号…」）。 */
data class PaperTopic(val name: String, val entryId: String, val text: String)

data class PaperView(val entries: List<PaperEntry>, val topics: List<PaperTopic>, val pending: Int)

/**
 * 紙のIndex・紙のトピックIndex。PC のチャットメモと同じように、PC につなぐと同期する。
 *  - PC → スマホ: paper_index_pc.json（PC が書く。見るためのもの）
 *  - スマホ → PC: paper_index.json（足した・消した・直したものと rev。PC が取り込んで、paper_index_ack.json に rev を返す）
 * 画面に出すのは「PC の分 ＋ スマホで足した分 − スマホで消した分」。PC が取り込んだと分かれば、スマホの分は PC の分に入ったものとして空にする。
 */
class PaperStore(private val ctx: Context) {
    private val localFile get() = File(ctx.filesDir, "paper_index.json")
    private val pcFile get() = File(ctx.filesDir, "paper_index_pc.json")
    private val ackFile get() = File(ctx.filesDir, "paper_index_ack.json")

    private class Local(var rev: Int, val entries: MutableList<PaperEntry>, val removed: MutableList<Pair<String, String>>, val topics: MutableList<PaperTopic>)

    private fun strs(a: JSONArray?) = if (a == null) emptyList() else (0 until a.length()).map { a.getString(it) }

    private fun readLocal(): Local {
        val l = Local(0, mutableListOf(), mutableListOf(), mutableListOf())
        try {
            if (!localFile.exists()) return l
            val o = JSONObject(localFile.readText())
            l.rev = o.optInt("rev", 0)
            o.optJSONArray("entries")?.let { a -> for (i in 0 until a.length()) a.getJSONObject(i).let { l.entries.add(PaperEntry(it.getString("kw"), strs(it.optJSONArray("ids")), it.optString("reading", ""))) } }
            o.optJSONArray("removed")?.let { a -> for (i in 0 until a.length()) a.getJSONObject(i).let { l.removed.add(it.getString("kw") to it.getString("id")) } }
            o.optJSONArray("topics")?.let { a -> for (i in 0 until a.length()) a.getJSONObject(i).let { l.topics.add(PaperTopic(it.getString("name"), it.getString("entryId"), it.optString("text", ""))) } }
        } catch (e: Exception) { }
        // PC が取り込んだ（印の rev が、スマホの rev 以上）: スマホの分は PC の分に入っているので、空にする
        try {
            val ack = if (ackFile.exists()) JSONObject(ackFile.readText()).optInt("rev", 0) else 0
            if (ack >= l.rev && (l.entries.isNotEmpty() || l.removed.isNotEmpty() || l.topics.isNotEmpty())) {
                l.entries.clear(); l.removed.clear(); l.topics.clear(); writeLocal(l)
            }
        } catch (e: Exception) { }
        return l
    }

    private fun writeLocal(l: Local) {
        val o = JSONObject().put("version", 1).put("rev", l.rev)
        o.put("entries", JSONArray().also { a -> l.entries.forEach { a.put(JSONObject().put("kw", it.kw).put("reading", it.reading).put("ids", JSONArray(it.ids))) } })
        o.put("removed", JSONArray().also { a -> l.removed.forEach { a.put(JSONObject().put("kw", it.first).put("id", it.second)) } })
        o.put("topics", JSONArray().also { a -> l.topics.forEach { a.put(JSONObject().put("name", it.name).put("entryId", it.entryId).put("text", it.text)) } })
        val tmp = File(ctx.filesDir, "paper_index.json.tmp"); tmp.writeText(o.toString()); tmp.renameTo(localFile)
    }

    private fun readPc(): Pair<List<PaperEntry>, List<PaperTopic>> {
        try {
            if (!pcFile.exists()) return emptyList<PaperEntry>() to emptyList()
            val o = JSONObject(pcFile.readText())
            val es = o.optJSONArray("entries")?.let { a -> (0 until a.length()).map { a.getJSONObject(it) }.map { PaperEntry(it.getString("kw"), strs(it.optJSONArray("ids")), it.optString("reading", "")) } } ?: emptyList()
            val ts = o.optJSONArray("topics")?.let { a -> (0 until a.length()).map { a.getJSONObject(it) }.map { PaperTopic(it.getString("name"), it.optString("entryId", ""), it.optString("text", "")) } } ?: emptyList()
            return es to ts
        } catch (e: Exception) { return emptyList<PaperEntry>() to emptyList() }
    }

    fun view(): PaperView {
        val l = readLocal(); val (pcEntries, pcTopics) = readPc()
        val order = (pcEntries.map { it.kw } + l.entries.map { it.kw }).distinct()
        val entries = order.mapNotNull { kw ->
            val ids = ((pcEntries.firstOrNull { it.kw == kw }?.ids ?: emptyList()) + (l.entries.firstOrNull { it.kw == kw }?.ids ?: emptyList()))
                .distinct().filter { (kw to it) !in l.removed }
            if (ids.isEmpty()) null else PaperEntry(kw, ids, pcEntries.firstOrNull { it.kw == kw }?.reading ?: "")
        }
        val topics = (pcTopics.filter { p -> l.topics.none { it.name == p.name } } + l.topics)
        return PaperView(entries, topics, l.entries.size + l.removed.size + l.topics.size)
    }

    /** キーワードに、紙の番号を足す（同じものは増えない）。 */
    fun addEntry(kw: String, ids: List<String>) {
        val l = readLocal(); val key = kw.trim(); if (key.isEmpty() || ids.isEmpty()) return
        val i = l.entries.indexOfFirst { it.kw == key }
        if (i >= 0) l.entries[i] = l.entries[i].copy(ids = (l.entries[i].ids + ids).distinct()) else l.entries.add(PaperEntry(key, ids.distinct()))
        ids.forEach { id -> l.removed.remove(key to id) }   // 消してあったものを、もう一度足した
        l.rev += 1; writeLocal(l)
    }

    /** キーワードから、紙の番号を外す。 */
    fun removeId(kw: String, id: String) {
        val l = readLocal()
        val i = l.entries.indexOfFirst { it.kw == kw }
        if (i >= 0) { val left = l.entries[i].ids - id; if (left.isEmpty()) l.entries.removeAt(i) else l.entries[i] = l.entries[i].copy(ids = left) }
        if (readPc().first.any { it.kw == kw && id in it.ids } && (kw to id) !in l.removed) l.removed.add(kw to id)   // PC にあるものは、PC でも外す
        l.rev += 1; writeLocal(l)
    }

    /** 紙のトピックIndex を、作る・直す。 */
    fun saveTopic(name: String, entryId: String, text: String) {
        val l = readLocal(); val n = name.trim(); if (n.isEmpty() || entryId.isEmpty()) return
        val i = l.topics.indexOfFirst { it.name == n }
        val t = PaperTopic(n, entryId, text)
        if (i >= 0) l.topics[i] = t else l.topics.add(t)
        l.rev += 1; writeLocal(l)
    }
}

/** 番号の入力（空白・カンマ・読点で区切る）を、正しい番号の一覧にする。正しくないものは bad に。 */
fun parsePaperIds(raw: String): Pair<List<String>, List<String>> {
    val toks = raw.split(Regex("[\\s,、，]+")).map { PaperId.normalize(it) }.filter { it.isNotEmpty() }
    return toks.filter { PaperId.isValid(it) }.distinct() to toks.filter { !PaperId.isValid(it) }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PaperIndexScreen(onClose: () -> Unit) {
    val ctx = LocalContext.current
    val store = remember { PaperStore(ctx) }
    var view by remember { mutableStateOf(store.view()) }
    var tab by remember { mutableStateOf(0) }                          // 0 キーワード / 1 トピックIndex
    var addEntry by remember { mutableStateOf(false) }
    var editTopic by remember { mutableStateOf<PaperTopic?>(null) }    // 直す・作るトピックIndex（name が空なら新しく）
    var removeAsk by remember { mutableStateOf<Pair<String, String>?>(null) }
    fun reload() { view = store.view() }
    BackHandler(onBack = onClose)
    Scaffold(topBar = {
        TopAppBar(title = { Text("紙のIndex") }, navigationIcon = { IconButton(onClick = onClose) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "戻る") } })
    }, floatingActionButton = {
        ExtendedFloatingActionButton(onClick = { if (tab == 0) addEntry = true else editTopic = PaperTopic("", "", "") },
            icon = { Icon(Icons.Filled.Add, null) }, text = { Text(if (tab == 0) "キーワードを足す" else "トピックIndex を作る") })
    }) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            if (view.pending > 0) Text("スマホで書いた ${view.pending} 件は、PC につなぐと取り込まれます。", Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                fontSize = 13.sp, color = MaterialTheme.colorScheme.tertiary)
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(tab == 0, { tab = 0 }, { Text("キーワード ${view.entries.size}") }, shape = RoundedCornerShape(16.dp))
                FilterChip(tab == 1, { tab = 1 }, { Text("トピックIndex ${view.topics.size}") }, shape = RoundedCornerShape(16.dp))
            }
            if (tab == 0) {
                if (view.entries.isEmpty()) Text("紙のIndex はまだありません。下のボタンで、キーワードと紙の番号（例: 1a 2b）を足せます。", Modifier.padding(16.dp), fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LazyColumn(contentPadding = PaddingValues(12.dp, 8.dp, 12.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(view.entries, key = { it.kw }) { e ->
                        Surface(shape = RoundedCornerShape(14.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp)) {
                                Text(e.kw, fontSize = 17.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium)
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
                                    e.ids.forEach { id ->
                                        AssistChip(onClick = { removeAsk = e.kw to id }, label = { Text(id) },
                                            trailingIcon = { Icon(Icons.Filled.Close, "外す", Modifier.size(16.dp)) })
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                if (view.topics.isEmpty()) Text("紙のトピックIndex はまだありません。下のボタンで、名前と入口の紙の番号、中身（1 行に「キーワード 番号」）を書けます。", Modifier.padding(16.dp), fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LazyColumn(contentPadding = PaddingValues(12.dp, 8.dp, 12.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(view.topics, key = { it.name }) { t ->
                        Surface(shape = RoundedCornerShape(14.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth().clickable { editTopic = t }) {
                            Column(Modifier.padding(12.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(t.name, Modifier.weight(1f), fontSize = 17.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium)
                                    Text("入口 ${t.entryId}", fontSize = 13.sp, color = MaterialTheme.colorScheme.primary)
                                }
                                Text(t.text.lines().filter { it.isNotBlank() }.take(3).joinToString("\n").ifEmpty { "（中身はまだありません）" }, Modifier.padding(top = 4.dp),
                                    fontSize = 13.sp, maxLines = 3, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }

    if (addEntry) {
        var kw by remember { mutableStateOf("") }
        var raw by remember { mutableStateOf("") }
        val (ok, bad) = parsePaperIds(raw)
        AlertDialog(onDismissRequest = { addEntry = false }, title = { Text("紙のIndex に足す") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(kw, { kw = it }, label = { Text("キーワード") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(raw, { raw = it }, label = { Text("紙の番号（空白で区切る）") }, placeholder = { Text("例: 1a 2b 3") }, modifier = Modifier.fillMaxWidth())
                    if (bad.isNotEmpty()) Text("番号にできません: " + bad.joinToString("、") + "（例: 1a2）", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                }
            },
            confirmButton = { TextButton(enabled = kw.isNotBlank() && ok.isNotEmpty() && bad.isEmpty(), onClick = { store.addEntry(kw, ok); addEntry = false; reload() }) { Text("足す") } },
            dismissButton = { TextButton(onClick = { addEntry = false }) { Text("やめる") } })
    }

    removeAsk?.let { (kw, id) ->
        AlertDialog(onDismissRequest = { removeAsk = null }, title = { Text("外しますか？") }, text = { Text("「$kw」から、紙の番号 $id を外します。") },
            confirmButton = { TextButton(onClick = { store.removeId(kw, id); removeAsk = null; reload() }) { Text("外す") } },
            dismissButton = { TextButton(onClick = { removeAsk = null }) { Text("やめる") } })
    }

    editTopic?.let { t ->
        val isNew = t.name.isEmpty()
        var name by remember(t) { mutableStateOf(t.name) }
        var entry by remember(t) { mutableStateOf(t.entryId) }
        var text by remember(t) { mutableStateOf(t.text) }
        val entryId = PaperId.normalize(entry)
        val entryOk = entryId.isNotEmpty() && PaperId.isValid(entryId)
        AlertDialog(onDismissRequest = { editTopic = null }, title = { Text(if (isNew) "紙のトピックIndex を作る" else "紙のトピックIndex を直す") },
            text = {
                Column(Modifier.heightIn(max = 460.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(name, { name = it }, label = { Text("名前") }, singleLine = true, enabled = isNew, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(entry, { entry = it }, label = { Text("入口の紙の番号") }, placeholder = { Text("例: 1") }, singleLine = true, isError = entry.isNotEmpty() && !entryOk, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(text, { text = it }, label = { Text("中身（1 行に「キーワード 番号 番号…」）") }, placeholder = { Text("GUIとCUI 1f\nまとめ 1b") }, minLines = 5, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = { TextButton(enabled = name.isNotBlank() && entryOk, onClick = { store.saveTopic(name, entryId, text); editTopic = null; reload() }) { Text("保存") } },
            dismissButton = { TextButton(onClick = { editTopic = null }) { Text("やめる") } })
    }
}
