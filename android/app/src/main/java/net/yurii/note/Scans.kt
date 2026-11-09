package net.yurii.note

import android.app.Activity
import android.content.Context
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 紙のスキャン 1 枚。id が空なら番号なし。imported は PC に取り込み済み（写真は消さずに残し、あとから見られる）。 */
data class Scan(val name: String, val id: String, val imported: Boolean = false)

/**
 * 紙のスキャンの置き場（files/scans/）。写真は paper-scan-日時-連番.jpg、番号は scans.json（名前 → 番号）に持つ。
 * PC の \M が、写真と scans.json を読み、番号のあるものは番号ノートに、無いものは \F の受け皿に入れる。
 * 取り込み済みの名前は PC が scans_done.json で返す → 印を付けるだけで写真は残す（見返せる。消すのは本人）。
 */
class ScanStore(private val ctx: Context) {
    val dir: File by lazy { File(ctx.filesDir, "scans").apply { mkdirs() } }
    private val index get() = File(dir, "scans.json")

    fun load(): List<Scan> {
        dropImported()
        val saved = try { JSONArray(index.readText()) } catch (e: Exception) { JSONArray() }
        val list = (0 until saved.length()).map { saved.getJSONObject(it) }.map { Scan(it.getString("name"), it.optString("id"), it.optBoolean("imported", false)) }
        return list.filter { File(dir, it.name).isFile }
    }

    private fun save(list: List<Scan>) {
        val a = JSONArray()
        list.forEach { a.put(JSONObject().put("name", it.name).put("id", it.id).put("imported", it.imported)) }
        val tmp = File(dir, "scans.json.tmp")
        tmp.writeText(a.toString())
        tmp.renameTo(index)
    }

    /** スキャナーの結果（画像の Uri）を足す。 */
    fun add(uris: List<Uri>): List<Scan> {
        val list = load().toMutableList()
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        var n = 1
        for (u in uris) {
            var name: String
            do { name = "paper-scan-$stamp-${"%02d".format(n++)}.jpg" } while (File(dir, name).exists())
            ctx.contentResolver.openInputStream(u)?.use { input -> File(dir, name).outputStream().use { input.copyTo(it) } } ?: continue
            list.add(Scan(name, ""))
        }
        save(list)
        return list
    }

    /** 番号を付ける。同じ番号がすでにあれば上書き（前のスキャンは消す）。空の番号は「番号なしに戻す」。
     */
    fun assign(name: String, id: String): List<Scan> {
        val list = load().toMutableList()
        val clean = PaperId.normalize(id)
        if (clean.isNotEmpty()) list.filter { it.id == clean && it.name != name && !it.imported }.forEach { File(dir, it.name).delete() }
        val out = list.filter { clean.isEmpty() || it.id != clean || it.name == name || it.imported }.map { if (it.name == name) it.copy(id = clean) else it }
        save(out)
        return out
    }

    fun delete(name: String): List<Scan> {
        File(dir, name).delete()
        val out = load().filter { it.name != name }
        save(out)
        return out
    }

    /** 条件に合うスキャンをぜんぶ消す（写真ごと）。 */
    fun deleteWhere(match: (Scan) -> Boolean): List<Scan> {
        val all = load()
        all.filter(match).forEach { File(dir, it.name).delete() }
        val out = all.filterNot(match)
        save(out)
        return out
    }

    private fun dropImported() {
        val f = File(ctx.filesDir, "scans_done.json")
        if (!f.exists()) return
        try {
            val done = JSONArray(f.readText())
            val names = (0 until done.length()).map { done.getString(it) }.toSet()
            val saved = try { JSONArray(index.readText()) } catch (e: Exception) { JSONArray() }
            val keep = JSONArray()
            for (i in 0 until saved.length()) {
                val o = saved.getJSONObject(i)
                if (o.getString("name") in names) o.put("imported", true)
                keep.put(o)
            }
            index.writeText(keep.toString())
            f.delete()
        } catch (e: Exception) { /* 読めなければそのまま */ }
    }
}

