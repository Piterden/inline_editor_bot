exports.up = async (knex) => {
  if (!await knex.schema.hasTable('editors')) {
    return knex.schema.createTable('editors', (table) => {
      table.increments()
      table.string('inline_message_id', 32).unique().index()
      table.text('text')
      table.bigInteger('created_by_id')
      table.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }
  return null
}

exports.down = async (knex) => {
  if (await knex.schema.hasTable('editors')) {
    return knex.schema.dropTable('editors')
  }
  return null
}
