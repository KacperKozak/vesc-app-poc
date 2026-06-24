package expo.modules.vescble

import expo.modules.vescble.runtime.TestScheduler
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteTiltControllerTest {
  private val scheduler = TestScheduler()
  private val sent = mutableListOf<ByteArray>()
  private var transport: BoardTransport? = BoardTransport.Direct

  private fun controller() =
    RemoteTiltController(
      scheduler = scheduler,
      transport = { transport },
      send = { sent.add(it); true },
    )

  @Test
  fun firstSetSendsImmediatelyThenRepeatsLatestValue() {
    val controller = controller()

    assertTrue(controller.set(200))
    assertEquals(1, sent.size)
    assertArrayEquals(buildRemoteTiltCommand(BoardTransport.Direct, 200), sent[0])

    scheduler.advance(40)
    assertEquals(2, sent.size)
    assertArrayEquals(buildRemoteTiltCommand(BoardTransport.Direct, 200), sent[1])
  }

  @Test
  fun rapidUpdatesCoalesceToLatestWithoutFloodingWrites() {
    val controller = controller()

    controller.set(140) // first press sends immediately
    controller.set(160) // already streaming: mutate only, no extra write
    controller.set(200) // already streaming: mutate only, no extra write
    assertEquals(1, sent.size)

    scheduler.advance(40) // a single repeat tick emits just the latest value
    assertEquals(2, sent.size)
    assertArrayEquals(buildRemoteTiltCommand(BoardTransport.Direct, 200), sent[1])
  }

  @Test
  fun stopSnapsToNeutralAndCancelsRepeat() {
    val controller = controller()
    controller.set(200)
    sent.clear()

    assertTrue(controller.stop())
    assertEquals(1, sent.size)
    assertArrayEquals(buildRemoteTiltCommand(BoardTransport.Direct, REMOTE_TILT_CENTER), sent[0])

    scheduler.advance(200)
    assertEquals(1, sent.size) // no further repeats after stop
  }

  @Test
  fun setReturnsFalseWhenNotStreamable() {
    transport = null
    val controller = controller()

    assertFalse(controller.set(200))
    assertEquals(0, sent.size)
  }

  @Test
  fun repeatStopsWhenTransportIsLost() {
    val controller = controller()
    controller.set(200)
    sent.clear()

    transport = null
    scheduler.advance(40) // repeat fires, sees no transport, stops the loop
    assertEquals(0, sent.size)

    transport = BoardTransport.Direct
    scheduler.advance(200) // loop stayed stopped; nothing resurrects it
    assertEquals(0, sent.size)
  }
}
