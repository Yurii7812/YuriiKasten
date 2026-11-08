package net.yurii.kasten

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/** トピック選びの 1 つの区切り（見出しと、そこに並べるトピック名）。 */
class TopicSection(val heading: String, val names: List<String>)

/**
 * トピックを選ぶ画面（トピック一覧・移動先の選択で共通）。
 *   上に探す欄、真ん中に一覧（残りの高さいっぱい。スクロールする）、下に「新しいトピック」と「閉じる」を固定して並べる
 *   （一覧の最後の行にボタンが重ならない）。1 行 = 名前・件数・編集の ︙（長押しを知らなくても編集できる）。いま選んでいるものに ✓。
 */
@Composable
fun TopicPicker(title: String, leading: List<String>, sections: List<TopicSection>, current: String?, counts: Map<String, Int>,
                onPick: (String) -> Unit, onEdit: ((String) -> Unit)?, newLabel: String, onNew: () -> Unit, closeLabel: String,
                onDismiss: () -> Unit, query: String, onQuery: (String) -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = RoundedCornerShape(24.dp), tonalElevation = 6.dp, modifier = Modifier.fillMaxWidth(0.94f).fillMaxHeight(0.88f)) {
            Column(Modifier.padding(16.dp)) {
                Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 6.dp))
                // 探す欄の右に小さなボタンを 2 つ: 時系列記録だけを見せる／新しいトピック
                var recordsOnly by remember { mutableStateOf(false) }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(query, onQuery, placeholder = { Text("探す") }, singleLine = true, modifier = Modifier.weight(1f),
                        leadingIcon = { Icon(Icons.Filled.Search, null) })
                    IconToggleButton(checked = recordsOnly, onCheckedChange = { recordsOnly = it }) {
                        Icon(Icons.Filled.History, "時系列記録だけを表示", Modifier.size(26.dp),
                            tint = if (recordsOnly) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline)
                    }
                    IconButton(onClick = onNew) { Icon(Icons.Filled.Add, newLabel, Modifier.size(28.dp), tint = MaterialTheme.colorScheme.primary) }
                }
                val shownSections = if (recordsOnly) sections.filter { it.heading.contains("時系列") } else sections
                val shownLeading = if (recordsOnly) emptyList() else leading
                val empty = shownLeading.isEmpty() && shownSections.all { it.names.isEmpty() }
                LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(top = 6.dp)) {
                    items(shownLeading, key = { "lead-$it" }) { t -> TopicRow(t, current, counts, onPick, null) }
                    shownSections.forEach { sec ->
                        if (sec.names.isNotEmpty()) {
                            item(key = "heading-${sec.heading}") {
                                Text(sec.heading, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
                            }
                            items(sec.names, key = { "${sec.heading}-$it" }) { t -> TopicRow(t, current, counts, onPick, onEdit) }
                        }
                    }
                    if (empty) item { Text(if (query.isBlank()) "まだトピックがありません" else "見つかりません", Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outline) }
                }
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 52.dp)) { Text(closeLabel, fontSize = 16.sp) }
                }
            }
        }
    }
}

@Composable
private fun TopicRow(t: String, current: String?, counts: Map<String, Int>, onPick: (String) -> Unit, onEdit: ((String) -> Unit)?) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable { onPick(t) }, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(28.dp)) { if (t == current) Icon(Icons.Filled.Check, "選択中", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary) }
        Text(topicLabel(t), Modifier.weight(1f), fontSize = 18.sp, fontWeight = if (t == current) FontWeight.Bold else null)
        counts[t]?.let { Text("$it 件", fontSize = 14.sp, color = MaterialTheme.colorScheme.outline) }
        if (onEdit != null) IconButton(onClick = { onEdit(t) }) { Icon(Icons.Filled.MoreVert, "「${topicLabel(t)}」を編集（名前・取り込み方・消す）") }
    }
}

/** 「上」のトピックを、いくつでも選ぶ（探せる。最近使った順。トピックと過去に一緒に使ったものを先に）。 */
@Composable
fun UpsDialog(ordered: List<String>, initial: Set<String>, exclude: String?, onDismiss: () -> Unit, onDone: (List<String>) -> Unit) {
    var query by remember { mutableStateOf("") }
    val chosen = remember { mutableStateListOf<String>().also { it.addAll(initial) } }
    val shown = remember(ordered, query) { ordered.filter { it != exclude && matchesQuery(topicLabel(it), query) } }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("上のトピック（いくつでも）") },
        text = { Column {
            OutlinedTextField(query, { query = it }, placeholder = { Text("探す") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            LazyColumn(Modifier.heightIn(max = 360.dp)) {
                items(shown.size) { i ->
                    val n = shown[i]
                    Row(Modifier.fillMaxWidth().clickable { if (n in chosen) chosen.remove(n) else chosen.add(n) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = n in chosen, onCheckedChange = { if (n in chosen) chosen.remove(n) else chosen.add(n) })
                        Text(topicLabel(n), fontSize = 16.sp)
                    }
                }
            }
        } },
        confirmButton = { TextButton(onClick = { onDone(chosen.toList()) }) { Text("決定") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("やめる") } })
}
