import {
  createConfig,
  createId,
  Entry,
  root,
  schema as createSchema,
  type,
  workspace
} from '@alinea/core'
import {generateNKeysBetween} from '@alinea/core/util/FractionalIndexing'
import {text} from '@alinea/input.text'
import sqlite from '@alinea/sqlite-wasm'
import {BetterSqlite3Driver} from '@alinea/store/sqlite/drivers/BetterSqlite3Driver'
import {SqlJsDriver} from '@alinea/store/sqlite/drivers/SqlJsDriver'
import {SqliteStore} from '@alinea/store/sqlite/SqliteStore'
import Database from 'better-sqlite3'
import {Cache} from '../../src/Cache'

const config = createConfig({
  workspaces: {
    main: workspace('Main', {
      source: 'content',
      schema: createSchema({
        Type: type('Type', {title: text('Title')}).configure({
          isContainer: true
        }),
        Sub: type('Sub', {
          title: text('Title')
        })
      }),
      roots: {data: root('Root', {contains: ['Type']})}
    })
  }
})

const entries: Array<Entry> = [
  {
    id: 'root',
    type: 'Type',
    title: 'Test title',
    index: 'a0',
    workspace: 'main',
    root: 'main',
    url: '/',
    path: 'index',
    parent: undefined,
    parents: []
  },
  {
    id: 'sub',
    type: 'Type',
    title: 'Sub title',
    index: 'a0',
    workspace: 'main',
    root: 'main',
    url: '/sub',
    path: 'sub',
    parent: 'root',
    parents: ['root']
  },
  ...subs(20)
]

function subs(amount: number) {
  const orders = generateNKeysBetween(null, null, amount)
  return Array.from({length: amount}, (_, index) =>
    sub(index + 1, orders[index])
  )
}

function sub(index: number, order: string) {
  return {
    id: `sub-entry-${index}`,
    type: 'Sub',
    title: `Sub entry title ${index}`,
    index: order,
    workspace: 'main',
    root: 'main',
    url: `/sub/sub-entry-${index}`,
    path: `sub-entry-${index}`,
    parent: 'sub',
    parents: ['root', 'sub']
  }
}

const source = {
  async *entries(): AsyncGenerator<Entry> {
    for (const entry of entries) yield entry
  }
}

export default async function createExample(wasm = false) {
  const store = new SqliteStore(
    wasm
      ? new SqlJsDriver(new (await sqlite()).Database())
      : new BetterSqlite3Driver(new Database(':memory:')),
    createId
  )
  await Cache.create(store, config, source)
  return {config, store}
}
