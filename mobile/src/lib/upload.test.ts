import { uploadableFile } from './upload'

const copies: [string, string][] = []

jest.mock('expo-file-system', () => {
  class File {
    uri: string
    name: string
    exists = false
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/')
      this.name = this.uri.split('/').pop() ?? ''
    }
    delete() {}
    async copy(target: File) {
      copies.push([this.uri, target.uri])
    }
  }
  class Directory {
    uri: string
    exists = true
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/')
    }
    create() {}
  }
  return { File, Directory, Paths: { cache: { uri: 'file:///cache' } } }
})

beforeEach(() => {
  copies.length = 0
})

it('uploads a file in place when it already has its name', async () => {
  const file = await uploadableFile({ uri: 'file:///cache/DocumentPicker/statement.ofx', name: 'statement.ofx' })
  expect(file.name).toBe('statement.ofx')
  expect(copies).toEqual([])
})

it('copies a file to its original name so the server sees the extension', async () => {
  const file = await uploadableFile({ uri: 'file:///cache/DocumentPicker/8f2c-41aa', name: 'statement.csv' })
  expect(file.name).toBe('statement.csv')
  expect(copies).toEqual([['file:///cache/DocumentPicker/8f2c-41aa', 'file:///cache/uploads/statement.csv']])
})
