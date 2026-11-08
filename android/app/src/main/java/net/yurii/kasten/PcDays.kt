package net.yurii.kasten

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Event
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.Locale

/** 日のノートの本文のうち、書いた文章の所（PC が自動で入れる「今日のノート」のリンクの並びは除く）。 */
fun dayBodyText(body: String): String {
    val i = body.lines().indexOfFirst { it.trim() == "## 今日のノート" }
    val lines = body.lines()
    return (if (i < 0) lines else lines.subList(0, i)).joinToString("\n").trim()
}

/** PC の日のノート（日記・時系列記録）を、ふつうのノートのように読む画面。種類で絞り込み・前後の日・日付を指定。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PcDaysScreen(days: List<PcDay>, onClose: () -> Unit) {
    val kinds = remember(days) { days.map { it.kind }.distinct().sortedWith(compareBy({ it != DIARY }, { it })) }
    var kind by remember { mutableStateOf<String?>(null) }
    var open by remember { mutableStateOf<PcDay?>(null) }
    var pickDate by remember { mutableStateOf(false) }
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val shown = remember(days, kind) { days.filter { kind == null || it.kind == kind }.sortedWith(compareByDescending<PcDay> { it.date }.thenBy { it.kind }) }
    BackHandler { if (open != null) open = null else onClose() }
    val fmt = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US) }
    val dow = remember { SimpleDateFormat("E", Locale.getDefault()) }
    fun dateLabel(d: String) = runCatching { d + "（" + dow.format(fmt.parse(d)!!) + "）" }.getOrDefault(d)
    Scaffold(topBar = {
        TopAppBar(
            title = { Text(open?.let { dateLabel(it.date) + (if (it.kind != DIARY) "  " + it.kind else "") } ?: "PC の日のノート", fontWeight = FontWeight.Bold) },
            navigationIcon = { IconButton(onClick = { if (open != null) open = null else onClose() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "戻る") } },
            actions = {
                val cur = open
                if (cur != null) {
                    val at = shown.indexOfFirst { it.date == cur.date && it.kind == cur.kind }
                    IconButton(onClick = { shown.getOrNull(at + 1)?.let { open = it } }, enabled = at >= 0 && at + 1 < shown.size) { Icon(Icons.Filled.ChevronLeft, "前の日") }
                    IconButton(onClick = { shown.getOrNull(at - 1)?.let { open = it } }, enabled = at > 0) { Icon(Icons.Filled.ChevronRight, "次の日") }
                }
                IconButton(onClick = { pickDate = true }) { Icon(Icons.Filled.Event, "日付を指定") }
            })
    }) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            if (kinds.size > 1) Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(kind == null, { kind = null }, { Text("すべて") })
                kinds.forEach { k -> FilterChip(kind == k, { kind = k }, { Text(if (k == DIARY) "日記" else k) }) }
            }
            val cur = open
            if (cur == null) {
                if (shown.isEmpty()) Text("日のノートはまだありません。", Modifier.padding(24.dp))
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(shown, key = { it.kind + "|" + it.date }) { d ->
                        val snippet = dayBodyText(d.body).lines().firstOrNull { it.isNotBlank() }?.replace(Regex("^\\d{2}:\\d{2}\\s*"), "")?.take(60) ?: ""
                        Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth().clickable { open = d }) {
                            Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(dateLabel(d.date), fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                                    if (d.kind != DIARY) Text(d.kind, fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                                }
                                if (snippet.isNotEmpty()) Text(snippet, fontSize = 13.sp, maxLines = 2, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            } else {
                val text = remember(cur) { dayBodyText(cur.body) }
                val timeColor = MaterialTheme.colorScheme.primary
                val annotated = remember(text, timeColor) {
                    buildAnnotatedString {
                        val tm = Regex("^(\\d{2}:\\d{2})(\\s+)(.*)$")
                        text.lines().forEachIndexed { i, line ->
                            if (i > 0) append("\n")
                            val m = tm.find(line)
                            when {
                                m != null -> { withStyle(SpanStyle(color = timeColor, fontWeight = FontWeight.Medium)) { append(m.groupValues[1]) }; append("  " + m.groupValues[3]) }
                                line.startsWith("#") -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(line.trimStart('#', ' ')) }
                                else -> append(line)
                            }
                        }
                    }
                }
                SelectionContainer {
                    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 12.dp)) {
                        androidx.compose.material3.Text(annotated, fontSize = 16.sp, lineHeight = 26.sp)
                        if (text.isEmpty()) Text("（本文なし）", color = MaterialTheme.colorScheme.outline)
                    }
                }
            }
        }
    }
    if (pickDate) {
        val st = rememberDatePickerState()
        DatePickerDialog(onDismissRequest = { pickDate = false },
            confirmButton = { TextButton(onClick = {
                pickDate = false
                st.selectedDateMillis?.let { ms ->
                    val d = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.format(java.util.Date(ms))
                    val hit = shown.firstOrNull { it.date == d } ?: days.firstOrNull { it.date == d }
                    if (hit != null) open = hit
                    else android.widget.Toast.makeText(ctx, "その日のノートはありません", android.widget.Toast.LENGTH_SHORT).show()
                }
            }) { Text("見る") } },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("やめる") } }) { DatePicker(st) }
    }
}
