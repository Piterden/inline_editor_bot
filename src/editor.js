const layouts = require('./layouts/en.json')

const debug = (data) => console.log(inspect(data, {
  showHidden: true,
  colors: true,
  depth: Infinity,
}))

const getTextFromDb = async (ctx) => {
  const editor = await ctx.db('editors')
    .select(['id', 'text'])
    .where('inline_message_id', ctx.inlineMessageId)
    .first()
    .catch(debug)
  if (editor) {
    ctx.editor.text = editor.text || ''
  }
  return ctx.editor.text
}

const MODE_MASK = {
  '60': 0b0010,
  '70': 0b0100,
  '71': 0b0001,
  '72': 0b1000,
}
const KEYS_MAP = {
  '00': 'escape',
  '06': 'fn',
  '07': 'delete',
  '10': 'tab',
  '17': 'backspace',
  '37': 'enter',
  '66': 'arrowUp',
  '75': 'arrowLeft',
  '76': 'arrowDown',
  '77': 'arrowRight',
}

async function Editor (ctx, options = {}) {
  const text = ctx.editor.text || await getTextFromDb(ctx)

  const instance = {
    inlineMessageId: ctx.inlineMessageId,
    text,
    mode: options.mode || 0,
    caret: options.caret || unescape('%u007C') + unescape('%u200C'),
    entities: options.entities || [],
    caretPosition: options.caretPosition || text.length,

    get textWithCaret () {
      if (this.caretPosition > this.text.length) {
        this.caretPosition = this.text.length
      }
      const arr = [...this.text]
      arr.splice(this.caretPosition, 0, this.caret)
      return arr.join('')
    },

    get lines () {
      return this.text.split('\n')
    },

    get caretCoords () {
      const result = []
      let sum = 0
      for (let i = 0; i < this.lines.length; i += 1) {
        sum += (this.lines[i].length + 1)
        if (sum >= this.caretPosition) {
          result[0] = i
          result[1] = (this.lines[i].length + 1) - (sum - this.caretPosition)
          break
        }
      }
      return result
    },

    edit: function (pressed) {
      if (typeof MODE_MASK[pressed] !== 'undefined') {
        this.mode = this.mode ^ MODE_MASK[pressed]
        return this
      }
      if (typeof KEYS_MAP[pressed] !== 'undefined') {
        this[KEYS_MAP[pressed]]()
        return this
      }
      const [row, col] = pressed
      this.addSymbol(layouts[this.mode].keys[row][col])
      return this
    },

    getPositionFromCoords: function (coords) {
      let sum = 0
      for (let i = 0; i < coords[0]; i += 1) {
        sum += (this.lines[i].length + 1)
      }
      sum += coords[1]
      return sum
    },

    addSymbol: function (symbol) {
      if (this.caretPosition > this.text.length) {
        this.caretPosition = this.text.length
      }
      const arr = [...this.text]
      arr.splice(this.caretPosition, 0, symbol)
      this.caretPosition += symbol.length
      this.text = arr.join('')
      return this
    },

    backspace: function () {
      if (this.caretPosition > this.text.length) {
        this.caretPosition = this.text.length
      }
      this.caretPosition -= 1
      const arr = [...this.text]
      arr.splice(this.caretPosition, 1)
      this.text = arr.join('')
      return this
    },

    delete: function () {
      if (this.caretPosition > this.text.length) {
        this.caretPosition = this.text.length
      }
      const arr = [...this.text]
      arr.splice(this.caretPosition, 1)
      this.text = arr.join('')
      return this
    },

    enter: function () {
      this.addSymbol('\n')
      return this
    },

    tab: function () {
      this.addSymbol('\t')
      return this
    },

    arrowLeft: function () {
      this.caretPosition = this.caretPosition <= 0
        ? 0
        : this.caretPosition - 1
      return this
    },

    arrowRight: function () {
      this.caretPosition = this.caretPosition >= this.text.length
        ? this.text.length
        : this.caretPosition + 1
      return this
    },

    arrowUp: function () {
      const coords = [...this.coords]
      if (coords[0] > 0) {
        coords[0] -= 1
        coords[1] = this.lines[coords[0]].length < coords[1]
          ? this.lines[coords[0]].length
          : coords[1]
      } else {
        coords[0] = 0
        coords[1] = 0
      }
      this.caretPosition = this.getPositionFromCoords(coords)
      return this
    },

    arrowDown: function () {
      const coords = [...this.coords]
      if (coords[0] < (this.lines.length - 1)) {
        coords[0] += 1
        coords[1] = this.lines[coords[0]].length < coords[1]
          ? this.lines[coords[0]].length
          : coords[1]
      } else {
        coords[0] = this.lines.length - 1
        coords[1] = this.lines[coords[0]].length
      }
      this.caretPosition = this.getPositionFromCoords(coords)
      return this
    },

    toString: function () {
      return this.textWithCaret
    },

    valueOf: function () {
      return this.caretPosition
    },
  }

  return instance
}

module.exports = { Editor }
