package expo.modules.vescble.runtime

class BoardSession(val id: Long) {
    @Volatile
    var isActive: Boolean = true
        private set

    fun invalidate() {
        isActive = false
    }
}