/** 紙のスキャン画面: まとめてスキャン → 番号なしの一覧 → その場で番号を付ける（あとからでもよい）。 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ScanScreen(onClose: () -> Unit) {
    val ctx = LocalContext.current
    val store = remember { ScanStore(ctx) }
    var scans by remember { mutableStateOf(store.load()) }
    var openName by remember { mutableStateOf<String?>(null) }   // 番号を付けている 1 枚
    var last by remember { mutableStateOf("") }                  // 前に付けた番号（これだけを見せる）
    var history by remember { mutableStateOf(listOf<String>()) } // 番号を付けた順の 1 枚ずつの名前（← の取り消し用）
    var error by remember { mutableStateOf<String?>(null) }
    var tab by remember { mutableStateOf(0) }                    // 0 全部 / 1 未取り込み / 2 取り込み済み
    

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { res ->
        if (res.resultCode == Activity.RESULT_OK) {
            val r = GmsDocumentScanningResult.fromActivityResultIntent(res.data)
            val uris = r?.pages?.map { it.imageUri }.orEmpty()
            if (uris.isNotEmpty()) {
                scans = store.add(uris)
                openName = scans.firstOrNull { it.id.isEmpty() && !it.imported }?.name   // スキャンしたらそのまま番号付けへ
            }
        }
    }
    fun startScan() {
        val activity = ctx as? Activity ?: return
        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true).setPageLimit(40)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL).build()
        GmsDocumentScanning.getClient(options).getStartScanIntent(activity)
            .addOnSuccessListener { launcher.launch(IntentSenderRequest.Builder(it).build()) }
            .addOnFailureListener { error = "スキャナーを開けませんでした: ${it.message}" }
    }

    BackHandler { if (openName != null) openName = null else onClose() }

    val sorted = remember(scans, tab) {
        scans.filter { tab == 0 || (tab == 1 && !it.imported) || (tab == 2 && it.imported) }
            .sortedWith(compareBy({ it.imported }, { it.id.isNotEmpty() }, { it.name }))
    }
    val open = openName?.let { n -> scans.firstOrNull { it.name == n } }
    if (open != null) {
        NumberScreen(store, open, sorted, last,
            onAssign = { id ->
                scans = store.assign(open.name, id)
                val got = scans.firstOrNull { it.name == open.name }?.id.orEmpty()
                if (got.isNotBlank()) { last = got; history = history + open.name }
                // 次の番号なしへ（なければ一覧へ戻る）
                openName = scans.firstOrNull { it.id.isEmpty() && !it.imported && it.name != open.name }?.name
            },
            onUndo = {
                // 直前の番号付けを取り消して、その 1 枚へ戻る（番号なしに戻す。写真は消えない）
                val prev = history.lastOrNull()
                if (prev != null) {
                    scans = store.assign(prev, "")
                    history = history.dropLast(1)
                    last = history.lastOrNull()?.let { n -> scans.firstOrNull { it.name == n }?.id }.orEmpty()
                    openName = prev
                }
            },
            canUndo = history.isNotEmpty(),
            onMove = { d ->
                val i = sorted.indexOfFirst { it.name == open.name }
                openName = sorted.getOrNull(i + d)?.name ?: open.name
            },
            onDelete = {
                val i = sorted.indexOfFirst { it.name == open.name }
                val next = sorted.getOrNull(i + 1)?.name ?: sorted.getOrNull(i - 1)?.name
                scans = store.delete(open.name)
                openName = next?.takeIf { n -> scans.any { it.name == n } }
            },
            onBack = { openName = null })
        return
    }

    val blank = scans.count { it.id.isEmpty() && !it.imported }
    val waiting = scans.count { !it.imported }
    val tabNames = listOf("📚 全部 ${scans.size}", "⏳ 未取り込み $waiting", "✓ 済み ${scans.size - waiting}")
    Scaffold(topBar = {
        TopAppBar(title = { Text("紙のスキャン") }, navigationIcon = {
            IconButton(onClick = onClose) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "戻る") }
        })
    }, bottomBar = {
        Button(onClick = { startScan() }, shape = RoundedCornerShape(28.dp),
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 12.dp).heightIn(min = 56.dp)) {
            Icon(Icons.Filled.CameraAlt, null); Spacer(Modifier.width(10.dp)); Text("スキャンする（まとめて）", fontSize = 18.sp)
        }
    }) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            Text(
                if (scans.isEmpty()) "まだスキャンがありません。下のボタンで、紙を続けて撮れます。"
                else "未取り込み $waiting 枚" + (if (blank > 0) "（うち番号なし $blank 枚。番号を付けると PC に取り込めます）" else "") + "・ 済み ${scans.size - waiting} 枚",
                Modifier.padding(horizontal = 16.dp, vertical = 8.dp), fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            error?.let { Text(it, Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.error) }
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                tabNames.forEachIndexed { i, n ->
                    FilterChip(tab == i, { tab = i }, { Text(n, fontSize = 15.sp, maxLines = 1) }, shape = RoundedCornerShape(16.dp), modifier = Modifier.weight(1f).heightIn(min = 44.dp))
                }
            }
            LazyVerticalGrid(GridCells.Adaptive(150.dp), contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(sorted, key = { it.name }) { s ->
                    Box(Modifier.aspectRatio(0.75f).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
                        .alpha(if (s.imported) 0.55f else 1f).clickable { openName = s.name }) {
                        AsyncImage(File(store.dir, s.name), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        // 番号なしは目立つ色（琥珀）、番号つきは青、済みは薄く「✓」
                        Text(if (s.id.isEmpty()) "番号なし" else (if (s.imported) "✓ " else "") + s.id, Modifier.align(Alignment.BottomStart).padding(6.dp)
                            .clip(RoundedCornerShape(10.dp)).background(if (s.id.isEmpty()) MaterialTheme.colorScheme.secondary else if (s.imported) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.primary)
                            .padding(horizontal = 10.dp, vertical = 3.dp),
                            fontSize = 16.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium, color = androidx.compose.ui.graphics.Color.White)
                    }
                }
            }
        }
    }
}

/**
 * 1 枚を大きく見せて、番号を付ける。決めると次の番号なしへ。
 * 矢印（PC の \F の矢印キー・hjkl と同じ）: ↓ 前の番号の子 / → 次の連番 / ← 直前の番号付けを取り消す / ↑ 前の番号を入力欄に出して直す。
 * 番号は `1a2` の形で保存する。
 */
