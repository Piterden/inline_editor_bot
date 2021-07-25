require('dotenv').config()

const knex = require('knex')
const { inspect } = require('util')
const { Telegraf, session } = require('telegraf')

const { Editor } = require('./editor')
const knexConfig = require('../knexfile')
const layouts = require('./layouts/en.json')

const { BOT_USER, BOT_TOKEN } = process.env

const debug = (data) => console.log(inspect(data, {
  showHidden: true,
  colors: true,
  depth: Infinity,
}))

const saveUserToDb = async (db, ctxUser) => {
  let dbUser = await db('users')
    .where('id', Number(ctxUser.id))
    .first()
    .catch(debug)

  if (dbUser) {
    const diff = Object.keys(ctxUser).reduce((acc, key) => {
      if (key === 'id') {
        return acc
      }
      if (typeof ctxUser[key] === 'boolean') {
        dbUser[key] = Boolean(dbUser[key])
      }
      if (ctxUser[key] !== dbUser[key]) {
        acc[key] = ctxUser[key]
      }
      return acc
    }, {})

    if (Object.keys(diff).length > 0) {
      await db('users')
        .where('id', Number(ctxUser.id))
        .update({ ...diff, updated_at: new Date() })
        .catch(debug)
    }
    return
  }

  await db('users').insert(ctxUser).catch(debug)
}

const userLink = ({
  id,
  username,
  first_name: firstName,
  last_name: lastName,
}) => username
  ? `@${username.replace(/([_*~])/g, '\\$1')}`
  : `[${firstName || lastName}](tg://user?id=${id})`

const cleanTimeout = (ctx) => {
  if (ctx.editor.idleTimeoutId) {
    clearTimeout(ctx.editor.idleTimeoutId)
    ctx.editor.idleTimeoutId = null
  }
}

const editMessageWithLockTimeout = async (ctx) => {
  await ctx.editMessageText(`${ctx.editor.instance}
Editing by ${userLink(ctx.from)}`, {
    reply_markup: {
      inline_keyboard: [
        ...layouts[ctx.editor.instance.mode].keys.map(
          (line, row) => line.map(
            (key, col) => ({
              text: key || unescape('%u0020'),
              callback_data: `${ctx.editor.instance.mode.toString(16)}${row}${col}${ctx.editor.instance.caretPosition}:${ctx.from.id}`,
            })
          )
        ),
      ],
    },
  }).catch(debug)

  ctx.editor.idleTimeoutId = setTimeout(async () => {
    await ctx.editMessageText(`${ctx.editor.instance}`, {
      reply_markup: {
        inline_keyboard: [
          ...layouts[ctx.editor.instance.mode].keys.map(
            (line, row) => line.map(
              (key, col) => ({
                text: key || unescape('%u0020'),
                callback_data: `${ctx.editor.instance.mode.toString(16)}${row}${col}${ctx.editor.instance.caretPosition}`,
              })
            )
          ),
        ],
      },
    }).catch(debug)
    ctx.editor.busy = false
  }, 5000)
}

const bot = new Telegraf(BOT_TOKEN, { username: BOT_USER })

bot.context.db = knex(knexConfig)

bot.use(session({
  property: 'editor',
  getSessionKey: (ctx) => (ctx.inlineMessageId) ||
    (ctx.from && ctx.chat && `${ctx.from.id}:${ctx.chat.id}`),
  ttl: null,
}))

bot.use(async (ctx, next) => {
  ctx.editor = ctx.editor || {}
  return next(ctx)
})

bot.use(async (ctx, next) => {
  await saveUserToDb(ctx.db, ctx.from).catch(debug)
  return next(ctx)
})

bot.on('inline_query', async (ctx) => {
  await ctx.answerInlineQuery([
    {
      id: 1,
      type: 'article',
      title: 'Create editor:',
      description: ctx.inlineQuery.query,
      input_message_content: {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        message_text: `Wait...`,
      },
      reply_markup: {
        inline_keyboard: [
          [{ text: unescape('%u0020'), callback_data: unescape('%u0020') }],
        ],
      },
    },
  ], {
    is_personal: true,
    cache_time: 0,
  }).catch(debug)
})

bot.on('chosen_inline_result', async (ctx) => {
  debug(ctx.update)
  const mode = 0
  const caretPosition = ctx.chosenInlineResult.query.length

  ctx.editor.text = ctx.chosenInlineResult.query
  ctx.editor.instance = await Editor(ctx, { caretPosition, mode })

  await ctx.db('editors').insert({
    inline_message_id: ctx.inlineMessageId,
    text: ctx.editor.text,
    created_by_id: ctx.from.id,
  }).catch(debug)

  ctx.editor.busy = false
  await editMessageWithLockTimeout(ctx)
})

bot.action(/([0-9a-f])([0-7]{2})(\d+):?(\d+)?/, async (ctx) => {
  if (ctx.editor.busy) {
    return ctx.answerCbQuery('A bit slowly please!').catch(debug)
  }
  ctx.editor.busy = true

  const [, modeHex, [row, col], caretPosition, userId] = ctx.match

  if (userId && ctx.from.id !== Number(userId)) {
    ctx.editor.busy = false
    return ctx.answerCbQuery('The editor is busy!').catch(debug)
  }

  cleanTimeout(ctx)

  let mode = parseInt(modeHex, 16)
  const key = layouts[mode].keys[row][col]

  ctx.editor.instance = ctx.editor.instance || await Editor(ctx, { caretPosition, mode })
  ctx.editor.instance.edit(`${row}${col}`)

  await editMessageWithLockTimeout(ctx)

  ctx.editor.busy = false
  return ctx.answerCbQuery()
})

bot.catch((err) => debug(err))

bot.telegram.getUpdates(1, -1).then(() => bot.launch())
