import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('sync_runs', (t) => {
    t.increments('id')
    t.text('source_file').notNullable()
    t.datetime('started_at').notNullable()
    t.datetime('completed_at')
    t.text('status').notNullable()
    t.integer('tracks_added')
    t.integer('tracks_updated')
    t.integer('tracks_unchanged')
    t.integer('playlists_added')
    t.integer('playlists_updated')
    t.integer('playlists_unchanged')
    t.text('unknown_track_keys')
    t.text('unknown_playlist_keys')
    t.text('report_path')
    t.text('patch_path')
    t.text('error_message')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('sync_runs')
}