@Composable
private fun NumberScreen(store: ScanStore, scan: Scan, all: List<Scan>, last: String,
                         onAssign: (String) -> Unit, onUndo: () -> Unit, canUndo: Boolean,
                         onMove: (Int) -> Unit, onDelete: () -> Unit, onBack: () -> Unit) {
    var typing by remember(scan.name) { mutableStateOf(false) }
    var text by remember(scan.name) { mutableStateOf(scan.id) }
    var confirmDelete by remember { mutableStateOf(false) }
    val clean = PaperId.normalize(text)
    val ok = clean.isEmpty() || PaperId.isValid(clean)
    val childId = if (last.isNotEmpty()) PaperId.child(last) else ""
    val nextId = if (last.isNotEmpty()) PaperId.nextSibling(last) else ""
    val numbering = !scan.imported
    Column(Modifier.fillMaxSize().systemBarsPadding().imePadding().padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "一覧へ") }
            Text("${all.indexOfFirst { it.name == scan.name } + 1} / ${all.size}", Modifier.weight(1f), textAlign = TextAlign.Center, fontSize = 18.sp)
            IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Filled.Delete, "このスキャンを消す") }
        }
        AsyncImage(File(store.dir, scan.name), null, Modifier.weight(1f).fillMaxWidth(), contentScale = ContentScale.Fit)
        if (last.isNotEmpty()) Text("前: $last", fontSize = 26.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(top = 8.dp))
        if (scan.imported) {
            Text("取り込み済み ・ 番号 ${scan.id.ifEmpty { "なし" }}", fontSize = 28.sp, modifier = Modifier.padding(vertical = 12.dp))
        } else if (typing) {
            OutlinedTextField(text, { text = it }, singleLine = true, isError = !ok,
                textStyle = TextStyle(fontSize = 40.sp, textAlign = TextAlign.Center),
                placeholder = { Text("番号（例: 1a2）", Modifier.fillMaxWidth(), fontSize = 24.sp, textAlign = TextAlign.Center) },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { if (ok && clean.isNotEmpty()) onAssign(clean) }),
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))
            if (!ok) Text("番号は 1 / 1a / 1a2 のように（数字と小文字。例: 1a2）", color = MaterialTheme.colorScheme.error, fontSize = 14.sp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { typing = false }, modifier = Modifier.heightIn(min = 64.dp)) { Text("やめる", fontSize = 18.sp) }
                Button(onClick = { onAssign(clean) }, enabled = ok && clean.isNotEmpty(), shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.weight(1f).heightIn(min = 64.dp)) { Text("決めて次へ", fontSize = 22.sp) }
            }
        } else {
            // 大きな矢印（ボタン）。前の番号が無いうちは、最初の 1 枚を「入力」で決める
            val pad = Modifier.heightIn(min = 72.dp)
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = { onAssign(childId) }, enabled = childId.isNotEmpty(), shape = RoundedCornerShape(16.dp), modifier = pad.weight(1f)) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) { Text("↓", fontSize = 28.sp); Text(if (childId.isEmpty()) "子" else "子 $childId", fontSize = 15.sp, maxLines = 1) }
                }
                Button(onClick = { onAssign(nextId) }, enabled = nextId.isNotEmpty(), shape = RoundedCornerShape(16.dp), modifier = pad.weight(1f)) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) { Text("→", fontSize = 28.sp); Text(if (nextId.isEmpty()) "次の連番" else "次 $nextId", fontSize = 15.sp, maxLines = 1) }
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onUndo, enabled = canUndo, shape = RoundedCornerShape(16.dp), modifier = pad.weight(1f)) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) { Text("←", fontSize = 28.sp); Text("取り消す", fontSize = 15.sp) }
                }
                OutlinedButton(onClick = { text = last; typing = true }, shape = RoundedCornerShape(16.dp), modifier = pad.weight(1f)) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) { Text("↑", fontSize = 28.sp); Text(if (last.isEmpty()) "番号を入力" else "前の番号を直す", fontSize = 15.sp) }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = { onMove(-1) }, modifier = Modifier.heightIn(min = 52.dp)) { Icon(Icons.Filled.ChevronLeft, "前の 1 枚") }
            Spacer(Modifier.weight(1f))
            if (numbering && !typing) TextButton(onClick = { text = ""; typing = true }) { Text("番号を打つ", fontSize = 18.sp) }
            Spacer(Modifier.weight(1f))
            OutlinedButton(onClick = { onMove(1) }, modifier = Modifier.heightIn(min = 52.dp)) { Icon(Icons.Filled.ChevronRight, "次の 1 枚") }
        }
    }
    if (confirmDelete) AlertDialog(onDismissRequest = { confirmDelete = false }, title = { Text("このスキャンを消しますか？") },
        confirmButton = { TextButton(onClick = { confirmDelete = false; onDelete() }) { Text("消す") } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("やめる") } })
}
