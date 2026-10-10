import { Directory, File, Paths } from 'expo-file-system'

/** A file the user picked (document or image picker). */
export interface PickedFile {
  uri: string
  name: string
  mimeType?: string | null
}

/**
 * A file `fetch` can upload. Expo's fetch accepts an expo-file-system `File`
 * (it reads its bytes) but not React Native's `{ uri, name, type }` parts.
 * The upload carries the file's own name, and servers read the extension
 * from it, so a picked file is copied to its original name when needed.
 */
export async function uploadableFile(picked: PickedFile): Promise<File> {
  const source = new File(picked.uri)
  if (source.name === picked.name) return source
  const directory = new Directory(Paths.cache, 'uploads')
  if (!directory.exists) directory.create({ intermediates: true })
  const target = new File(directory, picked.name)
  if (target.exists) target.delete()
  await source.copy(target)
  return target
}
