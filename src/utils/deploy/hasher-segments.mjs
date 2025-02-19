import flushWriteStream from 'flush-write-stream'
import hasha from 'hasha'
import transform from 'parallel-transform'
import { objCtor as objFilterCtor } from 'through2-filter'
import { obj as map } from 'through2-map'

import { normalizePath } from './util.mjs'

// a parallel transform stream segment ctor that hashes fileObj's created by folder-walker
// TODO: use promises instead of callbacks
/* eslint-disable promise/prefer-await-to-callbacks */
export const hasherCtor = ({ concurrentHash, hashAlgorithm }) => {
  const hashaOpts = { algorithm: hashAlgorithm }
  if (!concurrentHash) throw new Error('Missing required opts')
  return transform(concurrentHash, { objectMode: true }, async (fileObj, cb) => {
    try {
      const hash = await hasha.fromFile(fileObj.filepath, hashaOpts)
      // insert hash and asset type to file obj
      return cb(null, { ...fileObj, hash })
    } catch (error) {
      return cb(error)
    }
  })
}

// Inject normalized file names into normalizedPath and assetType
export const fileNormalizerCtor = ({ assetType, normalizer: normalizeFunction }) =>
  map((fileObj) => {
    const normalizedFile = { ...fileObj, assetType, normalizedPath: normalizePath(fileObj.relname) }

    if (normalizeFunction !== undefined) {
      return normalizeFunction(normalizedFile)
    }

    return normalizedFile
  })

// A writable stream segment ctor that normalizes file paths, and writes shaMap's
export const manifestCollectorCtor = (filesObj, shaMap, { assetType, statusCb }) => {
  if (!statusCb || !assetType) throw new Error('Missing required options')
  return flushWriteStream.obj((fileObj, _, cb) => {
    filesObj[fileObj.normalizedPath] = fileObj.hash

    // We map a hash to multiple fileObj's because the same file
    // might live in two different locations

    if (Array.isArray(shaMap[fileObj.hash])) {
      shaMap[fileObj.hash].push(fileObj)
    } else {
      shaMap[fileObj.hash] = [fileObj]
    }
    statusCb({
      type: 'hashing',
      msg: `Hashing ${fileObj.relname}`,
      phase: 'progress',
    })
    cb(null)
  })
}
/* eslint-enable promise/prefer-await-to-callbacks */

// transform stream ctor that filters folder-walker results for only files
export const fileFilterCtor = objFilterCtor((fileObj) => fileObj.type === 'file')
