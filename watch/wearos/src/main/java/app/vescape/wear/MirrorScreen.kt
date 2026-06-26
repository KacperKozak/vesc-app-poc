package app.vescape.wear

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

/**
 * Wrist layout for the live Watch Frame. Speed and duty are the two co-headline values, battery sits
 * second, motor/controller temps render small. The whole screen dims while the frame is stale.
 */
@Composable
fun MirrorScreen() {
    val frame by TelemetryState.frame
    MaterialTheme {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (frame == null) {
                Text(text = "--", style = MaterialTheme.typography.display1)
            } else {
                FrameLayout(frame!!)
            }
        }
    }
}

@Composable
private fun FrameLayout(frame: WatchFrame) {
    val tint = if (frame.stale) Color.Gray else Color.Unspecified
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        // Co-headline: speed and duty are the two most prominent values.
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = format(frame.speed, 1),
                style = MaterialTheme.typography.display1,
                color = tint,
            )
            Text(
                text = frame.duty?.let { "${format(it, 0)}%" } ?: "--",
                style = MaterialTheme.typography.display1,
                color = tint,
            )
        }
        Text(
            text = frame.battery?.let { "${format(it, 0)}%" } ?: "--",
            style = MaterialTheme.typography.title2,
            color = tint,
        )
        Text(
            text = "M ${temp(frame.motorTemp)}   C ${temp(frame.ctrlTemp)}",
            style = MaterialTheme.typography.caption2,
            color = tint,
            textAlign = TextAlign.Center,
        )
    }
}

private fun format(value: Double, decimals: Int): String = String.format("%.${decimals}f", value)

private fun temp(value: Double?): String = value?.let { "${format(it, 0)}°" } ?: "--"
