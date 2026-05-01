import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('playlists', (t) => {
    t.increments('id')
    t.text('persistent_id').notNullable().unique()
    t.integer('playlist_id')
    t.text('parent_persistent_id')
    t.text('name')
    t.text('description')
    t.boolean('master')
    t.boolean('all_items')
    t.boolean('visible')
    t.boolean('smart')
    t.boolean('folder')
    t.boolean('music')
    t.boolean('movies')
    t.boolean('tv_shows')
    t.boolean('podcasts')
    t.boolean('audiobooks')
    t.integer('distinguished_kind')
    t.datetime('created_at').notNullable()
    t.datetime('updated_at').notNullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('playlists')
}
