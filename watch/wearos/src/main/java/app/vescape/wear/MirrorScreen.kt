package app.vescape.wear

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

/** One number on the wrist: the latest pushed speed, or a placeholder until the first frame. */
@Composable
fun MirrorScreen() {
    val speed by TelemetryState.speed
    MaterialTheme {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = speed?.let { String.format("%.1f", it) } ?: "--",
                style = MaterialTheme.typography.display1,
            )
        }
    }
}
