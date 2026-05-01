import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('playlist_tracks', (t) => {
    t.increments('id')
    t.integer('playlist_id').notNullable().references('id').inTable('playlists').onDelete('CASCADE')
    t.integer('track_id').notNullable().references('id').inTable('tracks').onDelete('CASCADE')
    t.integer('position').notNullable()
    t.datetime('created_at').notNullable()
    t.unique(['playlist_id', 'position'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('playlist_tracks')
}
