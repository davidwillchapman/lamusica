import plist from 'plist'
import fs from 'fs'
import type { RawLibrary } from './types'

export function parseLibraryFile(filePath: string): RawLibrary {
  const xml = fs.readFileSync(filePath, 'utf-8')
  return plist.parse(xml) as RawLibrary
}
