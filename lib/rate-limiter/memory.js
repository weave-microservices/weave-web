module.exports = class MemoryStore {
  constructor (windowSizeTime) {
    this.counters = new Map()
    this.resetTime = Date.now() + windowSizeTime

    const timer = setInterval(() => {
      this.resetTime = Date.now() + windowSizeTime
      this.reset()
    }, windowSizeTime)

    timer.unref()
  }

  increment (key) {
    let counter = this.counters.get(key) || 0
    counter++
    this.counters.set(key, counter)
    return counter
  }

  reset () {
    this.counters.clear()
  }
}
